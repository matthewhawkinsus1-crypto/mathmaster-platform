import { formatDateTime } from '../../assignmentLifecycle.js';
import { GRADE_STATUS } from './studentGradeCenterModel.js';
import { TEST_CYCLE_DISCOVERY } from './testCycleDiscovery.js';

/*
 * "WAYS TO RAISE YOUR GRADE" — WHAT A STUDENT CAN STILL DO, FROM DATA ALREADY
 * ON THE DEVICE.
 *
 * Grades answers "how am I doing?". This answers the next question, "what can I
 * do about it?", and it answers it only from things other modules already
 * decided:
 *
 *   missing / late work   the Grade Center entry's status and lifecycle
 *   Recovery              buildRecoverySummariesByAssignment (recoveryStates.js),
 *                         the same summary the result page shows
 *   Practice Pass         practicePassEligibleAssignments — a UX filter; the
 *                         server still decides when the student redeems
 *   corrections / retest  the Test Cycle stage (describeTestCycleForStudent's
 *                         key, or the server-written projection stage)
 *
 * It is a list of DOORS, never a gate: each row's action lands on the screen
 * that already enforces the rule (the assignment, the result page, My Rewards,
 * the Test Cycle card).
 *
 * NEVER LISTED: excused work (nothing to raise), closed work (the grade is
 * frozen; only no-credit practice is left), work whose grade is waiting on the
 * teacher (nothing the student does changes it now), and work that is not open
 * to them yet.
 */

export const WAY_KIND = Object.freeze({
  MISSING: 'missing',
  LATE_WINDOW: 'lateWindow',
  RECOVERY: 'recovery',
  PRACTICE_PASS: 'practicePass',
  TEST_CYCLE: 'testCycle',
});

export const WAY_ACTION = Object.freeze({
  START: 'start',
  OPEN_RESULT: 'openResult',
  OPEN_REWARDS: 'openRewards',
  OPEN_TEST_CYCLE: 'openTestCycle',
  // Nothing to press yet: the work is open overall but nothing in it can be
  // done this minute. The row carries the wait line instead of a button.
  NONE: 'none',
});

export const WAY_URGENCY = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });

const KIND_RANK = {
  [WAY_KIND.MISSING]: 0,
  [WAY_KIND.LATE_WINDOW]: 1,
  [WAY_KIND.TEST_CYCLE]: 2,
  [WAY_KIND.RECOVERY]: 3,
  [WAY_KIND.PRACTICE_PASS]: 4,
};

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const possessive = (title) => (/s$/i.test(title) ? `${title}'` : `${title}'s`);

/**
 * Can anything the student does still change this assignment's grade?
 *
 * Not when an assignment-level teacher grade (an integrity zero) decides it:
 * the gradebook and Classroom read that score whatever else is finished.
 */
export const entryCanStillRise = (entry) => Boolean(entry)
  && !entry.teacherGrade
  && entry.excused !== true
  && entry.frozen !== true
  && entry.lifecycle?.isPracticeOnly !== true
  && entry.locked !== true
  && entry.status !== GRADE_STATUS.EXCUSED
  && entry.status !== GRADE_STATUS.PENDING_GRADE
  && entry.status !== GRADE_STATUS.PRACTICE_ONLY
  && entry.status !== GRADE_STATUS.LOCKED;

const lateWindowOpen = (entry, nowValue) => {
  if (entry?.lifecycle?.isLate !== true) return false;
  const closesAt = Date.parse(entry.lateDueAt || '');
  return !Number.isFinite(closesAt) || !Number.isFinite(Number(nowValue)) || Number(nowValue) <= closesAt;
};

/*
 * The Test Cycle stages a student can act on to raise a recorded grade. Taken
 * from describeTestCycleForStudent's key when App supplies it, else read from
 * the projection's own stage: 'corrections' is corrections, 'retest' is an open
 * retest. The projection's 'retestReady' means the retest is still BEING
 * PREPARED, which is nothing a student can do yet, so it is not here.
 */
