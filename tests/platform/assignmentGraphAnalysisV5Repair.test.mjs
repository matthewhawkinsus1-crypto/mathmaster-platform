import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareMathAnswer } from '../../src/answerUtils.js';
import { graphAsymptoteLines, staticGraphAsymptotes } from '../../src/graphSpecUtils.js';

// District DOL #1 repair regressions. These are platform rules, not assignment
// workarounds: if one of these fails, every authored question that relies on the
// same graph/grading behavior is at risk.

test('a single zero can be entered as a number when the answer key uses a singleton set', () => {
  assert.equal(compareMathAnswer('3', '{3}'), true);
  assert.equal(compareMathAnswer('{3}', '3'), true);
});

test('finite integer domains accept equivalent roster and ellipsis forms', () => {
  const explicit = `{${Array.from({ length: 49 }, (_, index) => index).join(',')}}`;
  assert.equal(compareMathAnswer('{0, 1, 2, ..., 48}', explicit), true);
  assert.equal(compareMathAnswer('0, 1, 2, ..., 48', '{0, 1, 2, ..., 48}'), true);
  assert.equal(compareMathAnswer(explicit, '{0, 1, 2, ..., 48}'), true);
  assert.equal(compareMathAnswer('{0, 1, 2, ..., 47}', explicit), false);
});

test('automatic graph asymptotes include the horizontal translation of an exponential', () => {
  assert.deepEqual(
    staticGraphAsymptotes({ type: 'exponential', a: 5, base: 3, h: 0, k: -4 }),
    [{ axis: 'horizontal', value: -4 }],
  );
  assert.deepEqual(
    graphAsymptoteLines({ functions: [{ type: 'exponential', a: 5, base: 3, h: 0, k: -4 }] }),
    [{ axis: 'horizontal', value: -4 }],
  );
});

test('static graph renderer owns restricted endpoints and unrestricted continuation arrows', async () => {
  const source = await readFile(new URL('../../src/GraphDisplay.jsx', import.meta.url), 'utf8');
  assert.match(source, /restrictedFunctionEndpoints/);
  assert.match(source, /continuationFunctionEndpoints/);
  assert.match(source, /marker:\s*'arrow'/);
  assert.match(source, /boundary\.closed\s*\?\s*'closed'\s*:\s*'open'/);
});

test('page scrolling and browser pinch do not mutate the mathematical graph viewport', async () => {
  const source = await readFile(new URL('../../src/tools/shared/CoordinatePlane.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /onWheel=\{zoomable\s*\?/,
    'mouse-wheel page scrolling must not be captured to zoom the coordinate system');
  assert.doesNotMatch(source, /gesturePointers\.current\.size\s*===\s*2/,
    'two-finger browser pinch must not be repurposed as coordinate-system zoom');
  assert.match(source, /touchAction:\s*interactive\s*\?\s*'pan-y pinch-zoom'\s*:\s*'auto'/,
    'interactive graphs must allow native vertical page scrolling and browser pinch zoom');
});
