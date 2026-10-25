/*
 * ACCOMMODATIONS IN A LIVE GAME.
 *
 * A Warm-Up game's accuracy IS the student's Warm-Up grade
 * (warmupChallengeGrade.mjs), so a student with extended time on their plan
 * must get it here as on any other graded work. Every round of a synchronized
 * game ends for the class at one deadline; a student with extended time gets
 * their OWN deadline — the round's duration times their multiplier, counted
 * from the same start — and the round does not close while such a student is
 * still within it and has not answered.
 *
 * Who has extended time is never public. The student's own multiplier lives
 * on their private player record and their own invite (readable by them
 * only). The room carries only whether anyone joined has extended time,
 * set when a round opens (`extendedTimeInPlay`), or — when such a student
 * joined mid-round — by the host's close that the round's hold refuses; never
 * in a commit that also changes one student's public row — so the projector can say "a few students
 * are still finishing", never who. An answer given after the class's
 * deadline reaches the student's public row only when the round closes.
 *
 * Where a mode allows it (extendedTimeRuleFor):
 *
 *   a synchronized question round (Standard, Solver Race) — the student's
 *   answer is judged against their own deadline and counts like anyone's;
 *
 *   a question-set race whose round is a SET TO FINISH (Graph the Line's
 *   Classic and Sprint; the mode's `extraTimeAfterBuzzer`) — the extra time
 *   comes AFTER the class's buzzer. A question-set race ranks how much each
 *   player completes against one clock; stretching one player's clock would
 *   change the race rather than its access. So the race is decided at the
 *   buzzer, for everyone, exactly as if nobody had extra time, and the
 *   student then keeps working to their own deadline to finish their set.
 *   What they do after the buzzer is their own work — what they finished,
 *   the teacher's report, their evidence — kept in its own map
 *   (liveChallengeResponses.EXTRA_TIME_RECEIPTS_FIELD), never the race's
 *   score, place, accuracy or rewards, and never on their public row (a row
 *   that moved after the buzzer would name them). Nobody's place changes
 *   because a classmate had extra time, and the student is never placed
 *   below where the class's clock alone would put them;
 *
 *   never an "as many as you can" race (Graph Feature Rush, Graph the Line's
 *   Rush): the clock IS the task, there is no set to finish, and more time
 *   would only be more race.
 */

import { resolveSupportEntitlements } from './supportEntitlements.mjs';
import { effectiveFlatSupportProfile } from './supportProfileModel.mjs';
import { SUBMISSION_ARRIVAL_GRACE_MS } from './liveChallengeParity.mjs';

/** How a mode gives a student with extended time their extra time. */
export const EXTENDED_TIME_RULE = Object.freeze({
  // Not extended: everyone plays on the class's clock.
  NONE: 'none',
  // Their own deadline, and their answer counts like anyone's.
  PERSONAL_DEADLINE: 'personalDeadline',
  // The race ends at the class's buzzer; their extra time after it is theirs.
  AFTER_BUZZER: 'afterBuzzer',
});

// liveChallengeModes.ROUND_STRUCTURE's two ids, named here so this light
// module (every Live Challenge screen loads it) never carries the mode
// registry; tests/platform/lineGraphAccommodations.test.mjs holds the rule
// to every registered mode.
const SYNCHRONIZED_ROUND = 'synchronizedQuestion';
const QUESTION_SET_ROUND = 'questionSet';

/** Which rule a game mode (liveChallengeModes.getChallengeMode) plays extended time by. */
export const extendedTimeRuleFor = (mode = null) => {
  if (mode?.roundStructure === SYNCHRONIZED_ROUND) return EXTENDED_TIME_RULE.PERSONAL_DEADLINE;
  if (mode?.roundStructure === QUESTION_SET_ROUND && mode?.capabilities?.extraTimeAfterBuzzer === true) {
    return EXTENDED_TIME_RULE.AFTER_BUZZER;
  }
  return EXTENDED_TIME_RULE.NONE;
};

// A game round is short; doubling it is the most a class waits for one player.
//
// DECIDED 2026-10-25 (LC22, finding A1-31, the owner's "Do it"): a student whose
// plan grants more than 2x plays a game round at 2x. That includes a Warm-Up
// game, whose accuracy is their Warm-Up grade, so a teacher who needs such a
// plan honoured in full for that assignment runs its standard Warm-Up instead
// ("Use Standard Warm-Up" in the console). Raising the cap is a decision about
// how long a whole class waits for one player; tests/platform/
// liveChallengeRewardDecisions.test.mjs writes the 2 out.
export const MAX_GAME_TIME_MULTIPLIER = 2;

const roundMultiplier = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 1) return 1;
  // Hundredths are enough and keep stored values stable.
  return Math.round(Math.min(MAX_GAME_TIME_MULTIPLIER, numeric) * 100) / 100;
};

