import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBalancedOperation } from '../../src/algebraAstEngine.js';
import { buildCancellationModel } from '../../src/algebraCancellationModel.js';

test('right side 2x + 9 - 2x uses the engine pair and can be cancelled', () => {
  const move = applyBalancedOperation({
    equationState: {
      left: '4*x - 7',
      right: '2*x + 9',
      variable: 'x',
      objective: { kind: 'isolate', variable: 'x' },
    },
    operation: 'subtract',
    operand: '2*x',
  });

  const right = move.cancellationTargets.find((target) => target.side === 'right');
  assert.equal(right.canCancel, true);
  assert.deepEqual(
    right.cancellationPairs.map(({ firstIndex, secondIndex }) => [firstIndex, secondIndex]),
    [[0, 2]],
  );

  const model = buildCancellationModel(
    move.unsimplified.right,
    right.cancellationResultExpression,
    'x',
    right.cancellationPairs,
  );

  assert.equal(model.kind, 'additive');
  assert.deepEqual(model.pairs.map((pair) => pair.indices), [[0, 2]]);
});

test('the left side does not invent a cancellation between 4x and -2x', () => {
  const move = applyBalancedOperation({
    equationState: {
      left: '4*x - 7',
      right: '2*x + 9',
      variable: 'x',
      objective: { kind: 'isolate', variable: 'x' },
    },
    operation: 'subtract',
    operand: '2*x',
  });
  const left = move.cancellationTargets.find((target) => target.side === 'left');
  assert.equal(left.canCancel, false);
});

test('multiple structural additive pairs remain individually cancellable', () => {
  const model = buildCancellationModel(
    'x - x + 2 - 2',
    '0',
    'x',
    [
      { firstIndex: 0, secondIndex: 1, key: 'x' },
      { firstIndex: 2, secondIndex: 3, key: '2' },
    ],
  );
  assert.equal(model.kind, 'additive');
  assert.deepEqual(model.pairs.map((pair) => pair.indices), [[0, 1], [2, 3]]);
});
