import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIVE_PROVISIONAL_MAX_POINTS,
  provisionalPointsFor,
  publicLeaderboard,
} from '../../functions/shared/liveChallenge.mjs';
import { SCORE_ACCUMULATION, getScoringStrategy, listScoringStrategies, provisionalWorth, registerScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { ACCURACY_FIRST_MATCH_RANKING } from '../../functions/shared/liveChallenge.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

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

/* ---------- what unfinished work is worth (LC01) ---------- */

// The board shows a student's unfinished work on top of their banked score.
// The device reports a share of full credit; what the board gets is what the
// room's own scoring would pay for that work if the answer were graded now.
// The numbers below are written out, not read back from the scoring module.
test('unfinished work in a first-time Accuracy First round is worth its share of the 1000 base', () => {
  const worth = (credit) => provisionalWorth({ strategyId: 'accuracyFirst', credit });
  assert.deepEqual([0, 0.25, 0.4, 0.333, 0.5, 0.75, 1].map(worth), [0, 250, 400, 333, 500, 750, 1000]);
  // The strategy is the room's default when none is named, as for older rooms.
  assert.equal(provisionalWorth({ credit: 0.4 }), 400);
  assert.equal(provisionalWorth({ strategyId: 'noSuchStrategy', credit: 0.4 }), 400);
  // A device's claim past the ends, or nonsense, never leaves 0..1000.
  assert.deepEqual([-3, 7, 1e9, Number.NaN, Infinity, undefined, 'lots'].map(worth), [0, 1000, 1000, 0, 1000, 0, 0]);
});

test('a replay round and a Correct Count game pay nothing for work not yet answered, so the board shows none', () => {
  // A Second Chance round pays only a fully correct answer (recovery points),
  // whoever missed the question first. It used to show up to 1000 on the board
  // and fall to 0 when the answer was graded.
  for (const credit of [0.25, 0.9, 1]) {
    assert.equal(provisionalWorth({ strategyId: 'accuracyFirst', credit, secondChance: true }), 0, `replay at ${credit}`);
    assert.equal(provisionalWorth({ strategyId: 'accuracyFirst', credit, secondChance: true, missedOriginally: true }), 0, `missed replay at ${credit}`);
    // One point for a fully correct answer; partial work is not a point.
    assert.equal(provisionalWorth({ strategyId: 'correctCount', credit }), 0, `Correct Count at ${credit}`);
  }
  // Grand Prix keeps the raw round performance (the board never shows it).
  assert.equal(provisionalWorth({ strategyId: 'grandPrix', credit: 0.4 }), 400);
});

test('unfinished work is never worth more than a correct answer with the same credit would pay, in any strategy or round', () => {
  const strategies = listScoringStrategies();
  assert.ok(strategies.length >= 3, 'every registered strategy is held to it');
  for (const strategy of strategies) {
    for (const secondChance of [false, true]) {
      for (const missedOriginally of [false, true]) {
        for (const credit of [0, 0.1, 0.5, 0.99, 1]) {
          const worth = provisionalWorth({ strategyId: strategy.id, credit, secondChance, missedOriginally });
          const correct = getScoringStrategy(strategy.id).scoreResponse({
            gradeScore: credit, isCorrect: true, remainingMs: 0, totalMs: 1000, elapsedMs: 1000, previousStreak: 0, previousRoundMissed: false, secondChance, missedOriginally,
          }).pointsAwarded;
          assert.ok(Number.isInteger(worth) && worth >= 0 && worth <= LIVE_PROVISIONAL_MAX_POINTS, `${strategy.id} ${credit}: ${worth}`);
          assert.ok(worth <= correct, `${strategy.id} secondChance=${secondChance} credit=${credit}: ${worth} shown, ${correct} payable`);
        }
      }
    }
  }
});

// Last of its group: it registers a strategy, and a registered id is permanent,
// so the loop above must already have run.
test('the cap holds even for a strategy that would pay more than a base round', () => {
  registerScoringStrategy({
    id: 'testOversizedPayout',
    accumulation: SCORE_ACCUMULATION.PER_RESPONSE,
    normalizeConfig: () => ({}),
    matchPointsForPlacement: () => 0,
    matchRanking: ACCURACY_FIRST_MATCH_RANKING,
    scoreResponse: () => ({ pointsAwarded: 5000 }),
  });
  assert.equal(provisionalWorth({ strategyId: 'testOversizedPayout', credit: 1 }), LIVE_PROVISIONAL_MAX_POINTS);
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

test('progress writes only player documents and milestone score is receipt-derived', () => {
  const start = functionsIndex.indexOf('exports.reportLiveChallengeProgress');
  const end = functionsIndex.indexOf('async function maybeCompressLiveChallengeRoundAfterThreshold', start);
  assert.ok(start > 0 && end > start);
  const block = functionsIndex.slice(start, end);
  assert.match(block, /publicPlayerRef = roomRef\.collection\("players"\)\.doc\(String\(player\.playerKey\)\)/);
  assert.match(block, /transaction\.set\(publicPlayerRef/);
  // A write straight to roomRef would be the contended document all over again.
  assert.ok(!/roomRef\.set\(|roomRef\.update\(/.test(block), 'must not write the room document');
  assert.match(block, /submissionReceipts: milestone\.submissionReceipts/);
  assert.match(block, /score: milestone\.totalScore/);
  assert.match(block, /LIVE_PROVISIONAL_MAX_POINTS/, 'must clamp what the browser claims');
});

// LC01. The device's number is a claim; the board gets what the room's scoring
// pays for that work. The public row is written with the converted number, and
// the claim is never stored as it arrived.
test('the progress callable writes what the work is worth in this room and round, never the raw claim', () => {
  const start = functionsIndex.indexOf('exports.reportLiveChallengeProgress');
  const block = executableSource(functionsIndex.slice(start, functionsIndex.indexOf('async function maybeCompressLiveChallengeRoundAfterThreshold', start)));
  const worth = region(block, 'const claimedCredit = ', 'let speedInfluencePercent', 'the conversion');
  assert.match(worth, /Math\.min\(challenge\.LIVE_PROVISIONAL_MAX_POINTS, Math\.round\(Number\(request\.data\?\.provisionalPoints\) \|\| 0\)\)/, 'the claim is clamped first');
  assert.match(worth, /const provisionalPoints = engine\.scoring\.provisionalWorth\(\{ strategyId: scoringStrategyId, credit: claimedCredit, secondChance \}\);/);
  // The strategy is the room's, and the round's second-chance flag is the one
  // the milestone path already reads, both known before the conversion.
  assert.ok(block.indexOf('const scoringStrategyId = engine.scoring.roomScoringStrategyId(room);') < block.indexOf('const claimedCredit'));
  assert.ok(block.indexOf('const secondChance = Object.prototype.hasOwnProperty.call(privateState.secondChanceOf') < block.indexOf('const claimedCredit'));
  // The public row is written with the converted number.
  const publicWrite = region(block, 'transaction.set(publicPlayerRef, {', '}, { merge: true });', 'the public row');
  assert.match(publicWrite, /\bprovisionalPoints,/);
  assert.doesNotMatch(block, /provisionalPoints:\s*request\.data/, 'the claim is never written as it arrived');
});

test('a report for a round that has moved on is ignored, not an error', () => {
  // A debounced report can land after the teacher advances. Throwing there would
  // surface a scary message to a student who did nothing wrong.
  const start = functionsIndex.indexOf('exports.reportLiveChallengeProgress');
  const block = functionsIndex.slice(start, functionsIndex.indexOf('async function maybeCompressLiveChallengeRoundAfterThreshold', start));
  assert.match(block, /Number\(room\.currentRound\) !== roundIndex[\s\S]{0,650}return \{ recorded: false \}/);
});

/* ---------- the client side of the leash ---------- */

test('the running total reuses the solver step credit, it does not re-derive it', () => {
  // attemptPolicy already de-duplicates a step that is undone and redone.
  // Counting steps here instead would quietly pay twice for the same move.
  assert.match(student, /import \{ calculateStepPartialCredit, emptyQuestionRecord, recordQuestionStep \} from '\.\.\/\.\.\/attemptPolicy\.js'/);
  assert.match(student, /calculateStepPartialCredit\(stepRecord\.stepGrades, stepRecord\.variantIndex\)/);
  assert.match(student, /onStepGrade=\{/);
});

// LC01. The student's own "points banked this round" line and the number they
// report are the same worth, so a replay round shows and sends none.
test('the working points a student sees and reports are what the room pays for that work', () => {
  const block = executableSource(student.slice(student.indexOf('const scoringStrategyId = room.scoringStrategyId || null;'), student.indexOf('const secureQuestion = useMemo(')));
  assert.match(block, /const replayRound = room\.secondChanceOf != null;/, 'the replay flag is the room\'s own, as the countdown card reads it');
  const worth = region(block, 'const workingPoints = useMemo(', '[stepRecord, scoringStrategyId, replayRound],', 'working points');
  assert.match(worth, /provisionalWorth\(\{/);
  assert.match(worth, /strategyId: scoringStrategyId,/);
  assert.match(worth, /credit: clampPercent\(calculateStepPartialCredit\(stepRecord\.stepGrades, stepRecord\.variantIndex\)\) \/ 100,/, 'the step credit is reused, not re-derived');
  assert.match(worth, /secondChance: replayRound,/);
});

test('progress reporting is debounced and never fires after an answer', () => {
  const start = student.indexOf("const reportedRef = useRef('');");
  const end = student.indexOf('const submit = async', start);
  const block = student.slice(start, end);
  // An answer recorded on the server (seen on the public row after a refresh)
  // stops progress reports exactly as a local result does.
  assert.match(block, /if \(result \|\| answeredOnServer \|\| expired \|\| !room\?\.roomId\) return undefined;/);
  assert.match(block, /const signature = `\$\{workingPoints\}:\$\{JSON\.stringify\(progressRawResponse \|\| null\)\}`/);
  assert.match(block, /if \(signature === reportedRef\.current\) return undefined;/);
  assert.match(block, /\}, 900\);/);
});

test('a dropped progress report cannot interrupt a student mid-round', () => {
  assert.match(student, /Promise\.resolve\(reportProgress\(\{[\s\S]{0,500}provisionalPoints: workingPoints[\s\S]{0,250}\}\)\)\.catch\(\(\) => \{\}\)/);
});
