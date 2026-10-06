/*
 * A WARM-UP QUESTION'S LIFE, THROUGH THE CODE PRODUCTION RUNS.
 *
 * The lmr-wu-1 incident ("This question did not load" after the teacher
 * reopened the Warm-Up) lived in the half of the lifecycle the October 3
 * browser journey could not reach: its harness had no server, so a Check
 * stayed queued on the device and no deadline ever finalized anything. The
 * question only failed once the SERVER had recorded the student's attempts and
 * auto-submitted the last one at the close, making the question closed.
 *
 * These steps drive that lifecycle end to end with the modules production
 * runs at each step, so the record a test inspects is the record the server
 * would write:
 *
 *   publish        the teacher's import + publish chain (stored V5 shape)
 *   open           App.jsx's family context + QuestionEngine's generation chain
 *   board work     the tool's draft write and its shared-grader work report
 *   Check          QuestionEngine's registry-tool submit + App.jsx's attempt,
 *                  durable action and submission envelope
 *   ingestion      functions/index.js ingestOneSubmission's decisions
 *                  (decideSubmissionIngestion, buildIngestedAttempt)
 *   checkpoint     App.jsx's handleResponseCheckpoint + its drain transaction
 *   deadline       functions/index.js finalizeOneResponseCheckpoint's
 *                  decisions (decideCheckpointFinalization,
 *                  buildCheckpointFinalization)
 *   teacher        applyWarmupTeacherControl (App.jsx's Close / Reopen)
 *   render         the real QuestionEngine, prerendered with React's static
 *                  renderer — which waits for the lazily loaded board, so the
 *                  markup holds the board as hydrated from the device's saved
 *                  draft, the attempt strip and, for a closed question, the
 *                  solution review.
 *
 * The real Cloud Functions themselves run the same lifecycle against the
 * Firestore emulator in
 * tests/integration/warmupReopen/warmupReopenServerLifecycle.test.mjs.
 *
 * A step that mirrors app wiring rather than calling it (an envelope's
 * fields, a checkpoint's drain) cites the lines it restates.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { prerenderToNodeStream } from 'react-dom/static';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../../src/platform/contract/assignmentSchemaV5.js';
import { getStoredAssignmentQuestions } from '../../../src/platform/contract/storedAssignmentV5.js';
import { getAssignmentLifecycle, getSectionAccessState, getSectionVariantMode, getWarmupState } from '../../../src/assignmentLifecycle.js';
import { buildStudentFamilyContext, readLocalDeliveryPin, writeLocalDeliveryPin } from '../../../src/platform/generation/familyDelivery.js';
import { generateQuestion } from '../../../src/problemGenerator.js';
import { prepareQuestionForRuntimeRouting } from '../../../src/platform/algebra/algebraWorkspaceRoute.js';
import { normalizeContextualQuestion } from '../../../src/platform/context/wordProblemLayer.js';
import { buildQuestionDraftKey, readQuestionDraft, restoreQuestionDrafts, writeQuestionDraft } from '../../../src/questionDraftStorage.js';
import { forgetToolDrafts, readToolDraftRecord, stampToolDraftSubmission, toolDraftKey } from '../../../src/tools/shared/usePersistentToolState.js';
import { gradeRegistryToolWork } from '../../../src/platform/grading/registryToolGrading.js';
import { buildResponseCheckpointAction, normalizeCheckpointResponse } from '../../../src/platform/performance/responseCheckpoint.js';
import { createDurableAction } from '../../../src/platform/performance/durableActionOutbox.js';
import { normalizeQuestionRecord, recordQuestionAttempt, resolveQuestionMaximumAttempts } from '../../../src/attemptPolicy.js';
import { canonicalResponseSavedAt } from '../../../src/platform/persistence/canonicalResponseTime.js';
import { getEffectiveActivityPolicy } from '../../../src/platform/policies/activityPolicies.js';
import { attemptInputsFromGrading } from '../../../functions/shared/serverGrading/gradingResult.mjs';
import { familySlotKey } from '../../../functions/shared/questionFamilyInstance.mjs';
import { normalizeDeliveryPin, planSeatAdditions } from '../../../functions/shared/questionGenerationIdentity.mjs';
import { applyWarmupTeacherControl, assignmentFinalCloseAt, resolveAuthoritativeClose } from '../../../functions/shared/sectionDeadline.mjs';
import { checkpointDocumentId } from '../../../functions/shared/responseCheckpointSchema.mjs';
import { selectRestorableDraftEntries } from '../../../functions/shared/workspaceDraftSchema.mjs';
import * as ingestion from '../../../functions/shared/submissionIngestion.mjs';
import { SUBMISSION_DISPOSITION } from '../../../functions/shared/studentSubmissionDisposition.mjs';
import { buildCheckpointFinalization, decideCheckpointFinalization } from '../../../functions/shared/responseCheckpointFinalizer.mjs';
import {
  buildLinearConnectionCards,
  linearConnectionsCardKinds,
  linearPlacementsFromAssignments,
  representationSetsFor,
} from '../../../functions/shared/toolMath/representationMatch/representationMath.mjs';

/* ----------------------------------------------------------- the school */

