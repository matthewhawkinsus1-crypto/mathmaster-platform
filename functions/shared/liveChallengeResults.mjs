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
import { ROUND_STATE, roomRoundState } from './liveChallengeLifecycle.mjs';
import { rankEntries } from './liveChallengeRanking.mjs';
import { timerFromRoom } from './liveChallengeTimer.mjs';
import {
  COMPLETION_RULE,
  RECEIPT_KIND,
  isAttemptReceipt,
  questionProgress,
  receiptKindOf,
  roundOutcome,
  summarizeRoundProgress,
} from './liveChallengeResponses.mjs';
import {
  ROUND_STRUCTURE,
  getChallengeMode,
  modeRoundOutcome,
  roundPerformanceFor,
  roundQuestionSpecsFor,
  roundRankingFor,
  roundStructureFor,
} from './liveChallengeModes.mjs';
import { SCORE_ACCUMULATION, getScoringStrategy } from './liveChallengeScoring.mjs';
import { classStandingsRows, roundTableRows } from './liveChallengePrivacy.mjs';

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

  const entries = (Array.isArray(players) ? players : [])
    .filter((player) => player?.joined === true && studentIdOf(player))
    .map((player) => {
      // Per-player modes read each player's own question specs from their log.
      const questionSpecs = roundQuestionSpecsFor(mode, { receipts: player.submissionReceipts, roundIndex: round });
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

  // The players who actually raced this round: what a field-scaled placement
  // curve divides its range across.
  const fieldSize = entries.filter((entry) => entry.participated).length;
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
      fieldSize,
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
    fieldSize,
    standings,
  });
};

/*
 * What a question-set round's anonymous copy says about each player: how many
 * questions they completed and how accurately. Facts a round-results screen
 * shows next to an alias; never the attempts themselves.
 */
const publicRoundFacts = (standing) => {
  const metrics = standing?.metrics || {};
  if (!Number.isFinite(Number(metrics.questionsCorrect)) || metrics.questionsCorrect === undefined) return {};
  return {
    completed: nonNegativeInt(metrics.questionsCorrect),
    accuracyPercent: Number.isFinite(Number(metrics.accuracy)) && metrics.accuracy !== null
      ? Math.round(Number(metrics.accuracy) * 100)
      : null,
  };
};

/**
 * The anonymous copy a projector or student may read: no student ids.
 *
 * `standingsAfterRound` (matchStandingsAfterRound) is added when the closing
 * transaction supplies it: the match standings this round left behind, so a
 * results screen shows the round and the standings it produced from one
 * document written in one commit.
 */
export const publicRoundSummary = (roundResult = {}, { standingsAfterRound = null } = {}) => Object.freeze({
  ...(Array.isArray(standingsAfterRound) ? { standingsAfterRound } : {}),
  schemaVersion: RESULT_SCHEMA_VERSION,
  roundIndex: roundResult.roundIndex,
  roundVersion: roundResult.roundVersion,
  isSecondChance: roundResult.isSecondChance === true,
  modeId: roundResult.modeId,
  scoringStrategyId: roundResult.scoringStrategyId,
  closedAtMs: roundResult.closedAtMs ?? null,
  participantCount: roundResult.participantCount || 0,
  completedCount: roundResult.completedCount || 0,
  fieldSize: roundResult.fieldSize ?? null,
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
    ...publicRoundFacts(standing),
  })),
});

/**
 * Whether a round's TABLE lists what each player earned (most points first)
 * rather than the engine's round placement: a per-response strategy (Accuracy
 * First, Correct Count) never reads the round's place, and a question-set
 * round always ranks the work. The screens use the same predicate
 * (challengeStandingsModel.roundRankedByPoints).
 */
export const roundTableByPoints = ({ scoringStrategyId = null, modeId = null } = {}) => (
  getScoringStrategy(scoringStrategyId).accumulation !== SCORE_ACCUMULATION.PER_ROUND
  && roundStructureFor(getChallengeMode(modeId)).id !== ROUND_STRUCTURE.QUESTION_SET
);

