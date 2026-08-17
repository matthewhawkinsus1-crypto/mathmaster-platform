import { ACTIVITY_ROLES, resolveQuestionActivityRole } from './platform/policies/activityPolicies.js';

export const CLASS_PERIODS = Array.from({ length: 8 }, (_, index) => `Period ${index + 1}`);


export const questionIsIncluded = (question) => question?.teacherExcluded !== true;

export const getIncludedQuestionIndices = (assignmentOrQuestions) => {
  const questions = Array.isArray(assignmentOrQuestions)
    ? assignmentOrQuestions
    : Array.isArray(assignmentOrQuestions?.questions)
      ? assignmentOrQuestions.questions
      : [];
  return questions.reduce((indices, question, index) => {
    if (questionIsIncluded(question)) indices.push(index);
    return indices;
  }, []);
};

const emptyPeriods = () => Object.fromEntries(
  CLASS_PERIODS.map((period) => [period, { enabled: false, start: '', end: '' }]),
);

export const DEFAULT_CLASS_SCHEDULE = {
  version: 2,
  // `periods` is kept as a legacy/fallback schedule so older saved settings
  // continue to work. New A/B schedules live in `daySchedules` below.
  periods: emptyPeriods(),
  daySchedules: {
    A: { periods: emptyPeriods() },
    B: { periods: emptyPeriods() },
  },
  // Monday/Wednesday are always A; Tuesday/Thursday are always B. Friday is
  // intentionally null because the school alternates it and the teacher must
  // be able to choose the real day rather than MathMaster guessing.
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
};

const parseLocalDateTime = (value, endOfDay = false) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getAssignmentDate = (assignment, field) => {
  if (!assignment) return null;
  if (field === 'due') return parseLocalDateTime(assignment.dueAt || assignment.dueDate, true);
  if (field === 'late') return parseLocalDateTime(assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate, true);
  if (field === 'release') return parseLocalDateTime(assignment.releaseAt || assignment.releaseDate, false);
  return null;
};

