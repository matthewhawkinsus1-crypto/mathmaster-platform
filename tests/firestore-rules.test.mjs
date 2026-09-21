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
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';

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

// Keep every assignment assertion below on its declared create/update path.
// `cleanup()` only closes this process's clients; it does not clear an emulator
// that was already running or populated by an earlier command.
await testEnv.clearFirestore();

// Seed data with rules bypassed.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'grades/S1042'), { classId: 'class-1', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_EMAIL });
  await setDoc(doc(db, 'grades/S2000'), { classId: 'class-2', classPeriod: 'Period 2', assignedTeacherEmail: OTHER_TEACHER_EMAIL });
  await setDoc(doc(db, 'grades/S1042/scratchpads/a__question_0'), { dataUrl: 'x', authorizedTeacherEmails: [TEACHER_EMAIL] });
  await setDoc(doc(db, 'grades/S1042/scratchpads/a__question_delete'), { dataUrl: 'delete-me', authorizedTeacherEmails: [TEACHER_EMAIL] });
  await setDoc(doc(db, 'assignments/A1'), { title: 'Unit 1' });
  await setDoc(doc(db, 'classes/class-1'), { teacherOfRecord: TEACHER_EMAIL, period: 'Period 1' });
  await setDoc(doc(db, 'classes/class-2'), { teacherOfRecord: OTHER_TEACHER_EMAIL, period: 'Period 2' });
  await setDoc(doc(db, 'studentResponseCheckpoints/other-checkpoint'), { studentId: 'S2000', assignmentId: 'A1', questionIndex: 0, status: 'active' });
  await setDoc(doc(db, 'studentWorkspaceDrafts/S2000__A1'), { documentId: 'S2000__A1', schemaVersion: 1, studentId: 'S2000', assignmentId: 'A1', revision: 1, secure: false, entries: [] });
  await setDoc(doc(db, 'settings/classSchedule'), { periods: {} });
  await setDoc(doc(db, 'settings/gradingPeriods'), {
    periods: [{ id: '2026-mp1', label: 'Marking Period 1', order: 1, archived: false }],
    currentPeriodId: '2026-mp1',
  });
  await setDoc(doc(db, 'studentCredentials/S1042'), { hash: 'secret' });
  await setDoc(doc(db, 'classJoinCodes/K7M4QP'), { classPeriod: 'Period 1' });
  await setDoc(doc(db, 'teacherDirectory/t@school.org'), { active: true });
  await setDoc(doc(db, 'adminAuditLog/audit-1'), { action: 'teacher_access_granted' });
  await setDoc(doc(db, 'assignmentVersionEvents/version-event-1'), { eventType: 'liveUpgrade', familyId: 'fam-1' });
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
  await setDoc(doc(db, 'studentSupportEvents/support-1'), {
    schemaVersion: 1,
    kind: 'watchPractice',
    stage: 'actionTaken',
    studentId: 'S1042',
    classId: 'class-1',
    createdByEmail: TEACHER_EMAIL,
    authorizedTeacherEmails: [TEACHER_EMAIL],
    createdAt: '2026-09-01T12:00:00.000Z',
  });
  await setDoc(doc(db, 'studentSessionSummaries/session-1'), {
    schemaVersion: 1,
    studentId: 'S1042',
    classId: 'class-1',
    assignmentId: 'A1',
    startedAt: 1,
    endedAt: 2,
    authorizedTeacherEmails: [TEACHER_EMAIL],
  });
  await setDoc(doc(db, 'presence/S1042'), { studentId: 'S1042', classId: 'class-1', assignmentId: 'A1' });
  await setDoc(doc(db, 'presence/S2000'), { studentId: 'S2000', classId: 'class-2', assignmentId: 'A2' });
  await setDoc(doc(db, 'liveChallengeRooms/room-diagnostics'), { teacherEmail: TEACHER_EMAIL, status: 'running' });
  await setDoc(doc(db, 'liveChallengeRooms/room-diagnostics/diagnostics/player-1'), { connectionStatus: 'synchronized' });
  await setDoc(doc(db, 'liveChallengeInvites/S1042'), { roomId: 'room-diagnostics', playerKey: 'player-1' });
  await setDoc(doc(db, 'assignmentAuthoringDrafts/draft-mine'), {
    title: 'Unit 3 draft',
    authoringReview: { ownerUid: 'teacher-uid', state: 'incomplete', blockingCount: 2 },
  });
  await setDoc(doc(db, 'assignmentAuthoringDrafts/draft-theirs'), {
    title: 'Someone else draft',
    authoringReview: { ownerUid: 'other-teacher-uid', state: 'incomplete', blockingCount: 1 },
  });
  await setDoc(doc(db, 'assignmentQuestionReviews/teacher-uid__A1'), {
    ownerUid: 'teacher-uid',
    assignmentId: 'A1',
    teacherReviewContext: { flags: [{ id: 'f1', scope: 'question', targetId: 'q-1', note: 'Private note about a student.' }] },
  });
  await setDoc(doc(db, 'assignmentQuestionReviews/other-teacher-uid__A1'), {
    ownerUid: 'other-teacher-uid',
    assignmentId: 'A1',
    teacherReviewContext: { flags: [{ id: 'f2', scope: 'question', targetId: 'q-1', note: 'Another teacher private note.' }] },
  });
  await setDoc(doc(db, 'assignmentReviewScreenshots/shot-mine'), {
    ownerUid: 'teacher-uid', assignmentId: 'A1', questionId: 'q-1', flagId: 'f1',
    mediaType: 'image/png', byteSize: 128, dataUrl: 'data:image/png;base64,AAAA',
  });
  await setDoc(doc(db, 'assignmentReviewScreenshots/shot-theirs'), {
    ownerUid: 'other-teacher-uid', assignmentId: 'A1', questionId: 'q-1', flagId: 'f2',
    mediaType: 'image/png', byteSize: 128, dataUrl: 'data:image/png;base64,BBBB',
  });
});

