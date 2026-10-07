// The Live Challenge pieces that make a game teach and include (student push E):
// when a round's worked solution may be public, per-student extended time,
// which questions belong in a timed round, and who the projector may show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newlyRevealedRounds,
  publicSolutionDocument,
  revealableRounds,
  roundSolutionRecord,
} from '../../functions/shared/liveChallengeSolutionReveal.mjs';
import {
  MAX_GAME_TIME_MULTIPLIER,
  extendedRoundEndsAtMs,
  extendedTimePendingCount,
  gameTimeMultiplierFor,
  personalRoundTimer,
} from '../../functions/shared/liveChallengeAccommodations.mjs';
import { DOK3_MIN_ROUND_SECONDS, fitsTimedRound, timedRoundShortfallMessage } from '../../functions/shared/liveChallengeDifficulty.mjs';
import {
  PUBLIC_TOP_COUNT,
  finalPlaceIsHeadline,
  normalizeStandingsDisplay,
  publicStandingsLimit,
} from '../../functions/shared/liveChallengePrivacy.mjs';
import { planLifecycleCommand } from '../../functions/shared/liveChallengeLifecycle.mjs';
import { timerAcceptsArrival } from '../../functions/shared/liveChallengeTimer.mjs';

const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const regionOf = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} must exist`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end > start ? end : source.length);
};

/* ---------- solution reveal: never while the question can be answered ---------- */

test('without Second Chance every closed round is revealable, and no open one', () => {
  assert.deepEqual(revealableRounds({ closedThrough: 2, scheduledRoundCount: 5, secondChancePossible: false, replayOf: {} }), [0, 1, 2]);
  assert.deepEqual(revealableRounds({ closedThrough: -1, scheduledRoundCount: 5, secondChancePossible: false, replayOf: {} }), []);
});

test('with Second Chance possible, scheduled rounds are held until the replay plan is known', () => {
  assert.deepEqual(revealableRounds({ closedThrough: 2, scheduledRoundCount: 5, secondChancePossible: true, replayOf: null }), []);
});

test('a replayed question is held until its replay closes; the rest are released with the plan', () => {
  // Rounds 0..4 scheduled; replays: round 5 replays 1, round 6 replays 3.
  const replayOf = { 5: 1, 6: 3 };
  assert.deepEqual(revealableRounds({ closedThrough: 4, scheduledRoundCount: 5, secondChancePossible: true, replayOf }), [0, 2, 4]);
  assert.deepEqual(revealableRounds({ closedThrough: 5, scheduledRoundCount: 5, secondChancePossible: true, replayOf }), [0, 1, 2, 4, 5]);
  assert.deepEqual(revealableRounds({ closedThrough: 6, scheduledRoundCount: 5, secondChancePossible: true, replayOf }), [0, 1, 2, 3, 4, 5, 6]);
});

test('a finished match reveals everything it held', () => {
  assert.deepEqual(revealableRounds({ closedThrough: 2, scheduledRoundCount: 3, secondChancePossible: true, replayOf: null, finished: true }), [0, 1, 2]);
});

test('the published document names a question and its review, never a student', () => {
  const record = roundSolutionRecord({
    question: { prompt: 'Solve 2x + 3 = 11.', studentId: 'should-not-travel' },
    solutionReview: { headline: 'Undo the operations.', reasoning: ['Subtract 3.', 'Divide by 2.'], answerSummary: 'x = 4' },
    displayStandard: 'A.5A',
  });
  const published = publicSolutionDocument({ roundIndex: 2, record, revealedAtMs: 5 });
  assert.equal(published.available, true);
  assert.equal(published.prompt, 'Solve 2x + 3 = 11.');
  assert.deepEqual([...published.solutionReview.reasoning], ['Subtract 3.', 'Divide by 2.']);
  assert.ok(!JSON.stringify(published).includes('should-not-travel'));
  // A question without an authored review is published as unavailable, not invented.
  assert.equal(publicSolutionDocument({ roundIndex: 1, record: roundSolutionRecord({ question: { prompt: 'p' } }) }).available, false);
  assert.deepEqual(newlyRevealedRounds([0, 1, 2], [1]), [0, 2]);
});

test('the server captures the solution privately at opening and publishes it only from the closing paths', () => {
  const builder = regionOf(server, 'async function buildLiveChallengePublicQuestion(', '\nasync function ');
  // The review goes to the sink, and the public payload is built without it.
  assert.match(builder, /solutionSink\.record = solutionReveal\.roundSolutionRecord\(/);
  const returned = builder.slice(builder.lastIndexOf('return {'));
  assert.doesNotMatch(returned, /solution/i);
  const opening = regionOf(server, 'function applyLiveChallengeRoundOpening(', '\n}\n');
  // Private state carries it; the room write does not.
  const privateWrite = opening.slice(opening.indexOf('transaction.set(privateRef'), opening.indexOf('transaction.set(roomRef'));
  assert.match(privateWrite, /roundSolutions: \{ \[String\(roundIndex\)\]: opening\.solution \}/);
  const roomWrite = opening.slice(opening.indexOf('transaction.set(roomRef'));
  assert.doesNotMatch(roomWrite, /opening\.solution/);
  // Published after the close, and at the finish — never from submit or open.
  const close = regionOf(server, 'exports.closeLiveChallengeRound = onCall', 'exports.advanceLiveChallenge');
  assert.ok(close.indexOf('applyLiveChallengeSolutionReveals(') > close.indexOf('applyLiveChallengeRoundClose('));
  const finalization = regionOf(server, 'function applyLiveChallengeMatchFinalization(', '\n}\n');
  assert.match(finalization, /if \(status === lifecycle\.SESSION_STATUS\.FINISHED\) \{\s*applyLiveChallengeSolutionReveals\(/);
  const submit = regionOf(server, 'exports.submitLiveChallengeResponse = onCall', '\nexports.');
  assert.doesNotMatch(submit, /applyLiveChallengeSolutionReveals|roundSolutions/);
});

/* ---------- extended time ---------- */

test('a student with extended time gets their own deadline, from the same start', () => {
  const timer = { startsAtMs: 10_000, endsAtMs: 40_000 };
  assert.equal(personalRoundTimer(timer, 1.5).endsAtMs, 55_000);
  assert.equal(personalRoundTimer(timer, 1), timer);
  // Capped: a game round never waits more than double for one player.
  assert.equal(personalRoundTimer(timer, 4).endsAtMs, 10_000 + 30_000 * MAX_GAME_TIME_MULTIPLIER);
  assert.equal(extendedRoundEndsAtMs(timer, 1), null);
  // An answer at 45 s is late for the class and on time for them.
  assert.equal(timerAcceptsArrival(timer, 45_000).accepted, false);
  assert.equal(timerAcceptsArrival(personalRoundTimer(timer, 1.5), 45_000).accepted, true);
});

test('the support profile decides the multiplier, in either stored shape', () => {
  assert.equal(gameTimeMultiplierFor({ accommodations: ['extra-time'] }), 1.5);
  assert.equal(gameTimeMultiplierFor({ accommodations: { extendedTimeMultiplier: 2 }, programEligibility: {} }), 2);
  assert.equal(gameTimeMultiplierFor(null), 1);
  assert.equal(gameTimeMultiplierFor({ accommodations: ['text-to-speech'] }), 1);
});

test('a round past the class deadline waits for an unfinished student inside their extended time', () => {
  const timer = { startsAtMs: 10_000, endsAtMs: 40_000 };
  const players = [
    { joined: true, finished: true, timeMultiplier: 1 },
    { joined: true, finished: false, timeMultiplier: 1.5 },
  ];
  assert.equal(extendedTimePendingCount({ timer, players, nowMs: 45_000 }), 1);
  assert.equal(extendedTimePendingCount({ timer, players, nowMs: 60_000 }), 0);
  assert.equal(extendedTimePendingCount({ timer, players: [{ ...players[1], finished: true }], nowMs: 45_000 }), 0);

  const room = { status: 'running', currentRound: 0, roundVersion: 1, roundState: 'open', startsAt: 10_000, endsAt: 40_000 };
  const waiting = planLifecycleCommand({ command: 'closeRound', room, joinedCount: 2, completedCount: 1, extendedPendingCount: 1, nowMs: 45_000 });
  assert.equal(waiting.outcome, 'reject');
  assert.equal(waiting.details?.readiness ?? waiting.readiness, 'extended_time');
  assert.equal(planLifecycleCommand({ command: 'closeRound', room, joinedCount: 2, completedCount: 1, extendedPendingCount: 0, nowMs: 45_000 }).outcome, 'apply');
  // Everyone finished, or the host forcing it, still closes at once.
  assert.equal(planLifecycleCommand({ command: 'closeRound', room, joinedCount: 2, completedCount: 2, extendedPendingCount: 1, nowMs: 45_000 }).outcome, 'apply');
  assert.equal(planLifecycleCommand({ command: 'closeRound', room, joinedCount: 2, completedCount: 1, extendedPendingCount: 1, nowMs: 45_000, force: true }).outcome, 'apply');
});

test('the server reads the multiplier at join, keeps it private, and judges arrivals against it', () => {
  const join = regionOf(server, 'exports.joinLiveChallenge = onCall', '\nexports.');
  assert.match(join, /accommodations\.gameTimeMultiplierFor\(gradeSnapshot\.exists/);
  // Never on the public player row.
  const publicRow = join.slice(join.indexOf('transaction.set(publicPlayerRef'), join.indexOf('transaction.set(inviteRef'));
  assert.doesNotMatch(publicRow, /timeMultiplier/);
  const submit = regionOf(server, 'exports.submitLiveChallengeResponse = onCall', '\nexports.');
  assert.equal((submit.match(/accommodations\.personalRoundTimer\(/g) || []).length, 2);
  const completion = regionOf(server, 'function liveChallengeRoundCompletion(', '\n}\n');
  assert.match(completion, /extendedTimePendingCount\(/);
});

/* ---------- difficulty targeting ---------- */

test('no DOK-3 question under a 45-second timer; DOK 4 never in a timed round', () => {
  assert.equal(fitsTimedRound({ dok: 3 }, { roundSeconds: 45 }), false);
  assert.equal(fitsTimedRound({ dok: 3 }, { roundSeconds: DOK3_MIN_ROUND_SECONDS }), true);
  assert.equal(fitsTimedRound({ dok: 4 }, { roundSeconds: 180 }), false);
  assert.equal(fitsTimedRound({ dok: 2 }, { roundSeconds: 20 }), true);
  assert.equal(fitsTimedRound({}, { roundSeconds: 20 }), true, 'no DOK recorded: nothing to judge by');
  assert.equal(fitsTimedRound({ dok: 4 }, { roundSeconds: 30, timingMode: 'pace' }), true, 'Pace Race has no countdown');
  assert.match(timedRoundShortfallMessage({ before: 10, after: 2, needed: 3, roundSeconds: 45 }), /45-second/);
  assert.equal(timedRoundShortfallMessage({ before: 10, after: 8, needed: 3, roundSeconds: 45 }), null);
});

test('the candidate filter applies the timing rule on the server', () => {
  const loader = regionOf(server, 'async function loadChallengeCandidates(', '\n}\n');
  assert.match(loader, /difficulty\.fitsTimedRound\(question, \{ roundSeconds, timingMode \}\)/);
  const create = regionOf(server, 'exports.createLiveChallenge = onCall', '\nexports.');
  assert.match(create, /\.plan\(\{\s*db, courseId, standardCode, modeConfig, roundCount: requestedRoundCount, roundSeconds, timingMode,/);
});

/* ---------- nobody publicly last ---------- */

test('the projector shows the top few unless the teacher opted into full standings', () => {
  assert.equal(normalizeStandingsDisplay(undefined), 'topFew');
  assert.equal(normalizeStandingsDisplay('everything'), 'topFew');
  assert.equal(publicStandingsLimit({}, 10), PUBLIC_TOP_COUNT);
  assert.equal(publicStandingsLimit({ standingsDisplay: 'full' }, 10), 10);
  assert.equal(publicStandingsLimit({}, 3), 3, 'never more rows than fit');
  assert.equal(finalPlaceIsHeadline(1), true);
  assert.equal(finalPlaceIsHeadline(3), true);
  assert.equal(finalPlaceIsHeadline(4), false);
  assert.equal(finalPlaceIsHeadline(null), false);
  const create = regionOf(server, 'exports.createLiveChallenge = onCall', '\nexports.');
  assert.match(create, /standingsDisplay: engine\.privacy\.normalizeStandingsDisplay\(request\.data\?\.standingsDisplay\)/);
});
