import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../firebase.js';
import { STUDENT_NAME_UNAVAILABLE, formatStudentLabel, resolveRosterStudentName } from '../../platform/studentName.js';
import {
  DEFAULT_REVERSAL_REASON,
  buildReversalPayload,
  classPointsTimestampMillis,
  createRequestIdController,
  isReversibleTeacherAward,
  reverseClassPointAward,
  reversedAwardTransactionIds,
  sourceTypeLabel,
  watchClassPointHistory,
} from '../../platform/classPointsClient.js';

// The roster name, or "Name unavailable · ID x" so two nameless students stay
// distinguishable — never the bare id standing in for a name.
// While the room tiles are projected (showStudentId false) no id is shown.
const rosterStudentLabel = (studentId, students, historicalName = '', showStudentId = true) => {
  const name = resolveRosterStudentName({ studentId, students, historicalName });
  if (name !== STUDENT_NAME_UNAVAILABLE || !showStudentId) return name;
  return formatStudentLabel(String(studentId ?? ''));
};

// Compact, bounded recent-activity panel for the active class. It reads only
// classPointTransactions through the shared, indexed teacher query — never an
// unbounded scan — and its one write path is reverseClassPointAward. It never
// edits or deletes a ledger entry directly, and it never touches grades,
// mastery, evidence, presence, or Live Challenge scoring.

const rowStyle = { padding: '9px 10px', borderRadius: 9, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' };
const smallButtonStyle = { padding: '5px 8px', borderRadius: 7, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' };

const formatWhen = (value) => {
  const millis = classPointsTimestampMillis(value);
  if (!millis) return '';
  return new Date(millis).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function ReversalControl({ transaction }) {
  const [confirming, setConfirming] = useState(false);
  const [reasonText, setReasonText] = useState(DEFAULT_REVERSAL_REASON);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const controllerRef = useRef(createRequestIdController());

  if (done) return <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mm-text-muted)' }}>Reversed</span>;

  if (!confirming) {
    return <button type="button" style={{ ...smallButtonStyle, borderColor: '#d93025', color: 'var(--mm-error-text)' }} onClick={() => setConfirming(true)}>Reverse award</button>;
  }

  const confirmReversal = async () => {
    if (busy) return; // guards a rapid double click on top of the disabled button below
    setBusy(true);
    setError('');
    try {
      const payload = buildReversalPayload({
        transactionId: transaction.id,
        requestId: controllerRef.current.next(),
        reason: reasonText,
      });
      await reverseClassPointAward(payload);
      controllerRef.current.resolveSuccess();
      setDone(true);
    } catch (reversalError) {
      const message = reversalError?.message || 'Could not reverse this award. Check the connection and try again.';
      // The backend answers a second reversal attempt with a clear
      // already-reversed precondition — present that safely instead of
      // retrying, rather than leaving the control offering another attempt.
      if (/already.*reversed/i.test(message)) {
        setDone(true);
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={(event) => event.stopPropagation()} style={{ display: 'grid', gap: 6, width: '100%', marginTop: 6, padding: '8px 9px', borderRadius: 8, background: 'var(--mm-error-subtle)', border: '1px solid var(--mm-error-border-soft)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--mm-error-text)' }}>Reverse this award? The student&apos;s balance will change immediately.</div>
      <input
        type="text"
        value={reasonText}
        disabled={busy}
        maxLength={300}
        onChange={(event) => setReasonText(event.target.value)}
        aria-label="Reversal reason"
        style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--mm-border)', fontSize: 12.5 }}
      />
      {error && <div role="alert" style={{ fontSize: 11.5, color: 'var(--mm-error-text)', fontWeight: 700 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} style={smallButtonStyle}>Cancel</button>
        <button type="button" disabled={busy} onClick={confirmReversal} style={{ ...smallButtonStyle, borderColor: '#d93025', background: busy ? '#f3b4ad' : '#d93025', color: '#fff', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? (error ? 'Retrying…' : 'Reversing…') : error ? 'Retry' : 'Confirm reversal'}
        </button>
      </div>
    </div>
  );
}

export default function ClassPointsHistoryPanel({ classId, teacherEmail, roster = [], showStudentId = true }) {
  const [transactions, setTransactions] = useState([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setTransactions([]);
    setUnavailable(false);
    if (!classId || !teacherEmail) return undefined;
    return watchClassPointHistory(
      db,
      { teacherEmail, classId },
      (entries) => { setUnavailable(false); setTransactions(entries); },
      () => setUnavailable(true),
    );
  }, [classId, teacherEmail]);

  const reversedIds = useMemo(() => reversedAwardTransactionIds(transactions), [transactions]);

  return (
    <div style={{ margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)' }}>
      <div style={{ fontWeight: 900, color: 'var(--mm-text-strong)' }}>Class Points Activity</div>
      <div style={{ marginTop: 3, marginBottom: 10, fontSize: 12, color: 'var(--mm-text-muted)' }}>
        Recent activity for this class. A mistaken award is corrected with Reverse award — the original stays in history.
      </div>

      {unavailable ? (
        <div style={{ fontSize: 12.5, color: 'var(--mm-text-subtle)' }}>Class Points history is unavailable right now. Live monitoring is unaffected.</div>
      ) : transactions.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--mm-text-subtle)' }}>No Class Points activity for this class yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {transactions.map((transaction) => {
            const studentName = rosterStudentLabel(transaction.studentId, roster, '', showStudentId);
            const amount = Number(transaction.amount) || 0;
            return (
              <div key={transaction.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 12.5 }}>{studentName}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 900, color: amount < 0 ? 'var(--mm-error-text)' : 'var(--mm-success-text)' }}>{amount > 0 ? `+${amount}` : amount} pts</span>
                  <div style={{ fontSize: 11.5, color: 'var(--mm-text-muted)', marginTop: 2 }}>
                    {transaction.reasonLabel || 'Class Points'} · {sourceTypeLabel(transaction)}{formatWhen(transaction.createdAt) && ` · ${formatWhen(transaction.createdAt)}`}
                  </div>
                </div>
                {isReversibleTeacherAward(transaction, reversedIds) && (
                  <ReversalControl transaction={transaction} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
