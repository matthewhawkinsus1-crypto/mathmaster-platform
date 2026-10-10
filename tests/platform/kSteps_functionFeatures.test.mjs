/*
 * JOB K — THE functionFeatures FAMILY'S WORKED SOLUTION OF THE QUESTION ITSELF.
 *
 * workedSolution(question) is what the closed-question review panel shows when
 * a function-features item has no authored solution steps
 * (closedQuestionReview.js). This file draws every shape the family claims —
 * the teacher-import-jsons corpus compiled by the production V5 compiler, the
 * SAMPLE_*.json activities, generated tables and graph investigations — and
 * seeded instances of each: graph workspaces on all nine function types with
 * every analysis part (restricted and not, open and closed ends, cards whose x
 * the student chooses, cards with no point), functionCharacteristics compiled
 * from intents, the table-then-graph workflow, relations (the tool and the
 * relationRepresentations recipe), legacy tables, every sequenceExplorer and
 * functionInvestigation2 mode, and the multiAnswer attribute items (parents,
 * restricted lines). Edges: zero (h = 0, k = 0, a zero coordinate), negatives,
 * decimals, a graph with no x-intercept, all real numbers, a horizontal line.
 *
 * Everything is recomputed here with this file's own evaluator and mathjs,
 * never with the family's helpers:
 *   - every "f(a) = b", every zero ("gives x = r"), every arithmetic chain and
 *     every dot the steps describe is true of the function;
 *   - each stated answer is checked against the function by sampling (domain,
 *     range, monotone and sign intervals, features, table cells, terms), and
 *     the shared grader marks it right: gradeAnalysisPart and
 *     gradePointPlacements for the graph workspace, gradeStage /
 *     gradeFeaturePoints for a composed workflow, gradeToolWork for the
 *     relation, sequence and investigation tools, gradeTableResponse and
 *     gradeMultiAnswerResponse for tables and attribute fields;
 *   - the last step closes on the answer summary;
 *   - no "+ -3", "1x", "--", "-0", NaN, Infinity, null or a stray undefined.
 *
 * Mutation-checked (each undone in functionFeatures.js, seen red, restored
 * byte for byte):
 *   - rangeSentence called every end of a restricted graph "a closed dot" →
 *     the dot assertion fails ("f(4) is closed");
 *   - monotoneParts swapped increasing and decreasing → the graph grader
 *     rejects the parts and those items are not explained (the coverage
 *     assertion fails);
 *   - constructionWork chose x-values on one side of the center only → the
 *     placement grader rejects them: the chosen-x edge and the coverage
 *     assertion fail;
 *   - tableGraphWorked computed m·x − b → the table stage's grader rejects it,
 *     those items are not explained and the coverage assertion fails;
 *   - sequenceTest accepted terms whose differences and ratios both agree →
 *     the edge test (a constant sequence) fails;
 *   - attributeWorked accepted any key for an asymptote → the oracle fails on
 *     a wrong-key item in the null test;
 *   - the final "So …" line was dropped → the last-step assertion fails;
 *   - an analyzed sequence stated the term after the one asked → the term
 *     check fails; an investigation stated its horizontal asymptote one too
 *     high → the asymptote check fails; a characteristics item stated the
 *     opposite behavior → the sampled-behavior check fails (on an unkeyed
 *     stage, where no grader would have caught it);
 *   - solveClause stated only the zeros on a restricted graph's drawn piece →
 *     the solution-set check fails ("solving 2|x - 1| - 3 = 0 gives x = 2.5
 *     leaves out x = -0.5"); it said "no real solution" when none was drawn →
 *     the same check fails;
 *   - the table substitution wrote a coefficient of 1 or a zero term
 *     ("1(-1)", "0(-8)") and the investigation wrote "-1(x + 2)" → the
 *     hygiene assertion fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { all, create } from 'mathjs';

import * as ff from '../../src/platform/supports/families/functionFeatures.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { readComposedQuestion } from '../../functions/shared/toolMath/workflow/questionWorkflow.mjs';
import { graphWorkspaceModelFor, gradeAnalysisPart } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { gradePointPlacements } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';
import { POINT_INPUT_NONE_TOKEN, gradeFeaturePoints, gradeStage } from '../../functions/shared/toolMath/workflow/workflowGrading.mjs';
import { gradeMultiAnswerResponse, gradeTableResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const readJson = (relative) => JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8'));
const math = create(all);
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const close = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/* ------------------------------------------------------------ this file's own evaluator */

/** A graph-workspace spec as a function (NaN outside its domain), written from the spec's own fields. */
const specFn = (spec, { restricted = true } = {}) => {
  const type = spec.type === 'line' ? 'linear' : spec.type;
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? (type === 'linear' ? 2 : spec.b ?? 2));
  const m = Number(spec.m ?? spec.a ?? 1);
  const b = spec.b !== undefined ? Number(spec.b) : k;
  const raw = {
    linear: (x) => m * (x - h) + b,
    quadratic: (x) => a * (x - h) ** 2 + k,
    absolute: (x) => a * Math.abs(x - h) + k,
    squareRoot: (x) => (x < h ? NaN : a * Math.sqrt(x - h) + k),
    cubic: (x) => a * (x - h) ** 3 + k,
    cubeRoot: (x) => a * Math.cbrt(x - h) + k,
    exponential: (x) => a * base ** (x - h) + k,
    logarithmic: (x) => (x <= h ? NaN : a * (Math.log(x - h) / Math.log(base)) + k),
    rational: (x) => (x === h ? NaN : a / (x - h) + k),
  }[type];
  const domain = spec.domain || spec.restrictedDomain;
  return (x) => {
    if (restricted && domain) {
      const lo = Number(domain.min ?? -Infinity);
      const hi = Number(domain.max ?? Infinity);
      const loIn = domain.minInclusive ?? domain.minClosed ?? true;
      const hiIn = domain.maxInclusive ?? domain.maxClosed ?? true;
      if (x < lo || x > hi || (x === lo && loIn === false) || (x === hi && hiIn === false)) return NaN;
    }
    const y = raw(x);
    return Number.isFinite(y) ? y : NaN;
  };
};

