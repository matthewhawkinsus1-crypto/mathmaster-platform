const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

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

  return {
    deadline: override?.lateDueAt || override?.dueAt || null,
    reopened,
  };
};

/** Retained only for tests/explicit callers that intentionally disable overrides. */
export const noStudentSpecificFinalDeadline = () => ({ deadline: null, reopened: false });
