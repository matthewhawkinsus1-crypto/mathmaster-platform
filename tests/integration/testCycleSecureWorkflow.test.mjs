/*
 * THE SECURE TEST CYCLE'S TEACHER AND STUDENT WORKFLOW, AGAINST THE REAL HANDLERS.
 *
 * HOW TO RUN:  npm run test:challenge-finish   (every tests/integration suite)
 *         or:  firebase emulators:exec --only firestore --project mathmaster-secure-workflow \
 *                --config tests/browser/emulator/firebase.json \
 *                "node --import ./tests/integration/support/emulatorTransactions.mjs \
 *                 --test tests/integration/testCycleSecureWorkflow.test.mjs"
 *
 * What a pure unit test cannot show is that the server is the authority: that
 * a student who calls start, issue or a corrections callable directly is
 * refused by the same rule their card states. Every refusal below is asked for
 * the way a browser (or a student with the console open) would ask.
 *
 *   - who may call what, and that a bad request is refused in words;
 *   - the Review summary a teacher grades from, read from the saved tracker;
 *   - class-wide operations: one per class, repeatable, resumable, and honest
 *     about a partial failure;
 *   - adding classes and individual students without touching existing work;
 *   - the class-time Test window from the bell schedule, and extend / reopen;
 *   - a student who missed the Test going straight to a Retest at home, its
 *     actual score kept beside the capped grade, and a teacher's audited
 *     adjustment;
 *   - Corrections and the Retest opening after the Test window and expiring;
 *   - archive and delete leaving nothing a student can open.
 *
 * TIME IS THE REAL CLOCK. A window is "open" by putting the class's period on
 * today's bell schedule for the whole day, "upcoming" by using tomorrow, and
 * "closed" by storing yesterday — the one thing written past the callable,
 * because the callable (rightly) refuses to set a day that has passed.
 *
 * Ids are prefixed `stcw` because the integration suites share one emulator.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  CERT_TARGETS, CERT_WRONG_ANSWER, certAnswerFromPrompt, certAssessmentPolicy, certFamilies,
} from '../fixtures/testCycleCertificationFixture.mjs';
import {
  OTHER_TEACHER_EMAIL, TEACHER_EMAIL, db, fns, readGradeDoc, readRecord, readSession, refusal, sitSecureExam,
  studentRequest, teacherRequest,
} from './testCycleCertificationHarness.mjs';
import { SCHOOL_TIME_ZONE } from '../../functions/shared/sectionDeadline.mjs';
import { withClassTestDay, withFollowUpClose } from '../../functions/shared/testCycleAvailability.mjs';
import { zonedDateKey } from '../../functions/shared/instructionalCalendar.mjs';

const PREFIX = 'stcw_';
const PERIOD_A = 'STCW Period A';
const PERIOD_B = 'STCW Period B';
const PERIOD_W = 'STCW Period W';
const CLASS_A = 'stcw-class-a';
const CLASS_B = 'stcw-class-b';        // the teacher's own class, not assigned at first
const CLASS_C = 'stcw-class-c';        // the teacher's own class, never assigned (an individual student comes from it)
const CLASS_OTHER = 'stcw-class-other'; // another teacher's class
const CLASS_LIFE = 'stcw-class-life';   // archive and delete
const CLASS_W = 'stcw-class-w';         // the class-time window scenarios

const MAIN = `${PREFIX}main`;
const WINDOWS = `${PREFIX}windows`;
const ARCHIVE = `${PREFIX}archive`;
const DELETE = `${PREFIX}delete`;
const QUESTIONS = 4;

const DAY = 86400000;
const todayKey = () => zonedDateKey(Date.now(), SCHOOL_TIME_ZONE);
const dayKey = (offset) => zonedDateKey(Date.now() + offset * DAY, SCHOOL_TIME_ZONE);

const families = () => certFamilies().map((family) => ({
  ...family,
  id: family.id.replace(/^cert_/, PREFIX),
  familyId: String(family.familyId).replace(/^cert_/, PREFIX),
}));
const familyIdsFor = (targetId) => families()
  .filter((family) => family.id.startsWith(`${PREFIX}${targetId}-`))
  .map((family) => family.id);

// Two targets, two questions each: a four-question secure Test, so a sitting
// is quick and a score is exact (each question is 25%).
const blueprint = () => ({
  blueprintId: `${PREFIX}blueprint`,
  version: 1,
  title: 'Secure Workflow Unit Test',
  courseId: 'algebra1',
  calculatorMode: 'questionSpecific',
  targets: CERT_TARGETS.slice(0, 2).map((target) => ({
    targetId: target.targetId,
    alignmentKey: target.alignmentKey,
    label: target.label,
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    anchor: target.anchor,
    weight: 1,
    questionCount: 2,
    familyIds: familyIdsFor(target.targetId),
  })),
});

const assignmentDoc = (id, classIds, overrides = {}) => ({
  id,
  schemaVersion: 5,
  title: `Secure Workflow ${id}`,
  courseId: 'algebra1',
  assignedClassIds: classIds,
  dueAt: '2099-01-01T00:00:00.000Z',
  lateDueAt: '2099-01-08T00:00:00.000Z',
  assignment: { title: `Secure Workflow ${id}`, courseId: 'algebra1' },
  assessmentPolicy: { ...certAssessmentPolicy(), retest: { ...certAssessmentPolicy().retest, questionCount: QUESTIONS } },
  testBlueprint: blueprint(),
  sections: [{
    id: 'review',
    role: 'review',
    title: 'Review',
    questions: [
      { questionId: `${PREFIX}review_1`, type: 'response', prompt: 'Review 1' },
      { questionId: `${PREFIX}review_2`, type: 'response', prompt: 'Review 2' },
    ],
  }],
  ...overrides,
});

// One student per scenario: nothing a test does to its student can change what
// another test finds.
const ROSTER = {
  // MAIN (class A): summary, bulk and audience.
  reviewer: ['STCW_REVIEWER', CLASS_A],     // Review answered, one item partly right
  reviewDone: ['STCW_REVIEWDONE', CLASS_A], // Review finished
  untouched: ['STCW_UNTOUCHED', CLASS_A],   // nothing done
  resumeOne: ['STCW_RESUME1', CLASS_A],
  resumeTwo: ['STCW_RESUME2', CLASS_A],
  bOne: ['STCW_B1', CLASS_B],
  bTwo: ['STCW_B2', CLASS_B],
  individual: ['STCW_INDIVIDUAL', CLASS_C],
  outsider: ['STCW_OUTSIDER', CLASS_OTHER],
  // WINDOWS (class W): one student per window scenario.
  legacy: ['STCW_LEGACY', CLASS_W],         // starts before any window exists
  waiting: ['STCW_WAITING', CLASS_W],       // Review done; never starts until the window opens
  absent: ['STCW_ABSENT', CLASS_W],         // misses the Test; Retest at home; released; adjusted
  absentReview: ['STCW_ABSENTREVIEW', CLASS_W], // misses the Test with Review unfinished
  absentExpired: ['STCW_ABSENTEXPIRED', CLASS_W], // misses the Test and the home window too
  reopened: ['STCW_REOPENED', CLASS_W],     // misses, then the teacher reopens the Test for them
  failer: ['STCW_FAILER', CLASS_W],         // takes the Test in class and fails: Corrections at home
  anytime: ['STCW_ANYTIME', CLASS_W],       // the teacher opens the Test at any time
  // ARCHIVE / DELETE (class LIFE).
  archived: ['STCW_ARCHIVED', CLASS_LIFE],
  deletedOne: ['STCW_DELETED1', CLASS_LIFE],
};
const id = (key) => ROSTER[key][0];
const nameOf = (studentId) => {
  const key = Object.keys(ROSTER).find((entry) => ROSTER[entry][0] === studentId);
  return `${key[0].toUpperCase()}${key.slice(1)} Learner`;
};
const ALL_STUDENTS = Object.values(ROSTER).map(([studentId]) => studentId);

const sit = (options) => sitSecureExam({ ...options, answerFromPrompt: certAnswerFromPrompt, wrongAnswer: CERT_WRONG_ANSWER });
const card = (studentId, assignmentId) => fns.getStudentTestCycle.run(studentRequest(studentId, { assignmentId }));
const listing = (assignmentId, email = TEACHER_EMAIL) => fns.listTeacherTestCycleRecords.run(teacherRequest({ assignmentId }, email));
const rowFor = async (assignmentId, studentId) => (await listing(assignmentId)).rows.find((row) => row.studentId === studentId);
const completeReview = (studentId, assignmentId) => db.collection('grades').doc(studentId).set({
  gradesByAssignment: { [assignmentId]: { 0: { status: 'correct' }, 1: { status: 'correct' } } },
}, { merge: true });
let operationSeq = 0;
const operationId = (label) => `${PREFIX}${label}-${Date.now()}-${operationSeq += 1}`;
const bulk = (assignmentId, action, scope, operation = operationId(action), email = TEACHER_EMAIL) => (
  fns.runTestCycleBulkAction.run(teacherRequest({ assignmentId, action, scope, operationId: operation }, email))
);
const sessionsOf = async (assignmentId) => (
  await db.collection('examSessions').where('courseTest.assignmentId', '==', assignmentId).get()
).docs.map((doc) => doc.data());
const availability = (assignmentId, data) => fns.updateTestCycleAvailability.run(teacherRequest({ assignmentId, ...data }));
const storeAvailability = (assignmentId, value) => db.collection('assignments').doc(assignmentId).update({ testAvailability: value });

/** The class's period on the bell schedule for these days, all day long. */
const putPeriodOnBellSchedule = async (dateKeys) => {
  const modifiedSchedules = Object.fromEntries(dateKeys.map((dateKey) => [dateKey, {
    periods: {
      [PERIOD_A]: { enabled: true, start: '00:00', end: '23:59' },
      [PERIOD_B]: { enabled: true, start: '00:00', end: '23:59' },
      [PERIOD_W]: { enabled: true, start: '00:00', end: '23:59' },
    },
  }]));
  await db.collection('settings').doc('classSchedule').set({ modifiedSchedules }, { merge: true });
};

