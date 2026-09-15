import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// Authenticated requests, through the real Security Rules, in the Firestore
// emulator.
//
// Everything above this file is a unit test of a pure function. This is the
// only place that proves the rules themselves do what the model says — that a
// teacher who asks for another teacher's students is refused by the DATABASE,
// not merely filtered out by a screen that could be bypassed with a console
// open.
//
// Requires the emulator. `npm run test:rules` starts it; run directly and it
// will fail to connect, which is a real failure and not a skip.

const PROJECT = 'mathmaster-rules-test';
const ROOT_ADMIN = 'matthew.hawkins@desotoisd.org';
const TEACHER_A = 'teacher.a@desotoisd.org';
const TEACHER_B = 'teacher.b@desotoisd.org';
const TEACHER_LEGACY = 'teacher.legacy@desotoisd.org';

let env;

// Identities, as the server would mint them. `role` is a custom claim set by a
// callable after verifying who the caller is; nothing here is client-supplied.
const admin = () => env.authenticatedContext('uid-admin', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherA = () => env.authenticatedContext('uid-a', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-b', { role: 'teacher', email: TEACHER_B }).firestore();
const teacherLegacy = () => env.authenticatedContext('uid-legacy', { role: 'teacher', email: TEACHER_LEGACY }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'STUDENT_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'STUDENT_B' }).firestore();
const stranger = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });

  // The world the admin callables would have created: two classes, two
  // teachers of record, one student each.
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'classes/class-a'), { name: 'Algebra I — Period 1', course: 'algebra1', courseLevel: 'standard', period: 'Period 1', teacherOfRecord: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'classes/class-b'), { name: 'Algebra I — Period 2', course: 'algebra1', courseLevel: 'honors', period: 'Period 2', teacherOfRecord: TEACHER_B, status: 'active' });
    await setDoc(doc(db, 'grades/STUDENT_A'), { displayName: 'Student A', classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, 'grades/STUDENT_B'), { displayName: 'Student B', classId: 'class-b', classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_B, status: 'active', gradesByAssignment: {} });
    // A student nobody has placed. Belongs to no teacher by construction.
    await setDoc(doc(db, 'grades/STUDENT_UNPLACED'), { displayName: 'Unplaced', classId: null, classPeriod: 'Unassigned', assignedTeacherEmail: null, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, 'grades/STUDENT_LEGACY'), { displayName: 'Legacy Student', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_LEGACY, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, 'studentSupportEvents/support-a'), {
      schemaVersion: 1,
      kind: 'offTaskConcern',
      stage: 'teacherConfirmed',
      studentId: 'STUDENT_A',
      classId: 'class-a',
      createdByEmail: TEACHER_A,
      authorizedTeacherEmails: [TEACHER_A],
      createdAt: '2026-09-01T12:00:00.000Z',
    });
    await setDoc(doc(db, 'studentSessionSummaries/session-a'), {
      schemaVersion: 1,
      studentId: 'STUDENT_A',
      classId: 'class-a',
      assignmentId: 'A1',
      startedAt: 1,
      endedAt: 2,
      authorizedTeacherEmails: [TEACHER_A],
    });
    await setDoc(doc(db, 'presence/STUDENT_A'), { studentId: 'STUDENT_A', classId: 'class-a', assignmentId: 'A1' });
    await setDoc(doc(db, 'presence/STUDENT_B'), { studentId: 'STUDENT_B', classId: 'class-b', assignmentId: 'A2' });
    await setDoc(doc(db, 'studentPathInterventions/STUDENT_A'), {
      studentId: 'STUDENT_A',
      classId: 'class-a',
      skillId: 'teks:A.5A',
      teksCode: 'A.5A',
      action: 'recommend',
      expiresAt: Date.now() + 86400000,
    });
  });
});

after(async () => { await env?.cleanup(); });

// --- A teacher sees their own students, and only their own -----------------------

test('Teacher A reads Student A', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'grades/STUDENT_A')));
});

test('Teacher A cannot read Student B', async () => {
  // The whole point. Not filtered on screen — refused by the database.
  await assertFails(getDoc(doc(teacherA(), 'grades/STUDENT_B')));
});

test('Teacher B cannot read Student A', async () => {
  await assertFails(getDoc(doc(teacherB(), 'grades/STUDENT_A')));
});

test('an unconstrained roster query is refused for a teacher', async () => {
  // This is what the old client did, and what the rules must now stop.
  await assertFails(getDocs(collection(teacherA(), 'grades')));
});

