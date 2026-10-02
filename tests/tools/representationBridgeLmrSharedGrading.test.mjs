/*
 * SERVER-AUTHORITATIVE GRADING PARITY — the Multiple Representations board
 * (representationBridge, mode "linearMultipleRepresentations").
 *
 * The board's Submit, QuestionEngine's recorded verdict and the server all mark
 * the board with ONE function: serverGrading/tools/representationBridge/lmr.mjs,
 * which wraps scoreLinearMultipleRepresentations. Every fixture here is marked
 * twice —
 *
 *   browser  gradeToolCheck(grader, question, work)   what the board does on Submit
 *   server   gradeServerResponse({ question, response: <the bytes the browser sent> })
 *
 * — and the two must agree exactly on graded, isCorrect, isComplete, score and
 * parts. Fixtures are the real assignment
 * (docs/assignments/algebra1-linear-multiple-representations-final-v5.json),
 * including the one-attempt DOL that automatic Recovery depends on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import grader from '../../functions/shared/serverGrading/tools/representationBridge.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/representationBridge.mjs';
import lmrDeclaration from '../../functions/shared/serverGrading/declarations/representationBridge/lmr.mjs';
import lmrGraders from '../../functions/shared/serverGrading/tools/representationBridge/lmr.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { allRegisteredQuestionFamilies } from '../../functions/shared/questionFamilyRegistry.mjs';
import {
  deriveLinearMultipleRepresentations,
  parsePointSlopeForm,
  resolveExpectedDomain,
  resolveGraph3Anchor,
  scoreLinearMultipleRepresentations,
  unfinishedLinearMultipleRepresentationsParts,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const MODE = 'linearMultipleRepresentations';
const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const ASSIGNMENT = JSON.parse(read('docs/assignments/algebra1-linear-multiple-representations-final-v5.json'));
const QUESTIONS = Object.fromEntries(ASSIGNMENT.sections.flatMap((section) => section.questions)
  .filter((question) => question.mode === MODE)
  .map((question) => [question.questionId, question]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const sample = (id) => clone(QUESTIONS[id]);
const synthetic = (source, extra = {}) => ({ questionId: 'lmr-synthetic', type: 'representationBridge', mode: MODE, prompt: 'Build every representation.', source, ...extra });

// The board's own initial state: every answer field, four blank table rows,
// empty graphs. Anything a fixture does not fill stays exactly like this.
const BLANK_ROWS = () => [{ x: '', y: '' }, { x: '', y: '' }, { x: '', y: '' }, { x: '', y: '' }];
const board = (overrides = {}) => ({
  standardFormEquation: '',
  slopeInterceptEquation: '',
  pointSlopeEquation: '',
  featureSlope: '',
  featureXIntercept: '',
  featureYIntercept: '',
  featurePoint1: '',
  featurePoint2: '',
  tableRows: BLANK_ROWS(),
  graph1Points: [],
  graph2Points: [],
  graph3Points: [],
  contextIndependent: '',
  contextDependent: '',
  contextSlopeMeaning: '',
  contextYInterceptMeaning: '',
  contextXInterceptMeaning: '',
  contextDomain: '',
  ...overrides,
});

// A complete, correct board per sample question, in the LaTeX MathLive emits.
const CORRECT = {
  'lmr-cw-1': board({
    slopeInterceptEquation: 'y=\\frac{1}{2}x-3',
    pointSlopeEquation: 'y+2=\\frac{1}{2}\\left(x-2\\right)',
    featureSlope: '\\frac{1}{2}',
    featureXIntercept: '\\left(6,0\\right)',
    featureYIntercept: '\\left(0,-3\\right)',
    featurePoint1: '\\left(2,-2\\right)',
    featurePoint2: '\\left(4,-1\\right)',
    tableRows: [{ x: '0', y: '-3' }, { x: '2', y: '-2' }, { x: '4', y: '-1' }, { x: '1', y: '-5/2' }],
    graph1Points: [[6, 0], [0, -3]],
    graph2Points: [[0, -3], [2, -2]],
    graph3Points: [[2, -2], [4, -1]],
  }),
  'lmr-cw-2': board({
    standardFormEquation: '2x+y=4',
    pointSlopeEquation: 'y-0=-2\\left(x-2\\right)',
    featureSlope: '-2',
    featureXIntercept: '(2, 0)',
    featureYIntercept: '(0, 4)',
    featurePoint1: '(1, 2)',
    featurePoint2: '(3, -2)',
    tableRows: [{ x: '0', y: '4' }, { x: '1', y: '2' }, { x: '2', y: '0' }, { x: '3', y: '-2' }],
    graph1Points: [[2, 0], [0, 4]],
    graph2Points: [[0, 4], [1, 2]],
    graph3Points: [[2, 0], [3, -2]],
  }),
  'lmr-cw-3': board({
    standardFormEquation: 'x+y=5',
    slopeInterceptEquation: 'y=-x+5',
    featureSlope: '-1',
    featureXIntercept: '(5, 0)',
    featureYIntercept: '(0, 5)',
    featurePoint1: '(3, 2)',
    featurePoint2: '(1, 4)',
    tableRows: [{ x: '0', y: '5' }, { x: '1', y: '4' }, { x: '3', y: '2' }, { x: '5', y: '0' }],
    graph1Points: [[5, 0], [0, 5]],
    graph2Points: [[0, 5], [1, 4]],
    graph3Points: [[3, 2], [4, 1]],
  }),
  'lmr-pr-1': board({
    standardFormEquation: '3x-y=6',
    slopeInterceptEquation: 'y=3x-6',
    pointSlopeEquation: 'y-3=3\\left(x-3\\right)',
    featureSlope: '3',
    featureXIntercept: '(2, 0)',
    featureYIntercept: '(0, -6)',
    featurePoint1: '(1, -3)',
    featurePoint2: '(3, 3)',
    graph1Points: [[2, 0], [0, -6]],
    graph2Points: [[0, -6], [1, -3]],
    graph3Points: [[3, 3], [4, 6]],
  }),
  'lmr-pr-2': board({
    standardFormEquation: '2x+y=18',
    slopeInterceptEquation: 'y=-2x+18',
    pointSlopeEquation: 'y-10=-2\\left(x-4\\right)',
    featureSlope: '-2',
    featureXIntercept: '(9, 0)',
    featureYIntercept: '(0, 18)',
    featurePoint1: '(4, 10)',
    featurePoint2: '(9, 0)',
    tableRows: [{ x: '0', y: '18' }, { x: '3', y: '12' }, { x: '6', y: '6' }, { x: '9', y: '0' }],
    graph1Points: [[9, 0], [0, 18]],
    graph2Points: [[0, 18], [1, 16]],
    graph3Points: [[4, 10], [5, 8]],
    contextIndependent: 'time since the candle was lit (hours)',
    contextDependent: 'height of the candle (inches)',
    contextSlopeMeaning: 'The candle gets 2 inches shorter every hour.',
    contextYInterceptMeaning: 'The candle is 18 inches tall when it is lit.',
    contextXInterceptMeaning: 'The candle is completely burned down after 9 hours.',
    contextDomain: '0 \\le x\\le 9',
  }),
  'lmr-dol-1': board({
    slopeInterceptEquation: 'y=-3x+24',
    standardFormEquation: '3x+y=24',
    featureSlope: '-3',
    featureXIntercept: '(8, 0)',
    featureYIntercept: '(0, 24)',
    graph2Points: [[0, 24], [1, 21]],
    contextSlopeMeaning: 'The tank loses 3 liters of water every minute.',
    contextYInterceptMeaning: 'The tank holds 24 liters when it starts draining.',
    contextDomain: '0 ≤ x ≤ 8',
  }),
};

const EXPECTED_PARTS = {
  'lmr-cw-1': ['slopeIntercept', 'pointSlope', 'slope', 'xIntercept', 'yIntercept', 'twoPoints', 'table', 'graph1', 'graph2', 'graph3', 'crossRepresentationConsistency'],
  'lmr-cw-2': ['standardForm', 'pointSlope', 'slope', 'xIntercept', 'yIntercept', 'twoPoints', 'table', 'graph1', 'graph2', 'graph3', 'crossRepresentationConsistency'],
  'lmr-cw-3': ['standardForm', 'slopeIntercept', 'slope', 'xIntercept', 'yIntercept', 'twoPoints', 'table', 'graph1', 'graph2', 'graph3', 'crossRepresentationConsistency'],
  'lmr-pr-1': ['standardForm', 'slopeIntercept', 'pointSlope', 'slope', 'xIntercept', 'yIntercept', 'twoPoints', 'graph1', 'graph2', 'graph3', 'crossRepresentationConsistency'],
  'lmr-pr-2': ['standardForm', 'slopeIntercept', 'pointSlope', 'slope', 'xIntercept', 'yIntercept', 'twoPoints', 'table', 'graph1', 'graph2', 'graph3',
    'contextIndependent', 'contextDependent', 'contextSlopeMeaning', 'contextYInterceptMeaning', 'contextXInterceptMeaning', 'contextDomain', 'crossRepresentationConsistency'],
  'lmr-dol-1': ['standardForm', 'slopeIntercept', 'slope', 'xIntercept', 'yIntercept', 'graph2', 'contextSlopeMeaning', 'contextYInterceptMeaning', 'contextDomain', 'crossRepresentationConsistency'],
};

/** Mark the work on both paths, assert they agree exactly, return the browser verdict. */
const graded = (question, work, label = 'fixture') => {
  const browser = gradeToolCheck(grader, question, work);
  assert.ok(browser.toolResponse, `${label}: the browser built the response the server will read`);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, `${label}: graded`);
  assert.equal(server.reason ?? null, browser.reason ?? null, `${label}: reason`);
  assert.equal(server.isCorrect, browser.isCorrect, `${label}: isCorrect`);
  assert.equal(server.isComplete, browser.isComplete, `${label}: isComplete`);
  assert.equal(server.score, browser.score, `${label}: score`);
  assert.deepEqual(server.parts, browser.parts, `${label}: parts`);
  if (server.graded) {
    assert.equal(server.mode, MODE, `${label}: graded as the Multiple Representations board`);
    assert.equal(server.surfaceId, 'representationBridge');
  }
  return browser;
};
const partMap = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isCorrect]));
const completeMap = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isComplete]));

