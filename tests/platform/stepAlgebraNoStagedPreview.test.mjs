/*
 * ISSUE #341, PART A: A STAGED BALANCED MOVE NEVER APPEARS INSIDE THE EQUATION.
 *
 * Choosing "subtract", typing 21, hovering a side and placing the operation on
 * ONE side are decisions still being made. The workspace used to write the
 * staged operation into the expression (-9x + 21 - 21 = 1) the moment a side
 * was hovered, which showed the student the transformation before they had
 * made it. The rule is global: StepByStepAlgebraCore is the one engine behind
 * standalone Step Algebra and every embedded instance (Systems Workspace,
 * Linear Intercepts), so it is asserted here, once, where it is enforced.
 *
 * These are source contracts because node cannot render the workspace. The
 * browser proof — the visible equation text compared before and after hover
 * and one-sided placement — is tests/browser/stepAlgebraNoStagedPreview.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
const staging = region(core, 'const staged = placedOperationSides.includes(side);', 'const armedOperationLabel =', 'renderSide staging branch');

test('while an operation is staged, every side renders the committed expression only', () => {
  // Nothing that could spell the student's operand — or the result of applying
  // it — is reachable from the staging branch.
  assert.doesNotMatch(staging, /operandMath|parsedOperand|parseOperationOperand|applyAdditiveOperationAtPlacement|expressionToLatex\(/);
  assert.doesNotMatch(staging, /\boperand\b/);
  // What it does render is the untouched side: `inner`, or the same committed
  // `terms` with a positional cue attached.
  const returns = [...staging.matchAll(/return equationSide\(([\s\S]*?)\);\n/g)].map((match) => match[1]);
  assert.ok(returns.length >= 3, `expected the staging branch to return through equationSide, saw ${returns.length}`);
  returns.forEach((body) => {
    assert.match(body, /^\s*(inner\b|termCue \? <AlgebraTermRow terms=\{terms\} side=\{side\} placementCue=\{termCue\} \/> : inner)/, `staging branch returned something other than the committed side: ${body}`);
  });
});

test('the only thing that swaps in the operated equation is a committed, both-sides move', () => {
  // `sideExpression` reads the unsimplified result from `pendingMove` and from
  // nowhere else, and `pendingMove` is set by `attemptMove`, which placement
  // reaches only once BOTH sides have been placed.
  assert.match(core, /const sideExpression = \(side\) => \(pendingMove \? pendingMove\.unsimplified\[side\] : equation\[side\]\);/);
  const stage = region(core, 'const stagePlacement = async', 'const endPointerDrag', 'stagePlacement');
  const readyGuard = stage.indexOf('if (!result.ready)');
  const commit = stage.indexOf('await attemptMove(');
  assert.ok(readyGuard > -1 && commit > readyGuard, 'attemptMove must sit behind the both-sides-ready guard');
  assert.match(stage.slice(readyGuard, commit), /return;/);
});

test('the placed-side marker lives outside the auto-fit expression, so it can neither read as algebra nor re-fit the equation', () => {
  const sideBox = region(core, '{renderSide(side, cancellationModel)}', "{inlineExpressionTools && distributionState?.side === side ? (", 'side box');
  const fitClose = sideBox.indexOf('</AutoFitEquationExpression>');
  const marker = sideBox.indexOf('algebra-placement-marker');
  assert.ok(fitClose > -1 && marker > fitClose, 'the marker must render after the auto-fit expression closes');
  assert.match(sideBox, /stagedHere && armedTile && !pendingMove \?/);
});

test('hover cues are layered on the same element and kept out of its key', () => {
  // A cue that changed the key would remount the math on every pointer move,
  // which is the pulsing PR #340 removed.
  const equationSide = region(core, 'const equationSide = (content, extraClass = \'\', cueClass = \'\') => (', '</div>', 'equationSide');
  assert.match(equationSide, /key=\{`\$\{side\}-\$\{sideExpression\(side\)\}-\$\{extraClass\}`\}/);
  assert.doesNotMatch(equationSide, /key=\{[^}]*cueClass/);
});
