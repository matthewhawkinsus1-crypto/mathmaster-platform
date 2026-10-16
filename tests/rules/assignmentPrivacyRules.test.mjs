import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import assert from 'node:assert/strict';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { fetchStudentAssignments, individuallyAssignedTestCycleIds } from '../../src/platform/assignments/studentAssignmentScope.js';
import { loadStudentMasteryState } from '../../src/platform/mastery/studentMasteryState.js';
import { sendTeacherQuestion } from '../../src/platform/supports/askTeacherStore.js';

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
//     no client;
//   * D10 Phase 0, P0-3 — the by-id switch (`studentGetScoped`): OFF, opening
//     one assignment by id is exactly what it was (any signed-in user). ON, a
//     student opens only their class's assignment, one in their own
//     `gradesByAssignment` (owner decision O3) or a Test they were added to
//     (`testCycleGrades`); another class's, a library copy and any account
//     without a student roster row are refused; teachers and the root
//     administrator are unaffected; a missing document is still "not found";
//     the reads the student's app really makes (studentAssignmentScope.js,
//     the mastery loader, a transaction's get, Ask my teacher) still work.
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
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();
const roleless = () => env.authenticatedContext('uid-roleless', {}).firestore();
// A student account with no roster row yet, and one placed in no class.
const ghostStudent = () => env.authenticatedContext('uid-ghost', { role: 'student', studentId: 'S_GHOST' }).firestore();
const unplacedStudent = () => env.authenticatedContext('uid-su', { role: 'student', studentId: 'S_UNPLACED' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const classList = (db, classId) => getDocs(query(collection(db, 'assignments'), where('assignedClassIds', 'array-contains', classId)));
const wholeList = (db) => getDocs(collection(db, 'assignments'));

const setScope = (studentListScoped) => env.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'platformFlags/assignmentReadScope'), { studentListScoped });
});
// Both switches; the callable is the only writer in production
// (setAssignmentReadScope, which refuses get ON while the list is OFF).
const setScopes = ({ list = false, get = false } = {}) => env.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'platformFlags/assignmentReadScope'), { studentListScoped: list, studentGetScoped: get });
});
const open = (db, id) => getDoc(doc(db, 'assignments', id));
const S_A_GRADES = { a4: { 0: { status: 'correct', totalAttempts: 1 } } };
const S_A_TEST_CYCLE = { t1: { individuallyAssigned: true } };

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
    // S_A: in class-a now; worked a4 in an earlier class (O3); added on their
    // own to the Test t1 before answering anything.
    await setDoc(doc(db, 'grades/S_A'), {
      classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active',
      gradesByAssignment: S_A_GRADES, testCycleGrades: S_A_TEST_CYCLE,
    });
    await setDoc(doc(db, 'grades/S_UNPLACED'), { status: 'active', gradesByAssignment: { a4: {} } });
    await setDoc(doc(db, 'grades/S_B'), { classId: 'class-b', classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_B, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, 'assignments/a1'), { title: 'Class A lesson', assignedClassIds: ['class-a'] });
    await setDoc(doc(db, 'assignments/a2'), { title: 'Class B lesson', assignedClassIds: ['class-b'] });
    await setDoc(doc(db, 'assignments/a3'), { title: 'Library copy', assignedClassIds: [] });
    await setDoc(doc(db, 'assignments/a4'), { title: 'Earlier class lesson', assignedClassIds: ['class-old'], questions: [{ type: 'algebra', alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }] }] });
    await setDoc(doc(db, 'assignments/t1'), { title: 'Unit Test (added individually)', assignedClassIds: ['class-b'] });
    await setDoc(doc(db, 'assignments/legacy-no-classes'), { title: 'Legacy, no assignedClassIds' });
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

/* --- D10 Phase 0, P0-3: who may open one assignment by id ---------------------- */

const EVERY_ASSIGNMENT = ['a1', 'a2', 'a3', 'a4', 't1', 'legacy-no-classes'];

test('by-id switch OFF or absent: opening an assignment by id is exactly today\'s rule (any signed-in user)', async () => {
  for (const scopes of [{ list: false, get: false }, { list: true, get: false }, null]) {
    if (scopes) await setScopes(scopes);
    else await env.withSecurityRulesDisabled(async (context) => { await deleteDoc(doc(context.firestore(), 'platformFlags/assignmentReadScope')); });
    for (const id of EVERY_ASSIGNMENT) {
      await assertSucceeds(open(studentA(), id));
      await assertSucceeds(open(roleless(), id));
      await assertSucceeds(open(ghostStudent(), id));
      await assertSucceeds(open(teacherB(), id));
      await assertFails(open(anonymous(), id));
    }
  }
});

test('by-id switch ON: a student opens their class\'s assignment, their own past work (O3) and a Test they were added to — nothing else', async () => {
  await setScopes({ list: true, get: true });
  await assertSucceeds(open(studentA(), 'a1'), 'their class');
  await assertSucceeds(open(studentA(), 'a4'), 'O3: in their own gradesByAssignment (work from an earlier class)');
  await assertSucceeds(open(studentA(), 't1'), 'a Test they were added to on their own (testCycleGrades), before any answer');
  await assertFails(open(studentA(), 'a2'), 'another class');
  await assertFails(open(studentA(), 'a3'), 'a library copy assigned to no class');
  await assertFails(open(studentA(), 'legacy-no-classes'), 'a document with no assignedClassIds');
  await assertFails(open(studentB(), 'a1'), 'class-b student, class-a lesson');
  await assertSucceeds(open(studentB(), 'a2'));
  await assertSucceeds(open(studentB(), 't1'), 'class-b student, class-b Test');
  // A student placed in no class still opens their own past work, and nothing else.
  await assertSucceeds(open(unplacedStudent(), 'a4'));
  await assertFails(open(unplacedStudent(), 'a3'));
  await assertFails(open(unplacedStudent(), 'a1'));
  // No roster row, no role, no sign-in: nothing.
  await assertFails(open(ghostStudent(), 'a1'));
  await assertFails(open(roleless(), 'a1'));
  await assertFails(open(anonymous(), 'a1'));
});

