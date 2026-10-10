import { evaluate, fraction, parse } from '../math/mathjs.js';
import { calculatorModeAllowsExpression } from './calculatorPolicy.js';

const SAFE_FUNCTIONS = new Set(['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs']);

const readBraceGroup = (text, openIndex) => {
  if (text[openIndex] !== '{') return null;
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return { value:text.slice(openIndex + 1, index), end:index + 1 };
    }
  }
  return null;
};

const replaceLatexFractions = (value) => {
  let text = String(value ?? '');
  for (let guard = 0; guard < 12 && text.includes('\\frac'); guard += 1) {
    const at = text.lastIndexOf('\\frac');
    const numerator = readBraceGroup(text, at + 5);
    if (!numerator) break;
    const denominator = readBraceGroup(text, numerator.end);
    if (!denominator) break;
    const next = `((${replaceLatexFractions(numerator.value)})/(${replaceLatexFractions(denominator.value)}))`;
    text = `${text.slice(0, at)}${next}${text.slice(denominator.end)}`;
  }
  return text;
};

const prepareCalculatorExpression = (expression, mode = null) => {
  const raw = String(expression ?? '').trim();
  if (!raw || raw.length > 180) throw new Error('Enter a shorter calculation.');
  const normalized = replaceLatexFractions(raw)
    .replace(/\\left|\\right/g, '')
    .replace(/\\div/g, '/')
    .replace(/\bdiv\b/gi, '/')
    .replace(/\\times|\\cdot/g, '*')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\\pi/g, 'pi')
    .replace(/π/g, 'pi')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/√/g, 'sqrt');
  if (!/^[0-9a-zA-Z+\-*/^().,\s]+$/.test(normalized) || /[=;[\]{}:_]/.test(normalized)) {
    throw new Error('Unsupported calculator input.');
  }
  if (!calculatorModeAllowsExpression(normalized, mode)) {
    throw new Error('Unsupported calculator input for this mode.');
  }
  const names = normalized.match(/[A-Za-z]+/g) || [];
  if (names.some((name) => !SAFE_FUNCTIONS.has(name) && !['pi', 'e'].includes(name))) {
    throw new Error('Unsupported calculator function.');
  }
  return normalized;
};

export const evaluateCalculatorExpression = (expression, mode = null) => {
  const normalized = prepareCalculatorExpression(expression, mode);
  const result = Number(evaluate(normalized));
  if (!Number.isFinite(result)) throw new Error('The calculation did not produce a finite number.');
  return Number(result.toPrecision(12));
};

/*
 * THE EXACT ANSWER, WHEN THERE IS ONE.
 *
 * The calculator answered only in decimals: 1/3 + 1/6 came back 0.5 and 1/3
 * as 0.333333333333. A student working with fractions needs the fraction.
 * The expression the calculator already accepted is walked with exact
 * rational arithmetic — numbers (decimals read exactly: 0.1 is 1/10),
 * + − × ÷, parentheses and integer powers — and anything else (a root, a
 * trig or log function, pi, e) means there is no exact fraction to show.
 *
 *   evaluateCalculatorExpressionExact(expression, mode)
 *     → { value, decimal, fraction }   fraction: 'n/d' text, or null when the
 *                                      result is an integer or not rational
 *
 * `value` and `decimal` are evaluateCalculatorExpression's own answer, so
 * the decimal never changes; errors are its errors.
 */
const MAX_EXACT_PART = 1e9;
const MAX_EXPONENT = 64;

const exactValue = (node) => {
  switch (node.type) {
    case 'ConstantNode': {
      if (typeof node.value !== 'number' && typeof node.value !== 'string') return null;
      const text = String(node.value);
      return /^\d+(?:\.\d+)?$|^\.\d+$/.test(text) ? fraction(text) : null;
    }
    case 'ParenthesisNode':
      return exactValue(node.content);
    case 'OperatorNode': {
      const args = node.args.map(exactValue);
      if (args.some((value) => value === null)) return null;
      if (node.fn === 'unaryMinus') return args[0].neg();
      if (node.fn === 'unaryPlus') return args[0];
      const [a, b] = args;
      if (node.fn === 'add') return a.add(b);
      if (node.fn === 'subtract') return a.sub(b);
      if (node.fn === 'multiply') return a.mul(b);
      if (node.fn === 'divide') return Number(b.n) === 0 ? null : a.div(b);
      if (node.fn === 'pow') {
        // Only an integer exponent keeps a rational result rational.
        if (Number(b.d) !== 1 || Math.abs(Number(b.n)) > MAX_EXPONENT) return null;
        if (Number(a.n) === 0 && Number(b.s) < 0) return null;
        return a.pow(b);
      }
      return null;
    }
    default:
      return null;
  }
};

export const evaluateCalculatorExpressionExact = (expression, mode = null) => {
  const value = evaluateCalculatorExpression(expression, mode);
  let exact = null;
  try {
    exact = exactValue(parse(prepareCalculatorExpression(expression, mode)));
  } catch {
    exact = null;
  }
  const numerator = exact ? Number(exact.n) * Number(exact.s) : null;
  const denominator = exact ? Number(exact.d) : null;
  const usable = exact
    && denominator !== 1
    && Math.abs(numerator) <= MAX_EXACT_PART && denominator <= MAX_EXACT_PART
    // The exact value must be the number the calculator shows.
    && Math.abs(numerator / denominator - value) <= 1e-9 * Math.max(1, Math.abs(value));
  return { value, decimal: String(value), fraction: usable ? `${numerator}/${denominator}` : null };
};