before(async () => {
  await Promise.all(families().map(({ id: familyId, ...fields }) => db.collection('pathQuestionBank').doc(familyId).set(fields)));
  const classes = [
    [CLASS_A, PERIOD_A, TEACHER_EMAIL],
    [CLASS_B, PERIOD_B, TEACHER_EMAIL],
    [CLASS_C, 'STCW Period C', TEACHER_EMAIL],
    [CLASS_OTHER, 'STCW Period O', OTHER_TEACHER_EMAIL],
    [CLASS_LIFE, 'STCW Period L', TEACHER_EMAIL],
    [CLASS_W, PERIOD_W, TEACHER_EMAIL],
  ];
  await Promise.all(classes.map(([classId, period, teacherOfRecord]) => db.collection('classes').doc(classId).set({
    name: `Secure Workflow ${period}`, course: 'algebra1', courseLevel: 'standard', period, teacherOfRecord, status: 'active',
  })));
  await Promise.all(Object.values(ROSTER).map(([studentId, classId]) => db.collection('grades').doc(studentId).set({
    // A real-looking name: the identity resolver refuses one that merely repeats the id.
    displayName: nameOf(studentId), classId, classPeriod: classes.find((entry) => entry[0] === classId)[1],
    assignedTeacherEmail: classId === CLASS_OTHER ? OTHER_TEACHER_EMAIL : TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  })));
  await Promise.all([
    db.collection('assignments').doc(MAIN).set(assignmentDoc(MAIN, [CLASS_A])),
    db.collection('assignments').doc(WINDOWS).set(assignmentDoc(WINDOWS, [CLASS_W])),
    db.collection('assignments').doc(ARCHIVE).set(assignmentDoc(ARCHIVE, [CLASS_LIFE])),
    db.collection('assignments').doc(DELETE).set(assignmentDoc(DELETE, [CLASS_LIFE])),
  ]);
  await putPeriodOnBellSchedule([dayKey(-1), todayKey(), dayKey(1)]);
});

after(async () => {
  const assignmentIds = [MAIN, WINDOWS, ARCHIVE, DELETE];
  const cleanup = [];
  for (const assignmentId of assignmentIds) {
    // eslint-disable-next-line no-await-in-loop
    const [sessions, operations] = await Promise.all([
      db.collection('examSessions').where('courseTest.assignmentId', '==', assignmentId).get(),
      db.collection('testCycleOperations').where('assignmentId', '==', assignmentId).get(),
    ]);
    cleanup.push(
      db.collection('assignments').doc(assignmentId).delete(),
      db.collection('testCycleAnswerReleases').doc(assignmentId).delete(),
      db.collection('assignmentDeletionLog').doc(assignmentId).delete(),
      ...sessions.docs.map((doc) => doc.ref.delete()),
      ...operations.docs.map((doc) => doc.ref.delete()),
      ...ALL_STUDENTS.flatMap((studentId) => [
        db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).delete(),
        db.collection('testCycleCorrectionPlans').doc(`${assignmentId}__${studentId}`).delete(),
        db.collection('testCycleRetestPlans').doc(`${assignmentId}__${studentId}`).delete(),
      ]),
    );
  }
  const FieldValue = (await import('./testCycleCertificationHarness.mjs')).admin.firestore.FieldValue;
  cleanup.push(db.collection('settings').doc('classSchedule').set({
    modifiedSchedules: Object.fromEntries([dayKey(-1), todayKey(), dayKey(1)].map((dateKey) => [dateKey, FieldValue.delete()])),
  }, { merge: true }));
  await Promise.allSettled([
    ...cleanup,
    ...families().map((family) => db.collection('pathQuestionBank').doc(family.id).delete()),
    ...[CLASS_A, CLASS_B, CLASS_C, CLASS_OTHER, CLASS_LIFE, CLASS_W].map((classId) => db.collection('classes').doc(classId).delete()),
    ...ALL_STUDENTS.map((studentId) => db.collection('grades').doc(studentId).delete()),
  ]);
});

/* --- who may call what, and how a bad request is refused ------------------ */

test('a teacher callable asks who is calling before it reads anything, and refuses a bad id in words', async () => {
  const anonymous = { data: {}, rawRequest: { headers: {} } };
  const callables = [
    'teacherTestCycleAction', 'assignTestCycleSessions', 'listTeacherTestCycleRecords', 'getTeacherTestCyclePlans',
    'preflightTestCycleAssignment', 'releaseTestCycleResults', 'releaseTestCycleAnswers', 'updateTestCyclePolicy',
    'getAssignmentEvidenceSummary', 'manageAssignmentLifecycle', 'runTestCycleBulkAction', 'getTestCycleOperation',
    'updateTestCycleAudience', 'updateTestCycleAvailability', 'adjustTestCycleGrade',
  ];
  for (const name of callables) {
    // No sign-in and no assignmentId: this used to crash on the read and reach
    // the browser as a bare server error.
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await refusal(fns[name].run(anonymous)))?.code, 'unauthenticated', `${name} without sign-in`);
    // Not signed in, naming a real assignment: told nothing about it.
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await refusal(fns[name].run({ ...anonymous, data: { assignmentId: MAIN } })))?.code, 'unauthenticated', `${name} must not reveal an assignment`);
    // A student is not a teacher.
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await refusal(fns[name].run(studentRequest(id('reviewer'), { assignmentId: MAIN }))))?.code, 'permission-denied', `${name} as a student`);
    for (const assignmentId of [undefined, '', '   ', 'a/b', '__reserved__']) {
      // eslint-disable-next-line no-await-in-loop
      const refused = await refusal(fns[name].run(teacherRequest({ assignmentId })));
      assert.equal(refused?.code, 'invalid-argument', `${name} with assignmentId ${JSON.stringify(assignmentId)}`);
      assert.match(refused.message, /valid assignmentId/);
    }
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await refusal(fns[name].run(teacherRequest({ assignmentId: `${PREFIX}no-such-assignment` }))))?.code, 'not-found', `${name} unknown assignment`);
    // Another teacher's Test is not theirs to see or change.
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await refusal(fns[name].run(teacherRequest({ assignmentId: MAIN }, OTHER_TEACHER_EMAIL))))?.code, 'permission-denied', `${name} as another teacher`);
  }
});

