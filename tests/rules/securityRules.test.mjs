import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { accountId as classPointsAccountId } from '../../functions/shared/classPoints.mjs';
import {
  activeStudentSpotlightQuery,
  activeTeacherSpotlightQuery,
} from '../../src/platform/liveSpotlightQueries.js';

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
const CLASS_POINTS_ACCOUNT_A = classPointsAccountId('STUDENT_A', 'class-a');

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

  // `npm run test:rules` runs tests/firestore-rules.test.mjs against this same
  // emulator before starting the node:test files. TestEnvironment#cleanup only
  // closes clients; it does not remove documents left by that earlier process.
  // Start this suite from its declared fixture so an assignment created here
  // cannot accidentally become an update of an assignment from another suite.
  await env.clearFirestore();

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
    // What awardClassPoints would have written for one $2 participation award.
    await setDoc(doc(db, `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`), {
      schemaVersion: 1,
      studentId: 'STUDENT_A',
      classId: 'class-a',
      balance: 2,
      lifetimeEarned: 2,
      lifetimeSpent: 0,
      originTeacherEmail: TEACHER_A,
      authorizedTeacherEmails: [TEACHER_A],
      updatedAt: '2026-09-01T12:00:00.000Z',
    });
    await setDoc(doc(db, 'classPointTransactions/cp-tx-1'), {
      schemaVersion: 1,
      studentId: 'STUDENT_A',
      classId: 'class-a',
      amount: 2,
      reasonCode: 'participation',
      reasonLabel: 'Participation',
      sourceType: 'teacherAward',
      issuedByUid: 'uid-a',
      issuedByEmail: TEACHER_A,
      requestId: 'req-1',
      isReversal: false,
      reversalOf: null,
      originTeacherEmail: TEACHER_A,
      authorizedTeacherEmails: [TEACHER_A],
      createdAt: '2026-09-01T12:00:00.000Z',
    });
    await setDoc(doc(db, 'classes/class-a/classPointAnnouncements/ann-1'), {
      schemaVersion: 1,
      classId: 'class-a',
      publicStudentLabel: 'Student A.',
      amount: 2,
      reasonLabel: 'Participation',
      awardTransactionId: 'cp-tx-1',
      createdAt: '2026-09-01T12:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    // What redeemPracticePass would have written for one granted Practice Pass.
    await setDoc(doc(db, 'classPointRewardRedemptions/redemption-a'), {
      schemaVersion: 1,
      redemptionId: 'redemption-a',
      rewardCode: 'practicePass',
      studentId: 'STUDENT_A',
      classId: 'class-a',
      assignmentId: 'A1',
      assignmentTitle: 'Solving Equations',
      cost: 100,
      transactionId: 'cp-tx-practice-pass-1',
      redeemedAt: '2026-09-01T12:00:00.000Z',
      status: 'redeemed',
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

test('Spotlight requires fresh affirmative consent and isolates the active frame', async () => {
  const requestId = `spotlight-consent-${Date.now()}`;
  const requestPath = `liveSpotlightRequests/${requestId}`;
  const framePath = `liveSpotlightFrames/${requestId}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + 120000);

  await assertSucceeds(setDoc(doc(teacherA(), requestPath), {
    schemaVersion: 1, requestId, classId: 'class-a', studentId: 'STUDENT_A',
    studentLabel: 'Student A.', teacherUid: 'uid-a', teacherEmail: TEACHER_A,
    teacherLabel: 'Ms. A', status: 'requested', assignmentId: 'A1', questionIndex: 0,
    requestedAt: serverTimestamp(), expiresAt,
  }));
  await assertFails(setDoc(doc(teacherB(), `liveSpotlightRequests/${requestId}-wrong-teacher`), {
    schemaVersion: 1, requestId: `${requestId}-wrong-teacher`, classId: 'class-a', studentId: 'STUDENT_A',
    teacherUid: 'uid-b', teacherEmail: TEACHER_B, status: 'requested',
    requestedAt: serverTimestamp(), expiresAt,
  }));
  await assertFails(setDoc(doc(studentA(), `liveSpotlightRequests/${requestId}-student-forged`), {
    schemaVersion: 1, requestId: `${requestId}-student-forged`, classId: 'class-a', studentId: 'STUDENT_A',
    teacherUid: 'uid-a', teacherEmail: TEACHER_A, status: 'requested',
    requestedAt: serverTimestamp(), expiresAt,
  }));
  await assertSucceeds(getDoc(doc(studentA(), requestPath)));
  await assertFails(getDoc(doc(studentB(), requestPath)));
  await assertFails(getDoc(doc(teacherB(), requestPath)));

  // A request alone is not consent and cannot authorize answer-bearing work.
  await assertFails(setDoc(doc(studentA(), framePath), {
    requestId, studentId: 'STUDENT_A', work: { response: 'private' }, updatedAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(teacherA(), framePath)));

  await assertSucceeds(updateDoc(doc(studentA(), requestPath), { status: 'accepted', respondedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(studentA(), framePath), {
    schemaVersion: 1, requestId, studentId: 'STUDENT_A', assignmentId: 'A1', assignmentTitle: 'Assignment 1',
    questionIndex: 0, studentLabel: 'Student A.', question: { prompt: 'Solve' }, work: { response: '2x + 3' },
    updatedAtMs: Date.now(), updatedAt: serverTimestamp(), expiresAt,
  }));
  await assertSucceeds(getDoc(doc(teacherA(), framePath)));
  await assertFails(getDoc(doc(teacherB(), framePath)));
  await assertFails(getDoc(doc(studentB(), framePath)));
  await assertFails(setDoc(doc(studentA(), framePath), {
    schemaVersion: 1, requestId, studentId: 'STUDENT_A', assignmentId: 'A2', assignmentTitle: 'Assignment 2',
    questionIndex: 1, studentLabel: 'Student A.', question: { prompt: 'Other work' }, work: { response: 'private A2' },
    updatedAtMs: Date.now(), updatedAt: serverTimestamp(), expiresAt,
  }));
  await assertFails(setDoc(doc(studentA(), framePath), {
    schemaVersion: 1, requestId, studentId: 'STUDENT_A', assignmentId: 'A1', assignmentTitle: 'Assignment 1',
    questionIndex: 0, studentLabel: 'Student A.', question: { prompt: 'Solve' }, work: { response: '2x + 3' },
    grade: 100, browserHistory: ['private'], updatedAtMs: Date.now(), updatedAt: serverTimestamp(), expiresAt,
  }));

  await assertSucceeds(deleteDoc(doc(studentA(), framePath)));
  await assertSucceeds(updateDoc(doc(studentA(), requestPath), { status: 'stopped', stoppedAt: serverTimestamp(), stoppedBy: 'student' }));
  await assertFails(setDoc(doc(studentA(), framePath), {
    requestId, studentId: 'STUDENT_A', work: { response: 'must not return' }, updatedAt: serverTimestamp(),
  }));

  const nextRequestId = `${requestId}-new-session`;
  await assertSucceeds(setDoc(doc(teacherA(), `liveSpotlightRequests/${nextRequestId}`), {
    schemaVersion: 1, requestId: nextRequestId, classId: 'class-a', studentId: 'STUDENT_A',
    studentLabel: 'Student A.', teacherUid: 'uid-a', teacherEmail: TEACHER_A,
    teacherLabel: 'Ms. A', status: 'requested', assignmentId: 'A1', questionIndex: 0,
    requestedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 120000),
  }));
  await assertFails(setDoc(doc(studentA(), `liveSpotlightFrames/${nextRequestId}`), {
    schemaVersion: 1, requestId: nextRequestId, studentId: 'STUDENT_A', assignmentId: 'A1', assignmentTitle: 'Assignment 1',
    questionIndex: 0, studentLabel: 'Student A.', question: { prompt: 'Solve' }, work: { response: 'old consent cannot carry' },
    updatedAtMs: Date.now(), updatedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 120000),
  }));
});

test('Spotlight decline, expiry, teacher stop, and teacher-of-record changes reveal nothing', async () => {
  const seedRequest = async (id, expiresAt, status = 'requested') => env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `liveSpotlightRequests/${id}`), {
      schemaVersion: 1, requestId: id, classId: 'class-a', studentId: 'STUDENT_A', studentLabel: 'Student A.',
      teacherUid: 'uid-a', teacherEmail: TEACHER_A, teacherLabel: 'Ms. A', status,
      assignmentId: 'A1', questionIndex: 0, requestedAt: Timestamp.fromMillis(Date.now() - 1000), expiresAt,
    });
    if (status === 'accepted') await setDoc(doc(context.firestore(), `liveSpotlightFrames/${id}`), { requestId: id, studentId: 'STUDENT_A', work: { response: 'frame' }, updatedAt: Timestamp.now() });
  });

  const declined = `spotlight-declined-${Date.now()}`;
  await seedRequest(declined, Timestamp.fromMillis(Date.now() + 120000));
  await assertSucceeds(updateDoc(doc(studentA(), `liveSpotlightRequests/${declined}`), { status: 'declined', respondedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(teacherA(), `liveSpotlightFrames/${declined}`)));

  const expired = `spotlight-expired-${Date.now()}`;
  await seedRequest(expired, Timestamp.fromMillis(Date.now() - 1000), 'accepted');
  await assertFails(getDoc(doc(teacherA(), `liveSpotlightFrames/${expired}`)));
  await assertFails(setDoc(doc(studentA(), `liveSpotlightFrames/${expired}`), { requestId: expired, studentId: 'STUDENT_A', updatedAt: serverTimestamp() }));

  const stopped = `spotlight-teacher-stop-${Date.now()}`;
  await seedRequest(stopped, Timestamp.fromMillis(Date.now() + 120000), 'accepted');
  await assertSucceeds(updateDoc(doc(teacherA(), `liveSpotlightRequests/${stopped}`), { status: 'stopped', stoppedAt: serverTimestamp(), stoppedBy: 'teacher' }));
  await assertFails(getDoc(doc(teacherA(), `liveSpotlightFrames/${stopped}`)));

  const moved = `spotlight-moved-${Date.now()}`;
  await seedRequest(moved, Timestamp.fromMillis(Date.now() + 120000), 'accepted');
  await env.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'classes/class-a'), { teacherOfRecord: TEACHER_B }));
  await assertFails(getDoc(doc(teacherA(), `liveSpotlightFrames/${moved}`)));
  await env.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'classes/class-a'), { teacherOfRecord: TEACHER_A }));
});

test('production Spotlight collection queries preserve teacher, class, roster, and student boundaries', async () => {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 120000);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'liveSpotlightRequests/query-a'), {
      schemaVersion: 1, requestId: 'query-a', classId: 'class-a', studentId: 'STUDENT_A',
      teacherUid: 'uid-a', teacherEmail: TEACHER_A, status: 'requested', assignmentId: 'A1',
      requestedAt: now, expiresAt,
    });
    await setDoc(doc(db, 'liveSpotlightRequests/query-b'), {
      schemaVersion: 1, requestId: 'query-b', classId: 'class-b', studentId: 'STUDENT_B',
      teacherUid: 'uid-b', teacherEmail: TEACHER_B, status: 'requested', assignmentId: 'A2',
      requestedAt: now, expiresAt,
    });
  });

  const teacherResults = await assertSucceeds(getDocs(activeTeacherSpotlightQuery(teacherA(), {
    teacherEmail: TEACHER_A, classId: 'class-a', studentIds: ['STUDENT_A'], now,
  })));
  assert.equal(teacherResults.docs.some((entry) => entry.id === 'query-a'), true);
  assert.equal(teacherResults.docs.every((entry) => {
    const data = entry.data();
    return data.teacherEmail === TEACHER_A && data.classId === 'class-a';
  }), true);
  await assertFails(getDocs(activeTeacherSpotlightQuery(teacherB(), {
    teacherEmail: TEACHER_A, classId: 'class-a', studentIds: ['STUDENT_A'], now,
  })));
  await assertFails(getDocs(activeTeacherSpotlightQuery(teacherA(), {
    teacherEmail: TEACHER_B, classId: 'class-b', studentIds: ['STUDENT_B'], now,
  })));
  await assertFails(getDocs(activeTeacherSpotlightQuery(teacherA(), {
    teacherEmail: TEACHER_A, classId: 'class-a', studentIds: ['STUDENT_A', 'STUDENT_B'], now,
  })));

  const studentResults = await assertSucceeds(getDocs(activeStudentSpotlightQuery(studentA(), {
    studentId: 'STUDENT_A', now,
  })));
  assert.equal(studentResults.docs.some((entry) => entry.id === 'query-a'), true);
  assert.equal(studentResults.docs.every((entry) => entry.data().studentId === 'STUDENT_A'), true);
  await assertFails(getDocs(activeStudentSpotlightQuery(studentB(), {
    studentId: 'STUDENT_A', now,
  })));

  // Rules are not filters, so the production query itself is roster-scoped.
  // Even a malformed Admin-SDK row for another student is outside the query's
  // potential result set and therefore cannot leak into the teacher snapshot.
  await env.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'liveSpotlightRequests/query-invalid-roster'), {
    schemaVersion: 1, requestId: 'query-invalid-roster', classId: 'class-a', studentId: 'STUDENT_B',
    teacherUid: 'uid-a', teacherEmail: TEACHER_A, status: 'requested', assignmentId: 'A1',
    requestedAt: now, expiresAt,
  }));
  const boundedTeacherResults = await assertSucceeds(getDocs(activeTeacherSpotlightQuery(teacherA(), {
    teacherEmail: TEACHER_A, classId: 'class-a', studentIds: ['STUDENT_A'], now,
  })));
  assert.equal(boundedTeacherResults.docs.some((entry) => entry.id === 'query-invalid-roster'), false);
});

test('Spotlight does not widen workspace drafts or presence response content', async () => {
  await assertFails(getDoc(doc(teacherA(), 'studentWorkspaceDrafts/STUDENT_A__A1')));
  await assertFails(updateDoc(doc(studentA(), 'presence/STUDENT_A'), { response: 'must stay private' }));
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

/*
 * A PERSISTENCE RESOLUTION IS THE FLAG THAT RELEASES A FINAL GRADE.
 *
 * Anything that can write one can release its own final Classroom passback, so
 * no client may write one — not a student, not a teacher, not the root
 * administrator. The only writer is `resolveStudentPersistenceHold`, which runs
 * on the Admin SDK (bypassing these rules) after checking the caller is the
 * teacher of record for the class the student is actually in.
 *
 * This is also why the flag does NOT live on `grades/{studentId}`: a student
 * may write parts of their own grade document.
 */
test('a persistence resolution is readable by its own student and writable by nobody at all', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentPersistenceResolutions/STUDENT_A__assignment-1'), {
      studentId: 'STUDENT_A',
      assignmentId: 'assignment-1',
      classId: 'class-a',
      resolvedByEmail: TEACHER_A,
      acknowledgedWorked: 5,
      acknowledgedCanonicalAttempted: 3,
    });
  });

  await assertSucceeds(getDoc(doc(studentA(), 'studentPersistenceResolutions/STUDENT_A__assignment-1')));
  await assertSucceeds(getDoc(doc(admin(), 'studentPersistenceResolutions/STUDENT_A__assignment-1')));
  await assertFails(getDoc(doc(studentB(), 'studentPersistenceResolutions/STUDENT_A__assignment-1')));

  const forged = {
    studentId: 'STUDENT_A', assignmentId: 'assignment-1', classId: 'class-a',
    resolvedByEmail: TEACHER_A, acknowledgedWorked: 5, acknowledgedCanonicalAttempted: 3,
  };
  // A student releasing their own final grade.
  await assertFails(setDoc(doc(studentA(), 'studentPersistenceResolutions/STUDENT_A__forged'), forged));
  // One student releasing another's.
  await assertFails(setDoc(doc(studentB(), 'studentPersistenceResolutions/STUDENT_A__forged-b'), forged));
  // A teacher going round the audited callable, so no actor or reason is
  // recorded and no authorization is checked.
  await assertFails(setDoc(doc(teacherA(), 'studentPersistenceResolutions/STUDENT_A__teacher-direct'), forged));
  await assertFails(setDoc(doc(admin(), 'studentPersistenceResolutions/STUDENT_A__admin-direct'), forged));
  // Editing or deleting an existing one is the same authority by another route.
  await assertFails(updateDoc(doc(teacherA(), 'studentPersistenceResolutions/STUDENT_A__assignment-1'), { acknowledgedWorked: 99 }));
  await assertFails(updateDoc(doc(studentA(), 'studentPersistenceResolutions/STUDENT_A__assignment-1'), { acknowledgedWorked: 99 }));
  await assertFails(setDoc(doc(stranger(), 'studentPersistenceResolutions/STUDENT_A__anon'), forged));
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


// --- Teacher grade overrides are server-authoritative -----------------------
test('no client can forge, change, or remove a teacher grade override projection', async () => {
  const authoritative = {
    'assignment-override-test': {
      0: {
        active: true,
        score: 80,
        reason: 'Partial credit awarded',
        actor: { uid: 'server-teacher', email: TEACHER_A },
      },
    },
  };

  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'grades/STUDENT_A'), {
      teacherGradeOverridesByAssignment: authoritative,
    });
  });

  const forged = {
    'assignment-override-test': {
      0: {
        active: true,
        score: 100,
        reason: 'forged',
        actor: { uid: 'student' },
      },
    },
  };

  await assertFails(updateDoc(doc(studentA(), 'grades/STUDENT_A'), {
    teacherGradeOverridesByAssignment: forged,
  }));
  await assertFails(updateDoc(doc(teacherA(), 'grades/STUDENT_A'), {
    teacherGradeOverridesByAssignment: forged,
  }));
  await assertFails(updateDoc(doc(admin(), 'grades/STUDENT_A'), {
    teacherGradeOverridesByAssignment: forged,
  }));

  await assertFails(updateDoc(doc(studentA(), 'grades/STUDENT_A'), {
    teacherGradeOverridesByAssignment: {},
  }));

  // Existing legitimate client-writable work remains writable so the new
  // protection does not break the ordinary assignment persistence contract.
  await assertSucceeds(updateDoc(doc(studentA(), 'grades/STUDENT_A'), {
    gradesByAssignment: {
      'assignment-ordinary-write': {
        0: { status: 'attempted', attemptCount: 1, totalAttempts: 1 },
      },
    },
  }));

  const snapshot = await getDoc(doc(studentA(), 'grades/STUDENT_A'));
  assert.deepEqual(snapshot.data().teacherGradeOverridesByAssignment, authoritative);
});

test('clients cannot create a grades row that already contains teacher overrides', async () => {
  const studentNew = () => env.authenticatedContext(
    'uid-new-override',
    { role: 'student', studentId: 'STUDENT_OVERRIDE_NEW' },
  ).firestore();
  const roster = {
    displayName: 'Student Override New',
    classId: 'class-a',
    classPeriod: 'Period 1',
    assignedTeacherEmail: TEACHER_A,
    status: 'active',
    gradesByAssignment: {},
  };
  const forgedOverrides = {
    assignment: {
      0: { active: true, score: 100 },
    },
  };

  await assertFails(setDoc(doc(studentNew(), 'grades/STUDENT_OVERRIDE_NEW'), {
    ...roster,
    teacherGradeOverridesByAssignment: forgedOverrides,
  }));
  await assertFails(setDoc(doc(teacherA(), 'grades/STUDENT_OVERRIDE_TEACHER_CREATE'), {
    ...roster,
    teacherGradeOverridesByAssignment: forgedOverrides,
  }));

  await assertSucceeds(setDoc(doc(studentNew(), 'grades/STUDENT_OVERRIDE_NEW'), roster));
});

test('grade override audit history is server-only and cannot be forged or read directly', async () => {
  const path = 'grades/STUDENT_A/gradeOverrideAudits/audit-1';
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), {
      assignmentId: 'assignment-override-test',
      questionIndex: 0,
      previousScore: 50,
      newScore: 100,
      actor: { uid: 'server-teacher', email: TEACHER_A },
    });
  });

  await assertFails(getDoc(doc(studentA(), path)));
  await assertFails(getDoc(doc(teacherA(), path)));
  await assertFails(getDoc(doc(admin(), path)));

  await assertFails(setDoc(doc(studentA(), path), { newScore: 100 }));
  await assertFails(setDoc(doc(teacherA(), path), { newScore: 100 }));
  await assertFails(setDoc(doc(admin(), path), { newScore: 100 }));
});


test('response inspection evidence is server-only and cannot be forged or read directly', async () => {
  const path = 'grades/STUDENT_A/responseInspectionEvidence/assignment-override-test__q0';
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), {
      assignmentId: 'assignment-override-test',
      questionIndex: 0,
      submissionId: 'submission-1',
      variantIndex: 0,
      totalAttempts: 1,
      evidence: {
        schemaVersion: 3,
        submittedResponse: { kind: 'value', value: '42' },
        gradingAuthority: 'server',
      },
    });
  });

  await assertFails(getDoc(doc(studentA(), path)));
  await assertFails(getDoc(doc(teacherA(), path)));
  await assertFails(getDoc(doc(admin(), path)));

  await assertFails(setDoc(doc(studentA(), path), { evidence: { automaticScore: 100 } }));
  await assertFails(setDoc(doc(teacherA(), path), { evidence: { automaticScore: 100 } }));
  await assertFails(setDoc(doc(admin(), path), { evidence: { automaticScore: 100 } }));
});

// --- Class Points: a server-authoritative reward ledger ----------------------
//
// Every balance-changing write happens in awardClassPoints/reverseClassPointAward
// on the Admin SDK, which bypasses these rules entirely. What these rules have
// to prove is the other direction: nobody — not the student, not any teacher,
// not even the root administrator — can write an account, a transaction, or an
// idempotency record from a client, and reads stay scoped exactly the way
// grades/evidence/support history already are.

test('a teacher reads Class Points for their own roster, never another teacher\'s', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`)));
  await assertFails(getDoc(doc(teacherB(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`)));
  await assertSucceeds(getDoc(doc(teacherA(), 'classPointTransactions/cp-tx-1')));
  await assertFails(getDoc(doc(teacherB(), 'classPointTransactions/cp-tx-1')));

  const mineAccounts = await assertSucceeds(getDocs(query(
    collection(teacherA(), 'classPointAccounts'),
    where('authorizedTeacherEmails', 'array-contains', TEACHER_A),
  )));
  assert.equal(mineAccounts.docs.some((entry) => entry.id === CLASS_POINTS_ACCOUNT_A), true);
});

test('the root administrator reads any Class Points account or transaction', async () => {
  await assertSucceeds(getDoc(doc(admin(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`)));
  await assertSucceeds(getDoc(doc(admin(), 'classPointTransactions/cp-tx-1')));
});

test('a student reads their own Class Points wallet and history, never another student\'s', async () => {
  await assertSucceeds(getDoc(doc(studentA(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`)));
  await assertFails(getDoc(doc(studentB(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`)));
  await assertSucceeds(getDoc(doc(studentA(), 'classPointTransactions/cp-tx-1')));
  await assertFails(getDoc(doc(studentB(), 'classPointTransactions/cp-tx-1')));
});

test('no client can write a Class Points account, forged or otherwise — not even the root administrator', async () => {
  await assertFails(setDoc(doc(studentA(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`), { balance: 999 }, { merge: true }));
  await assertFails(setDoc(doc(teacherA(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`), { balance: 999 }, { merge: true }));
  await assertFails(setDoc(doc(admin(), `classPointAccounts/${CLASS_POINTS_ACCOUNT_A}`), { balance: 999 }, { merge: true }));
  // A student cannot even mint a brand-new account for themselves.
  await assertFails(setDoc(doc(studentA(), 'classPointAccounts/STUDENT_A__forged'), {
    schemaVersion: 1, studentId: 'STUDENT_A', classId: 'class-a', balance: 100000,
    lifetimeEarned: 100000, lifetimeSpent: 0, authorizedTeacherEmails: [TEACHER_A],
  }));
});

test('no client can write, forge, or edit a Class Points transaction', async () => {
  const forged = {
    schemaVersion: 1, studentId: 'STUDENT_A', classId: 'class-a', amount: 999,
    reasonCode: 'teacherBonus', reasonLabel: 'forged', sourceType: 'teacherAward',
    issuedByUid: 'forged', issuedByEmail: 'nobody@desotoisd.org', requestId: 'forged',
    isReversal: false, reversalOf: null, authorizedTeacherEmails: [TEACHER_A],
  };
  await assertFails(setDoc(doc(studentA(), 'classPointTransactions/forged'), forged));
  await assertFails(setDoc(doc(teacherA(), 'classPointTransactions/forged'), forged));
  await assertFails(setDoc(doc(admin(), 'classPointTransactions/forged'), forged));
  // The ledger is append-only even to the identities it names.
  await assertFails(updateDoc(doc(teacherA(), 'classPointTransactions/cp-tx-1'), { amount: 999 }));
  await assertFails(updateDoc(doc(admin(), 'classPointTransactions/cp-tx-1'), { amount: 999 }));
});

test('the idempotency ledger is unreachable from any client', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'classPointIdempotencyKeys/key-1'), { transactionId: 'cp-tx-1', createdAt: '2026-09-01T12:00:00.000Z' });
  });
  await assertFails(getDoc(doc(admin(), 'classPointIdempotencyKeys/key-1')));
  await assertFails(getDoc(doc(teacherA(), 'classPointIdempotencyKeys/key-1')));
  await assertFails(getDoc(doc(studentA(), 'classPointIdempotencyKeys/key-1')));
  await assertFails(setDoc(doc(teacherA(), 'classPointIdempotencyKeys/forged'), { transactionId: 'x' }));
});

