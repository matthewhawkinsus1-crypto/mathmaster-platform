/*
 * GRAPH FEATURE RUSH: ATTEMPTS, PROGRESS AND RESULTS.
 *
 * The rush is a Live Challenge mode, so everything a mode must not own — the
 * lifecycle, the authoritative clock, receipts and idempotency, ranking,
 * round and match results, rewards — is the engine's. This module is the
 * mode's own arithmetic, kept pure so every rule here is tested without a
 * database:
 *
 *   applyRushAttempts   the body of the submit transaction: a batch of taps,
 *                       "Does Not Exist" presses and skips, graded in order
 *                       against the server's own regenerated questions and
 *                       written as targetAttempt receipts
 *   rushRoundState      where a student stands in a round (which graph,
 *                       which of its targets are found), read from receipts
 *   rushLockoutMs       the brief cooldown after repeated wrong taps
 *   buildRushReport     the teacher's after-game breakdown
 *
 * ONE QUESTION AT A TIME. A student's questions are a sequence; an attempt is
 * accepted only for the CURRENT question (the first one not yet completed or
 * skipped). A late duplicate tap for a finished graph is answered "resolved"
 * and recorded nowhere; an attempt for a later graph is "out of order" and the
 * device resynchronizes. So a question completes exactly once, however many
 * taps race, retry or replay.
 *
 * Pure: Cloud Functions, the student device (cooldown, state) and tests.
 */

import { authoritativeReceiptTotal } from './liveChallenge.mjs';
import {
  ATTEMPT_DECISION,
  COMPLETION_RULE,
  RECEIPT_KIND,
  isAttemptReceipt,
  planAttempt,
  questionProgress,
  receiptKindOf,
  summarizeRoundProgress,
} from './liveChallengeResponses.mjs';
import { SCORE_ACCUMULATION } from './liveChallengeScoring.mjs';
import { DOES_NOT_EXIST_TARGET_ID, getGraphFeature } from './graphFeatureRegistry.mjs';
import { getGraphFamily } from './graphFeatureFamilies.mjs';
import { POINTER_KIND, TAP_RESULT, clampTolerance, normalizePointerKind, resolveTap } from './graphFeatureHitTest.mjs';

export const RUSH_ATTEMPT_KIND = Object.freeze({
  TAP: 'tap',
  DOES_NOT_EXIST: 'dne',
  SKIP: 'skip',
});

export const RUSH_VERDICT = Object.freeze({
  // Recorded attempts.
  HIT: 'hit',
  MISS: 'miss',
  SKIPPED: 'skipped',
  // Not recorded: neither credit nor penalty.
  ALREADY_FOUND: 'alreadyFound',
  RESOLVED: 'resolved',
  OUT_OF_ORDER: 'outOfOrder',
  LIMIT: 'limit',
  INVALID: 'invalid',
});

export const RUSH_LIMITS = Object.freeze({
  // Attempts in one request. A device sends one request at a time, so a burst
  // of taps on a slow connection arrives as one batch, in order.
  batch: 12,
  // Recorded attempts on one graph, and in one round. Far above anything a
  // student tapping with intent produces; they bound the private record.
  perQuestion: 30,
  perRound: 400,
  // How long before its request arrived an attempt may claim to have happened.
  claimWindowMs: 8_000,
  // Questions a device may ask for at once.
  issueBatch: 8,
});

const TARGET_SPEC = (targetCount) => Object.freeze({ completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount });

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

const finiteOr = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const round3 = (value) => Math.round(value * 1000) / 1000;

/* ------------------------------ round state ------------------------------ */

const roundReceiptsOf = (receipts, roundIndex) => Object.entries(receipts || {})
  .filter(([, receipt]) => isAttemptReceipt(receipt)
    && receiptKindOf(receipt) === RECEIPT_KIND.TARGET
    && integerOr(receipt.roundIndex, null) === roundIndex);

const targetCountOf = (receipts, roundIndex, questionIndex) => {
  const first = roundReceiptsOf(receipts, roundIndex)
    .map(([, receipt]) => receipt)
    .filter((receipt) => integerOr(receipt.questionIndex, 0) === questionIndex)
    .sort((left, right) => integerOr(left.sequence, 0) - integerOr(right.sequence, 0))[0];
  return first ? Math.max(1, integerOr(first.targetCount, 1)) : 1;
};

