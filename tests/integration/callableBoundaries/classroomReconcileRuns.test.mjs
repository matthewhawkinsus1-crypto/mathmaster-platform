/*
 * "RECONCILE SECTION GRADES", FROM THE TEACHER'S CLICK TO GOOGLE CLASSROOM.
 *
 * HOW TO RUN: npm run test:callable-boundaries:emulator
 *
 * The owner's decisions of 2026-11-19 on issue #545, each driven end to end:
 * the real callable called with a real Auth emulator token (callableHost.mjs),
 * the real paced queue and its drain, the real checkpoint scheduler, and both
 * real grade triggers, with Google Classroom a recording stub.
 *
 *   * Scope. A reconcile acts on the caller's own posts only. A co-teacher's
 *     section column and whole-assignment column, in a course the student is
 *     also rostered in, are not found, patched or returned, and the
 *     co-teacher's Google account is never used. A student of another class
 *     adds nothing to the run's counts.
 *   * Option A. A reconcile no longer sends a column Classroom already holds:
 *     a second run costs no Classroom call. A teacher's Retry still sends it.
 *   * R1. The run's id rides through the queue, its drain and the requeue
 *     after Google's per-minute limit, and the monitor says what the run did:
 *     repaired, already up to date, not sent, failed. An event delivered twice
 *     is not counted twice.
 *   * At the due date a student with no work is sent nothing, so Classroom
 *     shows Missing, not a returned 0. The final cutoff still sends the 0.
 *
 * No trigger fires on its own here (callableHost.mjs), so each test releases
 * the queue and then runs both triggers for the students the drain signalled,
 * as Firestore would.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const {
  FieldPath, answerGoogle, db, fns, refusalOf, repo, shutdown, signedIn,
} = await import('./callableHost.mjs');

const requireFromRepo = createRequire(path.join(repo, 'package.json'));
const requireFromFunctions = createRequire(path.join(repo, 'functions/package.json'));
const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromRepo('./functions/lib/publication.js');
const queue = requireFromRepo('./functions/lib/classroomPushQueue.js');
const runs = requireFromRepo('./functions/lib/classroomReconcileRuns.js');
const { GaxiosError } = requireFromFunctions('gaxios');

const P = 'recon';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ASSIGNMENT = `${P}-assignment`;
const CLASS = { a: `${P}-class-a`, b: `${P}-class-b` };
// Synthetic addresses on a reserved domain: nobody's real account.
const TEACHER = {
  a: { label: 'reconciling-teacher', email: 'reconcile.teacher@district-four.test', classId: CLASS.a },
  b: { label: 'co-teacher', email: 'reconcile.coteacher@district-four.test', classId: CLASS.b },
};
const COURSE = { a: `${P}-course-a`, b: `${P}-course-b` };
// Each teacher's section column and whole-assignment column, in their own course.
const POST = {
  sectionA: { id: `${P}-post-section-a`, owner: 'a', courseworkId: `${P}-cw-section-a`, section: true },
  sectionB: { id: `${P}-post-section-b`, owner: 'b', courseworkId: `${P}-cw-section-b`, section: true },
  wholeA: { id: `${P}-post-whole-a`, owner: 'a', courseworkId: `${P}-cw-whole-a`, section: false },
  wholeB: { id: `${P}-post-whole-b`, owner: 'b', courseworkId: `${P}-cw-whole-b`, section: false },
};
const STUDENT = {
  // Class A, half the work right, and rostered in the co-teacher's course too.
  worked: `${P}-student-worked`,
  // Class A, opened the lesson and answered nothing.
  noWork: `${P}-student-no-work`,
  // The co-teacher's class.
  coTaught: `${P}-student-co-taught`,
  coTaughtNoWork: `${P}-student-co-taught-no-work`,
};
const WORK = {
  0: { status: 'correct', attemptCount: 1, totalAttempts: 1 },
  1: { status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0, bestPartialCredit: 0 },
};

const accounts = {};

/* --- Google Classroom, recording what each account was asked -------------- */

