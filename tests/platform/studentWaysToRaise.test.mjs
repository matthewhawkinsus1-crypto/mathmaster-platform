import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStudentGradeCenter, findGradeCenterEntry, GRADE_STATUS } from '../../src/platform/student/studentGradeCenterModel.js';
import {
  WAY_ACTION,
  WAY_KIND,
  WAY_URGENCY,
  buildWaysToRaise,
  countWaysToRaise,
  entryCanStillRise,
} from '../../src/platform/student/waysToRaiseModel.js';
import { TEST_CYCLE_DISCOVERY } from '../../src/platform/student/testCycleDiscovery.js';
import {
  NOW,
  gradeCenterOptions,
  practicePassEligibleAssignments,
  recoverySummariesByAssignment,
} from './fixtures/studentGradesRaiseFixtures.mjs';

/*
 * "WAYS TO RAISE YOUR GRADE" IS A LIST OF DOORS FROM DATA ALREADY DECIDED.
 *
 * Every row has to be something the student can do now that can still change
 * a grade, and the list must never offer work that is excused, closed,
 * waiting on the teacher or not open yet.
 */

const gradeCenter = buildStudentGradeCenter(gradeCenterOptions());
const fixed = (value) => `<${value}>`;
const ways = (overrides = {}) => buildWaysToRaise({
  gradeCenter,
  recoverySummariesByAssignment,
  practicePassEligibleAssignmentIds: practicePassEligibleAssignments,
  nowValue: NOW,
  formatDate: fixed,
  ...overrides,
});
const shape = (list) => list.map((way) => `${way.kind}:${way.assignmentId}${way.section ? `:${way.section}` : ''}`);

test('the fixture has every status the list has to tell apart', () => {
  // Guards the fixture itself: if a status moved, the tests below would pass
  // for the wrong reason.
  const statusOf = (id) => findGradeCenterEntry(gradeCenter, id).status;
  assert.equal(statusOf('missing-open'), GRADE_STATUS.MISSING);
  assert.equal(statusOf('late-progress'), GRADE_STATUS.LATE);
  assert.equal(statusOf('graded'), GRADE_STATUS.GRADED);
  assert.equal(statusOf('pending'), GRADE_STATUS.PENDING_GRADE);
  assert.equal(statusOf('excused'), GRADE_STATUS.EXCUSED);
  assert.equal(findGradeCenterEntry(gradeCenter, 'closed').frozen, true);
  assert.equal(statusOf('not-started'), GRADE_STATUS.NOT_STARTED);
  assert.equal(statusOf('locked'), GRADE_STATUS.LOCKED);
  assert.equal(statusOf('in-progress'), GRADE_STATUS.IN_PROGRESS);
  assert.equal(findGradeCenterEntry(gradeCenter, 'cycle').testCycleStage, 'corrections');
});

test('the list is complete, in order: urgent catch-up first, then corrections, Recovery, Practice Pass', () => {
  assert.deepEqual(shape(ways()), [
    'missing:missing-open',
    'lateWindow:late-progress',
    'testCycle:cycle',
    'recovery:graded:dol',
    'recovery:in-progress:warmup',
    'practicePass:not-started',
  ]);
  assert.equal(countWaysToRaise(ways()), 6);
});

test('missing work offers Start and says when the late window closes', () => {
  const [missing] = ways();
  assert.equal(missing.kind, WAY_KIND.MISSING);
  assert.equal(missing.action, WAY_ACTION.START);
  assert.equal(missing.actionLabel, 'Start');
  assert.equal(missing.urgency, WAY_URGENCY.HIGH);
  const entry = findGradeCenterEntry(gradeCenter, 'missing-open');
  assert.equal(missing.text, `${entry.title} is missing. Late work is open until <${entry.lateDueAt}>.`);
});

