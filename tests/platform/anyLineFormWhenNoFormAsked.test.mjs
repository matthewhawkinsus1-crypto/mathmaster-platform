/*
 * GR03: ANY EQUATION OF THE LINE WHEN THE QUESTION NAMES NO FORM.
 *
 * The owner, 2026-10-24: "Yes for any question that names no form. Sweep
 * older lessons only after an equivalence report." The report is
 * scripts/report-line-form-equivalence.mjs; the decision for one field is
 * functions/shared/lineFormPolicy.mjs and the comparison is sameValue's
 * `anyLineForm` (answerEquivalence.mjs).
 *
 * Asserted on the real lesson and bank items the report lists: a field that
 * names no form takes y − y₁ = m(x − x₁) and Ax + By = C for y = mx + b, on
 * the device, the server, Path (stored at issue) and the teacher's simulation
 * alike; a field or a question that asks for a form keeps that form; an
 * equation in one letter (a step of a solve) and a question that already
 * shows the key's line keep form-for-form grading.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildGradingTrace } from '../../functions/shared/responseInspector.mjs';
import { fieldValueOptions, sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { asksForAForm, equationsInText, isObliqueLine } from '../../functions/shared/linearEquationForm.mjs';
import { lineFormDecision, withLineFormGrading } from '../../functions/shared/lineFormPolicy.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';
import { executableSource } from './helpers/sourceContract.mjs';
import { fieldsResponse } from './helpers/misconceptionFixtures.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');

const lesson = (file) => compileTeacherImport(fs.readFileSync(new URL(`../../teacher-import-jsons/${file}`, import.meta.url), 'utf8')).questions;
const L3 = lesson('algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json');
const SUBSTITUTION = lesson('algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json');
const byId = (questions, id) => {
  const question = questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `${id} compiles`);
  return question;
};

/** Grade one field of a lesson question as the device and the server both do. */
const lessonVerdict = (question, fieldId, response) => {
  const responses = Object.fromEntries(question.answerFields.map((field) => [field.id, field.id === fieldId ? response : '']));
  const device = gradeMultiAnswerResponse(question, responses).parts.find((part) => part.id === fieldId).isCorrect;
  const server = gradeServerResponse({ question, response: fieldsResponse(responses) }).parts?.find((part) => part.id === fieldId)?.isCorrect === true;
  assert.equal(device, server, `device and server agree on ${JSON.stringify(response)}`);
  return device;
};

test('a lesson line that names no form takes any equation of its line, on the device and the server', () => {
  // L3 Classwork 2: "Line C and its 90° rotation C′ intersect at (6, 5). Line C
  // passes through (−2, 9) …", field "Equation of line C", key y = −1/2x + 8.
  const question = byId(L3, 'l3-cw-2');
  assert.equal(lineFormDecision(question, question.answerFields.find((field) => field.id === 'eqC')).reason, 'no-form-named');
  for (const other of ['y-9=-\\frac{1}{2}\\left(x+2\\right)', 'y-5=-\\frac{1}{2}(x-6)', 'x+2y=16', '2y=-x+16', 'y=-1/2x+8']) {
    assert.equal(lessonVerdict(question, 'eqC', other), true, other);
  }
  // Another line is still wrong, whatever form it is written in.
  for (const wrong of ['y-9=-\\frac{1}{2}(x-2)', 'x+2y=15', 'y=2x-7', 'y=-2x+8']) {
    assert.equal(lessonVerdict(question, 'eqC', wrong), false, wrong);
  }
});

test('a field that names its form keeps it (R-3: "in slope-intercept form")', () => {
  const question = byId(L3, 'l3-cw-1');
  assert.equal(lessonVerdict(question, 'eqB2', 'y=-3x+5'), true);
  assert.equal(lessonVerdict(question, 'eqB2', 'y-5=-3\\left(x-0\\right)'), false);
  assert.equal(lessonVerdict(question, 'eqB2', '3x+y=5'), false);
});

