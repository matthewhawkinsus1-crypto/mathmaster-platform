import { ACTIVITY_ROLES } from './platform/policies/activityPolicies.js';
import {
  getStoredAssignmentQuestions,
  getStoredAssignmentVariantMode,
  getStoredSectionVariantMode,
  getStoredSectionVariantModes,
} from './platform/contract/storedAssignmentV5.js';
import { projectCurrentAssignmentContent } from './platform/assignments/currentContentProjection.js';
// Warm-Up/DOL/section close rules and the bell schedule live in shared code so
// the browser timer and the Cloud Functions deadline finalizer cannot hold two
// different opinions about when a section closed. See sectionDeadline.mjs.
import {
  CLASS_PERIODS as SHARED_CLASS_PERIODS,
  DEFAULT_CLASS_SCHEDULE as SHARED_DEFAULT_CLASS_SCHEDULE,
  normalizeSchedule as normalizeSharedSchedule,
  resolvePeriodWindow as resolveSharedPeriodWindow,
  resolveScheduleDayType as resolveSharedScheduleDayType,
} from '../functions/shared/classSchedule.mjs';
import {
  MANUALLY_CONTROLLABLE_SECTION_ROLES as SHARED_MANUAL_SECTION_ROLES,
  resolveDolInstructionDateKey,
  resolveDolWindow,
  resolveWarmupClose,
  resolveWarmupInstructionDateKey,
} from '../functions/shared/sectionDeadline.mjs';
import { parseInstant, zonedDateKey } from '../functions/shared/instructionalCalendar.mjs';
import { evaluateClassworkCompletionRule } from '../functions/shared/assignmentProjections.mjs';

export const CLASS_PERIODS = SHARED_CLASS_PERIODS;


export const questionIsIncluded = (question) => question?.teacherExcluded !== true;

export const getIncludedQuestionIndices = (assignmentOrQuestions) => {
  const questions = Array.isArray(assignmentOrQuestions)
    ? assignmentOrQuestions
    : getStoredAssignmentQuestions(assignmentOrQuestions);
  return questions.reduce((indices, question, index) => {
    if (questionIsIncluded(question)) indices.push(index);
    return indices;
  }, []);
};

export const getCurrentContentQuestionIndices = (assignment = {}) => (
  projectCurrentAssignmentContent(assignment).entries.map((entry) => entry.storageIndex)
);

/**
 * The current-content Practice indices a granted Practice Pass would waive,
 * from the SAME projection every other current-content reader here uses.
 * Empty when the assignment has no Practice section — nothing to waive.
 */
export const practicePassWaivedIndices = (assignment = {}) => (
  projectCurrentAssignmentContent(assignment).entries
    .filter((entry) => entry.logicalRole === 'practice')
    .map((entry) => entry.storageIndex)
);

/**
 * THE ONE REUSABLE PROJECTION OF "WHAT IS REQUIRED RIGHT NOW" FOR A REAL
 * STUDENT, GIVEN WHETHER THEY HOLD A PRACTICE PASS FOR THIS ASSIGNMENT.
 *
 * Every student-runtime consumer that currently reads
 * `getCurrentContentQuestionIndices` for REQUIRED navigation/completion —
 * `startAssignment`, the active-question-index correction effect, live
 * presence, the question counter — must read THIS instead once a redemption
 * exists, so "what counts as waived" cannot drift between them. Warm-Up,
 * Classwork, and DOL are never touched; only Practice's own current-content
 * indices are removed, and only when `hasPracticePass` is true.
 *
 * Teacher Preview and live teaching never pass `hasPracticePass: true` (they
 * have no student redemption to read), and post-deadline voluntary Practice
 * Mode is a completely separate tracker this function never touches — see
 * src/platform/student/studentGradeCenterModel.js's own isolation note.
 */
export const studentAssignmentIndicesWithPracticePass = ({ assignment = {}, hasPracticePass = false } = {}) => {
  const included = getCurrentContentQuestionIndices(assignment);
  if (!hasPracticePass) return included;
  const waived = new Set(practicePassWaivedIndices(assignment));
  return included.filter((index) => !waived.has(index));
};

