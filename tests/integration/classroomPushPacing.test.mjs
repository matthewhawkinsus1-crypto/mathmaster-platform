// GOOGLE CLASSROOM GRADE PUSHES, PACED, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-push-pacing \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/classroomPushPacing.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The pure rules are pinned in tests/platform/classroomPushPacing.test.mjs.
// This file runs the REAL queue against the Firestore emulator and drives BOTH
// real Classroom grade triggers with the Classroom API stubbed, so that Google
// can refuse a call for its per-minute limit:
//
//   * the drain releases a minute's worth (400 requests a teacher), oldest
//     first, writes the same release signal the triggers answer, and a second
//     run in the same minute does nothing;
//   * a push Google refuses for the limit is "rate-limited", not failed: the
//     columns already sent stay sent, the rest wait, and the student is queued
//     again; the queued retry sends only what did not go through;
//   * after eight refusals it is failed, for the teacher to see;
//   * "Retry all" queues every failed push the teacher owns in one call, and
//     the monitor shows those rows as queued.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { certAssignment, db, fns, repo, teacherRequest } from './canonicalPersistenceHarness.mjs';

const requireFromFunctions = createRequire(path.join(repo, 'functions/index.js'));
// The harness put its Classroom stub in place of lib/classroom.js; both
// triggers read this same object when they call Google.
const classroomStub = requireFromFunctions('./lib/classroom.js');
const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const queue = requireFromFunctions('./lib/classroomPushQueue.js');
const sectionEntry = requireFromFunctions('./classroomSectionEntry.js');
const { GaxiosError } = requireFromFunctions('gaxios');
const { FieldPath } = requireFromFunctions('firebase-admin/firestore');

const P = 'pace';
const TEACHER = 'pace.teacher@desotoisd.org';
const TEACHER_UID = `uid-${TEACHER}`;
const CLASS = `${P}-class`;
const ASSIGNMENT = `${P}-assignment`;
const STUDENT = `${P}-student`;
const DAY = 86_400_000;
const WHOLE = [1, 2, 3].map((n) => ({ id: `${P}-pub-${n}`, courseId: `${P}-course-${n}`, courseworkId: `${P}-cw-${n}` }));
const SECTION = { id: `${P}-pub-classwork`, courseId: `${P}-course-1`, courseworkId: `${P}-cw-classwork` };

/* --- Google, refusing on cue --------------------------------------------- */

const calls = [];
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
for (const name of ['findSubmissionForStudent', 'patchGrade', 'returnSubmission']) {
  const original = classroomStub[name];
  classroomStub[name] = async (client, args) => {
    const error = refuse?.(name, args);
    calls.push({ name, courseWorkId: args.courseWorkId, refused: Boolean(error) });
    if (error) throw error;
    return original(client, args);
  };
}
const patchedColumns = () => calls.filter((call) => call.name === 'patchGrade' && !call.refused).map((call) => call.courseWorkId);

/* --- the fixture ---------------------------------------------------------- */

const gradeRef = (studentId = STUDENT) => db.collection('grades').doc(studentId);
const audit = async (publicationId, studentId = STUDENT) => (await db.collection('classroomGradeSyncs')
  .where('publicationId', '==', publicationId).where('studentId', '==', studentId).get()).docs[0]?.data() || null;
const queueEntry = async (reason, studentId = STUDENT) => {
  const snapshot = await db.collection(queue.CLASSROOM_PUSH_QUEUE).doc(queue.queueEntryId(ASSIGNMENT, studentId, reason)).get();
  return snapshot.exists ? snapshot.data() : null;
};
// A fresh minute: earlier runs in this file leave the drain's lease held.
const drain = async (nowMs) => {
  await db.doc('classroomPushQueueState/drain').delete();
  return queue.drainClassroomPushQueue(db, { nowMs });
};
const signal = async (value) => {
  const beforeData = (await gradeRef().get()).data();
  await gradeRef().update(new FieldPath('classroomReleaseSignals', ASSIGNMENT), value);
  return beforeData;
};
const event = async (beforeData, studentId = STUDENT) => ({
  params: { studentId },
  data: { before: { exists: true, data: () => beforeData }, after: await gradeRef(studentId).get() },
});
const runWhole = async (beforeData) => fns.syncGradeToClassroom.run(await event(beforeData));
const runSection = async (beforeData) => sectionEntry.cloudFunctions.syncSectionGradeToClassroom.run(await event(beforeData));

const cleanup = async () => {
  for (const name of ['classes', 'grades', 'assignments', 'classroomLinks', 'classroomRosterLinks', 'classroomGradeSyncs', queue.CLASSROOM_PUSH_QUEUE]) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(name).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(snapshot.docs
      .filter((doc) => doc.id.startsWith(P) || String(doc.data()?.studentId || '').startsWith(P) || String(doc.data()?.assignmentId || '').startsWith(P))
      .map((doc) => doc.ref.delete()));
  }
  await db.doc('classroomPushQueueState/drain').delete();
};

