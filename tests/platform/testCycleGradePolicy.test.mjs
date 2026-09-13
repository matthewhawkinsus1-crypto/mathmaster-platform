import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTestCycleGradeState,
  cappedRetestContribution,
  recordedTestCycleGrade,
  testCycleClassroomPassback,
} from '../../functions/shared/testCycleGrade.mjs';
import {
  applyRetestReleased,
  applyTestReleased,
  normalizeTestCycleRecord,
  testCycleGradeBreakdown,
} from '../../functions/shared/testCycleRecord.mjs';
import { normalizeTestCyclePolicy } from '../../functions/shared/testCyclePolicy.mjs';

/*
 * THE GRADING POLICY, WHICH IS THE WHOLE FEATURE.
 *
 *   recordedGrade = max(originalTestGrade, min(rawRetestGrade, 70))
 *
 * Issue #220 lists five worked examples. They are the contract, so they are
 * asserted literally — if any one of them changes, a real student's recorded
 * grade changes with it.
 */

const POLICY = { mode: 'testCycle' };

test('the five canonical recorded-grade examples from the policy', () => {
  const cases = [
    { test: 52, retest: 84, recorded: 70, why: 'Test 52, Retest 84 -> recorded 70' },
    { test: 52, retest: 64, recorded: 64, why: 'Test 52, Retest 64 -> recorded 64' },
    { test: 68, retest: 69, recorded: 69, why: 'Test 68, Retest 69 -> recorded 69' },
    { test: 68, retest: 92, recorded: 70, why: 'Test 68, Retest 92 -> recorded 70' },
    { test: 75, retest: null, recorded: 75, why: 'Test 75 remains 75' },
  ];
  for (const example of cases) {
    assert.equal(
      recordedTestCycleGrade({ originalTestGrade: example.test, rawRetestGrade: example.retest }),
      example.recorded,
      example.why,
    );
  }
});

test('an original score above the cap is never reduced by a retest', () => {
  // The reason the cap is applied INSIDE the max() rather than outside it.
  // min(max(75, 92), 70) would be 70, and would take five points off a student
  // who had already passed.
  assert.equal(recordedTestCycleGrade({ originalTestGrade: 75, rawRetestGrade: 92 }), 75);
  assert.equal(recordedTestCycleGrade({ originalTestGrade: 88, rawRetestGrade: 100 }), 88);
  assert.equal(recordedTestCycleGrade({ originalTestGrade: 100, rawRetestGrade: 0 }), 100);
});

test('a raw retest above the cap is preserved for history and capped for the record', () => {
  const state = buildTestCycleGradeState({ originalTestGrade: 52, rawRetestGrade: 84, policy: POLICY });
  assert.equal(state.rawRetestGrade, 84, 'the student earned 84 and the record must keep saying so');
  assert.equal(state.retestCappedContribution, 70);
  assert.equal(state.recordedGrade, 70);
  assert.equal(state.retestCapApplied, true);
  assert.equal(state.recordedGradeSource, 'retest');
});

test('the cap is the policy authority, not a silent replace-if-higher', () => {
  assert.equal(cappedRetestContribution(84, 70), 70);
  assert.equal(cappedRetestContribution(64, 70), 64);
  // A policy that named a different cap is honoured; the DEFAULT is 70.
  assert.equal(normalizeTestCyclePolicy(POLICY).retest.maxRecordedGrade, 70);
  assert.equal(
    buildTestCycleGradeState({
      originalTestGrade: 40, rawRetestGrade: 95, policy: { mode: 'testCycle', retest: { maxRecordedGrade: 80 } },
    }).recordedGrade,
    80,
  );
});

test('no retest and no released test produce no grade, never a zero', () => {
  assert.equal(recordedTestCycleGrade({}), null);
  assert.equal(buildTestCycleGradeState({ policy: POLICY }).recordedGrade, null);
  // "Not graded yet" and "scored zero" are different facts about a student.
  assert.notEqual(buildTestCycleGradeState({ policy: POLICY }).recordedGrade, 0);
});

