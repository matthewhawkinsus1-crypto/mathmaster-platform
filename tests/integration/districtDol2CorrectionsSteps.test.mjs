/*
 * CT02, SLICE 4 — A DISTRICT DOL #2 CORRECTION'S WORKED STEPS, END TO END.
 *
 * HOW TO RUN:  npm run test:challenge-finish   (Firestore emulator; every
 *              tests/integration file)
 *
 * The real Cloud Functions against a real Firestore, driven the way the
 * student's and the teacher's screens drive them, on a Test Cycle whose
 * blueprint is the DOL #2 one (drafts/district-dol2/assignment.json: thirteen
 * targets, one bundled secure family each) under the certification fixture's
 * policy, which has Corrections. A student who fails the Test is sent to
 * Corrections, and each correction is a fresh item of the same DOL #2 family.
 * Those families carry no worked solution, so a closed correction used to show
 * nothing at all. What this proves:
 *
 *   - nothing the student receives while a correction item is open carries a
 *     worked step: not the issued item, not a miss that leaves tries;
 *   - once the item closes, on the last try or a right answer, the response
 *     carries the steps the builder works from THAT issued item, and the
 *     correction plan document never holds one;
 *   - a student who typed exactly what the steps state was marked right by the
 *     Corrections grader itself.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { certAssessmentPolicy, certAssignment } from '../fixtures/testCycleCertificationFixture.mjs';
import { db, fns, readCorrectionPlan, readRecord, studentRequest, teacherRequest, TEACHER_EMAIL } from './testCycleCertificationHarness.mjs';
import { districtDol2SecureWorkedSolution } from '../../functions/shared/districtDol2WorkedSolution.mjs';

const require = createRequire(import.meta.url);
const secureItems = require('../../functions/lib/secureItems.js');

// This file's own namespace (CI08): every integration file shares one emulator.
const CLASS_ID = 'ct02-dol2-corrections-class';
const ASSIGNMENT_ID = 'ct02-dol2-corrections-assignment';
const STUDENT = 'CT02_DOL2_CORRECTOR';
const sessions = [];

const dol2 = JSON.parse(readFileSync(new URL('../../drafts/district-dol2/assignment.json', import.meta.url), 'utf8'));
const assignmentDoc = () => {
  const base = certAssignment({ classIds: [CLASS_ID], assignmentId: ASSIGNMENT_ID, prefix: 'ct02c_' });
  return {
    ...base,
    title: 'CT02 DOL #2 correction steps',
    assessmentPolicy: { ...certAssessmentPolicy(), retest: { ...certAssessmentPolicy().retest, questionCount: dol2.testBlueprint.targets.length } },
    testBlueprint: { ...dol2.testBlueprint, blueprintId: 'ct02-dol2-corrections', timeLimitSeconds: 45 * 60 },
  };
};

const student = (data) => studentRequest(STUDENT, { assignmentId: ASSIGNMENT_ID, ...data });
/** The open correction item, as the plan document stores it — read here to check the steps, never by a browser. */
const openItem = async (correctionId) => (await readCorrectionPlan(ASSIGNMENT_ID, STUDENT)).activeQuestions?.[correctionId];

const SOLUTION_KEYS = /"(reasoning|answerSummary|releasedSolution|privateGrading|expected|accepted|generatorParameters|solutionReview)"/;
const assertNoSteps = (payload, lines, where) => {
  const serialized = JSON.stringify(payload ?? null);
  lines.forEach((line) => assert.ok(!serialized.includes(JSON.stringify(line).slice(1, -1)), `${where}: carries the step "${line}"`));
};

/** What the steps state, as the student's screen sends it: a choice by the id the screen got. */
const statedResponses = (questionInstance, answers) => Object.fromEntries(Object.entries(answers).map(([fieldId, stated]) => {
  const choices = questionInstance.responseFields.find((field) => field.id === fieldId)?.choices || [];
  return [fieldId, choices.length ? choices.find((choice) => choice.label === stated).id : stated];
}));
/** Every part answered, none the way the steps state: a different choice, or a number no key here is. */
const wrongResponses = (questionInstance, answers) => Object.fromEntries(questionInstance.responseFields.map((field) => {
  const choices = field.choices || [];
  return [field.id, choices.length ? choices.find((choice) => choice.label !== answers[field.id]).id : '-98765'];
}));

before(async () => {
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'CT02 Corrections', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 4', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('grades').doc(STUDENT).set({
    displayName: STUDENT, classId: CLASS_ID, classPeriod: 'Period 4',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set(assignmentDoc());
});

after(async () => {
  await Promise.allSettled([
    db.collection('assignments').doc(ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CLASS_ID).delete(),
    db.collection('testCycleAnswerReleases').doc(ASSIGNMENT_ID).delete(),
    db.recursiveDelete(db.collection('grades').doc(STUDENT)),
    ...['testCycleRecords', 'testCycleCorrectionPlans', 'testCycleRetestPlans'].map((collection) => (
      db.collection(collection).doc(`${ASSIGNMENT_ID}__${STUDENT}`).delete()
    )),
    ...sessions.map((id) => db.recursiveDelete(db.collection('examSessions').doc(id))),
  ]);
});

