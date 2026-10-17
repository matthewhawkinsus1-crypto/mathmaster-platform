/*
 * TOOL-11 (pass 3): on a phone, plane text is readable and a missed drag keeps
 * the line (Graphing replaces the nearest point; a press is snapped to the grid
 * before any pick-up check, so a wider pick-up radius would change nothing). The browser half (rendered sizes at 390 px, a press beside P2
 * picking it up, a third point keeping the line) is tests/browser/
 * planePhoneReach.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_PLANE_TEXT_PX, planeFontSize, renderedFontPx } from '../../src/tools/shared/planeTextScale.js';
import { placePoint } from '../../src/tools/graphing2/placePoint.js';

test('plane text grows on a narrow plane to the 12 px floor, and only there', () => {
  // 560-unit viewBox drawn 322 px wide (a 390 px phone column).
  for (const authored of [10, 11, 13]) {
    const size = planeFontSize(authored, 560, 322);
    assert.ok(renderedFontPx(size, 560, 322) >= MIN_PLANE_TEXT_PX - 0.05, `${authored} renders at ${renderedFontPx(size, 560, 322)} px`);
  }
  // Wide enough already: the authored size.
  assert.equal(planeFontSize(11, 560, 640), 11);
  assert.equal(planeFontSize(13, 560, 560), 13);
  // Not measured yet: the authored size.
  assert.equal(planeFontSize(11, 560, null), 11);
  // Never more than 2.25 times its size on a very small plane.
  assert.equal(planeFontSize(10, 560, 100), 22.5);
});

test('a point past the last replaces the nearest one instead of restarting the line', () => {
  assert.deepEqual(placePoint([], [1, 1]), [[1, 1]]);
  assert.deepEqual(placePoint([[0, 0]], [3, 0]), [[0, 0], [3, 0]]);
  assert.deepEqual(placePoint([[0, 0], [3, 0]], [4, 0]), [[0, 0], [4, 0]], 'a miss beside P2 moves P2');
  assert.deepEqual(placePoint([[0, 0], [3, 0]], [0, 1]), [[0, 1], [3, 0]], 'beside P1 moves P1');
  assert.deepEqual(placePoint([[0, 0], [2, 0]], [1, 5]), [[0, 0], [1, 5]], 'a tie replaces the later point');
  assert.deepEqual(placePoint([[0, 0], [1, 1], [2, 2]], [2, 3], 3), [[0, 0], [1, 1], [2, 3]]);
});
