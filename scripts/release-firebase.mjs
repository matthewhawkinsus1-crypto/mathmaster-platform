#!/usr/bin/env node
/*
 * ONE COMMAND FOR A MATHMASTER RELEASE.
 *
 * Works out what changed since the build that is live, deploys only what that
 * requires, in a safe order, with the Cloud Functions in small paced groups,
 * proves the functions now serve this commit, and writes a report that says
 * what shipped, what did not, how to finish it, and how to roll back.
 *
 *   node scripts/release-firebase.mjs                     # plan only (default)
 *   node scripts/release-firebase.mjs --execute           # deploy the plan
 *   node scripts/release-firebase.mjs --whats-live        # which commit each part runs
 *
 * Options
 *   --since <ref|live>    base to diff against (default: live — the gitSha in
 *                         https://<project>.web.app/mathmaster-build.json)
 *   --only a,b            targets to deploy regardless of the diff:
 *                         indexes, functions, path-admin, rules, database, hosting
 *   --functions a,b       exact default-codebase functions (implies functions)
 *   --group-size N        functions per group (default 8)
 *   --pause-seconds N     pause between groups (default 45)
 *   --max-attempts N      tries per group (and per verify) before giving up (default 3)
 *   --continue-after-function-failure
 *                         deploy rules/Hosting even if a function did not ship
 *                         or the functions do not prove the commit
 *   --yes                 do not ask for the project id before executing
 *   --project <id>        default FIREBASE_PROJECT or mathmaster-aleks
 *   --whats-live          print the commit Hosting, the functions (platformBuildInfo)
 *                         and, when gcloud is on PATH, every function's mm-git-sha
 *                         label are from; deploys nothing, needs no diff
 *
 * Any release that deploys default-codebase functions also redeploys
 * platformBuildInfo and then calls it (the callable protocol, no credentials):
 * if it does not report this checkout's HEAD, the release stops before
 * path-admin, rules and Hosting exactly as for a function that failed.
 * Then it checks, with gcloud, that every callable's Cloud Run service lets
 * browsers in (allUsers -> roles/run.invoker) and grants that where it is
 * missing, because the Firebase CLI grants it only when it creates a callable
 * (scripts/verify-callable-access.mjs). A callable a browser still cannot
 * reach stops the release the same way.
 *
 * The plan, the order, the verify decision and the retry rules live in
 * scripts/lib/releasePlan.mjs and scripts/lib/releaseExecutor.mjs and are
 * unit-tested without Firebase or a network (tests/platform/releasePlan.test.mjs).
 * The network calls are here, behind callBuildInfo / readLiveBuild, injected
 * into the executor. Hosting always goes through `npm run deploy:hosting`
 * (AGENTS.md). Nothing here ever deploys unless --execute is given.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  BUILD_INFO_FUNCTION,
  DEFAULT_FUNCTIONS_REGION,
  RELEASE_TARGETS,
  TARGET_ALIASES,
  VERIFY_FUNCTIONS,
  buildInfoRequest,
  buildReleasePlan,
  classifyChangedFiles,
  deployCommandFor,
  describeStep,
  retryCommandFor,
  summarizeFunctionLabels,
} from './lib/releasePlan.mjs';
import { executeReleasePlan } from './lib/releaseExecutor.mjs';
import { releaseAccessVerdict } from './lib/callableAccess.mjs';
import { ensureCallableAccess } from './verify-callable-access.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const list = (value) => (value ? String(value).split(',').map((item) => item.trim()).filter(Boolean) : null);

const PROJECT = option('project', process.env.FIREBASE_PROJECT || 'mathmaster-aleks');
const EXECUTE = flag('execute');
const GROUP_SIZE = Number(option('group-size', 8));
const PAUSE_SECONDS = Number(option('pause-seconds', 45));
const MAX_ATTEMPTS = Number(option('max-attempts', 3));
const STEP_TIMEOUT_SECONDS = Number(process.env.FUNCTION_DEPLOY_TIMEOUT_SECONDS || 900);
// The Firebase CLI's own default, with the CLI's own override.
const CLI_DEFAULT_REGION = process.env.FIREBASE_FUNCTIONS_DEFAULT_REGION || DEFAULT_FUNCTIONS_REGION;

const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

const fetchLiveBuild = async () => {
  const url = `https://${PROJECT}.web.app/mathmaster-build.json`;
  try {
    const response = await fetch(`${url}?ts=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { url, build: null, error: `HTTP ${response.status}` };
    return { url, build: await response.json(), error: null };
  } catch (error) {
    return { url, build: null, error: String(error?.cause?.code || error?.message || error) };
  }
};

const readLiveBuild = async () => (await fetchLiveBuild()).build;

/**
 * Ask a deployed platformBuildInfo which commit it was built from, over the
 * callable protocol. Never throws: resolves { url, reachable, status, body, error }
 * for scripts/lib/releasePlan.mjs#assessBuildInfoResponse to judge.
 */
