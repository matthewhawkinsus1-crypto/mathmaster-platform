// Question family: fraction arithmetic: fraction.
//
// Contract (./index.js):
//   matches(question)            → true when this family can help with the question
//   hints(question)              → hint sentences, least to most specific, built from
//                                  the question's OWN numbers; never the answer
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers whose answer is
//                                  not this question's answer
//   expectedValues(question)     → this question's answer value(s) as text, so the runtime
//                                  guard (hintRevealsAnswer) can drop a hint that leaks one
//   backUpQuestion(question)     → { prompt, options: [text, text], correct } | null
//                                  the inclusion "Let's back up" check: one quick
//                                  question about THIS problem's first move (never its
//                                  answer); null keeps the platform's generic one
// `implemented` stays false until the family is real: the index skips it.
//
// WHAT THIS FAMILY OWNS (fourth in the index order; no earlier family reads
// the `fraction` type):
//
//   sum         every `fraction` question with operands n1/d1 + n2/d2 — a drill
//               after generation, or a sum the author wrote out. Its key is
//               fractionSumAnswerKey (functions/shared/fractionAnswer.mjs), the
//               grader's own.
//   arithmetic  an authored `fraction` question whose math line or prompt is one
//               operation on two numbers, at least one a fraction: 3/8 + 3/8,
//               \frac{5}{6} - \frac{1}{4}, 2/3 × 3/4, \frac{1}{2} \div \frac{1}{4},
//               or "the product of 2/3 and 3/4" — and whose authored key is
//               worth exactly that result.
//   simplify    an authored `fraction` question that says simplify / lowest terms /
//               simplest form / reduce about exactly one fraction that is not
//               already in lowest terms, and whose key is worth that fraction
//               ("Simplify 9/18.", a Question Family version).
//   form        any other `fraction` question ("Write the part shaded.",
//               "Simplify." with no numbers, a drill before generation): owned,
//               so the guard learns every spelling of its key, but helped only
//               with the answer's form — no sibling, no family back-up step.
//   multiAnswer only on an unmistakable signal: one free-response field, the
//               prompt or that field's label is one fraction operation (or
//               "simplify" one fraction) as above, and the field's key is worth
//               exactly its result. An item drawn from a platform Question
//               Family is never claimed here (none of them is fraction work).
//
// SAFETY. Every hint and back-up text is written twice: once quoting this
// problem's numbers, and once naming the move without them. The numbered
// spelling is used unless it contains one of this question's answers
// (hintRevealsAnswer, the platform's own guard): "Add 1/4 + 3/4" has the answer
// 1, so a hint quoting \frac{1}{4} becomes "the numerators". No text states a
// result, an intermediate numerator, the common denominator's value or the
// greatest common factor. The sibling is built from a seeded draw and is
// offered only when its value differs from this question's, and neither its
// prompt nor any step contains one of this question's answers.
//
// Pure: no React, no mathjs, no I/O. Exact rational arithmetic only.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import {
  FRACTION_QUESTION_SHAPES,
  fractionAnswerCandidates,
  fractionAnswerRequiresLowestTerms,
  fractionQuestionShape,
  fractionSumAnswerKey,
  parseWrittenNumber,
} from '../../../../functions/shared/fractionAnswer.mjs';
import { add, divide, equals, multiply, rational, subtract } from '../../../../functions/shared/questionFamilyExact.mjs';

export const family = 'fractions';
export const implemented = true;

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const typeOf = (question) => text(question?.type);
const familyIdOf = (question) => text(question?.familyInstance?.familyId) || text(question?.questionFamily?.id);

const MAX_MAGNITUDE = 1e6;
const gcdInt = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};
const lcmInt = (left, right) => (left / gcdInt(left, right)) * right;
const usableInteger = (value) => Number.isSafeInteger(value) && Math.abs(value) <= MAX_MAGNITUDE;

/* ---------------------------------------------------------------------------
 * Numbers as this family writes them.
 *
 * An operand keeps the form it was written in (2/6 stays 2/6, so a hint can
 * quote it); `value` is the reduced rational it is worth.
 * ------------------------------------------------------------------------- */

const operand = (n, d, whole = false) => (usableInteger(n) && usableInteger(d) && d > 0
  ? Object.freeze({ n, d, whole: whole && d === 1, value: rational(n, d) })
  : null);

const fracLatex = (n, d) => `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`;
const operandLatex = (entry) => (entry.whole ? String(entry.n) : fracLatex(entry.n, entry.d));
const valueLatex = (value) => (value.d === 1 ? String(value.n) : fracLatex(value.n, value.d));
const valueText = (value) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);

const OPERATIONS = Object.freeze({
  '+': { latex: '+', compute: add, verb: 'add', verbed: 'added', verbing: 'adding', noun: 'sum' },
  '-': { latex: '-', compute: subtract, verb: 'subtract', verbed: 'subtracted', verbing: 'subtracting', noun: 'difference' },
  '×': { latex: '\\times', compute: multiply, verb: 'multiply', verbed: 'multiplied', verbing: 'multiplying', noun: 'product' },
  '÷': { latex: '\\div', compute: divide, verb: 'divide', verbed: 'divided', verbing: 'dividing', noun: 'quotient' },
});
const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

