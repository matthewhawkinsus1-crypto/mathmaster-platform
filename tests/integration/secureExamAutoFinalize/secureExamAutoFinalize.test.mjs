/*
 * THE ABANDONED-TEST FINALIZER — an expired timed test the student walked away
 * from is finished by the server, once, exactly as their own time-up would.
 *
 * HOW TO RUN:  npm run test:secure-exam-auto-finalize   (Firestore emulator)
 *
 * The real Cloud Functions against a real Firestore. The scheduled function is
 * run by hand (`.run`), as Cloud Scheduler would run it. It looks at every due
 * session in the project, which is why this suite lives in a directory of its
 * own with an emulator project of its own: run beside the other integration
 * suites, it would finish their sessions too.
 *
 * Time passing is simulated by moving a session's clock back (`elapse`): its
 * start, its stored hint and any pause under way move together, exactly as if
 * that much time had gone by.
 *
 * What it proves:
 *   - a test with time left, or within the grace after its deadline, is not
 *     touched, and its stored hint is the deadline plus the grace;
 *   - extended time is time left: past the base limit, within the student's
 *     accommodated one, nothing happens;
 *   - an expired, abandoned test is finished once: the saved drafts graded as
 *     saved, status `time_expired`, a practice test released; a second run
 *     writes nothing;
 *   - a course Test finished this way moves the record, so the student's card,
 *     the teacher's table and the class's answer hold all see it submitted;
 *   - a stale hint is checked against the real deadline and written back;
 *   - a session the student submits while the finalizer is mid-run is left
 *     exactly as the student's submit wrote it;
 *   - a proctor's pause and a teacher's pause that stopped the clock with time
 *     left are left alone;
 *   - a session started before the hint existed is derived: finished when its
 *     time is up, hinted when it is not;
 *   - follow-ups (the record sync) that did not finish are finished next run.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  CERT_WRONG_ANSWER, certAnswerFromPrompt, certAssignment, certFamilies,
} from '../../fixtures/testCycleCertificationFixture.mjs';
import {
  admin, db, fns, readRecord, readSession, studentRequest, teacherRequest, TEACHER_EMAIL,
} from '../testCycleCertificationHarness.mjs';

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const secureExam = require('../../../functions/lib/secureExam.js');
const { SWEEP_DOC_ID } = require('../../../functions/lib/secureExamAutoFinalize.js');
const { FieldValue } = admin.firestore;

const GRACE = secureExam.AUTO_FINALIZE_GRACE_MS;
const PRACTICE_CLASS = 'af-practice-class';
const COURSE_CLASS = 'af-course-class';
const HOLD_CLASS = 'af-hold-class';
const COURSE_ASSIGNMENT_ID = 'af_course_test_cycle';
const HOLD_ASSIGNMENT_ID = 'af_hold_test_cycle';

const LEFT = 'AF_TIME_LEFT';
const EXPIRED = 'AF_EXPIRED';
const EXTRA = 'AF_EXTRA_TIME';
const STALE = 'AF_STALE_HINT';
const RACE = 'AF_RACE';
const PROCTOR = 'AF_PROCTOR';
const LEGACY = 'AF_LEGACY';
const COURSE = 'AF_COURSE';
const HOLD = 'AF_HOLD';
const REPLACED = 'AF_REPLACED';
const PRACTICE_STUDENTS = [LEFT, EXPIRED, EXTRA, STALE, RACE, PROCTOR, LEGACY];
const ALL = [...PRACTICE_STUDENTS, COURSE, HOLD, REPLACED];
const created = [];

const student = (studentId, data) => studentRequest(studentId, data);
const runFinalizer = () => fns.finalizeAbandonedSecureExams.run({});
const sessionRef = (examSessionId) => db.collection('examSessions').doc(examSessionId);
const updateTimeOf = async (ref) => (await ref.get()).updateTime;
const recordRef = (assignmentId, studentId) => db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`);
const issue = (studentId, examSessionId, position) => fns.issueSecureExamQuestion.run(student(studentId, { examSessionId, position }));
const save = (studentId, data) => fns.saveSecureExamDraft.run(student(studentId, data));

/** A correct answer for a field item, from its server-only key. */
const keyFor = async (examSessionId, questionInstanceId) => {
  const item = (await sessionRef(examSessionId).collection('items').doc(questionInstanceId).get()).data();
  const field = item.item.privateGrading.fields[0];
  return { fieldId: field.id, value: String(Array.isArray(field.expected) ? field.expected[0] : field.expected) };
};

