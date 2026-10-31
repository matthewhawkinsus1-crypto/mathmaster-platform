import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { region } from './helpers/sourceContract.mjs';

/*
 * A COURSE TEST'S ANSWERS: THE SAME HOLD, READ CHEAPLY (PF03).
 *
 * The correct answers and worked solutions of a course Test stay held while
 * anyone who can still sit the stage has not submitted and no teacher's
 * release covers their attempt (answersReleaseVerdict, moved unchanged out of
 * functions/index.js courseAnswersRelease). A student in Corrections with
 * "Review my Test" open asked every 30 seconds, and every ask read the whole
 * cycle's records.
 *
 * The re-check now asks about the student the last full check found holding
 * the answers. These tests hold it to the full rule:
 *
 *   - asked about any one student, holderStillHolds says yes exactly when the
 *     full rule names that student (random cycles, both stages, releases that
 *     cover some attempts, stale keys, record holders off the roster);
 *   - while the remembered student holds them, no full read happens and the
 *     answer is "held" — which the full rule says too; once they do not, the
 *     full read runs and the answer is the full rule's; "released" is never
 *     answered from memory.
 */

const require_ = createRequire(import.meta.url);
const testCycleLib = require_('../../functions/lib/testCycle.js');
const {
  answerCoverageKey,
  answersReleaseVerdict,
  createCourseAnswersHold,
  holderStillHolds,
  onTestCycleRoster,
} = require_('../../functions/lib/testCycleAnswersHold.js');

const shared = await testCycleLib.shared();
const ASSIGNMENT = 'asg-hold';
const STATES = Object.values(shared.record.SESSION_STATE);
const POLICIES = [
  shared.policy.defaultTestCyclePolicy(),
  shared.policy.normalizeTestCyclePolicy({ mode: shared.policy.TEST_CYCLE_MODE, passingScore: 85 }),
  shared.policy.normalizeTestCyclePolicy({ mode: shared.policy.TEST_CYCLE_MODE, externalAssessment: { source: 'District benchmark' } }),
];

