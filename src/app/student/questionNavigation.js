/*
 * MOVING BETWEEN THE QUESTIONS OF AN OPEN ASSIGNMENT (changeQuestion).
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitAssignmentRuntime.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs they read and fill.
 */
import { EXIT_TICKET_SPELLED_OUT, exitTicketInSentence } from '../../platform/student/studentWords.js';
import { normalizeQuestionRecord } from '../../attemptPolicy';
import { getAssignmentLifecycle, getDOLState, questionIsIncluded } from '../../assignmentLifecycle';
import { describeSectionAccess } from '../../platform/student/assignmentNavigator.js';
import { startPerformanceSpan } from '../../platform/performance/performanceTelemetry.js';
import { createDurableAction, enqueueDurableAction } from '../../platform/performance/durableActionOutbox.js';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { withUnstoredWork, withoutUnstoredWork } from '../../platform/student/saveStatusModel.js';

export function createQuestionNavigation(
  toastInfo, toastWarning, user, hasPracticePassFor, studentRequiredFor, assignments, activeAssignmentId, setTracker,
  tracker, setStudentOutboxDepth, setStudentPersistenceStatus, setStudentUnstoredAssignmentIds, setPreviewTracker,
  currentQuestionIndex, setCurrentQuestionIndex, setAssignmentOverviewExpanded, classSchedule,
  lastAcademicInteractionRef, activeTimeRef, drainStudentOutbox, flushAssignmentActivity, isTeacherPreview,
  isStudentAssignment, isPracticeMode, activeQuestionRole,
) {
  const changeQuestion = async (newIndex) => {
    if (!activeAssignmentId || newIndex === currentQuestionIndex) return;
    if (user?.role === 'student') lastAcademicInteractionRef.current = Date.now();
    setAssignmentOverviewExpanded(false);
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    const localQuestions = getStoredAssignmentQuestions(localAssignment);
    if (localQuestions.length && !questionIsIncluded(localQuestions[newIndex])) return;
    // A student never lands on an item their reduced-item-count accommodation
    // omits (the navigation never offers one; this also covers deep links).
    if (isStudentAssignment && !isPracticeMode && localAssignment) {
      const required = studentRequiredFor(localAssignment, { hasPracticePass: hasPracticePassFor(activeAssignmentId) });
      if (required.omitted.includes(newIndex)) return;
    }

    if (isTeacherPreview) {
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: {
          ...normalizeQuestionRecord(current[currentQuestionIndex]),
          timeSpent: 0,
        },
      }));
      setCurrentQuestionIndex(newIndex);
      return;
    }

    if (user?.role !== 'student') return;
    let assignment = assignments.find((item) => item.id === activeAssignmentId);
    if (!assignment) return;

    const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: Date.now() });
    const dolLifecycle = getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id });
    if (!dolLifecycle.isClosed && (dolState.questionIndices || [dolState.questionIndex]).includes(newIndex) && dolState.enabled && !['active', 'ended'].includes(dolState.status)) {
      // What is true for THIS state (waiting with a real time, another class
      // day, not scheduled): the navigator's own sentence for the exit ticket,
      // never one fixed "opens in the last minutes of class".
      const dolAccess = describeSectionAccess({ role: 'dol', label: `the ${exitTicketInSentence}`, timedDol: true, lifecycle: dolLifecycle, dolState, nowValue: Date.now() });
      toastInfo(
        dolAccess.short ? `${EXIT_TICKET_SPELLED_OUT} · ${dolAccess.short}` : `${EXIT_TICKET_SPELLED_OUT} is not open`,
        dolAccess.reason || `The ${exitTicketInSentence} is not open right now.`,
      );
      return;
    }

    if (getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id }).isPracticeOnly) {
      setCurrentQuestionIndex(newIndex);
      return;
    }

    const transitionSpan = startPerformanceSpan('next_question_ready_ms', { cached: true });
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: {
          ...normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]),
          timeSpent: activeTimeRef.current,
        },
      },
    };

    try {
      setStudentPersistenceStatus('capturing');
      await enqueueDurableAction(createDurableAction({
        kind: 'questionProgress',
        studentId: user.id,
        assignmentId: activeAssignmentId,
        questionIndex: currentQuestionIndex,
        payload: { timeSpent: activeTimeRef.current, activityRole: activeQuestionRole },
      }));
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      console.error('Could not queue question progress:', error);
      // Not stored: Home says so until this assignment's work is (RUN-3).
      setStudentUnstoredAssignmentIds((ids) => withUnstoredWork(ids, activeAssignmentId));
      setStudentPersistenceStatus('volatile');
      toastWarning('Progress not queued', 'Keep this tab open and try Next again. Your current work is still on screen.');
      return;
    }

    setTracker(updatedTracker);
    // Stored: a change this assignment could not store before is not the
    // only copy of its work any more (saveStatusModel.withoutUnstoredWork).
    setStudentUnstoredAssignmentIds((ids) => withoutUnstoredWork(ids, activeAssignmentId));
    setCurrentQuestionIndex(newIndex);
    window.requestAnimationFrame(() => transitionSpan.finish({ status: 'interactive' }));

    // Navigation is a local operation after the progress envelope has crossed
    // the IndexedDB durability boundary. Server reconciliation does not hold
    // the Next button hostage to a network roundtrip.
    void (async () => {
      try {
        await drainStudentOutbox();
        await flushAssignmentActivity(activeAssignmentId);
      } catch (error) {
        console.error('Could not reconcile question navigation:', error);
      }
    })();
  };
  return [changeQuestion];
}
