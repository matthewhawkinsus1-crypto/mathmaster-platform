/*
 * QUESTIONS, ATTEMPTS AND COMPLETION.
 *
 * Four things that were one thing in the first Live Challenge, and must not be:
 *
 *   QUESTION SPEC   what a round asks for: how many questions, how many correct
 *                   TARGETS each needs, and the rule that completes it
 *   ATTEMPT         one graded interaction — a submitted answer, one graph
 *                   click — recorded as a server receipt with its own id
 *   COMPLETION      whether a question is done, derived from its attempts by
 *                   the spec's rule, never stored as a separate flag
 *   SCORE           points, decided by the scoring strategy, not here
 *
 * "Find all the zeros" with three zeros is three targets. A student may click
 * right, wrong, right, right: four attempts, one completed question. A classic
 * round is the degenerate case — one question, one target, completed by the
 * first graded response whether it was right or not (the one-answer rule).
 *
 * THE RECEIPT LOG IS THE SOURCE OF TRUTH. Every accepted attempt is already
 * written to the private player's `submissionReceipts`, keyed by its attempt
 * id, inside the transaction that scores it. That key is what makes a retried
 * submission a replay instead of a second attempt. Everything here is a pure
 * reading of that log, so completion cannot drift from what was recorded.
 *
 * Score-only receipts (Solver Race productive-speed milestones) live in the
 * same log. They carry points but are not attempts, and nothing here counts
 * them as one — the earlier achievement code did, which is how a Solver Race
 * student who answered every round correctly could be denied Strong Accuracy.
 *
 * A FORFEIT is an attempt that gives a question up — a Graph Feature Rush
 * student skipping a graph they cannot finish. It counts as an incorrect
 * attempt, ends the question without completing it correctly, and keeps the
 * partial credit already earned (targets found before the skip still count).
 *
 * PER-PLAYER QUESTIONS. When every player is issued their own questions, the
 * number of targets in question k differs from player to player. Each target
 * attempt records `targetCount`, so the log alone says what every attempted
 * question needed (`questionSpecsFromReceipts`); nothing else has to be kept.
 */

export const RECEIPT_KIND = Object.freeze({
  RESPONSE: 'response',
  TARGET: 'targetAttempt',
  MILESTONE: 'productiveSpeedMilestone',
});

export const COMPLETION_RULE = Object.freeze({
  // The first graded response completes the question, right or wrong.
  SINGLE_RESPONSE: 'singleResponse',
  // Keep answering until correct; the first correct response completes it.
  CORRECT_RESPONSE: 'correctResponse',
  // Every target must be found; wrong attempts count but do not complete it.
  ALL_TARGETS: 'allTargets',
});

export const ATTEMPT_DECISION = Object.freeze({
  ACCEPT: 'accept',
  REPLAY: 'replay',
  REJECT: 'reject',
});

export const ATTEMPT_REJECTION = Object.freeze({
  QUESTION_COMPLETED: 'question_completed',
  DUPLICATE_TARGET: 'duplicate_target',
  TARGET_REQUIRED: 'target_required',
  UNKNOWN_QUESTION: 'unknown_question',
});

export const MAX_TARGETS_PER_QUESTION = 20;
// The most questions one round can hold. A per-player question set (Graph
// Feature Rush) needs room for a fast student's whole round — 150 graphs in a
// two-minute round is faster than anyone reads a graph — and a classic round
// is one question, so the cap only ever bounds work.
export const MAX_QUESTIONS_PER_ROUND = 150;

/*
 * EXACT SCORE UNITS. A round's score total adds fractions — two of three zeros
 * found is 2/3 — and floating-point sums of thirds and halves come out a hair
 * apart depending on order, which would break a genuine tie by rounding
 * noise. Scores are therefore also kept as whole units of 1/SCORE_UNIT, the
 * least common multiple of every possible target count (1..20), so equal work
 * is equal to the last bit.
 */
export const SCORE_UNIT = 232792560;

const COMPLETION_RULES = new Set(Object.values(COMPLETION_RULE));

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

export const DEFAULT_QUESTION_SPEC = Object.freeze({
  questionIndex: 0,
  targetCount: 1,
  completionRule: COMPLETION_RULE.SINGLE_RESPONSE,
});