// A small deterministic generator, so a failure names a reproducible case.
const generator = (seed) => {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return {
    next,
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
};

const randomStage = (rng) => {
  const state = rng.pick(STATES);
  return {
    state,
    attempt: rng.pick([1, 1, 2]),
    examSessionId: state === 'none' ? null : `session-${Math.floor(rng.next() * 1000)}`,
    rawScore: ['submitted', 'released'].includes(state) ? rng.pick([null, 35, 64, 70, 92]) : null,
  };
};

const randomRecord = (rng, studentId) => ({
  assignmentId: ASSIGNMENT,
  studentId,
  test: randomStage(rng),
  retest: randomStage(rng),
  review: { complete: rng.chance(0.6) },
  corrections: { required: rng.chance(0.5), waived: rng.chance(0.2), complete: rng.chance(0.4) },
  teacherControls: { retestDisabled: rng.chance(0.2), correctionsWaived: rng.chance(0.15), retestUnlocked: rng.chance(0.15) },
  ...(rng.chance(0.15) ? { externalAssessment: { originalScore: rng.pick([40, 90]) } } : {}),
});

/** One cycle: who is on the roster, who holds a record, what was released. */
const randomCycle = (seed) => {
  const rng = generator(seed);
  const students = Array.from({ length: 2 + Math.floor(rng.next() * 9) }, (_, index) => `s${seed}-${index}`);
  const records = new Map();
  const roster = [];
  students.forEach((studentId) => {
    // On the roster with or without a record; or a record holder who moved class.
    const where = rng.pick(['roster', 'both', 'both', 'record']);
    if (where !== 'record') roster.push(studentId);
    if (where !== 'roster') records.set(studentId, randomRecord(rng, studentId));
  });
  const stage = rng.pick(['test', 'retest']);
  const policy = rng.pick(POLICIES);
  // The keys a release could name: each student's current attempts, and a
  // stale attempt (a reset since the release).
  const keysOf = (studentId) => {
    const record = shared.record.normalizeTestCycleRecord(records.get(studentId) || { assignmentId: ASSIGNMENT, studentId });
    return [answerCoverageKey(record), `${studentId}#9.9`];
  };
  const kind = rng.pick(['none', 'covering', 'covering', 'unconfirmed', 'notReleased']);
  const coveredKeys = students.flatMap(keysOf).filter(() => rng.chance(0.45));
  const release = kind === 'none' ? null
    : kind === 'covering' ? { releasedAt: 1700000000000, coveredKeys }
      // An earlier release named students, not attempts: it covers nobody.
      : kind === 'unconfirmed' ? { releasedAt: 1700000000000 }
        // Keys with no release time are not a release.
        : { coveredKeys };
  return { students, records, roster, stage, policy, release };
};

// What the server would read about one student, as courseAnswersHeld reads it.
const factsFor = (cycle, studentId) => ({
  release: cycle.release,
  recordData: cycle.records.get(studentId) || null,
  onRoster: cycle.records.has(studentId) ? false : cycle.roster.includes(studentId),
});

const fullVerdict = (cycle) => answersReleaseVerdict({
  shared,
  policy: cycle.policy,
  stage: cycle.stage,
  assignmentId: ASSIGNMENT,
  release: cycle.release,
  records: cycle.records,
  rosterIds: cycle.roster,
});

test('asked about one student, the re-check says exactly what the full rule says about them', () => {
  const seen = { held: 0, released: 0, rosterOnlyHolder: 0, recordHolder: 0, coveredStillTesting: 0, finished: 0, offRosterRecord: 0 };
  for (let seed = 1; seed <= 600; seed += 1) {
    const cycle = randomCycle(seed);
    const verdict = fullVerdict(cycle);
    seen[verdict.released ? 'released' : 'held'] += 1;
    for (const studentId of [...cycle.students, `outsider-${seed}`]) {
      const holds = holderStillHolds({ shared, policy: cycle.policy, stage: cycle.stage, assignmentId: ASSIGNMENT, studentId, ...factsFor(cycle, studentId) });
      assert.equal(holds, verdict.heldFor.includes(studentId), `seed ${seed}, ${studentId}: the re-check and the full rule disagree`);
      if (holds && !cycle.records.has(studentId)) seen.rosterOnlyHolder += 1;
      if (holds && cycle.records.has(studentId)) seen.recordHolder += 1;
      if (holds && !cycle.roster.includes(studentId)) seen.offRosterRecord += 1;
      if (!holds && verdict.stillTesting.includes(studentId)) seen.coveredStillTesting += 1;
      if (!holds && cycle.records.has(studentId) && !verdict.stillTesting.includes(studentId)) seen.finished += 1;
    }
  }
  // The generator reached every kind of case the rule distinguishes.
  for (const [kind, count] of Object.entries(seen)) assert.ok(count > 0, `no random cycle exercised "${kind}"`);
});

test('the rule: everyone on the roster and every record holder; a release covers only the attempts it named', () => {
  const policy = shared.policy.defaultTestCyclePolicy();
  const submitted = (studentId, attempt = 1) => ({ assignmentId: ASSIGNMENT, studentId, test: { state: 'submitted', attempt, examSessionId: 'x' } });
  const records = new Map([
    ['done', submitted('done')],
    ['moved', { assignmentId: ASSIGNMENT, studentId: 'moved', test: { state: 'inProgress', examSessionId: 'y' } }],
  ]);
  // "absent" has no record: the roster alone makes them someone the answers wait for.
  const verdict = answersReleaseVerdict({ shared, policy, stage: 'test', assignmentId: ASSIGNMENT, release: null, records, rosterIds: ['done', 'absent'] });
  assert.deepEqual(verdict.heldFor.sort(), ['absent', 'moved'], 'a roster student with no record and a record holder off the roster both hold the answers');
  assert.equal(verdict.released, false);
  assert.deepEqual(verdict.stillTestingKeys.sort(), ['absent#1.1', 'moved#1.1']);
  // A release covering both, at those attempts, opens them.
  const covering = { releasedAt: 5, coveredKeys: ['absent#1.1', 'moved#1.1'] };
  assert.equal(answersReleaseVerdict({ shared, policy, stage: 'test', assignmentId: ASSIGNMENT, release: covering, records, rosterIds: ['done', 'absent'] }).released, true);
  // ...but not after a reset gave "moved" a new attempt.
  const reset = new Map(records).set('moved', { ...records.get('moved'), test: { state: 'assigned', attempt: 2, examSessionId: 'z' } });
  assert.deepEqual(answersReleaseVerdict({ shared, policy, stage: 'test', assignmentId: ASSIGNMENT, release: covering, records: reset, rosterIds: ['done', 'absent'] }).heldFor, ['moved']);
  // A student-only list from an earlier release covers nobody.
  assert.equal(answersReleaseVerdict({ shared, policy, stage: 'test', assignmentId: ASSIGNMENT, release: { releasedAt: 5 }, records, rosterIds: ['done'] }).released, false);
});

test('a record the full check would not file under this student is not trusted: the full check decides', () => {
  const policy = shared.policy.defaultTestCyclePolicy();
  const ask = (recordData) => holderStillHolds({ shared, policy, stage: 'test', assignmentId: ASSIGNMENT, studentId: 's1', release: null, recordData, onRoster: true });
  assert.equal(ask({ assignmentId: ASSIGNMENT, studentId: 's1', test: { state: 'inProgress' } }), true);
  assert.equal(ask({ assignmentId: ASSIGNMENT, studentId: 's2', test: { state: 'inProgress' } }), false, 'another student\'s record');
  assert.equal(ask({ assignmentId: 'other', studentId: 's1', test: { state: 'inProgress' } }), false, 'another assignment\'s record');
  assert.equal(holderStillHolds({ shared, policy, stage: 'test', assignmentId: ASSIGNMENT, studentId: '', release: null, recordData: null, onRoster: true }), false);
});

test('the roster test for one student is the roster read\'s: an active student of an assigned class', () => {
  const snapshot = (id, data) => ({ id, exists: data !== null, data: () => data });
  const classes = ['p1', 'p3'];
  assert.equal(onTestCycleRoster(snapshot('s1', { classId: 'p1', status: 'active' }), classes), true);
  assert.equal(onTestCycleRoster(snapshot('s1', { classId: 'p3' }), classes), true, 'no status is not inactive');
  assert.equal(onTestCycleRoster(snapshot('s1', { classId: 'p2', status: 'active' }), classes), false, 'another class');
  assert.equal(onTestCycleRoster(snapshot('s1', { classId: 'p1', status: 'inactive' }), classes), false, 'inactive');
  assert.equal(onTestCycleRoster(snapshot('test_connection', { classId: 'p1' }), classes), false, 'the connection probe');
  assert.equal(onTestCycleRoster(snapshot('s1', null), classes), false, 'no grades document');
  assert.equal(onTestCycleRoster(null, classes), false);
});

/*
 * The re-check over time, with every read counted. A class of thirty: all
 * but one have submitted the Test, and the one left has not started it.
 */
const classOf = (count) => {
  const records = new Map();
  const roster = [];
  for (let index = 0; index < count; index += 1) {
    const studentId = `c${index}`;
    roster.push(studentId);
    records.set(studentId, { assignmentId: ASSIGNMENT, studentId, test: { state: 'submitted', attempt: 1, examSessionId: `t${index}` } });
  }
  return { records, roster, release: null };
};

const harness = (state, { policy = shared.policy.defaultTestCyclePolicy(), stage = 'test', hold = createCourseAnswersHold() } = {}) => {
  const reads = { full: 0, holder: 0 };
  const failures = { holder: false, full: false };
  const ask = () => hold.held({
    assignmentId: ASSIGNMENT,
    stage,
    shared,
    policy,
    readHolder: async (studentId) => {
      reads.holder += 1;
      if (failures.holder) throw new Error('read failed');
      return factsFor({ ...state, stage }, studentId);
    },
    fullCheck: async () => {
      reads.full += 1;
      if (failures.full) throw new Error('read failed');
      return answersReleaseVerdict({ shared, policy, stage, assignmentId: ASSIGNMENT, release: state.release, records: state.records, rosterIds: state.roster });
    },
  });
  // The answer the full rule gives for the same state, every time.
  const truth = () => !answersReleaseVerdict({ shared, policy, stage, assignmentId: ASSIGNMENT, release: state.release, records: state.records, rosterIds: state.roster }).released;
  return { ask, truth, reads, failures, hold };
};

test('while the student who held the answers still does, the re-check reads them alone', async () => {
  const state = classOf(30);
  state.roster.push('absent');
  const { ask, truth, reads, hold } = harness(state);
  assert.equal(await ask(), true);
  assert.equal(truth(), true);
  assert.deepEqual(reads, { full: 1, holder: 0 }, 'the first ask reads the whole cycle');
  assert.equal(hold.remembered(ASSIGNMENT, 'test'), 'absent');
  for (let ask30s = 0; ask30s < 5; ask30s += 1) assert.equal(await ask(), true);
  assert.deepEqual(reads, { full: 1, holder: 5 }, 'every 30-second ask after it reads one student');

  // They start the Test: a record now, still holding the answers.
  state.records.set('absent', { assignmentId: ASSIGNMENT, studentId: 'absent', test: { state: 'inProgress', attempt: 1, examSessionId: 'tx' } });
  assert.equal(await ask(), true);
  assert.deepEqual(reads, { full: 1, holder: 6 });

  // They submit: the remembered student no longer holds them, so the full
  // check runs — and it is the full check that opens the answers.
  state.records.set('absent', { ...state.records.get('absent'), test: { state: 'submitted', attempt: 1, examSessionId: 'tx' } });
  assert.equal(await ask(), false);
  assert.equal(truth(), false);
  assert.deepEqual(reads, { full: 2, holder: 7 });
  assert.equal(hold.remembered(ASSIGNMENT, 'test'), null, 'released is never remembered');
  assert.equal(await ask(), false);
  assert.deepEqual(reads, { full: 3, holder: 7 }, 'an open review keeps asking the full rule');
});

test('the moment the remembered student stops holding them, the full rule answers: another holder, a release, a joiner', async () => {
  const state = classOf(12);
  state.roster.push('a', 'b');
  const { ask, truth, reads, hold } = harness(state);
  assert.equal(await ask(), true);
  const first = hold.remembered(ASSIGNMENT, 'test');
  assert.ok(['a', 'b'].includes(first));
  const second = first === 'a' ? 'b' : 'a';

  // The remembered one submits; the other still has not.
  state.records.set(first, { assignmentId: ASSIGNMENT, studentId: first, test: { state: 'submitted', attempt: 1, examSessionId: 'q' } });
  assert.equal(await ask(), truth());
  assert.equal(await ask(), true);
  assert.equal(hold.remembered(ASSIGNMENT, 'test'), second, 'the full check named the next student');
  assert.equal(reads.full, 2);

  // The teacher releases the answers, naming the last one at their attempt.
  state.release = { releasedAt: 9, coveredKeys: [`${second}#1.1`] };
  assert.equal(await ask(), false);
  assert.equal(truth(), false);
  assert.equal(reads.full, 3);

  // A student joins the class afterwards: the next ask holds them again.
  state.roster.push('joiner');
  assert.equal(await ask(), true);
  assert.equal(truth(), true);
  assert.equal(hold.remembered(ASSIGNMENT, 'test'), 'joiner');
  // ...and leaves it (inactive): the full rule decides, and opens them.
  state.roster.pop();
  assert.equal(await ask(), false);
  assert.equal(truth(), false);
});

test('a holder read that fails falls back to the full check; a full check that fails throws, so the caller holds', async () => {
  const state = classOf(6);
  state.roster.push('absent');
  const { ask, reads, failures } = harness(state);
  assert.equal(await ask(), true);
  failures.holder = true;
  assert.equal(await ask(), true);
  assert.deepEqual(reads, { full: 2, holder: 1 }, 'the failed read was answered by the full check');
  failures.full = true;
  await assert.rejects(ask(), /read failed/);
});

test('each assignment and stage remembers its own student, and the memory is bounded', async () => {
  const hold = createCourseAnswersHold({ limit: 2 });
  const remembered = [];
  for (const assignmentId of ['x', 'y', 'z']) {
    await hold.held({
      assignmentId,
      stage: 'test',
      shared,
      policy: shared.policy.defaultTestCyclePolicy(),
      readHolder: async () => { throw new Error('nothing remembered yet'); },
      fullCheck: async () => ({ released: false, heldFor: [`${assignmentId}-holder`] }),
    });
    remembered.push(hold.remembered(assignmentId, 'test'));
  }
  assert.deepEqual(remembered, ['x-holder', 'y-holder', 'z-holder']);
  assert.equal(hold.remembered('x', 'test'), null, 'the oldest is forgotten past the limit');
  assert.equal(hold.remembered('z', 'retest'), null, 'the Retest is asked about on its own');
});

/*
 * The server asks it with the reads the rule needs (functions/index.js
 * courseAnswersHeld): the release and the student's own record, their grades
 * document only when they have none, and the full check the review and the
 * card used before, with its cached roster.
 */
test('the callables ask the re-check, and it reads what the one-student rule needs', () => {
  const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const held = region(functionsIndex, 'async function courseAnswersHeld(', '\n}', 'courseAnswersHeld');
  const reader = region(held, 'readHolder: async (studentId) => {', 'fullCheck:', 'readHolder');
  assert.match(reader, /db\.collection\(TEST_CYCLE_ANSWER_RELEASES\)\.doc\(id\)\.get\(\),\s*db\.collection\(TEST_CYCLE_RECORDS\)\.doc\(testCycleRecordKey\(id, studentId\)\)\.get\(\),/);
  assert.match(reader, /release: releaseSnapshot\.data\(\)\?\.\[stage\] \|\| null,/, 'the release of THIS stage');
  assert.match(reader, /onRoster: recordData \? false : testCycleAnswersHold\.onTestCycleRoster\(\s*await db\.collection\("grades"\)\.doc\(studentId\)\.get\(\),\s*assignmentAudience\(assignment\)\.classIds,\s*\),/);
  assert.match(held, /fullCheck: \(\) => courseAnswersRelease\(db, shared, id, stage, \{ assignment, cacheRoster: true \}\),/);
  // Both askers go through it; nothing else asks the full rule with the cached roster.
  assert.equal((functionsIndex.match(/await courseAnswersHeld\(/g) || []).length, 2, 'the review and the card');
  assert.equal((functionsIndex.match(/cacheRoster: true/g) || []).length, 1, 'only the re-check\'s own full check uses the cached roster');
});