// -----------------------------------------------------------------------------
// Declaration
// -----------------------------------------------------------------------------
test('the board is declared shared-server, and its grader is bound to that declaration', () => {
  assert.equal(lmrDeclaration[MODE].authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(GRADING_MANIFEST.representationBridge.modes[MODE].authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(GRADING_MANIFEST.representationBridge.contractVersion, 1);
  assert.equal(typeof lmrGraders[MODE], 'function');
  assert.deepEqual(Object.keys(lmrGraders), [MODE], 'this file grades only the board');
  assert.deepEqual([...grader.problems], [], 'the bound grader matches its declaration');
  for (const question of Object.values(QUESTIONS)) {
    const support = serverResponseGradingSupport(question);
    assert.equal(support.supported, true, `${question.questionId}: ${support.reason}`);
    assert.equal(support.mode, MODE);
  }
});

test('mode resolution matches the component: only mode "linearMultipleRepresentations" renders the board', () => {
  // RepresentationBridge.jsx renders the board for exactly this strict
  // comparison and the linear bridge for every other value.
  const bridge = executableSource(read('src/tools/representationBridge/RepresentationBridge.jsx'));
  const routing = region(bridge, 'export default function RepresentationBridge(', '\n  }\n', 'the mode switch');
  assert.match(routing, /if \(questionData\.mode === 'linearMultipleRepresentations'\) \{\s*return <LinearMultipleRepresentationsBoard /);
  const componentMode = (question) => (question.mode === MODE ? MODE : 'linear');
  const questions = [
    sample('lmr-dol-1'),
    { ...sample('lmr-cw-1'), mode: 'linear' },
    { ...sample('lmr-cw-1'), mode: undefined },
    { ...sample('lmr-cw-1'), mode: 'LinearMultipleRepresentations' },
    { ...sample('lmr-cw-1'), mode: 'graphs' },
  ];
  for (const question of questions) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), String(question.mode));
    assert.equal(grader.support(question).mode, componentMode(question), String(question.mode));
  }
});

