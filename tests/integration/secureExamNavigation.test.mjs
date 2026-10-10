/*
 * SECURE TEST NAVIGATION — skip, flag, go back, change an answer, then submit.
 *
 * HOW TO RUN:  npm run test:secure-exam-navigation   (Firestore emulator)
 *
 * The real Cloud Functions, against a real Firestore, driven the way the new
 * student screen drives them: issue a question by number, save drafts to any
 * open question, flag one, and finalize. What it proves:
 *
 *   - nothing is graded until finalize, and finalize grades EVERY issued item
 *     on the server (a blank one is recorded as unanswered, worth zero);
 *   - no navigation, save or flag response carries a verdict, an answer or a
 *     worked solution, and the answer key never sits on the session document;
 *   - the released review carries the answer and the worked solution, and only
 *     after release (a practice test releases itself; a course Test waits for
 *     the teacher);
 *   - a course Test still scores over its planned items and still plans
 *     Corrections from per-question results, skipped questions included;
 *   - a shortened practice test gets proportional time, and a student's
 *     extended-time accommodation multiplies it at start;
 *   - a Digital SAT practice test moves within a module;
 *   - a session written by the old linear runtime is upgraded in place without
 *     reopening anything it already recorded.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  CERT_ASSIGNMENT_ID, CERT_CLASS_ID, CERT_TOTAL_QUESTIONS, CERT_WRONG_ANSWER,
  certAnswerFromPrompt, certAssignment, certFamilies,
} from '../fixtures/testCycleCertificationFixture.mjs';
import {
  db, fns, readRecord, readCorrectionPlan, readSession, refusal, studentRequest, teacherRequest, TEACHER_EMAIL, OTHER_TEACHER_EMAIL,
} from './testCycleCertificationHarness.mjs';

const SIM_STUDENT = 'NAV_STUDENT_SIM';
const EXTRA_TIME_STUDENT = 'NAV_STUDENT_EXTRA_TIME';
const SAT_STUDENT = 'NAV_STUDENT_SAT';
const COURSE_STUDENT = 'NAV_STUDENT_COURSE';
const LEGACY_STUDENT = 'NAV_STUDENT_LEGACY';
const HISTORY_STUDENT = 'NAV_STUDENT_LONG_HISTORY';
const LATE_SAVE_STUDENT = 'NAV_STUDENT_LATE_SAVE';
const RESET_STUDENT = 'NAV_STUDENT_RESET';
const PAUSE_STUDENT = 'NAV_STUDENT_PAUSE';
const CLOCK_STUDENT = 'NAV_STUDENT_CLOCK';
const ALL = [SIM_STUDENT, EXTRA_TIME_STUDENT, SAT_STUDENT, COURSE_STUDENT, LEGACY_STUDENT, HISTORY_STUDENT, LATE_SAVE_STUDENT, RESET_STUDENT, PAUSE_STUDENT, CLOCK_STUDENT];
const created = [];

// A second Test Cycle assigned to two periods, for who the answers wait for.
const ROSTER_ASSIGNMENT_ID = 'nav_roster_test_cycle';
const ROSTER_P1 = 'NAV_ROSTER_P1';
const ROSTER_P3 = 'NAV_ROSTER_P3';
const ROSTER_A1 = 'NAV_ROSTER_A1';
const ROSTER_A2 = 'NAV_ROSTER_A2';
const ROSTER_B3 = 'NAV_ROSTER_B3';
const ROSTER_C3 = 'NAV_ROSTER_C3';
const ROSTER_STUDENTS = [ROSTER_A1, ROSTER_A2, ROSTER_B3, ROSTER_C3];
// A Test Cycle with more records than the teacher's table reads (400).
const CAP_ASSIGNMENT_ID = 'nav_cap_test_cycle';
const CAP_FILLERS = Array.from({ length: 400 }, (_, index) => `NAV_CAP_A${String(index).padStart(3, '0')}`);
const CAP_HOLDER = 'NAV_CAP_Z_MOVED';
// A one-student class, for the roster the review re-check caches.
const CACHE_ASSIGNMENT_ID = 'nav_cache_test_cycle';
const CACHE_CLASS = 'NAV_CACHE_CLASS';
const CACHE_FIRST = 'NAV_CACHE_S1';
const CACHE_JOINER = 'NAV_CACHE_S2';

const roster = (data) => teacherRequest({ assignmentId: ROSTER_ASSIGNMENT_ID, ...data });
const testSessionOf = async (studentId) => (await readRecord(ROSTER_ASSIGNMENT_ID, studentId)).test.examSessionId;
const sit = async (studentId, examSessionId) => {
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(studentId, { examSessionId }));
  await fns.finalizeSecureExam.run(student(studentId, { examSessionId }));
};
const reviewOf = async (studentId, examSessionId) => (await fns.getStudentSecureExamReview.run(student(studentId, { examSessionId }))).review;
const held = (review) => review.solutionsHeld === true && !review.items.some((item) => item.solution);
const answersRelease = async () => (await fns.listTeacherTestCycleRecords.run(roster({}))).answersRelease;

const student = (studentId, data) => studentRequest(studentId, data);
const issue = (studentId, examSessionId, extra = {}) => fns.issueSecureExamQuestion.run(student(studentId, { examSessionId, ...extra }));
const save = (studentId, data) => fns.saveSecureExamDraft.run(student(studentId, data));

/** The server-only item document — read here to check grading, never by a browser. */
const readItem = async (examSessionId, questionInstanceId) => (
  (await db.collection('examSessions').doc(examSessionId).collection('items').doc(questionInstanceId).get()).data()
);

/** A correct answer for a field item, from its server-only key (choice ids are runtime ids). */
const keyFor = async (examSessionId, questionInstanceId) => {
  const item = await readItem(examSessionId, questionInstanceId);
  const field = item.item.privateGrading.fields[0];
  return { fieldId: field.id, value: String(Array.isArray(field.expected) ? field.expected[0] : field.expected) };
};

const VERDICT_KEYS = /"(isCorrect|correctAnswer|expected|accepted|privateGrading|solutionReview|releasedSolution|answerKey|generatorParameters|grading)"/;
const assertNoVerdict = (payload, where) => {
  assert.doesNotMatch(JSON.stringify(payload), VERDICT_KEYS, `${where} must carry no verdict, key or solution`);
};

const index0 = (id) => 1_600_000_000_000 + Number(id.slice(-2));

const createSimulation = async (studentId, examType, questionCount, extra = {}) => {
  const result = await fns.createSecureExamSession.run(teacherRequest({ studentId, examType, questionCount, ...extra }));
  created.push(result.session.examSessionId);
  return result.session;
};

