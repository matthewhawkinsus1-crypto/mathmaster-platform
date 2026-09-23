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


test('calculator focuses its MathLive field on open and owns Enter as equals', () => {
  assert.match(source, /requestAnimationFrame\(\(\) => \{[\s\S]*mathField\.focus/);
  assert.match(source, /mathField\.addEventListener\('keydown', handleKeyDown\)/);
  assert.match(source, /event\.key !== 'Enter'/);
  assert.match(source, /evaluateCalculatorExpression\(expression, policy\.mode\)/);
  assert.match(source, /event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/);
  assert.match(source, /data-calculator-expression="true"/);
});


test('calculator docks into Work View usable space without losing the single draggable panel instance', () => {
  assert.match(source, /--mm-work-view-calculator-right/);
  assert.match(source, /--mm-work-view-calculator-bottom/);
  assert.match(source, /data-work-view-floating-tool="calculator"/);
  assert.match(source, /panelPosition\s*\?\s*\{ left: panelPosition\.x, top: panelPosition\.y \}/);
});
