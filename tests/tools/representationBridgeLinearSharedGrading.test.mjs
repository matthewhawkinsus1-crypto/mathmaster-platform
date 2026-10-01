/*
 * REPRESENTATION BRIDGE (linear mode) — ONE VERDICT, BROWSER AND SERVER.
 *
 * The linear bridge used to mark itself in the browser with
 * scoreRepresentationBridge and hand the server only its own verdict. It now
 * asks the shared grader (functions/shared/serverGrading/tools/
 * representationBridge/linear.mjs) through gradeToolCheck — the same function,
 * over the same bounded bytes, that gradeServerResponse runs on ingestion.
 *
 * Every fixture below is graded both ways and the two must agree exactly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import representationBridgeGrader from '../../functions/shared/serverGrading/tools/representationBridge.mjs';
import linearGraders from '../../functions/shared/serverGrading/tools/representationBridge/linear.mjs';
import linearDeclarations from '../../functions/shared/serverGrading/declarations/representationBridge/linear.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode, toolModeSupport } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { scoreRepresentationBridge } from '../../functions/shared/toolMath/representationBridge/representationBridgeMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

// ------------------------------------------------------------------ fixtures
const boothFeeContext = {
  inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
  rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
  yInterceptMeaning: 'starting profit after paying the booth fee',
  zeroMeaning: 'number of items that must be sold to break even',
};

const boothFeeQuestion = {
  id: 'rb-booth-fee',
  type: 'representationBridge',
  mode: 'linear',
  source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] },
  context: boothFeeContext,
  requiredStages: ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'],
  requiredComparisons: 3,
  graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 },
  feedbackTiming: 'checkpoint',
};

const correctMeaning = () => ({
  rate: { unit: 'dollars per item', contextMeaning: 'profit earned for each item sold', mathRole: 'rate of change / slope' },
  yIntercept: { unit: 'dollars', contextMeaning: 'starting profit after paying the booth fee', mathRole: 'y-intercept / constant term' },
  zero: { unit: 'items', contextMeaning: 'number of items that must be sold to break even', mathRole: 'zero / x-intercept' },
});

// Exactly what RepresentationBridge.jsx builds: every typed box is a string,
// plotted points are [x, y] number pairs.
const correctWork = () => ({
  tableEvidence: [
    { i: 0, j: 1, dx: '2', dy: '10', rate: '5' },
    { i: 1, j: 2, dx: '2', dy: '10', rate: '5' },
    { i: 2, j: 3, dx: '2', dy: '10', rate: '5' },
  ],
  studentSlope: '5',
  rateConclusion: 'constant',
  generalForm: { m: '5', b: '-20', equation: 'y = 5x - 20' },
  factoredForm: { a: '5', c: '4', equation: 'y = 5(x - 4)' },
  graphConstruction: { points: [[4, 0], [5, 5]] },
  meaningAssignments: correctMeaning(),
});

const blankWork = () => ({
  tableEvidence: [],
  studentSlope: '',
  rateConclusion: '',
  generalForm: { m: '', b: '', equation: '' },
  factoredForm: { a: '', c: '', equation: '' },
  graphConstruction: { points: [] },
  meaningAssignments: {},
});

const STAGES_AND_CONSISTENCY = ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning', 'crossRepresentationConsistency'];

// ------------------------------------------------------------------ helpers
const browserGrade = (question, work) => gradeToolCheck(representationBridgeGrader, question, work);
const serverGrade = (question, browser) => gradeServerResponse({
  question,
  response: JSON.parse(JSON.stringify(browser.toolResponse)),
});
const verdictOf = (result) => ({
  graded: result.graded,
  isCorrect: result.isCorrect,
  isComplete: result.isComplete,
  score: result.score,
  parts: result.parts,
});

/** Grade through the browser path and the server path; they must agree exactly. */
const gradeBothWays = (question, work) => {
  const browser = browserGrade(question, work);
  const server = serverGrade(question, browser);
  assert.deepEqual(verdictOf(server), verdictOf(browser), 'the server must reach the browser verdict from the same work');
  return { browser, server };
};
const partMap = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isCorrect]));
const completeMap = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isComplete]));

