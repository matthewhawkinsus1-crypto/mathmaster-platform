/*
 * THE linesAndSlope SUPPORT FAMILY, ON REAL ITEMS.
 *
 * src/platform/supports/families/linesAndSlope.js gives the platform Hint
 * control, "Try a similar one" and the inclusion "Let's back up" step their
 * content for lines, slope, intercepts and linear representations. Every item
 * here is one a student can actually be given:
 *
 *   - platform Question Family instances, built by resolveFamilyQuestionInstance
 *     exactly as delivery builds them: linear.slopeFromPoints (integer,
 *     fraction and "any" slopes), functions.identifyIntercepts, and the
 *     Multiple Representations board linear.multipleRepresentations for every
 *     GIVEN kind (standard form, slope-intercept, point-slope, two points,
 *     table, story), plus the authored slots of SAMPLE_QUESTION_FAMILY_RECOVERY;
 *   - Graphing Lines (`graphing`): the type catalog's own example and the
 *     legacy lineGraph generator (problemGenerator.generateQuestion);
 *   - graphing2 in every mode: SAMPLE_BATCH_D_DEEP_DIVE, SAMPLE_MISSING_MATH_TOOLS,
 *     the Algebra I Path bank's graphing2 templates (generatePathInstanceWithRetries)
 *     and a V5 factored-linear item;
 *   - linearTableWorkbench (all three modes), representationBridge (linear) and
 *     the Step Algebra intercept orchestrator (mode linearIntercepts), compiled
 *     by compileAuthoringIntentV5 — the way an authored document reaches a
 *     classroom — plus the stored legacy intercept item of the capability
 *     manifest.
 *
 * Every answer the tests compare against is computed INDEPENDENTLY of the
 * family: from the family instance's own generated values, or with mathjs in
 * exact fraction arithmetic from what the question shows (its points, its
 * rows, its authored line fields). The worked siblings are re-solved the same
 * way from their own prompts.
 *
 * Mutation-checked (each went red, then was restored):
 *   - choose() returned the numbered spelling unconditionally (guard bypassed)
 *     → "Label (2, -4) as (x₁, y₁) …" on a slope-2 item leaks, and the leak
 *     test fails;
 *   - the slope ladder's closing hint was made to state the slope (both
 *     spellings) → the family's guard drops it and "every ladder ends with its
 *     closing check" fails;
 *   - a graphing2 hint was made to name the y-intercept point AND the
 *     family's graphing2 expectedValues were blinded → only this file's
 *     independent answers can see it: the expectedValues and leak tests fail;
 *   - the slope sibling's stated answer was negated → the independent re-solve
 *     of the sibling fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as linesAndSlope from '../../src/platform/supports/families/linesAndSlope.js';
import * as linearEquations from '../../src/platform/supports/families/linearEquations.js';
import * as systems from '../../src/platform/supports/families/systems.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => (value && typeof value === 'object' && 'n' in value && 'd' in value && typeof value.n === 'bigint' ? value : math.fraction(value));
const eq = (a, b) => math.equal(F(a), F(b));
const negative = (value) => Number(F(value).s) < 0;
const fracText = (value) => {
  const f = F(value);
  const sign = negative(f) && f.n !== 0n ? '-' : '';
  return f.d === 1n ? `${sign}${f.n}` : `${sign}${f.n}/${f.d}`;
};
const terminating = (value) => {
  let d = F(value).d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
};
const coordinateTexts = (value) => [...new Set([fracText(value), terminating(value) ? String(math.number(F(value))) : fracText(value)])];
const withUnicode = (texts) => [...new Set(texts.flatMap((entry) => (entry.includes('-') ? [entry, entry.replace(/-/g, '−')] : [entry])))];
const numberTexts = (value) => {
  const f = F(value);
  const texts = coordinateTexts(f);
  if (f.d !== 1n) texts.push(`${negative(f) ? '-' : ''}\\frac{${f.n}}{${f.d}}`);
  return withUnicode(texts);
};
const pairTexts = ([x, y]) => withUnicode(coordinateTexts(x).flatMap((a) => coordinateTexts(y).flatMap((b) => [`(${a}, ${b})`, `(${a},${b})`])));
const pairText = ([x, y]) => `(${fracText(x)}, ${fracText(y)})`;
const samePoint = (a, b) => eq(a[0], b[0]) && eq(a[1], b[1]);

/** Any linear equation in x and y, read by mathjs: a vertical line, or { m, b }. */
const lineFromEquation = (equation) => {
  const [left, right] = String(equation).replace(/−/g, '-').split('=');
  const g = (x, y) => math.subtract(F(math.evaluate(left, { x: F(x), y: F(y) })), F(math.evaluate(right, { x: F(x), y: F(y) })));
  const c0 = g(0, 0);
  const A = math.subtract(g(1, 0), c0);
  const B = math.subtract(g(0, 1), c0);
  if (math.equal(B, 0)) return { vertical: true, x: math.divide(math.unaryMinus(c0), A) };
  return { m: math.divide(math.unaryMinus(A), B), b: math.divide(math.unaryMinus(c0), B) };
};
const through = ([x1, y1], [x2, y2]) => {
  const m = math.divide(math.subtract(F(y2), F(y1)), math.subtract(F(x2), F(x1)));
  return { m, b: math.subtract(F(y1), math.multiply(m, F(x1))) };
};
const onLine = (line, [x, y]) => (line.vertical ? eq(x, line.x) : eq(y, math.add(math.multiply(line.m, F(x)), line.b)));
const sameLine = (a, b) => (a.vertical || b.vertical ? Boolean(a.vertical && b.vertical && eq(a.x, b.x)) : eq(a.m, b.m) && eq(a.b, b.b));
const xIntercept = (line) => (line.vertical ? [line.x, F(0)] : math.equal(line.m, 0) ? null : [math.divide(math.unaryMinus(line.b), line.m), F(0)]);
const pointsOf = (value) => [...String(value).replace(/−/g, '-').matchAll(/\(\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*\)/g)].map((match) => [F(match[1]), F(match[2])]);
const collinearLine = (rows) => {
  const line = through(rows[0], rows[1]);
  return rows.every((row) => onLine(line, row)) ? line : null;
};

