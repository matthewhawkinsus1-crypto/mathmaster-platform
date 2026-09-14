/*
 * DEADLINE AUTO-SUBMIT: THE SECURITY AND CORRECTNESS CONTRACT.
 *
 * A response checkpoint is written by a student's browser into a
 * student-writable document, and is later read by an Admin SDK function that
 * can write official grades. Every test in this file exists because of that
 * sentence.
 *
 * The decision and the finalization are pure functions, so these run them
 * directly rather than against a mock Firestore. A forged checkpoint is then
 * just an object — which is what makes the forgery cases honest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildCheckpointFinalization,
  checkpointSubmissionId,
  decideCheckpointFinalization,
  dolSectionProjection,
  verifyCheckpointAuthorization,
} from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { CHECKPOINT_STATUS } from '../../functions/shared/responseCheckpointSchema.mjs';
import { buildResponseCheckpointAction } from '../../src/platform/performance/responseCheckpoint.js';
import { normalizeQuestionRecord } from '../../functions/shared/attemptPolicy.mjs';

const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
const workspaceStoreSource = readFileSync(new URL('../../src/platform/persistence/workspaceDraftStore.js', import.meta.url), 'utf8');

/* --------------------------------------------------------------------------
 * Fixtures. One Monday, one class, one bell schedule.
 * Chicago 10:00–10:50 is 15:00–15:50Z on 2026-09-14 (CDT), so the Warm-Up's
 * default ten-minute cutoff is 15:10Z.
 * ------------------------------------------------------------------------ */
const DAY = '2026-09-14';
const CLASS_ID = 'class-a';
const CLASS_PERIOD = 'Period 3';
const WARMUP_CLOSE = Date.parse('2026-09-14T15:10:00Z');
const DURING_WARMUP = Date.parse('2026-09-14T15:05:00Z');
const AFTER_WARMUP = Date.parse('2026-09-14T15:11:00Z');

const SCHEDULE = {
  version: 2,
  daySchedules: { A: { periods: { [CLASS_PERIOD]: { enabled: true, start: '10:00', end: '10:50' } } } },
  weeklyDayTypes: { 1: 'A' },
  dayTypeOverrides: { [DAY]: 'A' },
  modifiedSchedules: {},
};

const warmupQuestion = {
  questionId: 'q-warmup-1',
  type: 'literal',
  activityRole: 'warmup',
  solveFor: 'h',
  prompt: 'Solve A = bh for h.',
  acceptedAnswers: ['A/b'],
};

const classworkQuestion = {
  questionId: 'q-classwork-1',
  type: 'multiAnswer',
  activityRole: 'classwork',
  prompt: 'Give the slope and the intercept.',
  answerFields: [{ id: 'slope', answer: '3' }, { id: 'intercept', answer: '-2' }],
};

const dolQuestion = {
  questionId: 'q-dol-1',
  type: 'orderedPair',
  activityRole: 'dol',
  prompt: 'Where do the lines meet?',
  solution: [2, 5],
};

const buildAssignment = (patch = {}) => ({
  id: 'A1',
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  dueAt: '2026-09-20',
  lateDueAt: '2026-09-21',
  warmup: { enabled: true, instructionDate: DAY },
  dol: { enabled: true, instructionDate: DAY },
  sections: [
    { id: 's-warmup', role: 'warmup', questions: [warmupQuestion] },
    { id: 's-classwork', role: 'classwork', questions: [classworkQuestion] },
    { id: 's-dol', role: 'dol', questions: [dolQuestion] },
  ],
  ...patch,
});

// The same projection functions/index.js hands the finalizer.
const runtimeQuestions = (assignment) => (assignment.sections || []).flatMap((section) => (
  (section.questions || []).map((question) => ({ ...question, activityRole: question.activityRole || section.role }))
));

const buildGradeDocument = (patch = {}) => ({
  studentId: 'S1042',
  classId: CLASS_ID,
  classPeriod: CLASS_PERIOD,
  gradesByAssignment: {},
  ...patch,
});

/**
 * Build a checkpoint the way the browser actually builds one, then apply the
 * server acknowledgement Firestore would have stamped. Using the real client
 * builder is deliberate: a test that hand-wrote the payload would not notice
 * the day the builder started smuggling a verdict.
 */
const buildCheckpoint = ({
  question = warmupQuestion,
  questionIndex = 0,
  activityRole = 'warmup',
  answerState,
  previousTotalAttempts = 0,
  revision = 1,
  capturedAt = DURING_WARMUP,
  acknowledgedAt = capturedAt,
  finalizeAt = new Date(WARMUP_CLOSE).toISOString(),
  classId = CLASS_ID,
  status = CHECKPOINT_STATUS.ACTIVE,
  patch = {},
} = {}) => {
  const action = buildResponseCheckpointAction({
    identity: {
      studentId: 'S1042',
      assignmentId: 'A1',
      questionIndex,
      questionId: question.questionId,
      variantIndex: 0,
      generationKey: `A1|S1042|${questionIndex}|variant:0`,
    },
    question,
    activityRole,
    answerState,
    revision,
    finalizeAt,
    finalizationReason: 'warmup-close',
    finalizationContext: { classId, classPeriod: CLASS_PERIOD },
    previousTotalAttempts,
    capturedAt,
  });
  assert.ok(action, 'the client refused to build a checkpoint for this fixture');
  return {
    ...action.payload,
    classId,
    // Firestore stamps this with request.time; a browser cannot set it.
    serverAcknowledgedAt: new Date(acknowledgedAt),
    status,
    ...patch,
  };
};

const decide = ({
  checkpoint,
  assignment = buildAssignment(),
  gradeDocument = buildGradeDocument(),
  questionIndex = null,
  now = AFTER_WARMUP,
  isSecureAssignment = false,
} = {}) => decideCheckpointFinalization({
  checkpoint,
  assignment,
  gradeDocument,
  gradeDocumentId: 'S1042',
  question: runtimeQuestions(assignment)[questionIndex ?? Number(checkpoint.questionIndex)] || null,
  schedule: SCHEDULE,
  classPeriod: CLASS_PERIOD,
  isSecureAssignment,
  now,
});

/**
 * One scheduler pass over one checkpoint, mirroring the transaction body in
 * functions/index.js: decide, then write the canonical record back. Used by
 * the idempotency and multi-run tests.
 */
const runScheduler = ({ store, now = AFTER_WARMUP }) => {
  const decision = decide({ checkpoint: store.checkpoint, assignment: store.assignment, gradeDocument: store.grade, now });
  if (decision.action === 'reschedule') {
    store.checkpoint = { ...store.checkpoint, candidateFinalizeAt: new Date(decision.finalizeAt) };
    return decision;
  }
  if (decision.action === 'close') {
    store.checkpoint = { ...store.checkpoint, status: decision.status, candidateFinalizeAt: null };
    return decision;
  }
  if (decision.action !== 'finalize') return decision;
  const finalization = buildCheckpointFinalization({
    checkpoint: store.checkpoint,
    assignment: store.assignment,
    question: runtimeQuestions(store.assignment)[Number(store.checkpoint.questionIndex)],
    decision,
    occurredAt: now,
  });
  store.grade = {
    ...store.grade,
    gradesByAssignment: {
      ...store.grade.gradesByAssignment,
      A1: { ...(store.grade.gradesByAssignment.A1 || {}), [String(store.checkpoint.questionIndex)]: finalization.record },
    },
  };
  store.evidence = [...(store.evidence || []), finalization.evidenceEvent];
  store.checkpoint = { ...store.checkpoint, status: decision.status, candidateFinalizeAt: null };
  return { ...decision, finalization };
};