before(async () => {
  await Promise.all(certFamilies().map((family) => {
    const { id, ...fields } = family;
    return db.collection('pathQuestionBank').doc(id).set(fields);
  }));
  await db.collection('classes').doc(CERT_CLASS_ID).set({
    name: 'Navigation Algebra I', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await Promise.all(ALL.map((studentId) => db.collection('grades').doc(studentId).set({
    displayName: studentId, classId: CERT_CLASS_ID, classPeriod: 'Period 1',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
    ...(studentId === EXTRA_TIME_STUDENT
      ? { profile: { programEligibility: { section504: true }, accommodations: { extendedTimeMultiplier: 1.5 } } }
      : {}),
  })));
  await db.collection('assignments').doc(CERT_ASSIGNMENT_ID).set(certAssignment());
});

after(async () => {
  const deletions = [
    ...certFamilies().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    db.collection('assignments').doc(CERT_ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CERT_CLASS_ID).delete(),
    ...ALL.map((studentId) => db.collection('grades').doc(studentId).delete()),
    ...ALL.map((studentId) => db.collection('testCycleRecords').doc(`${CERT_ASSIGNMENT_ID}__${studentId}`).delete()),
    ...ALL.map((studentId) => db.collection('testCycleCorrectionPlans').doc(`${CERT_ASSIGNMENT_ID}__${studentId}`).delete()),
    db.collection('testCycleAnswerReleases').doc(CERT_ASSIGNMENT_ID).delete(),
    ...created.map((id) => db.collection('examSessions').doc(id).delete()),
    db.collection('assignments').doc(ROSTER_ASSIGNMENT_ID).delete(),
    db.collection('testCycleAnswerReleases').doc(ROSTER_ASSIGNMENT_ID).delete(),
    ...[ROSTER_P1, ROSTER_P3].map((classId) => db.collection('classes').doc(classId).delete()),
    ...ROSTER_STUDENTS.map((studentId) => db.collection('grades').doc(studentId).delete()),
    ...ROSTER_STUDENTS.map((studentId) => db.collection('testCycleRecords').doc(`${ROSTER_ASSIGNMENT_ID}__${studentId}`).delete()),
    ...ROSTER_STUDENTS.map((studentId) => db.collection('testCycleCorrectionPlans').doc(`${ROSTER_ASSIGNMENT_ID}__${studentId}`).delete()),
    ...ROSTER_STUDENTS.map((studentId) => db.collection('testCycleRetestPlans').doc(`${ROSTER_ASSIGNMENT_ID}__${studentId}`).delete()),
    db.collection('assignments').doc(CAP_ASSIGNMENT_ID).delete(),
    db.collection('testCycleAnswerReleases').doc(CAP_ASSIGNMENT_ID).delete(),
    ...[...CAP_FILLERS, CAP_HOLDER].map((studentId) => db.collection('testCycleRecords').doc(`${CAP_ASSIGNMENT_ID}__${studentId}`).delete()),
    db.collection('assignments').doc(CACHE_ASSIGNMENT_ID).delete(),
    db.collection('classes').doc(CACHE_CLASS).delete(),
    ...[CACHE_FIRST, CACHE_JOINER].map((studentId) => db.collection('grades').doc(studentId).delete()),
    ...[CACHE_FIRST, CACHE_JOINER].map((studentId) => db.collection('testCycleRecords').doc(`${CACHE_ASSIGNMENT_ID}__${studentId}`).delete()),
    ...[CACHE_FIRST, CACHE_JOINER].map((studentId) => db.collection('testCycleCorrectionPlans').doc(`${CACHE_ASSIGNMENT_ID}__${studentId}`).delete()),
  ];
  await Promise.allSettled(deletions);
});

/* ======================================================================== */

test('a shortened practice test gets proportional time and releases automatically by default', async () => {
  const session = await createSimulation(SIM_STUDENT, 'digitalSAT', 4);
  // 4 of 44 questions at 70 minutes is 6.36 minutes, rounded up to 7.
  assert.equal(session.timeLimitSeconds, 7 * 60);
  assert.equal(session.releasePolicy, 'automatic');
  const held = await createSimulation(SIM_STUDENT, 'act', 3, { releasePolicy: 'teacher' });
  assert.equal(held.releasePolicy, 'teacher');
  // 3 of 45 at 50 minutes = 3.33 → 4 minutes.
  assert.equal(held.timeLimitSeconds, 4 * 60);
});

test('extended time from the support profile multiplies the limit at start', async () => {
  const session = await createSimulation(EXTRA_TIME_STUDENT, 'digitalSAT', 4);
  // Before Start, the list already says how long the student will get.
  const listed = await fns.listStudentSecureExamSessions.run(student(EXTRA_TIME_STUDENT, {}));
  const preview = listed.sessions.find((entry) => entry.examSessionId === session.examSessionId);
  assert.equal(preview.timeLimitSeconds, 11 * 60);
  assert.equal(preview.extendedTimeMultiplier, 1.5);
  assert.equal(preview.baseTimeLimitSeconds, 7 * 60);
  assert.equal((await readSession(session.examSessionId)).timeLimitSeconds, 7 * 60, 'listing describes the time; it changes nothing');
  const started = await fns.startSecureExamSession.run(student(EXTRA_TIME_STUDENT, { examSessionId: session.examSessionId }));
  assert.equal(started.session.baseTimeLimitSeconds, 7 * 60);
  assert.equal(started.session.extendedTimeMultiplier, 1.5);
  // 7 × 1.5 = 10.5 minutes, rounded up to 11.
  assert.equal(started.session.timeLimitSeconds, 11 * 60);
  const restarted = await fns.startSecureExamSession.run(student(EXTRA_TIME_STUDENT, { examSessionId: session.examSessionId }));
  assert.equal(restarted.session.timeLimitSeconds, 11 * 60, 'resuming does not multiply again');
});

test("a practice test goes to the student's own teachers, and their extended time only to them", async () => {
  // EXTRA_TIME_STUDENT (1.5× time) is in TEACHER's class; OTHER_TEACHER owns no class.
  const theirs = await createSimulation(EXTRA_TIME_STUDENT, 'act', 2);
  await fns.startSecureExamSession.run(student(EXTRA_TIME_STUDENT, { examSessionId: theirs.examSessionId }));
  const byOther = (await fns.createSecureExamSession.run(teacherRequest({ studentId: EXTRA_TIME_STUDENT, examType: 'act', questionCount: 2 }, OTHER_TEACHER_EMAIL))).session;
  created.push(byOther.examSessionId);
  await fns.startSecureExamSession.run(student(EXTRA_TIME_STUDENT, { examSessionId: byOther.examSessionId }));

  const own = await fns.listProctorExamSessions.run(teacherRequest({}));
  assert.equal(own.sessions.find((row) => row.examSessionId === theirs.examSessionId)?.extendedTimeMultiplier, 1.5, "the student's own teacher sees the accommodation");

  const other = await fns.listProctorExamSessions.run(teacherRequest({}, OTHER_TEACHER_EMAIL));
  assert.equal(other.sessions.some((row) => row.examSessionId === theirs.examSessionId), false, "another teacher does not see this student's practice test");
  const createdRow = other.sessions.find((row) => row.examSessionId === byOther.examSessionId);
  assert.ok(createdRow, 'a teacher still sees a practice test they created');
  assert.equal('extendedTimeMultiplier' in createdRow, false, "but not the student's accommodation");
  assert.equal('baseTimeLimitSeconds' in createdRow, false);

  // Proctoring follows the same line. OTHER_TEACHER neither set `theirs` nor teaches its student.
  for (const action of ['lock', 'extendTime', 'forceSubmit']) {
    // eslint-disable-next-line no-await-in-loop
    const denied = await refusal(fns.proctorExamAction.run(teacherRequest({ examSessionId: theirs.examSessionId, action, minutes: 5 }, OTHER_TEACHER_EMAIL)));
    assert.equal(denied?.code, 'permission-denied', `another teacher cannot ${action} this student's practice test`);
  }
  assert.equal((await readSession(theirs.examSessionId)).status, 'in_progress', 'nothing changed');
  // The teacher who set `byOther` proctors it, and gets back the time a proctor needs, not the accommodation.
  const locked = await fns.proctorExamAction.run(teacherRequest({ examSessionId: byOther.examSessionId, action: 'lock' }, OTHER_TEACHER_EMAIL));
  assert.equal(locked.session.status, 'locked_proctor');
  assert.equal('extendedTimeMultiplier' in locked.session, false, "the creator's proctor response carries no accommodation");
  assert.equal('baseTimeLimitSeconds' in locked.session, false);
  assert.ok(Number(locked.session.timeLimitSeconds) > 0 && Number(locked.session.expiresAt) > 0, 'the time limit and deadline stay');
  const unlocked = await fns.proctorExamAction.run(teacherRequest({ examSessionId: byOther.examSessionId, action: 'unlock' }));
  assert.equal(unlocked.session.extendedTimeMultiplier, 1.5, "the student's own teacher gets it");
});

test('skip, flag, go back and change an answer — graded once, on the server, at submit', async () => {
  const session = await createSimulation(SIM_STUDENT, 'tsia2', 3);
  const examSessionId = session.examSessionId;
  await fns.startSecureExamSession.run(student(SIM_STUDENT, { examSessionId }));

  const first = await issue(SIM_STUDENT, examSessionId, { position: 0 });
  assert.equal(first.position, 0);
  assertNoVerdict(first.questionInstance, 'an issued question');
  const firstId = first.questionInstance.questionInstanceId;
  const firstKey = await keyFor(examSessionId, firstId);

  // A WRONG first draft, then skip ahead to question 2 without answering it.
  await save(SIM_STUDENT, { examSessionId, questionInstanceId: firstId, responsePayload: { responses: { [firstKey.fieldId]: CERT_WRONG_ANSWER } } });
  const second = await issue(SIM_STUDENT, examSessionId, { position: 1 });
  const secondId = second.questionInstance.questionInstanceId;
  assert.notEqual(secondId, firstId);
  const flagged = await save(SIM_STUDENT, { examSessionId, questionInstanceId: secondId, flagged: true });
  assertNoVerdict(flagged, 'a flag response');
  assert.deepEqual(
    flagged.navigation.items.map((item) => [item.position, item.status, item.flagged]),
    [[0, 'answered', false], [1, 'unanswered', true]],
  );

  // Jumping past the next unopened question is refused: items are issued as reached.
  const offTest = await refusal(issue(SIM_STUDENT, examSessionId, { position: 3 }));
  assert.equal(offTest?.code, 'invalid-argument', 'position 3 is not on a 3-question test');
  // Skip question 2 as well: opening question 3 is the next unopened one.
  const third = await issue(SIM_STUDENT, examSessionId, { position: 2 });
  assert.equal(third.position, 2);

  // Back to question 1: the saved draft comes back, and is changed to the right answer.
  const back = await issue(SIM_STUDENT, examSessionId, { position: 0 });
  assert.equal(back.questionInstance.questionInstanceId, firstId);
  assert.equal(back.draftResponse.responsePayload.responses[firstKey.fieldId], CERT_WRONG_ANSWER);
  const changed = await save(SIM_STUDENT, { examSessionId, questionInstanceId: firstId, responsePayload: { responses: { [firstKey.fieldId]: firstKey.value } } });
  assertNoVerdict(changed, 'a save response');
  assert.equal(changed.answeredQuestions, 1);

  // A flag sent alone keeps the saved answer.
  await save(SIM_STUDENT, { examSessionId, questionInstanceId: firstId, flagged: true });
  assert.equal((await readItem(examSessionId, firstId)).draftResponse.responsePayload.responses[firstKey.fieldId], firstKey.value);

  // Nothing graded yet; the session document holds no key.
  const before = await readSession(examSessionId);
  assert.deepEqual(before.responses, {});
  assert.doesNotMatch(JSON.stringify(before), /privateGrading/, 'the answer key lives only in the item documents');
  assert.equal(before.summary.completedQuestions, 1);

  const finalized = await fns.finalizeSecureExam.run(student(SIM_STUDENT, { examSessionId, reason: 'studentSubmit' }));
  assert.equal(finalized.session.status, 'submitted');
  const stored = await readSession(examSessionId);
  assert.equal(Object.keys(stored.responses).length, 3, 'every issued question is recorded');
  assert.equal(stored.responses[firstId].grading.isCorrect, true, 'the CHANGED answer is the one graded');
  assert.equal(stored.responses[secondId].unanswered, true);
  assert.equal(stored.responses[secondId].grading.score, 0);
  // Practice tests are scored over every planned question: 1 of 3.
  assert.equal(finalized.session.feedbackReleased, true, 'a practice test releases itself');

  // Editing after submit is refused.
  const late = await refusal(save(SIM_STUDENT, { examSessionId, questionInstanceId: firstId, responsePayload: { responses: { [firstKey.fieldId]: '0' } } }));
  assert.equal(late?.code, 'failed-precondition');

  const { review } = await fns.getStudentSecureExamReview.run(student(SIM_STUDENT, { examSessionId }));
  assert.equal(review.scorePercent, 33);
  assert.equal(review.scoreBasis, 'planned');
  assert.equal(review.correctQuestions, 1);
  assert.equal(review.answeredQuestions, 1);
  assert.deepEqual(review.items.map((item) => item.position), [0, 1, 2]);
  const reviewed = review.items[0];
  assert.ok(reviewed.solution?.answers?.length, 'the released review carries the correct answer');
  assert.ok(reviewed.solution.answers[0].display, 'as display text');
  assert.equal(review.items[1].unanswered, true);

  // A second TSIA2 practice test under way closes these answers until it is submitted.
  const second2 = await createSimulation(SIM_STUDENT, 'tsia2', 2);
  const notStarted = await fns.getStudentSecureExamReview.run(student(SIM_STUDENT, { examSessionId }));
  assert.ok(notStarted.review, 'an unstarted practice test does not close the review');
  await fns.startSecureExamSession.run(student(SIM_STUDENT, { examSessionId: second2.examSessionId }));
  const closed = await refusal(fns.getStudentSecureExamReview.run(student(SIM_STUDENT, { examSessionId })));
  assert.equal(closed?.code, 'failed-precondition');
  assert.match(closed.message, /practice test you have started/i);
  await fns.finalizeSecureExam.run(student(SIM_STUDENT, { examSessionId: second2.examSessionId }));
  const reopened = await fns.getStudentSecureExamReview.run(student(SIM_STUDENT, { examSessionId }));
  assert.ok(reopened.review.items.length === 3, 'and opens again once that test is submitted');
});

test('an older draft save that lands after a newer one is not written: finalize grades what the student typed last', async () => {
  const { examSessionId } = await createSimulation(LATE_SAVE_STUDENT, 'tsia2', 1);
  await fns.startSecureExamSession.run(student(LATE_SAVE_STUDENT, { examSessionId }));
  const opened = await issue(LATE_SAVE_STUDENT, examSessionId, { position: 0 });
  const questionInstanceId = opened.questionInstance.questionInstanceId;
  const key = await keyFor(examSessionId, questionInstanceId);
  const answer = (value) => ({ examSessionId, questionInstanceId, responsePayload: { responses: { [key.fieldId]: value } } });
  const page = 'page_latesave01';

  // Revision 2 (the right answer) lands first; revision 1 (typed before it) arrives late.
  await save(LATE_SAVE_STUDENT, { ...answer(key.value), draftWriter: page, draftRevision: 2 });
  const late = await save(LATE_SAVE_STUDENT, { ...answer(CERT_WRONG_ANSWER), draftWriter: page, draftRevision: 1 });
  assert.equal(late.stale, true, 'the late save is reported as not written');
  assert.equal((await readItem(examSessionId, questionInstanceId)).draftResponse.responsePayload.responses[key.fieldId], key.value);

  await fns.finalizeSecureExam.run(student(LATE_SAVE_STUDENT, { examSessionId }));
  const stored = (await db.collection('examSessions').doc(examSessionId).get()).data();
  assert.equal(stored.responses[questionInstanceId].grading.isCorrect, true, 'the newest answer is the one graded');
});

test('a draft from another page (a reload, another device) is still written over this one', async () => {
  const { examSessionId } = await createSimulation(LATE_SAVE_STUDENT, 'tsia2', 1);
  await fns.startSecureExamSession.run(student(LATE_SAVE_STUDENT, { examSessionId }));
  const opened = await issue(LATE_SAVE_STUDENT, examSessionId, { position: 0 });
  const questionInstanceId = opened.questionInstance.questionInstanceId;
  const key = await keyFor(examSessionId, questionInstanceId);
  const answer = (value) => ({ examSessionId, questionInstanceId, responsePayload: { responses: { [key.fieldId]: value } } });
  await save(LATE_SAVE_STUDENT, { ...answer(CERT_WRONG_ANSWER), draftWriter: 'page_firstdevice', draftRevision: 9 });
  const other = await save(LATE_SAVE_STUDENT, { ...answer(key.value), draftWriter: 'page_seconddevice', draftRevision: 1 });
  assert.notEqual(other.stale, true);
  assert.equal((await readItem(examSessionId, questionInstanceId)).draftResponse.responsePayload.responses[key.fieldId], key.value);
  // And a save with no stamp at all (an older client) is written as before.
  await save(LATE_SAVE_STUDENT, answer(CERT_WRONG_ANSWER));
  assert.equal((await readItem(examSessionId, questionInstanceId)).draftResponse.responsePayload.responses[key.fieldId], CERT_WRONG_ANSWER);
});

test('the practice-test open-book gate sees every session of that exam, however long the history', async () => {
  // Fifty-five old sessions of another exam whose ids sort before any
  // generated id: a query capped at 50 reads only these, never the TSIA2
  // test under way, and would hand out the released answers beside it.
  const history = Array.from({ length: 55 }, (_, index) => `0000navhistory${String(index).padStart(2, '0')}`);
  await Promise.all(history.map((id) => db.collection('examSessions').doc(id).set({
    studentId: HISTORY_STUDENT, examType: 'act', status: 'submitted', createdAt: index0(id),
  })));
  created.push(...history);

  const released = await createSimulation(HISTORY_STUDENT, 'tsia2', 1);
  await fns.startSecureExamSession.run(student(HISTORY_STUDENT, { examSessionId: released.examSessionId }));
  await fns.finalizeSecureExam.run(student(HISTORY_STUDENT, { examSessionId: released.examSessionId }));
  assert.ok((await fns.getStudentSecureExamReview.run(student(HISTORY_STUDENT, { examSessionId: released.examSessionId }))).review, 'released automatically');

  const underWay = await createSimulation(HISTORY_STUDENT, 'tsia2', 1);
  await fns.startSecureExamSession.run(student(HISTORY_STUDENT, { examSessionId: underWay.examSessionId }));
  const closed = await refusal(fns.getStudentSecureExamReview.run(student(HISTORY_STUDENT, { examSessionId: released.examSessionId })));
  assert.equal(closed?.code, 'failed-precondition', 'the test under way closes the released answers, wherever its id sorts');
  assert.match(closed.message, /practice test you have started/i);
});

test('a held practice test reveals nothing until the teacher releases it', async () => {
  const session = await createSimulation(SIM_STUDENT, 'act', 2, { releasePolicy: 'teacher' });
  const examSessionId = session.examSessionId;
  await fns.startSecureExamSession.run(student(SIM_STUDENT, { examSessionId }));
  const first = await issue(SIM_STUDENT, examSessionId, { position: 0 });
  const key = await keyFor(examSessionId, first.questionInstance.questionInstanceId);
  await save(SIM_STUDENT, { examSessionId, questionInstanceId: first.questionInstance.questionInstanceId, responsePayload: { responses: { [key.fieldId]: key.value } } });
  const finalized = await fns.finalizeSecureExam.run(student(SIM_STUDENT, { examSessionId }));
  assert.equal(finalized.session.feedbackReleased, false);
  assertNoVerdict(finalized, 'a finalize response');
  const held = await refusal(fns.getStudentSecureExamReview.run(student(SIM_STUDENT, { examSessionId })));
  assert.equal(held?.code, 'failed-precondition');
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'releaseFeedback' }));
  const { review } = await fns.getStudentSecureExamReview.run(student(SIM_STUDENT, { examSessionId }));
  assert.equal(review.correctQuestions, 1);
  assert.equal(review.scorePercent, 50, 'one of two PLANNED questions — the unopened one counts zero');
});

