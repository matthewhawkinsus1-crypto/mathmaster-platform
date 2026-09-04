import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepAlgebraSource } from './helpers/solverSource.mjs';

const stepSource = stepAlgebraSource();
const inputSource = fs.readFileSync(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../../src/StepByStepAlgebra.css', import.meta.url), 'utf8');

test('choosing an operation explicitly focuses the compact operand composer', () => {
  assert.match(stepSource, /setOperationFocusSignal\(\(value\) => value \+ 1\)/);
  assert.match(stepSource, /focusSignal=\{operationFocusSignal\}/);
  assert.match(stepSource, /compact/);
  assert.match(inputSource, /mfRef\.current\?\.focus/);
});

test('operation placement is staged on both sides before the algebra engine applies it', () => {
  assert.match(stepSource, /stageOperationPlacement\(\{ placedSides: placedOperationSides, side \}\)/);
  assert.match(stepSource, /if \(!result\.ready\)/);
  assert.match(stepSource, /await attemptMove\(armedTile\.operation/);
  assert.match(stepSource, /Balance not restored/);
});

test('balance is one connected panel rather than two bordered white drop cards', () => {
  assert.match(stepSource, /algebra-connected-balance/);
  assert.match(stepSource, /algebra-connected-side/);
  assert.match(cssSource, /\.algebra-connected-side[\s\S]*border: 0;/);
  assert.match(cssSource, /\.algebra-connected-balance[\s\S]*background: #fff;/);
});

test('division uses a generous beneath-expression semantic region, not a tiny fraction-bar box', () => {
  assert.match(stepSource, /position: 'below'/);
  assert.match(stepSource, /Place the divisor beneath one side/);
  assert.doesNotMatch(stepSource, /drop it right on the fraction bar/);
});

test('regular students still do not receive automatic Apply', () => {
  assert.match(stepSource, /\{allowAutoApply && \(/);
  assert.match(stepSource, /Apply to both sides/);
});

test('algebra-operation fields use the controlled equation-aware keypad on touch devices', () => {
  assert.match(inputSource, /toolProfile !== 'function'/);
  assert.match(inputSource, /algebraOperationKeysForContext/);
  assert.match(inputSource, /contextSymbols/);
});