/** Every grid point of a line in a ±12 window, as a student would write it. */
const latticePairs = (line, exclude = []) => {
  const out = [];
  for (let k = -12; k <= 12; k += 1) {
    const point = line.vertical ? [line.x, F(k)] : [F(k), math.add(math.multiply(line.m, F(k)), line.b)];
    if (F(point[1]).d !== 1n || F(point[0]).d !== 1n) continue;
    if (exclude.some((given) => samePoint(given, point))) continue;
    out.push(...pairTexts(point));
  }
  return out;
};

/* ------------------------------------------------------------ the real items */

const instance = (slot, seat, storageIndex = 0) => {
  const resolved = resolveFamilyQuestionInstance({
    question: slot,
    assignmentId: 'a-lines-and-slope-support',
    storageIndex,
    allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'seated' },
  });
  assert.equal(resolved.error, null, `${slot.questionFamily.id} resolves`);
  return resolved;
};
const SEATS = [0, 1, 2, 5, 9, 13];

const v5 = (questions) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Lines and slope', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  sections: [{ role: 'classwork', questions }],
}).package.sections[0].questions;

const ITEMS = [];
const add = (label, kind, question, truth) => ITEMS.push({ label, kind, question, truth });

// linear.slopeFromPoints — truth: the instance's own rise / run.
for (const slopeForm of ['integer', 'fraction', 'any']) {
  const slot = { questionId: `slope-${slopeForm}`, type: 'multiAnswer', questionFamily: { id: 'linear.slopeFromPoints', version: 1, tool: 'multiAnswer', constraints: { slopeForm } } };
  SEATS.forEach((seat) => {
    const { question, instance: { values } } = instance(slot, seat, 1);
    add(`slopeFromPoints ${slopeForm} #${seat}`, 'slope', question, { m: math.divide(F(values.rise), F(values.run)), points: [[F(values.x1), F(values.y1)], [F(values.x2), F(values.y2)]] });
  });
}
// functions.identifyIntercepts — truth: the instance's own intercepts p, q.
SEATS.forEach((seat) => {
  const slot = { questionId: 'intercepts', type: 'multiAnswer', questionFamily: { id: 'functions.identifyIntercepts', version: 1, tool: 'multiAnswer' } };
  const { question, instance: { values } } = instance(slot, seat, 2);
  add(`identifyIntercepts #${seat}`, 'intercepts', question, { xInt: [F(values.p), F(0)], yInt: [F(0), F(values.q)] });
});
// The recovery sample's authored family slots (authored prompts with {{tokens}}).
{
  const recovery = readJson('SAMPLE_QUESTION_FAMILY_RECOVERY.json');
  [0, 4, 8].forEach((seat) => {
    const intercepts = instance(recovery.sections[0].questions[0], seat, 0);
    add(`recovery intercepts #${seat}`, 'intercepts', intercepts.question, { xInt: [F(intercepts.instance.values.p), F(0)], yInt: [F(0), F(intercepts.instance.values.q)] });
    const slope = instance(recovery.sections[1].questions[1], seat, 1);
    const v = slope.instance.values;
    add(`recovery slope #${seat}`, 'slope', slope.question, { m: math.divide(F(v.rise), F(v.run)), points: [[F(v.x1), F(v.y1)], [F(v.x2), F(v.y2)]] });
  });
}
// linear.multipleRepresentations, every GIVEN — truth: the instance's n/d and b.
['standardForm', 'slopeIntercept', 'pointSlope', 'twoPoints', 'table', 'scenario'].forEach((given, index) => {
  ['integer', 'fraction'].forEach((slope) => {
    if (given === 'scenario' && slope === 'fraction') return;
    const slot = { questionId: `lmr-${given}-${slope}`, type: 'representationBridge', questionFamily: { id: 'linear.multipleRepresentations', version: 1, tool: 'representationBridge', constraints: { given, slope } } };
    [0, 3, 7].forEach((seat) => {
      const { question, instance: { values } } = instance(slot, seat, 10 + index);
      const m = math.divide(F(values.n), F(values.d));
      add(`multipleRepresentations ${given} ${slope} #${seat}`, 'multiRep', question, { m, b: F(values.b), zero: F(values.zero), given });
    });
  });
});

// Graphing Lines: the catalog example and the legacy generator.
const keyLine = (question) => {
  if (Number.isFinite(Number(question.m)) && Number.isFinite(Number(question.b))) return { m: F(Number(question.m)), b: F(Number(question.b)) };
  const line = question.graph.functions[0];
  return { m: F(line.m), b: F(line.b) };
};
{
  const catalog = QUESTION_TYPE_CATALOG.graphing.example;
  add('graphing catalog example', 'lineFeatures', catalog, keyLine(catalog));
  ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8'].forEach((key) => {
    const generated = generateQuestion({ type: 'graphing', prompt: 'Identify the slope and the y-intercept.', generator: { kind: 'lineGraph' } }, key);
    add(`graphing lineGraph ${key}`, 'lineFeatures', generated, keyLine(generated));
  });
  const graphOnly = generateQuestion({ type: 'graphing', prompt: 'Read the slope and y-intercept from the graph.', showEquation: false, generator: { kind: 'lineGraph' } }, 'graph-only');
  add('graphing lineGraph graph only', 'lineFeatures', graphOnly, keyLine(graphOnly));
}