const teacher = testEnv.authenticatedContext('teacher-uid', { role: 'teacher', email: TEACHER_EMAIL }).firestore();
const rootAdmin = testEnv.authenticatedContext('root-admin-uid', { role: 'teacher', admin: true, rootAdmin: true, email: 'root@school.org' }).firestore();
const otherTeacher = testEnv.authenticatedContext('other-teacher-uid', { role: 'teacher', email: OTHER_TEACHER_EMAIL }).firestore();
const student = testEnv.authenticatedContext('student:S1042', { role: 'student', studentId: 'S1042' }).firestore();
// Someone who signed in with Google but has no role claim yet.
const roleless = testEnv.authenticatedContext('random-uid', {}).firestore();
const anon = testEnv.unauthenticatedContext().firestore();

// --- Walkthrough sessions are private teacher control state ----------------
await check('teacher can check a not-yet-created walkthrough session', assertSucceeds(getDoc(doc(teacher, 'walkthroughSessions/teacher-uid__class-1__missing'))));
const walkthroughPath = 'walkthroughSessions/teacher-uid__class-1__A1';
const walkthrough = { sessionId: 'teacher-uid__class-1__A1', ownerUid: 'teacher-uid', teacherEmail: TEACHER_EMAIL, classId: 'class-1', assignmentId: 'A1', active: true, storageQuestionIndex: 0, timer: { status: 'idle' } };
await check('owning teacher creates and reads walkthrough session', (async () => { await assertSucceeds(setDoc(doc(teacher, walkthroughPath), walkthrough)); await assertSucceeds(getDoc(doc(teacher, walkthroughPath))); })());
await check('student CANNOT read walkthrough session', assertFails(getDoc(doc(student, walkthroughPath))));
await check('unrelated teacher CANNOT read walkthrough session', assertFails(getDoc(doc(otherTeacher, walkthroughPath))));
await check('walkthrough session CANNOT contain student answers', assertFails(setDoc(doc(teacher, walkthroughPath), { ...walkthrough, answers: { S1042: 'private' } })));

// --- Live Challenge diagnostics are teacher-only server state --------------
const diagnosticPath = 'liveChallengeRooms/room-diagnostics/diagnostics/player-1';
await check('owning teacher reads Live Challenge diagnostics', assertSucceeds(getDoc(doc(teacher, diagnosticPath))));
await check('root admin reads Live Challenge diagnostics', assertSucceeds(getDoc(doc(rootAdmin, diagnosticPath))));
await check('student CANNOT read own Live Challenge diagnostics', assertFails(getDoc(doc(student, diagnosticPath))));
await check('unrelated teacher CANNOT read Live Challenge diagnostics', assertFails(getDoc(doc(otherTeacher, diagnosticPath))));
await check('teacher client CANNOT create Live Challenge diagnostics', assertFails(setDoc(doc(teacher, 'liveChallengeRooms/room-diagnostics/diagnostics/new-player'), { connectionStatus: 'delayed' })));
await check('teacher client CANNOT update Live Challenge diagnostics', assertFails(setDoc(doc(teacher, diagnosticPath), { connectionStatus: 'degraded' }, { merge: true })));
await check('teacher client CANNOT delete Live Challenge diagnostics', assertFails(deleteDoc(doc(teacher, diagnosticPath))));
await check('student client CANNOT write Live Challenge diagnostics', assertFails(setDoc(doc(student, diagnosticPath), { connectionStatus: 'synchronized' }, { merge: true })));

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
await check('teacher CAN delete an authorized scratchpad', assertSucceeds(deleteDoc(doc(teacher, 'grades/S1042/scratchpads/a__question_delete'))));
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
// Marking-period metadata is student-safe by construction — ids, labels, order
// and whether a period is closed — and the Grade Center cannot group grades
// without reading it. Writing it is a teacher decision.
await check('student reads marking periods', assertSucceeds(getDoc(doc(student, 'settings/gradingPeriods'))));
await check('student CANNOT write marking periods', assertFails(setDoc(doc(student, 'settings/gradingPeriods'), { currentPeriodId: 'hax' }, { merge: true })));

