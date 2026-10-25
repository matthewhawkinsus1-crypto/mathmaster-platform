import { stackDivisions } from '../../../functions/shared/stackDivisions.mjs';

// Splitting prose into "words" and "mathematics", in one place.
//
// Single-dollar math delimiters are ambiguous in a school math product because
// ordinary currency also begins with `$`. A regex that simply grabs the next
// dollar sign can turn this perfectly normal sentence into one enormous math
// span:
//
//   Hector earns $1500 each pay period ... after a $100 retirement deduction.
//
// The scanner below keeps legacy $...$ math support, but refuses to treat a
// currency amount followed by prose as the opening of a math span. Explicit
// display delimiters ($$...$$, \(...\), \[...\]) remain unambiguous.

/** Legacy source retained for callers that import it directly. */
// The text of React children the way React would show it. JSX that builds a
// label in pieces — `{label}{unit ? ` (${unit})` : ''}` — hands MathText an
// ARRAY, and String(['Sum', '']) is "Sum,": every unit-less secure-exam field
// label carried a stray comma. Booleans, null and undefined render nothing.
export const mathTextFromChildren = (children) => {
  if (!Array.isArray(children)) return children === null || children === undefined || typeof children === 'boolean' ? '' : String(children);
  return children.flat(Infinity)
    .filter((child) => child !== null && child !== undefined && typeof child !== 'boolean')
    .map(String)
    .join('');
};

export const MATH_SEGMENT_SOURCE = [
  '\\$\\$[\\s\\S]+?\\$\\$',
  '\\\\\\[[\\s\\S]+?\\\\\\]',
  '\\\\\\([\\s\\S]+?\\\\\\)',
  '\\$(?:\\\\.|[^\\\\$\\n])+?\\$',
].join('|');

/** Legacy regex factory retained for compatibility. New splitting uses the scanner below. */
export const mathSegmentPattern = () => new RegExp(`(${MATH_SEGMENT_SOURCE})`, 'g');

const isEscapedAt = (text, index) => {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
};

const findNextUnescaped = (text, token, fromIndex) => {
  for (let index = fromIndex; index <= text.length - token.length; index += 1) {
    if (text.startsWith(token, index) && !isEscapedAt(text, index)) return index;
  }
  return -1;
};

const currencyPrefixLength = (text, dollarIndex) => {
  const tail = text.slice(dollarIndex);
  const match = /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/.exec(tail);
  if (!match) return 0;
  const next = tail[match[0].length] || '';
  // "$3x" is algebra, not a currency token. A currency number ends before
  // whitespace, punctuation, an operator, or the end of the string.
  if (next && /[A-Za-z0-9_]/.test(next)) return 0;
  return match[0].length;
};

// What may sit between two prices: list punctuation, and at most one short
// connector ("or", "to", "and", "vs", a dash, a slash, an arrow, an operator).
const PRICE_SEPARATORS = /^[\s,;:]*(?:(?:or|to|and|vs\.?|versus)|->|[-–—/→+×=<>≤≥])?[\s,;:]*$/i;