test('the scoped roster query the app actually makes succeeds, and returns only my students', async () => {
  const snapshot = await assertSucceeds(getDocs(query(
    collection(teacherA(), 'grades'),
    where('assignedTeacherEmail', '==', TEACHER_A),
  )));
  assert.deepEqual(snapshot.docs.map((entry) => entry.id), ['STUDENT_A']);
});

test('a teacher cannot query for another teacher\'s students', async () => {
  await assertFails(getDocs(query(
    collection(teacherA(), 'grades'),
    where('assignedTeacherEmail', '==', TEACHER_B),
  )));
});

test('an unplaced student belongs to no teacher', async () => {
  await assertFails(getDoc(doc(teacherA(), 'grades/STUDENT_UNPLACED')));
  await assertFails(getDoc(doc(teacherB(), 'grades/STUDENT_UNPLACED')));
  // Which is exactly why the administrator must be able to find them.
  await assertSucceeds(getDoc(doc(admin(), 'grades/STUDENT_UNPLACED')));
});

test('the administrator reads the school', async () => {
  await assertSucceeds(getDocs(collection(admin(), 'grades')));
  await assertSucceeds(getDoc(doc(admin(), 'grades/STUDENT_B')));
});

// --- Reassignment must move authorization, not just the label ----------------------

test('moving a student to another class moves who can read them', async () => {
  // Teacher A can see them now.
  await assertSucceeds(getDoc(doc(teacherA(), 'grades/STUDENT_A')));

  // The move, exactly as `setStudentClass` writes it: membership AND the
  // denormalized teacher, in one operation. Writing only classId would leave
  // Teacher A reading a student they no longer teach.
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'grades/STUDENT_A'), {
      classId: 'class-b', classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_B,
    }, { merge: true });
  });

  await assertFails(getDoc(doc(teacherA(), 'grades/STUDENT_A')));
  await assertSucceeds(getDoc(doc(teacherB(), 'grades/STUDENT_A')));

  // And the scoped roster queries follow.
  const forA = await assertSucceeds(getDocs(query(collection(teacherA(), 'grades'), where('assignedTeacherEmail', '==', TEACHER_A))));
  assert.deepEqual(forA.docs.map((entry) => entry.id), [], 'Teacher A\'s roster is now empty');
  const forB = await assertSucceeds(getDocs(query(collection(teacherB(), 'grades'), where('assignedTeacherEmail', '==', TEACHER_B))));
  assert.deepEqual(forB.docs.map((entry) => entry.id).sort(), ['STUDENT_A', 'STUDENT_B']);

  // Put it back, so the ordering of later tests does not depend on this one.
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'grades/STUDENT_A'), {
      classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A,
    }, { merge: true });
  });
});

test('teacher and student clients cannot rewrite roster authorization fields', async () => {
  await assertFails(setDoc(doc(teacherA(), 'grades/STUDENT_A'), {
    assignedTeacherEmail: TEACHER_B,
  }, { merge: true }));
  await assertFails(setDoc(doc(teacherA(), 'grades/STUDENT_A'), {
    classId: 'class-b',
    classPeriod: 'Period 2',
  }, { merge: true }));
  await assertFails(setDoc(doc(studentA(), 'grades/STUDENT_A'), {
    assignedTeacherEmail: TEACHER_A,
    classId: 'class-b',
    classPeriod: 'Period 2',
  }, { merge: true }));

  // Ordinary work/profile fields are still writable by the identities that
  // already own this roster row.
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/STUDENT_A'), {
    teacherNoteMarker: 'allowed',
  }, { merge: true }));
  await assertSucceeds(setDoc(doc(studentA(), 'grades/STUDENT_A'), {
    studentProgressMarker: 'allowed',
  }, { merge: true }));
});

test('a stale denormalized teacher is what a partial move would leave behind', async () => {
  // Writing classId without assignedTeacherEmail — the bug this design exists
  // to make impossible. Asserted here so a future change that reintroduces it
  // fails loudly rather than silently leaking a roster.
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'grades/STUDENT_A'), { classId: 'class-b' }, { merge: true });
  });
  // The student is in Teacher B's class, but Teacher A can still read them.
  await assertSucceeds(getDoc(doc(teacherA(), 'grades/STUDENT_A')));
  await assertFails(getDoc(doc(teacherB(), 'grades/STUDENT_A')));

  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'grades/STUDENT_A'), {
      classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A,
    }, { merge: true });
  });
});

