/*
 * JOB K — WORKED SOLUTIONS STUDENTS CAN TRUST: THE linesAndSlope FAMILY.
 *
 * Coordinator QA finding m9: on "A line passes through (0, 4) and (3, 2)"
 * (slope −2/3, y-intercept 4) the closed-question review panel showed only
 * "Slope: -2/3 / y-intercept: 4" under a heading promising steps — the item has
 * no authored solutionReview steps, no tool builder, and the family did not
 * even recognise it (it got the generic hint).
 *
 * Here:
 *   1. the two-points shape (a multiAnswer item, slope + y-intercept fields,
 *      optionally an x-intercept field) is recognised on the real items it
 *      comes from, and gets the family's hints, back-up step and sibling, none
 *      of which states the slope or an intercept in any spelling;
 *   2. workedSolution(question) explains THIS question for every shape the
 *      family recognises (two points, slope, intercepts, Graphing Lines,
 *      graphing2 in all six modes, the three table modes), over many seeded
 *      instances and the edge cases (zero and negative values, fractions,
 *      decimal keys, vertical and horizontal lines): every arithmetic chain in
 *      every step is recomputed with mathjs in exact fractions, each step's
 *      result is the oracle's value at that point of the chain, the last step
 *      states the key, and the SHARED grader (gradeMultiAnswerResponse /
 *      gradeToolWork, or the intercept orchestrator's own expected point)
 *      marks the stated answer right;
 *   3. closedQuestionReview.js turns it into the authored-shaped review only
 *      when the question has no reasoning steps of its own and no tool review
 *      with steps, keeps the author's answerSummary / commonError, and nothing
 *      that is shown while the item is open ever calls workedSolution.
 *
 * Every value is recomputed here independently of the family (mathjs Fraction
 * arithmetic from the points, rows and coefficients the question shows).
 *
 * Mutation-checked (each went red, then was restored byte-for-byte):
 *   - the two-points b step written as y₁ + m·x₁ → the arithmetic check of
 *     the b step fails;
 *   - the x-intercept step solved 0 = mx − b → the oracle check fails;
 *   - the closing "So the slope is …" step dropped → "one closing step after
 *     the chain" fails;
 *   - twoPointsModel dropped its key check (any two-point item claimed) → "the
 *     keys must be what the points give" fails;
 *   - the family's twoPoints expectedValues blinded → the "(0, 4)" label hint
 *     leaks and the hints test fails;
 *   - closedQuestionReview used the family review even when the author wrote
 *     steps → "authored steps are left alone" fails;
 *   - closedQuestionReview let the family's answerSummary beat the author's →
 *     the same test fails;
 *   - closedQuestionReview added the family review on top of a tool review
 *     with steps → "a tool review with steps keeps the floor" fails;
 *   - the table repair summary no longer said the corrected table is linear →
 *     the linearTableWorkbench grader rejects the classification;
 *   - one interval fewer than the table's requiredComparisons → the
 *     linearTableWorkbench test fails;
 *   - the Graphing Lines answer stated as a fraction ("1/2") with the exact
 *     Number() guard removed → the graphing grader rejects it;
 *   - the graph-only second point chosen without the window, or the
 *     y-intercept read when it is off the graph → "on the graph shown" and
 *     the off-window null checks fail;
 *   - the equation-shown slope step naming b, and the graph-only rise step
 *     stating the run → the per-step Graphing Lines checks fail;
 *   - solvedFor writing a fraction divisor without parentheses ("6 ÷ 3/2") →
 *     the intercept arithmetic and the fraction-divisor test fail;
 *   - the family headline beating an authored headline → the authored
 *     headline test fails;
 *   - the two-points hints naming decimal points as fractions → "spelled the
 *     way the prompt prints it" fails;
 *   - the tool-review rule applied only when the caller flags a tool question
 *     → the unflagged (SolutionReview2-style) graphing2 call fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as linesAndSlope from '../../src/platform/supports/families/linesAndSlope.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { hintRevealsAnswer, buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { expectedInterceptPoint, resolveStandardCoefficients } from '../../functions/shared/toolMath/stepAlgebra2/linearInterceptsMath.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const readJson = (path) => JSON.parse(read(path));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const eq = (a, b) => math.equal(F(a), F(b));
const fracText = (value) => {
  const f = F(value);
  const sign = Number(f.s) < 0 && f.n !== 0n ? '-' : '';
  return f.d === 1n ? `${sign}${f.n}` : `${sign}${f.n}/${f.d}`;
};
const terminating = (value) => {
  let d = F(value).d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
};
const decimal = (value) => String(math.number(F(value)));

const through = ([x1, y1], [x2, y2]) => {
  if (eq(x1, x2)) return { vertical: true, x: F(x1) };
  const m = math.divide(math.subtract(F(y2), F(y1)), math.subtract(F(x2), F(x1)));
  return { m, b: math.subtract(F(y1), math.multiply(m, F(x1))) };
};
const onLine = (line, [x, y]) => (line.vertical ? eq(x, line.x) : eq(y, math.add(math.multiply(line.m, F(x)), line.b)));
const sameLine = (a, b) => (a.vertical || b.vertical ? Boolean(a.vertical && b.vertical && eq(a.x, b.x)) : eq(a.m, b.m) && eq(a.b, b.b));
const NUM = '-?\\d+(?:\\.\\d+)?(?:\\/\\d+)?';
const pointsIn = (value) => [...String(value).replace(/−/g, '-').matchAll(new RegExp(`\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)`, 'g'))].map((match) => [F(match[1]), F(match[2])]);
const samePoint = (a, b) => eq(a[0], b[0]) && eq(a[1], b[1]);

/** A line written as y = …, x = … or Ax + By = C, read by evaluating it. */
const lineOf = (written) => {
  const sides = written.replace(/−/g, '-').trim().split('=');
  const expression = `(${sides[0]}) - (${sides[1]})`.replace(/(\d)\s*([xy(])/g, '$1*$2').replace(/\)\s*([xy(])/g, ')*$1');
  const at = (x, y) => F(math.evaluate(expression, { x: F(x), y: F(y) }));
  const constant = at(0, 0);
  const A = math.subtract(at(1, 0), constant);
  const B = math.subtract(at(0, 1), constant);
  assert.ok(math.equal(at(2, 3), math.add(math.add(math.multiply(A, 2), math.multiply(B, 3)), constant)), `${written} is a line`);
  if (math.equal(B, 0)) return { vertical: true, x: math.divide(math.unaryMinus(constant), A) };
  return { m: math.divide(math.unaryMinus(A), B), b: math.divide(math.unaryMinus(constant), B) };
};

/** Every number a text states, signed: "- 5" is −5. Subscripts are not numbers. */
const numbersIn = (value) => [...String(value).replace(/[−–]/g, '-').replace(/[₀-₉]/g, '')
  .matchAll(/(-\s*)?(?:\\frac\{(\d+)\}\{(\d+)\}|(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?|\.\d+))/g)]
  .map((match) => {
    const magnitude = match[2] ? F(`${match[2]}/${match[3]}`) : match[4] ? F(`${match[4]}/${match[5]}`) : F(match[6]);
    return match[1] ? math.unaryMinus(magnitude) : magnitude;
  });

/** "(8 - 12) ÷ (1 - (-1)) = -4 ÷ 2 = -2": every all-number chain in a step holds. Returns how many it checked. */
const assertArithmetic = (label, step) => {
  let checked = 0;
  const source = String(step).replace(/−/g, '-');
  for (const match of source.matchAll(/[-\d\s().\/÷×+]*\d[-\d\s().\/÷×+]*(?:=[-\d\s().\/÷×+]*\d[-\d\s().\/÷×+]*)+/g)) {
    if (/[A-Za-z)₁₂]$/.test(source.slice(0, match.index).trimEnd()) || /^\s*[+-]\s/.test(match[0])) continue;
    const parts = match[0].split('=').map((part) => part.trim()).filter(Boolean);
    let values;
    try { values = parts.map((part) => F(math.evaluate(part.replace(/÷/g, '/').replace(/×/g, '*')))); } catch { continue; }
    values.forEach((value) => assert.ok(math.equal(value, values[0]), `${label}: "${parts.join(' = ')}" in "${step}"`));
    checked += 1;
  }
  return checked;
};
/** The value a step ends on: the last "= v" before its full stop. */
const finalValue = (step) => {
  const match = new RegExp(`=\\s*(${NUM})\\.?$`).exec(String(step).trim());
  return match ? F(match[1]) : null;
};