test('started late work says "Late work is open until <date>" and offers Continue', () => {
  const late = ways().find((way) => way.kind === WAY_KIND.LATE_WINDOW);
  const entry = findGradeCenterEntry(gradeCenter, 'late-progress');
  assert.equal(late.assignmentId, 'late-progress');
  assert.match(late.text, new RegExp(`^Late work is open until <${entry.lateDueAt}>`));
  assert.equal(late.actionLabel, 'Continue');
  assert.equal(late.action, WAY_ACTION.START);
});

test('missing and late work drop off once the late window has closed', () => {
  const after = Date.parse('2026-09-12T12:00:01.000Z');
  const kinds = shape(ways({ nowValue: after }));
  assert.ok(!kinds.includes('missing:missing-open'));
  assert.ok(!kinds.includes('lateWindow:late-progress'));
  // And a grade center rebuilt after the close calls it practice only: nothing listed.
  const closed = buildStudentGradeCenter(gradeCenterOptions({ nowValue: after }));
  const rebuilt = shape(buildWaysToRaise({ gradeCenter: closed, nowValue: after }));
  assert.ok(!rebuilt.some((id) => id.endsWith(':missing-open') || id.endsWith(':late-progress')), rebuilt.join(','));
});

test('on-time in-progress work is not "late" and is not listed as a late window', () => {
  assert.ok(!shape(ways()).includes('lateWindow:in-progress'));
});

test('Recovery: unlocked says try again, in progress says finish, locked says Practice to unlock — all open the result page', () => {
  const recovery = ways().filter((way) => way.kind === WAY_KIND.RECOVERY);
  const unlocked = recovery.find((way) => way.assignmentId === 'graded');
  assert.equal(unlocked.text, 'DOL Recovery unlocked — try again (Solving One-Step Equations)');
  assert.equal(unlocked.action, WAY_ACTION.OPEN_RESULT);
  const locked = recovery.find((way) => way.assignmentId === 'in-progress');
  assert.equal(locked.text, 'Practice to unlock your Warm-Up Recovery (Distributive Property)');
  assert.equal(locked.action, WAY_ACTION.OPEN_RESULT);
  assert.equal(locked.urgency, WAY_URGENCY.LOW);

  const inProgress = ways({
    recoverySummariesByAssignment: { graded: [{ section: 'warmup', label: 'Warm-Up Recovery', state: 'inProgress' }] },
    practicePassEligibleAssignmentIds: [],
  }).find((way) => way.kind === WAY_KIND.RECOVERY);
  assert.equal(inProgress.text, 'Finish your Warm-Up Recovery (Solving One-Step Equations)');
  assert.equal(inProgress.actionLabel, 'Continue');
});

test('finished, held, closed and expired Recoveries are not ways to raise anything', () => {
  for (const state of ['completed', 'held', 'closed', 'hidden', 'notNeeded', 'unavailable']) {
    const list = ways({ recoverySummariesByAssignment: { graded: [{ section: 'dol', label: 'DOL Recovery', state }] } });
    assert.ok(!list.some((way) => way.kind === WAY_KIND.RECOVERY), state);
  }
  const expired = ways({
    recoverySummariesByAssignment: { graded: [{ section: 'dol', label: 'DOL Recovery', state: 'unlocked', endsAtMs: NOW - 1 }] },
  });
  assert.ok(!expired.some((way) => way.kind === WAY_KIND.RECOVERY));
});

test('Practice Pass rows come from App\'s eligible list (rows or bare ids) and open My Rewards', () => {
  const pass = ways().find((way) => way.kind === WAY_KIND.PRACTICE_PASS);
  assert.equal(pass.text, "Use a Practice Pass on Two-Step Equations' Practice");
  assert.equal(pass.action, WAY_ACTION.OPEN_REWARDS);
  const fromIds = ways({ practicePassEligibleAssignmentIds: ['in-progress', 'nobody-knows-this-id'] })
    .filter((way) => way.kind === WAY_KIND.PRACTICE_PASS);
  assert.deepEqual(fromIds.map((way) => way.assignmentId), ['in-progress']);
  assert.equal(fromIds[0].text, "Use a Practice Pass on Distributive Property's Practice");
});

