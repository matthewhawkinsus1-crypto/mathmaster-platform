import { answerFormatOf } from './answerFormatHints.js';
import { looksLikeMixedNumber } from '../../../functions/shared/answerEquivalence.mjs';
import { fractionAnswerCandidates, fractionAnswerRequiresLowestTerms } from '../../../functions/shared/fractionAnswer.mjs';

/*
 * CATCH A SHAPE MISTAKE BEFORE IT COSTS A TRY.
 *
 * The field's format hint already says "No equals sign", yet "aₙ = 3 · 2^(n−1)" — the
 * correct formula, written the way the lesson writes it — was graded wrong and
 * cost one of three tries, with nothing but a red border to explain why (live
 * QA, Algebra I DOL #2). The shape is a rule the platform states; it should be
 * checked as one, not scored as a mathematics error.
 *
 * Returns the message to show while the typed response breaks its field's
 * stated shape, or '' when it does not. It never judges the mathematics, and it
 * steps aside for a field whose own answer breaks the stated shape, so it can
 * never hold back an answer the key would accept.
 *
 * It lives apart from answerFormatHints.js on purpose: that module builds the
 * help students read and must never touch the expected answer. This one reads
 * the key only to decide whether to step aside, and its messages are fixed
 * sentences — nothing from the key is ever shown.
 */
const hasEqualsSign = (value) => /=/.test(String(value ?? ''));
const authoredAnswers = (field = {}) => [
  field?.answer,
  ...(Array.isArray(field?.acceptedAnswers) ? field.acceptedAnswers : []),
].filter((entry) => entry !== undefined && entry !== null).map(String);

export const formatProblemForResponse = (field = {}, value = '') => {
  if (!String(value ?? '').trim()) return '';
  const format = answerFormatOf(field);
  const keys = authoredAnswers(field);
  if (format === 'expression' && hasEqualsSign(value) && !keys.some(hasEqualsSign)) {
    return 'Write only the expression, without an equals sign. Leave out the part before "=".';
  }
  // A number box gets the same protection. "b = 4" in the y-intercept box was
  // graded wrong and spent a try, and once a slope of -2/3 became a number
  // (platform quirks audit) "m = -2/3" would have too.
  if (format === 'number' && hasEqualsSign(value) && !keys.some(hasEqualsSign)) {
    return 'Write only the number, without an equals sign. Leave out the part before "=".';
  }
  if (format === 'equation' && !hasEqualsSign(value) && keys.length && keys.every(hasEqualsSign)) {
    return 'Write the full equation, including the equals sign.';
  }
  // A Digital SAT number box (numberRules, set by the CCMR hydration): the
  // grader reads 3½ as 7/2, but the SAT itself does not take a mixed number,
  // so the box says so at entry, for any mixed number (wave 7 review, S7).
  if (field?.numberRules === 'digitalSAT' && looksLikeMixedNumber(value) && !keys.some(looksLikeMixedNumber)) {
    return 'The SAT doesn\'t take mixed numbers. Enter it as an improper fraction or a decimal.';
  }
  return '';
};

/*
 * A MIXED NUMBER WHERE THE QUESTION ASKS FOR ONE FRACTION (student pass 3,
 * wave 7). A number box reads 3½ as 7/2 now; a `fraction` question that asks
 * for lowest terms keeps its rule that the answer is one fraction
 * (ordinaryResponseGrading matchesAuthoredFractionAnswer), so a mixed number
 * there was a silent wrong. This says why before a try is spent. It fires for
 * any mixed number, right or wrong, so it says nothing about the key, and it
 * steps aside when the author listed a mixed number among the answers.
 */
export const fractionFormProblemForResponse = (question = {}, value = '') => {
  if (!String(value ?? '').trim() || !looksLikeMixedNumber(value)) return '';
  if (!fractionAnswerRequiresLowestTerms(question)) return '';
  if (fractionAnswerCandidates(question).some(looksLikeMixedNumber)) return '';
  return 'Write your answer as one fraction in lowest terms, not as a whole number and a fraction.';
};
