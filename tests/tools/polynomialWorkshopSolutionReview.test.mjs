import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildPolynomialWorkshopReview,
  implemented,
} from '../../src/tools/shared/reviews/polynomialWorkshopReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import {
  TOOLS_WITH_SOLUTION_REVIEW_BUILDER,
  buildToolSolutionReviewModel,
} from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/polynomialWorkshop.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { OWN_CHOICES } from '../../functions/shared/toolMath/shared/judgmentChoices.mjs';
import { evaluatePolynomial } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  POLYNOMIAL_WORKSHOP_DEFAULTS as DEFAULTS,
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  graphConnectionTargetEntry,
  integerFactorPairForMonicQuadratic,
  parseCoefficientList,
  polynomialLongDivide,
  polynomialMultiply,
  rationalFeatureMap,
  rationalFeatureTargetValue,
  rationalFeatureTypeAt,
  sameCoefficientList,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * THE POLYNOMIAL WORKSHOP REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Polynomial Workshop question is closed, its review gives the worked
 * solution for the view the student saw — every one of the six views has one
 * right answer: P(r) and "is (x − r) a factor?" (factorZero), the four area
 * cells and the expanded coefficients (multiplyArea), the integer pair p, q
 * (factorQuadratic), the quotient and remainder lists (division), crosses /
 * touches and the end behavior (graphConnection), and the feature at a value
 * of a rational function (rationalFeatures).
 *
 * Every review is turned back into the work a student following it would
 * enter — each stated value typed into its box, each stated choice picked from
 * the option with exactly that text ON THE WORKSHOP'S SCREEN (read from
 * PolynomialWorkshop.jsx) — and graded by the shared grader the server records
 * with (gradeToolWork): it must come back correct and complete. The stated key
 * is also derived independently from the grader's own helpers. Shapes with no
 * single honest answer give null, never a guess.
 */

const TOOL_ID = 'polynomialWorkshop';
const q = (fields = {}) => ({ type: TOOL_ID, questionId: 'pw-review', prompt: 'Use the Polynomial Workshop.', ...fields });
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

/* ------------------------------------------------------------------ */
/* the options the workshop's selects show, read from its source       */
/* ------------------------------------------------------------------ */

const COMPONENT = executableSource(fs.readFileSync('src/tools/polynomialWorkshop/PolynomialWorkshop.jsx', 'utf8'));
const optionsIn = (view) => {
  const body = region(COMPONENT, `function ${view}(`, '\n}', view);
  const options = new Map([...body.matchAll(/<option value="(\w+)">([^<]+)<\/option>/g)].map((match) => [match[2], match[1]]));
  // The end-behavior select lists its labels as an array; each option's text is its value.
  const listed = body.match(/\{\[('[^\]]+')\]\.map\(v=><option key=\{v\}>\{v\}<\/option>\)\}/);
  if (listed) [...listed[1].matchAll(/'([^']+)'/g)].forEach((match) => options.set(match[1], match[1]));
  return options;
};
const SCREEN_OPTIONS = {
  factorZero: optionsIn('FactorZero'),
  graphConnection: optionsIn('GraphConnection'),
  rationalFeatures: optionsIn('RationalFeatures'),
};
test('the screen options this test reads are the workshop\'s own', () => {
  assert.deepEqual([...SCREEN_OPTIONS.factorZero.entries()], [['Yes', 'yes'], ['No', 'no']]);
  assert.deepEqual([...SCREEN_OPTIONS.rationalFeatures.values()].sort(), ['hole', 'none', 'verticalAsymptote', 'zero']);
  assert.deepEqual([...SCREEN_OPTIONS.graphConnection.values()].sort(), [
    'both ends fall', 'both ends rise', 'crosses', 'left falls, right rises', 'left rises, right falls', 'touches',
  ]);
});

// The option a student picks for a stated choice: the one with exactly that text.
const pick = (mode, text) => {
  const value = SCREEN_OPTIONS[mode].get(text);
  assert.ok(value, `"${text}" is the text of an option on the ${mode} screen`);
  return value;
};

/* ------------------------------------------------------------------ */
/* review → the work a student following it enters                     */
/* ------------------------------------------------------------------ */

const itemValue = (model, label) => {
  const item = model.items.find((entry) => entry.label === label || (label instanceof RegExp && label.test(entry.label)));
  assert.ok(item, `the review states ${label}`);
  return item.value;
};

const WORK_FROM_REVIEW = {
  factorZero: (model) => ({
    value: model.items[0].value,
    factorChoice: pick('factorZero', model.items[1].value),
  }),
  multiplyArea: (model) => ({
    cells: [1, 2, 3, 4].map((cell) => itemValue(model, new RegExp(`^Area cell ${cell} `))),
    expanded: itemValue(model, 'Expanded coefficients'),
  }),
  factorQuadratic: (model) => ({ p: itemValue(model, 'p'), q: itemValue(model, 'q') }),
  division: (model) => ({
    quotient: itemValue(model, 'Quotient coefficients'),
    remainder: itemValue(model, 'Remainder coefficients'),
  }),
  graphConnection: (model) => ({
    behavior: pick('graphConnection', itemValue(model, /^At the target zero x = /)),
    end: pick('graphConnection', itemValue(model, 'End behavior')),
    ...OWN_CHOICES,
  }),
  rationalFeatures: (model) => ({
    choice: pick('rationalFeatures', itemValue(model, /^Feature at x = /)),
    ...OWN_CHOICES,
  }),
};

