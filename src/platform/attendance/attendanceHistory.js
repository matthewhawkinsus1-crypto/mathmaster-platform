/*
 * ATTENDANCE HISTORY: THE ONE EFFECTIVE MARK, AND THE TRAIL BEHIND IT.
 *
 * Live Classroom's quick attendance (`liveAttendance.js`) already writes
 * append-only `studentSupportEvents` documents with `kind: 'liveAttendance'`
 * for present/absent/late, scoped to "today". That model has no room for the
 * excused/unexcused distinction the absence policy needs, and no way to
 * correct a PAST date.
 *
 * Rather than build a second attendance store, this module reads the SAME
 * `studentSupportEvents` stream and adds one more `kind`,
 * `attendanceHistory`, for teacher corrections to any date, with the fuller
 * mark vocabulary. Both kinds are merged here: for a given student/class/day,
 * whichever event has the latest timestamp — a live quick-mark or a later
 * history correction — is the effective mark. Older events are never edited
 * or deleted; they stay in the array as the audit trail.
 *
 * A live "Absent" quick-mark carries no excused/unexcused opinion. It is
 * never treated as unexcused — `absencePolicy.js`'s `ABSENT_UNCLASSIFIED`
 * mark is a real third state, not a stand-in for one of the other two: it
 * earns the deadline extension and counts for the return-to-class reminder
 * exactly like every other absence, but can never trigger an unexcused point
 * penalty until a teacher actually classifies it in Attendance History.
 */

import { ATTENDANCE_MARK } from './absencePolicy.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from '../teacher/liveAttendance.js';
import { MEETING_STATUS, classifySchoolDay, shiftDateKey } from './classMeetings.js';

export const ATTENDANCE_HISTORY_EVENT_KIND = 'attendanceHistory';

export const ATTENDANCE_HISTORY_MARK = Object.freeze({
  PRESENT: ATTENDANCE_MARK.PRESENT,
  LATE: 'late',
  EXCUSED: ATTENDANCE_MARK.EXCUSED,
  UNEXCUSED: ATTENDANCE_MARK.UNEXCUSED,
  ABSENT_UNCLASSIFIED: ATTENDANCE_MARK.ABSENT_UNCLASSIFIED,
});

// A teacher never explicitly picks ABSENT_UNCLASSIFIED in Attendance History
// (see AttendanceHistoryPanel.jsx's MARK_OPTIONS) — it only ever arrives from
// a live quick-mark, and stays a distinct state until a teacher classifies it.
const HISTORY_MARKS = new Set(Object.values(ATTENDANCE_HISTORY_MARK));
const ABSENT_HISTORY_MARKS = new Set([
  ATTENDANCE_HISTORY_MARK.EXCUSED, ATTENDANCE_HISTORY_MARK.UNEXCUSED, ATTENDANCE_HISTORY_MARK.ABSENT_UNCLASSIFIED,
]);

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const attendanceHistoryMarkIsAbsent = (mark) => ABSENT_HISTORY_MARKS.has(clean(mark).toLowerCase());

const eventTime = (event) => (
  toMillis(event?.evidence?.markedAt ?? event?.evidence?.correctedAt)
  ?? toMillis(event?.createdAt)
  ?? toMillis(event?.createdAtServer)
  ?? 0
);

const eventMatchesClass = (event, classId, classPeriod) => {
  if (classId) return String(event?.classId || '') === String(classId);
  if (classPeriod) return String(event?.classPeriod || '') === String(classPeriod);
  return true;
};

/**
 * One `studentSupportEvents` doc, whichever of the two attendance kinds it
 * is, normalized to a common shape. Anything else returns null.
 */
const normalizeAttendanceEvent = (event) => {
  const kind = clean(event?.kind);
  if (kind === LIVE_ATTENDANCE_EVENT_KIND) {
    const rawMark = clean(event?.evidence?.attendanceMark).toLowerCase();
    if (!rawMark) return null;
    // A bare live "absent" carries no excused/unexcused opinion yet — it is
    // its own real state, never assumed to be unexcused.
    const mark = rawMark === 'absent' ? ATTENDANCE_HISTORY_MARK.ABSENT_UNCLASSIFIED : rawMark;
    if (!HISTORY_MARKS.has(mark)) return null;
    return {
      mark,
      markSource: 'liveQuickMark',
      classified: rawMark !== 'absent',
      reason: null,
      at: eventTime(event),
      event,
    };
  }
  if (kind === ATTENDANCE_HISTORY_EVENT_KIND) {
    const mark = clean(event?.evidence?.mark).toLowerCase();
    if (!HISTORY_MARKS.has(mark)) return null;
    return {
      mark,
      markSource: 'historyCorrection',
      classified: true,
      reason: clean(event?.evidence?.reason) || null,
      at: eventTime(event),
      event,
    };
  }
  return null;
};

/**
 * Every recorded attendance action for one student on one class/day, newest
 * first — the audit trail a history screen shows, and the input to
 * `effectiveAttendanceForDay` below.
 */
export const attendanceEventsForStudentDay = ({
  supportEvents = [],
  studentId = null,
  classId = null,
  classPeriod = null,
  dateKey = null,
} = {}) => {
  const student = clean(studentId);
  const day = clean(dateKey);
  if (!student || !day) return [];
  return list(supportEvents)
    .filter((event) => clean(event?.studentId) === student)
    .filter((event) => clean(event?.evidence?.dateKey) === day)
    .filter((event) => eventMatchesClass(event, classId, classPeriod))
    .map(normalizeAttendanceEvent)
    .filter(Boolean)
    .sort((a, b) => b.at - a.at);
};

