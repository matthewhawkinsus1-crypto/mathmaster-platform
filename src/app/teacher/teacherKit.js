/*
 * THE TEACHER-ONLY LOGIC APP.JSX RUNS ITSELF (student pass 3, first load 2).
 *
 * App builds the needs-attention queue and the Action Center's
 * grade-transfer units, return check-ins and Test Cycle retest actions,
 * opens Assignment Review, offers a teacher's worksheets, publishes
 * to Google Classroom, reconciles extensions after an attendance correction,
 * opens, grants, closes, extends and moves a DOL and writes its attempts,
 * reads and records student support history, and names who is still working
 * before a feedback release with these. Only a teacher's
 * screen ever uses them, but imported by App they rode in every student's
 * first load (scripts/check-first-load-budget.mjs). App loads this module for a teacher
 * (./teacherKitLoader.js), and the teacher's screen waits for it, so nothing a
 * teacher sees is ever computed without it.
 *
 * Only re-exports: the logic stays in its own module, where its tests are.
 *
 * Not here: the Action Center's own model (platform/teacher/teacherActionCenter.js).
 * It is used only while the Action Center is open, so it loads then
 * (useTeacherActionCenterData), not before a teacher's Home draws.
 */
export { buildNeedsAttentionQueue } from '../../platform/teacher/needsAttention.js';
export { projectGradeTransferUnits } from '../../platform/gradeTransfer/gradeTransferProjection.js';
export { projectTestCycleTeacherActions } from '../../platform/teacher/testCycleActionProjection.js';
export {
  classDolFieldPatch,
  controlsRequestKey,
  createControlsRequestGate,
  planStudentDolGrant,
  runStudentControlsCalls,
} from '../../platform/assessment/dolAttemptGrantClient.js';
export { buildAttendanceCorrectionReviewEvent, resolveReturnCheckIns } from '../../platform/attendance/returnCheckIn.js';
export { normalizeLessonPublishingIntentV5 } from '../../platform/authoring/lessonPublishingIntent.js';
export {
  assignmentNeedsStudentForWorksheet,
  eligibleStudentsForTeacherWorksheet,
} from '../../platform/resources/teacherWorksheetEligibility.js';
export {
  classroomPostingMode,
  mappedCourseIdsForAssignment,
  shouldAutoPublishClassroomPackage,
} from '../../platform/classroom/automaticClassroomPublishing.js';
export { automaticClassroomTopicName } from '../../platform/classroom/classroomTopicNaming.js';
export { syncTeacherTopicStyle as teacherClassroomTopicStyle } from '../../platform/classroom/teacherTopicStyle.js';
export { listTeacherTestCycleRecords } from '../../services/testCycleService.js';
export {
  fetchAttendanceForClassDateRange,
  fetchStudentSupportHistory,
  recordStudentSupportEvent,
  subscribeStudentSessionSummaries,
  subscribeStudentSupportEvents,
} from '../../platform/teacher/studentSupportStore.js';
export {
  buildDolAttemptGrant,
  buildDolClose,
  buildDolDateMove,
  buildDolExtension,
  buildDolScheduleRestore,
  buildDolWindowOpening,
  scheduledDolDateFor,
} from '../../platform/assessment/assessmentRecovery.js';
export { describeFeedbackRelease, releaseHoldReport } from './feedbackReleaseHold.js';
export { createWeeklyPathProgressRefresh } from '../../platform/path/weeklyPathProgressRefresh.js';
export { followWeeklyPathProgress } from './weeklyPathProgress.js';
export { readReleaseControls } from './feedbackReleaseControls.js';
// A teacher's controls: the handlers behind the teacher's screen, which App
// builds each render from its own state once this kit is here (./controls/*).
export { createExportJsonDialogControls } from './controls/exportJsonDialogControls.js';
export { createAssignmentDeleteControls } from './controls/assignmentDeleteControls.js';
export { createAssignmentLibraryControls } from './controls/assignmentLibraryControls.js';
export { createClassSettingsControls } from './controls/classSettingsControls.js';
export { createWarmupSectionControls } from './controls/warmupSectionControls.js';
export { createGradebookNavigation } from './controls/gradebookNavigation.js';
export { createDolClassControls } from './controls/dolClassControls.js';
export { createAssignmentPreflightControls } from './controls/assignmentPreflightControls.js';
export { createTeacherScratchpadControls } from './controls/teacherScratchpadControls.js';
export { createTeacherWorksheetControls } from './controls/teacherWorksheetControls.js';
export { createAttendanceExtensionControls } from './controls/attendanceExtensionControls.js';
export { createClassroomPublishingControls } from './controls/classroomPublishingControls.js';
export { createPathPacingControls } from './controls/pathPacingControls.js';
export { createTeacherDialogViews } from './controls/teacherDialogViews.jsx';
