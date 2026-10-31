/*
 * THE BELL SCHEDULE, USABLE FROM BOTH SIDES.
 *
 * A Warm-Up closes ten minutes after a class period starts, and a DOL closes
 * before the bell. Both of those sentences are only meaningful against the
 * class period window — so the deadline finalizer needs the same schedule
 * resolution the browser uses, not a second reading of the same settings
 * document.
 */
import { parseInstant, zonedDateKey, zonedTimeOnDate } from './instructionalCalendar.mjs';

export const CLASS_PERIODS = Object.freeze(Array.from({ length: 8 }, (_, index) => `Period ${index + 1}`));

const emptyPeriods = () => Object.fromEntries(
  CLASS_PERIODS.map((period) => [period, { enabled: false, start: '', end: '' }]),
);

export const DEFAULT_CLASS_SCHEDULE = {
  version: 2,
  // `periods` is kept as a legacy/fallback schedule so older saved settings
  // continue to work. New A/B schedules live in `daySchedules` below.
  periods: emptyPeriods(),
  daySchedules: {
    A: { periods: emptyPeriods() },
    B: { periods: emptyPeriods() },
  },
  // Monday/Wednesday are always A; Tuesday/Thursday are always B. Friday is
  // intentionally null because the school alternates it and the teacher must
  // be able to choose the real day rather than MathMaster guessing.
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
};

const normalizePeriodMap = (periods, fallback = DEFAULT_CLASS_SCHEDULE.periods) => Object.fromEntries(
  CLASS_PERIODS.map((period) => [period, {
    ...(fallback?.[period] || DEFAULT_CLASS_SCHEDULE.periods[period]),
    ...(periods?.[period] || {}),
  }]),
);

export const normalizeSchedule = (schedule) => {
  const legacyPeriods = normalizePeriodMap(schedule?.periods);
  const aPeriods = normalizePeriodMap(schedule?.daySchedules?.A?.periods, legacyPeriods);
  const bPeriods = normalizePeriodMap(schedule?.daySchedules?.B?.periods, legacyPeriods);
  return {
    ...DEFAULT_CLASS_SCHEDULE,
    ...(schedule || {}),
    version: 2,
    periods: legacyPeriods,
    daySchedules: {
      A: { ...(schedule?.daySchedules?.A || {}), periods: aPeriods },
      B: { ...(schedule?.daySchedules?.B || {}), periods: bPeriods },
    },
    weeklyDayTypes: {
      ...DEFAULT_CLASS_SCHEDULE.weeklyDayTypes,
      ...(schedule?.weeklyDayTypes || {}),
    },
    dayTypeOverrides: schedule?.dayTypeOverrides || {},
    modifiedSchedules: schedule?.modifiedSchedules || {},
  };
};

export const resolveScheduleDayType = (scheduleValue, nowValue = Date.now(), timeZone = null) => {
  const schedule = normalizeSchedule(scheduleValue);
  const dateKey = zonedDateKey(nowValue, timeZone);
  const overridden = String(schedule.dayTypeOverrides?.[dateKey] || '').toUpperCase();
  if (overridden === 'A' || overridden === 'B') return { dayType: overridden, source: 'override', dateKey };
  const weekdayIndex = dateKey ? new Date(`${dateKey}T00:00:00Z`).getUTCDay() : null;
  const weekly = String(schedule.weeklyDayTypes?.[weekdayIndex] || '').toUpperCase();
  if (weekly === 'A' || weekly === 'B') return { dayType: weekly, source: 'weekly', dateKey };
  return { dayType: null, source: 'manualRequired', dateKey };
};

/*
 * WHEN EACH DATE'S A/B DAY WAS SET (the owner, 2026-10-23, TC01).
 *
 * A date's A/B day can be chosen after some of that day's periods have ended
 * (Friday's, set in the afternoon; a calendar change entered late). Those
 * periods had no class time while they met, so a Test set for one of them was
 * never open to anyone, and the Test Cycle must not read it as missed
 * (testCycleAvailability.mjs resolveClassWindows). `dayTypeSetAt[dateKey]`
 * records when that date's A/B day last changed — set, changed or cleared —
 * stamped by the save (withDayTypeSetAt) with the server's clock. The weekly
 * Monday–Thursday pattern is known in advance and records nothing; a date
 * with no stamp reads exactly as before.
 */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The A/B day a date resolves to — its override, else the weekly pattern — or null. */