/**
 * The single mark that governs today for one student: the newest teacher
 * action wins, whichever kind it came from. `priorEvents` is every older
 * entry, for the "show prior correction history" panel.
 */
export const effectiveAttendanceForStudentDay = (args) => {
  const events = attendanceEventsForStudentDay(args);
  if (!events.length) return { mark: null, markSource: null, classified: false, reason: null, at: null, event: null, priorEvents: [] };
  const [effective, ...priorEvents] = events;
  return { ...effective, priorEvents };
};

/** The batch version of the above, across a whole class for one day. */
export const effectiveAttendanceForClassDay = ({
  supportEvents = [], classId = null, classPeriod = null, dateKey = null,
} = {}) => {
  const day = clean(dateKey);
  if (!day) return {};
  const latest = new Map();
  list(supportEvents)
    .filter((event) => clean(event?.evidence?.dateKey) === day)
    .filter((event) => eventMatchesClass(event, classId, classPeriod))
    .forEach((event) => {
      const studentId = clean(event?.studentId);
      const normalized = normalizeAttendanceEvent(event);
      if (!studentId || !normalized) return;
      const current = latest.get(studentId);
      if (current && current.at > normalized.at) return;
      latest.set(studentId, normalized);
    });
  return Object.fromEntries(latest.entries());
};

/**
 * Build the payload for a teacher's historical attendance correction. This
 * is an ADDITIVE event: the prior mark is recorded as audit context, never
 * overwritten or deleted.
 */
export const buildAttendanceHistoryEvent = ({
  student = null,
  mark,
  classId = null,
  classPeriod = null,
  dateKey,
  reason = '',
  actorEmail = null,
  nowValue = Date.now(),
  priorMark = null,
  priorMarkSource = null,
} = {}) => {
  const studentId = clean(student?.id || student?.studentId);
  const normalizedMark = clean(mark).toLowerCase();
  if (!studentId) throw new Error('An attendance correction needs a student id.');
  if (!clean(dateKey)) throw new Error('An attendance correction needs the instructional date it corrects.');
  if (!HISTORY_MARKS.has(normalizedMark)) {
    throw new Error(`Unsupported attendance mark: ${normalizedMark || 'blank'}`);
  }

  const studentName = clean(student?.displayName || student?.name || student?.studentName || studentId);
  const resolvedPeriod = clean(classPeriod || student?.classPeriod || student?.profile?.classPeriod) || null;
  const label = normalizedMark === ATTENDANCE_HISTORY_MARK.EXCUSED ? 'Excused absence'
    : normalizedMark === ATTENDANCE_HISTORY_MARK.UNEXCUSED ? 'Unexcused absence'
    : normalizedMark === ATTENDANCE_HISTORY_MARK.ABSENT_UNCLASSIFIED ? 'Absent (not yet classified)'
    : normalizedMark === ATTENDANCE_HISTORY_MARK.LATE ? 'Late' : 'Present';

  return {
    kind: ATTENDANCE_HISTORY_EVENT_KIND,
    stage: 'teacherConfirmed',
    studentId,
    studentName,
    classId: clean(classId) || null,
    classPeriod: resolvedPeriod,
    assignmentId: null,
    assignmentTitle: null,
    source: 'attendanceHistory',
    summary: `${label} for ${dateKey}${priorMark ? ` (was ${priorMark})` : ''}.`,
    note: clean(reason),
    // Top-level, alongside evidence.dateKey — see the identical comment in
    // liveAttendance.js's buildLiveAttendanceEvent.
    dateKey: clean(dateKey),
    evidence: {
      dateKey: clean(dateKey),
      mark: normalizedMark,
      priorMark: priorMark ? clean(priorMark).toLowerCase() : null,
      priorMarkSource: priorMarkSource || null,
      reason: clean(reason).slice(0, 500) || null,
      correctedByEmail: actorEmail ? clean(actorEmail).toLowerCase() : null,
      correctedAt: Number(nowValue),
      markedAt: Number(nowValue),
    },
  };
};

/**
 * The `marks` array `summarizeAssignmentAbsences` (absencePolicy.js) expects,
 * built for one student across a date range by walking the class calendar and
 * asking, for every day the class actually met, what the effective mark was.
 *
 * A day the class met with no recorded mark is `unmarked` — never inferred as
 * an absence. `late` and `present` both count as "not absent" for the policy,
 * matching how Live Classroom already treats them.
 */
export const attendanceMarksForStudentRange = ({
  supportEvents = [],
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  fromDateKey = null,
  toDateKey = null,
  nonInstructionalKeys = null,
} = {}) => {
  if (!clean(fromDateKey) || !clean(toDateKey) || !classPeriod) return [];
  const marks = [];
  let cursor = fromDateKey;
  let guard = 0;
  while (cursor && cursor <= toDateKey && guard < 400) {
    guard += 1;
    const day = classifySchoolDay({ schedule, classPeriod, dateKey: cursor, nonInstructionalKeys });
    const classMet = day.status === MEETING_STATUS.MEETS;
    if (classMet) {
      const effective = effectiveAttendanceForStudentDay({
        supportEvents, studentId, classId, classPeriod, dateKey: cursor,
      });
      const mark = effective.mark && effective.mark !== ATTENDANCE_HISTORY_MARK.LATE
        ? effective.mark
        : effective.mark
          ? ATTENDANCE_MARK.PRESENT
          : ATTENDANCE_MARK.UNMARKED;
      marks.push({ dateKey: cursor, mark, classMet: true });
    }
    cursor = shiftDateKey(cursor, 1);
  }
  return marks;
};

export default effectiveAttendanceForStudentDay;
