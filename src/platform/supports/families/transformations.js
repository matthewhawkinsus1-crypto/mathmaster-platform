// Question family: function transformations: transformationsLab, and multiAnswer transformation items (teacher-import-jsons L2_*Transformations).
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
// WHAT THIS FAMILY OWNS (eighth in the index order; none of the seven before
// it claims a transformationsLab item or a transformation-description item).
//
// The Transformations Lab (`transformationsLab`, by type or toolId). The
// question is read by resolveTransformationsQuestion — the reader the lab draws
// from and the shared grader marks from — so the family, a, b, h, k, base,
// parent point and source points below are the graded ones. Each mode is
// claimed only where what the student SEES fixes what the grader marks (job A:
// the identify/describe grader marks the question's own a, b, h, k even where
// the graph does not determine them):
//
//   match          any family, unless the target has an inside multiplier b ≠ 1
//                  and the lab shows no b box (no box values can draw it).
//                  Match is graded by the graph itself, so every hint speaks of
//                  features of the graph, never of one parameterisation.
//   identify       a, h, k read off the graph: only the families whose graph
//                  fixes them once b = 1 (quadratic, absolute, cubic, cube root,
//                  square root, rational, logarithmic), with b = 1 and no b box.
//                  NOT linear (a line has no distinguished point) and NOT
//                  exponential (2·2^(x−1) is 2^x: a and h trade off).
//   describe       the same readable families with b = 1, ONLY when the prompt
//                  states the transformation. The describe panel asks for the
//                  y-axis reflection and the horizontal scale too, and the graph
//                  alone does not fix them (2|x − 1| = |2(x − 1)|,
//                  log₂(x) + 1 = log₂(2x)).
//   pointMap       the same readable families with b = 1, ONLY when the prompt
//                  states the transformation (the graph alone fixes it only
//                  under an unstated b = 1: (x − 3)² − 2 is (−(x − 3))² − 2);
//                  the parent point is the [x, y] pair the lab prints.
//   plotTransform  any family, ONLY when the prompt states the transformation —
//                  the lab draws only the source points.
//   "States the transformation" (statedTransformation): the prompt writes a
//   y = / g(x) = equation, in the family's notation (2(x − 1)³ − 1,
//   0.5√(x − 3) + 2, −|x − 2| + 3, 3/(x + 1) + 2, log₂(x) + 1) or as
//   A·f(B(x − C)) + D of a named f, g or h, that is not the parent itself;
//   EVERY such equation the prompt writes must be exactly the graded a, b, h, k.
//   anchor         the families whose defining feature is a shape of the graph
//                  (vertex, inflection point, endpoint, asymptote intersection:
//                  any b), and the logarithm's reference point when b = 1.
//
// multiAnswer transformation descriptions ("Describe g(x)=−2f(x−1)+3.",
// "Analyze y=−2|x+3|+1."): choice fields about translations, scales,
// reflections, the vertex and the range of ONE written transformation
// g(x) = A·f(B(x − C)) + D (or A|B(x − C)| + D). Claimed only when the prompt
// holds exactly one such equation, every field is one this family recognises,
// and for every field exactly one option is the family's own reading of the
// equation and that option IS the authored key. Anything else (an unknown
// field, f(2x + 4) — whose "horizontal shift" teachers read two ways — a
// decimal option, a key that disagrees) is not claimed.
//
// SAFETY.
//   - Every hint and back-up text is written twice: a numbered spelling that
//     quotes this problem's own givens (the parent's points, the parent point to
//     map, the first source point, the written equation) and a plain spelling,
//     with no digits at all, that names the move. The numbered spelling is used
//     unless hintRevealsAnswer (the platform's own guard) finds one of this
//     question's answers in it — against expectedValues plus every plain key —
//     and a text that fails both is dropped. No hint states a, b, h or k, a
//     mapped point, a defining feature, an asymptote or a description.
//   - expectedValues lists what the student must FIND, in every spelling a hint
//     could use. For a verdict (the describe mode's choices; a multiAnswer
//     choice field) EVERY verdict the student can pick is listed, so a hint can
//     name none of them and its silence tells nothing.
//   - The worked sibling has new numbers drawn deterministically from the seed
//     and this question, and is offered only when its prompt, every step and
//     its answer avoid this question's answers. A verdict item (describe; a
//     multiAnswer item with a reflection, scale, kind, vertex or range field)
//     has NO sibling: a worked description states verdict phrases, and every
//     one of them is an option of this question. A multiAnswer item about
//     translations only gets a sibling whose every shift is non-zero and whose
//     distances differ from this question's.
//
// Pure: no React, no I/O. Exact rational arithmetic (questionFamilyExact).
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
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
import { resolveTransformationsQuestion } from '../../../../functions/shared/toolMath/transformations/transformationsMath.mjs';

export const family = 'transformations';
export const implemented = true;

// The lab's six modes (TransformationsLab.jsx matches them with `mode ===`).
const LAB_MODES = Object.freeze(['match', 'identify', 'pointMap', 'plotTransform', 'describe', 'anchor']);
// The defining feature at the parent's origin: a shape of the graph, so it
// lands at (h, k) whatever a and b are.
const ORIGIN_FEATURES = Object.freeze({
  quadratic: 'vertex',
  absolute: 'vertex',
  cubic: 'inflection point',
  cubeRoot: 'inflection point',
  squareRoot: 'endpoint',
  rational: 'asymptote intersection',
});
// Families whose graph fixes a, h and k once b = 1.
const READABLE_FAMILIES = new Set(['quadratic', 'absolute', 'cubic', 'cubeRoot', 'squareRoot', 'rational', 'logarithmic']);
const FEATURE_WHERE = Object.freeze({
  vertex: 'the point where the graph turns',
  'inflection point': 'the point where the graph changes the way it bends',
  endpoint: 'the point where the graph starts',
});
const FAMILY_LABELS = Object.freeze({
  linear: 'linear',
  quadratic: 'quadratic',
  absolute: 'absolute value',
  cubic: 'cubic',
  cubeRoot: 'cube root',
  squareRoot: 'square root',
  exponential: 'exponential',
  logarithmic: 'logarithmic',
  rational: 'reciprocal',
});

// Every choice the lab's describe mode offers, as the grader stores it.
export const DESCRIBE_VERDICTS = Object.freeze(['yes', 'no', 'stretch', 'compression', 'unchanged', 'left', 'right', 'none', 'up', 'down']);

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');

