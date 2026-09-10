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
