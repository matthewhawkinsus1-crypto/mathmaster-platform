/*
 * THE LIGHT HALF OF RECOVERY DISCOVERY: PHASES, ANNOUNCEMENTS AND "NEW" MARKS.
 *
 * What Home, the Assignments Center and the assignment header need to SHOW a
 * Recovery list and to announce it once: the phases, the notice keys, the one
 * toast for everything new, and the per-device "already told" and "NEW"
 * marks. None of it decides a Recovery — that is studentRecoveryDiscovery.js,
 * which runs the server's own decision and loads after Home
 * (src/app/student/studentRecoveryKit.js) — so these stay in the first load at
 * almost no cost, and studentRecoveryDiscovery.js re-exports them unchanged.
 */

import { RECOVERY_STATE } from '../../../functions/shared/sectionRecoveryEligibility.mjs';
import { exitTicketInSentence } from '../student/studentWords.js';

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
export const PHASE_PRIORITY = Object.freeze({
  [RECOVERY_PHASE.IN_PROGRESS]: 0,
  [RECOVERY_PHASE.UNLOCKED]: 1,
  [RECOVERY_PHASE.AVAILABLE]: 2,
});

// Mid-sentence: "Your exit ticket has closed" (studentWords; the owner, 2026-10-20).
export const RECOVERY_SECTION_NAME = Object.freeze({ warmup: 'Warm-Up', dol: exitTicketInSentence });

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
        message: `${only.assignmentTitle}: your teacher added a new question to your ${only.label}. Your other answers are saved — answer the new one and submit.${until}`,
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
