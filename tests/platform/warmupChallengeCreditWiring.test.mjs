import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  roundsAvailableToStudent,
  warmupChallengeCredit,
} from '../../functions/shared/warmupChallenge.mjs';
import { joinRoundFor } from '../../functions/shared/liveChallengeLifecycle.mjs';

const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const between = (startNeedle, endNeedle) => {
  const start = code.indexOf(startNeedle);
  assert.ok(start > -1, `could not find ${startNeedle}`);
  const end = code.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `could not find ${endNeedle}`);
  return code.slice(start, end);
};

// The credit is written from the durable match result by its own effect,
// after the finishing transaction has made the room terminal.
const creditWriter = () => between('async function writeWarmupCreditFromResult', 'async function writeChallengeEvidenceFromResult');
const finalizationEffects = () => between('async function runLiveChallengeFinalizationEffects', 'async function finalizeLiveChallengeMatch');
const joinBody = () => between('exports.joinLiveChallenge', 'exports.calibrateLiveChallengeClock');

/* ---------- the ordering that makes the numbers real ---------- */

test('credit is written before the private state it reads is deleted', () => {
  // Credit used to be read from the private player records, so writing it after
  // they were deleted recorded zeroes for a whole class. It now reads the
  // durable match result, and private state is deleted only after every
  // effect — credit included — has settled.
  const writer = creditWriter();
  assert.match(writer, /warmupChallengeByAssignment/, 'credit must be written');
  assert.match(writer, /\(result\.standings \|\| \[\]\)/, 'credit reads the match result');
  assert.doesNotMatch(writer, /LIVE_CHALLENGE_PRIVATE|loadPrivateChallengePlayers/, 'credit never reads private state');
  const effects = finalizationEffects();
  const creditAt = effects.indexOf('warmupCredit: () => writeWarmupCreditFromResult(db, result)');
  const deleteAt = effects.indexOf('recursiveDelete(db.collection(LIVE_CHALLENGE_PRIVATE)');
  assert.ok(creditAt > -1, 'credit must be a finalization effect');
  assert.ok(deleteAt > -1, 'private state must still be deleted');
  assert.ok(creditAt < deleteAt, 'moving credit after the delete records zeroes for a whole class');
});

test('a failed credit write cannot strand a room the teacher must end', () => {
  // The room is terminal before any effect runs; a failing effect is logged
  // and retried by the sweep, never thrown at the teacher.
  assert.match(finalizationEffects(), /catch \(error\) \{\s*outcomes\[name\] = "failed";\s*logger\.error\("liveChallenge\.finalization\.effect\.failed"/);
  const finalize = between('async function finalizeLiveChallengeMatch', 'exports.joinLiveChallenge');
  assert.match(finalize, /await runLiveChallengeFinalizationEffects\(db, roomId\)\.catch\(/);
});

test('credit is only written for a room that belongs to an assignment', () => {
  assert.match(creditWriter(), /if \(!result\.assignmentId\) return;/);
  assert.match(code, /warmupCredit: room\.assignmentId \? "pending" : "notApplicable"/);
});

/* ---------- what must never reach the assignment ---------- */

test('no challenge score field is written to the assignment record', () => {
  const creditBlock = creditWriter().slice(creditWriter().indexOf('warmupChallengeByAssignment'));
  const written = creditBlock.slice(0, creditBlock.indexOf('batch.commit'));
  for (const banned of ['score', 'streak', 'points', 'rank', 'alias', 'leaderboard']) {
    assert.doesNotMatch(written, new RegExp(`\\b${banned}\\s*:`), `${banned} must not reach the assignment`);
  }
});

test('the credit shape itself carries no points', () => {
  const credit = warmupChallengeCredit({ roundsAnswered: 4, correctCount: 3, roundsAvailable: 5 });
  for (const banned of ['score', 'points', 'streak', 'rank']) {
    assert.equal(Object.hasOwn(credit, banned), false, `${banned} must not be part of credit`);
  }
  assert.equal(credit.answered, 4);
  assert.equal(credit.correct, 3);
  assert.equal(credit.participationPercent, 80);
  assert.equal(credit.accuracyPercent, 75);
});

/* ---------- who gets a record at all ---------- */

test('a student who never joined gets no record rather than a zero', () => {
  // An absence is an attendance question, not a 0% on the mathematics.
  assert.match(creditWriter(), /\.filter\(\(player\) => player\.joined === true && player\.studentId\)/);
});

/* ---------- the late arrival, and the sleeping Chromebook ---------- */

test('a late arrival is measured against the rounds they could play', () => {
  assert.equal(roundsAvailableToStudent({ totalRounds: 10, joinedAtRound: 6 }), 4);
  const credit = warmupChallengeCredit({ roundsAnswered: 4, correctCount: 4, roundsAvailable: 4 });
  assert.equal(credit.participationPercent, 100);
});

test('the join round is recorded and preserved across a rejoin', () => {
  // The join records what the rule decides, from the room its transaction read
  // and the round already on the player's record.
  const join = joinBody();
  assert.match(join, /const joinedAtRound = lifecycle\.joinRoundFor\(\{ room, recordedJoinRound: player\.joinedAtRound \}\);/);
  assert.match(join, /const joinedPlayer = \{ \.\.\.player, joined: true, joinedAtRound,/);
  // Recomputing on a rejoin would shrink the denominator of the one student
  // whose device failed them.
  const laterRoom = { status: 'running', currentRound: 7, roundState: 'open' };
  assert.equal(joinRoundFor({ room: laterRoom, recordedJoinRound: 2 }), 2);
  assert.equal(joinRoundFor({ room: laterRoom, recordedJoinRound: 0 }), 0, 'a lobby arrival stays a lobby arrival');
});

test('a lobby join counts from round zero, not from -1', () => {
  assert.equal(joinRoundFor({ room: { status: 'lobby', currentRound: -1 } }), 0);
  assert.equal(joinRoundFor({ room: { status: 'lobby' } }), 0);
  assert.equal(roundsAvailableToStudent({ totalRounds: 10, joinedAtRound: 0 }), 10);
});

test('a join counts the round still open, never one that already closed', () => {
  assert.equal(joinRoundFor({ room: { status: 'running', currentRound: 3, roundState: 'open' } }), 3);
  assert.equal(joinRoundFor({ room: { status: 'running', currentRound: 3 } }), 3, 'a room from before roundState reads as open');
  // Between rounds — the host closed round 3 — that round cannot be answered.
  const betweenRounds = { status: 'running', currentRound: 3, roundState: 'closed' };
  assert.equal(joinRoundFor({ room: betweenRounds }), 4);
  assert.equal(roundsAvailableToStudent({ totalRounds: 10, joinedAtRound: joinRoundFor({ room: betweenRounds }) }), 6);
});

test('a game that never ran does not record a zero percent', () => {
  const credit = warmupChallengeCredit({ roundsAnswered: 0, correctCount: 0, roundsAvailable: 0 });
  assert.equal(credit.participationPercent, null);
  assert.equal(credit.accuracyPercent, null);
});
