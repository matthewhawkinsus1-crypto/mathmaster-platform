import { formatDateTime, getAssignmentLifecycle } from '../../assignmentLifecycle.js';
import { groupAssignmentsByGradingPeriod } from '../../platform/student/gradingPeriods.js';
import { PROGRESS_STATE, studentAssignmentProgress } from '../../platform/teacher/assignmentProgress.js';
import { groupAssignmentList } from '../../platform/teacher/assignmentListGroups.js';
import './teacherWorkspace.css';

/*
 * STUDENT -> ASSIGNMENT -> WORK.
 *
 * One student's assignments with where they stand on each, from their full
 * grade record and the canonical grade projection (the same numbers the
 * gradebook uses). Each title opens the assignment's hub; "Work" opens this
 * student's responses in the gradebook.
 *
 * Shared by the Students page and the student drawer that opens from Live
 * view, the Assignment Hub and the gradebook, so a student's assignments look
 * the same wherever their name was clicked. Current marking period first, in
 * the Assignments tab's order (open work due soonest, then closed, most recent
 * first); earlier marking periods folded, never hidden.
 */

const statusOf = (progress) => {
  if (progress.state === PROGRESS_STATE.NOT_STARTED) return { label: 'Not started', tone: 'warning' };
  if (progress.state === PROGRESS_STATE.COMPLETE) return { label: `Complete${progress.score === null ? '' : ` · ${progress.score}%`}`, tone: 'success' };
  return { label: `In progress · ${progress.attempted}/${progress.total} answered${progress.score === null ? '' : ` · ${progress.score}%`}`, tone: 'neutral' };
};

export default function StudentAssignmentsList({
  student,
  assignments = [],
  gradingPeriodSettings = null,
  nowValue = Date.now(),
  onOpenAssignment = null,
  onOpenStudentWork = null,
  emptyText = 'No assignments are assigned to this student’s class yet.',
  // Assignments where this student used a Practice Pass (Practice excused).
  excusedAssignmentIds = null,
}) {
  if (!student) return null;
  if (!assignments.length) return <p className="tw-small tw-muted" style={{ margin: 0 }}>{emptyText}</p>;
  // A roster summary has no grade record yet (the drawer fetches it).
  const gradesKnown = student.gradesByAssignment !== undefined;
  const classId = student.classId || null;

  return (
    <div className="tw-stack" style={{ gap: 10 }}>
      {groupAssignmentsByGradingPeriod(assignments, gradingPeriodSettings || {}).map((group) => {
        const ordered = groupAssignmentList({ assignments: group.assignments, nowValue, gradingPeriodSettings, flat: true })[0]?.assignments || [];
        const list = (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {ordered.map((assignment) => {
              const progress = gradesKnown
                ? studentAssignmentProgress({ student, assignment, practicePassRedeemed: Boolean(excusedAssignmentIds?.has(assignment.id)) })
                : null;
              const status = progress ? statusOf(progress) : { label: 'Loading…', tone: 'neutral' };
              const lifecycle = getAssignmentLifecycle(assignment, nowValue);
              return (
                <li key={assignment.id} className="tw-row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--mm-border)', borderRadius: 9 }}>
                  <span style={{ minWidth: 0 }}>
                    {onOpenAssignment
                      ? <button type="button" className="tw-link" onClick={() => onOpenAssignment(assignment.id, classId)}>{assignment.title}</button>
                      : <strong>{assignment.title}</strong>}
                    <span className="tw-small tw-muted" style={{ display: 'block' }}>
                      {lifecycle.isScheduled ? 'Opens' : lifecycle.isClosed ? 'Closed · was due' : 'Due'} {formatDateTime(assignment.dueAt || assignment.dueDate)}
                    </span>
                  </span>
                  <span className="tw-row" style={{ gap: 6 }}>
                    <span className="tw-pill" data-tone={status.tone}>{status.label}</span>
                    {progress?.practicePassExcused && <span className="tw-pill" data-tone="neutral" title="The student used a Practice Pass. Practice is excused: not scored, not required.">Practice excused · Pass</span>}
                    {onOpenStudentWork && (!progress || progress.state !== PROGRESS_STATE.NOT_STARTED) && (
                      <button type="button" className="tw-btn tw-btn--sm" onClick={() => onOpenStudentWork(classId, assignment.id, student.id)}>Work</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        );
        return group.period.isCurrent ? (
          <div key={group.period.id}>
            <div className="tw-small tw-muted" style={{ fontWeight: 900, marginBottom: 6 }}>{group.period.label}</div>
            {list}
          </div>
        ) : (
          <details key={group.period.id} className="tw-disclosure">
            <summary>{group.period.label} <span className="tw-pill">{group.assignments.length}</span></summary>
            <div className="tw-disclosure__body">{list}</div>
          </details>
        );
      })}
    </div>
  );
}