// ------------------------------------------------------------- declaration
test('linear mode is server-authoritative and every other mode value renders it', () => {
  assert.equal(linearDeclarations.linear.authority, GRADING_AUTHORITY.SHARED_SERVER);
  const declaration = GRADING_MANIFEST.representationBridge;
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.modes.linear.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(typeof linearGraders.linear, 'function');
  assert.deepEqual(Object.keys(linearGraders), ['linear']);

  // RepresentationBridge.jsx diverts to the Multiple Representations board
  // only for that exact mode string; anything else — missing, 'linear', an
  // unknown or mis-cased value — renders the linear bridge.
  const component = executableSource(readFileSync(new URL('../../src/tools/representationBridge/RepresentationBridge.jsx', import.meta.url), 'utf8'));
  const routing = region(component, 'export default function RepresentationBridge', 'const derived', 'the mode routing');
  assert.match(routing, /if \(questionData\.mode === 'linearMultipleRepresentations'\) \{\s*return <LinearMultipleRepresentationsBoard/);
  const componentMode = (question) => (question.mode === 'linearMultipleRepresentations' ? 'linearMultipleRepresentations' : 'linear');
  [
    {},
    { mode: 'linear' },
    { mode: undefined },
    { mode: null },
    { mode: '' },
    { mode: 'graphFirst' },
    { mode: 'LinearMultipleRepresentations' },
    { mode: 'linearMultipleRepresentations' },
  ].forEach((question) => {
    const full = { type: 'representationBridge', ...question };
    assert.equal(resolveToolMode(declaration, full), componentMode(full), JSON.stringify(question));
  });
  ['linear', undefined, 'somethingElse'].forEach((mode) => {
    const support = toolModeSupport(declaration, { type: 'representationBridge', mode });
    assert.equal(support.mode, 'linear');
    assert.equal(support.supported, true);
  });
});

// ------------------------------------------------------------- correct work
test('fully correct work is correct, complete and full credit on both paths', () => {
  const { browser, server } = gradeBothWays(boothFeeQuestion, correctWork());
  assert.equal(browser.graded, true);
  assert.equal(browser.isCorrect, true);
  assert.equal(browser.isComplete, true);
  assert.equal(browser.score, 1);
  assert.deepEqual(browser.parts.map((part) => part.id), STAGES_AND_CONSISTENCY);
  assert.ok(browser.parts.every((part) => part.isCorrect && part.isComplete));
  assert.equal(server.mode, 'linear');
  assert.equal(server.surfaceId, 'representationBridge');
});

test('the verdict is scoreRepresentationBridge, check for check (same parts, same score)', () => {
  const fixtures = [
    correctWork(),
    blankWork(),
    { ...correctWork(), factoredForm: { a: '5', c: '3', equation: 'y = 5(x - 3)' } },
    { ...correctWork(), graphConstruction: { points: [[5, 5], [6, 10]] } },
    { ...correctWork(), rateConclusion: 'not constant', studentSlope: '4' },
    { ...correctWork(), generalForm: { m: '5', b: '-20', equation: '5x - y = 20' } },
  ];
  fixtures.forEach((work) => {
    const legacy = scoreRepresentationBridge(boothFeeQuestion, work);
    const { browser } = gradeBothWays(boothFeeQuestion, work);
    assert.deepEqual(partMap(browser), legacy.parts);
    assert.equal(browser.isCorrect, legacy.isCorrect);
    assert.equal(browser.score, legacy.score);
  });
});

test('generated browser-shaped work: the shared grader agrees with scoreRepresentationBridge every time', () => {
  // A deterministic sweep over the inputs the bridge can actually produce —
  // typed text near, at and away from each value, intervals in any direction,
  // two snapped points, meanings picked from the banks — across tables,
  // stage subsets, comparison counts and tolerances. The reader in front of
  // the scorer must never move a verdict.
  let seed = 20261001;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (values) => values[Math.floor(random() * values.length)];
  const typed = (value) => pick([String(value), String(value), `${value * 2}/2`, '', String(value + 1), ` ${value} `, `${value}.0`, 'abc']);
  const units = [boothFeeContext.rateUnit, boothFeeContext.outputUnit, boothFeeContext.inputUnit];
  const meanings = [boothFeeContext.rateMeaning, boothFeeContext.yInterceptMeaning, boothFeeContext.zeroMeaning];
  const roles = ['rate of change / slope', 'y-intercept / constant term', 'zero / x-intercept'];
  const stats = { correct: 0, parts: {} };
  for (let index = 0; index < 160; index += 1) {
    const m = pick([5, -3, 2, 0.5, -1.5]);
    const zero = pick([4, -2, 3, 1.5]);
    const b = -m * zero;
    const rows = Array.from({ length: pick([3, 4, 5]) }, (_, k) => ({ x: k * 2 - 2, y: m * (k * 2 - 2) + b }));
    const question = {
      type: 'representationBridge',
      source: { kind: 'table', rows },
      context: boothFeeContext,
      ...(random() < 0.6 ? { requiredStages: STAGES_AND_CONSISTENCY.slice(0, 5).filter(() => random() < 0.7) } : {}),
      ...(random() < 0.5 ? { requiredComparisons: pick([1, 2, 3, 10]) } : {}),
      ...(random() < 0.3 ? { tolerance: pick([0.12, 0.3]) } : {}),
    };
    const tableEvidence = [];
    for (let k = 0; k < pick([0, 2, 3, 3, 4]); k += 1) {
      const i = Math.floor(random() * rows.length);
      const j = (i + 1 + Math.floor(random() * (rows.length - 1))) % rows.length;
      if (tableEvidence.some((entry) => Math.min(entry.i, entry.j) === Math.min(i, j) && Math.max(entry.i, entry.j) === Math.max(i, j))) continue;
      const dx = Math.abs(rows[j].x - rows[i].x);
      const dy = (rows[j].x > rows[i].x ? 1 : -1) * (rows[j].y - rows[i].y);
      tableEvidence.push({ i, j, dx: random() < 0.85 ? String(dx) : typed(dx), dy: random() < 0.85 ? String(dy) : typed(dy), rate: random() < 0.85 ? String(m) : typed(m) });
    }
    const right = random() < 0.5;
    const meaningAssignments = Object.fromEntries(['rate', 'yIntercept', 'zero'].map((id, k) => [id, {
      unit: right ? units[k] : pick(units), contextMeaning: right ? meanings[k] : pick(meanings), mathRole: right ? roles[k] : pick([...roles, '']),
    }]));
    const work = {
      tableEvidence,
      studentSlope: right ? String(m) : typed(m),
      rateConclusion: pick(['constant', 'constant', 'not constant', '']),
      generalForm: { m: right ? String(m) : typed(m), b: right ? String(b) : typed(b), equation: pick([`y = ${m}x + ${b}`, `y = ${b} + ${m}x`, `y = ${m}x + ${b + 1}`, `y = ${m}(x - ${zero})`, '']) },
      factoredForm: { a: right ? String(m) : typed(m), c: right ? String(zero) : typed(zero), equation: pick([`y = ${m}(x - ${zero})`, `y = ${m}(x - ${zero + 1})`, `y = ${m}x + ${b}`, '']) },
      graphConstruction: { points: pick([[], [[zero, 0]], [[zero, 0], [zero + 1, m]], [[zero + 0.5, m / 2], [zero + 1, m]], [[0, b], [zero, 0]]]) },
      meaningAssignments,
    };
    const legacy = scoreRepresentationBridge(question, work);
    const { browser } = gradeBothWays(question, work);
    assert.deepEqual(partMap(browser), legacy.parts, `case ${index}`);
    assert.equal(browser.isCorrect, legacy.isCorrect, `case ${index}`);
    assert.equal(browser.score, legacy.score, `case ${index}`);
    if (browser.isCorrect) stats.correct += 1;
    Object.entries(legacy.parts).forEach(([id, ok]) => { stats.parts[id] = (stats.parts[id] || 0) + (ok ? 1 : 0); });
  }
  // The sweep reaches correct boards and both verdicts of every stage.
  assert.ok(stats.correct > 0, 'some generated boards are fully correct');
  STAGES_AND_CONSISTENCY.forEach((id) => assert.ok(stats.parts[id] > 0, `some generated ${id} is correct`));
});

test('equivalent forms the bridge accepts are accepted on both paths', () => {
  const work = {
    ...correctWork(),
    // Intervals in any order, either direction, numbers typed as fractions
    // or decimals, or sent as plain numbers.
    tableEvidence: [
      { i: 3, j: 2, dx: '2.0', dy: '20/2', rate: '10/2' },
      { i: 0, j: 1, dx: 2, dy: 10, rate: 5 },
      { i: 2, j: 1, dx: '4/2', dy: '10', rate: '5.0' },
    ],
    studentSlope: '10/2',
    generalForm: { m: '5.0', b: '-40/2', equation: 'y = -20 + 5x' },
    factoredForm: { a: '+5', c: '8/2', equation: 'y=5(x-4)' },
    graphConstruction: { points: [[5, 5], [4, 0]] },
    meaningAssignments: {
      rate: { unit: 'Dollars  per item', contextMeaning: ' profit earned for each item sold ', mathRole: 'Rate of change / slope' },
      yIntercept: correctMeaning().yIntercept,
      zero: correctMeaning().zero,
    },
  };
  const { browser } = gradeBothWays(boothFeeQuestion, work);
  assert.equal(browser.isCorrect, true);
  assert.equal(browser.score, 1);

  ['y=5x-20', 'y = 5*x - 20', 'y = 5x + -20'].forEach((equation) => {
    const result = gradeBothWays(boothFeeQuestion, { ...correctWork(), generalForm: { m: '5', b: '-20', equation } }).browser;
    assert.equal(partMap(result).generalForm, true, equation);
  });
  ['y = 5 (x - 4)', 'y = 5*(x - 4)'].forEach((equation) => {
    const result = gradeBothWays(boothFeeQuestion, { ...correctWork(), factoredForm: { a: '5', c: '4', equation } }).browser;
    assert.equal(partMap(result).factoredForm, true, equation);
  });
});

// ------------------------------------------------------------ incorrect work
test('incorrect work is incorrect, and contradictory representations cost consistency', () => {
  const work = { ...correctWork(), factoredForm: { a: '5', c: '3', equation: 'y = 5(x - 3)' } };
  const { browser } = gradeBothWays(boothFeeQuestion, work);
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.isComplete, true, 'every box is filled; it is just wrong');
  assert.equal(partMap(browser).factoredForm, false);
  assert.equal(partMap(browser).crossRepresentationConsistency, false);
  assert.equal(browser.score, 4 / 6);
});

