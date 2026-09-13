import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEST_CYCLE_STAGE,
  resolveTestCycleStage,
  stageIsSecure,
  visibleStageIds,
} from '../../functions/shared/testCycleStages.mjs';
import { applyTeacherControlAction } from '../../functions/shared/testCyclePolicy.mjs';

/*
 * ONE CARD, ONE STAGE.
 *
 * The rule a student experiences is that Review, Test, Corrections and Retest
 * are never four assignments and are never simultaneously offered. Every test
 * here is a way of failing that rule.
 */

const POLICY = { mode: 'testCycle' };
const base = { assignmentId: 'A1', studentId: 'S1' };
const stageFor = (record, reviewProgress = null) => resolveTestCycleStage({ policy: POLICY, record, reviewProgress });

test('Review is what a student sees first, and the Test is gated behind it', () => {
  const state = stageFor({ ...base }, { total: 4, attempted: 0, complete: false });
  assert.equal(state.stage, TEST_CYCLE_STAGE.REVIEW);
  assert.equal(state.secure, false);
  assert.equal(state.hintsAllowed, true, 'review is instruction; help is the point of it');
  assert.deepEqual(visibleStageIds(state), [TEST_CYCLE_STAGE.REVIEW]);
});

test('finishing Review opens the Test and nothing else', () => {
  const state = stageFor(
    { ...base, review: { complete: true }, test: { examSessionId: 'e1', state: 'assigned' } },
    { total: 4, attempted: 4, complete: true },
  );
  assert.equal(state.stage, TEST_CYCLE_STAGE.TEST);
  assert.equal(state.secure, true);
  assert.equal(state.hintsAllowed, false, 'no hints, no AI help, no remediation during the secure Test');
  assert.deepEqual(visibleStageIds(state), [TEST_CYCLE_STAGE.TEST]);
});

test('a Test Cycle with no Review content cannot be gated on Review', () => {
  const state = stageFor(
    { ...base, test: { examSessionId: 'e1', state: 'assigned' } },
    { total: 0, attempted: 0, complete: false },
  );
  assert.equal(state.stage, TEST_CYCLE_STAGE.TEST);
});

test('a submitted Test says nothing about a retest before results are released', () => {
  const state = stageFor({ ...base, review: { complete: true }, test: { examSessionId: 'e1', state: 'submitted' } });
  assert.equal(state.stage, TEST_CYCLE_STAGE.AWAITING_RELEASE);
  assert.equal(state.canEnter, false);
  // Telling a student a retest is coming is telling them they failed, before
  // their teacher has released anything.
  assert.doesNotMatch(state.detail, /retest/i);
  assert.doesNotMatch(state.detail, /correction/i);
});

test('a passing Test does not expose Corrections or Retest', () => {
  const state = stageFor({
    ...base,
    review: { complete: true },
    test: { examSessionId: 'e1', state: 'released', rawScore: 88 },
  });
  assert.equal(state.stage, TEST_CYCLE_STAGE.PASSED);
  assert.equal(state.recordedGrade, 88);
  assert.deepEqual(visibleStageIds(state), [TEST_CYCLE_STAGE.PASSED]);
  assert.notEqual(state.stage, TEST_CYCLE_STAGE.CORRECTIONS);
  assert.notEqual(state.stage, TEST_CYCLE_STAGE.RETEST);
});

test('a teacher may explicitly open a retest for a passing student, and only explicitly', () => {
  const record = {
    ...base,
    review: { complete: true },
    test: { examSessionId: 'e1', state: 'released', rawScore: 88 },
    retest: { examSessionId: 'r1', state: 'assigned' },
  };
  assert.equal(stageFor(record).stage, TEST_CYCLE_STAGE.PASSED);
  assert.equal(
    stageFor({ ...record, teacherControls: { retestUnlocked: true } }).stage,
    TEST_CYCLE_STAGE.RETEST,
  );
});

test('a failed released Test sends the student to Corrections, which are instructional', () => {
  const state = stageFor({
    ...base,
    review: { complete: true },
    test: { examSessionId: 'e1', state: 'released', rawScore: 58 },
    corrections: { required: true, planId: 'p1', total: 3 },
  });
  assert.equal(state.stage, TEST_CYCLE_STAGE.CORRECTIONS);
  assert.equal(state.secure, false, 'corrections are remediation, not a secure environment');
  assert.equal(state.hintsAllowed, true);
  assert.equal(stageIsSecure(state.stage), false);
  assert.match(state.detail, /do not change your recorded grade/i);
});

