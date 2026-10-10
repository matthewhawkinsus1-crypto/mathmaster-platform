import test, { after, before } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// Class rewards (a teacher's non-academic redeemables and the requests
// students make with them), through the real Security Rules in the Firestore
// emulator (`npm run test:rules`).
//
// Proven here, by the database rather than by a screen:
//   1. a student reads their OWN class's catalog, never another class's;
//   2. the class's teacher of record reads its catalog; another teacher cannot;
//   3. a student reads their own requests (by id and by their own query),
//      never a classmate's;
//   4. the class's teachers read its requests, including the pending-requests
//      query the teacher panel runs; another teacher cannot;
//   5. the root administrator reads both;
//   6. no client — student, teacher or root administrator — creates, edits or
//      deletes a catalog or a request. A forged "fulfilled", a forged refund
//      or a catalog item with a grade effect can only be refused.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against one emulator.

const PROJECT = 'mathmaster-class-rewards-rules';
const ROOT_ADMIN = 'matthew.hawkins@desotoisd.org';
const TEACHER_A = 'cr.teacher.a@example.org';
const TEACHER_B = 'cr.teacher.b@example.org';

let env;
const admin = () => env.authenticatedContext('uid-admin', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'CR_STUDENT_A' }).firestore();
const classmate = () => env.authenticatedContext('uid-sa2', { role: 'student', studentId: 'CR_STUDENT_A2' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'CR_STUDENT_B' }).firestore();
// A student token that names someone else's id in a different claim shape.
const roleless = () => env.authenticatedContext('uid-x', { studentId: 'CR_STUDENT_A' }).firestore();
const stranger = () => env.unauthenticatedContext().firestore();

const ITEM = { itemId: 'starter-seat', label: 'Choose your seat for a day', description: '', cost: 50, active: true, weeklyLimitPerStudent: 1 };
const request = (id, studentId, classId, teacherEmail, status = 'pending') => ({
  schemaVersion: 1,
  requestDocId: id,
  requestId: `client-${id}`,
  studentId,
  classId,
  itemId: ITEM.itemId,
  itemLabel: ITEM.label,
  cost: 50,
  weekKey: '2026-10-05',
  status,
  requestedAt: '2026-10-07T15:00:00.000Z',
  debitTransactionId: `crd_${id}`,
  authorizedTeacherEmails: [teacherEmail],
  originTeacherEmail: teacherEmail,
});

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
    await setDoc(doc(db, 'classes/cr-class-a'), { teacherOfRecord: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'classes/cr-class-b'), { teacherOfRecord: TEACHER_B, status: 'active' });
    await setDoc(doc(db, 'grades/CR_STUDENT_A'), { classId: 'cr-class-a', assignedTeacherEmail: TEACHER_A, displayName: 'Student A' });
    await setDoc(doc(db, 'grades/CR_STUDENT_A2'), { classId: 'cr-class-a', assignedTeacherEmail: TEACHER_A, displayName: 'Student A2' });
    await setDoc(doc(db, 'grades/CR_STUDENT_B'), { classId: 'cr-class-b', assignedTeacherEmail: TEACHER_B, displayName: 'Student B' });
    await setDoc(doc(db, 'classRewardCatalogs/cr-class-a'), { schemaVersion: 1, classId: 'cr-class-a', items: [ITEM], revision: 1 });
    await setDoc(doc(db, 'classRewardCatalogs/cr-class-b'), { schemaVersion: 1, classId: 'cr-class-b', items: [ITEM], revision: 1 });
    await setDoc(doc(db, 'classRewardRequests/crr_a'), request('crr_a', 'CR_STUDENT_A', 'cr-class-a', TEACHER_A));
    await setDoc(doc(db, 'classRewardRequests/crr_a2'), request('crr_a2', 'CR_STUDENT_A2', 'cr-class-a', TEACHER_A));
    await setDoc(doc(db, 'classRewardRequests/crr_b'), request('crr_b', 'CR_STUDENT_B', 'cr-class-b', TEACHER_B));
    // A request written before class A changed hands: its authorized list
    // names only the previous teacher.
    await setDoc(doc(db, 'classRewardRequests/crr_old'), request('crr_old', 'CR_STUDENT_A', 'cr-class-a', 'previous.teacher@example.org'));
  });
});