test('a correct line without the x-intercept anchor, and a standard-form equation, are marked wrong', () => {
  const noAnchor = gradeBothWays(boothFeeQuestion, { ...correctWork(), graphConstruction: { points: [[5, 5], [6, 10]] } }).browser;
  assert.equal(partMap(noAnchor).graph, false);
  assert.equal(noAnchor.isComplete, true);
  const standard = gradeBothWays(boothFeeQuestion, { ...correctWork(), generalForm: { m: '5', b: '-20', equation: '5x - y = 20' } }).browser;
  assert.equal(partMap(standard).generalForm, false);
  const notConstant = gradeBothWays(boothFeeQuestion, { ...correctWork(), rateConclusion: 'not constant' }).browser;
  assert.equal(partMap(notConstant).rateEvidence, false);
});

test('representations that disagree fail the bridge even when every stage passes on its own', () => {
  // A graph within the construction tolerance (0.12) of y = 0.5x - 1 passes
  // the graph stage, but its line, y = 0.5x - 1.05, is not the general-form
  // line the student wrote. Only crossRepresentationConsistency fails, and
  // that alone keeps the bridge from being correct.
  const shallow = {
    type: 'representationBridge',
    source: { kind: 'table', rows: [{ x: 0, y: -1 }, { x: 2, y: 0 }, { x: 4, y: 1 }, { x: 6, y: 2 }] },
    requiredStages: ['generalForm', 'graph'],
  };
  const work = { generalForm: { m: '0.5', b: '-1', equation: 'y = 0.5x - 1' }, graphConstruction: { points: [[2.1, 0], [4.1, 1]] } };
  const { browser } = gradeBothWays(shallow, work);
  assert.deepEqual(partMap(browser), { generalForm: true, graph: true, crossRepresentationConsistency: false });
  assert.equal(browser.isComplete, true);
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.score, 2 / 3);
  const legacy = scoreRepresentationBridge(shallow, work);
  assert.equal(browser.isCorrect, legacy.isCorrect);
  assert.equal(browser.score, legacy.score);
  // The same graph on the exact line is consistent and correct.
  const exact = gradeBothWays(shallow, { ...work, graphConstruction: { points: [[2, 0], [4, 1]] } }).browser;
  assert.equal(exact.isCorrect, true);
});

