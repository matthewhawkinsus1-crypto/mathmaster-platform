/*
 * STEP ALGEBRA PREVIEW CONTRACT.
 *
 * Typing an operand is not a preview. Selecting +, −, × or ÷ is not a preview.
 * Once the student actually drags over a valid target, MathMaster SHOULD show
 * the mathematical result they are about to place. After one side is dropped,
 * that preview remains staged there until balance is restored on the other side.
 *
 * The preview must be visual-only: committed equation state, auto-fit width,
 * React keys and hit-target geometry remain based on the unmodified equation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
const css = executableSource(componentSource('src/StepByStepAlgebra.css'));

test('typing alone cannot create a mathematical preview', () => {
  const preview = region(core, 'const renderPlacementMathPreview = (side) =>', 'const armedOperationLabel =', 'placement preview');
  assert.match(preview, /if \(!armedTile \|\| pendingMove \|\| !String\(operand \|\| ''\)\.trim\(\)\) return null;/);
  assert.match(preview, /if \(!staged && !hovering\) return null;/);
  assert.match(preview, /dragOverSide === side/);
  assert.match(preview, /placedOperationSides\.includes\(side\)/);
});

test('drag and one-sided drop show real mathematical previews', () => {
  const preview = region(core, 'const renderPlacementMathPreview = (side) =>', 'const armedOperationLabel =', 'placement preview');
  assert.match(preview, /applyAdditiveOperationAtPlacement/);
  assert.match(preview, /\\\\frac/);
  assert.match(preview, /armedTile\.operation === 'multiply'/);
  assert.match(preview, /algebra-live-math-preview/);
  assert.match(preview, /algebra-live-math-preview/);
  assert.match(preview, /staged \? 'staged' : 'hover'/);
});

test('preview is outside AutoFitEquationExpression so it cannot remeasure the equation', () => {
  const sideBox = region(core, '{renderSide(side, cancellationModel)}', "{inlineExpressionTools && distributionState?.side === side ? (", 'side box');
  const fitClose = sideBox.indexOf('</AutoFitEquationExpression>');
  const preview = sideBox.indexOf('{renderPlacementMathPreview(side)}');
  assert.ok(fitClose > -1 && preview > fitClose, 'drag preview must render after the measured equation closes');
  assert.match(css, /\.algebra-live-math-preview\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /pointer-events:\s*none/);
});

test('committed equation changes only after both sides are placed', () => {
  assert.match(core, /const sideExpression = \(side\) => \(pendingMove \? pendingMove\.unsimplified\[side\] : equation\[side\]\);/);
  const stage = region(core, 'const stagePlacement = async', 'const endPointerDrag', 'stagePlacement');
  const readyGuard = stage.indexOf('if (!result.ready)');
  const commit = stage.indexOf('await attemptMove(');
  assert.ok(readyGuard > -1 && commit > readyGuard, 'attemptMove must sit behind the both-sides-ready guard');
  assert.match(stage.slice(readyGuard, commit), /return;/);
});

test('placement hysteresis stabilizes adjacent drag targets', () => {
  const semantic = region(core, 'const updateFactorZones =', 'const beginPointerDrag =', 'semantic drag region');
  assert.match(semantic, /stillInsidePrevious/);
  assert.match(semantic, /1\.18/);
  assert.match(semantic, /const stable = stillInsidePrevious \? previous : nearest/);
});
