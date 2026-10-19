/*
 * DOES THIS HINT STATE AN ANSWER — OR ONLY QUOTE THE PROBLEM?
 * (student pass 3, HELP-16)
 *
 *   hintAnswerLeak(hint, { answers, visibleText }) → { values: [...], reason } | null
 *
 * The guard (questionHints.js) used to drop a hint that contained ANY answer
 * value as text. A number is an answer to one field and a coefficient of the
 * problem's own expression at the same time, so 32 of 200 teacher-written
 * hints were dropped and the student never knew: "The x-intercept is where the
 * output is 0: solve 0 = 3x − 8." went because 3 is the slope.
 *
 * THE ONE EXCEPTION, AND WHAT IT NEVER COVERS. A NUMBER answer (3, −2, 4/3)
 * does not count when EVERY place the hint writes it is inside something the
 * student is already shown, quoted whole:
 *
 *   - an expression with a variable — "3x − 8", "x − 7" — whose text is in
 *     the prompt or a field label ("g(x) = 3x − 8", "f(x − 7)");
 *   - a point — "(−2, 9)" — that is in the prompt or a field label.
 *
 * Everything else still counts, so a hint that STATES the number is dropped
 * exactly as before: "the slope is 3", "multiply by −2", "= −8/5", and a
 * number used as a coefficient the problem does not show ("7 = −2(−2) + b"
 * names the slope −2). A point, an expression, an equation or a word answer
 * is never excepted: "S1 = (−2, −2) lands at (−2, 4)" and "f(x + 3)" are
 * answers wherever they appear. When the reading is unsure — the occurrence
 * cannot be found again, an expression is not quoted exactly — the value
 * counts (fail closed).
 *
 * `reason` is a sentence for the author (Pre-Flight), never for a student.
 * Pure: no React, no I/O.
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

// One spelling of every minus sign. U+2212 is one UTF-16 unit, so positions
// in the normalised text are positions in the hint.
const minus = (value) => String(value ?? '').replace(/−/g, '-');
// What two quotations are compared on: case, spaces and the minus glyph do
// not matter; nothing else is rewritten.
const squash = (value) => minus(value).toLowerCase().replace(/\s+/g, '');

// A bare number: 3, −2, 0.5, 4/3, −1/10.
const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+)?$/;
export const isNumberAnswer = (value) => NUMBER.test(squash(value));

/**
 * Where the hint writes this number — read by VALUE, not as text. Every
 * number in the hint is read with its sign and its denominator: "12", "1/2",
 * "2.5" and "−2" do not write 2, while "6/3" and "2/1" do. A numerator over a
 * variable is not a number ("−1/n" does not write −1); a denominator under one
 * is ("x/2" writes 2). A minus is a sign the way the shared guard reads one
 * (pathSolutionSupport closeSigns): after an operand — a digit, a bracket, a
 * lone variable letter — it is subtraction, so "3x − 2" writes 2, as a term.
 */
