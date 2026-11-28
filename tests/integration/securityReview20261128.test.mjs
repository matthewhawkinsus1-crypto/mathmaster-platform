// THE FUNCTION FIXES FROM THE 2026-11-28 SECURITY REVIEW, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-security-review \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/securityReview20261128.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// Each test runs the REAL exported callable and proves one fix in
// docs/audits/2026-11-28-security-review.md:
//
//   A1 linkGoogleAccount: a classmate holding the class code cannot bind
//      their Google account to a student whose roster row names another
//      Google account, cannot move an account already linked to one student
//      onto another, and wrong codes are throttled.
//   A2 resetStudentPasscode / unlinkStudentAccount: only the student's own
//      teacher (or the root administrator).
//   A3 a Classroom course mapping counts only while its teacher still teaches
//      the class.
//   A5 / A6 / T3 bounded inputs: Classroom topic and course lists, the
//      launch preview's assignment id, Test Cycle student lists.
//
// Every id starts with `secrev-`: integration files share one emulator and
// run in parallel.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { db, fns, refusal, teacherRequest } from './canonicalPersistenceHarness.mjs';

const { certAssignment, certFamilies } = await import('../fixtures/testCycleCertificationFixture.mjs');

const P = 'secrev';
const TEACHER_A = 'secrev.teacher.a@example.test';
const TEACHER_B = 'secrev.teacher.b@example.test';
const TEACHER_C = 'secrev.teacher.c@example.test';
const CLASS_A = `${P}-class-a`;
const STUDENT_1 = `${P}-student-1`;
const STUDENT_2 = `${P}-student-2`;
const STUDENT_3 = `${P}-student-3`;
const JOIN_CODE = 'SECREV01';
const TC_ASSIGNMENT = `${P}-tc-assignment`;
const COURSE = `${P}-course`;