const callBuildInfo = async ({ region = CLI_DEFAULT_REGION, name = BUILD_INFO_FUNCTION, timeoutMs = 20_000 } = {}) => {
  const { url, init } = buildInfoRequest({ project: PROJECT, region, name });
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { url, reachable: true, status: response.status, body, error: body ? null : text.trim().slice(0, 200) };
  } catch (error) {
    return { url, reachable: false, status: null, body: null, error: String(error?.cause?.code || error?.message || error) };
  }
};

/** The default codebase as the CLI sees it; [] when it cannot be loaded here. */
const loadInventory = async ({ required }) => {
  try {
    const { listDeployableFunctions } = await import('./lib/functionsInventory.mjs');
    return listDeployableFunctions().functions;
  } catch (error) {
    if (required) throw error;
    return [];
  }
};

const regionOf = (inventory) => inventory.find((fn) => fn.name === BUILD_INFO_FUNCTION)?.region || CLI_DEFAULT_REGION;

const fail = (message) => {
  console.error(`\nrelease-firebase: ${message}`);
  process.exit(2);
};

/* ----------------------------------------------------------------------------
 * --whats-live: read-only. Which commit is Hosting, which are the functions?
 * ------------------------------------------------------------------------- */
const listDeployedFunctions = () => {
  const result = spawnSync('gcloud', ['functions', 'list', '--project', PROJECT, '--format=json', '--quiet'], {
    cwd: repoRoot, encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error?.code === 'ENOENT') return { available: false, reason: 'gcloud is not on PATH' };
  if (result.error) return { available: true, functions: null, reason: result.error.message };
  if (result.status !== 0) {
    const said = String(result.stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' ');
    return { available: true, functions: null, reason: `gcloud exited ${result.status}${said ? `: ${said}` : ''}` };
  }
  try {
    return { available: true, functions: JSON.parse(result.stdout || '[]'), reason: null };
  } catch (error) {
    return { available: true, functions: null, reason: `unreadable gcloud output: ${error.message}` };
  }
};

const sameCommit = (left, right) => Boolean(left && right && left !== 'unknown' && right !== 'unknown'
  && (left.startsWith(right) || right.startsWith(left)));

const whatsLive = async () => {
  let headFull = 'unknown';
  let dirty = null;
  try {
    headFull = git('rev-parse', 'HEAD');
    dirty = Boolean(git('status', '--porcelain', '--untracked-files=no'));
  } catch {
    // Not a checkout: report the live side only.
  }
  const region = regionOf(await loadInventory({ required: false }));
  const [hosting, buildInfo] = await Promise.all([fetchLiveBuild(), callBuildInfo({ region })]);

  const verdictLine = (live) => (headFull === 'unknown' ? '' : sameCommit(live, headFull) ? '  = local HEAD' : '  ≠ local HEAD');
  console.log(`What is live on ${PROJECT}`);
  console.log(`  local HEAD  ${headFull === 'unknown' ? 'unknown' : headFull.slice(0, 12)}${dirty === null ? '' : dirty ? ' (uncommitted changes)' : ' (clean)'}`);

  if (hosting.build?.gitSha) {
    console.log(`  Hosting     ${hosting.build.gitSha}${hosting.build.builtAt ? `  built ${hosting.build.builtAt}` : ''}${hosting.build.gitDirty ? '  (dirty build)' : ''}${verdictLine(hosting.build.gitSha)}`);
  } else {
    console.log(`  Hosting     unreadable (${hosting.error || 'no gitSha'}) — ${hosting.url}`);
  }

  const result = buildInfo.reachable && buildInfo.status >= 200 && buildInfo.status < 300 ? buildInfo.body?.result : null;
  if (result && typeof result === 'object') {
    const sha = String(result.gitSha || 'unknown');
    console.log(`  Functions   ${sha === 'unknown' ? 'unknown' : sha.slice(0, 12)}  ${result.treeClean ? 'clean tree' : 'dirty tree'}${result.writtenAt ? `, stamped ${result.writtenAt}` : ''}  (${BUILD_INFO_FUNCTION}, ${region})${verdictLine(sha)}`);
  } else {
    const why = !buildInfo.reachable ? buildInfo.error : `HTTP ${buildInfo.status}${buildInfo.body?.error?.status ? ` ${buildInfo.body.error.status}` : ''}`;
    console.log(`  Functions   no answer from ${buildInfo.url} (${why}). Not deployed yet, or not reachable from here.`);
  }

  const deployed = listDeployedFunctions();
  if (!deployed.available) {
    console.log(`  Labels      skipped: ${deployed.reason}. Install the Google Cloud SDK (Cloud Shell has it) to see each function's mm-git-sha.`);
    return;
  }
  if (!deployed.functions) {
    console.log(`  Labels      could not list functions: ${deployed.reason}`);
    return;
  }
  const summary = summarizeFunctionLabels(deployed.functions);
  console.log(`  Labels      gcloud functions list: ${summary.total} function(s) by mm-git-sha`);
  summary.bySha.forEach((group) => {
    const codebases = Object.entries(group.codebases).map(([name, count]) => `${name} ${count}`).join(', ');
    const sha = group.gitSha ? group.gitSha.slice(0, 12) : '(no label)';
    const names = group.count <= 6 ? `  ${group.functions.join(', ')}` : '';
    const note = group.gitSha ? `${group.dirty ? `, ${group.dirty} dirty` : ''}${verdictLine(group.gitSha)}` : ' — last deployed before deploy provenance existed';
    console.log(`    ${sha.padEnd(14)} ${String(group.count).padStart(4)}  (${codebases})${note}${names}`);
  });
};

if (flag('whats-live')) {
  await whatsLive();
  process.exit(0);
}

/* ----------------------------------------------------------------------------
 * The release: plan, then (with --execute) deploy and verify.
 * ------------------------------------------------------------------------- */
const head = git('rev-parse', '--short=12', 'HEAD');
const headFull = git('rev-parse', 'HEAD');
const liveBuild = await readLiveBuild();
let base = option('since', 'live');
if (base === 'live') {
  if (!liveBuild?.gitSha || liveBuild.gitSha === 'unknown') {
    fail(`could not read the live build from https://${PROJECT}.web.app/mathmaster-build.json. Pass --since <commit>.`);
  }
  base = liveBuild.gitSha;
}
if (spawnSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: repoRoot }).status !== 0) {
  fail(`${base} is not a commit in this checkout. Run \`git fetch origin\` or pass --since <commit>.`);
}

