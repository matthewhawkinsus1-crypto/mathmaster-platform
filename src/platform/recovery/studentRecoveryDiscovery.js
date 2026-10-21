/*
 * WHERE A STUDENT FINDS AN OPEN RECOVERY — AND HOW THEY HEAR ABOUT IT.
 *
 * Practice-based Recovery worked, and students could not find it. Its panel
 * lived only on an assignment's View Results screen; nothing on Home, in the
 * assignment list or inside the assignment said a Warm-Up or DOL Recovery had
 * opened, and a student who arrived from a Google Classroom link never passed
 * the Results screen at all. Students who did find it practised in the
 * assignment's own Practice section, which never counted toward the unlock.
 *
 * This lists every Warm-Up/DOL Recovery a student can act on right now, for
 * Home, the Assignments Center and the assignment's own header, with the one
 * thing to do next. Each entry is built by buildStudentRecoverySummary — the
 * same function the Results panel renders, which runs the server's own
 * decision (functions/shared/sectionRecoveryService.mjs) — so no surface can
 * offer a Recovery the panel, and so the server, would refuse.
 *
 * Only actionable states are listed: Locked (practise to unlock), Unlocked
 * (start) and In progress (continue). Completed, held and closed Recoveries
 * stay on the Results screen, which explains them.
 *
 * COST. Building a summary resolves Question Families, so it is not run for
 * every assignment on every render. A section can only be actionable while its
 * original Warm-Up/DOL has closed and the assignment's final submission date
 * has not passed — or while a Recovery the student started is still open — and
 * both are cheap date and record checks (`sectionMayBeActionable`). Only an
 * assignment that passes one builds its summary.
 *
 * Pure. The phases, the one announcement and the "NEW" and notification marks
 * (per-device conveniences in localStorage, exactly like Test Cycle's) are in
 * ./studentRecoveryNotices.js, which Home reads without loading this module:
 * this one decides, so it loads after Home (src/app/student/studentRecoveryKit.js).
 */

import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { assignmentIsArchived, assignmentIsUnpublished } from '../../../functions/shared/assessmentAvailability.mjs';
import { RECOVERY_SECTIONS } from '../../../functions/shared/recoveryPolicy.mjs';
import { ORIGINAL_OPPORTUNITY, resolveOriginalOpportunity } from '../../../functions/shared/sectionRecoveryEligibility.mjs';
import { ASSIGNMENT_PRACTICE_ROLE, assignmentPracticeCountsSentence, buildStudentRecoverySummary } from './studentRecoveryModel.js';
import {
  PHASE_PRIORITY,
  RECOVERY_ACTION_KIND,
  RECOVERY_PHASE,
  RECOVERY_SECTION_NAME,
  recoveryNoticeKey,
  recoveryNoticePhase,
  recoveryPhaseForState,
} from './studentRecoveryNotices.js';

// The phases, announcements and marks live in the light module so Home can
// show and announce a list without loading this one; every name is still
// exported from here.
export {
  RECOVERY_ACTION_KIND,
  RECOVERY_PHASE,
  RECOVERY_SECTION_NAME,
  groupRecoveryOpportunitiesByAssignment,
  markRecoveryNotified,
  markRecoverySeen,
  recoveryIsUnseen,
  recoveryNotice,
  recoveryNoticeKey,
  recoveryNoticePhase,
  recoveryPhaseForState,
  recoveryWasNotified,
} from './studentRecoveryNotices.js';

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

/**
 * Could this section be actionable for this student right now?
 *
 * Mirrors the order evaluateSectionRecoveryEligibility checks: a Recovery the
 * student started (or a held one a teacher added a question to) is open until
 * the final submission date; anything else needs the original Warm-Up/DOL to
 * have CLOSED before that date. A `false` here is only ever a section the full
 * decision would also hide, so skipping its summary loses nothing.
 */
