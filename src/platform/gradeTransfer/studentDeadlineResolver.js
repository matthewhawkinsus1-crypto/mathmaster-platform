import { supportDatesFromOverride, withStudentSupportDates } from '../../../functions/shared/supportDeadline.mjs';
import { resolveStudentOverride } from '../../../functions/shared/studentAssignmentOverrides.mjs';

const clean = (value) => String(value ?? '').trim();
const millis = (value) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Read the platform's canonical per-student assignment controls without
 * recalculating attendance extensions inside Grade Transfer.
 *
 * A student's individual final cutoff and reopened flag are resolved by the
 * one override resolver (functions/shared/studentAssignmentOverrides.mjs):
 * their private record (`privateOverride`, when the caller holds it) merged with any
 * copy on the shared document, including the `reopenedStudentIds` form the
 * Grade Center also recognizes.
 */
export const resolveStudentFinalDeadlineFromAssignment = ({ student, assignment, privateOverride = undefined } = {}) => {
  const studentId = clean(student?.id || student?.studentId);
  if (!studentId) return { deadline: null, reopened: false };

  const controls = resolveStudentOverride({ assignment, studentId, privateOverride });
  const reopened = controls?.reopened === true;
  const attendanceDeadline = controls?.lateDueAt || null;

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
