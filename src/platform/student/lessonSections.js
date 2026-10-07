/*
 * ONE "TODAY" RULE: WHAT EACH SECTION OF A LESSON IS DOING RIGHT NOW.
 *
 * Home's next-action card, Home's groups, the Assignments Center and the entry
 * point into an assignment used to answer "can I work on this now?" four
 * different ways. The dashboard knew release dates and prerequisites, not the
 * teacher's Classwork/Practice locks; entry knew the locks and Warm-Up/DOL
 * windows, not what was already finished; nothing knew a whole-assignment
 * excusal. So Home offered "Start" on a lesson whose only open part was locked,
 * and the student landed on "Nothing open right now".
 *
 * This module answers the question once, per section, from facts the caller
 * already holds. It is pure: no React, no Firestore, no clock of its own.
 *
 * WHEN A LESSON IS FINISHED (product decision 4)
 *
 *   A lesson is Finished when every section is done, at any accuracy.
 *   A section is done when the student has completed/submitted it (every
 *   required question is terminal — correct, or out of tries), or it can no
 *   longer be worked: closed with no Recovery the student can take now, or
 *   excused (whole-assignment excusal, a Practice Pass, or a reduced-item
 *   accommodation that leaves the section with nothing required).
 *
 * A Recovery the student can START or CONTINUE now keeps its section open. A
 * Recovery that is still locked behind more Practice does not: the lesson's
 * own work is over, and the locked Recovery is offered as a way to raise the
 * grade (Grades), not as unfinished lesson work.
 */

export const SECTION_ORDER = Object.freeze(['warmup', 'classwork', 'practice', 'dol']);

export const SECTION_LABEL = Object.freeze({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
  review: 'Review',
  quiz: 'Quiz',
  test: 'Test',
});

export const SECTION_STATE = Object.freeze({
  // Every required question is terminal.
  DONE: 'done',
  // The teacher excused it (or nothing in it is required of this student).
  EXCUSED: 'excused',
  // The student can work on it now.
  OPEN: 'open',
  // A Recovery for this closed section can be started or continued now.
  RECOVERY: 'recovery',
  // It opens at a known time (a Warm-Up/DOL later today, a release date).
  OPENS_LATER: 'opensLater',
  // The teacher opens it (a Classwork/Practice lock, an unmet prerequisite,
  // a Warm-Up/DOL with no class window today).
  LOCKED: 'locked',
  // Its window is over and nothing can raise it now.
  CLOSED: 'closed',
});

// States that mean the section asks nothing more of the student.
const FINISHED_STATES = new Set([SECTION_STATE.DONE, SECTION_STATE.EXCUSED, SECTION_STATE.CLOSED]);
const TERMINAL_STATUSES = new Set(['correct', 'expired']);
const RECOVERY_WORKABLE = new Set(['unlocked', 'inProgress']);

