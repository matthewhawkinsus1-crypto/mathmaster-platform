// THE RELEASE PLAN: SCOPE, ORDER, PACING, RETRIES AND WHAT STOPS A RELEASE.
//
// scripts/release-firebase.mjs executes what these modules decide. Everything
// is pure or takes an injected runner / verifier, so the cases below include a
// quota storm, a broken function and a deployment serving the wrong commit
// without any Firebase or network at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCESS_FUNCTIONS,
  BUILD_INFO_FUNCTION as B,
  DEFAULT_FUNCTIONS_REGION,
  DEPLOY_FIRST_FUNCTIONS,
  DEPLOY_LAST_FUNCTIONS,
  RELEASE_TARGETS as T,
  VERIFY_FUNCTIONS,
  assessBuildInfoResponse,
  buildInfoRequest,
  buildReleasePlan,
  classifyChangedFiles,
  classifyDeployFailure,
  deployCommandFor,
  describeStep,
  firebaseFunctionsSettingsChanged,
  functionSelectionLines,
  retryCommandFor,
  retryDelaySeconds,
  summarizeFunctionLabels,
} from '../../scripts/lib/releasePlan.mjs';
import { executeReleasePlan } from '../../scripts/lib/releaseExecutor.mjs';
import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';
import {
  buildFunctionsImportGraph,
  fsSource,
  mapSource,
  selectFunctionsForChange,
} from '../../scripts/lib/functionsImportGraph.mjs';
import { buildDeployProvenance, provenanceLabels, sanitizeLabelValue } from '../../scripts/write-functions-provenance.mjs';
import { region } from './helpers/sourceContract.mjs';

const HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
const OTHER = 'decade00decade00decade00decade00decade00';

// What a deployed platformBuildInfo answers over the callable protocol.
const serving = (gitSha, { treeClean = true } = {}) => async () => ({
  url: 'https://us-central1-p.cloudfunctions.net/platformBuildInfo',
  reachable: true,
  status: 200,
  body: { result: { codebase: 'default', gitSha, gitShaShort: String(gitSha).slice(0, 12), treeClean, writtenAt: '2026-10-01T00:00:00.000Z' } },
  error: null,
});

// What the access step resolves when a browser can reach every callable.
const reachable = async () => ({ ok: true, checked: true, summary: { total: 3, failing: [] }, grants: [], redeploy: [] });

test('changed files decide the targets, and say why', () => {
  const { targets, reasons } = classifyChangedFiles(['src/App.jsx', 'docs/x.md', 'tests/platform/a.test.mjs']);
  assert.deepEqual(targets, [T.HOSTING]);
  assert.deepEqual(reasons[T.HOSTING], ['src/App.jsx']);
  assert.deepEqual(classifyChangedFiles(['docs/a.md', 'tests/browser/b.mjs', 'functions/test/c.mjs']).targets, []);
  assert.deepEqual(classifyChangedFiles(['firestore.rules']).targets, [T.RULES]);
  assert.deepEqual(classifyChangedFiles(['firestore.indexes.json']).targets, [T.INDEXES]);
  assert.deepEqual(classifyChangedFiles(['functions/index.js']).targets, [T.FUNCTIONS]);
  // The browser and both codebases import functions/shared.
  assert.deepEqual(classifyChangedFiles(['functions/shared/answerUtils.mjs']).targets, [T.FUNCTIONS, T.PATH_ADMIN, T.HOSTING]);
  assert.deepEqual(classifyChangedFiles(['functions-path-admin/index.js']).targets, [T.PATH_ADMIN]);
});

test('a functions/lib file the path-admin codebase vendors is a change to both codebases', () => {
  // scripts/sync-path-admin-runtime.mjs copies these into functions-path-admin
  // at predeploy; changing one and deploying only the default codebase would
  // leave path-admin running the old copy.
  assert.deepEqual(classifyChangedFiles(['functions/lib/mathPath.js']).targets, [T.FUNCTIONS, T.PATH_ADMIN]);
  assert.deepEqual(classifyChangedFiles(['functions/lib/deployProvenance.js']).targets, [T.FUNCTIONS, T.PATH_ADMIN]);
  assert.deepEqual(classifyChangedFiles(['functions/lib/classroom.js']).targets, [T.FUNCTIONS], 'not vendored: default codebase only');
});

test('the order is indexes, functions, the functions checks, path admin, rules, database, then Hosting', () => {
  // platformBuildInfo is part of every functions release (the inventory must
  // have it), and the read-only verify step follows the last functions group.
  // The browser-access step follows it: both come before anything a new client
  // or new rules would rely on.
  const steps = buildReleasePlan({
    targets: [T.HOSTING, T.RULES, T.FUNCTIONS, T.INDEXES, T.PATH_ADMIN],
    allFunctions: ['a', 'b', 'c', B],
    groupSize: 2,
    expectedGitSha: HEAD,
  });
  assert.deepEqual(steps.map((step) => step.label), [
    T.INDEXES, 'functions group 1/2', 'functions group 2/2', `verify ${B}`, 'browser access to callables', T.PATH_ADMIN, T.RULES, T.HOSTING,
  ]);
  assert.deepEqual(steps.filter((step) => step.target === T.FUNCTIONS).map((step) => step.group), [['a', 'b'], ['c', B]]);
});

test('exact function names are checked against the real inventory', () => {
  assert.throws(() => buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['a', B], functionNames: ['a', 'typo'] }), /typo/);
  const steps = buildReleasePlan({ targets: [], only: [T.FUNCTIONS], allFunctions: ['a', 'b', B], functionNames: ['b'] });
  assert.deepEqual(steps.filter((step) => step.target === T.FUNCTIONS).map((step) => step.group), [['b', B]]);
});

test('every functions release deploys platformBuildInfo, once, in the last group', () => {
  const flat = (steps) => steps.filter((step) => step.target === T.FUNCTIONS).flatMap((step) => step.group);

  // The whole fleet: it is moved out of its alphabetical place to the end.
  const fleet = flat(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['alpha', B, 'zeta', 'mid'], groupSize: 2 }));
  assert.deepEqual(fleet, ['alpha', 'zeta', 'mid', B]);

  // Exact names: added when not asked for, never duplicated when it is.
  assert.deepEqual(flat(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['submitPathResponse', B], functionNames: ['submitPathResponse'] })), ['submitPathResponse', B]);
  assert.deepEqual(flat(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['x', B], functionNames: [B, 'x', 'x'] })), ['x', B]);

  // A codebase that cannot be asked which commit it is refuses to plan,
  // rather than planning a release nothing can verify.
  assert.throws(() => buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['a'] }), new RegExp(`${B} is not in the default codebase`));
});

test('the real default codebase has platformBuildInfo, so a real exact-name release includes it', () => {
  const names = listDeployableFunctions().functions.map((fn) => fn.name);
  assert.ok(names.includes(B), `${B} must be exported by the default codebase`);
  const steps = buildReleasePlan({ targets: [], only: [T.FUNCTIONS], allFunctions: names, functionNames: ['submitPathResponse'], expectedGitSha: HEAD });
  assert.deepEqual(steps.map((step) => step.target), [T.FUNCTIONS, VERIFY_FUNCTIONS, ACCESS_FUNCTIONS]);
  assert.deepEqual(steps[0].group, ['submitPathResponse', B]);
});

test('the verify step follows every functions step, expects HEAD, and precedes everything else', () => {
  const steps = buildReleasePlan({
    targets: [T.INDEXES, T.FUNCTIONS, T.PATH_ADMIN, T.RULES, T.DATABASE_RULES, T.HOSTING],
    allFunctions: ['a', 'b', 'c', 'd', 'e', B],
    groupSize: 2,
    expectedGitSha: HEAD.toUpperCase(),
  });
  const targets = steps.map((step) => step.target);
  const verifyIndex = targets.indexOf(VERIFY_FUNCTIONS);
  assert.equal(targets.filter((target) => target === VERIFY_FUNCTIONS).length, 1);
  assert.equal(verifyIndex, targets.lastIndexOf(T.FUNCTIONS) + 1, 'immediately after the last functions group');
  assert.ok(targets.slice(verifyIndex + 1).every((target) => target !== T.FUNCTIONS));
  // The browser-access step is the one check between it and the rest.
  assert.deepEqual(targets.slice(verifyIndex + 1), [ACCESS_FUNCTIONS, T.PATH_ADMIN, T.RULES, T.DATABASE_RULES, T.HOSTING]);
  assert.equal(steps[verifyIndex].function, B);
  assert.equal(steps[verifyIndex].expectedGitSha, HEAD, 'a full commit id, lowercased');
  assert.equal(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: [B], expectedGitSha: 'c0ffee00' })
    .find((step) => step.target === VERIFY_FUNCTIONS).expectedGitSha, null,
  'an abbreviated id is not a commit the check can confirm');
  assert.throws(() => deployCommandFor(steps[verifyIndex], { project: 'p' }), /read-only check/);
});

