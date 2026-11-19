// THE RELEASE SCRIPT AFTER THE READINESS REVIEW OF 2026-11-19
// (docs/reviews/2026-11-release-readiness.md, F1 to F3).
//
// F3: functions that read what other functions write ship before the writers,
//     and if one of them does not deploy, no later function group ships.
// F2: the report is written before the first step and after every step, with
//     the command that finishes a run cut off part-way.
// F1: every rollback step the report prints is runnable as written, or says
//     it is not available.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCESS_FUNCTIONS,
  BUILD_INFO_FUNCTION as B,
  DEPLOY_EARLY_FUNCTIONS,
  DEPLOY_FIRST_FUNCTIONS,
  DEPLOY_LAST_FUNCTIONS,
  ONE_WAY_CHANGES,
  RELEASE_TARGETS as T,
  TARGET_ALIASES,
  VERIFY_FUNCTIONS,
  buildReleasePlan,
  releaseScope,
  resumeCommandFor,
  retryCommandFor,
  rollbackSteps,
} from '../../scripts/lib/releasePlan.mjs';
import { executeReleasePlan } from '../../scripts/lib/releaseExecutor.mjs';
import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';
import { region } from './helpers/sourceContract.mjs';

const HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
const [HEARTBEAT] = DEPLOY_FIRST_FUNCTIONS;
const [SWEEP] = DEPLOY_LAST_FUNCTIONS;
const [TRIGGER, SECTION_TRIGGER, INSPECTOR] = DEPLOY_EARLY_FUNCTIONS;

const serving = (gitSha) => async () => ({
  url: 'https://us-central1-p.cloudfunctions.net/platformBuildInfo',
  reachable: true,
  status: 200,
  body: { result: { codebase: 'default', gitSha, gitShaShort: gitSha.slice(0, 12), treeClean: true, writtenAt: '2026-11-19T00:00:00.000Z' } },
  error: null,
});
const reachable = async () => ({ ok: true, checked: true, summary: { total: 3, failing: [] }, grants: [], redeploy: [] });

const fleet = ['ingestStudentSubmissions', 'finalizeStudentResponseCheckpoints', TRIGGER, 'a', HEARTBEAT, SECTION_TRIGGER, INSPECTOR, SWEEP, B];
const plan = (extra = [T.HOSTING], groupSize = 4) => buildReleasePlan({
  targets: [T.FUNCTIONS, ...extra], allFunctions: fleet, groupSize, expectedGitSha: HEAD,
});

// --- F3: readers before writers --------------------------------------------

test('the Classroom triggers and the Inspector ship together after the heartbeat, before every function that writes what they read', () => {
  assert.deepEqual([...DEPLOY_EARLY_FUNCTIONS], ['syncGradeToClassroom', 'syncSectionGradeToClassroom', 'inspectStudentResponse']);
  const steps = plan();
  const deploys = steps.filter((step) => step.target === T.FUNCTIONS);
  assert.deepEqual(deploys.map((step) => step.group), [
    [HEARTBEAT],
    [TRIGGER, SECTION_TRIGGER, INSPECTOR],
    ['ingestStudentSubmissions', 'finalizeStudentResponseCheckpoints', 'a', B],
    [SWEEP],
  ]);
  assert.deepEqual(deploys.filter((step) => step.early).map((step) => step.group), [[TRIGGER, SECTION_TRIGGER, INSPECTOR]]);
  assert.ok(!deploys[0].early && deploys[0].deployFirst, 'the heartbeat is still first, and alone');
  assert.ok(deploys.at(-1).afterChecks, 'the sweep is still last, after the checks');
  // Named, they keep the order: asked for with a writer, the readers go first.
  const named = buildReleasePlan({
    targets: [], only: [T.FUNCTIONS], allFunctions: fleet, functionNames: ['ingestStudentSubmissions', INSPECTOR], expectedGitSha: HEAD,
  });
  assert.deepEqual(named.filter((step) => step.target === T.FUNCTIONS).map((step) => step.group), [[INSPECTOR], ['ingestStudentSubmissions', B]]);

  // The real default codebase exports all three, and plans them second.
  const names = listDeployableFunctions().functions.map((fn) => fn.name);
  DEPLOY_EARLY_FUNCTIONS.forEach((name) => assert.ok(names.includes(name), `${name} is a default-codebase function`));
  const real = buildReleasePlan({ targets: [T.FUNCTIONS, T.HOSTING], allFunctions: names, expectedGitSha: HEAD });
  const realDeploys = real.filter((step) => step.target === T.FUNCTIONS);
  assert.deepEqual([...realDeploys[1].group].sort(), [...DEPLOY_EARLY_FUNCTIONS].sort());
  assert.ok(realDeploys.slice(2).every((step) => !step.group.some((name) => DEPLOY_EARLY_FUNCTIONS.includes(name))));
  const ingestion = realDeploys.findIndex((step) => step.group.includes('ingestStudentSubmissions'));
  assert.ok(ingestion > 1, 'the ingestion function ships after the triggers');
});

