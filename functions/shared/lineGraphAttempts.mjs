/*
 * GRAPH THE LINE: ATTEMPTS, PROGRESS AND RESULTS.
 *
 * The game is a Live Challenge mode, so everything a mode must not own — the
 * lifecycle, the authoritative clock, receipts and idempotency, ranking,
 * round and match results, rewards — is the engine's. This module is the
 * mode's own arithmetic, kept pure so every rule is tested without a
 * database (Graph Feature Rush keeps the same split: graphFeatureRush.mjs):
 *
 *   applyLineGraphAttempts  the body of the submit transaction: a batch of
 *                           drawn lines, tapped options, typed equations and
 *                           skips, graded in order against the server's own
 *                           regenerated items and written as targetAttempt
 *                           receipts
 *   lineRoundState          where a student stands in a round (which item,
 *                           how many of its tries are used), from receipts
 *   lineGraphPlayerTotals   the player numbers a set of receipts implies
 *   buildLineGraphReport    the teacher's after-game breakdown
 *
 * ONE ITEM AT A TIME. A student's items are a sequence; an attempt is
 * accepted only for the CURRENT item (the first neither completed nor ended).
 * A late attempt for a finished item is `resolved` and recorded nowhere; one
 * for a later item is `outOfOrder` and the device resynchronizes. An item
 * completes exactly once, however attempts race, retry or replay.
 *
 * WHAT IS RECORDED. A right answer completes its item. A wrong one is a miss
 * with the mistake it showed (lineGraphFeedback.mjs). The miss that uses the
 * LAST try is recorded as the item's end (`forfeit`, `revealed`) — one
 * receipt, not a miss plus a separate skip, so a one-try game's accuracy
 * counts each wrong line once (the rush records its eighth-miss skip
 * separately; at eight misses that is noise, at one it would halve a
 * student's accuracy). Not recorded, neither credit nor penalty: the same
 * wrong answer as the attempt before it (`repeated`), the right line drawn
 * past the key points when the method is required (`method`), and boxes that
 * do not yet spell an equation (`form`).
 *
 * Pure: Cloud Functions, the student device and tests.
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
import { DIAGNOSIS_LABELS } from './lineGraphFeedback.mjs';
import { checkChoiceAnswer, checkEquationAnswer, checkLineAnswer, normalizeEquationFields } from './lineGraphGrading.mjs';
import {
  LINE_ANSWER_STYLE,
  LINE_ATTEMPT_KIND,
  LINE_FORM_LABELS,
  LINE_ITEM_TYPE,
  LINE_LIMITS,
  LINE_VERDICT,
  missesAllowed,
} from './lineGraphRules.mjs';

// Every item has one target: its line. A right answer finds it.
const ITEM_SPEC = Object.freeze({ completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount: 1 });
export const LINE_TARGET_ID = 'line';
const MISS_TARGET_ID = 'miss';
const SKIP_TARGET_ID = 'skip';

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

const finiteOr = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clampPool = (poolSize) => Math.max(1, integerOr(poolSize, 1));

/* ------------------------------ round state ------------------------------ */

const roundReceiptsOf = (receipts, roundIndex) => Object.entries(receipts || {})
  .filter(([, receipt]) => isAttemptReceipt(receipt)
    && receiptKindOf(receipt) === RECEIPT_KIND.TARGET
    && integerOr(receipt.roundIndex, null) === roundIndex);

const itemProgress = (receipts, roundIndex, questionIndex) => questionProgress({
  receipts,
  roundIndex,
  questionIndex,
  spec: { ...ITEM_SPEC, questionIndex },
});

/**
 * Where a student stands in a round. `cursor` is the item they are on: the
 * first neither completed nor ended. `cursorMisses` is how many of its tries
 * are used — what a device restores after a refresh.
 */
export const lineRoundState = ({ receipts = {}, roundIndex, poolSize } = {}) => {
  const round = integerOr(roundIndex, -1);
  const pool = clampPool(poolSize);
  let cursor = 0;
  let current = null;
  while (cursor < pool) {
    current = itemProgress(receipts, round, cursor);
    if (!current.completed) break;
    cursor += 1;
  }
  // Only an item with attempts can count toward anything, and every one of
  // them sits at or below the highest index attempted.
  const indexes = roundReceiptsOf(receipts, round).map(([, receipt]) => integerOr(receipt.questionIndex, 0));
  const attempted = indexes.length ? Math.max(...indexes) + 1 : 1;
  const specs = Array.from({ length: Math.max(1, Math.min(pool, attempted)) }, (_, questionIndex) => ({ ...ITEM_SPEC, questionIndex }));
  const summary = summarizeRoundProgress({ receipts, roundIndex: round, questionSpecs: specs });
  const open = cursor < pool && current;
  return Object.freeze({
    roundIndex: round,
    poolSize: pool,
    cursor,
    finished: cursor >= pool,
    cursorAttempts: open ? current.attempts : 0,
    cursorMisses: open ? current.incorrectAttempts : 0,
    questionsCorrect: summary.questionsCorrect,
    ended: summary.questions.filter((question) => question.completed && !question.completedCorrectly).length,
    attempts: summary.attempts,
    hits: summary.correctAttempts,
    accuracy: summary.accuracy,
    scoreTotal: summary.scoreTotal,
  });
};