export const normalizeQuestionSpec = (raw = {}, questionIndex = 0) => {
  const rule = COMPLETION_RULES.has(raw?.completionRule) ? raw.completionRule : COMPLETION_RULE.SINGLE_RESPONSE;
  const targets = Math.min(MAX_TARGETS_PER_QUESTION, Math.max(1, integerOr(raw?.targetCount, 1)));
  return Object.freeze({
    questionIndex: Math.max(0, integerOr(raw?.questionIndex, questionIndex)),
    // A single-response question has exactly one target by definition.
    targetCount: rule === COMPLETION_RULE.ALL_TARGETS ? targets : 1,
    completionRule: rule,
  });
};

/** The specs for one round. A classic round is one default question. */
export const normalizeRoundQuestionSpecs = (specs) => {
  const list = Array.isArray(specs) && specs.length ? specs.slice(0, MAX_QUESTIONS_PER_ROUND) : [DEFAULT_QUESTION_SPEC];
  return Object.freeze(list.map((spec, index) => normalizeQuestionSpec(spec, index)));
};

export const receiptKindOf = (receipt) => {
  const kind = receipt?.receiptKind;
  if (kind === RECEIPT_KIND.MILESTONE || kind === RECEIPT_KIND.TARGET) return kind;
  // Every receipt written before this field existed was a graded response.
  return RECEIPT_KIND.RESPONSE;
};

export const isAttemptReceipt = (receipt) => receipt?.serverConfirmed === true
  && receiptKindOf(receipt) !== RECEIPT_KIND.MILESTONE;

const receiptList = (receipts) => {
  if (!receipts) return [];
  if (Array.isArray(receipts)) return receipts.filter(Boolean).map((receipt, index) => [receipt?.submissionId || String(index), receipt]);
  return Object.entries(receipts).filter(([, receipt]) => Boolean(receipt));
};

/*
 * Attempts in a deterministic order: the per-player sequence the server
 * assigns, then server arrival, then id. Firestore does not preserve map key
 * order, so insertion order is never relied on.
 */
const compareAttempts = ([leftId, left], [rightId, right]) => {
  const leftSequence = integerOr(left?.sequence, Number.MAX_SAFE_INTEGER);
  const rightSequence = integerOr(right?.sequence, Number.MAX_SAFE_INTEGER);
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  const leftArrival = Number(left?.arrivedAtMs) || Number.MAX_SAFE_INTEGER;
  const rightArrival = Number(right?.arrivedAtMs) || Number.MAX_SAFE_INTEGER;
  if (leftArrival !== rightArrival) return leftArrival - rightArrival;
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};

/** Every confirmed attempt for one question, oldest first. */
export const questionAttempts = ({ receipts, roundIndex, questionIndex = 0 } = {}) => receiptList(receipts)
  .filter(([, receipt]) => isAttemptReceipt(receipt)
    && integerOr(receipt.roundIndex, null) === integerOr(roundIndex, NaN)
    && integerOr(receipt.questionIndex, 0) === integerOr(questionIndex, 0))
  .sort(compareAttempts)
  .map(([id, receipt]) => ({ attemptId: id, ...receipt }));

const scoreFractionOf = (receipt) => {
  if (Number.isFinite(Number(receipt?.scoreFraction))) return Math.max(0, Math.min(1, Number(receipt.scoreFraction)));
  if (Number.isFinite(Number(receipt?.scorePercent))) return Math.max(0, Math.min(1, Number(receipt.scorePercent) / 100));
  return receipt?.isCorrect === true ? 1 : 0;
};

const elapsedOf = (receipt) => {
  const elapsed = Number(receipt?.elapsedMs);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
};

/**
 * Where one question stands for one player, read from their attempts.
 */
