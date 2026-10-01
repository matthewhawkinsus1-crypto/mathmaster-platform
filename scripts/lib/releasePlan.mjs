/*
 * WHAT A RELEASE MUST DEPLOY, IN WHAT ORDER, AND HOW TO RETRY IT.
 *
 * Pure: no git, no network, no Firebase. scripts/release-firebase.mjs feeds it
 * the changed files and the function inventory and executes what it returns,
 * so every decision here is unit-tested (tests/platform/releasePlan.test.mjs)
 * without touching production.
 *
 * THE ORDER, AND WHY.
 *   1. Firestore indexes    additive and slow to build; a query that needs one
 *                           fails until it is READY, so they go first.
 *   2. Cloud Functions      in small groups with pauses: one codebase holds
 *                           ~150 functions, and Google rate-limits function
 *                           mutations per project per minute ("HTTP 429 Per
 *                           project mutation requests per minute per region").
 *                           Before rules and Hosting, so the new client never
 *                           calls a callable that is not there yet.
 *   3. Firestore rules      just before Hosting, so the window in which the old
 *                           client runs against new rules is as short as it can
 *                           be. The Admin SDK functions are not subject to them.
 *   4. Hosting              ALWAYS on its own, ALWAYS through the resilient
 *                           wrapper (npm run deploy:hosting): low upload fan-out,
 *                           transport retries, live-manifest verification
 *                           (AGENTS.md "Deploy").
 * The Path admin codebase deploys with its own predeploy (release build +
 * vendoring) as `functions:path-admin`, after the default codebase.
 */

export const RELEASE_TARGETS = Object.freeze({
  INDEXES: 'firestore:indexes',
  FUNCTIONS: 'functions',
  PATH_ADMIN: 'functions:path-admin',
  RULES: 'firestore:rules',
  DATABASE_RULES: 'database',
  HOSTING: 'hosting',
});

const ORDER = [
  RELEASE_TARGETS.INDEXES,
  RELEASE_TARGETS.FUNCTIONS,
  RELEASE_TARGETS.PATH_ADMIN,
  RELEASE_TARGETS.RULES,
  RELEASE_TARGETS.DATABASE_RULES,
  RELEASE_TARGETS.HOSTING,
];

// Paths that change nothing a user is served.
const NO_DEPLOY = [
  /^docs\//, /^tests\//, /^functions\/test\//, /^\.github\//, /^drafts\//, /^seed\//,
  /\.md$/i, /\.txt$/i, /\.png$/i, /^[._]oxlintrc\.json$/, /^\.gitignore$/,
  /^scripts\/(?!build-ccmr|build-course-path|sync-path-admin|build-firebase-hosting)/,
];

const RULES = [
  [RELEASE_TARGETS.INDEXES, (file) => file === 'firestore.indexes.json'],
  [RELEASE_TARGETS.RULES, (file) => file === 'firestore.rules'],
  [RELEASE_TARGETS.DATABASE_RULES, (file) => file === 'database.rules.json'],
  [RELEASE_TARGETS.PATH_ADMIN, (file) => file.startsWith('functions-path-admin/')
    || /^scripts\/(build-course-path-release|sync-path-admin-runtime)/.test(file)],
  // functions/shared is also vendored into the path-admin codebase, so a change
  // there is a change to both.
  [RELEASE_TARGETS.FUNCTIONS, (file) => (file.startsWith('functions/') && !file.startsWith('functions/test/'))
    || /^scripts\/build-ccmr-v2-1-production-release/.test(file)],
  [RELEASE_TARGETS.HOSTING, (file) => file.startsWith('src/') || file.startsWith('public/')
    || ['index.html', 'vite.config.js', 'package.json', 'package-lock.json', 'firebase.json'].includes(file)
    || file.startsWith('functions/shared/') // the browser imports the shared grading/policy modules
    || /^scripts\/build-firebase-hosting/.test(file)],
];

/**
 * Which deploy targets a set of changed paths requires, and the files that
 * put each one on the list (so a release can say WHY it is deploying Hosting).
 */
