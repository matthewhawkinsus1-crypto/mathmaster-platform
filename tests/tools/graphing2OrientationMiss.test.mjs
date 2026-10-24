// FB22: a line drawn the wrong way round (x = −2 for y = −2) is told so,
// instead of "Neither point is on the target line yet … the y-intercept".

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orientationMissMessage } from '../../src/tools/graphing2/orientationMiss.js';
import { lineFromPoints } from '../../src/tools/graphing2/graphingMath.js';

test('a vertical line for a horizontal target, and the reverse, is named', () => {
  const horizontal = { kind: 'slopeIntercept', m: 0, b: -2 };
  const vertical = { kind: 'vertical', x: 3 };
  assert.equal(
    orientationMissMessage(horizontal, lineFromPoints([-2, 1], [-2, 4])),
    'Your line is vertical, but y = −2 is a horizontal line: every point on it has the same y-value.',
  );
  assert.equal(
    orientationMissMessage(vertical, lineFromPoints([1, 3], [4, 3])),
    'Your line is horizontal, but x = 3 is a vertical line: every point on it has the same x-value.',
  );
});

test('any other miss is left to the usual messages', () => {
  const horizontal = { kind: 'slopeIntercept', m: 0, b: -2 };
  // Slanted, or flat at the wrong height: not a direction mistake.
  assert.equal(orientationMissMessage(horizontal, lineFromPoints([0, 0], [1, 1])), null);
  assert.equal(orientationMissMessage(horizontal, lineFromPoints([0, 3], [2, 3])), null);
  // A slanted target: its direction is not "vertical or horizontal".
  assert.equal(orientationMissMessage({ kind: 'slopeIntercept', m: 2, b: 1 }, lineFromPoints([1, 0], [1, 5])), null);
  assert.equal(orientationMissMessage(null, lineFromPoints([1, 0], [1, 5])), null);
  assert.equal(orientationMissMessage(horizontal, null), null);
});

test('Graphing 2 says it before the "neither point" sentence', () => {
  const tool = readFileSync(new URL('../../src/tools/graphing2/Graphing2.jsx', import.meta.url), 'utf8');
  const turned = tool.indexOf('const turned = orientationMissMessage(target, studentLine);');
  const neither = tool.indexOf("if (onLine === 0) return 'Neither point is on the target line yet.");
  assert.ok(turned > 0 && neither > turned, 'checked first');
  assert.match(tool, /if \(turned\) return turned;/);
});
