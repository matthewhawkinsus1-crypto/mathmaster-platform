import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');

test('draggable MathLive calculator keeps the current calculator-policy contract', () => {
  assert.match(source, /getCalculatorButtonsForMode/);
  // The drawer title comes from the policy module for the current mode (a
  // graphing policy titles the drawer SCIENTIFIC: it computes, it never graphs).
  assert.match(source, /getCalculator(?:Mode|Drawer)Label\(policy\.mode\)/);
  assert.match(source, /evaluateCalculatorExpression\(expression,\s*policy\.mode\)/);
});
