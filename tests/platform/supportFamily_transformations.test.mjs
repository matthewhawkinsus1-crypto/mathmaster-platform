/*
 * THE transformations SUPPORT FAMILY, ON REAL ITEMS.
 *
 * src/platform/supports/families/transformations.js gives the platform Hint
 * control, "Try a similar one" and the inclusion "Let's back up" step their
 * content for function transformations. Every item here is one a student can
 * actually be given, or is drawn exactly in that shape:
 *
 *   - the teacher-import-jsons corpus compiled by compileAuthoringIntentV5 (the
 *     way an authored document reaches a classroom): every transformationsLab
 *     item (match, identify, pointMap, plotTransform, describe; describe,
 *     pointMap and plotTransform only where the prompt states the
 *     transformation, since the graph alone does not fix their key) and every
 *     multiAnswer transformation description (L1_Absolute_Value_ALEKS_Bridge,
 *     L2_Day2_Transformations);
 *   - SAMPLE_BATCH_D_DEEP_DIVE / SAMPLE_MISSING_MATH_TOOLS: the lab's sample
 *     items in every mode (anchor included);
 *   - seeded draws (≥ 60 per shape) of each lab mode in every family it is
 *     claimed for, and of multiAnswer descriptions, with the edge cases: a = −1,
 *     fractional a and b, b = −1, h = 0, k = 0, decay bases (1/2), the
 *     asymptote-defined families, and a b box.
 *
 * There are no platform Question Families or Path bank templates of this
 * shape (no registered family id is a transformation; the Path bank's
 * transformation items are graphWorkspace / choice / equation templates, which
 * are server-graded and owned elsewhere), so none is claimed.
 *
 * Every answer the tests compare against is computed INDEPENDENTLY of the
 * family: from the shared grader's own reader and map
 * (resolveTransformationsQuestion, mapParentPoint, transformedSourcePoints,
 * transformedAnchor, transformationDescriptor), cross-checked in exact mathjs
 * fractions; and for a multiAnswer item from its authored key and options. The
 * worked siblings are re-solved from their own prompts with mathjs and this
 * file's own parent functions: every stated point must lie on the stated graph,
 * the stated answer must be the one the prompt determines, and every
 * arithmetic chain "… = …" in a step is evaluated.
 *
 * Mutation-checked (each went red, then was restored):
 *   - mapPoint divided by b became a multiply → the plotTransform expectedValues
 *     test ("… is not an answer") and the plotTransform sibling re-solve fail;
 *   - choose() returned the numbered spelling unconditionally and the describe
 *     ladder's first hint was made to end "… (MUTATION: stretch)" → the leak
 *     test fails on the describe items;
 *   - the multiAnswer expectedValues listed only the keyed option, not every
 *     option → the "every option is covered" test fails;
 *   - exponential was added to the families identify/describe may read → the
 *     claim test fails on the real exponential describe item and the draws;
 *   - the reading sibling's first point was put one unit too high (a + k + 1)
 *     → the reading sibling re-solve fails;
 *   - describe was claimed with no stated transformation → the claim test (the
 *     real square-root describe item) and the "prompt states exactly the graded
 *     transformation" test fail;
 *   - plotTransform went back to "the prompt contains '='" → the "prompt
 *     states" test fails on "Draw the graph of y=g(x) …";
 *   - statedTransformation accepted an equation that disagrees with the key →
 *     the "prompt states" test fails (the twin's equation, a second equation);
 *   - the log describe shift hint went back to "compare where that feature
 *     sits … the vertical shift is k" → the "prompt states" test fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { all, create } from 'mathjs';

import * as transformations from '../../src/platform/supports/families/transformations.js';
import { ALL_FAMILY_MODULES, familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
// The shared grader's reader and maps ARE the key of a lab question.
import {
  evaluateTransformedFunction,
  mapParentPoint,
  resolveTransformationsQuestion,
  transformationDescriptor,
  transformedAnchor,
  transformedSourcePoints,
} from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const math = create(all);
const text = (value) => String(value ?? '').trim();
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

/* ---------------------------------------------------------------------------
 * The items.
 * ------------------------------------------------------------------------- */

const questionsIn = (value) => {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if ((node.type || node.toolId) && (node.prompt || node.answerFields)) { out.push(node); return; }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return out;
};

const corpusFiles = () => {
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.json')) files.push(full);
  });
  walk(path.join(ROOT, 'teacher-import-jsons'));
  return files.sort();
};

const CORPUS = corpusFiles().flatMap((file) => {
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(file, 'utf8')));
  return questionsIn(compiled.package || compiled).map((question) => ({ source: path.basename(file), question }));
});

const SAMPLES = ['SAMPLE_BATCH_D_DEEP_DIVE.json', 'SAMPLE_MISSING_MATH_TOOLS.json'].flatMap((name) => {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.toolId === 'transformationsLab' || node.type === 'transformationsLab') { out.push({ source: name, question: node }); return; }
    Object.values(node).forEach(visit);
  };
  visit(JSON.parse(readFileSync(path.join(ROOT, name), 'utf8')));
  return out;
});

const isLab = (question) => question.type === 'transformationsLab' || question.toolId === 'transformationsLab';
const LAB_CORPUS = [...CORPUS.filter(({ question }) => isLab(question)), ...SAMPLES];
const DESCRIBE_CORPUS = CORPUS.filter(({ question }) => question.type === 'multiAnswer'
  && /translation|scale|reflection|^transformation$/i.test((question.answerFields || []).map((field) => field.label).join('|')));

// Seeded draws.
const mulberry = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (random, values) => values[Math.floor(random() * values.length)];

const ORIGIN_TYPES = ['quadratic', 'absolute', 'cubic', 'cubeRoot', 'squareRoot', 'rational'];
const READABLE_TYPES = [...ORIGIN_TYPES, 'logarithmic'];
const ALL_TYPES = [...READABLE_TYPES, 'exponential', 'linear'];
const A_VALUES = [-1, 2, -2, 0.5, -0.5, 3, -3, 1, 0.25, 1.5];
const SHIFT_VALUES = [0, 0, 1, -1, 2, -2, 3, -3, 4, -5, 0.5];

const drawSpec = (random, type, { b = 1 } = {}) => {
  // An authored b (even 1) makes the lab show a b box, so b is written only when it is not 1.
  const spec = { type, a: pick(random, A_VALUES), ...(b === 1 ? {} : { b }), h: pick(random, SHIFT_VALUES), k: pick(random, SHIFT_VALUES) };
  if (type === 'exponential') spec.base = pick(random, [2, 3, 0.5, 2]);
  if (type === 'logarithmic') spec.base = pick(random, [2, 3, 10]);
  return spec;
};

// The transformation a prompt states, written by this file (independently of
// the family): the family's own notation, or g(x) = A·f(B(x − h)) + k.
const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const writtenNumber = (value) => String(Math.abs(value));
const writtenFactor = (value, style) => {
  if (value === 1) return '';
  if (value === -1) return '−';
  const body = Number.isInteger(value) || style === 0 ? writtenNumber(value) : `(${math.fraction(Math.abs(value)).n}/${math.fraction(Math.abs(value)).d})`;
  return `${value < 0 ? '−' : ''}${body}`;
};
const writtenShift = (h) => (h === 0 ? 'x' : `x ${h > 0 ? '−' : '+'} ${Math.abs(h)}`);
const writtenTail = (k) => (k === 0 ? '' : ` ${k > 0 ? '+' : '−'} ${Math.abs(k)}`);
const writtenInside = (b, h, style) => {
  if (b === 1) return writtenShift(h);
  return h === 0 ? `${writtenFactor(b, style)}x` : `${writtenFactor(b, style)}(${writtenShift(h)})`;
};
const writtenTransformation = (spec, style) => {
  const { type, a, h, k } = spec;
  const b = spec.b ?? 1;
  const A = writtenFactor(a, style % 2);
  const tail = writtenTail(k);
  if (style === 2 || b !== 1 || type === 'linear' || type === 'exponential') return `g(x) = ${A}f(${writtenInside(b, h, style % 2)})${tail}`;
  const inside = writtenShift(h);
  const group = h === 0 ? 'x' : `(${inside})`;
  switch (type) {
    case 'quadratic': return `y = ${A}${group}²${tail}`;
    case 'cubic': return `y = ${A}${group}³${tail}`;
    case 'absolute': return `y = ${A}|${inside}|${tail}`;
    case 'squareRoot': return `y = ${A}√(${inside})${tail}`;
    case 'cubeRoot': return `y = ${A}∛(${inside})${tail}`;
    case 'rational': return `y = ${a < 0 ? '−' : ''}${writtenNumber(a)}/(${inside})${tail}`;
    case 'logarithmic': return `y = ${A}log${spec.base === 10 ? '' : [...String(spec.base)].map((digit) => SUBSCRIPTS[Number(digit)]).join('')}(${inside})${tail}`;
    default: throw new Error(type);
  }
};
// The parent itself states no transformation.
const notParent = (spec) => (spec.a === 1 && (spec.b ?? 1) === 1 && spec.h === 0 && spec.k === 0 ? { ...spec, k: 2 } : spec);

