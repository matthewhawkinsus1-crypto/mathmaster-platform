import { buildTestCycleGradeState, isTestCycleAssignment } from '../assessment/testCycle.js';
import { splitGrade, splitGradesBySection } from '../teacher/gradeEvidence.js';
import { projectSectionRecoveryForAssignment } from './sectionRecoveryGrades.js';

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
        // What the student's own record said. A reduced-item projection pins
        // only work the student actually answered (functions/shared/
        // reducedWorkload.mjs answeredOf), never a display-only status.
        trackerStatusBeforeOverride: record.status ?? null,
        status: score >= 100 ? 'correct' : (record.status === 'correct' || record.status === 'expired' ? 'expired' : 'attempted'),
        partialCredit: score,
        bestPartialCredit: score,
        teacherGradeOverrideDisplay: override,
      };
    });
    return [assignmentId, nextTracker];
  }))
);

/*
 * THE STUDENT'S OWN REQUIRED ITEMS.
 *
 * Every grade below is over the questions this student is responsible for:
 * current content, minus a Practice Pass waiver, minus what their
 * reduced-item-count accommodation omits (functions/shared/reducedWorkload.mjs,
 * through gradeEvidence.js `supportProfile`). The profile is the student's own
 * `profile` — teacher roster records carry it normalized
 * (normalizeStudentProfile passes `supportPlan` through). A student without
 * that support resolves to "nothing omitted", so their grade is unchanged.
 */
const supportProfileOf = (student) => student?.profile || null;

/**
 * ONE STUDENT, ONE ASSIGNMENT: THE TRACKER EVERY GRADE IS COMPUTED FROM.
 *
 * Teacher per-question overrides first (they correct the original evidence),
 * then a Live Challenge Warm-Up result (it is the Warm-Up grade), then any
 * completed Practice-based Recovery (it rescores its Warm-Up/DOL section from
 * that corrected original). The assignment-level override is
 * applied by the caller, after, because it replaces the whole grade. Every
 * surface that shows a student's assignment grade reads through this, so none
 * of them can show a Recovery that another surface ignores.
 */
export const projectedAssignmentTrackerFor = ({ student = null, assignment = null } = {}) => {
  const projected = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  );
  return projectSectionRecoveryForAssignment({
    tracker: projected?.[assignment?.id] || null,
    assignment,
    recoveryByAssignment: student?.sectionRecoveryByAssignment || null,
    challengeByAssignment: student?.warmupChallengeByAssignment || null,
    supportProfile: supportProfileOf(student),
  }).tracker;
};

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

  // Overrides, then any completed Practice-based Recovery.
  const tracker = projectedAssignmentTrackerFor({ student, assignment });
  if (!tracker) return null;
  return splitGrade({ tracker, assignment, practicePassRedeemed, supportProfile: supportProfileOf(student) }).score ?? null;
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

  const tracker = projectedAssignmentTrackerFor({ student, assignment });
  const section = splitGradesBySection({
    tracker,
    assignment,
    practicePassRedeemed,
    supportProfile: supportProfileOf(student),
  })?.[sectionKey];

  if (!section || section.total <= 0) return null;

  const assignmentOverride = assignmentGradeOverrideFor(student, assignment?.id);
  if (assignmentOverride) return assignmentOverride.score;
  // An authored section with no tracker is missing evidence, not a numeric zero.
  // Preserve the assignment-level export contract: only an explicit teacher
  // assignment override may create a canonical score without student evidence.
  if (!tracker) return null;
  if (section.excused === true) return null;
  return section.score ?? null;
};

/**
 * True when this lesson section has content but NONE of it is this student's
 * required work because of their reduced-item-count accommodation. The plan
 * keeps at least one item in every coverage cell, so a section the class was
 * given cannot normally become empty for a student; should it ever, Grade
 * Transfer treats the student as excused for that section (no numeric row),
 * like a Practice Pass — never as a grade problem to fix.
 */
export const sectionNotRequiredForStudent = ({ student, assignment, sectionKey, practicePassRedeemed = false }) => {
  if (!supportProfileOf(student) || !sectionKey || isTestCycleAssignment(assignment)) return false;
  const section = splitGradesBySection({
    tracker: projectedAssignmentTrackerFor({ student, assignment }),
    assignment,
    practicePassRedeemed,
    supportProfile: supportProfileOf(student),
  })?.[sectionKey];
  return Boolean(section && section.excused !== true && section.total === 0 && Number(section.reducedFrom) > 0);
};
