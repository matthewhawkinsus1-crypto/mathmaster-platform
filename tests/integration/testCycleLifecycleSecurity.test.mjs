/*
 * TEST CYCLE LIFECYCLE — ADVERSARIAL CERTIFICATION.
 *
 * HOW TO RUN:  npm run test:challenge-finish   (every tests/integration suite)
 *         or:  firebase emulators:exec --only firestore --project mathmaster-lifecycle \
 *                --config tests/browser/emulator/firebase.json \
 *                "node --import ./tests/integration/support/emulatorTransactions.mjs \
 *                 --test tests/integration/testCycleLifecycleSecurity.test.mjs"
 *
 * testCycleCertification.test.mjs proves the happy path works. This suite is
 * the other half: a student (and a careless or curious teacher) trying to get
 * through the lifecycle some other way — calling the callables directly, in an
 * order no screen would, on assignments in states no screen would offer — and
 * the paths the happy-path fixture never took because it happened to be timed,
 * to embed its blueprint, and to be released exactly once.
 *
 * Every scenario drives the REAL Cloud Functions against the emulator and reads
 * back what actually landed. Like the certification, it never reads an answer
 * key: answers are derived from the sanitized prompt a browser would receive.
 *
 * Ids are prefixed `advlc` and distinct from the certification's, because the
 * integration suites share one emulator and run in parallel.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  CERT_TARGETS, CERT_TOTAL_QUESTIONS, CERT_WRONG_ANSWER,
  certAnswerFromPrompt, certAssessmentPolicy, certFamilies,
} from '../fixtures/testCycleCertificationFixture.mjs';
import {
  db, fns, readRecord, readSession, refusal, sitSecureExam, studentRequest, teacherRequest,
  OTHER_TEACHER_EMAIL, TEACHER_EMAIL,
} from './testCycleCertificationHarness.mjs';

const PREFIX = 'advlc_';
const CLASS_ID = 'advlc-class-1';
const OTHER_CLASS_ID = 'advlc-class-2';

/** The certification's families under this suite's own ids. */
const families = () => certFamilies().map((family) => ({
  ...family,
  id: family.id.replace(/^cert_/, PREFIX),
  familyId: String(family.familyId).replace(/^cert_/, PREFIX),
}));
const familyIdsFor = (targetId) => families()
  .filter((family) => family.id.startsWith(`${PREFIX}${targetId}-`))
  .map((family) => family.id);

const blueprint = ({ timeLimitSeconds = null } = {}) => ({
  blueprintId: `${PREFIX}blueprint`,
  version: 1,
  title: 'Lifecycle Unit Test',
  courseId: 'algebra1',
  // Deliberately UNTIMED unless a scenario asks otherwise. The certification
  // fixture is timed, which is how an untimed test came to be untested.
  ...(timeLimitSeconds ? { timeLimitSeconds } : {}),
  calculatorMode: 'questionSpecific',
  targets: CERT_TARGETS.map((target) => ({
    targetId: target.targetId,
    alignmentKey: target.alignmentKey,
    label: target.label,
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    anchor: target.anchor,
    weight: 1,
    questionCount: target.questionCount,
    familyIds: familyIdsFor(target.targetId),
  })),
});

const sections = () => ([
  {
    id: 'review',
    role: 'review',
    title: 'Review',
    questions: [
      { questionId: `${PREFIX}review_1`, type: 'response', prompt: 'Review 1' },
      { questionId: `${PREFIX}review_2`, type: 'response', prompt: 'Review 2' },
    ],
  },
]);

const assignmentDoc = (id, overrides = {}) => ({
  id,
  schemaVersion: 5,
  title: `Lifecycle ${id}`,
  courseId: 'algebra1',
  assignedClassIds: [CLASS_ID],
  dueAt: '2099-01-01T00:00:00.000Z',
  lateDueAt: '2099-01-08T00:00:00.000Z',
  assignment: { title: `Lifecycle ${id}`, courseId: 'algebra1' },
  assessmentPolicy: certAssessmentPolicy(),
  testBlueprint: blueprint(),
  sections: sections(),
  ...overrides,
});

const ASSIGNMENTS = {
  untimed: `${PREFIX}untimed`,
  manifest: `${PREFIX}manifest`,
  archived: `${PREFIX}archived`,
  scheduled: `${PREFIX}scheduled`,
};
const MANIFEST_ID = `${PREFIX}manifest-doc`;

