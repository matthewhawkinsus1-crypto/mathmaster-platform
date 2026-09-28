import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../src/tools/systemsWorkspace/ThreePlaneWorkspace.css', import.meta.url), 'utf8');

test('three-plane visualizer auto-rotates only before student interaction and respects reduced motion', () => {
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /if \(hasInteracted \|\| reduceMotion/);
  assert.match(source, /markInteracted\(\);[\s\S]*setPointerCapture/);
  assert.match(source, /markInteracted\(\);[\s\S]*setVisiblePlanes/);
  assert.match(source, /markInteracted\(\); setRevealed\(true\)/);
});

test('three-plane visualizer includes explicit depth and orientation cues', () => {
  assert.match(source, /cubeCorners\(R\)/);
  assert.match(source, /cubeEdges\(\)/);
  assert.match(source, /mathmaster-threeplane-frame-edge/);
  assert.match(source, /mathmaster-threeplane-axis-arrow/);
  assert.match(source, /mathmaster-threeplane-plane-label/);
  assert.match(source, /Auto-rotating to show depth/);
  assert.match(css, /\.mathmaster-threeplane-frame-edge/);
  assert.match(css, /\.mathmaster-threeplane-plane-label/);
});

test('idle rotation does not alter reveal timing', () => {
  assert.match(source, /const canReveal = !earnedResult && \(spatialModel\.revealSolution === true \|\| spatialModel\.allowSolutionReveal === true\)/);
  assert.match(source, /shownType !== 'unique' \|\| !showResult/);
});