// --- Evidence, mastery and scratchpads carry their own authorization ----------------

const CHILD_PATHS = [
  'grades/STUDENT_A/evidenceEvents/ev-1',
  'grades/STUDENT_A/scratchpads/sp-1',
  'studentMasteryProfiles/STUDENT_A',
  'studentRetentionSchedules/STUDENT_A',
];

const seedChildren = (authorizedTeacherEmails) => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  for (const path of CHILD_PATHS) {
    await setDoc(doc(db, path), {
      studentId: 'STUDENT_A',
      classId: 'class-a',
      originClassId: 'class-a',
      originTeacherEmail: TEACHER_A,
      authorizedTeacherEmails,
    }, { merge: true });
  }
});

test('a teacher reads a student\'s evidence and mastery only when the record names them', async () => {
  await seedChildren([TEACHER_A]);
  for (const path of CHILD_PATHS) {
    await assertSucceeds(getDoc(doc(teacherA(), path)));
    // This is the hole the broad teacher() rule left open: another teacher
    // reading a child's evidence and mastery.
    await assertFails(getDoc(doc(teacherB(), path)));
  }
});

test('the student reads their own evidence and mastery whatever the access list says', async () => {
  await seedChildren([TEACHER_A]);
  await assertSucceeds(getDoc(doc(studentA(), 'studentMasteryProfiles/STUDENT_A')));
  await assertSucceeds(getDoc(doc(studentA(), 'grades/STUDENT_A/evidenceEvents/ev-1')));
  await assertFails(getDoc(doc(studentB(), 'studentMasteryProfiles/STUDENT_A')));
});

test('a record with no access list is readable by no teacher at all', async () => {
  // Exactly the state of every record written before this existed, which is
  // why the backfill has to report zero before the scoped rules go live.
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'grades/STUDENT_A/evidenceEvents/ev-legacy'), { studentId: 'STUDENT_A' });
  });
  await assertFails(getDoc(doc(teacherA(), 'grades/STUDENT_A/evidenceEvents/ev-legacy')));
  await assertFails(getDoc(doc(teacherB(), 'grades/STUDENT_A/evidenceEvents/ev-legacy')));
  await assertSucceeds(getDoc(doc(admin(), 'grades/STUDENT_A/evidenceEvents/ev-legacy')));
});

test('after a move, the new teacher reads the history and the old teacher keeps theirs', async () => {
  // What `reauthorizeContext` writes: origin untouched, access list carrying
  // the teacher who was there plus the teacher who has them now.
  await seedChildren([TEACHER_A, TEACHER_B]);
  for (const path of CHILD_PATHS) {
    await assertSucceeds(getDoc(doc(teacherB(), path)));
    await assertSucceeds(getDoc(doc(teacherA(), path)));
  }
  // And the record still says where the work actually happened.
  const record = await getDoc(doc(admin(), 'grades/STUDENT_A/evidenceEvents/ev-1'));
  assert.equal(record.data().originTeacherEmail, TEACHER_A);
  assert.equal(record.data().originClassId, 'class-a');
});

test('a teacher who never taught the student and does not now is refused', async () => {
  await seedChildren([TEACHER_A]);
  const teacherC = env.authenticatedContext('uid-c', { role: 'teacher', email: 'teacher.c@desotoisd.org' }).firestore();
  for (const path of CHILD_PATHS) {
    await assertFails(getDoc(doc(teacherC, path)));
  }
});

test('live presence is scoped to the teacher roster and owned by the student heartbeat', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'presence/STUDENT_A')));
  await assertFails(getDoc(doc(teacherA(), 'presence/STUDENT_B')));
  await assertFails(getDoc(doc(teacherB(), 'presence/STUDENT_A')));
  await assertSucceeds(getDoc(doc(admin(), 'presence/STUDENT_B')));

  await assertSucceeds(setDoc(doc(studentA(), 'presence/STUDENT_A'), {
    studentId: 'STUDENT_A',
    classId: 'class-a',
    assignmentId: 'A1',
  }, { merge: true }));
  await assertFails(setDoc(doc(studentA(), 'presence/STUDENT_B'), {
    studentId: 'STUDENT_B',
    classId: 'class-b',
  }, { merge: true }));
  await assertFails(setDoc(doc(teacherA(), 'presence/STUDENT_A'), {
    assignmentId: 'forged-by-teacher',
  }, { merge: true }));
});