const STUDENTS = {
  sitter: 'ADVLC_SITTER',            // untimed: sits the whole Test
  skipper: 'ADVLC_SKIPPER',          // tries to finalize before Review
  early: 'ADVLC_EARLY',              // finalizes a never-started Test after Review
  failer: 'ADVLC_FAILER',            // manifest-backed: fails, corrects, retests
  archivedStudent: 'ADVLC_ARCHIVED',
  scheduledStudent: 'ADVLC_SCHEDULED',
  outsider: 'ADVLC_OUTSIDER',        // another class entirely
};
const ALL_STUDENTS = Object.values(STUDENTS);

const sit = (options) => sitSecureExam({
  ...options,
  answerFromPrompt: certAnswerFromPrompt,
  wrongAnswer: CERT_WRONG_ANSWER,
});

const cardFor = (studentId, assignmentId) => fns.getStudentTestCycle.run(
  studentRequest(studentId, { assignmentId }),
);

const completeReview = async (studentId, assignmentId) => {
  await db.collection('grades').doc(studentId).set({
    gradesByAssignment: {
      [assignmentId]: { 0: { status: 'correct' }, 1: { status: 'correct' } },
    },
  }, { merge: true });
};

const assign = (assignmentId, classId = CLASS_ID) => fns.assignTestCycleSessions.run(
  teacherRequest({ assignmentId, classId }),
);

const releaseFeedback = (examSessionId) => fns.proctorExamAction.run(
  teacherRequest({ examSessionId, action: 'releaseFeedback' }),
);

before(async () => {
  await Promise.all(families().map((family) => {
    const { id, ...fields } = family;
    return db.collection('pathQuestionBank').doc(id).set(fields);
  }));
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Lifecycle Period 1', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('classes').doc(OTHER_CLASS_ID).set({
    name: 'Lifecycle Period 2 (other teacher)', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 2', teacherOfRecord: OTHER_TEACHER_EMAIL, status: 'active',
  });
  for (const studentId of ALL_STUDENTS) {
    const outside = studentId === STUDENTS.outsider;
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId,
      classId: outside ? OTHER_CLASS_ID : CLASS_ID,
      classPeriod: outside ? 'Period 2' : 'Period 1',
      assignedTeacherEmail: outside ? OTHER_TEACHER_EMAIL : TEACHER_EMAIL,
      status: 'active',
      gradesByAssignment: {},
    });
  }

  await db.collection('assignments').doc(ASSIGNMENTS.untimed).set(assignmentDoc(ASSIGNMENTS.untimed));
  // The blueprint lives ONLY in the server-only manifest collection, which is
  // the more secure of the two supported shapes.
  await db.collection('secureTestManifests').doc(MANIFEST_ID).set({ testBlueprint: blueprint() });
  const manifestAssignment = assignmentDoc(ASSIGNMENTS.manifest, { secureTestReference: { manifestId: MANIFEST_ID } });
  delete manifestAssignment.testBlueprint;
  await db.collection('assignments').doc(ASSIGNMENTS.manifest).set(manifestAssignment);
  await db.collection('assignments').doc(ASSIGNMENTS.archived).set(assignmentDoc(ASSIGNMENTS.archived));
  await db.collection('assignments').doc(ASSIGNMENTS.scheduled).set(assignmentDoc(ASSIGNMENTS.scheduled));
});

after(async () => {
  const assignmentIds = Object.values(ASSIGNMENTS);
  const sessions = await db.collection('examSessions').where('courseTest.assignmentId', 'in', assignmentIds).get();
  await Promise.allSettled([
    ...families().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    ...assignmentIds.map((id) => db.collection('assignments').doc(id).delete()),
    db.collection('secureTestManifests').doc(MANIFEST_ID).delete(),
    db.collection('classes').doc(CLASS_ID).delete(),
    db.collection('classes').doc(OTHER_CLASS_ID).delete(),
    ...ALL_STUDENTS.map((studentId) => db.collection('grades').doc(studentId).delete()),
    ...assignmentIds.flatMap((assignmentId) => ALL_STUDENTS.flatMap((studentId) => [
      db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).delete(),
      db.collection('testCycleCorrectionPlans').doc(`${assignmentId}__${studentId}`).delete(),
      db.collection('testCycleRetestPlans').doc(`${assignmentId}__${studentId}`).delete(),
    ])),
    ...sessions.docs.map((doc) => doc.ref.delete()),
  ]);
});