const list = (value) => (Array.isArray(value) ? value : []);
const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sectionLabel = (role) => SECTION_LABEL[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Questions');

/**
 * The live window of a timed section (Warm-Up or DOL) as a section state.
 *
 * `windowState` is getWarmupState / getDOLState for this class today.
 * `todayKey` is the school-day key for now, so an instruction date in the past
 * is a closed checkpoint and one in the future opens later.
 */
const timedSectionState = ({ windowState, todayKey }) => {
  if (!windowState || windowState.enabled === false) return { state: SECTION_STATE.OPEN };
  const status = windowState.status;
  if (status === 'active') return { state: SECTION_STATE.OPEN, closesAt: toDate(windowState.endsAt) };
  if (status === 'waiting' || status === 'beforeClass') {
    return { state: SECTION_STATE.OPENS_LATER, opensAt: toDate(windowState.opensAt) };
  }
  if (status === 'closed' || status === 'ended') return { state: SECTION_STATE.CLOSED };
  if (status === 'notToday') {
    const key = String(windowState.instructionDateKey || '');
    if (key && todayKey && key < todayKey) return { state: SECTION_STATE.CLOSED };
    return { state: SECTION_STATE.OPENS_LATER, opensOn: key || null };
  }
  // 'unscheduled' / 'unavailable': no class window the student can work in.
  return { state: SECTION_STATE.LOCKED };
};

/**
 * Every section of one assignment, and what the lesson as a whole asks of the
 * student now.
 *
 * @param {object} input
 * @param {Array<{storageIndex:number, role:string}>} input.entries
 *   Current-content questions in storage order, each with its activity role.
 * @param {number[]} input.requiredIndices
 *   This student's required questions (after a Practice Pass and a reduced-item
 *   accommodation). An entry not listed here is not asked of the student.
 * @param {(index:number) => string} input.statusOf
 *   Normalized tracker status of a question ('unattempted', 'attempted',
 *   'correct', 'expired', …).
 * @param {object} input.lifecycle getAssignmentLifecycle for this student.
 * @param {object} [input.access] prerequisiteAccess result.
 * @param {boolean} [input.excused] whole-assignment excusal for this student.
 * @param {object} [input.warmupState] getWarmupState for this class now.
 * @param {object} [input.dolState] getDOLState for this class now.
 * @param {(role:string) => ({isOpen:boolean}|null)} [input.sectionAccessOf]
 *   The teacher's per-class Classwork/Practice lock (getSectionAccessState).
 * @param {object} [input.recoveryBySection] { warmup: 'unlocked', dol: 'locked', … }
 * @param {string} [input.todayKey] school-day key for now (YYYY-MM-DD).
 */
export const describeLessonSections = ({
  entries = [],
  requiredIndices = [],
  statusOf = () => 'unattempted',
  lifecycle = null,
  access = null,
  excused = false,
  warmupState = null,
  dolState = null,
  sectionAccessOf = null,
  recoveryBySection = {},
  todayKey = '',
} = {}) => {
  const required = new Set(list(requiredIndices).map(Number));
  const roles = [];
  const byRole = new Map();
  list(entries).forEach((entry) => {
    const role = String(entry?.role || entry?.logicalRole || 'practice').trim().toLowerCase() || 'practice';
    if (!byRole.has(role)) {
      byRole.set(role, { included: [], required: [] });
      roles.push(role);
    }
    const bucket = byRole.get(role);
    const index = Number(entry.storageIndex);
    bucket.included.push(index);
    if (required.has(index)) bucket.required.push(index);
  });
  // Lesson order, then anything else in the order it was authored.
  roles.sort((a, b) => {
    const left = SECTION_ORDER.indexOf(a);
    const right = SECTION_ORDER.indexOf(b);
    return (left < 0 ? SECTION_ORDER.length : left) - (right < 0 ? SECTION_ORDER.length : right);
  });

  const scheduled = Boolean(lifecycle?.isScheduled) && access?.reason !== 'prerequisiteMet';
  const prerequisiteLocked = access ? access.open === false : false;
  const practiceOnly = Boolean(lifecycle?.isPracticeOnly);

  const sections = roles.map((role) => {
    const { included, required: requiredInRole } = byRole.get(role);
    const total = requiredInRole.length;
    const statuses = requiredInRole.map((index) => statusOf(index));
    const doneCount = statuses.filter((status) => TERMINAL_STATUSES.has(status)).length;
    const attemptedCount = statuses.filter((status) => status && status !== 'unattempted').length;
    const unfinishedIndices = requiredInRole.filter((index, position) => !TERMINAL_STATUSES.has(statuses[position]));
    const firstUnfinishedIndex = unfinishedIndices[0] ?? null;
    const base = {
      role,
      label: sectionLabel(role),
      includedIndices: included,
      requiredIndices: requiredInRole,
      total,
      doneCount,
      attemptedCount,
      unfinishedIndices,
      firstUnfinishedIndex,
      opensAt: null,
      opensOn: null,
      closesAt: null,
      recoveryState: recoveryBySection?.[role] || null,
    };
    const finish = (state, extra = {}) => {
      const section = { ...base, ...extra, state };
      section.finished = FINISHED_STATES.has(state);
      // Work the student can do this minute, inside this section.
      section.workable = state === SECTION_STATE.OPEN && firstUnfinishedIndex !== null;
      return section;
    };

    if (excused) return finish(SECTION_STATE.EXCUSED);
    // Nothing in it is asked of this student (a Practice Pass, an omitted
    // accommodation item): excused, never "done at 0%".
    if (!total) return finish(SECTION_STATE.EXCUSED);
    if (doneCount === total) return finish(SECTION_STATE.DONE);

    if (practiceOnly) {
      // Past the final close nothing counts any more; voluntary practice is a
      // separate thing the card offers, not unfinished lesson work.
      return finish(SECTION_STATE.CLOSED);
    }
    if (scheduled) return finish(SECTION_STATE.OPENS_LATER, { opensAt: toDate(lifecycle?.releaseAt) });
    if (prerequisiteLocked) return finish(SECTION_STATE.LOCKED, { reason: 'prerequisite' });

    let timed = null;
    if (role === 'warmup') timed = timedSectionState({ windowState: warmupState, todayKey });
    else if (role === 'dol') timed = timedSectionState({ windowState: dolState, todayKey });
    if (timed) {
      if (timed.state === SECTION_STATE.CLOSED && RECOVERY_WORKABLE.has(base.recoveryState)) {
        return finish(SECTION_STATE.RECOVERY);
      }
      return finish(timed.state, timed);
    }

    const sectionAccess = typeof sectionAccessOf === 'function' ? sectionAccessOf(role) : null;
    if (sectionAccess && sectionAccess.isOpen === false) {
      return finish(SECTION_STATE.LOCKED, { reason: 'teacherLock' });
    }
    return finish(SECTION_STATE.OPEN);
  });

  const finished = sections.length > 0 && sections.every((section) => section.finished);
  const workableSections = sections.filter((section) => section.workable);
  // Storage order, not lesson order, decides which question comes first —
  // that is the order the workspace walks.
  const workableQuestionIndices = workableSections
    .flatMap((section) => section.unfinishedIndices)
    .sort((a, b) => a - b);
  const nextQuestionIndex = workableQuestionIndices[0] ?? null;
  const recoverySection = sections.find((section) => section.state === SECTION_STATE.RECOVERY) || null;
  const waiting = sections.filter((section) => !section.finished && !section.workable && section.state !== SECTION_STATE.RECOVERY);
  const nextOpening = waiting
    .filter((section) => section.state === SECTION_STATE.OPENS_LATER && section.opensAt)
    .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())[0]
    || waiting.find((section) => section.state === SECTION_STATE.OPENS_LATER)
    || waiting[0]
    || null;

  return {
    sections,
    finished,
    // Something in this lesson can be worked on this minute.
    workableNow: workableSections.length > 0,
    nextQuestionIndex,
    // Every unfinished question the student can work on now, in storage order.
    workableQuestionIndices,
    nextSection: workableSections.find((section) => section.firstUnfinishedIndex === nextQuestionIndex) || null,
    recoverySection,
    // Not workable now and not finished: the first thing that will open, so a
    // card can say "DOL opens at 2:15 PM" instead of offering a dead Start.
    nextOpening,
    excused: Boolean(excused),
  };
};

/**
 * "DOL opens at 2:15 PM" / "Classwork — your teacher opens it in class".
 * Student copy for a section that cannot be worked yet.
 */
export const describeSectionWait = (section, { formatTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), formatDay = (date) => date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), nowValue = Date.now() } = {}) => {
  if (!section) return null;
  const label = section.label || sectionLabel(section.role);
  if (section.state === SECTION_STATE.OPENS_LATER) {
    if (section.opensAt) {
      const sameDay = new Date(nowValue).toDateString() === section.opensAt.toDateString();
      return `${label} opens ${sameDay ? `at ${formatTime(section.opensAt)}` : formatDay(section.opensAt)}`;
    }
    if (section.opensOn) return `${label} opens in class on ${section.opensOn}`;
    return `${label} opens later`;
  }
  if (section.state === SECTION_STATE.LOCKED) {
    if (section.reason === 'prerequisite') return `${label} opens after you finish the earlier classwork`;
    return `${label} opens when your teacher starts it in class`;
  }
  return null;
};

export default describeLessonSections;
