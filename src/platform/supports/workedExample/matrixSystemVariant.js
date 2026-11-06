/*
 * "PRACTISE ONE LIKE THIS" FOR A SYSTEM SOLVED WITH MATRICES (numericVariant.js's
 * third kind): THE ITEM ITSELF, WITH NEW NUMBERS.
 *
 *   buildMatrixSystemVariant(question, { seed }) → { prompt, steps, answer, kind } | null
 *
 * The matrices lesson (Algebra II Honors module 1, Solving Systems with
 * Matrices; the 2026-11-06 walkthrough) solves printed systems in the Matrix
 * Lab: write A · X = B, find A⁻¹ with technology, read X = A⁻¹B. None of its
 * Classwork and Practice items offered a practice after the last miss.
 *
 * WHICH ITEMS. A Matrix Lab item in solve mode whose system is printed (no
 * story, no family slot, no start to correct), each equation in standard
 * form with whole numbers ("2x - 3y = 7", a missing variable allowed), with
 * exactly one solution, and a prompt that quotes no number. A singular system
 * is not varied: every variant has the same answer, in words. A word problem
 * is not either: new numbers would contradict its story.
 *
 * THE SAME SHAPE, NEVER EASIER. Each equation keeps its variables in its
 * order, a missing variable stays missing (a 0 in A), a ±1 stays ±1, and
 * every other coefficient keeps its sign and moves at most one down or two up
 * (never below 2), their sizes adding up to at least the item's. The solution
 * is of the item's kind, variable by variable: a whole number stays whole
 * (1 to 6, or within ten of a two-digit value), a half stays a half, a quarter
 * a quarter (PR 7 asks for exact answers); none is the item's own value, and
 * there are at least as many negatives. Every constant is a whole number no
 * larger than twice the item's largest (or 40), no more of them are 0, and an
 * equation divides through by a common factor only where the item's does.
 *
 * THE ITEM'S METHOD, GRADED. The steps are the Matrix Lab's own worked solution
 * of the new system (matrixLabReview.js): each equation in standard form, A
 * and B, A⁻¹ where the item asks for it, X = A⁻¹B, and the check. That
 * builder writes them only after the lab's grader marks the work they
 * describe right and complete, so the key is the tool's own.
 *
 * NEVER A GIVE-AWAY. No value equals the item's, and the item's solution,
 * written as an ordered triple or "x = …, y = …, z = …", appears nowhere;
 * similarExampleIsSafe runs too.
 *
 * NOTHING HERE IS RECORDED. It returns values, like numericVariant.js.
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { isFamilyBackedQuestion } from '../../../../functions/shared/questionFamilySlot.mjs';
import { SOLUTION_TYPES, readMatrixLabQuestion } from '../../../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';
import { formatRational, toNumber } from '../../../../functions/shared/toolMath/matrixLab/matrixMath.mjs';
import { buildMatrixLabReview } from '../../../tools/shared/reviews/matrixLabReview.js';
import { similarExampleIsSafe } from './similarProblem.js';

export const MATRIX_SYSTEM_VARIANT_KIND = 'matrixSystem';

const text = (value) => String(value ?? '').trim();
const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/* ------------------------------------------------------ seeded randomness */

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const randomFrom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));

/* ----------------------------------------------------- reading the system */

// "3×3" names the kind of system, not one of its numbers.
const SYSTEM_SIZE = /\b[23]\s*[×xX*]\s*[23]\b/g;
const quotesNumbers = (question) => [question?.prompt, question?.stem, question?.question]
  .some((value) => /\d/.test(text(value).replace(SYSTEM_SIZE, '')));

/**
 * "2x - 3y = 7" → { order, coefficients, constant }: the variables in the
 * order written, each coefficient in the system's order (0 where one is
 * missing), the whole number on the right. Null for any other layout.
 */
const readRow = (equation, variables) => {
  const sides = text(equation).replace(/[−–]/g, '-').split('=');
  if (sides.length !== 2) return null;
  const [left, right] = sides.map((side) => side.replace(/\s+/g, ''));
  if (!/^-?\d+$/.test(right)) return null;
  const pieces = left.match(/[+-]?[^+-]+/g) || [];
  if (!pieces.length || pieces.join('') !== left) return null;
  const order = [];
  const coefficients = variables.map(() => 0);
  for (const piece of pieces) {
    const match = /^([+-]?)([1-9]\d*)?([A-Za-z])$/.exec(piece);
    const index = match ? variables.indexOf(match[3]) : -1;
    if (index < 0 || order.includes(index)) return null;
    order.push(index);
    coefficients[index] = (match[1] === '-' ? -1 : 1) * (match[2] ? Number(match[2]) : 1);
  }
  return { order, coefficients, constant: Number(right) };
};

const formatRow = (row, variables) => {
  let left = '';
  row.order.forEach((index) => {
    const c = row.coefficients[index];
    const term = `${Math.abs(c) === 1 ? '' : Math.abs(c)}${variables[index]}`;
    left = left ? `${left} ${c < 0 ? '-' : '+'} ${term}` : `${c < 0 ? '-' : ''}${term}`;
  });
  return `${left} = ${row.constant}`;
};

