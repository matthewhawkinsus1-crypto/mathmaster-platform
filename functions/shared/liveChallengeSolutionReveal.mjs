/*
 * THE WORKED SOLUTION BETWEEN ROUNDS.
 *
 * A Live Challenge round used to end with a place and a number of points. The
 * student who just missed the question learned that they missed it, and
 * nothing about the mathematics. This module decides WHEN a round's worked
 * solution may be published, and WHAT is published.
 *
 * THE ONE RULE: a solution is never public while anybody can still answer the
 * question it solves.
 *
 *   - A round's solution is captured privately when the round OPENS (the
 *     server instantiates the question there; the solution is the same draw's)
 *     and published only after the round has CLOSED — the server refuses every
 *     answer from then on.
 *   - SECOND CHANCE replays the questions the class missed most, after the
 *     last scheduled round. A solution published at round 2's close would be
 *     the answer to the replay of round 2. So while a match can still replay
 *     its questions, a scheduled round's solution is HELD until the replay
 *     plan is known (the last scheduled round has closed) and, when any
 *     replay is planned, until the LAST replay has closed. Releasing the
 *     rounds that are not replayed earlier would tell the class, by the ones
 *     left out, which questions are coming back.
 *   - A finished match publishes everything it held (the end-of-game recap).
 *     A cancelled match publishes nothing.
 *
 * The published document names a question, never a student. It carries the
 * prompt text, the standard and the authored solution review (headline,
 * reasoning, common error, answer summary) — the same review My Math Path
 * shows once a question closes (pathSolutionSupport.mjs).
 */

export const SOLUTIONS_COLLECTION = 'solutions';

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const roundKeyInt = (value) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
};

/**
 * The private record of one round's solution, captured when the round opens
 * from the question the server just instantiated. `solutionReview` is the
 * authored review (pathSolutionSupport buildPrivateSupport().solutionReview),
 * or null when the bank question carries none.
 */
export const roundSolutionRecord = ({ question = {}, solutionReview = null, displayStandard = null } = {}) => {
  const review = solutionReview && typeof solutionReview === 'object' ? solutionReview : null;
  const reasoning = list(review?.reasoning).map((entry) => text(entry, 400)).filter(Boolean).slice(0, 8);
  return Object.freeze({
    prompt: text(question?.prompt ?? question?.stem ?? question?.question, 1200) || null,
    teksCode: text(displayStandard, 40) || null,
    solutionReview: review && reasoning.length ? Object.freeze({
      headline: text(review.headline, 160) || null,
      reasoning: Object.freeze(reasoning),
      commonError: text(review.commonError, 400) || null,
      connection: text(review.connection, 400) || null,
      answerSummary: text(review.answerSummary, 240) || null,
    }) : null,
  });
};

/**
 * Which rounds' solutions may be public now.
 *
 * @param {object} input
 * @param {number} input.closedThrough       the highest round index that has closed (-1: none)
 * @param {number} input.scheduledRoundCount rounds in the original schedule (replays come after)
 * @param {boolean} input.secondChancePossible  the room may still replay questions
 *                                           (mode capability AND the teacher's setting)
 * @param {object|null} input.replayOf        { [replayRoundIndex]: originalRoundIndex } for the
 *                                           replays planned so far, or null when the plan is not
 *                                           known yet
 * @param {boolean} [input.finished]         the match finished: everything is public
 * @returns {number[]} ascending round indices
 */
export const revealableRounds = ({
  closedThrough = -1,
  scheduledRoundCount = 0,
  secondChancePossible = false,
  replayOf = null,
  finished = false,
} = {}) => {
  const closed = Number.isInteger(Number(closedThrough)) ? Number(closedThrough) : -1;
  const scheduled = Math.max(0, Math.floor(Number(scheduledRoundCount) || 0));
  const replays = new Map();
  Object.entries(replayOf || {}).forEach(([replayKey, original]) => {
    const replay = roundKeyInt(replayKey);
    const source = roundKeyInt(original);
    if (replay !== null && source !== null) replays.set(replay, source);
  });
  const lastRound = Math.max(closed, scheduled - 1, ...replays.keys());
  const rounds = [];
  for (let round = 0; round <= lastRound; round += 1) {
    if (finished) { rounds.push(round); continue; }
    if (round > closed) continue;
    if (replays.has(round)) { rounds.push(round); continue; }
    if (!secondChancePossible) { rounds.push(round); continue; }
    // A scheduled round while Second Chance may still replay it.
    if (replayOf === null) continue; // the replay plan is not known yet
    // Every scheduled round waits for the last replay, not just the replayed
    // ones: which rounds are held must not say which questions return.
    const lastReplay = replays.size ? Math.max(...replays.keys()) : -1;
    if (lastReplay <= closed) rounds.push(round);
  }
  return rounds;
};

/**
 * Whether a closed round's solution is being held for a Second Chance replay
 * — what a results screen says instead of the solution ("The worked solution
 * is shown after the Second Chance rounds").
 */
export const solutionHeldForReplay = ({ roundIndex, revealed = [] } = {}) => {
  const round = roundKeyInt(roundIndex);
  if (round === null) return false;
  return !list(revealed).map(Number).includes(round);
};

/** The public document for one revealed round. Names a question, never a student. */
export const publicSolutionDocument = ({ roundIndex, record = null, originalRoundIndex = null, revealedAtMs = null } = {}) => {
  const review = record?.solutionReview || null;
  return Object.freeze({
    roundIndex: roundKeyInt(roundIndex),
    originalRoundIndex: roundKeyInt(originalRoundIndex),
    prompt: record?.prompt || null,
    teksCode: record?.teksCode || null,
    available: Boolean(review),
    solutionReview: review,
    revealedAtMs: Number.isFinite(Number(revealedAtMs)) ? Number(revealedAtMs) : null,
  });
};

/** The rounds in `next` that are not yet in `already`, ascending. */
export const newlyRevealedRounds = (next = [], already = []) => {
  const seen = new Set(list(already).map(Number).filter(Number.isInteger));
  return [...new Set(list(next).map(Number).filter(Number.isInteger))]
    .filter((round) => !seen.has(round))
    .sort((a, b) => a - b);
};
