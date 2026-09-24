import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/StepByStepAlgebraCore.jsx', 'utf8');

test('one-click automatic simplification is gone', () => {
  assert.doesNotMatch(src, /const simplifyChosenSides = async/);
  assert.doesNotMatch(src, /studentSimplifiableSides/);
  assert.doesNotMatch(src, /algebra-student-simplify-toolbar/);
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
});

test('manual simplification remains student-entered', () => {
  assert.match(src, /algebra-optional-simplification/);
  assert.match(src, /<MathInput[\s\S]{0,160}value=\{simplificationAnswers\[target\.side\]/);
  assert.match(src, /checkSimplifications/);
  assert.match(src, /Check my simplification/);
});

test('manual simplification is still gated behind required cancellation', () => {
  assert.match(
    src,
    /pendingMove\.requiredCancellationSides\.every\(\(side\) => crossedSides\.includes\(side\)\)/,
  );
  assert.match(src, /registerCancellationHits/);
});

test('student may still keep an equivalent unsimplified step', () => {
  assert.match(src, /keepPendingMoveAsWritten/);
  assert.match(src, />Keep as written</);
  assert.match(src, /resolveEquationAfterKeepingMove/);
});

test('V1.3 freeform add-subtract placement remains', () => {
  assert.match(src, /resolveAdditivePlacementFromPoint/);
  assert.match(src, /kind: 'under'/);
  // The positions the student chose are honoured by the COMMITTED move: they
  // are handed to the balanced-operation engine, which places the operand at
  // each position. (The workspace itself no longer applies them to draw a
  // preview inside the equation — issue #341.)
  assert.match(src, /applyBalancedOperation\(\{[^}]*placementBySide: placementBySideOverride \|\| placedOperationPositions/);
  const engine = fs.readFileSync('src/algebraAstEngine.js', 'utf8');
  assert.match(engine, /applyOperationToExpression\(equationState\.left, operation, operand\.expression, placementBySide\?\.left\)/);
  assert.match(engine, /applyAdditiveOperationAtPlacement\(expression, operation, operandExpression, placement\)/);
});
