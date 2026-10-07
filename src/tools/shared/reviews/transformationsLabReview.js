// Worked solution review for transformationsLab (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/transformationsLab.mjs). The question is
// read by resolveTransformationsQuestion — the same reader the lab draws from
// and the grader marks from — so the a, b, h, k, family, parent point and
// source points below are, by construction, the graded ones:
//
//   match          the target's own a, (b,) h, k: the student's graph then IS
//                  the target. Any parameters drawing the same graph over the
//                  window are also accepted, and the note says so.
//   identify       a, h, k of the drawn function (b is the lab's fixed 1).
//   pointMap       the parent point carried to (x/b + h, ay + k).
//   plotTransform  every source point carried to (x/b + h, ay + k), in order.
//   describe       the ten descriptions of transformationDescriptor.
//   anchor         the transformed defining feature (transformedAnchor).
//
// Every review is then graded, as the work a student following it would
// submit, by that grader through the bytes the server reads
// (gradeWorkWithGrader). A review the grader would not mark correct is null.
//
// NULL — never a guess — when:
//   - the mode is not one of the lab's six (the lab shows no panel for it), or
//     the question authors no function / target for the mode to read;
//   - a, b, h or k is not a finite number, a = 0 (no transformation to undo),
//     an exponential or logarithmic base is not a positive number other than
//     1, or the function's own type disagrees with the lab's family;
//   - a number the review would print is neither a short decimal nor a
//     fraction with denominator up to 1000;
//   - identify, describe or anchor ask the student to READ a value off a graph
//     that does not fix it. The grader marks the question's own a, h, k, but
//       · a line has no distinguished point, so h and k are not readable;
//       · an exponential's a and h trade off (2·2^(x−1) is 2^x), so its a, h,
//         reference point and descriptions are not readable;
//       · with an inside multiplier b ≠ 1 (or a b box), a and b trade off
//         (|2x| is 2|x|), so identify and describe are not readable, and a
//         logarithm's reference point moves with that choice.
//     The vertex, inflection point, endpoint and asymptote intersection are
//     shapes of the graph itself, so anchor stays covered for any b there.
//     A worked solution for those cases would present an arbitrary choice as
//     a deduction; the review states nothing instead.
//   - a plotTransform source point is not a finite coordinate pair, or a
//     pointMap parent point is not the [x, y] pair the lab prints.
//
// Shown only once the question is closed (QuestionEngine); pure, no React.
import transformationsGrader from '../../../../functions/shared/serverGrading/tools/transformationsLab.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { TRANSFORMATIONS_LAB_MODES } from '../../../../functions/shared/serverGrading/declarations/transformationsLab.mjs';
import { exactFractionText, round } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  TRANSFORMATION_FAMILY_LABELS,
  evaluateParentFunction,
  evaluateTransformedFunction,
  mapParentPoint,
  resolveTransformationsQuestion,
  transformationDescriptor,
} from '../../../../functions/shared/toolMath/transformations/transformationsMath.mjs';

export const implemented = true;

const EPSILON = 1e-9;
const isZero = (value) => Math.abs(value) <= EPSILON;
const same = (left, right) => Number.isFinite(left) && Number.isFinite(right)
  && Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left), Math.abs(right));
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const capitalize = (text) => String(text).replace(/^./, (character) => character.toUpperCase());

// Families whose graph fixes a, h and k once b = 1 (the identify/describe
// boxes' own form, y = a·f(x − h) + k).
const READABLE_FAMILIES = new Set(['quadratic', 'absolute', 'cubic', 'cubeRoot', 'squareRoot', 'rational', 'logarithmic']);
// The defining feature at the parent's origin — a shape of the graph, so it
// lands at (h, k) whatever a and b are.
const ORIGIN_FEATURES = Object.freeze({
  quadratic: 'vertex',
  absolute: 'vertex',
  cubic: 'inflection point',
  cubeRoot: 'inflection point',
  squareRoot: 'endpoint',
  rational: 'asymptote intersection',
});
const FEATURE_CHECKS = Object.freeze({
  vertex: 'the point where the graph turns',
  'inflection point': 'the point where the graph changes the way it bends',
  endpoint: 'the point where the graph starts',
});

/*
 * Numbers as the review prints them: a short decimal (at most 4 places) when
 * the value is one, else an exact fraction (denominator up to 1000). `exact()`
 * turns false the moment a printed number is neither, and the builder then
 * states nothing.
 */