const changed = git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
const { targets, reasons, unclassified } = classifyChangedFiles(changed);
const only = list(option('only'))?.map((name) => TARGET_ALIASES[name] || name) || null;
const functionNames = list(option('functions'));
const wantsFunctions = Boolean(functionNames?.length) || (only ? only.includes(RELEASE_TARGETS.FUNCTIONS) : targets.includes(RELEASE_TARGETS.FUNCTIONS));

const inventoryEntries = wantsFunctions ? await loadInventory({ required: true }) : [];
const inventory = inventoryEntries.map(({ name }) => name);
const BUILD_INFO_REGION = regionOf(inventoryEntries);

let steps;
try {
  steps = buildReleasePlan({
    targets,
    allFunctions: inventory,
    functionNames,
    only: functionNames?.length ? [...new Set([...(only || targets), RELEASE_TARGETS.FUNCTIONS])] : only,
    groupSize: GROUP_SIZE,
    expectedGitSha: headFull,
  });
} catch (error) {
  fail(error.message);
}

console.log(`MathMaster release plan for ${PROJECT}`);
console.log(`  live build: ${liveBuild?.gitSha || 'unknown'}${liveBuild?.builtAt ? ` (built ${liveBuild.builtAt})` : ''}`);
console.log(`  diff:       ${base}..${head}  (${changed.length} changed file${changed.length === 1 ? '' : 's'})`);
for (const target of Object.keys(reasons)) {
  const files = reasons[target];
  console.log(`  ${target.padEnd(22)} because ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''}`);
}
if (unclassified.length) console.log(`  NOTE: not mapped to a target (deployed by nothing): ${unclassified.slice(0, 6).join(', ')}${unclassified.length > 6 ? ' …' : ''}`);
if (!steps.length) {
  console.log('\nNothing to deploy.');
  process.exit(0);
}
console.log('\nSteps, in order:');
steps.forEach((step, index) => {
  console.log(`  ${String(index + 1).padStart(2)}. ${step.label.padEnd(24)} ${describeStep(step, { project: PROJECT, region: BUILD_INFO_REGION })}`);
});
const functionSteps = steps.filter((step) => step.target === RELEASE_TARGETS.FUNCTIONS).length;
if (functionSteps > 1) {
  console.log(`\n  ${functionSteps} function groups of up to ${GROUP_SIZE}, ${PAUSE_SECONDS}s apart — about ${Math.round((functionSteps * (PAUSE_SECONDS + 90)) / 60)} minutes if nothing is throttled.`);
}
if (steps.some((step) => step.target === VERIFY_FUNCTIONS)) {
  console.log(`  ${BUILD_INFO_FUNCTION} ships in the last group; the verify step then requires it to report ${head} before anything after it deploys.`);
}

