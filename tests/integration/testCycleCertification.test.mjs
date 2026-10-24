/*
 * TEST CYCLE END-TO-END CERTIFICATION — issue #224, scenarios 1–44.
 *
 * HOW TO RUN:  npm run test:test-cycle-certification
 *
 * WHAT MAKES THIS DIFFERENT FROM THE HEADLESS SUITE. tests/platform proves the
 * RULES: that max(original, min(retest, 70)) is 70, that a correction plan is
 * built from failed evidence, that the Classroom trigger reads the canonical
 * projection. Every one of those can be true while the feature is broken,
 * because none of them runs the wiring: a wrong field path, a transaction that
 * writes nothing, a gate checked after the state has already changed, an
 * adapter called with the wrong coursework id — all of that passes a source
 * contract and fails a classroom.
 *
 * So this sits the real secure exams, through the real Cloud Functions, against
 * a real Firestore, and reads back what actually landed.
 *
 * THE HARNESS NEVER READS AN ANSWER KEY. Students are driven from the sanitized
 * prompt the server hands the browser. That is deliberate: a harness that
 * needed `privateGrading` to answer a question would be proving the fixture
 * works, not the product.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  CERT_ASSIGNMENT_ID, CERT_CLASS_ID, CERT_OTHER_CLASS_ID, CERT_PREFIX,
  CERT_PASSING_CORRECT, CERT_PASSING_SCORE,
  CERT_RECORDED_AFTER_RETEST, CERT_RETEST_CAPPED, CERT_RETEST_CORRECT, CERT_RETEST_RAW_SCORE,
  CERT_TARGETS, CERT_TEST_CORRECT, CERT_TEST_SCORE, CERT_TOTAL_QUESTIONS, CERT_WRONG_ANSWER,
  certAnswerFromPrompt, certAssignment, certFamilies,
} from '../fixtures/testCycleCertificationFixture.mjs';
import {
  createCourseWorkCalls, db, fns, patchGradeCalls, readCorrectionPlan, readGradeDoc,
  readRecord, readRetestPlan, readSession, refusal, repo, resetClassroomCalls, runClassroomSync,
  sitSecureExam, studentRequest, teacherRequest,
  OTHER_TEACHER_EMAIL, TEACHER_EMAIL, admin,
} from './testCycleCertificationHarness.mjs';

const require = createRequire(import.meta.url);
const { publicationDocumentId, rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));

const STUDENT_A = 'CERT_STUDENT_A';
const STUDENT_B = 'CERT_STUDENT_B';
const STUDENT_C = 'CERT_STUDENT_C';
const STUDENT_OUTSIDE = 'CERT_STUDENT_OUTSIDE';
const ALL_STUDENTS = [STUDENT_A, STUDENT_B, STUDENT_C, STUDENT_OUTSIDE];

const COURSE_ID = 'cert-classroom-course';
const PUBLICATION_ID = publicationDocumentId(CERT_ASSIGNMENT_ID, COURSE_ID, 'whole');
const COURSEWORK_ID = 'cert-coursework-unit3';

const sit = (options) => sitSecureExam({
  ...options,
  answerFromPrompt: certAnswerFromPrompt,
  wrongAnswer: CERT_WRONG_ANSWER,
});

/*
 * THE BELL SCHEDULE IS SHARED. node --test runs the integration files in
 * parallel against one emulator, and dolExtraTimeServer and
 * testCycleSecureWorkflow write settings/classSchedule at the same time. A
 * test writes only its own period's days into it and takes only those out
 * again: overwriting or deleting the document took another file's meeting
 * out from under it (L failed in the full suite and passed alone).
 */
const scheduleRef = () => db.collection('settings').doc('classSchedule');
const putOwnSchedule = (modifiedSchedules) => scheduleRef().set({ modifiedSchedules }, { merge: true });
const removeOwnSchedule = async (period) => {
  const days = (await scheduleRef().get()).data()?.modifiedSchedules || {};
  const own = Object.keys(days).filter((dateKey) => days[dateKey]?.periods?.[period]);
  if (!own.length) return;
  const { FieldPath, FieldValue } = admin.firestore;
  await scheduleRef().update(...own.flatMap((dateKey) => [new FieldPath('modifiedSchedules', dateKey, 'periods', period), FieldValue.delete()]));
};

/** The record's stage, as the student card would resolve it. */
const cardFor = (studentId) => fns.getStudentTestCycle.run(
  studentRequest(studentId, { assignmentId: CERT_ASSIGNMENT_ID }),
);

const releaseFeedback = (examSessionId, email = TEACHER_EMAIL) => fns.proctorExamAction.run(
  teacherRequest({ examSessionId, action: 'releaseFeedback' }, email),
);

/** Mark the two Review questions terminal, the way the ordinary runtime would. */
const completeReview = async (studentId) => {
  await db.collection('grades').doc(studentId).set({
    gradesByAssignment: {
      [CERT_ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } },
    },
  }, { merge: true });
};

const state = {};

