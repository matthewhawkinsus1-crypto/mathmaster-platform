import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

import { buildSisSnapshotDocument } from '../../functions/shared/sisGradebookSnapshot.mjs';

// Student Case Review — the one new collection, through the real Security
// Rules in the Firestore emulator (`npm run test:rules`).
//
// grades/{sid}/sisGradebookSnapshots holds an official-gradebook snapshot a
// teacher chose to save with one student's case file. Proven here, by the
// database rather than by a screen:
//   * only the student's teacher of record (or the root admin) can save one,
//     and it names its author and carries server time;
//   * students, other teachers and anonymous users cannot read one;
//   * nobody can edit or delete one, or add fields such as another student's rows;
//   * the case review's other reads are unchanged: assignment evidence events
//     without an access list stay unreadable to teachers (they reach the case
//     review only through the loadStudentCaseEvidence callable).
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against the same emulator.

const PROJECT = 'mathmaster-case-review-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const ROOT = 'root.admin@example.test';

let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const extracted = {
  matchedBy: 'sis-id',
  items: [
    { name: 'Lesson 1 - Classwork', category: 'Daily', score: 90, scoreText: '90', scoreKind: 'number', pointsPossible: 100 },
    { name: 'Quiz 2', category: 'Major', score: 72, scoreText: '72', scoreKind: 'number' },
  ],
  categories: [{ name: 'Daily', weight: 40 }, { name: 'Major', weight: 60 }],
  officialAverage: 79.2,
};
const snapshot = (overrides = {}, { email = TEACHER_A, classId = 'class-a' } = {}) => {
  const { payload, errors } = buildSisSnapshotDocument({
    studentId: 'S_A', classId, extracted, layout: 'long', fileName: 'gradebook-synthetic.csv', createdByEmail: email,
    confirmedMatches: { 'Quiz 2': { none: true } },
  });
  if (errors.length) throw new Error(errors.join(' '));
  return { ...payload, importedAt: serverTimestamp(), ...overrides };
};
const path = (id) => `grades/S_A/sisGradebookSnapshots/${id}`;

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
    await setDoc(doc(db, 'grades/S_A/sisGradebookSnapshots/seeded'), { ...snapshot({ importedAt: Timestamp.now() }) });
    // An assignment evidence event as the server writes it: no access list.
    await setDoc(doc(db, 'grades/S_A/evidenceEvents/ev-assignment'), {
      eventKey: 'ev-assignment', studentId: 'S_A', occurredAt: 1, source: { kind: 'assignment', assignmentId: 'a1', questionIndex: 0 }, performance: { attemptNumber: 1, isCorrect: true },
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('the teacher of record saves a snapshot built by the shared builder, with server time', async () => {
  await assertSucceeds(setDoc(doc(teacherA(), path('ok-1')), snapshot()));
  await assertSucceeds(getDoc(doc(teacherA(), path('ok-1'))));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades/S_A/sisGradebookSnapshots')));
});

test('the root admin may save and read one too', async () => {
  await assertSucceeds(setDoc(doc(admin(), path('root-1')), snapshot({}, { email: ROOT })));
  await assertSucceeds(getDoc(doc(admin(), path('seeded'))));
});

test('students, other teachers and anonymous users can neither read nor write a snapshot', async () => {
  await assertFails(getDoc(doc(studentA(), path('seeded'))));
  await assertFails(getDocs(collection(studentA(), 'grades/S_A/sisGradebookSnapshots')));
  await assertFails(getDoc(doc(teacherB(), path('seeded'))));
  await assertFails(getDoc(doc(anonymous(), path('seeded'))));
  await assertFails(setDoc(doc(studentA(), path('student-1')), snapshot()));
  await assertFails(setDoc(doc(teacherB(), path('other-1')), snapshot({}, { email: TEACHER_B })));
});

test('the author, the access list, the time and the class are the server\'s and the roster\'s, not the client\'s', async () => {
  await assertFails(setDoc(doc(teacherA(), path('bad-author')), snapshot({ importedByEmail: TEACHER_B })));
  await assertFails(setDoc(doc(teacherA(), path('bad-list')), snapshot({ authorizedTeacherEmails: [TEACHER_A, TEACHER_B] })));
  await assertFails(setDoc(doc(teacherA(), path('backdated')), snapshot({ importedAt: Timestamp.fromMillis(Date.parse('2026-01-01T00:00:00Z')) })));
  await assertFails(setDoc(doc(teacherA(), path('bad-class')), snapshot({}, { classId: 'class-b' })));
  await assertFails(setDoc(doc(teacherA(), path('bad-student')), snapshot({ studentId: 'S_B' })));
});

test('only the listed fields, a known layout, at least one and at most 300 items', async () => {
  await assertFails(setDoc(doc(teacherA(), path('extra-key')), snapshot({ otherStudents: [{ id: 'S_B', score: 50 }] })));
  await assertFails(setDoc(doc(teacherA(), path('bad-layout')), snapshot({ layout: 'xlsx' })));
  await assertFails(setDoc(doc(teacherA(), path('unmatched')), snapshot({ matchedBy: 'name' })));
  await assertFails(setDoc(doc(teacherA(), path('empty')), snapshot({ items: [] })));
  await assertFails(setDoc(doc(teacherA(), path('huge')), snapshot({ items: Array.from({ length: 301 }, (_, index) => ({ name: `Item ${index}`, score: 1 })) })));
  await assertFails(setDoc(doc(teacherA(), path('bad-average')), snapshot({ officialAverage: '79' })));
});

test('a saved snapshot is immutable', async () => {
  await assertFails(updateDoc(doc(teacherA(), path('seeded')), { officialAverage: 100 }));
  await assertFails(deleteDoc(doc(teacherA(), path('seeded'))));
  await assertFails(deleteDoc(doc(admin(), path('seeded'))));
});

test('unchanged: an assignment evidence event without an access list is not teacher-readable', async () => {
  await assertFails(getDoc(doc(teacherA(), 'grades/S_A/evidenceEvents/ev-assignment')));
  await assertSucceeds(getDoc(doc(studentA(), 'grades/S_A/evidenceEvents/ev-assignment')));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/evidenceEvents/forged'), { eventKey: 'forged', studentId: 'S_A' }));
});
