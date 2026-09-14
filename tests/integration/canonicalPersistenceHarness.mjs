/*
 * THE CANONICAL PERSISTENCE CERTIFICATION HARNESS.
 *
 * Everything the end-to-end certification needs to drive the REAL Cloud
 * Functions against the Firestore emulator: a Google Classroom adapter stub, a
 * fixture assignment whose questions the shared grading contract can mark,
 * synthetic auth contexts, and teardown.
 *
 * THE FIXTURE QUESTIONS ARE DELIBERATELY SERVER-GRADEABLE. That is what lets
 * the certification send only the student's raw response and assert the result
 * — so a passing test means the SERVER marked the work, not that the harness
 * told it what to think.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — this suite loads the real Cloud Functions and must never reach a real project.',
);

/* --- the Google Classroom seam ------------------------------------------- */

const classroomModulePath = require.resolve(path.join(repo, 'functions/lib/classroom.js'));
const classroomCalls = [];
const classroomStub = {
  getClassroomClient: async (teacherUid) => { classroomCalls.push({ call: 'getClassroomClient', teacherUid }); return { __stub: true }; },
  findSubmissionForStudent: async (client, args) => {
    classroomCalls.push({ call: 'findSubmissionForStudent', ...args });
    return { id: `submission-${args.googleUserId}`, state: 'CREATED' };
  },
  patchGrade: async (client, args) => { classroomCalls.push({ call: 'patchGrade', ...args }); return { state: 'CREATED' }; },
  returnSubmission: async (client, args) => { classroomCalls.push({ call: 'returnSubmission', ...args }); return { state: 'RETURNED' }; },
  createCourseWork: async (client, args) => {
    classroomCalls.push({ call: 'createCourseWork', ...args });
    return { id: 'UNEXPECTED_SECOND_ITEM', alternateLink: null };
  },
  findCourseWorkByPublicationMarker: async () => null,
  getCourseWork: async () => null,
};

// Installed before functions/index.js is required, so `classroomLib()` memoizes
// this instead of the real googleapis client.
require.cache[classroomModulePath] = {
  id: classroomModulePath,
  filename: classroomModulePath,
  path: path.dirname(classroomModulePath),
  loaded: true,
  children: [],
  paths: [],
  exports: classroomStub,
};

export const patchGradeCalls = () => classroomCalls.filter((entry) => entry.call === 'patchGrade');
export const resetClassroomCalls = () => { classroomCalls.length = 0; };

/* --- the real functions, loaded after the seam is in place ---------------- */

