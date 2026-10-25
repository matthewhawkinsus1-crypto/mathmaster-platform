import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import {
  TEACHER_PREFERENCES_COLLECTION,
  readTeacherTopicStyle,
  saveTeacherTopicStyle,
  syncTeacherTopicStyle,
} from '../../src/platform/classroom/teacherTopicStyle.js';

// A teacher's own preferences (TT07), through the real Security Rules in the
// Firestore emulator (`npm run test:rules`), using the very reads and writes
// the app makes (src/platform/classroom/teacherTopicStyle.js).
//
// Proven here, by the database rather than by a screen:
//   1. a teacher reads and writes their own document, with one of the three
//      Classroom topic styles and the server's time, and nothing else;
//   2. nobody else reads or writes it — not another teacher, not a student, not
//      someone signed out, not the root administrator — and it cannot be listed;
//   3. no browser deletes it;
//   4. a second device of the same teacher reads what the first saved, and a
//      choice made in a browser before this existed is saved for the teacher.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against one emulator. The emulator's address comes from the
// environment `firebase emulators:exec` sets, 8181 when run bare.

const PROJECT = 'mathmaster-teacher-preferences-rules';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');

let env;
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: 'tp.teacher.a@example.org' }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: 'tp.teacher.b@example.org' }).firestore();
const admin = () => env.authenticatedContext('uid-admin', { role: 'teacher', admin: true, rootAdmin: true, email: 'tp.root@example.org' }).firestore();
const student = () => env.authenticatedContext('uid-ta', { role: 'student', studentId: 'TP_STUDENT' }).firestore();
const stranger = () => env.unauthenticatedContext().firestore();

const ref = (db, uid = 'uid-ta') => doc(db, TEACHER_PREFERENCES_COLLECTION, uid);
const good = (overrides = {}) => ({ classroomTopicStyle: 'week', updatedAt: serverTimestamp(), ...overrides });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
  await env.clearFirestore();
});

after(async () => {
  await env?.cleanup();
});

test('a teacher saves and reads their own topic style, each of the three, with the server\'s time', async () => {
  assert.equal(await assertSucceeds(readTeacherTopicStyle(teacherA(), 'uid-ta')), null, 'nothing saved yet reads as none');
  for (const style of ['module', 'week', 'weekModule']) {
    await assertSucceeds(saveTeacherTopicStyle(teacherA(), 'uid-ta', style));
    assert.equal(await readTeacherTopicStyle(teacherA(), 'uid-ta'), style);
  }
  let stored = null;
  await env.withSecurityRulesDisabled(async (context) => { stored = (await getDoc(ref(context.firestore()))).data(); });
  assert.deepEqual(Object.keys(stored).sort(), ['classroomTopicStyle', 'updatedAt']);
  assert.equal(stored.classroomTopicStyle, 'weekModule');
  assert.equal(typeof stored.updatedAt.toMillis(), 'number');
});

