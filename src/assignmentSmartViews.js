import { CLASS_PERIODS, getAssignmentDate, getAssignmentLifecycle, getDOLState } from './assignmentLifecycle.js';

// Smart Views are computed on the fly from existing lifecycle/DOL data —
// nothing here is stored. Each view is a pure predicate over one assignment.
export const SMART_VIEWS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'lateWindow', label: 'Late Window' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'closed', label: 'Closed' },
  { id: 'dolToday', label: 'DOL Today' },
  { id: 'archived', label: 'Archived' },
];

export const isArchived = (assignment) => Boolean(assignment?.archived);

const localDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dueDateKey = (assignment) => {
  const dueAt = getAssignmentDate(assignment, 'due');
  return dueAt ? localDateKey(dueAt) : null;
};

const hasDolWindowToday = (assignment, classSchedule, nowValue) => {
  if (!assignment?.dol?.enabled) return false;
  const periods = Array.isArray(assignment.assignedClassPeriods) && assignment.assignedClassPeriods.length
    ? assignment.assignedClassPeriods
    : CLASS_PERIODS;
  return periods.some((classPeriod) => {
    const dolState = getDOLState({ assignment, schedule: classSchedule, classPeriod, nowValue });
    return dolState.window !== null;
  });
};

// Archived assignments are hidden from every view except "Archived" itself
// — including the default/"All" view — so archiving actually declutters the
// list rather than just adding another badge to look past.
export const matchesSmartView = (assignment, viewId, { nowValue = Date.now(), classSchedule } = {}) => {
  if (viewId === 'archived') return isArchived(assignment);
  if (isArchived(assignment)) return false;
  if (!viewId) return true;
  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
  const todayKey = localDateKey(nowValue);
  switch (viewId) {
    case 'today':
      return dueDateKey(assignment) === todayKey;
    case 'upcoming': {
      const key = dueDateKey(assignment);
      return Boolean(key) && Boolean(todayKey) && key > todayKey;
    }
    case 'active':
      return lifecycle.isOpen;
    case 'lateWindow':
      return lifecycle.isLate;
    case 'scheduled':
      return lifecycle.isScheduled;
    case 'closed':
      return lifecycle.isClosed;
    case 'dolToday':
      return hasDolWindowToday(assignment, classSchedule, nowValue);
    default:
      return true;
  }
};

export const filterAssignmentsBySmartView = (assignments, viewId, context) => {
  if (!viewId) return assignments;
  return (assignments || []).filter((assignment) => matchesSmartView(assignment, viewId, context));
};
