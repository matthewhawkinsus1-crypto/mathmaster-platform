/*
 * CT02, SLICE 2 — THE DISTRICT DOL #2 RETEST'S WORKED STEPS, END TO END.
 *
 * HOW TO RUN:  npm run test:challenge-finish   (Firestore emulator; every
 *              tests/integration file)
 *
 * The real Cloud Functions against a real Firestore, driven the way the
 * student's and the teacher's screens drive them, on a Test Cycle whose
 * blueprint is the DOL #2 one (drafts/district-dol2/assignment.json: thirteen
 * targets, one bundled secure family each). The real assignment sits its Test
 * outside MathMaster and issues these items at the Retest; the review path is
 * the same at either stage, so this runs it at the Test with the certification
 * fixture's policy. What it proves:
 *
 *   - nothing the student receives while testing, at submit, or before the
 *     teacher releases results carries a worked step, and the session document
 *     never holds one;
 *   - released while a classmate is still testing, the answers and the steps
 *     both wait;
 *   - once the answers are released, every item's review carries the steps the
 *     builder works from that student's own issued item, and serving it writes
 *     nothing;
 *   - a student who typed exactly what the steps state was marked right by
 *     finalize's own grading.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { certAssessmentPolicy, certAssignment } from '../fixtures/testCycleCertificationFixture.mjs';
import { db, fns, readRecord, readSession, refusal, studentRequest, teacherRequest, TEACHER_EMAIL } from './testCycleCertificationHarness.mjs';
import { districtDol2SecureWorkedSolution } from '../../functions/shared/districtDol2WorkedSolution.mjs';

const require = createRequire(import.meta.url);
const secureItems = require('../../functions/lib/secureItems.js');

// This file's own namespace (CI08): every integration file shares one emulator.
const CLASS_ID = 'ct02-dol2-steps-class';
const ASSIGNMENT_ID = 'ct02-dol2-steps-assignment';
const SITTER = 'CT02_DOL2_SITTER';
const CLASSMATE = 'CT02_DOL2_CLASSMATE';
const STUDENTS = [SITTER, CLASSMATE];
const sessions = [];

const dol2 = JSON.parse(readFileSync(new URL('../../drafts/district-dol2/assignment.json', import.meta.url), 'utf8'));
const assignmentDoc = () => {
  const base = certAssignment({ classIds: [CLASS_ID], assignmentId: ASSIGNMENT_ID, prefix: 'ct02_' });
  return {
    ...base,
    title: 'CT02 DOL #2 worked steps',
    assessmentPolicy: { ...certAssessmentPolicy(), retest: { ...certAssessmentPolicy().retest, questionCount: dol2.testBlueprint.targets.length } },
    testBlueprint: { ...dol2.testBlueprint, blueprintId: 'ct02-dol2-steps', timeLimitSeconds: 45 * 60 },
  };
};

const student = (studentId, data) => studentRequest(studentId, data);
/** The server-only item document — read here to check the steps, never by a browser. */
const readItem = async (examSessionId, questionInstanceId) => (
  (await db.collection('examSessions').doc(examSessionId).collection('items').doc(questionInstanceId).get()).data()
);
const readItems = async (examSessionId) => {
  const snapshot = await db.collection('examSessions').doc(examSessionId).collection('items').get();
  return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, doc.data()]));
};

const SOLUTION_KEYS = /"(reasoning|answerSummary|releasedSolution|privateGrading|expected|accepted|generatorParameters|solutionReview)"/;
const assertNoSteps = (payload, lines, where) => {
  const serialized = JSON.stringify(payload ?? null);
  assert.doesNotMatch(serialized, SOLUTION_KEYS, `${where}: no solution or key`);
  lines.forEach((line) => assert.ok(!serialized.includes(JSON.stringify(line).slice(1, -1)), `${where}: carries the step "${line}"`));
};

before(async () => {
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'CT02 Algebra I', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 2', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await Promise.all(STUDENTS.map((studentId) => db.collection('grades').doc(studentId).set({
    displayName: studentId, classId: CLASS_ID, classPeriod: 'Period 2',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  })));
  await db.collection('assignments').doc(ASSIGNMENT_ID).set(assignmentDoc());
});

after(async () => {
  await Promise.allSettled([
    db.collection('assignments').doc(ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CLASS_ID).delete(),
    db.collection('testCycleAnswerReleases').doc(ASSIGNMENT_ID).delete(),
    ...STUDENTS.map((studentId) => db.recursiveDelete(db.collection('grades').doc(studentId))),
    ...['testCycleRecords', 'testCycleCorrectionPlans', 'testCycleRetestPlans'].flatMap((collection) => (
      STUDENTS.map((studentId) => db.collection(collection).doc(`${ASSIGNMENT_ID}__${studentId}`).delete())
    )),
    ...sessions.map((id) => db.recursiveDelete(db.collection('examSessions').doc(id))),
  ]);
});