/* -------------------------------- attempts ------------------------------- */

// A device's attempt ids: a UUID (36 characters), or anything else in the
// same alphabet up to 40 — the engine keeps `~` and `:` for receipts the
// server records itself. Shorter than the engine's 100 because the id is
// stored twice per receipt and the receipts share one document.
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const CHOICE_ID_PATTERN = /^[a-d]$/;
const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,3}$/;

const finitePoint = (point) => {
  const x = finiteOr(point?.x);
  const y = finiteOr(point?.y);
  return x === null || y === null ? null : Object.freeze({ x, y });
};

/** A client attempt, shape-checked. Returns null for anything malformed. */
export const normalizeLineGraphAttempt = (raw = {}) => {
  const attemptId = String(raw?.attemptId || '').trim();
  if (!ATTEMPT_ID_PATTERN.test(attemptId)) return null;
  const questionIndex = integerOr(raw?.questionIndex, null);
  if (questionIndex === null || questionIndex < 0) return null;
  const kind = Object.values(LINE_ATTEMPT_KIND).includes(raw?.kind) ? raw.kind : null;
  if (!kind) return null;
  const base = { attemptId, questionIndex, kind, clientElapsedMs: finiteOr(raw?.clientElapsedMs) };
  if (kind === LINE_ATTEMPT_KIND.LINE) {
    const points = Array.isArray(raw?.points) && raw.points.length === 2 ? raw.points.map(finitePoint) : null;
    if (!points || points.some((point) => !point)) return null;
    return Object.freeze({ ...base, points: Object.freeze(points) });
  }
  if (kind === LINE_ATTEMPT_KIND.CHOICE) {
    const choice = String(raw?.choice ?? '').trim();
    return CHOICE_ID_PATTERN.test(choice) ? Object.freeze({ ...base, choice }) : null;
  }
  if (kind === LINE_ATTEMPT_KIND.EQUATION) {
    const source = raw?.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields) ? raw.fields : null;
    if (!source) return null;
    const fields = Object.fromEntries(Object.entries(source)
      .filter(([id]) => FIELD_ID_PATTERN.test(id))
      .slice(0, 4)
      .map(([id, value]) => [id, String(value ?? '').slice(0, LINE_LIMITS.fieldLength)]));
    return Object.freeze({ ...base, fields: Object.freeze(fields) });
  }
  return Object.freeze(base);
};

/** The verdict a recorded receipt stands for (a replayed attempt reports it again). */
export const verdictOfLineReceipt = (receipt = {}) => {
  if (receipt.isCorrect === true && receipt.forfeit !== true) return LINE_VERDICT.CORRECT;
  return receipt.attemptKind === LINE_ATTEMPT_KIND.SKIP ? LINE_VERDICT.SKIPPED : LINE_VERDICT.INCORRECT;
};

const verdictRow = (attempt, verdict, extra = {}) => Object.freeze({
  attemptId: attempt?.attemptId ?? null,
  questionIndex: attempt?.questionIndex ?? null,
  verdict,
  completesQuestion: false,
  revealed: false,
  diagnosis: null,
  ...extra,
});

// The kind of attempt each way of answering takes.
const KIND_FOR_STYLE = Object.freeze({
  [LINE_ANSWER_STYLE.GRAPH]: LINE_ATTEMPT_KIND.LINE,
  [LINE_ANSWER_STYLE.CHOICE]: LINE_ATTEMPT_KIND.CHOICE,
  [LINE_ANSWER_STYLE.BUILD]: LINE_ATTEMPT_KIND.EQUATION,
});

const checkAttempt = (attempt, question, config) => {
  if (KIND_FOR_STYLE[question.answerStyle] !== attempt.kind) return null;
  if (attempt.kind === LINE_ATTEMPT_KIND.LINE) return checkLineAnswer({ question, points: attempt.points, showMethod: config?.showMethod === true });
  if (attempt.kind === LINE_ATTEMPT_KIND.CHOICE) return checkChoiceAnswer({ question, choiceId: attempt.choice });
  return checkEquationAnswer({ question, fields: attempt.fields });
};

