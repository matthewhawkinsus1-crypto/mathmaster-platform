// Make a division look like a fraction.
//
// THE BUG. `\frac{3}{4}` renders stacked. So does the plain `3/4`, because
// MathLive's ASCIIMath reader turns a numeric division into a fraction. But
// `x/2`, `x/2 + 1` and `x/y` do not — anything with a letter in it stays a
// side slash — and neither does `3/4` once something else in the same string
// (a `\le`, a `\left`) makes the whole string read as LaTeX, where `/` is just
// a solidus. So whether a student saw a fraction depended on what else was in
// the sentence.
//
// The fix is to write the fraction explicitly before it is rendered. `\frac`
// stacks in both rendering modes, so this needs no change to format detection.
//
// EVERYTHING HERE IS CONSERVATIVE. A `/` this cannot read confidently is left
// exactly as it was: a wrong `\frac` changes what the mathematics SAYS, and a
// slash that fails to stack is only ugly. Whenever the two risks meet, the
// slash wins.

// ASCIIMath spellings LaTeX would render as literal letters. Introducing a
// `\frac` into such a string flips it to LaTeX rendering and turns `sqrt(x)`
// into the word "sqrt", so these strings are left alone entirely.
const ASCII_ONLY_CALL = /\b(?:sqrt|root|abs|norm|floor|ceil|text)\s*\(/;

// Groups whose contents are words, not mathematics. "miles/hour" is prose.
const VERBATIM_GROUP = /\\(?:text|mathrm|operatorname|textrm|mbox)\s*\{/g;

const OPEN_TO_CLOSE = { '(': ')', '[': ']', '{': '}' };
const CLOSE_TO_OPEN = { ')': '(', ']': '[', '}': '{' };

/** Index ranges the scanner must not touch, because they hold words. */
const verbatimRanges = (text) => {
  const ranges = [];
  VERBATIM_GROUP.lastIndex = 0;
  for (let match = VERBATIM_GROUP.exec(text); match; match = VERBATIM_GROUP.exec(text)) {
    const start = match.index;
    let depth = 0;
    let index = start + match[0].length - 1;
    for (; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') { depth -= 1; if (depth === 0) break; }
    }
    ranges.push([start, index]);
  }
  return ranges;
};

const insideAny = (ranges, index) => ranges.some(([start, end]) => index >= start && index <= end);

/** The matching opener for a closer at `end`, or -1. */
const matchBackwards = (text, end) => {
  const closer = text[end];
  const opener = CLOSE_TO_OPEN[closer];
  let depth = 0;
  for (let index = end; index >= 0; index -= 1) {
    if (text[index] === closer) depth += 1;
    else if (text[index] === opener) { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
};

/** The matching closer for an opener at `start`, or -1. */
const matchForwards = (text, start) => {
  const opener = text[start];
  const closer = OPEN_TO_CLOSE[opener];
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === opener) depth += 1;
    else if (text[index] === closer) { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
};

/** `\left(` before an opening bracket, so the delimiter is not orphaned. */
const withLeftPrefix = (text, open) => (text.slice(0, open).endsWith('\\left') ? open - 5 : open);
const withRightSuffix = (text, close) => (text.startsWith('\\right', close + 1) ? close + 7 : close + 1);

// Whether every bracket in `body` closes inside it — the test for "these two
// brackets are each other's partner", so `(a)+(b)` keeps both of them.
const bracketsBalance = (body) => {
  let depth = 0;
  for (const char of body) {
    if (char === '(') depth += 1;
    else if (char === ')') { depth -= 1; if (depth < 0) return false; }
  }
  return depth === 0;
};

// A numerator does not need brackets around it: `\frac{(x + 1)}{2}` prints the
// brackets a student did not need to see. `\left(…\right)` is checked first,
// because stripping the words and the brackets separately leaves an orphan.
const stripOuterParens = (value) => {
  const trimmed = value.trim();
  const sized = /^\\left\(([\s\S]*)\\right\)$/.exec(trimmed);
  if (sized) return bracketsBalance(sized[1]) ? sized[1] : trimmed;
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const body = trimmed.slice(1, -1);
    return bracketsBalance(body) ? body : trimmed;
  }
  return trimmed;
};

/**
 * The operand ending at `end` (inclusive), or null when it cannot be read.
 *
 * A SINGLE FACTOR, never a run. `3/4x` has to become `\frac{3}{4}x` — reading
 * `4x` as the denominator would silently turn the slope 3/4 into 3/(4x).
 */
const operandBefore = (text, end) => {
  let index = end;
  while (index >= 0 && /\s/.test(text[index])) index -= 1;
  if (index < 0) return null;

  if (text[index] === ')' || text[index] === ']') {
    const open = matchBackwards(text, index);
    if (open < 0) return null;
    const start = withLeftPrefix(text, open);
    return { start, text: text.slice(start, index + 1) };
  }
  // A closing brace is the tail of a `\frac{…}{…}` or a superscript group as
  // often as it is an operand. Ambiguous: leave the slash alone.
  if (text[index] === '}') return null;

  const single = /[A-Za-z]|\d/.test(text[index]);
  if (!single) return null;
  let start = index;
  if (/\d/.test(text[index])) {
    while (start > 0 && /[\d.]/.test(text[start - 1])) start -= 1;
  }
  // A letter that is the tail of a command (`\pi/2`) is not a bare variable.
  if (start > 0 && /[A-Za-z]/.test(text[index]) && /[A-Za-z\\]/.test(text[start - 1])) return null;
  // `x^2/3` is x-squared over three, so the power comes along as one operand.
  // Taking only the exponent would print `x^\frac{2}{3}` — a different number.
  if (start > 0 && text[start - 1] === '^') {
    const base = operandBefore(text, start - 2);
    if (!base) return null;
    return { start: base.start, text: text.slice(base.start, index + 1) };
  }
  // A subscript is part of a name, not an operand of its own.
  if (start > 0 && text[start - 1] === '_') return null;
  return { start, text: text.slice(start, index + 1) };
};

/** The operand starting at `start`, or null when it cannot be read. */
const operandAfter = (text, start) => {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (index >= text.length) return null;

  const openIndex = text.startsWith('\\left(', index) ? index + 5 : index;
  if (text[openIndex] === '(' || text[openIndex] === '[') {
    const close = matchForwards(text, openIndex);
    if (close < 0) return null;
    const end = withRightSuffix(text, close);
    return { end, text: text.slice(index, end) };
  }
  // A command after the slash (`3/\sqrt{2}`, `3/\frac{1}{2}`) needs a parser
  // this does not have. Left as written.
  if (text[index] === '\\' || text[index] === '{') return null;

  // A power belongs to the denominator: `180/d^2` is 180 over d-squared, not
  // 180 over d, all squared. A subscript is part of a name, so it comes too.
  const withTrailingPower = (end) => {
    if (text[end] !== '^') return { end, text: text.slice(index, end) };
    const exponent = operandAfter(text, end + 1);
    if (!exponent) return null;
    return { end: exponent.end, text: text.slice(index, exponent.end) };
  };

  if (/\d/.test(text[index])) {
    let end = index;
    while (end < text.length && /[\d.]/.test(text[end])) end += 1;
    if (text[end] === '_') return null;
    return withTrailingPower(end);
  }
  if (/[A-Za-z]/.test(text[index])) {
    if (text[index + 1] === '_') return null;
    return withTrailingPower(index + 1);
  }
  return null;
};

/**
 * Rewrite readable divisions as `\frac`, leaving everything else untouched.
 *
 * Returns the input unchanged when there is nothing to do, so callers can use
 * the result unconditionally.
 */
export const stackDivisions = (value, { skipAsciiCalls = true } = {}) => {
  const text = String(value ?? '');
  if (!text.includes('/')) return text;
  // The ASCIIMath guard exists to protect RENDERING: introducing a `\frac`
  // flips the string to LaTeX, where `sqrt(x)` is the word "sqrt". Grading has
  // no such problem — nothing is drawn — and there the canonical form matters
  // more, so the caller can turn the guard off.
  if (skipAsciiCalls && ASCII_ONLY_CALL.test(text)) return text;

  const skip = verbatimRanges(text);
  let out = text;
  // Left to right, restarting after each rewrite so nested cases settle.
  for (let guard = 0; guard < 24; guard += 1) {
    const ranges = verbatimRanges(out);
    let changed = false;
    for (let index = 0; index < out.length; index += 1) {
      if (out[index] !== '/') continue;
      if (insideAny(ranges, index) || insideAny(skip, index)) continue;
      const left = operandBefore(out, index - 1);
      if (!left) continue;
      const right = operandAfter(out, index + 1);
      if (!right) continue;
      const numerator = stripOuterParens(left.text.trim());
      const denominator = stripOuterParens(right.text.trim());
      if (!numerator || !denominator) continue;
      out = `${out.slice(0, left.start)}\\frac{${numerator}}{${denominator}}${out.slice(right.end)}`;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return out;
};

export default stackDivisions;
