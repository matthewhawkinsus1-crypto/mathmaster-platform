import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildRepresentationBridgeReview,
  implemented,
} from '../../src/tools/shared/reviews/representationBridgeReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  PART_LABELS,
  deriveLinearMultipleRepresentations,
  resolveRequiredCards,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { isProcessModeQuestion } from '../../functions/shared/toolMath/representationBridge/lmrProcessModel.mjs';
import {
  keyProcessLog,
  materializeProcessBoard,
  resolveLmrProcess,
} from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';

/*
 * THE REPRESENTATION BRIDGE REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Representation Bridge question is closed, its review lists the work
 * the grader marks correct — the bridge's intervals, equations, graph points
 * and meanings, or every card of the Multiple Representations board — with
 * the worked steps that reach it. Every review here is turned back into the
 * work a student following it would submit, READ FROM THE REVIEW'S OWN ITEMS
 * (never from the builder's internals), and graded by the shared grader the
 * server records with: it must come back complete and correct. Both graded
 * modes are covered — `linear` (the bridge) and
 * `linearMultipleRepresentations` (the board) — the board from every GIVEN
 * kind, in Worksheet Mode and in Process Mode (where the key facts must also
 * carry the process that establishes them: the grader's own key process).
 */

const TOOL_ID = 'representationBridge';

const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 2, `${label}: items`);
  model.items.forEach((item) => {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value'], `${label}: an item is a label and a value`);
    assert.ok(typeof item.label === 'string' && item.label, `${label}: item label`);
    assert.ok(typeof item.value === 'string' && item.value.trim(), `${label}: item value for ${item.label}`);
  });
  assert.ok(model.steps.length >= 2 && model.steps.length <= 12, `${label}: steps (${model.steps.length})`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  const texts = [model.title, model.why, model.note || '', ...model.steps, ...model.items.flatMap((item) => [item.label, item.value])];
  texts.forEach((value) => assert.doesNotMatch(value, /NaN|undefined|Infinity|\[object|\bnull\b|−0\b(?![./])/, `${label}: no broken value in "${value}"`));
};

// "7/2" → 3.5; "(4, 0) and (0, -20)" → [[4, 0], [0, -20]].
const numberOf = (raw) => {
  const match = String(raw).trim().match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  assert.ok(match, `a number: ${raw}`);
  return match[2] ? Number(match[1]) / Number(match[2]) : Number(match[1]);
};
const pairsIn = (value) => [...String(value).matchAll(/\(([^,()]+), ([^,()]+)\)/g)].map(([, x, y]) => [x.trim(), y.trim()]);
const pointsIn = (value) => pairsIn(value).map(([x, y]) => [numberOf(x), numberOf(y)]);

/* ------------------------------------------------- the bridge (mode linear) */

/** The bridge work a student who follows the review submits, read from its items. */
const bridgeWorkFromReview = (model) => {
  const work = {};
  const intervals = model.items
    .filter((item) => /^Row \d+ → Row \d+$/.test(item.label))
    .map((item) => {
      const [, i, j] = item.label.match(/^Row (\d+) → Row (\d+)$/);
      const [, dx, dy, rate] = item.value.match(/^Δx = (\S+), Δy = (\S+), rate = (\S+)$/);
      return { i: Number(i) - 1, j: Number(j) - 1, dx, dy, rate };
    });
  if (intervals.length) {
    work.tableEvidence = intervals;
    work.studentSlope = itemValue(model, 'm (your slope)');
    work.rateConclusion = itemValue(model, 'Rate conclusion') === 'The rate is constant' ? 'constant' : 'not constant';
  }
  if (itemValue(model, 'General form equation')) {
    work.generalForm = { m: itemValue(model, 'General form: m'), b: itemValue(model, 'General form: b'), equation: itemValue(model, 'General form equation') };
  }
  if (itemValue(model, 'Factored form equation')) {
    work.factoredForm = { a: itemValue(model, 'Factored form: a'), c: itemValue(model, 'Factored form: c'), equation: itemValue(model, 'Factored form equation') };
  }
  if (itemValue(model, 'Graph points')) work.graphConstruction = { points: pointsIn(itemValue(model, 'Graph points')) };
  const meanings = {};
  model.items.forEach((item) => {
    const concept = item.label.match(/^Meaning of ([mbc]) = /)?.[1];
    if (!concept) return;
    const [, unit, contextMeaning, mathRole] = item.value.match(/^Unit: (.*) · Meaning: (.*) · Role: (.*)$/);
    meanings[{ m: 'rate', b: 'yIntercept', c: 'zero' }[concept]] = { unit, contextMeaning, mathRole };
  });
  if (Object.keys(meanings).length) work.meaningAssignments = meanings;
  return work;
};

const boothFeeContext = {
  inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
  rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
  yInterceptMeaning: 'starting profit after paying the booth fee',
  zeroMeaning: 'number of items that must be sold to break even',
};
const tankContext = {
  inputLabel: 'minutes', outputLabel: 'water', inputUnit: 'minutes', outputUnit: 'liters',
  rateUnit: 'liters per minute', rateMeaning: 'water drained each minute',
  yInterceptMeaning: 'water in the tank at the start',
  zeroMeaning: 'minutes until the tank is empty',
};
const ALL_STAGES = ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'];
const bridge = (rows, extra = {}) => ({ type: TOOL_ID, mode: 'linear', source: { kind: 'table', rows }, context: boothFeeContext, ...extra });

const BOOTH_FEE = bridge([{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }], {
  id: 'rb-booth-fee', requiredStages: ALL_STAGES, requiredComparisons: 3, graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 }, feedbackTiming: 'checkpoint',
});

