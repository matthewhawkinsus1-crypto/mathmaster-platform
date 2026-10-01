/*
 * PRACTICE-BASED RECOVERY IN THE GRADEBOOK'S STUDENT DETAIL.
 *
 * Original / Recovery / Final and the type, with the reason and the Practice
 * evidence that unlocked it. Renders nothing for a student without a Recovery
 * record, so the detail view is unchanged for everyone else.
 */
import { useMemo } from 'react';
import { buildTeacherRecoveryAudit, buildTeacherWarmupChallengeAudit } from '../../platform/recovery/teacherRecoveryAudit.js';

export default function SectionRecoveryAuditTrail({ student, assignment }) {
  const rows = useMemo(() => buildTeacherRecoveryAudit({ student, assignment }), [student, assignment]);
  const challenge = useMemo(() => buildTeacherWarmupChallengeAudit({ student, assignment }), [student, assignment]);
  if (!rows.length && !challenge) return null;
  return (
    <section
      data-section-recovery-audit={student?.id || ''}
      aria-label="Warm-Up challenge and Practice-based Recovery"
      style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', display: 'grid', gap: 8 }}
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
        <div key={row.section} data-recovery-audit-section={row.section} style={{ display: 'grid', gap: 3, fontSize: 12.5, color: 'var(--mm-text)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong style={{ color: 'var(--mm-text-strong)' }}>{row.label}</strong>
            <span style={{ color: 'var(--mm-text-muted)' }}>{row.statusLabel}{row.typeLabel ? ` · ${row.typeLabel}` : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>Original <strong>{row.original}</strong></span>
            <span>Recovery <strong>{row.recovery}</strong></span>
            <span>Final <strong>{row.final}</strong></span>
          </div>
          {row.reason && row.status === 'completed' && <div style={{ color: 'var(--mm-text-muted)' }}>{row.reason}</div>}
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