/* ======================================================================== */
/* 1. An untimed Test is untimed — it does not expire the moment it starts.  */
/* ======================================================================== */

test('an untimed course Test can actually be sat: no deadline, no expiry, no phantom timer', async () => {
  await assign(ASSIGNMENTS.untimed);
  await completeReview(STUDENTS.sitter, ASSIGNMENTS.untimed);
  const record = await readRecord(ASSIGNMENTS.untimed, STUDENTS.sitter);
  const examSessionId = record.test.examSessionId;
  assert.ok(examSessionId);

  const started = await fns.startSecureExamSession.run(studentRequest(STUDENTS.sitter, { examSessionId }));
  assert.equal(started.session.status, 'in_progress');
  assert.equal(started.session.expiresAt, null, 'an untimed test has no deadline to show');

  // The defect: `Number(null) === 0` made every untimed session expire at
  // startedAt, so this first issue threw deadline-exceeded.
  const issued = await fns.issueSecureExamQuestion.run(studentRequest(STUDENTS.sitter, { examSessionId }));
  assert.ok(issued.questionInstance?.questionInstanceId);

  // A client-claimed "time expired" cannot end an untimed test either.
  const forged = await refusal(fns.finalizeSecureExam.run(
    studentRequest(STUDENTS.sitter, { examSessionId, reason: 'timeExpired' }),
  ));
  assert.ok(forged, 'an untimed test has no deadline to have reached');
  assert.equal((await readSession(examSessionId)).status, 'in_progress');
});

/* ======================================================================== */
/* 2. Review cannot be skipped by finalizing the Test from the outside.      */
/* ======================================================================== */

test('a student cannot skip Review by finalizing their unstarted Test directly', async () => {
  const record = await readRecord(ASSIGNMENTS.untimed, STUDENTS.skipper);
  const examSessionId = record.test.examSessionId;
  assert.ok(examSessionId, 'the teacher opened a session for the whole class');

  // Review is NOT complete. Starting is refused, which the certification
  // already proves (B6). Finalizing was not.
  const start = await refusal(fns.startSecureExamSession.run(studentRequest(STUDENTS.skipper, { examSessionId })));
  assert.ok(start, 'Review gate holds at start');

  const finalize = await refusal(fns.finalizeSecureExam.run(studentRequest(STUDENTS.skipper, { examSessionId })));
  assert.ok(finalize, 'finalizing a Test the student was never allowed into must be refused');

  const session = await readSession(examSessionId);
  assert.equal(session.status, 'not_started');
  const after = await readRecord(ASSIGNMENTS.untimed, STUDENTS.skipper);
  assert.notEqual(after.review.complete, true, 'Review completion must not be stamped by a refused finalize');
  assert.equal(after.test.state, 'assigned');

  const card = await cardFor(STUDENTS.skipper, ASSIGNMENTS.untimed);
  assert.equal(card.stage, 'review');
});

test('a never-started Test cannot be "submitted" empty, even after Review', async () => {
  await completeReview(STUDENTS.early, ASSIGNMENTS.untimed);
  const record = await readRecord(ASSIGNMENTS.untimed, STUDENTS.early);
  const examSessionId = record.test.examSessionId;
  const finalize = await refusal(fns.finalizeSecureExam.run(studentRequest(STUDENTS.early, { examSessionId })));
  assert.ok(finalize, 'an exam that was never started has nothing to submit');
  assert.equal((await readSession(examSessionId)).status, 'not_started');
});

test('a proctor "unlock" cannot start a Test that was never started (it would skip the Review gate)', async () => {
  const record = await readRecord(ASSIGNMENTS.untimed, STUDENTS.skipper);
  const examSessionId = record.test.examSessionId;
  const unlock = await refusal(fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'unlock' })));
  assert.ok(unlock, 'unlock is for a locked session, not a start button');
  assert.equal((await readSession(examSessionId)).status, 'not_started');
  const issue = await refusal(fns.issueSecureExamQuestion.run(studentRequest(STUDENTS.skipper, { examSessionId })));
  assert.ok(issue);
});

/* ======================================================================== */
/* 3. A blueprint held in the secure manifest still builds Corrections.      */
/* ======================================================================== */

