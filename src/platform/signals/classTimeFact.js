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
 * and a day the district calendar marks closed, are days no class meets
 * (false); otherwise the period's own window (true inside it, false outside).
 *
 * Pure, and loaded with the recorder (attemptSignalWriter.js), outside the
 * student's first load.
 */
import { normalizeSchedule, resolvePeriodWindow, resolveScheduleDayType } from '../../../functions/shared/classSchedule.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { buildNonInstructionalSet } from '../path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../curriculum/calendars/schoolYear2026-2027.js';

export const SCHOOL_TIME_ZONE = 'America/Chicago';

// Why the schedule cannot say, for a test and a diagnostic; never stored.
export const CLASS_TIME_UNKNOWN = Object.freeze({
  NO_SCHEDULE: 'no-schedule',
  DAY_TYPE_NOT_SET: 'day-type-not-set',
  PERIOD_NOT_ON_SCHEDULE: 'period-not-on-schedule',
  NO_PERIOD: 'no-period',
});

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
