import { useEffect, useMemo } from 'react';
import { formatDateTime } from '../../assignmentLifecycle.js';
import { groupAssignmentsByGradingPeriod } from '../../platform/student/gradingPeriods.js';
import { orderClassesForGradebook, suggestGradebookAssignmentId } from '../../platform/teacher/gradebookScope.js';
import { PASSING_DISPLAY_THRESHOLD } from '../../platform/teacher/assignmentProgress.js';
import './teacherWorkspace.css';

/*
 * THE GRADEBOOK STARTS WITH THE ASSIGNMENT, NOT WITH SETTINGS.
 *
 * In production the class gradebook opened on marking-period administration
 * and the weekly Path panel; the grades themselves sat behind a "Select
 * assignment" dropdown at the very bottom of the page, listing every
 * assignment the class ever had in no particular order.
 *
 * This bar is the first thing on the page:
 *   - the picker groups assignments by marking period (current first) and
 *     orders each group by due date, newest first, with the date in the label;
 *   - when nothing is chosen it opens the most relevant current assignment —
 *     the open one due soonest, else the one that closed most recently;
 *   - once chosen, the class summary (complete / in progress / not started /
 *     below 70%) doubles as the table filter, and the assignment's hub, Live
 *     view and Export are one click away.
 */

const dueTime = (assignment) => new Date(assignment?.dueAt || assignment?.dueDate || 0).getTime() || 0;

export function GradebookClassChooser({ classes = [], schedule = null, nowValue = Date.now(), onChoose }) {
  const ordered = orderClassesForGradebook({ classes, schedule, nowValue });
  if (!ordered.length) return null;
  return (
    <section className="tw-card tw-stack" style={{ gap: 10, marginBottom: 18, textAlign: 'left' }} aria-labelledby="gradebook-choose-class">
      <div>
        <h3 id="gradebook-choose-class" className="tw-card__title">Which class?</h3>
        <div className="tw-small tw-muted">Grades are one class at a time. The class you pick stays chosen across Home, Classes, Grades and Grade Export.</div>
      </div>
      <div className="tw-row" role="group" aria-label="Classes">
        {ordered.map((entry) => (
          <button key={entry.classId} type="button" className="tw-chip" onClick={() => onChoose?.({ classId: entry.classId, classPeriod: entry.period || null })}>
            {entry.isNow && <span className="tw-pill" data-tone="primary">NOW</span>}
            <span>{entry.name || entry.period}</span>
            {entry.window && !entry.isNow && <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{entry.window.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

export { orderClassesForGradebook, suggestGradebookAssignmentId };

export default function GradebookAssignmentBar({
  assignments = [],
  selectedAssignmentId = null,
  onSelectAssignment,
  gradingPeriodSettings = null,
  nowValue = Date.now(),
  disabled = false,
  progress = null,
  progressFilter = 'all',
  onProgressFilter = null,
  classLabel = '',
  onOpenAssignment = null,
  onOpenLive = null,
  onOpenExport = null,
  autoSelect = true,
}) {
  const groups = useMemo(() => groupAssignmentsByGradingPeriod(assignments, gradingPeriodSettings || {})
    .map((group) => ({ ...group, assignments: group.assignments.slice().sort((left, right) => dueTime(right) - dueTime(left)) })), [assignments, gradingPeriodSettings]);

  const suggested = useMemo(() => suggestGradebookAssignmentId(assignments, gradingPeriodSettings, nowValue), [assignments, gradingPeriodSettings, nowValue]);
  const selectedExists = assignments.some((assignment) => assignment.id === selectedAssignmentId);
  useEffect(() => {
    if (!autoSelect || disabled) return;
    if (!selectedExists && suggested) onSelectAssignment?.(suggested);
  }, [autoSelect, disabled, selectedExists, suggested]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = assignments.find((assignment) => assignment.id === selectedAssignmentId) || null;
  const stats = progress ? [
    { key: 'all', label: 'Students', value: progress.total },
    { key: 'complete', label: 'Complete', value: progress.complete.length, tone: 'success' },
    { key: 'inProgress', label: 'In progress', value: progress.inProgress.length },
    { key: 'notStarted', label: 'Not started', value: progress.notStarted.length, tone: progress.notStarted.length ? 'warning' : undefined },
    { key: 'below', label: `Below ${PASSING_DISPLAY_THRESHOLD}%`, value: progress.belowThreshold.length, tone: progress.belowThreshold.length ? 'danger' : undefined },
  ] : [];

  return (
    <section className="tw-stack" style={{ gap: 10, marginBottom: 18, textAlign: 'left' }} aria-label="Assignment and class summary">
      <div className="tw-gradebook-bar">
        <label>
          Assignment{classLabel ? ` · ${classLabel}` : ''}
          <select
            className="tw-select"
            aria-label="Gradebook assignment"
            value={selectedExists ? selectedAssignmentId : ''}
            disabled={disabled}
            onChange={(event) => onSelectAssignment?.(event.target.value || null)}
          >
            <option value="">Choose an assignment…</option>
            {groups.map((group) => (
              <optgroup key={group.period.id} label={`${group.period.isCurrent ? 'Current · ' : ''}${group.period.label}${group.period.archived ? ' (closed)' : ''}`}>
                {group.assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.title || 'Untitled'} — due {formatDateTime(assignment.dueAt || assignment.dueDate)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {selected && (
          <div className="tw-row" style={{ justifyContent: 'flex-end' }}>
            {onOpenAssignment && <button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenAssignment(selected.id)}>Assignment details</button>}
            {onOpenLive && <button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenLive(selected.id)}>Live view</button>}
            {onOpenExport && <button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenExport(selected.id)}>Export grades</button>}
          </div>
        )}
      </div>
      {selected && progress && (
        <div className="tw-stack" style={{ gap: 6 }}>
          <div className="tw-stats" role="group" aria-label="Filter students by progress">
            {stats.map((stat) => (
              <button key={stat.key} type="button" className="tw-stat" data-tone={stat.tone} aria-pressed={progressFilter === stat.key} onClick={() => onProgressFilter?.(stat.key)}>
                <div className="tw-stat__value">{stat.value}</div>
                <div className="tw-stat__label">{stat.label}</div>
              </button>
            ))}
          </div>
          <div className="tw-small tw-muted">
            {progress.average === null ? 'Nobody has finished yet.' : `Average ${progress.average}% for the ${progress.averageOf} student${progress.averageOf === 1 ? '' : 's'} who finished.`}
            {' '}Below {PASSING_DISPLAY_THRESHOLD}% counts finished work under {PASSING_DISPLAY_THRESHOLD}%, or under {PASSING_DISPLAY_THRESHOLD}% on the questions answered so far.
            {progressFilter !== 'all' && <> Showing {stats.find((stat) => stat.key === progressFilter)?.label.toLowerCase()} only · <button type="button" className="tw-link" onClick={() => onProgressFilter?.('all')}>show everyone</button></>}
          </div>
        </div>
      )}
    </section>
  );
}
