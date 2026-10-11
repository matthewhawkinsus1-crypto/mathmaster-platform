import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

import {
  INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS,
  planIntegrityOverrideNoteMigration,
  splitIntegrityConsequence,
} from '../../functions/shared/integrityOverridePrivacy.mjs';

// Integrity-zero notes, through the real Security Rules in the Firestore
// emulator (`npm run test:rules`).
//
// An integrity zero lives on grades/{studentId}, which the student reads. The
// teacher's note, who acted and the participant role must reach the teacher
// and never the student. Proven here by the database, not by a screen:
//   * the grade doc, as the callable now writes it and as the migration
//     leaves an old one, holds none of them — the student's own read of it
//     carries the zero and the fixed reason only;
//   * the teacher-only incident that holds them refuses the student's get
//     and every list the student could try, and refuses another teacher;
//   * the authorized teacher reads the note and the actor;
//   * the audit copy is unreadable from any client;
//   * a student cannot write a note back onto the override map.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against the same emulator.

const PROJECT = 'mathmaster-integrity-notes-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const NOTE = 'Copied from Jordan B. (S_B) during the quiz.';
const ACTOR = { uid: 'uid-ta', email: TEACHER_A, name: 'Ms. A' };
const NOW = '2026-10-10T12:00:00.000Z';

// The emulator the suite runs against: emulators:exec sets this.
const [emulatorHost, emulatorPort] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');

let env;
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();

const teacherOnlyKeysIn = (value) => {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    Object.entries(node).forEach(([key, child]) => {
      if (INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS.includes(key)) found.push(key);
      visit(child);
    });
  };
  visit(value);
  return found;
};

const legacyZero = {
  active: true, score: 0, reasonCode: 'academicDishonesty', reason: 'Unauthorized assistance / cheating', note: NOTE,
  source: 'teacher-assignment-zero', participantRole: 'supplied', incidentId: 'inc-legacy', actor: ACTOR, at: NOW,
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: emulatorHost,
      port: Number(emulatorPort),
    },
  });
  await env.clearFirestore();

  // A new zero, exactly as overrideStudentAssignmentGrade splits it.
  const { studentOverride, incidentDetails } = splitIntegrityConsequence({
    scope: 'assignment', reasonCode: 'academicDishonesty', reasonLabel: 'Unauthorized assistance / cheating',
    participantRole: 'supplied', note: NOTE, actor: ACTOR, incidentId: 'inc-new', at: NOW,
  });
  // An old zero, after the migration's plan has been applied.
  const legacyGrade = { teacherGradeOverridesByAssignment: { A2: { __assignment: legacyZero } } };
  const legacyIncident = {
    kind: 'academicIntegrityIncident', studentId: 'S_A', authorizedTeacherEmails: [TEACHER_A], note: NOTE,
    evidence: { scope: 'assignment', incidentReason: 'academicDishonesty', participantRole: 'supplied' },
  };
  const plan = planIntegrityOverrideNoteMigration({
    studentId: 'S_A', gradeData: legacyGrade, incidentsById: { 'inc-legacy': legacyIncident }, nowIso: NOW,
  });
  assert.equal(plan.assignments.length, 1);

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), {
      classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {},
      teacherGradeOverridesByAssignment: { A1: { __assignment: studentOverride }, A2: plan.assignments[0].nextOverrides },
    });
    await setDoc(doc(db, 'studentSupportEvents/inc-new'), {
      kind: 'academicIntegrityIncident', studentId: 'S_A', classId: 'class-a', authorizedTeacherEmails: [TEACHER_A],
      createdByEmail: TEACHER_A, note: incidentDetails.note, actor: incidentDetails.actor,
      evidence: { scope: 'assignment', incidentReason: 'academicDishonesty', participantRole: incidentDetails.participantRole },
    });
    const filled = plan.incidentWrites.find((write) => write.incidentId === 'inc-legacy');
    await setDoc(doc(db, 'studentSupportEvents/inc-legacy'), { ...legacyIncident, ...filled.data });
    await setDoc(doc(db, 'grades/S_A/gradeOverrideAudits/audit-1'), { assignmentId: 'A1', note: NOTE, actor: ACTOR, participantRole: 'supplied' });
  });
});

after(async () => {
  await env?.cleanup();
});

test('the student reads the zero and its fixed reason on their grade doc, and no note, actor or role', async () => {
  const snapshot = await assertSucceeds(getDoc(doc(studentA(), 'grades/S_A')));
  const overrides = snapshot.data().teacherGradeOverridesByAssignment;
  assert.deepEqual(teacherOnlyKeysIn(overrides), [], 'neither the new nor the migrated zero carries a teacher-only field');
  assert.equal(JSON.stringify(snapshot.data()).includes('Jordan'), false);
  assert.equal(JSON.stringify(snapshot.data()).includes(TEACHER_A), true, 'only the roster placement names the teacher');
  for (const assignmentId of ['A1', 'A2']) {
    assert.equal(overrides[assignmentId].__assignment.score, 0);
    assert.equal(overrides[assignmentId].__assignment.reasonCode, 'academicDishonesty');
  }
});

test('the student cannot read the teacher-only incident by get or by any list', async () => {
  const db = studentA();
  await assertFails(getDoc(doc(db, 'studentSupportEvents/inc-new')));
  await assertFails(getDoc(doc(db, 'studentSupportEvents/inc-legacy')));
  await assertFails(getDocs(collection(db, 'studentSupportEvents')));
  await assertFails(getDocs(query(collection(db, 'studentSupportEvents'), where('studentId', '==', 'S_A'))));
  await assertFails(getDocs(query(collection(db, 'studentSupportEvents'), where('authorizedTeacherEmails', 'array-contains', TEACHER_A))));
});

test('the student cannot read the audit copy either', async () => {
  const db = studentA();
  await assertFails(getDoc(doc(db, 'grades/S_A/gradeOverrideAudits/audit-1')));
  await assertFails(getDocs(collection(db, 'grades/S_A/gradeOverrideAudits')));
});

test('the student cannot write a note back onto the override map', async () => {
  await assertFails(updateDoc(doc(studentA(), 'grades/S_A'), { 'teacherGradeOverridesByAssignment.A1.__assignment.note': 'A note the student wrote' }));
});

test('the authorized teacher reads the note, the actor and the role; another teacher cannot', async () => {
  const fresh = await assertSucceeds(getDoc(doc(teacherA(), 'studentSupportEvents/inc-new')));
  assert.equal(fresh.data().note, NOTE);
  assert.equal(fresh.data().actor.email, TEACHER_A);
  assert.equal(fresh.data().evidence.participantRole, 'supplied');
  const migrated = await assertSucceeds(getDoc(doc(teacherA(), 'studentSupportEvents/inc-legacy')));
  assert.equal(migrated.data().note, NOTE);
  assert.equal(migrated.data().actor.uid, 'uid-ta', 'the migration moved the actor here');
  const listed = await assertSucceeds(getDocs(query(collection(teacherA(), 'studentSupportEvents'), where('authorizedTeacherEmails', 'array-contains', TEACHER_A))));
  assert.equal(listed.size, 2);
  await assertFails(getDoc(doc(teacherB(), 'studentSupportEvents/inc-new')));
});
