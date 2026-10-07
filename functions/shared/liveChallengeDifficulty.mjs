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

/** Why a candidate pool emptied, in a teacher's words (null when it did not). */
export const timedRoundShortfallMessage = ({ before = 0, after = 0, needed = 0, roundSeconds = 0 } = {}) => {
  if (after >= needed || before <= after) return null;
  return `Only ${after} of these questions fit a ${roundSeconds}-second round — the rest are multi-step (DOK 3–4) questions that need more time. `
    + `Choose rounds of at least ${DOK3_MIN_ROUND_SECONDS} seconds or Pace Race, or pick a different standard.`;
};
