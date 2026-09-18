import { useMemo, useState } from 'react';
import { buildTeacherActionItems, resolveTeacherActionState, TEACHER_ACTION_KIND } from '../../platform/teacher/teacherActionCenter.js';
import { resolveReturnCheckIns } from '../../platform/attendance/returnCheckIn.js';
import { localDateKeyOf } from '../../platform/attendance/classMeetings.js';

const kindLabels = {
  [TEACHER_ACTION_KIND.PARENT_FOLLOW_UP]: 'Parent follow-up',
  [TEACHER_ACTION_KIND.RETURN_FROM_ABSENCE]: 'Returned after absence',
  [TEACHER_ACTION_KIND.EXTENSION_RECONCILIATION]: 'Extension / reopen',
  [TEACHER_ACTION_KIND.GRADE_UPLOAD]: 'Grade export / upload',
  [TEACHER_ACTION_KIND.RETEST_RECOVERY]: 'Retest / recovery',
};
const button = { padding: '7px 10px', border: '1px solid #bdc1c6', borderRadius: 7, background: '#fff', fontWeight: 800, cursor: 'pointer' };

export default function TeacherActionCenter({ students = [], classes = [], assignments = [], supportEvents = [], parentContacts = [], gradeTransferUnits = [], retestRecoveryActions = [], classSchedule = null, nonInstructionalKeys = null, nowValue = Date.now(), onResolveReturnCheckIn, onOpenWorkflow }) {
  const [classId, setClassId] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('open');
  const returnCheckIns = useMemo(() => classes.flatMap((classRecord) => resolveReturnCheckIns({
    roster: students.filter((student) => student.classId === (classRecord.classId || classRecord.id)), supportEvents, assignments,
    classId: classRecord.classId || classRecord.id, classPeriod: classRecord.period || classRecord.classPeriod,
    schedule: classSchedule, nonInstructionalKeys, todayDateKey: localDateKeyOf(nowValue),
  })), [classes, students, supportEvents, assignments, classSchedule, nonInstructionalKeys, nowValue]);
  const items = useMemo(() => buildTeacherActionItems({ students, classes, supportEvents, parentContacts, returnCheckIns, gradeTransferUnits, retestRecoveryActions, now: nowValue }), [students, classes, supportEvents, parentContacts, returnCheckIns, gradeTransferUnits, retestRecoveryActions, nowValue]);
  const visible = resolveTeacherActionState(items, { classId, kind, status });

  return <section aria-labelledby="teacher-action-heading" style={{ padding: 22 }}>
    <h2 id="teacher-action-heading" style={{ margin: 0 }}>Action Center</h2>
    <p style={{ color: '#5f6368' }}>What needs attention across your classes. Each row links back to its authoritative workflow.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
      <label>Class <select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">All classes</option>{classes.map((record) => <option key={record.classId || record.id} value={record.classId || record.id}>{record.name || record.period || record.classId}</option>)}</select></label>
      <label>Action type <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">All action types</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Open</option><option value="completed">Completed</option></select></label>
    </div>
    {!visible.length ? <p>No {status} actions match these filters.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th>Student</th><th>Class / period</th><th>Reason</th><th>Date / due</th><th>Status</th><th>Authoritative workflow</th></tr></thead>
      <tbody>{visible.map((item) => <tr key={item.id} style={{ borderTop: '1px solid #dadce0' }}>
        <td style={{ padding: 10 }}><strong>{item.studentName || 'Class-wide'}</strong></td><td>{item.classLabel || '—'}</td>
        <td><strong>{item.title}</strong><div style={{ color: '#5f6368', fontSize: 12 }}>{item.summary}</div>{item.context?.map((entry) => <div key={entry} style={{ fontSize: 12, color: '#b06000' }}>{entry}</div>)}</td>
        <td>{item.dueAt || item.createdAt ? new Date(item.dueAt || item.createdAt).toLocaleDateString() : '—'}</td><td>{item.status}</td>
        <td style={{ padding: 8 }}><button type="button" style={button} onClick={() => onOpenWorkflow?.(item)}>{item.kind === TEACHER_ACTION_KIND.GRADE_UPLOAD ? 'Open Grade Transfer' : item.kind === TEACHER_ACTION_KIND.RETURN_FROM_ABSENCE || item.kind === TEACHER_ACTION_KIND.EXTENSION_RECONCILIATION ? 'Open Attendance' : item.kind === TEACHER_ACTION_KIND.RETEST_RECOVERY ? 'Open retest workflow' : 'Open Parent Contacts'}</button>{item.availableActions.includes('resolveReturnCheckIn') && <button type="button" style={{ ...button, marginLeft: 6, background: '#e6f4ea' }} onClick={() => onResolveReturnCheckIn?.(returnCheckIns.find((candidate) => candidate.key === item.sourceId))}>Resolve check-in</button>}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