/* --- the Review, as a grade a teacher can use ----------------------------- */

test('the teacher sees each student\'s Review as attempted/total, points, percent, status and when it was last saved', async () => {
  const savedAt = '2026-10-09T15:04:05.000Z';
  await db.collection('grades').doc(id('reviewer')).set({
    gradesByAssignment: {
      [MAIN]: {
        0: { status: 'correct', lastAttemptAt: '2026-10-08T14:00:00.000Z' },
        1: { status: 'attempted', attemptCount: 2, bestPartialCredit: 50, lastAttemptAt: savedAt },
      },
      // Another assignment's work must not leak into this one's numbers.
      [`${PREFIX}elsewhere`]: { 0: { status: 'correct' }, 1: { status: 'correct' } },
    },
  }, { merge: true });
  await completeReview(id('reviewDone'), MAIN);
  const before = await readGradeDoc(id('reviewer'));

  const table = await listing(MAIN);
  const reviewer = table.rows.find((row) => row.studentId === id('reviewer'));
  assert.equal(reviewer.review.attempted, 2);
  assert.equal(reviewer.review.total, 2);
  assert.equal(reviewer.review.earnedPoints, 1.5, 'one right plus half credit');
  assert.equal(reviewer.review.possiblePoints, 2);
  assert.equal(reviewer.review.percent, 75);
  assert.equal(reviewer.review.correct, 1);
  assert.equal(reviewer.review.status, 'complete', 'every Review question answered is what unlocks the Test');
  assert.equal(reviewer.review.lastSavedAt, Date.parse(savedAt), 'the latest saved answer, not the first');
  assert.match(reviewer.review.lastSavedLabel, /Oct 9/);
  assert.equal(reviewer.studentName, 'Reviewer Learner');

  const untouched = table.rows.find((row) => row.studentId === id('untouched'));
  assert.deepEqual(
    [untouched.review.attempted, untouched.review.earnedPoints, untouched.review.percent, untouched.review.status, untouched.review.lastSavedAt],
    [0, 0, 0, 'notStarted', null],
  );
  assert.equal(table.rows.find((row) => row.studentId === id('reviewDone')).review.percent, 100);
  // Every student in the class is a row, whether or not they have a record.
  for (const key of ['reviewer', 'reviewDone', 'untouched', 'resumeOne', 'resumeTwo']) {
    assert.ok(table.rows.some((row) => row.studentId === id(key)), `${key} is on the table`);
  }
  assert.equal(table.rows.some((row) => row.studentId === id('outsider')), false);
  // Reading the summary writes nothing: the saved work is exactly as it was.
  assert.deepEqual(await readGradeDoc(id('reviewer')), before);
  // Nothing is enforced until a teacher sets a Test day.
  const classA = table.testSchedule.classes.find((entry) => entry.classId === CLASS_A);
  assert.equal(classA.test.state, 'unset');
  assert.match(classA.test.headline, /No class-time window is set/);
  assert.ok(classA.upcomingDays.length > 0, 'the days the class sits are offered from the bell schedule');
});

/* --- class-wide operations ------------------------------------------------ */

test('opening Test sessions for a class is one operation that can be repeated without a second session', async () => {
  const first = await bulk(MAIN, 'openTestSessions', { kind: 'all' });
  assert.equal(first.status, 'completed');
  assert.equal(first.tone, 'success');
  assert.equal(first.counts.total, 5);
  assert.equal(first.counts.succeeded, 5);
  assert.equal(first.counts.failed + first.counts.pending, 0);
  assert.match(first.headline, /finished for 5 students: 5 succeeded, 0 failed/);
  const opened = await sessionsOf(MAIN);
  assert.equal(opened.length, 5);

  // The same operation id, sent again (a retry after a dropped response).
  const replay = await fns.runTestCycleBulkAction.run(teacherRequest({
    assignmentId: MAIN, action: 'openTestSessions', scope: { kind: 'all' }, operationId: first.operationId,
  }));
  assert.equal(replay.status, 'completed');
  assert.deepEqual(replay.counts, first.counts);
  // A second, new operation finds every session open already.
  const again = await bulk(MAIN, 'openTestSessions', { kind: 'class', classId: CLASS_A });
  assert.equal(again.counts.alreadyComplete, 5);
  assert.equal(again.counts.succeeded, 0);
  assert.equal(again.tone, 'success');
  assert.deepEqual((await sessionsOf(MAIN)).map((session) => session.examSessionId).sort(), opened.map((session) => session.examSessionId).sort(),
    'no student has a second Test session');

  // The old class-wide callable agrees: it reuses, it does not mint.
  const legacy = await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: MAIN, classId: CLASS_A }));
  assert.deepEqual([legacy.createdSessions, legacy.reusedSessions], [0, 5]);
  // The operation is on the panel, with its account.
  const table = await listing(MAIN);
  assert.ok(table.operations.some((operation) => operation.operationId === first.operationId && operation.status === 'completed'));
  assert.equal((await fns.getTestCycleOperation.run(teacherRequest({ assignmentId: MAIN, operationId: first.operationId }))).counts.succeeded, 5);
});

test('a class-wide Waive Review reports each outcome and never calls a partial failure a success', async () => {
  const result = await bulk(MAIN, 'waiveReview', {
    kind: 'students',
    studentIds: [id('reviewDone'), id('untouched'), 'STCW_NOT_ON_ROSTER', 'not/an-id', id('outsider')],
  });
  const outcome = (studentId) => result.results.find((entry) => entry.studentId === studentId);
  assert.equal(outcome(id('untouched')).outcome, 'succeeded');
  assert.equal(outcome(id('reviewDone')).outcome, 'alreadyComplete');
  assert.match(outcome(id('reviewDone')).detail, /already finished/);
  assert.equal(outcome('STCW_NOT_ON_ROSTER').outcome, 'notEligible');
  assert.equal(outcome(id('outsider')).outcome, 'notEligible');
  assert.match(outcome(id('outsider')).detail, /not assigned this Test Cycle/);
  assert.equal(outcome('not/an-id').outcome, 'failed');
  assert.match(outcome('not/an-id').detail, /not a valid student ID/);

  assert.deepEqual(result.counts, { total: 5, succeeded: 1, alreadyComplete: 1, notEligible: 2, failed: 1, pending: 0 });
  assert.equal(result.status, 'completedWithFailures');
  assert.equal(result.tone, 'error', 'one failure is not a success');
  assert.match(result.headline, /did not finish for everyone: 1 succeeded, 1 already complete, 2 not eligible, 1 failed/);
  assert.deepEqual(result.failures, [{ studentId: 'not/an-id', detail: 'That is not a valid student ID.' }]);

  // What it said happened, happened — and only that.
  assert.equal((await readRecord(MAIN, id('untouched'))).teacherControls.reviewWaived, true);
  assert.equal((await readRecord(MAIN, id('reviewDone'))).teacherControls.reviewWaived, false);
  assert.equal((await db.collection('testCycleRecords').doc(`${MAIN}__${id('outsider')}`).get()).exists, false, 'no record is minted for a student the Test is not for');
  assert.equal((await rowFor(MAIN, id('untouched'))).bucket, 'readyForTest');

  // Running it again is safe: the waived student is now "already complete".
  const again = await bulk(MAIN, 'waiveReview', { kind: 'students', studentIds: [id('untouched')] });
  assert.deepEqual([again.counts.succeeded, again.counts.alreadyComplete, again.tone], [0, 1, 'success']);
});