// What an attempt answered, kept on its receipt for later analysis: the two
// points, the option, or the boxes. Bounded by normalization.
const answerFields = (attempt, question) => {
  if (attempt.kind === LINE_ATTEMPT_KIND.LINE) return { points: attempt.points.flatMap((point) => [point.x, point.y]) };
  if (attempt.kind === LINE_ATTEMPT_KIND.CHOICE) return { choice: attempt.choice };
  if (attempt.kind === LINE_ATTEMPT_KIND.EQUATION) return { fields: normalizeEquationFields(question.build?.form, attempt.fields) };
  return {};
};

// The answer of the most recent recorded attempt on an item.
const lastAnswerKey = (receipts, roundIndex, questionIndex) => {
  const last = roundReceiptsOf(receipts, roundIndex)
    .map(([, receipt]) => receipt)
    .filter((receipt) => integerOr(receipt.questionIndex, 0) === questionIndex)
    .sort((left, right) => integerOr(right.sequence, 0) - integerOr(left.sequence, 0))[0];
  return last?.answerKey || null;
};

/**
 * Grade a batch of attempts against the student's regenerated items and
 * produce the receipts to write. Pure: the submit transaction calls it with
 * the player exactly as it read them, and writes what it returns.
 *
 * @param {object}   input
 * @param {object}   input.player            private player record
 * @param {number}   input.roundIndex
 * @param {number}   input.roundVersion
 * @param {Array}    input.attempts          raw attempts, in the order made
 * @param {Function} input.questionFor       (questionIndex) => issued item
 * @param {object}   input.config            the room's normalized settings (tries, method)
 * @param {number}   input.arrivedAtMs       server arrival time of the request
 * @param {number}   input.arrivalElapsedMs  server-observed elapsed round time
 * @param {number}   input.roundDurationMs
 * @param {object}   input.strategy          the room's scoring strategy
 * @param {number}   input.poolSize          the round's items (lineRoundQuestionCount)
 */
