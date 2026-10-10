/*
 * RECOVERY, AS A STUDENT SEES IT — ONLY AFTER THE ORIGINAL HAS CLOSED.
 *
 * Rendered from buildStudentRecoverySummary, which returns nothing while the
 * original Warm-Up/DOL is still available, so this panel can never present
 * Recovery as an easier alternative to the work in front of the student.
 * Short, encouraging copy; no internal vocabulary.
 */

const cardStyle = {
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid var(--mm-border)',
  background: 'var(--mm-surface-raised)',
  color: 'var(--mm-text)',
  display: 'grid',
  gap: 8,
};

// "Under review" (held) reads as information, not as an error: nothing the
// student did is wrong, and their work is saved.
const BADGE_TONE = Object.freeze({
  unlocked: 'success',
  completed: 'success',
  inProgress: 'info',
  held: 'info',
});

const badgeStyle = (state) => {
  const tone = BADGE_TONE[state] || null;
  return {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: tone ? `var(--mm-${tone}-bg)` : 'var(--mm-surface-muted)',
    color: tone ? `var(--mm-${tone}-text)` : 'var(--mm-text-muted)',
    border: `1px solid ${tone ? `var(--mm-${tone}-border)` : 'var(--mm-border)'}`,
  };
};

const buttonStyle = (primary) => ({
  padding: '9px 14px',
  borderRadius: 8,
  fontWeight: 800,
  cursor: 'pointer',
  border: primary ? '1px solid var(--mm-primary)' : '1px solid var(--mm-border)',
  background: primary ? 'var(--mm-primary)' : 'var(--mm-surface)',
  color: primary ? 'var(--mm-on-primary)' : 'var(--mm-text-strong)',
});

export function RecoveryMasteryMeter({ percent }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div aria-label={`Recovery practice mastery ${value}%`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--mm-text-muted)' }}>
        <span>Recovery practice mastery</span>
        <strong style={{ color: 'var(--mm-text-strong)', fontSize: 16 }}>{value}%</strong>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--mm-surface-muted)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 999, background: 'var(--mm-primary)' }} />
      </div>
    </div>
  );
}

export default function SectionRecoveryPanel({ summary = [], busySection = null, onPractice, onStart, onContinue }) {
  if (!Array.isArray(summary) || !summary.length) return null;
  const anyLocked = summary.some((entry) => entry.state === 'locked');
  return (
    <section data-section-recovery-panel="true" aria-label="Recovery" style={{ display: 'grid', gap: 10, margin: '10px 4px 14px' }}>
      {anyLocked && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)' }}>
          <strong>Recovery Available</strong>
          {/* Names the button, because "improve your Practice mastery" sent
              students to the assignment's own Practice section, which never
              counts toward unlocking a Recovery. */}
          <div style={{ marginTop: 2, fontSize: 13 }}>Use the “Practice for …” button below to unlock another try. Practice inside the assignment itself does not count toward it.</div>
        </div>
      )}
      {summary.map((entry) => {
        const busy = busySection === entry.section;
        return (
          <article key={entry.section} data-recovery-section={entry.section} data-recovery-state={entry.state} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 16, color: 'var(--mm-text-strong)' }}>{entry.label}</strong>
              <span style={badgeStyle(entry.state)}>{entry.badge}</span>
            </div>
            {(entry.state === 'locked' || entry.state === 'unlocked') && <RecoveryMasteryMeter percent={entry.masteryPercent} />}
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{entry.message}</p>
            {entry.endsAtLabel && (
              <p data-recovery-ends-at="true" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--mm-text-strong)' }}>
                Open until {entry.endsAtLabel}
              </p>
            )}
            {entry.state === 'locked' && entry.practiceRemaining > 0 && (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mm-text-muted)' }}>
                {entry.practiceRemaining} more practice question{entry.practiceRemaining === 1 ? '' : 's'} to go.
              </p>
            )}
            {entry.result && (
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, fontSize: 13 }}>
                <div><dt style={{ color: 'var(--mm-text-muted)' }}>Original</dt><dd style={{ margin: 0, fontWeight: 900 }}>{entry.result.original}</dd></div>
                <div><dt style={{ color: 'var(--mm-text-muted)' }}>Recovery</dt><dd style={{ margin: 0, fontWeight: 900 }}>{entry.result.recovery}</dd></div>
                <div><dt style={{ color: 'var(--mm-text-muted)' }}>Final</dt><dd style={{ margin: 0, fontWeight: 900 }}>{entry.result.final}</dd></div>
              </dl>
            )}
            {entry.note && (
              <p data-recovery-note="true" style={{ margin: 0, fontSize: 12.5, color: 'var(--mm-text-muted)' }}>{entry.note}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {entry.canPractice && (
                <button type="button" disabled={busy} onClick={() => onPractice?.(entry.section)} style={buttonStyle(!entry.canStart)}>
                  Practice for {entry.label}
                </button>
              )}
              {entry.canStart && (
                <button type="button" disabled={busy} onClick={() => onStart?.(entry.section)} style={buttonStyle(true)}>
                  {busy ? 'Preparing…' : `Start ${entry.label}`}
                </button>
              )}
              {entry.canContinue && (
                <button type="button" disabled={busy} onClick={() => onContinue?.(entry.section)} style={buttonStyle(true)}>
                  Continue {entry.label}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