// Monday: the Warm-Up runs, times out and is finalized. Tuesday: the lesson is
// past due ("Late — still open") and the teacher reopens the Warm-Up for the
// class — the state the production screenshot shows.
export const DAY = '2026-10-05';
export const NEXT_DAY = '2026-10-06';
export const CLASS_ID = 'class-p1';
export const PERIOD = 'Period 1';
export const SCHEDULE = Object.freeze({
  version: 2,
  dayTypeOverrides: { [DAY]: 'A', [NEXT_DAY]: 'A' },
  daySchedules: { A: { periods: { [PERIOD]: { enabled: true, start: '08:00', end: '08:50' } } }, B: { periods: {} } },
});
export const at = (day, hhmm, seconds = 0) => new Date(`${day}T${hhmm}:${String(seconds).padStart(2, '0')}`).getTime();
export const WARMUP_ATTEMPTS = getEffectiveActivityPolicy('warmup').attempts;

/*
 * The bell schedule every step reads. A suite that runs the real Cloud
 * Functions at the real time needs a class period around NOW: the finalizer
 * honours a Warm-Up's own close only on its instructional day
 * (sectionDeadline.mjs resolveAuthoritativeClose), so a schedule for a fixed
 * past date would only ever be measured against the assignment's final cutoff.
 */
let schoolSchedule = SCHEDULE;
export const useSchoolSchedule = (schedule) => { schoolSchedule = schedule || SCHEDULE; };
export const currentSchoolSchedule = () => schoolSchedule;

/* ------------------------------------------------------------ the lesson */

const LESSON_FILE = new URL('../../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json', import.meta.url);
let publishedLesson = null;

/** The production lesson, through the teacher's import + publish chain (App.jsx handleCreateAssignment). */
export const publishLmrLesson = () => {
  if (publishedLesson) return publishedLesson;
  const parsed = parseAssignmentBlueprintText(readFileSync(LESSON_FILE, 'utf8'));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
  assert.equal(model.isValid, true, 'the production lesson must pass Pre-Flight, as it did when it was published');
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  publishedLesson = {
    assignmentV5: model.assignmentV5,
    sections: rebuildV5SectionsFromQuestions(model.assignmentV5, questions),
  };
  return publishedLesson;
};

/**
 * The stored assignment: the published sections, a lesson due on DAY (so the
 * reopen on NEXT_DAY is late, still open), the Warm-Up's ten-minute timer, and
 * the class seated by the teacher's app (generationSeatReconciler.js).
 */
export const lmrAssignment = ({
  id = 'lmr-prod',
  studentIds = [],
  instructionDate = DAY,
  releaseAt = `${DAY}T00:00:00`,
  dueAt = `${DAY}T23:59:00`,
  lateDueAt = '2026-10-09T23:59:00',
} = {}) => {
  const { assignmentV5, sections } = publishLmrLesson();
  const base = {
    id,
    title: assignmentV5?.assignment?.title || 'Algebra I — Multiple Representations of Linear Equations',
    schemaVersion: 5,
    variantPolicy: assignmentV5?.variantPolicy || { mode: 'personalized' },
    sections: JSON.parse(JSON.stringify(sections)),
    releaseAt,
    dueAt,
    lateDueAt,
    assignedClassIds: [CLASS_ID],
    warmup: { enabled: true, minutesBeforeStart: 7, closeMinutesAfterStart: 10, instructionDatesByClassId: { [CLASS_ID]: instructionDate } },
  };
  const seats = planSeatAdditions({ assignment: base, assignmentId: id, classId: CLASS_ID, studentIds });
  return { ...base, generationSeats: { version: 1, byClassId: { [CLASS_ID]: seats } } };
};

