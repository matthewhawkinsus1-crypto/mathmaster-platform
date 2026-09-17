import { splitGrade } from '../teacher/gradeEvidence.js';

const overrideApplies = (record, override) => {
  if (!record || override?.active !== true || !Number.isFinite(Number(override.score))) return false;
  if (Number(override.totalAttempts) !== Number(record.totalAttempts ?? record.attemptCount ?? 0)) return false;
  if (Number(override.variantIndex) !== Number(record.variantIndex ?? 0)) return false;
  if (String(override.submissionId || '')) return String(override.submissionId) === String(record.lastSubmissionId || '');
  return Boolean(String(override.lastAttemptAt || ''))
    && String(override.lastAttemptAt) === String(record.lastAttemptAt || record.academicOccurredAt || '');
};

/** The one browser projection used before any canonical tracker is displayed or exported. */
export const projectTeacherOverridesForDisplay = (gradesByAssignment = {}, overridesByAssignment = {}) => (
  Object.fromEntries(Object.entries(gradesByAssignment || {}).map(([assignmentId, assignmentTracker]) => {
    const overrides = overridesByAssignment?.[assignmentId] || {};
    const nextTracker = { ...(assignmentTracker || {}) };
    Object.entries(nextTracker).forEach(([questionIndex, record]) => {
      const override = overrides?.[questionIndex];
      if (!overrideApplies(record, override)) return;
      const score = Math.max(0, Math.min(100, Number(override.score)));
      nextTracker[questionIndex] = {
        ...record,
        status: score >= 100 ? 'correct' : (record.status === 'correct' || record.status === 'expired' ? 'expired' : 'attempted'),
        partialCredit: score,
        bestPartialCredit: score,
        teacherGradeOverrideDisplay: override,
      };
    });
    return [assignmentId, nextTracker];
  }))
);

/**
 * Canonical grade presentation shared by the teacher gradebook and TEAMS.
 * splitGrade owns the same Practice Pass denominator projection used by the
 * student Grade Center; the caller may only pass a server-written redemption.
 */
export const canonicalPresentedAssignmentGrade = ({ student, assignment, practicePassRedeemed = false }) => {
  const projected = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  );
  const tracker = projected?.[assignment.id];
  if (!tracker) return null;
  return splitGrade({ tracker, assignment, practicePassRedeemed }).score ?? 0;
};
