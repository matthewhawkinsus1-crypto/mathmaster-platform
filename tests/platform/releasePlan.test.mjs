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
  RELEASE_TARGETS as T,
  VERIFY_FUNCTIONS,
  assessBuildInfoResponse,
  buildInfoRequest,
  buildReleasePlan,
  classifyChangedFiles,
  classifyDeployFailure,
  deployCommandFor,
  describeStep,
  retryCommandFor,
  retryDelaySeconds,
  summarizeFunctionLabels,
} from '../../scripts/lib/releasePlan.mjs';
import { executeReleasePlan } from '../../scripts/lib/releaseExecutor.mjs';
import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';
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
