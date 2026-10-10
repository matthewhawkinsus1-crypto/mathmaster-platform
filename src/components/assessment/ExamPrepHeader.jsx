import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getExamPolicy } from '../../platform/policies/examPolicyResolver.js';

const formatTime = (seconds) => {
  if (seconds == null) return 'Untimed';
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

// Exported so the exam's tool launchers (reference sheet, graphing
// calculator) sit in the toolbar looking like its own controls.
export const EXAM_HEADER_CONTROL = Object.freeze({
  minHeight: 44, padding: '7px 11px', borderRadius: 7, border: '1px solid #5f6368',
  background: '#303134', color: '#fff', fontWeight: 800, cursor: 'pointer',
});
const control = EXAM_HEADER_CONTROL;

export const ExamPrepHeader = ({
  examType,
  title = null,
  // The number of the question on screen (1-based), not how many are answered.
  questionOrdinal = 1,
  totalQuestions = null,
  expiresAt = null,
  // A teacher's pause: the server stopped the clock at this much time left.
  clockPaused = false,
  pausedRemainingSeconds = null,
  onTimeExpired,
  reviewFlagged = false,
  onToggleReviewFlag,
  // Opens the question list. Without it the position is plain text.
  onOpenNavigator = null,
  navigatorOpen = false,
  // The id of the question list panel this button expands.
  navigatorId = null,
  // The exam's own tools (reference sheet, graphing calculator), when it
  // offers any. They replace the static reference-sheet note.
  tools = null,
  // The session's time includes the student's extended-time accommodation.
  extendedTime = false,
}) => {
  const policy = getExamPolicy(examType);
  /*
   * THE SERVER'S DEADLINE IS THE ONLY CLOCK.
   *
   * This used to invent one when the session carried none: `Date.now()` plus
   * the policy's limit, restarted on every mount. For a course test (whose
   * policy fell back to the SAT's) that was a 70-minute countdown on an
   * UNTIMED test, which then tried to end the exam at 0:00 and was refused by
   * the server. A timed session always carries `expiresAt`; a session without
   * one is untimed, and says so.
   */
  const initialDeadline = useMemo(() => (expiresAt ? Number(expiresAt) : null), [expiresAt]);
  const [secondsRemaining, setSecondsRemaining] = useState(() => initialDeadline == null ? null : Math.max(0, (initialDeadline - Date.now()) / 1000));
  const [timerHidden, setTimerHidden] = useState(false);
  const firedRef = useRef(false);
  // The container hands a new callback on every render. The countdown must
  // not restart (and re-fire at 0:00) because of that, only for a new deadline.
  const onTimeExpiredRef = useRef(onTimeExpired);
  onTimeExpiredRef.current = onTimeExpired;

  useEffect(() => {
    firedRef.current = false;
    if (initialDeadline == null) { setSecondsRemaining(null); return undefined; }
    // Stopped, not counting: the time left is the server's, and nothing ends the test.
    if (clockPaused) {
      const frozen = Number(pausedRemainingSeconds);
      setSecondsRemaining(Number.isFinite(frozen) ? Math.max(0, frozen) : Math.max(0, (initialDeadline - Date.now()) / 1000));
      return undefined;
    }
    const tick = () => {
      const next = Math.max(0, (initialDeadline - Date.now()) / 1000);
      setSecondsRemaining(next);
      if (next <= 0 && !firedRef.current) { firedRef.current = true; onTimeExpiredRef.current?.(); }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [initialDeadline, clockPaused, pausedRemainingSeconds]);

  const forceVisible = secondsRemaining != null && secondsRemaining <= 5 * 60;
  // The timer button's name says what it shows and what pressing it does.
  const timerLabel = secondsRemaining == null
    ? 'Untimed test'
    : timerHidden && !forceVisible
      ? 'Show the timer'
      : `Time left ${formatTime(secondsRemaining)}${clockPaused ? ', stopped while your teacher has the test paused' : ''}. ${forceVisible ? 'Shown for the last five minutes' : 'Hide the timer'}`;
  const total = totalQuestions || policy.totalQuestions;
  const position = `Question ${questionOrdinal} of ${total}`;
  return (
    <header data-secure-exam-header="" style={{ minHeight: 60, padding: '10px 16px', boxSizing: 'border-box', background: '#202124', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, display: 'grid', gap: 4, justifyItems: 'start' }}>
        <strong style={{ overflowWrap: 'anywhere' }}>{title || policy.title}</strong>
        {onOpenNavigator
          ? (
            <button
              type="button"
              onClick={onOpenNavigator}
              // Escape on the button closes the list it opened, as Escape inside the list does.
              onKeyDown={(event) => { if (event.key === 'Escape' && navigatorOpen) { event.preventDefault(); onOpenNavigator(); } }}
              aria-expanded={navigatorOpen}
              aria-controls={navigatorOpen && navigatorId ? navigatorId : undefined}
              data-secure-navigator-toggle=""
              style={{ ...control, padding: '6px 11px', fontSize: 14 }}
            >
              {position} <span aria-hidden="true">▾</span>
            </button>
          )
          : <div style={{ fontSize: 12, color: '#bdc1c6' }}>{position}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" data-secure-timer="" aria-label={timerLabel} onClick={() => setTimerHidden((value) => !value)} disabled={forceVisible || secondsRemaining == null} style={{ ...control, fontWeight: 700, cursor: forceVisible || secondsRemaining == null ? 'default' : 'pointer' }}>
          {secondsRemaining == null ? 'Untimed' : timerHidden && !forceVisible ? 'Show timer' : `${formatTime(secondsRemaining)}${clockPaused ? ' · stopped' : ''}`}
        </button>
        {extendedTime && secondsRemaining != null && <span style={{ padding: '7px 10px', borderRadius: 7, background: '#303134', color: '#e8eaed', fontSize: 12 }}>Includes your extended time</span>}
        {onToggleReviewFlag && (
          <button type="button" onClick={onToggleReviewFlag} aria-pressed={reviewFlagged} style={{ ...control, background: reviewFlagged ? 'var(--mm-warning-soft)' : '#303134', color: reviewFlagged ? 'var(--mm-warning-text)' : '#fff' }}>
            {reviewFlagged ? '★ Marked for review' : '☆ Mark for review'}
          </button>
        )}
        {tools}
        {!tools && policy.examType !== 'courseTest' && policy.formulaSheet === 'none' && <span style={{ padding: '7px 10px', borderRadius: 7, background: '#303134', color: '#e8eaed', fontSize: 12 }}>No formula sheet</span>}
      </div>
    </header>
  );
};

export default ExamPrepHeader;
