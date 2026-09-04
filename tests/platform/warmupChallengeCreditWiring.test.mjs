import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  roundsAvailableToStudent,
  warmupChallengeCredit,
} from '../../functions/shared/warmupChallenge.mjs';

const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const finishBody = () => {
  const start = code.indexOf('async function finishLiveChallengeRoom');
  assert.ok(start > -1);
  return code.slice(start, code.indexOf('exports.advanceLiveChallenge'));
};

/* ---------- the ordering that makes the numbers real ---------- */

test('credit is written before the private state it reads is deleted', () => {
  const body = finishBody();
  const creditAt = body.indexOf('warmupChallengeByAssignment');
  const deleteAt = body.indexOf('deletePrivateChallengeState');
  assert.ok(creditAt > -1, 'credit must be written');
  assert.ok(deleteAt > -1, 'private state must still be deleted');
  assert.ok(creditAt < deleteAt, 'moving credit after the delete records zeroes for a whole class');
});

test('a failed credit write cannot strand a room the teacher must end', () => {
  assert.match(finishBody(), /warmupChallenge\.credit\.failed/);
  assert.match(finishBody(), /catch \(error\)[\s\S]{0,200}warmupChallenge\.credit\.failed/);
});

test('credit is only written for a room that belongs to an assignment', () => {
  assert.match(finishBody(), /if \(room\.assignmentId\)/);
});

/* ---------- what must never reach the assignment ---------- */

test('no challenge score field is written to the assignment record', () => {
  const creditBlock = finishBody().slice(finishBody().indexOf('warmupChallengeByAssignment'));
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
  assert.match(finishBody(), /players\.filter\(\(player\) => player\.joined === true\)/);
});

/* ---------- the late arrival, and the sleeping Chromebook ---------- */

test('a late arrival is measured against the rounds they could play', () => {
  assert.equal(roundsAvailableToStudent({ totalRounds: 10, joinedAtRound: 6 }), 4);
  const credit = warmupChallengeCredit({ roundsAnswered: 4, correctCount: 4, roundsAvailable: 4 });
  assert.equal(credit.participationPercent, 100);
});

test('the join round is recorded and preserved across a rejoin', () => {
  const joinBody = code.slice(code.indexOf('exports.joinLiveChallenge'), code.indexOf('async function finishLiveChallengeRoom'));
  assert.match(joinBody, /joinedAtRound/);
  // Recomputing on a rejoin would shrink the denominator of the one student
  // whose device failed them.
  assert.match(joinBody, /existingJoinRound !== null\s*\?\s*existingJoinRound/);
});

test('a lobby join counts from round zero, not from -1', () => {
  const joinBody = code.slice(code.indexOf('exports.joinLiveChallenge'), code.indexOf('async function finishLiveChallengeRoom'));
  assert.match(joinBody, /Math\.max\(0,/);
  assert.equal(roundsAvailableToStudent({ totalRounds: 10, joinedAtRound: 0 }), 10);
});

test('a game that never ran does not record a zero percent', () => {
  const credit = warmupChallengeCredit({ roundsAnswered: 0, correctCount: 0, roundsAvailable: 0 });
  assert.equal(credit.participationPercent, null);
  assert.equal(credit.accuracyPercent, null);
});
