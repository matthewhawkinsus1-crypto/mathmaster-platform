// A student's Live Challenge screen: the pure models behind it — the rounds a
// device missed while away, the end-of-game recap, and a student's own round
// clock under extended time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSED_ROUNDS_LOOKBACK,
  missedRoundsNotice,
  missedRoundsStorageKey,
  readLastSeenRound,
  roundsClosedWhileAway,
  seenRoundOf,
  unansweredRounds,
  writeLastSeenRound,
} from '../../src/platform/liveChallenge/challengeMissedRounds.js';
import {
  finalPlaceIsPrivate,
  gameGradeSentence,
  normalizeMatchRecap,
  normalizeSolutionReview,
  recapHasContent,
  recapHighlights,
  recapRoundResult,
} from '../../src/platform/liveChallenge/challengeRecapModel.js';
import { personalRoundClock } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { personalRoundTimer } from '../../functions/shared/liveChallengeAccommodations.mjs';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    values,
  };
};
const throwingStorage = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceeded'); },
};

/* ------------------------------ missed rounds ------------------------------ */

test('a tab remembers the last round it saw per room, and a refusing storage costs nothing', () => {
  const storage = memoryStorage();
  assert.equal(readLastSeenRound(storage, 'room-a'), null, 'a first look is not a return');
  writeLastSeenRound(storage, 'room-a', { roundIndex: 2, closed: false });
  assert.deepEqual({ ...readLastSeenRound(storage, 'room-a') }, { roundIndex: 2, closed: false });
  assert.equal(readLastSeenRound(storage, 'room-b'), null, 'per room');
  assert.ok(storage.values.has(missedRoundsStorageKey('room-a')));
  storage.setItem(missedRoundsStorageKey('room-c'), '{not json');
  assert.equal(readLastSeenRound(storage, 'room-c'), null, 'a damaged entry is no memory');
  assert.doesNotThrow(() => writeLastSeenRound(throwingStorage, 'room-a', { roundIndex: 1, closed: true }));
  assert.equal(readLastSeenRound(throwingStorage, 'room-a'), null);
  assert.equal(readLastSeenRound(null, 'room-a'), null);
});

test('what a room snapshot shows of the rounds', () => {
  assert.equal(seenRoundOf({ status: 'lobby', currentRound: 0 }), null);
  assert.equal(seenRoundOf({ status: 'cancelled', currentRound: 3 }), null);
  assert.deepEqual({ ...seenRoundOf({ status: 'running', currentRound: 3, roundState: 'open' }) }, { roundIndex: 3, closed: false });
  assert.deepEqual({ ...seenRoundOf({ status: 'running', currentRound: 3, roundState: 'closed' }) }, { roundIndex: 3, closed: true });
  assert.deepEqual({ ...seenRoundOf({ status: 'finished', currentRound: 4 }) }, { roundIndex: 4, closed: true }, 'a finished game closed every round');
});

test('the rounds that may have closed while a device was away', () => {
  const open = (roundIndex) => ({ roundIndex, closed: false });
  const closed = (roundIndex) => ({ roundIndex, closed: true });
  // Saw round 3 open, back at round 5 open: rounds 3 and 4 closed meanwhile.
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: open(2), now: open(4) }), [2, 3]);
  // Saw round 3's results: only round 4 closed unseen.
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: closed(2), now: open(4) }), [3]);
  // The round on screen is still open, or showing its own results: never missed.
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: open(2), now: open(2) }), []);
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: open(2), now: closed(2) }), [], 'its results card says "No answer" itself');
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: closed(2), now: open(3) }), [], 'a connected device saw every round close');
  // A game that finished while the device was away: its last round too.
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: open(3), now: closed(4), finished: true }), [3, 4]);
  // No memory (a first look) or no round now: nothing.
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: null, now: open(4) }), []);
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: open(1), now: null }), []);
  // A late joiner's rounds before they joined are never theirs to miss.
  assert.deepEqual(roundsClosedWhileAway({ lastSeen: open(0), now: open(5), joinedAtRound: 3 }), [3, 4]);
  // Bounded: a device asleep for a whole marathon reads a bounded window.
  const long = roundsClosedWhileAway({ lastSeen: open(0), now: open(100) });
  assert.equal(long.length, MISSED_ROUNDS_LOOKBACK);
  assert.equal(long.at(-1), 99);
});

test('a round is missed only when the student was in it and did not answer', () => {
  const summary = (rows) => ({ standings: rows });
  const results = [
    { roundIndex: 2, summary: summary([{ playerKey: 'me', participated: true }, { playerKey: 'p2', participated: false }]) },
    { roundIndex: 3, summary: summary([{ playerKey: 'me', participated: false }, { playerKey: 'p2', participated: true }]) },
    { roundIndex: 4, summary: summary([{ playerKey: 'p2', participated: true }]) }, // not in it yet
    { roundIndex: 5, summary: null }, // no result could be read
  ];
  assert.deepEqual(unansweredRounds(results, 'me'), [3]);
  assert.deepEqual(unansweredRounds(results, 'p2'), [2]);
  assert.deepEqual(unansweredRounds(results, null), [], 'no key, no claim');
});