test('personal Path intervention is student-readable, roster-scoped, and server-write-only', async () => {
  await assertSucceeds(getDoc(doc(studentA(), 'studentPathInterventions/STUDENT_A')));
  await assertSucceeds(getDoc(doc(teacherA(), 'studentPathInterventions/STUDENT_A')));
  await assertFails(getDoc(doc(teacherB(), 'studentPathInterventions/STUDENT_A')));
  await assertSucceeds(getDoc(doc(admin(), 'studentPathInterventions/STUDENT_A')));

  await assertFails(setDoc(doc(studentA(), 'studentPathInterventions/STUDENT_A'), {
    skillId: 'teks:A.6A',
  }, { merge: true }));
  await assertFails(setDoc(doc(teacherA(), 'studentPathInterventions/STUDENT_A'), {
    skillId: 'teks:A.6A',
  }, { merge: true }));
});

test('student support history is teacher-authorized and append-only', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'studentSupportEvents/support-a')));
  await assertFails(getDoc(doc(teacherB(), 'studentSupportEvents/support-a')));
  await assertFails(getDoc(doc(studentA(), 'studentSupportEvents/support-a')));

  const mine = await assertSucceeds(getDocs(query(
    collection(teacherA(), 'studentSupportEvents'),
    where('authorizedTeacherEmails', 'array-contains', TEACHER_A),
  )));
  assert.equal(mine.docs.some((entry) => entry.id === 'support-a'), true);

  await assertSucceeds(setDoc(doc(teacherA(), 'studentSupportEvents/support-new'), {
    schemaVersion: 1,
    kind: 'watchPractice',
    stage: 'actionTaken',
    studentId: 'STUDENT_A',
    classId: 'class-a',
    createdByEmail: TEACHER_A,
    authorizedTeacherEmails: [TEACHER_A],
    createdAt: '2026-09-01T12:05:00.000Z',
  }));

  await assertFails(setDoc(doc(teacherA(), 'studentSupportEvents/support-shared'), {
    schemaVersion: 1,
    kind: 'watchPractice',
    stage: 'actionTaken',
    studentId: 'STUDENT_A',
    classId: 'class-a',
    createdByEmail: TEACHER_A,
    authorizedTeacherEmails: [TEACHER_A, TEACHER_B],
  }), 'a teacher cannot grant another teacher access while creating a support event');

  await assertFails(setDoc(doc(teacherA(), 'studentSupportEvents/support-wrong-class'), {
    schemaVersion: 1,
    kind: 'watchPractice',
    stage: 'actionTaken',
    studentId: 'STUDENT_A',
    classId: 'class-b',
    createdByEmail: TEACHER_A,
    authorizedTeacherEmails: [TEACHER_A],
  }), 'support history must carry the student current class');

  await assertFails(setDoc(doc(teacherA(), 'studentSupportEvents/support-forged'), {
    schemaVersion: 1,
    kind: 'offTaskConcern',
    stage: 'teacherConfirmed',
    studentId: 'STUDENT_B',
    createdByEmail: TEACHER_B,
    authorizedTeacherEmails: [TEACHER_B],
  }));
  await assertFails(setDoc(doc(teacherA(), 'studentSupportEvents/support-other-roster'), {
    schemaVersion: 1,
    kind: 'watchPractice',
    stage: 'actionTaken',
    studentId: 'STUDENT_B',
    createdByEmail: TEACHER_A,
    authorizedTeacherEmails: [TEACHER_A],
  }), 'a teacher cannot create support history for another teacher\'s roster');

  // A signal is never rewritten into a fact. Confirmation/dismissal/resolution
  // must be a new append-only event.
  await assertFails(setDoc(doc(teacherA(), 'studentSupportEvents/support-a'), {
    stage: 'resolved',
  }, { merge: true }));
});

test('teacher support logging still works for an authorized legacy period roster row', async () => {
  await assertSucceeds(setDoc(doc(teacherLegacy(), 'studentSupportEvents/support-legacy'), {
    schemaVersion: 1,
    kind: 'teacherIntervention',
    stage: 'actionTaken',
    studentId: 'STUDENT_LEGACY',
    classId: null,
    classPeriod: 'Period 1',
    createdByEmail: TEACHER_LEGACY,
    authorizedTeacherEmails: [TEACHER_LEGACY],
    createdAt: '2026-09-01T12:10:00.000Z',
  }));

  await assertFails(setDoc(doc(teacherLegacy(), 'studentSupportEvents/support-legacy-wrong-period'), {
    schemaVersion: 1,
    kind: 'teacherIntervention',
    stage: 'actionTaken',
    studentId: 'STUDENT_LEGACY',
    classId: null,
    classPeriod: 'Period 2',
    createdByEmail: TEACHER_LEGACY,
    authorizedTeacherEmails: [TEACHER_LEGACY],
  }));
});

