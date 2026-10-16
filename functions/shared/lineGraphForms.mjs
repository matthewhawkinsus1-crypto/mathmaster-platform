/*
 * GRAPH THE LINE: HOW AN EQUATION IS WRITTEN.
 *
 * Recognising the form IS the skill: y = 4 − 2x is slope-intercept form with
 * its terms swapped, y + 3 = −2(x − 4) hides its point behind two sign flips,
 * and 4x + 6y = 12 is standard form whether or not anyone reduced it. So an
 * equation is written exactly as the generator chose — the author's own
 * coefficients, the author's own order — never re-derived from the line it
 * describes.
 *
 * One equation is built once, as TOKENS, and read four ways:
 *
 *   tokens   the game screen's own renderer (stacked fractions, real minus
 *            signs) — the game chunk does not load the MathLive editor
 *   text     plain text, U+2212 minus, fractions in parentheses where a
 *            variable follows: y = (2/3)x − 1
 *   latex    for teacher surfaces that render math: y = \frac{2}{3}x - 1
 *   speech   what a screen reader says: "y equals 2 thirds x minus 1"
 *
 * The same module reads a student's "Build it" answer: the boxes of a form
 * template (y = □x + □, y − □ = □(x − □), □x + □y = □), each a whole
 * number, a fraction or a terminating decimal, turned into an exact line.
 *
 * Pure: Cloud Functions, the student device and tests.
 */

import * as Q from './graphFeatureRational.mjs';
import { lineFromCoefficients, lineFromPointSlope, lineFromSlopeIntercept } from './lineGraphMath.mjs';

export const LINE_FORM = Object.freeze({
  SLOPE_INTERCEPT: 'slopeIntercept',
  STANDARD: 'standard',
  POINT_SLOPE: 'pointSlope',
});

export const LINE_FORM_IDS = Object.freeze(Object.values(LINE_FORM));

// Horizontal and vertical lines (y = k, x = h) are written on their own; a
// vertical line has no slope-intercept or point-slope form at all.
export const SPECIAL_FORM = 'special';

export const LINE_FORM_LABELS = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: 'Slope-intercept form',
  [LINE_FORM.STANDARD]: 'Standard form',
  [LINE_FORM.POINT_SLOPE]: 'Point-slope form',
  [SPECIAL_FORM]: 'Horizontal and vertical lines',
});

export const LINE_FORM_PATTERNS = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: 'y = mx + b',
  [LINE_FORM.STANDARD]: 'Ax + By = C',
  [LINE_FORM.POINT_SLOPE]: 'y − y₁ = m(x − x₁)',
  [SPECIAL_FORM]: 'x = h, y = k',
});

export const TOKEN_KIND = Object.freeze({
  VAR: 'var',
  NUM: 'num',
  FRAC: 'frac',
  OP: 'op',
  NEG: 'neg',
  OPEN: 'open',
  CLOSE: 'close',
});

export const MINUS = '−';

const token = (kind, extra = {}) => Object.freeze({ kind, ...extra });
const variable = (name) => token(TOKEN_KIND.VAR, { value: name });
const op = (value) => token(TOKEN_KIND.OP, { value });
const NEG = token(TOKEN_KIND.NEG);
const OPEN = token(TOKEN_KIND.OPEN);
const CLOSE = token(TOKEN_KIND.CLOSE);

export const NUMBER_STYLE = Object.freeze({ FRACTION: 'fraction', DECIMAL: 'decimal' });

