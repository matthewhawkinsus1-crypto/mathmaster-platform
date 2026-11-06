import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

// The collections only the server touches, and two it lets one reader see,
// through the real Security Rules in the Firestore emulator
// (`npm run test:rules`). CI05 (D-83): tests/platform/firestoreRulesCollectionCoverage.test.mjs
// fails for a collection in firestore.rules that no rules test names, and these
// sixteen had no case at all. They are the collections where a loosened rule
// would do the most harm without anyone noticing: no screen reads or writes
// them from a browser, so nothing in the app breaks to show that a rule opened.
//
//   * Fourteen are server-only (`allow read, write: if false`: Google Classroom
//     links, the sign-in handshake, repair audits, the Path locks, a game's
//     achievement jobs, a teacher's dry run ...): no student, teacher, root
//     administrator or signed-out visitor reads, lists, creates, edits or
//     deletes a document.
//   * liveChallengeTeacherActive is one tiny pointer a teacher reads to find
//     their own running game again after a refresh. Only that teacher and the
//     root administrator read it; nobody writes it from a browser.
//   * liveChallengeReports names every student a finished game ranked. Only
//     the teacher who ran the game and the root administrator read it, and
//     nobody writes it from a browser. A report not written yet reads as
//     nothing to a teacher, so the console follows it from the moment the
//     room finishes (it is written a moment after).
//
// A new server-only collection belongs in SERVER_ONLY below (the platform test
// above says so when it is missing). Synthetic identities only. Own projectId:
// rules suites run in parallel against one emulator. The emulator's address
// comes from the environment `firebase emulators:exec` sets, 8181 when run bare.

const PROJECT = 'mathmaster-server-only-collections-rules';
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');
const ROOT_ADMIN = 'root.admin@example.test';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';
const ROOM = 'room-1';

let env;

const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

// Who is asking, for the message when a rule gives way.
const everyone = () => [
  ['the root administrator', root()], ['a teacher', teacherA()], ['another teacher', teacherB()],
  ['a student', studentA()], ['someone signed out', anonymous()],
];

// assertFails / assertSucceeds say only "expected ..."; say which collection and who.
const refused = async (what, request) => {
  try { await assertFails(request); } catch (error) { throw new Error(`${what} was not refused: ${error.message}`); }
};
const allowed = async (what, request) => {
  try { await assertSucceeds(request); } catch (error) { throw new Error(`${what} was refused: ${error.message}`); }
};

