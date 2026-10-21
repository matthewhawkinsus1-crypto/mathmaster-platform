/*
 * WHO CAN RECOVER — AND WHY NOT. ONE ASSIGNMENT'S RECOVERY, CLASS BY CLASS.
 *
 * For every student on a class roster, and each of the Warm-Up and the DOL:
 * the state the server would decide right now, read with the very decision
 * the student's own panel runs (studentRecoveryModel.studentRecoveryContexts →
 * sectionRecoveryService.buildSectionRecoveryContext), from the student's
 * grade document after teacher per-question overrides. So the teacher sees
 * exactly what the student sees — and, for a student who sees nothing, why.
 *
 * Grouped for the assignment details:
 *
 *   practicing   the original closed; practising to unlock a second try
 *   unlocked     Practice mastery shown (or an excused make-up): can start
 *   inProgress   started, not yet submitted
 *   completed    submitted and graded; the higher score is recorded
 *   held         submitted, waiting for the teacher (MathMaster could not
 *                grade a question, or a replacement question is unanswered)
 *   notNeeded    the original is already at or above what a Recovery records
 *   unavailable  Recovery cannot be offered — the reason says why
 *   notYet       the original is still open, or has not been given yet
 *   closed       the final submission date passed
 *
 * Read-only, and no new rule: a group is the server's state, a reason is the
 * server's reason in a teacher's words. The browser cannot read attendance,
 * so an excused make-up is decided by the server when the student starts —
 * exactly as on the student's panel.
 */

import { projectTeacherOverridesForDisplay } from '../grading/canonicalGradeProjection.js';
import { formatStudentLabel } from '../studentName.js';
import { RECOVERY_STATE } from '../../../functions/shared/sectionRecoveryService.mjs';
import { studentRecoveryContexts } from './studentRecoveryModel.js';

export const RECOVERY_ROSTER_GROUP = Object.freeze({
  PRACTICING: 'practicing',
  UNLOCKED: 'unlocked',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  HELD: 'held',
  NOT_NEEDED: 'notNeeded',
  UNAVAILABLE: 'unavailable',
  NOT_YET: 'notYet',
  CLOSED: 'closed',
});

// The order the assignment details lists them: what needs the teacher first,
// then what students are doing, then what is settled.
export const RECOVERY_ROSTER_GROUP_ORDER = Object.freeze([
  RECOVERY_ROSTER_GROUP.HELD,
  RECOVERY_ROSTER_GROUP.UNAVAILABLE,
  RECOVERY_ROSTER_GROUP.PRACTICING,
  RECOVERY_ROSTER_GROUP.UNLOCKED,
  RECOVERY_ROSTER_GROUP.IN_PROGRESS,
  RECOVERY_ROSTER_GROUP.COMPLETED,
  RECOVERY_ROSTER_GROUP.NOT_NEEDED,
  RECOVERY_ROSTER_GROUP.NOT_YET,
  RECOVERY_ROSTER_GROUP.CLOSED,
]);

export const RECOVERY_ROSTER_GROUP_LABEL = Object.freeze({
  [RECOVERY_ROSTER_GROUP.PRACTICING]: 'Practicing to unlock',
  [RECOVERY_ROSTER_GROUP.UNLOCKED]: 'Unlocked',
  [RECOVERY_ROSTER_GROUP.IN_PROGRESS]: 'In progress',
  [RECOVERY_ROSTER_GROUP.COMPLETED]: 'Completed',
  [RECOVERY_ROSTER_GROUP.HELD]: 'Held for your review',
  [RECOVERY_ROSTER_GROUP.NOT_NEEDED]: 'Not needed',
  [RECOVERY_ROSTER_GROUP.UNAVAILABLE]: 'Cannot be offered',
  [RECOVERY_ROSTER_GROUP.NOT_YET]: 'Original still open',
  [RECOVERY_ROSTER_GROUP.CLOSED]: 'Closed',
});

const GROUP_FOR_STATE = Object.freeze({
  [RECOVERY_STATE.LOCKED]: RECOVERY_ROSTER_GROUP.PRACTICING,
  [RECOVERY_STATE.UNLOCKED]: RECOVERY_ROSTER_GROUP.UNLOCKED,
  [RECOVERY_STATE.IN_PROGRESS]: RECOVERY_ROSTER_GROUP.IN_PROGRESS,
  [RECOVERY_STATE.COMPLETED]: RECOVERY_ROSTER_GROUP.COMPLETED,
  [RECOVERY_STATE.HELD]: RECOVERY_ROSTER_GROUP.HELD,
  [RECOVERY_STATE.NOT_NEEDED]: RECOVERY_ROSTER_GROUP.NOT_NEEDED,
  [RECOVERY_STATE.UNAVAILABLE]: RECOVERY_ROSTER_GROUP.UNAVAILABLE,
  [RECOVERY_STATE.CLOSED]: RECOVERY_ROSTER_GROUP.CLOSED,
});

