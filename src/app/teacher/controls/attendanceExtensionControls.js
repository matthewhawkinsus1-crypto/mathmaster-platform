/*
 * ATTENDANCE AND THE DEADLINE EXTENSIONS IT GRANTS: RECORDING A MARK, RECONCILING AN EXTENSION, AND THE TEACHER KEEPING OR SHORTENING ONE.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { db } from '../../../firebase';
import { assignmentIsForStudent } from '../../../assignmentLifecycle';
import { formatStudentName } from '../../../platform/studentName';
import { rosterStudentNameForStorage } from '../../../platform/teacher/teacherRosterSummary.js';
import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from '../../../platform/teacher/supportEventKinds.js';
import { localDateKeyOf } from '../../../platform/attendance/classMeetings.js';
import { SCHOOL_NON_INSTRUCTIONAL_KEYS } from '../../shell/schoolCalendarKeys.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from '../../../platform/teacher/liveAttendanceEventKind.js';
import { ATTENDANCE_HISTORY_EVENT_KIND } from '../../../../functions/shared/attendanceDay.mjs';
import { applyStudentAttendanceExtension } from '../../../platform/attendance/extensionClient.js';

export function createAttendanceExtensionControls(
  toastError, toastSuccess, user, classes, assignments, requireTeacherKit, classSchedule, teacherStudentIdentityIndex,
  setAttendanceReviewBusyKey,
) {
  /*
   * A per-student extension is never written as a client-side whole-map
   * replace, for two reasons at once: (1) two teachers (or two tabs)
   * granting extensions to two different students of the same assignment
   * from the same stale snapshot must not let the second write erase the
   * first, and (2) firestore.rules blocks a direct client write to
   * `studentOverrides` entirely (see that rule's comment) — only the
   * `applyStudentAttendanceExtension` Cloud Function may write it, because
   * only it can independently re-verify the caller is this student's own
   * teacher of record and that the write never shortens a cutoff already on
   * file. This function's job is just to shape the browser's already-computed
   * proposal for that callable.
   */
  const applyStudentOverridePatch = async ({ assignmentId, studentId, classId, patch }) => {
    const entry = patch?.studentOverrides?.[studentId];
    if (!entry?.lateDueAt) return;
    const proposedLateDueAtMs = entry.lateDueAt instanceof Date
      ? entry.lateDueAt.getTime()
      : new Date(entry.lateDueAt).getTime();
    await applyStudentAttendanceExtension({
      classId, studentId, assignmentId, proposedLateDueAtMs, extension: entry.extension || {},
    });
  };

  /*
   * ONE RECONCILIATION PATH FOR EVERY ATTENDANCE EVENT.
   *
   * Live Classroom's same-day quick-mark and an Attendance History
   * correction are both, underneath, "a teacher just recorded an attendance
   * mark" — so both go through this same function rather than two separate
   * ones that could drift apart. A Present/Late correction runs through here
   * too: it may remove an absence an earlier extension was based on, which
   * is exactly the "would shorten" case extensionReconciliation.js has to
   * catch. Recording the (append-only) event and reconciling any extension it
   * touches happen together, so a teacher never sees a corrected mark that
   * has not yet been reflected in the student's deadline.
   */
  const reconcileAttendanceExtensions = async (event, record) => {
    const { fetchAttendanceForClassDateRange } = requireTeacherKit();
    const classPeriod = classes.find((entry) => entry.classId === event.classId)?.period || null;
    const affectedAssignments = assignments
      .filter((assignment) => assignmentIsForStudent(assignment, { classId: event.classId }))
      .filter((assignment) => {
        const release = localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate) || '0000-00-00';
        const due = localDateKeyOf(assignment?.dueAt || assignment?.dueDate);
        return due && event.evidence?.dateKey >= release && event.evidence?.dateKey <= due;
      });
    const windowStarts = affectedAssignments
      .map((assignment) => localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate))
      .filter(Boolean);
    const windowEnds = affectedAssignments
      .map((assignment) => localDateKeyOf(assignment?.dueAt || assignment?.dueDate))
      .filter(Boolean);
    const attendanceHistory = affectedAssignments.length
      ? await fetchAttendanceForClassDateRange({
        db,
        teacherEmail: user.email,
        classId: event.classId,
        fromDateKey: windowStarts.sort()[0] || event.evidence?.dateKey,
        toDateKey: windowEnds.sort().at(-1) || event.evidence?.dateKey,
      })
      : [];
    // Loaded when a correction needs it, not with a teacher's first page
    // (scripts/check-first-load-budget.mjs). If it cannot load, the caller
    // records the retry, as for any failed reconciliation.
    const { buildStudentExtensionPatch, reconcileAssignmentExtensionsForCorrection } = await import('../../../platform/attendance/extensionReconciliation.js');
    const results = reconcileAssignmentExtensionsForCorrection({
      assignments: affectedAssignments,
      studentId: event.studentId,
      classId: event.classId,
      classPeriod,
      schedule: classSchedule,
      nonInstructionalKeys: SCHOOL_NON_INSTRUCTIONAL_KEYS,
      // The generic support subscription is capped at 750 records. Extension
      // decisions use the complete indexed attendance range instead.
      supportEvents: attendanceHistory.some((entry) => entry.id === record.id)
        ? attendanceHistory : [...attendanceHistory, record],
      correctionDateKey: event.evidence?.dateKey,
    });

    let reviewCount = 0;
    await Promise.all(results.map(async ({ assignment, resolution }) => {
      if (resolution.reviewNeeded) { reviewCount += 1; return; }
      const patch = buildStudentExtensionPatch({
        assignment, studentId: event.studentId, resolution, actorEmail: user.email,
      });
      if (patch) await applyStudentOverridePatch({ assignmentId: assignment.id, studentId: event.studentId, classId: event.classId, patch });
    }));
    return reviewCount;
  };

  /*
   * "KEEP CURRENT EXTENSION" — the review is resolved, nothing is written to
   * the assignment. Recording the resolution is what makes the open item on
   * Attendance History disappear (openAttendanceCorrectionReviewsForStudent
   * checks for exactly this event).
   */
  const handleKeepAttendanceExtension = async ({ student, assignment, resolution, classId, classPeriod, reviewKey }) => {
    if (user?.role !== 'teacher' || !user.email) return;
    setAttendanceReviewBusyKey(reviewKey);
    try {
      await requireTeacherKit().recordStudentSupportEvent({
        db, teacherEmail: user.email,
        event: requireTeacherKit().buildAttendanceCorrectionReviewEvent({
          studentId: student.id || student.studentId,
          studentName: rosterStudentNameForStorage({
            studentId: student.id || student.studentId,
            index: teacherStudentIdentityIndex,
            historicalName: formatStudentName(student, { lastFirst: false, fallbackToNeutral: false }),
          }),
          assignmentId: assignment.id, assignmentTitle: assignment.title, classId, classPeriod,
          existing: resolution.existing, proposed: resolution.proposed, resolution: 'kept', actorEmail: user.email,
        }),
      });
      toastSuccess('Extension kept', 'The existing extension stays in place; the review is resolved.');
    } catch (error) {
      console.error(error);
      toastError('Could not resolve the review', error.message);
    } finally {
      setAttendanceReviewBusyKey(null);
    }
  };

  /*
   * "APPLY SHORTER EXTENSION" — the one deliberate exception to "never
   * shorten automatically". The review-resolution event is recorded FIRST
   * (audited, teacher-authorized), and the callable independently re-checks
   * that exact record exists before it will accept a shortened cutoff — see
   * applyStudentAttendanceExtension's own comment in functions/index.js.
   */
  const handleApplyShorterAttendanceExtension = async ({ student, assignment, resolution, classId, classPeriod, reviewKey }) => {
    if (user?.role !== 'teacher' || !user.email) return;
    const studentId = student.id || student.studentId;
    setAttendanceReviewBusyKey(reviewKey);
    try {
      await requireTeacherKit().recordStudentSupportEvent({
        db, teacherEmail: user.email,
        event: requireTeacherKit().buildAttendanceCorrectionReviewEvent({
          studentId,
          studentName: rosterStudentNameForStorage({
            studentId,
            index: teacherStudentIdentityIndex,
            historicalName: formatStudentName(student, { lastFirst: false, fallbackToNeutral: false }),
          }),
          assignmentId: assignment.id, assignmentTitle: assignment.title, classId, classPeriod,
          existing: resolution.existing, proposed: resolution.proposed, resolution: 'shortened', actorEmail: user.email,
        }),
      });
      await applyStudentAttendanceExtension({
        classId, studentId, assignmentId: assignment.id,
        proposedLateDueAtMs: resolution.proposed.dueAt instanceof Date
          ? resolution.proposed.dueAt.getTime() : new Date(resolution.proposed.dueAt).getTime(),
        extension: {
          dateKey: resolution.proposed.dateKey,
          meetingsGranted: resolution.proposed.meetingsGranted,
          meetingsRequested: resolution.proposed.meetingsRequested,
          undetermined: resolution.proposed.undetermined,
          resolved: resolution.proposed.resolved,
          sourceAbsenceDates: resolution.proposed.sourceAbsenceDates,
        },
        allowShorten: true,
        existingDateKey: resolution.existing?.dateKey,
        proposedDateKey: resolution.proposed?.dateKey,
      });
      toastSuccess('Extension shortened', 'The student’s extension now matches the corrected attendance.');
    } catch (error) {
      console.error(error);
      toastError('Could not apply the shorter extension', error.message);
    } finally {
      setAttendanceReviewBusyKey(null);
    }
  };

  const ATTENDANCE_EVENT_KINDS = [LIVE_ATTENDANCE_EVENT_KIND, ATTENDANCE_HISTORY_EVENT_KIND];

  const handleRecordStudentSupportEvent = async (event) => {
    if (user?.role !== 'teacher' || !user.email) return null;
    const isAttendanceEvent = ATTENDANCE_EVENT_KINDS.includes(event?.kind);
    try {
      const record = await requireTeacherKit().recordStudentSupportEvent({
        db,
        teacherEmail: user.email,
        event,
      });

      if (isAttendanceEvent) {
        let reviewCount;
        try {
          reviewCount = await reconcileAttendanceExtensions(event, record);
        } catch (reconciliationError) {
          console.error('Attendance extension reconciliation is pending:', reconciliationError);
          // The attendance fact is already safely append-only. Persist a
          // second append-only audit/retry record containing everything a
          // worker or teacher retry needs; never delete the attendance fact.
          try {
            await requireTeacherKit().recordStudentSupportEvent({
              db,
              teacherEmail: user.email,
              event: {
                kind: SUPPORT_EVENT_KIND.ATTENDANCE_EXTENSION_RECONCILIATION_PENDING,
                stage: SUPPORT_EVENT_STAGE.SYSTEM_SIGNAL,
                studentId: event.studentId,
                studentName: event.studentName,
                classId: event.classId,
                classPeriod: event.classPeriod,
                dateKey: event.evidence?.dateKey,
                relatedEventId: record.id,
                summary: 'Attendance saved; deadline reconciliation needs retry.',
                evidence: {
                  dateKey: event.evidence?.dateKey,
                  attendanceEventId: record.id,
                  retryable: true,
                  error: String(reconciliationError?.message || reconciliationError).slice(0, 300),
                },
              },
            });
          } catch (auditError) {
            console.error('Could not persist attendance reconciliation retry audit:', auditError);
          }
          toastError(
            'Attendance saved; extension update pending',
            'The attendance record is safe. Deadline reconciliation needs a retry and was added to the support audit trail.',
          );
          return record;
        }
        toastSuccess(
          event.kind === ATTENDANCE_HISTORY_EVENT_KIND ? 'Attendance correction saved' : 'Attendance recorded',
          reviewCount > 0
            ? `${reviewCount} extension${reviewCount === 1 ? '' : 's'} would have shortened — review before changing.`
            : 'The prior mark stays in the record; any earned extension was reconciled.',
        );
        return record;
      }

      const label = event?.kind === SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP
        ? 'Parent follow-up recorded'
        : event?.stage === SUPPORT_EVENT_STAGE.DISMISSED
          ? 'Signal dismissal recorded'
          : 'Student support note recorded';
      toastSuccess(label, 'The event was added to the append-only student support history.');
      return record;
    } catch (error) {
      console.error(error);
      toastError(isAttendanceEvent ? 'Could not save the attendance record' : 'Could not save support note', error.message);
      return null;
    }
  };
  return [handleKeepAttendanceExtension, handleApplyShorterAttendanceExtension, handleRecordStudentSupportEvent];
}
