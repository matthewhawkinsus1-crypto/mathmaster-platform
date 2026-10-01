/*
 * ROUND RESULTS AND MATCH RESULTS.
 *
 * GAME PERFORMANCE -> PLACEMENT/RESULT -> (reward rule) -> REWARD TRANSACTION
 *
 * This module is the middle arrow. It turns the authoritative private player
 * records into two durable, mode-agnostic documents:
 *
 *   ROUND RESULT  written once when a round closes: every joined player's
 *                 round metrics, rank and the match points the scoring
 *                 strategy awarded for that rank. A public, anonymous copy
 *                 lets a projector show round results without any identity.
 *
 *   MATCH RESULT  written once, in the same transaction that finishes the
 *                 match: final standings plus exactly the per-player facts
 *                 every downstream consumer needs — the teacher report, the
 *                 Warm-Up credit, mastery evidence and reward rules. Those
 *                 consumers read THIS document, not the private game state,
 *                 so they can be re-run safely after a crash, and the private
 *                 state can be deleted without losing anything.
 *
 * Rewards consume the match result. They never read the scoreboard, and the
 * scoreboard never reads the rewards ledger.
 */

import { authoritativeReceiptTotal } from './liveChallenge.mjs';
import { rankEntries } from './liveChallengeRanking.mjs';
import { roundOutcome, summarizeRoundProgress } from './liveChallengeResponses.mjs';
import {
  getChallengeMode,
  roundPerformanceFor,
  roundQuestionSpecsFor,
  roundRankingFor,
} from './liveChallengeModes.mjs';
import { SCORE_ACCUMULATION, getScoringStrategy } from './liveChallengeScoring.mjs';

export const RESULT_SCHEMA_VERSION = 1;

const nonNegativeInt = (value) => Math.max(0, Math.round(Number(value) || 0));
const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};
const uniqueRounds = (values) => [...new Set((Array.isArray(values) ? values : [])
  .map((value) => Math.round(Number(value)))
  .filter((value) => Number.isFinite(value) && value >= 0))]
  .sort((a, b) => a - b);

const studentIdOf = (player) => String(player?.studentId || player?.id || '').trim();

/**
 * One closed round, ranked. `players` are private player records (with
 * `studentId` and `submissionReceipts`); only joined players are ranked.
 */
export const buildRoundResult = ({
  roomId,
  roundIndex,
  roundVersion = 0,
  modeId = null,
  scoringStrategyId = null,
  scoringConfig = null,
  players = [],
  secondChanceOf = {},
  closedAtMs = null,
} = {}) => {
  const mode = getChallengeMode(modeId);
  const strategy = getScoringStrategy(scoringStrategyId);
  const config = strategy.normalizeConfig(scoringConfig || {});
  const round = integerOr(roundIndex, -1);
  const questionSpecs = roundQuestionSpecsFor(mode);

  const entries = (Array.isArray(players) ? players : [])
    .filter((player) => player?.joined === true && studentIdOf(player))
    .map((player) => {
      const summary = summarizeRoundProgress({ receipts: player.submissionReceipts, roundIndex: round, questionSpecs });
      return {
        participantId: studentIdOf(player),
        studentId: studentIdOf(player),
        playerKey: player.playerKey ? String(player.playerKey) : null,
        alias: String(player.alias || 'Player'),
        metrics: roundPerformanceFor(mode, summary),
        participated: summary.participated,
        finished: summary.finished,
        roundPoints: summary.points,
      };
    });

  const standings = rankEntries(entries, roundRankingFor(mode)).map((entry) => ({
    studentId: entry.studentId,
    playerKey: entry.playerKey,
    alias: entry.alias,
    rank: entry.rank,
    position: entry.position,
    tied: entry.tied,
    participated: entry.participated,
    finished: entry.finished,
    metrics: entry.metrics,
    roundPoints: entry.roundPoints,
    matchPointsAwarded: strategy.matchPointsForPlacement({
      rank: entry.rank,
      participated: entry.participated,
      performance: entry.metrics.performance,
    }, config),
  }));

  return Object.freeze({
    schemaVersion: RESULT_SCHEMA_VERSION,
    roomId: String(roomId || ''),
    roundIndex: round,
    roundVersion: nonNegativeInt(roundVersion),
    isSecondChance: Object.prototype.hasOwnProperty.call(secondChanceOf || {}, String(round)),
    modeId: mode.id,
    scoringStrategyId: strategy.id,
    closedAtMs: closedAtMs == null ? null : Number(closedAtMs),
    participantCount: standings.length,
    completedCount: standings.filter((standing) => standing.finished).length,
    standings,
  });
};