const DRAWS = (() => {
  const random = mulberry(20261010);
  const out = { match: [], identify: [], describe: [], pointMap: [], plotTransform: [], anchor: [] };
  for (let index = 0; index < 64; index += 1) {
    const type = ALL_TYPES[index % ALL_TYPES.length];
    const withB = index % 5 === 0;
    const target = drawSpec(random, type, { b: withB ? pick(random, [2, -1, 0.5]) : 1 });
    out.match.push({ source: `draw-match-${index}`, question: { type: 'transformationsLab', mode: 'match', family: type, target, ...(withB ? { initial: { a: 1, b: 1, h: 0, k: 0 } } : {}), prompt: `Match the dashed ${type} target.` } });
  }
  for (const mode of ['identify', 'describe', 'pointMap']) {
    for (let index = 0; index < 63; index += 1) {
      const type = READABLE_TYPES[index % READABLE_TYPES.length];
      const fn = mode === 'identify' ? drawSpec(random, type) : notParent(drawSpec(random, type));
      // describe and pointMap are claimed only when the prompt states the transformation.
      const prompt = mode === 'identify' ? `${mode} the transformed ${type} graph.`
        : mode === 'describe' ? `Describe the transformations in ${writtenTransformation(fn, index % 3)}.`
          : `Map the parent-function point through ${writtenTransformation(fn, index % 3)}.`;
      const question = { type: 'transformationsLab', mode, family: type, function: fn, prompt };
      if (mode === 'pointMap') question.parentPoint = pick(random, [[1, 1], [2, 4], [4, 2], [-1, -1], [8, 2], [9, 3]]);
      out[mode].push({ source: `draw-${mode}-${index}`, question });
    }
  }
  for (let index = 0; index < 64; index += 1) {
    const type = pick(random, ['linear', 'linear', 'absolute', 'quadratic']);
    const fn = notParent({ type, a: pick(random, [1, -1, 2, 0.5, -2, 3]), b: pick(random, [1, 1, -1, 2, 0.5]), h: pick(random, SHIFT_VALUES), k: pick(random, SHIFT_VALUES) });
    const count = 2 + Math.floor(random() * 4);
    const xs = [...new Set(Array.from({ length: count * 2 }, () => Math.floor(random() * 15) - 7))].sort((p, q) => p - q).slice(0, count);
    const sourcePoints = xs.map((x) => ({ x, y: Math.floor(random() * 13) - 6 }));
    out.plotTransform.push({ source: `draw-plot-${index}`, question: { type: 'transformationsLab', mode: 'plotTransform', family: type, function: fn, sourcePoints, prompt: `A graph of y=f(x) is shown. Draw the graph of ${writtenTransformation(fn, index % 3).replace(/^y = /, 'y=')} by transforming each defining point.` } });
  }
  for (let index = 0; index < 64; index += 1) {
    const type = [...ORIGIN_TYPES, 'logarithmic'][index % 7];
    const b = type === 'logarithmic' ? 1 : pick(random, [1, 1, 2, -1, 0.5]);
    out.anchor.push({ source: `draw-anchor-${index}`, question: { type: 'transformationsLab', mode: 'anchor', family: type, function: drawSpec(random, type, { b }), prompt: 'Find the transformed defining feature.' } });
  }
  return out;
})();

/* --- multiAnswer descriptions, written and keyed by this file ------------ */

const F = (value) => math.fraction(value);
const fracText = (value) => {
  const f = F(value);
  const n = Number(f.s * f.n);
  const d = Number(f.d);
  return d === 1 ? String(n) : `${n}/${d}`;
};
const uminus = (value) => value.replace(/-/g, '−');
const factorWritten = (value) => {
  if (value === 1) return '';
  if (value === -1) return '−';
  const body = Number.isInteger(value) ? String(Math.abs(value)) : `(${fracText(Math.abs(value))})`;
  return `${value < 0 ? '−' : ''}${body}`;
};
const insideWritten = (B, C) => {
  const shift = C === 0 ? 'x' : `x${C > 0 ? '−' : '+'}${Math.abs(C)}`;
  if (B === 1) return shift;
  return C === 0 ? `${factorWritten(B)}x` : `${factorWritten(B)}(${shift})`;
};
const tailWritten = (D) => (D === 0 ? '' : `${D > 0 ? '+' : '−'}${Math.abs(D)}`);

// The key, as this file reads g(x) = A·f(B(x − C)) + D.
const ORACLE = {
  H: ({ C }) => (C === 0 ? 'none' : `${C > 0 ? 'right' : 'left'} ${Math.abs(C)}`),
  V: ({ D }) => (D === 0 ? 'none' : `${D > 0 ? 'up' : 'down'} ${Math.abs(D)}`),
  VS: ({ A }) => (Math.abs(A) === 1 ? 'unchanged' : `${Math.abs(A) > 1 ? 'stretch' : 'compression'} by ${fracText(Math.abs(A))}`),
  HS: ({ B }) => (Math.abs(B) === 1 ? 'unchanged' : `${1 / Math.abs(B) > 1 ? 'stretch' : 'compression'} by ${fracText(1 / Math.abs(B))}`),
  HR: ({ B }) => (B < 0 ? 'across the y-axis' : 'none'),
  VR: ({ A }) => (A < 0 ? 'across the x-axis' : 'none'),
  VERTEX: ({ C, D }) => uminus(`(${C}, ${D})`),
  RANGE: ({ A, D }) => uminus(A < 0 ? `(-∞, ${D}]` : `[${D}, ∞)`),
};
const LABELS = { H: 'Horizontal translation', V: 'Vertical translation', VS: 'Vertical scale', HS: 'Horizontal scale', HR: 'Horizontal reflection', VR: 'Vertical reflection', VERTEX: 'Vertex', RANGE: 'Range' };
const DECOYS = {
  H: ({ C }) => { const n = Math.abs(C) || 3; return [`right ${n}`, `left ${n}`, 'none']; },
  V: ({ D }) => { const n = Math.abs(D) || 2; return [`up ${n}`, `down ${n}`, 'none']; },
  VS: ({ A }) => { const m = Math.abs(A) === 1 ? 2 : Math.abs(A) > 1 ? Math.abs(A) : 1 / Math.abs(A); return [`stretch by ${fracText(m)}`, `compression by ${fracText(1 / m)}`, 'unchanged']; },
  HS: ({ B }) => { const m = Math.abs(B) === 1 ? 2 : Math.abs(B) > 1 ? Math.abs(B) : 1 / Math.abs(B); return [`stretch by ${fracText(m)}`, `compression by ${fracText(1 / m)}`, 'unchanged']; },
  HR: () => ['across the y-axis', 'across the x-axis', 'none'],
  VR: () => ['across the x-axis', 'across the y-axis', 'none'],
  VERTEX: ({ C, D }) => unique([`(${C}, ${D})`, `(${-C}, ${D})`, `(${C}, ${-D - 1})`].map(uminus)),
  RANGE: ({ D }) => [`(-∞, ${D}]`, `[${D}, ∞)`, `(-∞, ${D + 2}]`].map(uminus),
};

