/*
 * TODAY'S LIVE ATTENDANCE (LiveClassMonitor.jsx's Attendance toggle), moved
 * out of the live monitor verbatim: drawn only while the toggle is on, so it
 * arrives then, or before with the workspace's idle prefetch
 * (app/teacher/teacherPanels.js, teacher's first load).
 */
import { STUDENT_NAME_UNAVAILABLE, formatStudentName } from '../../platform/studentName';
import { LIVE_ATTENDANCE_MARK, attendanceIsAbsent, normalizeLiveAttendance } from '../../platform/teacher/liveAttendance.js';
import { smallButtonStyle } from './liveMonitorStyles.js';

const ATTENDANCE_LABEL = {
  [LIVE_ATTENDANCE_MARK.PRESENT]: 'Present',
  [LIVE_ATTENDANCE_MARK.LATE]: 'Late',
  [LIVE_ATTENDANCE_MARK.ABSENT]: 'Absent',
  excused: 'Absent',
  unexcused: 'Absent',
};

export default function AttendancePanel({ roster, attendanceByStudentId, onMark, busyStudentId = null }) {
  // Named students by name, then any with no name on file (by id). The id is
  // always the secondary line here, never the name.
  const sorted = roster
    .map((student) => ({
      student,
      id: String(student?.id || student?.studentId || ''),
      name: formatStudentName(student, { lastFirst: false, fallbackToNeutral: false }),
    }))
    .sort((a, b) => Number(!a.name) - Number(!b.name) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return (
    <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)' }}>
      <div style={{ fontWeight: 900, color: 'var(--mm-text-strong)' }}>Today&apos;s Live Attendance</div>
      <div style={{ marginTop: 3, marginBottom: 10, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
        Absent students are removed from live monitoring for today only. Mark Present or Late if a student arrives; their saved assignment work is never changed.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 7 }}>
        {sorted.map(({ student, id, name: resolvedName }) => {
          const name = resolvedName || STUDENT_NAME_UNAVAILABLE;
          const mark = normalizeLiveAttendance(attendanceByStudentId[id]).mark || LIVE_ATTENDANCE_MARK.PRESENT;
          const busy = busyStudentId === id;
          return (
            <div key={id} style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 9, padding: '8px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 'calc(12.5 * var(--mm-px))' }}>{name}</strong>
                {id && <div style={{ marginTop: 1, fontSize: 'calc(10 * var(--mm-px))', color: 'var(--mm-text-subtle)' }}>ID {id}</div>}
                <div style={{ fontSize: 'calc(10.5 * var(--mm-px))', color: attendanceIsAbsent(mark) ? 'var(--mm-error-text)' : mark === LIVE_ATTENDANCE_MARK.LATE ? 'var(--mm-warning-text)' : 'var(--mm-success-text)', fontWeight: 900 }}>{ATTENDANCE_LABEL[mark] || 'Present'}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  [LIVE_ATTENDANCE_MARK.PRESENT, 'Present'],
                  [LIVE_ATTENDANCE_MARK.LATE, 'Late'],
                  [LIVE_ATTENDANCE_MARK.ABSENT, 'Absent'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    onClick={() => onMark(student, value)}
                    aria-pressed={mark === value || (value === LIVE_ATTENDANCE_MARK.ABSENT && attendanceIsAbsent(mark))}
                    style={{ ...smallButtonStyle, padding: '4px 6px', background: mark === value || (value === LIVE_ATTENDANCE_MARK.ABSENT && attendanceIsAbsent(mark)) ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', borderColor: mark === value || (value === LIVE_ATTENDANCE_MARK.ABSENT && attendanceIsAbsent(mark)) ? '#1a73e8' : 'var(--mm-border)', opacity: busy ? 0.55 : 1 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