/** Let `ms` go by for this session: its start, its hint and any pause under way move back together. */
const elapse = async (examSessionId, ms) => {
  const session = await readSession(examSessionId);
  const patch = { startedAt: Number(session.startedAt) - ms };
  if (typeof session.autoFinalizeAt === 'number') patch.autoFinalizeAt = session.autoFinalizeAt - ms;
  if (Number(session.teacherPause?.since) > 0) patch.teacherPause = { ...session.teacherPause, since: session.teacherPause.since - ms };
  await sessionRef(examSessionId).set(patch, { merge: true });
};

/*
 * Make the finalizer look at this session now, whatever its time: a stale
 * hint (a previous build, a write that missed it). The hint is only where to
 * look; these cases prove the transaction's own check decides.
 */
const lookNow = (examSessionId) => sessionRef(examSessionId).set({ autoFinalizeAt: Date.now() - 1000 }, { merge: true });

/** How long from now until this session's deadline (the rule every call uses). */
const untilDeadline = async (examSessionId) => secureExam.deadlineFor(await readSession(examSessionId)) - Date.now();

const startPractice = async (studentId, examType = 'act', questionCount = 2) => {
  const { session } = await fns.createSecureExamSession.run(teacherRequest({ studentId, examType, questionCount }));
  created.push(session.examSessionId);
  await fns.startSecureExamSession.run(student(studentId, { examSessionId: session.examSessionId }));
  return session.examSessionId;
};

/** Two questions opened; the first with a correct draft, the second blank. */
const openTwo = async (studentId, examSessionId) => {
  const first = (await issue(studentId, examSessionId, 0)).questionInstance.questionInstanceId;
  const second = (await issue(studentId, examSessionId, 1)).questionInstance.questionInstanceId;
  const key = await keyFor(examSessionId, first);
  await save(studentId, { examSessionId, questionInstanceId: first, responsePayload: { responses: { [key.fieldId]: key.value } } });
  return { first, second };
};

before(async () => {
  await Promise.all(certFamilies().map((family) => {
    const { id, ...fields } = family;
    return db.collection('pathQuestionBank').doc(id).set(fields);
  }));
  await Promise.all([[PRACTICE_CLASS, 'Period 2'], [COURSE_CLASS, 'Period 3'], [HOLD_CLASS, 'Period 4']].map(([classId, period]) => (
    db.collection('classes').doc(classId).set({
      name: `Auto-finalize ${period}`, course: 'algebra1', courseLevel: 'standard', period, teacherOfRecord: TEACHER_EMAIL, status: 'active',
    })
  )));
  const classOf = (studentId) => (studentId === COURSE ? COURSE_CLASS : [HOLD, REPLACED].includes(studentId) ? HOLD_CLASS : PRACTICE_CLASS);
  const assignmentOf = (studentId) => (studentId === COURSE ? COURSE_ASSIGNMENT_ID : HOLD_ASSIGNMENT_ID);
  await Promise.all(ALL.map((studentId) => db.collection('grades').doc(studentId).set({
    displayName: studentId, classId: classOf(studentId), classPeriod: 'Period 2',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
    // The course students have done their Review.
    gradesByAssignment: [COURSE, HOLD, REPLACED].includes(studentId)
      ? { [assignmentOf(studentId)]: { 0: { status: 'correct' }, 1: { status: 'correct' } } }
      : {},
    ...(studentId === EXTRA
      ? { profile: { programEligibility: { section504: true }, accommodations: { extendedTimeMultiplier: 1.5 } } }
      : {}),
  })));
  await db.collection('assignments').doc(COURSE_ASSIGNMENT_ID).set({ ...certAssignment({ classIds: [COURSE_CLASS] }), id: COURSE_ASSIGNMENT_ID });
  await db.collection('assignments').doc(HOLD_ASSIGNMENT_ID).set({ ...certAssignment({ classIds: [HOLD_CLASS] }), id: HOLD_ASSIGNMENT_ID });
});