test('an interrupted operation continues with the students it had not reached, and a busy one is not worked twice', async () => {
  const interrupted = operationId('resume');
  const reference = db.collection('testCycleOperations').doc(`${MAIN}__${interrupted}`);
  // As the server leaves it when a request ends mid-way: one student done.
  await reference.set({
    operationId: interrupted,
    assignmentId: MAIN,
    action: 'waiveReview',
    scope: { kind: 'students' },
    requestedBy: TEACHER_EMAIL,
    targetStudentIds: [id('reviewDone'), id('resumeOne'), id('resumeTwo')],
    results: { [id('reviewDone')]: { outcome: 'alreadyComplete', detail: 'Recorded before the interruption.', at: 5 } },
    status: 'running',
    createdAt: Date.now() - 5000,
    updatedAt: Date.now() - 5000,
    completedAt: null,
    // Another request is working it right now.
    lease: { id: 'someone-else', until: Date.now() + 30000 },
  });
  assert.ok((await listing(MAIN)).operations.some((operation) => operation.operationId === interrupted && operation.status === 'running'),
    'an unfinished operation is on the panel to be finished');

  const busy = await bulk(MAIN, 'waiveReview', { kind: 'all' }, interrupted);
  assert.equal(busy.busy, true);
  assert.equal(busy.status, 'running');
  assert.equal(busy.counts.pending, 2);
  assert.match(busy.headline, /1 of 3 students done so far/);
  assert.equal((await readRecord(MAIN, id('resumeOne')))?.teacherControls?.reviewWaived || false, false, 'nothing was done while another request held it');

  // That request died: its lease runs out, and the next call takes over.
  await reference.update({ lease: { id: 'someone-else', until: Date.now() - 1 } });
  const resumed = await bulk(MAIN, 'waiveReview', { kind: 'all' }, interrupted);
  assert.equal(resumed.status, 'completed');
  assert.deepEqual(resumed.counts, { total: 3, succeeded: 2, alreadyComplete: 1, notEligible: 0, failed: 0, pending: 0 });
  // The outcome recorded before the interruption is kept, not redone.
  assert.equal(resumed.results.find((entry) => entry.studentId === id('reviewDone')).detail, 'Recorded before the interruption.');
  // The scope sent on a resume is ignored: the operation keeps its own three students.
  assert.equal(resumed.results.length, 3);
  assert.equal((await readRecord(MAIN, id('resumeOne'))).teacherControls.reviewWaived, true);
  assert.equal((await readRecord(MAIN, id('resumeTwo'))).teacherControls.reviewWaived, true);
  assert.equal((await reference.get()).data().lease, undefined, 'the lease is released');

  // An operation id belongs to one action.
  const reused = await refusal(bulk(MAIN, 'openTestSessions', { kind: 'all' }, interrupted));
  assert.equal(reused.code, 'failed-precondition');
  assert.match(reused.message, /already used for a different action/);
  assert.equal((await refusal(bulk(MAIN, 'waiveReview', { kind: 'all' }, 'short')))?.code, 'invalid-argument');
  assert.equal((await refusal(bulk(MAIN, 'resetEverything', { kind: 'all' })))?.code, 'invalid-argument');
  assert.equal((await refusal(bulk(MAIN, 'waiveReview', { kind: 'class', classId: CLASS_OTHER })))?.code, 'invalid-argument');
});

/* --- adding to the audience ----------------------------------------------- */

