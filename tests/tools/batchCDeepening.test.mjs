import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSequencesAt,
  generateSequence,
  inferSequenceKind,
  sequencePartialSum,
  sequenceRuleParts,
  sequenceTerm,
} from '../../src/tools/sequenceExplorer/sequenceMath.js';
import {
  complexAdd,
  complexConjugateValue,
  complexDivide,
  complexMagnitudeValue,
  complexMultiplyValues,
  complexPower,
  complexSubtract,
  normalizedQuarterTurns,
  quadraticRootsComplex,
  rotateByPowerOfI,
  sameComplexSet,
} from '../../src/tools/complexPlane/complexMath.js';
import {
  composeForwardAfterInverse,
  composeInverseAfterForward,
  equivalentExpLogValues,
  inverseLogValue,
  inversePairFeatures,
  inversePoint,
  solveExponentialLinearExponent,
  solveLogLinearArgument,
  transformedExponentialValue,
} from '../../src/tools/exponentialLog/exponentialLogMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

test('sequence term engine handles arithmetic and geometric rules', () => {
  const arithmetic = { kind: 'arithmetic', first: 4, difference: 3 };
  const geometric = { kind: 'geometric', first: 2, ratio: 2 };
  assert.equal(sequenceTerm(arithmetic, 8), 25);
  assert.equal(sequenceTerm(geometric, 6), 64);
  assert.deepEqual(generateSequence(arithmetic, 4).map((row) => row.value), [4, 7, 10, 13]);
});

test('sequence family inference distinguishes additive and multiplicative patterns', () => {
  assert.equal(inferSequenceKind([2, 5, 8, 11]), 'arithmetic');
  assert.equal(inferSequenceKind([3, 6, 12, 24]), 'geometric');
  assert.equal(inferSequenceKind([5, 5, 5, 5]), 'both');
  assert.equal(inferSequenceKind([1, 2, 4, 9]), 'neither');
});

test('sequence partial sums and explicit/recursive bridge agree', () => {
  assert.equal(sequencePartialSum({ kind: 'arithmetic', first: 4, difference: 3 }, 5), 50);
  assert.equal(sequencePartialSum({ kind: 'geometric', first: 2, ratio: 2 }, 4), 30);
  assert.equal(sequencePartialSum({ kind: 'geometric', first: 3, ratio: 1 }, 4), 12);
  assert.deepEqual(sequenceRuleParts({ kind: 'arithmetic', first: 4, difference: 3 }), {
    kind: 'arithmetic', first: 4, change: 3,
    explicitTemplate: 'aₙ = A + (n − 1)D', recursiveTemplate: 'a₁ = A; aₙ = aₙ₋₁ + D',
  });
});

test('sequence growth comparison evaluates both rules at the same index', () => {
  const result = compareSequencesAt(
    { kind: 'arithmetic', first: 5, difference: 4 },
    { kind: 'geometric', first: 1, ratio: 2 },
    7,
  );
  assert.deepEqual(result, { n: 7, left: 29, right: 64, relation: 'right', difference: 35 });
});

test('complex addition, subtraction, multiplication, and division are exact', () => {
  const z = { re: 2, im: 3 }; const w = { re: -1, im: 2 };
  assert.deepEqual(complexAdd(z, w), { re: 1, im: 5 });
  assert.deepEqual(complexSubtract(z, w), { re: 3, im: 1 });
  assert.deepEqual(complexMultiplyValues(z, w), { re: -8, im: 1 });
  assert.deepEqual(complexDivide({ re: 4, im: 2 }, { re: 1, im: -1 }), { re: 1, im: 3 });
});

test('complex conjugate, magnitude, powers, and rotation preserve expected geometry', () => {
  assert.deepEqual(complexConjugateValue({ re: 3, im: -4 }), { re: 3, im: 4 });
  assert.equal(complexMagnitudeValue({ re: 3, im: -4 }), 5);
  assert.deepEqual(complexPower({ re: 1, im: 1 }, 2), { re: 0, im: 2 });
  assert.deepEqual(complexPower({ re: 0, im: 1 }, -1), { re: 0, im: -1 });
  assert.deepEqual(rotateByPowerOfI({ re: 3, im: 1 }, 1), { re: -1, im: 3 });
  assert.equal(normalizedQuarterTurns(-1), 3);
});

