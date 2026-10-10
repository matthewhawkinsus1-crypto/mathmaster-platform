import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';
import Fraction from 'fraction.js';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generateQuestion } from '../../src/problemGenerator.js';

/*
 * JOB K FOLLOW-UP — THE V5 COMPILER MUST NOT GRADE A DIFFERENT PROBLEM FROM
 * THE ONE SHOWN.
 *
 * Three tool branches of the compiler dropped (or overrode) values their
 * grader reads, so the student was graded against the tool's default problem:
 *
 *   parabolaGeometryLab  `point` / `offset` (equidistance view);
 *   polynomialWorkshop   `candidateRoot`, `numeratorRoots`, `targetValue`,
 *                        `leadingCoefficient`, `targetRoot`;
 *   signSolutionAnalyzer a chart with denominatorFactors and no mode compiled
 *                        as 'polynomial', so the denominator was ignored.
 *
 * Each case compiles an authored V5 question, recomputes the key here from
 * the authored mathematics alone (mathjs / fraction.js, no MathMaster code),
 * and checks the shared grader marks that key right and the key of the
 * default problem wrong.
 */

const math = create(all);
const OWN = { choicesOpenUnanswered: true };

const compileOne = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'K follow compiler drops', courseId: 'algebra2' },
  sections: [{ role: 'classwork', questions: [{ standard: '2A.4B', ...question }] }],
}).package.sections[0].questions[0];