const isCurrencyProseOpening = (text, start, end) => {
  const prefixLength = currencyPrefixLength(text, start);
  if (!prefixLength) return false;
  const body = text.slice(start + 1, end);
  const afterAmount = body.slice(prefixLength - 1);
  // LaTeX command names are mathematics, not prose. In "$3 \times 18.25 =
  // \$54.75$" the word "times" must therefore not make "$3" look like an
  // ordinary currency opening. Remove command names before looking for real
  // prose words.
  //
  // The pattern here matched TWO literal backslashes (`\\\\` in a regex
  // literal is one escaped backslash, twice), while the authored text carries
  // one. So the command names were never removed, "times" read as prose, and
  // "$3 \times 18.25 = \$54.75$" was classified as currency and left in the
  // prose — the student saw "3 \times 18.25 = \" instead of the mathematics.
  //
  // A command's BRACED ARGUMENT goes with it. `\text{ with }` is how LaTeX puts
  // a word inside mathematics, so stripping only the command name left "with"
  // behind — and one prose word after the amount is exactly what this function
  // looks for. Every `$3 \text{ with } 32$` in the bank was therefore
  // classified as currency and shown to the student as raw markup.
  const stripLatex = (value) => {
    let text = value;
    for (let pass = 0; pass < 4; pass += 1) {
      const next = text.replace(/\\[A-Za-z]+\s*(?:\{[^{}]*\})*/g, '');
      if (next === text) return text;
      text = next;
    }
    return text;
  };
  const withoutLatexCommands = stripLatex(afterAmount);
  // A LIST OF PRICES. "sold $20, $25, and $50 cards": between the first two
  // dollar signs is "20, " — an amount and a comma, no words — so the rule
  // below read it as the math span "$20, $" and the student saw a typeset
  // "20," with the next price's dollar sign gone. When the span holds nothing
  // after the amount but list punctuation and its closing `$` itself opens
  // another amount, both are prices.
  //
  // TWO PRICES WITH A SHORT CONNECTOR (AX23). "$20 or $30", "$20 to $30",
  // "$20 - $30" and "$105 vs $120" are the same list with one word or dash in
  // it, and the word is under three letters, so the rule below read them as the
  // math span "$20 or $": the choice showed a typeset "20 or" and a screen
  // reader said no dollars at all. A connector between two amounts is not LaTeX
  // (arithmetic between amounts stays mathematics: "$20 + 5$" has no second price).
  if (PRICE_SEPARATORS.test(withoutLatexCommands) && text[end] === '$' && currencyPrefixLength(text, end) > 0) return true;
  // "$3 + 2$" remains valid legacy inline math because there are no prose
  // words after the numeric prefix. "$15 per month. Solve $..." is currency.
  //
  // THREE letters, not two. A product of single-letter variables reads as a
  // word to any letter-counting rule — "$2(lw+lh+wh)$" and "$2\pi rh$" were
  // both classified as an amount of money followed by prose, and shown to
  // students as markup. English prose after a price is reliably longer than
  // that ("per", "each", "cash"), and a two-letter product is only reachable
  // here at all when the amount is followed by punctuation or an operator:
  // "$2abc$" never gets this far, because a letter directly after the digits
  // already means it was never currency.
  return /[A-Za-z]{3,}/.test(withoutLatexCommands);
};

const findSingleDollarEnd = (text, start) => {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] !== '$' || isEscapedAt(text, index)) continue;
    if (text[index - 1] === '$' || text[index + 1] === '$') continue;
    return index;
  }
  return -1;
};

const pushSegment = (segments, value) => {
  if (!value) return;
  const previous = segments[segments.length - 1];
  if (previous && !isMathSegment(previous) && !isMathSegment(value)) {
    segments[segments.length - 1] = `${previous}${value}`;
  } else {
    segments.push(value);
  }
};

const SUPERSCRIPT_CHARACTERS = Object.freeze({
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', 'x': 'ˣ', 'n': 'ⁿ', 'i': 'ⁱ',
});

/**
 * Display-only cleanup for calculator-style exponent shorthand that appears in
 * ordinary prose instead of an explicit $...$ math span. Stored/grading text is
 * untouched. This keeps early Algebra prompts such as x^2 and 2^x from reaching
 * students with a raw caret when an author forgot math delimiters.
 */
const superscriptExponent = (match, exponent) => {
  const converted = [...String(exponent).toLowerCase()]
    .map((character) => SUPERSCRIPT_CHARACTERS[character] || '')
    .join('');
  return converted && converted.length === String(exponent).length ? converted : match;
};