/** The progress of one of a student's questions, read from their receipts. */
export const rushQuestionProgress = ({ receipts, roundIndex, questionIndex, targetCount = null }) => questionProgress({
  receipts,
  roundIndex,
  questionIndex,
  spec: TARGET_SPEC(targetCount ?? targetCountOf(receipts, roundIndex, questionIndex)),
});

/**
 * Where a student stands in a round. `cursor` is the question they are on:
 * the first that is neither completed nor skipped.
 */
export const rushRoundState = ({ receipts = {}, roundIndex, poolSize = 50 } = {}) => {
  const round = integerOr(roundIndex, -1);
  let cursor = 0;
  let current = null;
  while (cursor < poolSize) {
    current = rushQuestionProgress({ receipts, roundIndex: round, questionIndex: cursor });
    if (!current.completed) break;
    cursor += 1;
  }
  const specs = Array.from({ length: poolSize }, (_, index) => TARGET_SPEC(targetCountOf(receipts, round, index)))
    .map((spec, questionIndex) => ({ ...spec, questionIndex }));
  const summary = summarizeRoundProgress({ receipts, roundIndex: round, questionSpecs: specs });
  const skipped = summary.questions.filter((question) => question.completed && !question.completedCorrectly).length;
  return Object.freeze({
    roundIndex: round,
    cursor,
    exhausted: cursor >= poolSize,
    cursorTargetsFound: Object.freeze(cursor < poolSize && current ? [...current.targetsFound] : []),
    cursorAttempts: cursor < poolSize && current ? current.attempts : 0,
    questionsCorrect: summary.questionsCorrect,
    skipped,
    attempts: summary.attempts,
    hits: summary.correctAttempts,
    accuracy: summary.accuracy,
    scoreTotal: summary.scoreTotal,
  });
};

/* -------------------------------- attempts ------------------------------- */

/** A client attempt, shape-checked. Returns null for anything malformed. */
export const normalizeRushAttempt = (raw = {}) => {
  const attemptId = String(raw?.attemptId || '').trim();
  if (!attemptId || attemptId.length > 100) return null;
  const questionIndex = integerOr(raw?.questionIndex, null);
  if (questionIndex === null || questionIndex < 0) return null;
  const kind = Object.values(RUSH_ATTEMPT_KIND).includes(raw?.kind) ? raw.kind : null;
  if (!kind) return null;
  const x = finiteOr(raw?.x);
  const y = finiteOr(raw?.y);
  if (kind === RUSH_ATTEMPT_KIND.TAP && (x === null || y === null)) return null;
  return Object.freeze({
    attemptId,
    questionIndex,
    kind,
    x,
    y,
    tolerance: Object.freeze({ x: finiteOr(raw?.tolerance?.x), y: finiteOr(raw?.tolerance?.y) }),
    pointer: normalizePointerKind(raw?.pointer),
    clientElapsedMs: finiteOr(raw?.clientElapsedMs),
  });
};

/** The verdict a recorded receipt stands for (a replayed attempt reports it again). */
export const verdictOfReceipt = (receipt = {}) => {
  if (receipt.forfeit === true) return RUSH_VERDICT.SKIPPED;
  return receipt.isCorrect === true ? RUSH_VERDICT.HIT : RUSH_VERDICT.MISS;
};

const verdictRow = (attempt, verdict, extra = {}) => Object.freeze({
  attemptId: attempt?.attemptId ?? null,
  questionIndex: attempt?.questionIndex ?? null,
  verdict,
  targetId: null,
  completesQuestion: false,
  ...extra,
});

/**
 * Grade a batch of attempts against the student's regenerated questions and
 * produce the receipts to write. Pure: the submit transaction calls it with
 * the player exactly as it read them, and writes what it returns.
 *
 * @param {object}   input
 * @param {object}   input.player            private player record
 * @param {number}   input.roundIndex
 * @param {number}   input.roundVersion
 * @param {Array}    input.attempts          raw attempts, in the order made
 * @param {Function} input.questionFor       (questionIndex) => issued question
 * @param {number}   input.arrivedAtMs       server arrival time of the request
 * @param {number}   input.arrivalElapsedMs  server-observed elapsed round time
 * @param {number}   input.roundDurationMs
 * @param {object}   input.strategy          the room's scoring strategy
 * @param {number}   input.poolSize
 */