const google = [];
const submissionState = new Map();
let refuse = null;
const quotaError = () => {
  const config = { url: 'https://classroom.googleapis.com/v1/x', method: 'PATCH', headers: {} };
  const data = { error: {
    code: 429,
    message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute per user' of service 'classroom.googleapis.com'.",
    status: 'RESOURCE_EXHAUSTED',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'RATE_LIMIT_EXCEEDED' }],
  } };
  return new GaxiosError(data.error.message, config, { status: 429, statusText: '', data, headers: {}, config, request: { responseURL: config.url } });
};
const asked = (name, client, args, extra = {}) => {
  const error = refuse?.(name, args) || null;
  google.push({ name, teacherUid: client?.teacherUid ?? null, courseworkId: args.courseWorkId, refused: Boolean(error), ...extra });
  if (error) throw error;
};
// A submission's id names its column and its student, so a call says whose it was.
const submissionId = (courseWorkId, googleUserId) => `${courseWorkId}|${googleUserId}`;
answerGoogle('findSubmissionForStudent', async (client, args) => {
  const id = submissionId(args.courseWorkId, args.googleUserId);
  asked('findSubmissionForStudent', client, args, { student: args.googleUserId });
  return { id, state: submissionState.get(id) || 'CREATED' };
});
answerGoogle('patchGrade', async (client, args) => {
  asked('patchGrade', client, args, { student: args.submissionId.split('|')[1], grade: args.grade, assigned: args.assignToStudent === true });
  return { id: args.submissionId, state: submissionState.get(args.submissionId) || 'CREATED' };
});
answerGoogle('returnSubmission', async (client, args) => {
  asked('returnSubmission', client, args, { student: args.submissionId.split('|')[1] });
  submissionState.set(args.submissionId, 'RETURNED');
  return { state: 'RETURNED' };
});
const googleId = (studentId) => `google-${studentId}`;
const callsFor = (studentId) => google.filter((call) => call.student === googleId(studentId));
const names = (calls) => calls.map((call) => call.name);

/* --- the fixture ----------------------------------------------------------- */

const gradeRef = (studentId) => db.collection('grades').doc(studentId);
const auditRow = async (post, studentId) => {
  const snapshot = await db.collection('classroomGradeSyncs').doc(gradeSyncDocumentId(post.id, studentId)).get();
  return snapshot.exists ? snapshot.data() : null;
};
const question = (index) => ({
  questionId: `${P}-q${index}`, id: `${P}-q${index}`, type: 'literal', activityRole: 'classwork',
  prompt: `Reconcile question ${index}`, solveFor: 'y', acceptedAnswers: [String(index + 2)],
});
const setDates = (dueInMs, finalInMs) => db.collection('assignments').doc(ASSIGNMENT).update({
  dueAt: new Date(Date.now() + dueInMs).toISOString(),
  lateDueAt: new Date(Date.now() + finalInMs).toISOString(),
});
const post = (target) => ({
  schemaVersion: 5, publicationId: target.id, assignmentId: ASSIGNMENT,
  teacherUid: accounts[target.owner].uid, classId: CLASS[target.owner], courseId: COURSE[target.owner],
  courseName: `Course ${target.owner}`, courseworkId: target.courseworkId, status: 'published', maxPoints: 100,
  ...(target.section
    ? { publicationKind: 'section', sectionKey: 'classwork', sectionLabel: 'Classwork', gradePassbackEnabled: false, sectionGradePassbackEnabled: true }
    : { publicationKind: 'assignment', sectionKey: 'whole', gradePassbackEnabled: true }),
});

const cleanup = async () => {
  for (const name of [
    'classes', 'grades', 'assignments', 'classroomLinks', 'classroomRosterLinks', 'classroomGradeSyncs',
    queue.CLASSROOM_PUSH_QUEUE, runs.CLASSROOM_RECONCILE_RUNS, 'classroomSectionGradeCheckpointState',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs
      .filter((doc) => doc.id.startsWith(P) || String(doc.data()?.assignmentId || '').startsWith(P))
      .map((doc) => doc.ref.delete()));
  }
};

