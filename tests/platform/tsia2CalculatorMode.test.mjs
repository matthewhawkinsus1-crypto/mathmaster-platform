import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CALCULATOR_MODES,
  calculatorModeAllowsExpression,
  getCalculatorButtonsForMode,
  getCalculatorModeLabel,
  resolveCalculatorPolicy,
} from '../../src/platform/policies/calculatorPolicy.js';
import { evaluateCalculatorExpression } from '../../src/platform/policies/calculatorExpression.js';
import { resolveExamCalculatorPolicy } from '../../src/platform/policies/examPolicyResolver.js';
import { EXAM_TYPES } from '../../src/platform/assessment/examDomainRegistry.js';

test('squareRoot is a concrete calculator mode', () => {
  assert.equal(CALCULATOR_MODES.SQUARE_ROOT, 'squareRoot');
  const policy = resolveCalculatorPolicy({ questionSpec: { calculatorMode: 'squareRoot' } });
  assert.deepEqual({ available: policy.available, mode: policy.mode }, { available: true, mode: 'squareRoot' });
});

test('TSIA2 accepts only authentic item-level calculator modes', () => {
  const squareRoot = resolveExamCalculatorPolicy({
    examType: EXAM_TYPES.TSIA2,
    questionSpec: { examCalculatorMode: CALCULATOR_MODES.SQUARE_ROOT },
  });
  assert.deepEqual({ available: squareRoot.available, mode: squareRoot.mode }, { available: true, mode: 'squareRoot' });

  const scientific = resolveExamCalculatorPolicy({
    examType: EXAM_TYPES.TSIA2,
    questionSpec: { examCalculatorMode: CALCULATOR_MODES.SCIENTIFIC },
  });
  assert.deepEqual({ available: scientific.available, mode: scientific.mode }, { available: false, mode: CALCULATOR_MODES.NONE });
});

test('square-root calculator UI exposes square root without scientific extras', () => {
  const buttons = getCalculatorButtonsForMode(CALCULATOR_MODES.SQUARE_ROOT);
  assert.equal(getCalculatorModeLabel(CALCULATOR_MODES.SQUARE_ROOT), 'SQUARE ROOT');
  assert.ok(buttons.includes('√('));
  for (const forbidden of ['sin(', 'cos(', 'tan(', 'log(', 'ln(', 'π', '^']) {
    assert.ok(!buttons.includes(forbidden), `square-root calculator must not expose ${forbidden}`);
  }
});

test('square-root expression guard blocks keyboard-only scientific escape hatches', () => {
  assert.equal(calculatorModeAllowsExpression('sqrt(81)+2', CALCULATOR_MODES.SQUARE_ROOT), true);
  assert.equal(calculatorModeAllowsExpression('sin(0)', CALCULATOR_MODES.SQUARE_ROOT), false);
  assert.equal(calculatorModeAllowsExpression('log(100)', CALCULATOR_MODES.SQUARE_ROOT), false);
  assert.equal(calculatorModeAllowsExpression('2^3', CALCULATOR_MODES.SQUARE_ROOT), false);
  assert.equal(calculatorModeAllowsExpression('pi', CALCULATOR_MODES.SQUARE_ROOT), false);
});

test('square-root evaluator enforces the calculator mode', () => {
  assert.equal(evaluateCalculatorExpression('sqrt(81)+2', CALCULATOR_MODES.SQUARE_ROOT), 11);
  assert.throws(() => evaluateCalculatorExpression('sin(0)', CALCULATOR_MODES.SQUARE_ROOT), /Unsupported calculator input for this mode/);
  assert.throws(() => evaluateCalculatorExpression('2^3', CALCULATOR_MODES.SQUARE_ROOT), /Unsupported calculator input for this mode/);
});