test('rewriting the question\'s own equation is not answered by copying it', () => {
  // "For 3x + y = 7 and 2x − 5y = 16, isolate the quickest variable: write that
  // equation solved for it" — key y = 7 − 3x, the given 3x + y = 7 the same line.
  const question = byId(SUBSTITUTION, 'm3t2l2-pr-11');
  assert.equal(lessonVerdict(question, 'first', 'y=7-3x'), true);
  assert.equal(lessonVerdict(question, 'first', 'y=-3x+7'), true, 'a reordering keeps the asked form (as before)');
  assert.equal(lessonVerdict(question, 'first', '3x+y=7'), false);
  assert.equal(lessonVerdict(question, 'first', '3x + y = 7'), false);
});

test('the words that ask for a form, from the prompts the report reads', () => {
  [
    'Write its equation in slope-intercept form.',
    'Find the equation $y=mx+b$ represented by all three rows.',
    'Write a system with equations $y=$ for Plan A and Plan B.',
    'Write $y$ in terms of hours $x$.',
    'Correct the student\'s model by writing the direct-variation equation.',
    'Write that equation solved for it',
    'Solve 2x + 3y = 6 for y.',
    'Point-slope equation',
    'Rewrite the equation so y is alone.',
    'Use y − y₁ = m(x − x₁).',
  ].forEach((words) => assert.equal(asksForAForm([words]), true, words));
  [
    'Write the equation of the line parallel to $y=5x+ 6$ that passes through $(-3,-8)$.',
    'A school sells 48 tickets. Let $x$ be adult tickets and $y$ be student tickets. Write the system that models the situation.',
    'A line has rate of change 3 and $y$-intercept 2. Write its equation.',
    'Write an equation for total cost $y$ after $x$ hours.',
    'Then solve it by substitution to find the exact solution, which the graph cannot show.',
    'Equation of line C',
  ].forEach((words) => assert.equal(asksForAForm([words]), false, words));
  // Solving FOR a letter is a form, even with no equation on screen to copy.
  const question = {
    type: 'multiAnswer',
    prompt: 'The table shows points on a line. Write the equation of the line solved for y.',
    answerFields: [{ id: 'eq', label: 'Equation', answer: 'y=2x+1', inputProfile: 'equation' }],
  };
  assert.equal(lessonVerdict(question, 'eq', '2x-y=-1'), false);
});

test('a question that shows the key\'s line keeps form-for-form grading, whatever its wording', () => {
  const question = {
    type: 'multiAnswer',
    prompt: 'The line 3x + y = 6 is drawn on the grid. Write its equation for the table.',
    answerFields: [{ id: 'eq', label: 'Equation', answer: 'y=-3x+6', inputProfile: 'equation' }],
  };
  assert.equal(asksForAForm([question.prompt]), false, 'nothing here names a form');
  assert.deepEqual(equationsInText(question.prompt), ['3x + y=6']);
  assert.equal(lineFormDecision(question, question.answerFields[0]).reason, 'question-shows-the-line');
  assert.equal(lessonVerdict(question, 'eq', '3x+y=6'), false, 'the shown equation is not an answer');
  assert.equal(lessonVerdict(question, 'eq', 'y=-3x+6'), true);
});

test('an equation in one letter is a step of a solve, and keeps its form', () => {
  // L3 Classwork 11: "A horizontal line through (2, −1)", key y = −1, names no
  // form — but the same shape keys "the equation after squaring" elsewhere.
  const question = byId(L3, 'l3-cw-11');
  const field = question.answerFields.find((entry) => entry.answer === 'y=-1');
  assert.equal(isObliqueLine('y=-1'), false);
  assert.equal(lineFormDecision(question, field).reason, 'one-letter');
  assert.equal(lessonVerdict(question, field.id, 'y+1=0'), false);
  const step = {
    type: 'multiAnswer',
    prompt: 'A situation is modeled by 3x-21=100. Write the equivalent condition after adding 21 to both sides.',
    answerFields: [{ id: 'answer', label: 'Answer', answer: '3x=121', inputProfile: 'equation' }],
  };
  assert.equal(lessonVerdict(step, 'answer', '3x-21=100'), false, 'the question\'s own equation is not the step');
  assert.equal(lessonVerdict(step, 'answer', 'x=121/3'), false, 'nor is the solution');
});

