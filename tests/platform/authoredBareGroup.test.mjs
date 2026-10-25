/*
 * A GROUP THE TEACHER WROTE BEHIND A MINUS SIGN STAYS ONE TERM (TL22; H-107,
 * G-15, A1-54).
 *
 * The shared term splitter reads through every bracket in a sum (the engine
 * writes its own operands in brackets), so an authored 5 − (x + 2) reached the
 * board as 5 − x − 2 and the student never took the sign step the item
 * teaches. Where the authored equation is read (parseEquationInput), a sum in
 * brackets behind a minus is stored as the unit product every splitter keeps
 * whole: drawn as written, keyed as written, graded as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  equationToLatex,
  keepAuthoredGroups,
  parseEquationInput,
  splitAdditiveTerms,
} from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { compactStepStateKey, emptyQuestionRecord } from '../../functions/shared/attemptPolicy.mjs';
import { gradeEquationObjective } from '../../functions/shared/serverGrading/stepAlgebraEquationVerdict.mjs';
import { STEP_ACTIONS, equationStepWork, verifyStepAlgebraStep } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import {
  SIMPLIFY_PART_KINDS,
  commitSimplifyPart,
  detectSimplifyParts,
  partNeedsSigns,
} from '../../src/platform/algebra/simplify/simplifyEngine.js';

const regionsOf = (left, right) => [
  { key: 'left', label: 'left side', expression: left, variable: 'x' },
  { key: 'right', label: 'right side', expression: right, variable: 'x' },
];
const termTexts = (expression) => (splitAdditiveTerms(expression) || []).map((term) => term.text);
const sidesOf = (equation) => equation.split('=').map((side) => side.trim());
// What the server keys a state by (stepAlgebraStepVerification equationKey).
const keyOf = (equation) => compactStepStateKey(equationToLatex(equation));

test('5 − (x + 2): the group is one term, and the parentheses step is the student\'s', () => {
  const equation = parseEquationInput({ equation: '5 - (x + 2) = 3' });
  assert.deepEqual(termTexts(equation.left), ['5', '- 1 * (x + 2)'], 'one term, not 5 − x − 2');
  const parts = detectSimplifyParts(regionsOf(equation.left, equation.right));
  const brackets = parts.find((part) => part.kind === SIMPLIFY_PART_KINDS.PARENTHESES);
  assert.ok(brackets, `Simplify offers the brackets (${parts.map((part) => part.kind).join(', ')})`);
  assert.equal(partNeedsSigns(brackets), true, 'as the sign step: choose the sign of each term');
  assert.deepEqual(brackets.innerTerms.map((term) => [term.sign, term.magnitude]), [[1, 'x'], [1, '2']]);
  // Taking the step gives the side the student distributes to.
  const step = commitSimplifyPart(regionsOf(equation.left, equation.right), brackets.id, { signs: [-1, -1] });
  assert.equal(step.ok, true, JSON.stringify(step));
  assert.deepEqual(termTexts(step.expression), ['5', '- x', '- 2']);
  // A leading −(x + 2) the same way.
  const leading = parseEquationInput({ equation: '-(x + 2) + 5 = 3' });
  assert.deepEqual(termTexts(leading.left), ['-1 * (x + 2)', '+ 5']);
  assert.ok(detectSimplifyParts(regionsOf(leading.left, leading.right)).some((part) => part.kind === SIMPLIFY_PART_KINDS.PARENTHESES && partNeedsSigns(part)));
  // And through leftExpression / rightExpression.
  assert.deepEqual(termTexts(parseEquationInput({ leftExpression: '4 - (3 - x)', rightExpression: '10' }).left), ['4', '- 1 * (3 - x)']);
});

test('drawn and keyed exactly as authored, so a device and the server agree across a deploy', () => {
  for (const authored of ['5 - (x + 2) = 3', '3x - (2x + 5) = 7', '-(x + 2) + 5 = 3', '4 - (3 - x) = 10', '10 = 4 - (2x + 3)', '0.5x - (0.2x - 1.4) = 3', '1/2 - (x/3 + 1) = 2', '3 - ((x + 1)) = 0', '3 + (5 - (x + 2)) = 1']) {
    const [left, right] = sidesOf(authored);
    const stored = parseEquationInput({ equation: authored });
    assert.notDeepEqual([stored.left, stored.right], [left, right], `${authored}: stored as the unit product`);
    assert.equal(equationToLatex(stored), equationToLatex({ left, right }), `${authored}: the same drawing`);
    assert.equal(keyOf(stored), keyOf({ left, right }), `${authored}: the same step key`);
  }
});

test('every other side is returned exactly as authored', () => {
  for (const authored of ['5 + (x + 2) = 3', '(x + 2) - 5 = 3', '8 - (-3) = x', '2x + 3 = 7', 'y - 2 = -1(x - 3)', '-2(x - 4) = 6', 'x - (2) = 5', '6 - (3x) = 0', 'x - (x + 2)(x - 1) = 4', '5 + -(x + 2) = 3']) {
    const [left, right] = sidesOf(authored);
    const stored = parseEquationInput({ equation: authored });
    assert.deepEqual([stored.left, stored.right], [left, right], authored);
  }
  assert.equal(keepAuthoredGroups('not math ((('), 'not math (((', 'unreadable text is left alone');
});

test('the grade is unchanged: right is right, wrong is wrong, on the question as authored', () => {
  for (const question of [{ equation: '5 - (x + 2) = 3' }, { leftExpression: '5 - (x + 2)', rightExpression: '3' }]) {
    const graded = (left, right) => gradeEquationObjective({ type: 'stepAlgebra', ...question }, { equation: { left, right } }).part;
    assert.deepEqual([graded('x', '0').isComplete, graded('x', '0').isCorrect], [true, true], 'x = 0 solves it');
    assert.deepEqual([graded('x', '1').isComplete, graded('x', '1').isCorrect], [true, false], 'x = 1 does not');
    assert.equal(graded('5 - x - 2', '3').isComplete, false, 'not solved yet');
  }
});

test('the server verifies steps from the stored start, and from the start an older device reported', () => {
  const question = { questionId: 'q-tl22', type: 'stepAlgebra', prompt: 'Solve.', equation: '5 - (x + 2) = 3', workspaceDifficulty: 3 };
  const verify = (before, left) => verifyStepAlgebraStep({
    question,
    record: emptyQuestionRecord(),
    stepWork: equationStepWork({ action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', before, after: { ...before, left }, supportLevel: 3 }),
  });
  const stored = parseEquationInput(question);
  const fromStored = verify({ left: stored.left, right: stored.right, variable: 'x' }, '5 - x - 2');
  assert.equal(fromStored.verified, true, `the brackets removed, from the stored start: ${JSON.stringify(fromStored)}`);
  const fromOlderDevice = verify({ left: '5 - (x + 2)', right: '3', variable: 'x' }, '3 - x');
  assert.equal(fromOlderDevice.verified, true, `a step from the authored text, as a device before TL22 sends it: ${JSON.stringify(fromOlderDevice)}`);
  assert.equal(verify({ left: stored.left, right: stored.right, variable: 'x' }, '5 - x + 2').verified, false, 'a wrong sign is still refused');
});