await check('student CANNOT read assignment version events', assertFails(getDoc(doc(student, 'assignmentVersionEvents/version-event-1'))));
await check('teacher CANNOT read assignment version events directly', assertFails(getDoc(doc(teacher, 'assignmentVersionEvents/version-event-1'))));
await check('teacher CANNOT write assignment version events directly', assertFails(setDoc(doc(teacher, 'assignmentVersionEvents/version-event-2'), { eventType: 'liveUpgrade' })));
await check('root admin CANNOT bypass callable to write assignment version events', assertFails(setDoc(doc(rootAdmin, 'assignmentVersionEvents/version-event-3'), { eventType: 'releaseCreated' })));

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

// --- Grade Transfer snapshots ---------------------------------------------
const transferSnapshot = {
  transferId: 'transfer-1', teacherUid: 'teacher-uid', teacherEmail: TEACHER_EMAIL,
  classId: 'class-1', assignmentId: 'A1', assignmentTitle: 'Unit 1',
  exportKind: 'initial', createdAt: serverTimestamp(),
  rows: [{ studentId: 'S1042', sisStudentId: 'S1042', grade: 92, gradeVersion: 'v1' }],
  withheld: [], fileName: 'P1_Unit1.csv', packageId: 'package-1', schemaVersion: 1,
};
await check('teacher creates own class transfer snapshot', assertSucceeds(setDoc(doc(teacher, 'gradeTransferSnapshots/transfer-1'), transferSnapshot)));
await check('teacher CANNOT forge transfer creation time', assertFails(setDoc(doc(teacher, 'gradeTransferSnapshots/forged-time'), {
  ...transferSnapshot, transferId: 'forged-time', createdAt: '2020-01-01T00:00:00.000Z',
})));
await check('teacher reads own class transfer snapshot', assertSucceeds(getDoc(doc(teacher, 'gradeTransferSnapshots/transfer-1'))));
await check('student CANNOT read transfer snapshot', assertFails(getDoc(doc(student, 'gradeTransferSnapshots/transfer-1'))));
await check('student CANNOT create transfer snapshot', assertFails(setDoc(doc(student, 'gradeTransferSnapshots/student-forged'), { ...transferSnapshot, transferId: 'student-forged', teacherUid: 'student:S1042' })));
await check('unrelated teacher CANNOT read transfer snapshot', assertFails(getDoc(doc(otherTeacher, 'gradeTransferSnapshots/transfer-1'))));
await check('teacher CANNOT rewrite immutable transfer rows', assertFails(setDoc(doc(teacher, 'gradeTransferSnapshots/transfer-1'), { rows: [{ studentId: 'S1042', sisStudentId: 'S1042', grade: 100 }] }, { merge: true })));
await check('teacher confirms upload without rewriting snapshot', assertSucceeds(setDoc(doc(teacher, 'gradeTransferSnapshots/transfer-1'), {
  uploadConfirmedAt: serverTimestamp(), uploadConfirmedByUid: 'teacher-uid', uploadConfirmedByEmail: TEACHER_EMAIL,
}, { merge: true })));
await check('teacher CANNOT replace immutable upload confirmation evidence', assertFails(setDoc(doc(teacher, 'gradeTransferSnapshots/transfer-1'), {
  uploadConfirmedAt: serverTimestamp(), uploadConfirmedByUid: 'teacher-uid', uploadConfirmedByEmail: TEACHER_EMAIL,
}, { merge: true })));
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'classes/class-1'), { teacherOfRecord: OTHER_TEACHER_EMAIL, period: 'Period 1' });
});
await check('former teacher CANNOT read transfer evidence after class reassignment', assertFails(getDoc(doc(teacher, 'gradeTransferSnapshots/transfer-1'))));
await check('new teacher CANNOT inherit former teacher transfer evidence', assertFails(getDoc(doc(otherTeacher, 'gradeTransferSnapshots/transfer-1'))));
await check('root admin retains read-only transfer evidence visibility', assertSucceeds(getDoc(doc(rootAdmin, 'gradeTransferSnapshots/transfer-1'))));
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'classes/class-1'), { teacherOfRecord: TEACHER_EMAIL, period: 'Period 1' });
});
await check('teacher reads authorized scratchpad', assertSucceeds(getDoc(doc(teacher, 'grades/S1042/scratchpads/a__question_0'))));
await check('teacher writes assignments', assertSucceeds(setDoc(doc(teacher, 'assignments/A2'), { title: 'Unit 2' })));
await check('teacher writes settings', assertSucceeds(setDoc(doc(teacher, 'settings/assignmentFolders'), { paths: [] })));
await check('teacher writes marking periods', assertSucceeds(setDoc(doc(teacher, 'settings/gradingPeriods'), {
  periods: [{ id: '2026-mp2', label: 'Marking Period 2', order: 2, archived: false }],
  currentPeriodId: '2026-mp2',
})));
await check('teacher stamps an assignment with its marking period', assertSucceeds(setDoc(
  doc(teacher, 'assignments/A1'),
  { gradingPeriod: { id: '2026-mp2', label: 'Marking Period 2', order: 2 } },
  { merge: true },
)));
await check('student CANNOT move an assignment between marking periods', assertFails(setDoc(
  doc(student, 'assignments/A1'),
  { gradingPeriod: { id: '2026-mp1', label: 'Marking Period 1', order: 1 } },
  { merge: true },
)));
// A per-student attendance-extension final cutoff is written only by the
// applyStudentAttendanceExtension Cloud Function (Admin SDK), never by a
// direct client update — see firestore.rules' own comment on this field.
await check('teacher CANNOT write studentOverrides directly, even on their own assignment', assertFails(setDoc(
  doc(teacher, 'assignments/A1'),
  { studentOverrides: { S1042: { lateDueAt: '2026-10-02T23:59:59.000Z' } } },
  { merge: true },
)));
await check('teacher CANNOT seed studentOverrides while creating an assignment', assertFails(setDoc(
  doc(teacher, 'assignments/A-with-forged-overrides'),
  {
    title: 'Forged extension at creation',
    studentOverrides: { S1042: { lateDueAt: '2026-10-02T23:59:59.000Z' } },
  },
)));
await check('root admin CANNOT bypass the callable and write studentOverrides directly either', assertFails(setDoc(
  doc(rootAdmin, 'assignments/A1'),
  { studentOverrides: { S1042: { lateDueAt: '2026-10-02T23:59:59.000Z' } } },
  { merge: true },
)));
await check('teacher can still create an assignment without studentOverrides', assertSucceeds(setDoc(
  doc(teacher, 'assignments/A-without-overrides'),
  { title: 'Ordinary assignment' },
)));
await check('teacher can still update an assignment normally when studentOverrides is untouched', assertSucceeds(setDoc(
  doc(teacher, 'assignments/A1'),
  { title: 'Unit 1, revised' },
  { merge: true },
)));
await check('teacher deletes assignments', assertSucceeds(deleteDoc(doc(teacher, 'assignments/A2'))));
await check('teacher reads live presence only for own roster', assertSucceeds(getDoc(doc(teacher, 'presence/S1042'))));
await check('teacher CANNOT read another teacher live presence', assertFails(getDoc(doc(teacher, 'presence/S2000'))));
await check('teacher CANNOT forge student live presence', assertFails(setDoc(doc(teacher, 'presence/S1042'), { assignmentId: 'forged' }, { merge: true })));
await check('teacher reads authorized student support history', assertSucceeds(getDoc(doc(teacher, 'studentSupportEvents/support-1'))));
await check('student CANNOT read teacher support history', assertFails(getDoc(doc(student, 'studentSupportEvents/support-1'))));
await check('teacher appends own student support record', assertSucceeds(setDoc(doc(teacher, 'studentSupportEvents/support-2'), {
  schemaVersion: 1,
  kind: 'teacherIntervention',
  stage: 'actionTaken',
  studentId: 'S1042',
  classId: 'class-1',
  createdByEmail: TEACHER_EMAIL,
  authorizedTeacherEmails: [TEACHER_EMAIL],
})));
await check('teacher CANNOT grant another teacher support-history access', assertFails(setDoc(doc(teacher, 'studentSupportEvents/support-shared'), {
  schemaVersion: 1,
  kind: 'watchPractice',
  stage: 'actionTaken',
  studentId: 'S1042',
  classId: 'class-1',
  createdByEmail: TEACHER_EMAIL,
  authorizedTeacherEmails: [TEACHER_EMAIL, OTHER_TEACHER_EMAIL],
})));
await check('teacher CANNOT append support history for another teacher roster', assertFails(setDoc(doc(teacher, 'studentSupportEvents/support-other-roster'), {
  schemaVersion: 1,
  kind: 'watchPractice',
  stage: 'actionTaken',
  studentId: 'S2000',
  classId: 'class-2',
  createdByEmail: TEACHER_EMAIL,
  authorizedTeacherEmails: [TEACHER_EMAIL],
})));
await check('teacher CANNOT edit existing student support history', assertFails(setDoc(doc(teacher, 'studentSupportEvents/support-1'), { stage: 'resolved' }, { merge: true })));
await check('teacher reads authorized archived session summary', assertSucceeds(getDoc(doc(teacher, 'studentSessionSummaries/session-1'))));
await check('student CANNOT read archived session summary', assertFails(getDoc(doc(student, 'studentSessionSummaries/session-1'))));
await check('teacher CANNOT forge archived session summary', assertFails(setDoc(doc(teacher, 'studentSessionSummaries/forged'), { studentId: 'S1042', authorizedTeacherEmails: [TEACHER_EMAIL] })));

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

