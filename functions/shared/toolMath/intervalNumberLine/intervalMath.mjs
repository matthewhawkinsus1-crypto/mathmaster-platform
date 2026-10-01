// Interval arithmetic and notation for the number-line tool. Kept free of React
// so the validator, the contract, the shared grader and the tests can all use it.
import { evaluate } from 'mathjs';
import { parseCanonicalIntervalNotation } from '../../answerEquivalence.mjs';

const INF = Number.POSITIVE_INFINITY;

export const normalizeInterval = (raw = {}) => {
  const lowerRaw = raw.min ?? raw.from ?? raw.lower;
  const upperRaw = raw.max ?? raw.to ?? raw.upper;
  const lower = lowerRaw === null || lowerRaw === undefined || lowerRaw === '-inf' ? -INF : Number(lowerRaw);
  const upper = upperRaw === null || upperRaw === undefined || upperRaw === 'inf' ? INF : Number(upperRaw);
  return {
    min: Number.isNaN(lower) ? -INF : lower,
    max: Number.isNaN(upper) ? INF : upper,
    // An infinite end is never included, whatever the JSON says.
    minClosed: Number.isFinite(lower) ? raw.minClosed === true : false,
    maxClosed: Number.isFinite(upper) ? raw.maxClosed === true : false,
  };
};

export const normalizeIntervals = (raw = []) => (Array.isArray(raw) ? raw : [])
  .map(normalizeInterval)
  .filter((interval) => interval.min <= interval.max)
  .sort((a, b) => a.min - b.min || a.max - b.max);

const formatEndpoint = (value) => {
  if (value === -INF) return '−∞';
  if (value === INF) return '∞';
  return String(Number(Number(value).toFixed(4)));
};

export const intervalToNotation = (interval) => {
  const { min, max, minClosed, maxClosed } = normalizeInterval(interval);
  const open = min === -INF ? '(' : minClosed ? '[' : '(';
  const close = max === INF ? ')' : maxClosed ? ']' : ')';
  return `${open}${formatEndpoint(min)}, ${formatEndpoint(max)}${close}`;
};

export const intervalsToNotation = (intervals) => {
  const list = normalizeIntervals(intervals);
  if (!list.length) return '∅';
  return list.map(intervalToNotation).join(' ∪ ');
};

export const intervalToInequality = (interval, variable = 'x') => {
  const { min, max, minClosed, maxClosed } = normalizeInterval(interval);
  if (min === -INF && max === INF) return 'all real numbers';
  if (min === -INF) return `${variable} ${maxClosed ? '≤' : '<'} ${formatEndpoint(max)}`;
  if (max === INF) return `${variable} ${minClosed ? '≥' : '>'} ${formatEndpoint(min)}`;
  return `${formatEndpoint(min)} ${minClosed ? '≤' : '<'} ${variable} ${maxClosed ? '≤' : '<'} ${formatEndpoint(max)}`;
};

export const intervalsToInequality = (intervals, variable = 'x') => {
  const list = normalizeIntervals(intervals);
  if (!list.length) return 'no solution';
  return list.map((interval) => intervalToInequality(interval, variable)).join(' or ');
};

export const intervalContains = (interval, value) => {
  const { min, max, minClosed, maxClosed } = normalizeInterval(interval);
  const x = Number(value);
  if (!Number.isFinite(x)) return false;
  if (x < min || x > max) return false;
  if (x === min && !minClosed && min !== -INF) return false;
  if (x === max && !maxClosed && max !== INF) return false;
  return true;
};

const sameEndpoint = (a, b, tolerance = 1e-9) => {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance;
};

export const sameIntervals = (left, right) => {
  const a = normalizeIntervals(left);
  const b = normalizeIntervals(right);
  if (a.length !== b.length) return false;
  return a.every((interval, index) => {
    const other = b[index];
    return sameEndpoint(interval.min, other.min)
      && sameEndpoint(interval.max, other.max)
      && interval.minClosed === other.minClosed
      && interval.maxClosed === other.maxClosed;
  });
};

// Accept the several ways a student may legitimately type interval notation:
// different bracket spacing, "inf"/"infinity"/"∞", "U"/"∪" for union, and a
// hyphen or minus sign.
export const parseIntervalNotation = (text) => {
  const parsed = parseCanonicalIntervalNotation(text);
  return parsed ? normalizeIntervals(parsed) : null;
};

