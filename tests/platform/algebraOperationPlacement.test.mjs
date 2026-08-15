import test from 'node:test';
import assert from 'node:assert/strict';
import { stageOperationPlacement } from '../../src/algebraOperationPlacement.js';

test('first placement leaves the equation intentionally unbalanced', () => {
  const result = stageOperationPlacement({ placedSides: [], side: 'left' });
  assert.deepEqual(result.placedSides, ['left']);
  assert.equal(result.ready, false);
  assert.equal(result.missingSide, 'right');
});

test('student may begin on the right side instead', () => {
  const result = stageOperationPlacement({ placedSides: [], side: 'right' });
  assert.deepEqual(result.placedSides, ['right']);
  assert.equal(result.missingSide, 'left');
});

test('same side cannot satisfy both halves of a balanced operation', () => {
  const result = stageOperationPlacement({ placedSides: ['left'], side: 'left' });
  assert.equal(result.duplicate, true);
  assert.equal(result.ready, false);
  assert.deepEqual(result.placedSides, ['left']);
});

test('opposite-side placement completes the balance requirement', () => {
  const result = stageOperationPlacement({ placedSides: ['left'], side: 'right' });
  assert.equal(result.ready, true);
  assert.deepEqual(result.placedSides, ['left', 'right']);
});

test('invalid placement does not mutate progress', () => {
  const result = stageOperationPlacement({ placedSides: ['right'], side: 'middle' });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.placedSides, ['right']);
});
