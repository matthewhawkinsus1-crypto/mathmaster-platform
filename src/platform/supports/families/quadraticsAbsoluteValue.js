// Question family: absolute value, quadratics and polynomials: polynomialWorkshop, parabolaGeometryLab, and multiAnswer items from absoluteValue.solveEquation / quadratics.identifyVertex / functions.identifyZeros (teacher-import-jsons L1_Absolute_Value).
//
// Contract (./index.js):
//   matches(question)            → true when this family can help with the question
//   hints(question)              → hint sentences, least to most specific, built from
//                                  the question's OWN numbers; never the answer
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers whose answer is
//                                  not this question's answer
//   expectedValues(question)     → this question's answer value(s) as text, so the runtime
//                                  guard (hintRevealsAnswer) can drop a hint that leaks one
//   backUpQuestion(question)     → { prompt, options: [text, text], correct } | null
//                                  the inclusion "Let's back up" check: one quick
//                                  question about THIS problem's first move (never its
//                                  answer); null keeps the platform's generic one
// `implemented` stays false until the family is real: the index skips it.
//
// WHAT THIS FAMILY OWNS (ninth in the index order; none of the eight before it
// claims these items — equations with |x| or x² are left alone by
// linearEquations, vertex/zero fields by functionFeatures, transformation
// descriptions belong to transformations):
//
//   absEquation   a|mx + b| + k = c, one absolute value, a constant other side:
//                 - absoluteValue.solveEquation instances (multiAnswer, the
//                   two solutions in two fields);
//                 - an authored multiAnswer "Solve 2|x − 3| + 4 = 10" whose
//                   numeric keys are exactly the solutions;
//                 - a Step Algebra (`stepAlgebra`) item the relation workspace
//                   opens on such an equation (V5 `solveEquation`), where two
//                   solutions, one solution (|…| = 0) and no solution
//                   (|…| = negative) are all possible.
//   vertex        quadratics.identifyVertex instances (vertex or standard form)
//                 and an authored "vertex of y = …" multiAnswer whose one key is
//                 that vertex.
//   zeros         functions.identifyZeros instances and an authored "zeros of
//                 f(x) = …" multiAnswer whose keys are exactly the zeros.
//   polynomialWorkshop, every view, read exactly as PolynomialWorkshop.jsx and
//                 its shared grader read it (the same `mode` routing, the same
//                 POLYNOMIAL_WORKSHOP_DEFAULTS): factorZero, multiplyArea,
//                 factorQuadratic, division, graphConnection, rationalFeatures.
//   parabolaGeometryLab, every view (features, equidistance, fromGeometry,
//                 equation), with the grader's own defaults.
//
// Every answer is recomputed here in exact rational arithmetic from the SAME
// authored fields the grader reads, and an item is claimed only when that
// computation is sure: a family instance or authored multiAnswer only when its
// keys equal the solutions of the equation its prompt shows; a workshop item
// only when the workshop can render it and its key is unambiguous (no integer
// factor pair → not claimed; a repeated root listed twice in graphConnection →
// not claimed; a fromGeometry focus on its own directrix → not claimed).
//
// HOW IT STAYS SAFE.
//   - expectedValues lists what the student must FIND, in every spelling a hint
//     could use: integers, a/b, \frac{a}{b}, terminating decimals, Unicode
//     minus, ordered pairs with and without the space, "x = 3", the solution
//     set, "no solution" forms, coefficient lists as typed ("1, -2, -11"), the
//     polynomial they spell, every single coefficient and area cell, and the
//     verdict words and labels of the <select>s (yes/no, crosses/touches, the
//     end-behaviour labels, hole/zero/…, up/down/left/right).
//   - Every hint and back-up text is written twice: a spelling that quotes the
//     problem's own givens and a plain one that names the move without them.
//     The quoting one is used unless it contains one of the answers
//     (hintRevealsAnswer against expectedValues plus the plain keys); a text
//     that fails both is dropped. No hint states a solution, a vertex, a zero,
//     an isolated |…| value, a focus, a distance, a coefficient of the answer
//     or a verdict word: the ladder is the same sentences whichever case is
//     right ("an absolute value is never negative" is said on every absolute
//     value equation, not only on the one with no solution).
//   - The worked sibling is the same task on new numbers, drawn from a fixed
//     candidate list in an order set by the seed and the prompt (never the
//     key), and offered only when its prompt, every step and its answer avoid
//     this question's answers (the platform's own checks, run here first) and
//     it writes no standalone 0 (a factor/zero verdict is never a reason a
//     sibling is or is not offered). A sibling whose answer is itself a verdict
//     (graphConnection, a factor test, the opening of a parabola) phrases it in
//     words that are never one of the <select> labels, and is chosen without
//     reading the key, so it says nothing about this question's verdict. The
//     rationalFeatures view gets no sibling (null): its features cannot be
//     worked without naming them, and naming them would make whether a sibling
//     is offered depend on this question's verdict.
//   - backUpQuestion asks about the FIRST MOVE (isolate before splitting, which
//     value to substitute, which cell first, multiplicity before ends, where the
//     vertex sits), never a value the student must find.
//
// Pure: no React, no I/O, no grading imports.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import { withPromptRelationSource } from '../../../../functions/shared/runtime/stepAlgebraRelationRouting.mjs';
import { POLYNOMIAL_WORKSHOP_DEFAULTS } from '../../../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import {
  ONE,
  ZERO,
  absolute,
  add,
  divide,
  equals,
  isInteger,
  isZero,
  multiply,
  negate,
  rational,
  rationalLatex,
  rationalText,
  subtract,
  toNumber,
} from '../../../../functions/shared/questionFamilyExact.mjs';

export const family = 'quadraticsAbsoluteValue';
export const implemented = true;

export const ABSOLUTE_VALUE_FAMILY_ID = 'absoluteValue.solveEquation';
export const VERTEX_FAMILY_ID = 'quadratics.identifyVertex';
export const ZEROS_FAMILY_ID = 'functions.identifyZeros';

const POLYNOMIAL_VIEWS = Object.freeze(['multiplyArea', 'factorQuadratic', 'division', 'graphConnection', 'rationalFeatures']);
const PARABOLA_VIEWS = Object.freeze(['equidistance', 'fromGeometry', 'equation']);

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ascii = (value) => String(value ?? '').replace(/[−–—]/g, '-');
const typeOf = (question) => text(question?.type) || text(question?.toolId);
const familyIdOf = (question) => text(question?.familyInstance?.familyId) || text(question?.questionFamily?.id) || text(question?.familyId);
const R = (n, d = 1) => rational(n, d);
const MINUS_ONE = R(-1);
const TWO = R(2);
const FOUR = R(4);
const neg = (value) => value.n < 0;
const pos = (value) => value.n > 0;

