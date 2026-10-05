import React, { useCallback, useEffect, useRef, useState } from 'react';
import SecureExamContainer from '../assessment/SecureExamContainer.jsx';
import SecureExamReview from '../assessment/SecureExamReview.jsx';
import TestCycleCorrections from './TestCycleCorrections.jsx';
import { getStudentTestCycle } from '../../services/testCycleService.js';
import { TEST_CYCLE_STAGE, stageIsSecure } from '../../platform/assessment/testCycle.js';
import { formatDateTime } from '../../assignmentLifecycle.js';
import { markTestCycleSeen } from '../../platform/student/testCycleDiscovery.js';

/*
 * ONE CARD. ONE STAGE. ONE GRADE.
 *
 * A student meets Review, Test, Corrections and Retest as a single assignment,
 * and at any moment this card offers exactly one of them — the one the SERVER
 * says they are eligible to enter. The stage is never computed here: a browser
 * that could work out its own stage could work out that it is allowed into a
 * retest it has not earned.
 *
 * WHAT EACH STAGE OPENS.
 *
 *   review        the ordinary MathMaster assignment runtime, via onOpenReview
 *   test/retest   SecureExamContainer — the SAME component the SAT, ACT,
 *                 TSIA2 and ASVAB simulations use, with the same integrity
 *                 logger, timer, autosave and proctor lock
 *   corrections   TestCycleCorrections, which is deliberately not secure
 *
 * There is no fourth runtime, and no stage-specific fork inside the secure one.
 *
 * WHAT A STUDENT IS TOLD, WITHOUT ASKING. Why the next thing is locked and what
 * unlocks it (per phase), whether the Test is timed, what a retest can do to a
 * grade, when the assessment is due or opens, and how far along Review and
 * Corrections are. None of it is a score the teacher has not released.
 *
 * IT FOLLOWS THE SERVER. `refreshKey` changes when the student's grade document
 * changes — Review progress landing, a teacher releasing results, a retest
 * opening — and the card asks the server again, so a student never has to
 * reload to find their Test unlocked.
 */

const shell = {
  background: 'var(--mm-surface)',
  border: '1px solid var(--mm-border)',
  borderRadius: 14,
  padding: 'clamp(16px, 4vw, 24px)',
  display: 'grid',
  gap: 12,
  color: 'var(--mm-text)',
};