// graphing2 — truth: the line computed here from the authored fields.
const graphing2Truth = (question) => {
  const mode = question.mode || 'slopeIntercept';
  if (mode === 'slopeIntercept') {
    const line = question.line || { m: 1.5, b: -2 }; // the tool's own default line
    return { mode, line: { m: F(Number(line.m)), b: F(Number(line.b)) }, printed: [F(Number(line.m)), F(Number(line.b))], given: [] };
  }
  if (mode === 'throughPoints') {
    const points = question.givenPoints.map(([x, y]) => [F(Number(x)), F(Number(y))]);
    return { mode, line: through(points[0], points[1]), printed: points.flat(), given: points };
  }
  if (mode === 'pointSlope') {
    const point = question.point.map((value) => F(Number(value)));
    const m = F(Number(question.slope));
    return { mode, line: { m, b: math.subtract(point[1], math.multiply(m, point[0])) }, printed: [...point, m], given: [point] };
  }
  if (mode === 'standardForm') {
    const [A, B, C] = ['A', 'B', 'C'].map((key) => F(Number(question.standard[key])));
    return { mode, line: { m: math.divide(math.unaryMinus(A), B), b: math.divide(C, B) }, printed: [A, B, C], given: [] };
  }
  if (mode === 'factoredLinear') {
    const a = F(Number(question.factored.a));
    const c = F(Number(question.factored.c));
    return { mode, line: { m: a, b: math.unaryMinus(math.multiply(a, c)) }, printed: [a, c], given: [] };
  }
  const value = F(Number(question.value));
  return { mode, line: question.orientation === 'vertical' ? { vertical: true, x: value } : { m: F(0), b: value }, printed: [value], given: [] };
};
{
  const batchD = readJson('SAMPLE_BATCH_D_DEEP_DIVE.json').questions.filter((question) => question.toolId === 'graphing2');
  assert.equal(batchD.length, 5, 'Batch D has one graphing2 item per mode it demonstrates');
  batchD.forEach((question) => add(`batch D graphing2 ${question.mode}`, 'graphLine', question, graphing2Truth(question)));
  const missing = readJson('SAMPLE_MISSING_MATH_TOOLS.json').questions.find((question) => question.toolId === 'graphing2');
  add('missing math tools graphing2', 'graphLine', missing, graphing2Truth(missing));
  const bank = readJson('seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json').documents.filter((document) => document.type === 'graphing2');
  assert.ok(bank.length >= 5, 'the Algebra I Path bank carries graphing2 templates');
  bank.forEach((document) => ['s1', 's2', 's3'].forEach((key) => {
    const { question } = generatePathInstanceWithRetries(document, key);
    add(`path ${document.id} ${key}`, 'graphLine', question, graphing2Truth(question));
  }));
  v5([
    { standard: 'A.3C', prompt: 'Graph the line.', studentActions: ['constructLine'], mode: 'factoredLinear', factored: { a: 2, c: 3 } },
    { standard: 'A.3C', prompt: 'Graph the line.', studentActions: ['constructLine'], mode: 'factoredLinear', factored: { a: -0.5, c: -4 } },
  ]).forEach((question) => add(`V5 graphing2 factored ${question.factored.a}`, 'graphLine', question, graphing2Truth(question)));
}