const hash = (value) => {
  let h = 2166136261;
  for (const character of String(value)) {
    h ^= character.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const product = (...lists) => lists.reduce((acc, values) => acc.flatMap((prefix) => values.map((value) => [...prefix, value])), [[]]);

/* ---------------------------------------------------------------------------
 * Exact numbers. Authored numbers arrive as numbers (1.5, 0.35), numeric
 * strings, "n/d" or {n, d}; every comparison here is exact.
 * ------------------------------------------------------------------------- */

const exact = (value) => {
  try {
    if (isObject(value) && 'n' in value && 'd' in value) {
      const n = Number(value.n);
      const d = Number(value.d);
      if (!d || !Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return null;
      return R(n, d);
    }
    if (typeof value === 'string') {
      const cleaned = ascii(value).replace(/\s+/g, '').replace(/^\$|\$$/g, '');
      if (!cleaned) return null;
      const slash = /^(-?\d+)\/(-?\d+)$/.exec(cleaned);
      if (slash) return Number(slash[2]) ? R(Number(slash[1]), Number(slash[2])) : null;
      const latex = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(cleaned);
      if (latex) return Number(latex[3]) ? R((latex[1] ? -1 : 1) * Number(latex[2]), Number(latex[3])) : null;
      if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
      return exact(Number(cleaned));
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (Math.abs(value) > 1e9) return null;
    for (let d = 1; d <= 1000; d += 1) {
      const n = Math.round(value * d);
      if (Math.abs((n / d) - value) <= 1e-9 * Math.max(1, Math.abs(value))) return R(n, d);
    }
  } catch { /* not an exact number */ }
  return null;
};
/** A number field the way the tools read it: Number(value), then exactly. */
const fieldNumber = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? exact(number) : null;
};

const decimalText = (value) => {
  let d = value.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d !== 1 || value.d === 1) return '';
  return String(Number((value.n / value.d).toFixed(10)));
};
/** A number as the family writes it: an integer, a terminating decimal, else n/d. ASCII minus. */
const num = (value) => (value.d === 1 ? String(value.n) : decimalText(value) || rationalText(value));
const paren = (value) => (neg(value) ? `(${num(value)})` : num(value));
const withUnicodeMinus = (value) => (value.includes('-') ? [value, value.replace(/-/g, '−')] : [value]);

/** Every spelling of one number a hint could contain. */
const numberForms = (value) => {
  if (!value) return [];
  const forms = [rationalText(value), rationalLatex(value)];
  const decimal = decimalText(value);
  if (decimal) {
    forms.push(decimal);
    if (/^-?0\./.test(decimal)) forms.push(decimal.replace('0.', '.'));
  }
  return unique(forms.flatMap(withUnicodeMinus));
};
/** A value known only to the grader's tolerance (an irrational distance): its roundings. */
const approxForms = (value) => {
  if (!Number.isFinite(value)) return [];
  const out = [2, 3, 1].flatMap((digits) => [value.toFixed(digits), String(Number(value.toFixed(digits)))]);
  return unique(out.flatMap(withUnicodeMinus));
};
const coordinateForms = (value) => unique([rationalText(value), decimalText(value)]);
const pairForms = (point) => {
  const out = [];
  coordinateForms(point[0]).forEach((a) => coordinateForms(point[1]).forEach((b) => out.push(`(${a}, ${b})`, `(${a},${b})`)));
  return unique(out.flatMap(withUnicodeMinus));
};
const equationForms = (equation) => unique([equation, equation.replace(/\s+/g, '')].flatMap(withUnicodeMinus));
const variableForms = (variable, value) => coordinateForms(value).flatMap((entry) => equationForms(`${variable} = ${entry}`));
const pt = ([x, y]) => `(${num(x)}, ${num(y)})`;

/* ---------------------------------------------------------------------------
 * Writing polynomials (coefficients highest degree first).
 * ------------------------------------------------------------------------- */

const SUPERSCRIPTS = Object.freeze({ 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' });
const power = (variable, degree) => (degree === 0 ? '' : degree === 1 ? variable : `${variable}${SUPERSCRIPTS[degree] || `^${degree}`}`);
const magnitudeText = (magnitude) => (magnitude.d === 1 || decimalText(magnitude) ? num(magnitude) : `(${rationalText(magnitude)})`);
const termBody = (coefficient, variable, degree) => {
  const magnitude = absolute(coefficient);
  if (degree === 0) return num(magnitude);
  if (equals(magnitude, ONE)) return power(variable, degree);
  return `${magnitudeText(magnitude)}${power(variable, degree)}`;
};
const polyText = (coefficients, variable = 'x') => {
  const parts = [];
  coefficients.forEach((coefficient, index) => {
    const degree = coefficients.length - 1 - index;
    if (isZero(coefficient)) return;
    const body = termBody(coefficient, variable, degree);
    if (!parts.length) parts.push(neg(coefficient) ? `-${body}` : body);
    else parts.push(`${neg(coefficient) ? '-' : '+'} ${body}`);
  });
  return parts.length ? parts.join(' ') : '0';
};
/** One signed monomial: "6x²", "-3x", "-4". */
const monomial = (coefficient, degree, variable = 'x') => `${neg(coefficient) ? '-' : ''}${termBody(coefficient, variable, degree)}`;
/** (x - 3), (x + 2), x */
const factorText = (root, variable = 'x') => (isZero(root) ? variable : `(${variable} ${neg(root) ? '+' : '-'} ${num(absolute(root))})`);
const trimLeading = (coefficients) => {
  const copy = [...coefficients];
  while (copy.length > 1 && isZero(copy[0])) copy.shift();
  return copy.length ? copy : [ZERO];
};
const evaluate = (coefficients, x) => coefficients.reduce((acc, coefficient) => add(multiply(acc, x), coefficient), ZERO);
const multiplyPolys = (left, right) => {
  const out = Array(left.length + right.length - 1).fill(ZERO);
  left.forEach((a, i) => right.forEach((b, j) => { out[i + j] = add(out[i + j], multiply(a, b)); }));
  return out;
};
const listText = (coefficients) => coefficients.map(num).join(', ');
const listForms = (coefficients) => {
  const spaced = coefficients.map(rationalText).join(', ');
  const decimals = coefficients.map((value) => decimalText(value) || rationalText(value)).join(', ');
  return unique([spaced, decimals].flatMap((value) => [value, value.replace(/\s+/g, '')]).flatMap(withUnicodeMinus));
};
const polyForms = (coefficients) => equationForms(polyText(coefficients));

/* ---------------------------------------------------------------------------
 * Reading math text: a small exact polynomial parser.
 * ------------------------------------------------------------------------- */

const normalizeMath = (value) => ascii(value)
  .replace(/\$/g, '')
  .replace(/\\left|\\right/g, '')
  .replace(/\\[lr]?vert|\\mid/g, '|')
  .replace(/\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))')
  .replace(/\\cdot|\\times|[·×]/g, '*')
  .replace(/\^\{(\d+)\}/g, '^$1')
  .replace(/²/g, '^2')
  .replace(/³/g, '^3')
  .replace(/\\[,;!]|\\quad/g, '')
  .replace(/\s+/g, '');

/** Polynomial in one variable → exact coefficients, lowest degree first; null when it is not one. */
const parsePolynomial = (source, variable = 'x') => {
  const s = String(source || '');
  if (!s || /[\\{}|]/.test(s)) return null;
  let i = 0;
  const trim = (p) => {
    const copy = [...p];
    while (copy.length > 1 && isZero(copy[copy.length - 1])) copy.pop();
    return copy;
  };
  const addP = (a, b) => trim(Array.from({ length: Math.max(a.length, b.length) }, (_, k) => add(a[k] || ZERO, b[k] || ZERO)));
  const negP = (a) => a.map(negate);
  const mulP = (a, b) => {
    const out = Array(a.length + b.length - 1).fill(ZERO);
    a.forEach((x, j) => b.forEach((y, k) => { out[j + k] = add(out[j + k], multiply(x, y)); }));
    return trim(out);
  };
  const fail = () => { throw new Error('unreadable'); };
  const parseNumber = () => {
    const match = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (!match) fail();
    i += match[0].length;
    const value = exact(match[0]);
    if (!value) fail();
    return [value];
  };
  let parseExpr;
  const parseBase = () => {
    const c = s[i];
    if (c === '(') {
      i += 1;
      const inner = parseExpr();
      if (s[i] !== ')') fail();
      i += 1;
      return inner;
    }
    if (c === variable) {
      i += 1;
      return [ZERO, ONE];
    }
    if (/[\d.]/.test(c || '')) return parseNumber();
    return fail();
  };
  const parsePower = () => {
    const base = parseBase();
    if (s[i] !== '^') return base;
    i += 1;
    let exponentText = '';
    if (s[i] === '(') {
      const close = s.indexOf(')', i);
      if (close < 0) fail();
      exponentText = s.slice(i + 1, close);
      i = close + 1;
    } else {
      const match = /^\d+/.exec(s.slice(i));
      if (!match) fail();
      exponentText = match[0];
      i += match[0].length;
    }
    if (!/^\d+$/.test(exponentText)) fail();
    const exponent = Number(exponentText);
    if (exponent > 6) fail();
    let out = [ONE];
    for (let k = 0; k < exponent; k += 1) out = mulP(out, base);
    return out;
  };
  const parseTerm = () => {
    let sign = 1;
    while (s[i] === '+' || s[i] === '-') {
      if (s[i] === '-') sign = -sign;
      i += 1;
    }
    let value = parsePower();
    for (;;) {
      const c = s[i];
      if (c === '*') {
        i += 1;
        value = mulP(value, parsePower());
      } else if (c === '/') {
        i += 1;
        const divisor = parsePower();
        if (divisor.length !== 1 || isZero(divisor[0])) fail();
        value = value.map((entry) => divide(entry, divisor[0]));
      } else if (c === '(' || c === variable || /[\d.]/.test(c || '')) {
        value = mulP(value, parsePower());
      } else break;
    }
    return sign < 0 ? negP(value) : value;
  };
  parseExpr = () => {
    let value = parseTerm();
    while (s[i] === '+' || s[i] === '-') value = addP(value, parseTerm());
    return value;
  };
  try {
    const out = parseExpr();
    return i === s.length ? trim(out) : null;
  } catch {
    return null;
  }
};
const constantOf = (source) => {
  const p = parsePolynomial(source, '#');
  return p && p.length === 1 ? p[0] : null;
};

/* ---------------------------------------------------------------------------
 * absEquation: a|mx + b| + k = c.
 * ------------------------------------------------------------------------- */

const COEFFICIENT_PREFIX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+|\(\(?\d+(?:\.\d+)?\)?\/\(?\d+(?:\.\d+)?\)?\))?\*?$/;

/** "2|x - 7| - 9" → { A, inside: [b, m], K, variable } or null. */
const readAbsSide = (side) => {
  if ((side.match(/\|/g) || []).length !== 2) return null;
  const first = side.indexOf('|');
  const last = side.lastIndexOf('|');
  const prefix = side.slice(0, first);
  const insideText = side.slice(first + 1, last);
  const suffix = side.slice(last + 1);
  if (!COEFFICIENT_PREFIX.test(prefix)) return null;
  const bare = prefix.replace(/\*$/, '');
  const A = bare === '' || bare === '+' ? ONE : bare === '-' ? MINUS_ONE : constantOf(bare);
  if (!A || isZero(A)) return null;
  let K = ZERO;
  if (suffix) {
    if (!/^[+-]/.test(suffix)) return null;
    K = constantOf(suffix);
    if (!K) return null;
  }
  const letters = [...new Set((insideText.match(/[A-Za-z]/g) || []))];
  if (letters.length !== 1 || letters[0] === 'e') return null;
  const variable = letters[0];
  const inside = parsePolynomial(insideText, variable);
  if (!inside || inside.length !== 2 || isZero(inside[1])) return null;
  return { A, b: inside[0], m: inside[1], K, variable };
};

const absSolutions = ({ A, m, b, K, C }) => {
  const D = divide(subtract(C, K), A);
  if (neg(D)) return { D, solutions: [] };
  if (isZero(D)) return { D, solutions: [divide(negate(b), m)] };
  const s = [divide(subtract(D, b), m), divide(subtract(negate(D), b), m)].sort((x, y) => toNumber(x) - toNumber(y));
  return { D, solutions: s };
};

/** One equation a|mx + b| + k = c (either side), from a relation source. */
const readAbsEquation = (source) => {
  const s = normalizeMath(source);
  if (!s || /[<>≤≥]/.test(s) || (s.match(/=/g) || []).length !== 1) return null;
  const [left, right] = s.split('=');
  let side;
  let other;
  if (left.includes('|') && !right.includes('|')) [side, other] = [left, right];
  else if (right.includes('|') && !left.includes('|')) [side, other] = [right, left];
  else return null;
  const abs = readAbsSide(side);
  const C = constantOf(other);
  if (!abs || !C) return null;
  return { ...abs, C, ...absSolutions({ ...abs, C }) };
};

const absLead = (A) => (equals(A, ONE) ? '' : equals(A, MINUS_ONE) ? '-' : `${neg(A) ? '-' : ''}${magnitudeText(absolute(A))}`);
const absTail = (K) => (isZero(K) ? '' : ` ${neg(K) ? '-' : '+'} ${num(absolute(K))}`);
const insideText = ({ m, b, variable = 'x' }) => polyText([m, b], variable);
const absSideText = (model) => `${absLead(model.A)}|${insideText(model)}|${absTail(model.K)}`;
const absEquationText = (model) => `${absSideText(model)} = ${num(model.C)}`;

/** The equation of a prompt: the text around its one |…| = constant. */
const promptAbsEquation = (prompt) => {
  const s = ascii(prompt).replace(/\$/g, '').replace(/\\left|\\right/g, '');
  if ((s.match(/\|/g) || []).length !== 2 || (s.match(/=/g) || []).length !== 1) return null;
  const first = s.indexOf('|');
  const equal = s.indexOf('=');
  if (equal < s.lastIndexOf('|')) return null;
  let start = first;
  while (start > 0 && /[\d.+\-()/*\s]/.test(s[start - 1])) start -= 1;
  let end = equal + 1;
  while (end < s.length && /[\d+\-()/*\s.]/.test(s[end])) {
    if (s[end] === '.' && !/\d/.test(s[end + 1] || '')) break;
    end += 1;
  }
  return readAbsEquation(s.slice(start, end));
};

/* ---------------------------------------------------------------------------
 * vertex / zeros: one quadratic y = … or f(x) = … in the prompt.
 * ------------------------------------------------------------------------- */

const promptQuadratic = (prompt) => {
  const s = ascii(prompt).replace(/\$/g, '').replace(/\\left|\\right/g, '');
  if ((s.match(/=/g) || []).length !== 1) return null;
  const match = /(?:^|[^A-Za-z])(y|[a-z]\(x\))\s*=\s*(.+)$/.exec(s);
  if (!match) return null;
  const rhsText = match[2].split(/\.(?!\d)|[,;:?!]|\s(?:and|then|Write|Enter|Give)\b/)[0];
  const rhs = normalizeMath(rhsText);
  const coefficients = parsePolynomial(rhs, 'x');
  if (!coefficients || coefficients.length !== 3 || isZero(coefficients[2])) return null;
  const [c, b, a] = coefficients;
  return { name: match[1], a, b, c, vertexForm: /\(x(?:[+-][\d./()]+)?\)\^2/.test(rhs) };
};

const vertexOf = ({ a, b, c }) => {
  const h = divide(negate(b), multiply(TWO, a));
  return [h, add(add(multiply(a, multiply(h, h)), multiply(b, h)), c)];
};

/** Rational roots of ax² + bx + c, sorted; null when they are not rational. */
const rationalRoots = ({ a, b, c }) => {
  const disc = subtract(multiply(b, b), multiply(FOUR, multiply(a, c)));
  if (neg(disc)) return [];
  const root = (n) => {
    const r = Math.round(Math.sqrt(n));
    return r * r === n ? r : null;
  };
  const sn = root(disc.n);
  const sd = root(disc.d);
  if (sn === null || sd === null) return null;
  const sq = R(sn, sd);
  const twoA = multiply(TWO, a);
  const roots = [divide(subtract(negate(b), sq), twoA), divide(add(negate(b), sq), twoA)].sort((x, y) => toNumber(x) - toNumber(y));
  return isZero(sq) ? [roots[0]] : roots;
};

const fieldKeys = (field) => answerCandidatesForField(field);
const firstKey = (field) => fieldKeys(field)[0];
const numericFieldValue = (field) => {
  const key = firstKey(field);
  return typeof key === 'number' || typeof key === 'string' ? exact(key) : null;
};
const parsePair = (value) => {
  const match = /^\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)$/.exec(ascii(text(value)));
  if (!match) return null;
  const x = exact(match[1]);
  const y = exact(match[2]);
  return x && y ? [x, y] : null;
};
const sameMultiset = (values, expected) => values.length === expected.length
  && [...values].sort((x, y) => toNumber(x) - toNumber(y)).every((value, index) => equals(value, expected[index]));

/* ---------------------------------------------------------------------------
 * The models. modelFor(question) → one reading, or null.
 * ------------------------------------------------------------------------- */

const isMultiAnswer = (question) => typeOf(question) === 'multiAnswer' && Array.isArray(question.answerFields) && question.answerFields.length > 0;

const familyAbsModel = (question) => {
  if (familyIdOf(question) !== ABSOLUTE_VALUE_FAMILY_ID || !isMultiAnswer(question)) return null;
  const equation = promptAbsEquation(question.prompt);
  if (!equation || equation.variable !== 'x' || equation.solutions.length !== 2) return null;
  const keys = question.answerFields.map(numericFieldValue);
  if (keys.length !== 2 || keys.some((key) => !key) || !equals(keys[0], equation.solutions[0]) || !equals(keys[1], equation.solutions[1])) return null;
  return { kind: 'absEquation', source: 'family', ...equation };
};

const authoredAbsModel = (question) => {
  if (familyIdOf(question) || !isMultiAnswer(question)) return null;
  if (!/\bsolve\b/i.test(text(question.prompt))) return null;
  const equation = promptAbsEquation(question.prompt);
  if (!equation || !equation.solutions.length) return null;
  const keys = question.answerFields.map(numericFieldValue);
  if (keys.some((key) => !key) || !sameMultiset(keys, equation.solutions)) return null;
  return { kind: 'absEquation', source: 'authored', ...equation };
};

/** The relation the Step Algebra workspace opens, read in the renderer's order. */
const workspaceRelationSource = (question) => {
  if (typeOf(question) !== 'stepAlgebra' || question.relationWorkspace === false) return '';
  const routed = withPromptRelationSource(question);
  const direct = [routed.equation, routed.equationAscii, routed.initialEquation, routed.formula, routed.equationLatex].find((value) => text(value));
  if (direct) return text(direct);
  const left = text(routed.leftExpression);
  const right = text(routed.rightExpression);
  const relation = text(routed.relation || routed.comparator || routed.inequalitySymbol || '=');
  return left && right && relation === '=' ? `${left} = ${right}` : '';
};

const workspaceAbsModel = (question) => {
  const source = workspaceRelationSource(question);
  if (!source || !source.includes('|')) return null;
  const equation = readAbsEquation(source);
  if (!equation) return null;
  const routed = withPromptRelationSource(question);
  const variable = text(routed.solveFor || routed.variable || routed.objective?.variable) || 'x';
  if (variable !== equation.variable) return null;
  return { kind: 'absEquation', source: 'workspace', ...equation };
};

const vertexModel = (question) => {
  if (!isMultiAnswer(question) || question.answerFields.length !== 1) return null;
  const id = familyIdOf(question);
  if (id && id !== VERTEX_FAMILY_ID) return null;
  if (!id && !/\bvertex\b/i.test(text(question.prompt))) return null;
  const quadratic = promptQuadratic(question.prompt);
  if (!quadratic || (id && quadratic.name !== 'y')) return null;
  const vertex = vertexOf(quadratic);
  const key = parsePair(firstKey(question.answerFields[0]));
  if (!key || !equals(key[0], vertex[0]) || !equals(key[1], vertex[1])) return null;
  return { kind: 'vertex', ...quadratic, vertex };
};

const zerosModel = (question) => {
  if (!isMultiAnswer(question)) return null;
  const id = familyIdOf(question);
  if (id && id !== ZEROS_FAMILY_ID) return null;
  if (!id && !/\b(?:zeros?|roots?)\b/i.test(text(question.prompt))) return null;
  const quadratic = promptQuadratic(question.prompt);
  if (!quadratic || quadratic.vertexForm) return null;
  const roots = rationalRoots(quadratic);
  if (!roots || !roots.length) return null;
  const keys = question.answerFields.map(numericFieldValue);
  if (keys.some((key) => !key) || !sameMultiset(keys, roots)) return null;
  if (id && (keys.length !== 2 || !equals(keys[0], roots[0]) || !equals(keys[1], roots[roots.length - 1]))) return null;
  return { kind: 'zeros', ...quadratic, roots };
};

/* ------------------------------------------------------------ polynomialWorkshop */

const coefficientList = (value) => {
  if (!Array.isArray(value) || !value.length) return null;
  const out = value.map(fieldNumber);
  return out.every(Boolean) ? out : null;
};
const polynomialMode = (question) => {
  const mode = question?.mode || 'factorZero';
  return POLYNOMIAL_VIEWS.includes(mode) ? mode : 'factorZero';
};

const longDivide = (dividend, divisor) => {
  const numerator = trimLeading(dividend);
  const denominator = trimLeading(divisor);
  if (denominator.length === 1 && isZero(denominator[0])) return null;
  if (numerator.length < denominator.length) return { quotient: [ZERO], remainder: numerator };
  const working = [...numerator];
  const quotientLength = numerator.length - denominator.length + 1;
  const quotient = Array(quotientLength).fill(ZERO);
  for (let i = 0; i < quotientLength; i += 1) {
    const factor = divide(working[i], denominator[0]);
    quotient[i] = factor;
    for (let j = 0; j < denominator.length; j += 1) working[i + j] = subtract(working[i + j], multiply(factor, denominator[j]));
  }
  const rest = working.slice(quotientLength);
  return { quotient: trimLeading(quotient), remainder: trimLeading(rest.length ? rest : [ZERO]) };
};

const END_LABELS = Object.freeze({
  evenUp: 'both ends rise',
  evenDown: 'both ends fall',
  oddUp: 'left falls, right rises',
  oddDown: 'left rises, right falls',
});
const endLabel = (degree, lead) => END_LABELS[`${degree % 2 === 0 ? 'even' : 'odd'}${pos(lead) ? 'Up' : 'Down'}`];

const polynomialModel = (question) => {
  if (typeOf(question) !== 'polynomialWorkshop') return null;
  const mode = polynomialMode(question);
  const D = POLYNOMIAL_WORKSHOP_DEFAULTS[mode];
  if (mode === 'factorZero') {
    const coefficients = coefficientList(question.coefficients || D.coefficients);
    const r = fieldNumber(question.candidateRoot ?? D.candidateRoot);
    if (!coefficients || !r) return null;
    const shown = trimLeading(coefficients);
    if (shown.length < 2) return null;
    const value = evaluate(coefficients, r);
    return { kind: 'factorZero', mode, coefficients: shown, r, value, isFactor: isZero(value) };
  }
  if (mode === 'multiplyArea') {
    const left = coefficientList(question.leftBinomial || D.leftBinomial);
    const right = coefficientList(question.rightBinomial || D.rightBinomial);
    if (!left || !right || left.length !== 2 || right.length !== 2 || isZero(left[0]) || isZero(right[0])) return null;
    const cells = [multiply(left[0], right[0]), multiply(left[0], right[1]), multiply(left[1], right[0]), multiply(left[1], right[1])];
    const productList = trimLeading(multiplyPolys(left, right));
    return { kind: 'multiplyArea', mode, left, right, cells, product: productList };
  }
  if (mode === 'factorQuadratic') {
    const coefficients = coefficientList(question.coefficients || D.coefficients);
    if (!coefficients) return null;
    const values = trimLeading(coefficients);
    if (values.length !== 3 || !equals(values[0], ONE) || !isInteger(values[1]) || !isInteger(values[2])) return null;
    if (Math.abs(values[2].n) > 10000) return null;
    const roots = rationalRoots({ a: ONE, b: values[1], c: values[2] });
    if (!roots || !roots.length) return null;
    const pair = (roots.length === 1 ? [roots[0], roots[0]] : roots).map(negate).sort((x, y) => toNumber(x) - toNumber(y));
    if (!pair.every(isInteger)) return null;
    return { kind: 'factorQuadratic', mode, b: values[1], c: values[2], pair };
  }
  if (mode === 'division') {
    const dividend = coefficientList(question.dividend || D.dividend);
    const divisor = coefficientList(question.divisor || D.divisor);
    if (!dividend || !divisor) return null;
    const result = longDivide(dividend, divisor);
    if (!result) return null;
    const shownDivisor = trimLeading(divisor);
    if (shownDivisor.length < 2) return null;
    return { kind: 'division', mode, dividend: trimLeading(dividend), divisor: shownDivisor, ...result };
  }
  if (mode === 'graphConnection') {
    const rawRoots = question.roots || D.roots;
    if (!Array.isArray(rawRoots) || !rawRoots.length) return null;
    const roots = [];
    for (const entry of rawRoots) {
      if (!isObject(entry)) return null;
      const root = fieldNumber(entry.root);
      const multiplicity = Number(entry.multiplicity ?? 1);
      if (!root || !Number.isInteger(multiplicity) || multiplicity < 1 || multiplicity > 6) return null;
      if (roots.some((other) => equals(other.root, root))) return null; // a root listed twice: the grader reads one entry's multiplicity
      roots.push({ root, multiplicity });
    }
    const lead = fieldNumber(question.leadingCoefficient ?? D.leadingCoefficient);
    if (!lead || isZero(lead)) return null;
    let target = roots[0];
    if (question.targetRoot !== undefined && question.targetRoot !== null) {
      const wanted = fieldNumber(question.targetRoot);
      // The workshop and its grader fall back to the first root when the target is not one of them.
      target = (wanted && roots.find((entry) => equals(entry.root, wanted))) || roots[0];
    }
    const degree = roots.reduce((sum, entry) => sum + entry.multiplicity, 0);
    return {
      kind: 'graphConnection',
      mode,
      roots,
      lead,
      target,
      degree,
      behavior: target.multiplicity % 2 === 0 ? 'touches' : 'crosses',
      end: endLabel(degree, lead),
    };
  }
  // rationalFeatures
  const numeratorRoots = coefficientList(question.numeratorRoots || D.numeratorRoots);
  const denominatorRoots = coefficientList(question.denominatorRoots || D.denominatorRoots);
  if (!numeratorRoots || !denominatorRoots) return null;
  const count = (values, value) => values.filter((entry) => equals(entry, value)).length;
  const allRoots = [...numeratorRoots, ...denominatorRoots].sort((x, y) => toNumber(x) - toNumber(y));
  let target;
  if (question.targetValue !== undefined && question.targetValue !== null) target = fieldNumber(question.targetValue);
  else target = allRoots[0] || R(2);
  if (!target) return null;
  const n = count(numeratorRoots, target);
  const d = count(denominatorRoots, target);
  const cancelled = Math.min(n, d);
  let type = 'none';
  if (cancelled > 0 && d - cancelled === 0) type = 'hole';
  else if (d - cancelled > 0) type = 'verticalAsymptote';
  else if (n - cancelled > 0) type = 'zero';
  return { kind: 'rationalFeatures', mode, numeratorRoots, denominatorRoots, target, type };
};

/* ------------------------------------------------------------ parabolaGeometryLab */

const parabolaMode = (question) => {
  const mode = question?.mode || 'features';
  return PARABOLA_VIEWS.includes(mode) ? mode : 'features';
};
const parabolaSpec = (question, defaults) => {
  const h = fieldNumber(question.h ?? defaults.h);
  const k = fieldNumber(question.k ?? defaults.k);
  const p = fieldNumber(question.p ?? defaults.p);
  if (!h || !k || !p || isZero(p)) return null;
  return { h, k, p, vertical: (question.orientation || 'vertical') !== 'horizontal' };
};
const parabolaFeaturesOf = ({ h, k, p, vertical }) => ({
  focus: vertical ? [h, add(k, p)] : [add(h, p), k],
  directrix: { kind: vertical ? 'horizontal' : 'vertical', value: vertical ? subtract(k, p) : subtract(h, p) },
  latus: multiply(FOUR, absolute(p)),
  opens: vertical ? (pos(p) ? 'up' : 'down') : (pos(p) ? 'right' : 'left'),
});

const squareRoot = (value) => {
  const root = (n) => {
    const r = Math.round(Math.sqrt(n));
    return r * r === n ? r : null;
  };
  const n = root(value.n);
  const d = root(value.d);
  return n === null || d === null ? null : R(n, d);
};

const parabolaModel = (question) => {
  if (typeOf(question) !== 'parabolaGeometryLab') return null;
  const mode = parabolaMode(question);
  if (mode === 'features' || mode === 'equation') {
    const spec = parabolaSpec(question, mode === 'features' ? { h: 1, k: -1, p: 2 } : { h: -2, k: 1, p: 1.5 });
    if (!spec) return null;
    return { kind: mode === 'features' ? 'parabolaFeatures' : 'parabolaEquation', mode, ...spec, ...parabolaFeaturesOf(spec), coefficient: multiply(FOUR, spec.p) };
  }
  if (mode === 'equidistance') {
    const spec = parabolaSpec(question, { h: 0, k: 0, p: 2 });
    if (!spec) return null;
    let point;
    let sampled = false;
    if (question.point) {
      if (!Array.isArray(question.point) || question.point.length !== 2) return null;
      point = question.point.map(fieldNumber);
      if (!point.every(Boolean)) return null;
    } else {
      const offset = fieldNumber(question.offset ?? 4);
      if (!offset) return null;
      const shift = divide(multiply(offset, offset), multiply(FOUR, spec.p));
      point = spec.vertical ? [add(spec.h, offset), add(shift, spec.k)] : [add(shift, spec.h), add(spec.k, offset)];
      sampled = true;
    }
    const features = parabolaFeaturesOf(spec);
    const dx = subtract(point[0], features.focus[0]);
    const dy = subtract(point[1], features.focus[1]);
    const focusSquared = add(multiply(dx, dx), multiply(dy, dy));
    const directrixDistance = absolute(subtract(spec.vertical ? point[1] : point[0], features.directrix.value));
    const focusExact = squareRoot(focusSquared);
    const focusFloat = Math.sqrt(toNumber(focusSquared));
    const onExact = equals(focusSquared, multiply(directrixDistance, directrixDistance));
    // The grader decides "on the parabola" within 1e-5; claim only when that agrees with the exact answer.
    if (onExact !== (Math.abs(focusFloat - toNumber(directrixDistance)) <= 1e-5)) return null;
    return { kind: 'parabolaEquidistance', mode, ...spec, ...features, point, sampled, focusSquared, focusExact, focusFloat, directrixDistance, on: onExact };
  }
  // fromGeometry
  const focusRaw = question.focus || [2, 3];
  const directrixRaw = question.directrix || { kind: 'horizontal', value: -1 };
  if (!Array.isArray(focusRaw) || focusRaw.length !== 2 || !isObject(directrixRaw)) return null;
  const focus = focusRaw.map(fieldNumber);
  const d = fieldNumber(directrixRaw.value);
  if (!focus.every(Boolean) || !d || !['horizontal', 'vertical'].includes(directrixRaw.kind)) return null;
  const vertical = directrixRaw.kind === 'horizontal';
  const along = vertical ? focus[1] : focus[0];
  const middle = divide(add(along, d), TWO);
  const p = subtract(along, middle);
  if (isZero(p)) return null;
  return {
    kind: 'parabolaFromGeometry',
    mode,
    focus,
    directrix: { kind: directrixRaw.kind, value: d },
    vertical,
    h: vertical ? focus[0] : middle,
    k: vertical ? middle : focus[1],
    p,
  };
};

const modelFor = (question) => {
  if (!isObject(question)) return null;
  try {
    return familyAbsModel(question)
      || authoredAbsModel(question)
      || workspaceAbsModel(question)
      || vertexModel(question)
      || zerosModel(question)
      || polynomialModel(question)
      || parabolaModel(question)
      || null;
  } catch { /* a question this family cannot read is not its question */ }
  return null;
};

export const matches = (question) => Boolean(modelFor(question));

/** The sub-kind this family reads a question as (tests and diagnostics). */
export const questionKind = (question) => modelFor(question)?.kind || null;

/* ---------------------------------------------------------------------------
 * expectedValues: everything the student must find, in every spelling.
 * ------------------------------------------------------------------------- */

const NO_SOLUTION_FORMS = Object.freeze(['no solution', 'No solution', 'no real solution', 'no solutions', '∅', '{}', 'empty set']);
const BEHAVIOR_LABELS = Object.freeze({ crosses: 'crosses the x-axis', touches: 'touches and turns' });
const RATIONAL_LABELS = Object.freeze({ hole: 'Hole', verticalAsymptote: 'Vertical asymptote', zero: 'Zero / x-intercept', none: 'None of these' });
const RATIONAL_WORDS = Object.freeze({
  hole: ['hole'],
  verticalAsymptote: ['vertical asymptote', 'asymptote'],
  zero: ['zero', 'x-intercept'],
  none: ['none'],
});

const solutionSetForms = (values, variable = 'x') => {
  if (!values.length) return [];
  const texts = values.map(rationalText);
  const out = [`{${texts.join(', ')}}`, texts.join(', '), texts.map((value) => `${variable} = ${value}`).join(' or '), texts.map((value) => `${variable} = ${value}`).join(' and ')];
  return unique(out.flatMap(equationForms));
};

const expectedFor = (model) => {
  switch (model.kind) {
    case 'absEquation': {
      const { solutions, variable } = model;
      if (!solutions.length) return model.source === 'workspace' ? [...NO_SOLUTION_FORMS] : [];
      return unique([
        ...solutions.flatMap(numberForms),
        ...solutions.flatMap((value) => variableForms(variable, value)),
        ...solutionSetForms(solutions, variable),
        ...(model.source === 'workspace' ? ['valid'] : []),
      ]);
    }
    case 'vertex': {
      const [h, k] = model.vertex;
      return unique([...pairForms(model.vertex), ...numberForms(h), ...numberForms(k), ...variableForms('x', h), ...variableForms('y', k)]);
    }
    case 'zeros':
      return unique([
        ...model.roots.flatMap(numberForms),
        ...model.roots.flatMap((value) => variableForms('x', value)),
        ...model.roots.flatMap((value) => pairForms([value, ZERO])),
        ...solutionSetForms(model.roots),
      ]);
    case 'factorZero':
      return unique([
        ...numberForms(model.value),
        ...numberForms(model.value).map((value) => `P(${rationalText(model.r)}) = ${value}`),
        model.isFactor ? 'yes' : 'no',
        model.isFactor ? 'Yes' : 'No',
      ]);
    case 'multiplyArea':
      return unique([
        ...model.cells.flatMap(numberForms),
        ...model.product.flatMap(numberForms),
        // The cells as monomials ("6x²", "-8x"); a coefficient of ±1 or 0 would only spell "x²" or "x".
        ...[...model.cells.map((value, index) => [value, [2, 1, 1, 0][index]]), [model.product[1], 1]]
          .filter(([value]) => !isZero(value) && !equals(absolute(value), ONE))
          .flatMap(([value, degree]) => equationForms(monomial(value, degree))),
        ...listForms(model.product),
        ...polyForms(model.product),
      ]);
    case 'factorQuadratic': {
      const [p, q] = model.pair;
      const factored = [`${factorText(negate(p))}${factorText(negate(q))}`, `${factorText(negate(q))}${factorText(negate(p))}`];
      return unique([
        ...numberForms(p),
        ...numberForms(q),
        ...listForms([p, q]),
        ...listForms([q, p]),
        ...variableForms('p', p),
        ...variableForms('q', q),
        ...factored.flatMap(equationForms),
      ]);
    }
    case 'division':
      return unique([
        ...model.quotient.flatMap(numberForms),
        ...model.remainder.flatMap(numberForms),
        ...listForms(model.quotient),
        ...listForms(model.remainder),
        ...polyForms(model.quotient),
        ...polyForms(model.remainder),
      ]);
    case 'graphConnection':
      return unique([model.behavior, BEHAVIOR_LABELS[model.behavior], model.end]);
    case 'rationalFeatures':
      return unique([model.type, RATIONAL_LABELS[model.type], ...RATIONAL_WORDS[model.type]]);
    case 'parabolaFeatures':
      return unique([
        ...model.focus.flatMap(numberForms),
        ...pairForms(model.focus),
        ...numberForms(model.directrix.value),
        ...variableForms(model.vertical ? 'y' : 'x', model.directrix.value),
        ...numberForms(model.latus),
      ]);
    case 'parabolaEquidistance': {
      const focusForms = model.focusExact ? numberForms(model.focusExact) : [
        ...approxForms(model.focusFloat),
        ...(isInteger(model.focusSquared) ? [`√${model.focusSquared.n}`, `sqrt(${model.focusSquared.n})`] : []),
      ];
      return unique([...focusForms, ...numberForms(model.directrixDistance), model.on ? 'yes' : 'no', model.on ? 'Yes' : 'No']);
    }
    case 'parabolaFromGeometry':
      return unique([
        ...numberForms(model.h),
        ...numberForms(model.k),
        ...numberForms(model.p),
        ...pairForms([model.h, model.k]),
        ...variableForms('h', model.h),
        ...variableForms('k', model.k),
        ...variableForms('p', model.p),
      ]);
    case 'parabolaEquation':
      return unique([...numberForms(model.coefficient), ...variableForms('4p', model.coefficient), model.opens]);
    default:
      return [];
  }
};

export const expectedValues = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    return expectedFor(model);
  } catch {
    return [];
  }
};

/** The plain keys the platform guard also reads (questionAnswerValues), without the family. */
const rawKeyTexts = (question = {}) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 2 && value.every((entry) => typeof entry === 'number')) values.push(`(${value[0]}, ${value[1]})`, `(${value[0]},${value[1]})`);
      return;
    }
    if (typeof value !== 'object') values.push(text(value));
  };
  try {
    list(question.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
    push(question.answer);
    push(question.solution);
    push(question.target);
    push(question.generatedAnswer);
    list(question.acceptedAnswers).forEach(push);
    if (isObject(question.solutionKey)) push(question.solutionKey.value);
  } catch { /* the guard reads what it can */ }
  return values;
};

