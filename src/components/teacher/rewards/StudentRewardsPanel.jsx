import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  awardRewardGrant,
  getStudentRewards,
  revokeRewardGrant,
  undoPracticePassRedemption,
} from '../../../platform/rewards/rewardsClient.js';
import { createRequestIdController, describeClassPointTransaction } from '../../../platform/classPointsClient.js';
import { buildTeacherRewardsView, rewardGuide, teacherRewardErrorMessage } from '../../../platform/rewards/teacherRewardsModel.js';
import { formatRewardDate } from '../../../platform/rewards/rewardWallet.js';
import '../../rewards/rewards.css';

/*
 * ONE STUDENT'S REWARDS, INSIDE THEIR PROFILE.
 *
 * A teacher opening a student answers every reward question here, without a
 * second page: what the student holds and where each came from, what they
 * used and on which assignment, what was taken back or undone and why, their
 * recent Class Points, and — for recent Live Challenges — which reward rules
 * paid out, which did not and why, and whether each reward arrived.
 *
 * Data is ONE authorized callable read (getStudentRewards), made when the
 * section opens and again after an action or Refresh — no standing listener.
 * Every action is a callable that re-checks the teacher's authority on the
 * server; the buttons here are a convenience, not the protection.
 */

export function useStudentRewards({ studentId, classId, enabled }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!studentId || !classId) return;
    const run = (generation.current += 1);
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await getStudentRewards({ studentId, classId });
      if (run === generation.current) setState({ status: 'ready', data, error: '' });
    } catch (error) {
      if (run === generation.current) setState({ status: 'error', data: null, error: teacherRewardErrorMessage(error) });
    }
  }, [studentId, classId]);
  // A different student, or the drawer closing, forgets what was read: the
  // next opening reads afresh rather than showing a stale copy.
  useEffect(() => {
    generation.current += 1;
    setState({ status: 'idle', data: null, error: '' });
  }, [studentId, classId]);
  useEffect(() => {
    if (enabled) return;
    generation.current += 1;
    setState({ status: 'idle', data: null, error: '' });
  }, [enabled]);
  useEffect(() => {
    if (enabled && state.status === 'idle') reload();
  }, [enabled, state.status, reload]);
  return { ...state, reload };
}

