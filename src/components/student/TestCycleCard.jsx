import React, { useCallback, useEffect, useRef, useState } from 'react';
import SecureExamContainer from '../assessment/SecureExamContainer.jsx';
import SecureExamReview from '../assessment/SecureExamReview.jsx';
import TestCycleCorrections from './TestCycleCorrections.jsx';
import { getStudentTestCycle } from '../../services/testCycleService.js';
import { TEST_CYCLE_STAGE, stageIsSecure } from '../../platform/assessment/testCycle.js';
import { formatDateTime } from '../../assignmentLifecycle.js';
import {
  markTestCycleSeen,
  retestPolicyRelevant,
  reviewRequirementText,
  reviewSkillRows,
  testReviewLabel,
  testReviewSessionIdFor,
  testSkillsSection,
} from '../../platform/student/testCycleDiscovery.js';

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
 * AND WHAT HELPS THEM PREPARE. Before the Test, what is on it (the blueprint's
 * skills and how many questions each). During Review, how they are doing on
 * each Review skill, weakest first, with a way to practise the ones they have
 * started — the teacher's Review rule still decides what unlocks the Test.
 * Once a Test's results are released, "Review my Test" reaches its answers and
 * worked solutions from Corrections and afterwards — never while a Retest can
 * be answered. The retest rule ("can raise your grade up to 70%") is shown
 * only while a retest could still change the grade: a student who passed is
 * not read a cap meant for failing. Each of these is shaped by a tested helper
 * in testCycleDiscovery.js, and every skill is named the way
 * secureExamResultsModel.js names it everywhere else.
 *
 * A REVIEW OPENED FROM CORRECTIONS LIES OVER THEM. Corrections stay mounted,
 * hidden, while the released Test is open, so the practice question, an
 * answer typed and not yet checked, and its tries left are all as the student
 * left them; Back returns focus to the corrections heading. Back from any
 * review to the card returns focus to the card's heading.
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