const newStore = (patch = {}) => ({
  assignment: buildAssignment(),
  grade: buildGradeDocument(),
  evidence: [],
  ...patch,
});

const completeLiteral = (value) => ({ isComplete: true, responseKey: value, parts: [] });

/* ==========================================================================
 * 1-6. THE SERVER GRADES THE RESPONSE. NOTHING THE CLIENT CLAIMS IS READ.
 * ======================================================================== */

test('a checkpoint claiming a correct answer is recorded wrong when the raw response is wrong', () => {
  // The browser says it was right. The response says 'b/A'. The key is 'A/b'.
  const store = newStore({
    checkpoint: buildCheckpoint({
      answerState: { isComplete: true, isCorrect: true, responseKey: 'b/A', partialCreditPercent: 100, parts: [] },
    }),
  });
  const result = runScheduler({ store });
  assert.equal(result.action, 'finalize');
  assert.equal(result.finalization.result.isCorrect, false);
  assert.equal(store.grade.gradesByAssignment.A1['0'].status, 'attempted');
});

test('a correct raw response is recorded correct, graded on the server', () => {
  const store = newStore({ checkpoint: buildCheckpoint({ answerState: completeLiteral('A/b') }) });
  const result = runScheduler({ store });
  assert.equal(result.action, 'finalize');
  assert.equal(result.finalization.result.isCorrect, true);
  assert.equal(store.grade.gradesByAssignment.A1['0'].status, 'correct');
  assert.equal(store.grade.gradesByAssignment.A1['0'].gradedBy, 'server');
});

test('a client-supplied score never reaches the canonical record', () => {
  const store = newStore({
    checkpoint: buildCheckpoint({
      answerState: completeLiteral('b/A'),
      patch: { score: 100, partialCreditPercent: 100 },
    }),
  });
  const result = runScheduler({ store });
  // A checkpoint carrying a score is a forgery attempt, not a draft.
  assert.equal(result.action, 'close');
  assert.equal(result.status, CHECKPOINT_STATUS.INVALID_CONTEXT);
  assert.match(result.reason, /client-supplied-grading-data/);
  assert.equal(store.grade.gradesByAssignment.A1, undefined);
});

test('a client-supplied isCorrect never reaches the canonical record', () => {
  const store = newStore({
    checkpoint: buildCheckpoint({ answerState: completeLiteral('b/A'), patch: { isCorrect: true } }),
  });
  const result = runScheduler({ store });
  assert.equal(result.status, CHECKPOINT_STATUS.INVALID_CONTEXT);
  assert.match(result.reason, /client-supplied-grading-data.*isCorrect/);
});

test('a client-supplied canonical record never reaches the canonical record', () => {
  const store = newStore({
    checkpoint: buildCheckpoint({
      answerState: completeLiteral('b/A'),
      patch: { record: { status: 'correct', partialCredit: 100, totalAttempts: 1 } },
    }),
  });
  const result = runScheduler({ store });
  assert.equal(result.status, CHECKPOINT_STATUS.INVALID_CONTEXT);
  assert.match(result.reason, /client-supplied-grading-data.*record/);
  assert.equal(store.grade.gradesByAssignment.A1, undefined);
});

test('a client-supplied evidence verdict never becomes evidence', () => {
  const store = newStore({
    checkpoint: buildCheckpoint({
      answerState: completeLiteral('b/A'),
      patch: { evidenceEvent: { eventKey: 'ev_forged', isCorrect: true, score: 1 } },
    }),
  });
  const result = runScheduler({ store });
  assert.equal(result.status, CHECKPOINT_STATUS.INVALID_CONTEXT);
  assert.equal(store.evidence.length, 0);
});

test('evidence is derived from the server result, not from anything the client sent', () => {
  const store = newStore({ checkpoint: buildCheckpoint({ answerState: completeLiteral('b/A') }) });
  runScheduler({ store });
  const [event] = store.evidence;
  assert.ok(event?.eventKey, 'the finalizer wrote an evidence event');
  assert.equal(event.performance.isCorrect, false);
  assert.equal(event.performance.score, 0);
  assert.equal(event.source.activityRole, 'warmup');
});

test('the client builder itself refuses to construct a checkpoint carrying a verdict', () => {
  // The forged cases above reach the server only by writing Firestore directly.
  // Through the app, the schema stops it first.
  const action = buildResponseCheckpointAction({
    identity: { studentId: 'S1042', assignmentId: 'A1', questionIndex: 0, questionId: 'q-warmup-1' },
    question: warmupQuestion,
    activityRole: 'warmup',
    answerState: { isComplete: true, isCorrect: true, responseKey: 'A/b', partialCreditPercent: 100, parts: [] },
    revision: 1,
    finalizeAt: new Date(WARMUP_CLOSE).toISOString(),
  });
  const keys = Object.keys(action.payload);
  for (const forbidden of ['isCorrect', 'score', 'record', 'submissionEnvelope', 'evidenceEvent', 'partialCreditPercent', 'partGrades', 'totalAttempts']) {
    assert.ok(!keys.includes(forbidden), `checkpoint payload must not carry ${forbidden}`);
  }
});

/* ==========================================================================
 * 7-10. THE LATEST STATE IS THE ONLY STATE THE DEADLINE MAY ACT ON.
 * ======================================================================== */

test('complete then incomplete: the stale completed response is not submitted', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), revision: 1 });
  // The student changes their mind and leaves the box half-finished.
  store.checkpoint = buildCheckpoint({
    answerState: { isComplete: false, responseKey: 'A/', parts: [] },
    revision: 2,
  });
  const result = runScheduler({ store });
  assert.equal(result.action, 'close');
  assert.equal(result.status, CHECKPOINT_STATUS.INCOMPLETE_AT_CLOSE);
  assert.equal(store.grade.gradesByAssignment.A1, undefined);
});

test('complete then blank: nothing is auto-submitted', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), revision: 1 });
  store.checkpoint = buildCheckpoint({ answerState: { isComplete: true, responseKey: '', parts: [] }, revision: 2 });
  const result = runScheduler({ store });
  assert.equal(result.status, CHECKPOINT_STATUS.INCOMPLETE_AT_CLOSE);
  assert.equal(store.grade.gradesByAssignment.A1, undefined);
  assert.equal(store.evidence.length, 0);
});