test('adding a class and a student keeps every existing session, record and answer exactly as it was', async () => {
  const snapshotOf = async () => ({
    sessions: (await sessionsOf(MAIN)).map((session) => session.examSessionId).sort(),
    reviewerRecord: await readRecord(MAIN, id('reviewer')),
    untouchedRecord: await readRecord(MAIN, id('untouched')),
    reviewerWork: (await readGradeDoc(id('reviewer'))).gradesByAssignment[MAIN],
  });
  const beforeAdding = await snapshotOf();

  // Another teacher cannot add to this Test at all; nor can a student.
  assert.equal((await refusal(fns.updateTestCycleAudience.run(teacherRequest({ assignmentId: MAIN, addClassIds: [CLASS_OTHER] }, OTHER_TEACHER_EMAIL))))?.code, 'permission-denied');
  assert.equal((await refusal(fns.updateTestCycleAudience.run(teacherRequest({ assignmentId: MAIN }))))?.code, 'invalid-argument');

  const added = await fns.updateTestCycleAudience.run(teacherRequest({
    assignmentId: MAIN,
    addClassIds: [CLASS_B, CLASS_OTHER, CLASS_A, `${PREFIX}no-such-class`],
    addStudentIds: [id('individual'), id('outsider'), id('reviewer'), 'STCW_NOBODY'],
    sitsWithClassId: CLASS_A,
  }));
  const classOutcome = (classId) => added.classes.find((entry) => entry.classId === classId);
  assert.equal(classOutcome(CLASS_B).outcome, 'added');
  assert.equal(classOutcome(CLASS_A).outcome, 'alreadyAssigned');
  assert.equal(classOutcome(CLASS_OTHER).outcome, 'failed');
  assert.match(classOutcome(CLASS_OTHER).detail, /not the teacher of record for that class/);
  assert.equal(classOutcome(`${PREFIX}no-such-class`).outcome, 'failed');
  const studentOutcome = (studentId) => added.students.find((entry) => entry.studentId === studentId);
  assert.equal(studentOutcome(id('individual')).outcome, 'added');
  assert.equal(studentOutcome(id('reviewer')).outcome, 'alreadyAssigned');
  assert.equal(studentOutcome(id('outsider')).outcome, 'failed');
  assert.match(studentOutcome(id('outsider')).detail, /not the teacher of record for that student's class/);
  assert.equal(studentOutcome('STCW_NOBODY').outcome, 'failed');
  assert.deepEqual(added.counts, { classesAdded: 1, studentsAdded: 1, alreadyAssigned: 2, failed: 4 });

  const stored = (await db.collection('assignments').doc(MAIN).get()).data();
  assert.deepEqual(stored.assignedClassIds, [CLASS_A, CLASS_B]);
  assert.ok(stored.assignedClassPeriods.includes(PERIOD_B));
  // The shared document, which every student can read, names no student.
  assert.equal(JSON.stringify(stored).includes(id('individual')), false);
  assert.ok(stored.audienceHistory.some((entry) => entry.by === TEACHER_EMAIL && entry.addedClassIds?.includes(CLASS_B)));
  assert.ok(stored.audienceHistory.some((entry) => entry.addedStudentCount === 1));

  // Nothing that existed was touched.
  assert.deepEqual(await snapshotOf(), beforeAdding);

  // The individually added student is assigned: on their own record and row.
  const record = await readRecord(MAIN, id('individual'));
  assert.equal(record.audience.individual, true);
  assert.equal(record.audience.withClassId, CLASS_A);
  assert.equal(record.audience.addedBy, TEACHER_EMAIL);
  assert.equal(record.test.examSessionId, null, 'adding opens no session');
  assert.equal((await readGradeDoc(id('individual'))).testCycleGrades[MAIN].individuallyAssigned, true);
  assert.equal((await card(id('individual'), MAIN)).stage, 'review', 'they can open the assessment');
  // A student nobody added still cannot.
  assert.equal((await refusal(card(id('outsider'), MAIN)))?.code, 'permission-denied');

  // Adding the same again changes nothing and says so.
  const repeat = await fns.updateTestCycleAudience.run(teacherRequest({ assignmentId: MAIN, addClassIds: [CLASS_B], addStudentIds: [id('individual')] }));
  assert.deepEqual(repeat.counts, { classesAdded: 0, studentsAdded: 0, alreadyAssigned: 2, failed: 0 });
  assert.deepEqual((await db.collection('assignments').doc(MAIN).get()).data().assignedClassIds, [CLASS_A, CLASS_B]);

  // The table reviews who is assigned: both classes and the added student.
  const table = await listing(MAIN);
  assert.deepEqual(table.audience.classIds, [CLASS_A, CLASS_B]);
  assert.deepEqual(table.audience.individualStudentIds, [id('individual')]);
  assert.equal(table.rows.find((row) => row.studentId === id('individual')).individuallyAssigned, true);
  assert.ok(table.rows.some((row) => row.studentId === id('bOne')));
  assert.equal(table.testSchedule.classes.length, 2);

  // Opening sessions for everyone reaches the new class and the added student,
  // and gives nobody who had a session a second one.
  const opened = await bulk(MAIN, 'openTestSessions', { kind: 'all' });
  assert.deepEqual([opened.counts.total, opened.counts.succeeded, opened.counts.alreadyComplete, opened.counts.failed], [8, 3, 5, 0]);
  const after = await sessionsOf(MAIN);
  assert.equal(after.length, 8);
  for (const sessionId of beforeAdding.sessions) assert.ok(after.some((session) => session.examSessionId === sessionId));
  assert.deepEqual(await snapshotOf().then((value) => ({ ...value, sessions: beforeAdding.sessions })), beforeAdding);
});

/* --- the class-time Test window ------------------------------------------- */

test('the Test opens in the class period from the bell schedule: refused before, open during, and extendable', async () => {
  await Promise.all(['legacy', 'waiting', 'absent', 'absentReview', 'absentExpired', 'reopened', 'failer', 'anytime']
    .filter((key) => key !== 'absentReview')
    .map((key) => completeReview(id(key), WINDOWS)));
  const opened = await bulk(WINDOWS, 'openTestSessions', { kind: 'class', classId: CLASS_W });
  assert.equal(opened.counts.failed, 0);
  assert.equal(opened.counts.succeeded, 8);

  // No window yet: exactly as before this feature. The Test can be started.
  const legacyCard = await card(id('legacy'), WINDOWS);
  assert.equal(legacyCard.canEnter, true);
  assert.equal(legacyCard.schedule.test.state, 'unset');
  assert.equal(legacyCard.delivery.timed, false, 'availability is not a timer');
  await fns.startSecureExamSession.run(studentRequest(id('legacy'), { examSessionId: legacyCard.examSessionId }));

  // The teacher sets the Test day: tomorrow, read from the bell schedule.
  const tomorrow = await availability(WINDOWS, { action: 'setClassTestDay', classId: CLASS_W, dateKey: dayKey(1) });
  assert.match(tomorrow.notes[0], /Test window: .*12:00 AM C[DS]T – 11:59 PM C[DS]T/);
  const table = await listing(WINDOWS);
  const classA = table.testSchedule.classes.find((entry) => entry.classId === CLASS_W);
  assert.equal(table.testSchedule.timeZone, SCHOOL_TIME_ZONE);
  assert.equal(classA.test.state, 'upcoming');
  assert.match(classA.test.headline, /^Opens .* 12:00 AM C[DS]T$/);
  assert.match(classA.test.home, /taken in class/);
  assert.equal(classA.test.workFromHome, false);
  assert.equal(classA.followUp.state, 'upcoming');
  assert.match(classA.followUp.detail, /final due date/);
  assert.match(classA.followUp.home, /from home/);

  // The student is told the same thing, and the server enforces it.
  const waitingCard = await card(id('waiting'), WINDOWS);
  assert.equal(waitingCard.stage, 'test');
  assert.equal(waitingCard.canEnter, false);
  assert.equal(waitingCard.actionLabel, 'Opens in class');
  assert.match(waitingCard.detail, /opens .* 12:00 AM C[DS]T, during your class period/);
  assert.equal(waitingCard.schedule.test.state, 'upcoming');
  assert.match(waitingCard.schedule.test.home, /cannot start it from home/);
  const early = await refusal(fns.startSecureExamSession.run(studentRequest(id('waiting'), { examSessionId: waitingCard.examSessionId })));
  assert.equal(early.code, 'failed-precondition');
  assert.match(early.message, /opens .* during your class period/);
  assert.equal((await readSession(waitingCard.examSessionId)).status, 'not_started');
  // The Tests & Exams list and a saved link use the same start call: refused there too.
  assert.equal((await refusal(fns.issueSecureExamQuestion.run(studentRequest(id('waiting'), { examSessionId: waitingCard.examSessionId }))))?.code, 'failed-precondition');
  // A student who had already started is not shut out of the Test they are in.
  const midTest = await fns.issueSecureExamQuestion.run(studentRequest(id('legacy'), { examSessionId: legacyCard.examSessionId }));
  assert.ok(midTest.questionInstance, 'an attempt under way continues outside the window');

  // A day the class does not meet is refused with the days it does.
  await db.collection('settings').doc('classSchedule').set({ modifiedSchedules: { [dayKey(3)]: { periods: { [PERIOD_B]: { enabled: true, start: '09:00', end: '10:00' } } } } }, { merge: true });
  const noClass = await refusal(availability(WINDOWS, { action: 'setClassTestDay', classId: CLASS_W, dateKey: dayKey(3) }));
  assert.equal(noClass.code, 'failed-precondition');
  assert.match(noClass.message, /does not meet on/);
  assert.equal((await refusal(availability(WINDOWS, { action: 'setClassTestDay', classId: CLASS_W, dateKey: dayKey(-1) })))?.code, 'invalid-argument', 'a day that has passed');
  assert.equal((await refusal(availability(WINDOWS, { action: 'setClassTestDay', classId: CLASS_OTHER, dateKey: dayKey(1) })))?.code, 'invalid-argument', 'a class the Test is not assigned to');

  // Today: the window is open and the Test starts.
  await availability(WINDOWS, { action: 'setClassTestDay', classId: CLASS_W, dateKey: todayKey() });
  const openCard = await card(id('waiting'), WINDOWS);
  assert.equal(openCard.canEnter, true);
  assert.equal(openCard.schedule.test.state, 'open');
  assert.match(openCard.schedule.test.headline, /^Open now until .* 11:59 PM C[DS]T$/);
  await fns.startSecureExamSession.run(studentRequest(id('waiting'), { examSessionId: openCard.examSessionId }));
  assert.equal((await readSession(openCard.examSessionId)).status, 'in_progress');

  // Extending keeps the same window open past the bell; the audit says who.
  const stored = (await db.collection('assignments').doc(WINDOWS).get()).data();
  const windowId = stored.testAvailability.classWindows[CLASS_W][0].id;
  const until = Date.now() + 2 * DAY;
  const extended = await availability(WINDOWS, { action: 'extendClassWindow', classId: CLASS_W, windowId, closesAt: until });
  assert.equal(extended.testAvailability.classWindows[CLASS_W][0].closesAtOverride, until);
  assert.equal((await listing(WINDOWS)).testSchedule.classes[0].test.closesAt, until);
  const history = (await db.collection('assignments').doc(WINDOWS).get()).data().testAvailabilityHistory;
  assert.deepEqual(history.map((entry) => entry.action), ['setClassTestDay', 'setClassTestDay', 'extendClassWindow']);
  assert.ok(history.every((entry) => entry.by === TEACHER_EMAIL && entry.at > 0));
});

/* --- a student who missed the Test ---------------------------------------- */

test('a student who missed the Test goes straight to a Retest at home; its actual score is kept beside the capped grade', async () => {
  // The Test day was yesterday: the window has closed.
  await storeAvailability(WINDOWS, withClassTestDay(null, { classId: CLASS_W, dateKey: dayKey(-1) }));
  const absent = id('absent');
  const originalTest = (await readRecord(WINDOWS, absent)).test.examSessionId;

  // Review is still required: a student who has not finished it is sent there,
  // and is not given a Retest behind it.
  const reviewCard = await card(id('absentReview'), WINDOWS);
  assert.equal(reviewCard.stage, 'review');
  assert.match(reviewCard.detail, /Test window has closed, so you will take the Retest instead/);
  assert.equal((await readRecord(WINDOWS, id('absentReview'))).retest.examSessionId, null);
  assert.equal((await rowFor(WINDOWS, id('absentReview'))).bucket, 'missedTest');

  // Opening their card opens the Retest: nobody has to notice they were absent.
  const missedCard = await card(absent, WINDOWS);
  assert.equal(missedCard.stage, 'retest');
  assert.equal(missedCard.canEnter, true);
  assert.equal(missedCard.schedule.missedTest, true);
  assert.match(missedCard.detail, /did not take the Test in its class-time window, so you go straight to the Retest/);
  assert.match(missedCard.detail, /no corrections to do/);
  assert.match(missedCard.detail, /actual Retest score is kept and shown; the grade recorded from it is at most 70%/);
  assert.equal(missedCard.corrections, null);
  assert.deepEqual(missedCard.phases.map((phase) => `${phase.id}:${phase.status}`), ['review:completed', 'test:missed', 'corrections:notRequired', 'retest:ready']);
  assert.equal(missedCard.schedule.followUp.state, 'open');
  assert.match(missedCard.schedule.followUp.headline, /^Open now until Wed, Jan 7, 6:00 PM CST$/, 'the assignment\'s late due date, in school time');
  assert.match(missedCard.schedule.followUp.home, /from home/);
  const record = await readRecord(WINDOWS, absent);
  assert.equal(record.retest.withoutOriginal, true);
  assert.equal(record.retest.examSessionId, missedCard.examSessionId);
  assert.equal(record.test.examSessionId, originalTest, 'the unstarted Test is kept, not deleted');
  const retestSession = await readSession(missedCard.examSessionId);
  assert.equal(retestSession.courseTest.cycleStage, 'retest');
  assert.equal(retestSession.requiredQuestions, QUESTIONS, 'the whole Test blueprint, as a Retest form');
  // Opening the card again opens no second Retest.
  assert.equal((await card(absent, WINDOWS)).examSessionId, missedCard.examSessionId);
  assert.equal((await sessionsOf(WINDOWS)).filter((session) => session.studentId === absent).length, 2);

  // The original Test cannot be opened any more, by any route.
  const tooLate = await refusal(fns.startSecureExamSession.run(studentRequest(absent, { examSessionId: originalTest })));
  assert.equal(tooLate.code, 'failed-precondition');
  assert.equal((await readSession(originalTest)).status, 'not_started');
  const row = await rowFor(WINDOWS, absent);
  assert.equal(row.bucket, 'missedTest');
  assert.equal(row.missedTest, true);

  // They sit the Retest at home and get everything right.
  await sit({ studentId: absent, examSessionId: missedCard.examSessionId, correctCount: QUESTIONS, total: QUESTIONS });
  await fns.finalizeSecureExam.run(studentRequest(absent, { examSessionId: missedCard.examSessionId }));
  assert.equal((await card(absent, WINDOWS)).stage, 'retestSubmitted');
  const release = await fns.releaseTestCycleResults.run(teacherRequest({ assignmentId: WINDOWS, stage: 'retest', studentIds: [absent] }));
  assert.equal(release.released, 1);

  // Stored as a Retest score, in full; recorded at the cap; nothing substituted.
  const released = await readRecord(WINDOWS, absent);
  assert.equal(released.retest.rawScore, 100);
  assert.equal(released.test.rawScore, null, 'no original score is invented');
  assert.equal(released.recordedGrade, 70);
  assert.equal(released.corrections.required, false);
  const finalCard = await card(absent, WINDOWS);
  assert.equal(finalCard.stage, 'complete');
  assert.deepEqual(finalCard.grade.rows.map((entry) => `${entry.label}=${entry.value}`), [
    'Original Test=Not taken', 'Retest=100% raw', 'Retest policy=capped at 70%', 'Recorded grade=70%',
  ]);
  assert.match(finalCard.grade.reason, /No original Test was taken\. The Retest score was 100%; it is recorded at the 70% retest cap/);
  const gradeRow = await rowFor(WINDOWS, absent);
  assert.deepEqual(
    [gradeRow.originalTestGrade, gradeRow.rawRetestGrade, gradeRow.retestCappedContribution, gradeRow.recordedGrade, gradeRow.retestWithoutOriginal],
    [null, 100, 70, 70, true],
  );
  assert.equal((await readGradeDoc(absent)).testCycleGrades[WINDOWS].recordedGrade, 70);
});

test('a teacher sets the grade by hand from a named source, and every change is audited', async () => {
  const absent = id('absent');
  const adjust = (data, email = TEACHER_EMAIL) => fns.adjustTestCycleGrade.run(teacherRequest({ assignmentId: WINDOWS, studentId: absent, ...data }, email));
  assert.equal((await refusal(adjust({ source: 'retestActual' }, OTHER_TEACHER_EMAIL)))?.code, 'permission-denied');
  assert.equal((await refusal(adjust({ source: 'somethingElse' })))?.code, 'invalid-argument');
  assert.equal((await refusal(adjust({ source: 'manual', grade: 88 })))?.code, 'invalid-argument', 'a typed grade needs a note');
  assert.equal((await refusal(adjust({ source: 'manual', grade: 140, note: 'typo' })))?.code, 'invalid-argument');
  assert.equal((await refusal(fns.adjustTestCycleGrade.run(teacherRequest({ assignmentId: WINDOWS, studentId: id('outsider'), source: 'review' }))))?.code, 'permission-denied');

  // The actual Retest score, read by the server: a number sent from the browser is ignored.
  const actual = await adjust({ source: 'retestActual', grade: 3, note: 'Absent with a doctor\'s note' });
  assert.equal(actual.recordedGrade, 100);
  assert.equal(actual.ruleRecordedGrade, 70);
  let record = await readRecord(WINDOWS, absent);
  assert.equal(record.recordedGrade, 100);
  assert.equal(record.retest.rawScore, 100, 'the secure score itself is untouched');
  assert.deepEqual(
    (({ grade, source, note, by }) => ({ grade, source, note, by }))(record.gradeAdjustment),
    { grade: 100, source: 'retestActual', note: 'Absent with a doctor\'s note', by: TEACHER_EMAIL },
  );
  const audit = record.history.at(-1);
  assert.equal(audit.reason, 'teacherAdjustment');
  assert.deepEqual([audit.by, audit.source, audit.previousRecordedGrade, audit.recordedGrade, audit.rawRetestGrade], [TEACHER_EMAIL, 'retestActual', 70, 100, 100]);
  const row = await rowFor(WINDOWS, absent);
  assert.deepEqual([row.recordedGrade, row.recordedGradeSource, row.ruleRecordedGrade, row.rawRetestGrade], [100, 'teacherAdjustment', 70, 100]);
  assert.match(row.gradeReason, /Set by the teacher to 100% from the actual Retest score .* The grade rule alone would record 70%/);
  const studentCard = await card(absent, WINDOWS);
  assert.ok(studentCard.grade.rows.some((entry) => entry.key === 'gradeAdjustment' && /100% from the actual Retest score/.test(entry.value)));

  // The Review score, also read by the server from the saved Review work.
  const review = await adjust({ source: 'review' });
  assert.equal(review.recordedGrade, 100, 'this student finished the Review with full credit');
  // A typed grade, with its note.
  const typed = await adjust({ source: 'manual', grade: 85, note: 'Agreed with the family' });
  assert.equal(typed.recordedGrade, 85);
  record = await readRecord(WINDOWS, absent);
  assert.deepEqual(record.history.slice(-3).map((entry) => `${entry.source}:${entry.previousRecordedGrade}>${entry.recordedGrade}`),
    ['retestActual:70>100', 'review:100>100', 'manual:100>85']);

  // Removing it returns to the rule, and that is audited too.
  const cleared = await adjust({ clear: true });
  assert.deepEqual([cleared.cleared, cleared.recordedGrade], [true, 70]);
  record = await readRecord(WINDOWS, absent);
  assert.equal(record.gradeAdjustment, undefined);
  assert.equal(record.history.at(-1).reason, 'teacherAdjustmentCleared');
  assert.equal(record.history.at(-1).previousRecordedGrade, 85);
  assert.equal((await adjust({ clear: true })).cleared, false);
  assert.equal((await readRecord(WINDOWS, absent)).history.length, record.history.length, 'removing nothing writes no audit row');
});

test('the home window expires at the late due date, and a teacher can extend it for one student', async () => {
  const student = id('absentExpired');
  // The class missed the Test yesterday and the home window has already ended.
  await storeAvailability(WINDOWS, withFollowUpClose(
    withClassTestDay(null, { classId: CLASS_W, dateKey: dayKey(-1) }),
    { mode: 'custom', closesAt: Date.now() - 60000 },
  ));
  const expired = await card(student, WINDOWS);
  assert.equal(expired.schedule.missedTest, true);
  assert.equal(expired.canEnter, false);
  assert.equal(expired.schedule.followUp.state, 'closed');
  assert.match(expired.detail, /The Retest closed .*Ask your teacher if you need it reopened/);
  assert.equal((await readRecord(WINDOWS, student)).retest.examSessionId, null, 'no Retest is opened into a closed window');
  const classA = (await listing(WINDOWS)).testSchedule.classes.find((entry) => entry.classId === CLASS_W);
  assert.equal(classA.followUp.state, 'closed');
  assert.match(classA.followUp.detail, /Extend or reopen it/);

  // A Retest the teacher opens by hand still cannot be started outside the window.
  await fns.teacherTestCycleAction.run(teacherRequest({ assignmentId: WINDOWS, studentId: student, action: 'unlockRetest' }));
  const opened = (await readRecord(WINDOWS, student)).retest.examSessionId;
  assert.ok(opened, 'the teacher\'s action opens the session');
  const refused = await refusal(fns.startSecureExamSession.run(studentRequest(student, { examSessionId: opened })));
  assert.equal(refused.code, 'failed-precondition');
  assert.match(refused.message, /The Retest closed/);

  // Extended for this one student, on their own record.
  const until = Date.now() + DAY;
  const extended = await availability(WINDOWS, { action: 'setStudentFollowUpClose', studentId: student, closesAt: until });
  assert.match(extended.label, /stay open for this student until/);
  assert.equal((await readRecord(WINDOWS, student)).availability.followUpClosesAt, until);
  assert.equal(JSON.stringify((await db.collection('assignments').doc(WINDOWS).get()).data()).includes(student), false,
    'one student\'s extension is not written on the shared assignment');
  const reopened = await card(student, WINDOWS);
  assert.equal(reopened.canEnter, true);
  assert.match(reopened.schedule.followUp.detail, /extended for this student/);
  await fns.startSecureExamSession.run(studentRequest(student, { examSessionId: opened }));
  // Everyone else in the class is still closed.
  assert.equal((await rowFor(WINDOWS, id('absentReview'))).schedule.followUp.state, 'closed');

  // The class's own close can be set to the late due date again, or removed.
  const none = await availability(WINDOWS, { action: 'setFollowUpClose', mode: 'none' });
  assert.match(none.notes[0], /no closing time/);
  await availability(WINDOWS, { action: 'setFollowUpClose', mode: 'lateDue' });
  assert.match((await listing(WINDOWS)).testSchedule.followUpClose.label, /^Wed, Jan 7, 6:00 PM CST$/);
});

test('reopening the Test for one student lets them take it, and retires the Retest that stood in for it', async () => {
  const student = id('reopened');
  await storeAvailability(WINDOWS, withClassTestDay(null, { classId: CLASS_W, dateKey: dayKey(-1) }));
  const missed = await card(student, WINDOWS);
  assert.equal(missed.stage, 'retest');
  const standIn = missed.examSessionId;
  const testSession = (await readRecord(WINDOWS, student)).test.examSessionId;

  assert.equal((await refusal(availability(WINDOWS, { action: 'reopenStudentTest', studentId: student, opensAt: Date.now() - 5000, closesAt: Date.now() - 1000 })))?.code, 'invalid-argument');
  const reopened = await availability(WINDOWS, {
    action: 'reopenStudentTest', studentId: student, opensAt: Date.now() - 60000, closesAt: Date.now() + 3600000, reason: 'Absent for a school event',
  });
  assert.match(reopened.label, /^Test open for this student/);
  const window = (await readRecord(WINDOWS, student)).availability.testWindows[0];
  assert.deepEqual([window.by, window.reason], [TEACHER_EMAIL, 'Absent for a school event']);

  const testCard = await card(student, WINDOWS);
  assert.equal(testCard.stage, 'test');
  assert.equal(testCard.canEnter, true);
  assert.equal(testCard.examSessionId, testSession);
  assert.match(testCard.schedule.test.home, /may take the Test from home during this window/);
  // Their classmates' window is still closed.
  assert.equal((await rowFor(WINDOWS, id('absentReview'))).schedule.test.state, 'closed');

  await fns.startSecureExamSession.run(studentRequest(student, { examSessionId: testSession }));
  const record = await readRecord(WINDOWS, student);
  assert.equal(record.test.state, 'inProgress');
  assert.equal(record.retest.examSessionId, null, 'the stand-in Retest is gone from the record');
  assert.equal(record.retest.withoutOriginal, undefined);
  assert.equal((await readSession(standIn)).status, 'force_submitted', 'closed, not deleted');
  // And it cannot be opened, or seen on the student's list.
  assert.equal((await refusal(fns.startSecureExamSession.run(studentRequest(student, { examSessionId: standIn }))))?.code, 'failed-precondition');
  const listed = (await fns.listStudentSecureExamSessions.run(studentRequest(student, {}))).sessions.map((session) => session.examSessionId);
  assert.ok(listed.includes(testSession));
  assert.equal(listed.includes(standIn), false);
});

test('Corrections open at home when the Test window closes, and close when the home window ends', async () => {
  const student = id('failer');
  // The Test day is today: they take it in class and get nothing right.
  await storeAvailability(WINDOWS, withClassTestDay(null, { classId: CLASS_W, dateKey: todayKey() }));
  const testCard = await card(student, WINDOWS);
  assert.equal(testCard.canEnter, true);
  await sit({ studentId: student, examSessionId: testCard.examSessionId, correctCount: 0, total: QUESTIONS });
  await fns.finalizeSecureExam.run(studentRequest(student, { examSessionId: testCard.examSessionId }));
  await fns.releaseTestCycleResults.run(teacherRequest({ assignmentId: WINDOWS, stage: 'test', studentIds: [student] }));

  // Still inside the Test window: Corrections wait for it to close.
  const waiting = await card(student, WINDOWS);
  assert.equal(waiting.stage, 'corrections');
  assert.equal(waiting.canEnter, false);
  assert.equal(waiting.actionLabel, 'Opens after the Test window');
  assert.match(waiting.detail, /Corrections open when the Test window closes/);
  const correctionId = (await db.collection('testCycleCorrectionPlans').doc(`${WINDOWS}__${student}`).get()).data().plan.targets[0].correctionId;
  const early = await refusal(fns.issueTestCycleCorrectionQuestion.run(studentRequest(student, { assignmentId: WINDOWS, correctionId })));
  assert.equal(early.code, 'failed-precondition');
  assert.match(early.message, /Corrections open when the Test window closes/);

  // The window has closed: Corrections are open from home.
  await storeAvailability(WINDOWS, withClassTestDay(null, { classId: CLASS_W, dateKey: dayKey(-1) }));
  const open = await card(student, WINDOWS);
  assert.equal(open.canEnter, true);
  assert.equal(open.schedule.missedTest, false, 'they took the Test');
  assert.match(open.detail, /Open from home until Wed, Jan 7, 6:00 PM CST\./);
  const issued = await fns.issueTestCycleCorrectionQuestion.run(studentRequest(student, { assignmentId: WINDOWS, correctionId }));
  assert.ok(issued.questionInstance?.questionInstanceId, 'a correction question is issued');

  // The home window has ended: no new correction question.
  await storeAvailability(WINDOWS, withFollowUpClose(
    withClassTestDay(null, { classId: CLASS_W, dateKey: dayKey(-1) }),
    { mode: 'custom', closesAt: Date.now() - 60000 },
  ));
  const closed = await card(student, WINDOWS);
  assert.equal(closed.canEnter, false);
  assert.equal(closed.actionLabel, 'Corrections closed');
  const late = await refusal(fns.issueTestCycleCorrectionQuestion.run(studentRequest(student, { assignmentId: WINDOWS, correctionId })));
  assert.equal(late.code, 'failed-precondition');
  assert.match(late.message, /Corrections closed .*Ask your teacher if you need them reopened/);
});

test('"open at any time" is an explicit teacher choice, and it removes the class-time limit', async () => {
  const student = id('anytime');
  await storeAvailability(WINDOWS, withClassTestDay(null, { classId: CLASS_W, dateKey: dayKey(-1) }));
  assert.equal((await rowFor(WINDOWS, student)).missedTest, true);
  const changed = await availability(WINDOWS, { action: 'setTestPolicy', policy: 'alwaysOpen' });
  assert.match(changed.notes[0], /open at any time, including from home/);
  const anytime = await card(student, WINDOWS);
  assert.equal(anytime.stage, 'test');
  assert.equal(anytime.canEnter, true);
  assert.equal(anytime.schedule.missedTest, false);
  assert.equal(anytime.schedule.test.state, 'alwaysOpen');
  assert.match(anytime.schedule.test.home, /may take the Test from home/);
  assert.equal((await refusal(availability(WINDOWS, { action: 'setTestPolicy', policy: 'whenever' })))?.code, 'invalid-argument');
  assert.equal((await refusal(availability(WINDOWS, { action: 'noSuchChange' })))?.code, 'invalid-argument');
  // Clearing a class's windows returns it to "no class-time window".
  await availability(WINDOWS, { action: 'setTestPolicy', policy: 'classTime' });
  const cleared = await availability(WINDOWS, { action: 'clearClassWindows', classId: CLASS_W });
  assert.equal(cleared.testAvailability.classWindows[CLASS_W], undefined);
  assert.equal((await card(student, WINDOWS)).schedule.test.state, 'unset');
});

/* --- archive and delete --------------------------------------------------- */

test('an archived Test is not offered or startable, and comes back intact when restored', async () => {
  const student = id('archived');
  await completeReview(student, ARCHIVE);
  await bulk(ARCHIVE, 'openTestSessions', { kind: 'students', studentIds: [student] });
  const sessionId = (await readRecord(ARCHIVE, student)).test.examSessionId;
  const listed = async () => (await fns.listStudentSecureExamSessions.run(studentRequest(student, {}))).sessions.map((session) => session.examSessionId);
  assert.ok((await listed()).includes(sessionId));

  await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: ARCHIVE, action: 'archive' }));
  assert.equal((await listed()).includes(sessionId), false, 'an archived Test is not on the student\'s list');
  assert.equal((await refusal(fns.startSecureExamSession.run(studentRequest(student, { examSessionId: sessionId }))))?.code, 'failed-precondition');
  assert.equal((await card(student, ARCHIVE)).canEnter, false);
  // Class-wide changes are refused while it is archived, and so is adding to it.
  assert.equal((await refusal(bulk(ARCHIVE, 'waiveReview', { kind: 'all' })))?.code, 'failed-precondition');
  assert.equal((await refusal(fns.updateTestCycleAudience.run(teacherRequest({ assignmentId: ARCHIVE, addClassIds: [CLASS_B] }))))?.code, 'failed-precondition');
  // Nothing was deleted.
  assert.equal((await readRecord(ARCHIVE, student)).test.examSessionId, sessionId);

  await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: ARCHIVE, action: 'unarchive' }));
  assert.ok((await listed()).includes(sessionId));
  await fns.startSecureExamSession.run(studentRequest(student, { examSessionId: sessionId }));
});