test('the integrity response warns one event before the lock', async () => {
  const session = await createSimulation(SIM_STUDENT, 'act', 2);
  const examSessionId = session.examSessionId;
  await fns.startSecureExamSession.run(student(SIM_STUDENT, { examSessionId }));
  const record = (eventId) => fns.recordSecureExamIntegrityEvent.run(student(SIM_STUDENT, { examSessionId, eventId, type: 'tab_switch' }));
  const one = await record('nav-e1');
  assert.equal(one.warning, false);
  const two = await record('nav-e2');
  assert.equal(two.warning, true, 'the second event warns that the next one pauses the test');
  assert.equal(two.lockThreshold, 3);
  const three = await record('nav-e3');
  assert.equal(three.status, 'locked_integrity');
  const blocked = await refusal(issue(SIM_STUDENT, examSessionId, { position: 0 }));
  assert.equal(blocked?.code, 'failed-precondition');
});

test('a Digital SAT practice test moves within a module, and closing module 1 is explicit', async () => {
  const session = await createSimulation(SAT_STUDENT, 'digitalSAT', 4);
  const examSessionId = session.examSessionId;
  const started = await fns.startSecureExamSession.run(student(SAT_STUDENT, { examSessionId }));
  assert.deepEqual(started.session.navigation.modules.map((module) => [module.start, module.end]), [[0, 2], [2, 4]]);
  await issue(SAT_STUDENT, examSessionId, { position: 0 });
  await issue(SAT_STUDENT, examSessionId, { position: 1 });
  const unconfirmed = await refusal(issue(SAT_STUDENT, examSessionId, { position: 2 }));
  assert.equal(unconfirmed?.code, 'failed-precondition');
  assert.match(unconfirmed.message, /end of module 1/i);
  const third = await issue(SAT_STUDENT, examSessionId, { position: 2, closeModule: true });
  assert.equal(third.position, 2);
  assert.equal(third.session.navigation.modules[0].closed, true);
  const back = await refusal(issue(SAT_STUDENT, examSessionId, { position: 0 }));
  assert.equal(back?.code, 'failed-precondition');
  assert.match(back.message, /module is finished/i);
  // A closed module's drafts cannot be edited either.
  const closedId = third.session.navigation.items[0].questionInstanceId;
  const edit = await refusal(save(SAT_STUDENT, { examSessionId, questionInstanceId: closedId, responsePayload: { responses: { answer: '1' } } }));
  assert.equal(edit?.code, 'failed-precondition');
  await fns.finalizeSecureExam.run(student(SAT_STUDENT, { examSessionId }));
  const stored = await readSession(examSessionId);
  assert.equal(Object.keys(stored.responses).length, 3, 'module 1 items are graded at finalize like any other');
});