test('a release with no default-codebase functions has no verify step', () => {
  const verifies = (plan) => plan.filter((step) => step.target === VERIFY_FUNCTIONS).length;
  assert.equal(verifies(buildReleasePlan({ targets: [T.RULES, T.HOSTING] })), 0);
  assert.equal(verifies(buildReleasePlan({ targets: [T.FUNCTIONS, T.RULES], only: [T.PATH_ADMIN, T.RULES], allFunctions: ['a', B] })), 0);
  assert.equal(verifies(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: [] })), 0, 'nothing to deploy, nothing to verify');
  assert.equal(verifies(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['a', B] })), 1);
});

test('Hosting goes through the resilient wrapper and never shares a raw command', () => {
  assert.deepEqual(deployCommandFor({ target: T.HOSTING }, { project: 'p' }), { command: 'npm', args: ['run', 'deploy:hosting'], env: { FIREBASE_PROJECT: 'p' } });
  const functions = deployCommandFor({ target: T.FUNCTIONS, group: ['a', 'b'] }, { project: 'p' });
  assert.deepEqual(functions.args.slice(0, 4), ['firebase', 'deploy', '--only', 'functions:a,functions:b']);
  assert.ok(!functions.args.join(' ').includes('hosting'));
  const rules = deployCommandFor({ target: T.RULES }, { project: 'p' });
  assert.ok(!rules.args.includes('--force'), 'rules never need --force');
});

test('CLI failures are classified by what waiting can and cannot fix', () => {
  assert.equal(classifyDeployFailure("HTTP Error: 429, Quota exceeded for quota metric 'Per project mutation requests per minute per region'"), 'quota');
  assert.equal(classifyDeployFailure('Error: Failed to list functions for mathmaster-aleks'), 'discovery-timeout');
  assert.equal(classifyDeployFailure('Build failed with status: CANCELLED'), 'build-cancelled');
  assert.equal(classifyDeployFailure('request to https://cloudfunctions.googleapis.com failed, reason: socket hang up'), 'network');
  assert.equal(classifyDeployFailure('Error: HTTP Error: 403, The caller does not have permission'), 'auth');
  assert.equal(classifyDeployFailure('SyntaxError: Unexpected token )'), 'code');
  assert.ok(retryDelaySeconds('quota', 2) > retryDelaySeconds('quota', 1));
  assert.ok(retryDelaySeconds('quota', 10) <= 300);
});

const plan = (names, extra = []) => buildReleasePlan({ targets: [T.FUNCTIONS, ...extra], allFunctions: [...names, B], groupSize: 4, expectedGitSha: HEAD });

test('a quota storm is waited out and the release completes', async () => {
  let calls = 0;
  const waits = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a', 'b', 'c', 'd', 'e'], [T.RULES, T.HOSTING]),
    runner: async () => { calls += 1; return calls <= 2 ? { ok: false, output: 'HTTP Error: 429, Quota exceeded' } : { ok: true, output: '' }; },
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: reachable,
    sleep: async (seconds) => { waits.push(seconds); },
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.failedFunctions, []);
  assert.ok(waits.includes(retryDelaySeconds('quota', 1)) && waits.includes(retryDelaySeconds('quota', 2)), `waits ${waits}`);
  assert.ok(waits.includes(45), 'paused between function groups');
  assert.deepEqual(outcome.results.map((result) => result.target).slice(-2), [T.RULES, T.HOSTING]);
  assert.equal(outcome.verification.status, 'passed');
});

test('one broken function is isolated by splitting its group, and the rest still ship', async () => {
  const deployed = [];
  let asked = 0;
  const outcome = await executeReleasePlan({
    steps: plan(['a', 'b', 'c', 'broken', 'e'], [T.RULES, T.HOSTING]),
    runner: async (step) => {
      if (step.group?.includes('broken')) return { ok: false, output: 'ReferenceError: activeSkillCode is not defined' };
      deployed.push(...(step.group || [step.target]));
      return { ok: true, output: '' };
    },
    verifyBuildInfo: async () => { asked += 1; return serving(HEAD)(); },
  });
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.failedFunctions, [{ name: 'broken', failure: 'code' }]);
  assert.deepEqual(deployed.filter((name) => name.length === 1).sort(), ['a', 'b', 'c', 'e']);
  // A code failure is not retried in place — it is split straight away.
  assert.ok(outcome.results.every((result) => result.attempts.length === 1 || result.ok));
  // The new client may call the broken function: rules and Hosting wait.
  assert.ok(!deployed.includes(T.RULES) && !deployed.includes(T.HOSTING));
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.RULES, T.HOSTING]);
  // There is nothing to prove while a function is missing; the retry verifies.
  assert.equal(asked, 0);
  assert.equal(outcome.verification.status, 'skipped');
});

test('an operator may ship rules and Hosting anyway, deliberately', async () => {
  const deployed = [];
  const outcome = await executeReleasePlan({
    steps: plan(['broken'], [T.HOSTING]),
    runner: async (step) => (step.group?.includes('broken') ? { ok: false, output: 'SyntaxError' } : (deployed.push(...(step.group || [step.target])), { ok: true, output: '' })),
    verifyBuildInfo: serving(HEAD),
    continueAfterFunctionFailure: true,
  });
  assert.equal(outcome.ok, false);
  // The group split ships platformBuildInfo on its own; Hosting goes anyway.
  assert.deepEqual(deployed, [B, T.HOSTING]);
});

test('a Hosting or rules failure ends the release where it is', async () => {
  const outcome = await executeReleasePlan({
    steps: buildReleasePlan({ targets: [T.RULES, T.HOSTING] }),
    runner: async (step) => (step.target === T.RULES ? { ok: false, output: 'Error: 403 PERMISSION_DENIED' } : { ok: true, output: '' }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failedStep, T.RULES);
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.HOSTING]);
  assert.equal(outcome.results[0].attempts.length, 1, 'an auth failure is not retried');
  assert.equal(outcome.verification, null, 'no functions, no verify step');
});

// --- proving which commit the functions serve --------------------------------

test('the verify step asks platformBuildInfo after the last functions group and before path-admin, rules and Hosting', async () => {
  const order = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a', 'b', 'c', 'd', 'e'], [T.PATH_ADMIN, T.RULES, T.HOSTING]),
    runner: async (step) => { order.push(step.group ? `functions:${step.group.join('+')}` : step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: async (step) => { order.push(`verify:${step.function}`); return serving(HEAD)(); },
    ensureCallableAccess: async (step) => { order.push(`access:${step.functions.join('+')}`); return reachable(); },
  });
  // The access step asks after the commit is proven, about the functions this
  // release deployed, and before anything a browser would use them from.
  assert.deepEqual(order, ['functions:a+b+c+d', `functions:e+${B}`, `verify:${B}`, `access:a+b+c+d+e+${B}`, T.PATH_ADMIN, T.RULES, T.HOSTING]);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.verification.status, 'passed');
  assert.equal(outcome.verification.liveGitSha, HEAD);
  assert.equal(retryCommandFor(outcome), null);
});

test('functions serving another commit are treated like a failed function: path-admin, rules and Hosting wait', async () => {
  const deployed = [];
  const waits = [];
  let asked = 0;
  const outcome = await executeReleasePlan({
    steps: plan(['a'], [T.PATH_ADMIN, T.RULES, T.HOSTING]),
    runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: async () => { asked += 1; return serving(OTHER)(); },
    sleep: async (seconds) => { waits.push(seconds); },
  });
  assert.equal(outcome.ok, false);
  assert.deepEqual(deployed, [T.FUNCTIONS], 'nothing after the functions deployed');
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.PATH_ADMIN, T.RULES, T.HOSTING]);
  assert.deepEqual(outcome.failedFunctions, [], 'every deploy step itself succeeded');
  assert.equal(outcome.verification.status, 'failed');
  assert.equal(outcome.verification.failure, 'sha-mismatch');
  assert.equal(outcome.verification.expectedGitSha, HEAD);
  assert.equal(outcome.verification.liveGitSha, OTHER);
  // Asked again briefly — a new revision can take seconds to take all traffic.
  assert.equal(asked, 3);
  assert.deepEqual(waits, [retryDelaySeconds('sha-mismatch', 1), retryDelaySeconds('sha-mismatch', 2)]);
  // The report's finishing command redeploys platformBuildInfo (which re-runs
  // the check) and then what was held back.
  assert.equal(retryCommandFor(outcome),
    `node scripts/release-firebase.mjs --execute --functions ${B} && node scripts/release-firebase.mjs --execute --only path-admin,rules,hosting`);
});