const makeWriter = () => {
  let exact = true;
  const shortDecimal = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) >= 1e9) return null;
    const rounded = round(number, 4);
    if (Math.abs(rounded - number) > EPSILON * Math.max(1, Math.abs(number))) return null;
    const text = String(rounded === 0 ? 0 : rounded);
    return /e/i.test(text) ? null : text;
  };
  const fraction = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) >= 1e9) return null;
    const match = /^(-?)(\d+)\/(\d+)$/.exec(exactFractionText(number, 1000));
    return match ? { negative: match[1] === '-', numerator: match[2], denominator: match[3] } : null;
  };
  const tex = (value) => {
    const decimal = shortDecimal(value);
    if (decimal != null) return decimal;
    const parts = fraction(value);
    if (parts) return `${parts.negative ? '-' : ''}\\frac{${parts.numerator}}{${parts.denominator}}`;
    exact = false;
    return '0';
  };
  const plain = (value) => {
    const decimal = shortDecimal(value);
    if (decimal != null) return decimal;
    const parts = fraction(value);
    if (parts) return `${parts.negative ? '-' : ''}${parts.numerator}/${parts.denominator}`;
    exact = false;
    return '0';
  };
  // A value after an operator: negatives in parentheses.
  const paren = (value) => {
    const text = tex(value);
    return text.startsWith('-') ? `(${text})` : text;
  };
  // What a student types into a number box, and how the review shows it.
  const entry = (value, digits) => {
    const decimal = shortDecimal(value);
    if (decimal != null) return { typed: decimal, shown: decimal };
    const rounded = round(Number(value), digits);
    const typed = String(rounded === 0 ? 0 : rounded);
    if (!Number.isFinite(rounded) || /e/i.test(typed)) exact = false;
    return { typed, shown: `${plain(value)} ≈ ${typed}` };
  };
  return { tex, plain, paren, entry, exact: () => exact };
};

/* ------------------------------------------------------------------ */
/* the function, written from its a, b, h, k                           */
/* ------------------------------------------------------------------ */

const shiftTex = (w, h) => (isZero(h) ? 'x' : `x ${h > 0 ? '-' : '+'} ${w.tex(Math.abs(h))}`);
const insideTex = (w, b, h) => {
  const shift = shiftTex(w, h);
  if (b === 1) return { text: shift, simple: isZero(h) };
  const coefficient = b === -1 ? '-' : w.tex(b);
  return { text: isZero(h) ? `${coefficient}x` : `${coefficient}(${shift})`, simple: false };
};
const constantTex = (w, k) => (isZero(k) ? '' : ` ${k > 0 ? '+' : '-'} ${w.tex(Math.abs(k))}`);
const baseTex = (w, base) => {
  const text = w.tex(base);
  return text.includes('\\frac') ? `\\left(${text}\\right)` : text;
};

const coreTex = (w, type, inside, base) => {
  const { text, simple } = inside;
  if (type === 'quadratic') return simple ? 'x^{2}' : `(${text})^{2}`;
  if (type === 'cubic') return simple ? 'x^{3}' : `(${text})^{3}`;
  if (type === 'absolute') return `\\left|${text}\\right|`;
  if (type === 'squareRoot') return `\\sqrt{${text}}`;
  if (type === 'cubeRoot') return `\\sqrt[3]{${text}}`;
  if (type === 'exponential') return `${baseTex(w, base)}^{${text}}`;
  if (type === 'logarithmic') return `\\log_{${w.tex(base)}}(${text})`;
  return null;
};

/** The right-hand side of y = a·f(b(x − h)) + k for this family. */
const rightSideTex = (w, spec) => {
  const { type, a, b, h, k, base } = spec;
  const inside = insideTex(w, b, h);
  let body;
  if (type === 'linear') {
    if (inside.simple) body = a === 1 ? 'x' : a === -1 ? '-x' : `${w.tex(a)}x`;
    else if (a === 1) body = b === 1 && !isZero(k) ? `(${inside.text})` : inside.text;
    else body = `${a === -1 ? '-' : w.tex(a)}(${inside.text})`;
  } else if (type === 'rational') {
    const magnitude = w.tex(Math.abs(a));
    body = magnitude.includes('\\frac')
      ? `${w.tex(a)} \\cdot \\frac{1}{${inside.text}}`
      : `${a < 0 ? '-' : ''}\\frac{${magnitude}}{${inside.text}}`;
  } else {
    const core = coreTex(w, type, inside, base);
    if (core == null) return null;
    body = a === 1 ? core : a === -1 ? `-${core}` : type === 'exponential' ? `${w.tex(a)} \\cdot ${core}` : `${w.tex(a)}${core}`;
  }
  return `${body}${constantTex(w, k)}`;
};
const parentTex = (w, spec) => rightSideTex(w, { ...spec, a: 1, b: 1, h: 0, k: 0 });

/** y = a·f(b(x − h)) + k with f the source graph (plotTransform). */
const generalTex = (w, spec) => {
  const inside = insideTex(w, spec.b, spec.h);
  const core = `f(${inside.text})`;
  const body = spec.a === 1 ? core : spec.a === -1 ? `-${core}` : `${w.tex(spec.a)}${core}`;
  return `${body}${constantTex(w, spec.k)}`;
};