test('a student reads the public Class Points announcement for their own class', async () => {
  await assertSucceeds(getDoc(doc(studentA(), 'classes/class-a/classPointAnnouncements/ann-1')));
  await assertSucceeds(getDoc(doc(teacherA(), 'classes/class-a/classPointAnnouncements/ann-1')));
});

test('a student or teacher from another class cannot read the announcement', async () => {
  await assertFails(getDoc(doc(studentB(), 'classes/class-a/classPointAnnouncements/ann-1')));
  await assertFails(getDoc(doc(teacherB(), 'classes/class-a/classPointAnnouncements/ann-1')));
});

test('a Class Points announcement never carries a studentId, only a safe public label', async () => {
  const snapshot = await assertSucceeds(getDoc(doc(studentA(), 'classes/class-a/classPointAnnouncements/ann-1')));
  assert.equal(snapshot.data().studentId, undefined);
  assert.equal(snapshot.data().publicStudentLabel, 'Student A.');
});

test('a student cannot manufacture a Class Points announcement', async () => {
  const forged = { classId: 'class-a', publicStudentLabel: 'Nobody R.', amount: 999, reasonLabel: 'forged' };
  await assertFails(setDoc(doc(studentA(), 'classes/class-a/classPointAnnouncements/forged'), forged));
  await assertFails(setDoc(doc(teacherA(), 'classes/class-a/classPointAnnouncements/forged'), forged));
  await assertFails(setDoc(doc(admin(), 'classes/class-a/classPointAnnouncements/forged'), forged));
});