export const questionsOf = (assignment) => getStoredAssignmentQuestions(assignment);

// functions/lib/assignmentRuntime.js runtimeQuestionsFromAssignment (CommonJS; restated).
export const runtimeQuestions = (assignment) => (Number(assignment?.schemaVersion) !== 5 ? [] : (assignment.sections || [])
  .flatMap((section) => (section?.questions || []).map((question) => ({
    ...question,
    activityRole: question?.activityRole || section?.role || 'classwork',
    sectionId: section?.id || null,
    sectionTitle: section?.title || null,
  }))));

export const warmupStateAt = (assignment, ms) => getWarmupState({ assignment, schedule: schoolSchedule, classId: CLASS_ID, classPeriod: PERIOD, nowValue: ms });

/**
 * App.jsx handleToggleWarmupForClass: the teacher's Close / Reopen / Timer.
 * A timer closes at `timerClosesAtMs`, the close its confirmation showed.
 */
export const teacherWarmup = (assignment, action, ms, dateKey, { timerClosesAtMs = null } = {}) => ({
  ...assignment,
  warmup: applyWarmupTeacherControl({
    assignment,
    classId: CLASS_ID,
    action,
    nowMs: ms,
    dateKey,
    windowEndMs: warmupStateAt(assignment, ms).window.end.getTime(),
    timerClosesAtMs,
    teacherIdentity: 'teacher@example.test',
  }).warmup,
});

/* ------------------------------------------------------------ the device */

const memoryStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    keys: () => [...values.keys()],
  };
};

/**
 * One Chromebook: its own local storage, installed as `window.localStorage`
 * for whatever it runs. Two devices never share a draft or a device pin.
 */
export const createDevice = (studentId) => {
  const storage = memoryStorage();
  const run = async (fn) => {
    const previous = globalThis.window;
    globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {} };
    try {
      return await fn();
    } finally {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }
  };
  return { studentId, storage, run };
};

/** What the student player renders for one question (App.jsx 10396-10426, QuestionEngine 262-268). */
export const openQuestion = (device, { assignment, record = undefined, questionIndex = 0, nowMs }) => device.run(() => {
  const questions = questionsOf(assignment);
  const question = questions[questionIndex];
  const familyContext = buildStudentFamilyContext({
    assignment,
    question,
    storageIndex: questionIndex,
    studentId: device.studentId,
    classId: CLASS_ID,
    sectionMode: getSectionVariantMode(assignment, question.activityRole),
    record,
    preview: false,
    store: device.storage,
  });
  const variant = normalizeQuestionRecord(record).variantIndex;
  const generationKey = `${assignment.id}|${device.studentId}|${questionIndex}|variant:${variant}`;
  const processed = normalizeContextualQuestion(generateQuestion(
    prepareQuestionForRuntimeRouting(question, { serverGraded: false }),
    generationKey,
    null,
    null,
    familyContext,
  ));
  // QuestionEngine reports the delivery; App.jsx handleFamilyDelivery pins it on the device.
  if (processed?.familyDelivery) writeLocalDeliveryPin({ studentId: device.studentId, delivery: processed.familyDelivery, store: device.storage });
  const lifecycle = getAssignmentLifecycle(assignment, nowMs, { studentId: device.studentId });
  const draftKey = buildQuestionDraftKey({
    studentId: device.studentId,
    assignmentId: assignment.id,
    questionIndex,
    variantIndex: variant,
    sessionMode: lifecycle.isPracticeOnly ? 'post-deadline-practice' : lifecycle.isLate ? 'late' : 'graded',
  });
  return { assignment, question, questions, questionIndex, processed, familyContext, generationKey, draftKey, variant, lifecycle };
});

/* ------------------------------------------------------------- the board */

export const deckOf = (processed) => buildLinearConnectionCards(representationSetsFor(processed), linearConnectionsCardKinds(processed));

/** A card sort: { [cardId]: slot }. */
export const sortFor = (processed, how) => {
  const cards = deckOf(processed);
  const firstSet = representationSetsFor(processed)[0]?.id;
  const correct = (card) => (card.setId === firstSet ? 0 : 1);
  if (how === 'correct') return Object.fromEntries(cards.map((card) => [card.id, correct(card)]));
  if (how === 'all-a') return Object.fromEntries(cards.map((card) => [card.id, 0]));
  if (how === 'all-b') return Object.fromEntries(cards.map((card) => [card.id, 1]));
  if (how === 'one-off') return Object.fromEntries(cards.map((card, index) => [card.id, index === 0 ? 1 - correct(card) : correct(card)]));
  if (how === 'partial') return Object.fromEntries(cards.slice(0, 5).map((card) => [card.id, correct(card)]));
  throw new Error(`unknown sort ${how}`);
};

