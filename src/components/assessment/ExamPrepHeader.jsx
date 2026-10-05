import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getExamPolicy } from '../../platform/policies/examPolicyResolver.js';

const formatTime = (seconds) => {
  if (seconds == null) return 'Untimed';
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

export const ExamPrepHeader = ({ examType, title = null, questionOrdinal = 1, totalQuestions = null, expiresAt = null, onTimeExpired, reviewFlagged = false, onToggleReviewFlag }) => {
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

  useEffect(() => {
    firedRef.current = false;
    if (initialDeadline == null) { setSecondsRemaining(null); return undefined; }
    const tick = () => {
      const next = Math.max(0, (initialDeadline - Date.now()) / 1000);
      setSecondsRemaining(next);
      if (next <= 0 && !firedRef.current) { firedRef.current = true; onTimeExpired?.(); }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [initialDeadline, onTimeExpired]);

  const forceVisible = secondsRemaining != null && secondsRemaining <= 5 * 60;
  return <header style={{ minHeight: 60, padding: '10px 16px', boxSizing: 'border-box', background: '#202124', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><div><strong>{title || policy.title}</strong><div style={{ fontSize: 12, color: '#bdc1c6' }}>Question {questionOrdinal} of {totalQuestions || policy.totalQuestions}</div></div><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" onClick={() => setTimerHidden((value) => !value)} disabled={forceVisible || secondsRemaining == null} style={{ minHeight: 40, padding: '7px 11px', borderRadius: 7, border: '1px solid #5f6368', background: '#303134', color: '#fff' }}>{secondsRemaining == null ? 'Untimed' : timerHidden && !forceVisible ? 'Show timer' : formatTime(secondsRemaining)}</button>{onToggleReviewFlag && <button type="button" onClick={onToggleReviewFlag} style={{ minHeight: 40, padding: '7px 11px', borderRadius: 7, border: '1px solid #5f6368', background: reviewFlagged ? 'var(--mm-warning-soft)' : '#303134', color: reviewFlagged ? 'var(--mm-warning-text)' : '#fff' }}>{reviewFlagged ? '★ Review flagged' : '☆ Mark for review'}</button>}{policy.examType !== 'courseTest' && <span style={{ padding: '7px 10px', borderRadius: 7, background: '#303134', color: '#e8eaed', fontSize: 12 }}>{policy.formulaSheet === 'none' ? 'No formula sheet' : 'Reference sheet available'}</span>}</div></header>;
};

export default ExamPrepHeader;
