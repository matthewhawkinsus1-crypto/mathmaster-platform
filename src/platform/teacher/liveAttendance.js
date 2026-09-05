export const LIVE_ATTENDANCE_EVENT_KIND = 'liveAttendance';

export const LIVE_ATTENDANCE_MARK = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
});

const ABSENT_MARKS = new Set(['absent', 'excused', 'unexcused']);
const clean = (value) => String(value ?? '').trim();

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const localAttendanceDateKey = (value = Date.now()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const normalizeLiveAttendance = (value) => {
  if (typeof value === 'string') return { mark: clean(value).toLowerCase(), arrivedAt: null, markedAt: null };
  return {
    mark: clean(value?.mark || value?.status).toLowerCase(),
    arrivedAt: toMillis(value?.arrivedAt || value?.arrivalAt),
    markedAt: toMillis(value?.markedAt || value?.createdAt),
  };
};

export const attendanceIsAbsent = (value) => ABSENT_MARKS.has(normalizeLiveAttendance(value).mark);

const eventTime = (event) => (
  toMillis(event?.evidence?.markedAt)
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
 * Rebuild today's attendance from the append-only teacher support history.
 * The newest teacher action wins for a student, while the older marks stay in
 * the audit trail. This is intentionally not inferred from app presence.
 */
export const attendanceByStudentForDay = ({
  supportEvents = [],
  classId = null,
  classPeriod = null,
  dateKey = localAttendanceDateKey(),
} = {}) => {
  const latest = new Map();

  (Array.isArray(supportEvents) ? supportEvents : [])
    .filter((event) => event?.kind === LIVE_ATTENDANCE_EVENT_KIND)
    .filter((event) => clean(event?.evidence?.dateKey) === clean(dateKey))
    .filter((event) => eventMatchesClass(event, classId, classPeriod))
    .forEach((event) => {
      const studentId = clean(event?.studentId);
      const mark = clean(event?.evidence?.attendanceMark).toLowerCase();
      if (!studentId || !mark) return;
      const markedAt = eventTime(event);
      const current = latest.get(studentId);
      if (current && current.markedAt > markedAt) return;
      latest.set(studentId, {
        mark,
        arrivedAt: toMillis(event?.evidence?.arrivedAt),
        markedAt,
      });
    });

  return Object.fromEntries(latest.entries());
};

export const buildLiveAttendanceEvent = ({
  student = null,
  mark,
  classId = null,
  classPeriod = null,
  nowValue = Date.now(),
  dateKey = localAttendanceDateKey(nowValue),
} = {}) => {
  const studentId = clean(student?.id || student?.studentId);
  const normalizedMark = clean(mark).toLowerCase();
  if (!studentId) throw new Error('Live attendance needs a student id.');
  if (!Object.values(LIVE_ATTENDANCE_MARK).includes(normalizedMark)) {
    throw new Error(`Unsupported live attendance mark: ${normalizedMark || 'blank'}`);
  }

  const studentName = clean(student?.displayName || student?.name || student?.studentName || studentId);
  const resolvedPeriod = clean(classPeriod || student?.classPeriod || student?.profile?.classPeriod) || null;
  const label = normalizedMark === LIVE_ATTENDANCE_MARK.ABSENT
    ? 'Absent'
    : normalizedMark === LIVE_ATTENDANCE_MARK.LATE ? 'Late' : 'Present';
  const arrivedAt = normalizedMark === LIVE_ATTENDANCE_MARK.ABSENT ? null : Number(nowValue);

  return {
    kind: LIVE_ATTENDANCE_EVENT_KIND,
    stage: 'teacherConfirmed',
    studentId,
    studentName,
    classId: clean(classId) || null,
    classPeriod: resolvedPeriod,
    assignmentId: null,
    assignmentTitle: null,
    source: 'liveAttendance',
    summary: `${label} for ${dateKey}.`,
    evidence: {
      dateKey,
      attendanceMark: normalizedMark,
      arrivedAt,
      markedAt: Number(nowValue),
    },
  };
};

export default attendanceByStudentForDay;