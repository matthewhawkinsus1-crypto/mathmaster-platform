/*
 * RECOVERY READINESS — THE WARM-UP AND THE DOL, SAID PLAINLY.
 *
 * One panel for Pre-Flight and the teacher's assignment details: for each of
 * the two sections, whether a fresh, equivalent, server-graded Recovery is
 * ready, and when it is not, which question stops it, why, and what fixes it.
 * It renders the planner's rows (functions/shared/recoveryContentPlan.mjs)
 * and nothing it computes itself, so it can never say "ready" when the
 * planner — and so Recovery itself — would not.
 *
 * The legitimate exceptions read as what they are, never as "not ready": a
 * Live Challenge Warm-Up (the result is the grade), Recovery turned off, a
 * secure assessment with its own retest process.
 */
import { recoveryReadinessLabel, recoveryRowLabel, recoveryVerdict } from '../../platform/recovery/recoveryReadinessCopy.js';

const SECTION_NAME = Object.freeze({ warmup: 'Warm-Up', dol: 'DOL' });

const chipStyle = (tone) => ({
  display: 'inline-block',
  padding: '2px 9px',
  borderRadius: 999,
  fontSize: 'calc(11.5 * var(--mm-px))',
  fontWeight: 900,
  background: tone ? `var(--mm-${tone}-bg)` : 'var(--mm-surface-muted)',
  color: tone ? `var(--mm-${tone}-text)` : 'var(--mm-text-muted)',
  border: `1px solid ${tone ? `var(--mm-${tone}-border)` : 'var(--mm-border)'}`,
});

// The legitimate exceptions: the section's chip and message say it all, and
// its questions are not listed (a turned-off section is not "not ready").
const EXCEPTIONS = new Set(['off', 'liveChallenge', 'secure', 'notPresent']);

// What a "not ready" question costs: a DOL Recovery needs every question; a
// Warm-Up Recovery draws its fresh questions from the ready ones and skips
// the rest (sectionRecoveryReadiness.mjs).
const notReadyConsequence = (section, status) => {
  if (section === 'dol') return 'Students are not offered a DOL Recovery until every DOL question is ready.';
  return status === 'ready'
    ? 'The Warm-Up Recovery is built from the ready questions and skips the ones marked not ready.'
    : 'Students are not offered a Warm-Up Recovery until at least one Warm-Up question is ready.';
};

export default function RecoveryReadinessPanel({
  sections = {},
  title = 'Warm-Up and DOL Recovery',
  intro = null,
  fullyReady = null,
  // 'authoring' (Pre-Flight) or 'live' (an assignment students already have):
  // whether a planned Recovery is ready on creation or awaits approval.
  context = 'authoring',
  onRepair = null,
  renderRepairControls = null,
  repairTargetIndex = null,
  children = null,
}) {
  const entries = ['warmup', 'dol'].filter((section) => sections?.[section] && sections[section].status !== 'notPresent');
  if (!entries.length) return null;
  return (
    <section data-recovery-readiness-panel="true" data-recovery-fully-ready={fullyReady === null ? undefined : String(Boolean(fullyReady))} aria-label={title} style={{ marginBottom: 18, padding: 14, border: '1px solid var(--mm-border)', borderRadius: 10, background: 'var(--mm-surface)', color: 'var(--mm-text)', display: 'grid', gap: 10, textAlign: 'left' }}>
      <strong>{title}</strong>
      {intro && <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>{intro}</p>}
      {fullyReady !== null && (
        <div data-recovery-verdict="true" style={{ fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800, color: fullyReady ? 'var(--mm-success-text)' : 'var(--mm-warning-text)' }}>
          {recoveryVerdict(sections, Boolean(fullyReady))}
        </div>
      )}
      {entries.map((section) => {
        const entry = sections[section];
        const label = recoveryReadinessLabel(entry.status);
        const exception = EXCEPTIONS.has(entry.status);
        const rows = exception || !Array.isArray(entry.rows) ? [] : entry.rows;
        const notReady = rows.filter((row) => row.status === 'unavailable');
        return (
          <div key={section} data-recovery-readiness-section={section} data-recovery-readiness-status={entry.status} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 'calc(14 * var(--mm-px))' }}>{SECTION_NAME[section]} Recovery</strong>
              <span style={chipStyle(label.tone)}>{label.text}</span>
            </div>
            {entry.message && <div style={{ fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{entry.message}</div>}
            {rows.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
                {rows.map((row) => (
                  <li key={`${section}-${row.storageIndex}`} data-recovery-readiness-row={row.status}>
                    <span>{row.label}: {recoveryRowLabel(row, context)}</span>
                    {row.status === 'unavailable' && row.issues?.[0] && (
                      <div style={{ color: 'var(--mm-warning-text)' }}>
                        {row.issues[0].message}
                        {row.issues[0].fix && <span style={{ color: 'var(--mm-text-muted)' }}> {row.issues[0].fix}</span>}
                      </div>
                    )}
                    {row.status === 'unavailable' && onRepair && (
                      <div style={{ marginTop: 4 }}>
                        <button
                          type="button"
                          data-recovery-repair={row.storageIndex}
                          onClick={() => onRepair(row)}
                          style={{ minHeight: 40, padding: '8px 12px', border: '1px solid var(--mm-primary)', borderRadius: 7, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800 }}
                        >
                          Fix for Recovery
                        </button>
                      </div>
                    )}
                    {row.status === 'unavailable' && renderRepairControls && repairTargetIndex === row.storageIndex && renderRepairControls(row)}
                  </li>
                ))}
              </ul>
            )}
            {notReady.length > 0 && (
              <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
                {notReadyConsequence(section, entry.status)}
              </div>
            )}
          </div>
        );
      })}
      {children}
    </section>
  );
}