// -----------------------------------------------------------------------------
// Fully correct — every sample board, including the DOL
// -----------------------------------------------------------------------------
test('a complete correct board is correct, complete and 100% on both paths for every sample question', () => {
  for (const [id, work] of Object.entries(CORRECT)) {
    const result = graded(sample(id), work, id);
    assert.equal(result.graded, true, id);
    assert.equal(result.isCorrect, true, id);
    assert.equal(result.isComplete, true, id);
    assert.equal(result.score, 1, id);
    assert.deepEqual(result.parts.map((part) => part.id), EXPECTED_PARTS[id], `${id} parts`);
    assert.ok(result.parts.every((part) => part.isCorrect && part.isComplete), id);
    assert.equal(attemptInputsFromGrading(result).partialCreditPercent, 100, id);
  }
});

test('the DOL board grades exactly its requiredCards subset and its three meanings', () => {
  const dol = sample('lmr-dol-1');
  const result = graded(dol, CORRECT['lmr-dol-1'], 'dol');
  for (const absent of ['pointSlope', 'twoPoints', 'table', 'graph1', 'graph3', 'contextIndependent', 'contextXInterceptMeaning']) {
    assert.equal(result.parts.some((part) => part.id === absent), false, `${absent} is not on the DOL board`);
  }
  // A card the DOL does not show cannot cost the student anything.
  const extra = graded(dol, { ...CORRECT['lmr-dol-1'], pointSlopeEquation: 'y = 99x', graph1Points: [[1, 1], [2, 5]] }, 'dol extra');
  assert.equal(extra.isCorrect, true);
  assert.equal(extra.score, 1);
});

// -----------------------------------------------------------------------------
// Incorrect and partial credit
// -----------------------------------------------------------------------------
test('a wrong card loses that card and, when it describes another line, consistency', () => {
  const question = sample('lmr-cw-1');
  const result = graded(question, { ...CORRECT['lmr-cw-1'], slopeInterceptEquation: 'y=2x-3' }, 'wrong slope-intercept');
  assert.equal(result.isCorrect, false);
  assert.equal(result.isComplete, true, 'complete but wrong');
  assert.equal(partMap(result).slopeIntercept, false);
  assert.equal(partMap(result).crossRepresentationConsistency, false);
  assert.equal(result.parts.filter((part) => !part.isCorrect).length, 2);
  assert.equal(result.score, 9 / 11);
  assert.equal(attemptInputsFromGrading(result).partialCreditPercent, 82);

  // A graph built from the right anchor with the wrong slope step.
  const graph = graded(question, { ...CORRECT['lmr-cw-1'], graph2Points: [[0, -3], [1, -1]] }, 'wrong graph 2');
  assert.equal(partMap(graph).graph2, false);
  assert.equal(partMap(graph).graph1, true);
  assert.equal(graph.score, 9 / 11);

  // The given point-slope anchor is required on CW3: another valid point fails Graph 3 only.
  const anchor = graded(sample('lmr-cw-3'), { ...CORRECT['lmr-cw-3'], graph3Points: [[1, 4], [2, 3]] }, 'cw3 anchor');
  assert.equal(partMap(anchor).graph3, false);
  assert.equal(partMap(anchor).crossRepresentationConsistency, true, 'still the same line');
  assert.equal(anchor.score, 10 / 11);
});

test('a half-finished board is graded (incomplete parts incorrect) and reported incomplete', () => {
  const question = sample('lmr-cw-1');
  const work = board({
    slopeInterceptEquation: 'y = 1/2x - 3',
    featureSlope: '0.5',
    featureXIntercept: '(6, 0)',
    graph1Points: [[6, 0], [0, -3]],
    tableRows: [{ x: '0', y: '-3' }, { x: '2', y: '-2' }, { x: '4', y: '-1' }, { x: '', y: '' }],
  });
  const result = graded(question, work, 'half board');
  assert.equal(result.graded, true, 'an explicit Submit of an unfinished board is still marked');
  assert.equal(result.isComplete, false);
  assert.equal(result.isCorrect, false);
  assert.deepEqual(partMap(result), {
    slopeIntercept: true,
    pointSlope: false,
    slope: true,
    xIntercept: true,
    yIntercept: false,
    twoPoints: false,
    table: false,
    graph1: true,
    graph2: false,
    graph3: false,
    // Two representations present (slope-intercept and Graph 1) and they agree.
    crossRepresentationConsistency: true,
  });
  assert.deepEqual(completeMap(result), {
    slopeIntercept: true,
    pointSlope: false,
    slope: true,
    xIntercept: true,
    yIntercept: false,
    twoPoints: false,
    table: false, // three filled rows of the four required
    graph1: true,
    graph2: false,
    graph3: false,
    crossRepresentationConsistency: false,
  });
  assert.equal(result.score, 5 / 11);
  // The fourth row completes the table card.
  const fourRows = graded(question, { ...work, tableRows: [...work.tableRows.slice(0, 3), { x: '6', y: '0' }] }, 'four rows');
  assert.equal(completeMap(fourRows).table, true);
  assert.equal(partMap(fourRows).table, true);
});