test('a choice, a field with its own rule, and a caller with no question text keep form-for-form grading', () => {
  const line = { id: 'eq', label: 'Equation', answer: 'y=2x+1', inputProfile: 'equation' };
  const prompt = 'A line passes through (0, 1) and (1, 3).';
  const choice = { type: 'multiAnswer', prompt, answerFields: [{ ...line, type: 'choice', options: ['y=2x+1', '2x-y=-1', 'y=x+1'] }] };
  assert.equal(lessonVerdict(choice, 'eq', '2x-y=-1'), false, 'another option of the same line is still another option');
  const ownRule = { type: 'multiAnswer', prompt, answerFields: [{ ...line, equivalence: 'modelEquation' }] };
  assert.equal(lineFormDecision(ownRule, ownRule.answerFields[0]).reason, 'own-rule');
  const plain = { type: 'multiAnswer', prompt, answerFields: [line] };
  assert.equal(lessonVerdict(plain, 'eq', '2x-y=-1'), true);
  // Only the fields (the systems workspace's plane answers): nothing to read.
  assert.equal(gradeMultiAnswerResponse({ answerFields: [line] }, { eq: '2x-y=-1' }).isCorrect, false);
  assert.equal(gradeMultiAnswerResponse({ answerFields: [line] }, { eq: 'y=2x+1' }).isCorrect, true);
});

test('the comparison is opt-in: sameValue and a bare field keep the form the key is written in', () => {
  assert.equal(sameValue('y-5=-3(x-0)', 'y=-3x+5'), false);
  assert.equal(sameValue('y-5=-3(x-0)', 'y=-3x+5', 1e-6, { anyLineForm: true }), true);
  assert.equal(sameValue('y-5=-3(x-1)', 'y=-3x+5', 1e-6, { anyLineForm: true }), false);
  assert.equal(sameValue('y\\le-3x+5', 'y=-3x+5', 1e-6, { anyLineForm: true }), false);
  assert.equal(matchesFieldAnswer('3x+y=5', { answer: 'y=-3x+5' }), false);
  assert.equal(matchesFieldAnswer('3x+y=5', { answer: 'y=-3x+5', lineForm: 'any' }), true);
  // A field that does not take any form reads exactly as before.
  assert.deepEqual(fieldValueOptions({ inputProfile: 'equation' }), { thousandsSeparators: true, exactNumber: false });
  assert.deepEqual(fieldValueOptions({ inputProfile: 'equation', lineForm: 'any' }), { thousandsSeparators: true, exactNumber: false, anyLineForm: true });
});

// --- Path: the decision is stored with the private grading at issue ---------------

const bankQuestion = (familyId, seed = 'p-sweep-0') => {
  const bank = JSON.parse(fs.readFileSync(new URL('../../functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json', import.meta.url), 'utf8'));
  const item = (Array.isArray(bank) ? bank : bank.documents || bank.items || bank.questions).find((entry) => entry.id === familyId);
  assert.ok(item, `${familyId} is in the Algebra I bank`);
  const document = compilePathRecordForStorage({ ...item, active: true }).document || item;
  const question = generatePathInstanceWithRetries(document, seed, 4)?.question;
  assert.ok(question, `${familyId} draws`);
  return question;
};
const keyOf = (question) => String(question.responseFields[0].expected);
// y = mx + b → point-slope through (0, b) and the standard form, for an integer key.
const otherForms = (key) => {
  const match = /^y=(-?\d+)x([+-])\s*(\d+)$/.exec(key.replace(/\s+/g, ''));
  assert.ok(match, `an integer slope-intercept key: ${key}`);
  const [m, b] = [Number(match[1]), Number(`${match[2]}${match[3]}`)];
  return { pointSlope: `y-(${b})=${m}(x-0)`, standard: `${-m}x+y=${b}`, wrong: `y-(${b + 1})=${m}(x-0)` };
};
const pathVerdict = async (grading, response) => {
  const result = await mathPath.gradeResponse(grading, { responses: { [grading.fields[0].id]: response } });
  return result.fieldResults[0].isCorrect;
};

