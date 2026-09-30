import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

import { buildRevisionDocument, normalizeSupportRevisionInput } from '../../functions/shared/supportProfileModel.mjs';
import {
  buildServiceLogEntry, buildStaffEvidenceEvent, buildStudentEvidenceEvent,
  engagementDocId, epochMinuteOf, utcDayOf,
} from '../../functions/shared/supportEvidenceModel.mjs';

// The IEP / student support evidence records, through the real Security Rules
// in the Firestore emulator (`npm run test:rules`).
//
// These records are sensitive educational records and the evidence a teacher
// may hand to an ARD committee or a parent. What is proven here, by the
// database rather than by a screen:
//   * a student cannot grant, remove or backdate their own supports;
//   * a student cannot read the privileged profile history or staff evidence;
//   * nobody can edit or delete a profile revision, an evidence event, a
//     service entry, or an engagement minute once written;
//   * every record carries server time, names its author, and is filed under
//     the student's real teacher and class;
//   * a student's client may record only platform telemetry about supports
//     they are actually entitled to, and only the minute the server clock is in.
//
// Synthetic identities only. A separate projectId keeps this suite's data
// apart from tests/rules/securityRules.test.mjs, which node --test runs in
// parallel against the same emulator.

const PROJECT = 'mathmaster-support-evidence-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const ROOT = 'root.admin@example.test';

let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();
const studentInclusion = () => env.authenticatedContext('uid-si', { role: 'student', studentId: 'S_INC' }).firestore();
const studentNew = () => env.authenticatedContext('uid-sn', { role: 'student', studentId: 'S_NEW' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const PROFILE_A = {
  inclusionStatus: false,
  accommodations: ['text-to-speech', 'calculator', 'extra-time'],
  modifications: ['reduce-complexity'],
  translationLanguage: null,
  supportPlan: {
    schemaVersion: 1,
    windows: [{ revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null }],
    entitledIds: ['calculator', 'extra-time', 'graph-paper', 'reduce-complexity', 'text-to-speech'],
    updatedAt: '2026-09-01T12:00:00.000Z',
  },
};

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
    await setDoc(doc(db, 'grades/S_A'), { classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {}, profile: PROFILE_A });
    await setDoc(doc(db, 'grades/S_B'), { classId: 'class-b', classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_B, status: 'active', gradesByAssignment: {}, profile: {} });
    await setDoc(doc(db, 'grades/S_INC'), { classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {}, profile: { inclusionStatus: true, accommodations: [], modifications: [] } });
    await setDoc(doc(db, 'grades/S_UNPLACED'), { classId: null, classPeriod: 'Unassigned', assignedTeacherEmail: null, status: 'active', gradesByAssignment: {} });
    await setDoc(doc(db, 'grades/S_A/supportEvidence/seeded'), { studentId: 'S_A', authorizedTeacherEmails: [TEACHER_A] });
    await setDoc(doc(db, 'grades/S_A/supportServiceLog/seeded'), { studentId: 'S_A', authorizedTeacherEmails: [TEACHER_A] });
    await setDoc(doc(db, 'grades/S_A/supportProfileRevisions/seeded'), { studentId: 'S_A', authorizedTeacherEmails: [TEACHER_A] });
  });
});

after(async () => {
  await env?.cleanup();
});

// --- The roster row's profile ---------------------------------------------------------

test('a student cannot grant, remove or rewrite their own support profile', async () => {
  await assertFails(updateDoc(doc(studentA(), 'grades/S_A'), { 'profile.accommodations': arrayUnion('calculator-override-computation') }));
  await assertFails(updateDoc(doc(studentA(), 'grades/S_A'), { 'profile.accommodations': arrayRemove('text-to-speech') }));
  await assertFails(updateDoc(doc(studentA(), 'grades/S_A'), { 'profile.supportPlan.entitledIds': ['calculator-override-computation'] }));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A'), { profile: {} }, { merge: true }));
  // Ordinary work keeps saving exactly as before.
  await assertSucceeds(updateDoc(doc(studentA(), 'grades/S_A'), { 'assignmentActivity.A1': { totalTimeSeconds: 30 } }));
});

test('the teacher of record writes the profile; another teacher cannot', async () => {
  await assertSucceeds(updateDoc(doc(teacherA(), 'grades/S_A'), { profile: PROFILE_A }));
  await assertFails(updateDoc(doc(teacherB(), 'grades/S_A'), { profile: {} }));
  await assertSucceeds(updateDoc(doc(admin(), 'grades/S_A'), { profile: PROFILE_A }));
});

