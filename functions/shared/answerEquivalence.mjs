// Shared answer-equivalence rules used by the browser, Teacher Path Simulator,
// and Cloud Functions. A mathematically correct response must not be rejected
// merely because MathLive serializes it differently from the authored key.
//
// Keep deterministic equivalence here rather than in individual renderers. The
// same student response should receive the same verdict everywhere MathMaster
// grades it.

import {
  expandLatexShorthand,
  parsePolynomial,
  polynomialDegree,
  sameLinearEquation,
  samePolynomial,
  splitEquationSides,
} from './algebraicForm.mjs';
import { stackDivisions } from './stackDivisions.mjs';
import { sameExpandedPolynomialExpression } from './expandedPolynomialExpressionEquivalence.mjs';
import { sameLinearInequality } from './linearInequalityEquivalence.mjs';
export { sameNonnegativeRadicalExpression } from './nonnegativeRadicalExpressionEquivalence.mjs';
export { sameRationalExpression } from './rationalExpressionEquivalence.mjs';

const UNICODE_MINUS = /[−–—]/g;

export const normalizeStructuralMathLive = (value) => expandLatexShorthand(value)
  .trim()
  // Directional marks and zero-width format characters are not visible math.
  // MathLive/IME combinations may insert them between otherwise identical
  // tokens, so discard them at the shared browser/server boundary.
  .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
  .replace(UNICODE_MINUS, '-')
  .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)\b/g, '')
  // These commands classify a delimiter; they do not change the delimiter's
  // mathematical endpoint semantics.  Remove only the command (and an
  // optional empty group), never its following delimiter.
  .replace(/\\(?:mathopen|mathclose)\s*(?:\{\s*\})?/g, '')
  .replace(/\\lparen/g, '(')
  .replace(/\\rparen/g, ')')
  .replace(/\\dfrac/g, '\\frac')
  .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
  // MathLive commonly serializes visible set braces as \{...\}, \lbrace...
  // \rbrace, or the same tokens wrapped in \left/\right. They are the same
  // mathematical delimiters as authored literal { ... } braces.
  .replace(/\\lbrace/g, '{')
  .replace(/\\rbrace/g, '}')
  .replace(/\\\{/g, '{')
  .replace(/\\\}/g, '}')
  // ...and the same is true of interval brackets. Typing `[-5,7]` into a math
  // field serializes as `\left\lbrack-5,7\right\rbrack`, which every grader
  // used to read as a different answer from the `[-5,7]` in the answer key.
  .replace(/\\lbrack/g, '[')
  .replace(/\\rbrack/g, ']')
  .replace(/\\\[/g, '[')
  .replace(/\\\]/g, ']')
  .replace(/\\varnothing|\\emptyset|∅/g, '∅');

/**
 * One spelling for a division, whichever way it was written.
 *
 * An author types `L = 180/d^2` into the answer key. A student presses the
 * fraction key and the editor sends `L=\frac{180}{d^2}`. Those are the same
 * answer, and the grader marked the student wrong. Canonicalising both onto
 * `\frac` before any text comparison is what makes them agree — and it costs
 * nothing, because a division that cannot be read confidently is left alone.
 */
const canonicalizeDivisions = (value) => stackDivisions(value, { skipAsciiCalls: false });

