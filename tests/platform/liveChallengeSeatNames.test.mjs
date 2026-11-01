import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PLAYER_DISPLAY_MODES,
  displayAliasForStudent,
  roomPlayerDisplayMode,
  seatAliasUnder,
} from '../../functions/shared/liveChallengeExperience.mjs';
import { replayExperienceFromRoom, replayRequestFromRoom } from '../../src/platform/liveChallenge/challengeReplayModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * A GAME PLAYED WITH NAMES IS PLAYED WITH NAMES, FROM THE FIRST SEAT TO PLAY AGAIN.
 *
 * The bug: a teacher ran a game with the students' names, pressed Play Again,
 * and the new game showed code names. createLiveChallenge gave every seat a
 * code name, and the names were applied afterwards by a second call from the
 * teacher's device (configureLiveChallengeExperience), which renamed the seats
 * whose public rows it could see. On Play Again the class is already on the
 * podium: every screen follows its invite into the new lobby and joins within
 * a second. A join that landed while that call was running copied the code
 * name onto the board, and nothing renamed it. A student added to the class
 * mid-game got a code name the same way.
 *
 * Now the room's setting is read wherever a seat is written. The create
 * request carries it (Play Again carries the last game's), the room stores it,
 * and the late invite and every join apply it in their own transactions.
 */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const ADA = Object.freeze({ firstName: 'Ada', lastName: 'Lovelace' });

/* ------------------------------ the seat's alias ------------------------------ */

test('a seat is named by its room\'s setting, and keeps the code name it was given', () => {
  const codeSeat = { codeAlias: 'Prime Falcon 17' };
  const expected = { codeName: 'Prime Falcon 17', firstLastInitial: 'Ada L.', firstName: 'Ada', fullName: 'Ada Lovelace' };
  for (const mode of PLAYER_DISPLAY_MODES) {
    const seat = seatAliasUnder({ room: { playerDisplayMode: mode }, student: ADA, studentId: 's-ada', player: codeSeat });
    assert.deepEqual({ ...seat }, { alias: expected[mode], codeAlias: 'Prime Falcon 17' }, mode);
  }
  // A seat already renamed (configure ran) goes back to its own code name.
  const renamed = { alias: 'Ada L.', codeAlias: 'Prime Falcon 17' };
  assert.equal(seatAliasUnder({ room: { playerDisplayMode: 'codeName' }, student: ADA, studentId: 's-ada', player: renamed }).alias, 'Prime Falcon 17');
  // A seat stored before codeAlias existed: its alias is the code name.
  assert.deepEqual({ ...seatAliasUnder({ room: { playerDisplayMode: 'fullName' }, student: ADA, studentId: 's-ada', player: { alias: 'Vector Owl 22' } }) }, { alias: 'Ada Lovelace', codeAlias: 'Vector Owl 22' });
});

test('a room that has not said leaves the seat as it is; an unknown setting is code names', () => {
  assert.equal(roomPlayerDisplayMode({}), null);
  assert.equal(roomPlayerDisplayMode({ playerDisplayMode: null }), null);
  assert.equal(roomPlayerDisplayMode(null), null);
  assert.equal(roomPlayerDisplayMode({ playerDisplayMode: 'studentId' }), 'codeName', 'never a student id');
  const renamed = { alias: 'Ada L.', codeAlias: 'Prime Falcon 17' };
  assert.deepEqual({ ...seatAliasUnder({ room: {}, student: ADA, studentId: 's-ada', player: renamed }) }, { alias: 'Ada L.', codeAlias: 'Prime Falcon 17' });
  assert.deepEqual({ ...seatAliasUnder({ room: {}, student: ADA, player: { alias: 'Vector Owl 22' } }) }, { alias: 'Vector Owl 22', codeAlias: 'Vector Owl 22' });
  assert.equal(seatAliasUnder({ room: { playerDisplayMode: 'teacherNotes' }, student: ADA, player: { codeAlias: 'Vector Owl 22' } }).alias, 'Vector Owl 22');
});

test('a student with no usable name keeps the code name: an id or an email is never a public alias', () => {
  const room = { playerDisplayMode: 'fullName' };
  const seat = { codeAlias: 'Algebra Hawk 91' };
  assert.equal(seatAliasUnder({ room, student: {}, studentId: 's-1', player: seat }).alias, 'Algebra Hawk 91');
  assert.equal(seatAliasUnder({ room, student: { displayName: 'S-77' }, studentId: 'S-77', player: seat }).alias, 'Algebra Hawk 91');
  assert.equal(seatAliasUnder({ room, student: { firstName: 'student@example.com' }, studentId: 's-2', player: seat }).alias, 'Algebra Hawk 91');
  assert.equal(seatAliasUnder({ room, student: {}, studentId: 's-3', player: {} }).alias, 'MathMaster Player', 'never an empty name');
});

test('create, the late invite, a join and the teacher\'s configuration all give a seat the same name', () => {
  // The three writers name a seat independently; the board is right only if
  // they agree, whichever lands last. Configure's own rule, as entry.js has it:
  const configured = ({ student, studentId, player, mode }) => displayAliasForStudent({
    student: { ...student, studentId }, mode, codeAlias: String(player.codeAlias || player.alias || 'MathMaster Player').trim() || 'MathMaster Player',
  });
  const students = [ADA, { firstName: 'Cher' }, { displayName: 'Grace Hopper' }, {}, { firstName: 's-9', lastName: '' }];
  for (const mode of PLAYER_DISPLAY_MODES) {
    students.forEach((student, index) => {
      const studentId = `s-${index + 5}`;
      const room = { playerDisplayMode: mode };
      const created = seatAliasUnder({ room, student, studentId, player: { codeAlias: `Code Name ${index}` } });
      const joined = seatAliasUnder({ room, student, studentId, player: created });
      assert.deepEqual({ ...joined }, { ...created }, `${mode}, student ${index}: a join changes nothing a create got right`);
      assert.equal(configured({ student, studentId, player: created, mode }), created.alias, `${mode}, student ${index}: configure agrees`);
      // And a join into a seat still carrying the code name (an older create)
      // gives the name configure would.
      const fromCode = seatAliasUnder({ room, student, studentId, player: { alias: `Code Name ${index}` } });
      assert.equal(fromCode.alias, configured({ student, studentId, player: { alias: `Code Name ${index}` }, mode }));
    });
  }
});

/* ------------------------------ Play Again ------------------------------ */

test('Play Again asks for the last game\'s names on the create itself, the same setting configure is sent', () => {
  for (const mode of PLAYER_DISPLAY_MODES) {
    const room = { classId: 'class-5', challengeMode: 'standard', playerDisplayMode: mode };
    assert.equal(replayRequestFromRoom(room).playerDisplayMode, mode, mode);
    assert.equal(replayRequestFromRoom(room).playerDisplayMode, replayExperienceFromRoom(room).playerDisplayMode);
  }
  const rush = {
    classId: 'class-5',
    challengeMode: 'graphFeatureRush',
    playerDisplayMode: 'firstName',
    graphFeatureRush: { config: { presetId: 'intercepts', families: ['linear'], features: ['xIntercept'], difficulty: 'standard' } },
  };
  assert.equal(replayRequestFromRoom(rush).playerDisplayMode, 'firstName', 'every game type, the rush included');
  // A room from before the setting: code names, as it had.
  assert.equal(replayRequestFromRoom({ classId: 'class-5', challengeMode: 'standard' }).playerDisplayMode, 'codeName');
});

/* ------------------------------ the wiring ------------------------------ */

const server = executableSource(read('functions/index.js'));
const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');

test('createLiveChallenge names every seat from the request\'s setting before any invite is written, and stores the setting on the room', () => {
  const create = region(server, 'exports.createLiveChallenge = onCall(', 'async function loadPrivateChallengePlayers', 'createLiveChallenge');
  assert.match(create, /const playerDisplayMode = engine\.experience\.normalizePlayerDisplayMode\(request\.data\?\.playerDisplayMode\);/);
  const records = region(create, 'const playerRecords = aliasOrder.map(', '}));', 'the seats');
  assert.match(records, /\.\.\.engine\.experience\.seatAliasUnder\(\{\s*room: \{ playerDisplayMode \},\s*student,\s*studentId: student\.studentId,\s*player: \{ codeAlias: challenge\.challengeAlias\(index, aliasSeed\) \},\s*\}\)/);
  const roomWrite = region(create, 'rootBatch.set(roomRef, {', 'rootBatch.set(privateRef, {', 'the room');
  assert.match(roomWrite, /\n\s+playerDisplayMode,\n/);
  const seats = region(create, 'batch.set(privateRef.collection("players").doc(player.studentId), {', 'await batch.commit();', 'seat and invite writes');
  assert.match(seats, /alias: player\.alias,\n\s+codeAlias: player\.codeAlias,/);
  const invite = region(seats, 'batch.set(db.collection(LIVE_CHALLENGE_INVITES).doc(player.studentId), {', '});', 'the invite');
  assert.match(invite, /alias: player\.alias,/);
});

test('a join puts the name the room\'s setting gives on the board, the seat and the invite, inside its transaction', () => {
  const join = region(server, 'exports.joinLiveChallenge = onCall(', '\n});\n', 'joinLiveChallenge');
  const transaction = region(join, 'const joined = await db.runTransaction(async (transaction) => {', 'return { playerKey: player.playerKey', 'the join transaction');
  // Read from the room and the student's record as this transaction saw them.
  assert.match(transaction, /const seat = experience\.seatAliasUnder\(\{\s*room,\s*student: gradeSnapshot\.exists \? gradeSnapshot\.data\(\) \|\| \{\} : \{\},\s*studentId,\s*player,\s*\}\);/);
  assert.match(region(transaction, 'const joinedPlayer = {', '};', 'the seat'), /alias: seat\.alias,\s*codeAlias: seat\.codeAlias,/);
  assert.match(region(transaction, 'transaction.set(publicPlayerRef, {', '}, { merge: true });', 'the public row'), /alias: seat\.alias,/);
  assert.doesNotMatch(region(transaction, 'transaction.set(publicPlayerRef, {', '}, { merge: true });', 'the public row'), /alias: player\.alias/);
  assert.match(region(transaction, 'transaction.set(inviteRef, {', '}, { merge: true });', 'the invite'), /alias: seat\.alias,/);
});

test('a student added mid-game is seated under the room\'s setting', () => {
  const invite = region(server, 'async function inviteStudentToClassLiveChallenge(db, studentId) {', 'async function inviteStudentToClassLiveChallengeSafely', 'late invite');
  assert.match(invite, /\.\.\.experience\.seatAliasUnder\(\{ room, student, studentId: id, player: \{ codeAlias: challenge\.challengeAlias\(slot, aliasSeed\) \} \}\)/);
  assert.match(region(invite, 'transaction.set(inviteRef, {', '});', 'the late invite'), /alias: player\.alias,/);
});

test('the teacher\'s create and Play Again both send the name setting with the create request', () => {
  const create = region(teacher, '  const create = async () => {', '\n  const control = async', 'create');
  // Each create call's request object: from the call to its closing `});`.
  const requests = create.split('created = await createLiveChallenge({').slice(1).map((rest) => rest.slice(0, rest.search(/\n\s*\}\);/)));
  assert.equal(requests.length, 2, 'the question-set game and the classic game');
  requests.forEach((request) => assert.match(request, /\n\s+playerDisplayMode,\n/));
  const replay = region(teacher, 'const playAgain = async () => {', '\n  };', 'play again');
  assert.match(replay, /const request = replayRequestFromRoom\(room, /);
  assert.match(replay, /created = await createLiveChallenge\(request\);/);
});