/** The board persists a placement as the student makes it (usePersistentToolState commitField). */
export const saveSort = (device, opened, sort) => device.run(() => {
  writeQuestionDraft(toolDraftKey(opened.draftKey), { linearAssignments: { ...sort } }, { edit: true });
});

export const savedSort = (device, opened) => device.run(() => readQuestionDraft(toolDraftKey(opened.draftKey), null)?.linearAssignments ?? null);

/** What the server's workspace backup (studentWorkspaceDrafts, workspaceDraftSync.js) holds for this device's board. */
export const serverBackupOf = (device, opened) => {
  const key = toolDraftKey(opened.draftKey);
  const raw = device.storage.getItem(key);
  if (!raw) return [];
  const envelope = JSON.parse(raw);
  return [{ key, value: envelope.value, savedAt: envelope.savedAt, savedAtIsEdit: envelope.savedAtIsEdit === true, questionIndex: opened.questionIndex }];
};

/**
 * App.jsx's server-draft restore on a device that has never seen this work:
 * an entry comes back only when it is newer than the canonical record's own
 * response. Returns how many entries were restored.
 */
export const restoreFromServer = (device, entries, record) => device.run(() => restoreQuestionDrafts(selectRestorableDraftEntries({
  entries,
  localSavedAt: (key) => JSON.parse(device.storage.getItem(key) || 'null')?.savedAt || 0,
  canonicalSavedAt: () => canonicalResponseSavedAt(normalizeQuestionRecord(record)),
})));

const workFor = (sort) => ({ assignments: linearPlacementsFromAssignments(sort) });

/** QuestionEngine handleToolWork: the board's work, as the answer state a checkpoint reads. */
const answerStateFor = async (opened, sort) => {
  const result = await gradeRegistryToolWork({ toolId: 'representationMatch', question: opened.processed, work: workFor(sort) });
  return {
    isComplete: result.graded === true && result.isComplete === true,
    isCorrect: false,
    responseKey: result.toolResponse?.value || '',
    questionDetails: 'Representation Match work in progress.',
    parts: [],
    toolResponse: result.toolResponse,
  };
};

// App.jsx familyDeliveryForQuestion: what was rendered, then this device's pin,
// then the canonical record's for this variant.
const pinFor = (device, opened, sessionRecord) => {
  const slotKey = familySlotKey({ assignmentId: opened.assignment.id, question: opened.question, storageIndex: opened.questionIndex });
  return normalizeDeliveryPin(opened.processed.familyDelivery)
    || readLocalDeliveryPin({ studentId: device.studentId, slotKey, variant: opened.variant, store: device.storage })
    || (normalizeDeliveryPin(sessionRecord?.familyDelivery)?.variant === opened.variant ? normalizeDeliveryPin(sessionRecord.familyDelivery) : null);
};

// App.jsx captureTimedSectionAccess (module scope; restated).
const captureTimedSectionAccess = (assignment, capturedAt) => {
  const state = warmupStateAt(assignment, capturedAt);
  return {
    role: 'warmup',
    status: state.status,
    teacherTimerScheduled: state.teacherTimerScheduled === true,
    endsAt: state.endsAt instanceof Date ? state.endsAt.toISOString() : null,
    instructionDateKey: state.instructionDateKey || null,
  };
};

const checkpointIdentity = (device, opened) => ({
  studentId: device.studentId,
  assignmentId: opened.assignment.id,
  questionIndex: opened.questionIndex,
  questionId: opened.question.questionId || opened.question.id || '',
  variantIndex: opened.variant,
  generationKey: `${opened.assignment.id}|${device.studentId}|${opened.questionIndex}|variant:${opened.variant}`,
});

let actionSerial = 0;

/**
 * The student presses "Check groups": QuestionEngine grades the work with the
 * shared grader and records the attempt locally (App.jsx handleGradeSubmit
 * applyAttempt), queues it, and stamps the board's draft as current
 * (stampToolDraftSubmission). Returns the envelope the outbox sends
 * (App.jsx buildSubmissionEnvelopeForAction) and the session's new record.
 */