const HYGIENE = [/\+\s*-/, /-\s*-(?!\))/, /\+\s*\+/, /(^|[^\d.\\{/])1(?=[a-z](?![a-z]))/, /NaN|Infinity|null|\[object/, /(^|[=(,$]\s*)-\s*0(?![.\d])/, /\{-/];
const assertClean = (label, line, { mayBeUndefined = false } = {}) => {
  HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: "${line}"`));
  if (!mayBeUndefined) assert.doesNotMatch(line, /undefined/, `${label}: "${line}"`);
};

/* ------------------------------------------------------------ the two-points items */

const ROLE = { slope: 'Slope', yIntercept: 'y-intercept', xIntercept: 'x-intercept' };
/** What a line gives for a role: { value, point } | { none } | null. */
const truthFor = (line, role) => {
  if (line.vertical) {
    if (role === 'slope') return { none: true };
    if (role === 'yIntercept') return eq(line.x, 0) ? null : { none: true };
    return { value: line.x, point: [line.x, F(0)] };
  }
  if (role === 'slope') return { value: line.m };
  if (role === 'yIntercept') return { value: line.b, point: [F(0), line.b] };
  if (eq(line.m, 0)) return eq(line.b, 0) ? null : { none: true };
  const zero = math.divide(math.unaryMinus(line.b), line.m);
  return { value: zero, point: [zero, F(0)] };
};

// Real items of this shape (each copied from where it is authored; the
// source is checked to still hold it).
const REAL_TWO_POINTS = [
  {
    source: 'tests/browser/teacherWorkflow/fixture.js',
    needle: "prompt: 'A line passes through (0, 4) and (3, 2).', answerFields: [{ id: 'm', label: 'Slope', answer: '-2/3' }, { id: 'b', label: 'y-intercept', answer: '4' }]",
    question: { questionId: 'fixture-c2', activityRole: 'classwork', type: 'multiAnswer', prompt: 'A line passes through (0, 4) and (3, 2).', answerFields: [{ id: 'm', label: 'Slope', answer: '-2/3' }, { id: 'b', label: 'y-intercept', answer: '4' }] },
  },
  {
    source: 'tests/browser/assessmentLeakGatesMain.jsx',
    needle: "prompt: 'A line passes through (0, 1) and (2, 5). Find its slope and its y-intercept.'",
    question: { questionId: 'leak-gates-feedback-partial', type: 'multiAnswer', prompt: 'A line passes through (0, 1) and (2, 5). Find its slope and its y-intercept.', answerFields: [{ id: 'slope', label: 'LEAKCHECK-PART Slope', answer: '2', inputProfile: 'text' }, { id: 'intercept', label: 'LEAKCHECK-PART y-intercept', answer: '1', inputProfile: 'text' }] },
  },
  {
    source: 'tests/browser/reviewMyWorkMain.jsx',
    needle: "prompt: 'The line through $(0, 2)$ and $(4, 4)$: give its slope and its $y$-intercept.'",
    question: { questionId: 'q-multi', type: 'multiAnswer', prompt: 'The line through $(0, 2)$ and $(4, 4)$: give its slope and its $y$-intercept.', answerFields: [{ id: 'slope', label: 'Slope', acceptedAnswers: ['1/2'] }, { id: 'intercept', label: 'y-intercept', acceptedAnswers: ['2'] }] },
  },
];
const v5 = (questions) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Lines and slope', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  sections: [{ role: 'classwork', questions }],
}).package.sections[0].questions;
// tests/browser/studentUxPlatformMain.jsx authors this through V5 multipleResponses.
const UX_MULTI = { standard: 'A.3B', prompt: 'A line passes through (0, 4) and (3, 2). Answer each part.', studentActions: ['multipleResponses'], responses: [{ id: 'm', label: 'Slope', answer: '-2/3' }, { id: 'b', label: 'y-intercept', answer: '4' }, { id: 'x', label: 'x-intercept', answer: '6' }] };

const TWO_POINTS = [];
const addTwoPoints = (label, question, points, roles) => {
  const line = through(...points);
  TWO_POINTS.push({ label, question, points, line, roles });
};
REAL_TWO_POINTS.forEach(({ question }) => addTwoPoints(`real ${question.questionId}`, question, pointsIn(question.prompt), ['slope', 'yIntercept']));
addTwoPoints('real V5 ux-multi', v5([UX_MULTI])[0], [[F(0), F(4)], [F(3), F(2)]], ['slope', 'yIntercept', 'xIntercept']);

// Seeded instances of the same shape, every edge the shape has.
const prng = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const keyText = (truth, role, { asDecimal, asPair }) => {
  if (truth.none) return role === 'slope' ? 'undefined' : 'none';
  if (asPair && truth.point) return `(${fracText(truth.point[0])}, ${fracText(truth.point[1])})`;
  return asDecimal && terminating(truth.value) ? decimal(truth.value) : fracText(truth.value);
};
for (let seed = 1; seed <= 120; seed += 1) {
  const random = prng(seed * 7919);
  const int = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const shape = seed % 8;
  let first = [F(int(-9, 9)), F(int(-9, 9))];
  let second = [F(int(-9, 9)), F(int(-9, 9))];
  if (shape === 1) first = [F(0), F(int(-9, 9))]; // a point on the y-axis
  if (shape === 2) second = [math.add(first[0], F(int(1, 4) * 3)), math.add(first[1], F(int(-5, 5) * 2 + 1))]; // a fraction slope
  if (shape === 3) second = [math.add(first[0], F(int(1, 6))), first[1]]; // horizontal
  if (shape === 4) second = [first[0], math.add(first[1], F(int(1, 6)))]; // vertical
  if (shape === 5) { first = [F(int(-6, 6) / 2), F(int(-6, 6) / 2)]; second = [math.add(first[0], F(int(1, 4) / 2)), F(int(-6, 6) / 2)]; } // decimals
  if (shape === 6) { first = [F(-int(1, 9)), F(-int(1, 9))]; second = [F(-int(1, 9)), F(-int(1, 9))]; } // negatives
  if (samePoint(first, second)) continue;
  const line = through(first, second);
  const roles = seed % 3 === 0 || shape === 3 || shape === 4 ? ['slope', 'yIntercept', 'xIntercept'] : ['slope', 'yIntercept'];
  if (seed % 4 === 1) roles.reverse();
  const truths = roles.map((role) => truthFor(line, role));
  if (truths.some((truth) => !truth)) continue; // the y-axis itself, or y = 0 asked for an x-intercept
  const asDecimal = seed % 5 === 0;
  const asPair = shape === 7;
  const fields = roles.map((role, index) => ({
    id: { slope: 'm', yIntercept: 'b', xIntercept: 'x' }[role],
    label: ROLE[role],
    answer: keyText(truths[index], role, { asDecimal, asPair: asPair && role !== 'slope' }),
    ...(asPair && role !== 'slope' && !truths[index].none ? { answerFormat: 'orderedPair' } : {}),
  }));
  const pointsText = `(${decimalOr(first[0])}, ${decimalOr(first[1])}) and (${decimalOr(second[0])}, ${decimalOr(second[1])})`;
  const ask = `Find its ${roles.map((role) => ROLE[role].toLowerCase()).join(', ')}.`;
  let question;
  if (seed % 6 === 2) {
    question = { questionId: `two-points-${seed}`, type: 'multiAnswer', prompt: `A line passes through the two points shown. ${ask}`, givenPoints: [first, second].map(([x, y]) => [math.number(x), math.number(y)]), answerFields: fields };
  } else if (seed % 6 === 3) {
    question = v5([{ standard: 'A.3B', prompt: `The line through $${pointsText.replace(' and ', '$ and $')}$. ${ask}`, studentActions: ['multipleResponses'], responses: fields }])[0];
  } else {
    question = { questionId: `two-points-${seed}`, type: 'multiAnswer', prompt: `A line passes through ${pointsText}. ${ask}`, answerFields: fields };
  }
  addTwoPoints(`seeded two-points #${seed} (shape ${shape})`, question, [first, second], roles);
}
function decimalOr(value) { return terminating(value) ? decimal(value) : fracText(value); }

/** Every spelling of every hidden value of a two-points item, for the leak checks. */
const hiddenOf = ({ line, roles }) => roles.map((role) => truthFor(line, role)).filter((truth) => !truth.none).map((truth) => truth.value);
const spellings = (value) => {
  const out = [fracText(value)];
  if (terminating(value)) out.push(decimal(value));
  if (F(value).d !== 1n) out.push(`${Number(F(value).s) < 0 ? '-' : ''}\\frac{${F(value).n}}{${F(value).d}}`);
  return [...new Set(out.flatMap((entry) => (entry.includes('-') ? [entry, entry.replace(/-/g, '−')] : [entry])))];
};
const answerTexts = (item) => {
  const out = hiddenOf(item).flatMap(spellings);
  if (!item.line.vertical) out.push(`(0, ${fracText(item.line.b)})`, `(0,${fracText(item.line.b)})`);
  return out;
};

/* ------------------------------------------------------------ 1. recognition, hints, back-up, sibling */

test('the real two-points items are still authored where this file says', () => {
  REAL_TWO_POINTS.forEach(({ source, needle }) => assert.ok(read(source).includes(needle), `${source} still holds ${needle}`));
  assert.ok(read('tests/browser/studentUxPlatformMain.jsx').includes("prompt: 'A line passes through (0, 4) and (3, 2). Answer each part.'"));
});

test('two-points items are owned by linesAndSlope, with the family hints, back-up and sibling, none stating an answer', () => {
  assert.ok(TWO_POINTS.length >= 90, `${TWO_POINTS.length} two-points items`);
  let siblings = 0;
  for (const item of TWO_POINTS) {
    const { label, question } = item;
    assert.equal(familyFor(question)?.family, 'linesAndSlope', `${label}: owned by linesAndSlope`);
    const hints = linesAndSlope.hints(question);
    assert.ok(hints.length >= 3, `${label}: family hints`);
    const built = buildQuestionHints(question);
    hints.forEach((hint) => assert.ok(built.some((entry) => entry.text === hint && entry.source === 'family'), `${label}: the platform ladder carries "${hint}"`));
    // A point a hint names is spelled the way the prompt prints it (1.5, not 3/2).
    const printed = String(question.prompt).replace(/\$/g, '');
    if (pointsIn(printed).length) hints.forEach((hint) => (hint.match(/\(-?[\d./]+, -?[\d./]+\)/g) || []).forEach((point) => assert.ok(printed.includes(point), `${label}: "${point}" in "${hint}" is printed in "${printed}"`)));
    const backUp = backUpStepFor(question);
    assert.equal(backUp.source, 'family', `${label}: the family back-up step`);
    const hidden = hiddenOf(item);
    const texts = answerTexts(item);
    const told = [...hints, backUp.prompt, ...backUp.options];
    told.forEach((line) => {
      assert.equal(hintRevealsAnswer(line, texts), false, `${label}: "${line}" reveals an answer`);
      assert.ok(!numbersIn(line).some((number) => hidden.some((value) => math.equal(number, value))), `${label}: "${line}" states one of ${hidden.map(fracText)}`);
      assertClean(label, line);
    });
    for (const seed of [0, 3]) {
      const sibling = linesAndSlope.similarProblem(question, { seed });
      if (!sibling) continue;
      siblings += 1;
      assert.equal(similarExampleIsSafe(question, sibling), true, `${label}: similarExampleIsSafe`);
      // Re-solved from its own prompt.
      const [a, b] = pointsIn(sibling.prompt);
      const own = through(a, b);
      assert.ok(!own.vertical);
      const stated = Object.fromEntries(sibling.answer.split(';').map((part) => part.split(':').map((entry) => entry.trim())));
      assert.ok(eq(stated.Slope, own.m) && eq(stated['y-intercept'], own.b), `${label}: sibling ${sibling.answer} for ${sibling.prompt}`);
      if (stated['x-intercept']) assert.ok(onLine(own, [F(stated['x-intercept']), F(0)]), `${label}: sibling x-intercept`);
      sibling.steps.forEach((step) => assertArithmetic(`${label} sibling`, step));
      [sibling.prompt, ...sibling.steps, sibling.answer].forEach((line) => {
        assert.ok(!numbersIn(line).some((number) => hidden.some((value) => math.equal(number, value))), `${label}: sibling "${line}" states one of ${hidden.map(fracText)}`);
        assertClean(`${label} sibling`, line);
      });
    }
  }
  // A horizontal line's answer is 0, which every sibling step needs: those fall back to the generic help.
  assert.ok(siblings >= TWO_POINTS.length, `${siblings} siblings for ${TWO_POINTS.length} items`);
});

test('two-points: the keys must be what the points give, or the item is not claimed', () => {
  const base = REAL_TWO_POINTS[0].question;
  assert.equal(linesAndSlope.matches(base), true);
  const wrongSlope = { ...base, answerFields: [{ id: 'm', label: 'Slope', answer: '2/3' }, base.answerFields[1]] };
  const wrongIntercept = { ...base, answerFields: [base.answerFields[0], { id: 'b', label: 'y-intercept', answer: '2' }] };
  const threePoints = { ...base, prompt: 'A line passes through (0, 4), (3, 2) and (6, 0).' };
  const unknownField = { ...base, answerFields: [...base.answerFields, { id: 'area', label: 'Area', answer: '12' }] };
  const notALine = { ...base, prompt: 'A parabola passes through (0, 4) and (3, 2).' };
  const choice = { ...base, answerFields: [{ ...base.answerFields[0], options: ['-2/3', '2/3'] }, base.answerFields[1]] };
  const verticalWithNumbers = { type: 'multiAnswer', prompt: 'A line passes through (2, 1) and (2, 5).', answerFields: [{ id: 'm', label: 'Slope', answer: '0' }, { id: 'b', label: 'y-intercept', answer: '2' }] };
  for (const question of [wrongSlope, wrongIntercept, threePoints, unknownField, notALine, choice, verticalWithNumbers]) {
    assert.equal(linesAndSlope.matches(question), false, question.prompt);
    assert.equal(linesAndSlope.workedSolution(question), null);
  }
  // A key its own grader cannot accept ("none" in an ordered-pair box) is not explained.
  const horizontal = { type: 'multiAnswer', prompt: 'A line passes through (1, -4) and (5, -4).', answerFields: [{ id: 'm', label: 'Slope', answer: '0' }, { id: 'b', label: 'y-intercept', answer: '-4' }, { id: 'x', label: 'x-intercept', answer: 'none' }] };
  assert.ok(linesAndSlope.workedSolution(horizontal));
  assert.equal(linesAndSlope.workedSolution({ ...horizontal, answerFields: [...horizontal.answerFields.slice(0, 2), { ...horizontal.answerFields[2], answerFormat: 'orderedPair' }] }), null);
  // Structured points must agree with any the prompt prints.
  assert.equal(linesAndSlope.matches({ ...base, givenPoints: [[1, 1], [3, 2]] }), false);
  assert.equal(linesAndSlope.matches({ ...base, givenPoints: [[0, 4], [3, 2]] }), true);
});

/* ------------------------------------------------------------ 2. workedSolution, two points */

const answerSummaryParts = (summary) => Object.fromEntries(summary.split(';').map((part) => {
  const index = part.indexOf(':');
  return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
}));
const roleById = (question) => Object.fromEntries((question.answerFields || []).map((field) => [field.id, /x.?intercept/i.test(`${field.id} ${field.label}`) ? 'xIntercept' : /intercept|\bb\b/i.test(`${field.id} ${field.label}`) ? 'yIntercept' : 'slope']));

const assertTwoPointSteps = (label, steps, [first, second], line, roles) => {
  const vertical = Boolean(line.vertical);
  steps.forEach((step) => assertClean(label, step, { mayBeUndefined: vertical }));
  steps.forEach((step) => assertArithmetic(label, step));
  // 1: the labelled points are this question's points, in order.
  const labelled = pointsIn(steps[0]);
  assert.ok(labelled.length === 2 && samePoint(labelled[0], first) && samePoint(labelled[1], second), `${label}: ${steps[0]}`);
  // 2, 3: the changes, from those points.
  assert.match(steps[1], /^Change in y: y₂ - y₁ = /);
  assert.ok(eq(finalValue(steps[1]), math.subtract(second[1], first[1])), `${label}: ${steps[1]}`);
  assert.match(steps[2], /^Change in x: x₂ - x₁ = /);
  assert.ok(eq(finalValue(steps[2]), math.subtract(second[0], first[0])), `${label}: ${steps[2]}`);
  // 4: the slope is change in y over change in x.
  let index = 3;
  if (vertical) {
    assert.match(steps[index], /÷ 0, and dividing by zero is undefined: the slope is undefined/, `${label}: ${steps[index]}`);
    const said = new RegExp(`vertical line (x = ${NUM})\\.$`).exec(steps[index]);
    assert.ok(said && eq(lineOf(said[1]).x, line.x), `${label}: ${steps[index]}`);
  } else {
    const slopeMatch = new RegExp(`^Slope m = (.+?) = (${NUM})(?::.*|\\.)$`).exec(steps[index]);
    assert.ok(slopeMatch, `${label}: ${steps[index]}`);
    assert.ok(eq(F(math.evaluate(slopeMatch[1].replace(/÷/g, '/'))), line.m) && eq(slopeMatch[2], line.m), `${label}: ${steps[index]}`);
  }
  index += 1;
  if (roles.some((role) => role !== 'slope')) {
    if (vertical) {
      assert.match(steps[index], /never crosses the y-axis: there is no y-intercept\.$/, `${label}: ${steps[index]}`);
      index += 1;
    } else {
      // b, from the slope just found and a point: the step ends on the oracle's b, and any m it uses is that slope.
      const usedM = new RegExp(`m = (${NUM})`).exec(steps[index]);
      if (usedM && !/^Slope/.test(steps[index])) assert.ok(eq(usedM[1], line.m), `${label}: ${steps[index]} uses the slope`);
      assert.ok(eq(finalValue(steps[index]), line.b), `${label}: ${steps[index]} ends on b = ${fracText(line.b)}`);
      index += 1;
      const equation = /^So the line is (.+)\.$/.exec(steps[index]);
      assert.ok(equation && sameLine(lineOf(equation[1]), line), `${label}: ${steps[index]}`);
      index += 1;
    }
  }
  if (roles.includes('xIntercept')) {
    const truth = truthFor(line, 'xIntercept');
    if (truth.none) assert.match(steps[index], /there is no x-intercept\.$/, `${label}: ${steps[index]}`);
    else if (vertical) assert.ok(samePoint(pointsIn(steps[index])[0], truth.point), `${label}: ${steps[index]}`);
    else assert.ok(eq(finalValue(steps[index]), truth.value), `${label}: ${steps[index]}`);
    index += 1;
  }
  assert.equal(index, steps.length - 1, `${label}: one closing step after the chain`);
  return steps[index];
};

test('two points: the worked solution is this line, step by step, ending on the key the grader accepts', () => {
  // The sweep covers every edge of the shape.
  const count = (predicate) => TWO_POINTS.filter(predicate).length;
  assert.ok(count((item) => item.line.vertical) >= 5, 'vertical lines');
  assert.ok(count((item) => !item.line.vertical && eq(item.line.m, 0)) >= 5, 'horizontal lines');
  assert.ok(count((item) => !item.line.vertical && F(item.line.m).d !== 1n) >= 20, 'fraction slopes');
  assert.ok(count((item) => !item.line.vertical && Number(F(item.line.m).s) < 0) >= 20, 'negative slopes');
  assert.ok(count((item) => !item.line.vertical && eq(item.line.b, 0)) >= 1, 'a line through the origin');
  assert.ok(count((item) => item.points.some(([x]) => eq(x, 0))) >= 10, 'a point on the y-axis');
  assert.ok(count((item) => item.roles.includes('xIntercept')) >= 30, 'x-intercept asked');
  assert.ok(count((item) => item.question.givenPoints) >= 10 && count((item) => item.question.studentActions) >= 10, 'structured points and V5 items');
  assert.ok(count((item) => item.question.answerFields.some((field) => field.answerFormat === 'orderedPair')) >= 5, 'ordered-pair keys');
  assert.ok(count((item) => item.question.answerFields.some((field) => /\d\.\d/.test(field.answer))) >= 5, 'decimal keys');
  for (const item of TWO_POINTS) {
    const { label, question, points, line } = item;
    const worked = linesAndSlope.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    const roles = (question.answerFields || []).map((field) => roleById(question)[field.id]);
    assert.deepEqual(roles, item.roles, `${label}: the roles this file authored`);
    const last = assertTwoPointSteps(label, worked.steps, points, line, roles);
    // The stated answers: the oracle's values, marked right by the shared multiAnswer grader.
    const stated = answerSummaryParts(worked.answerSummary);
    const response = {};
    for (const field of question.answerFields) {
      const role = roleById(question)[field.id];
      const value = stated[ROLE[role]];
      assert.ok(value, `${label}: ${ROLE[role]} is stated`);
      assert.ok(last.includes(value), `${label}: the last step states ${value}: ${last}`);
      const truth = truthFor(line, role);
      if (truth.none) assert.match(value, /^(undefined|none)$/);
      else if (pointsIn(value).length) assert.ok(samePoint(pointsIn(value)[0], truth.point), `${label}: ${value}`);
      else assert.ok(eq(value, truth.value), `${label}: ${ROLE[role]} ${value} is ${fracText(truth.value)}`);
      response[field.id] = value;
    }
    const graded = gradeMultiAnswerResponse(question, response);
    assert.equal(graded.isCorrect, true, `${label}: the grader accepts ${JSON.stringify(response)}`);
    assertClean(label, worked.answerSummary, { mayBeUndefined: Boolean(line.vertical) });
  }
});

test('m9: "A line passes through (0, 4) and (3, 2)" reviews with real steps once closed', () => {
  const [fixture] = REAL_TWO_POINTS;
  const review = buildClosedQuestionReview({ question: fixture.question, legacyContent: () => ({ hasContent: true }) });
  assert.equal(review.fromFamily, true);
  assert.deepEqual(review.authored.reasoning, [
    'Label (x₁, y₁) = (0, 4) and (x₂, y₂) = (3, 2).',
    'Change in y: y₂ - y₁ = 2 - 4 = -2.',
    'Change in x: x₂ - x₁ = 3 - 0 = 3.',
    'Slope m = -2 ÷ 3 = -2/3.',
    '(0, 4) has x-coordinate 0, so it is where the line crosses the y-axis: b = 4.',
    'So the line is y = (-2/3)x + 4.',
    'So the slope is -2/3 and the y-intercept is 4.',
  ]);
  assert.equal(review.authored.answerSummary, 'Slope: -2/3; y-intercept: 4');
  review.authored.reasoning.forEach((step) => assert.ok(review.speechText.includes(step), `read aloud: ${step}`));
  // With the x-intercept asked as well (the V5 item), and a vertical and a horizontal line.
  const ux = linesAndSlope.workedSolution(v5([UX_MULTI])[0]);
  assert.equal(ux.steps.at(-2), 'x-intercept: set y = 0, so 0 = (-2/3)x + 4 and x = -4 ÷ (-2/3) = 6.');
  assert.equal(ux.answerSummary, 'Slope: -2/3; y-intercept: 4; x-intercept: 6');
  const vertical = linesAndSlope.workedSolution({ type: 'multiAnswer', prompt: 'A line passes through (2, 1) and (2, 5).', answerFields: [{ id: 'm', label: 'Slope', answer: 'undefined' }, { id: 'b', label: 'y-intercept', answer: 'none' }] });
  assert.equal(vertical.answerSummary, 'Slope: undefined; y-intercept: none');
  assert.equal(vertical.steps.at(-1), 'So the slope is undefined and there is no y-intercept (none).');
  const horizontal = linesAndSlope.workedSolution({ type: 'multiAnswer', prompt: 'A line passes through (-1, 3) and (4, 3).', answerFields: [{ id: 'm', label: 'Slope', answer: '0' }, { id: 'b', label: 'y-intercept', answer: '3' }, { id: 'x', label: 'x-intercept', answer: 'none' }] });
  assert.equal(horizontal.steps[3], 'Slope m = 0 ÷ 5 = 0: y does not change, so the line is horizontal.');
  assert.equal(horizontal.answerSummary, 'Slope: 0; y-intercept: 3; x-intercept: none');
});

/* ------------------------------------------------------------ 3. workedSolution, every other shape */

const seat = (slot, index, storageIndex = 0) => {
  const resolved = resolveFamilyQuestionInstance({ question: slot, assignmentId: 'k-steps-lines', storageIndex, allocation: { seat: index, variant: 0, stride: 300, index, basis: 'seated' } });
  assert.equal(resolved.error, null);
  return resolved;
};

test('slope from two points (linear.slopeFromPoints, every slope form, and the recovery sample): steps end on the key', () => {
  const items = [];
  for (let index = 0; index < 30; index += 1) {
    for (const slopeForm of ['integer', 'fraction', 'any']) {
      const { question, instance: { values } } = seat({ questionId: `k-slope-${slopeForm}`, type: 'multiAnswer', questionFamily: { id: 'linear.slopeFromPoints', version: 1, tool: 'multiAnswer', constraints: { slopeForm } } }, index, 1);
      items.push({ label: `slopeFromPoints ${slopeForm} #${index}`, question, points: [[F(values.x1), F(values.y1)], [F(values.x2), F(values.y2)]], m: math.divide(F(values.rise), F(values.run)) });
    }
  }
  const recovery = readJson('SAMPLE_QUESTION_FAMILY_RECOVERY.json');
  [0, 4, 8, 12].forEach((index) => {
    const { question, instance: { values } } = seat(recovery.sections[1].questions[1], index, 1);
    items.push({ label: `recovery slope #${index}`, question, points: [[F(values.x1), F(values.y1)], [F(values.x2), F(values.y2)]], m: math.divide(F(values.rise), F(values.run)) });
  });
  let zero = 0;
  for (const { label, question, points, m } of items) {
    const worked = linesAndSlope.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    const last = assertTwoPointSteps(label, worked.steps, points, { m, b: F(0) }, ['slope']);
    const value = answerSummaryParts(worked.answerSummary).Slope;
    assert.ok(eq(value, m) && last.includes(value), `${label}: ${worked.answerSummary}`);
    const field = question.answerFields.find((entry) => /slope|\bm\b/i.test(`${entry.id} ${entry.label}`));
    assert.equal(gradeMultiAnswerResponse({ ...question, answerFields: [field] }, { [field.id]: value }).isCorrect, true, `${label}: graded right`);
    if (eq(m, 0)) zero += 1;
  }
  assert.ok(items.length >= 90, `${items.length} slope items (${zero} with slope 0)`);
});

test('intercepts (identifyIntercepts, the recovery sample, the Step Algebra orchestrator): each intercept from setting the other variable to 0', () => {
  const items = [];
  for (let index = 0; index < 30; index += 1) {
    const { question, instance: { values } } = seat({ questionId: 'k-int', type: 'multiAnswer', questionFamily: { id: 'functions.identifyIntercepts', version: 1, tool: 'multiAnswer' } }, index, 2);
    items.push({ label: `identifyIntercepts #${index}`, question, xInt: [F(values.p), F(0)], yInt: [F(0), F(values.q)] });
  }
  const recovery = readJson('SAMPLE_QUESTION_FAMILY_RECOVERY.json');
  [0, 4, 8].forEach((index) => {
    const { question, instance: { values } } = seat(recovery.sections[0].questions[0], index, 0);
    items.push({ label: `recovery intercepts #${index}`, question, xInt: [F(values.p), F(0)], yInt: [F(0), F(values.q)] });
  });
  const workspace = [
    ...v5([
      { standard: 'A.3C', prompt: 'Find the x- and y-intercepts of 3x + 4y = 24.', studentActions: ['interactiveAlgebra'], mode: 'linearIntercepts', equation: '3x + 4y = 24' },
      { standard: 'A.3C', prompt: 'Find both intercepts of 2x - 5y = 10.', studentActions: ['stepAlgebra2'], mode: 'linearIntercepts', equation: '2x - 5y = 10' },
      { standard: 'A.3C', prompt: 'Find both intercepts of 6x + 4y = -12.', studentActions: ['stepAlgebra2'], mode: 'linearIntercepts', equation: '6x + 4y = -12' },
    ]),
    ...[[3, 4, 24], [2, -5, 10], [-1, 3, 9], [5, 1, -10], [-4, -6, 12], [1.5, 2, 6], [0.5, -0.25, 3]].map(([A, B, C]) => ({ type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A, B, C }, prompt: 'Find both intercepts.' })),
  ];
  workspace.forEach((question, index) => {
    const standard = resolveStandardCoefficients(question);
    items.push({ label: `linearIntercepts ${index}`, question, xInt: [math.divide(F(standard.C), F(standard.A)), F(0)], yInt: [F(0), math.divide(F(standard.C), F(standard.B))], workspace: true });
  });
  let fractionDivisors = 0;
  for (const { label, question, xInt, yInt, workspace: isWorkspace } of items) {
    const worked = linesAndSlope.workedSolution(question);
    // A fraction divisor is one factor: "6 ÷ (3/2)", never "6 ÷ 3/2" (which reads as (6 ÷ 3)/2).
    if (worked) fractionDivisors += worked.steps.filter((step) => /÷ \(-?\d+\/\d+\)/.test(step)).length;
    assert.ok(worked, `${label}: a worked solution`);
    worked.steps.forEach((step) => { assertClean(label, step); assertArithmetic(label, step); });
    assert.ok(samePoint(pointsIn(worked.steps[0]).at(-1), xInt), `${label}: ${worked.steps[0]}`);
    assert.ok(samePoint(pointsIn(worked.steps[1]).at(-1), yInt), `${label}: ${worked.steps[1]}`);
    const stated = answerSummaryParts(worked.answerSummary);
    assert.ok(worked.steps.at(-1).includes(stated['x-intercept']) && worked.steps.at(-1).includes(stated['y-intercept']), `${label}: the last step states the answer`);
    if (isWorkspace) {
      // Client graded: the orchestrator's own expected points.
      const standard = resolveStandardCoefficients(question);
      const [ex, ey] = [expectedInterceptPoint(standard, 'x'), expectedInterceptPoint(standard, 'y')];
      assert.ok(samePoint(pointsIn(stated['x-intercept'])[0], [F(ex.x ?? ex[0]), F(ex.y ?? ex[1])]), `${label}: x-intercept ${stated['x-intercept']}`);
      assert.ok(samePoint(pointsIn(stated['y-intercept'])[0], [F(ey.x ?? ey[0]), F(ey.y ?? ey[1])]), `${label}: y-intercept ${stated['y-intercept']}`);
    } else {
      const xField = question.answerFields.find((field) => /x.?intercept/i.test(`${field.id} ${field.label}`));
      const yField = question.answerFields.find((field) => /y.?intercept/i.test(`${field.id} ${field.label}`));
      const graded = gradeMultiAnswerResponse(question, { [xField.id]: stated['x-intercept'], [yField.id]: stated['y-intercept'] });
      assert.equal(graded.isCorrect, true, `${label}: graded right: ${worked.answerSummary}`);
    }
  }
  assert.ok(fractionDivisors >= 3, `${fractionDivisors} steps divide by a fraction`);
});

test('intercepts: a fractional coefficient is divided as one factor', () => {
  const worked = linesAndSlope.workedSolution({ type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 1.5, B: 2, C: 6 }, prompt: 'Find both intercepts.' });
  assert.match(worked.steps[0], /x = 6 ÷ \(3\/2\) = 4\./);
  assert.equal(assertArithmetic('fraction divisor', worked.steps[0]) >= 1, true);
});

test('Graphing Lines (graphing): slope and intercept read from the equation or the graph, stated as the grader compares them', () => {
  const items = [QUESTION_TYPE_CATALOG.graphing.example];
  for (let index = 0; index < 40; index += 1) {
    items.push(generateQuestion({ type: 'graphing', prompt: 'Identify the slope and the y-intercept.', generator: { kind: 'lineGraph' } }, `k${index}`));
    items.push(generateQuestion({ type: 'graphing', prompt: 'Read the slope and y-intercept from the graph.', showEquation: false, generator: { kind: 'lineGraph' } }, `g${index}`));
  }
  // Graph only, steep lines and intercepts near the edge of the window included.
  for (let index = 0; index < 200; index += 1) items.push(generateQuestion({ type: 'graphing', prompt: 'Read the slope and y-intercept from the graph.', showEquation: false, generator: { kind: 'lineGraph' } }, `z${index}`));
  [[0, 3], [1, 0], [-1, -4], [0.5, -2], [-1.5, 0], [2.25, 1.5], [-2, -9], [3, 8], [4, 9], [-5, 7]].forEach(([m, b]) => items.push({ type: 'graphing', prompt: 'Identify the slope and the y-intercept.', m, b }, { type: 'graphing', prompt: 'Read the graph.', showEquation: false, graph: { functions: [{ type: 'line', m, b }] } }));
  let graphOnly = 0;
  for (const [index, question] of items.entries()) {
    const label = `graphing #${index}`;
    const keyLine = Number.isFinite(Number(question.m)) ? { m: F(Number(question.m)), b: F(Number(question.b)) } : { m: F(question.graph.functions[0].m), b: F(question.graph.functions[0].b) };
    const worked = linesAndSlope.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    worked.steps.forEach((step) => { assertClean(label, step); assertArithmetic(label, step); });
    pointsIn(worked.steps.join(' ')).forEach((point) => assert.ok(onLine(keyLine, point), `${label}: every point named is on the line`));
    // GraphLine shows an equation only from equationLatex or an authored m and b.
    if (question.showEquation === false || !(question.equationLatex || Number.isFinite(Number(question.m)))) {
      // Read off the graph: both points are inside the window the student sees,
      // and the rise, the run and the slope are what they are between them.
      graphOnly += 1;
      const window = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, ...Object.fromEntries(['xMin', 'xMax', 'yMin', 'yMax'].filter((key) => Number.isFinite(Number(question.graph?.[key]))).map((key) => [key, Number(question.graph[key])])) };
      const named = pointsIn(worked.steps.slice(0, 2).join(' '));
      named.forEach(([x, y]) => assert.ok(math.number(x) >= window.xMin && math.number(x) <= window.xMax && math.number(y) >= window.yMin && math.number(y) <= window.yMax, `${label}: (${fracText(x)}, ${fracText(y)}) is on the graph shown: ${worked.steps[1]}`));
      assert.ok(samePoint(pointsIn(worked.steps[0])[0], [F(0), keyLine.b]) && eq(finalValue(worked.steps[0]), keyLine.b), `${label}: ${worked.steps[0]}`);
      const [to] = pointsIn(worked.steps[1]);
      assert.ok(!eq(to[0], 0), `${label}: a second point`);
      const motion = /the run is (-?[\d/]+) and the rise is (.+) = (-?[\d/]+)\.$/.exec(worked.steps[1]);
      assert.ok(motion, `${label}: ${worked.steps[1]}`);
      assert.ok(eq(motion[1], to[0]), `${label}: the run is the change in x: ${worked.steps[1]}`);
      assert.ok(eq(motion[3], math.subtract(to[1], keyLine.b)) && eq(F(math.evaluate(motion[2])), motion[3]), `${label}: the rise is the change in y: ${worked.steps[1]}`);
      const slopeChain = /= (-?[\d/]+) ÷ \(?(-?[\d/]+)\)? = (-?[\d/]+)\.$/.exec(worked.steps[2]);
      assert.ok(slopeChain && eq(slopeChain[1], motion[3]) && eq(slopeChain[2], motion[1]) && eq(slopeChain[3], keyLine.m), `${label}: slope = rise ÷ run: ${worked.steps[2]}`);
    } else {
      // From the equation: the slope step names m, the intercept step names b.
      assert.ok(finalValue(worked.steps[1]) !== null && eq(finalValue(worked.steps[1]), keyLine.m), `${label}: ${worked.steps[1]}`);
      assert.ok(finalValue(worked.steps[2]) !== null && eq(finalValue(worked.steps[2]), keyLine.b), `${label}: ${worked.steps[2]}`);
    }
    const { Slope: slope, 'y-intercept': intercept } = answerSummaryParts(worked.answerSummary);
    assert.ok(eq(slope, keyLine.m) && eq(intercept, keyLine.b), `${label}: ${worked.answerSummary}`);
    assert.ok(worked.steps.at(-1).includes(`m = ${slope}`) && worked.steps.at(-1).includes(`b = ${intercept}`));
    const graded = gradeToolWork({ toolId: 'graphing', question, work: { slope, intercept } });
    assert.equal(graded.isCorrect, true, `${label}: the graphing grader accepts ${worked.answerSummary}`);
  }
  assert.ok(graphOnly >= 240, `${graphOnly} graph-only items`);
  // A key no one can type exactly (1/3 stored as 0.333…) is not explained.
  assert.equal(linesAndSlope.workedSolution({ type: 'graphing', prompt: 'x', m: 1 / 3, b: 2 }), null);
  // A graph that does not show the y-intercept, or any whole step of rise over run, is not read off it.
  assert.equal(linesAndSlope.workedSolution({ type: 'graphing', prompt: 'Read the graph.', showEquation: false, graph: { functions: [{ type: 'line', m: 1, b: 12 }] } }), null);
  assert.equal(linesAndSlope.workedSolution({ type: 'graphing', prompt: 'Read the graph.', showEquation: false, graph: { functions: [{ type: 'line', m: 30, b: 0 }] } }), null);
  assert.ok(linesAndSlope.workedSolution({ type: 'graphing', prompt: 'Read the graph.', showEquation: false, graph: { functions: [{ type: 'line', m: 30, b: 0 }], yMin: -40, yMax: 40 } }));
});