test('a student cannot create their own roster row already carrying supports', async () => {
  await assertFails(setDoc(doc(studentNew(), 'grades/S_NEW'), { gradesByAssignment: {}, profile: { accommodations: ['calculator'] } }));
  await assertSucceeds(setDoc(doc(studentNew(), 'grades/S_NEW'), { gradesByAssignment: {} }));
});

// --- Profile revisions (privileged, immutable) ------------------------------------------

const revisionBody = (overrides = {}) => {
  const { revision } = normalizeSupportRevisionInput({
    effectiveStart: '2026-08-17',
    sourceLabel: 'IEP — annual review',
    sourceNote: 'teacher-only note',
    accommodations: [{ id: 'text-to-speech' }],
    modifications: [],
    serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 100 }],
  });
  return {
    ...buildRevisionDocument({ revision, studentId: 'S_A', classId: 'class-a', revisionNumber: 1, createdByEmail: TEACHER_A }),
    createdAt: serverTimestamp(),
    ...overrides,
  };
};

test('the teacher of record records a revision with server time and their own name on it', async () => {
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/rev-1'), revisionBody()));
  // Undated only as the one-time snapshot of a pre-versioning profile.
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/rev-legacy'), revisionBody({ legacySnapshot: true, effectiveStart: null, revision: 0 })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/rev-undated'), revisionBody({ effectiveStart: null })));
});

test('a revision cannot carry a client clock, another author, extra fields or another class', async () => {
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/r-time'), revisionBody({ createdAt: Timestamp.fromMillis(Date.parse('2026-01-01T00:00:00Z')) })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/r-author'), revisionBody({ createdByEmail: TEACHER_B })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/r-grant'), revisionBody({ authorizedTeacherEmails: [TEACHER_A, TEACHER_B] })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/r-extra'), revisionBody({ diagnosis: 'not a field' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/r-class'), revisionBody({ classId: 'class-b' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/r-student'), revisionBody({ studentId: 'S_B' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/r-nosource'), revisionBody({ sourceLabel: '' })));
});

test('revisions are private to staff who teach the student, and immutable', async () => {
  await assertFails(setDoc(doc(teacherB(), 'grades/S_A/supportProfileRevisions/r-b'), { ...revisionBody(), createdByEmail: TEACHER_B, authorizedTeacherEmails: [TEACHER_B] }));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportProfileRevisions/r-s'), revisionBody()));
  await assertSucceeds(getDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/seeded')));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades/S_A/supportProfileRevisions')));
  await assertSucceeds(getDoc(doc(admin(), 'grades/S_A/supportProfileRevisions/seeded')));
  await assertFails(getDoc(doc(teacherB(), 'grades/S_A/supportProfileRevisions/seeded')));
  await assertFails(getDocs(collection(teacherB(), 'grades/S_A/supportProfileRevisions')));
  await assertFails(getDoc(doc(studentA(), 'grades/S_A/supportProfileRevisions/seeded')));
  await assertFails(getDocs(collection(studentA(), 'grades/S_A/supportProfileRevisions')));
  await assertFails(getDoc(doc(anonymous(), 'grades/S_A/supportProfileRevisions/seeded')));
  await assertFails(updateDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/seeded'), { sourceLabel: 'rewritten' }));
  await assertFails(deleteDoc(doc(teacherA(), 'grades/S_A/supportProfileRevisions/seeded')));
  await assertFails(deleteDoc(doc(admin(), 'grades/S_A/supportProfileRevisions/seeded')));
});

// --- Support evidence events -------------------------------------------------------------

const staffEvent = (overrides = {}, input = {}) => ({
  ...buildStaffEvidenceEvent({
    studentId: 'S_A', classId: 'class-a', assignmentId: 'A1', supportId: 'check-for-understanding',
    actorEmail: TEACHER_A, profileRevisionId: 'r1', ...input,
  }).payload,
  occurredAt: serverTimestamp(),
  ...overrides,
});

const studentEvent = (overrides = {}, input = {}) => ({
  ...buildStudentEvidenceEvent({
    studentId: 'S_A', classId: 'class-a', assignmentId: 'A1', supportId: 'text-to-speech', eventType: 'used',
    assignedTeacherEmail: TEACHER_A, profileRevisionId: 'r1', activityRole: 'classwork', questionIndex: 2, ...input,
  }).payload,
  occurredAt: serverTimestamp(),
  ...overrides,
});