export const notationMatches = (studentText, expectedIntervals) => {
  const parsed = parseIntervalNotation(studentText);
  if (!parsed) return false;
  return sameIntervals(parsed, expectedIntervals);
};

export const INTERVAL_ASK_STAGES = Object.freeze(['graph', 'interval', 'inequality']);

// ---------------------------------------------------------------------------
// Reading an inequality back, so a wrong `intervals` array can be caught.
// ---------------------------------------------------------------------------
//
// WHY. A generated item wrote `x ≤ -4 or x > 2` in `inequalityText` and then
// encoded the intervals as [-8, -4] and [2, 8] — the number line's own viewport
// bounds used as if they were mathematical endpoints. Both rays became finite
// segments, so a student who correctly shaded to infinity would have been
// marked wrong, and one who stopped at ±8 would have been marked right.
//
// Nothing in the interval math was at fault: it already reads null, '-inf' and
// 'inf' as unbounded. The failure was that no check compared the sentence the
// author wrote against the data they wrote beside it. This parser exists to
// make that comparison possible.
//
// It is deliberately narrow. It handles the forms a one-variable inequality
// actually takes and returns null for anything else, because a parser that
// guesses would produce false validation failures on items that are fine.

const RELATION = /(<=|>=|≤|≥|<|>)/;
const NUMBER = String.raw`-?\d+(?:\.\d+)?`;

const closedFor = (operator) => operator === '<=' || operator === '≤' || operator === '>=' || operator === '≥';
const isLess = (operator) => operator === '<' || operator === '<=' || operator === '≤';

const cleanClause = (text) => String(text || '')
  .replace(/\s+/g, ' ')
  .replace(/−/g, '-')
  .trim();

/**
 * One clause: `x < 5`, `-3 ≤ x`, or a double inequality `-3 ≤ x < 5`.
 * Returns an interval in the same shape the tool uses, or null.
 */
export const parseInequalityClause = (text, variable = 'x') => {
  const clause = cleanClause(text);
  if (!clause) return null;
  const variablePattern = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Double inequality: a < x < b
  const double = clause.match(new RegExp(
    `^(${NUMBER})\\s*${RELATION.source}\\s*${variablePattern}\\s*${RELATION.source}\\s*(${NUMBER})$`,
  ));
  if (double) {
    const [, lower, lowerOp, upperOp, upper] = double;
    // Both relations must point the same way, or the clause is not an interval.
    if (isLess(lowerOp) !== isLess(upperOp)) return null;
    const ascending = isLess(lowerOp);
    return ascending
      ? { min: Number(lower), max: Number(upper), minClosed: closedFor(lowerOp), maxClosed: closedFor(upperOp) }
      : { min: Number(upper), max: Number(lower), minClosed: closedFor(upperOp), maxClosed: closedFor(lowerOp) };
  }

  // Variable on the left: x < a
  const left = clause.match(new RegExp(`^${variablePattern}\\s*${RELATION.source}\\s*(${NUMBER})$`));
  if (left) {
    const [, operator, value] = left;
    return isLess(operator)
      ? { min: null, max: Number(value), minClosed: false, maxClosed: closedFor(operator) }
      : { min: Number(value), max: null, minClosed: closedFor(operator), maxClosed: false };
  }

  // Variable on the right: a < x
  const right = clause.match(new RegExp(`^(${NUMBER})\\s*${RELATION.source}\\s*${variablePattern}$`));
  if (right) {
    const [, value, operator] = right;
    return isLess(operator)
      ? { min: Number(value), max: null, minClosed: closedFor(operator), maxClosed: false }
      : { min: null, max: Number(value), minClosed: false, maxClosed: closedFor(operator) };
  }

  return null;
};

/**
 * A whole inequality sentence, including two clauses joined by `or`.
 * Returns normalized intervals, or null when any clause is unreadable — null
 * means "cannot check", never "wrong".
 */
export const parseInequalityText = (text, variable = 'x') => {
  const source = cleanClause(text);
  if (!source) return null;
  const clauses = source.split(/\s+or\s+/i);
  const parsed = clauses.map((clause) => parseInequalityClause(clause, variable));
  if (parsed.some((entry) => entry === null)) return null;
  return normalizeIntervals(parsed);
};

/**
 * Does the authored `intervals` array say the same thing as `inequalityText`?
 * Returns { checked, matches, expected, actual } so a caller can distinguish
 * "disagrees" from "could not be read".
 */
