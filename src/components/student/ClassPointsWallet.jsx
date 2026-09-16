import React from 'react';
import { describeClassPointTransaction, emptyClassPointAccount } from '../../platform/classPointsClient.js';

export default function ClassPointsWallet({ account = null, transactions = [], unavailable = false }) {
  const totals = account || emptyClassPointAccount();
  return (
    <section aria-labelledby="class-points-heading" style={{ marginBottom: 18, padding: '22px 24px', borderRadius: 16, background: '#fff', border: '2px solid #f6c344', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#7a4f00', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' }}>Class Points</div>
          <h2 id="class-points-heading" style={{ margin: '4px 0', color: '#202124', fontSize: 25 }}>⭐ {unavailable ? 'Temporarily unavailable' : `${totals.balance} points available`}</h2>
        </div>
        {!unavailable && <div style={{ color: '#5f6368', fontWeight: 800 }}>Earned: {totals.lifetimeEarned} &nbsp;·&nbsp; Used: {totals.lifetimeSpent}</div>}
      </div>
      {unavailable ? (
        <p style={{ marginBottom: 0, color: '#5f6368' }}>Your assignments are still available. Please check your Class Points again soon.</p>
      ) : transactions.length === 0 ? (
        <p style={{ marginBottom: 0, color: '#5f6368' }}>You haven't earned Class Points in this class yet.</p>
      ) : (
        <div style={{ marginTop: 16 }}>
          <strong style={{ color: '#3c4043' }}>Recent activity</strong>
          <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
            {transactions.map((transaction, index) => {
              const item = describeClassPointTransaction(transaction);
              return <li key={`${index}-${item.amountLabel}-${item.reasonLabel}`} style={{ color: '#3c4043' }}><strong style={{ color: item.amount < 0 ? '#5f6368' : '#137333' }}>{item.amountLabel}</strong> · {item.reasonLabel || item.kindLabel}{item.reasonLabel && item.kind !== 'earned' ? ` · ${item.kindLabel}` : ''}</li>;
            })}
          </ul>
        </div>
      )}
      <p style={{ margin: '16px 0 0', paddingTop: 12, borderTop: '1px solid #eee', color: '#5f6368', fontSize: 13 }}>Class Points are classroom rewards. They do not change your MathMaster grade or mastery.</p>
    </section>
  );
}