/** `abs(...)` as the bars it means, with the call's own parentheses matched. */
const absCallsAsBars = (value) => {
  let text = String(value ?? '');
  for (let guard = 0; guard < 12; guard += 1) {
    const match = /(?<![A-Za-z\\])abs\s*\(/.exec(text);
    if (!match) break;
    let depth = 0;
    let close = -1;
    for (let index = match.index + match[0].length - 1; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      else if (text[index] === ')') {
        depth -= 1;
        if (depth === 0) { close = index; break; }
      }
    }
    if (close < 0) break;
    text = `${text.slice(0, match.index)}|${text.slice(match.index + match[0].length, close)}|${text.slice(close + 1)}`;
  }
  return text;
};

/**
 * One spelling for the same symbol, for the comparisons that read text
 * (Job P). Each rewrite names exactly the same mathematics:
 *
 *   - π, `\pi` and `pi` are one constant (a `pi` inside a word is left alone);
 *   - `|x|`, `\lvert x\rvert`, `\vert x\vert` and `abs(x)` are one absolute value;
 *   - an exponent group: `^{n-1}` and `^(n-1)` are the same power, and so are
 *     `^{2}`, `^(2)` and `^2`.
 *
 * Applied to both sides of a comparison, so it can only make two spellings of
 * the same answer agree. It is not applied before the structural parsers
 * (polynomials, intervals, radicals), which keep reading what they always read.
 */
const canonicalSymbolSpellings = (value, { asciiPi = true } = {}) => {
  let text = absCallsAsBars(String(value ?? '')
    .replace(/\\(?:lvert|rvert|vert)(?![A-Za-z])/g, '|')
    // `2sqrt(3)` is the keypad's `2\sqrt{3}`; `\sqrt3` is `\sqrt{3}`.
    .replace(/(?<![A-Za-z\\])sqrt\s*\(([^()]*)\)/g, '\\sqrt{$1}')
    .replace(/\\sqrt\s*([A-Za-z0-9])/g, '\\sqrt{$1}')
    // `\pi r^2` loses its space to some comparisons (`\pir^2`): \pi is the
    // constant whatever letter follows (only \pitchfork is another command).
    .replace(/\\pi(?!tchfork)/g, 'π')
    // ASCII `pi` only while spaces still separate letters: once they are
    // gone, `p i` (p times i) would read as pi.
    .replace(asciiPi ? /(?<![A-Za-z\\])pi(?![A-Za-z])/g : /(?!)/g, 'π'));
  text = text.replace(/\^\{([^{}]+)\}/g, (match, body) => (
    /^\s*(?:\d+(?:\.\d+)?|[A-Za-z])\s*$/.test(body) ? `^${body.trim()}` : `^(${body})`
  ));
  // A negative exponent keeps its brackets: unwrapped, its minus would read as
  // a term's sign to the comparisons that split terms.
  return text.replace(/\^\(((?:\d+(?:\.\d+)?|[A-Za-z]))\)/g, '^$1');
};

export const normalizeAnswer = (value) => canonicalSymbolSpellings(canonicalizeDivisions(canonicalSymbolSpellings(normalizeStructuralMathLive(value))), { asciiPi: false })
  .replace(/\\cdot|\\times/g, '*')
  .replace(/\\infty|∞/g, 'inf')
  .replace(/\\cup|∪/g, 'u')
  .replace(/\\cap|∩/g, 'n')
  .replace(/\\leq?|≤/g, '<=')
  .replace(/\\geq?|≥/g, '>=')
  .replace(/\\neq?|≠/g, '!=')
  .replace(/\\,/g, '')
  .replace(/\{,\}/g, ',')
  .replace(/\s+/g, '')
  .toLowerCase();

// A number box answer written with its unit sign: `25%` for 25, `$12.50` for
// 12.5 (Job P). Only a sign at the end (%) or the start ($) of a plain number
// is dropped, so 25% is still not 0.25 and nothing else is read as a number.
const withoutUnitSign = (text) => {
  const percent = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\\?%$/.exec(text);
  if (percent) return percent[1];
  const dollars = /^(-?)\\?\$(\d+(?:\.\d+)?|\.\d+)$/.exec(text);
  if (dollars) return `${dollars[1]}${dollars[2]}`;
  return text;
};

export const asNumber = (value) => {
  const text = withoutUnitSign(normalizeAnswer(value));
  if (!text) return null;

  const latexFraction = text.match(/^(-?)\\frac\{([^{}]+)\}\{([^{}]+)\}$/);
  if (latexFraction) {
    const numerator = Number(`${latexFraction[1]}${latexFraction[2]}`);
    const denominator = Number(latexFraction[3]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }

  const fraction = text.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
};

// The unit sign a number was written with: 25% and $25 are not one answer.
const unitSignOf = (value) => {
  const text = normalizeAnswer(value);
  if (/%$/.test(text)) return '%';
  if (/^-?\\?\$/.test(text)) return '$';
  return '';
};

export const sameNumber = (left, right, tolerance = 1e-6) => {
  const leftSign = unitSignOf(left);
  const rightSign = unitSignOf(right);
  if (leftSign && rightSign && leftSign !== rightSign) return false;
  const a = asNumber(left);
  const b = asNumber(right);
  return a !== null && b !== null && Math.abs(a - b) <= tolerance;
};

export const sameText = (left, right) => normalizeAnswer(left) === normalizeAnswer(right);

/**
 * One number written with US thousands separators: `8,050`, `-12,000`,
 * `$8,050`, `1,234.5`, `12,000%` (and MathLive's `8{,}050`, which
 * normalizeAnswer already reads as `8,050`). Returns the same text with the
 * separators removed, or null when the text is not a correctly grouped number.
 *
 * The grouping must be exact — a first group of one to three digits with no
 * leading zero, then groups of exactly three — so `8,05`, `80,50`, `1,2345`
 * and `0,500` are never read as numbers. Anything with a bracket or a space
 * between entries is not touched either.
 *
 * This is NOT applied inside asNumber or normalizeAnswer. A comma is a
 * separator in ordered pairs, intervals, sets and lists, and `1,234` in a list
 * field is two numbers. Callers use it only where one number is expected
 * (sameNumberWithThousandsSeparators, and the field/literal/table graders
 * that decide that).
 */
const GROUPED_NUMBER = /^-?(?:\\?\$)?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?(?:\\?%)?$/;
export const withoutThousandsSeparators = (value) => {
  const text = normalizeAnswer(value);
  return GROUPED_NUMBER.test(text) ? text.replace(/,/g, '') : null;
};

/**
 * The same number, when at least one side is written with thousands
 * separators: `8,050` for a key of 8050, `8050` for a key authored `8,050`.
 * Unit signs keep their meaning (sameNumber): `$8,050` is 8050 but not 8050%.
 * False when neither side is grouped, so it never changes another verdict.
 */
export const sameNumberWithThousandsSeparators = (left, right, tolerance = 1e-6) => {
  const a = withoutThousandsSeparators(left);
  const b = withoutThousandsSeparators(right);
  if (a === null && b === null) return false;
  return sameNumber(a ?? left, b ?? right, tolerance);
};

/** Parse interval notation only when a caller has declared interval semantics. */
export const parseCanonicalIntervalNotation = (value) => {
  const raw = normalizeStructuralMathLive(value)
    .replace(/\\infty|∞/g, '∞')
    .replace(/\\cup|∪/g, '∪')
    .replace(/\{\s*,\s*\}/g, ',')
    .replace(/\\(?:,|;|!|quad|qquad)\b/g, '')
    .replace(/infinity|infty|inf/gi, '∞')
    // Legacy/authored interval keys commonly use ASCII u for union:
    //   (-inf,-7)u(-7,inf)
    // This parser only runs for fields explicitly declared as interval
    // notation, so treating standalone u/U between interval pieces as union is
    // unambiguous and keeps authored keys, MathLive \cup, and Unicode ∪ equal.
    .replace(/\b[uU]\b/g, '∪')
    .trim();
  if (!raw) return null;
  const pieces = raw.split('∪').map((piece) => piece.trim()).filter(Boolean);
  if (!pieces.length) return null;
  const parsed = [];
  for (const piece of pieces) {
    // An endpoint is ±∞, a decimal, or an exact fraction: `1/2`, `-3/4`,
    // `\frac{1}{2}`, or the keypad's `\frac{-1}{2}` (a sign inside the fraction;
    // asNumber settles it). A fraction endpoint used to make the whole answer
    // unreadable, so `(1/2, 3]` was wrong even typed exactly as the key (Job P).
    const match = piece.match(/^([[(])\s*(-?∞|-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?|-?\\frac\{-?\d+(?:\.\d+)?\}\{-?\d+(?:\.\d+)?\})\s*,\s*(-?∞|-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?|-?\\frac\{-?\d+(?:\.\d+)?\}\{-?\d+(?:\.\d+)?\})\s*([\])])$/);
    if (!match) return null;
    const endpoint = (token) => {
      if (token.includes('∞')) return token.startsWith('-') ? -Infinity : Infinity;
      const value = asNumber(token.replace(/\s+/g, ''));
      return value === null ? Number.NaN : value;
    };
    const min = endpoint(match[2]);
    const max = endpoint(match[3]);
    if (Number.isNaN(min) || Number.isNaN(max) || min > max) return null;
    parsed.push({ min, max, minClosed: match[1] === '[' && Number.isFinite(min), maxClosed: match[4] === ']' && Number.isFinite(max) });
  }
  return parsed.sort((a, b) => a.min - b.min || a.max - b.max);
};

export const sameIntervalNotation = (left, right, tolerance = 1e-6) => {
  const a = parseCanonicalIntervalNotation(left);
  const b = parseCanonicalIntervalNotation(right);
  if (!a || !b || a.length !== b.length) return false;
  const endpointEqual = (x, y) => x === y || (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= tolerance);
  return a.every((interval, index) => endpointEqual(interval.min, b[index].min)
    && endpointEqual(interval.max, b[index].max)
    && interval.minClosed === b[index].minClosed
    && interval.maxClosed === b[index].maxClosed);
};

const splitTopLevelCommaList = (value) => {
  const parts = [];
  let token = '';
  let roundDepth = 0;
  let squareDepth = 0;
  let braceDepth = 0;

  for (const char of String(value ?? '')) {
    if (char === '(') roundDepth += 1;
    else if (char === ')') roundDepth = Math.max(0, roundDepth - 1);
    else if (char === '[') squareDepth += 1;
    else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
    else if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);

    if (char === ',' && roundDepth === 0 && squareDepth === 0 && braceDepth === 0) {
      parts.push(token.trim());
      token = '';
    } else {
      token += char;
    }
  }
  parts.push(token.trim());
  return parts;
};

/**
 * Parse finite roster-form set notation. Returns null when the response is not
 * written as a set, and [] for the empty set.
 *
 * Examples accepted as the same structure:
 *   {-4, -3, -2}
 *   \\{-4,-3,-2\\}
 *   \\left\\lbrace -4,-3,-2 \\right\\rbrace
 */
export const parseFiniteSetNotation = (value) => {
  const text = normalizeStructuralMathLive(value).trim();
  if (!text) return null;
  if (text === '∅') return [];
  if (!(text.startsWith('{') && text.endsWith('}'))) return null;
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  const parts = splitTopLevelCommaList(inner);
  if (parts.some((part) => !part)) return null;
  return parts;
};

export const looksLikeFiniteSetNotation = (value) => parseFiniteSetNotation(value) !== null;

const invertInequalityOperator = (operator) => ({
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
}[operator] || operator);

const canonicalSimpleInequality = (value) => {
  const text = normalizeAnswer(value);
  if (!text || text.includes('!=')) return null;

  // Range quantities are routinely written either as V or V(t), f or f(x).
  // In an inequality these name the same dependent quantity; the argument is
  // notation, not a second mathematical variable. Keep this deliberately
  // narrow: one function letter and one single-letter argument only.
  const quantityPattern = '[a-z](?:\\([a-z]\\))?';
  const canonicalQuantity = (variable) => {
    const match = /^([a-z])(?:\([a-z]\))?$/.exec(String(variable || ''));
    return match ? match[1] : null;
  };

  const constraint = (variable, operator, bound) => {
    const numeric = asNumber(bound);
    const quantity = canonicalQuantity(variable);
    if (!quantity || numeric === null) return null;
    const side = operator === '>' || operator === '>=' ? 'lower' : 'upper';
    return { variable: quantity, side, operator, bound: numeric };
  };

  const direct = text.match(new RegExp('^(' + quantityPattern + ')(<=|>=|<|>)(-?\\d+(?:\\.\\d+)?)$'));
  if (direct) {
    const item = constraint(direct[1], direct[2], direct[3]);
    return item ? { variable: item.variable, constraints: [item] } : null;
  }

  const reversed = text.match(new RegExp('^(-?\\d+(?:\\.\\d+)?)(<=|>=|<|>)(' + quantityPattern + ')$'));
  if (reversed) {
    const item = constraint(reversed[3], invertInequalityOperator(reversed[2]), reversed[1]);
    return item ? { variable: item.variable, constraints: [item] } : null;
  }

  const chained = text.match(new RegExp('^(-?\\d+(?:\\.\\d+)?)(<=|>=|<|>)(' + quantityPattern + ')(<=|>=|<|>)(-?\\d+(?:\\.\\d+)?)$'));
  if (!chained) return null;

  const first = constraint(chained[3], invertInequalityOperator(chained[2]), chained[1]);
  const second = constraint(chained[3], chained[4], chained[5]);
  if (!first || !second) return null;
  return {
    variable: first.variable,
    constraints: [first, second].sort((a, b) => a.side.localeCompare(b.side)),
  };
};

export const sameSimpleInequality = (left, right, tolerance = 1e-6) => {
  const a = canonicalSimpleInequality(left);
  const b = canonicalSimpleInequality(right);
  if (!a || !b || a.variable !== b.variable || a.constraints.length !== b.constraints.length) return false;
  return a.constraints.every((constraint, index) => {
    const other = b.constraints[index];
    return constraint.side === other.side
      && constraint.operator === other.operator
      && Math.abs(constraint.bound - other.bound) <= tolerance;
  });
};

const sameAtomicValue = (left, right, tolerance = 1e-6) => (
  sameNumber(left, right, tolerance) || sameText(left, right)
);


/**
 * Compare an inverse-function equation without treating f^{-1}(x) as a
 * polynomial variable.
 *
 * The generic linear-equation fallback intentionally cannot parse function
 * notation on the left side. That meant a student could write the exact visible
 * inverse equation and still be marked wrong merely because MathLive serialized
 * the right side as a stacked fraction and the bank key used a slash.
 *
 * We keep the requested FORM strict:
 *   - both equations must put the same inverse-function name on the left;
 *   - only the right-hand linear polynomial is compared algebraically;
 *   - degree > 1 is refused, just like sameLinearEquation.
 */
const inverseFunctionHead = (value) => {
  const normalized = normalizeStructuralMathLive(value)
    .replace(/\s+/g, '')
    .replace(/⁻¹/g, '^-1')
    .replace(/\^\{\s*-1\s*\}/g, '^-1')
    .toLowerCase();
  const match = /^([a-z])\^-1\(([a-z])\)$/.exec(normalized);
  return match ? `${match[1]}^-1(${match[2]})` : null;
};

export const sameInverseFunctionEquation = (left, right, tolerance = 1e-6) => {
  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  const leftHead = inverseFunctionHead(a.left);
  const rightHead = inverseFunctionHead(b.left);
  if (!leftHead || !rightHead || leftHead !== rightHead) return false;

  const one = parsePolynomial(a.right);
  const two = parsePolynomial(b.right);
  if (!one || !two) return false;
  if (polynomialDegree(one) > 1 || polynomialDegree(two) > 1) return false;
  return samePolynomial(one, two, tolerance);
};


/**
 * Compare two equations that are BOTH written in expanded polynomial form.
 *
 * This is intentionally narrower than "algebraically equivalent polynomial".
 * A question that asks for standard form should accept:
 *
 *   y = 1*x^2 + (-6)*x + (1)
 *   y = x^2 - 6x + 1
 *
 * because those are merely machine-vs-human spellings of the SAME expanded
 * form. But it should NOT silently accept vertex/factored form:
 *
 *   y = (x - 3)^2 - 8
 *
 * even though that expands to the same polynomial. Form is part of the skill
 * in many Algebra I/II questions.
 */
const hasVariableGrouping = (value) => {
  const text = normalizeStructuralMathLive(value).replace(/\s+/g, '');
  // Parentheses/brackets containing a variable AND an addition/subtraction
  // are structural algebra groups (vertex/factored form), not harmless
  // parentheses around a generated numeric coefficient such as (-6).
  return /[\(\[][^)\]]*[A-Za-z][^)\]]*[+\-][^)\]]*[\)\]]/.test(text);
};


