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

/*
 * GRADING ONLY: π AND A SQUARE ROOT ARE NUMBERS.
 *
 * The math editor builds `\frac{\pi}{2}` and `\frac{\sqrt{3}}{2}` from a
 * typed `/`; an author keys `pi/2` and `sqrt(3)/2`. Rendering never needs
 * these stacked (π/2 reads fine), so the scanner above leaves them alone — and
 * the grader, which canonicalises both sides onto `\frac`, marked a student's
 * stacked π/2 wrong against the key pi/2 (student pass 3, H-13). With
 * `constantOperands` (answerEquivalence's canonicalizeDivisions only) the
 * operand next to a slash may also be:
 *
 *   π              with a number coefficient directly before it: `3π/4` is
 *                  (3π)/4, the same number as 3·(π/4) either way;
 *   \sqrt{…}       one square root (never an nth root), coefficient likewise:
 *                  `2\sqrt{3}/3` is (2√3)/3.
 *
 * A letter coefficient is not taken (`x\sqrt{3}/2` stays x·√3/2, the slope
 * rule's single factor), and the callers have already spelled pi, \pi and
 * sqrt(…) as π and \sqrt{…} (canonicalSymbolSpellings).
 */
const withNumberCoefficient = (text, start) => {
  let begin = start;
  while (begin > 0 && /[\d.]/.test(text[begin - 1])) begin -= 1;
  // A digit that ends a name or a subscript (`x_2\sqrt{3}`) is not a coefficient.
  if (begin > 0 && /[A-Za-z_\\^]/.test(text[begin - 1])) return start;
  return begin;
};

// An exponent is not an operand of its own: `x^π/2` is x^π over 2 and
// `e^\sqrt{2}/2` is e^√2 over 2, so a constant right after `^` brings its base
// along (the power comes along as one operand, below). After `_` it is part
// of a name and not taken at all.
const withPowerBase = (text, start, options) => {
  if (start <= 0) return { start };
  if (text[start - 1] === '_') return null;
  if (text[start - 1] !== '^') return { start };
  const base = operandBefore(text, start - 2, options);
  return base ? { start: base.start } : null;
};

const constantBefore = (text, index, options) => {
  let start = -1;
  if (text[index] === 'π') start = withNumberCoefficient(text, index);
  else if (text[index] === '}') {
    const open = matchBackwards(text, index);
    if (open < 5 || text.slice(open - 5, open) !== '\\sqrt') return null;
    start = withNumberCoefficient(text, open - 5);
  } else return null;
  const whole = withPowerBase(text, start, options);
  return whole ? { start: whole.start, text: text.slice(whole.start, index + 1) } : null;
};

/*
 * DISPLAY ONLY: A UNICODE RADICAL KEEPS ITS RADICAND, A SUPERSCRIPT ITS BASE.
 *
 * The Radical Expressions lessons write their mathematics as it looks: "√3/3",
 * "x√(xy)/y⁴", "∛(6x²)/(3x)", "ⁿ√a / ⁿ√b". The scanner read only the 3 after √
 * as a numerator, and stopped a denominator before ⁴, so a student was shown
 * √(3/3) and (√(xy)/y)⁴ in a lesson about simplifying exactly those. With
 * `unicodeMath` (MathDisplay and the prose splitter, never grading, whose
 * radical-form grader parses these itself) a radical sign with its index
 * (⁶√, ⁿ√) and radicand is one factor, a number coefficient before it comes
 * along as it does for \sqrt above (`2√3/3` is (2√3)/3), and a run of
 * superscript characters is the power of what it follows.
 */
const RADICAL_SIGN = /[√∛∜]/;
const SUPERSCRIPT_CHARACTER = /[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]/;

// Where a radical written just before `start` begins (its index, its sign and
// a number coefficient), or `start` when there is none.
const withRadicalBefore = (text, start, options) => {
  if (!options.unicodeMath || start <= 0 || !RADICAL_SIGN.test(text[start - 1])) return start;
  const sign = start - 1;
  let begin = sign;
  while (begin > 0 && SUPERSCRIPT_CHARACTER.test(text[begin - 1])) begin -= 1;
  // Superscripts right after a letter, a number or a bracket are its power
  // ("y⁴√x" is y⁴ times √x), not the root's index.
  if (begin < sign && begin > 0 && /[A-Za-z\d)\]]/.test(text[begin - 1])) return sign;
  return withNumberCoefficient(text, begin);
};

// The end of a run of superscript characters starting at `end`.
const pastSuperscripts = (text, end, options) => {
  if (!options.unicodeMath) return end;
  let after = end;
  while (SUPERSCRIPT_CHARACTER.test(text[after] || '')) after += 1;
  return after;
};

