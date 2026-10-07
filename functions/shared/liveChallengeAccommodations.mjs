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
 * set when a round opens (`extendedTimeInPlay`) — never in a commit that also
 * changes one student's public row — so the projector can say "a few students
 * are still finishing", never who. An answer given after the class's
 * deadline reaches the student's public row only when the round closes.
 *
 * Where a mode allows it: a synchronized question round (Standard, Solver
 * Race). A question-set race (Graph Feature Rush) ranks how much each player
 * completes against one clock; stretching one player's clock would change the
 * race rather than its access, so it is not extended there.
 */

import { resolveSupportEntitlements } from './supportEntitlements.mjs';
import { SUBMISSION_ARRIVAL_GRACE_MS } from './liveChallengeParity.mjs';

// A game round is short; doubling it is the most a class waits for one player.
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