test('the record keeps the original Test score when a retest replaces the grade', () => {
  let record = normalizeTestCycleRecord({ assignmentId: 'A1', studentId: 'S1' });
  record = applyTestReleased(record, { rawScore: 58, policy: POLICY, releasedAt: 1000 });
  assert.equal(record.recordedGrade, 58);
  record = applyRetestReleased(record, { rawScore: 82, policy: POLICY, releasedAt: 2000 });

  assert.equal(record.recordedGrade, 70, 'capped at the policy maximum');
  assert.equal(record.test.rawScore, 58, 'the original Test score is not destroyed');
  assert.equal(record.retest.rawScore, 82, 'the raw retest score is not destroyed');
});

test('the score history records each release with its reason', () => {
  let record = normalizeTestCycleRecord({ assignmentId: 'A1', studentId: 'S1' });
  record = applyTestReleased(record, { rawScore: 58, policy: POLICY, releasedAt: 1000 });
  record = applyRetestReleased(record, { rawScore: 82, policy: POLICY, releasedAt: 2000 });

  assert.equal(record.history.length, 2);
  assert.deepEqual(record.history.map((row) => row.reason), ['testReleased', 'retestReleased']);
  assert.equal(record.history[0].recordedGrade, 58);
  assert.equal(record.history[1].recordedGrade, 70);
  assert.equal(record.history[1].rawRetestGrade, 82);
  assert.match(record.history[1].detail, /cap/i, 'the audit reason has to say why it is 70');
});

test('the Grade Center breakdown shows every number the policy example names', () => {
  let record = normalizeTestCycleRecord({ assignmentId: 'A1', studentId: 'S1' });
  record = applyTestReleased(record, { rawScore: 58, policy: POLICY, releasedAt: 1 });
  record = { ...record, corrections: { ...record.corrections, required: true, complete: true } };
  record = applyRetestReleased(record, { rawScore: 82, policy: POLICY, releasedAt: 2 });

  const rows = Object.fromEntries(testCycleGradeBreakdown(record, POLICY).rows.map((row) => [row.key, row.value]));
  assert.equal(rows.originalTest, '58%');
  assert.equal(rows.corrections, 'Complete');
  assert.equal(rows.retest, '82% raw');
  assert.equal(rows.retestPolicy, 'capped at 70%');
  assert.equal(rows.recordedGrade, '70%');
});

test('a cycle with no retest stays simple', () => {
  let record = normalizeTestCycleRecord({ assignmentId: 'A1', studentId: 'S1' });
  record = applyTestReleased(record, { rawScore: 86, policy: POLICY, releasedAt: 1 });
  const breakdown = testCycleGradeBreakdown(record, POLICY);
  assert.equal(breakdown.simple, true);
  assert.deepEqual(breakdown.rows.map((row) => row.key), ['originalTest', 'recordedGrade']);
});

test('Classroom passback posts, updates, and refuses to lower', () => {
  assert.deepEqual(
    testCycleClassroomPassback({ recordedGrade: 52, previouslyPostedGrade: null }).shouldPost,
    true,
    'the original recorded Test grade is posted',
  );
  const raised = testCycleClassroomPassback({ recordedGrade: 70, previouslyPostedGrade: 52 });
  assert.equal(raised.shouldPost, true);
  assert.equal(raised.grade, 70, 'the SAME item is updated to the higher recorded grade');

  const lowered = testCycleClassroomPassback({ recordedGrade: 64, previouslyPostedGrade: 68 });
  assert.equal(lowered.shouldPost, false);
  assert.equal(lowered.refusedLowering, true);
  assert.equal(lowered.grade, 68, 'Classroom keeps the higher posted grade');

  const unchanged = testCycleClassroomPassback({ recordedGrade: 70, previouslyPostedGrade: 70 });
  assert.equal(unchanged.shouldPost, false, 'nothing to say, so nothing is sent');
});

test('a lower retest never moves the recorded grade, so Classroom is never asked to lower it', () => {
  let record = normalizeTestCycleRecord({ assignmentId: 'A1', studentId: 'S1' });
  record = applyTestReleased(record, { rawScore: 68, policy: POLICY, releasedAt: 1 });
  const posted = record.recordedGrade;
  record = applyRetestReleased(record, { rawScore: 64, policy: POLICY, releasedAt: 2 });
  assert.equal(record.recordedGrade, 68);
  assert.equal(testCycleClassroomPassback({ recordedGrade: record.recordedGrade, previouslyPostedGrade: posted }).shouldPost, false);
});