export const DEFAULT_CLASS_SCHEDULE = SHARED_DEFAULT_CLASS_SCHEDULE;

const parseLocalDateTime = (value, endOfDay = false) => {
  const instant = parseInstant(value, { endOfDay });
  return instant === null ? null : new Date(instant);
};

/*
 * A STUDENT-SPECIFIC EXTENSION IS READ HERE, NOT IN A SECOND DEADLINE SYSTEM.
 *
 * `assignment.studentOverrides[studentId]` already carries the per-student
 * `excused`/`reopened` flags the Grade Center reads (see
 * studentGradeCenterModel.js). An absence-driven extension
 * (src/platform/attendance/extensionReconciliation.js) is stored the same
 * way, under `.dueAt` / `.lateDueAt`, so every caller of
 * `getAssignmentLifecycle` — Grade Center, Live Classroom, and any future
 * Grade Transfer withholding check — sees the same resolved deadline for that
 * student without a parallel due-date store to drift out of sync.
 */
const studentOverrideDates = (assignment, studentId) => {
  const id = String(studentId || '').trim();
  if (!id) return null;
  const overrides = assignment?.studentOverrides;
  const entry = overrides && typeof overrides === 'object' ? overrides[id] : null;
  return entry && typeof entry === 'object' ? entry : null;
};

export const getAssignmentDate = (assignment, field, studentId = null) => {
  if (!assignment) return null;
  const override = studentId ? studentOverrideDates(assignment, studentId) : null;
  // Student overrides grant additional credit opportunity; they do not move
  // the class pacing checkpoint that distinguishes on-time from late work.
  if (field === 'due') return parseLocalDateTime(assignment.dueAt || assignment.dueDate, true);
  if (field === 'late') {
    const classFinal = parseLocalDateTime(
      assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate,
      true,
    );
    const studentFinal = parseLocalDateTime(override?.lateDueAt || override?.dueAt, true);
    if (!classFinal) return studentFinal;
    if (!studentFinal) return classFinal;
    return studentFinal.getTime() > classFinal.getTime() ? studentFinal : classFinal;
  }
  if (field === 'release') return parseLocalDateTime(assignment.releaseAt || assignment.releaseDate, false);
  return null;
};

export const getAssignmentLifecycle = (assignment, nowValue = Date.now(), { studentId = null } = {}) => {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const releaseAt = getAssignmentDate(assignment, 'release', studentId);
  const dueAt = getAssignmentDate(assignment, 'due', studentId);
  const lateDueAt = getAssignmentDate(assignment, 'late', studentId);
  let status = 'onTime';
  if (releaseAt && now < releaseAt) status = 'scheduled';
  else if (lateDueAt && now > lateDueAt) status = 'closed';
  else if (dueAt && now > dueAt) status = 'late';

  const target = status === 'scheduled' ? releaseAt : status === 'onTime' ? dueAt : status === 'late' ? lateDueAt : null;
  return {
    status,
    releaseAt,
    dueAt,
    lateDueAt,
    millisecondsRemaining: target ? Math.max(0, target.getTime() - now.getTime()) : null,
    isOpen: status === 'onTime' || status === 'late',
    isLate: status === 'late',
    isClosed: status === 'closed',
    // Once the final grading cutoff has passed, the assignment stays
    // available as voluntary practice. Practice-only attempts must never be
    // written back into grades, evidence, DOLs, activity analytics, or
    // mastery. `isClosed` remains for backwards-compatible deadline checks;
    // `isPracticeOnly` names the student-facing behavior.
    isPracticeOnly: status === 'closed',
    creditEligible: status === 'onTime' || status === 'late',
    isScheduled: status === 'scheduled',
  };
};

