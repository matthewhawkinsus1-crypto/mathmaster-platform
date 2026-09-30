import { supportDatesFromOverride, withStudentSupportDates } from '../../../functions/shared/supportDeadline.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const millis = (value) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Read the platform's canonical per-student assignment controls without
 * recalculating attendance extensions inside Grade Transfer.
 *
 * Attendance/reopen workflows write assignment.studentOverrides[studentId].
 * dueAt/lateDueAt and the explicit reopened flag. reopenedStudentIds is kept as
 * a compatibility authority because the Grade Center recognizes it too.
 */
export const resolveStudentFinalDeadlineFromAssignment = ({ student, assignment } = {}) => {
  const studentId = clean(student?.id || student?.studentId);
  if (!studentId) return { deadline: null, reopened: false };

  const overrides = assignment?.studentOverrides;
  const override = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? overrides[studentId]
    : null;
  const reopened = override?.reopened === true
    || list(assignment?.reopenedStudentIds).map(clean).includes(studentId);
  const attendanceDeadline = override?.lateDueAt || override?.dueAt || null;

  // An individualized extra-time deadline, derived from the student's pinned
  // profile (never stored on the assignment). The grade waits for the later
  // of the two, exactly like an attendance extension — and the withholding
  // reason stays the generic "individual extension", so nothing in the
  // export names an accommodation.
  const support = supportDatesFromOverride(
    withStudentSupportDates(assignment, studentId, student?.profile)?.studentOverrides?.[studentId],
  );
  const supportFinalMs = support?.finalAtMs ?? null;
  const attendanceMs = millis(attendanceDeadline);
  const deadline = supportFinalMs === null
    ? attendanceDeadline
    : new Date(attendanceMs === null ? supportFinalMs : Math.max(attendanceMs, supportFinalMs)).toISOString();

  return {
    deadline,
    reopened,
  };
};

/** Retained only for tests/explicit callers that intentionally disable overrides. */
export const noStudentSpecificFinalDeadline = () => ({ deadline: null, reopened: false });
