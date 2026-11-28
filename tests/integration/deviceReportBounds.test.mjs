// DEVICE QUEUE REPORTS ARE BOUNDED PER STUDENT, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-device-bounds \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/deviceReportBounds.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The real `reportStudentDeviceQueue` callable and the real grades trigger
// prove:
//   * a student keeps at most MAX_DEVICE_REPORTS_PER_STUDENT report rows; a
//     report past the cap evicts the oldest stale or drained rows, never one
//     still holding work, which goes on holding the final passback;
//   * every stored queue count is clamped;
//   * a row last reported before the stale window does not hold a passback;
//   * the reader that decides the passback reads one bounded page and never
//     throws; a read that did not reach the end holds the passback;
//   * a fresh row still holding work is never evicted.
//
// Every id starts with `devbounds-`, with its own class, assignment and
// Classroom publication, so it shares no fixture with another file.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  certAssignment, db, fns, patchGradeCalls, repo, resetClassroomCalls, runClassroomSync, studentRequest,
} from './canonicalPersistenceHarness.mjs';

const require = createRequire(import.meta.url);
const { rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));
const { MAX_DEVICE_REPORTS_PER_STUDENT, DEVICE_REPORT_STALE_MS } = require(path.join(repo, 'functions/functionsCommon.js'));
const { Timestamp } = require(path.join(repo, 'functions/node_modules/firebase-admin')).firestore;

const P = 'devbounds-';
const TEACHER = 'devbounds.teacher@desotoisd.org';
const CLASS_ID = `${P}class`;
const ASSIGNMENT_ID = `${P}assignment`;
const COURSE_ID = `${P}course`;
const REPORTS = 'studentDevicePersistenceReports';

