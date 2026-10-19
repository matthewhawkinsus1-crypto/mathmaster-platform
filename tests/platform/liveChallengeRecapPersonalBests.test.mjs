// Personal bests (functions/shared/liveChallengePersonalBests.mjs).
//
// WHY. Most students never win a Live Challenge; every student can beat their
// own last game. A personal best compares a student only with themselves, in
// the same class, against games finished BEFORE this one — so a rewards effect
// retried after the student has played again reaches the same answer. A first
// game claims nothing: with nothing to beat, "best" would mean nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_ACCURACY_ANSWERED,
  MIN_FASTER_MS,
  PERSONAL_BEST_ID,
  personalBestsFor,
  personalMetrics,
} from '../../functions/shared/liveChallengePersonalBests.mjs';

const STUDENT = 'student-pb';
const outcome = (roundIndex, isCorrect, elapsedMs = 6_000, secondChance = false) => ({
  roundIndex, isCorrect, scorePercent: isCorrect ? 100 : 0, secondChance, elapsedMs,
});
const standing = ({ outcomes = [], bestStreak = 0, joined = true, studentId = STUDENT } = {}) => ({
  studentId,
  playerKey: `key-${studentId}`,
  alias: 'Alias',
  joined,
  correctCount: outcomes.filter((entry) => entry.isCorrect).length,
  bestStreak,
  roundOutcomes: outcomes,
});
let clock = 1_000;
const result = (roomId, standings, { classId = 'class-1', status = 'finished', scheduled = 5, finalizedAtMs = (clock += 1_000), modeId = null } = {}) => ({
  roomId, classId, status, scheduledRoundCount: scheduled, finalizedAtMs, modeId, standings,
});
const ids = (bests) => bests.personalBests.map((best) => best.id);

const earlier = result('room-1', [standing({ outcomes: [outcome(0, true, 8_000), outcome(1, false), outcome(2, true), outcome(3, false)], bestStreak: 1 })]);
const better = result('room-2', [standing({ outcomes: [outcome(0, true, 4_000), outcome(1, true), outcome(2, true), outcome(3, false)], bestStreak: 3 })]);

test('a first game claims no personal bests', () => {
  const bests = personalBestsFor({ matchResult: better, studentId: STUDENT, previousResults: [] });
  assert.equal(bests.firstGame, true);
  assert.deepEqual(bests.personalBests, []);
});

test('beating your own earlier game is a personal best, with what it beat', () => {
  const bests = personalBestsFor({ matchResult: better, studentId: STUDENT, previousResults: [earlier] });
  assert.equal(bests.firstGame, false);
  assert.deepEqual(ids(bests), [PERSONAL_BEST_ID.MOST_CORRECT, PERSONAL_BEST_ID.BEST_ACCURACY, PERSONAL_BEST_ID.LONGEST_STREAK, PERSONAL_BEST_ID.FASTEST_CORRECT]);
  const byId = Object.fromEntries(bests.personalBests.map((best) => [best.id, best]));
  assert.equal(byId.mostCorrect.value, 3);
  assert.equal(byId.mostCorrect.previous, 2);
  assert.equal(byId.bestAccuracy.value, 75);
  assert.equal(byId.bestAccuracy.previous, 50);
  assert.equal(byId.fastestCorrect.value, 4_000);
  assert.equal(byId.fastestCorrect.previous, 6_000, 'the fastest of the earlier game\'s correct answers');
  assert.match(byId.fastestCorrect.detail, /4 seconds/);
  bests.personalBests.forEach((best) => assert.deepEqual(Object.keys(best).sort(), ['detail', 'id', 'label', 'previous', 'value']));
});

test('matching your best is not beating it; a worse game claims nothing', () => {
  assert.deepEqual(ids(personalBestsFor({ matchResult: { ...better, roomId: 'room-3', finalizedAtMs: clock += 1_000 }, studentId: STUDENT, previousResults: [better] })), []);
  const worse = result('room-4', [standing({ outcomes: [outcome(0, false), outcome(1, false), outcome(2, false)] })]);
  const bests = personalBestsFor({ matchResult: worse, studentId: STUDENT, previousResults: [earlier, better] });
  assert.equal(bests.firstGame, false);
  assert.deepEqual(bests.personalBests, []);
});

test('accuracy needs enough answers; replays never count', () => {
  const few = result('room-5', [standing({ outcomes: [outcome(0, true), outcome(1, true)] })]);
  assert.equal(personalMetrics(few, few.standings[0]).bestAccuracy, null, `fewer than ${MIN_ACCURACY_ANSWERED} answered`);
  // A replay (round 5 of a 5-round schedule, secondChance) is neither an
  // answer for accuracy nor a time for fastest.
  const replayed = result('room-6', [standing({ outcomes: [outcome(0, false), outcome(1, false), outcome(2, false), outcome(5, true, 500, true)] })]);
  const metrics = personalMetrics(replayed, replayed.standings[0]);
  assert.equal(metrics.bestAccuracy, 0);
  assert.equal(metrics.fastestCorrect, null);
});