// --- Incomplete authoring drafts are private to the teacher who owns them ---
// These rules are new and were previously asserted only by a regex over the
// rules text, which cannot tell whether a student can actually read a draft or
// whether one teacher can take another's. Each claim the block makes is
// exercised here against the emulator.
const draftDoc = (db, id) => doc(db, `assignmentAuthoringDrafts/${id}`);
const ownedDraft = (ownerUid) => ({ title: 'x', authoringReview: { ownerUid, state: 'incomplete' } });

await check('teacher reads own authoring draft', assertSucceeds(getDoc(draftDoc(teacher, 'draft-mine'))));
await check('teacher creates own authoring draft', assertSucceeds(setDoc(draftDoc(teacher, 'draft-new'), ownedDraft('teacher-uid'))));
await check('teacher updates own authoring draft', assertSucceeds(setDoc(draftDoc(teacher, 'draft-mine'), { title: 'renamed' }, { merge: true })));
await check('teacher deletes own authoring draft', assertSucceeds(deleteDoc(draftDoc(teacher, 'draft-new'))));

await check('teacher CANNOT read another teacher draft', assertFails(getDoc(draftDoc(teacher, 'draft-theirs'))));
await check('teacher CANNOT update another teacher draft', assertFails(setDoc(draftDoc(teacher, 'draft-theirs'), { title: 'hax' }, { merge: true })));
await check('teacher CANNOT delete another teacher draft', assertFails(deleteDoc(draftDoc(teacher, 'draft-theirs'))));
await check('teacher CANNOT create a draft owned by someone else', assertFails(setDoc(draftDoc(teacher, 'draft-forged'), ownedDraft('other-teacher-uid'))));
await check('teacher CANNOT take over a draft by rewriting ownerUid', assertFails(setDoc(draftDoc(teacher, 'draft-mine'), ownedDraft('other-teacher-uid'))));
await check('other teacher reads their own draft', assertSucceeds(getDoc(draftDoc(otherTeacher, 'draft-theirs'))));
// The drafts panel lists with this exact owner filter; an unlistable query would
// break the feature at runtime while every single-document check still passed.
await check('teacher lists own authoring drafts by owner filter', assertSucceeds(getDocs(query(collection(teacher, 'assignmentAuthoringDrafts'), where('authoringReview.ownerUid', '==', 'teacher-uid')))));
await check('teacher CANNOT list another teacher drafts by owner filter', assertFails(getDocs(query(collection(teacher, 'assignmentAuthoringDrafts'), where('authoringReview.ownerUid', '==', 'other-teacher-uid')))));

