import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// Crash counts (functions/lib/platformHealth.js), through the real Security
// Rules in the Firestore emulator (`npm run test:rules`).
//
//   * platformHealthDaily: the root administrator reads it, exactly as the
//     Platform health view does. No teacher, no student, nobody signed out
//     reads or lists it, and nobody writes it from a browser, the root
//     administrator included.
//   * platformHealthReporters: the per-account rate limit. No browser reads,
//     lists or writes it at all.
//   * platformFlags/crashReporting: every signed-in client may read the mode;
//     no browser changes it (only the root administrator's callable does).
//
// Synthetic identities only. Own projectId: rules suites run in parallel
// against one emulator.

const PROJECT = 'mathmaster-platform-health-rules';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');
const DAY = '2026-11-16';

let env;

const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: 'root.admin@example.test' }).firestore();
const teacher = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: 'teacher.a@example.test' }).firestore();
// A teacher with the admin claim but not the root one is still not the owner.
const adminTeacher = () => env.authenticatedContext('uid-tb', { role: 'teacher', admin: true, email: 'teacher.b@example.test' }).firestore();
const student = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const others = () => [['a teacher', teacher()], ['a teacher with the admin claim only', adminTeacher()], ['a student', student()], ['someone signed out', anonymous()]];
const everyone = () => [['the root administrator', root()], ...others()];

const refused = async (what, request) => {
  try { await assertFails(request); } catch (error) { throw new Error(`${what} was not refused: ${error.message}`); }
};
const allowed = async (what, request) => {
  try { await assertSucceeds(request); } catch (error) { throw new Error(`${what} was refused: ${error.message}`); }
};

const recentDays = (db) => query(collection(db, 'platformHealthDaily'), orderBy('day', 'desc'), limit(14));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: HOST, port: Number(PORT) },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `platformHealthDaily/${DAY}`), {
      schema: 1, day: DAY, total: 3, overflow: 0,
      buckets: { '0123456789abcdef': { build: 'bad3df73a1b2', kind: 'question-module-error', source: 'question', role: 'student', screen: '/assignments/:id/:id/:id', family: 'radical-step', questionType: 'StepByStepAlgebra', signature: '_ is not a function', count: 3, reporters: 2, firstHour: 15, lastHour: 15 } },
    });
    await setDoc(doc(db, `platformHealthReporters/${DAY}_0123456789abcdef0123456789abcdef`), { day: DAY, calls: 1, seen: ['0123456789abcdef'] });
    await setDoc(doc(db, 'platformFlags/crashReporting'), { mode: 'family' });
  });
});

after(async () => {
  await env?.cleanup();
});

test('the daily counts: the root administrator reads them the way the Platform health view does', async () => {
  await allowed('the root administrator reading a day', getDoc(doc(root(), `platformHealthDaily/${DAY}`)));
  const snapshot = await assertSucceeds(getDocs(recentDays(root())));
  assert.equal(snapshot.size, 1);
});

test('the daily counts: no teacher, student or signed-out visitor reads or lists them', async () => {
  for (const [who, db] of others()) {
    await refused(`${who} reading a day of crash counts`, getDoc(doc(db, `platformHealthDaily/${DAY}`)));
    await refused(`${who} reading a day that does not exist`, getDoc(doc(db, 'platformHealthDaily/2020-01-01')));
    await refused(`${who} listing crash counts`, getDocs(collection(db, 'platformHealthDaily')));
    await refused(`${who} listing crash counts the way the view does`, getDocs(recentDays(db)));
    await refused(`${who} listing crash counts by day`, getDocs(query(collection(db, 'platformHealthDaily'), where('day', '==', DAY))));
  }
});

test('the daily counts: nobody writes them from a browser, the root administrator included', async () => {
  for (const [who, db] of everyone()) {
    await refused(`${who} creating a day`, setDoc(doc(db, 'platformHealthDaily/2026-11-17'), { day: '2026-11-17', total: 999, buckets: {} }));
    await refused(`${who} editing a day`, updateDoc(doc(db, `platformHealthDaily/${DAY}`), { total: 0 }));
    await refused(`${who} deleting a day`, deleteDoc(doc(db, `platformHealthDaily/${DAY}`)));
  }
});

test('the rate-limit records: no browser reads, lists or writes one', async () => {
  const path = `platformHealthReporters/${DAY}_0123456789abcdef0123456789abcdef`;
  for (const [who, db] of everyone()) {
    await refused(`${who} reading a rate-limit record`, getDoc(doc(db, path)));
    await refused(`${who} listing rate-limit records`, getDocs(collection(db, 'platformHealthReporters')));
    await refused(`${who} creating a rate-limit record`, setDoc(doc(db, 'platformHealthReporters/forged'), { day: DAY, calls: 0 }));
    await refused(`${who} resetting a rate-limit record`, updateDoc(doc(db, path), { calls: 0 }));
    await refused(`${who} deleting a rate-limit record`, deleteDoc(doc(db, path)));
  }
});

test('the reporting switch: signed-in clients read it, and no browser turns reporting on or off', async () => {
  await allowed('a student reading the switch', getDoc(doc(student(), 'platformFlags/crashReporting')));
  await refused('someone signed out reading the switch', getDoc(doc(anonymous(), 'platformFlags/crashReporting')));
  for (const [who, db] of everyone()) {
    await refused(`${who} turning reporting to question detail`, setDoc(doc(db, 'platformFlags/crashReporting'), { mode: 'question' }));
    await refused(`${who} turning reporting off`, updateDoc(doc(db, 'platformFlags/crashReporting'), { mode: 'off' }));
    await refused(`${who} deleting the switch`, deleteDoc(doc(db, 'platformFlags/crashReporting')));
  }
});
