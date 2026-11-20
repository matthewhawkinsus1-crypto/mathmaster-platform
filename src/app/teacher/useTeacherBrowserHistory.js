/*
 * THE TEACHER'S BROWSER HISTORY: BACK AND FORWARD MOVE THROUGH THE TEACHER'S SCREENS, AND THE ADDRESS BAR NAMES THE ONE IN VIEW.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitRouting.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useMemo } from 'react';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { readRouteOwner } from '../../platform/student/browserHistory.js';
import { teacherUrlFor } from '../routes/browserUrl.js';
import {
  TEACHER_HISTORY_DOCUMENT_ID, planTeacherHistoryWrite, readTeacherHistoryEntry, teacherRouteKey,
  teacherRouteSignature, writeTeacherRouteState,
} from '../../platform/teacher/teacherBrowserHistory.js';
import { isRootAdminEmail } from '../../../functions/shared/rolePolicy.mjs';

export function useTeacherBrowserHistory(
  toastInfo, user, urlArrival, activeView, setActiveView, setTeacherTab, teacherTab, setTeacherWorkspaceMode,
  teacherWorkspaceMode, adminTab, setAdminTab, setHomeNavigationPeriod, liveTeachingSession, assignments,
  profileDrawerStudentId, setProfileDrawerStudentId, setSupportReportStudentId, supportReportStudentId,
  caseReviewStudentId, setCaseReviewStudentId, assignmentHubTarget, setAssignmentHubTarget, setLiveFocus,
  classroomSyncProposal, setQuickSearchOpen, activeAssignmentId, setActiveAssignmentId, teacherScratchpadDialog,
  responseInspectorTarget, teacherWorksheetDialog, currentQuestionIndex, setCurrentQuestionIndex,
  questionEditorAssignment, contentUpgradeRequest, teacherBrowserHistoryReadyRef, teacherHistoryStepBackAtRef,
  teacherHistoryRestoreRef, previewTrackerAssignmentIdRef, assignmentPreflight, exportJsonAssignment, deleteDialog,
  setTestCyclePreviewAssignment, testCyclePreviewAssignment, startTeacherPreview, resumeLiveTeaching,
) {
  /*
   * BROWSER BACK AND FORWARD FOR THE TEACHER.
   *
   * The teacher workspace is state-driven, like the student side, so without
   * History API entries the browser treats every teacher screen as one page and
   * a single Back press leaves MathMaster — the classic way to lose the room
   * mid-lesson. Each screen (a sidebar tab, an Administration tab, the "View as
   * Student" / Live Teaching preview) and each panel opened over a screen (an
   * assignment's hub, a student's drawer, case review, support report, the Test
   * Cycle preview) gets its own entry. The rules live in
   * platform/teacher/teacherBrowserHistory.js.
   *
   * The arrival entry is marked as where the teacher started. Back from there
   * still leaves the site — that is the browser's, not MathMaster's, to take.
   */
  const teacherBrowserRoute = useMemo(() => {
    if (user?.role !== 'teacher') return null;
    if (activeView === 'teacherPreview') {
      return { surface: 'preview', assignmentId: activeAssignmentId || '', questionIndex: currentQuestionIndex };
    }
    const administrationVisible = teacherWorkspaceMode === 'administration'
      && (user.isRootAdmin === true || isRootAdminEmail(user.email));
    if (administrationVisible) return { surface: 'administration', adminTab };
    return {
      surface: 'workspace',
      tab: teacherTab,
      panels: {
        hubAssignmentId: assignmentHubTarget?.assignmentId,
        hubClassId: assignmentHubTarget?.classId,
        studentId: profileDrawerStudentId,
        caseReviewStudentId,
        supportReportStudentId,
        testCyclePreviewAssignmentId: testCyclePreviewAssignment?.id,
      },
    };
  }, [
    user?.role, user?.isRootAdmin, user?.email, activeView, activeAssignmentId, currentQuestionIndex,
    teacherWorkspaceMode, adminTab, teacherTab, assignmentHubTarget, profileDrawerStudentId,
    caseReviewStudentId, supportReportStudentId, testCyclePreviewAssignment?.id,
  ]);

  useEffect(() => {
    if (!teacherBrowserRoute) {
      teacherBrowserHistoryReadyRef.current = false;
      return;
    }
    // The address the page opened at has not been opened yet (urlArrival).
    if (urlArrival) return;
    // The screen's address: the tab and an open assignment monitor only —
    // never a student's drawer, case review or report (app/routes/appUrl.js).
    const url = teacherUrlFor(teacherBrowserRoute);
    // The entry the teacher arrived on (sign-in, a reload, a bookmark) becomes
    // this screen. Later screens are pushed after it.
    if (!teacherBrowserHistoryReadyRef.current) {
      teacherBrowserHistoryReadyRef.current = true;
      writeTeacherRouteState(teacherBrowserRoute, {
        replace: true, documentId: TEACHER_HISTORY_DOCUMENT_ID, url, owner: user?.uid,
        fresh: readRouteOwner(window.history.state) !== user?.uid,
      });
      return;
    }

    // A step back is in flight: the browser is about to land on the entry this
    // screen already matches, and its popstate clears the mark.
    if (Date.now() - teacherHistoryStepBackAtRef.current < 1000) return;

    const plan = planTeacherHistoryWrite({
      entry: readTeacherHistoryEntry(window.history.state),
      target: teacherBrowserRoute,
      documentId: TEACHER_HISTORY_DOCUMENT_ID,
    });
    if (plan.action === 'back') {
      teacherHistoryStepBackAtRef.current = Date.now();
      window.history.back();
      return;
    }
    if (plan.action === 'replace' || plan.action === 'push') {
      writeTeacherRouteState(teacherBrowserRoute, {
        replace: plan.action === 'replace',
        fromKey: plan.fromKey,
        documentId: plan.documentId,
        url,
        owner: user?.uid,
      });
    }
  }, [teacherBrowserRoute, urlArrival]);

  // A dialog that can hold work or a decision. Back never acts underneath one:
  // the page it would reveal is not the page the dialog belongs to, and an
  // editor's unsaved changes are not something Back should be able to discard.
  // These render only over the teacher workspace, so only there do they block.
  const teacherDialogOpen = teacherBrowserRoute?.surface === 'workspace' && Boolean(
    questionEditorAssignment || contentUpgradeRequest || assignmentPreflight || deleteDialog
    || classroomSyncProposal || teacherWorksheetDialog || exportJsonAssignment
    || teacherScratchpadDialog || responseInspectorTarget,
  );

  // Re-assigned every render so the listener below always restores with the
  // newest assignments and Live Teaching session, without re-subscribing.
  teacherHistoryRestoreRef.current = (event) => {
    const ownStepBack = Date.now() - teacherHistoryStepBackAtRef.current < 1000;
    teacherHistoryStepBackAtRef.current = 0;
    const entry = readTeacherHistoryEntry(event.state);
    if (!entry) return;
    const route = entry.route;
    // An entry another account wrote (platform/student/browserHistory.js):
    // never restored; this screen's entry takes its place.
    if (readRouteOwner(event.state) !== user?.uid) {
      if (teacherBrowserRoute) {
        writeTeacherRouteState(teacherBrowserRoute, {
          replace: true, documentId: TEACHER_HISTORY_DOCUMENT_ID, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid, fresh: true,
        });
      }
      return;
    }

    // The popstate from closing a panel: the screen already shows this entry
    // (that is why App stepped back to it). Nothing to restore — and a dialog
    // opened by the same click (the hub's "Edit questions") must not read it
    // as the teacher pressing Back.
    if (ownStepBack) {
      if (teacherBrowserRoute && teacherRouteSignature(route) !== teacherRouteSignature(teacherBrowserRoute)) {
        writeTeacherRouteState(teacherBrowserRoute, { replace: true, fromKey: entry.fromKey, documentId: entry.documentId, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid });
      }
      return;
    }

    if (teacherDialogOpen) {
      // The browser has already moved; put this screen's entry back and stay.
      if (teacherBrowserRoute) {
        writeTeacherRouteState(teacherBrowserRoute, { fromKey: teacherRouteKey(route), documentId: TEACHER_HISTORY_DOCUMENT_ID, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid });
      }
      toastInfo('Close the open window first', 'Save or close what is open, then use Back. Nothing was changed.');
      return;
    }

    setQuickSearchOpen(false);

    if (route.surface === 'preview') {
      const assignmentData = assignments.find((assignment) => String(assignment.id) === route.assignmentId);
      const isLiveLesson = liveTeachingSession?.active && String(liveTeachingSession.assignmentId) === route.assignmentId;
      if (assignmentData && isLiveLesson) {
        resumeLiveTeaching();
        return;
      }
      if (assignmentData && previewTrackerAssignmentIdRef.current === route.assignmentId) {
        // The preview's in-memory work is still this assignment's: step back
        // into it where the teacher left it.
        setActiveAssignmentId(assignmentData.id);
        setCurrentQuestionIndex(route.questionIndex);
        setActiveView('teacherPreview');
        return;
      }
      if (assignmentData && getStoredAssignmentQuestions(assignmentData).length) {
        // Preview is in-memory and always starts blank; another preview has
        // run since, so this one starts again from the top.
        startTeacherPreview(assignmentData.id, { lessonRuntime: true });
        return;
      }
      // The assignment is gone. Stay on the current screen and make this entry
      // say so, rather than leave Back pointing at a preview that cannot open.
      if (teacherBrowserRoute) {
        writeTeacherRouteState(teacherBrowserRoute, { replace: true, fromKey: entry.fromKey, documentId: entry.documentId, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid });
      }
      return;
    }

    // Leaving the preview by Back is the same as its own exit button: the
    // Live Teaching session stays running, with Resume on Live Classroom.
    if (activeView === 'teacherPreview') setActiveAssignmentId(null);
    setActiveView('dashboard');

    if (route.surface === 'administration') {
      setTeacherWorkspaceMode('administration');
      setAdminTab(route.adminTab);
      return;
    }

    setTeacherWorkspaceMode('teacher');
    if (route.tab !== teacherTab) {
      setTeacherTab(route.tab);
      // The same one-shot hand-offs the sidebar clears on a tab change. The
      // Gradebook's class and assignment are left alone: Back into Grades
      // should show the assignment the teacher was reading.
      setHomeNavigationPeriod(null);
      setLiveFocus(null);
    }
    const { panels } = route;
    setAssignmentHubTarget((current) => {
      if (!panels.hubAssignmentId) return null;
      return current?.assignmentId === panels.hubAssignmentId
        ? current
        : { assignmentId: panels.hubAssignmentId, classId: panels.hubClassId || null };
    });
    setProfileDrawerStudentId(panels.studentId || null);
    setCaseReviewStudentId(panels.caseReviewStudentId || null);
    setSupportReportStudentId(panels.supportReportStudentId || null);
    setTestCyclePreviewAssignment((current) => {
      if (!panels.testCyclePreviewAssignmentId) return null;
      if (current?.id === panels.testCyclePreviewAssignmentId) return current;
      return assignments.find((assignment) => String(assignment.id) === panels.testCyclePreviewAssignmentId) || null;
    });
  };
}