test('a course Test: skipped questions are zero over the PLAN, held until release, and feed Corrections', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, classId: CERT_CLASS_ID }));
  await db.collection('grades').doc(COURSE_STUDENT).set({
    gradesByAssignment: { [CERT_ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  }, { merge: true });
  const record = await readRecord(CERT_ASSIGNMENT_ID, COURSE_STUDENT);
  const examSessionId = record.test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(COURSE_STUDENT, { examSessionId }));

  // Open the first four questions, answering 1 and 3 correctly and skipping 2 and 4,
  // then go back and answer question 2.
  const opened = [];
  for (let position = 0; position < 4; position += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await issue(COURSE_STUDENT, examSessionId, { position });
    assertNoVerdict(result.questionInstance, 'a course-test question');
    opened.push(result.questionInstance);
    if (position % 2 === 0) {
      // eslint-disable-next-line no-await-in-loop
      await save(COURSE_STUDENT, { examSessionId, questionInstanceId: result.questionInstance.questionInstanceId, responsePayload: { responses: { answer: certAnswerFromPrompt(result.questionInstance.prompt) } } });
    }
  }
  const revisit = await issue(COURSE_STUDENT, examSessionId, { position: 1 });
  assert.equal(revisit.questionInstance.questionInstanceId, opened[1].questionInstanceId);
  await save(COURSE_STUDENT, { examSessionId, questionInstanceId: opened[1].questionInstanceId, responsePayload: { responses: { answer: certAnswerFromPrompt(opened[1].prompt) } } });

  // The card tells a student with extended time what they will get; the
  // blueprint's 45 minutes for everyone else.
  const extraCard = await fns.getStudentTestCycle.run(student(EXTRA_TIME_STUDENT, { assignmentId: CERT_ASSIGNMENT_ID }));
  assert.equal(extraCard.delivery.timeLimitMinutes, 68, '45 × 1.5 = 67.5, rounded up to the minute');
  assert.equal(extraCard.delivery.baseTimeLimitMinutes, 45);
  const plainCard = await fns.getStudentTestCycle.run(student(COURSE_STUDENT, { assignmentId: CERT_ASSIGNMENT_ID }));
  assert.equal(plainCard.delivery.timeLimitMinutes, 45);
  assert.equal('extendedTimeMultiplier' in plainCard.delivery, false);
  assert.ok(plainCard.testSkills.length > 0 && plainCard.testSkills.every((skill) => skill.questionCount > 0), "the card lists what's on the test");
  assert.doesNotMatch(JSON.stringify(plainCard.testSkills), /familyIds|seedKey|cert_family/, 'skills only — no families or seeds');

  // The teacher's table reads the answered count while the test is open.
  assert.equal((await readRecord(CERT_ASSIGNMENT_ID, COURSE_STUDENT)).test.answeredQuestions, 3);
  const midSession = await readSession(examSessionId);
  const issuedSlots = midSession.issuancePlan.entries.filter((entry) => entry.questionInstanceId).length;
  assert.equal(issuedSlots, 4, 'each issued question is joined to its blueprint slot');

  const finalized = await fns.finalizeSecureExam.run(student(COURSE_STUDENT, { examSessionId }));
  assert.equal(finalized.session.feedbackReleased, false, 'a course Test waits for the teacher');
  const stored = await readSession(examSessionId);
  assert.equal(Object.keys(stored.responses).length, 4);
  assert.equal(stored.responses[opened[3].questionInstanceId].unanswered, true);
  assert.equal(Object.values(stored.responses).filter((response) => response.grading.isCorrect).length, 3);

  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'releaseFeedback' }));
  const released = await readRecord(CERT_ASSIGNMENT_ID, COURSE_STUDENT);
  assert.equal(released.test.state, 'released');
  // 3 correct of 25 planned, equally weighted.
  assert.equal(released.test.rawScore, Math.round((3 / CERT_TOTAL_QUESTIONS) * 100));
  const { review } = await fns.getStudentSecureExamReview.run(student(COURSE_STUDENT, { examSessionId }));
  assert.equal(review.scoreBasis, 'plannedWeighted');
  assert.equal(review.possiblePoints, CERT_TOTAL_QUESTIONS);
  assert.equal(review.earnedPoints, 3);
  // Classmates are still assigned this Test: the score and the student's own
  // answers release, the correct answers and worked solutions wait.
  assert.equal(review.solutionsHeld, true, 'answers and worked solutions wait while classmates can still sit the Test');
  assert.equal(review.items.some((item) => item.solution), false);
  const listing = await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID }));
  assert.equal(listing.answersRelease.test.released, false);
  assert.ok(listing.answersRelease.test.stillTesting > 0, 'the teacher is told how many are still testing');
  // The teacher releases them explicitly, for the students the confirm named; the review now carries them.
  await fns.releaseTestCycleAnswers.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, stage: 'test', confirmed: listing.answersRelease.test.confirmKeys }));
  const withAnswers = await fns.getStudentSecureExamReview.run(student(COURSE_STUDENT, { examSessionId }));
  assert.equal(withAnswers.review.solutionsHeld, undefined);
  assert.ok(withAnswers.review.items[0].solution?.answers?.[0]?.display, 'the worked answer is released with the teacher\'s release');
  const plan = await readCorrectionPlan(CERT_ASSIGNMENT_ID, COURSE_STUDENT);
  assert.ok(plan?.plan?.targets?.length > 0, 'Corrections are planned from the per-question results');

  // While a Retest is open the Test's worked solutions are not an open book.
  const recordRef = db.collection('testCycleRecords').doc(`${CERT_ASSIGNMENT_ID}__${COURSE_STUDENT}`);
  const stored2 = (await recordRef.get()).data();
  for (const state of ['assigned', 'inProgress']) {
    // eslint-disable-next-line no-await-in-loop
    await recordRef.set({ ...stored2, retest: { ...(stored2.retest || {}), state, examSessionId: 'nav-retest-session' } });
    // eslint-disable-next-line no-await-in-loop
    const closed = await refusal(fns.getStudentSecureExamReview.run(student(COURSE_STUDENT, { examSessionId })));
    assert.equal(closed?.code, 'failed-precondition', `the Test review is closed while the Retest is ${state}`);
    assert.match(closed.message, /finish your Retest/i);
  }
  await recordRef.set({ ...stored2, retest: { ...(stored2.retest || {}), state: 'submitted', examSessionId: 'nav-retest-session' } });
  const reopened = await fns.getStudentSecureExamReview.run(student(COURSE_STUDENT, { examSessionId }));
  assert.ok(reopened.review.items.length > 0, 'and opens again once the Retest is submitted');
  await recordRef.set(stored2);
});