// linearTableWorkbench, representationBridge and linearIntercepts, compiled from V5.
const rowsOf = (rows) => rows.map((row) => [F(row.x), F(row.y)]);
const tableTruth = (question) => {
  const rows = rowsOf(question.rows);
  const line = collinearLine(rows);
  if (question.mode !== 'repairValue') return { rows, line };
  const broken = rows.findIndex((_, index) => collinearLine(rows.filter((__, other) => other !== index)));
  const fixed = collinearLine(rows.filter((_, index) => index !== broken));
  return { rows, line: fixed, broken, corrected: math.add(math.multiply(fixed.m, rows[broken][0]), fixed.b) };
};
const boothFee = {
  inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
  rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
  yInterceptMeaning: 'starting profit after paying the booth fee', zeroMeaning: 'number of items that must be sold to break even',
};
v5([
  { standard: 'A.3B', prompt: 'Is the rate of change constant?', studentActions: ['proveConstantRate'], mode: 'constantRate', rows: [{ x: 0, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 9 }], requiredComparisons: 2 },
  { standard: 'A.3B', prompt: 'Is the rate of change constant?', studentActions: ['proveConstantRate'], mode: 'constantRate', rows: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 9 }], requiredComparisons: 3 },
  { standard: 'A.3B', prompt: 'Is the rate of change constant?', studentActions: ['proveConstantRate'], mode: 'constantRate', rows: [{ x: -2, y: 7 }, { x: 1, y: 1 }, { x: 3, y: -3 }, { x: 6, y: -9 }] },
  { standard: 'A.3C', prompt: 'Write the equation of the line in the table.', studentActions: ['proveConstantRate'], mode: 'deriveEquation', rows: [{ x: -3, y: 16 }, { x: 1, y: 8 }, { x: 4, y: 2 }, { x: 9, y: -8 }], requiredComparisons: 2 },
  { standard: 'A.3C', prompt: 'Write the equation of the line in the table.', studentActions: ['proveConstantRate'], mode: 'deriveEquation', rows: [{ x: 0, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 3 }, { x: 6, y: 4 }], requiredComparisons: 2 },
  { standard: 'A.3C', prompt: 'Write the equation of the line in the table.', studentActions: ['proveConstantRate'], mode: 'deriveEquation', rows: [{ x: 1, y: 2.5 }, { x: 3, y: 1.5 }, { x: 5, y: 0.5 }, { x: 7, y: -0.5 }] },
  { standard: 'A.3B', prompt: 'Find and fix the row that breaks the pattern.', studentActions: ['proveConstantRate'], mode: 'repairValue', rows: [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 99 }, { x: 4, y: 2 }, { x: 6, y: -2 }], requiredComparisons: 2 },
  { standard: 'A.3B', prompt: 'Find and fix the row that breaks the pattern.', studentActions: ['proveConstantRate'], mode: 'repairValue', rows: [{ x: 0, y: 50 }, { x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 9 }, { x: 4, y: 11 }], requiredComparisons: 2 },
  { standard: 'A.3B', prompt: 'Find and fix the row that breaks the pattern.', studentActions: ['proveConstantRate'], mode: 'repairValue', rows: [{ x: 1, y: -4 }, { x: 3, y: 2 }, { x: 5, y: 8 }, { x: 7, y: 20 }] },
]).forEach((question, index) => {
  const kind = question.mode === 'deriveEquation' ? 'tableEquation' : question.mode === 'repairValue' ? 'tableRepair' : 'tableRate';
  add(`V5 linearTableWorkbench ${question.mode} ${index}`, kind, question, tableTruth(question));
});
v5([
  { standard: 'A.3C', prompt: 'Connect every representation of this linear relationship.', studentActions: ['connectLinearRepresentations'], source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] }, context: boothFee, requiredComparisons: 3 },
  { standard: 'A.3C', prompt: 'Connect every representation of this linear relationship.', studentActions: ['connectLinearRepresentations'], source: { kind: 'table', rows: [{ x: 1, y: 9 }, { x: 2, y: 6 }, { x: 4, y: 0 }, { x: 5, y: -3 }] }, context: boothFee },
  { standard: 'A.3C', prompt: 'Connect every representation of this linear relationship.', studentActions: ['connectLinearRepresentations'], source: { kind: 'table', rows: [{ x: -4, y: -1 }, { x: 0, y: 1 }, { x: 4, y: 3 }] }, requiredStages: ['rateEvidence', 'generalForm'] },
]).forEach((question, index) => {
  const rows = rowsOf(question.source.rows);
  const line = collinearLine(rows);
  add(`V5 representationBridge ${index}`, 'bridge', question, { rows, m: line.m, b: line.b, zero: xIntercept(line)[0] });
});
{
  const interceptItems = v5([
    { standard: 'A.3C', prompt: 'Find the x- and y-intercepts of 3x + 4y = 24.', studentActions: ['interactiveAlgebra'], mode: 'linearIntercepts', equation: '3x + 4y = 24' },
    { standard: 'A.3C', prompt: 'Find both intercepts of 2x - 5y = 10.', studentActions: ['stepAlgebra2'], mode: 'linearIntercepts', equation: '2x - 5y = 10' },
    { standard: 'A.3C', prompt: 'Find both intercepts of 6x + 4y = -12.', studentActions: ['stepAlgebra2'], mode: 'linearIntercepts', equation: '6x + 4y = -12' },
  ]);
  interceptItems.push({ type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 3, B: 4, C: 24 }, prompt: 'Find both intercepts of 3x + 4y = 24.' });
  interceptItems.forEach((question, index) => {
    const equation = typeof question.equation === 'string' ? question.equation : '3x + 4y = 24';
    const line = lineFromEquation(equation);
    add(`linearIntercepts ${index}`, 'intercepts', question, { xInt: xIntercept(line), yInt: [F(0), line.b] });
  });
}

/* ------------------------------------------------------------ independent answers */

const CLASSIFICATIONS = ['linear', 'nonlinear'];
/** [all texts the hints must avoid, the canonical texts expectedValues must list]. */
const independentAnswers = ({ kind, truth }) => {
  const texts = [];
  const primary = [];
  const number = (value) => { texts.push(...numberTexts(value)); primary.push(fracText(value)); };
  const pair = (point) => { texts.push(...pairTexts(point)); primary.push(pairText(point)); };
  if (kind === 'lineFeatures') {
    number(truth.m);
    number(truth.b);
    pair([F(0), truth.b]);
    texts.push(...latticePairs(truth));
  } else if (kind === 'graphLine') {
    const { line, printed, given } = truth;
    const hidden = (value) => !printed.some((entry) => eq(entry, value));
    const notGiven = (point) => !given.some((entry) => samePoint(entry, point));
    if (truth.mode !== 'verticalHorizontal') {
      if (!line.vertical) {
        if (hidden(line.m)) number(line.m);
        if (hidden(line.b)) number(line.b);
        if (notGiven([F(0), line.b])) pair([F(0), line.b]);
      }
      const zero = xIntercept(line);
      if (zero && notGiven(zero)) pair(zero);
    }
    // No hint may hand the student a point of the line to plot.
    texts.push(...latticePairs(line, given));
  } else if (kind === 'tableRate') {
    texts.push(...CLASSIFICATIONS);
    primary.push(...CLASSIFICATIONS);
    if (truth.line) number(truth.line.m);
  } else if (kind === 'tableEquation') {
    texts.push(...CLASSIFICATIONS);
    primary.push(...CLASSIFICATIONS);
    number(truth.line.m);
    number(truth.line.b);
  } else if (kind === 'tableRepair') {
    texts.push(...CLASSIFICATIONS);
    primary.push(...CLASSIFICATIONS);
    number(truth.corrected);
    pair([truth.rows[truth.broken][0], truth.corrected]);
  } else if (kind === 'bridge' || kind === 'multiRep') {
    number(truth.m);
    number(truth.b);
    number(truth.zero);
    pair([F(0), truth.b]);
    pair([truth.zero, F(0)]);
    if (kind === 'bridge') { texts.push('constant'); primary.push('constant'); }
  } else if (kind === 'slope') {
    number(truth.m);
  } else if (kind === 'intercepts') {
    pair(truth.xInt);
    pair(truth.yInt);
  }
  return { texts: [...new Set(texts)], primary: [...new Set(primary)] };
};