export const applyRushAttempts = ({
  player = {},
  roundIndex,
  roundVersion = 0,
  attempts = [],
  questionFor,
  arrivedAtMs = 0,
  arrivalElapsedMs = 0,
  roundDurationMs = 60_000,
  strategy,
  poolSize = 50,
} = {}) => {
  const round = integerOr(roundIndex, -1);
  const receipts = { ...player.submissionReceipts };
  let sequence = Math.max(0, integerOr(player.attemptSequence, 0));
  const lastElapsed = roundReceiptsOf(receipts, round)
    .reduce((latest, [, receipt]) => Math.max(latest, finiteOr(receipt.elapsedMs, 0)), 0);
  let elapsedFloor = lastElapsed;
  const ceiling = Math.max(0, Math.min(finiteOr(arrivalElapsedMs, 0), finiteOr(roundDurationMs, 0)));
  const questionCache = new Map();
  const questionOf = (index) => {
    if (!questionCache.has(index)) questionCache.set(index, (typeof questionFor === 'function' ? questionFor(index) : null) || null);
    return questionCache.get(index);
  };
  let roundRecorded = roundReceiptsOf(receipts, round).length;
  const verdicts = [];
  let recorded = 0;
  let completed = 0;

  (Array.isArray(attempts) ? attempts : []).slice(0, RUSH_LIMITS.batch).forEach((raw) => {
    const attempt = normalizeRushAttempt(raw);
    if (!attempt) {
      verdicts.push(verdictRow({ attemptId: raw?.attemptId ? String(raw.attemptId).slice(0, 100) : null }, RUSH_VERDICT.INVALID));
      return;
    }
    const prior = receipts[attempt.attemptId];
    if (prior) {
      verdicts.push(verdictRow(attempt, verdictOfReceipt(prior), {
        replay: true,
        targetId: prior.targetId ?? null,
        completesQuestion: prior.completesQuestion === true,
      }));
      return;
    }
    if (attempt.questionIndex >= poolSize) {
      verdicts.push(verdictRow(attempt, RUSH_VERDICT.INVALID));
      return;
    }
    const state = rushRoundState({ receipts, roundIndex: round, poolSize });
    if (attempt.questionIndex < state.cursor) {
      verdicts.push(verdictRow(attempt, RUSH_VERDICT.RESOLVED));
      return;
    }
    if (attempt.questionIndex > state.cursor) {
      verdicts.push(verdictRow(attempt, RUSH_VERDICT.OUT_OF_ORDER));
      return;
    }
    if (state.cursorAttempts >= RUSH_LIMITS.perQuestion || roundRecorded >= RUSH_LIMITS.perRound) {
      verdicts.push(verdictRow(attempt, RUSH_VERDICT.LIMIT));
      return;
    }
    const question = questionOf(attempt.questionIndex);
    if (!question) {
      verdicts.push(verdictRow(attempt, RUSH_VERDICT.INVALID));
      return;
    }
    const targetCount = Math.max(1, integerOr(question.targetCount, 1));
    const found = [...state.cursorTargetsFound];

    let targetId;
    let isCorrect = false;
    let forfeit = false;
    if (attempt.kind === RUSH_ATTEMPT_KIND.SKIP) {
      targetId = 'skip';
      forfeit = true;
    } else if (attempt.kind === RUSH_ATTEMPT_KIND.DOES_NOT_EXIST) {
      targetId = DOES_NOT_EXIST_TARGET_ID;
      isCorrect = question.targets.length === 0;
    } else {
      const tap = resolveTap({
        targets: question.targets,
        found,
        tap: { x: attempt.x, y: attempt.y },
        tolerance: attempt.tolerance,
        view: question.view,
      });
      if (tap.result === TAP_RESULT.ALREADY_FOUND) {
        verdicts.push(verdictRow(attempt, RUSH_VERDICT.ALREADY_FOUND, { targetId: tap.targetId }));
        return;
      }
      isCorrect = tap.result === TAP_RESULT.HIT;
      targetId = isCorrect ? tap.targetId : 'miss';
    }

    // The engine's own attempt rule has the last word (completed question,
    // duplicate target), so the rush cannot drift from the contract.
    const plan = planAttempt({
      receipts,
      roundIndex: round,
      questionIndex: attempt.questionIndex,
      spec: TARGET_SPEC(targetCount),
      attemptId: attempt.attemptId,
      targetId,
    });
    if (plan.decision !== ATTEMPT_DECISION.ACCEPT) {
      verdicts.push(verdictRow(attempt, RUSH_VERDICT.RESOLVED));
      return;
    }

    const completesQuestion = isCorrect && found.length + 1 >= targetCount;
    const claimed = finiteOr(attempt.clientElapsedMs, ceiling);
    // Server-observed bounds: never after arrival, never before the previous
    // attempt, never earlier than the claim window allows.
    const elapsedMs = Math.round(Math.min(ceiling, Math.max(elapsedFloor, ceiling - RUSH_LIMITS.claimWindowMs, claimed)));
    elapsedFloor = elapsedMs;
    sequence += 1;
    const score = strategy?.scoreTargetAttempt
      ? strategy.scoreTargetAttempt({ completesQuestion, isCorrect })
      : { pointsAwarded: completesQuestion ? 1 : 0 };
    receipts[attempt.attemptId] = {
      receiptKind: RECEIPT_KIND.TARGET,
      attemptKind: attempt.kind,
      submissionId: attempt.attemptId,
      roundIndex: round,
      roundVersion: integerOr(roundVersion, 0),
      questionIndex: attempt.questionIndex,
      targetId,
      targetCount,
      isCorrect,
      ...(forfeit ? { forfeit: true } : {}),
      completesQuestion,
      // What was asked, for the teacher's report.
      feature: question.feature,
      family: question.family,
      tier: question.tier,
      // Where a tap landed, for analysing what students mistake for a feature.
      ...(attempt.kind === RUSH_ATTEMPT_KIND.TAP ? { x: round3(attempt.x), y: round3(attempt.y), pointer: attempt.pointer } : {}),
      sequence,
      arrivedAtMs: finiteOr(arrivedAtMs, 0),
      elapsedMs,
      pointsAwarded: Math.max(0, Math.round(Number(score?.pointsAwarded) || 0)),
      serverConfirmed: true,
    };
    recorded += 1;
    roundRecorded += 1;
    if (completesQuestion) completed += 1;
    verdicts.push(verdictRow(attempt, forfeit ? RUSH_VERDICT.SKIPPED : (isCorrect ? RUSH_VERDICT.HIT : RUSH_VERDICT.MISS), {
      targetId: isCorrect ? targetId : null,
      completesQuestion,
    }));
  });

  const state = rushRoundState({ receipts, roundIndex: round, poolSize });
  return Object.freeze({
    receipts,
    verdicts: Object.freeze(verdicts),
    recorded,
    completed,
    attemptSequence: sequence,
    state,
    totals: rushPlayerTotals({ player, receipts, strategy }),
  });
};

