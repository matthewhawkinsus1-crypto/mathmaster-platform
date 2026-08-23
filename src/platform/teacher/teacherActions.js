import { ALERT_KIND } from './needsAttention.js';

/*
 * FROM A FINDING TO A DECISION — WITH THE TEACHER IN BETWEEN.
 *
 *   "Do not automatically alter student plans simply because the teacher opened
 *    an alert."
 *
 * That rule sounds obvious and is broken constantly, because the convenient
 * design is so nearly reasonable: the platform found a prerequisite gap, the
 * platform knows the repair skill, the teacher clicked the alert — why not just
 * queue the work? Because "the teacher looked at it" is not consent, a plan
 * that changes on being READ cannot be reasoned about, and a teacher who
 * discovers that opening alerts silently reassigns work stops opening alerts.
 *
 * So this module produces PROPOSALS. Every one carries:
 *
 *   what would change, in a sentence a teacher can disagree with;
 *   what it is a response to, so the reasoning survives;
 *   an explicit `confirm` payload that a caller must pass back to act.
 *
 * There is no function here that writes anything. Opening an alert produces
 * proposals; taking one requires a second, deliberate act.
 *
 * REVERSIBILITY IS PART OF THE PROPOSAL.
 *
 * Every action names how it is undone, because a teacher deciding whether to
 * pin a skill for a class is really deciding how much it costs to be wrong. An
 * action that cannot say how to reverse it is one a careful teacher declines.
 */

export const ACTION = Object.freeze({
  REVIEW_STUDENTS: 'reviewStudents',
  PIN_SKILL: 'pinSkill',
  RECOMMEND_SKILL: 'recommendSkill',
  ADJUST_WEEKLY_GOAL: 'adjustWeeklyGoal',
  OPEN_STUDENT: 'openStudent',
  OPEN_WEEKLY_PATH: 'openWeeklyPath',
  OPEN_ADMINISTRATION: 'openAdministration',
});

export const ACTION_LABEL = Object.freeze({
  [ACTION.REVIEW_STUDENTS]: 'See who is in this',
  [ACTION.PIN_SKILL]: 'Pin this skill for the class',
  [ACTION.RECOMMEND_SKILL]: 'Recommend this skill to the class',
  [ACTION.ADJUST_WEEKLY_GOAL]: 'Adjust this week’s goal',
  [ACTION.OPEN_STUDENT]: 'Open the student',
  [ACTION.OPEN_WEEKLY_PATH]: 'Open Weekly Path',
  [ACTION.OPEN_ADMINISTRATION]: 'Open Administration',
});

/** Actions that only navigate. They change nothing and need no confirmation. */
export const NAVIGATION_ONLY = Object.freeze(new Set([
  ACTION.REVIEW_STUDENTS, ACTION.OPEN_STUDENT, ACTION.OPEN_WEEKLY_PATH, ACTION.OPEN_ADMINISTRATION,
]));

/**
 * What a teacher could do about one alert.
 *
 * Returns an ordered list of proposals, least invasive first — so the default
 * next move is always to look, and changing a plan is never the thing nearest
 * the cursor.
 */
export const actionsForAlert = ({ alert = null, classId = null } = {}) => {
  if (!alert) return [];
  const proposals = [];

  const navigate = (action, label) => proposals.push({
    action,
    label: label || ACTION_LABEL[action],
    changesPlans: false,
    requiresConfirmation: false,
    reversal: 'Nothing changes; this only opens a screen.',
    inResponseTo: alert.id,
  });

  if (alert.kind === ALERT_KIND.SYSTEM) {
    if (['unplaceableStudents', 'noClasses'].includes(alert.rule)) {
      navigate(ACTION.OPEN_ADMINISTRATION);
    }
    return proposals;
  }

  if (alert.studentId) navigate(ACTION.OPEN_STUDENT);
  // A rolled-up class alert names a pattern, not a child. Without this it would
  // arrive with a plan change as its ONLY option — the platform telling a
  // teacher that the way to respond to a finding is to accept a suggestion.
  // Reading the twelve names is the first honest move.
  if (!alert.studentId && alert.students?.length) navigate(ACTION.REVIEW_STUDENTS);
  if (alert.rule === 'weeklyPathBehind') navigate(ACTION.OPEN_WEEKLY_PATH);

  // A class-wide academic pattern is the one case where changing the plan is
  // usually the right answer — and it is still offered, never applied.
  if (alert.kind === ALERT_KIND.ACADEMIC && alert.students?.length && classId) {
    proposals.push({
      action: ACTION.RECOMMEND_SKILL,
      label: ACTION_LABEL[ACTION.RECOMMEND_SKILL],
      changesPlans: true,
      requiresConfirmation: true,
      description: `Add a recommended skill to the weekly path of all ${alert.students.length} students in this pattern. Their existing work is not removed.`,
      reversal: 'Remove the override from Curriculum Pacing. Students who have already started the skill keep the evidence they earned.',
      inResponseTo: alert.id,
      // Deliberately incomplete: the skill is the teacher's choice, and a
      // proposal that pre-picked one would be a decision wearing a suggestion's
      // clothes.
      confirm: { kind: ACTION.RECOMMEND_SKILL, classId, studentIds: alert.students.map((entry) => entry.studentId), skillId: null },
    });
  }

  return proposals;
};

/**
 * The change a confirmed proposal would make, as data.
 *
 * Still writes nothing. It returns the override the caller would persist, so
 * the calling screen can show the teacher the literal change before it happens
 * and the persistence layer stays the only thing that touches storage.
 *
 * Returns null — rather than a partial override — when the proposal is not
 * complete. A half-specified change must never be quietly filled in with a
 * default, because the default would be the platform choosing.
 */
export const buildOverrideFromConfirmation = ({ confirm = null, note = '', expiresAt = null } = {}) => {
  if (!confirm || !confirm.skillId || !confirm.classId) return null;
  const action = confirm.kind === ACTION.PIN_SKILL ? 'priority'
    : confirm.kind === ACTION.RECOMMEND_SKILL ? 'recommend'
      : null;
  if (!action) return null;
  return {
    classId: String(confirm.classId),
    skillId: String(confirm.skillId),
    action,
    expiresAt: expiresAt || null,
    // The note is not decoration. It is what a teacher reads in six weeks when
    // they find an override they do not remember making.
    note: String(note || '').slice(0, 200),
  };
};

/**
 * A one-line record of a teacher decision, for the route history.
 *
 * Written when the teacher confirms, never when they open. That distinction is
 * the whole point of this module and it has to survive into the audit trail:
 * a history that cannot tell "looked" from "decided" cannot answer the only
 * question anyone asks of it later.
 */
export const describeDecision = ({ proposal = null, confirm = null, teacherEmail = null } = {}) => {
  if (!proposal || !confirm) return null;
  return {
    action: proposal.action,
    skillId: confirm.skillId || null,
    classId: confirm.classId || null,
    studentIds: Array.isArray(confirm.studentIds) ? confirm.studentIds : [],
    inResponseTo: proposal.inResponseTo || null,
    decidedBy: teacherEmail || null,
    // Recorded so an override found later can be explained without archaeology.
    rationale: proposal.description || proposal.label,
    reversal: proposal.reversal,
  };
};

export default actionsForAlert;
