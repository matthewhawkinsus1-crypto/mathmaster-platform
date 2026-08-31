/**
 * Behavioural tests for firestore.rules.
 *
 * Run with: npm run test:rules
 * (starts the Firestore emulator, so it needs Java and the firebase CLI)
 *
 * The rules are the last line of defence for student grade data, so every
 * guarantee the docs claim is asserted here rather than reasoned about. The
 * `student CANNOT delete own record` case in particular exists because an
 * earlier draft granted blanket `write` through the recursive subcollection
 * wildcard, which also matches the parent document.
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where } from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'mathmaster-rules-test',
  firestore: {
    host: '127.0.0.1',
    port: 8181,
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

const TEACHER_EMAIL = 't@school.org';
const OTHER_TEACHER_EMAIL = 'other@school.org';

const results = [];
const check = async (label, promise) => {
  try {
    await promise;
    results.push(['PASS', label]);
  } catch (error) {
    results.push(['FAIL', `${label} :: ${error.message}`]);
  }
};

// Seed data with rules bypassed.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'grades/S1042'), { classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_EMAIL });
  await setDoc(doc(db, 'grades/S2000'), { classPeriod: 'Period 2', assignedTeacherEmail: OTHER_TEACHER_EMAIL });
  await setDoc(doc(db, 'grades/S1042/scratchpads/a__question_0'), { dataUrl: 'x', authorizedTeacherEmails: [TEACHER_EMAIL] });
  await setDoc(doc(db, 'assignments/A1'), { title: 'Unit 1' });
  await setDoc(doc(db, 'settings/classSchedule'), { periods: {} });
  await setDoc(doc(db, 'studentCredentials/S1042'), { hash: 'secret' });
  await setDoc(doc(db, 'classJoinCodes/K7M4QP'), { classPeriod: 'Period 1' });
  await setDoc(doc(db, 'teacherDirectory/t@school.org'), { active: true });
  await setDoc(doc(db, 'adminAuditLog/audit-1'), { action: 'teacher_access_granted' });
  await setDoc(doc(db, 'authThrottle/student_S1042'), { failures: 1 });
  await setDoc(doc(db, 'studentDirectory/kid@school.org'), { studentId: 'S1042' });
  await setDoc(doc(db, 'grades/S1042/evidenceEvents/ev_existing'), { eventKey: 'ev_existing', studentId: 'S1042', occurredAt: 1, authorizedTeacherEmails: [TEACHER_EMAIL] });
  await setDoc(doc(db, 'studentMasteryProfiles/S1042'), { profiles: { 'A.5A': { mastery: { status: 'Secure' } } }, authorizedTeacherEmails: [TEACHER_EMAIL] });
  await setDoc(doc(db, 'studentRetentionSchedules/S1042'), { schedules: {}, authorizedTeacherEmails: [TEACHER_EMAIL] });
  await setDoc(doc(db, 'pathQuestionBank/P1'), { alignmentKeys: ['texas:A.5A'], grading: { secret: true } });
  await setDoc(doc(db, 'pathSessions/session-1'), { studentId: 'S1042', status: 'active' });
  await setDoc(doc(db, 'modelingLabDefinitions/L1'), { labId: 'L1', evaluation: { targetValue: 9 } });
  await setDoc(doc(db, 'modelingLabSubmissions/LS1'), { studentId: 'S1042' });
  await setDoc(doc(db, 'examQuestionBank/E1'), { examTypes: ['digitalSAT'], responseFields: [{ id: 'x', expected: 4 }] });
  await setDoc(doc(db, 'examSessions/exam-1'), { studentId: 'S1042', status: 'in_progress' });
  await setDoc(doc(db, 'examSubmissions/examsub-1'), { studentId: 'S1042' });
  await setDoc(doc(db, 'examIntegrityEvents/integrity-1'), { studentId: 'S1042', type: 'tab_switch' });
});

const teacher = testEnv.authenticatedContext('teacher-uid', { role: 'teacher', email: TEACHER_EMAIL }).firestore();
const rootAdmin = testEnv.authenticatedContext('root-admin-uid', { role: 'teacher', admin: true, rootAdmin: true, email: 'root@school.org' }).firestore();
const student = testEnv.authenticatedContext('student:S1042', { role: 'student', studentId: 'S1042' }).firestore();
// Someone who signed in with Google but has no role claim yet.
const roleless = testEnv.authenticatedContext('random-uid', {}).firestore();
const anon = testEnv.unauthenticatedContext().firestore();

// --- Student owns exactly their own record --------------------------------
await check('student reads own grades', assertSucceeds(getDoc(doc(student, 'grades/S1042'))));
await check('student writes own grades', assertSucceeds(setDoc(doc(student, 'grades/S1042'), { classPeriod: 'Period 1' }, { merge: true })));
await check('student reads own scratchpad', assertSucceeds(getDoc(doc(student, 'grades/S1042/scratchpads/a__question_0'))));
await check('student writes own scratchpad', assertSucceeds(setDoc(doc(student, 'grades/S1042/scratchpads/a__question_1'), { dataUrl: 'y' })));
await check('student CANNOT read another student', assertFails(getDoc(doc(student, 'grades/S2000'))));
await check('student CANNOT write another student', assertFails(setDoc(doc(student, 'grades/S2000'), { classPeriod: 'hax' }, { merge: true })));
await check('student CANNOT read another scratchpad', assertFails(getDoc(doc(student, 'grades/S2000/scratchpads/a__question_0'))));
await check('student CANNOT list the roster', assertFails(getDocs(collection(student, 'grades'))));
await check('student CANNOT delete own record', assertFails(deleteDoc(doc(student, 'grades/S1042'))));
await check('student CANNOT delete own scratchpad', assertFails(deleteDoc(doc(student, 'grades/S1042/scratchpads/a__question_0'))));
await check('teacher CAN delete a scratchpad', assertSucceeds(deleteDoc(doc(teacher, 'grades/S1042/scratchpads/a__question_0'))));
await check('student reads own Phase 5C evidence', assertSucceeds(getDoc(doc(student, 'grades/S1042/evidenceEvents/ev_existing'))));
await check('student appends own Phase 5C evidence', assertSucceeds(setDoc(doc(student, 'grades/S1042/evidenceEvents/ev_new'), { eventKey: 'ev_new', studentId: 'S1042', occurredAt: 2, authorizedTeacherEmails: [TEACHER_EMAIL] })));
await check('student CANNOT mutate existing Phase 5C evidence', assertFails(setDoc(doc(student, 'grades/S1042/evidenceEvents/ev_existing'), { eventKey: 'ev_existing', studentId: 'S1042', occurredAt: 999 }, { merge: true })));
await check('student CANNOT forge another studentId into evidence', assertFails(setDoc(doc(student, 'grades/S1042/evidenceEvents/ev_forged'), { eventKey: 'ev_forged', studentId: 'S2000', occurredAt: 3 })));
await check('student CANNOT delete Phase 5C evidence', assertFails(deleteDoc(doc(student, 'grades/S1042/evidenceEvents/ev_existing'))));

// --- Shared classroom content ---------------------------------------------
await check('student reads assignments', assertSucceeds(getDoc(doc(student, 'assignments/A1'))));
await check('student lists assignments', assertSucceeds(getDocs(collection(student, 'assignments'))));
await check('student CANNOT write assignments', assertFails(setDoc(doc(student, 'assignments/A1'), { title: 'hax' }, { merge: true })));
await check('student reads class schedule', assertSucceeds(getDoc(doc(student, 'settings/classSchedule'))));
await check('student CANNOT write settings', assertFails(setDoc(doc(student, 'settings/classSchedule'), { periods: {} }, { merge: true })));

// --- Teacher ---------------------------------------------------------------
await check('teacher CANNOT run an unconstrained roster query', assertFails(getDocs(collection(teacher, 'grades'))));
await check('teacher lists only their assigned roster', assertSucceeds(getDocs(query(
  collection(teacher, 'grades'),
  where('assignedTeacherEmail', '==', TEACHER_EMAIL),
))));
await check('teacher reads assigned student', assertSucceeds(getDoc(doc(teacher, 'grades/S1042'))));
await check('teacher CANNOT read another teacher student', assertFails(getDoc(doc(teacher, 'grades/S2000'))));
await check('teacher updates assigned student', assertSucceeds(setDoc(doc(teacher, 'grades/S1042'), { classPeriod: 'Period 1' }, { merge: true })));
await check('teacher CANNOT update another teacher student', assertFails(setDoc(doc(teacher, 'grades/S2000'), { classPeriod: 'Period 3' }, { merge: true })));
await check('teacher CANNOT directly delete a student record', assertFails(deleteDoc(doc(teacher, 'grades/S2000'))));
await check('root admin CANNOT bypass audited callable with direct student deletion', assertFails(deleteDoc(doc(rootAdmin, 'grades/S2000'))));
await check('teacher reads authorized scratchpad', assertSucceeds(getDoc(doc(teacher, 'grades/S1042/scratchpads/a__question_0'))));
await check('teacher writes assignments', assertSucceeds(setDoc(doc(teacher, 'assignments/A2'), { title: 'Unit 2' })));
await check('teacher writes settings', assertSucceeds(setDoc(doc(teacher, 'settings/assignmentFolders'), { paths: [] })));
await check('teacher deletes assignments', assertSucceeds(deleteDoc(doc(teacher, 'assignments/A2'))));

// --- Phase 5 derived state and secure production collections --------------
await check('student reads own mastery projection', assertSucceeds(getDoc(doc(student, 'studentMasteryProfiles/S1042'))));
await check('student reads own retention schedule', assertSucceeds(getDoc(doc(student, 'studentRetentionSchedules/S1042'))));
await check('student CANNOT write mastery projection', assertFails(setDoc(doc(student, 'studentMasteryProfiles/S1042'), { profiles: {} }, { merge: true })));
await check('student CANNOT write retention schedule', assertFails(setDoc(doc(student, 'studentRetentionSchedules/S1042'), { schedules: {} }, { merge: true })));
await check('teacher reads secure path question bank', assertSucceeds(getDoc(doc(teacher, 'pathQuestionBank/P1'))));
await check('student CANNOT read answer-bearing path question bank', assertFails(getDoc(doc(student, 'pathQuestionBank/P1'))));
await check('student CANNOT read server-owned path session', assertFails(getDoc(doc(student, 'pathSessions/session-1'))));
await check('teacher reads private modeling-lab definition', assertSucceeds(getDoc(doc(teacher, 'modelingLabDefinitions/L1'))));
await check('student CANNOT read private modeling-lab definition', assertFails(getDoc(doc(student, 'modelingLabDefinitions/L1'))));
await check('student CANNOT read modeling-lab submission marker', assertFails(getDoc(doc(student, 'modelingLabSubmissions/LS1'))));
await check('teacher reads secure exam question bank', assertSucceeds(getDoc(doc(teacher, 'examQuestionBank/E1'))));
await check('student CANNOT read secure exam question bank', assertFails(getDoc(doc(student, 'examQuestionBank/E1'))));
await check('student CANNOT read server-owned exam session', assertFails(getDoc(doc(student, 'examSessions/exam-1'))));
await check('teacher CANNOT bypass callable to read exam session', assertFails(getDoc(doc(teacher, 'examSessions/exam-1'))));
await check('student CANNOT read secure exam submission marker', assertFails(getDoc(doc(student, 'examSubmissions/examsub-1'))));
await check('student CANNOT read secure exam integrity log', assertFails(getDoc(doc(student, 'examIntegrityEvents/integrity-1'))));

// --- Signed in but roleless (the pre-link state) ---------------------------
await check('roleless CANNOT read a student record', assertFails(getDoc(doc(roleless, 'grades/S1042'))));
await check('roleless CANNOT write assignments', assertFails(setDoc(doc(roleless, 'assignments/A1'), { title: 'hax' }, { merge: true })));
await check('roleless CAN read assignments (signed in)', assertSucceeds(getDoc(doc(roleless, 'assignments/A1'))));

// --- Unauthenticated -------------------------------------------------------
await check('anon CANNOT read grades', assertFails(getDoc(doc(anon, 'grades/S1042'))));
await check('anon CANNOT read assignments', assertFails(getDoc(doc(anon, 'assignments/A1'))));
await check('anon CANNOT read settings', assertFails(getDoc(doc(anon, 'settings/classSchedule'))));
await check('anon CANNOT write grades', assertFails(setDoc(doc(anon, 'grades/S9999'), { classPeriod: 'x' })));

// --- Server-only collections are opaque to every client --------------------
for (const [name, path] of [
  ['studentCredentials', 'studentCredentials/S1042'],
  ['classJoinCodes', 'classJoinCodes/K7M4QP'],
  ['teacherDirectory', 'teacherDirectory/t@school.org'],
  ['adminAuditLog', 'adminAuditLog/audit-1'],
  ['authThrottle', 'authThrottle/student_S1042'],
  ['studentDirectory', 'studentDirectory/kid@school.org'],
]) {
  await check(`teacher CANNOT read ${name}`, assertFails(getDoc(doc(teacher, path))));
  await check(`root admin CANNOT bypass callable to read ${name}`, assertFails(getDoc(doc(rootAdmin, path))));
  await check(`student CANNOT read ${name}`, assertFails(getDoc(doc(student, path))));
  await check(`student CANNOT write ${name}`, assertFails(setDoc(doc(student, path), { hack: true }, { merge: true })));
}

await testEnv.cleanup();

const failures = results.filter(([status]) => status === 'FAIL');
results.forEach(([status, label]) => console.log(`${status}  ${label}`));
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length ? 1 : 0);