test('a manifest-backed Test Cycle builds real Corrections on release, and they lead to a Retest', async () => {
  await assign(ASSIGNMENTS.manifest);
  await completeReview(STUDENTS.failer, ASSIGNMENTS.manifest);
  const record = await readRecord(ASSIGNMENTS.manifest, STUDENTS.failer);
  const examSessionId = record.test.examSessionId;
  await sit({ studentId: STUDENTS.failer, examSessionId, correctCount: 10, total: CERT_TOTAL_QUESTIONS });
  await releaseFeedback(examSessionId);

  const released = await readRecord(ASSIGNMENTS.manifest, STUDENTS.failer);
  assert.equal(released.test.rawScore, 40);
  assert.equal(released.corrections.required, true);
  assert.ok(released.corrections.total > 0, 'corrections must have targets: the blueprint is in the manifest, not missing');

  const card = await cardFor(STUDENTS.failer, ASSIGNMENTS.manifest);
  assert.equal(card.stage, 'corrections');
  assert.ok(card.corrections?.targets?.length > 0, 'the student has something to correct');
});

test('releasing the same Test twice does not wipe a student\'s Corrections progress', async () => {
  const card = await cardFor(STUDENTS.failer, ASSIGNMENTS.manifest);
  const target = card.corrections.targets[0];
  const issued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(STUDENTS.failer, {
    assignmentId: ASSIGNMENTS.manifest, correctionId: target.correctionId,
  }));
  await fns.submitTestCycleCorrectionResponse.run(studentRequest(STUDENTS.failer, {
    assignmentId: ASSIGNMENTS.manifest, correctionId: target.correctionId,
    questionInstanceId: issued.questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: certAnswerFromPrompt(issued.questionInstance.prompt) } },
  }));
  const before = (await db.collection('testCycleCorrectionPlans').doc(`${ASSIGNMENTS.manifest}__${STUDENTS.failer}`).get()).data();
  const progressBefore = before.plan.targets.find((entry) => entry.correctionId === target.correctionId).correctResponses;
  assert.equal(progressBefore, 1);

  // A second Release click (double click, two tabs, the bulk release) must be a no-op.
  const record = await readRecord(ASSIGNMENTS.manifest, STUDENTS.failer);
  await releaseFeedback(record.test.examSessionId);

  const afterPlan = (await db.collection('testCycleCorrectionPlans').doc(`${ASSIGNMENTS.manifest}__${STUDENTS.failer}`).get()).data();
  assert.equal(
    afterPlan.plan.targets.find((entry) => entry.correctionId === target.correctionId).correctResponses,
    1,
    're-release must not rebuild the plan from scratch',
  );
});

test('completing manifest-backed Corrections opens the Retest; closing it mid-session stops further questions', async () => {
  const plan = (await db.collection('testCycleCorrectionPlans').doc(`${ASSIGNMENTS.manifest}__${STUDENTS.failer}`).get()).data().plan;
  for (const target of plan.targets) {
    const remaining = Number(target.requiredCorrectResponses) - Number(target.correctResponses || 0);
    for (let index = 0; index < remaining; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      const issued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(STUDENTS.failer, {
        assignmentId: ASSIGNMENTS.manifest, correctionId: target.correctionId,
      }));
      // eslint-disable-next-line no-await-in-loop
      await fns.submitTestCycleCorrectionResponse.run(studentRequest(STUDENTS.failer, {
        assignmentId: ASSIGNMENTS.manifest, correctionId: target.correctionId,
        questionInstanceId: issued.questionInstance.questionInstanceId,
        responsePayload: { responses: { answer: certAnswerFromPrompt(issued.questionInstance.prompt) } },
      }));
    }
  }
  const record = await readRecord(ASSIGNMENTS.manifest, STUDENTS.failer);
  assert.equal(record.corrections.complete, true);
  const retestSessionId = record.retest.examSessionId;
  assert.ok(retestSessionId, 'the retest opened');

  await fns.startSecureExamSession.run(studentRequest(STUDENTS.failer, { examSessionId: retestSessionId }));
  const first = await fns.issueSecureExamQuestion.run(studentRequest(STUDENTS.failer, { examSessionId: retestSessionId }));
  await fns.submitSecureExamResponse.run(studentRequest(STUDENTS.failer, {
    examSessionId: retestSessionId,
    questionInstanceId: first.questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: certAnswerFromPrompt(first.questionInstance.prompt) } },
    submissionId: `${PREFIX}retest-1`,
  }));

  // The teacher closes retesting while the student's tab is still open.
  await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: ASSIGNMENTS.manifest, studentId: STUDENTS.failer, action: 'disableRetest',
  }));
  const next = await refusal(fns.issueSecureExamQuestion.run(studentRequest(STUDENTS.failer, { examSessionId: retestSessionId })));
  assert.ok(next, 'a closed retest issues no further secure questions');
  const card = await cardFor(STUDENTS.failer, ASSIGNMENTS.manifest);
  assert.equal(card.stage, 'retestClosed');
});