const compiledBridge = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Representation Bridge review', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  sections: [{
    role: 'classwork',
    questions: [{
      standard: 'A.3C',
      prompt: 'Connect every representation of this linear relationship.',
      studentActions: ['connectLinearRepresentations'],
      source: { kind: 'table', rows: [{ x: 1, y: 21 }, { x: 3, y: 15 }, { x: 5, y: 9 }, { x: 7, y: 3 }] },
      context: tankContext,
      requiredStages: ALL_STAGES,
      requiredComparisons: 2,
      feedbackTiming: 'submitOnly',
    }],
  }],
}).package.sections[0].questions[0];

const BRIDGE_QUESTIONS = [
  ['booth fee, every stage', BOOTH_FEE],
  ['the V5-compiled tank (no mode, no bounds)', compiledBridge],
  ['fractional slope, decimal y-values, default stages', bridge([[1, 3.5], [3, 4.5], [5, 5.5]])],
  ['negative slope with a fractional zero, unsorted rows', bridge([{ x: 4, y: -5 }, { x: 0, y: 3 }, { x: 2, y: -1 }, { x: -1, y: 5 }], { requiredComparisons: 2 })],
  ['through the origin (b = 0, c = 0)', bridge([{ x: -2, y: -6 }, { x: 1, y: 3 }, { x: 3, y: 9 }], { requiredComparisons: 1 })],
  ['slope −1/3 with a far zero', bridge([{ x: 0, y: 2 }, { x: 3, y: 1 }, { x: 6, y: 0 }, { x: 9, y: -1 }], { requiredComparisons: 4 })],
  ['only the equations and the graph', bridge([{ x: 1, y: 7 }, { x: 2, y: 9 }, { x: 3, y: 11 }], { requiredStages: ['generalForm', 'factoredForm', 'graph'] })],
  ['only the rate evidence, more comparisons than pairs (capped)', bridge([{ x: 2, y: 1 }, { x: 4, y: 4 }, { x: 6, y: 7 }], { requiredStages: ['rateEvidence'], requiredComparisons: 10 })],
  ['only the general form of a horizontal table', bridge([{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 5, y: 4 }], { requiredStages: ['generalForm'] })],
];

test('bridge: implemented, registered, and picked up by the review index', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS.representationBridge, buildRepresentationBridgeReview);
  assert.equal(compiledBridge.type, TOOL_ID);
});