await check('student CANNOT read an authoring draft', assertFails(getDoc(draftDoc(student, 'draft-mine'))));
await check('student CANNOT list authoring drafts', assertFails(getDocs(collection(student, 'assignmentAuthoringDrafts'))));
await check('student CANNOT write an authoring draft', assertFails(setDoc(draftDoc(student, 'draft-mine'), { title: 'hax' }, { merge: true })));
await check('roleless user CANNOT read an authoring draft', assertFails(getDoc(draftDoc(roleless, 'draft-mine'))));
await check('anonymous CANNOT read an authoring draft', assertFails(getDoc(draftDoc(anon, 'draft-mine'))));
await check('root admin reads any authoring draft', assertSucceeds(getDoc(draftDoc(rootAdmin, 'draft-theirs'))));

/*
 * Library review notes live in their own collection precisely because
 * /assignments is student-readable. That makes these rules the only thing
 * standing between one teacher's private notes — which can name a student and
 * describe what they got wrong — and every other signed-in account. The store
 * only ever reads its own document by id, so a green string match on the rules
 * file proves nothing about any of the paths below.
 */
const reviewDoc = (db, id) => doc(db, `assignmentQuestionReviews/${id}`);

await check('teacher reads own assignment review notes', assertSucceeds(getDoc(reviewDoc(teacher, 'teacher-uid__A1'))));
await check('teacher updates own assignment review notes', assertSucceeds(setDoc(reviewDoc(teacher, 'teacher-uid__A1'), { ownerUid: 'teacher-uid', assignmentId: 'A1', teacherReviewContext: { flags: [] } })));
await check('teacher creates own assignment review notes', assertSucceeds(setDoc(reviewDoc(teacher, 'teacher-uid__A2'), { ownerUid: 'teacher-uid', assignmentId: 'A2', teacherReviewContext: { flags: [] } })));
await check('teacher deletes own assignment review notes', assertSucceeds(deleteDoc(reviewDoc(teacher, 'teacher-uid__A2'))));