const guardFor = (question, model) => unique([...expectedFor(model), ...rawKeyTexts(question)]);

/*
 * VERDICT VIEWS. On a view whose answer is (or includes) a verdict, WHICH spelling a
 * student is shown must not depend on the verdict: "the numbered hint fell back to the
 * plain one" would otherwise say "a hidden value collided with a shown number", which
 * only happens for some verdicts (a factor has P(r) = 0, never a shown number; an
 * absolute value equation with no solution has no numbers to collide with). So:
 *
 *   - factorZero and parabolaEquidistance: the hidden values (P(r), the two distances)
 *     can be any number, so these views ALWAYS use the plain spellings;
 *   - a Step Algebra absolute value equation (two, one or no solution): the numbered
 *     spelling is tested against the solutions the equation WOULD have if the isolated
 *     absolute value equalled the size of the number it equals, (−b ± |d|)/m. These
 *     are the real solutions when d ≥ 0 and the same numbers when d < 0, so the choice
 *     does not tell the cases apart (|d| = 0 is visible: c equals the number outside);
 *   - the parabola equation view: tested against ±4|p| and every opening word;
 *   - every verdict view: every outcome's verdict words are in the choice guard.
 *
 * The choice guard always contains the real guard, so nothing it lets through can
 * reveal an answer; it is also the guard the worked sibling avoids.
 */