test('a DOL #2 correction: no step while it is open, the steps of the student\'s own item once it closes, and nothing stored', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, classId: CLASS_ID }));
  // The review the policy requires, done.
  await db.collection('grades').doc(STUDENT).set({
    gradesByAssignment: { [ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  }, { merge: true });
  const examSessionId = (await readRecord(ASSIGNMENT_ID, STUDENT)).test.examSessionId;
  sessions.push(examSessionId);
  await fns.startSecureExamSession.run(studentRequest(STUDENT, { examSessionId }));
  for (let position = 0; position < dol2.testBlueprint.targets.length; position += 1) {
    // eslint-disable-next-line no-await-in-loop
    await fns.issueSecureExamQuestion.run(studentRequest(STUDENT, { examSessionId, position }));
  }
  // Every question left blank: a failed Test, released by the teacher.
  await fns.finalizeSecureExam.run(studentRequest(STUDENT, { examSessionId }));
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'releaseFeedback' }));
  const card = await fns.getStudentTestCycle.run(student({}));
  assert.equal(card.stage, 'corrections');
  const { plan } = await readCorrectionPlan(ASSIGNMENT_ID, STUDENT);
  assert.ok(plan.targets.length > 0, 'a correction plan from the failed Test');
  const [target] = plan.targets;
  assert.ok(dol2.testBlueprint.targets.some((entry) => entry.familyIds.every((id) => target.practiceFamilyIds.includes(id))), 'drawn on a DOL #2 family');

  // The correction item, and what its steps will say, worked from the item the plan stores.
  const issued = await fns.issueTestCycleCorrectionQuestion.run(student({ correctionId: target.correctionId }));
  const stored = await openItem(target.correctionId);
  assert.equal(stored.questionInstanceId, issued.questionInstance.questionInstanceId);
  const worked = districtDol2SecureWorkedSolution(secureItems.readStoredItem(stored));
  assert.ok(worked, 'the builder works the issued correction item');
  const lines = [...worked.steps, worked.answerSummary];
  assertNoSteps(issued, lines, 'the issued item');
  assert.doesNotMatch(JSON.stringify(issued), SOLUTION_KEYS, 'the issued item carries no solution or key');

  // Two misses leave tries: no step. The third closes the item: its steps.
  const miss = { questionInstanceId: issued.questionInstance.questionInstanceId, responsePayload: { responses: wrongResponses(issued.questionInstance, worked.answers) } };
  for (const attempt of [1, 2]) {
    // eslint-disable-next-line no-await-in-loop
    const open = await fns.submitTestCycleCorrectionResponse.run(student({ correctionId: target.correctionId, ...miss }));
    assert.equal(open.isCorrect, false, `miss ${attempt}`);
    assert.equal(open.questionClosed, false, `miss ${attempt} leaves a try`);
    assert.equal(open.solutionReview, null, `miss ${attempt}: no worked solution`);
    assertNoSteps(open, lines, `miss ${attempt}`);
  }
  const closed = await fns.submitTestCycleCorrectionResponse.run(student({ correctionId: target.correctionId, ...miss }));
  assert.equal(closed.isCorrect, false);
  assert.equal(closed.questionClosed, true, 'the third miss closes the item');
  assert.deepEqual(closed.solutionReview.reasoning, worked.steps, 'the steps worked from this student\'s item');
  assert.equal(closed.solutionReview.headline, worked.headline);
  assert.equal(closed.solutionReview.answerSummary, worked.answerSummary);
  // Built when served, stored nowhere.
  const planAfterMisses = await readCorrectionPlan(ASSIGNMENT_ID, STUDENT);
  assertNoSteps(planAfterMisses, lines, 'the correction plan document');
  assert.equal(planAfterMisses.activeQuestions?.[target.correctionId], undefined, 'the closed item is no longer open');

  // A fresh item, answered with exactly what its steps state: right, and its steps.
  const fresh = await fns.issueTestCycleCorrectionQuestion.run(student({ correctionId: target.correctionId }));
  assert.notEqual(fresh.questionInstance.questionInstanceId, issued.questionInstance.questionInstanceId);
  const freshWorked = districtDol2SecureWorkedSolution(secureItems.readStoredItem(await openItem(target.correctionId)));
  assert.ok(freshWorked);
  const freshLines = [...freshWorked.steps, freshWorked.answerSummary];
  assertNoSteps(fresh, freshLines, 'the fresh item');
  const right = await fns.submitTestCycleCorrectionResponse.run(student({
    correctionId: target.correctionId,
    questionInstanceId: fresh.questionInstance.questionInstanceId,
    responsePayload: { responses: statedResponses(fresh.questionInstance, freshWorked.answers) },
  }));
  assert.equal(right.isCorrect, true, 'what the steps state is marked right by the Corrections grader');
  assert.equal(right.questionClosed, true);
  assert.deepEqual(right.solutionReview.reasoning, freshWorked.steps);
  assertNoSteps(await readCorrectionPlan(ASSIGNMENT_ID, STUDENT), freshLines, 'the correction plan document');
});