before(async () => {
  await cleanup();
  for (const [key, teacher] of Object.entries(TEACHER)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classes').doc(teacher.classId).set({
      name: `Reconcile class ${key}`, course: 'algebra1', courseLevel: 'standard', period: 'Period 3',
      teacherOfRecord: teacher.email, status: 'active',
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('teacherDirectory').doc(teacher.email).set({ email: teacher.email, active: true });
    // eslint-disable-next-line no-await-in-loop
    accounts[key] = await signedIn({ label: teacher.label, email: teacher.email });
  }
  await db.collection('assignments').doc(ASSIGNMENT).set({
    title: 'Reconcile boundary lesson',
    assignedClassIds: [CLASS.a, CLASS.b],
    releaseAt: new Date(Date.now() - 20 * DAY).toISOString(),
    dueAt: new Date(Date.now() + DAY).toISOString(),
    lateDueAt: new Date(Date.now() + 2 * DAY).toISOString(),
    schemaVersion: 5,
    sections: [{ id: `${P}-section-classwork`, role: 'classwork', title: 'Classwork', questions: [question(0), question(1)] }],
    sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
  });
  for (const target of Object.values(POST)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomLinks').doc(target.id).set(post(target));
  }
  await gradeRef(STUDENT.worked).set({ displayName: 'Worked', classId: CLASS.a, status: 'active', gradesByAssignment: { [ASSIGNMENT]: WORK } });
  await gradeRef(STUDENT.noWork).set({ displayName: 'No work', classId: CLASS.a, status: 'active', gradesByAssignment: { [ASSIGNMENT]: {} } });
  await gradeRef(STUDENT.coTaught).set({ displayName: 'Co-taught', classId: CLASS.b, status: 'active', gradesByAssignment: { [ASSIGNMENT]: WORK } });
  // The co-teacher's class also has a student who opened the lesson and answered nothing.
  await gradeRef(STUDENT.coTaughtNoWork).set({ displayName: 'Co-taught, no work', classId: CLASS.b, status: 'active', gradesByAssignment: { [ASSIGNMENT]: {} } });
  for (const [studentId, courses] of [
    [STUDENT.worked, [COURSE.a, COURSE.b]], [STUDENT.noWork, [COURSE.a, COURSE.b]], [STUDENT.coTaught, [COURSE.b]], [STUDENT.coTaughtNoWork, [COURSE.b]],
  ]) {
    for (const courseId of courses) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(courseId, studentId)).set({
        courseId, studentId, googleUserId: googleId(studentId),
      });
    }
  }
});

after(async () => {
  await cleanup();
  await shutdown();
});

/* --- the queue's drain, then both triggers, as Firestore would run them ---- */

const waiting = async () => (await db.collection(queue.CLASSROOM_PUSH_QUEUE).where('assignmentId', '==', ASSIGNMENT).get())
  .docs.map((doc) => doc.data());

/**
 * Releases what is due at `nowMs`, then runs both grade triggers for each of
 * this file's students whose release signal the drain wrote. Returns the
 * events, so a test can deliver one a second time.
 */
async function drainAndPush(nowMs = Date.now() + 1_000) {
  const beforeData = new Map();
  for (const studentId of Object.values(STUDENT)) {
    // eslint-disable-next-line no-await-in-loop
    beforeData.set(studentId, (await gradeRef(studentId).get()).data());
  }
  // A fresh minute: an earlier drain in this file still holds the lease.
  await db.doc('classroomPushQueueState/drain').delete();
  await queue.drainClassroomPushQueue(db, { nowMs });
  const events = [];
  for (const studentId of Object.values(STUDENT)) {
    // eslint-disable-next-line no-await-in-loop
    const afterSnapshot = await gradeRef(studentId).get();
    const was = beforeData.get(studentId);
    if (JSON.stringify(afterSnapshot.data().classroomReleaseSignals || {}) === JSON.stringify(was.classroomReleaseSignals || {})) continue;
    events.push({ params: { studentId }, data: { before: { exists: true, data: () => was }, after: afterSnapshot } });
  }
  for (const event of events) {
    // eslint-disable-next-line no-await-in-loop
    await fns.syncGradeToClassroom.run(event);
    // eslint-disable-next-line no-await-in-loop
    await fns.syncSectionGradeToClassroom.run(event);
  }
  return events;
}

// Each behaviour starts from an empty queue, so a test fails for what it
// checks, never for an entry an earlier test left waiting.
const clearWaiting = async () => {
  const snapshot = await db.collection(queue.CLASSROOM_PUSH_QUEUE).where('assignmentId', '==', ASSIGNMENT).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
};