const DESCRIBE_DRAWS = (() => {
  const random = mulberry(424242);
  const out = [];
  for (let index = 0; index < 72; index += 1) {
    const abs = index % 3 === 0;
    const A = pick(random, [1, 1, -1, 2, -2, 3, 0.5, -0.5]);
    const B = pick(random, [1, 1, 1, -1, 2, -2, 0.5, -0.5, 3]);
    const C = pick(random, [0, 1, -1, 2, -3, 4, 5]);
    const D = pick(random, [0, 2, -2, 3, -4, 1]);
    const values = { A, B, C, D };
    const written = abs ? `y=${factorWritten(A)}|${insideWritten(B, C)}|${tailWritten(D)}` : `g(x)=${factorWritten(A)}f(${insideWritten(B, C)})${tailWritten(D)}`;
    if (/^(?:y|g\(x\))=(?:f\(x\)|\|x\|)$/.test(written)) continue;
    const roles = ['H', 'V', 'VS', 'HS', 'HR', 'VR', ...(abs && B === 1 ? ['VERTEX', 'RANGE'] : [])].filter(() => random() < 0.6);
    if (index % 6 === 1) roles.splice(0, roles.length, 'H', 'V');
    if (!roles.some((role) => !['VERTEX', 'RANGE'].includes(role))) roles.push('H');
    const answerFields = roles.map((role) => {
      const options = DECOYS[role](values);
      const answer = ORACLE[role](values);
      if (!options.includes(answer)) options[options.length - 1] = answer;
      const shuffled = [...new Set(options)].sort(() => random() - 0.5);
      return { id: role.toLowerCase(), label: LABELS[role], type: 'choice', options: shuffled, answer, inputProfile: 'choice' };
    });
    out.push({ source: `draw-describe-${index}`, values, question: { type: 'multiAnswer', prompt: `Describe ${written}.`, answerFields } });
  }
  return out;
})();

/* ---------------------------------------------------------------------------
 * The independent key, in every spelling.
 * ------------------------------------------------------------------------- */

const terminating = (d) => { let rest = d; while (rest % 2 === 0) rest /= 2; while (rest % 5 === 0) rest /= 5; return rest === 1; };
const withMinus = (values) => unique(values.flatMap((value) => (value.includes('-') ? [value, value.replace(/-/g, '−')] : [value])));
const numberSpellings = (value) => {
  const f = F(value);
  const n = Number(f.s * f.n);
  const d = Number(f.d);
  if (d === 1) return withMinus([String(n)]);
  const out = [`${n}/${d}`, `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`];
  if (terminating(d)) out.push(String(n / d));
  return withMinus(out);
};
const coordinate = (value) => {
  const f = F(value);
  const n = Number(f.s * f.n);
  const d = Number(f.d);
  return d === 1 ? [String(n)] : [`${n}/${d}`, ...(terminating(d) ? [String(n / d)] : [])];
};
const pairSpellings = ([x, y]) => withMinus(coordinate(x).flatMap((p) => coordinate(y).flatMap((q) => [`(${p}, ${q})`, `(${p},${q})`])));

const exactOf = (value) => F(value);
const close = (left, right, tolerance = 1e-9) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));

const DESCRIBE_WORDS = ['yes', 'no', 'stretch', 'compression', 'unchanged', 'left', 'right', 'none', 'up', 'down'];

/** What the student must find for a lab item: numbers, points, verdicts — read with the grader's own math. */
const labKey = (question) => {
  const mode = question.mode || 'match';
  const resolved = resolveTransformationsQuestion(question);
  const spec = mode === 'match' ? resolved.targetSpec : resolved.investigationSpec;
  const numbers = [];
  const points = [];
  const words = [];
  if (mode === 'match' || mode === 'identify') {
    numbers.push(spec.a, spec.h, spec.k);
    if (mode === 'match' && resolved.showB) numbers.push(spec.b);
  } else if (mode === 'describe') {
    const descriptor = transformationDescriptor(spec);
    numbers.push(descriptor.verticalScale, descriptor.horizontalScale, descriptor.horizontalDistance, descriptor.verticalDistance);
    words.push(...DESCRIBE_WORDS);
  } else if (mode === 'pointMap') {
    const image = mapParentPoint(resolved.parentPoint, spec);
    // Cross-checked exactly: (x/b + h, a·y + k) in fractions.
    const [px, py] = resolved.parentPoint.map(exactOf);
    const exactImage = [math.add(math.divide(px, F(spec.b)), F(spec.h)), math.add(math.multiply(F(spec.a), py), F(spec.k))];
    assert.ok(close(Number(exactImage[0]), image[0], 1e-6) && close(Number(exactImage[1]), image[1], 1e-6), 'the exact image is the grader\'s');
    points.push(exactImage.map(Number));
  } else if (mode === 'plotTransform') {
    points.push(...transformedSourcePoints(resolved.sourcePoints, spec));
  } else {
    points.push(transformedAnchor(spec).point);
  }
  points.forEach((point) => numbers.push(...point));
  return { mode, spec, resolved, numbers, points, words };
};

const labSpellings = (key) => unique([
  ...key.numbers.flatMap(numberSpellings),
  ...key.points.flatMap(pairSpellings),
  ...key.words,
]);

/** Every way a hint could name one multiAnswer option (this file's own list). */
const optionSpellings = (option) => {
  const plain = ascii(option);
  const out = [option, plain];
  const shift = /^(left|right|up|down) (\S+)$/.exec(plain);
  if (shift) out.push(`${shift[2]} units ${shift[1]}`, `${shift[1]} ${shift[2]} units`, ...(/left|right/.test(shift[1]) ? [`${shift[2]} units to the ${shift[1]}`] : []));
  const scale = /^(stretch|compression) by (\S+)$/.exec(plain);
  if (scale) out.push(`${scale[1] === 'stretch' ? 'stretched' : 'compressed'} by ${scale[2]}`, `${scale[1]} by a factor of ${scale[2]}`);
  const axis = /^across the ([xy])-axis$/.exec(plain);
  if (axis) out.push(`over the ${axis[1]}-axis`, `${axis[1]}-axis reflection`);
  return withMinus(out);
};
const describeSpellings = (question) => unique((question.answerFields || []).flatMap((field) => (field.options || []).flatMap(optionSpellings)));

const SIBLINGS = new Map();
const siblingOf = (question, seed) => {
  if (!SIBLINGS.has(question)) SIBLINGS.set(question, new Map());
  const bySeed = SIBLINGS.get(question);
  if (!bySeed.has(seed)) bySeed.set(seed, transformations.similarProblem(question, { seed }));
  return bySeed.get(seed);
};

/** Every text the family can put in front of a student for this question. */
const familyTexts = (question, seeds = [0, 1, 2]) => {
  const out = [...transformations.hints(question)];
  const backUp = transformations.backUpQuestion(question);
  if (backUp) out.push(backUp.prompt, ...backUp.options);
  for (const seed of seeds) {
    const sibling = siblingOf(question, seed);
    if (sibling) out.push(sibling.prompt, ...sibling.steps, sibling.answer);
  }
  return out;
};

/* ---------------------------------------------------------------------------
 * Re-solving a sibling from its own prompt.
 * ------------------------------------------------------------------------- */

