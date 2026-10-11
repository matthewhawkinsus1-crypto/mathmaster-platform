/*
 * The screens App loads on demand, moved out of App.jsx unchanged (the App
 * shell split, student push G). Each is its own chunk: a student or teacher
 * downloads a screen when they first open it, never at sign-in
 * (tests/platform/initialBundleBoundary.test.mjs).
 */
import { lazy } from 'react';

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