test('isComplete is the board\'s own "parts are still empty" rule, and only a full board is complete', () => {
  const question = sample('lmr-pr-2');
  const full = CORRECT['lmr-pr-2'];
  assert.deepEqual(unfinishedLinearMultipleRepresentationsParts(question, full), []);
  for (const [field, value] of [['contextDomain', ''], ['featurePoint2', '  '], ['graph3Points', [[4, 10]]], ['standardFormEquation', '']]) {
    const work = { ...full, [field]: value };
    const result = graded(question, work, `missing ${field}`);
    assert.equal(result.isComplete, false, field);
    assert.equal(unfinishedLinearMultipleRepresentationsParts(question, work).length, 1, field);
  }
  // Complete is not correct: a wrong but filled board is complete.
  const wrong = graded(question, { ...full, contextDomain: '0 ≤ x ≤ 18' }, 'wrong domain');
  assert.equal(wrong.isComplete, true);
  assert.equal(wrong.isCorrect, false);
  assert.equal(partMap(wrong).contextDomain, false);
});

// -----------------------------------------------------------------------------
// Behaviour change: no consistency credit for an empty or single-line board
// -----------------------------------------------------------------------------
test('BEHAVIOUR CHANGE: a blank board earns nothing — consistency needs two representations that agree', () => {
  // Before this change checkCrossRepresentationConsistency's vacuous `true`
  // (fewer than two lines) was credited, so a blank board scored 1/11 on CW1,
  // 1/18 on PR2 and 1/10 on the DOL for no work at all.
  for (const id of Object.keys(CORRECT)) {
    const question = sample(id);
    const blank = graded(question, board(), `${id} blank`);
    assert.equal(blank.graded, true, id);
    assert.equal(blank.isComplete, false, id);
    assert.equal(blank.isCorrect, false, id);
    assert.equal(blank.score, 0, `${id}: a blank board earns 0`);
    assert.equal(partMap(blank).crossRepresentationConsistency, false, id);
    assert.equal(scoreLinearMultipleRepresentations(question, board()).parts.crossRepresentationConsistency, false, id);
  }
  const question = sample('lmr-cw-1');
  // One representation: nothing to be consistent with.
  const one = graded(question, board({ slopeInterceptEquation: 'y = 1/2x - 3' }), 'one line');
  assert.equal(partMap(one).crossRepresentationConsistency, false);
  assert.equal(one.score, 1 / 11);
  // Two that agree: credited.
  const two = graded(question, board({ slopeInterceptEquation: 'y = 1/2x - 3', graph2Points: [[0, -3], [2, -2]] }), 'two lines');
  assert.equal(partMap(two).crossRepresentationConsistency, true);
  assert.equal(two.score, 3 / 11);
  // Two that disagree: not credited.
  const split = graded(question, board({ slopeInterceptEquation: 'y = 1/2x - 3', graph2Points: [[0, -3], [1, -1]] }), 'two lines disagree');
  assert.equal(partMap(split).crossRepresentationConsistency, false);
  // The GIVEN two points are a representation on the board: one student line is compared with them.
  const givenTwo = synthetic({ kind: 'twoPoints', points: [{ x: 6, y: 0 }, { x: 0, y: -3 }] }, { requiredCards: ['slopeIntercept'] });
  assert.equal(partMap(graded(givenTwo, board(), 'given two points, blank')).crossRepresentationConsistency, false);
  assert.equal(partMap(graded(givenTwo, board({ slopeInterceptEquation: 'y = 1/2x - 3' }), 'given two points, one line')).crossRepresentationConsistency, true);
  assert.equal(partMap(graded(givenTwo, board({ slopeInterceptEquation: 'y = 2x - 3' }), 'given two points, wrong line')).crossRepresentationConsistency, false);
});

test('a board that cannot show two representations has no consistency part (and a correct one is still 100%)', () => {
  const featuresOnly = synthetic({ kind: 'slopeIntercept', equation: 'y = 2x - 4' }, { requiredCards: ['slope', 'xIntercept', 'yIntercept'] });
  const blank = graded(featuresOnly, board(), 'features blank');
  assert.deepEqual(blank.parts.map((part) => part.id), ['slope', 'xIntercept', 'yIntercept']);
  assert.equal(blank.score, 0, 'no free consistency credit');
  const correct = graded(featuresOnly, board({ featureSlope: '2', featureXIntercept: '(2, 0)', featureYIntercept: '(0, -4)' }), 'features correct');
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.score, 1);
  const twoOfThree = graded(featuresOnly, board({ featureSlope: '2', featureXIntercept: '(2, 0)', featureYIntercept: '(0, 4)' }), 'features 2/3');
  assert.equal(twoOfThree.score, 2 / 3);
});

test('a representation the board never showed cannot vote on consistency (tampered or stale field)', () => {
  const dol = sample('lmr-dol-1');
  const onlySlopeIntercept = board({ slopeInterceptEquation: 'y = -3x + 24' });
  const honest = graded(dol, onlySlopeIntercept, 'dol one line');
  assert.equal(partMap(honest).crossRepresentationConsistency, false);
  // Point-slope and Graph 1 are not on the DOL board; adding them changes nothing.
  const injected = graded(dol, { ...onlySlopeIntercept, pointSlopeEquation: 'y - 0 = -3(x - 8)', graph1Points: [[8, 0], [0, 24]] }, 'dol injected');
  assert.deepEqual(injected.parts.map((part) => [part.id, part.isCorrect]), honest.parts.map((part) => [part.id, part.isCorrect]));
  assert.equal(injected.score, honest.score);
  // A second representation the DOL does show is what earns it.
  assert.equal(partMap(graded(dol, { ...onlySlopeIntercept, standardFormEquation: '3x + y = 24' }, 'dol two lines')).crossRepresentationConsistency, true);
});

