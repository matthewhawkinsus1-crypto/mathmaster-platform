/*
 * THE CLIENT-RECORD SANITIZER HOLDS THE LINES ITS OWN CONTRACT PROMISES.
 *
 * For a surface the server still cannot mark (a client-graded tool mode, or a
 * response captured by an old client), ingestion keeps the browser's attempt
 * record — but only after rebuilding it from the server's canonical read. The
 * Phase 1 audit (docs/architecture/SERVER_GRADING_COVERAGE.md, "Sanitizer
 * gaps") probed three ways a crafted envelope got through anyway. Each is
 * pinned here, against the same rules recordQuestionAttempt applies to a
 * server-graded attempt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIngestedAttempt, sanitizeClientAttemptRecord } from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope, normalizeSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { getQuestionCredit, recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';

const ordinary = (record) => ({ kind: 'ordinarySubmission', record });

test('an exhausted expired question cannot be turned into a correct one by a claimed record', () => {
  const canonical = { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 40 };
  const claimed = { status: 'correct', attemptCount: 0, totalAttempts: 4, partialCredit: 100, bestPartialCredit: 100 };
  const record = sanitizeClientAttemptRecord({ envelope: ordinary(claimed), canonicalRecord: canonical, maximumAttempts: 3 });
  assert.equal(record.status, 'expired');
  assert.equal(record.attemptCount, 3);
  assert.equal(getQuestionCredit(record), 0.4);
  // The same rule the server-graded path applies.
  const serverGraded = recordQuestionAttempt({ record: canonical, isCorrect: true, maximumAttempts: 3 });
  assert.equal(serverGraded.record.status, 'expired');
});

test('a teacher-granted extra attempt reopens an expired question, exactly as it does for a server-graded attempt', () => {
  const canonical = { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 40 };
  const claimed = { status: 'correct', attemptCount: 4, totalAttempts: 4, partialCredit: 100, bestPartialCredit: 100 };
  const record = sanitizeClientAttemptRecord({ envelope: ordinary(claimed), canonicalRecord: canonical, maximumAttempts: 4 });
  assert.equal(record.status, 'correct');
  assert.equal(record.attemptCount, 4);
  assert.equal(recordQuestionAttempt({ record: canonical, isCorrect: true, maximumAttempts: 4 }).record.status, 'correct');
});

test('a correct question stays exactly as the server recorded it', () => {
  const canonical = { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100 };
  const claimed = { status: 'attempted', attemptCount: 0, totalAttempts: 2, partialCredit: 0, bestPartialCredit: 0 };
  const record = sanitizeClientAttemptRecord({ envelope: ordinary(claimed), canonicalRecord: canonical, maximumAttempts: 3 });
  assert.equal(record.status, 'correct');
  assert.equal(record.attemptCount, 1);
  assert.equal(record.totalAttempts, 1);
});

test('the attempt count never goes backwards and advances by at most one', () => {
  const canonical = { status: 'attempted', attemptCount: 2, totalAttempts: 2, partialCredit: 30, bestPartialCredit: 30 };
  // A claimed reset to zero, with a new attempt.
  const reset = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'attempted', attemptCount: 0, totalAttempts: 3, partialCredit: 30 }),
    canonicalRecord: canonical,
    maximumAttempts: 5,
  });
  assert.equal(reset.attemptCount, 3, 'the count the server read, plus the one attempt this envelope made');
  // A claimed reset with no new attempt.
  const still = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'attempted', attemptCount: 0, totalAttempts: 2, partialCredit: 30 }),
    canonicalRecord: canonical,
    maximumAttempts: 5,
  });
  assert.equal(still.attemptCount, 2);
  // A claimed jump.
  const jump = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'attempted', attemptCount: 0 }),
    canonicalRecord: { status: 'unattempted', attemptCount: 0, totalAttempts: 0 },
    maximumAttempts: 5,
  });
  assert.equal(jump.attemptCount, 0);
  const minted = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'attempted', attemptCount: 4, totalAttempts: 9 }),
    canonicalRecord: { status: 'unattempted', attemptCount: 0, totalAttempts: 0 },
    maximumAttempts: 5,
  });
  assert.equal(minted.attemptCount, 1);
  assert.equal(minted.totalAttempts, 1);
});

test('a claimed 100% is not full credit unless the record is correct, and credit never falls', () => {
  const canonical = { status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 60, bestPartialCredit: 60 };
  const inflated = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'attempted', attemptCount: 2, totalAttempts: 2, partialCredit: 100, bestPartialCredit: 100 }),
    canonicalRecord: canonical,
    maximumAttempts: 3,
  });
  assert.equal(inflated.partialCredit, 90);
  assert.equal(inflated.bestPartialCredit, 90);
  assert.ok(getQuestionCredit(inflated) < 1, 'partial work must never impersonate a correct answer');

  const lowered = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'attempted', attemptCount: 2, totalAttempts: 2, partialCredit: 10, bestPartialCredit: 10 }),
    canonicalRecord: canonical,
    maximumAttempts: 3,
  });
  assert.equal(lowered.partialCredit, 60);
  assert.equal(lowered.bestPartialCredit, 60);

  const correct = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'correct', attemptCount: 2, totalAttempts: 2, partialCredit: 100, bestPartialCredit: 100 }),
    canonicalRecord: canonical,
    maximumAttempts: 3,
  });
  assert.equal(correct.status, 'correct');
  assert.equal(getQuestionCredit(correct), 1);
});

test('an authorized replacement still resets the attempt history', () => {
  const canonical = { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 40, variantIndex: 0 };
  const record = sanitizeClientAttemptRecord({
    envelope: { kind: 'questionReplacement', record: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, bestPartialCredit: 0, variantIndex: 1 } },
    canonicalRecord: canonical,
    maximumAttempts: 3,
  });
  assert.equal(record.status, 'unattempted');
  assert.equal(record.attemptCount, 0);
  assert.equal(record.variantIndex, 1);
});

test('a replacement the server did not authorize changes nothing on an exhausted question', () => {
  const canonical = { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 40, variantIndex: 2 };
  const record = sanitizeClientAttemptRecord({
    envelope: { kind: 'questionReplacement', record: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 2 } },
    canonicalRecord: canonical,
    maximumAttempts: 3,
  });
  assert.equal(record.status, 'expired');
  assert.equal(record.attemptCount, 3);
});

test('the last attempt, claimed as merely "attempted", is recorded as expired — so it cannot be followed by another', () => {
  const canonical = { status: 'attempted', attemptCount: 0, totalAttempts: 0 };
  const first = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'attempted', attemptCount: 0, totalAttempts: 1, partialCredit: 20 }),
    canonicalRecord: canonical,
    maximumAttempts: 1,
  });
  assert.equal(first.attemptCount, 1);
  assert.equal(first.status, 'expired', 'a one-try DOL question is finished after its one attempt');
  const second = sanitizeClientAttemptRecord({
    envelope: ordinary({ status: 'correct', attemptCount: 0, totalAttempts: 2, partialCredit: 100 }),
    canonicalRecord: first,
    maximumAttempts: 1,
  });
  assert.equal(second.status, 'expired');
  assert.equal(getQuestionCredit(second), 0.2);
});

/* ---------------------------------------------------------------------------
 * The two ways round server grading that the audit reproduced.
 * ------------------------------------------------------------------------- */