/*
 * The key, derived here from the grader's own helpers and defaults — the same
 * derivation functions/shared/serverGrading/tools/polynomialWorkshop.mjs runs.
 */
const KEY = {
  factorZero: (question) => {
    const value = evaluatePolynomial(question.coefficients || DEFAULTS.factorZero.coefficients, Number(question.candidateRoot ?? DEFAULTS.factorZero.candidateRoot));
    return { value, factorChoice: Math.abs(value) < 1e-9 ? 'yes' : 'no' };
  },
  multiplyArea: (question) => {
    const left = question.leftBinomial || DEFAULTS.multiplyArea.leftBinomial;
    const right = question.rightBinomial || DEFAULTS.multiplyArea.rightBinomial;
    return { cells: [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]], expanded: polynomialMultiply(left, right) };
  },
  factorQuadratic: (question) => ({ pair: integerFactorPairForMonicQuadratic(question.coefficients || DEFAULTS.factorQuadratic.coefficients) }),
  division: (question) => polynomialLongDivide(question.dividend || DEFAULTS.division.dividend, question.divisor || DEFAULTS.division.divisor),
  graphConnection: (question) => {
    const roots = question.roots || DEFAULTS.graphConnection.roots;
    const coefficients = coefficientsFromRoots(roots, Number(question.leadingCoefficient ?? DEFAULTS.graphConnection.leadingCoefficient));
    return { behavior: factorBehaviorAtRoot(graphConnectionTargetEntry(roots, question.targetRoot).multiplicity), end: endBehavior(coefficients).label };
  },
  rationalFeatures: (question) => {
    const features = rationalFeatureMap({
      numeratorRoots: question.numeratorRoots || DEFAULTS.rationalFeatures.numeratorRoots,
      denominatorRoots: question.denominatorRoots || DEFAULTS.rationalFeatures.denominatorRoots,
    });
    return { choice: rationalFeatureTypeAt(features, rationalFeatureTargetValue(features, question.targetValue)) };
  },
};

const assertKeyMatches = (mode, question, work, label) => {
  const key = KEY[mode](question);
  if (mode === 'factorZero') {
    assert.ok(Math.abs(Number(work.value) - key.value) <= 1e-9, `${label}: P(r) is stated exactly (${work.value} vs ${key.value})`);
    assert.equal(work.factorChoice, key.factorChoice, `${label}: the factor verdict`);
  } else if (mode === 'multiplyArea') {
    work.cells.forEach((cell, index) => assert.ok(Math.abs(Number(cell) - key.cells[index]) <= 1e-9, `${label}: cell ${index + 1}`));
    assert.ok(sameCoefficientList(parseCoefficientList(work.expanded), key.expanded, 1e-9), `${label}: expanded coefficients`);
  } else if (mode === 'factorQuadratic') {
    assert.deepEqual([Number(work.p), Number(work.q)].sort((a, b) => a - b), key.pair, `${label}: the factor pair`);
  } else if (mode === 'division') {
    assert.ok(sameCoefficientList(parseCoefficientList(work.quotient), key.quotient, 1e-9), `${label}: quotient`);
    assert.ok(sameCoefficientList(parseCoefficientList(work.remainder), key.remainder, 1e-9), `${label}: remainder`);
  } else if (mode === 'graphConnection') {
    assert.equal(work.behavior, key.behavior, `${label}: behavior at the target zero`);
    assert.equal(work.end, key.end, `${label}: end behavior`);
  } else {
    assert.equal(work.choice, key.choice, `${label}: the feature`);
  }
};

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.title.trim(), `${label}: a title`);
  assert.ok(model.items.length >= 1, `${label}: items`);
  for (const item of model.items) {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value'], `${label}: an item is a label and a value`);
    assert.equal(typeof item.label, 'string', `${label}: item label is text`);
    assert.equal(typeof item.value, 'string', `${label}: item value is text`);
    assert.ok(item.value.trim(), `${label}: item value is not blank`);
  }
  assert.ok(model.steps.length >= 2, `${label}: worked steps`);
  assert.ok(model.steps.length <= 12, `${label}: within what the review panel keeps`);
  for (const step of model.steps) {
    assert.equal(typeof step, 'string', `${label}: step is text`);
    assert.equal((step.match(/\$/g) || []).length % 2, 0, `${label}: every $…$ in a step is closed: ${step}`);
  }
  assert.equal(typeof model.why, 'string', `${label}: a check of why the answer works`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note is text or null`);
  // "is undefined" is the review's own words about 0/0 at a hole.
  assert.doesNotMatch(JSON.stringify(model), /(?<!is )undefined|NaN|Infinity|\[object Object\]|\de[+-]?\d/, `${label}: nothing unrendered leaks into the text`);
};

// Builds the review, checks its shape, grades what it states, and checks that
// the platform's review index serves the same model.
const assertReviewGradesCorrect = (question, label) => {
  const mode = resolveToolMode(declaration, question);
  const model = buildPolynomialWorkshopReview(question);
  assertTextOnly(model, label);
  const work = WORK_FROM_REVIEW[mode](model);
  assertKeyMatches(mode, question, work, label);
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.mode, mode, `${label}: graded as the view the review explains`);
  assert.equal(result.isCorrect, true, `${label}: the shared grader accepts the stated answer ${JSON.stringify(work)}`);
  assert.equal(result.isComplete, true, `${label}: complete`);
  assert.equal(result.score, 1, `${label}: full score`);
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the review index serves this model`);
  return { model, work, mode };
};

