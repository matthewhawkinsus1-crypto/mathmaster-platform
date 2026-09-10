import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOL_CATALOG } from '../../src/tools/toolCatalog.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const linear = { type: 'linear', a: -3, h: 0, k: 9 };

test('inverseCompositionLab accepts deriveInverse only for a nonconstant linear function', async () => {
  const valid = validateToolQuestion({
    toolId: 'inverseCompositionLab',
    mode: 'deriveInverse',
    f: linear,
    alignments: [{ framework: 'teks', code: 'A2.2B' }],
  });
  assert.deepEqual(valid.errors, []);

  const unsupported = validateToolQuestion({
    toolId: 'inverseCompositionLab',
    mode: 'deriveInverse',
    f: { type: 'quadratic', a: 1, h: 0, k: 0 },
    alignments: [{ framework: 'teks', code: 'A2.2B' }],
  });
  assert.ok(unsupported.errors.some((message) => message.includes('deriveInverse')));

  const constant = validateToolQuestion({
    toolId: 'inverseCompositionLab',
    mode: 'deriveInverse',
    f: { type: 'linear', a: 0, h: 0, k: 5 },
    alignments: [{ framework: 'teks', code: 'A2.2B' }],
  });
  assert.ok(constant.errors.some((message) => message.includes('nonzero')));
});

test('linear inverse derivation requires swap, preserves balance, supports undo state, and recognizes isolation', async () => {
  const {
    createLinearInverseDerivation,
    applyInverseDerivationOperation,
    formatInverseDerivationRelation,
    isLinearInverseSolved,
  } = await import('../../src/tools/inverseComposition/inverseDerivationMath.js');

  const initial = createLinearInverseDerivation(linear);
  assert.equal(initial.phase, 'original');
  assert.equal(formatInverseDerivationRelation(initial), 'y = -3x + 9');
  assert.equal(isLinearInverseSolved(initial), false);

  const swapped = applyInverseDerivationOperation(initial, 'swapVariables');
  assert.equal(swapped.phase, 'swapped');
  assert.equal(formatInverseDerivationRelation(swapped), 'x = -3y + 9');

  const subtractNine = applyInverseDerivationOperation(swapped, 'subtract', 9);
  assert.equal(formatInverseDerivationRelation(subtractNine), 'x - 9 = -3y');
  assert.equal(isLinearInverseSolved(subtractNine), false);

  const divideNegativeThree = applyInverseDerivationOperation(subtractNine, 'divide', -3);
  assert.equal(formatInverseDerivationRelation(divideNegativeThree), '(-1/3)x + 3 = y');
  assert.equal(isLinearInverseSolved(divideNegativeThree), true);
  assert.equal(divideNegativeThree.inverse.slope, -1 / 3);
  assert.equal(divideNegativeThree.inverse.intercept, 3);

  assert.throws(() => applyInverseDerivationOperation(swapped, 'divide', 0), /divide/i);
  assert.throws(() => applyInverseDerivationOperation(swapped, 'multiply', 0), /loses/i);
});

test('graphing2 is available to both Algebra I and Algebra II', () => {
  assert.ok(TOOL_CATALOG.graphing2.courses.includes('Algebra I'));
  assert.ok(TOOL_CATALOG.graphing2.courses.includes('Algebra II'));
});

test('function operations math derives requested polynomial results, restrictions, and composition', async () => {
  const {
    deriveFunctionOperations,
    formatPolynomialExpression,
  } = await import('../../src/tools/functionOperations/functionOperationsMath.js');

  const result = deriveFunctionOperations({
    f: { type: 'polynomial', coefficients: [1, 0, -1] },
    g: { type: 'linear', a: 1, h: 1, k: 0 },
    operations: ['sum', 'difference', 'product', 'quotient', 'composition'],
    composeOrder: 'fOfG',
  });

  assert.equal(formatPolynomialExpression(result.sum.coefficients), 'x^2 + x - 2');
  assert.equal(formatPolynomialExpression(result.difference.coefficients), 'x^2 - x');
  assert.equal(formatPolynomialExpression(result.product.coefficients), 'x^3 - x^2 - x + 1');
  assert.equal(result.quotient.expression, 'x + 1');
  assert.deepEqual(result.quotient.excludedValues, [1]);
  assert.equal(formatPolynomialExpression(result.composition.coefficients), 'x^2 - 2x');
});

test('functionOperationsLab validates f, g, operation names, and Algebra II catalog availability', () => {
  assert.deepEqual(TOOL_CATALOG.functionOperationsLab.courses, ['Algebra II']);

  const valid = validateToolQuestion({
    toolId: 'functionOperationsLab',
    f: { type: 'linear', a: 2, h: 0, k: 1 },
    g: { type: 'linear', a: 1, h: 3, k: 0 },
    operations: ['sum', 'quotient', 'composition'],
    alignments: [{ framework: 'teks', code: 'A2.7B' }],
  });
  assert.deepEqual(valid.errors, []);

  const invalid = validateToolQuestion({
    toolId: 'functionOperationsLab',
    f: { type: 'linear', a: 2, h: 0, k: 1 },
    operations: ['sum', 'mystery'],
    alignments: [{ framework: 'teks', code: 'A2.7B' }],
  });
  assert.ok(invalid.errors.some((message) => message.includes('g')));
  assert.ok(invalid.errors.some((message) => message.includes('mystery')));
});