const expressionLatex = (op, left, right) => {
  const rightLatex = right.n < 0 ? `(${operandLatex(right)})` : operandLatex(right);
  return `${operandLatex(left)} ${OPERATIONS[op].latex} ${rightLatex}`;
};

const compute = (op, left, right) => {
  try {
    return OPERATIONS[op].compute(left.value, right.value);
  } catch {
    return null; // a division by zero is not a question this family reads
  }
};

/* ---------------------------------------------------------------------------
 * Reading the math in a prompt, a math line or a field label.
 *
 * Tokens, then "runs": an operand, or operand op operand. A run touching a
 * letter, a bracket, an exponent or another slash (3/8x, x/2 + 1/3, (1/2 + 1/3),
 * 1/2/3) or an operator left dangling makes the whole text unreadable, so a
 * variable expression is never mistaken for fraction arithmetic.
 * ------------------------------------------------------------------------- */

const INVISIBLE = /[​-‏‪-‮⁠-⁯﻿]/g;

const prepareMath = (raw) => String(raw ?? '')
  .replace(INVISIBLE, '')
  .replace(/[−–—]/g, '-')
  .replace(/\\[dt]frac(?![A-Za-z])/g, '\\frac')
  .replace(/\\(?:left|right)(?=\s*[()[\].|])/g, '')
  .replace(/\\(?:times|cdot)(?![A-Za-z])|[×·*]/g, ' × ')
  .replace(/\\div(?![A-Za-z])|÷/g, ' ÷ ')
  .replace(/\\[,;:! ]/g, ' ')
  .replace(/\$/g, ' ');

const fracToken = (numeratorSign, numerator, denominatorSign, denominator) => {
  const n = Number(numerator) * (numeratorSign ? -1 : 1) * (denominatorSign ? -1 : 1);
  const d = Number(denominator);
  return d ? { kind: 'number', n, d, whole: false } : { kind: 'other' };
};

const TOKEN_RULES = [
  [/^\\frac\s*\{\s*(-?)\s*(\d+)\s*\}\s*\{\s*(-?)\s*(\d+)\s*\}/, (m) => fracToken(m[1], m[2], m[3], m[4])],
  [/^\\frac\s*(\d)(\d)(?!\d)/, (m) => fracToken('', m[1], '', m[2])],
  [/^\(\s*-\s*(\d+)\s*\)\s*\/\s*(\d+)(?!\d|\.\d)/, (m) => fracToken('-', m[1], '', m[2])],
  [/^(\d+\.\d+|\.\d+)/, () => ({ kind: 'other' })], // a decimal: not this family's arithmetic
  [/^(\d+)\s*\/\s*(\d+)(?!\d|\.\d)/, (m) => fracToken('', m[1], '', m[2])],
  [/^\d+/, (m) => ({ kind: 'number', n: Number(m[0]), d: 1, whole: true })],
  [/^[+\-×÷]/, (m) => ({ kind: 'op', op: m[0] })],
  [/^=/, () => ({ kind: 'eq' })],
  [/^\\[A-Za-z]+/, (m) => ({ kind: 'word', word: m[0] })],
  [/^[A-Za-z]+/, (m) => ({ kind: 'word', word: m[0] })],
  [/^[.,:;?!]/, (m) => ({ kind: 'stop', char: m[0] })],
  [/^_+|^\\_/, () => ({ kind: 'stop', char: '_' })],
  [/^./s, (m) => ({ kind: 'other', char: m[0] })],
];

const tokenizeMath = (raw) => {
  const source = prepareMath(raw);
  const tokens = [];
  let index = 0;
  let spaced = true;
  while (index < source.length) {
    const rest = source.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) {
      spaced = true;
      index += space[0].length;
      continue;
    }
    for (const [pattern, build] of TOKEN_RULES) {
      const match = pattern.exec(rest);
      if (!match) continue;
      tokens.push({ ...build(match), spaced });
      index += match[0].length;
      break;
    }
    spaced = false;
  }
  return tokens;
};

const usableToken = (token) => token?.kind === 'number' && usableInteger(token.n) && usableInteger(token.d);

// Neighbours a run may touch without a space: a colon before it, and an
// equals sign or sentence punctuation after it.
const touchesBefore = (token) => token && !(token.kind === 'stop' && token.char === ':');
const touchesAfter = (token) => token && !(token.kind === 'eq' || token.kind === 'stop');

