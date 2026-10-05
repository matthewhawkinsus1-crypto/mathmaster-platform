import test from 'node:test';
import assert from 'node:assert/strict';
import testCycle from '../../functions/lib/testCycle.js';
import mathPath from '../../functions/lib/mathPath.js';
import { normalizeTestCyclePolicy } from '../../functions/shared/testCyclePolicy.mjs';
import { applyTestReleased, recordGradeState } from '../../functions/shared/testCycleRecord.mjs';
import { resolveTestCycleStage, buildTestCyclePhaseStatus } from '../../functions/shared/testCycleStages.mjs';
import { buildFieldGradingDefinition } from '../../functions/shared/legacyFieldGrading.mjs';
import { validateExternalOriginalScore } from '../../functions/shared/externalAssessment.mjs';
import toolDraft from '../../functions/lib/secureExamToolDraft.js';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { sanitizeClientAttemptRecord } from '../../functions/shared/submissionIngestion.mjs';

const policy = { mode: 'testCycle', externalAssessment: { source: 'Eduphoria' }, review: { minimumMastery: 80 }, corrections: { requiredForRetest: false } };
const record = { assignmentId: 'dol2', studentId: 's', externalAssessment: { originalScore: 52, source: 'Eduphoria', recordedBy: 't', recordedAt: 123 }, test: { examSessionId: 'exam', state: 'assigned' } };

test('external-original policy and provenance survive normalization; invalid scores fail closed', () => {
  const normalized = normalizeTestCyclePolicy(policy);
  assert.equal(normalized.externalAssessment.source, 'Eduphoria');
  assert.equal(normalized.review.minimumMastery, 80);
  for (const score of [null, '', ' ', -1, 101, NaN, Infinity, true, {}, []]) assert.throws(() => validateExternalOriginalScore(score));
  assert.equal(validateExternalOriginalScore(0), 0);
  assert.equal(validateExternalOriginalScore('69.75'), 69.75);
});

test('external original is preserved while the existing first secure session contributes the retest', () => {
  for (const [raw, expected] of [[84, 70], [64.25, 64.25], [35, 52], [69.99, 69.99]]) {
    const released = applyTestReleased(record, { policy, rawScore: raw, releasedAt: 456 });
    const grade = recordGradeState(released, policy);
    assert.equal(grade.originalTestGrade, 52);
    assert.equal(grade.rawRetestGrade, raw);
    assert.equal(grade.recordedGrade, expected);
    assert.deepEqual(released.externalAssessment, record.externalAssessment);
    assert.equal(released.corrections.required, false);
    assert.equal(released.history.at(-1).reason, 'retestReleased');
    const state = resolveTestCycleStage({ policy, record: released });
    assert.equal(state.stage, 'complete');
    assert.equal(state.actionLabel, 'Review Retest');
    assert.deepEqual(buildTestCyclePhaseStatus({ state, record: released }).map(p => p.label), ['Review', 'Retest']);
  }
});

test('missing and passing external originals cannot unlock any secure session', () => {
  for (const originalScore of [null, 70, 92]) {
    const state = resolveTestCycleStage({ policy, record: { ...record, externalAssessment: { originalScore } }, reviewProgress: { total: 7, attempted: 7, complete: true, mastery: 100 } });
    assert.equal(state.canEnter, false);
    assert.equal(state.secure, false);
  }
  const state = resolveTestCycleStage({ policy, record, reviewProgress: { total: 7, attempted: 7, complete: true, mastery: 80 } });
  assert.equal(state.stage, 'test');
  assert.equal(state.actionLabel, 'Start Retest');
});

test('mastery review needs all seven attempts and unrounded 80%, not rounded display credit', () => {
  const assignment = { schemaVersion: 5, assessmentPolicy: policy, sections: [{ id: 'review', role: 'review', questions: Array.from({ length: 7 }, (_, i) => ({ questionId: `r${i}`, questionWeight: 1 })) }] };
  const tracker = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, { status: 'attempted', totalAttempts: 1, bestPartialCredit: 80, bestRawPartialCredit: 80 }]));
  assert.equal(testCycle.reviewProgress(assignment, tracker).complete, true);
  tracker[6].bestPartialCredit = 79;
  tracker[6].bestRawPartialCredit = 79;
  assert.equal(testCycle.reviewProgress(assignment, tracker).complete, false);
  tracker[6] = { status: 'unattempted', totalAttempts: 0 };
  for (let i = 0; i < 6; i++) tracker[i].bestRawPartialCredit = 100;
  assert.equal(testCycle.reviewProgress(assignment, tracker).complete, false);
  tracker[6] = { status: 'working', totalAttempts: 0 };
  assert.equal(testCycle.reviewProgress(assignment, tracker).attempted, 6);
  assert.equal(testCycle.reviewProgress(assignment, tracker).complete, false);
});

