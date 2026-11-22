/*
 * WAS THE STUDENT'S CLASS MEETING WHEN THE FACT WAS RECORDED?
 * (docs/platform/SHOWING_THE_PROCESS.md, section 7, "Signals as evidence".)
 *
 * Three answers, not two: true, false, or null when the bell schedule cannot
 * say. "Outside class time" is a statement about a student, so it is stored
 * only when the schedule really answers. It cannot when:
 *
 *   - no schedule has been loaded or saved (no period is switched on on any
 *     day: the app's starting schedule before settings/classSchedule arrives);
 *   - the day's A/B type has not been chosen (a Friday the teacher has not
 *     set), and the date has no bell schedule of its own;
 *   - the student's period is missing, or is not switched on with times on
 *     that day's schedule.
 *
 * The school's clock decides, never the device's: a Chromebook set to another
 * time zone reads the same bell schedule (SCHOOL_TIME_ZONE).
 *
 * What the schedule does answer: a weekend with no bell schedule of its own,
 * a day the district calendar marks closed, and a day outside the school year
 * (the summer, pre-service days) are days no class meets (false); otherwise
 * the period's own window (true inside it, false outside). A date no school
 * calendar covers at all is not known.
 *
 * Pure, and loaded with the recorder (attemptSignalWriter.js), outside the
 * student's first load.
 */
import { normalizeSchedule, resolvePeriodWindow, resolveScheduleDayType } from '../../../functions/shared/classSchedule.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { buildNonInstructionalSet } from '../path/curriculumCalendar.js';
import { SCHOOL_YEAR_2026_27, schoolYearNonInstructionalRanges } from '../../curriculum/calendars/schoolYear2026-2027.js';

export const SCHOOL_TIME_ZONE = 'America/Chicago';

// Why the schedule cannot say, for a test and a diagnostic; never stored.
export const CLASS_TIME_UNKNOWN = Object.freeze({
  NO_SCHEDULE: 'no-schedule',
  DAY_TYPE_NOT_SET: 'day-type-not-set',
  PERIOD_NOT_ON_SCHEDULE: 'period-not-on-schedule',
  NO_PERIOD: 'no-period',
  NO_CALENDAR: 'no-calendar',
});

/*
 * THE SCHOOL YEAR. The bell schedule's weekly pattern says "Monday is an A
 * day" for every Monday there will ever be; only the district calendar knows
 * which Mondays are school. So:
 *   - a date the calendar covers but outside its first and last day of school
 *     (the summer either side, pre-service days included) is a day no class
 *     meets: "outside";
 *   - a date no calendar covers at all (a later school year, before its
 *     calendar is added) is not known.
 * A calendar covers the twelve months around its school year: 1 July of the
 * year school starts to 30 June of the year it ends.
 */
export const schoolYearCoverage = (year = SCHOOL_YEAR_2026_27) => {
  const start = String(year?.startDate || '');
  const end = String(year?.endDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
  return { from: `${start.slice(0, 4)}-07-01`, to: `${end.slice(0, 4)}-06-30`, firstDay: start, lastDay: end };
};

let closedDays = null;
const schoolClosedDays = () => (closedDays ||= buildNonInstructionalSet(schoolYearNonInstructionalRanges()));

const periodOn = (entry) => Boolean(entry?.enabled && entry.start && entry.end);
const anyPeriodOn = (periods) => Object.values(periods || {}).some(periodOn);

/** Has any bell schedule been saved at all: a period switched on, with times, on some day? */
export const scheduleHasPeriods = (scheduleValue) => {
  if (!scheduleValue || typeof scheduleValue !== 'object') return false;
  const schedule = normalizeSchedule(scheduleValue);
  return anyPeriodOn(schedule.daySchedules?.A?.periods)
    || anyPeriodOn(schedule.daySchedules?.B?.periods)
    || Object.values(schedule.modifiedSchedules || {}).some((day) => anyPeriodOn(day?.periods));
};

/**
 * `{ duringClass: true | false | null, reason }`: `reason` is one of
 * CLASS_TIME_UNKNOWN when `duringClass` is null, else ''.
 */
export const classTimeFact = ({
  schedule = null, classPeriod = null, nowValue = Date.now(), timeZone = SCHOOL_TIME_ZONE, nonInstructionalKeys = undefined,
  schoolYear = SCHOOL_YEAR_2026_27,
} = {}) => {
  const unknown = (reason) => ({ duringClass: null, reason });
  const period = String(classPeriod ?? '').trim();
  const now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  if (!period || !Number.isFinite(now)) return unknown(CLASS_TIME_UNKNOWN.NO_PERIOD);
  if (!scheduleHasPeriods(schedule)) return unknown(CLASS_TIME_UNKNOWN.NO_SCHEDULE);
  const normalized = normalizeSchedule(schedule);
  const dateKey = zonedDateKey(now, timeZone);
  const ownDay = normalized.modifiedSchedules?.[dateKey]?.periods || null;
  if (!ownDay) {
    // Which days are school at all is the district calendar's to say.
    const year = schoolYearCoverage(schoolYear);
    if (!year || dateKey < year.from || dateKey > year.to) return unknown(CLASS_TIME_UNKNOWN.NO_CALENDAR);
    if (dateKey < year.firstDay || dateKey > year.lastDay) return { duringClass: false, reason: '' };
    // A day no class meets is an answer, not a gap in the schedule.
    const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    const closed = (nonInstructionalKeys === undefined ? schoolClosedDays() : nonInstructionalKeys)?.has?.(dateKey);
    const dayType = resolveScheduleDayType(normalized, now, timeZone).dayType;
    if (closed || (!dayType && (weekday === 0 || weekday === 6))) return { duringClass: false, reason: '' };
    if (!dayType) return unknown(CLASS_TIME_UNKNOWN.DAY_TYPE_NOT_SET);
  }
  const window = resolvePeriodWindow({ schedule: normalized, classPeriod: period, nowValue: now, timeZone });
  if (!window) return unknown(CLASS_TIME_UNKNOWN.PERIOD_NOT_ON_SCHEDULE);
  return { duringClass: now >= window.startMs && now <= window.endMs, reason: '' };
};

export default classTimeFact;
