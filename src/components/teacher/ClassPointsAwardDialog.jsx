import { useRef, useState } from 'react';
import {
  DEFAULT_REASON_LABELS,
  MAX_AWARD_AMOUNT,
  QUICK_AWARD_AMOUNTS,
  REASON_CODES,
  awardClassPoints,
  buildAwardPayload,
  createRequestIdController,
} from '../../platform/classPointsClient.js';

// Compact teacher-only award control: quick enough to use walking around the
// room. Every award is one INTENDED action carrying exactly one requestId —
// see createRequestIdController in classPointsClient.js for the retry/resubmit
// contract this dialog implements.
//
// This dialog only ever calls awardClassPoints. It never writes
// classPointAccounts/classPointTransactions itself, never touches grades,
// mastery, evidence, presence, or Live Challenge scoring, and never invents a
// balance — the tile's displayed balance only ever moves once the account
// subscription in LiveClassMonitor.jsx sees the authoritative new total.

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 10030, background: 'rgba(32,33,36,0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const dialogStyle = {
  width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16,
  boxShadow: '0 24px 70px rgba(0,0,0,.28)', overflow: 'hidden', textAlign: 'left',
};
const bodyStyle = { padding: '18px 20px', display: 'grid', gap: 14 };
const amountButtonStyle = (selected) => ({
  padding: '8px 0', minWidth: 44, borderRadius: 9, fontWeight: 900, fontSize: 14, cursor: 'pointer',
  border: selected ? '2px solid #1a73e8' : '1px solid #d8dde6',
  background: selected ? '#e8f0fe' : '#fff', color: selected ? '#174ea6' : '#202124',
});
const fieldLabelStyle = { fontWeight: 800, fontSize: 12, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '.04em' };
const selectStyle = { padding: '9px 10px', borderRadius: 8, border: '1px solid #d8dde6', fontSize: 14, width: '100%' };

