/*
 * THE ACADEMIC TIME OF A RECOVERED ATTEMPT.
 *
 * A submission captured on September 14 and delivered on September 15 is
 * September 14 work. It belongs to that instructional day, to that DOL date
 * bucket, and to that position in the student's history. The first version of
 * the recovery path recorded it as September 15, because every recorder stamped
 * `new Date()` internally and every ingestion path passed its own `now` as the
 * occurrence time.
 *
 * That is not a cosmetic difference. A DOL is filed under a date key: recording
 * a Friday DOL as Monday files it where the class it belongs to cannot see it,
 * and a teacher looking at Friday sees nothing.
 *
 * So academic occurrence time and server ingestion time are two different
 * facts, and these tests pin which one reaches which field.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordQuestionAttempt,
  recordQuestionStep,
  resolveOccurrenceIso,
} from '../../functions/shared/attemptPolicy.mjs';
import {
  buildIngestedAttempt,
  buildSubmissionEnvelope,
  resolveAcademicOccurrenceAt,
} from '../../functions/shared/submissionIngestion.mjs';
import {
  buildCheckpointFinalization,
  resolveCheckpointOccurrenceAt,
} from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { CHECKPOINT_STATUS } from '../../functions/shared/responseCheckpointSchema.mjs';

/* The incident's two days, in the school's own timezone (America/Chicago). */
const SEPT_14_CLASS = Date.parse('2026-09-14T15:10:00Z'); // 10:10 CDT, Monday
const SEPT_14_CLOSE = Date.parse('2026-09-14T20:00:00Z'); // 15:00 CDT, same day
const SEPT_15_RECOVERY = Date.parse('2026-09-15T14:00:00Z'); // 09:00 CDT, next day
const RELEASED_AT = '2026-09-10';

const dayOf = (iso) => String(iso).slice(0, 10);

const LITERAL = (activityRole) => ({
  type: 'literal',
  acceptedAnswers: ['2x+1'],
  solveFor: 'y',
  activityRole,
  questionId: 'q-recovered',
  id: 'q-recovered',
  prompt: 'Solve for y',
});

const envelopeFor = (activityRole, capturedAt = SEPT_14_CLASS) => buildSubmissionEnvelope({
  actionId: 'recovered-sept-14',
  kind: 'ordinarySubmission',
  studentId: 'S1042',
  assignmentId: 'A1',
  questionIndex: 0,
  questionId: 'q-recovered',
  activityRole,
  capturedAt,
  previousTotalAttempts: 0,
  record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' },
  response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
});

/* ==========================================================================
 * THE SHARED RECORDERS TAKE AN OCCURRENCE TIME.
 * ======================================================================== */

test('an ordinary caller still gets the current time, and a recovery caller gets the time it proves', () => {
  const live = recordQuestionAttempt({ record: null, isCorrect: true });
  assert.ok(
    Math.abs(Date.parse(live.record.lastAttemptAt) - Date.now()) < 5_000,
    'omitting occurredAt must keep the existing behaviour for a student pressing Submit',
  );

  const recovered = recordQuestionAttempt({ record: null, isCorrect: true, occurredAt: SEPT_14_CLASS });
  assert.equal(recovered.record.lastAttemptAt, new Date(SEPT_14_CLASS).toISOString());
});

test('a recovered algebra step carries the academic time on the record and on the step grade', () => {
  const outcome = recordQuestionStep({
    record: null,
    stepGrade: { earned: 1, possible: 1, equationBefore: '2x=4', equationAfter: 'x=2' },
    countsAttempt: true,
    occurredAt: SEPT_14_CLASS,
  });
  assert.equal(outcome.record.lastAttemptAt, new Date(SEPT_14_CLASS).toISOString());
  assert.equal(outcome.record.stepGrades[0].recordedAt, new Date(SEPT_14_CLASS).toISOString());
});

test('an unreadable occurrence time falls back to now rather than to the epoch', () => {
  // `new Date(NaN)` throws on toISOString, and `new Date(0)` would file the
  // work in 1970. Neither may reach a grade record.
  ['not a date', Number.NaN, {}].forEach((value) => {
    assert.ok(Math.abs(Date.parse(resolveOccurrenceIso(value)) - Date.now()) < 5_000);
  });
  assert.equal(resolveOccurrenceIso('2026-09-14T15:10:00Z'), new Date(SEPT_14_CLASS).toISOString());
  assert.equal(resolveOccurrenceIso(new Date(SEPT_14_CLASS)), new Date(SEPT_14_CLASS).toISOString());
});