export const getAssignmentLifecycle = (assignment, nowValue = Date.now()) => {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const releaseAt = getAssignmentDate(assignment, 'release');
  const dueAt = getAssignmentDate(assignment, 'due');
  const lateDueAt = getAssignmentDate(assignment, 'late');
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

export const assignmentIsForStudent = (assignment, classPeriod) => {
  const assigned = Array.isArray(assignment?.assignedClassPeriods)
    ? assignment.assignedClassPeriods.filter(Boolean)
    : [];
  // Student audience is explicit: an empty period list means Library / Not assigned.
  // It must never behave as a wildcard, or Library items leak onto every student dashboard.
  return assigned.length > 0 && assigned.includes(classPeriod);
};

const VERSION_MODES = new Set(['shared', 'personalized']);

// Bundled assignments can mix delivery modes by activity section. The old
// assignment-level variantMode remains the fallback so every assignment saved
// before this feature behaves exactly as it did before.
export const getSectionVariantMode = (assignment, activityRole) => {
  const role = String(activityRole || '').trim().toLowerCase();
  const sectionMode = assignment?.sectionVariantModes?.[role];
  if (VERSION_MODES.has(sectionMode)) return sectionMode;
  return VERSION_MODES.has(assignment?.variantMode) ? assignment.variantMode : 'personalized';
};

export const hasMixedSectionVariantModes = (assignment) => {
  const modes = Object.values(assignment?.sectionVariantModes || {}).filter((mode) => VERSION_MODES.has(mode));
  return new Set(modes).size > 1;
};


export const MANUALLY_CONTROLLABLE_SECTION_ROLES = Object.freeze(['classwork', 'practice']);

const SECTION_ACCESS_STATES = new Set(['open', 'closed']);

// Classwork and Practice are ordinarily available whenever the assignment is
// open. A teacher may instead author either section to START LOCKED, then open
// or close it for one class period from the live hub. The override belongs to
// assignment + class period, so Period 3 never changes Period 5.
//
// After the final grading cutoff the whole assignment becomes voluntary
// Practice Mode. At that point teacher section locks no longer hide content —
// students may revisit everything, but none of it writes grades/evidence.
export const getSectionAccessState = ({ assignment, activityRole, classPeriod, nowValue = Date.now() }) => {
  const role = String(activityRole || '').trim().toLowerCase();
  const questions = Array.isArray(assignment?.questions) ? assignment.questions : [];
  const exists = questions.some((question) => questionIsIncluded(question)
    && resolveQuestionActivityRole({ question, assignment }) === role);
  const lifecycle = getAssignmentLifecycle(assignment, nowValue);

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
  const override = classPeriod ? config?.overridesByClassPeriod?.[classPeriod] || null : null;
  const overrideState = String(override?.state || '').toLowerCase();
  const status = SECTION_ACCESS_STATES.has(overrideState) ? overrideState : defaultState;
  return { role, enabled: true, status, isOpen: status === 'open', defaultState, override, lifecycle };
};

const normalizePeriodMap = (periods, fallback = DEFAULT_CLASS_SCHEDULE.periods) => Object.fromEntries(
  CLASS_PERIODS.map((period) => [period, {
    ...(fallback?.[period] || DEFAULT_CLASS_SCHEDULE.periods[period]),
    ...(periods?.[period] || {}),
  }]),
);

export const normalizeSchedule = (schedule) => {
  const legacyPeriods = normalizePeriodMap(schedule?.periods);
  const aPeriods = normalizePeriodMap(schedule?.daySchedules?.A?.periods, legacyPeriods);
  const bPeriods = normalizePeriodMap(schedule?.daySchedules?.B?.periods, legacyPeriods);
  return {
    ...DEFAULT_CLASS_SCHEDULE,
    ...(schedule || {}),
    version: 2,
    periods: legacyPeriods,
    daySchedules: {
      A: { ...(schedule?.daySchedules?.A || {}), periods: aPeriods },
      B: { ...(schedule?.daySchedules?.B || {}), periods: bPeriods },
    },
    weeklyDayTypes: {
      ...DEFAULT_CLASS_SCHEDULE.weeklyDayTypes,
      ...(schedule?.weeklyDayTypes || {}),
    },
    dayTypeOverrides: schedule?.dayTypeOverrides || {},
    modifiedSchedules: schedule?.modifiedSchedules || {},
  };
};

export const localDateKey = (nowValue = Date.now()) => {
  const date = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// A DOL is a one-day instructional checkpoint, not a question that should
// reopen during the last ten minutes of every day an assignment remains open.
// New assignments save dol.instructionDate explicitly. For older assignments,
// automatic release is the best proxy for the assigned instructional date; if
// that was not set, the regular due date is the fallback.
export const getDOLInstructionDateKey = (assignment, classPeriod = null) => {
  const classSpecific = classPeriod ? assignment?.dol?.instructionDatesByClassPeriod?.[classPeriod] : null;
  const explicit = classSpecific || assignment?.dol?.instructionDate || assignment?.dol?.date || assignment?.assignmentDate || null;
  if (explicit) {
    const text = String(explicit);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = parseLocalDateTime(explicit, false);
    if (parsed) return localDateKey(parsed);
  }
  const releaseAt = getAssignmentDate(assignment, 'release');
  if (releaseAt) return localDateKey(releaseAt);
  const dueAt = getAssignmentDate(assignment, 'due');
  return dueAt ? localDateKey(dueAt) : null;
};

// Warm-Up timing is section-specific for the same reason DOL timing is: the
// lesson can remain open for completion after the instructional day, but the
// bell-ringer should only appear around the start of the class that is actually
// receiving it. A teacher may set a different instructional date by period for
// A/B day classes. Older assignments fall back to the assignment release date.
export const getWarmupInstructionDateKey = (assignment, classPeriod = null) => {
  const classSpecific = classPeriod ? assignment?.warmup?.instructionDatesByClassPeriod?.[classPeriod] : null;
  const explicit = classSpecific || assignment?.warmup?.instructionDate || assignment?.warmup?.date || assignment?.assignmentDate || null;
  if (explicit) {
    const text = String(explicit);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = parseLocalDateTime(explicit, false);
    if (parsed) return localDateKey(parsed);
  }
  const releaseAt = getAssignmentDate(assignment, 'release');
  if (releaseAt) return localDateKey(releaseAt);
  const dueAt = getAssignmentDate(assignment, 'due');
  return dueAt ? localDateKey(dueAt) : null;
};

export const getScheduleDayType = (scheduleValue, nowValue = Date.now()) => {
  const schedule = normalizeSchedule(scheduleValue);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const dateKey = localDateKey(now);
  const overridden = String(schedule.dayTypeOverrides?.[dateKey] || '').toUpperCase();
  if (overridden === 'A' || overridden === 'B') return { dayType: overridden, source: 'override', dateKey };
  const weekly = String(schedule.weeklyDayTypes?.[now.getDay()] || '').toUpperCase();
  if (weekly === 'A' || weekly === 'B') return { dayType: weekly, source: 'weekly', dateKey };
  return { dayType: null, source: 'manualRequired', dateKey };
};

export const setScheduleDayTypeOverride = (scheduleValue, dateValue, dayType) => {
  const schedule = normalizeSchedule(scheduleValue);
  const dateKey = localDateKey(dateValue);
  const nextOverrides = { ...schedule.dayTypeOverrides };
  const normalized = String(dayType || '').toUpperCase();
  if (normalized === 'A' || normalized === 'B') nextOverrides[dateKey] = normalized;
  else delete nextOverrides[dateKey];
  return { ...schedule, dayTypeOverrides: nextOverrides };
};

const timeOnDate = (date, text) => {
  if (!/^\d{2}:\d{2}$/.test(String(text || ''))) return null;
  const [hours, minutes] = String(text).split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

export const getPeriodWindow = (scheduleValue, classPeriod, nowValue = Date.now()) => {
  const schedule = normalizeSchedule(scheduleValue);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const dateKey = localDateKey(now);
  const modified = schedule.modifiedSchedules?.[dateKey]?.periods || null;
  const dayTypeState = getScheduleDayType(schedule, now);
  // A date-specific modified schedule always wins. Otherwise use the selected
  // A/B schedule. If Friday has not been designated yet, return no window
  // rather than opening a DOL at the wrong time.
  const daySchedule = modified
    || (dayTypeState.dayType ? schedule.daySchedules?.[dayTypeState.dayType]?.periods : null)
    || (schedule.version < 2 ? schedule.periods : null);
  const period = daySchedule?.[classPeriod];
  if (!period?.enabled || !period.start || !period.end) return null;
  const start = timeOnDate(now, period.start);
  const end = timeOnDate(now, period.end);
  if (!start || !end || end <= start) return null;
  return {
    start,
    end,
    period: classPeriod,
    modified: Boolean(modified),
    dayType: dayTypeState.dayType,
    dayTypeSource: dayTypeState.source,
  };
};

export const getWarmupState = ({ assignment, schedule, classPeriod, nowValue = Date.now() }) => {
  const questions = Array.isArray(assignment?.questions) ? assignment.questions : [];
  const includedQuestions = questions.filter(questionIsIncluded);
  const enabled = assignment?.warmup?.enabled ?? includedQuestions.some((question) => (
    resolveQuestionActivityRole({ question, assignment }) === ACTIVITY_ROLES.WARMUP
  ));
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const todayKey = localDateKey(now);
  const instructionDateKey = getWarmupInstructionDateKey(assignment, classPeriod);
  const minutesBeforeStart = Math.max(0, Number(assignment?.warmup?.minutesBeforeStart ?? 7));

  if (!enabled) {
    return { enabled: false, status: 'unavailable', window: null, instructionDateKey, opensAt: null, endsAt: null, millisecondsRemaining: null, minutesBeforeStart };
  }
  if (!instructionDateKey) {
    return { enabled: true, status: 'unavailable', window: null, instructionDateKey: null, opensAt: null, endsAt: null, millisecondsRemaining: null, minutesBeforeStart };
  }
  if (todayKey !== instructionDateKey) {
    return { enabled: true, status: 'notToday', window: null, instructionDateKey, opensAt: null, endsAt: null, millisecondsRemaining: null, minutesBeforeStart };
  }

  const window = getPeriodWindow(schedule, classPeriod, now);
  if (!window) {
    return { enabled: true, status: 'unavailable', window: null, instructionDateKey, opensAt: null, endsAt: null, millisecondsRemaining: null, minutesBeforeStart };
  }

  const opensAt = new Date(window.start.getTime() - minutesBeforeStart * 60000);
  const endsAt = window.end;
  const closedRecord = assignment?.warmup?.closedByClassPeriod?.[classPeriod] || null;
  const closedAtValue = typeof closedRecord === 'object' ? closedRecord?.closedAt : closedRecord;
  const closedDateKey = typeof closedRecord === 'object' ? closedRecord?.dateKey : null;
  const closedAt = closedAtValue ? parseLocalDateTime(closedAtValue, false) : null;
  const closedToday = Boolean(closedAt && (!closedDateKey || closedDateKey === todayKey));

  let status;
  if (now < opensAt) status = 'waiting';
  else if (closedToday) status = 'closed';
  else if (now <= endsAt) status = 'active';
  else status = 'ended';

  return {
    enabled: true,
    status,
    window,
    instructionDateKey,
    opensAt,
    endsAt,
    closedAt: closedToday ? closedAt : null,
    minutesBeforeStart,
    millisecondsRemaining: status === 'waiting'
      ? Math.max(0, opensAt.getTime() - now.getTime())
      : status === 'active'
        ? Math.max(0, endsAt.getTime() - now.getTime())
        : 0,
  };
};

export const resolveDOLQuestionIndices = (assignment) => {
  const questions = Array.isArray(assignment?.questions) ? assignment.questions : [];
  const included = getIncludedQuestionIndices(questions);
  if (!included.length) return [];

  // A modern bundled lesson may contain several DOL questions. The timer and
  // teacher unlock apply to the entire DOL section, not just its first card.
  const authored = included.filter((index) => (
    questions[index]?.isDOL === true
    || resolveQuestionActivityRole({ question: questions[index], assignment }) === ACTIVITY_ROLES.DOL
  ));
  if (authored.length) return authored;

  // Legacy assignments can still point at one specific DOL question.
  const explicit = Number(assignment?.dol?.questionIndex ?? assignment?.dolQuestionIndex);
  if (Number.isInteger(explicit) && included.includes(explicit)) return [explicit];
  const introductory = included.find((index) => ['intro', 'mid', 'medium'].includes(String(questions[index]?.difficulty || '').toLowerCase()));
  if (Number.isInteger(introductory)) return [introductory];
  return [included[Math.max(0, Math.floor((included.length - 1) / 2))]];
};

export const resolveDOLQuestionIndex = (assignment) => resolveDOLQuestionIndices(assignment)[0] ?? -1;

export const getDOLState = ({ assignment, schedule, classPeriod, nowValue = Date.now() }) => {
  const questions = Array.isArray(assignment?.questions) ? assignment.questions : [];
  const includedQuestions = questions.filter(questionIsIncluded);
  const hasAuthoredDOL = includedQuestions.some((question) => (
    resolveQuestionActivityRole({ question, assignment }) === ACTIVITY_ROLES.DOL
  ));
  const hasExplicitActivityRoles = includedQuestions.some((question) => (
    typeof question?.activityRole === 'string' || typeof question?.role === 'string'
  ));
  // `dol.enabled` is an explicit teacher/runtime setting. When it is absent,
  // an authored DOL section is enough to enable the window. Only truly legacy
  // practice assignments with no per-question roles retain the old implicit
  // DOL behavior; a modern Practice section must not turn an arbitrary middle
  // question into a DOL.
  const legacyImplicitPracticeDOL = !hasExplicitActivityRoles && assignment?.assignmentType === 'practice';
  const enabled = assignment?.dol?.enabled ?? (hasAuthoredDOL || legacyImplicitPracticeDOL);
  const questionIndices = resolveDOLQuestionIndices(assignment);
  const questionIndex = questionIndices[0] ?? -1;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const todayKey = localDateKey(now);
  const instructionDateKey = getDOLInstructionDateKey(assignment, classPeriod);

  if (!enabled || questionIndex < 0) {
    return { enabled: Boolean(enabled), status: 'unavailable', questionIndex, questionIndices, window: null, instructionDateKey, millisecondsRemaining: null };
  }
  if (!instructionDateKey) {
    return { enabled: true, status: 'unavailable', questionIndex, questionIndices, window: null, instructionDateKey: null, millisecondsRemaining: null };
  }
  if (todayKey !== instructionDateKey) {
    return { enabled: true, status: 'notToday', questionIndex, questionIndices, window: null, instructionDateKey, millisecondsRemaining: null };
  }

  const window = getPeriodWindow(schedule, classPeriod, now);
  if (!window) {
    return { enabled: true, status: 'unavailable', questionIndex, questionIndices, window: null, instructionDateKey, millisecondsRemaining: null };
  }

  const durationMinutes = Math.max(1, Number(assignment?.dol?.minutesBeforeEnd || 10));
  const regularOpensAt = new Date(window.end.getTime() - durationMinutes * 60000);
  const unlock = assignment?.dol?.earlyUnlocks?.[classPeriod] || null;
  const unlockDateKey = typeof unlock === 'object' ? unlock?.dateKey : null;
  const unlockAtValue = typeof unlock === 'object' ? unlock?.unlockedAt : unlock;
  const unlockAtParsed = unlockAtValue ? parseLocalDateTime(unlockAtValue, false) : null;
  const unlockMatchesToday = Boolean(unlockAtParsed && (!unlockDateKey || unlockDateKey === todayKey));
  const earlyUnlocked = unlockMatchesToday && unlockAtParsed < regularOpensAt;

  let opensAt = regularOpensAt;
  let endsAt = window.end;
  if (earlyUnlocked) {
    opensAt = new Date(Math.max(window.start.getTime(), unlockAtParsed.getTime()));
    // Early release starts the same DOL timer immediately instead of silently
    // giving a class more time than the authored DOL window.
    endsAt = new Date(Math.min(window.end.getTime(), opensAt.getTime() + durationMinutes * 60000));
  }

  const status = now < window.start
    ? 'beforeClass'
    : now < opensAt
      ? 'waiting'
      : now <= endsAt
        ? 'active'
        : 'ended';

  return {
    enabled: true,
    status,
    questionIndex,
    questionIndices,
    window,
    instructionDateKey,
    opensAt,
    endsAt,
    earlyUnlocked,
    durationMinutes,
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

export const recordAssignmentActivity = ({ activity, assignment, seconds = 0, nowValue = Date.now() }) => {
  const current = normalizeAssignmentActivity(activity);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const lifecycle = getAssignmentLifecycle(assignment, now);
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
  const questions = Array.isArray(assignment?.questions) ? assignment.questions : [];
  const included = getIncludedQuestionIndices(questions);
  const classworkIndices = included.filter((index) => (
    resolveQuestionActivityRole({ question: questions[index], assignment }) === ACTIVITY_ROLES.CLASSWORK
  ));
  // Activity roles are now the source of truth. A mixed lesson bundle can carry
  // Warm-Up, Classwork, Practice and DOL together without an outer
  // assignmentType deciding which questions count as classwork completion.
  if (!classworkIndices.length) return { met: false, score: null };
  const rule = assignment.completionRule || {};
  const minSeconds = Math.max(0, Number(rule.minEngagementMinutes ?? 10) * 60);
  const requiredPercent = Math.max(0, Math.min(100, Number(rule.minimumQuestionCompletionPercent ?? 80)));
  const completed = classworkIndices.reduce((total, index) => {
    const status = assignmentTracker?.[index]?.status;
    return total + (status && status !== 'unattempted' ? 1 : 0);
  }, 0);
  const completionPercent = Math.round((completed / classworkIndices.length) * 100);
  const engagedSeconds = normalizeAssignmentActivity(activity).totalTimeSeconds;
  const met = engagedSeconds >= minSeconds && completionPercent >= requiredPercent;
  return { met, score: met ? 100 : null, engagedSeconds, completionPercent, minSeconds, requiredPercent };
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