const parametersTex = (w, spec, keys = ['a', 'b', 'h', 'k']) => keys.map((key) => `$${key} = ${w.tex(spec[key])}$`).join(', ');
const pointTex = (w, [x, y]) => `(${w.tex(x)}, ${w.tex(y)})`;
const pointPlain = (w, [x, y]) => `(${w.plain(x)}, ${w.plain(y)})`;

// (x, y) → (x/b + h, ay + k), unrounded (mapParentPoint rounds to 6 places,
// which would turn 7/3 into a decimal). Checked against it before use.
const mapExact = ([x, y], spec) => [x / spec.b + spec.h, spec.a * y + spec.k];
const mapsLikeGrader = (point, spec) => {
  const exact = mapExact(point, spec);
  const graded = mapParentPoint(point, spec);
  return Boolean(graded) && same(exact[0], graded[0]) && same(exact[1], graded[1]) ? exact : null;
};

// The arithmetic of one mapped point, as a student writes it.
const xWorkTex = (w, x, spec) => (spec.b === 1
  ? `${w.tex(x)} + ${w.paren(spec.h)}`
  : `\\frac{${w.tex(x)}}{${w.tex(spec.b)}} + ${w.paren(spec.h)}`);
const yWorkTex = (w, y, spec) => (spec.a === 1
  ? `${w.tex(y)} + ${w.paren(spec.k)}`
  : `${w.tex(spec.a)} \\cdot ${w.paren(y)} + ${w.paren(spec.k)}`);
// Undoing it: ((x − h)·b, (y − k)/a).
const undoTex = (w, [x, y], [sx, sy], spec) => {
  const across = spec.b === 1
    ? `${w.tex(x)} - ${w.paren(spec.h)} = ${w.tex(sx)}`
    : `(${w.tex(x)} - ${w.paren(spec.h)}) \\cdot ${w.paren(spec.b)} = ${w.tex(sx)}`;
  const up = spec.a === 1
    ? `${w.tex(y)} - ${w.paren(spec.k)} = ${w.tex(sy)}`
    : `\\frac{${w.tex(y)} - ${w.paren(spec.k)}}{${w.tex(spec.a)}} = ${w.tex(sy)}`;
  return `$${across}$ and $${up}$`;
};

const moveText = (w, value, positive, negative) => {
  const distance = w.tex(Math.abs(value));
  return `${value > 0 ? positive : negative} ${distance} unit${Math.abs(value) === 1 ? '' : 's'}`;
};

/* ------------------------------------------------------------------ */
/* reading a, b, h, k off a graph                                      */
/* ------------------------------------------------------------------ */

/*
 * The steps that read the parameters off `subject` (the dashed target, or the
 * graph), and the points of the graph they read — each checked against the
 * function itself before the review uses it. b is read only when it is not 1
 * (match, where a b box is shown).
 */
