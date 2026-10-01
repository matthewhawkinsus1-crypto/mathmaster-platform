import React from 'react';
import {
  describeClassPointTransaction,
  emptyClassPointAccount,
} from '../../platform/classPointsClient.js';

/*
 * The Class Points section of My Rewards: balance, totals and recent
 * activity. Read-only. Spending points on a Practice Pass happens in the one
 * Practice Pass flow (rewards/UsePracticePassDialog.jsx), which always uses a
 * pass the student already holds before it spends points.
 */

export default function ClassPointsWallet({
  account = null,
  transactions = [],
  unavailable = false,
}) {
  const totals = account || emptyClassPointAccount();
  return (
    <section aria-labelledby="class-points-heading" className="rw-card rw-card--points">
      <div className="rw-reward-head">
        <span className="rw-reward-icon" aria-hidden="true">⭐</span>
        <div style={{ minWidth: 0 }}>
          <h2 id="class-points-heading">Class Points</h2>
          {unavailable ? (
            <p className="rw-text">Temporarily unavailable. Your assignments still work — check back soon.</p>
          ) : (
            <>
              <div className="rw-count rw-count--points">{totals.balance}<small>points</small></div>
              <div className="rw-muted">Earned {totals.lifetimeEarned} · Used {totals.lifetimeSpent}</div>
            </>
          )}
        </div>
      </div>
      {!unavailable && (transactions.length === 0 ? (
        <p className="rw-muted" style={{ marginTop: 12 }}>You haven&apos;t earned Class Points in this class yet.</p>
      ) : (
        <details className="rw-disclosure">
          <summary>Recent points</summary>
          <ul className="rw-list">
            {transactions.map((transaction, index) => {
              const item = describeClassPointTransaction(transaction);
              return (
                <li key={`${index}-${item.amountLabel}-${item.reasonLabel}`} className="rw-row">
                  <span className="rw-row__main">{item.reasonLabel || item.kindLabel}{item.reasonLabel && item.kind !== 'earned' ? ` · ${item.kindLabel}` : ''}</span>
                  <strong className={item.amount < 0 ? 'rw-muted' : 'rw-chip rw-chip--ok'}>{item.amountLabel}</strong>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      <p className="rw-muted" style={{ margin: '12px 0 0' }}>Earning Class Points does not change your grade or mastery. Rewards such as a Practice Pass may excuse eligible Practice without counting as a correct answer or mastery.</p>
    </section>
  );
}
