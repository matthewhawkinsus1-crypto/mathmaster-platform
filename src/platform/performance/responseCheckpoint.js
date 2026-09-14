import { createDurableAction, enqueueDurableAction } from './durableActionOutbox.js';
import { stableStringify } from '../../utils/idUtils.js';

export const RESPONSE_CHECKPOINT_SCHEMA_VERSION = 1;
export const CHECKPOINT_DEBOUNCE_MS = 1200;

const keyPart = (value) => encodeURIComponent(String(value ?? ''));

export const checkpointDocumentId = ({ studentId, assignmentId, questionIndex, questionId = '', variantIndex = 0, generationKey = '' }) =>
  [studentId, assignmentId, questionIndex, questionId, variantIndex, generationKey].map(keyPart).join('__');

export const checkpointActionId = (identity) => `response_checkpoint:${checkpointDocumentId(identity)}`;

export const normalizeCheckpointResponse = (answerState = {}) => ({
  responseKey: String(answerState.responseKey || ''),
  questionDetails: typeof answerState.questionDetails === 'string' ? answerState.questionDetails : '',
  parts: Array.isArray(answerState.parts) ? answerState.parts.map((part) => ({
    id: part?.id ?? null,
    response: part?.response ?? part?.studentAnswer ?? null,
    isComplete: part?.isComplete !== false,
  })) : [],
  partialCreditPercent: Number.isFinite(Number(answerState.partialCreditPercent)) ? Number(answerState.partialCreditPercent) : null,
});

export const responseFingerprint = (answerState) => stableStringify(normalizeCheckpointResponse(answerState));

export const buildResponseCheckpointAction = ({ identity, activityRole, answerState, revision, finalizeAt, finalizationReason, finalizationContext = {}, submissionEnvelope, capturedAt = Date.now() }) => {
  if (!answerState?.isComplete || !String(answerState.responseKey || '').trim()) return null;
  if (submissionEnvelope?.secure === true || submissionEnvelope?.seed != null || submissionEnvelope?.answerKey != null) {
    throw new Error('Protected assessment data cannot enter a response checkpoint.');
  }
  const documentId = checkpointDocumentId(identity);
  return createDurableAction({
    kind: 'responseCheckpoint', actionId: checkpointActionId(identity), createdAt: capturedAt,
    studentId: identity.studentId, assignmentId: identity.assignmentId, questionIndex: identity.questionIndex,
    payload: {
      schemaVersion: RESPONSE_CHECKPOINT_SCHEMA_VERSION,
      documentId,
      questionId: identity.questionId || null,
      variantIndex: Number(identity.variantIndex) || 0,
      generationKey: identity.generationKey || null,
      activityRole,
      revision: Number(revision) || 1,
      response: normalizeCheckpointResponse(answerState),
      isComplete: true,
      candidateFinalizeAt: finalizeAt || null,
      finalizationReason: finalizationReason || null,
      finalizationContext,
      submissionEnvelope,
      secure: false,
    },
  });
};

// A deterministic action id makes IndexedDB put() replace the superseded draft.
// Thus a long offline typing session occupies one row per exact question/version.
export const enqueueResponseCheckpoint = (input, options) => {
  const action = buildResponseCheckpointAction(input);
  return action ? enqueueDurableAction(action, options) : Promise.resolve(null);
};
