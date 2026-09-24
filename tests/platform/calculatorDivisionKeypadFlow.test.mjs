import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextDivisionKeypadStep } from '../../src/components/calculatorKeypadFlow.js';

// Live QA: pressing 6 ÷ 3 + 1 = on the student calculator answered 1.5,
// because every key after ÷ stayed in the denominator: 6/(3 + 1).

const EMPTY_DENOMINATOR = '\\frac{6}{\\placeholder{}}';
const FILLED_DENOMINATOR = '\\frac{6}{3}';

test('an operator after a filled denominator leaves the fraction', () => {
  for (const command of ['+', '-', '\\times']) {
    assert.deepEqual(
      nextDivisionKeypadStep({ divisionPending: true, command, latex: FILLED_DENOMINATOR }),
      { leaveDenominator: true, divisionPending: false },
      command,
    );
  }
});

test('digits keep building the denominator', () => {
  assert.deepEqual(
    nextDivisionKeypadStep({ divisionPending: true, command: '2', latex: '\\frac{6}{1}' }),
    { leaveDenominator: false, divisionPending: true },
  );
});

test('a minus straight after ÷ is a negative divisor, not subtraction', () => {
  assert.deepEqual(
    nextDivisionKeypadStep({ divisionPending: true, command: '-', latex: EMPTY_DENOMINATOR }),
    { leaveDenominator: false, divisionPending: true },
  );
});

test('opening a parenthesis in the denominator is deliberate grouping', () => {
  assert.deepEqual(
    nextDivisionKeypadStep({ divisionPending: true, command: '(', latex: FILLED_DENOMINATOR }),
    { leaveDenominator: false, divisionPending: false },
  );
  // 6 ÷ (3 + 1): once grouping started, a later + stays where the student put it.
  assert.deepEqual(
    nextDivisionKeypadStep({ divisionPending: false, command: '+', latex: '\\frac{6}{\\left(3\\right)}' }),
    { leaveDenominator: false, divisionPending: false },
  );
});

test('the calculator panel applies the step before inserting a keypad command', () => {
  const source = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');
  const insertStart = source.indexOf('const insertCalculatorCommand');
  const insertEnd = source.indexOf('const insertStackedDivision');
  const insertRegion = source.slice(insertStart, insertEnd);
  const stepAt = insertRegion.indexOf('nextDivisionKeypadStep(');
  const leaveAt = insertRegion.search(/if \(step\.leaveDenominator\) mathField\.executeCommand\?\.\('moveToMathfieldEnd'\)/);
  const insertAt = insertRegion.indexOf('mathField.insert(command');
  assert.ok(stepAt > 0 && leaveAt > stepAt && insertAt > leaveAt, 'step → leave → insert, in that order');

  const divisionRegion = source.slice(insertEnd, source.indexOf('const handleCalculatorButton'));
  assert.match(divisionRegion, /divisionPendingRef\.current = true;/, '÷ arms the denominator watch');
});
