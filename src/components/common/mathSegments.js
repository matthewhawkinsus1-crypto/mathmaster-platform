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
/*
 * A RADICAL TYPED AS TEXT: "cbrt(9y)", "root(7)(a)" (display and reading
 * polish). The radicals lessons key 27 boxes the way the grader reads them, and
 * MathText showed them as typed on every surface that draws a key (the closed
 * review and its "Correct:" rows, My Math Path's recap, a Test's results);
 * inside a slash fraction it drew a wrong one, "2cbrt(9y)/(3y)" as "2cbrt"
 * beside 9y over 3y. Each is drawn as the radical it is, \sqrt[3]{9y}, by
 * MathDisplay in LaTeX: never through MathLive's ASCIIMath reader, which reads
 * "[3, ∞)" as "3, ∞)". Its radicand's powers are set as a key's are
 * (normalizePlainMathTypography). Only the drawing changes: the text, so Read
 * aloud (speechText.js says it as a root) and every key and grade, stay as
 * they were. A letter before one is a factor ("2xcbrt(3)"), but a word
 * ending in "root" is not one: "cuberoot(3)(x)" is left alone.
 *
 * The Path banks key a square root the same way, "3sqrt(3)", "sqrt(2x+3)=5",
 * "(-(4)-sqrt(5))/2" (hint-ladder timing, item 2): Read aloud said them as
 * roots, and every surface that draws a key showed "sqrt" as typed. Each is
 * drawn \sqrt{…}, as a square root is written, with no index.
 */
const TYPED_RADICAL = /(?<!\\)(?:cbrt|(sqrt)|(?<![A-Za-z]{2})root\(\s*(\d+|[A-Za-z])\s*\))\s*(?=\()/g;

// The ")" that closes the "(" at `open`, or -1.
const closingParen = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')' && (depth -= 1) === 0) return index;
  }
  return -1;
};

// Each typed radical, outermost first: where it is, its index and its radicand.
const typedRadicals = (text) => {
  const found = [];
  for (const match of text.matchAll(TYPED_RADICAL)) {
    if (found.length && match.index < found[found.length - 1].end) continue;
    const open = match.index + match[0].length;
    const close = closingParen(text, open);
    if (close !== -1) found.push({ start: match.index, end: close + 1, index: match[1] ? '2' : match[2] ?? '3', radicand: text.slice(open + 1, close) });
  }
  return found;
};

const radicalLatex = (index, radicand) => `\\sqrt${index === '2' ? '' : `[${index}]`}{${typedRadicalsAsLatex(normalizePlainMathTypography(radicand.trim()))}}`;
function typedRadicalsAsLatex(text) {
  let out = '';
  let from = 0;
  for (const radical of typedRadicals(text)) {
    out += `${text.slice(from, radical.start)}${radicalLatex(radical.index, radical.radicand)}`;
    from = radical.end;
  }
  return out + text.slice(from);
}

/*
 * Inside a slash fraction a typed radical is held as √(…) while the fraction
 * is stacked, since stackDivisions reads that as one factor with the number
 * before it ("2√(9y)/(3y)" is (2√(9y))/(3y)), and gets its own index back
 * after. An author's own √ in the same text is left as it is: each √ is
 * marked, in order, as held or not.
 */
const holdRadicals = (text) => {
  const marks = [];
  let held = '';
  let from = 0;
  const authored = (piece) => [...piece].forEach((character) => { if (character === '√') marks.push(null); });
  for (const radical of typedRadicals(text)) {
    const before = text.slice(from, radical.start);
    authored(before);
    marks.push(radical.index);
    held += `${before}√(${radical.radicand})`;
    from = radical.end;
  }
  authored(text.slice(from));
  return { held: held + text.slice(from), marks };
};

// Where each held radical is in the stacked text, as [start, end, index].
const heldRadicalSpans = (stacked, marks) => {
  const spans = [];
  let count = 0;
  for (let at = stacked.indexOf('√'); at !== -1; at = stacked.indexOf('√', at + 1)) {
    const index = marks[count];
    count += 1;
    if (index === null || index === undefined || stacked[at + 1] !== '(') continue;
    const close = closingParen(stacked, at + 1);
    if (close !== -1) spans.push([at, close + 1, index]);
  }
  return count === marks.length ? spans : null;
};

// A stacked piece with its held radicals written as LaTeX radicals.
const releaseRadicals = (piece, offset, held) => {
  let out = '';
  let from = 0;
  held.filter(([start, end]) => start >= offset && end <= offset + piece.length).forEach(([start, end, index]) => {
    out += `${piece.slice(from, start - offset)}${radicalLatex(index, piece.slice(start - offset + 2, end - offset - 1))}`;
    from = end - offset;
  });
  return out + piece.slice(from);
};

