/*
 * Shared grader for the `functionOperationsLab` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from FunctionOperationsLab.jsx:
 *
 *   - the same operations (normalizeFunctionOperations: the authored list, or
 *     sum/difference/product/quotient, supported names only, each once) and
 *     the same composition order (normalizeComposeOrder);
 *   - the same derived key (deriveFunctionOperations from f, g, operations,
 *     composeOrder and restrictions) and the same matchers
 *     (functionOperationAnswerMatches: the quotient is compared as a rational
 *     function on its domain, so its poles may fall only at the key's excluded
 *     values — an unreduced (x² − 1)/(x − 1) is x + 1 for x ≠ 1 — and
 *     sameValue for everything else; restrictionsMatch);
 *   - the same score: every operation is worth one share, and a quotient's
 *     share is split evenly between its expression and its excluded values —
 *     so the quotient's two parts weigh one half each.
 *
 * Completeness: every requested expression box is non-blank, and the
 * excluded-values box is non-blank unless the original denominator excludes
 * nothing (the lab tells the student to leave it blank exactly then).
 */
import declaration from '../declarations/functionOperationsLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import {
  deriveFunctionOperations,
  functionOperationAnswerMatches,
  normalizeComposeOrder,
  normalizeFunctionOperations,
  restrictionsMatch,
} from '../../toolMath/functionOperations/functionOperationsMath.mjs';

// A typed box holds a string (a number reads the same way). Any other type is
// not something the lab's inputs can produce, so it counts as no entry.
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => entry(value).trim() !== '';
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const OPERATION_LABELS = Object.freeze({
  sum: '(f + g)(x)',
  difference: '(f − g)(x)',
  product: '(fg)(x)',
  quotient: '(f / g)(x)',
});

const operationLabel = (operation, composeOrder) => (operation === 'composition'
  ? (composeOrder === 'gOfF' ? '(g ∘ f)(x)' : '(f ∘ g)(x)')
  : OPERATION_LABELS[operation]);

const functionOperations = (question, work) => {
  const operations = normalizeFunctionOperations(question.operations);
  const composeOrder = normalizeComposeOrder(question.composeOrder);
  let answers;
  try {
    answers = deriveFunctionOperations({
      f: question.f,
      g: question.g,
      operations,
      composeOrder,
      restrictions: question.restrictions,
    });
  } catch {
    // A missing or unsupported f / g, or a nonlinear denominator with no
    // authored exclusions: the lab cannot even render this question, so the
    // server says so instead of blaming the student's work.
    return ungradedResult('invalid-question');
  }

  const responses = isPlainObject(work.responses) ? work.responses : {};
  const restrictions = entry(work.restrictions);
  const parts = [];
  const excludedValues = answers.quotient?.excludedValues || [];
  operations.forEach((operation) => {
    const response = entry(responses[operation]);
    const expected = answers[operation]?.expression || '';
    const expressionCorrect = filled(response) && functionOperationAnswerMatches(operation, response, expected, { excludedValues });
    const label = operationLabel(operation, composeOrder);
    if (operation !== 'quotient') {
      parts.push({ id: operation, label, isComplete: filled(response), isCorrect: expressionCorrect, response });
      return;
    }
    parts.push({ id: 'quotient', label, isComplete: filled(response), isCorrect: expressionCorrect, weight: 0.5, response });
    parts.push({
      id: 'quotient-restrictions',
      label: 'Excluded x-value(s)',
      isComplete: filled(restrictions) || excludedValues.length === 0,
      isCorrect: restrictionsMatch(restrictions, excludedValues),
      weight: 0.5,
      response: restrictions,
    });
  });

  return gradedResult({
    // Nothing to answer is not finished work.
    isComplete: parts.length > 0 && parts.every((part) => part.isComplete),
    parts,
  });
};

export default bindToolGrader(declaration, 'functionOperationsLab', {
  functionOperations,
});