/**
 * The player-level numbers a batch of receipts implies: the match score, the
 * raw work total, questions completed, rounds taken part in and accuracy.
 */
export const rushPlayerTotals = ({ player = {}, receipts = {}, strategy } = {}) => {
  const attempts = Object.values(receipts).filter((receipt) => isAttemptReceipt(receipt) && receiptKindOf(receipt) === RECEIPT_KIND.TARGET);
  const rawScore = authoritativeReceiptTotal(receipts);
  const perRound = strategy?.accumulation === SCORE_ACCUMULATION.PER_ROUND;
  const rounds = [...new Set(attempts.map((receipt) => integerOr(receipt.roundIndex, -1)).filter((round) => round >= 0))].sort((a, b) => a - b);
  const hits = attempts.filter((receipt) => receipt.isCorrect === true && receipt.forfeit !== true).length;
  return Object.freeze({
    rawScore,
    // A placement strategy's score changes only when a round closes.
    score: perRound ? Math.max(0, Math.round(Number(player.score) || 0)) : rawScore,
    correctCount: attempts.filter((receipt) => receipt.completesQuestion === true && receipt.isCorrect === true).length,
    roundsAnswered: rounds.length,
    answeredRounds: rounds,
    targetAttempts: attempts.length,
    targetHits: hits,
    matchAccuracy: attempts.length ? hits / attempts.length : null,
  });
};

/* --------------------------------- device -------------------------------- */

// Consecutive wrong answers on one graph before input pauses, and the pause.
export const RUSH_LOCKOUT = Object.freeze({ after: 2, baseMs: 600, stepMs: 600, maxMs: 3_000 });

// Misses on one graph after which it is skipped for the student: a stuck
// student moves on, and sweeping an axis for intercepts stops paying.
export const RUSH_AUTO_SKIP_MISSES = 8;