test('an unreachable platformBuildInfo stops the release the same way', async () => {
  const cases = [
    async () => ({ url: 'u', reachable: false, status: null, body: null, error: 'ECONNRESET' }),
    async () => ({ url: 'u', reachable: true, status: 404, body: null, error: 'Page not found' }),
    async () => ({ url: 'u', reachable: true, status: 200, body: { unexpected: true }, error: null }),
    async () => { throw new Error('socket hang up'); },
  ];
  for (const verifyBuildInfo of cases) {
    const deployed = [];
    // eslint-disable-next-line no-await-in-loop
    const outcome = await executeReleasePlan({
      steps: plan(['a'], [T.RULES, T.HOSTING]),
      runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
      verifyBuildInfo,
      maxAttempts: 2,
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.verification.failure, 'unreachable');
    assert.equal(outcome.verification.attempts, 2);
    assert.deepEqual(deployed, [T.FUNCTIONS]);
    assert.deepEqual(outcome.stoppedBeforeTargets, [T.RULES, T.HOSTING]);
    assert.match(retryCommandFor(outcome), new RegExp(`--functions ${B} && .*--only rules,hosting$`));
  }
});

test('a function created moments ago that answers late is waited for, and the release completes', async () => {
  const deployed = [];
  const waits = [];
  let asked = 0;
  const outcome = await executeReleasePlan({
    steps: plan(['a'], [T.RULES, T.HOSTING]),
    runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: async () => {
      asked += 1;
      return asked === 1 ? { url: 'u', reachable: true, status: 403, body: null, error: 'Forbidden' } : serving(HEAD)();
    },
    ensureCallableAccess: reachable,
    sleep: async (seconds) => { waits.push(seconds); },
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(deployed, [T.FUNCTIONS, T.RULES, T.HOSTING]);
  assert.deepEqual(waits, [retryDelaySeconds('unreachable', 1)]);
  assert.equal(outcome.results.find((result) => result.target === VERIFY_FUNCTIONS).attempts.length, 2);
});

test('a functions-only release that cannot prove its commit is incomplete, and its retry re-runs the check', async () => {
  const outcome = await executeReleasePlan({
    steps: plan(['a']),
    runner: async () => ({ ok: true, output: '' }),
    verifyBuildInfo: serving('unknown'),
    maxAttempts: 1,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.stoppedBeforeTargets, null, 'nothing was waiting behind it');
  assert.match(outcome.verification.detail, /deploy-provenance\.json/);
  assert.equal(retryCommandFor(outcome), `node scripts/release-firebase.mjs --execute --functions ${B}`);
});

test('--continue-after-function-failure applies to an unproven commit too', async () => {
  const deployed = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a'], [T.RULES, T.HOSTING]),
    runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: serving(OTHER),
    maxAttempts: 1,
    continueAfterFunctionFailure: true,
  });
  assert.equal(outcome.ok, false, 'still reported incomplete');
  assert.deepEqual(deployed, [T.FUNCTIONS, T.RULES, T.HOSTING]);
  assert.equal(outcome.stoppedBeforeTargets, null);
});

test('a failed function and a failed check both appear in the finishing command', () => {
  assert.equal(
    retryCommandFor({ failedFunctions: [{ name: 'broken' }], verification: { status: 'failed', function: B }, stoppedBeforeTargets: [T.RULES, T.HOSTING, T.HOSTING] }),
    `node scripts/release-firebase.mjs --execute --functions broken,${B} && node scripts/release-firebase.mjs --execute --only rules,hosting`,
  );
  assert.equal(retryCommandFor({ failedFunctions: [], verification: { status: 'passed', function: B } }), null);
  assert.equal(retryCommandFor({ failedFunctions: [], verification: { status: 'skipped', function: B } }), null);
});

test('platformBuildInfo is asked the way the client SDK asks any callable', () => {
  const { url, init } = buildInfoRequest({ project: 'mathmaster-aleks' });
  assert.equal(url, 'https://us-central1-mathmaster-aleks.cloudfunctions.net/platformBuildInfo');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { data: {} });
  assert.equal(buildInfoRequest({ project: 'p', region: 'europe-west1' }).url, 'https://europe-west1-p.cloudfunctions.net/platformBuildInfo');

  // The URL the plan prints is where the real function is deployed: the real
  // codebase sets no region, so it goes to the CLI default.
  const real = listDeployableFunctions().functions.find((fn) => fn.name === B);
  assert.equal(real.trigger, 'callable');
  assert.equal(real.region, null, 'functions/index.js sets no region; the verify URL assumes the default');
  assert.equal(DEFAULT_FUNCTIONS_REGION, 'us-central1');
  const verify = buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: [B], expectedGitSha: HEAD }).find((step) => step.target === VERIFY_FUNCTIONS);
  assert.match(describeStep(verify, { project: 'mathmaster-aleks' }), /^POST https:\/\/us-central1-mathmaster-aleks\.cloudfunctions\.net\/platformBuildInfo \{"data":\{\}\} -> result\.gitSha must be c0ffee00c0ff/);
});

test('what a platformBuildInfo answer means', () => {
  const answer = (result, extra = {}) => ({ url: 'u', reachable: true, status: 200, body: { result }, error: null, ...extra });
  const match = assessBuildInfoResponse(answer({ gitSha: HEAD.toUpperCase(), treeClean: true }), { expectedGitSha: HEAD });
  assert.equal(match.ok, true);
  assert.equal(match.warning, null);

  const dirty = assessBuildInfoResponse(answer({ gitSha: HEAD, treeClean: false }), { expectedGitSha: HEAD });
  assert.equal(dirty.ok, true, 'the commit is right; the provenance gate already refuses a dirty tree');
  assert.match(dirty.warning, /uncommitted/);

  const prefix = assessBuildInfoResponse(answer({ gitSha: HEAD.slice(0, 12), treeClean: true }), { expectedGitSha: HEAD });
  assert.equal(prefix.failure, 'sha-mismatch', 'an abbreviated commit proves nothing');

  assert.equal(assessBuildInfoResponse(answer({ gitSha: OTHER }), { expectedGitSha: HEAD }).failure, 'sha-mismatch');
  assert.equal(assessBuildInfoResponse(answer({ gitSha: HEAD }), { expectedGitSha: null }).failure, 'sha-mismatch');
  const refused = assessBuildInfoResponse({ url: 'u', reachable: true, status: 404, body: { error: { status: 'NOT_FOUND', message: 'Function not found' } } }, { expectedGitSha: HEAD });
  assert.equal(refused.failure, 'unreachable');
  assert.match(refused.detail, /HTTP 404 NOT_FOUND: Function not found/);
  assert.equal(assessBuildInfoResponse({ reachable: false, error: 'ENOTFOUND' }, { expectedGitSha: HEAD }).failure, 'unreachable');
  assert.equal(assessBuildInfoResponse(undefined, { expectedGitSha: HEAD }).failure, 'unreachable');
});

test('the live labels are summarized by commit, and unlabeled functions are named', () => {
  const fn = (name, labels, location = 'us-central1') => ({ name: `projects/p/locations/${location}/functions/${name}`, labels });
  const summary = summarizeFunctionLabels([
    fn('a', { 'mm-git-sha': HEAD, 'mm-tree': 'clean', 'deployment-tool': 'cli-firebase' }),
    fn('b', { 'mm-git-sha': HEAD, 'mm-tree': 'dirty' }),
    fn('getCoursePathReleaseStatusV2', { 'mm-git-sha': HEAD, 'mm-tree': 'clean', 'firebase-functions-codebase': 'path-admin' }),
    fn('old', { 'deployment-tool': 'cli-firebase' }),
    fn('older', undefined),
    fn('c', { 'mm-git-sha': OTHER, 'mm-tree': 'clean' }),
  ]);
  assert.equal(summary.total, 6);
  assert.deepEqual(summary.unlabeled, ['old', 'older']);
  assert.deepEqual(summary.bySha.map((group) => [group.gitSha, group.count]), [[HEAD, 3], [null, 2], [OTHER, 1]]);
  assert.deepEqual(summary.bySha[0].codebases, { default: 2, 'path-admin': 1 });
  assert.equal(summary.bySha[0].dirty, 1);
  assert.deepEqual(summarizeFunctionLabels(null), { total: 0, unlabeled: [], bySha: [] });
});