/* ------------------------------------------------------------------ */
/* registration and safety on any input                                */
/* ------------------------------------------------------------------ */

test('the builder is implemented and the review index serves it', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildPolynomialWorkshopReview);
  assert.ok(TOOLS_WITH_SOLUTION_REVIEW_BUILDER.includes(TOOL_ID));
});

test('null, {} and malformed input give null without throwing', () => {
  for (const input of [null, undefined, {}, [], 'polynomialWorkshop', 42, true, () => null]) {
    assert.doesNotThrow(() => buildPolynomialWorkshopReview(input));
    assert.equal(buildPolynomialWorkshopReview(input), null, `${String(input)} gives null`);
  }
  assert.equal(buildToolSolutionReviewModel(null), null);
  assert.equal(buildToolSolutionReviewModel({}), null);
  // What the grader refuses as an invalid question (it cannot build a key)
  // has no review either.
  const invalid = [
    q({ coefficients: '1,-5,6' }),
    q({ mode: 'multiplyArea', leftBinomial: '23' }),
    q({ mode: 'factorQuadratic', coefficients: { a: 1 } }),
    q({ mode: 'division', divisor: [0, 0] }),
    q({ mode: 'graphConnection', roots: [] }),
    q({ mode: 'rationalFeatures', numeratorRoots: 5 }),
  ];
  for (const question of invalid) {
    assert.equal(grade(question, {}).reason, 'invalid-question', `${JSON.stringify(question)} is invalid to the grader`);
    assert.doesNotThrow(() => buildPolynomialWorkshopReview(question));
    assert.equal(buildPolynomialWorkshopReview(question), null, `${JSON.stringify(question)}: no review`);
    assert.equal(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), null);
  }
  for (const question of [
    q({ coefficients: [1, 'x', 6] }),
    q({ coefficients: [null, 1, 2] }),
    q({ candidateRoot: 'two' }),
    q({ mode: 'multiplyArea', leftBinomial: [2, 3, 4] }),
    q({ mode: 'division', dividend: [1, Infinity] }),
    q({ mode: 'graphConnection', roots: [1, 2] }),
    q({ mode: 'graphConnection', roots: [{ root: 'a', multiplicity: 1 }] }),
    q({ mode: 'graphConnection', roots: [null] }),
    q({ mode: 'rationalFeatures', denominatorRoots: [] }),
    q({ mode: 'rationalFeatures', targetValue: 'abc' }),
    q({ mode: 'rationalFeatures', numeratorRoots: [{}], denominatorRoots: [1] }),
  ]) {
    assert.doesNotThrow(() => buildPolynomialWorkshopReview(question));
    assert.equal(buildPolynomialWorkshopReview(question), null, `${JSON.stringify(question)}: no review`);
  }
});

/* ------------------------------------------------------------------ */
/* factorZero                                                          */
/* ------------------------------------------------------------------ */

