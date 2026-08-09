import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIT_PADDING, MIN_STROKE_LENGTH,
  appendStrokePoint, evaluateStroke, resolveStruckTerms,
  segmentIntersectsRect, strokeCrossesRect, strokeLength, strokeToPath,
} from '../../src/strokeGeometry.js';

// A row of three terms: 3x, +6, -6.
const TERMS = [
  { index: 0, rect: { left: 10, right: 40, top: 10, bottom: 30 } },
  { index: 1, rect: { left: 50, right: 75, top: 10, bottom: 30 } },
  { index: 2, rect: { left: 85, right: 115, top: 10, bottom: 30 } },
];

const line = (x1, y1, x2, y2, steps = 12) => Array.from(
  { length: steps + 1 },
  (unused, i) => ({ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }),
);

// --- The two things the old displacement rule got wrong ---------------------

test('a back-and-forth stroke counts, even though it ends where it started', () => {
  // The old rule measured pointer-down to pointer-up and needed 44px. A careful
  // line drawn through the pair and back has a displacement of zero, so it
  // counted as nothing at all.
  const points = [...line(52, 20, 113, 20), ...line(113, 20, 52, 20)];
  const displacement = Math.hypot(
    points[points.length - 1].x - points[0].x,
    points[points.length - 1].y - points[0].y,
  );
  assert.ok(displacement < 1, 'this stroke has essentially no displacement');
  assert.ok(strokeLength(points) > 100, 'but it is a long path');

  const verdict = evaluateStroke({ points, termRects: TERMS, expectedPair: [1, 2] });
  assert.equal(verdict.matched, true);
  assert.deepEqual(verdict.struck, [1, 2]);
});

test('a long flick through empty space does not count', () => {
  // The mirror failure: 44px of displacement below the terms used to pass.
  const points = line(10, 50, 90, 58);
  assert.ok(strokeLength(points) > MIN_STROKE_LENGTH);
  const verdict = evaluateStroke({ points, termRects: TERMS, expectedPair: [1, 2] });
  assert.equal(verdict.matched, false);
  assert.equal(verdict.reason, 'missed');
  assert.deepEqual(verdict.struck, []);
});

// --- Forgiveness ------------------------------------------------------------

test('a slightly imprecise gesture is not a mathematical error', () => {
  // Drawn a few pixels above the terms, as a finger on a phone would.
  const points = line(52, 10 - HIT_PADDING + 2, 113, 10 - HIT_PADDING + 2);
  assert.equal(evaluateStroke({ points, termRects: TERMS, expectedPair: [1, 2] }).matched, true);
});

test('but the forgiveness has a limit', () => {
  const points = line(52, 10 - HIT_PADDING - 15, 113, 10 - HIT_PADDING - 15);
  assert.equal(evaluateStroke({ points, termRects: TERMS, expectedPair: [1, 2] }).matched, false);
});

test('crossing an extra term on the way to the pair is allowed', () => {
  // One long line through 3x, +6 and -6. The student reached the right pair;
  // refusing this would be marking their handwriting, not their algebra.
  const verdict = evaluateStroke({ points: line(15, 20, 113, 20), termRects: TERMS, expectedPair: [1, 2] });
  assert.equal(verdict.matched, true);
  assert.deepEqual(verdict.extraTermsCrossed, [0]);
});

test('crossing the wrong pair is reported as wrong terms, not as a miss', () => {
  const verdict = evaluateStroke({ points: line(15, 20, 70, 20), termRects: TERMS, expectedPair: [1, 2] });
  assert.equal(verdict.matched, false);
  assert.equal(verdict.reason, 'wrong_terms');
  assert.deepEqual(verdict.struck, [0, 1]);
});

// --- A tap is not a failed stroke -------------------------------------------

test('a tap reports too_short so it can fall through to term selection', () => {
  const verdict = evaluateStroke({ points: [{ x: 60, y: 20 }], termRects: TERMS, expectedPair: [1, 2] });
  assert.equal(verdict.tooShort, true);
  assert.equal(verdict.matched, false);
  assert.equal(verdict.reason, 'too_short');
});

test('a short scribble that still crosses both terms is honoured', () => {
  // Short in length, but it genuinely went through the pair.
  const points = [{ x: 74, y: 20 }, { x: 86, y: 20 }];
  const verdict = evaluateStroke({ points, termRects: TERMS, expectedPair: [1, 2] });
  assert.equal(verdict.matched, true, 'reaching both terms outweighs the length rule');
});

// --- Geometry primitives ----------------------------------------------------

test('segment/rectangle intersection handles every arrangement', () => {
  const rect = { left: 0, right: 10, top: 0, bottom: 10 };
  assert.equal(segmentIntersectsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, rect), true, 'straight through');
  assert.equal(segmentIntersectsRect({ x: 5, y: 5 }, { x: 6, y: 6 }, rect), true, 'entirely inside');
  assert.equal(segmentIntersectsRect({ x: -5, y: -5 }, { x: 5, y: 5 }, rect), true, 'enters at a corner');
  assert.equal(segmentIntersectsRect({ x: -5, y: 20 }, { x: 15, y: 20 }, rect), false, 'passes below');
  assert.equal(segmentIntersectsRect({ x: 20, y: -5 }, { x: 20, y: 15 }, rect), false, 'passes beside');
});

test('points are sampled, not hoarded', () => {
  let points = [{ x: 0, y: 0 }];
  points = appendStrokePoint(points, { x: 1, y: 0 });
  assert.equal(points.length, 1, 'a 1px move is not a new sample');
  points = appendStrokePoint(points, { x: 8, y: 0 });
  assert.equal(points.length, 2);
});

test('struck terms come back in the order the stroke reached them', () => {
  const rightToLeft = resolveStruckTerms(line(113, 20, 15, 20), TERMS);
  assert.deepEqual(rightToLeft, [2, 1, 0]);
  const leftToRight = resolveStruckTerms(line(15, 20, 113, 20), TERMS);
  assert.deepEqual(leftToRight, [0, 1, 2]);
});

test('the ink path is a plain SVG polyline', () => {
  assert.equal(strokeToPath([{ x: 1, y: 2 }, { x: 3, y: 4 }]), 'M 1 2 L 3 4');
  assert.equal(strokeToPath([{ x: 1, y: 2 }]), '', 'a single point draws nothing');
  assert.equal(strokeToPath([]), '');
});

test('empty and malformed input does not throw', () => {
  assert.equal(strokeCrossesRect([], TERMS[0].rect), false);
  assert.equal(strokeCrossesRect(line(0, 0, 10, 10), null), false);
  assert.deepEqual(resolveStruckTerms([], TERMS), []);
  assert.deepEqual(resolveStruckTerms(line(0, 0, 5, 5), [null, { index: 9 }]), []);
  assert.equal(strokeLength([]), 0);
});
