import { useMemo, useState } from 'react';
import { summarizeLiveClass } from '../../livePresence.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_LABEL,
  SUPPORT_EVENT_STAGE,
  SUPPORT_STAGE_LABEL,
  buildArchivedIntegrityReviewSignal,
  buildIntegrityReviewSignal,
  buildParentFollowUpCandidates,
  buildSuggestedSmallGroups,
  buildWatchPracticeList,
  hasDismissedSignal,
  sessionProductivitySignal,
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
  sessionSummaries = [],
  classId = null,
  classPeriod = null,
  nowValue = Date.now(),
  onOpenStudent = null,
  onRecordEvent = null,
}) {
  const [noteStudentId, setNoteStudentId] = useState('');
  const [noteKind, setNoteKind] = useState(SUPPORT_EVENT_KIND.TEACHER_INTERVENTION);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const { rows } = useMemo(
    () => summarizeLiveClass(students, { nowValue }),
    [students, nowValue],
  );

  const classEvents = useMemo(() => supportEvents.filter((event) => (
    classId ? event.classId === classId : classPeriod ? event.classPeriod === classPeriod : true
  )), [supportEvents, classId, classPeriod]);

  const classSessions = useMemo(() => sessionSummaries.filter((summary) => (
    classId ? summary.classId === classId : classPeriod ? summary.classPeriod === classPeriod : true
  )), [sessionSummaries, classId, classPeriod]);

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
    sessionSummaries: classSessions,
    nowValue,
  }), [classAlerts, classEvents, classSessions, nowValue]);

  const productivityReviews = useMemo(() => classSessions
    .map((summary) => ({
      summary,
      signal: sessionProductivitySignal(summary, { peerSummaries: classSessions }),
    }))
    .filter((entry) => entry.signal)
    .filter((entry) => {
      const endedAt = Number(entry.summary.endedAt) || 0;
      if (!(endedAt > 0 && nowValue - endedAt <= 7 * 86400000)) return false;
      return !hasDismissedSignal({
        supportEvents: classEvents,
        studentId: entry.summary.studentId,
        assignmentId: entry.summary.assignmentId || null,
        sessionKey: entry.summary.sessionKey || null,
        afterMs: Number(entry.summary.startedAt) || 0,
      });
    })
    .sort((a, b) => Number(b.summary.endedAt || 0) - Number(a.summary.endedAt || 0))
    .slice(0, 8), [classSessions, classEvents, nowValue]);

  const integrity = useMemo(() => {
    const liveEntries = rows
      .filter((row) => !hasDismissedSignal({
        supportEvents: classEvents,
        studentId: row.id,
        assignmentId: row.live?.assignmentId || null,
        sessionKey: row.live?.assignmentId && row.live?.startedAt
          ? `${row.live.assignmentId}:${row.live.startedAt}`
          : null,
        afterMs: Number(row.live?.startedAt) || 0,
      }))
      .map((row) => ({
        key: `live:${row.id}:${row.live?.startedAt || 0}`,
        studentId: row.id,
        studentName: row.name,
        assignmentId: row.live?.assignmentId || null,
        assignmentTitle: row.live?.assignmentTitle || null,
        sessionKey: row.live?.assignmentId && row.live?.startedAt
          ? `${row.live.assignmentId}:${row.live.startedAt}`
          : null,
        startedAt: Number(row.live?.startedAt) || 0,
        sourceLabel: 'Live now',
        signal: buildIntegrityReviewSignal({
          row,
          profile: profilesByStudentId[row.id] || null,
        }),
      }))
      .filter((entry) => entry.signal);

    const liveSessionKeys = new Set(liveEntries.map((entry) => entry.sessionKey).filter(Boolean));
    const archivedEntries = classSessions
      .filter((summary) => {
        const endedAt = Number(summary.endedAt) || 0;
        return endedAt > 0 && nowValue - endedAt <= 7 * 86400000;
      })
      .filter((summary) => !liveSessionKeys.has(summary.sessionKey))
      .filter((summary) => !hasDismissedSignal({
        supportEvents: classEvents,
        studentId: summary.studentId,
        assignmentId: summary.assignmentId || null,
        sessionKey: summary.sessionKey || null,
        afterMs: Number(summary.startedAt) || 0,
      }))
      .map((summary) => ({
        key: `archive:${summary.id || summary.sessionKey}`,
        studentId: summary.studentId,
        studentName: summary.studentName || summary.studentId,
        assignmentId: summary.assignmentId || null,
        assignmentTitle: summary.assignmentTitle || null,
        sessionKey: summary.sessionKey || null,
        startedAt: Number(summary.startedAt) || 0,
        sourceLabel: 'Archived session',
        signal: buildArchivedIntegrityReviewSignal(summary),
      }))
      .filter((entry) => entry.signal);

    return [...liveEntries, ...archivedEntries]
      .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0))
      .slice(0, 8);
  }, [rows, profilesByStudentId, classEvents, classSessions, nowValue]);

  const recent = classEvents.slice(0, 8);

  const record = (event) => onRecordEvent?.({
    classId,
    classPeriod,
    source: event.source || 'supportDashboard',
    ...event,
  });

  const saveTeacherNote = async () => {
    const student = students.find((entry) => String(entry.id) === String(noteStudentId));
    const note = String(noteText || '').trim();
    if (!student || !note || !onRecordEvent) return;

    const stage = noteKind === SUPPORT_EVENT_KIND.TEACHER_INTERVENTION
      ? SUPPORT_EVENT_STAGE.ACTION_TAKEN
      : noteKind === SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP
        ? SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED
        : SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED;

    setNoteSaving(true);
    try {
      await record({
        kind: noteKind,
        stage,
        studentId: student.id,
        studentName: student.name || student.displayName || student.id,
        summary: noteKind === SUPPORT_EVENT_KIND.TEACHER_INTERVENTION
          ? 'Teacher added an intervention/check-in note.'
          : 'Teacher added a reviewed support concern/follow-up note.',
        note,
        source: 'teacherNote',
      });
      setNoteText('');
    } finally {
      setNoteSaving(false);
    }
  };

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
          <div style={{ color: '#5f6368', fontSize: 11.5, margin: '3px 0 8px' }}>Requires repeated teacher-confirmed productivity concerns; platform telemetry alone can never place a student here.</div>
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
          {integrity.length ? integrity.map((entry) => (
            <div key={entry.key} style={{ borderTop: '1px solid #eef0f2', padding: '8px 0' }}>
              <button type="button" onClick={() => onOpenStudent?.(entry.studentId)} style={{ border: 0, padding: 0, background: 'transparent', fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}>{entry.studentName}</button>
              <div style={{ fontSize: 10.5, color: '#80868b', marginTop: 2 }}>{entry.sourceLabel}{entry.assignmentTitle ? ` · ${entry.assignmentTitle}` : ''}</div>
              <div style={{ fontSize: 11.5, color: '#6b4c00', marginTop: 3 }}>{entry.signal.reasons.join(' · ')}</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                <button type="button" style={actionButton} onClick={() => record({
                  kind: SUPPORT_EVENT_KIND.INTEGRITY_REVIEW,
                  stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
                  studentId: entry.studentId,
                  studentName: entry.studentName,
                  assignmentId: entry.assignmentId,
                  assignmentTitle: entry.assignmentTitle,
                  sessionKey: entry.sessionKey,
                  confidence: entry.signal.confidence,
                  summary: 'Teacher marked an unusual response pattern for review. This is not a cheating finding.',
                  evidence: entry.signal.evidence,
                })}>Log for review</button>
                <button type="button" style={actionButton} onClick={() => record({
                  kind: SUPPORT_EVENT_KIND.SIGNAL_DISMISSED,
                  stage: SUPPORT_EVENT_STAGE.DISMISSED,
                  studentId: entry.studentId,
                  studentName: entry.studentName,
                  assignmentId: entry.assignmentId,
                  assignmentTitle: entry.assignmentTitle,
                  sessionKey: entry.sessionKey,
                  summary: 'Teacher reviewed and dismissed the unusual-response signal.',
                  evidence: entry.signal.evidence,
                })}>Dismiss</button>
              </div>
            </div>
          )) : <div style={{ color: '#80868b', fontSize: 12 }}>No unusual response pattern meets the review threshold.</div>}
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900 }}>Productivity Review</div>
          <div style={{ color: '#5f6368', fontSize: 11.5, margin: '3px 0 8px' }}>
            Archived session telemetry can suggest a look, but only a teacher can confirm an off-task concern.
          </div>
          {productivityReviews.length ? productivityReviews.map(({ summary, signal }) => {
            const elapsed = Math.max(0, (Number(summary.endedAt || 0) - Number(summary.startedAt || 0)) / 60000);
            const active = Math.max(0, Number(summary.activeSeconds || 0) / 60);
            return (
              <div key={summary.id} style={{ borderTop: '1px solid #eef0f2', padding: '8px 0' }}>
                <button type="button" onClick={() => onOpenStudent?.(summary.studentId)} style={{ border: 0, padding: 0, background: 'transparent', fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}>
                  {summary.studentName || summary.studentId}
                </button>
                <div style={{ fontSize: 11.5, color: '#5f6368', marginTop: 2 }}>
                  {summary.assignmentTitle || 'Assignment'} · {Math.round(active)} active min of {Math.round(elapsed)} elapsed · {summary.answered || 0} answered
                  {Number(summary.focusLossCount) > 0 ? ` · ${summary.focusLossCount} focus loss${Number(summary.focusLossCount) === 1 ? '' : 'es'}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                  <button type="button" style={actionButton} onClick={() => record({
                    kind: SUPPORT_EVENT_KIND.OFF_TASK_CONCERN,
                    stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
                    studentId: summary.studentId,
                    studentName: summary.studentName,
                    assignmentId: summary.assignmentId || null,
                    assignmentTitle: summary.assignmentTitle || null,
                    sessionKey: summary.sessionKey || null,
                    summary: 'Teacher confirmed an off-task/productivity concern after reviewing archived session telemetry.',
                    evidence: signal.evidence,
                  })}>Observed off-task</button>
                  <button type="button" style={actionButton} onClick={() => record({
                    kind: SUPPORT_EVENT_KIND.SIGNAL_DISMISSED,
                    stage: SUPPORT_EVENT_STAGE.DISMISSED,
                    studentId: summary.studentId,
                    studentName: summary.studentName,
                    assignmentId: summary.assignmentId || null,
                    assignmentTitle: summary.assignmentTitle || null,
                    sessionKey: summary.sessionKey || null,
                    summary: 'Teacher reviewed the low-productivity session signal and dismissed it as legitimate quiet work or another non-concern.',
                    evidence: signal.evidence,
                  })}>Dismiss / legitimate</button>
                </div>
              </div>
            );
          }) : <div style={{ color: '#80868b', fontSize: 12 }}>No recent session meets the productivity-review threshold.</div>}
        </div>
      </div>

      <details style={{ marginTop: 10, border: '1px solid #d8dde6', borderRadius: 10, background: '#fff', padding: '10px 12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Add teacher note / intervention</summary>
        <div style={{ marginTop: 9, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 11.5, color: '#5f6368' }}>
            Optional. Use this for something you actually observed or did; MathMaster never writes the teacher note for you.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr)', gap: 8 }}>
            <select value={noteStudentId} onChange={(event) => setNoteStudentId(event.target.value)} style={{ minHeight: 38, padding: '7px 8px', border: '1px solid #c9ced6', borderRadius: 7, background: '#fff' }}>
              <option value="">Choose student…</option>
              {[...students].sort((a, b) => String(a.name || a.displayName || a.id).localeCompare(String(b.name || b.displayName || b.id))).map((student) => (
                <option key={student.id} value={student.id}>{student.name || student.displayName || student.id}</option>
              ))}
            </select>
            <select value={noteKind} onChange={(event) => setNoteKind(event.target.value)} style={{ minHeight: 38, padding: '7px 8px', border: '1px solid #c9ced6', borderRadius: 7, background: '#fff' }}>
              <option value={SUPPORT_EVENT_KIND.TEACHER_INTERVENTION}>Teacher check-in / intervention</option>
              <option value={SUPPORT_EVENT_KIND.OFF_TASK_CONCERN}>Productivity / off-task concern</option>
              <option value={SUPPORT_EVENT_KIND.WATCH_PRACTICE}>Watch Practice</option>
              <option value={SUPPORT_EVENT_KIND.SMALL_GROUP}>Small-group concern</option>
              <option value={SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP}>Parent follow-up</option>
            </select>
          </div>
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            maxLength={1200}
            placeholder="What did you observe or do?"
            style={{ width: '100%', minHeight: 72, resize: 'vertical', padding: 9, border: '1px solid #c9ced6', borderRadius: 7, boxSizing: 'border-box', font: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: '#80868b' }}>{noteText.length}/1200</span>
            <button type="button" disabled={noteSaving || !noteStudentId || !noteText.trim()} onClick={saveTeacherNote} style={{ ...actionButton, minHeight: 38, opacity: noteSaving || !noteStudentId || !noteText.trim() ? 0.55 : 1 }}>
              {noteSaving ? 'Saving…' : 'Save teacher note'}
            </button>
          </div>
        </div>
      </details>

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
                <strong>{SUPPORT_EVENT_LABEL[event.kind] || event.kind}</strong> · {SUPPORT_STAGE_LABEL[event.stage] || event.stage}
              </div>
              {event.summary && <div style={{ marginTop: 2, fontSize: 11.5, color: '#5f6368' }}>{event.summary}</div>}
            </div>
          )) : <div style={{ color: '#80868b', fontSize: 12 }}>No stored support events for this class yet.</div>}
        </div>
      </details>
    </section>
  );
}
