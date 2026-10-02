/*
 * Shared grader for the `expressionMeaning` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted from ExpressionMeaning.jsx's Submit, which called
 * scoreExpressionMeaning. This grader calls that SAME function — still the
 * only definition of correctness — so every check is unchanged: each pick is
 * compared with the authored answer after trimming, lower-casing and
 * collapsing spaces; a blank pick is never right; the score is the share of
 * the 3 × (number of expressions) picks that are right; the question is
 * correct only when every expression has all three right. The choice banks
 * play no part, so trimming or reordering them cannot change a verdict.
 *
 * Parts are one per expression, as the matrix reported them, now carrying
 * `credit` = right picks / 3 so a part grade states the same partial credit
 * the score does. A row is complete exactly when the matrix's own Submit gate
 * says so (`String(value || '').trim()` for each of its three picks).
 */
import declaration from '../declarations/expressionMeaning.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import {
  EXPRESSION_MEANING_DIMENSIONS,
  scoreExpressionMeaning,
} from '../../toolMath/expressionMeaning/expressionMeaningMath.mjs';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const expressionsOf = (question) => (Array.isArray(question?.expressions) ? question.expressions : []);

// A pick is an option from the bank: authored text, occasionally a number.
// Anything else a tampered response sends is no pick at all.
const pickText = (value) => {
  if (typeof value === 'string') return value;
  if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') return String(value);
  return '';
};
// An authored id as the matrix keys its state by it: a property key, so any
// scalar id reads as its own spelling (1 and '1' are the same row, as they
// are in the matrix's `assignments`).
const idKey = (value) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : null);
// The option itself, as the matrix holds it (text, a number or a boolean).
const optionValue = (value) => (
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : ''
);
// Whether a dimension counts as chosen: the matrix's own rule. Its row
// completeness, its Submit gate, its matrix cell and its selected button all
// read `value || ''`, so an option authored as 0 or false never shows as
// chosen there and does not make the row complete here. It is still marked
// against the key exactly as before.
const pickChosen = (value) => Boolean(value) && pickText(value).trim() !== '';

/**
 * The matrix's state as work: one selection per authored expression, in
 * matrix order. ExpressionMeaning.jsx submits and reports exactly this.
 */
export const expressionMeaningWork = (question, assignments) => {
  const given = isRecord(assignments) ? assignments : {};
  return {
    selections: expressionsOf(question).map((expr) => {
      const key = idKey(expr?.id);
      const row = key !== null && Object.prototype.hasOwnProperty.call(given, key) && isRecord(given[key]) ? given[key] : {};
      return {
        id: expr?.id,
        ...Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => [dimension, optionValue(row[dimension])])),
      };
    }),
  };
};

/**
 * Selections by authored id: per id, `picks` (the text each dimension is
 * marked on) and `chosen` (whether the matrix counts that dimension as filled
 * in). The first selection for an id is the one read.
 */
const readSelections = (work) => {
  const byId = new Map();
  (Array.isArray(work?.selections) ? work.selections : []).forEach((entry) => {
    if (!isRecord(entry)) return;
    const key = idKey(entry.id);
    if (key === null || byId.has(key)) return;
    byId.set(key, {
      picks: Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => [dimension, pickText(entry[dimension])])),
      chosen: Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => [dimension, pickChosen(entry[dimension])])),
    });
  });
  return byId;
};

/**
 * scoreExpressionMeaning over the work — the one call both the verdict and
 * the matrix's per-dimension feedback come from.
 */
export const expressionMeaningChecks = (question = {}, work = {}) => {
  const byId = readSelections(work);
  // A prototype-free map, so an authored id such as `__proto__` or
  // `constructor` is an ordinary entry and never an inherited property.
  const assignments = Object.create(null);
  byId.forEach((selection, key) => { assignments[key] = selection.picks; });
  return { byId, scored: scoreExpressionMeaning(question || {}, { assignments }) };
};

/**
 * Per expression, in matrix order: { unit, contextMeaning, mathRole } true
 * when that pick is right — which dimension to reconsider, never the answer.
 */
export const expressionMeaningDimensionChecks = (question, work) => (
  expressionMeaningChecks(question, work).scored.perExpression.map((entry) => ({ ...entry.checks }))
);

const BLANK_SELECTION = Object.freeze({
  picks: Object.freeze(Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => [dimension, '']))),
  chosen: Object.freeze(Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => [dimension, false]))),
});

const gradeMatrix = (question, work) => {
  const expressions = expressionsOf(question);
  const { byId, scored } = expressionMeaningChecks(question, work);
  const parts = expressions.map((expr, index) => {
    const entry = scored.perExpression[index];
    const key = idKey(expr?.id);
    const { picks, chosen } = (key !== null && byId.get(key)) || BLANK_SELECTION;
    const right = EXPRESSION_MEANING_DIMENSIONS.filter((dimension) => entry.checks[dimension]).length;
    return {
      id: expr?.id,
      label: expr?.expression || expr?.id,
      isComplete: EXPRESSION_MEANING_DIMENSIONS.every((dimension) => chosen[dimension]),
      isCorrect: entry.complete === true,
      credit: right / EXPRESSION_MEANING_DIMENSIONS.length,
      response: EXPRESSION_MEANING_DIMENSIONS.map((dimension) => picks[dimension]).join(' | '),
    };
  });
  return gradedResult({
    // Every row of the matrix filled in — what the Submit button waits for.
    isComplete: parts.length > 0 && parts.every((part) => part.isComplete),
    isCorrect: scored.isCorrect === true,
    score: scored.score,
    parts,
  });
};

export default bindToolGrader(declaration, 'expressionMeaning', {
  default: gradeMatrix,
});
