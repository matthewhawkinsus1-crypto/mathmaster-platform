/*
 * THE STUDENT'S RECOVERY DECISIONS, LOADED AFTER HOME (Recovery V2).
 *
 * Deciding a Warm-Up or DOL Recovery runs the server's own rules
 * (functions/shared/sectionRecoveryService.mjs): the readiness of every slot,
 * the assignment's certified Recovery content, the mastery gate over Recovery
 * Practice and the assignment's own Practice, and the next Practice question.
 * Home does not need any of it to appear, and imported by App it rode in every
 * student's first load (scripts/check-first-load-budget.mjs). App loads this
 * module for a student (./studentRecoveryKitLoader.js); every Recovery surface
 * — Home's list, the Assignments Center, the assignment header, the Results
 * panel, the dashboard's "Today" rule — fills in when it arrives, and none
 * offers a Recovery before then.
 *
 * Only re-exports: the logic stays in its own module, where its tests are.
 */
export { buildStudentRecoverySummary } from '../../platform/recovery/studentRecoveryModel.js';
export { buildStudentRecoveryDiscovery } from '../../platform/recovery/studentRecoveryDiscovery.js';
export { buildRecoverySummariesByAssignment } from '../../platform/student/recoverySummaries.js';
