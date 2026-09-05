import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIVE_PROVISIONAL_MAX_POINTS,
  provisionalPointsFor,
  publicLeaderboard,
} from '../../functions/shared/liveChallenge.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
const functionsIndex = read('../../functions/index.js');

const player = (overrides = {}) => ({
  playerKey: 'p1', alias: 'Falcon', score: 1000, joined: true, answeredRound: -1, ...overrides,
});

/* ---------- provisional points are display only ---------- */

test('a provisional total only counts for the round it was reported for', () => {
  const p = player({ provisionalPoints: 400, provisionalRound: 2 });
  assert.equal(provisionalPointsFor(p, 2), 400);
  assert.equal(provisionalPointsFor(p, 3), 0, 'a stale report must not follow the game forward');
  assert.equal(provisionalPointsFor(p, 1), 0);
});

test('once a round is really answered the banked score is authoritative', () => {
  // Otherwise a student who worked and then submitted would show their partial
  // credit stacked on top of the points they were actually awarded.
  const p = player({ provisionalPoints: 400, provisionalRound: 2, answeredRound: 2 });
  assert.equal(provisionalPointsFor(p, 2), 0);
});

test('a forged provisional cannot exceed one round of base points', () => {
  const p = player({ provisionalPoints: 9_999_999, provisionalRound: 0 });
  assert.equal(provisionalPointsFor(p, 0), LIVE_PROVISIONAL_MAX_POINTS);
  assert.equal(provisionalPointsFor(player({ provisionalPoints: -50, provisionalRound: 0 }), 0), 0);
});

test('nonsense in the field is worth nothing, not NaN', () => {
  for (const bad of [undefined, null, 'lots', {}, [], Number.NaN, Infinity]) {
    const value = provisionalPointsFor(player({ provisionalPoints: bad, provisionalRound: 0 }), 0);
    assert.ok(Number.isInteger(value), `${String(bad)} produced ${value}`);
    assert.ok(value >= 0 && value <= LIVE_PROVISIONAL_MAX_POINTS);
  }
});

/* ---------- the board ---------- */

test('work in progress reorders the live board but never the banked one', () => {
  const players = [
    player({ playerKey: 'a', alias: 'Ana', score: 1000 }),
    player({ playerKey: 'b', alias: 'Ben', score: 900, provisionalPoints: 600, provisionalRound: 0 }),
  ];
  const live = publicLeaderboard(players, { activeRound: 0 });
  assert.equal(live[0].alias, 'Ben', 'a student mid-solve can lead on the live board');
  assert.equal(live[0].liveScore, 1500);
  assert.equal(live[0].score, 900, 'banked score is reported unchanged alongside it');

  const banked = publicLeaderboard(players);
  assert.equal(banked[0].alias, 'Ana', 'without an active round the board is banked score only');
  assert.equal(banked[0].liveScore, 1000);
  assert.equal(banked.every((row) => row.provisionalPoints === 0), true);
});

test('the finished standings can never include work in progress', () => {
  // Every caller that reports or exports omits activeRound, so this is the
  // default rather than something each of them has to remember.
  const players = [player({ playerKey: 'a', alias: 'Ana', score: 10, provisionalPoints: 999, provisionalRound: 4 })];
  const [row] = publicLeaderboard(players);
  assert.equal(row.liveScore, 10);
});

/* ---------- the write is not the hot document ---------- */

test('progress is written to the player document, never the room document', () => {
  const start = functionsIndex.indexOf('exports.reportLiveChallengeProgress');
  const end = functionsIndex.indexOf('exports.submitLiveChallengeResponse');
  assert.ok(start > 0 && end > start);
  const block = functionsIndex.slice(start, end);
  assert.match(block, /roomRef\.collection\("players"\)\.doc\(String\(player\.playerKey\)\)\.set\(/);
  // A write straight to roomRef would be the contended document all over again.
  assert.ok(!/roomRef\.set\(|roomRef\.update\(/.test(block), 'must not write the room document');
  assert.ok(!block.includes('score:'), 'must never write the real score');
  assert.match(block, /LIVE_PROVISIONAL_MAX_POINTS/, 'must clamp what the browser claims');
});

test('a report for a round that has moved on is ignored, not an error', () => {
  // A debounced report can land after the teacher advances. Throwing there would
  // surface a scary message to a student who did nothing wrong.
  const start = functionsIndex.indexOf('exports.reportLiveChallengeProgress');
  const block = functionsIndex.slice(start, functionsIndex.indexOf('exports.submitLiveChallengeResponse'));
  assert.match(block, /Number\(room\.currentRound\) !== roundIndex[\s\S]{0,300}return \{ recorded: false \}/);
});

/* ---------- the client side of the leash ---------- */

test('the running total reuses the solver step credit, it does not re-derive it', () => {
  // attemptPolicy already de-duplicates a step that is undone and redone.
  // Counting steps here instead would quietly pay twice for the same move.
  assert.match(student, /import \{ calculateStepPartialCredit, emptyQuestionRecord, recordQuestionStep \} from '\.\.\/\.\.\/attemptPolicy\.js'/);
  assert.match(student, /calculateStepPartialCredit\(stepRecord\.stepGrades, stepRecord\.variantIndex\)/);
  assert.match(student, /onStepGrade=\{/);
});

test('progress reporting is debounced and never fires after an answer', () => {
  assert.match(student, /if \(result \|\| expired \|\| !room\?\.roomId\) return undefined;/);
  assert.match(student, /if \(workingPoints === reportedRef\.current\) return undefined;/);
  assert.match(student, /setTimeout\([\s\S]{0,320}\}, 900\)/);
});

test('a dropped progress report cannot interrupt a student mid-round', () => {
  assert.match(student, /reportProgress\(\{ roomId: room\.roomId, roundIndex, provisionalPoints: workingPoints \}\)\)\.catch\(\(\) => \{\}\)/);
});