/**
 * Normalize cosmetic machine-vs-human differences WITHOUT changing algebraic
 * form or term order.
 *
 * Examples that should become identical:
 *   f(x)=2*(x-(4))^2+(-3)
 *   f(x)=2(x-4)^2-3
 *
 *   y=1*x^2+(-6)*x+(1)
 *   y=x^2-6x+1
 *
 * This is intentionally NOT an expander or simplifier. It does not transform
 * vertex form into standard form, factor, distribute, reorder terms, or move
 * anything across the equals sign.
 */
const normalizeFormPreservingSide = (value) => {
  // Remove generator bookkeeping around SINGLE numeric parameters BEFORE
  // structural MathLive normalization. This ordering matters for radicals:
  //
  //   sqrt(x-(1))  -> sqrt(x-1) -> \\sqrt{x-1}
  //
  // If the parentheses are removed only AFTER `normalizeStructuralMathLive`,
  // the first spelling is still ASCII `sqrt(...)` while the student spelling
  // has already become LaTeX `\\sqrt{...}`, and a correct answer is rejected.
  //
  // Settling signs here is equally important:
  //   x-(-5) -> x+5
  //   x+(-5) -> x-5
  let radicalReady = String(value ?? '')
    // A student naturally writes a geometric sequence as 5(4)^(n-1), while
    // generated keys often store 5*(4)^(n-1). Preserve that multiplication
    // BEFORE removing numeric bookkeeping parentheses. Restrict this to a
    // numeric coefficient immediately followed by a powered numeric base, so
    // named calls such as sqrt(4) and structural groups are untouched.
    .replace(/(\d)\((-?\d+(?:\.\d+)?)\)(?=\s*\^)/g, '$1*$2')
    .replace(/\((-?\d+(?:\.\d+)?)\)/g, '$1');

  for (let guard = 0; guard < 4; guard += 1) {
    const next = radicalReady
      .replace(/\+\+/g, '+')
      .replace(/\+-/g, '-')
      .replace(/-\+/g, '-')
      .replace(/--/g, '+');
    if (next === radicalReady) break;
    radicalReady = next;
  }

  // A student commonly writes 8sqrt(x) while a generator stores 8*sqrt(x).
  // Insert only the missing multiplication marker before the named radical
  // call BEFORE MathLive/ASCII radical normalization.
  radicalReady = radicalReady
    .replace(/([0-9A-Za-z)\]])sqrt\s*\(/g, '$1*sqrt(');

  let text = canonicalizeDivisions(normalizeStructuralMathLive(radicalReady))
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\s+/g, '')
    .replace(/\^\{(-?\d+)\}/g, '^$1');

  // Parentheses around generated numeric parameters are bookkeeping:
  //   x-(4) -> x-4
  //   x-(-2) -> x--2 -> x+2
  //   +(-3) -> +-3 -> -3
  // They are not algebraic grouping around a variable expression.
  text = text.replace(/\((-?\d+(?:\.\d+)?)\)/g, '$1');

  // Settle adjacent signs created by removing numeric bookkeeping parentheses.
  for (let guard = 0; guard < 4; guard += 1) {
    const next = text
      .replace(/\+\+/g, '+')
      .replace(/\+-/g, '-')
      .replace(/-\+/g, '-')
      .replace(/--/g, '+');
    if (next === text) break;
    text = next;
  }

  // An explicit multiplication mark next to a variable/group is just a typing
  // style. Do NOT remove 2*3, because turning it into 23 would change value.
  text = text
    .replace(/([0-9A-Za-z)\]])\*(?=[A-Za-z(])/g, '$1')
    .replace(/([0-9A-Za-z)\]])\*(?=\\sqrt\{)/g, '$1')
    .replace(/([A-Za-z)\]])\*(?=\()/g, '$1');

  // Suppress a coefficient of one only where algebra convention suppresses it.
  // 1x -> x, 1(x+2) -> (x+2), -1x -> -x.
  text = text
    .replace(/^1(?=[A-Za-z(])/g, '')
    .replace(/^\-1(?=[A-Za-z(])/g, '-')
    .replace(/([+\-])1(?=[A-Za-z(])/g, '$1');

  return text;
};

// The same side, or the same side with its constant term written first:
// vertex form `-3 + 2(x-4)^2` for `2(x-4)^2 - 3` (Job P). Moving a whole
// constant term never changes any term's own form.
const sameFormPreservingSide = (left, right) => {
  // π is read before the form normaliser removes spaces (so `p i` stays p·i);
  // everything else after it, so its own rules (a coefficient of 1 before a
  // root, generator brackets) see what they always saw.
  const piFirst = (value) => String(value ?? '')
    .replace(/\\pi(?!tchfork)/g, 'π')
    .replace(/(?<![A-Za-z\\])pi(?![A-Za-z])/g, 'π');
  const form = (value) => canonicalSymbolSpellings(normalizeFormPreservingSide(piFirst(value)), { asciiPi: false });
  const a = form(left);
  const b = form(right);
  if (a === b) return true;
  // A plain-text quotient keeps its old verdict: its extent is ambiguous
  // (`x-1/x+1`), so its terms are never moved (Job K's 2d rule).
  if ([left, right].some((value) => /\//.test(String(value ?? '')))) return false;
  return constantTermsLast(a) === constantTermsLast(b);
};

export const sameFormPreservingEquation = (left, right) => {
  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  return sameFormPreservingSide(a.left, b.left) && sameFormPreservingSide(a.right, b.right);
};


/**
 * The same form-preserving comparison for answer FIELDS that are expressions
 * rather than equations.
 *
 * This is the category the mass audit just exposed:
 *
 *   (x-11)*(x^2+11*x+121)
 *   (x-11)(x^{2}+11x+121)
 *
 * Those are the same factored difference-of-cubes form. The only differences
 * are explicit multiplication signs and MathLive's braces around an exponent.
 *
 * This comparator deliberately refuses anything containing "=" and uses the
 * same cosmetic-only normalizer as the equation comparator. It never expands,
 * factors, distributes, reorders factors, or simplifies a different form.
 */
export const sameFormPreservingExpression = (left, right) => {
  const a = String(left ?? '').trim();
  const b = String(right ?? '').trim();
  if (!a || !b) return false;
  if (a.includes('=') || b.includes('=')) return false;
  return sameFormPreservingSide(a, b);
};

export const sameExpandedPolynomialEquation = (left, right, tolerance = 1e-6) => {
  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  // Preserve which quantity/function is being defined.
  if (!sameText(a.left, b.left)) return false;

  // Do not turn a form-specific question into a generic "same graph" grader.
  if (hasVariableGrouping(a.right) || hasVariableGrouping(b.right)) return false;

  const one = parsePolynomial(a.right);
  const two = parsePolynomial(b.right);
  if (!one || !two) return false;
  if (polynomialDegree(one) > 8 || polynomialDegree(two) > 8) return false;

  return samePolynomial(one, two, tolerance);
};

/**
 * Compare polynomial EQUATIONS as relations rather than as a requested form.
 *
 * This is deliberately NOT called by sameValue. It is opt-in from private
 * grading metadata for constructs such as a parabola equation, where
 *
 *   (x-h)^2 = 4p(y-k)
 *   4p(y-k) = (x-h)^2
 *   y = (x-h)^2/(4p) + k
 *
 * are the same mathematical equation and should all grade the same. Algebra
 * questions that ask for a specific form keep the existing strict comparators.
 */
export const samePolynomialEquationRelation = (left, right, tolerance = 1e-6) => {
  const relationPolynomial = (value) => {
    const sides = splitEquationSides(value);
    if (!sides) return null;
    const lhs = parsePolynomial(sides.left);
    const rhs = parsePolynomial(sides.right);
    if (!lhs || !rhs) return null;
    if (polynomialDegree(lhs) > 8 || polynomialDegree(rhs) > 8) return null;

    const delta = new Map(lhs);
    for (const [key, coefficient] of rhs) {
      delta.set(key, (delta.get(key) || 0) - coefficient);
    }
    for (const [key, coefficient] of [...delta.entries()]) {
      if (Math.abs(coefficient) <= tolerance) delta.delete(key);
    }
    return delta.size ? delta : null;
  };

  const a = relationPolynomial(left);
  const b = relationPolynomial(right);
  if (!a || !b) return false;

  const keys = new Set([...a.keys(), ...b.keys()]);
  let ratio = null;
  for (const key of keys) {
    const av = a.get(key) || 0;
    const bv = b.get(key) || 0;
    if (Math.abs(av) <= tolerance && Math.abs(bv) <= tolerance) continue;
    if (Math.abs(av) <= tolerance || Math.abs(bv) <= tolerance) return false;
    const current = bv / av;
    if (!Number.isFinite(current) || Math.abs(current) <= tolerance) return false;
    if (ratio === null) ratio = current;
    else if (Math.abs(current - ratio) > tolerance * Math.max(1, Math.abs(ratio))) return false;
  }
  return ratio !== null;
};


/**
 * Compare absolute-value linear equations by the solution set they define.
 *
 * This is opt-in for modeling/formulation fields. It accepts harmless
 * equivalents such as |x-5|=3, |-x+5|=3, or the same equation with its sides
 * reversed, without changing the form-sensitive default equation grader.
 */
export const sameAbsoluteValueLinearEquation = (left, right, tolerance = 1e-6) => {
  const parse = (value) => {
    const sides = splitEquationSides(value);
    if (!sides) return null;

    const readAbsoluteSide = (side) => {
      const normalized = normalizeStructuralMathLive(side)
        .replace(/\\lvert|\\rvert|\\vert/g, '|')
        .replace(/\\operatorname\{abs\}/g, 'abs')
        .replace(/\\abs/g, 'abs')
        .trim();

      let inner = null;
      const bars = normalized.match(/^\|(.+)\|$/);
      const call = normalized.match(/^abs\((.+)\)$/i);
      if (bars) inner = bars[1];
      else if (call) inner = call[1];
      if (!inner) return null;

      const poly = parsePolynomial(inner);
      if (!poly || polynomialDegree(poly) > 1) return null;
      const variableTerms = [...poly.entries()].filter(([key]) => key !== '');
      if (variableTerms.length !== 1) return null;
      const [variable, coefficient] = variableTerms[0];
      if (!/^[a-z]$/.test(variable) || Math.abs(coefficient) <= tolerance) return null;
      return {
        variable,
        coefficient,
        constant: poly.get('') || 0,
      };
    };

    const leftAbs = readAbsoluteSide(sides.left);
    const rightAbs = readAbsoluteSide(sides.right);
    const leftConstant = asNumber(sides.left);
    const rightConstant = asNumber(sides.right);

    let absSide = null;
    let distanceSide = null;
    if (leftAbs && rightConstant !== null) {
      absSide = leftAbs;
      distanceSide = rightConstant;
    } else if (rightAbs && leftConstant !== null) {
      absSide = rightAbs;
      distanceSide = leftConstant;
    } else {
      return null;
    }

    if (distanceSide < -tolerance) {
      return { variable: absSide.variable, empty: true };
    }

    return {
      variable: absSide.variable,
      empty: false,
      center: -absSide.constant / absSide.coefficient,
      distance: Math.max(0, distanceSide) / Math.abs(absSide.coefficient),
    };
  };

  const a = parse(left);
  const b = parse(right);
  if (!a || !b || a.variable !== b.variable || a.empty !== b.empty) return false;
  if (a.empty) return true;
  return Math.abs(a.center - b.center) <= tolerance
    && Math.abs(a.distance - b.distance) <= tolerance;
};

const dedupeEquivalent = (values, tolerance) => {
  const unique = [];
  values.forEach((value) => {
    if (!unique.some((existing) => sameAtomicValue(value, existing, tolerance))) unique.push(value);
  });
  return unique;
};

/**
 * Compare two finite sets mathematically: element order and repeated roster
 * entries do not change a set. Braces are still required when a set is the
 * expected representation so a comma list is not silently accepted as roster
 * notation.
 */
export const sameFiniteSetNotation = (left, right, tolerance = 1e-6) => {
  const parsedLeft = parseFiniteSetNotation(left);
  const parsedRight = parseFiniteSetNotation(right);
  if (parsedLeft === null || parsedRight === null) return false;

  const a = dedupeEquivalent(parsedLeft, tolerance);
  const b = dedupeEquivalent(parsedRight, tolerance);
  if (a.length !== b.length) return false;

  return b.every((wanted) => {
    const index = a.findIndex((candidate) => sameAtomicValue(candidate, wanted, tolerance));
    if (index < 0) return false;
    a.splice(index, 1);
    return true;
  });
};


/**
 * Compare structured modeling equations while allowing only harmless
 * commutativity of top-level additive terms and reversal of equation sides.
 *
 * This is deliberately narrower than algebraic equation equivalence. It is
 * intended for authored rational-model fields such as work-rate equations,
 * where 1/a + 1/b = 1/t and 1/b + 1/a = 1/t are the same model, but moving or
 * cancelling variable-dependent terms would change the formulation being
 * assessed.
 */
export const sameCommutativeModelEquation = (left, right) => {
  const canonicalSide = (value) => {
    const text = normalizeAnswer(value);
    if (!text) return null;
    const terms = [];
    let token = '';
    let sign = '+';
    let roundDepth = 0;
    let squareDepth = 0;
    let braceDepth = 0;

    const push = () => {
      if (!token) return;
      terms.push(`${sign}${token}`);
      token = '';
    };

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '(') roundDepth += 1;
      else if (char === ')') roundDepth = Math.max(0, roundDepth - 1);
      else if (char === '[') squareDepth += 1;
      else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
      else if (char === '{') braceDepth += 1;
      else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);

      const topLevel = roundDepth === 0 && squareDepth === 0 && braceDepth === 0;
      if (topLevel && (char === '+' || char === '-') && token) {
        push();
        sign = char;
      } else if (topLevel && (char === '+' || char === '-') && !token) {
        sign = char;
      } else {
        token += char;
      }
    }
    push();
    return terms.sort().join('');
  };

  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  const al = canonicalSide(a.left);
  const ar = canonicalSide(a.right);
  const bl = canonicalSide(b.left);
  const br = canonicalSide(b.right);
  if (!al || !ar || !bl || !br) return false;

  return (al === bl && ar === br) || (al === br && ar === bl);
};


const canonicalSetBuilderNotation = (value) => {
  const text = normalizeAnswer(value)
    .replace(/\\mathbb\{r\}|ℝ/g, 'r')
    .replace(/\\in|∈/g, 'in')
    .replace(/\\mid|∣|｜/g, '|')
    .replace(/\\colon/g, ':')
    .replace(/\\land|∧|&&/g, '&')
    .replace(/and/g, '&')
    .replace(/;/g, '&');

  const match = /^\{([xy])(?:inr)?[|:]([^{}]+)\}$/.exec(text);
  if (!match) return null;

  const variable = match[1];
  const conditionText = match[2]
    .replace(/,+/g, '&')
    .replace(/&+/g, '&')
    .replace(/^&|&$/g, '');
  if (!conditionText) return null;

  const invert = (operator) => ({
    '<': '>',
    '<=': '>=',
    '>': '<',
    '>=': '<=',
  }[operator] || operator);

  const atoms = conditionText.split('&').filter(Boolean).map((condition) => {
    const direct = new RegExp('^' + variable + '(!=|<=|>=|<|>)(-?\\d+(?:\\.\\d+)?)$').exec(condition);
    if (direct) return {
      variable,
      operator: direct[1],
      bound: Number(direct[2]),
    };

    const reversed = new RegExp('^(-?\\d+(?:\\.\\d+)?)(<=|>=|<|>)' + variable + '$').exec(condition);
    if (reversed) return {
      variable,
      operator: invert(reversed[2]),
      bound: Number(reversed[1]),
    };

    return null;
  });

  if (atoms.some((atom) => !atom || !Number.isFinite(atom.bound))) return null;

  const deduped = [];
  for (const atom of atoms) {
    if (!deduped.some((entry) => entry.operator === atom.operator && entry.bound === atom.bound)) {
      deduped.push(atom);
    }
  }

  deduped.sort((a, b) => (
    a.operator.localeCompare(b.operator) || a.bound - b.bound
  ));
  return { variable, atoms: deduped };
};

/**
 * Compare the simple set-builder forms used for rational-function domain/range
 * restrictions. This is opt-in so a finite roster set such as {2,5} keeps its
 * existing semantics.
 *
 * Accepted harmless notation differences include real-set membership, "|" vs
 * ":", inequality reversal such as 4<y vs y>4, and reordered exclusions.
 * The comparator deliberately refuses compound algebra, unions, or predicates
 * it cannot parse rather than guessing.
 */
export const sameSetBuilderNotation = (left, right, tolerance = 1e-6) => {
  const a = canonicalSetBuilderNotation(left);
  const b = canonicalSetBuilderNotation(right);
  if (!a || !b || a.variable !== b.variable || a.atoms.length !== b.atoms.length) return false;
  return a.atoms.every((atom, index) => (
    atom.operator === b.atoms[index].operator
    && Math.abs(atom.bound - b.atoms[index].bound) <= tolerance
  ));
};

/**
 * An ordered pair compared coordinate by coordinate (Job P): `(1/2, 3)`,
 * `(0.5, 3)` and `(\frac{1}{2}, 3)` are one point. Both must be written in
 * round brackets with exactly two numeric coordinates. Read as an open
 * interval instead, the same two numbers name the same interval, so the
 * verdict is the same either way.
 */
const numericPair = (value) => {
  const text = normalizeAnswer(value);
  if (!/^\(.*\)$/.test(text)) return null;
  const parts = splitTopLevelCommaList(text.slice(1, -1));
  if (parts.length !== 2) return null;
  if (parts.some((part) => /[%$]/.test(part))) return null;
  const coordinates = parts.map((part) => asNumber(part));
  return coordinates.every((coordinate) => coordinate !== null) ? coordinates : null;
};

export const sameNumericPair = (left, right, tolerance = 1e-6) => {
  const a = numericPair(left);
  const b = numericPair(right);
  return Boolean(a && b) && a.every((coordinate, index) => Math.abs(coordinate - b[index]) <= tolerance);
};

/**
 * `x = 5` typed into a box whose key is the number 5 (Job P). Only a
 * one-letter name on the left and a number on the right; the key itself must
 * be a number. A key written as an equation is not read the other way round.
 */
const sameNumberWithVariableName = (student, key, tolerance) => {
  if (asNumber(key) === null) return false;
  const sides = splitEquationSides(normalizeAnswer(student));
  if (!sides || !/^[a-z]$/.test(sides.left)) return false;
  return sameNumber(sides.right, key, tolerance);
};

const hasInequalitySymbol = (value) => /[<>≤≥≠]|\\(?:le|ge|ne|lt|gt)/.test(String(value ?? ''));

/**
 * A side with its numeric constant terms moved to the end, in their order.
 * `-3+2(x-4)^2` and `2(x-4)^2-3` are the same; nothing inside a bracket, a
 * brace, bars or an exponent moves. Only a term with no letter moves:
 * reordering terms that hold a variable is the opt-in modelEquation
 * comparison's job, not this one's (`1/a + 1/b` stays apart from
 * `1/b + 1/a`, and so do `1/4 + 1/6` and `1/6 + 1/4`).
 */
const constantTermsLast = (text) => {
  // Nested bars cannot be told open from close, and a plain-text `/` is a
  // quotient whose extent is ambiguous (`x-1/x+1`): neither is reordered.
  if ((text.match(/\|/g) || []).length > 2 || text.includes('/')) return text;
  const terms = [];
  let token = '';
  let sign = '+';
  let depth = 0;
  let insideBars = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    else if (char === '|' && depth === 0) insideBars = !insideBars;
    const previous = text[index - 1];
    const separates = depth === 0 && !insideBars && (char === '+' || char === '-') && !['^', '*', '/', '(', '[', '{', '=', '<', '>'].includes(previous);
    if (separates) {
      if (token) terms.push(`${sign}${token}`);
      token = '';
      sign = char;
    } else {
      token += char;
    }
  }
  if (token) terms.push(`${sign}${token}`);
  const isConstant = (term) => !/[A-Za-z]/.test(term.replace(/\\(?:frac|sqrt|cdot|times)/g, ''));
  return [...terms.filter((term) => !isConstant(term)), ...terms.filter(isConstant)].join('');
};

