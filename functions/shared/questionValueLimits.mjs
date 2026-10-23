/*
 * A QUESTION'S VALUE: THE SCALE'S BOUNDS, AND READING AN AUTHORED VALUE.
 *
 * Kept apart from questionValue.mjs, which measures a question's work and so
 * brings the grading manifest and the whole Question Family registry: the
 * stored-assignment schema (src/platform/contract/assignmentSchemaV5.js) needs
 * only these, and it is in the student's first load
 * (scripts/check-first-load-budget.mjs). questionValue.mjs re-exports them.
 * The bounds are the grade contract's own (questionWeights.js).
 */

export const MIN_QUESTION_VALUE = 0.25;
export const MAX_QUESTION_VALUE = 20;

const TEMPLATE_TOKEN = /\{\{[^}]*\}\}/;

/**
 * What the question's own `questionWeight` says.
 *
 *   { present: false }                                 none written
 *   { present: true, valid: true, value }              a usable value
 *   { present: true, valid: false, raw, problem }      written, but unusable:
 *     'not-a-number' | 'not-positive' | 'below-minimum' | 'above-maximum'
 *     | 'templated' (a Question Family placeholder: a value per student)
 *
 * A present-but-invalid value is never replaced: it is a teacher's or an
 * author's decision gone wrong, and Pre-Flight reports it instead.
 */
export const explicitQuestionValue = (question) => {
  const raw = question?.questionWeight;
  if (raw === undefined || raw === null || raw === '') return { present: false };
  if (typeof raw === 'string' && TEMPLATE_TOKEN.test(raw)) return { present: true, valid: false, raw, problem: 'templated' };
  if (typeof raw !== 'number' && typeof raw !== 'string') return { present: true, valid: false, raw, problem: 'not-a-number' };
  const value = Number(raw);
  if (!Number.isFinite(value) || (typeof raw === 'string' && !raw.trim())) return { present: true, valid: false, raw, problem: 'not-a-number' };
  if (value <= 0) return { present: true, valid: false, raw, problem: 'not-positive' };
  if (value < MIN_QUESTION_VALUE) return { present: true, valid: false, raw, problem: 'below-minimum' };
  if (value > MAX_QUESTION_VALUE) return { present: true, valid: false, raw, problem: 'above-maximum' };
  return { present: true, valid: true, value };
};