export const classifyChangedFiles = (paths = []) => {
  const reasons = {};
  const unclassified = [];
  for (const raw of paths) {
    const file = String(raw || '').replace(/^\.\//, '');
    if (!file) continue;
    let matched = false;
    for (const [target, test] of RULES) {
      if (!test(file)) continue;
      (reasons[target] ||= []).push(file);
      matched = true;
    }
    if (file.startsWith('functions/shared/')) (reasons[RELEASE_TARGETS.PATH_ADMIN] ||= []).push(file);
    if (!matched && !NO_DEPLOY.some((pattern) => pattern.test(file))) unclassified.push(file);
  }
  const targets = ORDER.filter((target) => reasons[target]?.length);
  return { targets, reasons, unclassified };
};

export const chunk = (list, size) => {
  const groupSize = Math.max(1, Math.floor(Number(size) || 1));
  const groups = [];
  for (let index = 0; index < list.length; index += groupSize) groups.push(list.slice(index, index + groupSize));
  return groups;
};

/**
 * The ordered steps of a release.
 *
 * `only` narrows to named targets; `functionNames` limits the default codebase
 * to exact functions (AGENTS.md: prefer exact names). Every functions step
 * names its functions explicitly — never a bare `--only functions`, which
 * would also redeploy the path-admin codebase.
 */
export const buildReleasePlan = ({
  targets = [],
  allFunctions = [],
  functionNames = null,
  only = null,
  groupSize = 8,
} = {}) => {
  const wanted = only?.length ? ORDER.filter((target) => only.includes(target)) : ORDER.filter((target) => targets.includes(target));
  const steps = [];
  for (const target of wanted) {
    if (target === RELEASE_TARGETS.FUNCTIONS) {
      const known = new Set(allFunctions);
      const names = functionNames?.length ? functionNames : allFunctions;
      const unknown = names.filter((name) => !known.has(name));
      if (unknown.length) throw new Error(`Not deployable functions in the default codebase: ${unknown.join(', ')}`);
      if (!names.length) continue;
      chunk(names, groupSize).forEach((group, index, all) => steps.push({
        target, group, label: `functions group ${index + 1}/${all.length}`,
      }));
      continue;
    }
    steps.push({ target, label: target });
  }
  return steps;
};

/**
 * The argument list for one step. Hosting is never a raw CLI deploy and never
 * shares a command with anything else.
 */
export const deployCommandFor = (step, { project }) => {
  if (step.target === RELEASE_TARGETS.HOSTING) {
    return { command: 'npm', args: ['run', 'deploy:hosting'], env: { FIREBASE_PROJECT: project } };
  }
  const only = step.target === RELEASE_TARGETS.FUNCTIONS
    ? step.group.map((name) => `functions:${name}`).join(',')
    : step.target;
  if (/(^|,)hosting(,|$)/.test(only)) throw new Error('Hosting must never be deployed through a raw firebase command.');
  return {
    command: 'npx',
    args: ['firebase', 'deploy', '--only', only, '--project', project, '--non-interactive', ...(step.target === RELEASE_TARGETS.FUNCTIONS || step.target === RELEASE_TARGETS.PATH_ADMIN ? ['--force'] : [])],
    env: {},
  };
};

// What a failed `firebase deploy` printed, reduced to what to do about it.
const FAILURE_PATTERNS = [
  ['quota', /429|quota|rate.?limit|too many requests|RESOURCE_EXHAUSTED|mutation requests per minute/i],
  ['discovery-timeout', /Failed to list functions|discovery|User code failed to load|Timeout after \d+ms/i],
  ['build-cancelled', /Build (?:was )?cancel+ed|CANCELLED|operation timed out/i],
  ['network', /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|ConnectTimeoutError|fetch failed|network/i],
  ['auth', /not authorized|PERMISSION_DENIED|403|login|credentials|reauth/i],
  ['code', /SyntaxError|ReferenceError|TypeError|Cannot find module|Error: Functions codebase could not be analyzed/i],
];

export const classifyDeployFailure = (output = '') => {
  const text = String(output || '');
  for (const [kind, pattern] of FAILURE_PATTERNS) if (pattern.test(text)) return kind;
  return 'unknown';
};

// Quota refills per minute; Cloud Build needs longer after a cancellation.
// Auth and code failures do not get better by waiting.
export const RETRYABLE_FAILURES = new Set(['quota', 'discovery-timeout', 'build-cancelled', 'network', 'unknown']);

export const retryDelaySeconds = (kind, attempt) => {
  const base = { quota: 75, 'build-cancelled': 90, 'discovery-timeout': 30, network: 15, unknown: 45 }[kind] ?? 45;
  return Math.min(300, base * 2 ** Math.max(0, attempt - 1));
};

/** Split a group that keeps failing, to find the function that is really broken. */
export const bisect = (group) => (group.length <= 1 ? [group] : [group.slice(0, Math.ceil(group.length / 2)), group.slice(Math.ceil(group.length / 2))]);
