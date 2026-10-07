// The end-of-game recap (functions/lib/liveChallengeRecap.js), against an
// in-memory Firestore. The emulator suite (tests/integration/
// liveChallengeRecap.test.mjs) plays real matches through the callables; this
// pins the contract the student screen consumes, in CI.
//
// WHY. The recap is the one place a student sees solutions, personal bests and
// recognitions after a game. It must give the asking student their OWN facts —
// and nothing about any classmate (id, alias, answers, rank) — only for a
// finished match they were in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const recap = require('../../functions/lib/liveChallengeRecap.js');

/* ---------------- a tiny in-memory Firestore (reads only) ---------------- */

const fakeDb = (documents) => {
  const queries = [];
  const docRef = (path) => ({
    path,
    id: path.split('/').pop(),
    get: async () => ({ exists: path in documents, id: path.split('/').pop(), data: () => documents[path] }),
    collection: (name) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path) => {
    const query = (filters = [], order = null, limitTo = Infinity) => ({
      where: (field, op, value) => query([...filters, [field, op, value]], order, limitTo),
      orderBy: (field, direction) => query(filters, [field, direction], limitTo),
      limit: (count) => query(filters, order, count),
      get: async () => {
        queries.push({ path, filters, order, limitTo });
        let rows = Object.entries(documents)
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
          .map(([key, data]) => ({ id: key.split('/').pop(), data: () => data, raw: data }));
        filters.forEach(([field, op, value]) => {
          rows = rows.filter((row) => (op === 'array-contains' ? (row.raw[field] || []).includes(value)
            : op === '<' ? row.raw[field] < value
              : row.raw[field] === value));
        });
        if (order) rows.sort((a, b) => (order[1] === 'desc' ? b.raw[order[0]] - a.raw[order[0]] : a.raw[order[0]] - b.raw[order[0]]));
        return { docs: rows.slice(0, limitTo) };
      },
    });
    return { doc: (id) => docRef(`${path}/${id}`), ...query() };
  };
  return {
    queries,
    collection: (name) => collectionRef(name),
    getAll: async (...refs) => Promise.all(refs.map((ref) => ref.get())),
  };
};

const fail = (code, message) => Object.assign(new Error(message), { code });
const failureOf = (promise) => promise.then(() => null, (error) => error);

const outcome = (roundIndex, isCorrect, { secondChance = false, elapsedMs = 5_000 } = {}) => ({
  roundIndex, isCorrect, scorePercent: isCorrect ? 100 : 0, secondChance, elapsedMs,
});
const standing = (studentId, extra = {}) => ({
  studentId,
  playerKey: `key-${studentId}`,
  alias: `Alias ${studentId}`,
  joined: true,
  joinedAtRound: 0,
  rank: 1,
  tied: false,
  score: 100,
  correctCount: 0,
  roundsAnswered: 0,
  answeredRounds: [],
  missedRounds: [],
  bestStreak: 0,
  roundOutcomes: [],
  ...extra,
});
const solution = (roundIndex, extra = {}) => ({
  roundIndex,
  originalRoundIndex: null,
  prompt: `Question ${roundIndex}`,
  teksCode: 'A.3(C)',
  available: true,
  solutionReview: { headline: `Solve ${roundIndex}`, reasoning: ['Step one.'], commonError: null, connection: null, answerSummary: '7' },
  revealedAtMs: 1,
  ...extra,
});

const ROOM = 'room-recap';
const ME = 'student-me';
const CLASSMATE = 'student-classmate';
const finishedResult = {
  roomId: ROOM,
  status: 'finished',
  title: 'Friday review',
  classId: 'class-1',
  assignmentId: 'assignment-7',
  modeId: null,
  scheduledRoundCount: 2,
  playedRoundCount: 3,
  secondChanceOf: { 2: 0 },
  playedCount: 2,
  finalizedAtMs: 50_000,
  studentIds: [ME, CLASSMATE],
  recognitions: [
    { id: 'mostImproved', label: 'Most improved', detail: 'public words', aliases: [`Alias ${ME}`], playerKeys: [`key-${ME}`], classWide: false },
    { id: 'firstToAnswer', label: 'First to answer', detail: 'public words', aliases: [`Alias ${CLASSMATE}`], playerKeys: [`key-${CLASSMATE}`], classWide: false },
  ],
  standings: [
    standing(CLASSMATE, { rank: 1, score: 900, correctCount: 2, roundsAnswered: 2, answeredRounds: [0, 1], roundOutcomes: [outcome(0, true, { elapsedMs: 1_000 }), outcome(1, true)] }),
    standing(ME, {
      rank: 2,
      score: 400,
      correctCount: 1,
      roundsAnswered: 2,
      answeredRounds: [0, 1],
      bestStreak: 1,
      roundOutcomes: [outcome(0, false), outcome(1, true), outcome(2, true, { secondChance: true })],
    }),
    standing('student-absent', { joined: false, rank: null }),
  ],
};
const earlierResult = {
  roomId: 'room-earlier',
  status: 'finished',
  classId: 'class-1',
  scheduledRoundCount: 2,
  finalizedAtMs: 10_000,
  studentIds: [ME],
  standings: [standing(ME, { correctCount: 0, roundOutcomes: [outcome(0, false), outcome(1, false)] })],
};
const laterResult = { ...earlierResult, roomId: 'room-later', finalizedAtMs: 90_000, standings: [standing(ME, { correctCount: 2, bestStreak: 2 })] };

const baseDocuments = () => ({
  [`liveChallengeMatchResults/${ROOM}`]: finishedResult,
  'liveChallengeMatchResults/room-earlier': earlierResult,
  'liveChallengeMatchResults/room-later': laterResult,
  [`liveChallengeRooms/${ROOM}`]: { status: 'finished' },
  [`liveChallengeRooms/${ROOM}/solutions/0`]: solution(0),
  [`liveChallengeRooms/${ROOM}/solutions/1`]: solution(1, { available: false, solutionReview: null }),
  [`liveChallengeRooms/${ROOM}/solutions/2`]: solution(2, { originalRoundIndex: 0 }),
});

test('the recap gives a student their own rounds, solutions, bests and recognitions — exactly the contract', async () => {
  const db = fakeDb(baseDocuments());
  const response = await recap.buildLiveChallengeMatchRecap(db, { roomId: ROOM, studentId: ME, fail });
  assert.deepEqual(Object.keys(response).sort(), ['finalizedAtMs', 'firstGame', 'personalBests', 'recognitions', 'roomId', 'rounds', 'self', 'status', 'title', 'warmup']);
  assert.equal(response.status, 'finished');
  assert.deepEqual(response.self, {
    joined: true, rank: 2, tied: false, playerCount: 2, score: 400, correctCount: 1, roundsAnswered: 2, roundsAvailable: 2,
  });
  assert.deepEqual(response.rounds.map((round) => round.roundIndex), [0, 1, 2], 'every played round, replays included, ascending');
  const [first, second, replay] = response.rounds;
  assert.deepEqual(Object.keys(first).sort(), ['answered', 'isCorrect', 'originalRoundIndex', 'prompt', 'roundIndex', 'scorePercent', 'secondChance', 'solutionAvailable', 'solutionReview', 'teksCode']);
  assert.equal(first.answered, true);
  assert.equal(first.isCorrect, false);
  assert.equal(first.solutionAvailable, true);
  assert.equal(first.solutionReview.headline, 'Solve 0');
  assert.equal(second.solutionAvailable, false, 'a round with no authored review says so');
  assert.equal(second.solutionReview, null);
  assert.equal(replay.secondChance, true);
  assert.equal(replay.originalRoundIndex, 0);
  assert.equal(replay.isCorrect, true);
  // Recognitions: only mine, in my words.
  assert.deepEqual(response.recognitions.map((entry) => entry.id), ['mostImproved']);
  assert.match(response.recognitions[0].detail, /your second half/i);
  // Personal bests against the EARLIER game only (the later one is ignored).
  assert.equal(response.firstGame, false);
  assert.deepEqual(response.personalBests.map((best) => best.id), ['mostCorrect', 'longestStreak', 'fastestCorrect']);
  assert.deepEqual(response.warmup, { assignmentId: 'assignment-7', countsAsWarmUp: true });
  // Nothing about anyone else.
  const text = JSON.stringify(response);
  for (const leak of [CLASSMATE, `key-${CLASSMATE}`, `Alias ${CLASSMATE}`, 'student-absent', `key-${ME}`, `Alias ${ME}`]) {
    assert.equal(text.includes(leak), false, `the recap does not carry ${leak}`);
  }
  // The history read is the indexed query, strictly before this match.
  const history = db.queries.find((query) => query.path === 'liveChallengeMatchResults');
  assert.deepEqual(history.filters, [['studentIds', 'array-contains', ME], ['finalizedAtMs', '<', 50_000]]);
  assert.deepEqual(history.order, ['finalizedAtMs', 'desc']);
  assert.equal(history.limitTo, 25);
});

test('a first game says so and claims no bests', async () => {
  const documents = baseDocuments();
  delete documents['liveChallengeMatchResults/room-earlier'];
  const response = await recap.buildLiveChallengeMatchRecap(fakeDb(documents), { roomId: ROOM, studentId: ME, fail });
  assert.equal(response.firstGame, true);
  assert.deepEqual(response.personalBests, []);
});

test('a student not in the match is refused; so is an unfinished or cancelled match', async () => {
  const outsider = await failureOf(recap.buildLiveChallengeMatchRecap(fakeDb(baseDocuments()), { roomId: ROOM, studentId: 'student-elsewhere', fail }));
  assert.equal(outsider?.code, 'permission-denied');

  const running = {
    [`liveChallengeRooms/${ROOM}`]: { status: 'running' },
    [`liveChallengePrivate/${ROOM}/players/${ME}`]: { studentId: ME },
  };
  const unfinished = await failureOf(recap.buildLiveChallengeMatchRecap(fakeDb(running), { roomId: ROOM, studentId: ME, fail }));
  assert.equal(unfinished?.code, 'failed-precondition');
  const strangerInRunning = await failureOf(recap.buildLiveChallengeMatchRecap(fakeDb(running), { roomId: ROOM, studentId: 'student-elsewhere', fail }));
  assert.equal(strangerInRunning?.code, 'permission-denied');
  const missing = await failureOf(recap.buildLiveChallengeMatchRecap(fakeDb({}), { roomId: ROOM, studentId: ME, fail }));
  assert.equal(missing?.code, 'not-found');

  const cancelled = { ...baseDocuments(), [`liveChallengeMatchResults/${ROOM}`]: { ...finishedResult, status: 'cancelled' } };
  const refused = await failureOf(recap.buildLiveChallengeMatchRecap(fakeDb(cancelled), { roomId: ROOM, studentId: ME, fail }));
  assert.equal(refused?.code, 'failed-precondition');
});

test('a student who was invited but never joined sees the solutions, not a place', async () => {
  const response = await recap.buildLiveChallengeMatchRecap(fakeDb(baseDocuments()), { roomId: ROOM, studentId: 'student-absent', fail });
  assert.equal(response.self.joined, false);
  assert.equal(response.self.rank, null);
  assert.equal(response.self.roundsAvailable, 0);
  assert.ok(response.rounds.every((round) => round.answered === false));
  assert.deepEqual(response.recognitions, []);
  assert.deepEqual(response.warmup, { assignmentId: 'assignment-7', countsAsWarmUp: false });
});

test('the rewards effect and the recap agree on who set a personal best', async () => {
  const db = fakeDb(baseDocuments());
  assert.deepEqual(await recap.personalBestStudentIds(db, finishedResult), [ME], 'the classmate had no earlier game: a first game claims nothing');
  // A result finished before recognitions existed is never re-rewarded.
  const { recognitions: _recognitions, ...old } = finishedResult;
  assert.deepEqual(await recap.personalBestStudentIds(db, old), []);
  assert.deepEqual(await recap.personalBestStudentIds(db, { ...finishedResult, status: 'cancelled' }), []);
});

test('a student who joined after the last round gets no Warm-Up grade, and the recap does not claim one', async () => {
  // joinedAtRound equals the rounds reached: nothing to measure them on, so
  // warmupChallengeScore records nothing — "counts as your Warm-Up" would lie.
  const late = {
    ...finishedResult,
    standings: [...finishedResult.standings, standing('student-late', { rank: 3, joinedAtRound: 2 })],
    studentIds: [...finishedResult.studentIds, 'student-late'],
  };
  const documents = { ...baseDocuments(), [`liveChallengeMatchResults/${ROOM}`]: late };
  const response = await recap.buildLiveChallengeMatchRecap(fakeDb(documents), { roomId: ROOM, studentId: 'student-late', fail });
  assert.equal(response.self.joined, true);
  assert.equal(response.self.roundsAvailable, 0);
  assert.deepEqual(response.warmup, { assignmentId: 'assignment-7', countsAsWarmUp: false });
});