/**
 * A compound inequality as the set of numbers it describes (Job P).
 * `x < -1 or x > 2`, `x > 2 \lor x < -1`, `-1 < x < 2`, `x > -1 and x < 2`
 * and `x > -1 \land x < 2` are read as unions of intervals. Each clause is a
 * simple inequality (canonicalSimpleInequality); anything else is unreadable
 * and returns null — never a guess.
 */
const compoundInequalitySet = (value) => {
  const text = normalizeStructuralMathLive(value)
    .replace(/\\(?:lor|vee)(?![A-Za-z])|∨/g, ' or ')
    .replace(/\\(?:land|wedge)(?![A-Za-z])|∧|&&?/g, ' and ')
    .replace(/\\(?:text|mathrm)\{\s*(or|and)\s*\}/g, ' $1 ');
  if (!/\s(?:or|and)\s/i.test(` ${text} `) && !/(?:<|>|≤|≥|\\le|\\ge).*(?:<|>|≤|≥|\\le|\\ge)/.test(text)) return null;
  let variable = null;
  const groups = text.split(/\s+or\s+/i).map((group) => {
    let interval = { min: -Infinity, max: Infinity, minClosed: false, maxClosed: false };
    for (const clause of group.split(/\s+and\s+/i)) {
      const parsed = canonicalSimpleInequality(clause);
      if (!parsed) return null;
      if (variable !== null && parsed.variable !== variable) return null;
      variable = parsed.variable;
      for (const constraint of parsed.constraints) {
        const closed = constraint.operator === '<=' || constraint.operator === '>=';
        if (constraint.side === 'lower') {
          if (constraint.bound > interval.min || (constraint.bound === interval.min && !closed)) interval = { ...interval, min: constraint.bound, minClosed: closed };
        } else if (constraint.bound < interval.max || (constraint.bound === interval.max && !closed)) {
          interval = { ...interval, max: constraint.bound, maxClosed: closed };
        }
      }
    }
    return interval;
  });
  if (groups.some((group) => group === null) || variable === null) return null;
  // Drop empty pieces, then merge pieces that overlap or touch, so two
  // spellings of the same set compare equal.
  const pieces = groups
    .filter((piece) => piece.min < piece.max || (piece.min === piece.max && piece.minClosed && piece.maxClosed))
    .sort((a, b) => a.min - b.min || Number(b.minClosed) - Number(a.minClosed));
  const merged = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && (piece.min < last.max || (piece.min === last.max && (piece.minClosed || last.maxClosed)))) {
      if (piece.max > last.max || (piece.max === last.max && piece.maxClosed)) {
        last.max = piece.max;
        last.maxClosed = piece.maxClosed;
      }
    } else {
      merged.push({ ...piece });
    }
  }
  return { variable, pieces: merged };
};

