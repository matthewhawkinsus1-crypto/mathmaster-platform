const ACTIONABLE_STAGES = new Set(['awaitingRelease', 'retestSubmitted', 'retestReady']);
const COMPLETE_STAGES = new Set(['passed', 'complete', 'retestClosed']);

/** Projects canonical server rows; it never derives a stage or grade. */
export const projectTestCycleTeacherActions = ({ records = [], assignment = {} } = {}) => records
  .filter((row) => ACTIONABLE_STAGES.has(row?.stage) || COMPLETE_STAGES.has(row?.stage))
  .map((row) => ({
    id: `${assignment.id || row.assignmentId}:${row.studentId}`,
    studentId: row.studentId,
    studentName: row.studentName,
    classId: row.classId || assignment.classId || null,
    assignmentId: assignment.id || row.assignmentId || null,
    summary: ACTIONABLE_STAGES.has(row.stage) ? (row.statusLabel || 'Review Test Cycle follow-up.') : (row.statusLabel || 'Test Cycle complete.'),
    actionRequired: ACTIONABLE_STAGES.has(row.stage),
    completed: COMPLETE_STAGES.has(row.stage),
  }));

export default projectTestCycleTeacherActions;