test('a recorded interval with a wrong rate, or the same interval twice, fails the table stage', () => {
  const wrongRate = correctWork();
  wrongRate.tableEvidence[1] = { ...wrongRate.tableEvidence[1], rate: '4' };
  assert.equal(partMap(gradeBothWays(boothFeeQuestion, wrongRate).browser).rateEvidence, false);

  const duplicate = correctWork();
  duplicate.tableEvidence.push({ i: 1, j: 0, dx: '2', dy: '10', rate: '5' });
  assert.equal(partMap(gradeBothWays(boothFeeQuestion, duplicate).browser).rateEvidence, false);
});

// ------------------------------------------------- partial and incomplete work
test('partial work earns the bridge\'s own partial credit and reports what is missing', () => {
  const work = {
    ...blankWork(),
    tableEvidence: correctWork().tableEvidence,
    studentSlope: '5',
    rateConclusion: 'constant',
    meaningAssignments: correctMeaning(),
  };
  const { browser } = gradeBothWays(boothFeeQuestion, work);
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.isComplete, false);
  assert.deepEqual(completeMap(browser), {
    rateEvidence: true, generalForm: false, factoredForm: false, graph: false, meaning: true, crossRepresentationConsistency: true,
  });
  assert.deepEqual(partMap(browser), {
    rateEvidence: true, generalForm: false, factoredForm: false, graph: false, meaning: true, crossRepresentationConsistency: false,
  });
  // Two stages of six: with no line written there is no agreement to credit.
  assert.equal(browser.score, 2 / 6);
});

test('a blank board earns nothing: agreement is credited only between lines the student wrote', () => {
  // scoreRepresentationBridge used to count crossRepresentationConsistency as
  // satisfied whenever fewer than two lines parsed, so a blank board scored
  // 1/(stages + 1) and could be submitted for it outside checkpoint timing.
  const all = gradeBothWays(boothFeeQuestion, blankWork());
  assert.equal(all.browser.isComplete, false);
  assert.equal(all.browser.isCorrect, false);
  assert.equal(all.browser.score, 0);
  assert.equal(all.server.score, 0);

  // One correct line is not agreement either.
  const oneLine = gradeBothWays(boothFeeQuestion, { ...blankWork(), generalForm: correctWork().generalForm }).browser;
  assert.equal(partMap(oneLine).generalForm, true);
  assert.equal(partMap(oneLine).crossRepresentationConsistency, false);
  assert.equal(oneLine.score, 1 / 6);

  // Two agreeing lines earn it.
  const twoLines = gradeBothWays(boothFeeQuestion, { ...blankWork(), generalForm: correctWork().generalForm, factoredForm: correctWork().factoredForm }).browser;
  assert.equal(partMap(twoLines).crossRepresentationConsistency, true);

  // A question with fewer than two line-bearing stages has nothing to compare:
  // the part is not scored, so a blank single stage is 0 and a wrong single
  // line is not half right.
  const single = gradeBothWays({ ...boothFeeQuestion, requiredStages: ['meaning'] }, blankWork()).browser;
  assert.deepEqual(single.parts.map((part) => part.id), ['meaning']);
  assert.equal(single.score, 0);
  const wrongLine = gradeBothWays(
    { ...boothFeeQuestion, requiredStages: ['generalForm'] },
    { ...blankWork(), generalForm: { m: '1', b: '1', equation: 'y = x + 1' } },
  );
  assert.deepEqual(wrongLine.browser.parts.map((part) => part.id), ['generalForm']);
  assert.equal(wrongLine.browser.score, 0);
  assert.equal(wrongLine.server.score, 0);
  const rightLine = gradeBothWays({ ...boothFeeQuestion, requiredStages: ['generalForm'] }, { ...blankWork(), generalForm: correctWork().generalForm }).browser;
  assert.equal(rightLine.isCorrect, true);
  assert.equal(rightLine.score, 1);
});

