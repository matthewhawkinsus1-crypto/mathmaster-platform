/*
 * WHEN DOES THIS CLASS ACTUALLY MEET AGAIN?
 *
 * The absence policy is stated in class days, not calendar days: a student who
 * missed two meetings of their class gets two more meetings to finish the work.
 * On an A/B rotation those are not the same thing at all. A Period 3 class that
 * only sits on A days and misses Tuesday has missed nothing; the same class
 * missing Monday has to wait until Wednesday for its next meeting, and if that
 * Wednesday is a professional-development day, until Thursday or later.
 *
 * Counting calendar days would hand back an extension that expires before the
 * student is ever in the room again. That is worse than no extension, because
 * it looks like a grace period and behaves like a trap.
 *
 * THREE SOURCES HAVE TO AGREE FOR A DATE TO BE A MEETING.
 *   1. The district calendar says school is in session (no weekend, no break,
 *      no PD day).
 *   2. The bell schedule resolves that date to an A day or a B day.
 *   3. That day's schedule has this class's period switched on.
 *
 * DATE KEYS, NOT DATE OBJECTS. `curriculumCalendar.js` reads Date objects with
 * UTC getters while `assignmentLifecycle.js` reads them with local getters, so a
 * Date built at 8pm Central lands on tomorrow in one file and today in the
 * other. Every function here takes and returns a `YYYY-MM-DD` string instead,
 * which is the one representation both sides already agree on.
 *
 * THE FRIDAY PROBLEM IS REAL AND IS NOT PAPERED OVER. `weeklyDayTypes` sets
 * Friday to null on purpose — the school alternates it and the teacher
 * designates it that morning. A deadline projected across an undesignated
 * Friday genuinely cannot be known yet. Rather than guess, that date is
 * reported as UNDETERMINED and is not spent as one of the student's meetings.
 * Skipping it can only push the deadline later, never earlier, so the student
 * is never shortchanged by our uncertainty; the caller gets the list of
 * unresolved dates so a teacher can be asked to designate them.
 */

export const MEETING_STATUS = Object.freeze({
  MEETS: 'meets',
  NO_CLASS: 'no_class',
  NOT_IN_SESSION: 'not_in_session',
  UNDETERMINED: 'undetermined',
});

const DAY_MS = 86400000;
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value) => String(value).padStart(2, '0');

export const isDateKey = (value) => KEY.test(String(value || ''));

