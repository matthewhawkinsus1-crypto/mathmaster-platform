import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import functionOperationsGrader from '../../functions/shared/serverGrading/tools/functionOperationsLab.mjs';
import representationBridgeGrader from '../../functions/shared/serverGrading/tools/representationBridge.mjs';
import representationMatchGrader from '../../functions/shared/serverGrading/tools/representationMatch.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { FUNCTION_OPERATIONS_ALL_RIGHT, functionOperationsFeedbackText } from '../../src/tools/functionOperations/functionOperationsFeedback.js';
import { BRIDGE_CONSISTENCY_LINE, bridgeFeedbackLines } from '../../src/tools/representationBridge/bridgeFeedback.js';
import { LINEAR_MISMATCH_FEEDBACK, linearMismatchFeedbackText } from '../../src/tools/representationMatch/linearMismatchFeedback.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * TOOL MESSAGES THAT WERE FALSE OR RAW (student pass 3, wave 7, TOOL-5;
 * STUDENT_PASS3_FEEDBACK_REASONS.md survey rows 2–4).
 *
 * Each tool's sentence is now chosen from the shared grader's own parts, so
 * it says what is true and what to change. Every case runs through the real
 * grader. The regression calculator's sentences are proved in
 * regressionCalculatorSharedGrading.test.mjs.
 *
 * All three are drawn from the tool's `feedback`, which useToolSubmission
 * keeps only where the activity shows outcome feedback (an exit ticket, quiz
 * or test before release gets null); the wiring asserts below bind each
 * sentence to that `feedback`.
 */

const source = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

/* ------------------------------------------------------- Function Operations */

const F = { type: 'linear', a: 2, h: 0, k: 1 };
const G = { type: 'linear', a: 1, h: 2, k: 0 };
const OPERATIONS = { type: 'functionOperationsLab', f: F, g: G };
const KEY = { responses: { sum: '3x - 1', difference: 'x + 3', product: '2x^2 - 3x - 2', quotient: '(2x + 1)/(x - 2)' }, restrictions: '2' };
const operationsSay = (work) => {
  const result = gradeToolCheck(functionOperationsGrader, OPERATIONS, work);
  return functionOperationsFeedbackText({ isCorrect: result.isCorrect, parts: result.parts });
};

test('Function Operations: never "some parts are correct" when none is', () => {
  assert.equal(operationsSay(KEY), FUNCTION_OPERATIONS_ALL_RIGHT);
  const none = operationsSay({ responses: { sum: 'x', difference: 'x', product: 'x', quotient: 'x' }, restrictions: '7' });
  assert.equal(none, 'No part is correct yet. Review each operation panel.');
  assert.doesNotMatch(none, /Some parts are correct|Correct so far/);
  // Two right: they are named; the rest are the outcome's "Focus on".
  const some = operationsSay({ ...KEY, responses: { ...KEY.responses, product: 'x', quotient: 'x' }, restrictions: '7' });
  assert.equal(some, 'Correct so far: (f + g)(x), (f − g)(x). Review the other parts.');
  // A blank box is named as blank.
  const blank = operationsSay({ ...KEY, responses: { ...KEY.responses, product: '' } });
  assert.equal(blank, 'Correct so far: (f + g)(x), (f − g)(x), (f / g)(x), Excluded x-value(s). Review the other part. Still blank: (fg)(x).');
  const nothing = operationsSay({ responses: {}, restrictions: '' });
  assert.match(nothing, /^No part is correct yet\. Review each operation panel\. Still blank: \(f \+ g\)\(x\), /);
});

test('Function Operations: the pill shows that sentence from the feedback the tool keeps', () => {
  const code = source('src/tools/functionOperations/FunctionOperationsLab.jsx');
  const pill = region(code, '{feedback ? (', ') : null}', 'the verdict');
  assert.match(pill, /<ResultPill ok=\{feedback\.isCorrect\}>\s*\{functionOperationsFeedbackText\(\{ isCorrect: feedback\.isCorrect, parts: feedback\.metadata\?\.parts \}\)\}/);
  assert.doesNotMatch(code, /Some parts are correct/);
});

/* ------------------------------------------------------ Representation Bridge */

const BRIDGE = {
  id: 'rb-booth-fee',
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
  feedbackTiming: 'checkpoint',
};
const bridgeWork = () => ({
  tableEvidence: [0, 1, 2].map((i) => ({ i, j: i + 1, dx: '2', dy: '10', rate: '5' })),
  studentSlope: '5',
  rateConclusion: 'constant',
  generalForm: { m: '5', b: '-20', equation: 'y = 5x - 20' },
  factoredForm: { a: '5', c: '4', equation: 'y = 5(x - 4)' },
  graphConstruction: { points: [[4, 0], [5, 5]] },
  meaningAssignments: {
    rate: { unit: 'dollars per item', contextMeaning: 'profit earned for each item sold', mathRole: 'rate of change / slope' },
    yIntercept: { unit: 'dollars', contextMeaning: 'starting profit after paying the booth fee', mathRole: 'y-intercept / constant term' },
    zero: { unit: 'items', contextMeaning: 'number of items that must be sold to break even', mathRole: 'zero / x-intercept' },
  },
});
const bridgeSay = (work) => bridgeFeedbackLines(gradeToolCheck(representationBridgeGrader, BRIDGE, work).parts).map((line) => line.text);

