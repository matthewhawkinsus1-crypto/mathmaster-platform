/*
 * THE STUDENT'S BROWSER HISTORY: BACK AND FORWARD MOVE THROUGH THE STUDENT'S SCREENS BEFORE THEY LEAVE THE APP, AND THE ADDRESS BAR NAMES THE SCREEN AND QUESTION IN VIEW.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitRouting.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs). studentQuestionEntriesFor (a question's address) came up with it from further down App: the history effects are its first reader.
 */
import { useEffect, useMemo } from 'react';
import { getAssignmentLifecycle } from '../../assignmentLifecycle';
import { LEVEL as NAV_LEVEL, normalizeOrigin } from '../../platform/student/navigationModel.js';
import { describeOpenNotice, teacherClosedState } from '../../platform/student/studentOpenGate.js';
import { readRouteOwner, readStudentRouteState, recoveryResultPageRoute, studentRouteKey, writeStudentRouteState } from '../../platform/student/browserHistory.js';
import { studentUrlFor } from '../routes/browserUrl.js';
import { parseAppPath } from '../routes/appUrl.js';
import { questionAddressFor, studentQuestionEntries } from '../routes/questionAddress.js';
import { isSecureExamActive } from '../../platform/assessment/secureExamPresence.js';

export function useStudentBrowserHistory(
  toastInfo, user, hasPracticePassFor, studentRequiredFor, urlArrival, assignmentResultRoute,
  setAssignmentResultRoute, activeClassroomSectionKey, setActiveClassroomSectionKey, activeView, setActiveView,
  assignments, assignmentsRef, setPathLaunchTeks, activeAssignmentId, setActiveAssignmentId, currentQuestionIndex,
  setCurrentQuestionIndex, recoverySession, setRecoverySession, setStudentDashboardMode, studentDashboardMode,
  activeTestCycleAssignmentId, setActiveTestCycleAssignmentId, activeTestCycleOrigin, setActiveTestCycleOrigin,
  studentBrowserHistoryReadyRef, studentBrowserRouteRef, studentBrowserUrlRef, historyAccountRef,
) {
  const studentBrowserRoute = useMemo(() => {
    if (user?.role !== 'student') return null;
    if (activeView === 'assignment') {
      return {
        surface: 'assignment',
        assignmentId: activeAssignmentId || '',
        questionIndex: currentQuestionIndex,
        // A section-scoped Classroom launch, kept in this tab's entry (NV03).
        ...(activeClassroomSectionKey ? { sectionScope: activeClassroomSectionKey } : {}),
      };
    }
    // Assignment Result is its own entry so the required Back chain —
    // Practice -> Result -> Grades -> Home — has a browser entry per screen.
    if (activeView === 'assignmentResult') {
      const resultAssignmentId = assignmentResultRoute?.assignmentId || activeAssignmentId || '';
      return {
        surface: 'assignmentResult',
        assignmentId: resultAssignmentId,
        sectionKey: assignmentResultRoute?.sectionKey || '',
        origin: assignmentResultRoute?.origin || 'assignments',
        // The Recovery open over the page is an entry of its own (NV14).
        ...(recoverySession?.assignmentId === resultAssignmentId ? { recoverySection: recoverySession.section } : {}),
      };
    }
    return {
      surface: 'dashboard',
      dashboardMode: studentDashboardMode || 'assignments',
      // The test on screen and where it was opened from (NAV-9).
      ...(studentDashboardMode === 'testCycle'
        ? { testCycleAssignmentId: activeTestCycleAssignmentId || '', origin: activeTestCycleOrigin }
        : {}),
    };
  }, [user?.role, activeView, activeAssignmentId, currentQuestionIndex, activeClassroomSectionKey, studentDashboardMode, assignmentResultRoute, activeTestCycleAssignmentId, activeTestCycleOrigin, recoverySession?.assignmentId, recoverySession?.section]);

  useEffect(() => {
    if (!studentBrowserRoute) {
      studentBrowserHistoryReadyRef.current = false;
      return;
    }
    // The address the page opened at has not been opened yet: writing this
    // screen now would replace it with Home before sign-in finishes.
    if (urlArrival) return;

    const current = readStudentRouteState(window.history.state);
    const currentKey = current ? studentRouteKey(current) : null;
    const targetKey = studentRouteKey(studentBrowserRoute);
    // The screen's address: ids and the question's number in its section,
    // nothing about the work (app/routes/appUrl.js).
    const url = studentUrlFor(studentBrowserRoute, {
      question: studentBrowserRoute.surface === 'assignment'
        ? questionAddressFor(
          studentQuestionEntriesFor(assignments.find((assignment) => assignment.id === studentBrowserRoute.assignmentId)),
          studentBrowserRoute.questionIndex,
        )
        : null,
      testCycleAssignmentId: studentBrowserRoute.dashboardMode === 'testCycle' ? activeTestCycleAssignmentId : null,
    });

    // Mark the document entry the student arrived on as this screen. From
    // this point onward internal navigation pushes same-document entries.
    if (!studentBrowserHistoryReadyRef.current) {
      studentBrowserHistoryReadyRef.current = true;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      const ownEntry = readRouteOwner(window.history.state) === user?.uid;
      if (currentKey !== targetKey || (url && url !== currentUrl) || !ownEntry) {
        writeStudentRouteState(studentBrowserRoute, { replace: true, url, owner: user?.uid, fresh: !ownEntry });
      }
      studentBrowserUrlRef.current = url;
      return;
    }

    // A popstate restoration changes React state AFTER the browser has already
    // moved to the matching history entry. Seeing the same key here prevents
    // that restoration from immediately pushing a duplicate entry.
    if (currentKey !== targetKey) {
      // A Recovery opened from another screen sits on its result page's own
      // entry, so Back from it lands on the page (NV14).
      const resultPage = recoveryResultPageRoute(studentBrowserRoute);
      if (resultPage && studentRouteKey(resultPage) !== currentKey) writeStudentRouteState(resultPage, { url, owner: user?.uid });
      writeStudentRouteState(studentBrowserRoute, { url, owner: user?.uid });
    }
    studentBrowserUrlRef.current = url;
    // Only the route decides when to write; the rest is read for its address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentBrowserRoute, urlArrival]);
  useEffect(() => { studentBrowserRouteRef.current = studentBrowserRoute; }, [studentBrowserRoute]);

  useEffect(() => {
    if (user?.role !== 'student') return undefined;

    const restoreFromBrowserHistory = (event) => {
      /*
       * BACK DOES NOT LEAVE A SECURE EXAM.
       *
       * The browser has already moved to the previous entry; put the exam's
       * entry back and stay. Leaving would unmount the exam mid-question (the
       * answers are saved, but the student rarely meant it). Submitting, or the
       * exam's own exit after it is submitted, is the way out.
       */
      if (isSecureExamActive()) {
        if (studentBrowserRouteRef.current) writeStudentRouteState(studentBrowserRouteRef.current, { url: studentBrowserUrlRef.current, owner: historyAccountRef.current });
        toastInfo('Your test is still open', 'Use Submit test when you are finished. Your answers are saved as you type.');
        return;
      }
      const route = readStudentRouteState(event.state);
      if (!route) return;
      // An entry another account wrote (the previous student on this
      // Chromebook): never restored. This screen's entry takes its place.
      if (readRouteOwner(event.state) !== historyAccountRef.current) {
        if (studentBrowserRouteRef.current) {
          writeStudentRouteState(studentBrowserRouteRef.current, {
            replace: true, url: studentBrowserUrlRef.current, owner: historyAccountRef.current, fresh: true,
          });
        }
        return;
      }

      if (route.surface === 'assignment') {
        // Back/Forward onto a lesson the teacher has since paused or archived
        // lands on its result page, like every other way in (NAV-4).
        const closedNow = teacherClosedState(assignmentsRef.current.find((item) => item.id === route.assignmentId));
        if (closedNow) {
          setPathLaunchTeks(null);
          setActiveAssignmentId(route.assignmentId);
          setActiveClassroomSectionKey(null);
          setAssignmentResultRoute({
            assignmentId: route.assignmentId,
            sectionKey: 'whole',
            sectionLabel: null,
            questionIndex: 0,
            origin: NAV_LEVEL.ASSIGNMENTS,
            notice: describeOpenNotice({ kind: closedNow }),
          });
          setActiveView('assignmentResult');
          return;
        }
        setStudentDashboardMode('assignments');
        setPathLaunchTeks(null);
        setActiveAssignmentId(route.assignmentId || null);
        // Back onto a section-scoped launch shows that section again (NV03).
        setActiveClassroomSectionKey(route.sectionScope || null);
        setCurrentQuestionIndex(route.questionIndex || 0);
        setActiveView('assignment');
        return;
      }

      // Back onto a result entry restores the same assignment — and the same
      // Classroom section, when the student arrived through a split link.
      if (route.surface === 'assignmentResult') {
        setPathLaunchTeks(null);
        setActiveAssignmentId(route.assignmentId || null);
        setActiveClassroomSectionKey(route.sectionKey || null);
        setAssignmentResultRoute((current) => (
          current && current.assignmentId === route.assignmentId && current.origin === route.origin
            ? current
            : {
              assignmentId: route.assignmentId || '',
              sectionKey: route.sectionKey || 'whole',
              sectionLabel: null,
              questionIndex: 0,
              origin: route.origin || 'assignments',
            }
        ));
        // Back or Forward onto a Recovery's entry opens it again, where the
        // page's panel still offers it (mode null: the panel decides, below
        // the summary); onto the page itself, the Recovery closes (NV14).
        setRecoverySession((current) => {
          if (!route.recoverySection) return null;
          if (current?.assignmentId === route.assignmentId && current.section === route.recoverySection) return current;
          return { assignmentId: route.assignmentId, section: route.recoverySection, mode: null };
        });
        setActiveView('assignmentResult');
        return;
      }

      setActiveView('dashboard');
      setAssignmentResultRoute(null);
      setActiveClassroomSectionKey(null);
      setActiveAssignmentId(null);
      // Back onto a Test Cycle restores that test and its Back (NAV-9). An
      // entry written before it carried the test falls back to the address
      // (/test-cycle/<id>); with neither, Assignments rather than a blank card.
      if (route.dashboardMode === 'testCycle') {
        const fromAddress = parseAppPath(window.location.pathname)?.extras?.testCycleAssignmentId || null;
        const testCycleId = route.testCycleAssignmentId || fromAddress;
        if (!testCycleId) {
          setActiveTestCycleAssignmentId(null);
          setStudentDashboardMode('assignmentsCenter');
          return;
        }
        setActiveTestCycleAssignmentId(testCycleId);
        setActiveTestCycleOrigin(normalizeOrigin(NAV_LEVEL.TEST_CYCLE, route.origin));
      } else {
        setActiveTestCycleAssignmentId(null);
      }
      setStudentDashboardMode(route.dashboardMode || 'assignments');
      if (route.dashboardMode !== 'mathPath') setPathLaunchTeks(null);
    };

    window.addEventListener('popstate', restoreFromBrowserHistory);
    return () => window.removeEventListener('popstate', restoreFromBrowserHistory);
  }, [user?.role]);

  /*
   * A QUESTION'S ADDRESS (app/routes/questionAddress.js).
   *
   * The student's questions in the order and numbering the workspace uses:
   * less the items a reduced-item-count accommodation omits (never in
   * voluntary practice), exactly as renderAssignmentWorkspace builds
   * `projectedEntries`. The address bar, Home's Resume and the workspace
   * header therefore name the same "Classwork Question 2".
   */
  const studentQuestionEntriesFor = (assignmentData) => {
    if (!assignmentData) return [];
    const lifecycle = getAssignmentLifecycle(assignmentData, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    });
    const required = user?.role === 'student' && !lifecycle.isPracticeOnly
      ? studentRequiredFor(assignmentData, { hasPracticePass: hasPracticePassFor(assignmentData.id) })
      : null;
    return studentQuestionEntries(assignmentData, { omittedIndices: required?.omitted || [] });
  };
  return [studentBrowserRoute, studentQuestionEntriesFor];
}
