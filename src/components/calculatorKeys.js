/*
 * THE CALCULATOR'S KEYS, AND WHAT IT SAYS AFTER "=".
 *
 * The keys were named only by their faces, so a screen reader said "C",
 * "x superscript y", "a fraction slash b", and nothing at all after "=" unless
 * the answer had an exact fraction (pass 3, A11Y-6). Each key now has a spoken
 * name in the math keypad's words (MathInput: "Insert square root"), and the
 * result is announced: "equals 3.75, exactly 15 over 4".
 */
import { spokenMathLabel } from '../platform/language/mathSpeechLabel.js';

const DIGIT = /^\d$/;

export const buttonSpec = (raw) => {
  const value = String(raw ?? '');
  if (value === 'C') return { label: 'C', action: 'clear', ariaLabel: 'Clear' };
  if (value === '=') return { label: '=', action: 'equals', ariaLabel: 'Equals' };
  if (value === '÷') return { label: '÷', action: 'fractionize', ariaLabel: 'Divide' };
  if (value === '×') return { label: '×', command: '\\times', ariaLabel: 'Times' };
  if (value === '^') return { label: 'xʸ', command: '#@^{#?}', ariaLabel: 'Insert exponent' };
  if (value === 'sin(') return { label: 'sin', command: '\\sin\\left(#0\\right)', ariaLabel: 'Insert sine' };
  if (value === 'cos(') return { label: 'cos', command: '\\cos\\left(#0\\right)', ariaLabel: 'Insert cosine' };
  if (value === 'tan(') return { label: 'tan', command: '\\tan\\left(#0\\right)', ariaLabel: 'Insert tangent' };
  if (value === 'sqrt(' || value === '√(') return { label: '√', command: '\\sqrt{#0}', ariaLabel: 'Insert square root' };
  if (value === 'log(') return { label: 'log', command: '\\log\\left(#0\\right)', ariaLabel: 'Insert logarithm' };
  if (value === 'ln(') return { label: 'ln', command: '\\ln\\left(#0\\right)', ariaLabel: 'Insert natural logarithm' };
  if (value === 'π') return { label: 'π', command: '\\pi', ariaLabel: 'Insert pi' };
  if (value === '-') return { label: '−', command: '-', ariaLabel: 'Minus' };
  if (value === '+') return { label: '+', command: '+', ariaLabel: 'Plus' };
  if (value === '(') return { label: '(', command: '(', ariaLabel: 'Open parenthesis' };
  if (value === ')') return { label: ')', command: ')', ariaLabel: 'Close parenthesis' };
  if (value === '.') return { label: '.', command: '.', ariaLabel: 'Decimal point' };
  if (DIGIT.test(value)) return { label: value, command: value, ariaLabel: value };
  return { label: value, command: value, ariaLabel: value };
};

export const FRACTION_KEY = Object.freeze({ label: 'a⁄b', command: '\\frac{#0}{#?}', ariaLabel: 'Insert stacked fraction' });

export const calculatorButtonsFor = (keys) => {
  const specs = keys.map(buttonSpec);
  const equalsIndex = specs.findIndex((button) => button.action === 'equals');
  if (equalsIndex >= 0) specs.splice(equalsIndex, 0, { ...FRACTION_KEY });
  else specs.push({ ...FRACTION_KEY });
  return specs;
};

/*
 * WHAT THE CALCULATOR COULD NOT READ (student pass 3, TOOL-8). The screen
 * showed a bare "Error"; it now says why, in the same words a screen reader
 * hears. `error` is what evaluateCalculatorExpression threw (its `reason` and
 * `detail`, calculatorExpression.js); anything else gets the general sentence.
 */
const GENERAL_ERROR = 'The calculator could not work that out. Check the expression.';
export const calculatorErrorMessage = (error = null) => {
  const detail = typeof error?.detail === 'string' && error.detail.trim() ? error.detail.trim() : null;
  switch (error?.reason) {
    case 'empty': return 'Type a calculation first.';
    case 'tooLong': return 'That calculation is too long. Work it out in smaller steps.';
    case 'symbol': return detail
      ? `It could not read “${detail}”. Use numbers, + − × ÷, brackets and the function keys.`
      : 'It could not read a symbol. Use numbers, + − × ÷, brackets and the function keys.';
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

/** What the calculator says after "=": "equals 3.75, exactly 15 over 4". */
export const calculatorResultAnnouncement = ({ decimal = null, fraction = null, error = false } = {}) => {
  if (error) return typeof error === 'string' ? error : GENERAL_ERROR;
  const value = String(decimal ?? '').trim();
  if (!value) return '';
  const said = spokenMathLabel(value);
  return fraction ? `equals ${said}, exactly ${spokenMathLabel(String(fraction))}` : `equals ${said}`;
};