export const checkSort = (device, opened, { sort, sessionRecord = undefined, capturedAt }) => device.run(async () => {
  const sharedVerdict = await gradeRegistryToolWork({ toolId: 'representationMatch', question: opened.processed, work: workFor(sort) });
  assert.equal(sharedVerdict.graded, true, 'the card sort is a server-graded mode');
  const attemptInputs = attemptInputsFromGrading(sharedVerdict);
  const responseKey = sharedVerdict.toolResponse?.value || JSON.stringify(workFor(sort));
  const policy = getEffectiveActivityPolicy('warmup');
  const current = normalizeQuestionRecord(sessionRecord);
  const outcome = recordQuestionAttempt({
    record: sessionRecord,
    isCorrect: attemptInputs.isCorrect,
    questionDetails: 'Representation Match response submitted.',
    timeSpent: 60,
    parts: attemptInputs.parts,
    supportUsage: null,
    responseKey,
    partialCreditPercent: attemptInputs.partialCreditPercent,
    maximumAttempts: resolveQuestionMaximumAttempts({ question: opened.question, maximumAttempts: policy.attempts, activityPolicy: policy }),
  });
  const action = createDurableAction({
    kind: 'ordinarySubmission',
    studentId: device.studentId,
    assignmentId: opened.assignment.id,
    questionIndex: opened.questionIndex,
    createdAt: capturedAt,
    actionId: `student_action_check_${(actionSerial += 1)}`,
    payload: {
      previousTotalAttempts: current.totalAttempts,
      activityRole: 'warmup',
      timedSectionAccess: captureTimedSectionAccess(opened.assignment, capturedAt),
      capturedSectionAccess: ingestion.captureSectionAccessProof({
        sectionAccess: getSectionAccessState({ assignment: opened.assignment, activityRole: 'warmup', classId: CLASS_ID, classPeriod: PERIOD, nowValue: capturedAt, studentId: device.studentId }),
        capturedAt,
      }),
      response: normalizeCheckpointResponse(opened.processed, { parts: attemptInputs.parts, responseKey, isComplete: true, toolResponse: sharedVerdict.toolResponse }),
      familyDelivery: pinFor(device, opened, sessionRecord),
      questionId: opened.question.questionId || null,
      variantIndex: current.variantIndex,
      timeSpentSeconds: 60,
      checkpointDocumentId: checkpointDocumentId(checkpointIdentity(device, opened)),
      record: outcome.record,
      supportUsage: null,
      hasClassworkGrade: false,
      hasDolGrade: false,
    },
  });
  const payload = action.payload;
  const envelope = ingestion.buildSubmissionEnvelope({
    actionId: action.actionId,
    kind: action.kind,
    studentId: action.studentId,
    assignmentId: action.assignmentId,
    questionIndex: action.questionIndex,
    questionId: payload.questionId,
    variantIndex: payload.variantIndex,
    activityRole: payload.activityRole,
    capturedAt: action.createdAt,
    previousTotalAttempts: payload.previousTotalAttempts,
    record: payload.record,
    response: payload.response,
    familyDelivery: payload.familyDelivery,
    supportUsage: payload.record?.supportUsage || null,
    assignmentSupportUsage: payload.supportUsage,
    hasClassworkGrade: payload.hasClassworkGrade,
    hasDolGrade: payload.hasDolGrade,
    timedSectionAccess: payload.timedSectionAccess,
    capturedSectionAccess: payload.capturedSectionAccess,
    checkpointDocumentId: payload.checkpointDocumentId,
    timeSpentSeconds: payload.timeSpentSeconds,
    deliveryAttempts: 0,
  });
  // The board's work is current, not stale (QuestionEngine handleMissingToolAction).
  readToolDraftRecord(opened.draftKey);
  stampToolDraftSubmission(opened.draftKey);
  forgetToolDrafts(opened.draftKey);
  return { envelope, sessionRecord: outcome.record, verdict: attemptInputs };
});

/**
 * The open board's checkpoint (App.jsx handleResponseCheckpoint) as its drain
 * transaction stores it (App.jsx reconcileThroughClientTransaction):
 * acknowledged by the server `ackAfterMs` after capture.
 */