after(async () => {
  await Promise.allSettled([
    ...certFamilies().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    ...[COURSE_ASSIGNMENT_ID, HOLD_ASSIGNMENT_ID].map((id) => db.collection('assignments').doc(id).delete()),
    ...[PRACTICE_CLASS, COURSE_CLASS, HOLD_CLASS].map((id) => db.collection('classes').doc(id).delete()),
    ...ALL.map((studentId) => db.collection('grades').doc(studentId).delete()),
    recordRef(COURSE_ASSIGNMENT_ID, COURSE).delete(),
    recordRef(HOLD_ASSIGNMENT_ID, HOLD).delete(),
    recordRef(HOLD_ASSIGNMENT_ID, REPLACED).delete(),
    ...created.map((id) => sessionRef(id).delete()),
    db.collection('platformMigrations').doc(SWEEP_DOC_ID).delete(),
  ]);
});

/* ======================================================================== */

test('a test with time left, or still within the grace after its deadline, is not touched', async () => {
  const examSessionId = await startPractice(LEFT);
  const started = await readSession(examSessionId);
  assert.equal(
    started.autoFinalizeAt,
    started.startedAt + started.timeLimitSeconds * 1000 + GRACE,
    'start stores where the finalizer will look: the deadline plus the grace',
  );
  const ref = sessionRef(examSessionId);
  const untouched = await updateTimeOf(ref);
  await runFinalizer();
  assert.ok((await updateTimeOf(ref)).isEqual(untouched), 'a test with time left is not written');

  // Its time ran out thirty seconds ago: still within the grace.
  await elapse(examSessionId, (await untilDeadline(examSessionId)) + 30 * 1000);
  const withinGrace = await updateTimeOf(ref);
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'in_progress', 'not finished within the grace');
  assert.ok((await updateTimeOf(ref)).isEqual(withinGrace), 'and not written');
  // Made to look now, within the grace, it still finishes nothing; the true hint goes back.
  await lookNow(examSessionId);
  await runFinalizer();
  const looked = await readSession(examSessionId);
  assert.equal(looked.status, 'in_progress', 'the grace is checked in the transaction, not only in the hint');
  assert.equal(looked.autoFinalizeAt, secureExam.deadlineFor(looked) + GRACE);
  // The student submits, so this session is not due under the tests that follow.
  await fns.finalizeSecureExam.run(student(LEFT, { examSessionId }));
  assert.equal((await readSession(examSessionId)).autoFinalizeAt, null, 'a submit clears the hint');
});

test('an expired, abandoned practice test is finished once, graded on its saved drafts, released; a second run writes nothing', async () => {
  const examSessionId = await startPractice(EXPIRED);
  const { first, second } = await openTwo(EXPIRED, examSessionId);
  await elapse(examSessionId, (await untilDeadline(examSessionId)) + GRACE + 60 * 1000);

  await runFinalizer();
  const finished = await readSession(examSessionId);
  assert.equal(finished.status, 'time_expired', 'finished exactly as time-up finishes it');
  assert.equal(finished.responses[first].grading.isCorrect, true, 'the saved draft is the answer graded');
  assert.equal(finished.responses[second].unanswered, true, 'the blank question is recorded unanswered');
  assert.equal(finished.feedbackReleased, true, 'a practice test with automatic release is released');
  assert.equal(finished.autoFinalizeAt, null, 'and it leaves the finalizer\'s sight');
  assert.ok(finished.autoFinalizedAt > 0, 'the server says it finished it');

  const ref = sessionRef(examSessionId);
  const once = await updateTimeOf(ref);
  await runFinalizer();
  assert.ok((await updateTimeOf(ref)).isEqual(once), 'a second run writes nothing');

  // The student comes back to a finished test, not an open one.
  const back = await fns.startSecureExamSession.run(student(EXPIRED, { examSessionId }));
  assert.equal(back.session.status, 'time_expired');
  const review = await fns.getStudentSecureExamReview.run(student(EXPIRED, { examSessionId }));
  assert.ok(review.review, 'and can open the released review');
});