const CLOSING = Object.freeze({
  lineFeatures: /^Check:/,
  graphLine: /^Check:/,
  tableRate: /^If every rate you find is the same/,
  tableEquation: /^Write y = mx \+ b/,
  tableRepair: /^Check:/,
  bridge: /^Check:/,
  multiRep: /^Check:/,
  slope: /^Simplify the fraction/,
  intercepts: /^Write each intercept as an ordered pair/,
});

/* ------------------------------------------------------------ re-solving a sibling */

const answerNumbers = (answer, pattern) => {
  const match = pattern.exec(String(answer));
  assert.ok(match, `the sibling answer "${answer}" has the expected shape`);
  return match.slice(1).map((value) => F(value));
};

/** Re-solves a worked sibling from its own prompt; returns what makes it a different problem. */
const verifySibling = (item, example) => {
  const { kind, truth } = item;
  const { prompt, answer, steps } = example;
  assert.ok(steps.length >= 2, 'a sibling is worked step by step');
  if (kind === 'lineFeatures') {
    let line;
    const equation = /of the line (y = .+)\.$/.exec(prompt);
    if (equation) {
      line = lineFromEquation(equation[1]);
    } else {
      const graph = /y-axis at y = (-?\d+(?:\/\d+)?) and also passes through the grid point \((-?\d+), (-?\d+(?:\/\d+)?)\)/.exec(prompt);
      assert.ok(graph, `the graph sibling names its intercept and a grid point: ${prompt}`);
      line = through([F(0), F(graph[1])], [F(graph[2]), F(graph[3])]);
    }
    const [m, b] = answerNumbers(answer, /^m = (-?\d+(?:\/\d+)?), b = (-?\d+(?:\/\d+)?)$/);
    assert.ok(eq(m, line.m) && eq(b, line.b), `sibling ${prompt}: m and b are right`);
    assert.ok(!eq(m, truth.m) || !eq(b, truth.b), 'the sibling is a different line');
    return;
  }
  if (kind === 'graphLine') {
    let line;
    let anchor = null;
    const passes = /^Graph the line that passes through (.+) and (.+)\.$/.exec(prompt);
    const pointSlope = /^Graph the line through (\(.+\)) with slope (-?\d+(?:\/\d+)?)\.$/.exec(prompt);
    if (passes) {
      line = through(pointsOf(passes[1])[0], pointsOf(passes[2])[0]);
    } else if (pointSlope) {
      const [point] = pointsOf(pointSlope[1]);
      line = { m: F(pointSlope[2]), b: math.subtract(point[1], math.multiply(F(pointSlope[2]), point[0])) };
      anchor = point;
    } else {
      const equation = /^Graph (.+)\.$/.exec(prompt);
      assert.ok(equation, `graph sibling prompt: ${prompt}`);
      line = lineFromEquation(equation[1]);
      if (truth.mode === 'slopeIntercept') anchor = [F(0), line.b];
      if (truth.mode === 'factoredLinear') anchor = xIntercept(line);
    }
    const points = pointsOf(answer);
    assert.ok(points.length >= 2, `the answer names the points to plot: ${answer}`);
    assert.ok(!samePoint(points[0], points[1]), 'two different points fix the line');
    points.forEach((point) => assert.ok(onLine(line, point), `${pairText(point)} is on the sibling line of "${prompt}"`));
    if (anchor) assert.ok(samePoint(points[0], anchor), `the sibling plots the anchor ${pairText(anchor)} first`);
    if (truth.mode === 'standardForm') {
      assert.ok(points.some((point) => eq(point[0], 0)) && points.some((point) => eq(point[1], 0)), 'a standard-form sibling plots both intercepts');
    }
    assert.ok(!sameLine(line, truth.line), 'the sibling is a different line');
    return;
  }
  if (kind === 'tableRate' || kind === 'tableEquation' || kind === 'tableRepair' || kind === 'bridge') {
    const rows = pointsOf(prompt.split(/\(x, y\) = /)[1]);
    assert.ok(rows.length >= 3, `the sibling shows its table: ${prompt}`);
    if (kind === 'tableRepair') {
      const broken = rows.map((_, index) => index).filter((index) => collinearLine(rows.filter((__, other) => other !== index)));
      assert.equal(broken.length, 1, 'exactly one row of the sibling table breaks the pattern');
      const fixed = collinearLine(rows.filter((_, index) => index !== broken[0]));
      const [x, y] = answerNumbers(answer, /^The row x = (-?\d+) should have y = (-?\d+(?:\/\d+)?)$/);
      assert.ok(eq(x, rows[broken[0]][0]), 'the sibling names the broken row');
      assert.ok(eq(y, math.add(math.multiply(fixed.m, x), fixed.b)), 'the sibling corrects it to the line of the other rows');
      return;
    }
    const line = collinearLine(rows);
    assert.ok(line, 'the sibling table has one constant rate');
    if (kind === 'tableRate') {
      const [rate] = answerNumbers(answer, /^Constant rate of change: (-?\d+(?:\/\d+)?)$/);
      assert.ok(eq(rate, line.m), 'the sibling states its rate');
      if (truth.line) assert.ok(!eq(rate, truth.line.m), 'a different rate from this table');
      return;
    }
    if (kind === 'tableEquation') {
      assert.ok(sameLine(lineFromEquation(answer), line), `the sibling equation ${answer} fits every row`);
      assert.ok(!sameLine(line, truth.line), 'a different line from this table');
      return;
    }
    const [general, factored, interceptText] = answer.split(';').map((part) => part.trim());
    assert.ok(sameLine(lineFromEquation(general), line), 'the sibling slope-intercept form fits the table');
    assert.ok(sameLine(lineFromEquation(factored), line), 'the sibling factored form fits the table');
    assert.ok(samePoint(pointsOf(interceptText)[0], xIntercept(line)), 'the sibling x-intercept is right');
    assert.ok(!sameLine(line, through(truth.rows[0], truth.rows[1])), 'a different line from this table');
    return;
  }
  if (kind === 'multiRep') {
    const givenText = /^You are given (.+)\. Find the slope/.exec(prompt)[1];
    let line;
    const equation = /^the (?:standard form|slope-intercept|point-slope) equation (.+)$/.exec(givenText);
    const story = /holds (\d+) liters of water and drains at a steady rate of (\d+) liters every minute/.exec(givenText);
    if (equation) line = lineFromEquation(equation[1]);
    else if (story) line = { m: math.unaryMinus(F(story[2])), b: F(story[1]) };
    else {
      const points = pointsOf(givenText.replace(/^the table \(x, y\) = /, ''));
      line = collinearLine(points);
    }
    assert.ok(line && !line.vertical, `the sibling's GIVEN describes one line: ${givenText}`);
    const [slope, yIntercept, xInterceptText, slopeIntercept, standard] = answer.split(';').map((part) => part.trim());
    assert.ok(eq(F(slope.replace(/^slope /, '')), line.m), 'the sibling slope');
    assert.ok(samePoint(pointsOf(yIntercept)[0], [F(0), line.b]), 'the sibling y-intercept');
    assert.ok(samePoint(pointsOf(xInterceptText)[0], xIntercept(line)), 'the sibling x-intercept');
    assert.ok(sameLine(lineFromEquation(slopeIntercept), line), 'the sibling slope-intercept form');
    assert.ok(sameLine(lineFromEquation(standard), line), 'the sibling standard form');
    assert.ok(!eq(line.m, truth.m) || !eq(line.b, truth.b), 'a different line');
    return;
  }
  if (kind === 'slope') {
    const points = pointsOf(prompt);
    assert.equal(points.length, 2, `the sibling names two points: ${prompt}`);
    const m = through(points[0], points[1]).m;
    assert.ok(eq(F(answer), m), `the sibling slope ${answer} is (y2 - y1)/(x2 - x1)`);
    assert.ok(!eq(m, truth.m), 'a different slope');
    assert.equal(F(m).d === 1n, F(truth.m).d === 1n, 'the same kind of slope (whole or fractional)');
    return;
  }
  // intercepts
  const equation = /of (.+?)\.(?: Write|$)/.exec(prompt)[1];
  const line = lineFromEquation(equation);
  const [xPoint, yPoint] = pointsOf(answer);
  assert.ok(samePoint(xPoint, xIntercept(line)) && samePoint(yPoint, [F(0), line.b]), `the sibling intercepts of ${equation}`);
  assert.ok(!samePoint(xPoint, truth.xInt) && !samePoint(yPoint, truth.yInt), 'different intercepts');
};

