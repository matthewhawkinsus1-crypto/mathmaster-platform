/*
 * THE quadraticsAbsoluteValue SUPPORT FAMILY, ON REAL ITEMS.
 *
 * src/platform/supports/families/quadraticsAbsoluteValue.js gives the platform
 * Hint control, "Try a similar one" and the inclusion "Let's back up" step their
 * content for absolute value equations, vertices, zeros, the Polynomial Workshop
 * and the Parabola Geometry Lab. Every item here is one a student can be given:
 *
 *   - platform Question Family instances, built by resolveFamilyQuestionInstance
 *     exactly as delivery builds them: absoluteValue.solveEquation (a on the
 *     bars 1..3, a = 1, h = 0, k = 0), quadratics.identifyVertex (vertex and
 *     standard form, unit and small a, h = 0, k = 0) and functions.identifyZeros
 *     (unit and small a, a zero at 0), 60 seats each;
 *   - Step Algebra absolute value equations compiled from V5 (`solveEquation`,
 *     the relation workspace): two solutions, ONE solution (|…| = 0) and NO
 *     solution (|…| = negative), negative, fractional and decimal coefficients,
 *     the equation in a field or only in the prompt — 60 seeded documents plus
 *     the capability manifest's own item;
 *   - authored multiAnswer items compiled from V5: "Solve 2|x − 3| + 4 = 10",
 *     a vertex, zeros with a repeated root and with fractional zeros;
 *   - polynomialWorkshop, every view: SAMPLE_BATCH_B_DEEP_DIVE,
 *     SAMPLE_MISSING_MATH_TOOLS, the two area-model items of the Algebra II
 *     L4 lesson, and 60 seeded items per view (V5 where V5 carries the view's
 *     fields, the stored tool shape where it does not), with repeated roots,
 *     non-monic divisors, a zero factor pair, decimal leading coefficients;
 *   - parabolaGeometryLab, every view: Batch B, the missing-tools sample and 60
 *     seeded items per view (vertical and horizontal, negative and fractional p,
 *     h = 0 / k = 0, authored points off the curve).
 *
 * Every answer the tests compare against is computed INDEPENDENTLY of the
 * family, with mathjs in exact fraction arithmetic, from what the question shows
 * (its equation, its authored tool fields with the tools' documented defaults).
 * The worked siblings are re-solved the same way from their own prompts, and
 * every step that states a computed value is checked.
 *
 * Mutation-checked (each went red, then was restored):
 *   - choose() returned the numbered spelling unconditionally (guard bypassed)
 *     → quoted equations that hold an answer leak: the hint leak test and the
 *     "fall back to the plain move" test fail;
 *   - the absolute value sibling stated its larger solution with the wrong sign
 *     → the independent re-solve of the sibling fails;
 *   - the factorZero model's verdict was inverted (isFactor = value ≠ 0) → the
 *     expectedValues "every listed value is a real answer" test fails;
 *   - graphConnection read the behaviour from the multiplicity's parity the
 *     wrong way round → the expectedValues test (independent oracle) fails;
 *   - the standard-form vertex sibling's y-coordinate step was off by one → the
 *     step check of the sibling test fails;
 *   - the division sibling multiplied back by (x + r) instead of (x - r) → the
 *     "Multiply: …" step check fails;
 *   - choiceGuardFor returned the plain guard (the numbered/plain choice read the
 *     verdict again) → "verdict views: whether a hint quotes numbers never depends
 *     on the verdict" fails on the |…| pairs; with only the parabola-equation
 *     branch removed it fails on the p / -p pairs;
 *   - PLAIN_ONLY_KINDS emptied (factorZero / equidistance quote numbers again)
 *     → the same verdict test fails;
 *   - the zeros ladder said "every term shares the factor a" for every a ≠ 1
 *     (2x² - x - 3, 4x² - 9) → "every statement a zeros hint makes about the
 *     coefficients is true" fails;
 *   - the fromGeometry sibling put the focus on the wrong side of the vertex
 *     ("below" for p > 0) → the sibling step check fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as family from '../../src/platform/supports/families/quadraticsAbsoluteValue.js';
import { ALL_FAMILY_MODULES, familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => (value && typeof value === 'object' && typeof value.n === 'bigint' ? value : math.fraction(value));
const eq = (a, b) => math.equal(F(a), F(b));
const isNeg = (value) => Number(F(value).s) < 0 && F(value).n !== 0n;
const isZeroF = (value) => F(value).n === 0n;
const fracText = (value) => {
  const f = F(value);
  const sign = isNeg(f) ? '-' : '';
  return f.d === 1n ? `${sign}${f.n}` : `${sign}${f.n}/${f.d}`;
};
const terminating = (value) => {
  let d = F(value).d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
};
const decimalOf = (value) => (F(value).d !== 1n && terminating(value) ? String(Number(math.number(F(value)).toFixed(10))) : null);
const uni = (value) => [value, value.replace(/-/g, '−')];
const numberTexts = (value) => {
  const f = F(value);
  const out = [fracText(f)];
  if (f.d !== 1n) out.push(`${isNeg(f) ? '-' : ''}\\frac{${f.n}}{${f.d}}`);
  const decimal = decimalOf(f);
  if (decimal) out.push(decimal);
  return [...new Set(out.flatMap(uni))];
};
const coordTexts = (value) => [fracText(value), decimalOf(value)].filter(Boolean);
const pairTexts = ([x, y]) => [...new Set(coordTexts(x).flatMap((a) => coordTexts(y).flatMap((b) => [`(${a}, ${b})`, `(${a},${b})`])).flatMap(uni))];
const toNumberText = (raw) => {
  const cleaned = String(raw).replace(/−/g, '-').replace(/\s+/g, '');
  const latex = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(cleaned);
  if (latex) return F(`${latex[1]}${latex[2]}/${latex[3]}`);
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+)?$/.test(cleaned)) return F(cleaned.replace(/^(-?)\./, '$10.'));
  return null;
};

/** mathjs reading of what a student sees: |…| → abs(…), unicode minus, ², ³. */
const toMath = (expression) => String(expression)
  .replace(/\$/g, '')
  .replace(/[−–]/g, '-')
  .replace(/²/g, '^2')
  .replace(/³/g, '^3')
  .replace(/×/g, '*')
  .replace(/x\(/g, 'x*(')
  .replace(/\|([^|]+)\|/g, 'abs($1)');
const at = (expression, x) => F(math.evaluate(toMath(expression), { x: F(x), y: F(0) }));
const linear = (expression) => {
  const b = at(expression, 0);
  return { m: math.subtract(at(expression, 1), b), b };
};

/** Every real solution of one |linear| equation with a constant other side, from its two sides. */
const absSolve = (equation) => {
  const [lhs, rhs] = toMath(equation).split('=');
  const f = (x) => math.subtract(F(math.evaluate(lhs, { x: F(x) })), F(math.evaluate(rhs, { x: F(x) })));
  const inside = /abs\(([^()]*(?:\([^()]*\)[^()]*)*)\)/.exec(toMath(equation))[1];
  const { m, b } = linear(inside);
  const kink = math.divide(math.unaryMinus(b), m);
  const roots = [];
  for (const dir of [-1, 1]) {
    const x1 = math.add(kink, F(dir));
    const x2 = math.add(kink, F(2 * dir));
    const slope = math.divide(math.subtract(f(x2), f(x1)), math.subtract(x2, x1));
    if (isZeroF(slope)) continue;
    const root = math.subtract(x1, math.divide(f(x1), slope));
    const sideOk = dir < 0 ? math.smallerEq(root, kink) : math.largerEq(root, kink);
    if (sideOk && isZeroF(f(root)) && !roots.some((other) => eq(other, root))) roots.push(root);
  }
  return roots.sort((a, b2) => math.number(math.subtract(a, b2)));
};

/** a, b, c of a quadratic right-hand side. */
const quadratic = (rhs) => {
  const c = at(rhs, 0);
  const p1 = at(rhs, 1);
  const m1 = at(rhs, -1);
  const a = math.divide(math.subtract(math.add(p1, m1), math.multiply(F(2), c)), F(2));
  const b = math.divide(math.subtract(p1, m1), F(2));
  return { a, b, c };
};
const vertexOf = ({ a, b, c }) => {
  const h = math.divide(math.unaryMinus(b), math.multiply(F(2), a));
  return [h, math.add(math.add(math.multiply(a, math.multiply(h, h)), math.multiply(b, h)), c)];
};
const rationalSqrt = (value) => {
  const f = F(value);
  const root = (n) => {
    const r = BigInt(Math.round(Math.sqrt(Number(n))));
    return r * r === n ? r : null;
  };
  const n = root(f.n);
  const d = root(f.d);
  return n === null || d === null ? null : F(`${n}/${d}`);
};
const quadraticRoots = ({ a, b, c }) => {
  const disc = math.subtract(math.multiply(b, b), math.multiply(F(4), math.multiply(a, c)));
  if (isNeg(disc)) return [];
  const s = rationalSqrt(disc);
  assert.ok(s, 'the oracle only meets rational zeros');
  const twoA = math.multiply(F(2), a);
  const r1 = math.divide(math.subtract(math.unaryMinus(b), s), twoA);
  const r2 = math.divide(math.add(math.unaryMinus(b), s), twoA);
  const roots = isZeroF(s) ? [r1] : [r1, r2];
  return roots.sort((x, y) => math.number(math.subtract(x, y)));
};
const polyAt = (coefficients, x) => coefficients.reduce((acc, coefficient) => math.add(math.multiply(acc, F(x)), F(coefficient)), F(0));
const trimFront = (values) => {
  const copy = values.map(F);
  while (copy.length > 1 && isZeroF(copy[0])) copy.shift();
  return copy;
};
/** Polynomial long division in fractions, written here from scratch. */
const divideOracle = (dividend, divisor) => {
  const top = trimFront(dividend);
  const bottom = trimFront(divisor);
  if (top.length < bottom.length) return { quotient: [F(0)], remainder: top };
  const rest = [...top];
  const quotient = [];
  while (rest.length >= bottom.length) {
    const factor = math.divide(rest[0], bottom[0]);
    quotient.push(factor);
    bottom.forEach((value, index) => { rest[index] = math.subtract(rest[index], math.multiply(factor, value)); });
    rest.shift();
  }
  return { quotient: trimFront(quotient), remainder: trimFront(rest.length ? rest : [F(0)]) };
};

/* ------------------------------------------------------------ the real items */

const seeded = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pick = (rng, values) => values[Math.floor(rng() * values.length)];
const v5 = (questions, courseId = 'algebra2') => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Quadratics and absolute value', courseId, assignmentType: 'notesClasswork' },
  sections: [{ role: 'classwork', questions }],
}).package.sections[0].questions;