test('graphing2, every mode: the points the steps plot are a construction the shared grader marks correct', () => {
  const items = [];
  const bank = readJson('seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json').documents.filter((document) => document.type === 'graphing2');
  bank.forEach((document) => ['s1', 's2', 's3', 's4', 's5', 's6'].forEach((key) => items.push(generatePathInstanceWithRetries(document, key).question)));
  items.push(...readJson('SAMPLE_BATCH_D_DEEP_DIVE.json').questions.filter((question) => question.toolId === 'graphing2'));
  items.push(readJson('SAMPLE_MISSING_MATH_TOOLS.json').questions.find((question) => question.toolId === 'graphing2'));
  const formAware3 = { strategy: 'formAware', minimumPoints: 3 };
  [-3, -1, 0, 1, 2, 0.5, -0.5, 1.5, -2.5, 0.25].forEach((m, index) => {
    const b = (index * 5) % 13 - 6;
    const point = [(index % 7) - 3, ((index * 3) % 9) - 4];
    items.push({ type: 'graphing2', toolId: 'graphing2', mode: 'slopeIntercept', prompt: 'Graph the line.', line: { m, b }, ...(index % 2 ? { constructionPolicy: formAware3 } : {}) });
    items.push({ type: 'graphing2', toolId: 'graphing2', mode: 'pointSlope', prompt: 'Graph the line.', point, slope: m, ...(index % 2 ? { constructionPolicy: formAware3 } : {}) });
    if (m) items.push({ type: 'graphing2', toolId: 'graphing2', mode: 'factoredLinear', prompt: 'Graph the line.', factored: { a: m, c: (index % 9) - 4 }, ...(index % 2 ? { constructionPolicy: { strategy: 'formAware' } } : {}) });
  });
  [[[1, -4], [3, -2]], [[5, -3], [5, 0]], [[4, -3], [6, -3]], [[0, 4], [3, -2]], [[2, 7], [-1, -2]]].forEach((givenPoints) => items.push({ type: 'graphing2', toolId: 'graphing2', mode: 'throughPoints', prompt: 'Graph the line through the two points.', givenPoints }));
  [[2, 3, 12], [0, 2, -6], [3, 0, 6], [-4, 2, 8], [5, -2, 10], [1, 1, -4], [-3, -6, 9], [2, -3, 0]].forEach(([A, B, C], index) => items.push({ type: 'graphing2', toolId: 'graphing2', mode: 'standardForm', prompt: 'Graph the line.', standard: { A, B, C }, ...(index % 2 && A && B && C ? { constructionPolicy: formAware3 } : {}) }));
  [['vertical', 3], ['horizontal', -2], ['vertical', -5], ['horizontal', 0]].forEach(([orientation, value]) => items.push({ type: 'graphing2', toolId: 'graphing2', mode: 'verticalHorizontal', prompt: 'Graph the line.', orientation, value }));
  const modes = new Set();
  for (const [index, question] of items.entries()) {
    const label = `graphing2 ${question.mode} #${index}`;
    const worked = linesAndSlope.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    modes.add(question.mode || 'slopeIntercept');
    worked.steps.forEach((step) => { assertClean(label, step); assertArithmetic(label, step); });
    const last = /^Draw the (?:vertical |horizontal )?line through (.+): it is (.+)\.$/.exec(worked.steps.at(-1));
    assert.ok(last, `${label}: ends on the line it draws: ${worked.steps.at(-1)}`);
    const drawn = lineOf(last[2]);
    // The oracle line, from the authored fields.
    let truth;
    const mode = question.mode || 'slopeIntercept';
    if (mode === 'slopeIntercept') truth = { m: F(Number(question.line.m)), b: F(Number(question.line.b)) };
    else if (mode === 'throughPoints') truth = through(...question.givenPoints.map(([x, y]) => [F(x), F(y)]));
    else if (mode === 'pointSlope') truth = { m: F(Number(question.slope)), b: math.subtract(F(Number(question.point[1])), math.multiply(F(Number(question.slope)), F(Number(question.point[0])))) };
    else if (mode === 'standardForm') truth = lineOf(`${question.standard.A}*x + ${question.standard.B}*y = ${question.standard.C}`);
    else if (mode === 'factoredLinear') truth = { m: F(Number(question.factored.a)), b: math.unaryMinus(math.multiply(F(Number(question.factored.a)), F(Number(question.factored.c)))) };
    else truth = question.orientation === 'vertical' ? { vertical: true, x: F(question.value) } : { m: F(0), b: F(question.value) };
    assert.ok(sameLine(drawn, truth), `${label}: draws ${last[2]}`);
    const plotted = pointsIn(last[1]);
    plotted.forEach((point) => assert.ok(onLine(truth, point), `${label}: ${last[1]} lies on the line`));
    pointsIn(worked.steps.join(' ')).forEach((point) => assert.ok(onLine(truth, point), `${label}: every point named is on the line`));
    const graded = gradeToolWork({ toolId: 'graphing2', question, work: { points: plotted.map(([x, y]) => [math.number(x), math.number(y)]) } });
    assert.equal(graded.isCorrect, true, `${label}: graphing2 grades ${last[1]} correct`);
    assert.ok(worked.answerSummary.includes(last[2]), `${label}: ${worked.answerSummary}`);
  }
  assert.deepEqual([...modes].sort(), ['factoredLinear', 'pointSlope', 'slopeIntercept', 'standardForm', 'throughPoints', 'verticalHorizontal']);
  // A form-aware standard form through the origin has no two distinct anchors to plot: not explained.
  assert.equal(linesAndSlope.workedSolution({ type: 'graphing2', toolId: 'graphing2', mode: 'standardForm', prompt: 'Graph.', standard: { A: 2, B: -3, C: 0 }, constructionPolicy: { strategy: 'formAware' } }), null);
});