before(async () => {
  // Emulator-only fixture. Every id is prefixed so a stray document is
  // identifiable, and teardown removes all of it.
  await Promise.all(certFamilies().map((family) => {
    const { id, ...fields } = family;
    return db.collection('pathQuestionBank').doc(id).set(fields);
  }));

  await db.collection('classes').doc(CERT_CLASS_ID).set({
    name: 'Certification Algebra I — Period 1', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('classes').doc(CERT_OTHER_CLASS_ID).set({
    name: 'Certification Algebra I — Period 2', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 2', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });

  for (const studentId of [STUDENT_A, STUDENT_B, STUDENT_C]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId, classId: CERT_CLASS_ID, classPeriod: 'Period 1',
      assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
    });
  }
  await db.collection('grades').doc(STUDENT_OUTSIDE).set({
    displayName: STUDENT_OUTSIDE, classId: CERT_OTHER_CLASS_ID, classPeriod: 'Period 2',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  });

  await db.collection('assignments').doc(CERT_ASSIGNMENT_ID).set(certAssignment());

  // ONE whole-assignment Classroom publication. The certification proves the
  // retest updates this exact coursework item and never creates a second.
  await db.collection('classroomLinks').doc(PUBLICATION_ID).set({
    schemaVersion: 2, publicationId: PUBLICATION_ID, assignmentId: CERT_ASSIGNMENT_ID,
    courseId: COURSE_ID, courseName: 'Certification Course', courseworkId: COURSEWORK_ID,
    teacherUid: `uid-${TEACHER_EMAIL}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
  for (const studentId of [STUDENT_A, STUDENT_B, STUDENT_C]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE_ID, studentId)).set({
      courseId: COURSE_ID, studentId, googleUserId: `google-${studentId}`,
    });
  }
});

after(async () => {
  const deletions = [
    ...certFamilies().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    db.collection('assignments').doc(CERT_ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CERT_CLASS_ID).delete(),
    db.collection('classes').doc(CERT_OTHER_CLASS_ID).delete(),
    db.collection('classroomLinks').doc(PUBLICATION_ID).delete(),
    ...ALL_STUDENTS.map((studentId) => db.collection('grades').doc(studentId).delete()),
    ...ALL_STUDENTS.map((studentId) => db.collection('testCycleRecords').doc(`${CERT_ASSIGNMENT_ID}__${studentId}`).delete()),
    ...ALL_STUDENTS.map((studentId) => db.collection('testCycleCorrectionPlans').doc(`${CERT_ASSIGNMENT_ID}__${studentId}`).delete()),
    ...ALL_STUDENTS.map((studentId) => db.collection('testCycleRetestPlans').doc(`${CERT_ASSIGNMENT_ID}__${studentId}`).delete()),
  ];
  await Promise.allSettled(deletions);
});

/* ======================================================================== */
/* A. Teacher assignment / session creation                                  */
/* ======================================================================== */

test('A4: a teacher cannot create sessions for the class that merely happens to be selected', async () => {
  // The teacher screen passes whichever class is active in the class bar. This
  // cycle is assigned to Period 1; assigning it while Period 2 is selected must
  // be refused, not quietly honoured.
  const denied = await refusal(fns.assignTestCycleSessions.run(
    teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, classId: CERT_OTHER_CLASS_ID }),
  ));
  assert.equal(denied?.code, 'invalid-argument');
  assert.match(denied.message, /not assigned this Test Cycle/i);
  assert.equal((await db.collection('testCycleRecords').doc(`${CERT_ASSIGNMENT_ID}__${STUDENT_OUTSIDE}`).get()).exists, false);
});

test('A1+A2: one teacher action opens a secure Test session for every eligible student', async () => {
  const result = await fns.assignTestCycleSessions.run(
    teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, classId: CERT_CLASS_ID }),
  );
  assert.equal(result.success, true);
  assert.equal(result.createdSessions, 3, 'three in-audience students, one action');
  assert.deepEqual(result.preflight.errors, []);

  for (const studentId of [STUDENT_A, STUDENT_B, STUDENT_C]) {
    // eslint-disable-next-line no-await-in-loop
    const record = await readRecord(CERT_ASSIGNMENT_ID, studentId);
    assert.ok(record?.test?.examSessionId, `${studentId} has a secure Test session`);
    assert.equal(record.test.state, 'assigned');
    assert.equal(record.test.totalQuestions, CERT_TOTAL_QUESTIONS);
    state[studentId] = { testSessionId: record.test.examSessionId };
  }
  // Each student's session is their own.
  const ids = new Set([STUDENT_A, STUDENT_B, STUDENT_C].map((id) => state[id].testSessionId));
  assert.equal(ids.size, 3);
});

test('A3: a student outside the audience gets no session and no access', async () => {
  assert.equal(
    (await db.collection('testCycleRecords').doc(`${CERT_ASSIGNMENT_ID}__${STUDENT_OUTSIDE}`).get()).exists,
    false,
  );
  const denied = await refusal(cardFor(STUDENT_OUTSIDE));
  assert.equal(denied?.code, 'permission-denied');
});

/* ======================================================================== */
/* B. Review gating                                                          */
/* ======================================================================== */

test('B5: the student sees ONE card, and it is Review', async () => {
  const card = await cardFor(STUDENT_A);
  assert.equal(card.stage, 'review');
  assert.equal(card.secure, false);
  assert.equal(card.hintsAllowed, true);
  assert.equal(card.examSessionId, null, 'no secure session is offered at the Review stage');
  assert.equal(card.corrections, null);
  assert.equal(card.grade.recordedGrade, null);
});

test('B6: the secure Test cannot be entered before Review is complete', async () => {
  // This is the gate that a Tests & Exams list with a Start button would
  // otherwise walk straight past, so it is proved at the SERVER.
  const denied = await refusal(fns.startSecureExamSession.run(
    studentRequest(STUDENT_A, { examSessionId: state[STUDENT_A].testSessionId }),
  ));
  assert.equal(denied?.code, 'failed-precondition');
  assert.match(denied.message, /review/i);

  const session = await readSession(state[STUDENT_A].testSessionId);
  assert.equal(session.status, 'not_started', 'the refusal happened before any state changed');
});

test('B7: completing Review turns the SAME card into the secure Test stage', async () => {
  await completeReview(STUDENT_A);
  const card = await cardFor(STUDENT_A);
  assert.equal(card.stage, 'test');
  assert.equal(card.secure, true);
  assert.equal(card.hintsAllowed, false);
  assert.equal(card.canEnter, true);
  assert.equal(card.examSessionId, state[STUDENT_A].testSessionId, 'same card, same assignment, next stage');
});

/* ======================================================================== */
/* C. Secure Test delivery                                                   */
/* ======================================================================== */

test('C13: integrity events lock the session and only a proctor can unlock it', async () => {
  const sessionId = state[STUDENT_A].testSessionId;
  await fns.startSecureExamSession.run(studentRequest(STUDENT_A, { examSessionId: sessionId }));

  for (const type of ['tab_switch', 'window_blur', 'fullscreen_exit']) {
    // eslint-disable-next-line no-await-in-loop
    await fns.recordSecureExamIntegrityEvent.run(studentRequest(STUDENT_A, {
      examSessionId: sessionId, eventId: `cert-integrity-${type}`, type,
    }));
  }
  let session = await readSession(sessionId);
  assert.equal(session.violationCount, 3);
  assert.equal(session.status, 'locked_integrity');

  // Locked means locked: the student cannot pull the next question.
  const blocked = await refusal(fns.issueSecureExamQuestion.run(studentRequest(STUDENT_A, { examSessionId: sessionId })));
  assert.equal(blocked?.code, 'failed-precondition');
  assert.match(blocked.message, /locked/i);

  await fns.proctorExamAction.run(teacherRequest({ examSessionId: sessionId, action: 'unlock' }));
  session = await readSession(sessionId);
  assert.equal(session.status, 'in_progress');
});

test('C8+C9+C10: the secure Test runs on the courseTest runtime and holds correctness', async () => {
  const sessionId = state[STUDENT_A].testSessionId;
  const session = await readSession(sessionId);
  assert.equal(session.examType, 'courseTest');
  assert.equal(session.courseTest.assignmentId, CERT_ASSIGNMENT_ID);
  assert.equal(session.courseTest.cycleStage, 'test');
  assert.equal(session.feedbackReleased, false);

  const issued = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT_A, { examSessionId: sessionId }));
  const instance = issued.questionInstance;
  // One attempt per item, and none of the instructional escapes exist on the
  // payload the student's browser receives.
  assert.equal(instance.attemptsAllowed, 1);
  for (const escape of ['supportHints', 'solutionReview', 'attemptFeedback', 'hint', 'replacementQuestion', 'practiceMode']) {
    assert.equal(escape in instance, false, `secure payload must not carry ${escape}`);
  }
  assert.equal(issued.session.feedbackReleased, false);
  state[STUDENT_A].firstInstance = instance;
});

test('C12: no answer key and no issuance seed reaches a student payload', async () => {
  const instance = state[STUDENT_A].firstInstance;
  const serialized = JSON.stringify(instance);
  for (const secret of ['expected', 'accepted', 'answerKey', 'correctAnswer', 'privateGrading', 'generatorParameters', 'solutionKey', 'seedKey']) {
    assert.equal(serialized.includes(`"${secret}"`), false, `student payload leaked ${secret}`);
  }
  const card = await cardFor(STUDENT_A);
  const cardSerialized = JSON.stringify(card);
  for (const secret of ['seedKey', 'privateGrading', 'issuancePlan', 'familyId', 'expected']) {
    assert.equal(cardSerialized.includes(`"${secret}"`), false, `student card leaked ${secret}`);
  }
});

test('C12 (teacher side): no issuance seed reaches a teacher payload either', async () => {
  const proctor = await fns.listProctorExamSessions.run(teacherRequest({ examType: 'courseTest' }));
  const serialized = JSON.stringify(proctor);
  for (const secret of ['issuancePlan', 'seedKey', 'privateGrading', 'responses', 'currentQuestion']) {
    assert.equal(serialized.includes(`"${secret}"`), false, `proctor payload leaked ${secret}`);
  }
  assert.ok(proctor.sessions.length >= 3, 'the teacher of record still sees their own sessions');
});

test('C11: two students receive distinct instances while blueprint equivalence holds', async () => {
  // Student B sits the whole Test and passes; the comparison against A's
  // instances is what proves individualization.
  await completeReview(STUDENT_B);
  const issuedB = await sit({
    studentId: STUDENT_B, examSessionId: state[STUDENT_B].testSessionId,
    correctCount: CERT_PASSING_CORRECT, total: CERT_TOTAL_QUESTIONS,
  });
  state[STUDENT_B].issued = issuedB;

  // Finish A's Test now so both have a full set of issued instances.
  const remaining = CERT_TOTAL_QUESTIONS - 1;
  const issuedA = [{
    ordinal: 1,
    questionInstanceId: state[STUDENT_A].firstInstance.questionInstanceId,
    prompt: state[STUDENT_A].firstInstance.prompt,
  }];
  // The first question was already issued above; answer it and sit the rest.
  await fns.submitSecureExamResponse.run(studentRequest(STUDENT_A, {
    examSessionId: state[STUDENT_A].testSessionId,
    questionInstanceId: state[STUDENT_A].firstInstance.questionInstanceId,
    responsePayload: { responses: { answer: certAnswerFromPrompt(state[STUDENT_A].firstInstance.prompt) } },
    submissionId: 'cert-sub-a-1',
  }));
  for (let index = 1; index < CERT_TOTAL_QUESTIONS; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const question = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT_A, { examSessionId: state[STUDENT_A].testSessionId }));
    const instance = question.questionInstance;
    issuedA.push({ ordinal: index + 1, questionInstanceId: instance.questionInstanceId, prompt: instance.prompt });
    const correct = certAnswerFromPrompt(instance.prompt);
    // 13 correct in total, including the first, gives exactly 52%.
    // eslint-disable-next-line no-await-in-loop
    await fns.submitSecureExamResponse.run(studentRequest(STUDENT_A, {
      examSessionId: state[STUDENT_A].testSessionId,
      questionInstanceId: instance.questionInstanceId,
      responsePayload: { responses: { answer: index < CERT_TEST_CORRECT ? correct : CERT_WRONG_ANSWER } },
      submissionId: `cert-sub-a-${index + 1}`,
    }));
  }
  state[STUDENT_A].issued = issuedA;
  assert.equal(issuedA.length, CERT_TOTAL_QUESTIONS);
  assert.equal(remaining, CERT_TOTAL_QUESTIONS - 1);

  // Distinct instances: no shared instance id, and the questions themselves differ.
  const idsA = new Set(issuedA.map((entry) => entry.questionInstanceId));
  const idsB = new Set(issuedB.map((entry) => entry.questionInstanceId));
  assert.equal([...idsA].filter((id) => idsB.has(id)).length, 0);
  const promptsShared = issuedA.filter((entry, index) => entry.prompt === issuedB[index].prompt).length;
  assert.ok(promptsShared < CERT_TOTAL_QUESTIONS, 'two students must not sit byte-identical secure tests');

  // Equivalence: the two plans assess the same things, in the same order, at
  // the same depth. Read from the stored plans, which is where the blueprint
  // lives after issuance.
  const planSignature = (session) => (session.issuancePlan.entries || []).map((entry) => [
    entry.alignmentKey, `dok${entry.dok}`, `band${entry.difficultyBand}`,
    entry.representation, `w${entry.weight}`, entry.anchor ? 'anchor' : 'targeted',
  ].join('|'));
  const sessionA = await readSession(state[STUDENT_A].testSessionId);
  const sessionB = await readSession(state[STUDENT_B].testSessionId);
  assert.deepEqual(planSignature(sessionA), planSignature(sessionB));
  assert.equal(planSignature(sessionA).length, CERT_TOTAL_QUESTIONS);
  // And the families genuinely differ somewhere.
  const famA = sessionA.issuancePlan.entries.map((entry) => entry.familyId);
  const famB = sessionB.issuancePlan.entries.map((entry) => entry.familyId);
  assert.notDeepEqual(famA, famB);
});

test('C4-adjacent: no live generation was required to deliver either Test', async () => {
  for (const studentId of [STUDENT_A, STUDENT_B]) {
    // eslint-disable-next-line no-await-in-loop
    const session = await readSession(state[studentId].testSessionId);
    assert.equal(session.issuancePlan.requiresLiveGeneration, false);
    assert.deepEqual(session.issuancePlan.unfilledSlots, []);
    assert.equal(session.issuancePlan.entries.length, CERT_TOTAL_QUESTIONS);
    for (const entry of session.issuancePlan.entries) {
      assert.ok(entry.familyId && entry.seedKey, 'every slot was decided before the student started');
      assert.ok(entry.questionInstanceId, 'and the issued instance was recorded against its slot');
    }
  }
});

/* ======================================================================== */
/* D. Failed-Test path                                                       */
/* ======================================================================== */

test('D15: before release the student cannot infer failure from the card', async () => {
  const card = await cardFor(STUDENT_A);
  assert.equal(card.stage, 'awaitingRelease');
  assert.equal(card.canEnter, false);
  assert.equal(card.grade.recordedGrade, null, 'no score before the teacher releases it');
  assert.equal(card.corrections, null);
  assert.doesNotMatch(card.detail, /retest/i);
  assert.doesNotMatch(card.detail, /correction/i);
  assert.doesNotMatch(card.detail, /fail/i);
});

test('D14+D16+D17: releasing the Test records exactly 52', async () => {
  resetClassroomCalls();
  state.gradeBeforeRelease = await readGradeDoc(STUDENT_A);
  await releaseFeedback(state[STUDENT_A].testSessionId);

  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_A);
  assert.equal(record.test.rawScore, CERT_TEST_SCORE);
  assert.equal(record.test.state, 'released');
  assert.equal(record.recordedGrade, CERT_TEST_SCORE);

  const projection = (await readGradeDoc(STUDENT_A)).testCycleGrades[CERT_ASSIGNMENT_ID];
  assert.equal(projection.originalTestGrade, CERT_TEST_SCORE);
  assert.equal(projection.recordedGrade, CERT_TEST_SCORE);
  assert.equal(projection.rawRetestGrade, null);
});

test('D18: a targeted Correction plan appears automatically from the real failed evidence', async () => {
  const plan = (await readCorrectionPlan(CERT_ASSIGNMENT_ID, STUDENT_A)).plan;
  assert.ok(plan.targets.length > 0);
  assert.equal(plan.releasedTestGrade, CERT_TEST_SCORE);

  const session = await readSession(state[STUDENT_A].testSessionId);
  const wrongInstanceIds = new Set(Object.values(session.responses)
    .filter((response) => response.grading.isCorrect !== true)
    .map((response) => response.questionInstanceId));
  assert.ok(wrongInstanceIds.size > 0);

  for (const target of plan.targets) {
    assert.ok(target.evidence.length > 0, `${target.correctionId} must cite real evidence`);
    for (const item of target.evidence) {
      assert.ok(
        wrongInstanceIds.has(item.questionInstanceId),
        'every cited instance must be one this student actually missed',
      );
    }
    // Practice happens on parallel families with the sat instances forbidden.
    assert.equal(target.replaysSecureItem, false);
    for (const instanceId of target.forbiddenInstanceIds) {
      assert.ok(typeof instanceId === 'string' && instanceId.length > 0);
    }
  }
  assert.equal(plan.secure, false);
  assert.equal(plan.gradeImpact, 'none');
  state.correctionTargets = plan.targets.map((target) => ({
    correctionId: target.correctionId, required: target.requiredCorrectResponses,
  }));
});

test('D19+D20+D21: corrections are instructional, and only correct evidence completes a target', async () => {
  const card = await cardFor(STUDENT_A);
  assert.equal(card.stage, 'corrections');
  assert.equal(card.secure, false);
  assert.equal(card.hintsAllowed, true);
  assert.ok(card.corrections.targets.length > 0);
  // A student doing corrections is told the standard, never the families.
  const serialized = JSON.stringify(card.corrections);
  for (const secret of ['practiceFamilyIds', 'forbiddenInstanceIds', 'privateGrading', 'evidence']) {
    assert.equal(serialized.includes(`"${secret}"`), false, `correction payload leaked ${secret}`);
  }

  const first = state.correctionTargets[0];
  const issued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(STUDENT_A, {
    assignmentId: CERT_ASSIGNMENT_ID, correctionId: first.correctionId,
  }));
  assert.equal(issued.secure, false);
  assert.equal(issued.hintsAllowed, true);
  assert.equal(issued.attemptsAllowed, 3, 'corrections are practice, not one-shot assessment');

  const recordedBefore = (await readRecord(CERT_ASSIGNMENT_ID, STUDENT_A)).recordedGrade;

  // A wrong answer costs nothing and completes nothing.
  const wrong = await fns.submitTestCycleCorrectionResponse.run(studentRequest(STUDENT_A, {
    assignmentId: CERT_ASSIGNMENT_ID, correctionId: first.correctionId,
    questionInstanceId: issued.questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: CERT_WRONG_ANSWER } },
  }));
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.correctionsComplete, false);
  const afterWrong = await readCorrectionPlan(CERT_ASSIGNMENT_ID, STUDENT_A);
  const wrongTarget = afterWrong.plan.targets.find((target) => target.correctionId === first.correctionId);
  assert.equal(wrongTarget.correctResponses, 0);
  assert.equal(wrongTarget.complete, false);
  assert.equal((await readRecord(CERT_ASSIGNMENT_ID, STUDENT_A)).recordedGrade, recordedBefore,
    'a correction attempt must never move the recorded grade');

  // Correct evidence advances it.
  const reissued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(STUDENT_A, {
    assignmentId: CERT_ASSIGNMENT_ID, correctionId: first.correctionId,
  }));
  const right = await fns.submitTestCycleCorrectionResponse.run(studentRequest(STUDENT_A, {
    assignmentId: CERT_ASSIGNMENT_ID, correctionId: first.correctionId,
    questionInstanceId: reissued.questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: certAnswerFromPrompt(reissued.questionInstance.prompt) } },
  }));
  assert.equal(right.isCorrect, true);
  const afterRight = await readCorrectionPlan(CERT_ASSIGNMENT_ID, STUDENT_A);
  const rightTarget = afterRight.plan.targets.find((target) => target.correctionId === first.correctionId);
  assert.equal(rightTarget.correctResponses, 1);
  assert.equal((await readRecord(CERT_ASSIGNMENT_ID, STUDENT_A)).recordedGrade, recordedBefore);
});

/* ======================================================================== */
/* F. Google Classroom — the original Test grade reaches the ONE item        */
/* ======================================================================== */

test('F29: releasing the Test posts 52 to the one existing coursework item', async () => {
  await runClassroomSync(STUDENT_A, state.gradeBeforeRelease);

  const patches = patchGradeCalls();
  assert.equal(patches.length, 1, 'exactly one grade patch for one release');
  assert.equal(patches[0].courseWorkId, COURSEWORK_ID);
  assert.equal(patches[0].courseId, COURSE_ID);
  assert.equal(patches[0].grade, CERT_TEST_SCORE);
  assert.equal(createCourseWorkCalls().length, 0, 'passback must never create a coursework item');

  // The audit row is what a teacher would read back.
  const audit = (await db.collection('classroomGradeSyncs')
    .where('studentId', '==', STUDENT_A).get()).docs.map((doc) => doc.data());
  assert.equal(audit.length, 1);
  assert.equal(audit[0].status, 'synced');
  assert.equal(audit[0].grade, CERT_TEST_SCORE);
  assert.equal(audit[0].stage, 'testcycle-test');
  state.gradeAfterTestRelease = await readGradeDoc(STUDENT_A);
});

/* ======================================================================== */
/* E. Retest path and the 70 cap                                             */
/* ======================================================================== */

test('E22: completing required Corrections automatically opens the secure Retest', async () => {
  const plan = (await readCorrectionPlan(CERT_ASSIGNMENT_ID, STUDENT_A)).plan;
  for (const target of plan.targets) {
    const remaining = Number(target.requiredCorrectResponses) - Number(target.correctResponses || 0);
    for (let index = 0; index < remaining; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      const issued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(STUDENT_A, {
        assignmentId: CERT_ASSIGNMENT_ID, correctionId: target.correctionId,
      }));
      // eslint-disable-next-line no-await-in-loop
      await fns.submitTestCycleCorrectionResponse.run(studentRequest(STUDENT_A, {
        assignmentId: CERT_ASSIGNMENT_ID, correctionId: target.correctionId,
        questionInstanceId: issued.questionInstance.questionInstanceId,
        responsePayload: { responses: { answer: certAnswerFromPrompt(issued.questionInstance.prompt) } },
      }));
    }
  }
  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_A);
  assert.equal(record.corrections.complete, true);
  assert.ok(record.retest.examSessionId, 'the retest opened without anyone asking');
  assert.equal(record.retest.state, 'assigned');
  // Corrections still changed nothing about the grade.
  assert.equal(record.recordedGrade, CERT_TEST_SCORE);
  state[STUDENT_A].retestSessionId = record.retest.examSessionId;

  const card = await cardFor(STUDENT_A);
  assert.equal(card.stage, 'retest');
  assert.equal(card.secure, true);
  assert.equal(card.canEnter, true);
});

test('E23+E24: the Retest is targeted, anchored, rigorous, and reuses nothing', async () => {
  const stored = await readRetestPlan(CERT_ASSIGNMENT_ID, STUDENT_A);
  const { audit, blueprint, plan } = stored;

  // Weak targeting plus anchor coverage, roughly 70/30.
  assert.ok(audit.targetedQuestionCount > 0, 'weak skills are re-asked');
  assert.ok(audit.anchorQuestionCount > 0, 'anchors from the rest of the blueprint are covered');
  assert.ok(Math.abs(audit.actualWeakShare - 0.7) <= 0.2, `weak share ${audit.actualWeakShare}`);
  assert.ok(Math.abs(audit.actualAnchorShare - 0.3) <= 0.2, `anchor share ${audit.actualAnchorShare}`);
  assert.equal(audit.questionCount, CERT_TOTAL_QUESTIONS);
  assert.ok(audit.questionCount <= audit.originalQuestionCount);

  // Rigor metadata is inherited from the original targets, never softened.
  const original = new Map(CERT_TARGETS.map((target) => [target.targetId, target]));
  for (const target of blueprint.targets) {
    const source = original.get(target.sourceTargetId);
    assert.ok(source, `retest target ${target.targetId} traces to an original target`);
    assert.equal(target.dok, source.dok);
    assert.equal(target.difficultyBand, source.difficultyBand);
    assert.equal(target.representation, source.representation);
  }

  // Nothing from the original Test is reused.
  const testSession = await readSession(state[STUDENT_A].testSessionId);
  const originalSeeds = new Set(testSession.issuancePlan.entries.map((entry) => entry.seedKey));
  const originalInstances = new Set(testSession.issuancePlan.entries.map((entry) => entry.questionInstanceId));
  for (const entry of plan.entries) {
    assert.equal(originalSeeds.has(entry.seedKey), false, 'a retest slot reused a Test seed');
    assert.equal(originalInstances.has(entry.questionInstanceId), false, 'a retest slot reused a Test instance');
  }
  assert.equal(plan.requiresLiveGeneration, false);
  assert.deepEqual(plan.unfilledSlots, []);
});

test('E25+E26: Student A earns raw Retest 84, held until release', async () => {
  const issued = await sit({
    studentId: STUDENT_A, examSessionId: state[STUDENT_A].retestSessionId,
    correctCount: CERT_RETEST_CORRECT, total: CERT_TOTAL_QUESTIONS,
  });
  state[STUDENT_A].retestIssued = issued;

  // E23 again, now against the instances actually delivered.
  const testInstanceIds = new Set(state[STUDENT_A].issued.map((entry) => entry.questionInstanceId));
  for (const entry of issued) {
    assert.equal(testInstanceIds.has(entry.questionInstanceId), false);
  }

  const card = await cardFor(STUDENT_A);
  assert.equal(card.stage, 'retestSubmitted');
  assert.equal(card.grade.recordedGrade, CERT_TEST_SCORE, 'still the original Test until release');
  assert.equal(card.grade.rawRetestGrade, null, 'raw retest correctness is held');
});

test('E27+E28: releasing the Retest records 52 / 84 raw / 70 capped / 70 recorded', async () => {
  resetClassroomCalls();
  await releaseFeedback(state[STUDENT_A].retestSessionId);

  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_A);
  assert.equal(record.test.rawScore, CERT_TEST_SCORE, 'the original Test score is not destroyed');
  assert.equal(record.retest.rawScore, CERT_RETEST_RAW_SCORE, 'the raw retest score is kept as earned');
  assert.equal(record.recordedGrade, CERT_RECORDED_AFTER_RETEST);

  const projection = (await readGradeDoc(STUDENT_A)).testCycleGrades[CERT_ASSIGNMENT_ID];
  assert.equal(projection.originalTestGrade, CERT_TEST_SCORE);
  assert.equal(projection.rawRetestGrade, CERT_RETEST_RAW_SCORE);
  assert.equal(projection.retestCappedContribution, CERT_RETEST_CAPPED);
  assert.equal(projection.recordedGrade, CERT_RECORDED_AFTER_RETEST);
  assert.equal(projection.maxRecordedGrade, 70);
  assert.equal(projection.retestCapApplied, true);

  // The audit trail keeps both releases and says why the recorded grade is 70.
  assert.deepEqual(record.history.map((row) => row.reason), ['testReleased', 'retestReleased']);
  assert.equal(record.history[0].recordedGrade, CERT_TEST_SCORE);
  assert.equal(record.history[1].recordedGrade, CERT_RECORDED_AFTER_RETEST);
  assert.equal(record.history[1].rawRetestGrade, CERT_RETEST_RAW_SCORE);
  assert.match(record.history[1].detail, /cap/i);

  const card = await cardFor(STUDENT_A);
  assert.equal(card.stage, 'complete');
  const rows = Object.fromEntries(card.grade.rows.map((row) => [row.key, row.value]));
  assert.equal(rows.originalTest, '52%');
  assert.equal(rows.corrections, 'Complete');
  assert.equal(rows.retest, '84% raw');
  assert.equal(rows.retestPolicy, 'capped at 70%');
  assert.equal(rows.recordedGrade, '70%');
});

test('F30+F31: the Retest updates that exact coursework item to 70, and creates no second item', async () => {
  await runClassroomSync(STUDENT_A, state.gradeAfterTestRelease);

  const patches = patchGradeCalls();
  assert.equal(patches.length, 1, 'one patch for the retest release');
  assert.equal(patches[0].courseWorkId, COURSEWORK_ID, 'the SAME coursework item as the original Test');
  assert.equal(patches[0].grade, CERT_RECORDED_AFTER_RETEST, 'capped at 70, not the raw 84');
  assert.equal(createCourseWorkCalls().length, 0);

  // Still one audit row per (publication, student): one item, updated in place.
  const audit = (await db.collection('classroomGradeSyncs')
    .where('studentId', '==', STUDENT_A).get()).docs.map((doc) => doc.data());
  assert.equal(audit.length, 1, 'one grade item means one sync record');
  assert.equal(audit[0].grade, CERT_RECORDED_AFTER_RETEST);
  assert.equal(audit[0].stage, 'testcycle-retest');
  assert.equal(audit[0].courseworkId, COURSEWORK_ID);
});

/* ======================================================================== */
/* G. Passing-Test path                                                      */
/* ======================================================================== */

test('G34+G35+G36: a passing Test records 80 and exposes no Corrections or Retest', async () => {
  resetClassroomCalls();
  const before = await readGradeDoc(STUDENT_B);
  await releaseFeedback(state[STUDENT_B].testSessionId);

  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_B);
  assert.equal(record.test.rawScore, CERT_PASSING_SCORE);
  assert.equal(record.recordedGrade, CERT_PASSING_SCORE);
  assert.equal(record.corrections.required, false, 'a passing Test creates no corrections requirement');
  assert.equal(record.retest.examSessionId, null, 'and no retest session');
  assert.equal((await readCorrectionPlan(CERT_ASSIGNMENT_ID, STUDENT_B)), undefined);

  const card = await cardFor(STUDENT_B);
  assert.equal(card.stage, 'passed');
  assert.equal(card.corrections, null);
  assert.equal(card.grade.recordedGrade, CERT_PASSING_SCORE);
  assert.equal(card.grade.simple, true, 'no retest happened, so the breakdown stays simple');

  state.gradeAfterBPass = await readGradeDoc(STUDENT_B);
  await runClassroomSync(STUDENT_B, before);
  assert.equal(patchGradeCalls()[0].grade, CERT_PASSING_SCORE);
});

test('F32+F33: a lower retest never lowers the record or the posted Classroom grade', async () => {
  // The teacher explicitly overrides policy to let a passing student retest.
  await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: CERT_ASSIGNMENT_ID, studentId: STUDENT_B, action: 'unlockRetest',
  }));
  const unlocked = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_B);
  assert.ok(unlocked.retest.examSessionId, 'the override opened a retest');

  // A deliberately poor retest: a handful of correct answers, then submit.
  await fns.startSecureExamSession.run(studentRequest(STUDENT_B, { examSessionId: unlocked.retest.examSessionId }));
  for (let index = 0; index < 5; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const question = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT_B, { examSessionId: unlocked.retest.examSessionId }));
    // eslint-disable-next-line no-await-in-loop
    await fns.submitSecureExamResponse.run(studentRequest(STUDENT_B, {
      examSessionId: unlocked.retest.examSessionId,
      questionInstanceId: question.questionInstance.questionInstanceId,
      responsePayload: { responses: { answer: certAnswerFromPrompt(question.questionInstance.prompt) } },
      submissionId: `cert-sub-b-retest-${index + 1}`,
    }));
  }
  await fns.finalizeSecureExam.run(studentRequest(STUDENT_B, {
    examSessionId: unlocked.retest.examSessionId, reason: 'studentSubmit',
  }));

  resetClassroomCalls();
  await releaseFeedback(unlocked.retest.examSessionId);

  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_B);
  assert.equal(record.retest.rawScore, 20, '5 of 25 answered correctly');
  assert.equal(record.recordedGrade, CERT_PASSING_SCORE, 'an 80 is never reduced by a worse retest');
  assert.equal(record.test.rawScore, CERT_PASSING_SCORE);

  // And the cap never pulls a passing original down either.
  const projection = (await readGradeDoc(STUDENT_B)).testCycleGrades[CERT_ASSIGNMENT_ID];
  assert.equal(projection.recordedGrade, CERT_PASSING_SCORE);
  assert.ok(projection.recordedGrade > projection.maxRecordedGrade, 'an original above the cap survives it');

  await runClassroomSync(STUDENT_B, state.gradeAfterBPass);
  assert.equal(patchGradeCalls().length, 0, 'Classroom was never asked to lower the posted grade');
  const audit = (await db.collection('classroomGradeSyncs')
    .where('studentId', '==', STUDENT_B).get()).docs.map((doc) => doc.data());
  assert.equal(audit.length, 1);
  assert.equal(audit[0].grade, CERT_PASSING_SCORE, 'the posted grade still reads 80');
});

/* ======================================================================== */
/* H. Teacher controls                                                       */
/* ======================================================================== */

test('H setup: Student C fails the Test and is released into Corrections', async () => {
  await completeReview(STUDENT_C);
  const sessionId = state[STUDENT_C].testSessionId;
  await fns.startSecureExamSession.run(studentRequest(STUDENT_C, { examSessionId: sessionId }));
  // Two wrong answers then submit: everything unanswered scores zero, which is
  // a fast, unambiguous failure.
  for (let index = 0; index < 2; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const question = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT_C, { examSessionId: sessionId }));
    // eslint-disable-next-line no-await-in-loop
    await fns.submitSecureExamResponse.run(studentRequest(STUDENT_C, {
      examSessionId: sessionId,
      questionInstanceId: question.questionInstance.questionInstanceId,
      responsePayload: { responses: { answer: CERT_WRONG_ANSWER } },
      submissionId: `cert-sub-c-${index + 1}`,
    }));
  }
  await fns.finalizeSecureExam.run(studentRequest(STUDENT_C, { examSessionId: sessionId, reason: 'studentSubmit' }));
  await releaseFeedback(sessionId);

  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);
  assert.equal(record.test.rawScore, 0);
  assert.equal(record.corrections.required, true);
  assert.equal((await cardFor(STUDENT_C)).stage, 'corrections');
});

test('H37: Require Corrections keeps the student on the corrections gate', async () => {
  await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: CERT_ASSIGNMENT_ID, studentId: STUDENT_C, action: 'requireCorrections',
  }));
  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);
  assert.equal(record.teacherControls.requireCorrections, true);
  assert.equal(record.teacherControls.correctionsWaived, false);
  assert.equal((await cardFor(STUDENT_C)).stage, 'corrections');
});

test('H38: Waive Corrections opens the Retest instead of trapping the student', async () => {
  const result = await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: CERT_ASSIGNMENT_ID, studentId: STUDENT_C, action: 'waiveCorrections',
  }));
  assert.equal(result.retestOpened, true);

  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);
  assert.ok(record.retest.examSessionId, 'a waived gate must still leave somewhere to go');
  state[STUDENT_C].firstRetestSessionId = record.retest.examSessionId;

  const card = await cardFor(STUDENT_C);
  assert.equal(card.stage, 'retest');
  assert.equal(card.canEnter, true);
  // And the student can actually start it.
  await fns.startSecureExamSession.run(studentRequest(STUDENT_C, { examSessionId: record.retest.examSessionId }));
  assert.equal((await readSession(record.retest.examSessionId)).status, 'in_progress');
});

test('H40: Reset Retest replaces only the Retest, and the superseded session cannot be released', async () => {
  const before = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);
  await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: CERT_ASSIGNMENT_ID, studentId: STUDENT_C, action: 'resetSecureSession', stage: 'retest',
  }));
  const after = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);

  // Only the retest moved.
  assert.equal(after.test.examSessionId, before.test.examSessionId, 'the Test session is untouched');
  assert.equal(after.test.rawScore, before.test.rawScore, 'and its released score survives');
  assert.equal(after.test.state, 'released');
  assert.ok(after.retest.examSessionId, 'a reset Retest must leave the student a fresh session, not an empty stage');
  assert.notEqual(after.retest.examSessionId, before.retest.examSessionId);
  assert.equal(after.retest.attempt, Number(before.retest.attempt) + 1);
  assert.equal(after.retest.state, 'assigned');
  // The replacement is a genuinely different draw, not the same plan re-keyed.
  const supersededPlan = (await readSession(before.retest.examSessionId)).issuancePlan;
  const replacementPlan = (await readSession(after.retest.examSessionId)).issuancePlan;
  assert.notEqual(replacementPlan.planId, supersededPlan.planId);
  const sharedSeeds = replacementPlan.entries
    .map((entry) => entry.seedKey)
    .filter((seed) => supersededPlan.entries.some((entry) => entry.seedKey === seed));
  assert.deepEqual(sharedSeeds, [], 'a reset must not hand back the questions the student already saw');

  // The old session is closed and can no longer be released over the new one.
  const supersededId = state[STUDENT_C].firstRetestSessionId;
  assert.equal((await readSession(supersededId)).status, 'force_submitted');
  const denied = await refusal(releaseFeedback(supersededId));
  assert.equal(denied?.code, 'failed-precondition');
  assert.match(denied.message, /replaced by a reset/i);

  // And a student cannot re-enter the superseded session either.
  const blocked = await refusal(fns.startSecureExamSession.run(
    studentRequest(STUDENT_C, { examSessionId: supersededId }),
  ));
  assert.ok(blocked, 'a superseded secure session must not be enterable');
});

test('H40b: Reset Test replaces only the Test', async () => {
  const before = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);
  await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: CERT_ASSIGNMENT_ID, studentId: STUDENT_C, action: 'resetSecureSession', stage: 'test',
  }));
  const after = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);

  assert.notEqual(after.test.examSessionId, before.test.examSessionId);
  assert.equal(after.test.state, 'assigned');
  assert.equal(after.test.rawScore, null, 'a reset Test has no score until it is sat again');
  assert.equal(after.retest.examSessionId, before.retest.examSessionId, 'the Retest stage is untouched');
  // A reset that cleared a released score is in the audit trail.
  assert.equal(after.history.at(-1).reason, 'teacherOverride');
  assert.match(after.history.at(-1).detail, /reset the secure test session/i);

  /*
   * AND THE RESET DOES NOT UN-PROVE THE REVIEW THE STUDENT ALREADY PASSED.
   *
   * The replacement Test is `assigned`, which is the same shape a student who
   * has never opened the Review is in. The teacher gradebook resolves stages
   * with no tracker in hand, so without a durable fact it reports "Review" for
   * a student who is actually sitting a replacement Test — and the student's
   * own card, which HAS a tracker, would disagree with it.
   */
  const gradebook = await fns.listTeacherTestCycleRecords.run(
    teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID }),
  );
  const resetRow = gradebook.rows.find((row) => row.studentId === STUDENT_C);
  assert.notEqual(resetRow.stage, 'review', 'a reset must not send the gradebook back to Review');
  assert.equal(resetRow.stage, 'test', 'the student is sitting the replacement Test');
  assert.equal(after.review.complete, true, 'the passed-review fact is persisted, not re-derived');
});

test('H39: Disable Retest blocks entry even though a session already exists', async () => {
  const record = await readRecord(CERT_ASSIGNMENT_ID, STUDENT_C);
  const retestSessionId = record.retest.examSessionId;
  assert.ok(retestSessionId, 'this student has a retest session to be blocked from');

  await fns.teacherTestCycleAction.run(teacherRequest({
    assignmentId: CERT_ASSIGNMENT_ID, studentId: STUDENT_C, action: 'disableRetest',
  }));

  // Put the Test back into a released failing state so the cycle is at the
  // point where a retest would otherwise be offered.
  await db.collection('testCycleRecords').doc(`${CERT_ASSIGNMENT_ID}__${STUDENT_C}`).update({
    'test.state': 'released', 'test.rawScore': 0,
  });

  const card = await cardFor(STUDENT_C);
  assert.equal(card.stage, 'retestClosed');
  assert.equal(card.canEnter, false);

  const denied = await refusal(fns.startSecureExamSession.run(
    studentRequest(STUDENT_C, { examSessionId: retestSessionId }),
  ));
  assert.equal(denied?.code, 'failed-precondition');
});

/* ======================================================================== */
/* I. Navigation and result surfaces                                         */
/* ======================================================================== */

test('I42: Tests & Exams carries the assignment id so course tests route back to the card', async () => {
  const listed = await fns.listStudentSecureExamSessions.run(studentRequest(STUDENT_A, {}));
  const courseTests = listed.sessions.filter((session) => session.examType === 'courseTest');
  assert.ok(courseTests.length >= 2, 'the Test and the Retest both appear');
  for (const session of courseTests) {
    assert.equal(session.courseTest.assignmentId, CERT_ASSIGNMENT_ID,
      'without this the list cannot hand off to the stage authority');
  }
  // And the list still leaks nothing that would let a client bypass the gate.
  const serialized = JSON.stringify(listed);
  for (const secret of ['issuancePlan', 'seedKey', 'privateGrading', 'responses']) {
    assert.equal(serialized.includes(`"${secret}"`), false);
  }
});

test('I43+I44: every surface reads the same canonical recorded grade', async () => {
  const [gradeCenterModel, assignmentsModel, dashboardModel, lifecycle, attemptPolicy, smartViews] = await Promise.all([
    import('../../src/platform/student/studentGradeCenterModel.js'),
    import('../../src/platform/student/studentAssignmentsCenterModel.js'),
    import('../../src/studentDashboardModel.js'),
    import('../../src/assignmentLifecycle.js'),
    import('../../src/attemptPolicy.js'),
    import('../../src/assignmentSmartViews.js'),
  ]);

  const assignment = (await db.collection('assignments').doc(CERT_ASSIGNMENT_ID).get()).data();
  const gradeDoc = await readGradeDoc(STUDENT_A);

  // The student Grade Center, built by the real model from the real projection.
  const gradeCenter = gradeCenterModel.buildStudentGradeCenter({
    assignments: [{ ...assignment, id: CERT_ASSIGNMENT_ID }],
    classId: CERT_CLASS_ID,
    studentId: STUDENT_A,
    tracker: gradeDoc.gradesByAssignment || {},
    testCycleGrades: gradeDoc.testCycleGrades || {},
  });
  const entry = gradeCenterModel.findGradeCenterEntry(gradeCenter, CERT_ASSIGNMENT_ID);
  assert.equal(entry.isTestCycle, true);
  assert.equal(entry.displayGrade, CERT_RECORDED_AFTER_RETEST);
  assert.equal(entry.testCycle.originalTestGrade, CERT_TEST_SCORE);
  assert.equal(entry.testCycle.rawRetestGrade, CERT_RETEST_RAW_SCORE);
  assert.equal(entry.testCycle.retestCappedContribution, CERT_RETEST_CAPPED);

  // I41: the Assignments Center shows ONE card, not four assignments.
  // The same providers App.jsx hands it, so this is the model a student's
  // screen actually renders rather than a convenient stand-in.
  const dashboard = dashboardModel.buildStudentDashboardModel({
    assignments: [{ ...assignment, id: CERT_ASSIGNMENT_ID }],
    classId: CERT_CLASS_ID,
    classPeriod: 'Period 1',
    tracker: gradeDoc.gradesByAssignment || {},
    providers: {
      assignmentIsForStudent: lifecycle.assignmentIsForStudent,
      getAssignmentLifecycle: lifecycle.getAssignmentLifecycle,
      prerequisiteAccess: lifecycle.prerequisiteAccess,
      calculateGrade: () => 0,
      getDOLState: lifecycle.getDOLState,
      getWarmupState: lifecycle.getWarmupState,
      getIncludedQuestionIndices: lifecycle.getIncludedQuestionIndices,
      normalizeQuestionRecord: attemptPolicy.normalizeQuestionRecord,
      questionIsIncluded: lifecycle.questionIsIncluded,
      assignmentHasHeldTeacherFeedback: () => false,
      matchesSmartView: smartViews.matchesSmartView,
    },
  });
  const center = assignmentsModel.buildStudentAssignmentsCenter({ dashboard, gradeCenter });
  const rows = center.rows.filter((row) => row.assignmentId === CERT_ASSIGNMENT_ID);
  assert.equal(rows.length, 1, 'Review/Test/Corrections/Retest are one card');
  assert.equal(rows[0].isTestCycle, true);
  assert.equal(rows[0].displayGrade, CERT_RECORDED_AFTER_RETEST);

  // I44: the teacher gradebook shows all five numbers, from the same record.
  const teacherRows = await fns.listTeacherTestCycleRecords.run(
    teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID }),
  );
  const rowA = teacherRows.rows.find((row) => row.studentId === STUDENT_A);
  assert.equal(rowA.originalTestGrade, CERT_TEST_SCORE);
  assert.equal(rowA.rawRetestGrade, CERT_RETEST_RAW_SCORE);
  assert.equal(rowA.retestCappedContribution, CERT_RETEST_CAPPED);
  assert.equal(rowA.maxRecordedGrade, 70);
  assert.equal(rowA.recordedGrade, CERT_RECORDED_AFTER_RETEST);
  assert.equal(rowA.stage, 'complete');
  // The student's own screen and the teacher's agree, which is the point.
  assert.equal(rowA.recordedGrade, entry.displayGrade);
});

test('teacher scoping: another teacher can neither see nor release this class\'s course tests', async () => {
  await db.collection('classes').doc('cert-class-foreign').set({
    name: 'Foreign', course: 'algebra1', period: 'P9', teacherOfRecord: OTHER_TEACHER_EMAIL, status: 'active',
  });
  const listed = await fns.listProctorExamSessions.run(
    teacherRequest({ examType: 'courseTest' }, OTHER_TEACHER_EMAIL),
  );
  assert.equal(listed.sessions.length, 0, 'course tests belong to the class teacher of record');

  const denied = await refusal(releaseFeedback(state[STUDENT_A].testSessionId, OTHER_TEACHER_EMAIL));
  assert.equal(denied?.code, 'permission-denied');
  await db.collection('classes').doc('cert-class-foreign').delete();
});

/* ======================================================================== */
/* Authoring / preflight, on the path #223 actually shipped                  */
/* ======================================================================== */

test('preflight blocks an under-covered Test Cycle BEFORE any session exists', async () => {
  // The supported authoring path today is Assignment V5 JSON with an
  // assessmentPolicy and a testBlueprint. The thing that must never happen is
  // a cycle reaching a classroom that cannot issue equivalent secure coverage —
  // so the refusal has to come before session creation, not after.
  const thinAssignmentId = `${CERT_ASSIGNMENT_ID}-thin`;
  const assignment = certAssignment();
  await db.collection('assignments').doc(thinAssignmentId).set({
    ...assignment,
    id: thinAssignmentId,
    testBlueprint: {
      ...assignment.testBlueprint,
      blueprintId: `${CERT_PREFIX}blueprint-thin`,
      targets: [{
        ...assignment.testBlueprint.targets[0],
        questionCount: 5,
        // One family for five slots: not enough to issue five distinct items.
        familyIds: [`${CERT_PREFIX}tA-1`],
      }],
    },
  });

  const denied = await refusal(fns.assignTestCycleSessions.run(
    teacherRequest({ assignmentId: thinAssignmentId, classId: CERT_CLASS_ID }),
  ));
  assert.equal(denied?.code, 'failed-precondition');
  assert.match(denied.message, /distinct approved families/i);

  // Nothing was created for anybody.
  for (const studentId of [STUDENT_A, STUDENT_B, STUDENT_C]) {
    // eslint-disable-next-line no-await-in-loop
    const record = await db.collection('testCycleRecords').doc(`${thinAssignmentId}__${studentId}`).get();
    assert.equal(record.exists, false, 'a blocked preflight must leave no sessions behind');
  }
  const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', thinAssignmentId).get();
  assert.equal(sessions.size, 0);

  // The standalone preflight callable reports the same blocker to authoring.
  const preflight = await fns.preflightTestCycleAssignment.run(teacherRequest({ assignmentId: thinAssignmentId }));
  assert.equal(preflight.preflight.blocked, true);
  assert.equal(preflight.preflight.checks.find((check) => check.id === 'secureTestCoverage').passed, false);

  await db.collection('assignments').doc(thinAssignmentId).delete();
});

test('the published assignment document carries no secure answer material', async () => {
  // This is the document a student's browser downloads. The blueprint names
  // approved families; it must never carry what they evaluate to.
  const assignment = (await db.collection('assignments').doc(CERT_ASSIGNMENT_ID).get()).data();
  const serialized = JSON.stringify(assignment.testBlueprint);
  for (const secret of ['expected', 'accepted', 'answerKey', 'correctAnswer', 'privateGrading', 'generatorParameters', 'solutionKey', 'seedKey']) {
    assert.equal(serialized.includes(`"${secret}"`), false, `the blueprint serialized ${secret}`);
  }
  // And no secure stage is authored as ordinary client-visible content.
  const roles = assignment.sections.map((section) => section.role);
  assert.deepEqual(roles, ['review', 'corrections']);
  for (const forbidden of ['test', 'retest', 'quiz']) {
    assert.equal(roles.includes(forbidden), false, `a ${forbidden} section would ship its key to the browser`);
  }
});

/* ======================================================================== */
/* J. A Test day nobody could sit is never "missed" (PR-21)                  */
/* ======================================================================== */

/*
 * One teacher action used to mark a whole class as having missed the Test:
 * setting the Test day to today after the class had already met (the window
 * was closed the moment it was stored), or setting a day the bell schedule
 * never gave times for (it closed at that day's midnight). Either moved every
 * student to a Retest. Its own assignment, class and student, so nothing here
 * changes what the scenarios above found.
 */
test('J: a Test day is never scheduled into a meeting that has ended, and an unresolved day is never missed', async (t) => {
  const { zonedDateKey, zonedInstant } = await import('../../functions/shared/instructionalCalendar.mjs');
  const { SCHOOL_TIME_ZONE } = await import('../../functions/shared/sectionDeadline.mjs');
  const { withClassTestDay } = await import('../../functions/shared/testCycleAvailability.mjs');
  const DAY = 86400000;
  const dayKey = (offset) => zonedDateKey(Date.now() + offset * DAY, SCHOOL_TIME_ZONE);
  const today = dayKey(0);
  const [year, month, day] = today.split('-').map(Number);
  // Today's meeting is 00:00–00:01 school time, so it has ended — unless this
  // runs in that first two minutes after midnight, when it is not yet true.
  if (Date.now() < zonedInstant({ year, month, day, hour: 0, minute: 2 }, SCHOOL_TIME_ZONE)) {
    t.skip('it is just after midnight in the school zone: today\'s meeting has not ended yet');
    return;
  }
  const ASSIGNMENT = `${CERT_PREFIX}pr21`;
  const CLASS = 'cert-pr21-class';
  const PERIOD = 'CERT PR21 Period';
  const STUDENT = 'CERT_PR21_STUDENT';
  const cleanup = async () => {
    const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT).get();
    await Promise.allSettled([
      db.collection('assignments').doc(ASSIGNMENT).delete(),
      db.collection('classes').doc(CLASS).delete(),
      db.collection('grades').doc(STUDENT).delete(),
      db.collection('testCycleRecords').doc(`${ASSIGNMENT}__${STUDENT}`).delete(),
      db.collection('testCycleRetestPlans').doc(`${ASSIGNMENT}__${STUDENT}`).delete(),
      removeOwnSchedule(PERIOD),
      ...sessions.docs.map((doc) => doc.ref.delete()),
    ]);
  };
  t.after(cleanup);

  await db.collection('classes').doc(CLASS).set({
    name: 'Certification PR21', course: 'algebra1', courseLevel: 'standard', period: PERIOD, teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('grades').doc(STUDENT).set({
    displayName: 'Pr Twentyone Learner', classId: CLASS, classPeriod: PERIOD, assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
    gradesByAssignment: { [ASSIGNMENT]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  });
  await db.collection('assignments').doc(ASSIGNMENT).set({ ...certAssignment({ classIds: [CLASS] }), id: ASSIGNMENT });
  await putOwnSchedule({
    [today]: { periods: { [PERIOD]: { enabled: true, start: '00:00', end: '00:01' } } },
    [dayKey(1)]: { periods: { [PERIOD]: { enabled: true, start: '00:00', end: '23:59' } } },
  });
  const opened = await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT, classId: CLASS }));
  assert.equal(opened.createdSessions, 1);
  const availability = (data) => fns.updateTestCycleAvailability.run(teacherRequest({ assignmentId: ASSIGNMENT, ...data }));
  const notMissed = async (label, { gated = true } = {}) => {
    const card = await fns.getStudentTestCycle.run(studentRequest(STUDENT, { assignmentId: ASSIGNMENT }));
    assert.equal(card.stage, 'test', label);
    if (gated) assert.equal(card.canEnter, false, `${label}: not opened early either`);
    assert.notEqual(card.missedTest, true, label);
    assert.equal(card.schedule.missedTest, false, label);
    const record = await readRecord(ASSIGNMENT, STUDENT);
    assert.equal(record.retest.examSessionId ?? null, null, `${label}: no Retest was opened in the Test's place`);
    assert.notEqual(record.retest.withoutOriginal, true, label);
    return card;
  };

  // 1. Today, after the class met: refused, with when it meets next.
  const ended = await refusal(availability({ action: 'setClassTestDay', classId: CLASS, dateKey: today }));
  assert.equal(ended?.code, 'failed-precondition');
  assert.match(ended.message, /already met today .*It next meets: .*12:00 AM C[DS]T – 11:59 PM C[DS]T/);
  assert.equal((await db.collection('assignments').doc(ASSIGNMENT).get()).data().testAvailability, undefined, 'nothing was stored');
  // No window at all is the "unset" cycle it was before: nothing enforced.
  assert.equal((await notMissed('after the refusal', { gated: false })).schedule.test.state, 'unset');

  // 2. "Every class from today" skips today's ended meeting for tomorrow's.
  const all = await availability({ action: 'setTestDayForClasses', fromDateKey: today });
  assert.match(all.notes.join(' '), /12:00 AM C[DS]T – 11:59 PM C[DS]T/);
  const stored = (await db.collection('assignments').doc(ASSIGNMENT).get()).data().testAvailability;
  assert.deepEqual(stored.classWindows[CLASS].map((entry) => entry.dateKey), [dayKey(1)]);
  const upcoming = await notMissed('a day set for tomorrow');
  assert.equal(upcoming.schedule.test.state, 'upcoming');
  // The teacher is offered tomorrow, not today.
  const table = await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: ASSIGNMENT }));
  const entry = table.testSchedule.classes.find((row) => row.classId === CLASS);
  assert.equal(entry.upcomingDays[0].dateKey, dayKey(1));

  // 3. A day stored after its meeting ended (an older server wrote it): it
  // waits for a new day instead of closing on the class.
  await db.collection('assignments').doc(ASSIGNMENT).update({
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: today, at: Date.now() }),
  });
  const late = await notMissed('a day stored after its meeting ended');
  assert.equal(late.schedule.test.state, 'upcoming');
  assert.equal(late.schedule.test.headline, 'Waiting for a new Test day');
  assert.match(late.schedule.test.detail, /had already ended when it was set as the Test day\. Your teacher will set a new Test day\./);
  const lateStart = await refusal(fns.startSecureExamSession.run(studentRequest(STUDENT, { examSessionId: late.examSessionId })));
  assert.equal(lateStart?.code, 'failed-precondition');
  assert.match(lateStart.message, /waiting for a new Test day/);
  // TC03: "each class's first meeting from today" moves a class whose day
  // ran with nobody starting (a snow day the bell schedule never heard of):
  // the day was set before the meeting, so its window opened and closed. A
  // class where someone started is still kept (scenario L).
  await db.collection('assignments').doc(ASSIGNMENT).update({
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: today, at: Date.now() - 2 * 24 * 60 * 60 * 1000 }),
  });
  const moved = await availability({ action: 'setTestDayForClasses', fromDateKey: today });
  assert.match(moved.notes.join(' '), /passed with nobody starting, so it moves too/);
  const movedDays = (await db.collection('assignments').doc(ASSIGNMENT).get()).data().testAvailability.classWindows[CLASS].map((entry) => entry.dateKey);
  assert.deepEqual(movedDays, [dayKey(1)]);
  assert.equal((await notMissed('moved to the class\'s next meeting')).schedule.test.state, 'upcoming');

  // 4. A day the bell schedule never gave times for, after its midnight.
  await db.collection('assignments').doc(ASSIGNMENT).update({
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: dayKey(-2) }),
  });
  const passed = await notMissed('a day that passed without times');
  assert.equal(passed.schedule.test.headline, 'Waiting for a new Test day');
  assert.match(passed.schedule.test.detail, /passed before the bell schedule gave this class's times for it/);
  const row = (await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: ASSIGNMENT }))).rows.find((entry) => entry.studentId === STUDENT);
  assert.notEqual(row.bucket, 'missedTest');
  assert.notEqual(row.missedTest, true);
});