/**
 * THE CLASS'S COPY OF A CLOSED ROUND (liveChallengeRooms/{room}/rounds/{n}),
 * which every student in the room can read. Only the rows the public rule
 * shows the whole class (liveChallengePrivacy.classStandingsRows) — of the
 * round's table, ranked as a screen shows it, and of the standings the round
 * left — with how many played and where each list's last group starts. No
 * other player's place, score or round result. The full anonymous copy
 * (publicRoundSummary) goes where only the room's teacher reads it
 * (hostRounds/{n}); each student's own row goes to their own summary
 * (liveChallengePlayerSummary.mjs).
 */
export const classRoundSummary = (roundResult = {}, { standingsAfterRound = null } = {}) => (
  classCopyOfRoundSummary(publicRoundSummary(roundResult, { standingsAfterRound }))
);

/**
 * The class's copy of a whole anonymous round summary (publicRoundSummary's
 * shape, as hostRounds/{n} holds it — and as rounds/{n} held it before the
 * class's copy existed, which scripts/scrub-live-challenge-public-ranks.mjs
 * rewrites with this).
 */
export const classCopyOfRoundSummary = (full = {}) => {
  const standingsAfterRound = Array.isArray(full.standingsAfterRound) ? full.standingsAfterRound : null;
  const table = classStandingsRows(roundTableRows(full.standings, { byPoints: roundTableByPoints(full) }), {
    totalCount: nonNegativeInt(full.participantCount) || (Array.isArray(full.standings) ? full.standings.length : 0),
  });
  const after = standingsAfterRound ? classStandingsRows(standingsAfterRound) : null;
  return Object.freeze({
    schemaVersion: RESULT_SCHEMA_VERSION,
    // The rows below are the class's, already ranked for display: a screen
    // draws them as they are and adds the viewer's own row from their summary.
    visibility: 'class',
    roundIndex: integerOr(full.roundIndex, -1),
    roundVersion: nonNegativeInt(full.roundVersion),
    isSecondChance: full.isSecondChance === true,
    modeId: full.modeId ?? null,
    scoringStrategyId: full.scoringStrategyId ?? null,
    closedAtMs: full.closedAtMs ?? null,
    participantCount: nonNegativeInt(full.participantCount),
    completedCount: nonNegativeInt(full.completedCount),
    fieldSize: full.fieldSize ?? null,
    standings: table.rows.map((row) => ({
      playerKey: row.playerKey,
      alias: row.alias,
      rank: row.rank,
      position: row.position,
      tied: row.tied,
      participated: row.participated,
      roundPoints: row.roundPoints,
      matchPointsAwarded: row.matchPointsAwarded,
      ...(row.completed === null ? {} : { completed: row.completed }),
      ...(row.accuracyPercent === null ? {} : { accuracyPercent: row.accuracyPercent }),
    })),
    tableLastRank: table.lastRank,
    ...(after ? {
      standingsAfterRound: after.rows.map((row) => ({
        playerKey: row.playerKey,
        alias: row.alias,
        rank: row.rank,
        position: integerOr(row.position, 0),
        tied: row.tied === true,
        score: nonNegativeInt(row.score),
        correctCount: nonNegativeInt(row.correctCount),
        roundsAnswered: nonNegativeInt(row.roundsAnswered),
        roundWins: nonNegativeInt(row.roundWins),
      })),
      standingsLastRank: after.lastRank,
      standingsCount: after.totalCount,
    } : {}),
  });
};

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

/**
 * A player's per-round outcomes, read from attempt receipts only. A classic
 * round's outcome is its graded response; a question-set round's is how the
 * player's round went (liveChallengeResponses.questionSetRoundOutcome).
 */