// A radical after a slash (`1/√3`, `/ⁿ√b`, `/∛(9x)`): its index, sign and
// radicand, with any power after it. Null when it is not one.
const radicalAfter = (text, index) => {
  let at = index;
  while (SUPERSCRIPT_CHARACTER.test(text[at] || '')) at += 1;
  if (!RADICAL_SIGN.test(text[at] || '')) return null;
  at += 1;
  let end;
  if (text[at] === '(') {
    const close = matchForwards(text, at);
    if (close < 0) return null;
    end = close + 1;
  } else if (/\d/.test(text[at] || '')) {
    end = at;
    while (/[\d.]/.test(text[end] || '')) end += 1;
  } else if (/[A-Za-z]/.test(text[at] || '')) end = at + 1;
  else return null;
  return end;
};

/*
 * The end of an exponent starting at `start` (just after `^`): a run of
 * digits, or a bracketed group. -1 when it cannot be read.
 */
const exponentEnd = (text, start) => {
  if (/\d/.test(text[start] || '')) {
    let end = start;
    while (/\d/.test(text[end] || '')) end += 1;
    return end;
  }
  if (text[start] === '{' || text[start] === '(') {
    const close = matchForwards(text, start);
    return close < 0 ? -1 : close + 1;
  }
  return -1;
};

// A constant denominator takes its own power: `2/π^2` is 2 over π², and the
// editor writes it \frac{2}{\pi^2}. It is never (2/π)², and a denominator
// followed by anything else that binds (a letter, a digit, a subscript) is
// not the constant alone.
const constantAfter = (text, index) => {
  if (text[index] === 'π') {
    let end = index + 1;
    if (text[end] === '^') {
      end = exponentEnd(text, end + 1);
      if (end < 0) return null;
    }
    return /[A-Za-z\d^_]/.test(text[end] || '') ? null : { end, text: text.slice(index, end) };
  }
  if (text.startsWith('\\sqrt{', index)) {
    const close = matchForwards(text, index + 5);
    if (close < 0 || /[A-Za-z\d^_]/.test(text[close + 1] || '')) return null;
    return { end: close + 1, text: text.slice(index, close + 1) };
  }
  return null;
};

/*
 * Grading: a one-letter name with its subscript (`x_2`, `x_{12}`), whose
 * subscript ends just before `subscriptStart + length`. `x_2^3/4` is
 * (x_2^3)/4, the editor's `\frac{x_2^3}{4}` (student pass 3). The letter must
 * stand alone: `\alpha_1` and `log_4` are not names this reads.
 */
const subscriptedName = (text, underscore) => {
  const letter = underscore - 1;
  if (letter < 0 || !/[A-Za-z]/.test(text[letter])) return null;
  if (letter > 0 && /[A-Za-z\\]/.test(text[letter - 1])) return null;
  return letter;
};

/*
 * Grading: a logarithm's call is ONE operand (TS05). The math editor stacks a
 * typed ln(3)/ln(2) as ln 3 over ln 2, which is what the key means. This
 * scanner took the bracket alone and then a single letter, so the key itself
 * read as ln·(3/l)·n(2), and the editor's \frac{\ln(3)}{\ln(2)} never met it
 * (mm_A2_5D's exact solutions, typed into the real editor). Only ln and log,
 * any base (log_2, log_{10}) — the two the grader already reads as words
 * (GR34) — and never as the tail of a longer word.
 */
const CALL_NAME = String.raw`(?:ln|log(?:_(?:\{[^{}]*\}|\d+|[A-Za-z]))?)`;
const CALL_NAME_BEFORE = new RegExp(`(?<![A-Za-z\\\\])${CALL_NAME}\\s*$`);
const CALL_NAME_AFTER = new RegExp(`^${CALL_NAME}\\s*(?=(?:\\\\left)?\\()`);
/*
 * Display: the same rule, for the names a student reads as functions — ln,
 * log, and sin, cos, tan and their reciprocals — written bare or as the LaTeX
 * command. MathDisplay drew an authored ln(3)/ln(2) (A2.5D's exact answer) as
 * ln·(3/l)·n(2), and log_2(8)/3 as log base 2 of 8/3, a different number.
 * Grading keeps its own two names: it reads these as words (GR34).
 */
const DISPLAY_CALL_NAME = String.raw`\\?(?:ln|log(?:_(?:\{[^{}]*\}|\d+|[A-Za-z]))?|sin|cos|tan|sec|csc|cot)`;
const DISPLAY_CALL_NAME_BEFORE = new RegExp(`(?<![A-Za-z\\\\])${DISPLAY_CALL_NAME}\\s*$`);
const DISPLAY_CALL_NAME_AFTER = new RegExp(`^${DISPLAY_CALL_NAME}\\s*(?=(?:\\\\left)?\\()`);
/** Where the name of the call whose bracket opens at `open` starts, or null. */
const callNameBefore = (text, open, options = {}) => {
  const pattern = options.constantOperands ? CALL_NAME_BEFORE : DISPLAY_CALL_NAME_BEFORE;
  const match = pattern.exec(text.slice(0, open));
  return match ? match.index : null;
};