await check('teacher CANNOT read another teacher review notes', assertFails(getDoc(reviewDoc(teacher, 'other-teacher-uid__A1'))));
await check('teacher CANNOT overwrite another teacher review notes', assertFails(setDoc(reviewDoc(teacher, 'other-teacher-uid__A1'), { ownerUid: 'other-teacher-uid', assignmentId: 'A1', teacherReviewContext: { flags: [] } })));
await check('teacher CANNOT delete another teacher review notes', assertFails(deleteDoc(reviewDoc(teacher, 'other-teacher-uid__A1'))));
await check('teacher CANNOT create review notes owned by someone else', assertFails(setDoc(reviewDoc(teacher, 'forged'), { ownerUid: 'other-teacher-uid', assignmentId: 'A1', teacherReviewContext: { flags: [] } })));
await check('teacher CANNOT reassign ownership of own review notes', assertFails(setDoc(reviewDoc(teacher, 'teacher-uid__A1'), { ownerUid: 'other-teacher-uid', assignmentId: 'A1', teacherReviewContext: { flags: [] } })));
await check('teacher CANNOT repoint review notes at a different assignment', assertFails(setDoc(reviewDoc(teacher, 'teacher-uid__A1'), { ownerUid: 'teacher-uid', assignmentId: 'A9', teacherReviewContext: { flags: [] } })));
await check('teacher CANNOT create review notes with no assignment id', assertFails(setDoc(reviewDoc(teacher, 'teacher-uid__none'), { ownerUid: 'teacher-uid', teacherReviewContext: { flags: [] } })));

await check('other teacher reads their own review notes', assertSucceeds(getDoc(reviewDoc(otherTeacher, 'other-teacher-uid__A1'))));
await check('student CANNOT read teacher review notes', assertFails(getDoc(reviewDoc(student, 'teacher-uid__A1'))));
await check('student CANNOT list teacher review notes', assertFails(getDocs(collection(student, 'assignmentQuestionReviews'))));
await check('student CANNOT write teacher review notes', assertFails(setDoc(reviewDoc(student, 'teacher-uid__A1'), { ownerUid: 'student:S1042', assignmentId: 'A1' })));
await check('roleless user CANNOT read teacher review notes', assertFails(getDoc(reviewDoc(roleless, 'teacher-uid__A1'))));
await check('anonymous CANNOT read teacher review notes', assertFails(getDoc(reviewDoc(anon, 'teacher-uid__A1'))));
await check('root admin reads any teacher review notes', assertSucceeds(getDoc(reviewDoc(rootAdmin, 'teacher-uid__A1'))));

/*
 * RESPONSE CHECKPOINTS AND WORKING DRAFTS.
 *
 * Both are student-written. The checkpoint is later read by an Admin SDK
 * function that can write grades, which is what makes these cases matter: a
 * student must not be able to write a document whose SHAPE already contains a
 * result. The finalizer re-validates everything; these rules make the obvious
 * forgeries fail at the door.
 */
const checkpointDoc = (db, id) => doc(db, `studentResponseCheckpoints/${id}`);
const ownCheckpoint = {
  documentId: 'own-checkpoint', schemaVersion: 2, studentId: 'S1042', assignmentId: 'A1',
  questionIndex: 0, questionId: 'q1', variantIndex: 0, generationKey: 'A1|S1042|0|0',
  classId: 'class-a', activityRole: 'warmup', revision: 1, isComplete: true,
  previousTotalAttempts: 0, response: { kind: 'scalar', type: 'literal', value: '7', fields: [] },
  secure: false, status: 'active', serverAcknowledgedAt: serverTimestamp(),
  candidateFinalizeAt: new Date('2026-09-14T15:10:00Z'),
};
await check('student creates own ordinary checkpoint', assertSucceeds(setDoc(checkpointDoc(student, 'own-checkpoint'), ownCheckpoint)));
await check('student reads own checkpoint', assertSucceeds(getDoc(checkpointDoc(student, 'own-checkpoint'))));
await check('student CANNOT read another student checkpoint', assertFails(getDoc(checkpointDoc(student, 'other-checkpoint'))));
await check('student CANNOT write another student checkpoint', assertFails(setDoc(checkpointDoc(student, 'other-checkpoint'), { ...ownCheckpoint, documentId: 'other-checkpoint', studentId: 'S2000' })));
await check('student CANNOT create checkpoint for another student', assertFails(setDoc(checkpointDoc(student, 'forged-checkpoint'), { ...ownCheckpoint, documentId: 'forged-checkpoint', studentId: 'S2000' })));
await check('student CANNOT put secure exam work in ordinary checkpoints', assertFails(setDoc(checkpointDoc(student, 'secure-checkpoint'), { ...ownCheckpoint, documentId: 'secure-checkpoint', secure: true })));
await check('student CANNOT point a checkpoint at a different document id', assertFails(setDoc(checkpointDoc(student, 'mismatched-checkpoint'), { ...ownCheckpoint })));
await check('student CANNOT backdate the server acknowledgement', assertFails(setDoc(checkpointDoc(student, 'backdated-checkpoint'), { ...ownCheckpoint, documentId: 'backdated-checkpoint', serverAcknowledgedAt: new Date('2020-01-01T00:00:00Z') })));