// --- the provenance record and its Cloud labels --------------------------------

const LABEL_KEY = /^[a-z][a-z0-9_-]{0,62}$/;
const LABEL_VALUE = /^[a-z0-9_-]{0,63}$/;
const legalLabels = (labels) => Object.entries(labels).every(([key, value]) => LABEL_KEY.test(key) && LABEL_VALUE.test(value));

test('buildDeployProvenance: a clean tree, a dirty tree, and no git at all', () => {
  const clean = buildDeployProvenance({ gitSha: `${HEAD}\n`, porcelainStatus: '', nowIso: '2026-10-01T09:00:00.000Z', codebase: 'default' });
  assert.deepEqual(clean, {
    schemaVersion: 1, codebase: 'default', gitSha: HEAD, gitShaShort: HEAD.slice(0, 12), treeClean: true, writtenAt: '2026-10-01T09:00:00.000Z',
  });

  const dirty = buildDeployProvenance({ gitSha: HEAD.toUpperCase(), porcelainStatus: ' M functions/index.js\n?? notes.txt\n', nowIso: '2026-10-01T09:00:00Z', codebase: 'path-admin' });
  assert.equal(dirty.gitSha, HEAD, 'lowercased');
  assert.equal(dirty.treeClean, false);
  assert.equal(dirty.codebase, 'path-admin');
  assert.equal(dirty.writtenAt, '2026-10-01T09:00:00.000Z');

  // git missing (spawn failed): both facts are null.
  const unknown = buildDeployProvenance({ gitSha: null, porcelainStatus: null, nowIso: '2026-10-01T09:00:00.000Z', codebase: 'default' });
  assert.equal(unknown.gitSha, 'unknown');
  assert.equal(unknown.gitShaShort, 'unknown');
  assert.equal(unknown.treeClean, false, 'a tree git could not describe is not provably clean');

  // A commit but no status, a short id, garbage: never clean, never a fake sha.
  assert.equal(buildDeployProvenance({ gitSha: HEAD, porcelainStatus: null }).treeClean, false);
  assert.equal(buildDeployProvenance({ gitSha: HEAD.slice(0, 12), porcelainStatus: '' }).gitSha, 'unknown');
  assert.equal(buildDeployProvenance({ gitSha: 'fatal: not a git repository', porcelainStatus: '' }).treeClean, false);
  assert.equal(buildDeployProvenance({ gitSha: HEAD, porcelainStatus: '', nowIso: 'yesterday' }).writtenAt, null);
});

test('provenanceLabels: the commit and the tree, always legal Cloud labels', () => {
  assert.deepEqual(provenanceLabels({ gitSha: HEAD, treeClean: true }), { 'mm-git-sha': HEAD, 'mm-tree': 'clean' });
  assert.deepEqual(provenanceLabels({ gitSha: HEAD.toUpperCase(), treeClean: false }), { 'mm-git-sha': HEAD, 'mm-tree': 'dirty' });
  assert.deepEqual(provenanceLabels({ gitSha: 'unknown', treeClean: true }), { 'mm-git-sha': 'unknown', 'mm-tree': 'dirty' });
  assert.deepEqual(provenanceLabels({}), { 'mm-git-sha': 'unknown', 'mm-tree': 'dirty' });
  assert.deepEqual(provenanceLabels(null), { 'mm-git-sha': 'unknown', 'mm-tree': 'dirty' });
  assert.deepEqual(provenanceLabels({ gitSha: 'Robert"); DROP TABLE--', treeClean: 'yes' }), { 'mm-git-sha': 'unknown', 'mm-tree': 'dirty' });
  [
    provenanceLabels({ gitSha: HEAD, treeClean: true }),
    provenanceLabels({ gitSha: '<script>', treeClean: 1 }),
  ].forEach((labels) => assert.ok(legalLabels(labels), JSON.stringify(labels)));

  // The sanitizer itself, for anything that ever reaches a label.
  assert.equal(sanitizeLabelValue('Feature/Branch Name!'), 'feature-branch-name-');
  assert.equal(sanitizeLabelValue('x'.repeat(100)).length, 63);
  assert.equal(sanitizeLabelValue(''), 'unknown');
  assert.equal(sanitizeLabelValue(null, 'none'), 'none');
  assert.ok(LABEL_VALUE.test(sanitizeLabelValue('Ünïcødé ✓ 2026-10-01T09:00:00.000Z')));
});

test('the inventory is the real entry point, including the functions index.js does not define', () => {
  const { entry, functions } = listDeployableFunctions();
  const names = functions.map((fn) => fn.name);
  assert.equal(entry, JSON.parse(readFileSync(new URL('../../functions/package.json', import.meta.url), 'utf8')).main);
  const grepped = new Set((readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8').match(/^exports\.[A-Za-z0-9_]+/gm) || []).map((line) => line.slice(8)));
  for (const name of grepped) assert.ok(names.includes(name), `${name} is exported by index.js but not deployable`);
  for (const name of ['syncSectionGradeToClassroom', 'reconcileClassroomSectionGrades', 'getLiveChallengeExperience', 'authorHonorsAssignmentWithGemini']) {
    assert.ok(names.includes(name), `${name} is defined outside index.js and must be deployed too`);
  }
  assert.ok(names.length > grepped.size, 'the old grep missed functions defined in the entry files');
  const script = readFileSync(new URL('../../scripts/deploy-functions-in-groups.sh', import.meta.url), 'utf8');
  assert.match(script, /mapfile -t NAMES < <\(node "\$REPO_ROOT\/scripts\/lib\/functionsInventory\.mjs"/);
  assert.doesNotMatch(script, /grep -o '\^exports/);
});

// --- proving a browser can reach every callable ---------------------------------
//
// The Firebase CLI grants a callable `allUsers` roles/run.invoker only when it
// creates it. A grant that failed then stays missing through every later
// deploy, and browsers see "internal" (scripts/lib/callableAccess.mjs). The
// access step is what notices and repairs that before a client ships.

const unreachable = (failing = ['teacherTestCycleAction']) => async () => ({
  ok: false, checked: true, summary: { total: 3, failing }, grants: [], redeploy: [],
});

test('a callable browsers cannot reach is treated like a failed function: path-admin, rules and Hosting wait', async () => {
  const deployed = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a'], [T.PATH_ADMIN, T.RULES, T.HOSTING]),
    runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: unreachable(),
  });
  assert.equal(outcome.ok, false);
  assert.deepEqual(deployed, [T.FUNCTIONS], 'nothing after the functions deployed');
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.PATH_ADMIN, T.RULES, T.HOSTING]);
  assert.deepEqual(outcome.failedFunctions, [], 'every deploy step itself succeeded');
  assert.equal(outcome.verification.status, 'passed');
  assert.equal(outcome.access.status, 'failed');
  assert.deepEqual(outcome.access.failing, ['teacherTestCycleAction']);
  // The finishing command is the repair itself, then what was held back.
  assert.equal(retryCommandFor(outcome),
    'node scripts/verify-callable-access.mjs --fix --codebase default && node scripts/release-firebase.mjs --execute --only path-admin,rules,hosting');
});