test('quadratic formula returns an order-independent complex conjugate root pair', () => {
  const roots = quadraticRootsComplex({ a: 1, b: 2, c: 5 });
  assert.equal(sameComplexSet(roots, [{ re: -1, im: -2 }, { re: -1, im: 2 }]), true);
});

test('equivalent exponential and logarithmic forms preserve base/exponent/value roles', () => {
  const values = equivalentExpLogValues({ base: 3, exponent: 4 });
  assert.deepEqual({ base: values.base, exponent: values.exponent, value: values.value }, { base: 3, exponent: 4, value: 81 });
  close(values.logValue, 4);
});

test('exponential equation solver isolates a linear exponent with logarithms', () => {
  const solution = solveExponentialLinearExponent({ base: 2, m: 2, c: -1, rhs: 32 });
  assert.equal(solution.hasRealSolution, true);
  close(solution.exponentValue, 5);
  close(solution.x, 3);
  assert.equal(solveExponentialLinearExponent({ base: 2, m: 1, c: 0, rhs: -4 }).hasRealSolution, false);
});

test('logarithmic equation solver rewrites exponentially and verifies positive argument', () => {
  const solution = solveLogLinearArgument({ base: 3, m: 2, c: 1, result: 2 });
  assert.equal(solution.argumentValue, 9);
  assert.equal(solution.x, 4);
  assert.equal(solution.domainSatisfied, true);
});

test('transformed exponential/log inverse pair swaps points, range/domain, and asymptotes', () => {
  const spec = { a: 2, base: 2, h: 1, k: -3 };
  assert.equal(transformedExponentialValue(spec, 3), 5);
  close(inverseLogValue(spec, 5), 3);
  assert.deepEqual(inversePoint(spec, 3), { exponential: [3, 5], logarithm: [5, 3] });
  const features = inversePairFeatures(spec);
  assert.equal(features.exponentialHorizontalAsymptote, -3);
  assert.equal(features.logarithmVerticalAsymptote, -3);
  assert.equal(features.logarithmDomainSide, 'greater');
});

test('inverse compositions return their starting inputs on valid domains', () => {
  const spec = { a: 2, base: 2, h: 1, k: -3 };
  close(composeInverseAfterForward(spec, 3), 3);
  close(composeForwardAfterInverse(spec, 13), 13);
});

test('Batch C schemas accept representative deep-dive configurations', () => {
  const valid = [
    { toolId: 'sequenceExplorer', mode: 'partialSum', kind: 'geometric', sequence: { first: 3, ratio: 2 }, sumN: 5 },
    { toolId: 'complexPlaneLab', mode: 'division', z: { re: 4, im: 2 }, w: { re: 1, im: -1 } },
    { toolId: 'exponentialLogBridge', mode: 'inverse', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3 },
  ];
  valid.forEach((question) => assert.equal(validateToolQuestion({ ...question, masteryEvidenceKeys: ['texas:batch-c'] }).isValid, true));
});

test('Batch C schemas reject unsafe modes, indices, divisors, exponents, bases, and inverse domains', () => {
  const invalid = [
    { toolId: 'sequenceExplorer', mode: 'missingTerm', kind: 'arithmetic', sequence: { first: 1, difference: 2 }, missingIndex: 0 },
    { toolId: 'sequenceExplorer', mode: 'compare', left: { kind: 'arithmetic', first: 1, difference: 2 }, right: { kind: 'geometric', first: 1, ratio: 2 }, compareN: 0 },
    { toolId: 'complexPlaneLab', mode: 'division', z: { re: 1, im: 2 }, w: { re: 0, im: 0 } },
    { toolId: 'complexPlaneLab', mode: 'powers', z: { re: 1, im: 1 }, exponent: 1.5 },
    { toolId: 'exponentialLogBridge', mode: 'solveExponential', equation: { base: 1, m: 2, c: 0, rhs: 4 } },
    { toolId: 'exponentialLogBridge', mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, x: 1, y: 2 },
  ];
  invalid.forEach((question) => assert.equal(validateToolQuestion({ ...question, masteryEvidenceKeys: ['texas:batch-c'] }).isValid, false));
});
