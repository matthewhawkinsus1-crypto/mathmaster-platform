/*
 * A RETEST WITH NO ORIGINAL TEST, AND A GRADE A TEACHER SETS BY HAND.
 *
 * Two things the grade rule had no words for. A student who missed the Test
 * and took the Retest has an actual Retest score and no original: both facts
 * are kept and shown, and the recorded grade is the capped one. And a teacher
 * may record something else — the Review score, the actual Retest score, a
 * grade of their own — which replaces the RECORDED grade only, names its
 * source, and leaves an audit row each time it is set, changed or removed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GRADE_HISTORY_REASON, GRADE_SOURCE, buildTestCycleGradeState } from '../../functions/shared/testCycleGrade.mjs';
import {
  GRADE_ADJUSTMENT_SOURCE, applyRetestReleased, applyTeacherGradeAdjustment, applyTestReleased, clearTeacherGradeAdjustment,
  normalizeTestCycleRecord, recordGradeState, testCycleGradeBreakdown,
} from '../../functions/shared/testCycleRecord.mjs';

const policy = { mode: 'testCycle', passingScore: 70, retest: { maxRecordedGrade: 70 } };
const missedThenRetested = (rawScore) => applyRetestReleased(
  { assignmentId: 'a', studentId: 's', retest: { examSessionId: 'r1', state: 'submitted', withoutOriginal: true } },
  { rawScore, policy, releasedAt: 100 },
);

test('a Retest with no original is recorded at the cap, with the actual score kept beside it', () => {
  const state = buildTestCycleGradeState({ originalTestGrade: null, rawRetestGrade: 86, policy });
  assert.deepEqual(
    [state.originalTestGrade, state.rawRetestGrade, state.retestCappedContribution, state.recordedGrade, state.recordedGradeSource, state.retestCapApplied, state.retestWithoutOriginal],
    [null, 86, 70, 70, GRADE_SOURCE.RETEST, true, true],
  );
  assert.equal(state.reason, 'No original Test was taken. The Retest score was 86%; it is recorded at the 70% retest cap.');
  // Below the cap nothing is capped, and the sentence does not claim it was.
  const low = buildTestCycleGradeState({ originalTestGrade: null, rawRetestGrade: 64, policy });
  assert.deepEqual([low.recordedGrade, low.retestCapApplied, low.reason], [64, false, 'No original Test was taken. The Retest score of 64% is recorded.']);
  // Averaging has nothing to average with: it is the capped Retest, not half of it.
  const averaging = { ...policy, retest: { ...policy.retest, gradeReplacement: 'averageIfHigherCapped' } };
  assert.equal(buildTestCycleGradeState({ originalTestGrade: null, rawRetestGrade: 86, policy: averaging }).recordedGrade, 70);
  // The ordinary cases are untouched.
  assert.equal(buildTestCycleGradeState({ originalTestGrade: 52, rawRetestGrade: 84, policy }).retestWithoutOriginal, false);
  assert.equal(buildTestCycleGradeState({ originalTestGrade: 52, rawRetestGrade: 84, policy }).reason, 'Retest raw 84% recorded at the 70% retest cap.');
});

test('the record stores it as a Retest score and the breakdown says the Test was not taken', () => {
  const record = missedThenRetested(86);
  assert.deepEqual([record.retest.rawScore, record.retest.withoutOriginal, record.test.rawScore, record.recordedGrade], [86, true, null, 70]);
  assert.equal(record.corrections.required, false, 'no corrections are owed for answers never given');
  assert.equal(record.history.at(-1).reason, GRADE_HISTORY_REASON.RETEST_RELEASED);
  assert.deepEqual([record.history.at(-1).rawRetestGrade, record.history.at(-1).originalTestGrade, record.history.at(-1).recordedGrade], [86, null, 70]);
  const breakdown = testCycleGradeBreakdown(record, policy);
  assert.deepEqual(breakdown.rows, [
    { key: 'originalTest', label: 'Original Test', value: 'Not taken' },
    { key: 'retest', label: 'Retest', value: '86% raw' },
    { key: 'retestPolicy', label: 'Retest policy', value: 'capped at 70%' },
    { key: 'recordedGrade', label: 'Recorded grade', value: '70%' },
  ]);
  // A record nobody adjusted keeps the exact shape it always had.
  const plain = normalizeTestCycleRecord({ assignmentId: 'a', studentId: 's', test: { examSessionId: 't1' } });
  assert.deepEqual(Object.keys(plain), ['assignmentId', 'studentId', 'recordId', 'classId', 'blueprintId', 'blueprintVersion', 'review', 'test', 'retest', 'corrections', 'teacherControls', 'history', 'classroom', 'updatedAt']);
  assert.equal('withoutOriginal' in plain.retest, false);
});

test('a teacher\'s adjustment replaces the recorded grade only, and names where it came from', () => {
  const base = missedThenRetested(86);
  const adjusted = applyTeacherGradeAdjustment(base, {
    grade: 86, source: GRADE_ADJUSTMENT_SOURCE.RETEST_ACTUAL, note: 'Absent with a doctor\'s note', by: 'teacher@example.org', at: 500, policy,
  });
  const state = recordGradeState(adjusted, policy);
  assert.deepEqual([state.recordedGrade, state.recordedGradeSource, state.ruleRecordedGrade], [86, GRADE_SOURCE.TEACHER_ADJUSTMENT, 70]);
  // What the student earned is exactly what it was.
  assert.deepEqual([state.rawRetestGrade, state.retestCappedContribution, state.originalTestGrade, adjusted.retest.rawScore], [86, 70, null, 86]);
  assert.equal(state.reason, 'Set by the teacher to 86% from the actual Retest score (Absent with a doctor\'s note). The grade rule alone would record 70%.');
  assert.equal(state.passed, true);
  assert.equal(adjusted.recordedGrade, 86);
  assert.deepEqual(adjusted.gradeAdjustment, { grade: 86, source: 'retestActual', note: 'Absent with a doctor\'s note', by: 'teacher@example.org', at: 500 });
  assert.deepEqual(adjusted.history.at(-1), {
    at: 500,
    reason: GRADE_HISTORY_REASON.TEACHER_ADJUSTMENT,
    recordedGrade: 86,
    originalTestGrade: null,
    rawRetestGrade: 86,
    retestCappedContribution: 70,
    detail: state.reason,
    by: 'teacher@example.org',
    source: 'retestActual',
    previousRecordedGrade: 70,
  });
  assert.ok(testCycleGradeBreakdown(adjusted, policy).rows.some((row) => row.key === 'gradeAdjustment' && row.value === '86% from the actual Retest score'));
});

test('the Review score can be recorded for a student with no secure score at all', () => {
  const noScores = { assignmentId: 'a', studentId: 's', test: { examSessionId: 't1', state: 'assigned' } };
  assert.equal(recordGradeState(noScores, policy).recordedGrade, null);
  const fromReview = applyTeacherGradeAdjustment(noScores, { grade: 84, source: GRADE_ADJUSTMENT_SOURCE.REVIEW, by: 'teacher@example.org', at: 700, policy });
  const state = recordGradeState(fromReview, policy);
  assert.deepEqual([state.recordedGrade, state.recordedGradeSource, state.ruleRecordedGrade, state.originalTestGrade], [84, GRADE_SOURCE.TEACHER_ADJUSTMENT, null, null]);
  assert.equal(state.reason, 'Set by the teacher to 84% from the Review score. The grade rule alone would record no grade.');
  assert.equal(fromReview.history.at(-1).previousRecordedGrade, null);
  // The Review result stays apart from the secure scores: neither slot is filled.
  assert.deepEqual([fromReview.test.rawScore, fromReview.retest.rawScore], [null, null]);
});

test('every change is an audit row, and removing the adjustment returns to the rule', () => {
  let record = applyTestReleased({ assignmentId: 'a', studentId: 's', test: { examSessionId: 't1', state: 'submitted' } }, { rawScore: 54, policy, releasedAt: 100 });
  record = applyTeacherGradeAdjustment(record, { grade: 60, source: 'manual', note: 'Regraded item 4', by: 't1', at: 200, policy });
  record = applyTeacherGradeAdjustment(record, { grade: 60, source: 'manual', note: 'Regraded item 4', by: 't1', at: 250, policy });
  assert.equal(record.history.filter((row) => row.reason === GRADE_HISTORY_REASON.TEACHER_ADJUSTMENT).length, 1, 'the same decision twice is one row');
  record = applyTeacherGradeAdjustment(record, { grade: 60, source: 'manual', note: 'Regraded items 4 and 5', by: 't1', at: 300, policy });
  record = applyTeacherGradeAdjustment(record, { grade: 65, source: 'manual', note: 'Regraded items 4 and 5', by: 't2', at: 400, policy });
  assert.deepEqual(
    record.history.filter((row) => row.reason === GRADE_HISTORY_REASON.TEACHER_ADJUSTMENT).map((row) => `${row.by}:${row.previousRecordedGrade}>${row.recordedGrade}`),
    ['t1:54>60', 't1:60>60', 't2:60>65'],
  );
  // A release that lands later does not undo the teacher's decision.
  const retested = applyRetestReleased({ ...record, retest: { examSessionId: 'r1', state: 'submitted' } }, { rawScore: 90, policy, releasedAt: 500 });
  assert.deepEqual([recordGradeState(retested, policy).recordedGrade, recordGradeState(retested, policy).ruleRecordedGrade], [65, 70]);

  const cleared = clearTeacherGradeAdjustment(retested, { by: 't2', at: 600, policy });
  assert.equal('gradeAdjustment' in cleared, false);
  assert.deepEqual([cleared.recordedGrade, recordGradeState(cleared, policy).recordedGradeSource], [70, GRADE_SOURCE.RETEST]);
  assert.deepEqual(
    (({ reason, by, previousRecordedGrade, recordedGrade }) => ({ reason, by, previousRecordedGrade, recordedGrade }))(cleared.history.at(-1)),
    { reason: GRADE_HISTORY_REASON.TEACHER_ADJUSTMENT_CLEARED, by: 't2', previousRecordedGrade: 65, recordedGrade: 70 },
  );
  // Nothing to remove writes nothing.
  assert.deepEqual(clearTeacherGradeAdjustment(cleared, { by: 't2', at: 700, policy }), normalizeTestCycleRecord(cleared));
  // A grade outside 0–100 is clamped; no grade at all is refused.
  assert.equal(applyTeacherGradeAdjustment(cleared, { grade: 140, source: 'manual', by: 't2', at: 800, policy }).gradeAdjustment.grade, 100);
  assert.throws(() => applyTeacherGradeAdjustment(cleared, { grade: '', source: 'manual', policy }), /grade between 0 and 100/);
  assert.equal(applyTeacherGradeAdjustment(cleared, { grade: 50, source: 'somewhereElse', by: 't2', at: 900, policy }).gradeAdjustment.source, 'manual');
});