// This file's own parent functions.
const PARENTS = {
  linear: (t) => t,
  quadratic: (t) => t * t,
  absolute: (t) => Math.abs(t),
  cubic: (t) => t ** 3,
  cubeRoot: (t) => Math.cbrt(t),
  squareRoot: (t) => (t < 0 ? NaN : Math.sqrt(t)),
  rational: (t) => (t === 0 ? NaN : 1 / t),
  exponential: (t, base) => base ** t,
  logarithmic: (t, base) => (t <= 0 ? NaN : Math.log(t) / Math.log(base)),
};
const fromText = (value) => Number(math.evaluate(ascii(value)));
const POINT = /\((-?\d+(?:\/\d+)?), (-?\d+(?:\/\d+)?)\)/g;
const pointsIn = (value) => [...ascii(value).matchAll(POINT)].map((match) => [fromText(match[1]), fromText(match[2])]);
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const baseIn = (value) => {
  const log = /log([₀-₉]+)/.exec(value);
  if (log) return Number([...log[1]].map((digit) => SUBSCRIPT.indexOf(digit)).join(''));
  const power = /·\(?(\d+(?:\/\d+)?)\)?\^\(/.exec(value);
  return power ? fromText(power[1]) : null;
};
const answerParameters = (answer) => {
  const match = /^a = (\S+), h = (\S+), k = (\S+)$/.exec(answer);
  assert.ok(match, `a parameter answer reads "a = …, h = …, k = …": ${answer}`);
  return { a: fromText(match[1]), h: fromText(match[2]), k: fromText(match[3]) };
};

/** A written function y = … as mathjs reads it. */
const toMathjs = (expression) => ascii(expression)
  .replace(/·/g, '*')
  .replace(/\|([^|]+)\|/g, 'abs($1)')
  .replace(/²/g, '^2')
  .replace(/³/g, '^3')
  .replace(/√\(/g, 'sqrt(')
  .replace(/√x/g, 'sqrt(x)')
  .replace(/∛\(/g, 'cbrt(')
  .replace(/∛x/g, 'cbrt(x)')
  .replace(/log([₀-₉]+)\(/g, (_, digits) => `logb${[...digits].map((digit) => SUBSCRIPT.indexOf(digit)).join('')}(`)
  .replace(/logb(\d+)\(/g, (_, base) => `(1/log(${base}))*log(`);
const evaluateWritten = (expression, x, scope = {}) => {
  try {
    const value = math.evaluate(toMathjs(expression), { x, ...scope });
    return typeof value === 'number' ? value : Number(value);
  } catch {
    return NaN;
  }
};

/** Every arithmetic chain "… = … = …" of a step, evaluated; returns how many were checked. */
const checkArithmetic = (step) => {
  let checked = 0;
  for (const segment of step.split(/[^-\d\s.()+×÷/|²³√∛=]/)) {
    if (!segment.includes('=')) continue;
    const sides = segment.split('=').map((side) => side.trim()).filter(Boolean);
    if (sides.length < 2) continue;
    let values;
    try {
      values = sides.map((side) => {
        const value = math.evaluate(toMathjs(side).replace(/×/g, '*').replace(/÷/g, '/'));
        if (typeof value !== 'number') throw new Error('not a number');
        return value;
      });
    } catch {
      continue;
    }
    values.slice(1).forEach((value) => assert.ok(close(value, values[0]), `the step's arithmetic holds: "${segment.trim()}" in "${step}"`));
    checked += 1;
  }
  return checked;
};

/** The family of a lab question, as the grader reads it. */
const labType = (question) => resolveTransformationsQuestion(question).family;

const resolveSibling = (question, sibling) => {
  const mode = question.mode || 'match';
  const type = labType(question);
  const all = [sibling.prompt, ...sibling.steps].join(' ');
  let arithmetic = sibling.steps.reduce((sum, step) => sum + checkArithmetic(step), 0);

  if (mode === 'match' || mode === 'identify') {
    const { a, h, k } = answerParameters(sibling.answer);
    const base = baseIn(sibling.prompt);
    const g = (x) => a * PARENTS[type](x - h, base) + k;
    pointsIn(sibling.prompt).forEach(([x, y]) => assert.ok(close(g(x), y), `${sibling.answer} passes through (${x}, ${y}): ${sibling.prompt}`));
    // The stated feature / asymptotes are the answer's.
    const asymptoteX = /asymptotes? x = (-?\d+)/.exec(ascii(sibling.prompt));
    const asymptoteY = /(?:horizontal asymptote|and) y = (-?\d+)/.exec(ascii(sibling.prompt));
    if (asymptoteX) assert.equal(Number(asymptoteX[1]), h);
    if (asymptoteY) assert.equal(Number(asymptoteY[1]), k);
    if (['quadratic', 'absolute', 'cubic', 'cubeRoot', 'squareRoot'].includes(type)) {
      const [feature] = pointsIn(/at (\(.*?\))/.exec(ascii(sibling.prompt))[1]);
      assert.deepEqual(feature, [h, k], 'the stated feature is (h, k)');
    }
    if (type === 'linear') {
      const [p1, p2] = pointsIn(sibling.prompt);
      assert.ok(close(a, (p2[1] - p1[1]) / (p2[0] - p1[0])), 'a is the slope of the target line');
    }
    // Readable families: the prompt determines a, h, k — two points plus the feature.
    if (READABLE_TYPES.includes(type)) {
      const [first] = pointsIn(sibling.prompt).filter(([x]) => x !== h && PARENTS[type](x - h, base) !== 0);
      assert.ok(close(a, (first[1] - k) / PARENTS[type](first[0] - h, base)), 'a is what the prompt\'s point gives');
    }
    // Every point a step names lies on the graph.
    pointsIn(sibling.steps.join(' ')).forEach(([x, y]) => assert.ok(close(g(x), y), `step point (${x}, ${y}) is on the graph`));
    // The stated equation is the graph.
    const equation = /(?:the graph|the target|your graph) is (?:then )?(y = [^.]+?)(?:\.|$)/.exec(ascii(sibling.steps.join(' ')));
    if (equation) [-2.5, 0.5, 3.25, 7.5].forEach((x) => {
      const stated = evaluateWritten(equation[1].replace(/^y = /, ''), x);
      if (Number.isFinite(g(x))) assert.ok(close(stated, g(x)), `${equation[1]} is the answer's graph at x = ${x}`);
    });
    return { arithmetic };
  }

  if (mode === 'pointMap') {
    const match = /^Map the parent-function point (\(.*?\)) through y = (.+)\.$/.exec(ascii(sibling.prompt));
    assert.ok(match, sibling.prompt);
    const [parentPoint] = pointsIn(match[1]);
    const base = baseIn(sibling.prompt);
    const g = (x) => evaluateWritten(match[2], x);
    assert.ok(close(PARENTS[type](parentPoint[0], base), parentPoint[1]), 'the sibling\'s parent point is on the parent');
    // Recover a, h, k from the written graph by search (readable families, b = 1).
    let found = null;
    for (let h = -12; h <= 12 && !found; h += 1) {
      const inputs = [1, 2, 4, 8, 9].filter((t) => Number.isFinite(PARENTS[type](t, base)) && Number.isFinite(g(h + t)));
      const [t1, t2] = inputs.filter((t, index) => inputs.findIndex((u) => close(PARENTS[type](u, base), PARENTS[type](t, base))) === index);
      if (t2 === undefined) continue;
      const a = (g(h + t1) - g(h + t2)) / (PARENTS[type](t1, base) - PARENTS[type](t2, base));
      const k = g(h + t1) - a * PARENTS[type](t1, base);
      if ([-0.5, 3, 5.5, 16].every((t) => !Number.isFinite(PARENTS[type](t, base)) || close(g(h + t), a * PARENTS[type](t, base) + k))) found = { a, h, k };
    }
    assert.ok(found, `the written graph is a·f(x − h) + k: ${match[2]}`);
    const [answer] = pointsIn(sibling.answer);
    assert.ok(close(answer[0], parentPoint[0] + found.h) && close(answer[1], found.a * parentPoint[1] + found.k), `the image of ${match[1]} is ${sibling.answer}`);
    assert.ok(close(g(answer[0]), answer[1]), 'the image is on the transformed graph');
    return { arithmetic };
  }

  if (mode === 'plotTransform') {
    const match = /^The graph of y = f\(x\) runs through (.*?), in that order\. Draw y = (.+) by transforming each defining point\.$/.exec(ascii(sibling.prompt));
    assert.ok(match, sibling.prompt);
    const sources = pointsIn(match[1]);
    const images = pointsIn(sibling.answer);
    assert.equal(images.length, sources.length, 'one image per source point');
    images.forEach(([x, y], index) => {
      // f is known only at the source points; the written g must reach S_i at P_i's x.
      let argument = null;
      const f = (t) => { argument = t; const hit = sources.find(([sx]) => close(sx, t)); return hit ? hit[1] : NaN; };
      const value = evaluateWritten(match[2], x, { f });
      assert.ok(close(argument, sources[index][0]), `P${index + 1} ${sibling.answer} maps back to S${index + 1}`);
      assert.ok(close(value, y), `P${index + 1} is on ${match[2]}`);
    });
    return { arithmetic };
  }

  if (mode === 'anchor') {
    const match = /^The graph of y = (.+?) is drawn\./.exec(ascii(sibling.prompt));
    assert.ok(match, sibling.prompt);
    const g = (x) => evaluateWritten(match[1], x);
    const [[X, Y]] = pointsIn(sibling.answer);
    if (type === 'rational') {
      assert.ok(!Number.isFinite(g(X)) || Math.abs(g(X)) > 1e12, 'the vertical asymptote is at the answer\'s x');
      assert.ok(close(g(X + 1e7), Y, 1e-5) && close(g(X - 1e7), Y, 1e-5), 'the horizontal asymptote is at the answer\'s y');
    } else if (type === 'logarithmic') {
      assert.ok(close(g(X), Y), 'the reference point is on the graph');
      assert.ok(!Number.isFinite(g(X - 1)), 'one unit to its left is the asymptote');
      assert.ok(Number.isFinite(g(X - 0.999)), 'and the graph exists just right of it');
    } else {
      assert.ok(close(g(X), Y), 'the feature is on the graph');
      if (type === 'squareRoot') assert.ok(!Number.isFinite(g(X - 0.01)), 'the endpoint is where the graph starts');
      if (type === 'quadratic' || type === 'absolute') assert.ok(close(g(X + 0.7), g(X - 0.7)), 'the vertex is the axis of symmetry');
      if (type === 'cubic' || type === 'cubeRoot') assert.ok(close(g(X + 0.7) + g(X - 0.7), 2 * Y), 'the inflection point is the centre of symmetry');
    }
    arithmetic += 1; // the feature itself was checked
    return { arithmetic };
  }
  assert.fail(`no sibling expected for mode ${mode}`);
  return { arithmetic, all };
};

const resolveTranslationSibling = (sibling) => {
  const match = /of g\(x\) = f\(x(?: ([+-]) (\d+))?\)(?: ([+-]) (\d+))? from y = f\(x\)\.$/.exec(ascii(sibling.prompt));
  assert.ok(match, sibling.prompt);
  const C = match[1] ? (match[1] === '-' ? 1 : -1) * Number(match[2]) : 0;
  const D = match[3] ? (match[3] === '+' ? 1 : -1) * Number(match[4]) : 0;
  const unit = (n) => `${Math.abs(n)} unit${Math.abs(n) === 1 ? '' : 's'}`;
  if (C !== 0) assert.match(sibling.answer, new RegExp(`${unit(C)} to the ${C > 0 ? 'right' : 'left'}`), `${sibling.prompt} → ${sibling.answer}`);
  if (D !== 0) assert.match(sibling.answer, new RegExp(`${unit(D)} ${D > 0 ? 'up' : 'down'}`), `${sibling.prompt} → ${sibling.answer}`);
  return { C, D };
};

/* ---------------------------------------------------------------------------
 * The tests.
 * ------------------------------------------------------------------------- */

const EARLIER = ALL_FAMILY_MODULES.slice(0, ALL_FAMILY_MODULES.indexOf(transformations));

test('the family is implemented, keeps the contract, and sits eighth in the index', () => {
  assert.equal(transformations.implemented, true);
  assert.equal(transformations.family, 'transformations');
  for (const name of ['matches', 'hints', 'similarProblem', 'expectedValues', 'backUpQuestion']) assert.equal(typeof transformations[name], 'function', name);
  assert.equal(EARLIER.length, 7);
});

test('it claims the shapes it can explain, and nothing an earlier family owns', () => {
  const claimed = (prompt) => CORPUS.find(({ question }) => text(question.prompt).startsWith(prompt))?.question;
  // Real items that must be claimed (one or more per shape).
  for (const prompt of [
    'Read the transformed absolute-value graph',
    'Read the transformed reciprocal graph',
    'Read the transformed cube-root graph',
    'Read y=−|x−2|+3 using',
    'Map the parent-function point (1, 1)',
    'Map the parent-function point (4, 2)',
    'Adjust a, h, and k until your exponential graph',
    'Below is the graph of y=−x³',
    'Adjust the transformation until your absolute value graph matches y=|2x|−4',
    'A graph of y=f(x) is shown. Draw the graph of y=f(−x)',
    'A graph of y=g(x) is shown. Draw the graph of y=g((1/2)x)',
    'Graph y=−|x−2|+3 by transforming',
    'For g(x)=f(x−4)+3',
    'For g(x)=2f(−(1/2)(x−3))+4',
    'Analyze y=−2|x+3|+1.',
    'Describe the horizontal transformation g(x)=f(2x).',
    'Describe g(x)=f(−x).',
    'Use the model g(x)=A·f(B(x−C))+D. Describe g(x)=f(x+3).',
    'Compare g(x)=3f(x+2)−4 to f(x).',
  ]) {
    const question = claimed(prompt);
    assert.ok(question, `the corpus holds "${prompt}"`);
    assert.equal(familyFor(question), transformations, `claimed: ${prompt}`);
  }
  // Real items it must NOT claim: the graph does not fix what the grader marks.
  for (const prompt of [
    'Describe every transformation shown by the transformed exponential graph.', // a and h trade off
    // No equation: the describe panel asks for the y-axis reflection and the
    // horizontal scale too, and −0.5√(x + 2) + 3 = −√((x + 2)/4) + 3.
    'Describe every vertical reflection, vertical scale, horizontal translation, and vertical translation in the transformed square-root graph.',
    'Map the parent-function point (0, 1) through $y=-3*2^(x-2)+1$.', // exponential pointMap: not read off the graph
    'For the absolute value parent function f(x)=|x|, identify its vertex, domain, and range.', // a parent, not a transformation
  ]) {
    const question = claimed(prompt);
    assert.ok(question, `the corpus holds "${prompt}"`);
    assert.equal(transformations.matches(question), false, `not claimed: ${prompt}`);
  }
  // Every lab item and every description of the corpus is claimed, except those.
  const labClaimed = LAB_CORPUS.filter(({ question }) => transformations.matches(question));
  assert.ok(labClaimed.length >= 20, `${labClaimed.length} lab items claimed`);
  const describeClaimed = DESCRIBE_CORPUS.filter(({ question }) => transformations.matches(question));
  assert.equal(describeClaimed.length, DESCRIBE_CORPUS.length, 'every multiAnswer description of the corpus is claimed');
  assert.ok(describeClaimed.length >= 14);
  // The sample's exponential pointMap (no equation, a and h trade off) is not,
  // nor its square-root describe item (no prompt: the graph does not fix b).
  const samplePointMap = SAMPLES.find(({ question }) => question.mode === 'pointMap').question;
  assert.equal(transformations.matches(samplePointMap), false);
  const sampleDescribe = SAMPLES.find(({ question }) => question.mode === 'describe').question;
  assert.equal(transformations.matches(sampleDescribe), false);
  // Nothing an earlier family claims.
  for (const { source, question } of [...CORPUS, ...SAMPLES]) {
    if (EARLIER.some((family) => { try { return family.matches(question); } catch { return false; } })) {
      assert.equal(transformations.matches(question), false, `${source}: "${text(question.prompt).slice(0, 60)}" belongs to an earlier family`);
      assert.notEqual(familyFor(question), transformations);
    }
  }
});

test('the claimed lab modes are exactly the ones whose graph fixes the key (draws)', () => {
  for (const { question } of DRAWS.match) {
    const resolved = resolveTransformationsQuestion(question);
    const expected = resolved.showB || resolved.targetSpec.b === 1;
    assert.equal(transformations.matches(question), expected, JSON.stringify(question.target));
    if (expected) assert.equal(familyFor(question), transformations);
  }
  for (const mode of ['identify', 'describe', 'pointMap']) {
    for (const { question } of DRAWS[mode]) assert.equal(familyFor(question), transformations, `${mode} ${question.family}`);
    for (const type of ['exponential', 'linear']) {
      assert.equal(transformations.matches({ type: 'transformationsLab', mode, family: type, function: { type, a: 2, h: 1, k: -1, base: 2 }, parentPoint: [1, 2], prompt: 'x' }), false, `${mode} ${type} is not read off the graph`);
    }
    assert.equal(transformations.matches({ type: 'transformationsLab', mode, family: 'absolute', function: { type: 'absolute', a: 2, b: 2, h: 1, k: -1 }, parentPoint: [1, 1] }), false, `${mode} with b ≠ 1: a and b trade off`);
  }
  for (const { question } of DRAWS.plotTransform) assert.equal(familyFor(question), transformations);
  assert.equal(transformations.matches({ ...DRAWS.plotTransform[0].question, prompt: 'Draw the image.' }), false, 'a plotTransform prompt that states no transformation');
  for (const { question } of DRAWS.anchor) assert.equal(familyFor(question), transformations, `anchor ${question.family}`);
  for (const type of ['exponential', 'linear']) {
    assert.equal(transformations.matches({ type: 'transformationsLab', mode: 'anchor', family: type, function: { type, a: 2, h: 1, k: -1 } }), false, `anchor ${type}`);
  }
  assert.equal(transformations.matches({ type: 'transformationsLab', mode: 'anchor', family: 'logarithmic', function: { type: 'logarithmic', a: 2, b: 2, h: 1, k: -1, base: 2 } }), false, 'a log reference point with b ≠ 1');
  assert.equal(transformations.matches({ type: 'transformationsLab', mode: 'graphIt', family: 'absolute', function: { type: 'absolute', a: 2 } }), false, 'not one of the six modes');
  assert.equal(transformations.matches({ type: 'transformationsLab', mode: 'identify', family: 'absolute' }), false, 'no function authored');
});

// The graph a describe / pointMap item shows is the same for these pairs of
// parameter sets, which the grader keys differently: so those modes need the
// prompt to state the transformation (verified here with the shared math).
test('describe, pointMap and plotTransform are claimed only when the prompt states exactly the graded transformation', () => {
  const lab = (mode, fn, prompt, extra = {}) => ({ type: 'transformationsLab', mode, family: fn.type, function: fn, prompt, parentPoint: [1, 1], sourcePoints: [{ x: -2, y: 1 }, { x: 1, y: 3 }], ...extra });
  const sameGraph = (p, q) => {
    for (let x = -7.75; x <= 7.75; x += 0.5) {
      const [u, v] = [evaluateTransformedFunction(p, x), evaluateTransformedFunction(q, x)];
      if (Number.isFinite(u) !== Number.isFinite(v) || (Number.isFinite(u) && Math.abs(u - v) > 1e-9)) return false;
    }
    return true;
  };
  const twins = [
    [{ type: 'absolute', a: 2, h: 1, k: 0 }, { type: 'absolute', a: 1, b: 2, h: 1, k: 0 }],
    [{ type: 'cubic', a: -1, h: 2, k: 1 }, { type: 'cubic', a: 1, b: -1, h: 2, k: 1 }],
    [{ type: 'quadratic', a: 1, h: 3, k: -2 }, { type: 'quadratic', a: 1, b: -1, h: 3, k: -2 }],
    [{ type: 'logarithmic', a: 1, h: 0, k: 1, base: 2 }, { type: 'logarithmic', a: 1, b: 2, h: 0, k: 0, base: 2 }],
    [{ type: 'squareRoot', a: -0.5, h: 3, k: 2 }, { type: 'squareRoot', a: -1, b: 0.25, h: 3, k: 2 }],
  ];
  for (const [fn, twin] of twins) {
    assert.ok(sameGraph(fn, twin), `${JSON.stringify(fn)} and ${JSON.stringify(twin)} draw one graph`);
    assert.notDeepEqual(transformationDescriptor(fn), transformationDescriptor(twin), 'and are keyed differently');
    for (const prompt of [undefined, 'Describe every transformation shown by the transformed graph.', 'Describe the transformations of the graph.', 'Map the parent-function point through the transformation shown.']) {
      assert.equal(transformations.matches(lab('describe', fn, prompt)), false, `describe ${fn.type}: ${prompt}`);
      assert.equal(transformations.matches(lab('pointMap', fn, prompt)), false, `pointMap ${fn.type}: ${prompt}`);
    }
    // Stated, it is claimed; a stated twin, or a second different equation, is not.
    const stated = writtenTransformation(fn, 0);
    assert.equal(familyFor(lab('describe', fn, `Describe ${stated}.`)), transformations, stated);
    assert.equal(familyFor(lab('pointMap', fn, `Map the parent-function point through ${stated}.`)), transformations, stated);
    assert.equal(transformations.matches(lab('describe', fn, `Describe ${writtenTransformation({ ...twin, b: twin.b }, 2)}.`)), false, 'the twin\'s equation is not the key');
    assert.equal(transformations.matches(lab('describe', fn, `Describe ${stated}, then ${writtenTransformation({ ...fn, k: fn.k + 1 }, 2)}.`)), false, 'two different equations');
  }
  // plotTransform: a prompt that names y=g(x) or y=f(x) but no transformation.
  const plot = { type: 'linear', a: 2, b: -1, h: 3, k: 1 };
  for (const prompt of ['Draw the graph of y=g(x) by transforming each defining point.', 'A graph of y=f(x) is shown. Plot the transformed defining points.', 'Draw y=f(x).', 'Draw the image.', undefined,
    'A graph of y=f(x) is shown. Draw y=2f(−x+3)+1.', // f(Bx + c) is not read
    'A graph of y=f(x) is shown. Draw y=2f(−(x−3))+2.', // disagrees with the key
    'A graph of y=f(x) is shown. Draw y=2|−(x−3)|+1.', // bars are the absolute value parent, not f
  ]) assert.equal(transformations.matches(lab('plotTransform', plot, prompt)), false, `plotTransform: ${prompt}`);
  assert.equal(familyFor(lab('plotTransform', plot, 'A graph of y=f(x) is shown. Draw y=2f(−(x−3))+1.')), transformations);
  // A log describe ladder never reads k off the asymptote.
  const log = lab('describe', { type: 'logarithmic', a: 2, h: -3, k: 2, base: 2 }, 'Describe y = 2log₂(x + 3) + 2.');
  const ladder = transformations.hints(log);
  assert.ok(ladder.some((hint) => /one unit past the asymptote/.test(hint)), ladder.join('\n'));
  assert.ok(ladder.every((hint) => !/Compare where that feature sits/.test(hint)), ladder.join('\n'));
});

test('multiAnswer descriptions: claimed only when every field is read, and the reading IS the key', () => {
  for (const { question } of DESCRIBE_DRAWS) assert.equal(familyFor(question), transformations, question.prompt);
  const base = DESCRIBE_DRAWS.find(({ question }) => question.answerFields.length >= 2).question;
  // A key that disagrees with the equation.
  const wrong = structuredClone(base);
  const field = wrong.answerFields[0];
  field.answer = field.options.find((option) => option !== field.answer);
  assert.equal(transformations.matches(wrong), false, 'a key the family would contradict');
  // A field it does not know.
  assert.equal(transformations.matches({ ...base, answerFields: [...base.answerFields, { id: 'domain', label: 'Domain', type: 'choice', options: ['all reals', 'x ≥ 0'], answer: 'all reals' }] }), false);
  // f(2x + 4): "shift" is read two ways by teachers.
  assert.equal(transformations.matches({ type: 'multiAnswer', prompt: 'Describe g(x)=f(2x+4).', answerFields: [{ id: 'h', label: 'Horizontal translation', type: 'choice', options: ['left 2', 'left 4', 'none'], answer: 'left 2' }] }), false);
  // Only a vertex: not a transformation question.
  assert.equal(transformations.matches({ type: 'multiAnswer', prompt: 'Find the vertex of y=|x−2|+1.', answerFields: [{ id: 'v', label: 'Vertex', type: 'choice', options: ['(2, 1)', '(−2, 1)'], answer: '(2, 1)' }] }), false);
});

const CLAIMED_LAB = [...LAB_CORPUS, ...Object.values(DRAWS).flat()].filter(({ question }) => transformations.matches(question));
const CLAIMED_DESCRIBE = [...DESCRIBE_CORPUS, ...DESCRIBE_DRAWS].filter(({ question }) => transformations.matches(question));

/** Is this expectedValues entry a spelling of something the student must find? */
const isLabAnswerSpelling = (entry, key) => {
  const value = ascii(entry).trim();
  if (key.words.includes(value.toLowerCase())) return true;
  const number = (raw) => {
    const latex = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(raw);
    if (latex) return (latex[1] ? -1 : 1) * Number(latex[2]) / Number(latex[3]);
    if (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:\/\d+)?$/.test(raw)) return fromText(raw.replace(/^(-?)\./, '$10.'));
    return null;
  };
  const near = (left, right) => Math.abs(left - right) <= 0.0051; // a 2-place rounding of a lab value
  const n = number(value);
  const { spec, mode } = key;
  const asNumbers = [...key.numbers];
  // Reading a, h, k off the graph means reading these features:
  const features = [];
  const lines = [];
  if (mode === 'match' || mode === 'identify' || mode === 'describe') {
    asNumbers.push(spec.a, spec.h, spec.k);
    features.push([spec.h, spec.k], transformedAnchor(spec).point, [spec.h, spec.a + spec.k]);
    lines.push(`x=${spec.h}`, `y=${spec.k}`);
    if (spec.type === 'linear') asNumbers.push(spec.a * spec.b);
  }
  if (mode === 'anchor') lines.push(`x=${spec.h}`, `y=${spec.k}`);
  if (n !== null) return asNumbers.some((answer) => near(answer, n));
  const pair = /^\((-?[\d./]+), ?(-?[\d./]+)\)$/.exec(value);
  if (pair) return [...key.points, ...features].some(([x, y]) => near(x, fromText(pair[1])) && near(y, fromText(pair[2])));
  const line = /^([xy]) ?= ?(-?[\d./]+)$/.exec(value);
  if (line) return lines.some((entryLine) => entryLine.startsWith(line[1]) && near(Number(entryLine.split('=')[1]), fromText(line[2])));
  const equation = /^y ?= ?(.+)$/.exec(value);
  if (equation) {
    return [-3.5, -0.5, 1.5, 2.25, 6.5].every((x) => {
      const expected = evaluateTransformedFunction(spec, x);
      const stated = evaluateWritten(equation[1], x);
      return !Number.isFinite(expected) || close(stated, expected, 1e-7);
    });
  }
  return false;
};

test('expectedValues: every entry is something the student must find (lab)', () => {
  for (const { source, question } of CLAIMED_LAB) {
    const key = labKey(question);
    for (const entry of transformations.expectedValues(question)) {
      assert.ok(isLabAnswerSpelling(entry, key), `${source} (${key.mode} ${key.spec.type}): "${entry}" is not an answer`);
    }
  }
});

test('expectedValues: every answer, in every spelling, is covered (lab)', () => {
  for (const { source, question } of CLAIMED_LAB) {
    const key = labKey(question);
    const expected = transformations.expectedValues(question);
    for (const spelling of labSpellings(key)) {
      assert.ok(hintRevealsAnswer(spelling, expected), `${source} (${key.mode} ${key.spec.type}): the answer "${spelling}" is not in expectedValues`);
    }
  }
});

test('expectedValues: every option of a description is covered, and nothing else is listed', () => {
  for (const { source, question } of CLAIMED_DESCRIBE) {
    const expected = transformations.expectedValues(question);
    for (const spelling of describeSpellings(question)) {
      assert.ok(hintRevealsAnswer(spelling, expected), `${source}: the option "${spelling}" is not in expectedValues`);
    }
    // Each entry spells one of the options (an answer, or a verdict the student can pick).
    const options = question.answerFields.flatMap((field) => field.options.map(ascii));
    for (const entry of expected) {
      const plain = ascii(entry).toLowerCase().replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2').replace(/(^|[^\d])\.(\d)/g, '$10.$2');
      const ok = options.some((option) => {
        const lower = option.toLowerCase();
        if (plain.replace(/\s+/g, '') === lower.replace(/\s+/g, '')) return true;
        const words = lower.match(/[a-z]+/g) || [];
        const numbers = (lower.match(/-?\d+(?:\/\d+)?/g) || []).map(fromText);
        const entryNumbers = (plain.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []).map(fromText);
        const stems = words.filter((word) => !['the', 'by', 'across', 'a'].includes(word)).map((word) => word.slice(0, 6));
        // A rounded decimal (0.33 for 1/3) is a spelling a student could type.
        return stems.every((stem) => plain.includes(stem)) && numbers.length === entryNumbers.length && numbers.every((n, i) => Math.abs(n - entryNumbers[i]) <= 0.0051);
      });
      assert.ok(ok, `${source}: "${entry}" spells none of the options`);
    }
    // The key itself.
    question.answerFields.forEach((field) => assert.ok(hintRevealsAnswer(field.answer, expected), `${source}: key ${field.answer}`));
  }
  // The draws' keys are this file's reading of the equation.
  for (const { values, question } of DESCRIBE_DRAWS) {
    question.answerFields.forEach((field) => {
      const role = Object.keys(LABELS).find((name) => LABELS[name] === field.label);
      assert.equal(field.answer, ORACLE[role](values));
    });
  }
});

test('no hint, back-up text or sibling contains an answer, in any spelling', () => {
  for (const { source, question } of CLAIMED_LAB) {
    const spellings = labSpellings(labKey(question));
    for (const value of familyTexts(question)) {
      const leaked = spellings.find((spelling) => hintRevealsAnswer(value, [spelling]));
      assert.equal(leaked, undefined, `${source} (${question.mode || 'match'}): "${value}" contains the answer ${leaked}`);
    }
  }
  for (const { source, question } of CLAIMED_DESCRIBE) {
    const spellings = describeSpellings(question);
    for (const value of familyTexts(question)) {
      const leaked = spellings.find((spelling) => hintRevealsAnswer(value, [spelling]));
      assert.equal(leaked, undefined, `${source}: "${value}" contains the option ${leaked}`);
    }
  }
});

test('hints: least to most specific, built from the problem, every one passes the platform guard', () => {
  let numbered = 0;
  for (const { source, question } of [...CLAIMED_LAB, ...CLAIMED_DESCRIBE]) {
    const list = transformations.hints(question);
    assert.ok(list.length >= 2 && list.length <= 4, `${source}: ${list.length} hints`);
    assert.equal(new Set(list).size, list.length, 'no repeats');
    const guard = transformations.expectedValues(question);
    list.forEach((hint) => assert.equal(hintRevealsAnswer(hint, guard), false, `${source}: ${hint}`));
    // Numbered spellings quote the problem's own givens.
    const givens = question.type === 'multiAnswer'
      ? [/(?:g\(x\)|y)=[^ ,.]+/.exec(question.prompt)?.[0]]
      : [question.parentPoint && `(${question.parentPoint[0]}, ${question.parentPoint[1]})`, '(0, 0)', '(1, 1)', '(1, 0)', '(0, 1)', 'x = 0', 'y = 0'];
    if (list.some((hint) => givens.filter(Boolean).some((given) => hint.includes(given)))) numbered += 1;
  }
  assert.ok(numbered >= 40, `${numbered} ladders quote their own givens`);
  // The real describe item's ladder, start to finish (read from the stated equation, the vertex confirms the shifts; verdict words absent).
  const describe = CORPUS.find(({ question }) => text(question.prompt).startsWith('Read y=−|x−2|+3 using')).question;
  const ladder = transformations.hints(describe);
  assert.match(ladder[0], /^Compare the equation in the prompt with y = a·f\(b\(x − h\)\) \+ k/);
  assert.match(ladder[1], /vertex/);
  assert.match(ladder.at(-1), /reciprocal of \|b\|/);
});

test('every sibling re-solves from its own prompt: right answer, right steps, new numbers, deterministic', () => {
  const counts = {};
  for (const { source, question } of CLAIMED_LAB) {
    const mode = question.mode || 'match';
    const key = labKey(question);
    for (const seed of [0, 3]) {
      const sibling = siblingOf(question, seed);
      if (mode === 'describe') {
        assert.equal(sibling, null, 'a worked description would state verdicts that are options here');
        continue;
      }
      if (!sibling) continue;
      counts[mode] = (counts[mode] || 0) + 1;
      assert.deepEqual(transformations.similarProblem(question, { seed }), sibling, 'deterministic in seed and question');
      assert.ok(similarExampleIsSafe(question, sibling), `${source}: the platform accepts it`);
      assert.notEqual(sibling.prompt, question.prompt);
      const { arithmetic } = resolveSibling(question, sibling);
      if (mode !== 'anchor') assert.ok(arithmetic >= 1, `${source}: a step's arithmetic is checked`);
      if (mode === 'match' || mode === 'identify') {
        const { h, k } = answerParameters(sibling.answer);
        assert.ok(!close(h, key.spec.h) && !close(k, key.spec.k), `${source}: new h and k`);
      }
    }
  }
  for (const mode of ['match', 'identify', 'pointMap', 'plotTransform', 'anchor']) {
    assert.ok((counts[mode] || 0) >= 60, `${mode}: ${counts[mode] || 0} siblings re-solved`);
  }
  let translations = 0;
  for (const { source, question } of CLAIMED_DESCRIBE) {
    const roles = question.answerFields.map((field) => field.label);
    const sibling = transformations.similarProblem(question, { seed: 1 });
    if (!roles.every((label) => /^(Horizontal|Vertical) translation$/.test(label))) {
      assert.equal(sibling, null, `${source}: no worked sibling states a verdict that is an option here`);
      continue;
    }
    assert.ok(sibling, `${source}: a translations-only item has a sibling`);
    assert.ok(similarExampleIsSafe(question, sibling));
    const { C, D } = resolveTranslationSibling(sibling);
    // Every shift of the sibling is non-zero ("none" is an option here) and a new distance.
    const values = question.answerFields.map((field) => field.answer);
    if (roles.includes('Horizontal translation')) assert.ok(C !== 0 && !values.some((value) => value.endsWith(` ${Math.abs(C)}`) && /left|right/.test(value)));
    if (roles.includes('Vertical translation')) assert.ok(D !== 0 && !values.some((value) => value.endsWith(` ${Math.abs(D)}`) && /up|down/.test(value)));
    translations += 1;
  }
  assert.ok(translations >= 10, `${translations} translation siblings`);
});

test('edge cases: a = −1, h = 0 and k = 0, fractional a, b = −1, decay, a b box', () => {
  const cases = [
    { type: 'transformationsLab', mode: 'identify', family: 'quadratic', function: { type: 'quadratic', a: -1, h: 0, k: 0 } },
    { type: 'transformationsLab', mode: 'identify', family: 'squareRoot', function: { type: 'squareRoot', a: 0.5, h: 0, k: -3 } },
    { type: 'transformationsLab', mode: 'describe', family: 'rational', function: { type: 'rational', a: -1, h: 0, k: 0 }, prompt: 'Describe the transformations in y = −1/x.' },
    { type: 'transformationsLab', mode: 'match', family: 'exponential', target: { a: 3, h: 0, k: -2, base: 0.5 } },
    { type: 'transformationsLab', mode: 'match', family: 'absolute', target: { a: 1, b: -1, h: 2, k: 0 }, initial: { a: 1, b: 1, h: 0, k: 0 } },
    { type: 'transformationsLab', mode: 'plotTransform', family: 'linear', function: { type: 'linear', a: 1, b: -1, h: 0, k: 0 }, sourcePoints: [[0, 0], [1, 1], [-2, 3]], prompt: 'Draw y=f(−x).' },
    { type: 'transformationsLab', mode: 'anchor', family: 'cubeRoot', function: { type: 'cubeRoot', a: -1, b: 0.5, h: 0, k: 0 } },
    { type: 'transformationsLab', mode: 'pointMap', family: 'logarithmic', function: { type: 'logarithmic', a: -1, h: 0, k: 0, base: 2 }, parentPoint: [1, 0], prompt: 'Map the parent-function point (1, 0) through y = −log₂(x).' },
  ];
  for (const question of cases) {
    assert.equal(familyFor(question), transformations, JSON.stringify(question));
    const key = labKey(question);
    const spellings = labSpellings(key);
    for (const value of familyTexts(question, [0, 1, 2, 3, 4, 5])) {
      assert.equal(spellings.find((spelling) => hintRevealsAnswer(value, [spelling])), undefined, `${question.mode} ${question.family}: ${value}`);
    }
    if (question.mode !== 'describe') {
      const sibling = transformations.similarProblem(question, { seed: 0 });
      assert.ok(sibling, `${question.mode} ${question.family}: a sibling even with 0 and 1 among the answers`);
      resolveSibling(question, sibling);
    }
  }
});

test('end to end: the Hint control, "Try a similar one" and "Let\'s back up" give this family\'s content', () => {
  let siblings = 0;
  for (const { source, question } of [...CLAIMED_LAB, ...CLAIMED_DESCRIBE]) {
    const ladder = buildQuestionHints(question);
    const fromFamily = ladder.filter((hint) => hint.source === 'family').map((hint) => hint.text);
    assert.deepEqual(fromFamily, transformations.hints(question).slice(0, fromFamily.length), `${source}: the ladder is the family's`);
    assert.ok(fromFamily.length >= 2, `${source}: family hints reach the ladder`);
    const backUp = backUpStepFor(question);
    assert.equal(backUp.source, 'family', `${source}: the back-up step is the family's`);
    assert.ok(backUp.options.includes(backUp.correct) && backUp.options.length === 2);
    const direct = transformations.backUpQuestion(question);
    assert.equal(backUp.prompt, direct.prompt);
    const worked = buildSimilarWorkedExample(question, { seed: 4 });
    if (worked) {
      siblings += 1;
      const candidates = [4, 5, 6, 7, 8, 9].map((seed) => transformations.similarProblem(question, { seed })).filter(Boolean);
      assert.ok(candidates.some((candidate) => candidate.prompt === worked.prompt && candidate.answer === worked.answer), `${source}: the platform's sibling is the family's`);
    }
  }
  assert.ok(siblings >= 250, `${siblings} siblings reach "Try a similar one"`);
  // A describe item's back-up never says "up" (a verdict there).
  const describe = CLAIMED_LAB.find(({ question }) => question.mode === 'describe').question;
  assert.doesNotMatch(backUpStepFor(describe).prompt, /\bup\b/);
});