// -----------------------------------------------------------------------------
// Equivalent forms, exact fractions, unauthored defaults
// -----------------------------------------------------------------------------
test('equivalent forms the board accepts are accepted on both paths; the forms it refuses are refused', () => {
  // y = x/3 - 1: a 1/3 slope no float holds exactly.
  const question = synthetic({ kind: 'standardForm', equation: 'x - 3y = 3' });
  const base = board({
    slopeInterceptEquation: 'y = \\frac{1}{3}x - 1',
    pointSlopeEquation: 'y - 0 = \\frac{1}{3}\\left(x - 3\\right)',
    featureSlope: '\\frac{1}{3}',
    featureXIntercept: '\\left(3,0\\right)',
    featureYIntercept: '(0, -1)',
    featurePoint1: '(3, 0)',
    featurePoint2: '(6, 1)',
    tableRows: [{ x: '0', y: '-1' }, { x: '1', y: '-2/3' }, { x: '\\frac{1}{2}', y: '-5/6' }, { x: '3', y: '0' }],
    graph1Points: [[0, -1], [3, 0]], // intercepts in either order
    graph2Points: [[0, -1], [3, 0]],
    graph3Points: [[3, 0], [6, 1]],
  });
  assert.equal(graded(question, base, '1/3 board').isCorrect, true);
  const accepted = {
    slopeInterceptEquation: ['y = 1/3x - 1', 'y = x/3 - 1', 'y = -1 + 1/3x', 'y=\\frac{1}{3}x-1'],
    pointSlopeEquation: ['y + 1 = \\frac{1}{3}\\left(x - 0\\right)', 'y + 2 = 1/3(x + 3)', 'y - 1 = 1/3(x - 6)'],
    featureSlope: ['1/3', '2/6', '0.3333'],
    featureXIntercept: ['(3, 0)', '(3,0)', '[3, 0]'],
    featurePoint1: ['(6, 1)'],
  };
  const PART_OF = { slopeInterceptEquation: 'slopeIntercept', pointSlopeEquation: 'pointSlope', featureSlope: 'slope', featureXIntercept: 'xIntercept', featurePoint1: 'twoPoints' };
  for (const [field, values] of Object.entries(accepted)) {
    for (const value of values) {
      const work = field === 'featurePoint1' ? { ...base, featurePoint1: value, featurePoint2: '(3, 0)' } : { ...base, [field]: value };
      const result = graded(question, work, `${field} ${value}`);
      assert.equal(partMap(result)[PART_OF[field]], true, `${field}: ${value}`);
      assert.equal(partMap(result).crossRepresentationConsistency, true, `${field}: ${value} is the same line`);
    }
  }
  // Graph 3 starts from the student's OWN point-slope point: point (0, -1)
  // moves the anchor, so a Graph 3 built from (3, 0) no longer earns it.
  const moved = graded(question, { ...base, pointSlopeEquation: 'y + 1 = \\frac{1}{3}\\left(x - 0\\right)' }, 'moved anchor');
  assert.equal(partMap(moved).graph3, false);
  assert.equal(graded(question, { ...base, pointSlopeEquation: 'y + 1 = \\frac{1}{3}\\left(x - 0\\right)', graph3Points: [[0, -1], [3, 0]] }, 'anchor followed').isCorrect, true);
  const refused = {
    slopeInterceptEquation: ['y = 0.3333x - 1', 'y = 2/6x - 1'],
    featureSlope: ['0.33'],
  };
  for (const [field, values] of Object.entries(refused)) {
    for (const value of values) {
      const result = graded(question, { ...base, [field]: value }, `${field} ${value}`);
      assert.equal(partMap(result)[PART_OF[field]], false, `${field}: ${value}`);
      assert.equal(result.isCorrect, false, `${field}: ${value}`);
    }
  }
  // Standard form: reduced, positive x-coefficient only (the board's rule).
  const sfQuestion = synthetic({ kind: 'slopeIntercept', equation: 'y = 1/3x - 1' }, { requiredCards: ['standardForm'] });
  for (const [value, ok] of [['x - 3y = 3', true], ['x-3y=3', true], ['2x - 6y = 6', false], ['-x + 3y = -3', false], ['3y - x = -3', false]]) {
    assert.equal(partMap(graded(sfQuestion, board({ standardFormEquation: value }), `standard ${value}`)).standardForm, ok, value);
  }
  // Table rows in any order.
  const reversed = graded(question, { ...base, tableRows: [...base.tableRows].reverse() }, 'reversed rows');
  assert.equal(reversed.isCorrect, true);
});

