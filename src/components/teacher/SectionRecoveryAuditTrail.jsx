/*
 * PRACTICE-BASED RECOVERY IN THE GRADEBOOK'S STUDENT DETAIL.
 *
 * Original / Recovery / Final and the type, with the reason and the Practice
 * evidence that unlocked it. Renders nothing for a student without a Recovery
 * record, so the detail view is unchanged for everyone else.
 *
 * A Recovery MathMaster could not fully grade shows, per question, what
 * happened and why (never the pin, the generated numbers or the answer key),
 * whether the evidence was enough, and — when it is HELD — what the teacher
 * can do about it: issue a replacement question, finalize from the questions
 * MathMaster could grade, or keep the original score
 * (functions/index.js resolveHeldSectionRecovery, teacher of record only,
 * audited). Until then no Recovery score counts and Classroom and Grade
 * Transfer wait.
 */
import { useMemo, useState } from 'react';
import {
  HELD_RECOVERY_ACTION_LABEL,
  buildTeacherRecoveryAudit,
  buildTeacherWarmupChallengeAudit,
} from '../../platform/recovery/teacherRecoveryAudit.js';
import { recoveryErrorCode, resolveHeldSectionRecovery } from '../../services/sectionRecoveryService.js';

const ACTION_CONFIRM = Object.freeze({
  issueReplacement: 'MathMaster will build a new question for each question it could not grade, from the assignment as it is now. The student answers only the new questions; their other answers are kept.',
  finalizeGraded: 'The Recovery will be scored from the questions MathMaster could grade only. The others are left out of the score — never counted as wrong.',
  keepOriginal: 'No Recovery score will be recorded. The original section score stands.',
});

const itemTone = (status) => (status === 'platform-unavailable' || status === 'needs-review'
  ? { color: 'var(--mm-warning-text)', fontWeight: 800 }
  : { color: 'var(--mm-text)' });

