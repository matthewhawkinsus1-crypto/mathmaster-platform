import { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase.js';
import { dismissAttemptSignal, watchAttemptSignals } from '../../platform/teacher/attemptSignalsStore.js';
import { WORTH_A_CONVERSATION, WORTH_A_CONVERSATION_NOTE, openAttemptSignals } from '../../platform/teacher/attemptSignalsView.js';

/*
 * "WORTH A CONVERSATION" (docs/platform/SHOWING_THE_PROCESS.md, section 7).
 *
 * The facts a student's attempts raised, for the teacher only: in the Live
 * view's tile (`compact`) and in the student's results (the drawer). Each is
 * a fact with its place and a Dismiss; none is a finding, and nothing here
 * can change a score. Never drawn on the projector: the callers leave it out
 * there.
 */

const chipStyle = {
  fontSize: 'calc(11 * var(--mm-px))', fontWeight: 800, padding: '2px 7px', borderRadius: 999,
  background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)',
};
const cardStyle = {
  padding: '9px 10px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border-soft)',
  textAlign: 'left',
};
const dismissStyle = {
  padding: '5px 9px', borderRadius: 7, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)',
  color: 'var(--mm-text)', fontWeight: 800, fontSize: 'calc(12 * var(--mm-px))', cursor: 'pointer', minHeight: 28,
};

export default function WorthAConversation({
  studentId = '',
  studentName = '',
  // Only this assignment's facts (the Live tile); null for every assignment.
  assignmentId = null,
  assignments = [],
  teacherEmail = '',
  // The Live tile: a chip and the facts, with no heading or empty state.
  compact = false,
  // Fast-and-right lines the caller already has (the drawer's archived
  // sessions), shown beside the attempt facts: [{ key, where, facts }].
  fastAndRight = [],
}) {
  const [signals, setSignals] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  // The read was refused or failed: said so, never shown as "nothing waiting".
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    setSignals([]);
    if (!studentId) return undefined;
    setReadFailed(false);
    return watchAttemptSignals({ db, studentId, assignmentId, onChange: setSignals, onError: () => setReadFailed(true) });
  }, [studentId, assignmentId]);

  const assignmentsById = useMemo(
    () => new Map((Array.isArray(assignments) ? assignments : []).filter((entry) => entry?.id).map((entry) => [String(entry.id), entry])),
    [assignments],
  );
  const open = useMemo(() => openAttemptSignals(signals, { assignmentId, assignmentsById }), [signals, assignmentId, assignmentsById]);

  const dismiss = async (signal) => {
    setBusyId(signal.id);
    setError('');
    try {
      await dismissAttemptSignal({ db, studentId, signalId: signal.id, teacherEmail });
    } catch {
      setError('That could not be dismissed. Try again.');
    } finally {
      setBusyId('');
    }
  };

  const who = studentName || 'this student';
  const list = (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
      {open.map((signal) => (
        <li key={signal.id} data-attempt-signal={signal.kind} style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{signal.title}</div>
          {signal.where && <div style={{ marginTop: 2, fontSize: 'calc(11.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{signal.where}</div>}
          <div style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.45, color: 'var(--mm-text)' }}>{signal.facts}</div>
          {teacherEmail && (
            <button
              type="button"
              disabled={busyId === signal.id}
              onClick={() => dismiss(signal)}
              // Named by what it dismisses, starting with its own word (WCAG 2.5.3).
              aria-label={`Dismiss: ${signal.title}, ${signal.where || who}`}
              style={{ ...dismissStyle, marginTop: 7 }}
            >
              {busyId === signal.id ? 'Dismissing…' : 'Dismiss'}
            </button>
          )}
        </li>
      ))}
      {fastAndRight.map((entry) => (
        <li key={entry.key} data-attempt-signal="fastAndRight" style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>Fast and right</div>
          {entry.where && <div style={{ marginTop: 2, fontSize: 'calc(11.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{entry.where}</div>}
          <div style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.45, color: 'var(--mm-text)' }}>{entry.facts}</div>
        </li>
      ))}
    </ul>
  );

  if (compact) {
    if (!open.length) return null;
    return (
      <div
        data-worth-a-conversation={studentId}
        // The tile opens the student; these controls act on their own.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        style={{ marginTop: 8 }}
      >
        <details>
          <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
            <span style={chipStyle}>{WORTH_A_CONVERSATION} · {open.length}</span>
          </summary>
          <p style={{ margin: '6px 0', fontSize: 'calc(11.5 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.4 }}>{WORTH_A_CONVERSATION_NOTE}</p>
          {list}
          {error && <p role="alert" style={{ margin: '6px 0 0', color: 'var(--mm-error-text)', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 700 }}>{error}</p>}
        </details>
      </div>
    );
  }

  const count = open.length + fastAndRight.length;
  return (
    <section data-worth-a-conversation={studentId} aria-labelledby={`worth-a-conversation-${studentId}`} style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)', textAlign: 'left' }}>
      <h3 id={`worth-a-conversation-${studentId}`} style={{ margin: 0, fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>
        {WORTH_A_CONVERSATION}{count ? ` (${count})` : ''}
      </h3>
      <p style={{ margin: '3px 0 9px', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.45, color: 'var(--mm-text-muted)' }}>
        {WORTH_A_CONVERSATION_NOTE} Students never see them.
      </p>
      {readFailed ? (
        <p role="alert" data-attempt-signals-unavailable="" style={{ margin: 0, color: 'var(--mm-error-text)', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 700 }}>These could not be loaded. Close this student and open them again to retry.</p>
      ) : count ? list : (
        <p style={{ margin: 0, color: 'var(--mm-text-subtle)', fontSize: 'calc(12.5 * var(--mm-px))' }}>Nothing from {who}&apos;s attempts is waiting.</p>
      )}
      {error && <p role="alert" style={{ margin: '8px 0 0', color: 'var(--mm-error-text)', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 700 }}>{error}</p>}
    </section>
  );
}
