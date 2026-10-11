/*
 * The screens App loads on demand, moved out of App.jsx unchanged (the App
 * shell split, student push G). Each is its own chunk: a student or teacher
 * downloads a screen when they first open it, never at sign-in
 * (tests/platform/initialBundleBoundary.test.mjs).
 */
import { Suspense, createElement, lazy } from 'react';

export const ClassroomManagerV2 = lazy(() => import('../ClassroomManagerV2.jsx'));
export const AssignmentQuestionEditor = lazy(() => import('../AssignmentQuestionEditor.jsx'));
export const QuestionEngine = lazy(() => import('../QuestionEngine.jsx'));
export const AssignmentIntake = lazy(() => import('../AssignmentIntake.jsx'));
export const TeacherQuestionReviewPanel = lazy(() => import('../components/teacher/TeacherQuestionReviewPanel.jsx'));
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
// Lazy: the worked-solution renderers pull MathLive, which stays out of the
// first load (initialBundleBoundary.test.mjs).
export const ReviewMyWork = lazy(() => import('../components/student/ReviewMyWork.jsx'));
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