/* ======================================================================== */
/* K. Tests & Exams can describe a Test before its session exists (PR-20)    */
/* ======================================================================== */

/*
 * Tests & Exams lists a Test Cycle with no secure session from a READ-ONLY
 * look at the card (getStudentTestCycle `preview`). That look must say when
 * the Test is and how long it is — and open nothing: no record, no session,
 * and no stand-in Retest for a student whose window has closed. Only the card,
 * opened by the student, does that.
 */
test('K: a preview of a Test whose session is not open describes it and opens nothing', async (t) => {
  const { zonedDateKey } = await import('../../functions/shared/instructionalCalendar.mjs');
  const { SCHOOL_TIME_ZONE } = await import('../../functions/shared/sectionDeadline.mjs');
  const { withClassTestDay } = await import('../../functions/shared/testCycleAvailability.mjs');
  const DAY = 86400000;
  const dayKey = (offset) => zonedDateKey(Date.now() + offset * DAY, SCHOOL_TIME_ZONE);
  const ASSIGNMENT = `${CERT_PREFIX}pr20`;
  const CLASS = 'cert-pr20-class';
  const PERIOD = 'CERT PR20 Period';
  const STUDENT = 'CERT_PR20_STUDENT';
  const recordRef = db.collection('testCycleRecords').doc(`${ASSIGNMENT}__${STUDENT}`);
  t.after(async () => {
    const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT).get();
    await Promise.allSettled([
      db.collection('assignments').doc(ASSIGNMENT).delete(),
      db.collection('classes').doc(CLASS).delete(),
      db.collection('grades').doc(STUDENT).delete(),
      recordRef.delete(),
      db.collection('testCycleRetestPlans').doc(`${ASSIGNMENT}__${STUDENT}`).delete(),
      removeOwnSchedule(PERIOD),
      ...sessions.docs.map((doc) => doc.ref.delete()),
    ]);
  });

  await db.collection('classes').doc(CLASS).set({
    name: 'Certification PR20', course: 'algebra1', courseLevel: 'standard', period: PERIOD, teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('grades').doc(STUDENT).set({
    displayName: 'Pr Twenty Learner', classId: CLASS, classPeriod: PERIOD, assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
    gradesByAssignment: { [ASSIGNMENT]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  });
  await db.collection('assignments').doc(ASSIGNMENT).set({ ...certAssignment({ classIds: [CLASS] }), id: ASSIGNMENT });
  await putOwnSchedule(Object.fromEntries([-1, 1].map((offset) => [dayKey(offset), { periods: { [PERIOD]: { enabled: true, start: '00:00', end: '23:59' } } }])));
  const preview = () => fns.getStudentTestCycle.run(studentRequest(STUDENT, { assignmentId: ASSIGNMENT, preview: true }));

  // Assigned, Test day tomorrow, no session opened: the list has nothing for it.
  await fns.updateTestCycleAvailability.run(teacherRequest({ assignmentId: ASSIGNMENT, action: 'setClassTestDay', classId: CLASS, dateKey: dayKey(1) }));
  const listed = await fns.listStudentSecureExamSessions.run(studentRequest(STUDENT, {}));
  assert.equal(listed.sessions.filter((session) => session.courseTest?.assignmentId === ASSIGNMENT).length, 0);
  const look = await preview();
  assert.equal(look.preview, true);
  assert.equal(look.hasSecureSession, false, 'from the record: no session yet');
  assert.equal(look.canEnter, false);
  assert.equal(look.schedule.test.state, 'upcoming');
  assert.match(look.schedule.test.headline, /^Opens .* 12:00 AM C[DS]T$/);
  assert.match(look.schedule.test.home, /taken in class/);
  // How long: the card's own delivery facts (this blueprint is timed).
  assert.equal(look.delivery.timed, true);
  assert.ok(look.delivery.timeLimitMinutes > 0);
  assert.equal(look.delivery.questionCount, CERT_TOTAL_QUESTIONS);
  assert.equal(look.examSessionId, null);
  assert.equal(JSON.stringify(look).includes('privateGrading'), false);
  assert.equal((await recordRef.get()).exists, false, 'a look writes no record');

  // The window closed yesterday and the student never started: the CARD would
  // open a stand-in Retest. The preview must not.
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT, classId: CLASS }));
  await db.collection('assignments').doc(ASSIGNMENT).update({ testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: dayKey(-1) }) });
  const missed = await preview();
  assert.equal(missed.schedule.missedTest, true);
  assert.equal(missed.hasSecureSession, true, 'the Test session now exists, so Tests & Exams lists it, not a row');
  assert.equal((await readRecord(ASSIGNMENT, STUDENT)).retest.examSessionId ?? null, null, 'no Retest opened by a look');
  const sessionsBefore = (await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT).get()).size;
  // ...and the card itself still does, exactly as before.
  const card = await fns.getStudentTestCycle.run(studentRequest(STUDENT, { assignmentId: ASSIGNMENT }));
  assert.equal(card.stage, 'retest');
  assert.ok((await readRecord(ASSIGNMENT, STUDENT)).retest.examSessionId);
  assert.equal((await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT).get()).size, sessionsBefore + 1);
});