/** The anonymous copy a projector or student may read: no student ids. */
export const publicRoundSummary = (roundResult = {}) => Object.freeze({
  schemaVersion: RESULT_SCHEMA_VERSION,
  roundIndex: roundResult.roundIndex,
  roundVersion: roundResult.roundVersion,
  isSecondChance: roundResult.isSecondChance === true,
  modeId: roundResult.modeId,
  scoringStrategyId: roundResult.scoringStrategyId,
  closedAtMs: roundResult.closedAtMs ?? null,
  participantCount: roundResult.participantCount || 0,
  completedCount: roundResult.completedCount || 0,
  standings: (roundResult.standings || []).map((standing) => ({
    playerKey: standing.playerKey,
    alias: standing.alias,
    rank: standing.rank,
    position: standing.position,
    tied: standing.tied,
    participated: standing.participated,
    finished: standing.finished,
    roundPoints: standing.roundPoints,
    matchPointsAwarded: standing.matchPointsAwarded,
  })),
});

/**
 * Where a round placed a player: their rank, but only WITH credit. When nobody
 * earns anything every player ties for first, and a round with no credit
 * places no one — counting it as a win would hand a championship tiebreak to
 * everyone who sat through it.
 */
export const roundPlacementRank = (standing = {}) => (
  Number(standing?.metrics?.performance) > 0 ? (standing.rank ?? null) : null
);
export const roundWon = (standing = {}) => roundPlacementRank(standing) === 1;

/**
 * What a closed round changes on one player's record. Strategies that score
 * per response already banked their points at submit time, so only a
 * per-round strategy (placement) changes the match total here.
 */
export const playerTotalsAfterRound = ({
  player = {}, standing = null, roundIndex, scoringStrategyId = null,
} = {}) => {
  const round = integerOr(roundIndex, null);
  if (!standing || round === null || round < 0) return null;
  const strategy = getScoringStrategy(scoringStrategyId);
  const roundKey = String(round);
  const placements = { ...player.roundPlacements };
  const alreadyApplied = Object.prototype.hasOwnProperty.call(placements, roundKey);
  const awarded = nonNegativeInt(standing.matchPointsAwarded);
  if (!alreadyApplied) {
    placements[roundKey] = {
      rank: standing.rank,
      tied: standing.tied === true,
      matchPoints: awarded,
      won: roundWon(standing),
    };
  }
  const matchPoints = Object.values(placements).reduce((sum, entry) => sum + nonNegativeInt(entry?.matchPoints), 0);
  const roundWins = Object.values(placements).filter((entry) => entry?.won === true).length;
  const perRound = strategy.accumulation === SCORE_ACCUMULATION.PER_ROUND;
  return Object.freeze({
    alreadyApplied,
    roundPlacements: placements,
    matchPoints,
    roundWins,
    // For a placement strategy the displayed score IS the championship total.
    ...(perRound ? { score: matchPoints } : {}),
  });
};

/** A player's per-round outcomes, read from response receipts only. */
export const playerRoundOutcomes = (player = {}) => {
  const receipts = player?.submissionReceipts || {};
  const rounds = new Set();
  Object.values(receipts).forEach((receipt) => {
    const round = integerOr(receipt?.roundIndex, null);
    if (round !== null && round >= 0) rounds.add(round);
  });
  return [...rounds].sort((a, b) => a - b)
    .map((roundIndex) => roundOutcome({ receipts, roundIndex }))
    .filter(Boolean);
};

/**
 * One player's final facts, as a match result records them. Everything a
 * report, credit, evidence or reward rule may need — and nothing identifying
 * beyond the student id the teacher-only consumers already hold.
 */
export const standingFromPlayer = (player = {}) => {
  const receipts = player.submissionReceipts || {};
  const score = nonNegativeInt(player.score);
  const joinedAtRound = typeof player.joinedAtRound === 'number' && Number.isInteger(player.joinedAtRound)
    ? Math.max(0, player.joinedAtRound)
    : null;
  return {
    studentId: studentIdOf(player),
    playerKey: player.playerKey ? String(player.playerKey) : null,
    alias: String(player.alias || 'Player'),
    joined: player.joined === true,
    joinedAtRound,
    score,
    rawScore: nonNegativeInt(player.rawScore ?? authoritativeReceiptTotal(receipts)),
    matchPoints: nonNegativeInt(player.matchPoints),
    roundWins: nonNegativeInt(player.roundWins),
    correctCount: nonNegativeInt(player.correctCount),
    roundsAnswered: nonNegativeInt(player.roundsAnswered),
    answeredRounds: uniqueRounds(player.answeredRounds),
    missedRounds: uniqueRounds(player.missedRounds),
    streak: nonNegativeInt(player.streak),
    bestStreak: nonNegativeInt(player.bestStreak),
    comebackCount: nonNegativeInt(player.comebackCount),
    recoveryCount: nonNegativeInt(player.recoveryCount),
    roundOutcomes: playerRoundOutcomes(player),
  };
};