export const dayTypeOnDate = (scheduleValue, dateKey) => {
  const key = String(dateKey || '');
  if (!DATE_KEY.test(key)) return null;
  const schedule = normalizeSchedule(scheduleValue);
  const overridden = String(schedule.dayTypeOverrides?.[key] || '').toUpperCase();
  if (overridden === 'A' || overridden === 'B') return overridden;
  const weekly = String(schedule.weeklyDayTypes?.[new Date(`${key}T00:00:00Z`).getUTCDay()] || '').toUpperCase();
  return weekly === 'A' || weekly === 'B' ? weekly : null;
};

/** When this date's A/B day was last set (ms), or null when nothing records it. */
export const dayTypeSetAtOf = (scheduleValue, dateKey) => parseInstant(scheduleValue?.dayTypeSetAt?.[String(dateKey || '')] ?? null);

/**
 * The schedule to save: `next`, with every date whose A/B day differs from
 * `previous` (what is saved now) stamped `at`, and every other date keeping the
 * stamp it had. A stamp written on screen before the save is replaced, so a
 * day clicked to B and back to A records nothing.
 */
export const withDayTypeSetAt = (previousValue, nextValue, at) => {
  const previous = normalizeSchedule(previousValue);
  const next = normalizeSchedule(nextValue);
  const kept = previous.dayTypeSetAt && typeof previous.dayTypeSetAt === 'object' ? previous.dayTypeSetAt : {};
  const stamps = { ...kept };
  new Set([...Object.keys(previous.dayTypeOverrides || {}), ...Object.keys(next.dayTypeOverrides || {})]).forEach((dateKey) => {
    if (DATE_KEY.test(dateKey) && dayTypeOnDate(previous, dateKey) !== dayTypeOnDate(next, dateKey)) stamps[dateKey] = at;
  });
  return { ...next, dayTypeSetAt: stamps };
};

/**
 * The periods of `dayType` on the day of `nowValue` whose class time had ended
 * by `at`: what setting that day's A/B day at `at` cannot give class time
 * after the fact. A day with its own special times is not timed by its A/B
 * day, so none.
 */
export const periodsEndedBy = ({ schedule: scheduleValue, dayType, nowValue = Date.now(), at = nowValue, timeZone = null } = {}) => {
  const schedule = normalizeSchedule(scheduleValue);
  const cutoff = parseInstant(at);
  if (cutoff === null || schedule.modifiedSchedules?.[zonedDateKey(nowValue, timeZone)]?.periods) return [];
  const periods = schedule.daySchedules?.[String(dayType || '').toUpperCase()]?.periods || {};
  return CLASS_PERIODS.filter((period) => {
    const entry = periods[period];
    if (!entry?.enabled || !entry.start || !entry.end) return false;
    const startMs = zonedTimeOnDate(nowValue, entry.start, timeZone);
    const endMs = zonedTimeOnDate(nowValue, entry.end, timeZone);
    return startMs !== null && endMs !== null && endMs > startMs && endMs <= cutoff;
  });
};

/**
 * The class period window containing (or belonging to) `nowValue`.
 *
 * A date-specific modified schedule always wins. Otherwise the selected A/B
 * schedule applies. If Friday has not been designated yet, there is no window
 * rather than a DOL opening at the wrong time.
 */
export const resolvePeriodWindow = ({ schedule: scheduleValue, classPeriod, nowValue = Date.now(), timeZone = null } = {}) => {
  const schedule = normalizeSchedule(scheduleValue);
  const dateKey = zonedDateKey(nowValue, timeZone);
  const modified = schedule.modifiedSchedules?.[dateKey]?.periods || null;
  const dayTypeState = resolveScheduleDayType(schedule, nowValue, timeZone);
  const daySchedule = modified
    || (dayTypeState.dayType ? schedule.daySchedules?.[dayTypeState.dayType]?.periods : null)
    || (schedule.version < 2 ? schedule.periods : null);
  const period = daySchedule?.[classPeriod];
  if (!period?.enabled || !period.start || !period.end) return null;
  const startMs = zonedTimeOnDate(nowValue, period.start, timeZone);
  const endMs = zonedTimeOnDate(nowValue, period.end, timeZone);
  if (startMs === null || endMs === null || endMs <= startMs) return null;
  return {
    startMs,
    endMs,
    dateKey,
    period: classPeriod,
    modified: Boolean(modified),
    dayType: dayTypeState.dayType,
    dayTypeSource: dayTypeState.source,
  };
};
