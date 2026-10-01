/*
 * HOW WAS THIS WARM-UP DELIVERED? AN EXPLICIT ANSWER, NEVER AN INFERENCE.
 *
 * A teacher can run a Live Challenge as the Warm-Up (warmupChallenge.mjs,
 * stored on the assignment as `warmup.liveChallenge`). A student who played
 * the game answered no normal Warm-Up questions — and anything that reads only
 * the question tracker would conclude they "missed" the Warm-Up and need
 * Recovery. That conclusion would be wrong, and acting on it would hand a
 * whole class a duplicate Warm-Up they never needed.
 *
 * So the delivery mode is read from the teacher's explicit setting, through
 * the same normalizer the Live Challenge runtime uses, and every Recovery,
 * missing-work and Pre-Flight decision asks THIS function rather than looking
 * for empty Warm-Up scores:
 *
 *   assignment             the authored Warm-Up questions are the Warm-Up
 *   liveChallenge          the Live Challenge is the Warm-Up — no normal
 *                          Warm-Up is expected, none is generated, nobody is
 *                          missing it, and Warm-Up Recovery does not apply
 *   teacherChoicePending   the teacher has not picked today's Warm-Up yet;
 *                          treated like liveChallenge for Recovery (never
 *                          assume a missed Warm-Up while undecided)
 *   none                   the assignment has no Warm-Up
 *
 * This reads and never changes Live Challenge behaviour: scoring, rewards,
 * class points, room routing and session rules are all untouched.
 *
 * KNOWN LIMIT (documented, not hidden): the Live Challenge setting is per
 * assignment, not per class or per day, so every class of an assignment reads
 * the same mode. A per-class decision map would extend this one function.
 *
 * Pure: no Firestore, no clock.
 */

import {
  WARMUP_CHALLENGE_DECISION,
  WARMUP_CHALLENGE_DELIVERY,
  normalizeWarmupChallengeConfig,
} from './warmupChallenge.mjs';

export const WARMUP_DELIVERY_MODE = Object.freeze({
  ASSIGNMENT: 'assignment',
  LIVE_CHALLENGE: 'liveChallenge',
  TEACHER_CHOICE_PENDING: 'teacherChoicePending',
  NONE: 'none',
});

/**
 * The delivery mode for an assignment's Warm-Up.
 *
 * `hasAuthoredWarmup` says whether the assignment has Warm-Up questions at all.
 * `challengeCredit` is the student's own `warmupChallengeByAssignment[aid]`
 * record when the caller has it; it is reported, never required.
 */
export const resolveWarmupDelivery = ({ assignment = null, hasAuthoredWarmup = true, challengeCredit = null } = {}) => {
  const config = normalizeWarmupChallengeConfig(assignment);
  const credit = challengeCredit && typeof challengeCredit === 'object' ? challengeCredit : null;
  if (config.enabled) {
    if (config.deliveryMode === WARMUP_CHALLENGE_DELIVERY.LIVE_CHALLENGE) {
      return { mode: WARMUP_DELIVERY_MODE.LIVE_CHALLENGE, config, played: Boolean(credit), credit };
    }
    if (config.deliveryMode === WARMUP_CHALLENGE_DELIVERY.TEACHER_CHOICE) {
      if (config.teacherDecision === WARMUP_CHALLENGE_DECISION.CHALLENGE) {
        return { mode: WARMUP_DELIVERY_MODE.LIVE_CHALLENGE, config, played: Boolean(credit), credit };
      }
      if (!config.teacherDecision) {
        return { mode: WARMUP_DELIVERY_MODE.TEACHER_CHOICE_PENDING, config, played: Boolean(credit), credit };
      }
    }
  }
  if (!hasAuthoredWarmup) return { mode: WARMUP_DELIVERY_MODE.NONE, config, played: false, credit };
  return { mode: WARMUP_DELIVERY_MODE.ASSIGNMENT, config, played: false, credit };
};

/** True when the Warm-Up is not (or may not be) the authored questions. */
export const warmupIsNotAssignmentDelivered = (delivery) => (
  delivery?.mode === WARMUP_DELIVERY_MODE.LIVE_CHALLENGE
  || delivery?.mode === WARMUP_DELIVERY_MODE.TEACHER_CHOICE_PENDING
);