export const sectionMayBeActionable = ({
  assignment = null,
  section = 'dol',
  record = null,
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  studentProfile = null,
  nowValue = Date.now(),
} = {}) => {
  if (record?.status === 'completed') return false;
  const opportunity = resolveOriginalOpportunity({
    assignment, section, schedule, classId, classPeriod, studentId, nowValue, studentProfile,
  });
  if (opportunity.recoveryWindowEnded) return false;
  if (record?.status === 'inProgress' || record?.status === 'held') return true;
  return opportunity.status === ORIGINAL_OPPORTUNITY.CLOSED;
};

/** Which practice counts toward the unlock, for the list's one-line hint. */
const practiceHint = (practice = {}) => {
  if (practice.role === ASSIGNMENT_PRACTICE_ROLE.COUNTS && practice.countingText) {
    return assignmentPracticeCountsSentence(practice);
  }
  return practice.role === ASSIGNMENT_PRACTICE_ROLE.OTHER_SKILLS
    ? 'Use the “Practice for …” questions: this assignment\'s own Practice questions practise other skills, so they do not count toward unlocking it.'
    : 'Use the “Practice for …” questions to unlock it.';
};

const describeOpportunity = ({ assignment, entry }) => {
  const phase = recoveryPhaseForState(entry.state);
  const sectionName = RECOVERY_SECTION_NAME[entry.section] || entry.section;
  const action = entry.canContinue
    ? RECOVERY_ACTION_KIND.CONTINUE
    : entry.canStart ? RECOVERY_ACTION_KIND.START : RECOVERY_ACTION_KIND.PRACTICE;
  const required = Number(entry.masteryRequired) || 0;
  const windowSize = Number(entry.masteryWindow) || 0;
  /*
   * WHAT TO DO NEXT, IN THE STUDENT'S WORDS.
   *
   * The locked sentence names the exact bar and which practice counts: the
   * questions behind "Practice for …" always, and — Recovery V2 — the
   * assignment's own Practice questions on the same skills, answered on the
   * student's own (named, as the Results panel names them). No internal
   * vocabulary, and no promised cap: the browser cannot see an excused
   * absence, so it never claims what a second try is worth — only that it
   * cannot lower a score (the recorded section score is the higher of the two).
   */
  const practice = entry.assignmentPractice || { role: ASSIGNMENT_PRACTICE_ROLE.NONE };
  const detail = {
    [RECOVERY_PHASE.AVAILABLE]: `Your ${sectionName} has closed, but you can earn a second try. Get ${required} of your last ${windowSize} practice questions right on your own to unlock it.`,
    [RECOVERY_PHASE.UNLOCKED]: `You unlocked a second try at the ${sectionName}. Start it when you are ready — it can only raise your score.`,
    [RECOVERY_PHASE.IN_PROGRESS]: entry.note || `Your second try at the ${sectionName} is started. Pick up where you left off and submit it before it closes.`,
  }[phase];
  const actionLabel = {
    [RECOVERY_ACTION_KIND.PRACTICE]: `Practice for ${entry.label}`,
    [RECOVERY_ACTION_KIND.START]: `Start ${entry.label}`,
    [RECOVERY_ACTION_KIND.CONTINUE]: `Continue ${entry.label}`,
  }[action];
  const headline = {
    [RECOVERY_PHASE.AVAILABLE]: `${entry.label} available`,
    [RECOVERY_PHASE.UNLOCKED]: `${entry.label} unlocked`,
    [RECOVERY_PHASE.IN_PROGRESS]: `${entry.label} in progress`,
  }[phase];
  const noticePhase = recoveryNoticePhase({ state: entry.state, plan: entry.plan });
  return {
    key: `${assignment.id}|${entry.section}`,
    noticeKey: recoveryNoticeKey({ assignmentId: assignment.id, section: entry.section, phase: noticePhase || phase }),
    assignmentId: assignment.id,
    assignmentTitle: clean(assignment.title) || 'MathMaster assignment',
    section: entry.section,
    sectionName,
    label: entry.label,
    state: entry.state,
    phase,
    badge: entry.badge,
    headline,
    detail,
    // Only while it is still locked: which practice moves the meter.
    hint: phase === RECOVERY_PHASE.AVAILABLE ? practiceHint(practice) : null,
    // When the original closed (the reason this Recovery is open at all).
    originalClosedLabel: entry.originalClosedLabel || null,
    // The meter is the way to the unlock; once unlocked it has done its job.
    showMastery: phase === RECOVERY_PHASE.AVAILABLE,
    masteryPercent: entry.masteryPercent,
    masteryCorrect: entry.masteryCorrect,
    masteryRequired: entry.masteryRequired,
    masteryWindow: entry.masteryWindow,
    practiceRemaining: entry.practiceRemaining,
    endsAtMs: entry.endsAtMs ?? null,
    endsAtLabel: entry.endsAtLabel || null,
    action,
    actionLabel,
    // Announced once (a toast) and marked NEW until opened; in progress is
    // the student's own doing and is neither — unless a teacher added a
    // replacement question to it.
    notify: Boolean(noticePhase),
    replacementIssued: Boolean(noticePhase) && phase === RECOVERY_PHASE.IN_PROGRESS,
  };
};

