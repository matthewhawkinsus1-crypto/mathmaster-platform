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
  const withoutLatexCommands = afterAmount.replace(/\\[A-Za-z]+/g, '');
  // "$3 + 2$" remains valid legacy inline math because there are no prose
  // words after the numeric prefix. "$15 per month. Solve $..." is currency.
  return /[A-Za-z]{2,}/.test(withoutLatexCommands);
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
export const normalizePlainMathTypography = (value) => String(value ?? '')
  .replace(/\^\(?(-?\d+|[xni])\)?/gi, (match, exponent) => {
    const converted = [...String(exponent).toLowerCase()]
      .map((character) => SUPERSCRIPT_CHARACTERS[character] || '')
      .join('');
    return converted && converted.length === String(exponent).length ? converted : match;
  })
  .replace(/<=/g, '≤')
  .replace(/>=/g, '≥')
  .replace(/!=/g, '≠')
  .replace(/\+\/-/g, '±');

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
