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

import { region } from './helpers/sourceContract.mjs';

const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
// The repo's strict helper: an end marker that is missing fails the test
// instead of binding the assertion to the rest of the file.
const regionOf = (source, startMarker, endMarker) => region(source, startMarker, endMarker);

/* ---------- solution reveal: never while the question can be answered ---------- */

test('without Second Chance every closed round is revealable, and no open one', () => {
  assert.deepEqual(revealableRounds({ closedThrough: 2, scheduledRoundCount: 5, secondChancePossible: false, replayOf: {} }), [0, 1, 2]);
  assert.deepEqual(revealableRounds({ closedThrough: -1, scheduledRoundCount: 5, secondChancePossible: false, replayOf: {} }), []);
});

test('with Second Chance possible, scheduled rounds are held until the replay plan is known', () => {
  assert.deepEqual(revealableRounds({ closedThrough: 2, scheduledRoundCount: 5, secondChancePossible: true, replayOf: null }), []);
});

test('while replays are planned every scheduled round is held until the last replay closes', () => {
  // Rounds 0..4 scheduled; replays: round 5 replays 1, round 6 replays 3.
  // Releasing 0, 2 and 4 at the last scheduled close would tell the class, by
  // the rounds left out, which questions are coming back.
  const replayOf = { 5: 1, 6: 3 };
  assert.deepEqual(revealableRounds({ closedThrough: 4, scheduledRoundCount: 5, secondChancePossible: true, replayOf }), []);
  assert.deepEqual(revealableRounds({ closedThrough: 5, scheduledRoundCount: 5, secondChancePossible: true, replayOf }), [5]);
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
  // Two arrival checks (before and inside the transaction) and the speed score.
  assert.equal((submit.match(/accommodations\.personalRoundTimer\(/g) || []).length, 3);
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
  // Judged against the round the question would actually run, not the baseline.
  assert.match(loader, /difficulty\.fitsTimedRound\(question, \{\s*roundSeconds: challenge\.complexityAdjustedRoundSeconds\(\{ baselineSeconds: roundSeconds, question \}\),\s*timingMode,\s*\}\)/);
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
  assert.equal(finalPlaceIsHeadline(1, { lastRank: 5 }), true);
  assert.equal(finalPlaceIsHeadline(3, { lastRank: 5 }), true);
  assert.equal(finalPlaceIsHeadline(4, { lastRank: 5 }), false);
  assert.equal(finalPlaceIsHeadline(null, { lastRank: 5 }), false);
  // Never a place that ties the class's last place, and never without
  // knowing where last place is (QA M2: 4 of 6 on 0 points saw "T-3rd").
  assert.equal(finalPlaceIsHeadline(3, { lastRank: 3 }), false);
  assert.equal(finalPlaceIsHeadline(1, { lastRank: 1 }), false, 'everyone tied: everyone is last');
  assert.equal(finalPlaceIsHeadline(1), false);
  const create = regionOf(server, 'exports.createLiveChallenge = onCall', '\nexports.');
  assert.match(create, /standingsDisplay: engine\.privacy\.normalizeStandingsDisplay\(request\.data\?\.standingsDisplay\)/);
});

test('a closing threshold shortens the class\'s deadline, never an accommodated student\'s extra time', async () => {
  const { roomFullRoundMs } = await import('../../functions/shared/liveChallengeAccommodations.mjs');
  const { personalRoundClock } = await import('../../src/platform/liveChallenge/challengeShellModel.js');
  // Opened as a 30 s round; most of the class answered, so the deadline was
  // pulled in to 12 s. A 1.5× student keeps 45 s, not 18 s.
  const compressed = { startsAtMs: 10_000, endsAtMs: 22_000 };
  const room = { activeRoundSeconds: 30 };
  assert.equal(roomFullRoundMs(room), 30_000);
  assert.equal(personalRoundTimer(compressed, 1.5, { fullDurationMs: roomFullRoundMs(room) }).endsAtMs, 55_000);
  assert.equal(personalRoundTimer(compressed, 1, { fullDurationMs: 30_000 }), compressed, 'everyone else keeps the shortened clock');
  assert.equal(extendedTimePendingCount({ timer: compressed, players: [{ joined: true, finished: false, timeMultiplier: 1.5 }], nowMs: 50_000, fullDurationMs: 30_000 }), 1);
  // The student's screen counts down to the same deadline the server judges.
  assert.equal(personalRoundClock({ startsAtMs: 10_000, endsAtMs: 22_000, timeMultiplier: 1.5, fullDurationMs: 30_000 }).endsAtMs, 55_000);
  // And the server passes the full length on every judgement.
  const submit = regionOf(server, 'exports.submitLiveChallengeResponse = onCall', '\nexports.');
  assert.equal((submit.match(/fullDurationMs: engine\.accommodations\.roomFullRoundMs\(/g) || []).length, 3);
  const completion = regionOf(server, 'function liveChallengeRoundCompletion(', '\n}\n');
  assert.match(completion, /fullDurationMs: engine\.accommodations\.roomFullRoundMs\(room\)/);
});

test('a student\'s board lists classmates by the projector\'s rule: never a place tied with the last', async () => {
  const { publicStandingsRows } = await import('../../src/platform/liveChallenge/liveChallengeProjectorModel.js');
  const five = Array.from({ length: 5 }, (_, index) => ({ playerKey: `p${index + 1}`, rank: index + 1 }));
  // Five players: a classmate's screen lists 1st–3rd (4th and 5th unshown together);
  // the fifth sees the same three and their own row.
  assert.deepEqual(publicStandingsRows({}, five, { selfKey: 'p2' }).rows.map((row) => row.playerKey), ['p1', 'p2', 'p3']);
  const last = publicStandingsRows({}, five, { selfKey: 'p5' });
  assert.equal(last.self?.playerKey, 'p5');
  assert.equal(publicStandingsRows({ standingsDisplay: 'full' }, five, { selfKey: 'p2' }).rows.length, 5);
  const student = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../../src/components/liveChallenge/ChallengeStudentShell.jsx', import.meta.url), 'utf8');
  // Every student board is a decided public list, never a bare count …
  assert.doesNotMatch(shell, /look="student" limit=/);
  assert.equal((shell.match(/board=\{publicStandingsRows\(room, /g) || []).length, 3);
  assert.equal((shell.match(/<(StandingsBoard|RoundResultsTable)\b/g) || []).length, 3);
  // … the final card's with where the class's last group starts — which the
  // server computed over the whole class, since the snapshot holds only the
  // public rows (no every-seat ranks a classmate could read) …
  assert.match(shell, /<StandingsBoard board=\{publicStandingsRows\(room, rows, \{ selfKey, lastRank, totalCount: totalPlayers \|\| null \}\)\}/);
  assert.match(student, /const finalLastRank = finalStandings \? finalStandings\.lastRank : null;/);
  assert.match(student, /\n\s*lastRank=\{finalLastRank\}\n/);
  // … the round card's with the class copy's last group and size …
  assert.match(shell, /publicStandingsRows\(room, view\.standings, \{ selfKey: standing\?\.playerKey \|\| null, \.\.\.view\.standingsBoard \}\)/);
  assert.match(shell, /publicStandingsRows\(room, view\.rows, \{ selfKey: self\?\.playerKey \|\| null, \.\.\.view\.tableBoard \}\)/);
  // … and both cards are handed the room (its standings choice).
  assert.equal((student.match(/\n\s*room=\{room\}\n/g) || []).length, 2);
  assert.doesNotMatch(student, /projectionRankTable|lastRankOf/, 'no screen reads every seat');
});

/* ---------- audit follow-ups: nothing public names an accommodated student ---------- */

test('joining with extended time writes nothing to the room; the round\'s opening says only that someone has it', () => {
  const join = regionOf(server, 'exports.joinLiveChallenge = onCall', '\nexports.');
  // A room field changing in the same commit as one student's public row would name them.
  assert.doesNotMatch(join, /transaction\.set\(roomRef/);
  const opening = regionOf(server, 'function applyLiveChallengeRoundOpening(', '\n}\n');
  assert.match(opening, /extendedTimeInPlay: liveChallengeExtendedTimeInPlay\(engine, room, players\)/);
  const start = regionOf(server, 'exports.startLiveChallenge = onCall', '\nexports.');
  assert.match(start, /players: playersFromSnapshot\(privatePlayers\)/);
});

test('an answer after the class\'s deadline reaches the public row only when the round closes', () => {
  const submit = regionOf(server, 'exports.submitLiveChallengeResponse = onCall', '\nexports.');
  assert.match(submit, /if \(!answeredAfterClassDeadline\) \{\s*transaction\.set\(publicPlayerRef, liveChallengePublicAnswerRow\(/);
  assert.match(submit, /publicRowPendingRound: answeredAfterClassDeadline \? submittedRound : null/);
  const close = regionOf(server, 'function applyLiveChallengeRoundClose(', '\n}\n');
  assert.match(close, /Number\(player\.publicRowPendingRound\) !== Number\(roundIndex\)/);
  assert.match(close, /transaction\.set\(roomRef\.collection\("players"\)\.doc\(String\(player\.playerKey\)\), liveChallengePublicAnswerRow\(player, player, roundIndex\)/);
});

test('the recap withholds worked solutions while another game the student is in can still be answered', () => {
  const recap = readFileSync(new URL('../../functions/lib/liveChallengeRecap.js', import.meta.url), 'utf8');
  assert.match(recap, /solutionsWithheld = liveRoom\.exists && \["lobby", "running"\]\.includes\(liveRoom\.data\(\)\?\.status\)/);
  assert.match(recap, /const available = !solutionsWithheld && Boolean\(/);
});

test('the class sees only recognitions that name no struggle; a Warm-Up game only team effort', async () => {
  const { classVisibleRecognitions } = await import('../../functions/shared/liveChallengeRecognitions.mjs');
  const all = ['mostImproved', 'steadiest', 'bestComeback', 'firstToAnswer', 'teamEffort'].map((id) => ({ id }));
  assert.deepEqual(classVisibleRecognitions(all).map((entry) => entry.id), ['steadiest', 'firstToAnswer', 'teamEffort']);
  assert.deepEqual(classVisibleRecognitions(all, { warmup: true }).map((entry) => entry.id), ['teamEffort']);
  const finalization = regionOf(server, 'function applyLiveChallengeMatchFinalization(', '\n}\n');
  assert.match(finalization, /recognitions: engine\.recognitions\.classVisibleRecognitions\(recognitions, \{ warmup: Boolean\(room\.assignmentId\) \}\)/);
});

test('the reveal and the replay plan read Second Chance through one predicate', () => {
  const reveal = regionOf(server, 'function liveChallengeRevealableRounds(', '\n}\n');
  const plan = regionOf(server, 'function planNextLiveChallengeRound(', '\n}\n');
  assert.match(reveal, /liveChallengeSecondChancePossible\(room, mode\)/);
  assert.match(plan, /!liveChallengeSecondChancePossible\(room, mode\)/);
});


test('the DOK rule judges the round a question would really run, and the opening clamps DOK 3 as a backstop', async () => {
  const { complexityAdjustedRoundSeconds } = await import('../../functions/shared/liveChallenge.mjs');
  const { timedRoundSecondsFor } = await import('../../functions/shared/liveChallengeDifficulty.mjs');
  // A one-step DOK 3 bank question in a "90-second" game runs 50 s: it does not fit.
  const shallow = { dok: 3 };
  const shallowSeconds = complexityAdjustedRoundSeconds({ baselineSeconds: 90, question: shallow });
  assert.ok(shallowSeconds < DOK3_MIN_ROUND_SECONDS, `runs ${shallowSeconds} s`);
  assert.equal(fitsTimedRound(shallow, { roundSeconds: shallowSeconds }), false);
  // A deep DOK 3 question at a 75-second baseline runs longer than 90 s: it fits.
  const deep = { dok: 3, solutionDepth: 4 };
  const deepSeconds = complexityAdjustedRoundSeconds({ baselineSeconds: 75, question: deep });
  assert.ok(deepSeconds >= DOK3_MIN_ROUND_SECONDS, `runs ${deepSeconds} s`);
  assert.equal(fitsTimedRound(deep, { roundSeconds: deepSeconds }), true);
  // The opening never runs a DOK 3 round under the floor; Pace Race and DOK 2 are untouched.
  assert.equal(timedRoundSecondsFor({ question: shallow, adjustedSeconds: 50 }), DOK3_MIN_ROUND_SECONDS);
  assert.equal(timedRoundSecondsFor({ question: { dok: 2 }, adjustedSeconds: 50 }), 50);
  assert.equal(timedRoundSecondsFor({ question: shallow, adjustedSeconds: 50, timingMode: 'pace' }), 50);
  const opening = regionOf(server, 'async function prepareLiveChallengeRoundOpening(', '\n}\n');
  assert.match(opening, /const roundSeconds = difficulty\.timedRoundSecondsFor\(\{/);
});

test('an extended-time student is scored for speed against their own round', () => {
  const submit = regionOf(server, 'exports.submitLiveChallengeResponse = onCall', '\nexports.');
  assert.match(submit, /\* 1000 \* timeMultiplier\);/);
  assert.match(submit, /remainingMs: personalEndsAtMs \? Math\.max\(0, personalEndsAtMs - nowMs\) : 0,/);
});
