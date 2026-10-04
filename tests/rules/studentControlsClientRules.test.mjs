import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

import {
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  studentAssignmentOverrideId,
} from '../../functions/shared/studentAssignmentOverrides.mjs';
import { studentAssignmentControlsQuery } from '../../src/platform/assignments/studentAssignmentControls.js';
import { studentClassAssignmentsQuery } from '../../src/platform/assignments/studentAssignmentScope.js';
import { teacherClassControlsQuery } from '../../src/platform/teacher/teacherClassControls.js';
import { overrideHistoryQuery } from '../../src/platform/teacher/studentOverrideHistory.js';

// THE CLIENT FOLLOW-UP'S OWN QUERIES, THROUGH THE REAL RULES (`npm run test:rules`).
//
// PR #432's suite (studentAssignmentOverrideRules.test.mjs) attacks the
// collection from every angle. This one runs EXACTLY the queries the shipped
// client builds — the student device's one listener
// (src/platform/assignments/studentAssignmentControls.js), the teacher's one
// class-scoped listener (src/platform/teacher/teacherClassControls.js), the
// staff history read (src/platform/teacher/studentOverrideHistory.js) — and
// the field-scoped class DOL writes that replaced whole-`dol` writes, so a
// rules change that would break a real screen fails here:
//
//    1. A reads A's own records — with the device's one query, as a listener;
//    2. A cannot read B's;
//    3. A cannot list the class (any class query the teacher screen uses);
//  4–6. A cannot give themselves an extension, a reopen or DOL attempts;
//    7. the teacher of record runs the class listener (one class or several)
//       and the history read;
//    8. an unrelated teacher can do neither;
//    9. the root administrator reads through the root clause and writes
//       nothing directly — changes go through the audited callables;
// 11/12. a second student on the same device can neither list nor fetch the
//       first student's records, cached or not (the cache is never the rules).
//
// Synthetic identities only. Own projectId (suites run in parallel).

const PROJECT = 'mathmaster-student-controls-client-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const OVERRIDES = STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION;

let env;
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: 'root.admin@example.test' }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();

const record = (studentId, assignmentId, classId, teacher, extra = {}) => ({
  schemaVersion: 1, studentId, assignmentId, classId, originClassId: classId, originTeacherEmail: teacher,
  authorizedTeacherEmails: [teacher], lateDueAt: null, extension: null, excused: false, reopened: false,
  dolExtraAttempts: 0, dolAttemptGrant: null, revision: 1, source: 'test', updatedBy: 'teacher', ...extra,
});
const event = (studentId, assignmentId, teacher, extra = {}) => ({
  schemaVersion: 1, kind: 'dolAttempts', studentId, assignmentId, authorizedTeacherEmails: [teacher],
  actorEmail: teacher, revision: 1, before: { dolExtraAttempts: 0 }, after: { dolExtraAttempts: 1 }, ...extra,
});

const lessonDol = {
  enabled: true,
  attemptGrantsByClassId: { 'class-a': { extraAttempts: 1 } },
  windowsByClassId: {},
  recoveryAudit: [],
};

const setStorage = (sharedRetired) => env.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'platformFlags/assignmentOverrideStorage'), { sharedRetired });
});