const TEST_CYCLE_COPY = {
  [TEST_CYCLE_DISCOVERY.CORRECTIONS]: (title) => ({
    text: `Finish your corrections on ${title} to unlock a retest`,
    actionLabel: 'Open corrections',
    urgency: WAY_URGENCY.MEDIUM,
  }),
  [TEST_CYCLE_DISCOVERY.RETEST_READY]: (title) => ({
    text: `Your retest for ${title} is ready`,
    actionLabel: 'Start Retest',
    urgency: WAY_URGENCY.HIGH,
  }),
  [TEST_CYCLE_DISCOVERY.RETEST_IN_PROGRESS]: (title) => ({
    text: `Finish your retest on ${title}`,
    actionLabel: 'Resume Retest',
    urgency: WAY_URGENCY.HIGH,
  }),
};

const stageFromProjection = (stage) => {
  if (stage === 'corrections') return TEST_CYCLE_DISCOVERY.CORRECTIONS;
  if (stage === 'retest') return TEST_CYCLE_DISCOVERY.RETEST_READY;
  return null;
};

const RECOVERY_COPY = {
  unlocked: (label) => ({ text: `${label} unlocked — try again`, actionLabel: 'Try again', urgency: WAY_URGENCY.MEDIUM }),
  inProgress: (label) => ({ text: `Finish your ${label}`, actionLabel: 'Continue', urgency: WAY_URGENCY.MEDIUM }),
  locked: (label) => ({ text: `Practice to unlock your ${label}`, actionLabel: 'See how', urgency: WAY_URGENCY.LOW }),
};

const RECOVERY_SECTION_LABEL = { dol: 'DOL Recovery', warmup: 'Warm-Up Recovery' };

/**
 * The ordered list: missing work, late work, Test Cycle steps, Recovery, then
 * Practice Passes (which is also most to least urgent — `urgency` on each row
 * is for styling); within a kind, the deadline that closes soonest first.
 */