test('Test Cycle: corrections and an open retest are listed; preparing and waiting stages are not', () => {
  const cycle = (testCycleStages) => ways({ testCycleStages }).find((way) => way.kind === WAY_KIND.TEST_CYCLE) || null;
  // From the projection stage alone.
  assert.equal(cycle({}).stage, TEST_CYCLE_DISCOVERY.CORRECTIONS);
  assert.equal(cycle({}).action, WAY_ACTION.OPEN_TEST_CYCLE);
  assert.match(cycle({}).text, /corrections on Unit 2 Test/);
  // From describeTestCycleForStudent's key, which wins when App passes it.
  assert.equal(cycle({ cycle: TEST_CYCLE_DISCOVERY.RETEST_READY }).actionLabel, 'Start Retest');
  assert.equal(cycle({ cycle: TEST_CYCLE_DISCOVERY.RETEST_READY }).urgency, WAY_URGENCY.HIGH);
  assert.equal(cycle({ cycle: TEST_CYCLE_DISCOVERY.RETEST_IN_PROGRESS }).actionLabel, 'Resume Retest');
  for (const key of [TEST_CYCLE_DISCOVERY.RETEST_PREPARING, TEST_CYCLE_DISCOVERY.AWAITING_RESULTS, TEST_CYCLE_DISCOVERY.COMPLETE]) {
    assert.equal(cycle({ cycle: key }), null, key);
  }
  // The projection's 'retestReady' means the retest is being prepared.
  const preparing = buildStudentGradeCenter(gradeCenterOptions({
    testCycleGrades: { cycle: { stage: 'retestReady', originalTestGrade: 58 } },
  }));
  assert.ok(!buildWaysToRaise({ gradeCenter: preparing, nowValue: NOW }).some((way) => way.kind === WAY_KIND.TEST_CYCLE));
  const open = buildStudentGradeCenter(gradeCenterOptions({
    testCycleGrades: { cycle: { stage: 'retest', originalTestGrade: 58 } },
  }));
  assert.equal(buildWaysToRaise({ gradeCenter: open, nowValue: NOW }).find((way) => way.kind === WAY_KIND.TEST_CYCLE).stage, TEST_CYCLE_DISCOVERY.RETEST_READY);
});

test('excused, closed, pending and not-open work is never listed, whatever source points at it', () => {
  const forbidden = ['excused', 'closed', 'pending', 'locked'];
  const everything = ways({
    recoverySummariesByAssignment: Object.fromEntries(forbidden.map((id) => [id, [{ section: 'dol', label: 'DOL Recovery', state: 'unlocked' }]])),
    practicePassEligibleAssignmentIds: forbidden,
    testCycleStages: Object.fromEntries(forbidden.map((id) => [id, TEST_CYCLE_DISCOVERY.RETEST_READY])),
  });
  assert.deepEqual(everything.filter((way) => forbidden.includes(way.assignmentId)), []);
  for (const id of forbidden) assert.equal(entryCanStillRise(findGradeCenterEntry(gradeCenter, id)), false, id);
  for (const id of ['missing-open', 'late-progress', 'graded', 'not-started', 'in-progress', 'cycle']) {
    assert.equal(entryCanStillRise(findGradeCenterEntry(gradeCenter, id)), true, id);
  }
  // A frozen Test Cycle offers no retest either.
  const frozenCycle = buildStudentGradeCenter(gradeCenterOptions({ nowValue: Date.parse('2026-09-30T12:00:00.000Z') }));
  assert.ok(!buildWaysToRaise({ gradeCenter: frozenCycle, testCycleStages: { cycle: TEST_CYCLE_DISCOVERY.RETEST_READY } })
    .some((way) => way.kind === WAY_KIND.TEST_CYCLE));
});

