/*
 * OPERATIONS ON FUNCTIONS FROM THEIR VALUES (A2.2D) — Recovery for the
 * numeric Warm-Up questions of Algebra II Honors Module 1, Lesson 4 (RC01).
 *
 * Recovery V2 gives a static Warm-Up or DOL question Recovery only when a
 * certified family recognizes it (recoveryContent.mjs). Lesson 4's Warm-Up
 * had none: two of its three questions ask for numbers computed from given
 * function values, a typed-and-chosen board with two number boxes:
 *
 *   functions.pointwiseFromValues     "If f(2)=7 and g(2)=−3, evaluate two
 *                                     pointwise operations." (f+g)(2) and
 *                                     (f−g)(2): adding, and subtracting a
 *                                     negative value
 *   functions.compositionFromValues   "If g(4)=2 and f(2)=9, evaluate the
 *                                     composition f(g(4))." g(4), then f of it
 *
 * Each version keeps the original's shape: in the pointwise one, f's value
 * positive and g's negative (so the difference subtracts a negative); in the
 * composition one, three different positive whole numbers, the inside value
 * read first.
 *
 * `recognize` reads exactly that board — the prompt as the family writes it
 * for the question's numbers, two number fields with the family's labels and
 * the keys those numbers give — and nothing else.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  FAMILY_ISSUE,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const normalizedText = (text) => clean(text).replace(/[−–]/g, '-').replace(/\s+/g, ' ');
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));

/** A number box, as the lesson writes one. */
const numberField = (id, label, answer) => ({
  id,
  label,
  answer,
  inputProfile: 'number',
  answerFormat: 'number',
  inputContract: { format: 'number' },
});

/** The board's fields read back: [{ id, label, answer }] when every field is a number box; null otherwise. */
const numberFieldsOf = (question) => {
  const fields = list(question?.answerFields);
  const read = fields.map((field) => ({
    id: clean(field?.id),
    label: clean(field?.label),
    answer: Number(field?.answer),
    numeric: clean(field?.answerFormat) === 'number' && !clean(field?.type) && !Array.isArray(field?.options),
  }));
  return read.every((field) => field.numeric && Number.isFinite(field.answer)) ? read : null;
};

const sameFields = (read, written) => read.length === written.length && written.every((field, index) => (
  read[index].id === field.id && normalizedText(read[index].label) === normalizedText(field.label) && read[index].answer === field.answer
));

/* ---------------------------------------------------------------------------
 * functions.pointwiseFromValues
 * ------------------------------------------------------------------------- */

const pointwisePrompt = ({ x, p, q }) => `If f(${x})=${shown(p)} and g(${x})=${shown(q)}, evaluate two pointwise operations.`;
const pointwiseFields = ({ x, p, q }) => [
  numberField('sum', `(f+g)(${x})`, p + q),
  numberField('difference', `(f${MINUS}g)(${x})`, p - q),
];

export const pointwiseFromValuesFamily = defineQuestionFamily({
  id: 'functions.pointwiseFromValues',
  version: 1,
  title: 'Add and subtract two functions at one input, from their values',
  skill: {
    objective: 'Evaluate (f + g)(a) and (f − g)(a) from the values f(a) and g(a), including subtracting a negative value.',
    alignments: ['A2.2D'],
    strand: 'functions',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({ x: intDomain(1, 6), p: intDomain(2, 9), q: intDomain(-9, -1) }),
  derive: () => ({}),
  // The sum is never 0, so neither answer is the obvious one.
  rules: ({ p, q }) => (p + q === 0 ? [FAMILY_ISSUE.TRIVIAL_INSTANCE] : []),
  fingerprint: ({ x, p, q }) => fingerprintOf('functions.pointwiseFromValues', [x, p, q]),
  answer: ({ p, q }) => ({ kind: 'fields', value: { sum: p + q, difference: p - q }, display: `${p + q}; ${p - q}` }),
  tools: {
    multiAnswer: (values) => ({ type: 'multiAnswer', prompt: pointwisePrompt(values), answerFields: pointwiseFields(values) }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^If f\((\d+)\)=(-?\d+) and g\((\d+)\)=(-?\d+), evaluate two pointwise operations\.$/.exec(normalizedText(question?.prompt));
    if (!match || match[1] !== match[3]) return null;
    const values = { x: Number(match[1]), p: Number(match[2]), q: Number(match[4]) };
    if (values.x < 1 || values.x > 6 || values.p < 2 || values.p > 9 || values.q < -9 || values.q > -1 || values.p + values.q === 0) return null;
    const read = numberFieldsOf(question);
    if (!read || !sameFields(read, pointwiseFields(values))) return null;
    return { params: values, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * functions.compositionFromValues
 * ------------------------------------------------------------------------- */

const compositionPrompt = ({ a, b, c }) => `If g(${a})=${b} and f(${b})=${c}, evaluate the composition f(g(${a})).`;
const compositionFields = ({ a, b, c }) => [
  numberField('inside', `g(${a})`, b),
  numberField('composition', `f(g(${a}))`, c),
];

export const compositionFromValuesFamily = defineQuestionFamily({
  id: 'functions.compositionFromValues',
  version: 1,
  title: 'Evaluate a composition f(g(a)) from function values',
  skill: {
    objective: 'Evaluate a composition f(g(a)) from given values of g and f: find the inside value g(a), then f of that value.',
    alignments: ['A2.2D'],
    strand: 'functions',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({ a: intDomain(1, 9), b: intDomain(1, 9), c: intDomain(1, 9) }),
  derive: () => ({}),
  // Three different numbers, so the inside value, the input and the result never read alike.
  rules: ({ a, b, c }) => (new Set([a, b, c]).size === 3 ? [] : [FAMILY_ISSUE.TRIVIAL_INSTANCE]),
  fingerprint: ({ a, b, c }) => fingerprintOf('functions.compositionFromValues', [a, b, c]),
  answer: ({ b, c }) => ({ kind: 'fields', value: { inside: b, composition: c }, display: `${b}; ${c}` }),
  tools: {
    multiAnswer: (values) => ({ type: 'multiAnswer', prompt: compositionPrompt(values), answerFields: compositionFields(values) }),
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const match = /^If g\((\d+)\)=(\d+) and f\((\d+)\)=(\d+), evaluate the composition f\(g\((\d+)\)\)\.$/.exec(normalizedText(question?.prompt));
    if (!match || match[2] !== match[3] || match[1] !== match[5]) return null;
    const values = { a: Number(match[1]), b: Number(match[2]), c: Number(match[4]) };
    if ([values.a, values.b, values.c].some((value) => value < 1 || value > 9) || new Set(Object.values(values)).size !== 3) return null;
    const read = numberFieldsOf(question);
    if (!read || !sameFields(read, compositionFields(values))) return null;
    return { params: values, constraints: {} };
  },
  recovery: { eligible: true },
});

export const FUNCTION_VALUE_FAMILIES = Object.freeze([pointwiseFromValuesFamily, compositionFromValuesFamily]);