export const normalizePlainMathTypography = (value) => String(value ?? '')
  // Parenthesized exponents consume their own matching parentheses.
  .replace(/\^\((-?\d+|[xni])\)/gi, superscriptExponent)
  // Bare exponents stop at the exponent itself. Do NOT make the closing
  // parenthesis optional here: in 3(2^x) that ")" belongs to the outer factor.
  .replace(/\^(-?\d+|[xni])/gi, superscriptExponent)
  .replace(/<=/g, '≤')
  .replace(/>=/g, '≥')
  .replace(/!=/g, '≠')
  .replace(/\+\/-/g, '±');

// The "}" that closes the "{" at `open`, or -1.
const closingBrace = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

// Every \frac{…}{…} that is not inside another, whole. "2/(y + 1/2)" stacks
// as \frac{2}{y + \frac{1}{2}}, and a pattern that stopped at the first inner
// brace typeset only the ½ and showed the student "\frac{2}{y + " as text
// (Dividing Polynomials).
const fractionSpans = (text) => {
  const spans = [];
  for (let start = text.indexOf('\\frac{'); start !== -1; start = text.indexOf('\\frac{', start + 1)) {
    if (spans.length && start < spans[spans.length - 1][1]) continue;
    const numeratorEnd = closingBrace(text, start + 5);
    const denominatorEnd = numeratorEnd !== -1 && text[numeratorEnd + 1] === '{' ? closingBrace(text, numeratorEnd + 1) : -1;
    if (denominatorEnd !== -1) spans.push([start, denominatorEnd + 1]);
  }
  return spans;
};

// Where the base of the power whose "^" is at `caret` begins: a number or a
// name ("27", "x", "2x"), or a bracketed group and what touches it ("(−16)",
// "f(x)"). -1 when nothing a power could sit on is there.
const powerBaseStart = (text, caret) => {
  let index = caret;
  if (text[index - 1] === ')') {
    let depth = 0;
    do {
      index -= 1;
      if (text[index] === ')') depth += 1;
      else if (text[index] === '(') depth -= 1;
    } while (index > 0 && depth > 0);
    if (depth !== 0) return -1;
  }
  while (index > 0 && /[\p{L}\p{N}]/u.test(text[index - 1])) index -= 1;
  return index < caret ? index : -1;
};

// The pieces of stacked prose to typeset: each whole fraction, and each power
// whose exponent holds one with its base ("x^(\frac{1}{3})", and
// "x^\frac{\frac{1}{3}}{x}", the reading stackDivisions gives B^(E)/N). Its
// brackets became braces when MathDisplay typesets it (braceScriptGroups);
// left in the prose, the student read "x^(" then a stacked ⅓ then ")".
const mathSpans = (text) => {
  const fractions = fractionSpans(text);
  const insideFraction = (index) => fractions.some(([start, end]) => index > start && index < end);
  const powers = [];
  for (let caret = text.indexOf('^('); caret !== -1; caret = text.indexOf('^(', caret + 1)) {
    if (insideFraction(caret) || (powers.length && caret < powers[powers.length - 1][1])) continue;
    let depth = 0;
    let close = caret + 1;
    for (; close < text.length; close += 1) {
      if (text[close] === '(') depth += 1;
      else if (text[close] === ')' && --depth === 0) break;
    }
    // A stacked fraction can be the base too: "1/(3x^3)^(3/3)" stacks as
    // \frac{1}{3x^3}^(\frac{3}{3}).
    let base = fractions.find(([, end]) => end === caret)?.[0] ?? powerBaseStart(text, caret);
    if (close === text.length || base === -1 || !fractions.some(([start]) => start > caret && start < close)) continue;
    // A power of a power, "(x^(1/3))^(1/2)" or "x^(1/2)^(1/3)", is one piece.
    while (powers.length && powers[powers.length - 1][1] > base) base = Math.min(base, powers.pop()[0]);
    powers.push([base, close + 1]);
  }
  const towers = fractions.map(([start, end]) => {
    const base = text[start - 1] === '^' ? powerBaseStart(text, start - 1) : -1;
    return [base === -1 ? start : base, end];
  });
  const outsidePowers = towers.filter(([start, end]) => !powers.some(([from, to]) => start >= from && end <= to));
  return [...powers, ...outsidePowers].sort((a, b) => a[0] - b[0]);
};

