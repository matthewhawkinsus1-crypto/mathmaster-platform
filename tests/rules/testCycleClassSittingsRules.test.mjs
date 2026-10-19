import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

// testCycleClassSittings/{assignmentId__classId__dateKey} — the times a
// class-period Test day resolved to when the class first started the Test in
// it (functions/shared/testCycleAvailability.mjs classSittingToRecord),
// through the real Security Rules in the Firestore emulator.
//
// Written only by startSecureExamSession and read only by the Test Cycle
// callables, both with the Admin SDK. A forged sitting would close a Test day
// for a class and mark absent students missed, so no browser — student,
// teacher, root admin or signed out — may create, edit, delete or read one.
//
// Synthetic identities only. Own projectId: rules suites run in parallel.

const PROJECT = 'mathmaster-test-cycle-class-sittings-rules';
const TEACHER_A = 'teacher.a@example.test';
const ROOT = 'root.admin@example.test';
let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const ID = 'assignment-1__class-a__2026-10-13';
const PATH = `testCycleClassSittings/${ID}`;
const SITTING = {
  assignmentId: 'assignment-1',
  classId: 'class-a',
  dateKey: '2026-10-13',
  windowId: 'day-2026-10-13',
  period: '2',
  dayType: 'A',
  opensAt: 1_000,
  closesAt: 4_000,
  recordedAt: 1_500,
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), { classId: 'class-a', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, PATH), SITTING);
  });
});

after(async () => {
  await env?.cleanup();
});

test('no browser reads a recorded class sitting — not the student, the teacher, the root admin or anyone signed out', async () => {
  for (const db of [studentA(), teacherA(), admin(), anonymous()]) {
    await assertFails(getDoc(doc(db, PATH)));
    await assertFails(getDocs(query(collection(db, 'testCycleClassSittings'), where('assignmentId', '==', 'assignment-1'))));
  }
});

test('no browser can record, move or delete a sitting', async () => {
  for (const db of [studentA(), teacherA(), admin(), anonymous()]) {
    await assertFails(setDoc(doc(db, 'testCycleClassSittings/assignment-1__class-a__2026-10-14'), { ...SITTING, dateKey: '2026-10-14' }));
    await assertFails(updateDoc(doc(db, PATH), { closesAt: 9_000 }));
    await assertFails(deleteDoc(doc(db, PATH)));
  }
});