const readRuns = (raw) => {
  const tokens = tokenizeMath(raw);
  const runs = [];
  let index = 0;
  const operandAt = (start) => {
    let at = start;
    let sign = 1;
    if (tokens[at]?.kind === 'op' && tokens[at].op === '-' && tokens[at + 1] && !tokens[at + 1].spaced) {
      sign = -1;
      at += 1;
    }
    const token = tokens[at];
    if (!usableToken(token)) return null;
    return { entry: operand(sign * token.n, token.d, token.whole), next: at + 1 };
  };
  while (index < tokens.length) {
    const first = operandAt(index);
    if (!first) {
      // An operator beside a number but outside any run ("(1/2 + 1/3) × 2")
      // works on something this reader does not see. A hyphen in prose
      // ("two-step") touches no number and is ignored.
      if (tokens[index].kind === 'op' && [tokens[index - 1], tokens[index + 1]].some((token) => token?.kind === 'number')) return null;
      index += 1;
      continue;
    }
    if (!tokens[index].spaced && touchesBefore(tokens[index - 1])) return null;
    const operands = [first.entry];
    const ops = [];
    let next = first.next;
    while (tokens[next]?.kind === 'op') {
      const following = operandAt(next + 1);
      if (!following) return null;
      ops.push(tokens[next].op);
      operands.push(following.entry);
      next = following.next;
    }
    if (tokens[next] && !tokens[next].spaced && touchesAfter(tokens[next])) return null;
    // "= 5/6" after a sum: a statement, not a question to answer. A blank,
    // a box or a question mark after the equals sign is the question.
    if (tokens[next]?.kind === 'eq') {
      const end = tokens.findIndex((token, at) => at > next && token.kind === 'stop');
      const after = tokens.slice(next + 1, end === -1 ? tokens.length : end);
      if (after.some((token) => token.kind === 'number' || token.kind === 'other' || token.kind === 'op')) return null;
    }
    if (operands.some((entry) => !entry)) return null;
    runs.push({ operands, ops });
    index = next;
  }
  return runs;
};

const SIMPLIFY_WORDS = /\b(?:simplify|simplified|simplest\s+form|lowest\s+terms|reduce|reduced)\b/i;
const KEYWORD_OPERATIONS = Object.freeze([
  ['+', /\b(?:add|sum|plus)\b/i],
  ['-', /\b(?:subtract|difference|minus)\b/i],
  ['×', /\b(?:multiply|product|times)\b/i],
  ['÷', /\b(?:divide|quotient)\b/i],
]);

/*
 * The fraction work one text asks for, before its key is checked:
 *   [{ kind: 'arithmetic', op, left, right }] or [{ kind: 'simplify', fraction }]
 * — one reading, or two when a worded subtraction/division could run either
 * way ("subtract 1/4 from 5/6"); the key decides.
 */
const readingsOf = (raw) => {
  const source = text(raw);
  if (!source) return [];
  const runs = readRuns(source);
  if (!runs) return [];
  const binary = runs.filter((run) => run.ops.length);
  if (binary.length > 1 || binary.some((run) => run.ops.length > 1)) return [];
  const isFraction = (entry) => !entry.whole;
  if (binary.length === 1) {
    const [left, right] = binary[0].operands;
    if (!isFraction(left) && !isFraction(right)) return [];
    return [{ kind: 'arithmetic', op: binary[0].ops[0], left, right }];
  }
  const fractions = runs.map((run) => run.operands[0]).filter(isFraction);
  const words = source.replace(/\$[^$]*\$/g, ' ');
  if (fractions.length === 1 && SIMPLIFY_WORDS.test(words)) {
    // A fraction already in lowest terms has no common factor to find: every
    // simplify hint would start from a false premise, so it is helped as a form.
    const [fraction] = fractions;
    return gcdInt(fraction.n, fraction.d) === 1 ? [] : [{ kind: 'simplify', fraction }];
  }
  const operands = runs.map((run) => run.operands[0]);
  if (operands.length !== 2 || !operands.some(isFraction)) return [];
  const named = KEYWORD_OPERATIONS.filter(([, pattern]) => pattern.test(words));
  if (named.length !== 1) return [];
  const [op] = named[0];
  const [left, right] = operands;
  const readings = [{ kind: 'arithmetic', op, left, right }];
  if ((op === '-' || op === '÷') && /\b(?:from|into)\b/i.test(words)) readings.unshift({ kind: 'arithmetic', op, left: right, right: left });
  return readings;
};

const readingValue = (reading) => (reading.kind === 'simplify' ? reading.fraction.value : compute(reading.op, reading.left, reading.right));

/** The first reading of the first text whose result is worth exactly `key`. */
const readingMatching = (sources, key) => {
  for (const source of sources) {
    for (const reading of readingsOf(source)) {
      const value = readingValue(reading);
      if (value && equals(value, key)) return { ...reading, value };
    }
  }
  return null;
};

const keyValue = (raw) => {
  const parsed = parseWrittenNumber(typeof raw === 'number' ? String(raw) : raw);
  if (!parsed) return null;
  return usableInteger(parsed.value.n) && usableInteger(parsed.value.d) ? rational(parsed.value.n, parsed.value.d) : null;
};

/* ---------------------------------------------------------------------------
 * The model of one question.
 * ------------------------------------------------------------------------- */

const multiAnswerField = (question) => {
  const fields = list(question.answerFields);
  if (fields.length !== 1 || !isObject(fields[0])) return null;
  const field = fields[0];
  if (list(field.options).length || list(field.choices).length || /choice|select|dropdown/i.test(text(field.type))) return null;
  return field;
};

const multiAnswerModel = (question) => {
  const id = familyIdOf(question);
  // A platform Question Family instance belongs to that family's own helper;
  // an assignment-local family (local:…) is read by its content like any item.
  if (id && !id.startsWith('local:')) return null;
  const field = multiAnswerField(question);
  if (!field) return null;
  const candidates = answerCandidatesForField(field).filter((value) => typeof value === 'string' || typeof value === 'number');
  const key = keyValue(candidates[0]);
  if (!key) return null;
  const reading = readingMatching([field.label, question.prompt, `${text(question.prompt)} ${text(field.label)}`], key);
  if (!reading) return null;
  return { ...reading, source: 'multiAnswer', lowestTerms: false, keys: candidates.map(text) };
};

