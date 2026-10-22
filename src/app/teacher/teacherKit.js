/*
 * THE TEACHER-ONLY LOGIC APP.JSX RUNS ITSELF (student pass 3, first load 2).
 *
 * App builds the needs-attention queue and the Action Center's items (and
 * their grade-transfer units, return check-ins and Test Cycle retest
 * actions), opens Assignment Review, offers a teacher's worksheets, publishes
 * to Google Classroom, reconciles extensions after an attendance correction,
 * opens, grants, closes, extends and moves a DOL and writes its attempts, and
 * reads and records student support history with these. Only a teacher's
 * screen ever uses them, but imported by App they rode in every student's
 * first load (scripts/check-first-load-budget.mjs). App loads this module for a teacher
 * (./teacherKitLoader.js), and the teacher's screen waits for it, so nothing a
 * teacher sees is ever computed without it.
 *
 * Only re-exports: the logic stays in its own module, where its tests are.
 */
export { buildNeedsAttentionQueue } from '../../platform/teacher/needsAttention.js';
export { buildTeacherActionItems, openTeacherActionCount } from '../../platform/teacher/teacherActionCenter.js';
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
export { buildStudentExtensionPatch, reconcileAssignmentExtensionsForCorrection } from '../../platform/attendance/extensionReconciliation.js';
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
