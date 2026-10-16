import React, { useEffect, useState } from 'react';
import SecureExamContainer from './SecureExamContainer.jsx';
import SecureExamReview from './SecureExamReview.jsx';
import { listStudentSecureExamSessions } from '../../services/secureExamService.js';
import { getStudentTestCycle } from '../../services/testCycleService.js';
import { assignedTestCycleRow, testCyclesWithoutSession } from '../../platform/student/assignedTestCyclesModel.js';
import { formatDateTime } from '../../assignmentLifecycle.js';
import { resultsTimingText, sessionWasReplaced, studentSessionStatus, timeAllowance, timeAllowanceText } from '../../platform/assessment/secureExamNavigationModel.js';

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

/*
 * `testCycles` — the student's own Test Cycle assignments, each with THEIR due
 * and final late dates ({ assignment, dueAt, lateDueAt }) — lets "My Course
 * Tests" list a Test whose secure session the teacher has not opened yet
 * (assignedTestCyclesModel.js). Each is described from a read-only look at its
 * card; nothing is opened from here.
 */
export const StudentSecureExamDashboard = ({ studentProfile, onExit, onOpenCourseTest = null, onPracticeSkill = null, testCycles = [] }) => {
  const [sessions, setSessions] = useState([]);
  const [assignedTests, setAssignedTests] = useState([]);
  const [active, setActive] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await listStudentSecureExamSessions();
      const listed = result.sessions || [];
      setSessions(listed);
      setError('');
      const waiting = testCyclesWithoutSession({ assignments: (testCycles || []).map((entry) => entry.assignment), sessions: listed });
      // One that cannot be described (not assigned after all, deleted) is left
      // off rather than shown as an error: the Assignments page still has it.
      const looks = await Promise.allSettled(waiting.map((assignment) => getStudentTestCycle({ assignmentId: assignment.id, preview: true })));
      setAssignedTests(waiting.map((assignment, index) => {
        if (looks[index].status !== 'fulfilled') return null;
        const own = (testCycles || []).find((entry) => entry.assignment?.id === assignment.id) || {};
        return assignedTestCycleRow({ card: looks[index].value, assignment, dueAt: own.dueAt || null, lateDueAt: own.lateDueAt || null });
      }).filter(Boolean));
    } catch (loadError) { setError(loadError.message || 'Could not load your tests.'); }
    finally { setLoading(false); }
  };
  // Again when the student's Test Cycles arrive or change (a URL arrival can
  // open this screen before the lessons are loaded).
  const testCycleKey = (testCycles || []).map((entry) => entry.assignment?.id || '').join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [testCycleKey]);

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
          <div style={{ textAlign: 'left', minWidth: 0 }}><h1 style={{ margin: '0 0 4px', fontSize: 'clamp(calc(26 * var(--mm-px)), calc(6vw * var(--mm-text-scale, 1)), calc(34 * var(--mm-px)))', lineHeight: 1.2, color: 'var(--mm-text-strong)' }}>Tests &amp; Exams</h1><p style={{ color: 'var(--mm-text-muted)', margin: 0 }}>Your secure course tests and your college &amp; career practice tests</p></div>
          <button type="button" onClick={onExit} style={{ minHeight: 44, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer' }}>← Home</button>
        </header>
        {error && <p role="alert" style={{ color: 'var(--mm-error-text)' }}>{error}</p>}
        {loading ? <p>Loading…</p> : (
          <div style={{ display: 'grid', gap: 26 }}>
            {[
              { id: 'courseTests', title: 'My Course Tests', hint: 'Secure Tests and Retests your teacher assigned. These count toward your grade.', rows: sessions.filter(isCourseTest), assigned: assignedTests },
              { id: 'simulations', title: 'College & Career Practice Tests', hint: 'SAT, ACT, TSIA2 and ASVAB practice under real test conditions.', rows: sessions.filter((session) => !isCourseTest(session)), assigned: [] },
            ].map((group) => (
              <section key={group.id} aria-labelledby={`exam-group-${group.id}`} style={{ display: 'grid', gap: 12 }}>
                <div>
                  <h2 id={`exam-group-${group.id}`} style={{ margin: 0, fontSize: 'calc(18 * var(--mm-px))' }}>{group.title}</h2>
                  <p style={{ margin: '3px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>{group.hint}</p>
                </div>
                {!group.rows.length && !group.assigned.length && <div style={{ padding: 18, background: 'var(--mm-surface)', borderRadius: 12, color: 'var(--mm-text-muted)' }}>Nothing here yet.</div>}
                {/* An assigned Test with no session yet: what it is and when, and
                    the way to its card. Never a Start button — the session does
                    not exist, and only the card knows which stage is open. */}
                {group.assigned.map((row) => (
                  <article key={`assigned-${row.assignmentId}`} data-assigned-test-cycle={row.assignmentId} style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, textAlign: 'left', display: 'grid', gap: 6 }}>
                      <strong style={{ fontSize: 'calc(18 * var(--mm-px))', overflowWrap: 'anywhere' }}>{row.title}</strong>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>
                        <span data-secure-status-label="" style={{ padding: '3px 9px', borderRadius: 999, fontWeight: 800, ...STATUS_TONE.neutral }}>{row.statusLabel}</span>
                        {row.delivery && <span>{row.delivery}</span>}
                      </div>
                      {row.when && (
                        <div data-assigned-test-window="" style={{ color: 'var(--mm-text)', fontSize: 'calc(13 * var(--mm-px))' }}>
                          <strong>{row.when.headline}</strong>{row.when.detail ? ` ${row.when.detail}` : ''}{row.when.home ? ` ${row.when.home}` : ''}
                        </div>
                      )}
                      {!row.when && row.detail && <div style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>{row.detail}</div>}
                      {row.dueAt && (
                        <div data-assigned-test-due="" style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>
                          Due {formatDateTime(row.dueAt)}.{row.finalLateDueAt ? ` Late work is still open: final late due ${formatDateTime(row.finalLateDueAt)}.` : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenCourseTest?.(row.assignmentId)}
                      disabled={!onOpenCourseTest}
                      style={{ minHeight: 44, padding: '9px 15px', border: 0, borderRadius: 8, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}
                    >
                      Open in Assignments
                    </button>
                  </article>
                ))}
                {group.rows.map((session) => {
                  const done = terminalStatuses.has(session.status);
                  // A replaced attempt's results are not offered here: the card has the current one.
                  const canReview = done && session.feedbackReleased === true && !sessionWasReplaced(session);
                  const status = studentSessionStatus(session);
                  const timing = resultsTimingText(session);
                  return (
                    <article key={session.examSessionId} data-secure-session-status={session.status} style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 12, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <strong style={{ fontSize: 'calc(18 * var(--mm-px))' }}>{session.title}</strong>
                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>
                          <span data-secure-status-label="" style={{ padding: '3px 9px', borderRadius: 999, fontWeight: 800, ...(STATUS_TONE[status.tone] || STATUS_TONE.neutral) }}>{status.label}</span>
                          <span>{session.requiredQuestions} questions · {timeAllowanceText(timeAllowance(session))}</span>
                        </div>
                        {timing && <div style={{ marginTop: 6, color: done ? 'var(--mm-warning-text)' : 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{timing}</div>}
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
