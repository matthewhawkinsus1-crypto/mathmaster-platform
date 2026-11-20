/*
 * THE STUDENT'S OUTBOX: SENDING AN ANSWER THE DEVICE HOLDS, RECONCILING IT WITH THE SERVER, AND REPORTING WHAT IS STILL WAITING.
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitAssignmentRuntime.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs they read and fill.
 */
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { EMPTY_SCRATCHPAD_CACHE } from '../../platform/student/practiceScratchpadCache.js';
import { normalizeQuestionRecord } from '../../attemptPolicy';
import { assignmentIsForStudent } from '../../assignmentLifecycle';
import { keepSame } from '../../platform/performance/renderStability.js';
import { drainDurableActions } from '../../platform/performance/durableActionOutbox.js';
import {
  PROGRESS_KINDS, buildProgressEnvelopeForAction, callableDeliveryDiagnostic, ingestOneSubmission,
  reportDeviceQueueState,
} from '../../services/submissionIngestionService.js';
import { createDeviceReportCoordinator, reconcileWithDeviceReports } from '../../platform/persistence/deviceReportCoordinator.js';
import { INGESTIBLE_KINDS, buildSubmissionEnvelope } from '../../../functions/shared/submissionEnvelope.mjs';
import { SUBMISSION_DISPOSITION } from '../../../functions/shared/studentSubmissionDisposition.mjs';
import { persistenceStatusAfterDrain } from '../../platform/student/saveStatusModel.js';

