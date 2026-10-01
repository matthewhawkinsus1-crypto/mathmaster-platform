import React from 'react';
import { PRACTICE_PASS, describeExpiry, walletSummaryLine } from '../../../platform/rewards/rewardWallet.js';
import '../../rewards/rewards.css';

/*
 * Home's view of rewards: one line and one button. The full wallet lives on
 * My Rewards so Home stays about what to do next; this card only has to say
 * "you have something" and, when a pass is about to expire, say so.
 */
export default function RewardsSummaryCard({ wallet, unavailable = false, hasNew = false, onOpen, nowMs = Date.now() }) {
  if (unavailable || !wallet?.hasAnything) return null;
  const passes = wallet.practicePasses;
  return (
    <section aria-labelledby="rewards-summary-heading" className={`rw-card rw-card--pass${hasNew ? ' rw-celebrate' : ''}`} style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <h2 id="rewards-summary-heading" style={{ fontSize: 17 }}>
          {PRACTICE_PASS.icon} My Rewards {hasNew && <span className="rw-chip rw-chip--new">New</span>}
        </h2>
        <p className="rw-text" style={{ marginTop: 4 }}>{walletSummaryLine(wallet)}</p>
        {passes.expiringSoonCount > 0 && (
          <p className="rw-chip rw-chip--warn" style={{ marginTop: 6 }}>⏳ A Practice Pass expires {describeExpiry(passes.nextExpiry, nowMs)}</p>
        )}
      </div>
      <button type="button" className="rw-button rw-button--secondary" onClick={onOpen}>Open My Rewards</button>
    </section>
  );
}