const hash = (value) => {
  let h = 2166136261;
  for (const character of String(value)) {
    h ^= character.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/* ---------------------------------------------------------------------------
 * Exact numbers. The lab's fields are numbers (0.5, -2) or numeric strings.
 * ------------------------------------------------------------------------- */

const exact = (value) => {
  try {
    if (isObject(value) && 'n' in value && 'd' in value) return rational(value.n, value.d);
    if (typeof value === 'string') {
      const cleaned = ascii(value).replace(/\s+/g, '');
      if (!cleaned) return null;
      const slash = /^(-?\d+)\/(-?\d+)$/.exec(cleaned);
      if (slash) return Number(slash[2]) ? rational(Number(slash[1]), Number(slash[2])) : null;
      if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
      return exact(Number(cleaned));
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    for (let d = 1; d <= 1000; d += 1) {
      const n = Math.round(value * d);
      if (Math.abs(n / d - value) <= 1e-9 * Math.max(1, Math.abs(value))) return rational(n, d);
    }
  } catch { /* not an exact number */ }
  return null;
};

/** "3", "-3", "3/2" — ASCII minus, so the guard's numeric boundaries read it. */
const show = (value) => rationalText(value);
// Negatives and fractions in parentheses, so 5 ÷ (1/2) never reads as (5 ÷ 1)/2.
const paren = (value) => (value.n < 0 || value.d !== 1 ? `(${show(value)})` : show(value));
const isNegative = (value) => value.n < 0;
const R = (value) => exact(value);
const MINUS_ONE = rational(-1);

const decimalText = (value) => {
  let d = value.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d !== 1 || value.d === 1) return '';
  return String(Number((value.n / value.d).toFixed(10)));
};
const roundedTexts = (value) => {
  if (value.d === 1 || decimalText(value)) return [];
  const number = value.n / value.d;
  return [number.toFixed(2), number.toFixed(3)].map((entry) => String(Number(entry)));
};

const withUnicodeMinus = (value) => (value.includes('-') ? [value, value.replace(/-/g, '−')] : [value]);

/** Every spelling of one number a hint could contain. */
const numberForms = (value) => {
  if (!value) return [];
  const forms = [rationalText(value), rationalLatex(value), ...roundedTexts(value)];
  const decimal = decimalText(value);
  if (decimal) forms.push(decimal);
  forms.slice().forEach((form) => { if (/^-?0\./.test(form)) forms.push(form.replace('0.', '.')); });
  return unique(forms.flatMap(withUnicodeMinus));
};

const coordinateForms = (value) => unique([rationalText(value), decimalText(value), ...roundedTexts(value)]);

/** Every spelling of one ordered pair a hint could contain. */
const pairForms = (point) => {
  if (!point) return [];
  const out = [];
  coordinateForms(point[0]).forEach((a) => coordinateForms(point[1]).forEach((b) => out.push(`(${a}, ${b})`, `(${a},${b})`)));
  return unique(out.flatMap(withUnicodeMinus));
};

const equationForms = (equation) => unique([equation, equation.replace(/\s+/g, '')].flatMap(withUnicodeMinus));
const lineEquationForms = (variable, value) => coordinateForms(value).flatMap((entry) => equationForms(`${variable} = ${entry}`));

const pt = ([x, y]) => `(${show(x)}, ${show(y)})`;
const units = (value) => `${show(absolute(value))} unit${equals(absolute(value), ONE) ? '' : 's'}`;

/* ---------------------------------------------------------------------------
 * Writing a transformed function: y = a·f(b(x − h)) + k.
 * ------------------------------------------------------------------------- */

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const baseText = (base) => (isInteger(base) && base.n > 0 ? show(base) : `(${show(base)})`);
const logName = (base) => (isInteger(base) && base.n > 1
  ? `log${String(base.n).split('').map((digit) => SUBSCRIPTS[Number(digit)]).join('')}`
  : `log_${baseText(base)}`);

const shiftText = (h) => (isZero(h) ? 'x' : `x ${isNegative(h) ? '+' : '-'} ${show(absolute(h))}`);
/** b(x − h), as written: "x - 3", "2x", "-(x + 1)", "(1/2)(x - 3)". */
const insideText = (b, h) => {
  const shift = shiftText(h);
  if (equals(b, ONE)) return { text: shift, simple: isZero(h) };
  const coefficient = equals(b, MINUS_ONE) ? '-' : isInteger(b) ? show(b) : `(${show(b)})`;
  return { text: isZero(h) ? `${coefficient}x` : `${coefficient}(${shift})`, simple: false };
};
const tailText = (k) => (isZero(k) ? '' : ` ${isNegative(k) ? '-' : '+'} ${show(absolute(k))}`);
const leadText = (a) => (equals(a, ONE) ? '' : equals(a, MINUS_ONE) ? '-' : isInteger(a) ? show(a) : `(${show(a)})`);

const coreText = (type, inside, base) => {
  const { text: body, simple } = inside;
  if (type === 'quadratic') return simple ? 'x²' : `(${body})²`;
  if (type === 'cubic') return simple ? 'x³' : `(${body})³`;
  if (type === 'absolute') return `|${body}|`;
  if (type === 'squareRoot') return simple ? '√x' : `√(${body})`;
  if (type === 'cubeRoot') return simple ? '∛x' : `∛(${body})`;
  if (type === 'exponential') return `${baseText(base)}^${simple ? 'x' : `(${body})`}`;
  if (type === 'logarithmic') return `${logName(base)}(${body})`;
  return null;
};

/** The right-hand side of y = a·f(b(x − h)) + k for one lab family. */
const rightSide = (type, { a, b, h, k }, base) => {
  const inside = insideText(b, h);
  let body;
  if (type === 'linear') {
    if (inside.simple) body = `${leadText(a)}x`;
    else body = equals(a, ONE) && isZero(k) ? inside.text : `${leadText(a)}(${inside.text})`;
  } else if (type === 'rational') {
    const denominator = inside.simple ? 'x' : `(${inside.text})`;
    body = isInteger(a) ? `${show(a)}/${denominator}` : `(${show(a)})/${denominator}`;
  } else {
    const core = coreText(type, inside, base);
    if (core === null) return null;
    body = type === 'exponential' && !equals(a, ONE) && !equals(a, MINUS_ONE) ? `${isInteger(a) ? show(a) : `(${show(a)})`}·${core}` : `${leadText(a)}${core}`;
  }
  return `${body}${tailText(k)}`;
};
const equationText = (type, spec, base) => {
  const side = rightSide(type, spec, base);
  return side === null ? null : `y = ${side}`;
};
/** g(x) = a·f(b(x − h)) + k with f a general graph (plotTransform, multiAnswer). */
const generalText = ({ a, b, h, k }, name = 'y') => `${name} = ${leadText(a)}f(${insideText(b, h).text})${tailText(k)}`;

const parentNumbered = (type, base) => ({
  linear: 'y = x',
  quadratic: 'y = x²',
  absolute: 'y = |x|',
  cubic: 'y = x³',
  cubeRoot: 'y = ∛x',
  squareRoot: 'y = √x',
  rational: 'y = 1/x',
  exponential: `y = ${base ? baseText(base) : 'b'}^x`,
  logarithmic: `y = ${base ? logName(base) : 'log'}(x)`,
}[type]);
// No digits at all, so it can never contain a numeric answer.
const parentPlain = (type) => ({
  linear: 'y = x',
  quadratic: 'y = x²',
  absolute: 'y = |x|',
  cubic: 'y = x³',
  cubeRoot: 'y = ∛x',
  squareRoot: 'y = √x',
  rational: 'the reciprocal parent',
  exponential: 'the parent exponential',
  logarithmic: 'the parent logarithm',
}[type]);

/** The parent's exact value at t, or null where it is not rational. */
const exactRoot = (value, power) => {
  const sign = value.n < 0 ? -1 : 1;
  if (sign < 0 && power % 2 === 0) return null;
  const n = Math.round(Math.abs(value.n) ** (1 / power));
  const d = Math.round(value.d ** (1 / power));
  return n ** power === Math.abs(value.n) && d ** power === value.d ? rational(sign * n, d) : null;
};
const parentValue = (type, t, base) => {
  try {
    if (type === 'linear') return t;
    if (type === 'quadratic') return multiply(t, t);
    if (type === 'cubic') return multiply(multiply(t, t), t);
    if (type === 'absolute') return absolute(t);
    if (type === 'squareRoot') return exactRoot(t, 2);
    if (type === 'cubeRoot') return exactRoot(t, 3);
    if (type === 'rational') return isZero(t) ? null : divide(ONE, t);
    if (type === 'exponential' && isInteger(t)) {
      let value = ONE;
      for (let index = 0; index < Math.abs(t.n); index += 1) value = multiply(value, base);
      return t.n < 0 ? divide(ONE, value) : value;
    }
    if (type === 'logarithmic') {
      let value = ONE;
      for (let power = 0; power <= 6; power += 1) {
        if (equals(value, t)) return rational(power);
        value = multiply(value, base);
      }
    }
  } catch { /* not exact */ }
  return null;
};
/** a·f(b(x − h)) + k at x, exactly; null when not rational or undefined. */
const valueAt = (type, spec, base, x) => {
  const inside = multiply(spec.b, subtract(x, spec.h));
  const parent = parentValue(type, inside, base);
  return parent === null ? null : add(multiply(spec.a, parent), spec.k);
};
/** The lab's map of a parent point: (x/b + h, a·y + k). */
const mapPoint = ([x, y], { a, b, h, k }) => [add(divide(x, b), h), add(multiply(a, y), k)];

/* ---------------------------------------------------------------------------
 * Reading the lab question.
 * ------------------------------------------------------------------------- */

const isLab = (question) => text(question?.type) === 'transformationsLab' || text(question?.toolId) === 'transformationsLab';

const pointOf = (point) => {
  const pair = Array.isArray(point) ? [point[0], point[1]] : isObject(point) ? [point.x, point.y] : null;
  if (!pair || pair.some((value) => value === null || value === '' || typeof value === 'boolean')) return null;
  const exacts = pair.map(exact);
  return exacts.every(Boolean) ? exacts : null;
};

const labModel = (question) => {
  const mode = question.mode || 'match';
  if (!LAB_MODES.includes(mode)) return null;
  // The spec this mode reads must be authored: match reads `target`, every
  // other mode `function || target`.
  const authored = mode === 'match' ? question.target : (question.function || question.target);
  if (!isObject(authored)) return null;
  const resolved = resolveTransformationsQuestion(question);
  const raw = mode === 'match' ? resolved.targetSpec : resolved.investigationSpec;
  const type = resolved.family;
  if (!raw || raw.type !== type) return null;
  const spec = { a: exact(raw.a), b: exact(raw.b), h: exact(raw.h), k: exact(raw.k) };
  if (!spec.a || !spec.b || !spec.h || !spec.k || isZero(spec.a) || isZero(spec.b)) return null;
  let base = null;
  if (type === 'exponential' || type === 'logarithmic') {
    base = exact(raw.base);
    if (!base || base.n <= 0 || equals(base, ONE)) return null;
  }
  const unitB = equals(spec.b, ONE);
  const model = { kind: 'lab', mode, type, spec, base, showB: resolved.showB, feature: ORIGIN_FEATURES[type] || null };
  if (mode === 'match') {
    // With no b box the student's b is the lab's fixed 1.
    return !resolved.showB && !unitB ? null : model;
  }
  if (mode === 'identify') return READABLE_FAMILIES.has(type) && !resolved.showB && unitB ? model : null;
  // describe, pointMap and plotTransform: the panel shows no parameters, and the
  // graph does not fix them (2|x − 1| is |2(x − 1)|; log₂(x) + 1 is log₂(2x); the
  // plot mode draws only the source points). So the prompt must STATE the
  // transformation, and what it states must be exactly the graded a, b, h, k.
  if (mode === 'describe' || mode === 'pointMap' || mode === 'plotTransform') {
    const equation = statedTransformation(question.prompt, type, spec, base);
    if (!equation) return null;
    if (mode === 'describe') return READABLE_FAMILIES.has(type) && unitB ? { ...model, equation } : null;
    if (mode === 'pointMap') {
      if (!READABLE_FAMILIES.has(type) || !unitB) return null;
      const given = resolved.parentPoint;
      if (!Array.isArray(given) || given.length < 2) return null;
      const parentPoint = pointOf(given);
      if (!parentPoint) return null;
      return { ...model, equation, parentPoint, image: mapPoint(parentPoint, spec) };
    }
    const sources = resolved.sourcePoints.map(pointOf);
    if (!sources.length || sources.length > 12 || sources.some((point) => !point)) return null;
    return { ...model, equation, sources, images: sources.map((point) => mapPoint(point, spec)) };
  }
  // anchor
  if (model.feature) return { ...model, anchorPoint: [spec.h, spec.k] };
  if (type === 'logarithmic' && unitB) return { ...model, anchorPoint: [add(ONE, spec.h), spec.k] };
  return null;
};

/* ---------------------------------------------------------------------------
 * Reading a multiAnswer transformation description.
 * ------------------------------------------------------------------------- */

const NUM = '\\d+(?:\\.\\d+)?';
const FACTOR = `(?:-|-?${NUM}|-?\\(${NUM}/${NUM}\\)|-?${NUM}/${NUM})`;

const factorValue = (raw) => {
  if (raw === '') return ONE;
  if (raw === '-') return MINUS_ONE;
  const negative = raw.startsWith('-');
  const body = raw.replace(/^-/, '').replace(/^\((.*)\)$/, '$1');
  const value = exact(body);
  if (!value || isZero(value)) return null;
  return negative ? negate(value) : value;
};

/** "x-4", "2x", "-(1/2)(x-3)", "-x" → { b, h }; null for anything else (e.g. 2x+4). */
const parseInside = (inside) => {
  let match = new RegExp(`^x(?:([+-])(${NUM}))?$`).exec(inside);
  if (match) {
    const shift = match[2] ? exact(match[2]) : ZERO;
    return { b: ONE, h: match[1] === '+' ? negate(shift) : shift };
  }
  match = new RegExp(`^(${FACTOR})x$`).exec(inside);
  if (match) {
    const b = factorValue(match[1]);
    return b ? { b, h: ZERO } : null;
  }
  match = new RegExp(`^(${FACTOR})?\\(x([+-])(${NUM})\\)$`).exec(inside);
  if (match) {
    const b = factorValue(match[1] || '');
    const shift = exact(match[3]);
    return b && shift ? { b, h: match[2] === '+' ? negate(shift) : shift } : null;
  }
  return null;
};

/** "2f(-(1/2)(x-3))+4", "-2|x+3|+1" → { A, B, h, k, abs }. */
const parseRightSide = (side) => {
  const source = ascii(side).replace(/\s+/g, '').replace(/[·*]/g, '').replace(/\.$/, '');
  const match = new RegExp(`^(${FACTOR})?(?:f\\((.+)\\)|\\|(.+)\\|)(?:([+-])(${NUM}))?$`).exec(source);
  if (!match) return null;
  const A = factorValue(match[1] || '');
  const inside = parseInside(match[2] ?? match[3]);
  if (!A || !inside) return null;
  const D = match[5] ? exact(match[5]) : ZERO;
  if (!D) return null;
  return { A, B: inside.b, h: inside.h, k: match[4] === '-' ? negate(D) : D, abs: match[3] !== undefined };
};

/** The index just past the parenthesis group that opens at `open`, or -1. */
const closingParen = (source, open) => {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
};

/** Replace every `marker(group)` (the marker before the group) by `f(group)`. */
const prefixToF = (source, marker) => {
  let out = source;
  for (let index = out.indexOf(`${marker}(`); index !== -1; index = out.indexOf(`${marker}(`)) {
    const end = closingParen(out, index + marker.length);
    if (end === -1) return null;
    out = `${out.slice(0, index)}f${out.slice(index + marker.length, end)}${out.slice(end)}`;
  }
  return out;
};

/** Replace every `(group)suffix` (a power after the group) by `f(group)`. */
const suffixToF = (source, suffix) => {
  let out = source;
  for (let index = out.indexOf(`)${suffix}`); index !== -1; index = out.indexOf(`)${suffix}`)) {
    let depth = 0;
    let open = -1;
    for (let scan = index; scan >= 0; scan -= 1) {
      if (out[scan] === ')') depth += 1;
      else if (out[scan] === '(') {
        depth -= 1;
        if (depth === 0) { open = scan; break; }
      }
    }
    if (open === -1) return null;
    out = `${out.slice(0, open)}f${out.slice(open, index + 1)}${out.slice(index + 1 + suffix.length)}`;
  }
  return out;
};

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/**
 * One written right side ("2(x − 1)³ − 1", "0.5√(x − 3) + 2", "−|x−2|+3",
 * "2h(x+1)", "log₂(x + 3) − 1") in the lab family's own notation or as a
 * transformation of a named function, read as { A, B, h, k }; null otherwise.
 */
const parseLabSide = (side, type, base) => {
  let source = ascii(side).replace(/\s+/g, '').replace(/[·*]/g, '').replace(/\.$/, '');
  if (!source) return null;
  // A transformation of a named function: f(…), g(…), h(…).
  source = source.replace(/(^|[^a-z])[fgh]\(/g, '$1f(');
  if (type === 'quadratic') source = suffixToF(source.replace(/x(?:²|\^2)/g, '(x)²').replace(/\^2/g, '²'), '²');
  else if (type === 'cubic') source = suffixToF(source.replace(/x(?:³|\^3)/g, '(x)³').replace(/\^3/g, '³'), '³');
  else if (type === 'squareRoot') source = prefixToF(source.replace(/√x/g, '√(x)').replace(/sqrt\(/g, '√('), '√');
  else if (type === 'cubeRoot') source = prefixToF(source.replace(/∛x/g, '∛(x)').replace(/cbrt\(/g, '∛('), '∛');
  else if (type === 'rational') source = source.replace(/(^|[^\d.)])(\d+(?:\.\d+)?)\/x(?![\d(])/g, '$1$2/(x)').replace(/(^|[^\d.)])(\d+(?:\.\d+)?)\/\(/g, '$1$2f(');
  else if (type === 'logarithmic') {
    const written = /log(?:_\{?(\d+)\}?|([₀-₉]+))?(?=\(|x)/.exec(source);
    if (written) {
      const digits = written[1] ?? (written[2] ? [...written[2]].map((digit) => SUBSCRIPT_DIGITS.indexOf(digit)).join('') : '10');
      if (!base || !equals(rational(Number(digits)), base)) return null;
      source = source.replace(/log(?:_\{?\d+\}?|[₀-₉]+)?(?=\(|x)/g, 'log').replace(/logx/g, 'log(x)');
      source = prefixToF(source, 'log');
    }
  }
  if (!source || /[²³√∛^]|log|ln|sqrt|cbrt/.test(source)) return null;
  const parsed = parseRightSide(source);
  if (!parsed) return null;
  // Bars are the absolute value parent only.
  if (parsed.abs && type !== 'absolute') return null;
  return parsed;
};

/**
 * The transformation the prompt states for a lab question, or null. Every
 * y = / g(x) = equation written in the prompt that reads as a transformation
 * (other than the parent itself) must be exactly the graded a, b, h, k, and
 * there must be at least one.
 */
const statedTransformation = (prompt, type, spec, base) => {
  const source = String(prompt ?? '');
  const found = [];
  for (const match of source.matchAll(/(?:\b[fgh]\(x\)|\by)\s*=\s*/g)) {
    const rest = source.slice(match.index + match[0].length, match.index + match[0].length + 80);
    // The longest prefix, ending where a word or sentence could end, that reads.
    const cuts = [rest.length];
    for (let index = 0; index < rest.length; index += 1) if (/[\s,;:$]/.test(rest[index]) || (rest[index] === '.' && !/\d/.test(rest[index + 1] ?? ''))) cuts.push(index);
    let parsed = null;
    let side = '';
    for (const cut of [...new Set(cuts)].sort((p, q) => q - p)) {
      side = rest.slice(0, cut).trim();
      if (!side) continue;
      parsed = parseLabSide(side, type, base);
      if (parsed) break;
    }
    if (!parsed) continue;
    const identity = equals(parsed.A, ONE) && equals(parsed.B, ONE) && isZero(parsed.h) && isZero(parsed.k);
    if (identity) continue;
    found.push({ display: `${match[0].replace(/\s*=\s*$/, '')} = ${side}`, ...parsed });
  }
  if (!found.length) return null;
  const agrees = ({ A, B, h, k }) => equals(A, spec.a) && equals(B, spec.b) && equals(h, spec.h) && equals(k, spec.k);
  return found.every(agrees) ? found[0] : null;
};

/** Every g(x)= / y= equation of the prompt that is a transformation, as written. */
const promptEquations = (prompt) => {
  const out = [];
  // Only f and x may appear as letters, so a following word ("to f(x)",
  // "describe") ends the equation.
  const pattern = /(?:\b[gh]\(x\)|\by)\s*=\s*([0-9fx()|.+\-−·*/ ]+)/g;
  for (const match of String(prompt ?? '').matchAll(pattern)) {
    const side = match[1].trim().replace(/[.\s]+$/, '');
    const parsed = parseRightSide(side);
    if (!parsed) continue;
    const identity = equals(parsed.A, ONE) && equals(parsed.B, ONE) && isZero(parsed.h) && isZero(parsed.k);
    if (identity) continue;
    out.push({ display: text(match[0]).replace(/[.\s]+$/, ''), side, ...parsed });
  }
  return out;
};

const normalized = (value) => ascii(value).toLowerCase().replace(/\s+/g, '');

const fieldRole = (field) => {
  const label = text(field?.label).toLowerCase().replace(/[^a-z ]/g, '').trim();
  return {
    'horizontal translation': 'H',
    'vertical translation': 'V',
    translation: 'T',
    'vertical scale': 'VS',
    'horizontal scale': 'HS',
    'horizontal reflection': 'HR',
    'vertical reflection': 'VR',
    reflection: 'R',
    transformation: 'KIND',
    'scale factor': 'FACTOR',
    vertex: 'VERTEX',
    range: 'RANGE',
  }[label] || null;
};

const shiftVerdict = (value, positive, negative) => (isZero(value) ? 'none' : `${isNegative(value) ? negative : positive} ${show(absolute(value))}`);
const scaleVerdict = (factor) => (equals(factor, ONE) ? 'unchanged' : `${toNumber(factor) > 1 ? 'stretch' : 'compression'} by ${show(factor)}`);

/** The one option this family reads for a field, or null when it cannot say. */
const verdictFor = (role, model) => {
  const { A, B, h, k, abs } = model;
  const horizontalFactor = divide(ONE, absolute(B));
  const onlyHorizontalScale = equals(A, ONE) && !isNegative(B) && !equals(B, ONE) && isZero(h) && isZero(k);
  const onlyVerticalScale = !isNegative(A) && !equals(A, ONE) && equals(B, ONE) && isZero(h) && isZero(k);
  switch (role) {
    case 'H': return shiftVerdict(h, 'right', 'left');
    case 'V': return shiftVerdict(k, 'up', 'down');
    case 'T': return isZero(h) && isZero(k) ? 'none' : null;
    case 'VS': return scaleVerdict(absolute(A));
    case 'HS': return scaleVerdict(horizontalFactor);
    case 'HR': return isNegative(B) ? 'across the y-axis' : 'none';
    case 'VR': return isNegative(A) ? 'across the x-axis' : 'none';
    case 'R':
      if (isNegative(A) && isNegative(B)) return null;
      return isNegative(A) ? 'across the x-axis' : isNegative(B) ? 'across the y-axis' : 'none';
    case 'KIND':
      if (onlyHorizontalScale) return `horizontal ${toNumber(horizontalFactor) > 1 ? 'stretch' : 'compression'}`;
      if (onlyVerticalScale) return `vertical ${toNumber(A) > 1 ? 'stretch' : 'compression'}`;
      return null;
    case 'FACTOR':
      if (onlyHorizontalScale) return show(horizontalFactor);
      if (onlyVerticalScale) return show(A);
      return null;
    case 'VERTEX': return abs ? pt([h, k]) : null;
    case 'RANGE': return abs ? (isNegative(A) ? `(-∞, ${show(k)}]` : `[${show(k)}, ∞)`) : null;
    default: return null;
  }
};

const describeModel = (question) => {
  const fields = list(question.answerFields);
  if (!fields.length) return null;
  const equations = promptEquations(question.prompt);
  const distinct = equations.filter((entry, index) => equations.findIndex((other) => normalized(other.side) === normalized(entry.side)) === index);
  if (distinct.length !== 1) return null;
  const model = { kind: 'describeEquation', ...distinct[0], fields: [] };
  for (const field of fields) {
    const role = fieldRole(field);
    const options = list(field?.options).map(text).filter(Boolean);
    if (!role || options.length < 2) return null;
    const verdict = verdictFor(role, model);
    if (verdict === null) return null;
    const matching = options.filter((option) => normalized(option) === normalized(verdict));
    if (matching.length !== 1) return null;
    const keys = answerCandidatesForField(field).filter((value) => typeof value === 'string' || typeof value === 'number').map(text);
    if (!keys.length || !keys.every((key) => normalized(key) === normalized(matching[0]))) return null;
    model.fields.push({ id: text(field.id), role, options, answer: matching[0] });
  }
  const roles = new Set(model.fields.map((field) => field.role));
  // At least one field must be about the transformation itself.
  if (![...roles].some((role) => !['VERTEX', 'RANGE'].includes(role))) return null;
  model.roles = roles;
  return model;
};

/* ---------------------------------------------------------------------------
 * The model of one question. null = not ours.
 * ------------------------------------------------------------------------- */

const modelFor = (question) => {
  if (!isObject(question)) return null;
  try {
    if (isLab(question)) return labModel(question);
    if (text(question.type) === 'multiAnswer') return describeModel(question);
  } catch { /* a question this family cannot read is not its question */ }
  return null;
};

export const matches = (question) => Boolean(modelFor(question));

/* ---------------------------------------------------------------------------
 * expectedValues: everything the student must find, in every spelling.
 * ------------------------------------------------------------------------- */

/** a, h, k (and b where a box shows it), and what reading them off the graph means. */
const parameterAnswers = (model, { withB = false } = {}) => {
  const { type, spec, base } = model;
  const { a, b, h, k } = spec;
  const out = [...numberForms(a), ...numberForms(h), ...numberForms(k)];
  if (withB) out.push(...numberForms(b));
  const equation = equationText(type, spec, base);
  if (equation) out.push(...equationForms(equation));
  if (model.feature && type !== 'rational') out.push(...pairForms([h, k]));
  if (type === 'rational') out.push(...pairForms([h, k]), ...lineEquationForms('x', h), ...lineEquationForms('y', k));
  if (type === 'logarithmic') out.push(...lineEquationForms('x', h), ...pairForms([add(divide(ONE, b), h), k]));
  if (type === 'exponential') out.push(...lineEquationForms('y', k), ...pairForms([h, add(a, k)]));
  if (type === 'linear') out.push(...pairForms([h, k]), ...numberForms(multiply(a, b)));
  return out;
};

const describeAnswers = (model) => {
  const { a, h, k } = model.spec;
  return [
    ...DESCRIBE_VERDICTS,
    ...numberForms(absolute(a)),
    ...numberForms(ONE), // the horizontal scale factor 1/|b| (b = 1 here)
    ...numberForms(absolute(h)),
    ...numberForms(absolute(k)),
    ...parameterAnswers(model),
  ];
};

/** Every spelling of one multiAnswer option. */
const optionForms = (option) => {
  const plain = ascii(option).trim();
  const out = [option, plain];
  const shift = /^(left|right|up|down)\s+(\S+)$/i.exec(plain);
  if (shift) {
    const [, direction, amount] = shift;
    const value = exact(amount);
    const amounts = value ? unique([amount, ...coordinateForms(value)]) : [amount];
    amounts.forEach((entry) => {
      out.push(`${direction} ${entry}`, `${entry} units ${direction}`, `${entry} unit ${direction}`, `${direction} ${entry} units`, `${direction} ${entry} unit`);
      if (/left|right/i.test(direction)) out.push(`${entry} units to the ${direction}`, `${entry} unit to the ${direction}`);
    });
  }
  const scale = /^(stretch|compression)\s+by\s+(\S+)$/i.exec(plain);
  if (scale) {
    const [, kind, amount] = scale;
    const value = exact(amount);
    const amounts = value ? unique([amount, ...numberForms(value)]) : [amount];
    const verb = kind.toLowerCase() === 'stretch' ? 'stretched' : 'compressed';
    amounts.forEach((entry) => {
      out.push(`${kind} by ${entry}`, `${verb} by ${entry}`, `${kind} by a factor of ${entry}`, `${verb} by a factor of ${entry}`);
    });
  }
  const reflection = /^across\s+(?:the\s+)?(x|y)-axis$/i.exec(plain);
  if (reflection) {
    const axis = reflection[1].toLowerCase();
    out.push(`across the ${axis}-axis`, `over the ${axis}-axis`, `${axis}-axis reflection`, `reflected across the ${axis}-axis`, `reflection across the ${axis}-axis`);
  }
  if (/^across\s+y\s*=\s*x$/i.test(plain)) out.push('across y = x', 'across y=x', 'over y = x');
  const kind = /^(horizontal|vertical)\s+(stretch|compression)$/i.exec(plain);
  if (kind) {
    const adverb = `${kind[1].toLowerCase()}ly`;
    const verb = kind[2].toLowerCase() === 'stretch' ? 'stretched' : 'compressed';
    out.push(`${verb} ${adverb}`, `${adverb} ${verb}`);
  }
  const point = /^\(\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\)$/.exec(plain);
  if (point && exact(point[1]) && exact(point[2])) out.push(...pairForms([exact(point[1]), exact(point[2])]));
  const value = exact(plain);
  if (value) out.push(...numberForms(value));
  if (/∞/.test(plain)) out.push(plain.replace(/\s+/g, ''), plain.replace(/,\s*/g, ', '));
  return unique(out.flatMap(withUnicodeMinus));
};

const expectedFor = (model) => {
  if (model.kind === 'describeEquation') return unique(model.fields.flatMap((field) => field.options.flatMap(optionForms)));
  switch (model.mode) {
    case 'match':
      return unique(parameterAnswers(model, { withB: model.showB }));
    case 'identify':
      return unique(parameterAnswers(model));
    case 'describe':
      return unique(describeAnswers(model));
    case 'pointMap':
      return unique([...numberForms(model.image[0]), ...numberForms(model.image[1]), ...pairForms(model.image)]);
    case 'plotTransform':
      return unique(model.images.flatMap((image) => [...numberForms(image[0]), ...numberForms(image[1]), ...pairForms(image)]));
    case 'anchor': {
      const out = [...numberForms(model.anchorPoint[0]), ...numberForms(model.anchorPoint[1]), ...pairForms(model.anchorPoint)];
      if (model.type === 'rational') out.push(...lineEquationForms('x', model.spec.h), ...lineEquationForms('y', model.spec.k));
      if (model.type === 'logarithmic') out.push(...lineEquationForms('x', model.spec.h));
      return unique(out);
    }
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
  list(question.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
  push(question.answer);
  push(question.solution);
  push(question.target);
  push(question.generatedAnswer);
  list(question.acceptedAnswers).forEach(push);
  if (isObject(question.solutionKey)) push(question.solutionKey.value);
  return values;
};

const guardFor = (question, model) => unique([...expectedFor(model), ...rawKeyTexts(question)]);

/** The numbered spelling unless it leaks, else the plain one, else nothing. */
const choose = (guard) => ([specific, plain]) => {
  if (specific && !hintRevealsAnswer(specific, guard)) return specific;
  if (plain && !hintRevealsAnswer(plain, guard)) return plain;
  return null;
};

/* ---------------------------------------------------------------------------
 * hints: least to most specific. Each entry is [numbered, plain].
 * ------------------------------------------------------------------------- */

const FORM = 'y = a·f(x − h) + k';
const FORM_B = 'y = a·f(b(x − h)) + k';

/** Where h and k come from on this family's graph. */
const featureHints = (model, subject) => {
  const { type, base } = model;
  const parentN = parentNumbered(type, base);
  const parentP = parentPlain(type);
  if (type === 'rational') {
    return [
      [`The parent ${parentN} has the asymptotes x = 0 and y = 0. Find the two asymptotes of ${subject}: the vertical line it never reaches and the horizontal line it approaches far to each side.`,
        `The asymptotes of ${parentP} are the two axes. Find the two asymptotes of ${subject}: the vertical line it never reaches and the horizontal line it approaches far to each side.`],
      [null, `The vertical asymptote of ${subject} is the line x = h and its horizontal asymptote is the line y = k.`],
    ];
  }
  if (type === 'logarithmic') {
    return [
      [`The parent ${parentN} has the vertical asymptote x = 0 and passes through (1, 0). Find the vertical asymptote of ${subject} first.`,
        `${parentP[0].toUpperCase()}${parentP.slice(1)} has the y-axis as its vertical asymptote. Find the vertical asymptote of ${subject} first.`],
      [`The vertical asymptote of ${subject} is x = h. One unit to its right the parent log is 0, so the height of ${subject} there is k.`,
        `The vertical asymptote of ${subject} is the line x = h. One unit to its right the parent logarithm is zero, so the height of ${subject} there is k.`],
    ];
  }
  if (type === 'exponential') {
    return [
      [`The parent ${parentN} has the horizontal asymptote y = 0. Find the horizontal asymptote of ${subject} first: it is the line y = k.`,
        `${parentP[0].toUpperCase()}${parentP.slice(1)} has the x-axis as its horizontal asymptote. Find the horizontal asymptote of ${subject} first: it is the line y = k.`],
      [`The parent's point (0, 1) sits one unit above its asymptote; it lands at (h, a + k). Choose h and a so that point is on ${subject}, then compare one more point.`,
        `The parent's point where the exponent is zero sits one unit above its asymptote, and it lands at (h, a + k). Choose h and a so that point is on ${subject}, then compare one more point.`],
    ];
  }
  if (type === 'linear') {
    return [
      [null, `For a line, (h, k) can be any point of ${subject}: pick one you can read exactly at grid corners.`],
      [null, `a sets the steepness: with b at one, a is the slope of ${subject}, rise over run between two grid corners on it.`],
    ];
  }
  const { feature } = model;
  return [
    [`The parent ${parentN} has its ${feature} at (0, 0). Find the ${feature} of ${subject}: ${FEATURE_WHERE[feature]}.`,
      `The parent ${parentP} has its ${feature} at the origin. Find the ${feature} of ${subject}: ${FEATURE_WHERE[feature]}.`],
    [null, `The ${feature} moves from the origin to (h, k): read h across and k vertically, signs included.`],
  ];
};

/** How a (and b) are read: the parent's second point. */
const scaleHint = (model, subject) => {
  const { type, base } = model;
  if (type === 'rational') {
    return [`On the parent, at x = 1 (one unit right of its vertical asymptote) the graph is at y = 1, one unit above its horizontal asymptote. One unit right of the vertical asymptote of ${subject}, measure how far it is above or below its horizontal asymptote: that signed distance is a.`,
      `One unit right of its vertical asymptote the parent is one unit above its horizontal asymptote. One unit right of the vertical asymptote of ${subject}, measure how far it is above or below its horizontal asymptote: that signed distance is a.`];
  }
  if (type === 'logarithmic') {
    const B = base ? show(base) : null;
    return [B ? `${B} units right of its asymptote the parent log is 1. Go ${B} units right of the asymptote of ${subject} and measure how far its height is from k: that signed change is a.` : null,
      `As many units right of its asymptote as the base, the parent logarithm is one. Go that far right of the asymptote of ${subject} and measure how far its height is from k: that signed change is a.`];
  }
  if (type === 'exponential' || type === 'linear') return null;
  const { feature } = model;
  return [`On the parent, one unit right of the ${feature} the graph is at (1, 1), one unit above it. Go one unit right of the ${feature} of ${subject} and measure how far the graph is above or below the ${feature}: that signed change is a.`,
    `On the parent, one unit right of the ${feature} the graph is one unit higher. Go one unit right of the ${feature} of ${subject} and measure how far the graph is above or below the ${feature}: that signed change is a.`];
};

const labHints = (model) => {
  const { mode, type } = model;
  const label = FAMILY_LABELS[type];
  if (mode === 'match') {
    const form = model.showB ? FORM_B : FORM;
    const [first, second] = featureHints(model, 'the target');
    const scale = scaleHint(model, 'the target');
    const out = [
      [`Your graph is ${form}, where f is the parent ${label} function ${parentNumbered(type, model.base)}. Put it in place first with h and k, then shape it with a${model.showB ? ' and b' : ''}.`,
        `Your graph is ${form}, where f is the parent ${label} function. Put it in place first with h and k, then shape it with a${model.showB ? ' and b' : ''}.`],
      first,
      second,
    ];
    if (scale && !model.showB) out.push(scale);
    else if (model.showB) out.push([null, 'With a b box, a and b can trade off: several settings draw the same graph, and any of them that lands on the target is accepted. Compare two points of the target.']);
    else out.push([null, 'Check: when your solid graph lies on the dashed target everywhere in the window, every setting that draws it is accepted.']);
    return out;
  }
  if (mode === 'identify') {
    const [first, second] = featureHints(model, 'the graph');
    return [
      first,
      second,
      scaleHint(model, 'the graph'),
      [null, `Check: put your a, h and k into ${FORM} and test one more point you can read exactly on the graph.`],
    ];
  }
  if (mode === 'describe') {
    // Claimed only when the prompt states the transformation (b = 1): read it
    // from the equation; the graph confirms the shifts.
    // ("to its right" would name a verdict word: the log shift says "past".)
    const shifts = type === 'logarithmic'
      ? [null, 'The vertical asymptote of the graph is the line x = h. Where x is one unit past the asymptote, the parent logarithm is zero, so the height of the graph there is k.']
      : featureHints(model, 'the graph')[1];
    return [
      [`Compare ${model.equation.display} with ${FORM_B}: a factor in front and a number added at the end act on y; what is inside, with x, acts on x. The horizontal shift is h and the vertical shift is k, and the sign of each gives its direction.`,
        `Compare the equation in the prompt with ${FORM_B}: a factor in front and a number added at the end act on y; what is inside, with x, acts on x. The horizontal shift is h and the vertical shift is k, and the sign of each gives its direction.`],
      shifts,
      [null, 'Outside, y’s tell the truth: the sign of a decides a reflection across the x-axis, and |a| compared with one decides the vertical scale and its factor.'],
      [null, 'Inside, x’s act the opposite way: the sign of b decides a reflection across the y-axis, and the horizontal scale factor is the reciprocal of |b|. Look for a number multiplying x inside.'],
    ];
  }
  if (mode === 'pointMap') {
    const [px, py] = model.parentPoint;
    const [first] = featureHints(model, 'the transformed graph');
    return [
      first,
      [`Handle the two coordinates of ${pt(model.parentPoint)} separately: inside changes (b and h) act on x, outside changes (a and k) act on y.`,
        'Handle the two coordinates of the parent point separately: inside changes (b and h) act on x, outside changes (a and k) act on y.'],
      [`New x: divide the parent x-coordinate, ${show(px)}, by b and then add h. New y: multiply the parent y-coordinate, ${show(py)}, by a and then add k.`,
        'New x: divide the parent x-coordinate by b and then add h. New y: multiply the parent y-coordinate by a and then add k.'],
      [null, 'Check: your point must lie on the transformed graph — put its x into the transformation and you should get its y.'],
    ];
  }
  if (mode === 'plotTransform') {
    const [sx, sy] = model.sources[0];
    return [
      [null, `Write the transformation in the form ${FORM_B} and name its a, b, h and k. Where the prompt writes f(…) with no number in front, a is one; with nothing added at the end, k is zero.`],
      [`Move one point at a time. The first source point is ${pt(model.sources[0])}: its new x is ${show(sx)} divided by b, plus h.`,
        'Move one point at a time, starting with the first source point: its new x is its x-coordinate divided by b, plus h.'],
      [`Its new y is a times ${show(sy)}, plus k. Then do the same for each source point in order: each new point is the image of the source point with the same number.`,
        'Its new y is a times its y-coordinate, plus k. Then do the same for each source point in order: each new point is the image of the source point with the same number.'],
      [null, 'Check one image by undoing it: subtract h and multiply by b for x; subtract k and divide by a for y. You should land back on the source point.'],
    ];
  }
  // anchor
  if (type === 'rational') {
    return [
      featureHints(model, 'this graph')[0],
      [null, 'Stretches, compressions and reflections leave the asymptotes in place; only the shifts h and k move them.'],
      [null, `The asymptote intersection is where the two asymptotes cross. It is not a point of the ${label} graph.`],
    ];
  }
  if (type === 'logarithmic') {
    const [first, second] = featureHints(model, 'this graph');
    return [first, second, [null, 'The reference point is the point of the graph one unit right of the vertical asymptote: read its coordinates at the grid lines.']];
  }
  const { feature } = model;
  return [
    featureHints(model, 'this graph')[0],
    [null, `Stretches, compressions and reflections act around the ${feature} and leave it in place; only the shifts h and k move it.`],
    [null, `Count gridlines to the ${feature}: across for its x-coordinate first, then vertically for its y-coordinate.`],
  ];
};

const HORIZONTAL_ROLES = ['H', 'HS', 'HR', 'R', 'T', 'KIND', 'FACTOR'];

const describeHints = (model) => {
  const { display, abs, roles } = model;
  const holder = abs ? 'the absolute value bars' : 'f( )';
  const inside = abs ? /\|(.+)\|/.exec(display)?.[1] : /f\((.+)\)/.exec(display)?.[1];
  const out = [
    [`Compare ${display} with y = a·f(b(x − h)) + k: what is outside ${holder} — a factor in front, a number added at the end — acts on y; what is inside, with x, acts on x.`,
      `Compare the new function with y = a·f(b(x − h)) + k: what is outside ${holder} — a factor in front, a number added at the end — acts on y; what is inside, with x, acts on x.`],
  ];
  if ([...roles].some((role) => HORIZONTAL_ROLES.includes(role))) {
    out.push([inside ? `Inside ${holder}, ${inside} acts on x the opposite way to how it looks: a shift goes against the sign you see next to x, and a number multiplying x scales the graph horizontally by its reciprocal (a negative multiplier flips the graph from side to side).` : null,
      `Inside ${holder}, x’s act the opposite way to how they look: a shift goes against the sign you see next to x, and a number multiplying x scales the graph horizontally by its reciprocal (a negative multiplier flips the graph from side to side).`]);
  }
  out.push([null, `Outside ${holder}, y’s tell the truth: the number added at the end moves the graph vertically the way its sign says, and a factor in front scales it vertically by its size (a negative factor turns the graph upside down).`]);
  if (roles.has('VERTEX') || roles.has('RANGE')) {
    out.push([null, `The parent |x| has its vertex at the origin. Reflections and stretches leave the vertex where it is; only the shifts move it${roles.has('RANGE') ? '. For the range, the vertex is the highest or lowest point: the sign of the factor in front decides which' : ''}.`]);
  } else {
    out.push([null, 'Check: take a point (p, q) of y = f(x) and find where the new function sends it; the move from (p, q) to its image should agree with every choice you made.']);
  }
  return out;
};

export const hints = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    const guard = guardFor(question, model);
    const entries = model.kind === 'lab' ? labHints(model) : describeHints(model);
    return unique(entries.filter(Boolean).map(choose(guard)).filter(Boolean)).slice(0, 4);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * backUpQuestion: one two-choice question about this problem's first move.
 * ------------------------------------------------------------------------- */

const step = (prompt, options, correct) => ({ prompt, options, correct });

const backUpFor = (model) => {
  if (model.kind === 'describeEquation') {
    const holder = model.abs ? 'the absolute value bars' : 'f( )';
    const horizontal = [...model.roles].some((role) => HORIZONTAL_ROLES.includes(role));
    const options = horizontal
      ? [`What is inside ${holder}, with x`, `What is outside ${holder}`]
      : [`What is outside ${holder}`, `What is inside ${holder}, with x`];
    const question = horizontal ? 'acts on x (horizontally)' : 'acts on y (vertically)';
    return [
      step(`Let’s back up. In ${model.display}, which part ${question}?`, options, options[0]),
      step(`Let’s back up. In the new function, which part ${question}?`, options, options[0]),
    ];
  }
  const { mode, type, feature } = model;
  if (mode === 'pointMap' || mode === 'plotTransform') {
    const options = ['b and h, inside', 'a and k, outside'];
    return [step('Let’s back up. Which parameters change the x-coordinate of a point?', options, options[0])];
  }
  if (mode === 'anchor' && feature && type !== 'rational') {
    const options = ['Only the shifts h and k', 'The stretches and reflections too'];
    return [step(`Let’s back up. Which changes move the ${feature}?`, options, options[0])];
  }
  if (type === 'rational') {
    const options = ['The two asymptotes', 'The two intercepts'];
    return [step('Let’s back up. Which lines of the graph give you h and k?', options, options[0])];
  }
  if (type === 'logarithmic') {
    const options = ['The vertical asymptote', 'The x-intercept'];
    return [step('Let’s back up. Which line of the graph gives you h?', options, options[0])];
  }
  if (type === 'exponential') {
    const options = ['The horizontal asymptote', 'The y-intercept'];
    return [step('Let’s back up. Which line of the graph gives you k?', options, options[0])];
  }
  if (type === 'linear') {
    const options = ['The steepness of the line', 'Where the line crosses the y-axis'];
    return [step('Let’s back up. With b at one, what does a set for a line?', options, options[0])];
  }
  const options = [`The ${feature}`, 'The y-intercept'];
  return [step('Let’s back up. Which point of the graph gives you h and k?', options, options[0])];
};

export const backUpQuestion = (question) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    const guard = guardFor(question, model);
    // "Let’s back up." holds the word "up", itself a describe verdict: such a
    // question gets the same check opened another way.
    const entries = backUpFor(model).flatMap((entry) => [entry, { ...entry, prompt: entry.prompt.replace('Let’s back up.', 'One step back.') }]);
    const found = entries.find((entry) => ![entry.prompt, ...entry.options].some((part) => hintRevealsAnswer(part, guard)));
    if (!found) return null;
    // The right answer is not always the first button.
    const options = hash(`${model.kind}|${found.prompt}`) % 2 ? [...found.options].reverse() : [...found.options];
    return { prompt: found.prompt, options, correct: found.correct };
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * similarProblem: a worked sibling with different numbers.
 * ------------------------------------------------------------------------- */

const product = (...lists) => lists.reduce((acc, values) => acc.flatMap((prefix) => values.map((value) => [...prefix, value])), [[]]);
const signatureOf = (model) => JSON.stringify(model, (key, value) => {
  if (value instanceof Set) return [...value];
  return value && typeof value === 'object' && 'n' in value && 'd' in value ? `${value.n}/${value.d}` : value;
});

/** The platform's similarExampleIsSafe, against this family's wider guard (stricter on the answer). */
const exampleIsSafe = (question, example, guard) => {
  const prompt = text(example?.prompt);
  const answer = text(example?.answer);
  const steps = list(example?.steps).map(text).filter(Boolean);
  if (!prompt || !answer || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  if (guard.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const value = exact(answer);
  if (value && guard.some((entry) => exact(entry) && equals(exact(entry), value))) return false;
  if (hintRevealsAnswer(answer, guard)) return false;
  if (steps.some((entry) => hintRevealsAnswer(entry, guard))) return false;
  return !hintRevealsAnswer(prompt, guard.filter((entry) => exact(entry) === null));
};

// A bounded search: the platform asks for up to six seeds, in the browser.
const MAX_SIBLING_ATTEMPTS = 1500;

/** The candidates of a product, by index, without building them all. */
const lazyProduct = (...lists) => {
  const length = lists.reduce((count, values) => count * values.length, 1);
  return {
    length,
    at: (index) => {
      let rest = index;
      const out = [];
      for (let position = lists.length - 1; position >= 0; position -= 1) {
        const values = lists[position];
        out.unshift(values[rest % values.length]);
        rest = Math.floor(rest / values.length);
      }
      return out;
    },
  };
};
const keeping = (candidates, keep) => ({ ...candidates, keep });
const asCandidates = (candidates) => (Array.isArray(candidates) ? { length: candidates.length, at: (index) => candidates[index] } : candidates);

const NUMBER_IN_TEXT = /-?\d+(?:\/\d+)?/g;

const firstSafe = (question, model, seed, rawCandidates, build) => {
  const candidates = asCandidates(rawCandidates);
  if (!candidates.length) return null;
  const guard = guardFor(question, model);
  // A quick, stricter first pass: no number the sibling prints equals a numeric
  // answer. Only what survives it meets the full guard (exampleIsSafe).
  const answerKeys = new Set(guard.map(exact).filter(Boolean).map(show));
  // A fraction's numerator and denominator count too, as they do for the guard.
  const printsAnAnswer = (example) => [example.prompt, ...example.steps, example.answer].some((part) => (
    ascii(part).match(NUMBER_IN_TEXT) || []).flatMap((entry) => [entry, ...(entry.includes('/') ? entry.split('/') : [])]).some((entry) => {
    const value = exact(entry);
    return value && answerKeys.has(show(value));
  }));
  const start = hash(`${signatureOf(model)}|${Number(seed) || 0}`) % candidates.length;
  // Walk the candidates with a stride coprime to their count, so a bounded
  // search samples the whole space rather than one corner of it.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const stride = [7919, 7907, 7901, 1].find((prime) => gcd(prime, candidates.length) === 1);
  for (let index = 0; index < Math.min(candidates.length, MAX_SIBLING_ATTEMPTS); index += 1) {
    const candidate = candidates.at((start + index * stride) % candidates.length);
    if (candidates.keep && !candidates.keep(candidate)) continue;
    let example = null;
    try {
      example = build(candidate);
    } catch {
      example = null;
    }
    if (example && !printsAnAnswer(example) && exampleIsSafe(question, example, guard)) return example;
  }
  return null;
};

const SLOPES_A = Object.freeze([2, 3, -2, -3, '1/2', -1, 4, '-1/2', 1, 5, -4].map(R));
const INTEGER_A = Object.freeze([2, 3, -2, -3, -1, 4, 1, -4, 5, 6].map(R));
const SHIFTS = Object.freeze([2, -3, 4, -1, 3, -2, 5, 1, -4, -5, 6].map(R));
// The second point used to check a reading: x − h = t, with f(t) exact.
const CHECK_INPUTS = Object.freeze({
  quadratic: [2, -2, 3, -3, 4],
  absolute: [-2, 3, -3, 4, -4, 5],
  cubic: [-1, 2, -2, 3],
  cubeRoot: [-1, 8, -8, 27],
  squareRoot: [4, 9, 16, 25],
  rational: [-1, 2, -2, 4, -4],
});
const differs = (value, current) => !equals(value, current);
const answerText = ({ a, h, k }) => `a = ${show(a)}, h = ${show(h)}, k = ${show(k)}`;

const fWorkText = (type, t, value) => ({
  quadratic: `${paren(t)}² = ${show(value)}`,
  cubic: `${paren(t)}³ = ${show(value)}`,
  absolute: `|${show(t)}| = ${show(value)}`,
  squareRoot: `√${show(t)} = ${show(value)}`,
  cubeRoot: `∛${paren(t)} = ${show(value)}`,
  rational: `the reciprocal of ${paren(t)} is ${show(value)}`,
}[type]);
const READING_SHAPES = Object.freeze({
  quadratic: 'a(x - h)² + k',
  absolute: 'a|x - h| + k',
  cubic: 'a(x - h)³ + k',
  cubeRoot: 'a∛(x - h) + k',
  squareRoot: 'a√(x - h) + k',
  rational: 'a/(x - h) + k',
});

/** match / identify: read a, h, k off a described graph. */
const siblingReading = (question, model, seed) => {
  const { type, mode, spec } = model;
  const label = FAMILY_LABELS[type];
  const subject = mode === 'match' ? 'the target' : 'the graph';
  const lead = (described) => (mode === 'match'
    ? `The dashed target is a transformed ${label} graph that ${described}. Find a, h and k so that your graph`
    : `A transformed ${label} graph ${described}. Find a, h and k for`);
  const different = ([a, h, k]) => differs(a, spec.a) && differs(h, spec.h) && differs(k, spec.k);

  if (ORIGIN_FEATURES[type]) {
    const aPool = type === 'rational' ? INTEGER_A : SLOPES_A;
    const candidates = keeping(lazyProduct(aPool, SHIFTS, SHIFTS, CHECK_INPUTS[type].map(R)), different);
    return firstSafe(question, model, seed, candidates, ([a, h, k, t]) => {
      const sibling = { a, b: ONE, h, k };
      const equation = equationText(type, sibling, null);
      const p1 = [add(h, ONE), add(a, k)];
      const fValue = parentValue(type, t, null);
      if (fValue === null) return null;
      const p2 = [add(h, t), add(multiply(a, fValue), k)];
      const shape = READING_SHAPES[type];
      const described = type === 'rational'
        ? `has the asymptotes x = ${show(h)} and y = ${show(k)} and passes through ${pt(p1)} and ${pt(p2)}`
        : `has its ${model.feature} at ${pt([h, k])} and passes through ${pt(p1)} and ${pt(p2)}`;
      const prompt = `${lead(described)} y = ${shape}${mode === 'match' ? ' lands on it' : ''}.`;
      const steps = type === 'rational'
        ? [
          `The asymptotes of the reciprocal parent are the two axes. Here they are x = ${show(h)} and y = ${show(k)}, so h = ${show(h)} and k = ${show(k)}.`,
          `One unit right of its vertical asymptote the parent is one unit above its horizontal asymptote. One unit right of x = ${show(h)}, at x = ${show(p1[0])}, ${subject} is at y = ${show(p1[1])}: a change of ${show(p1[1])} - ${paren(k)} = ${show(a)}. So a = ${show(a)}.`,
        ]
        : [
          `The parent ${parentPlain(type)} has its ${model.feature} at the origin. Here the ${model.feature} is at ${pt([h, k])}, so h = ${show(h)} and k = ${show(k)}.`,
          `One unit right of its ${model.feature} the parent is one unit higher. One unit right of the ${model.feature} here, at x = ${show(p1[0])}, ${subject} is at y = ${show(p1[1])}: a change of ${show(p1[1])} - ${paren(k)} = ${show(a)}. So a = ${show(a)}.`,
        ];
      steps.push(
        `So ${subject} is ${equation}.`,
        `Check with ${pt(p2)}: x - h = ${show(p2[0])} - ${paren(h)} = ${show(t)}, ${fWorkText(type, t, fValue)}, and ${show(a)} × ${paren(fValue)} + ${paren(k)} = ${show(p2[1])}.`,
      );
      return { prompt, steps, answer: answerText(sibling) };
    });
  }

  if (type === 'logarithmic') {
    const bases = unique([show(model.base), '2', '3', '10']).map(R).filter((base) => isInteger(base) && base.n > 1);
    const candidates = keeping(lazyProduct(SLOPES_A, SHIFTS, SHIFTS, bases), different);
    return firstSafe(question, model, seed, candidates, ([a, h, k, base]) => {
      const sibling = { a, b: ONE, h, k };
      const p1 = [add(h, ONE), k];
      const p2 = [add(h, base), add(a, k)];
      const name = logName(base);
      const prompt = `${lead(`has the vertical asymptote x = ${show(h)} and passes through ${pt(p1)} and ${pt(p2)}`)} y = a·${name}(x - h) + k${mode === 'match' ? ' lands on it' : ''}.`;
      return {
        prompt,
        steps: [
          `The parent logarithm has the y-axis as its vertical asymptote. Here the asymptote is x = ${show(h)}, so h = ${show(h)}.`,
          `One unit right of its asymptote the parent logarithm is zero. Here, at x = ${show(p1[0])}, the height is ${show(k)}, so k = ${show(k)}.`,
          `${show(base)} units right of its asymptote the parent logarithm is one. Here, at x = ${show(p2[0])}, the height is ${show(p2[1])}: a change of ${show(p2[1])} - ${paren(k)} = ${show(a)}, so a = ${show(a)}.`,
          `So ${subject} is ${equationText(type, sibling, base)}.`,
        ],
        answer: answerText(sibling),
      };
    });
  }

  if (type === 'exponential') {
    const bases = unique([show(model.base), '2', '3', '1/2', '4']).map(R).filter((base) => base && base.n > 0 && !equals(base, ONE));
    const candidates = keeping(lazyProduct(SLOPES_A, SHIFTS, SHIFTS, bases), different);
    return firstSafe(question, model, seed, candidates, ([a, h, k, base]) => {
      const sibling = { a, b: ONE, h, k };
      const p1 = [h, add(a, k)];
      const p2 = [add(h, ONE), add(multiply(a, base), k)];
      return {
        prompt: `${lead(`has the horizontal asymptote y = ${show(k)} and passes through ${pt(p1)} and ${pt(p2)}`)} y = a·${baseText(base)}^(x - h) + k lands on it.`,
        steps: [
          `The parent exponential has the x-axis as its horizontal asymptote. The target's asymptote is y = ${show(k)}, so k = ${show(k)}.`,
          `Where its exponent is zero the parent is one unit above its asymptote. Use ${pt(p1)} as that point's image: h = ${show(h)} and a = ${show(p1[1])} - ${paren(k)} = ${show(a)}.`,
          `Check with ${pt(p2)}: one unit further right the parent is multiplied by ${show(base)}, so y = ${show(a)} × ${paren(base)} + ${paren(k)} = ${show(p2[1])}.`,
          `Enter a = ${show(a)}, h = ${show(h)}, k = ${show(k)}: your graph is then ${equationText(type, sibling, base)}. Any a and h that draw this same graph are accepted too.`,
        ],
        answer: answerText(sibling),
      };
    });
  }

  // linear (match only)
  const candidates = keeping(lazyProduct(SLOPES_A, SHIFTS, SHIFTS, [2, 3, 4].map(R)), different);
  return firstSafe(question, model, seed, candidates, ([a, h, k, run]) => {
    const sibling = { a, b: ONE, h, k };
    const p1 = [h, k];
    const p2 = [add(h, run), add(k, multiply(a, run))];
    const rise = subtract(p2[1], p1[1]);
    return {
      prompt: `The dashed target is the line through ${pt(p1)} and ${pt(p2)}. Find a, h and k so that your line y = a(x - h) + k lands on it.`,
      steps: [
        `With b at one, a is the slope: (${show(p2[1])} - ${paren(p1[1])}) ÷ (${show(p2[0])} - ${paren(p1[0])}) = ${show(rise)} ÷ ${show(run)} = ${show(a)}, so a = ${show(a)}.`,
        `(h, k) can be any point of the target; use ${pt(p1)}: h = ${show(h)} and k = ${show(k)}.`,
        `Check with ${pt(p2)}: ${show(a)} × (${show(p2[0])} - ${paren(h)}) + ${paren(k)} = ${show(p2[1])}.`,
        `Your line is then ${equationText('linear', sibling, null)}. Any point of the target works for (h, k).`,
      ],
      answer: answerText(sibling),
    };
  });
};

const PARENT_POINTS = Object.freeze({
  quadratic: [[2, 4], [-1, 1], [3, 9], [-2, 4]],
  absolute: [[-3, 3], [2, 2], [-1, 1], [4, 4]],
  cubic: [[2, 8], [-1, -1], [1, 1], [-2, -8]],
  cubeRoot: [[8, 2], [-1, -1], [-8, -2], [1, 1]],
  squareRoot: [[4, 2], [9, 3], [1, 1]],
  rational: [[2, '1/2'], [-1, -1], [1, 1], [-2, '-1/2']],
});

const siblingPointMap = (question, model, seed) => {
  const { type, spec } = model;
  const bases = type === 'logarithmic' ? unique([show(model.base), '2', '3']).map(R).filter((base) => isInteger(base) && base.n > 1) : [null];
  const points = (base) => (type === 'logarithmic'
    ? [[base, ONE], [multiply(base, base), R(2)]]
    : PARENT_POINTS[type].map(([x, y]) => [R(x), R(y)]));
  const aPool = type === 'rational' ? INTEGER_A : SLOPES_A;
  const candidates = keeping(lazyProduct(aPool, SHIFTS, SHIFTS, bases, [0, 1, 2, 3]),
    ([a, h, k]) => differs(a, spec.a) || differs(h, spec.h) || differs(k, spec.k));
  return firstSafe(question, model, seed, candidates, ([a, h, k, base, which]) => {
    const choices = points(base);
    const parentPoint = choices[which % choices.length];
    const sibling = { a, b: ONE, h, k };
    const image = mapPoint(parentPoint, sibling);
    const equation = equationText(type, sibling, base);
    const back = valueAt(type, sibling, base, image[0]);
    if (back === null || !equals(back, image[1])) return null;
    return {
      prompt: `Map the parent-function point ${pt(parentPoint)} through ${equation}.`,
      steps: [
        `In ${equation}, a = ${show(a)}, h = ${show(h)} and k = ${show(k)}, and nothing multiplies x inside.`,
        'A parent point (x, y) lands at (x + h, a·y + k): x’s do the opposite of the sign in the equation, y’s tell the truth.',
        `New x: ${show(parentPoint[0])} + ${paren(h)} = ${show(image[0])}.`,
        `New y: ${show(a)} × ${paren(parentPoint[1])} + ${paren(k)} = ${show(image[1])}.`,
        `So ${pt(parentPoint)} lands at ${pt(image)}. Check: x - h = ${show(image[0])} - ${paren(h)} = ${show(parentPoint[0])}, where the parent's height is ${show(parentPoint[1])}, and ${show(a)} × ${paren(parentPoint[1])} + ${paren(k)} = ${show(image[1])}.`,
      ],
      answer: pt(image),
    };
  });
};

// Source graphs for the sibling: three points, x increasing.
const SOURCE_XS = Object.freeze([[-3, -1, 2], [-4, 0, 4], [-2, 1, 3], [-5, -2, 1], [1, 3, 6], [-6, -1, 3], [-3, 2, 5], [-6, -4, 5], [-7, -3, 6], [5, 6, 8], [-8, -5, 7]]);
const SOURCE_YS = Object.freeze([[2, -1, 4], [0, 3, -2], [5, 1, 3], [-3, 2, 0], [4, -4, 1], [1, 6, -2], [-5, 6, -3], [7, -2, 5], [-6, 5, 8], [6, -5, -7]]);
const SOURCE_SHAPES = Object.freeze(product(SOURCE_XS, SOURCE_YS).map(([xs, ys]) => xs.map((x, index) => [R(x), R(ys[index])])));
const PLOT_A = Object.freeze([2, -1, '1/2', 3, -2, 1].map(R));
const PLOT_B = Object.freeze([1, -1, 2, '1/2'].map(R));
const PLOT_SHIFTS = Object.freeze([0, 2, -3, 1, -1, 3, -2, 4, -5, 5, 6, -4].map(R));
// Every transformation the sibling may use (not the identity).
const PLOT_SPECS = Object.freeze(product(PLOT_A, PLOT_B, PLOT_SHIFTS, PLOT_SHIFTS)
  .map(([a, b, h, k]) => ({ a, b, h, k }))
  .filter((s) => !(equals(s.a, ONE) && equals(s.b, ONE) && isZero(s.h) && isZero(s.k))));

const parameterWords = (s) => [
  equals(s.a, ONE) ? 'a is one' : `a = ${show(s.a)}`,
  equals(s.b, ONE) ? 'b is one' : `b = ${show(s.b)}`,
  isZero(s.h) ? 'h is zero' : `h = ${show(s.h)}`,
  isZero(s.k) ? 'k is zero' : `k = ${show(s.k)}`,
].join(', ');

const siblingPlot = (question, model, seed) => {
  const { spec } = model;
  // The same kinds of change as this question (which parameters move), new numbers.
  const shape = (s) => [equals(s.a, ONE), equals(s.b, ONE), isZero(s.h), isZero(s.k)].join();
  const all = PLOT_SPECS.filter((s) => !(equals(s.a, spec.a) && equals(s.b, spec.b) && equals(s.h, spec.h) && equals(s.k, spec.k)));
  const same = all.filter((s) => shape(s) === shape(spec));
  const others = all.filter((s) => shape(s) !== shape(spec));
  // A cheap first pass: no number the sibling prints may equal one of this
  // question's numeric answers (the full guard still runs on every text).
  const answerKeys = new Set(guardFor(question, model).map(exact).filter(Boolean).map(show));
  const clashes = (values) => values.some((value) => answerKeys.has(show(value)));
  const printed = (s) => [equals(s.a, ONE) ? null : s.a, equals(s.b, ONE) ? null : s.b, isZero(s.h) ? null : s.h, isZero(s.k) ? null : s.k].filter(Boolean);
  const candidatesFrom = (specs) => keeping(
    lazyProduct(specs.filter((s) => !clashes(printed(s))), SOURCE_SHAPES.map((_, index) => index)),
    ([s, which]) => !clashes(SOURCE_SHAPES[which].flatMap((point) => [...point, ...mapPoint(point, s)])),
  );
  // The same kind of change first; any other kind when every one of those collides.
  return buildPlot(question, model, seed, candidatesFrom(same)) || buildPlot(question, model, seed, candidatesFrom(others));
};

const buildPlot = (question, model, seed, candidates) => {
  return firstSafe(question, model, seed, candidates, ([s, which]) => {
    const sources = SOURCE_SHAPES[which];
    const images = sources.map((point) => mapPoint(point, s));
    const equation = generalText(s);
    // Ordinal words, not S1/P1: a label's digit would read as a number to the guard.
    const ORDINALS = ['first', 'second', 'third'];
    const xWork = (x, image) => {
      if (equals(s.b, ONE) && isZero(s.h)) return `x stays ${show(x)}`;
      const scaled = equals(s.b, ONE) ? show(x) : `${show(x)} ÷ ${paren(s.b)}`;
      return `x = ${scaled}${isZero(s.h) ? '' : ` + ${paren(s.h)}`} = ${show(image)}`;
    };
    const yWork = (y, image) => {
      if (equals(s.a, ONE) && isZero(s.k)) return `y stays ${show(y)}`;
      const scaled = equals(s.a, ONE) ? show(y) : `${show(s.a)} × ${paren(y)}`;
      return `y = ${scaled}${isZero(s.k) ? '' : ` + ${paren(s.k)}`} = ${show(image)}`;
    };
    return {
      prompt: `The graph of y = f(x) runs through ${sources.map(pt).join(', ')}, in that order. Draw ${equation} by transforming each defining point.`,
      steps: [
        `In ${equation}, ${parameterWords(s)}. Each point (x, y) of y = f(x) moves to (x ÷ b + h, a·y + k).`,
        ...sources.map((point, index) => `The ${ORDINALS[index]} point ${pt(point)}: ${xWork(point[0], images[index][0])} and ${yWork(point[1], images[index][1])}, so its image is ${pt(images[index])}.`),
        'Plot the images in the same order and connect them the same way the source points are connected.',
      ],
      answer: `${images.map(pt).join(', ')}, in that order`,
    };
  });
};

const siblingAnchor = (question, model, seed) => {
  const { type, spec } = model;
  if (type === 'logarithmic') {
    const bases = unique([show(model.base), '2', '3']).map(R).filter((base) => isInteger(base) && base.n > 1);
    const candidates = keeping(lazyProduct(SLOPES_A, SHIFTS, SHIFTS, bases), ([, h, k]) => differs(h, spec.h) && differs(k, spec.k));
    return firstSafe(question, model, seed, candidates, ([a, h, k, base]) => {
      const sibling = { a, b: ONE, h, k };
      const point = [add(h, ONE), k];
      const equation = equationText(type, sibling, base);
      return {
        prompt: `The graph of ${equation} is drawn. Find its reference point: the image of the parent's point at height zero.`,
        steps: [
          'The parent logarithm is zero one unit right of its vertical asymptote, the y-axis.',
          `In ${equation} the vertical asymptote is x = ${show(h)}, where x - h is zero. One unit to its right, at x = ${show(point[0])}, the logarithm is zero again.`,
          `There y = ${equals(a, ONE) ? '' : `${show(a)} × `}zero + ${paren(k)}, which is ${show(k)}. So the reference point is ${pt(point)}.`,
        ],
        answer: pt(point),
      };
    });
  }
  const aPool = type === 'rational' ? INTEGER_A : SLOPES_A;
  const candidates = keeping(lazyProduct(aPool, SHIFTS, SHIFTS), ([, h, k]) => differs(h, spec.h) && differs(k, spec.k));
  return firstSafe(question, model, seed, candidates, ([a, h, k]) => {
    const sibling = { a, b: ONE, h, k };
    const equation = equationText(type, sibling, null);
    const { feature } = model;
    const point = [h, k];
    if (type === 'rational') {
      return {
        prompt: `The graph of ${equation} is drawn. Find its asymptote intersection.`,
        steps: [
          'The asymptotes of the reciprocal parent are the two axes, which cross at the origin.',
          `Stretches and reflections leave the asymptotes in place; only the shifts move them. In ${equation}, h = ${show(h)} and k = ${show(k)}, so the asymptotes are x = ${show(h)} and y = ${show(k)}.`,
          `They cross at ${pt(point)}. It is where the asymptotes meet, not a point of the graph: at x = ${show(h)} the denominator is zero.`,
        ],
        answer: pt(point),
      };
    }
    return {
      prompt: `The graph of ${equation} is drawn. Find its ${feature}.`,
      steps: [
        `The parent ${parentPlain(type)} has its ${feature} at the origin.`,
        `Stretches and reflections act around the ${feature} and leave it in place; only the shifts move it. In ${equation}, h = ${show(h)} and k = ${show(k)}.`,
        `So the ${feature} is at ${pt(point)}. Check: at x = ${show(h)} the inside x - h is zero, so y = ${equals(a, ONE) ? '' : `${show(a)} × `}zero + ${paren(k)}, which is ${show(k)}.`,
      ],
      answer: pt(point),
    };
  });
};

/** A multiAnswer item about translations only: a sibling with every shift non-zero. */
const siblingTranslations = (question, model, seed) => {
  const { roles } = model;
  if (![...roles].every((role) => role === 'H' || role === 'V')) return null;
  const wantH = roles.has('H');
  const wantV = roles.has('V');
  const pool = [2, -3, 5, -6, 4, -1, 7, -2, 3, -5, 6, 1].map(R);
  const candidates = product(wantH ? pool : [ZERO], wantV ? pool : [ZERO]);
  return firstSafe(question, model, seed, candidates, ([h, k]) => {
    const spec = { a: ONE, b: ONE, h, k };
    const equation = generalText(spec, 'g(x)');
    const parts = [wantH ? 'horizontal' : null, wantV ? 'vertical' : null].filter(Boolean);
    const hDirection = isNegative(h) ? 'left' : 'right';
    const kDirection = isNegative(k) ? 'down' : 'up';
    const steps = [
      `Compare ${equation} with g(x) = f(x - h) + k${wantH ? `: ${isNegative(h) ? `${shiftText(h)} is x - (${show(h)}), so ` : ''}h = ${show(h)}` : ''}${wantV ? `${wantH ? ',' : ':'} and the number added at the end gives k = ${show(k)}` : ''}.`,
    ];
    if (wantH) steps.push(`Inside, x’s do the opposite of the sign you see: h = ${show(h)} moves the graph ${units(h)} to the ${hDirection}.`);
    if (wantV) steps.push(`Outside, y’s tell the truth: k = ${show(k)} moves the graph ${units(k)} ${kDirection}.`);
    steps.push(`Check: a point (p, q) of y = f(x) moves to (p ${isNegative(h) ? '-' : '+'} ${show(absolute(h))}, q ${isNegative(k) ? '-' : '+'} ${show(absolute(k))}), because g at that x is f(p) ${isNegative(k) ? '-' : '+'} ${show(absolute(k))}.`);
    const answer = [
      wantH ? `horizontal: ${units(h)} to the ${hDirection}` : null,
      wantV ? `vertical: ${units(k)} ${kDirection}` : null,
    ].filter(Boolean).join('; ');
    return {
      prompt: `Describe the ${parts.join(' and ')} translation${parts.length > 1 ? 's' : ''} of ${equation} from y = f(x).`,
      steps,
      answer: `${answer[0].toUpperCase()}${answer.slice(1)}`,
    };
  });
};

export const similarProblem = (question, { seed = 0 } = {}) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    if (model.kind === 'describeEquation') return siblingTranslations(question, model, seed);
    switch (model.mode) {
      case 'match':
      case 'identify':
        return siblingReading(question, model, seed);
      case 'pointMap':
        return siblingPointMap(question, model, seed);
      case 'plotTransform':
        return siblingPlot(question, model, seed);
      case 'anchor':
        return siblingAnchor(question, model, seed);
      default:
        // describe: a worked description states verdicts, and every verdict is an option here.
        return null;
    }
  } catch {
    return null;
  }
};
