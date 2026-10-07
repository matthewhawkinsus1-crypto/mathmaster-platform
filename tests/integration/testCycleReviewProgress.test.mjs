/*
 * A TEST CYCLE'S REVIEW ANSWERS REACH THE SERVER, THE TEACHER, AND THE GATE.
 *
 * HOW TO RUN:  npm run test:challenge-finish   (every tests/integration suite)
 *         or:  firebase emulators:exec --only firestore --project mathmaster-review-progress \
 *                --config tests/browser/emulator/firebase.json \
 *                "node --import ./tests/integration/support/emulatorTransactions.mjs \
 *                 --test tests/integration/testCycleReviewProgress.test.mjs"
 *
 * "I can see them working on it but when I refresh I am getting no data to see
 * where they are." Server ingestion refused every submission on a Test Cycle
 * assignment as "secure-assignment-excluded", Review included. The device
 * acknowledged each answer and the server dropped it, so the teacher's row
 * stayed at 0/12 and Review could never unlock the Test. Every other suite
 * seeded `gradesByAssignment` directly with the Admin SDK, so none of them
 * sent a Review answer through the path a student's browser uses.
 *
 * This one does: real `ingestStudentSubmissions`, real grading, real
 * `listTeacherTestCycleRecords` and `getStudentTestCycle`.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { CERT_TARGETS, certAssessmentPolicy, certFamilies } from '../fixtures/testCycleCertificationFixture.mjs';
import { db, fns, studentRequest, teacherRequest, TEACHER_EMAIL } from './testCycleCertificationHarness.mjs';

const PREFIX = 'trvp_';
const CLASS_ID = 'trvp-class-1';
const ASSIGNMENT_ID = `${PREFIX}assignment`;
const STUDENT = 'TRVP_STUDENT';
const REVIEW_ANSWERS = ['2x+1', 'x+5', '9'];

const families = () => certFamilies().map((family) => ({
  ...family,
  id: family.id.replace(/^cert_/, PREFIX),
  familyId: String(family.familyId).replace(/^cert_/, PREFIX),
}));
const familyIdsFor = (targetId) => families()
  .filter((family) => family.id.startsWith(`${PREFIX}${targetId}-`))
  .map((family) => family.id);

// Server-gradable Review items (`literal` with a key), so the server marks them.
const reviewQuestion = (index) => ({
  questionId: `${PREFIX}review_${index}`,
  id: `${PREFIX}review_${index}`,
  type: 'literal',
  activityRole: 'review',
  prompt: `Review ${index}`,
  solveFor: 'y',
  acceptedAnswers: [REVIEW_ANSWERS[index]],
});

const envelope = (questionIndex, value, actionId) => ({
  schemaVersion: 1,
  actionId,
  kind: 'ordinarySubmission',
  assignmentId: ASSIGNMENT_ID,
  questionIndex,
  questionId: `${PREFIX}review_${questionIndex}`,
  variantIndex: 0,
  activityRole: 'review',
  capturedAt: Date.now(),
  previousTotalAttempts: 0,
  record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' },
  response: { kind: 'scalar', type: 'literal', value, fields: [] },
  capturedSectionAccess: null,
  hasClassworkGrade: false,
  hasDolGrade: false,
});

const ingest = async (submissions) => (
  await fns.ingestStudentSubmissions.run(studentRequest(STUDENT, { submissions }))
).receipts;
const teacherRow = async () => (
  await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: ASSIGNMENT_ID }))
).rows.find((row) => row.studentId === STUDENT);
const card = () => fns.getStudentTestCycle.run(studentRequest(STUDENT, { assignmentId: ASSIGNMENT_ID }));

before(async () => {
  await Promise.all(families().map(({ id, ...fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Review Progress Period 1', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('grades').doc(STUDENT).set({
    displayName: STUDENT, classId: CLASS_ID, classPeriod: 'Period 1',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set({
    id: ASSIGNMENT_ID,
    schemaVersion: 5,
    title: 'Review Progress Unit Test',
    courseId: 'algebra1',
    assignedClassIds: [CLASS_ID],
    releaseAt: new Date(Date.now() - 86_400_000).toISOString(),
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    assignment: { title: 'Review Progress Unit Test', courseId: 'algebra1' },
    assessmentPolicy: certAssessmentPolicy(),
    testBlueprint: {
      blueprintId: `${PREFIX}blueprint`,
      version: 1,
      title: 'Review Progress Unit Test',
      courseId: 'algebra1',
      calculatorMode: 'questionSpecific',
      targets: CERT_TARGETS.map((target) => ({ ...target, weight: 1, familyIds: familyIdsFor(target.targetId) })),
    },
    sections: [{
      id: 'review',
      role: 'review',
      title: 'Review',
      questions: REVIEW_ANSWERS.map((unused, index) => reviewQuestion(index)),
    }],
  });
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, classId: CLASS_ID }));
});

after(async () => {
  const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT_ID).get();
  const receipts = await db.collection('studentSubmissionReceipts').where('studentId', '==', STUDENT).get();
  await Promise.allSettled([
    ...families().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    db.collection('assignments').doc(ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CLASS_ID).delete(),
    db.collection('grades').doc(STUDENT).delete(),
    db.collection('testCycleRecords').doc(`${ASSIGNMENT_ID}__${STUDENT}`).delete(),
    ...sessions.docs.map((doc) => doc.ref.delete()),
    ...receipts.docs.map((doc) => doc.ref.delete()),
  ]);
});

test('a Review answer on a Test Cycle is ingested, graded by the server, and shown to the teacher', async () => {
  const before = await teacherRow();
  assert.deepEqual([before.review.attempted, before.review.total], [0, 3]);
  assert.equal(before.stage, 'review');

  const [receipt] = await ingest([envelope(0, REVIEW_ANSWERS[0], `${PREFIX}r0`)]);
  assert.equal(receipt.disposition, 'accepted', `refused: ${receipt.reason}`);
  const stored = (await db.collection('grades').doc(STUDENT).get()).data().gradesByAssignment[ASSIGNMENT_ID]['0'];
  assert.equal(stored.status, 'correct');
  assert.equal(stored.gradedBy, 'server', 'the server marks Review; the device does not');

  // What the teacher's refresh reads.
  const after = await teacherRow();
  assert.equal(after.review.attempted, 1);
  assert.equal(after.bucket, 'inReview', 'no longer "Not started"');
});

test('finishing Review opens the Test for the student, through the same path', async () => {
  const receipts = await ingest([
    envelope(1, 'not it', `${PREFIX}r1`),
    envelope(2, REVIEW_ANSWERS[2], `${PREFIX}r2`),
  ]);
  assert.deepEqual(receipts.map((entry) => entry.disposition), ['accepted', 'accepted']);
  const row = await teacherRow();
  assert.equal(row.review.attempted, 3);
  assert.equal(row.review.complete, true, 'participation, not a perfect score, opens the Test');
  const studentCard = await card();
  assert.equal(studentCard.stage, 'test');
  assert.equal(studentCard.canEnter, true);
});

test('Review work the device resends after the fix never counts twice', async () => {
  // The device resends answers it retired while the server refused Review
  // (durableActionOutbox.js, resendRetiredReviewWork). Question 0 was answered
  // again since, so an older envelope for it is behind the server's record.
  const [older] = await ingest([envelope(0, 'an earlier answer', `${PREFIX}refused-before-fix`)]);
  assert.equal(older.disposition, 'superseded');
  // The same envelope delivered twice, as two tabs might.
  const [again] = await ingest([envelope(0, REVIEW_ANSWERS[0], `${PREFIX}r0`)]);
  assert.equal(again.disposition, 'duplicate');
  const stored = (await db.collection('grades').doc(STUDENT).get()).data().gradesByAssignment[ASSIGNMENT_ID]['0'];
  assert.equal(stored.totalAttempts, 1, 'still one attempt');
  assert.equal(stored.status, 'correct');
  assert.equal((await teacherRow()).review.attempted, 3);
});

test('a non-Review question on a Test Cycle is still refused, whatever the envelope claims', async () => {
  // Out-of-range index: no stored Review question backs it, so a device
  // naming "review" cannot get it accepted.
  const [receipt] = await ingest([{ ...envelope(7, 'x', `${PREFIX}forged`), questionId: `${PREFIX}forged` }]);
  assert.equal(receipt.disposition, 'permanently-invalid');
  assert.equal(receipt.reason, 'secure-assignment-excluded');
});
