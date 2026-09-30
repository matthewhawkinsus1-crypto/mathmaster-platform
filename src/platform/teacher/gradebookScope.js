/*
 * WHICH CLASS, WHICH ASSIGNMENT — THE GRADEBOOK'S STARTING POINT.
 *
 * Pure helpers behind components/teacher/GradebookAssignmentBar.jsx, kept in a
 * .js module so they can be tested (node cannot import .jsx).
 */
import { getAssignmentLifecycle, getPeriodWindow } from '../../assignmentLifecycle.js';
import { groupAssignmentsByGradingPeriod } from '../student/gradingPeriods.js';

/*
 * When nothing is chosen, open the most relevant CURRENT assignment: the open
 * one due soonest, else the one that closed most recently. Earlier marking
 * periods are only considered when the current one has nothing.
 */
export const suggestGradebookAssignmentId = (assignments = [], gradingPeriodSettings = null, nowValue = Date.now()) => {
  const groups = groupAssignmentsByGradingPeriod(assignments, gradingPeriodSettings || {});
  const current = groups.find((group) => group.period.isCurrent)?.assignments || [];
  const pool = current.length ? current : assignments;
  if (!pool.length) return null;
  const withLifecycle = pool.map((assignment) => ({ assignment, lifecycle: getAssignmentLifecycle(assignment, nowValue) }));
  const open = withLifecycle.filter((entry) => entry.lifecycle.isOpen)
    .sort((left, right) => (left.lifecycle.dueAt?.getTime() || Infinity) - (right.lifecycle.dueAt?.getTime() || Infinity));
  if (open.length) return open[0].assignment.id;
  const recent = withLifecycle.filter((entry) => !entry.lifecycle.isScheduled)
    .sort((left, right) => (right.lifecycle.lateDueAt?.getTime() || 0) - (left.lifecycle.lateDueAt?.getTime() || 0));
  return (recent[0] || withLifecycle[0]).assignment.id;
};

/*
 * The gradebook follows the class bar, so with "All classes" chosen it has no
 * class to show — it used to be a disabled "Choose an assignment…" and nothing
 * else. It now asks for the class, in the order a teacher reaches for one: the
 * class in session, then the rest of today's in bell order, then the others.
 */
export const orderClassesForGradebook = ({ classes = [], schedule = null, nowValue = Date.now() } = {}) => {
  const now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const rank = (entry) => {
    const window = entry.period ? getPeriodWindow(schedule, entry.period, nowValue) : null;
    if (!window) return { group: 2, start: Number.POSITIVE_INFINITY, window: null, isNow: false };
    const isNow = now >= window.start.getTime() && now <= window.end.getTime();
    return { group: isNow ? 0 : 1, start: window.start.getTime(), window, isNow };
  };
  return (classes || [])
    .filter((entry) => entry?.classId && entry.status !== 'archived')
    .map((entry) => ({ ...entry, ...rank(entry) }))
    .sort((left, right) => left.group - right.group || left.start - right.start
      || String(left.name || left.period).localeCompare(String(right.name || right.period), undefined, { numeric: true }));
};