test('the answers wait for everyone the Test is assigned to: a period with no sessions open, a student who joins later, a reset', async () => {
  await Promise.all([ROSTER_P1, ROSTER_P3].map((classId, index) => db.collection('classes').doc(classId).set({
    name: `Roster Algebra I ${index ? 'P3' : 'P1'}`, course: 'algebra1', courseLevel: 'standard',
    period: index ? 'Period 3' : 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  })));
  const enroll = (studentId, classId) => db.collection('grades').doc(studentId).set({
    displayName: studentId, classId, classPeriod: classId === ROSTER_P1 ? 'Period 1' : 'Period 3',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
    // Review done, so the Test can be started.
    gradesByAssignment: { [ROSTER_ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  });
  await Promise.all([enroll(ROSTER_A1, ROSTER_P1), enroll(ROSTER_A2, ROSTER_P1), enroll(ROSTER_B3, ROSTER_P3)]);
  await db.collection('assignments').doc(ROSTER_ASSIGNMENT_ID).set({ ...certAssignment({ classIds: [ROSTER_P1, ROSTER_P3] }), id: ROSTER_ASSIGNMENT_ID });

  // Only period 1's sessions are open. Both period-1 students sit the Test and get their results.
  await fns.assignTestCycleSessions.run(roster({ classId: ROSTER_P1 }));
  const a1Test = await testSessionOf(ROSTER_A1);
  await sit(ROSTER_A1, a1Test);
  await sit(ROSTER_A2, await testSessionOf(ROSTER_A2));
  await fns.releaseTestCycleResults.run(roster({ stage: 'test' }));

  // B3, in period 3, has no session and no record yet: the answers wait for them.
  assert.ok(held(await reviewOf(ROSTER_A1, a1Test)), 'held while a period-3 student with no record can still sit the Test');
  let release = await answersRelease();
  assert.equal(release.test.released, false);
  assert.deepEqual(release.test.stillTestingIds, [ROSTER_B3], 'the teacher is shown exactly who is still testing');

  // A release that does not name everyone still testing opens nothing.
  const unnamed = await refusal(fns.releaseTestCycleAnswers.run(roster({ stage: 'test', confirmed: [] })));
  assert.equal(unnamed?.code, 'failed-precondition', 'a release must name every student still testing');
  assert.match(unnamed.message, /not on the list you confirmed/);
  assert.ok(held(await reviewOf(ROSTER_A1, a1Test)), 'and nothing was released');
  await fns.releaseTestCycleAnswers.run(roster({ stage: 'test', confirmed: release.test.confirmKeys }));
  assert.ok((await reviewOf(ROSTER_A1, a1Test)).items.every((item) => item.solution), 'the named release opens the answers');

  // C3 joins period 3 after the release. Nobody confirmed them: the answers wait again.
  await enroll(ROSTER_C3, ROSTER_P3);
  assert.ok(held(await reviewOf(ROSTER_A1, a1Test)), 'a student who joined after the release holds the answers again');
  release = await answersRelease();
  assert.deepEqual([...release.test.stillTestingIds].sort(), [ROSTER_B3, ROSTER_C3]);
  await fns.releaseTestCycleAnswers.run(roster({ stage: 'test', confirmed: release.test.confirmKeys }));
  assert.ok(!held(await reviewOf(ROSTER_A1, a1Test)), 'released again once the teacher names them');

  // Period 3's sessions open; B3 sits the Test. A reset gives B3 an attempt nobody confirmed.
  await fns.assignTestCycleSessions.run(roster({ classId: ROSTER_P3 }));
  await sit(ROSTER_B3, await testSessionOf(ROSTER_B3));
  assert.ok(!held(await reviewOf(ROSTER_A1, a1Test)));
  await fns.teacherTestCycleAction.run(roster({ studentId: ROSTER_B3, action: 'resetSecureSession', stage: 'test' }));
  created.push(await testSessionOf(ROSTER_B3), await testSessionOf(ROSTER_C3));
  assert.ok(held(await reviewOf(ROSTER_A1, a1Test)), "a reset student's new attempt holds the answers again");
  release = await answersRelease();
  assert.deepEqual([...release.test.stillTestingIds].sort(), [ROSTER_B3, ROSTER_C3]);
  assert.equal(release.test.heldFor, 1, 'C3 is still covered by the release; B3 is not');
});

test("Corrections close while the student's own Retest is open, and while the Test Cycle is paused", async () => {
  // A1 and A2 both scored below passing: both are in Corrections.
  const correctionOf = async (studentId) => (await readCorrectionPlan(ROSTER_ASSIGNMENT_ID, studentId)).plan.targets[0].correctionId;
  const issueCorrection = (studentId, correctionId) => fns.issueTestCycleCorrectionQuestion.run(student(studentId, { assignmentId: ROSTER_ASSIGNMENT_ID, correctionId }));
  const answerCorrection = (studentId, correctionId, questionInstanceId) => fns.submitTestCycleCorrectionResponse.run(student(studentId, {
    assignmentId: ROSTER_ASSIGNMENT_ID, correctionId, questionInstanceId, responsePayload: { responses: { answer: CERT_WRONG_ANSWER } },
  }));

  // Paused: A2's open correction question takes no response.
  const a2Correction = await correctionOf(ROSTER_A2);
  const a2Question = (await issueCorrection(ROSTER_A2, a2Correction)).questionInstance;
  const assignmentRef = db.collection('assignments').doc(ROSTER_ASSIGNMENT_ID);
  await assignmentRef.set({ unpublished: true }, { merge: true });
  try {
    const paused = await refusal(answerCorrection(ROSTER_A2, a2Correction, a2Question.questionInstanceId));
    assert.equal(paused?.code, 'failed-precondition', 'no correction responses while the teacher has the Test Cycle paused');
  } finally {
    await assignmentRef.set({ unpublished: false }, { merge: true });
  }

  // A1 has a correction question open when the teacher waives corrections and the Retest opens.
  const a1Correction = await correctionOf(ROSTER_A1);
  const a1Question = (await issueCorrection(ROSTER_A1, a1Correction)).questionInstance;
  await fns.teacherTestCycleAction.run(roster({ studentId: ROSTER_A1, action: 'waiveCorrections' }));
  const a1Retest = (await readRecord(ROSTER_ASSIGNMENT_ID, ROSTER_A1)).retest.examSessionId;
  assert.ok(a1Retest, 'waiving corrections opens the retest');
  created.push(a1Retest);
  for (const when of ['assigned', 'under way']) {
    // eslint-disable-next-line no-await-in-loop
    if (when === 'under way') await fns.startSecureExamSession.run(student(ROSTER_A1, { examSessionId: a1Retest }));
    // eslint-disable-next-line no-await-in-loop
    const issued = await refusal(issueCorrection(ROSTER_A1, a1Correction));
    assert.equal(issued?.code, 'failed-precondition', `no correction question while the Retest is ${when}`);
    assert.match(issued.message, /closed while your Retest is open/);
    // Three misses would hand over the worked solution: not one response is taken.
    // eslint-disable-next-line no-await-in-loop
    const answered = await refusal(answerCorrection(ROSTER_A1, a1Correction, a1Question.questionInstanceId));
    assert.equal(answered?.code, 'failed-precondition', `no correction response while the Retest is ${when}`);
  }
  await fns.finalizeSecureExam.run(student(ROSTER_A1, { examSessionId: a1Retest }));
});

test('the Retest answers wait while anyone can still take a Retest: a student in Corrections, or yet to finish the Test', async () => {
  const a1Retest = (await readRecord(ROSTER_ASSIGNMENT_ID, ROSTER_A1)).retest.examSessionId;
  await fns.releaseTestCycleResults.run(roster({ stage: 'retest' }));
  assert.equal((await readRecord(ROSTER_ASSIGNMENT_ID, ROSTER_A2)).corrections.required, true, 'A2 owes corrections');
  assert.ok(held(await reviewOf(ROSTER_A1, a1Retest)), 'the retest answers wait while a student in Corrections can still retest');
  const release = await answersRelease();
  assert.equal(release.retest.released, false);
  assert.deepEqual([...release.retest.stillTestingIds].sort(), [ROSTER_A2, ROSTER_B3, ROSTER_C3],
    'in Corrections, or yet to finish the Test: all can still take a Retest');
});

test('a release confirmed before a reset does not cover the new attempt, however the two interleave', async () => {
  // C3 is still on attempt 1. The teacher loads the list, then C3's Test is reset.
  const before = (await answersRelease()).test;
  const c3Before = before.confirmKeys.find((key) => key.startsWith(`${ROSTER_C3}#`));
  assert.ok(c3Before?.endsWith('#1.1'), `C3 is listed at attempt 1 (${c3Before})`);
  await fns.teacherTestCycleAction.run(roster({ studentId: ROSTER_C3, action: 'resetSecureSession', stage: 'test' }));
  created.push(await testSessionOf(ROSTER_C3));
  // The list the teacher confirmed named attempt 1: the release is refused.
  const stale = await refusal(fns.releaseTestCycleAnswers.run(roster({ stage: 'test', confirmed: before.confirmKeys })));
  assert.equal(stale?.code, 'failed-precondition', 'a confirm taken before the reset releases nothing');
  // The race: a release that read the records just before the reset and wrote
  // just after it stores the old attempt — which does not cover the new one.
  await db.collection('testCycleAnswerReleases').doc(ROSTER_ASSIGNMENT_ID).set({
    assignmentId: ROSTER_ASSIGNMENT_ID, test: { releasedAt: Date.now(), releasedBy: 'uid-race', coveredKeys: before.confirmKeys },
  }, { merge: true });
  const a1Test = (await readRecord(ROSTER_ASSIGNMENT_ID, ROSTER_A1)).test.examSessionId;
  assert.ok(held(await reviewOf(ROSTER_A1, a1Test)), "the reset student's new attempt still holds the answers");
  const after = (await answersRelease()).test;
  assert.ok(after.confirmKeys.includes(`${ROSTER_C3}#2.1`) && after.heldFor >= 1, 'the teacher is shown C3 at attempt 2, not yet covered');
  // Confirming the new list releases them.
  await fns.releaseTestCycleAnswers.run(roster({ stage: 'test', confirmed: after.confirmKeys }));
  assert.ok(!held(await reviewOf(ROSTER_A1, a1Test)));
});

test("a teacher's reset of the Test closes the old Corrections plan until the new Test is submitted", async () => {
  // A2 is in Corrections, with the correction question opened above still open.
  const plan = await readCorrectionPlan(ROSTER_ASSIGNMENT_ID, ROSTER_A2);
  const [correctionId, open] = Object.entries(plan.activeQuestions || {})[0] || [];
  assert.ok(correctionId && open?.questionInstanceId, 'A2 has a correction question open');
  const issueCorrection = () => fns.issueTestCycleCorrectionQuestion.run(student(ROSTER_A2, { assignmentId: ROSTER_ASSIGNMENT_ID, correctionId }));
  const answerCorrection = () => fns.submitTestCycleCorrectionResponse.run(student(ROSTER_A2, {
    assignmentId: ROSTER_ASSIGNMENT_ID, correctionId, questionInstanceId: open.questionInstanceId, responsePayload: { responses: { answer: CERT_WRONG_ANSWER } },
  }));

  // The teacher resets A2's Test: a new attempt, drawn from the same families as the old plan.
  await fns.teacherTestCycleAction.run(roster({ studentId: ROSTER_A2, action: 'resetSecureSession', stage: 'test' }));
  const newTest = await testSessionOf(ROSTER_A2);
  created.push(newTest);
  for (const when of ['assigned', 'under way']) {
    // eslint-disable-next-line no-await-in-loop
    if (when === 'under way') await fns.startSecureExamSession.run(student(ROSTER_A2, { examSessionId: newTest }));
    // eslint-disable-next-line no-await-in-loop
    const issued = await refusal(issueCorrection());
    assert.equal(issued?.code, 'failed-precondition', `no correction question while the new Test is ${when}`);
    assert.match(issued.message, /closed while your Test is open/);
    // Three misses would hand over a worked solution: not one response is taken.
    // eslint-disable-next-line no-await-in-loop
    const answered = await refusal(answerCorrection());
    assert.equal(answered?.code, 'failed-precondition', `no correction response while the new Test is ${when}`);
  }
  assert.equal(Number((await readCorrectionPlan(ROSTER_ASSIGNMENT_ID, ROSTER_A2)).activeQuestions[correctionId].attemptsUsed || 0), 0, 'no attempt was spent');
});

test("a teacher's reset closes the earlier attempt's answers until the new attempt is submitted", async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, classId: CERT_CLASS_ID }));
  await db.collection('grades').doc(RESET_STUDENT).set({
    gradesByAssignment: { [CERT_ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  }, { merge: true });
  const first = (await readRecord(CERT_ASSIGNMENT_ID, RESET_STUDENT)).test.examSessionId;
  created.push(first);
  await fns.startSecureExamSession.run(student(RESET_STUDENT, { examSessionId: first }));
  const opened = await issue(RESET_STUDENT, first, { position: 0 });
  await save(RESET_STUDENT, { examSessionId: first, questionInstanceId: opened.questionInstance.questionInstanceId, responsePayload: { responses: { answer: certAnswerFromPrompt(opened.questionInstance.prompt) } } });
  await fns.finalizeSecureExam.run(student(RESET_STUDENT, { examSessionId: first }));
  await fns.proctorExamAction.run(teacherRequest({ examSessionId: first, action: 'releaseFeedback' }));
  const released = await fns.getStudentSecureExamReview.run(student(RESET_STUDENT, { examSessionId: first }));
  assert.ok(released.review.items.length > 0, 'the released Test opens');

  // The teacher resets the Test: the old session keeps its release, a new attempt is assigned.
  await fns.teacherTestCycleAction.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, studentId: RESET_STUDENT, action: 'resetSecureSession', stage: 'test' }));
  const second = (await readRecord(CERT_ASSIGNMENT_ID, RESET_STUDENT)).test.examSessionId;
  created.push(second);
  assert.ok(second && second !== first, 'a new attempt is assigned');
  const whileAssigned = await refusal(fns.getStudentSecureExamReview.run(student(RESET_STUDENT, { examSessionId: first })));
  assert.equal(whileAssigned?.code, 'failed-precondition', 'the earlier answers are closed while the new attempt is assigned');
  await fns.startSecureExamSession.run(student(RESET_STUDENT, { examSessionId: second }));
  const whileTaking = await refusal(fns.getStudentSecureExamReview.run(student(RESET_STUDENT, { examSessionId: first })));
  assert.equal(whileTaking?.code, 'failed-precondition', 'and while it is under way');
  assert.match(whileTaking.message, /finish the test you are taking now/i);

  await fns.finalizeSecureExam.run(student(RESET_STUDENT, { examSessionId: second }));
  const after = await fns.getStudentSecureExamReview.run(student(RESET_STUDENT, { examSessionId: first }));
  assert.ok(after.review.items.length > 0, 'they open again once the new attempt is submitted');
});

