/*
 * ANSWER KEYS THAT MAY NOT BE GRADED THE WAY THEY READ — a Pre-Flight
 * WARNING, never a block.
 *
 * ADVISORY, like choiceOptionPreflight.js: shown in its own panel, never in the
 * readiness diagnostics. A warning diagnostic makes an assignment "Needs
 * Review", an unpublished draft students never see, and nothing here stops an
 * assignment from working.
 *
 * A POWER IN BRACKETS OVER A DIVISOR, IN PLAIN TEXT (GR04). `2^(x-1)/3` reads
 * two ways: (2^(x−1))/3, the usual order of operations, or 2^((x−1)/3). The
 * renderer draws such a key as the second (stackDivisions.mjs) and the grader
 * follows what is drawn; the owner kept that reading (GR04), so an author who
 * meant the first is graded against something else. `10^-3/2` is the same
 * question with a bare negative exponent. Only typed keys are read: a choice
 * is graded by the option picked, never by reading its text. A braced
 * exponent (`2^{x-1}/3`) or a `\frac` is unambiguous and is not flagged.
 *
 * "LOWEST TERMS" ASKED OF A BOX THAT TAKES ANY EQUAL VALUE (GR14). Only a
 * Fraction question holds its answer to lowest terms (ordinaryResponseGrading
 * matchesAuthoredFractionAnswer). A multi-answer field compares values, so a
 * field keyed 3/4 on "Write 6/8 in lowest terms" took 6/8, 12/16 and 0.75 as
 * well (LIVE-17). Listed when the question or the field asks for lowest terms
 * or simplest form, the key is a fraction in lowest terms, and the field's own
 * grader takes that fraction unreduced.
 */
import { isChoiceAnswerField, matchesFieldAnswer } from '../../../functions/shared/answerUtils.mjs';
import { isWrittenInLowestTerms, parseWrittenNumber } from '../../../functions/shared/fractionAnswer.mjs';

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '');