const SERVER_ONLY = [
  'liveChallengeAchievementJobs', // the Class Points awards a finished game planned
  'liveChallengeDryRuns', // a teacher's rehearsal: it holds the question ids
  'teacherIntegrations', // a teacher's Google Classroom connection
  'oauthStates', // the sign-in handshake of that connection
  'classroomLinks', // which Classroom assignment an assignment was published as
  'classroomRosterLinks', // which Classroom student a student is
  'classroomGradeSyncs', // what was last pushed to a Classroom grade column
  'studentAliases', // a student's sign-in alias
  'assignmentRepairAudits', // who repaired which assignment, and what changed
  'assignmentRepairHistory', // the question history of a repaired assignment
  'assignmentPlatformIssues', // platform defect reports on an assignment
  'activePathLocks', // the lock that keeps one open My Math Path session per skill
  'masteryEvidenceApplications', // the marker that a Path answer was already applied to mastery
  'secureTestManifests', // a secure Test's blueprint and issuance record
];

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: HOST, port: Number(PORT) },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const name of SERVER_ONLY) await setDoc(doc(db, `${name}/seed`), { studentId: 'S_A', teacherEmail: TEACHER_A, note: 'server-held' });
    await setDoc(doc(db, `liveChallengeTeacherActive/${TEACHER_A}`), { roomId: ROOM, teacherEmail: TEACHER_A, status: 'running' });
    await setDoc(doc(db, `liveChallengeReports/${ROOM}`), {
      roomId: ROOM, teacherEmail: TEACHER_A, players: [{ studentId: 'S_A', name: 'Rowan Example', rank: 1 }],
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('the server-only collections: no browser reads, lists, creates, edits or deletes a document', async () => {
  for (const name of SERVER_ONLY) {
    for (const [who, db] of everyone()) {
      await refused(`${who} reading ${name}`, getDoc(doc(db, `${name}/seed`)));
      await refused(`${who} listing ${name}`, getDocs(collection(db, name)));
      await refused(`${who} listing ${name} for their own student`, getDocs(query(collection(db, name), where('studentId', '==', 'S_A'))));
      await refused(`${who} creating in ${name}`, setDoc(doc(db, `${name}/forged`), { studentId: 'S_A', note: 'forged' }));
      await refused(`${who} editing in ${name}`, updateDoc(doc(db, `${name}/seed`), { note: 'forged' }));
      await refused(`${who} deleting from ${name}`, deleteDoc(doc(db, `${name}/seed`)));
    }
  }
});

test("a teacher's active-game pointer is read by that teacher and the root administrator only, and written by no browser", async () => {
  const mine = `liveChallengeTeacherActive/${TEACHER_A}`;
  await allowed('the teacher reading their own pointer', getDoc(doc(teacherA(), mine)));
  await allowed('the root administrator reading it', getDoc(doc(root(), mine)));
  await refused("another teacher reading someone else's pointer", getDoc(doc(teacherB(), mine)));
  await refused('a student reading it', getDoc(doc(studentA(), mine)));
  await refused('someone signed out reading it', getDoc(doc(anonymous(), mine)));
  await refused('a teacher listing every pointer', getDocs(collection(teacherA(), 'liveChallengeTeacherActive')));
  for (const [who, db] of everyone()) {
    await refused(`${who} creating a pointer`, setDoc(doc(db, `liveChallengeTeacherActive/${TEACHER_B}`), { roomId: ROOM, teacherEmail: TEACHER_B }));
    await refused(`${who} moving the pointer`, updateDoc(doc(db, mine), { roomId: 'another-room' }));
    await refused(`${who} deleting the pointer`, deleteDoc(doc(db, mine)));
  }
});

test("a finished game's report, which names its students, is read by the teacher who ran it and the root administrator only", async () => {
  const report = `liveChallengeReports/${ROOM}`;
  await allowed('the teacher who ran the game reading its report', getDoc(doc(teacherA(), report)));
  await allowed('the root administrator reading it', getDoc(doc(root(), report)));
  await refused('another teacher reading it', getDoc(doc(teacherB(), report)));
  await refused('a student reading it', getDoc(doc(studentA(), report)));
  await refused('someone signed out reading it', getDoc(doc(anonymous(), report)));
  // A list is allowed only when the query itself proves every report is the asker's own.
  await allowed('the teacher listing only their own reports', getDocs(query(collection(teacherA(), 'liveChallengeReports'), where('teacherEmail', '==', TEACHER_A))));
  await refused("a teacher listing another teacher's reports", getDocs(query(collection(teacherB(), 'liveChallengeReports'), where('teacherEmail', '==', TEACHER_A))));
  await refused('a teacher listing every report', getDocs(collection(teacherA(), 'liveChallengeReports')));
  await refused('a student listing reports', getDocs(collection(studentA(), 'liveChallengeReports')));
  for (const [who, db] of everyone()) {
    await refused(`${who} creating a report`, setDoc(doc(db, 'liveChallengeReports/forged'), { roomId: 'forged', teacherEmail: TEACHER_A, players: [] }));
    await refused(`${who} editing a report`, updateDoc(doc(db, report), { players: [] }));
    await refused(`${who} deleting a report`, deleteDoc(doc(db, report)));
  }
});

// The room turns finished first and its report is written a moment after it,
// so the teacher's console follows the report from the moment the room
// finishes (liveChallengeService.js, watchChallengeReport). Until it is
// written it reads as nothing to a teacher, as a class's missing memory does,
// and is refused to everyone else as before.
test('a report not written yet reads as nothing to a teacher, and is still refused to a student or someone signed out', async () => {
  const missing = 'liveChallengeReports/room-not-written-yet';
  await allowed('a teacher asking for a report not written yet', getDoc(doc(teacherA(), missing)));
  await allowed('another teacher asking for it', getDoc(doc(teacherB(), missing)));
  await refused('a student asking for one', getDoc(doc(studentA(), missing)));
  await refused('someone signed out asking for one', getDoc(doc(anonymous(), missing)));
});

test("the console following a report before it is written is given it when it lands; another teacher's is refused it then", async () => {
  const later = 'liveChallengeReports/room-written-later';
  const within = (promise, what) => Promise.race([promise, new Promise((_, reject) => { setTimeout(() => reject(new Error(`${what}: no answer in 10 s`)), 10_000); })]);
  const follow = (db) => {
    const seen = [];
    let first;
    let end;
    const firstSnapshot = new Promise((resolve) => { first = resolve; });
    const settled = new Promise((resolve) => { end = resolve; });
    const stop = onSnapshot(doc(db, later), (snapshot) => {
      seen.push(snapshot.exists() ? snapshot.data().roomId : null);
      first();
      if (snapshot.exists()) end({ report: snapshot.data() });
    }, (error) => { first(); end({ error: error.code }); });
    return { seen, firstSnapshot, settled, stop };
  };
  const mine = follow(teacherA());
  const theirs = follow(teacherB());
  await within(Promise.all([mine.firstSnapshot, theirs.firstSnapshot]), 'the first snapshots');
  assert.deepEqual([mine.seen, theirs.seen], [[null], [null]], 'both are told there is no report yet');
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), later), { roomId: 'room-written-later', teacherEmail: TEACHER_A, players: [{ studentId: 'S_A', name: 'Rowan Example', rank: 1 }] });
  });
  const [given, other] = await within(Promise.all([mine.settled, theirs.settled]), 'the written report');
  mine.stop();
  theirs.stop();
  assert.equal(given.report?.roomId, 'room-written-later', 'the teacher who ran the game is given the report');
  assert.equal(other.error, 'permission-denied', "another teacher's listener is refused the report that names the students");
});
