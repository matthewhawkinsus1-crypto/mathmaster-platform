import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

// A student's DISTRICT (SIS) ID on grades/{studentId}, through the real
// Security Rules in the Firestore emulator (`npm run test:rules`).
//
// The district ID is the number every TEAMS file addresses. A teacher may
// correct it — but only through the audited setStudentSisId callable (Admin
// SDK, which bypasses these rules and checks teacher of record, format and
// duplicates). Proven here, by the database rather than by a screen:
//   * no client — the student, their teacher of record, the root admin — can
//     change, add or remove the district ID or its verification stamp;
//   * no client can create a roster row that already carries one;
//   * ordinary work on the same document still saves.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against the same emulator.

const PROJECT = 'mathmaster-student-district-id-rules';
const TEACHER_A = 'teacher.a@example.test';
const ROOT = 'root.admin@example.test';
const DISTRICT_ID_FIELDS = ['sisStudentId', 'sisStudentIdVerifiedAt', 'sisStudentIdVerifiedBy'];

let env;

const admin = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const studentCorrected = () => env.authenticatedContext('uid-corrected', { role: 'student', studentId: '111111' }).firestore();
const studentLegacy = () => env.authenticatedContext('uid-legacy', { role: 'student', studentId: '444444' }).firestore();

const membership = {
  classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active',
};
// An account made under a mistyped number, whose district ID the server
// already corrected: account 111111, district 222222.
const CORRECTED = {
  ...membership,
  firstName: 'Marisol',
  lastName: 'Testerling',
  displayName: 'Marisol Testerling',
  sisStudentId: '222222',
  sisStudentIdVerifiedAt: 'stamped-by-server',
  sisStudentIdVerifiedBy: TEACHER_A,
  gradesByAssignment: {},
};
// A legacy row with no district ID stored (its account ID stands in).
const LEGACY = {
  ...membership,
  firstName: 'Odile',
  lastName: 'Placeholder',
  displayName: 'Odile Placeholder',
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
    await setDoc(doc(db, 'grades/111111'), CORRECTED);
    await setDoc(doc(db, 'grades/444444'), LEGACY);
  });
});

after(async () => {
  await env?.cleanup();
});

const ownerOf = { 111111: studentCorrected, 444444: studentLegacy };
const writers = (studentId) => [
  ['the student', ownerOf[studentId]],
  ['their teacher of record', teacherA],
  ['the root admin', admin],
];

test('no client can change, add or remove a district ID or its verification — only the callable can', async () => {
  const patches = [
    // Undoing the correction, or moving it anywhere else.
    ['111111', { sisStudentId: '111111' }],
    ['111111', { sisStudentId: '333333' }],
    ['111111', { sisStudentId: deleteField() }],
    ['111111', { sisStudentIdVerifiedBy: 'someone@example.test' }],
    ['111111', { sisStudentIdVerifiedAt: serverTimestamp() }],
    // Giving a legacy row a district ID it does not have.
    ['444444', { sisStudentId: '444444' }],
    ['444444', { sisStudentId: '222222', sisStudentIdVerifiedAt: serverTimestamp(), sisStudentIdVerifiedBy: TEACHER_A }],
  ];
  for (const [studentId, patch] of patches) {
    for (const [who, client] of writers(studentId)) {
      await assertFails(updateDoc(doc(client(), `grades/${studentId}`), patch), `${who}: ${JSON.stringify(Object.keys(patch))} on ${studentId}`);
    }
  }
  // A whole-document rewrite that leaves the district ID out drops it: refused.
  const withoutDistrictId = { ...CORRECTED };
  DISTRICT_ID_FIELDS.forEach((field) => delete withoutDistrictId[field]);
  await assertFails(setDoc(doc(teacherA(), 'grades/111111'), withoutDistrictId));
});

test('no client can create a roster row that already carries a district ID', async () => {
  const base = { ...membership, gradesByAssignment: {} };
  for (const field of DISTRICT_ID_FIELDS) {
    await assertFails(setDoc(doc(teacherA(), 'grades/555555'), { ...base, [field]: field === 'sisStudentId' ? '555555' : 'forged' }));
  }
  // The same row without one creates; only the server stamps a district ID.
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/555555'), base));
});

test('ordinary work on the same document still saves, and the district ID is untouched', async () => {
  await assertSucceeds(updateDoc(doc(studentCorrected(), 'grades/111111'), {
    'assignmentActivity.assignment-1': { totalTimeSeconds: 45 },
  }));
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/111111'), { teacherNoteMarker: 'allowed' }, { merge: true }));
  // Re-sending the same district ID is not a change.
  await assertSucceeds(setDoc(doc(teacherA(), 'grades/111111'), { sisStudentId: '222222' }, { merge: true }));

  const stored = await assertSucceeds(getDoc(doc(teacherA(), 'grades/111111')));
  assert.equal(stored.data().sisStudentId, '222222');
  assert.equal(stored.data().sisStudentIdVerifiedBy, TEACHER_A);
});