// `stackDivisions` reads digits and dots as one number, which is right for an
// answer ("3/4." is three over four point nought) but not for prose, where a
// dot no digit follows ends the sentence. Display only: grading never splits
// prose. Any piece's last denominator can take it ("Not 2^(x-1)/3.").
const SENTENCE_STOP_IN_DENOMINATOR = /^([\s\S]*\d)(\.+)\}$/;

// A number or a closing bracket touching the brackets is multiplying:
// "6(3/2)" without them is "63/2", sixty-three halves, and "(2/3)(3/2)"
// without the second pair is "2/33/2". An exponent, a subscript, a name or a
// radical touching them owns them: "x^(1/3)" without them was drawn as x¹ over
// 3 (the Rational Exponents lessons), "f(1/2)" is f of a half, and "√(5/4)" is
// the root of five quarters, not √5 over 4. A power after them is the whole
// fraction's: "(8/3)²" is not 8 over 3². Those brackets stay.
const SIMPLE_GROUPED_SLASH_FRACTION = /(?<![\d.)^_A-Za-z√∛∜])\(\s*([+-]?(?:\d+(?:\.\d+)?|[A-Za-z]))\s*\/\s*((?:\d+(?:\.\d+)?|[A-Za-z]))\s*\)(?![\d.^⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻])/g;

// Plain-text authoring often wrapped a slash fraction in parentheses only to
// keep the old one-line renderer from reading 2/3x as 2/(3x). Once the fraction
// is converted to a real stacked \frac, those parentheses are visual noise and
// can even appear to hug only the denominator because prose and MathDisplay are
// separate inline boxes. Strip only the simplest scalar grouping here. Explicit
// LaTeX parentheses and compound expressions are untouched, so an author can
// still request grouping when it is mathematically meaningful.
export const removeRedundantPlainFractionParens = (value) => String(value ?? '')
  .replace(SIMPLE_GROUPED_SLASH_FRACTION, '$1/$2');

/**
 * Splits a plain-prose (non-`$…$`-delimited) segment into alternating
 * plain-text and stacked-fraction chunks, using the same conservative
 * `a/b` -> `\frac{a}{b}` detector the rest of the platform already trusts
 * (`stackDivisions`). A mathematical fraction authored as plain prose
 * ("Simplify 2/3.") must never reach a student as a raw slash; a URL, file
 * path or prose unit such as "miles/hour" must never be touched —
 * `stackDivisions` already protects both (see its own docstring), so this
 * reuses it rather than inventing a second fraction detector.
 */
export const splitProseFractionRuns = (proseText) => {
  const text = removeRedundantPlainFractionParens(proseText);
  if (!text.includes('/')) return [{ text, isFraction: false }];
  const stacked = stackDivisions(text, { unicodeMath: true });
  if (stacked === text) return [{ text, isFraction: false }];
  const chunks = [];
  let cursor = 0;
  // A sentence's full stop that `stackDivisions` read into a denominator
  // ("Simplify 2/6." gives \frac{2}{6.}) goes back to the prose after it.
  let carried = '';
  const pushProse = (value) => {
    if (carried || value) chunks.push({ text: `${carried}${value}`, isFraction: false });
    carried = '';
  };
  for (const [start, end] of mathSpans(stacked)) {
    if (start > cursor || carried) pushProse(stacked.slice(cursor, start));
    const math = stacked.slice(start, end);
    const stop = SENTENCE_STOP_IN_DENOMINATOR.exec(math);
    chunks.push({ text: stop ? `${stop[1]}}` : math, isFraction: true });
    carried = stop ? stop[2] : '';
    cursor = end;
  }
  if (cursor < stacked.length || carried) pushProse(stacked.slice(cursor));
  return chunks.length ? chunks : [{ text, isFraction: false }];
};

