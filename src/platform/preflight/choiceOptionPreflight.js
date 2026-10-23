/*
 * CHOICE OPTIONS WITH THE KEY'S VALUE — a Pre-Flight WARNING, never a block
 * (GR06).
 *
 * A choice is graded on the option the student picks (answerUtils.mjs,
 * pickedChoiceVerdict), so a distractor worth the same as the key — the
 * unsimplified (2a²b)(4a³b) for 8a⁵b², 2/4 for 1/2 — is wrong, as a
 * "simplify" or "which form" question means. If the question instead asks
 * which option is EQUIVALENT, that distractor answers it too: two right
 * answers, one credited. This lists every option with the key's value, so the
 * author can check the question asks for the form.
 *
 * Only options written as mathematics are compared. Words ("Whole numbers of
 * tickets from 0 to 600") and function notation ("f(3x) − 2") are not values
 * this reader compares reliably, and a match there would be noise.
 *
 * ADVISORY, like hintAnswerPreflight.js: shown in its own panel, never in the
 * readiness diagnostics.
 */
import { choiceFieldOptions, isChoiceAnswerField, matchesAnyAnswer } from '../../../functions/shared/answerUtils.mjs';

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const MATH_NAMES = /\\?\b(?:frac|dfrac|sqrt|cbrt|cdot|times|div|left|right|pi|leq?|geq?|neq?|log|ln|sin|cos|tan|abs)\b/g;
const writtenAsMath = (text) => {
  const plain = String(text ?? '').replace(MATH_NAMES, ' ');
  return plain.trim() !== '' && !/[A-Za-z]{3,}/.test(plain) && !/(^|[^A-Za-z\\])[fgh]\s*\(/.test(plain);
};

/** The options of a choice field, other than the key, that have the key's value. */
export const choiceOptionsWithKeyValue = (field = {}) => {
  if (!isChoiceAnswerField(field)) return [];
  const key = String(field.answer ?? field.expected ?? '');
  if (!writtenAsMath(key)) return [];
  return choiceFieldOptions(field)
    .filter((option) => option.trim() !== key.trim() && writtenAsMath(option))
    .filter((option) => matchesAnyAnswer(option, [key]));
};

export const auditAssignmentChoiceOptions = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    asArray(question.answerFields).forEach((field) => {
      const same = choiceOptionsWithKeyValue(field);
      if (!same.length) return;
      const key = String(field.answer ?? field.expected ?? '');
      const label = field.label ? ` (${field.label})` : '';
      warnings.push(`Question ${index + 1}${label}: ${same.map((option) => `"${option}"`).join(', ')} ${same.length === 1 ? 'has' : 'have'} the same value as the key "${key}". Students are marked right only for the key, which suits a question about form; if it asks which option is equivalent, ${same.length === 1 ? 'this option answers' : 'these options answer'} it too.`);
    });
  });
  return { warnings };
};