test('a course Test the teacher paused or archived takes no edits, no recorded answers and no Submit; time running out grades what was saved while open', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, classId: CERT_CLASS_ID }));
  await db.collection('grades').doc(PAUSE_STUDENT).set({
    gradesByAssignment: { [CERT_ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  }, { merge: true });
  const examSessionId = (await readRecord(CERT_ASSIGNMENT_ID, PAUSE_STUDENT)).test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(PAUSE_STUDENT, { examSessionId }));
  // Questions 1 and 2 are open; question 1 has a wrong draft when the teacher pauses the Test.
  const first = (await issue(PAUSE_STUDENT, examSessionId, { position: 0 })).questionInstance;
  const second = (await issue(PAUSE_STUDENT, examSessionId, { position: 1 })).questionInstance;
  await save(PAUSE_STUDENT, { examSessionId, questionInstanceId: first.questionInstanceId, responsePayload: { responses: { answer: CERT_WRONG_ANSWER } } });

  const assignmentRef = db.collection('assignments').doc(CERT_ASSIGNMENT_ID);
  const record = (question, index) => fns.submitSecureExamResponse.run(student(PAUSE_STUDENT, {
    examSessionId,
    questionInstanceId: question.questionInstanceId,
    responsePayload: { responses: { answer: certAnswerFromPrompt(question.prompt) } },
    submissionId: `nav-paused-${index}`,
  }));
  try {
    for (const closed of [{ unpublished: true }, { unpublished: false, archived: true }]) {
      // eslint-disable-next-line no-await-in-loop
      await assignmentRef.set(closed, { merge: true });
      const how = closed.archived ? 'archived' : 'paused';
      // eslint-disable-next-line no-await-in-loop
      const edit = await refusal(save(PAUSE_STUDENT, { examSessionId, questionInstanceId: first.questionInstanceId, responsePayload: { responses: { answer: certAnswerFromPrompt(first.prompt) } } }));
      assert.equal(edit?.code, 'failed-precondition', `no edits while the teacher has it ${how}`);
      // The older record-and-lock call is an edit too: the right answers are not recorded.
      // eslint-disable-next-line no-await-in-loop
      const recordFirst = await refusal(record(first, 1));
      assert.equal(recordFirst?.code, 'failed-precondition', `no recorded answer while it is ${how}`);
      // eslint-disable-next-line no-await-in-loop
      const recordSecond = await refusal(record(second, 2));
      assert.equal(recordSecond?.code, 'failed-precondition', `and none for an open question with no draft (${how})`);
      // eslint-disable-next-line no-await-in-loop
      const submit = await refusal(fns.finalizeSecureExam.run(student(PAUSE_STUDENT, { examSessionId })));
      assert.equal(submit?.code, 'failed-precondition', `and no Submit (${how})`);
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await readSession(examSessionId)).status, 'in_progress', 'not locked or finished: a pause is temporary');
    }
    assert.deepEqual((await readSession(examSessionId)).responses || {}, {}, 'nothing was recorded while it was closed');

    // Time runs out while it is closed: the test finishes, graded on what was saved while open.
    await db.collection('examSessions').doc(examSessionId).set({ startedAt: Date.now() - 10 * 60 * 60 * 1000 }, { merge: true });
    await fns.finalizeSecureExam.run(student(PAUSE_STUDENT, { examSessionId, reason: 'timeExpired' }));
    const stored = await readSession(examSessionId);
    assert.equal(stored.status, 'time_expired');
    assert.equal(stored.responses[first.questionInstanceId].grading.isCorrect, false, 'the wrong draft saved before the pause is the one graded');
    assert.equal(stored.responses[second.questionInstanceId].unanswered, true, 'the question with nothing saved is unanswered');
  } finally {
    await assignmentRef.set({ unpublished: false, archived: false }, { merge: true });
  }
});