// Nothing a grade is made of may enter the document a student can write.
await check('student CANNOT claim correctness in a checkpoint', assertFails(setDoc(checkpointDoc(student, 'graded-checkpoint'), { ...ownCheckpoint, documentId: 'graded-checkpoint', isCorrect: true })));
await check('student CANNOT claim a score in a checkpoint', assertFails(setDoc(checkpointDoc(student, 'scored-checkpoint'), { ...ownCheckpoint, documentId: 'scored-checkpoint', score: 100 })));
await check('student CANNOT smuggle a canonical record into a checkpoint', assertFails(setDoc(checkpointDoc(student, 'record-checkpoint'), { ...ownCheckpoint, documentId: 'record-checkpoint', record: { status: 'correct' } })));
await check('student CANNOT smuggle an evidence event into a checkpoint', assertFails(setDoc(checkpointDoc(student, 'evidence-checkpoint'), { ...ownCheckpoint, documentId: 'evidence-checkpoint', evidenceEvent: { eventKey: 'ev_1' } })));
await check('student CANNOT smuggle a submission envelope into a checkpoint', assertFails(setDoc(checkpointDoc(student, 'envelope-checkpoint'), { ...ownCheckpoint, documentId: 'envelope-checkpoint', submissionEnvelope: { record: {} } })));
await check('student CANNOT claim an attempt count in a checkpoint', assertFails(setDoc(checkpointDoc(student, 'attempts-checkpoint'), { ...ownCheckpoint, documentId: 'attempts-checkpoint', totalAttempts: 1 })));

// Identity is pinned across revisions; the revision itself must move forward.
await check('student writes a newer revision of their own checkpoint', assertSucceeds(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 2, isComplete: false })));
await check('student CANNOT move a checkpoint to another question', assertFails(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 3, questionIndex: 4 })));
await check('student CANNOT repoint a checkpoint at another question id', assertFails(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 3, questionId: 'q9' })));
await check('student CANNOT repoint a checkpoint at another assignment', assertFails(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 3, assignmentId: 'A9' })));
await check('student CANNOT change the activity role of a checkpoint', assertFails(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 3, activityRole: 'dol' })));
await check('student CANNOT change the variant of a checkpoint', assertFails(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 3, variantIndex: 2 })));
await check('student CANNOT roll a checkpoint revision backwards', assertFails(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 1 })));
await check('student retires their own checkpoint when they submit', assertSucceeds(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 4, status: 'explicitly-submitted', candidateFinalizeAt: null })));
await check('student CANNOT mark their own checkpoint auto-submitted', assertFails(setDoc(checkpointDoc(student, 'own-checkpoint'), { ...ownCheckpoint, revision: 5, status: 'auto-submitted', candidateFinalizeAt: null })));
await check('student CANNOT delete a checkpoint', assertFails(deleteDoc(checkpointDoc(student, 'own-checkpoint'))));

const workspaceDoc = (db, id) => doc(db, `studentWorkspaceDrafts/${id}`);
const ownWorkspace = {
  documentId: 'S1042__A1', schemaVersion: 1, studentId: 'S1042', assignmentId: 'A1',
  classId: 'class-a', secure: false, updatedAt: serverTimestamp(),
  entries: [{ key: 'mathmaster:draft:v2::S1042:A1:0:0:student:literal', valueJson: '"x = 3y"', savedAt: 1_700_000_000_000, questionIndex: 0, variantIndex: 0 }],
  resume: { questionIndex: 2, activityRole: 'classwork', variantIndex: 0, updatedAt: 1_700_000_000_000 },
  practice: null, practiceUpdatedAt: 0,
};
await check('student saves their own unfinished workspace', assertSucceeds(setDoc(workspaceDoc(student, 'S1042__A1'), ownWorkspace)));
await check('student restores their own unfinished workspace', assertSucceeds(getDoc(workspaceDoc(student, 'S1042__A1'))));
await check('student CANNOT read another student unfinished workspace', assertFails(getDoc(workspaceDoc(student, 'S2000__A1'))));
await check('student CANNOT write another student unfinished workspace', assertFails(setDoc(workspaceDoc(student, 'S2000__A1'), { ...ownWorkspace, documentId: 'S2000__A1', studentId: 'S2000' })));
await check('student CANNOT point a workspace draft at a different document id', assertFails(setDoc(workspaceDoc(student, 'S1042__A2'), ownWorkspace)));
await check('student CANNOT backdate a workspace draft', assertFails(setDoc(workspaceDoc(student, 'S1042__A1'), { ...ownWorkspace, updatedAt: new Date('2020-01-01T00:00:00Z') })));
await check('student CANNOT move a workspace draft to another assignment', assertFails(setDoc(workspaceDoc(student, 'S1042__A1'), { ...ownWorkspace, assignmentId: 'A9' })));
await check('student CANNOT store secure work as an ordinary workspace draft', assertFails(setDoc(workspaceDoc(student, 'S1042__A1'), { ...ownWorkspace, secure: true })));
await check('student CANNOT smuggle a grade into a workspace draft', assertFails(setDoc(workspaceDoc(student, 'S1042__A1'), { ...ownWorkspace, gradesByAssignment: { A1: { 0: { status: 'correct' } } } })));
await check('student CANNOT smuggle classwork completion into a workspace draft', assertFails(setDoc(workspaceDoc(student, 'S1042__A1'), { ...ownWorkspace, classworkGradesByAssignment: { A1: { score: 100 } } })));
await check('student CANNOT smuggle evidence into a workspace draft', assertFails(setDoc(workspaceDoc(student, 'S1042__A1'), { ...ownWorkspace, evidenceEvent: { eventKey: 'ev_1' } })));
// A fresh Chromebook has no history and must still be able to save.
await check('a fresh device with no prior revision can still save a workspace draft', assertSucceeds(setDoc(workspaceDoc(student, 'S1042__A1'), { ...ownWorkspace, entries: [] })));
await check('student CANNOT delete a workspace draft', assertFails(deleteDoc(workspaceDoc(student, 'S1042__A1'))));

