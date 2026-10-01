/*
 * Shared grader for the `constraintFunctionBuilder` registry tool — run by the
 * browser tool for feedback, by QuestionEngine for the recorded verdict, and
 * by the server as the authority. See ../toolGraderDefinition.mjs for the
 * contract.
 *
 * Extracted check-for-check from ConstraintFunctionBuilder.jsx's Check: the
 * student's model is scored against the question's constraints by the tool's
 * own scoreConstraintModel — one part per constraint, isCorrect only when
 * every constraint holds, score = satisfied / total — with the same legacy
 * quadrant rewrite the screen's checklist shows, read from the AUTHORED
 * prompt on both sides (a translation support never changes the verdict).
 *
 * Two facts the screen enforced with its controls are enforced here, because
 * the server cannot see the controls:
 *
 *   - the builder will not submit until the student has made a choice
 *     (`hasEdited`). Untouched work is incomplete and earns nothing, so a
 *     deadline never submits the starting model on a student's behalf;
 *   - the Family select offers only the question's families. A model in a
 *     family the student could never have selected is not their work.
 */
import declaration from '../declarations/constraintFunctionBuilder.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import {
  builderEquation,
  builderFamilyIsReachable,
  effectiveBuilderConstraints,
  normalizeBuilderModel,
  scoreConstraintModel,
} from '../../toolMath/constraintFunctionBuilder/constraintFunctionMath.mjs';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A part is named by its constraint's `id`, else its kind; two constraints of
// the same kind (two required points, say) still get distinct part ids.
const uniqueIds = (ids) => {
  const used = new Set();
  return ids.map((id) => {
    let candidate = id;
    for (let copy = 2; used.has(candidate); copy += 1) candidate = `${id}-${copy}`;
    used.add(candidate);
    return candidate;
  });
};

const construct = (question, work) => {
  const constraints = effectiveBuilderConstraints(question);
  const rawModel = isPlainObject(work.model) ? work.model : null;
  const model = normalizeBuilderModel(rawModel || {});
  const constructed = work.hasEdited === true
    && Boolean(rawModel)
    && builderFamilyIsReachable(question, rawModel.family);
  const scored = scoreConstraintModel(model, constraints);
  const ids = uniqueIds(scored.parts.map((part, index) => String(part.id ?? '') || `constraint-${index + 1}`));
  const equation = rawModel ? builderEquation(model) : '';
  return gradedResult({
    isComplete: constructed,
    isCorrect: constructed && scored.isCorrect,
    score: constructed ? scored.score : 0,
    parts: scored.parts.map((part, index) => ({
      id: ids[index],
      label: part.label,
      isComplete: constructed,
      isCorrect: constructed && part.isCorrect,
      response: equation,
    })),
  });
};

export default bindToolGrader(declaration, 'constraintFunctionBuilder', {
  default: construct,
});
