export const CLASS_PERIODS = Array.from({ length: 8 }, (_, index) => `Period ${index + 1}`);

export const DEFAULT_CLASS_SCHEDULE = {
  version: 1,
  periods: Object.fromEntries(
    CLASS_PERIODS.map((period) => [period, { enabled: false, start: '', end: '' }]),
  ),
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
  return assigned.length === 0 || assigned.includes(classPeriod);
};

export const normalizeSchedule = (schedule) => ({
  ...DEFAULT_CLASS_SCHEDULE,
  ...(schedule || {}),
  periods: {
    ...DEFAULT_CLASS_SCHEDULE.periods,
    ...(schedule?.periods || {}),
  },
  modifiedSchedules: schedule?.modifiedSchedules || {},
});

const localDateKey = (nowValue = Date.now()) => {
  const date = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const daySchedule = schedule.modifiedSchedules?.[dateKey]?.periods || schedule.periods;
  const period = daySchedule?.[classPeriod];
  if (!period?.enabled || !period.start || !period.end) return null;
  const start = timeOnDate(now, period.start);
  const end = timeOnDate(now, period.end);
  if (!start || !end || end <= start) return null;
  return { start, end, period: classPeriod, modified: Boolean(schedule.modifiedSchedules?.[dateKey]) };
};

export const resolveDOLQuestionIndex = (assignment) => {
  const questions = Array.isArray(assignment?.questions) ? assignment.questions : [];
  const explicit = Number(assignment?.dol?.questionIndex ?? assignment?.dolQuestionIndex);
  if (Number.isInteger(explicit) && explicit >= 0 && explicit < questions.length) return explicit;
  const flagged = questions.findIndex((question) => question?.isDOL === true || question?.role === 'dol');
  if (flagged >= 0) return flagged;
  const introductory = questions.findIndex((question) => ['intro', 'mid', 'medium'].includes(String(question?.difficulty || '').toLowerCase()));
  if (introductory >= 0) return introductory;
  return questions.length ? Math.max(0, Math.floor((questions.length - 1) / 2)) : -1;
};

export const getDOLState = ({ assignment, schedule, classPeriod, nowValue = Date.now() }) => {
  const enabled = assignment?.dol?.enabled ?? assignment?.assignmentType === 'practice';
  const questionIndex = resolveDOLQuestionIndex(assignment);
  const window = getPeriodWindow(schedule, classPeriod, nowValue);
  if (!enabled || questionIndex < 0 || !window) {
    return { enabled: Boolean(enabled), status: 'unavailable', questionIndex, window: null, millisecondsRemaining: null };
  }
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const minutesBeforeEnd = Math.max(1, Number(assignment?.dol?.minutesBeforeEnd || 10));
  const opensAt = new Date(window.end.getTime() - minutesBeforeEnd * 60000);
  const status = now < window.start ? 'beforeClass' : now < opensAt ? 'waiting' : now <= window.end ? 'active' : 'ended';
  return {
    enabled: true,
    status,
    questionIndex,
    window,
    opensAt,
    endsAt: window.end,
    millisecondsRemaining: status === 'active' ? Math.max(0, window.end.getTime() - now.getTime()) : status === 'waiting' ? Math.max(0, opensAt.getTime() - now.getTime()) : 0,
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
  if (assignment?.assignmentType !== 'notesClasswork') return { met: false, score: null };
  const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
  const rule = assignment.completionRule || {};
  const minSeconds = Math.max(0, Number(rule.minEngagementMinutes ?? 10) * 60);
  const requiredPercent = Math.max(0, Math.min(100, Number(rule.minimumQuestionCompletionPercent ?? 80)));
  const completed = questions.reduce((total, _, index) => {
    const status = assignmentTracker?.[index]?.status;
    return total + (status && status !== 'unattempted' ? 1 : 0);
  }, 0);
  const completionPercent = questions.length ? Math.round((completed / questions.length) * 100) : 100;
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
