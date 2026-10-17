// The server's own pacing for a Live Challenge no host screen is driving, and
// the invite a student added to the class mid-game gets — through the real
// callables and the real scheduled function against a real Firestore. Run
// through `npm run test:challenge-finish`.
//
// WHY (docs/qa/student-experience-pass-3/06-open-items-qa-docs.md Q-23, Q-58):
//
//   - a round whose deadline passed with no console open never closed: the
//     class waited on "Time's up! The results are coming." until the teacher
//     came back, and a game the teacher never came back to never finished;
//   - a student added to the class after the game was created was not
//     invited until the next game.
//
// The integration files share one emulator and run in parallel. A scheduler
// run takes the rooms due by its scheduleTime, so this suite backdates its own
// rooms into 2000 and runs the sweep "scheduled" in 2001: no other suite's
// room is ever due in it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const sweep = await import(path.join(repo, 'functions/shared/liveChallengeServerSweep.mjs'));
const { buildChallengeRewardPolicy } = await import(path.join(repo, 'src/platform/rewards/challengeRewardPolicy.js'));
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const STANDARD = 'SWEEPSUITE1';
const ALIGNMENT_KEY = `texas:${STANDARD}`;
const LONG_AGO_MS = Date.UTC(2000, 0, 1);
const SWEEP_SCHEDULED_AT = '2001-01-01T00:00:00.000Z';

