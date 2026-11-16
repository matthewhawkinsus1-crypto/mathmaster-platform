/*
 * WHO MAY INSPECT OR CHANGE A STUDENT'S GRADE: THE CALLABLES, CALLED FOR REAL.
 *
 * HOW TO RUN: npm run test:callable-boundaries:emulator
 *
 * The Response Inspector and the grade overrides (#249) are teacher-only, and
 * the server is what keeps them so: inspectStudentResponse,
 * overrideStudentResponseGrade and overrideStudentAssignmentGrade each ask for
 * the teacher role, then for the student's teacher of record, then for an
 * assignment the student's class has. Until now that rested on reading the
 * source; the Firestore rules suite covers the documents, not the callables.
 *
 * Here each of them is called through the client SDK with a real Auth emulator
 * token (callableHost.mjs) by: nobody signed in, a token that does not verify,
 * an account with no role, the student, a classmate, the teacher of another
 * class in the same school and in another school, a teacher role on an
 * unverified email, and the student's own teacher. Every refusal is asserted by
 * its exact code and message, and the whole project is compared before and
 * after: a refused call writes nothing at all, and never reaches Google. The
 * student's own teacher is the positive control, so the same fixture shows the
 * refusals are the boundary and not a broken setup.
 *
 * The code has no notion of a school: the teacher of record is an email
 * address. The other-school teacher is here so that "same email domain" can
 * never become a way in.
 *
 * inspectClassroomPublication reads a class's Google Classroom roster and can
 * reset who a post is assigned to. It does not refuse another teacher; it
 * answers only with their own posts. That is asserted the same way. (A post
 * with no recorded teacher, no teacherUid, is answered for any teacher through
 * that teacher's own Google account. That legacy rule is not asserted here.)
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

const {
  FieldPath, NOTHING_CHANGED, browser, changesBetween, db, googleCallsSince, googleFixtures, googleMark,
  projectSnapshot, rawCall, refusalOf, shutdown, signedIn,
} = await import('./callableHost.mjs');
const { buildSubmissionEnvelope } = await import('../../../functions/shared/submissionEnvelope.mjs');

const CLASS = {
  own: 'boundary-class-own',
  sameSchool: 'boundary-class-same-school',
  otherSchool: 'boundary-class-other-school',
  unverified: 'boundary-class-unverified-teacher',
};
const SHARED = 'boundary-assignment-shared';
const ELSEWHERE = 'boundary-assignment-elsewhere';
// Synthetic addresses on reserved domains: nobody's real account.
const TEACHER = {
  owner: { label: 'own-teacher', email: 'owner.teacher@district-one.test', classId: CLASS.own },
  sameSchool: { label: 'same-school-teacher', email: 'colleague.teacher@district-one.test', classId: CLASS.sameSchool },
  otherSchool: { label: 'other-school-teacher', email: 'teacher@district-two.test', classId: CLASS.otherSchool },
  unverified: { label: 'unverified-teacher', email: 'unverified.teacher@district-one.test', classId: CLASS.unverified },
};
const STUDENT = {
  subject: { id: 'boundary-subject', email: 'subject.student@district-one.test', classId: CLASS.own },
  classmate: { id: 'boundary-classmate', email: 'classmate.student@district-one.test', classId: CLASS.own },
  credited: { id: 'boundary-credited', email: 'credited.student@district-one.test', classId: CLASS.own },
  zeroed: { id: 'boundary-zeroed', email: 'zeroed.student@district-one.test', classId: CLASS.own },
  unverifiedsClass: { id: 'boundary-unverified-class', email: 'unverified.class.student@district-one.test', classId: CLASS.unverified },
};
const ANSWERS = ['2x+1', 'x+5'];
const WRONG = { kind: 'scalar', type: 'literal', value: 'definitely not it', fields: [] };

const question = (index) => ({
  questionId: `boundary-q${index}`,
  id: `boundary-q${index}`,
  type: 'literal',
  activityRole: 'classwork',
  prompt: `Boundary question ${index}`,
  solveFor: 'y',
  acceptedAnswers: [ANSWERS[index]],
});
const assignment = (title, assignedClassIds) => ({
  title,
  assignedClassIds,
  schemaVersion: 5,
  releaseAt: new Date(Date.now() - 86_400_000).toISOString(),
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  lateDueAt: new Date(Date.now() + 172_800_000).toISOString(),
  sections: [{ id: 'boundary-classwork', role: 'classwork', title: 'Classwork', questions: [question(0), question(1)] }],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
});

/* --- what each callable is asked, valid in every respect but the caller --- */

