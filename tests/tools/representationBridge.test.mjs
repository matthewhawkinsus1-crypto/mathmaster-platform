import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bridgeMeaningQuestion,
  deriveLinearBridge,
  REPRESENTATION_BRIDGE_STAGES,
  resolveGraphBounds,
  resolveRequiredStages,
  scoreRepresentationBridge,
  validateRepresentationBridgeQuestion,
} from '../../src/tools/representationBridge/representationBridgeMath.js';

const boothFeeQuestion = {
  type: 'representationBridge',
  mode: 'linear',
  source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] },
  context: {
    inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
    rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
    yInterceptMeaning: 'starting profit after paying the booth fee',
    zeroMeaning: 'number of items that must be sold to break even',
  },
  requiredStages: ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'],
  requiredComparisons: 3,
  graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 },
};

const goodResponse = () => ({
  tableEvidence: [
    { i: 0, j: 1, dx: 2, dy: 10, rate: 5 },
    { i: 1, j: 2, dx: 2, dy: 10, rate: 5 },
    { i: 2, j: 3, dx: 2, dy: 10, rate: 5 },
  ],
  studentSlope: 5,
  rateConclusion: 'constant',
  generalForm: { m: 5, b: -20, equation: 'y = 5x - 20' },
  factoredForm: { a: 5, c: 4, equation: 'y = 5(x - 4)' },
  graphConstruction: { points: [[4, 0], [5, 5]] },
  meaningAssignments: {
    rate: { unit: 'dollars per item', contextMeaning: 'profit earned for each item sold', mathRole: 'rate of change / slope' },
    yIntercept: { unit: 'dollars', contextMeaning: 'starting profit after paying the booth fee', mathRole: 'y-intercept / constant term' },
    zero: { unit: 'items', contextMeaning: 'number of items that must be sold to break even', mathRole: 'zero / x-intercept' },
  },
});

// ---------------------------------------------------------------- derivation
test('the canonical line is derived from the table, never separately authored', () => {
  assert.deepEqual(validateRepresentationBridgeQuestion(boothFeeQuestion), []);
  const derived = deriveLinearBridge(boothFeeQuestion);
  assert.equal(derived.m, 5);
  assert.equal(derived.b, -20);
  assert.equal(derived.zero, 4);
});

// -------------------------------------------------------------- table/rate
test('table/rate: equal spacing evidence scores correctly', () => {
  const result = scoreRepresentationBridge(boothFeeQuestion, goodResponse());
  assert.equal(result.parts.rateEvidence, true);
});

test('table/rate: irregular spacing is still graded correctly', () => {
  const question = {
    ...boothFeeQuestion,
    source: { kind: 'table', rows: [{ x: -3, y: -35 }, { x: 1, y: -15 }, { x: 4, y: 0 }, { x: 9, y: 25 }] },
  };
  assert.deepEqual(validateRepresentationBridgeQuestion(question), []);
  const response = {
    ...goodResponse(),
    tableEvidence: [
      { i: 0, j: 1, dx: 4, dy: 20, rate: 5 },
      { i: 1, j: 2, dx: 3, dy: 15, rate: 5 },
      { i: 2, j: 3, dx: 5, dy: 25, rate: 5 },
    ],
  };
  const result = scoreRepresentationBridge(question, response);
  assert.equal(result.parts.rateEvidence, true);
});

test('table/rate: a negative rate is graded correctly and requires the conclusion step', () => {
  const question = {
    ...boothFeeQuestion,
    source: { kind: 'table', rows: [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 6 }, { x: 4, y: 2 }] },
  };
  const response = {
    ...goodResponse(),
    studentSlope: -2,
    tableEvidence: [
      { i: 0, j: 1, dx: 2, dy: -4, rate: -2 },
      { i: 1, j: 2, dx: 2, dy: -4, rate: -2 },
      { i: 2, j: 3, dx: 2, dy: -4, rate: -2 },
    ],
  };
  const result = scoreRepresentationBridge(question, response);
  assert.equal(result.parts.rateEvidence, true);

  const missingConclusion = { ...response, rateConclusion: '' };
  assert.equal(scoreRepresentationBridge(question, missingConclusion).parts.rateEvidence, false);
});

test('table/rate: a fractional rate is accepted when typed as a fraction', () => {
  const question = {
    ...boothFeeQuestion,
    source: { kind: 'table', rows: [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 3 }] },
  };
  const response = {
    ...goodResponse(),
    studentSlope: '1/2',
    tableEvidence: [
      { i: 0, j: 1, dx: 2, dy: 1, rate: '1/2' },
      { i: 1, j: 2, dx: 2, dy: 1, rate: '1/2' },
      { i: 2, j: 3, dx: 2, dy: 1, rate: '1/2' },
    ],
  };
  const result = scoreRepresentationBridge(question, response);
  assert.equal(result.parts.rateEvidence, true);
});

