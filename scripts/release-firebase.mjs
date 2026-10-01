#!/usr/bin/env node
/*
 * ONE COMMAND FOR A MATHMASTER RELEASE.
 *
 * Works out what changed since the build that is live, deploys only what that
 * requires, in a safe order, with the Cloud Functions in small paced groups,
 * and writes a report that says what shipped, what did not, how to finish it,
 * and how to roll back.
 *
 *   node scripts/release-firebase.mjs                     # plan only (default)
 *   node scripts/release-firebase.mjs --execute           # deploy the plan
 *
 * Options
 *   --since <ref|live>    base to diff against (default: live — the gitSha in
 *                         https://<project>.web.app/mathmaster-build.json)
 *   --only a,b            targets to deploy regardless of the diff:
 *                         indexes, functions, path-admin, rules, database, hosting
 *   --functions a,b       exact default-codebase functions (implies functions)
 *   --group-size N        functions per group (default 8)
 *   --pause-seconds N     pause between groups (default 45)
 *   --max-attempts N      tries per group before splitting it (default 3)
 *   --continue-after-function-failure
 *                         deploy rules/Hosting even if a function did not ship
 *   --yes                 do not ask for the project id before executing
 *   --project <id>        default FIREBASE_PROJECT or mathmaster-aleks
 *
 * The plan, the order and the retry rules live in scripts/lib/releasePlan.mjs
 * and scripts/lib/releaseExecutor.mjs and are unit-tested without Firebase
 * (tests/platform/releasePlan.test.mjs). Hosting always goes through
 * `npm run deploy:hosting` (AGENTS.md). Nothing here ever deploys unless
 * --execute is given.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_TARGETS, buildReleasePlan, classifyChangedFiles, deployCommandFor,
} from './lib/releasePlan.mjs';
import { executeReleasePlan } from './lib/releaseExecutor.mjs';

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

const TARGET_ALIASES = {
  indexes: RELEASE_TARGETS.INDEXES,
  functions: RELEASE_TARGETS.FUNCTIONS,
  'path-admin': RELEASE_TARGETS.PATH_ADMIN,
  rules: RELEASE_TARGETS.RULES,
  database: RELEASE_TARGETS.DATABASE_RULES,
  hosting: RELEASE_TARGETS.HOSTING,
};

const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

const readLiveBuild = async () => {
  const url = `https://${PROJECT}.web.app/mathmaster-build.json?ts=${Date.now()}`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

const fail = (message) => {
  console.error(`\nrelease-firebase: ${message}`);
  process.exit(2);
};

const head = git('rev-parse', '--short=12', 'HEAD');
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

let inventory = [];
if (wantsFunctions) {
  const { listDeployableFunctions } = await import('./lib/functionsInventory.mjs');
  inventory = listDeployableFunctions().functions.map(({ name }) => name);
}

let steps;
try {
  steps = buildReleasePlan({
    targets,
    allFunctions: inventory,
    functionNames,
    only: functionNames?.length ? [...new Set([...(only || targets), RELEASE_TARGETS.FUNCTIONS])] : only,
    groupSize: GROUP_SIZE,
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
  const { command, args } = deployCommandFor(step, { project: PROJECT });
  console.log(`  ${String(index + 1).padStart(2)}. ${step.label.padEnd(24)} ${command} ${args.join(' ')}`);
});
const functionSteps = steps.filter((step) => step.target === RELEASE_TARGETS.FUNCTIONS).length;
if (functionSteps > 1) {
  console.log(`\n  ${functionSteps} function groups of up to ${GROUP_SIZE}, ${PAUSE_SECONDS}s apart — about ${Math.round((functionSteps * (PAUSE_SECONDS + 90)) / 60)} minutes if nothing is throttled.`);
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
if (wantsFunctions) gate('Functions load from the real entry point', 'node', ['scripts/verify-functions-discovery.mjs', ...(functionNames || [])]);

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
  sleep: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
  log: (line) => console.log(`\n[release] ${line}`),
  maxAttempts: MAX_ATTEMPTS,
  pauseSecondsBetweenGroups: PAUSE_SECONDS,
  continueAfterFunctionFailure: flag('continue-after-function-failure'),
});

const retryCommand = outcome.failedFunctions.length
  ? `node scripts/release-firebase.mjs --execute --functions ${outcome.failedFunctions.map((entry) => entry.name).join(',')}${outcome.stoppedBeforeTargets?.length ? ` && node scripts/release-firebase.mjs --execute --only ${[...new Set(outcome.stoppedBeforeTargets)].map((target) => Object.entries(TARGET_ALIASES).find(([, value]) => value === target)?.[0] || target).join(',')}` : ''}`
  : null;
const report = {
  project: PROJECT,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  base,
  head,
  liveBuildBefore: liveBuild || null,
  targets: [...new Set(steps.map((step) => step.target))],
  reasons,
  ok: outcome.ok,
  results: outcome.results,
  failedFunctions: outcome.failedFunctions,
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
if (outcome.failedStep) console.log(`Failed step: ${outcome.failedStep}`);
if (outcome.stoppedBeforeTargets?.length) console.log(`Not deployed: ${[...new Set(outcome.stoppedBeforeTargets)].join(', ')}`);
if (retryCommand) console.log(`Finish with:\n  ${retryCommand}`);
console.log(`Report: ${path.relative(repoRoot, reportPath)}`);
process.exit(outcome.ok ? 0 : 1);
