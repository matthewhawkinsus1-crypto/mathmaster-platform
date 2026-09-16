import { assignmentIsForStudent, getAssignmentLifecycle } from '../../assignmentLifecycle.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { normalizeQuestionRecord } from '../../attemptPolicy.js';

/*
 * "WHICH ASSIGNMENTS SHOULD THE WALLET OFFER?" -- A UX FILTER, NOT A DECISION.
 *
 * The `redeemPracticePass` Cloud Function (functions/index.js) independently
 * re-verifies every one of these facts against server-read data before it
 * ever spends a point -- see functions/shared/classPointRewards.mjs
 * `evaluatePracticePassEligibility`, the ONE authoritative decision. This
 * module exists only so the wallet does not offer a student an assignment the
 * server is certain to refuse (a quiz, a closed assignment, one already
 * redeemed) — it is deliberately best-effort, reads only data already loaded
 * for the dashboard, and a wrong guess here costs nothing: the server still
 * has the final word.
 */

const clean = (value) => String(value ?? '').trim();

const hasAssessmentSection = (assignment = {}) => {
  const roles = (Array.isArray(assignment?.sections) ? assignment.sections : [])
    .map((section) => clean(section?.role).toLowerCase());
  return roles.includes('quiz') || roles.includes('test');
};

/*
 * SAME DEFINITION THE SERVER USES, ON PURPOSE.
 *
 * functions/index.js `redeemPracticePass` blocks on
 * `normalizeQuestionRecord(...).totalAttempts > 0` -- never on the mere
 * existence of a local draft. Using a different threshold here (e.g.
 * `status !== 'unattempted'`) would let the wallet offer, or refuse, an
 * assignment the server would decide the opposite way about. `attemptPolicy.js`
 * is a straight re-export of functions/shared/attemptPolicy.mjs, so this is
 * the identical function, not a parallel implementation of it.
 */
const hasCreditBearingPracticeAttempt = (assignmentTracker, practiceIndices) => (
  practiceIndices.some((index) => Number(normalizeQuestionRecord(assignmentTracker?.[index]).totalAttempts) > 0)
);

export const practicePassLooksEligible = ({
  assignment,
  classId,
  classPeriod,
  assignmentTracker = null,
  alreadyRedeemed = false,
  nowValue = Date.now(),
} = {}) => {
  if (!assignmentIsForStudent(assignment, { classId, classPeriod })) return false;
  if (alreadyRedeemed) return false;

  const override = typeof assignment?.rewardPolicy?.practicePassEligible === 'boolean'
    ? assignment.rewardPolicy.practicePassEligible
    : null;
  if (override === false) return false;
  if (isTestCycleAssignment(assignment)) return false;
  if (override !== true && hasAssessmentSection(assignment)) return false;

  const projection = projectCurrentAssignmentContent(assignment);
  const practiceIndices = projection.entries
    .filter((entry) => entry.logicalRole === 'practice')
    .map((entry) => entry.storageIndex);
  if (!practiceIndices.length) return false;

  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
  if (lifecycle.isScheduled || lifecycle.isPracticeOnly || !lifecycle.creditEligible) return false;

  if (hasCreditBearingPracticeAttempt(assignmentTracker, practiceIndices)) return false;

  return true;
};

/** The assignments the wallet should list as choosable right now, newest-due first. */
export const practicePassEligibleAssignments = ({
  assignments = [],
  classId = null,
  classPeriod = null,
  tracker = {},
  redemptionsByAssignment = {},
  nowValue = Date.now(),
} = {}) => (
  (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => practicePassLooksEligible({
      assignment,
      classId,
      classPeriod,
      assignmentTracker: tracker?.[assignment.id] || null,
      alreadyRedeemed: Boolean(redemptionsByAssignment?.[assignment.id]),
      nowValue,
    }))
    .map((assignment) => ({
      assignmentId: assignment.id,
      title: assignment.title || 'MathMaster assignment',
      dueAt: assignment.dueAt || assignment.dueDate || null,
    }))
    .sort((a, b) => String(b.dueAt || '').localeCompare(String(a.dueAt || '')))
);