const INTEGRITY_ZERO = {
  action: 'issueZero',
  reasonCode: 'academicDishonesty',
  note: 'Boundary certification.',
  academicIntegrityConsequence: {
    scope: 'assignment', teacherConfirmed: true, incidentReason: 'academicDishonesty', participantRole: 'individual',
  },
};
const GRADE_CALLABLES = [
  {
    name: 'inspectStudentResponse',
    data: (studentId, assignmentId = SHARED) => ({ studentId, assignmentId, questionIndex: 0 }),
    notTeacherOfRecord: "Only this student's teacher of record may inspect responses.",
  },
  {
    name: 'overrideStudentResponseGrade',
    data: (studentId, assignmentId = SHARED) => ({
      studentId, assignmentId, questionIndex: 0, action: 'grantFullCredit',
      reason: 'Correct response was incorrectly graded', note: 'Boundary certification.',
    }),
    notTeacherOfRecord: "Only this student's teacher of record may change this grade.",
  },
  {
    name: 'overrideStudentAssignmentGrade',
    data: (studentId, assignmentId = SHARED) => ({ studentId, assignmentId, ...INTEGRITY_ZERO }),
    notTeacherOfRecord: "Only this student's teacher of record may change this assignment grade.",
  },
];
const PUBLICATION_CALL = { name: 'inspectClassroomPublication', data: () => ({ assignmentId: SHARED, repairAudience: true }) };
const EVERY_CALL = [...GRADE_CALLABLES.map((callable) => ({ name: callable.name, data: () => callable.data(STUDENT.subject.id) })), PUBLICATION_CALL];

const SIGN_IN_FIRST = { code: 'functions/unauthenticated', message: 'Sign in before making this change.' };
const NOT_A_TEACHER = { code: 'functions/permission-denied', message: 'Only a teacher can make this change.' };
const NOT_ASSIGNED = { code: 'functions/permission-denied', message: "This assignment is not assigned to the student's current class." };
const denied = (message) => ({ code: 'functions/permission-denied', message });

/** The call is refused exactly so, writes nothing anywhere, and never reaches Google. */
async function assertRefusedAndNothingWritten(caller, name, data, expected) {
  const before = await projectSnapshot();
  const mark = googleMark();
  assert.deepEqual(await refusalOf(caller.call(name, data)), expected, `${caller.label} calling ${name}`);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED, `${caller.label} calling ${name} wrote nothing`);
  assert.deepEqual(googleCallsSince(mark), [], `${caller.label} calling ${name} never reached Google Classroom`);
}

/* --- the fixture ----------------------------------------------------------- */

const accounts = {};