test('the missed-round notice is one plain sentence', () => {
  assert.equal(missedRoundsNotice([2]), 'Round 3 closed while you were away, so no answer was recorded for it.');
  assert.equal(missedRoundsNotice([2, 3]), 'Round 3 and round 4 closed while you were away, so no answers were recorded for them.');
  assert.equal(missedRoundsNotice([1, 2, 5], { scheduledRoundCount: 5 }), 'Round 2, round 3 and Second Chance round 1 closed while you were away, so no answers were recorded for them.');
  assert.equal(missedRoundsNotice([5], { scheduledRoundCount: 5 }), 'Second Chance round 1 closed while you were away, so no answer was recorded for it.');
  assert.equal(missedRoundsNotice([]), '');
});

/* ------------------------------ the recap ------------------------------ */

const recapReply = {
  roomId: 'room-a',
  title: 'Friday game',
  status: 'finished',
  finalizedAtMs: 1_000,
  self: { joined: true, rank: 18, tied: false, playerCount: 24, score: 1430.4, correctCount: 3, roundsAnswered: 4, roundsAvailable: 5 },
  rounds: [
    { roundIndex: 1, originalRoundIndex: null, secondChance: false, answered: true, isCorrect: false, scorePercent: 60, prompt: 'Solve $2x = 6$.', teksCode: 'A.5A', solutionAvailable: true, solutionReview: { headline: 'Divide both sides by 2', reasoning: ['$2x = 6$', '$x = 3$'], commonError: 'Subtracting 2.', connection: '', answerSummary: '$x = 3$' } },
    { roundIndex: 0, secondChance: false, answered: true, isCorrect: true, scorePercent: 100, prompt: 'p', solutionAvailable: false, solutionReview: { headline: 'should not show' } },
    { roundIndex: 2, secondChance: false, answered: false, isCorrect: null, scorePercent: null, solutionAvailable: true, solutionReview: null },
    { roundIndex: 5, originalRoundIndex: 1, secondChance: true, answered: true, isCorrect: false, scorePercent: 0, solutionAvailable: false },
    { roundIndex: 'x' },
  ],
  personalBests: [{ id: 'mostCorrect', label: 'Your most correct answers yet', detail: '3 correct', value: 3, previous: 2 }, { label: '' }],
  firstGame: false,
  recognitions: [{ id: 'steadiest', label: 'Steadiest', detail: 'Answered every round' }],
  warmup: { assignmentId: 'a1', countsAsWarmUp: true },
};

test('the recap reply is read defensively, rounds in order, only this game', () => {
  const recap = normalizeMatchRecap(recapReply, { roomId: 'room-a', scheduledRoundCount: 5 });
  assert.ok(recap);
  assert.deepEqual(recap.rounds.map((round) => round.roundIndex), [0, 1, 2, 5], 'ascending, malformed rounds dropped');
  assert.equal(recap.rounds[0].solutionReview, null, 'a solution the server did not mark available is not shown');
  assert.equal(recap.rounds[1].solutionReview.headline, 'Divide both sides by 2');
  assert.deepEqual([...recap.rounds[1].solutionReview.reasoning], ['$2x = 6$', '$x = 3$']);
  assert.equal(recap.rounds[3].label, 'Second Chance round 1');
  assert.equal(recap.rounds[3].replayOf, 'Round 2 again');
  assert.equal(recap.self.score, 1430);
  assert.equal(recap.personalBests.length, 1, 'a line with no label is dropped');
  assert.equal(recap.countsAsWarmUp, true);
  assert.ok(recapHasContent(recap));
  assert.equal(normalizeMatchRecap(recapReply, { roomId: 'room-b' }), null, 'another room\'s recap is not this one');
  assert.equal(normalizeMatchRecap({ ...recapReply, status: 'running' }, { roomId: 'room-a' }), null, 'only a finished game');
  assert.equal(normalizeMatchRecap(null), null);
  assert.equal(normalizeMatchRecap('nope'), null);
  // A reply with nothing in it shows nothing (the final card has said it all).
  assert.equal(recapHasContent(normalizeMatchRecap({}, { roomId: 'room-a' })), false);
  assert.equal(recapHasContent(null), false);
});

