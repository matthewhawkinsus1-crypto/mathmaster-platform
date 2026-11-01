import test, { after, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// liveChallengeClassMemory through the real Security Rules in the Firestore
// emulator (`npm run test:rules`). One document per class and game: what the
// class did the last time it played a rush game, with which settings — the
// setup card's "last played … → try …" (functions/shared/
// liveChallengeClassMemory.mjs). Class totals only, but still a class's
// record: the teacher who ran the game reads it, nobody else does, and nobody
// writes it from a browser. A class with no memory yet reads as nothing, so
// the setup can ask without first knowing.
//
// Synthetic identities only. Own projectId: rules suites run in parallel
// against one emulator. The emulator's address comes from the environment
// `firebase emulators:exec` sets, 8181 when run bare.

const PROJECT = 'mathmaster-class-memory-rules';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');
const ROOT_ADMIN = 'root.admin@example.test';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const MEMORY = 'liveChallengeClassMemory/class-1__graphFeatureRush';
const MISSING = 'liveChallengeClassMemory/class-9__inequalityRush';

let env;

const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const refused = async (what, request) => {
  try { await assertFails(request); } catch (error) { throw new Error(`${what} was not refused: ${error.message}`); }
};
const allowed = async (what, request) => {
  try { await assertSucceeds(request); } catch (error) { throw new Error(`${what} was refused: ${error.message}`); }
};

const MEMORY_DATA = {
  version: 1,
  classId: 'class-1',
  teacherEmail: TEACHER_A,
  game: 'graphFeatureRush',
  modeId: 'graphFeatureRush',
  roomId: 'room-1',
  classLabel: 'Period 5',
  playedAtMs: 1_793_000_000_000,
  settings: { presetId: 'algebra1Quick', families: ['linear', 'quadratic'], features: ['xIntercept', 'yIntercept', 'vertex'], difficulty: 'standard', offScreen: false, roundCount: 3, roundSeconds: 60, scoringStrategyId: 'grandPrix' },
  results: { accuracyPercent: 86, completedPerStudent: 4.2, players: 24, weakest: { key: 'vertex', label: 'vertex', completionPercent: 41, accuracyPercent: 55 } },
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host: HOST, port: Number(PORT), rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), MEMORY), MEMORY_DATA);
  });
});

after(async () => {
  await env?.cleanup();
});

test('the teacher who ran the game reads their class\'s memory; the root administrator does too', async () => {
  await allowed('the teacher who ran the game reading it', getDoc(doc(teacherA(), MEMORY)));
  await allowed('the root administrator reading it', getDoc(doc(root(), MEMORY)));
  await allowed('the teacher listing only their own memories', getDocs(query(collection(teacherA(), 'liveChallengeClassMemory'), where('teacherEmail', '==', TEACHER_A))));
});

test('another teacher, a student and someone signed out read nothing', async () => {
  await refused('another teacher reading it', getDoc(doc(teacherB(), MEMORY)));
  await refused('a student reading it', getDoc(doc(studentA(), MEMORY)));
  await refused('someone signed out reading it', getDoc(doc(anonymous(), MEMORY)));
  await refused("a teacher listing another teacher's memories", getDocs(query(collection(teacherB(), 'liveChallengeClassMemory'), where('teacherEmail', '==', TEACHER_A))));
  await refused('a teacher listing every memory', getDocs(collection(teacherA(), 'liveChallengeClassMemory')));
});

test('a class with no memory yet reads as nothing for a teacher, and still as nothing at all for a student', async () => {
  await allowed('a teacher asking about a class with no memory', getDoc(doc(teacherB(), MISSING)));
  await refused('a student asking about one', getDoc(doc(studentA(), MISSING)));
  await refused('someone signed out asking about one', getDoc(doc(anonymous(), MISSING)));
});

test('nobody writes a memory from a browser — not even the teacher it belongs to', async () => {
  for (const [who, db] of [['the teacher who ran the game', teacherA()], ['the root administrator', root()], ['another teacher', teacherB()], ['a student', studentA()]]) {
    // eslint-disable-next-line no-await-in-loop
    await refused(`${who} creating a memory`, setDoc(doc(db, MISSING), { ...MEMORY_DATA, classId: 'class-9', teacherEmail: TEACHER_B }));
    // eslint-disable-next-line no-await-in-loop
    await refused(`${who} editing a memory`, updateDoc(doc(db, MEMORY), { 'results.accuracyPercent': 100 }));
    // eslint-disable-next-line no-await-in-loop
    await refused(`${who} deleting a memory`, deleteDoc(doc(db, MEMORY)));
  }
});