test('unauthored defaults: graph tolerance 0.12, every card when requiredCards is absent, no meanings without a context', () => {
  const question = synthetic({ kind: 'standardForm', equation: 'x - 3y = 3' });
  const work = board({ graph1Points: [[3.1, 0], [0, -1]] });
  assert.equal(partMap(graded(question, work, 'tolerance 0.1')).graph1, true);
  assert.equal(partMap(graded(question, { ...work, graph1Points: [[3.2, 0], [0, -1]] }, 'tolerance 0.2')).graph1, false);
  // The boundary itself: 0.119 off is inside the default 0.12, 0.121 is not.
  assert.equal(partMap(graded(question, { ...work, graph1Points: [[3.119, 0], [0, -1]] }, 'just inside 0.12')).graph1, true);
  assert.equal(partMap(graded(question, { ...work, graph1Points: [[3.121, 0], [0, -1]] }, 'just outside 0.12')).graph1, false);
  // The table card needs four complete rows: three correct rows are neither
  // finished nor correct, the fourth makes it both.
  const rows = [['0', '-1'], ['3', '0'], ['6', '1'], ['9', '2']].map(([x, y]) => ({ x, y }));
  const threeRows = graded(question, board({ tableRows: rows.slice(0, 3) }), 'three rows');
  assert.equal(partMap(threeRows).table, false);
  assert.equal(completeMap(threeRows).table, false);
  const fourRows = graded(question, board({ tableRows: rows }), 'four rows');
  assert.equal(partMap(fourRows).table, true);
  assert.equal(completeMap(fourRows).table, true);
  assert.equal(partMap(graded({ ...question, tolerance: 0.3 }, { ...work, graph1Points: [[3.2, 0], [0, -1]] }, 'authored 0.3')).graph1, true);
  const ids = graded(question, board(), 'defaults').parts.map((part) => part.id);
  assert.deepEqual(ids, ['slopeIntercept', 'pointSlope', 'slope', 'xIntercept', 'yIntercept', 'twoPoints', 'table', 'graph1', 'graph2', 'graph3', 'crossRepresentationConsistency']);
  // A domain authored on the question itself, without any context, is graded.
  const withDomain = synthetic({ kind: 'scenario', prompt: 'A tank drains.', m: -2, b: 18 }, { domain: '0 <= x <= 9', requiredCards: ['slope'] });
  const domain = graded(withDomain, board({ featureSlope: '-2', contextDomain: '0 ≤ x ≤ 9' }), 'top-level domain');
  assert.deepEqual(domain.parts.map((part) => part.id), ['slope', 'contextDomain']);
  assert.equal(domain.isCorrect, true);
  assert.equal(partMap(graded(withDomain, board({ featureSlope: '-2', contextDomain: '0 < x ≤ 9' }), 'open endpoint')).contextDomain, false);
});

test('the domain is judged against one key: the question\'s own domain when it has one, else the context\'s — on Submit and on Check', () => {
  // The DOL's domain lives in its context. A question-level domain that is
  // present but empty must not replace it (the score has always read it this
  // way); the board's Check now reads it the same way instead of judging
  // against the empty string, which marked every domain wrong on Check while
  // Submit marked the right one correct.
  const dol = sample('lmr-dol-1');
  const emptyQuestionDomain = { ...dol, domain: '' };
  assert.deepEqual(resolveExpectedDomain(emptyQuestionDomain), dol.context.domain);
  const result = graded(emptyQuestionDomain, CORRECT['lmr-dol-1'], 'empty question-level domain');
  assert.equal(partMap(result).contextDomain, true);
  assert.equal(result.isCorrect, true);
  // A question-level domain that IS authored wins over the context's.
  const own = { ...dol, domain: '0 <= x <= 6' };
  assert.equal(resolveExpectedDomain(own), '0 <= x <= 6');
  assert.equal(partMap(graded(own, CORRECT['lmr-dol-1'], 'question domain wins')).contextDomain, false);
  assert.equal(partMap(graded(own, { ...CORRECT['lmr-dol-1'], contextDomain: '0 ≤ x ≤ 6' }, 'question domain answered')).contextDomain, true);
  // The board's Check of the meanings uses the same rule, not a second one.
  const source = executableSource(read('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx'));
  assert.match(source, /const expectedDomain = resolveExpectedDomain\(questionData\);/);
  const judgeContext = region(source, 'const judgeContext = (response) =>', '\n  }));', 'judgeContext');
  assert.match(judgeContext, /validateDomainField\(value, expectedDomain\)/);
});

test('student point-slope text is read through the hardened mathjs instance: an answer cannot create a unit for every later student', async () => {
  // The mathjs instance the shared board math resolves — on the server, one
  // warm Cloud Function instance shares it between every student it grades.
  const requireFromSharedMath = createRequire(new URL('../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs', import.meta.url));
  const mathjsDir = path.dirname(requireFromSharedMath.resolve('mathjs/package.json'));
  const sharedMathjs = await import(pathToFileURL(path.join(mathjsDir, 'lib/esm/index.js')).href);
  const unitName = `lmrprobe${process.pid}`;
  assert.throws(() => sharedMathjs.unit(`1 ${unitName}`), 'no such unit to begin with');
  const hostile = `y - 1 = createUnit("${unitName}") * (x - 0)`;
  assert.equal(parsePointSlopeForm(hostile), null);
  const question = synthetic({ kind: 'slopeIntercept', equation: 'y = 2x + 1' });
  assert.equal(resolveGraph3Anchor(question, deriveLinearMultipleRepresentations(question), hostile).origin, 'free');
  assert.throws(() => sharedMathjs.unit(`1 ${unitName}`), 'the answer created a unit on the shared mathjs instance');
  // Ordinary point-slope text still reads exactly as before.
  assert.deepEqual(parsePointSlopeForm('y - 3 = 2(x - 1)'), { m: 2, x1: 1, y1: 3, point: [1, 3] });
  assert.deepEqual(parsePointSlopeForm('y+2=\\frac{1}{2}\\left(x-2\\right)').point, [2, -2]);
});

test('a context written on the source wins over a top-level context, exactly as the board shows it', () => {
  // The board renders (and asks for) the meanings of source.context when it
  // exists; a top-level context beside it is never on screen.
  const question = synthetic(
    { kind: 'scenario', prompt: 'A tank drains.', m: -3, b: 24, context: { slopeMeaning: { value: 'The tank loses 3 liters every minute.' } } },
    { requiredCards: ['slope'], context: { slopeMeaning: { value: 'Something else.' }, independentQuantity: { value: 'time (minutes)' } } },
  );
  const right = graded(question, board({ featureSlope: '-3', contextSlopeMeaning: 'The tank loses 3 liters every minute.' }), 'source context');
  assert.deepEqual(right.parts.map((part) => part.id), ['slope', 'contextSlopeMeaning'], 'only the meanings the board shows are graded');
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true, 'the hidden top-level meaning is not required');
  assert.equal(partMap(graded(question, board({ featureSlope: '-3', contextSlopeMeaning: 'Something else.' }), 'top-level meaning')).contextSlopeMeaning, false);
});

