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
 *
 * PROVING THE FUNCTIONS LANDED (F-REL-3). A release that deploys any
 * default-codebase function also redeploys `platformBuildInfo`, last, and then
 * runs a read-only verify step: it calls that callable and requires the commit
 * it reports to be this checkout's HEAD. A wrong commit or no answer is treated
 * like a function that did not deploy — path-admin, rules and Hosting wait.
 *
 * PROVING A BROWSER CAN REACH THEM. A deployed callable is still unreachable
 * from a browser when its Cloud Run service does not grant `allUsers`
 * `roles/run.invoker`, and the Firebase CLI grants that only when it creates a
 * callable, never on a later deploy. So after the verify step comes an access
 * step: every callable in the default codebase is checked, and the binding is
 * granted where it is missing (scripts/lib/callableAccess.mjs). One a browser
 * still cannot reach is treated like a function that did not deploy.
 */

import { VENDORED_PATHS } from '../sync-path-admin-runtime.mjs';

export const RELEASE_TARGETS = Object.freeze({
  INDEXES: 'firestore:indexes',
  FUNCTIONS: 'functions',
  PATH_ADMIN: 'functions:path-admin',
  RULES: 'firestore:rules',
  DATABASE_RULES: 'database',
  HOSTING: 'hosting',
});

/**
 * The read-only check that follows the default-codebase functions steps. It is
 * not a deploy target: `--only` cannot name it and nothing is deployed by it.
 * It is planned whenever default-codebase functions are.
 */
export const VERIFY_FUNCTIONS = 'verify:functions';

/**
 * The browser-access step that follows the verify step: every default-codebase
 * callable must grant `allUsers` `roles/run.invoker`, and is granted it where
 * it does not. It changes IAM bindings only, never code, so like the verify
 * step it is not a deploy target and `--only` cannot name it.
 */
export const ACCESS_FUNCTIONS = 'access:functions';

/** The callable every functions release redeploys and then asks which commit is live. */
export const BUILD_INFO_FUNCTION = 'platformBuildInfo';

/**
 * Where a function without an explicit region is deployed: the Firebase CLI's
 * default (FIREBASE_FUNCTIONS_DEFAULT_REGION overrides it, as it does for the
 * CLI). functions/index.js sets no region, and the browser's getFunctions(app)
 * uses the same default.
 */
export const DEFAULT_FUNCTIONS_REGION = 'us-central1';

/** The `--only` spelling of each target, for the commands a report prints. */
export const TARGET_ALIASES = Object.freeze({
  indexes: RELEASE_TARGETS.INDEXES,
  functions: RELEASE_TARGETS.FUNCTIONS,
  'path-admin': RELEASE_TARGETS.PATH_ADMIN,
  rules: RELEASE_TARGETS.RULES,
  database: RELEASE_TARGETS.DATABASE_RULES,
  hosting: RELEASE_TARGETS.HOSTING,
});

const aliasFor = (target) => Object.entries(TARGET_ALIASES).find(([, value]) => value === target)?.[0] || target;

/** A full 40-character commit id, lowercased, or null. */
export const normalizeGitSha = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(text) ? text : null;
};

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

// The path-admin codebase deploys a vendored copy of these functions/ sources
// (scripts/sync-path-admin-runtime.mjs), so a change to one is a change to both
// codebases. Derived from the vendoring list itself, so the two cannot drift.
const vendoredIntoPathAdmin = (file) => VENDORED_PATHS.some((entry) => (entry.kind === 'dir'
  ? file.startsWith(`functions/${entry.from}/`)
  : file === `functions/${entry.from}`));

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
    if (vendoredIntoPathAdmin(file)) (reasons[RELEASE_TARGETS.PATH_ADMIN] ||= []).push(file);
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
 *
 * Any release that deploys default-codebase functions also deploys
 * `platformBuildInfo`, in the LAST group, and is followed by one read-only
 * verify step that expects it to report `expectedGitSha` (this checkout's
 * HEAD). A plan that cannot be verified is refused rather than planned
 * without the check.
 */
