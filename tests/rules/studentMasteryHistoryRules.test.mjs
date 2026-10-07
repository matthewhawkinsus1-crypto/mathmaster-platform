import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// studentMasteryHistory/{studentId} — weekly growth snapshots of a student's
// mastery (functions/shared/masteryHistory.mjs), through the real Security
// Rules in the Firestore emulator.
//
// Written only by the mastery trigger with the Admin SDK, in the same
// transaction as studentMasteryProfiles, and readable exactly as that profile
// is: the student themselves, a teacher on the document's authorized list, the
// root admin. Proven here: nobody else reads it, and no browser — the student,
// their teacher or the root admin — can create, edit or delete it, so a
// forged "you grew" can never appear and a real one can never be erased.
//
// Synthetic identities only. Own projectId: rules suites run in parallel.

const PROJECT = 'mathmaster-mastery-history-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const ROOT = 'root.admin@example.test';
let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();
const roleless = () => env.authenticatedContext('uid-nobody', {}).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const PATH = 'studentMasteryHistory/S_A';
const RECORD = {
  schemaVersion: 1,
  studentId: 'S_A',
  classId: 'class-a',
  originClassId: 'class-a',
  originTeacherEmail: TEACHER_A,
  authorizedTeacherEmails: [TEACHER_A],
  weeks: {
    '2026-09-07': { skills: { 'A.5A': [58, 2] }, updatedAt: 1 },
    '2026-10-05': { skills: { 'A.5A': [91, 4] }, updatedAt: 2 },
  },
  updatedAt: 2,
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
    await setDoc(doc(db, PATH), RECORD);
    await setDoc(doc(db, 'studentMasteryHistory/S_B'), {
      ...RECORD, studentId: 'S_B', classId: 'class-b', originClassId: 'class-b', originTeacherEmail: TEACHER_B, authorizedTeacherEmails: [TEACHER_B],
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('the student reads their own growth history, and only their own', async () => {
  await assertSucceeds(getDoc(doc(studentA(), PATH)));
  await assertFails(getDoc(doc(studentB(), PATH)));
  await assertFails(getDocs(collection(studentA(), 'studentMasteryHistory')));
});

test('an authorized teacher and the root admin read it; any other teacher does not', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), PATH)));
  await assertSucceeds(getDoc(doc(admin(), PATH)));
  await assertFails(getDoc(doc(teacherB(), PATH)));
  // A teacher's list query must carry the authorized-teacher constraint.
  await assertSucceeds(getDocs(query(collection(teacherA(), 'studentMasteryHistory'), where('authorizedTeacherEmails', 'array-contains', TEACHER_A))));
  await assertFails(getDocs(collection(teacherA(), 'studentMasteryHistory')));
});

test('signed-out and role-less visitors read nothing', async () => {
  await assertFails(getDoc(doc(anonymous(), PATH)));
  await assertFails(getDoc(doc(roleless(), PATH)));
});

test('no browser creates, edits or deletes a history — not the student, the teacher or the root admin', async () => {
  for (const db of [studentA(), teacherA(), admin()]) {
    await assertFails(setDoc(doc(db, 'studentMasteryHistory/S_NEW'), { ...RECORD, studentId: 'S_NEW' }));
    await assertFails(setDoc(doc(db, PATH), RECORD));
    await assertFails(updateDoc(doc(db, PATH), { 'weeks.2026-10-05.skills': { 'A.5A': [100, 4] } }));
    await assertFails(deleteDoc(doc(db, PATH)));
  }
});
