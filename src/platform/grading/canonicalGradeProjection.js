import { buildTestCycleGradeState, isTestCycleAssignment } from '../assessment/testCycle.js';
import { splitGrade, splitGradesBySection } from '../teacher/gradeEvidence.js';

export const ASSIGNMENT_GRADE_OVERRIDE_KEY = '__assignment';

export const assignmentGradeOverrideFor = (student, assignmentId) => {
  const override = student?.teacherGradeOverridesByAssignment?.[assignmentId]?.[ASSIGNMENT_GRADE_OVERRIDE_KEY] || null;
  if (override?.active !== true || !Number.isFinite(Number(override.score))) return null;
  return {
    ...override,
    score: Math.max(0, Math.min(100, Number(override.score))),
  };
};

const overrideApplies = (record, override) => {
  if (!record || override?.active !== true || !Number.isFinite(Number(override.score))) return false;
  // A confirmed section consequence is a server authority, not an attempt-bound
  // correction. Later student attempts must not silently erase it.
  if (override.persistent === true && override.source === 'teacher-section-zero') return true;
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
 * Test Cycles read their released secure scores from testCycleGrades; ordinary
 * assignments use the same teacher-override and Practice Pass projection as
 * the Grade Center. Missing evidence stays null unless a server-authoritative
 * assignment-level teacher override explicitly supplies the canonical grade.
 */
export const canonicalPresentedAssignmentGrade = ({ student, assignment, practicePassRedeemed = false }) => {
  const assignmentOverride = assignmentGradeOverrideFor(student, assignment?.id);
  if (assignmentOverride) return assignmentOverride.score;

  if (isTestCycleAssignment(assignment)) {
    const cycle = student?.testCycleGrades?.[assignment?.id] || {};
    return buildTestCycleGradeState({
      originalTestGrade: cycle.originalTestGrade ?? null,
      rawRetestGrade: cycle.rawRetestGrade ?? null,
      policy: assignment?.assessmentPolicy || null,
    }).recordedGrade;
  }

  const projected = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  );
  const tracker = projected?.[assignment?.id];
  if (!tracker) return null;
  return splitGrade({ tracker, assignment, practicePassRedeemed }).score ?? null;
};

/**
 * Canonical lesson-section grade used by Grade Transfer.
 *
 * The section calculation is the exact same split used by the Grade Center.
 * Assignment-wide teacher consequences still remain authoritative across every
 * real section. A Practice Pass remains an excusal, not invented evidence, so
 * its Practice row is omitted from TEAMS rather than converted into a score.
 */
export const canonicalPresentedSectionGrade = ({
  student,
  assignment,
  sectionKey,
  practicePassRedeemed = false,
}) => {
  if (isTestCycleAssignment(assignment)) return null;

  const projected = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  );
  const tracker = projected?.[assignment?.id] || null;
  const section = splitGradesBySection({
    tracker,
    assignment,
    practicePassRedeemed,
  })?.[sectionKey];

  if (!section || section.total <= 0) return null;

  const assignmentOverride = assignmentGradeOverrideFor(student, assignment?.id);
  if (assignmentOverride) return assignmentOverride.score;
  if (section.excused === true) return null;
  return section.score ?? null;
};
