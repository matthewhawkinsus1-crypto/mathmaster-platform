import React, { useCallback, useEffect, useState } from 'react';
import SecureExamContainer from '../assessment/SecureExamContainer.jsx';
import TestCycleCorrections from './TestCycleCorrections.jsx';
import { getStudentTestCycle } from '../../services/testCycleService.js';
import { TEST_CYCLE_STAGE, stageIsSecure } from '../../platform/assessment/testCycle.js';

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
 */

const shell = {
  background: '#fff',
  border: '1px solid #dadce0',
  borderRadius: 14,
  padding: 'clamp(16px, 4vw, 24px)',
  display: 'grid',
  gap: 12,
};

const STAGE_TONE = {
  [TEST_CYCLE_STAGE.REVIEW]: { background: '#e8f0fe', color: '#1a4fa0' },
  [TEST_CYCLE_STAGE.TEST]: { background: '#fce8e6', color: '#b3261e' },
  [TEST_CYCLE_STAGE.AWAITING_RELEASE]: { background: '#f1f3f4', color: '#3c4043' },
  [TEST_CYCLE_STAGE.PASSED]: { background: '#e6f4ea', color: '#0d652d' },
  [TEST_CYCLE_STAGE.CORRECTIONS]: { background: '#fef7e0', color: '#7a4f00' },
  [TEST_CYCLE_STAGE.RETEST_READY]: { background: '#f1f3f4', color: '#3c4043' },
  [TEST_CYCLE_STAGE.RETEST]: { background: '#fce8e6', color: '#b3261e' },
  [TEST_CYCLE_STAGE.RETEST_SUBMITTED]: { background: '#f1f3f4', color: '#3c4043' },
  [TEST_CYCLE_STAGE.COMPLETE]: { background: '#e6f4ea', color: '#0d652d' },
  [TEST_CYCLE_STAGE.RETEST_CLOSED]: { background: '#f1f3f4', color: '#3c4043' },
};

export const TestCycleCard = ({ assignmentId, studentProfile = null, onOpenReview = null, onExit = null }) => {
  const [card, setCard] = useState(null);
  const [mode, setMode] = useState('card');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCard(await getStudentTestCycle({ assignmentId }));
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'This assessment could not be opened.');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !card) return <section style={shell}><p style={{ color: '#5f6368', margin: 0 }}>Loading your assessment…</p></section>;
  if (error && !card) {
    return (
      <section style={shell}>
        <p role="alert" style={{ color: '#b3261e', margin: 0 }}>{error}</p>
        <button type="button" onClick={load} style={{ justifySelf: 'start', minHeight: 44, padding: '9px 15px', borderRadius: 8, border: '1px solid #5f6368', background: '#fff', cursor: 'pointer' }}>Try again</button>
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
        onFinished={() => {}}
        onExitAfterFinished={() => { setMode('card'); load(); }}
      />
    );
  }

  if (mode === 'corrections' && card.corrections) {
    return (
      <TestCycleCorrections
        assignmentId={assignmentId}
        corrections={card.corrections}
        onProgress={load}
        onComplete={load}
        onExit={() => { setMode('card'); load(); }}
      />
    );
  }

  const tone = STAGE_TONE[card.stage] || { background: '#f1f3f4', color: '#3c4043' };
  const enter = () => {
    if (card.stage === TEST_CYCLE_STAGE.REVIEW) return onOpenReview?.(assignmentId);
    if (stageIsSecure(card.stage)) return setMode('secure');
    if (card.stage === TEST_CYCLE_STAGE.CORRECTIONS) return setMode('corrections');
    return onExit?.();
  };

  return (
    <section style={shell} data-test-cycle-stage={card.stage}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...tone, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999 }}>{card.statusLabel}</span>
        {card.secure && <span style={{ fontSize: 11, fontWeight: 800, color: '#b3261e' }}>Secure · monitored</span>}
        {card.hintsAllowed && <span style={{ fontSize: 11, fontWeight: 800, color: '#0d652d' }}>Help allowed</span>}
      </div>
      <h2 style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 23px)' }}>{card.title}</h2>
      <p style={{ margin: 0, color: '#3c4043', lineHeight: 1.55 }}>{card.detail}</p>

      {/* The grade breakdown, from the one canonical record. When no retest
          happened this is deliberately just the test score. */}
      {card.grade?.rows?.length > 0 && (
        <dl style={{ display: 'grid', gap: 6, margin: 0, padding: '12px 14px', background: '#f8f9fa', borderRadius: 10 }}>
          {card.grade.rows.map((row) => (
            <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <dt style={{ color: '#5f6368', fontSize: 13 }}>{row.label}</dt>
              <dd style={{ margin: 0, fontWeight: row.key === 'recordedGrade' ? 900 : 600, fontSize: 13 }}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={!card.canEnter}
          onClick={enter}
          style={{ minHeight: 48, padding: '10px 20px', border: 0, borderRadius: 9, background: card.canEnter ? (card.secure ? '#b3261e' : '#1a73e8') : '#dadce0', color: '#fff', fontWeight: 900, cursor: card.canEnter ? 'pointer' : 'not-allowed' }}
        >
          {card.actionLabel}
        </button>
        {onExit && (
          <button type="button" onClick={onExit} style={{ minHeight: 48, padding: '10px 16px', borderRadius: 9, border: '1px solid #5f6368', background: '#fff', color: '#3c4043', cursor: 'pointer' }}>
            Back
          </button>
        )}
      </div>
    </section>
  );
};

export default TestCycleCard;