test('Class Points collections never touch academic grades or evidence', async () => {
  // The ordinary grade document and its evidence subcollection keep exactly
  // the access shape asserted earlier in this file — nothing about Class
  // Points widens or narrows it.
  await assertSucceeds(getDoc(doc(studentA(), 'grades/STUDENT_A')));
  await assertSucceeds(getDoc(doc(teacherA(), 'grades/STUDENT_A')));
  await assertFails(getDoc(doc(teacherB(), 'grades/STUDENT_A')));
});

// --- Practice Pass reward redemptions (Phase 5A) ----------------------------
//
// Only `redeemPracticePass` (Admin SDK) ever writes one of these. What these
// rules have to prove is the read boundary: a student reads only their own,
// the teacher of record for the redemption's own class reads it for roster
// visibility, and nobody — student, teacher, or root administrator — can
// create, edit, or delete one from a client.

test('a student reads their own Practice Pass redemption, never another student\'s', async () => {
  await assertSucceeds(getDoc(doc(studentA(), 'classPointRewardRedemptions/redemption-a')));
  await assertFails(getDoc(doc(studentB(), 'classPointRewardRedemptions/redemption-a')));
});

test('the teacher of record for the redemption\'s class reads it, another teacher cannot', async () => {
  await assertSucceeds(getDoc(doc(teacherA(), 'classPointRewardRedemptions/redemption-a')));
  await assertFails(getDoc(doc(teacherB(), 'classPointRewardRedemptions/redemption-a')));
});