test('factorZero: P(r) and the factor verdict, for factors and non-factors', () => {
  const cases = [
    [q({ toolId: TOOL_ID, mode: 'factorZero', difficultyBand: 2, dok: 1, masteryEvidenceKeys: ['texas:2A.7A'], coefficients: [1, -5, 6], candidateRoot: 2 }), '0', 'Yes'],
    [q({ mode: 'factorZero', candidateRoot: 4 }), '2', 'No'],
    [q({ coefficients: [1, 0, -4, 1], candidateRoot: 3 }), '16', 'No'],
    [q({ coefficients: [1, 2], candidateRoot: -5 }), '-3', 'No'],
    [q({ coefficients: ['1', '-5', '6'], candidateRoot: '3' }), '0', 'Yes'],
    [q({ coefficients: [1, -6, 11, -6], candidateRoot: 3 }), '0', 'Yes'],
    [q({ coefficients: [2, -3, 0, 5], candidateRoot: 0 }), '5', 'No'],
    [q({ coefficients: [4, 0, -1], candidateRoot: 0.5 }), '0', 'Yes'],
    [q({ coefficients: [1, -5, 6.005], candidateRoot: 2 }), '0.005', 'No'],
    [q({ coefficients: [1, 3, 0, -4], candidateRoot: -2 }), '0', 'Yes'],
  ];
  for (const [question, value, verdict] of cases) {
    const label = `P = ${JSON.stringify(question.coefficients)}, r = ${question.candidateRoot}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.equal(model.items[0].value, value, `${label}: P(r)`);
    assert.equal(model.items[1].value, verdict, `${label}: verdict`);
    assert.ok(model.steps.some((step) => step.includes(`= ${value}$`)), `${label}: the steps reach P(r) = ${value}`);
    // The opposite verdict is marked wrong: the review's verdict is the only right one.
    assert.equal(grade(question, { ...work, factorChoice: work.factorChoice === 'yes' ? 'no' : 'yes' }).isCorrect, false, `${label}: the other verdict is wrong`);
  }
});

test('factorZero: the steps substitute THIS question\'s numbers and the check divides by (x − r)', () => {
  const { model } = assertReviewGradesCorrect(q({ coefficients: [1, -5, 6], candidateRoot: 2 }), 'sample');
  assert.deepEqual(model.items.map((item) => item.label), ['P(2)', 'Is (x − 2) a factor?']);
  assert.equal(model.steps[0], 'Substitute $x = 2$ into $P(x) = x^{2} - 5x + 6$: $P(2) = (2)^{2} - 5(2) + 6$.');
  assert.equal(model.steps[1], 'Work out each term and add: $P(2) = 4 - 10 + 6 = 0$.');
  assert.match(model.why, /\$x\^\{2\} - 5x \+ 6 = \(x - 2\)\(x - 3\)\$/, 'a factor divides out with remainder 0');

  const negative = assertReviewGradesCorrect(q({ coefficients: [1, 2], candidateRoot: -5 }), 'negative r').model;
  assert.deepEqual(negative.items.map((item) => item.label), ['P(−5)', 'Is (x + 5) a factor?']);
  assert.ok(negative.steps.some((step) => step.includes('$(x - (-5))$, that is $(x + 5)$')), 'x − (−5) is written as x + 5');
  assert.match(negative.why, /remainder \$-3\$ — the same number as \$P\(-5\)\$/);
});

test('factorZero: an unknown, padded or missing mode is the FactorZero screen, as the grader reads it', () => {
  for (const mode of [undefined, '', ' division ', 'Division', 3]) {
    const question = q({ mode, coefficients: [1, -1], candidateRoot: 1 });
    const { model, mode: graded } = assertReviewGradesCorrect(question, `mode ${JSON.stringify(mode)}`);
    assert.equal(graded, 'factorZero');
    assert.equal(model.title, 'Factor Theorem solution');
  }
  // An authored question that names only the tool gets the demonstration problem the screen shows.
  const { model } = assertReviewGradesCorrect({ type: TOOL_ID }, 'unauthored');
  assert.equal(model.items[0].label, `P(${DEFAULTS.factorZero.candidateRoot})`);
});

/* ------------------------------------------------------------------ */
/* multiplyArea                                                        */
/* ------------------------------------------------------------------ */

test('multiplyArea: the four area cells and the expanded coefficients', () => {
  const cases = [
    [q({ mode: 'multiplyArea', leftBinomial: [2, 3], rightBinomial: [1, -4] }), ['2', '-8', '3', '-12'], '2, -5, -12'],
    [q({ mode: 'multiplyArea' }), ['2', '-8', '3', '-12'], '2, -5, -12'],
    [q({ mode: 'multiplyArea', leftBinomial: [1, 2], rightBinomial: [1, -2] }), ['1', '-2', '2', '-4'], '1, 0, -4'],
    [q({ mode: 'multiplyArea', leftBinomial: [3, -1], rightBinomial: [2, 5] }), ['6', '15', '-2', '-5'], '6, 13, -5'],
    [q({ mode: 'multiplyArea', leftBinomial: [-1, 4], rightBinomial: [1, 1] }), ['-1', '-1', '4', '4'], '-1, 3, 4'],
    [q({ mode: 'multiplyArea', leftBinomial: [0.5, 1], rightBinomial: [2, -6] }), ['1', '-3', '2', '-6'], '1, -1, -6'],
    [q({ mode: 'multiplyArea', leftBinomial: [2, 0], rightBinomial: [1, -3] }), ['2', '-6', '0', '0'], '2, -6, 0'],
  ];
  for (const [question, cells, expanded] of cases) {
    const label = `(${question.leftBinomial ?? 'default'})(${question.rightBinomial ?? 'default'})`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.deepEqual(work.cells, cells, `${label}: cells`);
    assert.equal(work.expanded, expanded, `${label}: expanded`);
    assert.ok(model.steps.at(-1).endsWith(`${expanded}.`), `${label}: the last step reaches the coefficient list`);
    assert.equal(grade(question, { ...work, expanded: expanded.split(', ').reverse().join(', ') }).isCorrect, expanded.split(', ').reverse().join(', ') === expanded, `${label}: order matters`);
  }
});

test('multiplyArea: a zero x coefficient is stated and explained, and the check substitutes a value', () => {
  const { model } = assertReviewGradesCorrect(q({ mode: 'multiplyArea', leftBinomial: [1, 2], rightBinomial: [1, -2] }), 'difference of squares');
  assert.ok(model.steps.some((step) => step.includes('$-2x + 2x = 0$') && /still has to be entered/.test(step)));
  assert.match(model.why, /\$\(x \+ 2\)\(x - 2\)\$ is \$3 \\cdot \(-1\) = -3\$, and \$x\^\{2\} - 4\$ is \$1 - 4 = -3\$/);
});

/* ------------------------------------------------------------------ */
/* factorQuadratic                                                     */
/* ------------------------------------------------------------------ */

test('factorQuadratic: the integer pair p, q, in either order', () => {
  const cases = [
    [q({ mode: 'factorQuadratic', coefficients: [1, -5, 6] }), ['-2', '-3'], '$(x - 2)(x - 3)$'],
    [q({ mode: 'factorQuadratic' }), ['-2', '-3'], '$(x - 2)(x - 3)$'],
    [q({ mode: 'factorQuadratic', coefficients: [1, 3, -10] }), ['-2', '5'], '$(x - 2)(x + 5)$'],
    [q({ mode: 'factorQuadratic', coefficients: [1, 6, 9] }), ['3', '3'], '$(x + 3)^{2}$'],
    [q({ mode: 'factorQuadratic', coefficients: [1, 0, -9] }), ['-3', '3'], '$(x - 3)(x + 3)$'],
    [q({ mode: 'factorQuadratic', coefficients: [1, -5, 0] }), ['0', '-5'], '$x(x - 5)$'],
    [q({ mode: 'factorQuadratic', coefficients: ['1', '7', '12'] }), ['3', '4'], '$(x + 3)(x + 4)$'],
    [q({ mode: 'factorQuadratic', coefficients: [1, -2, -360] }), ['18', '-20'], '$(x + 18)(x - 20)$'],
  ];
  for (const [question, pair, factored] of cases) {
    const label = JSON.stringify(question.coefficients ?? 'default');
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.deepEqual([work.p, work.q], pair, `${label}: p, q`);
    assert.equal(itemValue(model, 'Factored form'), factored, `${label}: factored form`);
    assert.equal(grade(question, { p: work.q, q: work.p }).isCorrect, true, `${label}: either order is right`);
    // The zeros are the opposites of p and q — and typing the zeros is wrong
    // (unless they are the same numbers, as for x² − 9 = (x − 3)(x + 3)).
    const zeros = { p: String(-Number(work.p)), q: String(-Number(work.q)) };
    const zerosAreTheAnswer = [Number(zeros.p), Number(zeros.q)].sort((a, b) => a - b).join() === [Number(work.p), Number(work.q)].sort((a, b) => a - b).join();
    assert.equal(grade(question, zeros).isCorrect, zerosAreTheAnswer, `${label}: the zeros are not p and q`);
    assert.match(model.note, /opposites of the zeros/);
  }
});

test('factorQuadratic: the pair list shows THIS constant term\'s pairs and their sums', () => {
  const { model } = assertReviewGradesCorrect(q({ mode: 'factorQuadratic', coefficients: [1, -5, 6] }), 'sample');
  assert.equal(model.steps[1], 'List the integer pairs with product $6$ and add each pair: $1$ and $6$ (sum $7$); $-1$ and $-6$ (sum $-7$); $2$ and $3$ (sum $5$); $-2$ and $-3$ (sum $-5$). Only one pair adds to $-5$.');
  assert.equal(model.why, 'Multiply the factors back: $(x - 2)(x - 3) = x^{2} - 3x - 2x + 6 = x^{2} - 5x + 6$, the original quadratic.');
});

test('factorQuadratic with no integer factor pair has no review: the grader can mark nothing right', () => {
  for (const coefficients of [[1, 1, 1], [1, -1, -360], [2, -5, 2], [1, 0.5, -3], [1, -5]]) {
    const question = q({ mode: 'factorQuadratic', coefficients });
    assert.equal(integerFactorPairForMonicQuadratic(coefficients), null, `${JSON.stringify(coefficients)}: the grader has no key`);
    assert.equal(buildPolynomialWorkshopReview(question), null, `${JSON.stringify(coefficients)}: no review`);
  }
});

/* ------------------------------------------------------------------ */
/* division                                                            */
/* ------------------------------------------------------------------ */

test('division: the quotient and remainder coefficient lists', () => {
  const cases = [
    [q({ toolId: TOOL_ID, mode: 'division', difficultyBand: 3, dok: 2, dividend: [1, -4, -7, 10], divisor: [1, -2] }), '1, -2, -11', '-12'],
    [q({ mode: 'division' }), '1, -2, -11', '-12'],
    [q({ mode: 'division', divisor: [1, 2] }), '1, -6, 5', '0'],
    [q({ mode: 'division', dividend: [1, 0, -4], divisor: [1, -2] }), '1, 2', '0'],
    [q({ mode: 'division', dividend: [2, 5, -3], divisor: [1, 3] }), '2, -1', '0'],
    [q({ mode: 'division', dividend: [1, 0, 0, 1], divisor: [1, 0, 1] }), '1, 0', '-1, 1'],
    [q({ mode: 'division', dividend: [2, -3, 0, 5], divisor: [2, -1] }), '1, -1, -0.5', '4.5'],
    [q({ mode: 'division', dividend: [1, 0, 0, 0, -1], divisor: [1, -1] }), '1, 1, 1, 1', '0'],
    [q({ mode: 'division', dividend: [6, 0, -2], divisor: [2] }), '3, 0, -1', '0'],
    [q({ mode: 'division', dividend: [3, 2], divisor: [1, 0, 1] }), '0', '3, 2'],
  ];
  for (const [question, quotient, remainder] of cases) {
    const label = `${JSON.stringify(question.dividend ?? 'default')} ÷ ${JSON.stringify(question.divisor ?? 'default')}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.equal(work.quotient, quotient, `${label}: quotient`);
    assert.equal(work.remainder, remainder, `${label}: remainder`);
    assert.ok(model.steps.at(-1).includes(`quotient ${quotient}, remainder ${remainder}.`), `${label}: the last step states both lists`);
    assert.match(model.why, /must give back the dividend/, `${label}: the check rebuilds the dividend`);
  }
});