const readingSteps = (w, spec, subject) => {
  const { type, a, b, h, k, base } = spec;
  const H = w.tex(h);
  const K = w.tex(k);
  const A = w.tex(a);
  const parent = parentTex(w, spec);
  const steps = [];
  const points = [];
  const sideways = (image) => `$${w.tex(image[0])} - ${w.paren(h)} = ${w.tex(1 / b)}$, which is $\\frac{1}{b}$, so $b = ${w.tex(b)}$`;

  if (ORIGIN_FEATURES[type]) {
    const feature = ORIGIN_FEATURES[type];
    const image = mapExact([1, 1], spec);
    if (type === 'rational') {
      steps.push(`The parent $y = ${parent}$ has the asymptotes $x = 0$ and $y = 0$. On ${subject} they are $x = ${H}$ and $y = ${K}$, so $h = ${H}$ and $k = ${K}$.`);
    } else {
      steps.push(`The parent $y = ${parent}$ has its ${feature} at $(0, 0)$. On ${subject} the ${feature} is at $(${H}, ${K})$, so $h = ${H}$ and $k = ${K}$.`);
      points.push([h, k]);
    }
    const from = type === 'rational' ? 'the vertical asymptote' : `the ${feature}`;
    const level = type === 'rational' ? `the asymptote $y = ${K}$` : `the ${feature}`;
    if (b === 1) {
      steps.push(`The parent passes through $(1, 1)$: 1 unit right of $(0, 0)$ and 1 unit up. On ${subject}, 1 unit right of ${from}, at $x = ${w.tex(image[0])}$, the height is $y = ${w.tex(image[1])}$: a change of $${w.tex(image[1])} - ${w.paren(k)} = ${A}$ from ${level}, where the parent's is 1. So $a = ${A}$.`);
    } else {
      steps.push(`The parent's point $(1, 1)$ lands at $${pointTex(w, image)}$ on ${subject}. Across: ${sideways(image)}. Up: $${w.tex(image[1])} - ${w.paren(k)} = ${A}$, which is $a$.`);
    }
    points.push(image);
    return { steps, points };
  }

  if (type === 'logarithmic') {
    const one = mapExact([1, 0], spec);
    const two = mapExact([base, 1], spec);
    steps.push(`The parent $y = ${parent}$ has the vertical asymptote $x = 0$. On ${subject} it is $x = ${H}$, so $h = ${H}$.`);
    steps.push(b === 1
      ? `The parent passes through $(1, 0)$, 1 unit right of its asymptote. On ${subject}, 1 unit right of the asymptote, at $x = ${w.tex(one[0])}$, the height is $y = ${K}$, so $k = ${K}$.`
      : `The parent's point $(1, 0)$ lands at $${pointTex(w, one)}$ on ${subject}: its height gives $k = ${K}$, and across, ${sideways(one)}.`);
    steps.push(`The parent passes through $(${w.tex(base)}, 1)$. On ${subject} that point is at $${pointTex(w, two)}$: a change of $${w.tex(two[1])} - ${w.paren(k)} = ${A}$ from height $k$, where the parent's is 1. So $a = ${A}$.`);
    points.push(one, two);
    return { steps, points };
  }

  if (type === 'exponential') {
    const one = mapExact([0, 1], spec);
    steps.push(`The parent $y = ${parent}$ has the horizontal asymptote $y = 0$. On ${subject} it is $y = ${K}$, so $k = ${K}$.`);
    steps.push(`The parent passes through $(0, 1)$, 1 unit above its asymptote. On ${subject} that point is at $${pointTex(w, one)}$, so $h = ${H}$ and $a = ${w.tex(one[1])} - ${w.paren(k)} = ${A}$.`);
    points.push(one);
    if (b !== 1) {
      const two = mapExact([1, base], spec);
      steps.push(`The parent's point $(1, ${w.tex(base)})$ lands at $${pointTex(w, two)}$. Across: ${sideways(two)}.`);
      points.push(two);
    }
    return { steps, points };
  }

  if (type === 'linear') {
    const image = mapExact([1, 1], spec);
    steps.push(`The parent line $y = x$ passes through $(0, 0)$ with slope 1. ${capitalize(subject)} passes through $(${H}, ${K})$, so use $h = ${H}$ and $k = ${K}$.`);
    steps.push(b === 1
      ? `1 unit right of $(${H}, ${K})$, at $x = ${w.tex(image[0])}$, ${subject} is at $y = ${w.tex(image[1])}$: a change of $${w.tex(image[1])} - ${w.paren(k)} = ${A}$, where the parent's is 1. So $a = ${A}$.`
      : `The parent's point $(1, 1)$ lands at $${pointTex(w, image)}$. Across: ${sideways(image)}. Up: $${w.tex(image[1])} - ${w.paren(k)} = ${A}$, which is $a$.`);
    points.push([h, k], image);
    return { steps, points };
  }
  return null;
};

// Every point the review reads must lie on the function's own graph.
const pointsOnGraph = (spec, points) => points.length > 0
  && points.every(([x, y]) => same(evaluateTransformedFunction(spec, x), y));

const checkPointsText = (w, points) => points
  .map(([x, y]) => `$x = ${w.tex(x)}$ gives $y = ${w.tex(y)}$`)
  .join(' and ');

/* ------------------------------------------------------------------ */
/* the six modes                                                       */
/* ------------------------------------------------------------------ */

const parameterKeys = (resolved) => (resolved.showB ? ['a', 'b', 'h', 'k'] : ['a', 'h', 'k']);

const buildMatch = (w, question, resolved, digits) => {
  const spec = resolved.targetSpec;
  // With no b box the student's b is the lab's fixed 1.
  if (!resolved.showB && spec.b !== 1) return null;
  const reading = readingSteps(w, spec, 'the dashed target');
  if (!reading || !pointsOnGraph(spec, reading.points)) return null;
  const keys = parameterKeys(resolved);
  const entries = Object.fromEntries(keys.map((key) => [key, w.entry(spec[key], digits)]));
  const equation = rightSideTex(w, spec);
  const label = TRANSFORMATION_FAMILY_LABELS[spec.type] || spec.type;
  const xMin = Number(resolved.graphBounds.xMin ?? -7);
  const xMax = Number(resolved.graphBounds.xMax ?? 7);
  const window = Number.isFinite(xMin) && Number.isFinite(xMax) ? `, from $x = ${w.tex(xMin)}$ to $x = ${w.tex(xMax)}$` : '';
  const example = reading.points[reading.points.length - 1];
  return {
    title: 'Transformation-matching solution',
    items: [
      { label: 'Target graph', value: `$y = ${equation}$` },
      ...keys.map((key) => ({ label: key, value: entries[key].shown })),
    ],
    steps: [
      `The dashed target is a transformed ${label.toLowerCase()} graph, $y = a \\cdot f(b(x - h)) + k$ with $f(x) = ${parentTex(w, spec)}$. Read its parameters from the graph.`,
      ...reading.steps,
      `Enter ${keys.map((key) => `$${key} = ${w.tex(spec[key])}$`).join(', ')}. Your graph is then $y = ${equation}$ — the target itself.`,
    ],
    why: `Check: with these values your graph and the target have the same equation, $y = ${equation}$, so they agree at every x in the window${window} — for example, both pass through $${pointTex(w, example)}$.`,
    note: `Match is marked by the graph itself: any ${keys.join(', ')} that draw this same graph over the window shown are also accepted.`,
    work: Object.fromEntries(keys.map((key) => [key, entries[key].typed])),
  };
};