export const applyLineGraphAttempts = ({
  player = {},
  roundIndex,
  roundVersion = 0,
  attempts = [],
  questionFor,
  config = {},
  arrivedAtMs = 0,
  arrivalElapsedMs = 0,
  roundDurationMs = 60_000,
  strategy,
  poolSize = 1,
} = {}) => {
  const round = integerOr(roundIndex, -1);
  const pool = clampPool(poolSize);
  const receipts = { ...player.submissionReceipts };
  let sequence = Math.max(0, integerOr(player.attemptSequence, 0));
  let elapsedFloor = roundReceiptsOf(receipts, round)
    .reduce((latest, [, receipt]) => Math.max(latest, finiteOr(receipt.elapsedMs, 0)), 0);
  const ceiling = Math.max(0, Math.min(finiteOr(arrivalElapsedMs, 0), finiteOr(roundDurationMs, 0)));
  const questionCache = new Map();
  const questionOf = (index) => {
    if (!questionCache.has(index)) questionCache.set(index, (typeof questionFor === 'function' ? questionFor(index) : null) || null);
    return questionCache.get(index);
  };
  let roundRecorded = roundReceiptsOf(receipts, round).length;
  let matchRecorded = Object.values(receipts).filter((receipt) => isAttemptReceipt(receipt) && receiptKindOf(receipt) === RECEIPT_KIND.TARGET).length;
  const verdicts = [];
  let recorded = 0;
  let completed = 0;

  (Array.isArray(attempts) ? attempts : []).slice(0, LINE_LIMITS.batch).forEach((raw) => {
    const attempt = normalizeLineGraphAttempt(raw);
    if (!attempt) {
      verdicts.push(verdictRow({ attemptId: raw?.attemptId ? String(raw.attemptId).slice(0, 100) : null }, LINE_VERDICT.INVALID));
      return;
    }
    const prior = receipts[attempt.attemptId];
    if (prior) {
      verdicts.push(verdictRow(attempt, verdictOfLineReceipt(prior), {
        replay: true,
        completesQuestion: prior.completesQuestion === true,
        revealed: prior.revealed === true,
        diagnosis: prior.diagnosis || null,
      }));
      return;
    }
    if (attempt.questionIndex >= pool) {
      verdicts.push(verdictRow(attempt, LINE_VERDICT.INVALID));
      return;
    }
    const state = lineRoundState({ receipts, roundIndex: round, poolSize: pool });
    if (attempt.questionIndex < state.cursor) {
      verdicts.push(verdictRow(attempt, LINE_VERDICT.RESOLVED));
      return;
    }
    if (attempt.questionIndex > state.cursor) {
      verdicts.push(verdictRow(attempt, LINE_VERDICT.OUT_OF_ORDER));
      return;
    }
    if (state.cursorAttempts >= LINE_LIMITS.perQuestion || roundRecorded >= LINE_LIMITS.perRound || matchRecorded >= LINE_LIMITS.perMatch) {
      verdicts.push(verdictRow(attempt, LINE_VERDICT.LIMIT));
      return;
    }
    const question = questionOf(attempt.questionIndex);
    if (!question) {
      verdicts.push(verdictRow(attempt, LINE_VERDICT.INVALID));
      return;
    }

    const skip = attempt.kind === LINE_ATTEMPT_KIND.SKIP;
    let check = null;
    if (!skip) {
      check = checkAttempt(attempt, question, config);
      if (!check || check.verdict === LINE_VERDICT.INVALID) {
        verdicts.push(verdictRow(attempt, LINE_VERDICT.INVALID));
        return;
      }
      // Neither credit nor a miss: the device shows what to fix.
      if (check.verdict === LINE_VERDICT.METHOD || check.verdict === LINE_VERDICT.FORM) {
        verdicts.push(verdictRow(attempt, check.verdict));
        return;
      }
      if (check.verdict === LINE_VERDICT.INCORRECT && check.answerKey && check.answerKey === lastAnswerKey(receipts, round, attempt.questionIndex)) {
        verdicts.push(verdictRow(attempt, LINE_VERDICT.REPEATED, { diagnosis: check.diagnosis }));
        return;
      }
    }
    const isCorrect = !skip && check.verdict === LINE_VERDICT.CORRECT;
    const targetId = skip ? SKIP_TARGET_ID : (isCorrect ? LINE_TARGET_ID : MISS_TARGET_ID);

    // The engine's own attempt rule has the last word (a completed item), so
    // this mode cannot drift from the contract.
    const plan = planAttempt({
      receipts,
      roundIndex: round,
      questionIndex: attempt.questionIndex,
      spec: ITEM_SPEC,
      attemptId: attempt.attemptId,
      targetId,
    });
    if (plan.decision !== ATTEMPT_DECISION.ACCEPT) {
      verdicts.push(verdictRow(attempt, LINE_VERDICT.RESOLVED));
      return;
    }

    // THE LAST ALLOWED MISS ENDS THE ITEM, decided here and not only on the
    // device: the rule holds for a device that never shows the answer, and a
    // student who refreshes after that miss resumes on the next item.
    const missesSoFar = plan.progress.incorrectAttempts;
    const allowed = missesAllowed({ triesPerItem: config?.triesPerItem, answerStyle: question.answerStyle });
    const revealed = !isCorrect && !skip && missesSoFar + 1 >= allowed;
    const claimed = finiteOr(attempt.clientElapsedMs, ceiling);
    // Server-observed bounds: never after arrival, never before the previous
    // attempt, never earlier than the claim window allows.
    const elapsedMs = Math.round(Math.min(ceiling, Math.max(elapsedFloor, ceiling - LINE_LIMITS.claimWindowMs, claimed)));
    elapsedFloor = elapsedMs;
    const score = strategy?.scoreTargetAttempt
      ? strategy.scoreTargetAttempt({ completesQuestion: isCorrect, isCorrect })
      : { pointsAwarded: isCorrect ? 1 : 0 };
    sequence += 1;
    receipts[attempt.attemptId] = {
      receiptKind: RECEIPT_KIND.TARGET,
      submissionId: attempt.attemptId,
      roundIndex: round,
      roundVersion: integerOr(roundVersion, 0),
      questionIndex: attempt.questionIndex,
      targetCount: 1,
      // How many items this round holds — a Sprint's length is the room's,
      // and the engine reads it back from here (questionSpecsFromReceipts).
      roundQuestionCount: pool,
      // What was asked, for the teacher's report.
      tier: question.tier,
      reportTags: { form: question.form, itemType: question.itemType, variant: question.variant },
      attemptKind: attempt.kind,
      targetId,
      isCorrect,
      ...(skip || revealed ? { forfeit: true } : {}),
      ...(revealed ? { revealed: true } : {}),
      completesQuestion: isCorrect,
      // Only a miss keeps its answer key: it is what makes the same wrong
      // answer again `repeated` rather than a second miss.
      ...(check && !isCorrect && check.answerKey ? { answerKey: check.answerKey } : {}),
      ...(check && !isCorrect && check.diagnosis ? { diagnosis: check.diagnosis } : {}),
      ...answerFields(attempt, question),
      pointsAwarded: Math.max(0, Math.round(Number(score?.pointsAwarded) || 0)),
      sequence,
      arrivedAtMs: finiteOr(arrivedAtMs, 0),
      elapsedMs,
      serverConfirmed: true,
    };
    recorded += 1;
    roundRecorded += 1;
    matchRecorded += 1;
    if (isCorrect) completed += 1;
    let verdict = LINE_VERDICT.INCORRECT;
    if (isCorrect) verdict = LINE_VERDICT.CORRECT;
    else if (skip) verdict = LINE_VERDICT.SKIPPED;
    verdicts.push(verdictRow(attempt, verdict, {
      completesQuestion: isCorrect,
      revealed,
      diagnosis: isCorrect || skip ? null : check.diagnosis || null,
    }));
  });

  return Object.freeze({
    receipts,
    verdicts: Object.freeze(verdicts),
    recorded,
    completed,
    attemptSequence: sequence,
    state: lineRoundState({ receipts, roundIndex: round, poolSize: pool }),
    totals: lineGraphPlayerTotals({ player, receipts, strategy }),
  });
};

