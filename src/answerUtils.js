// Answer comparison is a GRADING CONTRACT, not a UI helper.
//
// It now lives in functions/shared so the browser grader, the Cloud Functions
// deadline finalizer and the tests all mark the same response the same way.
// This file stays as the import path every existing caller already uses.
export {
  answerCandidatesForField,
  compareMathAnswer,
  compareOrderedPair,
  looksLikeFiniteSetNotation,
  matchesAnyAnswer,
  matchesFieldAnswer,
  normalizeMathAnswer,
  parseFiniteSetNotation,
  parseNumericAnswer,
  parseOrderedPair,
  sameFiniteSetNotation,
} from '../functions/shared/answerUtils.mjs';