// The index of the bracket that closes (or opens) the one at `index`, or -1.
const matchingBracket = (value, index, open, close, step) => {
  let depth = 0;
  for (let cursor = index; cursor >= 0 && cursor < value.length; cursor += step) {
    if (value[cursor] === (step > 0 ? open : close)) depth += 1;
    else if (value[cursor] === (step > 0 ? close : open)) {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
};

const TOKEN_BEFORE = /(?:\\[A-Za-z]+|[A-Za-z0-9.])+$/;
const TOKEN_AFTER = /^(?:\\[A-Za-z]+|[A-Za-z0-9.])+/;

// One bracket or braced group starting at `start` (with nothing before it), as
// written, or ''.
const groupAt = (value, start) => {
  const open = value[start];
  if (open !== '(' && open !== '{') return '';
  const close = matchingBracket(value, start, open, open === '(' ? ')' : '}', 1);
  return close < 0 ? '' : value.slice(start, close + 1);
};

// One factor starting at `start`: a group, or a run of letters and digits with
// the braced group a command takes (`\sqrt{3}`), and a power on it
// (`x^(3)`, `2^x`, `e^{x}`). '' when there is none.
const factorAt = (value, start) => {
  let factor = groupAt(value, start);
  if (!factor) {
    factor = TOKEN_AFTER.exec(value.slice(start))?.[0] || '';
    if (factor && /\\[A-Za-z]+$/.test(factor)) factor += groupAt(value, start + factor.length);
  }
  if (!factor) return '';
  const caret = start + factor.length;
  if (value[caret] !== '^') return factor;
  const power = groupAt(value, caret + 1) || /^-?(?:\\[A-Za-z]+|[A-Za-z0-9.]+)/.exec(value.slice(caret + 1))?.[0] || '';
  return power ? `${factor}^${power}` : factor;
};

// What a power is raised on: a bracket, a braced group (with its command, as
// in `\sqrt{2}`), or a run of letters and digits. '' when there is none.
const baseBefore = (value, caret) => {
  let end = caret;
  while (end > 0 && value[end - 1] === ' ') end -= 1;
  const last = value[end - 1];
  if (last === ')' || last === '}') {
    const start = matchingBracket(value, end - 1, last === ')' ? '(' : '{', last, -1);
    if (start < 0) return '';
    const command = last === '}' ? (/\\[A-Za-z]+$/.exec(value.slice(0, start))?.[0] || '') : '';
    return value.slice(start - command.length, end);
  }
  return TOKEN_BEFORE.exec(value.slice(0, end))?.[0] || '';
};

// What follows the `/`: one factor (factorAt).
const divisorAfter = (value, slash) => {
  let start = slash + 1;
  while (value[start] === ' ') start += 1;
  return factorAt(value, start);
};

/**
 * The first power in `value` written in brackets (`^(x-1)`) or as a bare
 * negative (`^-3`) with a `/` straight after it: { base, power, exponent,
 * divisor } as written, or null when there is none.
 */
export const ambiguousPowerOverDivisor = (value) => {
  const source = text(value);
  for (let caret = source.indexOf('^'); caret >= 0; caret = source.indexOf('^', caret + 1)) {
    let cursor = caret + 1;
    while (source[cursor] === ' ') cursor += 1;
    let exponent = null;
    let power = null;
    let after = -1;
    if (source[cursor] === '(') {
      const close = matchingBracket(source, cursor, '(', ')', 1);
      if (close < 0) continue;
      exponent = source.slice(cursor + 1, close).trim();
      power = `^(${exponent})`;
      after = close + 1;
    } else {
      const negative = /^[-−–]\s*(?:\\[A-Za-z]+|[A-Za-z0-9.]+)/.exec(source.slice(cursor));
      if (!negative) continue;
      exponent = negative[0].replace(/\s+/g, '');
      power = `^${exponent}`;
      after = cursor + negative[0].length;
    }
    while (source[after] === ' ') after += 1;
    if (source[after] !== '/' || !exponent) continue;
    return { base: baseBefore(source, caret), power, exponent, divisor: divisorAfter(source, after) };
  }
  return null;
};

// The two readings, each written with the brackets that make it one reading.
const readingsOf = ({ base, power, exponent, divisor }) => {
  if (!base || !divisor) return null;
  const groupedExponent = /[+\-*/\s]/.test(exponent.slice(1)) ? `(${exponent})` : exponent;
  return [`(${base}${power})/${divisor}`, `${base}^(${groupedExponent}/${divisor})`];
};

/** The typed answer keys of one field: its answer and the other forms it accepts. */
const keyTextsOf = (record = {}) => [record.answer, record.expected, ...asArray(record.acceptedAnswers), ...asArray(record.accepted)]
  .filter((value) => typeof value === 'string' && value.trim() !== '');

const isTypedField = (field) => isObject(field) && !isChoiceAnswerField(field) && !(Array.isArray(field.options) && field.options.length);

// Every typed key of a question, with the name of the box it belongs to.
const typedKeysOf = (question = {}) => [
  ...asArray(question.answerFields).filter(isTypedField).flatMap((field) => keyTextsOf(field).map((key) => ({ key, label: text(field.label).trim() }))),
  ...(text(question.type) === 'literal' ? asArray(question.acceptedAnswers).filter((key) => typeof key === 'string').map((key) => ({ key, label: '' })) : []),
  ...Object.entries(isObject(question.table?.answers) ? question.table.answers : {})
    .filter(([, key]) => typeof key === 'string')
    .map(([cell, key]) => ({ key, label: `table cell ${cell}` })),
];

const ambiguousKeyWarning = (questionNumber, { key, label }) => {
  const found = ambiguousPowerOverDivisor(key);
  if (!found) return null;
  const where = `Question ${questionNumber}${label ? ` (${label})` : ''}`;
  const readings = readingsOf(found);
  return readings
    ? `${where}: the answer "${key}" can be read two ways: ${readings[0]} or ${readings[1]}. Write it with the brackets you mean, so students are graded against that one.`
    : `${where}: the answer "${key}" has a power in brackets right before a "/", which can be read two ways. Add brackets to show what is divided, so students are graded against the one you mean.`;
};

// Asking for the form, in words, or "simplify"/"reduce" right before a
// fraction ("Simplify 10/15"). A bare "Simplify" about something else (the
// radicals of a question whose box is an exponent) is not this question.
const ASKS_LOWEST_TERMS = /\blowest terms\b|\bsimplest (?:form|terms)\b|\bfully reduced\b|\breduced (?:form|fraction)\b|\b(?:simplify|reduce) (?:the|this|each|your) fractions?\b|\b(?:simplify|reduce)\s*:?\s*\$?\s*(?:-?\d+\s*\/\s*\d+|\\[dt]?frac\{)/i;
const terminatingDecimal = (numerator, denominator) => {
  let rest = Math.abs(denominator);
  for (const factor of [2, 5]) while (rest % factor === 0) rest /= factor;
  return rest === 1 ? String(numerator / denominator) : null;
};

/**
 * A typed field that is asked for lowest terms and takes any equal value:
 * { key, unreduced, decimal } (the forms it would mark right), or null.
 */
export const lowestTermsNotHeld = (question = {}, field = {}) => {
  if (!isTypedField(field)) return null;
  const key = field.answer ?? field.expected;
  const written = typeof key === 'string' ? parseWrittenNumber(key) : null;
  if (written?.form !== 'fraction' || !isWrittenInLowestTerms(key)) return null;
  if (!ASKS_LOWEST_TERMS.test(`${text(question.prompt)} ${text(field.label)}`)) return null;
  const unreduced = `${written.numerator * 2}/${written.denominator * 2}`;
  if (!matchesFieldAnswer(unreduced, field)) return null;
  const decimal = terminatingDecimal(written.numerator, written.denominator);
  return { key: key.trim(), unreduced, decimal: decimal !== null && matchesFieldAnswer(decimal, field) ? decimal : null };
};

const lowestTermsWarning = (questionNumber, question, field) => {
  const found = lowestTermsNotHeld(question, field);
  if (!found) return null;
  const label = text(field.label).trim();
  const others = found.decimal ? `${found.unreduced} or ${found.decimal}` : found.unreduced;
  return `Question ${questionNumber}${label ? ` (${label})` : ''}: the question asks for lowest terms, but this box takes any equal value, so ${others} is marked right for ${found.key}. A Fraction question (type "fraction") holds the answer to lowest terms.`;
};

export const auditAssignmentAnswerKeys = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  const add = (warning) => { if (warning && !warnings.includes(warning)) warnings.push(warning); };
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    typedKeysOf(question).forEach((entry) => add(ambiguousKeyWarning(index + 1, entry)));
    asArray(question.answerFields).forEach((field) => add(lowestTermsWarning(index + 1, question, field)));
  });
  return { warnings };
};
