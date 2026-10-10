/*
 * WIDENED: six Algebra II parent-function graph templates (job J, "Content that
 * teaches").
 *
 * A2.2A exponential / logarithmic / reciprocal / root-family / symmetry-family
 * graphs and A2.2C exponential-log features drew two to six distinct questions
 * in the 30 recap probe draws, so the recap had to withhold them. They now vary
 * what the template already varied or plainly could, at the same difficulty:
 *   - which x-values the student plots (named in the prompt, and in the point
 *     labels the workspace already showed): perfect squares / cubes for the
 *     roots, opposite inputs for |x| and x^3, four of -2, -1, -1/2, 1/2, 1, 2
 *     on the core 1/x graph, a larger power of 2 for log base 2;
 *   - the exponential base: 2 or 3, growth or decay (1/2 or 1/3);
 *   - the base of the A2.2C inverse pair (2..10);
 *   - who makes the claim in the logarithm error-analysis prompts.
 * Every function stays the PARENT function; no transformation was added.
 *
 * A plotted point is graded within 0.28 of its key, so every NEW point keeps
 * its output at least 1/3 away from a horizontal asymptote (and its input
 * clear of a vertical one): a point dropped onto the asymptote is never
 * accepted. For the same reason every key lies exactly on the workspace's snap
 * grid (min(grid step, snapStep)), and no key is within the tolerance of
 * another plotted output: an earlier draft asked for 1/x at x = 3 on a 0.5
 * grid, where the only placeable point was (3, 0.5) = f(2) and it was graded
 * correct. The only off-grid keys are the committed ones (3^-1 = 1/3 and the
 * ln points 1/e, e), and the new (1/3)^1 that mirrors 3^-1.
 *
 * The 1/x core variant is the one family below the usual 12: only inputs
 * -2, -1, -1/2, 1/2, 1, 2 give outputs on its 0.5 grid that are clear of each
 * other and of y = 0, so it has 15 point sets plus the fixed adaptive item and
 * draws 10 distinct questions in the 30 probes (hard floor 8).
 *
 * Hints and feedback are released after a miss while the item is still open,
 * so none states a plotted point, an analysis answer, or the correct option.
 *
 * What this file proves, from the DRAFT source the integrator builds from:
 *   - each template draws >= 12 distinct questions in the 30 recap probe draws
 *     (1/x: >= 10), never below the recap's hard floor of 8;
 *   - for >= 120 draws, every plotted point and every analysis answer equals an
 *     independent mathjs evaluation of the function the prompt shows, and the
 *     production issuer and grader accept that work and reject a wrong point;
 *   - every point, intercept and asymptote level lies inside the graph window;
 *   - the fields this widening must not touch keep their committed values.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as math from 'mathjs';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const draft = (code) => JSON.parse(readFileSync(new URL(`../../drafts/fidelity-v2/algebra2/${code}.json`, import.meta.url), 'utf8'));
const DOCUMENTS = [...draft('A2.2A').documents, ...draft('A2.2C').documents];
const template = (id) => {
  const found = DOCUMENTS.find((entry) => entry.id === id);
  assert.ok(found, `${id} is in the draft`);
  return found;
};

// The recap's content key (tests/platform/pathRecapWithheld.test.mjs).
const contentKey = (question) => JSON.stringify({
  p: question.prompt,
  s: question.stimulus,
  sc: question.scenario,
  c: (Array.isArray(question.choices) ? question.choices : [])
    .map((choice) => (choice && typeof choice === 'object') ? (choice.text ?? choice.label ?? choice.latex ?? choice.value ?? '') : choice),
  f: (Array.isArray(question.responseFields) ? question.responseFields : [])
    .map((field) => (field && typeof field === 'object') ? (field.label ?? field.prompt ?? '') : field),
});

// --- pinned committed values ------------------------------------------------------

const COMMON = {
  courseId: 'algebra2',
  familyVersion: 3,
  questionType: 'response',
  activityRole: 'practice',
  calculatorPolicy: 'inherit',
};
const GRAPH = { type: 'functionInvestigation', representation: 'graph', alignmentKeys: ['texas:A2.2A'], assessedConstruct: 'A2.2A' };

const A = (id, label, kind, expected, extra = {}) => ({
  id, label, kind, responseMode: 'text', expected, ...(kind === 'domain' || kind === 'range' ? { notation: 'interval' } : {}), ...extra,
});
const EXP_ANALYSIS = [
  A('yint', 'y-intercept value', 'value', ['1']),
  A('hasym', 'Horizontal asymptote y-value', 'value', ['0']),
  A('domain', 'Domain', 'domain', ['(-∞,∞)', 'all real numbers']),
  A('range', 'Range', 'range', ['(0,∞)']),
];
const LOG_ANALYSIS = [
  A('domain', 'Domain', 'domain', ['(0,∞)']),
  A('range', 'Range', 'range', ['(-∞,∞)', 'all real numbers']),
  A('xint', 'x-intercept x-value', 'value', ['1']),
  A('vasym', 'Vertical asymptote x-value', 'value', ['0']),
];
const RECIP_ANALYSIS = [
  A('vasym', 'Vertical asymptote x-value', 'value', ['0']),
  A('hasym', 'Horizontal asymptote y-value', 'value', ['0']),
  A('domain', 'Domain', 'domain', ['(-∞,0)∪(0,∞)']),
  A('range', 'Range', 'range', ['(-∞,0)∪(0,∞)']),
];

// One row per effective variant: [coverageKey, dok, band, taskType, functionSpec.type, point ids, analysis].
const PINNED = {
  'mm_A2_2A_v2_exponential-graph-attributes': {
    ...GRAPH, familyId: 'mathmaster:A2.2A:v2-exponential-graph-attributes', taskType: 'representationTranslation', difficultyBand: 3, dok: 2,
    // The committed family had no variants; growth and decay both keep its cell and its tasks.
    rows: [
      ['core-d2b3-exponential-growth', 2, 3, 'representationTranslation', 'exponential', 'p0,p1,p2,pm1', EXP_ANALYSIS],
      ['core-d2b3-exponential-decay', 2, 3, 'representationTranslation', 'exponential', 'p0,p1,p2,pm1', EXP_ANALYSIS],
    ],
  },
  'mm_A2_2A_v2_logarithmic-graph-attributes': {
    ...GRAPH, familyId: 'mathmaster:A2.2A:v2-logarithmic-graph-attributes', taskType: 'errorAnalysis', difficultyBand: 4, dok: 3,
    rows: [
      ['core-d3b4-log-base2', 3, 4, 'errorAnalysis', 'logarithmic', 'p1,pbase,pinv', LOG_ANALYSIS],
      ['core-d3b4-log-alt-1', 3, 4, 'errorAnalysis', 'logarithmic', 'p1,pbase,pinv', LOG_ANALYSIS],
      ['core-d3b4-log-alt-2', 3, 4, 'errorAnalysis', 'logarithmic', 'p1,pbase,pinv', LOG_ANALYSIS],
      ['adaptive-d3b3-log-domain-claim-fixed-base2', 3, 3, 'errorAnalysis', 'logarithmic', 'p1,pbase,pinv', LOG_ANALYSIS],
    ],
  },
  'mm_A2_2A_v2_reciprocal-graph-attributes': {
    ...GRAPH, familyId: 'mathmaster:A2.2A:v2-reciprocal-graph-attributes', taskType: 'interpretation', difficultyBand: 3, dok: 2,
    rows: [
      ['core-d2b3', 2, 3, 'interpretation', 'rational', 'p1,p2,pm1,pm2', RECIP_ANALYSIS],
      ['adaptive-d2b4-reciprocal-fractional-inputs', 2, 4, 'interpretation', 'rational', 'p1,p2,phalf,pmhalf,pmn1,pmn2,pmquarter,pquarter', RECIP_ANALYSIS],
    ],
  },
  'mm_A2_2A_v2_root-family-graph': {
    ...GRAPH, familyId: 'mathmaster:A2.2A:v2-root-family-graph', taskType: 'representationTranslation', difficultyBand: 2, dok: 2,
    rows: [
      [undefined, 2, 2, 'representationTranslation', 'squareRoot', 'p0,p1,p4,p9', [
        A('domain', 'Domain', 'domain', ['[0,∞)']), A('range', 'Range', 'range', ['[0,∞)']),
      ]],
      [undefined, 2, 2, 'representationTranslation', 'cubeRoot', 'p0,p1,p8,pm1,pm8', [
        A('domain', 'Domain', 'domain', ['(-∞,∞)', 'all real numbers']), A('range', 'Range', 'range', ['(-∞,∞)', 'all real numbers']),
      ]],
    ],
  },
  'mm_A2_2A_v2_symmetry-family-graph': {
    ...GRAPH, familyId: 'mathmaster:A2.2A:v2-symmetry-family-graph', taskType: 'interpretation', difficultyBand: 3, dok: 2,
    rows: [
      [undefined, 2, 3, 'interpretation', 'absolute', 'p0,p1,p2,pm1,pm2', [
        A('range', 'Range', 'range', ['[0,∞)']),
        A('symmetry', 'Line of symmetry', 'value', ['x=0', 'y-axis', 'y axis']),
      ]],
      [undefined, 2, 3, 'interpretation', 'cubic', 'p0,p1,p2,pm1,pm2', [
        A('range', 'Range', 'range', ['(-∞,∞)', 'all real numbers']),
        A('symmetry', 'Center of rotational symmetry', 'value', ['(0,0)'], { acceptedAnswers: ['(0,0)', '0,0', 'origin'] }),
      ]],
    ],
  },
  'mm_A2_2C_v2_exponential-log-features': {
    familyId: 'mathmaster:A2.2C:v2-exponential-log-features', alignmentKeys: ['texas:A2.2C'], assessedConstruct: 'A2.2C',
    representation: 'multipleRepresentation', taskType: 'comparison', difficultyBand: 4, dok: 3, type: undefined,
    rows: [
      ['core-d3b4', 3, 4, 'comparison', undefined, '', [
        ['reflection', 'choice', 'yx', 'yx,xaxis,yaxis'], ['f-intercept', 'orderedPair', '(0,1)', ''],
        ['g-intercept', 'orderedPair', '(1,0)', ''], ['asymptotes', 'choice', 'swap', 'swap,same-horizontal,none'],
      ]],
      ['adaptive-d3b3-asymptote-reflection-claim', 3, 3, 'errorAnalysis', undefined, '', [
        ['reflection', 'choice', 'yx', 'yx,xaxis'], ['f-intercept', 'orderedPair', '(0,1)', ''],
        ['g-intercept', 'orderedPair', '(1,0)', ''], ['judgment', 'choice', 'false', 'false,true'],
      ]],
    ],
  },
};
const IDS = Object.keys(PINNED);
const RECAP_FLOOR = 8;
// Actual counts at widening time: 14, 24, 10, 14, 12, 16 (before: 2, 4, 2, 2, 2, 6).
const MIN_DISTINCT = {
  'mm_A2_2A_v2_exponential-graph-attributes': 12,
  'mm_A2_2A_v2_logarithmic-graph-attributes': 12,
  'mm_A2_2A_v2_reciprocal-graph-attributes': 10,
  'mm_A2_2A_v2_root-family-graph': 12,
  'mm_A2_2A_v2_symmetry-family-graph': 12,
  'mm_A2_2C_v2_exponential-log-features': 12,
};
const ORACLE_DRAWS = 120;

const effectiveRows = (doc) => (Array.isArray(doc.variants) && doc.variants.length ? doc.variants : [null])
  .map((variant) => ({ variant, merged: { ...doc, ...variant } }));

const pickAnalysis = (part) => Object.fromEntries(
  ['id', 'label', 'kind', 'notation', 'responseMode', 'expected', 'acceptedAnswers']
    .filter((key) => part[key] !== undefined)
    .map((key) => [key, part[key]]),
);

test('the fields the widening must not change keep their committed values', () => {
  for (const id of IDS) {
    const doc = template(id);
    const pin = PINNED[id];
    assert.equal(doc.id, id);
    for (const [key, value] of Object.entries({ ...COMMON, ...pin })) {
      if (key === 'rows') continue;
      assert.deepEqual(doc[key], value, `${id}.${key}`);
    }
    const rows = effectiveRows(doc);
    assert.equal(rows.length, pin.rows.length, `${id} variant count`);
    rows.forEach(({ variant, merged }, index) => {
      const [coverageKey, dok, band, taskType, fnType, points, parts] = pin.rows[index];
      const label = `${id} variant ${index}`;
      assert.equal(variant?.coverageKey, coverageKey, `${label} coverageKey`);
      assert.equal(merged.dok, dok, `${label} dok`);
      assert.equal(merged.difficultyBand, band, `${label} difficultyBand`);
      assert.equal(merged.taskType, taskType, `${label} taskType`);
      assert.equal(merged.representation, pin.representation, `${label} representation`);
      assert.equal(merged.functionSpec?.type, fnType, `${label} parent function`);
      assert.equal((merged.pointTasks || []).map((task) => task.id).sort().join(','), points, `${label} point task ids`);
      if (fnType) {
        assert.deepEqual(merged.analysisRequests.map(pickAnalysis), parts, `${label} analysis requests`);
        // A point label still only says which input to plot.
        for (const task of merged.pointTasks) {
          assert.match(task.label, /^(Plot x = \S+|Plot the (y-intercept|x-intercept|endpoint|vertex))$/, `${label} ${task.id} label`);
        }
      } else {
        assert.deepEqual(
          merged.responseFields.map((field) => [field.id, field.inputProfile, field.expected, (field.choices || []).map((choice) => choice.id).join(',')]),
          parts,
          `${label} response fields`,
        );
      }
    });
  }
});

test('each widened template draws at least its recorded number of distinct questions (never below 8) in the 30 recap probe draws', () => {
  const counts = {};
  for (const id of IDS) {
    const seen = new Set();
    for (let draw = 0; draw < 30; draw += 1) {
      const generated = generatePathInstance(template(id), `recap-probe-${draw}`);
      assert.ok(generated.question, `${id} probe ${draw}: ${generated.reason}`);
      seen.add(contentKey(generated.question));
    }
    counts[id] = seen.size;
  }
  for (const id of IDS) {
    assert.ok(MIN_DISTINCT[id] >= RECAP_FLOOR);
    assert.ok(counts[id] >= MIN_DISTINCT[id], `${id} drew ${counts[id]} distinct questions in 30 (need >= ${MIN_DISTINCT[id]}; hard floor ${RECAP_FLOOR})`);
  }
});

// --- the independent oracle -----------------------------------------------------

// The function the STUDENT sees, read from the prompt, evaluated with mathjs.
const visibleFunction = (question) => {
  const { prompt } = question;
  let match = /f\(x\)=(\d+)\^x/.exec(prompt);
  if (match) return { family: 'exponential', base: Number(match[1]), f: (x) => math.number(math.pow(math.fraction(Number(match[1])), x)) };
  match = /f\(x\)=\\left\(\\frac\{1\}\{(\d+)\}\\right\)\^x/.exec(prompt);
  if (match) {
    const base = math.fraction(1, Number(match[1]));
    return { family: 'exponential', base: math.number(base), f: (x) => math.number(math.pow(base, x)) };
  }
  match = /\\log_(?:(\d)|\{(\d+)\})\(x\)/.exec(prompt);
  if (match) {
    const base = Number(match[1] ?? match[2]);
    return { family: 'logarithmic', base, f: (x) => math.log(x, base) };
  }
  if (/\\ln\(x\)/.test(prompt)) return { family: 'logarithmic', base: math.e, f: (x) => math.log(x) };
  if (/\\sqrt\[3\]\{x\}/.test(prompt)) return { family: 'cubeRoot', f: (x) => math.cbrt(x) };
  if (/\\sqrt\{x\}/.test(prompt)) return { family: 'squareRoot', f: (x) => math.sqrt(x) };
  if (/f\(x\)=\|x\|/.test(prompt)) return { family: 'absolute', f: (x) => math.abs(x) };
  if (/f\(x\)=x\^3/.test(prompt)) return { family: 'cubic', f: (x) => math.pow(x, 3) };
  if (/f\(x\)=(\\frac1x|1\/x)/.test(prompt)) return { family: 'rational', f: (x) => math.divide(1, x) };
  return null;
};

// The x a point label asks for, read from the label text alone.
const labelX = (label, fn) => {
  if (/the (y-intercept|endpoint|vertex)$/.test(label)) return 0;
  if (label.endsWith('the x-intercept')) return math.pow(fn.base, 0); // log_b(x) = 0  <=>  x = b^0
  const text = /^Plot x = (\S+)$/.exec(label)?.[1];
  if (text === 'e') return math.e;
  if (text === '1/e') return 1 / math.e;
  const fraction = /^(-?\d+)\/(\d+)$/.exec(text || '');
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text);
};

const INTERVALS = {
  exponential: { domain: '(-∞,∞)', range: '(0,∞)' },
  logarithmic: { domain: '(0,∞)', range: '(-∞,∞)' },
  rational: { domain: '(-∞,0)∪(0,∞)', range: '(-∞,0)∪(0,∞)' },
  squareRoot: { domain: '[0,∞)', range: '[0,∞)' },
  cubeRoot: { domain: '(-∞,∞)', range: '(-∞,∞)' },
  absolute: { range: '[0,∞)' },
  cubic: { range: '(-∞,∞)' },
};

// Every analysis answer, from the visible function.
const oracleAnalysis = (fn) => {
  const answers = { ...INTERVALS[fn.family] };
  if (fn.family === 'exponential') {
    answers.yint = String(fn.f(0)); // b^0
    answers.hasym = String(Math.round(fn.f(fn.base > 1 ? -60 : 60))); // b^x -> 0 on its decaying side
  }
  if (fn.family === 'logarithmic') {
    answers.xint = String(math.pow(fn.base, 0));
    assert.equal(fn.f(Number(answers.xint)), 0);
    answers.vasym = '0'; // log_b(x) is defined exactly for x > 0
  }
  if (fn.family === 'rational') {
    answers.vasym = '0'; // 1/x is undefined exactly at x = 0
    answers.hasym = String(Math.round(math.divide(1, 1e12))); // 1/x -> 0
  }
  if (fn.family === 'absolute') {
    assert.equal(fn.f(-3.7), fn.f(3.7)); // even: mirror line x = 0
    answers.symmetry = 'x=0';
  }
  if (fn.family === 'cubic') {
    assert.equal(fn.f(-3.7), -fn.f(3.7)); // odd: half-turn about the origin
    answers.symmetry = '(0,0)';
  }
  return answers;
};

const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
const inWindow = (graph, x, y) => x >= graph.xMin && x <= graph.xMax && y >= graph.yMin && y <= graph.yMax;
const POINT_TOLERANCE = 0.28;

// The workspace snaps a tap to min(grid step, snapStep) on each axis
// (src/InteractiveGraphWorkspace.jsx), so a key the student must place has to
// be a multiple of that step.
const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;
// Committed off-grid keys: 3^-1 = 1/3 (and its mirror (1/3)^1), and ln's 1/e, e.
const offGridAllowed = (fn, y) => (fn.family === 'exponential' && near(y, 1 / 3))
  || (fn.family === 'logarithmic' && near(fn.base, Math.E));

// The ways a hint could write a number: 0.25, 1/4, \frac{1}{4}, \frac14.
const numberForms = (value) => {
  const forms = new Set([String(value)]);
  for (let den = 2; den <= 10; den += 1) {
    const num = value * den;
    if (Math.abs(num - Math.round(num)) < 1e-9 && Math.round(num) % den !== 0) {
      const n = Math.round(num);
      const sign = n < 0 ? '-' : '';
      const a = Math.abs(n);
      forms.add(`${n}/${den}`);
      forms.add(`${sign}\\frac{${a}}{${den}}`);
      if (a < 10) forms.add(`${sign}\\frac${a}${den}`);
      break;
    }
  }
  return [...forms];
};
// A whole number token: "-1" does not match inside "-1/4", nor "4" inside "1/4".
const mentions = (text, form) => new RegExp(`(^|[^\\d.\\-/])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d.]*\\d|/)`).test(text);
const statesValue = (text, value) => new RegExp(`(=|\\bis)\\s*\\$?${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d.]*\\d)`).test(text);

// Released after a miss while the item is open: never a point, an answer or a feature.
const assertSupportRevealsNothing = (question, label) => {
  const texts = [...(question.supportHints || []), ...(question.attemptFeedback || [])].map((entry) => String(entry).toLowerCase());
  assert.ok(texts.length > 0, `${label}: has support text`);
  for (const text of texts) {
    for (const task of question.pointTasks || []) {
      const [x, y] = task.expected.map(Number);
      const statesPoint = numberForms(x).some((form) => mentions(text, form)) && numberForms(y).some((form) => mentions(text, form));
      assert.ok(!statesPoint, `${label}: support text states the point ${task.id} (${x},${y}): "${text}"`);
    }
    for (const part of question.analysisRequests || []) {
      for (const value of [...part.expected, ...(part.acceptedAnswers || [])].map(String)) {
        const numeric = /^-?\d+(\.\d+)?$/.test(value);
        const leaks = numeric ? statesValue(text, value) : hintRevealsAnswer(text, [value]);
        assert.ok(!leaks, `${label}: support text gives ${part.id} = ${value}: "${text}"`);
      }
    }
  }
};

const checkGraphDraw = async (id, question, label) => {
  const fn = visibleFunction(question);
  assert.ok(fn, `${label}: the prompt shows a parent function`);
  assert.equal(question.functionSpec.type, fn.family, `${label}: workspace graphs the function the prompt shows`);
  assert.deepEqual([question.functionSpec.a, question.functionSpec.h, question.functionSpec.k], [1, 0, 0], `${label}: parent, untransformed`);
  if (fn.base !== undefined) assert.ok(near(question.functionSpec.base, fn.base), `${label}: base ${question.functionSpec.base} vs shown ${fn.base}`);

  const { graph } = question;
  for (const key of ['xMin', 'xMax', 'yMin', 'yMax', 'xStep', 'yStep', 'snapStep']) {
    assert.equal(typeof graph[key], 'number', `${label}: graph.${key} is a number`);
  }

  const oracle = {};
  for (const task of question.pointTasks) {
    const x = labelX(task.label, fn);
    const y = fn.f(x);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `${label} ${task.id}: f(${x}) is real`);
    assert.ok(near(task.x, x), `${label} ${task.id}: task x ${task.x} vs label ${x}`);
    assert.ok(near(task.expected[0], x) && near(task.expected[1], y), `${label} ${task.id}: key ${task.expected} vs oracle (${x},${y})`);
    assert.ok(inWindow(graph, x, y), `${label} ${task.id}: (${x},${y}) outside the window`);
    oracle[task.id] = [x, y];
    const xSnap = Math.min(graph.xStep, graph.snapStep);
    const ySnap = Math.min(graph.yStep, graph.snapStep);
    assert.ok(onGrid(x, xSnap) || offGridAllowed(fn, y), `${label} ${task.id}: x=${x} is not placeable on the ${xSnap} grid`);
    assert.ok(onGrid(y, ySnap) || offGridAllowed(fn, y), `${label} ${task.id}: y=${y} is not placeable on the ${ySnap} grid`);
    // A plotted point is never within the grading tolerance of an asymptote it
    // must not touch (the two authored base-10 / quarter-input points excepted).
    if (fn.family === 'exponential') assert.ok(y > POINT_TOLERANCE + 0.05, `${label} ${task.id}: y=${y} too close to y=0`);
    if (fn.family === 'rational') assert.ok(Math.abs(y) > POINT_TOLERANCE + 0.05, `${label} ${task.id}: y=${y} too close to y=0`);
    if (fn.family === 'logarithmic' && fn.base !== 10) assert.ok(x > POINT_TOLERANCE + 0.05, `${label} ${task.id}: x=${x} too close to x=0`);
    // The prompt names every non-zero input it asks for (that is what varies;
    // the fixed eight-point 1/x item names its points in the labels only).
    const fixedPoints = (fn.family === 'logarithmic' && (fn.base !== 2 || task.id === 'pinv')) || /EIGHT requested points/.test(question.prompt);
    if (x !== 0 && task.label.startsWith('Plot x = ') && !fixedPoints) {
      const shown = [`x=${x}$`, `$${x}$`, `\\pm${Math.abs(x)}$`];
      assert.ok(shown.some((text) => question.prompt.includes(text)), `${label}: prompt names x=${x}`);
    }
  }
  if (fn.family === 'logarithmic' && fn.base === 2) assert.match(question.prompt, /x=\\frac12/, `${label}: prompt names x=1/2`);
  // No key is within the grading tolerance of another plotted output, so
  // copying a neighbour's output onto this input is never accepted.
  for (const [idA, [xa, ya]] of Object.entries(oracle)) {
    for (const [idB, [, yb]] of Object.entries(oracle)) {
      if (idA === idB || near(ya, yb)) continue;
      assert.ok(Math.abs(ya - yb) > POINT_TOLERANCE, `${label}: placing ${idB}'s output ${yb} at x=${xa} would be graded correct for ${idA} (key ${ya})`);
    }
  }
  // The window ends derived per draw sit on a tick (the small committed
  // margins such as yMin = -2 below an exponential are left as authored).
  for (const [key, step] of [['xMin', 'xStep'], ['xMax', 'xStep'], ['yMin', 'yStep'], ['yMax', 'yStep']]) {
    if (key.endsWith('Max') || Math.abs(graph[key]) > 4) {
      assert.ok(onGrid(graph[key], graph[step]), `${label}: ${key} ${graph[key]} is not on its ${graph[step]} ticks`);
    }
  }
  assertSupportRevealsNothing(question, label);

  // Features the student reads or states lie in the window.
  if (['exponential', 'rational'].includes(fn.family)) assert.ok(graph.yMin < 0 && graph.yMax > 0, `${label}: y=0 asymptote visible`);
  if (['logarithmic', 'rational', 'squareRoot'].includes(fn.family)) assert.ok(graph.xMin < 0 && graph.xMax > 0, `${label}: x=0 visible`);
  if (fn.family === 'exponential') assert.ok(inWindow(graph, 0, fn.f(0)), `${label}: y-intercept visible`);
  if (fn.family === 'logarithmic') assert.ok(inWindow(graph, 1, 0), `${label}: x-intercept visible`);
  if (['squareRoot', 'cubeRoot', 'absolute', 'cubic'].includes(fn.family)) assert.ok(inWindow(graph, 0, 0), `${label}: origin visible`);

  const answers = oracleAnalysis(fn);
  for (const part of question.analysisRequests) {
    assert.ok(answers[part.id] !== undefined, `${label}: oracle covers ${part.id}`);
    assert.equal(part.expected[0], answers[part.id], `${label} ${part.id}: key ${part.expected[0]} vs oracle ${answers[part.id]}`);
  }
  assert.doesNotMatch(JSON.stringify(question), /\{\{|:null\b|"undefined"|\bNaN\b|"-?Infinity"/, `${label}: fully substituted`);

  // The production issuer and grader.
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `${label}: ${plan.reason}`);
  assert.doesNotMatch(JSON.stringify(plan.toolPayload), /"expected"|"acceptedAnswers"|solutionReview/, `${label}: public payload carries no key`);
  const raw = {
    placements: oracle,
    answers: Object.fromEntries(question.analysisRequests.map((part) => [part.id, answers[part.id]])),
  };
  const right = await mathPath.gradePathToolResponse(plan.privateGrading, { raw });
  assert.equal(right.isCorrect, true, `${label}: oracle work graded correct ${JSON.stringify(right.parts)}`);
  const [firstId, [fx, fy]] = Object.entries(oracle).find(([, [x]]) => x !== 0);
  const wrong = await mathPath.gradePathToolResponse(plan.privateGrading, { raw: { ...raw, placements: { ...oracle, [firstId]: [fx, fy + 1] } } });
  assert.equal(wrong.isCorrect, false, `${label}: a point off by one is graded wrong`);
  return fn;
};

const checkInverseDraw = async (question, label) => {
  const shown = /f\(x\)=(\d+)\^x/.exec(question.prompt);
  assert.ok(shown, `${label}: prompt shows f(x)=b^x`);
  const b = Number(shown[1]);
  assert.ok(b >= 2, `${label}: base > 1`);
  // Multi-digit bases must be braced, or \log_10 renders as log base 1 of 0x.
  assert.ok(question.prompt.includes(`\\log_{${b}}x`), `${label}: prompt shows g(x)=log_{${b}} x`);
  assert.deepEqual(question.stimulus.expressions, [`$f(x)=${b}^x$`, `$g(x)=\\log_{${b}}x$`, '$f(0)=1$'], `${label}: stimulus`);

  // g undoes f, so the graphs are mirror images across y = x.
  for (const x of [-2, -0.5, 0, 1, 3]) assert.ok(near(math.log(math.pow(b, x), b), x), `${label}: g(f(${x})) = ${x}`);
  const fIntercept = `(0,${math.pow(b, 0)})`;
  const gIntercept = `(${math.pow(b, 0)},${math.log(1, b)})`;
  const oracle = {
    reflection: 'yx',
    'f-intercept': fIntercept,
    'g-intercept': gIntercept,
    asymptotes: 'swap', // y=0 (horizontal) reflects to x=0 (vertical)
    judgment: 'false', // "y=0 stays horizontal" is false for the same reason
  };
  for (const field of question.responseFields) {
    assert.equal(field.expected, oracle[field.id], `${label} ${field.id}: key ${field.expected} vs oracle ${oracle[field.id]}`);
  }
  assert.doesNotMatch(JSON.stringify(question), /\{\{|:null\b|"undefined"|\bNaN\b|"-?Infinity"/, `${label}: fully substituted`);

  // Feedback and hints arrive after a miss while the item is open: they never
  // name the reflection line, an intercept, or the text of a correct option.
  const support = [...(question.supportHints || []), ...(question.attemptFeedback || [])];
  assert.ok(support.length > 0, `${label}: has support text`);
  const correctLabels = question.responseFields
    .filter((field) => field.inputProfile === 'choice')
    .map((field) => field.choices.find((choice) => choice.id === field.expected).label);
  for (const text of support) {
    const bare = String(text).replace(/[$\s]/g, '').toLowerCase();
    for (const answer of ['y=x', fIntercept, gIntercept]) {
      assert.ok(!bare.includes(answer), `${label}: support text gives ${answer}: "${text}"`);
    }
    assert.equal(hintRevealsAnswer(text, correctLabels), false, `${label}: support text quotes a correct option: "${text}"`);
  }

  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `${label}: ${plan.reason}`);
  // A choice is answered with the runtime id the student's browser receives
  // for that option, found by its label in the sanitized question.
  const publicQuestion = mathPath.buildSanitizedQuestion(question, { questionInstanceId: `qa-${label}`, attemptsAllowed: 3 });
  assert.doesNotMatch(JSON.stringify(publicQuestion), /"expected"|"acceptedAnswers"/, `${label}: public question carries no key`);
  const answerFor = (field, value) => {
    if (field.inputProfile !== 'choice') return value;
    const authored = field.choices.find((choice) => choice.id === value);
    const shown = publicQuestion.responseFields.find((entry) => entry.id === field.id).choices.find((choice) => choice.label === authored.label);
    assert.ok(shown, `${label} ${field.id}: option ${value} is shown`);
    return shown.id;
  };
  const responses = Object.fromEntries(question.responseFields.map((field) => [field.id, answerFor(field, oracle[field.id])]));
  const right = await mathPath.gradePathToolResponse(plan.privateGrading, { responses });
  assert.equal(right.isCorrect, true, `${label}: oracle answers graded correct ${JSON.stringify(right.parts)}`);
  const swapped = await mathPath.gradePathToolResponse(plan.privateGrading, {
    responses: { ...responses, 'f-intercept': gIntercept, 'g-intercept': fIntercept },
  });
  assert.equal(swapped.isCorrect, false, `${label}: swapped intercepts graded wrong`);
};

test('every draw is issuable, its answers are right by an independent oracle, and it fits the graph', async () => {
  for (const id of IDS) {
    const families = new Set();
    for (let draw = 0; draw < ORACLE_DRAWS; draw += 1) {
      const label = `${id} draw ${draw}`;
      const generated = generatePathInstance(template(id), `widening-oracle-${draw}`);
      assert.ok(generated.question, `${label}: ${generated.reason}`);
      if (id.startsWith('mm_A2_2C')) {
        // eslint-disable-next-line no-await-in-loop
        await checkInverseDraw(generated.question, label);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const fn = await checkGraphDraw(id, generated.question, label);
        families.add(`${fn.family}:${fn.base ?? ''}`);
      }
    }
    if (id.includes('exponential-graph')) assert.equal(families.size, 4, 'growth 2, 3 and decay 1/2, 1/3 all appear');
    if (id.includes('logarithmic-graph')) assert.equal(families.size, 3, 'bases 2, 10 and e all appear (TEKS A2.2A)');
  }
});

test('the production certification passes on every edited template', async () => {
  for (const id of IDS) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildTemplateIssuePlan(template(id), { samples: 24 });
    assert.deepEqual(plan, { issuable: true, reason: null, samples: 24 }, id);
  }
});