export function createStudentOutbox(
  user, setAssignmentResultRoute, setActiveClassroomSectionKey, setActiveView, setActiveAssignmentId,
  setStudentOutboxDepth, setStudentPendingGradeCount, setStudentNeedsReviewCount, setStudentNeedsReviewAssignmentIds,
  setStudentPersistenceStatus, showStudentReportingError, setPracticeTracker, setPracticeScratchpads,
  setPreviewTracker, studentReportCoordinatorRef,
) {
  /*
   * DELIVERING ONE CAPTURED ACTION TO CANONICAL STORAGE.
   *
   * The answer is a DISPOSITION, never a bare "rejected". That word is what
   * caused the September 14 incident: it meant "the teacher closed the section
   * a minute ago", "your roster row has not been written yet" and "you already
   * submitted this" all at once, and the outbox deleted the student's work for
   * every one of them. Each outcome is now classified, and only a PROVEN
   * duplicate, supersession or ineligibility retires anything.
   *
   * Grade-bearing work goes to the server ingestion callable, which re-reads
   * the authoritative assignment and roster and re-grades the raw response.
   * There is deliberately no browser grade-writing fallback: an unavailable
   * callable leaves the envelope in IndexedDB so grade, evidence and receipt
   * remain one atomic server decision.
   */
  const buildSubmissionEnvelopeForAction = (action) => {
    const payload = action.payload || {};
    return buildSubmissionEnvelope({
      actionId: action.actionId,
      kind: action.kind,
      studentId: action.studentId,
      assignmentId: action.assignmentId,
      questionIndex: action.questionIndex,
      questionId: payload.questionId || null,
      variantIndex: payload.variantIndex ?? normalizeQuestionRecord(payload.record).variantIndex,
      activityRole: payload.activityRole,
      capturedAt: Number(action.createdAt) || Date.now(),
      previousTotalAttempts: payload.previousTotalAttempts,
      record: payload.record,
      // The student's RAW work. Where the server can mark this question type it
      // marks this, and the browser's verdict is discarded entirely.
      response: payload.response || null,
      // Which instance of a family-backed slot this work answers. Absent for
      // every other question.
      familyDelivery: payload.familyDelivery || null,
      // A step submission's raw step, from which the server derives its credit.
      stepWork: payload.stepWork || null,
      supportUsage: payload.record?.supportUsage || null,
      assignmentSupportUsage: payload.supportUsage || null,
      hasClassworkGrade: payload.hasClassworkGrade === true,
      hasDolGrade: payload.hasDolGrade === true,
      timedSectionAccess: payload.timedSectionAccess || null,
      capturedSectionAccess: payload.capturedSectionAccess || null,
      checkpointDocumentId: payload.checkpointDocumentId || null,
      timeSpentSeconds: payload.timeSpentSeconds || payload.record?.timeSpent || 0,
      // How many times this device has already tried. The server escalates a
      // retry that has never cleared into `needs-review` from this, so leaving
      // it out means a week-old submission retries forever unseen.
      deliveryAttempts: Number(action.delivery?.attempts || 0),
    });
  };

  /**
   * Direct Firestore is restricted to response checkpoints: drafts that carry
   * no grade (firestore.rules) and that the server finalizer re-grades. Graded
   * work AND elapsed-time progress go to server ingestion, because the
   * canonical question record is server-owned — the rules refuse this
   * student's client any write to it. The guard is intentional defense in
   * depth; a future dispatcher edit cannot turn this back into a grade writer.
   */
  const reconcileThroughClientTransaction = async (action) => {
    if (INGESTIBLE_KINDS.includes(action.kind)) {
      throw new Error('Grade-bearing actions require server ingestion.');
    }
    if (action.kind !== 'responseCheckpoint') {
      throw new Error('Only response checkpoints are written directly; elapsed time requires server ingestion.');
    }
    const assignmentRef = doc(db, 'assignments', action.assignmentId);
    const gradesRef = doc(db, 'grades', action.studentId);
    let classification = { disposition: SUBMISSION_DISPOSITION.ACCEPTED, reason: null };

    await runTransaction(db, async (transaction) => {
      const [assignmentSnapshot, gradesSnapshot] = await Promise.all([
        transaction.get(assignmentRef),
        transaction.get(gradesRef),
      ]);
      const assignment = assignmentSnapshot.exists()
        ? { id: assignmentSnapshot.id, ...assignmentSnapshot.data() }
        : null;
      const saved = gradesSnapshot.exists() ? gradesSnapshot.data() || {} : null;

      // A checkpoint is stored whatever the section's CURRENT state is: it is
      // a draft, and whether the work counts is the finalizer's decision,
      // made from the server acknowledgement time against the real close. A
      // response that only reaches MathMaster after the deadline therefore
      // stays recoverable history and changes no grade.
      if (!assignment || !saved) {
        classification = { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'context-unreadable' };
        return;
      }
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) {
        classification = { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'assignment-not-assigned-to-class' };
        return;
      }
      transaction.set(doc(db, 'studentResponseCheckpoints', action.payload.documentId), {
        ...action.payload,
        studentId: action.studentId,
        assignmentId: action.assignmentId,
        questionIndex: action.questionIndex,
        classId: user.classId || null,
        serverAcknowledgedAt: serverTimestamp(),
        candidateFinalizeAt: action.payload.candidateFinalizeAt ? new Date(action.payload.candidateFinalizeAt) : null,
        status: 'active',
      });
      classification = { disposition: SUBMISSION_DISPOSITION.ACCEPTED, reason: null };
    });

    return classification;
  };

  const reconcileDurableStudentAction = async (action) => {
    // A queue row that belongs to someone else is not this session's to judge.
    // It stays exactly where it is until its owner signs in on this device.
    if (!action || action.studentId !== user?.id) {
      return { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'not-this-student' };
    }

    // Graded work, and elapsed time on a question, both land on the canonical
    // question record, which only the server writes.
    const elapsedTime = PROGRESS_KINDS.includes(action.kind);
    if (INGESTIBLE_KINDS.includes(action.kind) || elapsedTime) {
      try {
        const receipt = elapsedTime
          ? await ingestOneSubmission(buildProgressEnvelopeForAction(action))
          : await ingestOneSubmission(buildSubmissionEnvelopeForAction(action));
        return { disposition: receipt.disposition, reason: receipt.reason || null, receipt };
      } catch (error) {
        const diagnostic = callableDeliveryDiagnostic(error);
        console.warn('Server ingestion unavailable; submission remains durably queued:', diagnostic.safeReason);
        return {
          disposition: SUBMISSION_DISPOSITION.RETRYABLE,
          reason: diagnostic.safeReason,
          diagnostic,
        };
      }
    }
    // Response checkpoints are non-grade drafts the server finalizer re-grades.
    return reconcileThroughClientTransaction(action);
  };
  /*
   * SAY WHAT ACTUALLY HAPPENED TO THE STUDENT'S WORK.
   *
   * `successStatus` is only reached when NOTHING is still owed a delivery.
   * A student is never told "Submitted." while a submission is still sitting in
   * this device's queue — that is the difference the incident turned on, and it
   * is why the queued state names the count and the retry state is distinct
   * from the "not eligible" one.
   *
   * And only for work that was delivered (RUN-3): the reconcile drains an
   * empty queue at sign-in and every 10 seconds, and that is not a save. The
   * status is decided from the one the line shows when the drain returns, so a
   * save refused meanwhile is never written over (saveStatusModel.js,
   * persistenceStatusAfterDrain).
   */
  const drainStudentOutbox = async ({ successStatus = 'durable' } = {}) => {
    if (user?.role !== 'student' || !user.id) return;
    const result = await drainDurableActions({ studentId: user.id, reconcile: reconcileDurableStudentAction });
    setStudentOutboxDepth(result.remaining);
    setStudentPendingGradeCount(result.remainingGrade);
    setStudentNeedsReviewCount(result.tally.needsReview);
    // The same list while it names the same assignments: a new empty one on
    // each drain (the reconcile drains every 10 seconds) drew App every time.
    setStudentNeedsReviewAssignmentIds(keepSame([...new Set((result.retained || [])
      .filter((entry) => entry.disposition === SUBMISSION_DISPOSITION.NEEDS_REVIEW && entry.assignmentId)
      .map((entry) => entry.assignmentId))]));
    const online = navigator.onLine;
    setStudentPersistenceStatus((status) => persistenceStatusAfterDrain({
      status,
      remaining: result.remaining,
      tally: result.tally,
      online,
      successStatus,
    }));
    return result;
  };
  const reportStudentOutbox = () => {
    if (user?.role !== 'student' || !user.id) return;
    const studentId = user.id;
    if (!studentReportCoordinatorRef.current || studentReportCoordinatorRef.current.studentId !== studentId) {
      studentReportCoordinatorRef.current?.coordinator?.cancel();
      studentReportCoordinatorRef.current = {
        studentId,
        coordinator: createDeviceReportCoordinator({
          report: () => reportDeviceQueueState({ studentId }),
          onSettled: ({ ok, error }) => {
            if (ok) {
              showStudentReportingError(null);
              return;
            }
            const diagnostic = callableDeliveryDiagnostic(error);
            showStudentReportingError(diagnostic.safeReason);
            console.warn('Device queue report unavailable:', diagnostic.safeReason);
          },
        }),
      };
    }
    // Hydration, reconnect, pageshow, visibility return, newly queued work and
    // the post-drain snapshot all arrive here, and all report immediately
    // unless one is already in flight — in which case exactly one follow-up is
    // queued behind it rather than a second, third and fourth cycle.
    studentReportCoordinatorRef.current.coordinator.request({ immediate: true });
  };

  /*
   * GRADE DELIVERY IS HIGHER PRIORITY THAN DIAGNOSTICS.
   *
   * The pre-drain report starts first so the teacher gets the "before"
   * snapshot, but the drain does not wait for it: a `reportStudentDeviceQueue`
   * hanging out its full 12-second timeout while `ingestStudentSubmissions` is
   * healthy must not delay a single canonical grade. See
   * `reconcileWithDeviceReports` for the whole argument.
   */
  const reconcileAndReportStudentOutbox = (options) => reconcileWithDeviceReports({
    report: reportStudentOutbox,
    drain: () => drainStudentOutbox(options),
  });

  const leaveUnavailableAssignment = () => {
    setActiveAssignmentId(null);
    setActiveClassroomSectionKey(null);
    setAssignmentResultRoute(null);
    setActiveView('dashboard');
    setPracticeTracker({});
    setPracticeScratchpads(EMPTY_SCRATCHPAD_CACHE);
    setPreviewTracker({});
  };
  return [drainStudentOutbox, reconcileAndReportStudentOutbox];
}
