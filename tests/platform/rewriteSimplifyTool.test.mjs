// SIMPLIFY IS A PERMANENT, STUDENT-AUTHORED TOOLBAR CONTROL.
//
// It was "Rewrite / Simplify"; student push Q merged it with Simplify
// arithmetic and Combine like terms into ONE Simplify button, and moved the
// shape-changing tools into one Rewrite menu. What this file has always
// protected holds: the control is always there, the student supplies every
// rewrite, and MathMaster only checks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepAlgebraSource } from './helpers/solverSource.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { commitSimplifyPart, detectSimplifyParts } from '../../src/platform/algebra/simplify/simplifyEngine.js';

const src = stepAlgebraSource();
const panel = executableSource(fs.readFileSync('src/platform/algebra/simplify/SimplifyPanel.jsx', 'utf8'));
const toolbar = region(src, "className=\"algebra-simplify-toggle\"", 'className="algebra-reset-work"', 'the solver toolbar');

test('Simplify remains a permanent student-authored toolbar control', () => {
  // Rendered unconditionally (not behind a "has parts" test), with its state.
  assert.match(src, /\n\s*<button\n\s*ref=\{simplifyButtonRef\}\n\s*type="button"\n\s*className="algebra-simplify-toggle"/);
  assert.match(toolbar, /aria-expanded=\{Boolean\(simplifyTool\)\}/);
  assert.match(toolbar, />\s*Simplify\s*</);
  assert.match(src, /Cancellation hints/);
  // The toolbar's way to begin again, under the platform's one word for it
  // (studentWords.js START_OVER; it said "Reset work").
  assert.match(src, /className="algebra-reset-work" onClick=\{resetQuestionWork\}[^>]*>\{START_OVER\}<\/button>/);
  // The three old buttons are gone from the solver.
  assert.doesNotMatch(src, />\s*Rewrite \/ Simplify\s*</);
  assert.doesNotMatch(src, />\s*Combine like terms\s*</);
  assert.doesNotMatch(src, /'Simplify arithmetic'/);
});

test('the student supplies the result and MathMaster only checks it', () => {
  const regions = [{ key: 'left', label: 'left side', expression: '2 * x + 4 * x', variable: 'x' }];
  const [part] = detectSimplifyParts(regions);
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '' }).reason, 'empty');
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '8x' }).reason, 'notEqual');
  assert.equal(commitSimplifyPart(regions, part.id, { answer: '6x' }).ok, true);
  const commit = region(panel, 'const commitPart = async', '\n  };', 'the part commit');
  assert.match(commit, /commitSimplifyPart\(regions, part\.id, work/);
  assert.match(panel, /className="algebra-inline-commit" onClick=\{commitPart\}[^>]*>Check</);
  assert.match(panel, /MathMaster checks your work; it never writes the result for you\./);
});

test('rewrite does not call an automatic simplify function', () => {
  assert.doesNotMatch(src, /simplifyStudentExpression\(/);
  assert.doesNotMatch(panel, /simplifyExpression|simplifyStudentExpression/);
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
});

test('Simplify remains separated from an unfinished balanced operation', () => {
  const toggle = region(src, 'const toggleSimplifyTool = () => {', '\n  };', 'opening Simplify');
  assert.match(toggle, /if \(pendingMove\) \{\s*setMessage\(\{[\s\S]*Finish the balanced operation already in progress first/);
  assert.match(src, /\{simplifyTool && !pendingMove && \(\s*<SimplifyPanel/);
});

test('existing algebra interaction systems remain wired', () => {
  assert.match(src, /commitStandaloneCancellation/);
  assert.match(src, /resolveAdditivePlacementFromPoint/);
  assert.match(src, /algebra-optional-simplification/);
  assert.match(src, /keepPendingMoveAsWritten/);
  assert.match(src, /resetQuestionWork/);
});