test('extended time is time left: past the base limit, within the accommodated one, nothing happens', async () => {
  const examSessionId = await startPractice(EXTRA, 'digitalSAT', 4);
  const started = await readSession(examSessionId);
  assert.equal(started.baseTimeLimitSeconds, 7 * 60);
  assert.equal(started.timeLimitSeconds, 11 * 60, '1.5 times the limit, from the support profile');
  assert.equal(started.autoFinalizeAt, started.startedAt + 11 * 60 * 1000 + GRACE, 'the hint carries the extended time');

  // Ten minutes in: past the base limit and its grace, a minute before the student's own deadline.
  await elapse(examSessionId, 10 * 60 * 1000);
  const ref = sessionRef(examSessionId);
  const before = await updateTimeOf(ref);
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'in_progress', 'a student with extended time left keeps working');
  assert.ok((await updateTimeOf(ref)).isEqual(before), 'and nothing is written');
  await lookNow(examSessionId);
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'in_progress', 'made to look now, the transaction still counts the extended time');

  await elapse(examSessionId, 5 * 60 * 1000);
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'time_expired', 'past the accommodated deadline and its grace, it is finished');
});

test('a stale hint is checked against the real deadline and written back, not obeyed', async () => {
  const examSessionId = await startPractice(STALE);
  // A previous build added thirty minutes without moving the hint.
  await sessionRef(examSessionId).set({ addedTimeSeconds: 30 * 60 }, { merge: true });
  const hintBefore = (await readSession(examSessionId)).autoFinalizeAt;
  await elapse(examSessionId, hintBefore - Date.now() + 60 * 1000);

  await runFinalizer();
  const after = await readSession(examSessionId);
  assert.equal(after.status, 'in_progress', 'the added time is the student\'s');
  assert.equal(after.autoFinalizeAt, secureExam.deadlineFor(after) + GRACE, 'the true hint is written back');
  const settled = await updateTimeOf(sessionRef(examSessionId));
  await runFinalizer();
  assert.ok((await updateTimeOf(sessionRef(examSessionId))).isEqual(settled), 'once');

  // The proctor's own "add time" moves the hint itself.
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'extendTime', minutes: 5 }));
  const extended = await readSession(examSessionId);
  assert.equal(extended.autoFinalizeAt, secureExam.deadlineFor(extended) + GRACE, 'added time moves the hint');
  assert.equal(extended.autoFinalizeAt, after.autoFinalizeAt + 5 * 60 * 1000);
});

test('a session the student submits while the finalizer is mid-run is left as the student\'s submit wrote it', async () => {
  // Nothing else is due, so the next transaction the finalizer opens is this session's.
  await runFinalizer();
  const examSessionId = await startPractice(RACE);
  const { first } = await openTwo(RACE, examSessionId);
  await elapse(examSessionId, (await untilDeadline(examSessionId)) + GRACE + 60 * 1000);

  const proto = Object.getPrototypeOf(db);
  const original = proto.runTransaction;
  let release = null;
  const released = new Promise((resolve) => { release = resolve; });
  let reach = null;
  const reached = new Promise((resolve) => { reach = resolve; });
  proto.runTransaction = async function gatedOnce(...args) {
    proto.runTransaction = original;
    reach();
    await released;
    return original.apply(this, args);
  };
  let finalizing = null;
  try {
    finalizing = runFinalizer();
    await reached;
    // The student presses Submit while the finalizer waits at its transaction.
    await fns.finalizeSecureExam.run(student(RACE, { examSessionId }));
  } finally {
    proto.runTransaction = original;
    release();
  }
  const submitted = await readSession(examSessionId);
  const submittedAt = await updateTimeOf(sessionRef(examSessionId));
  await finalizing;
  const stored = await readSession(examSessionId);
  assert.equal(stored.status, 'submitted', 'the student\'s Submit stands');
  assert.equal(stored.autoFinalizedAt, undefined, 'the server did not finish it');
  assert.equal(stored.responses[first].grading.isCorrect, true);
  assert.deepEqual(stored, submitted, 'nothing the finalizer did changed it');
  assert.ok((await updateTimeOf(sessionRef(examSessionId))).isEqual(submittedAt), 'not even a write of the same data');
});

