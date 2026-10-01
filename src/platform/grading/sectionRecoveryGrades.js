/*
 * A COMPLETED RECOVERY — AND A LIVE CHALLENGE WARM-UP RESULT — IN THE
 * BROWSER'S GRADE CALCULATION.
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
import { warmupChallengeScore } from '../../../functions/shared/warmupChallengeGrade.mjs';

export const projectSectionRecoveryForAssignment = ({
  tracker = null,
  assignment = null,
  recoveryByAssignment = null,
  // The student's `warmupChallengeByAssignment`: a Live Challenge Warm-Up
  // result is the Warm-Up grade (functions/shared/warmupChallengeGrade.mjs).
  challengeByAssignment = null,
} = {}) => {
  const recoveries = completedSectionRecoveries(recoveryByAssignment?.[assignment?.id]);
  const challengeCredit = warmupChallengeScore(challengeByAssignment?.[assignment?.id]) === null
    ? null
    : challengeByAssignment[assignment.id];
  if (!assignment || (!Object.keys(recoveries).length && !challengeCredit)) return { tracker, states: {}, challenge: null };
  // A student whose only Warm-Up work was the Live Challenge has no tracker
  // for the assignment yet; the challenge still counts.
  const base = tracker || (challengeCredit ? {} : null);
  if (!base) return { tracker, states: {}, challenge: null };
  const sections = splitGradesBySection({ tracker: base, assignment });
  const entries = projectCurrentAssignmentContent(assignment).entries;
  const indicesFor = (role) => entries.filter((entry) => entry.logicalRole === role).map((entry) => entry.storageIndex);
  return applySectionRecoveriesToTracker({
    tracker: base,
    sectionIndices: { warmup: indicesFor('warmup'), dol: indicesFor('dol') },
    sectionOriginals: { warmup: sections.warmup, dol: sections.dol },
    recoveries,
    assignment,
    challengeCredit,
  });
};

/** The same projection over every assignment tracker a student has. */
export const projectSectionRecoveriesForDisplay = (
  gradesByAssignment = {},
  recoveryByAssignment = {},
  assignmentsById = {},
  challengeByAssignment = {},
) => {
  const assignmentIds = [...new Set([
    ...Object.keys(recoveryByAssignment || {}),
    ...Object.keys(challengeByAssignment || {}),
  ])];
  if (!assignmentIds.length) return gradesByAssignment;
  let changed = false;
  const next = { ...gradesByAssignment };
  assignmentIds.forEach((assignmentId) => {
    const assignment = assignmentsById?.[assignmentId];
    if (!assignment) return;
    const projected = projectSectionRecoveryForAssignment({
      tracker: next[assignmentId] || null,
      assignment,
      recoveryByAssignment,
      challengeByAssignment,
    });
    if (projected.tracker && projected.tracker !== next[assignmentId]) {
      next[assignmentId] = projected.tracker;
      changed = true;
    }
  });
  return changed ? next : gradesByAssignment;
};