test('an access check that could not run is never a pass, and neither is no checker at all', async () => {
  const notChecked = async () => ({ ok: false, checked: false, reason: 'gcloud is not on PATH (Cloud Shell has it)' });
  const claimsOkWithoutChecking = async () => ({ ok: true, checked: false, reason: 'gcloud is not on PATH' });
  const throws = async () => { throw new Error('spawn gcloud EACCES'); };
  for (const ensureCallableAccess of [notChecked, claimsOkWithoutChecking, throws, undefined]) {
    const deployed = [];
    // eslint-disable-next-line no-await-in-loop
    const outcome = await executeReleasePlan({
      steps: plan(['a'], [T.HOSTING]),
      runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
      verifyBuildInfo: serving(HEAD),
      ...(ensureCallableAccess ? { ensureCallableAccess } : {}),
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.access.status, 'failed');
    assert.match(outcome.access.detail, /^not checked: /);
    assert.deepEqual(deployed, [T.FUNCTIONS], 'Hosting waits');
  }
});

test('a callable repaired by the access step lets the release go on, and says what it granted', async () => {
  const deployed = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a'], [T.HOSTING]),
    runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: async () => ({
      ok: true,
      checked: true,
      summary: { total: 3, failing: [] },
      grants: [{ name: 'teacherTestCycleAction', service: 'teachertestcycleaction', ok: true, error: null }],
      redeploy: [],
    }),
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(deployed, [T.FUNCTIONS, T.HOSTING]);
  assert.equal(outcome.access.status, 'passed');
  assert.deepEqual(outcome.access.granted, ['teacherTestCycleAction']);
  assert.match(outcome.access.detail, /granted browser access to teacherTestCycleAction/);
});

test('when a function did not deploy, the access step is skipped, not run', async () => {
  let asked = 0;
  const outcome = await executeReleasePlan({
    steps: plan(['broken'], [T.HOSTING]),
    runner: async (step) => (step.group?.includes('broken') ? { ok: false, output: 'SyntaxError' } : { ok: true, output: '' }),
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: async () => { asked += 1; return reachable(); },
  });
  assert.equal(outcome.ok, false);
  assert.equal(asked, 0);
  assert.equal(outcome.access.status, 'skipped');
  assert.equal(outcome.verification.status, 'skipped');
});

test('--continue-after-function-failure applies to an unreachable callable too', async () => {
  const deployed = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a'], [T.RULES, T.HOSTING]),
    runner: async (step) => { deployed.push(step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: unreachable(),
    continueAfterFunctionFailure: true,
  });
  assert.equal(outcome.ok, false, 'still reported incomplete');
  assert.deepEqual(deployed, [T.FUNCTIONS, T.RULES, T.HOSTING]);
});

test('a release that stops before its functions lists only deploy targets as held back, never the checks', async () => {
  const outcome = await executeReleasePlan({
    steps: buildReleasePlan({ targets: [T.INDEXES, T.FUNCTIONS, T.HOSTING], allFunctions: ['a', B], expectedGitSha: HEAD }),
    runner: async (step) => (step.target === T.INDEXES ? { ok: false, output: 'Error: 403 PERMISSION_DENIED' } : { ok: true, output: '' }),
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: reachable,
  });
  assert.equal(outcome.failedStep, T.INDEXES);
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.FUNCTIONS, T.HOSTING]);
  assert.equal(outcome.access.status, 'skipped');
});

test('the access step changes IAM, not code: it is never a deploy command, and the plan says what it checks', () => {
  const step = buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['a', B], expectedGitSha: HEAD })
    .find((entry) => entry.target === ACCESS_FUNCTIONS);
  assert.deepEqual(step.functions, ['a', B], 'it knows which functions this release deployed');
  assert.throws(() => deployCommandFor(step, { project: 'p' }), /not a deploy command/);
  assert.match(describeStep(step, { project: 'p' }), /allUsers roles\/run\.invoker/);
  assert.equal(retryCommandFor({ failedFunctions: [], verification: { status: 'passed' }, access: { status: 'passed' } }), null);
  // A failed function's re-run repeats the access step, so it is all it takes.
  assert.equal(retryCommandFor({ failedFunctions: [{ name: 'broken' }], access: { status: 'failed' } }),
    'node scripts/release-firebase.mjs --execute --functions broken');
});

