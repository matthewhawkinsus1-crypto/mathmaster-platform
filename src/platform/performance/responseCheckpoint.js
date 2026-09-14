/*
 * THE STUDENT SIDE OF A RESPONSE CHECKPOINT.
 *
 * A checkpoint is a DRAFT that MathMaster has acknowledged, so that a response
 * finished before a deadline can still be submitted after the tab is gone. It
 * is never a grade, and this file is where that stops being a matter of good
 * intentions: the payload is built by the shared schema, which throws if any
 * field that decides a grade tries to cross the boundary.
 *
 * Nothing here waits on the network. A checkpoint is written to the IndexedDB
 * outbox and reconciled in the background, exactly like an ordinary submission.
 */
import { createDurableAction, enqueueDurableAction } from './durableActionOutbox.js';
import { stableStringify } from '../../utils/idUtils.js';
import {
  buildResponseCheckpointPayload,
  checkpointActionId,
  checkpointDocumentId,
} from '../../../functions/shared/responseCheckpointSchema.mjs';
import {
  normalizeOrdinaryResponse,
  responseIsBlank,
  serverGradingSupport,
} from '../../../functions/shared/ordinaryResponseGrading.mjs';

export { checkpointActionId, checkpointDocumentId };
export { RESPONSE_CHECKPOINT_SCHEMA_VERSION } from '../../../functions/shared/responseCheckpointSchema.mjs';

export const CHECKPOINT_DEBOUNCE_MS = 1200;

/** A checkpoint is worth keeping only for a question the server can finish. */
export const checkpointEligibility = ({ question, activityRole, secureContext = false } = {}) => {
  if (secureContext) return { eligible: false, reason: 'secure-context' };
  if (!['warmup', 'classwork', 'practice', 'dol'].includes(String(activityRole || ''))) {
    return { eligible: false, reason: `unsupported-activity-role:${activityRole || 'none'}` };
  }
  const support = serverGradingSupport(question);
  return { eligible: support.supported, reason: support.reason };
};

export const normalizeCheckpointResponse = (question, answerState) => normalizeOrdinaryResponse({ question, answerState });

export const responseFingerprint = (question, answerState) => stableStringify({
  response: normalizeCheckpointResponse(question, answerState),
  isComplete: answerState?.isComplete === true,
});

/**
 * Build the durable action for one checkpoint revision.
 *
 * An INCOMPLETE or cleared response is a first-class revision, not a no-op. A
 * student who types 7, checkpoints it, then deletes it has a current response
 * of "nothing", and the deadline must act on that — so the tombstone revision
 * is what supersedes the completed one.
 */
export const buildResponseCheckpointAction = ({
  identity,
  question,
  activityRole,
  answerState,
  revision,
  finalizeAt,
  finalizationReason,
  finalizationContext = {},
  previousTotalAttempts = 0,
  supportUsage = null,
  timeSpentSeconds = 0,
  capturedAt = Date.now(),
} = {}) => {
  const eligibility = checkpointEligibility({ question, activityRole });
  if (!eligibility.eligible) return null;
  // No provable close means no deadline to auto-submit at. The local draft
  // still holds the work; there is just nothing for the scheduler to do.
  if (!finalizeAt) return null;
  const response = normalizeCheckpointResponse(question, answerState);
  const isComplete = answerState?.isComplete === true && !responseIsBlank(response);
  return createDurableAction({
    kind: 'responseCheckpoint',
    actionId: checkpointActionId(identity),
    createdAt: capturedAt,
    studentId: identity.studentId,
    assignmentId: identity.assignmentId,
    questionIndex: identity.questionIndex,
    payload: buildResponseCheckpointPayload({
      identity,
      activityRole,
      response,
      isComplete,
      revision,
      candidateFinalizeAt: finalizeAt || null,
      finalizationReason: finalizationReason || null,
      finalizationContext,
      previousTotalAttempts,
      supportUsage,
      timeSpentSeconds,
      capturedAt,
    }),
  });
};

// A deterministic action id makes IndexedDB put() replace the superseded draft.
// Thus a long offline typing session occupies one row per exact question/version.
export const enqueueResponseCheckpoint = (input, options) => {
  const action = buildResponseCheckpointAction(input);
  return action ? enqueueDurableAction(action, options) : Promise.resolve(null);
};

/**
 * The action that retires a checkpoint when the student submits explicitly.
 *
 * It rides the same outbox as the submission it belongs to, so a manual Submit
 * and the retirement of its checkpoint reach Firestore in one transaction and
 * a deadline can never turn one response into two attempts.
 */
export const checkpointReleaseForSubmission = (identity) => (
  identity?.studentId && identity?.assignmentId != null && Number.isInteger(Number(identity?.questionIndex))
    ? checkpointDocumentId(identity)
    : null
);