export const playerRoundOutcomes = (player = {}, { mode = null } = {}) => {
  const receipts = player?.submissionReceipts || {};
  const rounds = new Set();
  Object.values(receipts).forEach((receipt) => {
    const round = integerOr(receipt?.roundIndex, null);
    if (round !== null && round >= 0) rounds.add(round);
  });
  const questionSet = mode && roundStructureFor(mode).id === ROUND_STRUCTURE.QUESTION_SET;
  return [...rounds].sort((a, b) => a - b)
    .map((roundIndex) => {
      if (!questionSet) return roundOutcome({ receipts, roundIndex });
      const questionSpecs = roundQuestionSpecsFor(mode, { receipts, roundIndex });
      return modeRoundOutcome(mode, summarizeRoundProgress({ receipts, roundIndex, questionSpecs }));
    })
    .filter(Boolean);
};

const tally = () => ({ questions: 0, completed: 0, attempts: 0, hits: 0 });

/**
 * One player's whole match in a question-set mode, for the teacher's report:
 * totals, and the same counts broken down by the tags each attempt recorded
 * (the feature asked, the function family, the difficulty tier). Built from
 * the receipt log alone.
 */
export const questionSetMatchSummary = (player = {}) => {
  const receipts = player?.submissionReceipts || {};
  const attempts = Object.entries(receipts)
    .filter(([, receipt]) => isAttemptReceipt(receipt) && receiptKindOf(receipt) === RECEIPT_KIND.TARGET);
  const questions = new Map();
  attempts.forEach(([, receipt]) => {
    const key = `${integerOr(receipt.roundIndex, -1)}:${integerOr(receipt.questionIndex, 0)}`;
    if (!questions.has(key)) {
      questions.set(key, {
        roundIndex: integerOr(receipt.roundIndex, -1),
        questionIndex: integerOr(receipt.questionIndex, 0),
        targetCount: integerOr(receipt.targetCount, 1),
        feature: receipt.feature ? String(receipt.feature) : null,
        family: receipt.family ? String(receipt.family) : null,
        tier: receipt.tier ? String(receipt.tier) : null,
      });
    }
  });
  const totals = { questions: 0, completed: 0, skipped: 0, attempts: 0, hits: 0, dnePresses: 0, dneCorrect: 0 };
  const byFeature = {};
  const byFamily = {};
  const byTier = {};
  const bump = (bucket, key, progress) => {
    if (!key) return;
    const entry = bucket[key] || tally();
    entry.questions += 1;
    entry.completed += progress.completedCorrectly ? 1 : 0;
    entry.attempts += progress.attempts;
    entry.hits += progress.correctAttempts;
    bucket[key] = entry;
  };
  questions.forEach((question) => {
    const progress = questionProgress({
      receipts,
      roundIndex: question.roundIndex,
      questionIndex: question.questionIndex,
      spec: { completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount: question.targetCount },
    });
    totals.questions += 1;
    totals.completed += progress.completedCorrectly ? 1 : 0;
    totals.skipped += progress.completed && !progress.completedCorrectly ? 1 : 0;
    totals.attempts += progress.attempts;
    totals.hits += progress.correctAttempts;
    bump(byFeature, question.feature, progress);
    bump(byFamily, question.family, progress);
    bump(byTier, question.tier, progress);
  });
  attempts.forEach(([, receipt]) => {
    if (receipt.attemptKind !== 'dne') return;
    totals.dnePresses += 1;
    if (receipt.isCorrect === true) totals.dneCorrect += 1;
  });
  return Object.freeze({ ...totals, byFeature, byFamily, byTier });
};

/** Hits over attempts across the whole match, or null with no attempts. */
const attemptAccuracy = (player = {}) => {
  let attempts = 0;
  let hits = 0;
  Object.values(player?.submissionReceipts || {}).forEach((receipt) => {
    if (!isAttemptReceipt(receipt)) return;
    attempts += 1;
    if (receipt.isCorrect === true && receipt.forfeit !== true) hits += 1;
  });
  return attempts > 0 ? hits / attempts : null;
};

/**
 * One player's final facts, as a match result records them. Everything a
 * report, credit, evidence or reward rule may need — and nothing identifying
 * beyond the student id the teacher-only consumers already hold.
 */