const lastRun = async (account) => {
  const result = await account.call('listClassroomGradeSyncs', {});
  return (result.reconcileRuns || []).find((run) => run.assignmentId === ASSIGNMENT) || null;
};
const counts = (run) => run && {
  repaired: run.repaired, upToDate: run.upToDate, notSent: run.notSent, failed: run.failed, waiting: run.waiting,
  queuedStudents: run.queuedStudents, pendingStudents: run.pendingStudents,
};

/* ==========================================================================
 * SCOPE: THE CALLER'S OWN POSTS ONLY.
 * ======================================================================== */

let firstRunId = null;

test('a reconcile queues the assignment\'s students, each entry carrying the run and the caller', async () => {
  const result = await accounts.a.call('reconcileClassroomSectionGrades', { assignmentId: ASSIGNMENT });
  assert.equal(result.publications, 1, 'one section column is this teacher\'s');
  // Every assigned class, as before: the scope is which posts are acted on, below.
  assert.equal(result.queuedStudents, 4);
  assert.match(result.runId, /^[0-9a-f-]{36}$/);
  firstRunId = result.runId;

  const entries = await waiting();
  assert.deepEqual(entries.map((entry) => entry.studentId).sort(), Object.values(STUDENT).sort());
  for (const entry of entries) {
    assert.equal(entry.reason, 'section-grade-reconcile');
    assert.equal(entry.runId, firstRunId);
    assert.equal(entry.scopeTeacherUid, accounts.a.uid);
  }
  assert.deepEqual(counts(await lastRun(accounts.a)), {
    repaired: 0, upToDate: 0, notSent: 0, failed: 0, waiting: 0, queuedStudents: 4, pendingStudents: 4,
  }, 'before the queue is released the run is all still to come');
});

test('the pushes reach only the caller\'s columns, with the caller\'s Google account', async () => {
  google.length = 0;
  const events = await drainAndPush();
  assert.equal(events.length, 4);
  const signal = (await gradeRef(STUDENT.worked).get()).data().classroomReleaseSignals[ASSIGNMENT];
  assert.equal(signal.runId, firstRunId, 'the drain carries the run to the release signal');
  assert.equal(signal.scopeTeacherUid, accounts.a.uid);

  assert.deepEqual([...new Set(google.map((call) => call.teacherUid))], [accounts.a.uid], 'the co-teacher\'s Google account is never used');
  assert.deepEqual([...new Set(google.map((call) => call.courseworkId))].sort(), [POST.sectionA.courseworkId, POST.wholeA.courseworkId].sort());
  // Before the due date: a teacher's draft, so found and patched, not returned.
  assert.deepEqual(names(callsFor(STUDENT.worked).filter((call) => call.courseworkId === POST.sectionA.courseworkId)), ['findSubmissionForStudent', 'patchGrade']);
  assert.equal((await auditRow(POST.sectionA, STUDENT.worked)).status, 'synced');
  assert.equal((await auditRow(POST.sectionA, STUDENT.worked)).grade, 50);
  // The student is rostered in the co-teacher's course too: nothing was sent there, and no row written.
  assert.equal(await auditRow(POST.sectionB, STUDENT.worked), null);
  assert.equal(await auditRow(POST.wholeB, STUDENT.worked), null);
  // The co-teacher's student is in none of the caller's courses: nothing is
  // sent for them, their own teacher's columns are untouched, and they add
  // nothing to the run's counts.
  assert.deepEqual(callsFor(STUDENT.coTaught), []);
  assert.equal(await auditRow(POST.sectionB, STUDENT.coTaught), null);
  assert.equal(await auditRow(POST.wholeB, STUDENT.coTaught), null);
});

/* ==========================================================================
 * R1: WHAT THE RUN DID.
 * ======================================================================== */

test('the monitor says what the run did, to the teacher who ran it', async () => {
  assert.deepEqual(counts(await lastRun(accounts.a)), {
    // The worked student's section column; the student with no work has nothing to send before the due date.
    repaired: 1, upToDate: 0, notSent: 1, failed: 0, waiting: 0, queuedStudents: 4, pendingStudents: 0,
  });
  // The co-teacher's student has no column in the caller's course: with or
  // without work, they add nothing, not even a "not sent".
  assert.equal(await lastRun(accounts.b), null, 'the co-teacher has no run on this assignment');
  // The run document names no student.
  const stored = (await db.collection(runs.CLASSROOM_RECONCILE_RUNS).doc(runs.reconcileRunDocumentId(ASSIGNMENT, accounts.a.uid)).get()).data();
  assert.equal(JSON.stringify(stored).includes(STUDENT.worked), false);
});

