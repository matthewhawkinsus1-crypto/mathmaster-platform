/*
 * THE DASHBOARD'S VIEW OF EACH ASSIGNMENT'S RECOVERY.
 *
 * Home's "Today" rule reads one state per Warm-Up/DOL section. The summaries
 * it reads them from are built by buildRecoverySummariesByAssignment
 * (./recoverySummaries.js), which loads after Home with the student's
 * Recovery model; until they arrive this sees none.
 */

/** { [assignmentId]: { warmup: 'unlocked', dol: 'locked' } } for the dashboard. */
export const recoveryStatesFromSummaries = (summariesByAssignment = {}) => Object.fromEntries(
  Object.entries(summariesByAssignment || {}).map(([assignmentId, summary]) => [
    assignmentId,
    Object.fromEntries((summary || []).map((entry) => [entry.section, entry.state])),
  ]),
);