const teacherRequest = (email, data) => ({
  auth: { uid: `${email}-uid`, token: { role: 'teacher', email, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const studentRequest = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const rootRequest = (data) => ({
  auth: { uid: 'sweep-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const call = (name, request) => functionsIndex[name].run(request);
const failureOf = (promise) => promise.then(() => null, (error) => error);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const millis = (value) => value?.toMillis?.() ?? null;
const runSweep = () => functionsIndex.closeOverdueLiveChallengeRounds.run({ scheduleTime: SWEEP_SCHEDULED_AT });

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const privateOf = async (roomId) => (await privateRef(roomId).get()).data() || null;
const hostRound = async (roomId, roundIndex) => (await roomRef(roomId).collection('hostRounds').doc(String(roundIndex)).get()).data() || null;
const publicScores = async (roomId) => Object.fromEntries((await roomRef(roomId).collection('players').get()).docs.map((doc) => [doc.id, doc.data().score]));
const playerKeyOf = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data()?.playerKey || null;
const inviteOf = async (studentId) => (await db.collection('liveChallengeInvites').doc(studentId).get()).data() || null;

/* ---------- a bank of gradable questions, and one class per scenario ---------- */

const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `sweep-probe|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
assert.ok(bank.length >= 3, 'the seed bank must hold at least three gradable choice questions');
await Promise.all(bank.map((item) => {
  const id = `${item.id}--sweep-suite`;
  return db.collection('pathQuestionBank').doc(id).set({
    ...item, id, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, ALIGNMENT_KEY],
  });
}));

/** A teacher, their class and its students. One active game per teacher, so one class per scenario. */
const seedClass = async (tag, studentCount = 2) => {
  const teacher = `sweep-${tag}-teacher@example.com`;
  const classId = `sweep-${tag}-class`;
  await db.collection('classes').doc(classId).set({ teacherOfRecord: teacher, status: 'active', course: 'algebra1', period: '3', name: `Sweep ${tag}` });
  const students = [];
  for (let index = 0; index < studentCount; index += 1) {
    const studentId = `sweep-${tag}-s${index + 1}`;
    students.push(studentId);
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      assignedTeacherEmail: teacher, classId, classPeriod: '3', firstName: `Sweep${index + 1}`, lastName: tag,
    });
  }
  return { teacher, classId, students, as: (data) => teacherRequest(teacher, data) };
};

const create = (klass, extra = {}) => call('createLiveChallenge', klass.as({
  classId: klass.classId,
  courseId: 'algebra1',
  standardCode: STANDARD,
  questionStyle: 'noTools',
  roundCount: 3,
  roundSeconds: 30,
  scoringStrategyId: 'grandPrix',
  rewardPolicy: buildChallengeRewardPolicy({ passPlaces: 1, championBadge: true }),
  ...extra,
}));

const responseFor = async (roomId, roundIndex, { correct }) => {
  const state = await privateOf(roomId);
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  assert.ok(questionId.endsWith('--sweep-suite'), `round ${roundIndex} drew ${questionId} from outside this suite`);
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return { responses: Object.fromEntries(plan.privateGrading.fields.map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) };
};
const waitForRoundStart = async (roomId) => {
  const delay = Math.max(0, (millis((await roomOf(roomId)).startsAt) || 0) - Date.now() + 25);
  if (delay) await sleep(delay);
};
const answer = async (roomId, studentId, { correct }) => {
  const room = await roomOf(roomId);
  return call('submitLiveChallengeResponse', studentRequest(studentId, {
    roomId,
    roundIndex: room.currentRound,
    roundVersion: room.roundVersion,
    roundToken: room.roundToken,
    submissionId: randomUUID(),
    humanElapsedMs: 2_000,
    responsePayload: await responseFor(roomId, room.currentRound, { correct }),
  }));
};

/** A game in round 0 with the class's two students in: one right, one wrong. Nobody has closed it. */
const roundZeroPlayed = async (klass) => {
  const { roomId } = await create(klass);
  for (const studentId of klass.students) {
    // eslint-disable-next-line no-await-in-loop
    await call('joinLiveChallenge', studentRequest(studentId, { roomId }));
  }
  await call('startLiveChallenge', klass.as({ roomId }));
  await waitForRoundStart(roomId);
  await answer(roomId, klass.students[0], { correct: true });
  await answer(roomId, klass.students[1], { correct: false });
  return roomId;
};

/** The teacher's console went away and the round's deadline is long past. */
const deadlinePassedLongAgo = async (roomId) => {
  const startsAt = Timestamp.fromMillis(LONG_AGO_MS - 40_000);
  const endsAt = Timestamp.fromMillis(LONG_AGO_MS - 10_000);
  await roomRef(roomId).set({ startsAt, roundStartedAt: startsAt, endsAt, roundEndsAt: endsAt }, { merge: true });
  await privateRef(roomId).set({ serverSweepDueAt: Timestamp.fromMillis(LONG_AGO_MS) }, { merge: true });
};

/** The round's results have stood, with no host screen heard, far past the host-away window. */
const resultsAbandonedLongAgo = async (roomId) => {
  await roomRef(roomId).set({ roundClosedAt: Timestamp.fromMillis(LONG_AGO_MS) }, { merge: true });
  await privateRef(roomId).set({ serverSweepDueAt: Timestamp.fromMillis(LONG_AGO_MS), hostHeardAt: null }, { merge: true });
};

/* ===================== Q-23: an overdue round, no host screen ===================== */

const ALONE = await seedClass('alone');
let aloneRoom;
let aloneScoresByRank;

test('a round opening tells the server when to close it if nobody else does', async () => {
  aloneRoom = await roundZeroPlayed(ALONE);
  const room = await roomOf(aloneRoom);
  const state = await privateOf(aloneRoom);
  assert.equal(millis(state.serverSweepDueAt), millis(room.endsAt) + sweep.SERVER_CLOSE_GRACE_MS, 'the deadline plus the grace');
  assert.ok(sweep.SERVER_CLOSE_GRACE_MS > 1_500, 'later than an open console closes it');
});

test('an overdue round with no console or projector open is closed by the server', async () => {
  await deadlinePassedLongAgo(aloneRoom);
  assert.equal((await roomOf(aloneRoom)).roundState, 'open', 'nothing has closed it: the class is waiting on "Time\'s up"');
  const before = Date.now();
  await runSweep();
  const room = await roomOf(aloneRoom);
  assert.equal(room.status, 'running');
  assert.equal(room.roundState, 'closed', 'the round is closed');
  assert.equal(room.phase, 'results', 'every screen moves to the results');
  const round = await hostRound(aloneRoom, 0);
  assert.ok(round?.standingsAfterRound?.length === 2, "the console's own close wrote the round's results and standings");
  const standings = (await roomRef(aloneRoom).collection('standings').doc('current').get()).data();
  assert.equal(standings?.kind, 'roundClosed', "the students' standings are the closed round's");
  const scores = await publicScores(aloneRoom);
  round.standingsAfterRound.forEach((row) => assert.equal(row.score, scores[row.playerKey]));
  aloneScoresByRank = round.standingsAfterRound.map((row) => row.score);
  assert.ok(aloneScoresByRank[0] > aloneScoresByRank[1], 'the right answer leads');
  const due = millis((await privateOf(aloneRoom)).serverSweepDueAt);
  assert.ok(due >= before + sweep.HOST_AWAY_FINISH_MS && due <= Date.now() + sweep.HOST_AWAY_FINISH_MS, 'the results are looked at again after the host-away window');
});

test('a run on results a moment old changes nothing and looks again later', async () => {
  const roundBefore = await hostRound(aloneRoom, 0);
  const scoresBefore = await publicScores(aloneRoom);
  await privateRef(aloneRoom).set({ serverSweepDueAt: Timestamp.fromMillis(LONG_AGO_MS) }, { merge: true });
  // Results that have stood a few seconds, a host-away window still to go.
  await runSweep();
  assert.deepEqual(await publicScores(aloneRoom), scoresBefore, 'no placement points added twice');
  assert.equal(millis((await hostRound(aloneRoom, 0)).closedAt), millis(roundBefore.closedAt), 'the round is not closed again');
  assert.equal((await roomOf(aloneRoom)).status, 'running', 'results a moment old are not ended');
  assert.ok(millis((await privateOf(aloneRoom)).serverSweepDueAt) > Date.now(), 'rescheduled, not dropped');
});

test('results nobody moves on from, with no host heard, end the game once — with its standings and rewards', async () => {
  await resultsAbandonedLongAgo(aloneRoom);
  const before = await hostRound(aloneRoom, 0);
  // Two runs at once (a slow run overlapping the next).
  await Promise.all([runSweep(), runSweep()]);
  const room = await roomOf(aloneRoom);
  assert.equal(room.status, 'finished', 'the game is finished');
  assert.equal(room.endedBy, 'hostAway', 'and says the server ended it');
  const result = (await db.collection('liveChallengeMatchResults').doc(aloneRoom).get()).data();
  assert.equal(result.finalizationId, room.finalizationId, 'one finish');
  const finalByKey = Object.fromEntries(result.standings.map((row) => [row.playerKey, row]));
  before.standingsAfterRound.forEach((row) => assert.equal(finalByKey[row.playerKey].rank, row.rank, 'the final standings are the results the class saw'));
  const finalSnapshot = (await roomRef(aloneRoom).collection('standings').doc('current').get()).data();
  assert.equal(finalSnapshot?.kind, 'final');
  assert.equal(result.effectsPending, false, 'report, invites, evidence and rewards all ran');
  assert.equal(result.effects.rewards, 'done');
  for (const studentId of ALONE.students) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await inviteOf(studentId))?.status, 'finished', `${studentId}'s screen moves to the final card`);
  }
  assert.equal((await db.collection('liveChallengeTeacherActive').doc(ALONE.teacher).get()).exists, false, "the teacher's next game is not blocked");
  // And once more: still one finish.
  await runSweep();
  assert.equal((await roomOf(aloneRoom)).finalizationId, room.finalizationId);
});

/* ============ racing the console, and a teacher who is still there ============ */

test("a console's close and the server's close at the same moment close the round once", async () => {
  const klass = await seedClass('race');
  const roomId = await roundZeroPlayed(klass);
  await deadlinePassedLongAgo(roomId);
  const room = await roomOf(roomId);
  const [consoleClose, ...runs] = await Promise.all([
    call('closeLiveChallengeRound', klass.as({ roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion })),
    runSweep(),
    runSweep(),
  ]);
  assert.equal(consoleClose.roundState, 'closed', 'the console is told the round is closed, whoever closed it');
  const freshCloses = (consoleClose.alreadyApplied ? 0 : 1) + runs.filter((run) => run.outcomes[roomId] === 'closed').length;
  assert.equal(freshCloses, 1, 'exactly one of the three closed it; the others were told it was closed');
  const round = await hostRound(roomId, 0);
  const scores = await publicScores(roomId);
  round.standingsAfterRound.forEach((row) => assert.equal(row.score, scores[row.playerKey]));
  assert.deepEqual(round.standingsAfterRound.map((row) => row.score), aloneScoresByRank, 'the same points as a round closed once');
  await call('finishLiveChallenge', klass.as({ roomId }));
});

test('a host still heard on the results keeps the game going', async () => {
  const klass = await seedClass('present');
  const roomId = await roundZeroPlayed(klass);
  await call('closeLiveChallengeRound', klass.as({ roomId, force: true }));
  await resultsAbandonedLongAgo(roomId);
  // The console's clock calibration is its heartbeat.
  const heardFrom = Date.now();
  await call('calibrateLiveChallengeClock', klass.as({ roomId }));
  const heard = millis((await privateOf(roomId)).hostHeardAt);
  assert.ok(heard >= heardFrom - 1_000, "the console's calibration records the host");
  await runSweep();
  assert.equal((await roomOf(roomId)).status, 'running', 'the teacher talking the round through is not ended');
  assert.equal(millis((await privateOf(roomId)).serverSweepDueAt), heard + sweep.HOST_AWAY_FINISH_MS, 'looked at again a host-away window after the host was last heard');
  await call('finishLiveChallenge', klass.as({ roomId }));
});

test("another teacher's calibration is not this game's host", async () => {
  const klass = await seedClass('stranger');
  const { roomId } = await create(klass);
  await call('calibrateLiveChallengeClock', teacherRequest('sweep-someone-else@example.com', { roomId }));
  assert.equal((await privateOf(roomId)).hostHeardAt, undefined);
  await call('cancelLiveChallenge', klass.as({ roomId }));
});

test('Next Round racing the server ending abandoned results: one outcome, never both', async () => {
  // Nothing was heard from this console for the whole window, so either may
  // land first. Whichever does, the other must see it: a round the teacher
  // opened is never ended under them (the finish re-checks the round inside
  // its transaction), and a game the server ended is never reopened.
  const klass = await seedClass('returns');
  const roomId = await roundZeroPlayed(klass);
  await call('closeLiveChallengeRound', klass.as({ roomId, force: true }));
  await resultsAbandonedLongAgo(roomId);
  const room = await roomOf(roomId);
  const [advanced] = await Promise.all([
    call('advanceLiveChallenge', klass.as({ roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion })),
    runSweep(),
  ]);
  const after = await roomOf(roomId);
  if (after.status === 'running') {
    assert.equal(after.currentRound, 1, 'the round the teacher opened is played');
    assert.equal(after.roundState, 'open');
    assert.equal(advanced.roundIndex, 1);
    assert.equal((await db.collection('liveChallengeMatchResults').doc(roomId).get()).exists, false, 'and nothing finished it');
    await call('finishLiveChallenge', klass.as({ roomId }));
  } else {
    assert.equal(after.status, 'finished');
    assert.equal(after.currentRound, 0, 'the server finished first; no round was opened after it');
    assert.equal(advanced.alreadyApplied, true, 'the console is told the game already moved on');
  }
});

test('a finished game is never swept again, even if its private state outlived the finish', async () => {
  const klass = await seedClass('ended');
  const { roomId } = await create(klass);
  await call('joinLiveChallenge', studentRequest(klass.students[0], { roomId }));
  await call('startLiveChallenge', klass.as({ roomId }));
  assert.ok((await privateOf(roomId)).serverSweepDueAt, 'a running round is due');
  await call('finishLiveChallenge', klass.as({ roomId }));
  const finished = await roomOf(roomId);
  // The private state's cleanup failed and left a due time behind.
  await privateRef(roomId).set({ roomId, serverSweepDueAt: Timestamp.fromMillis(LONG_AGO_MS) }, { merge: true });
  await runSweep();
  assert.equal((await privateOf(roomId)).serverSweepDueAt, null, 'the sweep drops it');
  assert.equal((await roomOf(roomId)).finalizationId, finished.finalizationId, 'and changes nothing about the game');
});

/* ================ Q-58: a student added to the class mid-game ================ */

const lateStudent = async (tag) => {
  const studentId = `sweep-late-${tag}`;
  await db.collection('grades').doc(studentId).set({ firstName: 'Late', lastName: tag, classPeriod: 'Unassigned' });
  return studentId;
};

test('a student added to the class while the game is running is invited, and plays from the round that is open', async () => {
  const klass = await seedClass('late-running');
  const roomId = await roundZeroPlayed(klass);
  await call('closeLiveChallengeRound', klass.as({ roomId, force: true }));
  const room = await roomOf(roomId);
  await call('advanceLiveChallenge', klass.as({ roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion }));
  const late = await lateStudent('running');
  await call('setStudentClass', rootRequest({ studentId: late, classId: klass.classId }));

  const invite = await inviteOf(late);
  assert.equal(invite?.roomId, roomId, 'their screen follows the invite into the game');
  assert.equal(invite.status, 'running', 'as a game already under way');
  const player = (await privateRef(roomId).collection('players').doc(late).get()).data();
  assert.equal(player.slot, 2, 'the next seat');
  assert.equal(player.alias, challenge.challengeAlias(2, parseInt((await import('node:crypto')).createHash('sha256').update(roomId).digest('hex').slice(0, 6), 16)));
  assert.equal(invite.playerKey, player.playerKey);
  const classmates = await Promise.all(klass.students.map((studentId) => privateRef(roomId).collection('players').doc(studentId).get()));
  assert.ok(classmates.every((doc) => doc.data().alias !== player.alias), 'a code name nobody else holds');
  assert.equal((await roomOf(roomId)).eligibleCount, 3, "the console's count includes them");

  const joined = await call('joinLiveChallenge', studentRequest(late, { roomId }));
  assert.equal(joined.joined, true);
  assert.equal((await privateRef(roomId).collection('players').doc(late).get()).data().joinedAtRound, 1, 'round 0 is not counted against them');
  await waitForRoundStart(roomId);
  await answer(roomId, late, { correct: true });
  await call('finishLiveChallenge', klass.as({ roomId }));
  const result = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data();
  assert.ok(result.standings.some((row) => row.studentId === late), 'they are in the final result');
});

test('a student added while the game is in its lobby is invited to it', async () => {
  const klass = await seedClass('late-lobby');
  const { roomId } = await create(klass);
  const late = await lateStudent('lobby');
  await call('setStudentClass', rootRequest({ studentId: late, classId: klass.classId }));
  assert.equal((await inviteOf(late))?.roomId, roomId);
  assert.equal((await inviteOf(late)).status, 'invited');
  await call('joinLiveChallenge', studentRequest(late, { roomId }));
  await call('startLiveChallenge', klass.as({ roomId }));
  assert.equal((await inviteOf(late)).status, 'running', 'the start moves their invite with everyone else\'s');
  // Adding them again changes nothing: same seat, same key.
  const key = await playerKeyOf(roomId, late);
  await call('setStudentClass', rootRequest({ studentId: late, classId: klass.classId }));
  assert.equal(await playerKeyOf(roomId, late), key);
  assert.equal((await roomOf(roomId)).eligibleCount, 3);
  await call('cancelLiveChallenge', klass.as({ roomId }));
});

test('a student already in another live game is not pulled out of it, and a class with no game invites nobody', async () => {
  const busy = await seedClass('late-busy');
  const other = await seedClass('late-other');
  const { roomId: busyRoom } = await create(busy);
  const { roomId: otherRoom } = await create(other);
  const mover = other.students[0];
  await call('setStudentClass', rootRequest({ studentId: mover, classId: busy.classId }));
  assert.equal((await inviteOf(mover))?.roomId, otherRoom, 'their game in the other class is still theirs');
  assert.equal((await privateRef(busyRoom).collection('players').doc(mover).get()).exists, false);
  await call('cancelLiveChallenge', other.as({ roomId: otherRoom }));
  await call('cancelLiveChallenge', busy.as({ roomId: busyRoom }));

  const quiet = await seedClass('late-quiet');
  const late = await lateStudent('quiet');
  await call('setStudentClass', rootRequest({ studentId: late, classId: quiet.classId }));
  assert.equal(await inviteOf(late), null, 'no game, no invite');
  const refused = await failureOf(call('joinLiveChallenge', studentRequest(late, { roomId: busyRoom })));
  assert.ok(refused, 'and nobody joins a room they were not invited to');
});