test('completeness names every required input: intervals, boxes, both points, every meaning', () => {
  const twoIntervals = { ...correctWork(), tableEvidence: correctWork().tableEvidence.slice(0, 2) };
  const twoResult = gradeBothWays(boothFeeQuestion, twoIntervals).browser;
  assert.equal(completeMap(twoResult).rateEvidence, false, 'requiredComparisons is 3');
  assert.equal(partMap(twoResult).rateEvidence, false);

  const blankRate = correctWork();
  blankRate.tableEvidence[2] = { ...blankRate.tableEvidence[2], rate: '' };
  assert.equal(completeMap(gradeBothWays(boothFeeQuestion, blankRate).browser).rateEvidence, false);

  const noConclusion = gradeBothWays(boothFeeQuestion, { ...correctWork(), rateConclusion: '' }).browser;
  assert.equal(completeMap(noConclusion).rateEvidence, false);

  const noEquation = gradeBothWays(boothFeeQuestion, { ...correctWork(), generalForm: { m: '5', b: '-20', equation: '  ' } }).browser;
  assert.equal(completeMap(noEquation).generalForm, false);

  const noC = gradeBothWays(boothFeeQuestion, { ...correctWork(), factoredForm: { a: '5', c: '', equation: 'y = 5(x - 4)' } }).browser;
  assert.equal(completeMap(noC).factoredForm, false);

  const onePoint = gradeBothWays(boothFeeQuestion, { ...correctWork(), graphConstruction: { points: [[4, 0]] } }).browser;
  assert.equal(completeMap(onePoint).graph, false);
  assert.equal(partMap(onePoint).graph, false);

  const meaning = correctMeaning();
  delete meaning.zero.mathRole;
  const missingRole = gradeBothWays(boothFeeQuestion, { ...correctWork(), meaningAssignments: meaning }).browser;
  assert.equal(completeMap(missingRole).meaning, false);

  // A recorded interval that names no row of this table (a draft saved before
  // the table was edited) is not one of the required intervals.
  const strayRow = correctWork();
  strayRow.tableEvidence[2] = { i: 2, j: 9, dx: '2', dy: '10', rate: '5' };
  const strayResult = gradeBothWays(boothFeeQuestion, strayRow).browser;
  assert.equal(completeMap(strayResult).rateEvidence, false);
  assert.equal(partMap(strayResult).rateEvidence, false);

  // An explicit Check on incomplete work is still a graded (incorrect) attempt.
  [twoResult, onePoint, missingRole, strayResult].forEach((result) => {
    assert.equal(result.graded, true);
    assert.equal(result.isComplete, false);
    assert.equal(result.isCorrect, false);
  });
});

test('every single box is required: blanking any one leaves exactly its stage incomplete', () => {
  // [stage, how to blank one box]. A wrong-typed value (true, an array, an
  // object) is not an entry either.
  const blanks = [];
  ['', '   ', true, [5], { value: 5 }].forEach((empty) => {
    blanks.push(
      ['rateEvidence', (work) => { work.studentSlope = empty; }],
      ['rateEvidence', (work) => { work.rateConclusion = empty; }],
      ['rateEvidence', (work) => { work.tableEvidence[0].dx = empty; }],
      ['rateEvidence', (work) => { work.tableEvidence[1].dy = empty; }],
      ['generalForm', (work) => { work.generalForm.m = empty; }],
      ['generalForm', (work) => { work.generalForm.b = empty; }],
      ['generalForm', (work) => { work.generalForm.equation = empty; }],
      ['factoredForm', (work) => { work.factoredForm.a = empty; }],
      ['factoredForm', (work) => { work.factoredForm.c = empty; }],
      ['factoredForm', (work) => { work.factoredForm.equation = empty; }],
      ...['rate', 'yIntercept', 'zero'].flatMap((id) => ['unit', 'contextMeaning', 'mathRole']
        .map((dimension) => ['meaning', (work) => { work.meaningAssignments[id][dimension] = empty; }])),
    );
  });
  blanks.forEach(([stage, blank], index) => {
    const work = correctWork();
    blank(work);
    const { browser } = gradeBothWays(boothFeeQuestion, work);
    const expected = Object.fromEntries(STAGES_AND_CONSISTENCY.map((id) => [id, id !== stage]));
    assert.deepEqual(completeMap(browser), expected, `case ${index}: ${blank}`);
    assert.equal(browser.isComplete, false, `case ${index}`);
    assert.equal(partMap(browser)[stage], false, `case ${index}: a blank box is never correct`);
    assert.equal(browser.isCorrect, false, `case ${index}`);
  });
});

