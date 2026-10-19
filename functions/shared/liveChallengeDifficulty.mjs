/*
 * WHAT BELONGS IN A TIMED ROUND.
 *
 * Sampling fixed which questions a game can reach (lib/challengeSampling.js);
 * it did not decide which of them belong under a countdown. A mixed game could
 * serve a DOK-3 modelling question as round 1 under a 45-second timer — a
 * question built to be reasoned through, answered in a race, so the round
 * measures panic instead of mathematics.
 *
 * THE RULE, by the question's Depth of Knowledge (questionMetadata.mjs
 * normalizeQuestionComplexity — the bank's own `dok`):
 *
 *   DOK 1–2 (recall, skill/concept)   any timed round
 *   DOK 3   (strategic thinking)      only when the round gives at least
 *                                     DOK3_MIN_ROUND_SECONDS
 *   DOK 4   (extended thinking)       never in a timed round
 *   no DOK recorded                   any timed round (nothing to judge by)
 *
 * "The round" is the round the question would actually run: the server fits
 * a round's length to its question (liveChallenge.mjs
 * complexityAdjustedRoundSeconds), so a 90-second game can run a one-step
 * bank question in 50 seconds. The filter judges that adjusted length, and
 * the opening clamps a DOK 3 round to DOK3_MIN_ROUND_SECONDS as a backstop
 * (timedRoundSecondsFor) — the promise holds however a question was drawn.
 *
 * A Pace Race round has no countdown to fit, so everything fits.
 *
 * The rule filters the candidates BEFORE the variety-first selection, so a
 * game is never "short" because of it silently: a standard whose questions are
 * all DOK 3 at 45 seconds is refused at create with a message naming the
 * reason and the fix (a longer round or Pace Race).
 */

import { normalizeQuestionComplexity } from './questionMetadata.mjs';

export const DOK3_MIN_ROUND_SECONDS = 90;

/** The question's DOK level (1–4), or null when the bank records none. */
export const questionDok = (question = {}) => normalizeQuestionComplexity(question).level;

/** Whether a question belongs in a round of this length and timing. */
export const fitsTimedRound = (question = {}, { roundSeconds = 0, timingMode = 'timed' } = {}) => {
  if (timingMode === 'pace') return true;
  const dok = questionDok(question);
  if (dok === null || dok <= 2) return true;
  if (dok === 3) return Number(roundSeconds) >= DOK3_MIN_ROUND_SECONDS;
  return false;
};

/**
 * The seconds a round runs for its question: the adjusted length, but never
 * less than DOK3_MIN_ROUND_SECONDS for a DOK 3 or 4 question in a timed round.
 */
export const timedRoundSecondsFor = ({ question = {}, adjustedSeconds = 0, timingMode = 'timed' } = {}) => {
  const seconds = Number(adjustedSeconds) || 0;
  if (timingMode === 'pace') return seconds;
  const dok = questionDok(question);
  return dok !== null && dok >= 3 ? Math.max(seconds, DOK3_MIN_ROUND_SECONDS) : seconds;
};

/** Why a candidate pool emptied, in a teacher's words (null when it did not). */
export const timedRoundShortfallMessage = ({ before = 0, after = 0, needed = 0, roundSeconds = 0 } = {}) => {
  if (after >= needed || before <= after) return null;
  return `Only ${after} of these questions fit ${roundSeconds}-second rounds — the rest are multi-step (DOK 3–4) questions, and each needs at least ${DOK3_MIN_ROUND_SECONDS} seconds of its own. `
    + 'Choose longer rounds or Pace Race, or pick a different standard.';
};
