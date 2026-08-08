import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  integerFactorPairForMonicQuadratic,
  polynomialLongDivide,
  polynomialMultiply,
  rationalFeatureMap,
} from '../../src/tools/polynomialWorkshop/polynomialMath.js';
import {
  buildSignIntervals,
  solutionPiecesForRelation,
  validRadicalCandidates,
} from '../../src/tools/signSolutionAnalyzer/signSolutionMath.js';
import {
  geometryFromFocusDirectrix,
  parabolaFeatures,
  pointDistances,
  sampleParabolaPoint,
  standardEquationParts,
} from '../../src/tools/parabolaGeometry/parabolaGeometryMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

test('polynomial multiplication and long division are exact', () => {
  assert.deepEqual(polynomialMultiply([1, 2], [1, -3]), [1, -1, -6]);
  const division = polynomialLongDivide([1, -4, -7, 10], [1, -2]);
  assert.deepEqual(division.quotient, [1, -2, -11]);
  assert.deepEqual(division.remainder, [-12]);
});

test('monic quadratic factor pair uses sum/product structure', () => {
  assert.deepEqual(integerFactorPairForMonicQuadratic([1, -5, 6]), [-3, -2]);
  assert.equal(integerFactorPairForMonicQuadratic([2, 3, 1]), null);
});

test('multiplicity and leading term determine graph behavior', () => {
  assert.equal(factorBehaviorAtRoot(2), 'touches');
  assert.equal(factorBehaviorAtRoot(3), 'crosses');
  const coefficients = coefficientsFromRoots([{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }], 1);
  assert.deepEqual(coefficients, [1, 1, -8, -12]);
  assert.deepEqual(endBehavior(coefficients), { left: 'down', right: 'up', label: 'left falls, right rises' });
});

test('rational cancellation distinguishes holes, zeros, and vertical asymptotes', () => {
  const features = rationalFeatureMap({ numeratorRoots: [2, -1], denominatorRoots: [2, 4] });
  assert.equal(features.find((f) => f.root === 2).type, 'hole');
  assert.equal(features.find((f) => f.root === -1).type, 'zero');
  assert.equal(features.find((f) => f.root === 4).type, 'verticalAsymptote');
});

test('rational sign chart preserves denominator exclusions and inclusive numerator zeros', () => {
  const spec = {
    numeratorFactors: [{ root: -2, multiplicity: 1 }, { root: 3, multiplicity: 1 }],
    denominatorFactors: [{ root: 1, multiplicity: 1 }],
  };
  const analysis = buildSignIntervals(spec, '>=');
  assert.deepEqual(analysis.intervals.map((i) => i.sign), [-1, 1, -1, 1]);
  const pieces = solutionPiecesForRelation(spec, '>=');
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces[0], { left: -2, right: 1, leftClosed: true, rightClosed: false });
  assert.deepEqual(pieces[1], { left: 3, right: Infinity, leftClosed: true, rightClosed: false });
});

test('even multiplicity does not flip polynomial sign', () => {
  const spec = { numeratorFactors: [{ root: 2, multiplicity: 2 }], denominatorFactors: [] };
  const analysis = buildSignIntervals(spec, '>');
  assert.deepEqual(analysis.intervals.map((i) => i.sign), [1, 1]);
});

test('radical candidate verification rejects domain and extraneous values', () => {
  const spec = { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } };
  assert.deepEqual(validRadicalCandidates(spec, [3, -15]), [3]);
});

test('parabola geometry returns focus, directrix, latus rectum, and opening', () => {
  const features = parabolaFeatures({ h: 1, k: -1, p: 2, orientation: 'vertical' });
  assert.deepEqual(features.focus, [1, 1]);
  assert.deepEqual(features.directrix, { kind: 'horizontal', value: -3 });
  assert.equal(features.latusRectumLength, 8);
  assert.equal(features.opens, 'up');
  assert.deepEqual(standardEquationParts({ h: 1, k: -1, p: 2, orientation: 'vertical' }).coefficient, 8);
});

test('horizontal parabola geometry and focus/directrix reconstruction work', () => {
  const spec = geometryFromFocusDirectrix({ focus: [5, 2], directrix: { kind: 'vertical', value: 1 } });
  assert.deepEqual(spec, { h: 3, k: 2, p: 2, orientation: 'horizontal' });
  const features = parabolaFeatures(spec);
  assert.deepEqual(features.focus, [5, 2]);
  assert.deepEqual(features.directrix, { kind: 'vertical', value: 1 });
});

test('sampled parabola point is equidistant from focus and directrix', () => {
  const spec = { h: 0, k: 0, p: 2, orientation: 'vertical' };
  const point = sampleParabolaPoint(spec, 4);
  const distances = pointDistances(spec, point);
  assert.equal(distances.onParabola, true);
  assert.ok(Math.abs(distances.difference) < 1e-9);
});

test('batch B schemas reject unsupported modes and unsafe definitions', () => {
  assert.equal(validateToolQuestion({ toolId: 'polynomialWorkshop', mode: 'division', dividend: [1, 2], divisor: [0, 0], masteryEvidenceKeys:['texas:2A.7B'] }).isValid, false);
  assert.equal(validateToolQuestion({ toolId: 'signSolutionAnalyzer', mode: 'rational', denominatorFactors: [], masteryEvidenceKeys:['texas:2A.7C'] }).isValid, false);
  assert.equal(validateToolQuestion({ toolId: 'parabolaGeometryLab', mode: 'fromGeometry', focus: [1, 2], directrix: { kind: 'diagonal', value: 0 }, masteryEvidenceKeys:['texas:2A.6A'] }).isValid, false);
});
