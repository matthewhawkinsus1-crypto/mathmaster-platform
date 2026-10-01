import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

import { SERVER_OWNED_IDENTITY_FIELDS } from '../../functions/shared/studentIdentity.mjs';

// A student's NAME on grades/{studentId}, through the real Security Rules in
// the Firestore emulator (`npm run test:rules`).
//
// The canonical name, every legacy/Google copy the name resolver reads, the
// Google identity a Classroom link copies, and the provenance of a correction
// or backfill (SERVER_OWNED_IDENTITY_FIELDS) are written only by audited Admin
// SDK callables. Proven here, by the database rather than by a screen:
//   * no client — the student, their teacher of record, the root admin — can
//     change, add or remove any of them on an existing row;
//   * no client can create a row that already carries one;
//   * ordinary work on the same document still saves.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against the same emulator.

const PROJECT = 'mathmaster-student-identity-rules';
const TEACHER_A = 'teacher.a@example.test';
const ROOT = 'root.admin@example.test';

let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const studentNamed = () => env.authenticatedContext('uid-named', { role: 'student', studentId: 'S_NAMED' }).firestore();
const studentLegacy = () => env.authenticatedContext('uid-legacy', { role: 'student', studentId: 'S_LEGACY' }).firestore();

const membership = {
  classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active',
};
const NAMED = {
  ...membership,
  firstName: 'Rowan',
  lastName: 'Exampleton',
  displayName: 'Rowan Exampleton',
  gradesByAssignment: {},
};
// A Classroom-linked legacy row whose ONLY name is the Google copy.
const LEGACY = {
  ...membership,
  googleName: 'Quinn Samplewood',
  googleEmail: 'quinn.samplewood@example.test',
  googleUserId: 'g-quinn',
  identityBackfill: { runId: 'run-1', source: 'googleName', filledFields: ['displayName'], version: 1 },
  gradesByAssignment: {},
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
    await setDoc(doc(db, 'grades/S_NAMED'), NAMED);
    await setDoc(doc(db, 'grades/S_LEGACY'), LEGACY);
  });
});

after(async () => {
  await env?.cleanup();
});

const ownerOf = { S_NAMED: studentNamed, S_LEGACY: studentLegacy };
const writers = (studentId) => [
  ['the student', ownerOf[studentId]],
  ['their teacher of record', teacherA],
  ['the root admin', admin],
];

test('no client can rewrite a student\'s name, Google name or backfill provenance', async () => {
  const rewrites = [
    ['S_NAMED', { displayName: '101410' }],
    ['S_NAMED', { firstName: 'Someone' }],
    ['S_NAMED', { lastName: 'Else' }],
    ['S_LEGACY', { googleName: 'Another Person' }],
    ['S_LEGACY', { identityBackfill: deleteField() }],
    ['S_LEGACY', { googleEmail: 'other@example.test' }],
    ['S_LEGACY', { googleUserId: 'g-other' }],
  ];
  for (const [studentId, patch] of rewrites) {
    for (const [, client] of writers(studentId)) {
      await assertFails(updateDoc(doc(client(), `grades/${studentId}`), patch));
    }
  }
});

test('erasing a name, or adding one a row did not have, is a change too', async () => {
  for (const [, client] of writers('S_LEGACY')) {
    // Removing the only name a legacy record has.
    await assertFails(updateDoc(doc(client(), 'grades/S_LEGACY'), { googleName: deleteField() }));
    // Writing a name onto a row the server has not named.
    await assertFails(updateDoc(doc(client(), 'grades/S_LEGACY'), { displayName: 'Quinn Samplewood' }));
    await assertFails(updateDoc(doc(client(), 'grades/S_LEGACY'), { name: 'Quinn Samplewood' }));
    await assertFails(updateDoc(doc(client(), 'grades/S_LEGACY'), {
      nameUpdatedAt: serverTimestamp(), nameUpdatedBy: TEACHER_A,
    }));
  }
  // A whole-document rewrite that simply leaves the name out drops it.
  const withoutName = { ...NAMED };
  delete withoutName.firstName;
  delete withoutName.lastName;
  delete withoutName.displayName;
  await assertFails(setDoc(doc(studentNamed(), 'grades/S_NAMED'), withoutName));
  // The same rewrite with the name kept as it is goes through: the name was
  // the only reason it was refused.
  await assertSucceeds(setDoc(doc(studentNamed(), 'grades/S_NAMED'), NAMED));
});

test('ordinary work on the same document still saves, and the name is untouched', async () => {
  await assertSucceeds(updateDoc(doc(studentNamed(), 'grades/S_NAMED'), {
    gradesByAssignment: { 'assignment-1': { 0: { status: 'correct' } } },
  }));
  await assertSucceeds(updateDoc(doc(studentLegacy(), 'grades/S_LEGACY'), {
    'assignmentActivity.assignment-1': { totalTimeSeconds: 30 },
  }));
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/S_NAMED'), { teacherNoteMarker: 'allowed' }, { merge: true }));
  // Re-sending the same value is not a change.
  await assertSucceeds(setDoc(doc(studentNamed(), 'grades/S_NAMED'), { displayName: 'Rowan Exampleton' }, { merge: true }));

  const named = await assertSucceeds(getDoc(doc(studentNamed(), 'grades/S_NAMED')));
  assert.equal(named.data().displayName, 'Rowan Exampleton');
  const legacy = await assertSucceeds(getDoc(doc(teacherA(), 'grades/S_LEGACY')));
  assert.equal(legacy.data().googleName, 'Quinn Samplewood');
});

test('no client can create a roster row that already carries a name or Google identity', async () => {
  const studentNew = () => env.authenticatedContext('uid-new', { role: 'student', studentId: 'S_NEW' }).firestore();
  const base = { ...membership, gradesByAssignment: {} };
  for (const field of SERVER_OWNED_IDENTITY_FIELDS) {
    const value = field === 'identityBackfill' ? { runId: 'forged' } : 'Rowan Exampleton';
    await assertFails(setDoc(doc(studentNew(), 'grades/S_NEW'), { ...base, [field]: value }));
    await assertFails(setDoc(doc(teacherA(), 'grades/S_NEW_T'), { ...base, [field]: value }));
  }
  // A row with no name fields still creates; the server names it.
  await assertSucceeds(setDoc(doc(studentNew(), 'grades/S_NEW'), base));
});
