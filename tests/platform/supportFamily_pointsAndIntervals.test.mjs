/*
 * THE "POINTS AND INTERVALS" SUPPORT FAMILY, ON REAL ITEMS
 * (src/platform/supports/families/pointsAndIntervals.js).
 *
 * Every item here is a question the classroom renders:
 *   - the intervalNumberLine items of the Algebra II honors corpus
 *     (teacher-import-jsons), compiled by the production V5 compiler, and the
 *     two examples in the question-type catalog;
 *   - the Path number-line templates (drafts/grade6, grade7, algebra1 A.5B,
 *     algebra2 A2.4H) instantiated by the real Path generator — graph a given
 *     inequality, solve a linear one, solve a factored one, read a condition
 *     in words;
 *   - the Sign & Solution Analyzer items of SAMPLE_BATCH_B_DEEP_DIVE.json and
 *     SAMPLE_MISSING_MATH_TOOLS.json, the V5 sign-chart / radical items the
 *     analyzer's review test compiles, and that test's realistic fixtures;
 *   - orderedPair and numberLine items from the real legacy problemGenerator,
 *     V5-compiled stateOrderedPair items, the browser teacher-workflow fixture
 *     and the catalog / checkpoint examples;
 *   - the Step Algebra linear-inequality fixtures the shared graders use.
 *
 * The answer each item is checked against is computed INDEPENDENTLY of the
 * family: from the key with the grader's own interval helpers, by evaluating
 * the sign chart / radical / lines with plain arithmetic, or from the item's
 * own stored solved form.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as pointsAndIntervals from '../../src/platform/supports/families/pointsAndIntervals.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  intervalsToInequality,
  intervalsToNotation,
  normalizeIntervals,
  sameIntervals,
} from '../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const unique = (values) => [...new Set(values.filter(Boolean))];

/* ------------------------------------------------ plain arithmetic, test-side */