test('a one-click classroom action is recorded immediately, with no note required', async () => {
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/click-1'), staffEvent()));
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/click-note'), staffEvent({ note: 'Re-read the task aloud.' })));
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/provider-1'), staffEvent({}, {
    supportId: 'inclusion-support', actorType: 'provider', providerRole: 'inclusion-teacher', eventType: 'provider-documented',
  })));
  await assertSucceeds(setDoc(doc(admin(), 'grades/S_A/supportEvidence/root-1'), staffEvent({ actorEmail: ROOT, authorizedTeacherEmails: [ROOT] })));
});

test('staff cannot claim a student use, a client clock, another author, another class, or a provider with no role', async () => {
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-used'), staffEvent({ eventType: 'used' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-telemetry'), staffEvent({ source: 'automatic-telemetry' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-time'), staffEvent({ occurredAt: Timestamp.fromMillis(Date.parse('2026-09-01T12:00:00Z')) })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-author'), staffEvent({ actorEmail: TEACHER_B })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-class'), staffEvent({ classId: 'class-b' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-provider'), staffEvent({ actorType: 'provider', providerRole: null, eventType: 'provider-documented' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-long'), staffEvent({ note: 'x'.repeat(281) })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/s-extra'), staffEvent({ diagnosis: 'not a field' })));
  await assertFails(setDoc(doc(teacherB(), 'grades/S_A/supportEvidence/s-other'), staffEvent({ actorEmail: TEACHER_B, authorizedTeacherEmails: [TEACHER_B] })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_B/supportEvidence/s-not-mine'), staffEvent({ studentId: 'S_B', classId: 'class-b' })));
});

test('a student records use of a support they are entitled to — platform telemetry only', async () => {
  await assertSucceeds(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/tts-1'), studentEvent()));
  await assertSucceeds(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/avail-1'), studentEvent({}, { eventType: 'available', supportId: 'calculator' })));
  await assertSucceeds(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/mod-1'), studentEvent({}, { eventType: 'provided', supportId: 'reduce-complexity' })));
  // Entitled through the versioned plan (a future or current window).
  await assertSucceeds(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/graph-1'), studentEvent({}, { supportId: 'graph-paper' })));
  // Inclusion status implies its presentation supports.
  await assertSucceeds(setDoc(doc(studentInclusion(), 'grades/S_INC/supportEvidence/inc-1'), studentEvent({ studentId: 'S_INC' }, { studentId: 'S_INC', supportId: 'declutter-ui', eventType: 'provided' })));
});

test('a student cannot forge staff facts, unentitled supports, another teacher, class, student or time', async () => {
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-unentitled'), studentEvent({}, { supportId: 'calculator-override-computation' })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-implied'), studentEvent({}, { supportId: 'declutter-ui', eventType: 'provided' })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-staff'), studentEvent({ eventType: 'teacher-documented' })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-source'), studentEvent({ source: 'teacher-click' })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-note'), studentEvent({ note: 'I used it a lot' })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-actor'), studentEvent({ actorEmail: TEACHER_A })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-teacher'), studentEvent({ authorizedTeacherEmails: [TEACHER_B] })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-noteacher'), studentEvent({ authorizedTeacherEmails: [] })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-class'), studentEvent({ classId: 'class-b' })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/f-time'), studentEvent({ occurredAt: Timestamp.fromMillis(Date.parse('2026-09-01T12:00:00Z')) })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_B/supportEvidence/f-other'), studentEvent({ studentId: 'S_B', classId: 'class-b', authorizedTeacherEmails: [TEACHER_B] })));
  await assertFails(setDoc(doc(studentB(), 'grades/S_A/supportEvidence/f-cross'), studentEvent()));
});