const buildIdentify = (w, question, resolved, digits) => {
  const spec = resolved.investigationSpec;
  if (!READABLE_FAMILIES.has(spec.type) || resolved.showB || spec.b !== 1) return null;
  const reading = readingSteps(w, spec, 'the graph');
  if (!reading || !pointsOnGraph(spec, reading.points)) return null;
  const entries = { a: w.entry(spec.a, digits), h: w.entry(spec.h, digits), k: w.entry(spec.k, digits) };
  const equation = rightSideTex(w, spec);
  return {
    title: 'Parameter solution',
    items: [
      { label: 'a', value: entries.a.shown },
      { label: 'h', value: entries.h.shown },
      { label: 'k', value: entries.k.shown },
      { label: 'Function', value: `$y = ${equation}$` },
    ],
    steps: [
      `The graph is the parent $f(x) = ${parentTex(w, spec)}$ moved by $y = a \\cdot f(x - h) + k$ (the lab keeps $b = 1$). Read a, h and k from the graph.`,
      ...reading.steps,
      `So ${parametersTex(w, spec, ['a', 'h', 'k'])}, and the graph is $y = ${equation}$.`,
    ],
    why: `Check: substitute back into $y = ${equation}$: ${checkPointsText(w, reading.points)} — the ${reading.points.length === 1 ? 'point' : 'points'} read from the graph.`,
    note: null,
    work: { a: entries.a.typed, h: entries.h.typed, k: entries.k.typed },
  };
};

const SCALE_WORDS = { stretch: 'Stretch', compression: 'Compression', unchanged: 'Unchanged' };
const DIRECTION_WORDS = { left: 'Left', right: 'Right', up: 'Up', down: 'Down', none: 'None' };

const scaleSentence = (w, kind, factor, direction) => {
  if (kind === 'stretch') return `is greater than 1 — a ${direction} stretch by a factor of ${w.tex(factor)}`;
  if (kind === 'compression') return `is between 0 and 1 — a ${direction} compression by a factor of ${w.tex(factor)}`;
  return `is 1 — the ${direction} scale is unchanged (factor 1)`;
};