// A written expression in x as JavaScript: implicit products, powers, brackets.
const toJs = (expression) => expression
  .replace(/[−–]/g, '-')
  .replace(/²/g, '**2').replace(/³/g, '**3').replace(/⁴/g, '**4')
  .replace(/\[/g, '(').replace(/\]/g, ')')
  .replace(/(\d)\s*(x|\()/g, '$1*$2')
  .replace(/\)\s*(x|\()/g, ')*$1')
  .replace(/x\s*\(/g, 'x*(');
const evaluator = (expression) => new Function('x', `return (${toJs(expression)});`);
const COMPARE = {
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '≤': (a, b) => a <= b + 1e-12,
  '≥': (a, b) => a >= b - 1e-12,
};
// "a ≤ x < b", "x > 3", "-3x + 4 > 10": every link of the chain holds.
const chainHolds = (statement, x) => {
  const parts = statement.split(/\s*(≤|≥|<|>)\s*/);
  for (let index = 1; index < parts.length; index += 2) {
    const left = evaluator(parts[index - 1])(x);
    const right = evaluator(parts[index + 1])(x);
    if (!Number.isFinite(left) || !Number.isFinite(right) || !COMPARE[parts[index]](left, right)) return false;
  }
  return true;
};
const statementHolds = (statement, x) => statement.split(/\s+or\s+/).some((clause) => chainHolds(clause, x));

const readNumber = (value) => {
  const cleaned = value.replace(/[−–]/g, '-');
  const fraction = cleaned.match(/^(-?\d+)\/(\d+)$/);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(cleaned);
};
// Interval notation as this test reads it, including {a} and ∅.
const parseNotation = (value) => {
  if (value.trim() === '∅') return [];
  return value.split('∪').map((part) => {
    const piece = part.trim().replace(/−/g, '-');
    const single = piece.match(/^\{(-?[\d./]+)\}$/);
    if (single) return { min: readNumber(single[1]), max: readNumber(single[1]), minClosed: true, maxClosed: true };
    const match = piece.match(/^([[(])\s*(-∞|-?[\d./]+)\s*,\s*(∞|-?[\d./]+)\s*([\])])$/);
    assert.ok(match, `readable interval notation: ${value}`);
    return {
      min: match[2] === '-∞' ? -Infinity : readNumber(match[2]),
      max: match[3] === '∞' ? Infinity : readNumber(match[3]),
      minClosed: match[1] === '[',
      maxClosed: match[4] === ']',
    };
  });
};
const inSet = (pieces, x) => pieces.some((piece) => (x > piece.min || (piece.minClosed && x === piece.min))
  && (x < piece.max || (piece.maxClosed && x === piece.max)));
const SAMPLE_POINTS = Array.from({ length: 241 }, (_, index) => -30 + index * 0.25);
const assertSameSet = (holds, pieces, label) => {
  SAMPLE_POINTS.forEach((x) => assert.equal(inSet(pieces, x), holds(x), `${label}: x = ${x}`));
};

/* ------------------------------------------------ independent answers */

const asciiMinus = (value) => value.replace(/−/g, '-');
const keyOf = (question) => normalizeIntervals(question.intervals?.length ? question.intervals : question.expectedIntervals);
// The key as the grader's own formatter writes it, piece by piece and whole.
const notationOracle = (pieces) => {
  const whole = intervalsToNotation(pieces);
  const parts = pieces.map((piece) => intervalsToNotation([piece]));
  return unique([whole, asciiMinus(whole), ...parts, ...parts.map(asciiMinus)]);
};

// A sign chart solved by evaluating the factored expression between and at
// its critical points.
const chartOracle = (question) => {
  const rational = (question.mode || (question.denominatorFactors?.length ? 'rational' : 'polynomial')) === 'rational';
  const top = (question.numeratorFactors || question.factors).map((factor) => ({ root: Number(factor.root), power: Number(factor.multiplicity ?? 1) }));
  const bottom = rational ? question.denominatorFactors.map((factor) => ({ root: Number(factor.root), power: Number(factor.multiplicity ?? 1) })) : [];
  const relation = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' }[question.relation || '>'];
  const value = (x) => top.reduce((p, f) => p * ((x - f.root) ** f.power), 1) / bottom.reduce((p, f) => p * ((x - f.root) ** f.power), 1);
  const holds = (x) => Number.isFinite(value(x)) && COMPARE[relation](value(x), 0);
  const points = [...new Set([...top, ...bottom].map((factor) => factor.root))].sort((a, b) => a - b);
  const bounds = [-Infinity, ...points, Infinity];
  const selected = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const [left, right] = [bounds[index], bounds[index + 1]];
    const probe = !Number.isFinite(left) ? right - 1 : !Number.isFinite(right) ? left + 1 : (left + right) / 2;
    if (holds(probe)) selected.push({ min: left, max: right, minClosed: false, maxClosed: false });
  }
  return { holds, selected };
};

const radicalOracle = (question) => {
  const { radicand, rhs } = question.radicalEquation;
  const m1 = Number(radicand.m ?? 1);
  const b1 = Number(radicand.b ?? 0);
  const m2 = Number(rhs.m ?? 0);
  const b2 = Number(rhs.b ?? 0);
  return question.candidates.map(Number).filter((x) => m1 * x + b1 >= 0 && Math.abs(Math.sqrt(m1 * x + b1) - (m2 * x + b2)) < 1e-9);
};

// Step Algebra fixtures: a·x + b REL c, solved by hand.
const linearOracle = (source) => {
  const match = asciiMinus(source).replace(/\\le/g, '≤').replace(/<=/g, '≤').replace(/>=/g, '≥')
    .match(/^\s*(-?\d*)x\s*([+-])\s*(\d+)\s*(≤|≥|<|>)\s*(-?\d+)\s*$/);
  assert.ok(match, `a linear fixture: ${source}`);
  const a = match[1] === '' ? 1 : match[1] === '-' ? -1 : Number(match[1]);
  const b = (match[2] === '-' ? -1 : 1) * Number(match[3]);
  const c = Number(match[5]);
  const boundary = (c - b) / a;
  const relation = a < 0 ? { '<': '>', '>': '<', '≤': '≥', '≥': '≤' }[match[4]] : match[4];
  return { boundary, relation, statement: `x ${relation} ${boundary}` };
};

/* ------------------------------------------------ the real items */

const ITEMS = [];
const add = (kind, label, question, oracle, extra = {}) => ITEMS.push({ kind, label, question, oracle, ...extra });

const intervalOracle = (question, { secretInequality = false, boundary = null } = {}) => {
  const key = keyOf(question);
  const inequality = intervalsToInequality(key, question.variable || 'x');
  return unique([
    ...notationOracle(key),
    ...(secretInequality ? [inequality, asciiMinus(inequality), question.inequalityText] : []),
    ...(boundary === null ? [] : [String(boundary), `x = ${boundary}`]),
  ]);
};

// The Algebra II honors corpus: "Graph −4 ≤ x < 3 …".
['teacher-import-jsons/algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json',
  'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json'].forEach((file) => {
  compileAuthoringIntentV5(readJson(file)).package.sections.flatMap((section) => section.questions)
    .filter((question) => question.type === 'intervalNumberLine')
    .forEach((question) => add('graph', `corpus: ${question.prompt}`, question, intervalOracle(question), { given: asciiMinus(question.inequalityText) }));
});
const catalog = QUESTION_TYPE_CATALOG.intervalNumberLine;
add('graph', 'catalog example', catalog.example, intervalOracle(catalog.example), { given: catalog.example.inequalityText });
add('graph', 'catalog unbounded example', catalog.unboundedExample, intervalOracle(catalog.unboundedExample), { given: catalog.unboundedExample.inequalityText });

const docById = (file, id) => readJson(file).documents.find((document) => document.id === id);
const pathItems = (file, id, seeds) => seeds.map((seed) => {
  const generated = generatePathInstanceWithRetries(docById(file, id), `points-intervals-${seed}`);
  assert.ok(generated.question, `${id} instantiates: ${generated.reason}`);
  return generated.question;
});
const finiteEnd = (question) => keyOf(question).flatMap((piece) => [piece.min, piece.max]).find(Number.isFinite);

['mm_gen_6_6_9B_greater-than', 'mm_gen_6_6_9B_greater-equal', 'mm_gen_6_6_9B_less-than', 'mm_gen_6_6_9B_less-equal'].forEach((id) => {
  pathItems('drafts/grade6.json', id, [1, 2, 3]).forEach((question) => add('graph', `${id}: ${question.prompt}`, question, intervalOracle(question), {
    given: asciiMinus(question.inequalityText).replace(/\s+/g, ' '),
  }));
});
['mm_gen_7_7_10B_greater-ray', 'mm_gen_7_7_10B_at-least-ray', 'mm_gen_7_7_10B_less-ray', 'mm_gen_7_7_10B_at-most-ray'].forEach((id) => {
  pathItems('drafts/grade7.json', id, [1, 2, 3]).forEach((question) => add('solve', `${id}: ${question.prompt}`, question,
    intervalOracle(question, { secretInequality: true, boundary: finiteEnd(question) })));
});
pathItems('drafts/algebra1.json', 'mm_A_5B_v2_negative-coefficient-number-line', [1, 2, 3, 4]).forEach((question) => add('solve', `A.5B: ${question.prompt}`, question,
  intervalOracle(question, { secretInequality: true, boundary: finiteEnd(question) })));
pathItems('drafts/algebra2.json', 'mm_A2_4H_v2_number-line-exterior-inclusive', [1, 2, 3, 4]).forEach((question) => add('factored', `A2.4H: ${question.prompt}`, question,
  intervalOracle(question, { secretInequality: true })));
pathItems('drafts/grade6.json', 'mm_gen_6_6_9B_context-boundary', [1, 2, 3]).forEach((question) => add('verbal', `context: ${question.prompt}`, question,
  intervalOracle(question, { secretInequality: true })));

// Sign & Solution Analyzer.
const chartLabelOracle = (question) => {
  const { selected } = chartOracle(question);
  const labels = selected.map((piece) => `(${Number.isFinite(piece.min) ? piece.min : '−∞'}, ${Number.isFinite(piece.max) ? piece.max : '∞'})`);
  return unique([...labels, ...labels.map(asciiMinus), labels.join(' ∪ ')]);
};
const sampleTools = (file) => readJson(file).questions.filter((question) => question.toolId === 'signSolutionAnalyzer');
const batchB = sampleTools('SAMPLE_BATCH_B_DEEP_DIVE.json');
const reviewCompiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Polynomial and rational inequalities', courseId: 'algebra2' },
  sections: [{
    role: 'practice',
    questions: [
      { prompt: 'Solve (x + 1)²(x − 4) ≤ 0 with a sign chart.', studentActions: ['solve inequality'], signChart: { factors: [{ root: -1, multiplicity: 2 }, { root: 4, multiplicity: 1 }], relation: '<=' } },
      { prompt: 'Solve (x − 2)/(x + 3) ≥ 0.', studentActions: ['solve inequality'], signChart: { mode: 'rational', factors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' } },
      { prompt: 'Which candidates solve √(2x + 3) = x?', studentActions: ['solve inequality'], signChart: { mode: 'radicalCheck', radicalEquation: { radicand: { m: 2, b: 3 }, rhs: { m: 1, b: 0 } }, candidates: [3, -1] } },
      { prompt: 'Solve x(x − 5) > 0.', studentActions: ['solve inequality'], factors: [{ root: 0 }, { root: 5 }], relation: '>' },
    ],
  }],
}).package.sections[0].questions;
const tool = (fields) => ({ type: 'signSolutionAnalyzer', ...fields });
[
  ['batch B (x + 2)(x − 3)² > 0', batchB.find((question) => question.mode === 'polynomial')],
  ['missing-tools (x + 2)(x − 3) > 0', sampleTools('SAMPLE_MISSING_MATH_TOOLS.json')[0]],
  ['V5 (x + 1)²(x − 4) ≤ 0', reviewCompiled[0]],
  ['V5 x(x − 5) > 0', reviewCompiled[3]],
  ['cubic (x + 3)x(x − 2) < 0', tool({ mode: 'polynomial', factors: [{ root: -3 }, { root: 0 }, { root: 2 }], relation: '<' })],
].forEach(([label, question]) => add('signChart', label, question, chartLabelOracle(question)));
[
  ['batch B (x + 2)(x − 3)/(x − 1) ≥ 0', batchB.find((question) => question.mode === 'rational')],
  ['V5 (x − 2)/(x + 3) ≥ 0', reviewCompiled[1]],
  ['inferred (x − 2)/[(x + 1)(x − 4)] < 0', tool({ numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -1 }, { root: 4 }], relation: '<' })],
  ['even denominator (x + 1)/(x − 3)² > 0', tool({ mode: 'rational', numeratorFactors: [{ root: -1 }], denominatorFactors: [{ root: 3, multiplicity: 2 }], relation: '>' })],
].forEach(([label, question]) => add('signChart', label, question, chartLabelOracle(question)));
[
  ['batch B √(x + 6) = 3', batchB.find((question) => question.mode === 'radicalCheck')],
  ['V5 √(2x + 3) = x', reviewCompiled[2]],
  ['two genuine √(5x − 4) = x', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 5, b: -4 }, rhs: { m: 1, b: 0 } }, candidates: [1, 4] })],
  ['extraneous and outside √(x + 7) = x − 5', tool({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 7 }, rhs: { m: 1, b: -5 } }, candidates: [9, 2, -8] })],
].forEach(([label, question]) => add('radical', label, question, radicalOracle(question).flatMap((value) => [String(value), `x = ${value}`])));