test('evidence is immutable, a relaunch cannot duplicate it, and a student cannot read staff evidence', async () => {
  await assertSucceeds(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/avail__A1__r1__text-to-speech'), studentEvent({}, { eventType: 'available' })));
  // Second tab / relaunch: the same deterministic id is an update, refused.
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/avail__A1__r1__text-to-speech'), studentEvent({}, { eventType: 'available' })));
  await assertFails(updateDoc(doc(teacherA(), 'grades/S_A/supportEvidence/seeded'), { note: 'rewritten' }));
  await assertFails(deleteDoc(doc(teacherA(), 'grades/S_A/supportEvidence/seeded')));
  await assertFails(deleteDoc(doc(admin(), 'grades/S_A/supportEvidence/seeded')));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades/S_A/supportEvidence')));
  await assertSucceeds(getDoc(doc(admin(), 'grades/S_A/supportEvidence/seeded')));
  await assertFails(getDocs(collection(teacherB(), 'grades/S_A/supportEvidence')));
  await assertFails(getDoc(doc(studentA(), 'grades/S_A/supportEvidence/seeded')));
  await assertFails(getDocs(collection(studentA(), 'grades/S_A/supportEvidence')));
});

// --- Service / support log -----------------------------------------------------------------

const serviceEntry = (overrides = {}, input = {}) => ({
  ...buildServiceLogEntry({
    studentId: 'S_A', classId: 'class-a', dateKey: '2026-09-28', startTime: '10:05', endTime: '10:50',
    serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', providerLabel: 'Inclusion teacher',
    topic: 'Linear equations', createdByEmail: TEACHER_A, ...input,
  }).payload,
  createdAt: serverTimestamp(),
  ...overrides,
});

test('staff log recorded service minutes; a correction is a new entry', async () => {
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-1'), serviceEntry()));
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-void'), serviceEntry({ minutes: 0, startMinute: null, endMinute: null, voidsEntryId: 'e-1' })));
  // Only your own entry, and only one that exists.
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-void-seeded'), serviceEntry({ minutes: 0, startMinute: null, endMinute: null, voidsEntryId: 'seeded' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-void-missing'), serviceEntry({ minutes: 0, startMinute: null, endMinute: null, voidsEntryId: 'no-such-entry' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-zero'), serviceEntry({ minutes: 0, startMinute: null, endMinute: null })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-huge'), serviceEntry({ minutes: 601, startMinute: null, endMinute: null })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-type'), serviceEntry({ serviceType: 'text-to-speech' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-role'), serviceEntry({ providerRole: 'parent' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-time'), serviceEntry({ createdAt: Timestamp.fromMillis(Date.parse('2026-09-28T15:00:00Z')) })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/e-author'), serviceEntry({ createdByEmail: TEACHER_B })));
});