before(async () => {
  for (const [key, teacher] of Object.entries(TEACHER)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classes').doc(teacher.classId).set({
      name: `Boundary ${key}`, course: 'algebra1', courseLevel: 'standard', period: 'Period 1',
      teacherOfRecord: teacher.email, status: 'active',
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('teacherDirectory').doc(teacher.email).set({ email: teacher.email, active: true });
  }
  for (const student of Object.values(STUDENT)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(student.id).set({
      displayName: student.id, classId: student.classId, classPeriod: 'Period 1', status: 'active',
      gradesByAssignment: {}, assignmentActivity: { [SHARED]: { totalTimeSeconds: 1800 } },
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('studentDirectory').doc(student.email).set({ studentId: student.id });
  }
  await db.collection('assignments').doc(SHARED).set(assignment('Shared by four classes', Object.values(CLASS)));
  await db.collection('assignments').doc(ELSEWHERE).set(assignment('Only the same-school class has this', [CLASS.sameSchool]));

  // Every account signs in and is given its role by resolveSignedInRole, as in
  // the app. The one exception is a token production never issues: a teacher
  // role on an unverified email, which must still not pass for that address.
  for (const [key, teacher] of Object.entries(TEACHER)) {
    // eslint-disable-next-line no-await-in-loop
    accounts[key] = key === 'unverified'
      ? await signedIn({ label: teacher.label, email: teacher.email, emailVerified: false, claims: { role: 'teacher' } })
      : await signedIn({ label: teacher.label, email: teacher.email });
  }
  for (const [key, student] of Object.entries(STUDENT)) {
    // eslint-disable-next-line no-await-in-loop
    accounts[key] = await signedIn({ label: `student-${key}`, email: student.email });
  }
  accounts.unlinked = await signedIn({ label: 'no-role-account', email: 'unlinked.person@district-one.test' });

  // Each student answers question 0 (wrongly) from their own browser, through
  // the real ingestion callable, so there is a real attempt to inspect and
  // correct.
  for (const [key, student] of Object.entries(STUDENT)) {
    const envelope = buildSubmissionEnvelope({
      actionId: `${student.id}-q0`, kind: 'ordinarySubmission', studentId: student.id, assignmentId: SHARED,
      questionIndex: 0, questionId: 'boundary-q0', activityRole: 'classwork',
      record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' }, response: WRONG, hasClassworkGrade: true,
    });
    // eslint-disable-next-line no-await-in-loop
    const { receipts } = await accounts[key].call('ingestStudentSubmissions', { submissions: [envelope] });
    assert.equal(receipts[0]?.disposition, 'accepted', `${key} recorded an attempt`);
  }
  // The subject was in the same-school class before moving to their current
  // one, and answered an assignment only that class has.
  await db.collection('grades').doc(STUDENT.subject.id).update(new FieldPath('gradesByAssignment', ELSEWHERE), {
    0: { status: 'attempted', totalAttempts: 1, attemptCount: 1, partialCredit: 0, variantIndex: 0, lastAttemptAt: new Date(Date.now() - 3_600_000).toISOString() },
  });

  // One Google Classroom post per teacher on the shared assignment.
  const publication = (id, courseId, courseworkId, teacherUid) => ({
    schemaVersion: 2, publicationId: id, assignmentId: SHARED, courseId, courseName: `Course ${courseId}`,
    courseworkId, teacherUid, status: 'published', maxPoints: 100, sectionKey: 'whole', publicationKind: 'assignment',
  });
  await db.collection('classroomLinks').doc('boundary-post-own').set(publication('boundary-post-own', 'course-own', 'coursework-own', accounts.owner.uid));
  await db.collection('classroomLinks').doc('boundary-post-colleague').set(publication('boundary-post-colleague', 'course-colleague', 'coursework-colleague', accounts.sameSchool.uid));
  googleFixtures.publicationByCourseWork['coursework-own'] = 'boundary-post-own';
  googleFixtures.publicationByCourseWork['coursework-colleague'] = 'boundary-post-colleague';
});

after(shutdown);

test('the accounts carry exactly the roles the server granted', () => {
  assert.equal(accounts.owner.claims.role, 'teacher');
  assert.equal(accounts.owner.claims.email_verified, true);
  assert.equal(accounts.subject.claims.role, 'student');
  assert.equal(accounts.subject.claims.studentId, STUDENT.subject.id);
  assert.equal(accounts.unlinked.claims.role, undefined, 'an account on no roster gets no role');
  assert.equal(accounts.unlinked.role?.needsLink, true);
  assert.equal(accounts.unverified.claims.email_verified, false);
});

/* ==========================================================================
 * NOT SIGNED IN, OR NOT VERIFIABLY ANYONE.
 * ======================================================================== */

test('a signed-out caller is refused by all four callables, and nothing is written', async () => {
  const signedOut = browser('signed-out');
  for (const { name, data } of EVERY_CALL) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(signedOut, name, data(), SIGN_IN_FIRST);
  }
});

test('a token that does not verify is refused by the callable protocol before any handler runs', async () => {
  for (const { name, data } of EVERY_CALL) {
    const before = await projectSnapshot();
    const mark = googleMark();
    // eslint-disable-next-line no-await-in-loop
    const response = await rawCall(name, data(), { authorization: 'Bearer not-a-token' });
    assert.equal(response.status, 401, name);
    assert.deepEqual(response.body, { error: { message: 'Unauthenticated', status: 'UNAUTHENTICATED' } }, name);
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED, `${name} wrote nothing`);
    assert.deepEqual(googleCallsSince(mark), []);
  }
});