/**
 * The player-level numbers a set of receipts implies: the match score, the
 * raw work total, items completed, rounds taken part in and accuracy. The
 * rush's rule (graphFeatureRush.rushPlayerTotals) over the same receipts;
 * kept here so neither mode's bundle carries the other's.
 */
export const lineGraphPlayerTotals = ({ player = {}, receipts = {}, strategy } = {}) => {
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

/* --------------------------------- report -------------------------------- */

const percent = (numerator, denominator) => (denominator > 0 ? Math.round((numerator / denominator) * 100) : null);

const ITEM_TYPE_LABELS = Object.freeze({ [LINE_ITEM_TYPE.GRAPH]: 'Graph it', [LINE_ITEM_TYPE.NAME]: 'Name it' });
const TIER_LABELS = Object.freeze({ easy: 'Easy', standard: 'Standard', challenge: 'Challenge' });

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

const breakdown = (rows, labels) => Object.entries(rows || {})
  .map(([key, value]) => ({
    key,
    label: labels[key] || key,
    items: value.questions,
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

const mistakeRows = (counts) => Object.entries(counts || {})
  .map(([code, count]) => ({ code, label: DIAGNOSIS_LABELS[code] || code, count }))
  .sort((left, right) => right.count - left.count || (left.code < right.code ? -1 : 1));

/**
 * The teacher's after-game breakdown, from the match result's standings
 * (each carries its questionSetSummary). Counts and percentages only, and
 * mistakes as the hints named them: a specific one only where the line could
 * have come from nothing else.
 */
export const buildLineGraphReport = (matchResult = {}) => {
  const standings = Array.isArray(matchResult.standings) ? matchResult.standings : [];
  const totals = { questions: 0, completed: 0, skipped: 0, attempts: 0, hits: 0 };
  const byForm = {};
  const byItemType = {};
  const byTier = {};
  const mistakes = {};
  const players = standings.map((standing) => {
    const summary = standing.questionSetSummary || {};
    Object.keys(totals).forEach((key) => { totals[key] += Number(summary[key]) || 0; });
    mergeBuckets(byForm, summary.byTag?.form);
    mergeBuckets(byItemType, summary.byTag?.itemType);
    mergeBuckets(byTier, summary.byTier);
    Object.entries(summary.mistakes || {}).forEach(([code, count]) => { mistakes[code] = (mistakes[code] || 0) + (Number(count) || 0); });
    const [topMistake] = mistakeRows(summary.mistakes);
    return {
      studentId: standing.studentId || null,
      alias: String(standing.alias || 'Player'),
      joined: standing.joined === true,
      rank: standing.rank ?? null,
      score: Number(standing.score) || 0,
      itemsCompleted: Number(summary.completed) || 0,
      itemsEnded: Number(summary.skipped) || 0,
      attempts: Number(summary.attempts) || 0,
      accuracyPercent: percent(Number(summary.hits) || 0, Number(summary.attempts) || 0),
      topMistake: topMistake ? topMistake.label : null,
    };
  });
  return Object.freeze({
    itemsCompleted: totals.completed,
    itemsAttempted: totals.questions,
    itemsEnded: totals.skipped,
    attempts: totals.attempts,
    accuracyPercent: percent(totals.hits, totals.attempts),
    byForm: breakdown(byForm, LINE_FORM_LABELS),
    byItemType: breakdown(byItemType, ITEM_TYPE_LABELS),
    byTier: breakdown(byTier, TIER_LABELS),
    mistakes: mistakeRows(mistakes),
    players,
  });
};