// Display: where a one-letter function's name (the f of f(x)) starts, for the
// bracket opening at `open`, or null.
const oneLetterNameBefore = (text, open) => {
  const letter = open - 1;
  if (letter < 0 || !/[A-Za-z]/.test(text[letter])) return null;
  return letter > 0 && /[A-Za-z\\_^]/.test(text[letter - 1]) ? null : letter;
};

// Display: where a power written right after `end` ends (`(x - 2)^2`,
// `ln(2)²`), `end` when there is none, or -1 when a caret's exponent cannot be
// read. A bracketed denominator takes its power: a/(x - h)^2 is a over the
// square, never the whole fraction squared.
const pastDisplayPower = (text, end, options) => {
  if (text[end] !== '^') return pastSuperscripts(text, end, options);
  return exponentEnd(text, end + 1);
};

/**
 * The operand ending at `end` (inclusive), or null when it cannot be read.
 *
 * A SINGLE FACTOR, never a run. `3/4x` has to become `\frac{3}{4}x` — reading
 * `4x` as the denominator would silently turn the slope 3/4 into 3/(4x).
 */
const operandBefore = (text, end, options = {}) => {
  let index = end;
  while (index >= 0 && /\s/.test(text[index])) index -= 1;
  if (index < 0) return null;

  if (options.constantOperands) {
    const constant = constantBefore(text, index, options);
    if (constant) return constant;
  }

  // Display: "y⁴" and "(x + 1)²" end in their power.
  if (options.unicodeMath && SUPERSCRIPT_CHARACTER.test(text[index])) {
    let baseEnd = index;
    while (baseEnd >= 0 && SUPERSCRIPT_CHARACTER.test(text[baseEnd])) baseEnd -= 1;
    const base = baseEnd >= 0 && !/\s/.test(text[baseEnd]) ? operandBefore(text, baseEnd, options) : null;
    return base ? { start: base.start, text: text.slice(base.start, index + 1) } : null;
  }

  if (text[index] === ')' || text[index] === ']') {
    const open = matchBackwards(text, index);
    if (open < 0) return null;
    const bracket = withLeftPrefix(text, open);
    // A call comes with its name, ln(3) and log_2(8): in grading (TS05) and
    // on screen.
    const named = options.constantOperands || options.unicodeMath ? callNameBefore(text, bracket, options) : null;
    if (named !== null) return { start: named, text: text.slice(named, index + 1) };
    // Display: so does a one-letter function, f(x)/2 and y(4)/y(1). As a
    // product the letter changes nothing on this side: a(b)/2 is a·b/2.
    const letter = options.unicodeMath ? oneLetterNameBefore(text, bracket) : null;
    if (letter !== null) return { start: letter, text: text.slice(letter, index + 1) };
    const start = withRadicalBefore(text, bracket, options);
    return { start, text: text.slice(start, index + 1) };
  }
  // A closing brace is the tail of a `\frac{…}{…}` or a superscript group as
  // often as it is an operand. Ambiguous: leave the slash alone — except, in
  // grading, a braced exponent: `x^{n-1}/2` is unambiguous LaTeX for
  // (x^{n-1})/2, so the power and its base come along as one operand. (An
  // ASCII `x^(n-1)/2` keeps the reading the renderer shows, x^((n-1)/2): the
  // owner kept that reading (GR04), and Pre-Flight advises an author who
  // writes a key that way to add the brackets they mean,
  // src/platform/preflight/answerKeyPreflight.js.)
  if (text[index] === '}') {
    if (!options.constantOperands) return null;
    const open = matchBackwards(text, index);
    if (open > 1 && text[open - 1] === '_') {
      const name = subscriptedName(text, open - 1);
      return name === null ? null : { start: name, text: text.slice(name, index + 1) };
    }
    if (open < 1 || text[open - 1] !== '^') return null;
    const whole = withPowerBase(text, open, options);
    return whole ? { start: whole.start, text: text.slice(whole.start, index + 1) } : null;
  }

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
    const base = operandBefore(text, start - 2, options);
    if (!base) return null;
    return { start: base.start, text: text.slice(base.start, index + 1) };
  }
  // A subscript is part of a name, not an operand of its own; in grading the
  // name and its one-character subscript come along together.
  if (start > 0 && text[start - 1] === '_') {
    if (!options.constantOperands || start !== index) return null;
    const name = subscriptedName(text, start - 1);
    return name === null ? null : { start: name, text: text.slice(name, index + 1) };
  }
  const whole = withRadicalBefore(text, start, options);
  return { start: whole, text: text.slice(whole, index + 1) };
};