export const TestCycleCard = ({ assignmentId, studentId = null, studentProfile = null, onOpenReview = null, onExit = null, refreshKey = null, previewCard = null, onPreviewEnter = null, onPracticeSkill = null }) => {
  /*
   * PREVIEW MODE. A teacher previewing a stage hands the card a locally built
   * payload in exactly the shape the server returns. The card then makes NO
   * call at all — no student callable, no session, no record — and its action
   * button goes to the preview's own handler instead of a secure runtime.
   */
  const previewing = Boolean(previewCard);
  const [card, setCard] = useState(previewCard);
  const [mode, setMode] = useState('card');
  // Where "Review my Test" was opened from, so its Back returns there — to
  // the card, or to the corrections question the student was working on.
  const [testReviewReturn, setTestReviewReturn] = useState('card');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Where focus goes when a full-screen review hands the screen back: the
  // card's heading, or the corrections heading the student left.
  const headingRef = useRef(null);
  const correctionsRef = useRef(null);
  const returnFocusRef = useRef(null);
  useEffect(() => {
    const returnTo = returnFocusRef.current;
    if (!returnTo || returnTo !== mode) return;
    returnFocusRef.current = null;
    if (returnTo === 'corrections') correctionsRef.current?.querySelector('[data-corrections-heading]')?.focus();
    else headingRef.current?.focus();
  }, [mode, card]);

  // The server writes a release in steps (score, then the corrections plan), so
  // two loads can be in flight at once. Only the newest one may set the card:
  // an older answer landing last would put "Corrections being prepared" back.
  const loadSeqRef = useRef(0);
  const load = useCallback(async () => {
    if (previewing) { setLoading(false); return; }
    loadSeqRef.current += 1;
    const seq = loadSeqRef.current;
    setLoading(true);
    try {
      const next = await getStudentTestCycle({ assignmentId });
      if (seq !== loadSeqRef.current) return;
      setCard(next);
      setError('');
      // Opening the card is seeing it: the list's "New" marker for this cycle
      // clears until its stage changes again.
      if (studentId) markTestCycleSeen(studentId, assignmentId);
    } catch (loadError) {
      if (seq !== loadSeqRef.current) return;
      setError(loadError.message || 'This assessment could not be opened.');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [assignmentId, studentId, previewing]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (previewCard) setCard(previewCard); }, [previewCard]);

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

  // The released original Test, when this stage may show it (see the helper).
  // A teacher preview has no student session to open, so it never offers one.
  const testReviewId = previewing ? null : testReviewSessionIdFor(card);
  const openTestReview = (from) => { setTestReviewReturn(from); setMode('testReview'); };
  const backToCard = () => { returnFocusRef.current = 'card'; setMode('card'); load(); };

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
        onBack={backToCard}
        onPracticeSkill={onPracticeSkill}
        skillLabels={card.testSkills}
        backLabel="Back to my assessment"
      />
    );
  }

  // Corrections — and the released Test opened from inside them, drawn over
  // the corrections rather than instead of them (see above).
  const reviewingFromCorrections = mode === 'testReview' && testReviewReturn === 'corrections' && Boolean(testReviewId);
  if ((mode === 'corrections' || reviewingFromCorrections) && card.corrections) {
    return (
      <>
        <div ref={correctionsRef} style={reviewingFromCorrections ? { display: 'none' } : undefined}>
          <TestCycleCorrections
            assignmentId={assignmentId}
            corrections={card.corrections}
            reviewExamSessionId={testReviewId}
            onReviewTest={() => openTestReview('corrections')}
            onProgress={load}
            onComplete={backToCard}
            onExit={backToCard}
          />
        </div>
        {reviewingFromCorrections && (
          <SecureExamReview
            examSessionId={testReviewId}
            onBack={() => { returnFocusRef.current = 'corrections'; setMode('corrections'); }}
            onPracticeSkill={onPracticeSkill}
            skillLabels={card.testSkills}
            backLabel="Back to my corrections"
          />
        )}
      </>
    );
  }

  if (mode === 'testReview' && testReviewId) {
    return (
      <SecureExamReview
        examSessionId={testReviewId}
        onBack={backToCard}
        onPracticeSkill={onPracticeSkill}
        skillLabels={card.testSkills}
        backLabel="Back to my assessment"
      />
    );
  }

  const tone = STAGE_TONE[card.stage] || { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' };
  // The two stages whose action is "open the released secure review".
  const isReviewAction = [TEST_CYCLE_STAGE.PASSED, TEST_CYCLE_STAGE.COMPLETE].includes(card.stage);
  const enter = () => {
    if (previewing) return onPreviewEnter?.(card.stage);
    if (card.stage === TEST_CYCLE_STAGE.REVIEW) return onOpenReview?.(assignmentId);
    if (stageIsSecure(card.stage)) return setMode('secure');
    if (card.stage === TEST_CYCLE_STAGE.CORRECTIONS) return setMode('corrections');
    if (card.reviewExamSessionId) return setMode('review');
    return onExit?.();
  };
  const enabled = card.canEnter && !(isReviewAction && !card.reviewExamSessionId);
  const availability = card.availability || null;
  const review = card.reviewProgress || null;
  // An external-original cycle's one secure session is the retest.
  const noun = card.policy?.external ? 'Retest' : 'Test';
  const reviewSkills = card.stage === TEST_CYCLE_STAGE.REVIEW ? reviewSkillRows(card.reviewBySkill) : [];
  const testSkills = testSkillsSection(card);

  return (
    <section style={shell} data-test-cycle-stage={card.stage} data-availability={availability?.reason || 'open'}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...tone, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999 }}>{card.statusLabel}</span>
        {card.secure && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mm-error-text)' }}>Secure · monitored</span>}
        {card.hintsAllowed && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mm-success-text)' }}>Help allowed</span>}
      </div>
      <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 23px)', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{card.title}</h2>
      <p style={{ margin: 0, color: 'var(--mm-text)', lineHeight: 1.55 }}>{card.detail}</p>

      {availability?.reason === 'scheduled' && availability.opensAt && (
        <p role="status" style={{ margin: 0, padding: '10px 12px', borderRadius: 9, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontWeight: 800 }}>
          Opens {formatDateTime(new Date(availability.opensAt).toISOString())}.
        </p>
      )}

      {card.stage === TEST_CYCLE_STAGE.REVIEW && review && review.total > 0 && (
        <p style={factStyle}>
          Review: {review.attempted} of {review.total} questions answered. {reviewRequirementText(review, noun)}
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
            {/* The minutes are this student's own, extended time included
                (testCycleDeliveryFacts). Answers stay changeable until Submit:
                every secure item is a draft until the session is finalized. */}
            {card.delivery.timed
              ? `${noun} is timed: ${card.delivery.timeLimitMinutes} minutes once you start${Number(card.delivery.extendedTimeMultiplier) > 1 ? ', including your extended time' : ''}.`
              : `${noun} is not timed.`}
            {card.delivery.questionCount ? ` ${card.delivery.questionCount} questions. You can change your answers until you submit.` : ''}
          </p>
        )}
        {/* Only while a retest could still happen. A student who passed is not
            read a cap meant for a failing grade, and once the cycle is finished
            the breakdown above already shows the rule that was applied. */}
        {card.policy?.summary && retestPolicyRelevant(card) && <p style={factStyle}>{card.policy.summary}</p>}
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
        {testReviewId && (
          <button type="button" onClick={() => openTestReview('card')} style={quietButtonStyle}>
            {testReviewLabel(card)}
          </button>
        )}
        {onExit && (
          <button type="button" onClick={onExit} style={quietButtonStyle}>
            Back
          </button>
        )}
      </div>

      {/* How the Review is going, skill by skill — what to practise, not what
          unlocks the Test (the Review line above states the teacher's rule).
          Below the action, like the study guide, so "Continue Review" stays on
          the first screen of a Chromebook. */}
      {reviewSkills.length > 0 && (
        <section aria-labelledby="review-skill-progress" style={{ display: 'grid', gap: 6, paddingTop: 12, borderTop: '1px solid var(--mm-border-soft)', textAlign: 'left' }}>
          <h3 id="review-skill-progress" style={{ margin: 0, fontSize: 14, color: 'var(--mm-text-strong)' }}>How your Review is going</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {reviewSkills.map((skill) => (
              <li key={skill.key} data-review-skill={skill.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '6px 12px', padding: '8px 12px', border: '1px solid var(--mm-border-soft)', borderRadius: 9, background: 'var(--mm-surface-sunken)' }}>
                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <strong style={{ display: 'block', color: 'var(--mm-text-strong)', fontSize: 14, overflowWrap: 'anywhere' }}>{skill.label}</strong>
                  <span style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>{skill.summary}</span>
                </div>
                {onPracticeSkill && skill.canPractise && !previewing && (
                  <button type="button" onClick={() => onPracticeSkill({ alignmentKey: skill.alignmentKey, framework: null, domainId: null })} aria-label={`Practise ${skill.label}`} style={{ ...quietButtonStyle, minHeight: 44, color: 'var(--mm-primary-text)', border: '1px solid var(--mm-primary-border)' }}>
                    Practise this skill
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The study guide: what the next secure session asks about. Below the
          action, so the button that starts it stays on the first screen. */}
      {testSkills && (
        <section aria-labelledby="test-cycle-skills" data-test-skills="" style={{ display: 'grid', gap: 6, paddingTop: 12, borderTop: '1px solid var(--mm-border-soft)', textAlign: 'left' }}>
          <h3 id="test-cycle-skills" style={{ margin: 0, fontSize: 14, color: 'var(--mm-text-strong)' }}>{testSkills.title}</h3>
          {testSkills.note && <p style={{ ...factStyle, color: 'var(--mm-text)' }}>{testSkills.note}</p>}
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, color: 'var(--mm-text)', fontSize: 14, lineHeight: 1.45 }}>
            {testSkills.rows.map((skill) => (
              <li key={skill.key} style={{ overflowWrap: 'anywhere' }}>
                {skill.label}
                {testSkills.showCounts && skill.questionCount > 0 && (
                  <span style={{ color: 'var(--mm-text-muted)' }}> · {skill.questionCount} {skill.questionCount === 1 ? 'question' : 'questions'}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
};

export default TestCycleCard;
