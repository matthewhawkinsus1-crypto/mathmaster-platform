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

/** What the calculator says after "=": "equals 3.75, exactly 15 over 4". */
export const calculatorResultAnnouncement = ({ decimal = null, fraction = null, error = false } = {}) => {
  if (error) return 'The calculator could not work that out. Check the expression.';
  const value = String(decimal ?? '').trim();
  if (!value) return '';
  const said = spokenMathLabel(value);
  return fraction ? `equals ${said}, exactly ${spokenMathLabel(String(fraction))}` : `equals ${said}`;
};