// Ordered pairs and number lines.
const pairOracle = ([x, y]) => [`(${x}, ${y})`, `(${x},${y})`, `x = ${x}`, `y = ${y}`, String(x), String(y)];
['op-1', 'op-2', 'op-3', 'op-4'].forEach((key) => {
  const question = generateQuestion({ type: 'orderedPair', prompt: 'Name the coordinates of the plotted point.', generator: { kind: 'orderedPair', xRange: [-9, 9], yRange: [-9, 9] } }, key);
  add('plotted', `generated point ${key}`, question, pairOracle(question.answer));
});
const compiledPoints = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Points', courseId: 'algebra1' },
  sections: [{ role: 'practice', questions: [
    { prompt: 'Where do y = 2x - 1 and y = -x + 5 meet?', studentActions: ['stateOrderedPair'], answer: [2, 3] },
    { prompt: 'Where do y = 3x + 4 and y = -2x - 6 meet?', studentActions: ['stateOrderedPair'], answer: [-2, -2] },
    { prompt: 'Name the plotted point.', studentActions: ['stateOrderedPair'], answer: [-3, 4], graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, points: [[-3, 4]] } },
  ] }],
}).package.sections[0].questions;
add('lines', 'V5 y = 2x - 1 and y = -x + 5', compiledPoints[0], pairOracle([2, 3]));
add('lines', 'V5 y = 3x + 4 and y = -2x - 6', compiledPoints[1], pairOracle([-2, -2]));
add('plotted', 'V5 plotted point', compiledPoints[2], pairOracle([-3, 4]));
add('lines', 'teacher-workflow fixture', { questionId: 'p2', activityRole: 'practice', type: 'orderedPair', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: '(2,3)' }, pairOracle([2, 3]));
add('pointOnly', 'catalog example', QUESTION_TYPE_CATALOG.orderedPair.example, pairOracle([2, 5]));
add('pointOnly', 'checkpoint DOL example', { questionId: 'q-dol-1', type: 'orderedPair', activityRole: 'dol', prompt: 'Where do the lines meet?', solution: [2, 5] }, pairOracle([2, 5]));

