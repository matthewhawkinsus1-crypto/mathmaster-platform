/*
 * WHAT THE ALGEBRA II ANSWER-BOX GENERATORS SHARE (WE-I; the family is
 * ../algebra2AnswerBoxes.js).
 *
 * An answer-box question (`multiAnswer`) asks several things in one: each
 * answer field is one part, named by its label ("Index of ⁵√32",
 * "(a⁻³)(a²b⁴)(c⁻¹) =", "Zeros, as a set"). A generator claims a question only
 * when it recognises EVERY field as a part it can work: one field it cannot
 * read and the question is not claimed. Its sibling then works each kind of
 * part the item has, with other numbers, in the item's order, one step per
 * move and the reason for each move beside it.
 *
 * NEVER THE ITEM'S ANSWER. A sibling is shown only when it passes the same
 * guard every built-in sibling passes (similarExampleIsSafe, which the family
 * runs again through buildSimilarWorkedExample): its answer is none of the
 * item's, its prompt is not the item's, and no step, reason or prompt holds
 * one of the item's answers. That guard reads a number as a token, so a
 * sibling may not even mention a number the item answers with; the
 * generators draw many siblings from a seed and keep the first that passes
 * (`firstSafe`). Mathematics is written in plain text with superscripts
 * (x⁻³, ⁵√32), as the items' own labels are, so an exponent is not a digit
 * the guard reads.
 *
 * Pure: no React, no I/O.
 */
import { hintRevealsAnswer } from '../../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../../functions/shared/answerUtils.mjs';
import { primaryStandardOf } from '../../workedExample/exampleSkill.js';

export const MINUS = '−';
export const text = (value) => String(value ?? '').trim();
export const list = (value) => (Array.isArray(value) ? value : []);
export const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/* -------------------------------------------------------------- the item */

/** The item's primary standard ("A2.7G"), or ''. */
export const standardOf = (question) => text(primaryStandardOf(question));

/** Each answer field: { id, label, answer, options, choice }. */
export const fieldsOf = (question) => list(question?.answerFields).filter(isObject).map((field) => ({
  id: text(field.id),
  label: text(field.label),
  answer: text(field.answer),
  options: list(field.options).map(text),
  choice: text(field.type) === 'choice' || text(field.inputProfile) === 'choice' || list(field.options).length > 0,
}));

/** Every answer the item could leak, as text in both minus signs. */
export const itemAnswers = (question) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined || typeof value === 'object') return;
    const spelled = text(value);
    if (!spelled) return;
    values.push(spelled, spelled.replace(/−/g, '-'), spelled.replace(/-/g, '−'));
  };
  list(question?.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
  push(question?.answer);
  return [...new Set(values)];
};

