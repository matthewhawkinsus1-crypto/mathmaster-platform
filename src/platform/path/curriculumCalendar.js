// Curriculum calendar: answering "has this window opened yet?" and nothing else.
//
// Of the four questions the engine asks about a skill, this file answers
// exactly one — question 2. Whether the student is mathematically ready is the
// prerequisite graph's job; how useful the skill is right now is the
// recommendation engine's. Keeping the calendar to timing alone is what stops
// the platform becoming a pacing-calendar player.
//
// Two rules shape everything here:
//
//   The one-week-early rule. A window opens five INSTRUCTIONAL days before its
//   scheduled start, not seven calendar days. Thanksgiving week must not spend
//   five days of a student's early access, and fall break must not make the
//   engine think the course advanced.
//
//   Early is not urgent. An upcoming window makes a skill a legitimate option
//   for a prepared student. It does not make it outrank what the class is
//   actually doing today, which is why UPCOMING carries a smaller weight than
//   CURRENT rather than the same one.

import { TIMING } from './curriculumPacing.js';

export const CALENDAR_TIMING = Object.freeze({
  FUTURE: 'future',
  UPCOMING: 'upcoming',
  CURRENT: 'current',
  REVIEW: 'review',
});

export const RECOMMENDATION_MODE = Object.freeze({
  NORMAL: 'normal',
  REVIEW: 'review',
  EXTENSION: 'extension',
});

export const DEFAULT_EARLY_OPEN_INSTRUCTIONAL_DAYS = 5;

const DAY_MS = 86400000;

const toDate = (value) => {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const text = String(value || '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

export const toDayKey = (value) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
};

const isWeekend = (date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;

/**
 * Expand the calendar's non-instructional ranges into a lookup. Weekends are
 * handled separately because they are universal, not district-specific.
 */
export const buildNonInstructionalSet = (ranges = []) => {
  const set = new Set();
  (Array.isArray(ranges) ? ranges : []).forEach((range) => {
    const start = toDate(range?.start);
    const end = toDate(range?.end) || start;
    if (!start || !end) return;
    for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
      set.add(new Date(time).toISOString().slice(0, 10));
    }
  });
  return set;
};

export const isInstructionalDay = (value, nonInstructional) => {
  const date = toDate(value);
  if (!date) return false;
  if (isWeekend(date)) return false;
  return !nonInstructional?.has(date.toISOString().slice(0, 10));
};

/**
 * Step back N instructional days from a date. This is the whole point of the
 * early-open rule: counting calendar days would hand a student their early
 * access during a break, when they cannot use it and the class has not moved.
 */
export const subtractInstructionalDays = (from, days, nonInstructional) => {
  const start = toDate(from);
  if (!start) return null;
  let remaining = Math.max(0, Math.floor(Number(days) || 0));
  let cursor = start.getTime();
  // A generous bound: even a long holiday cannot exceed a term.
  let guard = 400;
  while (remaining > 0 && guard > 0) {
    cursor -= DAY_MS;
    guard -= 1;
    if (isInstructionalDay(new Date(cursor), nonInstructional)) remaining -= 1;
  }
  return new Date(cursor);
};

export const countInstructionalDaysBetween = (from, to, nonInstructional) => {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end || end < start) return 0;
  let count = 0;
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    if (isInstructionalDay(new Date(time), nonInstructional)) count += 1;
  }
  return count;
};

const normalizeWindow = (window, calendar, nonInstructional) => {
  const start = toDate(window?.start);
  const end = toDate(window?.end) || start;
  if (!start) return null;
  const earlyDays = window.earlyOpenInstructionalDays ?? calendar?.earlyOpenInstructionalDays
    ?? DEFAULT_EARLY_OPEN_INSTRUCTIONAL_DAYS;
  return {
    ...window,
    startDate: start,
    endDate: end,
    earlyOpenInstructionalDays: earlyDays,
    // Opening on the start date itself when earlyDays is 0 (a course opener).
    earlyOpenDate: earlyDays > 0 ? subtractInstructionalDays(start, earlyDays, nonInstructional) : start,
    recommendationMode: window.recommendationMode || RECOMMENDATION_MODE.NORMAL,
  };
};

/**
 * Prepare a calendar for querying. Done once; the result is cheap to reuse.
 */
export const loadCalendar = (calendar) => {
  if (!calendar || !Array.isArray(calendar.windows)) return null;
  const nonInstructional = buildNonInstructionalSet(calendar.nonInstructionalRanges);
  const windows = calendar.windows.map((window) => normalizeWindow(window, calendar, nonInstructional)).filter(Boolean);
  // A curriculum node may legitimately hold several windows — the Algebra II
  // calendar returns to Modules 3, 4 and 5 later in the year — so this is a
  // list per id, never a single range.
  const byCurriculumId = new Map();
  windows.forEach((window) => {
    if (!byCurriculumId.has(window.curriculumId)) byCurriculumId.set(window.curriculumId, []);
    byCurriculumId.get(window.curriculumId).push(window);
  });
  return { ...calendar, nonInstructional, windows, byCurriculumId };
};

const classifyOne = (window, today) => {
  if (today < window.earlyOpenDate) return CALENDAR_TIMING.FUTURE;
  if (today < window.startDate) return CALENDAR_TIMING.UPCOMING;
  if (today <= window.endDate) return CALENDAR_TIMING.CURRENT;
  return CALENDAR_TIMING.REVIEW;
};

