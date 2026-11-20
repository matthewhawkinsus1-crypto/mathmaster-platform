/*
 * WRITING THE TIME A STUDENT HAS SPENT ON AN ASSIGNMENT (flushAssignmentActivity).
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitAssignmentRuntime.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs they read and fill.
 */
import { doc, FieldPath, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getAssignmentLifecycle, recordAssignmentActivity } from '../../assignmentLifecycle';
import { reconcileAssignmentActivityProjection } from '../../services/submissionIngestionService.js';

export function createAssignmentActivityFlush(
  user, assignments, activeAssignmentId, assignmentActivity, setAssignmentActivity, setClassworkGradesByAssignment,
  pendingAssignmentSecondsRef,
) {
  /*
   * The local tracker is deliberately NOT a parameter any more. This function
   * used to take it so it could compute Classwork completion from the caller's
   * in-flight overlay; that computation is the server's now, from canonical
   * records, so passing a tracker here could only mislead the next reader.
   */
  const flushAssignmentActivity = async (assignmentId = activeAssignmentId) => {
    if (user?.role !== 'student' || !assignmentId) return null;
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return null;
    if (getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id }).isPracticeOnly) {
      // Post-deadline practice is intentionally invisible to the gradebook,
      // engagement analytics, mastery engine, and teacher reports.
      pendingAssignmentSecondsRef.current = 0;
      return null;
    }
    const pendingSeconds = pendingAssignmentSecondsRef.current;
    if (pendingSeconds <= 0) return assignmentActivity[assignmentId] || null;
    pendingAssignmentSecondsRef.current = 0;
    const nextRecord = recordAssignmentActivity({
      activity: assignmentActivity[assignmentId],
      assignment,
      seconds: pendingSeconds,
      nowValue: Date.now(),
      studentId: user.id,
    });
    const updatedActivity = { ...assignmentActivity, [assignmentId]: nextRecord };
    setAssignmentActivity(updatedActivity);

    /*
     * ENGAGEMENT TIME IS THE ONLY THING THIS WRITES.
     *
     * It used to also compute Classwork completion from `tracker` and write
     * `classworkGradesByAssignment` itself. `tracker` is the LOCAL OVERLAY: it
     * contains attempts still sitting in this Chromebook's durable queue that
     * canonical grades have never seen. So a browser could mark a student
     * Classwork-complete — which opens the next assignment through
     * `prerequisiteAccess` — on the strength of work that had not been
     * recorded anywhere, and might yet be proven invalid.
     *
     * Under Persistence V3 the browser may save engagement/activity state, and
     * may not author a grade or completion projection. The projection is
     * derived from canonical attempts by the server: at ingestion for every
     * case a RESPONSE completes the rule, and by the reconciliation callable
     * below for the one case ingestion cannot see — the rule's engagement
     * term being satisfied by TIME after the last response was ingested.
     */
    try {
      await updateDoc(
        doc(db, 'grades', user.id),
        new FieldPath('assignmentActivity', assignmentId),
        nextRecord,
      );
    } catch (error) {
      pendingAssignmentSecondsRef.current += pendingSeconds;
      console.error('Could not save assignment activity:', error);
      return nextRecord;
    }

    // The activity total is canonical now, so the server can be asked to look
    // again. It re-reads the canonical tracker and the canonical activity and
    // writes the projection only if THAT evidence supports it; this call sends
    // no completion and no score. It is diagnostics-grade background work — a
    // failure leaves the projection to the next ingestion or the next flush.
    try {
      const reconciled = await reconcileAssignmentActivityProjection({ assignmentId });
      if (reconciled?.classworkGrade) {
        setClassworkGradesByAssignment((current) => (
          current?.[assignmentId] === reconciled.classworkGrade
            ? current
            : { ...current, [assignmentId]: reconciled.classworkGrade }
        ));
      }
    } catch (error) {
      console.warn('Classwork completion will be reconciled on the next canonical write:', error);
    }
    return nextRecord;
  };
  return [flushAssignmentActivity];
}