test('the service log is staff-only and immutable', async () => {
  await assertFails(setDoc(doc(teacherB(), 'grades/S_A/supportServiceLog/e-b'), serviceEntry({ createdByEmail: TEACHER_B, authorizedTeacherEmails: [TEACHER_B] })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportServiceLog/e-s'), serviceEntry()));
  await assertFails(getDocs(collection(studentA(), 'grades/S_A/supportServiceLog')));
  await assertFails(getDocs(collection(teacherB(), 'grades/S_A/supportServiceLog')));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades/S_A/supportServiceLog')));
  await assertFails(updateDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/seeded'), { minutes: 90 }));
  await assertFails(deleteDoc(doc(teacherA(), 'grades/S_A/supportServiceLog/seeded')));
});

// --- Active-engagement minute ledger ---------------------------------------------------------

const ledgerWrite = (db, { minutes, assignmentId = 'A1', utcDay = utcDayOf(Date.now()), id = null } = {}) => setDoc(
  doc(db, `grades/S_A/engagementMinutes/${id || engagementDocId(assignmentId, utcDay)}`),
  { schemaVersion: 1, studentId: 'S_A', assignmentId, utcDay, minutes, lastRecordedAt: serverTimestamp() },
  { merge: true },
);

test('a student records the minute the server clock is in, and a second tab changes nothing', async () => {
  const now = epochMinuteOf(Date.now());
  await assertSucceeds(ledgerWrite(studentA(), { minutes: arrayUnion(now) }));
  await assertSucceeds(ledgerWrite(studentA(), { minutes: arrayUnion(epochMinuteOf(Date.now())) }));
  const stored = await getDoc(doc(teacherA(), `grades/S_A/engagementMinutes/${engagementDocId('A1', utcDayOf(Date.now()))}`));
  if (stored.data().minutes.length > 2) throw new Error('the same minute was stored more than once');
});

test('minutes cannot be backdated, pre-filled, removed, or filed under another id or student', async () => {
  const now = epochMinuteOf(Date.now());
  await assertFails(ledgerWrite(studentA(), { minutes: arrayUnion(now - 10) }));
  await assertFails(ledgerWrite(studentA(), { minutes: arrayUnion(now + 5) }));
  await assertFails(ledgerWrite(studentA(), { assignmentId: 'A2', minutes: [now, now - 1, now - 2] }));
  await assertFails(ledgerWrite(studentA(), { minutes: arrayRemove(now) }));
  await assertFails(ledgerWrite(studentA(), { assignmentId: 'A3', minutes: arrayUnion(now), id: 'A3__1' }));
  await assertFails(ledgerWrite(studentA(), { assignmentId: 'A4', minutes: arrayUnion(now), utcDay: utcDayOf(Date.now()) - 3 }));
  await assertFails(setDoc(doc(studentB(), `grades/S_A/engagementMinutes/${engagementDocId('A5', utcDayOf(Date.now()))}`), {
    schemaVersion: 1, studentId: 'S_A', assignmentId: 'A5', utcDay: utcDayOf(Date.now()), minutes: [now], lastRecordedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(studentA(), `grades/S_A/engagementMinutes/${engagementDocId('A6', utcDayOf(Date.now()))}`), {
    schemaVersion: 1, studentId: 'S_A', assignmentId: 'A6', utcDay: utcDayOf(Date.now()), minutes: [now], lastRecordedAt: Timestamp.fromMillis(Date.now() - 3600000),
  }));
});

test('the ledger is readable by the teacher of record only, and never deleted', async () => {
  const id = engagementDocId('A1', utcDayOf(Date.now()));
  await assertSucceeds(getDoc(doc(teacherA(), `grades/S_A/engagementMinutes/${id}`)));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades/S_A/engagementMinutes')));
  await assertFails(getDocs(collection(teacherB(), 'grades/S_A/engagementMinutes')));
  await assertFails(getDoc(doc(studentB(), `grades/S_A/engagementMinutes/${id}`)));
  await assertFails(setDoc(doc(teacherA(), `grades/S_A/engagementMinutes/${id}`), { minutes: arrayUnion(epochMinuteOf(Date.now())) }, { merge: true }));
  await assertFails(deleteDoc(doc(studentA(), `grades/S_A/engagementMinutes/${id}`)));
  await assertFails(deleteDoc(doc(admin(), `grades/S_A/engagementMinutes/${id}`)));
});

// --- Attempt evidence is server-only ------------------------------------------------------

test('a student can no longer mint attempt evidence, however well formed', async () => {
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/evidenceEvents/forged'), {
    eventKey: 'forged', studentId: 'S_A', occurredAt: 1, authorizedTeacherEmails: [TEACHER_A],
    performance: { score: 1 }, isCorrect: true,
  }));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/evidenceEvents/forged-t'), { eventKey: 'forged-t', studentId: 'S_A' }));
});

// --- Corrections and notes added after a one-click action ------------------------------------

test('staff withdraw their own mis-click with a correction record; nobody withdraws someone else\'s', async () => {
  // click-1 was written by teacher A earlier in this file; root-1 by the root administrator.
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/fix-1'), staffEvent({ voidsEventId: 'click-1', note: 'Entered in error' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/fix-other'), staffEvent({ voidsEventId: 'root-1', note: 'Entered in error' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/fix-missing'), staffEvent({ voidsEventId: 'no-such-record', note: 'Entered in error' })));
  await assertFails(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/fix-telemetry'), staffEvent({ voidsEventId: 'tts-1', note: 'Entered in error' })));
  await assertFails(setDoc(doc(studentA(), 'grades/S_A/supportEvidence/fix-s'), studentEvent({ voidsEventId: 'tts-1' })));
});

test('the author may add a note once, soon after, and nothing else about the record can change', async () => {
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_A/supportEvidence/click-note-later'), staffEvent()));
  const ref = (db) => doc(db, 'grades/S_A/supportEvidence/click-note-later');
  // Another teacher, a student, or a changed fact: refused. The root
  // administrator can reach every student but is not the author, so only the
  // author check can refuse them.
  await assertFails(updateDoc(ref(admin()), { note: 'x', noteAddedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref(teacherB()), { note: 'x', noteAddedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref(studentA()), { note: 'x', noteAddedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref(teacherA()), { note: 'x', noteAddedAt: serverTimestamp(), supportId: 'on-task-prompt' }));
  await assertFails(updateDoc(ref(teacherA()), { note: 'x', noteAddedAt: Timestamp.fromMillis(Date.now() - 60000) }));
  await assertFails(updateDoc(ref(teacherA()), { note: '', noteAddedAt: serverTimestamp() }));
  // The author, once.
  await assertSucceeds(updateDoc(ref(teacherA()), { note: 'Re-read the directions aloud.', noteAddedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref(teacherA()), { note: 'Changed my mind', noteAddedAt: serverTimestamp() }));
  // Not a student record, and not after the window.
  await assertFails(updateDoc(doc(teacherA(), 'grades/S_A/supportEvidence/tts-1'), { note: 'x', noteAddedAt: serverTimestamp() }));
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'grades/S_A/supportEvidence/stale-click'), {
      ...staffEvent(), occurredAt: Timestamp.fromMillis(Date.now() - 20 * 60000),
    });
  });
  await assertFails(updateDoc(doc(teacherA(), 'grades/S_A/supportEvidence/stale-click'), { note: 'late note', noteAddedAt: serverTimestamp() }));
});