test("a teacher's pause stops the clock: a pause spanning the original deadline extends it by the time paused", async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, classId: CERT_CLASS_ID }));
  await db.collection('grades').doc(CLOCK_STUDENT).set({
    gradesByAssignment: { [CERT_ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  }, { merge: true });
  const examSessionId = (await readRecord(CERT_ASSIGNMENT_ID, CLOCK_STUDENT)).test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(CLOCK_STUDENT, { examSessionId }));
  const opened = (await issue(CLOCK_STUDENT, examSessionId, { position: 0 })).questionInstance;
  const draft = (answer) => save(CLOCK_STUDENT, { examSessionId, questionInstanceId: opened.questionInstanceId, responsePayload: { responses: { answer } } });
  const timeUp = () => fns.finalizeSecureExam.run(student(CLOCK_STUDENT, { examSessionId, reason: 'timeExpired' }));
  const where = async () => (await fns.startSecureExamSession.run(student(CLOCK_STUDENT, { examSessionId }))).session;
  await draft(certAnswerFromPrompt(opened.prompt));
  const sessionRef = db.collection('examSessions').doc(examSessionId);
  const limitSeconds = Number((await readSession(examSessionId)).timeLimitSeconds);
  assert.ok(limitSeconds > 0, 'the course Test is timed');
  const lifecycle = (action) => fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: CERT_ASSIGNMENT_ID, action }));

  // The Test began so long ago that its original deadline passed ten minutes
  // ago, but the teacher paused the Test Cycle eleven minutes ago, a minute
  // before that deadline.
  const now = Date.now();
  await sessionRef.set({ startedAt: now - (limitSeconds + 10 * 60) * 1000 }, { merge: true });
  try {
    await lifecycle('unpublish');
    assert.deepEqual((await readSession(examSessionId)).teacherPause?.holds, ['assignment'], 'pausing the Test Cycle holds the clock of a Test under way');
    await sessionRef.set({ teacherPause: { since: now - 11 * 60 * 1000, holds: ['assignment'] } }, { merge: true });

    // Paused: time has not run out, the student's screen sees the stopped clock, and nothing is edited.
    const duringPause = await refusal(timeUp());
    assert.equal(duringPause?.code, 'failed-precondition', 'no time-up during the pause, even past the original deadline');
    const paused = await where();
    assert.equal(paused.clockPaused, true);
    assert.ok(Math.abs(paused.pausedRemainingSeconds - 60) <= 5, `a minute left, stopped (${paused.pausedRemainingSeconds})`);
    assert.equal((await refusal(draft(CERT_WRONG_ANSWER)))?.code, 'failed-precondition', 'no edits while paused');

    // Resumed: eleven minutes paused are banked, and the student has their minute.
    await lifecycle('publish');
    const resumed = await readSession(examSessionId);
    assert.deepEqual(resumed.teacherPause.holds, []);
    assert.ok(Math.abs(resumed.pausedSeconds - 11 * 60) <= 5, `eleven minutes banked (${resumed.pausedSeconds})`);
    const running = await where();
    assert.equal(running.clockPaused, false);
    const left = running.expiresAt - Date.now();
    assert.ok(left > 50 * 1000 && left <= 65 * 1000, `the deadline moved by the time paused (${left} ms left)`);
    await draft(CERT_WRONG_ANSWER);
    assert.equal((await refusal(timeUp()))?.code, 'failed-precondition', 'and time is not up yet');

    // A proctor's pause holds the clock the same way.
    await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'lock' }));
    assert.deepEqual((await readSession(examSessionId)).teacherPause?.holds, ['proctor'], 'a proctor pause holds the clock');
    await sessionRef.set({ teacherPause: { since: Date.now() - 5 * 60 * 1000, holds: ['proctor'] } }, { merge: true });
    await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'unlock' }));
    const unlocked = await readSession(examSessionId);
    assert.ok(Math.abs(unlocked.pausedSeconds - 16 * 60) <= 5, `five more minutes banked (${unlocked.pausedSeconds})`);

    // An integrity lock is not a teacher's pause: the clock keeps running through it.
    for (const eventId of ['clock-e1', 'clock-e2', 'clock-e3']) {
      // eslint-disable-next-line no-await-in-loop
      await fns.recordSecureExamIntegrityEvent.run(student(CLOCK_STUDENT, { examSessionId, eventId, type: 'tab_switch' }));
    }
    const integrity = await readSession(examSessionId);
    assert.equal(integrity.status, 'locked_integrity');
    assert.deepEqual(integrity.teacherPause.holds, [], 'no hold for an integrity lock');
    await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'unlock' }));
    assert.equal((await readSession(examSessionId)).pausedSeconds, unlocked.pausedSeconds, 'and nothing banked for it');

    // Then the extended deadline passes: graded on the last draft saved in time.
    await sessionRef.set({ startedAt: unlocked.startedAt - 30 * 60 * 1000 }, { merge: true });
    assert.equal((await refusal(draft(certAnswerFromPrompt(opened.prompt))))?.code, 'deadline-exceeded');
    await timeUp();
    const stored = await readSession(examSessionId);
    assert.equal(stored.status, 'time_expired');
    assert.equal(stored.responses[opened.questionInstanceId].grading.isCorrect, false, 'the draft saved after the resume is the one graded');
  } finally {
    await db.collection('assignments').doc(CERT_ASSIGNMENT_ID).set({ unpublished: false }, { merge: true });
  }
});

