import React, { useEffect, useRef, useState } from 'react';
import RewardDialog from '../../rewards/RewardDialog.jsx';
import {
  classRewardErrorMessage,
  classRewardSuccessMessage,
  describeClassRewardUse,
} from '../../../platform/rewards/classRewardsModel.js';
import { newClassRewardRequestId } from '../../../platform/rewards/classRewardsClient.js';

/*
 * USING A CLASS REWARD: CONFIRM → DONE.
 *
 * The same care as UsePracticePassDialog. The confirm step says what it costs
 * and what happens next, in plain words, before anything is spent. One
 * request id is made when the dialog opens and reused by every retry of it, so
 * a double click, a lost answer and "Try again" all reach the same request on
 * the server and spend once.
 *
 * `entry` is the live shelf entry (classRewardsModel.js buildClassRewardShelf)
 * for this item: if it stops being usable while the dialog is open — the
 * teacher turned it off, the price changed, the balance changed in another tab
 * — the confirm button is disabled and the reason is shown. The price the
 * student agreed to travels with the request, so a price that changed on the
 * server is refused rather than charged.
 */
export default function UseClassRewardDialog({
  item,
  entry = null,
  balance = 0,
  onUse,
  onClose,
}) {
  const [step, setStep] = useState('confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const inFlight = useRef(false);
  const requestId = useRef(newClassRewardRequestId());
  const confirmRef = useRef(null);
  const headingRef = useRef(null);
  // What the student agreed to, fixed when the dialog opened: a live count
  // must not rewrite the sentence they are reading.
  const [agreed] = useState(() => ({ item: { ...item }, balance }));
  const plan = describeClassRewardUse({ item: agreed.item, balance: agreed.balance });

  useEffect(() => {
    if (step === 'done') headingRef.current?.focus();
  }, [step]);

  const liveItem = entry?.item || null;
  const priceChanged = Boolean(liveItem) && Number(liveItem.cost) !== Number(agreed.item.cost);
  const blockedReason = !liveItem
    ? 'Your teacher took this reward off the list.'
    : priceChanged
      ? `The price changed to ${liveItem.cost} points. Close this and look again.`
      : (!entry.canUse ? entry.reason : null);

  const confirm = async () => {
    // A ref, not state: two clicks in the same frame both see busy === false.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await onUse({ itemId: agreed.item.itemId, requestId: requestId.current, expectedCost: Number(agreed.item.cost) });
      setDone(classRewardSuccessMessage({ item: agreed.item, alreadyRequested: result?.outcome === 'alreadyRequested' }));
      setStep('done');
    } catch (useError) {
      setError(classRewardErrorMessage(useError));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Once a try has failed, the server may or may not have the request; the
  // retry is the same request, so it stays allowed even if the live shelf now
  // says "once a week" (that shelf may be counting this very request).
  const disabled = busy || (Boolean(blockedReason) && !error);

  return (
    <RewardDialog titleId="use-class-reward-title" describedById="use-class-reward-description" onClose={onClose} busy={busy} initialFocusRef={confirmRef}>
      {step === 'confirm' && (
        <>
          <h2 id="use-class-reward-title" ref={headingRef} tabIndex={-1}>{plan.question}</h2>
          <div id="use-class-reward-description">
            {agreed.item.description && <p className="rw-text">{agreed.item.description}</p>}
            <p className="rw-text"><strong>{plan.cost}</strong> {plan.remaining}</p>
            <ul className="rw-steps">
              {plan.effects.map((effect) => <li key={effect}>{effect}</li>)}
            </ul>
          </div>
          {blockedReason && !busy && !error && (
            <p className="rw-feedback rw-feedback--info" role="alert">{blockedReason} Nothing was spent.</p>
          )}
          {error && <p className="rw-feedback rw-feedback--bad" role="alert">{error}</p>}
          <div className="rw-actions">
            <button ref={confirmRef} type="button" className="rw-button" disabled={disabled} aria-disabled={disabled} onClick={confirm}>
              {busy ? 'Sending…' : error ? 'Try again' : plan.confirmLabel}
            </button>
            <button type="button" className="rw-button rw-button--quiet" disabled={busy} onClick={onClose}>Cancel</button>
          </div>
          <p className="rw-sr-only" aria-live="polite">{busy ? 'Sending your request…' : ''}</p>
        </>
      )}
      {step === 'done' && (
        <>
          <h2 id="use-class-reward-title" ref={headingRef} tabIndex={-1}>✓ Request sent</h2>
          <p id="use-class-reward-description" className="rw-feedback rw-feedback--ok" role="status">{done}</p>
          <p className="rw-muted">You can see it under “My requests”. If your teacher says no, your points come back.</p>
          <div className="rw-actions">
            <button type="button" className="rw-button" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </RewardDialog>
  );
}