/* ==========================================================================
 * SEPTEMBER 14 CAPTURE → SEPTEMBER 15 INGESTION.
 * ======================================================================== */

test('a September 14 Classwork submission ingested on September 15 stays September 14 work', () => {
  const built = buildIngestedAttempt({
    envelope: envelopeFor('classwork'),
    assignment: { id: 'A1', releaseAt: RELEASED_AT },
    question: LITERAL('classwork'),
    canonicalRecord: null,
    classworkIndices: [0],
    ingestedAt: SEPT_15_RECOVERY,
  });

  assert.equal(built.record.lastAttemptAt, new Date(SEPT_14_CLASS).toISOString());
  assert.equal(dayOf(built.record.lastAttemptAt), '2026-09-14');
  assert.equal(built.record.academicOccurredAt, new Date(SEPT_14_CLASS).toISOString());
  // The delivery fact is recorded too — beside the grade, never inside it.
  assert.equal(built.record.ingestedAt, new Date(SEPT_15_RECOVERY).toISOString());
  assert.equal(built.record.recoveredLate, true);
});

test('the evidence event for that submission is September 14 evidence', () => {
  const built = buildIngestedAttempt({
    envelope: envelopeFor('classwork'),
    assignment: { id: 'A1', releaseAt: RELEASED_AT },
    question: LITERAL('classwork'),
    canonicalRecord: null,
    ingestedAt: SEPT_15_RECOVERY,
  });
  assert.equal(built.evidenceEvent.occurredAt, SEPT_14_CLASS);
  assert.equal(dayOf(new Date(built.evidenceEvent.occurredAt).toISOString()), '2026-09-14');
});

test('a September 14 DOL recovered on September 15 stays attached to September 14', () => {
  const built = buildIngestedAttempt({
    envelope: envelopeFor('dol'),
    assignment: { id: 'A1', releaseAt: RELEASED_AT },
    question: LITERAL('dol'),
    canonicalRecord: null,
    dolIndices: [0],
    dolSectionScore: 100,
    ingestedAt: SEPT_15_RECOVERY,
  });

  // The date key IS where a DOL lives. Filing it under the 15th puts it where
  // the class that sat it cannot see it.
  assert.equal(built.dolDateKey, '2026-09-14');
  assert.equal(built.dolGrade.recordedAt, new Date(SEPT_14_CLASS).toISOString());
  assert.equal(dayOf(built.dolGrade.recordedAt), '2026-09-14');
});

test('the classwork completion projection is stamped with the academic time', () => {
  const built = buildIngestedAttempt({
    envelope: envelopeFor('classwork'),
    assignment: { id: 'A1', releaseAt: RELEASED_AT, completionRule: { minEngagementMinutes: 0, minimumQuestionCompletionPercent: 100 } },
    question: LITERAL('classwork'),
    canonicalRecord: null,
    classworkIndices: [0],
    ingestedAt: SEPT_15_RECOVERY,
  });
  assert.ok(built.classworkGrade, 'the completion projection must be written when completion is met');
  assert.equal(built.classworkGrade.metAt, new Date(SEPT_14_CLASS).toISOString());
});

/* ==========================================================================
 * THE CLIENT CLOCK IS BOUNDED, NOT TRUSTED.
 * ======================================================================== */

test('a device clock cannot postdate work past the moment the server handles it', () => {
  const fromTheFuture = resolveAcademicOccurrenceAt({
    envelope: { capturedAt: SEPT_15_RECOVERY + 86_400_000 },
    assignment: { releaseAt: RELEASED_AT },
    ingestedAt: SEPT_15_RECOVERY,
  });
  assert.equal(fromTheFuture, SEPT_15_RECOVERY);
});

test('a device clock cannot backdate work before the assignment was released', () => {
  const beforeRelease = resolveAcademicOccurrenceAt({
    envelope: { capturedAt: Date.parse('2020-01-01T00:00:00Z') },
    assignment: { releaseAt: RELEASED_AT },
    ingestedAt: SEPT_15_RECOVERY,
  });
  assert.equal(dayOf(new Date(beforeRelease).toISOString()), '2026-09-10');
});

test('an envelope with no capture time falls back to the ingestion time', () => {
  assert.equal(
    resolveAcademicOccurrenceAt({ envelope: { capturedAt: null }, assignment: null, ingestedAt: SEPT_15_RECOVERY }),
    SEPT_15_RECOVERY,
  );
});

/* ==========================================================================
 * DELAYED CHECKPOINT RECOVERY.
 * ======================================================================== */

