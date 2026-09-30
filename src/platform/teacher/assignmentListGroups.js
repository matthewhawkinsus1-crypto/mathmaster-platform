/*
 * THE ASSIGNMENT LIST STARTS WITH WHAT IS BEING TAUGHT.
 *
 * The Assignments tab used to render every assignment the teacher ever made in
 * one flat list, oldest due date first (the order the live snapshot arrives
 * in). In August that is fine; by spring, today's lesson is below a whole
 * year of closed work, last marking period's reviews and library copies.
 *
 * Nothing is hidden or removed. The same assignments are grouped by what a
 * teacher is doing with them right now:
 *
 *   current     open for credit (on time or in its late window), due soonest
 *               first — what students are working on
 *   scheduled   assigned but not released yet, soonest release first
 *   closed      past the final deadline (practice only), most recent first,
 *               one group per marking period: this period's, then earlier
 *   library     copies that are not assigned to any class
 *
 * `flat: true` (a search or a Library filter is active) returns one group in
 * the same current-first order, so a match is never folded out of sight.
 *
 * Pure: reads lifecycle and grading periods, writes nothing.
 */
import { getAssignmentLifecycle } from '../../assignmentLifecycle.js';
import { isLibraryAssignment } from '../../assignmentDestinations.js';
import { resolveAssignmentGradingPeriod } from '../student/gradingPeriods.js';

export const ASSIGNMENT_LIST_GROUP = Object.freeze({
  CURRENT: 'current',
  SCHEDULED: 'scheduled',
  CLOSED: 'closed',
  LIBRARY: 'library',
  ALL: 'all',
});

const time = (date) => (date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null);
const ascending = (value) => (value === null ? Number.POSITIVE_INFINITY : value);
const descending = (value) => (value === null ? Number.NEGATIVE_INFINITY : value);
const byTitle = (left, right) => String(left.assignment?.title || '').localeCompare(String(right.assignment?.title || ''), undefined, { sensitivity: 'base', numeric: true });

const kindOf = (entry) => {
  if (isLibraryAssignment(entry.assignment)) return ASSIGNMENT_LIST_GROUP.LIBRARY;
  if (entry.lifecycle.isScheduled) return ASSIGNMENT_LIST_GROUP.SCHEDULED;
  if (entry.lifecycle.isClosed) return ASSIGNMENT_LIST_GROUP.CLOSED;
  return ASSIGNMENT_LIST_GROUP.CURRENT;
};

const KIND_ORDER = [ASSIGNMENT_LIST_GROUP.CURRENT, ASSIGNMENT_LIST_GROUP.SCHEDULED, ASSIGNMENT_LIST_GROUP.CLOSED, ASSIGNMENT_LIST_GROUP.LIBRARY];

/** The order inside every group, and across the whole list when flat. */
export const compareForAssignmentList = (left, right) => {
  const kind = KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
  if (kind) return kind;
  if (left.kind === ASSIGNMENT_LIST_GROUP.CURRENT) {
    // On-time work before late-window work; each due soonest first.
    return Number(left.lifecycle.isLate) - Number(right.lifecycle.isLate)
      || ascending(time(left.lifecycle.isLate ? left.lifecycle.lateDueAt : left.lifecycle.dueAt)) - ascending(time(right.lifecycle.isLate ? right.lifecycle.lateDueAt : right.lifecycle.dueAt))
      || byTitle(left, right);
  }
  if (left.kind === ASSIGNMENT_LIST_GROUP.SCHEDULED) {
    return ascending(time(left.lifecycle.releaseAt)) - ascending(time(right.lifecycle.releaseAt)) || byTitle(left, right);
  }
  if (left.kind === ASSIGNMENT_LIST_GROUP.CLOSED) {
    const closedAt = (entry) => time(entry.lifecycle.lateDueAt) ?? time(entry.lifecycle.dueAt);
    return descending(closedAt(right)) - descending(closedAt(left)) || byTitle(left, right);
  }
  return byTitle(left, right);
};

export const groupAssignmentList = ({ assignments = [], nowValue = Date.now(), gradingPeriodSettings = null, flat = false } = {}) => {
  const entries = (assignments || []).filter(Boolean).map((assignment) => {
    const lifecycle = getAssignmentLifecycle(assignment, nowValue);
    const entry = { assignment, lifecycle };
    entry.kind = kindOf(entry);
    entry.period = resolveAssignmentGradingPeriod(assignment, gradingPeriodSettings || {});
    return entry;
  }).sort(compareForAssignmentList);

  if (flat) {
    return entries.length
      ? [{ id: ASSIGNMENT_LIST_GROUP.ALL, kind: ASSIGNMENT_LIST_GROUP.ALL, label: 'Matching assignments', folded: false, assignments: entries.map((entry) => entry.assignment) }]
      : [];
  }

  const groups = [];
  const push = (group) => { if (group.assignments.length) groups.push(group); };
  const of = (kind) => entries.filter((entry) => entry.kind === kind);

  push({ id: 'current', kind: ASSIGNMENT_LIST_GROUP.CURRENT, label: 'Current', hint: 'open for credit · due soonest first', folded: false, assignments: of(ASSIGNMENT_LIST_GROUP.CURRENT).map((entry) => entry.assignment) });
  push({ id: 'scheduled', kind: ASSIGNMENT_LIST_GROUP.SCHEDULED, label: 'Scheduled', hint: 'assigned, opens later', folded: false, assignments: of(ASSIGNMENT_LIST_GROUP.SCHEDULED).map((entry) => entry.assignment) });

  // Closed work, one group per marking period: this period's first (recently
  // closed — what a teacher grades and exports), then earlier periods.
  const closedByPeriod = new Map();
  of(ASSIGNMENT_LIST_GROUP.CLOSED).forEach((entry) => {
    if (!closedByPeriod.has(entry.period.id)) closedByPeriod.set(entry.period.id, { period: entry.period, entries: [] });
    closedByPeriod.get(entry.period.id).entries.push(entry);
  });
  [...closedByPeriod.values()]
    .sort((left, right) => Number(right.period.isCurrent) - Number(left.period.isCurrent) || (right.period.order || 0) - (left.period.order || 0))
    .forEach(({ period, entries: closed }) => push({
      id: `closed:${period.id}`,
      kind: ASSIGNMENT_LIST_GROUP.CLOSED,
      label: period.isCurrent ? 'Closed this marking period' : `Closed · ${period.label}`,
      hint: 'practice only now · grades, work and export are in each one',
      folded: true,
      period,
      assignments: closed.map((entry) => entry.assignment),
    }));

  push({ id: 'library', kind: ASSIGNMENT_LIST_GROUP.LIBRARY, label: 'Library copies', hint: 'not assigned to a class', folded: true, assignments: of(ASSIGNMENT_LIST_GROUP.LIBRARY).map((entry) => entry.assignment) });
  return groups;
};