before(async () => {
  await cleanup();
  await db.collection('classes').doc(CLASS).set({ name: 'Pacing — Period 1', period: 'Period 1', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  // Due yesterday, late work open until tomorrow: a manual retry posts now.
  await db.collection('assignments').doc(ASSIGNMENT).set({
    ...certAssignment(),
    assignedClassIds: [CLASS],
    dueAt: new Date(Date.now() - DAY).toISOString(),
    lateDueAt: new Date(Date.now() + DAY).toISOString(),
  });
  const publication = (target, extra) => ({
    schemaVersion: 2, publicationId: target.id, assignmentId: ASSIGNMENT, courseId: target.courseId,
    courseName: target.courseId, courseworkId: target.courseworkId, teacherUid: TEACHER_UID, status: 'published', maxPoints: 100, ...extra,
  });
  for (const target of WHOLE) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomLinks').doc(target.id).set(publication(target, { sectionKey: 'whole', publicationKind: 'assignment' }));
  }
  await db.collection('classroomLinks').doc(SECTION.id).set(publication(SECTION, {
    sectionKey: 'classwork', publicationKind: 'section', gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
  }));
  await gradeRef().set({ displayName: STUDENT, classId: CLASS, status: 'active', gradesByAssignment: {} });
  for (const target of WHOLE) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(target.courseId, STUDENT)).set({
      courseId: target.courseId, studentId: STUDENT, googleUserId: `google-${STUDENT}`,
    });
  }
});

after(cleanup);

/* --- the queue ------------------------------------------------------------ */

test('the drain releases a minute\'s worth for the teacher, oldest first, as the signal the triggers answer', async () => {
  // A far-past clock keeps this run's entries apart from anything else in the emulator.
  const T0 = Date.UTC(2001, 0, 1);
  const students = Array.from({ length: 150 }, (_, index) => `${P}-bulk-${String(index).padStart(3, '0')}`);
  const batch = db.batch();
  students.forEach((studentId) => batch.set(gradeRef(studentId), { classId: CLASS, gradesByAssignment: {} }));
  await batch.commit();
  await gradeRef(students[0]).delete();

  assert.equal(await queue.enqueueClassroomPushes(db, { assignmentId: ASSIGNMENT, studentIds: students, reason: 'final-deadline', nowMs: T0 }), 150);
  assert.equal(await queue.enqueueClassroomPushes(db, { assignmentId: ASSIGNMENT, studentIds: students, reason: 'final-deadline', nowMs: T0 }), 150);
  const queued = async () => (await db.collection(queue.CLASSROOM_PUSH_QUEUE).where('assignmentId', '==', ASSIGNMENT).get()).size;
  assert.equal(await queued(), 150, 'the same push queued twice is waiting once');

  // Three whole-assignment columns and one section column: 12 requests a student.
  const first = await drain(T0 + 1_000);
  assert.equal(first.due, 150);
  assert.equal(first.released + first.missingGradeRecords, 33, '33 x 12 = 396 of 400');
  assert.equal(first.missingGradeRecords, 1, 'a student with no grade record leaves the queue');
  assert.deepEqual(first.requestsByTeacher, { [TEACHER_UID]: 396 });
  assert.equal(await queued(), 117);
  const released = (await gradeRef(students[1]).get()).data().classroomReleaseSignals[ASSIGNMENT];
  assert.equal(released.reason, 'final-deadline');
  assert.equal(released.source, 'classroom-push-queue');
  assert.equal((await gradeRef(students[40]).get()).data().classroomReleaseSignals, undefined, 'a later student is still waiting');

  const sameMinute = await queue.drainClassroomPushQueue(db, { nowMs: T0 + 2_000 });
  assert.equal(sameMinute.released, 0, 'a second run in the same minute sends nothing');
  const next = await drain(T0 + 61_000);
  assert.equal(next.released, 33);
  assert.equal(await queued(), 84);

  await Promise.all(students.map((studentId) => gradeRef(studentId).delete()));
  const rest = await db.collection(queue.CLASSROOM_PUSH_QUEUE).where('assignmentId', '==', ASSIGNMENT).get();
  await Promise.all(rest.docs.map((doc) => doc.ref.delete()));
});

/* --- a refusal for the limit ---------------------------------------------- */

test('Google refuses the second column for its limit: the first stays sent, the rest wait, and the student is queued again', async () => {
  calls.length = 0;
  let patches = 0;
  refuse = (name) => (name === 'patchGrade' && ++patches === 2 ? quotaError() : null);
  const beforeData = await signal({ requestedAt: new Date().toISOString(), reason: 'manual-retry' });
  const startedAt = Date.now();
  await runWhole(beforeData);
  refuse = null;

  assert.deepEqual(calls.filter((call) => call.name === 'patchGrade').map((call) => [call.courseWorkId, call.refused]), [
    [WHOLE[0].courseworkId, false],
    [WHOLE[1].courseworkId, true],
  ], 'after the refusal Google is not called again for this teacher');
  assert.equal((await audit(WHOLE[0].id)).status, 'synced');
  const refused = await audit(WHOLE[1].id);
  assert.equal(refused.status, 'rate-limited');
  assert.equal(refused.errorCode, 429);
  assert.equal(refused.errorStatus, 'RESOURCE_EXHAUSTED');
  assert.deepEqual(refused.errorReasons, ['RATE_LIMIT_EXCEEDED']);
  assert.match(refused.message, /sends this grade again automatically/);
  const held = await audit(WHOLE[2].id);
  assert.equal(held.status, 'rate-limited');
  assert.match(held.error, /^Not sent/);

  const entry = await queueEntry('manual-retry');
  assert.equal(entry.quotaRetry, 1);
  assert.equal(entry.source, 'classroom-quota');
  const waitMs = entry.notBefore.toMillis() - startedAt;
  assert.ok(waitMs >= 55_000 && waitMs <= 70_000, `waits about a minute (${waitMs} ms)`);
});