// -------------------------------------------------------------- general form
test('general form: correct y = mx + b is accepted', () => {
  const result = scoreRepresentationBridge(boothFeeQuestion, goodResponse());
  assert.equal(result.parts.generalForm, true);
});

test('general form: an equivalent standard-form equation does not satisfy the structural stage', () => {
  const response = { ...goodResponse(), generalForm: { m: 5, b: -20, equation: '5x - y = 20' } };
  const result = scoreRepresentationBridge(boothFeeQuestion, response);
  assert.equal(result.parts.generalForm, false);
  assert.equal(result.evidence.generalForm.structural, false);
});

// -------------------------------------------------------------- factored form
test('factored form: correct factored form is accepted', () => {
  const result = scoreRepresentationBridge(boothFeeQuestion, goodResponse());
  assert.equal(result.parts.factoredForm, true);
});

test('factored form: the wrong zero is rejected', () => {
  const response = { ...goodResponse(), factoredForm: { a: 5, c: 3, equation: 'y = 5(x - 3)' } };
  const result = scoreRepresentationBridge(boothFeeQuestion, response);
  assert.equal(result.parts.factoredForm, false);
});

test('factored form: negative c is accepted when correctly derived', () => {
  const { graphBounds: _unusedBounds, ...boothFeeWithoutBounds } = boothFeeQuestion;
  const question = {
    ...boothFeeWithoutBounds,
    source: { kind: 'table', rows: [{ x: -4, y: 0 }, { x: -2, y: 6 }, { x: 0, y: 12 }, { x: 2, y: 18 }] },
  };
  assert.deepEqual(validateRepresentationBridgeQuestion(question), []);
  const derived = deriveLinearBridge(question);
  assert.equal(derived.zero, -4);
  const response = {
    ...goodResponse(),
    studentSlope: 3, generalForm: { m: 3, b: 12, equation: 'y = 3x + 12' },
    factoredForm: { a: 3, c: -4, equation: 'y = 3(x + 4)' },
    graphConstruction: { points: [[-4, 0], [-3, 3]] },
  };
  const result = scoreRepresentationBridge(question, response);
  assert.equal(result.parts.factoredForm, true);
});

test('factored form: negative slope is accepted when correctly derived', () => {
  const question = {
    ...boothFeeQuestion,
    source: { kind: 'table', rows: [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 6 }, { x: 4, y: 2 }] },
  };
  const response = {
    ...goodResponse(), studentSlope: -2, generalForm: { m: -2, b: 10, equation: 'y = -2x + 10' },
    factoredForm: { a: -2, c: 5, equation: 'y = -2(x - 5)' },
    graphConstruction: { points: [[5, 0], [4, 2]] },
  };
  const result = scoreRepresentationBridge(question, response);
  assert.equal(result.parts.factoredForm, true);
});

test('factored form: a fractional slope is accepted when correctly derived', () => {
  const question = {
    ...boothFeeQuestion,
    source: { kind: 'table', rows: [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 3 }] },
  };
  const response = {
    ...goodResponse(), studentSlope: '1/2', generalForm: { m: 0.5, b: 0, equation: 'y = 0.5x' },
    factoredForm: { a: 0.5, c: 0, equation: 'y = 0.5(x - 0)' },
    graphConstruction: { points: [[0, 0], [2, 1]] },
  };
  const result = scoreRepresentationBridge(question, response);
  assert.equal(result.parts.factoredForm, true);
});

// -------------------------------------------------------------- graph
test('graph: the x-intercept anchor is required, not merely any correct line', () => {
  const response = { ...goodResponse(), graphConstruction: { points: [[5, 5], [6, 10]] } };
  const result = scoreRepresentationBridge(boothFeeQuestion, response);
  assert.equal(result.parts.graph, false);
  assert.equal(result.evidence.graph.category, 'correctLineMissingAnchor');
});

test('graph: a correct line without the anchor is rejected, anchor plus slope is accepted', () => {
  const withAnchor = scoreRepresentationBridge(boothFeeQuestion, goodResponse());
  assert.equal(withAnchor.parts.graph, true);
  assert.equal(withAnchor.evidence.graph.category, 'correct');

  const wrongSlope = scoreRepresentationBridge(boothFeeQuestion, {
    ...goodResponse(), graphConstruction: { points: [[4, 0], [5, 1]] },
  });
  assert.equal(wrongSlope.parts.graph, false);
  assert.equal(wrongSlope.evidence.graph.category, 'correctAnchorWrongSlope');
});

// -------------------------------------------------------------- meaning
test('meaning: rate, y-intercept, and zero meanings score independently', () => {
  const result = scoreRepresentationBridge(boothFeeQuestion, goodResponse());
  assert.equal(result.parts.meaning, true);
  assert.ok(result.evidence.meaning.perExpression.every((entry) => entry.complete));
});