test('archived session summaries are teacher-authorized and server-owned', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'studentSessionSummaries/session-a')));
  await assertFails(getDoc(doc(teacherB(), 'studentSessionSummaries/session-a')));
  await assertFails(getDoc(doc(studentA(), 'studentSessionSummaries/session-a')));

  const mine = await assertSucceeds(getDocs(query(
    collection(teacherA(), 'studentSessionSummaries'),
    where('authorizedTeacherEmails', 'array-contains', TEACHER_A),
  )));
  assert.equal(mine.docs.some((entry) => entry.id === 'session-a'), true);

  await assertFails(setDoc(doc(teacherA(), 'studentSessionSummaries/forged'), {
    studentId: 'STUDENT_A',
    authorizedTeacherEmails: [TEACHER_A],
  }));
  await assertFails(setDoc(doc(studentA(), 'studentSessionSummaries/forged-student'), {
    studentId: 'STUDENT_A',
    authorizedTeacherEmails: [TEACHER_A],
  }));
});

test('a student cannot mint evidence that names a teacher, or none at all', async () => {
  // No access list: refused, so a client cannot create a record nobody can see.
  await assertFails(setDoc(doc(studentA(), 'grades/STUDENT_A/evidenceEvents/forged-1'), {
    studentId: 'STUDENT_A', eventKey: 'forged-1',
  }));
  // Wrong student: refused whatever else is in it.
  await assertFails(setDoc(doc(studentA(), 'grades/STUDENT_B/evidenceEvents/forged-2'), {
    studentId: 'STUDENT_B', eventKey: 'forged-2', authorizedTeacherEmails: [TEACHER_B],
  }));
  // Evidence is append-only: not even the student may edit it afterwards.
  await seedChildren([TEACHER_A]);
  await assertFails(setDoc(doc(studentA(), 'grades/STUDENT_A/evidenceEvents/ev-1'), { tampered: true }, { merge: true }));
});

// --- A student is confined to themselves -------------------------------------------

test('a student reads their own record and nobody else\'s', async () => {
  await assertSucceeds(getDoc(doc(studentA(), 'grades/STUDENT_A')));
  await assertFails(getDoc(doc(studentA(), 'grades/STUDENT_B')));
  await assertFails(getDocs(collection(studentB(), 'grades')));
});

test('a student cannot move themselves into another class', async () => {
  // Self-enrolment would hand a student a different course, a different
  // teacher, and access to that class's work.
  await assertFails(setDoc(doc(studentA(), 'grades/STUDENT_B'), { classId: 'class-a' }, { merge: true }));
});

test('a student cannot write another student\'s work', async () => {
  await assertFails(setDoc(doc(studentB(), 'grades/STUDENT_A'), { gradesByAssignment: { forged: 100 } }, { merge: true }));
});

// --- Classes are read-only to every client -------------------------------------------

test('everyone signed in may read classes', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'classes/class-b')));
  await assertSucceeds(getDoc(doc(studentA(), 'classes/class-a')));
});

test('no client may write a class, not even the administrator', async () => {
  // A teacher who could edit this collection could hand themselves another
  // teacher's roster; the admin goes through the audited callable instead.
  await assertFails(setDoc(doc(teacherA(), 'classes/class-b'), { teacherOfRecord: TEACHER_A }, { merge: true }));
  await assertFails(setDoc(doc(admin(), 'classes/class-a'), { name: 'Renamed' }, { merge: true }));
  await assertFails(setDoc(doc(studentA(), 'classes/class-new'), { name: 'Mine' }));
});

// --- Coverage is readable by everyone and writable by nobody ---------------------------