const NUMBER_TOKEN = /(\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(\d+(?:\.\d+)?|\.\d+))?/g;
const numberValue = (value) => {
  const match = /^(-?)(\d+(?:\.\d+)?|\.\d+)(?:\/(\d+(?:\.\d+)?|\.\d+))?$/.exec(squash(value));
  if (!match) return null;
  const size = Number(match[2]) / (match[3] === undefined ? 1 : Number(match[3]));
  if (!Number.isFinite(size)) return null;
  return match[1] ? -size : size;
};
const signBefore = (haystack, index) => {
  let at = index - 1;
  while (at >= 0 && /\s/.test(haystack[at])) at -= 1;
  if (haystack[at] !== '-') return null;
  let before = at - 1;
  while (before >= 0 && /\s/.test(haystack[before])) before -= 1;
  const operand = before >= 0 && (/[\d.)\]]/.test(haystack[before])
    || (/[a-z]/i.test(haystack[before]) && !/[a-z]/i.test(haystack[before - 1] || '')));
  // A minus glued to its number with a space before it is a sign ("is a -2",
  // "(m) -2"); "3x − 8", spaced on both sides, stays subtraction.
  const glued = at === index - 1 && /\s/.test(haystack[at - 1] || '');
  return operand && !glued ? null : at;
};
// Every number the hint writes that could be this one as TEXT — the whole
// token, its numerator or its denominator spelled the same — and, of those,
// the ones that ARE this number by value. A candidate that reads as another
// number (a sign, a fraction, a numerator over a variable) is accounted for;
// a hint the shared guard matched with no candidate at all is not, and then
// the value counts (fail closed: an empty list is never "quoted").
const occurrences = (haystack, value) => {
  const wanted = numberValue(value);
  const unsigned = squash(value).replace(/^-/, '');
  const found = [];
  let candidates = 0;
  if (wanted === null) return { found, candidates };
  for (const match of haystack.matchAll(NUMBER_TOKEN)) {
    const start = match.index;
    const end = start + match[0].length;
    if (/[\d.]/.test(haystack[start - 1] || '')) continue;
    const spelled = match[0].replace(/\s+/g, '');
    if (spelled !== unsigned && match[1] !== unsigned && match[2] !== unsigned) continue;
    candidates += 1;
    // A numerator over a variable is not a number: "−1/n" does not write −1.
    if (/^\s*\/\s*[a-z]/i.test(haystack.slice(end))) continue;
    const size = Number(match[1]) / (match[2] === undefined ? 1 : Number(match[2]));
    const sign = signBefore(haystack, start);
    const read = sign === null ? size : -size;
    if (Math.abs(read - wanted) < 1e-9) found.push({ start: sign === null ? start : sign, end });
  }
  return { found, candidates };
};

// A point the hint writes, "(−2, 9)".
const POINT = /\(\s*-?[\d./]+\s*,\s*-?[\d./]+\s*\)/g;

