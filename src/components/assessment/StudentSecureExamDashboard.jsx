import React, { useEffect, useState } from 'react';
import SecureExamContainer from './SecureExamContainer.jsx';
import { listStudentSecureExamSessions } from '../../services/secureExamService.js';

export const StudentSecureExamDashboard = ({ studentProfile, onExit }) => {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    try { const result = await listStudentSecureExamSessions(); setSessions(result.sessions || []); setError(''); }
    catch (loadError) { setError(loadError.message || 'Could not load secure exams.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  if (active) return <div><button type="button" onClick={() => { setActive(null); load(); }} style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 13000, padding: '7px 10px', opacity: .8 }}>Back after exam</button><SecureExamContainer examSessionId={active.examSessionId} examType={active.examType} studentSupportProfile={studentProfile} onFinished={() => {}} /></div>;
  return <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '32px 18px', boxSizing: 'border-box' }}><main style={{ maxWidth: 820, margin: '0 auto' }}><header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><h1 style={{ marginBottom: 4 }}>Secure exams</h1><p style={{ color: '#5f6368', marginTop: 0 }}>Teacher-assigned high-stakes simulations</p></div><button type="button" onClick={onExit}>Back to dashboard</button></header>{error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}{loading ? <p>Loading…</p> : <div style={{ display: 'grid', gap: 12 }}>{sessions.map((session) => { const done = ['submitted', 'force_submitted', 'time_expired'].includes(session.status); return <article key={session.examSessionId} style={{ background: '#fff', border: '1px solid #dadce0', borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}><div><strong style={{ fontSize: 18 }}>{session.title}</strong><div style={{ marginTop: 5, color: '#5f6368', fontSize: 13 }}>{session.requiredQuestions} questions · {session.timeLimitSeconds == null ? 'Untimed' : `${Math.round(session.timeLimitSeconds / 60)} minutes`} · Status: {session.status}</div></div><button type="button" disabled={done} onClick={() => setActive(session)} style={{ padding: '9px 15px', border: 0, borderRadius: 8, background: done ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900 }}>{done ? session.feedbackReleased ? 'Completed · feedback released' : 'Completed · feedback held' : session.status === 'not_started' ? 'Start' : 'Resume'}</button></article>; })}{!sessions.length && <div style={{ padding: 28, background: '#fff', borderRadius: 12, color: '#5f6368', textAlign: 'center' }}>No secure exam sessions have been assigned.</div>}</div>}</main></div>;
};

export default StudentSecureExamDashboard;