test('an early function that does not deploy holds every later functions group, and nothing else ships', async () => {
  const deployed = [];
  const lines = [];
  const runner = async (step) => {
    if (step.group?.includes(SECTION_TRIGGER)) return { ok: false, output: 'SyntaxError: Unexpected token )' };
    deployed.push(...(step.group || [step.target]));
    return { ok: true, output: '' };
  };
  const outcome = await executeReleasePlan({
    steps: plan(), runner, verifyBuildInfo: serving(HEAD), ensureCallableAccess: reachable, log: (line) => lines.push(line),
  });
  assert.equal(outcome.ok, false);
  // The group was split to name the broken one; the other two readers shipped.
  assert.deepEqual(outcome.failedFunctions.map((entry) => entry.name), [SECTION_TRIGGER]);
  assert.ok(deployed.includes(TRIGGER) && deployed.includes(INSPECTOR));
  for (const writer of ['ingestStudentSubmissions', 'finalizeStudentResponseCheckpoints', 'a', B, SWEEP, T.HOSTING]) {
    assert.ok(!deployed.includes(writer), `${writer} is not deployed`);
  }
  assert.deepEqual(outcome.heldFunctions, ['ingestStudentSubmissions', 'finalizeStudentResponseCheckpoints', 'a', B, SWEEP]);
  assert.deepEqual(outcome.stoppedBeforeTargets, [T.HOSTING]);
  assert.equal(outcome.verification.status, 'skipped');
  assert.equal(lines.filter((line) => line.startsWith('Holding every later functions group')).length, 1, 'said once');
  assert.equal(retryCommandFor(outcome),
    `node scripts/release-firebase.mjs --execute --functions ${SECTION_TRIGGER},ingestStudentSubmissions,finalizeStudentResponseCheckpoints,a,${B},${SWEEP}`
    + ' && node scripts/release-firebase.mjs --execute --only hosting');

  // Shipping Hosting anyway is about Hosting: the writers are still held.
  deployed.length = 0;
  const anyway = await executeReleasePlan({
    steps: plan(), runner, verifyBuildInfo: serving('decade00decade00decade00decade00decade00'), ensureCallableAccess: reachable, continueAfterFunctionFailure: true,
  });
  assert.equal(anyway.ok, false);
  assert.ok(deployed.includes(T.HOSTING));
  assert.ok(!deployed.includes('ingestStudentSubmissions') && !deployed.includes(SWEEP));
});

test('when the readers ship, the release runs in the planned order', async () => {
  const order = [];
  const outcome = await executeReleasePlan({
    steps: plan(),
    runner: async (step) => { order.push(step.group ? step.group.join('+') : step.target); return { ok: true, output: '' }; },
    verifyBuildInfo: async () => { order.push('verify'); return serving(HEAD)(); },
    ensureCallableAccess: async () => { order.push('access'); return reachable(); },
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(order, [
    HEARTBEAT, `${TRIGGER}+${SECTION_TRIGGER}+${INSPECTOR}`, `ingestStudentSubmissions+finalizeStudentResponseCheckpoints+a+${B}`, 'verify', 'access', SWEEP, T.HOSTING,
  ]);
});

// --- F2: the report as the release runs, and the command that finishes it ---

// The command's own arguments, planned again as the script plans them.
const planFromCommand = (command) => {
  const args = command.split(' ');
  const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1].split(',') : null);
  const functionNames = value('--functions');
  // As the script reads --only: its spellings mapped to targets.
  const only = value('--only')?.map((name) => TARGET_ALIASES[name] || name) || null;
  return buildReleasePlan({
    targets: [], allFunctions: fleet, functionNames, only: releaseScope({ only, functionNames }), groupSize: 4, expectedGitSha: HEAD,
  });
};