const byPriority = (a, b) => (
  (PHASE_PRIORITY[a.phase] - PHASE_PRIORITY[b.phase])
  || ((a.endsAtMs ?? Number.POSITIVE_INFINITY) - (b.endsAtMs ?? Number.POSITIVE_INFINITY))
  || a.assignmentTitle.localeCompare(b.assignmentTitle)
  || a.section.localeCompare(b.section)
);

/**
 * Every Warm-Up/DOL Recovery this student can act on now, most urgent first.
 *
 * `trackerByAssignment` is the student's canonical tracker with teacher
 * per-question overrides applied and NO Recovery projected into it — the
 * original a Recovery is compared against, exactly as the Results screen and
 * the server read it.
 */
export const buildStudentRecoveryDiscovery = ({
  assignments = [],
  trackerByAssignment = {},
  sectionRecoveryByAssignment = {},
  // teacherGradeOverridesByAssignment: a Practice question a teacher graded is
  // not the student's own evidence (buildStudentRecoverySummary `overrides`).
  overridesByAssignment = {},
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  studentProfile = null,
  nowValue = Date.now(),
} = {}) => {
  if (!studentId) return [];
  const opportunities = [];
  list(assignments).forEach((assignment) => {
    if (!assignment?.id) return;
    // The dashboard's own audience rule: a hidden, paused or archived
    // assignment is not offered as work, and secure assessments have their
    // own retest process (the server refuses Recovery for them).
    if (!assignmentIsForStudent(assignment, { classId, classPeriod })) return;
    if (assignmentIsArchived(assignment) || assignmentIsUnpublished(assignment)) return;
    if (assignment.secure === true || isTestCycleAssignment(assignment)) return;
    const records = sectionRecoveryByAssignment?.[assignment.id] || null;
    const worthBuilding = RECOVERY_SECTIONS.some((section) => sectionMayBeActionable({
      assignment,
      section,
      record: records?.[section] || null,
      studentId,
      classId,
      classPeriod,
      schedule,
      studentProfile,
      nowValue,
    }));
    if (!worthBuilding) return;
    buildStudentRecoverySummary({
      assignment,
      tracker: trackerByAssignment?.[assignment.id] || {},
      recoveryForAssignment: records,
      overrides: overridesByAssignment?.[assignment.id] || null,
      studentId,
      classId,
      classPeriod,
      schedule,
      studentProfile,
      nowValue,
    })
      .filter((entry) => recoveryPhaseForState(entry.state))
      .forEach((entry) => opportunities.push(describeOpportunity({ assignment, entry })));
  });
  return opportunities.sort(byPriority);
};