test('meanings are graded against the key, never against the length or order of a choices list', () => {
  const question = sample('lmr-pr-2');
  const work = CORRECT['lmr-pr-2'];
  const trimmed = clone(question);
  for (const spec of Object.values(trimmed.context)) {
    // A reduce-complexity support keeps two choices; the order is incidental.
    spec.choices = [spec.value, spec.choices.find((choice) => choice !== spec.value)].reverse();
  }
  const noChoices = clone(question);
  for (const spec of Object.values(noChoices.context)) delete spec.choices;
  const full = graded(question, work, 'full choices');
  for (const [label, variant] of [['trimmed', trimmed], ['no choices', noChoices]]) {
    const result = graded(variant, work, label);
    assert.deepEqual(partMap(result), partMap(full), label);
    assert.equal(result.score, 1, label);
  }
  // A distractor is wrong whatever the list looks like.
  const distractor = { ...work, contextSlopeMeaning: 'The candle burns for 2 hours.' };
  assert.equal(partMap(graded(trimmed, distractor, 'distractor')).contextSlopeMeaning, false);
});

// -----------------------------------------------------------------------------
// Discrimination: the verdict follows the authoritative key
// -----------------------------------------------------------------------------
test('correct work graded against an altered key is not correct', () => {
  const question = sample('lmr-cw-1');
  const work = CORRECT['lmr-cw-1'];
  assert.equal(graded(question, work, 'original').isCorrect, true);
  const altered = graded({ ...question, source: { kind: 'standardForm', equation: '2x - 4y = 8' } }, work, 'altered line');
  assert.equal(altered.isCorrect, false);
  assert.ok(altered.score < 0.5, `${altered.score}`);
  const alteredAnchor = graded({ ...sample('lmr-cw-3'), source: { kind: 'pointSlope', equation: 'y - 4 = -1(x - 1)' } }, CORRECT['lmr-cw-3'], 'altered anchor');
  assert.equal(partMap(alteredAnchor).graph3, false, 'same line, different given anchor');
  const context = sample('lmr-dol-1');
  context.context.slopeMeaning.value = 'The tank gains 3 liters of water every minute.';
  assert.equal(partMap(graded(context, CORRECT['lmr-dol-1'], 'altered meaning')).contextSlopeMeaning, false);
});

// -----------------------------------------------------------------------------
// Malformed and tampered work
// -----------------------------------------------------------------------------
test('verdicts and key material injected into the work are ignored', () => {
  const question = sample('lmr-cw-1');
  const wrong = board({ slopeInterceptEquation: 'y = 2x - 3' });
  const honest = graded(question, wrong, 'honest wrong');
  const tampered = {
    ...wrong,
    isCorrect: true,
    score: 1,
    checks: [true, true],
    expected: { slopeInterceptEquation: 'y = 2x - 3' },
    canonicalFacts: { canonicalLine: { m: { n: 2, d: 1 }, b: { n: -3, d: 1 } } },
    evidence: { crossRepresentationConsistency: { isConsistent: true } },
    parts: { slopeIntercept: true },
    tableRows: [{ x: '0', y: '-3', isCorrect: true }, ...BLANK_ROWS().slice(1)],
  };
  const result = graded(question, tampered, 'tampered');
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, honest.score);
  assert.deepEqual(partMap(result), partMap(honest));
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['checks', 'expected', 'isCorrect', 'score']);
});

test('wrong types and missing fields grade as unanswered parts instead of failing the board', () => {
  const question = sample('lmr-pr-2');
  const shapes = [
    {},
    { graph1Points: 'abc', graph2Points: { 0: [0, 18] }, graph3Points: 7, tableRows: 'rows' },
    { standardFormEquation: { left: '2x+y' }, featureSlope: ['-', 2], featurePoint1: null, contextDomain: 42 },
    { tableRows: [null, 5, 'x', [0, 18]], graph1Points: [null, [9], ['a', 'b'], 'x'] },
    { slopeInterceptEquation: 'y = = 2', pointSlopeEquation: '((((', featureXIntercept: '(9, 0, 1)' },
  ];
  for (const [index, shape] of shapes.entries()) {
    const result = graded(question, shape, `shape ${index}`);
    assert.equal(result.graded, true, `shape ${index}: ${result.reason}`);
    assert.equal(result.isCorrect, false, `shape ${index}`);
    assert.equal(result.isComplete, false, `shape ${index}`);
    assert.equal(result.score, 0, `shape ${index}`);
  }
  // A number where the board keeps a string is read the same way the board reads it.
  const numeric = graded(question, { ...CORRECT['lmr-pr-2'], featureSlope: -2 }, 'numeric slope');
  assert.equal(numeric.isCorrect, true);
});

test('non-object work and oversize work are not graded, on either path', () => {
  const question = sample('lmr-dol-1');
  for (const work of [null, undefined, 'y = -3x + 24', 42, true, [CORRECT['lmr-dol-1']]]) {
    const result = graded(question, work, `non-object ${JSON.stringify(work)}`);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
  const oversize = {
    ...CORRECT['lmr-dol-1'],
    tableRows: Array.from({ length: 300 }, (_, index) => ({ x: `${index}`.padEnd(60, '0'), y: '1'.padEnd(60, '0') })),
  };
  assert.ok(canonicalToolWorkJson(oversize).length > TOOL_RESPONSE_LIMITS.maxJsonLength);
  const result = graded(question, oversize, 'oversize');
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'oversize-response');
});