const checkpointFor = (activityRole) => ({
  documentId: 'cp-1',
  schemaVersion: 2,
  studentId: 'S1042',
  assignmentId: 'A1',
  questionIndex: 0,
  questionId: 'q-recovered',
  variantIndex: 0,
  activityRole,
  revision: 3,
  response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
  isComplete: true,
  previousTotalAttempts: 0,
  // Stamped by Firestore's own request.time under the rules, so a browser
  // cannot move it.
  serverAcknowledgedAt: new Date(SEPT_14_CLASS),
  clientMetadata: { timeSpentSeconds: 120 },
});

const decisionFor = (activityRole) => ({
  action: 'finalize',
  status: CHECKPOINT_STATUS.AUTO_SUBMITTED,
  reason: 'warmup-close',
  cutoff: SEPT_14_CLOSE,
  submissionId: 'deadline:cp-1:3',
  grading: {
    graded: true,
    isCorrect: true,
    isComplete: true,
    parts: [{ id: 'literal', label: 'Expression', isComplete: true, isCorrect: true, response: '2x+1' }],
  },
  activityRole,
  canonicalRecord: { totalAttempts: 0, attemptCount: 0, status: 'unattempted', variantIndex: 0 },
});

test('a checkpoint finalized a day late is recorded at its own deadline, not at the scheduler run', () => {
  const finalization = buildCheckpointFinalization({
    checkpoint: checkpointFor('warmup'),
    assignment: { id: 'A1' },
    question: LITERAL('warmup'),
    decision: decisionFor('warmup'),
    classworkIndices: [],
    runAt: SEPT_15_RECOVERY,
  });

  assert.equal(finalization.record.lastAttemptAt, new Date(SEPT_14_CLOSE).toISOString());
  assert.equal(dayOf(finalization.record.lastAttemptAt), '2026-09-14');
  assert.equal(finalization.record.academicOccurredAt, new Date(SEPT_14_CLOSE).toISOString());
  assert.equal(finalization.record.finalizedAtRunTime, new Date(SEPT_15_RECOVERY).toISOString());
  assert.equal(finalization.record.recoveredLate, true);
  assert.equal(finalization.evidenceEvent.occurredAt, SEPT_14_CLOSE);
});

test('a late-finalized DOL checkpoint stays in its own date bucket', () => {
  const finalization = buildCheckpointFinalization({
    checkpoint: checkpointFor('dol'),
    assignment: { id: 'A1' },
    question: LITERAL('dol'),
    decision: { ...decisionFor('dol'), reason: 'dol-close' },
    dolIndices: [0],
    dolSectionScore: 100,
    runAt: SEPT_15_RECOVERY,
  });
  assert.equal(finalization.dolDateKey, '2026-09-14');
  assert.equal(dayOf(finalization.dolGrade.recordedAt), '2026-09-14');
});

test('the acknowledgement bounds the close below, so a response cannot be recorded before MathMaster held it', () => {
  // A checkpoint acknowledged AFTER its close is `recovered-after-close` and
  // never finalizes, but if the times ever cross this must not invent a moment
  // before the server had the work.
  const acknowledgedLate = resolveCheckpointOccurrenceAt({
    checkpoint: { serverAcknowledgedAt: new Date(SEPT_14_CLOSE + 3_600_000) },
    decision: { cutoff: SEPT_14_CLOSE },
    runAt: SEPT_15_RECOVERY,
  });
  assert.equal(acknowledgedLate, SEPT_14_CLOSE + 3_600_000);

  // With no provable close, the acknowledgement is the best server-held time.
  assert.equal(
    resolveCheckpointOccurrenceAt({
      checkpoint: { serverAcknowledgedAt: new Date(SEPT_14_CLASS) },
      decision: {},
      runAt: SEPT_15_RECOVERY,
    }),
    SEPT_14_CLASS,
  );

  // With neither, the scheduler's clock is the only thing left.
  assert.equal(
    resolveCheckpointOccurrenceAt({ checkpoint: {}, decision: {}, runAt: SEPT_15_RECOVERY }),
    SEPT_15_RECOVERY,
  );
});

/* ==========================================================================
 * A LIVE SUBMISSION IS UNAFFECTED.
 * ======================================================================== */

test('a submission ingested immediately is not marked as a late recovery', () => {
  const now = Date.now();
  const built = buildIngestedAttempt({
    envelope: envelopeFor('classwork', now - 500),
    assignment: { id: 'A1', releaseAt: RELEASED_AT },
    question: LITERAL('classwork'),
    canonicalRecord: null,
    ingestedAt: now,
  });
  assert.equal(built.record.recoveredLate, null);
  assert.ok(Math.abs(Date.parse(built.record.lastAttemptAt) - now) < 5_000);
});
