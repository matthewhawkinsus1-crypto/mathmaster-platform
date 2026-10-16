/*
 * THE GRAPH'S TYPED x / y ENTRY: AN EMPTY BOX IS NOT 0 (pass 3 review of TOOL-1).
 *
 * Enter in the x box with y still empty used to place the point at (x, 0) and
 * clear both boxes: `Number('')` is 0. Now Enter moves on to the empty box and
 * places only once both hold a number. The rendered boxes are driven by keyboard
 * in tests/browser/graphKeyboardRoute.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { typedCoordinate, typedEntryEnterAction } from '../../src/graphTypedCoordinate.js';

test('a point is named only when both boxes hold a number', () => {
  assert.deepEqual(typedCoordinate('3', '-2'), [3, -2]);
  assert.deepEqual(typedCoordinate('0', '0'), [0, 0], 'a typed 0 is a 0');
  assert.equal(typedCoordinate('3', ''), null, 'an empty y is missing, not 0');
  assert.equal(typedCoordinate('', '4'), null);
  assert.equal(typedCoordinate('3', '   '), null);
  assert.equal(typedCoordinate('3', '-'), null, 'half a number is not a number');
});

test('Enter moves to the empty box, and places once both are filled', () => {
  assert.equal(typedEntryEnterAction({ box: 'x', typedX: '3', typedY: '' }), 'focus-y');
  assert.equal(typedEntryEnterAction({ box: 'y', typedX: '', typedY: '4' }), 'focus-x');
  assert.equal(typedEntryEnterAction({ box: 'x', typedX: '3', typedY: '4' }), 'place');
  assert.equal(typedEntryEnterAction({ box: 'y', typedX: '3', typedY: '4' }), 'place');
});