const fractionTypeModel = (question) => {
  const shape = fractionQuestionShape(question);
  const keys = fractionAnswerCandidates(question);
  if (shape === FRACTION_QUESTION_SHAPES.OPERANDS) {
    const left = operand(question.n1, question.d1);
    const right = operand(question.n2, question.d2);
    const key = fractionSumAnswerKey(question);
    const keyFraction = usableInteger(key.ansNum) && usableInteger(key.ansDen) && key.ansDen !== 0
      ? rational(key.ansNum, key.ansDen)
      : null;
    const keyForms = keyFraction ? [`${key.ansNum}/${key.ansDen}`, `\\frac{${key.ansNum}}{${key.ansDen}}`] : [];
    const sum = left && right ? compute('+', left, right) : null;
    // A math line the author wrote that is not this sum: the screen shows
    // their line, so a hint about the sum would describe another question.
    const line = text(question.expressionLatex);
    const lineReadings = line ? readingsOf(line) : [];
    const lineAgrees = !line || lineReadings.some((reading) => reading.kind === 'arithmetic' && reading.op === '+'
      && equals(reading.left.value, left?.value ?? rational(0)) && equals(reading.right.value, right?.value ?? rational(0)));
    if (!sum || !keyFraction || !lineAgrees) {
      return { kind: 'form', source: 'operands', value: keyFraction, values: [keyFraction, sum].filter(Boolean), lowestTerms: false, keys: [...keys, ...keyForms] };
    }
    return {
      kind: 'arithmetic', op: '+', left, right, value: keyFraction, values: [keyFraction, sum],
      source: 'operands', lowestTerms: false, keys: [...keys, ...keyForms],
    };
  }
  const values = keys.map(keyValue).filter(Boolean);
  const lowestTerms = shape === FRACTION_QUESTION_SHAPES.AUTHORED_ANSWER && fractionAnswerRequiresLowestTerms(question);
  if (!values.length) return { kind: 'form', source: 'authored', value: null, values: [], lowestTerms, keys };
  // The math line alone, the prompt alone, then the two together ("Simplify."
  // above the line \frac{6}{8} =: the word in one, the fraction in the other).
  const reading = readingMatching([question.expressionLatex, question.prompt, `${text(question.prompt)} ${text(question.expressionLatex)}`], values[0]);
  if (!reading) return { kind: 'form', source: 'authored', value: values[0], values, lowestTerms, keys };
  return { ...reading, value: values[0], values, source: 'authored', lowestTerms, keys };
};

/** What this family reads in a question, or null when it is not one of its questions. */
export const fractionModel = (question) => {
  if (!isObject(question)) return null;
  try {
    const type = typeOf(question);
    if (type === 'fraction') return fractionTypeModel(question);
    if (type === 'multiAnswer') return multiAnswerModel(question);
  } catch { /* a question this family cannot read is not its question */ }
  return null;
};

export const matches = (question) => Boolean(fractionModel(question));

/* ---------------------------------------------------------------------------
 * expectedValues: every spelling an answer could leak in.
 * ------------------------------------------------------------------------- */

const withUnicodeMinus = (values) => [...values, ...values.filter((value) => value.includes('-')).map((value) => value.replace(/-/g, '−'))];

const terminatingDecimal = (value) => {
  let d = value.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d !== 1) return null;
  const decimal = String(value.n / value.d);
  return /e/i.test(decimal) ? null : decimal;
};

/** One value written each way a student, an author or a hint might write it. */
export const valueForms = (raw) => {
  const value = rational(raw.n, raw.d);
  const { n, d } = value;
  if (d === 1) return withUnicodeMinus(unique([String(n), `${n}/1`, `\\frac{${n}}{1}`, n < 0 ? String(-n) : '']));
  const sign = n < 0 ? '-' : '';
  const magnitude = Math.abs(n);
  const forms = [
    `${n}/${d}`,
    fracLatex(n, d),
    `\\frac{${n}}{${d}}`,
    `${sign}\\dfrac{${magnitude}}{${d}}`,
    `${sign}\\tfrac{${magnitude}}{${d}}`,
    n < 0 ? `(${n})/${d}` : '',
    magnitude < 10 && d < 10 ? `${sign}\\frac${magnitude}${d}` : '',
  ];
  const exact = terminatingDecimal(value);
  if (exact) forms.push(exact, exact.replace(/^(-?)0\./, '$1.'));
  else {
    [4, 3, 2].forEach((places) => {
      const rounded = Number((n / d).toFixed(places));
      if (!Number.isInteger(rounded)) forms.push(String(rounded));
    });
  }
  if (magnitude > d) {
    const whole = Math.floor(magnitude / d);
    const rest = magnitude % d;
    forms.push(`${sign}${whole} ${rest}/${d}`, `${sign}${whole}\\frac{${rest}}{${d}}`, `${sign}${whole} \\frac{${rest}}{${d}}`);
  }
  // A negative answer's size alone leaves only its sign to find.
  if (n < 0) forms.push(`${magnitude}/${d}`, fracLatex(magnitude, d));
  return withUnicodeMinus(unique(forms));
};