// ------------------------------------------------- malformed and tampered work
test('injected verdicts and answer keys are dropped and change nothing', () => {
  const injected = {
    ...blankWork(),
    isCorrect: true,
    score: 1,
    checks: [true, true, true],
    expected: { m: 5, b: -20 },
    generalForm: { m: '', b: '', equation: '', isCorrect: true, expected: 'y = 5x - 20' },
    graphConstruction: { points: [], correct: true },
  };
  assert.deepEqual(boundToolWork(injected).dropped.sort(), ['checks', 'correct', 'expected', 'isCorrect', 'score']);
  const { browser } = gradeBothWays(boothFeeQuestion, injected);
  const clean = gradeBothWays(boothFeeQuestion, blankWork()).browser;
  assert.deepEqual(verdictOf(browser), verdictOf(clean));
  assert.equal(browser.isCorrect, false);
});

test('fields of the wrong type are blank boxes: graded, incorrect, never a crash or a coerced match', () => {
  const tampered = [
    { studentSlope: [5], generalForm: 'y = 5x - 20' },
    { tableEvidence: 'all of them', meaningAssignments: ['dollars per item'] },
    { tableEvidence: [null, 5, 'x', { i: '0', j: '1', dx: '2', dy: '10', rate: '5' }, { i: 0.5, j: -1 }] },
    { graphConstruction: { points: [['4', '0'], [5], 'x', null, [4, 0, 1], [{}, 5]] } },
    { graphConstruction: 'two points' },
    { factoredForm: { a: { value: 5 }, c: [4], equation: ['y = 5(x - 4)'] } },
    { meaningAssignments: { rate: 'dollars per item', zero: { unit: ['items'], contextMeaning: true, mathRole: 7 } } },
  ];
  tampered.forEach((work) => {
    const { browser } = gradeBothWays(boothFeeQuestion, work);
    assert.equal(browser.graded, true, JSON.stringify(work));
    assert.equal(browser.isCorrect, false, JSON.stringify(work));
    assert.equal(browser.isComplete, false, JSON.stringify(work));
  });
  // An array is not the slope 5, though String([5]) would read as "5".
  const slopeArray = gradeBothWays(boothFeeQuestion, { ...correctWork(), studentSlope: [5] }).browser;
  assert.equal(partMap(slopeArray).rateEvidence, false);
  const slopeText = gradeBothWays(boothFeeQuestion, { ...correctWork(), studentSlope: '5' }).browser;
  assert.equal(partMap(slopeText).rateEvidence, true);
  // A string row index is not a row.
  const stringIndex = correctWork();
  stringIndex.tableEvidence[0] = { ...stringIndex.tableEvidence[0], i: '0' };
  assert.equal(partMap(gradeBothWays(boothFeeQuestion, stringIndex).browser).rateEvidence, false);
  // A plotted point is a pair of numbers. String coordinates would be coerced
  // into the true anchor by the construction grader, so they are not points:
  // the graph is neither complete nor correct.
  const stringPoints = gradeBothWays(boothFeeQuestion, { ...correctWork(), graphConstruction: { points: [['4', '0'], ['5', '5']] } }).browser;
  assert.equal(partMap(stringPoints).graph, false);
  assert.equal(completeMap(stringPoints).graph, false);
  assert.equal(stringPoints.isComplete, false);
});

test('non-object work is ungraded on both paths', () => {
  [null, undefined, [], ['tableEvidence'], 'y = 5x - 20', 5, true].forEach((work) => {
    const browser = browserGrade(boothFeeQuestion, work);
    assert.equal(browser.graded, false, JSON.stringify(work));
    assert.equal(browser.isCorrect, false);
    assert.equal(browser.score, 0);
    const server = serverGrade(boothFeeQuestion, browser);
    assert.equal(server.graded, false, JSON.stringify(work));
    assert.equal(server.isCorrect, false);
  });
  // A response that is not this tool's is never read as bridge work.
  const browser = browserGrade(boothFeeQuestion, correctWork());
  const foreign = gradeServerResponse({ question: boothFeeQuestion, response: { ...browser.toolResponse, toolId: 'graphing2' } });
  assert.equal(foreign.graded, false);
  assert.equal(foreign.reason, 'response-tool-mismatch');
});