test('only a known style, with the server\'s time and no other field, is accepted', async () => {
  const db = teacherA();
  await assertFails(setDoc(ref(db), good({ classroomTopicStyle: 'day' })));
  await assertFails(setDoc(ref(db), good({ classroomTopicStyle: '' })));
  await assertFails(setDoc(ref(db), good({ classroomTopicStyle: 7 })));
  await assertFails(setDoc(ref(db), good({ classroomTopicStyle: null })));
  await assertFails(setDoc(ref(db), good({ updatedAt: 1 })));
  await assertFails(setDoc(ref(db), good({ updatedAt: new Date() })));
  await assertFails(setDoc(ref(db), { classroomTopicStyle: 'week' }));
  await assertFails(setDoc(ref(db), { updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref(db), good({ displayName: 'Ms. Sample' })));
  await assertFails(setDoc(ref(db), good({ students: ['TP_STUDENT'] })));
  await assertFails(updateDoc(ref(db), { classroomTopicStyle: 'bogus', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref(db), { classroomTopicStyle: 'module', note: 'x', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref(db), { classroomTopicStyle: 'module', updatedAt: serverTimestamp() }));
  // The service refuses an unknown style before it reaches the database.
  assert.throws(() => saveTeacherTopicStyle(db, 'uid-ta', 'day'), /unknown-topic-style/);
});

test('nobody else reads or writes it: another teacher, a student, someone signed out, the root administrator', async () => {
  await assertSucceeds(saveTeacherTopicStyle(teacherA(), 'uid-ta', 'week'));
  for (const [name, db] of [['another teacher', teacherB()], ['a student', student()], ['someone signed out', stranger()], ['the root administrator', admin()]]) {
    await assertFails(getDoc(ref(db)), `${name} reads`);
    await assertFails(setDoc(ref(db), good()), `${name} writes`);
    await assertFails(updateDoc(ref(db), { classroomTopicStyle: 'module', updatedAt: serverTimestamp() }), `${name} updates`);
  }
  // A teacher cannot write a document named for someone else, or read it.
  await assertFails(setDoc(ref(teacherA(), 'uid-tb'), good()));
  await assertFails(getDoc(ref(teacherA(), 'uid-tb')));
  // Their own is unaffected by all of that.
  assert.equal(await readTeacherTopicStyle(teacherA(), 'uid-ta'), 'week');
  // And it cannot be listed.
  await assertFails(getDocs(collection(teacherA(), TEACHER_PREFERENCES_COLLECTION)));
  await assertFails(getDocs(collection(admin(), TEACHER_PREFERENCES_COLLECTION)));
});

test('no browser deletes it', async () => {
  await assertSucceeds(saveTeacherTopicStyle(teacherA(), 'uid-ta', 'week'));
  await assertFails(deleteDoc(ref(teacherA())));
  await assertFails(deleteDoc(ref(admin())));
  await assertFails(deleteDoc(ref(student())));
  assert.equal(await readTeacherTopicStyle(teacherA(), 'uid-ta'), 'week');
});

// A stand-in for the browser's own copy (localStorage), one per device.
const withBrowser = async (stored, run) => {
  const values = new Map(stored ? [['mathmaster:classroomTopicStyle', stored]] : []);
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)) } };
  try {
    return await run(values);
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
};

test('a second device reads what the first saved; a choice made in a browser before this existed is saved for the teacher', async () => {
  await env.clearFirestore();
  const db = teacherA();

  // Device 1 had chosen "week" in its browser before the choice followed the teacher.
  const first = await withBrowser('week', async (values) => ({ style: await syncTeacherTopicStyle({ db, uid: 'uid-ta' }), cached: values.get('mathmaster:classroomTopicStyle') }));
  assert.deepEqual(first, { style: 'week', cached: 'week' });
  assert.equal(await readTeacherTopicStyle(db, 'uid-ta'), 'week', 'saved for the teacher');

  // Device 2 never chose: it takes the teacher's, and its browser now holds it.
  const second = await withBrowser(null, async (values) => ({ style: await syncTeacherTopicStyle({ db, uid: 'uid-ta' }), cached: values.get('mathmaster:classroomTopicStyle') }));
  assert.deepEqual(second, { style: 'week', cached: 'week' });

  // Device 3 chose something else long ago: the teacher's saved choice wins and replaces it.
  const third = await withBrowser('module', async (values) => ({ style: await syncTeacherTopicStyle({ db, uid: 'uid-ta' }), cached: values.get('mathmaster:classroomTopicStyle') }));
  assert.deepEqual(third, { style: 'week', cached: 'week' });
  assert.equal(await readTeacherTopicStyle(db, 'uid-ta'), 'week', 'and does not overwrite the teacher\'s');

  // A teacher with nothing saved and a browser that never chose: the default, and nothing saved or remembered.
  await env.clearFirestore();
  const fresh = await withBrowser(null, async (values) => ({ style: await syncTeacherTopicStyle({ db, uid: 'uid-ta' }), cached: values.get('mathmaster:classroomTopicStyle') ?? null }));
  assert.deepEqual(fresh, { style: 'module', cached: null });
  assert.equal(await readTeacherTopicStyle(db, 'uid-ta'), null);

  // Signed in as someone else's uid: the read is refused and the browser's own choice stands.
  const refused = await withBrowser('weekModule', async () => syncTeacherTopicStyle({ db: teacherB(), uid: 'uid-ta' }));
  assert.equal(refused, 'weekModule');
});