const PLAIN_ONLY_KINDS = Object.freeze(['factorZero', 'parabolaEquidistance']);
const VERDICT_WORDS = Object.freeze({
  absEquation: [...NO_SOLUTION_FORMS, 'valid'],
  factorZero: ['yes', 'Yes', 'no', 'No'],
  parabolaEquidistance: ['yes', 'Yes', 'no', 'No'],
  graphConnection: [...Object.keys(BEHAVIOR_LABELS), ...Object.values(BEHAVIOR_LABELS)],
  rationalFeatures: [...Object.keys(RATIONAL_LABELS), ...Object.values(RATIONAL_LABELS), ...Object.values(RATIONAL_WORDS).flat()],
  parabolaEquation: ['up', 'down', 'left', 'right'],
});

const choiceGuardFor = (question, model) => {
  const guard = guardFor(question, model);
  const extra = [];
  if (model.kind === 'absEquation' && model.source === 'workspace') {
    const size = absolute(divide(subtract(model.C, model.K), model.A));
    const mirrored = [divide(subtract(size, model.b), model.m), divide(subtract(negate(size), model.b), model.m)]
      .sort((x, y) => toNumber(x) - toNumber(y));
    const solutions = isZero(size) ? [mirrored[0]] : mirrored;
    extra.push(...expectedFor({ ...model, solutions }), ...VERDICT_WORDS.absEquation);
  } else if (model.kind === 'graphConnection') {
    extra.push(...VERDICT_WORDS.graphConnection, ...Object.values(END_LABELS));
  } else if (model.kind === 'parabolaEquation') {
    const size = absolute(model.coefficient);
    [size, negate(size)].forEach((value) => extra.push(...numberForms(value), ...variableForms('4p', value)));
    extra.push(...VERDICT_WORDS.parabolaEquation);
  } else if (VERDICT_WORDS[model.kind]) {
    extra.push(...VERDICT_WORDS[model.kind]);
  }
  return unique([...guard, ...extra]);
};

/** The spellings a view may use: [numbered, plain], or [plain, plain] on a plain-only view. */
const spellingsFor = (model, pairs) => (PLAIN_ONLY_KINDS.includes(model.kind)
  ? pairs.map(([, plain]) => [plain, plain])
  : pairs);

/** The numbered spelling unless it leaks, else the plain one, else nothing. */
const choose = (guard) => ([specific, plain]) => {
  if (specific && !hintRevealsAnswer(specific, guard)) return specific;
  if (plain && !hintRevealsAnswer(plain, guard)) return plain;
  return null;
};

/* ---------------------------------------------------------------------------
 * hints: least to most specific. Each entry is [numbered, plain].
 * ------------------------------------------------------------------------- */

const absHints = (model) => {
  const equation = absEquationText(model);
  const abs = `|${insideText(model)}|`;
  const inside = insideText(model);
  const out = [];
  const steps = [];
  if (!isZero(model.K)) steps.push(neg(model.K) ? `add ${num(absolute(model.K))} to both sides` : `subtract ${num(model.K)} from both sides`);
  if (!equals(model.A, ONE)) steps.push(`divide both sides by ${num(model.A)}`);
  if (steps.length) {
    out.push([
      `Get ${abs} alone first: in ${equation}, ${steps.join(', then ')}.`,
      'Get the absolute value alone first: undo the number added or subtracted outside the bars, then divide by the number multiplying the bars.',
    ]);
  } else {
    out.push([
      `${abs} is already alone on one side of ${equation}. Before you split it, look at the number it equals.`,
      'The absolute value is already alone on one side. Before you split it, look at the number it equals.',
    ]);
  }
  out.push([
    'An absolute value measures a distance, so it is never negative. Once it is alone, check the sign of the number it equals before you split anything.',
    'An absolute value measures a distance, so it is never negative. Once it is alone, check the sign of the number it equals before you split anything.',
  ]);
  out.push([
    `If ${abs} equals a positive number, split it into two equations: ${inside} equals that number, or ${inside} equals its opposite. (If it equals zero, there is only one equation.) Solve each one.`,
    'If the absolute value equals a positive number, split it into two equations: the expression inside the bars equals that number, or it equals the opposite of that number. (If it equals zero, there is only one equation.) Solve each one.',
  ]);
  out.push([
    `Check every value you find by substituting it into the original equation ${equation}.`,
    'Check every value you find by substituting it into the original equation.',
  ]);
  return out;
};