/** Whether one already-split segment is mathematics. */
export const isMathSegment = (segment) => {
  const text = String(segment ?? '');
  if (!text) return false;
  if (text.startsWith('$$') && text.endsWith('$$') && text.length > 4) return true;
  if (text.startsWith('\\[') && text.endsWith('\\]') && text.length > 4) return true;
  if (text.startsWith('\\(') && text.endsWith('\\)') && text.length > 4) return true;
  if (text.startsWith('$') && text.endsWith('$') && !text.startsWith('$$') && text.length > 2) {
    return !isCurrencyProseOpening(text, 0, text.length - 1);
  }
  return false;
};

/** Prose and mathematics, in order, with ordinary currency left in prose. */
export const splitMathSegments = (value) => {
  const text = String(value ?? '');
  const segments = [];
  let proseStart = 0;
  let index = 0;

  while (index < text.length) {
    let token = null;
    let end = -1;

    if (!isEscapedAt(text, index) && text.startsWith('$$', index)) {
      token = '$$';
      end = findNextUnescaped(text, '$$', index + 2);
      if (end >= 0) end += 2;
    } else if (!isEscapedAt(text, index) && text.startsWith('\\[', index)) {
      token = '\\[';
      end = findNextUnescaped(text, '\\]', index + 2);
      if (end >= 0) end += 2;
    } else if (!isEscapedAt(text, index) && text.startsWith('\\(', index)) {
      token = '\\(';
      end = findNextUnescaped(text, '\\)', index + 2);
      if (end >= 0) end += 2;
    } else if (text[index] === '$' && !isEscapedAt(text, index) && text[index - 1] !== '$' && text[index + 1] !== '$') {
      const close = findSingleDollarEnd(text, index);
      if (close >= 0 && !isCurrencyProseOpening(text, index, close)) {
        token = '$';
        end = close + 1;
      }
    }

    if (!token || end < 0) {
      index += 1;
      continue;
    }

    pushSegment(segments, text.slice(proseStart, index));
    pushSegment(segments, text.slice(index, end));
    proseStart = end;
    index = end;
  }

  pushSegment(segments, text.slice(proseStart));
  return segments.filter(Boolean);
};

/**
 * Authored text as plain characters, for places that cannot typeset.
 */
export const toPlainMath = (value) => splitMathSegments(value)
  .map((segment) => (isMathSegment(segment) ? unwrapMathSegment(segment).value : segment))
  .join('')
  .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
  .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
  .replace(/\\(?:le|leq)\b/g, '≤')
  .replace(/\\(?:ge|geq)\b/g, '≥')
  .replace(/\\(?:ne|neq)\b/g, '≠')
  .replace(/\\(?:cdot|times)\b/g, '×')
  .replace(/\\infty\b/g, '∞')
  .replace(/\\cup\b/g, '∪')
  .replace(/\\cap\b/g, '∩')
  .replace(/\\pi\b/g, 'π')
  .replace(/\\left|\\right/g, '')
  .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, '$1')
  .replace(/\^\{?2\}?/g, '²')
  .replace(/\^\{?3\}?/g, '³')
  .replace(/\\(?:,|;|!|quad|qquad)/g, ' ')
  .replace(/[{}]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** The mathematics inside a delimited segment, and how to set it. */
export const unwrapMathSegment = (segment) => {
  const text = String(segment ?? '');
  if (text.startsWith('$$')) return { value: text.slice(2, -2), inline: false };
  if (text.startsWith('\\[')) return { value: text.slice(2, -2), inline: false };
  if (text.startsWith('\\(')) return { value: text.slice(2, -2), inline: true };
  return { value: text.slice(1, -1), inline: true };
};