const buildDescribe = (w, question, resolved, digits) => {
  const spec = resolved.investigationSpec;
  if (!READABLE_FAMILIES.has(spec.type) || spec.b !== 1) return null;
  const reading = readingSteps(w, spec, 'the graph');
  if (!reading || !pointsOnGraph(spec, reading.points)) return null;
  const descriptor = transformationDescriptor(spec);
  const equation = rightSideTex(w, spec);
  const verticalFactor = w.entry(descriptor.verticalScale, digits);
  const horizontalFactor = w.entry(descriptor.horizontalScale, digits);
  const horizontalDistance = w.entry(descriptor.horizontalDistance, digits);
  const verticalDistance = w.entry(descriptor.verticalDistance, digits);
  const work = {
    reflection: descriptor.reflection ? 'yes' : 'no',
    scaleKind: descriptor.verticalScaleKind,
    scaleFactor: verticalFactor.typed,
    horizontalReflection: descriptor.horizontalReflection ? 'yes' : 'no',
    horizontalScaleKind: descriptor.horizontalScaleKind,
    horizontalScaleFactor: horizontalFactor.typed,
    horizontalDirection: descriptor.horizontalDirection,
    horizontalDistance: horizontalDistance.typed,
    verticalDirection: descriptor.verticalDirection,
    verticalDistance: verticalDistance.typed,
  };
  const A = w.tex(spec.a);
  const hStep = descriptor.horizontalDirection === 'none'
    ? '$h = 0$: there is no horizontal translation (None, 0 units).'
    : `Inside, $x - h = ${shiftTex(w, spec.h)}$ with $h = ${w.tex(spec.h)}$: the graph moves ${moveText(w, spec.h, 'right', 'left')} (x's do the opposite of the sign you see).`;
  const kStep = descriptor.verticalDirection === 'none'
    ? '$k = 0$: there is no vertical translation (None, 0 units).'
    : `Outside, $k = ${w.tex(spec.k)}$: the graph moves ${moveText(w, spec.k, 'up', 'down')}.`;
  const rebuilt = [
    `${descriptor.reflection ? 'reflect across the x-axis, ' : ''}${descriptor.verticalScaleKind === 'unchanged' ? 'keep the vertical scale' : `${descriptor.verticalScaleKind === 'stretch' ? 'stretch' : 'compress'} vertically by ${w.tex(descriptor.verticalScale)}`} ($a = ${A}$)`,
    'no horizontal reflection or scale ($b = 1$)',
    descriptor.horizontalDirection === 'none' ? 'no horizontal shift ($h = 0$)' : `shift ${moveText(w, spec.h, 'right', 'left')} ($h = ${w.tex(spec.h)}$)`,
    descriptor.verticalDirection === 'none' ? 'no vertical shift ($k = 0$)' : `shift ${moveText(w, spec.k, 'up', 'down')} ($k = ${w.tex(spec.k)}$)`,
  ];
  return {
    title: 'Transformation description',
    items: [
      { label: 'Reflection across the x-axis?', value: descriptor.reflection ? 'Yes' : 'No' },
      { label: 'Vertical scale', value: SCALE_WORDS[descriptor.verticalScaleKind] },
      { label: 'Vertical scale factor |a|', value: verticalFactor.shown },
      { label: 'Reflection across the y-axis?', value: descriptor.horizontalReflection ? 'Yes' : 'No' },
      { label: 'Horizontal scale', value: SCALE_WORDS[descriptor.horizontalScaleKind] },
      { label: 'Horizontal scale factor 1/|b|', value: horizontalFactor.shown },
      { label: 'Horizontal translation', value: DIRECTION_WORDS[descriptor.horizontalDirection] },
      { label: 'Horizontal shift (units)', value: horizontalDistance.shown },
      { label: 'Vertical translation', value: DIRECTION_WORDS[descriptor.verticalDirection] },
      { label: 'Vertical shift (units)', value: verticalDistance.shown },
    ],
    steps: [
      `Write the graph as $y = a \\cdot f(b(x - h)) + k$ with $f(x) = ${parentTex(w, spec)}$, reading a, h and k from the graph.`,
      ...reading.steps,
      `So the graph is $y = ${equation}$: ${parametersTex(w, spec, ['a', 'h', 'k'])}, and no number multiplies x inside, so $b = 1$.`,
      `Outside, y's tell the truth: $a = ${A}$ is ${spec.a < 0 ? 'negative, so the graph is reflected across the x-axis' : 'positive, so there is no reflection across the x-axis'}, and $|a| = ${w.tex(descriptor.verticalScale)}$ ${scaleSentence(w, descriptor.verticalScaleKind, descriptor.verticalScale, 'vertical')}.`,
      `Inside, x's lie: $b = 1$ is positive, so there is no reflection across the y-axis, and $\\frac{1}{|b|} = ${w.tex(descriptor.horizontalScale)}$ ${scaleSentence(w, descriptor.horizontalScaleKind, descriptor.horizontalScale, 'horizontal')}.`,
      hStep,
      kStep,
    ],
    why: `Check: put the descriptions back together — ${rebuilt.join(', ')} — and the parent $y = ${parentTex(w, spec)}$ becomes $y = ${equation}$, the graph shown.`,
    note: null,
    work,
  };
};

const buildPointMap = (w, question, resolved, digits) => {
  const spec = resolved.investigationSpec;
  // The lab prints parentPoint[0] and parentPoint[1].
  const given = resolved.parentPoint;
  if (!Array.isArray(given) || given.length < 2) return null;
  const parent = [Number(given[0]), Number(given[1])];
  if (!parent.every(Number.isFinite)) return null;
  const image = mapsLikeGrader(parent, spec);
  if (!image) return null;
  const equation = rightSideTex(w, spec);
  if (equation == null) return null;
  const entries = [w.entry(image[0], digits), w.entry(image[1], digits)];
  const onParent = same(evaluateParentFunction(spec.type, parent[0], spec.base), parent[1])
    && same(evaluateTransformedFunction(spec, image[0]), image[1]);
  return {
    title: 'Mapped-point solution',
    items: [
      { label: 'Transformed x', value: entries[0].shown },
      { label: 'Transformed y', value: entries[1].shown },
    ],
    steps: [
      `The transformation is $y = ${equation}$: ${parametersTex(w, spec)}.`,
      'A parent point $(x, y)$ lands at $\\left(\\frac{x}{b} + h,\\ a y + k\\right)$: x\'s do the opposite (divide by b, then add h); y\'s tell the truth (multiply by a, then add k).',
      `Transformed x: $${xWorkTex(w, parent[0], spec)} = ${w.tex(image[0])}$.`,
      `Transformed y: $${yWorkTex(w, parent[1], spec)} = ${w.tex(image[1])}$.`,
      `So the parent point $${pointTex(w, parent)}$ lands at $${pointTex(w, image)}$.`,
    ],
    why: onParent
      ? `Check: $${pointTex(w, parent)}$ is on the parent graph, so its image must be on the new graph — and substituting $x = ${w.tex(image[0])}$ into $y = ${equation}$ gives $y = ${w.tex(image[1])}$.`
      : `Check: undo each step — ${undoTex(w, image, parent, spec)} — and you are back at the parent point.`,
    note: null,
    work: { mappedX: entries[0].typed, mappedY: entries[1].typed },
  };
};