export const questionProgress = ({ receipts, roundIndex, questionIndex = 0, spec = DEFAULT_QUESTION_SPEC } = {}) => {
  const normalized = normalizeQuestionSpec(spec, questionIndex);
  const attempts = questionAttempts({ receipts, roundIndex, questionIndex: normalized.questionIndex });
  let correctAttempts = 0;
  let incorrectAttempts = 0;
  const targetsFound = [];
  let completed = false;
  let completedCorrectly = false;
  let scoreFraction = 0;
  let scoreUnits = 0;
  let completedAtElapsedMs = null;
  let completingAttemptId = null;

  for (const attempt of attempts) {
    if (completed) break;
    const correct = attempt.isCorrect === true && attempt.forfeit !== true;
    if (correct) correctAttempts += 1;
    else incorrectAttempts += 1;

    if (normalized.completionRule === COMPLETION_RULE.SINGLE_RESPONSE) {
      completed = true;
      completedCorrectly = correct;
      scoreFraction = scoreFractionOf(attempt);
      scoreUnits = Math.round(scoreFraction * SCORE_UNIT);
    } else if (attempt.forfeit === true) {
      // Given up: done, not correct, partial credit kept.
      completed = true;
      completedCorrectly = false;
    } else if (normalized.completionRule === COMPLETION_RULE.CORRECT_RESPONSE) {
      scoreFraction = Math.max(scoreFraction, scoreFractionOf(attempt));
      if (correct) {
        completed = true;
        completedCorrectly = true;
        scoreFraction = 1;
      }
      scoreUnits = Math.round(scoreFraction * SCORE_UNIT);
    } else if (correct && attempt.targetId != null) {
      const target = String(attempt.targetId);
      if (!targetsFound.includes(target)) targetsFound.push(target);
      scoreFraction = targetsFound.length / normalized.targetCount;
      // Exact: every target count divides SCORE_UNIT.
      scoreUnits = targetsFound.length * (SCORE_UNIT / normalized.targetCount);
      if (targetsFound.length >= normalized.targetCount) {
        completed = true;
        completedCorrectly = true;
      }
    }
    if (completed) {
      completedAtElapsedMs = elapsedOf(attempt);
      completingAttemptId = attempt.attemptId;
    }
  }

  return Object.freeze({
    questionIndex: normalized.questionIndex,
    attempts: attempts.length,
    correctAttempts,
    incorrectAttempts,
    targetsFound: Object.freeze(targetsFound),
    completed,
    completedCorrectly,
    scoreFraction,
    scoreUnits,
    completedAtElapsedMs,
    completingAttemptId,
  });
};

/**
 * Should the server accept a new attempt? Called inside the scoring
 * transaction with the player's receipts as that transaction read them.
 *
 * A known attempt id is a REPLAY (return the original receipt, change nothing).
 * A completed question rejects further attempts — for a classic round this is
 * exactly "you already answered this round". An already-found target is
 * rejected without being recorded, so clicking a found zero again is neither
 * credit nor a penalty.
 */
export const planAttempt = ({
  receipts,
  roundIndex,
  questionIndex = 0,
  spec = DEFAULT_QUESTION_SPEC,
  attemptId,
  targetId = null,
} = {}) => {
  const id = String(attemptId || '').trim();
  const prior = id && receipts && !Array.isArray(receipts) ? receipts[id] : null;
  if (prior) return Object.freeze({ decision: ATTEMPT_DECISION.REPLAY, receipt: prior });

  const normalized = normalizeQuestionSpec(spec, questionIndex);
  const progress = questionProgress({ receipts, roundIndex, questionIndex: normalized.questionIndex, spec: normalized });
  if (progress.completed) {
    return Object.freeze({ decision: ATTEMPT_DECISION.REJECT, reason: ATTEMPT_REJECTION.QUESTION_COMPLETED, progress });
  }
  if (normalized.completionRule === COMPLETION_RULE.ALL_TARGETS) {
    if (targetId == null || String(targetId).trim() === '') {
      return Object.freeze({ decision: ATTEMPT_DECISION.REJECT, reason: ATTEMPT_REJECTION.TARGET_REQUIRED, progress });
    }
    if (progress.targetsFound.includes(String(targetId))) {
      return Object.freeze({ decision: ATTEMPT_DECISION.REJECT, reason: ATTEMPT_REJECTION.DUPLICATE_TARGET, progress });
    }
  }
  return Object.freeze({ decision: ATTEMPT_DECISION.ACCEPT, progress });
};

/**
 * The specs of a round whose questions are issued per player: `poolSize`
 * questions, each with the target count its attempts recorded. A question
 * nobody has attempted yet keeps a placeholder count — it is incomplete
 * whatever its count, so the placeholder can never change a result.
 */
