/*
 * WHICH STAGE, AND WHETHER IT CAN BE ENTERED NOW — every kind of student.
 *
 * The stage machine with the class-time Test window and the home window laid
 * over it. One table of students (finished Review, unfinished Review, Review
 * waived, missed the Test, took the Test and passed, took it and failed, in
 * Corrections, ready for the Retest) against the moments that matter (before
 * the window, during it, after it, after the home window has ended).
 *
 * This is the pure half of the server's gate: `assertCourseTestEntryAllowed`
 * refuses exactly when `canEnter` here is false (tests/integration/
 * testCycleSecureWorkflow.test.mjs asks the real handlers).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEST_CYCLE_STAGE as STAGE,
  buildTestCyclePhaseStatus,
  resolveTestCycleStage,
  studentMissedOriginalTest,
} from '../../functions/shared/testCycleStages.mjs';
import { resolveStudentTestCycleSchedule, withClassTestDay, withFollowUpClose, withStudentTestWindow } from '../../functions/shared/testCycleAvailability.mjs';
import { zonedInstant } from '../../functions/shared/instructionalCalendar.mjs';

const TZ = 'America/Chicago';
const at = (day, hour, minute = 0) => zonedInstant({ year: 2026, month: 10, day, hour, minute }, TZ);
const bell = {
  version: 2,
  daySchedules: { A: { periods: { 'Period 3': { enabled: true, start: '10:15', end: '11:05' } } }, B: { periods: {} } },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
};
// The Test day is Wednesday 14 October; the home window ends on the 20th.
const TEST_DAY = '2026-10-14';
const assignment = { lateDueAt: '2026-10-20', testAvailability: withClassTestDay(null, { classId: 'c3', dateKey: TEST_DAY }) };
const MOMENT = {
  dayBefore: at(13, 15),
  inClass: at(14, 10, 30),
  thatEvening: at(14, 19),
  afterLateDue: at(21, 8),
};
const scheduleAt = (now, { studentAvailability = null, config = assignment } = {}) => resolveStudentTestCycleSchedule({
  assignment: config, classId: 'c3', classPeriod: 'Period 3', schedule: bell, studentAvailability, now, timeZone: TZ,
});

const policy = { mode: 'testCycle', passingScore: 70, retest: { maxRecordedGrade: 70 } };
const record = (extra = {}) => ({ assignmentId: 'a', studentId: 's', ...extra });
const REVIEW_DONE = { total: 4, attempted: 4, complete: true };
const REVIEW_HALF = { total: 4, attempted: 2, complete: false };
const REVIEW_NONE = { total: 4, attempted: 0, complete: false };
const assigned = { examSessionId: 't1', state: 'assigned' };

const resolve = (studentRecord, reviewProgress, moment, options) => resolveTestCycleStage({
  policy, record: studentRecord, reviewProgress, schedule: scheduleAt(moment, options),
});
const summary = (state) => [state.stage, state.canEnter, state.actionLabel];

test('finished Review, Test session open: enterable only inside the class-time window', () => {
  const student = record({ test: assigned });
  assert.deepEqual(summary(resolve(student, REVIEW_DONE, MOMENT.dayBefore)), [STAGE.TEST, false, 'Opens in class']);
  assert.match(resolve(student, REVIEW_DONE, MOMENT.dayBefore).detail, /opens Wed, Oct 14, 10:15 AM CDT, during your class period/);
  assert.deepEqual(summary(resolve(student, REVIEW_DONE, MOMENT.inClass)), [STAGE.TEST, true, 'Start Test']);
  // The window closed and they never started: this is the missed-Test path.
  assert.equal(resolve(student, REVIEW_DONE, MOMENT.thatEvening).missedTest, true);
});

test('unfinished Review: Review stays open at every moment and the Test stays behind it', () => {
  for (const [moment, progress] of [[MOMENT.dayBefore, REVIEW_NONE], [MOMENT.inClass, REVIEW_HALF], [MOMENT.thatEvening, REVIEW_HALF], [MOMENT.afterLateDue, REVIEW_HALF]]) {
    const state = resolve(record({ test: assigned }), progress, moment);
    assert.equal(state.stage, STAGE.REVIEW);
    assert.equal(state.canEnter, true, 'Review is instruction: a window never closes it');
    assert.equal(state.hintsAllowed, true);
  }
  assert.equal(resolve(record({ test: assigned }), REVIEW_NONE, MOMENT.dayBefore).actionLabel, 'Start Review');
  assert.equal(resolve(record({ test: assigned }), REVIEW_HALF, MOMENT.inClass).actionLabel, 'Continue Review');
  // After the window, the Review says what it now unlocks.
  const late = resolve(record({ test: assigned }), REVIEW_HALF, MOMENT.thatEvening);
  assert.equal(late.missedTest, true);
  assert.match(late.detail, /Test window has closed, so you will take the Retest instead\. Finish the review to unlock it/);
  // No Retest is offered behind an unfinished Review.
  assert.deepEqual(buildTestCyclePhaseStatus({ state: late, record: record({ test: assigned }) }).map((phase) => `${phase.id}:${phase.status}`),
    ['review:available', 'test:missed', 'corrections:notRequired', 'retest:locked']);
});

test('Review waived: the same windows apply as for a student who finished it', () => {
  const waived = record({ test: assigned, teacherControls: { reviewWaived: true } });
  assert.deepEqual(summary(resolve(waived, REVIEW_NONE, MOMENT.dayBefore)), [STAGE.TEST, false, 'Opens in class']);
  assert.deepEqual(summary(resolve(waived, REVIEW_NONE, MOMENT.inClass)), [STAGE.TEST, true, 'Start Test']);
  // Waived before any session was opened: at the Test, with nothing to enter.
  const noSession = record({ teacherControls: { reviewWaived: true } });
  assert.deepEqual(summary(resolve(noSession, REVIEW_NONE, MOMENT.inClass)), [STAGE.TEST, false, 'Start Test']);
  // A waiver does not waive the window: after it, they too go to the Retest.
  const missed = resolve(waived, REVIEW_NONE, MOMENT.thatEvening);
  assert.deepEqual([missed.stage, missed.missedTest], [STAGE.RETEST_READY, true]);
});

test('missed the Test: straight to the Retest at home, with no Corrections, until the home window ends', () => {
  const never = record({ test: assigned });
  const pending = resolve(never, REVIEW_DONE, MOMENT.thatEvening);
  assert.deepEqual(summary(pending), [STAGE.RETEST_READY, false, 'Retest pending']);
  assert.match(pending.detail, /did not take the Test in its class-time window, so you go straight to the Retest/);
  // A student who was never even given a Test session missed it just the same.
  assert.equal(resolve(record(), REVIEW_DONE, MOMENT.thatEvening).missedTest, true);

  const ready = record({ test: assigned, retest: { examSessionId: 'r1', state: 'assigned', withoutOriginal: true } });
  const home = resolve(ready, REVIEW_DONE, MOMENT.thatEvening);
  assert.deepEqual(summary(home), [STAGE.RETEST, true, 'Start Retest']);
  assert.equal(home.secure, true);
  assert.match(home.detail, /There are no corrections to do/);
  assert.match(home.detail, /actual Retest score is kept and shown; the grade recorded from it is at most 70%/);
  assert.match(home.detail, /Open from home until Tue, Oct 20, 11:59 PM CDT\./);
  assert.deepEqual(buildTestCyclePhaseStatus({ state: home, record: ready }).map((phase) => `${phase.id}:${phase.status}`),
    ['review:completed', 'test:missed', 'corrections:notRequired', 'retest:ready']);

  // The home window has ended: the Retest cannot be started...
  const expired = resolve(ready, REVIEW_DONE, MOMENT.afterLateDue);
  assert.deepEqual(summary(expired), [STAGE.RETEST, false, 'Retest window closed']);
  assert.match(expired.detail, /The Retest closed Tue, Oct 20, 11:59 PM CDT\. Ask your teacher if you need it reopened/);
  // ...but one already under way is finished.
  const sitting = record({ test: assigned, retest: { examSessionId: 'r1', state: 'inProgress', withoutOriginal: true } });
  const finishing = resolve(sitting, REVIEW_DONE, MOMENT.afterLateDue);
  assert.deepEqual(summary(finishing), [STAGE.RETEST, true, 'Resume Retest']);
  assert.match(finishing.detail, /you can still finish the Retest you started/);

  // Submitted, then released: an ordinary end to the cycle, with a real grade.
  const submitted = record({ test: assigned, retest: { examSessionId: 'r1', state: 'submitted', withoutOriginal: true } });
  assert.deepEqual(summary(resolve(submitted, REVIEW_DONE, MOMENT.afterLateDue)), [STAGE.RETEST_SUBMITTED, false, 'Submitted']);
  const released = record({ test: assigned, retest: { examSessionId: 'r1', state: 'released', rawScore: 86, withoutOriginal: true } });
  const done = resolve(released, REVIEW_DONE, MOMENT.afterLateDue);
  assert.deepEqual([done.stage, done.canEnter, done.complete, done.recordedGrade], [STAGE.COMPLETE, true, true, 70]);
  assert.deepEqual([done.grade.rawRetestGrade, done.grade.originalTestGrade, done.grade.retestWithoutOriginal], [86, null, true]);
  // A teacher who closed retesting outranks the missed-Test path.
  const closedByTeacher = record({ test: assigned, teacherControls: { retestDisabled: true } });
  assert.deepEqual(summary(resolve(closedByTeacher, REVIEW_DONE, MOMENT.thatEvening)), [STAGE.RETEST_CLOSED, false, 'Retest closed']);
});

test('started the Test in class: they finish it after the window closes, and are never treated as absent', () => {
  const sitting = record({ test: { examSessionId: 't1', state: 'inProgress' } });
  for (const moment of [MOMENT.thatEvening, MOMENT.afterLateDue]) {
    const state = resolve(sitting, REVIEW_DONE, moment);
    assert.deepEqual(summary(state), [STAGE.TEST, true, 'Resume Test']);
    assert.notEqual(state.missedTest, true);
    assert.match(state.detail, /you can still finish the Test you started/);
  }
  assert.equal(studentMissedOriginalTest({ record: sitting, schedule: scheduleAt(MOMENT.thatEvening) }), false);
  // Submitted: waiting on the teacher, and no window changes that.
  const submitted = record({ test: { examSessionId: 't1', state: 'submitted' } });
  assert.deepEqual(summary(resolve(submitted, REVIEW_DONE, MOMENT.afterLateDue)), [STAGE.AWAITING_RELEASE, false, 'Submitted']);
});

test('took the Test and passed: done, with their results readable at any time', () => {
  const passed = record({ test: { examSessionId: 't1', state: 'released', rawScore: 88 } });
  for (const moment of Object.values(MOMENT)) {
    const state = resolve(passed, REVIEW_DONE, moment);
    assert.deepEqual([state.stage, state.canEnter, state.actionLabel, state.recordedGrade], [STAGE.PASSED, true, 'Review Test', 88]);
    assert.notEqual(state.missedTest, true);
  }
});

test('took the Test and failed: Corrections open from home after the Test window, then the Retest, until the home window ends', () => {
  const failed = record({
    test: { examSessionId: 't1', state: 'released', rawScore: 40 },
    corrections: { planId: 'p1', required: true, total: 3, completedTargets: 1 },
  });
  // Released during class while classmates are still testing: Corrections wait.
  const duringClass = resolve(failed, REVIEW_DONE, MOMENT.inClass);
  assert.deepEqual(summary(duringClass), [STAGE.CORRECTIONS, false, 'Opens after the Test window']);
  assert.equal(duringClass.detail, 'Corrections open when the Test window closes.');
  // That evening, at home.
  const atHome = resolve(failed, REVIEW_DONE, MOMENT.thatEvening);
  assert.deepEqual(summary(atHome), [STAGE.CORRECTIONS, true, 'Continue Corrections']);
  assert.equal(atHome.hintsAllowed, true);
  assert.match(atHome.detail, /Corrections do not change your recorded grade\. Open from home until Tue, Oct 20, 11:59 PM CDT\./);
  // After the late due date.
  const tooLate = resolve(failed, REVIEW_DONE, MOMENT.afterLateDue);
  assert.deepEqual(summary(tooLate), [STAGE.CORRECTIONS, false, 'Corrections closed']);
  assert.match(tooLate.detail, /Corrections closed Tue, Oct 20, 11:59 PM CDT\. Ask your teacher if you need them reopened/);

  // Corrections finished (or waived): the Retest, in the same home window.
  for (const controls of [{}, { correctionsWaived: true }]) {
    const eligible = record({
      test: { examSessionId: 't1', state: 'released', rawScore: 40 },
      corrections: { planId: 'p1', required: true, complete: !controls.correctionsWaived, total: 3, completedTargets: 3 },
      retest: { examSessionId: 'r1', state: 'assigned' },
      teacherControls: controls,
    });
    assert.deepEqual(summary(resolve(eligible, REVIEW_DONE, MOMENT.thatEvening)), [STAGE.RETEST, true, 'Start Retest']);
    assert.deepEqual(summary(resolve(eligible, REVIEW_DONE, MOMENT.afterLateDue)), [STAGE.RETEST, false, 'Retest window closed']);
    assert.notEqual(resolve(eligible, REVIEW_DONE, MOMENT.thatEvening).missedTest, true, 'they took the Test');
  }
  // The Retest is still being built: nothing to enter yet, and it says so.
  const waiting = record({ test: { examSessionId: 't1', state: 'released', rawScore: 40 }, corrections: { planId: 'p1', required: true, complete: true } });
  assert.deepEqual(summary(resolve(waiting, REVIEW_DONE, MOMENT.thatEvening)), [STAGE.RETEST_READY, false, 'Retest pending']);
});

test('a teacher\'s extension or reopen changes the answer for exactly the students it covers', () => {
  const absent = record({ test: assigned });
  // Reopened for this student on Thursday: the Test again, not the Retest.
  const own = withStudentTestWindow(null, { opensAt: at(15, 8), closesAt: at(15, 16) });
  const reopened = resolve(absent, REVIEW_DONE, at(15, 9), { studentAvailability: own });
  assert.deepEqual(summary(reopened), [STAGE.TEST, true, 'Start Test']);
  assert.notEqual(reopened.missedTest, true);
  // A classmate with no reopen is still on the Retest path that same morning.
  assert.equal(resolve(absent, REVIEW_DONE, at(15, 9)).missedTest, true);
  // A stand-in Retest they have not started does not keep them from the reopened Test.
  const standIn = record({ test: assigned, retest: { examSessionId: 'r1', state: 'assigned', withoutOriginal: true } });
  assert.deepEqual(summary(resolve(standIn, REVIEW_DONE, at(15, 9), { studentAvailability: own })), [STAGE.TEST, true, 'Start Test']);
  // One they have started does: they are sitting it, and they stay there.
  const sittingRetest = record({ test: assigned, retest: { examSessionId: 'r1', state: 'inProgress', withoutOriginal: true } });
  assert.deepEqual(summary(resolve(sittingRetest, REVIEW_DONE, at(15, 9), { studentAvailability: own })), [STAGE.RETEST, true, 'Resume Retest']);

  // The home window extended for the class reopens an expired Retest.
  const ready = record({ test: assigned, retest: { examSessionId: 'r1', state: 'assigned', withoutOriginal: true } });
  const extended = { ...assignment, testAvailability: withFollowUpClose(assignment.testAvailability, { mode: 'custom', closesAt: at(27, 17) }) };
  assert.deepEqual(summary(resolve(ready, REVIEW_DONE, MOMENT.afterLateDue, { config: extended })), [STAGE.RETEST, true, 'Start Retest']);
});

test('with no schedule (or no window set) every stage is exactly what it was before', () => {
  const cases = [
    [record({ test: assigned }), REVIEW_DONE, [STAGE.TEST, true, 'Start Test']],
    [record({ test: assigned }), REVIEW_HALF, [STAGE.REVIEW, true, 'Continue Review']],
    [record({ test: { examSessionId: 't1', state: 'released', rawScore: 40 }, corrections: { planId: 'p1', required: true, total: 2 } }), REVIEW_DONE, [STAGE.CORRECTIONS, true, 'Start Corrections']],
    [record({ test: { examSessionId: 't1', state: 'released', rawScore: 40 }, corrections: { planId: 'p1', required: true, complete: true }, retest: { examSessionId: 'r1', state: 'assigned' } }), REVIEW_DONE, [STAGE.RETEST, true, 'Start Retest']],
  ];
  const unsetSchedule = resolveStudentTestCycleSchedule({ assignment: { lateDueAt: '2026-10-20' }, classId: 'c3', classPeriod: 'Period 3', schedule: bell, now: MOMENT.afterLateDue, timeZone: TZ });
  for (const [studentRecord, reviewProgress, expected] of cases) {
    const bare = resolveTestCycleStage({ policy, record: studentRecord, reviewProgress });
    assert.deepEqual(summary(bare), expected);
    const unset = resolveTestCycleStage({ policy, record: studentRecord, reviewProgress, schedule: unsetSchedule });
    assert.deepEqual(summary(unset), expected, 'an unset window enforces nothing, even long after the due date');
    assert.equal(unset.detail, bare.detail);
    assert.notEqual(unset.missedTest, true);
  }
});

test('an external-original cycle keeps its own rules: no window, no missed-Test path', () => {
  const external = { mode: 'testCycle', passingScore: 70, externalAssessment: { source: 'District' } };
  const studentRecord = record({ externalAssessment: { originalScore: 50 }, test: assigned });
  const state = resolveTestCycleStage({ policy: external, record: studentRecord, reviewProgress: REVIEW_DONE, schedule: scheduleAt(MOMENT.afterLateDue) });
  assert.deepEqual(summary(state), [STAGE.TEST, true, 'Start Retest']);
  assert.notEqual(state.missedTest, true);
});