/* ======================================================================== */
/* L. A stranded day never hides a window that ran (PR-21 review)            */
/* ======================================================================== */

/*
 * Old-bug data (a Test day stored after its class had met) that the teacher
 * fixed the way the panel offers: "Open between two times". Once that reopen
 * has run, the class is exactly where it would be without the stranded day —
 * the student who sat it does Corrections, the student who did not missed it
 * and gets the Retest — and the teacher is not told nobody missed it. And the
 * bulk "first meeting from today" keeps the class, since its window ran.
 */
test('L: a reopen of a stranded day runs like any window: who sat it does Corrections, who did not is missed', async (t) => {
  const { zonedDateKey, zonedInstant } = await import('../../functions/shared/instructionalCalendar.mjs');
  const { SCHOOL_TIME_ZONE } = await import('../../functions/shared/sectionDeadline.mjs');
  const { withClassTestDay } = await import('../../functions/shared/testCycleAvailability.mjs');
  const today = zonedDateKey(Date.now(), SCHOOL_TIME_ZONE);
  const [year, month, day] = today.split('-').map(Number);
  if (Date.now() < zonedInstant({ year, month, day, hour: 0, minute: 2 }, SCHOOL_TIME_ZONE)) {
    t.skip('it is just after midnight in the school zone: today\'s meeting has not ended yet');
    return;
  }
  const ASSIGNMENT = `${CERT_PREFIX}pr21l`;
  const CLASS = 'cert-pr21l-class';
  const PERIOD = 'CERT PR21L Period';
  const SAT = 'CERT_PR21L_SAT';
  const ABSENT = 'CERT_PR21L_ABSENT';
  t.after(async () => {
    const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT).get();
    await Promise.allSettled([
      db.collection('assignments').doc(ASSIGNMENT).delete(),
      db.collection('classes').doc(CLASS).delete(),
      removeOwnSchedule(PERIOD),
      ...sessions.docs.map((doc) => doc.ref.delete()),
      ...[SAT, ABSENT].flatMap((studentId) => [
        db.collection('grades').doc(studentId).delete(),
        db.collection('testCycleRecords').doc(`${ASSIGNMENT}__${studentId}`).delete(),
        db.collection('testCycleCorrectionPlans').doc(`${ASSIGNMENT}__${studentId}`).delete(),
        db.collection('testCycleRetestPlans').doc(`${ASSIGNMENT}__${studentId}`).delete(),
      ]),
    ]);
  });

  await db.collection('classes').doc(CLASS).set({
    name: 'Certification PR21L', course: 'algebra1', courseLevel: 'standard', period: PERIOD, teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  for (const studentId of [SAT, ABSENT]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId === SAT ? 'Sat Twentyone Learner' : 'Absent Twentyone Learner', classId: CLASS, classPeriod: PERIOD,
      assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
      gradesByAssignment: { [ASSIGNMENT]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
    });
  }
  await putOwnSchedule({ [today]: { periods: { [PERIOD]: { enabled: true, start: '00:00', end: '00:01' } } } });
  // Old-bug data: today's day, stored after its class had met.
  await db.collection('assignments').doc(ASSIGNMENT).set({
    ...certAssignment({ classIds: [CLASS] }), id: ASSIGNMENT,
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: today, at: Date.now() }),
  });
  assert.equal((await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT, classId: CLASS }))).createdSessions, 2);
  const cardOf = (studentId) => fns.getStudentTestCycle.run(studentRequest(studentId, { assignmentId: ASSIGNMENT }));
  const classRow = async () => (await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: ASSIGNMENT })))
    .testSchedule.classes.find((entry) => entry.classId === CLASS);

  const stranded = await classRow();
  assert.equal(stranded.test.needsNewDay, true, 'the teacher is told this class needs a new day');
  assert.doesNotMatch(`${stranded.test.headline} ${stranded.test.detail}`, /missed/);

  // The teacher reopens it between two times, as the panel offers.
  const closesAt = Date.now() + 45000;
  await fns.updateTestCycleAvailability.run(teacherRequest({
    assignmentId: ASSIGNMENT, action: 'reopenClassWindow', classId: CLASS, opensAt: Date.now() - 60000, closesAt,
  }));
  const satCard = await cardOf(SAT);
  assert.deepEqual([satCard.stage, satCard.canEnter], ['test', true]);
  await sit({ studentId: SAT, examSessionId: satCard.examSessionId, correctCount: 0, total: CERT_TOTAL_QUESTIONS });
  await fns.finalizeSecureExam.run(studentRequest(SAT, { examSessionId: satCard.examSessionId }));
  await releaseFeedback(satCard.examSessionId);

  // Wait for the reopen to close.
  while (Date.now() <= closesAt + 500) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
  }

  const corrections = await cardOf(SAT);
  assert.deepEqual([corrections.stage, corrections.canEnter], ['corrections', true], 'the student who sat it does Corrections');
  assert.ok(corrections.corrections?.targets?.length > 0);
  const issued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(SAT, {
    assignmentId: ASSIGNMENT, correctionId: corrections.corrections.targets[0].correctionId,
  }));
  assert.ok(issued.questionInstance, 'and the server issues them a Correction');

  const absent = await cardOf(ABSENT);
  assert.equal(absent.schedule.missedTest, true, 'the student who did not sit it missed it');
  assert.equal(absent.stage, 'retest');
  assert.ok((await readRecord(ASSIGNMENT, ABSENT)).retest.examSessionId, 'and gets the Retest');

  const closed = await classRow();
  assert.equal(closed.test.state, 'closed');
  assert.equal(closed.test.needsNewDay, false);
  assert.doesNotMatch(`${closed.test.headline} ${closed.test.detail}`, /no student missed it/);

  // "Each class's first meeting from today" keeps a class whose window ran.
  const kept = await refusal(fns.updateTestCycleAvailability.run(teacherRequest({ assignmentId: ASSIGNMENT, action: 'setTestDayForClasses', fromDateKey: today })));
  assert.equal(kept?.code, 'failed-precondition');
  assert.match(kept.message, /No class was moved\. .*kept — its Test window already opened/);

  // Round 2: the class's real window stops resolving (here: the reopen is
  // gone, leaving only the day stored too late). Somebody sat it, so the
  // teacher is not told the day never ran — only who still has not sat it.
  // The absent student's stand-in Retest was never started, so they wait.
  await db.collection('assignments').doc(ASSIGNMENT).update({
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: today, at: Date.now() }),
  });
  const reread = await classRow();
  assert.equal(reread.test.headline, '1 student did not sit it');
  assert.doesNotMatch(reread.test.detail, /had already ended|passed before/);
  assert.equal(reread.test.needsNewDay, true);
  const stillCorrections = await cardOf(SAT);
  assert.deepEqual([stillCorrections.stage, stillCorrections.canEnter], ['corrections', true], 'the student who sat it is not held back');
  const waiting = await cardOf(ABSENT);
  assert.equal(waiting.schedule.test.stranded, true);
  assert.equal(waiting.schedule.test.headline, 'Waiting for a new Test day');
});

