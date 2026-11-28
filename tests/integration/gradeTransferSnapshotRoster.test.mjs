// PERSISTGRADETRANSFERSNAPSHOT KEEPS ONLY THE CLASS'S OWN STUDENTS, AGAINST
// REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-transfer-roster \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/gradeTransferSnapshotRoster.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The real callable proves: a snapshot stores only rows whose studentId is on
// the class's roster, refuses one with no roster rows left, and refuses more
// rows than its cap. Every id starts with `gtroster-`.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';

import { db, fns, refusal, teacherRequest } from './canonicalPersistenceHarness.mjs';

const P = 'gtroster-';
const TEACHER = 'gtroster.teacher@desotoisd.org';
const CLASS_ID = `${P}class`;
const OTHER_CLASS_ID = `${P}class-other`;

before(async () => {
  await db.collection('classes').doc(CLASS_ID).set({ name: 'Transfer', period: 'Period 3', teacherOfRecord: TEACHER, status: 'active' });
  await db.collection('classes').doc(OTHER_CLASS_ID).set({ name: 'Other', period: 'Period 4', teacherOfRecord: 'gtroster.other@desotoisd.org', status: 'active' });
  await db.collection('grades').doc(`${P}ada`).set({ classId: CLASS_ID, sisStudentId: '1500101' });
  await db.collection('grades').doc(`${P}ben`).set({ classId: CLASS_ID, sisStudentId: '1500102' });
  await db.collection('grades').doc(`${P}cy`).set({ classId: OTHER_CLASS_ID, sisStudentId: '1500103' });
});

const row = (studentId, sisStudentId, grade = 90) => ({ studentId, sisStudentId, grade, gradeVersion: `v-${studentId}` });
const persist = (transferId, rows) => fns.persistGradeTransferSnapshot.run(teacherRequest({
  snapshot: { transferId, classId: CLASS_ID, assignmentId: `${P}assignment`, sectionKey: 'classwork', rows },
}, TEACHER));

test('a snapshot keeps only rows for students on the class roster', async () => {
  await persist(`transfer_${P}one`, [row(`${P}ada`, '1500101'), row(`${P}cy`, '1500103'), row(`${P}nobody`, '1500199')]);
  const stored = (await db.collection('gradeTransferSnapshots').doc(`transfer_${P}one`).get()).data();
  assert.deepEqual(stored.rows.map((entry) => entry.studentId), [`${P}ada`]);
});

test('a snapshot with no roster rows left is refused', async () => {
  const outcome = await refusal(persist(`transfer_${P}two`, [row(`${P}cy`, '1500103')]));
  assert.equal(outcome?.code, 'failed-precondition');
  assert.equal((await db.collection('gradeTransferSnapshots').doc(`transfer_${P}two`).get()).exists, false);
});

test('a snapshot with more rows than the cap is refused', async () => {
  const many = Array.from({ length: 1000 }, () => row(`${P}ada`, '1500101'));
  const outcome = await refusal(persist(`transfer_${P}three`, many));
  assert.equal(outcome?.code, 'invalid-argument');
});