/* ------------------------------------------------------------ the tests */

test('the corpus covers every sub-kind the family claims, with several real items each', () => {
  const counts = {};
  ITEMS.forEach((item) => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
  for (const kind of Object.keys(CLOSING)) assert.ok((counts[kind] || 0) >= 3, `${kind}: ${counts[kind] || 0} items`);
  const modes = new Set(ITEMS.filter((item) => item.kind === 'graphLine').map((item) => item.truth.mode));
  assert.deepEqual([...modes].sort(), ['factoredLinear', 'pointSlope', 'slopeIntercept', 'standardForm', 'throughPoints', 'verticalHorizontal']);
  const givens = new Set(ITEMS.filter((item) => item.kind === 'multiRep').map((item) => item.truth.given));
  assert.equal(givens.size, 6, 'every GIVEN kind of the Multiple Representations board');
});

test('the family owns every one of these items, and no earlier family claims them', () => {
  assert.equal(linesAndSlope.implemented, true);
  for (const { label, question } of ITEMS) {
    assert.equal(linesAndSlope.matches(question), true, `${label} is matched`);
    assert.equal(familyFor(question)?.family, 'linesAndSlope', `${label} is owned by linesAndSlope`);
    assert.equal(linearEquations.matches(question), false, `${label}: linearEquations does not claim it`);
    assert.equal(systems.matches(question), false, `${label}: systems does not claim it`);
  }
});

test('items of other families, and items that only mention slope, are not claimed', () => {
  const notOurs = [];
  const twoStep = { questionId: 'two-step', type: 'multiAnswer', questionFamily: { id: 'linear.twoStepEquation', version: 1, tool: 'multiAnswer' } };
  const twoStepWorkspace = { questionId: 'two-step-ws', type: 'stepAlgebra', questionFamily: { id: 'linear.twoStepEquation', version: 1, tool: 'stepAlgebra' } };
  const elimination = { questionId: 'elim', type: 'system', questionFamily: { id: 'systems.elimination', version: 1, tool: 'system' } };
  const vertex = { questionId: 'vertex', type: 'multiAnswer', questionFamily: { id: 'quadratics.identifyVertex', version: 1, tool: 'multiAnswer' } };
  const zeros = { questionId: 'zeros', type: 'multiAnswer', questionFamily: { id: 'functions.identifyZeros', version: 1, tool: 'multiAnswer' } };
  [twoStep, twoStepWorkspace, elimination, vertex, zeros].forEach((slot, index) => [0, 3].forEach((seat) => notOurs.push([`${slot.questionFamily.id} #${seat}`, instance(slot, seat, 30 + index).question])));
  // Algebra II inverse-function items whose fields ask for "the slope of f⁻¹".
  const inverse = compileAuthoringIntentV5(readJson('teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json')).package;
  const slopeFields = inverse.sections.flatMap((section) => section.questions)
    .filter((question) => (question.answerFields || []).some((field) => /slope/i.test(`${field.id} ${field.label}`)));
  assert.ok(slopeFields.length >= 2, 'the inverse lesson has items with slope fields');
  slopeFields.forEach((question) => notOurs.push([`L3 inverse ${question.questionId}`, question]));
  // Guided notes: slope, y-intercept AND domain of a displayed line (a function-features item).
  const guided = readJson('SAMPLE_GUIDED_NOTES_CLASSWORK.json');
  const walk = (node) => (Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object'
    ? [...(/Enter the slope, y-intercept, and domain/.test(node.prompt || '') ? [node] : []), ...Object.values(node).flatMap(walk)] : []);
  walk(guided).forEach((question) => (question.variants || []).forEach((variant, index) => notOurs.push([`guided notes variant ${index}`, { ...question, ...variant }])));
  // A slope-intercept REWRITE is linearEquations' (Step Algebra, rewriteLinearForm).
  v5([{ standard: 'A.2C', prompt: 'Rewrite 5x + 2y = 6 in slope-intercept form.', studentActions: ['interactiveAlgebra'], mode: 'rewriteLinearForm', equation: '5x + 2y = 6' }])
    .forEach((question) => notOurs.push(['rewrite to slope-intercept', question]));
  // Graphing Lines with no readable key (two lines drawn), and a non-function table.
  notOurs.push(['graphing, two lines, no key', { type: 'graphing', prompt: 'Compare the lines.', graph: { functions: [{ type: 'line', m: 1, b: 0 }, { type: 'line', m: -1, b: 2 }] } }]);
  notOurs.push(['table with a repeated x', { type: 'linearTableWorkbench', mode: 'deriveEquation', rows: [{ x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 4 }] }]);
  notOurs.push(['multiAnswer slope with the wrong key', { type: 'multiAnswer', prompt: 'Find the slope of the line through $(1, 2)$ and $(3, 6)$.', answerFields: [{ id: 'slope', label: 'Slope', answer: '3' }] }]);
  for (const [label, question] of notOurs) {
    assert.equal(linesAndSlope.matches(question), false, `${label} is not claimed`);
    assert.notEqual(familyFor(question)?.family, 'linesAndSlope', `${label} is not routed here`);
  }
  // …while the same slope prompt with its true key, and no family id, is unmistakable.
  assert.equal(linesAndSlope.matches({ type: 'multiAnswer', prompt: 'Find the slope of the line through $(1, 2)$ and $(3, 6)$.', answerFields: [{ id: 'slope', label: 'Slope', answer: '2' }] }), true);
});

test('expectedValues lists every answer, in the forms a hint could use, computed from the key', () => {
  for (const item of ITEMS) {
    const expected = linesAndSlope.expectedValues(item.question);
    const { primary } = independentAnswers(item);
    for (const value of primary) assert.ok(expected.includes(value), `${item.label}: expectedValues lists ${value} (got ${expected.slice(0, 12).join(' | ')})`);
    // The platform guard reads them too.
    const guard = questionAnswerValues(item.question);
    for (const value of primary) assert.ok(guard.includes(value), `${item.label}: the platform guard reads ${value}`);
  }
});

test('hints quote the problem, never contain or narrow to an answer, and end with the ladder’s closing check', () => {
  for (const item of ITEMS) {
    const { label, question, kind } = item;
    const hints = linesAndSlope.hints(question);
    assert.ok(hints.length >= 2 && hints.length <= 4, `${label}: 2-4 hints (got ${hints.length})`);
    const answers = [...linesAndSlope.expectedValues(question), ...independentAnswers(item).texts];
    for (const hint of hints) {
      assert.equal(typeof hint, 'string');
      assert.equal(hintRevealsAnswer(hint, answers), false, `${label}: "${hint}" reveals an answer`);
    }
    assert.match(hints[hints.length - 1], CLOSING[kind], `${label}: the ladder ends with its closing step (got "${hints[hints.length - 1]}")`);
    assert.equal(new Set(hints).size, hints.length, `${label}: no repeated hint`);
    // Built into the platform ladder, after any authored hints.
    const built = buildQuestionHints(question);
    for (const hint of hints) assert.ok(built.some((entry) => entry.text === hint && entry.source === 'family'), `${label}: the platform ladder carries "${hint}"`);
  }
});

test('hints use this problem’s own numbers wherever that is safe', () => {
  const quoting = (label) => {
    const item = ITEMS.find((entry) => entry.label === label);
    return linesAndSlope.hints(item.question).join(' ');
  };
  // A slope item quotes its points — unless a coordinate is itself the slope
  // (points (1, 2) and (3, 6), slope 2), when the plain spelling is the safe one.
  let quotedPoints = 0;
  for (const item of ITEMS.filter((entry) => entry.kind === 'slope')) {
    const points = item.truth.points.map(pairText).join(' and ');
    if (quoting(item.label).includes(pairText(item.truth.points[0]))) quotedPoints += 1;
    else assert.equal(hintRevealsAnswer(points, independentAnswers(item).texts), true, `${item.label}: falls back to the plain spelling only when quoting ${points} would show the slope`);
  }
  assert.ok(quotedPoints >= 10, `most slope ladders quote their points (${quotedPoints})`);
  // An intercept item quotes its equation; a table its x-values; graphing2 its given.
  const interceptItem = ITEMS.find((item) => item.label === 'linearIntercepts 0');
  assert.match(quoting(interceptItem.label), /3x \+ 4y = 24/);
  assert.match(quoting('V5 linearTableWorkbench constantRate 0'), /x = 0 and x = 1/);
  assert.match(quoting('batch D graphing2 standardForm'), /2x \+ y = 4/);
  assert.match(quoting('batch D graphing2 slopeIntercept'), /y = 1\.5x - 2/);
  assert.match(quoting('batch D graphing2 throughPoints'), /\(-2, -1\) and \(2, 3\)/);
  // …and fall back to the plain spelling when the quoted numbers hold an answer:
  // y = (1/3)x + 1 given, slope and intercept ARE answers of the board.
  const lmr = ITEMS.find((item) => item.label.startsWith('multipleRepresentations slopeIntercept fraction'));
  assert.doesNotMatch(quoting(lmr.label), /1\/3/);
});

test('"Try a similar one": a correctly worked sibling with different numbers and a different answer', () => {
  for (const item of ITEMS) {
    const { label, question } = item;
    const direct = linesAndSlope.similarProblem(question, { seed: 0 });
    assert.ok(direct, `${label}: the family builds a sibling`);
    assert.deepEqual(linesAndSlope.similarProblem(question, { seed: 0 }), direct, `${label}: deterministic for a seed`);
    const example = buildSimilarWorkedExample(question);
    assert.ok(example, `${label}: the platform offers it`);
    assert.equal(similarExampleIsSafe(question, example), true, `${label}: it passes the platform's own checks`);
    assert.notEqual(example.prompt, question.prompt);
    const answers = [...questionAnswerValues(question), ...independentAnswers(item).texts];
    assert.ok(!answers.some((value) => value.toLowerCase() === example.answer.toLowerCase()), `${label}: the sibling answer is not this answer`);
    for (const step of example.steps) assert.equal(hintRevealsAnswer(step, answers), false, `${label}: sibling step "${step}" shows this question's answer`);
    verifySibling(item, example);
    // Other seeds give siblings too, each correct.
    for (const seed of [1, 2, 7]) {
      const other = buildSimilarWorkedExample(question, { seed });
      assert.ok(other, `${label}: seed ${seed}`);
      verifySibling(item, other);
    }
  }
});

test('"Let’s back up": a two-choice question about this problem’s first move, never its answer', () => {
  for (const item of ITEMS) {
    const { label, question } = item;
    const step = linesAndSlope.backUpQuestion(question);
    assert.ok(step, `${label}: a back-up step`);
    assert.equal(step.options.length, 2, `${label}: two choices`);
    assert.ok(step.options.includes(step.correct), `${label}: the right choice is offered`);
    assert.notEqual(step.options[0], step.options[1]);
    const answers = [...linesAndSlope.expectedValues(question), ...independentAnswers(item).texts];
    for (const text of [step.prompt, ...step.options]) assert.equal(hintRevealsAnswer(text, answers), false, `${label}: "${text}" reveals an answer`);
    const platform = backUpStepFor(question);
    assert.equal(platform.source, 'family', `${label}: the platform uses the family step`);
    assert.equal(platform.correct, step.correct);
  }
  // The conventional first move, for a few shapes.
  const at = (label) => linesAndSlope.backUpQuestion(ITEMS.find((item) => item.label === label).question);
  assert.equal(at('linearIntercepts 0').correct, 'y', 'for the x-intercept, y becomes 0');
  assert.equal(at('batch D graphing2 slopeIntercept').correct, 'The y-intercept, on the y-axis');
  assert.equal(at('batch D graphing2 verticalHorizontal').correct, 'The x-coordinate', 'x = 3 keeps x fixed');
});

test('nothing for a question this family cannot read', () => {
  for (const question of [null, undefined, {}, { type: 'graphing2', mode: 'slopeIntercept', line: { m: 'two', b: 1 } }, { type: 'multiAnswer', prompt: 'Find the slope.' }]) {
    assert.equal(linesAndSlope.matches(question), false);
    assert.deepEqual(linesAndSlope.hints(question), []);
    assert.deepEqual(linesAndSlope.expectedValues(question), []);
    assert.equal(linesAndSlope.similarProblem(question, { seed: 0 }), null);
    assert.equal(linesAndSlope.backUpQuestion(question), null);
  }
});
