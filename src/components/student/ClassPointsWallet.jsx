import React, { useState } from 'react';
import {
  describeClassPointTransaction,
  emptyClassPointAccount,
  PRACTICE_PASS_COST,
  PRACTICE_PASS_EXPLANATION,
  practicePassConfirmationCopy,
  practicePassPointsNeeded,
} from '../../platform/classPointsClient.js';

/**
 * Practice Pass reward card. `eligibleAssignments` and `onRedeemPracticePass`
 * are optional so this component keeps working, unchanged, for a caller that
 * has not wired the reward yet -- there is no reward without them, only the
 * plain wallet PR #259 already shipped.
 *
 * This component NEVER decides eligibility. `eligibleAssignments` is a
 * best-effort UX list the caller already filtered (see
 * src/platform/rewards/practicePassClientEligibility.js); the server
 * (`redeemPracticePass`) is the only authority that grants a waiver, and this
 * card never optimistically subtracts points -- the balance shown is always
 * `account`, which only ever changes when the authoritative subscription
 * updates it.
 */
function PracticePassReward({ balance = 0, eligibleAssignments = [], onRedeemPracticePass = null, redeeming = false }) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const canAfford = Number(balance) >= PRACTICE_PASS_COST;
  const selected = eligibleAssignments.find((entry) => entry.assignmentId === selectedAssignmentId) || null;

  const handleConfirm = async () => {
    if (!selected || !onRedeemPracticePass) return;
    setFeedback(null);
    try {
      await onRedeemPracticePass(selected.assignmentId);
      setConfirming(false);
      setSelectedAssignmentId('');
      setFeedback({ tone: 'success', text: 'Practice Pass used. Practice is excused for this assignment.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error?.message || 'That Practice Pass could not be redeemed.' });
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#3c4043' }}>Practice Pass</strong>
          <span style={{ marginLeft: 8, color: '#5f6368', fontWeight: 800 }}>{PRACTICE_PASS_COST} points</span>
        </div>
      </div>
      <p style={{ margin: '6px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.5 }}>{PRACTICE_PASS_EXPLANATION}</p>

      {!canAfford && (
        <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 13 }}>
          You need {practicePassPointsNeeded(balance)} more Class Points.
        </p>
      )}

      {canAfford && !confirming && (
        eligibleAssignments.length === 0 ? (
          <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 13 }}>
            No assignments are currently eligible for a Practice Pass.
          </p>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              aria-label="Choose an assignment for a Practice Pass"
              value={selectedAssignmentId}
              onChange={(event) => setSelectedAssignmentId(event.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #c9ced6', minWidth: 200 }}
            >
              <option value="">Choose an assignment…</option>
              {eligibleAssignments.map((entry) => (
                <option key={entry.assignmentId} value={entry.assignmentId}>{entry.title}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedAssignmentId}
              onClick={() => setConfirming(true)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: 0, fontWeight: 800, cursor: selectedAssignmentId ? 'pointer' : 'not-allowed',
                background: selectedAssignmentId ? '#7b1fa2' : '#e0e0e0', color: selectedAssignmentId ? '#fff' : '#9aa0a6',
              }}
            >
              Use Practice Pass
            </button>
          </div>
        )
      )}

      {confirming && selected && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#f3e8fd', border: '1px solid #d6b8f5' }}>
          <p style={{ margin: 0, color: '#3c4043', fontWeight: 700 }}>{practicePassConfirmationCopy(selected.title).question}</p>
          <p style={{ margin: '6px 0 0', color: '#5f6368', fontSize: 13 }}>{practicePassConfirmationCopy(selected.title).reassurance}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              disabled={redeeming}
              onClick={handleConfirm}
              style={{ padding: '8px 14px', borderRadius: 8, border: 0, fontWeight: 800, cursor: 'pointer', background: '#7b1fa2', color: '#fff' }}
            >
              {redeeming ? 'Using…' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={redeeming}
              onClick={() => setConfirming(false)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #c9ced6', fontWeight: 800, cursor: 'pointer', background: '#fff', color: '#3c4043' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: feedback.tone === 'error' ? '#b3261e' : '#137333' }}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}

export default function ClassPointsWallet({
  account = null,
  transactions = [],
  unavailable = false,
  eligibleAssignments = [],
  onRedeemPracticePass = null,
  redeeming = false,
}) {
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
      {!unavailable && (
        <PracticePassReward
          balance={totals.balance}
          eligibleAssignments={eligibleAssignments}
          onRedeemPracticePass={onRedeemPracticePass}
          redeeming={redeeming}
        />
      )}
      <p style={{ margin: '16px 0 0', paddingTop: 12, borderTop: '1px solid #eee', color: '#5f6368', fontSize: 13 }}>Earning Class Points does not change your grade or mastery. Rewards such as a Practice Pass may excuse eligible Practice without counting as a correct answer or mastery.</p>
    </section>
  );
}