export const checkpointSort = (device, opened, { sort, sessionRecord = undefined, capturedAt, ackAfterMs = 900 }) => device.run(async () => {
  const answerState = await answerStateFor(opened, sort);
  const close = resolveAuthoritativeClose({
    assignment: opened.assignment,
    activityRole: 'warmup',
    schedule: schoolSchedule,
    classId: CLASS_ID,
    classPeriod: PERIOD,
    nowValue: capturedAt,
    timeZone: null,
    studentId: device.studentId,
    studentProfile: null,
  });
  const action = buildResponseCheckpointAction({
    identity: checkpointIdentity(device, opened),
    question: opened.processed,
    familyDelivery: pinFor(device, opened, sessionRecord),
    activityRole: 'warmup',
    answerState,
    revision: capturedAt,
    finalizeAt: close.closesAtMs ? new Date(close.closesAtMs).toISOString() : null,
    finalizationReason: close.reason,
    finalizationContext: { classId: CLASS_ID, classPeriod: PERIOD },
    previousTotalAttempts: normalizeQuestionRecord(sessionRecord).totalAttempts,
    supportUsage: null,
    timeSpentSeconds: 60,
    capturedAt,
  });
  assert.ok(action, 'a Warm-Up card sort is checkpoint-eligible');
  return {
    ...action.payload,
    studentId: action.studentId,
    assignmentId: action.assignmentId,
    questionIndex: action.questionIndex,
    classId: CLASS_ID,
    serverAcknowledgedAt: new Date(capturedAt + ackAfterMs),
    candidateFinalizeAt: action.payload.candidateFinalizeAt ? new Date(action.payload.candidateFinalizeAt) : null,
    status: 'active',
  };
});

/* ------------------------------------------------------------ the server */

export const gradeDocumentFor = (studentId) => ({ studentId, classId: CLASS_ID, classPeriod: PERIOD, gradesByAssignment: {} });

export const recordOf = (gradeDocument, assignmentId, questionIndex = 0) => gradeDocument?.gradesByAssignment?.[assignmentId]?.[String(questionIndex)] ?? null;

const withRecord = (gradeDocument, assignmentId, questionIndex, record) => ({
  ...gradeDocument,
  gradesByAssignment: {
    ...gradeDocument.gradesByAssignment,
    [assignmentId]: { ...gradeDocument.gradesByAssignment?.[assignmentId], [String(questionIndex)]: JSON.parse(JSON.stringify(record)) },
  },
});

/** functions/index.js ingestOneSubmission's decisions, on one envelope. */
export const ingestLikeServer = ({ envelope: raw, assignment, gradeDocument, now }) => {
  const envelope = ingestion.normalizeSubmissionEnvelope(JSON.parse(JSON.stringify(raw)));
  assert.ok(envelope, 'the envelope the outbox sends must be readable by ingestion');
  envelope.studentId = gradeDocument.studentId;
  const question = runtimeQuestions(assignment)[envelope.questionIndex] || null;
  const activityRole = ingestion.withAuthoritativeActivityRole({ envelope, question })?.activityRole || null;
  const canonicalRecord = recordOf(gradeDocument, assignment.id, envelope.questionIndex);
  const finalCloseAtMs = assignmentFinalCloseAt(assignment, null, gradeDocument.studentId, null);
  const decision = ingestion.decideSubmissionIngestion({
    envelope,
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: assignment.assignedClassIds.includes(gradeDocument.classId),
    assignmentClosedAtCapture: finalCloseAtMs === null ? null : Number(envelope.capturedAt || now) > Number(finalCloseAtMs),
    liveSectionAccess: ingestion.resolveLiveSectionAccess({ assignment, activityRole, classId: gradeDocument.classId }),
    question,
    canonicalRecord,
    deliveryAttempts: 0,
    now,
  });
  if (decision.disposition !== SUBMISSION_DISPOSITION.ACCEPTED) return { receipt: decision, gradeDocument };
  const built = ingestion.buildIngestedAttempt({
    envelope,
    assignment,
    question,
    canonicalRecord,
    gradeDocument,
    classworkIndices: [],
    dolIndices: [],
    modelingLabMarker: null,
    requireStepWork: false,
    ingestedAt: now,
  });
  if (built.blocked) return { receipt: { disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: built.reason }, gradeDocument };
  // A finished question: functions/index.js writes only the receipt.
  if (built.final) return { receipt: { disposition: SUBMISSION_DISPOSITION.SUPERSEDED, reason: built.reason }, gradeDocument };
  return {
    receipt: { disposition: SUBMISSION_DISPOSITION.ACCEPTED, gradedBy: built.gradedBy, totalAttempts: built.record.totalAttempts },
    gradeDocument: withRecord(gradeDocument, assignment.id, envelope.questionIndex, built.record),
  };
};