test('the coverage index is readable after sign-in and writable by no client', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'pathCoverage/algebra1'), {
      courseId: 'algebra1', skills: { 'A.5A': { studentReady: true, issuableCount: 3 } },
    });
  });
  // The student wheel and the teacher audit both read it.
  await assertSucceeds(getDoc(doc(studentA(), 'pathCoverage/algebra1')));
  await assertSucceeds(getDoc(doc(teacherA(), 'pathCoverage/algebra1')));

  // A client that could write it could make an uncovered standard look
  // launchable, which is the dead end this whole index exists to prevent.
  await assertFails(setDoc(doc(teacherA(), 'pathCoverage/algebra1'), { skills: {} }, { merge: true }));
  await assertFails(setDoc(doc(admin(), 'pathCoverage/algebra1'), { skills: {} }, { merge: true }));
  await assertFails(setDoc(doc(studentA(), 'pathCoverage/algebra2'), { skills: { 'A2.7I': { studentReady: true } } }));
});

// --- Nobody unauthenticated gets anything ---------------------------------------------

test('a signed-out request reads nothing at all', async () => {
  await assertFails(getDoc(doc(stranger(), 'grades/STUDENT_A')));
  await assertFails(getDoc(doc(stranger(), 'classes/class-a')));
  await assertFails(getDocs(collection(stranger(), 'assignments')));
});

// --- Server-only collections stay server-only ------------------------------------------

test('the collections that hold answers and credentials are unreachable from any client', async () => {
  const serverOnly = [
    'pathSessions/session-1',
    'pathSubmissions/sub-1',
    'studentCredentials/cred-1',
    'adminAuditLog/entry-1',
    'examSessions/exam-1',
    // The Test Cycle record is the single source of a recorded grade, and the
    // two plan documents hold approved families, generator seeds and private
    // grading for questions a student has not reached yet.
    'testCycleRecords/assignment-1__STUDENT_A',
    'testCycleCorrectionPlans/assignment-1__STUDENT_A',
    'testCycleRetestPlans/assignment-1__STUDENT_A',
    'classJoinCodes/code-1',
  ];
  for (const path of serverOnly) {
    // Even the root administrator, because these are Admin-SDK territory.
    await assertFails(getDoc(doc(admin(), path)));
    await assertFails(getDoc(doc(teacherA(), path)));
    await assertFails(getDoc(doc(studentA(), path)));
  }
});

test('a student cannot read their own Test Cycle record, plans, or write a recorded grade', async () => {
  // The record holds the recorded grade and the teacher override flags; the
  // plans hold the families and seeds behind questions the student has not
  // reached. "It is my own data" is not a reason to make any of it readable
  // from the device sitting the exam.
  await assertFails(getDoc(doc(studentA(), 'testCycleRecords/assignment-1__STUDENT_A')));
  await assertFails(getDoc(doc(studentA(), 'testCycleCorrectionPlans/assignment-1__STUDENT_A')));
  await assertFails(getDoc(doc(studentA(), 'testCycleRetestPlans/assignment-1__STUDENT_A')));
  await assertFails(setDoc(doc(studentA(), 'testCycleRecords/assignment-1__STUDENT_A'), { recordedGrade: 100 }));
});

test('no client can write the recorded Test Cycle grade, not even the student who owns the row', async () => {
  /*
   * `grades/{studentId}` is deliberately student-writable — that is how
   * ordinary assignment work is saved. The Test Cycle projection on it is not
   * ordinary work: it is the single source the Grade Center, the teacher
   * gradebook and Google Classroom passback read, and writing it is what wakes
   * the passback trigger. A student who could set it could post themselves a
   * grade in Google Classroom.
   */
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'grades/STUDENT_A'), {
      displayName: 'Student A', classId: 'class-a', classPeriod: 'Period 1',
      assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {},
      testCycleGrades: { 'assignment-1': { recordedGrade: 52, originalTestGrade: 52 } },
    });
  });

  const forged = { 'assignment-1': { recordedGrade: 100, originalTestGrade: 100 } };
  await assertFails(updateDoc(doc(studentA(), 'grades/STUDENT_A'), { testCycleGrades: forged }));
  await assertFails(updateDoc(doc(teacherA(), 'grades/STUDENT_A'), { testCycleGrades: forged }));
  await assertFails(updateDoc(doc(admin(), 'grades/STUDENT_A'), { testCycleGrades: forged }));
  // Removing it is no more allowed than rewriting it.
  await assertFails(updateDoc(doc(studentA(), 'grades/STUDENT_A'), { testCycleGrades: {} }));

  // And ordinary work still saves, which is what the document is for.
  await assertSucceeds(updateDoc(doc(studentA(), 'grades/STUDENT_A'), {
    gradesByAssignment: { 'assignment-1': { 0: { status: 'correct' } } },
  }));
});