export const questionSpecsFromReceipts = ({
  receipts,
  roundIndex,
  poolSize = MAX_QUESTIONS_PER_ROUND,
  completionRule = COMPLETION_RULE.ALL_TARGETS,
} = {}) => {
  const size = Math.max(1, Math.min(MAX_QUESTIONS_PER_ROUND, integerOr(poolSize, MAX_QUESTIONS_PER_ROUND)));
  const counts = new Map();
  receiptList(receipts)
    .filter(([, receipt]) => isAttemptReceipt(receipt) && integerOr(receipt.roundIndex, null) === integerOr(roundIndex, NaN))
    .sort(compareAttempts)
    .forEach(([, receipt]) => {
      const index = integerOr(receipt.questionIndex, 0);
      if (!counts.has(index)) counts.set(index, integerOr(receipt.targetCount, 1));
    });
  return normalizeRoundQuestionSpecs(Array.from({ length: size }, (_, index) => ({
    questionIndex: index,
    completionRule,
    targetCount: counts.get(index) ?? 1,
  })));
};

/** Points recorded for a round, including score-only receipts such as milestones. */
export const roundPointsFromReceipts = (receipts, roundIndex) => receiptList(receipts)
  .filter(([, receipt]) => receipt?.serverConfirmed === true
    && integerOr(receipt.roundIndex, null) === integerOr(roundIndex, NaN))
  .reduce((sum, [, receipt]) => sum + Math.max(0, Math.round(Number(receipt?.pointsAwarded) || 0)), 0);

/**
 * One player's performance across a whole round — the input to round ranking.
 * `finished` means every question in the round is complete, which is what
 * lets a round close early once everyone is done.
 */
export const summarizeRoundProgress = ({ receipts, roundIndex, questionSpecs } = {}) => {
  const specs = normalizeRoundQuestionSpecs(questionSpecs);
  const questions = specs.map((spec) => questionProgress({ receipts, roundIndex, questionIndex: spec.questionIndex, spec }));
  const attempts = questions.reduce((sum, question) => sum + question.attempts, 0);
  const correctAttempts = questions.reduce((sum, question) => sum + question.correctAttempts, 0);
  const completionTimes = questions
    .filter((question) => question.completedCorrectly && question.completedAtElapsedMs != null)
    .map((question) => question.completedAtElapsedMs);
  const scoreUnits = questions.reduce((sum, question) => sum + question.scoreUnits, 0);
  return Object.freeze({
    roundIndex: integerOr(roundIndex, -1),
    questionCount: specs.length,
    questionsCompleted: questions.filter((question) => question.completed).length,
    questionsCorrect: questions.filter((question) => question.completedCorrectly).length,
    attempts,
    correctAttempts,
    incorrectAttempts: attempts - correctAttempts,
    // Exact (see SCORE_UNIT): equal work compares equal whatever the order.
    scoreTotal: scoreUnits / SCORE_UNIT,
    scoreUnits,
    accuracy: attempts > 0 ? correctAttempts / attempts : null,
    lastCorrectCompletionElapsedMs: completionTimes.length ? Math.max(...completionTimes) : null,
    participated: attempts > 0,
    finished: questions.every((question) => question.completed),
    points: roundPointsFromReceipts(receipts, roundIndex),
    questions: Object.freeze(questions),
  });
};

/*
 * A question-set round has no single "answer", so its outcome is how the
 * player's round went: participated, and — the meaning reward rules give
 * "correct" — completed at least one question with at least this accuracy.
 */
export const ACCURATE_ROUND_THRESHOLD = 0.8;

export const questionSetRoundOutcome = (summary) => {
  if (!summary?.participated) return null;
  const accuracy = Number(summary.accuracy) || 0;
  return Object.freeze({
    roundIndex: integerOr(summary.roundIndex, -1),
    isCorrect: summary.questionsCorrect >= 1 && accuracy >= ACCURATE_ROUND_THRESHOLD,
    scorePercent: Math.round(accuracy * 100),
    secondChance: false,
    elapsedMs: summary.lastCorrectCompletionElapsedMs ?? null,
    questionsCorrect: summary.questionsCorrect,
  });
};

/**
 * The graded response a round's first question received, for consumers that
 * reason about classic one-question rounds (evidence, achievements, reports).
 */
export const roundOutcome = ({ receipts, roundIndex }) => {
  const [first] = questionAttempts({ receipts, roundIndex, questionIndex: 0 });
  if (!first) return null;
  return Object.freeze({
    roundIndex: integerOr(roundIndex, -1),
    isCorrect: first.isCorrect === true,
    scorePercent: Math.round(scoreFractionOf(first) * 100),
    secondChance: first.secondChance === true || first.isSecondChance === true,
    elapsedMs: elapsedOf(first),
  });
};
