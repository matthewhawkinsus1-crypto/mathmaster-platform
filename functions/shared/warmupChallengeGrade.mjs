/*
 * A LIVE CHALLENGE WARM-UP RESULT, AS THE WARM-UP GRADE.
 *
 * When the Warm-Up is played as a Live Challenge, the student's result IS
 * their Warm-Up grade. The credit record is written by the server when the
 * match finishes (writeWarmupCreditFromResult in functions/index.js) and holds
 * rounds answered, rounds correct and the rounds that were available to this
 * student (a late arrival is measured only against the rounds they were there
 * for). Challenge POINTS — speed, streaks, rewards — never enter the grade.
 *
 * THE SCORE: correct rounds out of rounds available, on the same scale as an
 * authored Warm-Up, where an unanswered question earns nothing and a wrong one
 * earns nothing. A game that offered this student no rounds scores nothing at
 * all (null), never 0%: they were not measured.
 *
 * It enters the existing calculation exactly like a completed Recovery
 * (sectionRecoveryProjection.mjs): the Warm-Up questions are credited at the
 * recorded score, so weights, denominators and every other section are
 * unchanged. The recorded score is the higher of the challenge score and any
 * authored Warm-Up work, so a student who did both is never pulled down.
 *
 * Pure: no Firestore.
 */

const finite = (value) => (value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null));

export const WARMUP_GRADE_SOURCE = Object.freeze({
  ORIGINAL: 'original',
  CHALLENGE: 'challenge',
});

/** The Warm-Up score a challenge credit is worth, 0-100, or null. */
export const warmupChallengeScore = (credit = null) => {
  if (!credit || typeof credit !== 'object') return null;
  const available = finite(credit.roundsAvailable);
  const correct = finite(credit.correct);
  if (available === null || available <= 0 || correct === null) return null;
  return Math.round((Math.max(0, Math.min(correct, available)) / available) * 100);
};

/**
 * What the Warm-Up records, given the authored section's own score and the
 * challenge credit. Null when there is no measurable challenge result.
 */
export const buildWarmupChallengeGradeState = ({ credit = null, originalScore = null } = {}) => {
  const challengeScore = warmupChallengeScore(credit);
  if (challengeScore === null) return null;
  const original = finite(originalScore);
  const source = original !== null && original > challengeScore ? WARMUP_GRADE_SOURCE.ORIGINAL : WARMUP_GRADE_SOURCE.CHALLENGE;
  return {
    section: 'warmup',
    challengeScore,
    correct: Math.max(0, Math.round(Number(credit.correct) || 0)),
    roundsAvailable: Math.max(0, Math.round(Number(credit.roundsAvailable) || 0)),
    originalScore: original,
    recordedScore: source === WARMUP_GRADE_SOURCE.ORIGINAL ? original : challengeScore,
    source,
  };
};

/**
 * The part of a credit that decides the grade. Timestamps and room details are
 * left out, so re-writing the same result never looks like a grade change.
 */
export const warmupChallengeSignature = (credit = null) => {
  const score = warmupChallengeScore(credit);
  return score === null ? null : `${Math.round(Number(credit.correct) || 0)}/${Math.round(Number(credit.roundsAvailable) || 0)}`;
};