test('no client can CREATE a grades row with a Test Cycle grade already in it', async () => {
  /*
   * The update rule pins the map against the prior document. A create has no
   * prior document, so that invariant cannot speak there — and before the row
   * exists, its owner's `setDoc` would otherwise be a blank cheque for exactly
   * the field the update rule protects. The forged entry would then be a change
   * as far as the passback trigger is concerned, and the Grade Center reads the
   * projection whether Classroom is linked or not.
   */
  const forged = { 'assignment-1': { recordedGrade: 100, originalTestGrade: 100 } };
  const roster = {
    displayName: 'Student New', classId: 'class-a', classPeriod: 'Period 1',
    assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {},
  };
  // The owner of the row that does not exist yet — `ownsStudent` is token-bound,
  // so any other student would be refused for the wrong reason and prove nothing.
  const studentNew = () => env.authenticatedContext('uid-new', { role: 'student', studentId: 'STUDENT_NEW' }).firestore();

  await assertFails(setDoc(doc(studentNew(), 'grades/STUDENT_NEW'), { ...roster, testCycleGrades: forged }));
  await assertFails(setDoc(doc(teacherA(), 'grades/STUDENT_NEW'), { ...roster, testCycleGrades: forged }));
  await assertFails(setDoc(doc(admin(), 'grades/STUDENT_NEW'), { ...roster, testCycleGrades: forged }));

  // An ordinary roster row still creates, which is what the create rule is for,
  // and so does one that names the field empty.
  await assertSucceeds(setDoc(doc(studentNew(), 'grades/STUDENT_NEW'), roster));
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/STUDENT_NEW2'), { ...roster, testCycleGrades: {} }));
});

test('a student cannot read the path question bank, which holds answer keys', async () => {
  await assertFails(getDoc(doc(studentA(), 'pathQuestionBank/q-1')));
  await assertFails(getDoc(doc(studentA(), 'examQuestionBank/q-1')));
  await assertFails(getDoc(doc(studentA(), 'modelingLabDefinitions/lab-1')));
});

// --- Path Release V2 control plane ------------------------------------------
//
// The release state, its document index and its jobs are written ONLY by the
// path-admin callables through the Admin SDK. A client that could write them
// could tell every student the bank had been replaced, or forge a "complete"
// job over a release that never ran.

test('the active course release pointer is readable but never client-writable', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'pathReleaseState/course'), {
      status: 'active',
      releaseId: 'course-path-v2-abcdef0123456789',
      contentHash: 'abcdef0123456789',
      questionCount: 1161,
    });
  });

  // Any signed-in surface may tell "updating" from "active".
  await assertSucceeds(getDoc(doc(studentA(), 'pathReleaseState/course')));
  await assertSucceeds(getDoc(doc(teacherA(), 'pathReleaseState/course')));

  // Nobody writes it from a browser — not a student, not a teacher, not the
  // root administrator, whose own release actions go through the callable.
  await assertFails(setDoc(doc(studentA(), 'pathReleaseState/course'), { status: 'active' }, { merge: true }));
  await assertFails(setDoc(doc(teacherA(), 'pathReleaseState/course'), { status: 'active' }, { merge: true }));
  await assertFails(setDoc(doc(admin(), 'pathReleaseState/course'), { status: 'active' }, { merge: true }));
  await assertFails(setDoc(doc(stranger(), 'pathReleaseState/course'), { status: 'active' }));
});

test('the release document index is root-admin read-only', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'pathReleaseState/course/documentIndex/shard-0000'), {
      releaseId: 'course-path-v2-abcdef0123456789',
      entries: [{ id: 'mm_A_2A_v2_table-domain-range', contentHash: 'deadbeef', courseId: 'algebra1' }],
    });
  });

  await assertSucceeds(getDoc(doc(admin(), 'pathReleaseState/course/documentIndex/shard-0000')));
  await assertFails(getDoc(doc(teacherA(), 'pathReleaseState/course/documentIndex/shard-0000')));
  await assertFails(getDoc(doc(studentA(), 'pathReleaseState/course/documentIndex/shard-0000')));
  await assertFails(setDoc(doc(admin(), 'pathReleaseState/course/documentIndex/shard-0000'), { entries: [] }));
});