before(async () => {
  assert.ok(MAX_DEVICE_REPORTS_PER_STUDENT > 0 && DEVICE_REPORT_STALE_MS > 0, 'the bounds are exported constants');
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Device bounds', course: 'algebra1', courseLevel: 'standard', period: 'Period 7', teacherOfRecord: TEACHER, status: 'active',
  });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set({ ...certAssignment(), title: 'Device bounds', assignedClassIds: [CLASS_ID] });
  await db.collection('classroomLinks').doc(`${P}publication`).set({
    schemaVersion: 2, publicationId: `${P}publication`, assignmentId: ASSIGNMENT_ID,
    courseId: COURSE_ID, courseName: 'Device bounds course', courseworkId: `${P}coursework`,
    teacherUid: `uid-${TEACHER}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
});

/** A rostered student who has answered every question, so a final grade is due. */
async function finishedStudent(name) {
  const studentId = `${P}${name}`;
  await db.collection('grades').doc(studentId).set({
    displayName: studentId, classId: CLASS_ID, classPeriod: 'Period 7', assignedTeacherEmail: TEACHER, status: 'active',
    gradesByAssignment: {}, assignmentActivity: { [ASSIGNMENT_ID]: { totalTimeSeconds: 1800 } },
  });
  await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE_ID, studentId)).set({
    courseId: COURSE_ID, studentId, googleUserId: `google-${studentId}`,
  });
  const answers = ['2x+1', 'x+5', 'x-4', '9'];
  const submissions = answers.map((value, questionIndex) => ({
    schemaVersion: 1, actionId: `${studentId}-q${questionIndex}`, kind: 'ordinarySubmission', assignmentId: ASSIGNMENT_ID,
    questionIndex, questionId: `canonpersist-q${questionIndex}`, variantIndex: 0, activityRole: 'classwork', capturedAt: Date.now(),
    previousTotalAttempts: 0, record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' },
    response: { kind: 'scalar', type: 'literal', value, fields: [] }, hasClassworkGrade: true, hasDolGrade: false,
  }));
  const { receipts } = await fns.ingestStudentSubmissions.run(studentRequest(studentId, { submissions }));
  assert.ok(receipts.every((receipt) => receipt.disposition === 'accepted'), 'every answer is accepted');
  return studentId;
}

let generation = Date.now();
const report = (studentId, deviceId, byAssignment, extra = {}) => fns.reportStudentDeviceQueue.run(studentRequest(studentId, {
  deviceId,
  reportGeneration: (generation += 1),
  summary: {
    summarySchemaVersion: 2,
    queued: Object.values(byAssignment).reduce((total, count) => total + count, 0),
    queuedGradeBearing: Object.values(byAssignment).reduce((total, count) => total + count, 0),
    queuedByAssignment: byAssignment,
    queuedGradeBearingByAssignment: byAssignment,
    needsReview: 0,
    ...extra,
  },
}));

const rowsOf = async (studentId) => (await db.collection(REPORTS).where('studentId', '==', studentId).get()).docs;

const passbackPosts = async (studentId) => {
  resetClassroomCalls();
  await runClassroomSync(studentId, {});
  return patchGradeCalls().length;
};

test('a student keeps at most the capped number of device rows; the row holding work is not evicted', async () => {
  const studentId = await finishedStudent('cap');
  await report(studentId, 'holding-device', { [ASSIGNMENT_ID]: 1 });
  for (let device = 1; device <= MAX_DEVICE_REPORTS_PER_STUDENT + 5; device += 1) {
    // eslint-disable-next-line no-await-in-loop
    await report(studentId, `drained-${String(device).padStart(2, '0')}`, {});
  }
  const rows = await rowsOf(studentId);
  assert.equal(rows.length, MAX_DEVICE_REPORTS_PER_STUDENT, 'the cap holds');
  assert.ok(rows.some((doc) => doc.data().deviceId === 'holding-device'), 'the row holding work is kept');
  assert.ok(rows.some((doc) => doc.data().deviceId === `drained-${MAX_DEVICE_REPORTS_PER_STUDENT + 5}`), 'the newest row is stored');
  assert.equal(rows.some((doc) => doc.data().deviceId === 'drained-01'), false, 'the oldest drained row was evicted');
  assert.equal(await passbackPosts(studentId), 0, 'the device holding work still holds the final grade');
});

test('every stored queue count is clamped', async () => {
  const studentId = `${P}clamp`;
  await db.collection('grades').doc(studentId).set({ classId: CLASS_ID, gradesByAssignment: {} });
  await report(studentId, 'clamp-device', { [ASSIGNMENT_ID]: 1e12 }, { queued: 1e12, needsReview: 1e12, retired: -5, queuedByKind: { ordinary: 1e15 } });
  const [row] = await rowsOf(studentId);
  const data = row.data();
  const counts = [data.queued, data.queuedGradeBearing, data.needsReview, data.retired, data.queuedByKind.ordinary,
    ...Object.values(data.queuedGradeBearingByAssignment)];
  counts.forEach((count) => {
    assert.ok(Number.isInteger(count) && count >= 0 && count <= 10_000, `count ${count} is clamped`);
  });
});

test('a row last reported before the stale window does not hold the final grade', async () => {
  const studentId = await finishedStudent('stale');
  await report(studentId, 'stale-device', { [ASSIGNMENT_ID]: 2 });
  const [row] = await rowsOf(studentId);
  await row.ref.update({ reportedAt: Timestamp.fromMillis(Date.now() - DEVICE_REPORT_STALE_MS - 60 * 60 * 1000) });
  assert.ok(await passbackPosts(studentId) >= 1, 'the stale row is ignored and the grade goes out');

  // A fresh row holding work still holds.
  const heldStudent = await finishedStudent('fresh');
  await report(heldStudent, 'fresh-device', { [ASSIGNMENT_ID]: 2 });
  assert.equal(await passbackPosts(heldStudent), 0);
});

test('a read that does not reach the end holds the passback, and the next report trims the rows back', async () => {
  const studentId = await finishedStudent('volume');
  // Rows written before the cap existed: more than the reader's one page.
  const writer = db.bulkWriter();
  const ROWS = 150;
  for (let index = 0; index < ROWS; index += 1) {
    writer.set(db.collection(REPORTS).doc(`${encodeURIComponent(studentId)}__legacy-${String(index).padStart(5, '0')}`), {
      studentId, deviceId: `legacy-${index}`, queuedGradeBearingByAssignment: {}, reportedAt: Timestamp.fromMillis(Date.now() - 60_000 + index),
    });
  }
  await writer.close();
  assert.equal(await passbackPosts(studentId), 0, 'a partial read is not read as the whole set: the grade is held, nothing throws');

  await report(studentId, 'current-device', {});
  assert.equal((await rowsOf(studentId)).length, MAX_DEVICE_REPORTS_PER_STUDENT, 'the drained rows past the cap were evicted');
  assert.ok(await passbackPosts(studentId) >= 1, 'with every row read and none holding, the grade goes out');
});

test('a fresh row still holding work is never evicted, however many there are', async () => {
  const studentId = await finishedStudent('all-holding');
  for (let device = 1; device <= MAX_DEVICE_REPORTS_PER_STUDENT; device += 1) {
    // eslint-disable-next-line no-await-in-loop
    await report(studentId, `holding-${String(device).padStart(2, '0')}`, { [ASSIGNMENT_ID]: 1 });
  }
  await report(studentId, 'one-more', {});
  const rows = await rowsOf(studentId);
  assert.equal(rows.length, MAX_DEVICE_REPORTS_PER_STUDENT + 1, 'nothing safe to evict, so nothing was');
  assert.equal(rows.filter((doc) => doc.data().deviceId.startsWith('holding-')).length, MAX_DEVICE_REPORTS_PER_STUDENT);
  assert.equal(await passbackPosts(studentId), 0);
});
