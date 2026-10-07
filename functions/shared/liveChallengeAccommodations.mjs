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
 * only). The room carries only the LARGEST multiplier among joined players
 * (`maxTimeMultiplier`), so the host can time the close and the projector can
 * say "a few students are still finishing" — never who.
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
 * One player's own round clock: the same start, a deadline stretched by their
 * multiplier. An open-ended round, a paused round or a multiplier of 1 is the
 * room's clock unchanged.
 */
export const personalRoundTimer = (timer = {}, multiplier = 1) => {
  const factor = roundMultiplier(multiplier);
  if (factor <= 1 || !timer?.startsAtMs || !timer?.endsAtMs || timer.endsAtMs <= timer.startsAtMs) return timer;
  return Object.freeze({
    ...timer,
    endsAtMs: Math.round(timer.startsAtMs + (timer.endsAtMs - timer.startsAtMs) * factor),
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
export const extendedTimePendingCount = ({ timer = {}, players = [], nowMs = Date.now(), graceMs = SUBMISSION_ARRIVAL_GRACE_MS } = {}) => {
  if (!timer?.endsAtMs || timer?.pausedAtMs) return 0;
  return (Array.isArray(players) ? players : []).filter((player) => {
    if (player?.joined !== true || player?.finished === true) return false;
    const personal = personalRoundTimer(timer, player.timeMultiplier);
    return personal.endsAtMs > timer.endsAtMs && Number(nowMs) < personal.endsAtMs + Math.max(0, Number(graceMs) || 0);
  }).length;
};