/* ======================================================================== */
/* 4. Assignment state is enforced on the server, not only hidden in the UI. */
/* ======================================================================== */

test('an archived Test Cycle cannot be entered, even with a session already open', async () => {
  await assign(ASSIGNMENTS.archived);
  await completeReview(STUDENTS.archivedStudent, ASSIGNMENTS.archived);
  const record = await readRecord(ASSIGNMENTS.archived, STUDENTS.archivedStudent);
  await db.collection('assignments').doc(ASSIGNMENTS.archived).set({ archived: true }, { merge: true });

  const start = await refusal(fns.startSecureExamSession.run(
    studentRequest(STUDENTS.archivedStudent, { examSessionId: record.test.examSessionId }),
  ));
  assert.ok(start, 'archived means closed to students');
  const card = await cardFor(STUDENTS.archivedStudent, ASSIGNMENTS.archived);
  assert.equal(card.canEnter, false);
  assert.match(card.detail, /archived|no longer available|closed/i);
});

test('a scheduled Test Cycle cannot be entered before it opens, and the card says when it opens', async () => {
  await assign(ASSIGNMENTS.scheduled);
  await completeReview(STUDENTS.scheduledStudent, ASSIGNMENTS.scheduled);
  const record = await readRecord(ASSIGNMENTS.scheduled, STUDENTS.scheduledStudent);
  const releaseAt = '2098-06-01T13:00:00.000Z';
  await db.collection('assignments').doc(ASSIGNMENTS.scheduled).set({ releaseAt }, { merge: true });

  const start = await refusal(fns.startSecureExamSession.run(
    studentRequest(STUDENTS.scheduledStudent, { examSessionId: record.test.examSessionId }),
  ));
  assert.ok(start, 'a scheduled assessment is not open yet');
  const card = await cardFor(STUDENTS.scheduledStudent, ASSIGNMENTS.scheduled);
  assert.equal(card.canEnter, false);
  assert.ok(card.availability?.opensAt, 'the card names when it opens');
});

/* ======================================================================== */
/* 5. Authorization boundaries.                                              */
/* ======================================================================== */

test('a teacher action cannot create a record for a student outside the assignment\'s audience', async () => {
  const outcome = await refusal(fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: ASSIGNMENTS.untimed, studentId: STUDENTS.outsider, action: 'unlockRetest',
  })));
  assert.ok(outcome, 'the outsider is not on this assignment');
  const record = await db.collection('testCycleRecords').doc(`${ASSIGNMENTS.untimed}__${STUDENTS.outsider}`).get();
  assert.equal(record.exists, false);
});

test('a student cannot replay another student\'s submission id to read their session', async () => {
  const record = await readRecord(ASSIGNMENTS.untimed, STUDENTS.sitter);
  const examSessionId = record.test.examSessionId;
  const issued = await fns.issueSecureExamQuestion.run(studentRequest(STUDENTS.sitter, { examSessionId }));
  const submissionId = `${PREFIX}sitter-replay`;
  await fns.submitSecureExamResponse.run(studentRequest(STUDENTS.sitter, {
    examSessionId,
    questionInstanceId: issued.questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: certAnswerFromPrompt(issued.questionInstance.prompt) } },
    submissionId,
  }));
  const replay = await refusal(fns.submitSecureExamResponse.run(studentRequest(STUDENTS.skipper, {
    examSessionId,
    questionInstanceId: issued.questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '1' } },
    submissionId,
  })));
  assert.ok(replay, 'the idempotency marker belongs to its own student');
});