const ITEMS = [];
const add = (label, kind, question, truth = {}) => ITEMS.push({ label, kind, question, truth });

const instance = (slot, seat) => {
  const resolved = resolveFamilyQuestionInstance({
    question: slot,
    assignmentId: 'a-quadratics-absolute-value-support',
    storageIndex: 0,
    allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'seated' },
  });
  assert.equal(resolved.error, null, `${slot.questionFamily.id} resolves`);
  return resolved;
};
const SEATS = Array.from({ length: 60 }, (_, index) => index);
const familySlot = (id, constraints = {}) => ({ questionId: `${id}-${JSON.stringify(constraints)}`, type: 'multiAnswer', questionFamily: { id, version: 1, tool: 'multiAnswer', constraints } });

// Platform Question Family instances.
[{}, { coefficients: 'one' }, { centerRange: [0, 0] }, { shiftRange: [0, 0] }].forEach((constraints) => {
  const seats = Object.keys(constraints).length ? SEATS.slice(0, 15) : SEATS;
  seats.forEach((seat) => add(`abs family ${JSON.stringify(constraints)} #${seat}`, 'absEquation', instance(familySlot('absoluteValue.solveEquation', constraints), seat).question, { source: 'family' }));
});
[{ form: 'vertex' }, {}, { form: 'vertex', leadingCoefficients: 'unit' }, { vertexXRange: [0, 0], form: 'vertex' }, { vertexYRange: [0, 0] }].forEach((constraints, index) => {
  const seats = index < 2 ? SEATS : SEATS.slice(0, 15);
  seats.forEach((seat) => add(`vertex family ${JSON.stringify(constraints)} #${seat}`, 'vertex', instance(familySlot('quadratics.identifyVertex', constraints), seat).question));
});
[{ leadingCoefficients: 'small' }, {}, { zeroRange: [0, 4] }].forEach((constraints, index) => {
  const seats = index < 2 ? SEATS : SEATS.slice(0, 20);
  seats.forEach((seat) => add(`zeros family ${JSON.stringify(constraints)} #${seat}`, 'zeros', instance(familySlot('functions.identifyZeros', constraints), seat).question));
});

// Step Algebra absolute value equations (the relation workspace), from V5.
const absEquationText = (A, m, b, K, C) => {
  const lead = A === 1 ? '' : A === -1 ? '-' : A === 0.5 ? '(1/2)' : String(A);
  const inner = `${m === 1 ? '' : m === -1 ? '-' : m}x${b ? ` ${b < 0 ? '-' : '+'} ${Math.abs(b)}` : ''}`;
  return `${lead}|${inner}|${K ? ` ${K < 0 ? '-' : '+'} ${Math.abs(K)}` : ''} = ${C}`;
};
{
  const rng = seeded(20261010);
  const docs = [];
  for (let index = 0; index < 60; index += 1) {
    const A = pick(rng, [1, 2, 3, -2, -1, 0.5, 4]);
    const m = pick(rng, [1, 2, 3, -1, -2]);
    const b = pick(rng, [-7, -5, -3, -1, 0, 2, 4, 6]);
    const K = pick(rng, [0, -4, -2, 3, 5, 9]);
    const which = index % 3; // two, one, none
    const D = which === 0 ? pick(rng, [1, 2, 3, 4, 6, 8]) : which === 1 ? 0 : -pick(rng, [1, 2, 5]);
    const C = (A * D) + K;
    const equation = absEquationText(A, m, b, K, C);
    docs.push(index % 4 === 0
      ? { standard: 'A2.6E', prompt: `Solve ${equation}.`, studentActions: ['solveEquation'] }
      : { standard: 'A2.6E', prompt: `Solve ${equation.replace(/-/g, '−')}.`, studentActions: ['solveEquation'], equation, solveFor: 'x' });
  }
  docs.push({ standard: 'A2.6E', prompt: 'Solve |2x − 3| = 7.', studentActions: ['solveEquation'], equation: '|2x - 3| = 7', solveFor: 'x' }); // interactiveCapabilityManifest
  docs.push({ standard: 'A2.6E', prompt: 'Solve |x − 4| = 7 step by step. Give the complete solution set.', studentActions: ['solveEquation'] });
  v5(docs).forEach((question, index) => add(`V5 stepAlgebra abs ${index}`, 'absEquation', question, { source: 'workspace' }));
}

