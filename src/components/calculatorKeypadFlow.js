/*
 * WHERE THE NEXT KEYPAD PRESS GOES AFTER ÷.
 *
 * The ÷ key is spatial: what the student has written becomes the numerator and
 * the cursor waits in the denominator. Digits belong there (6 ÷ 12 builds 12),
 * but a student pressing 6 ÷ 3 + 1 means (6/3) + 1, not 6/(3 + 1). Without
 * this, every operator after ÷ silently landed in the denominator and the
 * calculator answered 1.5.
 *
 * An operator leaves the denominator only once the denominator has something
 * in it — 6 ÷ − 3 is a negative divisor — and never after the student opened a
 * parenthesis, because 6 ÷ (3 + 1) is them grouping on purpose.
 */

const OPERATOR_COMMANDS = new Set(['+', '-', '−', '\\times']);

export const isCalculatorOperatorCommand = (command) => OPERATOR_COMMANDS.has(String(command ?? ''));

export const denominatorHasContent = (latex) => !String(latex ?? '').includes('\\placeholder');

/**
 * @returns {{ leaveDenominator: boolean, divisionPending: boolean }}
 *          whether to move the cursor past the fraction before inserting, and
 *          whether a later operator should still be watched for.
 */
export const nextDivisionKeypadStep = ({ divisionPending, command, latex }) => {
  if (!divisionPending) return { leaveDenominator: false, divisionPending: false };
  const value = String(command ?? '');
  if (value === '(' || value === ')') return { leaveDenominator: false, divisionPending: false };
  if (isCalculatorOperatorCommand(value) && denominatorHasContent(latex)) {
    return { leaveDenominator: true, divisionPending: false };
  }
  return { leaveDenominator: false, divisionPending: true };
};