/*
 * M (student pass 3, wave 7, item 2; the owner's decision 2026-10-20, W7-6
 * decision 1 option b — THE TEACHER DECIDES): the first fresh Test start
 * inside a class-period window records the times that day resolved to
 * (testCycleClassSittings, create-if-absent). One student starting the Test
 * looks exactly like a class sitting it (the reviewer's snow day), so a day
 * that stops resolving never counts on its own: absent students wait, never
 * missed, and a day that has passed asks the teacher, naming the sitting.
 * Only the teacher's countClassSitting makes it the Test day; then whoever
 * did not start it has missed it.
 */
test('M: the first Test start records the class sitting; a day that stops resolving waits until the teacher counts it', async (t) => {
  const { zonedDateKey } = await import('../../functions/shared/instructionalCalendar.mjs');
  const { SCHOOL_TIME_ZONE } = await import('../../functions/shared/sectionDeadline.mjs');
  const { withClassTestDay, classSittingId, TEST_CYCLE_CLASS_SITTINGS } = await import('../../functions/shared/testCycleAvailability.mjs');
  // A one-minute meeting that is under way now: wait out the last seconds of
  // a minute so the start lands inside it.
  if (new Date().getSeconds() > 40) await new Promise((resolve) => { setTimeout(resolve, (61 - new Date().getSeconds()) * 1000); });
  const clock = (value) => new Intl.DateTimeFormat('en-GB', { timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  const startedMinute = Date.now();
  const [start, end] = [clock(startedMinute), clock(startedMinute + 60000)];
  if (end <= start) {
    t.skip('the meeting would cross midnight in the school zone');
    return;
  }
  const today = zonedDateKey(startedMinute, SCHOOL_TIME_ZONE);
  const lastWeek = zonedDateKey(startedMinute - 7 * 86400000, SCHOOL_TIME_ZONE);
  const ASSIGNMENT = `${CERT_PREFIX}sittingm`;
  const CLASS = 'cert-sittingm-class';
  const PERIOD = 'CERT SITTINGM Period';
  const SAT = 'CERT_SITTINGM_SAT';
  const ABSENT = 'CERT_SITTINGM_ABSENT';
  const sittingRef = db.collection(TEST_CYCLE_CLASS_SITTINGS).doc(classSittingId({ assignmentId: ASSIGNMENT, classId: CLASS, dateKey: today }));
  const pastRef = db.collection(TEST_CYCLE_CLASS_SITTINGS).doc(classSittingId({ assignmentId: ASSIGNMENT, classId: CLASS, dateKey: lastWeek }));
  const twoWeeksAgo = zonedDateKey(startedMinute - 14 * 86400000, SCHOOL_TIME_ZONE);
  t.after(async () => {
    const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT).get();
    await Promise.allSettled([
      db.collection('assignments').doc(ASSIGNMENT).delete(),
      db.collection('classes').doc(CLASS).delete(),
      sittingRef.delete(),
      pastRef.delete(),
      removeOwnSchedule(PERIOD),
      ...sessions.docs.map((doc) => doc.ref.delete()),
      ...[SAT, ABSENT].flatMap((studentId) => [
        db.collection('grades').doc(studentId).delete(),
        db.collection('testCycleRecords').doc(`${ASSIGNMENT}__${studentId}`).delete(),
        db.collection('testCycleCorrectionPlans').doc(`${ASSIGNMENT}__${studentId}`).delete(),
        db.collection('testCycleRetestPlans').doc(`${ASSIGNMENT}__${studentId}`).delete(),
      ]),
    ]);
  });

  await db.collection('classes').doc(CLASS).set({
    name: 'Certification Sitting M', course: 'algebra1', courseLevel: 'standard', period: PERIOD, teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  for (const studentId of [SAT, ABSENT]) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: studentId === SAT ? 'Sat Sitting Learner' : 'Absent Sitting Learner', classId: CLASS, classPeriod: PERIOD,
      assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
      gradesByAssignment: { [ASSIGNMENT]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
    });
  }
  await putOwnSchedule({ [today]: { periods: { [PERIOD]: { enabled: true, start, end } } } });
  await db.collection('assignments').doc(ASSIGNMENT).set({
    ...certAssignment({ classIds: [CLASS] }), id: ASSIGNMENT,
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: today, at: Date.now() }),
  });
  assert.equal((await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT, classId: CLASS }))).createdSessions, 2);
  const cardOf = (studentId) => fns.getStudentTestCycle.run(studentRequest(studentId, { assignmentId: ASSIGNMENT }));
  const classRow = async () => (await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: ASSIGNMENT })))
    .testSchedule.classes.find((entry) => entry.classId === CLASS);

  assert.equal((await sittingRef.get()).exists, false, 'nothing is recorded before anyone starts');
  const satCard = await cardOf(SAT);
  assert.deepEqual([satCard.stage, satCard.canEnter, satCard.schedule.test.state], ['test', true, 'open']);
  await fns.startSecureExamSession.run(studentRequest(SAT, { examSessionId: satCard.examSessionId }));
  const sitting = (await sittingRef.get()).data();
  assert.ok(sitting, 'the first start records the sitting');
  assert.deepEqual([sitting.assignmentId, sitting.classId, sitting.dateKey, sitting.period], [ASSIGNMENT, CLASS, today, PERIOD]);
  assert.deepEqual([sitting.opensAt, sitting.closesAt], [satCard.schedule.test.opensAt, satCard.schedule.test.closesAt], 'with the times the class sat');
  // Starting again (a resume) writes nothing new.
  await fns.startSecureExamSession.run(studentRequest(SAT, { examSessionId: satCard.examSessionId }));
  assert.equal((await sittingRef.get()).data().recordedAt, sitting.recordedAt);

  // Today's day stops resolving (the period is taken off the bell schedule)
  // and the meeting ends. The sitting is not read: the absent student is back
  // on the Test, waiting, not missed.
  await removeOwnSchedule(PERIOD);
  while (Date.now() <= sitting.closesAt + 500) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 1000); });
  }
  const waiting = await cardOf(ABSENT);
  assert.deepEqual([waiting.stage, waiting.schedule.test.state, waiting.schedule.missedTest], ['test', 'upcoming', false]);
  assert.equal((await readRecord(ASSIGNMENT, ABSENT)).retest.examSessionId || null, null, 'no stand-in Retest');

  // A PAST day with a recorded sitting that no longer resolves (the
  // reviewer's snow day: one start, then the day entered as a closure): it
  // is stranded exactly as on the base, the absent student is not missed,
  // and the panel asks the teacher for a new day.
  await pastRef.set({ ...sitting, dateKey: lastWeek, opensAt: sitting.opensAt - 7 * 86400000, closesAt: sitting.closesAt - 7 * 86400000 });
  await db.collection('assignments').doc(ASSIGNMENT).update({
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: lastWeek, at: sitting.opensAt - 8 * 86400000 }),
  });
  const stranded = await cardOf(ABSENT);
  assert.deepEqual([stranded.schedule.test.state, stranded.schedule.test.stranded, stranded.schedule.missedTest], ['upcoming', true, false]);
  assert.equal(stranded.schedule.test.headline, 'Waiting for a new Test day');
  const row = await classRow();
  assert.deepEqual([row.test.state, row.test.needsNewDay], ['upcoming', true], 'the teacher is asked for a new day');
  // …and is shown the sitting, to count it or not.
  assert.deepEqual(
    [row.test.sitting?.windowId, row.test.sitting?.dateKey, row.test.sitting?.started, row.test.sitting?.waiting],
    [`day-${lastWeek}`, lastWeek, 1, 1],
  );
  assert.match(row.test.headline, /^Class sat .+ \(1 started\)$/);
  assert.match(row.test.detail, /mark the student who did not start it as missed: they move to the Retest\. Otherwise set a new Test day\.$/);
  // Still nobody is missed until the teacher answers.
  assert.equal((await cardOf(ABSENT)).schedule.missedTest, false);

  // The teacher counts it: the day ran at the sitting's times, the absent
  // student missed it and is on the Retest, and the class is not flagged.
  const counted = await fns.updateTestCycleAvailability.run(teacherRequest({ assignmentId: ASSIGNMENT, action: 'countClassSitting', classId: CLASS, windowId: `day-${lastWeek}` }));
  assert.match(counted.notes.join(' '), /counts as this class's Test day .* Students who did not start it have missed it and move to the Retest\./);
  const [heldWindow] = counted.testAvailability.classWindows[CLASS];
  assert.deepEqual([heldWindow.held.opensAt, heldWindow.held.closesAt], [sitting.opensAt - 7 * 86400000, sitting.closesAt - 7 * 86400000]);
  const missed = await cardOf(ABSENT);
  assert.deepEqual([missed.schedule.test.state, missed.schedule.missedTest, missed.stage], ['closed', true, 'retest']);
  const after = await classRow();
  assert.deepEqual([after.test.state, after.test.needsNewDay, after.test.sitting], ['closed', false, null]);
  const history = (await db.collection('assignments').doc(ASSIGNMENT).get()).data().testAvailabilityHistory;
  assert.equal(history.at(-1).action, 'countClassSitting');
  // Counting it again is refused: the day has times now.
  const again = await refusal(fns.updateTestCycleAvailability.run(teacherRequest({ assignmentId: ASSIGNMENT, action: 'countClassSitting', classId: CLASS, windowId: `day-${lastWeek}` })));
  assert.equal(again?.code, 'failed-precondition');

  // A stranded day nobody started on has no sitting to count.
  await db.collection('assignments').doc(ASSIGNMENT).update({
    testAvailability: withClassTestDay(null, { classId: CLASS, dateKey: twoWeeksAgo, at: sitting.opensAt - 15 * 86400000 }),
  });
  const empty = await classRow();
  assert.equal(empty.test.sitting, null);
  const nothing = await refusal(fns.updateTestCycleAvailability.run(teacherRequest({ assignmentId: ASSIGNMENT, action: 'countClassSitting', classId: CLASS, windowId: `day-${twoWeeksAgo}` })));
  assert.equal(nothing?.code, 'failed-precondition');
  assert.match(nothing.message, /Nobody started the Test in this class period on .*, so there is no sitting to count\. Set a new Test day instead\./);
});