/** Calendar arithmetic only. Built in UTC so no timezone can shift the date. */
const asUtc = (dateKey) => {
  const match = String(dateKey || '').match(KEY);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

export const shiftDateKey = (dateKey, days) => {
  const base = asUtc(dateKey);
  if (!base) return null;
  const moved = new Date(base.getTime() + Math.trunc(Number(days) || 0) * DAY_MS);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
};

export const dayOfWeekForKey = (dateKey) => {
  const base = asUtc(dateKey);
  return base ? base.getUTCDay() : null;
};

/**
 * The A/B designation for one date.
 *
 * Deliberately mirrors `getScheduleDayType` in assignmentLifecycle.js rather
 * than calling it: that function takes a timestamp and derives the date key
 * with local getters, and we already hold the key.
 */
export const dayTypeForDateKey = (schedule, dateKey) => {
  const override = String(schedule?.dayTypeOverrides?.[dateKey] || '').toUpperCase();
  if (override === 'A' || override === 'B') return { dayType: override, source: 'override' };
  const weekday = dayOfWeekForKey(dateKey);
  const weekly = String(schedule?.weeklyDayTypes?.[weekday] ?? '').toUpperCase();
  if (weekly === 'A' || weekly === 'B') return { dayType: weekly, source: 'weekly' };
  return { dayType: null, source: 'manualRequired' };
};

const periodIsOn = (periods, classPeriod) => Boolean(periods?.[classPeriod]?.enabled);

/**
 * What one date is for one class: a meeting, a day this class does not sit, a
 * day school is closed, or a date nobody has designated yet.
 */
export const classifySchoolDay = ({
  schedule = null,
  classPeriod = null,
  dateKey = null,
  nonInstructionalKeys = null,
} = {}) => {
  if (!isDateKey(dateKey) || !classPeriod) {
    return { dateKey, dayType: null, status: MEETING_STATUS.UNDETERMINED, reason: 'incomplete_input' };
  }

  const weekday = dayOfWeekForKey(dateKey);
  if (weekday === 0 || weekday === 6) {
    return { dateKey, dayType: null, status: MEETING_STATUS.NOT_IN_SESSION, reason: 'weekend' };
  }
  if (nonInstructionalKeys?.has?.(dateKey)) {
    return { dateKey, dayType: null, status: MEETING_STATUS.NOT_IN_SESSION, reason: 'school_closed' };
  }

  // A date-specific bell schedule outranks the A/B rotation, exactly as it does
  // for DOL windows. If a modified day exists, it is the whole answer for that
  // date and no A/B designation is needed.
  const modified = schedule?.modifiedSchedules?.[dateKey]?.periods || null;
  if (modified) {
    return {
      dateKey,
      dayType: null,
      status: periodIsOn(modified, classPeriod) ? MEETING_STATUS.MEETS : MEETING_STATUS.NO_CLASS,
      reason: 'modified_schedule',
    };
  }

  const { dayType, source } = dayTypeForDateKey(schedule, dateKey);
  if (!dayType) {
    return { dateKey, dayType: null, status: MEETING_STATUS.UNDETERMINED, reason: 'ab_day_not_designated' };
  }

  const periods = schedule?.daySchedules?.[dayType]?.periods
    || (Number(schedule?.version) < 2 ? schedule?.periods : null);
  return {
    dateKey,
    dayType,
    status: periodIsOn(periods, classPeriod) ? MEETING_STATUS.MEETS : MEETING_STATUS.NO_CLASS,
    reason: source,
  };
};

export const classMeetsOn = (args) => classifySchoolDay(args).status === MEETING_STATUS.MEETS;

/**
 * The next `count` dates this class sits, starting the day AFTER `fromDateKey`.
 *
 * Returns what it found rather than throwing: a run that hits the end of the
 * lookahead window reports `exhausted`, and any date it could not resolve is
 * listed in `undetermined` so the caller can say why a deadline is provisional.
 */
export const nextClassMeetings = ({
  schedule = null,
  classPeriod = null,
  fromDateKey = null,
  count = 1,
  nonInstructionalKeys = null,
  maxLookaheadDays = 120,
} = {}) => {
  const wanted = Math.max(0, Math.trunc(Number(count) || 0));
  const empty = { meetings: [], undetermined: [], exhausted: false };
  if (!isDateKey(fromDateKey) || !classPeriod || wanted === 0) return empty;

  const meetings = [];
  const undetermined = [];
  let cursor = fromDateKey;

  for (let step = 0; step < Math.max(1, maxLookaheadDays) && meetings.length < wanted; step += 1) {
    cursor = shiftDateKey(cursor, 1);
    if (!cursor) break;
    const day = classifySchoolDay({ schedule, classPeriod, dateKey: cursor, nonInstructionalKeys });
    if (day.status === MEETING_STATUS.MEETS) meetings.push(cursor);
    // An undesignated date is skipped, never spent. Skipping can only move the
    // deadline later, so uncertainty never costs the student a day.
    else if (day.status === MEETING_STATUS.UNDETERMINED) undetermined.push(cursor);
  }

  return { meetings, undetermined, exhausted: meetings.length < wanted };
};

/** Local end-of-day, matching how a date-only due date is already parsed. */
export const endOfLocalDay = (dateKey) => {
  const match = String(dateKey || '').match(KEY);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
};

export const localDateKeyOf = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Move a due date forward by whole class meetings.
 *
 * The new deadline is the end of the Nth day this class actually sits after the
 * original one. `resolved` is false when an undesignated date sat in the way,
 * which is a prompt to the teacher rather than a failure: the returned date is
 * still safe to use because it can only be too late, never too early.
 */
export const extendDueByClassMeetings = ({
  schedule = null,
  classPeriod = null,
  dueAt = null,
  classMeetings = 0,
  nonInstructionalKeys = null,
} = {}) => {
  const fromDateKey = localDateKeyOf(dueAt);
  const wanted = Math.max(0, Math.trunc(Number(classMeetings) || 0));
  const unchanged = {
    dueAt: dueAt || null,
    dateKey: fromDateKey,
    meetingsGranted: 0,
    meetingsRequested: wanted,
    undetermined: [],
    resolved: true,
    exhausted: false,
  };
  if (!fromDateKey || !classPeriod || wanted === 0) return unchanged;

  const found = nextClassMeetings({
    schedule, classPeriod, fromDateKey, count: wanted, nonInstructionalKeys,
  });
  if (!found.meetings.length) {
    return { ...unchanged, undetermined: found.undetermined, resolved: !found.undetermined.length, exhausted: true };
  }

  const landing = found.meetings[found.meetings.length - 1];
  return {
    dueAt: endOfLocalDay(landing),
    dateKey: landing,
    meetingsGranted: found.meetings.length,
    meetingsRequested: wanted,
    undetermined: found.undetermined,
    resolved: found.undetermined.length === 0,
    exhausted: found.exhausted,
  };
};

export default classifySchoolDay;