// Authored multiAnswer items, from V5.
v5([
  { standard: 'A2.6E', prompt: 'Solve $2|x - 3| + 4 = 10$.', studentActions: ['multipleResponses'], answerFields: [{ id: 's', label: 'Smaller solution', answer: '0' }, { id: 'l', label: 'Larger solution', answer: '6' }] },
  { standard: 'A2.6E', prompt: 'Solve |2x − 1| = 4.', studentActions: ['multipleResponses'], answerFields: [{ id: 's', label: 'Smaller solution', answer: '-3/2' }, { id: 'l', label: 'Larger solution', answer: '5/2' }] },
  { standard: 'A2.6E', prompt: 'Solve −3|x + 2| + 5 = −7.', studentActions: ['multipleResponses'], answerFields: [{ id: 's', label: 'x =', answer: '-6' }, { id: 'l', label: 'x =', answer: '2' }] },
  { standard: 'A2.6E', prompt: 'Solve |3x − 6| + 2 = 2.', studentActions: ['multipleResponses'], answerFields: [{ id: 'x', label: 'The only solution', answer: '2' }] },
]).forEach((question, index) => add(`V5 authored abs ${index}`, 'absEquation', question, { source: 'authored' }));
v5([
  { standard: 'A.7A', prompt: 'Find the vertex of y = (x-2)^2 + 1.', studentActions: ['multipleResponses'], answerFields: [{ id: 'v', label: 'Vertex', answer: '(2, 1)' }] },
  { standard: 'A.7A', prompt: 'Find the vertex of $y = 2x^2 - 8x + 3$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'v', label: 'Vertex', answer: '(2, -5)' }] },
  { standard: 'A.7A', prompt: 'Find the vertex of $y = -x^2 + 3x$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'v', label: 'Vertex', answer: '(3/2, 9/4)' }] },
], 'algebra1').forEach((question, index) => add(`V5 authored vertex ${index}`, 'vertex', question));
v5([
  { standard: 'A.8A', prompt: 'Find the zeros of $f(x) = x^2 - 6x + 9$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'z', label: 'Zero', answer: '3' }] },
  { standard: 'A.8A', prompt: 'Find the zeros of $f(x) = 2x^2 - x - 3$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'a', label: 'Smaller zero', answer: '-1' }, { id: 'b', label: 'Larger zero', answer: '3/2' }] },
  { standard: 'A.8A', prompt: 'Find the zeros of $f(x) = -x^2 + 4$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'a', label: 'Smaller zero', answer: '-2' }, { id: 'b', label: 'Larger zero', answer: '2' }] },
  // The leading coefficient does NOT divide every term: no "shares the factor" claim.
  { standard: 'A.8A', prompt: 'Find the zeros of $f(x) = 4x^2 - 9$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'a', label: 'Smaller zero', answer: '-3/2' }, { id: 'b', label: 'Larger zero', answer: '3/2' }] },
  { standard: 'A.8A', prompt: 'Find the zeros of $f(x) = 3x^2 + 5x - 2$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'a', label: 'Smaller zero', answer: '-2' }, { id: 'b', label: 'Larger zero', answer: '1/3' }] },
  { standard: 'A.8A', prompt: 'Find the zeros of $f(x) = 2x^2 - 5x$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'a', label: 'Smaller zero', answer: '0' }, { id: 'b', label: 'Larger zero', answer: '5/2' }] },
  { standard: 'A.8A', prompt: 'Find the zeros of $f(x) = 2x^2 - 4x - 6$.', studentActions: ['multipleResponses'], answerFields: [{ id: 'a', label: 'Smaller zero', answer: '-1' }, { id: 'b', label: 'Larger zero', answer: '3' }] },
], 'algebra1').forEach((question, index) => add(`V5 authored zeros ${index}`, 'zeros', question));

// polynomialWorkshop and parabolaGeometryLab from the samples and the L4 lesson.
const POLY_KIND = { factorZero: 'factorZero', multiplyArea: 'multiplyArea', factorQuadratic: 'factorQuadratic', division: 'division', graphConnection: 'graphConnection', rationalFeatures: 'rationalFeatures' };
const LAB_KIND = { features: 'parabolaFeatures', equidistance: 'parabolaEquidistance', fromGeometry: 'parabolaFromGeometry', equation: 'parabolaEquation' };
const toolKind = (question) => (String(question.type || question.toolId) === 'polynomialWorkshop' ? POLY_KIND[question.mode || 'factorZero'] : LAB_KIND[question.mode || 'features']);
['SAMPLE_BATCH_B_DEEP_DIVE.json', 'SAMPLE_MISSING_MATH_TOOLS.json'].forEach((file) => readJson(file).questions
  .filter((question) => ['polynomialWorkshop', 'parabolaGeometryLab'].includes(question.toolId))
  .forEach((question, index) => add(`${file} ${question.toolId} ${question.mode || 'default'} ${index}`, toolKind(question), question)));
compileAuthoringIntentV5(readJson('teacher-import-jsons/algebra2-honors-module1/L4_Operations_on_Functions_Composition.json')).package.sections
  .flatMap((section) => section.questions)
  .filter((question) => question.type === 'polynomialWorkshop')
  .forEach((question, index) => add(`L4 area model ${index}`, 'multiplyArea', question));

{
  const rng = seeded(7);
  const ints = (low, high) => Array.from({ length: high - low + 1 }, (_, index) => low + index);
  const nonzero = (low, high) => ints(low, high).filter((value) => value !== 0);
  const fromRoots = (roots, lead = 1) => roots.reduce((acc, root) => {
    const out = Array(acc.length + 1).fill(0);
    acc.forEach((value, index) => { out[index] += value; out[index + 1] -= value * root; });
    return out;
  }, [lead]);
  const factorZero = [];
  const area = [];
  const quadraticDocs = [];
  const divisionDocs = [];
  const graph = [];
  const rationals = [];
  const features = [];
  const equidistance = [];
  const geometry = [];
  const equations = [];
  for (let index = 0; index < 60; index += 1) {
    // factorZero: the stored tool shape (V5 does not carry candidateRoot).
    const roots = Array.from({ length: pick(rng, [2, 3]) }, () => pick(rng, nonzero(-4, 4)));
    const candidate = index % 6 === 0 ? 0 : index % 6 === 1 ? pick(rng, [0.5, -1.5]) : index % 2 ? pick(rng, roots) : pick(rng, nonzero(-5, 5));
    factorZero.push({ toolId: 'polynomialWorkshop', mode: 'factorZero', coefficients: fromRoots(roots, pick(rng, [1, 1, 2, -1])), candidateRoot: candidate });
    // multiplyArea, factorQuadratic, division: V5.
    area.push({ standard: 'A2.7B', prompt: 'Use the area model to multiply the binomials.', studentActions: ['multiplyPolynomials'], leftBinomial: [pick(rng, [1, 2, 3, -2]), pick(rng, ints(-6, 6))], rightBinomial: [pick(rng, [1, 2, 4, -1]), pick(rng, nonzero(-7, 7))] });
    const p = pick(rng, ints(-8, 8));
    const q = index % 7 === 0 ? p : pick(rng, ints(-8, 8));
    quadraticDocs.push({ standard: 'A2.7B', prompt: 'Find p and q so the quadratic factors as (x + p)(x + q).', studentActions: ['factorPolynomial'], coefficients: [1, p + q, p * q] });
    const divisor = index % 5 === 0 ? [1, 0, pick(rng, [-1, 1, 2])] : [pick(rng, [1, 1, 2, -1]), pick(rng, nonzero(-4, 4))];
    divisionDocs.push({ standard: 'A2.7B', prompt: 'Divide the polynomials.', studentActions: ['dividePolynomial'], dividend: Array.from({ length: pick(rng, [3, 4, 5]) }, (_, k) => (k === 0 ? pick(rng, [1, 2, 3, -1]) : pick(rng, ints(-9, 9)))), divisor });
    // graphConnection and rationalFeatures: the stored tool shape.
    const rootValues = [...new Set(Array.from({ length: pick(rng, [2, 3]) }, () => pick(rng, nonzero(-4, 4))))];
    const entries = rootValues.map((root) => ({ root, multiplicity: pick(rng, [1, 2, 3]) }));
    graph.push({ toolId: 'polynomialWorkshop', mode: 'graphConnection', roots: entries, leadingCoefficient: pick(rng, [1, -1, 0.35, -2, 0.5, 3]), targetRoot: pick(rng, entries).root });
    const numeratorRoots = Array.from({ length: pick(rng, [1, 2, 3]) }, () => pick(rng, ints(-3, 3)));
    const denominatorRoots = Array.from({ length: pick(rng, [1, 2]) }, () => pick(rng, ints(-3, 3)));
    rationals.push({ toolId: 'polynomialWorkshop', mode: 'rationalFeatures', numeratorRoots, denominatorRoots, targetValue: pick(rng, [...numeratorRoots, ...denominatorRoots, 4, -4]) });
    // Parabola Geometry Lab.
    const h = pick(rng, [0, -3, -1, 2, 4]);
    const k = pick(rng, [0, -2, 1, 3, -5]);
    const pValue = pick(rng, [2, -1, 0.5, -1.5, 3, 0.25]);
    const orientation = index % 3 === 0 ? 'horizontal' : 'vertical';
    features.push({ standard: 'A2.6A', prompt: 'Use the vertex and p to find the focus, the directrix and the latus rectum.', studentActions: ['analyzeParabolaGeometry'], mode: 'features', h, k, p: pValue, orientation });
    equations.push({ standard: 'A2.6A', prompt: 'Give the value of 4p and the opening direction.', studentActions: ['analyzeParabolaGeometry'], mode: 'equation', h, k, p: pValue, orientation });
    const focusD = pick(rng, [[2, 5], [-1, 3], [0, -2], [4, 0], [-3, -3]]);
    const directrixValue = pick(rng, [-1, 1, 2, -4, 6]);
    const kind = index % 2 ? 'horizontal' : 'vertical';
    const along = kind === 'horizontal' ? focusD[1] : focusD[0];
    if (along !== directrixValue) geometry.push({ standard: 'A2.6A', prompt: 'Work back from the focus and directrix to the vertex and p.', studentActions: ['analyzeParabolaGeometry'], focus: focusD, directrix: { kind, value: directrixValue } });
    const equi = { toolId: 'parabolaGeometryLab', mode: 'equidistance', h, k, p: pValue, orientation };
    if (index % 4 === 0) equi.point = [pick(rng, [1, -2, 3]), pick(rng, [2, -1, 5])];
    else equi.offset = pick(rng, [2, 4, -2, 3, 1]);
    equidistance.push(equi);
  }
  factorZero.forEach((question, index) => add(`factorZero #${index}`, 'factorZero', question));
  v5(area).forEach((question, index) => add(`V5 multiplyArea #${index}`, 'multiplyArea', question));
  v5(quadraticDocs).forEach((question, index) => add(`V5 factorQuadratic #${index}`, 'factorQuadratic', question));
  v5(divisionDocs).forEach((question, index) => add(`V5 division #${index}`, 'division', question));
  graph.forEach((question, index) => add(`graphConnection #${index}`, 'graphConnection', question));
  rationals.forEach((question, index) => add(`rationalFeatures #${index}`, 'rationalFeatures', question));
  v5(features).forEach((question, index) => add(`V5 parabola features #${index}`, 'parabolaFeatures', question));
  v5(equations).forEach((question, index) => add(`V5 parabola equation #${index}`, 'parabolaEquation', question));
  v5(geometry).forEach((question, index) => add(`V5 parabola fromGeometry #${index}`, 'parabolaFromGeometry', question));
  equidistance.forEach((question, index) => add(`parabola equidistance #${index}`, 'parabolaEquidistance', question));
}

/* ------------------------------------------------------------ the truth, from what each item shows */

const promptMath = (prompt) => {
  const dollars = /\$([^$]+)\$/.exec(prompt || '');
  if (dollars) return dollars[1];
  const solve = /(?:Solve|vertex of|zeros of)\s+(.+?)\.(?:\s|$)/.exec(String(prompt || '').replace(/−/g, '-'));
  return solve ? solve[1].replace(/\s+step by step$/, '') : '';
};
const rhsOf = (equation) => equation.split('=').slice(1).join('=');

const DEFAULTS = {
  // The tools' documented defaults (PolynomialWorkshop.jsx, ParabolaGeometryLab.jsx).
  factorZero: { coefficients: [1, -5, 6], candidateRoot: 2 },
  multiplyArea: { leftBinomial: [2, 3], rightBinomial: [1, -4] },
  factorQuadratic: { coefficients: [1, -5, 6] },
  division: { dividend: [1, -4, -7, 10], divisor: [1, -2] },
  graphConnection: { roots: [{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }], leadingCoefficient: 1 },
  rationalFeatures: { numeratorRoots: [2, -1], denominatorRoots: [2, 4] },
  features: { h: 1, k: -1, p: 2 },
  equidistance: { h: 0, k: 0, p: 2 },
  equation: { h: -2, k: 1, p: 1.5 },
};
const END_LABEL = (degree, lead) => (degree % 2 === 0
  ? (isNeg(lead) ? 'both ends fall' : 'both ends rise')
  : (isNeg(lead) ? 'left rises, right falls' : 'left falls, right rises'));

/** { numbers, pairs, words, lists } every answer of the item, from the item alone. */
const truthOf = (item) => {
  const q = item.question;
  const out = { numbers: [], pairs: [], words: [], lists: [] };
  switch (item.kind) {
    case 'absEquation': {
      const equation = item.truth.source === 'workspace' && q.equation ? q.equation : promptMath(q.prompt);
      const solutions = absSolve(equation);
      out.numbers.push(...solutions);
      if (!solutions.length) out.words.push('no solution', '∅');
      else if (item.truth.source === 'workspace') out.words.push('valid');
      out.solutions = solutions;
      out.equation = equation;
      return out;
    }
    case 'vertex': {
      const vertex = vertexOf(quadratic(rhsOf(promptMath(q.prompt))));
      out.pairs.push(vertex);
      out.numbers.push(...vertex);
      out.vertex = vertex;
      return out;
    }
    case 'zeros': {
      const roots = quadraticRoots(quadratic(rhsOf(promptMath(q.prompt))));
      out.numbers.push(...roots);
      roots.forEach((root) => out.pairs.push([root, F(0)]));
      out.roots = roots;
      return out;
    }
    case 'factorZero': {
      const coefficients = q.coefficients || DEFAULTS.factorZero.coefficients;
      const r = q.candidateRoot ?? DEFAULTS.factorZero.candidateRoot;
      const value = polyAt(coefficients, F(r));
      out.numbers.push(value);
      out.words.push(isZeroF(value) ? 'yes' : 'no');
      out.value = value;
      return out;
    }
    case 'multiplyArea': {
      const [a, b] = (q.leftBinomial || DEFAULTS.multiplyArea.leftBinomial).map(F);
      const [c, d] = (q.rightBinomial || DEFAULTS.multiplyArea.rightBinomial).map(F);
      const cells = [math.multiply(a, c), math.multiply(a, d), math.multiply(b, c), math.multiply(b, d)];
      const productList = [cells[0], math.add(cells[1], cells[2]), cells[3]];
      out.numbers.push(...cells, ...productList);
      out.lists.push(productList);
      out.polys = [`(${fracText(a)}*x + ${fracText(b)})*(${fracText(c)}*x + ${fracText(d)})`, ...cells.map((cell, index) => `(${fracText(cell)})*x^${[2, 1, 1, 0][index]}`), `(${fracText(productList[1])})*x`];
      return out;
    }
    case 'factorQuadratic': {
      const [, b, c] = (q.coefficients || DEFAULTS.factorQuadratic.coefficients).map(Number);
      const limit = Math.abs(c) + 1;
      let pair = null;
      for (let p = -limit; p <= limit && !pair; p += 1) {
        const qq = b - p;
        if (p * qq === c) pair = [p, qq].sort((x, y) => x - y);
      }
      out.numbers.push(...pair.map(F));
      out.lists.push(pair.map(F));
      out.polys = [`(x + ${pair[0]})*(x + ${pair[1]})`];
      out.pair = pair;
      return out;
    }
    case 'division': {
      const result = divideOracle(q.dividend || DEFAULTS.division.dividend, q.divisor || DEFAULTS.division.divisor);
      out.numbers.push(...result.quotient, ...result.remainder);
      out.lists.push(result.quotient, result.remainder);
      const asPoly = (values) => values.map((value, index) => `(${fracText(value)})*x^${values.length - 1 - index}`).join(' + ');
      out.polys = [asPoly(result.quotient), asPoly(result.remainder)];
      return out;
    }
    case 'graphConnection': {
      const roots = q.roots || DEFAULTS.graphConnection.roots;
      const lead = F(q.leadingCoefficient ?? DEFAULTS.graphConnection.leadingCoefficient);
      const target = roots.find((entry) => entry.root === (q.targetRoot ?? roots[0].root)) || roots[0];
      const degree = roots.reduce((sum, entry) => sum + (entry.multiplicity ?? 1), 0);
      const behavior = (target.multiplicity ?? 1) % 2 === 0 ? 'touches' : 'crosses';
      out.words.push(behavior, behavior === 'touches' ? 'touches and turns' : 'crosses the x-axis', END_LABEL(degree, lead));
      return out;
    }
    case 'rationalFeatures': {
      const numerator = q.numeratorRoots || DEFAULTS.rationalFeatures.numeratorRoots;
      const denominator = q.denominatorRoots || DEFAULTS.rationalFeatures.denominatorRoots;
      const target = q.targetValue ?? Math.min(...numerator, ...denominator);
      const n = numerator.filter((value) => value === target).length;
      const d = denominator.filter((value) => value === target).length;
      let type = 'none';
      if (n && d && d <= n) type = 'hole';
      else if (d > n) type = 'verticalAsymptote';
      else if (n) type = 'zero';
      out.words.push(type, { hole: 'Hole', verticalAsymptote: 'Vertical asymptote', zero: 'Zero / x-intercept', none: 'None of these' }[type]);
      out.type = type;
      return out;
    }
    case 'parabolaFeatures':
    case 'parabolaEquation':
    case 'parabolaEquidistance': {
      const defaults = DEFAULTS[q.mode || 'features'];
      const h = F(q.h ?? defaults.h);
      const k = F(q.k ?? defaults.k);
      const p = F(q.p ?? defaults.p);
      const vertical = (q.orientation || 'vertical') !== 'horizontal';
      const focus = vertical ? [h, math.add(k, p)] : [math.add(h, p), k];
      const directrix = vertical ? math.subtract(k, p) : math.subtract(h, p);
      if (item.kind === 'parabolaFeatures') {
        out.numbers.push(...focus, directrix, math.multiply(F(4), math.abs(p)));
        out.pairs.push(focus);
        return out;
      }
      if (item.kind === 'parabolaEquation') {
        out.numbers.push(math.multiply(F(4), p));
        out.words.push(vertical ? (isNeg(p) ? 'down' : 'up') : (isNeg(p) ? 'left' : 'right'));
        return out;
      }
      let point;
      if (q.point) point = q.point.map(F);
      else {
        const offset = F(q.offset ?? 4);
        const shift = math.divide(math.multiply(offset, offset), math.multiply(F(4), p));
        point = vertical ? [math.add(h, offset), math.add(k, shift)] : [math.add(h, shift), math.add(k, offset)];
      }
      const squared = math.add(math.pow(math.subtract(point[0], focus[0]), 2), math.pow(math.subtract(point[1], focus[1]), 2));
      const across = math.abs(math.subtract(vertical ? point[1] : point[0], directrix));
      const root = rationalSqrt(squared);
      if (root) out.numbers.push(root);
      else out.approx = [Math.sqrt(math.number(squared))];
      out.numbers.push(across);
      out.words.push(eq(squared, math.multiply(across, across)) ? 'yes' : 'no');
      return out;
    }
    case 'parabolaFromGeometry': {
      const [fx, fy] = q.focus.map(F);
      const d = F(q.directrix.value);
      const vertical = q.directrix.kind === 'horizontal';
      const along = vertical ? fy : fx;
      const middle = math.divide(math.add(along, d), F(2));
      const p = math.subtract(along, middle);
      const vertex = vertical ? [fx, middle] : [middle, fy];
      out.numbers.push(...vertex, p);
      out.pairs.push(vertex);
      return out;
    }
    default:
      throw new Error(item.kind);
  }
};

/** Every spelling of every answer: the texts no hint, back-up or sibling may contain. */
const answerTexts = (truth) => {
  const texts = [];
  truth.numbers.forEach((value) => texts.push(...numberTexts(value)));
  truth.pairs.forEach((pair) => texts.push(...pairTexts(pair)));
  truth.lists.forEach((values) => {
    const joined = values.map(fracText).join(', ');
    texts.push(...uni(joined), ...uni(joined.replace(/\s+/g, '')));
  });
  (truth.approx || []).forEach((value) => texts.push(value.toFixed(2), String(Number(value.toFixed(2)))));
  texts.push(...truth.words);
  return [...new Set(texts)];
};

const TRUTH = new Map(ITEMS.map((item) => [item, truthOf(item)]));
const textsOf = (item) => answerTexts(TRUTH.get(item));

/** Words that state a verdict for each kind: a hint names none of them, whichever is right. */
const VERDICT_WORDS = {
  absEquation: /\b(no solution|no real solution|valid|extraneous|empty set)\b|∅/i,
  factorZero: /\b(yes|no)\b/i,
  graphConnection: /\b(cross(es)?|touch(es)?|rises?|falls?|bounces?)\b/i,
  rationalFeatures: /\b(hole|asymptote|zero|none|intercept)\b/i,
  parabolaEquidistance: /\b(yes|no)\b/i,
  parabolaEquation: /\b(up|down|left|right)\b/i,
};

/* ------------------------------------------------------------ sibling re-solve */

const pairsIn = (value) => [...String(value).matchAll(/\((-?\d+(?:\.\d+)?(?:\/\d+)?), (-?\d+(?:\.\d+)?(?:\/\d+)?)\)/g)].map((match) => [F(match[1]), F(match[2])]);
const samePolynomial = (left, right) => [-3, -1, 0, 2, 5, 7].every((x) => eq(at(left, x), at(right, x)));

const verifySibling = (item, example) => {
  const { prompt, steps, answer } = example;
  const truth = TRUTH.get(item);
  switch (item.kind) {
    case 'absEquation': {
      const equation = /^Solve (.+?)\.(?: Enter|$)/.exec(prompt)[1];
      const solutions = absSolve(equation);
      assert.equal(solutions.length, 2, `the sibling ${equation} has two solutions`);
      assert.equal(answer, `x = ${fracText(solutions[0])} or x = ${fracText(solutions[1])}`, `the sibling answer of ${equation}`);
      assert.ok(!solutions.some((value) => truth.numbers.some((other) => eq(other, value))), 'different solutions');
      for (const step of steps) {
        const isolated = /both sides(?: by -?\d+)?: (.+)\.$/.exec(step);
        if (isolated) assert.deepEqual(absSolve(isolated[1]).map(fracText), solutions.map(fracText), `"${step}" keeps the solutions`);
        const split = /split into two equations: (.+) = (-?\d+) or (.+) = (-?\d+)\.$/.exec(step);
        if (split) {
          const values = [split[2], split[4]].map((target) => math.divide(math.subtract(F(target), linear(split[1]).b), linear(split[1]).m));
          assert.deepEqual(values.map(fracText).sort(), solutions.map(fracText).sort(), `"${step}" splits into the right equations`);
        }
        for (const match of step.matchAll(/gives x = (-?\d+(?:\/\d+)?)/g)) assert.ok(solutions.some((value) => eq(value, match[1])), `"${step}": x = ${match[1]} is a solution`);
        for (const match of step.matchAll(/\|([^|]+)\| = \|(-?\d+)\| = (\d+)/g)) {
          assert.ok(eq(at(match[1], 0), match[2]), `"${match[1]}" is ${match[2]}`);
          assert.ok(eq(math.abs(F(match[2])), match[3]));
        }
      }
      return;
    }
    case 'vertex': {
      const equation = /^Identify the vertex of (y = .+)\. Write it as an ordered pair\.$/.exec(prompt)[1];
      const abc = quadratic(rhsOf(equation));
      const vertex = vertexOf(abc);
      assert.deepEqual(pairsIn(answer).map((pair) => pair.map(fracText)), [vertex.map(fracText)], `the sibling vertex of ${equation}`);
      assert.ok(!(eq(vertex[0], truth.vertex[0]) && eq(vertex[1], truth.vertex[1])), 'a different vertex');
      for (const step of steps) {
        const coefficients = /^Here a = (-?\d+), b = (-?\d+) and c = (-?\d+)\.$/.exec(step);
        if (coefficients) assert.ok(eq(coefficients[1], abc.a) && eq(coefficients[2], abc.b) && eq(coefficients[3], abc.c), step);
        const xStep = / = (-?\d+)\.$/.exec(step);
        if (step.startsWith('The x-coordinate')) assert.ok(eq(xStep[1], vertex[0]), step);
        const yStep = /^The y-coordinate is y = (.+) = (.+) = (-?\d+)\.$/.exec(step);
        if (yStep) {
          assert.ok(eq(F(math.evaluate(toMath(yStep[1]))), vertex[1]) && eq(F(math.evaluate(toMath(yStep[2]))), vertex[1]) && eq(yStep[3], vertex[1]), step);
        }
        const hStep = /so h = (-?\d+)\.$/.exec(step);
        if (hStep) assert.ok(eq(hStep[1], vertex[0]), step);
        const kStep = /so k = (-?\d+)\.$/.exec(step);
        if (kStep) assert.ok(eq(kStep[1], vertex[1]), step);
      }
      return;
    }
    case 'zeros': {
      const poly = /^Find the zeros of f\(x\) = (.+)\. Enter/.exec(prompt)[1];
      const roots = quadraticRoots(quadratic(poly));
      assert.equal(answer, `x = ${fracText(roots[0])} and x = ${fracText(roots[1])}`, `the sibling zeros of ${poly}`);
      assert.ok(!roots.some((value) => truth.roots.some((other) => eq(other, value))), 'different zeros');
      for (const step of steps) {
        const factored = /^Factor out .+: (.+) = (.+)\.$/.exec(step);
        if (factored) assert.ok(samePolynomial(factored[1], factored[2]), step);
        const pq = /^(-?\d+) and (-?\d+) multiply to (-?\d+) and add to (-?\d+), so (.+) = (.+)\.$/.exec(step);
        if (pq) {
          assert.ok(eq(math.multiply(F(pq[1]), F(pq[2])), pq[3]) && eq(math.add(F(pq[1]), F(pq[2])), pq[4]), step);
          assert.ok(samePolynomial(pq[5], pq[6]), step);
        }
        for (const match of step.matchAll(/(\([^()]+\)) is zero when x = (-?\d+)/g)) assert.ok(isZeroF(at(match[1], F(match[2]))), step);
      }
      return;
    }
    case 'factorZero': {
      const match = /^Is (\(x [+-] \d+\)) a factor of P\(x\) = (.+)\? Evaluate P\((-?\d+)\) to decide\.$/.exec(prompt);
      const value = at(match[2], F(match[3]));
      assert.ok(eq(at(match[1], F(match[3])), 0), 'the test value makes the factor zero');
      if (isZeroF(value)) assert.match(answer, /is zero, so .+ is a factor$/);
      else assert.equal(answer, `P(${match[3]}) = ${fracText(value)}, so ${match[1]} is not a factor`);
      assert.ok(eq(F(math.evaluate(toMath(/P\(-?\d+\) = (.+)\.$/.exec(steps[0])[1]))), value), steps[0]);
      assert.ok(eq(F(math.evaluate(toMath(/: (.+)\.$/.exec(steps[1])[1]))), value), steps[1]);
      assert.equal(/is not a factor/.test(steps[2]), !isZeroF(value), steps[2]);
      return;
    }
    case 'multiplyArea': {
      const binomials = /multiply \((.+)\)\((.+)\)\.$/.exec(prompt);
      const productText = /^(.+) \(coefficients (.+)\)$/.exec(answer);
      const product = `(${binomials[1]})*(${binomials[2]})`;
      assert.ok(samePolynomial(productText[1], product), `${productText[1]} is ${product}`);
      const coefficients = productText[2].split(', ').map(F);
      assert.ok(samePolynomial(coefficients.map((c, i) => `(${fracText(c)})*x^${2 - i}`).join('+'), product), 'the coefficient list');
      steps.slice(0, 4).forEach((step) => {
        const cell = /: (.+) × (.+) = (.+)\.$/.exec(step);
        assert.ok(samePolynomial(`(${cell[1]})*(${cell[2]})`, cell[3]), step);
      });
      return;
    }
    case 'factorQuadratic': {
      const poly = /^Find p and q so that (.+) = \(x \+ p\)\(x \+ q\)\.$/.exec(prompt)[1];
      const [, p, q] = /^p = (-?\d+), q = (-?\d+)$/.exec(answer).map(Number);
      assert.ok(samePolynomial(poly, `(x + ${p})*(x + ${q})`), `${poly} = (x + ${p})(x + ${q})`);
      const { b, c } = quadratic(poly);
      assert.ok(eq(F(p + q), b));
      const work = /^(-?\d+) and (-?\d+) work: (-?\d+) \+ \(?(-?\d+)\)? = (-?\d+) and (-?\d+) × \(?(-?\d+)\)? = (-?\d+)\./.exec(steps[2]);
      assert.ok(work && eq(F(Number(work[3]) + Number(work[4])), F(work[5])) && eq(F(Number(work[6]) * Number(work[7])), F(work[8])), steps[2]);
      assert.ok(eq(F(work[5]), b) && eq(F(work[8]), c), steps[2]);
      // …and the pair is the only one: no other integer pair has that product and sum.
      let count = 0;
      for (let x = -100; x <= 100; x += 1) if (x * (Number(fracText(b)) - x) === Number(fracText(c))) count += 1;
      assert.ok(count <= 2, 'one factor pair (in either order)');
      return;
    }
    case 'division': {
      const match = /^Divide (.+) by (.+)\. Give the quotient and the remainder\.$/.exec(prompt);
      const result = /^quotient (.+), remainder (-?\d+)$/.exec(answer);
      const dividendCoefficients = [3, 2, 1, 0].map((power) => {
        // the cubic's coefficients, read by evaluation
        const values = [-1, 0, 1, 2].map((x) => at(match[1], x));
        const d3 = math.divide(math.add(math.subtract(values[3], math.multiply(F(3), values[2])), math.subtract(math.multiply(F(3), values[1]), values[0])), F(6));
        const c0 = values[1];
        const d2 = math.subtract(math.divide(math.add(values[2], values[0]), F(2)), c0);
        const d1 = math.subtract(math.subtract(math.subtract(values[2], c0), d2), d3);
        return [d3, d2, d1, c0][3 - power];
      });
      const divisor = linear(match[2]);
      const oracle = divideOracle(dividendCoefficients, [divisor.m, divisor.b]);
      assert.ok(samePolynomial(result[1], oracle.quotient.map((c, i) => `(${fracText(c)})*x^${oracle.quotient.length - 1 - i}`).join('+')), `quotient of ${match[1]} ÷ ${match[2]}`);
      assert.ok(eq(result[2], oracle.remainder[0]), 'remainder');
      for (const step of steps) {
        for (const multiply of step.matchAll(/Multiply: (-?\d*x?²?)\((.+?)\) = (.+?)\./g)) {
          const factor = multiply[1] === '' ? '1' : multiply[1].replace(/^(-?)x/, '$11x');
          assert.ok(samePolynomial(`(${factor.replace('x²', '*x^2').replace(/(\d)x$/, '$1*x')})*(${multiply[2]})`, multiply[3]), step);
        }
      }
      return;
    }
    case 'graphConnection': {
      const match = /^For P\(x\) = (-?\d*)(.+), describe what the graph does at the zero x = (-?\d+), and describe its end behavior\.$/.exec(prompt);
      const lead = F(match[1] === '' ? 1 : match[1] === '-' ? -1 : Number(match[1]));
      const factors = [...match[2].matchAll(/\(x ([+-]) (\d+)\)([²³]?)/g)].map((factor) => ({ root: F((factor[1] === '-' ? 1 : -1) * Number(factor[2])), multiplicity: factor[3] === '²' ? 2 : factor[3] === '³' ? 3 : 1 }));
      const target = factors.find((entry) => eq(entry.root, match[3]));
      const degree = factors.reduce((sum, entry) => sum + entry.multiplicity, 0);
      const passes = target.multiplicity % 2 === 1;
      assert.match(answer, passes ? /passes through the x-axis/ : /meets the x-axis and turns back/, `multiplicity ${target.multiplicity}`);
      const ends = degree % 2 === 0 ? (isNeg(lead) ? 'both ends point downward' : 'both ends point upward')
        : (isNeg(lead) ? 'the left end points upward and the right end points downward' : 'the left end points downward and the right end points upward');
      assert.ok(answer.endsWith(`${ends}.`), `degree ${degree}, lead ${fracText(lead)}: ${answer}`);
      assert.match(steps[1], new RegExp(`= ${degree}, which is ${degree % 2 ? 'odd' : 'even'}`));
      return;
    }
    case 'parabolaFeatures': {
      const match = /vertex \((-?\d+), (-?\d+)\) and p = (-?\d+(?:\.\d+)?), with a (vertical|horizontal) axis/.exec(prompt);
      const [h, k, p] = match.slice(1, 4).map(F);
      const vertical = match[4] === 'vertical';
      const focus = vertical ? [h, math.add(k, p)] : [math.add(h, p), k];
      const directrix = vertical ? math.subtract(k, p) : math.subtract(h, p);
      const stated = /^focus \((-?[\d.]+), (-?[\d.]+)\), directrix (x|y) = (-?[\d.]+), latus rectum ([\d.]+)$/.exec(answer);
      assert.ok(stated, answer);
      assert.ok(eq(F(stated[1]), focus[0]) && eq(F(stated[2]), focus[1]), `the focus of ${prompt}`);
      assert.equal(stated[3], vertical ? 'y' : 'x');
      assert.ok(eq(F(stated[4]), directrix), 'the directrix');
      assert.ok(eq(F(stated[5]), math.multiply(F(4), math.abs(p))), 'the latus rectum');
      const focusStep = /= \((-?[\d.]+), (-?[\d.]+)\)\.$/.exec(steps[1]);
      assert.ok(focusStep && eq(F(focusStep[1]), focus[0]) && eq(F(focusStep[2]), focus[1]), steps[1]);
      const lineStep = /= (-?[\d.]+), so the directrix/.exec(steps[2]);
      assert.ok(lineStep && eq(F(lineStep[1]), directrix), steps[2]);
      return;
    }
    case 'parabolaEquidistance': {
      const match = /vertex \((-?\d+), (-?\d+)\) and p = (-?\d+), with a (vertical|horizontal) axis.+P = \((-?\d+), (-?\d+)\)/.exec(prompt);
      const [h, k, p, , px, py] = match.slice(1).map((value) => (/^-?\d+$/.test(value) ? F(value) : value));
      const vertical = match[4] === 'vertical';
      const focus = vertical ? [h, math.add(k, p)] : [math.add(h, p), k];
      const directrix = vertical ? math.subtract(k, p) : math.subtract(h, p);
      const toFocus = rationalSqrt(math.add(math.pow(math.subtract(px, focus[0]), 2), math.pow(math.subtract(py, focus[1]), 2)));
      const toLine = math.abs(math.subtract(vertical ? py : px, directrix));
      assert.ok(toFocus && eq(toFocus, toLine), 'the sibling point is on its parabola');
      assert.equal(answer, `both distances are ${fracText(toLine)}, so P is on the parabola`);
      assert.match(steps[1], new RegExp(`= ${fracText(toFocus)}\\.$`));
      assert.match(steps[2], new RegExp(`= ${fracText(toLine)}\\.$`));
      return;
    }
    case 'parabolaFromGeometry': {
      const match = /focus \((-?\d+), (-?\d+)\) and directrix (x|y) = (-?\d+)\.$/.exec(prompt);
      const [fx, fy] = [F(match[1]), F(match[2])];
      const d = F(match[4]);
      const vertical = match[3] === 'y';
      const along = vertical ? fy : fx;
      const middle = math.divide(math.add(along, d), F(2));
      const p = math.subtract(along, middle);
      const [h, k] = vertical ? [fx, middle] : [middle, fy];
      assert.equal(answer, `h = ${fracText(h)}, k = ${fracText(k)}, p = ${fracText(p)}`);
      // Every step that states a value or a side: the axis through the focus, the average, p and where the focus is.
      assert.ok(steps[0].endsWith(vertical ? `h = ${fracText(fx)}.` : `k = ${fracText(fy)}.`), steps[0]);
      assert.match(steps[0], vertical ? /is horizontal, so the axis of symmetry is the vertical line/ : /is vertical, so the axis of symmetry is the horizontal line/);
      assert.ok(steps[1].endsWith(`average of ${fracText(along)} and ${fracText(d)}, which is ${fracText(middle)}.`), steps[1]);
      const side = vertical ? (isNeg(p) ? 'below' : 'above') : (isNeg(p) ? 'to the left of' : 'to the right of');
      assert.ok(steps[2].startsWith(`p = ${fracText(along)} - `) && steps[2].endsWith(`= ${fracText(p)}: the focus is ${side} the vertex.`), steps[2]);
      return;
    }
    case 'parabolaEquation': {
      const match = /^The parabola \((x|y)[^)]*\)² = 4p\(.+\) has vertex .+ and p = (-?\d+(?:\.\d+)?)\./.exec(prompt);
      const p = F(match[2]);
      const toward = `toward ${isNeg(p) ? 'smaller' : 'larger'} ${match[1] === 'x' ? 'y' : 'x'}-values`;
      const stated = /^four times p is (-?[\d.]+); it opens (.+)$/.exec(answer);
      assert.ok(stated && eq(F(stated[1]), math.multiply(F(4), p)), `4p of ${prompt}`);
      assert.equal(stated[2], toward);
      assert.ok(eq(F(/is (-?[\d.]+)\.$/.exec(steps[0])[1]), math.multiply(F(4), p)), steps[0]);
      return;
    }
    default:
      throw new Error(`no sibling check for ${item.kind}`);
  }
};

/* ------------------------------------------------------------ the tests */

test('the corpus covers every sub-kind and every case, many times each', () => {
  const counts = {};
  ITEMS.forEach((item) => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
  for (const kind of ['absEquation', 'vertex', 'zeros', 'factorZero', 'multiplyArea', 'factorQuadratic', 'division', 'graphConnection', 'rationalFeatures', 'parabolaFeatures', 'parabolaEquidistance', 'parabolaFromGeometry', 'parabolaEquation']) {
    assert.ok((counts[kind] || 0) >= 50, `${kind}: ${counts[kind] || 0} items`);
  }
  const abs = ITEMS.filter((item) => item.kind === 'absEquation').map((item) => TRUTH.get(item).solutions.length);
  assert.ok(abs.filter((n) => n === 0).length >= 10 && abs.filter((n) => n === 1).length >= 10 && abs.filter((n) => n === 2).length >= 100, 'no-solution, one-solution and two-solution equations');
  const vertexItems = ITEMS.filter((item) => item.kind === 'vertex');
  assert.ok(vertexItems.some((item) => isZeroF(TRUTH.get(item).vertex[0])) && vertexItems.some((item) => isZeroF(TRUTH.get(item).vertex[1])), 'h = 0 and k = 0 vertices');
  assert.ok(vertexItems.some((item) => /-\(x|= -x/.test(item.question.prompt)), 'a = -1');
  const zeroItems = ITEMS.filter((item) => item.kind === 'zeros');
  assert.ok(zeroItems.some((item) => TRUTH.get(item).roots.some(isZeroF)), 'a zero at 0');
  assert.ok(zeroItems.some((item) => TRUTH.get(item).roots.length === 1), 'a repeated root');
  assert.ok(zeroItems.some((item) => TRUTH.get(item).roots.some((root) => F(root).d !== 1n)), 'a fractional zero');
  assert.ok(ITEMS.some((item) => item.kind === 'factorQuadratic' && TRUTH.get(item).pair[0] === TRUTH.get(item).pair[1]), 'a repeated factor pair');
  const verdicts = (kind) => new Set(ITEMS.filter((item) => item.kind === kind).flatMap((item) => TRUTH.get(item).words));
  assert.ok(verdicts('factorZero').has('yes') && verdicts('factorZero').has('no'));
  ['touches', 'crosses', 'both ends rise', 'both ends fall', 'left falls, right rises', 'left rises, right falls'].forEach((word) => assert.ok(verdicts('graphConnection').has(word), word));
  ['hole', 'verticalAsymptote', 'zero', 'none'].forEach((word) => assert.ok(verdicts('rationalFeatures').has(word), word));
  ['up', 'down', 'left', 'right'].forEach((word) => assert.ok(verdicts('parabolaEquation').has(word), word));
  assert.ok(verdicts('parabolaEquidistance').has('yes') && verdicts('parabolaEquidistance').has('no'));
});

const EARLIER = ALL_FAMILY_MODULES.slice(0, ALL_FAMILY_MODULES.indexOf(family));

test('every item is owned by this family, as the right sub-kind, and no earlier family claims it', () => {
  assert.equal(family.implemented, true);
  assert.equal(EARLIER.length, 8, 'eight families come before this one');
  for (const { label, kind, question } of ITEMS) {
    assert.equal(family.matches(question), true, `${label} is matched`);
    assert.equal(family.questionKind(question), kind, `${label} is read as ${kind}`);
    assert.equal(familyFor(question), family, `${label} is routed here`);
    for (const earlier of EARLIER) {
      if (earlier.implemented) assert.equal(earlier.matches(question), false, `${label}: ${earlier.family} does not claim it`);
    }
  }
});

test('what is not ours, or cannot be explained for sure, is not claimed', () => {
  const l1 = compileAuthoringIntentV5(readJson('teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json')).package.sections.flatMap((section) => section.questions);
  const l2 = compileAuthoringIntentV5(readJson('teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json')).package.sections.flatMap((section) => section.questions);
  const day2 = compileAuthoringIntentV5(readJson('teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json')).package.sections.flatMap((section) => section.questions);
  const pathDoc = readJson('seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json').documents.find((document) => document.id === 'mm_A2_6E_v2_two-case-complete');
  const notOurs = [
    ...l1.map((question, index) => [`L1 absolute value #${index} (${question.type})`, question]),
    ...l2.slice(0, 3).map((question, index) => [`L2 parent review #${index}`, question]),
    ...day2.filter((question) => /\|/.test(question.prompt)).map((question, index) => [`graphAnalysis of an absolute value #${index}`, question]),
    ['Path response item (no answerFields; server-graded)', generatePathInstanceWithRetries(pathDoc, 's1').question],
    ['linear two-step instance', instance({ questionId: 'two-step', type: 'multiAnswer', questionFamily: { id: 'linear.twoStepEquation', version: 1, tool: 'multiAnswer' } }, 3).question],
    ['intercepts instance', instance({ questionId: 'int', type: 'multiAnswer', questionFamily: { id: 'functions.identifyIntercepts', version: 1, tool: 'multiAnswer' } }, 3).question],
    ...v5([
      { standard: 'A.5A', prompt: 'Solve 3x + 5 = 20.', studentActions: ['solveEquation'], equation: '3x + 5 = 20', solveFor: 'x' },
      { standard: 'A2.6F', prompt: 'Solve |x − 2| < 5.', studentActions: ['solveInequality'], inequality: '|x - 2| < 5' },
      { standard: 'A2.6E', prompt: 'Solve |x − 2| = 2x + 1.', studentActions: ['solveEquation'], equation: '|x - 2| = 2x + 1', solveFor: 'x' },
      { standard: 'A2.6E', prompt: 'Solve |x − 1| = |x + 3|.', studentActions: ['solveEquation'], equation: '|x - 1| = |x + 3|', solveFor: 'x' },
      { standard: 'A2.6E', prompt: 'Solve.', studentActions: ['multipleResponses'], answerFields: [{ id: 'a', label: 'Smaller solution', answer: '-2' }, { id: 'b', label: 'Larger solution', answer: '5' }] },
      { standard: 'A2.6E', prompt: 'Solve $2|x - 3| + 4 = 10$.', studentActions: ['multipleResponses'], answerFields: [{ id: 's', label: 'Smaller', answer: '1' }, { id: 'l', label: 'Larger', answer: '6' }] },
      { standard: 'A.7A', prompt: 'Find the vertex of y = (x-2)^2 + 1.', studentActions: ['multipleResponses'], answerFields: [{ id: 'v', label: 'Vertex', answer: '(-2, 1)' }] },
      { standard: 'A2.7B', prompt: 'Factor.', studentActions: ['factorPolynomial'], coefficients: [1, 1, 1] },
      { standard: 'A2.7B', prompt: 'Factor.', studentActions: ['factorPolynomial'], coefficients: [2, -5, 3] },
      { standard: 'A2.6A', prompt: 'Recover.', studentActions: ['analyzeParabolaGeometry'], focus: [1, 3], directrix: { kind: 'horizontal', value: 3 } },
      { standard: 'A2.6A', prompt: 'Features.', studentActions: ['analyzeParabolaGeometry'], mode: 'features', h: 1, k: 1, p: 0 },
    ]).map((question, index) => [`V5 not ours #${index}`, question]),
    ['graphConnection with bare-number roots', { toolId: 'polynomialWorkshop', mode: 'graphConnection', roots: [1, 2] }],
    ['graphConnection listing a root twice', { toolId: 'polynomialWorkshop', mode: 'graphConnection', roots: [{ root: 1, multiplicity: 1 }, { root: 1, multiplicity: 1 }] }],
    ['multiplyArea with an unreadable binomial', { toolId: 'polynomialWorkshop', mode: 'multiplyArea', leftBinomial: [2, 'three'], rightBinomial: [1, 4] }],
    ['division by zero', { toolId: 'polynomialWorkshop', mode: 'division', dividend: [1, 2, 3], divisor: [0] }],
    ['nothing', null],
    ['empty', {}],
  ];
  for (const [label, question] of notOurs) {
    assert.ok(label === 'nothing' || question, `${label} exists`);
    assert.equal(family.matches(question), false, `${label} is not claimed`);
    assert.notEqual(familyFor(question), family, `${label} is not routed here`);
    assert.deepEqual(family.hints(question), [], label);
    assert.deepEqual(family.expectedValues(question), [], label);
    assert.equal(family.similarProblem(question, { seed: 0 }), null, label);
    assert.equal(family.backUpQuestion(question), null, label);
  }
});

test('expectedValues: every independently computed answer, in its spellings, and nothing that is not an answer', () => {
  for (const item of ITEMS) {
    const { label, question } = item;
    const truth = TRUTH.get(item);
    const expected = family.expectedValues(question);
    assert.ok(expected.length, `${label}: some answers`);
    const texts = answerTexts(truth);
    // Every answer the oracle found is caught by the family's list alone, and by the platform guard.
    const guard = questionAnswerValues(question);
    for (const value of texts) {
      assert.equal(hintRevealsAnswer(`Look: ${value}.`, expected), true, `${label}: ${value} is listed (${expected.slice(0, 10).join(' | ')})`);
      assert.equal(hintRevealsAnswer(`Look: ${value}.`, guard), true, `${label}: the platform guard reads ${value}`);
    }
    truth.numbers.forEach((value) => assert.ok(expected.includes(fracText(value)), `${label}: ${fracText(value)} as written`));
    truth.pairs.forEach((pair) => assert.ok(expected.includes(`(${fracText(pair[0])}, ${fracText(pair[1])})`), `${label}: the pair`));
    // …and every listed value is a real answer: a number or pair equals one, any other text spells one.
    for (const value of expected) {
      const number = toNumberText(value);
      if (number) {
        assert.ok(truth.numbers.some((answer) => eq(answer, number)) || (truth.approx || []).some((answer) => Math.abs(answer - math.number(number)) < 0.06), `${label}: ${value} is an answer`);
        continue;
      }
      const pair = pairsIn(value.replace(/−/g, '-').replace(/,(?=\S)/g, ', '));
      if (/^\(.*\)$/.test(value) && pair.length === 1) {
        assert.ok(truth.pairs.some((answer) => eq(answer[0], pair[0][0]) && eq(answer[1], pair[0][1])), `${label}: ${value} is an answer`);
        continue;
      }
      if (/x/.test(value) && truth.polys) {
        assert.ok(truth.polys.some((poly) => samePolynomial(value.replace(/−/g, '-').replace(/(\d)\(/g, '$1*('), poly)), `${label}: "${value}" is one of the answer polynomials`);
        continue;
      }
      const spelled = hintRevealsAnswer(value, texts) || texts.some((answer) => value.toLowerCase().includes(answer.toLowerCase()))
        || (/^(no solution|no real solution|no solutions|∅|\{\}|empty set|No solution)$/.test(value) && truth.words.includes('no solution'))
        || (/^(Yes|No)$/.test(value) && truth.words.includes(value.toLowerCase()))
        || (/^(Hole|Vertical asymptote|asymptote|vertical asymptote|Zero \/ x-intercept|zero|x-intercept|None of these|none|hole)$/.test(value) && item.kind === 'rationalFeatures')
        || (/√|sqrt/.test(value) && truth.approx);
      assert.ok(spelled, `${label}: "${value}" spells a real answer`);
    }
    if (item.kind === 'rationalFeatures') {
      const others = ['hole', 'verticalAsymptote', 'zero', 'none'].filter((type) => type !== truth.type);
      others.forEach((type) => assert.ok(!expected.includes(type), `${label}: ${type} is not this answer`));
    }
  }
});

test('hints: 3–4 sentences, least to most specific, none of which contains or narrows to an answer', () => {
  for (const item of ITEMS) {
    const { label, question, kind } = item;
    const hints = family.hints(question);
    assert.ok(hints.length >= 3 && hints.length <= 4, `${label}: ${hints.length} hints ${JSON.stringify(hints)} ${JSON.stringify(question)}`);
    assert.equal(new Set(hints).size, hints.length, `${label}: no repeated hint`);
    const texts = [...textsOf(item), ...family.expectedValues(question)];
    for (const hint of hints) {
      assert.equal(typeof hint, 'string');
      assert.equal(hintRevealsAnswer(hint, texts), false, `${label}: "${hint}" reveals an answer`);
      if (VERDICT_WORDS[kind]) assert.doesNotMatch(hint, VERDICT_WORDS[kind], `${label}: "${hint}" carries a verdict word`);
    }
    // The platform ladder carries them, after any authored hints.
    const built = buildQuestionHints(question);
    for (const hint of hints) assert.ok(built.some((entry) => entry.text === hint && entry.source === 'family'), `${label}: the platform ladder carries "${hint}"`);
    for (const entry of built) assert.equal(hintRevealsAnswer(entry.text, textsOf(item)), false, `${label}: the platform ladder never leaks ("${entry.text}")`);
  }
});

test('hints quote this problem’s own numbers wherever that is safe, and fall back to the plain move', () => {
  const hintsOf = (predicate) => ITEMS.filter(predicate).map((item) => ({ item, joined: family.hints(item.question).join(' ') }));
  let quoted = 0;
  for (const { item, joined } of hintsOf((entry) => entry.kind === 'absEquation' && TRUTH.get(entry).solutions.length === 2)) {
    const shown = /(\|[^|]+\|)/.exec(TRUTH.get(item).equation.replace(/−/g, '-'))[1].replace(/\s+/g, '');
    if (joined.replace(/\s+/g, '').includes(shown)) quoted += 1;
  }
  assert.ok(quoted >= 60, `most absolute value ladders quote their own |…| (${quoted})`);
  const batchB = (mode) => ITEMS.find((item) => item.label.startsWith('SAMPLE_BATCH_B_DEEP_DIVE.json') && item.question.mode === mode).question;
  assert.match(family.hints(batchB('division')).join(' '), /x³ - 4x² - 7x \+ 10/);
  assert.match(family.hints(batchB('graphConnection')).join(' '), /x = -2 has multiplicity 2/);
  assert.match(family.hints(batchB('factorQuadratic')).join(' '), /p \+ q = -5 and p × q = 6/);
  // Batch B factorZero: P(2) = 0, so no hint may write a 0 — and none of its sentences needs to.
  assert.doesNotMatch(family.hints(batchB('factorZero')).join(' '), /(^|[^\d.])0(?![\d.]*\d)/);
  // A vertex-form item whose equation shows h and k uses the plain spelling.
  const vertexForm = ITEMS.find((item) => item.kind === 'vertex' && /\(x - \d\)\^2 \+ \d/.test(item.question.prompt));
  assert.doesNotMatch(family.hints(vertexForm.question).join(' '), /\(x - \d\)/);
});

test('the ladder is the same sentences whichever case is right (no case is told by a hint)', () => {
  // Absolute value equations: the same four moves on two-, one- and no-solution equations.
  const workspace = ITEMS.filter((item) => item.kind === 'absEquation' && item.truth.source === 'workspace');
  const byCount = (n) => workspace.filter((item) => TRUTH.get(item).solutions.length === n);
  assert.ok(byCount(0).length && byCount(1).length && byCount(2).length);
  const shape = (item) => family.hints(item.question).map((hint) => /never negative|split it into two|Check every value|alone/.exec(hint)?.[0]);
  for (const item of workspace) assert.deepEqual(shape(item), ['alone', 'never negative', 'split it into two', 'Check every value'], item.label);
  // Verdict views: one ladder length whatever the verdict.
  for (const kind of ['graphConnection', 'rationalFeatures', 'parabolaEquation', 'parabolaEquidistance', 'factorZero']) {
    const lengths = new Set(ITEMS.filter((item) => item.kind === kind).map((item) => family.hints(item.question).length));
    assert.equal(lengths.size, 1, `${kind}: one ladder length whatever the verdict`);
  }
});

test('"Try a similar one": a correctly worked sibling with different numbers and a different answer', () => {
  for (const item of ITEMS) {
    const { label, question } = item;
    if (item.kind === 'rationalFeatures') {
      assert.equal(family.similarProblem(question, { seed: 0 }), null, `${label}: no sibling for a features verdict`);
      assert.equal(buildSimilarWorkedExample(question), null);
      continue;
    }
    const direct = family.similarProblem(question, { seed: 0 });
    assert.ok(direct, `${label}: the family builds a sibling ${JSON.stringify(question)}`);
    assert.deepEqual(family.similarProblem(question, { seed: 0 }), direct, `${label}: deterministic for a seed`);
    const texts = [...questionAnswerValues(question), ...textsOf(item)];
    for (const seed of [0, 1, 5]) {
      const example = buildSimilarWorkedExample(question, { seed });
      assert.ok(example, `${label}: the platform offers it (seed ${seed})`);
      assert.equal(similarExampleIsSafe(question, example), true, `${label}: it passes the platform's own checks`);
      assert.notEqual(example.prompt, question.prompt);
      assert.ok(!texts.some((value) => value.toLowerCase() === example.answer.toLowerCase()), `${label}: the sibling answer is not this answer`);
      for (const piece of [example.prompt, example.answer, ...example.steps]) {
        assert.equal(hintRevealsAnswer(piece, textsOf(item).filter((value) => piece !== example.prompt || !toNumberText(value))), false, `${label}: sibling text "${piece}" shows this question's answer`);
      }
      if (VERDICT_WORDS[item.kind]) for (const piece of [example.answer, ...example.steps]) assert.doesNotMatch(piece, VERDICT_WORDS[item.kind], `${label}: "${piece}" uses a verdict label`);
      verifySibling(item, example);
    }
  }
});

test('"Let’s back up": a two-choice question about this problem’s first move, never its answer', () => {
  for (const item of ITEMS) {
    const { label, question } = item;
    const step = family.backUpQuestion(question);
    assert.ok(step, `${label}: a back-up step ${JSON.stringify(question)} ${JSON.stringify(family.expectedValues(question))}`);
    assert.equal(step.options.length, 2, `${label}: two choices`);
    assert.ok(step.options.includes(step.correct), `${label}: the right choice is offered`);
    assert.notEqual(step.options[0], step.options[1]);
    for (const value of [step.prompt, ...step.options]) assert.equal(hintRevealsAnswer(value, [...textsOf(item), ...family.expectedValues(question)]), false, `${label}: "${value}" reveals an answer`);
    const platform = backUpStepFor(question);
    assert.equal(platform.source, 'family', `${label}: the platform uses the family step`);
    assert.equal(platform.correct, step.correct);
  }
  const at0 = (predicate) => family.backUpQuestion(ITEMS.find(predicate).question);
  assert.match(at0((item) => item.kind === 'absEquation' && item.truth.source === 'family').correct, /alone on one side/, 'isolate before splitting');
  assert.equal(at0((item) => item.label.startsWith('SAMPLE_BATCH_B') && item.question.mode === 'factorZero').correct, 'The number that makes the factor zero', 'substitute r for (x - r), in the plain spelling');
  assert.equal(at0((item) => item.label.startsWith('SAMPLE_BATCH_B') && item.question.mode === 'graphConnection').correct, 'The multiplicity of that zero');
  assert.equal(at0((item) => item.label.startsWith('SAMPLE_BATCH_B') && item.question.mode === 'equation').correct, 'y', 'a horizontal parabola squares y');
});

/* ------------------------------------------------------------ verdict views: the spelling never tells the verdict */

/** Which rungs of the ladder (and the back-up prompt) quote numbers: N, or use the plain move: P. */
const signature = (question) => {
  const hints = family.hints(question);
  const back = family.backUpQuestion(question);
  const shape = (value) => (/\d/.test(value) ? 'N' : 'P');
  return `${hints.length}:${hints.map(shape).join('')}|back:${back ? [back.prompt, ...back.options].map(shape).join('') : '-'}`;
};

test('verdict views: whether a hint quotes numbers never depends on the verdict', () => {
  // (1) Step Algebra |…| equations in PAIRS that show the same numbers: A|mx + b| + K = C has
  // solutions, A|mx + b| + C = K (sides' constants swapped) has none. Both constants are
  // positive, so the two equations print exactly the same numbers.
  const docs = [];
  const pairs = [];
  for (const A of [1, 2, 3]) {
    for (const [m, b] of [[1, -1], [1, 4], [2, -3], [-1, 2], [3, 1]]) {
      for (const [K, C] of [[3, 5], [1, 7], [2, 8], [4, 10], [6, 9]]) {
        if ((C - K) % A !== 0) continue;
        const left = absEquationText(A, m, b, 0, 0).replace(/ = 0$/, '');
        docs.push(
          { standard: 'A2.6E', prompt: `Solve ${left} + ${K} = ${C}.`, studentActions: ['solveEquation'], equation: `${left} + ${K} = ${C}`, solveFor: 'x' },
          { standard: 'A2.6E', prompt: `Solve ${left} + ${C} = ${K}.`, studentActions: ['solveEquation'], equation: `${left} + ${C} = ${K}`, solveFor: 'x' },
        );
      }
    }
  }
  const compiled = v5(docs);
  for (let index = 0; index < compiled.length; index += 2) pairs.push([compiled[index], compiled[index + 1]]);
  assert.ok(pairs.length >= 40, `${pairs.length} pairs`);
  let plainWithSolutions = 0;
  for (const [solvable, none] of pairs) {
    assert.equal(family.questionKind(solvable), 'absEquation');
    assert.equal(absSolve(solvable.equation).length, 2, solvable.equation);
    assert.equal(absSolve(none.equation).length, 0, none.equation);
    assert.equal(signature(none), signature(solvable), `${solvable.equation} / ${none.equation}: the same spellings`);
    if (/P/.test(signature(solvable).split('|')[0])) plainWithSolutions += 1;
  }
  assert.ok(plainWithSolutions >= 5, `the pairs include equations whose solutions are shown numbers (${plainWithSolutions})`);
  // The whole corpus: every signature of a no-solution equation also occurs with solutions, and vice versa.
  const workspace = ITEMS.filter((item) => item.kind === 'absEquation' && item.truth.source === 'workspace');
  const sigs = (predicate) => new Set(workspace.filter(predicate).map((item) => signature(item.question)));
  const none = sigs((item) => TRUTH.get(item).solutions.length === 0);
  const some = sigs((item) => TRUTH.get(item).solutions.length > 0);
  for (const sig of none) assert.ok(some.has(sig), `no-solution signature ${sig} also occurs with solutions`);

  // (2) factorZero and equidistance: the hidden values (P(r), the two distances) could be any
  // number, so these views always use the plain spellings, for every verdict.
  for (const item of ITEMS.filter((entry) => entry.kind === 'factorZero' || entry.kind === 'parabolaEquidistance')) {
    assert.equal(signature(item.question), '4:PPPP|back:PPP', `${item.label}: plain spellings only`);
  }
  const P = [1, -5, 6];
  assert.equal(signature({ toolId: 'polynomialWorkshop', mode: 'factorZero', coefficients: P, candidateRoot: 2 }), signature({ toolId: 'polynomialWorkshop', mode: 'factorZero', coefficients: P, candidateRoot: 5 }), 'a factor and P(5) = 6 look alike');

  // (3) The parabola equation view: p and -p (opening one way or the other) look alike.
  for (const h of [-2, 0, 1, 2]) {
    for (const k of [-1, 0, 1, 2]) {
      for (const p of [0.5, 1, 1.5, 2]) {
        for (const orientation of ['vertical', 'horizontal']) {
          const up = { toolId: 'parabolaGeometryLab', mode: 'equation', h, k, p, orientation };
          assert.equal(signature(up), signature({ ...up, p: -p }), `h ${h}, k ${k}, p ±${p}, ${orientation}`);
        }
      }
    }
  }

  // (4) Every other verdict view: one signature per kind, whatever the verdict.
  for (const kind of ['graphConnection', 'rationalFeatures']) {
    const all = new Set(ITEMS.filter((item) => item.kind === kind).map((item) => signature(item.question)));
    assert.equal(all.size, 1, `${kind}: ${[...all].join(', ')}`);
  }
});

test('every statement a zeros hint makes about the coefficients is true', () => {
  const zeros = ITEMS.filter((item) => item.kind === 'zeros');
  let shares = 0;
  let acMethod = 0;
  for (const item of zeros) {
    const { a, b, c } = quadratic(rhsOf(promptMath(item.question.prompt)));
    for (const hint of family.hints(item.question)) {
      const factor = /shares the factor (-?[\d./]+):/.exec(hint);
      if (factor) {
        shares += 1;
        assert.ok(eq(F(factor[1]), a), `${item.label}: the factor named is a`);
        assert.ok(math.divide(b, a).d === 1n && math.divide(c, a).d === 1n, `${item.label}: "${hint}" is true`);
      }
      if (/shares the leading coefficient as a factor/.test(hint)) assert.ok(math.divide(b, a).d === 1n && math.divide(c, a).d === 1n, `${item.label}: "${hint}" is true`);
      const ac = /does not divide every term, so use the ac method(?:: a × c = (-?\d+)\. Look for two numbers whose product is (-?\d+) and whose sum is (-?\d+)\.)?/.exec(hint);
      if (ac) {
        acMethod += 1;
        assert.ok(math.divide(b, a).d !== 1n || math.divide(c, a).d !== 1n, `${item.label}: a really does not divide every term`);
        if (ac[1]) {
          assert.ok(eq(F(ac[1]), math.multiply(a, c)) && eq(F(ac[2]), math.multiply(a, c)) && eq(F(ac[3]), b), `${item.label}: "${hint}"`);
          // The two numbers exist: integers with that product and that sum.
          const disc = rationalSqrt(math.subtract(math.multiply(b, b), math.multiply(F(4), math.multiply(a, c))));
          assert.ok(disc && math.divide(math.add(b, disc), F(2)).d === 1n, `${item.label}: the ac numbers are integers`);
        }
      }
      if (/factor x out first/.test(hint)) assert.ok(isZeroF(c), `${item.label}: "${hint}" needs no constant term`);
    }
  }
  assert.ok(shares >= 50, `"shares the factor" is used where true (${shares})`);
  assert.ok(acMethod >= 2, `the ac method is used where a does not divide every term (${acMethod})`);
  const hintsFor = (prompt) => family.hints(ITEMS.find((item) => item.question.prompt === prompt).question).join(' ');
  assert.doesNotMatch(hintsFor('Find the zeros of $f(x) = 2x^2 - x - 3$.'), /shares the factor/);
  assert.doesNotMatch(hintsFor('Find the zeros of $f(x) = 4x^2 - 9$.'), /shares the factor/);
  assert.match(hintsFor('Find the zeros of $f(x) = 4x^2 - 9$.'), /no x-term/);
  assert.match(hintsFor('Find the zeros of $f(x) = 2x^2 - 5x$.'), /factor x out first/);
  assert.match(hintsFor('Find the zeros of $f(x) = 2x^2 - 4x - 6$.'), /shares the (factor 2|leading coefficient)/);
});

test('nothing for a question this family cannot read', () => {
  for (const question of [null, undefined, {}, { type: 'multiAnswer', prompt: 'Solve.' }, { toolId: 'parabolaGeometryLab', h: 'one' }]) {
    assert.equal(family.matches(question), false);
    assert.deepEqual(family.hints(question), []);
    assert.deepEqual(family.expectedValues(question), []);
    assert.equal(family.similarProblem(question, { seed: 0 }), null);
    assert.equal(family.backUpQuestion(question), null);
  }
});