/** The item as a printed system this kind can vary, or null. */
const readSystem = (question) => {
  if (!question || typeof question !== 'object' || question.type !== 'matrixLab') return null;
  if (isFamilyBackedQuestion(question) || question.familyDelivery || question.generator) return null;
  // A story (its quantities), a system to correct, or a singular decision.
  if (question.context || question.variableMeanings || question.startFrom || question.justifySingular || quotesNumbers(question)) return null;
  const model = readMatrixLabQuestion(question);
  if (model.mode !== 'solve' || model.hiddenSystem || !model.buildEquation) return null;
  if (model.classification?.type !== SOLUTION_TYPES.ONE) return null;
  const { variables } = model;
  if (!Array.isArray(question.equations) || question.equations.length !== variables.length) return null;
  const rows = question.equations.map((equation) => readRow(equation, variables));
  if (rows.some((row) => !row)) return null;
  // The lab's own reading of the equations must be this one.
  const same = rows.every((row, at) => row.coefficients.every((c, index) => toNumber(model.keyA[at][index]) === c) && toNumber(model.keyB[at][0]) === row.constant);
  if (!same) return null;
  const solution = model.classification.solution.map((value) => ({ n: Number(value.n), d: Number(value.d) }));
  if (!solution.every((value) => Number.isSafeInteger(value.n) && [1, 2, 4].includes(value.d))) return null;
  return { variables, rows, solution, askInverse: model.askInverse };
};

/* ------------------------------------------------------------ the variant */

/** A value of the item's kind for one variable: its denominator, about its size, never its value. */
const drawValue = (random, own) => {
  const size = Math.abs(own.n / own.d);
  for (let tries = 0; tries < 40; tries += 1) {
    const [low, high] = size < 10 ? [1, Math.max(6, Math.ceil(size)) * own.d] : [10 * own.d, (Math.ceil(size) + 10) * own.d];
    const top = integer(random, low, high);
    if (gcd(top, own.d) !== 1) continue;
    const sign = size < 10 ? (random() < 0.5 ? -1 : 1) : Math.sign(own.n);
    const value = { n: sign * top, d: own.d };
    if (value.n !== own.n) return value;
  }
  return null;
};

const ATTEMPTS = 600;
const divides = (coefficients, constant) => coefficients.reduce((g, c) => gcd(g, c), constant) > 1;

const variantOf = (question, item, seed) => {
  const { variables, rows, solution } = item;
  const size = (all) => all.reduce((sum, row) => sum + row.coefficients.reduce((total, c) => total + Math.abs(c), 0), 0);
  const itemSize = size(rows);
  const negatives = solution.filter((value) => value.n < 0).length;
  const zeros = rows.filter((row) => row.constant === 0).length;
  const constantLimit = Math.max(40, 2 * Math.max(...rows.map((row) => Math.abs(row.constant))));
  const shown = (value) => formatRational({ n: BigInt(value.n), d: BigInt(value.d) });
  const itemAnswers = [
    `(${solution.map(shown).join(', ')})`,
    `(${solution.map(shown).join(',')})`,
    variables.map((name, index) => `${name} = ${shown(solution[index])}`).join(', '),
  ];
  const random = randomFrom(hashText(`${Number(seed) || 0}|${MATRIX_SYSTEM_VARIANT_KIND}|${rows.map((row) => formatRow(row, variables)).join('|')}`));

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const coefficients = rows.map((row) => row.coefficients.map((c) => (Math.abs(c) <= 1 ? c : Math.sign(c) * integer(random, Math.max(2, Math.abs(c) - 1), Math.abs(c) + 2))));
    if (size(coefficients.map((list) => ({ coefficients: list }))) < itemSize) continue;
    const values = solution.map((own) => drawValue(random, own));
    if (values.some((value) => !value)) continue;
    if (values.filter((value) => value.n < 0).length < negatives) continue;
    // Each constant is the left side at the solution, and must be a whole number.
    const constants = coefficients.map((list) => list.reduce((sum, c, index) => sum + (c * values[index].n * 4) / values[index].d, 0) / 4);
    if (!constants.every(Number.isInteger) || constants.some((constant) => Math.abs(constant) > constantLimit)) continue;
    if (constants.filter((constant) => constant === 0).length > zeros) continue;
    // No equation divides through by a common factor unless the item's does.
    if (coefficients.some((list, at) => divides(list, constants[at]) && !divides(rows[at].coefficients, rows[at].constant))) continue;
    const next = rows.map((row, at) => ({ order: row.order, coefficients: coefficients[at], constant: constants[at] }));
    const equations = next.map((row) => formatRow(row, variables));
    const asked = { ...question, equations };
    // The new system has exactly this solution, by the lab's own reading.
    const model = readMatrixLabQuestion(asked);
    if (model.classification?.type !== SOLUTION_TYPES.ONE) continue;
    if (!model.classification.solution.every((value, index) => Number(value.n) * values[index].d === values[index].n * Number(value.d))) continue;
    // The lab's worked solution, written only when its grader accepts the work.
    const review = buildMatrixLabReview(asked);
    if (!review?.steps?.length) continue;
    const whole = values.every((value) => value.d === 1);
    const listed = `$${equations[0]}$, $${equations[1]}$ and $${equations[2]}$`;
    const variant = {
      prompt: `Solve the system with technology and matrices: ${listed}.${whole ? '' : ' Give exact answers.'}`,
      steps: [...review.steps, ...(review.why ? [review.why] : [])],
      answer: variables.map((name, index) => `${name} = ${shown(values[index])}`).join(', '),
      kind: MATRIX_SYSTEM_VARIANT_KIND,
    };
    if (hintRevealsAnswer([variant.prompt, ...variant.steps, variant.answer].join('\n'), itemAnswers)) continue;
    if (!similarExampleIsSafe(question, variant)) continue;
    return variant;
  }
  return null;
};

export const buildMatrixSystemVariant = (question, { seed = 0 } = {}) => {
  try {
    const item = readSystem(question);
    return item && item.variables.length === 3 ? variantOf(question, item, seed) : null;
  } catch {
    return null;
  }
};