test('linearTableWorkbench, all three modes: the recorded intervals and the verdict are what the grader asks for', () => {
  const items = [];
  [[2, 3, -2, 1], [-3, 1, 0, 2], [0.5, -1, -2, 3], [-1.5, 4, 1, 2], [4, -6, -1, 1], [0, 5, -3, 2], [1, 0, 0, 1], [-2, -3, 2, 3]].forEach(([m, b, x0, step], index) => {
    const at = (k) => ({ x: x0 + k * step, y: m * (x0 + k * step) + b });
    const rows = [0, 1, 2, 3].map(at);
    const shuffled = index % 2 ? [rows[2], rows[0], rows[3], rows[1]] : rows;
    items.push({ type: 'linearTableWorkbench', toolId: 'linearTableWorkbench', mode: 'deriveEquation', prompt: 'Write the equation.', rows: shuffled, ...(index % 3 ? { requiredComparisons: 2 } : {}) });
    items.push({ type: 'linearTableWorkbench', toolId: 'linearTableWorkbench', mode: 'constantRate', prompt: 'Is the rate constant?', rows: shuffled });
    items.push({ type: 'linearTableWorkbench', toolId: 'linearTableWorkbench', mode: 'constantRate', prompt: 'Is the rate constant?', rows: rows.map((row, k) => (k === 3 ? { x: row.x, y: row.y + 5 } : row)), requiredComparisons: 3 });
    const five = [0, 1, 2, 3, 4].map(at);
    items.push({ type: 'linearTableWorkbench', toolId: 'linearTableWorkbench', mode: 'repairValue', prompt: 'Fix the broken row.', rows: five.map((row, k) => (k === index % 5 ? { x: row.x, y: row.y + [3, -4, 7][index % 3] } : row)), requiredComparisons: 2 });
  });
  items.push(...v5([
    { standard: 'A.3B', prompt: 'Is the rate of change constant?', studentActions: ['proveConstantRate'], mode: 'constantRate', rows: [{ x: -2, y: 7 }, { x: 1, y: 1 }, { x: 3, y: -3 }, { x: 6, y: -9 }] },
    { standard: 'A.3C', prompt: 'Write the equation of the line in the table.', studentActions: ['proveConstantRate'], mode: 'deriveEquation', rows: [{ x: -3, y: 16 }, { x: 1, y: 8 }, { x: 4, y: 2 }, { x: 9, y: -8 }], requiredComparisons: 2 },
    { standard: 'A.3B', prompt: 'Find and fix the row that breaks the pattern.', studentActions: ['proveConstantRate'], mode: 'repairValue', rows: [{ x: 0, y: 50 }, { x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 9 }, { x: 4, y: 11 }], requiredComparisons: 2 },
  ]));
  for (const [index, question] of items.entries()) {
    const label = `table ${question.mode} #${index}`;
    const worked = linesAndSlope.workedSolution(question);
    assert.ok(worked, `${label}: a worked solution`);
    worked.steps.forEach((step) => { assertClean(label, step); assertArithmetic(label, step); });
    const rows = question.rows.map((row) => [F(row.x), F(row.y)]);
    const rowAt = (x) => rows.findIndex(([rx]) => eq(rx, x));
    // Each "From x = a to x = b" interval: the table's own rows, and its true change and rate.
    const intervals = worked.steps.map((step) => /^From x = (\S+) to x = (\S+): \((.+?)\) ÷ \((.+?)\) = (\S+) ÷ \(?(\S+?)\)? = (\S+)\.$/.exec(step)).filter(Boolean).map((match) => {
      const [i, j] = [rowAt(F(match[1])), rowAt(F(match[2]))];
      assert.ok(i >= 0 && j >= 0, `${label}: rows x = ${match[1]}, ${match[2]}`);
      const dy = math.subtract(rows[j][1], rows[i][1]);
      const dx = math.subtract(rows[j][0], rows[i][0]);
      assert.ok(eq(match[5], dy) && eq(match[6], dx) && eq(match[7], math.divide(dy, dx)), `${label}: interval ${match[0]}`);
      return { i, j, dy: match[5], dx: match[6], rate: match[7] };
    });
    assert.ok(intervals.length >= Math.max(1, Math.min(Number(question.requiredComparisons) || 3, 6)), `${label}: ${intervals.length} intervals`);
    const collinear = (points) => points.every((point) => onLine(through(points[0], points[1]), point));
    const work = { intervals };
    if (question.mode === 'constantRate') {
      const linear = collinear(rows);
      assert.match(worked.answerSummary, linear ? /^Linear/ : /^Nonlinear/, `${label}: ${worked.answerSummary}`);
      assert.match(worked.steps.at(-1), linear ? /the relationship is linear\.$/ : /the relationship is nonlinear\.$/);
      work.classification = linear ? 'linear' : 'nonlinear';
    } else if (question.mode === 'deriveEquation') {
      const line = through(rows[0], rows[1]);
      const match = /^Linear: m = (\S+), b = (\S+), (.+)$/.exec(worked.answerSummary);
      assert.ok(match && eq(match[1], line.m) && eq(match[2], line.b) && sameLine(lineOf(match[3]), line), `${label}: ${worked.answerSummary}`);
      assert.ok(worked.steps.at(-1).includes(match[3]));
      Object.assign(work, { classification: /^Linear:/.test(worked.answerSummary) ? 'linear' : '', m: match[1], b: match[2], equation: match[3] });
    } else {
      const broken = rows.findIndex((_, index2) => collinear(rows.filter((__, other) => other !== index2)));
      const good = rows.filter((_, other) => other !== broken);
      const line = through(good[0], good[1]);
      const match = /^Row (\d+) \(x = (\S+)\) should have y = ([^;\s]+)/.exec(worked.answerSummary);
      assert.ok(match && Number(match[1]) - 1 === broken && eq(match[3], math.add(math.multiply(line.m, rows[broken][0]), line.b)), `${label}: ${worked.answerSummary}`);
      assert.ok(worked.steps.at(-1).includes(`should have y = ${match[3]}`));
      // The grader also asks whether the CORRECTED table is linear.
      Object.assign(work, { classification: /the corrected table is linear\.$/.test(worked.answerSummary) ? 'linear' : '', repairRowIndex: broken, repairedValue: match[3] });
    }
    const graded = gradeToolWork({ toolId: 'linearTableWorkbench', question, work });
    assert.equal(graded.isCorrect, true, `${label}: graded ${JSON.stringify(graded.parts?.map((part) => [part.id, part.isCorrect]))}`);
  }
  // Three rows with one off the line: any of them could be "the" broken row. Not explained.
  assert.equal(linesAndSlope.workedSolution({ type: 'linearTableWorkbench', mode: 'repairValue', rows: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 9 }] }), null);
});

