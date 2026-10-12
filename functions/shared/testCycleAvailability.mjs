/*
 * WHEN A TEST CYCLE IS OPEN — CLASS TIME FOR THE TEST, HOME FOR WHAT FOLLOWS.
 *
 * `assessmentAvailability.mjs` answers "is this assessment open to students at
 * all?" (archived, paused, not released yet). This answers the next question:
 * WHEN may a student sit each secure part?
 *
 *   The original Test    during the student's own class period on the day the
 *                        teacher set, read from the bell schedule the platform
 *                        already stores (`settings/classSchedule`). Nobody
 *                        re-enters a class time.
 *   Corrections, Retest  from home, from the moment that Test window closes
 *                        until the assignment's final (late) due date.
 *
 * THIS IS AVAILABILITY, NOT A TIMER. A window says when an attempt may START.
 * It never puts a clock on the attempt: a Test is untimed unless its blueprint
 * sets a time limit (secureExam.timeLimitSecondsOf), and a student who started
 * inside the window may finish after it closes.
 *
 * NOTHING CHANGES UNTIL A TEACHER SETS A DAY. A Test Cycle with no window for a
 * class is `unset`: it behaves exactly as it did before this module existed,
 * and both screens say that no class-time window is set. That is what keeps a
 * cycle already under way from closing on students the day this ships.
 *
 * WHERE EACH PIECE IS STORED, AND WHY.
 *   assignment.testAvailability   the class windows, the teacher's policy and
 *                                 the home-window close. A class's period is
 *                                 not private, and every student in the class
 *                                 needs it.
 *   record.availability           ONE student's reopened Test window or
 *                                 extended home window. It lives on that
 *                                 student's own server-only Test Cycle record:
 *                                 the shared assignment document is readable
 *                                 by every signed-in student, and who was given
 *                                 extra time is nobody else's business.
 *
 * A CLASS-PERIOD WINDOW IS RESOLVED LIVE, NOT COPIED. What is stored is the day
 * and that it follows the bell schedule; the times are read from the schedule
 * each time, so a modified schedule entered that morning (a pep rally, a late
 * start) moves the window with it, and a Friday whose A/B day is designated
 * that morning resolves when it is. A window a teacher typed by hand (an
 * extension, a reopen) is stored as the two instants they chose.
 *
 * Pure by construction: no Firestore, no network, no clock of its own.
 */

import { resolvePeriodWindow, resolveScheduleDayType } from './classSchedule.mjs';
import { parseInstant, zonedDateKey, zonedInstant } from './instructionalCalendar.mjs';

export const TEST_AVAILABILITY_VERSION = 1;

/** How the original Test is opened. `alwaysOpen` is an explicit teacher choice. */
export const TEST_AVAILABILITY_POLICY = Object.freeze({
  CLASS_TIME: 'classTime',
  ALWAYS_OPEN: 'alwaysOpen',
});

export const TEST_WINDOW_MODE = Object.freeze({
  CLASS_PERIOD: 'classPeriod',
  CUSTOM: 'custom',
});

export const WINDOW_STATE = Object.freeze({
  /** No window has been set for this student's class: nothing is enforced. */
  UNSET: 'unset',
  /** The teacher chose to open the Test at any time. */
  ALWAYS_OPEN: 'alwaysOpen',
  UPCOMING: 'upcoming',
  OPEN: 'open',
  CLOSED: 'closed',
});

/** How the home (Corrections and Retest) window ends. */
export const FOLLOW_UP_CLOSE = Object.freeze({
  /** The assignment's final late due date, or its due date when there is none. */
  LATE_DUE: 'lateDue',
  /** An instant the teacher chose (an extension or a reopen). */
  CUSTOM: 'custom',
  /** The teacher removed the expiry. */
  NONE: 'none',
});

export const MAX_WINDOWS_PER_CLASS = 8;
export const MAX_WINDOWS_PER_STUDENT = 8;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const instant = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const isDateKey = (value) => DATE_KEY.test(clean(value));

/** Noon on a school day, in the school's zone: an instant safely inside that date. */
const noonOf = (dateKey, timeZone) => {
  const [year, month, day] = clean(dateKey).split('-').map(Number);
  return zonedInstant({ year, month, day, hour: 12 }, timeZone);
};

