/*
 * WHEN SOMETHING OPENS — AS A STUDENT READS IT.
 *
 * One set of formatters for every wait line a student sees (student pass 3,
 * NAV-19): the navigator's tabs, Home's section lines, a Test Cycle before
 * release, the "not open yet" notice. Before this each screen had its own, so
 * one assignment could read "Opens Wed 2:15 PM" on a tab, "Oct 21, 2026,
 * 2:15 PM" on Home, "2026-10-21" in a wait line, and "at the scheduled time"
 * on a Test Cycle whose opening time was known.
 *
 *   today            "2:15 PM"            → "opens at 2:15 PM"
 *   another day      "Wed, Oct 21, 2:15 PM"
 *   another year     "Wed, Jan 6, 2027, 2:15 PM"
 *   a class day key  "Wed, Oct 21"        (never "2026-10-21")
 *
 * Pure: no React. Locale is the browser's, as everywhere else on these screens.
 */

import { parseInstant } from '../../../functions/shared/instructionalCalendar.mjs';

// Any date-ish value (Date, epoch ms, Firestore Timestamp, stored string) the
// way the lifecycle reads it (parseInstant), or null.
export const toWhenDate = (value) => {
  const instant = parseInstant(value);
  return instant === null ? null : new Date(instant);
};

// "2:15 PM"
export const formatWhenTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// "Wed, Oct 21" — a class day with no time. The year only when it is not this one.
export const formatWhenDate = (date, { now = new Date() } = {}) => date.toLocaleDateString([], {
  weekday: 'short', month: 'short', day: 'numeric',
  ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
});

// "Wed, Oct 21, 2:15 PM"
export const formatWhenDateTime = (date, { now = new Date() } = {}) => date.toLocaleString([], {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
});

// "Wed, Oct 21, 2:15 PM" for any date-ish value, '' when there is none (never "Not set").
export const whenDateTimeText = (value) => {
  const at = toWhenDate(value);
  return at ? formatWhenDateTime(at) : '';
};

// An instruction date key ("2026-10-21") as that local day, or null.
export const dayFromDateKey = (key) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
};

// "Wed, Oct 21" for a date key; anything that is not a key is returned as is.
export const formatWhenDateKey = (key, { now = new Date() } = {}) => {
  const day = dayFromDateKey(key);
  return day ? formatWhenDate(day, { now }) : String(key || '');
};

/**
 * The moment something opens, relative to now: the time alone today
 * ("2:15 PM"), the day and time otherwise. '' when there is no moment.
 * `sameDay` tells the caller which, so it can say "at 2:15 PM" or "on …".
 */
export const describeWhen = (value, { nowValue = Date.now() } = {}) => {
  const at = toWhenDate(value);
  if (!at) return { text: '', sameDay: false };
  const now = toWhenDate(nowValue) || new Date();
  const sameDay = at.toDateString() === now.toDateString();
  return { text: sameDay ? formatWhenTime(at) : formatWhenDateTime(at, { now }), sameDay };
};

// "at 2:15 PM" today, "on Wed, Oct 21, 2:15 PM" another day, '' when unknown.
export const opensWhenPhrase = (value, options = {}) => {
  const { text, sameDay } = describeWhen(value, options);
  if (!text) return '';
  return sameDay ? `at ${text}` : `on ${text}`;
};

export default describeWhen;
