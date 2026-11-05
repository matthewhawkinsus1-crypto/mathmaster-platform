/*
 * The screens App loads on demand, moved out of App.jsx unchanged (the App
 * shell split, student push G). Each is its own chunk: a student or teacher
 * downloads a screen when they first open it, never at sign-in
 * (tests/platform/initialBundleBoundary.test.mjs).
 */
import { Suspense, createElement, lazy, useEffect, useState } from 'react';
// Not screens: what a student screen below wraps itself in (PF01).
import ScreenErrorBoundary from '../components/common/ScreenErrorBoundary.jsx';
import { CHUNK_RETRY, retryableChunk } from '../platform/runtime/retryableChunk.js';
import { STUDENT_DESTINATION } from '../platform/student/navigationModel.js';
import { focusAlreadyPlaced, focusScreenHeading } from './shell/screenChange.js';

export const ClassroomManagerV2 = lazy(() => import('../ClassroomManagerV2.jsx'));
export const AssignmentQuestionEditor = lazy(() => import('../AssignmentQuestionEditor.jsx'));
export const QuestionEngine = lazy(() => import('../QuestionEngine.jsx'));
export const AssignmentIntake = lazy(() => import('../AssignmentIntake.jsx'));
export const TeacherQuestionReviewPanel = lazy(() => import('../components/teacher/TeacherQuestionReviewPanel.jsx'));
// The teacher's whole screen (student push G2): App's teacher branch, moved
// verbatim, with the modules only it reaches.
export const TeacherWorkspace = lazy(() => import('../app/teacher/TeacherWorkspace.jsx'));
export const TeacherSidebar = lazy(() => import('../TeacherSidebar.jsx'));
export const GradeTransferCenter = lazy(() => import('../components/teacher/GradeTransferCenter.jsx'));
export const AssignmentLibrary = lazy(() => import('../AssignmentLibrary.jsx'));
export const TeacherAssignmentPdfDialog = lazy(() => import('../components/teacher/TeacherAssignmentPdfDialog.jsx'));
export const AssignmentContentUpgradeModal = lazy(() => import('../components/teacher/AssignmentContentUpgradeModal.jsx'));
export const ClassesWorkspace = lazy(() => import('../ClassesWorkspace.jsx'));
export const TeacherHome = lazy(() => import('../TeacherHome.jsx'));
export const TexasStandardsDashboard = lazy(() => import('../TexasStandardsDashboard.jsx'));
export const MathToolsLab = lazy(() => import('../dev/MathToolsLab.jsx'));
export const LessonPreflightModal = lazy(() => import('../components/teacher/LessonPreflightModal.jsx'));
export const MyMathPathApp = lazy(() => import('../components/student/MyMathPathApp.jsx'));
export const StudentSecureExamDashboard = lazy(() => import('../components/assessment/StudentSecureExamDashboard.jsx'));
export const TeacherSecureExamDashboard = lazy(() => import('../components/assessment/TeacherSecureExamDashboard.jsx'));
export const TeacherAnalyticsDashboard = lazy(() => import('../components/analytics/TeacherAnalyticsDashboard.jsx'));
// Student Case Review / Academic Evidence Deep Dive: its code loads only when a
// teacher opens it from the student drawer (docs/STUDENT_CASE_REVIEW_DESIGN.md).
export const StudentCaseReviewView = lazy(() => import('../components/teacher/caseReview/StudentCaseReviewView.jsx'));
export const DemoExperience = lazy(() => import('../components/demo/DemoExperience.jsx'));
export const StudentsRoster = lazy(() => import('../components/teacher/StudentsRoster.jsx'));
export const ClassCourseSettings = lazy(() => import('../components/teacher/ClassCourseSettings.jsx'));
export const ClassScheduleSettings = lazy(() => import('../components/teacher/ClassScheduleSettings.jsx'));
export const PathSimulator = lazy(() => import('../components/teacher/PathSimulator.jsx'));
export const PacingControls = lazy(() => import('../components/teacher/PacingControls.jsx'));
export const MarkingPeriodSettings = lazy(() => import('../components/teacher/MarkingPeriodSettings.jsx'));
export const WarmupChallengeGate = lazy(() => import('../components/liveChallenge/WarmupChallengeGate.jsx'));
export const LiveChallengeTeacher = lazy(() => import('../components/liveChallenge/LiveChallengeTeacher.jsx'));
export const LiveChallengeStudent = lazy(() => import('../components/liveChallenge/LiveChallengeStudent.jsx'));
// Only a student opening a Test Cycle needs this, and it brings the secure
// exam player, the calculator and all of MathLive with it — about 1 MB that a
// static import put in front of every sign-in.
export const TestCycleCard = lazy(() => import('../components/student/TestCycleCard.jsx'));
export const TestCyclePreview = lazy(() => import('../components/teacher/TestCyclePreview.jsx'));
// The Recovery runner mounts QuestionEngine, and with it MathLive (~780 KB):
// a student who opens a Recovery fetches it then, not every student at sign-in.
export const SectionRecoveryRunner = lazy(() => import('../components/student/SectionRecoveryRunner.jsx'));