export const sameCompoundInequality = (left, right, tolerance = 1e-6) => {
  const a = compoundInequalitySet(left);
  const b = compoundInequalitySet(right);
  if (!a || !b || a.variable !== b.variable || a.pieces.length !== b.pieces.length) return false;
  const same = (x, y) => x === y || (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= tolerance);
  return a.pieces.every((piece, index) => {
    const other = b.pieces[index];
    return same(piece.min, other.min) && same(piece.max, other.max)
      && (!Number.isFinite(piece.min) || piece.minClosed === other.minClosed)
      && (!Number.isFinite(piece.max) || piece.maxClosed === other.maxClosed);
  });
};

/** The equation comparisons that read one side against the matching side. */
const sameEquationSideBySide = (left, right, tolerance) => (
  sameFormPreservingEquation(left, right)
  || sameInverseFunctionEquation(left, right, tolerance)
  || sameExpandedPolynomialEquation(left, right, tolerance)
  || sameLinearEquation(left, right, tolerance)
);

export const sameValue = (left, right, tolerance = 1e-6) => {
  const leftSet = parseFiniteSetNotation(left);
  const rightSet = parseFiniteSetNotation(right);
  if (leftSet !== null || rightSet !== null) {
    return leftSet !== null && rightSet !== null && sameFiniteSetNotation(left, right, tolerance);
  }
  if (sameAtomicValue(left, right, tolerance)) return true;
  if (sameNumericPair(left, right, tolerance)) return true;
  if (sameNumberWithVariableName(left, right, tolerance)) return true;
  if (sameSimpleInequality(left, right, tolerance)) return true;
  if (sameLinearInequality(left, right, tolerance)) return true;
  if (sameFormPreservingEquation(left, right)) return true;
  if (sameFormPreservingExpression(left, right)) return true;
  // Expanded polynomial answers are mathematical expressions, so harmless
  // term order and coefficient arithmetic must not make a correct student
  // response wrong. The comparator is deliberately form-specific: if either
  // side contains a grouped variable expression such as (x+2)(x+3), it
  // refuses rather than silently turning a factoring task into expansion.
  if (sameExpandedPolynomialExpression(left, right, tolerance)) return true;
  if (sameInverseFunctionEquation(left, right, tolerance)) return true;
  if (sameExpandedPolynomialEquation(left, right, tolerance)) return true;
  // LAST RESORT, and only for equations. Text equality already handled every
  // spelling the author thought to list; this catches the ones they did not —
  // an unreduced slope, a decimal for a fraction, a `\frac` from the keypad.
  // It compares side against side, so it cannot accept a different FORM of the
  // same line, and it refuses above degree one so it cannot silently grade a
  // "simplify" or "vertex form" question. See functions/shared/algebraicForm.mjs.
  if (sameLinearEquation(left, right, tolerance)) return true;
  if (sameCompoundInequality(left, right, tolerance)) return true;
  // The same equation with its sides swapped, `5 = x` for `x = 5` and
  // `2x + 1 = y` for `y = 2x + 1` (Job P). Each side is still compared with
  // the comparisons above, so the form a question asks for is kept.
  const swapped = !hasInequalitySymbol(left) && !hasInequalitySymbol(right) && splitEquationSides(left);
  return Boolean(swapped) && sameEquationSideBySide(`${swapped.right}=${swapped.left}`, right, tolerance);
};

