/*
 * A RECOVERY, AS THE TEACHER AUDITS IT.
 *
 * One row per Warm-Up/DOL section that has a Recovery record: what the
 * original scored, what the Recovery scored, what was recorded and why, and
 * the Practice evidence that unlocked it. Read from the same projection every
 * grade surface uses (sectionRecoveryGrades.js), applied to the tracker after
 * teacher per-question overrides — so the Original shown is the original the
 * Recovery was actually compared against.
 *
 * Nothing here is shown for a student who never started Practice-based
 * Recovery, so the gradebook stays exactly as uncluttered as it was.
 */

import { normalizeRecoveryRecord } from '../../../functions/shared/sectionRecoveryRecord.mjs';
import { RECOVERY_TYPE } from '../../../functions/shared/recoveryPolicy.mjs';
import { projectTeacherOverridesForDisplay } from '../grading/canonicalGradeProjection.js';
import { projectSectionRecoveryForAssignment } from '../grading/sectionRecoveryGrades.js';
import { splitGradesBySection } from '../teacher/gradeEvidence.js';

export const SECTION_RECOVERY_AUDIT_LABEL = Object.freeze({ warmup: 'Warm-Up', dol: 'DOL' });

const STATUS_LABEL = Object.freeze({
  practicing: 'Practicing',
  unlocked: 'Unlocked',
  inProgress: 'In progress',
  completed: 'Completed',
});

const percent = (value) => (Number.isFinite(Number(value)) && value !== null ? `${Math.round(Number(value))}%` : '—');

const formatWhen = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
};

/**
 * The audit rows for one student and one assignment ([] when there is no
 * Recovery record at all).
 */
export const buildTeacherRecoveryAudit = ({ student = null, assignment = null } = {}) => {
  const records = student?.sectionRecoveryByAssignment?.[assignment?.id];
  if (!assignment?.id || !records || typeof records !== 'object') return [];
  const correctedTracker = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  )?.[assignment.id] || {};
  const originals = splitGradesBySection({ tracker: correctedTracker, assignment });
  const { states } = projectSectionRecoveryForAssignment({
    tracker: correctedTracker,
    assignment,
    recoveryByAssignment: student.sectionRecoveryByAssignment,
  });
  return ['warmup', 'dol'].map((section) => {
    const record = normalizeRecoveryRecord(records[section], section);
    if (!record) return null;
    const original = originals?.[section] || {};
    const state = states?.[section] || null;
    const evidence = record.masteryEvidence;
    const practiced = record.practice.items.length;
    return {
      section,
      label: `${SECTION_RECOVERY_AUDIT_LABEL[section]} Recovery`,
      status: record.status,
      statusLabel: STATUS_LABEL[record.status] || record.status,
      typeLabel: record.type === RECOVERY_TYPE.EXCUSED_MAKE_UP ? 'Excused make-up (full credit available)' : record.type ? `Recovery (counts up to ${record.cap ?? '—'}%)` : null,
      original: original.attempted ? percent(original.score) : 'Missing',
      recovery: record.status === 'completed' ? percent(record.rawScore) : '—',
      final: state?.recordedScore !== null && state?.recordedScore !== undefined ? percent(state.recordedScore) : '—',
      reason: state?.reason || null,
      evidence: evidence?.met
        ? `Unlocked after Practice mastery: ${evidence.correct} of the last ${evidence.windowSize} correct (${evidence.percent}%).`
        : evidence && evidence.masteryRequired === false
          ? 'Unlocked as an excused make-up.'
          : `${practiced} Practice question${practiced === 1 ? '' : 's'} answered so far.`,
      unlockedAt: formatWhen(record.unlockedAt),
      completedAt: formatWhen(record.completedAt),
      history: record.history,
    };
  }).filter(Boolean);
};

/** Sections of this assignment whose grade includes a completed Recovery. */
export const completedRecoverySections = (student = null, assignmentId = null) => {
  const records = student?.sectionRecoveryByAssignment?.[assignmentId];
  if (!records || typeof records !== 'object') return new Set();
  return new Set(['warmup', 'dol'].filter((section) => normalizeRecoveryRecord(records[section], section)?.status === 'completed'));
};