test('students cannot call the teacher Test Cycle callables', async () => {
  const examSessionId = (await readRecord(ASSIGNMENTS.untimed, STUDENTS.sitter)).test.examSessionId;
  const asStudent = (data) => studentRequest(STUDENTS.sitter, data);
  // Thunks, so each refusal is awaited as it happens rather than left to
  // reject unobserved while an earlier one is checked.
  const attempts = [
    ['teacherTestCycleAction', () => fns.teacherTestCycleAction.run(asStudent({ assignmentId: ASSIGNMENTS.untimed, studentId: STUDENTS.sitter, action: 'unlockRetest' }))],
    ['listTeacherTestCycleRecords', () => fns.listTeacherTestCycleRecords.run(asStudent({ assignmentId: ASSIGNMENTS.untimed }))],
    ['assignTestCycleSessions', () => fns.assignTestCycleSessions.run(asStudent({ assignmentId: ASSIGNMENTS.untimed }))],
    ['proctorExamAction', () => fns.proctorExamAction.run(asStudent({ examSessionId, action: 'releaseFeedback' }))],
    ['preflightTestCycleAssignment', () => fns.preflightTestCycleAssignment.run(asStudent({ assignmentId: ASSIGNMENTS.untimed }))],
  ];
  for (const [name, attempt] of attempts) {
    // eslint-disable-next-line no-await-in-loop
    assert.ok(await refusal(attempt()), `${name} must refuse a student`);
  }
});

test('another teacher cannot read this class\'s preflight or results', async () => {
  const preflight = await refusal(fns.preflightTestCycleAssignment.run(
    teacherRequest({ assignmentId: ASSIGNMENTS.untimed }, OTHER_TEACHER_EMAIL),
  ));
  assert.ok(preflight, 'preflight exposes the blueprint\'s families; it is the teacher of record\'s');
  const list = await refusal(fns.listTeacherTestCycleRecords.run(
    teacherRequest({ assignmentId: ASSIGNMENTS.untimed }, OTHER_TEACHER_EMAIL),
  ));
  assert.ok(list);
});

/* ======================================================================== */
/* 6. A locked session is still a session in progress.                      */
/* ======================================================================== */

test('a session locked for proctor review reads as in progress, never as "Start Test"', async () => {
  const record = await readRecord(ASSIGNMENTS.untimed, STUDENTS.sitter);
  const examSessionId = record.test.examSessionId;
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'lock' }));
  const locked = await readRecord(ASSIGNMENTS.untimed, STUDENTS.sitter);
  assert.equal(locked.test.state, 'inProgress');
  const card = await cardFor(STUDENTS.sitter, ASSIGNMENTS.untimed);
  assert.notEqual(card.actionLabel, 'Start Test');
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'unlock' }));
  assert.equal((await readSession(examSessionId)).status, 'in_progress');
});

/* ======================================================================== */
/* 7. Teacher lifecycle callables: release, policy, preview, archive/delete. */
/* ======================================================================== */

const RELEASE_ASSIGNMENT = ASSIGNMENTS.untimed;

test('class-wide release records every submitted Test once, and a second release changes nothing', async () => {
  // The sitter has been mid-Test since scenario 1; finish it honestly.
  const record = await readRecord(RELEASE_ASSIGNMENT, STUDENTS.sitter);
  const examSessionId = record.test.examSessionId;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await refusal(fns.issueSecureExamQuestion.run(studentRequest(STUDENTS.sitter, { examSessionId })));
    if (outcome) break;
    // eslint-disable-next-line no-await-in-loop
    const issued = await fns.issueSecureExamQuestion.run(studentRequest(STUDENTS.sitter, { examSessionId }));
    // eslint-disable-next-line no-await-in-loop
    const result = await fns.submitSecureExamResponse.run(studentRequest(STUDENTS.sitter, {
      examSessionId,
      questionInstanceId: issued.questionInstance.questionInstanceId,
      responsePayload: { responses: { answer: certAnswerFromPrompt(issued.questionInstance.prompt) } },
      submissionId: `${PREFIX}sitter-${issued.questionInstance.questionInstanceId}`,
    }));
    if (result.needsNextQuestion === false) break;
  }
  assert.equal((await readRecord(RELEASE_ASSIGNMENT, STUDENTS.sitter)).test.state, 'submitted');

  const student = await refusal(fns.releaseTestCycleResults.run(studentRequest(STUDENTS.sitter, { assignmentId: RELEASE_ASSIGNMENT })));
  assert.ok(student, 'a student cannot release results');
  const other = await refusal(fns.releaseTestCycleResults.run(teacherRequest({ assignmentId: RELEASE_ASSIGNMENT }, OTHER_TEACHER_EMAIL)));
  assert.ok(other, 'another teacher cannot release this class\'s results');

  const first = await fns.releaseTestCycleResults.run(teacherRequest({ assignmentId: RELEASE_ASSIGNMENT, stage: 'test' }));
  assert.ok(first.releasedStudentIds.includes(STUDENTS.sitter));
  const released = await readRecord(RELEASE_ASSIGNMENT, STUDENTS.sitter);
  assert.equal(released.test.state, 'released');
  assert.equal(released.recordedGrade, 100);
  const historyLength = released.history.length;

  const second = await fns.releaseTestCycleResults.run(teacherRequest({ assignmentId: RELEASE_ASSIGNMENT, stage: 'test' }));
  assert.equal(second.released, 0, 'nothing submitted is left to release');
  assert.equal((await readRecord(RELEASE_ASSIGNMENT, STUDENTS.sitter)).history.length, historyLength);
});

