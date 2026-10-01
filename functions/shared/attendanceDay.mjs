/*
 * THE ONE EFFECTIVE ATTENDANCE MARK FOR A STUDENT'S DAY — SHARED.
 *
 * Moved here from src/platform/attendance/attendanceHistory.js, which
 * re-exports it unchanged. Practice-based Recovery has to tell an excused
 * absence (full-credit make-up) from an ordinary missed Warm-Up or DOL
 * (capped recovery), and that decision is made by the SERVER when it records a
 * recovery grade — students cannot read attendance at all. One definition of
 * "which mark governs this day", for the teacher's screens and for the server,
 * so the two can never disagree about whether an absence was excused.
 *
 * Both attendance kinds in `studentSupportEvents` are merged: a Live Classroom
 * quick-mark (`liveAttendance`) and a teacher's history correction
 * (`attendanceHistory`). For one student/class/day the newest event wins.
 * A bare live "absent" is its own unclassified state, never assumed to be
 * excused or unexcused.
 *
 * Pure: no Firestore, no clock.
 */

export const ATTENDANCE_HISTORY_EVENT_KIND = 'attendanceHistory';
export const LIVE_ATTENDANCE_EVENT_KIND = 'liveAttendance';

export const ATTENDANCE_DAY_MARK = Object.freeze({
  PRESENT: 'present',
  LATE: 'late',
  EXCUSED: 'excused',
  UNEXCUSED: 'unexcused',
  ABSENT_UNCLASSIFIED: 'absent',
});

const DAY_MARKS = new Set(Object.values(ATTENDANCE_DAY_MARK));

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

const eventTime = (event) => (
  toMillis(event?.evidence?.markedAt ?? event?.evidence?.correctedAt)
  ?? toMillis(event?.createdAt)
  ?? toMillis(event?.createdAtServer)
  ?? 0
);

export const eventMatchesClass = (event, classId, classPeriod) => {
  if (classId) return String(event?.classId || '') === String(classId);
  if (classPeriod) return String(event?.classPeriod || '') === String(classPeriod);
  return true;
};

/**
 * One `studentSupportEvents` doc, whichever of the two attendance kinds it
 * is, normalized to a common shape. Anything else returns null.
 */
export const normalizeAttendanceEvent = (event) => {
  const kind = clean(event?.kind);
  if (kind === LIVE_ATTENDANCE_EVENT_KIND) {
    const rawMark = clean(event?.evidence?.attendanceMark).toLowerCase();
    if (!rawMark) return null;
    // A bare live "absent" carries no excused/unexcused opinion yet — it is
    // its own real state, never assumed to be unexcused.
    const mark = rawMark === 'absent' ? ATTENDANCE_DAY_MARK.ABSENT_UNCLASSIFIED : rawMark;
    if (!DAY_MARKS.has(mark)) return null;
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
    if (!DAY_MARKS.has(mark)) return null;
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
 * first — the audit trail a history screen shows.
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