const HYGIENE = [/\+ [-−]\s*\d|[-−] [-−]\s*\d/, /--|−−/, /(?<![\d.)⁻])1[a-z](?![a-zₙ])/, /NaN|Infinity|\bnull\b|\[object/, /(?<![\d.])[-−]0(?![\d./])/,
  // A coefficient of 0 or 1 before a bracket (1(-8)², 0(-8)), a zero term after a variable (x + 0, x² + 0), a value echoed (1000 = 1000).
  /(?<![\d.])[01]\(/, /[a-z²³] [+\-−] 0(?!\d|\.\d)/, /= ([-−]?[\d.]+) = \1(?![\d.\w(/²³])/];
const assertClean = (worked, label) => {
  const lines = [worked.headline, ...worked.steps, worked.answerSummary];
  lines.forEach((line) => HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: hygiene in "${line}"`)));
  const undefinedCard = worked.steps.some((step) => /mark that card as undefined/.test(step));
  lines.forEach((line) => assert.ok(undefinedCard || !/undefined/.test(line), `${label}: "${line}"`));
};
const assertLastIsSummary = (worked, label) => {
  const last = worked.steps.at(-1).replace(/^So:? /, '').replace(/\.$/, '');
  const summary = worked.answerSummary;
  // The closing line lists the same answers the summary does ("; " or ", … and …").
  const pieces = summary.split('; ').map((piece) => piece.toLowerCase());
  pieces.forEach((piece) => assert.ok(last.toLowerCase().includes(piece.replace(/^the /, '')), `${label}: the last step states "${piece}": ${worked.steps.at(-1)}`));
  assert.match(worked.steps.at(-1), /^So\b/, label);
};

/** Every numeric chain "a = b" (numbers only) a step writes is true. */
const assertArithmetic = (steps, label) => {
  let checked = 0;
  steps.forEach((step) => {
    ascii(step).split(/[,:;]\s|\.\s|\.$|\s(?:so|then|and)\s/).forEach((clause) => {
      const segments = clause.split(' = ').map((segment) => segment.trim());
      for (let index = 0; index + 1 < segments.length; index += 1) {
        const [left, right] = [segments[index], segments[index + 1]];
        if ([left, right].some((side) => !/^[-\d.+*·×÷/()^²³\s]+$/.test(side) || !/\d/.test(side))) continue;
        const value = (side) => Number(math.evaluate(side.replace(/[·×]/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/³/g, '^3').replace(/(\d|\))\s*\(/g, '$1*(')));
        assert.ok(close(value(left), value(right), 1e-9), `${label}: "${left} = ${right}" in "${step}"`);
        checked += 1;
      }
    });
  });
  return checked;
};

/** Every "f(a) = b" and every "gives x = r" a step states, recomputed. */
const assertFunctionValues = (f, steps, label, name = 'f') => {
  const text = ascii(steps.join(' '));
  let checked = 0;
  for (const [whole, x, y] of text.matchAll(new RegExp(`${name}\\((-?\\d+(?:\\.\\d+)?)\\) = (-?\\d+(?:\\.\\d+)?)(?=[.,;:)]?(?:\\s|$))`, 'g'))) {
    // A key point at an open end is plotted from the rule itself.
    const value = Number.isFinite(f(Number(x))) ? f(Number(x)) : f.unrestricted?.(Number(x));
    assert.ok(close(value, Number(y), 1e-9), `${label}: ${whole} but ${name}(${x}) = ${value}`);
    checked += 1;
  }
  const rule = f.unrestricted || f;
  for (const [, first, second] of text.matchAll(/gives x = (-?\d+(?:\.\d+)?)(?: or x = (-?\d+(?:\.\d+)?))?/g)) {
    [first, second].filter(Boolean).forEach((root) => assert.ok(close(rule(Number(root)), 0), `${label}: x = ${root} is a zero`));
  }
  assertSolutionSets(rule, text, label);
  return checked;
};

/** Every real solution of rule(x) = 0 in [-60, 60], found by scanning: sign changes and touching minima of |rule|. */
const realSolutions = (rule) => {
  const roots = [];
  const add = (x) => { if (Math.abs(rule(x)) < 1e-7 && !roots.some((root) => close(root, x, 1e-4))) roots.push(x); };
  const step = 0.01;
  let previous = null;
  for (let index = -6000; index <= 6000; index += 1) {
    const x = index * step;
    const value = rule(x);
    if (!Number.isFinite(value)) { previous = null; continue; }
    if (value === 0) add(x);
    if (previous && Math.sign(previous.value) !== Math.sign(value) && value !== 0 && previous.value !== 0) {
      let [low, high] = [previous.x, x];
      for (let round = 0; round < 80; round += 1) {
        const mid = (low + high) / 2;
        if (Math.sign(rule(mid)) === Math.sign(rule(low))) low = mid; else high = mid;
      }
      add((low + high) / 2);
    }
    previous = { x, value };
  }
  // Touching roots (x², |x|): a local minimum of |rule| that reaches zero.
  for (let index = -5999; index < 6000; index += 1) {
    const [left, mid, right] = [index - 1, index, index + 1].map((at) => Math.abs(rule(at * step)));
    if (!(mid <= left && mid <= right)) continue;
    let [low, high] = [(index - 1) * step, (index + 1) * step];
    for (let round = 0; round < 100; round += 1) {
      const [one, two] = [low + (high - low) / 3, high - (high - low) / 3];
      if (Math.abs(rule(one)) < Math.abs(rule(two))) high = two; else low = one;
    }
    add((low + high) / 2);
  }
  return roots;
};

/** "Solving R = 0 gives x = …" lists the equation's whole solution set, never only the drawn zeros; "no real solution" means none. */
const assertSolutionSets = (rule, text, label) => {
  const claims = [...text.matchAll(/[Ss]olving .+? = 0 gives ((?:x = -?[\d.]+(?: or x = -?[\d.]+)*)|(?:\(-?[\d.]+, 0\)(?: and \(-?[\d.]+, 0\))*))/g)];
  const none = /= 0 has no real solution/.test(text);
  if (!claims.length && !none) return;
  const roots = realSolutions(rule);
  claims.forEach(([whole, listed]) => {
    const stated = [...listed.matchAll(/(?:x = |\()(-?[\d.]+)/g)].map(([, value]) => Number(value));
    roots.forEach((root) => assert.ok(stated.some((value) => close(value, root, 1e-4)), `${label}: ${whole} leaves out x = ${root}`));
  });
  if (none) assert.deepEqual(roots, [], `${label}: "no real solution" but the rule is zero at ${roots}`);
};

/* ------------------------------------------------------------ reading stated sets */

const parseIntervals = (value) => ascii(value).split(' ∪ ').map((piece) => {
  const match = /^([[(])(-?[\d.]+|-∞), (-?[\d.]+|∞)([\])])$/.exec(piece.trim());
  if (!match) return null;
  const end = (raw) => (raw === '∞' ? Infinity : raw === '-∞' ? -Infinity : Number(raw));
  return { lo: end(match[2]), hi: end(match[3]), loIn: match[1] === '[', hiIn: match[4] === ']' };
});
/** A stated set of x- or y-values as intervals: interval notation, an inequality, all real numbers, none. */
const parseSet = (value) => {
  const text = ascii(value).trim();
  if (/^none$/.test(text)) return [];
  if (/^all real numbers$/i.test(text)) return [{ lo: -Infinity, hi: Infinity, loIn: false, hiIn: false }];
  let match = /^(-?[\d.]+) (≤|<) [xy] (≤|<) (-?[\d.]+)$/.exec(text);
  if (match) return [{ lo: Number(match[1]), hi: Number(match[4]), loIn: match[2] === '≤', hiIn: match[3] === '≤' }];
  match = /^[xy] (≥|>|≤|<) (-?[\d.]+)$/.exec(text);
  if (match) {
    const bound = Number(match[2]);
    return /[≥>]/.test(match[1])
      ? [{ lo: bound, hi: Infinity, loIn: match[1] === '≥', hiIn: false }]
      : [{ lo: -Infinity, hi: bound, loIn: false, hiIn: match[1] === '≤' }];
  }
  const intervals = parseIntervals(text);
  assert.ok(intervals.every(Boolean), `a readable set: "${value}"`);
  return intervals;
};
const inSet = (x, set) => set.some((part) => (x > part.lo || (part.loIn && close(x, part.lo))) && (x < part.hi || (part.hiIn && close(x, part.hi))));

const windowOf = (spec) => {
  const domain = spec.domain || {};
  const lo = Number.isFinite(Number(domain.min)) ? Number(domain.min) : -12;
  const hi = Number.isFinite(Number(domain.max)) ? Number(domain.max) : 12;
  return [Math.min(lo, hi - 1) - 2, Math.max(hi, lo + 1) + 2];
};
const samplesOf = (f, [low, high], extra = []) => {
  const xs = new Set(extra);
  for (let index = 0; index <= 2400; index += 1) xs.add(low + ((high - low) * index) / 2400);
  for (let x = Math.ceil(low); x <= high; x += 1) xs.add(x);
  return [...xs].sort((a, b) => a - b).map((x) => [x, f(x)]);
};

/** A stated domain, by sampling: f is defined exactly on it. */
const assertDomain = (f, spec, stated, label) => {
  const set = parseSet(stated);
  samplesOf(f, windowOf(spec)).forEach(([x, y]) => assert.equal(Number.isFinite(y), inSet(x, set), `${label}: domain ${stated} at x = ${x}`));
};
/** A stated range, by sampling: every output is in it, and each finite end is reached or approached as the brackets say. */
const assertRange = (f, spec, stated, label) => {
  const set = parseSet(stated);
  // Far out (an asymptote), and just inside an open end (a square root's start), where the outputs approach an excluded end.
  const ends = [spec.domain?.min, spec.domain?.max, spec.h].map(Number).filter(Number.isFinite).flatMap((end) => [1e-9, 1e-6, -1e-9, -1e-6].map((t) => end + t));
  const far = [...(spec.domain ? [] : [-1e4, -1e3, -200, 200, 1e3, 1e4]), ...ends];
  const ys = samplesOf(f, windowOf(spec), far).map(([, y]) => y).filter(Number.isFinite);
  ys.forEach((y) => assert.ok(inSet(y, set) || set.some((part) => close(y, part.lo, 1e-9) || close(y, part.hi, 1e-9)), `${label}: range ${stated} misses y = ${y}`));
  // An excluded end is approached (far out, past where floating point can tell) but never reached on the graph's window.
  const inWindow = samplesOf(f, windowOf(spec)).map(([, y]) => y).filter(Number.isFinite);
  set.forEach((part) => [[part.lo, part.loIn], [part.hi, part.hiIn]].forEach(([end, included]) => {
    if (!Number.isFinite(end)) return;
    const nearest = Math.min(...ys.map((y) => Math.abs(y - end)));
    const nearestInWindow = Math.min(...inWindow.map((y) => Math.abs(y - end)));
    assert.ok(included ? nearest < 1e-9 : nearestInWindow > 1e-12 && nearest < 0.05, `${label}: range ${stated}: the end ${end} is ${included ? 'reached' : 'approached, not reached'} (nearest ${nearest}, in the window ${nearestInWindow})`);
  }));
};
/** Monotone or sign intervals, by sampling away from their ends. */
const assertIntervals = (f, spec, kind, stated, label) => {
  const set = parseSet(stated);
  const points = samplesOf(f, windowOf(spec));
  for (let index = 1; index < points.length - 1; index += 1) {
    const [x, y] = points[index];
    const [before, after] = [points[index - 1][1], points[index + 1][1]];
    if (![y, before, after].every(Number.isFinite) || set.some((part) => close(x, part.lo, 1e-2) || close(x, part.hi, 1e-2))) continue;
    const change = after - before;
    if (['increasing', 'decreasing', 'constant'].includes(kind) && Math.abs(change) < 1e-12 && kind !== 'constant') continue;
    // Flat means flat on both sides: a turning point only looks flat to a symmetric difference.
    const truth = { positive: y > 1e-9, negative: y < -1e-9, increasing: change > 1e-12, decreasing: change < -1e-12, constant: Math.abs(y - before) < 1e-12 && Math.abs(after - y) < 1e-12 }[kind];
    assert.equal(inSet(x, set), truth, `${label}: ${kind} ${stated} at x = ${x}`);
  }
};

/* ------------------------------------------------------------ the shapes */

const graphLabelPhrase = (part) => ({
  domain: 'the domain is ', range: 'the range is ', increasing: 'it is increasing on ', decreasing: 'it is decreasing on ', constant: 'it is constant on ',
  positive: 'it is positive on ', negative: 'it is negative on ',
}[part.kind]);
const FEATURE_PHRASES = { vertex: 'the vertex', center: 'the center', xIntercepts: 'the x-intercepts', yIntercept: 'the y-intercept', localMinimum: 'the local minimum', localMaximum: 'the local maximum' };

/** The graph workspace: every part's stated answer from the summary, true of f and accepted by the part's grader. */
const checkGraph = (question, worked, label) => {
  const spec = question.functionSpec;
  const f = specFn(spec);
  f.unrestricted = specFn(spec, { restricted: false });
  const workspace = graphWorkspaceModelFor(question, { analysisMode: question.type === 'graphAnalysis' });
  const pieces = worked.answerSummary.split('; ').map((piece) => piece.replace(/^./, (c) => c.toLowerCase()));
  assertFunctionValues(f, worked.steps, label);
  const analysis = { answers: {}, typedPoints: {}, selections: {}, noneSelections: {} };
  workspace.analysisParts.forEach((part) => {
    if (part.kind === 'point') {
      const phrase = FEATURE_PHRASES[part.feature];
      const piece = pieces.find((one) => one.startsWith(`${phrase} `) || one.startsWith(`there is no ${phrase.slice(4)}`) || one.startsWith(`there are no ${phrase.slice(4)}`));
      assert.ok(piece, `${label}: the ${part.feature} is stated in "${worked.answerSummary}"`);
      const points = [...ascii(piece).matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
      // A reciprocal's center is where its asymptotes cross, off the graph: its symmetry is checked below.
      if (part.feature !== 'center') points.forEach(([x, y]) => assert.ok(close(f(x), y, 1e-9), `${label}: ${piece}: (${x}, ${y}) is on the graph`));
      if (part.feature === 'xIntercepts') points.forEach(([, y]) => assert.equal(y, 0, label));
      if (part.feature === 'yIntercept') points.forEach(([x]) => assert.equal(x, 0, label));
      if (['vertex', 'localMinimum', 'localMaximum'].includes(part.feature)) {
        // Both neighbours on the same side of the point, just inside the drawn piece.
        points.forEach(([x, y]) => [0.05, 0.1, 0.2].forEach((t) => assert.ok((f(x - t) - y) * (f(x + t) - y) > 0, `${label}: ${piece} turns`)));
      }
      if (part.feature === 'localMinimum') points.forEach(([x, y]) => assert.ok(f(x + 0.1) > y, label));
      if (part.feature === 'localMaximum') points.forEach(([x, y]) => assert.ok(f(x + 0.1) < y, label));
      if (part.feature === 'center') points.forEach(([x, y]) => [0.5, 1, 2].forEach((t) => assert.ok(close(f.unrestricted(x - t) + f.unrestricted(x + t), 2 * y, 1e-6), `${label}: ${piece} is a center`)));
      if (points.length) { analysis.selections[part.id] = points; analysis.typedPoints[part.id] = points.map(([x, y]) => `(${x}, ${y})`).join(', '); }
      else { analysis.noneSelections[part.id] = true; analysis.typedPoints[part.id] = 'none'; }
    } else {
      const phrase = graphLabelPhrase(part);
      const never = `it is never ${part.kind} (none)`;
      const piece = pieces.find((one) => one.startsWith(phrase) || one === never);
      assert.ok(piece, `${label}: the ${part.kind} is stated in "${worked.answerSummary}"`);
      const stated = piece === never ? 'none' : piece.slice(phrase.length);
      if (part.kind === 'domain') assertDomain(f, spec, stated, label);
      else if (part.kind === 'range') assertRange(f, spec, stated, label);
      else assertIntervals(f, spec, part.kind, stated, label);
      analysis.answers[part.id] = stated;
    }
    const graded = gradeAnalysisPart(part, analysis, workspace.analysisTolerance);
    assert.equal(graded.isCorrect, true, `${label}: the ${part.kind} part's grader accepts ${JSON.stringify(graded.response)}`);
  });
  if (workspace.constructionEnabled) {
    const piece = pieces.find((one) => one.startsWith('the graph goes through '));
    assert.ok(piece, `${label}: the construction is stated`);
    const points = [...ascii(piece.split(', with no point')[0]).matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
    const holes = [...ascii(piece.split(', with no point')[1] || '').matchAll(/x = (-?[\d.]+)/g)].map(([, x]) => Number(x));
    points.forEach(([x, y]) => assert.ok(close(f.unrestricted(x), y, 1e-9), `${label}: (${x}, ${y}) is on the rule`));
    holes.forEach((x) => assert.ok(!Number.isFinite(f.unrestricted(x)), `${label}: no point at x = ${x}`));
    // Placed on the cards the way a student places them: a stated x on its card, the rest in order.
    const free = [...points];
    const placements = {};
    const chosenXValues = {};
    workspace.tasks.filter((task) => !task.studentChoosesX).forEach((task) => {
      if (task.expected === 'undefined') { placements[task.id] = 'undefined'; assert.ok(holes.includes(Number(task.x)), `${label}: x = ${task.x} is stated as no point`); return; }
      const at = free.findIndex(([x]) => close(x, Number(task.x)));
      assert.ok(at >= 0, `${label}: the card at x = ${task.x} is plotted`);
      [placements[task.id]] = free.splice(at, 1);
    });
    workspace.tasks.filter((task) => task.studentChoosesX).forEach((task) => {
      const point = free.shift();
      assert.ok(point, `${label}: a chosen card is plotted`);
      placements[task.id] = point;
      [chosenXValues[task.id]] = point;
    });
    const graded = gradePointPlacements(workspace.tasks, placements, spec, chosenXValues, workspace.pointTolerance);
    assert.ok(graded.every((part) => part.isCorrect), `${label}: the placement grader accepts every card (${JSON.stringify(graded.filter((part) => !part.isCorrect))})`);
    // Every dot the steps draw is the end the workspace asks for.
    const dots = [...ascii(worked.steps.join(' ')).matchAll(/an? (open|closed) dot at \((-?[\d.]+), (-?[\d.]+)\)/g)].map(([, kind, x, y]) => [kind, Number(x), Number(y)]);
    const wanted = workspace.endpointRequirements.filter((requirement) => requirement.marker !== 'arrow');
    assert.equal(dots.length, wanted.length, `${label}: one dot per closed or open end`);
    wanted.forEach((requirement) => assert.ok(dots.some(([kind, x, y]) => kind === requirement.marker && close(x, requirement.point[0], 1e-6) && close(y, requirement.point[1], 1e-6)), `${label}: the ${requirement.marker} dot at (${requirement.point})`));
  }
  // Every dot the range evidence describes is the domain's own end.
  for (const [, x, kind] of ascii(worked.steps.join(' ')).matchAll(/f\((-?[\d.]+)\) = -?[\d.]+ \(an? (closed|open) dot/g)) {
    const inside = Number.isFinite(f(Number(x)));
    assert.equal(kind === 'closed', inside, `${label}: f(${x}) is ${kind}`);
  }
};

const STAGE_NAMES = {
  xIntercept: 'the x-intercepts', xInterceptValue: 'the x-intercepts', zeros: 'the zeros', yIntercept: 'the y-intercept', yInterceptValue: 'the y-intercept',
  extremeKind: 'the extreme', extremePoint: 'the maximum or minimum', extremeValue: 'the maximum or minimum', axisOfSymmetry: 'the axis of symmetry',
  asymptote: 'the asymptote', behavior: 'the behavior', domain: 'the domain', range: 'the range',
};

/** A composed functionCharacteristics item: each stage's stated answer, true of f and accepted by the stage's grader. */
const checkCharacteristics = (question, worked, label) => {
  const spec = question.functionSpec;
  const f = specFn(spec);
  f.unrestricted = specFn(spec, { restricted: false });
  const composed = readComposedQuestion(question);
  const pieces = worked.answerSummary.split('; ').map((piece) => piece.replace(/^./, (c) => c.toLowerCase()));
  assertFunctionValues(f, worked.steps, label);
  const responses = {};
  composed.workflow.forEach((stage) => {
    if (stage.showWhen && responses[stage.showWhen.stage] !== stage.showWhen.is) return;
    let response;
    if (stage.id.endsWith('Exists')) {
      const name = stage.id === 'xInterceptExists' ? 'an x-intercept' : 'a y-intercept';
      const piece = pieces.find((one) => one.endsWith(`${name} exists`) || one.endsWith(`${name} does not exist`));
      assert.ok(piece, `${label}: ${stage.id} is stated`);
      response = piece.startsWith('yes') ? 'Yes' : 'No';
      const zeros = samplesOf(f, windowOf(spec)).filter(([, y]) => Number.isFinite(y) && Math.abs(y) < 1e-9);
      if (stage.id === 'xInterceptExists') assert.equal(response === 'Yes', zeros.length > 0 || samplesOf(f, windowOf(spec)).some(([, y], index, all) => index && Number.isFinite(y) && Number.isFinite(all[index - 1][1]) && Math.sign(y) !== Math.sign(all[index - 1][1])), `${label}: x-intercept exists for ${JSON.stringify(spec)}: ${worked.answerSummary}`);
      else assert.equal(response === 'Yes', Number.isFinite(f(0)), `${label}: y-intercept exists`);
    } else {
      const piece = pieces.find((one) => one.startsWith(`${STAGE_NAMES[stage.id]}: `));
      assert.ok(piece, `${label}: ${stage.id} is stated in "${worked.answerSummary}"`);
      const stated = piece.slice(STAGE_NAMES[stage.id].length + 2);
      const points = [...ascii(stated).matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
      points.forEach(([x, y]) => assert.ok(close(f(x), y, 1e-9), `${label}: ${piece}: on the graph`));
      if (['xIntercept', 'xInterceptValue'].includes(stage.id)) points.forEach(([, y]) => assert.equal(y, 0, label));
      if (stage.id === 'zeros') ascii(stated).replace(/[{}]/g, '').split(', ').forEach((x) => assert.ok(close(f(Number(x)), 0), `${label}: ${x} is a zero`));
      if (['extremePoint', 'extremeValue'].includes(stage.id)) points.forEach(([x, y]) => assert.ok((f(x - 0.5) - y) * (f(x + 0.5) - y) > 0, `${label}: ${piece} turns`));
      if (stage.id === 'axisOfSymmetry') { const h = Number(/x = (-?[\d.]+)/.exec(ascii(stated))[1]); [0.5, 1, 2].forEach((t) => assert.ok(close(f(h - t), f(h + t)), `${label}: ${piece}`)); }
      if (stage.id === 'asymptote') { const k = Number(/y = (-?[\d.]+)/.exec(ascii(stated))[1]); assert.ok([-1e4, 1e4].some((x) => close(f(x), k, 1e-3)), `${label}: ${piece}`); }
      if (stage.id === 'domain') assertDomain(f, spec, stated, label);
      if (stage.id === 'range') assertRange(f, spec, stated, label);
      if (stage.id === 'behavior') {
        const ys = samplesOf(f, [-6, 6]).map(([, y]) => y).filter(Number.isFinite);
        const steps = ys.slice(1).map((y, index) => Math.sign(y - ys[index])).filter(Boolean);
        const pattern = steps.filter((value, index) => index === 0 || value !== steps[index - 1]).join(',');
        const expected = { 'Increasing everywhere': '1', 'Decreasing everywhere': '-1', 'Decreasing, then increasing': '-1,1', 'Increasing, then decreasing': '1,-1', 'Exponential growth': '1', 'Exponential decay': '-1' }[stated];
        assert.equal(pattern, expected, `${label}: ${piece}`);
      }
      if (stage.id === 'extremeKind') assert.ok(stage.choices.includes(stated), label);
      response = ['graphFeatureSelect', 'pointInput'].includes(stage.kind) ? (points.length ? stated : POINT_INPUT_NONE_TOKEN) : stated;
      if (['graphFeatureSelect', 'pointInput'].includes(stage.kind) && /^none$/.test(stated)) response = POINT_INPUT_NONE_TOKEN;
    }
    responses[stage.id] = response;
    const rule = composed.grading[stage.id];
    if (rule === undefined) return;
    const graded = ['graphFeatureSelect', 'pointInput'].includes(stage.kind) ? gradeFeaturePoints(response, rule) : gradeStage({ stage, rule, responses: { [stage.id]: response }, stages: composed.workflow });
    assert.equal(graded.isCorrect, true, `${label}: the ${stage.id} stage's grader accepts ${JSON.stringify(response)} (${graded.detail})`);
  });
};

/** The table-then-graph workflow: the table, discrete points, the domain and range sets. */
const checkTableGraph = (question, worked, label) => {
  const f = specFn(question.functionSpec);
  const composed = readComposedQuestion(question);
  assert.ok(assertArithmetic(worked.steps, label) >= 1, `${label}: the table is computed`);
  const pieces = worked.answerSummary.split('; ').map((piece) => piece.replace(/^./, (c) => c.toLowerCase()));
  const responses = {};
  composed.workflow.forEach((stage) => {
    if (stage.showWhen && responses[stage.showWhen.stage] !== stage.showWhen.is) return;
    let response;
    const id = stage.id;
    if (stage.kind === 'tableInput') {
      const piece = pieces.find((one) => one.startsWith('the table is '));
      const rows = [...ascii(piece).matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
      assert.deepEqual(rows.map(([x]) => x), stage.xValues.map(Number), `${label}: the table's inputs`);
      rows.forEach(([x, y]) => assert.ok(close(f(x), y, 1e-9), `${label}: f(${x}) = ${y}`));
      response = Object.fromEntries(rows.map(([, y], index) => [`${index}:y`, String(y)]));
    } else if (/continuity/.test(id)) {
      response = pieces.includes('it is discrete') ? 'discrete' : null;
      assert.ok(response, `${label}: discrete`);
    } else if (stage.kind === 'functionGraph' || stage.kind === 'coordinatePlot') {
      const piece = pieces.find((one) => one.startsWith('the graph is the points '));
      assert.ok(piece, `${label}: the graph is stated`);
      [...ascii(piece).matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].forEach(([, x, y]) => assert.ok(close(f(Number(x)), Number(y)), label));
      responses[id] = 'plotted';
      return;
    } else {
      const group = id.startsWith('domain') ? 'domain' : 'range';
      const piece = pieces.find((one) => one.startsWith(`the ${group} is `));
      assert.ok(piece, `${label}: the ${group} is stated`);
      response = piece.slice(`the ${group} is `.length);
      const values = ascii(response).replace(/[{}]/g, '').split(', ').map(Number);
      const xs = composed.workflow.find((one) => one.kind === 'tableInput').xValues.map(Number);
      const truth = [...new Set(xs.map((x) => (group === 'domain' ? x : f(x))))].sort((a, b) => a - b);
      assert.deepEqual(values, truth, `${label}: the ${group} set`);
    }
    responses[id] = response;
    const rule = composed.grading[id];
    if (rule === undefined) return;
    const graded = gradeStage({ stage, rule, responses: { [id]: response }, stages: composed.workflow });
    assert.equal(graded.isCorrect, true, `${label}: the ${id} stage's grader accepts ${JSON.stringify(response)} (${graded.detail})`);
  });
};

const relationTruth = (pairs) => {
  const xs = [...new Set(pairs.map(([x]) => x))].sort((a, b) => a - b);
  const ys = [...new Set(pairs.map(([, y]) => y))].sort((a, b) => a - b);
  const isFunction = pairs.every(([x, y]) => pairs.every(([p, q]) => p !== x || q === y));
  return { xs, ys, isFunction };
};

/** A relation (the tool, or the relationRepresentations recipe). */
const checkRelation = (question, worked, label) => {
  const pairs = (question.pairs || []).map((pair) => (Array.isArray(pair) ? pair : [pair.x, pair.y]).map(Number));
  const truth = relationTruth(pairs);
  const pieces = worked.answerSummary.split('; ').map((piece) => piece.replace(/^./, (c) => c.toLowerCase()));
  const setIn = (name) => {
    const piece = pieces.find((one) => one.startsWith(`the ${name} is {`));
    return piece ? ascii(piece).replace(/^.*\{|\}$/g, '').split(', ').map(Number) : null;
  };
  const domain = setIn('domain');
  const range = setIn('range');
  if (domain) assert.deepEqual(domain, truth.xs, `${label}: the domain`);
  if (range) assert.deepEqual(range, truth.ys, `${label}: the range`);
  const verdict = pieces.find((one) => /^it is (not )?a function/.test(one));
  if (verdict) assert.equal(!verdict.startsWith('it is not'), truth.isFunction, `${label}: the function test`);
  const arrows = pieces.find((one) => one.startsWith('the arrows are '));
  const drawn = arrows ? [...ascii(arrows).matchAll(/(-?[\d.]+) → (-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]) : [];
  const distinct = pairs.filter(([x, y], index) => pairs.findIndex(([p, q]) => p === x && q === y) === index);
  if (arrows) assert.deepEqual(drawn, distinct, `${label}: one arrow per pair`);
  const composed = readComposedQuestion(question);
  if (composed.composed) {
    composed.workflow.forEach((stage) => {
      const rule = composed.grading[stage.id];
      if (rule === undefined || stage.kind === 'coordinatePlot' || stage.kind === 'functionGraph') return;
      const response = /mapping/i.test(stage.kind) ? drawn
        : stage.id.startsWith('domain') ? `{${domain.join(', ')}}`
          : stage.id.startsWith('range') ? `{${range.join(', ')}}`
            : stage.choices?.find((choice) => gradeStage({ stage, rule, responses: { [stage.id]: choice }, stages: composed.workflow }).isCorrect && (/^yes/i.test(choice) === truth.isFunction)) ?? (truth.isFunction ? 'yes-definition' : 'no-input-repeat');
      const graded = gradeStage({ stage, rule, responses: { [stage.id]: response }, stages: composed.workflow });
      assert.equal(graded.isCorrect, true, `${label}: the ${stage.id} stage accepts ${JSON.stringify(response)}`);
    });
    return;
  }
  const ask = Array.isArray(question.ask) ? question.ask : ['mapping', 'domain', 'range'];
  const work = {
    arrows: drawn,
    plottedPoints: distinct,
    domainText: domain?.join(', ') ?? '',
    rangeText: range?.join(', ') ?? '',
    isFunction: verdict ? (truth.isFunction ? 'yes-definition' : 'no-input-repeat') : '',
  };
  const graded = gradeToolWork({ toolId: 'relationMapping', question, work });
  assert.equal(graded.isCorrect, true, `${label}: the relation grader accepts ${JSON.stringify(work)} for ${ask} (${JSON.stringify(graded.parts)})`);
};

/** A legacy table: every stated cell is the rule at its x, and the table grader accepts them. */
const checkTable = (question, worked, label) => {
  const rule = question.rule;
  const at = (x) => (rule.type === 'quadratic' ? rule.a * x * x + rule.b * x + rule.c : rule.m * x + rule.b);
  assert.ok(assertArithmetic(worked.steps, label) >= Object.keys(question.table.answers).length, `${label}: every cell is computed`);
  const cells = [...ascii(worked.answerSummary).matchAll(/(-?[\d.]+) \(at x = (-?[\d.]+)\)/g)].map(([, y, x]) => [Number(x), Number(y)]);
  cells.forEach(([x, y]) => assert.equal(at(x), y, `${label}: y at x = ${x}`));
  const responses = Object.fromEntries(Object.keys(question.table.answers).map((key) => {
    const row = Number(key.split(':')[0]);
    const cell = cells.find(([x]) => x === Number(question.table.rows[row].x));
    return [key, String(cell[1])];
  }));
  assert.equal(gradeTableResponse(question, responses).isCorrect, true, `${label}: the table grader accepts ${JSON.stringify(responses)}`);
};

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const sequenceOf = (raw = {}, fallback = 'arithmetic') => {
  const kind = raw.kind || fallback;
  const first = Number(raw.first ?? 1);
  const change = kind === 'arithmetic' ? Number(raw.difference ?? raw.change ?? raw.commonDifference ?? 1) : Number(raw.ratio ?? raw.change ?? raw.commonRatio ?? 2);
  return { kind, first, change, term: (n) => (kind === 'arithmetic' ? first + (n - 1) * change : first * change ** (n - 1)) };
};

/** A sequence: every term, sum and rule stated is the sequence's own, and the sequence grader accepts them. */
const checkSequence = (question, worked, label) => {
  const summary = ascii(worked.answerSummary);
  const steps = worked.steps.map(ascii);
  assertArithmetic(worked.steps, label);
  const mode = question.mode || 'analyze';
  const work = {};
  if (mode === 'compare') {
    const left = sequenceOf(question.left, 'arithmetic');
    const right = sequenceOf(question.right, 'geometric');
    const n = Number(question.compareN ?? 7);
    const [, larger, difference] = /^(?:The larger \w+ term is in (.+)|The \w+ terms are equal); the difference is (-?\d+(?:\.\d+)?)$/.exec(summary);
    assert.equal(Number(difference), Math.abs(left.term(n) - right.term(n)), label);
    const relation = left.term(n) > right.term(n) ? 'A' : right.term(n) > left.term(n) ? 'B' : 'equal';
    assert.equal(larger, { A: question.leftLabel || 'Sequence A', B: question.rightLabel || 'Sequence B', equal: undefined }[relation], label);
    Object.assign(work, { relation, difference });
  } else {
    const sequence = sequenceOf(question.sequence, question.sequence?.kind || question.kind);
    let match;
    if ((match = / with a common (difference|ratio) of (-?\d+(?:\.\d+)?)/.exec(summary))) {
      assert.equal(match[1], sequence.kind === 'arithmetic' ? 'difference' : 'ratio', label);
      assert.equal(Number(match[2]), sequence.change, label);
      Object.assign(work, { kindAnswer: sequence.kind, changeAnswer: match[2] });
    }
    if ((match = /the sequence is (arithmetic|geometric)/i.exec(summary))) { assert.equal(match[1], sequence.kind, label); work.kindAnswer = match[1]; }
    for (const [, ordinal, value] of summary.matchAll(/the (?:missing )?(\w+) term is (-?\d+(?:\.\d+)?)/gi)) {
      assert.equal(Number(value), sequence.term(ORDINALS.indexOf(ordinal)), `${label}: the ${ordinal} term`);
      if (mode === 'partialSum') work.lastTerm = value; else work.termAnswer = value;
    }
    if ((match = /the sum of the first (\d+) terms is (-?\d+(?:\.\d+)?)/i.exec(summary))) {
      const n = Number(match[1]);
      assert.equal(Number(match[2]), Array.from({ length: n }, (_, at) => sequence.term(at + 1)).reduce((sum, value) => sum + value, 0), label);
      work.sumAnswer = match[2];
    }
    if ((match = /explicit rule aₙ = ([^;]+)/i.exec(summary))) {
      const explicit = match[1].replace(/·/g, '*').replace(/(\d)\(/g, '$1*(');
      [1, 2, 3, 6].forEach((n) => assert.ok(close(math.evaluate(explicit, { n }), sequence.term(n)), `${label}: explicit rule at n = ${n}`));
      work.explicitRule = `aₙ = ${match[1]}`;
    }
    if ((match = /a₁ = (-?\d+(?:\.\d+)?)/.exec(summary))) { assert.equal(Number(match[1]), sequence.first, label); work.recursiveFirst = match[1]; }
    if ((match = /recursive rule aₙ = ([^;]+)/i.exec(summary))) {
      const rule = match[1].replace(/aₙ₋₁/g, 'p').replace(/·/g, '*').replace(/(\d)\(/g, '$1*(');
      [-3, 2, 10].forEach((p) => assert.ok(close(math.evaluate(rule, { p }), sequence.kind === 'arithmetic' ? p + sequence.change : p * sequence.change), `${label}: recursive rule`));
      work.recursiveRule = `aₙ = ${match[1]}`;
    }
    if ((match = /the table values are ([^;]+)/i.exec(summary))) {
      const values = match[1].split(', ').map(Number);
      values.forEach((value, index) => assert.equal(value, sequence.term(index + 1), label));
      work.tableValues = values.map(String);
    }
    if (/the graph is those separate points/i.test(summary)) work.plottedPoints = (work.tableValues || []).map((value, index) => [index + 1, Number(value)]);
    // The family test in the steps: the differences or the ratios it quotes are the terms'.
    for (const [, which, list] of steps.join(' ').matchAll(/(Differences|Ratios): ([-\d., ]+) are all equal/g)) {
      list.split(', ').map(Number).forEach((value) => assert.equal(value, sequence.change, `${label}: ${which}`));
    }
  }
  const graded = gradeToolWork({ toolId: 'sequenceExplorer', question, work });
  assert.equal(graded.isCorrect, true, `${label}: the sequence grader accepts ${JSON.stringify(work)} (${JSON.stringify(graded.parts?.filter((part) => !part.isCorrect))})`);
};

/** functionInvestigation2: the investigation spec read the tool's way, every stated feature re-solved. */
const investigationFn = ({ type, a = 1, h = 0, k = 0, base = 2 } = {}) => {
  const raw = {
    linear: (x) => a * (x - h) + k, quadratic: (x) => a * (x - h) ** 2 + k, absolute: (x) => a * Math.abs(x - h) + k,
    squareRoot: (x) => (x < h ? NaN : a * Math.sqrt(x - h) + k), cubic: (x) => a * (x - h) ** 3 + k, cubeRoot: (x) => a * Math.cbrt(x - h) + k,
    exponential: (x) => a * base ** (x - h) + k, logarithmic: (x) => (x <= h ? NaN : a * Math.log(x - h) / Math.log(base) + k), rational: (x) => (x === h ? NaN : a / (x - h) + k),
  }[type || 'rational'];
  return (x) => { const y = raw(x); return Number.isFinite(y) ? y : NaN; };
};
const checkInvestigation = (question, worked, label) => {
  const mode = question.mode || 'features';
  const summary = ascii(worked.answerSummary);
  let work;
  if (mode === 'compare') {
    const x = Number(question.x ?? 2);
    const [p, q] = [investigationFn(question.left)(x), investigationFn(question.right)(x)];
    assertFunctionValues((value) => (value === x ? p : NaN), worked.steps, label, 'f');
    assertFunctionValues((value) => (value === x ? q : NaN), worked.steps, label, 'g');
    const relation = close(p, q) ? 'equal' : p > q ? 'left' : 'right';
    assert.equal(summary, { left: 'f(x) - the solid blue curve', right: 'g(x) - the dashed red curve', equal: 'They are equal' }[relation].replace(' - ', ' — '), label);
    work = { comparison: relation };
  } else {
    const spec = { type: 'rational', a: 2, h: 1, k: -2, ...question.function };
    const f = investigationFn(spec);
    assertFunctionValues(f, worked.steps, label);
    if (mode === 'features') {
      const [, x, y] = /is \((-?[\d.]+), (-?[\d.]+)\)/.exec(summary).map(Number);
      if (spec.type !== 'rational') assert.ok(close(f(x), y), `${label}: the anchor is on the graph`);
      work = { anchorX: String(x), anchorY: String(y) };
      const vertical = /vertical asymptote is x = (-?[\d.]+)/.exec(summary);
      const horizontal = /horizontal asymptote is y = (-?[\d.]+)/.exec(summary);
      if (vertical) { assert.ok([1e-4, -1e-4].some((t) => Number.isNaN(f(Number(vertical[1]) + t)) || Math.abs(f(Number(vertical[1]) + t)) > 1e3), `${label}: x = ${vertical[1]}`); work.verticalAsymptote = vertical[1]; }
      if (horizontal) { assert.ok([-1e4, 1e4].some((t) => close(f(t), Number(horizontal[1]), 1e-3)), `${label}: y = ${horizontal[1]}`); work.horizontalAsymptote = horizontal[1]; }
    } else if (mode === 'domainRange') {
      const [, domain, range] = /^The domain is (.+); the range is (.+)$/.exec(summary);
      const codes = (text, variable) => (text === 'all real numbers' ? 'allReal' : { '≥': `${variable}Gte`, '>': `${variable}Gt`, '≤': `${variable}Lte`, '<': `${variable}Lt`, '≠': `${variable}Not` }[text.split(' ')[1]] + (variable === 'x' ? 'H' : 'K'));
      const xs = Array.from({ length: 801 }, (_, index) => -20 + index * 0.05);
      const domainSet = domain === 'all real numbers' ? () => true : (x) => ({ '≥': x >= Number(domain.split(' ')[2]) - 1e-9, '>': x > Number(domain.split(' ')[2]) + 1e-9, '≠': Math.abs(x - Number(domain.split(' ')[2])) > 1e-9 }[domain.split(' ')[1]]);
      xs.forEach((x) => assert.equal(Number.isFinite(f(x)), domainSet(x), `${label}: domain ${domain} at ${x}`));
      xs.map(f).filter(Number.isFinite).forEach((y) => assert.ok(range === 'all real numbers' || { '≥': y >= Number(range.split(' ')[2]) - 1e-9, '≤': y <= Number(range.split(' ')[2]) + 1e-9, '>': y > Number(range.split(' ')[2]), '<': y < Number(range.split(' ')[2]), '≠': y !== Number(range.split(' ')[2]) }[range.split(' ')[1]], `${label}: range ${range} misses ${y}`));
      work = { domainCode: codes(domain, 'x'), rangeCode: codes(range, 'y') };
    } else if (mode === 'intercepts') {
      const xPart = /x-intercepts are ([^;]+)/.exec(summary);
      const yPart = /y-intercept is (-?[\d.]+)/.exec(summary);
      if (xPart) xPart[1].split(', ').forEach((x) => assert.ok(close(f(Number(x)), 0), `${label}: f(${x}) = 0`));
      else assert.match(summary, /no x-intercept/, label);
      if (yPart) assert.ok(close(f(0), Number(yPart[1])), label); else assert.ok(!Number.isFinite(f(0)), label);
      work = { xIntercepts: xPart ? xPart[1] : 'none', yIntercept: yPart ? yPart[1] : 'none' };
    } else {
      const ys = Array.from({ length: 121 }, (_, index) => f(-6 + index * 0.1));
      const steps = ys.slice(1).map((y, index) => (Number.isFinite(y) && Number.isFinite(ys[index]) ? Math.sign(y - ys[index]) : 0)).filter(Boolean);
      const label2 = /^it (.+)$/i.exec(summary)[1];
      const code = { 'has a minimum at its defining point': 'minimum', 'has a maximum at its defining point': 'maximum', 'increases across its natural domain': 'increasing', 'decreases across its natural domain': 'decreasing', 'increases on each side of its vertical asymptote': 'increasingBranches', 'decreases on each side of its vertical asymptote': 'decreasingBranches' }[label2];
      if (code === 'increasing' || code === 'increasingBranches') assert.ok(steps.every((value) => value > 0), `${label}: rises`);
      if (code === 'decreasing' || code === 'decreasingBranches') assert.ok(steps.every((value) => value < 0), `${label}: falls`);
      if (code === 'minimum') assert.deepEqual([...new Set(steps)], [-1, 1], label);
      if (code === 'maximum') assert.deepEqual([...new Set(steps)], [1, -1], label);
      work = { behavior: code };
    }
  }
  const graded = gradeToolWork({ toolId: 'functionInvestigation2', question, work });
  assert.equal(graded.isCorrect, true, `${label}: the investigation grader accepts ${JSON.stringify(work)} (${JSON.stringify(graded.parts?.filter((part) => !part.isCorrect))})`);
};

/** A multiAnswer attribute item: every field's stated answer is its key, true of the rule, and graded right. */
const PARENTS = { '√x': (x) => (x < 0 ? NaN : Math.sqrt(x)), '∛x': Math.cbrt, '1/x': (x) => (x === 0 ? NaN : 1 / x), '2ˣ': (x) => 2 ** x, '3ˣ': (x) => 3 ** x, 'log₂(x)': (x) => (x <= 0 ? NaN : Math.log2(x)), '|x|': Math.abs, 'x²': (x) => x * x, 'x³': (x) => x ** 3 };
const checkAttributes = (question, worked, label) => {
  const pieces = worked.answerSummary.split('; ');
  assert.equal(pieces.length, question.answerFields.length, label);
  const responses = {};
  question.answerFields.forEach((field, index) => {
    const raw = String(field.label).replace(/[:?]\s*$/, '');
    const piece = pieces[index];
    const prefix = [`${raw}: `, `${raw} `].find((candidate) => piece.startsWith(candidate));
    assert.ok(prefix, `${label}: "${piece}" answers "${field.label}"`);
    responses[field.id] = piece.slice(prefix.length);
    assert.equal(responses[field.id], String(field.answer), `${label}: the stated answer is the key`);
  });
  // The rule itself, read here: its domain and range sampled against the stated sets.
  const source = `${question.prompt} ${question.answerFields.map((field) => field.label).join(' ')}`;
  const parent = Object.keys(PARENTS).find((rhs) => source.includes(`(x)=${rhs}`));
  const linear = /([A-Z])\((\w)\)\s*=\s*(\d+)\2(?:\s*\+\s*(\d+))?/.exec(source);
  const f = parent ? PARENTS[parent] : linear ? (t) => Number(linear[3]) * t + Number(linear[4] || 0) : null;
  const window = /(\d+) (?:to|≤ t ≤) (\d+)/.exec(source);
  question.answerFields.forEach((field) => {
    const stated = responses[field.id];
    if (!f || !/domain|range/i.test(field.label) || /\{/.test(stated)) return;
    const set = parseSet(stated);
    if (/domain/i.test(field.label) && !window) [-7, -0.5, 0, 0.5, 3, 40].forEach((x) => assert.equal(Number.isFinite(f(x)), inSet(x, set), `${label}: ${field.label} ${stated} at ${x}`));
    if (/range/i.test(field.label)) {
      const [lo, hi] = window ? [Number(window[1]), Number(window[2])] : [-50, 50];
      Array.from({ length: 1001 }, (_, at) => lo + ((hi - lo) * at) / 1000).map(f).filter(Number.isFinite)
        .forEach((y) => assert.ok(inSet(y, set) || set.some((part) => close(y, part.lo) || close(y, part.hi)), `${label}: ${field.label} ${stated} misses ${y}`));
    }
  });
  const graded = gradeMultiAnswerResponse(question, responses);
  assert.equal(graded.isCorrect, true, `${label}: the grader accepts ${JSON.stringify(responses)}`);
};

/* ------------------------------------------------------------ the instances */

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
const ITEMS = [];
const push = (label, question) => ITEMS.push({ label, question });
corpusFiles().forEach((file) => {
  let compiled;
  try { compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(file, 'utf8'))); } catch { return; }
  questionsIn(compiled.package || compiled).filter((question) => ff.matches(question)).forEach((question, index) => push(`${path.basename(file)} #${index}`, question));
});
const sampleTools = (name, tools) => questionsIn(readJson(name)).filter((question) => tools.includes(question.toolId) || tools.includes(question.type));
['SAMPLE_BATCH_C_DEEP_DIVE.json', 'SAMPLE_MISSING_MATH_TOOLS.json', 'SAMPLE_BATCH_D_DEEP_DIVE.json'].forEach((name) => sampleTools(name, ['sequenceExplorer', 'functionInvestigation2']).forEach((question, index) => push(`${name} #${index}`, question)));
[['SAMPLE_MERGED_FUNCTION_INVESTIGATION_ALGEBRA_QA.json', 'functionInvestigation'], ['SAMPLE_PRACTICE_WITH_DOL.json', 'functionInvestigation'], ['SAMPLE_GUIDED_NOTES_CLASSWORK.json', 'table'], ['SAMPLE_LOCAL_PERSISTENCE_RESUME_SOLUTION_QA.json', 'table']]
  .forEach(([name, type]) => sampleTools(name, [type]).forEach((question) => ['seed-1', 'seed-2', 'seed-3'].forEach((seed) => push(`${name} ${seed}`, generateQuestion(question, seed)))));
questionsIn(compileAuthoringIntentV5(readJson('SAMPLE_AUTHORING_INTENT_V5.json')).package).filter((question) => ff.matches(question)).forEach((question, index) => push(`SAMPLE_AUTHORING_INTENT_V5 #${index}`, question));

const seeded = (seed) => {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return { next, pick: (values) => values[Math.floor(next() * values.length)], int: (low, high) => low + Math.floor(next() * (high - low + 1)) };
};

// Graph workspaces: every function type, every analysis part, restricted and not, open and closed ends.
const TYPES = ['linear', 'absolute', 'quadratic', 'squareRoot', 'cubic', 'cubeRoot', 'exponential', 'logarithmic', 'rational'];
const PART_SETS = [
  ['domain', 'range'], ['increasing', 'decreasing'], ['positive', 'negative'], ['constant', 'increasing', 'decreasing'],
  ['point:vertex'], ['point:center'], ['point:xIntercepts'], ['point:yIntercept'], ['point:localMinimum'], ['point:localMaximum'],
  ['domain', 'range', 'point:yIntercept'], [],
];
{
  const random = seeded(31337);
  TYPES.forEach((type) => {
    for (let index = 0; index < 72; index += 1) {
      const parts = PART_SETS[index % PART_SETS.length];
      const spec = type === 'linear'
        ? { type, m: random.pick([1, -1, 2, -2, 0.5, 3]), b: random.int(-4, 4) }
        : { type, a: random.pick([1, -1, 2, -2, 0.5]), h: random.int(-3, 3), k: random.int(-3, 3) };
      if (type === 'exponential') { spec.base = random.pick([2, 3, 0.5]); spec.h = 0; }
      if (type === 'logarithmic') spec.base = random.pick([2, 10]);
      if (random.next() < 0.35) {
        const low = random.int(-4, 1);
        spec.domain = { min: low, max: low + random.int(2, 6), minClosed: random.next() < 0.7, maxClosed: random.next() < 0.7 };
      }
      const notation = random.pick(['interval', 'inequality']);
      const analysisRequests = parts.map((part) => (part.startsWith('point:') ? { id: part.slice(6), kind: 'point', feature: part.slice(6), responseMode: random.pick(['click', 'input']) } : { id: part, kind: part, notation }));
      push(`graph ${type} ${parts.join(',') || 'construct'} #${index}`, parts.length
        ? { type: 'graphAnalysis', functionSpec: spec, analysisRequests, prompt: `Use the graph shown (${index}).` }
        : { type: random.pick(['functionGraph', 'functionInvestigation']), functionSpec: spec, prompt: `Graph the function (${index}).`, ...(index % 2 ? { studentChoosesX: true } : {}) });
    }
  });
}

// functionCharacteristics, compiled from intents the way a lesson reaches a class.
{
  const lesson = readJson('teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json');
  const random = seeded(2718);
  const ACTIONS = ['findXIntercepts', 'findZeros', 'findYIntercept', 'findMaximum', 'findMinimum', 'findAxisOfSymmetry', 'findAsymptote', 'analyzeIncreasing', 'analyzeDomain', 'analyzeRange'];
  const intents = [];
  ['linear', 'quadratic', 'absolute', 'exponential', 'squareRoot'].forEach((familyName) => {
    for (let index = 0; index < 30; index += 1) {
      const fn = familyName === 'linear' ? { family: familyName, m: random.pick([2, -1, 3, -2]), b: random.int(-4, 4) } : { family: familyName, a: random.pick([1, -1, 2, -2]), h: random.int(-3, 3), k: random.int(-3, 3) };
      if (familyName === 'exponential') { fn.base = random.pick([2, 0.5, 3]); fn.h = 0; fn.a = Math.abs(fn.a); }
      const actions = ['readGraph', ...ACTIONS.filter(() => random.next() < 0.35)];
      if (actions.length === 1) actions.push(random.pick(ACTIONS));
      intents.push({ standard: 'A.9D', dok: 2, difficultyBand: 2, prompt: `Use the graph shown to describe this function. (${familyName} ${index})`, studentActions: actions, function: fn, graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } });
    }
  });
  questionsIn(compileAuthoringIntentV5({ ...lesson, sections: [{ ...lesson.sections[0], questions: intents }] }).package)
    .filter((question) => question.type === 'functionCharacteristics' && ff.matches(question))
    .forEach((question, index) => push(`characteristics compiled #${index}: ${question.prompt}`, question));
}

// The table-then-graph workflow, authored the way the L1 Day 2 lesson authors its own.
{
  const lesson = readJson('teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json');
  const section = lesson.sections.find(({ questions }) => questions.some((question) => question.table && question.function?.family === 'linear'));
  const base = section.questions.find((question) => question.table && question.function?.family === 'linear');
  const random = seeded(1618);
  const questions = Array.from({ length: 30 }, (_, index) => {
    const m = random.pick([2, -3, 0.5, -1, 4, 0.25]);
    const b = index % 5 === 0 ? 0 : random.int(-6, 6);
    const xs = [...new Set(Array.from({ length: random.int(3, 5) }, () => random.int(-4, 8)))].sort((p, q) => p - q);
    const ys = [...new Set(xs.map((x) => m * x + b))].sort((p, q) => p - q);
    return {
      ...base,
      prompt: `Complete the table for f(x) = ${m}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} over x ∈ {${xs.join(', ')}}, plot only those points, state the domain and range, and classify the relation as discrete or continuous.`,
      function: { family: 'linear', m, b },
      table: { columns: ['x', 'f(x)'], rows: xs.map((x) => [x, null]) },
      answerModel: { domain: `{${xs.join(', ')}}`, range: `{${ys.join(', ')}}`, continuity: 'discrete' },
    };
  });
  questionsIn(compileAuthoringIntentV5({ ...lesson, sections: [{ ...section, questions }] }).package)
    .filter((question) => ff.matches(question) && question.type === 'functionGraph')
    .forEach((question, index) => push(`table-graph authored #${index}`, question));
}

// Relations, legacy tables, sequences, investigations.
{
  const random = seeded(4711);
  for (let index = 0; index < 60; index += 1) {
    const count = random.int(3, 5);
    const pairs = Array.from({ length: count }, () => [random.int(-6, 9), random.int(-6, 9)]);
    if (index % 3 === 0) pairs.push([pairs[0][0], pairs[0][1] + 1]);
    const ask = [['mapping', 'domain', 'range'], ['mapping', 'isFunction'], ['domain', 'range', 'isFunction'], ['mapping', 'plot', 'domain', 'range', 'isFunction']][index % 4];
    push(`relation tool #${index}`, { type: 'relationMapping', prompt: `Work with the relation (${index}).`, pairs, ask });
    const ruleType = index % 2 ? 'quadratic' : 'linear';
    push(`table ${ruleType} #${index}`, generateQuestion({ type: 'table', prompt: 'Complete the table.', generator: { kind: 'functionTable', ruleType, rowCount: 5, blankCount: 3 } }, `ksteps-table-${index}`));
    const kind = random.pick(['arithmetic', 'geometric']);
    const first = random.pick([3, -2, 5, 1, 4, -6, 0.5]);
    const change = kind === 'arithmetic' ? random.pick([4, -3, 2, 7, -5, 0.5]) : random.pick([2, -3, 3, 0.5]);
    const mode = ['analyze', 'missingTerm', 'partialSum', 'ruleBridge', 'fullBridge', 'compare'][index % 6];
    push(`sequence ${mode} #${index}`, mode === 'compare'
      ? { type: 'sequenceExplorer', mode, prompt: `Compare (${index})`, left: { kind: 'arithmetic', first, difference: Math.abs(change) + 1 }, right: { kind: 'geometric', first: 2, ratio: 2 }, compareN: random.int(4, 8), leftLabel: 'A', rightLabel: 'B' }
      : { type: 'sequenceExplorer', mode, prompt: `Sequence (${index})`, sequence: { kind, first, ...(kind === 'arithmetic' ? { difference: change } : { ratio: change }) }, targetN: random.int(5, 9), missingIndex: random.int(1, 5), sumN: random.int(4, 7), studentActions: mode === 'fullBridge' ? random.pick([['analyzeSequence', 'writeRecursive'], ['buildSequenceTable', 'writeExplicit', 'findSequenceTerm']]) : [] });
    const type = random.pick(TYPES);
    const fn = { type, a: random.pick([1, -1, 2, -2, 0.5]), h: random.int(-3, 3), k: random.int(-3, 3), base: random.pick([2, 0.5, 3]) };
    const investigationMode = ['features', 'domainRange', 'intercepts', 'behavior', 'compare'][index % 5];
    push(`investigation ${investigationMode} ${type} #${index}`, investigationMode === 'compare'
      ? { type: 'functionInvestigation2', mode: investigationMode, prompt: `Compare (${index})`, left: fn, right: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: random.int(-3, 3) }
      : { type: 'functionInvestigation2', mode: investigationMode, prompt: `Investigate (${index})`, function: fn });
  }
}

// multiAnswer attributes: restricted lines in context, and every parent.
{
  const random = seeded(8080);
  const many = (prompt, responses) => ({ standard: 'A2.2A', dok: 2, difficultyBand: 2, prompt, studentActions: ['multipleResponses'], responses });
  const choice = (id, label, answer, distractors) => ({ id, label, type: 'choice', options: [answer, ...distractors.filter((option) => option !== answer)], answer });
  const questions = [];
  for (let index = 0; index < 20; index += 1) {
    const rate = random.int(2, 9);
    const start = random.int(0, 20);
    const max = random.int(5, 30);
    questions.push(many(`A ride costs C(t) = ${rate}t + ${start} for any real riding time t from 0 to ${max} minutes. Complete the attributes.`, [
      choice('continuity', 'Discrete or continuous?', 'continuous', ['discrete']),
      choice('domain', 'Reasonable domain', `[0, ${max}]`, [`{0, 1, 2, …, ${max}}`, '(−∞, ∞)']),
      choice('range', 'Reasonable range', `[${start}, ${rate * max + start}]`, [`[0, ${rate * max}]`]),
    ]));
  }
  const PARENT_KEYS = [
    ['√x', 'square root', '[0, ∞)', '[0, ∞)'], ['1/x', 'reciprocal', '(−∞, 0) ∪ (0, ∞)', '(−∞, 0) ∪ (0, ∞)'], ['∛x', 'cube root', '(−∞, ∞)', '(−∞, ∞)'],
    ['|x|', 'absolute value', '(−∞, ∞)', '[0, ∞)'], ['x²', 'quadratic', '(−∞, ∞)', '[0, ∞)'], ['x³', 'cubic', '(−∞, ∞)', '(−∞, ∞)'],
    ['2ˣ', 'exponential', '(−∞, ∞)', '(0, ∞)'], ['log₂(x)', 'logarithmic', '(0, ∞)', '(−∞, ∞)'],
  ];
  PARENT_KEYS.forEach(([rhs, family, domain, range]) => {
    questions.push(many(`Identify the family and key attributes of f(x)=${rhs}.`, [
      choice('family', 'Parent family', family, ['cubic', 'reciprocal']), choice('domain', 'Domain', domain, ['(−∞, ∞)', '[0, ∞)']), choice('range', 'Range', range, ['(−∞, ∞)', '[0, ∞)']),
    ]));
  });
  questions.push(many('For f(x)=3ˣ and g(x)=log₂(x), identify the matching asymptotes.', [choice('exp', 'Asymptote of f', 'y=0', ['x=0']), choice('log', 'Asymptote of g', 'x=0', ['y=0'])]));
  questions.push(many('Review f(x)=3ˣ.', [choice('intercept', 'y-intercept', '(0, 1)', ['(1, 0)']), choice('asymptote', 'Horizontal asymptote', 'y=0', ['x=0'])]));
  const lesson = readJson('teacher-import-jsons/algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json');
  questionsIn(compileAuthoringIntentV5({ ...lesson, sections: [{ ...lesson.sections[0], questions }] }).package)
    .filter((question) => question.type === 'multiAnswer' && ff.matches(question))
    .forEach((question, index) => push(`attributes #${index}: ${question.prompt.slice(0, 50)}`, question));
}

/* ------------------------------------------------------------ the sweep */

const kindOf = (question) => {
  const type = question.type || question.toolId;
  if (type === 'multiAnswer') return 'attributes';
  if (type === 'sequenceExplorer') return 'sequence';
  if (type === 'functionInvestigation2') return 'investigation';
  if (type === 'table') return 'table';
  const composed = readComposedQuestion(question);
  if (composed.composed) {
    if (composed.recipe === 'relationRepresentations') return 'relation';
    if (composed.recipe === 'functionModeling' || type === 'relationshipModel') return 'modeling';
    return composed.workflow.some((stage) => stage.kind === 'tableInput') ? 'tableGraph' : 'characteristics';
  }
  if (type === 'relationMapping') return 'relation';
  if (type === 'relationshipModel') return 'modeling';
  return 'graph';
};
const CHECKS = { graph: checkGraph, characteristics: checkCharacteristics, tableGraph: checkTableGraph, relation: checkRelation, table: checkTable, sequence: checkSequence, investigation: checkInvestigation, attributes: checkAttributes };

test('every shape the family claims: the steps work THIS item, each is true, the last is the answer, and the shared grader accepts it', () => {
  const worked = {};
  const seen = {};
  for (const { label, question } of ITEMS) {
    assert.equal(ff.matches(question), true, `${label}: claimed`);
    const kind = kindOf(question);
    seen[kind] = (seen[kind] || 0) + 1;
    const solution = ff.workedSolution(question);
    if (kind === 'modeling') { assert.equal(solution, null, `${label}: a scenario model is left to the panel's authored answers`); continue; }
    if (!solution) continue;
    worked[kind] = (worked[kind] || 0) + 1;
    assertClean(solution, label);
    assertLastIsSummary(solution, label);
    assertArithmetic(solution.steps, label);
    CHECKS[kind](question, solution, label);
  }
  // Explained wherever the analyzer can be exact: most of every shape (irrational zeros and inexact values are left alone).
  const share = (kind, minimum) => assert.ok((worked[kind] || 0) >= minimum * (seen[kind] || 0) && worked[kind] > 0, `${kind}: ${worked[kind]} of ${seen[kind]} worked (${JSON.stringify({ worked, seen })})`);
  share('graph', 0.55);
  share('characteristics', 0.6);
  share('tableGraph', 0.9);
  share('relation', 0.95);
  share('table', 0.95);
  share('sequence', 0.6);
  share('investigation', 0.6);
  share('attributes', 0.9);
});

test('edges: a horizontal line, a zero vertex, a graph with no x-intercept, a constant sequence', () => {
  // y = 3: its range is {3}, but the workspace grader keys it as every real number (and a line's
  // monotone parts as "none"), so the line is not explained — never stated against its own grader.
  const flat = { type: 'graphAnalysis', functionSpec: { type: 'linear', m: 0, b: 3 }, analysisRequests: [{ id: 'domain', kind: 'domain' }, { id: 'range', kind: 'range' }], prompt: 'Use the graph.' };
  assert.equal(ff.workedSolution(flat), null);
  const slanted = ff.workedSolution({ ...flat, functionSpec: { type: 'linear', m: -2, b: 0 } });
  assert.deepEqual(slanted.steps, [
    'f(x) = -2x is a line with slope -2, so it falls from left to right.',
    'Domain: every real number can be substituted, so the domain is (-∞, ∞).',
    'Range: a line that is not horizontal keeps rising or falling without end and reaches every height, so the range is (-∞, ∞).',
    'So the domain is (-∞, ∞) and the range is (-∞, ∞).',
  ]);
  const origin = ff.workedSolution({ type: 'graphAnalysis', functionSpec: { type: 'quadratic', a: 1, h: 0, k: -4 }, analysisRequests: [{ id: 'v', kind: 'point', feature: 'vertex' }, { id: 'x', kind: 'point', feature: 'xIntercepts' }, { id: 'y', kind: 'point', feature: 'yIntercept' }], prompt: 'Use the graph.' });
  assert.deepEqual(origin.steps.slice(1), [
    'The vertex is (h, k) = (0, -4).',
    'x-intercepts: solving x² - 4 = 0 gives (-2, 0) and (2, 0).',
    'y-intercept: f(0) = -4, the point (0, -4).',
    'So the vertex is (0, -4), the x-intercepts are (-2, 0), (2, 0) and the y-intercept is (0, -4).',
  ]);
  // y = x² touches the axis at its vertex; the workspace keys two sampled points near 0 there,
  // which no true answer matches, so the item is left to the panel.
  assert.equal(ff.workedSolution({ type: 'graphAnalysis', functionSpec: { type: 'quadratic', a: 1, h: 0, k: 0 }, analysisRequests: [{ id: 'x', kind: 'point', feature: 'xIntercepts' }], prompt: 'Use the graph.' }), null);
  const above = ff.workedSolution({ type: 'graphAnalysis', functionSpec: { type: 'quadratic', a: 1, h: 2, k: 3 }, analysisRequests: [{ id: 'x', kind: 'point', feature: 'xIntercepts' }, { id: 'p', kind: 'positive' }, { id: 'n', kind: 'negative' }], prompt: 'Use the graph.' });
  assert.ok(above.steps.some((step) => step.startsWith('(x - 2)² + 3 never equals zero where the graph is drawn')), above.steps.join('\n'));
  assert.match(above.answerSummary, /there are no x-intercepts \(none\).*it is positive on \(-∞, ∞\); it is never negative \(none\)/i);
  // Cards whose x the student chooses: two on each side of a parabola's axis, every card on the curve.
  const chosen = ff.workedSolution({ type: 'functionGraph', functionSpec: { type: 'quadratic', a: 1, h: 1, k: -2 }, studentChoosesX: true, prompt: 'Graph the function.' });
  assert.ok(chosen, 'a construction with chosen x-values is explained');
  assert.equal(chosen.steps[1], 'Choose x-values in the domain for the open cards, two on each side of x = 1: x = -1, 0, 2, 3.');
  assert.equal(chosen.answerSummary, 'The graph goes through (-1, 2), (0, -1), (1, -2), (2, -1), (3, 2)');
  // A constant sequence is both arithmetic and geometric: the test cannot tell, so it is not explained.
  assert.equal(ff.workedSolution({ type: 'sequenceExplorer', mode: 'analyze', prompt: 'Analyze.', sequence: { kind: 'arithmetic', first: 4, difference: 0 } }), null);
});

test('it returns null — never a wrong step — when a key is not what the function gives', () => {
  const [wrongRange] = questionsIn(compileAuthoringIntentV5({
    ...readJson('teacher-import-jsons/algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json'),
    sections: [{ title: 'K', role: 'classwork', questions: [{
      standard: 'A2.2A', dok: 2, difficultyBand: 2, prompt: 'Identify the family and key attributes of f(x)=√x.', studentActions: ['multipleResponses'],
      responses: [{ id: 'domain', label: 'Domain', type: 'choice', options: ['[0, ∞)', '(−∞, ∞)'], answer: '(−∞, ∞)' }],
    }] }],
  }).package);
  assert.equal(ff.matches(wrongRange), true);
  assert.equal(ff.workedSolution(wrongRange), null);
  const wrongAsymptote = { type: 'multiAnswer', prompt: 'Review f(x)=2ˣ.', answerFields: [{ id: 'asymptote', label: 'Horizontal asymptote', type: 'choice', options: ['y=1', 'y=0'], answer: 'y=1' }] };
  assert.equal(ff.matches(wrongAsymptote), true);
  assert.equal(ff.workedSolution(wrongAsymptote), null);
  // A graph key that disagrees with the function (an authored accepted answer) is not explained.
  const authored = { type: 'graphAnalysis', functionSpec: { type: 'quadratic', a: 1, h: 1, k: -4 }, analysisRequests: [{ id: 'range', kind: 'range', acceptedAnswers: ['[-3, ∞)'] }], prompt: 'Use the graph.' };
  assert.equal(ff.workedSolution(authored), null);
  // An irrational zero is never printed as a rounded decimal.
  assert.equal(ff.workedSolution({ type: 'graphAnalysis', functionSpec: { type: 'quadratic', a: 1, h: 0, k: -2 }, analysisRequests: [{ id: 'x', kind: 'point', feature: 'xIntercepts' }], prompt: 'Use the graph.' }), null);
  assert.equal(ff.workedSolution(null), null);
});

test('the closed-question review uses it for an item with no authored steps, and only there', () => {
  const question = { type: 'graphAnalysis', functionSpec: { type: 'absolute', a: 1, h: 2, k: -3 }, analysisRequests: [{ id: 'domain', kind: 'domain', notation: 'interval' }, { id: 'range', kind: 'range', notation: 'interval' }], prompt: 'Use the graph of f(x) = |x − 2| − 3.' };
  assert.equal(familyFor(question), ff);
  const review = buildClosedQuestionReview({ question, isToolQuestion: true });
  assert.equal(review.fromFamily, true);
  assert.deepEqual(review.authored.reasoning, ff.workedSolution(question).steps);
  assert.equal(review.authored.answerSummary, 'The domain is (-∞, ∞); the range is [-3, ∞)');
  const source = executableSource(readFileSync(path.join(ROOT, 'src/platform/supports/families/functionFeatures.js'), 'utf8'));
  const sectionStart = source.indexOf('const exact =');
  assert.ok(sectionStart > 0, 'the worked-solution section');
  for (const name of ['export const hints', 'export const backUpQuestion', 'export const similarProblem', 'export const expectedValues', 'export const matches']) {
    const at = source.indexOf(name);
    assert.ok(at > 0 && at < sectionStart, `${name} comes before the worked solution`);
  }
  assert.doesNotMatch(source.slice(0, sectionStart), /workedSolution|graphWorked|composedWorked|attributesWorked/, 'an open-item path calls the worked solution');
  assert.deepEqual([...source.slice(sectionStart).matchAll(/export const (\w+)/g)].map((match) => match[1]), ['workedSolution']);
});