/* ==========================================================================
 * OPTION A: A RECONCILE DOES NOT FORCE A SEND; RETRY DOES.
 * ======================================================================== */

test('a second reconcile finds every column up to date and costs no Classroom call', async () => {
  await clearWaiting();
  const result = await accounts.a.call('reconcileClassroomSectionGrades', { assignmentId: ASSIGNMENT });
  assert.notEqual(result.runId, firstRunId);
  google.length = 0;
  await drainAndPush();
  assert.deepEqual(google, [], 'nothing differs from what Classroom holds, so Google is not asked');
  assert.deepEqual(counts(await lastRun(accounts.a)), {
    repaired: 0, upToDate: 1, notSent: 1, failed: 0, waiting: 0, queuedStudents: 4, pendingStudents: 0,
  });
});

test('a teacher\'s Retry still sends a column Classroom already holds', async () => {
  await clearWaiting();
  await accounts.a.call('retryClassroomGradeSync', { publicationId: POST.sectionA.id, studentId: STUDENT.worked, assignmentId: ASSIGNMENT });
  google.length = 0;
  await drainAndPush();
  // (A Retry is not scoped by this change; only the caller's own section column is looked at here.)
  const sent = google.filter((call) => call.courseworkId === POST.sectionA.courseworkId);
  assert.deepEqual(names(sent), ['findSubmissionForStudent', 'patchGrade']);
  assert.equal(sent[1].grade, 50);
});

/* ==========================================================================
 * R1 THROUGH GOOGLE'S PER-MINUTE LIMIT, AND AN EVENT DELIVERED TWICE.
 * ======================================================================== */

test('a column Google refuses for its limit is queued again inside the same run, and counted once when it goes through', async () => {
  await clearWaiting();
  // The student gets the second question right: the column's grade changes.
  await gradeRef(STUDENT.worked).update(new FieldPath('gradesByAssignment', ASSIGNMENT, '1'), { status: 'correct', attemptCount: 2, totalAttempts: 2 });
  const { runId } = await accounts.a.call('reconcileClassroomSectionGrades', { assignmentId: ASSIGNMENT });

  google.length = 0;
  refuse = (name, args) => (name === 'patchGrade' && args.courseWorkId === POST.sectionA.courseworkId ? quotaError() : null);
  const startedAt = Date.now();
  await drainAndPush();
  refuse = null;
  assert.equal((await auditRow(POST.sectionA, STUDENT.worked)).status, 'rate-limited');
  const requeued = (await waiting()).filter((entry) => entry.studentId === STUDENT.worked);
  assert.equal(requeued.length, 1);
  assert.equal(requeued[0].quotaRetry, 1);
  assert.equal(requeued[0].runId, runId, 'the requeue keeps the run');
  assert.equal(requeued[0].scopeTeacherUid, accounts.a.uid, 'and the caller it acts for');
  assert.ok(requeued[0].notBefore.toMillis() - startedAt >= 55_000, 'about a minute later');
  assert.deepEqual(counts(await lastRun(accounts.a)), {
    repaired: 0, upToDate: 0, notSent: 1, failed: 0, waiting: 1, queuedStudents: 4, pendingStudents: 0,
  });

  google.length = 0;
  const events = await drainAndPush(requeued[0].notBefore.toMillis() + 1_000);
  assert.equal(events.length, 1);
  const signal = (await gradeRef(STUDENT.worked).get()).data().classroomReleaseSignals[ASSIGNMENT];
  assert.equal(signal.quotaRetry, 1);
  assert.equal(signal.runId, runId);
  assert.deepEqual([...new Set(google.map((call) => call.teacherUid))], [accounts.a.uid], 'the retry is still the caller\'s posts only');
  const row = await auditRow(POST.sectionA, STUDENT.worked);
  assert.equal(row.status, 'synced');
  assert.equal(row.grade, 100);
  const afterRetry = { repaired: 1, upToDate: 0, notSent: 1, failed: 0, waiting: 0, queuedStudents: 4, pendingStudents: 0 };
  assert.deepEqual(counts(await lastRun(accounts.a)), afterRetry);

  // Firestore delivers a trigger's event at least once. Delivered again, the
  // column is current because this run sent it: still one repaired, not one
  // repaired and one up to date.
  google.length = 0;
  await fns.syncSectionGradeToClassroom.run(events[0]);
  assert.deepEqual(google, []);
  assert.deepEqual(counts(await lastRun(accounts.a)), afterRetry);
});