export const formatDateTime = (value) => {
  const date = parseLocalDateTime(value, true);
  if (!date) return 'Not set';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatRemainingTime = (milliseconds) => {
  if (!Number.isFinite(Number(milliseconds))) return '';
  const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const normalizeClassContext = (value) => {
  if (value && typeof value === 'object') {
    return {
      classId: String(value.classId || '').trim() || null,
      classPeriod: String(value.classPeriod || value.period || '').trim() || null,
    };
  }
  return { classId: null, classPeriod: String(value || '').trim() || null };
};

// Assignment audience is class-ID only. Bell periods are schedule metadata,
// not identities: two real classes may share the same period label.
export const assignmentIsForStudent = (assignment, classContext) => {
  const { classId } = normalizeClassContext(classContext);
  const assignedClassIds = Array.isArray(assignment?.assignedClassIds)
    ? assignment.assignedClassIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  return assignedClassIds.length > 0 && Boolean(classId && assignedClassIds.includes(classId));
};

const scopedOverride = ({ byClassId, classId }) => {
  const overrides = byClassId && typeof byClassId === 'object' ? byClassId : {};
  return classId ? overrides[classId] || null : null;
};

// Delivery modes are read only from Assignment V5 variantPolicy. Retired
// top-level mirrors are intentionally ignored.
const VERSION_MODES = new Set(['shared', 'personalized', 'variant', 'adaptive']);

export const getSectionVariantMode = (assignment, activityRole) => {
  const sectionMode = getStoredSectionVariantMode(assignment, activityRole);
  if (VERSION_MODES.has(sectionMode)) return sectionMode;
  const assignmentMode = getStoredAssignmentVariantMode(assignment);
  return VERSION_MODES.has(assignmentMode) ? assignmentMode : 'personalized';
};

export const hasMixedSectionVariantModes = (assignment) => {
  const modes = Object.values(getStoredSectionVariantModes(assignment))
    .filter((mode) => VERSION_MODES.has(mode));
  return new Set(modes).size > 1;
};


export const MANUALLY_CONTROLLABLE_SECTION_ROLES = SHARED_MANUAL_SECTION_ROLES;

const SECTION_ACCESS_STATES = new Set(['open', 'closed']);

// Classwork and Practice are ordinarily available whenever the assignment is
// open. A teacher may instead author either section to START LOCKED, then open
// or close it for one class period from the live hub. The override belongs to
// assignment + class period, so Period 3 never changes Period 5.
//
// After the final grading cutoff the whole assignment becomes voluntary
// Practice Mode. At that point teacher section locks no longer hide content —
// students may revisit everything, but none of it writes grades/evidence.
export const getSectionAccessState = ({
  assignment, activityRole, classId = null, classPeriod: _classPeriod, nowValue = Date.now(), studentId = null,
}) => {
  const role = String(activityRole || '').trim().toLowerCase();
  const exists = projectCurrentAssignmentContent(assignment).entries.some((entry) => entry.logicalRole === role);
  const lifecycle = getAssignmentLifecycle(assignment, nowValue, { studentId });

  if (!MANUALLY_CONTROLLABLE_SECTION_ROLES.includes(role) || !exists) {
    return { role, enabled: false, status: 'unavailable', isOpen: true, defaultState: 'open', override: null, lifecycle };
  }
  if (lifecycle.isPracticeOnly) {
    return { role, enabled: true, status: 'open', isOpen: true, defaultState: 'open', override: null, lifecycle, practiceOnly: true };
  }
  if (lifecycle.isScheduled) {
    return { role, enabled: true, status: 'scheduled', isOpen: false, defaultState: 'open', override: null, lifecycle };
  }
  if (!lifecycle.isOpen) {
    return { role, enabled: true, status: 'closedAssignment', isOpen: false, defaultState: 'open', override: null, lifecycle };
  }

  const config = assignment?.sectionAccess?.[role] || {};
  const configuredDefault = String(config.defaultState || assignment?.sectionAccessDefaults?.[role] || 'open').toLowerCase();
  const defaultState = SECTION_ACCESS_STATES.has(configuredDefault) ? configuredDefault : 'open';
  const override = scopedOverride({ byClassId: config?.overridesByClassId, classId });
  const overrideState = String(override?.state || '').toLowerCase();
  const status = SECTION_ACCESS_STATES.has(overrideState) ? overrideState : defaultState;
  return { role, enabled: true, status, isOpen: status === 'open', defaultState, override, lifecycle };
};

export const normalizeSchedule = normalizeSharedSchedule;

export const localDateKey = (nowValue = Date.now()) => zonedDateKey(nowValue);

// A DOL is a one-day instructional checkpoint, not a question that should
// reopen during the last ten minutes of every day an assignment remains open.
// A Warm-Up is the same: the lesson can stay open for completion after the
// instructional day, but the bell-ringer belongs to one class meeting. Both
// resolvers are shared with the Cloud Functions finalizer, which has to reach
// the same answer to know whether today's bell governs a stored checkpoint.
export const getDOLInstructionDateKey = (assignment, classPeriod = null, classId = null) => (
  resolveDolInstructionDateKey({ assignment, classId, classPeriod })
);

export const getWarmupInstructionDateKey = (assignment, classPeriod = null, classId = null) => (
  resolveWarmupInstructionDateKey({ assignment, classId, classPeriod })
);

export const getScheduleDayType = (scheduleValue, nowValue = Date.now()) => resolveSharedScheduleDayType(scheduleValue, nowValue);

export const setScheduleDayTypeOverride = (scheduleValue, dateValue, dayType) => {
  const schedule = normalizeSchedule(scheduleValue);
  const dateKey = localDateKey(dateValue);
  const nextOverrides = { ...schedule.dayTypeOverrides };
  const normalized = String(dayType || '').toUpperCase();
  if (normalized === 'A' || normalized === 'B') nextOverrides[dateKey] = normalized;
  else delete nextOverrides[dateKey];
  return { ...schedule, dayTypeOverrides: nextOverrides };
};

export const getPeriodWindow = (scheduleValue, classPeriod, nowValue = Date.now()) => {
  const window = resolveSharedPeriodWindow({ schedule: scheduleValue, classPeriod, nowValue });
  if (!window) return null;
  return {
    start: new Date(window.startMs),
    end: new Date(window.endMs),
    period: window.period,
    modified: window.modified,
    dayType: window.dayType,
    dayTypeSource: window.dayTypeSource,
  };
};

export const getClassPackUpState = ({
  schedule,
  classPeriod,
  nowValue = Date.now(),
  minutesBeforeEnd = 5,
} = {}) => {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const window = getPeriodWindow(schedule, classPeriod, now);
  const leadMinutes = Math.max(0, Number(minutesBeforeEnd) || 5);
  if (!window) {
    return { status: 'unavailable', window: null, startsAt: null, endsAt: null, millisecondsRemaining: 0, minutesBeforeEnd: leadMinutes };
  }

  const startsAt = new Date(Math.max(window.start.getTime(), window.end.getTime() - leadMinutes * 60000));
  const status = now < startsAt
    ? 'waiting'
    : now <= window.end
      ? 'active'
      : 'ended';

  return {
    status,
    window,
    startsAt,
    endsAt: window.end,
    millisecondsRemaining: status === 'active'
      ? Math.max(0, window.end.getTime() - now.getTime())
      : status === 'waiting'
        ? Math.max(0, startsAt.getTime() - now.getTime())
        : 0,
    minutesBeforeEnd: leadMinutes,
  };
};

export const getWarmupState = ({ assignment, schedule, classId = null, classPeriod, nowValue = Date.now() }) => {
  const enabled = assignment?.warmup?.enabled ?? projectCurrentAssignmentContent(assignment).entries.some((entry) => (
    entry.logicalRole === ACTIVITY_ROLES.WARMUP
  ));
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const todayKey = localDateKey(now);
  const instructionDateKey = getWarmupInstructionDateKey(assignment, classPeriod, classId);
  const minutesBeforeStart = Math.max(0, Number(assignment?.warmup?.minutesBeforeStart ?? 7));
  // Warm-Ups are short bell-ringers. By default they close ten minutes after
  // class starts even if the containing assignment remains open all day/week.
  // A teacher can still reopen the section or set a different live timer for
  // one class through autoCloseByClassId.
  const closeMinutesAfterStart = Math.max(1, Number(assignment?.warmup?.closeMinutesAfterStart ?? 10));

  if (!enabled) {
    return {
      enabled: false,
      status: 'unavailable',
      window: null,
      instructionDateKey,
      opensAt: null,
      endsAt: null,
      defaultCloseAt: null,
      millisecondsRemaining: null,
      minutesBeforeStart,
      closeMinutesAfterStart,
    };
  }

  const window = getPeriodWindow(schedule, classPeriod, now);
  const opensAt = window ? new Date(window.start.getTime() - minutesBeforeStart * 60000) : null;
  const defaultCloseAt = window
    ? new Date(Math.min(window.end.getTime(), window.start.getTime() + closeMinutesAfterStart * 60000))
    : null;

  if (!instructionDateKey) {
    return {
      enabled: true,
      status: 'unscheduled',
      window,
      instructionDateKey: null,
      opensAt,
      endsAt: defaultCloseAt,
      defaultCloseAt,
      millisecondsRemaining: null,
      minutesBeforeStart,
      closeMinutesAfterStart,
    };
  }
  if (todayKey !== instructionDateKey) {
    return {
      enabled: true,
      status: 'notToday',
      window,
      instructionDateKey,
      opensAt,
      endsAt: defaultCloseAt,
      defaultCloseAt,
      millisecondsRemaining: null,
      minutesBeforeStart,
      closeMinutesAfterStart,
    };
  }
  if (!window) {
    return {
      enabled: true,
      status: 'unavailable',
      window: null,
      instructionDateKey,
      opensAt: null,
      endsAt: null,
      defaultCloseAt: null,
      millisecondsRemaining: null,
      minutesBeforeStart,
      closeMinutesAfterStart,
    };
  }

  // The close rules themselves are shared with the Cloud Functions finalizer.
  // A teacher timer/reopen is the explicit live override: it may end before OR
  // after the normal ten-minute cutoff, but never after the class period, and
  // a manual close ends the section outright.
  const sharedClose = resolveWarmupClose({
    assignment,
    window: { startMs: window.start.getTime(), endMs: window.end.getTime() },
    classId,
    todayKey,
  });
  const closedAt = sharedClose.manualCloseAtMs === null ? null : new Date(sharedClose.manualCloseAtMs);
  const closedToday = Boolean(closedAt);
  const autoCloseToday = sharedClose.teacherTimerScheduled;
  const effectiveCloseAt = sharedClose.effectiveCloseAtMs === null ? null : new Date(sharedClose.effectiveCloseAtMs);
  const closeReached = Boolean(effectiveCloseAt && now >= effectiveCloseAt);

  let status;
  if (now > window.end) status = 'ended';
  else if (now < opensAt) status = 'waiting';
  else if (closedToday || closeReached) status = 'closed';
  else status = 'active';

  return {
    enabled: true,
    status,
    window,
    instructionDateKey,
    opensAt,
    endsAt: effectiveCloseAt,
    defaultCloseAt,
    closedAt: closedToday ? closedAt : closeReached ? effectiveCloseAt : null,
    autoCloseAt: autoCloseToday ? effectiveCloseAt : defaultCloseAt,
    autoCloseScheduled: Boolean(status === 'active' && effectiveCloseAt),
    teacherTimerScheduled: Boolean(autoCloseToday),
    minutesBeforeStart,
    closeMinutesAfterStart,
    millisecondsRemaining: status === 'waiting'
      ? Math.max(0, opensAt.getTime() - now.getTime())
      : status === 'active'
        ? Math.max(0, effectiveCloseAt.getTime() - now.getTime())
        : 0,
  };
};

export const resolveDOLQuestionIndices = (assignment) => {
  const questions = getStoredAssignmentQuestions(assignment);
  const projection = projectCurrentAssignmentContent(assignment);
  const included = projection.entries.map((entry) => entry.storageIndex);
  if (!included.length) return [];

  // A modern bundled lesson may contain several DOL questions. The timer and
  // teacher unlock apply to the entire DOL section, not just its first card.
  const authored = projection.entries.filter((entry) => (
    questions[entry.storageIndex]?.isDOL === true || entry.logicalRole === ACTIVITY_ROLES.DOL
  )).map((entry) => entry.storageIndex);
  if (authored.length) return authored;

  // Legacy assignments can still point at one specific DOL question.
  const explicit = Number(assignment?.dol?.questionIndex ?? assignment?.dolQuestionIndex);
  if (Number.isInteger(explicit) && included.includes(explicit)) return [explicit];
  const introductory = included.find((index) => ['intro', 'mid', 'medium'].includes(String(questions[index]?.difficulty || '').toLowerCase()));
  if (Number.isInteger(introductory)) return [introductory];
  return [included[Math.max(0, Math.floor((included.length - 1) / 2))]];
};

export const resolveDOLQuestionIndex = (assignment) => resolveDOLQuestionIndices(assignment)[0] ?? -1;

export const getDOLState = ({ assignment, schedule, classId = null, classPeriod, nowValue = Date.now() }) => {
  const hasAuthoredDOL = projectCurrentAssignmentContent(assignment).entries.some((entry) => (
    entry.logicalRole === ACTIVITY_ROLES.DOL
  ));
  // `dol.enabled` is an explicit teacher/runtime setting. When it is absent,
  // an authored V5 DOL section is enough to enable the window. Practice-only
  // assignments never invent an implicit DOL from retired assignmentType state.
  const enabled = assignment?.dol?.enabled ?? hasAuthoredDOL;
  const questionIndices = resolveDOLQuestionIndices(assignment);
  const questionIndex = questionIndices[0] ?? -1;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const todayKey = localDateKey(now);
  const instructionDateKey = getDOLInstructionDateKey(assignment, classPeriod, classId);
  // Keep today's class window attached even when the saved DOL date is stale.
  // Teacher controls use that window to repair/release a reused lesson for
  // this class without changing the original class's DOL record.
  const window = getPeriodWindow(schedule, classPeriod, now);

  if (!enabled || questionIndex < 0) {
    return { enabled: Boolean(enabled), status: 'unavailable', questionIndex, questionIndices, window: null, instructionDateKey, millisecondsRemaining: null };
  }
  if (!instructionDateKey) {
    return { enabled: true, status: 'unscheduled', questionIndex, questionIndices, window, instructionDateKey: null, millisecondsRemaining: null };
  }
  if (todayKey !== instructionDateKey) {
    return { enabled: true, status: 'notToday', questionIndex, questionIndices, window, instructionDateKey, millisecondsRemaining: null };
  }

  if (!window) {
    return { enabled: true, status: 'unavailable', questionIndex, questionIndices, window: null, instructionDateKey, millisecondsRemaining: null };
  }

  // A lesson DOL now finishes before the bell so students have a real pack-up
  // window. `minutesBeforeEnd` remains the authored working-time duration for
  // backward compatibility; `closeMinutesBeforeEnd` shifts that whole timer
  // earlier without shortening it.
  // Shared with the Cloud Functions finalizer so the DOL cutoff the timer shows
  // is the one the deadline actually enforces.
  const sharedDol = resolveDolWindow({
    assignment,
    window: { startMs: window.start.getTime(), endMs: window.end.getTime() },
    classId,
    todayKey,
  });
  const { durationMinutes, closeMinutesBeforeEnd, earlyUnlocked, teacherRecovery } = sharedDol;
  const regularEndsAt = new Date(sharedDol.regularEndsAtMs);
  const regularOpensAt = new Date(sharedDol.regularOpensAtMs);
  const opensAt = new Date(sharedDol.opensAtMs);
  const endsAt = new Date(sharedDol.endsAtMs);

  const status = now < window.start
    ? 'beforeClass'
    : now < opensAt
      ? 'waiting'
      : now <= endsAt
        ? 'active'
        : 'ended';
  // "Restart" preserves the original early-unlock behavior inside the normal
  // instructional window. "Recover" is the explicit teacher exception after
  // that cutoff: it is audited on the assignment and receives a fresh timer.
  const canRestart = status === 'ended' && teacherRecovery !== true && now < regularEndsAt;
  const canRecover = status === 'ended';

  return {
    enabled: true,
    status,
    questionIndex,
    questionIndices,
    window,
    instructionDateKey,
    opensAt,
    endsAt,
    regularOpensAt,
    regularEndsAt,
    earlyUnlocked,
    teacherRecovery: teacherRecovery === true,
    canRestart,
    canRecover,
    durationMinutes,
    closeMinutesBeforeEnd,
    millisecondsRemaining: status === 'active'
      ? Math.max(0, endsAt.getTime() - now.getTime())
      : status === 'waiting'
        ? Math.max(0, opensAt.getTime() - now.getTime())
        : 0,
  };
};

export const normalizeAssignmentActivity = (activity) => ({
  totalTimeSeconds: Math.max(0, Number(activity?.totalTimeSeconds) || 0),
  onTimeSeconds: Math.max(0, Number(activity?.onTimeSeconds) || 0),
  lateSeconds: Math.max(0, Number(activity?.lateSeconds) || 0),
  lastActiveAt: activity?.lastActiveAt || null,
  lastActiveBeforeDue: activity?.lastActiveBeforeDue || null,
  lastActiveLate: activity?.lastActiveLate || null,
  dueSnapshotAt: activity?.dueSnapshotAt || null,
  lateSnapshotAt: activity?.lateSnapshotAt || null,
  finalOnTimeActiveAt: activity?.finalOnTimeActiveAt || null,
  finalLateActiveAt: activity?.finalLateActiveAt || null,
});

export const recordAssignmentActivity = ({
  activity, assignment, seconds = 0, nowValue = Date.now(), studentId = null,
}) => {
  const current = normalizeAssignmentActivity(activity);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const lifecycle = getAssignmentLifecycle(assignment, now, { studentId });
  const delta = Math.max(0, Math.floor(Number(seconds) || 0));
  const next = {
    ...current,
    totalTimeSeconds: current.totalTimeSeconds + (lifecycle.isClosed ? 0 : delta),
    lastActiveAt: lifecycle.isClosed ? current.lastActiveAt : now.toISOString(),
  };
  if (lifecycle.status === 'onTime') {
    next.onTimeSeconds += delta;
    next.lastActiveBeforeDue = now.toISOString();
  }
  if (lifecycle.status === 'late') {
    next.dueSnapshotAt = next.dueSnapshotAt || lifecycle.dueAt?.toISOString() || now.toISOString();
    next.finalOnTimeActiveAt = next.finalOnTimeActiveAt || current.lastActiveBeforeDue || null;
    next.lateSeconds += delta;
    next.lastActiveLate = now.toISOString();
  }
  if (lifecycle.status === 'closed') {
    next.dueSnapshotAt = next.dueSnapshotAt || lifecycle.dueAt?.toISOString() || null;
    next.lateSnapshotAt = next.lateSnapshotAt || lifecycle.lateDueAt?.toISOString() || now.toISOString();
    next.finalOnTimeActiveAt = next.finalOnTimeActiveAt || current.lastActiveBeforeDue || null;
    next.finalLateActiveAt = next.finalLateActiveAt || current.lastActiveLate || null;
  }
  return next;
};

export const evaluateClassworkCompletion = ({ assignment, assignmentTracker, activity }) => {
  const classworkIndices = projectCurrentAssignmentContent(assignment).entries
    .filter((entry) => entry.logicalRole === ACTIVITY_ROLES.CLASSWORK)
    .map((entry) => entry.storageIndex);
  // Activity roles are now the source of truth. A mixed lesson bundle can carry
  // Warm-Up, Classwork, Practice and DOL together without an outer
  // assignmentType deciding which questions count as classwork completion.
  // The RULE is shared with the Cloud Functions finalizer: an auto-submitted
  // final classwork response has to open the same prerequisite gate a manual
  // Submit would have opened. Only the index projection differs by side.
  return evaluateClassworkCompletionRule({
    classworkIndices,
    assignmentTracker,
    totalTimeSeconds: normalizeAssignmentActivity(activity).totalTimeSeconds,
    completionRule: assignment.completionRule || {},
  });
};

export const prerequisiteAccess = ({ assignment, classworkGradesByAssignment = {}, nowValue = Date.now() }) => {
  const prerequisiteId = assignment?.prerequisiteAssignmentId;
  const releaseAt = getAssignmentDate(assignment, 'release');
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  if (!prerequisiteId) return { open: !releaseAt || now >= releaseAt, reason: releaseAt && now < releaseAt ? 'scheduled' : 'open' };
  const met = Number(classworkGradesByAssignment?.[prerequisiteId]?.score) === 100;
  if (met) return { open: true, reason: 'prerequisiteMet' };
  if (releaseAt && now >= releaseAt) return { open: true, reason: 'automaticRelease' };
  return { open: false, reason: 'prerequisiteRequired', prerequisiteId, releaseAt };
};
