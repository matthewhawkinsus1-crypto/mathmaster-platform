import React, { useEffect, useState } from 'react';
import SecureExamContainer from './SecureExamContainer.jsx';
import SecureExamReview from './SecureExamReview.jsx';
import { listStudentSecureExamSessions } from '../../services/secureExamService.js';

const terminalStatuses = new Set(['submitted', 'force_submitted', 'time_expired']);

/*
 * TWO THINGS LIVE BEHIND "TESTS & EXAMS", AND A STUDENT TELLS THEM APART.
 *
 * A secure course Test is their own teacher's unit test: it has a due date, it
 * is the grade in the gradebook, and failing it has a consequence they care
 * about. A College & Career simulation is practice for the SAT, ACT, TSIA2 or
 * ASVAB. They run on the same secure runtime and they mean completely
 * different things, so the screen groups them rather than sorting one long
 * list by date and leaving the student to work out which is which.
 *
 * The split is read off the session's own examType — the same field the server
 * uses to decide which item stream a session draws from — so a session cannot
 * appear under the wrong heading.
 */
const COURSE_TEST_EXAM_TYPE = 'courseTest';
const isCourseTest = (session) => String(session?.examType || '') === COURSE_TEST_EXAM_TYPE;

export const StudentSecureExamDashboard = ({ studentProfile, onExit, onOpenCourseTest = null }) => {
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
          <div><h1 style={{ marginBottom: 4 }}>Tests &amp; Exams</h1><p style={{ color: '#5f6368', marginTop: 0 }}>Your secure course tests and your college &amp; career simulations</p></div>
          <button type="button" onClick={onExit}>Back to dashboard</button>
        </header>
        {error && <p role="alert" style={{ color: '#b3261e' }}>{error}</p>}
        {loading ? <p>Loading…</p> : (
          <div style={{ display: 'grid', gap: 26 }}>
            {[
              { id: 'courseTests', title: 'My Course Tests', hint: 'Secure Tests and Retests your teacher assigned. These count toward your grade.', rows: sessions.filter(isCourseTest) },
              { id: 'simulations', title: 'College & Career Simulations', hint: 'SAT, ACT, TSIA2 and ASVAB practice under exam conditions.', rows: sessions.filter((session) => !isCourseTest(session)) },
            ].map((group) => (
              <section key={group.id} aria-labelledby={`exam-group-${group.id}`} style={{ display: 'grid', gap: 12 }}>
                <div>
                  <h2 id={`exam-group-${group.id}`} style={{ margin: 0, fontSize: 18 }}>{group.title}</h2>
                  <p style={{ margin: '3px 0 0', color: '#5f6368', fontSize: 13 }}>{group.hint}</p>
                </div>
                {!group.rows.length && <div style={{ padding: 18, background: '#fff', borderRadius: 12, color: '#5f6368' }}>Nothing here yet.</div>}
                {group.rows.map((session) => {
                  const done = terminalStatuses.has(session.status);
              const canReview = done && session.feedbackReleased === true;
              return (
                <article key={session.examSessionId} style={{ background: '#fff', border: '1px solid #dadce0', borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>{session.title}</strong>
                    <div style={{ marginTop: 5, color: '#5f6368', fontSize: 13 }}>{session.requiredQuestions} questions · {session.timeLimitSeconds == null ? 'Untimed' : `${Math.round(session.timeLimitSeconds / 60)} minutes`} · Status: {session.status}</div>
                    {done && !session.feedbackReleased && <div style={{ marginTop: 5, color: '#7a4f00', fontSize: 12 }}>Your teacher has not released correctness feedback yet.</div>}
                  </div>
                  {/*
                    A COURSE TEST IS NEVER STARTED FROM THIS LIST.

                    Its sessions are created for a whole class at once, well
                    before anyone finishes Review, so a Start button here would
                    be a way into a Test the student has not unlocked — or back
                    into a Retest a teacher has closed. Only the assignment card
                    knows which stage is open, so this hands off to it. The
                    server refuses the same thing independently; this is the
                    half that stops a student meeting a refusal at all.
                  */}
                  {isCourseTest(session) && !canReview ? (
                    <button
                      type="button"
                      onClick={() => onOpenCourseTest?.(session.courseTest?.assignmentId)}
                      disabled={!onOpenCourseTest || !session.courseTest?.assignmentId}
                      style={{ padding: '9px 15px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}
                    >
                      Open in Assignments
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={done && !canReview}
                      onClick={() => canReview ? setReviewing(session) : setActive(session)}
                      style={{ padding: '9px 15px', border: 0, borderRadius: 8, background: done && !canReview ? '#dadce0' : canReview ? '#5b21b6' : '#1a73e8', color: '#fff', fontWeight: 900, cursor: done && !canReview ? 'not-allowed' : 'pointer' }}
                    >
                      {canReview ? 'Review released feedback' : done ? 'Completed · feedback held' : session.status === 'not_started' ? 'Start' : 'Resume'}
                    </button>
                  )}
                </article>
              );
                })}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentSecureExamDashboard;