test('a question whose line cannot be derived is not graded (nothing to mark against)', () => {
  const broken = synthetic({ kind: 'standardForm', equation: 'not an equation' });
  const result = graded(broken, CORRECT['lmr-cw-1'], 'broken source');
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'invalid-question');
  assert.equal(result.isCorrect, false);
});

// -----------------------------------------------------------------------------
// The response contract
// -----------------------------------------------------------------------------
test('realistic maximal work is pure student work and fits the response contract', () => {
  const maximal = board({
    standardFormEquation: '2x+y=18',
    slopeInterceptEquation: 'y=-2x+18',
    pointSlopeEquation: 'y-\\frac{37}{3}=-2\\left(x-\\frac{17}{6}\\right)',
    featureSlope: '-\\frac{4}{2}',
    featureXIntercept: '\\left(9,0\\right)',
    featureYIntercept: '\\left(0,18\\right)',
    featurePoint1: '\\left(\\frac{17}{6},\\frac{37}{3}\\right)',
    featurePoint2: '\\left(9,0\\right)',
    // Far more rows than any student adds: "+ Add row" is unbounded on screen.
    tableRows: Array.from({ length: 40 }, (_, index) => ({ x: `\\frac{${index}}{4}`, y: `\\frac{${72 - 2 * index}}{4}` })),
    graph1Points: [[9, 0], [0, 18]],
    graph2Points: [[0, 18], [0.25, 17.5]],
    graph3Points: [[2.5, 13], [3.5, 11]],
    contextIndependent: 'time since the candle was lit (hours)',
    contextDependent: 'height of the candle (inches)',
    contextSlopeMeaning: 'The candle gets 2 inches shorter every hour.'.repeat(5),
    contextYInterceptMeaning: 'The candle is 18 inches tall when it is lit.'.repeat(5),
    contextXInterceptMeaning: 'The candle is completely burned down after 9 hours.'.repeat(5),
    contextDomain: '0\\le x\\le9',
  });
  const bounded = boundToolWork(maximal);
  assert.deepEqual(bounded.dropped, [], 'no student field is named like a verdict or a key');
  assert.equal(bounded.truncated, false);
  const json = canonicalToolWorkJson(maximal);
  assert.ok(json.length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${json.length} chars`);
  const result = graded(sample('lmr-pr-2'), maximal, 'maximal');
  assert.equal(result.graded, true);
  for (const [id, work] of Object.entries(CORRECT)) assert.deepEqual(boundToolWork(work).dropped, [], id);
});

test('the result carries no answer-key material: part responses echo only the student\'s own entries', () => {
  const question = sample('lmr-pr-2');
  const wrong = board({ featureXIntercept: '(4, 0)', graph1Points: [[4, 0], [0, 18]] });
  const result = graded(question, wrong, 'wrong intercept');
  const serialized = JSON.stringify(result.parts);
  for (const forbidden of ['canonicalFacts', 'evidence', 'anchors', 'expected', 'solution', 'answer', '(9, 0)', '[9,0]', 'candle']) {
    assert.equal(serialized.includes(forbidden), false, `parts mention ${forbidden}`);
  }
  assert.equal(result.parts.find((part) => part.id === 'xIntercept').response, '(4, 0)');
  assert.equal(result.parts.find((part) => part.id === 'graph1').response, '[[4,0],[0,18]]');
});

// -----------------------------------------------------------------------------
// The board is wired to the shared grader
// -----------------------------------------------------------------------------
const BOARD = 'src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx';

test('the board submits the shared grader\'s verdict, with no answer key in the metadata', () => {
  const source = executableSource(read(BOARD));
  assert.match(source, /import representationBridgeGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/representationBridge\.mjs';/);
  assert.match(source, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  const submitHandler = region(source, 'const doSubmit = () => {', '\n  };', 'doSubmit');
  assert.match(submitHandler, /const work = responseRef\.current;/);
  assert.match(submitHandler, /const result = gradeToolCheck\(representationBridgeGrader, questionData, work\);/);
  assert.match(submitHandler, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{ mode: 'linearMultipleRepresentations', parts: result\.parts \},\s*\);/);
  assert.doesNotMatch(submitHandler, /evidence|canonicalFacts|scoreLinearMultipleRepresentations/);
  // No second definition of the board's verdict anywhere in the component.
  assert.doesNotMatch(source, /scoreLinearMultipleRepresentations\(/);
  assert.doesNotMatch(source, /metadata\?\.evidence|metadata\.evidence|canonicalFacts: result/);
});

test('the board reports the same live work it submits, and asks before submitting by the grader\'s completeness rule', () => {
  const source = executableSource(read(BOARD));
  assert.match(source, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  // doSubmit grades responseRef.current, which is this render's currentResponse.
  assert.match(source, /responseRef\.current = currentResponse;\s*(\/\/[^\n]*\n\s*)*useReportToolWork\(currentResponse\);/);
  const empty = region(source, 'const emptyParts =', ';\n', 'emptyParts');
  assert.match(empty, /unfinishedLinearMultipleRepresentationsParts\(questionData, currentResponse\)/);
  const submit = region(source, 'const handleSubmit = () => {', '};', 'handleSubmit');
  assert.match(submit, /if \(emptyParts\.length && !confirmSubmit\)/);
});

// -----------------------------------------------------------------------------
// Question Families
// -----------------------------------------------------------------------------
test('no Question Family builds this board yet — one that does needs instance parity fixtures here', () => {
  const families = allRegisteredQuestionFamilies().filter((family) => {
    const tools = family.tools instanceof Set ? [...family.tools] : family.tools instanceof Map ? [...family.tools.keys()] : Object.keys(family.tools || {});
    return family.defaultTool === 'representationBridge' || tools.includes('representationBridge');
  });
  assert.deepEqual(families.map((family) => family.id), [], 'add a family-instance parity test for the Multiple Representations board');
});
