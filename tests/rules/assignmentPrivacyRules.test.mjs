import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// Student privacy on shared assignments (PR #407 deep dive F-PRIV-1), through
// the real Security Rules in the Firestore emulator (`npm run test:rules`).
//
// Proven here, by the database rather than by a screen:
//   * with the transition switch OFF (how a release ships), every signed-in
//     user may still list assignments — open tabs from the previous release
//     keep their live updates;
//   * with it ON, a student may list only their own class's assignments (the
//     query the new client makes), not the whole collection and not another
//     class's; teachers are unaffected; one assignment by id stays readable
//     (a student's work from an earlier class);
//   * a student's attendance-extension grants (absence dates, the granting
//     teacher) are readable by their teacher of record, the granting teacher
//     and the root administrator — never by students or other teachers — and
//     no client can write one;
//   * the switch itself is readable by every signed-in user and writable by
//     no client.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against the same emulator.

const PROJECT = 'mathmaster-assignment-privacy-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const TEACHER_FORMER = 'former.teacher@example.test';
const ROOT = 'root.admin@example.test';

let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const formerTeacher = () => env.authenticatedContext('uid-tf', { role: 'teacher', email: TEACHER_FORMER }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const roleless = () => env.authenticatedContext('uid-roleless', {}).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const classList = (db, classId) => getDocs(query(collection(db, 'assignments'), where('assignedClassIds', 'array-contains', classId)));
const wholeList = (db) => getDocs(collection(db, 'assignments'));

const setScope = (studentListScoped) => env.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'platformFlags/assignmentReadScope'), { studentListScoped });
});

const grant = {
  schemaVersion: 1,
  studentId: 'S_A',
  classId: 'class-a',
  assignmentId: 'a1',
  lateDueAt: '2026-10-09T04:59:59.999Z',
  dateKey: '2026-10-08',
  meetingsGranted: 2,
  sourceAbsenceDates: ['2026-10-01', '2026-10-02'],
  grantedByEmail: TEACHER_FORMER,
  grantedAtMs: 1759300000000,
  authorizedTeacherEmails: [TEACHER_FORMER],
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), { classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, 'grades/S_B'), { classId: 'class-b', classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_B, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, 'assignments/a1'), { title: 'Class A lesson', assignedClassIds: ['class-a'] });
    await setDoc(doc(db, 'assignments/a2'), { title: 'Class B lesson', assignedClassIds: ['class-b'] });
    await setDoc(doc(db, 'assignments/a3'), { title: 'Library copy', assignedClassIds: [] });
    await setDoc(doc(db, 'grades/S_A/attendanceExtensionGrants/g1'), grant);
  });
});

after(async () => {
  await env?.cleanup();
});

test('switch OFF (as a release ships): every signed-in user may still list the whole collection', async () => {
  await setScope(false);
  await assertSucceeds(wholeList(studentA()));
  await assertSucceeds(classList(studentA(), 'class-a'));
  await assertSucceeds(wholeList(teacherA()));
  await assertSucceeds(wholeList(roleless()));
  await assertFails(wholeList(anonymous()));
});

test('switch absent behaves as OFF: a deploy without the flag document changes nothing for open tabs', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), 'platformFlags/assignmentReadScope'));
  });
  await assertSucceeds(wholeList(studentA()));
});

test('switch ON: a student lists only their own class, and a teacher still lists everything', async () => {
  await setScope(true);
  await assertFails(wholeList(studentA()));
  await assertSucceeds(classList(studentA(), 'class-a'));
  await assertFails(classList(studentA(), 'class-b'));
  await assertSucceeds(wholeList(teacherA()));
  await assertSucceeds(wholeList(admin()));
  await assertFails(wholeList(roleless()));
  await assertFails(wholeList(anonymous()));
});

test('switch ON: one assignment by id stays readable (work from an earlier class)', async () => {
  await setScope(true);
  await assertSucceeds(getDoc(doc(studentA(), 'assignments/a2')));
  await assertSucceeds(getDoc(doc(studentA(), 'assignments/a1')));
  await assertFails(getDoc(doc(anonymous(), 'assignments/a1')));
});

test('a student\'s extension grants: teacher of record, granting teacher and root admin only', async () => {
  const path = 'grades/S_A/attendanceExtensionGrants/g1';
  await assertSucceeds(getDoc(doc(teacherA(), path)));
  await assertSucceeds(getDoc(doc(formerTeacher(), path)));
  await assertSucceeds(getDoc(doc(admin(), path)));
  await assertFails(getDoc(doc(teacherB(), path)));
  await assertFails(getDoc(doc(studentA(), path)));
  await assertFails(getDoc(doc(anonymous(), path)));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades/S_A/attendanceExtensionGrants')));
  await assertFails(getDocs(collection(studentA(), 'grades/S_A/attendanceExtensionGrants')));
});

test('no client writes an extension grant — only the callable (Admin SDK) does', async () => {
  const fresh = 'grades/S_A/attendanceExtensionGrants/new-grant';
  await assertFails(setDoc(doc(teacherA(), fresh), { ...grant, grantedByEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A] }));
  await assertFails(setDoc(doc(admin(), fresh), grant));
  await assertFails(setDoc(doc(studentA(), fresh), grant));
  await assertFails(updateDoc(doc(teacherA(), 'grades/S_A/attendanceExtensionGrants/g1'), { meetingsGranted: 0 }));
  await assertFails(deleteDoc(doc(admin(), 'grades/S_A/attendanceExtensionGrants/g1')));
});

test('the transition switch is readable by signed-in users and writable by no client', async () => {
  await setScope(true);
  await assertSucceeds(getDoc(doc(studentA(), 'platformFlags/assignmentReadScope')));
  await assertFails(getDoc(doc(anonymous(), 'platformFlags/assignmentReadScope')));
  await assertFails(setDoc(doc(admin(), 'platformFlags/assignmentReadScope'), { studentListScoped: false }));
  await assertFails(setDoc(doc(teacherA(), 'platformFlags/assignmentReadScope'), { studentListScoped: false }));
  await assertFails(setDoc(doc(studentA(), 'platformFlags/assignmentReadScope'), { studentListScoped: false }));
});

test('students still cannot write studentOverrides or assignments at all', async () => {
  await assertFails(updateDoc(doc(studentA(), 'assignments/a1'), { title: 'x' }));
  await assertFails(updateDoc(doc(teacherA(), 'assignments/a1'), { 'studentOverrides.S_A.lateDueAt': '2027-01-01T00:00:00.000Z' }));
});