test('the linear bridge and the Multiple Representations board are left to their tool review', () => {
  const bridge = { type: 'representationBridge', toolId: 'representationBridge', mode: 'linear', prompt: 'Connect every representation.', source: { kind: 'table', rows: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }] } };
  assert.equal(linesAndSlope.matches(bridge), true);
  assert.equal(linesAndSlope.workedSolution(bridge), null);
  const { question: board } = seat({ questionId: 'k-lmr', type: 'representationBridge', questionFamily: { id: 'linear.multipleRepresentations', version: 1, tool: 'representationBridge', constraints: { given: 'twoPoints', slope: 'integer' } } }, 0);
  assert.equal(linesAndSlope.matches(board), true);
  assert.equal(linesAndSlope.workedSolution(board), null);
  for (const question of [null, undefined, {}, { type: 'multiAnswer', prompt: 'Find the slope.' }]) assert.equal(linesAndSlope.workedSolution(question), null);
});

/* ------------------------------------------------------------ 4. the closed-question review */

test('closedQuestionReview: the family fills a question with no steps of its own; authored steps are left alone', () => {
  const question = REAL_TWO_POINTS[0].question;
  // Authored steps: unchanged, whatever the family could say.
  const authoredReview = { headline: 'Slope first.', reasoning: ['Rise over run: -2 over 3.', 'The line meets the y-axis at (0, 4).'], answerSummary: 'm = -2/3, b = 4' };
  const authored = buildClosedQuestionReview({ question: { ...question, solutionReview: authoredReview } });
  assert.equal(authored.fromFamily, false);
  assert.deepEqual(authored.authored, buildPrivateSupport({ solutionReview: authoredReview }).solutionReview);
  // Only a summary and a common error: the family's steps, the author's summary and warning.
  const partial = buildClosedQuestionReview({ question: { ...question, solutionReview: { answerSummary: 'Slope -2/3, intercept 4', commonError: 'Subtracting the x-values in the opposite order flips the sign.', connection: 'Same as the table rate.' } } });
  assert.equal(partial.fromFamily, true);
  assert.deepEqual(partial.authored.reasoning, linesAndSlope.workedSolution(question).steps);
  assert.equal(partial.authored.answerSummary, 'Slope -2/3, intercept 4', 'the authored answerSummary wins');
  assert.equal(partial.authored.commonError, 'Subtracting the x-values in the opposite order flips the sign.');
  assert.equal(partial.authored.connection, 'Same as the table rate.');
  assert.equal(partial.authored.headline, linesAndSlope.workedSolution(question).headline);
  // An authored headline with no steps: the author's headline, the family's steps.
  const headlined = buildClosedQuestionReview({ question: { ...question, solutionReview: { headline: 'Rise over run, then the y-axis.' } } });
  assert.equal(headlined.fromFamily, true);
  assert.equal(headlined.authored.headline, 'Rise over run, then the y-axis.', 'the authored headline wins');
  assert.deepEqual(headlined.authored.reasoning, linesAndSlope.workedSolution(question).steps);
  assert.match(partial.speechText, /Subtracting the x-values/);
  // No family, no steps: unchanged behaviour.
  const none = buildClosedQuestionReview({ question: { type: 'multiAnswer', prompt: 'Name a prime.', answerFields: [{ id: 'p', answer: '7' }] } });
  assert.equal(none.authored, null);
  assert.equal(none.fromFamily, false);
  assert.equal(none.hasContent, false);
});

