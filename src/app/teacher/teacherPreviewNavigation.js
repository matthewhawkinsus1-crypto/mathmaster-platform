/*
 * OPENING AN ASSIGNMENT AS THE TEACHER: VIEW AS STUDENT, TEACH IT LIVE, AND RESUME A LIVE SESSION.
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitRouting.test.mjs holds the two sides to the same names in the same order).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { EMPTY_SCRATCHPAD_CACHE } from '../../platform/student/practiceScratchpadCache.js';
import { removeAssignmentDrafts } from '../../questionDraftStorage';
import { getCurrentContentQuestionIndices } from '../../assignmentLifecycle';
import { forgetAssignmentToolDrafts } from '../../tools/shared/toolDraftCache.js';
import { resolveQuestionActivityRole } from '../../platform/policies/activityPolicies';
import { walkthroughSessionId, startLiveTeachingSession } from '../../platform/teacher/liveTeachingSession.js';
import { validatePersistedWalkthroughSession, walkthroughEligibility } from '../../platform/assignments/assignmentAvailability.js';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { createEmptyAssignmentTracker } from '../student/assignmentRuntimeHelpers.js';
import { isTestCycleAssignment } from '../../platform/assessment/testCycle.js';

export function createTeacherPreviewNavigation(
  user, setActiveView, activeClass, liveTeachingSession, setLiveTeachingSession, walkthroughWriteRef, assignments,
  setActiveAssignmentId, setPreviewTracker, setPreviewScratchpads, setPreviewSessionId, setCurrentQuestionIndex,
  setAssignmentNavigationCollapsed, setAssignmentOverviewExpanded, gradingPeriodSettings,
  previewTrackerAssignmentIdRef, setTestCyclePreviewAssignment,
) {
  const startTeacherPreview = (assignmentId, { lessonRuntime = false } = {}) => {
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    // A Test Cycle is not a lesson. "View as Student" opens the student's own
    // card at every stage and the real secure Test items; the lesson runtime is
    // used only when that preview asks for it, to play the Review.
    if (!lessonRuntime && isTestCycleAssignment(assignmentData)) {
      setTestCyclePreviewAssignment(assignmentData);
      return;
    }
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (!assignmentQuestions.length) return;

    // Preview trackers were already ephemeral, but question/tool drafts live in
    // localStorage. Clear that preview-only draft family too so "View as
    // Student" really begins at a blank first attempt every time.
    removeAssignmentDrafts({ studentId: 'teacher-preview', assignmentId });
    forgetAssignmentToolDrafts({ studentId: 'teacher-preview', assignmentId });
    setPreviewSessionId((current) => current + 1);
    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(getCurrentContentQuestionIndices(assignmentData)[0] ?? 0);
    setAssignmentNavigationCollapsed(true);
    setAssignmentOverviewExpanded(false);
    setPreviewTracker(createEmptyAssignmentTracker(assignmentQuestions));
    setPreviewScratchpads(EMPTY_SCRATCHPAD_CACHE);
    previewTrackerAssignmentIdRef.current = assignmentId;
    setActiveView('teacherPreview');
  };

  /*
   * LIVE TEACHING (Classroom Live, Phase 2).
   *
   * Teaching happens from the SAME preview runtime as "View as Student" — no
   * second renderer, no fake teacher-only responses, same preview isolation.
   * The only addition is a small, separate Live Teaching session record of
   * where the teacher's exemplar actually is, so the room's pace reference
   * can be the teacher's real position instead of a disconnected manual
   * counter. See platform/teacher/liveTeachingSession.js.
   */
  const teachAssignmentLive = async (assignmentId, { forceRestart = false, classId: requestedClassId = null } = {}) => {
    // The class the Live Classroom panel was showing when the teacher chose the
    // lesson. Home can show the class in session while App's activeClass is a
    // different one; teaching must never be filed under the wrong class.
    const classId = requestedClassId || activeClass?.classId || null;
    if (!classId || !assignmentId) return;
    const assignmentData = assignments.find((assignment) => assignment.id === assignmentId);
    if (!assignmentData) return;
    // Only live work for THIS class can be taught (assignmentAvailability.js) —
    // the same rule that decides what the panel offers.
    if (!walkthroughEligibility({ assignment: assignmentData, classId, nowValue: Date.now(), gradingPeriodSettings }).eligible) return;
    const startIndex = getCurrentContentQuestionIndices(assignmentData)[0] ?? 0;
    const startRole = resolveQuestionActivityRole({
      question: getStoredAssignmentQuestions(assignmentData)[startIndex],
      assignment: assignmentData,
    });
    const startFresh = () => {
      // Reuse the exact isolated student-preview runtime. This happens locally;
      // a slow/failed Firestore lookup must never block a teacher from teaching.
      // Live Teaching walks the lesson runtime, a Test Cycle's Review included;
      // the Test Cycle student preview is a different screen.
      startTeacherPreview(assignmentId, { lessonRuntime: true });
      setLiveTeachingSession(startLiveTeachingSession({
        classId,
        assignmentId,
        assignment: assignmentData,
        storageQuestionIndex: startIndex,
        activityRole: startRole,
        nowValue: Date.now(),
        teacherUid: user?.id || null,
        teacherEmail: user?.email || null,
        suggestedWorkSeconds: getStoredAssignmentQuestions(assignmentData)[startIndex]?.suggestedWorkSeconds,
      }));
    };

    if (forceRestart) {
      startFresh();
      return;
    }

    const sessionId = walkthroughSessionId({ teacherUid: user?.id || user?.email, classId, assignmentId });
    try {
      // Resume is a convenience, never a launch dependency. Give Firestore a
      // very small budget to return an already-active session; after that we
      // start locally so classroom instruction is not held hostage by network.
      const lookup = await Promise.race([
        getDoc(doc(db, 'walkthroughSessions', sessionId)),
        new Promise((resolve) => window.setTimeout(() => resolve(null), 180)),
      ]);
      const saved = lookup?.exists() ? lookup.data() : null;
      const savedCheck = saved ? validatePersistedWalkthroughSession({
        session: saved,
        classId,
        assignmentId,
        teacherUid: user?.id || null,
        assignments,
        nowValue: Date.now(),
        gradingPeriodSettings,
      }) : null;
      if (saved?.active && !savedCheck?.valid) {
        // A saved session this class can no longer use is retired, not
        // restored; the teacher gets a fresh start below.
        setDoc(doc(db, 'walkthroughSessions', sessionId), { ...saved, active: false, updatedAt: Date.now() })
          .catch((error) => console.warn('Could not retire a stale Walkthrough session:', error));
      }
      if (savedCheck?.valid) {
        const resumed = saved;
        walkthroughWriteRef.current = Number(resumed.updatedAt) || 0;
        setLiveTeachingSession(resumed);
        setActiveAssignmentId(assignmentId);
        setCurrentQuestionIndex(Math.max(0, Number(resumed.storageQuestionIndex) || 0));
        setAssignmentNavigationCollapsed(true);
        setAssignmentOverviewExpanded(false);
        setActiveView('teacherPreview');
        return;
      }
    } catch (error) {
      console.warn('Walkthrough resume lookup unavailable; starting fresh:', error);
    }

    startFresh();
  };

  // Re-enters the exemplar at the teacher's last real position without
  // resetting previewTracker/previewScratchpads/previewSessionId, which are
  // untouched by simply switching activeView away and back.
  const resumeLiveTeaching = () => {
    if (!liveTeachingSession?.active || !liveTeachingSession.assignmentId) return;
    const assignmentData = assignments.find((assignment) => assignment.id === liveTeachingSession.assignmentId);
    if (!assignmentData) return;
    setActiveAssignmentId(liveTeachingSession.assignmentId);
    setCurrentQuestionIndex(liveTeachingSession.storageQuestionIndex);
    setAssignmentNavigationCollapsed(true);
    setAssignmentOverviewExpanded(false);
    setActiveView('teacherPreview');
  };
  return [startTeacherPreview, teachAssignmentLive, resumeLiveTeaching];
}