export const inequalityMatchesIntervals = (inequalityText, intervals, variable = 'x') => {
  const expected = parseInequalityText(inequalityText, variable);
  if (!expected) return { checked: false, matches: true, expected: null, actual: null };
  const actual = normalizeIntervals(intervals);
  return {
    checked: true,
    matches: sameIntervals(expected, actual),
    expected: intervalsToNotation(expected),
    actual: intervalsToNotation(actual),
  };
};

// ---------------------------------------------------------------------------
// What the number-line TOOL asks, and how it reads what the student typed.
// ---------------------------------------------------------------------------
//
// Moved verbatim out of IntervalNumberLine.jsx so the browser's Check and the
// server's grader (functions/shared/serverGrading/tools/intervalNumberLine.mjs)
// read the student's typing through ONE definition. Note that this is NOT the
// canonical `parseIntervalNotation` above: the tool has always accepted exact
// endpoints — fractions, \frac, sqrt, \sqrt, pi, e — and its hint promises
// `[-13/8, 13/8)` works, so its notation stage keeps exactly that reader.

/**
 * The stages a number-line question asks for, as the tool renders them:
 * unknown stage names are ignored, and nothing usable means graph + interval.
 */
export const resolveIntervalAsk = (ask) => {
  const requested = Array.isArray(ask)
    ? ask.filter((stage) => INTERVAL_ASK_STAGES.includes(stage))
    : [];
  return requested.length ? requested : ['graph', 'interval'];
};

const tidyNumberLineValue = (value) => Number(Number(value).toFixed(10));

const readBraceGroup = (source, startIndex) => {
  if (source[startIndex] !== '{') return null;
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          content: source.slice(startIndex + 1, index),
          endIndex: index,
        };
      }
    }
  }
  return null;
};

const replaceLatexFractions = (raw) => {
  let source = String(raw || '');
  const command = /\\(?:dfrac|tfrac|frac)/;

  for (let guard = 0; guard < 20; guard += 1) {
    const match = command.exec(source);
    if (!match) break;

    const commandStart = match.index;
    let cursor = commandStart + match[0].length;
    while (/\s/.test(source[cursor] || '')) cursor += 1;

    const numerator = readBraceGroup(source, cursor);
    if (!numerator) break;

    cursor = numerator.endIndex + 1;
    while (/\s/.test(source[cursor] || '')) cursor += 1;

    const denominator = readBraceGroup(source, cursor);
    if (!denominator) break;

    const replacement = `((${replaceLatexFractions(numerator.content)})/(${replaceLatexFractions(denominator.content)}))`;
    source = `${source.slice(0, commandStart)}${replacement}${source.slice(denominator.endIndex + 1)}`;
  }

  return source;
};

const replaceLatexRoots = (raw) => {
  let source = String(raw || '');

  for (let guard = 0; guard < 20; guard += 1) {
    const index = source.indexOf('\\sqrt');
    if (index < 0) break;

    let cursor = index + '\\sqrt'.length;
    while (/\s/.test(source[cursor] || '')) cursor += 1;

    const group = readBraceGroup(source, cursor);
    if (!group) break;

    source = `${source.slice(0, index)}sqrt(${replaceLatexRoots(group.content)})${source.slice(group.endIndex + 1)}`;
  }

  return source;
};

/**
 * One typed endpoint: `-13/8`, `1.625`, `\frac{13}{8}`, `sqrt(5)`, `\sqrt{5}`,
 * `pi`, `2pi`. Returns a finite number, or null for anything unreadable.
 */
export const parseExactNumberLineValue = (raw) => {
  const source = replaceLatexRoots(replaceLatexFractions(
    String(raw ?? '')
      .replace(/[−–—]/g, '-')
      .replace(/\\left|\\right/g, '')
      .replace(/\\,/g, '')
      .replace(/\\cdot|\\times/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\pi/g, 'pi')
      .trim(),
  ));

  if (!source) return null;

  // Endpoint entry is intentionally numeric only. This whitelist allows
  // arithmetic, pi/e and sqrt while rejecting arbitrary function names.
  const identifiers = source.match(/[A-Za-z]+/g) || [];
  if (identifiers.some((name) => !['sqrt', 'pi', 'e'].includes(name))) return null;
  if (!/^[0-9A-Za-z+\-*/().^\s]+$/.test(source)) return null;

  try {
    const value = Number(evaluate(source));
    return Number.isFinite(value) ? tidyNumberLineValue(value) : null;
  } catch {
    return null;
  }
};

