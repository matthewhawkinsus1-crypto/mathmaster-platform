import { buildStudentRecoverySummary } from '../recovery/studentRecoveryModel.js';
import { assignmentIsForStudent, getAssignmentLifecycle } from '../../assignmentLifecycle.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';

/*
 * RECOVERY FOR EVERY ASSIGNMENT, NOT ONLY THE RESULT PAGE ON SCREEN.
 *
 * Home's "Today" rule (a Recovery the student can take now keeps its section
 * open) and Grades' "Ways to raise your grade" both need to know which closed
 * Warm-Up/DOL sections have a Recovery, for every assignment. This runs the
 * same per-assignment summary the result page shows
 * (platform/recovery/studentRecoveryModel.js), so the list can never offer a
 * Recovery the panel would not.
 *
 * Only open assignments with a Warm-Up or DOL are summarized: Recovery closes
 * at the final submission date, and nothing else has one.
 *
 * Returns { [assignmentId]: summary[] } where each summary entry carries
 * `section`, `state`, `canStart`, `canContinue`, `canPractice`, `endsAtMs`.
 */
export const buildRecoverySummariesByAssignment = ({
  assignments = [],
  trackerByAssignment = {},
  sectionRecoveryByAssignment = {},
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  studentProfile = null,
  nowValue = Date.now(),
} = {}) => {
  if (!studentId) return {};
  const result = {};
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    if (!assignment?.id || !assignmentIsForStudent(assignment, { classId, classPeriod })) return;
    if (!getAssignmentLifecycle(assignment, nowValue, { studentId }).isOpen) return;
    const hasTimedSection = projectCurrentAssignmentContent(assignment).entries
      .some((entry) => entry.logicalRole === 'warmup' || entry.logicalRole === 'dol');
    if (!hasTimedSection) return;
    try {
      const summary = buildStudentRecoverySummary({
        assignment,
        tracker: trackerByAssignment?.[assignment.id] || {},
        recoveryForAssignment: sectionRecoveryByAssignment?.[assignment.id] || null,
        studentId,
        classId,
        classPeriod,
        schedule,
        studentProfile,
        nowValue,
      });
      if (summary.length) result[assignment.id] = summary;
    } catch {
      // A summary that cannot be built offers nothing; the result page will
      // still ask the server when the student opens it.
    }
  });
  return result;
};

/** { [assignmentId]: { warmup: 'unlocked', dol: 'locked' } } for the dashboard. */
export const recoveryStatesFromSummaries = (summariesByAssignment = {}) => Object.fromEntries(
  Object.entries(summariesByAssignment || {}).map(([assignmentId, summary]) => [
    assignmentId,
    Object.fromEntries((summary || []).map((entry) => [entry.section, entry.state])),
  ]),
);