/** functions/index.js finalizeOneResponseCheckpoint's decisions, on one checkpoint. */
export const finalizeLikeServer = ({ checkpoint, assignment, gradeDocument, now }) => {
  const question = runtimeQuestions(assignment)[Number(checkpoint.questionIndex)] || null;
  const decision = decideCheckpointFinalization({
    checkpoint: { ...checkpoint, documentId: checkpoint.documentId },
    assignment,
    gradeDocument,
    gradeDocumentId: gradeDocument.studentId,
    question,
    schedule: schoolSchedule,
    classPeriod: PERIOD,
    now,
    timeZone: null,
  });
  if (decision.action !== 'finalize') {
    const retired = decision.action === 'close' ? { ...checkpoint, status: decision.status, candidateFinalizeAt: null } : checkpoint;
    return { decision, gradeDocument, checkpoint: retired };
  }
  const finalization = buildCheckpointFinalization({ checkpoint, assignment, question, decision, gradeDocument, runAt: now, timeZone: null });
  return {
    decision,
    gradeDocument: withRecord(gradeDocument, assignment.id, checkpoint.questionIndex, finalization.record),
    checkpoint: { ...checkpoint, status: decision.status, candidateFinalizeAt: null },
  };
};

/* ------------------------------------------------------------ the screen */

let renderer = null;

/** The real QuestionEngine and board, loaded through Vite (they are .jsx). */
export const loadRenderer = async () => {
  if (renderer) return renderer;
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const engine = await server.ssrLoadModule('/src/QuestionEngine.jsx');
  const tools = await server.ssrLoadModule('/src/tools/shared/usePersistentToolState.js');
  renderer = { server, QuestionEngine: engine.default, tools };
  return renderer;
};

export const closeRenderer = async () => {
  const current = renderer;
  renderer = null;
  await current?.server.close();
};

const streamText = async (stream) => {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
};

/**
 * The student's question, rendered as App.jsx's assignment player mounts it
 * (App.jsx 11053-11116): the stored question, the session's record for it,
 * the family context, the draft key, the Warm-Up's lock and policy. The
 * static renderer waits for the lazily loaded board, so the markup includes
 * the board hydrated from this device's saved draft. Any render error is a
 * failure: on the server there is no error boundary to hide behind.
 */
export const renderQuestion = async (device, opened, { record, nowMs }) => {
  const { QuestionEngine, tools } = await loadRenderer();
  return device.run(async () => {
    // As after a reload: this device's parsed workspace cache is empty.
    tools.forgetToolDrafts(opened.draftKey);
    const state = warmupStateAt(opened.assignment, nowMs);
    const policy = getEffectiveActivityPolicy('warmup');
    const errors = [];
    const { prelude } = await prerenderToNodeStream(React.createElement(QuestionEngine, {
      question: opened.question,
      questionRecord: record,
      generationKey: opened.generationKey,
      familyContext: opened.familyContext,
      onGrade: async () => null,
      activityRole: 'warmup',
      activityPolicy: policy,
      maximumAttempts: resolveQuestionMaximumAttempts({ question: opened.question, maximumAttempts: policy.attempts, activityPolicy: policy }),
      assignmentLocked: state.status !== 'active',
      assignmentLockedMessage: state.status !== 'active' ? 'Your teacher closed the Warm-Up for this class.' : '',
      draftKey: opened.draftKey,
      assignmentId: opened.assignment.id,
      executionScope: 'student',
      onNextQuestion: () => {},
      nextQuestionLabel: 'Question 2 of 2',
    }), { onError: (error) => { errors.push(error); } });
    const html = await streamText(prelude);
    return { html, errors, state };
  });
};

/** What a rendered card sort shows: cards in each group, and the closed parts. */
export const readRender = ({ html }) => ({
  failed: /data-question-resolution-failure|This question did not load|This question could not be displayed/.test(html),
  locked: /<fieldset[^>]*disabled=""/.test(html),
  placedInA: (html.match(/In Line A\./g) || []).length,
  placedInB: (html.match(/In Line B\./g) || []).length,
  unsorted: (html.match(/In not sorted yet\./g) || []).length,
  review: /Card-sort solution/.test(html),
  closedNotice: /This response is closed after/.test(html),
  correctNotice: /Question complete/.test(html),
});