const fractionRunsOf = (proseText) => {
  const text = removeRedundantPlainFractionParens(proseText);
  const radicals = typedRadicals(text).length ? holdRadicals(text) : null;
  if (!text.includes('/') && !radicals) return [{ text, isFraction: false }];
  const source = radicals ? radicals.held : text;
  const stacked = text.includes('/') ? stackDivisions(source, { unicodeMath: true }) : source;
  const held = radicals ? heldRadicalSpans(stacked, radicals.marks) : [];
  if (!held) return [{ text, isFraction: false }];
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
  // A held radical outside every fraction is a piece of its own, with any
  // fraction in its radicand ("cbrt(1/8)").
  const fractions = mathSpans(stacked);
  const alone = held.filter(([start, end]) => !fractions.some(([from, to]) => start >= from && end <= to)).map(([start, end]) => [start, end]);
  const spans = [...fractions.filter(([from, to]) => !alone.some(([start, end]) => from >= start && to <= end)), ...alone];
  for (const [start, end] of spans.sort((a, b) => a[0] - b[0])) {
    if (start > cursor || carried) pushProse(stacked.slice(cursor, start));
    const math = releaseRadicals(stacked.slice(start, end), start, held);
    const stop = SENTENCE_STOP_IN_DENOMINATOR.exec(math);
    chunks.push({ text: stop ? `${stop[1]}}` : math, isFraction: true });
    carried = stop ? stop[2] : '';
    cursor = end;
  }
  if (cursor < stacked.length || carried) pushProse(stacked.slice(cursor));
  return chunks.length ? chunks : [{ text, isFraction: false }];
};

/*
 * A LOGARITHM'S BASE TYPED AS TEXT: "log_0.5(x)", "log_b(v)", the families'
 * own spelling of a base that is not 2 or 10. The hint panel and the closed
 * review showed the underscore (walkthrough 2026-11-06, P-1). It is drawn as
 * a fraction or a power with a fraction is: its own piece, typeset with its
 * base as a subscript and its bracket. Only the drawing changes: the text, so
 * Read aloud ("log base 0.5 of x") and Translate's lines, stay as they were.
 */
const TYPED_LOG_BASE = /(?<![A-Za-z\\])log_(?:\{([^{}]+)\}|(\d+(?:\.\d+)?|[A-Za-z](?![A-Za-z])))(\([^()]*\))?/g;

export const splitProseFractionRuns = (proseText) => {
  const text = String(proseText ?? '');
  const runs = [];
  let from = 0;
  for (const match of text.matchAll(TYPED_LOG_BASE)) {
    if (match.index > from) runs.push(...fractionRunsOf(text.slice(from, match.index)));
    runs.push({ text: `\\log_{${match[1] ?? match[2]}}${match[3] ?? ''}`, isFraction: true });
    from = match.index + match[0].length;
  }
  if (!runs.length) return fractionRunsOf(text);
  if (from < text.length) runs.push(...fractionRunsOf(text.slice(from)));
  return runs;
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

// A power's exponent as characters: one number or one letter stands alone
// (x^{10} is x^10, x^{2} is x²), and anything more keeps its brackets, so
// x^{-2/3} is x^(-2/3), never x^-2/3, which reads as (x^-2)/3, and x^{3/2} is
// x^(3/2), never x³/2. A field's name is this (2026-11-06 re-walk: Algebra II
// Honors L3's labels, "$x^{-2/3}$ in simplest form").
const plainPower = (match, exponent) => {
  const inner = exponent.trim();
  return /^-?(?:\d+(?:\.\d+)?|[A-Za-z])$/.test(inner) ? `^${inner}` : `^(${inner})`;
};

/**
 * Authored text as plain characters, for places that cannot typeset.
 */
export const toPlainMath = (value) => splitMathSegments(value)
  .map((segment) => (isMathSegment(segment) ? unwrapMathSegment(segment).value : segment))
  .join('')
  // A system written as cases is its equations, one after another.
  .replace(/\\begin\s*\{cases\}([\s\S]*?)\\end\s*\{cases\}/g, (match, rows) => rows.split(/\\\\/).map((row) => row.trim()).filter(Boolean).join('; '))
  .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
  .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
  .replace(/\\(?:le|leq)\b/g, '≤')
  .replace(/\\(?:ge|geq)\b/g, '≥')
  .replace(/\\(?:ne|neq)\b/g, '≠')
  .replace(/\\(?:cdot|times)\b/g, '×')
  .replace(/\\div\b/g, '÷')
  .replace(/\\infty\b/g, '∞')
  .replace(/\\cup\b/g, '∪')
  .replace(/\\cap\b/g, '∩')
  .replace(/\\pi\b/g, 'π')
  .replace(/\\left|\\right/g, '')
  .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, '$1')
  .replace(/\^\{([^{}]*)\}/g, plainPower)
  .replace(/\^2(?![\d.])/g, '²')
  .replace(/\^3(?![\d.])/g, '³')
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
