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