test('the queued retry sends only the columns that did not go through, and clears their errors', async () => {
  const entry = await queueEntry('manual-retry');
  const beforeData = (await gradeRef().get()).data();
  const result = await drain(entry.notBefore.toMillis() + 1_000);
  assert.ok(result.released >= 1);
  const released = (await gradeRef().get()).data().classroomReleaseSignals[ASSIGNMENT];
  assert.equal(released.reason, 'manual-retry');
  assert.equal(released.quotaRetry, 1);
  assert.equal(await queueEntry('manual-retry'), null);

  calls.length = 0;
  await runWhole(beforeData);
  assert.deepEqual(patchedColumns(), [WHOLE[1].courseworkId, WHOLE[2].courseworkId], 'the column already sent is not sent again');
  for (const target of WHOLE) {
    // eslint-disable-next-line no-await-in-loop
    const row = await audit(target.id);
    assert.equal(row.status, 'synced', target.id);
    assert.equal(row.error, undefined, `${target.id} keeps no old error`);
    assert.equal(row.errorCode, undefined);
  }
});

test('after eight refusals the push is failed for the teacher to see, and no longer queued', async () => {
  // Columns that are not current, as if each had failed before.
  await Promise.all(WHOLE.map((target) => db.collection('classroomGradeSyncs')
    .doc(gradeSyncDocumentId(target.id, STUDENT)).set({ status: 'failed' }, { merge: true })));
  calls.length = 0;
  refuse = (name) => (name === 'patchGrade' ? quotaError() : null);
  const beforeData = await signal({ requestedAt: new Date().toISOString(), reason: 'manual-retry', quotaRetry: queue.MAX_QUOTA_RETRIES });
  await runWhole(beforeData);
  refuse = null;

  assert.equal(calls.filter((call) => call.name === 'patchGrade').length, 1, 'one refusal, then no more calls');
  const first = await audit(WHOLE[0].id);
  assert.equal(first.status, 'failed');
  assert.match(first.message, /Retry it from this page/);
  assert.equal(first.errorCode, 429);
  for (const target of WHOLE.slice(1)) {
    // eslint-disable-next-line no-await-in-loop
    const row = await audit(target.id);
    assert.equal(row.status, 'failed', target.id);
    assert.match(row.error, /^Not sent/);
  }
  assert.equal(await queueEntry('manual-retry'), null, 'given up: not queued again');
});

test('the section trigger does the same for a section column', async () => {
  calls.length = 0;
  refuse = (name) => (name === 'patchGrade' ? quotaError() : null);
  const beforeData = await signal({ requestedAt: new Date().toISOString(), reason: 'section-grade-reconcile' });
  await runSection(beforeData);
  refuse = null;
  const row = await audit(SECTION.id);
  assert.equal(row.status, 'rate-limited');
  assert.equal(row.sectionKey, 'classwork');
  const entry = await queueEntry('section-grade-reconcile');
  assert.equal(entry.quotaRetry, 1);

  const releasedBefore = (await gradeRef().get()).data();
  await drain(entry.notBefore.toMillis() + 1_000);
  calls.length = 0;
  await runSection(releasedBefore);
  assert.deepEqual(patchedColumns(), [SECTION.courseworkId]);
  assert.equal((await audit(SECTION.id)).status, 'synced');
});

/* --- the teacher's buttons ------------------------------------------------ */

test('"Retry all" queues every failed push the teacher owns in one call, and the monitor shows them queued', async () => {
  const result = await fns.retryAllClassroomGradeSyncs.run(teacherRequest({}, TEACHER));
  assert.equal(result.assignments, 1);
  assert.equal(result.queued, 1, 'one student, however many of their columns failed');
  assert.ok(result.failedRows >= 3);
  assert.ok(await queueEntry('manual-retry'));

  const listed = await fns.listClassroomGradeSyncs.run(teacherRequest({}, TEACHER));
  const mine = listed.syncs.filter((row) => row.studentId === STUDENT);
  assert.ok(mine.length >= 4);
  assert.ok(mine.every((row) => row.queued === true));
  assert.ok(listed.pushQueue.waiting >= 1);
  const updated = mine.map((row) => row.updatedAt);
  assert.deepEqual(updated, [...updated].sort().reverse(), 'newest first');

  const otherTeacher = await fns.retryAllClassroomGradeSyncs.run(teacherRequest({}, 'someone.else@desotoisd.org'));
  assert.equal(otherTeacher.failedRows, 0, 'another teacher cannot retry these');
});
