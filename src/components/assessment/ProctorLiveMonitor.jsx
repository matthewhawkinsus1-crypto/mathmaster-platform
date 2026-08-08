import React, { useCallback, useEffect, useState } from 'react';
import { listProctorExamSessions, proctorExamAction } from '../../services/secureExamService.js';

const statusColor = (status) => status?.startsWith('locked') ? '#b3261e' : ['submitted', 'force_submitted', 'time_expired'].includes(status) ? '#137333' : '#174ea6';

export const ProctorLiveMonitor = ({ examType = '' }) => {
  const [sessions, setSessions] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { const result = await listProctorExamSessions(examType ? { examType } : {}); setSessions(result.sessions || []); setError(''); }
    catch (refreshError) { setError(refreshError.message || 'Could not refresh proctor sessions.'); }
  }, [examType]);

  useEffect(() => { refresh(); const id = window.setInterval(refresh, 10000); return () => window.clearInterval(id); }, [refresh]);
  const act = async (session, action, extra = {}) => {
    setBusyId(session.examSessionId); setError('');
    try { await proctorExamAction({ examSessionId: session.examSessionId, action, ...extra }); await refresh(); }
    catch (actionError) { setError(actionError.message || 'The proctor action failed.'); }
    finally { setBusyId(''); }
  };

  return <section style={{ textAlign: 'left' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}><div><h2 style={{ marginBottom: 4 }}>Live proctor monitor</h2><p style={{ margin: 0, color: '#5f6368' }}>Controls require the signed-in teacher role; there is no browser-stored proctor PIN.</p></div><button type="button" onClick={refresh} style={{ padding: '8px 12px' }}>Refresh</button></div>{error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}<div style={{ overflowX: 'auto', marginTop: 18 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}><thead><tr>{['Student', 'Exam', 'Status', 'Progress', 'Integrity', 'Proctor actions'].map((label) => <th key={label} style={{ textAlign: 'left', padding: 9, borderBottom: '2px solid #dadce0' }}>{label}</th>)}</tr></thead><tbody>{sessions.map((session) => { const terminal = ['submitted', 'force_submitted', 'time_expired'].includes(session.status); const locked = String(session.status).startsWith('locked'); return <tr key={session.examSessionId}><td style={{ padding: 9, borderBottom: '1px solid #eee' }}>{session.studentId}<div style={{ fontSize: 11, color: '#5f6368' }}>{session.classPeriod}</div></td><td style={{ padding: 9, borderBottom: '1px solid #eee' }}>{session.title}</td><td style={{ padding: 9, borderBottom: '1px solid #eee', color: statusColor(session.status), fontWeight: 800 }}>{session.status}</td><td style={{ padding: 9, borderBottom: '1px solid #eee' }}>{session.answeredQuestions}/{session.requiredQuestions}</td><td style={{ padding: 9, borderBottom: '1px solid #eee' }}>{session.violationCount || 0}</td><td style={{ padding: 9, borderBottom: '1px solid #eee' }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{locked && <button disabled={busyId === session.examSessionId} onClick={() => act(session, 'unlock')}>Unlock</button>}{!terminal && !locked && <button disabled={busyId === session.examSessionId} onClick={() => act(session, 'lock')}>Pause</button>}{!terminal && <button disabled={busyId === session.examSessionId} onClick={() => act(session, 'extendTime', { minutes: 5 })}>+5 min</button>}{!terminal && <button disabled={busyId === session.examSessionId} onClick={() => act(session, 'forceSubmit')}>Submit</button>}{terminal && !session.feedbackReleased && <button disabled={busyId === session.examSessionId} onClick={() => act(session, 'releaseFeedback')}>Release feedback</button>}{session.feedbackReleased && <span style={{ color: '#137333', fontSize: 12, fontWeight: 800 }}>Released</span>}</div></td></tr>; })}{!sessions.length && <tr><td colSpan="6" style={{ padding: 24, textAlign: 'center', color: '#5f6368' }}>No secure exam sessions yet.</td></tr>}</tbody></table></div></section>;
};

export default ProctorLiveMonitor;
