/*
 * RIGHT LINE, WRONG FORM (student pass 3, R-3 / PR-11).
 *
 * Algebra I · Module 2 · Topic 2 · L3, Classwork 3.1: "Equation of line B′ in
 * slope-intercept form", key y = −3x + 5. A student who typed
 * y − 5 = −3(x − 0) had the right line and was told only "Focus on: Equation
 * of line B′ in slope-intercept form." — exactly what a wrong line gets.
 *
 * Now the server records `line-wrong-form-slope-intercept` and the device
 * shows "Right line, wrong form: write it as y = mx + b." from the SAME pure
 * classifier on the same shared grading. The verdict does not move: a form
 * the field asks for is still required. Nothing is shown where outcome
 * feedback is closed (an exit ticket, quiz or test before release).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { classifyMisconceptions } from '../../functions/shared/misconceptionClassifiers.mjs';
import { studentMisconceptionMessage } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { requestedLineForm, sameLine, writtenLineForm } from '../../functions/shared/linearEquationForm.mjs';
import { ACTIVITY_POLICIES, ACTIVITY_ROLES } from '../../functions/shared/activityPolicies.mjs';
import { diagnoseMiss } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { feedbackOpenForItem, missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { displayGradingSurface } from '../../src/platform/grading/displayGradingSurface.js';
import { fieldsResponse } from './helpers/misconceptionFixtures.mjs';

const lesson = compileTeacherImport(fs.readFileSync(new URL('../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json', import.meta.url), 'utf8'));
const question = lesson.questions.find((candidate) => candidate.questionId === 'l3-cw-1');
const ANSWERS = { mB: '1/3', mB2: '-3', product: '-1', perpendicular: 'Yes — they meet at a right angle.' };
// What MathLive sends for y − 5 = −3(x − 0).
const POINT_SLOPE = 'y-5=-3\\left(x-0\\right)';

/** The device's display grading, built as QuestionEngine builds it. */
const deviceGrading = (eqB2) => {
  const graded = gradeMultiAnswerResponse(question, { ...ANSWERS, eqB2 });
  return { graded: true, isCorrect: graded.isCorrect, parts: graded.parts.map((part) => ({ ...part })), ...displayGradingSurface(question) };
};

test('the real item: the right line in point-slope form stays wrong, and now says which form', () => {
  assert.ok(question, 'L3 compiles l3-cw-1');
  const grading = deviceGrading(POINT_SLOPE);
  assert.equal(grading.isCorrect, false, 'the form the label asks for is still required');
  assert.deepEqual(grading.parts.filter((part) => !part.isCorrect).map((part) => part.id), ['eqB2']);
  const diagnosis = diagnoseMiss({ question, grading, response: null, attemptsLeft: true });
  assert.equal(diagnosis?.code, 'line-wrong-form-slope-intercept');
  assert.equal(diagnosis?.message, 'Right line, wrong form: write it as y = mx + b.');
  // It is the sentence under "Not quite" (missFeedback picks the diagnosis).
  assert.equal(missFeedback({ question, attemptNumber: 1, diagnosis, parts: grading.parts })?.message, diagnosis.message);
  // The same answer in the asked form is right; a different line gets no reason.
  assert.equal(deviceGrading('y=-3x+5').isCorrect, true);
  assert.equal(diagnoseMiss({ question, grading: deviceGrading('y=-3x+4'), attemptsLeft: true }), null);
  assert.equal(diagnoseMiss({ question, grading: deviceGrading('y-5=-3(x-1)'), attemptsLeft: true }), null, 'a different line in point-slope form is not "the right line"');
});

test('server and device agree: ingestion records the code the screen names', () => {
  const response = fieldsResponse({ ...ANSWERS, eqB2: POINT_SLOPE });
  const server = gradeServerResponse({ question, response });
  assert.equal(server.graded, true);
  assert.equal(server.isCorrect, false);
  const recorded = classifyMisconceptions({ question, response, grading: server });
  assert.equal(recorded.classifier, 'ordinary:multiAnswer');
  assert.deepEqual(recorded.findings.map((entry) => [entry.code, entry.parts]), [['line-wrong-form-slope-intercept', ['eqB2']]]);
  const shown = diagnoseMiss({ question, grading: deviceGrading(POINT_SLOPE), attemptsLeft: true });
  assert.equal(shown.code, recorded.findings[0].code);
  // Evidence only: the score and parts are the grader's, untouched.
  assert.equal(server.score, 0);
});

test('the reason is only shown where outcome feedback is open — never on an exit ticket, quiz or test before release', () => {
  const open = (role, { closed = false, released = false } = {}) => feedbackOpenForItem({
    showOutcomeFeedback: true,
    immediateFeedback: ACTIVITY_POLICIES[role].feedback === 'immediate',
    closed,
    assessmentReleased: released,
  });
  [ACTIVITY_ROLES.DOL, ACTIVITY_ROLES.QUIZ, ACTIVITY_ROLES.TEST].forEach((role) => {
    assert.equal(open(role), false, `${role}: open item`);
    assert.equal(open(role, { closed: true }), false, `${role}: closed, not released`);
  });
  assert.equal(open(ACTIVITY_ROLES.PRACTICE), true, 'practice shows it while the item is open');
  // The message itself names a form and nothing from the item.
  ['line-wrong-form-slope-intercept', 'line-wrong-form-point-slope', 'line-wrong-form-standard'].forEach((code) => {
    assert.doesNotMatch(studentMisconceptionMessage(code), /\d(?![₁])/, `${code} carries no number from the item`);
  });
});

test('the form is read from the label or prompt, else from the key; when they disagree nothing is named', () => {
  assert.equal(requestedLineForm(['Equation of line B′ in slope-intercept form']), 'slopeIntercept');
  assert.equal(requestedLineForm(['Write it as y = mx + b']), 'slopeIntercept');
  assert.equal(requestedLineForm(['Use point-slope form']), 'pointSlope');
  assert.equal(requestedLineForm(['in standard form']), 'standard');
  assert.equal(requestedLineForm(['Rewrite the point-slope equation in slope-intercept form']), 'slopeIntercept');
  assert.equal(requestedLineForm(['Compare point-slope form and slope-intercept form']), null);
  assert.equal(requestedLineForm(['Equation of the line', 'Prompt: use standard form']), 'standard');
  assert.equal(writtenLineForm('y=\\frac{1}{3}x+5'), 'slopeIntercept', 'a fraction\'s brackets are not point-slope');
  assert.equal(writtenLineForm(POINT_SLOPE), 'pointSlope');
  assert.equal(writtenLineForm('3x+y=5'), 'standard');
  assert.equal(writtenLineForm('-3x+5=y'), 'slopeIntercept');
  assert.equal(writtenLineForm('y\\le-3x+5'), null, 'an inequality is not a line');
  assert.equal(sameLine(POINT_SLOPE, 'y=-3x+5'), true);
  assert.equal(sameLine('6x+2y=10', '3x+y=5'), true);
  assert.equal(sameLine('y=-3x+4', 'y=-3x+5'), false);
  assert.equal(sameLine('y=x^2', 'y=x'), false);
});