// The unreduced results a correct method passes through: over the product
// of the denominators, over the least common denominator, the raw product.
const workedForms = (model) => {
  if (model.kind !== 'arithmetic') return [];
  const { op, left, right } = model;
  const forms = [];
  const written = (n, d) => (d > 0 && usableInteger(n) && usableInteger(d) ? [`${n}/${d}`, fracLatex(n, d), `\\frac{${n}}{${d}}`] : []);
  if (op === '+' || op === '-') {
    const sign = op === '+' ? 1 : -1;
    forms.push(...written(left.n * right.d + sign * right.n * left.d, left.d * right.d));
    const common = lcmInt(left.d, right.d);
    forms.push(...written(left.n * (common / left.d) + sign * right.n * (common / right.d), common));
  } else if (op === '×') {
    forms.push(...written(left.n * right.n, left.d * right.d));
  } else if (op === '÷' && right.n !== 0) {
    const sign = right.n < 0 ? -1 : 1;
    forms.push(...written(sign * left.n * right.d, Math.abs(left.d * right.n)));
  }
  return forms;
};

export const expectedValues = (question) => {
  const model = fractionModel(question);
  if (!model) return [];
  const forms = [...list(model.keys)];
  list(model.keys).forEach((key) => {
    const parsed = parseWrittenNumber(key);
    if (parsed?.form === 'fraction') forms.push(`${parsed.numerator}/${parsed.denominator}`, `\\frac{${parsed.numerator}}{${parsed.denominator}}`);
  });
  [model.value, ...list(model.values)].filter(Boolean).forEach((value) => forms.push(...valueForms(value)));
  forms.push(...workedForms(model));
  return unique(forms);
};

/* ---------------------------------------------------------------------------
 * Hints: two spellings each, numbered unless the numbers leak.
 * ------------------------------------------------------------------------- */

const spell = (numbered, plain, answers) => (numbered && !hintRevealsAnswer(numbered, answers) ? numbered : plain);
const math = (latex) => `$${latex}$`;

const finishHint = (model) => (model.lowestTerms
  ? 'Your answer must be in lowest terms: when you have one fraction, divide its numerator and denominator by any factor greater than one that they share.'
  : 'When you have one fraction, check whether its numerator and denominator share a factor greater than one, and simplify if they do.');

const wholeNoteFor = (model) => {
  const whole = [model.left, model.right].find((entry) => entry.whole);
  return whole ? ` A whole number such as ${math(String(whole.n))} is the fraction ${math(`\\frac{${whole.n}}{1}`)}.` : '';
};

const sumHints = (model, answers) => {
  const { op, left, right } = model;
  const { verb, verbed, verbing } = OPERATIONS[op];
  const expression = math(expressionLatex(op, left, right));
  const signs = left.n < 0 || right.n < 0 ? ' Keep each sign with its numerator.' : '';
  const wholeNote = wholeNoteFor(model);
  if (left.d === right.d) {
    return [
      spell(`In ${expression} both fractions already have the denominator ${math(String(left.d))}, so the pieces are the same size.`,
        'Both fractions already have the same denominator, so the pieces are the same size.', answers),
      spell(`${capitalize(verb)} the numerators ${math(String(left.n))} and ${math(String(right.n))}, and keep the denominator ${math(String(left.d))}: it names the size of the pieces, and ${verbing} does not change that.${signs}`,
        `${capitalize(verb)} the numerators and keep the denominator: it names the size of the pieces, and ${verbing} does not change that.${signs}`, answers),
      finishHint(model),
    ];
  }
  return [
    spell(`Start from ${expression}: the denominators ${math(String(left.d))} and ${math(String(right.d))} are different, so the pieces are different sizes and cannot be ${verbed} yet.${wholeNote}`,
      'The denominators are different, so the pieces are different sizes and cannot be combined yet.', answers),
    spell(`Find a common denominator: a number that both ${math(String(left.d))} and ${math(String(right.d))} divide into evenly. Their least common multiple keeps the numbers smallest.`,
      'Find a common denominator: a number that both denominators divide into evenly. Their least common multiple keeps the numbers smallest.', answers),
    spell(`Rewrite each fraction over that common denominator: ask what ${math(String(left.d))} must be multiplied by to reach it, and multiply the numerator ${math(String(left.n))} by the same number; then do the same for ${math(operandLatex(right))}. ${capitalize(verb)} the numerators and keep the common denominator.${signs}`,
      `Rewrite each fraction over the common denominator by multiplying its numerator and denominator by the same number, then ${verb} the numerators and keep the common denominator.${signs}`, answers),
    finishHint(model),
  ];
};

const productHints = (model, answers) => {
  const { left, right } = model;
  const expression = math(expressionLatex('×', left, right));
  return [
    spell(`To multiply ${expression} you do not need a common denominator: fractions are multiplied straight across.${wholeNoteFor(model)}`,
      'To multiply fractions you do not need a common denominator: they are multiplied straight across.', answers),
    spell(`Multiply the numerators ${math(String(left.n))} and ${math(String(right.n))} to get the new numerator, and the denominators ${math(String(left.d))} and ${math(String(right.d))} to get the new denominator.`,
      'Multiply the two numerators to get the new numerator, and the two denominators to get the new denominator.', answers),
    'You may cancel first: a factor shared by one numerator and either denominator can be divided out before you multiply, which keeps the numbers small.',
    finishHint(model),
  ];
};