test('a proctor\'s pause is left for the proctor; the unlock gives the finalizer its deadline back', async () => {
  const examSessionId = await startPractice(PROCTOR);
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'lock' }));
  assert.equal((await readSession(examSessionId)).autoFinalizeAt, null, 'a paused test is not the finalizer\'s');
  await elapse(examSessionId, 2 * 60 * 60 * 1000);
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'locked_proctor', 'left for the proctor');
  await lookNow(examSessionId);
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'locked_proctor', 'made to look now, still the proctor\'s');
  assert.equal((await readSession(examSessionId)).autoFinalizeAt, null);

  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'unlock' }));
  const resumed = await readSession(examSessionId);
  assert.equal(resumed.status, 'in_progress');
  assert.equal(resumed.autoFinalizeAt, secureExam.deadlineFor(resumed) + GRACE, 'the resume stores the deadline the pause extended');
  assert.ok(resumed.autoFinalizeAt > Date.now(), 'which is still ahead: the paused time was not spent');

  // A test whose time already ran out, which the proctor then pauses, is the proctor's too.
  await elapse(examSessionId, (await untilDeadline(examSessionId)) + GRACE + 60 * 1000);
  await fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'lock' }));
  await lookNow(examSessionId);
  await runFinalizer();
  const late = await readSession(examSessionId);
  assert.equal(late.status, 'locked_proctor', 'a proctor holding an expired test decides it');
  assert.equal(late.autoFinalizeAt, null);
});

test('a course Test finished this way is submitted on the card, in the teacher\'s table and for the answer hold', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: COURSE_ASSIGNMENT_ID, classId: COURSE_CLASS }));
  const examSessionId = (await readRecord(COURSE_ASSIGNMENT_ID, COURSE)).test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(COURSE, { examSessionId }));
  const first = (await issue(COURSE, examSessionId, 0)).questionInstance;
  const second = (await issue(COURSE, examSessionId, 1)).questionInstance;
  await save(COURSE, { examSessionId, questionInstanceId: first.questionInstanceId, responsePayload: { responses: { answer: certAnswerFromPrompt(first.prompt) } } });
  await save(COURSE, { examSessionId, questionInstanceId: second.questionInstanceId, responsePayload: { responses: { answer: CERT_WRONG_ANSWER } } });

  const table = async () => fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId: COURSE_ASSIGNMENT_ID }));
  const card = async () => fns.getStudentTestCycle.run(student(COURSE, { assignmentId: COURSE_ASSIGNMENT_ID }));
  assert.equal((await readRecord(COURSE_ASSIGNMENT_ID, COURSE)).test.state, 'inProgress');
  assert.deepEqual((await table()).answersRelease.test.stillTestingIds, [COURSE], 'the student holds the class\'s answers while testing');

  await elapse(examSessionId, (await untilDeadline(examSessionId)) + GRACE + 60 * 1000);
  await runFinalizer();

  const session = await readSession(examSessionId);
  assert.equal(session.status, 'time_expired');
  assert.equal(session.responses[first.questionInstanceId].grading.isCorrect, true, 'graded as saved');
  assert.equal(session.responses[second.questionInstanceId].grading.isCorrect, false, 'the wrong draft too, unaltered');
  assert.equal(session.feedbackReleased, false, 'a course Test waits for the teacher\'s release');
  const record = await readRecord(COURSE_ASSIGNMENT_ID, COURSE);
  assert.equal(record.test.state, 'submitted', 'the record says submitted');
  assert.equal(record.test.answeredQuestions, 2);
  const teacherView = await table();
  assert.equal(teacherView.readyToRelease.test, 1, 'the teacher\'s table offers the release');
  assert.deepEqual(teacherView.answersRelease.test.stillTestingIds, [], 'and nobody holds the class\'s answers any more');
  assert.equal((await card()).stage, 'awaitingRelease', 'the student\'s card says the Test is in');

  const recordUpdated = await updateTimeOf(recordRef(COURSE_ASSIGNMENT_ID, COURSE));
  const sessionUpdated = await updateTimeOf(sessionRef(examSessionId));
  await runFinalizer();
  assert.ok((await updateTimeOf(sessionRef(examSessionId))).isEqual(sessionUpdated), 'a second run writes nothing to the session');
  assert.ok((await updateTimeOf(recordRef(COURSE_ASSIGNMENT_ID, COURSE))).isEqual(recordUpdated), 'or to the record');

});

