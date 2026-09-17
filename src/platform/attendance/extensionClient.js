import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

/*
 * A per-student attendance extension is written ONLY through this callable.
 *
 * firestore.rules blocks any direct client write that touches
 * `assignments/{id}.studentOverrides` — see that rule's own comment — so the
 * teacher's browser can compute WHICH extension is earned (that math already
 * lives in extensionReconciliation.js and is re-derived from attendance
 * history every time, never trusted as a bare number handed over the wire)
 * but the actual write goes through `applyStudentAttendanceExtension`
 * (functions/index.js), which runs with Admin SDK credentials and
 * independently re-verifies the caller is this student's own class's
 * teacher of record and that the proposed cutoff never shortens one already
 * on file.
 */
export const applyStudentAttendanceExtension = async ({
  classId, studentId, assignmentId, proposedLateDueAtMs, extension = {},
  // Set only for the explicit "Apply Shorter Extension" review action — see
  // the callable's own comment for why a matching, already-recorded teacher
  // review resolution is what actually authorizes this, not this flag alone.
  allowShorten = false,
  existingDateKey = null,
  proposedDateKey = null,
}) => {
  const callable = httpsCallable(functions, 'applyStudentAttendanceExtension');
  const result = await callable({
    classId, studentId, assignmentId, proposedLateDueAtMs, extension, allowShorten, existingDateKey, proposedDateKey,
  });
  return result.data || {};
};

export default applyStudentAttendanceExtension;
