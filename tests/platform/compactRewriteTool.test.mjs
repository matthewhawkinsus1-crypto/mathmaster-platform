import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/StepByStepAlgebra.jsx', 'utf8');

test('rewrite tool uses a compact command bar rather than duplicate expression cards', () => {
  assert.match(src, /algebra-rewrite-tool-compact/);
  assert.match(src, /margin: '0 0 8px'/);
  assert.match(src, /padding: '7px 9px'/);
  assert.doesNotMatch(src, /<MathDisplay value=\{expressionToLatex\(equation\[side\]\)\}/);
  assert.doesNotMatch(src, /You write the equivalent expression\. MathMaster only checks it\. Use this to combine like terms/);
});

test('left right and both rewrite scopes are retained', () => {
  assert.match(src, /\['left', 'Left'\]/);
  assert.match(src, /\['right', 'Right'\]/);
  assert.match(src, /\['both', 'Both'\]/);
  assert.match(src, /rewriteSidesForScope/);
});

test('rewrite input autofocuses when opened and when scope changes', () => {
  assert.match(src, /rewriteFocusSignal/);
  assert.match(src, /if \(!rewriteOpen\) setRewriteFocusSignal\(\(signal\) => signal \+ 1\)/);
  assert.match(src, /focusSignal=\{side === primarySide \? rewriteFocusSignal : 0\}/);
});

test('rewrite fields use compact algebra-aware MathInput', () => {
  assert.match(src, /toolProfile="algebra-operation"/);
  assert.match(src, /contextSymbols=\{operationContextSymbols\}/);
  assert.match(src, /compact/);
  assert.match(src, /Equivalent left side/);
  assert.match(src, /Equivalent right side/);
});

test('equivalence checking remains student-authored', () => {
  assert.match(src, /checkStudentRewrite/);
  assert.match(src, /expressionsEquivalent\(parsed\[side\], equation\[side\], equation\.variable\)/);
  assert.match(src, /MathMaster checks it; it does not generate it\./);
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
});

test('cancellation and balanced-operation systems remain present', () => {
  assert.match(src, /commitStandaloneCancellation/);
  assert.match(src, /resolveAdditivePlacementFromPoint/);
  assert.match(src, /keepPendingMoveAsWritten/);
});