const ids = (snapshot) => snapshot.docs.map((entry) => entry.id).sort();
const listenOnce = (target) => new Promise((resolve) => {
  const unsubscribe = onSnapshot(
    target,
    (snapshot) => { unsubscribe(); resolve({ ok: true, ids: ids(snapshot) }); },
    (error) => resolve({ ok: false, code: error.code }),
  );
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), { classId: 'class-a', assignedTeacherEmail: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'grades/S_B'), { classId: 'class-a', assignedTeacherEmail: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'grades/S_C'), { classId: 'class-b', assignedTeacherEmail: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'grades/S_D'), { classId: 'class-d', assignedTeacherEmail: TEACHER_B, status: 'active' });
    // S_M moved from teacher A's class to teacher B's: the record keeps A as its origin.
    await setDoc(doc(db, 'grades/S_M'), { classId: 'class-d', assignedTeacherEmail: TEACHER_B, status: 'active' });
    await setDoc(doc(db, 'classes/class-a'), { teacherOfRecord: TEACHER_A });
    await setDoc(doc(db, 'classes/class-b'), { teacherOfRecord: TEACHER_A });
    await setDoc(doc(db, 'classes/class-d'), { teacherOfRecord: TEACHER_B });
    await setDoc(doc(db, `${OVERRIDES}/${studentAssignmentOverrideId('S_A', 'a1')}`), record('S_A', 'a1', 'class-a', TEACHER_A, { lateDueAt: '2026-10-15T04:59:59.999Z', extension: { dateKey: '2026-10-14', grantedAt: 1 } }));
    await setDoc(doc(db, `${OVERRIDES}/${studentAssignmentOverrideId('S_A', 'a2')}`), record('S_A', 'a2', 'class-a', TEACHER_A, { dolExtraAttempts: 2 }));
    await setDoc(doc(db, `${OVERRIDES}/${studentAssignmentOverrideId('S_B', 'a1')}`), record('S_B', 'a1', 'class-a', TEACHER_A, { excused: true, reopened: true }));
    await setDoc(doc(db, `${OVERRIDES}/${studentAssignmentOverrideId('S_C', 'a3')}`), record('S_C', 'a3', 'class-b', TEACHER_A, { reopened: true }));
    await setDoc(doc(db, `${OVERRIDES}/${studentAssignmentOverrideId('S_D', 'a4')}`), record('S_D', 'a4', 'class-d', TEACHER_B, { excused: true }));
    await setDoc(doc(db, `${OVERRIDES}/${studentAssignmentOverrideId('S_M', 'a1')}`), {
      ...record('S_M', 'a1', 'class-d', TEACHER_B, { lateDueAt: '2026-10-20T04:59:59.999Z' }),
      originClassId: 'class-a', originTeacherEmail: TEACHER_A, authorizedTeacherEmails: [TEACHER_A, TEACHER_B],
    });
    await setDoc(doc(db, 'grades/S_A/assignmentOverrideEvents/a2__r1'), event('S_A', 'a2', TEACHER_A));
    await setDoc(doc(db, 'grades/S_M/assignmentOverrideEvents/a1__r1'), event('S_M', 'a1', TEACHER_A, { authorizedTeacherEmails: [TEACHER_A, TEACHER_B] }));
    await setDoc(doc(db, 'assignments/a1'), { title: 'Lesson', assignedClassIds: ['class-a'], dol: lessonDol });
    await setDoc(doc(db, 'assignments/a1-legacy'), {
      title: 'Legacy lesson', assignedClassIds: ['class-a'],
      dol: { ...lessonDol, attemptGrantsByStudentId: { S_B: { extraAttempts: 1 } } },
    });
  });
});

after(async () => {
  await setStorage(false);
  await env?.cleanup();
});

/* 1 ---------------------------------------------------------------------- */

test('1. a student reads their own records with the device\'s one query — as the live listener it is', async () => {
  const listened = await listenOnce(studentAssignmentControlsQuery(studentA(), 'S_A'));
  assert.deepEqual(listened, { ok: true, ids: [studentAssignmentOverrideId('S_A', 'a1'), studentAssignmentOverrideId('S_A', 'a2')].sort() });
  await assertSucceeds(getDocs(studentAssignmentControlsQuery(studentA(), 'S_A')));
  // Their class's lessons: the other listener a student device runs.
  await assertSucceeds(getDocs(studentClassAssignmentsQuery(studentA(), 'class-a')));
});

/* 2 / 11 / 12 ------------------------------------------------------------- */

test('2 / 11 / 12. the next student on the device can neither list nor fetch the first one\'s records', async () => {
  // B builds the same query for A (a stale query, a tampered client): refused by the server, as a listener and as a read.
  const listened = await listenOnce(studentAssignmentControlsQuery(studentB(), 'S_A'));
  assert.equal(listened.ok, false);
  assert.equal(listened.code, 'permission-denied');
  await assertFails(getDocs(studentAssignmentControlsQuery(studentB(), 'S_A')));
  await assertFails(getDoc(doc(studentB(), `${OVERRIDES}/${studentAssignmentOverrideId('S_A', 'a1')}`)));
  // B's own query returns B's records only.
  assert.deepEqual(await listenOnce(studentAssignmentControlsQuery(studentB(), 'S_B')), { ok: true, ids: [studentAssignmentOverrideId('S_B', 'a1')] });
});

