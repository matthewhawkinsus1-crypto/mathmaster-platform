import { useMemo, useState } from 'react';
import { formatStudentName } from '../../platform/studentName';
import { studentsInClass } from '../../../functions/shared/classModel.mjs';
import { classifySchoolDay, localDateKeyOf, MEETING_STATUS } from '../../platform/attendance/classMeetings.js';
import {
  ATTENDANCE_HISTORY_MARK,
  buildAttendanceHistoryEvent,
  effectiveAttendanceForClassDay,
  effectiveAttendanceForStudentDay,
} from '../../platform/attendance/attendanceHistory.js';

const MARK_OPTIONS = [
  { value: ATTENDANCE_HISTORY_MARK.PRESENT, label: 'Present' },
  { value: ATTENDANCE_HISTORY_MARK.LATE, label: 'Late' },
  { value: ATTENDANCE_HISTORY_MARK.EXCUSED, label: 'Excused' },
  { value: ATTENDANCE_HISTORY_MARK.UNEXCUSED, label: 'Unexcused' },
];

const MARK_STYLE = {
  [ATTENDANCE_HISTORY_MARK.PRESENT]: { color: '#137333', background: '#e6f4ea' },
  [ATTENDANCE_HISTORY_MARK.LATE]: { color: '#7a4f00', background: '#fff4ce' },
  [ATTENDANCE_HISTORY_MARK.EXCUSED]: { color: '#174ea6', background: '#e8f0fe' },
  [ATTENDANCE_HISTORY_MARK.UNEXCUSED]: { color: '#b3261e', background: '#fff5f4' },
};

const rowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 11px', border: '1px solid #e0e3e7', borderRadius: 9, background: '#fff' };
const controlStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #dadce0', background: '#fff', fontSize: 13 };
const smallButtonStyle = { padding: '5px 8px', borderRadius: 7, border: '1px solid #9aa0a6', background: '#fff', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' };

const markLabel = (mark) => MARK_OPTIONS.find((option) => option.value === mark)?.label || 'Not marked';

function AuditTrail({ events }) {
  if (!events.length) return <div style={{ fontSize: 11.5, color: '#80868b' }}>No prior corrections.</div>;
  return (
    <div style={{ display: 'grid', gap: 4, marginTop: 6, paddingTop: 6, borderTop: '1px dashed #dadce0' }}>
      {events.map((entry, index) => (
        <div key={index} style={{ fontSize: 11, color: '#5f6368' }}>
          {markLabel(entry.mark)}
          {entry.reason ? ` — ${entry.reason}` : ''}
          {entry.markSource === 'liveQuickMark' ? ' (Live Classroom quick mark)' : ' (history correction)'}
        </div>
      ))}
    </div>
  );
}

/**
 * Teacher-facing Attendance History: pick a class and an instructional date,
 * see and correct every student's effective mark, and review the audit trail
 * behind it. Every correction is an ADDITIVE `attendanceHistory` event — the
 * prior mark is never edited or deleted, only superseded (see
 * src/platform/attendance/attendanceHistory.js).
 */
export default function AttendanceHistoryPanel({
  classes = [],
  allStudents = [],
  supportEvents = [],
  classSchedule = null,
  nonInstructionalKeys = null,
  teacherEmail = '',
  nowValue = Date.now(),
  onRecordCorrection = null,
  initialClassId = null,
}) {
  const activeClasses = classes.filter((entry) => entry?.status !== 'archived' && entry?.classId);
  const [classId, setClassId] = useState(initialClassId || activeClasses[0]?.classId || '');
  const [dateKey, setDateKey] = useState(localDateKeyOf(nowValue) || '');
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [reasonByStudentId, setReasonByStudentId] = useState({});
  const [busyStudentId, setBusyStudentId] = useState(null);

  const selectedClass = activeClasses.find((entry) => entry.classId === classId) || null;
  const classPeriod = selectedClass?.period || null;

  const roster = useMemo(() => (
    classId ? studentsInClass({ students: allStudents, classes, classId }) : []
  ), [allStudents, classes, classId]);

  const dayMeets = useMemo(() => (
    classPeriod && dateKey
      ? classifySchoolDay({ schedule: classSchedule, classPeriod, dateKey, nonInstructionalKeys }).status === MEETING_STATUS.MEETS
      : false
  ), [classSchedule, classPeriod, dateKey, nonInstructionalKeys]);

  const effectiveByStudentId = useMemo(() => effectiveAttendanceForClassDay({
    supportEvents, classId, dateKey,
  }), [supportEvents, classId, dateKey]);

  const sortedRoster = useMemo(() => [...roster].sort((a, b) => (
    formatStudentName(a, { lastFirst: false, fallbackToId: false }).localeCompare(
      formatStudentName(b, { lastFirst: false, fallbackToId: false }),
    )
  )), [roster]);

  const submitCorrection = async (student, mark) => {
    if (!onRecordCorrection) return;
    const id = String(student?.id || student?.studentId || '');
    if (!id) return;
    const current = effectiveByStudentId[id] || null;
    setBusyStudentId(id);
    try {
      await onRecordCorrection(buildAttendanceHistoryEvent({
        student,
        mark,
        classId,
        classPeriod,
        dateKey,
        reason: reasonByStudentId[id] || '',
        actorEmail: teacherEmail,
        nowValue,
        priorMark: current?.mark || null,
        priorMarkSource: current?.markSource || null,
      }));
      setReasonByStudentId((state) => ({ ...state, [id]: '' }));
    } catch (error) {
      console.error('Could not save the attendance correction:', error);
    } finally {
      setBusyStudentId(null);
    }
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Attendance History</h2>
      <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: 13 }}>
        Correct a past attendance mark for one class and date. The newest correction is what counts; every prior mark stays in the record below it.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 900, color: '#5f6368' }}>
          Class
          <select value={classId} onChange={(event) => setClassId(event.target.value)} style={controlStyle} aria-label="Class">
            <option value="">Select a class…</option>
            {activeClasses.map((entry) => <option key={entry.classId} value={entry.classId}>{entry.name || entry.period}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 11.5, fontWeight: 900, color: '#5f6368' }}>
          Instructional date
          <input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} style={controlStyle} aria-label="Instructional date" />
        </label>
      </div>

      {!classId || !dateKey ? (
        <div style={{ padding: 18, border: '1px dashed #dadce0', borderRadius: 12, color: '#5f6368' }}>Choose a class and a date to review attendance.</div>
      ) : !dayMeets ? (
        <div style={{ padding: 18, border: '1px dashed #dadce0', borderRadius: 12, color: '#5f6368' }}>This class did not meet on {dateKey}.</div>
      ) : sortedRoster.length === 0 ? (
        <div style={{ padding: 18, border: '1px dashed #dadce0', borderRadius: 12, color: '#5f6368' }}>No students found in this class.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sortedRoster.map((student) => {
            const id = String(student?.id || student?.studentId || '');
            const name = formatStudentName(student, { lastFirst: false, fallbackToId: false }) || 'Student';
            const effective = effectiveByStudentId[id] || null;
            const style = effective ? MARK_STYLE[effective.mark] || {} : { color: '#80868b', background: '#f1f3f4' };
            const expanded = expandedStudentId === id;
            const trail = expanded
              ? effectiveAttendanceForStudentDay({ supportEvents, studentId: id, classId, dateKey }).priorEvents
              : [];

            return (
              <div key={id} style={rowStyle}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</strong>
                    {id && <span style={{ fontSize: 10, color: '#80868b' }}>ID {id}</span>}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 999, ...style }}>
                      {effective ? markLabel(effective.mark) : 'Not marked'}
                      {effective && !effective.classified ? ' (unclassified)' : ''}
                    </span>
                    <button type="button" onClick={() => setExpandedStudentId(expanded ? null : id)} style={{ ...smallButtonStyle, border: 'none', background: 'none', color: '#1a73e8', textDecoration: 'underline' }}>
                      {expanded ? 'Hide history' : 'Show history'}
                    </button>
                  </div>
                  {expanded && <AuditTrail events={trail} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={reasonByStudentId[id] || ''}
                    onChange={(event) => setReasonByStudentId((state) => ({ ...state, [id]: event.target.value }))}
                    style={{ ...controlStyle, width: 150 }}
                  />
                  {MARK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={busyStudentId === id}
                      onClick={() => submitCorrection(student, option.value)}
                      aria-pressed={effective?.mark === option.value}
                      style={{ ...smallButtonStyle, background: effective?.mark === option.value ? '#e8f0fe' : '#fff', borderColor: effective?.mark === option.value ? '#1a73e8' : '#dadce0' }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