after(async () => { await env?.cleanup(); });

// 1–2. The catalog.

test('a student reads their own class\'s catalog, never another class\'s', async () => {
  await assertSucceeds(getDoc(doc(studentA(), 'classRewardCatalogs/cr-class-a')));
  await assertFails(getDoc(doc(studentA(), 'classRewardCatalogs/cr-class-b')));
  await assertSucceeds(getDoc(doc(studentB(), 'classRewardCatalogs/cr-class-b')));
  await assertFails(getDoc(doc(studentB(), 'classRewardCatalogs/cr-class-a')));
});

test('a class with no catalog yet: its own student and teacher may look (an empty list), nobody else', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'classes/cr-class-empty'), { teacherOfRecord: TEACHER_A, status: 'active' });
    await setDoc(doc(context.firestore(), 'grades/CR_STUDENT_C'), { classId: 'cr-class-empty', assignedTeacherEmail: TEACHER_A });
  });
  const studentC = env.authenticatedContext('uid-sc', { role: 'student', studentId: 'CR_STUDENT_C' }).firestore();
  await assertSucceeds(getDoc(doc(studentC, 'classRewardCatalogs/cr-class-empty')));
  await assertSucceeds(getDoc(doc(teacherA(), 'classRewardCatalogs/cr-class-empty')));
  await assertFails(getDoc(doc(studentA(), 'classRewardCatalogs/cr-class-empty')));
  await assertFails(getDoc(doc(teacherB(), 'classRewardCatalogs/cr-class-empty')));
});

test('the teacher of record reads their class\'s catalog; another teacher cannot', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'classRewardCatalogs/cr-class-a')));
  await assertFails(getDoc(doc(teacherB(), 'classRewardCatalogs/cr-class-a')));
});

test('nobody signed out, or without a role, reads a catalog; nobody lists every catalog but the administrator', async () => {
  await assertFails(getDoc(doc(stranger(), 'classRewardCatalogs/cr-class-a')));
  await assertFails(getDoc(doc(roleless(), 'classRewardCatalogs/cr-class-a')));
  await assertFails(getDocs(collection(studentA(), 'classRewardCatalogs')));
  await assertFails(getDocs(collection(teacherA(), 'classRewardCatalogs')));
  await assertSucceeds(getDocs(collection(admin(), 'classRewardCatalogs')));
  await assertSucceeds(getDoc(doc(admin(), 'classRewardCatalogs/cr-class-b')));
});

// 3–5. Requests.

test('a student reads their own requests by id and by query, never a classmate\'s', async () => {
  await assertSucceeds(getDoc(doc(studentA(), 'classRewardRequests/crr_a')));
  await assertFails(getDoc(doc(studentA(), 'classRewardRequests/crr_a2')));
  await assertFails(getDoc(doc(studentA(), 'classRewardRequests/crr_b')));
  await assertSucceeds(getDocs(query(collection(studentA(), 'classRewardRequests'),
    where('studentId', '==', 'CR_STUDENT_A'), where('classId', '==', 'cr-class-a'))));
  // A query for the whole class is refused outright, not filtered.
  await assertFails(getDocs(query(collection(studentA(), 'classRewardRequests'), where('classId', '==', 'cr-class-a'))));
  await assertFails(getDocs(query(collection(classmate(), 'classRewardRequests'), where('studentId', '==', 'CR_STUDENT_A'))));
});