test('release jobs are root-admin diagnostics and cannot be forged', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'pathReleaseJobs/course-path-v2-abcdef0123456789'), {
      releaseId: 'course-path-v2-abcdef0123456789',
      phase: 'staging',
      totalChunks: 6,
      completedChunks: 2,
    });
    await setDoc(doc(db, 'pathReleaseJobs/course-path-v2-abcdef0123456789/chunks/chunk-00000'), {
      index: 0, status: 'complete', documentCount: 200,
    });
  });

  await assertSucceeds(getDoc(doc(admin(), 'pathReleaseJobs/course-path-v2-abcdef0123456789')));
  await assertSucceeds(getDoc(doc(admin(), 'pathReleaseJobs/course-path-v2-abcdef0123456789/chunks/chunk-00000')));
  await assertFails(getDoc(doc(teacherA(), 'pathReleaseJobs/course-path-v2-abcdef0123456789')));
  await assertFails(getDoc(doc(studentA(), 'pathReleaseJobs/course-path-v2-abcdef0123456789')));

  // A forged "complete" job would make the admin page report a release that
  // never wrote a document.
  await assertFails(setDoc(doc(admin(), 'pathReleaseJobs/course-path-v2-abcdef0123456789'), { phase: 'complete' }, { merge: true }));
  await assertFails(setDoc(doc(teacherA(), 'pathReleaseJobs/forged'), { phase: 'complete' }));
  await assertFails(setDoc(doc(studentA(), 'pathReleaseJobs/forged'), { phase: 'complete' }));
});

/*
 * THE TWO SERVER-OWNED COLLECTIONS THE INCIDENT RECOVERY ADDED.
 *
 * Both are written only by the Admin SDK, which bypasses these rules entirely.
 * What the rules have to guarantee is the other direction: that no client can
 * write one. A forged receipt is the dangerous case — it is the document a
 * Chromebook retires a queue row against, so anyone who could write one could
 * tell a device to discard work that never reached the gradebook.
 */
test('a submission receipt is readable by its own student and writable by nobody', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentSubmissionReceipts/STUDENT_A__action-1'), {
      studentId: 'STUDENT_A',
      actionId: 'action-1',
      assignmentId: 'A1',
      questionIndex: 0,
      disposition: 'accepted',
      totalAttempts: 1,
    });
  });

  await assertSucceeds(getDoc(doc(studentA(), 'studentSubmissionReceipts/STUDENT_A__action-1')));
  await assertSucceeds(getDoc(doc(admin(), 'studentSubmissionReceipts/STUDENT_A__action-1')));
  // Another student must not learn what this student has submitted.
  await assertFails(getDoc(doc(studentB(), 'studentSubmissionReceipts/STUDENT_A__action-1')));
  await assertFails(getDoc(doc(stranger(), 'studentSubmissionReceipts/STUDENT_A__action-1')));

  // A forged receipt would tell a device its work landed when it did not.
  await assertFails(setDoc(doc(studentA(), 'studentSubmissionReceipts/STUDENT_A__forged'), {
    studentId: 'STUDENT_A', actionId: 'forged', disposition: 'accepted',
  }));
  await assertFails(updateDoc(doc(studentA(), 'studentSubmissionReceipts/STUDENT_A__action-1'), { disposition: 'accepted' }));
  await assertFails(setDoc(doc(teacherA(), 'studentSubmissionReceipts/STUDENT_A__forged'), { studentId: 'STUDENT_A' }));
  await assertFails(setDoc(doc(admin(), 'studentSubmissionReceipts/STUDENT_A__forged'), { studentId: 'STUDENT_A' }));
});

test('a device persistence report is readable by its own student and writable by nobody', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentDevicePersistenceReports/STUDENT_A__chromebook-01'), {
      studentId: 'STUDENT_A', deviceId: 'chromebook-01', queued: 3, queuedGradeBearing: 2,
    });
  });

  await assertSucceeds(getDoc(doc(studentA(), 'studentDevicePersistenceReports/STUDENT_A__chromebook-01')));
  await assertFails(getDoc(doc(studentB(), 'studentDevicePersistenceReports/STUDENT_A__chromebook-01')));
  // One student fabricating another's incident record is exactly what the
  // audited callable exists to prevent.
  await assertFails(setDoc(doc(studentB(), 'studentDevicePersistenceReports/STUDENT_A__forged'), {
    studentId: 'STUDENT_A', deviceId: 'forged', queued: 0,
  }));
  await assertFails(setDoc(doc(studentA(), 'studentDevicePersistenceReports/STUDENT_A__own-forgery'), {
    studentId: 'STUDENT_A', deviceId: 'own', queued: 0,
  }));
});
