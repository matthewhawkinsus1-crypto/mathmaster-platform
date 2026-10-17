import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// The Live Challenge server sweep's state, through the real Security Rules in
// the Firestore emulator (`npm run test:rules`).
//
//   * liveChallengePrivate — where a room's due time (serverSweepDueAt) and
//     its host's heartbeat (hostHeardAt) live, beside its question ids and
//     roster — is server-only: no teacher, student or administrator reads it,
//     queries it the way the sweep does, or writes a heartbeat or due time;
//   * the sweep's switch (platformFlags/liveChallengeServerSweep) is readable
//     by signed-in users and writable by no client, so nobody but the server
//     (an operator through the Admin SDK) can turn the sweep or its finish on
//     or off.
//
// Synthetic identities only. Own projectId: rules suites run in parallel.

const PROJECT = 'mathmaster-live-challenge-sweep-rules';
const TEACHER = 'sweep.teacher@example.test';
const ROOM = 'room-sweep-1';

let env;

const teacher = () => env.authenticatedContext('uid-t', { role: 'teacher', email: TEACHER }).firestore();
const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: 'root.admin@example.test' }).firestore();
const student = () => env.authenticatedContext('uid-s', { role: 'student', studentId: 'S_1' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `liveChallengePrivate/${ROOM}`), {
      roomId: ROOM, teacherEmail: TEACHER, serverSweepDueAt: new Date(0), hostHeardAt: new Date(0), questionIds: ['q1'],
    });
    // The student is invited: the room itself is theirs to read, its private state never.
    await setDoc(doc(db, 'liveChallengeInvites/S_1'), { roomId: ROOM, teacherEmail: TEACHER, status: 'running' });
    await setDoc(doc(db, 'platformFlags/liveChallengeServerSweep'), { enabled: true, finishAbandonedGames: false });
  });
});

after(async () => {
  await env?.cleanup();
});

const dueQuery = (db) => getDocs(query(
  collection(db, 'liveChallengePrivate'), where('serverSweepDueAt', '<=', new Date()), orderBy('serverSweepDueAt'), limit(25),
));

test("a room's private state, due time and heartbeat are the server's alone", async () => {
  for (const [who, db] of [['the teacher', teacher()], ['the root administrator', root()], ['an invited student', student()], ['anyone signed out', anonymous()]]) {
    await assertFails(getDoc(doc(db, `liveChallengePrivate/${ROOM}`)), `${who} cannot read it`);
    await assertFails(dueQuery(db), `${who} cannot run the sweep's query`);
    await assertFails(updateDoc(doc(db, `liveChallengePrivate/${ROOM}`), { hostHeardAt: new Date() }), `${who} cannot forge a heartbeat`);
    await assertFails(updateDoc(doc(db, `liveChallengePrivate/${ROOM}`), { serverSweepDueAt: null }), `${who} cannot move the due time`);
    await assertFails(setDoc(doc(db, 'liveChallengePrivate/room-new'), { serverSweepDueAt: new Date(0) }), `${who} cannot make a room due`);
  }
});

test("the sweep's switch is readable when signed in and writable by no client", async () => {
  await assertSucceeds(getDoc(doc(teacher(), 'platformFlags/liveChallengeServerSweep')));
  await assertSucceeds(getDoc(doc(student(), 'platformFlags/liveChallengeServerSweep')));
  await assertFails(getDoc(doc(anonymous(), 'platformFlags/liveChallengeServerSweep')));
  for (const db of [teacher(), root(), student()]) {
    await assertFails(setDoc(doc(db, 'platformFlags/liveChallengeServerSweep'), { enabled: true, finishAbandonedGames: true }));
    await assertFails(updateDoc(doc(db, 'platformFlags/liveChallengeServerSweep'), { enabled: false }));
    await assertFails(deleteDoc(doc(db, 'platformFlags/liveChallengeServerSweep')));
  }
});
