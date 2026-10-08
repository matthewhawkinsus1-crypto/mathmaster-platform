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
 * Pure apart from the "NEW" and notification marks at the end, which are
 * per-device conveniences in localStorage, exactly like Test Cycle's.
 */

import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { assignmentIsArchived, assignmentIsUnpublished } from '../../../functions/shared/assessmentAvailability.mjs';
import { RECOVERY_SECTIONS } from '../../../functions/shared/recoveryPolicy.mjs';
import { ORIGINAL_OPPORTUNITY, RECOVERY_STATE, resolveOriginalOpportunity } from '../../../functions/shared/sectionRecoveryEligibility.mjs';
import { buildStudentRecoverySummary } from './studentRecoveryModel.js';

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

/*
 * WHERE A STUDENT IS IN AN OPEN RECOVERY.
 *
 *   available   the original closed; practise to unlock a second try (Locked)
 *   unlocked    mastery shown; the second try can start
 *   inProgress  started (or a teacher added a replacement question); finish it
 *
 * A student is told once about `available` and once about `unlocked`. They
 * started `inProgress` themselves, so it is listed but never announced.
 */
export const RECOVERY_PHASE = Object.freeze({
  AVAILABLE: 'available',
  UNLOCKED: 'unlocked',
  IN_PROGRESS: 'inProgress',
});

const PHASE_FOR_STATE = Object.freeze({
  [RECOVERY_STATE.LOCKED]: RECOVERY_PHASE.AVAILABLE,
  [RECOVERY_STATE.UNLOCKED]: RECOVERY_PHASE.UNLOCKED,
  [RECOVERY_STATE.IN_PROGRESS]: RECOVERY_PHASE.IN_PROGRESS,
});

// The order a student can move through them; seeing a later phase means the
// earlier ones need no announcement.
const PHASE_ORDER = Object.freeze([RECOVERY_PHASE.AVAILABLE, RECOVERY_PHASE.UNLOCKED, RECOVERY_PHASE.IN_PROGRESS]);

// What a list shows first: work already started, then a second try that is
// ready, then one still to unlock.
const PHASE_PRIORITY = Object.freeze({
  [RECOVERY_PHASE.IN_PROGRESS]: 0,
  [RECOVERY_PHASE.UNLOCKED]: 1,
  [RECOVERY_PHASE.AVAILABLE]: 2,
});

export const RECOVERY_SECTION_NAME = Object.freeze({ warmup: 'Warm-Up', dol: 'DOL' });

export const RECOVERY_ACTION_KIND = Object.freeze({
  PRACTICE: 'practice',
  START: 'start',
  CONTINUE: 'continue',
});

/** The phase a Recovery state belongs to, or null for a state no list shows. */
export const recoveryPhaseForState = (state) => PHASE_FOR_STATE[state] || null;

/** One announcement per assignment, section and phase. */
export const recoveryNoticeKey = ({ assignmentId, section, phase }) => `${clean(assignmentId)}|${clean(section)}|${clean(phase)}`;

/*
 * A TEACHER'S REPLACEMENT QUESTION IS NEWS, TOO.
 *
 * A Recovery in progress is the student's own doing and is not announced —
 * except when it is in progress because a teacher resolved a held Recovery by
 * adding a replacement question (sectionRecoveryResolution.mjs). Then the
 * student has a new question to answer before the end date and did nothing to
 * learn of it. Each round of replacements is its own news, named by the items
 * it added, exactly as the Results panel decides `repaired`.
 */
const replacementItemIds = (plan) => list(plan?.items)
  .filter((item) => clean(item?.replaces))
  .map((item) => clean(item.itemId))
  .filter(Boolean);

