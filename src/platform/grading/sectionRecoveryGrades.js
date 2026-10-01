/*
 * A COMPLETED RECOVERY, IN THE BROWSER'S GRADE CALCULATION.
 *
 * The browser half of functions/shared/sectionRecoveryProjection.mjs (the
 * Classroom triggers use the same projection through
 * functions/lib/sectionRecoveryGrades.js). Applied to a tracker AFTER teacher
 * per-question overrides have been folded in, so the original section score a
 * Recovery is compared against includes any teacher correction; the
 * assignment-level teacher override still replaces the whole grade afterwards.
 *
 * With no completed Recovery for the assignment the tracker is returned as-is,
 * so every assignment without one grades exactly as it always did.
 */

import { splitGradesBySection } from '../teacher/gradeEvidence.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import {
  applySectionRecoveriesToTracker,
  completedSectionRecoveries,
} from '../../../functions/shared/sectionRecoveryProjection.mjs';

export const projectSectionRecoveryForAssignment = ({
  tracker = null,
  assignment = null,
  recoveryByAssignment = null,
} = {}) => {
  const recoveries = completedSectionRecoveries(recoveryByAssignment?.[assignment?.id]);
  if (!tracker || !assignment || !Object.keys(recoveries).length) return { tracker, states: {} };
  const sections = splitGradesBySection({ tracker, assignment });
  const entries = projectCurrentAssignmentContent(assignment).entries;
  const indicesFor = (role) => entries.filter((entry) => entry.logicalRole === role).map((entry) => entry.storageIndex);
  return applySectionRecoveriesToTracker({
    tracker,
    sectionIndices: { warmup: indicesFor('warmup'), dol: indicesFor('dol') },
    sectionOriginals: { warmup: sections.warmup, dol: sections.dol },
    recoveries,
    assignment,
  });
};

/** The same projection over every assignment tracker a student has. */
export const projectSectionRecoveriesForDisplay = (gradesByAssignment = {}, recoveryByAssignment = {}, assignmentsById = {}) => {
  if (!recoveryByAssignment || !Object.keys(recoveryByAssignment).length) return gradesByAssignment;
  let changed = false;
  const next = { ...(gradesByAssignment || {}) };
  Object.keys(recoveryByAssignment).forEach((assignmentId) => {
    const assignment = assignmentsById?.[assignmentId];
    if (!assignment || !next[assignmentId]) return;
    const projected = projectSectionRecoveryForAssignment({ tracker: next[assignmentId], assignment, recoveryByAssignment });
    if (projected.tracker !== next[assignmentId]) {
      next[assignmentId] = projected.tracker;
      changed = true;
    }
  });
  return changed ? next : gradesByAssignment;
};