/** The decimal digits of a rational whose denominator divides 10, 100 or 1000; else null. */
export const terminatingDecimal = (value) => {
  const r = Q.toRational(value);
  for (const [power, digits] of [[10, 1], [100, 2], [1000, 3]]) {
    if (power % r.d !== 0) continue;
    const scaled = Math.abs(r.n) * (power / r.d);
    const whole = Math.floor(scaled / power);
    const fraction = String(scaled % power).padStart(digits, '0').replace(/0+$/, '');
    return `${r.n < 0 ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
  }
  return null;
};

// A non-negative magnitude as one token.
const magnitudeToken = (value, style = NUMBER_STYLE.FRACTION) => {
  const r = Q.abs(Q.toRational(value));
  if (r.d === 1) return token(TOKEN_KIND.NUM, { value: String(r.n) });
  if (style === NUMBER_STYLE.DECIMAL) {
    const decimal = terminatingDecimal(r);
    if (decimal) return token(TOKEN_KIND.NUM, { value: decimal });
  }
  return token(TOKEN_KIND.FRAC, { num: r.n, den: r.d });
};

/*
 * One signed term — a coefficient times a variable, or a constant when
 * `name` is empty. A leading term carries its own minus; a later term is
 * joined by + or −. A variable's coefficient of 1 is not written.
 */
const signedTerm = (value, name, { leading, style }) => {
  const r = Q.toRational(value);
  const out = [];
  if (leading) {
    if (r.n < 0) out.push(NEG);
  } else {
    out.push(op(r.n < 0 ? MINUS : '+'));
  }
  const unit = Boolean(name) && Math.abs(r.n) === 1 && r.d === 1;
  if (!unit) out.push(magnitudeToken(r, style));
  if (name) out.push(variable(name));
  return out;
};

// A constant standing alone on one side: 4, −3, 0, −1/2.
const constantAlone = (value, style) => {
  const r = Q.toRational(value);
  return r.n === 0 ? [token(TOKEN_KIND.NUM, { value: '0' })] : signedTerm(r, '', { leading: true, style });
};

// "− 2" / "+ 3" after a variable: the offset of a point-slope coordinate.
// y₁ = 2 is written y − 2; y₁ = −3 is written y + 3.
const coordinateOffset = (value, style) => {
  const r = Q.toRational(value);
  return [op(r.n < 0 ? '+' : MINUS), magnitudeToken(r, style)];
};

// m(x − x₁): the slope in front of the parenthesised (x − x₁). A slope of 1
// is not written, −1 is a bare minus; x₁ = 0 is m·x with no parentheses.
const slopeGroup = (m, x1, style) => {
  const slope = Q.toRational(m);
  const anchor = Q.toRational(x1);
  if (anchor.n === 0) return signedTerm(slope, 'x', { leading: true, style });
  const out = [];
  if (slope.n < 0) out.push(NEG);
  if (!(Math.abs(slope.n) === 1 && slope.d === 1)) out.push(magnitudeToken(slope, style));
  out.push(OPEN, variable('x'), ...coordinateOffset(anchor, style), CLOSE);
  return out;
};

/* ------------------------------ the forms -------------------------------- */

export const SLOPE_INTERCEPT_ORDER = Object.freeze({ SLOPE_FIRST: 'slopeFirst', CONSTANT_FIRST: 'constantFirst' });

/** y = mx + b (or y = b + mx). A zero slope is y = b; a zero intercept is y = mx. */
export const slopeInterceptTokens = ({ m, b, order = SLOPE_INTERCEPT_ORDER.SLOPE_FIRST, style = NUMBER_STYLE.FRACTION } = {}) => {
  const slope = Q.toRational(m);
  const intercept = Q.toRational(b);
  const out = [variable('y'), op('=')];
  if (slope.n === 0) return [...out, ...constantAlone(intercept, style)];
  if (order === SLOPE_INTERCEPT_ORDER.CONSTANT_FIRST && intercept.n !== 0) {
    return [...out, ...signedTerm(intercept, '', { leading: true, style }), ...signedTerm(slope, 'x', { leading: false, style })];
  }
  out.push(...signedTerm(slope, 'x', { leading: true, style }));
  if (intercept.n !== 0) out.push(...signedTerm(intercept, '', { leading: false, style }));
  return out;
};

/** Ax + By = C with the author's own coefficients — 4x + 6y = 12 stays 4x + 6y = 12. */
export const standardTokens = ({ A, B, C, style = NUMBER_STYLE.FRACTION } = {}) => {
  const a = Q.toRational(A);
  const b = Q.toRational(B);
  if (a.n === 0 && b.n === 0) throw new RangeError('Standard form needs an x or a y term.');
  const out = [];
  if (a.n !== 0) out.push(...signedTerm(a, 'x', { leading: true, style }));
  if (b.n !== 0) out.push(...signedTerm(b, 'y', { leading: a.n === 0, style }));
  return [...out, op('='), ...constantAlone(C, style)];
};

export const POINT_SLOPE_LAYOUT = Object.freeze({ POINT_SLOPE: 'pointSlope', SOLVED_FOR_Y: 'solvedForY' });

/**
 * y − y₁ = m(x − x₁), or solved for y: y = m(x − x₁) + y₁. A zero y₁ is
 * written y = m(x − x₁): the point is then on the x-axis.
 */
export const pointSlopeTokens = ({ x1, y1, m, layout = POINT_SLOPE_LAYOUT.POINT_SLOPE, style = NUMBER_STYLE.FRACTION } = {}) => {
  const yOffset = Q.toRational(y1);
  if (layout === POINT_SLOPE_LAYOUT.SOLVED_FOR_Y) {
    const out = [variable('y'), op('='), ...slopeGroup(m, x1, style)];
    if (yOffset.n !== 0) out.push(...signedTerm(yOffset, '', { leading: false, style }));
    return out;
  }
  const left = [variable('y')];
  if (yOffset.n !== 0) left.push(...coordinateOffset(yOffset, style));
  return [...left, op('='), ...slopeGroup(m, x1, style)];
};

/** x = h or y = k. */
export const specialTokens = ({ axis, value, style = NUMBER_STYLE.FRACTION } = {}) => {
  if (axis !== 'x' && axis !== 'y') throw new RangeError('A horizontal or vertical line is written x = h or y = k.');
  return [variable(axis), op('='), ...constantAlone(value, style)];
};

/* ------------------------------- reading --------------------------------- */

const FRACTION_WORDS = Object.freeze({
  2: ['half', 'halves'],
  3: ['third', 'thirds'],
  4: ['fourth', 'fourths'],
  5: ['fifth', 'fifths'],
  6: ['sixth', 'sixths'],
  7: ['seventh', 'sevenths'],
  8: ['eighth', 'eighths'],
  9: ['ninth', 'ninths'],
  10: ['tenth', 'tenths'],
});

const fractionSpeech = ({ num, den }) => {
  const words = FRACTION_WORDS[den];
  return words ? `${num} ${num === 1 ? words[0] : words[1]}` : `${num} over ${den}`;
};

// A fraction directly followed by a variable or a parenthesis is bracketed in
// plain text, so (2/3)x can never be read as 2/(3x).
const fractionText = (current, next) => {
  const bare = `${current.num}/${current.den}`;
  return next && (next.kind === TOKEN_KIND.VAR || next.kind === TOKEN_KIND.OPEN) ? `(${bare})` : bare;
};

const textOf = (tokens) => tokens.map((current, index) => {
  const next = tokens[index + 1];
  switch (current.kind) {
    case TOKEN_KIND.VAR:
    case TOKEN_KIND.NUM:
      return current.value;
    case TOKEN_KIND.FRAC:
      return fractionText(current, next);
    case TOKEN_KIND.OP:
      return ` ${current.value} `;
    case TOKEN_KIND.NEG:
      return MINUS;
    case TOKEN_KIND.OPEN:
      return '(';
    case TOKEN_KIND.CLOSE:
      return ')';
    default:
      return '';
  }
}).join('');

const latexOf = (tokens) => tokens.map((current) => {
  switch (current.kind) {
    case TOKEN_KIND.VAR:
    case TOKEN_KIND.NUM:
      return current.value;
    case TOKEN_KIND.FRAC:
      return `\\frac{${current.num}}{${current.den}}`;
    case TOKEN_KIND.OP:
      return current.value === MINUS ? ' - ' : ` ${current.value} `;
    case TOKEN_KIND.NEG:
      return '-';
    case TOKEN_KIND.OPEN:
      return '(';
    case TOKEN_KIND.CLOSE:
      return ')';
    default:
      return '';
  }
}).join('');

const speechOf = (tokens) => {
  const words = [];
  tokens.forEach((current, index) => {
    const previous = tokens[index - 1];
    switch (current.kind) {
      case TOKEN_KIND.VAR:
        words.push(current.value);
        break;
      case TOKEN_KIND.NUM:
        words.push(current.value.replace(/^-/, 'negative '));
        break;
      case TOKEN_KIND.FRAC:
        words.push(fractionSpeech(current));
        break;
      case TOKEN_KIND.OP:
        words.push(current.value === '=' ? 'equals' : current.value === '+' ? 'plus' : 'minus');
        break;
      case TOKEN_KIND.NEG:
        words.push('negative');
        break;
      case TOKEN_KIND.OPEN:
        // −(x − 1) is "negative 1 times the quantity x minus 1".
        if (previous?.kind === TOKEN_KIND.NEG) words.push('1');
        words.push(previous && [TOKEN_KIND.NUM, TOKEN_KIND.FRAC, TOKEN_KIND.NEG].includes(previous.kind) ? 'times the quantity' : 'the quantity');
        break;
      case TOKEN_KIND.CLOSE:
        if (index < tokens.length - 1) words.push(',');
        break;
      default:
        break;
    }
  });
  return words.join(' ').replace(/ ,/g, ',');
};

/** An equation, ready for every surface: { tokens, text, latex, speech }. */
export const presentEquation = (tokens) => {
  const frozen = Object.freeze(tokens.map((entry) => Object.freeze({ ...entry })));
  return Object.freeze({
    tokens: frozen,
    text: textOf(frozen),
    latex: latexOf(frozen),
    speech: speechOf(frozen),
  });
};

/* ------------------------- reading a typed answer ------------------------ */

/**
 * A number a student typed into one box: a whole number, a fraction or a
 * terminating decimal, optionally signed (either minus sign). Exact, or null
 * when it is not one of those. Bounded so that nothing typed can leave the
 * exact integer range.
 */
export const parseLineNumber = (raw) => {
  // Spaces may sit beside a sign, a slash or a bracket ("- 3", "2 / 3"), never
  // between digits: "1 1/2" is a mixed number, not 11/2, and is refused.
  const text = String(raw ?? '').trim()
    .replace(/[−–—]/g, '-')
    .replace(/\s*([/+\-()])\s*/g, '$1');
  if (!text || /\s/.test(text)) return null;
  const unwrapped = /^\((.*)\)$/.exec(text)?.[1] ?? text;
  let match = /^([+-]?)(\d{1,6})$/.exec(unwrapped);
  if (match) return Q.rat((match[1] === '-' ? -1 : 1) * Number(match[2]));
  match = /^([+-]?)(\d{1,6})\/([+-]?)(\d{1,6})$/.exec(unwrapped);
  if (match) {
    const denominator = Number(match[4]);
    if (denominator === 0) return null;
    const sign = (match[1] === '-' ? -1 : 1) * (match[3] === '-' ? -1 : 1);
    return Q.rat(sign * Number(match[2]), denominator);
  }
  match = /^([+-]?)(\d{0,6})\.(\d{1,4})$/.exec(unwrapped);
  if (match) {
    const scale = 10 ** match[3].length;
    const value = Number(match[2] || '0') * scale + Number(match[3]);
    return Q.rat((match[1] === '-' ? -1 : 1) * value, scale);
  }
  return null;
};

/*
 * THE BOXES OF EACH FORM. A student fills signed values; the line is built
 * from them exactly, and the preview under the boxes writes what they typed
 * the conventional way (y − (−3) is shown as y + 3), so the sign convention
 * is taught by the screen rather than demanded by it.
 */
export const BUILD_FIELDS = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: Object.freeze([
    Object.freeze({ id: 'm', label: 'm', name: 'slope' }),
    Object.freeze({ id: 'b', label: 'b', name: 'y-intercept' }),
  ]),
  [LINE_FORM.POINT_SLOPE]: Object.freeze([
    Object.freeze({ id: 'y1', label: 'y₁', name: 'y-coordinate of the point' }),
    Object.freeze({ id: 'm', label: 'm', name: 'slope' }),
    Object.freeze({ id: 'x1', label: 'x₁', name: 'x-coordinate of the point' }),
  ]),
  [LINE_FORM.STANDARD]: Object.freeze([
    Object.freeze({ id: 'A', label: 'A', name: 'coefficient of x' }),
    Object.freeze({ id: 'B', label: 'B', name: 'coefficient of y' }),
    Object.freeze({ id: 'C', label: 'C', name: 'constant' }),
  ]),
});

export const BUILD_PROBLEM = Object.freeze({
  // A box is empty or holds something that is not a number.
  UNREADABLE: 'unreadable',
  // Standard form is written with whole-number coefficients.
  WHOLE_NUMBERS: 'wholeNumbers',
  // Standard form with A = B = 0 is not a line.
  NOT_A_LINE: 'notALine',
});

/**
 * The line a filled template describes: { line, values } or { problem, field }.
 * A problem is about the WRITING, not the mathematics — the game neither
 * credits nor penalises it, and says what to fix.
 */
export const lineFromBuildFields = (form, raw = {}) => {
  const fields = BUILD_FIELDS[form];
  if (!fields) return Object.freeze({ problem: BUILD_PROBLEM.UNREADABLE, field: null });
  const values = {};
  for (const field of fields) {
    const value = parseLineNumber(raw?.[field.id]);
    if (!value) return Object.freeze({ problem: BUILD_PROBLEM.UNREADABLE, field: field.id });
    values[field.id] = value;
  }
  if (form === LINE_FORM.SLOPE_INTERCEPT) {
    return Object.freeze({ line: lineFromSlopeIntercept(values.m, values.b), values: Object.freeze(values) });
  }
  if (form === LINE_FORM.POINT_SLOPE) {
    return Object.freeze({ line: lineFromPointSlope({ x: values.x1, y: values.y1 }, values.m), values: Object.freeze(values) });
  }
  const notWhole = fields.find((field) => values[field.id].d !== 1);
  if (notWhole) return Object.freeze({ problem: BUILD_PROBLEM.WHOLE_NUMBERS, field: notWhole.id });
  if (values.A.n === 0 && values.B.n === 0) return Object.freeze({ problem: BUILD_PROBLEM.NOT_A_LINE, field: 'A' });
  return Object.freeze({ line: lineFromCoefficients(values.A, values.B, values.C), values: Object.freeze(values) });
};

/** The equation a filled template spells, written conventionally; null until every box reads. */
export const buildPreview = (form, raw = {}) => {
  const fields = BUILD_FIELDS[form];
  if (!fields) return null;
  const values = Object.fromEntries(fields.map((field) => [field.id, parseLineNumber(raw?.[field.id])]));
  if (fields.some((field) => !values[field.id])) return null;
  if (form === LINE_FORM.SLOPE_INTERCEPT) return presentEquation(slopeInterceptTokens({ m: values.m, b: values.b }));
  if (form === LINE_FORM.POINT_SLOPE) return presentEquation(pointSlopeTokens({ x1: values.x1, y1: values.y1, m: values.m }));
  if (values.A.n === 0 && values.B.n === 0) return null;
  return presentEquation(standardTokens({ A: values.A, B: values.B, C: values.C }));
};