test('closedQuestionReview: a tool review with steps keeps the floor; a tool with none gets the family steps', () => {
  const graphing2 = { type: 'graphing2', toolId: 'graphing2', mode: 'slopeIntercept', prompt: 'Graph the line.', line: { m: 1.5, b: -2 } };
  const withTool = buildClosedQuestionReview({ question: graphing2, isToolQuestion: true });
  assert.ok(withTool.tool.steps.length > 0, 'graphing2 has its own worked steps');
  assert.equal(withTool.fromFamily, false);
  assert.equal(withTool.authored, null);
  // A caller that does not flag the tool question (SolutionReview2) gets no family review on top of it either.
  const unflagged = buildClosedQuestionReview({ question: graphing2 });
  assert.equal(unflagged.fromFamily, false);
  assert.equal(unflagged.authored, null);
  const table = { type: 'linearTableWorkbench', toolId: 'linearTableWorkbench', mode: 'deriveEquation', rows: [{ x: 0, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 3 }] };
  assert.equal(buildClosedQuestionReview({ question: table, isToolQuestion: true }).fromFamily, false);
  // Step Algebra's intercept orchestrator has no tool builder: the family explains it.
  const intercepts = { type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 3, B: 4, C: 24 }, prompt: 'Find both intercepts of 3x + 4y = 24.' };
  const review = buildClosedQuestionReview({ question: intercepts, isToolQuestion: true });
  assert.equal(review.tool, null);
  assert.equal(review.fromFamily, true);
  assert.equal(review.authored.answerSummary, 'x-intercept: (8, 0); y-intercept: (0, 6)');
});