test('the DOL #2 retest items: no step before release, every step after it, worked from the student\'s own items, and nothing stored', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, classId: CLASS_ID }));
  // The review the policy requires, done.
  await db.collection('grades').doc(SITTER).set({
    gradesByAssignment: { [ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  }, { merge: true });
  const examSessionId = (await readRecord(ASSIGNMENT_ID, SITTER)).test.examSessionId;
  const classmateSession = (await readRecord(ASSIGNMENT_ID, CLASSMATE)).test.examSessionId;
  sessions.push(examSessionId, classmateSession);
  await fns.startSecureExamSession.run(student(SITTER, { examSessionId }));

  // Every question, as the student's screen receives it.
  const issued = [];
  for (let position = 0; position < dol2.testBlueprint.targets.length; position += 1) {
    // eslint-disable-next-line no-await-in-loop
    issued.push((await fns.issueSecureExamQuestion.run(student(SITTER, { examSessionId, position }))).questionInstance);
  }
  // What the steps for each will say, worked from the item document the server stored.
  const itemDocs = await Promise.all(issued.map((question) => readItem(examSessionId, question.questionInstanceId)));
  assert.deepEqual(itemDocs.map((doc) => doc.item.bankQuestionId).sort(), dol2.testBlueprint.targets.flatMap((target) => target.familyIds).sort(), 'one item of each DOL #2 family');
  const worked = itemDocs.map((doc) => districtDol2SecureWorkedSolution(secureItems.readStoredItem(doc.item)));
  assert.ok(worked.every(Boolean), 'the builder works every issued item');
  const lines = worked.flatMap((solution) => [...solution.steps, solution.answerSummary]);
  issued.forEach((question, position) => assertNoSteps(question, lines, `question ${position + 1} while testing`));

  // Every other question answered with exactly what its steps state (a choice
  // by the option the student sees), the rest left blank.
  const typed = new Set();
  for (const [position, question] of issued.entries()) {
    if (position % 2) continue;
    const responses = Object.fromEntries(Object.entries(worked[position].answers).map(([fieldId, stated]) => {
      const choices = question.responseFields.find((field) => field.id === fieldId)?.choices || [];
      return [fieldId, choices.length ? choices.find((choice) => choice.label === stated).id : stated];
    }));
    // eslint-disable-next-line no-await-in-loop
    const saved = await fns.saveSecureExamDraft.run(student(SITTER, { examSessionId, questionInstanceId: question.questionInstanceId, responsePayload: { responses } }));
    assertNoSteps(saved, lines, `saving question ${position + 1}`);
    typed.add(question.questionInstanceId);
  }
  const finalized = await fns.finalizeSecureExam.run(student(SITTER, { examSessionId }));
  assertNoSteps(finalized, lines, 'the submit response');
  assert.equal(finalized.session.feedbackReleased, false, 'a course Test waits for the teacher');

  // Finalize graded what the steps state as right, and stored no step.
  const stored = await readSession(examSessionId);
  for (const question of issued) {
    const response = stored.responses[question.questionInstanceId];
    assert.equal(response.grading.isCorrect, typed.has(question.questionInstanceId), `${response.bankQuestionId}: the stated answers are right`);
    assert.equal(response.releasedSolution.review, null, `${response.bankQuestionId}: no worked solution stored`);
  }
  lines.forEach((line) => assert.ok(!JSON.stringify(stored).includes(JSON.stringify(line).slice(1, -1)), `the session document holds the step "${line}"`));
  assertNoSteps(await fns.listStudentSecureExamSessions.run(student(SITTER, {})), lines, 'the student\'s list');

  // Not released: no review at all.
  const early = await refusal(fns.getStudentSecureExamReview.run(student(SITTER, { examSessionId })));
  assert.equal(early?.code, 'failed-precondition');

  // Released while the classmate is still assigned the Test: the score and the
  // student's own answers, no correct answer and no step.
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'releaseFeedback' }));
  const held = (await fns.getStudentSecureExamReview.run(student(SITTER, { examSessionId }))).review;
  assert.equal(held.solutionsHeld, true);
  assert.equal(held.items.length, issued.length);
  assert.equal(held.items.some((item) => item.solution), false);
  assertNoSteps(held, lines, 'the held review');

  // The teacher releases the answers: every item now carries its steps.
  const listing = await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: ASSIGNMENT_ID }));
  await fns.releaseTestCycleAnswers.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, stage: 'test', confirmed: listing.answersRelease.test.confirmKeys }));
  const sessionBefore = await readSession(examSessionId);
  const itemsBefore = await readItems(examSessionId);
  const { review } = await fns.getStudentSecureExamReview.run(student(SITTER, { examSessionId }));
  assert.equal(review.solutionsHeld, undefined);
  assert.equal(review.items.length, issued.length);
  for (const item of review.items) {
    const solution = worked[issued.findIndex((question) => question.questionInstanceId === item.questionInstanceId)];
    assert.ok(item.solution.answers.length, `${item.bankQuestionId}: the correct answers`);
    assert.deepEqual(item.solution.review.reasoning, solution.steps, `${item.bankQuestionId}: the steps worked from this student's item`);
    assert.equal(item.solution.review.headline, solution.headline);
    assert.equal(item.solution.review.answerSummary, solution.answerSummary);
  }
  // Serving it wrote nothing: the session and its item documents are as they were.
  assert.deepEqual(await readSession(examSessionId), sessionBefore);
  assert.deepEqual(await readItems(examSessionId), itemsBefore);
  // And nobody else's review: the classmate never sat, and gets none.
  assert.equal((await refusal(fns.getStudentSecureExamReview.run(student(CLASSMATE, { examSessionId })))).code, 'not-found');
});
