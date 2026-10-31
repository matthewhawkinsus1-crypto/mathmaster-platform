import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { latticePointsInView, slopeOf } from '../../functions/shared/lineGraphMath.mjs';
import { lineRoundQuestionCount, normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { generateLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import { applyLineGraphAttempts, buildLineGraphReport, lineRoundState } from '../../functions/shared/lineGraphAttempts.mjs';
import { classLineFacts, lineRoundSolutionRecord } from '../../functions/shared/lineGraphReveal.mjs';
import {
  LINE_ATTEMPT_KIND,
  LINE_GRAPH_FORMAT,
  LINE_GRAPH_MODE_ID,
  LINE_VERDICT,
  lineFormatGivesExtraTime,
} from '../../functions/shared/lineGraphRules.mjs';
import {
  EXTENDED_TIME_RULE,
  SLOPE_HELPER_PLAN_SUPPORTS,
  extendedTimePendingCount,
  extendedTimeRuleFor,
  planTurnsOnSlopeHelper,
} from '../../functions/shared/liveChallengeAccommodations.mjs';
import { ROUND_STRUCTURE, getChallengeMode, listChallengeModes, roundQuestionSpecsFor, roundStructureFor } from '../../functions/shared/liveChallengeModes.mjs';
import { EXTRA_TIME_RECEIPTS_FIELD, playerWorkReceipts, summarizeRoundProgress } from '../../functions/shared/liveChallengeResponses.mjs';
import { buildRoundResult, questionSetMatchSummary, standingFromPlayer } from '../../functions/shared/liveChallengeResults.mjs';
import { getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { lineExtraTimeRule } from '../../src/platform/liveChallenge/lineGraphSetupModel.js';

/*
 * GRAPH THE LINE AND A STUDENT'S SUPPORT PLAN (LC09).
 *
 * The race stays one race. A student with extended time on their plan gets
 * it AFTER the class's buzzer in a Classic or Sprint round — a set to finish
 * — and what they do then is theirs: it is recorded apart from the race's
 * receipts, so it can never move a place, a score, an accuracy or a reward,
 * and never their public row. A Rush gives no extra time. The slope helper is
 * the student's own when their plan gives them a graphing aid, and nothing
 * public says so.
 */

const { CLASSIC, SPRINT, RUSH } = LINE_GRAPH_FORMAT;
const grandPrix = getScoringStrategy('grandPrix');

let counter = 0;
const nextId = () => `acc-${(counter += 1)}`;

// One student's Sprint of five, played through the submit transaction's own
// function. `extra` routes a request the way the callable does for a student
// whose plan gives them time after the buzzer (lineGraphArrival).
const sprintFor = ({ seed = 'acc-room', studentKey = 'ana', format = SPRINT } = {}) => {
  const config = normalizeLineGraphConfig({ itemTypes: ['graph'], forms: ['slopeIntercept'], sprintLength: 5, triesPerItem: 3 }, { format });
  const poolSize = lineRoundQuestionCount(format, config);
  let player = { submissionReceipts: {}, attemptSequence: 0, score: 0, joined: true, studentId: studentKey, playerKey: `${studentKey}-key`, alias: studentKey };
  const items = new Map();
  const itemAt = (questionIndex) => {
    if (!items.has(questionIndex)) items.set(questionIndex, generateLineQuestion({ seed, studentKey, roundIndex: 0, questionIndex, config }));
    return items.get(questionIndex);
  };
  const submit = (attempts, { elapsedMs = 5_000, extraTime = false, extraTimeFromMs = null, roundDurationMs = 120_000 } = {}) => {
    const outcome = applyLineGraphAttempts({
      player,
      roundIndex: 0,
      roundVersion: 1,
      attempts,
      questionFor: itemAt,
      config,
      arrivedAtMs: 1_000_000 + elapsedMs,
      arrivalElapsedMs: elapsedMs,
      roundDurationMs,
      strategy: grandPrix,
      poolSize,
      extraTime,
      extraTimeFromMs,
    });
    player = {
      ...player,
      submissionReceipts: outcome.receipts,
      [EXTRA_TIME_RECEIPTS_FIELD]: outcome.extraTimeReceipts,
      attemptSequence: outcome.attemptSequence,
    };
    return outcome;
  };
  return { config, poolSize, itemAt, submit, player: () => player };
};

const right = (item, questionIndex, clientElapsedMs) => {
  const [p, q] = latticePointsInView(item.line, item.view);
  return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.LINE, points: [p, q], ...(clientElapsedMs === undefined ? {} : { clientElapsedMs }) };
};

const STEPS = [[1, 1], [1, -1], [2, 1], [1, 2], [-1, 2], [2, -1], [1, 3], [3, 1]];
const wrong = (item, questionIndex, n = 0, clientElapsedMs) => {
  const [p] = latticePointsInView(item.line, item.view, { inset: 2 });
  const slope = slopeOf(item.line);
  const usable = STEPS.map(([dx, dy]) => ({ dx, dy, q: { x: p.x + dx, y: p.y + dy } }))
    .filter(({ dx, dy, q }) => (slope ? !Q.eq(Q.rat(dy, dx), slope) : dx !== 0) && Math.abs(q.x) <= item.view.xMax && Math.abs(q.y) <= item.view.yMax);
  return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.LINE, points: [p, usable[n].q], ...(clientElapsedMs === undefined ? {} : { clientElapsedMs }) };
};

/* ------------------------------- the rule ------------------------------- */

test('extended time: a synchronized round\'s own deadline; after the buzzer in Classic and Sprint; never in a Rush', () => {
  for (const mode of listChallengeModes()) {
    const synchronized = roundStructureFor(mode).id === ROUND_STRUCTURE.SYNCHRONIZED_QUESTION;
    const expected = synchronized
      ? EXTENDED_TIME_RULE.PERSONAL_DEADLINE
      : (mode.capabilities.extraTimeAfterBuzzer ? EXTENDED_TIME_RULE.AFTER_BUZZER : EXTENDED_TIME_RULE.NONE);
    assert.equal(extendedTimeRuleFor(mode), expected, mode.id);
  }
  assert.equal(extendedTimeRuleFor(getChallengeMode(LINE_GRAPH_MODE_ID.CLASSIC)), EXTENDED_TIME_RULE.AFTER_BUZZER);
  assert.equal(extendedTimeRuleFor(getChallengeMode(LINE_GRAPH_MODE_ID.SPRINT)), EXTENDED_TIME_RULE.AFTER_BUZZER);
  assert.equal(extendedTimeRuleFor(getChallengeMode(LINE_GRAPH_MODE_ID.RUSH)), EXTENDED_TIME_RULE.NONE, 'as many as you can: nothing to finish');
  assert.equal(extendedTimeRuleFor(getChallengeMode('graphFeatureRush')), EXTENDED_TIME_RULE.NONE);
  assert.equal(extendedTimeRuleFor(getChallengeMode('standard')), EXTENDED_TIME_RULE.PERSONAL_DEADLINE);
  assert.deepEqual([CLASSIC, SPRINT, RUSH].map(lineFormatGivesExtraTime), [true, true, false]);
  // The teacher reads the rule where they set the clock.
  assert.match(lineExtraTimeRule(SPRINT), /after the buzzer/);
  assert.match(lineExtraTimeRule(CLASSIC), /practice, not the race/);
  assert.match(lineExtraTimeRule(RUSH), /no extra time/);
});

/* ---------------------------- the slope helper ---------------------------- */

test('a plan with a graphing aid turns the slope helper on for that student; nothing else does', () => {
  const now = Date.parse('2026-10-24T15:00:00Z');
  const plan = (status, effectiveStart, ids) => ({ supportPlan: { windows: [{ effectiveStart, status, revision: 1, accommodations: ids.map((id) => ({ id })) }] } });
  assert.deepEqual([...SLOPE_HELPER_PLAN_SUPPORTS], ['graph-paper', 'graphic-organizer']);
  assert.equal(planTurnsOnSlopeHelper({ accommodations: ['graph-paper'] }, { nowValue: now }), true);
  assert.equal(planTurnsOnSlopeHelper({ accommodations: ['graphic-organizer'] }, { nowValue: now }), true);
  assert.equal(planTurnsOnSlopeHelper({ accommodations: { graphicOrganizer: true } }, { nowValue: now }), true, 'the structured SIS record');
  assert.equal(planTurnsOnSlopeHelper(plan('active', '2026-08-01', ['graph-paper']), { nowValue: now }), true);
  // A revision that starts later, or one switched off, gives nothing today.
  assert.equal(planTurnsOnSlopeHelper(plan('active', '2026-12-01', ['graph-paper']), { nowValue: now }), false);
  assert.equal(planTurnsOnSlopeHelper(plan('inactive', '2026-08-01', ['graph-paper']), { nowValue: now }), false);
  // Other supports — extra time, read aloud, a blanket inclusion status — are not a graphing aid.
  for (const profile of [{ accommodations: ['extra-time', 'text-to-speech', 'calculator'] }, { inclusionStatus: true }, plan('active', '2026-08-01', ['visual-chunking']), null, 'graph-paper', []]) {
    assert.equal(planTurnsOnSlopeHelper(profile, { nowValue: now }), false, JSON.stringify(profile));
  }
});

/* --------------------- extra time, through the pipeline --------------------- */

test('after the buzzer a student\'s attempts are theirs: recorded apart, no points, the race untouched', () => {
  const game = sprintFor();
  // The race: item 0 right, item 1 one miss.
  game.submit([right(game.itemAt(0), 0, 4_000), wrong(game.itemAt(1), 1, 0, 9_000)], { elapsedMs: 10_000 });
  const atBuzzer = game.player();
  const raceBefore = JSON.stringify(atBuzzer.submissionReceipts);
  // Extra time: the request arrived after the class's window, inside theirs.
  const extra = game.submit([right(game.itemAt(1), 1, 125_000), right(game.itemAt(2), 2, 130_000)], { elapsedMs: 131_000, extraTime: true, extraTimeFromMs: 120_000, roundDurationMs: 180_000 });
  assert.deepEqual(extra.verdicts.map((row) => row.verdict), [LINE_VERDICT.CORRECT, LINE_VERDICT.CORRECT]);
  assert.equal(extra.recorded, 2);
  assert.equal(extra.extraTimeRecorded, 2);
  assert.equal(JSON.stringify(game.player().submissionReceipts), raceBefore, 'the race\'s receipts are exactly as at the buzzer');
  const kept = Object.values(game.player()[EXTRA_TIME_RECEIPTS_FIELD]);
  assert.equal(kept.length, 2);
  assert.ok(kept.every((receipt) => receipt.extraTime === true && receipt.pointsAwarded === 0 && receipt.serverConfirmed === true));
  // Where the student is: from all their work. Where the race has them: at the buzzer.
  assert.equal(extra.state.cursor, 3);
  assert.equal(extra.state.questionsCorrect, 3);
  assert.equal(extra.raceState.cursor, 1);
  assert.equal(extra.raceState.questionsCorrect, 1);
  // The race's numbers never counted the extra lines.
  assert.equal(extra.totals.correctCount, 1);
  assert.equal(extra.totals.targetAttempts, 2);
  // A retried extra-time batch replays; nothing is recorded twice.
  const replay = applyLineGraphAttempts({
    player: game.player(),
    roundIndex: 0,
    roundVersion: 1,
    attempts: [{ ...kept.find((receipt) => receipt.questionIndex === 2), attemptId: kept.find((receipt) => receipt.questionIndex === 2).submissionId, kind: LINE_ATTEMPT_KIND.LINE, points: latticePointsInView(game.itemAt(2).line, game.itemAt(2).view).slice(0, 2) }],
    questionFor: game.itemAt,
    config: game.config,
    arrivedAtMs: 1_140_000,
    arrivalElapsedMs: 140_000,
    roundDurationMs: 180_000,
    strategy: grandPrix,
    poolSize: game.poolSize,
    extraTime: true,
    extraTimeFromMs: 120_000,
  });
  assert.equal(replay.recorded, 0);
  assert.equal(replay.verdicts[0].replay, true);
});

test('an attempt made after the buzzer is extra time even when it arrives inside a classmate\'s grace', () => {
  const game = sprintFor({ studentKey: 'bo' });
  // Both arrive inside the class's window (the arrival grace); the device says
  // the second was made after the 120-second buzzer.
  const outcome = game.submit([right(game.itemAt(0), 0, 119_500), right(game.itemAt(1), 1, 120_200)], { elapsedMs: 119_999, extraTimeFromMs: 120_000 });
  assert.equal(outcome.extraTimeRecorded, 1);
  assert.equal(Object.keys(game.player().submissionReceipts).length, 1, 'the first is the race\'s');
  assert.equal(Object.values(game.player()[EXTRA_TIME_RECEIPTS_FIELD])[0].questionIndex, 1);
  // A student without extra time: the same batch is all race, exactly as before.
  const plain = sprintFor({ studentKey: 'cy' });
  const race = plain.submit([right(plain.itemAt(0), 0, 119_500), right(plain.itemAt(1), 1, 120_200)], { elapsedMs: 119_999 });
  assert.equal(race.extraTimeRecorded, 0);
  assert.equal(Object.keys(plain.player().submissionReceipts).length, 2);
  assert.ok(Object.values(plain.player().submissionReceipts).every((receipt) => !('extraTime' in receipt)));
  assert.deepEqual(plain.player()[EXTRA_TIME_RECEIPTS_FIELD], {});
});

test('an item is one item across the buzzer: tries, repeats and completion count all of the student\'s work', () => {
  const game = sprintFor({ studentKey: 'di' });
  const item = game.itemAt(0);
  const first = wrong(item, 0, 0, 100_000);
  game.submit([first], { elapsedMs: 100_000 });
  // The same wrong line again, in extra time, is `repeated` — not a second miss.
  const again = game.submit([{ ...first, attemptId: nextId(), clientElapsedMs: 125_000 }], { elapsedMs: 125_000, extraTime: true, extraTimeFromMs: 120_000 });
  assert.equal(again.verdicts[0].verdict, LINE_VERDICT.REPEATED);
  assert.equal(again.recorded, 0);
  // The second and third tries come in extra time; the third ends the item (3 tries).
  game.submit([wrong(item, 0, 1, 126_000)], { elapsedMs: 126_000, extraTime: true, extraTimeFromMs: 120_000 });
  const last = game.submit([wrong(item, 0, 2, 127_000)], { elapsedMs: 127_000, extraTime: true, extraTimeFromMs: 120_000 });
  assert.equal(last.verdicts[0].revealed, true, 'the tries span the buzzer');
  assert.equal(last.state.cursor, 1);
  // A right line for an item already ended is resolved, never a second completion.
  assert.equal(game.submit([right(item, 0, 128_000)], { elapsedMs: 128_000, extraTime: true, extraTimeFromMs: 120_000 }).verdicts[0].verdict, LINE_VERDICT.RESOLVED);
});

/* ------------------------ the race at the buzzer ------------------------ */

test('the round is ranked at the buzzer: extra time never lifts a student past a classmate', () => {
  // Ana: two lines by the buzzer, then three more in extra time. Bo: three by the buzzer.
  const ana = sprintFor({ studentKey: 'ana' });
  ana.submit([right(ana.itemAt(0), 0, 10_000), right(ana.itemAt(1), 1, 50_000)], { elapsedMs: 60_000 });
  const anaAtBuzzer = ana.player();
  ana.submit([2, 3, 4].map((index) => right(ana.itemAt(index), index, 121_000 + index)), { elapsedMs: 130_000, extraTime: true, extraTimeFromMs: 120_000, roundDurationMs: 180_000 });
  const bo = sprintFor({ studentKey: 'bo' });
  bo.submit([0, 1, 2].map((index) => right(bo.itemAt(index), index, 30_000 * (index + 1))), { elapsedMs: 100_000 });
  const rank = (players) => buildRoundResult({ roomId: 'r', roundIndex: 0, modeId: LINE_GRAPH_MODE_ID.SPRINT, scoringStrategyId: 'grandPrix', players }).standings
    .map((standing) => [standing.studentId, standing.rank, standing.metrics.questionsCorrect, standing.matchPointsAwarded]);
  const withExtraTime = rank([ana.player(), bo.player()]);
  assert.deepEqual(withExtraTime, rank([anaAtBuzzer, bo.player()]), 'exactly the ranking at the buzzer');
  assert.deepEqual(withExtraTime.map(([id]) => id), ['bo', 'ana']);
  assert.equal(withExtraTime[1][2], 2, 'Ana\'s race is her two lines by the buzzer');
  // The match's race numbers read the race's receipts only…
  const standing = standingFromPlayer(ana.player(), { mode: getChallengeMode(LINE_GRAPH_MODE_ID.SPRINT) });
  assert.equal(standing.matchAccuracy, 1);
  assert.equal(standing.roundOutcomes.length, 1);
  // …while her work — the report — is all of it, and says how much came after the buzzer.
  assert.equal(standing.questionSetSummary.completed, 5);
  assert.equal(standing.questionSetSummary.extraTimeCompleted, 3);
  const report = buildLineGraphReport({ standings: [{ ...standing, rank: 2 }] });
  assert.equal(report.players[0].itemsCompleted, 5);
  assert.equal(report.players[0].itemsCompletedInExtraTime, 3);
  assert.equal(questionSetMatchSummary(bo.player()).extraTimeCompleted, 0);
});

test('the round waits for a student inside their extra time, and not once they have finished their set', () => {
  const mode = getChallengeMode(LINE_GRAPH_MODE_ID.SPRINT);
  const game = sprintFor({ studentKey: 'eve' });
  game.submit([right(game.itemAt(0), 0, 10_000)], { elapsedMs: 10_000 });
  const finishedNow = () => {
    const receipts = playerWorkReceipts(game.player());
    return summarizeRoundProgress({ receipts, roundIndex: 0, questionSpecs: roundQuestionSpecsFor(mode, { receipts, roundIndex: 0 }) }).finished;
  };
  const timer = { startsAtMs: 1_000, endsAtMs: 121_000 };
  const pending = () => extendedTimePendingCount({ timer, players: [{ joined: true, finished: finishedNow(), timeMultiplier: 1.5 }], nowMs: 131_000 });
  assert.equal(pending(), 1, 'past the class\'s buzzer, inside their own');
  game.submit([1, 2, 3, 4].map((index) => right(game.itemAt(index), index, 125_000 + index)), { elapsedMs: 129_000, extraTime: true, extraTimeFromMs: 120_000, roundDurationMs: 180_000 });
  assert.equal(finishedNow(), true, 'their set is finished by the work after the buzzer');
  assert.equal(pending(), 0, 'nobody left to wait for');
  // The race alone never saw them finish.
  assert.equal(lineRoundState({ receipts: game.player().submissionReceipts, roundIndex: 0, poolSize: game.poolSize }).finished, false);
});

test('a Classic line\'s class facts count an answer given in extra time (published only at the close)', () => {
  const config = normalizeLineGraphConfig({ itemTypes: ['graph'] }, { format: CLASSIC });
  const item = generateLineQuestion({ seed: 'facts', studentKey: '*', roundIndex: 0, questionIndex: 0, config });
  const record = lineRoundSolutionRecord(item);
  const receipt = (extraTime) => ({
    receiptKind: 'targetAttempt', serverConfirmed: true, roundIndex: 0, questionIndex: 0, sequence: 1, isCorrect: true, completesQuestion: true, attemptKind: 'line', targetId: 'line', ...(extraTime ? { extraTime: true } : {}),
  });
  const players = [
    { joined: true, playerKey: 'a', submissionReceipts: { x: receipt(false) } },
    { joined: true, playerKey: 'b', submissionReceipts: {}, [EXTRA_TIME_RECEIPTS_FIELD]: { y: receipt(true) } },
  ];
  const facts = classLineFacts({ record, players, roundIndex: 0 });
  assert.equal(facts.answered, 2);
  assert.equal(facts.correct, 2);
});

/* ------------------------------ the screens ------------------------------ */

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('the student\'s round counts down to their own deadline, says when it is extra time, and shows their own slope helper', () => {
  const round = read('src/components/liveChallenge/LineGraphRound.jsx');
  const timing = region(round, 'const [timing] = useState(() => {', '\n  });', 'the clock anchor');
  // Their own deadline only in a format with a set to finish, never in practice.
  assert.match(timing, /const afterBuzzer = !practice && lineFormatGivesExtraTime\(format\);/);
  assert.match(timing, /personalRoundClock\(\{\s*startsAtMs, endsAtMs, timeMultiplier: afterBuzzer \? timeMultiplier : 1, fullDurationMs: roomFullRoundMs\(room\),\s*\}\)/);
  assert.match(timing, /return \{ startMono, buzzerMono, endMono: Math\.max\(buzzerMono, startMono \+ Math\.max\(0, own\.endsAtMs - startsAtMs\)\) \};/);
  // Input and the final flush follow the student's own deadline; the clock
  // they read is the race's until the buzzer — everyone's countdown — then theirs.
  assert.match(round, /performance\.now\(\) >= timing\.startMono && performance\.now\(\) < timing\.endMono/);
  assert.match(round, /const clockEndMono = pastBuzzer \? timing\.endMono : timing\.buzzerMono;/);
  assert.match(round, /<LineClock startMono=\{timing\.startMono\} endMono=\{clockEndMono\} \/>/);
  assert.match(round, /useTimeAnnouncements\(clockEndMono, playing\)/);
  // The extra-time words: only between the class's buzzer and their own deadline.
  assert.match(round, /const extraTime = playing && pastBuzzer;/);
  assert.match(region(round, '{extraTime && (', ')}', 'the extra-time banner'), /The race is over — finish your lines\. They count for your practice, not the race\./);
  // The slope helper: the room's, or theirs from their own round request.
  assert.match(round, /setOwnSlopeHelper\(reply\?\.slopeHelper === true\);/);
  assert.match(round, /slopeHelper=\{config\.slopeHelper === true \|\| ownSlopeHelper\}/);
  // The parent hands over the student's own multiplier (their invite).
  const student = read('src/components/liveChallenge/LiveChallengeStudent.jsx');
  assert.match(region(student, '<LineGraphRound', '/>', 'the line round'), /timeMultiplier=\{timeMultiplier\}/);
});

test('the server: extra time comes after the buzzer and stays private; the slope helper goes to the student alone', () => {
  const server = read('functions/index.js');
  const arrival = region(server, 'function lineGraphArrival(', '\n}\n', 'the arrival rule');
  assert.match(arrival, /if \(classArrival\.accepted \|\| !afterBuzzer\) \{/, 'everyone races on the class\'s clock');
  assert.match(arrival, /extraTime: personalArrival\.accepted,/);
  const submit = region(server, 'exports.submitLineGraphAttempts = onCall', '\nexports.', 'line submit');
  assert.equal((submit.match(/lineGraphArrival\(engine, \{ mode, room(: latestRoom)?, player(: playerAtStart)?, arrivedAtMs: requestArrivedAt \}\)/g) || []).length, 2, 'before and inside the transaction');
  assert.match(submit, /\.\.\.\(applied\.extraTimeRecorded > 0 \? \{ \[engine\.responses\.EXTRA_TIME_RECEIPTS_FIELD\]: applied\.extraTimeReceipts \} : \{\}\),/);
  const round = region(server, 'exports.getLineGraphRound = onCall', '\nexports.', 'line round');
  assert.match(round, /const slopeHelper = config\.slopeHelper === true \|\| player\.lineSlopeHelper === true;/);
  assert.match(round, /lineRoundState\(\{ receipts: engine\.responses\.playerWorkReceipts\(player\), roundIndex, poolSize \}\)/);
  const completion = region(server, 'function liveChallengeRoundCompletion(', '\n}\n', 'readiness');
  assert.match(completion, /const receipts = engine\.responses\.playerWorkReceipts\(player\);/);
  const inPlay = region(server, 'function liveChallengeExtendedTimeInPlay(', '\n}\n', 'extendedTimeInPlay');
  assert.match(inPlay, /engine\.accommodations\.extendedTimeRuleFor\(mode\) === engine\.accommodations\.EXTENDED_TIME_RULE\.NONE/);
});
