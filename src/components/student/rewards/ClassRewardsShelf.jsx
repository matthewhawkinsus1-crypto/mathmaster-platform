import React, { useMemo, useRef, useState } from 'react';
import UseClassRewardDialog from './UseClassRewardDialog.jsx';
import { buildClassRewardShelf, describeClassRewardRequest } from '../../../platform/rewards/classRewardsModel.js';
import { formatRewardDate } from '../../../platform/rewards/rewardWallet.js';

/*
 * CLASS REWARDS ON MY REWARDS: what my teacher offers, and what I asked for.
 *
 * Each item says its price and, when it cannot be used right now, why — on
 * the screen, not only on a disabled button: "You need 20 more Class Points",
 * "You already used this one this week. It resets on Monday." A request
 * shows its status in words (Waiting for your teacher / Done / Declined —
 * points returned, with the teacher's reason).
 *
 * Presentational: the shelf is built from live data (classRewardsModel.js),
 * and the only action — using one — goes through `onRedeem`, which calls the
 * server. Nothing counts down here optimistically.
 */
const CHIP = Object.freeze({ ok: 'rw-chip rw-chip--ok', warn: 'rw-chip rw-chip--warn', pass: 'rw-chip rw-chip--pass' });
const FINISHED_SHOWN = 5;

function RequestRow({ request, nowMs }) {
  const view = describeClassRewardRequest(request);
  const when = request.resolvedAt || request.requestedAt;
  return (
    <li className="rw-row">
      <span className="rw-row__main">
        <span className="rw-row__title">{view.title}</span>
        <span className="rw-muted" style={{ display: 'block' }}>{view.detail}</span>
      </span>
      <span style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
        <span className={CHIP[view.chip]}>{view.status}</span>
        <span className="rw-muted">{formatRewardDate(when, nowMs)}</span>
      </span>
    </li>
  );
}

export default function ClassRewardsShelf({
  catalog = null,
  requests = [],
  balance = 0,
  balanceKnown = true,
  unavailable = false,
  onRedeem,
  nowMs = Date.now(),
}) {
  const [openItemId, setOpenItemId] = useState(null);
  const requestsHeadingRef = useRef(null);
  const shelf = useMemo(
    () => buildClassRewardShelf({ catalog, requests, balance, balanceKnown, nowMs }),
    [catalog, requests, balance, balanceKnown, nowMs],
  );
  const [agreedItem, setAgreedItem] = useState(null);

  if (unavailable) {
    return (
      <section aria-labelledby="class-rewards-heading" className="rw-card">
        <h2 id="class-rewards-heading">🎁 Class rewards</h2>
        <p className="rw-feedback rw-feedback--info" role="status">Class rewards could not load right now. Your points are safe — check again in a minute.</p>
      </section>
    );
  }
  if (!shelf.hasAnything) return null;

  const openEntry = openItemId ? shelf.items.find((entry) => entry.item.itemId === openItemId) || null : null;

  return (
    <section aria-labelledby="class-rewards-heading" className="rw-card">
      <h2 id="class-rewards-heading">🎁 Class rewards</h2>
      <p className="rw-text">Your teacher&apos;s rewards for this class. Spend Class Points, then your teacher gives you the reward in class. None of these change a grade.</p>
      {shelf.items.length > 0 ? (
        <ul className="rw-list" aria-label="Rewards you can use">
          {shelf.items.map((entry) => {
            const reasonId = `class-reward-reason-${entry.item.itemId}`;
            return (
              <li key={entry.item.itemId} className="rw-row" data-qa="class-reward-item">
                <span className="rw-row__main">
                  <span className="rw-row__title">{entry.item.label}</span>
                  {entry.item.description && <span className="rw-muted" style={{ display: 'block' }}>{entry.item.description}</span>}
                  <span className="rw-muted" style={{ display: 'block' }}>
                    {[`${entry.item.cost} Class Points`, entry.limitLabel, entry.limit ? `used ${entry.usedThisWeek} of ${entry.limit} this week` : null].filter(Boolean).join(' · ')}
                  </span>
                  {!entry.canUse && entry.reason && (
                    <span id={reasonId} className="rw-chip rw-chip--warn" style={{ marginTop: 6 }}>{entry.reason}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="rw-button rw-button--secondary rw-button--small"
                  disabled={!entry.canUse}
                  aria-describedby={!entry.canUse && entry.reason ? reasonId : undefined}
                  onClick={() => { setAgreedItem(entry.item); setOpenItemId(entry.item.itemId); }}
                >
                  {entry.buttonLabel}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rw-muted">Your teacher has no class rewards on the list right now.</p>
      )}

      {(shelf.pending.length > 0 || shelf.finished.length > 0) && (
        <>
          <h3 ref={requestsHeadingRef} tabIndex={-1} style={{ marginTop: 16 }}>My requests</h3>
          {/* Waiting first, then the most recent finished ones — visible, not
              folded away, so a decline and its reason are seen. */}
          <ul className="rw-list" aria-label="My requests">
            {[...shelf.pending, ...shelf.finished.slice(0, FINISHED_SHOWN)].map((request) => (
              <RequestRow key={request.requestDocId} request={request} nowMs={nowMs} />
            ))}
          </ul>
        </>
      )}

      {openItemId && agreedItem && (
        <UseClassRewardDialog
          item={agreedItem}
          entry={openEntry}
          balance={balance}
          onUse={onRedeem}
          onClose={() => {
            setOpenItemId(null);
            setAgreedItem(null);
            // The dialog hands focus back to the button that opened it — which
            // a request just used up may have disabled, leaving focus on the
            // page. Then keyboard users land on the request they just made.
            window.setTimeout(() => {
              const active = document.activeElement;
              if (!active || active === document.body || active.disabled) requestsHeadingRef.current?.focus();
            }, 0);
          }}
        />
      )}
    </section>
  );
}