const ASSIGNMENT = { id: 'A1', schemaVersion: 5, releaseAt: '2026-09-01T00:00:00Z' };
const CAPTURED_AT = Date.parse('2026-09-14T15:00:00Z');
const LITERAL = { questionId: 'q-lit', type: 'literal', prompt: 'Solve A = bh for h.', equation: 'A = bh', solveFor: 'h', acceptedAnswers: ['A/b'] };
// Generated per student in the browser from a seed the server does not re-run:
// the server cannot reproduce it, so its verdict stays on the device.
const GENERATED = { ...LITERAL, questionId: 'q-gen', generator: { kind: 'literalEquation' } };
const forgedCorrect = { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100 };

const ingest = ({ kind = 'ordinarySubmission', question, response = null, record = forgedCorrect }) => buildIngestedAttempt({
  envelope: normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-${kind}-${question.questionId}`,
    kind,
    studentId: 'S1',
    assignmentId: 'A1',
    questionIndex: 0,
    questionId: question.questionId,
    activityRole: 'classwork',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: 0,
    record,
    response,
  })),
  assignment: ASSIGNMENT,
  question,
  canonicalRecord: null,
  ingestedAt: CAPTURED_AT + 1000,
});

test('withholding the raw response for a question the server can mark does not buy a "correct"', () => {
  // The control: with the response, the server marks it.
  const graded = ingest({ question: LITERAL, response: { kind: 'scalar', type: 'literal', value: 'WRONG', fields: [] } });
  assert.equal(graded.gradedBy, 'server');
  assert.equal(graded.record.status, 'attempted');
  // Without it, the claim is kept only as far as it could be legitimate.
  const withheld = ingest({ question: LITERAL, response: null });
  assert.equal(withheld.gradedBy, 'client');
  assert.equal(withheld.record.serverGradingReason, 'no-raw-response');
  assert.equal(withheld.record.status, 'attempted');
  assert.ok(getQuestionCredit(withheld.record) < 1);
});

test('a step submission cannot complete a question, whatever record it carries', () => {
  const step = ingest({ kind: 'stepSubmission', question: LITERAL, response: { kind: 'scalar', type: 'literal', value: 'WRONG', fields: [] } });
  assert.equal(step.gradedBy, 'client');
  assert.equal(step.record.status, 'attempted');
  assert.ok(getQuestionCredit(step.record) < 1);
});

test('a question the server cannot reproduce keeps its client verdict, bounded', () => {
  const kept = ingest({ question: GENERATED, response: { kind: 'scalar', type: 'literal', value: 'A/b', fields: [] } });
  assert.equal(kept.gradedBy, 'client');
  assert.equal(kept.record.status, 'correct', 'a question still graded on the device is not regressed');
});