/**
 * The final result of a match, built inside the finishing transaction from the
 * private state it read. `status` is finished or cancelled.
 */
export const buildMatchResult = ({
  roomId,
  room = {},
  privateState = {},
  players = [],
  status,
  finalizedAtMs = null,
  finalizationId = null,
} = {}) => {
  const mode = getChallengeMode(room.challengeMode);
  const strategy = getScoringStrategy(room.scoringStrategyId || privateState.scoringStrategyId);
  const questionIds = Array.isArray(privateState.questionIds) ? privateState.questionIds.map(String) : [];
  const scheduledRoundCount = nonNegativeInt(privateState.scheduledRoundCount)
    || questionIds.length
    || nonNegativeInt(room.roundCount);
  const secondChanceOf = privateState.secondChanceOf && typeof privateState.secondChanceOf === 'object'
    ? privateState.secondChanceOf
    : {};

  const entries = (Array.isArray(players) ? players : [])
    .filter((player) => studentIdOf(player))
    .map((player) => {
      const standing = standingFromPlayer(player);
      // `liveScore` is the accuracy-first ranking metric; a finished match has
      // no work in progress, so it is the banked score.
      return { ...standing, participantId: standing.studentId, liveScore: standing.score };
    });

  const ranked = rankEntries(entries.filter((entry) => entry.joined), strategy.matchRanking);
  const absent = entries
    .filter((entry) => !entry.joined)
    .sort((a, b) => (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0))
    .map((entry) => ({ ...entry, rank: null, position: null, tied: false }));
  const standings = [...ranked, ...absent].map(({ participantId: _participantId, liveScore: _liveScore, ...standing }) => standing);

  return Object.freeze({
    schemaVersion: RESULT_SCHEMA_VERSION,
    roomId: String(roomId || ''),
    status: String(status || ''),
    modeId: mode.id,
    modeVersion: mode.version,
    scoringStrategyId: strategy.id,
    title: String(room.title || 'Live Challenge'),
    teacherEmail: room.teacherEmail || null,
    classId: room.classId || null,
    classPeriod: room.classPeriod || null,
    className: room.className || null,
    courseId: room.courseId || null,
    standardCode: room.standardCode || null,
    assignmentId: room.assignmentId || null,
    roundSeconds: nonNegativeInt(room.roundSeconds) || null,
    // The scheduled count the room was created with; the Warm-Up credit
    // denominator has always been this number.
    roomRoundCount: nonNegativeInt(room.roundCount),
    scheduledRoundCount,
    playedRoundCount: Math.max(0, integerOr(room.currentRound, -1) + 1),
    questionIds,
    roundStandards: privateState.roundStandards && typeof privateState.roundStandards === 'object' ? privateState.roundStandards : {},
    secondChanceOf,
    // Counters from rooms that predate derived tallies; see deriveRoundTallies.
    legacyRoundAnswers: privateState.roundAnswers || null,
    legacyRoundMisses: privateState.roundMisses || null,
    eligibleCount: entries.length,
    playedCount: entries.filter((entry) => entry.joined).length,
    standings,
    finalizedAtMs: finalizedAtMs == null ? null : Number(finalizedAtMs),
    finalizationId: finalizationId ? String(finalizationId) : null,
  });
};

/** One student's final standing, or null. */
export const matchResultStanding = (matchResult = {}, studentId) => (
  (matchResult.standings || []).find((standing) => standing.studentId === String(studentId || '')) || null
);

/*
 * FINALIZATION EFFECTS. A match result records each downstream effect — the
 * report, invites, Warm-Up credit, evidence, rewards, and last the private
 * state's cleanup — as "pending", "done", "failed" or "notApplicable".
 */
export const finalizationEffectSettled = (value) => value === 'done' || value === 'notApplicable';

/**
 * Where one run of the effects leaves a match. While anything is unsettled
 * the sweep runs it again; from the last attempt on, whatever still fails —
 * the private-state cleanup included — is given up (and logged by the
 * caller), so one broken match cannot hold one of the sweep's slots forever.
 */
export const finalizationEffectsState = ({ effects = {}, attempts = 0, maxAttempts } = {}) => {
  const unsettled = Object.values(effects || {}).some((value) => !finalizationEffectSettled(value));
  const abandoned = unsettled && Number(attempts) >= Number(maxAttempts);
  return Object.freeze({ pending: unsettled && !abandoned, abandoned });
};
