import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stimulusShadingRegions } from '../../src/platform/graph/stimulusShading.js';

const bounds = { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
const lines = [
  { vertical: true, x: 5 },
  { vertical: false, m: 1, b: 0 },
  { vertical: true, x: 9 },
];

test('MP16: a vertical boundary (x ≤ 5) shades to its left or right, clipped to the plane', () => {
  const [left] = stimulusShadingRegions({ shading: [{ lineIndex: 0, side: 'left' }], lines, bounds });
  assert.deepEqual(left.points, [[-6, -6], [5, -6], [5, 6], [-6, 6]]);
  const [right] = stimulusShadingRegions({ shading: [{ lineIndex: 0, side: 'right' }], lines, bounds });
  assert.deepEqual(right.points, [[5, -6], [6, -6], [6, 6], [5, 6]]);
  // A boundary off the plane: its left is the whole plane, its right is nothing.
  assert.deepEqual(stimulusShadingRegions({ shading: [{ lineIndex: 2, side: 'left' }], lines, bounds })[0].points, [[-6, -6], [6, -6], [6, 6], [-6, 6]]);
  assert.deepEqual(stimulusShadingRegions({ shading: [{ lineIndex: 2, side: 'right' }], lines, bounds }), []);
});

test('a line still shades above or below, and a side that does not fit the line draws nothing', () => {
  const [above] = stimulusShadingRegions({ shading: [{ lineIndex: 1, side: 'above' }], lines, bounds });
  assert.ok(above.points.length >= 3);
  assert.ok(above.points.every(([x, y]) => y >= x - 1e-9), 'every corner is on or above y = x');
  assert.deepEqual(stimulusShadingRegions({ shading: [{ lineIndex: 0, side: 'above' }], lines, bounds }), [], 'a vertical line has no above');
  assert.deepEqual(stimulusShadingRegions({ shading: [{ lineIndex: 1, side: 'left' }], lines, bounds }), [], 'a sloped line has no left');
  assert.deepEqual(stimulusShadingRegions({ shading: [{ lineIndex: 7, side: 'left' }], lines, bounds }), []);
});

test('the Path stimulus draws its shading from this helper', () => {
  const stimulus = readFileSync(new URL('../../src/components/student/PathQuestionStimulus.jsx', import.meta.url), 'utf8');
  assert.match(stimulus, /const regions = stimulusShadingRegions\(\{ shading:graph\.shading, lines:resolvedLines, bounds \}\);/);
});
