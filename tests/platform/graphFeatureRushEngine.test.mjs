import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_MODE_ID,
  QUESTION_ISSUE,
  QUESTION_SOURCE,
  ROUND_STRUCTURE,
  getChallengeMode,
  graphFeatureRushMode,
  listChallengeModes,
  modeScoringConfig,
  normalizeModeConfig,
  normalizeModeRoundCount,
  normalizeModeRoundSeconds,
  resolveModeScoringStrategy,
  roundQuestionSpecsFor,
} from '../../functions/shared/liveChallengeModes.mjs';
import { summarizeRoundProgress } from '../../functions/shared/liveChallengeResponses.mjs';
import {
  buildMatchResult,
  buildRoundResult,
  playerTotalsAfterRound,
  publicRoundSummary,
} from '../../functions/shared/liveChallengeResults.mjs';
import { fieldPlacementPoints } from '../../functions/shared/liveChallengeRanking.mjs';
import { correctCountStrategy, grandPrixStrategy, getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { publicLeaderboard } from '../../functions/shared/liveChallenge.mjs';
import { evaluateRewardPolicy } from '../../functions/shared/liveChallengeRewardRules.mjs';
import { generateRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { POINTER_KIND, clampTolerance } from '../../functions/shared/graphFeatureHitTest.mjs';
import {
  RUSH_AUTO_SKIP_MISSES,
  RUSH_COMPLETE_FLASH_MS,
  RUSH_SKIP_PAUSE_MS,
  applyRushAttempts,
  buildRushReport,
  rushLockoutMs,
} from '../../functions/shared/graphFeatureRush.mjs';
import { GraphFeatureRushConfigError, normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';

/*
 * GRAPH FEATURE RUSH ON THE ENGINE.
 *
 * The rush declares itself to the engine and the engine does the rest: these
 * tests run rush rounds through the real round results, placement and match
 * result code, and hold the properties the game exists for — individual
 * questions ranked fairly, bounded championship points that keep comebacks
 * possible at any class size, and accuracy beating spray.
 */

const MODE = graphFeatureRushMode;
const POOL = MODE.questionSpecs.length;

/* ---------- synthetic receipts: n graphs completed, m wrong taps ---------- */

let sequence = 0;
const receiptsFor = ({ roundIndex = 0, completed = 0, misses = 0, startAt = 0, targetCount = 1, finishMs = 50_000 } = {}) => {
  const receipts = {};
  const add = (receipt) => {
    sequence += 1;
    receipts[`r${sequence}`] = { serverConfirmed: true, receiptKind: 'targetAttempt', roundIndex, sequence, targetCount, feature: 'vertex', family: 'quadratic', tier: 'standard', ...receipt };
  };
  for (let index = 0; index < completed; index += 1) {
    for (let target = 0; target < targetCount; target += 1) {
      const last = target === targetCount - 1;
      add({ questionIndex: startAt + index, targetId: `t${target}`, isCorrect: true, completesQuestion: last, pointsAwarded: last ? 1 : 0, elapsedMs: Math.round(((index + 1) / Math.max(1, completed)) * finishMs) });
    }
  }
  for (let index = 0; index < misses; index += 1) {
    add({ questionIndex: startAt + completed, targetId: 'miss', isCorrect: false, pointsAwarded: 0, elapsedMs: finishMs + index });
  }
  return receipts;
};

const rushPlayer = (studentId, receipts = {}, extra = {}) => ({
  studentId, playerKey: `key-${studentId}`, alias: `Alias ${studentId}`, joined: true, submissionReceipts: receipts, ...extra,
});

const closeRound = (players, roundIndex, strategyId = 'grandPrix') => buildRoundResult({
  roomId: 'rush-room',
  roundIndex,
  modeId: MODE.id,
  scoringStrategyId: strategyId,
  scoringConfig: modeScoringConfig(MODE, strategyId, {}),
  players,
});

test('the rush is a declared mode of the engine, not a branch in it', () => {
  assert.equal(getChallengeMode('graphFeatureRush'), MODE);
  assert.equal(MODE.roundStructure, ROUND_STRUCTURE.QUESTION_SET);
  assert.equal(MODE.questionIssue, QUESTION_ISSUE.PER_PLAYER);
  assert.equal(MODE.questionSource, QUESTION_SOURCE.GRAPH_FEATURE_GENERATOR);
  assert.equal(CHALLENGE_MODE_ID.GRAPH_FEATURE_RUSH, 'graphFeatureRush');
  assert.ok(listChallengeModes({ teacherSelectable: true }).includes(MODE), 'offered to teachers');
  assert.deepEqual(MODE.scoringStrategies, ['grandPrix', 'correctCount']);
  assert.equal(resolveModeScoringStrategy(MODE, 'accuracyFirst'), 'grandPrix', 'no 1,000-point speed scoring in a rush');
  assert.equal(resolveModeScoringStrategy(MODE, 'correctCount'), 'correctCount');
  assert.equal(modeScoringConfig(MODE, 'grandPrix', {}).placementCurve, 'field', 'rush rooms scale placement to the class');
  assert.equal(modeScoringConfig(getChallengeMode('standard'), 'grandPrix', {}).placementCurve, 'table', 'Standard rooms keep the table');
  assert.deepEqual(
    Object.entries(MODE.capabilities).filter(([, on]) => on).map(([key]) => key),
    [],
    'no second chance, milestones, pace clock, closing threshold, bank dry run or Warm-Up credit',
  );
  assert.equal(normalizeModeRoundCount(MODE, 1), 1, 'a single rush round is a game');
  assert.equal(normalizeModeRoundCount(MODE, 40), 8);
  assert.equal(normalizeModeRoundSeconds(MODE, 200), 120);
  assert.equal(normalizeModeRoundSeconds(MODE, undefined), 60);
});

test('the rush config is validated with sentences a teacher can act on', () => {
  const config = normalizeModeConfig(MODE, { graphFeatureRush: { presetId: 'algebra1Quick' } }).graphFeatureRush;
  assert.deepEqual(config, { presetId: 'algebra1Quick', families: ['linear', 'quadratic'], features: ['xIntercept', 'yIntercept', 'vertex'], difficulty: 'standard' });
  const edited = normalizeGraphFeatureRushConfig({ presetId: 'algebra1Quick', families: ['linear', 'quadratic', 'absolute'] });
  assert.equal(edited.presetId, 'custom', 'an edited preset is a custom game');
  const refusal = (raw) => assert.throws(() => normalizeGraphFeatureRushConfig(raw), GraphFeatureRushConfigError);
  refusal({ families: [], features: ['vertex'] });
  refusal({ families: ['linear'], features: [] });
  refusal({ families: ['bogus'], features: ['vertex'] });
  assert.throws(() => normalizeGraphFeatureRushConfig({ families: ['linear'], features: ['vertex'] }), /Vertex questions .* quadratic or absolute value/);
  assert.throws(() => normalizeGraphFeatureRushConfig({ families: ['linear', 'exponential'], features: ['maximum'] }), /Maximum/);
  assert.throws(() => normalizeGraphFeatureRushConfig({ families: ['quadratic'], features: ['xIntercept'], difficulty: 'easy' }), /linear or square root/, 'Easy is one target per graph: no parabola zeros');
  assert.doesNotThrow(() => normalizeGraphFeatureRushConfig({ families: ['quadratic'], features: ['xIntercept'], difficulty: 'mixed' }));
  // Unknown entries are dropped, order is canonical.
  assert.deepEqual(normalizeGraphFeatureRushConfig({ families: ['quadratic', 'nope', 'linear'], features: ['vertex'] }).families, ['linear', 'quadratic']);
});

test('a rush round reads each player\'s own question specs from their receipts', () => {
  const receipts = { ...receiptsFor({ completed: 2, targetCount: 3 }), ...receiptsFor({ completed: 1, startAt: 2, targetCount: 1 }) };
  const specs = roundQuestionSpecsFor(MODE, { receipts, roundIndex: 0 });
  assert.equal(specs.length, POOL);
  assert.deepEqual(specs.slice(0, 4).map((spec) => spec.targetCount), [3, 3, 1, 1]);
  const summary = summarizeRoundProgress({ receipts, roundIndex: 0, questionSpecs: specs });
  assert.equal(summary.questionsCorrect, 3);
  assert.equal(summary.finished, false, 'three graphs done is not the end of a timed round');
  // A player who works through the whole pool has finished.
  const exhausted = receiptsFor({ completed: POOL });
  assert.equal(summarizeRoundProgress({ receipts: exhausted, roundIndex: 0, questionSpecs: roundQuestionSpecsFor(MODE, { receipts: exhausted, roundIndex: 0 }) }).finished, true);
  // Shared-question modes are untouched.
  const standard = getChallengeMode('standard');
  assert.equal(roundQuestionSpecsFor(standard, { receipts, roundIndex: 0 }), standard.questionSpecs);
});

test('a round ranks work done (less 1/20 per miss), then accuracy, then the earlier finish — never chance', () => {
  const round = closeRound([
    rushPlayer('nine', receiptsFor({ completed: 9, misses: 1 })),
    rushPlayer('nine-clean', receiptsFor({ completed: 9, misses: 0 })),
    rushPlayer('nine-clean-early', receiptsFor({ completed: 9, misses: 0, finishMs: 40_000 })),
    rushPlayer('eight', receiptsFor({ completed: 8 })),
    rushPlayer('sprayer', receiptsFor({ completed: 1, misses: 25 })),
    rushPlayer('nothing-right', receiptsFor({ completed: 0, misses: 4 })),
    rushPlayer('absent', {}),
  ], 0);
  assert.deepEqual(round.standings.map((row) => [row.studentId, row.rank]), [
    ['nine-clean-early', 1], ['nine-clean', 2], ['nine', 3], ['eight', 4], ['sprayer', 5], ['nothing-right', 6], ['absent', 7],
  ]);
  assert.equal(round.fieldSize, 6, 'the field is the players who raced');
  // Six raced: 12, then 3 + round(8 × (6 − rank) / 5) = 9, 8, 6 — and the
  // sprayer's one lucky graph is cancelled by 25 misses (1 − 25/20 < 0): no
  // credit, so no points, like the player who found nothing.
  assert.deepEqual(round.standings.map((row) => row.matchPointsAwarded), [12, 9, 8, 6, 0, 0, 0], 'scaled to six racers; no credit, no points');
  assert.equal(round.standings.find((row) => row.studentId === 'nine').metrics.workScore, 8.95, 'one miss costs a twentieth of a graph');
  assert.equal(round.standings.find((row) => row.studentId === 'sprayer').metrics.workScore, 0);
  const summary = publicRoundSummary(round);
  assert.deepEqual(summary.standings.slice(0, 2).map((row) => [row.completed, row.accuracyPercent]), [[9, 100], [9, 100]]);
  assert.ok(!JSON.stringify(summary).includes('"nine"'), 'the public copy names nobody');
  // Exactly equal work ties and shares points.
  const tied = closeRound([rushPlayer('a', receiptsFor({ completed: 5 })), rushPlayer('b', receiptsFor({ completed: 5 }))], 0);
  assert.deepEqual(tied.standings.map((row) => [row.rank, row.matchPointsAwarded]), [[1, 12], [1, 12]]);
});

test('Grand Prix placement points scale with the class, from 2 to 35 players', () => {
  for (const size of [2, 4, 7, 10, 18, 20, 30, 35]) {
    const players = Array.from({ length: size }, (_, index) => rushPlayer(`p${String(index).padStart(2, '0')}`, receiptsFor({ completed: size - index })));
    const points = closeRound(players, 0).standings.map((row) => row.matchPointsAwarded);
    assert.equal(points[0], 12, `${size}: the winner earns the top`);
    assert.equal(points[size - 1], size === 1 ? 12 : 3, `${size}: last place still earns`);
    assert.ok(points.every((value, index) => index === 0 || value <= points[index - 1]), `${size}: never more for finishing lower`);
    assert.ok(points[0] > points[1], `${size}: winning is worth more than second`);
    assert.ok(Math.max(...points) - Math.min(...points) <= 9, `${size}: one round can never be worth more than 9 over anyone`);
    assert.deepEqual(points, Array.from({ length: size }, (_, index) => fieldPlacementPoints(index + 1, size)));
  }
});

test('a dominant first round cannot decide the match: comebacks stay possible', () => {
  // A dominates round 1, B dominates round 2, C improves dramatically and
  // wins round 3. Graphs completed per round:
  const plan = {
    A: [25, 4, 4],
    B: [6, 18, 6],
    C: [2, 9, 15],
    D: [7, 7, 7],
    E: [5, 6, 3],
  };
  const records = Object.fromEntries(Object.keys(plan).map((id) => [id, { matchPoints: 0 }]));
  const history = [];
  for (const roundIndex of [0, 1, 2]) {
    const players = Object.entries(plan).map(([id, counts]) => rushPlayer(id, receiptsFor({ roundIndex, completed: counts[roundIndex] })));
    const round = closeRound(players, roundIndex);
    round.standings.forEach((standing) => {
      const totals = playerTotalsAfterRound({ player: records[standing.studentId], standing, roundIndex, scoringStrategyId: 'grandPrix' });
      records[standing.studentId] = { ...records[standing.studentId], ...totals };
    });
    history.push(Object.fromEntries(Object.entries(records).map(([id, record]) => [id, record.matchPoints])));
  }
  // After round 1, A's lead is bounded however big the raw margin was: five
  // raced, so first earns 12 and second 9 whether A won by one graph or 18.
  assert.equal(history[0].A - history[0].D, 3, '25 graphs to 7 is a 12-to-9 round');
  // C, last after round 1, finishes ahead of the round-1 leader.
  const final = buildMatchResult({
    roomId: 'rush-room',
    status: 'finished',
    room: { challengeMode: MODE.id, scoringStrategyId: 'grandPrix', currentRound: 2 },
    players: Object.keys(plan).map((id) => rushPlayer(id, {
      ...receiptsFor({ roundIndex: 0, completed: plan[id][0] }),
      ...receiptsFor({ roundIndex: 1, completed: plan[id][1] }),
      ...receiptsFor({ roundIndex: 2, completed: plan[id][2] }),
    }, records[id])),
  });
  const rankOf = (id) => final.standings.find((row) => row.studentId === id).rank;
  assert.ok(history[0].C < history[0].A, 'C trailed after round 1');
  assert.ok(rankOf('C') < rankOf('A'), `C (${records.C.matchPoints}) overtook A (${records.A.matchPoints})`);
  assert.ok(rankOf('B') < rankOf('A'), 'the round-2 winner finishes ahead of the round-1 blowout');
  assert.notEqual(final.standings[0].studentId, 'A');
  // Raw totals would have crowned A outright: 33 graphs, more than anyone.
  const raw = Object.fromEntries(Object.entries(plan).map(([id, counts]) => [id, counts.reduce((sum, value) => sum + value, 0)]));
  assert.ok(Object.entries(raw).every(([id, total]) => id === 'A' || total < raw.A), 'a raw-score game would have been decided in round 1');
  assert.deepEqual(
    Object.fromEntries(Object.entries(records).map(([id, record]) => [id, record.matchPoints])),
    { A: 20, B: 26, C: 24, D: 25, E: 13 },
  );
});

test('Correct Count totals every graph completed; equal totals fall to accuracy', () => {
  const players = [
    rushPlayer('steady', { ...receiptsFor({ roundIndex: 0, completed: 6 }), ...receiptsFor({ roundIndex: 1, completed: 6 }) }),
    rushPlayer('sloppy', { ...receiptsFor({ roundIndex: 0, completed: 7, misses: 6 }), ...receiptsFor({ roundIndex: 1, completed: 5, misses: 6 }) }),
    rushPlayer('fast', { ...receiptsFor({ roundIndex: 0, completed: 9 }), ...receiptsFor({ roundIndex: 1, completed: 8, misses: 2 }) }),
  ];
  // The device-side record a submit leaves: score = graphs, accuracy kept.
  const scored = players.map((player) => {
    const receipts = player.submissionReceipts;
    const outcome = applyRushAttempts({ player: { submissionReceipts: receipts }, roundIndex: 1, attempts: [], strategy: correctCountStrategy, poolSize: POOL });
    return { ...player, ...outcome.totals };
  });
  assert.deepEqual(scored.map((player) => player.score), [12, 12, 17]);
  const board = publicLeaderboard(scored.map((player) => ({ ...player, joined: true })), { ranking: correctCountStrategy.matchRanking, includeProvisional: true });
  assert.deepEqual(board.map((row) => [row.alias, row.rank]), [['Alias fast', 1], ['Alias steady', 2], ['Alias sloppy', 3]]);
  const result = buildMatchResult({ roomId: 'cc', status: 'finished', room: { challengeMode: MODE.id, scoringStrategyId: 'correctCount', currentRound: 1 }, players: scored });
  assert.deepEqual(result.standings.map((row) => row.studentId), ['fast', 'steady', 'sloppy'], 'the durable result agrees with the board');
  assert.equal(result.standings[1].matchAccuracy, 1);
  // A classic room's board is unaffected by the new tiebreak: nobody has it.
  const classic = publicLeaderboard([{ alias: 'x', score: 2, roundsAnswered: 3 }, { alias: 'y', score: 2, roundsAnswered: 2 }], { ranking: correctCountStrategy.matchRanking });
  assert.deepEqual(classic.map((row) => row.alias), ['y', 'x']);
});

test('the match result carries what rewards and the teacher report need', () => {
  const players = [
    rushPlayer('accurate', { ...receiptsFor({ roundIndex: 0, completed: 8 }), ...receiptsFor({ roundIndex: 1, completed: 9 }), ...receiptsFor({ roundIndex: 2, completed: 7, misses: 1 }) }, { answeredRounds: [0, 1, 2], roundsAnswered: 3, joinedAtRound: 0 }),
    rushPlayer('guesser', { ...receiptsFor({ roundIndex: 0, completed: 3, misses: 9 }), ...receiptsFor({ roundIndex: 1, completed: 2, misses: 9 }), ...receiptsFor({ roundIndex: 2, completed: 4, misses: 9 }) }, { answeredRounds: [0, 1, 2], roundsAnswered: 3, joinedAtRound: 0 }),
    rushPlayer('late', receiptsFor({ roundIndex: 2, completed: 5 }), { answeredRounds: [2], roundsAnswered: 1, joinedAtRound: 2 }),
    { studentId: 'away', playerKey: 'key-away', alias: 'Away', joined: false },
  ];
  const result = buildMatchResult({ roomId: 'rush-room', status: 'finished', room: { challengeMode: MODE.id, scoringStrategyId: 'grandPrix', currentRound: 2, roundCount: 3 }, privateState: { questionIds: ['graphFeatureRush:round:1', 'graphFeatureRush:round:2', 'graphFeatureRush:round:3'] }, players });
  const accurate = result.standings.find((row) => row.studentId === 'accurate');
  assert.deepEqual(accurate.roundOutcomes.map((outcome) => outcome.isCorrect), [true, true, true]);
  assert.deepEqual(accurate.questionSetSummary.byFeature.vertex, { questions: 25, completed: 24, attempts: 25, hits: 24 });
  const guesser = result.standings.find((row) => row.studentId === 'guesser');
  assert.ok(guesser.roundOutcomes.every((outcome) => outcome.isCorrect === false), 'a guessed round is not an accurate round');
  const awards = evaluateRewardPolicy({ matchResult: result });
  const earned = (studentId) => awards.filter((award) => award.studentId === studentId).map((award) => award.ruleId).sort();
  assert.deepEqual(earned('accurate'), ['challengeFinisher', 'strongAccuracy']);
  assert.deepEqual(earned('guesser'), ['challengeFinisher'], 'finishing is rewarded; guessing is not "strong accuracy"');
  assert.deepEqual(earned('late'), [], 'one round of three is not enough rounds for either rule');
  assert.deepEqual(earned('away'), []);
  const report = buildRushReport(result);
  assert.equal(report.graphsCompleted, 8 + 9 + 7 + 3 + 2 + 4 + 5);
  assert.equal(report.byFeature[0].key, 'vertex');
  assert.ok(report.accuracyPercent > 0 && report.accuracyPercent < 100);
  assert.equal(report.players.find((row) => row.studentId === 'away').joined, false, 'the roster includes who never came');
});

/* ------------ the full pipeline with simulated players (bots) ------------ */

const CONFIG = normalizeGraphFeatureRushConfig({ presetId: 'algebra1Functions' });
const ROUND_MS = 60_000;

/*
 * A bot plays one round through the REAL pipeline: generated questions, the
 * device's hit test and cooldown, and the server's applyRushAttempts. Its
 * `decide(question, found, rng)` says where it taps next and how long that
 * took; time advances by think time, cooldowns, completion flashes and skips.
 */
const simulateRound = ({ studentKey, decide, strategy = grandPrixStrategy, roundIndex = 0, seed = 'sim-room' }) => {
  let player = {};
  let clock = 0;
  let questionIndex = 0;
  let missesInARow = 0;
  let missesOnGraph = 0;
  let found = [];
  let counter = 0;
  let localSeed = studentKey.length * 7919;
  const rng = () => { localSeed = (localSeed * 48271) % 2147483647; return localSeed / 2147483647; };
  while (clock < ROUND_MS && questionIndex < 50) {
    const question = generateRushQuestion({ seed, studentKey, roundIndex, questionIndex, config: CONFIG });
    const move = decide(question, found, rng);
    clock += move.thinkMs;
    if (clock >= ROUND_MS) break;
    counter += 1;
    const attempt = move.kind === 'tap'
      ? { attemptId: `${studentKey}-${counter}`, questionIndex, kind: 'tap', x: move.x, y: move.y, tolerance: clampTolerance({ x: 0.06 * (question.view.xMax - question.view.xMin), y: 0.06 * (question.view.yMax - question.view.yMin) }, question.view), pointer: POINTER_KIND.TOUCH, clientElapsedMs: clock }
      : { attemptId: `${studentKey}-${counter}`, questionIndex, kind: move.kind, clientElapsedMs: clock };
    const outcome = applyRushAttempts({
      player, roundIndex, roundVersion: 1, attempts: [attempt], questionFor: (index) => (index === questionIndex ? question : null),
      arrivedAtMs: clock, arrivalElapsedMs: clock, roundDurationMs: ROUND_MS, strategy, poolSize: 50,
    });
    player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
    const [verdict] = outcome.verdicts;
    if (verdict.verdict === 'hit') {
      missesInARow = 0;
      found = [...found, verdict.targetId];
    } else if (verdict.verdict === 'miss') {
      missesInARow += 1;
      missesOnGraph += 1;
      // The server skips the graph on its last allowed miss; the device shows
      // the skip instead of a cooldown.
      assert.equal(verdict.autoSkipped === true, missesOnGraph === RUSH_AUTO_SKIP_MISSES);
      if (!verdict.autoSkipped) clock += rushLockoutMs(missesInARow);
    }
    if (verdict.completesQuestion || verdict.verdict === 'skipped' || verdict.autoSkipped) {
      clock += verdict.completesQuestion ? RUSH_COMPLETE_FLASH_MS : RUSH_SKIP_PAUSE_MS;
      questionIndex += 1;
      found = [];
      missesInARow = 0;
      missesOnGraph = 0;
    }
  }
  return { studentId: studentKey, playerKey: `key-${studentKey}`, alias: studentKey, joined: true, submissionReceipts: player.submissionReceipts || {} };
};

const nextTarget = (question, found) => question.targets.find((target) => !found.includes(target.id));

// Reads the graph: `lookMs` to find each feature, wrong `slip` of the time.
const reader = (lookMs, slip) => (question, found, rng) => {
  const target = nextTarget(question, found);
  if (!target) return { kind: 'dne', thinkMs: lookMs };
  if (rng() < slip) return { kind: 'tap', x: target.x + 0.25 * (question.view.xMax - question.view.xMin), y: target.y, thinkMs: lookMs * 0.7 };
  return { kind: 'tap', x: target.x, y: target.y, thinkMs: lookMs };
};
const accurate = reader(2_600, 0.1);
// A student having a hard time: six seconds a feature, wrong three times in ten.
const struggling = reader(6_000, 0.3);
// Taps anywhere, as fast as the screen allows.
const sprayer = (question, found, rng) => ({
  kind: 'tap',
  x: question.view.xMin + rng() * (question.view.xMax - question.view.xMin),
  y: question.view.yMin + rng() * (question.view.yMax - question.view.yMin),
  thinkMs: 250,
});
// Knows where the axes are: sweeps them, and skips what it cannot sweep.
const sweeper = (() => {
  const cursor = new Map();
  return (question) => {
    const key = `${question.questionIndex}`;
    const step = cursor.get(key) || 0;
    cursor.set(key, step + 1);
    const span = question.view.xMax - question.view.xMin;
    if (step > 20 || !['xIntercept', 'yIntercept'].includes(question.feature)) return { kind: 'skip', thinkMs: 300 };
    const position = question.view.xMin + ((step * 0.09) % 1) * span;
    return question.feature === 'xIntercept'
      ? { kind: 'tap', x: position, y: 0, thinkMs: 250 }
      : { kind: 'tap', x: 0, y: question.view.yMin + ((step * 0.09) % 1) * (question.view.yMax - question.view.yMin), thinkMs: 250 };
  };
})();

test('honest students — even struggling ones — beat spraying and sweeping', () => {
  const players = [
    simulateRound({ studentKey: 'accurate-1', decide: accurate }),
    simulateRound({ studentKey: 'accurate-2', decide: accurate }),
    simulateRound({ studentKey: 'struggling-1', decide: struggling }),
    simulateRound({ studentKey: 'sprayer-1', decide: sprayer }),
    simulateRound({ studentKey: 'sprayer-2', decide: sprayer }),
    simulateRound({ studentKey: 'sweeper-1', decide: sweeper }),
  ];
  const round = closeRound(players, 0);
  const rankOf = (id) => round.standings.find((row) => row.studentId === id).rank;
  const metricsOf = (id) => round.standings.find((row) => row.studentId === id).metrics;
  for (const honest of ['accurate-1', 'accurate-2', 'struggling-1']) {
    for (const cheat of ['sprayer-1', 'sprayer-2', 'sweeper-1']) {
      assert.ok(rankOf(honest) < rankOf(cheat), `${honest} (${metricsOf(honest).questionsCorrect} graphs) outranks ${cheat} (${metricsOf(cheat).questionsCorrect} graphs, ${Math.round((metricsOf(cheat).accuracy || 0) * 100)}%)`);
    }
  }
  assert.ok(metricsOf('accurate-1').questionsCorrect >= 8, `an accurate student completes a real round of work (${metricsOf('accurate-1').questionsCorrect})`);
});

test('every class size plays a full simulated round without a broken question', () => {
  for (const size of [1, 2, 10, 32]) {
    const players = Array.from({ length: size }, (_, index) => simulateRound({ studentKey: `class${size}-s${index}`, decide: accurate, seed: `class-${size}` }));
    const round = closeRound(players, 0);
    assert.equal(round.standings.length, size);
    assert.ok(round.standings.every((row) => row.metrics.questionsCorrect > 0));
    assert.equal(round.standings[0].matchPointsAwarded, 12);
    const strategy = getScoringStrategy('grandPrix');
    assert.equal(strategy.id, 'grandPrix');
  }
});
