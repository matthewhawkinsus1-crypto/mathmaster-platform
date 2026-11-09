/*
 * TC05: CORRECTIONS NAME A PREDICTABLE SLIP ON ALGEBRA AND STEP ALGEBRA ITEMS.
 *
 * W7-6 left Corrections unable to name a mistake on an `algebra` or
 * `stepAlgebra` Path item: the classifiers that name equation slips
 * (linear.twoStepEquation@1, linear.multiStepEquation@1) read a Question
 * Family's generated values, which a Path item does not carry. A Path item
 * shows its equation instead, so the detectors read the equation the student
 * was shown, strictly (one term in the variable and one number a side, or the
 * equation is not read), and only when its solution is the item's own key.
 * Then the classifiers' own candidates decide: a term moved across without
 * changing its sign, or only part of a side divided. A field item that asks
 * for the solution of the one equation its prompt shows is read the same way.
 *
 * On the balance workspace every committed move is balanced, so a finished
 * equation there always has the right value: a slip reaches these detectors as
 * a value typed in a box (a field item, or an `algebra` item's retired box sent
 * by an older client) or as a final equation the server did not watch being
 * made.
 *
 * Proved on real issued items (buildIssuePlan -> storableItem ->
 * gradeIssuedItem, what the callables do): each slip is named, and the right
 * answer, an unmodeled value, a value two causes explain, an equation that is
 * not the key's and an equation of another shape name nothing. Never on a
 * withheld section: a secure Test records the finding server-side only, and
 * nothing a student is handed before release carries it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { diagnoseCorrectionMiss, pathMisconceptionEvidence } from '../../functions/shared/correctionMissDiagnosis.mjs';
import { trustedMisconceptionFindings } from '../../functions/shared/misconceptionCodes.mjs';
import { studentMisconceptionMessage } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { buildCorrectionPlan, buildPerformanceProfile } from '../../functions/shared/testCycleCorrections.mjs';
import { correctionTargetMistakePattern } from '../../src/platform/student/testCycleDiscovery.js';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const mathPath = require('./lib/mathPath');
const secureItems = require('./lib/secureItems');
const secureExamItems = require('./lib/secureExamItems');
const secureExam = require('./lib/secureExam');
const testCycleLib = require('./lib/testCycle');

const issue = async (question, extra = {}) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `the fixture issues as a real item (${plan.reason})`);
  return secureItems.storableItem({ ...question, questionInstanceId: extra.questionInstanceId || 'q-1', ...extra, privateGrading: plan.privateGrading, ...plan.toolPayload });
};

// Grade, then read the finding the way both callers do.
const answer = async (stored, payload) => {
  const grading = await secureItems.gradeIssuedItem(stored, payload);
  const item = secureItems.readStoredItem(stored);
  const input = {
    privateGrading: item.privateGrading,
    grading,
    raw: item.privateGrading.pathToolId ? await secureItems.rawWorkOf(payload) : null,
    responses: payload.responses || null,
    question: item,
  };
  return { grading, input, code: diagnoseCorrectionMiss(input)?.code || null, evidence: pathMisconceptionEvidence(input) };
};
const finalEquation = (equation) => ({ raw: { finalEquation: equation } });
const typed = (value) => ({ responses: { answer: value } });

// 3x + 5 = 20: x = 5. Moving +5 unchanged gives (20 + 5)/3; dividing only 3x gives 20/3 − 5.
const TWO_STEP = { type: 'stepAlgebra', prompt: 'Solve $3x + 5 = 20$ in the balance workspace.', equation: '3x + 5 = 20', answer: '5', variable: 'x' };
// 9x + 4 = 3x + 22: x = 3. The number, the variable term, or both moved unchanged: 13/3, 3/2, 13/6.
const MULTI_STEP = { type: 'stepAlgebra', prompt: 'Solve $9x + 4 = 3x + 22$.', equation: '9x + 4 = 3x + 22', answer: '3', variable: 'x' };
// 2x − 7 = 9: x = 8, shown on the balance workspace; an older client sent the box's value.
const ALGEBRA = { type: 'algebra', prompt: 'Solve the equation.', equationLatex: '2x - 7 = 9', answer: '8', variable: 'x' };
// The bank's typed two-step item: 4x + (−5) = 23, x = 7.
const FIELD = { prompt: 'Solve $4x+(-5)=23$.', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected: '7' }] };

test('a Step Algebra item names a sign kept when a term moved, and only part of a side divided', async () => {
  const stored = await issue(TWO_STEP);
  const right = await answer(stored, finalEquation('x = 5'));
  assert.equal(right.grading.isCorrect, true, 'the premise: x = 5 is the answer');
  assert.equal(right.code, null, 'a right answer is never named');
  assert.equal((await answer(stored, finalEquation('x = 25/3'))).code, 'inverse-operation-sign');
  assert.equal((await answer(stored, finalEquation('x=\\frac{25}{3}'))).code, 'inverse-operation-sign', 'as the editor writes it');
  assert.equal((await answer(stored, finalEquation('25/3 = x'))).code, 'inverse-operation-sign', 'either way round');
  assert.equal((await answer(stored, finalEquation('x = 5/3'))).code, 'partial-division');
  // −5 has two causes, 15 is "did not divide", 7 is unmodeled: none is named.
  for (const value of ['-5', '15', '7']) {
    const result = await answer(stored, finalEquation(`x = ${value}`));
    assert.equal(result.grading.isCorrect, false, `the premise: x = ${value} is wrong`);
    assert.equal(result.code, null, `x = ${value}`);
  }
  // A finished equation that is not solved for the variable gives no value.
  assert.equal((await answer(stored, finalEquation('3x = 25'))).code, null);
  // Where a slip's value is also one the blockers explain, two explanations
  // are none: 2x + 6 = 0 (x = −3) gives 3 kept-sign and −x alike; 3x + 4 = 8
  // (x = 4/3) gives 4 kept-sign and "did not divide" (8 − 4) alike.
  for (const [equation, key, value] of [['2x + 6 = 0', '-3', '3'], ['3x + 4 = 8', '4/3', '4']]) {
    const item = await issue({ ...TWO_STEP, prompt: `Solve $${equation}$.`, equation, answer: key });
    const result = await answer(item, finalEquation(`x = ${value}`));
    assert.equal(result.grading.isCorrect, false, `the premise: ${value} does not solve ${equation}`);
    assert.equal(result.code, null, `${equation}: ${value}`);
  }
});

test('with the variable on both sides, a term moved without changing its sign is named, whichever term', async () => {
  const stored = await issue(MULTI_STEP);
  for (const value of ['13/3', '3/2', '13/6']) {
    assert.equal((await answer(stored, finalEquation(`x = ${value}`))).code, 'inverse-operation-sign', value);
  }
  assert.equal((await answer(stored, finalEquation('x = -3'))).code, null, '−x has two causes');
  assert.equal((await answer(stored, finalEquation('x = 3'))).code, null, 'the answer');
});

test('an algebra item reads the value its box sent, or its final equation, against the equation it showed', async () => {
  const stored = await issue(ALGEBRA);
  // (9 + (−7))/2 = 1 and 9/2 − (−7) = 11.5.
  assert.equal((await answer(stored, { raw: { value: '1' } })).code, 'inverse-operation-sign');
  assert.equal((await answer(stored, { raw: { value: '11.5' } })).code, 'partial-division');
  assert.equal((await answer(stored, finalEquation('x = 1'))).code, 'inverse-operation-sign');
  assert.equal((await answer(stored, { raw: { value: '8' } })).grading.isCorrect, true, 'the premise: 8 is the answer');
  assert.equal((await answer(stored, { raw: { value: '8' } })).code, null);
});

test('a field item that asks for the solution of the one equation it shows is read the same way', async () => {
  const stored = await issue(FIELD);
  // (23 + (−5))/4 = 4.5, read through the bracketed −5; 23/4 + 5 = 10.75.
  assert.equal((await answer(stored, typed('4.5'))).code, 'inverse-operation-sign');
  assert.equal((await answer(stored, typed('10.75'))).code, 'partial-division');
  assert.equal((await answer(stored, typed('7'))).grading.isCorrect, true, 'the premise: 7 is the answer');
  assert.equal((await answer(stored, typed('7'))).code, null);
  assert.equal((await answer(stored, typed('9'))).code, null, 'unmodeled');
  // x + 12 = 20, the grade 6 one-step item: 32 keeps the sign of +12.
  const oneStep = await issue({ prompt: 'Solve $x+12=20$.', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected: '8' }] });
  assert.equal((await answer(oneStep, typed('32'))).code, 'inverse-operation-sign');
});

test('nothing is named from an equation that is not the key\'s, or of a shape no rule reads', async () => {
  // The equation shown must be solved by the key: were it shown otherwise, nothing is named.
  const real = await answer(await issue(TWO_STEP), finalEquation('x = 25/3'));
  assert.equal(diagnoseCorrectionMiss({ ...real.input, question: { ...real.input.question, equation: '3x + 5 = 21' } }), null);
  // 25/3 is the kept sign of 3x + 4 = 21 too, but that equation's solution is not the key.
  assert.equal(diagnoseCorrectionMiss({ ...real.input, question: { ...real.input.question, equation: '3x + 4 = 21' } }), null);
  assert.equal(diagnoseCorrectionMiss({ ...real.input, question: { ...real.input.question, equation: undefined } }), null);
  assert.equal(diagnoseCorrectionMiss({ ...real.input, question: null }), null);
  // Brackets around a sum, a fraction, a power or another letter: no rule for those shapes.
  // Two terms in the variable on a side is a step (combining) no rule models: 7 is not named.
  for (const [equation, answerKey, wrong] of [['2(x + 3) = 14', '4', 'x = 17/2'], ['x/2 + 3 = 7', '8', 'x = 20'], ['x^2 + 5 = 21', '4', 'x = 13'], ['3x + 5 = 2y', '5', 'x = 25/3'], ['3x + 2x + 5 = 30', '5', 'x = 7']]) {
    const stored = await issue({ ...TWO_STEP, prompt: `Solve $${equation}$.`, equation, answer: answerKey });
    assert.equal((await answer(stored, finalEquation(wrong))).code, null, equation);
  }
  // A field prompt with two equations (a system) is not one equation to solve.
  const system = await issue({ prompt: 'Solve $y=2x+1$ and $y=-x+7$ for $x$.', responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: '2' }] });
  assert.equal((await answer(system, typed('-2'))).code, null);
  // A key with two different values (a field accepting either root) is not one solution.
  const two = await issue({ prompt: 'Solve $3x+5=20$.', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected: '5', accepted: ['-5'] }] });
  assert.equal((await answer(two, typed('25/3'))).code, null);
});

test('the message is fixed text that names no value, under the tool\'s own declared classifier', async () => {
  for (const [question, payload, classifier, part] of [
    [TWO_STEP, finalEquation('x = 25/3'), 'path:stepAlgebra', 'algebra-objective'],
    [ALGEBRA, { raw: { value: '1' } }, 'path:algebra', 'value'],
    [FIELD, typed('4.5'), 'path:fields', 'answer'],
  ]) {
    const result = await answer(await issue(question), payload);
    const message = diagnoseCorrectionMiss(result.input).message;
    assert.equal(message, studentMisconceptionMessage('inverse-operation-sign'));
    assert.doesNotMatch(message, /\d/, 'no value from the item or the work');
    assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: result.evidence }).map((entry) => [entry.code, entry.classifier, entry.parts]), [
      ['inverse-operation-sign', classifier, [part]],
    ]);
  }
});

/* --- withheld on the secure Test; named in Corrections after release ------ */

