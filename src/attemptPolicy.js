// The attempt policy is a GRADING CONTRACT, not a UI helper.
//
// It now lives in functions/shared so a manual Submit in the browser and the
// Cloud Functions deadline finalizer apply the SAME attempt accounting to the
// same response. This file stays as the import path every caller already uses.
export {
  MAX_ATTEMPTS_PER_QUESTION,
  calculateStepPartialCredit,
  emptyQuestionRecord,
  getAttemptsRemaining,
  getQuestionCardState,
  getQuestionCredit,
  isChoiceOnlyQuestion,
  normalizeQuestionRecord,
  recordQuestionAttempt,
  recordQuestionStep,
  requestReplacementQuestion,
  resolveQuestionMaximumAttempts,
  resolveQuestionReplacementAllowed,
  resolveTeacherGrantedExtraAttempts,
} from '../functions/shared/attemptPolicy.mjs';