/**
 * The cooldown after `consecutiveMisses` wrong taps (or wrong "Does Not
 * Exist" presses) in a row on one graph. A single mistake costs nothing; a
 * second in a row a moment's pause; spraying taps a growing one, so guessing
 * is slower than looking. Tuned by simulation (graphFeatureRushEngine tests):
 * every honest pace outranks spraying and axis-sweeping.
 */
export const rushLockoutMs = (consecutiveMisses = 0) => {
  const misses = Math.max(0, Math.floor(Number(consecutiveMisses) || 0));
  if (misses < RUSH_LOCKOUT.after) return 0;
  return Math.min(RUSH_LOCKOUT.maxMs, RUSH_LOCKOUT.baseMs + (misses - RUSH_LOCKOUT.after) * RUSH_LOCKOUT.stepMs);
};

// How long a completed graph's success flash, and a skip, hold the screen.
export const RUSH_COMPLETE_FLASH_MS = 420;
export const RUSH_SKIP_PAUSE_MS = 1_200;

export { POINTER_KIND };

/* --------------------------------- report -------------------------------- */

const percent = (numerator, denominator) => (denominator > 0 ? Math.round((numerator / denominator) * 100) : null);

const breakdown = (rows, labelOf) => Object.entries(rows || {})
  .map(([key, value]) => ({
    key,
    label: labelOf(key),
    questions: value.questions,
    completed: value.completed,
    attempts: value.attempts,
    hits: value.hits,
    completionPercent: percent(value.completed, value.questions),
    accuracyPercent: percent(value.hits, value.attempts),
  }))
  // Hardest first: what the class completed least often, then least accurately.
  .sort((left, right) => (left.completionPercent ?? 101) - (right.completionPercent ?? 101)
    || (left.accuracyPercent ?? 101) - (right.accuracyPercent ?? 101)
    || (left.key < right.key ? -1 : 1));

const mergeBuckets = (target, source) => {
  Object.entries(source || {}).forEach(([key, value]) => {
    const entry = target[key] || { questions: 0, completed: 0, attempts: 0, hits: 0 };
    entry.questions += value.questions || 0;
    entry.completed += value.completed || 0;
    entry.attempts += value.attempts || 0;
    entry.hits += value.hits || 0;
    target[key] = entry;
  });
};

/**
 * The teacher's after-game breakdown, from the match result's standings
 * (each carries its questionSetSummary). Never a verdict on a student: counts
 * and percentages only.
 */
export const buildRushReport = (matchResult = {}) => {
  const standings = Array.isArray(matchResult.standings) ? matchResult.standings : [];
  const totals = { questions: 0, completed: 0, skipped: 0, attempts: 0, hits: 0, dnePresses: 0, dneCorrect: 0 };
  const byFeature = {};
  const byFamily = {};
  const players = standings.map((standing) => {
    const summary = standing.questionSetSummary || {};
    Object.keys(totals).forEach((key) => { totals[key] += Number(summary[key]) || 0; });
    mergeBuckets(byFeature, summary.byFeature);
    mergeBuckets(byFamily, summary.byFamily);
    return {
      studentId: standing.studentId || null,
      alias: String(standing.alias || 'Player'),
      joined: standing.joined === true,
      rank: standing.rank ?? null,
      score: Number(standing.score) || 0,
      graphsCompleted: Number(summary.completed) || 0,
      skipped: Number(summary.skipped) || 0,
      attempts: Number(summary.attempts) || 0,
      accuracyPercent: percent(Number(summary.hits) || 0, Number(summary.attempts) || 0),
    };
  });
  return Object.freeze({
    graphsCompleted: totals.completed,
    graphsAttempted: totals.questions,
    skipped: totals.skipped,
    attempts: totals.attempts,
    accuracyPercent: percent(totals.hits, totals.attempts),
    doesNotExist: { presses: totals.dnePresses, correct: totals.dneCorrect, accuracyPercent: percent(totals.dneCorrect, totals.dnePresses) },
    byFeature: breakdown(byFeature, (key) => getGraphFeature(key)?.shortLabel || key),
    byFamily: breakdown(byFamily, (key) => getGraphFamily(key)?.label || key),
    players,
  });
};

/** The configured round seconds a room plays, for its round openings. */
export const rushRoundSeconds = (room = {}, limits) => {
  const seconds = Math.round(Number(room.roundSeconds) || limits.defaultSeconds);
  return Math.max(limits.minSeconds, Math.min(limits.maxSeconds, seconds));
};

/** Round-clamped tolerance as the server applies it (exported for the device). */
export { clampTolerance };