export const standingFromPlayer = (player = {}, { mode = null } = {}) => {
  const receipts = player.submissionReceipts || {};
  const score = nonNegativeInt(player.score);
  const joinedAtRound = typeof player.joinedAtRound === 'number' && Number.isInteger(player.joinedAtRound)
    ? Math.max(0, player.joinedAtRound)
    : null;
  // Question-set modes record attempts that classic rounds do not have: the
  // accuracy that breaks a Correct Count tie, and the report's breakdown.
  const questionSet = mode && roundStructureFor(mode).id === ROUND_STRUCTURE.QUESTION_SET;
  return {
    studentId: studentIdOf(player),
    playerKey: player.playerKey ? String(player.playerKey) : null,
    // The player's seat in the room's standings snapshot, kept so the final
    // standings can be rebuilt from this result alone (null in a room from
    // before seats).
    slot: Number.isInteger(player.slot) ? player.slot : null,
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
    roundOutcomes: playerRoundOutcomes(player, { mode }),
    ...(questionSet ? {
      matchAccuracy: attemptAccuracy(player),
      questionSetSummary: questionSetMatchSummary(player),
    } : {}),
  };
};

/**
 * The match standings a closed round leaves behind: every joined player ranked
 * by the strategy's MATCH ranking on their totals after the round — the same
 * ranking the final match result (and every reward rule) uses.
 *
 * Written into the round's anonymous result in the transaction that closes
 * the round, so a results screen never pairs the round's table with standings
 * from before it (a Grand Prix round changes every total when it closes), and
 * so movement — ↑2 since the last round — is the difference between two ranks
 * the engine wrote, which a refresh or a reconnect reads back unchanged.
 *
 * Ties list by alias, then player key: the order the live board
 * (publicLeaderboard) gives them.
 */
export const matchStandingsAfterRound = ({ players = [], modeId = null, scoringStrategyId = null } = {}) => {
  const mode = getChallengeMode(modeId);
  const strategy = getScoringStrategy(scoringStrategyId);
  const entries = (Array.isArray(players) ? players : [])
    .filter((player) => player?.joined === true && player?.playerKey && studentIdOf(player))
    .map((player) => {
      const standing = standingFromPlayer(player, { mode });
      return { ...standing, participantId: standing.playerKey, liveScore: standing.score };
    });
  return rankEntries(entries, strategy.matchRanking).map((entry) => Object.freeze({
    playerKey: entry.playerKey,
    alias: entry.alias,
    rank: entry.rank,
    position: entry.position,
    tied: entry.tied,
    score: entry.score,
    correctCount: entry.correctCount,
    roundsAnswered: entry.roundsAnswered,
    roundWins: entry.roundWins,
  }));
};

/**
 * Whether the room's open round has started at `atMs`: false only for a round
 * the host opened that is still in its 3-2-1 countdown (`startsAt` ahead), which
 * nobody could answer — the server refuses every arrival before `startsAt`.
 * A room with no clock to read, or no instant to read it at, is taken as
 * started, which is what every reader assumed before this existed.
 */
export const openRoundStartedAt = (room = {}, atMs = null) => {
  if (roomRoundState(room) !== ROUND_STATE.OPEN) return true;
  const { startsAtMs } = timerFromRoom(room);
  const at = Number(atMs);
  if (!startsAtMs || atMs === null || atMs === undefined || !Number.isFinite(at)) return true;
  return at >= startsAtMs;
};

/**
 * How many rounds the match actually PLAYED when it ended at `atMs`: every
 * round it opened, less an open round still in its countdown. "End Game"
 * pressed during a 3-2-1 (Next Round, then the bell) used to count that round
 * as played, so every student was measured against a round no one could
 * answer — the Warm-Up credit's denominator grew and the Finisher reward,
 * which asks for most of the rounds a student could play, was denied.
 */
export const playedRoundCountAt = (room = {}, atMs = null) => {
  const opened = Math.max(0, integerOr(room?.currentRound, -1) + 1);
  return opened > 0 && !openRoundStartedAt(room, atMs) ? opened - 1 : opened;
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
      const standing = standingFromPlayer(player, { mode });
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
    // Rounds that started, so never one ended during its countdown.
    playedRoundCount: playedRoundCountAt(room, finalizedAtMs),
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