test('the release wires the access check into the executor, imported where it is called', () => {
  const source = readFileSync(new URL('../../scripts/release-firebase.mjs', import.meta.url), 'utf8');
  assert.match(source, /^import \{ ensureCallableAccess \} from '\.\/verify-callable-access\.mjs';$/m);
  assert.match(source, /^import \{ releaseAccessVerdict \} from '\.\/lib\/callableAccess\.mjs';$/m);
  const call = region(source, 'const outcome = await executeReleasePlan({', '\n});', 'the executeReleasePlan call');
  // Injected as the executor's checker, judged on this release's functions, and repairing.
  assert.match(call, /ensureCallableAccess: async \(step\) => \{[\s\S]*releaseAccessVerdict\(await ensureCallableAccess\(\{[\s\S]*fix: true,[\s\S]*\}\), \{ released: step\.functions \|\| null \}\)/);
});

test('a change to the weekly planner the freeze vendors deploys Functions as well as Hosting (student push I, item 5)', async () => {
  const { plannerClosure } = await import('../../scripts/sync-functions-weekly-planner.mjs');
  const plannerFile = plannerClosure().find((file) => file.startsWith('src/'));
  assert.ok(plannerFile, 'the planner has src/ modules');
  const { reasons, unclassified } = classifyChangedFiles([plannerFile, 'scripts/sync-functions-weekly-planner.mjs', 'src/App.css']);
  assert.ok(reasons.functions.includes(plannerFile));
  assert.ok(reasons.functions.includes('scripts/sync-functions-weekly-planner.mjs'));
  assert.ok(reasons.hosting.includes(plannerFile));
  assert.ok(!reasons.functions.includes('src/App.css'), 'other browser files stay Hosting only');
  assert.deepEqual(unclassified, []);
});

// --- functions whose place in a release is part of their safety -------------
// Live Challenge's server sweep (STUDENT_PASS3_LIVE_CHALLENGE_ROUNDS.md,
// "Deploy"): the host heartbeat first and alone; the scheduled sweep last and
// alone, after both checks, and only when the rest of the release is proven.

const [HEARTBEAT] = DEPLOY_FIRST_FUNCTIONS;
const [SWEEP] = DEPLOY_LAST_FUNCTIONS;

test('the Live Challenge heartbeat ships first and alone, and the sweep last and alone, after both checks', () => {
  const steps = buildReleasePlan({
    targets: [T.FUNCTIONS, T.PATH_ADMIN, T.RULES, T.HOSTING],
    allFunctions: ['advanceLiveChallenge', SWEEP, 'closeLiveChallengeRound', HEARTBEAT, B],
    groupSize: 8,
    expectedGitSha: HEAD,
  });
  assert.deepEqual(steps.map((step) => step.label), [
    'functions group 1/3', 'functions group 2/3', `verify ${B}`, 'browser access to callables', 'functions group 3/3', T.PATH_ADMIN, T.RULES, T.HOSTING,
  ]);
  assert.deepEqual(steps.filter((step) => step.target === T.FUNCTIONS).map((step) => step.group), [
    [HEARTBEAT], ['advanceLiveChallenge', 'closeLiveChallengeRound', B], [SWEEP],
  ]);
  assert.deepEqual(steps.filter((step) => step.deployFirst).map((step) => step.group), [[HEARTBEAT]]);
  assert.deepEqual(steps.filter((step) => step.afterChecks).map((step) => step.group), [[SWEEP]]);
  // The access step judges what browsers call; the sweep is a scheduled function.
  assert.deepEqual(steps.find((step) => step.target === ACCESS_FUNCTIONS).functions, [HEARTBEAT, 'advanceLiveChallenge', 'closeLiveChallengeRound', B]);

  // Exact names keep the order: asked for alone, the sweep still waits for the checks.
  const alone = buildReleasePlan({ targets: [], only: [T.FUNCTIONS], allFunctions: [SWEEP, HEARTBEAT, B], functionNames: [SWEEP], expectedGitSha: HEAD });
  assert.deepEqual(alone.map((step) => step.group || step.target), [[B], VERIFY_FUNCTIONS, ACCESS_FUNCTIONS, [SWEEP]]);

  // The real default codebase exports both, under these names, and plans them this way.
  const names = listDeployableFunctions().functions.map((fn) => fn.name);
  assert.ok(names.includes(HEARTBEAT) && names.includes(SWEEP));
  const fleet = buildReleasePlan({ targets: [T.FUNCTIONS, T.HOSTING], allFunctions: names, expectedGitSha: HEAD });
  const deploys = fleet.filter((step) => step.target === T.FUNCTIONS);
  assert.deepEqual(deploys[0].group, [HEARTBEAT]);
  assert.deepEqual(deploys.at(-1).group, [SWEEP]);
  assert.equal(fleet.indexOf(deploys.at(-1)), fleet.findIndex((step) => step.target === ACCESS_FUNCTIONS) + 1, 'right after the access step');
  assert.ok(deploys.at(-2).group.at(-1) === B, 'platformBuildInfo still ships last before the checks');
});

test('the sweep ships after both checks pass, and Hosting after it', async () => {
  const order = [];
  const outcome = await executeReleasePlan({
    steps: plan([HEARTBEAT, 'a', SWEEP], [T.HOSTING]),
    runner: async (step) => { order.push(step.group ? `functions:${step.group.join('+')}` : step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: async (step) => { order.push(`verify:${step.function}`); return serving(HEAD)(); },
    ensureCallableAccess: async () => { order.push('access'); return reachable(); },
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(order, [`functions:${HEARTBEAT}`, `functions:a+${B}`, `verify:${B}`, 'access', `functions:${SWEEP}`, T.HOSTING]);
  assert.deepEqual(outcome.heldFunctions, []);
  assert.equal(retryCommandFor(outcome), null);
});

test('the sweep never ships beside a function that did not deploy, and the finishing command ships it', async () => {
  const deployed = [];
  const runner = async (step) => {
    if (step.group?.includes('broken')) return { ok: false, output: 'SyntaxError: Unexpected token )' };
    deployed.push(...(step.group || [step.target]));
    return { ok: true, output: '' };
  };
  const outcome = await executeReleasePlan({ steps: plan([HEARTBEAT, 'broken', SWEEP], [T.HOSTING]), runner, verifyBuildInfo: serving(HEAD), ensureCallableAccess: reachable });
  assert.equal(outcome.ok, false);
  assert.ok(deployed.includes(HEARTBEAT) && !deployed.includes(SWEEP) && !deployed.includes(T.HOSTING));
  assert.deepEqual(outcome.heldFunctions, [SWEEP]);
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.HOSTING]);
  assert.equal(retryCommandFor(outcome),
    `node scripts/release-firebase.mjs --execute --functions broken,${SWEEP} && node scripts/release-firebase.mjs --execute --only hosting`);

  // Shipping Hosting anyway is about Hosting: the sweep is still held.
  deployed.length = 0;
  const anyway = await executeReleasePlan({
    steps: plan([HEARTBEAT, 'broken', SWEEP], [T.HOSTING]), runner, verifyBuildInfo: serving(HEAD), ensureCallableAccess: reachable, continueAfterFunctionFailure: true,
  });
  assert.equal(anyway.ok, false);
  assert.ok(deployed.includes(T.HOSTING) && !deployed.includes(SWEEP));
  assert.deepEqual(anyway.heldFunctions, [SWEEP]);
});

test('the sweep is held when the functions serve another commit, or a browser cannot reach a callable', async () => {
  const ran = (steps) => steps.filter((step) => step.group).flatMap((step) => step.group);
  for (const [why, checks] of [
    ['another commit', { verifyBuildInfo: serving(OTHER), ensureCallableAccess: reachable }],
    ['an unreachable callable', { verifyBuildInfo: serving(HEAD), ensureCallableAccess: async () => ({ ok: false, checked: true, summary: { total: 3, failing: ['a'] }, grants: [], redeploy: [] }) }],
    ['no access checker at all', { verifyBuildInfo: serving(HEAD) }],
  ]) {
    const deployed = [];
    const outcome = await executeReleasePlan({
      steps: plan([HEARTBEAT, 'a', SWEEP], [T.HOSTING]),
      runner: async (step) => { deployed.push(step); return { ok: true, output: '' }; },
      ...checks,
    });
    assert.equal(outcome.ok, false, why);
    assert.ok(!ran(deployed).includes(SWEEP), `${why}: the sweep is not deployed`);
    assert.deepEqual(outcome.heldFunctions, [SWEEP], why);
    assert.ok(retryCommandFor(outcome).includes(SWEEP), `${why}: the finishing command ships it`);
  }
});

// --- which functions a change reaches: the import graph ---------------------
//
// Without --only or --functions, the release deploys the default-codebase
// functions whose code the diff changed (scripts/lib/functionsImportGraph.mjs):
// each export's loads are followed, lazy ones included, to the files they
// reach. Where the graph cannot be sure, every function deploys, and the plan
// says why. The fixture has the real codebase's shapes: an entry that merges
// index.js and a section entry and overrides one of index.js's exports,
// index.js's top-level requires and lazy loaders, a loader map, and the global
// setup every function runs.

const FIXTURE_LOADERS = Object.freeze([{
  file: 'functions/lib/planner.js', within: 'loadPlanner', map: 'ENTRIES', relativeTo: 'repository', describe: 'the fixture planner',
}]);

const fixtureFiles = {
  'package.json': JSON.stringify({ type: 'module' }),
  'firebase.json': JSON.stringify({
    hosting: { public: 'dist' },
    functions: [{ source: 'functions', codebase: 'default', predeploy: ['node scripts/stamp-functions.mjs --dir functions'] }],
  }),
  'functions/package.json': JSON.stringify({ main: 'main.js', type: 'commonjs' }),
  'functions/main.js': [
    "const { onCall } = require('firebase-functions/v2/https');",
    "const base = require('./index.js');",
    'Object.assign(exports, base);',
    "const { handlers, cloudFunctions: sectionFunctions } = require('./section.js');",
    'Object.assign(exports, sectionFunctions);',
    'const legacyPublish = base.publish;',
    'exports.publish = onCall(async (request) => handlers.split(request) || legacyPublish.run(request));',
  ].join('\n'),
  'functions/index.js': [
    "const { onCall } = require('firebase-functions/v2/https');",
    "const grading = require('./lib/grading.js');",
    "setGlobalOptions({ labels: require('./lib/labels.js').labels });",
    'const LIMIT = 5;',
    'let ingestionModule = null;',
    "async function ingestion() { if (!ingestionModule) ingestionModule = await import('./shared/ingestion.mjs'); return ingestionModule; }",
    'exports.submit = onCall(async (request) => (await ingestion()).ingest(request, LIMIT));',
    'exports.grade = onCall((request) => grading.grade(request));',
    "exports.review = onCall((request) => require('./lib/review.js').review(request));",
    'exports.publish = onCall(() => ({ published: true }));',
    "exports.plan = onCall((request) => require('./lib/planner.js').plan(request));",
    'exports.shadow = onCall((grading) => grading.grade());',
    "exports.quiet = onCall(() => 'quiet');",
  ].join('\n'),
  'functions/section.js': [
    "const { onCall } = require('firebase-functions/v2/https');",
    "const classroom = require('./lib/classroom.js');",
    'function split(request) { return classroom.publishSections(request); }',
    'const syncSection = onCall((request) => classroom.syncSection(request));',
    "const drainQueue = onCall(() => 'drained');",
    'module.exports = { handlers: { split }, cloudFunctions: { syncSection, drainQueue } };',
  ].join('\n'),
  'functions/lib/grading.js': "const { equivalent } = require('../shared/answerEquivalence.mjs');\nexports.grade = (request) => equivalent(request);",
  'functions/lib/review.js': "exports.review = async (request) => (await import('../shared/answerEquivalence.mjs')).equivalent(request);",
  'functions/lib/classroom.js': 'exports.syncSection = () => 1;\nexports.publishSections = () => 2;',
  'functions/lib/labels.js': "exports.labels = { 'mm-git-sha': 'unknown' };",
  'functions/lib/planner.js': [
    "const path = require('node:path');",
    "const ENTRIES = Object.freeze({ week: 'src/plan/week.js' });",
    'async function loadPlanner(root) {',
    '  return Promise.all(Object.keys(ENTRIES).map((name) => import(path.join(root, ENTRIES[name]))));',
    '}',
    "exports.plan = async () => (await loadPlanner('.')).length;",
  ].join('\n'),
  'src/plan/week.js': "import { schoolDays } from '../../functions/shared/calendar.mjs';\nexport const week = () => schoolDays();",
  'functions/shared/calendar.mjs': 'export const schoolDays = () => 5;',
  'functions/shared/ingestion.mjs': "import { verify } from './serverGrading/steps.mjs';\nexport * from './envelope.mjs';\nexport const ingest = (request) => verify(request);",
  'functions/shared/serverGrading/steps.mjs': 'export const verify = () => true;',
  'functions/shared/envelope.mjs': "export const STEP_KINDS = Object.freeze(['rewrite']);",
  'functions/shared/answerEquivalence.mjs': 'export const equivalent = () => true;',
  'functions/shared/browserOnly.mjs': 'export const shownInTheBrowser = true;',
  'functions/seeds/bank.json': '{"items":[]}',
};
const fixtureIndex = fixtureFiles['functions/index.js'];

// The selection for a diff from the fixture (plus `both`, in both versions) to
// the fixture with `edits` (null deletes a file).
const changeTo = (edits, { both = {}, loaders = FIXTURE_LOADERS } = {}) => {
  const before = mapSource({ ...fixtureFiles, ...both });
  const after = mapSource({ ...fixtureFiles, ...both, ...edits });
  const graph = buildFunctionsImportGraph({ source: after, computedLoaders: loaders });
  return selectFunctionsForChange({
    graph,
    changes: Object.keys(edits).map((file) => ({ file, before: before.read(file), after: after.read(file) })),
  });
};
// A change to the code of a file: one more export.
const edit = (file) => ({ [file]: `${fixtureFiles[file]}\n${file.endsWith('.mjs') ? 'export const edited = true;' : 'exports.edited = true;'}` });

test('the import graph follows every kind of load to the functions that make it', () => {
  const chosen = (edits) => {
    const selection = changeTo(edits);
    assert.deepEqual(selection.all, [], 'sure');
    return selection.functions;
  };
  // A static import, reached through index.js's lazy loader: import() in a function.
  assert.deepEqual(chosen(edit('functions/shared/serverGrading/steps.mjs')), ['submit']);
  // export * from.
  assert.deepEqual(chosen(edit('functions/shared/envelope.mjs')), ['submit']);
  // require() at the top of index.js, then a require() at the top of a lib
  // file; and import() inside a lib function.
  assert.deepEqual(chosen(edit('functions/shared/answerEquivalence.mjs')), ['grade', 'review']);
  // require() inside an export's handler.
  assert.deepEqual(chosen(edit('functions/lib/review.js')), ['review']);
  // A loader map: import(ENTRIES[name]) loads each file the map names, and what those import.
  assert.deepEqual(chosen(edit('src/plan/week.js')), ['plan']);
  assert.deepEqual(chosen(edit('functions/shared/calendar.mjs')), ['plan']);
  // An entry's exported members: the section entry's handler (through the
  // platform entry's publish) and one of its cloudFunctions, not the other.
  assert.deepEqual(chosen(edit('functions/lib/classroom.js')), ['publish', 'syncSection']);
  // A parameter that shadows a top-level binding is not a use of it.
  assert.deepEqual(chosen(edit('functions/lib/grading.js')), ['grade']);
});

test('in an entry file, a change reaches only the exports whose code uses it', () => {
  const index = (from, to) => ({ 'functions/index.js': fixtureIndex.replace(from, to) });
  // An export's own code.
  assert.deepEqual(changeTo(index('grading.grade(request)', 'grading.grade(request, 2)')).functions, ['grade']);
  // A constant: the exports that use it.
  assert.deepEqual(changeTo(index('const LIMIT = 5;', 'const LIMIT = 6;')).functions, ['submit']);
  // A lazy loader: the exports that call it.
  assert.deepEqual(changeTo(index("import('./shared/ingestion.mjs')", "import('./shared/ingestion.mjs').then((m) => m)")).functions, ['submit']);
  // index.js's publish, which the platform entry wraps through `base.publish`.
  const wrapped = changeTo(index('({ published: true })', '({ published: 1 })'));
  assert.deepEqual(wrapped.functions, ['publish']);
  assert.equal(wrapped.reasons.publish, 'uses exports.publish in index.js, which changed, via legacyPublish in main.js');
  // A comment or a blank line is not code.
  assert.deepEqual(changeTo(index('const LIMIT = 5;', '// Five at most.\n\nconst LIMIT = 5;')).functions, []);
  // A new export ships, and says so.
  const added = changeTo({ 'functions/index.js': `${fixtureIndex}\nexports.fresh = onCall(() => 'new');` });
  assert.deepEqual(added.functions, ['fresh']);
  assert.equal(added.reasons.fresh, 'is new in index.js');
});

test('when the graph cannot be sure, every function deploys, and the plan says why', () => {
  const unsure = (selection, pattern) => {
    assert.deepEqual(selection.functions, [], 'no partial list');
    assert.match(selection.all.join('\n'), pattern);
  };
  // A computed import that no loader map describes: it could load anything.
  unsure(changeTo(edit('functions/shared/envelope.mjs'), {
    both: { 'functions/lib/review.js': 'exports.review = async (request) => (await import(`../shared/${request.kind}.mjs`)).grade(request);' },
  }), /^lib\/review\.js:1 loads a computed path, so the graph cannot tell which files it loads$/m);
  // The loader map, once its loader is no longer where the description says.
  unsure(changeTo(edit('functions/shared/calendar.mjs'), { loaders: [{ ...FIXTURE_LOADERS[0], within: 'loadSomethingElse' }] }),
    /lib\/planner\.js:4 loads a computed path in loadPlanner/);
  // The codebase's manifest.
  unsure(changeTo({ 'functions/package.json': JSON.stringify({ main: 'main.js', type: 'commonjs', dependencies: { mathjs: '15.2.1' } }) }),
    /^functions\/package\.json changed: every function runs on/m);
  // firebase.json's settings for the default codebase, and a script its predeploy runs.
  const firebase = JSON.parse(fixtureFiles['firebase.json']);
  firebase.functions[0].ignore = ['node_modules', '*.local'];
  unsure(changeTo({ 'firebase.json': JSON.stringify(firebase) }), /firebase\.json's settings for the default codebase changed/);
  unsure(changeTo({ 'scripts/stamp-functions.mjs': 'export {};' }), /scripts\/stamp-functions\.mjs runs at the default codebase's predeploy/);
  // A data file no function imports: the functions code reads files by name.
  unsure(changeTo({ 'functions/seeds/bank.json': '{"items":[1]}' }), /seeds\/bank\.json is a data file no function loads by import/);
  // A module nothing imports, but whose name the code spells: it may be loaded by name.
  unsure(changeTo(edit('functions/shared/browserOnly.mjs'), {
    both: { 'functions/lib/classroom.js': "exports.syncSection = () => 'shared/browserOnly.mjs';\nexports.publishSections = () => 2;" },
  }), /shared\/browserOnly\.mjs is loaded by no function the graph can see, but its name is spelled in lib\/classroom\.js/);
  // A top-level statement every function runs, and what it loads.
  unsure(changeTo({ 'functions/index.js': fixtureIndex.replace('setGlobalOptions({ labels:', "setGlobalOptions({ memory: '1GiB', labels:") }),
    /^a top-level statement of index\.js changed \(line 3\), and every function runs it$/m);
  unsure(changeTo(edit('functions/lib/labels.js')), /^lib\/labels\.js changed, and every function loads it/m);

  // The same module, imported by nothing and named by nothing, is the browser's alone.
  const browser = changeTo(edit('functions/shared/browserOnly.mjs'));
  assert.deepEqual([browser.all, browser.functions], [[], []]);
  assert.match(browser.notes.join('\n'), /shared\/browserOnly\.mjs: no function loads it/);
  // So is a module only an uncalled loader imports: its path is a load that no
  // function makes, not a name the code reads files by.
  const retired = changeTo({ 'functions/shared/retired.mjs': 'export const retired = false;' }, {
    both: {
      'functions/index.js': `${fixtureIndex}\nasync function retiredLoader() { return import('./shared/retired.mjs'); }`,
      'functions/shared/retired.mjs': 'export const retired = true;',
    },
  });
  assert.deepEqual([retired.all, retired.functions], [[], []]);
  assert.match(retired.notes.join('\n'), /shared\/retired\.mjs: no function loads it/);

  // firebase.json: the functions target is planned only for its functions settings.
  const settings = firebaseFunctionsSettingsChanged(fixtureFiles['firebase.json'], JSON.stringify(firebase));
  assert.deepEqual(settings, { default: true, 'path-admin': false });
  assert.deepEqual(classifyChangedFiles(['firebase.json'], { functionsSettings: settings }).targets, [T.FUNCTIONS, T.HOSTING]);
  const hostingOnly = { ...JSON.parse(fixtureFiles['firebase.json']), hosting: { public: 'build' } };
  assert.deepEqual(classifyChangedFiles(['firebase.json'], { functionsSettings: firebaseFunctionsSettingsChanged(fixtureFiles['firebase.json'], JSON.stringify(hostingOnly)) }).targets, [T.HOSTING]);

  // An unsure selection is the whole fleet: the release passes no list.
  assert.deepEqual(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['a', 'b', B], selectedFunctions: null }).flatMap((step) => step.group || []), ['a', 'b', B]);
});

test('a docs-only change deploys nothing, and neither does a comment or a note under functions/', () => {
  const { targets } = classifyChangedFiles(['docs/handoffs/RELEASE.md', 'README.md', 'tests/platform/releasePlan.test.mjs']);
  assert.deepEqual(targets, []);
  assert.deepEqual(buildReleasePlan({ targets, allFunctions: ['submit', B], expectedGitSha: HEAD }), []);

  const quiet = changeTo({
    'functions/shared/envelope.mjs': `// The step kinds the server reads.\n${fixtureFiles['functions/shared/envelope.mjs']}`,
    'functions/NOTES.md': '# notes',
  });
  assert.deepEqual([quiet.all, quiet.functions], [[], []]);
  assert.match(quiet.notes.join('\n'), /shared\/envelope\.mjs: only comments or formatting changed/);
  assert.match(quiet.notes.join('\n'), /NOTES\.md: not loaded by the deployed code/);
  // A plan of no functions has no functions steps, so no verify step either.
  assert.deepEqual(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['submit', B], selectedFunctions: quiet.functions, expectedGitSha: HEAD }), []);
  // ...and a plan of some has those, and platformBuildInfo.
  assert.deepEqual(buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['submit', 'grade', B], selectedFunctions: ['grade'], expectedGitSha: HEAD })
    .filter((step) => step.target === T.FUNCTIONS).map((step) => step.group), [['grade', B]]);
});

