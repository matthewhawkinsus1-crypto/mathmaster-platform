/*
 * WHICH GRADING SURFACE A QUESTION GRADED ON THE DEVICE BELONGS TO
 * (student pass 3, HELP-15).
 *
 * The structured question surfaces that QuestionEngine renders itself —
 * Graphing Lines (GraphLine.jsx), the Relationship Model and the rest of
 * STRUCTURED_TYPE_DECLARATIONS — are graded on the device from the module's
 * own parts. The misconception classifiers are keyed on the surface and mode
 * the server names (`graphing/lineFeatures`, `relationshipModel/standalone`,
 * functions/shared/misconceptionClassifiers.mjs), and the display grading the
 * engine built carried neither. So the server recorded
 * "slope-intercept-swapped" while the student saw only "Not quite".
 *
 * This names the surface and mode exactly as the shared declarations do, so
 * the message the student sees and the evidence the server records come from
 * the same classifier. Anything that is not a structured surface gets nothing:
 * registry tools and ordinary types report their own grading.
 */
import { STRUCTURED_TYPE_DECLARATIONS } from '../../../functions/shared/serverGrading/gradingManifest.mjs';

export const displayGradingSurface = (question = null) => {
  const type = typeof question?.type === 'string' ? question.type.trim() : '';
  if (!type || !Object.prototype.hasOwnProperty.call(STRUCTURED_TYPE_DECLARATIONS, type)) return {};
  const declaration = STRUCTURED_TYPE_DECLARATIONS[type];
  const resolved = typeof declaration?.resolveMode === 'function' ? declaration.resolveMode(question) : null;
  const mode = typeof resolved === 'string' && resolved ? resolved : declaration?.defaultMode;
  return typeof mode === 'string' && mode ? { surfaceId: type, mode } : { surfaceId: type };
};
