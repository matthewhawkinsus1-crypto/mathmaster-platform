import { isChoiceOnlyQuestion } from '../../../../functions/shared/attemptPolicy.mjs';

/*
 * CHOICE-ONLY ITEMS: ONE TRY, SAID UP FRONT, AND A REASON AFTER IT (student
 * pass 3, HELP-18).
 *
 * A question made only of choices gets one attempt (attemptPolicy.mjs,
 * resolveQuestionMaximumAttempts): one wrong tap closed it and showed the
 * answer, with no hint offer (that comes from the second miss) and no reason.
 * 50 of 265 real practice-like items work this way.
 *
 *   oneTryNotice        before the single try, where outcomes are shown at
 *                       once: "This has one try — a hint is available." (the
 *                       hint half only while the hint control can reveal one;
 *                       the release rules are questionHints.js's, unchanged)
 *   chosenOptionReasons after it: the author's one line for the option the
 *                       student chose, when one is authored —
 *                       answerFields[].optionRationales: { "<option>": "<line>" }
 *
 * Neither says anything on a DOL, quiz or test while it can be answered: the
 * notice needs immediate feedback, and the reasons are shown only where the
 * worked solution is (QuestionEngine, behind feedbackOpen).
 */
export const ONE_TRY_WITH_HINT = 'This has one try — a hint is available.';
export const ONE_TRY = 'This has one try.';

const text = (value) => String(value ?? '').trim();
const key = (value) => text(value).toLowerCase().replace(/\s+/g, ' ');
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const oneTryNotice = ({
  question = null,
  maximumAttempts = null,
  attemptCount = 0,
  open = true,
  immediateFeedback = false,
  hintAvailable = false,
} = {}) => {
  if (!open || !immediateFeedback) return null;
  if (Number(maximumAttempts) !== 1 || Number(attemptCount) > 0) return null;
  if (!isChoiceOnlyQuestion(question || {})) return null;
  return hintAvailable ? ONE_TRY_WITH_HINT : ONE_TRY;
};

/** The option's display text (an option may be a string or { value, label }). */
const optionText = (option) => (isObject(option) ? text(option.label ?? option.value ?? option.text) : text(option));

/** The authored reason for one option of one field, or ''. */
export const optionRationale = (field, chosen) => {
  const reasons = isObject(field?.optionRationales) ? field.optionRationales : null;
  if (!reasons || !text(chosen)) return '';
  const wanted = key(chosen);
  const match = Object.entries(reasons).find(([option]) => key(option) === wanted);
  if (match) return text(match[1]);
  // A choice recorded by its value whose reason is keyed by its label (or the reverse).
  const option = list(field?.options ?? field?.choices).find((entry) => isObject(entry)
    && [entry.value, entry.label, entry.text].some((value) => key(value) === wanted));
  if (!option) return '';
  const byOther = Object.entries(reasons).find(([name]) => [option.value, option.label, option.text].some((value) => key(value) === key(name)));
  return byOther ? text(byOther[1]) : '';
};

/**
 * For each graded choice part with an authored reason for what the student
 * chose: { id, label, chosen, rationale, isCorrect }. `parts` are the
 * device's own graded parts ({ id, response, isCorrect }).
 */
export const chosenOptionReasons = ({ question = null, parts = [] } = {}) => {
  const fields = list(question?.answerFields).filter((field) => field && text(field.id));
  return list(parts).flatMap((part) => {
    const field = fields.find((entry) => text(entry.id) === text(part?.id ?? part?.key));
    if (!field || !isObject(field.optionRationales)) return [];
    const chosen = typeof part?.response === 'string' ? part.response : '';
    const rationale = optionRationale(field, chosen);
    if (!rationale) return [];
    const shown = list(field.options ?? field.choices).map(optionText).find((option) => key(option) === key(chosen)) || text(chosen);
    return [{ id: text(field.id), label: text(field.label) || text(field.id), chosen: shown, rationale, isCorrect: typeof part?.isCorrect === 'boolean' ? part.isCorrect : null }];
  });
};

/**
 * Pre-Flight: an authored optionRationales map that cannot be shown — not an
 * object of one-line strings, or keyed by something that is not an option.
 * Messages for the teacher; never a block.
 */
export const optionRationaleProblems = (question) => list(question?.answerFields).flatMap((field) => {
  if (field?.optionRationales === undefined) return [];
  const name = text(field?.label) || text(field?.id) || 'a choice';
  if (!isObject(field.optionRationales)) return [`the reasons for "${name}" (optionRationales) are not a list of option → reason`];
  const options = list(field.options ?? field.choices).map(optionText).map(key);
  return Object.entries(field.optionRationales).flatMap(([option, reason]) => {
    if (typeof reason !== 'string' || !text(reason)) return [`the reason for "${option}" in "${name}" is empty`];
    if (options.length && !options.includes(key(option))) return [`"${option}" in "${name}" is not one of its options, so its reason is never shown`];
    if (text(reason).length > 240 || /\n/.test(reason)) return [`the reason for "${option}" in "${name}" should be one short line`];
    return [];
  });
});