if (!EXECUTE) {
  console.log('\nPlan only. Re-run with --execute to deploy.');
  process.exit(0);
}

if (!flag('yes')) {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`\nThis deploys to PRODUCTION (${PROJECT}). Type the project id to continue: `);
  prompt.close();
  if (answer.trim() !== PROJECT) fail('not confirmed; nothing was deployed.');
}

// The same gates every deploy script runs, before anything changes.
const gate = (label, command, args) => {
  console.log(`\n== ${label}`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', env: process.env });
  if (result.status !== 0) fail(`${label} failed; nothing was deployed.`);
};
gate('Deploy provenance (HEAD contains origin/main, clean tree)', 'node', ['scripts/check-deploy-provenance.mjs']);
if (wantsFunctions) gate('Functions load from the real entry point', 'node', ['scripts/verify-functions-discovery.mjs', ...(functionNames || []), BUILD_INFO_FUNCTION]);

const deployEnv = {
  ...process.env,
  // The CLI loads the ~12k-line codebase to discover it; on Cloud Shell the
  // default timeout is too short, and its localhost poll must bypass a proxy.
  FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '180',
  NO_PROXY: [process.env.NO_PROXY, 'localhost', '127.0.0.1'].filter(Boolean).join(','),
  no_proxy: [process.env.no_proxy, 'localhost', '127.0.0.1'].filter(Boolean).join(','),
};

const runner = (step) => new Promise((resolve) => {
  const { command, args, env } = deployCommandFor(step, { project: PROJECT });
  const child = spawn(command, args, { cwd: repoRoot, env: { ...deployEnv, ...env } });
  let output = '';
  const keep = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    output = `${output}${text}`.slice(-20_000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  // Cloud Build can leave the CLI waiting forever after a CANCELLED build.
  const timer = setTimeout(() => {
    output += `\nrelease-firebase: operation timed out after ${STEP_TIMEOUT_SECONDS}s`;
    child.kill('SIGTERM');
  }, STEP_TIMEOUT_SECONDS * 1000);
  child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ ok: code === 0, output });
  });
});

const startedAt = new Date();
const outcome = await executeReleasePlan({
  steps,
  runner,
  verifyBuildInfo: (step) => callBuildInfo({ region: BUILD_INFO_REGION, name: step.function }),
  // Every callable in the default codebase is checked and repaired, so one
  // that lost its binding at create is fixed by the next release of anything;
  // only the ones this release deployed can stop it (releaseAccessVerdict).
  ensureCallableAccess: async (step) => {
    const verdict = releaseAccessVerdict(await ensureCallableAccess({
      project: PROJECT,
      region: CLI_DEFAULT_REGION,
      codebases: ['default'],
      inventories: { default: inventoryEntries },
      fix: true,
      log: (line) => console.log(`[release]   ${line}`),
    }), { released: step.functions || null });
    verdict.warnings.forEach((line) => console.log(`[release]   not in this release, still unreachable: ${line}`));
    return verdict;
  },
  sleep: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
  log: (line) => console.log(`\n[release] ${line}`),
  maxAttempts: MAX_ATTEMPTS,
  pauseSecondsBetweenGroups: PAUSE_SECONDS,
  continueAfterFunctionFailure: flag('continue-after-function-failure'),
});