test('the report is kept after every step, and what it says finishes a run cut off there', async () => {
  const steps = plan([T.INDEXES, T.RULES, T.HOSTING]);
  const snapshots = [];
  const outcome = await executeReleasePlan({
    steps,
    runner: async () => ({ ok: true, output: '' }),
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: reachable,
    onProgress: (state) => snapshots.push(state),
  });
  assert.equal(outcome.ok, true);
  // Before the first step, and after each one.
  assert.equal(snapshots.length, steps.length + 1);
  assert.deepEqual(snapshots[0].remaining.map((step) => step.label), steps.map((step) => step.label));
  assert.deepEqual(snapshots.at(-1).remaining, []);
  assert.equal(resumeCommandFor(snapshots.at(-1)), null, 'nothing left to finish');

  // Cut off before anything ran: the whole plan, in its order.
  const whole = resumeCommandFor(snapshots[0]);
  assert.equal(whole, `node scripts/release-firebase.mjs --execute --functions ${HEARTBEAT},${TRIGGER},${SECTION_TRIGGER},${INSPECTOR},ingestStudentSubmissions,finalizeStudentResponseCheckpoints,a,${B},${SWEEP} --only indexes,rules,hosting`);
  assert.deepEqual(planFromCommand(whole).map((step) => step.label), steps.map((step) => step.label), 'planned again, it is the same release');

  // Cut off after the readers shipped: the rest, still with the indexes first.
  const afterReaders = snapshots.find((state) => state.results.some((result) => result.group?.includes(INSPECTOR)));
  const rest = resumeCommandFor(afterReaders);
  assert.equal(rest, `node scripts/release-firebase.mjs --execute --functions ingestStudentSubmissions,finalizeStudentResponseCheckpoints,a,${B},${SWEEP} --only rules,hosting`);
  assert.deepEqual(planFromCommand(rest).map((step) => step.group || step.target), [
    ['ingestStudentSubmissions', 'finalizeStudentResponseCheckpoints', 'a', B], VERIFY_FUNCTIONS, ACCESS_FUNCTIONS, [SWEEP], T.RULES, T.HOSTING,
  ]);

  // Cut off at the checks: redeploying platformBuildInfo runs them again.
  const atChecks = snapshots.find((state) => state.remaining[0]?.target === VERIFY_FUNCTIONS);
  assert.equal(resumeCommandFor({ ...atChecks, remaining: atChecks.remaining.filter((step) => step.target !== T.FUNCTIONS) }),
    `node scripts/release-firebase.mjs --execute --functions ${B} --only rules,hosting`);
  // Only targets left.
  assert.equal(resumeCommandFor({ remaining: [{ target: T.HOSTING, label: T.HOSTING }] }), 'node scripts/release-firebase.mjs --execute --only hosting');
  // A function that failed or was held is finished too.
  assert.equal(resumeCommandFor({ failedFunctions: [{ name: 'broken' }], heldFunctions: [SWEEP], remaining: [] }),
    `node scripts/release-firebase.mjs --execute --functions broken,${SWEEP}`);
});

test('a report that cannot be written never stops the release', async () => {
  const outcome = await executeReleasePlan({
    steps: plan(),
    runner: async () => ({ ok: true, output: '' }),
    verifyBuildInfo: serving(HEAD),
    ensureCallableAccess: reachable,
    onProgress: () => { throw new Error('disk full'); },
  });
  assert.equal(outcome.ok, true);
});

// --- F1: rollback steps that are real --------------------------------------

const BASE = '1111111111111111111111111111111111111111';
const FUNCTIONS_BASE = '2222222222222222222222222222222222222222';

