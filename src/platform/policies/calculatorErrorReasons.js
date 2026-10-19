/*
 * WHY A CALCULATOR REFUSED, AND WHAT TO CHANGE (student pass 3, TOOL-8).
 *
 * W5-4 gave the keypad calculator a reason for every refusal instead of a bare
 * "Error". The graphing calculator (GraphingCalculatorPanel, its model
 * graphingCalculatorModel.js) kept its own wording and missed the two
 * diagnoses below, so a bracket left open read "This line is not finished, or
 * has a symbol out of place", and a "#" (mathjs's comment mark) silently
 * dropped the rest of the line: y = 2x # 3 was graphed as y = 2x (W6-4).
 * Both calculators now read these from here. Pure: no mathjs, no React.
 */

/** The first character the calculator has no key for, as typed. */
export const firstUnreadable = (text) => {
  const match = /[=;[\]{}:_]|[^0-9a-zA-Z+\-*/^().,\s]/.exec(String(text ?? ''));
  return match ? match[0] : null;
};

/** Brackets in order: 'open' when one is never closed, 'close' when one closes nothing. */
export const bracketProblem = (text) => {
  let depth = 0;
  for (const char of String(text ?? '')) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth < 0) return 'close';
  }
  return depth > 0 ? 'open' : null;
};

/*
 * The sentence a student sees (and a screen reader hears) for a refusal:
 * `error.reason` and, where there is one, `error.detail`, the text it could
 * not read. `variable` names the letter a graphing line may use ("x"), so the
 * symbol sentence lists it with the keys.
 */
const GENERAL_ERROR = 'The calculator could not work that out. Check the expression.';
export const calculatorErrorMessage = (error = null, { variable = null } = {}) => {
  const detail = typeof error?.detail === 'string' && error.detail.trim() ? error.detail.trim() : null;
  const keys = `${variable ? `${variable}, ` : ''}numbers, + − × ÷, brackets and the function keys`;
  switch (error?.reason) {
    case 'empty': return 'Type a calculation first.';
    case 'tooLong': return 'That calculation is too long. Work it out in smaller steps.';
    case 'symbol': return detail
      ? `It could not read “${detail}”. Use ${keys}.`
      : `It could not read a symbol. Use ${keys}.`;
    case 'name': return detail
      ? `It could not read “${detail}”. Use the function keys for √, sin, cos, tan, log and ln.`
      : GENERAL_ERROR;
    case 'mode': return 'This calculator does not have that key on this question.';
    case 'notFinite': return 'That has no number answer. Check for dividing by 0.';
    case 'bracket-open': return 'A bracket is not closed. Add the missing “)”.';
    case 'bracket-close': return 'A “)” has no “(” to match it.';
    case 'syntax': return 'It could not read that. Check for a missing number, or two signs side by side.';
    default: return GENERAL_ERROR;
  }
};
