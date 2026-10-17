/*
 * A MATH VALUE INSIDE A CONTROL'S NAME, SAID IN WORDS.
 *
 * A token or target whose `aria-label` interpolated its expression read the
 * program syntax the algebra engine produces: "Pick up the expression
 * ((12-3x)/(2)) from the isolated equation", "Apply the factor to 2*x". A
 * screen reader spelled out the brackets and slashes, and a voice-control
 * student could not say what the button showed ("12 minus 3x over 2"), so the
 * name did not match the visible label (WCAG 2.5.3).
 *
 * `spokenMathValue` says the value the way MathDisplay speaks the same value on
 * screen: divisions stacked first (stackDivisions, as MathDisplay does), then
 * the platform's math speech (spokenMathLabel). Before that it drops the
 * grouping the engine adds and a reader never sees: MathLive's `~` spacing,
 * parentheses around a lone number or term ("-(3)" → "-3", "(2~ y)" → "2 y")
 * and parentheses around the whole value.
 *
 * Use it for every math value an aria-label interpolates in the tools
 * (tests/platform/toolSpokenMathLabels.test.mjs enforces this).
 */
import { spokenMathLabel } from '../../platform/language/mathSpeechLabel.js';
import { stackDivisions } from '../../../functions/shared/stackDivisions.mjs';

// The first parenthesis of `text` closes at its last character.
const wrapsWhole = (text) => {
  if (!text.startsWith('(') || !text.endsWith(')')) return false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0 && index < text.length - 1) return false;
    }
  }
  return depth === 0;
};

// "(3)", "(2 y)", "(x)", "(0.5)": one unsigned term. Only where removing the
// brackets cannot join it to a neighbour or change what it belongs to: "2(3)"
// and "(2)3" keep them, and so does a group after / or ^ — "2/(3x)" is 2 over
// 3x, never (2/3)x.
const LONE_TERM_GROUP = /(^|[^0-9A-Za-z.)/^])\(\s*((?:\d+(?:\.\d+)?|\.\d+)?\s*[A-Za-z]?)\s*\)(?![0-9.(^])/;

export const tidyMathForSpeech = (value) => {
  let text = String(value ?? '').replace(/~/g, ' ').replace(/\s+/g, ' ').trim();
  for (let guard = 0; guard < 20; guard += 1) {
    const match = text.match(LONE_TERM_GROUP);
    if (!match || !match[2].trim()) break;
    text = `${text.slice(0, match.index)}${match[1]}${match[2].trim()}${text.slice(match.index + match[0].length)}`;
  }
  while (wrapsWhole(text)) text = text.slice(1, -1).trim();
  return text;
};

/** The words for a math value shown on a control: "12 minus 3x over 2". */
export const spokenMathValue = (value, options = {}) => {
  const text = tidyMathForSpeech(value);
  if (!text) return '';
  // As MathDisplay: "(1/2)x" is typeset as a fraction coefficient, not a quantity.
  const stacked = stackDivisions(text).replace(/\(\s*(\\frac\{[^{}]+\}\{[^{}]+\})\s*\)(?=\s*[A-Za-z])/g, '$1');
  return spokenMathLabel(stacked, options);
};

const OPERATION_WORDS = Object.freeze({ add: 'add', subtract: 'subtract', multiply: 'multiply by', divide: 'divide by' });

/**
 * A Step Algebra operation token in words: "divide by negative 3", "add 2x".
 * Empty for an operation it does not know, so a name never says "undefined".
 */
export const spokenOperation = (operation, operand) => {
  const verb = OPERATION_WORDS[operation];
  if (!verb) return '';
  const value = spokenMathValue(operand);
  return value ? `${verb} ${value}` : verb;
};

export default spokenMathValue;