export default function ClassPointsAwardDialog({ student, classId, teacherEmail, onClose, onAwarded = null }) {
  const [amount, setAmount] = useState(QUICK_AWARD_AMOUNTS[0]);
  const [customAmount, setCustomAmount] = useState('');
  const [usingCustomAmount, setUsingCustomAmount] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [customReasonLabel, setCustomReasonLabel] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const requestControllerRef = useRef(createRequestIdController());

  const effectiveAmount = usingCustomAmount ? Number(customAmount) : amount;
  const reasonLabel = reasonCode === 'custom' ? customReasonLabel.trim() : DEFAULT_REASON_LABELS[reasonCode];

  const chooseQuickAmount = (value) => {
    setUsingCustomAmount(false);
    setAmount(value);
    // Changing WHAT is being chosen is a different intended action from
    // whatever was pending before — never reuse a stale requestId across it.
    if (!submitting) requestControllerRef.current.reset();
  };
  const chooseCustomAmount = (value) => {
    setUsingCustomAmount(true);
    setCustomAmount(value);
    if (!submitting) requestControllerRef.current.reset();
  };
  const chooseReason = (value) => {
    setReasonCode(value);
    if (!submitting) requestControllerRef.current.reset();
  };

  const submit = async () => {
    if (submitting) return; // guards a rapid double click on top of the disabled button below
    setError('');

    let payload;
    try {
      payload = buildAwardPayload({
        studentId: student?.id,
        classId,
        amount: effectiveAmount,
        reasonCode,
        reasonLabel,
        requestId: requestControllerRef.current.next(),
        announce,
      });
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setSubmitting(true);
    try {
      const response = await awardClassPoints(payload);
      requestControllerRef.current.resolveSuccess();
      setResult({ amount: payload.amount, reasonLabel: payload.reasonLabel });
      onAwarded?.(response);
    } catch (callError) {
      // Do NOT reset the requestId here — an uncertain network/callable
      // failure must retry as the SAME intended action, per the idempotency
      // contract. The teacher's Retry button below reuses it.
      setError(callError?.message || 'Could not award Class Points. Check the connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose?.(); }}
      style={overlayStyle}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="class-points-award-title" style={dialogStyle}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8eaed' }}>
          <div style={{ color: '#7a4f00', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Class Points</div>
          <h2 id="class-points-award-title" style={{ margin: '4px 0 0', fontSize: 18, color: '#202124' }}>Award {student?.name || 'this student'}</h2>
        </div>

        {result ? (
          <div style={bodyStyle}>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#e6f4ea', color: '#137333', fontWeight: 800 }}>
              ⭐ Awarded +{result.amount} pts to {student?.name || 'this student'} for {result.reasonLabel}.
            </div>
            <button type="button" onClick={onClose} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #188038', background: '#188038', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Done</button>
          </div>
        ) : (
          <div style={bodyStyle}>
            <div>
              <div style={fieldLabelStyle}>Amount</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {QUICK_AWARD_AMOUNTS.map((value) => (
                  <button key={value} type="button" disabled={submitting} onClick={() => chooseQuickAmount(value)} style={amountButtonStyle(!usingCustomAmount && amount === value)}>+{value}</button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={MAX_AWARD_AMOUNT}
                  step={1}
                  placeholder="Custom"
                  aria-label="Custom point amount"
                  disabled={submitting}
                  value={customAmount}
                  onChange={(event) => chooseCustomAmount(event.target.value)}
                  style={{ ...selectStyle, width: 84, ...(usingCustomAmount ? { border: '2px solid #1a73e8' } : {}) }}
                />
                <span style={{ fontSize: 11.5, color: '#80868b' }}>up to {MAX_AWARD_AMOUNT}</span>
              </div>
            </div>

            <div>
              <label htmlFor="class-points-reason" style={fieldLabelStyle}>Reason</label>
              <select
                id="class-points-reason"
                value={reasonCode}
                disabled={submitting}
                onChange={(event) => chooseReason(event.target.value)}
                style={{ ...selectStyle, marginTop: 6 }}
              >
                <option value="">Choose a reason…</option>
                {REASON_CODES.map((code) => <option key={code} value={code}>{DEFAULT_REASON_LABELS[code]}</option>)}
              </select>
              {reasonCode === 'custom' && (
                <input
                  type="text"
                  placeholder="Short custom reason"
                  aria-label="Custom reason"
                  disabled={submitting}
                  value={customReasonLabel}
                  maxLength={140}
                  onChange={(event) => { setCustomReasonLabel(event.target.value); if (!submitting) requestControllerRef.current.reset(); }}
                  style={{ ...selectStyle, marginTop: 8 }}
                />
              )}
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: '#3c4043', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={announce}
                disabled={submitting}
                onChange={(event) => setAnnounce(event.target.checked)}
              />
              Celebrate with class
            </label>

            {error && (
              <div role="alert" style={{ padding: '9px 11px', borderRadius: 8, background: '#fce8e6', color: '#b3261e', fontSize: 13, fontWeight: 700 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" disabled={submitting} onClick={onClose} style={{ padding: '9px 13px', borderRadius: 8, border: '1px solid #d8dde6', background: '#fff', color: '#3c4043', fontWeight: 800, cursor: submitting ? 'wait' : 'pointer' }}>Cancel</button>
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                style={{ padding: '9px 15px', borderRadius: 8, border: '1px solid #188038', background: submitting ? '#9fc9ac' : '#188038', color: '#fff', fontWeight: 900, cursor: submitting ? 'wait' : 'pointer' }}
              >
                {submitting ? (error ? 'Retrying…' : 'Awarding…') : error ? 'Retry' : `Award${Number.isFinite(effectiveAmount) && effectiveAmount > 0 ? ` +${effectiveAmount}` : ''}`}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#9aa0a6' }}>Signed in as {teacherEmail || 'your teacher account'}</div>
          </div>
        )}
      </section>
    </div>
  );
}
