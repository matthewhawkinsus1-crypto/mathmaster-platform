// THE WHOLE-SIDE ROUTE: what "Rewrite / Simplify" was, now inside the one
// Simplify panel every algebra workspace shares (student push Q).
//
// The behaviours this file always protected, re-anchored to where they live:
// a compact bar (no duplicate expression cards), a side chosen by the
// student, focus moved into the field when it opens, an algebra-aware compact
// MathInput, and equivalence that the platform only checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { checkRegionRewrite } from '../../src/platform/algebra/simplify/simplifyEngine.js';

const src = fs.readFileSync('src/StepByStepAlgebraCore.jsx', 'utf8');
const panel = executableSource(fs.readFileSync('src/platform/algebra/simplify/SimplifyPanel.jsx', 'utf8'));
const css = fs.readFileSync('src/platform/algebra/simplify/SimplifyPanel.css', 'utf8');
const sideRoute = region(panel, 'className="mm-simplify-side"', '</div>', 'the whole-side route');

test('the whole-side route is a compact bar, not duplicate expression cards', () => {
  assert.match(css, /\.mm-simplify-panel \{[^}]*margin: 0 0 10px;[^}]*padding: 9px 11px;/);
  assert.doesNotMatch(sideRoute, /<MathDisplay/, 'the board is the only copy of each side');
  assert.doesNotMatch(src, /<MathDisplay value=\{expressionToLatex\(equation\[side\]\)\}/);
});

test('the student chooses the side: one choice per region of the board', () => {
  assert.match(sideRoute, /regions\.map\(\(entry\) => \(/);
  assert.match(sideRoute, /aria-pressed=\{state\?\.region === entry\.key\}/);
  assert.match(sideRoute, /chooseSimplifyRegion\(current, entry\.key\)/);
  assert.match(src, /\{ key: 'left', label: 'left side', expression: equation\.left/);
  assert.match(src, /\{ key: 'right', label: 'right side', expression: equation\.right/);
});

test('choosing a side moves focus into its field', () => {
  assert.match(sideRoute, /setRegionFocus\(\(signal\) => signal \+ 1\)/);
  assert.match(sideRoute, /focusSignal=\{regionFocus\}/);
});

test('the field is a compact, algebra-aware MathInput', () => {
  assert.match(sideRoute, /toolProfile="algebra-operation"/);
  assert.match(sideRoute, /contextSymbols=\{contextSymbols\}/);
  assert.match(sideRoute, /\bcompact\b/);
  assert.match(sideRoute, /placeholder=\{`Simpler \$\{region\.label\}`\}/);
  assert.match(src, /contextSymbols=\{operationContextSymbols\}/);
});

test('equivalence checking remains student-authored', () => {
  const region0 = { key: 'left', label: 'left side', expression: '2 * x + 12', variable: 'x' };
  assert.equal(checkRegionRewrite(region0, '2(x+6)').ok, true);
  assert.equal(checkRegionRewrite(region0, '2x+13').reason, 'notEquivalentSide');
  assert.equal(checkRegionRewrite(region0, '').reason, 'empty', 'nothing typed, nothing written for the student');
  assert.match(panel, /MathMaster checks your work; it never writes the result for you\./);
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
});

test('cancellation and balanced-operation systems remain present', () => {
  assert.match(src, /commitStandaloneCancellation/);
  assert.match(src, /resolveAdditivePlacementFromPoint/);
  assert.match(src, /keepPendingMoveAsWritten/);
});
