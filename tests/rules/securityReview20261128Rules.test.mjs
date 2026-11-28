import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// The rules fixes from the 2026-11-28 security review
// (docs/audits/2026-11-28-security-review.md), through the real Security
// Rules in the Firestore emulator (`npm run test:rules`).
//
//   R1 settings/{docId}: a teacher writes only the shared documents the
//      teacher screens manage. A platform switch the server trusts
//      (settings/serverGrading) and any other document id are the root
//      administrator's alone.
//   R2 studentRetentionSchedules/{studentId}: written only by the server
//      (mathPathFunctions.js), never by a browser.
//   R3 pathHistory/{studentId}: a teacher reads or changes only the history of
//      a student on their own roster.
//
// Synthetic identities only. Own projectId: rules suites run in parallel
// against one emulator.

const PROJECT = 'mathmaster-security-review-20261128';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';

let env;

const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: 'root.admin@example.test' }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();

const refused = async (what, request) => {
  try { await assertFails(request); } catch (error) { throw new Error(`${what} was not refused: ${error.message}`); }
};
const allowed = async (what, request) => {
  try { await assertSucceeds(request); } catch (error) { throw new Error(`${what} was refused: ${error.message}`); }
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: HOST, port: Number(PORT) },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), { studentId: 'S_A', classId: 'class-a', assignedTeacherEmail: TEACHER_A });
    await setDoc(doc(db, 'settings/serverGrading'), { splitGradeRecords: false, requireStepWork: false });
    await setDoc(doc(db, 'settings/classSchedule'), { periods: {} });
    await setDoc(doc(db, 'studentRetentionSchedules/S_A'), {
      studentId: 'S_A', schedules: {}, authorizedTeacherEmails: [TEACHER_A],
    });
    await setDoc(doc(db, 'pathHistory/S_A'), { studentId: 'S_A', events: [{ at: 1 }] });
  });
});

after(async () => { await env?.cleanup(); });

test('R1: no teacher flips a server grading switch; the root administrator still can', async () => {
  for (const [who, db] of [['teacher A', teacherA()], ['teacher B', teacherB()]]) {
    await refused(`${who} updating settings/serverGrading`, updateDoc(doc(db, 'settings/serverGrading'), { splitGradeRecords: true }));
    await refused(`${who} replacing settings/serverGrading`, setDoc(doc(db, 'settings/serverGrading'), { requireStepWork: true }));
    await refused(`${who} deleting settings/serverGrading`, deleteDoc(doc(db, 'settings/serverGrading')));
    await refused(`${who} creating an unknown settings document`, setDoc(doc(db, 'settings/somethingNew'), { on: true }));
  }
  await refused('a student updating settings/serverGrading', updateDoc(doc(studentA(), 'settings/serverGrading'), { splitGradeRecords: true }));
  await allowed('a teacher reading settings/serverGrading', getDoc(doc(teacherA(), 'settings/serverGrading')));
  await allowed('the root administrator updating settings/serverGrading', updateDoc(doc(root(), 'settings/serverGrading'), { requireStepWork: false }));
});

test('R1: teachers still write the shared documents their screens manage', async () => {
  const db = teacherA();
  await allowed('settings/classSchedule', setDoc(doc(db, 'settings/classSchedule'), { periods: {} }, { merge: true }));
  await allowed('settings/courseProfiles', setDoc(doc(db, 'settings/courseProfiles'), { profiles: {} }));
  await allowed('settings/gradingPeriods', setDoc(doc(db, 'settings/gradingPeriods'), { periods: [] }, { merge: true }));
  await allowed('settings/assignmentFolders', setDoc(doc(db, 'settings/assignmentFolders'), { paths: [] }));
  await allowed('settings/classPacing', setDoc(doc(db, 'settings/classPacing'), { byClass: {} }));
  await allowed('settings/weeklyPathGoals', setDoc(doc(db, 'settings/weeklyPathGoals'), { byClass: {} }));
  await allowed('settings/skillOverrides', setDoc(doc(db, 'settings/skillOverrides'), { overrides: [] }));
});

test('R2: no browser writes a retention schedule, its own teacher included', async () => {
  await refused('the student\'s teacher rewriting the schedule',
    setDoc(doc(teacherA(), 'studentRetentionSchedules/S_A'), { schedules: { skill: { dueAt: 0 } } }, { merge: true }));
  await refused('the student\'s teacher widening its access list',
    updateDoc(doc(teacherA(), 'studentRetentionSchedules/S_A'), { authorizedTeacherEmails: [TEACHER_A, TEACHER_B] }));
  await refused('the student\'s teacher deleting it', deleteDoc(doc(teacherA(), 'studentRetentionSchedules/S_A')));
  await refused('the student writing it', setDoc(doc(studentA(), 'studentRetentionSchedules/S_A'), { schedules: {} }, { merge: true }));
  await allowed('the student\'s teacher reading it', getDoc(doc(teacherA(), 'studentRetentionSchedules/S_A')));
  await allowed('the student reading it', getDoc(doc(studentA(), 'studentRetentionSchedules/S_A')));
});

test('R3: a teacher reads or changes only their own student\'s path history', async () => {
  await refused('another teacher reading it', getDoc(doc(teacherB(), 'pathHistory/S_A')));
  await refused('another teacher clearing it', updateDoc(doc(teacherB(), 'pathHistory/S_A'), { events: [] }));
  await refused('another teacher deleting it', deleteDoc(doc(teacherB(), 'pathHistory/S_A')));
  await refused('another teacher creating one for a student not on their roster',
    setDoc(doc(teacherB(), 'pathHistory/S_NEW'), { studentId: 'S_NEW', events: [] }));
  await allowed('the student\'s teacher reading it', getDoc(doc(teacherA(), 'pathHistory/S_A')));
  await allowed('the student\'s teacher clearing it', updateDoc(doc(teacherA(), 'pathHistory/S_A'), { events: [] }));
  await allowed('the student reading their own', getDoc(doc(studentA(), 'pathHistory/S_A')));
  await allowed('the student logging their own route', setDoc(doc(studentA(), 'pathHistory/S_A'), { studentId: 'S_A', events: [{ at: 2 }] }, { merge: true }));
  await allowed('the root administrator reading it', getDoc(doc(root(), 'pathHistory/S_A')));
});