const MAX_POINT_STEPS = 10;

const sourceCoordinates = (point) => {
  const pair = Array.isArray(point) ? [point[0], point[1]] : isPlainObject(point) ? [point.x, point.y] : null;
  if (!pair || pair.some((value) => value === null || value === '' || typeof value === 'boolean')) return null;
  const numbers = pair.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
};

const buildPlotTransform = (w, question, resolved) => {
  const spec = resolved.investigationSpec;
  const sources = resolved.sourcePoints.map(sourceCoordinates);
  if (!sources.length || sources.some((point) => !point)) return null;
  const images = sources.map((point) => mapsLikeGrader(point, spec));
  if (images.some((image) => !image)) return null;
  const lines = sources.map((source, index) => (
    `S${index + 1} $${pointTex(w, source)}$ moves to $\\left(${xWorkTex(w, source[0], spec)},\\ ${yWorkTex(w, source[1], spec)}\\right) = ${pointTex(w, images[index])}$, so P${index + 1} is $${pointTex(w, images[index])}$.`
  ));
  const groupSize = Math.ceil(lines.length / MAX_POINT_STEPS);
  const pointSteps = [];
  for (let index = 0; index < lines.length; index += groupSize) pointSteps.push(lines.slice(index, index + groupSize).join(' '));
  const order = sources.length === 1 ? 'P1'
    : sources.length <= 3 ? `${sources.slice(0, -1).map((point, index) => `P${index + 1}`).join(', ')} and P${sources.length}`
      : `P1, P2, …, P${sources.length}`;
  return {
    title: 'Transformed-graph solution',
    items: images.map((image, index) => ({ label: `P${index + 1} (image of S${index + 1})`, value: pointPlain(w, image) })),
    steps: [
      `The new graph is $y = ${generalTex(w, spec)}$, where $f$ is the source graph: ${parametersTex(w, spec)}. Each source point $(x, y)$ moves to $\\left(\\frac{x}{b} + h,\\ a y + k\\right)$.`,
      ...pointSteps,
      `Plot ${order} in that order — each P is the image of the S with the same number — so they connect the same way the source points do.`,
    ],
    why: `Check P1: undo the moves — ${undoTex(w, images[0], sources[0], spec)} — and you are back at S1 $${pointTex(w, sources[0])}$.`,
    note: 'Order matters: P1 must be the image of S1, P2 the image of S2, and so on.',
    work: { plottedPoints: images.map(([x, y]) => [round(x, 6), round(y, 6)]) },
  };
};