const vertexEquationText = (model) => `${model.name} = ${polyText([model.a, model.b, model.c])}`;
/** y = a(x - h)² + k as the family writes vertex form. */
const vertexFormText = (a, h, k, name = 'y') => {
  const lead = equals(a, ONE) ? '' : equals(a, MINUS_ONE) ? '-' : `${neg(a) ? '-' : ''}${magnitudeText(absolute(a))}`;
  const squared = isZero(h) ? 'x²' : `${factorText(h)}²`;
  return `${name} = ${lead}${squared}${absTail(k)}`;
};

const vertexHints = (model) => {
  const [h, k] = model.vertex;
  if (model.vertexForm) {
    const equation = vertexFormText(model.a, h, k, model.name);
    const squared = isZero(h) ? 'x' : factorText(h);
    return [
      [`Compare ${equation} with the vertex form y = a(x - h)² + k, whose vertex is the point (h, k).`, 'Compare the equation with the vertex form y = a(x - h)² + k, whose vertex is the point (h, k).'],
      [`h is the x-value that makes the expression ${squared} inside the square equal to zero. Read the sign carefully: the form has x minus h.`, 'h is the x-value that makes the expression inside the square equal to zero. Read the sign carefully: the form has x minus h.'],
      [`k is the number added after the square in ${equation}; the number in front of the square does not move the vertex.`, 'k is the number added after the square; the number in front of the square does not move the vertex.'],
      [`Check: substituting your x-coordinate into ${equation} should give your y-coordinate, and no other x-value gives a ${pos(model.a) ? 'smaller' : 'larger'} y-value.`, 'Check: substituting your x-coordinate into the equation should give your y-coordinate.'],
    ];
  }
  const equation = vertexEquationText(model);
  return [
    [`Read the coefficients of ${equation} from y = ax² + bx + c: a = ${num(model.a)}, b = ${num(model.b)} and c = ${num(model.c)}.`, 'Read a, b and c from the form y = ax² + bx + c.'],
    [`The vertex lies on the axis of symmetry x = -b/(2a). Use b = ${num(model.b)} and a = ${num(model.a)}.`, 'The vertex lies on the axis of symmetry: its x-coordinate is the opposite of b divided by twice a, with this equation’s a and b.'],
    [`Substitute that x-value into ${equation} to get the y-coordinate of the vertex.`, 'Substitute that x-value into the equation to get the y-coordinate of the vertex.'],
    ['Write the vertex as an ordered pair (x, y), with the x-coordinate first.', 'Write the vertex as an ordered pair (x, y), with the x-coordinate first.'],
  ];
};

const zerosHints = (model) => {
  const poly = polyText([model.a, model.b, model.c]);
  const out = [[
    `The zeros are the x-values where f(x) = 0, so solve ${poly} = 0.`,
    'The zeros are the x-values that make f(x) equal to zero, so set the expression equal to zero and solve.',
  ]];
  // "Every term shares the factor a" is said only when it is TRUE: a divides b and c
  // (2x² - x - 3 does not share the factor 2). Otherwise the move is the ac method on
  // an integer quadratic, factoring out x when there is no constant term, or dividing
  // through by a (which does not change the zeros).
  const integral = [model.a, model.b, model.c].every(isInteger);
  const sharesLead = isInteger(divide(model.b, model.a)) && isInteger(divide(model.c, model.a));
  if (equals(model.a, ONE) || sharesLead) {
    if (!equals(model.a, ONE)) {
      out.push([
        `Every term of ${poly} shares the factor ${num(model.a)}: factor it out first, so the quadratic left inside starts with x².`,
        'Every term shares the leading coefficient as a factor: factor it out first, so the quadratic left inside starts with x².',
      ]);
    }
    out.push([
      equals(model.a, ONE) ? `Look for two numbers whose product is ${num(model.c)} and whose sum is ${num(model.b)}.` : '',
      'Look for two numbers whose product is the constant term and whose sum is the coefficient of x, in the quadratic that starts with x².',
    ]);
  } else if (isZero(model.c)) {
    out.push([
      `Every term of ${poly} contains x: factor x out first, then set each factor equal to zero.`,
      'There is no constant term, so every term contains x: factor x out first, then set each factor equal to zero.',
    ]);
  } else if (integral) {
    out.push([
      `The leading coefficient ${num(model.a)} does not divide every term, so use the ac method: a × c = ${num(multiply(model.a, model.c))}. Look for two numbers whose product is ${num(multiply(model.a, model.c))} and whose sum is ${num(model.b)}.`,
      'The leading coefficient does not divide every term, so use the ac method: multiply the leading coefficient by the constant term, then look for two numbers whose product is that number and whose sum is the coefficient of x.',
    ]);
    out.push(isZero(model.b) ? [
      `${poly} has no x-term: write it as 0x, split 0x into two x-terms with those two numbers as coefficients, then factor by grouping.`,
      'There is no x-term: write it as 0x, split 0x into two x-terms with those two numbers as coefficients, then factor by grouping.',
    ] : [
      `Split the middle term of ${poly} into two x-terms with those two numbers as coefficients, then factor by grouping.`,
      'Split the middle term into two x-terms with those two numbers as coefficients, then factor by grouping.',
    ]);
  } else {
    out.push([
      `Divide every term of ${poly} = 0 by ${num(model.a)}: the zeros do not change, and the quadratic then starts with x².`,
      'Divide every term of the equation by the leading coefficient: the zeros do not change, and the quadratic then starts with x².',
    ]);
    out.push([
      '',
      'Look for two numbers whose product is the constant term and whose sum is the coefficient of x, in the quadratic that starts with x².',
    ]);
  }
  out.push([
    `Write the quadratic as a product of two factors, set each factor equal to zero and solve; check each zero by substituting it into f(x) = ${poly}.`,
    'Write the quadratic as a product of two factors, set each factor equal to zero and solve; check each zero by substituting it into f(x).',
  ]);
  return out;
};

const factorZeroHints = (model) => {
  const poly = polyText(model.coefficients);
  const r = num(model.r);
  const factor = factorText(model.r);
  return [
    [`Substitute x = ${r} into P(x) = ${poly}: replace every x with (${r}).`, 'Substitute the test value for every x in P(x), with parentheses around it.'],
    [`Work one term at a time: raise ${paren(model.r)} to each power first, multiply by the coefficient, then add the terms.`, 'Work one term at a time: powers first, then multiply by each coefficient, then add the terms.'],
    [`The Factor Theorem: ${factor} is a factor of P(x) exactly when P(${r}) comes out to zero.`, 'The Factor Theorem: (x - r) is a factor of P(x) exactly when P(r) comes out to zero.'],
    [`Check your arithmetic another way, for example with synthetic division by ${r}: the last number of the bottom row is P(${r}).`, 'Check your arithmetic another way, for example with synthetic division: the last number of the bottom row is the value of P at the test value.'],
  ];
};

const binomialText = (pair) => polyText(pair);
const areaHints = (model) => {
  const product2 = `(${binomialText(model.left)})(${binomialText(model.right)})`;
  return [
    [`Each cell is one row term times one column term: the rows are ${monomial(model.left[0], 1)} and ${num(model.left[1])}, the columns are ${monomial(model.right[0], 1)} and ${num(model.right[1])}.`, 'Each cell of the area model is one row term times one column term.'],
    ['Multiply the numbers and the x-parts separately: x times x gives x², x times a number gives x, and two numbers give a constant.', 'Multiply the numbers and the x-parts separately: x times x gives x², x times a number gives x, and two numbers give a constant.'],
    ['The two cells that hold x-terms are like terms: add their coefficients to get the single x-coefficient of the product.', 'The two cells that hold x-terms are like terms: add their coefficients to get the single x-coefficient of the product.'],
    [`Enter the coefficients from x² down to the constant. Check by substituting any value of x into both ${product2} and your polynomial: the results must match.`, 'Enter the coefficients from x² down to the constant. Check by substituting any value of x into both the original product and your polynomial: the results must match.'],
  ];
};

const factorQuadraticHints = (model) => {
  const poly = polyText([ONE, model.b, model.c]);
  return [
    [`You need two numbers p and q with p + q = ${num(model.b)} and p × q = ${num(model.c)}, because (x + p)(x + q) = x² + (p + q)x + pq.`, 'You need two numbers p and q whose sum is the x-coefficient and whose product is the constant term, because (x + p)(x + q) = x² + (p + q)x + pq.'],
    [`List the factor pairs of ${num(model.c)}, including the pairs of negative numbers.`, 'List the factor pairs of the constant term, including the pairs of negative numbers.'],
    ['If the constant term is negative, p and q have opposite signs; if it is positive, they have the same sign as the x-coefficient.', 'If the constant term is negative, p and q have opposite signs; if it is positive, they have the same sign as the x-coefficient.'],
    [`Check by multiplying (x + p)(x + q) back out: it must give ${poly} exactly.`, 'Check by multiplying (x + p)(x + q) back out: it must give the original quadratic exactly.'],
  ];
};

const divisionHints = (model) => {
  const dividend = polyText(model.dividend);
  const divisor = polyText(model.divisor);
  return [
    [`Divide the leading term of ${dividend} by the leading term of ${divisor}: that gives the first term of the quotient.`, 'Divide the leading term of the dividend by the leading term of the divisor: that gives the first term of the quotient.'],
    [`Multiply that term by the whole divisor ${divisor}, subtract the result from the dividend, and bring down the next term.`, 'Multiply that term by the whole divisor, subtract the result, and bring down the next term.'],
    ['Keep a place for every power of x: a missing power gets a coefficient of zero, so the columns line up.', 'Keep a place for every power of x: a missing power gets a coefficient of zero, so the columns line up.'],
    [`Stop when what is left has a lower degree than ${divisor}: that is the remainder. Check: divisor × quotient + remainder must give back ${dividend}.`, 'Stop when what is left has a lower degree than the divisor: that is the remainder. Check: divisor × quotient + remainder must give back the dividend.'],
  ];
};

const graphConnectionHints = (model) => {
  const t = num(model.target.root);
  return [
    [`The target zero x = ${t} has multiplicity ${model.target.multiplicity}. Is that odd or even?`, 'Look at the multiplicity of the target zero: is it odd or even?'],
    ['At a zero of odd multiplicity the graph passes from one side of the x-axis to the other; at a zero of even multiplicity it stays on the same side.', 'At a zero of odd multiplicity the graph passes from one side of the x-axis to the other; at a zero of even multiplicity it stays on the same side.'],
    [`For the ends, the degree is the sum of all the multiplicities (${model.roots.map((entry) => entry.multiplicity).join(' + ')}), and the leading coefficient is ${num(model.lead)}.`, 'For the ends, add all the multiplicities to get the degree, and note the sign of the leading coefficient.'],
    ['Even degree: both ends point the same way. Odd degree: the ends point opposite ways. A positive leading coefficient sends the right end upward; a negative one sends it downward.', 'Even degree: both ends point the same way. Odd degree: the ends point opposite ways. A positive leading coefficient sends the right end upward; a negative one sends it downward.'],
  ];
};

const rationalHints = (model) => {
  const t = num(model.target);
  return [
    [`Is ${t} in the list of numerator roots, the list of denominator roots, or both? Count how many times it appears in each.`, 'Check whether the target value is a root of the numerator, of the denominator, or of both, and count how many times it appears in each.'],
    ['A factor that appears in both the numerator and the denominator cancels, as many times as it appears in both. Decide what is left at that x-value after cancelling.', 'A factor that appears in both the numerator and the denominator cancels, as many times as it appears in both. Decide what is left at that x-value after cancelling.'],
    ['Even after cancelling, a root of the ORIGINAL denominator stays out of the domain.', 'Even after cancelling, a root of the ORIGINAL denominator stays out of the domain.'],
    ['Then match what is left: a root left only in the denominator, a root left only in the numerator, a root that cancelled completely, or a value that is a root of neither.', 'Then match what is left: a root left only in the denominator, a root left only in the numerator, a root that cancelled completely, or a value that is a root of neither.'],
  ];
};