// The run of mathematics around a position: digits, single letters
// (variables), operators and brackets. A word of two or more letters ends it
// unless a bracket follows (a function name: "log(x)"), and so do "=", ",",
// ";", ":" and sentence punctuation.
const MATH_CHAR = /[0-9a-z().+\-*/^·′'\s]/i;
const expressionAround = (haystack, start, end) => {
  const isWordLetter = (index) => /[a-z]/i.test(haystack[index] || '');
  const wordAt = (index) => {
    let from = index;
    let to = index;
    while (from > 0 && isWordLetter(from - 1)) from -= 1;
    while (to < haystack.length && isWordLetter(to)) to += 1;
    return { from, to, word: haystack.slice(from, to), call: haystack[to] === '(' };
  };
  const allowed = (index) => {
    const char = haystack[index];
    if (!char || !MATH_CHAR.test(char)) return false;
    if (!isWordLetter(index)) return true;
    const { word, call } = wordAt(index);
    return word.length === 1 || call;
  };
  let from = start;
  let to = end;
  while (from > 0 && allowed(from - 1)) from -= 1;
  while (to < haystack.length && allowed(to)) to += 1;
  // A sentence's full stop, a trailing operator and unmatched brackets are not
  // part of what is quoted; a leading minus is (it is the number's sign).
  const piece = haystack.slice(from, to).replace(/[\s.+\-*/·]+$/, '').replace(/^[\s.+*/·]+/, '');
  const balance = (value) => {
    let current = value.trim();
    for (let guard = 0; guard < 8; guard += 1) {
      const open = (current.match(/\(/g) || []).length;
      const close = (current.match(/\)/g) || []).length;
      if (open > close && current.startsWith('(')) current = current.slice(1).trim();
      else if (close > open && current.endsWith(')')) current = current.slice(0, -1).trim();
      else break;
    }
    return current;
  };
  return balance(piece);
};

// Quoted whole: the piece is in what the student reads as a whole token —
// "3x−8" is not quoted by "13x−8", nor "2x+1" by "12x+1".
const quotedWhole = (shown, piece) => {
  const escaped = squash(piece).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Boolean(escaped) && new RegExp(`(?<![0-9a-z]|\\d\\.)${escaped}(?![0-9a-z]|\\.\\d)`, 'i').test(shown);
};
// Mathematics, not prose: an operator, a bracket, or a number against a letter
// ("3x"). "a 3" is the word "a" and a number.
const MATHEMATICS = /[=+\-*/^()·]|\d[a-z]|[a-z]\d/i;

// The occurrence is part of something the student is shown, quoted whole.
const quotedAt = (haystack, { start, end }, shown) => {
  for (const match of haystack.matchAll(POINT)) {
    if (match.index <= start && end <= match.index + match[0].length) return quotedWhole(shown, match[0]);
  }
  const expression = expressionAround(haystack, start, end);
  if (!/[a-z]/i.test(expression) || !MATHEMATICS.test(expression)) return false;
  return quotedWhole(shown, expression);
};

/**
 * The answers this hint states. `answers` is the guard's list
 * (questionAnswerValues); `visibleText` is what the student already reads —
 * the prompt and the field labels.
 */
export const statedAnswers = (hint, { answers = [], visibleText = '' } = {}) => {
  const raw = text(hint);
  if (!raw) return [];
  const haystack = minus(raw);
  const shown = squash(visibleText);
  return list(answers).map(text).filter(Boolean).filter((value) => {
    if (!hintRevealsAnswer(raw, [value])) return false;
    if (!isNumberAnswer(value)) return true;
    // The shared guard reads text; read as numbers, its match may have been a
    // different number only ("2" in "1/2", "−2"). Then this one is not
    // written — but only when every such match is accounted for.
    const { found, candidates } = occurrences(haystack, value);
    if (!found.length) return candidates === 0;
    return !found.every((occurrence) => quotedAt(haystack, occurrence, shown));
  });
};

// The author reads each value once, with a real minus sign.
const shownValue = (value) => `“${text(value).replace(/(^|[(,\s])-(?=[\d.(a-z])/gi, '$1−')}”`;

/** The verdict, with the author's reason: null when the hint states no answer. */
export const hintAnswerLeak = (hint, options = {}) => {
  const values = [];
  const seen = new Set();
  statedAnswers(hint, options).forEach((value) => {
    if (seen.has(squash(value))) return;
    seen.add(squash(value));
    values.push(value);
  });
  if (!values.length) return null;
  const named = values.slice(0, 3).map(shownValue).join(', ') + (values.length > 3 ? ' and more' : '');
  return {
    values,
    reason: values.length === 1
      ? `it names ${named}, which is an answer to this question or part of one`
      : `it names ${named}, which are answers to this question or parts of them`,
  };
};

/*
 * "Also noted" (pass 3): a hint can describe a slope in words — "goes down 3
 * for every 1 to the right" — when the field asks for the slope −3. The
 * literal guard cannot see it, so Pre-Flight warns (the hint is still shown).
 * Only a field whose label names a slope or a rate of change is read, and
 * only "up/down/rise/fall/drop N … for every / per / each / run of M", so a
 * hint that describes a different slope is never flagged.
 */
const SLOPE_LABEL = /\bslope\b|rate of change/i;
const STEP = /\b(up|down|rises?|falls?|drops?|rise of|fall of|drop of)\s+(?:by\s+)?(\d+(?:\.\d+)?)(?:\s+units?)?\b[^.;]*?\b(?:for every|per|each|for each|over|and a run of|run of)\s+(\d+(?:\.\d+)?)/gi;
const fractionValue = (value) => {
  const match = /^(-?)(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(squash(value));
  if (!match) return null;
  const size = Number(match[2]) / (match[3] ? Number(match[3]) : 1);
  return Number.isFinite(size) ? (match[1] ? -size : size) : null;
};
export const slopeParaphrases = (hint, fields = []) => {
  const haystack = minus(text(hint));
  if (!haystack) return [];
  const steps = [...haystack.matchAll(STEP)].map((match) => {
    const falling = /down|fall|drop/i.test(match[1]);
    const run = Number(match[3]);
    if (!run) return null;
    return (falling ? -1 : 1) * (Number(match[2]) / run);
  }).filter((value) => value !== null);
  if (!steps.length) return [];
  return list(fields).filter((field) => SLOPE_LABEL.test(text(field?.label))).flatMap((field) => {
    const answers = [field.answer, ...list(field.acceptedAnswers)].map(fractionValue).filter((value) => value !== null);
    return answers.some((answer) => steps.some((step) => Math.abs(step - answer) < 1e-9))
      ? [{ field: text(field.label), answer: text(field.answer) }]
      : [];
  });
};