const retryCommand = retryCommandFor(outcome);
const report = {
  project: PROJECT,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  base,
  head,
  headSha: headFull,
  liveBuildBefore: liveBuild || null,
  targets: [...new Set(steps.map((step) => step.target).filter((target) => target !== VERIFY_FUNCTIONS))],
  reasons,
  ok: outcome.ok,
  results: outcome.results,
  failedFunctions: outcome.failedFunctions,
  // passed | failed (sha-mismatch | unreachable) | skipped; null when no default-codebase function was deployed.
  verification: outcome.verification,
  // passed | failed | skipped, with the callables granted browser access and any still unreachable.
  access: outcome.access,
  failedStep: outcome.failedStep,
  stoppedBeforeTargets: outcome.stoppedBeforeTargets,
  retryCommand,
  rollback: {
    hosting: liveBuild?.gitSha
      ? `Firebase console → Hosting → Release history → roll back to the release built from ${liveBuild.gitSha}; or \`git checkout ${liveBuild.gitSha} && npm run deploy:hosting\` (set MATHMASTER_DEPLOY_ALLOW_BEHIND_MAIN=1).`
      : 'Firebase console → Hosting → Release history → roll back to the previous release.',
    functions: `Redeploy the previous code: \`git checkout ${base} && node scripts/release-firebase.mjs --execute --only functions --since ${base}~1\` (or --functions <names> for the affected ones).`,
    rules: `\`git checkout ${base} -- firestore.rules && npx firebase deploy --only firestore:rules --project ${PROJECT}\`, then restore the file.`,
  },
};
const reportDir = path.join(repoRoot, 'release-reports');
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `release-${startedAt.toISOString().replace(/[:.]/g, '-')}-${head}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log('\n============================================');
console.log(outcome.ok ? `Release complete: ${report.targets.join(', ')}.` : 'Release INCOMPLETE.');
if (outcome.failedFunctions.length) {
  console.log(`Functions that did not deploy (${outcome.failedFunctions.length}):`);
  outcome.failedFunctions.forEach(({ name, failure }) => console.log(`  ${name}  (${failure})`));
}
if (outcome.verification?.status === 'passed') {
  console.log(`Functions verified: ${outcome.verification.function} serves ${String(outcome.verification.liveGitSha).slice(0, 12)}${outcome.verification.warning ? ` (WARNING: ${outcome.verification.warning})` : ''}.`);
} else if (outcome.verification?.status === 'failed') {
  console.log(`Functions NOT verified (${outcome.verification.failure}): ${outcome.verification.detail}`);
  console.log(`  Asked ${outcome.verification.url}. Check by hand: node scripts/release-firebase.mjs --whats-live`);
} else if (outcome.verification?.status === 'skipped') {
  console.log(`Functions verification skipped: ${outcome.verification.reason}.`);
}
if (outcome.access?.status === 'passed') {
  console.log(`Browser access verified: ${outcome.access.detail}.`);
} else if (outcome.access?.status === 'failed') {
  console.log(`Browser access NOT verified: ${outcome.access.detail}`);
  outcome.access.redeploy.forEach((command) => console.log(`  ${command}`));
  console.log('  Check by hand: node scripts/verify-callable-access.mjs --codebase default');
} else if (outcome.access?.status === 'skipped') {
  console.log(`Browser access check skipped: ${outcome.access.reason}.`);
}
if (outcome.failedStep) console.log(`Failed step: ${outcome.failedStep}`);
if (outcome.stoppedBeforeTargets?.length) console.log(`Not deployed: ${[...new Set(outcome.stoppedBeforeTargets)].join(', ')}`);
if (retryCommand) console.log(`Finish with:\n  ${retryCommand}`);
console.log(`Report: ${path.relative(repoRoot, reportPath)}`);
process.exit(outcome.ok ? 0 : 1);
