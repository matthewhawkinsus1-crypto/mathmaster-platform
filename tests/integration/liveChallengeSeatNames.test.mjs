// A Live Challenge played with the students' names is played with them, from
// the first lobby through Play Again, through the real callables against a real
// Firestore. Run through `npm run test:challenge-finish`.
//
// THE BUG. A teacher ran a game with names, pressed Play Again, and the new game
// showed code names. createLiveChallenge gave every seat a code name; the names
// were applied afterwards by configureLiveChallengeExperience, sent by the
// teacher's device after the create, which renamed only the seats whose public
// rows it could already see. On Play Again the class is sitting on the podium,
// every screen follows its invite into the new lobby and joins at once, and a
// join that landed while that call was running copied the code name onto the
// board for good. A student added to the class mid-game got a code name too.
//
// THE FIX, checked here: the create request carries the setting and every seat
// is born named; the room stores the setting; every join and every late invite
// applies the room's setting in its own transaction
// (liveChallengeExperience.mjs seatAliasUnder).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const functionsEntry = require(path.join(repo, 'functions/entry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const { replayExperienceFromRoom, replayRequestFromRoom } = await import(path.join(repo, 'src/platform/liveChallenge/challengeReplayModel.js'));
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));
const db = admin.firestore();
const { FieldValue } = admin.firestore;

// Unique to this file: the integration files share one emulator in parallel.
const TEACHER = 'seat-names-teacher@example.com';
const CLASS_ID = 'seat-names-class';
const ROSTER = [
  ['seat-names-s1', 'Ada', 'Lovelace'],
  ['seat-names-s2', 'Ben', 'Banneker'],
  ['seat-names-s3', 'Cal', 'Calder'],
  ['seat-names-s4', 'Dee', 'Dunbar'],
];
const [S1, S2, S3, S4] = ROSTER.map(([studentId]) => studentId);
const FIRST = Object.fromEntries(ROSTER.map(([studentId, first]) => [studentId, first]));
const LATE = 'seat-names-late';

const teacher = (data) => ({
  auth: { uid: `${TEACHER}-uid`, token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const student = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const rootRequest = (data) => ({
  auth: { uid: 'seat-names-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const call = (name, request) => functionsIndex[name].run(request);
const configure = (data) => functionsEntry.configureLiveChallengeExperience.run(teacher(data));

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const seatOf = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data() || null;
const inviteOf = async (studentId) => (await db.collection('liveChallengeInvites').doc(studentId).get()).data() || null;
const boardName = async (roomId, studentId) => {
  const seat = await seatOf(roomId, studentId);
  return (await roomRef(roomId).collection('players').doc(seat.playerKey).get()).data()?.alias ?? null;
};
const codeNameOf = (roomId, slot) => challenge.challengeAlias(slot, parseInt((require('node:crypto')).createHash('sha256').update(roomId).digest('hex').slice(0, 6), 16));

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '5', name: 'Seat Names Period 5' });
for (const [studentId, firstName, lastName] of ROSTER) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({ assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '5', firstName, lastName });
}
// Not in the class yet: added mid-game below.
await db.collection('grades').doc(LATE).set({ firstName: 'Eve', lastName: 'Noether', classPeriod: 'Unassigned' });

const createRush = (extra = {}) => call('createLiveChallenge', teacher({
  classId: CLASS_ID,
  courseId: 'algebra1',
  challengeMode: 'graphFeatureRush',
  graphFeatureRush: { presetId: 'algebra1Quick' },
  roundCount: 1,
  roundSeconds: 30,
  ...extra,
}));

let G1 = null;

test('a game made with names seats every student by name; one who joins before the teacher\'s configuration lands is on the board by name', async () => {
  G1 = (await createRush({ playerDisplayMode: 'firstName' })).roomId;
  assert.equal((await roomOf(G1)).playerDisplayMode, 'firstName', 'the room says what its seats are called');
  for (const studentId of [S1, S2, S3, S4]) {
    // eslint-disable-next-line no-await-in-loop
    const seat = await seatOf(G1, studentId);
    assert.equal(seat.alias, FIRST[studentId], `${studentId}'s seat is named at birth`);
    assert.equal(seat.codeAlias, codeNameOf(G1, seat.slot), 'and keeps the code name the room\'s seed gave it');
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await inviteOf(studentId)).alias, FIRST[studentId], 'their invite says so before they open it');
  }
  // The student's screen follows the invite and joins before the teacher's
  // device has sent anything else.
  await call('joinLiveChallenge', student(S1, { roomId: G1 }));
  assert.equal(await boardName(G1, S1), 'Ada');
  // The configuration the teacher's device then sends changes nothing.
  await configure({ roomId: G1, speedInfluencePercent: 0, playerDisplayMode: 'firstName' });
  assert.equal(await boardName(G1, S1), 'Ada');
  await call('joinLiveChallenge', student(S2, { roomId: G1 }));
  assert.equal(await boardName(G1, S2), 'Ben');
});

test('Play Again of a named game is named, though the whole class joins the new lobby before configure', async () => {
  await call('startLiveChallenge', teacher({ roomId: G1 }));
  const done = await call('finishLiveChallenge', teacher({ roomId: G1 }));
  assert.equal(done.status, 'finished');
  const finished = await roomOf(G1);
  const request = replayRequestFromRoom({ ...finished, roomId: G1 }, { rewardPolicy: null });
  assert.equal(request.playerDisplayMode, 'firstName', 'the replay asks for the names on the create');
  const G2 = (await call('createLiveChallenge', teacher(request))).roomId;
  assert.ok(G2 && G2 !== G1);
  // Every screen on the podium follows its invite and joins at once.
  await Promise.all([S1, S2, S3, S4].map((studentId) => call('joinLiveChallenge', student(studentId, { roomId: G2 }))));
  for (const studentId of [S1, S2, S3, S4]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await boardName(G2, studentId), FIRST[studentId], `${studentId} is on the new board by name`);
  }
  // Then the teacher's device secures the setting, as playAgain does.
  await configure({ roomId: G2, ...replayExperienceFromRoom(finished) });
  for (const studentId of [S1, S2, S3, S4]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await boardName(G2, studentId), FIRST[studentId]);
  }
  await call('cancelLiveChallenge', teacher({ roomId: G2 }));
});