const axisWord = (vertical) => (vertical ? 'vertical' : 'horizontal');
const parabolaFeaturesHints = (model) => [
  [`The vertex is (${num(model.h)}, ${num(model.k)}) and p = ${num(model.p)}. The axis of symmetry is ${axisWord(model.vertical)}, and the sign of p tells you which way along it the parabola opens.`, `Start from the vertex and p. The axis of symmetry is ${axisWord(model.vertical)}, and the sign of p tells you which way along it the parabola opens.`],
  ['The focus is |p| units from the vertex along the axis of symmetry, inside the curve.', 'The focus is |p| units from the vertex along the axis of symmetry, inside the curve.'],
  ['The directrix is the line |p| units from the vertex on the other side, perpendicular to the axis of symmetry.', 'The directrix is the line |p| units from the vertex on the other side, perpendicular to the axis of symmetry.'],
  ['The latus rectum is the chord through the focus perpendicular to the axis; its length is 4|p|.', 'The latus rectum is the chord through the focus perpendicular to the axis; its length is four times |p|.'],
];

const shownPoint = (point) => `(${Number(toNumber(point[0]).toFixed(2))}, ${Number(toNumber(point[1]).toFixed(2))})`;
const equidistanceHints = (model) => [
  [`First locate the focus and the directrix from the vertex (${num(model.h)}, ${num(model.k)}) and p = ${num(model.p)}.`, 'First locate the focus and the directrix from the vertex and p.'],
  [`Distance from P = ${shownPoint(model.point)} to the focus: use √((x₂ - x₁)² + (y₂ - y₁)²) with the coordinates of P and of the focus.`, 'Distance from P to the focus: use the distance formula √((x₂ - x₁)² + (y₂ - y₁)²) with the coordinates of P and of the focus.'],
  ['Distance from P to the directrix: measure straight across to the line, perpendicular to it. That is just the difference of the y-values (or of the x-values, for a vertical directrix).', 'Distance from P to the directrix: measure straight across to the line, perpendicular to it. That is just the difference of the y-values (or of the x-values, for a vertical directrix).'],
  ['Compare the two distances: P lies on the parabola exactly when they are equal.', 'Compare the two distances: P lies on the parabola exactly when they are equal.'],
];

const fromGeometryHints = (model) => {
  const line = `${model.vertical ? 'y' : 'x'} = ${num(model.directrix.value)}`;
  const focus = pt(model.focus);
  return [
    ['The vertex is halfway between the focus and the directrix, on the axis of symmetry through the focus.', 'The vertex is halfway between the focus and the directrix, on the axis of symmetry through the focus.'],
    [`The axis of symmetry passes through the focus ${focus} perpendicular to the directrix ${line}. Along that axis, the vertex sits at the average of the focus coordinate and the directrix value.`, 'The axis of symmetry passes through the focus, perpendicular to the directrix. Along that axis, the vertex sits at the average of the focus coordinate and the directrix value.'],
    ['p is the signed distance from the vertex to the focus: positive when the focus is above (or to the right of) the vertex, negative when it is below (or to the left).', 'p is the signed distance from the vertex to the focus: positive when the focus is above (or to the right of) the vertex, negative when it is below (or to the left).'],
    ['Check: the focus must be |p| units from your vertex on one side, and the directrix |p| units from it on the other side.', 'Check: the focus must be |p| units from your vertex on one side, and the directrix |p| units from it on the other side.'],
  ];
};

const shiftedVariable = (variable, value) => (isZero(value) ? variable : `${variable} ${neg(value) ? '+' : '-'} ${num(absolute(value))}`);
/** (x - h)² = 4p(y - k) or (y - k)² = 4p(x - h), the form the lab shows. */
const standardParabolaText = (h, k, vertical) => (vertical
  ? `(${shiftedVariable('x', h)})² = 4p(${shiftedVariable('y', k)})`
  : `(${shiftedVariable('y', k)})² = 4p(${shiftedVariable('x', h)})`);
const labEquationText = (model) => standardParabolaText(model.h, model.k, model.vertical);
const parabolaEquationHints = (model) => [
  [`Here p = ${num(model.p)}, and the value asked for is four times p, keeping its sign.`, 'The value asked for is four times p, keeping its sign.'],
  ['The squared variable sets the axis: a squared x means the parabola opens vertically; a squared y means it opens horizontally.', 'The squared variable sets the axis: a squared x means the parabola opens vertically; a squared y means it opens horizontally.'],
  ['Then the sign of p picks the side: a positive p opens toward larger values of the other variable, a negative p toward smaller values.', 'Then the sign of p picks the side: a positive p opens toward larger values of the other variable, a negative p toward smaller values.'],
];

const HINTS = Object.freeze({
  absEquation: absHints,
  vertex: vertexHints,
  zeros: zerosHints,
  factorZero: factorZeroHints,
  multiplyArea: areaHints,
  factorQuadratic: factorQuadraticHints,
  division: divisionHints,
  graphConnection: graphConnectionHints,
  rationalFeatures: rationalHints,
  parabolaFeatures: parabolaFeaturesHints,
  parabolaEquidistance: equidistanceHints,
  parabolaFromGeometry: fromGeometryHints,
  parabolaEquation: parabolaEquationHints,
});

export const hints = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    const guard = choiceGuardFor(question, model);
    return unique(spellingsFor(model, HINTS[model.kind](model)).map(choose(guard)).filter(Boolean));
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * backUpQuestion: the first move, never the answer.
 * ------------------------------------------------------------------------- */

const twoChoice = (guard, variants) => {
  for (const variant of variants) {
    if (!variant) continue;
    const { prompt, correct, wrong } = variant;
    if ([prompt, correct, wrong].some((value) => !text(value) || hintRevealsAnswer(value, guard))) continue;
    if (correct === wrong) continue;
    const options = hash(prompt) % 2 ? [wrong, correct] : [correct, wrong];
    return { prompt, options, correct };
  }
  return null;
};

const backUpVariants = (model) => {
  switch (model.kind) {
    case 'absEquation': {
      const equation = absEquationText(model);
      const abs = `|${insideText(model)}|`;
      if (!equals(model.A, ONE) || !isZero(model.K)) {
        return [
          { prompt: `Let’s back up. In ${equation}, what comes first?`, correct: `Get ${abs} alone on one side`, wrong: 'Split it into two equations right away' },
          { prompt: 'Let’s back up. In this equation, what comes first?', correct: 'Get the absolute value alone on one side', wrong: 'Split it into two equations right away' },
        ];
      }
      return [
        { prompt: `Let’s back up. In ${equation}, what does ${abs} measure?`, correct: 'A distance, which is never negative', wrong: 'A number that can be negative' },
        { prompt: 'Let’s back up. What does an absolute value measure?', correct: 'A distance, which is never negative', wrong: 'A number that can be negative' },
      ];
    }
    case 'vertex':
      if (model.vertexForm) {
        return [{ prompt: `Let’s back up. In ${vertexFormText(model.a, model.vertex[0], model.vertex[1], model.name)}, which part tells you the x-coordinate of the vertex?`, correct: 'The number inside the parentheses with x', wrong: 'The number in front of the parentheses' },
          { prompt: 'Let’s back up. In vertex form, which part tells you the x-coordinate of the vertex?', correct: 'The number inside the parentheses with x', wrong: 'The number in front of the parentheses' }];
      }
      return [{ prompt: `Let’s back up. For ${vertexEquationText(model)}, what do you find first?`, correct: 'The x-coordinate, from x = -b/(2a)', wrong: 'The y-intercept c' },
        { prompt: 'Let’s back up. For a quadratic in standard form, what do you find first?', correct: 'The x-coordinate: the opposite of b divided by twice a', wrong: 'The y-intercept c' }];
    case 'zeros':
      return [{ prompt: `Let’s back up. To find the zeros of f(x) = ${polyText([model.a, model.b, model.c])}, what do you set equal to zero?`, correct: 'The whole expression f(x)', wrong: 'The variable x' },
        { prompt: 'Let’s back up. To find the zeros of f, what do you set equal to zero?', correct: 'The whole expression f(x)', wrong: 'The variable x' }];
    case 'factorZero': {
      // A plain-only view (see VERDICT VIEWS): the numbered variant is never offered.
      return [
        { prompt: 'Let’s back up. To test whether (x - r) is a factor of P(x), which value do you substitute?', correct: 'The number that makes the factor zero', wrong: 'The opposite of that number' },
      ];
    }
    case 'multiplyArea':
      return [{ prompt: `Let’s back up. In the area model for (${binomialText(model.left)})(${binomialText(model.right)}), what goes in the top-left cell?`, correct: `${monomial(model.left[0], 1)} times ${monomial(model.right[0], 1)}`, wrong: `${monomial(model.left[0], 1)} plus ${monomial(model.right[0], 1)}` },
        { prompt: 'Let’s back up. In an area model, what goes in each cell?', correct: 'The row term times the column term', wrong: 'The row term plus the column term' }];
    case 'factorQuadratic':
      return [{ prompt: `Let’s back up. For ${polyText([ONE, model.b, model.c])} = (x + p)(x + q), what must p and q multiply to?`, correct: num(model.c), wrong: num(model.b) },
        { prompt: 'Let’s back up. For x² + bx + c = (x + p)(x + q), what must p and q multiply to?', correct: 'The constant term', wrong: 'The x-coefficient' }];
    case 'division':
      return [{ prompt: `Let’s back up. What is the first move in dividing ${polyText(model.dividend)} by ${polyText(model.divisor)}?`, correct: 'Divide the leading terms', wrong: 'Divide the constant terms' },
        { prompt: 'Let’s back up. What is the first move in polynomial long division?', correct: 'Divide the leading terms', wrong: 'Divide the constant terms' }];
    case 'graphConnection':
      return [{ prompt: `Let’s back up. What decides how the graph behaves at the zero x = ${num(model.target.root)}?`, correct: 'The multiplicity of that zero', wrong: 'The leading coefficient' },
        { prompt: 'Let’s back up. What decides how the graph behaves at the target zero?', correct: 'The multiplicity of that zero', wrong: 'The leading coefficient' }];
    case 'rationalFeatures':
      return [{ prompt: `Let’s back up. What do you check first about x = ${num(model.target)}?`, correct: 'Whether it is a root of the numerator, the denominator, or both', wrong: 'Whether it is positive or negative' },
        { prompt: 'Let’s back up. What do you check first about the target value?', correct: 'Whether it is a root of the numerator, the denominator, or both', wrong: 'Whether it is positive or negative' }];
    case 'parabolaFeatures':
      return [{ prompt: 'Let’s back up. Starting from the vertex, how do you reach the focus?', correct: 'Step |p| units along the axis, toward the inside of the curve', wrong: 'Step |p| units along the axis, away from the curve' }];
    case 'parabolaEquidistance':
      return [{ prompt: 'Let’s back up. How is the distance from P to the directrix measured?', correct: 'Straight across, perpendicular to the directrix', wrong: 'Along a slanted line to any point of the directrix' }];
    case 'parabolaFromGeometry':
      return [{ prompt: 'Let’s back up. Where is the vertex of the parabola?', correct: 'Halfway between the focus and the directrix', wrong: 'At the focus' }];
    case 'parabolaEquation':
      // "Let’s back up" would put the word "up", one of this view's answers, in every prompt.
      return [{ prompt: `Before you go on: which variable is squared in ${labEquationText(model)}?`, correct: model.vertical ? 'x' : 'y', wrong: model.vertical ? 'y' : 'x' },
        { prompt: 'Before you go on: what tells you whether the parabola opens vertically or horizontally?', correct: 'Which variable is squared', wrong: 'The sign of p alone' }];
    default:
      return [];
  }
};

export const backUpQuestion = (question) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    return twoChoice(choiceGuardFor(question, model), backUpVariants(model));
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * similarProblem: the same task on new numbers, worked in full.
 * ------------------------------------------------------------------------- */

const MAX_SIBLING_ATTEMPTS = 800;
const STANDALONE_ZERO = /(^|[^\d.])0(?![\d.]*\d)/;