['nl-1', 'nl-2', 'nl-3', 'nl-4'].forEach((key) => {
  const question = generateQuestion({ type: 'numberLine', prompt: 'Select the target on the number line.', generator: { targetRange: [-20, 20], spacing: 5 } }, key);
  add('numberLine', `generated number line ${key}`, question, [String(question.target), `x = ${question.target}`]);
});
add('numberLine', 'composed-workflow fixture', { type: 'numberLine', prompt: 'Find the target.', target: 3, choices: [1, 2, 3, 4, 5] }, ['3', 'x = 3']);

// Step Algebra linear inequalities (the shared graders' fixtures).
[
  ['shared grading INEQUALITY', { type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 <= 7', representSolution: false }, '2x + 3 <= 7'],
  ['shared grading FLIP', { type: 'stepAlgebra', prompt: 'Solve.', equation: '-3x + 4 > 10', representSolution: false }, '-3x + 4 > 10'],
  ['shared grading PROMPT_ONLY', { type: 'stepAlgebra', prompt: 'Solve -2x + 3 > 7.', representSolution: false }, '-2x + 3 > 7'],
  ['shared grading REPRESENT', { type: 'stepAlgebra', prompt: 'Solve and graph.', equation: '2x + 3 <= 7' }, '2x + 3 <= 7'],
  ['step submission INEQUALITY', { questionId: 'q-ineq', type: 'stepAlgebra', prompt: 'Solve.', equation: '-2x + 3 > 7' }, '-2x + 3 > 7'],
  ['inequalityText item', { type: 'stepAlgebra', equation: '2x + 3 < 9', inequalityText: '2x + 3 < 9' }, '2x + 3 < 9'],
  ['LaTeX item', { type: 'stepAlgebra', equationLatex: '2x + 3 \\le 9' }, '2x + 3 \\le 9'],
].forEach(([label, question, source]) => {
  const solved = linearOracle(source);
  const piece = solved.relation === '<' || solved.relation === '≤'
    ? { min: -Infinity, max: solved.boundary, minClosed: false, maxClosed: solved.relation === '≤' }
    : { min: solved.boundary, max: Infinity, minClosed: solved.relation === '≥', maxClosed: false };
  add('linearInequality', label, question, unique([solved.statement, String(solved.boundary), `x = ${solved.boundary}`, ...notationOracle([piece])]), { solved });
});

const answersFor = (item) => unique([...pointsAndIntervals.expectedValues(item.question), ...item.oracle]);
const KINDS_WITH_SIBLINGS = ['graph', 'solve', 'factored', 'verbal', 'signChart', 'radical', 'plotted', 'lines', 'numberLine', 'linearInequality'];

/* ------------------------------------------------ ownership */

test('the real items: several of every kind, each claimed, and owned by this family in index order', () => {
  const counts = {};
  ITEMS.forEach((item) => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
  ['graph', 'solve', 'factored', 'verbal', 'signChart', 'radical', 'plotted', 'lines', 'pointOnly', 'numberLine', 'linearInequality']
    .forEach((kind) => assert.ok(counts[kind] >= (kind === 'pointOnly' ? 2 : 3), `${kind}: ${counts[kind]} items`));
  assert.ok(ITEMS.length > 80, `${ITEMS.length} items`);
  ITEMS.forEach(({ question, label }) => {
    assert.equal(pointsAndIntervals.matches(question), true, label);
    assert.equal(familyFor(question)?.family, 'pointsAndIntervals', `${label} is owned by ${familyFor(question)?.family}`);
  });
});

test('what is not a point, a number line or a one-variable inequality is not claimed', () => {
  const corpus = fs.readdirSync(path.join(root, 'teacher-import-jsons'), { recursive: true })
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => compileAuthoringIntentV5(readJson(path.join('teacher-import-jsons', file))).package.sections.flatMap((section) => section.questions));
  const notOurs = corpus.filter((question) => question.type !== 'intervalNumberLine');
  assert.ok(notOurs.length > 150);
  notOurs.forEach((question) => assert.equal(pointsAndIntervals.matches(question), false, `corpus ${question.type}: ${String(question.prompt).slice(0, 70)}`));
  readJson('drafts/district-dol2/assignment.json').sections.flatMap((section) => section.questions)
    .forEach((question) => assert.equal(pointsAndIntervals.matches(question), false, `district DOL: ${question.heading}`));
  // An uninstantiated Path template ({{v}} endpoints) is not a key.
  assert.equal(pointsAndIntervals.matches(docById('drafts/grade7.json', 'mm_gen_7_7_10B_greater-ray')), false);
  [
    { type: 'stepAlgebra', equation: '3x + 5 = 20' },
    { type: 'stepAlgebra', equation: '|2x - 3| < 7' },
    { type: 'stepAlgebra', equation: '-7 < 2x + 1 <= 9' },
    { type: 'stepAlgebra', equation: 'x^2 + 3 > 12' },
    { type: 'stepAlgebra', mode: 'linearIntercepts', equation: '2x + 3y > 12' },
    // The analyzer would draw its demo problem for these (no data of their own).
    tool({ mode: 'polynomial', prompt: 'Make a sign chart.' }),
    tool({ mode: 'rational', numeratorFactors: [{ root: 2 }], relation: '>' }),
    tool({ mode: 'radicalCheck', candidates: [3, -15] }),
    // A relation the grader reads by its first character is not the one shown.
    tool({ factors: [{ root: -2 }, { root: 3 }], relation: '≥' }),
    // An explicit polynomial chart ignores denominators: not the stated problem.
    tool({ mode: 'polynomial', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>' }),
    { type: 'numberLine', choices: [{ id: 'a', points: [-2] }, { id: 'b', points: [2] }], answer: 'a' },
    { type: 'intervalNumberLine', prompt: 'Graph it.', intervals: [] },
    { type: 'multiAnswer', prompt: 'Write x ≥ 3 in interval notation.', answerFields: [{ id: 'i', label: 'Interval', answer: '[3, ∞)' }] },
    { type: 'system', equations: ['y = 2x + 1', 'y = -x + 4'], solution: [1, 3] },
    { type: 'orderedPair', prompt: 'Where?' },
  ].forEach((question) => assert.equal(pointsAndIntervals.matches(question), false, JSON.stringify(question)));
});

/* ------------------------------------------------ hints */

test('hints: two to four, none contains an answer — the family\'s or the independent one — and all reach the student', () => {
  for (const item of ITEMS) {
    const { question, label } = item;
    const hints = pointsAndIntervals.hints(question);
    assert.ok(hints.length >= 2 && hints.length <= 4, `${label}: ${hints.length} hints`);
    const answers = answersFor(item);
    assert.ok(answers.length, `${label}: answers to check against`);
    hints.forEach((hint) => assert.equal(hintRevealsAnswer(hint, answers), false, `${label}: "${hint}" leaks one of ${JSON.stringify(item.oracle)}`));
    const shown = buildQuestionHints(question).filter((hint) => hint.source === 'family').map((hint) => hint.text);
    hints.forEach((hint) => assert.ok(shown.includes(hint), `${label}: the platform ladder carries "${hint}"`));
  }
});

test('hints quote the problem\'s own numbers when that reveals nothing', () => {
  // A graphed inequality is given, so the first (least specific) rung quotes
  // it: a rung that fell back to its plain spelling here would mean the quoted
  // one was refused as a leak.
  ITEMS.filter((item) => item.given).forEach(({ question, label, given }) => {
    const hints = pointsAndIntervals.hints(question);
    assert.ok(hints[0].includes(given), `${label}: the first hint quotes ${given}: ${JSON.stringify(hints)}`);
    assert.equal(hints.length, 4, `${label}: every rung survives`);
  });
  // A solved inequality's original is quoted unless its boundary is printed in it.
  ITEMS.filter((item) => item.kind === 'solve').forEach(({ question, label }) => {
    const boundary = String(finiteEnd(question));
    const hints = pointsAndIntervals.hints(question);
    if (!hintRevealsAnswer(asciiMinus(question.prompt).replace(/\$/g, ' '), [boundary])) {
      assert.ok(hints.some((hint) => /\d/.test(hint)), `${label}: a hint uses the problem's numbers`);
    }
  });
  // Sign charts name their own factors.
  const chart = ITEMS.find((item) => item.label === 'batch B (x + 2)(x − 3)² > 0');
  assert.ok(pointsAndIntervals.hints(chart.question).some((hint) => hint.includes('(x + 2)(x - 3)²')));
});

test('when the answer is printed inside the problem, the hint falls back to its plain spelling', () => {
  // -2x + 3 > 7 has the answer -2 inside "-2x": no hint may quote it.
  const item = ITEMS.find((entry) => entry.label === 'shared grading PROMPT_ONLY');
  const hints = pointsAndIntervals.hints(item.question);
  assert.ok(hints.length >= 2);
  hints.forEach((hint) => assert.equal(hint.includes('-2x + 3 > 7'), false, hint));
  // √(x + 6) = 3 has its genuine solution 3 on the right side.
  const radical = ITEMS.find((entry) => entry.label === 'batch B √(x + 6) = 3');
  pointsAndIntervals.hints(radical.question).forEach((hint) => assert.equal(hint.includes('= 3'), false, hint));
});

/* ------------------------------------------------ expected values */

test('expectedValues covers the key as the grader writes it, and feeds the platform guard', () => {
  for (const item of ITEMS) {
    const expected = pointsAndIntervals.expectedValues(item.question);
    const lower = expected.map((value) => value.toLowerCase());
    item.oracle.forEach((form) => assert.ok(lower.includes(form.toLowerCase()), `${item.label}: ${form} in ${JSON.stringify(expected.slice(0, 8))}`));
    const guarded = questionAnswerValues(item.question);
    expected.forEach((value) => assert.ok(guarded.includes(value), `${item.label}: the guard reads ${value}`));
  }
  // A graphed inequality that the prompt states is not secret; a solved one is.
  const graphed = ITEMS.find((item) => item.kind === 'graph' && item.question.inequalityText);
  assert.equal(pointsAndIntervals.expectedValues(graphed.question).includes(graphed.question.inequalityText), false);
  const solved = ITEMS.find((item) => item.kind === 'solve' && item.question.inequalityText);
  assert.ok(pointsAndIntervals.expectedValues(solved.question).includes(solved.question.inequalityText));
});

/* ------------------------------------------------ similar problems */

const notationPart = (answer) => (answer.includes(', which is ') ? answer.split(', which is ')[1] : answer);
const statementPart = (answer) => answer.split(', which is ')[0];

// The sibling's answer, checked against its own prompt by plain arithmetic.
// Returns the sibling's answer set (pieces) or point/value, for the "differs" check.
const verifySibling = (item, example) => {
  const { kind, label } = item;
  const where = `${label} → ${example.prompt} = ${example.answer}`;
  if (kind === 'graph') {
    const statement = example.prompt.match(/^Graph (.+?) on the number line/)[1];
    const pieces = parseNotation(example.answer);
    assertSameSet((x) => statementHolds(statement, x), pieces, where);
    return { pieces };
  }
  if (kind === 'solve' || kind === 'linearInequality') {
    const statement = example.prompt.match(/^Solve (.+?)(?:, then|\.$)/)[1];
    const answerStatement = statementPart(example.answer);
    assertSameSet((x) => chainHolds(statement, x), [toPiece(answerStatement)], where);
    if (example.answer.includes(', which is ')) assert.ok(sameIntervals(parseNotation(notationPart(example.answer)), [toPiece(answerStatement)]), where);
    return { pieces: [toPiece(answerStatement)] };
  }
  if (kind === 'factored') {
    const [, expression, relation] = example.prompt.match(/^Solve (.+?) (≤|≥|<|>) 0/);
    const pieces = parseNotation(example.answer);
    assertSameSet((x) => COMPARE[relation](evaluator(expression)(x), 0), pieces, where);
    return { pieces };
  }
  if (kind === 'verbal') {
    const [, phrase, value] = example.prompt.match(/must be (at least|at most|more than|less than|no more than|no less than|greater than|fewer than) (-?\d+)/);
    const relation = { 'at least': '≥', 'no less than': '≥', 'at most': '≤', 'no more than': '≤', 'more than': '>', 'greater than': '>', 'less than': '<', 'fewer than': '<' }[phrase];
    const pieces = parseNotation(notationPart(example.answer));
    assertSameSet((x) => COMPARE[relation](x, Number(value)), pieces, where);
    return { pieces };
  }
  if (kind === 'signChart') {
    const [, expression, relation] = example.prompt.match(/^Use a sign chart to solve (.+) (≤|≥|<|>) 0\.$/);
    const value = evaluator(expression);
    const pieces = parseNotation(example.answer);
    assertSameSet((x) => Number.isFinite(value(x)) && COMPARE[relation](value(x), 0), pieces, where);
    return { pieces };
  }
  if (kind === 'radical') {
    const [, radicand, right] = example.prompt.match(/√\((.+?)\) = (.+?)(?:\?| and check)/);
    const constant = example.prompt.match(/candidates x = (-?\d+) and x = (-?\d+)/);
    let candidates;
    if (constant) candidates = [Number(constant[1]), Number(constant[2])];
    else {
      // √(x + b) = x: squaring gives x² − x − b = 0.
      const b = evaluator(radicand)(0);
      const disc = Math.sqrt(1 + 4 * b);
      candidates = [(1 + disc) / 2, (1 - disc) / 2];
    }
    const valid = candidates.filter((x) => evaluator(radicand)(x) >= 0 && Math.abs(Math.sqrt(evaluator(radicand)(x)) - evaluator(right)(x)) < 1e-9);
    assert.equal(valid.length, 1, where);
    assert.equal(example.answer, `x = ${valid[0]}`, where);
    return { values: valid };
  }
  if (kind === 'plotted') {
    const [, dx, horizontal, dy, vertical] = example.prompt.match(/(\d+) units (left|right) of the origin and (\d+) units (up|down)/);
    const point = [Number(dx) * (horizontal === 'left' ? -1 : 1), Number(dy) * (vertical === 'down' ? -1 : 1)];
    assert.equal(example.answer, `(${point[0]}, ${point[1]})`, where);
    return { point };
  }
  if (kind === 'lines') {
    const [, first, second] = example.prompt.match(/^Where do y = (.+?) and y = (.+?) meet\?$/);
    const [, x, y] = example.answer.match(/^\((-?\d+), (-?\d+)\)$/).map(Number);
    assert.equal(evaluator(first)(x), y, where);
    assert.equal(evaluator(second)(x), y, where);
    return { point: [x, y] };
  }
  if (kind === 'numberLine') {
    const [, labels, target] = example.prompt.match(/labeled (.+)\. Which point shows (-?\d+)\?$/);
    assert.ok(labels.split(', ').includes(target), where);
    assert.equal(example.answer, target, where);
    return { values: [Number(target)] };
  }
  throw new Error(`no check for ${kind}`);
};
function toPiece(statement) {
  const [, relation, value] = statement.match(/^x (≤|≥|<|>) (-?[\d./]+)$/);
  const boundary = readNumber(value);
  return relation === '<' || relation === '≤'
    ? { min: -Infinity, max: boundary, minClosed: false, maxClosed: relation === '≤' }
    : { min: boundary, max: Infinity, minClosed: relation === '≥', maxClosed: false };
}

// This item's own answer, read independently, in the same shape.
const originalAnswer = (item) => {
  const { kind, question } = item;
  if (['graph', 'solve', 'factored', 'verbal'].includes(kind)) return { pieces: keyOf(question) };
  if (kind === 'linearInequality') return { pieces: [toPiece(item.solved.statement)] };
  if (kind === 'signChart') {
    const pieces = [];
    const { holds } = chartOracle(question);
    return { holds, pieces };
  }
  if (kind === 'radical') return { values: radicalOracle(question) };
  if (kind === 'plotted' || kind === 'lines') return { point: item.oracle[0].match(/-?\d+/g).map(Number) };
  if (kind === 'numberLine') return { values: [Number(question.target)] };
  return {};
};

// A few seeds per item: a sibling that is right for one draw only is not enough.
const SIBLING_SEEDS = [0, 7, 42];

test('similarProblem: a worked sibling of the same kind, correct by substitution, with a different answer', () => {
  for (const item of ITEMS.filter((entry) => KINDS_WITH_SIBLINGS.includes(entry.kind))) for (const seed of SIBLING_SEEDS) {
    const { question } = item;
    const label = `${item.label} (seed ${seed})`;
    const example = pointsAndIntervals.similarProblem(question, { seed });
    assert.ok(example, `${label}: a sibling`);
    assert.ok(example.steps.length >= 2 && example.prompt && example.answer, `${label}: worked in full`);
    assert.deepEqual(pointsAndIntervals.similarProblem(question, { seed }), example, `${label}: deterministic`);
    assert.notEqual(example.prompt, question.prompt);
    const sibling = verifySibling(item, example);
    const original = originalAnswer(item);
    if (sibling.pieces && original.pieces?.length) assert.equal(sameIntervals(sibling.pieces, original.pieces), false, `${label}: same answer set as the original`);
    if (sibling.pieces && original.holds) {
      assert.ok(SAMPLE_POINTS.some((x) => inSet(sibling.pieces, x) !== original.holds(x)), `${label}: the sibling's set is the original's`);
    }
    if (sibling.point) assert.notDeepEqual(sibling.point, original.point, `${label}: same point`);
    if (sibling.values && original.values) sibling.values.forEach((value) => assert.equal(original.values.includes(value), false, `${label}: shares ${value}`));
    const answers = answersFor(item).map((value) => value.toLowerCase());
    assert.equal(answers.includes(example.answer.toLowerCase()), false, `${label}: ${example.answer} is this question's answer`);
    example.steps.forEach((step) => assert.equal(hintRevealsAnswer(step, answersFor(item)), false, `${label}: step "${step}" names this question's answer`));
    const built = buildSimilarWorkedExample(question);
    assert.ok(built, `${label}: the platform offers it`);
  }
  // A point with nothing to work from has no sibling.
  ITEMS.filter((item) => item.kind === 'pointOnly').forEach(({ question, label }) => {
    assert.equal(pointsAndIntervals.similarProblem(question, { seed: 1 }), null, label);
    assert.equal(buildSimilarWorkedExample(question), null, label);
  });
});

/* ------------------------------------------------ back-up step */

test('backUpQuestion: a two-choice first move about this problem, the correct one offered, no answer named', () => {
  for (const item of ITEMS) {
    const { question, label } = item;
    const step = pointsAndIntervals.backUpQuestion(question);
    assert.ok(step, `${label}: a back-up step`);
    assert.equal(step.options.length, 2, label);
    assert.ok(step.options.includes(step.correct), `${label}: the correct option is offered`);
    const answers = answersFor(item);
    [step.prompt, ...step.options].forEach((value) => assert.equal(hintRevealsAnswer(value, answers), false, `${label}: "${value}" names the answer`));
    assert.equal(backUpStepFor(question).source, 'family', `${label}: the platform uses it`);
  }
  // The first move, conventionally: undo the constant before the coefficient.
  const solve = ITEMS.find((item) => item.label.startsWith('mm_gen_7_7_10B_greater-ray'));
  const step = pointsAndIntervals.backUpQuestion(solve.question);
  assert.match(step.correct, /^(Add|Subtract) \d+ on both sides$/);
  assert.match(step.options.find((option) => option !== step.correct), /^Divide both sides by/);
});