const numeric = (value) => {
  const plain = text(value).replace(/−/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(plain)) return Number(plain);
  const fraction = plain.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

/**
 * The guard every built-in sibling passes (similarProblem.js,
 * similarExampleIsSafe), read here so a generator can keep drawing until one
 * passes: the sibling's prompt is not the item's, its answer is none of the
 * item's, and no step or reason (nor the prompt) holds one of them.
 */
export const siblingIsSafe = (question, example) => {
  if (!isObject(example)) return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = list(example.steps).map((step) => (isObject(step) ? `${text(step.show)} ${text(step.why)}` : text(step))).filter(Boolean);
  if (!prompt || !answer || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  const answers = itemAnswers(question);
  if (answers.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const value = numeric(answer);
  if (value !== null && answers.some((other) => numeric(other) !== null && Math.abs(numeric(other) - value) < 1e-9)) return false;
  if (steps.some((step) => hintRevealsAnswer(step, answers))) return false;
  if (hintRevealsAnswer(prompt, answers.filter((other) => numeric(other) === null))) return false;
  // The sibling's own answer line names no answer of the item's either.
  if (hintRevealsAnswer(answer, answers)) return false;
  return true;
};

/**
 * The guard for one part: (texts) → true when none of them holds an answer of
 * the item's. A generator draws each part until it passes, so the parts of a
 * sibling do not have to be lucky together.
 */
export const partGuard = (question) => {
  const answers = itemAnswers(question);
  return (texts) => !list(texts).some((value) => hintRevealsAnswer(text(value), answers));
};

/** Draw siblings from seed, seed + 1, …; the first that passes the whole guard, or null. */
export const firstSafe = (question, draw, seed = 0, tries = 24) => {
  const ok = partGuard(question);
  for (let turn = 0; turn < tries; turn += 1) {
    let example = null;
    try {
      example = draw((Number(seed) || 0) * tries + turn, ok);
    } catch {
      example = null;
    }
    if (example && siblingIsSafe(question, example)) return example;
  }
  return null;
};

/** The first option, walking on from the seed, whose part passes `ok`; null where none does. */
export const firstFitting = (options, seed, build, ok) => {
  const all = list(options);
  // Where the walk starts: spread over the options, so neighbouring seeds start apart.
  const start = all.length ? (Math.imul(Math.floor(Math.abs(Number(seed) || 0)) + 1, 2654435761) >>> 0) % all.length : 0;
  for (let offset = 0; offset < all.length; offset += 1) {
    const option = all[(start + offset) % all.length];
    let part = null;
    try {
      part = build(option);
    } catch {
      part = null;
    }
    if (part && (!ok || ok([...list(part.steps).flatMap((step) => [step.show, step.why]), part.answer, part.ask]))) return part;
  }
  return null;
};

/** A seeded pick: the same seed always picks the same option. */
export const pick = (options, seed, offset = 0) => {
  const all = list(options);
  if (!all.length) return undefined;
  const index = ((Math.floor(Number(seed) || 0) * 7 + offset * 13) % all.length + all.length) % all.length;
  return all[index];
};

/* ------------------------------------------------------ writing numbers */

const SUPERSCRIPT = Object.freeze({ 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' });
const FROM_SUPERSCRIPT = Object.freeze(Object.fromEntries(Object.entries(SUPERSCRIPT).map(([plain, sup]) => [sup, plain])));
/** 3 → "³", −12 → "⁻¹²". */
export const superscript = (value) => String(value).replace(/−/g, '-').split('').map((character) => SUPERSCRIPT[character] ?? character).join('');
/** "⁻¹²" → −12, or null. */
export const fromSuperscript = (value) => {
  const plain = text(value).split('').map((character) => FROM_SUPERSCRIPT[character] ?? '?').join('');
  return /^-?\d+$/.test(plain) ? Number(plain) : null;
};
export const SUPERSCRIPT_CHARACTERS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁻';
/** −4 as "−4" (the typographic minus). */
export const signed = (value) => (Number(value) < 0 ? `${MINUS}${Math.abs(Number(value))}` : String(value));
/** An index written in front of a root: ⁿ√ with n as a superscript, √ alone for 2, ∛ and ∜ as their own signs. */
export const rootSign = (index) => (index === 2 ? '√' : index === 3 ? '∛' : index === 4 ? '∜' : `${superscript(index)}√`);
/** "√(x + 4)" or "√7": brackets only around more than one character. */
export const rootOf = (index, radicand) => `${rootSign(index)}${/^[\w]+$/.test(radicand) ? radicand : `(${radicand})`}`;

/* ------------------------------------------------------ exact fractions */

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};
export const Q = (n, d = 1) => {
  if (!d) throw new Error('division by zero');
  const g = gcd(n, d);
  const sign = d < 0 ? -1 : 1;
  const top = (sign * n) / g;
  return Object.freeze({ n: top === 0 ? 0 : top, d: Math.abs(d) / g });
};
export const qAdd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qSub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
export const qMul = (a, b) => Q(a.n * b.n, a.d * b.d);
export const qDiv = (a, b) => Q(a.n * b.d, a.d * b.n);
export const qEq = (a, b) => a.n === b.n && a.d === b.d;
export const qIsInt = (a) => a.d === 1;
/** "3", "−1/2". */
export const qText = (a) => `${a.n < 0 ? MINUS : ''}${Math.abs(a.n)}${a.d === 1 ? '' : `/${a.d}`}`;
/** A whole number raised to a whole power (exact while it stays safe). */
export const intPow = (base, exponent) => {
  let result = 1;
  for (let index = 0; index < exponent; index += 1) result *= base;
  if (!Number.isSafeInteger(result)) throw new Error('too large');
  return result;
};
/** An exact fraction raised to a whole power, negative powers as reciprocals. */
export const qPow = (a, exponent) => {
  if (exponent === 0) return Q(1);
  const magnitude = Math.abs(exponent);
  const raised = Q(intPow(a.n, magnitude), intPow(a.d, magnitude));
  return exponent < 0 ? qDiv(Q(1), raised) : raised;
};
/** The exact qth root of a whole number, or null. */
export const exactRoot = (value, q) => {
  if (q % 2 === 0 && value < 0) return null;
  const sign = value < 0 ? -1 : 1;
  const root = Math.round(Math.abs(value) ** (1 / q));
  for (const candidate of [root - 1, root, root + 1]) {
    if (candidate >= 0 && intPow(candidate, q) === Math.abs(value)) return sign * candidate;
  }
  return null;
};

/* ------------------------------------------------------ polynomials in x */

/** Coefficients, highest power first, written "2x³ − 3x² + 6" (zero terms left out). */
export const polynomialText = (coefficients, letter = 'x') => {
  const degree = coefficients.length - 1;
  const terms = coefficients.map((coefficient, index) => ({ coefficient, power: degree - index })).filter((term) => term.coefficient !== 0);
  if (!terms.length) return '0';
  return terms.map((term, index) => {
    const magnitude = Math.abs(term.coefficient);
    const letters = term.power === 0 ? '' : term.power === 1 ? letter : `${letter}${superscript(term.power)}`;
    const body = letters && magnitude === 1 ? letters : `${magnitude}${letters}`;
    if (index === 0) return `${term.coefficient < 0 ? MINUS : ''}${body}`;
    return `${term.coefficient < 0 ? MINUS : '+'} ${body}`;
  }).join(' ');
};
/** (x − r) written as text: "x − 3", "x + 2", "x". */
export const linearFactorText = (root, letter = 'x') => (root === 0 ? letter : `${letter} ${root < 0 ? '+' : MINUS} ${Math.abs(root)}`);
/** (ax − b), a > 0: "2x − 1", "x + 4". */
export const linearText = (a, b, letter = 'x') => `${a === 1 ? '' : a}${letter}${b === 0 ? '' : ` ${b < 0 ? MINUS : '+'} ${Math.abs(b)}`}`;
/** The product of two coefficient lists. */
export const multiply = (left, right) => {
  const result = Array(left.length + right.length - 1).fill(0);
  left.forEach((a, i) => right.forEach((b, j) => { result[i + j] += a * b; }));
  return result;
};
/** P(x) for whole-number coefficients. */
export const evaluate = (coefficients, x) => coefficients.reduce((sum, coefficient) => sum * x + coefficient, 0);
/** The positive divisors of a whole number. */
export const divisorsOf = (value) => {
  const magnitude = Math.abs(value);
  const found = [];
  for (let d = 1; d <= magnitude; d += 1) if (magnitude % d === 0) found.push(d);
  return found;
};
/** A set as the lessons write one: "{−2, 1, 3}". */
export const setText = (values) => `{${values.map((value) => (typeof value === 'object' ? qText(value) : signed(value))).join(', ')}}`;