const quotientHints = (model, answers) => {
  const { left, right } = model;
  const divisor = math(operandLatex(right));
  return [
    spell(`Dividing by ${divisor} is the same as multiplying by its reciprocal: the same fraction turned upside down.${wholeNoteFor(model)}`,
      'Dividing by a fraction is the same as multiplying by its reciprocal: the same fraction turned upside down.', answers),
    spell(`Keep ${math(operandLatex(left))}, change the division to multiplication, and turn ${divisor} upside down; then multiply the numerators together and the denominators together.`,
      'Keep the first fraction, change the division to multiplication, and turn the second fraction upside down; then multiply the numerators together and the denominators together.', answers),
    finishHint(model),
  ];
};

const simplifyHints = (model, answers) => {
  const { fraction } = model;
  const numerator = math(String(Math.abs(fraction.n)));
  const denominator = math(String(fraction.d));
  return [
    spell(`Look for a number greater than one that divides both ${numerator} and ${denominator} evenly: a common factor of the numerator and the denominator.`,
      'Look for a number greater than one that divides both the numerator and the denominator evenly.', answers),
    spell(`Divide the numerator and the denominator of ${math(operandLatex(fraction))} by that same common factor: dividing both by the same number keeps the value the same.`,
      'Divide the numerator and the denominator by that same common factor: dividing both by the same number keeps the value the same.', answers),
    model.lowestTerms
      ? 'Keep going until the numerator and denominator share no factor greater than one (your answer must be in lowest terms), or divide by their greatest common factor to finish in one step.'
      : 'Keep going until the numerator and denominator share no factor greater than one, or divide by their greatest common factor to finish in one step.',
  ];
};

const formHints = (model) => [
  'A fraction answer is one number: the numerator on top counts the parts, and the denominator on the bottom says how many equal parts make one whole.',
  model.lowestTerms
    ? 'Your answer must be in lowest terms: if the numerator and denominator share a factor greater than one, divide both by it.'
    : 'Before you submit, check whether the numerator and denominator share a factor greater than one, and simplify if they do.',
];

export const hints = (question) => {
  const model = fractionModel(question);
  if (!model) return [];
  const answers = expectedValues(question);
  if (model.kind === 'simplify') return simplifyHints(model, answers);
  if (model.kind === 'arithmetic') {
    if (model.op === '×') return productHints(model, answers);
    if (model.op === '÷') return quotientHints(model, answers);
    return sumHints(model, answers);
  }
  return formHints(model);
};

/* ---------------------------------------------------------------------------
 * backUpQuestion: the first move of THIS problem, as a two-way choice.
 * ------------------------------------------------------------------------- */

const ordered = (model, right, wrong) => {
  const numbers = model.kind === 'simplify' ? [model.fraction.n, model.fraction.d] : [model.left.n, model.left.d, model.right.n, model.right.d];
  const flip = numbers.reduce((total, value) => total + Math.abs(value), 0) % 2 === 1;
  return flip ? [wrong, right] : [right, wrong];
};

const backUpFor = (model, answers) => {
  if (model.kind === 'simplify') {
    const right = 'Divide the top and bottom by the same number';
    return {
      prompt: spell(`Let’s back up. Which move keeps the value of ${math(operandLatex(model.fraction))} the same?`,
        'Let’s back up. Which move keeps the value of a fraction the same?', answers),
      options: ordered(model, right, 'Subtract the same number from the top and bottom'),
      correct: right,
    };
  }
  const { op, left, right: second } = model;
  const expression = math(expressionLatex(op, left, second));
  if (op === '×') {
    const right = 'No: multiply straight across';
    return {
      prompt: spell(`Let’s back up. To multiply ${expression}, do you need a common denominator first?`,
        'Let’s back up. To multiply two fractions, do you need a common denominator first?', answers),
      options: ordered(model, right, 'Yes: rewrite them over a common denominator'),
      correct: right,
    };
  }
  if (op === '÷') {
    const right = 'Turn the second fraction upside down and multiply';
    return {
      prompt: spell(`Let’s back up. What is the first move for ${expression}?`,
        'Let’s back up. What is the first move when you divide by a fraction?', answers),
      options: ordered(model, right, 'Turn the first fraction upside down and multiply'),
      correct: right,
    };
  }
  const { verb } = OPERATIONS[op];
  if (left.d === second.d) {
    const right = 'Keep the denominator the same';
    return {
      prompt: spell(`Let’s back up. In ${expression} both denominators are ${math(String(left.d))}. When you ${verb} the numerators, what happens to the denominator?`,
        `Let’s back up. Both denominators are the same. When you ${verb} the numerators, what happens to the denominator?`, answers),
      options: ordered(model, right, `${capitalize(verb)} the denominators too`),
      correct: right,
    };
  }
  const right = 'Rewrite both over a common denominator';
  return {
    prompt: spell(`Let’s back up. The denominators in ${expression} are different. What comes first?`,
      'Let’s back up. The denominators are different. What comes first?', answers),
    options: ordered(model, right, `${capitalize(verb)} the tops and ${verb} the bottoms`),
    correct: right,
  };
};