/** A confirm-with-reason control: the action, a reason the student will see, then confirm. */
function ReasonAction({ label, confirmLabel, explanation, onConfirm, danger = false }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (!open) {
    return <button type="button" className={`rw-button rw-button--small ${danger ? 'rw-button--secondary' : 'rw-button--quiet'}`} onClick={() => setOpen(true)}>{label}</button>;
  }
  const submit = async () => {
    if (inFlight.current) return;
    if (!reason.trim()) { setError('Add a short reason. The student will see it.'); return; }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      setOpen(false);
      setReason('');
    } catch (actionError) {
      setError(teacherRewardErrorMessage(actionError));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div style={{ width: '100%', display: 'grid', gap: 8, padding: 10, borderRadius: 10, background: 'var(--rw-bad-soft)' }}>
      <p className="rw-text" style={{ margin: 0 }}>{explanation}</p>
      <label className="rw-label">
        Reason (the student sees this)
        <input className="rw-input" value={reason} maxLength={300} disabled={busy} onChange={(event) => setReason(event.target.value)} />
      </label>
      {error && <p className="rw-feedback rw-feedback--bad" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="rw-actions" style={{ marginTop: 0 }}>
        <button type="button" className="rw-button rw-button--small rw-button--danger" disabled={busy} onClick={submit}>{busy ? 'Working…' : confirmLabel}</button>
        <button type="button" className="rw-button rw-button--small rw-button--quiet" disabled={busy} onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
    </div>
  );
}

const EXPIRY_OPTIONS = [
  { value: '', label: 'No end date' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

function GiveRewardForm({ studentId, classId, onDone }) {
  const [rewardCode, setRewardCode] = useState('practicePass');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const controller = useRef(createRequestIdController());
  const inFlight = useRef(false);
  const formId = useId();
  // Changing what is being given is a new intended action, never a retry.
  const change = (setter) => (event) => { setter(event.target.value); if (!inFlight.current) controller.current.reset(); };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await awardRewardGrant({
        studentId,
        classId,
        rewardCode,
        label: rewardCode === 'badge' ? label : null,
        note: note || null,
        expiresInDays: expiresInDays ? Number(expiresInDays) : null,
        requestId: controller.current.next(),
      });
      controller.current.resolveSuccess();
      setFeedback({ tone: 'ok', text: rewardCode === 'badge' ? 'Badge given.' : 'Practice Pass given. The student sees it right away.' });
      setNote('');
      setLabel('');
      onDone?.();
    } catch (error) {
      setFeedback({ tone: 'bad', text: teacherRewardErrorMessage(error) });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
      <div className="rw-grid rw-grid--two">
        <div className="rw-label">
          <label htmlFor={`${formId}-kind`}>Reward</label>
          <select id={`${formId}-kind`} className="rw-input" value={rewardCode} onChange={change(setRewardCode)} disabled={busy}>
            <option value="practicePass">🎟️ Practice Pass</option>
            <option value="badge">🏅 Badge</option>
          </select>
        </div>
        {rewardCode === 'badge' ? (
          <label className="rw-label">Badge name
            <input className="rw-input" value={label} maxLength={40} placeholder="Great explainer" onChange={change(setLabel)} disabled={busy} required />
          </label>
        ) : (
          <div className="rw-label">
            <label htmlFor={`${formId}-expiry`}>Expires after</label>
            <select id={`${formId}-expiry`} className="rw-input" value={expiresInDays} onChange={change(setExpiresInDays)} disabled={busy}>
              {EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        )}
      </div>
      <label className="rw-label">Why (optional — the student sees this)
        <input className="rw-input" value={note} maxLength={140} placeholder="Helped a classmate all period" onChange={change(setNote)} disabled={busy} />
      </label>
      <div className="rw-actions" style={{ marginTop: 0 }}>
        <button type="submit" className="rw-button rw-button--small" disabled={busy}>{busy ? 'Giving…' : 'Give reward'}</button>
      </div>
      {feedback && <p className={`rw-feedback rw-feedback--${feedback.tone}`} role={feedback.tone === 'bad' ? 'alert' : 'status'}>{feedback.text}</p>}
    </form>
  );
}

function ChallengeDiagnostics({ challenges }) {
  if (!challenges.length) return <p className="rw-muted">No Live Challenges for this student in this class yet.</p>;
  return (
    <ul className="rw-list">
      {challenges.map((match) => (
        <li key={match.roomId} className="rw-row" style={{ display: 'block' }}>
          <div className="rw-row__title">{match.title}{match.finishedAtMs ? ` · ${formatRewardDate(match.finishedAtMs)}` : ''}</div>
          <div className="rw-muted">
            Game result: {match.placement}{match.joined ? ` of ${match.playedCount} · ${Number(match.score || 0).toLocaleString()} game points` : ''}
            {match.usesDefaultPolicy ? ' · standard rewards' : ' · custom rewards'}
          </div>
          {match.matchNote && <p className="rw-feedback rw-feedback--info" style={{ margin: '6px 0 0' }}>{match.matchNote}</p>}
          <ul className="rw-list" aria-label={`Reward rules for ${match.title}`}>
            {match.rules.map((rule) => (
              <li key={rule.ruleId} className="rw-row" style={{ background: 'var(--mm-surface)' }}>
                <span className="rw-row__main">
                  <span className="rw-row__title">{rule.met ? '✓' : '✗'} {rule.reward}</span>
                  <span className="rw-muted" style={{ display: 'block' }}>Needs: {rule.requirement}. {rule.measured ? `Student: ${rule.measured}.` : ''}</span>
                  {rule.delivery && <span className="rw-muted" style={{ display: 'block' }}>{rule.delivery.label}</span>}
                </span>
                <span className={`rw-chip ${!rule.met ? '' : rule.delivery?.state === 'delivered' ? 'rw-chip--ok' : rule.delivery?.state === 'pending' ? 'rw-chip--warn' : 'rw-chip--bad'}`}>
                  {!rule.met ? 'Not earned' : rule.delivery?.state === 'delivered' ? 'Earned' : rule.delivery?.state === 'pending' ? 'Arriving' : 'Not delivered'}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default function StudentRewardsPanel({ studentId, classId, studentName = 'This student', rewards }) {
  const { status, data, error, reload } = rewards;
  const view = useMemo(() => (data ? buildTeacherRewardsView(data) : null), [data]);
  const guide = useMemo(() => rewardGuide(), []);

  const act = async (operation) => {
    await operation();
    await reload();
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="rw-actions" style={{ marginTop: 0, justifyContent: 'space-between' }}>
        <span className="rw-text" style={{ margin: 0, fontWeight: 800 }}>{view ? view.summary : status === 'error' ? '' : 'Loading rewards…'}</span>
        <button type="button" className="rw-button rw-button--small rw-button--quiet" onClick={reload} disabled={status === 'loading'}>{status === 'loading' ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      {status === 'error' && <p className="rw-feedback rw-feedback--bad" role="alert">{error}</p>}

      {view && (
        <>
          <section aria-label="Rewards ready to use">
            <h4 style={{ margin: 0 }}>Ready to use</h4>
            {view.available.length === 0 ? <p className="rw-muted">{studentName} has no unused rewards.</p> : (
              <ul className="rw-list">
                {view.available.map((grant) => (
                  <li key={grant.grantId} className="rw-row">
                    <span className="rw-row__main">
                      <span className="rw-row__title">{grant.icon} {grant.name}</span>
                      <span className="rw-muted" style={{ display: 'block' }}>
                        {grant.source} · {grant.awardedLabel}{grant.expiresLabel ? ` · expires ${grant.expiresLabel}` : ''}{grant.note ? ` · “${grant.note}”` : ''}
                      </span>
                    </span>
                    <ReasonAction
                      label="Take back"
                      confirmLabel="Take back"
                      danger
                      explanation={`Take back this ${grant.name}? It stays in the student's history as taken back, with your reason.`}
                      onConfirm={(reason) => act(() => revokeRewardGrant({ grantId: grant.grantId, reason }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Practice Passes used">
            <h4 style={{ margin: 0 }}>Practice Passes used</h4>
            {view.uses.length === 0 ? <p className="rw-muted">No Practice Pass has been used yet.</p> : (
              <ul className="rw-list">
                {view.uses.map((use) => (
                  <li key={use.redemptionId} className="rw-row">
                    <span className="rw-row__main">
                      <span className="rw-row__title">{use.assignmentTitle}</span>
                      <span className="rw-muted" style={{ display: 'block' }}>Used {use.usedLabel} · {use.payment}</span>
                      {!use.active && (
                        <span className="rw-muted" style={{ display: 'block' }}>
                          Undone {use.undoneLabel}{use.undoneBy ? ` by ${use.undoneBy}` : ''}{use.undoReason ? ` — “${use.undoReason}”` : ''}. {use.refund}.
                        </span>
                      )}
                    </span>
                    {use.active ? (
                      <>
                        <span className="rw-chip rw-chip--pass">Practice excused</span>
                        <ReasonAction
                          label="Undo"
                          confirmLabel="Undo this use"
                          explanation={`Undo the Practice Pass on “${use.assignmentTitle}”? Practice becomes required again, and the student gets back what they paid (${use.payment.includes('Class Points') ? '100 Class Points' : 'a Practice Pass'}).`}
                          onConfirm={(reason) => act(() => undoPracticePassRedemption({ redemptionId: use.redemptionId, reason }))}
                        />
                      </>
                    ) : <span className="rw-chip rw-chip--warn">Undone</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="rw-disclosure">
            <summary>Give {studentName} a reward</summary>
            <GiveRewardForm studentId={studentId} classId={classId} onDone={reload} />
          </details>

          <details className="rw-disclosure">
            <summary>Live Challenge rewards — what was earned and why</summary>
            <p className="rw-muted">Game placement and points are the match; rewards come from the reward rules. Each rule below says what it needs, what this student did, and whether the reward arrived.</p>
            <ChallengeDiagnostics challenges={view.challenges} />
          </details>

          <details className="rw-disclosure">
            <summary>History: taken back, expired and Class Points</summary>
            {view.closed.length === 0 ? <p className="rw-muted">Nothing taken back or expired.</p> : (
              <ul className="rw-list">
                {view.closed.map((grant) => (
                  <li key={grant.grantId} className="rw-row">
                    <span className="rw-row__main">
                      <span className="rw-row__title">{grant.icon} {grant.name}</span>
                      <span className="rw-muted" style={{ display: 'block' }}>
                        {grant.source} · {grant.awardedLabel}
                        {grant.status === 'revoked' ? ` · taken back ${grant.revokedLabel || ''}${grant.revocation?.actorEmail ? ` by ${grant.revocation.actorEmail}` : ''}${grant.revocation?.reason ? ` — “${grant.revocation.reason}”` : ''}` : ` · expired ${grant.expiresLabel || ''}`}
                      </span>
                    </span>
                    <span className={`rw-chip ${grant.status === 'revoked' ? 'rw-chip--bad' : ''}`}>{grant.status === 'revoked' ? 'Taken back' : 'Expired'}</span>
                  </li>
                ))}
              </ul>
            )}
            {view.transactions.length > 0 && (
              <ul className="rw-list" aria-label="Recent Class Points">
                {view.transactions.map((transaction) => {
                  const item = describeClassPointTransaction(transaction);
                  return (
                    <li key={transaction.id} className="rw-row">
                      <span className="rw-row__main">{item.reasonLabel || item.kindLabel} <span className="rw-muted">· {item.kindLabel} · {formatRewardDate(transaction.createdAt)}</span></span>
                      <strong>{item.amountLabel}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </details>

          <details className="rw-disclosure">
            <summary>About rewards: what each one does</summary>
            <ul className="rw-list">
              {guide.map((entry) => (
                <li key={entry.rewardCode} className="rw-row" style={{ display: 'block' }}>
                  <div className="rw-row__title">{entry.icon} {entry.label}</div>
                  <div className="rw-muted">{entry.description}</div>
                  {entry.gradeEffect && <div className="rw-muted"><strong>Grades:</strong> {entry.gradeEffect}</div>}
                </li>
              ))}
              <li className="rw-row" style={{ display: 'block' }}>
                <div className="rw-row__title">Fixing a mistake</div>
                <div className="rw-muted">
                  Take back an unused reward, or undo a Practice Pass use (Practice becomes required again and the pass or points go back to the student).
                  Nothing is deleted: the history keeps what happened, who changed it and why. Live Challenge Class Points are awarded by rule and cannot be taken back here; teacher Class Points awards are reversed from Class Points Activity in Live Classroom.
                </div>
              </li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
