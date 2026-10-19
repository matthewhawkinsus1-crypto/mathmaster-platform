/*
 * THE TEACHER-ONLY LOGIC APP.JSX RUNS ITSELF (student pass 3, first load 2).
 *
 * App builds the needs-attention queue and the Action Center's items, opens
 * Assignment Review, offers a teacher's worksheets and publishes to Google
 * Classroom with these. Only a teacher's screen ever uses them, but imported by
 * App they rode in every student's first load
 * (scripts/check-first-load-budget.mjs). App loads this module for a teacher
 * (./teacherKitLoader.js), and the teacher's screen waits for it, so nothing a
 * teacher sees is ever computed without it.
 *
 * Only re-exports: the logic stays in its own module, where its tests are.
 */
export { buildNeedsAttentionQueue } from '../../platform/teacher/needsAttention.js';
export { buildTeacherActionItems, openTeacherActionCount } from '../../platform/teacher/teacherActionCenter.js';
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