function HeldRecoveryResolution({ student, assignment, row }) {
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const resolve = async (action) => {
    setBusy(true);
    setMessage('');
    try {
      await resolveHeldSectionRecovery({
        studentId: student?.id || student?.studentId,
        assignmentId: assignment?.id,
        section: row.section,
        action,
        note: note.trim(),
      });
      setPending(null);
      setNote('');
      setMessage(action === 'issueReplacement'
        ? 'Replacement question issued. The student will see it when they open the Recovery.'
        : 'Recovery resolved.');
    } catch (error) {
      const code = recoveryErrorCode(error);
      setMessage(code === 'permission-denied'
        ? 'Only this student\'s teacher of record can resolve this Recovery.'
        : error?.message || 'The Recovery could not be resolved. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-held-recovery-actions={row.section} style={{ display: 'grid', gap: 6, marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {row.actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            data-held-recovery-action={action}
            aria-pressed={pending === action}
            onClick={() => setPending(pending === action ? null : action)}
            style={{ minHeight: 44, padding: '6px 12px', borderRadius: 6, fontWeight: 800, border: '1px solid var(--mm-border-strong)', background: pending === action ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', color: 'var(--mm-primary-text)', cursor: busy ? 'wait' : 'pointer' }}
          >
            {HELD_RECOVERY_ACTION_LABEL[action] || action}
          </button>
        ))}
      </div>
      {pending && (
        <div role="group" aria-label={HELD_RECOVERY_ACTION_LABEL[pending]} style={{ display: 'grid', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'var(--mm-surface-muted)', border: '1px solid var(--mm-border)' }}>
          <span>{ACTION_CONFIRM[pending]}</span>
          <label style={{ fontSize: 12 }}>
            Optional note (kept in the audit trail)
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 44, marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} data-held-recovery-confirm={pending} onClick={() => resolve(pending)} style={{ minHeight: 44, padding: '6px 12px', borderRadius: 6, fontWeight: 900, border: '1px solid var(--mm-primary)', background: 'var(--mm-primary)', color: 'var(--mm-on-primary)' }}>
              {busy ? 'Saving…' : `Confirm: ${HELD_RECOVERY_ACTION_LABEL[pending]}`}
            </button>
            <button type="button" disabled={busy} onClick={() => setPending(null)} style={{ minHeight: 44, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)' }}>Cancel</button>
          </div>
        </div>
      )}
      {message && <p role="status" style={{ margin: 0, fontSize: 12.5, color: 'var(--mm-text-muted)' }}>{message}</p>}
    </div>
  );
}

export default function SectionRecoveryAuditTrail({ student, assignment }) {
  const rows = useMemo(() => buildTeacherRecoveryAudit({ student, assignment }), [student, assignment]);
  const challenge = useMemo(() => buildTeacherWarmupChallengeAudit({ student, assignment }), [student, assignment]);
  if (!rows.length && !challenge) return null;
  return (
    <section
      data-section-recovery-audit={student?.id || ''}
      aria-label="Warm-Up challenge and Practice-based Recovery"
      style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', display: 'grid', gap: 8, textAlign: 'left' }}
    >
      {challenge && (
        <div data-warmup-challenge-audit="true" style={{ display: 'grid', gap: 3, fontSize: 12.5, color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-text-strong)' }}>{challenge.label}</strong>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>Challenge <strong>{challenge.challenge}</strong></span>
            <span>Authored Warm-Up <strong>{challenge.authored}</strong></span>
            <span>Warm-Up grade <strong>{challenge.final}</strong></span>
          </div>
          <div style={{ color: 'var(--mm-text-muted)' }}>{challenge.reason}</div>
        </div>
      )}
      {rows.length > 0 && <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>Practice-based Recovery</div>}
      {rows.map((row) => (
        <div key={row.section} data-recovery-audit-section={row.section} data-recovery-audit-status={row.status} style={{ display: 'grid', gap: 3, fontSize: 12.5, color: 'var(--mm-text)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong style={{ color: 'var(--mm-text-strong)' }}>{row.label}</strong>
            <span style={{ color: row.held ? 'var(--mm-warning-text)' : 'var(--mm-text-muted)', fontWeight: row.held ? 800 : 400 }}>{row.statusLabel}{row.typeLabel ? ` · ${row.typeLabel}` : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>Original <strong>{row.original}</strong></span>
            <span>Recovery <strong>{row.recovery}</strong></span>
            <span>Final <strong>{row.final}</strong>{row.held ? ' (waiting for you)' : ''}</span>
          </div>
          {row.reason && row.status === 'completed' && <div style={{ color: 'var(--mm-text-muted)' }}>{row.reason}</div>}
          {row.heldReason && <div data-held-recovery-reason={row.section} style={{ fontWeight: 700 }}>{row.heldReason}</div>}
          {row.evidenceSummary && <div data-recovery-evidence={row.section} style={{ color: 'var(--mm-text-muted)' }}>{row.evidenceSummary}</div>}
          {row.evidenceSummary && row.items.length > 0 && (
            <ul data-recovery-items={row.section} style={{ margin: '2px 0', paddingLeft: 18, display: 'grid', gap: 2 }}>
              {row.items.map((item) => (
                <li key={item.itemId} data-recovery-item-status={item.status} data-recovery-item-classification={item.classification || ''}>
                  <span style={itemTone(item.status)}>
                    Recovery question {item.position} ({item.questionLabel}){item.replaces ? ' — replacement' : ''}: {item.statusLabel}
                  </span>
                  {item.classificationLabel && <span style={{ color: 'var(--mm-text-muted)' }}> {item.classificationLabel}</span>}
                  {item.supersededBy && <span style={{ color: 'var(--mm-text-muted)' }}> Replaced by a new question.</span>}
                  {item.answerKept && <span style={{ color: 'var(--mm-text-muted)' }}> The student&apos;s saved answer is kept.</span>}
                </li>
              ))}
            </ul>
          )}
          {row.recommendedAction && <div data-recovery-next-step={row.section} style={{ color: 'var(--mm-text-strong)' }}><strong>Next step:</strong> {row.recommendedAction}</div>}
          {row.held && row.actions.length > 0 && <HeldRecoveryResolution student={student} assignment={assignment} row={row} />}
          {row.resolution && <div data-recovery-resolution={row.section} style={{ color: 'var(--mm-text-muted)' }}>{row.resolution}</div>}
          <div style={{ color: 'var(--mm-text-muted)' }}>
            {row.evidence}
            {row.unlockedAt ? ` Unlocked ${row.unlockedAt}.` : ''}
            {row.completedAt ? ` Completed ${row.completedAt}.` : ''}
          </div>
        </div>
      ))}
    </section>
  );
}