/** The game time multiplier a stored support profile entitles a student to (1 = none). */
export const gameTimeMultiplierFor = (supportProfile = null, { nowValue = Date.now() } = {}) => {
  const entitlements = resolveSupportEntitlements(supportProfile, { nowValue });
  return roundMultiplier(entitlements.extendedTimeMultiplier);
};

/** A stored multiplier, read defensively (1 when absent or malformed). */
export const storedTimeMultiplier = (value) => roundMultiplier(value);

/*
 * GRAPH THE LINE'S SLOPE HELPER, FROM A STUDENT'S PLAN. While a student
 * places a line's second point, the helper draws the rise and run of THEIR
 * OWN line ("up 2, right 3"). It counts grid squares; it never says which
 * line is right, so it changes how a student works, not what they must know
 * or how many lines they can finish — a race stays a race. A teacher may
 * turn it on for the whole room (the game's settings); a plan that gives a
 * student a graphing aid turns it on for that student alone, in every line
 * game: graph paper (the supplemental aid for multi-step math) or a graphic
 * organizer. Like extended time it is private: decided at the join, kept on
 * the student's private player record, and handed only to their own device
 * with their items — never on the room, a public row or the projector.
 */
export const SLOPE_HELPER_PLAN_SUPPORTS = Object.freeze(['graph-paper', 'graphic-organizer']);

/** Whether the student's support plan in effect turns the slope helper on for them. */
export const planTurnsOnSlopeHelper = (supportProfile = null, { nowValue = Date.now() } = {}) => {
  // A graphic organizer in either stored shape (the structured SIS record
  // names it too), through the one entitlement resolver.
  if (resolveSupportEntitlements(supportProfile, { nowValue }).granted?.graphicOrganizer === true) return true;
  // Graph paper is not a canonical entitlement (only the scratchpad reads
  // it); the plan in effect today lists it.
  const flat = effectiveFlatSupportProfile(supportProfile, { nowValue });
  return (Array.isArray(flat?.accommodations) ? flat.accommodations : []).some((id) => SLOPE_HELPER_PLAN_SUPPORTS.includes(String(id)));
};

/**
 * The round's full length as it was opened (`activeRoundSeconds`), before any
 * closing threshold shortened it. 0 when the room does not say.
 */
export const roomFullRoundMs = (room = {}) => {
  const seconds = Number(room?.activeRoundSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
};

/**
 * One player's own round clock: the same start, a deadline stretched by their
 * multiplier. An open-ended round, a paused round or a multiplier of 1 is the
 * room's clock unchanged.
 *
 * `fullDurationMs` is the round's length as opened. The closing threshold
 * pulls the CLASS's deadline in once most of the class has answered; that
 * must not take an accommodated student's extra time away because their
 * classmates were quick, so their deadline is stretched from the longer of
 * the two.
 */
export const personalRoundTimer = (timer = {}, multiplier = 1, { fullDurationMs = 0 } = {}) => {
  const factor = roundMultiplier(multiplier);
  if (factor <= 1 || !timer?.startsAtMs || !timer?.endsAtMs || timer.endsAtMs <= timer.startsAtMs) return timer;
  const baseMs = Math.max(timer.endsAtMs - timer.startsAtMs, Math.max(0, Number(fullDurationMs) || 0));
  return Object.freeze({
    ...timer,
    endsAtMs: Math.round(timer.startsAtMs + baseMs * factor),
  });
};

/** The deadline the latest-finishing accommodated player has (null: no extension). */
export const extendedRoundEndsAtMs = (timer = {}, maxTimeMultiplier = 1) => {
  const personal = personalRoundTimer(timer, maxTimeMultiplier);
  return personal !== timer && personal?.endsAtMs ? personal.endsAtMs : null;
};

/**
 * How many joined players still have extended time left in this round and
 * have not finished it. While any do, the round is not ready to close on its
 * deadline (lifecycle readiness), only on everyone finishing or a host's
 * forced close.
 *
 * @param {object} input
 * @param {object} input.timer      the room's round timer (timerFromRoom)
 * @param {Array}  input.players    [{ joined, timeMultiplier, finished }]
 * @param {number} input.nowMs      server time
 * @param {number} [input.graceMs]  the arrival grace a late answer still gets
 */
export const extendedTimePendingCount = ({
  timer = {}, players = [], nowMs = Date.now(), graceMs = SUBMISSION_ARRIVAL_GRACE_MS, fullDurationMs = 0,
} = {}) => {
  if (!timer?.endsAtMs || timer?.pausedAtMs) return 0;
  return (Array.isArray(players) ? players : []).filter((player) => {
    if (player?.joined !== true || player?.finished === true) return false;
    const personal = personalRoundTimer(timer, player.timeMultiplier, { fullDurationMs });
    return personal.endsAtMs > timer.endsAtMs && Number(nowMs) < personal.endsAtMs + Math.max(0, Number(graceMs) || 0);
  }).length;
};
