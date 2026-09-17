import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  fetchAttendanceForClassDate,
  subscribeAttendanceForClassDate,
} from '../../src/platform/teacher/studentSupportStore.js';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/*
 * ATTENDANCE HISTORY MUST NOT DEPEND ON THE BOUNDED 750-EVENT TEACHER FEED.
 *
 * subscribeStudentSupportEvents (the existing store the rest of the app
 * uses) is `limit(750)` across a teacher's WHOLE roster and every event
 * kind — with several daily classes that window is a few days, not a
 * school year. Attendance History instead queries one class + one
 * instructional date directly.
 */

test('subscribeAttendanceForClassDate scopes by classId AND dateKey, with no result-count limit', () => {
  const store = read('src/platform/teacher/studentSupportStore.js');
  const region = store.slice(
    store.indexOf('export const subscribeAttendanceForClassDate'),
    store.indexOf('export const fetchAttendanceForClassDate'),
  );
  assert.match(region, /where\('authorizedTeacherEmails', 'array-contains', email\)/);
  assert.match(region, /where\('classId', '==', scopedClassId\)/);
  assert.match(region, /where\('dateKey', '==', scopedDateKey\)/);
  assert.doesNotMatch(region, /limit\(/);
});

test('is a silent no-op, never an unscoped read, when db/teacherEmail/classId/dateKey is missing', () => {
  let called = false;
  const unsubscribe = subscribeAttendanceForClassDate({
    db: null, teacherEmail: 'teacher@school.org', classId: 'c1', dateKey: '2026-09-02', onChange: () => { called = true; },
  });
  assert.equal(typeof unsubscribe, 'function');
  unsubscribe();
  assert.equal(called, false);
});

test('fetchAttendanceForClassDate is also a safe no-op with missing arguments, returning an empty array rather than throwing', async () => {
  const result = await fetchAttendanceForClassDate({ db: null, teacherEmail: 'teacher@school.org', classId: '', dateKey: '2026-09-02' });
  assert.deepEqual(result, []);
});

test('both event builders write a top-level dateKey this query can index on', () => {
  const liveAttendance = read('src/platform/teacher/liveAttendance.js');
  const attendanceHistory = read('src/platform/attendance/attendanceHistory.js');
  assert.match(liveAttendance, /\n\s*dateKey,\n\s*evidence: \{/);
  assert.match(attendanceHistory, /\n\s*dateKey: clean\(dateKey\),\n\s*evidence: \{/);
});

test('a matching composite index exists for the new query, deployed alongside the rest', () => {
  const indexes = JSON.parse(read('firestore.indexes.json'));
  const matching = indexes.indexes.find((entry) => (
    entry.collectionGroup === 'studentSupportEvents'
    && entry.fields.some((field) => field.fieldPath === 'classId')
    && entry.fields.some((field) => field.fieldPath === 'dateKey')
  ));
  assert.ok(matching, 'expected a studentSupportEvents index on classId + dateKey');
  const firebaseJson = read('firebase.json');
  assert.match(firebaseJson, /firestore\.indexes\.json/);
});

test('AttendanceHistoryPanel queries by class/date directly instead of trusting a bounded prop feed', () => {
  const panel = read('src/components/teacher/AttendanceHistoryPanel.jsx');
  assert.match(panel, /subscribeAttendanceForClassDate/);
  assert.doesNotMatch(panel, /supportEvents = \[\]/);
});