/*
 * N (student pass 3, wave 7, item 1): Corrections name the mistake made on a
 * real Test. Secure grading records the mistake a miss's work proves
 * (`grading.misconceptionEvidence`) on the server-only session; nothing the
 * student is handed carries it before release; after release the Corrections
 * plan names it. A Retest's responses record it the same way and hand it to
 * nobody. Line items, answered from the prompt as a student would: the right
 * line, in standard form where slope-intercept form was asked.
 */
test('N: a miss on the Test is recorded server-side, hidden until release, and named by Corrections after it', async (t) => {
  const ASSIGNMENT = `${CERT_PREFIX}mistaken`;
  const CLASS = 'cert-mistaken-class';
  const STUDENT = 'CERT_MISTAKEN_STUDENT';
  const familyIds = Array.from({ length: 6 }, (unused, index) => `${CERT_PREFIX}line-${index + 1}`);
  const LINE_PROMPT = /slope (\d+) and y-intercept (\d+)/;
  const lineFamily = (id, index) => ({
    active: true, validated: true, courseId: 'algebra1', alignmentKeys: ['texas:A.3C'],
    familyId: `${CERT_PREFIX}family:line-${index + 1}`, familyVersion: 1, questionType: 'response', activityRole: 'practice',
    dok: 2, difficultyBand: 2, representation: 'symbolic', calculatorPolicy: 'inherit', assessedConstruct: 'texas:A.3C', taskType: 'procedural',
    prompt: `Certification line ${index + 1}: the line has slope {{m}} and y-intercept {{b}}. Write its equation.`,
    responseFields: [{ id: 'answer', label: 'Equation in slope-intercept form', expected: 'y = {{m}}x + {{b}}' }],
    supportHints: ['Use y = mx + b.'],
    attemptFeedback: ['Write the slope and the y-intercept into y = mx + b.'],
    solutionReview: { headline: 'Use y = mx + b.', reasoning: ['m is the slope and b the y-intercept.'], answerSummary: 'y = {{m}}x + {{b}}' },
    generator: { parameters: { m: { type: 'int', min: 2, max: 9 }, b: { type: 'int', min: 2, max: 9 } } },
  });
  // Right line, wrong form: mx − y = −b.
  const standardForm = (prompt) => {
    const [, m, b] = LINE_PROMPT.exec(String(prompt)) || [];
    assert.ok(m && b, `a line prompt: ${prompt}`);
    return `${m}x - y = -${b}`;
  };
  t.after(async () => {
    const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT).get();
    await Promise.allSettled([
      db.collection('assignments').doc(ASSIGNMENT).delete(),
      db.collection('classes').doc(CLASS).delete(),
      db.collection('grades').doc(STUDENT).delete(),
      ...familyIds.map((id) => db.collection('pathQuestionBank').doc(id).delete()),
      ...sessions.docs.map((doc) => doc.ref.delete()),
      ...['testCycleRecords', 'testCycleCorrectionPlans', 'testCycleRetestPlans'].map((name) => db.collection(name).doc(`${ASSIGNMENT}__${STUDENT}`).delete()),
    ]);
  });
  await Promise.all(familyIds.map((id, index) => db.collection('pathQuestionBank').doc(id).set(lineFamily(id, index))));
  await db.collection('classes').doc(CLASS).set({
    name: 'Certification Mistaken', course: 'algebra1', courseLevel: 'standard', period: 'CERT MISTAKEN Period', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('grades').doc(STUDENT).set({
    displayName: 'Mistaken Line Learner', classId: CLASS, classPeriod: 'CERT MISTAKEN Period', assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
    gradesByAssignment: { [ASSIGNMENT]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  });
  const base = certAssignment({ classIds: [CLASS] });
  await db.collection('assignments').doc(ASSIGNMENT).set({
    ...base, id: ASSIGNMENT,
    assessmentPolicy: { ...base.assessmentPolicy, retest: { ...base.assessmentPolicy.retest, questionCount: 2 } },
    testBlueprint: {
      ...base.testBlueprint, blueprintId: `${CERT_PREFIX}blueprint-mistaken`,
      targets: [{ targetId: 'tL', alignmentKey: 'texas:A.3C', label: 'Writing linear equations', dok: 2, difficultyBand: 2, representation: 'symbolic', anchor: true, weight: 1, questionCount: 2, familyIds }],
    },
  });
  assert.equal((await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: ASSIGNMENT, classId: CLASS }))).createdSessions, 1);
  const cardOf = () => fns.getStudentTestCycle.run(studentRequest(STUDENT, { assignmentId: ASSIGNMENT }));
  const leaks = (value) => /misconception|line-wrong-form|path:fields|Right line, wrong form/i.test(JSON.stringify(value));

  // Sit a secure session, answering every item in the wrong form; every
  // payload the student is handed on the way is checked.
  const sitWrongForm = async (examSessionId, label) => {
    const handed = [await fns.startSecureExamSession.run(studentRequest(STUDENT, { examSessionId }))];
    for (let index = 0; index < 2; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      const question = await fns.issueSecureExamQuestion.run(studentRequest(STUDENT, { examSessionId }));
      handed.push(question);
      // eslint-disable-next-line no-await-in-loop
      handed.push(await fns.submitSecureExamResponse.run(studentRequest(STUDENT, {
        examSessionId,
        questionInstanceId: question.questionInstance.questionInstanceId,
        responsePayload: { responses: { answer: standardForm(question.questionInstance.prompt) } },
        submissionId: `cert-mistaken-${label}-${index + 1}`,
      })));
    }
    handed.push(await fns.finalizeSecureExam.run(studentRequest(STUDENT, { examSessionId, reason: 'studentSubmit' })));
    handed.push(await fns.listStudentSecureExamSessions.run(studentRequest(STUDENT, {})));
    handed.push(await cardOf());
    handed.push(await fns.getStudentSecureExamReview.run(studentRequest(STUDENT, { examSessionId })).catch((error) => ({ refused: String(error?.message || error) })));
    assert.equal(leaks(handed), false, `${label}: nothing the student is handed before release names the mistake`);
    // The server-only session holds it, on every miss.
    const responses = Object.values((await readSession(examSessionId)).responses || {});
    assert.equal(responses.length, 2);
    responses.forEach((response) => {
      assert.equal(response.grading.isCorrect, false, `${label}: the grader refused the unasked-for form`);
      assert.equal(response.grading.misconceptionEvidence?.classifier, 'path:fields', `${label}: recorded where it was graded`);
      assert.deepEqual(response.grading.misconceptionEvidence.findings.map((entry) => entry.code), ['line-wrong-form-slope-intercept']);
    });
  };

  const testCard = await cardOf();
  assert.deepEqual([testCard.stage, testCard.canEnter], ['test', true]);
  await sitWrongForm(testCard.examSessionId, 'Test');
  await releaseFeedback(testCard.examSessionId);
  const review = await fns.getStudentSecureExamReview.run(studentRequest(STUDENT, { examSessionId: testCard.examSessionId }));
  assert.equal(leaks(review), false, 'the released review copies the score, not the evidence');

  const corrections = await cardOf();
  assert.equal(corrections.stage, 'corrections');
  const [target] = corrections.corrections.targets;
  assert.deepEqual([target.diagnosis, target.misconception], ['misconception', 'line-wrong-form-slope-intercept'], 'Corrections names the mistake made on the Test');

  // The Retest: its responses are recorded the same way, and handed to nobody.
  assert.equal((await fns.teacherTestCycleAction.run(teacherRequest({ assignmentId: ASSIGNMENT, studentId: STUDENT, action: 'waiveCorrections' }))).retestOpened, true);
  const retestCard = await cardOf();
  assert.deepEqual([retestCard.stage, retestCard.canEnter], ['retest', true]);
  await sitWrongForm(retestCard.examSessionId, 'Retest');
});