/** The announcement this state stands for, or null when there is none. */
export const recoveryNoticePhase = ({ state, plan = null } = {}) => {
  const phase = recoveryPhaseForState(state);
  if (phase !== RECOVERY_PHASE.IN_PROGRESS) return phase;
  const replacements = replacementItemIds(plan);
  return replacements.length ? `replacement:${replacements.join(',')}` : null;
};

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
   * The locked sentence names the exact bar and where the practice is, because
   * "improve your Practice mastery" sent students to the assignment's own
   * Practice section, which never counts. No internal vocabulary, and no
   * promised cap: the browser cannot see an excused absence, so it never
   * claims what a second try is worth — only that it cannot lower a score
   * (the recorded section score is the higher of the two).
   */
  const detail = {
    [RECOVERY_PHASE.AVAILABLE]: `Your ${sectionName} has closed, but you can earn a second try. Get ${required} of your last ${windowSize} Recovery practice questions right to unlock it.`,
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
    // Only while it is still locked: the assignment's Practice section is a
    // different thing and never unlocks a Recovery.
    hint: phase === RECOVERY_PHASE.AVAILABLE
      ? 'These practice questions are separate from the assignment\'s own Practice section, which does not count toward unlocking it.'
      : null,
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

/** { [assignmentId]: [opportunity, ...] } for surfaces that list assignments. */
export const groupRecoveryOpportunitiesByAssignment = (opportunities = []) => list(opportunities)
  .reduce((byAssignment, opportunity) => {
    (byAssignment[opportunity.assignmentId] ||= []).push(opportunity);
    return byAssignment;
  }, {});

/*
 * THE ANNOUNCEMENT.
 *
 * One toast for everything new at once, never one per section: two Recoveries
 * opening at the end of the same class period is one piece of news.
 */
export const recoveryNotice = (opportunities = []) => {
  const fresh = list(opportunities).filter((opportunity) => opportunity?.notify);
  if (!fresh.length) return null;
  if (fresh.length === 1) {
    const [only] = fresh;
    const until = only.endsAtLabel ? ` Open until ${only.endsAtLabel}.` : '';
    if (only.replacementIssued) {
      return {
        tone: 'info',
        title: `${only.label}: a new question`,
        message: `${only.assignmentTitle}: your teacher added a new question to your ${only.sectionName} Recovery. Your other answers are saved — answer the new one and submit.${until}`,
      };
    }
    return only.phase === RECOVERY_PHASE.UNLOCKED
      ? {
        tone: 'success',
        title: `${only.label} unlocked`,
        message: `${only.assignmentTitle}: your second try at the ${only.sectionName} is ready to start.${until}`,
      }
      : {
        tone: 'info',
        title: `${only.label} available`,
        message: `${only.assignmentTitle}: your ${only.sectionName} closed, but you can earn a second try. Use “${only.actionLabel}” on Home.${until}`,
      };
  }
  const anyUnlocked = fresh.some((opportunity) => opportunity.phase === RECOVERY_PHASE.UNLOCKED);
  return {
    tone: anyUnlocked ? 'success' : 'info',
    title: `${fresh.length} Recovery opportunities`,
    message: `You can earn a second try on ${fresh.map((opportunity) => `the ${opportunity.sectionName} for ${opportunity.assignmentTitle}`).join('; ')}. They are listed on Home.`,
  };
};

/*
 * "NEW" AND "ALREADY TOLD", PER DEVICE.
 *
 * The same best-effort pattern as Test Cycle's markTestCycleSeen: losing these
 * marks only re-shows a badge or a toast, never a state, and every read and
 * write is guarded because a Chromebook in a private window may refuse
 * storage entirely.
 */
const SEEN_PREFIX = 'mm-recovery-seen:';
const NOTIFIED_PREFIX = 'mm-recovery-notified:';

const storageKeyFor = (prefix, studentId, noticeKey) => `${prefix}${clean(studentId)}:${noticeKey}`;

const readMark = (prefix, studentId, noticeKey) => {
  try {
    return window.localStorage.getItem(storageKeyFor(prefix, studentId, noticeKey)) === '1';
  } catch {
    return false;
  }
};

const writeMark = (prefix, studentId, noticeKey) => {
  try {
    window.localStorage.setItem(storageKeyFor(prefix, studentId, noticeKey), '1');
  } catch {
    /* best effort */
  }
};

/** Has this student been told about this phase on this device? */
export const recoveryWasNotified = (studentId, opportunity) => (
  !clean(studentId) || !opportunity?.noticeKey ? true : readMark(NOTIFIED_PREFIX, studentId, opportunity.noticeKey)
);

export const markRecoveryNotified = (studentId, opportunity) => {
  if (!clean(studentId) || !opportunity?.noticeKey) return;
  writeMark(NOTIFIED_PREFIX, studentId, opportunity.noticeKey);
};

/** Should a list mark this Recovery NEW: announced-worthy, and not yet opened? */
export const recoveryIsUnseen = (studentId, opportunity) => (
  Boolean(clean(studentId) && opportunity?.notify && opportunity?.noticeKey)
  && !readMark(SEEN_PREFIX, studentId, opportunity.noticeKey)
);

/**
 * The student has looked at this Recovery (its Results panel or its runner):
 * this phase and every earlier one — and a teacher's replacement question the
 * panel is showing — are seen, and need no announcement.
 */
export const markRecoverySeen = (studentId, { assignmentId, section, state, plan = null } = {}) => {
  const phase = recoveryPhaseForState(state);
  if (!clean(studentId) || !clean(assignmentId) || !phase) return;
  const reached = PHASE_ORDER.slice(0, PHASE_ORDER.indexOf(phase) + 1);
  const replacement = recoveryNoticePhase({ state, plan });
  if (replacement && !reached.includes(replacement)) reached.push(replacement);
  reached.forEach((seenPhase) => {
    const noticeKey = recoveryNoticeKey({ assignmentId, section, phase: seenPhase });
    writeMark(SEEN_PREFIX, studentId, noticeKey);
    writeMark(NOTIFIED_PREFIX, studentId, noticeKey);
  });
};