/** The group a decided state and reason belong to, or null when the section does not apply to the student. */
export const recoveryRosterGroup = (state, reason) => {
  if (GROUP_FOR_STATE[state]) return GROUP_FOR_STATE[state];
  if (state !== RECOVERY_STATE.HIDDEN) return null;
  if (reason === 'original-still-open' || reason === 'original-not-closed') return RECOVERY_ROSTER_GROUP.NOT_YET;
  if (reason === 'recovery-window-ended') return RECOVERY_ROSTER_GROUP.CLOSED;
  return null;
};

const practisingText = (mastery = {}) => {
  const fromAssignment = Number(mastery.sources?.assignmentPractice?.correct) || 0;
  const tail = fromAssignment ? ` (${fromAssignment} from the assignment's own Practice)` : '';
  return `${Number(mastery.correct) || 0} of the last ${mastery.windowSize} right on their own; needs ${mastery.requiredCorrect}${tail}.`;
};

/** The server's reason, in a teacher's words. */
export const recoveryRosterReason = (reason, { mastery = null } = {}) => {
  switch (reason) {
    case 'more-items-needed':
    case 'more-correct-needed':
    case 'more-practice-needed':
      return practisingText(mastery || {});
    case 'skill-coverage-needed':
      return `${practisingText(mastery || {})} Each skill the section assessed needs a correct answer too.`;
    case 'mastery-met':
    case 'mastery-recorded':
      return 'Unlocked after Practice mastery.';
    case 'excused-no-mastery-required':
      return 'Unlocked as an excused make-up.';
    case 'recovery-in-progress':
      return 'Started; not yet submitted.';
    case 'recovery-replacement-issued':
      return 'You issued a replacement question; waiting for the student\'s answer.';
    case 'recovery-replacement-unanswered':
      return 'The student did not answer the replacement question by their final date — it waits for you.';
    case 'recovery-held':
      return 'MathMaster could not grade a question — it waits for your decision (Grades → the student\'s work).';
    case 'recovery-completed':
    case 'automatic-opportunities-used':
      return 'Finished. The higher of the original and the Recovery is recorded.';
    case 'original-at-or-above-cap':
      return 'The original score is already at or above what a Recovery can record.';
    case 'generation-unavailable':
      return 'Recovery is not ready for this assignment — see Recovery readiness above.';
    case 'policy-disabled':
      return 'Recovery is turned off for this assignment.';
    case 'original-still-open':
      return 'The original is still open.';
    case 'original-not-closed':
      return 'The original has not been given yet.';
    case 'recovery-window-ended':
      return 'The final submission date passed; the original stands.';
    default:
      return reason ? `Not available (${reason}).` : '';
  }
};

const emptyGroups = () => Object.fromEntries(RECOVERY_ROSTER_GROUP_ORDER.map((group) => [group, []]));

/**
 * The class's Recovery for one assignment:
 *   { sections: { warmup|dol: { groups: { [group]: [row] }, counts } }, students }
 * Each row: { id, name, group, state, reason, reasonText }.
 *
 * `students` are grade documents (gradesByAssignment, sectionRecoveryByAssignment,
 * teacherGradeOverridesByAssignment, warmupChallengeByAssignment, profile) —
 * what the hub loads for a class; a student without one is not listed.
 */
export const buildTeacherRecoveryRoster = ({
  assignment = null,
  students = [],
  classId = null,
  classPeriod = null,
  schedule = null,
  // A student without a name reads "Name unavailable · ID x", never as the id.
  nameOf = formatStudentLabel,
  nowValue = Date.now(),
} = {}) => {
  const sections = {};
  const rows = [];
  if (!assignment?.id) return { sections, students: rows };
  (Array.isArray(students) ? students : []).forEach((student) => {
    if (!student?.id) return;
    const overrides = student.teacherGradeOverridesByAssignment || {};
    const tracker = projectTeacherOverridesForDisplay(student.gradesByAssignment || {}, overrides)?.[assignment.id] || {};
    let decided;
    try {
      decided = studentRecoveryContexts({
        assignment,
        tracker,
        recoveryForAssignment: student.sectionRecoveryByAssignment?.[assignment.id] || null,
        studentId: student.id,
        classId,
        classPeriod,
        schedule,
        studentProfile: student.profile || null,
        overrides: overrides[assignment.id] || null,
        challengeCredit: student.warmupChallengeByAssignment?.[assignment.id] || null,
        nowValue,
      });
    } catch {
      // One unreadable record never blanks the class view.
      return;
    }
    const entry = { id: student.id, name: nameOf(student) };
    decided.sections.forEach(({ section, context }) => {
      const { state, reason } = context.eligibility;
      const group = recoveryRosterGroup(state, reason);
      if (!group) return;
      const row = {
        id: student.id,
        name: entry.name,
        group,
        state,
        reason,
        reasonText: recoveryRosterReason(reason, { mastery: context.mastery }),
      };
      sections[section] ||= { groups: emptyGroups(), counts: {} };
      sections[section].groups[group].push(row);
      entry[section] = row;
    });
    rows.push(entry);
  });
  Object.values(sections).forEach((entry) => {
    Object.values(entry.groups).forEach((groupRows) => groupRows.sort((a, b) => a.name.localeCompare(b.name)));
    entry.counts = Object.fromEntries(Object.entries(entry.groups).map(([group, groupRows]) => [group, groupRows.length]));
  });
  return { sections, students: rows };
};
