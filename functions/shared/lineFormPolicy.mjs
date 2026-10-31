/*
 * WHETHER A LINE FIELD TAKES ANY EQUATION OF ITS LINE (GR03).
 *
 * The owner, 2026-10-24: "Yes for any question that names no form." Before
 * this, a field keyed `y = -3x + 5` refused `y - 5 = -3(x - 0)` and
 * `3x + y = 5` even when nothing on screen asked for slope-intercept form
 * (the student was only told afterwards which form the key used, R-3).
 *
 * A field takes any equation of its line (`lineForm: 'any'`, read by
 * answerEquivalence.fieldValueOptions) when ALL of these hold:
 *
 *   - its key is a line in both x and y (isObliqueLine). An equation in one
 *     letter is also every step of solving an equation ("the equation after
 *     squaring": `2x + 9 = 25`), where the question's own equation is the
 *     same "line"; those keep the form they are keyed in;
 *   - it is typed (not a choice) and has no rule of its own (`equivalence`,
 *     `gradingMode`, `answerForm`, a named `lineForm`);
 *   - nothing the student reads for this question asks for a form or a
 *     rewrite (asksForAForm): the field's label, placeholder or hint, and
 *     the question's prompt, heading, context, displayed math, table and
 *     graph text. The prompt counts for EVERY field of the question, not only
 *     a lone one: "Write line A in standard form" keeps line B form-for-form
 *     too, because being wrong that way only keeps today's grading;
 *   - none of that text already shows the key's line (showsLine), so a
 *     student cannot copy the question's own equation as the answer.
 *
 * An author may also write `lineForm: 'any'` on a field to ask for it.
 *
 * A caller that hands no question prompt (only the fields: the systems
 * workspace's plane answers) has nothing to read, so it keeps form-for-form
 * grading. The assignment grader (ordinaryResponseGrading) applies this per
 * field, on the device and the server alike; Path, a test and Live Challenge
 * store it in the private grading at issue (functions/lib/mathPath.js
 * buildIssuePlan), as does the teacher's simulation, so an item issued
 * before this keeps the grading it was issued with.
 */
import { answerCandidatesForField } from './answerUtils.mjs';
import { LINE_FORM_ANY, formRequestIn, isLine, isObliqueLine, showsLine } from './linearEquationForm.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value) => (typeof value === 'string' ? [value] : []);

// Every string inside a display object (a table's cells, a graph's labels),
// bounded so a malformed object cannot run away.
const stringsWithin = (value, found = [], depth = 0) => {
  if (found.length >= 400 || depth > 6 || value === null || value === undefined) return found;
  if (typeof value === 'string') found.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => stringsWithin(entry, found, depth + 1));
  else if (isObject(value)) Object.values(value).forEach((entry) => stringsWithin(entry, found, depth + 1));
  return found;
};

/** What the student reads for the question as a whole. */
export const questionTexts = (question = {}) => [
  ...['prompt', 'heading', 'instructions', 'stem', 'directions'].flatMap((key) => strings(question?.[key])),
  ...strings(question?.context),
  ...strings(question?.context?.scenario),
  ...['mathDisplay', 'supportingMath', 'equations', 'stimulus', 'table', 'graph', 'visual'].flatMap((key) => stringsWithin(question?.[key])),
];

/** What the student reads beside this one field. */
export const fieldTexts = (field = {}) => ['label', 'prompt', 'placeholder', 'instructions', 'responseHint', 'unit']
  .flatMap((key) => strings(field?.[key]));

const isChoiceField = (field = {}) => [field?.type, field?.inputProfile].some((value) => String(value ?? '').toLowerCase() === 'choice')
  || (Array.isArray(field?.options) && field.options.length > 0)
  || (Array.isArray(field?.choices) && field.choices.length > 0);

const OWN_RULE_KEYS = ['equivalence', 'gradingMode', 'answerForm'];

/**
 * The decision for one field, with its reason and the words that asked for a
 * form (scripts/report-line-form-equivalence.mjs reports them):
 * `{ lineForm: 'any' | null, reason, request }`.
 */
export const lineFormDecision = (question = {}, field = {}) => {
  const decide = (reason, { any = false, request = null } = {}) => ({ lineForm: any ? LINE_FORM_ANY : null, reason, request });
  if (field?.lineForm === LINE_FORM_ANY) return decide('asked-by-author', { any: true });
  if (isChoiceField(field)) return decide('choice');
  if (OWN_RULE_KEYS.some((key) => field?.[key])) return decide('own-rule');
  if (field?.lineForm) return decide('form-named-by-field', { request: `lineForm: ${field.lineForm}` });
  const keys = answerCandidatesForField(field).filter((key) => typeof key === 'string');
  if (!keys.length || !isLine(keys[0])) return decide('not-a-line');
  if (!isObliqueLine(keys[0])) return decide('one-letter');
  if (typeof question?.prompt !== 'string') return decide('no-question-text');
  const fieldRequest = formRequestIn(fieldTexts(field));
  if (fieldRequest) return decide('form-named-by-field', { request: fieldRequest });
  const questionRequest = formRequestIn(questionTexts(question));
  if (questionRequest) return decide('form-named-by-question', { request: questionRequest });
  if (showsLine([...fieldTexts(field), ...questionTexts(question)], keys)) return decide('question-shows-the-line');
  return decide('no-form-named', { any: true });
};

/** The field as its grader should read it: with `lineForm: 'any'` when it takes any equation of its line. */
export const withLineFormPolicy = (question = {}, field = {}) => (
  lineFormDecision(question, field).lineForm === LINE_FORM_ANY && field?.lineForm !== LINE_FORM_ANY
    ? { ...field, lineForm: LINE_FORM_ANY }
    : field
);

/**
 * A Path private grading (mathPath.privateGradingDefinition,
 * legacyFieldGrading.buildFieldGradingDefinition) with the decision stored
 * on each field, read from the question it was issued from. Its fields are
 * the question's responseFields, in order.
 */
export const withLineFormGrading = (question = {}, grading = {}) => {
  const authored = Array.isArray(question?.responseFields) ? question.responseFields : [];
  if (!Array.isArray(grading?.fields)) return grading;
  return {
    ...grading,
    fields: grading.fields.map((field, index) => (
      lineFormDecision(question, authored[index] || {}).lineForm === LINE_FORM_ANY
        ? { ...field, lineForm: LINE_FORM_ANY }
        : field
    )),
  };
};