test('a cleared response is written as a real revision, not skipped', () => {
  // The bug this replaces: only complete states were checkpointed, so deleting
  // an answer left the completed one as the latest state on the server.
  const tombstone = buildResponseCheckpointAction({
    identity: { studentId: 'S1042', assignmentId: 'A1', questionIndex: 0, questionId: 'q-warmup-1' },
    question: warmupQuestion,
    activityRole: 'warmup',
    answerState: { isComplete: false, responseKey: '', parts: [] },
    revision: 2,
    finalizeAt: new Date(WARMUP_CLOSE).toISOString(),
  });
  assert.ok(tombstone, 'an incomplete response must still produce a checkpoint revision');
  assert.equal(tombstone.payload.isComplete, false);
  assert.equal(tombstone.payload.revision, 2);
});

test('incomplete then complete: the later complete response finalizes', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({ answerState: { isComplete: false, responseKey: 'A', parts: [] }, revision: 1 });
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), revision: 2 });
  const result = runScheduler({ store });
  assert.equal(result.action, 'finalize');
  assert.equal(store.grade.gradesByAssignment.A1['0'].status, 'correct');
});

test('an older checkpoint cannot overwrite newer canonical work', () => {
  const store = newStore({
    grade: buildGradeDocument({
      gradesByAssignment: { A1: { 0: { status: 'attempted', totalAttempts: 2, attemptCount: 2, variantIndex: 0 } } },
    }),
  });
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), previousTotalAttempts: 1 });
  const result = runScheduler({ store });
  assert.equal(result.status, CHECKPOINT_STATUS.SKIPPED_NEWER_SUBMISSION);
  assert.equal(store.grade.gradesByAssignment.A1[0].totalAttempts, 2);
});

/* ==========================================================================
 * 11-15. ONE RESPONSE IS ONE ATTEMPT.
 * ======================================================================== */

test('a manual Submit before the deadline leaves nothing for the scheduler to do', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), previousTotalAttempts: 0 });
  // The student presses Submit. The submission transaction records the attempt
  // and retires the checkpoint in the same step.
  store.grade.gradesByAssignment = { A1: { 0: { status: 'correct', totalAttempts: 1, attemptCount: 1, variantIndex: 0, lastSubmissionId: 'student_action_1' } } };
  store.checkpoint = { ...store.checkpoint, status: CHECKPOINT_STATUS.EXPLICITLY_SUBMITTED, candidateFinalizeAt: null };
  const result = runScheduler({ store });
  assert.equal(result.action, 'skip');
  assert.equal(store.grade.gradesByAssignment.A1[0].totalAttempts, 1);
});

test('manual Submit, then pagehide, then the deadline: exactly one attempt', () => {
  const store = newStore();
  store.grade.gradesByAssignment = { A1: { 0: { status: 'attempted', totalAttempts: 1, attemptCount: 1, variantIndex: 0, lastSubmissionId: 'student_action_1' } } };
  // The page-lifecycle flush wrote a checkpoint anyway (a browser that raced
  // the lock, or an older tab). Its expected attempt count is the one from
  // BEFORE the submission, which is what stops it.
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), previousTotalAttempts: 0 });
  const result = runScheduler({ store });
  assert.equal(result.action, 'close');
  assert.equal(result.status, CHECKPOINT_STATUS.SKIPPED_NEWER_SUBMISSION);
  assert.equal(store.grade.gradesByAssignment.A1[0].totalAttempts, 1, 'exactly one attempt');
  assert.equal(store.evidence.length, 0);
});

test('a manual Submit racing the scheduler still produces exactly one attempt', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), previousTotalAttempts: 0 });
  // The scheduler wins the race and finalizes.
  const first = runScheduler({ store });
  assert.equal(first.action, 'finalize');
  assert.equal(store.grade.gradesByAssignment.A1['0'].totalAttempts, 1);
  // The queued manual submission then reconciles. Its own precondition —
  // previousTotalAttempts 0 against a canonical 1 — rejects it, exactly as the
  // ordinary outbox already rejects a stale envelope.
  const canonical = normalizeQuestionRecord(store.grade.gradesByAssignment.A1['0']);
  assert.notEqual(Number(canonical.totalAttempts), 0);
});

test('a scheduler retry after a successful finalization is idempotent', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), previousTotalAttempts: 0 });
  runScheduler({ store });
  const afterFirst = JSON.stringify(store.grade.gradesByAssignment);
  // Simulate the retry seeing a checkpoint still marked active — a crash
  // between the grade write and the checkpoint update.
  store.checkpoint = { ...store.checkpoint, status: CHECKPOINT_STATUS.ACTIVE, candidateFinalizeAt: new Date(WARMUP_CLOSE) };
  const retry = runScheduler({ store });
  assert.equal(retry.action, 'close');
  assert.equal(retry.status, CHECKPOINT_STATUS.AUTO_SUBMITTED);
  assert.equal(retry.reason, 'already-finalized');
  assert.equal(JSON.stringify(store.grade.gradesByAssignment), afterFirst);
  assert.equal(store.evidence.length, 1);
});

test('every scheduler run derives the same submission receipt id', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), revision: 7 });
  assert.equal(checkpointSubmissionId(checkpoint), checkpointSubmissionId({ ...checkpoint }));
  assert.match(checkpointSubmissionId(checkpoint), /^deadline:.*:7$/);
  const store = newStore({ checkpoint });
  const result = runScheduler({ store });
  assert.equal(store.grade.gradesByAssignment.A1['0'].lastSubmissionId, checkpointSubmissionId(checkpoint));
  assert.equal(result.submissionId, checkpointSubmissionId(checkpoint));
});

/* ==========================================================================
 * 16-21. THE DEADLINE BELONGS TO THE SERVER.
 * ======================================================================== */

test('a malicious future candidateFinalizeAt cannot buy extra time', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({
    answerState: completeLiteral('A/b'),
    // The student wrote "my Warm-Up closes next week".
    finalizeAt: '2026-09-21T23:00:00Z',
    capturedAt: DURING_WARMUP,
  });
  // Work captured during the window still counts...
  const inTime = runScheduler({ store });
  assert.equal(inTime.action, 'finalize');
  assert.equal(inTime.cutoff, WARMUP_CLOSE, 'the cutoff is the real Warm-Up close, not the claim');

  // ...and work captured after the real close does not, however late the
  // client claimed the deadline was.
  const late = newStore();
  late.checkpoint = buildCheckpoint({
    answerState: completeLiteral('A/b'),
    finalizeAt: '2026-09-21T23:00:00Z',
    capturedAt: Date.parse('2026-09-14T15:30:00Z'),
  });
  const result = runScheduler({ store: late, now: Date.parse('2026-09-14T15:31:00Z') });
  assert.equal(result.status, CHECKPOINT_STATUS.RECOVERED_AFTER_CLOSE);
  assert.equal(late.grade.gradesByAssignment.A1, undefined);
});

