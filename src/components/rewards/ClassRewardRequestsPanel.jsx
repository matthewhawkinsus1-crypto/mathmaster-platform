import React, { useRef, useState } from 'react';
import { MAX_DECLINE_REASON_LENGTH } from '../../../functions/shared/classRewardCatalog.mjs';
import {
  pendingSummary,
  sortPendingRequests,
  teacherRequestStudentName,
  teacherRewardActionError,
} from '../../platform/rewards/classRewardsModel.js';
import { formatRewardDate } from '../../platform/rewards/rewardWallet.js';
import { usePendingClassRewardRequests } from '../../platform/rewards/useClassRewards.js';
import './rewards.css';

/*
 * PENDING CLASS REWARD REQUESTS, FOR THE TEACHER.
 *
 * A student has already paid; the request waits for the teacher to hand the
 * reward out. Two ways to close it:
 *
 *   Fulfilled   the student got it. The points stay spent.
 *   Decline     with a reason the student reads on My Rewards. The points
 *               go back in the same server transaction, exactly once.
 *
 * Oldest first, so whoever asked first is served first. A resolved request
 * leaves the list when the server commits (the list is a live listener), so a
 * double click or a second tab can never act on it twice — and the server
 * answers a repeat as already done.
 *
 * Props: classId, teacherEmail (as the signed-in token carries it), and
 * optionally studentNames ({ [studentId]: 'Ava Martinez' }) for full names;
 * without it the panel shows the name-safe label stored on the request.
 */
function RequestRow({ request, studentName, onResolve, nowMs }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const reasonId = `decline-reason-${request.requestDocId}`;

  const act = async (resolution) => {
    if (inFlight.current) return;
    if (resolution === 'declined' && !reason.trim()) {
      setError('Add a short reason. The student will see it.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await onResolve({ request, resolution, reason: resolution === 'declined' ? reason.trim() : null, studentName });
    } catch (resolveError) {
      setError(teacherRewardActionError(resolveError));
      inFlight.current = false;
      setBusy(false);
    }
    // On success the row is removed by the listener; it stays disabled until then.
  };

  return (
    <li className="rw-row" data-qa="class-reward-request" style={{ alignItems: 'flex-start' }}>
      <span className="rw-row__main">
        <span className="rw-row__title">{studentName}</span>
        <span style={{ display: 'block' }}>{request.itemLabel} · {request.cost} points</span>
        <span className="rw-muted" style={{ display: 'block' }}>Asked {formatRewardDate(request.requestedAt, nowMs)}</span>
      </span>
      {!declining ? (
        <span className="rw-actions" style={{ marginTop: 0 }}>
          <button type="button" className="rw-button rw-button--small" disabled={busy} onClick={() => act('fulfilled')}>
            {busy ? 'Saving…' : 'Fulfilled'}
          </button>
          <button type="button" className="rw-button rw-button--quiet rw-button--small" disabled={busy} onClick={() => { setDeclining(true); setError(''); }}>
            Decline
          </button>
        </span>
      ) : (
        <span style={{ display: 'grid', gap: 8, flex: '1 1 260px', minWidth: 0 }}>
          <label className="rw-label" htmlFor={reasonId}>
            Reason (the student sees this)
            <input
              id={reasonId}
              className="rw-input"
              value={reason}
              maxLength={MAX_DECLINE_REASON_LENGTH}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder="We're testing in the library today"
            />
          </label>
          <span className="rw-actions" style={{ marginTop: 0 }}>
            <button type="button" className="rw-button rw-button--danger rw-button--small" disabled={busy} onClick={() => act('declined')}>
              {busy ? 'Saving…' : `Decline and return ${request.cost} points`}
            </button>
            <button type="button" className="rw-button rw-button--quiet rw-button--small" disabled={busy} onClick={() => { setDeclining(false); setError(''); }}>
              Cancel
            </button>
          </span>
        </span>
      )}
      {error && <p className="rw-feedback rw-feedback--bad" role="alert" style={{ flexBasis: '100%', margin: 0 }}>{error}</p>}
    </li>
  );
}

export default function ClassRewardRequestsPanel({ classId, teacherEmail, studentNames = {}, nowMs = Date.now() }) {
  const { requests, loaded, unavailable, resolve } = usePendingClassRewardRequests({
    classId, teacherEmail, enabled: Boolean(classId && teacherEmail),
  });
  const [announcement, setAnnouncement] = useState('');
  const pending = sortPendingRequests(requests);

  const onResolve = async ({ request, resolution, reason, studentName }) => {
    await resolve({ requestDocId: request.requestDocId, resolution, reason });
    setAnnouncement(resolution === 'declined'
      ? `Declined ${studentName}'s “${request.itemLabel}”. ${request.cost} points were returned.`
      : `Marked ${studentName}'s “${request.itemLabel}” fulfilled.`);
  };

  return (
    <section aria-labelledby="class-reward-requests-heading" className="rw-card" data-qa="class-reward-requests">
      <h2 id="class-reward-requests-heading">Class reward requests</h2>
      <p className="rw-muted">{loaded && !unavailable ? pendingSummary(pending) : ' '}</p>
      {unavailable && <p className="rw-feedback rw-feedback--info" role="status">Requests could not load. Check again in a minute.</p>}
      {!loaded && !unavailable && <p className="rw-muted" role="status">Loading…</p>}
      {loaded && !unavailable && pending.length === 0 && (
        <p className="rw-muted">When a student uses Class Points on a class reward, it shows up here for you to hand out.</p>
      )}
      {pending.length > 0 && (
        <ul className="rw-list" aria-label="Waiting for you">
          {pending.map((request) => (
            <RequestRow
              key={request.requestDocId}
              request={request}
              studentName={teacherRequestStudentName(request, studentNames)}
              onResolve={onResolve}
              nowMs={nowMs}
            />
          ))}
        </ul>
      )}
      {announcement && <p className="rw-feedback rw-feedback--ok" role="status">{announcement}</p>}
    </section>
  );
}
