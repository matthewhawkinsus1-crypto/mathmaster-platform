import React, { useEffect, useState } from 'react';
import SecureExamContainer from './SecureExamContainer.jsx';
import SecureExamReview from './SecureExamReview.jsx';
import { listStudentSecureExamSessions } from '../../services/secureExamService.js';

const terminalStatuses = new Set(['submitted', 'force_submitted', 'time_expired']);

export const StudentSecureExamDashboard = ({ studentProfile, onExit }) => {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try { const result = await listStudentSecureExamSessions(); setSessions(result.sessions || []); setError(''); }
    catch (loadError) { setError(loadError.message || 'Could not load secure exams.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (reviewing) return <SecureExamReview examSessionId={reviewing.examSessionId} onBack={() => { setReviewing(null); load(); }} />;

  // There is intentionally no dashboard/back control while an exam is live.
  // Leaving through a convenient app button would unmount the integrity logger
  // and undermine the monitored-session contract. The student returns only
  // after the exam reaches a terminal state.
  if (active) return (
    <SecureExamContainer
      examSessionId={active.examSessionId}
      examType={active.examType}
      studentSupportProfile={studentProfile}
      onFinished={() => {}}
      onExitAfterFinished={() => { setActive(null); load(); }}
    />
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '32px 18px', boxSizing: 'border-box' }}>
      <main style={{ maxWidth: 820, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div><h1 style={{ marginBottom: 4 }}>Secure exams</h1><p style={{ color: '#5f6368', marginTop: 0 }}>Teacher-assigned high-stakes simulations</p></div>
          <button type="button" onClick={onExit}>Back to dashboard</button>
        </header>
        {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}
        {loading ? <p>Loading…</p> : (
          <div style={{ display: 'grid', gap: 12 }}>
            {sessions.map((session) => {
              const done = terminalStatuses.has(session.status);
              const canReview = done && session.feedbackReleased === true;
              return (
                <article key={session.examSessionId} style={{ background: '#fff', border: '1px solid #dadce0', borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>{session.title}</strong>
                    <div style={{ marginTop: 5, color: '#5f6368', fontSize: 13 }}>{session.requiredQuestions} questions · {session.timeLimitSeconds == null ? 'Untimed' : `${Math.round(session.timeLimitSeconds / 60)} minutes`} · Status: {session.status}</div>
                    {done && !session.feedbackReleased && <div style={{ marginTop: 5, color: '#7a4f00', fontSize: 12 }}>Your teacher has not released correctness feedback yet.</div>}
                  </div>
                  <button
                    type="button"
                    disabled={done && !canReview}
                    onClick={() => canReview ? setReviewing(session) : setActive(session)}
                    style={{ padding: '9px 15px', border: 0, borderRadius: 8, background: done && !canReview ? '#dadce0' : canReview ? '#5b21b6' : '#1a73e8', color: '#fff', fontWeight: 900, cursor: done && !canReview ? 'not-allowed' : 'pointer' }}
                  >
                    {canReview ? 'Review released feedback' : done ? 'Completed · feedback held' : session.status === 'not_started' ? 'Start' : 'Resume'}
                  </button>
                </article>
              );
            })}
            {!sessions.length && <div style={{ padding: 28, background: '#fff', borderRadius: 12, color: '#5f6368', textAlign: 'center' }}>No secure exam sessions have been assigned.</div>}
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentSecureExamDashboard;