test('a draft sent after time is up is refused, and the test is graded on the last draft saved in time', async () => {
  const { examSessionId } = await createSimulation(PAUSE_STUDENT, 'tsia2', 1);
  await fns.startSecureExamSession.run(student(PAUSE_STUDENT, { examSessionId }));
  const opened = await issue(PAUSE_STUDENT, examSessionId, { position: 0 });
  const questionInstanceId = opened.questionInstance.questionInstanceId;
  const key = await keyFor(examSessionId, questionInstanceId);
  await save(PAUSE_STUDENT, { examSessionId, questionInstanceId, responsePayload: { responses: { [key.fieldId]: key.value } } });
  // TSIA2 is untimed; this one is given ten minutes, started ten hours ago.
  await db.collection('examSessions').doc(examSessionId).set({ timeLimitSeconds: 600, startedAt: Date.now() - 10 * 60 * 60 * 1000 }, { merge: true });
  const late = await refusal(save(PAUSE_STUDENT, { examSessionId, questionInstanceId, responsePayload: { responses: { [key.fieldId]: CERT_WRONG_ANSWER } } }));
  assert.equal(late?.code, 'deadline-exceeded', 'a save after the deadline is refused');
  await fns.finalizeSecureExam.run(student(PAUSE_STUDENT, { examSessionId, reason: 'timeExpired' }));
  const stored = await readSession(examSessionId);
  assert.equal(stored.responses[questionInstanceId].grading.isCorrect, true, 'the draft saved in time is the one graded');
});

test('a record holder past the 400 the teacher\'s table reads is still on the list a release confirms', async () => {
  // Assigned to the roster P1 class; 400 records of students who finished,
  // and one more, out of the roster (they moved class), still testing.
  await db.collection('assignments').doc(CAP_ASSIGNMENT_ID).set({ ...certAssignment({ classIds: [ROSTER_P1] }), id: CAP_ASSIGNMENT_ID });
  const batch = db.batch();
  CAP_FILLERS.forEach((studentId) => batch.set(db.collection('testCycleRecords').doc(`${CAP_ASSIGNMENT_ID}__${studentId}`), {
    assignmentId: CAP_ASSIGNMENT_ID, studentId, test: { state: 'released', attempt: 1, rawScore: 90 },
  }));
  batch.set(db.collection('testCycleRecords').doc(`${CAP_ASSIGNMENT_ID}__${CAP_HOLDER}`), {
    assignmentId: CAP_ASSIGNMENT_ID, studentId: CAP_HOLDER, test: { state: 'assigned', attempt: 1, examSessionId: 'nav-cap-session' },
  });
  await batch.commit();
  const listing = await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: CAP_ASSIGNMENT_ID }));
  assert.equal(listing.rows.some((row) => row.studentId === CAP_HOLDER), false, 'the table itself stops at 400 records');
  assert.ok(listing.answersRelease.test.stillTestingIds.includes(CAP_HOLDER), 'but the student still testing is on the list');
  // So the release the teacher confirms goes through, rather than refusing forever.
  await fns.releaseTestCycleAnswers.run(teacherRequest({ assignmentId: CAP_ASSIGNMENT_ID, stage: 'test', confirmed: listing.answersRelease.test.confirmKeys }));
  assert.equal((await fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: CAP_ASSIGNMENT_ID }))).answersRelease.test.released, true);
});

test('the roster the review re-check caches only ever holds the answers: a student who joins closes them at once', async () => {
  await db.collection('classes').doc(CACHE_CLASS).set({
    name: 'Cache Algebra I', course: 'algebra1', courseLevel: 'standard', period: 'Period 5', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  const enroll = (studentId) => db.collection('grades').doc(studentId).set({
    displayName: studentId, classId: CACHE_CLASS, classPeriod: 'Period 5', assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
    gradesByAssignment: { [CACHE_ASSIGNMENT_ID]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
  });
  await enroll(CACHE_FIRST);
  await db.collection('assignments').doc(CACHE_ASSIGNMENT_ID).set({ ...certAssignment({ classIds: [CACHE_CLASS] }), id: CACHE_ASSIGNMENT_ID });
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: CACHE_ASSIGNMENT_ID, classId: CACHE_CLASS }));
  const examSessionId = (await readRecord(CACHE_ASSIGNMENT_ID, CACHE_FIRST)).test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(CACHE_FIRST, { examSessionId }));
  await fns.finalizeSecureExam.run(student(CACHE_FIRST, { examSessionId }));
  await fns.releaseTestCycleResults.run(teacherRequest({ assignmentId: CACHE_ASSIGNMENT_ID, stage: 'test' }));
  // The only student has finished: the answers are open (and the roster is now cached).
  const open = (await fns.getStudentSecureExamReview.run(student(CACHE_FIRST, { examSessionId }))).review;
  assert.ok(!held(open), 'with everyone finished, the answers are open');
  // A student joins the class a moment later, well inside the cache's minute.
  await enroll(CACHE_JOINER);
  const again = (await fns.getStudentSecureExamReview.run(student(CACHE_FIRST, { examSessionId }))).review;
  assert.ok(held(again), 'the new student holds the answers on the very next ask, cache or not');
  // And while held, the next ask comes back held too.
  assert.ok(held((await fns.getStudentSecureExamReview.run(student(CACHE_FIRST, { examSessionId }))).review));
});

test('a session written by the old linear runtime is upgraded without reopening recorded answers', async () => {
  const session = await createSimulation(LEGACY_STUDENT, 'act', 3);
  const examSessionId = session.examSessionId;
  await fns.startSecureExamSession.run(student(LEGACY_STUDENT, { examSessionId }));
  // Drive the old client's calls: issue without a position, record & lock one.
  const first = await issue(LEGACY_STUDENT, examSessionId);
  const firstKey = await keyFor(examSessionId, first.questionInstance.questionInstanceId);
  const submitted = await fns.submitSecureExamResponse.run(student(LEGACY_STUDENT, {
    examSessionId, questionInstanceId: first.questionInstance.questionInstanceId,
    responsePayload: { responses: { [firstKey.fieldId]: firstKey.value } }, submissionId: 'nav-legacy-1',
  }));
  assert.equal(submitted.needsNextQuestion, true);
  assertNoVerdict({ ...submitted, session: { ...submitted.session } }, 'a legacy submit response');

  // Now rewrite the stored session into the pre-navigation shape: the open
  // item on `currentQuestion`, no navigation block.
  const second = await issue(LEGACY_STUDENT, examSessionId);
  const secondId = second.questionInstance.questionInstanceId;
  const stored = await readSession(examSessionId);
  const item = await readItem(examSessionId, secondId);
  const { navigation: _navigation, ...legacy } = stored;
  await db.collection('examSessions').doc(examSessionId).set({
    ...legacy,
    currentQuestion: { ...item.item, draftResponse: { responsePayload: { responses: { answer: 'draft' } }, supportUsage: {} } },
  });
  await db.collection('examSessions').doc(examSessionId).collection('items').doc(secondId).delete();

  const reopened = await issue(LEGACY_STUDENT, examSessionId, { position: 1 });
  assert.equal(reopened.questionInstance.questionInstanceId, secondId);
  assert.equal(reopened.draftResponse.responsePayload.responses.answer, 'draft', 'the legacy draft survives the upgrade');
  assert.equal(reopened.session.navigation.upgradedFromLinear, true);
  assert.equal(reopened.session.navigation.items[0].status, 'recorded');
  const locked = await issue(LEGACY_STUDENT, examSessionId, { position: 0 });
  assert.equal(locked.recorded, true, 'a recorded answer is not reopened');
  assert.equal(locked.questionInstance, null);
  const upgraded = await readSession(examSessionId);
  assert.equal(upgraded.currentQuestion, null);
  assert.ok((await readItem(examSessionId, secondId))?.item, 'the open item moved into the items subcollection');
});