test('a malicious early candidateFinalizeAt cannot close valid work early', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({
    answerState: completeLiteral('A/b'),
    // The student claims the Warm-Up already closed, hoping to bank the answer.
    finalizeAt: '2026-09-14T15:01:00Z',
    capturedAt: DURING_WARMUP,
  });
  const result = runScheduler({ store, now: Date.parse('2026-09-14T15:02:00Z') });
  assert.equal(result.action, 'reschedule');
  assert.equal(result.finalizeAt, WARMUP_CLOSE);
  assert.equal(store.grade.gradesByAssignment.A1, undefined, 'valid work is not finalized early');
});

test('the Warm-Up cutoff is derived from the class schedule, not from the checkpoint', () => {
  // No hint at all: the server still knows when the Warm-Up closed.
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b'), patch: { candidateFinalizeAt: null } });
  const result = decide({ checkpoint });
  assert.equal(result.action, 'finalize');
  assert.equal(result.cutoff, WARMUP_CLOSE);
  assert.equal(result.reason, 'warmup-close');
});

test('the DOL cutoff is derived from the class schedule', () => {
  const assignment = buildAssignment();
  const checkpoint = buildCheckpoint({
    question: dolQuestion,
    questionIndex: 2,
    activityRole: 'dol',
    answerState: { isComplete: true, responseKey: '(2,5)', parts: [] },
    capturedAt: Date.parse('2026-09-14T15:40:00Z'),
    patch: { candidateFinalizeAt: null },
  });
  // Period ends 10:50 Chicago; the DOL closes five minutes before the bell.
  const result = decide({ checkpoint, assignment, now: Date.parse('2026-09-14T15:46:00Z') });
  assert.equal(result.action, 'finalize');
  assert.equal(result.reason, 'dol-close');
  assert.equal(result.cutoff, Date.parse('2026-09-14T15:45:00Z'));
});

test('lateDueAt is the final close for a whole-assignment section', () => {
  const assignment = buildAssignment();
  const checkpoint = buildCheckpoint({
    question: classworkQuestion,
    questionIndex: 1,
    activityRole: 'classwork',
    answerState: { isComplete: true, responseKey: '{}', parts: [{ id: 'slope', response: '3', isComplete: true }, { id: 'intercept', response: '-2', isComplete: true }] },
    capturedAt: DURING_WARMUP,
    patch: { candidateFinalizeAt: null },
  });
  const afterLate = Date.parse('2026-09-22T06:00:00Z');
  const result = decide({ checkpoint, assignment, now: afterLate });
  assert.equal(result.action, 'finalize');
  assert.equal(result.reason, 'assignment-final-deadline');
});

test('dueAt does not final-close while a later late window remains', () => {
  const assignment = buildAssignment();
  const checkpoint = buildCheckpoint({
    question: classworkQuestion,
    questionIndex: 1,
    activityRole: 'classwork',
    answerState: { isComplete: true, responseKey: '{}', parts: [{ id: 'slope', response: '3', isComplete: true }, { id: 'intercept', response: '-2', isComplete: true }] },
    capturedAt: DURING_WARMUP,
    patch: { candidateFinalizeAt: null },
  });
  // A day past dueAt, still inside lateDueAt.
  const result = decide({ checkpoint, assignment, now: Date.parse('2026-09-21T06:00:00Z') });
  assert.equal(result.action, 'reschedule');
  assert.equal(result.reason, 'assignment-final-deadline');
});

/* ==========================================================================
 * 22-26. TEACHER CONTROLS ARE AUTHORITATIVE AND CURRENT.
 * ======================================================================== */

test('a Warm-Up extension reschedules instead of finalizing', () => {
  const extendedTo = Date.parse('2026-09-14T15:20:00Z');
  const assignment = buildAssignment({
    warmup: {
      enabled: true,
      instructionDate: DAY,
      autoCloseByClassId: { [CLASS_ID]: { dateKey: DAY, closesAt: new Date(extendedTo).toISOString() } },
    },
  });
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = decide({ checkpoint, assignment, now: AFTER_WARMUP });
  assert.equal(result.action, 'reschedule');
  assert.equal(result.finalizeAt, extendedTo);
  // ...and at the extended time the latest response finalizes normally.
  const later = decide({ checkpoint, assignment, now: extendedTo + 1000 });
  assert.equal(later.action, 'finalize');
  assert.equal(later.cutoff, extendedTo);
});

test('a teacher reopen is a real credit window for work captured inside it', () => {
  const reopenUntil = Date.parse('2026-09-14T15:50:00Z');
  const assignment = buildAssignment({
    warmup: {
      enabled: true,
      instructionDate: DAY,
      autoCloseByClassId: { [CLASS_ID]: { dateKey: DAY, closesAt: new Date(reopenUntil).toISOString(), reason: 'manual-reopen-until-class-end' } },
    },
  });
  const checkpoint = buildCheckpoint({
    answerState: completeLiteral('A/b'),
    // Captured after the normal ten-minute cutoff, inside the reopened window.
    capturedAt: Date.parse('2026-09-14T15:30:00Z'),
  });
  const result = decide({ checkpoint, assignment, now: reopenUntil + 1000 });
  assert.equal(result.action, 'finalize');
  assert.equal(result.cutoff, reopenUntil);
});

test('a manual Warm-Up close is the authoritative cutoff, whatever the timer said', () => {
  const closedAt = Date.parse('2026-09-14T15:06:00Z');
  const assignment = buildAssignment({
    warmup: {
      enabled: true,
      instructionDate: DAY,
      closedByClassId: { [CLASS_ID]: { dateKey: DAY, closedAt: new Date(closedAt).toISOString() } },
    },
  });
  const inTime = decide({
    checkpoint: buildCheckpoint({ answerState: completeLiteral('A/b'), capturedAt: Date.parse('2026-09-14T15:05:00Z') }),
    assignment,
    now: Date.parse('2026-09-14T15:07:00Z'),
  });
  assert.equal(inTime.action, 'finalize');
  assert.equal(inTime.reason, 'manual-section-close');
  assert.equal(inTime.cutoff, closedAt);

  const afterClose = decide({
    checkpoint: buildCheckpoint({ answerState: completeLiteral('A/b'), capturedAt: Date.parse('2026-09-14T15:08:00Z') }),
    assignment,
    now: Date.parse('2026-09-14T15:09:00Z'),
  });
  assert.equal(afterClose.status, CHECKPOINT_STATUS.RECOVERED_AFTER_CLOSE);
});

test('a manual Classwork close makes outstanding work due now, not at lateDueAt', () => {
  const closedAt = Date.parse('2026-09-14T15:15:00Z');
  const assignment = buildAssignment({
    sectionAccess: { classwork: { overridesByClassId: { [CLASS_ID]: { state: 'closed', changedAt: new Date(closedAt).toISOString() } } } },
  });
  const checkpoint = buildCheckpoint({
    question: classworkQuestion,
    questionIndex: 1,
    activityRole: 'classwork',
    answerState: { isComplete: true, responseKey: '{}', parts: [{ id: 'slope', response: '3', isComplete: true }, { id: 'intercept', response: '-2', isComplete: true }] },
    capturedAt: DURING_WARMUP,
    // The client's hint is tomorrow's lateDueAt, which is exactly the problem.
    finalizeAt: '2026-09-21T23:59:59Z',
  });
  const result = decide({ checkpoint, assignment, now: closedAt + 60_000 });
  assert.equal(result.action, 'finalize');
  assert.equal(result.reason, 'manual-section-close');
  assert.equal(result.cutoff, closedAt);
});

