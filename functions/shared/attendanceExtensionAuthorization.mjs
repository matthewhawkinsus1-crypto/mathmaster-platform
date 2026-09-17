/*
 * WHO MAY MOVE A STUDENT'S FINAL SUBMISSION CUTOFF, AND HOW FAR.
 *
 * A direct client `updateDoc` on `assignments/{id}` is authorized only by the
 * coarse Firestore rule `allow update: if teacher()` — any signed-in teacher,
 * not necessarily this student's own teacher of record. That is fine for the
 * assignment's own content (title, questions, section locks a teacher of that
 * class already controls elsewhere), but a per-student deadline extension is
 * data about ONE student, and firestore.rules blocks any client write that
 * touches `studentOverrides` (see the rule's own comment) specifically so
 * this file — reached only through the `applyStudentAttendanceExtension`
 * callable in functions/index.js, with Admin SDK credentials — is the one
 * place that can grant one.
 *
 * Mirrors `authorizeClassPointsActor` in classPoints.mjs: authorization is
 * decided from `classes/{classId}`, never from the denormalized
 * `grades.assignedTeacherEmail` alone, and a caller is authorized only when
 * BOTH agree with the requested class.
 *
 * This file is pure and shared, unit-tested directly without a Functions
 * runtime or an emulator — the same way classPoints.mjs is.
 */

const cleanEmail = (value) => String(value ?? '').trim().toLowerCase();
const cleanId = (value) => String(value ?? '').trim();

/**
 * Is this caller allowed to touch attendance-driven extensions for THIS
 * student, in THIS class, on THIS assignment at all? Says nothing yet about
 * whether the specific date they are proposing is acceptable — see
 * `validateProposedFinalCutoff` for that.
 */
export const authorizeAttendanceExtensionActor = ({
  isRootAdmin = false,
  teacherEmail,
  classRecord = null,
  studentRecord = null,
  assignment = null,
  requestedClassId,
} = {}) => {
  if (!classRecord) {
    return { authorized: false, reason: 'not-found', message: 'That class was not found.' };
  }
  if (!studentRecord) {
    return { authorized: false, reason: 'not-found', message: 'That student was not found.' };
  }
  if (!assignment) {
    return { authorized: false, reason: 'not-found', message: 'That assignment was not found.' };
  }

  if (!isRootAdmin) {
    if (classRecord.status === 'archived') {
      return {
        authorized: false,
        reason: 'failed-precondition',
        message: 'That class is archived. An attendance extension cannot be granted for it.',
      };
    }

    if (String(studentRecord.classId || '') !== String(requestedClassId || '')) {
      return {
        authorized: false,
        reason: 'failed-precondition',
        message: 'This student does not currently belong to that class.',
      };
    }

    const teacherOfRecord = cleanEmail(classRecord.teacherOfRecord);
    const assignedTeacherEmail = cleanEmail(studentRecord.assignedTeacherEmail);
    if (!teacherOfRecord || assignedTeacherEmail !== teacherOfRecord) {
      return {
        authorized: false,
        reason: 'failed-precondition',
        message: "This class's roster authorization is out of sync. An administrator must resave the class before an extension can be granted.",
      };
    }

    if (cleanEmail(teacherEmail) !== teacherOfRecord) {
      return {
        authorized: false,
        reason: 'permission-denied',
        message: "Only this class's teacher of record may grant an attendance extension for it.",
      };
    }
  }

  const assignedClassIds = Array.isArray(assignment.assignedClassIds)
    ? assignment.assignedClassIds.map(cleanId).filter(Boolean)
    : [];
  if (!assignedClassIds.includes(cleanId(requestedClassId))) {
    return {
      authorized: false,
      reason: 'failed-precondition',
      message: 'That assignment is not assigned to this class.',
    };
  }

  return { authorized: true };
};

/**
 * THE SERVER'S OWN COPY OF THE NEVER-SHORTEN RULE.
 *
 * The client (src/platform/attendance/extensionReconciliation.js) already
 * refuses to propose a date earlier than what is on file, but a callable
 * must never trust that refusal happened — it is the one thing this function
 * exists to re-check independently, against the assignment snapshot read
 * inside the same transaction that writes it (see functions/index.js).
 *
 * `currentEffectiveCutoffMs` is whatever is already authoritative for this
 * student: their existing `studentOverrides[id].lateDueAt` if one exists,
 * otherwise the class's own `lateDueAt`/`dueAt` fallback — the caller
 * resolves that (e.g. with `assignmentFinalCloseAt` from
 * sectionDeadline.mjs) and hands it in, so this stays a pure comparison.
 */
export const validateProposedFinalCutoff = ({
  proposedLateDueAtMs = null,
  currentEffectiveCutoffMs = null,
} = {}) => {
  if (!Number.isFinite(proposedLateDueAtMs)) {
    return { valid: false, reason: 'invalid-argument', message: 'A valid extended final cutoff is required.' };
  }
  if (Number.isFinite(currentEffectiveCutoffMs) && proposedLateDueAtMs < currentEffectiveCutoffMs) {
    return {
      valid: false,
      reason: 'failed-precondition',
      message: 'This would shorten a final cutoff already on file. Use the attendance-correction review workflow instead.',
    };
  }
  return { valid: true };
};

export default authorizeAttendanceExtensionActor;