test('a signed-in account with no MathMaster role is refused', async () => {
  for (const { name, data } of EVERY_CALL) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.unlinked, name, data(), NOT_A_TEACHER);
  }
});

/* ==========================================================================
 * STUDENTS.
 * ======================================================================== */

test('a student cannot inspect or change their own grade', async () => {
  for (const { name, data } of EVERY_CALL) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.subject, name, data(), NOT_A_TEACHER);
  }
});

test("a student cannot inspect or change a classmate's grade", async () => {
  for (const { name, data } of EVERY_CALL) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.classmate, name, data(), NOT_A_TEACHER);
  }
});

/* ==========================================================================
 * TEACHERS WHO ARE NOT THIS STUDENT'S TEACHER OF RECORD.
 * ======================================================================== */

test('the teacher of another class in the same school is refused, though their class has the assignment', async () => {
  for (const callable of GRADE_CALLABLES) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.sameSchool, callable.name, callable.data(STUDENT.subject.id), denied(callable.notTeacherOfRecord));
  }
});

test('the teacher of a class in another school is refused the same way', async () => {
  for (const callable of GRADE_CALLABLES) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.otherSchool, callable.name, callable.data(STUDENT.subject.id), denied(callable.notTeacherOfRecord));
  }
});

test("a student's former teacher cannot reach the work the student did in their class", async () => {
  // The subject moved out of the same-school class; the work on its assignment
  // is still on their grade document.
  for (const callable of GRADE_CALLABLES) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.sameSchool, callable.name, callable.data(STUDENT.subject.id, ELSEWHERE), denied(callable.notTeacherOfRecord));
  }
});

test('a teacher role on an unverified email is not the teacher of record that email names', async () => {
  // The class's teacherOfRecord IS this address. Anyone can create an account
  // claiming an address; only a verified one may stand for it.
  for (const callable of GRADE_CALLABLES) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.unverified, callable.name, callable.data(STUDENT.unverifiedsClass.id), denied(callable.notTeacherOfRecord));
  }
});

test("the student's own teacher cannot use them on an assignment the student's current class does not have", async () => {
  for (const callable of GRADE_CALLABLES) {
    // eslint-disable-next-line no-await-in-loop
    await assertRefusedAndNothingWritten(accounts.owner, callable.name, callable.data(STUDENT.subject.id, ELSEWHERE), NOT_ASSIGNED);
  }
});

/* ==========================================================================
 * THE POSITIVE CONTROL: THE STUDENT'S OWN TEACHER.
 * ======================================================================== */

test("the student's own teacher inspects the response, and inspecting writes nothing", async () => {
  const before = await projectSnapshot();
  const model = await accounts.owner.call('inspectStudentResponse', { studentId: STUDENT.subject.id, assignmentId: SHARED, questionIndex: 0 });
  assert.equal(model.student.id, STUDENT.subject.id);
  assert.equal(model.assignment.id, SHARED);
  assert.equal(model.question.id, 'boundary-q0');
  assert.equal(model.attemptNumber, 1);
  assert.equal(model.automaticScore, 0);
  assert.deepEqual(model.states.submitted, WRONG, 'what the student submitted, as graded');
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED);
});

test("the student's own teacher grants credit: the override, its audit and the passback signal are written, and nothing else", async () => {
  const studentId = STUDENT.credited.id;
  const before = await projectSnapshot();
  const result = await accounts.owner.call('overrideStudentResponseGrade', GRADE_CALLABLES[1].data(studentId));
  assert.equal(result.automaticScore, 0);
  assert.equal(result.authoritativeScore, 100);

  const changes = changesBetween(before, await projectSnapshot());
  assert.deepEqual(changes.changed, [`grades/${studentId}`]);
  assert.deepEqual(changes.removed, []);
  assert.equal(changes.added.length, 1);
  assert.match(changes.added[0], new RegExp(`^grades/${studentId}/gradeOverrideAudits/[^/]+$`));

  const grade = (await db.collection('grades').doc(studentId).get()).data();
  const override = grade.teacherGradeOverridesByAssignment[SHARED]['0'];
  assert.equal(override.active, true);
  assert.equal(override.score, 100);
  assert.equal(grade.classroomReleaseSignals[SHARED].source, 'teacher-grade-override');
  assert.equal(grade.gradesByAssignment[SHARED]['0'].status, 'attempted', "the student's own record is untouched");
  const audit = (await db.doc(changes.added[0]).get()).data();
  assert.deepEqual(audit.actor, { uid: accounts.owner.uid, email: TEACHER.owner.email, name: null });
  assert.equal(audit.previousScore, 0);
  assert.equal(audit.newScore, 100);
});