test('the plan prints each chosen function with its reason, or why it chose them all', () => {
  const selection = changeTo(edit('functions/shared/answerEquivalence.mjs'));
  assert.equal(selection.reasons.grade, 'imports shared/answerEquivalence.mjs via grading in index.js → lib/grading.js');
  assert.equal(selection.reasons.review, 'imports shared/answerEquivalence.mjs via lib/review.js');
  assert.deepEqual(functionSelectionLines({ selection, total: 9 }), [
    `Functions: 2 of 9, each for what it loads (${B} ships with every functions release):`,
    '  grade   imports shared/answerEquivalence.mjs via grading in index.js → lib/grading.js',
    '  review  imports shared/answerEquivalence.mjs via lib/review.js',
  ]);
  assert.deepEqual(functionSelectionLines({ selection: { all: ['functions/package.json changed: x'], functions: [], reasons: {}, notes: [] }, total: 9 }), [
    'Functions: all 9. The import graph cannot be sure which functions this diff reaches:',
    '  - functions/package.json changed: x',
  ]);
  assert.deepEqual(functionSelectionLines({ selection: { all: [], functions: [], reasons: {}, notes: ['shared/x.mjs: only comments or formatting changed'] }, total: 9 }), [
    'Functions: none of 9. No function loads code this diff changed.',
    '  (no function: shared/x.mjs: only comments or formatting changed)',
  ]);
  // Every chosen function is printed; the rest is cut short, and says so.
  const long = functionSelectionLines({ selection: { all: Array.from({ length: 12 }, (_, n) => `reason ${n}`), functions: [], reasons: {}, notes: [] }, total: 9 });
  assert.equal(long.length, 1 + 8 + 1);
  assert.equal(long.at(-1), '  ... and 4 more (in the release report)');
  assert.deepEqual(functionSelectionLines({ mode: 'named', named: ['a', 'b'] }), [`Functions: the 2 named by --functions (and ${B}).`]);
  assert.deepEqual(functionSelectionLines({ mode: 'only', total: 9 }), ['Functions: all 9, as --only functions asks, whatever the diff changed.']);

  // The release plans what the graph chose, prints it before its steps, and
  // asks the graph only when neither --only nor --functions decided.
  const source = readFileSync(new URL('../../scripts/release-firebase.mjs', import.meta.url), 'utf8');
  assert.match(region(source, 'steps = buildReleasePlan({', '});', 'the buildReleasePlan call'), /selectedFunctions: selection && !selection\.all\.length \? selection\.functions : null,/);
  assert.match(region(source, 'const functionsMode =', ';', 'the functions mode'), /functionNames\?\.length \? 'named'\s*: only \? 'only' : 'graph'/);
  const printed = source.indexOf('functionSelectionLines({ selection, total: inventory.length, mode: functionsMode');
  assert.ok(printed > -1 && printed < source.indexOf("console.log('\\nSteps, in order:');"), 'printed before the steps');
});

