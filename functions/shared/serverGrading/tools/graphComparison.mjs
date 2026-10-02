/*
 * Shared grader for the `graphComparison` structured question surface
 * (src/GraphComparison.jsx) — run by the screen for the verdict it reports,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from GraphComparison.jsx: one part per field with
 * an id; complete when the response is not blank; correct when complete AND
 *
 *   type 'choice'  the response matches `acceptedAnswers` (or `[answer]`)
 *                  under normalizeResponseText — graded against the key,
 *                  never against the order or length of `options`;
 *   any other      the response contains every `requiredConcepts` group
 *                  (or `requiredConceptGroups`).
 *
 * Each response is read WHOLE (scenarioWork.mjs freeText): a concept written
 * after the contract's per-string limit counts, as it did on the screen.
 *
 * KNOWN CONTENT DEFECT, KEPT AT PARITY: a non-choice field with no concept
 * groups accepts ANY non-blank text (matchesConceptGroups(x, []) is "not
 * empty"), and its `answer` is not read. The type catalog's own example is
 * such a field. Credit is not silently changed here; the defect belongs to
 * Pre-Flight / authoring, which must require concepts (or `type: 'choice'`).
 */
import declaration from '../declarations/graphComparison.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { matchesAcceptedText, matchesConceptGroups } from '../../toolMath/scenario/scenarioResponseUtils.mjs';
import { readFieldResponses } from '../../toolMath/scenario/scenarioWork.mjs';

const compare = (question, work) => {
  const fields = Array.isArray(question.fields) ? question.fields.filter((item) => item?.id) : [];
  const responses = readFieldResponses(work);
  const parts = fields.map((field) => {
    const response = responses.get(String(field.id)) ?? '';
    const isComplete = response.trim() !== '';
    const matches = field.type === 'choice'
      ? matchesAcceptedText(response, field.acceptedAnswers || [field.answer])
      : matchesConceptGroups(response, field.requiredConcepts || field.requiredConceptGroups || []);
    return { id: field.id, label: field.label || field.id, isComplete, isCorrect: isComplete && matches, response };
  });
  return gradedResult({
    isComplete: parts.length > 0 && parts.every((part) => part.isComplete),
    parts,
  });
};

export default bindToolGrader(declaration, 'graphComparison', {
  compare,
});