const endOfDay = (dateKey, timeZone) => {
  const [year, month, day] = clean(dateKey).split('-').map(Number);
  return zonedInstant({ year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }, timeZone);
};

const shiftDateKey = (dateKey, days) => {
  const [year, month, day] = clean(dateKey).split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day) + Math.trunc(days) * DAY_MS);
  const pad = (value) => String(value).padStart(2, '0');
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
};

const normalizeWindow = (raw) => {
  if (!isObject(raw)) return null;
  const id = clean(raw.id).slice(0, 60);
  if (clean(raw.mode) === TEST_WINDOW_MODE.CUSTOM) {
    const opensAt = instant(raw.opensAt);
    const closesAt = instant(raw.closesAt);
    if (opensAt === null || closesAt === null || closesAt <= opensAt) return null;
    return {
      id: id || `custom-${opensAt}`,
      mode: TEST_WINDOW_MODE.CUSTOM,
      opensAt,
      closesAt,
      ...(clean(raw.reason) ? { reason: clean(raw.reason).slice(0, 200) } : {}),
      ...(clean(raw.by) ? { by: clean(raw.by).slice(0, 160) } : {}),
      ...(instant(raw.at) ? { at: instant(raw.at) } : {}),
    };
  }
  if (!isDateKey(raw.dateKey)) return null;
  const closesAtOverride = instant(raw.closesAtOverride);
  return {
    id: id || `day-${clean(raw.dateKey)}`,
    mode: TEST_WINDOW_MODE.CLASS_PERIOD,
    dateKey: clean(raw.dateKey),
    // An extension of this day's window, past the bell. Null means "the bell".
    ...(closesAtOverride !== null ? { closesAtOverride } : {}),
    ...(clean(raw.by) ? { by: clean(raw.by).slice(0, 160) } : {}),
    ...(instant(raw.at) ? { at: instant(raw.at) } : {}),
  };
};

const normalizeWindowList = (value, limit) => {
  const seen = new Set();
  return list(value).map(normalizeWindow).filter((window) => {
    if (!window || seen.has(window.id)) return false;
    seen.add(window.id);
    return true;
  }).slice(-limit);
};

/**
 * The stored assignment-level availability, with every gap filled.
 *
 * Always returns an object; `configured` says whether a teacher has set
 * anything at all. An assignment that was never touched normalizes to
 * "class time, no windows", which resolves to `unset` for every class.
 */
export const normalizeTestAvailability = (raw) => {
  const source = isObject(raw) ? raw : {};
  const classWindows = {};
  Object.entries(isObject(source.classWindows) ? source.classWindows : {}).forEach(([classId, windows]) => {
    const id = clean(classId);
    const normalized = normalizeWindowList(windows, MAX_WINDOWS_PER_CLASS);
    if (id && normalized.length) classWindows[id] = normalized;
  });
  const followUpSource = isObject(source.followUp) ? source.followUp : {};
  const followUpMode = Object.values(FOLLOW_UP_CLOSE).includes(clean(followUpSource.mode))
    ? clean(followUpSource.mode)
    : FOLLOW_UP_CLOSE.LATE_DUE;
  const followUpClosesAt = followUpMode === FOLLOW_UP_CLOSE.CUSTOM ? instant(followUpSource.closesAt) : null;
  const policy = clean(source.policy) === TEST_AVAILABILITY_POLICY.ALWAYS_OPEN
    ? TEST_AVAILABILITY_POLICY.ALWAYS_OPEN
    : TEST_AVAILABILITY_POLICY.CLASS_TIME;
  const followUpTouched = followUpMode === FOLLOW_UP_CLOSE.NONE
    || (followUpMode === FOLLOW_UP_CLOSE.CUSTOM && followUpClosesAt !== null);
  return {
    version: TEST_AVAILABILITY_VERSION,
    policy,
    classWindows,
    followUp: {
      // A custom mode with no usable instant falls back to the default rule.
      mode: followUpMode === FOLLOW_UP_CLOSE.CUSTOM && followUpClosesAt === null ? FOLLOW_UP_CLOSE.LATE_DUE : followUpMode,
      closesAt: followUpClosesAt,
    },
    configured: policy === TEST_AVAILABILITY_POLICY.ALWAYS_OPEN
      || Object.keys(classWindows).length > 0
      || followUpTouched,
  };
};

