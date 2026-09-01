import { useMemo } from 'react';
import { summarizeLiveClass } from '../../livePresence.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_LABEL,
  SUPPORT_EVENT_STAGE,
  buildIntegrityReviewSignal,
  buildParentFollowUpCandidates,
  buildSuggestedSmallGroups,
  buildWatchPracticeList,
} from '../../platform/teacher/studentSupportSignals.js';

const cardStyle = {
  border: '1px solid #d8dde6',
  borderRadius: 10,
  background: '#fff',
  padding: '12px 13px',
};

const actionButton = {
  minHeight: 34,
  padding: '6px 9px',
  border: '1px solid #c9ced6',
  borderRadius: 7,
  background: '#fff',
  fontWeight: 800,
  fontSize: 11.5,
  cursor: 'pointer',
};

const fmt = (value) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function StudentSupportDashboard({
  students = [],
  profilesByStudentId = {},
  needsAttention = [],
  supportEvents = [],
  classId = null,
  classPeriod = null,
  nowValue = Date.now(),
  onOpenStudent = null,
  onRecordEvent = null,
}) {
  const { rows } = useMemo(
    () => summarizeLiveClass(students, { nowValue }),
    [students, nowValue],
  );

  const classEvents = useMemo(() => supportEvents.filter((event) => (
    classId ? event.classId === classId : classPeriod ? event.classPeriod === classPeriod : true
  )), [supportEvents, classId, classPeriod]);

  const classAlerts = useMemo(() => needsAttention.filter((alert) => (
    !classId || !alert.classId || alert.classId === classId
  )), [needsAttention, classId]);

  const watchList = useMemo(() => buildWatchPracticeList({
    rows,
    profilesByStudentId,
    supportEvents: classEvents,
    nowValue,
    maxStudents: 6,
  }), [rows, profilesByStudentId, classEvents, nowValue]);

  const groups = useMemo(
    () => buildSuggestedSmallGroups({ needsAttention: classAlerts, maxGroups: 4 }),
    [classAlerts],
  );

  const parents = useMemo(() => buildParentFollowUpCandidates({
    needsAttention: classAlerts,
    supportEvents: classEvents,
    nowValue,
  }), [classAlerts, classEvents, nowValue]);

  const integrity = useMemo(() => rows
    .map((row) => ({
      row,
      signal: buildIntegrityReviewSignal({
        row,
        profile: profilesByStudentId[row.id] || null,
      }),
    }))
    .filter((entry) => entry.signal), [rows, profilesByStudentId]);

  const recent = classEvents.slice(0, 8);

  const record = (event) => onRecordEvent?.({
    classId,
    classPeriod,
    source: event.source || 'supportDashboard',
    ...event,
  });

  const saveGroup = async (group) => {
    if (!onRecordEvent) return;
    await Promise.all(group.students.map((student) => record({
      kind: SUPPORT_EVENT_KIND.SMALL_GROUP,
      stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
      studentId: student.studentId,
      studentName: student.studentName,
      summary: `Teacher saved suggested small group: ${group.label}.`,
      evidence: { rule: group.rule, groupSize: group.students.length },
    })));
  };

  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Student Support & Intervention</h2>
        <span style={{ color: '#5f6368', fontSize: 12.5 }}>
          System signals stay separate from teacher-confirmed concerns and actions.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 900 }}>Watch Practice</div>
          <div style={{ color: '#5f6368', fontSize: 11.5, margin: '3px 0 8px' }}>Short list for students worth watching live during independent work.</div>
          {watchList.length ? watchList.map((entry) => (
            <div key={entry.studentId} style={{ borderTop: '1px solid #eef0f2', padding: '8px 0' }}>
              <button type="button" onClick={() => onOpenStudent?.(entry.studentId)} style={{ border: 0, padding: 0, background: 'transparent', fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}>
                {entry.studentName}
              </button>
              <div style={{ fontSize: 11.5, color: '#5f6368', marginTop: 2 }}>{entry.reasons.join(' · ')}</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" style={actionButton} onClick={() => record({
                  kind: SUPPORT_EVENT_KIND.TEACHER_INTERVENTION,
                  stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
                  studentId: entry.studentId,
                  studentName: entry.studentName,
                  assignmentId: entry.row.live?.assignmentId || null,
                  assignmentTitle: entry.row.live?.assignmentTitle || null,
                  summary: 'Teacher completed a live check-in during Watch Practice.',
                  evidence: { reasons: entry.reasons, flags: entry.row.flags },
                })}>Check-in done</button>
                <button type="button" style={actionButton} onClick={() => record({
                  kind: SUPPORT_EVENT_KIND.RESOLVED,
                  stage: SUPPORT_EVENT_STAGE.RESOLVED,
                  studentId: entry.studentId,
                  studentName: entry.studentName,
                  summary: 'Teacher observed the student during Practice and marked the watch concern resolved.',
                  evidence: { reasons: entry.reasons },
                })}>Observed — okay</button>
              </div>
            </div>
          )) : <div style={{ color: '#80868b', fontSize: 12 }}>No watch list right now.</div>}
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900 }}>Suggested Small Groups</div>
          <div style={{ color: '#5f6368', fontSize: 11.5, margin: '3px 0 8px' }}>Built from established academic patterns, never from off-task behavior.</div>
          {groups.length ? groups.map((group) => (
            <div key={group.key} style={{ borderTop: '1px solid #eef0f2', padding: '8px 0' }}>
              <div style={{ fontWeight: 800 }}>{group.label}</div>
              <div style={{ fontSize: 11.5, color: '#5f6368', marginTop: 2 }}>{group.students.length} students</div>
              <div style={{ fontSize: 11.5, color: '#3c4043', marginTop: 3 }}>
                {group.students.slice(0, 5).map((student) => student.studentName).join(', ')}
                {group.students.length > 5 ? ` +${group.students.length - 5} more` : ''}
              </div>
              <button type="button" style={{ ...actionButton, marginTop: 6 }} onClick={() => saveGroup(group)}>Save group</button>
            </div>
          )) : <div style={{ color: '#80868b', fontSize: 12 }}>No repeated academic pattern is large enough for a suggested group.</div>}
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900 }}>Parent Follow-Up</div>
          <div style={{ color: '#5f6368', fontSize: 11.5, margin: '3px 0 8px' }}>Requires repeated teacher-confirmed productivity concerns; one idle period is never enough.</div>
          {parents.length ? parents.map((entry) => (
            <div key={entry.studentId} style={{ borderTop: '1px solid #eef0f2', padding: '8px 0' }}>
              <button type="button" onClick={() => onOpenStudent?.(entry.studentId)} style={{ border: 0, padding: 0, background: 'transparent', fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}>{entry.studentName}</button>
              <div style={{ fontSize: 11.5, color: '#5f6368', marginTop: 2 }}>
                {entry.confirmedProductivityDays.length} confirmed day{entry.confirmedProductivityDays.length === 1 ? '' : 's'}
                {entry.completionSignals.length ? ` · ${entry.completionSignals.length} completion signal${entry.completionSignals.length === 1 ? '' : 's'}` : ''}
              </div>
              <button type="button" style={{ ...actionButton, marginTop: 6 }} onClick={() => record({
                kind: SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP,
                stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
                studentId: entry.studentId,
                studentName: entry.studentName,
                summary: 'Teacher marked parent/guardian contact completed after reviewing repeated productivity concerns.',
                evidence: {
                  confirmedProductivityDays: entry.confirmedProductivityDays,
                  completionSignals: entry.completionSignals,
                },
              })}>Mark contacted</button>
            </div>
          )) : <div style={{ color: '#80868b', fontSize: 12 }}>No student currently meets the repeated-evidence threshold.</div>}
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900 }}>Integrity Review</div>
          <div style={{ color: '#5f6368', fontSize: 11.5, margin: '3px 0 8px' }}>Unusual response patterns only. MathMaster never labels a student as cheating.</div>
          {integrity.length ? integrity.map(({ row, signal }) => (
            <div key={row.id} style={{ borderTop: '1px solid #eef0f2', padding: '8px 0' }}>
              <button type="button" onClick={() => onOpenStudent?.(row.id)} style={{ border: 0, padding: 0, background: 'transparent', fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}>{row.name}</button>
              <div style={{ fontSize: 11.5, color: '#6b4c00', marginTop: 3 }}>{signal.reasons.join(' · ')}</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" style={actionButton} onClick={() => record({
                  kind: SUPPORT_EVENT_KIND.INTEGRITY_REVIEW,
                  stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
                  studentId: row.id,
                  studentName: row.name,
                  assignmentId: row.live?.assignmentId || null,
                  assignmentTitle: row.live?.assignmentTitle || null,
                  sessionKey: row.live?.assignmentId && row.live?.startedAt ? `${row.live.assignmentId}:${row.live.startedAt}` : null,
                  confidence: signal.confidence,
                  summary: 'Teacher marked an unusual response pattern for review. This is not a cheating finding.',
                  evidence: signal.evidence,
                })}>Log for review</button>
                <button type="button" style={actionButton} onClick={() => record({
                  kind: SUPPORT_EVENT_KIND.SIGNAL_DISMISSED,
                  stage: SUPPORT_EVENT_STAGE.DISMISSED,
                  studentId: row.id,
                  studentName: row.name,
                  assignmentId: row.live?.assignmentId || null,
                  assignmentTitle: row.live?.assignmentTitle || null,
                  summary: 'Teacher reviewed and dismissed the unusual-response signal.',
                  evidence: signal.evidence,
                })}>Dismiss</button>
              </div>
            </div>
          )) : <div style={{ color: '#80868b', fontSize: 12 }}>No unusual response pattern meets the review threshold.</div>}
        </div>
      </div>

      <details style={{ marginTop: 10, border: '1px solid #d8dde6', borderRadius: 10, background: '#fff', padding: '10px 12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Recent support history ({recent.length})</summary>
        <div style={{ marginTop: 8, display: 'grid', gap: 7 }}>
          {recent.length ? recent.map((event) => (
            <div key={event.id} style={{ padding: '8px 9px', borderRadius: 8, background: '#f8f9fa' }}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <strong>{event.studentName || event.studentId}</strong>
                <span style={{ fontSize: 11, color: '#80868b' }}>{fmt(event.createdAt)}</span>
              </div>
              <div style={{ marginTop: 2, fontSize: 11.5 }}>
                <strong>{SUPPORT_EVENT_LABEL[event.kind] || event.kind}</strong> · {event.stage}
              </div>
              {event.summary && <div style={{ marginTop: 2, fontSize: 11.5, color: '#5f6368' }}>{event.summary}</div>}
            </div>
          )) : <div style={{ color: '#80868b', fontSize: 12 }}>No stored support events for this class yet.</div>}
        </div>
      </details>
    </section>
  );
}