test('an assignment is listed once per kind and section, and ids are unique', () => {
  const doubled = ways({
    practicePassEligibleAssignmentIds: ['not-started', 'not-started', { assignmentId: 'not-started' }],
    recoverySummariesByAssignment: {
      graded: [
        { section: 'dol', label: 'DOL Recovery', state: 'unlocked' },
        { section: 'dol', label: 'DOL Recovery', state: 'unlocked' },
        { section: 'warmup', label: 'Warm-Up Recovery', state: 'unlocked' },
      ],
    },
  });
  assert.equal(doubled.filter((way) => way.kind === WAY_KIND.PRACTICE_PASS).length, 1);
  assert.equal(doubled.filter((way) => way.kind === WAY_KIND.RECOVERY).length, 2);
  assert.equal(new Set(doubled.map((way) => way.id)).size, doubled.length);
});

test('no inputs, no ways — and the count is a plain number', () => {
  assert.deepEqual(buildWaysToRaise(), []);
  assert.deepEqual(buildWaysToRaise({ gradeCenter: { entries: [] } }), []);
  assert.equal(countWaysToRaise(null), 0);
  assert.equal(countWaysToRaise([{}, {}]), 2);
});

test('every way carries the fields the screen and App need', () => {
  for (const way of ways()) {
    for (const field of ['id', 'kind', 'assignmentId', 'title', 'text', 'actionLabel', 'action', 'urgency']) {
      assert.ok(way[field], `${way.id} is missing ${field}`);
    }
    assert.ok(Object.values(WAY_ACTION).includes(way.action));
    // Student copy: no teacher jargon.
    assert.doesNotMatch(way.text, /variant|seed|checkpoint|teacher draft/i);
  }
});

test('within one kind, the deadline that closes first comes first', () => {
  const order = (gradedEnds, inProgressEnds) => ways({
    recoverySummariesByAssignment: {
      'in-progress': [{ section: 'dol', label: 'DOL Recovery', state: 'unlocked', endsAtMs: inProgressEnds }],
      graded: [{ section: 'dol', label: 'DOL Recovery', state: 'unlocked', endsAtMs: gradedEnds }],
    },
  }).filter((way) => way.kind === WAY_KIND.RECOVERY).map((way) => way.assignmentId);
  assert.deepEqual(order(NOW + 2000, NOW + 1000), ['in-progress', 'graded']);
  assert.deepEqual(order(NOW + 1000, NOW + 2000), ['graded', 'in-progress']);
});

test('started work behind a prerequisite lock is not offered as a late window', () => {
  const locked = buildStudentGradeCenter(gradeCenterOptions({
    providers: {
      assignmentHasHeldTeacherFeedback: (assignment) => assignment?.id === 'pending',
      prerequisiteAccess: ({ assignment }) => (assignment.id === 'late-progress' ? { open: false, reason: 'prerequisite' } : { open: true }),
    },
  }));
  const row = findGradeCenterEntry(locked, 'late-progress');
  assert.equal(row.status, GRADE_STATUS.LATE, 'the fixture is started late work');
  assert.equal(row.locked, true);
  assert.ok(!buildWaysToRaise({ gradeCenter: locked, nowValue: NOW }).some((way) => way.assignmentId === 'late-progress'));
});

test('entryCanStillRise reads each flag on its own, not only the status word', () => {
  const open = findGradeCenterEntry(gradeCenter, 'graded');
  assert.equal(entryCanStillRise(open), true);
  assert.equal(entryCanStillRise({ ...open, excused: true }), false);
  assert.equal(entryCanStillRise({ ...open, frozen: true }), false);
  assert.equal(entryCanStillRise({ ...open, locked: true }), false);
  assert.equal(entryCanStillRise({ ...open, lifecycle: { ...open.lifecycle, isPracticeOnly: true } }), false);
  assert.equal(entryCanStillRise(null), false);
});