// When a node has several windows, the most permissive state wins: a module
// being taught now is current even if an earlier window of it has closed, and
// one already taught stays available for review even while a later window is
// still in the future.
const TIMING_RANK = {
  [CALENDAR_TIMING.CURRENT]: 0,
  [CALENDAR_TIMING.UPCOMING]: 1,
  [CALENDAR_TIMING.REVIEW]: 2,
  [CALENDAR_TIMING.FUTURE]: 3,
};

/**
 * The state of one curriculum node today, across all of its windows.
 */
export const getCurriculumTiming = (loaded, curriculumId, nowValue = Date.now()) => {
  const today = toDate(new Date(nowValue));
  const windows = loaded?.byCurriculumId?.get(curriculumId) || [];
  if (!today || !windows.length) {
    // A node the calendar says nothing about is not withheld. Missing data is
    // ignorance, not a decision, and the same rule holds here as in pacing.
    return {
      timing: CALENDAR_TIMING.CURRENT,
      unmapped: true,
      recommendationMode: RECOMMENDATION_MODE.NORMAL,
      window: null,
      windowCount: 0,
    };
  }

  const evaluated = windows
    .map((window) => ({ window, timing: classifyOne(window, today) }))
    .sort((a, b) => TIMING_RANK[a.timing] - TIMING_RANK[b.timing]
      || a.window.startDate - b.window.startDate);

  const best = evaluated[0];
  return {
    timing: best.timing,
    unmapped: false,
    recommendationMode: best.window.recommendationMode,
    window: best.window,
    windowCount: windows.length,
    // Both counts, because they answer different questions. Students think in
    // calendar days ("next week"); the engine's early-open arithmetic runs on
    // instructional days, and a teacher debugging pacing needs to see both.
    instructionalDaysUntilStart: best.timing === CALENDAR_TIMING.UPCOMING || best.timing === CALENDAR_TIMING.FUTURE
      ? countInstructionalDaysBetween(today, best.window.startDate, loaded.nonInstructional)
      : 0,
    calendarDaysUntilStart: best.timing === CALENDAR_TIMING.UPCOMING || best.timing === CALENDAR_TIMING.FUTURE
      ? Math.max(0, Math.round((best.window.startDate - today) / DAY_MS))
      : 0,
    approximate: Boolean(best.window.approximate),
  };
};

/**
 * What the class is on today, for the teacher-facing calendar readout.
 */
export const describeToday = (loaded, nowValue = Date.now()) => {
  const today = toDate(new Date(nowValue));
  // A truthy object that is not a loaded calendar — the shape a half-built
  // config passes — must not throw on `.windows.map`.
  if (!today || !Array.isArray(loaded?.windows)) {
    return { current: [], upcoming: [], mode: RECOMMENDATION_MODE.NORMAL, today: toDayKey(today) };
  }
  const evaluated = loaded.windows.map((window) => ({ window, timing: classifyOne(window, today) }));
  const current = evaluated.filter((entry) => entry.timing === CALENDAR_TIMING.CURRENT).map((entry) => entry.window);
  const upcoming = evaluated.filter((entry) => entry.timing === CALENDAR_TIMING.UPCOMING).map((entry) => entry.window);
  // A review or extension stretch changes how the whole engine should behave,
  // so the mode of what is running today is reported at the top level.
  const mode = current.find((window) => window.recommendationMode === RECOMMENDATION_MODE.REVIEW)
    ? RECOMMENDATION_MODE.REVIEW
    : current.find((window) => window.recommendationMode === RECOMMENDATION_MODE.EXTENSION)
      ? RECOMMENDATION_MODE.EXTENSION
      : RECOMMENDATION_MODE.NORMAL;
  return { current, upcoming, mode, today: toDayKey(today) };
};

// The engine's existing vocabulary predates the calendar's. Mapping in one
// place keeps a single source of truth rather than two parallel enums:
// UPCOMING is the calendar's name for what the engine calls AHEAD.
export const toEngineTiming = (calendarTiming) => ({
  [CALENDAR_TIMING.CURRENT]: TIMING.CURRENT,
  [CALENDAR_TIMING.UPCOMING]: TIMING.AHEAD,
  [CALENDAR_TIMING.REVIEW]: TIMING.REVIEW,
  [CALENDAR_TIMING.FUTURE]: TIMING.FUTURE,
}[calendarTiming] || TIMING.CURRENT);

/**
 * A pacing provider backed by a real calendar, satisfying the same interface
 * the provisional one does — so switching a class onto real dates is a
 * configuration change, not a code change.
 *
 * `skillCurriculumLinks` maps skillId -> curriculumId. Skills never carry
 * dates themselves, so next year's calendar drops in without touching them.
 */
export const calendarPacingProvider = ({ calendar, skillCurriculumLinks = {}, nowValue = Date.now() } = {}) => {
  const loaded = loadCalendar(calendar);
  return {
    frameworkId: calendar?.calendarId || 'calendar',
    isProvisional: false,
    loaded,
    getSkillTiming: (skillId) => {
      const curriculumId = skillCurriculumLinks[skillId];
      if (!curriculumId) {
        return { timing: CALENDAR_TIMING.CURRENT, unmapped: true, recommendationMode: RECOMMENDATION_MODE.NORMAL };
      }
      return getCurriculumTiming(loaded, curriculumId, nowValue);
    },
  };
};