test('bridge: every review is text, and the work it states is complete and correct for the shared grader', () => {
  BRIDGE_QUESTIONS.forEach(([label, question]) => {
    const model = buildRepresentationBridgeReview(question);
    assertTextOnly(model, label);
    const work = bridgeWorkFromReview(model);
    const result = grade(question, work);
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.isComplete, true, `${label}: complete`);
    assert.equal(result.isCorrect, true, `${label}: correct (${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))})`);
    // The index hands the same review to the closed question.
    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the index returns this model`);
  });
});

test('bridge: the booth-fee review states the booth fee\'s own line, zero and meanings', () => {
  const model = buildRepresentationBridgeReview(BOOTH_FEE);
  assert.equal(itemValue(model, 'General form equation'), 'y = 5x - 20');
  assert.equal(itemValue(model, 'Factored form equation'), 'y = 5(x - 4)');
  assert.equal(itemValue(model, 'Factored form: c'), '4');
  assert.deepEqual(pointsIn(itemValue(model, 'Graph points'))[0], [4, 0], 'the graph starts at the x-intercept, as the stage requires');
  assert.equal(model.items.filter((item) => /^Row \d+ → Row \d+$/.test(item.label)).length, 3, 'the three intervals the question asks for');
  assert.match(itemValue(model, 'Meaning of b = -20'), /Unit: dollars · Meaning: starting profit after paying the booth fee · Role: y-intercept \/ constant term/);
  assert.ok(model.steps.some((step) => step.includes('Row 1 (0, −20) has x = 0, so its y-value is the y-intercept: b = −20')), 'b is read from the x = 0 row');
  assert.match(model.why, /5\(4\) − 20 = 0/, 'the check substitutes the zero back');
  // Only the stages the question asks for: a general-form-only bridge states nothing else.
  const only = buildRepresentationBridgeReview(BRIDGE_QUESTIONS.at(-1)[1]);
  assert.deepEqual(only.items.map((item) => item.label), ['General form: m', 'General form: b', 'General form equation']);
  assert.equal(itemValue(only, 'General form equation'), 'y = 4');
});

test('bridge: a review that misstates any part is caught by the grader (the check can fail)', () => {
  const model = buildRepresentationBridgeReview(BOOTH_FEE);
  const work = bridgeWorkFromReview(model);
  const wrong = [
    { ...work, factoredForm: { ...work.factoredForm, c: '-4', equation: 'y = 5(x + 4)' } },
    { ...work, generalForm: { ...work.generalForm, b: '20', equation: 'y = 5x + 20' } },
    { ...work, graphConstruction: { points: [[0, -20], [6, 10]] } },
    { ...work, tableEvidence: work.tableEvidence.slice(0, 2) },
    { ...work, meaningAssignments: { ...work.meaningAssignments, zero: { ...work.meaningAssignments.zero, unit: 'dollars' } } },
  ];
  wrong.forEach((candidate, index) => assert.equal(grade(BOOTH_FEE, candidate).isCorrect, false, `wrong work ${index} is not credited`));
});

/* --------------------------------------- the Multiple Representations board */

const CARD_FIELDS = {
  [PART_LABELS.standardForm]: 'standardFormEquation',
  [PART_LABELS.slopeIntercept]: 'slopeInterceptEquation',
  [PART_LABELS.pointSlope]: 'pointSlopeEquation',
  [PART_LABELS.slope]: 'featureSlope',
  [PART_LABELS.xIntercept]: 'featureXIntercept',
  [PART_LABELS.yIntercept]: 'featureYIntercept',
};
const GRAPH_FIELDS = { [PART_LABELS.graph1]: 'graph1Points', [PART_LABELS.graph2]: 'graph2Points', [PART_LABELS.graph3]: 'graph3Points' };
const CONTEXT_FIELDS = Object.fromEntries(['contextIndependent', 'contextDependent', 'contextSlopeMeaning', 'contextYInterceptMeaning', 'contextXInterceptMeaning', 'contextDomain']
  .map((field) => [PART_LABELS[field], field]));

/**
 * The board a student who follows the review submits, read from its items.
 * In Process Mode the key facts are not typed: the student establishes them,
 * so the work also carries the grader's own key process for this question.
 */
const boardWorkFromReview = (question, model) => {
  const work = {};
  model.items.forEach(({ label, value }) => {
    if (CARD_FIELDS[label]) work[CARD_FIELDS[label]] = value;
    else if (GRAPH_FIELDS[label]) work[GRAPH_FIELDS[label]] = pointsIn(value);
    else if (CONTEXT_FIELDS[label]) work[CONTEXT_FIELDS[label]] = value;
    else if (label === PART_LABELS.twoPoints) [work.featurePoint1, work.featurePoint2] = pairsIn(value).map(([x, y]) => `(${x}, ${y})`);
    else if (label === PART_LABELS.table) work.tableRows = pairsIn(value).map(([x, y]) => ({ x, y }));
    else assert.fail(`an item the board has no field for: ${label}`);
  });
  if (isProcessModeQuestion(question)) work.processLog = keyProcessLog(question);
  return work;
};

const board = (source, extra = {}) => ({ type: TOOL_ID, mode: 'linearMultipleRepresentations', source, feedbackTiming: 'guided', ...extra });
const processBoard = (source, extra = {}) => board(source, { interactionMode: 'process', ...extra });

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
/** The teacher import + publish chain, as the Multiple Representations family test runs it. */
const publish = (relPath) => {
  const parsed = parseAssignmentBlueprintText(read(relPath));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
  assert.ok(model.isValid, `${relPath} publishes`);
  return validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
};
const BASELINE = publish('docs/assignments/algebra1-linear-multiple-representations-final-v5.json').filter((question) => question.type === TOOL_ID);
const FAMILY = publish('docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json');
const FAMILY_SLOTS = FAMILY.filter((question) => question.type === TOOL_ID);
/** A few generated versions of one family slot, as students receive them. */
const versionsOf = (slot, count = 4) => Array.from({ length: count }, (_, index) => resolveFamilyQuestionInstance({
  question: slot,
  assignmentId: 'lmr-review-test',
  storageIndex: FAMILY.indexOf(slot),
  allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' },
})).filter((result) => !result.error && result.question).map((result) => result.question);

const WORKSHEET_QUESTIONS = [
  ...BASELINE.map((question) => [`baseline ${question.questionId}`, question]),
  ['standard form from coefficients', board({ kind: 'standardForm', A: 3, B: 2, C: 12 })],
  ['slope-intercept with a negative fractional slope', board({ kind: 'slopeIntercept', m: -2, b: 3 }, { requiredCards: ['standardForm', 'pointSlope', 'xIntercept', 'graphIntercepts', 'graphPointSlope'] })],
  ['slope-intercept, fractional slope and intercept', board({ kind: 'slopeIntercept', equation: 'y = (3/4)x + 1/2' })],
  ['point-slope from a point and a slope', board({ kind: 'pointSlope', point: [2, -2], m: 0.5 })],
  ['two points', board({ kind: 'twoPoints', points: [[-2, -5], [4, -2]] })],
  ['two points as Firestore stores them', board({ kind: 'twoPoints', points: [{ x: 1, y: 5 }, { x: 3, y: 1 }] })],
  ['a graph through two points', board({ kind: 'graph', points: [[0, 1], [3, -1]] })],
  ['a graph given as a line', board({ kind: 'graph', line: { m: 2, b: -4 } })],
  ['a table with fraction cells', board({ kind: 'table', rows: [{ x: 0, y: '1/3' }, { x: 1, y: '4/3' }, { x: 2, y: '7/3' }] }, { requiredCards: ['slopeIntercept', 'standardForm', 'xIntercept', 'yIntercept', 'graphSlopeIntercept'] })],
  ['a line through the origin', board({ kind: 'slopeIntercept', equation: 'y = 2x' })],
  ['a scenario with every context field and a domain range', board({ kind: 'scenario', prompt: 'A pool holds 30 gallons and drains 5 gallons each minute.', rate: -5, initialValue: 30 }, {
    context: {
      independentQuantity: 'time (minutes)',
      dependentQuantity: { acceptedAnswers: ['water in the pool (gallons)', 'gallons of water'] },
      slopeMeaning: { value: 'The pool loses 5 gallons each minute.', choices: ['The pool loses 5 gallons each minute.', 'The pool gains 5 gallons each minute.'] },
      yInterceptMeaning: { answer: 'The pool starts with 30 gallons.' },
      xInterceptMeaning: 'The pool is empty after 6 minutes.',
    },
    domain: [0, 6],
    requiredCards: ['slopeIntercept', 'standardForm', 'xIntercept', 'graphSlopeIntercept'],
  })],
  ...versionsOf(FAMILY_SLOTS.find((slot) => slot.questionId === 'lmr-pr-2')).map((question, index) => [`family lmr-pr-2 (worksheet) v${index + 1}`, question]),
];

const PROCESS_QUESTIONS = [
  ['process: standard form', processBoard({ kind: 'standardForm', equation: '2x - 4y = 12' })],
  ['process: point-slope', processBoard({ kind: 'pointSlope', equation: 'y - 2 = -1(x - 3)' })],
  ['process: two points', processBoard({ kind: 'twoPoints', points: [[-2, -5], [4, -2]] })],
  ['process: a table without an axis row', processBoard({ kind: 'table', rows: [{ x: 1, y: -1 }, { x: 2, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 5 }] })],
  ['process: a graph', processBoard({ kind: 'graph', points: [[0, 1], [3, -1]] })],
  ['process: a horizontal line with no x-intercept card', processBoard({ kind: 'slopeIntercept', equation: 'y = 5' }, { requiredCards: ['slope', 'yIntercept', 'standardForm', 'pointSlope', 'graphSlopeIntercept'] })],
  ['process: the slope only by the slope formula', processBoard({ kind: 'standardForm', equation: '3x + 2y = 12' }, { process: { strategies: { slope: ['twoPointFormula'] } } })],
  ...FAMILY_SLOTS.filter((slot) => slot.interactionMode === 'process')
    .flatMap((slot) => versionsOf(slot, 3).map((question, index) => [`family ${slot.questionId} v${index + 1}`, question])),
];

test('board: the published lessons and their family versions are the boards this review covers', () => {
  assert.deepEqual(BASELINE.map((question) => question.questionId), ['lmr-cw-1', 'lmr-cw-2', 'lmr-cw-3', 'lmr-pr-1', 'lmr-pr-2', 'lmr-dol-1'], 'the baseline lesson\'s six boards');
  assert.ok(FAMILY_SLOTS.length >= 6, 'the family lesson has its boards');
  const familyProcess = PROCESS_QUESTIONS.filter(([label]) => label.startsWith('family'));
  assert.ok(familyProcess.length >= 12, `generated Process Mode versions (${familyProcess.length})`);
  familyProcess.forEach(([label, question]) => {
    assert.equal(isProcessModeQuestion(question), true, `${label}: Process Mode`);
    assert.doesNotMatch(JSON.stringify(question.source), /\{\{/, `${label}: a built version, not the template`);
  });
});

test('board, Worksheet Mode: every GIVEN — the review is text, and the board it states is complete and correct', () => {
  WORKSHEET_QUESTIONS.forEach(([label, question]) => {
    assert.equal(isProcessModeQuestion(question), false, `${label}: Worksheet Mode`);
    const model = buildRepresentationBridgeReview(question);
    assertTextOnly(model, label);
    // One item per card the question asks for, in board order, then the context.
    const cardLabels = resolveRequiredCards(question).map((cardId) => PART_LABELS[{ graphIntercepts: 'graph1', graphSlopeIntercept: 'graph2', graphPointSlope: 'graph3' }[cardId] || cardId]);
    assert.deepEqual(model.items.slice(0, cardLabels.length).map((item) => item.label), cardLabels, `${label}: one item per required card`);
    const result = grade(question, boardWorkFromReview(question, model));
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.isComplete, true, `${label}: complete`);
    assert.equal(result.isCorrect, true, `${label}: correct (${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))})`);
    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the index returns this model`);
  });
});