test('a manual Practice close closes Practice the same way', () => {
  const closedAt = Date.parse('2026-09-14T15:15:00Z');
  const practiceQuestion = { ...classworkQuestion, questionId: 'q-practice-1', activityRole: 'practice' };
  const assignment = buildAssignment({
    sections: [
      { id: 's-warmup', role: 'warmup', questions: [warmupQuestion] },
      { id: 's-practice', role: 'practice', questions: [practiceQuestion] },
    ],
    sectionAccess: { practice: { overridesByClassId: { [CLASS_ID]: { state: 'closed', changedAt: new Date(closedAt).toISOString() } } } },
  });
  const checkpoint = buildCheckpoint({
    question: practiceQuestion,
    questionIndex: 1,
    activityRole: 'practice',
    answerState: { isComplete: true, responseKey: '{}', parts: [{ id: 'slope', response: '3', isComplete: true }, { id: 'intercept', response: '-2', isComplete: true }] },
    capturedAt: DURING_WARMUP,
    finalizeAt: '2026-09-21T23:59:59Z',
  });
  const result = decide({ checkpoint, assignment, now: closedAt + 60_000 });
  assert.equal(result.action, 'finalize');
  assert.equal(result.reason, 'manual-section-close');
});

test('a reopen after an auto-submit leaves the auto-submit as history and allows later work', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({ answerState: completeLiteral('b/A'), previousTotalAttempts: 0 });
  runScheduler({ store });
  const autoSubmitted = store.grade.gradesByAssignment.A1['0'];
  assert.equal(autoSubmitted.totalAttempts, 1);
  assert.equal(store.checkpoint.status, CHECKPOINT_STATUS.AUTO_SUBMITTED);
  assert.equal(store.checkpoint.candidateFinalizeAt, null, 'a finalized checkpoint leaves the active query');

  // The teacher reopens. A new checkpoint written during the reopened window
  // declares the attempt count it actually saw, so it becomes attempt two.
  const reopenUntil = Date.parse('2026-09-14T15:50:00Z');
  store.assignment = buildAssignment({
    warmup: { enabled: true, instructionDate: DAY, autoCloseByClassId: { [CLASS_ID]: { dateKey: DAY, closesAt: new Date(reopenUntil).toISOString() } } },
  });
  store.checkpoint = buildCheckpoint({
    answerState: completeLiteral('A/b'),
    previousTotalAttempts: 1,
    revision: 2,
    capturedAt: Date.parse('2026-09-14T15:30:00Z'),
  });
  const second = runScheduler({ store, now: reopenUntil + 1000 });
  assert.equal(second.action, 'finalize');
  assert.equal(store.grade.gradesByAssignment.A1['0'].totalAttempts, 2);
  assert.equal(store.grade.gradesByAssignment.A1['0'].status, 'correct');
});

/* ==========================================================================
 * 27-30. NONE OF THIS NEEDS THE ASSIGNMENT PAGE TO BE OPEN.
 * ======================================================================== */

test('an acknowledged checkpoint finalizes with no client input of any kind', () => {
  // Scenario A: the student answered, never pressed Submit, went back to the
  // dashboard, and the Warm-Up closed. The decision below is computed from the
  // stored document, the assignment, the roster row and the schedule — there
  // is no browser in it.
  const store = newStore({ checkpoint: buildCheckpoint({ answerState: completeLiteral('A/b') }) });
  const result = runScheduler({ store });
  assert.equal(result.action, 'finalize');
  assert.equal(store.grade.gradesByAssignment.A1['0'].status, 'correct');
  assert.equal(store.evidence.length, 1);
});