// Graded by the tool the compiler routed the question to.
const grade = (toolId, question, work) => {
  assert.equal(question.type, toolId);
  return gradeToolWork({ toolId, question, work });
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// parabolaGeometryLab — equidistance from the P the prompt names.

// x² = 4p(y − k) shifted by h: focus (h, k + p), directrix y = k − p.
const equidistanceKey = ({ h, k, p }, [x, y]) => {
  const focusDistance = Number(math.sqrt(math.add(math.pow(x - h, 2), math.pow(y - (k + p), 2))));
  const directrixDistance = Math.abs(y - (k - p));
  return { focusDistance, directrixDistance, onCurve: near(focusDistance, directrixDistance) ? 'yes' : 'no' };
};
const asWork = (key) => ({ focusDistance: key.focusDistance.toFixed(4), directrixDistance: key.directrixDistance.toFixed(4), onCurve: key.onCurve });

// The default problem the old compile graded: P sampled at offset 4, i.e.
// x = h + 4 on the parabola.
const defaultEquidistanceKey = (spec) => {
  const x = spec.h + 4;
  const y = new Fraction(x - spec.h).pow(2).div(4 * spec.p).add(spec.k).valueOf();
  return equidistanceKey(spec, [x, y]);
};

test('parabolaGeometryLab equidistance: an authored P is the point graded, on the question or in parabola', () => {
  const spec = { h: 0, k: 0, p: 2 };
  for (const authored of [
    { point: [4, 1], parabola: { ...spec, orientation: 'vertical' } },
    { parabola: { ...spec, orientation: 'vertical', point: [4, 1] } },
  ]) {
    const question = compileOne({ prompt: 'For x² = 8y, find the distances from P(4, 1) to the focus and to the directrix. Is P on the parabola?', studentActions: ['analyzeParabolaGeometry'], mode: 'equidistance', ...authored });
    assert.deepEqual(question.point, [4, 1]);
    const key = equidistanceKey(spec, [4, 1]);
    assert.equal(key.onCurve, 'no');
    assert.equal(grade('parabolaGeometryLab', question, asWork(key)).isCorrect, true);
    // The default problem's P (4, 2) is on the parabola at distance 4 from both.
    const old = defaultEquidistanceKey(spec);
    assert.equal(old.onCurve, 'yes');
    assert.equal(grade('parabolaGeometryLab', question, asWork(old)).isCorrect, false);
  }
});

test('parabolaGeometryLab equidistance: an authored offset samples P where the author put it', () => {
  const spec = { h: 1, k: -2, p: 1 };
  const question = compileOne({ prompt: 'P is the point of (x − 1)² = 4(y + 2) with x = 7. Find its distances to the focus and to the directrix.', studentActions: ['analyzeParabolaGeometry'], mode: 'equidistance', parabola: { ...spec, orientation: 'vertical', offset: 6 } });
  assert.equal(question.offset, 6);
  const y = new Fraction(6).pow(2).div(4).add(-2).valueOf();
  const key = equidistanceKey(spec, [7, y]);
  assert.equal(grade('parabolaGeometryLab', question, asWork(key)).isCorrect, true);
  assert.equal(grade('parabolaGeometryLab', question, asWork(defaultEquidistanceKey(spec))).isCorrect, false);
});

test('parabolaGeometryLab: a question without point or offset gets none manufactured (the lab default applies, as before)', () => {
  const question = compileOne({ prompt: 'Analyze parabola geometry.', studentActions: ['analyzeParabolaGeometry'], mode: 'equidistance', parabola: { h: 0, k: 0, p: 2, orientation: 'vertical' } });
  assert.equal('point' in question, false);
  assert.equal('offset' in question, false);
});

// ---------------------------------------------------------------------------
// polynomialWorkshop — factorZero, graphConnection, rationalFeatures.

const evalPoly = (coefficients, x) => coefficients.reduce((acc, c) => acc.mul(x).add(c), new Fraction(0));

test('polynomialWorkshop factorZero: the authored candidate root is the r graded', () => {
  const coefficients = [2, -3, 0, 5];
  const question = compileOne({ prompt: 'Let P(x) = 2x³ − 3x² + 5. Evaluate P(−1). Is (x + 1) a factor of P?', studentActions: ['factorPolynomial'], mode: 'factorZero', polynomial: { coefficients, candidateRoot: -1 } });
  assert.equal(question.candidateRoot, -1);
  const value = evalPoly(coefficients, -1);
  assert.equal(value.valueOf(), 0);
  assert.equal(grade('polynomialWorkshop', question, { value: value.toString(), factorChoice: 'yes' }).isCorrect, true);
  // The default r = 2: P(2) = 9, not a factor.
  const old = evalPoly(coefficients, 2);
  assert.equal(grade('polynomialWorkshop', question, { value: old.toString(), factorChoice: old.equals(0) ? 'yes' : 'no' }).isCorrect, false);
});

test('polynomialWorkshop graphConnection: the authored leading coefficient and target root are graded', () => {
  const roots = [{ root: 1, multiplicity: 2 }, { root: -4, multiplicity: 1 }];
  const question = compileOne({ prompt: 'P(x) = −2(x − 1)²(x + 4). What does the graph do at x = −4, and what is its end behavior?', studentActions: ['factorPolynomial'], mode: 'graphConnection', polynomial: { roots, leadingCoefficient: -2, targetRoot: -4 } });
  const read = (expression, target) => {
    const f = math.compile(expression);
    const at = (x) => f.evaluate({ x });
    return {
      behavior: Math.sign(at(target - 1e-3)) === Math.sign(at(target + 1e-3)) ? 'touches' : 'crosses',
      end: `${at(-1e6) > 0 ? 'left rises' : 'left falls'}, ${at(1e6) > 0 ? 'right rises' : 'right falls'}`
        .replace('left rises, right rises', 'both ends rise').replace('left falls, right falls', 'both ends fall'),
    };
  };
  const key = read('-2 * (x - 1)^2 * (x + 4)', -4);
  assert.deepEqual(key, { behavior: 'crosses', end: 'left rises, right falls' });
  assert.equal(grade('polynomialWorkshop', question, { ...key, ...OWN }).isCorrect, true);
  // The default problem: leading coefficient 1, target the first root (1).
  const old = read('(x - 1)^2 * (x + 4)', 1);
  assert.deepEqual(old, { behavior: 'touches', end: 'left falls, right rises' });
  assert.equal(grade('polynomialWorkshop', question, { ...old, ...OWN }).isCorrect, false);
});

test('polynomialWorkshop rationalFeatures: the authored numerator and target value are graded', () => {
  const question = compileOne({ prompt: 'f(x) = (x − 3)/((x − 3)(x + 1)). What happens at x = −1?', studentActions: ['analyzeRationalFunction'], mode: 'rationalFeatures', polynomial: { numeratorRoots: [3], denominatorRoots: [3, -1], targetValue: -1 } });
  assert.deepEqual(question.numeratorRoots, [3]);
  assert.equal(question.targetValue, -1);
  const feature = (numeratorRoots, denominatorRoots, x) => {
    const count = (roots) => roots.filter((r) => r === x).length;
    const n = count(numeratorRoots);
    const d = count(denominatorRoots);
    if (d === 0) return n > 0 ? 'zero' : 'none';
    return n >= d ? 'hole' : 'verticalAsymptote';
  };
  const key = feature([3], [3, -1], -1);
  assert.equal(key, 'verticalAsymptote');
  assert.equal(grade('polynomialWorkshop', question, { choice: key, ...OWN }).isCorrect, true);
  // The default problem: numerator roots 2, −1 over the authored denominator,
  // asked at the smallest root (−1), where it is a hole.
  const old = feature([2, -1], [3, -1], -1);
  assert.equal(old, 'hole');
  assert.equal(grade('polynomialWorkshop', question, { choice: old, ...OWN }).isCorrect, false);
});

test('polynomialWorkshop: a question without these fields gets none manufactured (the workshop defaults apply, as before)', () => {
  const question = compileOne({ prompt: 'Factor the polynomial.', studentActions: ['factorPolynomial'], polynomial: { coefficients: [1, -5, 6] } });
  for (const key of ['candidateRoot', 'numeratorRoots', 'targetValue', 'leadingCoefficient', 'targetRoot']) assert.equal(key in question, false, key);
});

// ---------------------------------------------------------------------------
// signSolutionAnalyzer — denominator factors with no authored mode.

test('signSolutionAnalyzer: (x − 2)/(x + 3) ≥ 0 with no authored mode is graded as the rational inequality', () => {
  const question = compileOne({ prompt: 'Solve (x − 2)/(x + 3) ≥ 0.', studentActions: ['solveInequality'], signChart: { factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' } });
  assert.equal(question.mode, 'rational');
  // Intervals left to right between the sorted critical values −3 and 2.
  const solvedOn = (expression, cuts) => {
    const f = math.compile(expression);
    const edges = [-Infinity, ...cuts, Infinity];
    return edges.slice(0, -1).map((left, i) => {
      const right = edges[i + 1];
      const probe = !Number.isFinite(left) ? right - 1 : !Number.isFinite(right) ? left + 1 : (left + right) / 2;
      return f.evaluate({ x: probe }) >= 0 ? i : null;
    }).filter((i) => i !== null);
  };
  const key = solvedOn('(x - 2) / (x + 3)', [-3, 2]);
  assert.deepEqual(key, [0, 2]);
  assert.equal(grade('signSolutionAnalyzer', question, { selected: key }).isCorrect, true);
  // The old compile graded x − 2 ≥ 0: one cut at 2, solution (2, ∞), index 1.
  const old = solvedOn('x - 2', [2]);
  assert.deepEqual(old, [1]);
  assert.equal(grade('signSolutionAnalyzer', question, { selected: old }).isCorrect, false);
});

test('signSolutionAnalyzer: an authored mode wins, and no denominator stays polynomial', () => {
  const authored = compileOne({ prompt: 'Solve (x − 2) ≥ 0.', studentActions: ['solveInequality'], signChart: { mode: 'polynomial', factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' } });
  assert.equal(authored.mode, 'polynomial');
  const plain = compileOne({ prompt: 'Solve (x + 2)(x − 3) ≥ 0.', studentActions: ['solveInequality'], signChart: { factors: [-2, 3], relation: '>=' } });
  assert.equal(plain.mode, 'polynomial');
});

// ---------------------------------------------------------------------------
// fieldFromIntent — a family key written as one whole placeholder is a number.

const compileField = (field, extra = {}) => compileOne({ prompt: 'Answer.', studentActions: ['answerQuestion'], answerFields: [{ id: 'answer', label: 'Answer', ...field }], ...extra }).answerFields[0];

test('fieldFromIntent: a whole-placeholder key ("{{a}}") is not read as set notation', () => {
  for (const answer of ['{{a}}', ' {{ a }} ']) {
    const field = compileField({ inputProfile: 'number', answer }, { questionFamily: { familyId: 'k-follow', version: 1 }, generator: { variables: { a: { min: 2, max: 9 } } } });
    assert.notEqual(field.type, 'set', answer);
    assert.notEqual(field.toolProfile, 'set', answer);
  }
});

test('fieldFromIntent: a roster set key is still a set field', () => {
  for (const answer of ['{-4, -3, -2}', '{1}']) {
    const field = compileField({ answer });
    assert.equal(field.type, 'set', answer);
    assert.equal(field.toolProfile, 'set', answer);
  }
});

test('signSolutionAnalyzer: authored numeratorFactors (no factors) are the numerator graded', () => {
  for (const authored of [
    { numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' },
    { inequalityModel: { numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' } },
  ]) {
    const question = compileOne({ prompt: 'Solve (x − 2)/(x + 3) ≥ 0.', studentActions: ['solveInequality'], ...authored });
    assert.equal(question.mode, 'rational');
    // (x − 2)/(x + 3) ≥ 0 on (−∞, −3) and [2, ∞): intervals 0 and 2 of three.
    const f = math.compile('(x - 2) / (x + 3)');
    const key = [-4, -0.5, 3].map((probe, i) => (f.evaluate({ x: probe }) >= 0 ? i : null)).filter((i) => i !== null);
    assert.deepEqual(key, [0, 2]);
    assert.equal(grade('signSolutionAnalyzer', question, { selected: key }).isCorrect, true);
    // The default numerator (x + 2)(x − 3) over x + 3: cuts −3, −2, 3.
    const g = math.compile('(x + 2) * (x - 3) / (x + 3)');
    const old = [-4, -2.5, 0, 4].map((probe, i) => (g.evaluate({ x: probe }) >= 0 ? i : null)).filter((i) => i !== null);
    assert.deepEqual(old, [1, 3]);
    assert.equal(grade('signSolutionAnalyzer', question, { selected: old }).isCorrect, false);
  }
});

test('fieldFromIntent: a key built from several placeholders is not a set unless the author wrote set braces', () => {
  const family = { questionFamily: { familyId: 'k-follow', version: 1 }, generator: { variables: { a: { min: 2, max: 9 }, b: { min: 2, max: 9 } } } };
  // '{{a}}/{{b}}' starts with '{' and ends with '}', but every brace is a placeholder's.
  for (const answer of ['{{a}}/{{b}}', '{{a}}, {{b}}', '{{a}}x{{b|signed}}', '{{a|signed}}x{{b|signed}}', '{{a}}x + {{b}}']) {
    const field = compileField({ answer }, family);
    assert.notEqual(field.type, 'set', answer);
    assert.notEqual(field.toolProfile, 'set', answer);
  }
  // Braces the author wrote around placeholders still make a roster set.
  for (const answer of ['{ {{a}}, {{b}} }', '{{{a}}}']) {
    const field = compileField({ answer }, family);
    assert.equal(field.type, 'set', answer);
    assert.equal(field.toolProfile, 'set', answer);
  }
});

test('Assignments: the Digital SAT union-overlap response ({{union}}/{{total}}) is a number box', () => {
  const require = createRequire(import.meta.url);
  const { bankDocumentToV5Intent } = require('../../functions/lib/ccmrAssignmentBank.js');
  const bank = JSON.parse(readFileSync(new URL('../../functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json', import.meta.url), 'utf8')).documents;
  const item = bank.find((doc) => doc.id === 'mm_sat_native_prob_ch1_union-overlap_v21');
  assert.equal(item.responseFields[0].expected, '{{union}}/{{total}}');
  const template = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'K follow SPR', courseId: 'algebra1', instructionalPurpose: 'review', gradingPurpose: 'practice' },
    sections: [{ role: 'practice', title: 'Practice', questions: [bankDocumentToV5Intent(item)] }],
  }).package.sections[0].questions[0];
  const field = generateQuestion(template, 'k-follow-union-overlap').answerFields[0];
  assert.notEqual(field.type, 'set');
  assert.notEqual(field.toolProfile, 'set');
  assert.equal(field.answerFormat, 'number');
  // The generated key is a probability (a number in [0, 1]), not a set.
  const key = new Fraction(field.answer);
  assert.ok(key.compare(0) >= 0 && key.compare(1) <= 0, field.answer);
});

test('signSolutionAnalyzer: authored numeratorFactors win over authored factors, as the grader reads them', () => {
  // The grader and the tool read numeratorFactors || factors; the old compile
  // dropped numeratorFactors, so `factors` ((x − 1)(x − 3)) was graded instead of x − 5.
  const question = compileOne({ prompt: 'Solve x − 5 ≥ 0.', studentActions: ['solveInequality'], signChart: { mode: 'polynomial', factors: [{ root: 1 }, { root: 3 }], numeratorFactors: [{ root: 5 }], relation: '>=' } });
  const f = math.compile('x - 5');
  const key = [0, 6].map((probe, i) => (f.evaluate({ x: probe }) >= 0 ? i : null)).filter((i) => i !== null);
  assert.deepEqual(key, [1]);
  assert.equal(grade('signSolutionAnalyzer', question, { selected: key }).isCorrect, true);
  // The dropped-numerator problem (x − 1)(x − 3) ≥ 0: intervals 0 and 2 of three.
  const g = math.compile('(x - 1) * (x - 3)');
  const old = [0, 2, 4].map((probe, i) => (g.evaluate({ x: probe }) >= 0 ? i : null)).filter((i) => i !== null);
  assert.deepEqual(old, [0, 2]);
  assert.equal(grade('signSolutionAnalyzer', question, { selected: old }).isCorrect, false);
});