/** The operand starting at `start`, or null when it cannot be read. */
const operandAfter = (text, start, options = {}) => {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (index >= text.length) return null;

  if (options.constantOperands) {
    const constant = constantAfter(text, index);
    if (constant) return constant;
    // A call is one operand, its name with it (TS05): `/ln(2)` is over ln 2.
    // A power on the call (`/ln(2)^2`) is not read: the slash is left.
    const call = CALL_NAME_AFTER.exec(text.slice(index));
    if (call) {
      const callOpen = index + call[0].length;
      const bracket = text.startsWith('\\left(', callOpen) ? callOpen + 5 : callOpen;
      const close = matchForwards(text, bracket);
      if (close < 0) return null;
      const end = withRightSuffix(text, close);
      return /[\^_]/.test(text[end] || '') ? null : { end, text: text.slice(index, end) };
    }
  }

  if (options.unicodeMath) {
    const radicalEnd = radicalAfter(text, index);
    if (radicalEnd !== null) {
      const end = pastSuperscripts(text, radicalEnd, options);
      return { end, text: text.slice(index, end) };
    }
    // Display: `/ln(2)` is over ln 2, and `/sin(x)^2` over its square.
    const call = DISPLAY_CALL_NAME_AFTER.exec(text.slice(index));
    if (call) {
      const callOpen = index + call[0].length;
      const bracket = text.startsWith('\\left(', callOpen) ? callOpen + 5 : callOpen;
      const close = matchForwards(text, bracket);
      if (close < 0) return null;
      const end = pastDisplayPower(text, withRightSuffix(text, close), options);
      return end < 0 ? null : { end, text: text.slice(index, end) };
    }
  }

  const openIndex = text.startsWith('\\left(', index) ? index + 5 : index;
  if (text[openIndex] === '(' || text[openIndex] === '[') {
    const close = matchForwards(text, openIndex);
    if (close < 0) return null;
    const closed = withRightSuffix(text, close);
    const end = options.unicodeMath ? pastDisplayPower(text, closed, options) : closed;
    if (end < 0) return null;
    return { end, text: text.slice(index, end) };
  }
  // A command after the slash (`3/\sqrt{2}`, `3/\frac{1}{2}`) needs a parser
  // this does not have. Left as written.
  if (text[index] === '\\' || text[index] === '{') return null;

  // A power belongs to the denominator: `180/d^2` is 180 over d-squared, not
  // 180 over d, all squared. A subscript is part of a name, so it comes too.
  const withTrailingPower = (end) => {
    if (options.unicodeMath && SUPERSCRIPT_CHARACTER.test(text[end] || '')) {
      const after = pastSuperscripts(text, end, options);
      return { end: after, text: text.slice(index, after) };
    }
    if (text[end] !== '^') return { end, text: text.slice(index, end) };
    // Grading: a braced exponent on a denominator (`3/x^{n-1}`) is its power.
    if (options.constantOperands && text[end + 1] === '{') {
      const close = matchForwards(text, end + 1);
      return close < 0 ? null : { end: close + 1, text: text.slice(index, close + 1) };
    }
    // …and so is a negated number or letter (`3/x^-2`, `3/2^-x`): the slash
    // comes before the power, so every reading is the same number (student
    // pass 3). Anything longer after the minus is left as written.
    if (options.constantOperands && text[end + 1] === '-') {
      const negated = /^-(?:\d+|[A-Za-z])(?![\w.^_{(\\])/.exec(text.slice(end + 1));
      if (negated) return { end: end + 1 + negated[0].length, text: text.slice(index, end + 1 + negated[0].length) };
    }
    const exponent = operandAfter(text, end + 1, options);
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
    // Display: 1/f(x) is over f(x), the reciprocal of the function.
    if (options.unicodeMath && (text[index + 1] === '(' || text.startsWith('\\left(', index + 1))) {
      const bracket = text[index + 1] === '(' ? index + 1 : index + 6;
      const close = matchForwards(text, bracket);
      if (close < 0) return null;
      const end = pastDisplayPower(text, withRightSuffix(text, close), options);
      return end < 0 ? null : { end, text: text.slice(index, end) };
    }
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
export const stackDivisions = (value, { skipAsciiCalls = true, constantOperands = false, unicodeMath = false } = {}) => {
  const options = { constantOperands, unicodeMath };
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
      const left = operandBefore(out, index - 1, options);
      if (!left) continue;
      const right = operandAfter(out, index + 1, options);
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