/*
 * THE STUDENT'S GRADES, ASSIGNMENTS, REWARDS AND RESULT SCREENS (PF01).
 *
 * About 16 KB gzip of every student's first load, needed only after opening
 * one of them. Each loads on demand, and App fetches all four while the
 * browser is idle on Home (app/student/studentScreenPrefetch.js), so opening
 * one is as quick as before. Like a teacher panel, a student screen carries
 * what it needs, and App's JSX is unchanged:
 *
 *   - its code, drawn at once when it is already here (after the prefetch);
 *   - until then a calm "Opening …" in the screen's place, marked busy, so
 *     the shell's focus waits for the screen's heading (shell/screenChange.js);
 *   - a boundary of its own for code that cannot load (offline before the
 *     prefetch finished, or a deploy replaced the chunk): a short message with
 *     Try again in the screen's place, never a blank screen or the app-wide
 *     panel. Try again really asks again (platform/runtime/retryableChunk.js),
 *     and the screen it brings back takes focus on its heading, as a screen
 *     change does: the button that had focus is gone.
 */
const STUDENT_SCREEN_FRAME = { minHeight: '100vh', boxSizing: 'border-box', padding: '20px 14px 48px', background: 'var(--mm-surface-control)' };
const STUDENT_SCREEN_STATUS = { maxWidth: 920, margin: '0 auto', textAlign: 'left', color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' };
// Code a student's screen loads on demand, a visit at a time: its loader, the
// answer its boundary asks for when Try again is pressed (`retryChunk`), and
// the Visit that draws it. `fallback()` is drawn while the code is on its way,
// and `focusArrival()` puts focus on what a Try again brought back.
const onDemand = (load, { fallback, focusArrival }) => {
  const chunk = retryableChunk(load);
  // Try again's button had focus, and goes with the panel. The visit it brings
  // back puts focus on what it draws, once it is drawn.
  let focusOnArrival = false;
  const retryChunk = (error) => {
    const next = chunk.retry(error);
    focusOnArrival = next === CHUNK_RETRY.LOAD;
    return next;
  };
  // Around the screen, inside the visit's Suspense boundary, so its effect
  // runs only once the screen itself is on the page. Its one child keeps the
  // screen's place in the tree, and so the ids it draws (useId).
  const Arrived = ({ children }) => {
    useEffect(() => {
      if (!focusOnArrival) return;
      focusOnArrival = false;
      focusArrival();
    }, []);
    return children;
  };
  // One visit to the screen. What it draws is chosen once, ABOVE the Suspense
  // boundary: a component whose first mount suspends is thrown away and
  // mounted again, so a lazy chosen below it would be a new one each time, and
  // a failed load would never reach the boundary ("Opening …" for good). The
  // screen itself when its code is here (no "Opening …" at all), else a lazy
  // of its own: React.lazy keeps a rejected import, and the boundary unmounts
  // a failed visit, so Try again mounts a new one with a new lazy.
  const Visit = (props) => {
    const [Screen] = useState(() => chunk.loaded()?.default || lazy(chunk.load));
    return createElement(Suspense, { fallback: fallback() }, createElement(Arrived, null, createElement(Screen, props)));
  };
  return { chunk, retryChunk, Visit };
};
const studentScreen = (load, opening) => {
  const { chunk, retryChunk, Visit } = onDemand(load, {
    fallback: () => createElement('div', { 'aria-busy': 'true', 'data-student-screen-opening': '', style: STUDENT_SCREEN_FRAME },
      createElement('p', { role: 'status', style: STUDENT_SCREEN_STATUS }, opening)),
    // The screen's heading, as a screen change does (shell/screenChange.js, NAV-3).
    focusArrival: () => focusScreenHeading(document),
  });
  const StudentScreen = (props) => {
    // The way Home each screen is handed: Grades, Assignments and Rewards
    // navigate (onNavigate); the result page has its own (onBackToHome).
    const home = props.onBackToHome || (props.onNavigate ? () => props.onNavigate(STUDENT_DESTINATION.HOME) : null);
    return createElement(ScreenErrorBoundary, { source: 'student-screen', retryChunk, exitLabel: 'Back to Home', onExit: home },
      createElement(Visit, props));
  };
  StudentScreen.prefetch = () => chunk.load().catch(() => { /* opening the screen asks again */ });
  return StudentScreen;
};
export const StudentGradeCenter = studentScreen(() => import('../components/student/StudentGradeCenter.jsx'), 'Opening your grades…');
export const StudentAssignmentsCenter = studentScreen(() => import('../components/student/StudentAssignmentsCenter.jsx'), 'Opening your assignments…');
export const StudentRewardsCenter = studentScreen(() => import('../components/student/rewards/StudentRewardsCenter.jsx'), 'Opening your rewards…');
export const StudentAssignmentResult = studentScreen(() => import('../components/student/StudentAssignmentResult.jsx'), 'Opening your result…');

/*
 * REVIEW MY WORK, IN A PLACE OF ITS OWN ON THE RESULT PAGE.
 *
 * The result page draws it once the work is closed for the student and its
 * feedback is released (App.jsx). Its code is the largest a student meets:
 * about 1 MB with MathLive, which the worked-solution renderers pull. So it
 * stays out of the first load (initialBundleBoundary.test.mjs), and Home's
 * idle prefetch leaves it alone too. Offline before it had loaded once, its
 * code could not arrive, and the failure reached the result screen's own
 * boundary: the whole page said "This screen could not load", grade and all
 * (PF01). A panel has a boundary of its own: the rest of the page stays, and
 * only the panel's place says it needs a connection, with a Try again that
 * really asks again (retryableChunk.js, as for a screen), and focus on the
 * panel's heading once it is here. While its code is on its way, `loading`;
 * when it cannot arrive, `codeTitle`. Its `name` marks its place and its
 * reports.
 */
const STUDENT_PANEL_STATUS = { margin: '14px 0 0' };
const studentPanel = (load, { name, loading, codeTitle }) => {
  const { retryChunk, Visit } = onDemand(load, {
    fallback: () => createElement('p', { role: 'status', style: STUDENT_PANEL_STATUS }, loading),
    focusArrival: () => {
      // Never away from where the student put focus while it loaded.
      if (focusAlreadyPlaced(document)) return;
      const heading = document.querySelector(`[data-student-panel="${name}"]`)?.querySelector('h1, h2, h3');
      if (!heading) return;
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    },
  });
  // Its place in the page's flow holds the panel, or the boundary's message.
  const StudentPanel = (props) => createElement('div', { 'data-student-panel': name, style: { minWidth: 0 } },
    createElement(ScreenErrorBoundary, { source: name, retryChunk, codeTitle }, createElement(Visit, props)));
  return StudentPanel;
};
export const ReviewMyWork = studentPanel(() => import('../components/student/ReviewMyWork.jsx'), { name: 'review-my-work', loading: 'Loading your work…', codeTitle: 'Review My Work needs a connection' });

/*
 * TEACHER-ONLY PANELS (student push G2). App rendered these from static
 * imports, so every student's Home downloaded them and the 115 modules only
 * they reach (scripts/first-load-baseline.json). Each now loads the first time
 * a teacher's screen draws it.
 *
 * A panel carries its own Suspense boundary, so App's JSX is unchanged and a
 * panel that is still loading draws nothing in its place: without one, the
 * nearest boundary is AppShell's, which would swap the whole teacher
 * workspace for the loading screen while one panel downloads.
 */
const teacherPanel = (load) => {
  const Lazy = lazy(load);
  const Panel = (props) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
  return Panel;
};
export const SupportEvidenceReportView = teacherPanel(() => import('../components/teacher/SupportEvidenceReportView.jsx'));
export const ClassContextBar = teacherPanel(() => import('../components/teacher/ClassContextBar.jsx'));
export const WeeklyPathGradePanel = teacherPanel(() => import('../components/teacher/WeeklyPathGradePanel.jsx'));
export const ClassroomSyncReview = teacherPanel(() => import('../components/teacher/ClassroomSyncReview.jsx'));
export const TeacherQuickSearch = teacherPanel(() => import('../components/teacher/TeacherQuickSearch.jsx'));
export const StudentProfileDrawer = teacherPanel(() => import('../components/teacher/StudentProfileDrawer.jsx'));
export const AssignmentHub = teacherPanel(() => import('../components/teacher/AssignmentHub.jsx'));
export const GradebookAssignmentBar = teacherPanel(() => import('../components/teacher/GradebookAssignmentBar.jsx'));
// A named export of the same module (lazy() takes a default).
export const GradebookClassChooser = teacherPanel(() => import('../components/teacher/GradebookAssignmentBar.jsx').then((module) => ({ default: module.GradebookClassChooser })));
export const StudentResponseInspector = teacherPanel(() => import('../components/teacher/StudentResponseInspector.jsx'));
export const AssignmentGradeOverrideControls = teacherPanel(() => import('../components/teacher/AssignmentGradeOverrideControls.jsx'));
export const SectionRecoveryAuditTrail = teacherPanel(() => import('../components/teacher/SectionRecoveryAuditTrail.jsx'));
export const StudentDolRecoveryRow = teacherPanel(() => import('../components/teacher/StudentDolRecoveryRow.jsx'));
export const ClassRewardCatalogEditor = teacherPanel(() => import('../components/rewards/ClassRewardCatalogEditor.jsx'));
export const ClassRewardRequestsPanel = teacherPanel(() => import('../components/rewards/ClassRewardRequestsPanel.jsx'));
export const WeeklyPathControls = teacherPanel(() => import('../components/teacher/WeeklyPathControls.jsx'));
export const SignInAccess = teacherPanel(() => import('../SignInAccess.jsx'));
export const ClassesAdmin = teacherPanel(() => import('../components/admin/ClassesAdmin.jsx'));
export const PreproductionReset = teacherPanel(() => import('../components/admin/PreproductionReset.jsx'));
export const AssignmentAiHealth = teacherPanel(() => import('../components/admin/AssignmentAiHealth.jsx'));
export const PathCoverageAudit = teacherPanel(() => import('../components/teacher/PathCoverageAudit.jsx'));
export const AttendanceHistoryPanel = teacherPanel(() => import('../components/teacher/AttendanceHistoryPanel.jsx'));
export const ParentContactCenter = teacherPanel(() => import('../components/teacher/ParentContactCenter.jsx'));
export const TeacherActionCenter = teacherPanel(() => import('../components/teacher/TeacherActionCenter.jsx'));