test('a record sync that fails after the finish is retried by a later run, without finishing the test twice', async () => {
  await runFinalizer();
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: COURSE_ASSIGNMENT_ID, classId: COURSE_CLASS }));
  // A teacher's reset gives the student a new Test to abandon.
  await fns.teacherTestCycleAction.run(teacherRequest({ assignmentId: COURSE_ASSIGNMENT_ID, studentId: COURSE, action: 'resetSecureSession', stage: 'test' }));
  const examSessionId = (await readRecord(COURSE_ASSIGNMENT_ID, COURSE)).test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(COURSE, { examSessionId }));
  await elapse(examSessionId, (await untilDeadline(examSessionId)) + GRACE + 60 * 1000);

  // The finish commits; the record sync's transaction (the next one) fails.
  const proto = Object.getPrototypeOf(db);
  const original = proto.runTransaction;
  let calls = 0;
  proto.runTransaction = async function failSecond(...args) {
    calls += 1;
    if (calls === 2) throw new Error('injected: the record sync did not run');
    return original.apply(this, args);
  };
  try {
    await runFinalizer();
  } finally {
    proto.runTransaction = original;
  }
  const finished = await readSession(examSessionId);
  assert.equal(finished.status, 'time_expired', 'the test is finished');
  assert.equal((await readRecord(COURSE_ASSIGNMENT_ID, COURSE)).test.state, 'inProgress', 'the record has not caught up');
  assert.ok(finished.autoFinalizeAt > Date.now(), 'the session stays in the finalizer\'s sight, for a later run');

  await sessionRef(examSessionId).set({ autoFinalizeAt: Date.now() - 1000 }, { merge: true });
  await runFinalizer();
  assert.equal((await readRecord(COURSE_ASSIGNMENT_ID, COURSE)).test.state, 'submitted', 'the later run finishes the sync');
  const settled = await readSession(examSessionId);
  assert.equal(settled.autoFinalizeAt, null, 'and then lets the session go');
  assert.equal(settled.submittedAt, finished.submittedAt, 'without finishing it a second time');
  assert.deepEqual(settled.responses, finished.responses, 'or grading it again');
});

test('a Test whose teacher paused it before its time ran out is not finished, and is once the clock has run out again', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: HOLD_ASSIGNMENT_ID, classId: HOLD_CLASS }));
  const examSessionId = (await readRecord(HOLD_ASSIGNMENT_ID, HOLD)).test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(HOLD, { examSessionId }));
  const lifecycle = (action) => fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: HOLD_ASSIGNMENT_ID, action }));
  // A minute left when the teacher pauses the Test Cycle.
  await elapse(examSessionId, (await untilDeadline(examSessionId)) - 60 * 1000);
  try {
    await lifecycle('unpublish');
    assert.equal((await readSession(examSessionId)).autoFinalizeAt, null, 'a stopped clock has no deadline');
    // Two hours of pause.
    await elapse(examSessionId, 2 * 60 * 60 * 1000);
    await runFinalizer();
    assert.equal((await readSession(examSessionId)).status, 'in_progress', 'the paused minute is still the student\'s');
    await lookNow(examSessionId);
    await runFinalizer();
    assert.equal((await readSession(examSessionId)).status, 'in_progress', 'made to look now, the transaction still sees the stopped clock');
    assert.equal((await readSession(examSessionId)).autoFinalizeAt, null);
  } finally {
    await lifecycle('publish');
  }
  const resumed = await readSession(examSessionId);
  assert.ok(Math.abs(secureExam.deadlineFor(resumed) - Date.now() - 60 * 1000) <= 5000, 'a minute left after the resume');
  assert.equal(resumed.autoFinalizeAt, secureExam.deadlineFor(resumed) + GRACE, 'the resume stores the moved deadline');
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'in_progress', 'not finished while that minute runs');

  await elapse(examSessionId, 60 * 1000 + GRACE + 30 * 1000);
  await runFinalizer();
  assert.equal((await readSession(examSessionId)).status, 'time_expired');
  assert.equal((await readRecord(HOLD_ASSIGNMENT_ID, HOLD)).test.state, 'submitted');
});