test('by-id switch ON: teachers and the root administrator open every assignment', async () => {
  await setScopes({ list: true, get: true });
  for (const id of EVERY_ASSIGNMENT) {
    await assertSucceeds(open(teacherA(), id));
    await assertSucceeds(open(teacherB(), id));
    await assertSucceeds(open(formerTeacher(), id));
    await assertSucceeds(open(admin(), id));
  }
});

test('by-id switch ON: a missing assignment is still "not found" for a signed-in user, not refused', async () => {
  await setScopes({ list: true, get: true });
  const missing = await assertSucceeds(open(studentA(), 'deleted-assignment'));
  assert.equal(missing.exists(), false);
  await assertFails(open(anonymous(), 'deleted-assignment'));
});

test('by-id switch ON: a student cannot grant themselves an assignment through their own grade document', async () => {
  await setScopes({ list: true, get: true });
  await assertFails(updateDoc(doc(studentA(), 'grades/S_A'), { 'gradesByAssignment.a2': { 0: { status: 'correct' } } }));
  await assertFails(updateDoc(doc(studentA(), 'grades/S_A'), { 'testCycleGrades.a2': { individuallyAssigned: true } }));
  await assertFails(updateDoc(doc(studentA(), 'grades/S_A'), { classId: 'class-b' }));
  await assertFails(open(studentA(), 'a2'));
});

test('both switches ON: the whole-collection list is refused and the class list allowed (P0-2 with P0-3)', async () => {
  await setScopes({ list: true, get: true });
  await assertFails(wholeList(studentA()));
  await assertSucceeds(classList(studentA(), 'class-a'));
  await assertFails(classList(studentA(), 'class-b'));
  await assertSucceeds(wholeList(teacherA()));
});

test('the switches are independent in the rules: get ON with the list OFF narrows only the get', async () => {
  // The callable refuses this combination; the rules still behave predictably.
  await setScopes({ list: false, get: true });
  await assertFails(open(studentA(), 'a2'));
  await assertSucceeds(open(studentA(), 'a1'));
  await assertSucceeds(wholeList(studentA()));
});

test('both switches ON: the reads the student\'s app makes still work — sign-in scope, mastery, a transaction, Ask my teacher', async () => {
  await setScopes({ list: true, get: true });
  const db = studentA();
  // Sign-in (App.jsx) and the prior-work effect: the class query plus work by
  // id. A stale resume target from another class (a2) is refused and dropped,
  // not fatal.
  const signedIn = await fetchStudentAssignments({
    db, studentId: 'S_A', classId: 'class-a', gradesByAssignment: S_A_GRADES,
    extraIds: ['a2'], individualAssignmentIds: individuallyAssignedTestCycleIds(S_A_TEST_CYCLE),
  });
  assert.deepEqual(signedIn.map((entry) => entry.id).sort(), ['a1', 'a4', 't1']);
  assert.equal(signedIn.find((entry) => entry.id === 't1').assignedToStudentIndividually, true);

  // My Math Path's mastery read without supplied assignments (P0-1): the
  // same scoped read, and the earlier class's work reaches the mastery.
  const dataOf = async (reference) => { const snapshot = await getDoc(reference); return snapshot.exists() ? snapshot.data() : null; };
  const state = await loadStudentMasteryState('S_A', {
    reads: {
      grade: () => dataOf(doc(db, 'grades', 'S_A')),
      retention: () => dataOf(doc(db, 'studentRetentionSchedules', 'S_A')),
      serverMastery: () => dataOf(doc(db, 'studentMasteryProfiles', 'S_A')),
      scopedAssignments: ({ classId, gradesByAssignment, testCycleGrades }) => fetchStudentAssignments({
        db, studentId: 'S_A', classId, gradesByAssignment, individualAssignmentIds: individuallyAssignedTestCycleIds(testCycleGrades),
      }),
    },
  });
  assert.deepEqual(state.fallbackInputs.assignments.map((entry) => entry.id), ['a1', 'a4', 't1']);
  assert.ok(state.masteryProfilesByTEKS['A.5A'], 'the earlier class\'s work counts toward mastery');

  // A transaction's get (the response-checkpoint reconcile, App.jsx) follows the same rule.
  await assertSucceeds(runTransaction(db, async (transaction) => { await transaction.get(doc(db, 'assignments', 'a1')); }));
  await assertFails(runTransaction(db, async (transaction) => { await transaction.get(doc(db, 'assignments', 'a2')); }));

  // Batch 8 (Ask my teacher): the rule's own get() of the assignment is not a
  // read by the student, so a question about their class's lesson still saves.
  await assertSucceeds(sendTeacherQuestion(db, {
    studentId: 'S_A', classId: 'class-a', teacherEmail: TEACHER_A, assignmentId: 'a1',
    assignmentTitle: 'Class A lesson', questionIndex: 0, questionLabel: 'Classwork · Question 1', text: 'Is the slope the rise over the run?',
  }));
  await assertFails(sendTeacherQuestion(db, {
    studentId: 'S_A', classId: 'class-a', teacherEmail: TEACHER_A, assignmentId: 'a2',
    assignmentTitle: 'Class B lesson', questionIndex: 0, questionLabel: 'Classwork · Question 1', text: 'Another class?',
  }));
});
