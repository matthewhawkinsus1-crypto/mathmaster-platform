/*
 * ONE PROJECTION OF "WHAT IS HAPPENING IN THIS CLASS TODAY".
 *
 * Home, the class page and the Assignment Hub used to build their own Warm-Up,
 * Classwork/Practice and DOL control lists, each with a slightly different
 * filter. Two consequences a teacher could see in production:
 *
 *   - "DOL today: 9" on a class page that had no DOL today — every DOL the class
 *     had ever been given qualified, because the filter only asked whether the
 *     class meets today;
 *   - the live controls on Home listed last week's Warm-Ups and DOLs ahead of
 *     today's, three separate times (one list per section type).
 *
 * This module is the single answer, grouped the way a teacher thinks:
 *
 *   today     a Warm-Up or DOL belongs to today's class meeting
 *   open      still open for work, but nothing of it is scheduled today
 *   upcoming  released later
 *   earlier   finished lessons whose Warm-Up/DOL can still be opened today
 *
 * Every section is described three ways — what the automatic schedule says,
 * what is actually true right now, and whether a teacher override is in force —
 * plus the actions that make sense in that state. Nothing here writes; the
 * existing App.jsx handlers do, and each asks before it changes anything.
 */
import {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  getDOLState,
  getPeriodWindow,
  getSectionAccessState,
  getWarmupState,
  localDateKey,
} from '../../assignmentLifecycle.js';
import { scheduledDolDateFor } from '../assessment/assessmentRecovery.js';

export const LESSON_GROUP = Object.freeze({ TODAY: 'today', OPEN: 'open', UPCOMING: 'upcoming', EARLIER: 'earlier' });

const clock = (value) => (value instanceof Date && Number.isFinite(value.getTime())
  ? value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  : '');

export const formatLessonDay = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return '';
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const minutesLeft = (milliseconds) => Math.max(0, Math.ceil(Number(milliseconds || 0) / 60000));

/** The next day (after `fromValue`) on which this period meets, within two weeks. */
export const nextClassDateKey = ({ schedule, classPeriod, fromValue = Date.now(), maxDays = 14 } = {}) => {
  const from = new Date(fromValue);
  for (let offset = 1; offset <= maxDays; offset += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 12);
    if (getPeriodWindow(schedule, classPeriod, day)) return localDateKey(day);
  }
  return null;
};

const dayRelation = (dateKey, todayKey) => {
  if (!dateKey) return 'none';
  if (dateKey === todayKey) return 'today';
  return dateKey > todayKey ? 'future' : 'past';
};

/**
 * The DOL for one class, in teacher language.
 * `attemptBonus` is the class-wide teacher-granted extra attempts.
 */
export const describeDolControl = ({ assignment, state, classId, nowValue = Date.now(), attemptBonus = 0 }) => {
  if (!state?.enabled || state.status === 'unavailable') return null;
  const todayKey = localDateKey(nowValue);
  const relation = dayRelation(state.instructionDateKey, todayKey);
  const saved = scheduledDolDateFor(assignment, classId);
  const movedByTeacher = Boolean(saved);
  const regular = state.regularOpensAt && state.regularEndsAt
    ? `${clock(state.regularOpensAt)}–${clock(state.regularEndsAt)}`
    : '';

  let headline;
  let tone = 'neutral';
  if (state.status === 'active') {
    headline = state.teacherRecovery
      ? `Open · teacher window until ${clock(state.endsAt)}`
      : state.earlyUnlocked ? `Open · opened early by teacher` : 'Open now';
    tone = 'success';
  } else if (state.status === 'waiting') {
    headline = `Opens automatically at ${clock(state.opensAt)}`;
  } else if (state.status === 'beforeClass') {
    headline = state.earlyUnlocked ? `Opens when class starts (${clock(state.window?.start)})` : `Opens automatically at ${clock(state.opensAt)}`;
  } else if (state.status === 'ended') {
    headline = state.teacherClosed
      ? `Closed by teacher at ${clock(state.teacherClosedAt)}`
      : `Ended at ${clock(state.endsAt)}`;
  } else if (state.status === 'notToday') {
    headline = relation === 'future'
      ? `Scheduled for ${formatLessonDay(state.instructionDateKey)}`
      : `Was scheduled for ${formatLessonDay(state.instructionDateKey)}`;
  } else {
    headline = 'No DOL day is set for this class';
  }

  const schedule = relation === 'today' && regular
    ? `Automatic schedule: ${regular} today (${state.durationMinutes} min, ending ${state.closeMinutesBeforeEnd} min before the bell)`
    : state.instructionDateKey
      ? `Automatic schedule: the last part of class on ${formatLessonDay(state.instructionDateKey)}`
      : 'Automatic schedule: none — open it when the class is ready';

  const overrides = [];
  if (movedByTeacher) {
    overrides.push(saved.resolvedDateKey
      ? `Moved by teacher — originally ${formatLessonDay(saved.resolvedDateKey)}`
      : 'Day set by teacher — no day was scheduled');
  }
  if (state.status === 'active' && state.earlyUnlocked) overrides.push('Opened early by teacher');
  if (state.teacherRecovery && ['active', 'ended'].includes(state.status)) overrides.push(state.status === 'active' ? 'Teacher-extended or reopened window' : 'Teacher reopen window has ended');
  if (state.teacherClosed) overrides.push('Closed early by teacher');
  if (attemptBonus) overrides.push(`+${attemptBonus} extra attempt${attemptBonus === 1 ? '' : 's'} for the class`);

  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const classEndMs = state.window?.end?.getTime?.() ?? null;
  const actions = [];
  const notStartedToday = ['waiting', 'beforeClass', 'notToday', 'unscheduled'].includes(state.status);
  if (state.status === 'active') {
    actions.push({ id: 'close', label: 'Close now', tone: 'danger' });
    if (classEndMs !== null && classEndMs > nowMs && (state.endsAt?.getTime?.() ?? 0) < classEndMs) {
      actions.push({ id: 'extend', minutes: 5, label: '+5 min' });
    }
  } else if (state.status === 'ended') {
    actions.push({ id: 'open', label: state.canRestart ? 'Restart DOL' : 'Reopen DOL', tone: 'primary' });
  } else if (notStartedToday && state.window) {
    actions.push({
      id: 'open',
      label: state.status === 'notToday' || state.status === 'unscheduled' ? 'Open today' : 'Open now',
      tone: relation === 'today' ? 'primary' : undefined,
    });
  }
  if (notStartedToday) actions.push({ id: 'move', label: relation === 'today' ? 'Not today…' : 'Change day…' });
  if (notStartedToday && movedByTeacher) actions.push({ id: 'restore', label: 'Back to scheduled day' });
  actions.push({ id: 'grant', label: `+1 attempt${attemptBonus ? ` (now +${attemptBonus})` : ''}` });

  return {
    kind: 'dol',
    label: 'DOL',
    status: state.status,
    relation,
    tone,
    headline,
    schedule,
    overrides,
    override: overrides.length > 0 && !(overrides.length === 1 && attemptBonus),
    countdownEndsAt: state.status === 'active' ? state.endsAt : null,
    minutesLeft: state.status === 'active' ? minutesLeft(state.millisecondsRemaining) : null,
    actions,
    state,
  };
};