test('each of the student\'s rounds is Correct, X% credit, Not correct or No answer', () => {
  assert.equal(recapRoundResult({ answered: true, isCorrect: true }).text, 'Correct');
  assert.equal(recapRoundResult({ answered: true, isCorrect: false, scorePercent: 60 }).text, '60% credit');
  assert.equal(recapRoundResult({ answered: true, isCorrect: false, scorePercent: 0 }).text, 'Not correct');
  assert.equal(recapRoundResult({ answered: false }).text, 'No answer');
  assert.equal(recapRoundResult({ answered: false, isCorrect: true }).text, 'No answer', 'an unanswered round is never correct');
});

test('a worked solution with nothing to say is no solution', () => {
  assert.equal(normalizeSolutionReview(null), null);
  assert.equal(normalizeSolutionReview({ headline: '  ', reasoning: [], answerSummary: '' }), null);
  assert.equal(normalizeSolutionReview({ reasoning: ['one step'] }).reasoning.length, 1);
});

test('a recognition whose detail repeats its label reads once', () => {
  const recap = normalizeMatchRecap({ status: 'finished', recognitions: [{ id: 'bestComeback', label: 'Best comeback', detail: 'Best comeback — after a miss, you came back and got it right.' }] });
  assert.equal(recap.recognitions[0].detail, 'After a miss, you came back and got it right.');
  const plain = normalizeMatchRecap({ status: 'finished', recognitions: [{ id: 'steadiest', label: 'Steadiest', detail: 'Answered every round' }] });
  assert.equal(plain.recognitions[0].detail, 'Answered every round');
});

test('the final card leads with what the student earned and beat', () => {
  const recap = normalizeMatchRecap(recapReply, { roomId: 'room-a' });
  const lines = recapHighlights(recap);
  assert.deepEqual(lines.map((line) => line.kind), ['recognition', 'personalBest'], 'what they earned, then their own records');
  assert.deepEqual(recapHighlights(null), []);
  assert.equal(recapHighlights(recap, 1).length, 1);
});

test('what the game counts for is said truthfully', () => {
  // A Warm-Up game's accuracy IS the Warm-Up grade (warmupChallengeGrade.mjs).
  assert.equal(gameGradeSentence({ warmup: true }), 'Your accuracy counts as your Warm-Up; game points don’t.');
  assert.equal(gameGradeSentence({ warmup: false }), 'Game points are just for the game — they don’t change any grade.');
  assert.doesNotMatch(gameGradeSentence({ warmup: true }), /does not change/);
});

test('a final place is called private only when no class-wide board shows it', () => {
  // The projector and every classmate's final board show the top five, so a
  // 4th or 5th place is public; a full-standings room shows every place.
  for (const rank of [1, 3, 4, 5]) assert.equal(finalPlaceIsPrivate({ rank }), false, `place ${rank} is on the public top five`);
  assert.equal(finalPlaceIsPrivate({ rank: 6 }), true);
  assert.equal(finalPlaceIsPrivate({ rank: 18 }), true);
  assert.equal(finalPlaceIsPrivate({ rank: 18, fullStandings: true }), false, 'the teacher opted into full standings');
  assert.equal(finalPlaceIsPrivate({ rank: null }), false);
  assert.equal(finalPlaceIsPrivate(), false);
});

/* ------------------------------ a student's own clock ------------------------------ */

test('extended time: the student counts down to their own deadline, from the same start', () => {
  const start = 10_000;
  const end = 40_000; // a 30 s round
  const own = personalRoundClock({ startsAtMs: start, endsAtMs: end, timeMultiplier: 1.5 });
  assert.equal(own.endsAtMs, 55_000, 'start + 30 s × 1.5');
  assert.equal(own.durationMs, 45_000);
  assert.equal(own.extended, true);
  assert.equal(own.classEndsAtMs, end);
  // The exact deadline the server judges the answer against.
  assert.equal(own.endsAtMs, personalRoundTimer({ startsAtMs: start, endsAtMs: end }, 1.5).endsAtMs);
  // Everyone else: the room's clock, unchanged.
  for (const multiplier of [1, undefined, 0, -3, 'abc', null]) {
    const plain = personalRoundClock({ startsAtMs: start, endsAtMs: end, timeMultiplier: multiplier });
    assert.equal(plain.endsAtMs, end, `multiplier ${multiplier}`);
    assert.equal(plain.durationMs, 30_000);
    assert.equal(plain.extended, false);
  }
  // Never more than double: a class waits at most that long for one player.
  assert.equal(personalRoundClock({ startsAtMs: start, endsAtMs: end, timeMultiplier: 9 }).endsAtMs, 70_000);
  // An open-ended round (a Pace Race before its closing threshold) has no deadline to stretch.
  const openEnded = personalRoundClock({ startsAtMs: start, endsAtMs: 0, timeMultiplier: 1.5 });
  assert.equal(openEnded.durationMs, 0);
  assert.equal(openEnded.extended, false);
});