/**
 * The interval notation the tool's notation box accepts: MathLive LaTeX or
 * plain text, `∪`/`\cup`/`U` unions, `∞`/`\infty`/`inf`, and any endpoint
 * `parseExactNumberLineValue` reads. Returns normalized intervals or null.
 */
export const parseFlexibleIntervalNotation = (text) => {
  const source = String(text || '')
    .replace(/[−–—]/g, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\lbrack/g, '[')
    .replace(/\\rbrack/g, ']')
    .replace(/\\infty/g, '∞')
    .replace(/\\cup/g, '∪')
    .replace(/\\(?:,|;|!|quad|qquad)/g, '')
    .replace(/infinity|infty|inf/gi, '∞')
    .replace(/\bU\b/g, '∪')
    .trim();

  if (!source) return null;
  const pieces = source.split('∪').map((piece) => piece.trim()).filter(Boolean);
  const intervals = [];

  for (const piece of pieces) {
    const open = piece[0];
    const close = piece[piece.length - 1];
    if (!['(', '['].includes(open) || ![')', ']'].includes(close)) return null;

    const inside = piece.slice(1, -1);
    const commaIndex = inside.indexOf(',');
    if (commaIndex < 0) return null;

    const lowerText = inside.slice(0, commaIndex).trim();
    const upperText = inside.slice(commaIndex + 1).trim();

    const endpoint = (value, side) => {
      const normalized = value.replace(/\s+/g, '');
      if (normalized === '∞' || normalized === '+∞') return INF;
      if (normalized === '-∞') return -INF;
      const parsed = parseExactNumberLineValue(value);
      if (parsed == null) return null;
      if (side === 'lower' && parsed === INF) return null;
      if (side === 'upper' && parsed === -INF) return null;
      return parsed;
    };

    const min = endpoint(lowerText, 'lower');
    const max = endpoint(upperText, 'upper');
    if (min == null || max == null || min > max) return null;

    intervals.push({
      min,
      max,
      minClosed: Number.isFinite(min) && open === '[',
      maxClosed: Number.isFinite(max) && close === ']',
    });
  }

  return normalizeIntervals(intervals);
};

/** The tool's notation stage: unreadable notation is wrong, never accepted. */
export const notationMatchesFlexible = (text, expected) => {
  const parsed = parseFlexibleIntervalNotation(text);
  return parsed ? sameIntervals(parsed, expected) : false;
};

/*
 * The inequality box is a MathLive field, and MathLive hands back LaTeX: the
 * keypad's ≤ / ≥ keys (and typing <= / >=) serialize as \le / \ge, and typing
 * "or" becomes \lor through MathLive's default inline shortcut. The sentence
 * the tool expects is written with ≤, ≥ and "or". Without reading those
 * commands back as the symbols the student sees, every correct inequality
 * that used ≤, ≥ or "or" was marked wrong. Only the spelling of the same
 * symbol is unified here; the comparison stays literal (no reordering, no
 * strict/non-strict leniency). Done before whitespace is removed, so `\le x`
 * cannot run together into `\lex`, and `\left` is never read as `\le`.
 */
const LATEX_INEQUALITY_SYMBOLS = [
  [/\\(?:leqslant|leq|le)(?![A-Za-z])/g, '≤'],
  [/\\(?:geqslant|geq|ge)(?![A-Za-z])/g, '≥'],
  [/\\lt(?![A-Za-z])/g, '<'],
  [/\\gt(?![A-Za-z])/g, '>'],
  [/\\lor(?![A-Za-z])/g, ' or '],
  [/\\(?:text|mathrm|operatorname)\{\s*or\s*\}/g, ' or '],
];

const tidyInequalityText = (text) => LATEX_INEQUALITY_SYMBOLS
  .reduce((source, [pattern, symbol]) => source.replace(pattern, symbol), String(text || ''))
  .replace(/\s+/g, '')
  .replace(/[−–—]/g, '-')
  .toLowerCase();

/**
 * The tool's inequality stage: the student's sentence, with MathLive's LaTeX
 * relation commands read as the symbols they display, whitespace removed,
 * dashes unified and case folded, must equal the sentence the tool writes for
 * the expected intervals (`intervalsToInequality`).
 */
export const inequalityTextMatches = (studentText, expectedIntervals, variable = 'x') => (
  tidyInequalityText(studentText) === tidyInequalityText(intervalsToInequality(expectedIntervals, variable))
);