test('oversize work is refused, not truncated and graded', () => {
  const huge = {
    ...correctWork(),
    tableEvidence: Array.from({ length: 60 }, (_, index) => ({ i: index % 4, j: (index + 1) % 4, dx: '2'.repeat(500), dy: '10', rate: '5' })),
  };
  const browser = browserGrade(boothFeeQuestion, huge);
  assert.equal(browser.graded, false);
  assert.equal(browser.reason, 'oversize-response');
  assert.equal(browser.toolResponse.oversize, true);
  const server = serverGrade(boothFeeQuestion, browser);
  assert.equal(server.graded, false);
  assert.equal(server.reason, 'oversize-response');
});

test('realistic maximal work fits the response contract and carries nothing that is dropped', () => {
  // Eight rows, every one of the 28 intervals recorded with fraction text,
  // long typed equations, both points, every meaning.
  const rows = Array.from({ length: 8 }, (_, index) => ({ x: index * 3 - 6, y: (index * 3 - 6) * 7 / 3 + 11 / 3 }));
  const question = { ...boothFeeQuestion, source: { kind: 'table', rows }, graphBounds: undefined };
  const tableEvidence = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) tableEvidence.push({ i, j, dx: `${(j - i) * 3}/1`, dy: `${(j - i) * 7}/1`, rate: '7/3' });
  }
  const work = {
    tableEvidence,
    studentSlope: '7/3',
    rateConclusion: 'constant',
    generalForm: { m: '7/3', b: '11/3', equation: `y = (7/3)x + 11/3${' '.repeat(120)}` },
    factoredForm: { a: '7/3', c: '-11/7', equation: `y = (7/3)(x - (-11/7))${' '.repeat(120)}` },
    graphConstruction: { points: [[-1.5714285714285714, 0], [1.4285714285714286, 7]] },
    meaningAssignments: correctMeaning(),
  };
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 4);
  assert.deepEqual(boundToolWork(correctWork()).dropped, []);
  assert.deepEqual(boundToolWork(blankWork()).dropped, []);
  const { browser } = gradeBothWays(question, work);
  assert.equal(browser.graded, true);
  assert.equal(partMap(browser).rateEvidence, true);
  assert.equal(completeMap(browser).rateEvidence, true);
});

// ------------------------------------------------- unauthored question fields
test('unauthored fields grade with the bridge\'s own defaults', () => {
  const { requiredStages: _stages, requiredComparisons: _comparisons, graphBounds: _bounds, feedbackTiming: _timing, ...bare } = boothFeeQuestion;

  // requiredStages: every stage.
  const everyStage = gradeBothWays(bare, correctWork()).browser;
  assert.deepEqual(everyStage.parts.map((part) => part.id), STAGES_AND_CONSISTENCY);
  assert.equal(everyStage.isCorrect, true);

  // requiredComparisons: 3 distinct intervals.
  const two = gradeBothWays(bare, { ...correctWork(), tableEvidence: correctWork().tableEvidence.slice(0, 2) }).browser;
  assert.equal(partMap(two).rateEvidence, false);
  assert.equal(completeMap(two).rateEvidence, false);

  // ...clamped to the pairs a three-row table has.
  const threeRows = { ...bare, source: { kind: 'table', rows: boothFeeQuestion.source.rows.slice(0, 3) }, requiredComparisons: 10, requiredStages: ['rateEvidence'] };
  const threeRowWork = {
    ...blankWork(),
    tableEvidence: [{ i: 0, j: 1, dx: '2', dy: '10', rate: '5' }, { i: 1, j: 2, dx: '2', dy: '10', rate: '5' }, { i: 0, j: 2, dx: '4', dy: '20', rate: '5' }],
    studentSlope: '5',
    rateConclusion: 'constant',
  };
  const clamped = gradeBothWays(threeRows, threeRowWork).browser;
  assert.equal(clamped.isCorrect, true);
  assert.equal(clamped.isComplete, true);

  // tolerance: 0.12 for the graph.
  const shallow = { ...bare, source: { kind: 'table', rows: [{ x: 0, y: -1 }, { x: 2, y: 0 }, { x: 4, y: 1 }, { x: 6, y: 2 }] }, requiredStages: ['graph'] };
  assert.equal(partMap(gradeBothWays(shallow, { graphConstruction: { points: [[2.1, 0], [4.1, 1]] } }).browser).graph, true);
  assert.equal(partMap(gradeBothWays(shallow, { graphConstruction: { points: [[2.2, 0], [4.2, 1]] } }).browser).graph, false);
  assert.equal(partMap(gradeBothWays({ ...shallow, tolerance: 0.25 }, { graphConstruction: { points: [[2.2, 0], [4.2, 1]] } }).browser).graph, true);

  // feedbackTiming changes when Submit is enabled, never the verdict.
  const reference = verdictOf(gradeBothWays(bare, blankWork()).browser);
  ['guided', 'checkpoint', 'submitOnly', 'unknown'].forEach((feedbackTiming) => {
    assert.deepEqual(verdictOf(gradeBothWays({ ...bare, feedbackTiming }, blankWork()).browser), reference);
  });
});