test("the student's own teacher issues an integrity zero: the override, audit and teacher-only incident are written", async () => {
  const studentId = STUDENT.zeroed.id;
  const before = await projectSnapshot();
  const result = await accounts.owner.call('overrideStudentAssignmentGrade', GRADE_CALLABLES[2].data(studentId));
  assert.equal(result.override.score, 0);

  const changes = changesBetween(before, await projectSnapshot());
  assert.deepEqual(changes.changed, [`grades/${studentId}`]);
  assert.deepEqual(changes.removed, []);
  assert.deepEqual(changes.added.map((key) => key.replace(/[^/]+$/, '*')).sort(), [
    `grades/${studentId}/gradeOverrideAudits/*`,
    'studentSupportEvents/*',
    'studentSupportEvents/*',
  ]);
  assert.ok(changes.added.includes(`studentSupportEvents/${result.incidentId}`));
  const grade = (await db.collection('grades').doc(studentId).get()).data();
  assert.equal(grade.teacherGradeOverridesByAssignment[SHARED].__assignment.score, 0);
  const incident = (await db.collection('studentSupportEvents').doc(result.incidentId).get()).data();
  assert.deepEqual(incident.authorizedTeacherEmails, [TEACHER.owner.email]);
  assert.equal(incident.actor.uid, accounts.owner.uid);
});

/* ==========================================================================
 * inspectClassroomPublication: ONLY THE CALLER'S OWN POSTS.
 * ======================================================================== */

test("another teacher sees, and repairs, only their own Classroom post on a shared assignment", async () => {
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await accounts.sameSchool.call('inspectClassroomPublication', PUBLICATION_CALL.data());
  assert.deepEqual(result.results.map((entry) => [entry.courseId, entry.status]), [['course-colleague', 'ok']]);
  const calls = googleCallsSince(mark);
  assert.deepEqual([...new Set(calls.map((call) => call.teacherUid))], [accounts.sameSchool.uid], 'only with their own Google account');
  assert.ok(calls.every((call) => !call.courseId || call.courseId === 'course-colleague'), 'never the other teacher\'s course');
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED);
});

test('a teacher with no post on the assignment gets an empty answer, and Google is never asked', async () => {
  const before = await projectSnapshot();
  const mark = googleMark();
  const result = await accounts.otherSchool.call('inspectClassroomPublication', PUBLICATION_CALL.data());
  assert.deepEqual(result, { assignmentId: SHARED, results: [], summary: { courses: 0, rosterStudents: 0, failed: 0 } });
  assert.deepEqual(googleCallsSince(mark), []);
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED);
});

test("the post's own teacher reads the roster and resets the audience with their own Google account", async () => {
  const mark = googleMark();
  const result = await accounts.owner.call('inspectClassroomPublication', PUBLICATION_CALL.data());
  assert.deepEqual(result.results.map((entry) => [entry.courseId, entry.status, entry.assigneeMode, entry.rosterStudentCount]), [
    ['course-own', 'ok', 'ALL_STUDENTS', 2],
  ]);
  assert.deepEqual(googleCallsSince(mark).map((call) => [call.call, call.teacherUid, call.courseId ?? null]), [
    ['getClassroomClient', accounts.owner.uid, null],
    ['getCourseWork', accounts.owner.uid, 'course-own'],
    ['modifyCourseWorkAssignees', accounts.owner.uid, 'course-own'],
    ['listStudents', accounts.owner.uid, 'course-own'],
  ]);
});
