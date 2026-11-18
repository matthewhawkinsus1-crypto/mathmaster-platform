// grades/{studentId}/responseDetail/{assignmentId}: a question record's detail,
// stored beside the grades document (functions/shared/gradeEntryStorage.mjs).
// Readable by exactly who may read the grades document; written only by the
// server or the student's own teacher (or root), for this student and this
// assignment; never by a student, never deleted from a browser.
import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT = 'mathmaster-response-detail-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const ROOT = 'root.admin@example.test';
let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const PATH = 'grades/S_A/responseDetail/a1';
const DETAIL = { studentId: 'S_A', assignmentId: 'a1', questions: { 0: { detailRef: 'r1', partGrades: [], lastResponseKey: '{"x":"4"}' } } };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), { classId: 'class-a', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: { a1: { 0: { status: 'attempted', detailRef: 'r1' } } } });
    await setDoc(doc(db, 'grades/S_B'), { classId: 'class-b', assignedTeacherEmail: TEACHER_B, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, PATH), DETAIL);
  });
});

after(async () => {
  await env?.cleanup();
});

test('the student, their teacher and root read it; no one else does', async () => {
  await assertSucceeds(getDoc(doc(studentA(), PATH)));
  await assertSucceeds(getDoc(doc(teacherA(), PATH)));
  await assertSucceeds(getDoc(doc(admin(), PATH)));
  await assertSucceeds(getDocs(collection(studentA(), 'grades/S_A/responseDetail')));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades/S_A/responseDetail')));
  await assertFails(getDoc(doc(studentB(), PATH)));
  await assertFails(getDoc(doc(teacherB(), PATH)));
  await assertFails(getDocs(collection(teacherB(), 'grades/S_A/responseDetail')));
  await assertFails(getDoc(doc(anonymous(), PATH)));
});

test('the student\'s own teacher (and root) write it for this student and assignment; a student never does', async () => {
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/responseDetail/a2'), { studentId: 'S_A', assignmentId: 'a2', questions: {} }));
  await assertSucceeds(updateDoc(doc(admin(), PATH), { questions: { 0: { detailRef: 'r2' } } }));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/responseDetail/a3'), { studentId: 'S_B', assignmentId: 'a3', questions: {} }));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/responseDetail/a3'), { studentId: 'S_A', assignmentId: 'other', questions: {} }));
  await assertFails(setDoc(doc(teacherB(), 'grades/S_A/responseDetail/a3'), { studentId: 'S_A', assignmentId: 'a3', questions: {} }));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/responseDetail/a3'), { studentId: 'S_A', assignmentId: 'a3', questions: {} }));
  await assertFails(updateDoc(doc(studentA(), PATH), { questions: {} }));
  await assertFails(deleteDoc(doc(teacherA(), PATH)));
  await assertFails(deleteDoc(doc(admin(), PATH)));
});