const BLUEPRINT = {
  title: 'Unit 2 Test (synthetic)', passingScore: 70,
  targets: [{ targetId: 't1', alignmentKey: 'texas:A.5A', label: 'Linear equations', dok: 2, difficultyBand: 3, questionCount: 1, familyIds: ['f1'] }],
};

test('a secure Test records the slip only where it is graded; before release nothing the student is handed carries it, and Corrections name it after', async () => {
  const stored = await issue(FIELD, { slotId: 't1#1', targetId: 't1', familyId: 'f1', questionInstanceId: 'q-1' });
  const session = { examSessionId: 'exam-1', studentId: 'S1', examType: 'courseTest', status: 'in_progress', requiredQuestions: 1, courseTest: { assignmentId: 'A1', cycleStage: 'test' }, responses: {} };
  const response = await secureExamItems.buildResponseRecord(stored, { session, responsePayload: typed('4.5'), supportUsage: {}, now: 1000 });
  assert.deepEqual([response.grading.score, response.grading.isCorrect], [0, false], 'the score is the grader\'s');
  assert.deepEqual(trustedMisconceptionFindings(response.grading).map((entry) => entry.code), ['inverse-operation-sign']);
  // Withheld: the session a student reads strips every response, and with it the finding.
  const open = { ...session, issuancePlan: { entries: [{ slotId: 't1#1', targetId: 't1', familyId: 'f1', questionInstanceId: 'q-1', dok: 2, difficultyBand: 3 }] }, responses: { 'q-1': response } };
  const handed = JSON.stringify(secureExam.publicSession(open));
  assert.doesNotMatch(handed, /inverse-operation-sign|misconception/i);
  assert.doesNotMatch(handed, new RegExp(studentMisconceptionMessage('inverse-operation-sign').slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // Released: the Corrections plan built from the session names it on the student's screen.
  const released = { ...open, status: 'submitted' };
  const plan = buildCorrectionPlan({
    blueprint: BLUEPRINT,
    profile: buildPerformanceProfile({ blueprint: BLUEPRINT, responses: testCycleLib.responsesForProfile(released) }),
    policy: { mode: 'testCycle' },
    releasedTestGrade: 0,
    assignmentId: 'A1',
    studentId: 'S1',
    examSessionId: released.examSessionId,
  });
  const [target] = plan.targets;
  assert.deepEqual([target.diagnosis, target.misconception], ['misconception', 'inverse-operation-sign']);
  assert.equal(correctionTargetMistakePattern(target), studentMisconceptionMessage('inverse-operation-sign'));
});
