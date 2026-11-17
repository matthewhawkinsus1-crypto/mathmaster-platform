/*
 * THE GRADEBOOK'S RECOVERY MARKS, ON THEIR OWN.
 *
 * The gradebook marks a section cell R (its grade includes a completed
 * Recovery), Held (a Recovery waits for the teacher) and LC (the Warm-Up grade
 * is a Live Challenge result). Those three questions were asked of
 * teacherRecoveryAudit.js, which also builds the full audit and so imports
 * the question family registry and the Recovery grade projection: the
 * gradebook brought them onto every teacher's first load
 * (scripts/check-first-load-budget.mjs, teacherHome), though only the audit
 * trail in a student's Details reads them. These read only the stored records,
 * through the modules every grade surface already loads; teacherRecoveryAudit.js
 * re-exports them under the same names.
 */
import { normalizeRecoveryRecord } from '../../../functions/shared/sectionRecoveryRecord.mjs';
import { warmupChallengeScore } from '../../../functions/shared/warmupChallengeGrade.mjs';

/**
 * Sections of this assignment whose grade includes a completed Recovery — one
 * with a Recovery score (a teacher who closed a held Recovery keeping the
 * original recorded none, and nothing was replaced).
 */
export const completedRecoverySections = (student = null, assignmentId = null) => {
  const records = student?.sectionRecoveryByAssignment?.[assignmentId];
  if (!records || typeof records !== 'object') return new Set();
  return new Set(['warmup', 'dol'].filter((section) => {
    const record = normalizeRecoveryRecord(records[section], section);
    return record?.status === 'completed' && record.rawScore !== null && record.rawScore !== undefined && Number.isFinite(Number(record.rawScore));
  }));
};

/** Sections of this assignment whose Recovery is HELD, waiting for this teacher. */
export const heldRecoverySections = (student = null, assignmentId = null) => {
  const records = student?.sectionRecoveryByAssignment?.[assignmentId];
  if (!records || typeof records !== 'object') return new Set();
  return new Set(['warmup', 'dol'].filter((section) => normalizeRecoveryRecord(records[section], section)?.status === 'held'));
};

/** Does this student's Warm-Up grade come from a Live Challenge result? */
export const warmupChallengeCounts = (student = null, assignmentId = null) => (
  warmupChallengeScore(student?.warmupChallengeByAssignment?.[assignmentId]) !== null
);
