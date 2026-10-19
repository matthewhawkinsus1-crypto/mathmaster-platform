/*
 * TIMED WORK WARNS BEFORE IT ENDS (pass 3, RUN-10).
 *
 * An Exit ticket (DOL), a Warm-Up and a secure test used to end with no
 * warning: the phone pill ticked once a minute and read "DOL open · 0m" for the
 * whole last minute, and a half-filled answer was not turned in with nobody
 * saying so. This module decides, from the time left the lifecycle state
 * already holds, which warning is due and what the pill shows. It keeps no
 * clock: the caller ticks and passes the milliseconds left.
 *
 * Each warning is said once per window: `key` names the window (the section
 * and its end time), so a remount on another question does not repeat it, and
 * a later end time (extra time, a teacher's reopen) is a new window.
 */

export const TIME_ALERT_THRESHOLDS = Object.freeze([
  Object.freeze({ ms: 120_000, words: '2 minutes' }),
  Object.freeze({ ms: 30_000, words: '30 seconds' }),
]);

const announcedByWindow = new Map();

/** Forget what was said (tests). */
export const resetTimeAlerts = () => announcedByWindow.clear();

/**
 * The warning due now, or null. Marks it (and any longer one already passed)
 * as said for this window.
 *
 * A warning crossed while the student is watching says the time exactly
 * ("2 minutes left"); one first seen already past its mark says "Less than".
 */
export const takeDueTimeAlert = ({ key, remainingMs, previousRemainingMs = null } = {}) => {
  const remaining = Number(remainingMs);
  if (!key || !Number.isFinite(remaining) || remaining <= 0) return null;
  const said = announcedByWindow.get(key) || new Set();
  announcedByWindow.set(key, said);
  // The most urgent mark already passed.
  const passed = TIME_ALERT_THRESHOLDS.filter((threshold) => remaining <= threshold.ms);
  if (!passed.length) return null;
  const due = passed[passed.length - 1];
  if (said.has(due.ms)) return null;
  passed.forEach((threshold) => said.add(threshold.ms));
  const previous = Number(previousRemainingMs);
  const crossedWhileWatching = Number.isFinite(previous) && previous > due.ms;
  return { thresholdMs: due.ms, words: crossedWhileWatching ? `${due.words} left` : `Less than ${due.words} left` };
};

/**
 * What a section's time pill shows: whole minutes until the last one, then
 * seconds ("4 min", "0:42"). Never "0m" while time is left.
 */
export const formatTimeLeft = (remainingMs) => {
  const remaining = Number(remainingMs);
  if (!Number.isFinite(remaining)) return '';
  const totalSeconds = Math.max(0, Math.ceil(remaining / 1000));
  if (totalSeconds < 60) return `0:${String(totalSeconds).padStart(2, '0')}`;
  // Whole minutes, rounded down: the pill never promises more time than is left.
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
};

/**
 * The one plain line about what happens to work when time ends. A DOL and a
 * Warm-Up turn in the latest COMPLETED answer only (dolCloseCopy, the Warm-Up
 * notice); a secure test turns in what was saved.
 */
export const UNFINISHED_WORK_LINE = Object.freeze({
  section: 'When time ends, only completed answers are turned in. An answer you have not finished is not.',
  test: 'When time ends, your test is turned in with the answers you have entered.',
});