const buildAnchor = (w, question, resolved, digits) => {
  const spec = resolved.investigationSpec;
  const { anchor } = resolved;
  const originFeature = ORIGIN_FEATURES[spec.type];
  if (!originFeature && !(spec.type === 'logarithmic' && spec.b === 1)) return null;
  const image = anchor && Array.isArray(anchor.parentPoint) ? mapsLikeGrader(anchor.parentPoint, spec) : null;
  if (!image || !anchor.point || !same(image[0], anchor.point[0]) || !same(image[1], anchor.point[1])) return null;
  const equation = rightSideTex(w, spec);
  const parent = parentTex(w, spec);
  const label = String(anchor.label);
  const entries = [w.entry(image[0], digits), w.entry(image[1], digits)];
  const H = w.tex(spec.h);
  const K = w.tex(spec.k);
  let steps;
  let why;
  if (spec.type === 'rational') {
    steps = [
      `The parent $y = ${parent}$ has the asymptotes $x = 0$ and $y = 0$, which cross at $(0, 0)$.`,
      `Stretches, compressions and reflections leave the asymptotes in place; only the shifts move them. This graph is $y = ${equation}$, so $h = ${H}$ moves the vertical asymptote to $x = ${H}$ and $k = ${K}$ moves the horizontal one to $y = ${K}$.`,
      `They cross at $(${H}, ${K})$ — the asymptote intersection. It is not a point of the graph; it is where the two asymptotes meet.`,
    ];
    why = `Check: $y = ${equation}$ is undefined at $x = ${H}$ (the denominator is 0 there), and far to the left or right the fraction shrinks toward 0, so y approaches ${K}: the asymptotes are $x = ${H}$ and $y = ${K}$.`;
  } else if (originFeature) {
    if (!same(evaluateTransformedFunction(spec, image[0]), image[1])) return null;
    const moves = [
      isZero(spec.h) ? 'no sideways shift ($h = 0$)' : `$h = ${H}$ moves it ${moveText(w, spec.h, 'right', 'left')}`,
      isZero(spec.k) ? 'no vertical shift ($k = 0$)' : `$k = ${K}$ moves it ${moveText(w, spec.k, 'up', 'down')}`,
    ];
    steps = [
      `The parent $y = ${parent}$ has its ${label} at $(0, 0)$.`,
      `Stretches, compressions and reflections act around the ${label} and leave it in place; only the shifts move it. This graph is $y = ${equation}$: ${moves.join(' and ')}, so the ${label} lands at $(0 + ${w.paren(spec.h)}, 0 + ${w.paren(spec.k)}) = (${H}, ${K})$.`,
      `On the graph, that is where the ${label} is: $(${H}, ${K})$.`,
    ];
    why = `Check: in $y = ${equation}$, $x = ${H}$ gives $y = ${K}$, so $(${H}, ${K})$ is on the graph — ${FEATURE_CHECKS[originFeature]}.`;
  } else {
    if (!same(evaluateTransformedFunction(spec, image[0]), image[1])) return null;
    const base = w.tex(spec.base);
    steps = [
      `The parent $y = ${parent}$ has its ${label} at $(1, 0)$: where it crosses the x-axis, 1 unit right of its asymptote $x = 0$.`,
      `This graph is $y = ${equation}$: ${parametersTex(w, spec)}. A parent point $(x, y)$ moves to $(x + h, a y + k)$, so $(1, 0)$ moves to $(1 + ${w.paren(spec.h)}, ${w.tex(spec.a)} \\cdot 0 + ${w.paren(spec.k)}) = ${pointTex(w, image)}$.`,
      `On the graph: the asymptote is $x = ${H}$, and 1 unit to its right, at $x = ${w.tex(image[0])}$, the height is $y = ${w.tex(image[1])}$.`,
    ];
    why = `Check: in $y = ${equation}$, $x = ${w.tex(image[0])}$ gives $y = ${w.tex(spec.a)} \\cdot \\log_{${base}}(1) + ${w.paren(spec.k)} = ${w.tex(image[1])}$, because $\\log_{${base}}(1) = 0$.`;
  }
  return {
    title: 'Defining-feature solution',
    items: [
      { label: `${capitalize(label)} x-coordinate`, value: entries[0].shown },
      { label: `${capitalize(label)} y-coordinate`, value: entries[1].shown },
    ],
    steps,
    why,
    note: null,
    work: { anchorX: entries[0].typed, anchorY: entries[1].typed },
  };
};

const MODE_BUILDERS = Object.freeze({
  match: buildMatch,
  identify: buildIdentify,
  pointMap: buildPointMap,
  plotTransform: buildPlotTransform,
  describe: buildDescribe,
  anchor: buildAnchor,
});

/* ------------------------------------------------------------------ */
/* the builder                                                         */
/* ------------------------------------------------------------------ */

const usableSpec = (spec, family) => {
  if (!spec || spec.type !== family) return false;
  if (!['a', 'b', 'h', 'k'].every((key) => Number.isFinite(spec[key]))) return false;
  if (isZero(spec.a)) return false;
  if (spec.type === 'exponential' || spec.type === 'logarithmic') {
    return Number.isFinite(spec.base) && spec.base > 0 && spec.base !== 1;
  }
  return true;
};

const acceptedByGrader = (question, work) => {
  const result = gradeWorkWithGrader({ grader: transformationsGrader, question, work });
  return result.graded === true && result.isCorrect === true;
};

export const buildTransformationsLabReview = (question) => {
  try {
    if (!isPlainObject(question)) return null;
    // The lab reads `questionData.mode || 'match'` and shows a panel only for
    // its six modes; anything else has no screen to review.
    const mode = question.mode || 'match';
    if (!TRANSFORMATIONS_LAB_MODES.includes(mode)) return null;
    const support = transformationsGrader.support(question);
    if (!support || support.supported !== true || support.mode !== mode) return null;
    // The spec this mode reads must be authored: match reads `target`, every
    // other mode `function || target` — a bare {} is no question.
    const authored = mode === 'match' ? question.target : (question.function || question.target);
    if (!isPlainObject(authored)) return null;
    const resolved = resolveTransformationsQuestion(question);
    const spec = mode === 'match' ? resolved.targetSpec : resolved.investigationSpec;
    if (!usableSpec(spec, resolved.family)) return null;

    // Entries are short decimals; a value that is not one is shown with 3
    // decimal places, and with 6 if the grader needs them.
    for (const digits of [3, 6]) {
      const writer = makeWriter();
      const draft = MODE_BUILDERS[mode](writer, question, resolved, digits);
      if (!draft || !writer.exact()) return null;
      if (!acceptedByGrader(question, draft.work)) continue;
      return {
        title: draft.title,
        items: draft.items,
        steps: draft.steps,
        why: draft.why,
        note: draft.note,
      };
    }
    return null;
  } catch {
    return null;
  }
};

export default buildTransformationsLabReview;