// The real codebase, read from this checkout.
let realGraph = null;
const real = () => {
  realGraph ||= buildFunctionsImportGraph({ source: fsSource() });
  return realGraph;
};
const realInventory = () => listDeployableFunctions().functions.map((fn) => fn.name);

test('the real codebase: the graph finds every deployable function, follows the weekly planner, and is sure', async () => {
  const graph = real();
  const names = realInventory();
  assert.deepEqual(names.filter((name) => !graph.exportNode(name)), []);
  names.forEach((name) => graph.closure(name));
  assert.deepEqual(graph.uncertain, []);
  // What every function runs is the global setup, not the graders.
  const everyone = [...graph.globalClosure().keys()];
  assert.ok(everyone.includes('functions/lib/deployProvenance.js'), everyone.join(', '));
  assert.ok(!everyone.some((node) => node.startsWith('functions/shared/')), everyone.join(', '));
  // The weekly planner's computed import: the server plans with the browser's
  // planner, all of what the freeze vendors (the planner's own walk of it,
  // which decides that a change to one of these files is a functions change).
  const planner = graph.closure('resolveWeeklyPathGoalSnapshot');
  assert.ok(planner.has('src/platform/path/weeklyPathPlan.js'));
  const { plannerClosure } = await import('../../scripts/sync-functions-weekly-planner.mjs');
  assert.deepEqual(plannerClosure().filter((file) => !planner.has(file)), []);
});

test('a change to one leaf grader deploys the functions that bundle it', () => {
  const graph = real();
  const file = 'functions/shared/serverGrading/gradingResult.mjs';
  const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(text, /\bfrom\s*['"]\.|import\(\s*['"]\./, 'a leaf: it imports nothing');
  const inventory = realInventory();
  const selection = selectFunctionsForChange({ graph, inventory, changes: [{ file, before: text, after: `${text}\nexport const edited = true;\n` }] });
  assert.deepEqual(selection.all, []);
  for (const name of ['ingestStudentSubmissions', 'inspectStudentResponse', 'syncGradeToClassroom', 'syncSectionGradeToClassroom', 'submitSecureExamResponse']) {
    assert.ok(selection.functions.includes(name), `${name} bundles the server grader`);
  }
  for (const name of ['createLiveChallenge', 'listClasses', 'getGoogleAuthUrl']) assert.ok(!selection.functions.includes(name), `${name} grades nothing`);
  assert.ok(selection.functions.length < inventory.length / 4, `${selection.functions.length} of ${inventory.length}`);
  selection.functions.forEach((name) => assert.match(selection.reasons[name], /^imports shared\/serverGrading\/gradingResult\.mjs via /, name));
});

test('a change inside one export of the real index.js deploys that export, and the platform entry follows index.js through base', () => {
  const graph = real();
  const file = 'functions/index.js';
  const text = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const inventory = realInventory();
  // The real file, with one export's value wrapped: `exports.X = (0, value)`.
  const wrap = (name) => {
    const { start, end } = graph.entryAnalysis(file).byKey.get(`exports.${name}`).node.expression.right;
    return `${text.slice(0, start)}(0, ${text.slice(start, end)})${text.slice(end)}`;
  };
  const reached = (name) => selectFunctionsForChange({ graph, inventory, changes: [{ file, before: wrap(name), after: text }] });
  assert.deepEqual(reached('queueClassroomGradeCheckpoints').functions, ['queueClassroomGradeCheckpoints']);
  const wrapped = reached('publishAssignmentToClassrooms');
  assert.deepEqual(wrapped.functions, ['publishAssignmentToClassrooms']);
  assert.match(wrapped.reasons.publishAssignmentToClassrooms, /^uses exports\.publishAssignmentToClassrooms in index\.js, which changed, via legacyPublishAssignmentToClassrooms in platformEntry\.js/);
});
