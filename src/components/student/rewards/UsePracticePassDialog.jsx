import React, { useEffect, useRef, useState } from 'react';
import RewardDialog from '../../rewards/RewardDialog.jsx';
import {
  PRACTICE_PASS,
  describeExpiry,
  describePracticePassUse,
  formatRewardDate,
  practicePassErrorMessage,
  practicePassSuccessMessage,
} from '../../../platform/rewards/rewardWallet.js';

/*
 * USING A PRACTICE PASS: PICK → CONFIRM → DONE.
 *
 * Three deliberate steps so a student can never spend something by accident:
 * the confirm step says exactly what will happen, in plain words, and what it
 * costs (a pass they hold first; 100 Class Points only when they hold none).
 *
 * This dialog decides nothing about eligibility — `eligibleAssignments` is the
 * caller's best-effort list (practicePassClientEligibility.js) and the server
 * is the only authority. It never shows a count it has not been told: the
 * wallet's numbers only change when the authoritative listener does. And a
 * failure always says that nothing was used, because nothing was — the server
 * writes the pass and the waiver in one transaction or not at all.
 */
export default function UsePracticePassDialog({
  wallet,
  eligibleAssignments = [],
  onUse,
  onClose,
  initialAssignmentId = '',
  nowMs = Date.now(),
}) {
  const [step, setStep] = useState(initialAssignmentId ? 'confirm' : 'choose');
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const inFlight = useRef(false);
  const confirmRef = useRef(null);
  const headingRef = useRef(null);
  const firstStep = useRef(true);

  // Each step announces itself: focus moves to its heading so a screen reader
  // reads the new question (the first step is focused by the dialog itself).
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  // The assignment the student picked, kept as they saw it: the eligible list
  // is live, and an assignment can drop out of it while this dialog is open
  // (Practice answered in another tab, the final deadline passing). The
  // confirm step must then say so, not go blank.
  const [chosen, setChosen] = useState(() => eligibleAssignments.find((entry) => entry.assignmentId === initialAssignmentId) || null);
  const stillEligible = Boolean(chosen && eligibleAssignments.some((entry) => entry.assignmentId === chosen.assignmentId));
  const selected = step === 'choose'
    ? eligibleAssignments.find((entry) => entry.assignmentId === assignmentId) || null
    : chosen;
  // How the student agreed to pay, also fixed at Next: a retry after a lost
  // answer must ask for the same thing, not switch to Class Points because
  // the pass the first attempt spent is gone from the live count.
  const [agreedPayment, setAgreedPayment] = useState(wallet.payment);
  // The count the student saw when they agreed, so "N left" is not computed
  // from a live count that may already include this very use.
  const [passesWhenAgreed, setPassesWhenAgreed] = useState(wallet.practicePasses.count);
  const payment = step === 'choose' ? wallet.payment : agreedPayment;
  const plan = describePracticePassUse({
    wallet: step === 'choose' ? wallet : { ...wallet, payment, practicePasses: { ...wallet.practicePasses, count: passesWhenAgreed } },
    assignmentTitle: selected?.title,
  });
  const canPay = payment !== null;

  const confirm = async () => {
    // A ref, not state: two clicks in the same frame both see busy === false.
    if (inFlight.current || !selected || !canPay) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await onUse({ assignmentId: selected.assignmentId, payWith: payment, grantId: payment === 'pass' ? wallet.practicePasses.nextToUse?.grantId || null : null });
      setDone(practicePassSuccessMessage({
        assignmentTitle: selected.title,
        passesLeft: payment === 'pass' ? Math.max(0, passesWhenAgreed - 1) : null,
        alreadyExcused: result?.outcome === 'alreadyExcused',
      }));
      setStep('done');
    } catch (useError) {
      setError(practicePassErrorMessage(useError));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <RewardDialog titleId="use-pass-title" describedById="use-pass-description" onClose={onClose} busy={busy} initialFocusRef={initialAssignmentId ? confirmRef : null}>
      {step === 'choose' && (
        <>
          <h2 id="use-pass-title" ref={headingRef} tabIndex={-1}>{PRACTICE_PASS.icon} Use a Practice Pass</h2>
          <p id="use-pass-description" className="rw-text">{PRACTICE_PASS.studentDescription}</p>
          {eligibleAssignments.length === 0 ? (
            <p className="rw-feedback rw-feedback--info" role="status">
              None of your assignments can use a Practice Pass right now.
            </p>
          ) : (
            <fieldset style={{ border: 0, padding: 0, margin: '14px 0 0' }}>
              <legend className="rw-row__title" style={{ marginBottom: 8 }}>Which assignment?</legend>
              <div style={{ display: 'grid', gap: 8 }}>
                {eligibleAssignments.map((entry) => {
                  const checked = entry.assignmentId === assignmentId;
                  return (
                    <label key={entry.assignmentId} className={`rw-choice${checked ? ' rw-choice--selected' : ''}`}>
                      <input
                        type="radio"
                        name="practice-pass-assignment"
                        value={entry.assignmentId}
                        checked={checked}
                        onChange={() => setAssignmentId(entry.assignmentId)}
                      />
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        <span className="rw-row__title">{entry.title}</span>
                        {entry.dueAt && <span className="rw-muted" style={{ display: 'block' }}>Due {formatRewardDate(entry.dueAt, nowMs)}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          <details className="rw-disclosure">
            <summary>Why isn&apos;t my assignment here?</summary>
            <ul className="rw-steps rw-muted">
              <li>You already answered a Practice question on it.</li>
              <li>It has no Practice section, or it is a quiz or test.</li>
              <li>It is past its final deadline, or not open yet.</li>
              <li>Practice is already excused, or your teacher turned passes off for it.</li>
            </ul>
          </details>
          <div className="rw-actions">
            <button type="button" className="rw-button" disabled={!selected || !canPay} onClick={() => { setChosen(selected); setAgreedPayment(wallet.payment); setPassesWhenAgreed(wallet.practicePasses.count); setError(''); setStep('confirm'); }}>Next</button>
            <button type="button" className="rw-button rw-button--quiet" onClick={onClose}>Cancel</button>
          </div>
        </>
      )}

      {step === 'confirm' && selected && (
        <>
          <h2 id="use-pass-title" ref={headingRef} tabIndex={-1}>{plan.question}</h2>
          <div id="use-pass-description">
            <p className="rw-text"><strong>{plan.cost}</strong> {plan.remaining}</p>
            {payment === 'pass' && wallet.practicePasses.nextExpiry && (
              <p className="rw-muted">The pass that expires first ({describeExpiry(wallet.practicePasses.nextExpiry, nowMs)}) is used.</p>
            )}
            <ul className="rw-steps">
              {plan.effects.map((effect) => <li key={effect}>{effect}</li>)}
            </ul>
          </div>
          {!stillEligible && !busy && !error && (
            <p className="rw-feedback rw-feedback--info" role="alert">
              {selected.title} can&apos;t use a Practice Pass anymore — its Practice was started, or it closed. Nothing was used. Go back to pick another assignment.
            </p>
          )}
          {error && <p className="rw-feedback rw-feedback--bad" role="alert">{error}</p>}
          <div className="rw-actions">
            <button ref={confirmRef} type="button" className="rw-button" disabled={busy || (!stillEligible && !error)} aria-disabled={busy || (!stillEligible && !error)} onClick={confirm}>
              {busy ? 'Using…' : error ? 'Try again' : plan.confirmLabel}
            </button>
            <button type="button" className="rw-button rw-button--quiet" disabled={busy} onClick={() => (initialAssignmentId ? onClose() : setStep('choose'))}>
              {initialAssignmentId ? 'Cancel' : 'Back'}
            </button>
          </div>
          <p className="rw-sr-only" aria-live="polite">{busy ? 'Using your Practice Pass…' : ''}</p>
        </>
      )}

      {step === 'done' && (
        <>
          <h2 id="use-pass-title" ref={headingRef} tabIndex={-1}>✓ Practice Pass used</h2>
          <p id="use-pass-description" className="rw-feedback rw-feedback--ok" role="status">{done}</p>
          <p className="rw-muted">Your assignment list and grades now show Practice as Excused.</p>
          <div className="rw-actions">
            <button type="button" className="rw-button" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </RewardDialog>
  );
}