/** One student's own windows, from their Test Cycle record. */
export const normalizeStudentAvailability = (raw) => {
  const source = isObject(raw) ? raw : {};
  return {
    testWindows: normalizeWindowList(
      list(source.testWindows).map((window) => ({ ...window, mode: TEST_WINDOW_MODE.CUSTOM })),
      MAX_WINDOWS_PER_STUDENT,
    ),
    followUpClosesAt: instant(source.followUpClosesAt),
  };
};

/**
 * One class-period day, read from the bell schedule.
 *
 * `resolved: false` with `pending: true` means the day cannot be known yet (a
 * Friday whose A/B day is not designated): it is not open, and it is not over.
 * `resolved: false` without `pending` means the class does not sit that day.
 */
export const resolveClassPeriodDay = ({ schedule = null, classPeriod = null, dateKey = null, timeZone = null } = {}) => {
  if (!isDateKey(dateKey) || !clean(classPeriod)) {
    return { resolved: false, pending: false, reason: 'incomplete', dateKey: clean(dateKey) || null };
  }
  const at = noonOf(dateKey, timeZone);
  const window = resolvePeriodWindow({ schedule, classPeriod, nowValue: at, timeZone });
  if (window) {
    return {
      resolved: true,
      pending: false,
      dateKey: clean(dateKey),
      opensAt: window.startMs,
      closesAt: window.endMs,
      period: classPeriod,
      dayType: window.dayType || null,
      modifiedSchedule: window.modified === true,
    };
  }
  const weekday = new Date(`${clean(dateKey)}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return { resolved: false, pending: false, reason: 'weekend', dateKey: clean(dateKey) };
  }
  const modified = Boolean(schedule?.modifiedSchedules?.[clean(dateKey)]?.periods);
  const dayType = resolveScheduleDayType(schedule, at, timeZone);
  if (!modified && !dayType.dayType) {
    return { resolved: false, pending: true, reason: 'dayTypeNotSet', dateKey: clean(dateKey) };
  }
  return { resolved: false, pending: false, reason: 'noClassThatDay', dateKey: clean(dateKey), dayType: dayType.dayType || null };
};

/**
 * The next days this class sits, with their exact times — what a teacher is
 * offered when choosing the Test day, so they pick a day rather than type one.
 */
export const upcomingClassPeriodDays = ({
  schedule = null,
  classPeriod = null,
  fromDateKey = null,
  count = 5,
  timeZone = null,
  maxLookaheadDays = 45,
} = {}) => {
  const days = [];
  const pending = [];
  if (!isDateKey(fromDateKey) || !clean(classPeriod)) return { days, pending };
  let cursor = clean(fromDateKey);
  for (let step = 0; step < maxLookaheadDays && days.length < count; step += 1) {
    const day = resolveClassPeriodDay({ schedule, classPeriod, dateKey: cursor, timeZone });
    if (day.resolved) days.push(day);
    else if (day.pending) pending.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return { days, pending };
};

/**
 * A class's stored windows as concrete instants.
 *
 * A class-period window that the schedule cannot resolve stays in the list as
 * `pending` (it may still resolve) or `unresolved` (the class does not sit that
 * day any more): the teacher is told, and the server treats neither as open.
 */
export const resolveClassWindows = ({
  availability = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  timeZone = null,
} = {}) => {
  const normalized = normalizeTestAvailability(availability);
  return list(normalized.classWindows[clean(classId)]).map((window) => {
    if (window.mode === TEST_WINDOW_MODE.CUSTOM) {
      return { id: window.id, source: 'teacher', opensAt: window.opensAt, closesAt: window.closesAt, resolved: true, pending: false };
    }
    const day = resolveClassPeriodDay({ schedule, classPeriod, dateKey: window.dateKey, timeZone });
    if (!day.resolved) {
      return {
        id: window.id,
        source: 'bellSchedule',
        dateKey: window.dateKey,
        resolved: false,
        pending: day.pending,
        reason: day.reason,
        // Until it resolves, the day is known to end by its own midnight.
        opensAt: null,
        closesAt: endOfDay(window.dateKey, timeZone),
      };
    }
    const extended = Number(window.closesAtOverride) > day.closesAt;
    return {
      id: window.id,
      source: 'bellSchedule',
      dateKey: window.dateKey,
      period: day.period,
      dayType: day.dayType,
      resolved: true,
      pending: false,
      opensAt: day.opensAt,
      closesAt: extended ? window.closesAtOverride : day.closesAt,
      scheduledClosesAt: day.closesAt,
      extended,
    };
  });
};

const studentWindowsOf = (studentAvailability) => normalizeStudentAvailability(studentAvailability).testWindows
  .map((window) => ({ id: window.id, source: 'studentOverride', opensAt: window.opensAt, closesAt: window.closesAt, resolved: true, pending: false }));

/**
 * Is the ORIGINAL Test open to this student right now?
 *
 * `classWindows` is `resolveClassWindows`' result for the student's class;
 * `studentAvailability` is their record's own reopen, if any. A student's own
 * window is honoured even when their class has none (an individually added
 * student, or a make-up the teacher arranged).
 */
export const resolveTestWindowStatus = ({
  availability = null,
  classWindows = [],
  studentAvailability = null,
  now = Date.now(),
} = {}) => {
  const normalized = normalizeTestAvailability(availability);
  const at = Number(now);
  const own = studentWindowsOf(studentAvailability);
  const windows = [...list(classWindows), ...own];

  if (normalized.policy === TEST_AVAILABILITY_POLICY.ALWAYS_OPEN) {
    return { state: WINDOW_STATE.ALWAYS_OPEN, enforced: false, opensAt: null, closesAt: null, windows, workFromHome: true };
  }
  if (!windows.length) {
    return { state: WINDOW_STATE.UNSET, enforced: false, opensAt: null, closesAt: null, windows, workFromHome: true };
  }

  const open = windows.filter((window) => window.resolved && window.opensAt <= at && at < window.closesAt);
  if (open.length) {
    const closesAt = Math.max(...open.map((window) => window.closesAt));
    const current = open.find((window) => window.closesAt === closesAt);
    return {
      state: WINDOW_STATE.OPEN,
      enforced: true,
      opensAt: Math.min(...open.map((window) => window.opensAt)),
      closesAt,
      source: current.source,
      windows,
      // A class period is in the room. A window the teacher set by hand, or
      // opened for one student, is whatever the teacher arranged.
      workFromHome: current.source !== 'bellSchedule',
    };
  }

  const upcoming = windows
    .filter((window) => (window.resolved ? window.opensAt > at : window.closesAt > at))
    .sort((left, right) => (left.opensAt ?? left.closesAt) - (right.opensAt ?? right.closesAt));
  if (upcoming.length) {
    const next = upcoming[0];
    return {
      state: WINDOW_STATE.UPCOMING,
      enforced: true,
      opensAt: next.resolved ? next.opensAt : null,
      closesAt: next.resolved ? next.closesAt : null,
      // The day is set but the bell schedule has not said when (or whether).
      pending: !next.resolved,
      pendingReason: next.resolved ? null : next.reason,
      dateKey: next.dateKey || null,
      source: next.source,
      windows,
      workFromHome: next.source !== 'bellSchedule',
    };
  }

  return {
    state: WINDOW_STATE.CLOSED,
    enforced: true,
    opensAt: null,
    closesAt: Math.max(...windows.map((window) => window.closesAt)),
    windows,
    workFromHome: false,
  };
};

/** The assignment's own final close: the late due date, else the due date. */
export const defaultFollowUpClose = (assignment = null, timeZone = null) => {
  if (!isObject(assignment)) return null;
  const late = parseInstant(assignment.lateDueAt, { endOfDay: true, timeZone });
  if (late !== null) return late;
  return parseInstant(assignment.dueAt || assignment.dueDate, { endOfDay: true, timeZone });
};

/**
 * The home window: Corrections and the Retest.
 *
 * It opens when the student's Test window closes and ends at the late due date
 * unless a teacher extended it (for the class on the assignment, for one
 * student on their record) or removed the expiry. While the Test itself has no
 * window (`unset`, or the teacher chose `alwaysOpen`), nothing is enforced
 * here either — unless a teacher has set a close by hand, which is honoured.
 */
export const resolveFollowUpWindow = ({
  assignment = null,
  availability = null,
  studentAvailability = null,
  testStatus = null,
  now = Date.now(),
  timeZone = null,
} = {}) => {
  const normalized = normalizeTestAvailability(availability);
  const own = normalizeStudentAvailability(studentAvailability);
  const at = Number(now);
  const testEnforced = testStatus?.enforced === true;
  const handSet = normalized.followUp.mode !== FOLLOW_UP_CLOSE.LATE_DUE || own.followUpClosesAt !== null;

  if (!testEnforced && !handSet) {
    return { state: WINDOW_STATE.UNSET, enforced: false, opensAt: null, closesAt: null, closeSource: null, workFromHome: true };
  }

  let closesAt = null;
  let closeSource = FOLLOW_UP_CLOSE.NONE;
  if (normalized.followUp.mode === FOLLOW_UP_CLOSE.CUSTOM) {
    closesAt = normalized.followUp.closesAt;
    closeSource = FOLLOW_UP_CLOSE.CUSTOM;
  } else if (normalized.followUp.mode === FOLLOW_UP_CLOSE.LATE_DUE) {
    closesAt = defaultFollowUpClose(assignment, timeZone);
    closeSource = closesAt === null ? FOLLOW_UP_CLOSE.NONE : FOLLOW_UP_CLOSE.LATE_DUE;
  }
  // One student's extension only ever gives more time than the class has.
  if (own.followUpClosesAt !== null && (closesAt === null ? closeSource !== FOLLOW_UP_CLOSE.NONE : own.followUpClosesAt > closesAt)) {
    closesAt = own.followUpClosesAt;
    closeSource = 'studentOverride';
  }

  const opensAt = testEnforced && testStatus.state === WINDOW_STATE.CLOSED ? testStatus.closesAt : null;
  const waitingOnTest = testEnforced && testStatus.state !== WINDOW_STATE.CLOSED;
  let state = WINDOW_STATE.OPEN;
  if (waitingOnTest) state = WINDOW_STATE.UPCOMING;
  else if (closesAt !== null && at >= closesAt) state = WINDOW_STATE.CLOSED;

  return {
    state,
    enforced: true,
    // Null while the Test window is still to come or under way: it opens when
    // that closes, and the Test's own close time is on the same card.
    opensAt,
    closesAt,
    closeSource,
    workFromHome: true,
  };
};

/**
 * Everything one student's card and the server's gate need, in one call.
 */
export const resolveStudentTestCycleSchedule = ({
  assignment = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  studentAvailability = null,
  now = Date.now(),
  timeZone = null,
} = {}) => {
  const availability = isObject(assignment) ? assignment.testAvailability : null;
  const classWindows = resolveClassWindows({ availability, classId, classPeriod, schedule, timeZone });
  const test = resolveTestWindowStatus({ availability, classWindows, studentAvailability, now });
  const followUp = resolveFollowUpWindow({ assignment, availability, studentAvailability, testStatus: test, now, timeZone });
  return { test, followUp, timeZone: timeZone || null };
};

/*
 * THE TIMES, IN WORDS, IN THE SCHOOL'S ZONE.
 *
 * A student at home on a phone set to another zone, and a teacher travelling,
 * are both told the school's wall-clock time with its zone named — the time on
 * the classroom wall is the one everybody means.
 */
const formatter = (timeZone, options) => new Intl.DateTimeFormat('en-US', { ...(timeZone ? { timeZone } : {}), ...options });

export const formatSchoolDateTime = (value, timeZone = null) => {
  const at = instant(value);
  if (at === null) return null;
  return formatter(timeZone, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(at));
};

export const formatSchoolTime = (value, timeZone = null) => {
  const at = instant(value);
  if (at === null) return null;
  return formatter(timeZone, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(at));
};

export const formatSchoolDate = (dateKey, timeZone = null) => {
  if (!isDateKey(dateKey)) return null;
  return formatter(timeZone, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(noonOf(dateKey, timeZone)));
};

const sameSchoolDay = (left, right, timeZone) => zonedDateKey(left, timeZone) === zonedDateKey(right, timeZone);

/** "Tue, Oct 13, 10:15 AM CDT – 11:05 AM CDT", or both dates when they differ. */
export const formatSchoolRange = (opensAt, closesAt, timeZone = null) => {
  if (instant(opensAt) === null || instant(closesAt) === null) return null;
  return sameSchoolDay(opensAt, closesAt, timeZone)
    ? `${formatSchoolDateTime(opensAt, timeZone)} – ${formatSchoolTime(closesAt, timeZone)}`
    : `${formatSchoolDateTime(opensAt, timeZone)} – ${formatSchoolDateTime(closesAt, timeZone)}`;
};

const PENDING_REASON = Object.freeze({
  dayTypeNotSet: 'the A/B day for that date has not been set yet',
  noClassThatDay: 'the bell schedule has no period for this class on that date',
  weekend: 'that date is a weekend',
  incomplete: 'this class has no period on the bell schedule',
});

/**
 * The original Test's window, as the two sentences both screens show: when it
 * opens and closes, and whether it may be taken from home.
 */
export const describeTestWindow = (status, { timeZone = null, audience = 'student' } = {}) => {
  const state = status?.state || WINDOW_STATE.UNSET;
  const whose = audience === 'teacher' ? 'Students' : 'You';
  if (state === WINDOW_STATE.UNSET) {
    return {
      state,
      headline: 'No class-time window is set',
      detail: audience === 'teacher'
        ? 'The Test can be started whenever its secure session is open. Set the Test day to limit it to class time.'
        : 'Your teacher has not set a class-time window for this Test.',
      home: null,
    };
  }
  if (state === WINDOW_STATE.ALWAYS_OPEN) {
    return {
      state,
      headline: 'Open at any time',
      detail: audience === 'teacher'
        ? 'You chose to open this Test at any time, not only in class.'
        : 'Your teacher has opened this Test at any time.',
      home: `${whose} may take the Test from home.`,
    };
  }
  const home = status.workFromHome
    ? `${whose} may take the Test from home during this window.`
    : `The Test is taken in class. ${whose} cannot start it from home.`;
  if (state === WINDOW_STATE.OPEN) {
    return {
      state,
      headline: `Open now until ${formatSchoolDateTime(status.closesAt, timeZone)}`,
      detail: `Opened ${formatSchoolDateTime(status.opensAt, timeZone)}. A Test started before it closes can be finished.`,
      home,
    };
  }
  if (state === WINDOW_STATE.UPCOMING) {
    if (status.pending) {
      return {
        state,
        headline: `Set for ${formatSchoolDate(status.dateKey, timeZone) || 'a later day'}`,
        detail: `The exact times will appear once the bell schedule has them: ${PENDING_REASON[status.pendingReason] || 'the schedule has no times for that date yet'}.`,
        home,
      };
    }
    return {
      state,
      headline: `Opens ${formatSchoolDateTime(status.opensAt, timeZone)}`,
      detail: `Open ${formatSchoolRange(status.opensAt, status.closesAt, timeZone)}.`,
      home,
    };
  }
  return {
    state,
    headline: `Closed ${formatSchoolDateTime(status.closesAt, timeZone)}`,
    detail: audience === 'teacher'
      ? 'Students who started before it closed can finish. Reopen or extend it for a class or a student.'
      : 'The Test window has closed. If you started your Test before it closed, you can finish it.',
    home: null,
  };
};

/**
 * The home window for Corrections and the Retest, in the same two sentences.
 *
 * `retestOnly`: for a student who missed the Test, who has a Retest and no
 * Corrections — they are not told they may do Corrections that do not exist.
 */
export const describeFollowUpWindow = (followUp, { timeZone = null, audience = 'student', retestOnly = false } = {}) => {
  const state = followUp?.state || WINDOW_STATE.UNSET;
  const whose = audience === 'teacher' ? 'Students' : 'You';
  const closes = followUp?.closesAt ? formatSchoolDateTime(followUp.closesAt, timeZone) : null;
  const closeWhy = followUp?.closeSource === FOLLOW_UP_CLOSE.LATE_DUE
    ? ' (the assignment\'s final due date)'
    : followUp?.closeSource === 'studentOverride' ? ' (extended for this student)' : '';
  const home = retestOnly
    ? `${whose} may take the Retest from home.`
    : `${whose} may do Corrections and the Retest from home.`;
  if (state === WINDOW_STATE.UNSET) {
    return {
      state,
      headline: 'No closing time is set',
      detail: retestOnly
        ? `The Retest stays open until ${audience === 'teacher' ? 'you close' : 'your teacher closes'} it.`
        : `Corrections and the Retest stay open until ${audience === 'teacher' ? 'you close' : 'your teacher closes'} them.`,
      home,
    };
  }
  if (state === WINDOW_STATE.UPCOMING) {
    return {
      state,
      headline: 'Opens when the Test window closes',
      detail: closes ? `Then open until ${closes}${closeWhy}.` : 'Then open with no closing time.',
      home,
    };
  }
  if (state === WINDOW_STATE.OPEN) {
    return {
      state,
      headline: closes ? `Open now until ${closes}` : 'Open now, with no closing time',
      detail: closes
        ? `Closes ${closes}${closeWhy}. A Retest started before then can be finished.`
        : 'Stays open until it is closed by the teacher.',
      home,
    };
  }
  return {
    state,
    headline: `Closed ${closes}`,
    detail: audience === 'teacher'
      ? `It ended ${closes}${closeWhy}. Extend or reopen it for the class or for a student.`
      : retestOnly
        ? 'The time to take the Retest has ended. Ask your teacher if you need it reopened.'
        : 'The time to do Corrections and the Retest has ended. Ask your teacher if you need it reopened.',
    home: null,
  };
};

/**
 * What the server says when it refuses to START something outside its window.
 * The same words the card shows, so a refusal is never a surprise.
 */
export const testWindowRefusal = (status, { timeZone = null } = {}) => {
  if (!status?.enforced) return null;
  if (status.state === WINDOW_STATE.OPEN) return null;
  if (status.state === WINDOW_STATE.UPCOMING) {
    return status.pending
      ? `This Test is set for ${formatSchoolDate(status.dateKey, timeZone) || 'a later day'}. It opens during your class period.`
      : `This Test opens ${formatSchoolDateTime(status.opensAt, timeZone)}, during your class period.`;
  }
  return `The Test window closed ${formatSchoolDateTime(status.closesAt, timeZone)}.`;
};

export const followUpRefusal = (followUp, { timeZone = null, what = 'This', plural = false } = {}) => {
  if (!followUp?.enforced || followUp.state === WINDOW_STATE.OPEN) return null;
  if (followUp.state === WINDOW_STATE.UPCOMING) return `${what} ${plural ? 'open' : 'opens'} when the Test window closes.`;
  return `${what} closed ${formatSchoolDateTime(followUp.closesAt, timeZone)}. Ask your teacher if you need ${plural ? 'them' : 'it'} reopened.`;
};

/*
 * THE TEACHER'S CHANGES, AS PURE EDITS OF THE STORED VALUE.
 *
 * Each returns the next `testAvailability` to store. The callable validates
 * who may make the change and what the bell schedule says; these only shape
 * the document, so the shape is tested without a database.
 */
const storedShape = (normalized) => ({
  version: TEST_AVAILABILITY_VERSION,
  policy: normalized.policy,
  classWindows: normalized.classWindows,
  followUp: normalized.followUp,
});

/** Set (or move) the Test day for a class: one class-period window on `dateKey`. */
export const withClassTestDay = (raw, { classId, dateKey, by = null, at = null, replace = true } = {}) => {
  const normalized = normalizeTestAvailability(raw);
  const id = clean(classId);
  if (!id || !isDateKey(dateKey)) throw new Error('A class and a YYYY-MM-DD date are required.');
  const window = normalizeWindow({ id: `day-${clean(dateKey)}`, mode: TEST_WINDOW_MODE.CLASS_PERIOD, dateKey, by, at });
  const existing = replace ? [] : list(normalized.classWindows[id]).filter((entry) => entry.id !== window.id);
  return storedShape({
    ...normalized,
    policy: TEST_AVAILABILITY_POLICY.CLASS_TIME,
    classWindows: { ...normalized.classWindows, [id]: [...existing, window].slice(-MAX_WINDOWS_PER_CLASS) },
  });
};

/** Keep a class's window open past the bell, until `closesAt`. */
export const withClassWindowExtended = (raw, { classId, windowId, closesAt, by = null, at = null } = {}) => {
  const normalized = normalizeTestAvailability(raw);
  const id = clean(classId);
  const until = instant(closesAt);
  const windows = list(normalized.classWindows[id]);
  const target = windows.find((window) => window.id === clean(windowId));
  if (!target || until === null) throw new Error('That Test window was not found.');
  const next = target.mode === TEST_WINDOW_MODE.CUSTOM
    ? { ...target, closesAt: until, by, at }
    : { ...target, closesAtOverride: until, by, at };
  const cleaned = normalizeWindow(next);
  if (!cleaned) throw new Error('The new closing time must be after the window opens.');
  return storedShape({
    ...normalized,
    classWindows: { ...normalized.classWindows, [id]: windows.map((window) => (window.id === target.id ? cleaned : window)) },
  });
};

/** Add a window the teacher typed by hand: a reopen for the whole class. */
export const withClassCustomWindow = (raw, { classId, opensAt, closesAt, reason = '', by = null, at = null } = {}) => {
  const normalized = normalizeTestAvailability(raw);
  const id = clean(classId);
  const window = normalizeWindow({ id: `custom-${instant(opensAt)}`, mode: TEST_WINDOW_MODE.CUSTOM, opensAt, closesAt, reason, by, at });
  if (!id || !window) throw new Error('A class, an opening time and a later closing time are required.');
  const existing = list(normalized.classWindows[id]).filter((entry) => entry.id !== window.id);
  return storedShape({
    ...normalized,
    policy: TEST_AVAILABILITY_POLICY.CLASS_TIME,
    classWindows: { ...normalized.classWindows, [id]: [...existing, window].slice(-MAX_WINDOWS_PER_CLASS) },
  });
};

/** Remove every window for a class: it goes back to "no class-time window". */
export const withoutClassWindows = (raw, { classId } = {}) => {
  const normalized = normalizeTestAvailability(raw);
  const { [clean(classId)]: _removed, ...rest } = normalized.classWindows;
  return storedShape({ ...normalized, classWindows: rest });
};

export const withTestPolicy = (raw, { policy } = {}) => {
  const normalized = normalizeTestAvailability(raw);
  if (!Object.values(TEST_AVAILABILITY_POLICY).includes(clean(policy))) throw new Error('Choose class time or open at any time.');
  return storedShape({ ...normalized, policy: clean(policy) });
};

export const withFollowUpClose = (raw, { mode, closesAt = null } = {}) => {
  const normalized = normalizeTestAvailability(raw);
  const wanted = clean(mode);
  if (!Object.values(FOLLOW_UP_CLOSE).includes(wanted)) throw new Error('Choose how the home window closes.');
  if (wanted === FOLLOW_UP_CLOSE.CUSTOM && instant(closesAt) === null) throw new Error('A closing time is required.');
  return storedShape({
    ...normalized,
    followUp: { mode: wanted, closesAt: wanted === FOLLOW_UP_CLOSE.CUSTOM ? instant(closesAt) : null },
  });
};

/** One student's reopened Test window, added to their record's availability. */
export const withStudentTestWindow = (raw, { opensAt, closesAt, reason = '', by = null, at = null } = {}) => {
  const current = normalizeStudentAvailability(raw);
  const window = normalizeWindow({ id: `custom-${instant(opensAt)}`, mode: TEST_WINDOW_MODE.CUSTOM, opensAt, closesAt, reason, by, at });
  if (!window) throw new Error('An opening time and a later closing time are required.');
  return {
    ...current,
    testWindows: [...current.testWindows.filter((entry) => entry.id !== window.id), window].slice(-MAX_WINDOWS_PER_STUDENT),
  };
};

export const withStudentFollowUpClose = (raw, { closesAt = null } = {}) => ({
  ...normalizeStudentAvailability(raw),
  followUpClosesAt: instant(closesAt),
});