test('division: each round of the long division shows THIS question\'s terms', () => {
  const { model } = assertReviewGradesCorrect(q({ mode: 'division' }), 'default');
  assert.deepEqual(model.steps.slice(1, 4), [
    'Divide the leading terms: $x^{3} \\div x = x^{2}$. Multiply back: $x^{2}(x - 2) = x^{3} - 2x^{2}$. Subtract: $(x^{3} - 4x^{2} - 7x + 10) - (x^{3} - 2x^{2}) = -2x^{2} - 7x + 10$.',
    'Divide the leading terms: $-2x^{2} \\div x = -2x$. Multiply back: $-2x(x - 2) = -2x^{2} + 4x$. Subtract: $(-2x^{2} - 7x + 10) - (-2x^{2} + 4x) = -11x + 10$.',
    'Divide the leading terms: $-11x \\div x = -11$. Multiply back: $-11(x - 2) = -11x + 22$. Subtract: $(-11x + 10) - (-11x + 22) = -12$.',
  ]);
  assert.equal(model.why, 'Check: divisor × quotient + remainder must give back the dividend: $(x - 2)(x^{2} - 2x - 11) + (-12) = x^{3} - 4x^{2} - 7x + 22 - 12 = x^{3} - 4x^{2} - 7x + 10$. The divisor is 0 at $x = 2$, and the dividend\'s value there is $-12$ — the remainder again (the Remainder Theorem).');
  const gap = assertReviewGradesCorrect(q({ mode: 'division', dividend: [1, 0, 0, 1], divisor: [1, 0, 1] }), 'missing power').model;
  assert.ok(gap.steps.some((step) => /has no \$x\^\{2\}\$ term, so the next quotient term is 0/.test(step)), 'a zero quotient term is explained');
});

