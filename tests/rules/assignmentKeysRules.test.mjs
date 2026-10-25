import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import {
  ASSIGNMENT_KEYS_COLLECTION, ASSIGNMENT_KEYS_SCHEMA_VERSION, SPLIT_VERSION, splitAssignment,
} from '../../functions/shared/assignmentKeySplit.mjs';

// D10 Phase 1, P1-3: `assignmentKeys/{assignmentId}`, the store an
// assignment's answer keys move to (docs/handoffs/ANSWER_KEY_SERVER_SIDE_DESIGN.md
// §3; SI02), through the real Security Rules in the Firestore emulator
// (`npm run test:rules`).
//
//   * A student reads no key document, by id, by list or by query, even the
//     student best placed to read the assignment itself: their own class's
//     lesson, already in their own grades, with both Phase 0 scope switches
//     on. That student CAN open the assignment (checked here), so what is
//     refused is the key store, not the student.
//   * A teacher and the root administrator read them (the design's O5
//     recommendation: any teacher).
//   * No browser writes one, the root administrator's included: only the
//     Admin SDK (the shadowAssignmentKeys trigger) does.
//   * Someone signed out, and an account with no role, read nothing.
//
// Synthetic identities only. Own projectId: rules suites run in parallel
// against one emulator. The emulator's address comes from the environment
// `firebase emulators:exec` sets, 8181 when run bare.

const PROJECT = 'mathmaster-assignment-keys-rules';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');
const ROOT_ADMIN = 'root.admin@example.test';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';

let env;

const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
// A student token that also claims the administrator's flags: the role decides.
const studentClaimingAdmin = () => env.authenticatedContext('uid-sx', { role: 'student', studentId: 'S_A', admin: true, rootAdmin: true }).firestore();
const roleless = () => env.authenticatedContext('uid-roleless', {}).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const everyone = () => [
  ['the root administrator', root()], ['a teacher', teacherA()], ['another teacher', teacherB()],
  ['a student', studentA()], ['a student claiming admin flags', studentClaimingAdmin()],
  ['an account with no role', roleless()], ['someone signed out', anonymous()],
];

// assertFails / assertSucceeds say only "expected ..."; say what and who.
const refused = async (what, request) => {
  try { await assertFails(request); } catch (error) { throw new Error(`${what} was not refused: ${error.message}`); }
};
const allowed = async (what, request) => {
  try { await assertSucceeds(request); } catch (error) { throw new Error(`${what} was refused: ${error.message}`); }
};

// The key document exactly as the trigger builds it, from a real split.
const sections = [{ id: 'dol', role: 'dol', title: 'Exit Ticket', questions: [
  { questionId: 'q1', type: 'multiAnswer', prompt: 'Slope?', answerFields: [{ id: 'f', label: 'Slope', answer: '2' }] },
] }];
const { keysByQuestionId } = splitAssignment(sections);
const KEYS = `${ASSIGNMENT_KEYS_COLLECTION}/a1`;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: HOST, port: Number(PORT) },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), {
      studentId: 'S_A', classId: 'class-a', assignedTeacherEmail: TEACHER_A, gradesByAssignment: { a1: { 0: { status: 'correct' } } },
    });
    await setDoc(doc(db, 'assignments/a1'), { title: 'Lesson 1', schemaVersion: 5, assignedClassIds: ['class-a'], sections });
    await setDoc(doc(db, 'platformFlags/assignmentReadScope'), { studentListScoped: true, studentGetScoped: true });
    await setDoc(doc(db, KEYS), {
      schemaVersion: ASSIGNMENT_KEYS_SCHEMA_VERSION, status: 'split', splitVersion: SPLIT_VERSION,
      sourceContentHash: 'hash-1', keysByQuestionId,
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('a student reads no answer key, by id, list or query, even for their own class\'s lesson in their own grades', async () => {
  // The same student opens the assignment itself: the refusal below is the key store's.
  await allowed('the student opening their own class\'s assignment', getDoc(doc(studentA(), 'assignments/a1')));
  for (const [who, db] of [['the student', studentA()], ['a student claiming admin flags', studentClaimingAdmin()]]) {
    await refused(`${who} reading the key document`, getDoc(doc(db, KEYS)));
    await refused(`${who} listing the key documents`, getDocs(collection(db, ASSIGNMENT_KEYS_COLLECTION)));
    await refused(`${who} querying the key documents`, getDocs(query(collection(db, ASSIGNMENT_KEYS_COLLECTION), where('sourceContentHash', '==', 'hash-1'))));
    await refused(`${who} reading a key document that does not exist`, getDoc(doc(db, `${ASSIGNMENT_KEYS_COLLECTION}/missing`)));
  }
});

test('a teacher and the root administrator read the answer keys; signed-out and role-less accounts do not', async () => {
  for (const [who, db] of [['a teacher', teacherA()], ['another teacher', teacherB()], ['the root administrator', root()]]) {
    await allowed(`${who} reading the key document`, getDoc(doc(db, KEYS)));
    await allowed(`${who} listing the key documents`, getDocs(collection(db, ASSIGNMENT_KEYS_COLLECTION)));
  }
  for (const [who, db] of [['an account with no role', roleless()], ['someone signed out', anonymous()]]) {
    await refused(`${who} reading the key document`, getDoc(doc(db, KEYS)));
    await refused(`${who} listing the key documents`, getDocs(collection(db, ASSIGNMENT_KEYS_COLLECTION)));
  }
});

test('no browser creates, edits or deletes an answer key, the root administrator included', async () => {
  for (const [who, db] of everyone()) {
    await refused(`${who} creating a key document`, setDoc(doc(db, `${ASSIGNMENT_KEYS_COLLECTION}/forged`), {
      schemaVersion: ASSIGNMENT_KEYS_SCHEMA_VERSION, status: 'split', keysByQuestionId: {},
    }));
    await refused(`${who} replacing a key document`, setDoc(doc(db, KEYS), { keysByQuestionId: {} }));
    await refused(`${who} editing a key document`, updateDoc(doc(db, KEYS), { sourceContentHash: 'forged' }));
    await refused(`${who} deleting a key document`, deleteDoc(doc(db, KEYS)));
  }
});
