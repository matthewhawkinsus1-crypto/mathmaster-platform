import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');

test('calculator uses a MathLive field and offers a stacked-fraction key', () => {
  assert.match(source, /import ['"]mathlive['"]/);
  assert.match(source, /<math-field/);
  assert.match(source, /\\\\frac\{#0\}\{#\?\}/);
  assert.match(source, /getValue\?\.\(['"]ascii-math['"]\)/);
});

test('calculator panel is draggable with pointer events instead of being permanently anchored', () => {
  assert.match(source, /onPointerDown=/);
  assert.match(source, /onPointerMove=/);
  assert.match(source, /onPointerUp=/);
  assert.match(source, /touchAction:\s*['"]none['"]/);
  assert.match(source, /clampCalculatorPosition/);
});


test('division key builds a stacked fraction instead of inserting a division glyph', () => {
  assert.match(source, /value === '÷'.*action: 'fractionize'/);
  assert.match(source, /const insertStackedDivision/);
  assert.match(source, /executeCommand\?\.\('selectAll'\)/);
  assert.match(source, /mathField\.insert\('\\\\frac\{#0\}\{#\?\}'/);
  assert.doesNotMatch(source, /value === '÷'.*command: '\\\\div'/);
});

test('calculator supports a shared external launcher rather than floating its own blue pill', () => {
  assert.match(source, /showLauncher = true/);
  assert.match(source, /open: controlledOpen = null/);
  assert.match(source, /onOpenChange/);
  assert.match(source, /borderRadius:999/);
  assert.doesNotMatch(source, /background: '#1a73e8'.*Calculator/);
});