export const buildWaysToRaise = ({
  gradeCenter = null,
  recoverySummariesByAssignment = {},
  practicePassEligibleAssignmentIds = [],
  testCycleStages = {},
  /*
   * OPTIONAL { [assignmentId]: dashboard entry } — the same map the Grade
   * Center rows get (applyTodayToGradeActions): actionable, action, waitText,
   * nextQuestionIndex, finished, excused. A lesson open overall can still
   * have nothing workable now (a teacher-locked section, a Warm-Up or DOL
   * outside its window), or nothing left at all. With an entry:
   *
   *   finished / excused       no missing or late way at all
   *   open Recovery            no Start way (the Recovery way opens it)
   *   not actionable now       the way stays, with NO action: its text
   *                            carries the entry's wait line
   *   actionable               Start/Continue, landing on nextQuestionIndex
   *
   * Without one, the dates alone decide, as before.
   */
  todayByAssignment = null,
  nowValue = Date.now(),
  formatDate = formatDateTime,
} = {}) => {
  const entries = list(gradeCenter?.entries);
  const byId = new Map(entries.map((entry) => [entry.assignmentId, entry]));
  const ways = [];
  const seen = new Set();
  const add = (way) => {
    const id = [way.kind, way.assignmentId, way.section || ''].join(':');
    if (seen.has(id)) return;
    seen.add(id);
    ways.push({ id, ...way });
  };
  const dateOf = (entry) => formatDate(entry.lateDueAt || entry.dueAt);
  // A Test Cycle's card owns its stages, as in applyTodayToGradeActions.
  const todayOf = (entry) => {
    const today = todayByAssignment?.[entry.assignmentId] || null;
    return today && !today.testCycle ? today : null;
  };
  const nothingLeft = (today) => Boolean(today) && (today.finished === true || today.excused === true
    || (today.actionable === true && today.action === 'recovery'));
  // What pressing the way does: Start/Continue landing where Home would, or —
  // when nothing is workable this minute — nothing, with the wait line.
  const startOrWait = (today, label, text) => {
    if (today && today.actionable !== true) {
      const wait = clean(today.waitText) || 'Nothing in it can be worked right now.';
      return { text: `${text} ${wait}`, actionLabel: null, action: WAY_ACTION.NONE, waitText: wait };
    }
    return {
      text,
      actionLabel: label,
      action: WAY_ACTION.START,
      ...(today && Number.isInteger(today.nextQuestionIndex) ? { questionIndex: today.nextQuestionIndex } : {}),
    };
  };

  // 1. Missing and late work, straight from the Grade Center's own status.
  entries.forEach((entry) => {
    if (!entryCanStillRise(entry)) return;
    const today = todayOf(entry);
    if (nothingLeft(today)) return;
    if (entry.status === GRADE_STATUS.MISSING && entry.lifecycle?.isOpen === true && lateWindowOpen(entry, nowValue)) {
      add({
        kind: WAY_KIND.MISSING,
        assignmentId: entry.assignmentId,
        title: entry.title,
        urgency: WAY_URGENCY.HIGH,
        closesAt: entry.lateDueAt || null,
        ...startOrWait(today, 'Start', `${entry.title} is missing. Late work is open until ${dateOf(entry)}.`),
      });
      return;
    }
    const startedLate = entry.status === GRADE_STATUS.LATE
      || entry.status === GRADE_STATUS.REOPENED
      || entry.status === GRADE_STATUS.IN_PROGRESS;
    if (startedLate && lateWindowOpen(entry, nowValue)) {
      add({
        kind: WAY_KIND.LATE_WINDOW,
        assignmentId: entry.assignmentId,
        title: entry.title,
        urgency: WAY_URGENCY.HIGH,
        closesAt: entry.lateDueAt || null,
        ...startOrWait(
          today,
          Number(entry.overall?.attempted) > 0 ? 'Continue' : 'Start',
          `Late work is open until ${dateOf(entry)} — finish ${entry.title} for credit.`,
        ),
      });
    }
  });

  // 2. Test Cycle corrections and retests.
  entries.forEach((entry) => {
    if (!entryCanStillRise(entry) || !entry.isTestCycle) return;
    const key = clean(testCycleStages?.[entry.assignmentId]) || stageFromProjection(clean(entry.testCycleStage));
    const copy = TEST_CYCLE_COPY[key];
    if (!copy) return;
    add({
      kind: WAY_KIND.TEST_CYCLE,
      assignmentId: entry.assignmentId,
      title: entry.title,
      stage: key,
      action: WAY_ACTION.OPEN_TEST_CYCLE,
      closesAt: entry.lateDueAt || null,
      ...copy(entry.title),
    });
  });

  // 3. Recovery the result page would offer.
  Object.entries(recoverySummariesByAssignment || {}).forEach(([assignmentId, summary]) => {
    const entry = byId.get(assignmentId);
    if (!entryCanStillRise(entry)) return;
    list(summary).forEach((item) => {
      const copy = RECOVERY_COPY[item?.state];
      if (!copy) return;
      const endsAt = Number(item.endsAtMs);
      if (Number.isFinite(endsAt) && item.endsAtMs !== null && Number.isFinite(Number(nowValue)) && Number(nowValue) > endsAt) return;
      const label = clean(item.label) || RECOVERY_SECTION_LABEL[item.section] || 'Recovery';
      const filled = copy(label);
      add({
        kind: WAY_KIND.RECOVERY,
        assignmentId,
        title: entry.title,
        section: item.section || null,
        recoveryState: item.state,
        text: `${filled.text} (${entry.title})`,
        actionLabel: filled.actionLabel,
        action: WAY_ACTION.OPEN_RESULT,
        urgency: filled.urgency,
        closesAt: Number.isFinite(endsAt) && item.endsAtMs !== null ? new Date(endsAt).toISOString() : (entry.lateDueAt || null),
      });
    });
  });

  // 4. Practice Passes. Accepts App's eligible-assignment rows or bare ids.
  list(practicePassEligibleAssignmentIds).forEach((item) => {
    const assignmentId = clean(typeof item === 'object' && item !== null ? item.assignmentId : item);
    const entry = byId.get(assignmentId);
    if (!entryCanStillRise(entry)) return;
    add({
      kind: WAY_KIND.PRACTICE_PASS,
      assignmentId,
      title: entry.title,
      text: `Use a Practice Pass on ${possessive(entry.title)} Practice`,
      actionLabel: 'Open My Rewards',
      action: WAY_ACTION.OPEN_REWARDS,
      urgency: WAY_URGENCY.LOW,
      closesAt: entry.lateDueAt || null,
    });
  });

  const closes = (way) => {
    const value = Date.parse(way.closesAt || '');
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  return ways
    .map((way, order) => ({ way, order }))
    .sort((a, b) => (KIND_RANK[a.way.kind] - KIND_RANK[b.way.kind])
      || (closes(a.way) - closes(b.way))
      || (a.order - b.order))
    .map(({ way }) => way);
};

/** How many ways there are — for the Home badge ("3 ways to raise your grade"). */
export const countWaysToRaise = (ways) => list(ways).length;

export default buildWaysToRaise;