test('the teacher results list names every audience student, including those who have not started', async () => {
  const list = await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: RELEASE_ASSIGNMENT }));
  const ids = list.rows.map((row) => row.studentId);
  assert.ok(ids.includes(STUDENTS.sitter));
  assert.ok(!ids.includes(STUDENTS.outsider), 'a student outside the audience is not on this list');
  const sitter = list.rows.find((row) => row.studentId === STUDENTS.sitter);
  assert.equal(sitter.bucket, 'passed');
  assert.equal(sitter.review.complete, true);
  assert.equal(list.policy.maxRecordedGrade, 70);
  assert.match(list.policy.summary, /never lowers/);
  assert.equal(list.delivery.timed, false, 'an untimed Test is reported as untimed');
});

test('the retest policy changes only through the callable, and locks once results it would contradict are released', async () => {
  const student = await refusal(fns.updateTestCyclePolicy.run(studentRequest(STUDENTS.sitter, {
    assignmentId: ASSIGNMENTS.scheduled, policy: { maxRecordedGrade: 100 },
  })));
  assert.ok(student, 'a student cannot change a grade cap');
  const other = await refusal(fns.updateTestCyclePolicy.run(teacherRequest({
    assignmentId: ASSIGNMENTS.scheduled, policy: { maxRecordedGrade: 100 },
  }, OTHER_TEACHER_EMAIL)));
  assert.ok(other, 'another teacher cannot change this class\'s grade cap');
  const invalid = await refusal(fns.updateTestCyclePolicy.run(teacherRequest({
    assignmentId: ASSIGNMENTS.scheduled, policy: { maxRecordedGrade: 140 },
  })));
  assert.ok(invalid, 'a cap above 100 is refused');

  // Nothing has been released on the scheduled cycle: both edits are allowed.
  const changed = await fns.updateTestCyclePolicy.run(teacherRequest({
    assignmentId: ASSIGNMENTS.scheduled,
    policy: { maxRecordedGrade: 75, gradeReplacement: 'averageIfHigherCapped' },
  }));
  assert.equal(changed.changed, true);
  const stored = (await db.collection('assignments').doc(ASSIGNMENTS.scheduled).get()).data();
  assert.equal(stored.assessmentPolicy.retest.maxRecordedGrade, 75);
  assert.equal(stored.assessmentPolicy.retest.gradeReplacement, 'averageIfHigherCapped');
  // Untouched authored fields survive.
  assert.equal(stored.assessmentPolicy.retest.questionCount, CERT_TOTAL_QUESTIONS);
  assert.equal(stored.assessmentPolicyHistory.length, 1);

  // On the untimed cycle a Test result IS released: the passing score is locked.
  const locked = await refusal(fns.updateTestCyclePolicy.run(teacherRequest({
    assignmentId: RELEASE_ASSIGNMENT, policy: { passingScore: 60 },
  })));
  assert.ok(locked);
  assert.match(locked.message, /released/i);
});

test('a teacher previews real secure items without creating any session, record or grade', async () => {
  const before = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENTS.scheduled).get();
  const preview = await fns.previewTestCycleSecureItems.run(teacherRequest({ assignmentId: ASSIGNMENTS.scheduled }));
  assert.equal(preview.writes, 'none');
  assert.equal(preview.items.length, CERT_TOTAL_QUESTIONS);
  for (const item of preview.items) {
    const keys = Object.keys(item.questionInstance || {});
    for (const secret of ['privateGrading', 'generatorParameters', 'expected', 'answerKey', 'seedKey']) {
      assert.ok(!keys.includes(secret), `a preview item must not carry ${secret}`);
    }
  }
  const after = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENTS.scheduled).get();
  assert.equal(after.size, before.size, 'preview creates no secure session');

  const item = preview.items[0];
  const right = await fns.gradeTestCyclePreviewItem.run(teacherRequest({
    previewItemId: item.previewItemId,
    responsePayload: { responses: { answer: certAnswerFromPrompt(item.questionInstance.prompt) } },
  }));
  assert.equal(right.isCorrect, true, 'the preview is graded by the real secure grader');

  const studentPreview = await refusal(fns.previewTestCycleSecureItems.run(studentRequest(STUDENTS.sitter, { assignmentId: ASSIGNMENTS.scheduled })));
  assert.ok(studentPreview, 'a student cannot preview secure items');
  const otherPreview = await refusal(fns.gradeTestCyclePreviewItem.run(teacherRequest({
    previewItemId: item.previewItemId, responsePayload: { responses: { answer: '1' } },
  }, OTHER_TEACHER_EMAIL)));
  assert.ok(otherPreview, 'another teacher cannot use this teacher\'s preview as an oracle');
});