/**
 * Digital SAT student-produced responses: the College Board's own rules for a
 * decimal that does not fit (Job P). Only for SAT-framework items — the
 * caller decides that from the item, never from the response.
 *
 * The SAT's directions: a positive answer fits in 5 characters, a negative one
 * in 6 (the minus sign counts); "if your answer is a decimal that doesn't fit
 * in the provided space, enter it by truncating or rounding at the fourth
 * digit". Their example for 2/3 accepts 2/3, .6666, .6667, 0.666 and 0.667,
 * and rejects 0.66, .66, 0.67 and .67; for −1/3 it accepts −.3333 and −0.333.
 *
 * So a decimal is right when it FILLS the space (5 or 6 characters, the
 * leading zero optional) and is the key truncated or rounded to the places it
 * shows. `0.781` and `.7808` for 57/73 are right; `0.78` is not, although it
 * is the number `0.780` (the spelling decides, which is why this reads the
 * typed text and not just its value). Exact answers are graded as before.
 */
export const sameDigitalSatStudentProducedResponse = (student, key) => {
  const typed = String(student ?? '').trim().replace(UNICODE_MINUS, '-');
  // The whole-number part is empty, 0, or has no leading zero: 00.67 pads
  // the space, it does not truncate or round anything.
  const match = /^(-?)(0|[1-9]\d*)?\.(\d+)$/.exec(typed);
  if (!match) return false;
  const negative = match[1] === '-';
  const width = negative ? 6 : 5;
  if (typed.length !== width) return false;
  const value = asNumber(key);
  if (value === null || (value < 0) !== negative || value === 0) return false;
  // The rule is for a decimal that does NOT fit. A key that fits exactly
  // (0.9999 as .9999) is graded as itself, never as a rounding of itself.
  const wholeDigits = Math.abs(value) < 1 ? 0 : String(Math.trunc(Math.abs(value))).length;
  const roomForPlaces = width - (negative ? 1 : 0) - wholeDigits - 1;
  const atRoom = Math.abs(value) * 10 ** roomForPlaces;
  if (roomForPlaces >= 0 && Math.abs(atRoom - Math.round(atRoom)) < 1e-9) return false;
  const places = match[3].length;
  const scale = 10 ** places;
  const magnitude = Math.abs(value) * scale;
  // A tiny nudge so a key whose product lands a hair under an integer in
  // floating point (0.29 * 100 = 28.999...) truncates to the same digit.
  const truncated = Math.floor(magnitude + 1e-9) / scale;
  const rounded = Math.round(magnitude + 1e-9) / scale;
  const typedMagnitude = Math.abs(Number(typed));
  // Zero is never the truncation of a nonzero answer the SAT would accept.
  return typedMagnitude > 0 && [truncated, rounded].some((candidate) => Math.abs(candidate - typedMagnitude) < 1e-12);
};