export const buildReleasePlan = ({
  targets = [],
  allFunctions = [],
  functionNames = null,
  only = null,
  groupSize = 8,
  expectedGitSha = null,
} = {}) => {
  const wanted = only?.length ? ORDER.filter((target) => only.includes(target)) : ORDER.filter((target) => targets.includes(target));
  const steps = [];
  for (const target of wanted) {
    if (target === RELEASE_TARGETS.FUNCTIONS) {
      const known = new Set(allFunctions);
      const requested = functionNames?.length ? functionNames : allFunctions;
      const unknown = requested.filter((name) => !known.has(name));
      if (unknown.length) throw new Error(`Not deployable functions in the default codebase: ${unknown.join(', ')}`);
      if (!requested.length) continue;
      if (!known.has(BUILD_INFO_FUNCTION)) {
        throw new Error(`${BUILD_INFO_FUNCTION} is not in the default codebase. Every functions release redeploys it and then asks it which commit is live; restore exports.${BUILD_INFO_FUNCTION} in functions/index.js.`);
      }
      // Last, so the verify step asks the function this release deployed most recently.
      const names = [...new Set(requested.filter((name) => name !== BUILD_INFO_FUNCTION)), BUILD_INFO_FUNCTION];
      chunk(names, groupSize).forEach((group, index, all) => steps.push({
        target, group, label: `functions group ${index + 1}/${all.length}`,
      }));
      steps.push({
        target: VERIFY_FUNCTIONS,
        label: `verify ${BUILD_INFO_FUNCTION}`,
        function: BUILD_INFO_FUNCTION,
        expectedGitSha: normalizeGitSha(expectedGitSha),
      });
      // Every callable is checked and repaired; the ones this release deployed
      // decide whether it may go on (callableAccess.mjs#releaseAccessVerdict).
      steps.push({ target: ACCESS_FUNCTIONS, label: 'browser access to callables', functions: names });
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
  if (step.target === VERIFY_FUNCTIONS) {
    throw new Error(`${VERIFY_FUNCTIONS} is a read-only check, not a deploy command.`);
  }
  if (step.target === ACCESS_FUNCTIONS) {
    throw new Error(`${ACCESS_FUNCTIONS} checks and grants Cloud Run IAM bindings; it is not a deploy command.`);
  }
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

// The verify step's two failures are retried briefly too: a function created
// moments ago can answer 403/404 until its public invoker binding propagates,
// and Cloud Run can take a few seconds to route every request to a new revision.
export const retryDelaySeconds = (kind, attempt) => {
  const base = {
    quota: 75, 'build-cancelled': 90, 'discovery-timeout': 30, network: 15, unknown: 45, unreachable: 15, 'sha-mismatch': 20,
  }[kind] ?? 45;
  return Math.min(300, base * 2 ** Math.max(0, attempt - 1));
};

/** Split a group that keeps failing, to find the function that is really broken. */
export const bisect = (group) => (group.length <= 1 ? [group] : [group.slice(0, Math.ceil(group.length / 2)), group.slice(Math.ceil(group.length / 2))]);

/*
 * WHICH COMMIT THE DEPLOYED FUNCTIONS SERVE.
 *
 * platformBuildInfo is an ordinary callable, so it is asked the way the
 * Firebase client SDK asks any callable: POST a JSON body {"data": {...}} to
 * https://<region>-<project>.cloudfunctions.net/<name>; success is HTTP 200 with
 * {"result": ...}, a failure is a non-2xx status with {"error": ...}. No
 * credentials: it is public, read-only, and returns nothing secret.
 */

export const buildInfoRequest = ({ project, region = DEFAULT_FUNCTIONS_REGION, name = BUILD_INFO_FUNCTION } = {}) => ({
  url: `https://${region}-${project}.cloudfunctions.net/${name}`,
  init: {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  },
});

/**
 * What one answer from platformBuildInfo means for a release.
 *
 * `response` is what the injected caller observed:
 *   { url, reachable, status, body, error }
 * (reachable=false: the request itself failed — DNS, TLS, timeout, egress).
 *
 * Failures:
 *   unreachable   no answer, a non-2xx status, or not a callable result
 *   sha-mismatch  it answered with a commit other than the expected HEAD —
 *                 including "unknown", which means deploy-provenance.json was
 *                 not in the uploaded source
 * A match from a dirty tree passes with a warning: the commit is right, and the
 * provenance gate already refuses a dirty tree before anything deploys.
 */
export const assessBuildInfoResponse = (response = {}, { expectedGitSha = null } = {}) => {
  const expected = normalizeGitSha(expectedGitSha);
  const base = {
    url: response?.url || null,
    expectedGitSha: expected,
    liveGitSha: null,
    liveTreeClean: null,
    liveWrittenAt: null,
    warning: null,
  };
  if (!response?.reachable) {
    return { ...base, ok: false, failure: 'unreachable', detail: `no answer: ${String(response?.error || 'request failed')}` };
  }
  const status = Number(response.status);
  if (!(status >= 200 && status < 300)) {
    const error = response.body?.error;
    const said = error ? ` ${[error.status, error.message].filter(Boolean).join(': ')}` : (response.error ? ` ${String(response.error).slice(0, 160)}` : '');
    return { ...base, ok: false, failure: 'unreachable', detail: `HTTP ${Number.isFinite(status) ? status : '?'}${said}` };
  }
  const result = response.body?.result;
  if (!result || typeof result !== 'object') {
    return { ...base, ok: false, failure: 'unreachable', detail: 'the answer is not a callable result ({"result": ...})' };
  }
  const live = normalizeGitSha(result.gitSha);
  const observed = {
    ...base,
    liveGitSha: live || 'unknown',
    liveTreeClean: result.treeClean === true,
    liveWrittenAt: typeof result.writtenAt === 'string' ? result.writtenAt : null,
  };
  if (!expected) {
    return { ...observed, ok: false, failure: 'sha-mismatch', detail: 'the local HEAD is unknown, so the live commit cannot be confirmed' };
  }
  if (!live) {
    return {
      ...observed,
      ok: false,
      failure: 'sha-mismatch',
      detail: 'the live functions report gitSha "unknown": deploy-provenance.json was missing or unreadable in the uploaded source (check the first predeploy step and the ignore list in firebase.json)',
    };
  }
  if (live !== expected) {
    return { ...observed, ok: false, failure: 'sha-mismatch', detail: `live ${live.slice(0, 12)}, expected ${expected.slice(0, 12)}` };
  }
  return {
    ...observed,
    ok: true,
    failure: null,
    detail: `serving ${live.slice(0, 12)}`,
    warning: result.treeClean === true ? null : 'deployed from a working tree with uncommitted changes (mm-tree=dirty)',
  };
};

/** One line describing what a plan step will do, for the printed plan. */
export const describeStep = (step, { project, region = DEFAULT_FUNCTIONS_REGION } = {}) => {
  if (step.target === VERIFY_FUNCTIONS) {
    const { url, init } = buildInfoRequest({ project, region, name: step.function });
    const expected = step.expectedGitSha ? step.expectedGitSha.slice(0, 12) : 'HEAD';
    return `POST ${url} ${init.body} -> result.gitSha must be ${expected}, else path-admin, rules and Hosting wait`;
  }
  if (step.target === ACCESS_FUNCTIONS) {
    return 'gcloud: every callable\'s Cloud Run service must grant allUsers roles/run.invoker (granted where missing), else path-admin, rules and Hosting wait';
  }
  const { command, args } = deployCommandFor(step, { project });
  return `${command} ${args.join(' ')}`;
};

/**
 * The command that finishes an incomplete release: the functions that did not
 * deploy — and platformBuildInfo when the verify step failed, since
 * redeploying it re-runs the check — then the targets held back. When only
 * the access step failed, the repair is the access check itself; a functions
 * re-run would repeat it anyway.
 */
export const retryCommandFor = ({ failedFunctions = [], verification = null, access = null, stoppedBeforeTargets = null } = {}) => {
  const names = [...new Set([
    ...(failedFunctions || []).map((entry) => entry.name),
    ...(verification?.status === 'failed' ? [verification.function || BUILD_INFO_FUNCTION] : []),
  ])];
  const first = names.length
    ? `node scripts/release-firebase.mjs --execute --functions ${names.join(',')}`
    : (access?.status === 'failed' ? 'node scripts/verify-callable-access.mjs --fix --codebase default' : null);
  if (!first) return null;
  const held = [...new Set(stoppedBeforeTargets || [])].map(aliasFor);
  return first + (held.length ? ` && node scripts/release-firebase.mjs --execute --only ${held.join(',')}` : '');
};

/**
 * `gcloud functions list --format=json`, grouped by the mm-git-sha label every
 * function now carries. A function with no label was last deployed before
 * deploy provenance existed (or by something other than this repository).
 */
export const summarizeFunctionLabels = (functions = []) => {
  const entries = (Array.isArray(functions) ? functions : []).map((fn) => {
    const resource = String(fn?.name || '');
    const labels = fn?.labels && typeof fn.labels === 'object' ? fn.labels : {};
    return {
      name: resource.split('/').pop() || '(unnamed)',
      region: (resource.match(/\/locations\/([^/]+)\//) || [])[1] || null,
      gitSha: typeof labels['mm-git-sha'] === 'string' && labels['mm-git-sha'] ? labels['mm-git-sha'] : null,
      tree: typeof labels['mm-tree'] === 'string' ? labels['mm-tree'] : null,
      // The Firebase CLI labels every codebase but the default one.
      codebase: labels['firebase-functions-codebase'] || 'default',
    };
  });
  const groups = new Map();
  entries.forEach((entry) => {
    const key = entry.gitSha || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  return {
    total: entries.length,
    unlabeled: (groups.get('') || []).map((entry) => entry.name).sort(),
    bySha: [...groups.entries()]
      .map(([sha, list]) => ({
        gitSha: sha || null,
        count: list.length,
        dirty: list.filter((entry) => entry.tree === 'dirty').length,
        codebases: Object.fromEntries([...new Set(list.map((entry) => entry.codebase))].sort()
          .map((codebase) => [codebase, list.filter((entry) => entry.codebase === codebase).length])),
        functions: list.map((entry) => entry.name).sort(),
      }))
      .sort((left, right) => right.count - left.count || String(left.gitSha).localeCompare(String(right.gitSha))),
  };
};
