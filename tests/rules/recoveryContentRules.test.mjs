import test, { after, before } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

// Recovery V2's `recoveryContent` on an assignment, through the real Security
// Rules in the Firestore emulator (`npm run test:rules`).
//
// The field names the certified families a static question's Recovery is
// generated from — and graded against. It may ride an assignment's creation
// (Pre-Flight's bindings), and after that it changes only through the audited
// commitRecoveryContentUpgrade callable (Admin SDK):
//
//   1. a teacher may create an assignment that carries recoveryContent;
//   2. no teacher browser — not the teacher of record — may change, replace
//      or drop it on an existing assignment, while ordinary edits still save;
//   3. no student may write it;
//   4. the root administrator keeps the repair path every server-owned
//      assignment field keeps.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against one emulator.

const PROJECT = 'mathmaster-recovery-content-rules';
const ROOT_ADMIN = 'matthew.hawkins@desotoisd.org';
const TEACHER = 'rc.teacher@example.org';
const STUDENT = 'RC_STUDENT';

let env;
const admin = () => env.authenticatedContext('uid-admin', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacher = () => env.authenticatedContext('uid-teacher', { role: 'teacher', email: TEACHER }).firestore();
const student = () => env.authenticatedContext('uid-student', { role: 'student', studentId: STUDENT }).firestore();

const CONTENT = Object.freeze({
  schemaVersion: 1,
  version: 1,
  bindings: {
    'l2-dol-1': {
      questionId: 'l2-dol-1',
      section: 'dol',
      questionFamily: { id: 'transformations.linearPlotImages', version: 1, constraints: { transformation: 'horizontalShift' } },
      sourceSignature: 'rs1:00000000000000000000000000000000',
      originalFingerprints: ['transformations.linearPlotImages:horizontalShift|h|-2'],
    },
  },
  history: [],
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
});

after(async () => {
  await env?.cleanup();
});

const seed = () => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, 'classes/rc-class'), { teacherOfRecord: TEACHER, status: 'active' });
  await setDoc(doc(db, `grades/${STUDENT}`), { classId: 'rc-class', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER });
  await setDoc(doc(db, 'assignments/rc-live'), {
    schemaVersion: 5,
    title: 'Algebra I — Vertical and Horizontal Transformations of Linear Functions',
    assignedClassIds: ['rc-class'],
    sections: [],
    recoveryContent: CONTENT,
  });
});

test('a teacher may create an assignment that carries its Pre-Flight recovery content', async () => {
  await seed();
  await assertSucceeds(setDoc(doc(teacher(), 'assignments/rc-new'), {
    schemaVersion: 5,
    title: 'A new lesson',
    assignedClassIds: ['rc-class'],
    sections: [],
    recoveryContent: CONTENT,
  }));
});

test('no teacher browser changes, replaces or drops recovery content on an existing assignment; ordinary edits still save', async () => {
  await seed();
  const ref = () => doc(teacher(), 'assignments/rc-live');
  await assertFails(updateDoc(ref(), { 'recoveryContent.version': 2 }), 'change a nested value');
  await assertFails(updateDoc(ref(), { recoveryContent: { ...CONTENT, bindings: {} } }), 'replace the bindings');
  await assertFails(updateDoc(ref(), { recoveryContent: null }), 'drop it');
  await assertSucceeds(updateDoc(ref(), { title: 'Algebra I — Transformations (renamed)' }), 'an unrelated edit still saves');
});

test('a student cannot write recovery content', async () => {
  await seed();
  await assertFails(updateDoc(doc(student(), 'assignments/rc-live'), { 'recoveryContent.version': 9 }));
});

test('the root administrator keeps the repair path', async () => {
  await seed();
  await assertSucceeds(updateDoc(doc(admin(), 'assignments/rc-live'), { 'recoveryContent.version': 2 }));
});