/* 3 ---------------------------------------------------------------------- */

test('3. a student cannot list the class with any query a teacher screen uses', async () => {
  for (const target of [
    teacherClassControlsQuery(studentA(), { email: TEACHER_A, classIds: ['class-a'] }),
    teacherClassControlsQuery(studentA(), { email: TEACHER_A, classIds: ['class-a', 'class-b'] }),
    teacherClassControlsQuery(studentA(), { isRootAdmin: true, classIds: ['class-a'] }),
    query(collection(studentA(), OVERRIDES), where('studentId', 'in', ['S_A', 'S_B'])),
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await assertFails(getDocs(target));
  }
  await assertFails(getDocs(overrideHistoryQuery(studentA(), { studentId: 'S_A', assignmentId: 'a2', email: TEACHER_A })), 'not even their own history: it names who granted what');
});

/* 4–6 -------------------------------------------------------------------- */

test('4–6. a student cannot give themselves an extension, a reopen or DOL attempts — on the record or on the lesson', async () => {
  const own = doc(studentA(), `${OVERRIDES}/${studentAssignmentOverrideId('S_A', 'a1')}`);
  await assertFails(updateDoc(own, { lateDueAt: '2027-01-01T05:59:59.999Z' }));
  await assertFails(updateDoc(own, { reopened: true }));
  await assertFails(updateDoc(own, { dolExtraAttempts: 20 }));
  await assertFails(setDoc(doc(studentA(), `${OVERRIDES}/${studentAssignmentOverrideId('S_A', 'a9')}`), record('S_A', 'a9', 'class-a', TEACHER_A, { reopened: true })));
  await assertFails(updateDoc(doc(studentA(), 'assignments/a1'), { 'dol.attemptGrantsByStudentId.S_A': { extraAttempts: 5 } }));
  await assertFails(updateDoc(doc(studentA(), 'assignments/a1'), { 'studentOverrides.S_A.lateDueAt': '2027-01-01T05:59:59.999Z' }));
  await assertFails(updateDoc(doc(studentA(), 'assignments/a1'), { reopenedStudentIds: ['S_A'] }));
});

/* 7 / 8 ------------------------------------------------------------------ */

test('7. the teacher of record runs the class listener (one class or several) and reads the history', async () => {
  assert.deepEqual(await listenOnce(teacherClassControlsQuery(teacherA(), { email: TEACHER_A, classIds: ['class-a'] })), {
    ok: true,
    ids: ['S_A', 'S_B'].flatMap((id) => (id === 'S_A' ? [studentAssignmentOverrideId(id, 'a1'), studentAssignmentOverrideId(id, 'a2')] : [studentAssignmentOverrideId(id, 'a1')])).sort(),
  });
  const several = await assertSucceeds(getDocs(teacherClassControlsQuery(teacherA(), { email: TEACHER_A.toUpperCase(), classIds: ['class-a', 'class-b'] })));
  assert.equal(several.size, 4, 'the email is sent lower-case, as the rules compare it');
  // The origin teacher of a moved student still reads that student's history…
  await assertSucceeds(getDocs(overrideHistoryQuery(teacherA(), { studentId: 'S_M', assignmentId: 'a1', email: TEACHER_A })));
  await assertSucceeds(getDocs(overrideHistoryQuery(teacherA(), { studentId: 'S_A', assignmentId: 'a2', email: TEACHER_A })));
  // …and the moved student's record is in the class they are in now.
  const moved = await assertSucceeds(getDocs(teacherClassControlsQuery(teacherB(), { email: TEACHER_B, classIds: ['class-d'] })));
  assert.deepEqual(ids(moved), [studentAssignmentOverrideId('S_D', 'a4'), studentAssignmentOverrideId('S_M', 'a1')].sort());
});

test('8. an unrelated teacher reads neither another class\'s controls nor a student\'s history', async () => {
  // Their own class scope cannot reach class-a's records…
  const theirs = await assertSucceeds(getDocs(teacherClassControlsQuery(teacherB(), { email: TEACHER_B, classIds: ['class-a'] })));
  assert.equal(theirs.size, 0, 'the authorization constraint returns none of class-a\'s students');
  // …a query without their authorization is refused outright…
  await assertFails(getDocs(teacherClassControlsQuery(teacherB(), { isRootAdmin: true, classIds: ['class-a'] })));
  // …so is claiming another teacher's email…
  await assertFails(getDocs(teacherClassControlsQuery(teacherB(), { email: TEACHER_A, classIds: ['class-a'] })));
  // …and the history of a student they do not teach: the screen's query, held
  // to their own authorization, is provable and comes back empty; any other
  // shape, or fetching the event by name, is refused.
  const history = await assertSucceeds(getDocs(overrideHistoryQuery(teacherB(), { studentId: 'S_A', assignmentId: 'a2', email: TEACHER_B })));
  assert.equal(history.size, 0, 'none of S_A\'s history names teacher B');
  await assertFails(getDocs(overrideHistoryQuery(teacherB(), { studentId: 'S_A', assignmentId: 'a2', email: TEACHER_A })));
  await assertFails(getDocs(overrideHistoryQuery(teacherB(), { studentId: 'S_A', assignmentId: 'a2', isRootAdmin: true })));
  await assertFails(getDoc(doc(teacherB(), 'grades/S_A/assignmentOverrideEvents/a2__r1')));
});

/* 9 ---------------------------------------------------------------------- */

test('9. the root administrator reads through the root clause, and writes nothing directly', async () => {
  const all = await assertSucceeds(getDocs(teacherClassControlsQuery(root(), { isRootAdmin: true, classIds: ['class-a', 'class-b', 'class-d'] })));
  assert.equal(all.size, 6);
  await assertSucceeds(getDocs(overrideHistoryQuery(root(), { studentId: 'S_A', assignmentId: 'a2', isRootAdmin: true })));
  await assertFails(updateDoc(doc(root(), `${OVERRIDES}/${studentAssignmentOverrideId('S_A', 'a1')}`), { reopened: true }));
  await assertFails(setDoc(doc(root(), 'grades/S_A/assignmentOverrideEvents/forged'), event('S_A', 'a1', TEACHER_A)));
});

/* the class DOL writes that replaced whole-`dol` writes ------------------- */

test('a teacher\'s class DOL action, written as dotted fields, passes in both storage stages; a student\'s grant never does once retired', async () => {
  for (const sharedRetired of [false, true]) {
    // eslint-disable-next-line no-await-in-loop
    await setStorage(sharedRetired);
    for (const lesson of ['assignments/a1', 'assignments/a1-legacy']) {
      // eslint-disable-next-line no-await-in-loop
      await assertSucceeds(updateDoc(doc(teacherA(), lesson), {
        'dol.windowsByClassId': { 'class-a': { closedAt: `2026-10-0${sharedRetired ? 2 : 1}T15:00:00.000Z` } },
        'dol.recoveryAudit': [{ id: `close:${sharedRetired}`, action: 'closeWindow', scope: { type: 'class', classId: 'class-a' } }],
        updatedAt: '2026-10-01T15:00:00.000Z',
      }), `${lesson}, ${sharedRetired ? 'retired' : 'mirrored'}`);
    }
  }
  // Retired: a student's grant cannot be put back on a lesson, by any shape.
  await assertFails(updateDoc(doc(teacherA(), 'assignments/a1'), { 'dol.attemptGrantsByStudentId.S_A': { extraAttempts: 1 } }));
  await assertFails(updateDoc(doc(teacherA(), 'assignments/a1-legacy'), { 'dol.attemptGrantsByStudentId.S_B': { extraAttempts: 3 } }));
  // Mirrored: a previous-release tab's old-style grant still lands (the absorber moves it).
  await setStorage(false);
  await assertSucceeds(updateDoc(doc(teacherA(), 'assignments/a1-legacy'), { 'dol.attemptGrantsByStudentId.S_B': { extraAttempts: 2 } }));
});