export const fns = require(path.join(repo, 'functions/index.js'));
// The SAME id helper the passback trigger looks a roster link up with. A
// hand-rolled `courseId__studentId` reads as "student is not linked to this
// Classroom course" and the assertion would quietly prove nothing.
const { rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
export const db = admin.firestore();

assert.equal(
  require(classroomModulePath).patchGrade,
  classroomStub.patchGrade,
  'the Classroom stub must be the module functions/index.js sees, or the passback assertion proves nothing',
);

/* --- identities and ids --------------------------------------------------- */

export const PREFIX = 'canonpersist';
export const TEACHER_EMAIL = 'canon.teacher@desotoisd.org';
export const CLASS_ID = `${PREFIX}-class-a`;
export const OTHER_CLASS_ID = `${PREFIX}-class-b`;
export const ASSIGNMENT_ID = `${PREFIX}-assignment`;
export const STUDENT_A = `${PREFIX}-student-a`;
export const STUDENT_B = `${PREFIX}-student-b`;
// Used only by the Classroom passback test, which needs a student who has
// finished the whole assignment: the grades trigger posts a stage, not a
// keystroke, so a partially answered tracker legitimately posts nothing.
export const STUDENT_C = `${PREFIX}-student-c`;
const COURSE_ID = `${PREFIX}-course`;
const COURSEWORK_ID = `${PREFIX}-coursework`;

export const teacherRequest = (data, email = TEACHER_EMAIL) => ({
  auth: { uid: `uid-${email}`, token: { role: 'teacher', email, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

export const studentRequest = (studentId, data) => ({
  auth: { uid: `uid-${studentId}`, token: { role: 'student', studentId } },
  data,
  rawRequest: { headers: {} },
});

/** The error a callable rejected with, or null when it resolved. */
export const refusal = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return { code: error?.code || null, message: String(error?.message || error) };
  }
};

/* --- the fixture ---------------------------------------------------------- */

/*
 * Four `literal` questions, which `serverGradingSupport` accepts: no generator,
 * no variants, no adaptive band profile, and a real answer key. A question the
 * server could NOT mark would make every grading assertion below a test of the
 * harness rather than of the product.
 */
const question = (index, activityRole, accepted) => ({
  questionId: `${PREFIX}-q${index}`,
  id: `${PREFIX}-q${index}`,
  type: 'literal',
  activityRole,
  prompt: `Certification question ${index}`,
  solveFor: 'y',
  acceptedAnswers: [accepted],
});

export const certAssignment = () => ({
  title: 'Canonical persistence certification',
  assignedClassIds: [CLASS_ID],
  // Open now, and closing well after this run.
  releaseAt: new Date(Date.now() - 86_400_000).toISOString(),
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  lateDueAt: new Date(Date.now() + 172_800_000).toISOString(),
  schemaVersion: 5,
  // Assignment V5 shape: the runtime question list is projected from SECTIONS,
  // so a top-level `questions` array would produce an empty runtime and every
  // grading assertion below would be testing the fixture.
  sections: [{
    id: `${PREFIX}-section-classwork`,
    role: 'classwork',
    title: 'Classwork',
    questions: [
      question(0, 'classwork', '2x+1'),
      question(1, 'classwork', 'x+5'),
      question(2, 'classwork', 'x-4'),
      question(3, 'classwork', '9'),
    ],
  }],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
});

export const seedFixture = async () => {
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Canonical Persistence — Period 1', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('classes').doc(OTHER_CLASS_ID).set({
    name: 'Canonical Persistence — Period 2', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 2', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  for (const studentId of [STUDENT_A, STUDENT_B, STUDENT_C]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId, classId: CLASS_ID, classPeriod: 'Period 1',
      assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
      // Classwork completion is answers AND engaged time, and engaged time is
      // written by the separate activity flush rather than by a submission. A
      // student who really worked a period has it; seeding it is what makes
      // the completion projection and the Classroom stage reachable here
      // instead of quietly unreachable.
      assignmentActivity: { [ASSIGNMENT_ID]: { totalTimeSeconds: 1800 } },
    });
  }
  await db.collection('assignments').doc(ASSIGNMENT_ID).set(certAssignment());
  await db.collection('classroomLinks').doc(`${PREFIX}-publication`).set({
    schemaVersion: 2, publicationId: `${PREFIX}-publication`, assignmentId: ASSIGNMENT_ID,
    courseId: COURSE_ID, courseName: 'Certification Course', courseworkId: COURSEWORK_ID,
    teacherUid: `uid-${TEACHER_EMAIL}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
  for (const studentId of [STUDENT_A, STUDENT_B, STUDENT_C]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE_ID, studentId)).set({
      courseId: COURSE_ID, studentId, googleUserId: `google-${studentId}`,
    });
  }
};

const deletePrefixed = async (collection, field = null) => {
  const snapshot = field
    ? await db.collection(collection).where(field, '>=', PREFIX).where(field, '<', `${PREFIX}`).get()
    : await db.collection(collection).get();
  await Promise.all(snapshot.docs
    .filter((doc) => doc.id.startsWith(PREFIX) || String(doc.data()?.studentId || '').startsWith(PREFIX))
    .map((doc) => doc.ref.delete()));
};

export const teardownFixture = async () => {
  for (const collection of [
    'classes', 'grades', 'assignments', 'classroomLinks', 'classroomRosterLinks',
    'studentSubmissionReceipts', 'studentDevicePersistenceReports',
    'studentResponseCheckpoints', 'studentWorkspaceDrafts',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await deletePrefixed(collection);
  }
};

/* --- driving the ingestion path the way a Chromebook would ---------------- */

/**
 * One submission envelope.
 *
 * `record` defaults to a plain attempted record with NO verdict, because the
 * certification's questions are all server-gradeable: the server derives
 * correctness from `response` and never consults this.
 */
export const submissionEnvelope = ({
  actionId,
  questionIndex,
  assignmentId = ASSIGNMENT_ID,
  activityRole = 'classwork',
  previousTotalAttempts = 0,
  capturedAt = Date.now(),
  record = null,
  response = null,
  capturedSectionAccess = null,
}) => ({
  schemaVersion: 1,
  actionId,
  kind: 'ordinarySubmission',
  assignmentId,
  questionIndex,
  questionId: `${PREFIX}-q${questionIndex}`,
  variantIndex: 0,
  activityRole,
  capturedAt,
  previousTotalAttempts,
  record: record || { totalAttempts: previousTotalAttempts + 1, attemptCount: previousTotalAttempts + 1, status: 'attempted' },
  response,
  capturedSectionAccess,
  hasClassworkGrade: true,
  hasDolGrade: false,
});

export const ingest = async (studentId, submissions) => {
  const result = await fns.ingestStudentSubmissions.run(studentRequest(studentId, { submissions }));
  return result.receipts;
};

export const readGradeDoc = async (studentId) => (await db.collection('grades').doc(studentId).get()).data() || {};

export const readRecord = async (studentId, questionIndex, assignmentId = ASSIGNMENT_ID) => {
  const grade = await readGradeDoc(studentId);
  return grade?.gradesByAssignment?.[assignmentId]?.[String(questionIndex)] || {};
};

/** Run the real grades trigger the way Firestore would. */
export const runClassroomSync = async (studentId, beforeData) => {
  const after = await db.collection('grades').doc(studentId).get();
  await fns.syncGradeToClassroom.run({
    params: { studentId },
    data: {
      before: { exists: Boolean(beforeData), data: () => beforeData || undefined },
      after,
    },
  });
};
