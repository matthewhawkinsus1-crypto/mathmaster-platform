/*
 * A RIGHT LINE WITH A COMMON FACTOR LEFT IN (GR29).
 *
 * A whole-number multiple of a standard-form key is graded right
 * (answerEquivalence.mjs sameStandardFormMultiple): 4x + 2y = 6 for
 * 2x + y = 3. The owner also asked that the student be told to divide out the
 * common factor, so the "Correct!" box says so, once, under the verdict. Only
 * for a multiple other than 1 or −1, and only for a part graded right: it is
 * a note about form, never a reason the answer was wrong.
 */
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import { normalizeAnswer } from '../../../../functions/shared/answerEquivalence.mjs';
import { LINE_FORMS, wholeMultipleOfLine, writtenLineForm } from '../../../../functions/shared/linearEquationForm.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

/** The common factor a right standard-form answer still carries, or null. */
export const standardFormCommonFactor = (response, key) => {
  try {
    const student = normalizeAnswer(text(response));
    const keyed = normalizeAnswer(text(key));
    if (writtenLineForm(keyed) !== LINE_FORMS.STANDARD || writtenLineForm(student) !== LINE_FORMS.STANDARD) return null;
    const factor = wholeMultipleOfLine(student, keyed);
    return factor !== null && Math.abs(factor) >= 2 ? factor : null;
  } catch {
    return null;
  }
};

export const standardFormMultipleNote = ({ question = null, parts = [] } = {}) => {
  const fields = list(question?.answerFields);
  for (const part of list(parts)) {
    if (!part || part.graded === false || part.isCorrect !== true || typeof part.response !== 'string') continue;
    const field = fields.find((entry) => text(entry?.id) === text(part.id));
    if (!field) continue;
    const factor = answerCandidatesForField(field)
      .map((key) => standardFormCommonFactor(part.response, key))
      .find((value) => value !== null);
    if (factor) return `Every term shares a factor of ${factor}. Divide it out to write the equation with the smallest whole numbers.`;
  }
  return '';
};