/*
 * A review screenshot is a picture of a student-facing screen, captured by a
 * teacher, annotated with what is wrong. It is the most sensitive artefact in
 * this feature: it lives outside /assignments precisely so a student can never
 * read it, and outside the review context so it never bloats a note. These are
 * the rules that make the first half of that true.
 */
const shotDoc = (db, id) => doc(db, `assignmentReviewScreenshots/${id}`);

await check('teacher reads own review screenshot', assertSucceeds(getDoc(shotDoc(teacher, 'shot-mine'))));
await check('teacher creates own review screenshot', assertSucceeds(setDoc(shotDoc(teacher, 'shot-new'), { ownerUid: 'teacher-uid', assignmentId: 'A1', mediaType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' })));
await check('teacher replaces own review screenshot', assertSucceeds(setDoc(shotDoc(teacher, 'shot-mine'), { ownerUid: 'teacher-uid', assignmentId: 'A1', mediaType: 'image/png', dataUrl: 'data:image/png;base64,CCCC' })));
await check('teacher deletes own review screenshot', assertSucceeds(deleteDoc(shotDoc(teacher, 'shot-new'))));

await check('teacher CANNOT read another teacher screenshot', assertFails(getDoc(shotDoc(teacher, 'shot-theirs'))));
await check('teacher CANNOT delete another teacher screenshot', assertFails(deleteDoc(shotDoc(teacher, 'shot-theirs'))));
await check('teacher CANNOT overwrite another teacher screenshot', assertFails(setDoc(shotDoc(teacher, 'shot-theirs'), { ownerUid: 'other-teacher-uid', assignmentId: 'A1', dataUrl: 'data:image/png;base64,DDDD' })));
await check('teacher CANNOT create a screenshot owned by someone else', assertFails(setDoc(shotDoc(teacher, 'shot-forged'), { ownerUid: 'other-teacher-uid', assignmentId: 'A1', dataUrl: 'data:image/png;base64,AAAA' })));
await check('teacher CANNOT reassign ownership of own screenshot', assertFails(setDoc(shotDoc(teacher, 'shot-mine'), { ownerUid: 'other-teacher-uid', assignmentId: 'A1', dataUrl: 'data:image/png;base64,AAAA' })));
await check('teacher CANNOT repoint a screenshot at another assignment', assertFails(setDoc(shotDoc(teacher, 'shot-mine'), { ownerUid: 'teacher-uid', assignmentId: 'A9', dataUrl: 'data:image/png;base64,AAAA' })));
await check('teacher CANNOT create a screenshot with no assignment id', assertFails(setDoc(shotDoc(teacher, 'shot-orphan'), { ownerUid: 'teacher-uid', dataUrl: 'data:image/png;base64,AAAA' })));

await check('student CANNOT read a review screenshot', assertFails(getDoc(shotDoc(student, 'shot-mine'))));
await check('student CANNOT list review screenshots', assertFails(getDocs(collection(student, 'assignmentReviewScreenshots'))));
await check('student CANNOT write a review screenshot', assertFails(setDoc(shotDoc(student, 'shot-mine'), { ownerUid: 'student:S1042', assignmentId: 'A1' })));
await check('roleless user CANNOT read a review screenshot', assertFails(getDoc(shotDoc(roleless, 'shot-mine'))));
await check('anonymous CANNOT read a review screenshot', assertFails(getDoc(shotDoc(anon, 'shot-mine'))));
await check('root admin reads any review screenshot', assertSucceeds(getDoc(shotDoc(rootAdmin, 'shot-theirs'))));

await testEnv.cleanup();

const failures = results.filter(([status]) => status === 'FAIL');
results.forEach(([status, label]) => console.log(`${status}  ${label}`));
console.log(`\n${results.length - failures.length}/${results.length} passed`);
process.exit(failures.length ? 1 : 0);