test('Representation Bridge: every line names its stage as the screen does, never the grader id', () => {
  assert.deepEqual(bridgeSay(bridgeWork()), []);
  const wrongFactored = bridgeSay({ ...bridgeWork(), factoredForm: { a: '5', c: '3', equation: 'y = 5(x - 3)' } });
  assert.deepEqual(wrongFactored, ['Equations, y = a(x − c): recheck a, c and the equation you wrote.', BRIDGE_CONSISTENCY_LINE]);
  const blankGeneral = bridgeSay({ ...bridgeWork(), generalForm: { m: '5', b: '', equation: 'y = 5x - 20' } });
  assert.equal(blankGeneral[0], 'Equations, y = mx + b: a box is still blank. Fill in every box in this stage.');
  const offGraph = bridgeSay({ ...bridgeWork(), graphConstruction: { points: [[5, 5], [6, 10]] } });
  assert.deepEqual(offGraph, ['Graph: recheck your two points: one must be the x-intercept, and both must be on the line.']);
  // Every stage and the blank board: no line is an id.
  const all = bridgeSay({ tableEvidence: [], studentSlope: '', rateConclusion: '', generalForm: {}, factoredForm: {}, graphConstruction: { points: [] }, meaningAssignments: {} });
  assert.equal(all.length, 6, "five stages and consistency");
  all.forEach((line) => assert.doesNotMatch(line, /Recheck: |rateEvidence|generalForm|factoredForm|\bmeaning:|crossRepresentation/, line));
  // A stage the list does not know is named by its label, then generically.
  assert.deepEqual(bridgeFeedbackLines([{ id: 'futureStage', label: 'Future stage', isComplete: true, isCorrect: false }]), [{ id: 'futureStage', text: 'Future stage: recheck your work in this stage.' }]);
  assert.deepEqual(bridgeFeedbackLines([{ id: 'futureStage', isComplete: true, isCorrect: false }]), [{ id: 'futureStage', text: 'One stage: recheck your work in this stage.' }]);
});

test('Representation Bridge: the list under a miss is those lines, from the feedback the tool keeps', () => {
  const code = source('src/tools/representationBridge/RepresentationBridge.jsx');
  const list = region(code, '{feedback && !feedback.isCorrect ? (', ') : null}', 'the miss list');
  assert.match(list, /\{bridgeFeedbackLines\(feedback\.metadata\?\.parts\)\.map\(\(\{ id, text \}\) => <li key=\{id\}>\{text\}<\/li>\)\}/);
  assert.doesNotMatch(code, /Recheck: \$\{id\}/);
});

/* ------------------------------------------------------- Representation Match */

const MISMATCH_SET = { id: 'm', slopeIntercept: 'y=-2x+5', factoredLinear: 'y=-2(x-2.5)', pointSlope: 'y-1=-2(x+2)', standard: '2x+y=5' };
const CORRECTION = { correctionOptions: [{ id: 'minus', label: 'y-1=-2(x-2)' }, { id: 'plus', label: 'y+1=-2(x+2)' }], correctionAnswerId: 'minus' };
const mismatch = (fields = {}) => ({ type: 'representationMatch', mode: 'linearConnections', task: 'findMismatch', sets: [MISMATCH_SET], mismatchSetId: 'm', ...fields });
const matchSay = (question, work) => {
  const result = gradeToolCheck(representationMatchGrader, question, work);
  return { result, text: linearMismatchFeedbackText(result.parts) };
};

test('Representation Match: the mismatch line agrees with the grader, card then correction', () => {
  const wrongCard = matchSay(mismatch(CORRECTION), { selectedId: 'm:standard', correctionChoice: 'minus' });
  assert.equal(wrongCard.result.score, 0);
  assert.equal(wrongCard.text, LINEAR_MISMATCH_FEEDBACK.wrongCard);
  // The right card with the wrong correction: the grader's 0.6. It used to be
  // told the card "is actually consistent with the others".
  const wrongFix = matchSay(mismatch(CORRECTION), { selectedId: 'm:pointSlope', correctionChoice: 'plus' });
  assert.equal(wrongFix.result.score, 0.6);
  assert.equal(wrongFix.text, LINEAR_MISMATCH_FEEDBACK.correctionWrong);
  assert.doesNotMatch(wrongFix.text, /consistent with the others/);
  const noFix = matchSay(mismatch(CORRECTION), { selectedId: 'm:pointSlope', correctionChoice: '' });
  assert.equal(noFix.text, LINEAR_MISMATCH_FEEDBACK.correctionBlank);
  const noCorrectionAsked = matchSay(mismatch(), { selectedId: 'm:standard', correctionChoice: '' });
  assert.equal(noCorrectionAsked.text, LINEAR_MISMATCH_FEEDBACK.wrongCard);
  // No line names the right card or the right correction.
  Object.values(LINEAR_MISMATCH_FEEDBACK).forEach((line) => assert.doesNotMatch(line, /=|pointSlope|standard form/, line));
});

test('Representation Match: the mismatch branch reads those parts from the feedback the tool keeps', () => {
  const code = source('src/tools/representationMatch/RepresentationMatch.jsx');
  const message = region(code, '{feedback ? (() => {', '})() : null}', 'the verdict');
  assert.match(message, /mode === 'linearConnections' && linearTask === 'group'[\s\S]*: linearMismatchFeedbackText\(feedback\.metadata\?\.parts\);/);
  assert.doesNotMatch(code, /actually consistent with the others/);
});