const numericValue = (value) => {
  const cleaned = text(value).replace(/−/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const fraction = cleaned.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

/**
 * The platform's similarExampleIsSafe checks, against this family's wider guard, and no
 * standalone 0. With strictPrompt the sibling's PROMPT must avoid this question's
 * numeric answers too (the platform lets a sibling's givens hold numbers); firstSafe
 * asks for that first and settles for the platform's rule only when no candidate meets it.
 */
const siblingIsSafe = (question, guard, example, strictPrompt) => {
  if (!example) return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = list(example.steps).map(text).filter(Boolean);
  if (!prompt || !answer || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  if (guard.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const answerValue = numericValue(answer);
  if (answerValue !== null && guard.some((value) => numericValue(value) !== null && Math.abs(numericValue(value) - answerValue) < 1e-9)) return false;
  if (steps.some((step) => hintRevealsAnswer(step, guard))) return false;
  if (hintRevealsAnswer(answer, guard)) return false;
  // ("4p", the name of the lab's quantity, is a name, not the number 4.)
  const promptGuard = strictPrompt ? guard : guard.filter((value) => numericValue(value) === null);
  if (hintRevealsAnswer(prompt.replace(/\b4p\b/g, 'four-p'), promptGuard)) return false;
  if ([prompt, answer, ...steps].some((value) => STANDALONE_ZERO.test(value))) return false;
  return true;
};

/** Walk a fixed candidate list from a start set by the seed and the prompt (never the key). */
const firstSafe = (question, model, seed, candidates, build) => {
  if (!candidates.length) return null;
  const guard = choiceGuardFor(question, model);
  const start = hash(`${model.kind}|${model.mode || model.source || ''}|${text(question?.prompt)}|${Math.trunc(Number(seed) || 0)}`) % candidates.length;
  // Stride through the list (a step coprime to its length), so the walk leaves a run of
  // candidates that share one number instead of testing them all.
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const step = [7919, 104729, 1299709, 1].find((prime) => gcd(prime, candidates.length) === 1);
  const built = new Map();
  const at = (index) => {
    if (!built.has(index)) {
      let example = null;
      try {
        example = build(candidates[(start + (index * step)) % candidates.length]);
      } catch {
        example = null;
      }
      built.set(index, example);
    }
    return built.get(index);
  };
  for (const strictPrompt of [true, false]) {
    for (let index = 0; index < Math.min(candidates.length, MAX_SIBLING_ATTEMPTS); index += 1) {
      const example = at(index);
      if (example && siblingIsSafe(question, guard, example, strictPrompt)) return example;
    }
  }
  return null;
};

const ints = (...values) => values.map((value) => R(value));
const signedTail = (value) => (isZero(value) ? '' : ` ${neg(value) ? '-' : '+'} ${num(absolute(value))}`);
/** "2(5) - 3", "(-7) + 2": the inside of the bars at a value. */
const linearAt = (m, b, x) => `${equals(m, ONE) ? paren(x) : equals(m, MINUS_ONE) ? `-${paren(x)}` : `${num(m)}(${num(x)})`}${signedTail(b)}`;

const siblingAbs = (question, model, seed) => {
  const lead = !equals(model.A, ONE);
  const shifted = !isZero(model.K);
  const scaled = model.source !== 'family' && !equals(model.m, ONE);
  const As = lead ? ints(2, 3, 4, 5, -2, -3) : [ONE];
  const Ks = shifted ? ints(-5, -4, -3, -2, 2, 3, 4, 5, 6, 7) : [ZERO];
  const ms = scaled ? ints(2, 3, -2, 4) : [ONE];
  const candidates = product(As, Ks, ms, ints(-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6), ints(1, 2, 3, 4, 5, 6, 7));
  return firstSafe(question, model, seed, candidates, ([A, K, m, center, t]) => {
    const b = negate(multiply(m, center));
    const D = multiply(absolute(m), t);
    const C = add(multiply(A, D), K);
    if (isZero(b) || isZero(C)) return null;
    const sibling = { A, m, b, K, C, variable: 'x' };
    const equation = absEquationText(sibling);
    const abs = `|${insideText(sibling)}|`;
    const steps = [];
    if (!isZero(K)) steps.push(`${neg(K) ? `Add ${num(absolute(K))} to` : `Subtract ${num(K)} from`} both sides: ${absLead(A)}${abs} = ${num(subtract(C, K))}.`);
    if (!equals(A, ONE)) steps.push(`Divide both sides by ${num(A)}: ${abs} = ${num(D)}.`);
    steps.push(`${num(D)} is positive, so split into two equations: ${insideText(sibling)} = ${num(D)} or ${insideText(sibling)} = ${num(negate(D))}.`);
    const solve = (target) => {
      const x = divide(subtract(target, b), m);
      if (equals(m, ONE)) return { x, textValue: `${insideText(sibling)} = ${num(target)} gives x = ${num(x)}` };
      return { x, textValue: `${insideText(sibling)} = ${num(target)} gives ${monomial(m, 1)} = ${num(subtract(target, b))}, so x = ${num(x)}` };
    };
    const plus = solve(D);
    const minus = solve(negate(D));
    steps.push(`Solve each: ${plus.textValue}; ${minus.textValue}.`);
    const values = [plus.x, minus.x].sort((x, y) => toNumber(x) - toNumber(y));
    steps.push(`Check: |${linearAt(m, b, values[0])}| = |${num(add(multiply(m, values[0]), b))}| = ${num(D)} and |${linearAt(m, b, values[1])}| = |${num(add(multiply(m, values[1]), b))}| = ${num(D)}, so both values make ${equation} true.`);
    return {
      prompt: model.source === 'family' ? `Solve ${equation}. Enter the smaller solution first.` : `Solve ${equation}.`,
      steps,
      answer: `x = ${num(values[0])} or x = ${num(values[1])}`,
    };
  });
};

/** "2(3)² - 8(3) + 5" and "18 - 24 + 5": a polynomial at a value, and its term values. */
const substitution = (coefficients, x) => {
  const shown = [];
  const values = [];
  coefficients.forEach((coefficient, index) => {
    const degree = coefficients.length - 1 - index;
    if (isZero(coefficient)) return;
    const magnitude = absolute(coefficient);
    const lead = degree === 0 ? num(magnitude) : equals(magnitude, ONE) ? '' : num(magnitude);
    const body = degree === 0 ? lead : `${lead}(${num(x)})${degree > 1 ? SUPERSCRIPTS[degree] : ''}`;
    let value = coefficient;
    for (let k = 0; k < degree; k += 1) value = multiply(value, x);
    shown.push({ negative: neg(coefficient), body });
    values.push(value);
  });
  const join = (parts) => parts.map((part, index) => (index === 0 ? `${part.negative ? '-' : ''}${part.body}` : `${part.negative ? '-' : '+'} ${part.body}`)).join(' ');
  return {
    expression: join(shown),
    terms: join(values.map((value) => ({ negative: neg(value), body: num(absolute(value)) }))),
    total: values.reduce(add, ZERO),
  };
};

const siblingVertex = (question, model, seed) => {
  const unit = equals(absolute(model.a), ONE);
  // A unit-a question gets a unit-a sibling when it can; "a = 1" in a step is ruled out when 1 or -1 is an answer.
  const as = unit ? ints(1, -1, 2, -2, 3, -3) : ints(2, -2, 3, -3, 1, -1);
  const candidates = product(as, ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), ints(-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6));
  return firstSafe(question, model, seed, candidates, ([a, h, k]) => {
    const b = multiply(R(-2), multiply(a, h));
    const c = add(multiply(a, multiply(h, h)), k);
    if (model.vertexForm) {
      const equation = vertexFormText(a, h, k);
      return {
        prompt: `Identify the vertex of ${equation}. Write it as an ordered pair.`,
        steps: [
          `Compare ${equation} with the vertex form y = a(x - h)² + k.`,
          `The squared part ${factorText(h)} is zero when x = ${num(h)}, so h = ${num(h)}.`,
          `The number added after the square is ${num(k)}, so k = ${num(k)}.`,
          `The vertex is (h, k) = ${pt([h, k])}.`,
        ],
        answer: pt([h, k]),
      };
    }
    if (isZero(c)) return null;
    const equation = `y = ${polyText([a, b, c])}`;
    const at = substitution([a, b, c], h);
    return {
      prompt: `Identify the vertex of ${equation}. Write it as an ordered pair.`,
      steps: [
        `Here a = ${num(a)}, b = ${num(b)} and c = ${num(c)}.`,
        `The x-coordinate is the opposite of b divided by twice a: ${num(negate(b))} ÷ ${paren(multiply(TWO, a))} = ${num(h)}.`,
        `The y-coordinate is y = ${at.expression} = ${at.terms} = ${num(at.total)}.`,
        `The vertex is ${pt([h, k])}.`,
      ],
      answer: pt([h, k]),
    };
  });
};

const siblingZeros = (question, model, seed) => {
  const unit = equals(model.a, ONE);
  const as = unit ? [ONE] : equals(model.a, MINUS_ONE) ? [MINUS_ONE] : ints(2, -2, 3, -1);
  const roots = ints(-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6);
  const candidates = product(as, roots, roots).filter(([, r1, r2]) => toNumber(r1) < toNumber(r2));
  return firstSafe(question, model, seed, candidates, ([a, r1, r2]) => {
    const B = negate(add(r1, r2));
    const C = multiply(r1, r2);
    if (isZero(B)) return null;
    const coefficients = [a, multiply(a, B), multiply(a, C)];
    const poly = polyText(coefficients);
    const monic = polyText([ONE, B, C]);
    const steps = [`Set ${poly} equal to zero and factor.`];
    if (equals(a, MINUS_ONE)) steps.push(`Factor out the negative sign: ${poly} = -(${monic}).`);
    else if (!equals(a, ONE)) steps.push(`Factor out ${num(a)}: ${poly} = ${num(a)}(${monic}).`);
    const [p, q] = [negate(r1), negate(r2)];
    steps.push(`${num(p)} and ${num(q)} multiply to ${num(C)} and add to ${num(B)}, so ${monic} = ${factorText(r1)}${factorText(r2)}.`);
    steps.push(`${factorText(r1)} is zero when x = ${num(r1)}, and ${factorText(r2)} is zero when x = ${num(r2)}.`);
    return {
      prompt: `Find the zeros of f(x) = ${poly}. Enter the smaller zero first.`,
      steps,
      answer: `x = ${num(r1)} and x = ${num(r2)}`,
    };
  });
};

const siblingFactorZero = (question, model, seed) => {
  const degree = Math.min(Math.max(model.coefficients.length - 1, 2), 3);
  const values = ints(-4, -3, -2, -1, 1, 2, 3, 4);
  const rootSets = degree === 2
    ? product(values, values).filter(([a, b]) => toNumber(a) < toNumber(b))
    : product(values, values, values).filter(([a, b, c]) => toNumber(a) < toNumber(b) && toNumber(b) < toNumber(c));
  const candidates = product(rootSets, ints(-3, -2, -1, 1, 2, 3));
  return firstSafe(question, model, seed, candidates, ([roots, r]) => {
    const coefficients = roots.reduce((acc, root) => multiplyPolys(acc, [ONE, negate(root)]), [ONE]);
    const poly = polyText(coefficients);
    const factor = factorText(r);
    const at = substitution(coefficients, r);
    const isFactor = isZero(at.total);
    const steps = [
      `Substitute x = ${num(r)}: P(${num(r)}) = ${at.expression}.`,
      `Work out each term: ${at.terms}.`,
      isFactor
        ? `These add to zero, so P(${num(r)}) is zero, and by the Factor Theorem ${factor} is a factor of P(x).`
        : `These add to ${num(at.total)}, which is not zero, so by the Factor Theorem ${factor} is not a factor of P(x).`,
    ];
    return {
      prompt: `Is ${factor} a factor of P(x) = ${poly}? Evaluate P(${num(r)}) to decide.`,
      steps,
      answer: isFactor ? `P(${num(r)}) is zero, so ${factor} is a factor` : `P(${num(r)}) = ${num(at.total)}, so ${factor} is not a factor`,
    };
  });
};

const siblingArea = (question, model, seed) => {
  const candidates = product(ints(1, 2, 3, 4, 5), ints(-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6), ints(1, 2, 3, 4), ints(-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6));
  return firstSafe(question, model, seed, candidates, ([a, b, c, d]) => {
    const cells = [multiply(a, c), multiply(a, d), multiply(b, c), multiply(b, d)];
    const middle = add(cells[1], cells[2]);
    if (isZero(middle)) return null;
    if (equals(a, model.left[0]) && equals(b, model.left[1]) && equals(c, model.right[0]) && equals(d, model.right[1])) return null;
    const left = [a, b];
    const right = [c, d];
    const productList = [cells[0], middle, cells[3]];
    const poly = polyText(productList);
    return {
      prompt: `Use an area model to multiply (${binomialText(left)})(${binomialText(right)}).`,
      steps: [
        `Top-left cell: ${monomial(a, 1)} × ${monomial(c, 1)} = ${monomial(cells[0], 2)}.`,
        `Top-right cell: ${monomial(a, 1)} × ${paren(d)} = ${monomial(cells[1], 1)}.`,
        `Bottom-left cell: ${num(b)} × ${monomial(c, 1)} = ${monomial(cells[2], 1)}.`,
        `Bottom-right cell: ${num(b)} × ${paren(d)} = ${num(cells[3])}.`,
        `The x-terms combine: ${num(cells[1])} + ${paren(cells[2])} = ${num(middle)}, so the product is ${poly}.`,
      ],
      answer: `${poly} (coefficients ${listText(productList)})`,
    };
  });
};

const siblingFactorQuadratic = (question, model, seed) => {
  const repeated = equals(model.pair[0], model.pair[1]);
  const values = ints(-7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7);
  const candidates = repeated
    ? values.map((value) => [value, value])
    : product(values, values).filter(([p, q]) => toNumber(p) < toNumber(q));
  return firstSafe(question, model, seed, candidates, ([p, q]) => {
    const B = add(p, q);
    const C = multiply(p, q);
    if (isZero(B)) return null;
    const poly = polyText([ONE, B, C]);
    return {
      prompt: `Find p and q so that ${poly} = (x + p)(x + q).`,
      steps: [
        `We need p + q = ${num(B)} and p × q = ${num(C)}.`,
        `Go through the factor pairs of ${num(C)}, positive and negative, and look for the one that adds to ${num(B)}.`,
        `${num(p)} and ${num(q)} work: ${num(p)} + ${paren(q)} = ${num(B)} and ${num(p)} × ${paren(q)} = ${num(C)}. No other factor pair of ${num(C)} has that sum.`,
        `So ${poly} = ${factorText(negate(p))}${factorText(negate(q))}, with p = ${num(p)} and q = ${num(q)}.`,
      ],
      answer: `p = ${num(p)}, q = ${num(q)}`,
    };
  });
};

const siblingDivision = (question, model, seed) => {
  const candidates = product(ints(1, 2), ints(-4, -3, -2, -1, 1, 2, 3, 4), ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), ints(-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6), ints(-7, -5, -3, -2, -1, 1, 2, 3, 5, 7));
  return firstSafe(question, model, seed, candidates, ([q2, r, q1, q0, remainder]) => {
    const divisor = [ONE, negate(r)];
    const dividend = [q2, subtract(q1, multiply(r, q2)), subtract(q0, multiply(r, q1)), subtract(remainder, multiply(r, q0))];
    if (dividend.some(isZero)) return null;
    const div = polyText(divisor);
    const quotient = [q2, q1, q0];
    const stage = (coefficient, degree) => ({
      term: monomial(coefficient, degree),
      productTerms: polyText([coefficient, multiply(coefficient, negate(r)), ...Array(degree).fill(ZERO)]),
    });
    const s2 = stage(q2, 2);
    const s1 = stage(q1, 1);
    const s0 = stage(q0, 0);
    return {
      prompt: `Divide ${polyText(dividend)} by ${div}. Give the quotient and the remainder.`,
      steps: [
        `Divide the leading terms: ${monomial(dividend[0], 3)} ÷ x = ${s2.term}.`,
        `Multiply: ${s2.term}(${div}) = ${s2.productTerms}. Subtract it from ${polyText([dividend[0], dividend[1], ZERO, ZERO])}: that leaves ${monomial(q1, 2)}. Bring down ${monomial(dividend[2], 1)}.`,
        `Divide: ${monomial(q1, 2)} ÷ x = ${s1.term}. Multiply: ${s1.term}(${div}) = ${s1.productTerms}. Subtract it from ${polyText([q1, dividend[2], ZERO])}: that leaves ${monomial(q0, 1)}. Bring down ${num(dividend[3])}.`,
        `Divide: ${monomial(q0, 1)} ÷ x = ${s0.term}. Multiply: ${s0.term}(${div}) = ${s0.productTerms}. Subtract it from ${polyText([q0, dividend[3]])}: that leaves ${num(remainder)}.`,
        `${num(remainder)} has a lower degree than ${div}, so the quotient is ${polyText(quotient)} and the remainder is ${num(remainder)}.`,
      ],
      answer: `quotient ${polyText(quotient)}, remainder ${num(remainder)}`,
    };
  });
};

const END_PHRASES = Object.freeze({
  evenUp: 'both ends point upward',
  evenDown: 'both ends point downward',
  oddUp: 'the left end points downward and the right end points upward',
  oddDown: 'the left end points upward and the right end points downward',
});

const siblingGraphConnection = (question, model, seed) => {
  const rootPairs = product(ints(-3, -2, -1, 1, 2, 3), ints(-3, -2, -1, 1, 2, 3)).filter(([x, y]) => toNumber(x) < toNumber(y));
  const candidates = product(rootPairs, [1, 2, 3], [1, 2], ints(1, -1, 2, -2, 3, -3), [0, 1]);
  return firstSafe(question, model, seed, candidates, ([[x1, x2], m1, m2, lead, which]) => {
    const roots = [{ root: x1, multiplicity: m1 }, { root: x2, multiplicity: m2 }];
    const target = roots[which];
    const degree = m1 + m2;
    const factors = roots.map((entry) => `${factorText(entry.root)}${entry.multiplicity > 1 ? SUPERSCRIPTS[entry.multiplicity] : ''}`).join('');
    const leadText = equals(lead, ONE) ? '' : equals(lead, MINUS_ONE) ? '-' : num(lead);
    const odd = target.multiplicity % 2 === 1;
    const end = END_PHRASES[`${degree % 2 === 0 ? 'even' : 'odd'}${pos(lead) ? 'Up' : 'Down'}`];
    const atZero = odd ? 'the graph passes through the x-axis' : 'the graph meets the x-axis and turns back without passing through';
    return {
      prompt: `For P(x) = ${leadText}${factors}, describe what the graph does at the zero x = ${num(target.root)}, and describe its end behavior.`,
      steps: [
        `The factor ${factorText(target.root)} appears ${target.multiplicity === 1 ? 'once' : `${target.multiplicity} times`}, so x = ${num(target.root)} has multiplicity ${target.multiplicity}, which is ${odd ? 'odd' : 'even'}: ${atZero} there.`,
        `The degree is ${m1} + ${m2} = ${degree}, which is ${degree % 2 === 0 ? 'even' : 'odd'}, and the leading coefficient ${num(lead)} is ${pos(lead) ? 'positive' : 'negative'}, so ${end}.`,
      ],
      answer: `At x = ${num(target.root)} ${atZero}; ${end}.`,
    };
  });
};

const parabolaGivenText = (h, k, p, vertical) => `vertex ${pt([h, k])} and p = ${num(p)}, with a ${axisWord(vertical)} axis of symmetry`;
const towardWords = (vertical, p) => `toward ${pos(p) ? 'larger' : 'smaller'} ${vertical ? 'y' : 'x'}-values`;

const SIBLING_P = Object.freeze([...ints(-3, -2, -1, 1, 2, 3, 5, -5), R(1, 2), R(-1, 2), R(3, 2), R(-3, 2), R(5, 2), R(-5, 2)]);

const siblingParabolaFeatures = (question, model, seed) => {
  const candidates = product(ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), SIBLING_P);
  return firstSafe(question, model, seed, candidates, ([h, k, p]) => {
    const { vertical } = model;
    const features = parabolaFeaturesOf({ h, k, p, vertical });
    const along = vertical ? k : h;
    const line = `${vertical ? 'y' : 'x'} = ${num(features.directrix.value)}`;
    return {
      prompt: `A parabola has ${parabolaGivenText(h, k, p, vertical)}. Find its focus, its directrix and the length of its latus rectum.`,
      steps: [
        `p = ${num(p)} is ${pos(p) ? 'positive' : 'negative'}, so the parabola opens ${towardWords(vertical, p)}.`,
        `Focus: move p along the axis from the vertex: ${vertical ? `(${num(h)}, ${num(k)} + ${paren(p)})` : `(${num(h)} + ${paren(p)}, ${num(k)})`} = ${pt(features.focus)}.`,
        `Directrix: move p the other way: ${vertical ? 'y' : 'x'} = ${num(along)} - ${paren(p)} = ${num(features.directrix.value)}, so the directrix is ${line}.`,
        `Latus rectum: its length is four times |p|, four times ${num(absolute(p))}, which is ${num(features.latus)}.`,
      ],
      answer: `focus ${pt(features.focus)}, directrix ${line}, latus rectum ${num(features.latus)}`,
    };
  });
};

const siblingEquidistance = (question, model, seed) => {
  const candidates = product(ints(-5, -3, -2, -1, 1, 2, 3, 5), ints(-5, -3, -2, -1, 1, 2, 3, 5), ints(1, 2, -1, -2, 3, -3), ints(2, 4, -2, -4, 6, -6, 12, -12));
  return firstSafe(question, model, seed, candidates, ([h, k, p, offset]) => {
    const { vertical } = model;
    const shift = divide(multiply(offset, offset), multiply(FOUR, p));
    if (!isInteger(shift)) return null;
    const point = vertical ? [add(h, offset), add(k, shift)] : [add(h, shift), add(k, offset)];
    const features = parabolaFeaturesOf({ h, k, p, vertical });
    const dx = subtract(point[0], features.focus[0]);
    const dy = subtract(point[1], features.focus[1]);
    const squared = add(multiply(dx, dx), multiply(dy, dy));
    const distance = squareRoot(squared);
    if (!distance) return null;
    const line = `${vertical ? 'y' : 'x'} = ${num(features.directrix.value)}`;
    const across = absolute(subtract(vertical ? point[1] : point[0], features.directrix.value));
    return {
      prompt: `A parabola has ${parabolaGivenText(h, k, p, vertical)}. Find the distance from P = ${pt(point)} to the focus and to the directrix, and decide whether P is on the parabola.`,
      steps: [
        `The focus is ${pt(features.focus)} and the directrix is ${line}.`,
        `Distance to the focus: √((${num(point[0])} - ${paren(features.focus[0])})² + (${num(point[1])} - ${paren(features.focus[1])})²) = √(${num(multiply(dx, dx))} + ${num(multiply(dy, dy))}) = √${num(squared)} = ${num(distance)}.`,
        `Distance to the directrix: |${num(vertical ? point[1] : point[0])} - ${paren(features.directrix.value)}| = ${num(across)}.`,
        `The two distances are equal, so P is on the parabola.`,
      ],
      answer: `both distances are ${num(distance)}, so P is on the parabola`,
    };
  });
};

const siblingFromGeometry = (question, model, seed) => {
  const candidates = product(ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), ints(-5, -3, -2, -1, 1, 2, 3, 5));
  return firstSafe(question, model, seed, candidates, ([h, k, p]) => {
    const { vertical } = model;
    const focus = vertical ? [h, add(k, p)] : [add(h, p), k];
    const d = vertical ? subtract(k, p) : subtract(h, p);
    const along = vertical ? focus[1] : focus[0];
    const line = `${vertical ? 'y' : 'x'} = ${num(d)}`;
    const middle = vertical ? k : h;
    const side = vertical ? (pos(p) ? 'above' : 'below') : (pos(p) ? 'to the right of' : 'to the left of');
    return {
      prompt: `Find the vertex (h, k) and the value of p for the parabola with focus ${pt(focus)} and directrix ${line}.`,
      steps: [
        vertical
          ? `The directrix ${line} is horizontal, so the axis of symmetry is the vertical line through the focus: h = ${num(h)}.`
          : `The directrix ${line} is vertical, so the axis of symmetry is the horizontal line through the focus: k = ${num(k)}.`,
        `The vertex is halfway between the focus and the directrix: ${vertical ? 'k' : 'h'} is the average of ${num(along)} and ${num(d)}, which is ${num(middle)}.`,
        `p = ${num(along)} - ${paren(middle)} = ${num(p)}: the focus is ${side} the vertex.`,
      ],
      answer: `h = ${num(h)}, k = ${num(k)}, p = ${num(p)}`,
    };
  });
};