/** The Warm-Up for one class, in teacher language. */
export const describeWarmupControl = ({ state, nowValue = Date.now() }) => {
  if (!state?.enabled || state.status === 'unavailable') return null;
  const todayKey = localDateKey(nowValue);
  const relation = dayRelation(state.instructionDateKey, todayKey);
  let headline;
  let tone = 'neutral';
  if (state.status === 'active') {
    headline = state.teacherTimerScheduled ? `Open · teacher timer until ${clock(state.endsAt)}` : `Open now · closes ${clock(state.endsAt)}`;
    tone = 'success';
  } else if (state.status === 'waiting') headline = `Opens automatically at ${clock(state.opensAt)}`;
  else if (state.status === 'closed') headline = state.closedAt ? `Closed at ${clock(state.closedAt)} · work saved` : 'Closed · work saved';
  else if (state.status === 'ended') headline = 'Class period ended';
  else if (state.status === 'notToday') {
    headline = relation === 'future'
      ? `Scheduled for ${formatLessonDay(state.instructionDateKey)}`
      : `Was scheduled for ${formatLessonDay(state.instructionDateKey)}`;
  } else headline = 'No Warm-Up day is set for this class';

  const schedule = relation === 'today' && state.opensAt
    ? `Automatic schedule: opens ${clock(state.opensAt)} (${state.minutesBeforeStart} min before class), closes ${clock(state.defaultCloseAt)}`
    : state.instructionDateKey
      ? `Automatic schedule: the start of class on ${formatLessonDay(state.instructionDateKey)}`
      : 'Automatic schedule: none — open it when the class is ready';

  const actions = [];
  if (state.window && state.status !== 'ended' && state.status !== 'waiting') {
    if (state.status === 'active') actions.push({ id: 'close', label: 'Close', tone: 'danger' });
    else actions.push({ id: 'reopen', label: ['notToday', 'unscheduled'].includes(state.status) ? 'Open today' : 'Reopen', tone: relation === 'today' ? 'primary' : undefined });
    actions.push({ id: 'timer', label: state.status === 'active' ? (state.teacherTimerScheduled ? 'Reset to…' : 'Close in…') : (state.status === 'closed' ? 'Reopen for…' : 'Open for…'), timer: true });
  }
  return {
    kind: 'warmup',
    label: 'Warm-Up',
    status: state.status,
    relation,
    tone,
    headline,
    schedule,
    overrides: state.teacherTimerScheduled ? ['Teacher timer'] : [],
    override: Boolean(state.teacherTimerScheduled),
    countdownEndsAt: state.status === 'active' ? state.endsAt : null,
    actions,
    state,
  };
};