test('meaning: one incorrect dimension gives partial evidence, not full completion', () => {
  const response = goodResponse();
  response.meaningAssignments.rate = { ...response.meaningAssignments.rate, mathRole: 'zero / x-intercept' };
  const result = scoreRepresentationBridge(boothFeeQuestion, response);
  assert.equal(result.parts.meaning, false);
  const rateEntry = result.evidence.meaning.perExpression.find((entry) => entry.id === 'rate');
  assert.equal(rateEntry.complete, false);
  assert.equal(rateEntry.checks.unit, true);
  assert.equal(rateEntry.checks.contextMeaning, true);
  assert.equal(rateEntry.checks.mathRole, false);
});

// -------------------------------------------------------------- coherence
test('coherence: individually plausible but contradictory representations fail overall', () => {
  const response = { ...goodResponse(), factoredForm: { a: 5, c: 3, equation: 'y = 5(x - 3)' } };
  const result = scoreRepresentationBridge(boothFeeQuestion, response);
  assert.equal(result.isCorrect, false);
});

test('coherence: all representations of the same line pass together', () => {
  const result = scoreRepresentationBridge(boothFeeQuestion, goodResponse());
  assert.equal(result.parts.crossRepresentationConsistency, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
});

// -------------------------------------------------------------- authoring / preflight
test('a genuinely nonlinear source table is rejected', () => {
  const errors = validateRepresentationBridgeQuestion({
    ...boothFeeQuestion,
    source: { kind: 'table', rows: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }] },
  });
  assert.ok(errors.some((message) => /genuinely linear/.test(message)));
});

test('a malformed source table (too few rows, non-finite values) is rejected', () => {
  assert.ok(validateRepresentationBridgeQuestion({ ...boothFeeQuestion, source: { kind: 'table', rows: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }).length > 0);
  assert.ok(validateRepresentationBridgeQuestion({ ...boothFeeQuestion, source: { kind: 'table', rows: [{ x: 0, y: 'nope' }, { x: 1, y: 1 }, { x: 2, y: 2 }] } }).length > 0);
  assert.ok(validateRepresentationBridgeQuestion({ ...boothFeeQuestion, source: { kind: 'graph', points: [] } })
    .some((message) => /source\.kind "table"/.test(message)));
});

test('factored/graph/meaning stages are rejected when the derived slope is zero', () => {
  const errors = validateRepresentationBridgeQuestion({
    ...boothFeeQuestion,
    source: { kind: 'table', rows: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }] },
  });
  assert.ok(errors.some((message) => /nonzero derived slope/.test(message)));
});

test('graphBounds that would not display the required anchors is rejected', () => {
  const errors = validateRepresentationBridgeQuestion({
    ...boothFeeQuestion,
    graphBounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
  });
  assert.ok(errors.some((message) => /x-intercept/.test(message)));
});

test('a valid question with no authored graphBounds falls back to a safe default that includes both intercepts', () => {
  const { graphBounds, ...withoutBounds } = boothFeeQuestion;
  assert.deepEqual(validateRepresentationBridgeQuestion(withoutBounds), []);
  const bounds = resolveGraphBounds(withoutBounds, deriveLinearBridge(withoutBounds));
  assert.ok(bounds.xMin <= 4 && bounds.xMax >= 4);
  assert.ok(bounds.yMin <= -20 && bounds.yMax >= -20);
});

test('requiredStages defaults to every stage and can be narrowed', () => {
  const { requiredStages, ...withoutRequiredStages } = boothFeeQuestion;
  assert.deepEqual(resolveRequiredStages(withoutRequiredStages), [...REPRESENTATION_BRIDGE_STAGES]);
  assert.deepEqual(resolveRequiredStages({ requiredStages: ['rateEvidence'] }), ['rateEvidence']);
});

test('context meaning metadata is preserved exactly into the meaning-stage question', () => {
  const meaningQuestion = bridgeMeaningQuestion(boothFeeQuestion);
  assert.equal(meaningQuestion.expressions.find((expr) => expr.id === 'rate').contextMeaning, 'profit earned for each item sold');
  assert.equal(meaningQuestion.expressions.find((expr) => expr.id === 'yIntercept').contextMeaning, 'starting profit after paying the booth fee');
  assert.equal(meaningQuestion.expressions.find((expr) => expr.id === 'zero').contextMeaning, 'number of items that must be sold to break even');
});

test('meaning stage requires distinct, non-degenerate context metadata', () => {
  const errors = validateRepresentationBridgeQuestion({
    ...boothFeeQuestion,
    context: { ...boothFeeQuestion.context, zeroMeaning: boothFeeQuestion.context.rateMeaning },
  });
  assert.ok(errors.some((message) => /rateMeaning\/yInterceptMeaning\/zeroMeaning must be distinct/.test(message)));
});