test('deleting a Test nobody has worked on removes everything linked to it; one with work is refused', async () => {
  const student = id('deletedOne');
  const opened = await bulk(DELETE, 'openTestSessions', { kind: 'class', classId: CLASS_LIFE });
  assert.equal(opened.counts.succeeded, 2);
  const sessionIds = (await sessionsOf(DELETE)).map((session) => session.examSessionId);
  const title = (await db.collection('assignments').doc(DELETE).get()).data().title;

  // A student has Review work: delete is refused and archive is offered.
  await db.collection('grades').doc(student).set({ gradesByAssignment: { [DELETE]: { 0: { status: 'correct' } } } }, { merge: true });
  const summary = await fns.getAssignmentEvidenceSummary.run(teacherRequest({ assignmentId: DELETE }));
  assert.deepEqual([summary.canDelete, summary.studentsWithWork, summary.secureSessions], [false, 1, 2]);
  const refused = await refusal(fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: DELETE, action: 'delete', confirmTitle: title })));
  assert.equal(refused.code, 'failed-precondition');
  assert.match(refused.message, /1 student has work on this assignment\. Archive it instead/);
  assert.equal((await db.collection('assignments').doc(DELETE).get()).exists, true);

  // With no work on it, the title must still be typed exactly.
  const FieldValue = (await import('./testCycleCertificationHarness.mjs')).admin.firestore.FieldValue;
  await db.collection('grades').doc(student).update({ [`gradesByAssignment.${DELETE}`]: FieldValue.delete() });
  assert.equal((await fns.getAssignmentEvidenceSummary.run(teacherRequest({ assignmentId: DELETE }))).canDelete, true);
  assert.equal((await refusal(fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: DELETE, action: 'delete', confirmTitle: 'wrong' }))))?.code, 'failed-precondition');

  const deleted = await fns.manageAssignmentLifecycle.run(teacherRequest({ assignmentId: DELETE, action: 'delete', confirmTitle: title }));
  assert.equal(deleted.deleted, true);
  assert.equal((await db.collection('assignments').doc(DELETE).get()).exists, false);
  assert.equal((await sessionsOf(DELETE)).length, 0);
  assert.equal((await db.collection('testCycleRecords').where('assignmentId', '==', DELETE).get()).size, 0);
  assert.equal((await db.collection('testCycleOperations').where('assignmentId', '==', DELETE).get()).size, 0);
  assert.equal((await readGradeDoc(student)).testCycleGrades?.[DELETE], undefined, 'no grade projection is left behind');
  assert.equal((await db.collection('assignmentDeletionLog').doc(DELETE).get()).data().removedSecureSessions, 2);

  // A session id a student kept cannot be started, issued or released.
  assert.ok((await refusal(fns.startSecureExamSession.run(studentRequest(student, { examSessionId: sessionIds[0] })))));
  assert.equal((await fns.listStudentSecureExamSessions.run(studentRequest(student, {}))).sessions.length, 0);
  assert.equal((await refusal(card(student, DELETE)))?.code, 'not-found');
  assert.equal((await refusal(bulk(DELETE, 'openTestSessions', { kind: 'all' })))?.code, 'not-found');
});
