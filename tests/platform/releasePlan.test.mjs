// THE RELEASE PLAN: SCOPE, ORDER, PACING, RETRIES AND WHAT STOPS A RELEASE.
//
// scripts/release-firebase.mjs executes what these modules decide. Everything
// is pure or takes an injected runner, so the cases below include a quota
// storm and a broken function without any Firebase at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RELEASE_TARGETS as T,
  buildReleasePlan,
  classifyChangedFiles,
  classifyDeployFailure,
  deployCommandFor,
  retryDelaySeconds,
} from '../../scripts/lib/releasePlan.mjs';
import { executeReleasePlan } from '../../scripts/lib/releaseExecutor.mjs';
import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';

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

test('the order is indexes, functions, path admin, rules, database, then Hosting', () => {
  const steps = buildReleasePlan({
    targets: [T.HOSTING, T.RULES, T.FUNCTIONS, T.INDEXES, T.PATH_ADMIN],
    allFunctions: ['a', 'b', 'c'],
    groupSize: 2,
  });
  assert.deepEqual(steps.map((step) => step.label), [
    T.INDEXES, 'functions group 1/2', 'functions group 2/2', T.PATH_ADMIN, T.RULES, T.HOSTING,
  ]);
  assert.deepEqual(steps.filter((step) => step.target === T.FUNCTIONS).map((step) => step.group), [['a', 'b'], ['c']]);
});

test('exact function names are checked against the real inventory', () => {
  assert.throws(() => buildReleasePlan({ targets: [T.FUNCTIONS], allFunctions: ['a'], functionNames: ['a', 'typo'] }), /typo/);
  const steps = buildReleasePlan({ targets: [], only: [T.FUNCTIONS], allFunctions: ['a', 'b'], functionNames: ['b'] });
  assert.deepEqual(steps.map((step) => step.group), [['b']]);
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

const plan = (names, extra = []) => buildReleasePlan({ targets: [T.FUNCTIONS, ...extra], allFunctions: names, groupSize: 4 });

test('a quota storm is waited out and the release completes', async () => {
  let calls = 0;
  const waits = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a', 'b', 'c', 'd', 'e'], [T.RULES, T.HOSTING]),
    runner: async () => { calls += 1; return calls <= 2 ? { ok: false, output: 'HTTP Error: 429, Quota exceeded' } : { ok: true, output: '' }; },
    sleep: async (seconds) => { waits.push(seconds); },
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.failedFunctions, []);
  assert.ok(waits.includes(retryDelaySeconds('quota', 1)) && waits.includes(retryDelaySeconds('quota', 2)), `waits ${waits}`);
  assert.ok(waits.includes(45), 'paused between function groups');
  assert.deepEqual(outcome.results.map((result) => result.target).slice(-2), [T.RULES, T.HOSTING]);
});

test('one broken function is isolated by splitting its group, and the rest still ship', async () => {
  const deployed = [];
  const outcome = await executeReleasePlan({
    steps: plan(['a', 'b', 'c', 'broken', 'e'], [T.RULES, T.HOSTING]),
    runner: async (step) => {
      if (step.group?.includes('broken')) return { ok: false, output: 'ReferenceError: activeSkillCode is not defined' };
      deployed.push(...(step.group || [step.target]));
      return { ok: true, output: '' };
    },
  });
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.failedFunctions, [{ name: 'broken', failure: 'code' }]);
  assert.deepEqual(deployed.filter((name) => name.length === 1).sort(), ['a', 'b', 'c', 'e']);
  // A code failure is not retried in place — it is split straight away.
  assert.ok(outcome.results.every((result) => result.attempts.length === 1 || result.ok));
  // The new client may call the broken function: rules and Hosting wait.
  assert.ok(!deployed.includes(T.RULES) && !deployed.includes(T.HOSTING));
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.RULES, T.HOSTING]);
});

test('an operator may ship rules and Hosting anyway, deliberately', async () => {
  const deployed = [];
  const outcome = await executeReleasePlan({
    steps: plan(['broken'], [T.HOSTING]),
    runner: async (step) => (step.group?.includes('broken') ? { ok: false, output: 'SyntaxError' } : (deployed.push(step.target), { ok: true, output: '' })),
    continueAfterFunctionFailure: true,
  });
  assert.equal(outcome.ok, false);
  assert.deepEqual(deployed, [T.HOSTING]);
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