/** Classwork or Practice access for one class (only while the assignment is open). */
export const describeSectionAccessControl = ({ state, role }) => {
  if (!state?.enabled || state.practiceOnly || !state.lifecycle?.isOpen) return null;
  const label = role === 'practice' ? 'Practice' : 'Classwork';
  const closedByTeacher = state.override?.state === 'closed';
  return {
    kind: role,
    label,
    status: state.isOpen ? 'open' : 'closed',
    relation: 'today',
    tone: state.isOpen ? 'success' : 'neutral',
    headline: state.isOpen ? 'Open for new work' : closedByTeacher ? 'Closed by teacher · work saved' : 'Starts locked · waiting for you',
    schedule: state.defaultState === 'closed' ? 'Set to start locked until the teacher opens it' : 'Open whenever the assignment is open',
    overrides: state.override ? [`${state.isOpen ? 'Opened' : 'Closed'} by teacher`] : [],
    override: Boolean(state.override),
    countdownEndsAt: null,
    actions: [{ id: 'toggle', label: state.isOpen ? `Close ${label}` : `Open ${label}`, tone: state.isOpen ? 'danger' : 'primary' }],
    state,
  };
};

/** One assignment's controls for one class. */
export const describeClassLesson = ({ assignment, classContext, schedule, nowValue = Date.now() }) => {
  const classId = classContext?.classId || null;
  const classPeriod = classContext?.classPeriod || null;
  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
  const warmupState = getWarmupState({ assignment, schedule, classId, classPeriod, nowValue });
  const dolState = getDOLState({ assignment, schedule, classId, classPeriod, nowValue });
  const attemptBonus = Number(assignment?.dol?.attemptGrantsByClassId?.[classId]?.extraAttempts || 0);
  const warmup = describeWarmupControl({ state: warmupState, nowValue });
  const dol = describeDolControl({ assignment, state: dolState, classId, nowValue, attemptBonus });
  const classwork = describeSectionAccessControl({ state: getSectionAccessState({ assignment, activityRole: 'classwork', classId, classPeriod, nowValue }), role: 'classwork' });
  const practice = describeSectionAccessControl({ state: getSectionAccessState({ assignment, activityRole: 'practice', classId, classPeriod, nowValue }), role: 'practice' });
  const rows = [warmup, classwork, practice, dol].filter(Boolean);

  const today = Boolean(
    (warmup && warmup.relation === 'today')
    || (dol && dol.relation === 'today')
    || warmupState.status === 'active'
    || dolState.status === 'active'
  );
  let group;
  if (today) group = LESSON_GROUP.TODAY;
  else if (lifecycle.isScheduled) group = LESSON_GROUP.UPCOMING;
  else if (lifecycle.isOpen) group = LESSON_GROUP.OPEN;
  else group = LESSON_GROUP.EARLIER;

  return {
    assignment,
    lifecycle,
    group,
    rows,
    live: rows.some((row) => row.status === 'active' || (row.kind === 'dol' && row.status === 'waiting')),
    warmupToday: Boolean(warmup && warmup.relation === 'today'),
    dolToday: Boolean(dol && dol.relation === 'today'),
    sortKey: Math.max(
      ...[warmupState.instructionDateKey, dolState.instructionDateKey]
        .filter(Boolean).map((key) => Date.parse(`${key}T12:00:00`)),
      lifecycle.dueAt ? lifecycle.dueAt.getTime() : 0,
    ),
  };
};

/**
 * Every lesson assigned to one class, grouped by relevance to today.
 * Earlier lessons are only listed when they still have a Warm-Up or DOL the
 * teacher might open today; fully finished assignments stay out of the way.
 */
export const projectClassLessons = ({ assignments = [], classContext, schedule, nowValue = Date.now() } = {}) => {
  if (!classContext?.classId && !classContext?.classPeriod) {
    return { today: [], open: [], upcoming: [], earlier: [], counts: { warmupsToday: 0, dolsToday: 0 } };
  }
  const lessons = (assignments || [])
    .filter((assignment) => assignmentIsForStudent(assignment, classContext))
    .map((assignment) => describeClassLesson({ assignment, classContext, schedule, nowValue }));
  const by = (group) => lessons.filter((lesson) => lesson.group === group);
  const liveFirst = (left, right) => Number(right.live) - Number(left.live) || right.sortKey - left.sortKey;
  const today = by(LESSON_GROUP.TODAY).sort(liveFirst);
  const open = by(LESSON_GROUP.OPEN).sort((left, right) => (left.lifecycle.dueAt?.getTime() || Infinity) - (right.lifecycle.dueAt?.getTime() || Infinity));
  const upcoming = by(LESSON_GROUP.UPCOMING).sort((left, right) => (left.lifecycle.releaseAt?.getTime() || 0) - (right.lifecycle.releaseAt?.getTime() || 0));
  const earlier = by(LESSON_GROUP.EARLIER)
    .filter((lesson) => lesson.rows.some((row) => row.kind === 'warmup' || row.kind === 'dol'))
    .sort((left, right) => right.sortKey - left.sortKey);
  return {
    today,
    open,
    upcoming,
    earlier,
    counts: {
      warmupsToday: lessons.filter((lesson) => lesson.warmupToday).length,
      dolsToday: lessons.filter((lesson) => lesson.dolToday).length,
    },
  };
};