test('every rollback step is runnable as written, from the commit each part really ran', () => {
  const steps = rollbackSteps({
    project: 'p', base: BASE, liveBuild: { gitSha: BASE }, functionsBase: FUNCTIONS_BASE, plannedFunctions: ['a', 'b'], inventoryCount: 9,
  });
  // A checkout of an older commit is behind main: its own provenance check needs the override.
  assert.match(steps.hosting, new RegExp(`git checkout ${BASE} && MATHMASTER_DEPLOY_ALLOW_BEHIND_MAIN=1 npm run deploy:hosting`));
  assert.match(steps.functions, new RegExp(`git checkout ${FUNCTIONS_BASE}`), 'the functions\' own commit, not Hosting\'s');
  assert.match(steps.functions, /MATHMASTER_DEPLOY_ALLOW_BEHIND_MAIN=1 node scripts\/release-firebase\.mjs --execute --only functions/);
  // That commit's script may be older than #572: --functions always goes with --only functions.
  assert.match(steps.functions, /--functions <names> --only functions/);
  assert.doesNotMatch(steps.functions, /--since/);
  assert.match(steps.rules, /Only together with Hosting/);
  assert.match(steps.rules, /git checkout HEAD -- firestore\.rules/);
  assert.match(steps.pathAdmin, /MATHMASTER_DEPLOY_ALLOW_BEHIND_MAIN=1 node scripts\/release-firebase\.mjs --execute --only path-admin/);
  assert.match(steps.indexes, /Not needed/);
  assert.match(steps.addedFunctions, /npx firebase functions:delete <name> --project p/);

  // Without the functions' commit, Hosting's, and where to look for the real one.
  const unknown = rollbackSteps({ project: 'p', base: BASE, liveBuild: { gitSha: BASE } });
  assert.match(unknown.functions, new RegExp(`git checkout ${BASE}`));
  assert.match(unknown.functions, /--whats-live/);
  assert.doesNotMatch(unknown.functions, /<names>/, 'a whole-fleet release names no subset');
});

test('a functions rollback past the grades split is not available, and the report says so', () => {
  const [split] = ONE_WAY_CHANGES;
  assert.match(split.commit, /^[0-9a-f]{40}$/);
  assert.match(split.name, /#561/);
  const steps = rollbackSteps({ project: 'p', base: BASE, liveBuild: { gitSha: BASE }, crossed: [split] });
  assert.match(steps.functions, /^Not available to 111111111111: this release crosses the grades split \(#561\)\./);
  assert.match(steps.functions, /Roll forward instead\.$/);
  assert.doesNotMatch(steps.functions, /git checkout/);
  // Hosting's step stays real.
  assert.match(steps.hosting, /npm run deploy:hosting/);
});

test('the release writes its report as it goes, and asks what the functions ran before it changes them', () => {
  const source = readFileSync(new URL('../../scripts/release-firebase.mjs', import.meta.url), 'utf8');
  const call = region(source, 'const outcome = await executeReleasePlan({', '\n});', 'the executeReleasePlan call');
  assert.match(call, /onProgress: \(state\) => writeReport\(\{[\s\S]*inProgress: true,[\s\S]*resumeCommand: resumeCommandFor\(state\),/);
  // Written whole, then renamed into place.
  const write = region(source, 'const writeReport = (report) => {', '\n};', 'writeReport');
  const whole = write.indexOf('writeFileSync(`${reportPath}.tmp`, `${JSON.stringify(report, null, 2)}\\n`);');
  assert.ok(whole > -1 && whole < write.indexOf('renameSync(`${reportPath}.tmp`, reportPath);'), 'written to a temporary file, then renamed');
  assert.match(source, /const report = \{\s*\.\.\.baseReport\(\),\s*inProgress: false,/);
  assert.match(source, /\bwriteReport\(report\);/);
  // The rollback comes from rollbackSteps, with the changes this release crosses.
  assert.match(source, /const rollback = rollbackSteps\(\{[\s\S]*functionsBase,[\s\S]*crossed,[\s\S]*\}\);/);
  assert.match(source, /const crossed = ONE_WAY_CHANGES\.filter\(/);
  // The functions' commit is asked for only when the release runs, after its gates.
  const asked = source.indexOf('const functionsBefore = plannedFunctions.length ? await callBuildInfo(');
  assert.ok(asked > source.indexOf("if (!EXECUTE) {"), 'not in a plan-only run');
  assert.ok(asked > source.indexOf("gate('Deploy provenance"), 'after the provenance gate');
  assert.ok(asked < source.indexOf('const outcome = await executeReleasePlan({'), 'before anything deploys');
  // The plan says which functions go before the writers.
  assert.match(source, /const shipsEarly = steps\.filter\(\(step\) => step\.early\)/);
});