test('the finalizer is a scheduled function, driven by a Firestore query', () => {
  // Signing out, closing the tab and unmounting the player are all the same
  // fact to this code path: it never consults a session.
  assert.match(functionsSource, /exports\.finalizeStudentResponseCheckpoints = onSchedule\(/);
  const start = functionsSource.indexOf('exports.finalizeStudentResponseCheckpoints');
  const block = functionsSource.slice(start, functionsSource.indexOf('exports.expediteCheckpointsOnSectionClose'));
  assert.match(block, /collection\(CHECKPOINT_COLLECTION\)/);
  assert.match(block, /where\("status", "==", "active"\)/);
  assert.match(block, /where\("candidateFinalizeAt", "<=", new Date\(now\)\)/);
  assert.match(block, /settings"\)\.doc\("classSchedule"\)/);
});

test('the finalizer grades with the shared contract and never with the checkpoint', () => {
  const start = functionsSource.indexOf('async function finalizeOneResponseCheckpoint');
  const block = functionsSource.slice(start, functionsSource.indexOf('exports.finalizeStudentResponseCheckpoints'));
  assert.match(block, /decideCheckpointFinalization\(\{/);
  assert.match(block, /buildCheckpointFinalization\(\{/);
  assert.match(block, /finalization\.record/);
  assert.match(block, /finalization\.evidenceEvent/);
  // The old code wrote checkpoint.submissionEnvelope.record straight into the
  // canonical grade. Nothing may read that shape again.
  assert.doesNotMatch(block, /checkpoint\.submissionEnvelope/);
  assert.doesNotMatch(block, /checkpoint\.isCorrect/);
});

test('a checkpoint with no provable close holds, and leaves the due query while it does', () => {
  // Holding is right — a hold is never read as "closed" — but a held
  // checkpoint whose query time is already past must not be re-examined every
  // minute forever.
  const assignment = buildAssignment({ dueAt: null, lateDueAt: null, warmup: { enabled: true, instructionDate: '2026-09-13' } });
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = decide({ checkpoint, assignment, now: AFTER_WARMUP });
  assert.equal(result.action, 'hold');
  assert.equal(result.reason, 'no-authoritative-close');

  const start = functionsSource.indexOf('if (decision.action === "hold")');
  const block = functionsSource.slice(start, start + 500);
  assert.match(block, /candidateFinalizeAt: new Date\(now \+ CHECKPOINT_HOLD_BACKOFF_MS\)/);
  assert.match(functionsSource, /const CHECKPOINT_HOLD_BACKOFF_MS = 60 \* 60 \* 1000;/);
});

test('a manual section close expedites only that assignment, class and section', () => {
  const start = functionsSource.indexOf('exports.expediteCheckpointsOnSectionClose');
  const block = functionsSource.slice(start, functionsSource.indexOf('const studentMatchesAssignmentAudience', start));
  assert.match(block, /where\("assignmentId", "==", assignmentId\)/);
  assert.match(block, /where\("classId", "==", entry\.classId\)/);
  assert.match(block, /where\("activityRole", "==", entry\.activityRole\)/);
  assert.match(block, /\.limit\(CHECKPOINT_BATCH_LIMIT\)/);
  // Only the query time moves; eligibility is still the finalizer's decision.
  assert.match(block, /candidateFinalizeAt: dueAt/);
  assert.doesNotMatch(block, /gradesByAssignment/);
});

/* ==========================================================================
 * 31-38. AUTHORIZATION FAILS CLOSED.
 * ======================================================================== */

const authorize = (checkpoint, { assignment = buildAssignment(), gradeDocument = buildGradeDocument(), isSecureAssignment = false } = {}) => (
  verifyCheckpointAuthorization({
    checkpoint,
    assignment,
    gradeDocument,
    gradeDocumentId: 'S1042',
    question: runtimeQuestions(assignment)[Number(checkpoint.questionIndex)] || null,
    isSecureAssignment,
  })
);

test('a checkpoint naming the wrong class fails closed', () => {
  const result = authorize(buildCheckpoint({ answerState: completeLiteral('A/b'), classId: 'class-b' }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'class-mismatch');
});

test('a checkpoint with NO class fails closed rather than being treated as authorized', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize({ ...checkpoint, classId: null, finalizationContext: { ...checkpoint.finalizationContext, classId: null } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'checkpoint-has-no-class');
});

test('a student with no class on the roster cannot finalize anything', () => {
  const result = authorize(buildCheckpoint({ answerState: completeLiteral('A/b') }), {
    gradeDocument: buildGradeDocument({ classId: '' }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'student-has-no-class');
});

test('an assignment that was never assigned to the class fails closed', () => {
  const result = authorize(buildCheckpoint({ answerState: completeLiteral('A/b') }), {
    assignment: buildAssignment({ assignedClassIds: ['class-z'] }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'assignment-not-assigned-to-class');
});

test('a forged assignment id fails closed', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize({ ...checkpoint, assignmentId: 'A-other' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'assignment-identity-mismatch');
});

test('a forged question index fails closed', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize({ ...checkpoint, questionIndex: 47 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'question-index-not-found');
});

test('a forged question id fails closed', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize({ ...checkpoint, questionId: 'q-someone-elses' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'question-identity-mismatch');
});

test('a forged activity role fails closed', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  // Claiming the Warm-Up question is Classwork would buy the whole late window.
  const result = authorize({ ...checkpoint, activityRole: 'classwork' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'activity-role-mismatch');
});

test('a checkpoint pointed at another student fails closed', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize({ ...checkpoint, studentId: 'S2000' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'grade-record-student-mismatch');
});

test('a Test Cycle assignment is excluded', () => {
  const result = authorize(buildCheckpoint({ answerState: completeLiteral('A/b') }), { isSecureAssignment: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'secure-assignment-excluded');
});

test('a secure assignment is excluded', () => {
  const result = authorize(buildCheckpoint({ answerState: completeLiteral('A/b') }), {
    assignment: buildAssignment({ secure: true }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'secure-assignment-excluded');
});

test('a My Math Path session is excluded', () => {
  const result = authorize(buildCheckpoint({ answerState: completeLiteral('A/b') }), {
    assignment: buildAssignment({ isPathSession: true }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'path-session-excluded');
});

test('a checkpoint flagged secure is excluded', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize({ ...checkpoint, secure: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'secure-flagged-checkpoint');
});

test('a question type the server cannot mark is excluded, not guessed at', () => {
  const generated = { questionId: 'q-warmup-1', type: 'literal', activityRole: 'warmup', generator: { kind: 'literalLinear' } };
  const assignment = buildAssignment({ sections: [{ id: 's-warmup', role: 'warmup', questions: [generated] }] });
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize(checkpoint, { assignment });
  assert.equal(result.ok, false);
  assert.match(result.reason, /unsupported-question:generated-question/);
  assert.equal(decide({ checkpoint, assignment }).status, CHECKPOINT_STATUS.UNSUPPORTED_QUESTION);
});

test('a checkpoint written against a superseded variant is excluded', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  const result = authorize(checkpoint, {
    gradeDocument: buildGradeDocument({ gradesByAssignment: { A1: { 0: { variantIndex: 1, totalAttempts: 1 } } } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'variant-superseded');
});

test('an unknown schema version is refused rather than interpreted', () => {
  const checkpoint = buildCheckpoint({ answerState: completeLiteral('A/b') });
  assert.equal(authorize({ ...checkpoint, schemaVersion: 1 }).reason, 'unknown-schema-version');
});

/* ==========================================================================
 * AUTO-SUBMIT PRODUCES THE SAME CANONICAL PROJECTIONS AS MANUAL SUBMIT.
 *
 * Writing `gradesByAssignment` is not the whole of recording an attempt. The
 * ordinary Submit path also maintains the classwork completion projection, the
 * accumulated support usage, and the DOL section projection — and
 * `prerequisiteAccess` reads the first of those. A finalizer that skipped them
 * would record a student's last classwork answer and still leave them locked
 * out of the dependent assignment.
 * ======================================================================== */

const finalize = ({ store, now = AFTER_WARMUP, classworkIndices = [1], dolIndices = [2] }) => {
  const decision = decide({ checkpoint: store.checkpoint, assignment: store.assignment, gradeDocument: store.grade, now });
  assert.equal(decision.action, 'finalize', `expected finalize, got ${decision.action}: ${decision.reason}`);
  return buildCheckpointFinalization({
    checkpoint: store.checkpoint,
    assignment: store.assignment,
    question: runtimeQuestions(store.assignment)[Number(store.checkpoint.questionIndex)],
    decision,
    gradeDocument: store.grade,
    classworkIndices,
    dolIndices,
    occurredAt: now,
  });
};

const completeMultiAnswer = () => ({
  isComplete: true,
  responseKey: '{}',
  parts: [
    { id: 'slope', response: '3', isComplete: true },
    { id: 'intercept', response: '-2', isComplete: true },
  ],
});

test('auto-submitting the final Classwork answer crosses the completion threshold and unlocks the prerequisite', async () => {
  const { prerequisiteAccess } = await import('../../src/assignmentLifecycle.js');
  const store = newStore({
    grade: buildGradeDocument({
      // Question 1 is the only classwork question, and it is unattempted.
      assignmentActivity: { A1: { totalTimeSeconds: 1200 } },
    }),
  });
  store.checkpoint = buildCheckpoint({
    question: classworkQuestion,
    questionIndex: 1,
    activityRole: 'classwork',
    answerState: completeMultiAnswer(),
    capturedAt: DURING_WARMUP,
  });
  const finalization = finalize({ store, now: Date.parse('2026-09-22T06:00:00Z') });

  assert.equal(finalization.record.status, 'correct');
  assert.ok(finalization.classworkGrade, 'the classwork completion projection was produced');
  assert.equal(finalization.classworkGrade.score, 100);
  assert.equal(finalization.classworkGrade.completionPercent, 100);

  // The gate the student would otherwise have stayed behind.
  const dependent = { prerequisiteAssignmentId: 'A1' };
  assert.equal(prerequisiteAccess({ assignment: dependent, classworkGradesByAssignment: {} }).open, false);
  assert.equal(
    prerequisiteAccess({ assignment: dependent, classworkGradesByAssignment: { A1: finalization.classworkGrade } }).open,
    true,
  );
});

test('auto-submitting a Classwork answer that does NOT meet the rule writes no completion grade', () => {
  const store = newStore({
    // Not enough engaged time for the default ten-minute rule.
    grade: buildGradeDocument({ assignmentActivity: { A1: { totalTimeSeconds: 30 } } }),
  });
  store.checkpoint = buildCheckpoint({
    question: classworkQuestion, questionIndex: 1, activityRole: 'classwork',
    answerState: completeMultiAnswer(), capturedAt: DURING_WARMUP,
  });
  const finalization = finalize({ store, now: Date.parse('2026-09-22T06:00:00Z') });
  assert.equal(finalization.classworkGrade, null);
});

test('auto-submitting a DOL response updates the DOL section projection', () => {
  const store = newStore();
  store.checkpoint = buildCheckpoint({
    question: dolQuestion,
    questionIndex: 2,
    activityRole: 'dol',
    answerState: { isComplete: true, responseKey: '(2,5)', parts: [] },
    capturedAt: Date.parse('2026-09-14T15:40:00Z'),
  });
  const finalization = finalize({ store, now: Date.parse('2026-09-14T15:46:00Z') });
  assert.equal(finalization.record.status, 'correct');
  // The projection is keyed by the instructional date in the school's zone.
  assert.equal(finalization.dolDateKey, DAY);
  const projection = dolSectionProjection({
    existing: null, dateKey: finalization.dolDateKey, score: 100, questionIndices: [2],
  });
  assert.equal(projection.score, 100);
  assert.deepEqual(projection.questionIndices, [2]);
  // Deliberately NOT finalized: the existing DOL finalization path stays the
  // one thing that closes a section.
  assert.equal(projection.finalized, false);
  assert.equal(projection.status, 'section-in-progress');
});

test('a DOL section the teacher already finalized is not reopened by an auto-submit', () => {
  const existing = { [DAY]: { finalized: true, score: 80, status: 'section-finalized' } };
  assert.equal(dolSectionProjection({ existing, dateKey: DAY, score: 100, questionIndices: [2] }), null);
});

test('server deadline finalization creates a FINAL DOL when no browser is mounted', () => {
  const projection = dolSectionProjection({
    existing: null,
    dateKey: DAY,
    score: 100,
    questionIndices: [2],
    recordedAt: '2026-09-14T15:46:15.000Z',
    finalize: true,
  });
  assert.equal(projection.finalized, true);
  assert.equal(projection.status, 'section-finalized');
  assert.equal(projection.score, 100);
  assert.equal(projection.finalizedAt, '2026-09-14T15:46:15.000Z');
});

test('valid pre-cutoff checkpoint corrects an earlier browser-finalized DOL without reopening it', () => {
  const existing = {
    [DAY]: {
      finalized: true,
      score: 50,
      questionIndex: 2,
      questionIndices: [2],
      recordedAt: '2026-09-14T15:45:00.000Z',
      status: 'section-finalized',
    },
  };
  const projection = dolSectionProjection({
    existing,
    dateKey: DAY,
    score: 100,
    questionIndices: [2],
    recordedAt: '2026-09-14T15:46:15.000Z',
    finalize: true,
    correctionReason: 'deadline-auto-submit',
  });
  assert.equal(projection.finalized, true);
  assert.equal(projection.status, 'section-finalized');
  assert.equal(projection.score, 100);
  assert.equal(projection.recordedAt, '2026-09-14T15:45:00.000Z', 'the original close receipt stays intact');
  assert.equal(projection.finalizedAt, '2026-09-14T15:45:00.000Z');
  assert.equal(projection.recalculatedAt, '2026-09-14T15:46:15.000Z');
  assert.equal(projection.recalculationReason, 'deadline-auto-submit');
});

test('browser DOL close cannot overwrite a DOL the server already finalized', () => {
  const marker = appSource.indexOf('CLIENT DOL CLOSE IS IMMEDIATE FEEDBACK, NOT NEWER AUTHORITY');
  assert.ok(marker >= 0, 'browser/server DOL race guard is documented in the close effect');
  const block = appSource.slice(marker, appSource.indexOf('}, [now, user, assignments, classSchedule, tracker, dolGradesByAssignment]);', marker));
  assert.match(block, /runTransaction\(db, async \(transaction\) => \{/);
  assert.match(block, /transaction\.get\(gradeRef\)/);
  assert.match(block, /if \(current\?\.finalized === true\) return current;/);
  assert.match(block, /new FieldPath\('dolGradesByAssignment', assignmentId, dateKey\)/);
  assert.doesNotMatch(block, /updateDoc\(doc\(db, 'grades'/);
});

test('server checkpoint finalizer explicitly writes an authoritative final DOL projection', () => {
  const start = functionsSource.indexOf('if (decision.activityRole === "dol" && dolIndices.length)');
  const block = functionsSource.slice(start, functionsSource.indexOf('const gradeUpdates = [', start));
  assert.match(block, /finalize: true/);
  assert.match(block, /correctionReason: "deadline-auto-submit"/);
});

test('auto-submit merges support usage rather than replacing it', () => {
  const store = newStore({
    grade: buildGradeDocument({
      supportUsageByAssignment: { A1: { modified: false, accommodations: ['calculator'], modifications: [] } },
    }),
  });
  store.checkpoint = buildCheckpoint({
    answerState: completeLiteral('A/b'),
    patch: { supportUsage: { modified: true, accommodations: ['readAloud'], modifications: ['reduce-complexity'] } },
  });
  const finalization = finalize({ store, classworkIndices: [], dolIndices: [] });
  assert.deepEqual(finalization.supportUsage.accommodations.sort(), ['calculator', 'readAloud']);
  assert.deepEqual(finalization.supportUsage.modifications, ['reduce-complexity']);
  assert.equal(finalization.supportUsage.modified, true);
});

test('manual Submit and deadline auto-submit of the same response produce the same projections', async () => {
  const { recordQuestionAttempt } = await import('../../functions/shared/attemptPolicy.mjs');
  const { evaluateClassworkCompletionRule, classworkGradeProjection } =
    await import('../../functions/shared/assignmentProjections.mjs');
  const { gradeOrdinaryResponse } = await import('../../functions/shared/ordinaryResponseGrading.mjs');

  const grade = buildGradeDocument({ assignmentActivity: { A1: { totalTimeSeconds: 1200 } } });
  const response = { kind: 'fields', type: 'multiAnswer', value: '', fields: [
    { id: 'slope', value: '3', isComplete: true },
    { id: 'intercept', value: '-2', isComplete: true },
  ] };

  // What manual Submit would have produced, through the shared contracts.
  const manualGrading = gradeOrdinaryResponse({ question: classworkQuestion, response });
  const manual = recordQuestionAttempt({
    record: null,
    isCorrect: manualGrading.isCorrect,
    parts: manualGrading.parts,
    responseKey: '',
    maximumAttempts: 3,
  });
  const manualCompletion = evaluateClassworkCompletionRule({
    classworkIndices: [1],
    assignmentTracker: { 1: manual.record },
    totalTimeSeconds: 1200,
    completionRule: {},
  });
  const manualClasswork = classworkGradeProjection({ completion: manualCompletion, recordedAt: '2026-09-22T06:00:00.000Z' });

  // What the deadline finalizer produces from the same response.
  const store = newStore({ grade });
  store.checkpoint = buildCheckpoint({
    question: classworkQuestion, questionIndex: 1, activityRole: 'classwork',
    answerState: completeMultiAnswer(), capturedAt: DURING_WARMUP,
  });
  const auto = finalize({ store, now: Date.parse('2026-09-22T06:00:00Z') });

  assert.equal(auto.record.status, manual.record.status);
  assert.equal(auto.record.attemptCount, manual.record.attemptCount);
  assert.equal(auto.record.totalAttempts, manual.record.totalAttempts);
  assert.equal(auto.record.partialCredit, manual.record.partialCredit);
  assert.equal(auto.result.isCorrect, manual.result.isCorrect);
  assert.equal(auto.classworkGrade.score, manualClasswork.score);
  assert.equal(auto.classworkGrade.completionPercent, manualClasswork.completionPercent);
});

test('a retry after a successful finalization still writes nothing new', () => {
  const store = newStore({ grade: buildGradeDocument({ assignmentActivity: { A1: { totalTimeSeconds: 1200 } } }) });
  store.checkpoint = buildCheckpoint({
    question: classworkQuestion, questionIndex: 1, activityRole: 'classwork',
    answerState: completeMultiAnswer(), capturedAt: DURING_WARMUP,
  });
  const now = Date.parse('2026-09-22T06:00:00Z');
  const first = finalize({ store, now });
  // Apply it, the way the transaction does.
  store.grade = {
    ...store.grade,
    gradesByAssignment: { A1: { 1: first.record } },
    classworkGradesByAssignment: { A1: first.classworkGrade },
  };
  // The retry sees the canonical record already naming this finalization.
  const retry = decide({ checkpoint: store.checkpoint, assignment: store.assignment, gradeDocument: store.grade, now });
  assert.equal(retry.action, 'close');
  assert.equal(retry.reason, 'already-finalized');
  assert.equal(store.grade.classworkGradesByAssignment.A1.metAt, first.classworkGrade.metAt);
});

/* ==========================================================================
 * 39-40. CHECKPOINTS DO NOT WAKE GOOGLE CLASSROOM. CANONICAL GRADES DO.
 * ======================================================================== */

test('checkpoint and workspace writes live outside the grades document', () => {
  // syncGradeToClassroom triggers on grades/{studentId}. Keeping drafts out of
  // that document is the whole reason a keystroke cannot reach Classroom.
  assert.match(functionsSource, /exports\.syncGradeToClassroom = onDocumentWritten\(\s*\{\s*document: "grades\/\{studentId\}"/);
  assert.match(appSource, /doc\(db, 'studentResponseCheckpoints', action\.payload\.documentId\)/);
  assert.match(workspaceStoreSource, /WORKSPACE_DRAFT_COLLECTION = 'studentWorkspaceDrafts'/);
  assert.doesNotMatch(workspaceStoreSource, /'grades'/);
});

test('a finalized attempt goes through the canonical grades document, waking the existing passback', () => {
  const start = functionsSource.indexOf('async function finalizeOneResponseCheckpoint');
  const block = functionsSource.slice(start, functionsSource.indexOf('exports.finalizeStudentResponseCheckpoints'));
  // The canonical grade row is the ONLY thing the finalizer writes that the
  // Classroom trigger watches — and it now carries every projection an ordinary
  // Submit would have written, not just the question record.
  assert.match(block, /new FieldPath\("gradesByAssignment", assignmentId, String\(checkpoint\.questionIndex\)\)/);
  assert.match(block, /transaction\.update\(gradeRef, \.\.\.gradeUpdates\)/);
  // No second Classroom system: the finalizer talks to no Classroom API.
  assert.doesNotMatch(block, /classroom|courseWork|studentSubmissions/i);
});

/* ==========================================================================
 * THE CLIENT SIDE OF THE SAME CONTRACT.
 * ======================================================================== */

test('the page-lifecycle flush obeys the same eligibility rules as the debounce', () => {
  const start = engineSource.indexOf('DEADLINE RESPONSE CHECKPOINTING');
  const block = engineSource.slice(start, engineSource.indexOf('const isMultipart', start));
  // One decision, read by both paths.
  assert.match(block, /const checkpointAllowed = Boolean\(onResponseCheckpoint\)[\s\S]*?!serverGrading[\s\S]*?!locked[\s\S]*?!submitting[\s\S]*?!submissionInFlightRef\.current[\s\S]*?!responseAlreadySubmitted/);
  assert.match(block, /checkpointPendingRef\.current = \{ eligible: checkpointPending/);
  assert.match(block, /flushCheckpointRef\.current\('page-lifecycle'\)/);
  assert.match(block, /flushResponseCheckpoint\('debounce'\)/);
  // The flush reads the shared eligibility, it does not re-derive a looser one.
  assert.match(block, /const \{ eligible, state \} = checkpointPendingRef\.current;\s*\n\s*if \(!eligible \|\| !state\) return;/);
});

test('an explicit submission retires its checkpoint in the same transaction as the attempt', () => {
  const start = appSource.indexOf('const reconcileDurableStudentAction');
  const block = appSource.slice(start, appSource.indexOf('const drainStudentOutbox', start));
  assert.match(block, /checkpointRef \? transaction\.get\(checkpointRef\) : Promise\.resolve\(null\)/);
  assert.match(block, /transaction\.update\(checkpointRef, \{\s*\n\s*status: 'explicitly-submitted'/);
  assert.match(block, /candidateFinalizeAt: null/);
});

test('the checkpoint handler builds a draft, and derives no grade of its own', () => {
  const start = appSource.indexOf('const handleResponseCheckpoint = useCallback');
  const block = appSource.slice(start, appSource.indexOf('const handleGradeSubmit', start));
  assert.match(block, /enqueueResponseCheckpoint\(/);
  assert.match(block, /resolveAuthoritativeClose\(/);
  // The defect this replaces: the handler used to run the attempt policy, build
  // a canonical record and an evidence event, and put them in the checkpoint.
  assert.doesNotMatch(block, /recordQuestionAttempt\(/);
  assert.doesNotMatch(block, /buildAttemptEvidenceEvent\(/);
  assert.doesNotMatch(block, /submissionEnvelope/);
  assert.doesNotMatch(block, /answerState\.isCorrect/);
});