test('Path: a bank line that names no form is issued taking any equation of its line', async () => {
  // "Write the equation of the line parallel to y = 5x + 6 that passes through (−3, −8)."
  const question = bankQuestion('mm_A_2E_v2_parallel-through-point');
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.privateGrading.fields[0].lineForm, 'any');
  const forms = otherForms(keyOf(question));
  assert.equal(await pathVerdict(plan.privateGrading, forms.pointSlope), true);
  assert.equal(await pathVerdict(plan.privateGrading, forms.standard), true);
  assert.equal(await pathVerdict(plan.privateGrading, forms.wrong), false);
  // An item issued before this was stored without the decision, and keeps
  // the grading it was issued with.
  const issuedBefore = mathPath.privateGradingDefinition(question);
  assert.equal(await pathVerdict(issuedBefore, forms.pointSlope), false);
});

test('Path: a prompt that asks for slope-intercept form keeps it, though the field\'s label does not say so', async () => {
  // "The table represents a linear function. Write its equation in slope-intercept form." — label "Linear equation".
  const question = bankQuestion('mm_A_2C_v2_table-to-equation');
  assert.equal(lineFormDecision(question, question.responseFields[0]).reason, 'form-named-by-question');
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.privateGrading.fields[0].lineForm, undefined);
  const forms = otherForms(keyOf(question));
  assert.equal(await pathVerdict(plan.privateGrading, keyOf(question)), true);
  assert.equal(await pathVerdict(plan.privateGrading, forms.pointSlope), false);
  assert.equal(await pathVerdict(plan.privateGrading, forms.standard), false);
});

test('the teacher\'s Path simulation stores the same decision as production', async () => {
  const question = bankQuestion('mm_A_2E_v2_parallel-through-point');
  const { pointSlope } = otherForms(keyOf(question));
  const item = {
    ...question,
    id: 'gr03-sim',
    active: true,
    alignmentKeys: ['texas:A.2E'],
    courseId: 'algebra1',
    familyId: 'mathmaster:A.2E:gr03-sim',
    familyVersion: 1,
    generator: undefined,
  };
  assert.equal(withLineFormGrading(item, mathPath.privateGradingDefinition(item)).fields[0].lineForm, 'any');
  const runtime = createTeacherPathRuntime({ pathBankQuestions: [item], courseId: 'algebra1', requiredQuestions: 1 });
  const started = await runtime.startOrResumePathSession({ targetAlignmentKey: 'texas:A.2E', requiredQuestions: 1 });
  const issued = await runtime.fetchNextSanitizedQuestion({ sessionId: started.session.sessionId });
  assert.equal(JSON.stringify(issued.questionInstance).includes('lineForm'), false, 'the decision is private grading, never in the payload');
  const result = await runtime.submitStudentResponse({
    sessionId: started.session.sessionId,
    questionInstanceId: issued.questionInstance.questionInstanceId,
    submissionId: 'gr03-1',
    responsePayload: { responses: { [question.responseFields[0].id]: pointSlope } },
  });
  assert.equal(result.grading.isCorrect, true);
});

test('the screen hands the shared grader the whole question, so it reads the same words as the server', () => {
  const source = executableSource(fs.readFileSync(new URL('../../src/MultiAnswerGrader.jsx', import.meta.url), 'utf8'));
  const call = /gradeMultiAnswerResponse\(([^;]*?),\s*answers\)/.exec(source);
  assert.ok(call, 'the screen grades with gradeMultiAnswerResponse');
  assert.match(call[1], /^\{\s*\.\.\.question\s*,/, 'with the question it shows, not its fields alone');
});

test('the response inspector reads a missing part as the grader would', () => {
  const question = byId(L3, 'l3-cw-2');
  const trace = buildGradingTrace({ question, response: fieldsResponse({ eqC: 'x+2y=16' }), grading: { parts: [] } });
  assert.equal(trace.fields.find((field) => field.id === 'eqC').isCorrect, true);
});
