import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// studentCcmrPlans/{studentId} — a student's CCMR plan ("I'm preparing for…"
// plus an optional test date), through the real Security Rules in the
// Firestore emulator.
//
// Written only by the setMyCcmrPlan callable (Admin SDK). Proven here: the
// student reads their own plan and nobody else's; a teacher reads it from the
// record's access list or as the student's current teacher of record —
// including "no plan yet" for a student who never saved one — and an
// unrelated teacher reads nothing; no browser of any role may write it.
//
// Synthetic identities only. Own projectId: rules suites run in parallel.

const PROJECT = 'mathmaster-ccmr-plan-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const TEACHER_C = 'teacher.c@example.test';
const TEACHER_Z = 'teacher.z@example.test';
const ROOT = 'root.admin@example.test';
let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacher = (email) => env.authenticatedContext(`uid-${email}`, { role: 'teacher', email }).firestore();
const student = (studentId) => env.authenticatedContext(`uid-${studentId}`, { role: 'student', studentId }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const plan = (studentId, { classId, origin, authorized }) => ({
  schemaVersion: 1,
  studentId,
  classId,
  originClassId: classId,
  originTeacherEmail: origin,
  authorizedTeacherEmails: authorized,
  goals: [{ framework: 'act', since: 1 }],
  testDate: '2026-11-07',
  testFramework: 'act',
  lastChangeSource: 'student',
  createdAt: 1,
  updatedAt: 1,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // S_A: in teacher A's class, plan authorized to A.
    await setDoc(doc(db, 'grades/S_A'), { classId: 'class-a', assignedTeacherEmail: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'studentCcmrPlans/S_A'), plan('S_A', { classId: 'class-a', origin: TEACHER_A, authorized: [TEACHER_A] }));
    // S_B: moved from A to B; the plan was reauthorized to both.
    await setDoc(doc(db, 'grades/S_B'), { classId: 'class-b', assignedTeacherEmail: TEACHER_B, status: 'active' });
    await setDoc(doc(db, 'studentCcmrPlans/S_B'), plan('S_B', { classId: 'class-b', origin: TEACHER_A, authorized: [TEACHER_A, TEACHER_B] }));
    // S_C: teacher A's student who has never saved a plan.
    await setDoc(doc(db, 'grades/S_C'), { classId: 'class-a', assignedTeacherEmail: TEACHER_A, status: 'active' });
    // S_D: now taught by C, plan still lists only A (saved before the move).
    await setDoc(doc(db, 'grades/S_D'), { classId: 'class-c', assignedTeacherEmail: TEACHER_C, status: 'active' });
    await setDoc(doc(db, 'studentCcmrPlans/S_D'), plan('S_D', { classId: 'class-a', origin: TEACHER_A, authorized: [TEACHER_A] }));
  });
});

after(async () => {
  await env?.cleanup();
});

test('a student reads their own plan, and gets "no plan yet" rather than an error before saving one', async () => {
  const own = await assertSucceeds(getDoc(doc(student('S_A'), 'studentCcmrPlans/S_A')));
  assert.equal(own.data().testFramework, 'act');
  const none = await assertSucceeds(getDoc(doc(student('S_C'), 'studentCcmrPlans/S_C')));
  assert.equal(none.exists(), false);
});

test('a student cannot read another student\'s plan', async () => {
  await assertFails(getDoc(doc(student('S_C'), 'studentCcmrPlans/S_A')));
  await assertFails(getDoc(doc(student('S_A'), 'studentCcmrPlans/S_B')));
});

test('a teacher on the record\'s access list reads it, including the origin teacher after a move', async () => {
  await assertSucceeds(getDoc(doc(teacher(TEACHER_A), 'studentCcmrPlans/S_A')));
  await assertSucceeds(getDoc(doc(teacher(TEACHER_A), 'studentCcmrPlans/S_B')));
  await assertSucceeds(getDoc(doc(teacher(TEACHER_B), 'studentCcmrPlans/S_B')));
});

test('the current teacher of record reads the plan even before its access list catches up, and reads "none" when there is none', async () => {
  await assertSucceeds(getDoc(doc(teacher(TEACHER_C), 'studentCcmrPlans/S_D')));
  const none = await assertSucceeds(getDoc(doc(teacher(TEACHER_A), 'studentCcmrPlans/S_C')));
  assert.equal(none.exists(), false);
});

test('an unrelated teacher reads nothing — not a plan, and not whether one exists', async () => {
  await assertFails(getDoc(doc(teacher(TEACHER_Z), 'studentCcmrPlans/S_A')));
  await assertFails(getDoc(doc(teacher(TEACHER_Z), 'studentCcmrPlans/S_C')));
  await assertFails(getDoc(doc(teacher(TEACHER_B), 'studentCcmrPlans/S_A')));
  await assertFails(getDoc(doc(anonymous(), 'studentCcmrPlans/S_A')));
});

test('the root administrator reads any plan', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'studentCcmrPlans/S_A')));
  await assertSucceeds(getDoc(doc(admin(), 'studentCcmrPlans/S_C')));
});

test('a teacher lists only the plans they are authorized for, by the access-list query', async () => {
  const mine = await assertSucceeds(getDocs(query(
    collection(teacher(TEACHER_A), 'studentCcmrPlans'),
    where('authorizedTeacherEmails', 'array-contains', TEACHER_A),
  )));
  assert.deepEqual(mine.docs.map((entry) => entry.id).sort(), ['S_A', 'S_B', 'S_D']);
  await assertFails(getDocs(collection(teacher(TEACHER_A), 'studentCcmrPlans')));
  await assertFails(getDocs(collection(student('S_A'), 'studentCcmrPlans')));
  await assertFails(getDocs(query(
    collection(teacher(TEACHER_Z), 'studentCcmrPlans'),
    where('authorizedTeacherEmails', 'array-contains', TEACHER_A),
  )));
});

test('no browser writes a plan: not the student, the teacher or the root admin', async () => {
  for (const db of [student('S_A'), teacher(TEACHER_A), admin()]) {
    await assertFails(setDoc(doc(db, 'studentCcmrPlans/S_A'), plan('S_A', { classId: 'class-a', origin: TEACHER_A, authorized: [TEACHER_A] })));
    await assertFails(updateDoc(doc(db, 'studentCcmrPlans/S_A'), { testDate: '2026-12-05' }));
    await assertFails(deleteDoc(doc(db, 'studentCcmrPlans/S_A')));
  }
  // Creating a plan where none exists is a write too.
  await assertFails(setDoc(doc(student('S_C'), 'studentCcmrPlans/S_C'), plan('S_C', { classId: 'class-a', origin: TEACHER_A, authorized: [TEACHER_A] })));
  // And no student may forge themselves onto a teacher's access list.
  await assertFails(setDoc(doc(student('S_C'), 'studentCcmrPlans/S_C'), { studentId: 'S_C', authorizedTeacherEmails: [TEACHER_Z] }));
});
