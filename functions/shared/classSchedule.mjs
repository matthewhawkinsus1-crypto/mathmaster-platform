/*
 * THE BELL SCHEDULE, USABLE FROM BOTH SIDES.
 *
 * A Warm-Up closes ten minutes after a class period starts, and a DOL closes
 * before the bell. Both of those sentences are only meaningful against the
 * class period window — so the deadline finalizer needs the same schedule
 * resolution the browser uses, not a second reading of the same settings
 * document.
 */
import { zonedDateKey, zonedTimeOnDate } from './instructionalCalendar.mjs';

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