const googleRequest = (email, data, uid = `uid-google-${email}`) => ({
  auth: { uid, token: { email, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const mappingId = (teacherUid, courseId) => crypto.createHash('sha256').update(`${teacherUid}|${courseId}`).digest('hex').slice(0, 32);
const read = async (path) => (await db.doc(path).get()).data() || null;

before(async () => {
  await db.collection('classes').doc(CLASS_A).set({
    name: 'Security review — Period 1', course: 'algebra1', courseLevel: 'standard', period: 'Period 1',
    teacherOfRecord: TEACHER_A, status: 'active',
  });
  for (const id of [STUDENT_1, STUDENT_2, STUDENT_3]) {
    await db.collection('grades').doc(id).set({
      displayName: id, classId: CLASS_A, classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {},
    });
  }
  // Student 3's row knows their Google account from the Classroom roster.
  await db.collection('grades').doc(STUDENT_3).set({ googleEmail: 'secrev.student3@example.test' }, { merge: true });
  await db.collection('classJoinCodes').doc(JOIN_CODE).set({ code: JOIN_CODE, classId: CLASS_A, classPeriod: 'Period 1', active: true });
  await db.collection('studentCredentials').doc(STUDENT_1.toUpperCase()).set({ studentIdKey: STUDENT_1.toUpperCase(), hash: 'h', salt: 's' });
  await db.collection('studentDirectory').doc('secrev.student2@example.test').set({ email: 'secrev.student2@example.test', studentId: STUDENT_2, uid: 'uid-s2' });
});

test('A2: only the student\'s own teacher resets their PIN', async () => {
  const other = await refusal(fns.resetStudentPasscode.run(teacherRequest({ studentId: STUDENT_1 }, TEACHER_B)));
  assert.equal(other?.code, 'permission-denied', 'another teacher is refused');
  const credential = await read(`studentCredentials/${STUDENT_1.toUpperCase()}`);
  assert.equal(credential.hash, 'h', 'the PIN is untouched');
  assert.notEqual(credential.resetRequired, true);

  const unknown = await refusal(fns.resetStudentPasscode.run(teacherRequest({ studentId: `${P}-nobody` }, TEACHER_B)));
  assert.equal(unknown?.code, 'permission-denied', 'a student who is on no roster is nobody\'s to reset');

  const own = await fns.resetStudentPasscode.run(teacherRequest({ studentId: STUDENT_1 }, TEACHER_A));
  assert.equal(own.resetRequired, true, 'the student\'s teacher still can');
  assert.equal((await read(`studentCredentials/${STUDENT_1.toUpperCase()}`)).resetRequired, true);
});

test('A2: only the student\'s own teacher unlinks their Google account', async () => {
  const other = await refusal(fns.unlinkStudentAccount.run(teacherRequest({ studentId: STUDENT_2 }, TEACHER_B)));
  assert.equal(other?.code, 'permission-denied', 'another teacher is refused');
  assert.equal((await read('studentDirectory/secrev.student2@example.test'))?.studentId, STUDENT_2, 'the link is untouched');
});

test('A1: a Google account cannot claim a student whose roster names another account', async () => {
  const intruder = 'secrev.classmate@example.test';
  const refused = await refusal(fns.linkGoogleAccount.run(googleRequest(intruder, { studentId: STUDENT_3, classCode: JOIN_CODE })));
  assert.equal(refused?.code, 'permission-denied');
  assert.equal(await read(`studentDirectory/${intruder}`), null, 'no directory entry was written');
  assert.equal((await read(`grades/${STUDENT_3}`)).linkedEmail, undefined, 'the roster row was not relinked');
});

test('A1: an account linked to one student is not moved onto another', async () => {
  const refused = await refusal(fns.linkGoogleAccount.run(googleRequest('secrev.student2@example.test', { studentId: STUDENT_1, classCode: JOIN_CODE })));
  assert.equal(refused?.code, 'already-exists');
  assert.equal((await read('studentDirectory/secrev.student2@example.test')).studentId, STUDENT_2, 'still linked to its own student');
  assert.equal((await read(`grades/${STUDENT_1}`)).linkedEmail, undefined);
});

test('A1: wrong class codes are throttled per signed-in account', async () => {
  const guesser = googleRequest('secrev.guesser@example.test', { studentId: STUDENT_1, classCode: 'WRONG000' });
  const codes = [];
  for (let attempt = 0; attempt < 9; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    codes.push((await refusal(fns.linkGoogleAccount.run(guesser)))?.code);
  }
  assert.deepEqual(codes.slice(0, 8), Array(8).fill('permission-denied'));
  assert.equal(codes[8], 'resource-exhausted', 'the ninth guess is locked out');
});

test('A3: a course mapping stops counting when its class moves to another teacher', async () => {
  const teacherUid = `uid-${TEACHER_A}`;
  const roomClass = `${P}-class-moving`;
  await db.collection('classes').doc(roomClass).set({ name: 'Moving', period: 'Period 2', teacherOfRecord: TEACHER_A, status: 'active' });
  const student = `${P}-student-moving`;
  await db.collection('grades').doc(student).set({ displayName: student, classId: roomClass, classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_A, status: 'active' });
  await fns.saveClassroomCourseMapping.run(teacherRequest({ courseId: COURSE, courseName: 'Course', classId: roomClass }, TEACHER_A));
  assert.ok(await read(`classroomCourseMappings/${mappingId(teacherUid, COURSE)}`), 'the mapping was saved');

  const link = (googleUserId) => fns.linkStudentToClassroom.run(teacherRequest({ courseId: COURSE, studentId: student, googleUserId, classId: roomClass }, TEACHER_A));
  await link('google-first');
  const linkPath = (await db.collection('classroomRosterLinks').where('studentId', '==', student).get()).docs[0].ref.path;
  assert.equal((await read(linkPath)).googleUserId, 'google-first', 'the teacher of record links a student');

  await db.collection('classes').doc(roomClass).set({ teacherOfRecord: TEACHER_C }, { merge: true });
  const stale = await refusal(link('google-second'));
  assert.equal(stale?.code, 'failed-precondition', 'the former teacher\'s mapping is no longer a mapping');
  assert.equal((await read(linkPath)).googleUserId, 'google-first', 'the student\'s Classroom identity is untouched');
});

test('A5: one Classroom call is bounded in courses and topics', async () => {
  const courses = Array.from({ length: 21 }, (_, index) => `${P}-c${index}`);
  const topics = await refusal(fns.ensureClassroomTopics.run(teacherRequest({ courseIds: courses, topicNames: ['Unit 1'] }, TEACHER_A)));
  assert.equal(topics?.code, 'invalid-argument');
  assert.match(topics.message, /at most 20 courses/);
  const manyTopics = await refusal(fns.ensureClassroomTopics.run(teacherRequest({ courseIds: [COURSE], topicNames: Array.from({ length: 101 }, (_, i) => `T${i}`) }, TEACHER_A)));
  assert.equal(manyTopics?.code, 'invalid-argument');
  const material = await refusal(fns.publishClassroomMaterial.run(teacherRequest({
    title: 'Notes', courseIds: courses, materials: [{ title: 'Notes', url: 'https://example.test/notes' }],
  }, TEACHER_A)));
  assert.equal(material?.code, 'invalid-argument');
  assert.match(material.message, /at most 20 courses/);
});

test('A6: the launch preview reads one assignment document and nothing under it', async () => {
  await db.doc(`assignments/${P}-launch`).set({ title: 'Launch', dueAt: null });
  await db.doc(`assignments/${P}-launch/private/notes`).set({ title: 'Not a preview' });
  const nested = await refusal(fns.getAssignmentByLaunchId.run({ data: { assignmentId: `${P}-launch/private/notes` }, rawRequest: { headers: {} } }));
  assert.equal(nested?.code, 'invalid-argument');
  const objectId = await refusal(fns.getAssignmentByLaunchId.run({ data: { assignmentId: { id: 'x' } }, rawRequest: { headers: {} } }));
  assert.equal(objectId?.code, 'invalid-argument');
  const preview = await fns.getAssignmentByLaunchId.run({ data: { assignmentId: `${P}-launch` }, rawRequest: { headers: {} } });
  assert.equal(preview.title, 'Launch');
});

test('T3: a Test Cycle is assigned to at most one batch of named students', async () => {
  await Promise.all(certFamilies({ prefix: P }).map(({ id, ...fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await db.collection('assignments').doc(TC_ASSIGNMENT).set(certAssignment({ prefix: P, classIds: [CLASS_A], assignmentId: TC_ASSIGNMENT }));
  const studentIds = Array.from({ length: 201 }, (_, index) => `${P}-named-${index}`);
  const refused = await refusal(fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: TC_ASSIGNMENT, studentIds }, TEACHER_A)));
  assert.equal(refused?.code, 'invalid-argument');
  assert.match(refused.message, /at most 200 students/);
  const pathId = await refusal(fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: TC_ASSIGNMENT, studentIds: ['a/b/c'] }, TEACHER_A)));
  assert.equal(pathId?.code, 'invalid-argument');
});