const siblingParabolaEquation = (question, model, seed) => {
  const candidates = product(ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), ints(-5, -4, -3, -2, -1, 1, 2, 3, 4, 5), SIBLING_P);
  return firstSafe(question, model, seed, candidates, ([h, k, p]) => {
    const { vertical } = model;
    const equation = standardParabolaText(h, k, vertical);
    const coefficient = multiply(FOUR, p);
    return {
      prompt: `The parabola ${equation} has vertex ${pt([h, k])} and p = ${num(p)}. Find the value of 4p and the direction it opens.`,
      steps: [
        `The value asked for is four times p: four times ${paren(p)} is ${num(coefficient)}.`,
        `${vertical ? 'x' : 'y'} is squared, so the parabola opens ${vertical ? 'vertically' : 'horizontally'}; p is ${pos(p) ? 'positive' : 'negative'}, so it opens ${towardWords(vertical, p)}.`,
      ],
      answer: `four times p is ${num(coefficient)}; it opens ${towardWords(vertical, p)}`,
    };
  });
};

const SIBLINGS = Object.freeze({
  absEquation: siblingAbs,
  vertex: siblingVertex,
  zeros: siblingZeros,
  factorZero: siblingFactorZero,
  multiplyArea: siblingArea,
  factorQuadratic: siblingFactorQuadratic,
  division: siblingDivision,
  graphConnection: siblingGraphConnection,
  rationalFeatures: () => null,
  parabolaFeatures: siblingParabolaFeatures,
  parabolaEquidistance: siblingEquidistance,
  parabolaFromGeometry: siblingFromGeometry,
  parabolaEquation: siblingParabolaEquation,
});

export const similarProblem = (question, { seed = 0 } = {}) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    return SIBLINGS[model.kind](question, model, seed);
  } catch {
    return null;
  }
};
