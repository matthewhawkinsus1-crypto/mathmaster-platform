// One quality audit, shared with the server.
//
// The rules moved to `functions/shared/pathQuestionQuality.mjs` so the Cloud
// Function that builds the coverage index and the teacher screens that read it
// apply the SAME definition of "production quality". A browser-only copy would
// have meant the coverage dashboard and the authoring tools could disagree
// about whether a standard was finished, which is precisely the disagreement
// that let 515 placeholder items be reported as ready.
//
// This file stays as the import path every browser caller already uses.

export {
  QUESTION_QUALITY,
  QUESTION_QUALITY_LABELS,
  REPRESENTATIONS,
  TASK_TYPES,
  auditPathQuestionQuality,
  buildPathQuestionRevisionBrief,
  declaredToolOf,
  detectDuplicateFamilies,
  hasRealChoices,
  hasStimulus,
  interactionOf,
  promptShape,
  representationOf,
  summarizePathBankQuality,
  taskTypeOf,
} from '../../../functions/shared/pathQuestionQuality.mjs';

export { auditPathQuestionQuality as default } from '../../../functions/shared/pathQuestionQuality.mjs';
