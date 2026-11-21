import { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase.js';
import { reviewAttemptSignal, watchAttemptSignals } from '../../platform/teacher/attemptSignalsStore.js';
import {
  NOT_CONCLUSIVE, REVIEW_NOTE_MAX, WORTH_A_CONVERSATION, WORTH_A_CONVERSATION_NOTE, describeAttemptSignals,
} from '../../platform/teacher/attemptSignalsView.js';

/*
 * "WORTH A CONVERSATION" (docs/platform/SHOWING_THE_PROCESS.md, section 7).
 *
 * The facts a student's attempts raised, for the teacher only: in the Live
 * view's tile (`compact`) and in the student's drawer. Each is a fact with
 * its place, its time and its context, labelled not conclusive, with "Mark
 * reviewed" (who, when, an optional note). A reviewed fact leaves the list
 * that needs attention and stays in the record: the drawer keeps it under
 * "Reviewed". None is a finding, and nothing here can change a score. Never
 * drawn on the projector: the callers leave it out there.
 */

const chipStyle = {
  fontSize: 'calc(11 * var(--mm-px))', fontWeight: 800, padding: '2px 7px', borderRadius: 999,
  background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)',
};
const tagStyle = {
  fontSize: 'calc(10.5 * var(--mm-px))', fontWeight: 800, padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap',
  background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border)', color: 'var(--mm-text-muted)',
};
const cardStyle = {
  padding: '9px 10px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border-soft)',
  textAlign: 'left',
};
const buttonStyle = {
  padding: '5px 9px', borderRadius: 7, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)',
  color: 'var(--mm-text)', fontWeight: 800, fontSize: 'calc(12 * var(--mm-px))', cursor: 'pointer', minHeight: 28,
};
const small = { marginTop: 2, fontSize: 'calc(11.5 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.4 };

export const signalWhen = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** One signal's facts: title, "not conclusive", place and time, facts, context. Shared by every teacher surface. */
export function SignalFacts({ signal }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{signal.title}</span>
        <span data-not-conclusive="" style={tagStyle}>{NOT_CONCLUSIVE}</span>
      </div>
      {(signal.where || signal.when) && <div style={small}>{[signal.where, signal.when].filter(Boolean).join(' · ')}</div>}
      <div style={{ marginTop: 4, fontSize: 'calc(12 * var(--mm-px))', lineHeight: 1.45, color: 'var(--mm-text)' }}>{signal.facts}</div>
      {(signal.classTime || signal.supports) && (
        <div data-signal-context="" style={small}>{[signal.classTime, signal.supports].filter(Boolean).join(' · ')}</div>
      )}
      {signal.reviewed && (
        <div data-signal-reviewed="" style={small}>
          Reviewed{signal.reviewedBy ? ` by ${signal.reviewedBy}` : ''}{signal.reviewedAtMs ? ` · ${signalWhen(signal.reviewedAtMs)}` : ''}
          {signal.reviewNote ? <><br /><strong>Teacher note:</strong> {signal.reviewNote}</> : null}
        </div>
      )}
    </>
  );
}

/** "Mark reviewed", with a note the teacher may leave. */
export function ReviewSignalControl({ studentId, signal, teacherEmail, who = '' }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!teacherEmail || signal.reviewed) return null;
  const review = async () => {
    setBusy(true);
    setError('');
    try {
      await reviewAttemptSignal({ db, studentId, signalId: signal.id, teacherEmail, note });
    } catch {
      setError('That could not be saved. Try again.');
      setBusy(false);
    }
  };
  const named = `${signal.title}, ${signal.where || who}`;
  return (
    <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        type="text"
        value={note}
        maxLength={REVIEW_NOTE_MAX}
        onChange={(event) => setNote(event.target.value)}
        aria-label={`Note for your review (optional): ${named}`}
        placeholder="Note (optional)"
        style={{ flex: '1 1 150px', minWidth: 0, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontSize: 'calc(12 * var(--mm-px))', minHeight: 28, boxSizing: 'border-box' }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={review}
        // Named by what it reviews, starting with its own words (WCAG 2.5.3).
        aria-label={`Mark reviewed: ${named}`}
        style={buttonStyle}
      >
        {busy ? 'Saving…' : 'Mark reviewed'}
      </button>
      {error && <span role="alert" style={{ flexBasis: '100%', color: 'var(--mm-error-text)', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 700 }}>{error}</span>}
    </div>
  );
}

export default function WorthAConversation({
  studentId = '',
  studentName = '',
  // Only this assignment's facts (the Live tile); null for every assignment.
  assignmentId = null,
  assignments = [],
  teacherEmail = '',
  // The Live tile: a chip and the facts that need attention, with no heading,
  // no reviewed list and no empty state.
  compact = false,
  // Fast-and-right lines the caller already has (the drawer's archived
  // sessions), shown beside the attempt facts: [{ key, where, facts }].
  fastAndRight = [],
}) {
  const [signals, setSignals] = useState([]);
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
  const all = useMemo(() => describeAttemptSignals(signals, { assignmentId, assignmentsById, formatWhen: signalWhen }), [signals, assignmentId, assignmentsById]);
  const open = all.filter((signal) => !signal.reviewed);
  const reviewed = all.filter((signal) => signal.reviewed);

  const who = studentName || 'this student';
  const card = (signal) => (
    <li key={signal.id} data-attempt-signal={signal.kind} style={cardStyle}>
      <SignalFacts signal={signal} />
      <ReviewSignalControl studentId={studentId} signal={signal} teacherEmail={teacherEmail} who={who} />
    </li>
  );
  const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 };
  const list = (
    <ul style={listStyle}>
      {open.map(card)}
      {fastAndRight.map((entry) => (
        <li key={entry.key} data-attempt-signal="fastAndRight" style={cardStyle}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>Fast and right</span>
            <span data-not-conclusive="" style={tagStyle}>{NOT_CONCLUSIVE}</span>
          </div>
          {entry.where && <div style={small}>{entry.where}</div>}
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
        <p style={{ margin: 0, color: 'var(--mm-text-subtle)', fontSize: 'calc(12.5 * var(--mm-px))' }}>Nothing from {who}&apos;s attempts needs attention.</p>
      )}
      {/* Reviewed is not deleted: kept here, and in the case review. */}
      {!readFailed && reviewed.length > 0 && (
        <details data-reviewed-signals="" style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text)' }}>Reviewed ({reviewed.length})</summary>
          <ul style={{ ...listStyle, marginTop: 7 }}>
            {reviewed.map((signal) => (
              <li key={signal.id} data-attempt-signal={signal.kind} data-reviewed="true" style={cardStyle}><SignalFacts signal={signal} /></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