test('delete is refused once students have work, and Archive is offered; an untouched assignment can be deleted', async () => {
  const evidence = await fns.getAssignmentEvidenceSummary.run(teacherRequest({ assignmentId: RELEASE_ASSIGNMENT }));
  assert.ok(evidence.studentsWithWork > 0);
  assert.equal(evidence.canDelete, false);
  const refused = await refusal(fns.manageAssignmentLifecycle.run(teacherRequest({
    assignmentId: RELEASE_ASSIGNMENT, action: 'delete', confirmTitle: `Lifecycle ${RELEASE_ASSIGNMENT}`,
  })));
  assert.ok(refused);
  assert.match(refused.message, /Archive it instead/);
  assert.equal((await db.collection('assignments').doc(RELEASE_ASSIGNMENT).get()).exists, true);

  // Archive works with evidence present, and is reversible.
  await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: RELEASE_ASSIGNMENT, action: 'archive' }));
  assert.equal((await db.collection('assignments').doc(RELEASE_ASSIGNMENT).get()).data().archived, true);
  await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: RELEASE_ASSIGNMENT, action: 'unarchive' }));
  assert.equal((await db.collection('assignments').doc(RELEASE_ASSIGNMENT).get()).data().archived, false);

  // A brand-new, untouched assignment can be deleted — but only with its title.
  const freshId = `${PREFIX}fresh`;
  await db.collection('assignments').doc(freshId).set(assignmentDoc(freshId));
  await assign(freshId);
  const wrongTitle = await refusal(fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: freshId, action: 'delete', confirmTitle: 'nope' })));
  assert.ok(wrongTitle);
  const studentDelete = await refusal(fns.manageAssignmentLifecycle.run(studentRequest(STUDENTS.sitter, { assignmentId: freshId, action: 'delete', confirmTitle: `Lifecycle ${freshId}` })));
  assert.ok(studentDelete);
  const deleted = await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: freshId, action: 'delete', confirmTitle: `Lifecycle ${freshId}` }));
  assert.equal(deleted.deleted, true);
  assert.equal((await db.collection('assignments').doc(freshId).get()).exists, false);
  const orphanSessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', freshId).get();
  assert.equal(orphanSessions.size, 0, 'untouched secure sessions go with it, not orphaned');
  const orphanRecord = await db.collection('testCycleRecords').doc(`${freshId}__${STUDENTS.sitter}`).get();
  assert.equal(orphanRecord.exists, false, 'its untouched records go with it');
  const projection = (await db.collection('grades').doc(STUDENTS.sitter).get()).data()?.testCycleGrades?.[freshId];
  assert.equal(projection, undefined, 'no grade document keeps a projection for a deleted assignment');
  await db.collection('assignmentDeletionLog').doc(freshId).delete();
});

test('pausing a Test Cycle closes it to students on the server and says so on the card', async () => {
  await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: ASSIGNMENTS.manifest, action: 'unpublish' }));
  const card = await cardFor(STUDENTS.failer, ASSIGNMENTS.manifest);
  assert.equal(card.canEnter, false);
  assert.equal(card.availability.reason, 'unpublished');
  const correction = await refusal(fns.issueTestCycleCorrectionQuestion.run(studentRequest(STUDENTS.failer, {
    assignmentId: ASSIGNMENTS.manifest, correctionId: 'anything',
  })));
  assert.ok(correction, 'a paused assessment issues nothing');
  await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: ASSIGNMENTS.manifest, action: 'publish' }));
  assert.equal((await cardFor(STUDENTS.failer, ASSIGNMENTS.manifest)).availability.reason, 'open');
});