test('private field weights distinguish axis variable from its numeric value', async () => {
  const grading = buildFieldGradingDefinition({ responseFields: [{ id: 'variable', expected: 'x', weight: .25 }, { id: 'value', expected: 20, weight: .75 }] });
  assert.equal((await mathPath.gradeResponse(grading, { responses: { variable: 'y', value: 20 } })).score, .75);
});

test('opt-in finite set credit ignores ordering and duplicates, penalizes extras, and accepts equivalent numbers', async () => {
  const grading = buildFieldGradingDefinition({ responseFields: [{ id: 'zeros', expected: '{-2,4}', equivalence: 'numericSet', partialCredit: 'matchedElements' }] });
  for (const [answer, expected] of [['{4,-2,4}', 1], ['{4}', .5], ['{4,9}', .5], ['{-2,4,9}', 2/3], ['{8/2,-2}', 1], ['[4,-2]', 0], ['{9,10}', 0]]) {
    assert.equal((await mathPath.gradeResponse(grading, { responses: { zeros: answer } })).score, expected, answer);
  }
});

test('external retest keeps unrounded raw credit; existing secure tests retain their rounding', () => {
  const session = { issuancePlan: { entries: [{ questionInstanceId: 'q', weight: 1 }] }, responses: { q: { questionInstanceId: 'q', grading: { score: .6999 } } } };
  assert.equal(testCycle.weightedSessionScorePercent(session), 70);
  assert.equal(testCycle.weightedSessionScorePercent(session, { preservePrecision: true }), 69.99);
});

test('regression draft survives resume with bounded rows and no client grading fields', () => {
  const rows = Array.from({ length: 6 }, (_, i) => [String(i), '42']);
  const saved = toolDraft.sanitizeSecureExamToolDraft({ linearRegression: { rows, ran: true, expected: 5 }, privateGrading: {} });
  assert.deepEqual(saved, { linearRegression: { rows: rows.map(cells => ({ cells })), ran: true } });
  assert.deepEqual(toolDraft.sanitizeSecureExamToolDraft(saved), saved);
  for (const value of [null, {}, { linearRegression: { rows: [] } }, { linearRegression: { rows: Array(6).fill([{}, '1']) } }]) assert.equal(toolDraft.sanitizeSecureExamToolDraft(value), null);
});

test('rounded task scores cannot open a review whose raw average is below 80%', () => {
  const assignment = { schemaVersion: 5, assessmentPolicy: policy, sections: [{ id: 'review', role: 'review', questions: Array.from({ length: 7 }, () => ({ questionWeight: 1 })) }] };
  const tracker = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, { status: 'correct', totalAttempts: 1, bestRawPartialCredit: 100 }]));
  tracker[0] = recordQuestionAttempt({ record: {}, isCorrect: false, partialCreditPercent: 50, rawPartialCreditPercent: 50 }).record;
  tracker[3] = recordQuestionAttempt({ record: {}, isCorrect: false, partialCreditPercent: 10, rawPartialCreditPercent: 100 * 2 / 7 / 3 }).record;
  const progress = testCycle.reviewProgress(assignment, tracker);
  assert.ok(progress.mastery < 80);
  assert.equal(progress.complete, false);
  tracker[3] = recordQuestionAttempt({ record: tracker[3], isCorrect: false, rawPartialCreditPercent: 10 }).record;
  assert.equal(testCycle.reviewProgress(assignment, tracker).complete, true);
  delete tracker[6].bestRawPartialCredit;
  assert.equal(testCycle.reviewProgress(assignment, tracker).complete, false, 'a claimed correct status is not exact server evidence');
});

test('a claimed record cannot forge exact mastery or overwrite canonical exact credit', () => {
  for (const canonicalRecord of [{}, { bestRawPartialCredit: 20, status: 'attempted', attemptCount: 1 }]) {
    const result = sanitizeClientAttemptRecord({ envelope: { kind: 'stepSubmission', record: { bestRawPartialCredit: 100, status: 'attempted', attemptCount: 1 } }, canonicalRecord, maximumAttempts: 3, allowClaimedCorrect: false });
    assert.equal(result.bestRawPartialCredit, canonicalRecord.bestRawPartialCredit);
  }
});