test('completing Corrections is the gate that opens the Retest', () => {
  const withOpenCorrections = stageFor({
    ...base,
    review: { complete: true },
    test: { state: 'released', rawScore: 58 },
    corrections: { required: true, planId: 'p1', total: 3, completedTargets: 1 },
  });
  assert.equal(withOpenCorrections.stage, TEST_CYCLE_STAGE.CORRECTIONS);

  const afterCorrections = stageFor({
    ...base,
    review: { complete: true },
    test: { state: 'released', rawScore: 58 },
    corrections: { required: true, planId: 'p1', total: 3, completedTargets: 3, complete: true },
    retest: { examSessionId: 'r1', state: 'assigned' },
  });
  assert.equal(afterCorrections.stage, TEST_CYCLE_STAGE.RETEST);
  assert.equal(afterCorrections.secure, true, 'the retest is the same secure environment as the Test');
  assert.equal(afterCorrections.hintsAllowed, false);
});

test('teacher overrides: waive corrections, unlock, disable, require', () => {
  const failed = {
    ...base,
    review: { complete: true },
    test: { state: 'released', rawScore: 58 },
    corrections: { required: true, planId: 'p1', total: 3 },
  };

  const waived = stageFor({ ...failed, teacherControls: { correctionsWaived: true }, retest: { examSessionId: 'r1', state: 'assigned' } });
  assert.equal(waived.stage, TEST_CYCLE_STAGE.RETEST, 'waiving corrections skips the gate');

  const unlocked = stageFor({ ...failed, teacherControls: { retestUnlocked: true }, retest: { examSessionId: 'r1', state: 'assigned' } });
  assert.equal(unlocked.stage, TEST_CYCLE_STAGE.RETEST, 'unlocking overrides the corrections gate');

  const disabled = stageFor({ ...failed, teacherControls: { retestDisabled: true } });
  assert.equal(disabled.stage, TEST_CYCLE_STAGE.RETEST_CLOSED);
  assert.equal(disabled.canEnter, false);

  // Requiring corrections again clears a prior waiver.
  const controls = applyTeacherControlAction({ correctionsWaived: true }, 'requireCorrections');
  assert.equal(controls.correctionsWaived, false);
  assert.equal(controls.requireCorrections, true);
});

test('unlocking a retest clears a prior disable, and disabling clears a prior unlock', () => {
  assert.deepEqual(
    { ...applyTeacherControlAction({ retestDisabled: true }, 'unlockRetest') },
    { ...applyTeacherControlAction({}, 'unlockRetest') },
  );
  const disabled = applyTeacherControlAction({ retestUnlocked: true }, 'disableRetest');
  assert.equal(disabled.retestDisabled, true);
  assert.equal(disabled.retestUnlocked, false);
});

test('an unsupported teacher action is refused rather than ignored', () => {
  assert.throws(() => applyTeacherControlAction({}, 'raiseGrade'), /Unsupported Test Cycle teacher action/);
});

test('exactly one stage is ever offered, across every reachable state', () => {
  const records = [
    { ...base },
    { ...base, review: { complete: true } },
    { ...base, review: { complete: true }, test: { examSessionId: 'e1', state: 'in_progress' } },
    { ...base, review: { complete: true }, test: { examSessionId: 'e1', state: 'submitted' } },
    { ...base, review: { complete: true }, test: { state: 'released', rawScore: 88 } },
    { ...base, review: { complete: true }, test: { state: 'released', rawScore: 58 }, corrections: { required: true, planId: 'p' } },
    { ...base, review: { complete: true }, test: { state: 'released', rawScore: 58 }, corrections: { required: true, complete: true } },
    { ...base, review: { complete: true }, test: { state: 'released', rawScore: 58 }, retest: { examSessionId: 'r1', state: 'submitted' } },
    { ...base, review: { complete: true }, test: { state: 'released', rawScore: 58 }, retest: { state: 'released', rawScore: 82 } },
    { ...base, review: { complete: true }, test: { state: 'released', rawScore: 58 }, teacherControls: { retestDisabled: true } },
  ];
  for (const record of records) {
    const state = stageFor(record, { total: 2, complete: record.review?.complete === true });
    assert.equal(visibleStageIds(state).length, 1, `exactly one stage for ${JSON.stringify(record)}`);
    assert.ok(Object.values(TEST_CYCLE_STAGE).includes(state.stage));
  }
});

test('a non-Test-Cycle assignment gets no stage at all', () => {
  assert.equal(resolveTestCycleStage({ policy: null, record: base }), null);
  assert.equal(resolveTestCycleStage({ policy: { mode: 'lesson' }, record: base }), null);
});