export const backUpQuestion = (question) => {
  const model = fractionModel(question);
  if (!model || model.kind === 'form') return null;
  return backUpFor(model, expectedValues(question));
};

/* ---------------------------------------------------------------------------
 * similarProblem: the same kind of work on different numbers, worked in full.
 * ------------------------------------------------------------------------- */

const hashText = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seedText) => {
  let state = hashText(seedText);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const randomInt = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const choose = (random, values) => values[Math.floor(random() * values.length)];

const DEFAULT_DENOMINATORS = Object.freeze([2, 3, 4, 5, 6, 8, 10, 12]);

const denominatorPool = (question) => {
  const authored = list(question?.generator?.denominators).filter((value) => Number.isInteger(value) && value >= 2 && value <= 20);
  return authored.length >= 2 ? authored : DEFAULT_DENOMINATORS;
};

/** "Simplify: … = \frac{p}{q}." or "… is already in lowest terms." — the last step of every sibling. */
const simplifyStep = (n, d) => {
  const divisor = gcdInt(n, d);
  const result = rational(n, d);
  if (divisor === 1) return `${math(fracLatex(n, d))} is already in lowest terms: its numerator and denominator share no factor greater than one.`;
  return `Simplify: divide the numerator and denominator by ${math(String(divisor))}: ${math(`${fracLatex(n, d)} = \\frac{${n} \\div ${divisor}}{${d} \\div ${divisor}} = ${valueLatex(result)}`)}.`;
};

const rewriteStep = (entry, common) => {
  const factor = common / entry.d;
  if (factor === 1) return `${math(fracLatex(entry.n, entry.d))} already has the denominator ${math(String(common))}`;
  return `${math(`${fracLatex(entry.n, entry.d)} = \\frac{${entry.n} \\times ${factor}}{${entry.d} \\times ${factor}} = ${fracLatex(entry.n * factor, common)}`)}`;
};

const workSum = (op, left, right) => {
  const { verb } = OPERATIONS[op];
  const sign = op === '+' ? 1 : -1;
  const prompt = `${capitalize(verb)}: ${math(expressionLatex(op, left, right))}.`;
  const opLatex = OPERATIONS[op].latex;
  if (left.d === right.d) {
    const total = left.n + sign * right.n;
    return {
      prompt,
      steps: [
        `Both fractions have the denominator ${math(String(left.d))}, so the pieces are the same size: ${verb} the numerators and keep the denominator.`,
        `${math(`${expressionLatex(op, left, right)} = \\frac{${left.n} ${opLatex} ${right.n}}{${left.d}} = ${fracLatex(total, left.d)}`)}.`,
        simplifyStep(total, left.d),
      ],
    };
  }
  const common = lcmInt(left.d, right.d);
  const a = left.n * (common / left.d);
  const b = right.n * (common / right.d);
  const total = a + sign * b;
  return {
    prompt,
    steps: [
      `The denominators ${math(String(left.d))} and ${math(String(right.d))} are different, so rewrite both fractions over a common denominator. The least common multiple of ${math(String(left.d))} and ${math(String(right.d))} is ${math(String(common))}.`,
      `${rewriteStep(left, common)}, and ${rewriteStep(right, common)}.`,
      `${capitalize(verb)} the numerators and keep the denominator: ${math(`${fracLatex(a, common)} ${opLatex} ${fracLatex(b, common)} = \\frac{${a} ${opLatex} ${b}}{${common}} = ${fracLatex(total, common)}`)}.`,
      simplifyStep(total, common),
    ],
  };
};

const workProduct = (left, right) => {
  const n = left.n * right.n;
  const d = left.d * right.d;
  return {
    prompt: `Multiply: ${math(expressionLatex('×', left, right))}.`,
    steps: [
      'To multiply fractions, multiply the numerators together and the denominators together; no common denominator is needed.',
      `${math(`${expressionLatex('×', left, right)} = \\frac{${left.n} \\times ${right.n}}{${left.d} \\times ${right.d}} = ${fracLatex(n, d)}`)}.`,
      simplifyStep(n, d),
    ],
  };
};

const workQuotient = (left, right) => {
  const n = left.n * right.d;
  const d = left.d * right.n;
  return {
    prompt: `Divide: ${math(expressionLatex('÷', left, right))}.`,
    steps: [
      `Dividing by ${math(fracLatex(right.n, right.d))} is the same as multiplying by its reciprocal, ${math(fracLatex(right.d, right.n))}.`,
      `${math(`${expressionLatex('÷', left, right)} = ${fracLatex(left.n, left.d)} \\times ${fracLatex(right.d, right.n)} = \\frac{${left.n} \\times ${right.d}}{${left.d} \\times ${right.n}} = ${fracLatex(n, d)}`)}.`,
      simplifyStep(n, d),
    ],
  };
};

const workSimplify = (fraction) => {
  const divisor = gcdInt(fraction.n, fraction.d);
  const result = fraction.value;
  return {
    prompt: `Simplify ${math(fracLatex(fraction.n, fraction.d))}.`,
    steps: [
      `Find the greatest common factor of the numerator ${math(String(fraction.n))} and the denominator ${math(String(fraction.d))}: it is ${math(String(divisor))}.`,
      `Divide the numerator and the denominator by ${math(String(divisor))}: ${math(`${fracLatex(fraction.n, fraction.d)} = \\frac{${fraction.n} \\div ${divisor}}{${fraction.d} \\div ${divisor}} = ${valueLatex(result)}`)}.`,
      result.d === 1
        ? `The denominator divided out completely, so the fraction is the whole number ${math(valueLatex(result))}.`
        : `Check: ${math(String(result.n))} and ${math(String(result.d))} share no factor greater than one, so ${math(valueLatex(result))} is in lowest terms.`,
    ],
  };
};

// One candidate sibling of the same kind: positive proper fractions, so the
// worked arithmetic stays in the range the original lives in.
const drawSibling = (model, random, pool) => {
  if (model.kind === 'simplify') {
    const d = randomInt(random, 2, 9);
    const n = randomInt(random, 1, d - 1);
    if (gcdInt(n, d) !== 1) return null;
    const k = randomInt(random, 2, 6);
    const fraction = operand(n * k, d * k);
    return { operands: [fraction], value: fraction.value, ...workSimplify(fraction) };
  }
  const { op } = model;
  const sameDenominators = (op === '+' || op === '-') && model.left.d === model.right.d;
  const d1 = choose(random, pool);
  const d2 = sameDenominators ? d1 : choose(random, pool.filter((value) => value !== d1));
  if (!d2) return null;
  let left = operand(randomInt(random, 1, d1 - 1), d1);
  let right = operand(randomInt(random, 1, d2 - 1), d2);
  if (op === '-') {
    const difference = subtract(left.value, right.value);
    if (difference.n === 0) return null;
    if (difference.n < 0) [left, right] = [right, left];
  }
  const value = compute(op, left, right);
  if (!value) return null;
  const worked = op === '×' ? workProduct(left, right) : op === '÷' ? workQuotient(left, right) : workSum(op, left, right);
  return { operands: [left, right], value, ...worked };
};

const sameOperands = (model, sibling) => {
  const original = model.kind === 'simplify' ? [model.fraction] : [model.left, model.right];
  return original.length === sibling.operands.length
    && original.every((entry, index) => entry.n === sibling.operands[index].n && entry.d === sibling.operands[index].d);
};

const answerValueOf = (raw) => {
  const parsed = parseWrittenNumber(text(raw).replace(/\s+/g, ''));
  return parsed ? parsed.value : null;
};
// A plain number ("7", "0.58", "7/12"), as the platform's sibling check
// (similarProblem.js) reads one: those may appear in a sibling's prompt.
const isPlainNumber = (value) => /^-?\d+(?:\.\d+)?$|^-?\d+\/-?\d+$/.test(text(value).replace(/−/g, '-').replace(/\s+/g, ''));

// Every fraction a line writes out (\frac{20}{24}, -\frac{3}{4}, 10/12), as a value.
const WRITTEN_FRACTION = /(-?)\\frac\{(\d+)\}\{(\d+)\}|(-?\d+)\/(\d+)(?!\d)/g;
const writtenFractions = (line) => [...String(line).matchAll(WRITTEN_FRACTION)].flatMap((match) => {
  const n = match[2] !== undefined ? Number(match[2]) * (match[1] ? -1 : 1) : Number(match[4]);
  const d = Number(match[2] !== undefined ? match[3] : match[5]);
  return d && usableInteger(n) && usableInteger(d) ? [rational(n, d)] : [];
});
const sameSize = (left, right) => Math.abs(left.n) === Math.abs(right.n) && left.d === right.d;

/** The platform's sibling checks, run here first so a failing draw is replaced rather than withheld. */
const siblingIsSafe = (question, model, sibling, answers) => {
  if (!sibling || sameOperands(model, sibling)) return false;
  const values = [model.value, ...list(model.values)].filter(Boolean);
  if (values.some((value) => equals(value, sibling.value))) return false;
  // The guard reads spellings; an unreduced fraction worth this question's
  // answer (10/12 beside the answer 5/6, as an operand or a step) is the
  // answer all the same, as is its size alone.
  if ([sibling.prompt, ...sibling.steps].some((line) => writtenFractions(line).some((shown) => values.some((value) => sameSize(shown, value))))) return false;
  if (answers.map(answerValueOf).some((value) => value && value.n === sibling.value.n && value.d === sibling.value.d)) return false;
  if (sibling.prompt === text(question.prompt)) return false;
  if (sibling.steps.some((step) => hintRevealsAnswer(step, answers))) return false;
  if (hintRevealsAnswer(sibling.prompt, answers.filter((value) => !isPlainNumber(value)))) return false;
  return true;
};

export const similarProblem = (question, { seed = 0 } = {}) => {
  const model = fractionModel(question);
  if (!model || model.kind === 'form') return null;
  const answers = expectedValues(question);
  const numbers = model.kind === 'simplify'
    ? [model.fraction.n, model.fraction.d]
    : [model.left.n, model.left.d, model.right.n, model.right.d];
  const random = seededRandom(`${Number(seed) || 0}|${model.kind}|${model.op || ''}|${numbers.join(',')}`);
  const pool = denominatorPool(question);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const sibling = drawSibling(model, random, pool);
    if (siblingIsSafe(question, model, sibling, answers)) {
      return { prompt: sibling.prompt, steps: sibling.steps, answer: valueText(sibling.value) };
    }
  }
  return null;
};
