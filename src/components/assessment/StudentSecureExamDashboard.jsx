import React, { useEffect, useState } from 'react';
import SecureExamContainer from './SecureExamContainer.jsx';
import SecureExamReview from './SecureExamReview.jsx';
import { listStudentSecureExamSessions } from '../../services/secureExamService.js';
import { resultsTimingText, studentSessionStatus, timeAllowance, timeAllowanceText } from '../../platform/assessment/secureExamNavigationModel.js';

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
 *
 * Each row says where the test stands in the student's words ("Paused by your
 * teacher", "Time ran out", "Results ready" — never `locked_integrity`), and
 * when its results arrive: a practice test's are ready right after Submit.
 */
const COURSE_TEST_EXAM_TYPE = 'courseTest';
const isCourseTest = (session) => String(session?.examType || '') === COURSE_TEST_EXAM_TYPE;

const STATUS_TONE = {
  ready: { background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' },
  active: { background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  paused: { background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' },
  done: { background: 'var(--mm-surface-muted)', color: 'var(--mm-text)' },
  neutral: { background: 'var(--mm-surface-muted)', color: 'var(--mm-text)' },
};

export const StudentSecureExamDashboard = ({ studentProfile, onExit, onOpenCourseTest = null, onPracticeSkill = null }) => {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try { const result = await listStudentSecureExamSessions(); setSessions(result.sessions || []); setError(''); }
    catch (loadError) { setError(loadError.message || 'Could not load your tests.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (reviewing) return <SecureExamReview examSessionId={reviewing.examSessionId} onBack={() => { setReviewing(null); load(); }} onPracticeSkill={onPracticeSkill} />;

  // There is intentionally no dashboard/back control while an exam is live.
  // Leaving through a convenient app button would unmount the integrity logger
  // and undermine the monitored-session contract. The student returns only
  // after the exam reaches a terminal state — and a practice test whose results
  // came back released opens them straight from its finished screen.
  if (active) return (
    <SecureExamContainer
      examSessionId={active.examSessionId}
      examType={active.examType}
      studentSupportProfile={studentProfile}
      sessionPreview={active}
      onFinished={() => {}}
      onOpenResults={(finished) => { setActive(null); setReviewing(finished?.examSessionId ? finished : active); }}
      onExitAfterFinished={() => { setActive(null); load(); }}
    />
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--mm-surface-control)', padding: '32px 16px', boxSizing: 'border-box' }}>
      <main style={{ maxWidth: 820, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'left', minWidth: 0 }}><h1 style={{ margin: '0 0 4px', fontSize: 'clamp(26px, 6vw, 34px)', lineHeight: 1.2, color: 'var(--mm-text-strong)' }}>Tests &amp; Exams</h1><p style={{ color: 'var(--mm-text-muted)', margin: 0 }}>Your secure course tests and your college &amp; career practice tests</p></div>
          <button type="button" onClick={onExit} style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer' }}>← Home</button>
        </header>
        {error && <p role="alert" style={{ color: 'var(--mm-error-text)' }}>{error}</p>}
        {loading ? <p>Loading…</p> : (
          <div style={{ display: 'grid', gap: 26 }}>
            {[
              { id: 'courseTests', title: 'My Course Tests', hint: 'Secure Tests and Retests your teacher assigned. These count toward your grade.', rows: sessions.filter(isCourseTest) },
              { id: 'simulations', title: 'College & Career Practice Tests', hint: 'SAT, ACT, TSIA2 and ASVAB practice under real test conditions.', rows: sessions.filter((session) => !isCourseTest(session)) },
            ].map((group) => (
              <section key={group.id} aria-labelledby={`exam-group-${group.id}`} style={{ display: 'grid', gap: 12 }}>
                <div>
                  <h2 id={`exam-group-${group.id}`} style={{ margin: 0, fontSize: 18 }}>{group.title}</h2>
                  <p style={{ margin: '3px 0 0', color: 'var(--mm-text-muted)', fontSize: 13 }}>{group.hint}</p>
                </div>
                {!group.rows.length && <div style={{ padding: 18, background: 'var(--mm-surface)', borderRadius: 12, color: 'var(--mm-text-muted)' }}>Nothing here yet.</div>}
                {group.rows.map((session) => {
                  const done = terminalStatuses.has(session.status);
                  const canReview = done && session.feedbackReleased === true;
                  const status = studentSessionStatus(session);
                  const timing = resultsTimingText(session);
                  return (
                    <article key={session.examSessionId} data-secure-session-status={session.status} style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <strong style={{ fontSize: 18 }}>{session.title}</strong>
                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: 'var(--mm-text-muted)', fontSize: 13 }}>
                          <span data-secure-status-label="" style={{ padding: '3px 9px', borderRadius: 999, fontWeight: 800, ...(STATUS_TONE[status.tone] || STATUS_TONE.neutral) }}>{status.label}</span>
                          <span>{session.requiredQuestions} questions · {timeAllowanceText(timeAllowance(session))}</span>
                        </div>
                        {timing && <div style={{ marginTop: 6, color: done ? 'var(--mm-warning-text)' : 'var(--mm-text-muted)', fontSize: 12 }}>{timing}</div>}
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
                          style={{ minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}
                        >
                          Open in Assignments
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={done && !canReview}
                          onClick={() => canReview ? setReviewing(session) : setActive(session)}
                          style={{ minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: done && !canReview ? 'var(--mm-surface-control-strong)' : canReview ? 'var(--mm-accent)' : 'var(--mm-primary)', color: done && !canReview ? 'var(--mm-disabled-text)' : 'var(--mm-on-primary)', fontWeight: 900, cursor: done && !canReview ? 'not-allowed' : 'pointer' }}
                        >
                          {canReview ? 'See your results' : done ? 'Waiting for results' : session.status === 'not_started' ? 'Start' : 'Resume'}
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
