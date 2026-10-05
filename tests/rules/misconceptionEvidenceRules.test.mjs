import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

// grades/{sid}/misconceptionEvidence — Recovery and Recovery Practice
// misconception evidence (functions/shared/misconceptionEvidenceSites.mjs),
// through the real Security Rules in the Firestore emulator.
//
// Written only by the advanceSectionRecovery callable and read only by the
// case review callable, both with the Admin SDK. Proven here: no student,
// teacher, root admin or anonymous browser can read it, create it, edit it or
// delete it — so a forged code can never become evidence, and a student never
// reads codes about their own work.
//
// Synthetic identities only. Own projectId: rules suites run in parallel.

const PROJECT = 'mathmaster-misconception-evidence-rules';
const TEACHER_A = 'teacher.a@example.test';
const ROOT = 'root.admin@example.test';
let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const PATH = 'grades/S_A/misconceptionEvidence/mev_seeded';
const RECORD = {
  schemaVersion: 1,
  eventKey: 'mev_seeded',
  studentId: 'S_A',
  occurredAt: 1,
  source: { kind: 'sectionRecovery', assignmentId: 'a1', section: 'dol', opportunity: 1, itemId: 'r1', storageIndex: 0 },
  performance: {
    misconceptionCodes: ['slope-run-over-rise'],
    misconceptionEvidence: {
      registryVersion: 1, source: 'server-grading', classifier: 'family:linear.slopeFromPoints@1', classifierVersion: 1,
      findings: [{ code: 'slope-run-over-rise', codeVersion: 1, parts: ['slope'] }],
    },
  },
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
  });
});

after(async () => {
  await env?.cleanup();
});

test('no browser reads Recovery misconception evidence — not the student, the teacher, the root admin or anyone signed out', async () => {
  for (const db of [studentA(), studentB(), teacherA(), admin(), anonymous()]) {
    await assertFails(getDoc(doc(db, PATH)));
    await assertFails(getDocs(collection(db, 'grades/S_A/misconceptionEvidence')));
  }
});

test('no browser can forge, edit or delete one', async () => {
  for (const db of [studentA(), teacherA(), admin()]) {
    await assertFails(setDoc(doc(db, 'grades/S_A/misconceptionEvidence/forged'), RECORD));
    await assertFails(updateDoc(doc(db, PATH), { 'performance.misconceptionCodes': ['domain-range-swapped'] }));
    await assertFails(deleteDoc(doc(db, PATH)));
  }
});