test('the class\'s teacher reads its requests, including the pending-requests query; another teacher cannot', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'classRewardRequests/crr_a')));
  await assertSucceeds(getDoc(doc(teacherA(), 'classRewardRequests/crr_a2')));
  await assertFails(getDoc(doc(teacherB(), 'classRewardRequests/crr_a')));
  await assertFails(getDoc(doc(teacherA(), 'classRewardRequests/crr_b')));
  // Exactly the query ClassRewardRequestsPanel runs.
  const pending = await assertSucceeds(getDocs(query(collection(teacherA(), 'classRewardRequests'),
    where('authorizedTeacherEmails', 'array-contains', TEACHER_A),
    where('classId', '==', 'cr-class-a'),
    where('status', '==', 'pending'))));
  if (pending.size !== 2) throw new Error(`expected 2 pending requests for teacher A, got ${pending.size}`);
  await assertFails(getDocs(query(collection(teacherB(), 'classRewardRequests'),
    where('authorizedTeacherEmails', 'array-contains', TEACHER_A),
    where('classId', '==', 'cr-class-a'))));
  await assertFails(getDocs(query(collection(teacherB(), 'classRewardRequests'), where('classId', '==', 'cr-class-a'))));
});

test('the class\'s current teacher reads a request written under the previous teacher', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'classRewardRequests/crr_old')));
  await assertFails(getDoc(doc(teacherB(), 'classRewardRequests/crr_old')));
});

test('the root administrator reads any request', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'classRewardRequests/crr_b')));
  await assertSucceeds(getDocs(collection(admin(), 'classRewardRequests')));
});

// 6. No client writes.

test('no client writes a catalog — not a student, the teacher of record, or the root administrator', async () => {
  const forged = { schemaVersion: 1, classId: 'cr-class-a', items: [{ ...ITEM, cost: 1, gradeEffect: 'homeworkFree' }], revision: 9 };
  await assertFails(setDoc(doc(studentA(), 'classRewardCatalogs/cr-class-a'), forged));
  await assertFails(setDoc(doc(teacherA(), 'classRewardCatalogs/cr-class-a'), forged));
  await assertFails(setDoc(doc(admin(), 'classRewardCatalogs/cr-class-a'), forged));
  await assertFails(setDoc(doc(teacherA(), 'classRewardCatalogs/cr-class-new'), forged));
  await assertFails(updateDoc(doc(teacherA(), 'classRewardCatalogs/cr-class-a'), { revision: 2 }));
  await assertFails(deleteDoc(doc(teacherA(), 'classRewardCatalogs/cr-class-a')));
  await assertFails(deleteDoc(doc(admin(), 'classRewardCatalogs/cr-class-a')));
});

test('no client creates, resolves, refunds or deletes a request', async () => {
  // A student cannot make a request without paying for it…
  await assertFails(setDoc(doc(studentA(), 'classRewardRequests/crr_forged'), request('crr_forged', 'CR_STUDENT_A', 'cr-class-a', TEACHER_A)));
  // …or mark their own fulfilled, or decline it to get a refund.
  await assertFails(updateDoc(doc(studentA(), 'classRewardRequests/crr_a'), { status: 'fulfilled' }));
  await assertFails(updateDoc(doc(studentA(), 'classRewardRequests/crr_a'), { status: 'declined', refundTransactionId: 'crf_a' }));
  // The teacher resolves only through the callable, which writes the refund
  // in the same commit.
  await assertFails(updateDoc(doc(teacherA(), 'classRewardRequests/crr_a'), { status: 'declined', declineReason: 'no' }));
  await assertFails(setDoc(doc(teacherA(), 'classRewardRequests/crr_forged'), request('crr_forged', 'CR_STUDENT_A', 'cr-class-a', TEACHER_A)));
  await assertFails(updateDoc(doc(admin(), 'classRewardRequests/crr_a'), { status: 'fulfilled' }));
  await assertFails(deleteDoc(doc(studentA(), 'classRewardRequests/crr_a')));
  await assertFails(deleteDoc(doc(teacherA(), 'classRewardRequests/crr_a')));
  await assertFails(deleteDoc(doc(admin(), 'classRewardRequests/crr_a')));
});
