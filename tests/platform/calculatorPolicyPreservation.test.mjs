import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');

test('draggable MathLive calculator keeps the current calculator-policy contract', () => {
  assert.match(source, /getCalculatorButtonsForMode/);
  assert.match(source, /getCalculatorModeLabel/);
  assert.match(source, /evaluateCalculatorExpression\(expression,\s*policy\.mode\)/);
});