test('a teacher with no section column of their own on the assignment is refused, and nothing is queued', async () => {
  await clearWaiting();
  await db.collection('classroomLinks').doc(POST.sectionB.id).update({ status: 'removed' });
  const refusal = await refusalOf(accounts.b.call('reconcileClassroomSectionGrades', { assignmentId: ASSIGNMENT }));
  assert.equal(refusal?.code, 'functions/failed-precondition');
  assert.deepEqual(await waiting(), []);
  await db.collection('classroomLinks').doc(POST.sectionB.id).set(post(POST.sectionB));
});

/* ==========================================================================
 * AT THE DUE DATE: NO WORK IS MISSING, NOT A RETURNED 0.
 * ======================================================================== */

test('at the due date a student with no work is sent nothing, and a student with work is assigned and returned', async () => {
  await clearWaiting();
  // Due an hour ago; late work is open until tomorrow.
  await setDates(-HOUR, DAY);
  await fns.queueClassroomSectionGradeCheckpoints.run({});
  const entries = await waiting();
  assert.deepEqual(entries.map((entry) => entry.reason), ['due-checkpoint', 'due-checkpoint', 'due-checkpoint', 'due-checkpoint'], 'the real scheduler queued the due-date wake-up for every student');
  assert.equal(entries.some((entry) => entry.runId || entry.scopeTeacherUid), false, 'a checkpoint is not a run');

  google.length = 0;
  await drainAndPush();
  // No call at all for the student with no work, on any column: no grade is
  // set, assigned or returned, so Classroom shows the work as Missing.
  assert.deepEqual(callsFor(STUDENT.noWork), []);
  for (const target of Object.values(POST)) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await auditRow(target, STUDENT.noWork), null, `${target.id}: no row for the student with no work`);
  }
  assert.equal((await gradeRef(STUDENT.noWork).get()).data().classroomSectionSyncStatusByAssignment, undefined, 'and no receipt of a grade on their record');

  // The student in the co-teacher's class has half the work: the due-date
  // checkpoint assigns and returns it, as before.
  const coTaught = callsFor(STUDENT.coTaught).filter((call) => call.courseworkId === POST.sectionB.courseworkId);
  assert.deepEqual(names(coTaught), ['findSubmissionForStudent', 'patchGrade', 'returnSubmission']);
  assert.equal(coTaught[1].grade, 50);
  assert.equal(coTaught[1].assigned, true);
  const row = await auditRow(POST.sectionB, STUDENT.coTaught);
  assert.equal(row.stage, 'due-checkpoint');
  assert.equal(row.returnedToStudent, true);
});

test('a teacher\'s Retry after the due date still sends no 0 for a student with no work', async () => {
  await clearWaiting();
  // A row for the retry button to act on, as a roster problem would have left.
  await accounts.a.call('retryClassroomGradeSync', { publicationId: POST.sectionA.id, studentId: STUDENT.noWork, assignmentId: ASSIGNMENT });
  google.length = 0;
  await drainAndPush();
  assert.deepEqual(callsFor(STUDENT.noWork), []);
});

test('at the final cutoff the student with no work gets their final 0, assigned and returned, as before', async () => {
  await clearWaiting();
  // Due yesterday; the late window closed a minute ago.
  await setDates(-DAY, -60_000);
  await fns.queueClassroomSectionGradeCheckpoints.run({});
  assert.ok((await waiting()).every((entry) => entry.reason === 'final-deadline'));
  google.length = 0;
  await drainAndPush();
  const sent = callsFor(STUDENT.noWork).filter((call) => call.courseworkId === POST.sectionA.courseworkId);
  assert.deepEqual(names(sent), ['findSubmissionForStudent', 'patchGrade', 'returnSubmission']);
  assert.equal(sent[1].grade, 0);
  assert.equal(sent[1].assigned, true);
  const row = await auditRow(POST.sectionA, STUDENT.noWork);
  assert.equal(row.stage, 'final-deadline');
  assert.equal(row.isFinal, true);
});
