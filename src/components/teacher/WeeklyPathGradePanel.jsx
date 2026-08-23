import { useMemo } from 'react';
import {
  SYNC_STATE, prepareClassroomSync, syncReadiness, weeklyPathGradebookRows,
} from '../../platform/path/weeklyPathGradebook.js';
import StudentNameLink from '../common/StudentNameLink.jsx';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';

/*
 * THE WEEKLY PATH GRADE, IN THE GRADEBOOK, KEPT SEPARATE FROM MASTERY.
 *
 * It sits beside assignment grades because it IS a grade — but it is a grade
 * about a different thing, and the panel says so rather than letting a teacher
 * assume the two columns mean the same. An assignment score answers "how did
 * they do on this work". This answers "did they do the week's practice, and how
 * well". The academic badge is the third column precisely so that all three can
 * disagree in front of the teacher without any of them being adjusted to match.
 *
 * The publish control is a REVIEW step, never a send. See the note at the top of
 * weeklyPathGradebook.js: this platform does not put a number in a parent's app
 * because a background job noticed a week had ended.
 */

const STATE_TONE = {
  [SYNC_STATE.READY_FOR_REVIEW]: { bg: '#eefaf1', fg: '#12633a', border: '#c3e8d1' },
  [SYNC_STATE.NOT_READY]: { bg: '#f8f9fa', fg: '#5f6368', border: '#e8eaed' },
  [SYNC_STATE.BLOCKED]: { bg: '#fdf1ec', fg: '#9a3412', border: '#f6d4c4' },
};

export default function WeeklyPathGradePanel({
  students = [],
  goalsByStudentId = {},
  completionsByStudentId = {},
  learningProfilesByStudentId = {},
  weekKey = null,
  classId = null,
  classroomLinked = false,
  progressTruncated = false,
  weekComplete = false,
  onOpenStudent = null,
  onReviewClassroomSync = null,
  now = Date.now(),
}) {
  const rows = useMemo(() => weeklyPathGradebookRows({
    students, goalsByStudentId, completionsByStudentId, learningProfilesByStudentId, now,
  }), [students, goalsByStudentId, completionsByStudentId, learningProfilesByStudentId, now]);

  const readiness = useMemo(
    () => syncReadiness({ rows, weekComplete, progressTruncated, classroomLinked }),
    [rows, weekComplete, progressTruncated, classroomLinked],
  );

  const graded = rows.filter((row) => row.goal > 0);
  const tone = STATE_TONE[readiness.state];

  if (!students.length) return null;

  return (
    <section style={{ border: '1px solid #d8dde6', borderRadius: 10, background: '#fff', marginBottom: 22, overflow: 'hidden' }}>
      <header style={{ padding: '15px 18px 12px', borderBottom: '1px solid #eef0f2' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Weekly learning path{weekKey ? ` · week of ${weekKey}` : ''}</h3>
        <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.5, maxWidth: '70ch' }}>
          A separate grade from assignment work: 80% for completing the week&apos;s assigned sessions, 20% for how
          they went. A student who completes every session scores at least 80%, whatever the quality — this grade
          is about doing the practice, and it must not punish a student for finding it hard.
        </p>
      </header>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
              <th style={{ padding: 11 }}>Student</th>
              <th style={{ padding: 11, textAlign: 'right' }}>Sessions</th>
              <th style={{ padding: 11, textAlign: 'right' }}>Path grade</th>
              {/* Third column on purpose. All three can disagree. */}
              <th style={{ padding: 11 }}>Academic profile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentId} style={{ borderTop: '1px solid #eef0f2' }}>
                <td style={{ padding: 11 }}>
                  <StudentNameLink
                    studentId={row.studentId}
                    studentName={row.studentName}
                    profile={learningProfilesByStudentId[row.studentId]}
                    onOpen={onOpenStudent}
                  />
                </td>
                <td style={{ padding: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {row.goal > 0 ? `${row.complete} / ${row.goal}` : '—'}
                  {row.overdue && <span style={{ marginLeft: 6, color: '#9a3412', fontWeight: 800, fontSize: 11 }}>OVERDUE</span>}
                </td>
                <td style={{ padding: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 900, color: row.goal > 0 ? (row.passing ? '#12633a' : '#9a3412') : '#5f6368' }}>
                  {row.goal > 0 ? `${Math.round(row.grade)}%` : 'No goal yet'}
                </td>
                <td style={{ padding: 11 }}>
                  <StudentPerformanceBadge
                    profile={learningProfilesByStudentId[row.studentId]}
                    size="small"
                    studentName={row.studentName}
                    onClick={onOpenStudent ? () => onOpenStudent(row.studentId) : null}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 18px', borderTop: '1px solid #eef0f2', background: tone.bg }}>
        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: '#fff', color: tone.fg, border: `1px solid ${tone.border}` }}>
          GOOGLE CLASSROOM
        </span>
        <span style={{ flex: 1, minWidth: 220, color: tone.fg, fontSize: 12.5, lineHeight: 1.45 }}>{readiness.reason}</span>
        <button
          type="button"
          disabled={readiness.state !== SYNC_STATE.READY_FOR_REVIEW || !onReviewClassroomSync}
          onClick={() => onReviewClassroomSync?.(prepareClassroomSync({
            classId, weekKey, rows: graded, weekComplete, progressTruncated, classroomLinked,
          }))}
          style={{
            padding: '8px 13px',
            border: `1px solid ${readiness.state === SYNC_STATE.READY_FOR_REVIEW ? '#1a73e8' : '#dadce0'}`,
            borderRadius: 8,
            background: '#fff',
            color: readiness.state === SYNC_STATE.READY_FOR_REVIEW ? '#174ea6' : '#9aa0a6',
            fontWeight: 900,
            fontSize: 12.5,
            cursor: readiness.state === SYNC_STATE.READY_FOR_REVIEW && onReviewClassroomSync ? 'pointer' : 'not-allowed',
          }}
        >
          Review before publishing
        </button>
      </div>
    </section>
  );
}
