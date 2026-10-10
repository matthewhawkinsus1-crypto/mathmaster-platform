/*
 * OPENING THE ADDRESS THE PAGE ARRIVED AT.
 *
 * Once the account has loaded, the address is turned into a plan
 * (urlArrival.js) and the plan into the call a click makes: startAssignment,
 * openStudentAssignmentResult, openStudentDashboardMode, the Test Cycle card,
 * startTeacherPreview. So a typed or reloaded URL meets every gate a click
 * meets — class membership, release and prerequisite, section windows, the
 * Test Cycle card's server check, the secure-exam dashboard — and the
 * server's authority is unchanged.
 *
 * App owns the state and the actions; this hook only decides when the
 * arrival opens (once, with the account loaded) and which action it calls.
 */
import { useEffect, useRef } from 'react';
import { readMathPathRouteState, readStudentRouteState } from '../../platform/student/browserHistory.js';
import { readTeacherRouteState } from '../../platform/teacher/teacherBrowserHistory.js';
import { planStudentArrival, planTeacherArrival } from './urlArrival.js';

export const useUrlArrival = ({
  urlArrival,
  setUrlArrival,
  user,
  assignments,
  toastInfo,
  student,
  teacher,
}) => {
  const openedRef = useRef(null);
  useEffect(() => {
    if (!urlArrival || !user?.id) return;
    const arrival = urlArrival;
    setUrlArrival(null);
    // Once, even where an effect runs twice for the same state (StrictMode).
    if (openedRef.current === arrival) return;
    openedRef.current = arrival;
    if (user.role === 'student') {
      const plan = planStudentArrival({
        arrival,
        assignments,
        isTestCycle: student.isTestCycle,
        questionEntriesFor: student.questionEntriesFor,
        historyRoute: readStudentRouteState(window.history.state),
        mathPathRoute: readMathPathRouteState(window.history.state),
      });
      if (!plan) return;
      if (plan.message) toastInfo(plan.message.title, plan.message.body);
      if (plan.action === 'assignment') {
        student.startAssignment(plan.assignmentId, plan.storageIndex ?? 0, plan.exact ? { keepRequestedQuestion: true } : {});
      } else if (plan.action === 'result') {
        student.openStudentAssignmentResult(plan.assignmentId, { sectionKey: plan.sectionKey, origin: plan.origin });
      } else if (plan.action === 'testCycle') {
        student.setActiveTestCycleAssignmentId(plan.assignmentId);
        student.openStudentDashboardMode('testCycle');
      } else if (plan.action === 'mathPath') {
        student.openStudentDashboardMode('mathPath');
        student.setMathPathArrival({ tab: plan.tab, sessionConfig: plan.sessionConfig });
        if (plan.launchTeks) student.setPathLaunchTeks(plan.launchTeks);
      } else if (plan.action === 'dashboard') {
        student.openStudentDashboardMode(plan.mode);
      } else {
        student.openStudentDashboardMode('assignments');
      }
      return;
    }
    if (user.role !== 'teacher') return;
    const teacherPlan = planTeacherArrival({
      arrival,
      assignments,
      canAdminister: teacher.canAdminister,
      historyRoute: readTeacherRouteState(window.history.state),
    });
    if (!teacherPlan) return;
    if (teacherPlan.message) toastInfo(teacherPlan.message.title, teacherPlan.message.body);
    if (teacherPlan.action === 'preview') {
      teacher.startTeacherPreview(teacherPlan.assignmentId);
    } else if (teacherPlan.action === 'administration') {
      teacher.setTeacherWorkspaceMode('administration');
      teacher.setAdminTab(teacherPlan.adminTab);
    } else {
      teacher.setTeacherWorkspaceMode('teacher');
      teacher.setTeacherTab(teacherPlan.tab);
      if (teacherPlan.hubAssignmentId) {
        teacher.setAssignmentHubTarget({ assignmentId: teacherPlan.hubAssignmentId, classId: teacherPlan.hubClassId || null });
      }
    }
    // The arrival opens once, when the account has loaded; the actions App
    // hands in are this render's and read the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlArrival, user?.id, user?.role]);
};