test('the root administrator reads any Practice Pass redemption', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'classPointRewardRedemptions/redemption-a')));
});

test('no client can create, edit, or delete a Practice Pass redemption — not even the root administrator', async () => {
  const forged = {
    schemaVersion: 1, redemptionId: 'forged', rewardCode: 'practicePass',
    studentId: 'STUDENT_A', classId: 'class-a', assignmentId: 'A9',
    assignmentTitle: 'forged', cost: 100, transactionId: 'forged',
    redeemedAt: '2026-09-01T12:00:00.000Z', status: 'redeemed',
  };
  await assertFails(setDoc(doc(studentA(), 'classPointRewardRedemptions/forged'), forged));
  await assertFails(setDoc(doc(teacherA(), 'classPointRewardRedemptions/forged'), forged));
  await assertFails(setDoc(doc(admin(), 'classPointRewardRedemptions/forged'), forged));
  await assertFails(updateDoc(doc(studentA(), 'classPointRewardRedemptions/redemption-a'), { cost: 0 }));
  await assertFails(updateDoc(doc(admin(), 'classPointRewardRedemptions/redemption-a'), { cost: 0 }));
  await assertFails(deleteDoc(doc(studentA(), 'classPointRewardRedemptions/redemption-a')));
  await assertFails(deleteDoc(doc(admin(), 'classPointRewardRedemptions/redemption-a')));
});