test('a join inside the window the bug lived in (the room says names, the seat still has its code name) puts the name on the board', async () => {
  // An older client: the create carries no setting, so the seats are code names.
  const G3 = (await createRush()).roomId;
  assert.equal((await roomOf(G3)).playerDisplayMode, 'codeName');
  const codeName = (await seatOf(G3, S1)).alias;
  assert.equal(codeName, codeNameOf(G3, (await seatOf(G3, S1)).slot));
  // configureLiveChallengeExperience writes the room first and renames the
  // seats after. Stop between the two: the room says full names, every seat
  // still carries its code name, nobody has a public row yet.
  await roomRef(G3).set({ playerDisplayMode: 'fullName' }, { merge: true });
  // The join that used to copy the code name onto the board:
  await call('joinLiveChallenge', student(S1, { roomId: G3 }));
  assert.equal(await boardName(G3, S1), 'Ada Lovelace', 'the board has the name, not the code name');
  const seat = await seatOf(G3, S1);
  assert.equal(seat.alias, 'Ada Lovelace');
  assert.equal(seat.codeAlias, codeName, 'the code name is kept for a switch back');
  assert.equal((await inviteOf(S1)).alias, 'Ada Lovelace', 'their own screen shows the name on the board');
  // The rest of the configuration lands; everyone ends named.
  await configure({ roomId: G3, speedInfluencePercent: 0, playerDisplayMode: 'fullName' });
  assert.equal(await boardName(G3, S1), 'Ada Lovelace');
  await call('joinLiveChallenge', student(S2, { roomId: G3 }));
  assert.equal(await boardName(G3, S2), 'Ben Banneker');

  // A STUDENT ADDED TO THE CLASS MID-GAME is seated by name in a named game.
  await call('setStudentClass', rootRequest({ studentId: LATE, classId: CLASS_ID }));
  const invite = await inviteOf(LATE);
  assert.equal(invite?.roomId, G3, 'the late student is invited into the game');
  assert.equal(invite.alias, 'Eve Noether');
  const lateSeat = await seatOf(G3, LATE);
  assert.equal(lateSeat.alias, 'Eve Noether');
  assert.equal(lateSeat.codeAlias, codeNameOf(G3, lateSeat.slot), 'the next seat\'s code name, kept');
  await call('joinLiveChallenge', student(LATE, { roomId: G3 }));
  assert.equal(await boardName(G3, LATE), 'Eve Noether');

  // Switched back to code names, a join gives the seat its own code name again.
  await configure({ roomId: G3, speedInfluencePercent: 0, playerDisplayMode: 'codeName' });
  await call('joinLiveChallenge', student(S3, { roomId: G3 }));
  assert.equal(await boardName(G3, S3), (await seatOf(G3, S3)).codeAlias);
  assert.equal(await boardName(G3, S1), codeName, 'and the configuration renamed the rows it found');
  await call('cancelLiveChallenge', teacher({ roomId: G3 }));
});

test('a room from before the setting keeps the alias its seat has', async () => {
  const G4 = (await createRush({ playerDisplayMode: 'firstName' })).roomId;
  // An older room: no setting on it, a code name on the seat.
  await roomRef(G4).update({ playerDisplayMode: FieldValue.delete() });
  const slot = (await seatOf(G4, S4)).slot;
  await privateRef(G4).collection('players').doc(S4).update({ alias: codeNameOf(G4, slot), codeAlias: FieldValue.delete() });
  await call('joinLiveChallenge', student(S4, { roomId: G4 }));
  assert.equal(await boardName(G4, S4), codeNameOf(G4, slot), 'a join never decides a room\'s names for it');
  await call('cancelLiveChallenge', teacher({ roomId: G4 }));
});