test('board, Process Mode: the steps follow the grader\'s key process, and the board plus that process is complete and correct', () => {
  PROCESS_QUESTIONS.forEach(([label, question]) => {
    const model = buildRepresentationBridgeReview(question);
    assertTextOnly(model, label);
    const work = boardWorkFromReview(question, model);
    const result = grade(question, work);
    assert.equal(result.graded, true, `${label}: graded`);
    assert.equal(result.isComplete, true, `${label}: complete`);
    assert.equal(result.isCorrect, true, `${label}: correct (${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))})`);
    // The fact cards it lists are the ones the process puts on the board.
    const process = resolveLmrProcess(question, { processLog: work.processLog });
    const shown = materializeProcessBoard(question, work, process).board;
    [['Slope', 'featureSlope'], ['x-intercept', 'featureXIntercept'], ['y-intercept', 'featureYIntercept']].forEach(([itemLabel, field]) => {
      if (itemValue(model, itemLabel) !== undefined) assert.equal(itemValue(model, itemLabel), shown[field], `${label}: ${itemLabel} is the established fact`);
    });
    if (itemValue(model, PART_LABELS.twoPoints) !== undefined) {
      assert.equal(itemValue(model, PART_LABELS.twoPoints), `${shown.featurePoint1} and ${shown.featurePoint2}`, `${label}: the two points are the ones the process established`);
    }
    assert.match(model.note, /In Process Mode a key fact counts only when one of the board's methods established it/, `${label}: the note says how facts count`);
    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the index returns this model`);
  });
});

test('board: the review states this line\'s own numbers and derives them by the method the board allows', () => {
  const standard = buildRepresentationBridgeReview(board({ kind: 'standardForm', equation: '2x - 4y = 12' }));
  assert.equal(itemValue(standard, 'Slope-intercept form'), 'y = (1/2)x - 3');
  assert.equal(itemValue(standard, 'x-intercept'), '(6, 0)');
  assert.equal(itemValue(standard, 'y-intercept'), '(0, -3)');
  assert.equal(itemValue(standard, 'Graph 1 (intercepts)'), 'plot (6, 0) and (0, -3)');
  assert.ok(standard.steps[0].startsWith('Solve the GIVEN 2x − 4y = 12 for y with Step Algebra: −4y = −2x + 12, then y = (1/2)x − 3.'), standard.steps[0]);

  const slopeIntercept = buildRepresentationBridgeReview(board({ kind: 'slopeIntercept', equation: 'y = -2x + 4' }));
  assert.equal(itemValue(slopeIntercept, 'Standard form'), '2x + y = 4');
  assert.match(slopeIntercept.why, /\(2, 0\) and \(0, 4\) both satisfy 2x \+ y = 4/);

  const pointSlope = buildRepresentationBridgeReview(board({ kind: 'pointSlope', equation: 'y - 2 = -1(x - 3)' }));
  assert.equal(itemValue(pointSlope, 'Graph 3 (point-slope)'), 'plot (3, 2) and (4, 1)', 'Graph 3 starts at the GIVEN point');

  // An author who allows only the slope formula gets a review that uses it.
  const restricted = buildRepresentationBridgeReview(PROCESS_QUESTIONS.find(([label]) => label.includes('slope formula'))[1]);
  assert.ok(restricted.steps.some((step) => step.startsWith('Slope: use the slope formula on')), restricted.steps.join('\n'));
  assert.ok(!restricted.steps.some((step) => step.startsWith('Solve the GIVEN')), 'not a method this board does not allow for the slope');
  assert.match(restricted.note, /slope — Slope formula/);

  const scenario = BASELINE.find((question) => question.questionId === 'lmr-pr-2');
  const story = buildRepresentationBridgeReview(scenario);
  assert.equal(itemValue(story, 'Reasonable domain'), '0 ≤ x ≤ 9');
  assert.equal(itemValue(story, 'Meaning of the slope'), 'The candle gets 2 inches shorter every hour.');
  assert.equal(itemValue(story, 'Slope-intercept form'), 'y = -2x + 18');
});

test('board: a review that misstates a card is caught by the grader (the check can fail)', () => {
  const question = board({ kind: 'standardForm', equation: '2x - 4y = 12' });
  const work = boardWorkFromReview(question, buildRepresentationBridgeReview(question));
  [
    { slopeInterceptEquation: 'y = (1/2)x + 3' },
    { pointSlopeEquation: 'y - 2 = (1/2)(x - 2)' },
    { featureXIntercept: '(-6, 0)' },
    { graph1Points: [[6, 0], [0, 3]] },
    { tableRows: [{ x: '0', y: '-3' }, { x: '2', y: '-2' }, { x: '4', y: '-1' }, { x: '6', y: '1' }] },
  ].forEach((change) => assert.equal(grade(question, { ...work, ...change }).isCorrect, false, JSON.stringify(change)));
  // In Process Mode the facts need their process: the same typed board without it is not complete.
  const processQuestion = processBoard({ kind: 'standardForm', equation: '2x - 4y = 12' });
  const processWork = boardWorkFromReview(processQuestion, buildRepresentationBridgeReview(processQuestion));
  const { processLog: _log, ...withoutProcess } = processWork;
  assert.equal(grade(processQuestion, withoutProcess).isCorrect, false, 'typed facts are worth nothing in Process Mode');
});

/* ---------------------------------------------------------------- refusals */

test('null — never a throw and never a wrong review — for input it cannot explain', () => {
  const nonLinear = bridge([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }]);
  const cases = [
    ['null', null],
    ['undefined', undefined],
    ['{}', {}],
    ['an array', []],
    ['a string', 'representationBridge'],
    ['a bridge with no table', { type: TOOL_ID, mode: 'linear' }],
    ['a bridge whose rows are not a list', bridge('abc')],
    ['a bridge with a blank cell', bridge([{ x: 0, y: 1 }, { x: 1, y: '' }, { x: 2, y: 5 }])],
    ['a nonlinear table', nonLinear],
    ['a table with a repeated x', bridge([{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 4 }])],
    ['a zero-slope table asked for its zero', bridge([{ x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }])],
    ['meanings with no context', bridge([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }], { context: undefined, requiredStages: ['meaning'] })],
    ['a board with no source', board(undefined)],
    ['a board with an unknown source kind', board({ kind: 'polygon' })],
    ['a vertical line', board({ kind: 'twoPoints', points: [[2, 1], [2, 5]] })],
    ['a horizontal worksheet board asked for its x-intercept', board({ kind: 'slopeIntercept', equation: 'y = 5' }, { requiredCards: ['xIntercept', 'slope'] })],
    ['an unbuilt family template', FAMILY_SLOTS.find((slot) => slot.questionFamily && !slot.source)],
    // Every card it asks for is the GIVEN, so the grader has nothing to mark:
    // only the grader self-check stands between this and a review of nothing.
    ['a board that asks only for its GIVEN', board({ kind: 'table', rows: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }] }, { requiredCards: ['table'] })],
    ['a scenario whose meaning has no answer', board({ kind: 'scenario', prompt: 'A tank drains.', m: -3, b: 24 }, { context: { slopeMeaning: { choices: ['a', 'b'] } } })],
  ];
  cases.forEach(([label, question]) => {
    assert.doesNotThrow(() => buildRepresentationBridgeReview(question), label);
    assert.equal(buildRepresentationBridgeReview(question), null, label);
    assert.doesNotThrow(() => buildToolSolutionReviewModel(question && typeof question === 'object' ? { ...question, toolId: TOOL_ID } : question), label);
  });
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null, 'the index says nothing for an empty question');
  assert.equal(buildToolSolutionReviewModel(null), null);
  // The nonlinear table really is one the grader cannot be right about: its
  // fitted "line" is a regression the bridge never teaches.
  assert.ok(deriveLinearMultipleRepresentations({ source: { kind: 'twoPoints', points: [[2, 1], [2, 5]] } }).isValid === false);
});