test('only earlier finished games in the same class, never this room or a later one', () => {
  const otherClass = result('room-7', [standing({ outcomes: [outcome(0, true), outcome(1, true), outcome(2, true), outcome(3, true)], bestStreak: 4 })], { classId: 'class-2' });
  const cancelled = result('room-8', [standing({ outcomes: [outcome(0, true), outcome(1, true), outcome(2, true), outcome(3, true)], bestStreak: 4 })], { status: 'cancelled' });
  const current = result('room-9', [standing({ outcomes: [outcome(0, true), outcome(1, true), outcome(2, false)], bestStreak: 2 })]);
  const later = result('room-10', [standing({ outcomes: [outcome(0, true), outcome(1, true), outcome(2, true), outcome(3, true)], bestStreak: 4 })]);
  const sameRoom = { ...later, roomId: 'room-9', finalizedAtMs: current.finalizedAtMs - 1 };
  // Only `earlier` counts: other class, cancelled, later and the same room are ignored.
  const bests = personalBestsFor({ matchResult: current, studentId: STUDENT, previousResults: [otherClass, cancelled, later, sameRoom, earlier] });
  assert.equal(bests.firstGame, false);
  assert.ok(ids(bests).includes(PERSONAL_BEST_ID.LONGEST_STREAK), 'streak 2 beats the earlier 1 — not the other class\'s 4');
  // With nothing but ignored games, it is a first game.
  assert.equal(personalBestsFor({ matchResult: current, studentId: STUDENT, previousResults: [otherClass, cancelled, later, sameRoom] }).firstGame, true);
});

test('an earlier game the student was invited to but never joined is not a game they played', () => {
  const absent = result('room-11', [standing({ joined: false })]);
  assert.equal(personalBestsFor({ matchResult: better, studentId: STUDENT, previousResults: [absent] }).firstGame, true);
  // And a student who did not join this match has no bests at all.
  const notHere = result('room-12', [standing({ joined: false })]);
  assert.deepEqual(personalBestsFor({ matchResult: notHere, studentId: STUDENT, previousResults: [earlier] }).personalBests, []);
});

test('only this student is compared: a classmate\'s earlier game changes nothing', () => {
  const classmate = result('room-13', [standing({ studentId: 'someone-else', outcomes: [outcome(0, true, 100), outcome(1, true), outcome(2, true), outcome(3, true)], bestStreak: 9 })]);
  const bests = personalBestsFor({ matchResult: better, studentId: STUDENT, previousResults: [classmate, earlier] });
  assert.equal(bests.personalBests.length, 4);
  assert.equal(JSON.stringify(bests).includes('someone-else'), false);
});

test('a faster answer must be noticeably faster: timing noise is not a personal best', () => {
  // Only the fastest-correct metric differs between these games.
  const game = (roomId, elapsedMs) => result(roomId, [standing({ outcomes: [outcome(0, true, elapsedMs), outcome(1, false), outcome(2, false)], bestStreak: 1 })]);
  const before = game('room-fast-1', 1_350);
  const noise = personalBestsFor({ matchResult: game('room-fast-2', 1_350 - MIN_FASTER_MS + 1), studentId: STUDENT, previousResults: [before] });
  assert.deepEqual(ids(noise), [], 'a few milliseconds faster is noise, not a best');
  const real = personalBestsFor({ matchResult: game('room-fast-3', 1_350 - MIN_FASTER_MS), studentId: STUDENT, previousResults: [before] });
  assert.deepEqual(ids(real), [PERSONAL_BEST_ID.FASTEST_CORRECT]);
  const [best] = real.personalBests;
  // The copy shows two different times, never "1.1 seconds — faster than 1.1".
  assert.equal(best.detail, 'A right answer in 1.1 seconds — faster than your best before (1.4 seconds).');
  // A very fast answer never reads as "0 seconds".
  const quick = personalBestsFor({ matchResult: game('room-fast-4', 40), studentId: STUDENT, previousResults: [] }).personalBests;
  assert.deepEqual(quick, [], 'first game: nothing claimed');
  const quickest = personalBestsFor({ matchResult: game('room-fast-5', 40), studentId: STUDENT, previousResults: [before] });
  assert.equal(quickest.personalBests[0].detail, 'A right answer in under 0.1 seconds — faster than your best before (1.4 seconds).');
});
