import { evaluate, fraction, parse } from '../math/mathjs.js';
import { calculatorModeAllowsExpression } from './calculatorPolicy.js';

const SAFE_FUNCTIONS = new Set(['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs']);
// The calculator shows 12 significant digits.
const DISPLAY_DIGITS = 12;

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
  return Number(result.toPrecision(DISPLAY_DIGITS));
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
 *
 * The parser stores each number as a double, so a typed number the double
 * cannot hold exactly (100000000000000000001, 0.10000000000000000001, 1e-400)
 * would be read as a different number: every typed number must equal its
 * double, or no fraction is shown. Intermediate values are capped in size —
 * ((1.000000001^64)^64)^4 is a finite decimal but an exact numerator of
 * millions of digits, which froze the page for a minute.
 */
const MAX_EXACT_PART = 1e9;
const MAX_EXPONENT = 64;
const MAX_EXACT_BITS = 4096;
const NUMBER_LITERAL = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

const bitLength = (big) => (big === 0n ? 0 : big.toString(2).length);
const tooLarge = (value) => bitLength(value.n) + bitLength(value.d) > MAX_EXACT_BITS;

// '0.1' → 1/10, '2e-3' → 1/500, read from the text, never through a double.
const exactLiteral = (text) => {
  const match = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || !`${match[1]}${match[2] || ''}`) return null;
  const exponent = Number(match[3] || 0) - (match[2] || '').length;
  if (Math.abs(exponent) > 400) return null;
  const digits = fraction(BigInt(`${match[1]}${match[2] || ''}`));
  const scale = fraction(10n ** BigInt(Math.abs(exponent)));
  return exponent < 0 ? digits.div(scale) : digits.mul(scale);
};

const literalsAreExact = (normalized) => (normalized.match(NUMBER_LITERAL) || []).every((text) => {
  const typed = exactLiteral(text);
  const stored = exactLiteral(String(Number(text)));
  return Boolean(typed && stored && typed.equals(stored));
});

const exactValue = (node) => {
  switch (node.type) {
    case 'ConstantNode': {
      if (typeof node.value !== 'number' || !Number.isFinite(node.value)) return null;
      return exactLiteral(String(node.value));
    }
    case 'ParenthesisNode':
      return exactValue(node.content);
    case 'OperatorNode': {
      const args = node.args.map(exactValue);
      if (args.some((value) => value === null || tooLarge(value))) return null;
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
        if ((bitLength(a.n) + bitLength(a.d)) * Math.abs(Number(b.n)) > MAX_EXACT_BITS) return null;
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
    const normalized = prepareCalculatorExpression(expression, mode);
    exact = literalsAreExact(normalized) ? exactValue(parse(normalized)) : null;
  } catch {
    exact = null;
  }
  const numerator = exact ? Number(exact.n) * Number(exact.s) : null;
  const denominator = exact ? Number(exact.d) : null;
  const usable = exact
    && denominator !== 1
    && Math.abs(numerator) <= MAX_EXACT_PART && denominator <= MAX_EXACT_PART
    // The exact value must be the number the calculator shows, to the digits
    // it shows: (1/3 + 1e8 - 1e8)/1000 shows 0.000333333328366, not 1/3000.
    && Number((numerator / denominator).toPrecision(DISPLAY_DIGITS)) === value;
  return { value, decimal: String(value), fraction: usable ? `${numerator}/${denominator}` : null };
};
