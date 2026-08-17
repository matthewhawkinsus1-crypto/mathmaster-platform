import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/StepByStepAlgebra.jsx', 'utf8');

test('Rewrite / Simplify is a permanent manual toolbar control', () => {
  assert.match(src, /Rewrite \/ Simplify/);
  assert.match(src, /algebra-rewrite-toggle/);
  assert.match(src, /aria-expanded=\{rewriteOpen\}/);
  assert.match(src, /Cancellation hints/);
  assert.match(src, /Reset work/);
});

test('student chooses left, right, or both sides', () => {
  assert.match(src, /\['left', 'Left side'\]/);
  assert.match(src, /\['right', 'Right side'\]/);
  assert.match(src, /\['both', 'Both sides'\]/);
  assert.match(src, /rewriteSidesForScope/);
});

test('student supplies the rewrite and MathMaster checks equivalence', () => {
  assert.match(src, /checkStudentRewrite/);
  assert.match(src, /rewriteAnswers\[side\]/);
  assert.match(src, /expressionsEquivalent\(parsed\[side\], equation\[side\], equation\.variable\)/);
  assert.match(src, /Check my rewrite/);
  assert.match(src, /MathMaster only checked equivalence/);
});

test('rewrite does not call an automatic simplify function', () => {
  assert.doesNotMatch(src, /simplifyStudentExpression\(rewriteAnswers/);
  assert.doesNotMatch(src, /simplifyStudentExpression\(equation\[side\]/);
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
});

test('rewrite is separated from an unfinished balanced operation', () => {
  assert.match(src, /Finish the balanced operation already in progress first/);
  assert.match(src, /if \(pendingMove\)/);
});

test('existing algebra interaction systems remain wired', () => {
  assert.match(src, /commitStandaloneCancellation/);
  assert.match(src, /resolveAdditivePlacementFromPoint/);
  assert.match(src, /className="algebra-optional-simplification"/);
  assert.match(src, /keepPendingMoveAsWritten/);
  assert.match(src, /resetQuestionWork/);
});
