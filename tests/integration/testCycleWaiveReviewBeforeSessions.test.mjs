/*
 * WAIVE REVIEW FOR A STUDENT WHO HAS NOT STARTED, BEFORE ANY TEST IS OPEN.
 *
 * HOW TO RUN:  npm run test:challenge-finish   (every tests/integration suite)
 *         or:  firebase emulators:exec --only firestore --project mathmaster-waive-review \
 *                --config tests/browser/emulator/firebase.json \
 *                "node --import ./tests/integration/support/emulatorTransactions.mjs \
 *                 --test tests/integration/testCycleWaiveReviewBeforeSessions.test.mjs"
 *
 * A teacher pressed Waive Review on a "Not started" row before opening any
 * secure Test sessions and was shown "internal". Nothing covered waiveReview
 * against the real callable. This proves the server half end to end:
 *
 *   - waiving creates the student's record (they had none) at the Test stage;
 *   - the student still cannot start, because no Test session exists, and the
 *     card says so;
 *   - the teacher panel's per-student "Open this student's Test session" (the
 *     class-wide callable with one studentId) opens exactly that student's
 *     session, and then they can start.
 *
 * Ids are prefixed `wrbs` because the integration suites share one emulator.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { CERT_TARGETS, certAssessmentPolicy, certFamilies } from '../fixtures/testCycleCertificationFixture.mjs';
import { db, fns, readRecord, studentRequest, teacherRequest, TEACHER_EMAIL } from './testCycleCertificationHarness.mjs';

const PREFIX = 'wrbs_';
const CLASS_ID = 'wrbs-class-1';
const ASSIGNMENT_ID = `${PREFIX}assignment`;
const WAIVED = 'WRBS_WAIVED';
const CLASSMATE = 'WRBS_CLASSMATE';
const STUDENTS = [WAIVED, CLASSMATE];

const families = () => certFamilies().map((family) => ({
  ...family,
  id: family.id.replace(/^cert_/, PREFIX),
  familyId: String(family.familyId).replace(/^cert_/, PREFIX),
}));
const familyIdsFor = (targetId) => families()
  .filter((family) => family.id.startsWith(`${PREFIX}${targetId}-`))
  .map((family) => family.id);

before(async () => {
  await Promise.all(families().map(({ id, ...fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Waive Review Period 1', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await Promise.all(STUDENTS.map((studentId) => db.collection('grades').doc(studentId).set({
    displayName: studentId, classId: CLASS_ID, classPeriod: 'Period 1',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  })));
  await db.collection('assignments').doc(ASSIGNMENT_ID).set({
    id: ASSIGNMENT_ID,
    schemaVersion: 5,
    title: 'Waive Review Unit Test',
    courseId: 'algebra1',
    assignedClassIds: [CLASS_ID],
    dueAt: '2099-01-01T00:00:00.000Z',
    assignment: { title: 'Waive Review Unit Test', courseId: 'algebra1' },
    assessmentPolicy: certAssessmentPolicy(),
    testBlueprint: {
      blueprintId: `${PREFIX}blueprint`,
      version: 1,
      title: 'Waive Review Unit Test',
      courseId: 'algebra1',
      calculatorMode: 'questionSpecific',
      targets: CERT_TARGETS.map((target) => ({ ...target, weight: 1, familyIds: familyIdsFor(target.targetId) })),
    },
    sections: [{
      id: 'review',
      role: 'review',
      title: 'Review',
      questions: [
        { questionId: `${PREFIX}review_1`, type: 'response', prompt: 'Review 1' },
        { questionId: `${PREFIX}review_2`, type: 'response', prompt: 'Review 2' },
      ],
    }],
  });
});

after(async () => {
  const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT_ID).get();
  await Promise.allSettled([
    ...families().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    db.collection('assignments').doc(ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CLASS_ID).delete(),
    ...STUDENTS.flatMap((studentId) => [
      db.collection('grades').doc(studentId).delete(),
      db.collection('testCycleRecords').doc(`${ASSIGNMENT_ID}__${studentId}`).delete(),
    ]),
    ...sessions.docs.map((doc) => doc.ref.delete()),
  ]);
});

const rowFor = async (studentId) => {
  const listing = await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: ASSIGNMENT_ID }));
  return listing.rows.find((row) => row.studentId === studentId);
};
const cardFor = (studentId) => fns.getStudentTestCycle.run(studentRequest(studentId, { assignmentId: ASSIGNMENT_ID }));

test('Waive Review before sessions are open: applied, the Test still has to be opened, and one student\'s session opens it', async () => {
  // A "Not started" row: no record, no session, Review untouched.
  assert.equal((await rowFor(WAIVED)).bucket, 'notStarted');
  assert.equal((await db.collection('testCycleRecords').doc(`${ASSIGNMENT_ID}__${WAIVED}`).get()).exists, false);

  const waived = await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, studentId: WAIVED, action: 'waiveReview', stage: 'test',
  }));
  assert.equal(waived.success, true);
  assert.equal(waived.teacherControls.reviewWaived, true);
  const record = await readRecord(ASSIGNMENT_ID, WAIVED);
  assert.equal(record.teacherControls.reviewWaived, true);
  assert.equal(record.stage, 'test');
  assert.equal(record.test.examSessionId, null);

  // Past Review, and still unable to start: this is the step the panel now names.
  const row = await rowFor(WAIVED);
  assert.equal(row.bucket, 'readyForTest');
  assert.equal(row.test.examSessionId, null);
  const blocked = await cardFor(WAIVED);
  assert.equal(blocked.stage, 'test');
  assert.equal(blocked.canEnter, false);
  assert.match(blocked.detail, /not opened the secure test session/);

  // The row's "Open this student's Test session": the class-wide callable,
  // scoped to one student.
  const opened = await fns.assignTestCycleSessions.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: null, studentIds: [WAIVED],
  }));
  assert.equal(opened.createdSessions, 1);
  assert.ok((await readRecord(ASSIGNMENT_ID, WAIVED)).test.examSessionId, 'the waived student has a Test session');
  assert.equal((await db.collection('testCycleRecords').doc(`${ASSIGNMENT_ID}__${CLASSMATE}`).get()).exists, false,
    'and nobody else was given one');

  const ready = await cardFor(WAIVED);
  assert.equal(ready.stage, 'test');
  assert.equal(ready.canEnter, true);
  assert.ok(ready.examSessionId);

  // The classmate who was not waived is still gated on Review.
  assert.equal((await cardFor(CLASSMATE)).stage, 'review');
});