test('division with a quotient that is no terminating decimal has no review: a coefficient list cannot hold 1/3', () => {
  const question = q({ mode: 'division', dividend: [1, -4, -7, 10], divisor: [3, 1] });
  assert.ok(polynomialLongDivide(question.dividend, question.divisor).quotient.some((value) => !Number.isInteger(value * 1e6)));
  assert.equal(buildPolynomialWorkshopReview(question), null);
});

/* ------------------------------------------------------------------ */
/* graphConnection                                                     */
/* ------------------------------------------------------------------ */

test('graphConnection: crosses or touches at the target zero, and the end behavior', () => {
  const cases = [
    [q({ toolId: TOOL_ID, mode: 'graphConnection', difficultyBand: 4, dok: 3, roots: [{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }], leadingCoefficient: 0.35, targetRoot: -2 }), 'touches and turns', 'left falls, right rises'],
    [q({ mode: 'graphConnection' }), 'touches and turns', 'left falls, right rises'],
    [q({ mode: 'graphConnection', leadingCoefficient: -1 }), 'touches and turns', 'left rises, right falls'],
    [q({ mode: 'graphConnection', targetRoot: 3 }), 'crosses the x-axis', 'left falls, right rises'],
    [q({ mode: 'graphConnection', roots: [{ root: -1, multiplicity: 2 }, { root: 1, multiplicity: 3 }], leadingCoefficient: -2, targetRoot: 1 }), 'crosses the x-axis', 'left rises, right falls'],
    // An authored target that is no listed zero falls back to the first, as on screen.
    [q({ mode: 'graphConnection', roots: [{ root: -1, multiplicity: 2 }, { root: 1, multiplicity: 3 }], targetRoot: 9 }), 'touches and turns', 'left falls, right rises'],
    [q({ mode: 'graphConnection', roots: [{ root: 1, multiplicity: 1 }, { root: 2, multiplicity: 1 }] }), 'crosses the x-axis', 'both ends rise'],
    [q({ mode: 'graphConnection', roots: [{ root: 0, multiplicity: 4 }], leadingCoefficient: -1 }), 'touches and turns', 'both ends fall'],
    [q({ mode: 'graphConnection', roots: [{ root: 2 }, { root: -3, multiplicity: '2' }], leadingCoefficient: '3', targetRoot: '-3' }), 'touches and turns', 'left falls, right rises'],
  ];
  for (const [question, behavior, end] of cases) {
    const label = `${JSON.stringify(question.roots ?? 'default')} lc ${question.leadingCoefficient ?? 'default'} target ${question.targetRoot ?? 'default'}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.equal(itemValue(model, /^At the target zero/), behavior, `${label}: behavior`);
    assert.equal(itemValue(model, 'End behavior'), end, `${label}: end`);
    assert.equal(grade(question, { ...work, behavior: work.behavior === 'touches' ? 'crosses' : 'touches' }).isCorrect, false, `${label}: the other behavior is wrong`);
  }
});

test('graphConnection: the steps read the multiplicity, degree and leading sign of THIS polynomial', () => {
  const { model } = assertReviewGradesCorrect(q({ mode: 'graphConnection', roots: [{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }], leadingCoefficient: 0.35, targetRoot: -2 }), 'sample');
  assert.equal(model.steps[0], 'From its zeros and leading coefficient, $P(x) = 0.35(x + 2)^{2}(x - 3)$.');
  assert.ok(model.steps.some((step) => step.includes('multiplicity 2, an even number')));
  assert.ok(model.steps.some((step) => step.includes('$2 + 1 = 3$, which is odd')));
  assert.match(model.why, /\$P\(-2\.5\)\$ and \$P\(-1\.5\)\$ are both negative/);
  assert.match(model.why, /leading term \$0\.35x\^\{3\}\$/);
});

test('graphConnection: a screen whose key is not the graph\'s behavior has no review', () => {
  // The root 1 listed twice is a double zero (it touches), but the grader
  // reads the first entry, multiplicity 1, and keys "crosses".
  const twice = q({ mode: 'graphConnection', roots: [{ root: 1, multiplicity: 1 }, { root: 1, multiplicity: 1 }] });
  assert.equal(factorBehaviorAtRoot(graphConnectionTargetEntry(twice.roots).multiplicity), 'crosses');
  assert.equal(buildPolynomialWorkshopReview(twice), null);
  for (const question of [
    q({ mode: 'graphConnection', roots: [{ root: 1, multiplicity: null }] }),
    q({ mode: 'graphConnection', roots: [{ root: 1, multiplicity: 1.5 }] }),
    q({ mode: 'graphConnection', roots: [{ root: 1, multiplicity: 0 }] }),
    q({ mode: 'graphConnection', leadingCoefficient: 0 }),
    q({ mode: 'graphConnection', leadingCoefficient: '' }),
  ]) {
    assert.equal(buildPolynomialWorkshopReview(question), null, JSON.stringify(question));
  }
});

/* ------------------------------------------------------------------ */
/* rationalFeatures                                                    */
/* ------------------------------------------------------------------ */

test('rationalFeatures: hole, vertical asymptote, zero or none at the target value', () => {
  const sample = { numeratorRoots: [2, -1], denominatorRoots: [2, 4] };
  const cases = [
    [q({ toolId: TOOL_ID, mode: 'rationalFeatures', difficultyBand: 4, dok: 3, ...sample, targetValue: 2 }), 'Hole'],
    [q({ mode: 'rationalFeatures', ...sample, targetValue: 4 }), 'Vertical asymptote'],
    [q({ mode: 'rationalFeatures', ...sample, targetValue: '4' }), 'Vertical asymptote'],
    [q({ mode: 'rationalFeatures', ...sample, targetValue: -1 }), 'Zero / x-intercept'],
    [q({ mode: 'rationalFeatures', ...sample, targetValue: 7 }), 'None of these'],
    // No target: the smallest root, as on screen.
    [q({ mode: 'rationalFeatures' }), 'Zero / x-intercept'],
    [q({ mode: 'rationalFeatures', numeratorRoots: [3], denominatorRoots: [3, 3], targetValue: 3 }), 'Vertical asymptote'],
    [q({ mode: 'rationalFeatures', numeratorRoots: [2, 2], denominatorRoots: [2], targetValue: 2 }), 'Hole'],
    [q({ mode: 'rationalFeatures', numeratorRoots: [], denominatorRoots: [0, 5], targetValue: 0 }), 'Vertical asymptote'],
  ];
  for (const [question, feature] of cases) {
    const label = `${JSON.stringify(question.numeratorRoots ?? 'default')} / ${JSON.stringify(question.denominatorRoots ?? 'default')} at ${question.targetValue ?? 'default'}`;
    const { model, work } = assertReviewGradesCorrect(question, label);
    assert.equal(model.items[0].value, feature, `${label}: feature`);
    for (const other of ['hole', 'verticalAsymptote', 'zero', 'none'].filter((choice) => choice !== work.choice)) {
      assert.equal(grade(question, { ...work, choice: other }).isCorrect, false, `${label}: ${other} is wrong`);
    }
  }
});

test('rationalFeatures: the steps cancel THIS function\'s common factors and the check substitutes the value', () => {
  const sample = { numeratorRoots: [2, -1], denominatorRoots: [2, 4] };
  const hole = assertReviewGradesCorrect(q({ mode: 'rationalFeatures', ...sample, targetValue: 2 }), 'hole').model;
  assert.equal(hole.steps[0], 'Write each root as a factor: $f(x) = \\frac{(x - 2)(x + 1)}{(x - 2)(x - 4)}$.');
  assert.ok(hole.steps[1].includes('1 copy cancels: $f(x) = \\frac{x + 1}{x - 4}$'));
  assert.match(hole.why, /skips the single point \$\(2, -1\.5\)\$/);
  // Nothing cancels at x = 4: the ORIGINAL numerator there is (4 − 2)(4 + 1) = 10.
  const asymptote = assertReviewGradesCorrect(q({ mode: 'rationalFeatures', ...sample, targetValue: 4 }), 'asymptote').model;
  assert.match(asymptote.why, /the denominator is 0 but the numerator is \$10\$, not 0/);
  const zero = assertReviewGradesCorrect(q({ mode: 'rationalFeatures', ...sample, targetValue: -1 }), 'zero').model;
  assert.match(zero.why, /the denominator is \$15\$, not 0, so \$f\(-1\) = \\frac\{0\}\{15\} = 0\$/);
});

/* ------------------------------------------------------------------ */
/* a compiled V5 question                                              */
/* ------------------------------------------------------------------ */

test('questions compiled from V5 authoring are explained and graded correct', () => {
  const compile = (question) => compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Polynomials', courseId: 'algebra2', instructionalPurpose: 'review', gradingPurpose: 'classwork' },
    sections: [{ role: 'classwork', title: 'Classwork', questions: [{ standard: 'A2.7B', dok: 2, difficultyBand: 2, ...question }] }],
  }).package.sections[0].questions[0];
  const divide = compile({ prompt: 'Divide.', studentActions: ['dividePolynomial'], polynomial: { dividend: [2, 5, -3], divisor: [1, 3] } });
  assert.equal(divide.type, TOOL_ID);
  assert.deepEqual(assertReviewGradesCorrect(divide, 'compiled division').work, { quotient: '2, -1', remainder: '0' });
  const multiply = compile({ prompt: 'Multiply.', studentActions: ['multiplyPolynomials'], polynomial: { leftBinomial: [3, -1], rightBinomial: [2, 5] } });
  assert.deepEqual(assertReviewGradesCorrect(multiply, 'compiled area model').work, { cells: ['6', '15', '-2', '-5'], expanded: '6, 13, -5' });
  const factor = compile({ prompt: 'Factor.', studentActions: ['factorPolynomial'], polynomial: { coefficients: [1, 3, -10] } });
  assert.deepEqual(assertReviewGradesCorrect(factor, 'compiled factoring').work, { p: '-2', q: '5' });
});

/* ------------------------------------------------------------------ */
/* a seeded sweep: whatever the review states is graded correct        */
/* ------------------------------------------------------------------ */

test('a seeded sweep of integer questions in every view: each review states an answer the grader accepts', () => {
  let seed = 20261007;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const int = (low, high) => low + Math.floor(random() * (high - low + 1));
  const nonZero = (low, high) => {
    const value = int(low, high);
    return value === 0 ? 1 : value;
  };
  const list = (length, low, high) => [nonZero(low, high), ...Array.from({ length: length - 1 }, () => int(low, high))];
  const make = {
    factorZero: () => q({ mode: 'factorZero', coefficients: list(int(2, 5), -6, 6), candidateRoot: int(-4, 4) }),
    multiplyArea: () => q({ mode: 'multiplyArea', leftBinomial: [nonZero(-5, 5), int(-9, 9)], rightBinomial: [nonZero(-5, 5), int(-9, 9)] }),
    factorQuadratic: () => {
      const [p, qv] = [int(-12, 12), int(-12, 12)];
      return q({ mode: 'factorQuadratic', coefficients: random() < 0.8 ? [1, p + qv, p * qv] : [1, int(-9, 9), int(-20, 20)] });
    },
    division: () => q({ mode: 'division', dividend: list(int(2, 6), -9, 9), divisor: random() < 0.7 ? [1, int(-5, 5)] : [random() < 0.5 ? 1 : 2, int(-3, 3), int(-3, 3)] }),
    graphConnection: () => {
      const roots = [...new Set(Array.from({ length: int(1, 4) }, () => int(-5, 5)))].map((root) => ({ root, multiplicity: int(1, 4) }));
      return q({ mode: 'graphConnection', roots, leadingCoefficient: nonZero(-3, 3), targetRoot: roots[int(0, roots.length - 1)].root });
    },
    rationalFeatures: () => q({
      mode: 'rationalFeatures',
      numeratorRoots: Array.from({ length: int(0, 3) }, () => int(-4, 4)),
      denominatorRoots: Array.from({ length: int(1, 3) }, () => int(-4, 4)),
      targetValue: int(-5, 5),
    }),
  };
  const stated = {};
  for (const [mode, build] of Object.entries(make)) {
    stated[mode] = 0;
    for (let index = 0; index < 60; index += 1) {
      const question = build();
      const label = `${mode} ${JSON.stringify(question)}`;
      let model;
      assert.doesNotThrow(() => { model = buildPolynomialWorkshopReview(question); }, label);
      // Integer classroom questions are explained, not skipped: the only ones
      // without a review are quadratics with no integer factor pair, where the
      // grader has no key at all. (Division here is by a divisor led by 1 or
      // 2, so every coefficient terminates.)
      const hasKey = mode !== 'factorQuadratic' || integerFactorPairForMonicQuadratic(question.coefficients) !== null;
      assert.equal(model !== null, hasKey, `${label}: a review exactly when the grader has a key`);
      if (!model) continue;
      stated[mode] += 1;
      assertReviewGradesCorrect(question, label);
    }
  }
  assert.ok(Object.values(stated).every((count) => count >= 40), `the sweep explains questions in every view: ${JSON.stringify(stated)}`);
});
