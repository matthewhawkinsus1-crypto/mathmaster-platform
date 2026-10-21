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
    fontSize: 'calc(12 * var(--mm-px))',
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
        <span>Recovery practice mastery</span>
        <strong style={{ color: 'var(--mm-text-strong)', fontSize: 'calc(16 * var(--mm-px))' }}>{value}%</strong>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--mm-surface-muted)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 999, background: 'var(--mm-primary)' }} />
      </div>
    </div>
  );
}

/*
 * The banner over a locked Recovery says where the practice that counts is:
 * the "Practice for …" questions always, and — when they practise the same
 * skills — this assignment's own Practice questions, which each card names
 * (studentRecoveryModel.js describeAssignmentPractice).
 */
const lockedBannerText = (summary) => {
  const locked = summary.filter((entry) => entry.state === 'locked');
  const roles = new Set(locked.map((entry) => entry.assignmentPractice?.role || 'none'));
  if (roles.has('counts')) {
    return 'Answer practice questions on your own to unlock another try: the “Practice for …” questions below, and the Practice questions in this assignment that each card names.';
  }
  return roles.has('otherSkills')
    ? 'Use the “Practice for …” button below to unlock another try. This assignment\'s own Practice questions practise other skills, so they do not count toward it.'
    : 'Use the “Practice for …” button below to unlock another try.';
};

/*
 * Where the meter's correct answers came from — the recent window the unlock
 * reads (practiceMastery.mjs `sources`): "Counting now: 3 right in this
 * assignment's Practice, 2 right in “Practice for …”."
 */
const countedSoFar = (sources) => {
  const fromAssignment = Number(sources?.assignmentPractice?.correct) || 0;
  const fromRecovery = Number(sources?.recoveryPractice?.correct) || 0;
  if (!fromAssignment && !fromRecovery) return null;
  const parts = [];
  if (fromAssignment) parts.push(`${fromAssignment} right in this assignment's Practice`);
  if (fromRecovery) parts.push(`${fromRecovery} right in “Practice for …”`);
  return `Counting now: ${parts.join(', ')}.`;
};

export default function SectionRecoveryPanel({ summary = [], busySection = null, onPractice, onStart, onContinue }) {
  if (!Array.isArray(summary) || !summary.length) return null;
  const anyLocked = summary.some((entry) => entry.state === 'locked');
  return (
    <section data-section-recovery-panel="true" aria-label="Recovery" style={{ display: 'grid', gap: 10, margin: '10px 4px 14px' }}>
      {anyLocked && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)' }}>
          <strong>Recovery Available</strong>
          {/* Names the practice that counts, because "improve your Practice
              mastery" once sent students to practice that did not. */}
          <div style={{ marginTop: 2, fontSize: 'calc(13 * var(--mm-px))' }}>{lockedBannerText(summary)}</div>
        </div>
      )}
      {summary.map((entry) => {
        const busy = busySection === entry.section;
        return (
          <article key={entry.section} data-recovery-section={entry.section} data-recovery-state={entry.state} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 'calc(16 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{entry.label}</strong>
              <span style={badgeStyle(entry.state)}>{entry.badge}</span>
            </div>
            {entry.originalClosedLabel && (
              <p data-recovery-original-closed="true" style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{entry.originalClosedLabel}</p>
            )}
            {(entry.state === 'locked' || entry.state === 'unlocked') && <RecoveryMasteryMeter percent={entry.masteryPercent} />}
            <p style={{ margin: 0, fontSize: 'calc(13.5 * var(--mm-px))', lineHeight: 1.5 }}>{entry.message}</p>
            {entry.state === 'locked' && countedSoFar(entry.masterySources) && (
              <p data-recovery-counted="true" style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{countedSoFar(entry.masterySources)}</p>
            )}
            {entry.endsAtLabel && (
              <p data-recovery-ends-at="true" style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text-strong)' }}>
                Open until {entry.endsAtLabel}
              </p>
            )}
            {entry.state === 'locked' && entry.practiceRemaining > 0 && (
              <p style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
                {entry.practiceRemaining} more practice question{entry.practiceRemaining === 1 ? '' : 's'} to go.
              </p>
            )}
            {entry.result && (
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, fontSize: 'calc(13 * var(--mm-px))' }}>
                <div><dt style={{ color: 'var(--mm-text-muted)' }}>Original</dt><dd style={{ margin: 0, fontWeight: 900 }}>{entry.result.original}</dd></div>
                <div><dt style={{ color: 'var(--mm-text-muted)' }}>Recovery</dt><dd style={{ margin: 0, fontWeight: 900 }}>{entry.result.recovery}</dd></div>
                <div><dt style={{ color: 'var(--mm-text-muted)' }}>Final</dt><dd style={{ margin: 0, fontWeight: 900 }}>{entry.result.final}</dd></div>
              </dl>
            )}
            {entry.note && (
              <p data-recovery-note="true" style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{entry.note}</p>
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
