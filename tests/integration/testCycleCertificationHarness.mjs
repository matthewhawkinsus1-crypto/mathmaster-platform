/*
 * THE TEST CYCLE CERTIFICATION HARNESS.
 *
 * Everything the end-to-end certification needs in order to drive the REAL
 * Cloud Functions against the Firestore emulator: a Google Classroom adapter
 * stub, synthetic auth contexts, fixture seeding and teardown, and the small
 * loop that sits a secure exam the way a student's browser would.
 *
 * WHY A STUB RATHER THAN A LIVE CLASSROOM COURSE. #224 says to use a test seam
 * and not require a district course. The stub is installed into Node's require
 * cache BEFORE functions/index.js loads, so `classroomLib()` memoizes the stub
 * on its first call and no production code is changed to make this testable.
 * The stub records every call, which is how "the SAME coursework item was
 * updated" becomes an assertion rather than a claim.
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

/**
 * Every Classroom call the grade trigger makes, in order.
 *
 * `patchGrade` entries are the ones that matter: the certification proves that
 * a retest produces a second patch to the SAME courseWorkId, and that no
 * `createCourseWork` ever happens.
 */
export const classroomCalls = [];

const classroomStub = {
  getClassroomClient: async (teacherUid) => {
    classroomCalls.push({ call: 'getClassroomClient', teacherUid });
    return { __stub: true };
  },
  findSubmissionForStudent: async (client, args) => {
    classroomCalls.push({ call: 'findSubmissionForStudent', ...args });
    return { id: `submission-${args.googleUserId}`, state: 'CREATED' };
  },
  patchGrade: async (client, args) => {
    classroomCalls.push({ call: 'patchGrade', ...args });
    return { state: 'CREATED' };
  },
  returnSubmission: async (client, args) => {
    classroomCalls.push({ call: 'returnSubmission', ...args });
    return { state: 'RETURNED' };
  },
  // Present so an accidental call is recorded rather than throwing a
  // TypeError that could be mistaken for an unrelated failure. Creating a
  // second coursework item is the thing the certification forbids, so it has
  // to be observable.
  createCourseWork: async (client, args) => {
    classroomCalls.push({ call: 'createCourseWork', ...args });
    return { id: 'UNEXPECTED_SECOND_ITEM', alternateLink: null };
  },
  findCourseWorkByPublicationMarker: async () => null,
  getCourseWork: async () => null,
};

// Installed before functions/index.js is required, so `classroomLib()`
// memoizes this instead of the real googleapis client.
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
export const createCourseWorkCalls = () => classroomCalls.filter((entry) => entry.call === 'createCourseWork');
export const resetClassroomCalls = () => { classroomCalls.length = 0; };

/* --- the real functions, loaded after the seam is in place ---------------- */

const requireFunctionsModule = (specifier) => {
  try {
    return require(path.join(repo, 'functions/node_modules', specifier));
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `${specifier} is not installed. Run \`npm --prefix functions ci\` before this suite.`,
      );
    }
    throw error;
  }
};

export const fns = require(path.join(repo, 'functions/index.js'));
export const admin = requireFunctionsModule('firebase-admin');
export const db = admin.firestore();

assert.equal(
  require(classroomModulePath).patchGrade,
  classroomStub.patchGrade,
  'the Classroom stub must be the module functions/index.js sees, or the passback assertions prove nothing',
);

/* --- identities ----------------------------------------------------------- */

export const TEACHER_EMAIL = 'cert.teacher@desotoisd.org';
export const OTHER_TEACHER_EMAIL = 'cert.other@desotoisd.org';

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

/** The error code a callable rejected with, or null when it resolved. */
export const refusal = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return { code: error?.code || null, message: String(error?.message || error) };
  }
};

/* --- driving a secure exam the way a browser would ------------------------ */

/**
 * Sit one secure session, answering `correctCount` questions correctly.
 *
 * The harness only ever reads the SANITIZED question the server hands a
 * student, and derives the answer from its prompt. It never touches
 * `privateGrading`, which is what keeps this a test of the product rather than
 * a test of the fixture.
 *
 * Returns the issued instances so the caller can prove a retest reused none of
 * them.
 */
export const sitSecureExam = async ({
  studentId, examSessionId, correctCount, total, answerFromPrompt, wrongAnswer,
}) => {
  const issued = [];
  await fns.startSecureExamSession.run(studentRequest(studentId, { examSessionId }));

  for (let index = 0; index < total; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const question = await fns.issueSecureExamQuestion.run(studentRequest(studentId, { examSessionId }));
    const instance = question.questionInstance;
    assert.ok(instance, `no question issued at ordinal ${index + 1}`);
    const correct = answerFromPrompt(instance.prompt);
    assert.ok(
      correct !== null,
      `certification harness met a question it cannot answer: ${instance.prompt}`,
    );
    issued.push({
      ordinal: index + 1,
      questionInstanceId: instance.questionInstanceId,
      prompt: instance.prompt,
      answeredCorrectly: index < correctCount,
      publicKeys: Object.keys(instance),
    });
    // eslint-disable-next-line no-await-in-loop
    const result = await fns.submitSecureExamResponse.run(studentRequest(studentId, {
      examSessionId,
      questionInstanceId: instance.questionInstanceId,
      responsePayload: { responses: { answer: index < correctCount ? correct : wrongAnswer } },
      submissionId: `cert-sub-${examSessionId}-${index + 1}`,
    }));
    // Correctness is held: the submit response may never say whether it was right.
    assert.equal(result.correctnessReleased, false);
    assert.equal('isCorrect' in result, false, 'submit response must not reveal correctness');
  }
  return issued;
};

/** The stored session document, read with the Admin SDK the way a server would. */
export const readSession = async (examSessionId) => (
  (await db.collection('examSessions').doc(examSessionId).get()).data()
);

export const readRecord = async (assignmentId, studentId) => (
  (await db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).get()).data()
);

export const readCorrectionPlan = async (assignmentId, studentId) => (
  (await db.collection('testCycleCorrectionPlans').doc(`${assignmentId}__${studentId}`).get()).data()
);

export const readRetestPlan = async (assignmentId, studentId) => (
  (await db.collection('testCycleRetestPlans').doc(`${assignmentId}__${studentId}`).get()).data()
);

export const readGradeDoc = async (studentId) => (
  (await db.collection('grades').doc(studentId).get()).data()
);

/**
 * Fire the Classroom passback trigger for one student.
 *
 * `syncGradeToClassroom` is an onDocumentWritten trigger; v2 exposes `.run`, so
 * the real handler runs against a real before/after pair rather than a
 * reimplementation of what it might do.
 */
export const runClassroomSync = async (studentId, beforeData) => {
  // The REAL after-snapshot, `ref` included: the trigger writes the student's
  // Classroom receipt back through `after.ref.update(...)`, so a hand-rolled
  // stand-in would silently skip the half of the handler that a student sees.
  const after = await db.collection('grades').doc(studentId).get();
  await fns.syncGradeToClassroom.run({
    params: { studentId },
    data: {
      before: { exists: Boolean(beforeData), data: () => beforeData || undefined },
      after,
    },
  });
};
