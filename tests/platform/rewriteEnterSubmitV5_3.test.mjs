import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { multiRelationSource } from './helpers/solverSource.mjs';

const src = multiRelationSource();

// The relation workspace's rewrite bar is the shared Simplify panel now
// (student push Q); the keyboard contract it always had moved with it.
const panelSource = fs.readFileSync('src/platform/algebra/simplify/SimplifyPanel.jsx', 'utf8');

test('Simplify submits Check when Enter is pressed', () => {
  assert.match(src, /<SimplifyPanel[\s\S]*?onCommit=\{commitSimplifyResult\}/);
  assert.match(panelSource, /onSubmit=\{commitPart\}/);
  assert.match(panelSource, /onSubmit=\{commitRegion\}/);
});

test('Shift+Enter and key-repeat do not accidentally submit a rewrite', () => {
  // MathInput submits only a plain Enter (no Shift, no composition); the
  // panel swallows a held-down Enter before the field sees it.
  const mathInput = fs.readFileSync('src/MathInput.jsx', 'utf8');
  assert.match(mathInput, /event\.key === 'Enter' && onSubmit && !event\.isComposing[^)]*!event\.shiftKey/);
  assert.match(panelSource, /if \(event\.key !== 'Enter' \|\| !event\.repeat\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(panelSource, /onKeyDownCapture=\{swallowRepeatedEnter\}[\s\S]*onKeyDownCapture=\{swallowRepeatedEnter\}/);
});

test('Rewrite input tells keyboard users Enter checks their work', () => {
  assert.match(panelSource, /ariaLabel=\{`Simplified form of \$\{part\.name\}\. Press Enter to check\.`\}/);
  assert.match(panelSource, /ariaLabel=\{`A simpler version of the \$\{region\.label\}\. Press Enter to check\.`\}/);
});