const STAGE_TONE = {
  [TEST_CYCLE_STAGE.REVIEW]: { background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  [TEST_CYCLE_STAGE.TEST]: { background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' },
  [TEST_CYCLE_STAGE.AWAITING_RELEASE]: { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  [TEST_CYCLE_STAGE.PASSED]: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  [TEST_CYCLE_STAGE.CORRECTIONS]: { background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' },
  [TEST_CYCLE_STAGE.RETEST_READY]: { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  [TEST_CYCLE_STAGE.RETEST]: { background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' },
  [TEST_CYCLE_STAGE.RETEST_SUBMITTED]: { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  [TEST_CYCLE_STAGE.COMPLETE]: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  [TEST_CYCLE_STAGE.RETEST_CLOSED]: { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
};

const PHASE_STATUS_LABEL = {
  available: 'Available', locked: 'Locked', ready: 'Ready', inProgress: 'In progress',
  completed: 'Complete', pending: 'Pending', required: 'Required', notRequired: 'Not required',
  unavailable: 'Unavailable', closed: 'Closed',
};

const PHASE_STATUS_COLOR = {
  ready: 'var(--mm-success-text)',
  inProgress: 'var(--mm-primary-text)',
  available: 'var(--mm-primary-text)',
  required: 'var(--mm-warning-text)',
  completed: 'var(--mm-success-text)',
};

const actionButtonStyle = ({ enabled, secure }) => ({
  minHeight: 48,
  padding: '10px 20px',
  border: 0,
  borderRadius: 9,
  fontWeight: 900,
  cursor: enabled ? 'pointer' : 'not-allowed',
  // Disabled is a readable token pair in both themes. It used to be white text
  // on #dadce0, which a student read as a blank grey bar.
  background: enabled ? (secure ? 'var(--mm-danger)' : 'var(--mm-primary)') : 'var(--mm-surface-control-strong)',
  color: enabled ? 'var(--mm-on-primary)' : 'var(--mm-disabled-text)',
});

const quietButtonStyle = {
  minHeight: 48,
  padding: '10px 16px',
  borderRadius: 9,
  border: '1px solid var(--mm-border-strong)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text)',
  fontWeight: 800,
  cursor: 'pointer',
};

const factStyle = { margin: 0, fontSize: 13, color: 'var(--mm-text-muted)', lineHeight: 1.5 };

export const TestCycleCard = ({ assignmentId, studentId = null, studentProfile = null, onOpenReview = null, onExit = null, refreshKey = null }) => {
  const [card, setCard] = useState(null);
  const [mode, setMode] = useState('card');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCard(await getStudentTestCycle({ assignmentId }));
      setError('');
      // Opening the card is seeing it: the list's "New" marker for this cycle
      // clears until its stage changes again.
      if (studentId) markTestCycleSeen(studentId, assignmentId);
    } catch (loadError) {
      setError(loadError.message || 'This assessment could not be opened.');
    } finally {
      setLoading(false);
    }
  }, [assignmentId, studentId]);

  useEffect(() => { load(); }, [load]);

  // The server's answer can change while the card is open. Ask again when the
  // student's own grade document says something moved, and when they come back
  // to the tab — but never underneath an open secure exam or corrections set.
  useEffect(() => {
    if (refreshKey === null || refreshKey === undefined) return;
    if (modeRef.current === 'card') load();
  }, [refreshKey, load]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && modeRef.current === 'card') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (loading && !card) return <section style={shell}><p role="status" style={{ color: 'var(--mm-text-muted)', margin: 0 }}>Loading your assessment…</p></section>;
  if (error && !card) {
    return (
      <section style={shell}>
        <p role="alert" style={{ color: 'var(--mm-error-text)', margin: 0 }}>{error}</p>
        <button type="button" onClick={load} style={{ ...quietButtonStyle, justifySelf: 'start', minHeight: 44 }}>Try again</button>
      </section>
    );
  }
  if (!card) return null;

  // Secure delivery owns the whole screen while it runs, and there is no exit
  // control inside it — leaving through an app button would unmount the
  // integrity logger and break the monitored-session contract.
  if (mode === 'secure' && card.examSessionId) {
    return (
      <SecureExamContainer
        examSessionId={card.examSessionId}
        examType="courseTest"
        studentSupportProfile={studentProfile}
        title={card.stage === TEST_CYCLE_STAGE.RETEST ? `${card.title} — Retest` : card.title}
        startLabel={card.actionLabel}
        delivery={card.delivery || null}
        exitLabel="Back to my assessment"
        onFinished={() => {}}
        onExitAfterFinished={() => { setMode('card'); load(); }}
      />
    );
  }

  // A completed cycle's action is "Review Test" / "Review Retest", and it has
  // to actually open the released review. Falling through to onExit would have
  // made the advertised action a way of leaving the screen.
  if (mode === 'review' && card.reviewExamSessionId) {
    return (
      <SecureExamReview
        examSessionId={card.reviewExamSessionId}
        onBack={() => { setMode('card'); load(); }}
      />
    );
  }

  if (mode === 'corrections' && card.corrections) {
    return (
      <TestCycleCorrections
        assignmentId={assignmentId}
        corrections={card.corrections}
        onProgress={load}
        onComplete={() => { setMode('card'); load(); }}
        onExit={() => { setMode('card'); load(); }}
      />
    );
  }

  const tone = STAGE_TONE[card.stage] || { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' };
  // The two stages whose action is "open the released secure review".
  const isReviewAction = [TEST_CYCLE_STAGE.PASSED, TEST_CYCLE_STAGE.COMPLETE].includes(card.stage);
  const enter = () => {
    if (card.stage === TEST_CYCLE_STAGE.REVIEW) return onOpenReview?.(assignmentId);
    if (stageIsSecure(card.stage)) return setMode('secure');
    if (card.stage === TEST_CYCLE_STAGE.CORRECTIONS) return setMode('corrections');
    if (card.reviewExamSessionId) return setMode('review');
    return onExit?.();
  };
  const enabled = card.canEnter && !(isReviewAction && !card.reviewExamSessionId);
  const availability = card.availability || null;
  const review = card.reviewProgress || null;

  return (
    <section style={shell} data-test-cycle-stage={card.stage} data-availability={availability?.reason || 'open'}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...tone, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999 }}>{card.statusLabel}</span>
        {card.secure && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mm-error-text)' }}>Secure · monitored</span>}
        {card.hintsAllowed && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mm-success-text)' }}>Help allowed</span>}
      </div>
      <h2 style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 23px)', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{card.title}</h2>
      <p style={{ margin: 0, color: 'var(--mm-text)', lineHeight: 1.55 }}>{card.detail}</p>

      {availability?.reason === 'scheduled' && availability.opensAt && (
        <p role="status" style={{ margin: 0, padding: '10px 12px', borderRadius: 9, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontWeight: 800 }}>
          Opens {formatDateTime(new Date(availability.opensAt).toISOString())}.
        </p>
      )}

      {card.stage === TEST_CYCLE_STAGE.REVIEW && review && review.total > 0 && (
        <p style={factStyle}>
          Review: {review.attempted} of {review.total} questions answered. Answer every Review question to unlock your Test — they do not have to be correct.
        </p>
      )}

      {/* Always show the whole cycle. The server supplies status-only phase
          metadata; secure questions are fetched only after the secure runtime
          independently authorizes Start Test/Retest. */}
      {Array.isArray(card.phases) && (
        <ol aria-label="Test Cycle phases" style={{ listStyle: 'none', display: 'grid', gap: 8, padding: 0, margin: 0 }}>
          {card.phases.map((phase) => (
            <li key={phase.id} data-test-cycle-phase={phase.id} data-phase-status={phase.status} style={{ padding: '10px 12px', border: '1px solid var(--mm-border-soft)', borderRadius: 9, background: 'var(--mm-surface-sunken)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--mm-text-strong)' }}>{phase.label}{phase.secure ? ' · Secure' : ''}</strong>
                <span style={{ fontWeight: 800, color: PHASE_STATUS_COLOR[phase.status] || 'var(--mm-text-muted)' }}>{PHASE_STATUS_LABEL[phase.status] || phase.status}</span>
              </div>
              {phase.reason && <p style={{ margin: '5px 0 0', color: 'var(--mm-text-muted)', fontSize: 13 }}>{phase.reason}</p>}
            </li>
          ))}
        </ol>
      )}

      {card.stage === TEST_CYCLE_STAGE.TEST && card.canEnter && card.actionLabel === 'Start Test' && (
        <p role="status" aria-live="polite" style={{ margin: 0, padding: '10px 12px', borderRadius: 9, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', fontWeight: 800 }}>
          Test unlocked — your Review is complete.
        </p>
      )}

      {/* The grade breakdown, from the one canonical record. When no retest
          happened this is deliberately just the test score. */}
      {card.grade?.rows?.length > 0 && (
        <dl style={{ display: 'grid', gap: 6, margin: 0, padding: '12px 14px', background: 'var(--mm-surface-sunken)', borderRadius: 10 }}>
          {card.grade.rows.map((row) => (
            <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <dt style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>{row.label}</dt>
              <dd style={{ margin: 0, fontWeight: row.key === 'recordedGrade' ? 900 : 600, fontSize: 13, color: 'var(--mm-text-strong)' }}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* The facts a student would otherwise have to ask about. */}
      <div style={{ display: 'grid', gap: 4 }}>
        {card.delivery && (
          <p style={factStyle}>
            {card.delivery.timed ? `Test is timed: ${card.delivery.timeLimitMinutes} minutes once you start.` : 'Test is not timed.'}
            {card.delivery.questionCount ? ` ${card.delivery.questionCount} questions, one attempt each.` : ''}
          </p>
        )}
        {card.policy?.summary && <p style={factStyle}>{card.policy.summary}</p>}
        {card.dueAt && <p style={factStyle}>Due {formatDateTime(card.dueAt)}.</p>}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={!card.canEnter || (isReviewAction && !card.reviewExamSessionId)}
          onClick={enter}
          style={actionButtonStyle({ enabled, secure: card.secure })}
        >
          {card.actionLabel}
        </button>
        {onExit && (
          <button type="button" onClick={onExit} style={quietButtonStyle}>
            Back
          </button>
        )}
      </div>
    </section>
  );
};

export default TestCycleCard;