test('a course session the record no longer points at is left for the teacher, as the student\'s own Submit is refused', async () => {
  // HOLD_ASSIGNMENT_ID's sessions were assigned by the test above.
  const examSessionId = (await readRecord(HOLD_ASSIGNMENT_ID, REPLACED)).test.examSessionId;
  created.push(examSessionId);
  await fns.startSecureExamSession.run(student(REPLACED, { examSessionId }));
  await elapse(examSessionId, (await untilDeadline(examSessionId)) + GRACE + 60 * 1000);
  await recordRef(HOLD_ASSIGNMENT_ID, REPLACED).set({ test: { examSessionId: 'af-some-newer-attempt' } }, { merge: true });
  await runFinalizer();
  const stored = await readSession(examSessionId);
  assert.equal(stored.status, 'in_progress', 'not finished by the server');
  assert.equal(stored.autoFinalizeAt, null, 'and out of the finalizer\'s sight');
});

test('a session started before the hint existed is derived: finished when its time is up, hinted when it is not', async () => {
  const expired = await startPractice(LEGACY);
  const { first } = await openTwo(LEGACY, expired);
  const running = await startPractice(LEGACY);
  const resumedByStudent = await startPractice(LEGACY);
  // Written by the previous build: no hint at all.
  await Promise.all([expired, running, resumedByStudent].map((id) => sessionRef(id).update({ autoFinalizeAt: FieldValue.delete() })));
  // The student comes back to one of them: the resume stores its hint, and changes nothing else.
  const beforeResume = await readSession(resumedByStudent);
  await fns.startSecureExamSession.run(student(LEGACY, { examSessionId: resumedByStudent }));
  const { autoFinalizeAt: resumedHint, ...resumedRest } = await readSession(resumedByStudent);
  assert.equal(resumedHint, secureExam.deadlineFor(beforeResume) + GRACE, 'a resume derives and stores the hint');
  assert.deepEqual(resumedRest, beforeResume, 'and changes nothing else');
  await elapse(expired, (await untilDeadline(expired)) + GRACE + 60 * 1000);
  assert.equal((await readSession(expired)).autoFinalizeAt, undefined);

  await runFinalizer();
  const finished = await readSession(expired);
  assert.equal(finished.status, 'time_expired', 'its deadline is derived the way every call derives it');
  assert.equal(finished.responses[first].grading.isCorrect, true, 'graded on its saved draft');
  const hinted = await readSession(running);
  assert.equal(hinted.status, 'in_progress', 'one with time left keeps working');
  assert.equal(hinted.autoFinalizeAt, secureExam.deadlineFor(hinted) + GRACE, 'and now has its hint');

  const sweep = (await db.collection('platformMigrations').doc(SWEEP_DOC_ID).get()).data();
  assert.ok(sweep && !sweep.completedAt, 'the sweep keeps looking until a release has settled');

  const [expiredAt, runningAt] = await Promise.all([expired, running].map((id) => updateTimeOf(sessionRef(id))));
  await runFinalizer();
  assert.ok((await updateTimeOf(sessionRef(expired))).isEqual(expiredAt), 'a second run writes nothing to either');
  assert.ok((await updateTimeOf(sessionRef(running))).isEqual(runningAt));

  // Long after the release, a pass with nothing left to derive ends the sweep.
  await db.collection('platformMigrations').doc(SWEEP_DOC_ID).set({ settleAfter: 1, passStartedAt: 2, cursor: null, passFoundLegacy: 0 }, { merge: true });
  await runFinalizer();
  const done = (await db.collection('platformMigrations').doc(SWEEP_DOC_ID).get()).data();
  assert.ok(done.completedAt > 0, 'the sweep is complete');
  const doneAt = await updateTimeOf(db.collection('platformMigrations').doc(SWEEP_DOC_ID));
  await runFinalizer();
  assert.ok((await updateTimeOf(db.collection('platformMigrations').doc(SWEEP_DOC_ID))).isEqual(doneAt), 'and stays complete');
});