test('a question with no table at all is graded (incorrect), not a crash', () => {
  const bare = { type: 'representationBridge' };
  const { browser, server } = gradeBothWays(bare, correctWork());
  assert.equal(browser.graded, true);
  assert.equal(browser.isCorrect, false);
  assert.equal(server.mode, 'linear');
});

// ------------------------------------------------------------- discrimination
test('correct work fails against a question whose key differs', () => {
  const right = gradeBothWays(boothFeeQuestion, correctWork()).browser;
  assert.equal(right.isCorrect, true);

  // The same table shifted up by 5: y = 5x - 15, zero at 3.
  const shifted = { ...boothFeeQuestion, source: { kind: 'table', rows: boothFeeQuestion.source.rows.map((row) => ({ x: row.x, y: row.y + 5 })) } };
  const againstShifted = gradeBothWays(shifted, correctWork()).browser;
  assert.equal(againstShifted.isCorrect, false);
  assert.equal(partMap(againstShifted).generalForm, false);
  assert.equal(partMap(againstShifted).factoredForm, false);
  assert.equal(partMap(againstShifted).graph, false);

  // A different rate with the same zero: y = 4x - 16. Every recorded Δy and
  // rate is checked against the table itself.
  const flatter = { ...boothFeeQuestion, source: { kind: 'table', rows: boothFeeQuestion.source.rows.map((row) => ({ x: row.x, y: 4 * row.x - 16 })) } };
  const againstFlatter = gradeBothWays(flatter, correctWork()).browser;
  assert.equal(againstFlatter.isCorrect, false);
  assert.equal(partMap(againstFlatter).rateEvidence, false);
  assert.equal(partMap(againstFlatter).factoredForm, false);

  // A different meaning key.
  const swapped = { ...boothFeeQuestion, context: { ...boothFeeContext, rateUnit: 'items per dollar' } };
  const againstSwapped = gradeBothWays(swapped, correctWork()).browser;
  assert.equal(partMap(againstSwapped).meaning, false);
  assert.equal(againstSwapped.isCorrect, false);
});

// ------------------------------------------------------- nothing leaks a key
test('the result carries student work only — no derived line, anchor or evidence', () => {
  const wrongGraph = { ...correctWork(), graphConstruction: { points: [[6, 10], [7, 15]] } };
  const { browser, server } = gradeBothWays(boothFeeQuestion, wrongGraph);
  [browser, server].forEach((result) => {
    const { toolResponse: _response, ...rest } = result;
    const json = JSON.stringify(rest);
    assert.doesNotMatch(json, /"(evidence|derived|anchors|interceptEvidence|canonicalFacts|expected|solution)"/);
    // The true x-intercept (4, 0) appears nowhere: the student plotted (6, 10) and (7, 15).
    assert.doesNotMatch(json, /\(4, 0\)|\[4,0\]/);
    assert.equal(result.parts.find((part) => part.id === 'graph').response, '(6, 10) (7, 15)');
  });
});

// ------------------------------------------------------- the component wiring
test('RepresentationBridge marks Submit, live stage checks and deadline work with the shared grader', () => {
  const source = executableSource(readFileSync(new URL('../../src/tools/representationBridge/RepresentationBridge.jsx', import.meta.url), 'utf8'));
  assert.match(source, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(source, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  assert.match(source, /import representationBridgeGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/representationBridge\.mjs';/);
  // No second definition of correctness in the component.
  assert.doesNotMatch(source, /scoreRepresentationBridge/);

  // Submit: the verdict, score and parts all come from the shared grader, and
  // the work it submits is the work it graded.
  const check = region(source, 'const check = () => {', 'const highlightControls', 'the Submit handler');
  assert.match(check, /const result = gradeToolCheck\(representationBridgeGrader, questionData, work\);/);
  assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{[^}]*parts: result\.parts[^}]*\}\);/);
  assert.doesNotMatch(check, /evidence|anchors|derived|liveResult/, 'no answer-key material in the submit metadata');

  // Live stage checks (and the checkpoint gate on Submit) read the same grader.
  assert.match(source, /const liveGrade = useMemo\(\(\) => gradeToolCheck\(representationBridgeGrader, questionData, work\), \[questionData, work\]\);/);
  assert.match(source, /parts: Object\.fromEntries\(liveGrade\.parts\.map\(\(part\) => \[part\.id, part\.isCorrect === true\]\)\)/);

  // Deadlines see the same work object Submit sends.
  assert.match(source, /useReportToolWork\(work\);/);
  const workMemo = region(source, 'const work = useMemo(() => ({', '}), [', 'the work memo');
  ['tableEvidence', 'studentSlope', 'rateConclusion', 'generalForm:', 'factoredForm:', 'graphConstruction:', 'meaningAssignments'].forEach((field) => {
    assert.ok(workMemo.includes(field), `work carries ${field}`);
  });
  assert.doesNotMatch(workMemo, /stageChecks|staging|selectedRows/, 'gating state is not work');

  // The on-screen "Recheck" list reads the shared grader's part array.
  assert.match(source, /feedback\.metadata\.parts : \[\]\)\.filter\(\(part\) => !part\.isCorrect\)/);
});