test('closedQuestionReview never throws on a question that throws', () => {
  const hostile = new Proxy({ type: 'multiAnswer' }, { get(target, key) { if (key === 'type') return 'multiAnswer'; if (typeof key === 'symbol') return undefined; throw new Error(`no ${String(key)}`); } });
  const review = buildClosedQuestionReview({ question: hostile });
  assert.equal(review.fromFamily, false);
  assert.equal(review.authored, null);
});

test('only the closed-question review asks a family for its worked solution (it states the answer)', () => {
  const files = [];
  const walk = (directory) => readdirSync(new URL(directory, ROOT)).forEach((name) => {
    const path = `${directory}/${name}`;
    if (statSync(new URL(path, ROOT)).isDirectory()) walk(path);
    else if (/\.(m?js|jsx)$/.test(name)) files.push(path);
  });
  walk('src');
  const callers = files.filter((path) => !path.startsWith('src/platform/supports/families/')
    && /workedSolution\s*(?:\?\.)?\s*\(/.test(executableSource(read(path))));
  assert.deepEqual(callers, ['src/platform/supports/review/closedQuestionReview.js']);
  // Inside the family, nothing that is shown while the item is open reaches it.
  const family = executableSource(read('src/platform/supports/families/linesAndSlope.js'));
  const uses = [...family.matchAll(/workedSolution/g)].length;
  assert.equal(uses, 1, 'linesAndSlope names workedSolution only where it exports it');
});
