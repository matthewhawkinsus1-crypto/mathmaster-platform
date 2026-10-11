import React from 'react';
import { RecoveryMasteryMeter } from './SectionRecoveryPanel.jsx';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import { RECOVERY_PHASE, recoveryIsUnseen } from '../../platform/recovery/studentRecoveryDiscovery.js';

/*
 * AN OPEN RECOVERY, WHERE A STUDENT WILL ACTUALLY SEE IT.
 *
 * The Results panel (SectionRecoveryPanel) explains a Recovery in full, but a
 * student only reached it by opening View Results on that one assignment. These
 * put the same opportunity on Home, on the assignment's row in the Assignments
 * Center, and in the assignment's own header, each with the one button that
 * does the next thing: practise, start or continue.
 *
 * Presentational. Every entry arrives from buildStudentRecoveryDiscovery,
 * which is built from the same summary the Results panel renders, so these can
 * never offer a Recovery the server would refuse. "NEW" is the per-device mark
 * Test Cycle uses: it shows until the student opens that Recovery.
 */

// Saturated in both themes, so the white label keeps its contrast in dark mode
// (the same rule WhatShouldIDoNow's fill follows).
const ACTION_FILL = '#137333';

const list = (value) => (Array.isArray(value) ? value : []);

const newChipStyle = {
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  background: 'var(--mm-warning-bg)',
  color: 'var(--mm-warning-text)',
  border: '1px solid var(--mm-warning-border-soft)',
};

const badgeStyle = (phase) => ({
  display: 'inline-block',
  padding: '3px 9px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  textTransform: 'uppercase',
  background: phase === RECOVERY_PHASE.AVAILABLE ? 'var(--mm-surface-control)' : 'var(--mm-success-bg)',
  color: phase === RECOVERY_PHASE.AVAILABLE ? 'var(--mm-text)' : 'var(--mm-success-text)',
  border: `1px solid ${phase === RECOVERY_PHASE.AVAILABLE ? 'var(--mm-border-strong)' : 'var(--mm-success-border)'}`,
});

const actionStyle = {
  appearance: 'none',
  WebkitAppearance: 'none',
  fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX,
  padding: '10px 18px',
  border: 0,
  borderRadius: 10,
  background: ACTION_FILL,
  color: '#fff',
  fontWeight: 900,
  fontSize: 15,
  cursor: 'pointer',
};

function RecoveryActionButton({ opportunity, onOpen }) {
  return (
    <button
      type="button"
      data-recovery-action={opportunity.action}
      onClick={() => onOpen?.(opportunity)}
      style={actionStyle}
    >
      {opportunity.actionLabel}
    </button>
  );
}

/**
 * Home: every open Recovery, above the assignment lists, each with its next
 * step. Shown only while there is something to act on.
 */
export function RecoveryHomeSection({ opportunities = [], studentId = null, onOpen = null }) {
  const open = list(opportunities);
  if (!open.length || !onOpen) return null;
  return (
    <section
      aria-labelledby="recovery-home-heading"
      data-recovery-home="true"
      style={{
        marginBottom: 18,
        padding: '20px 22px',
        borderRadius: 16,
        background: 'var(--mm-success-subtle)',
        border: '3px solid var(--mm-success-border)',
        color: 'var(--mm-text)',
        textAlign: 'left',
        display: 'grid',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: 'var(--mm-success-text)' }}>🔁 Second chance</div>
        <h2 id="recovery-home-heading" style={{ margin: '4px 0', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
          {open.length === 1 ? 'You have a Recovery open' : `You have ${open.length} Recoveries open`}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          A Warm-Up or DOL has closed, and you can earn a second try with new questions. A Recovery can only raise your score.
        </p>
      </div>
      {open.map((opportunity) => {
        const isNew = recoveryIsUnseen(studentId, opportunity);
        return (
          <article
            key={opportunity.key}
            data-recovery-opportunity={opportunity.section}
            data-recovery-state={opportunity.state}
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: 'var(--mm-surface)',
              border: '1px solid var(--mm-success-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 16, color: 'var(--mm-text-strong)' }}>{opportunity.label}</strong>
                <span style={badgeStyle(opportunity.phase)}>{opportunity.badge}</span>
                {isNew && <span data-recovery-new="true" style={newChipStyle}>NEW</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{opportunity.assignmentTitle}</div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{opportunity.detail}</p>
              {opportunity.hint && (
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: 'var(--mm-text-muted)' }}>{opportunity.hint}</p>
              )}
              {opportunity.showMastery && <RecoveryMasteryMeter percent={opportunity.masteryPercent} />}
              {opportunity.phase === RECOVERY_PHASE.AVAILABLE && opportunity.practiceRemaining > 0 && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mm-text-muted)' }}>
                  {opportunity.practiceRemaining} more practice question{opportunity.practiceRemaining === 1 ? '' : 's'} to go.
                </p>
              )}
              {opportunity.endsAtLabel && (
                <p data-recovery-ends-at="true" style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--mm-text-strong)' }}>
                  Open until {opportunity.endsAtLabel}
                </p>
              )}
            </div>
            <RecoveryActionButton opportunity={opportunity} onOpen={onOpen} />
          </article>
        );
      })}
    </section>
  );
}

/**
 * One line per open Recovery, for a list row or an assignment's header: what
 * it is, how close it is, until when, and the button.
 */
export function RecoveryInlineNotice({ opportunities = [], studentId = null, onOpen = null }) {
  const open = list(opportunities);
  if (!open.length || !onOpen) return null;
  return (
    <div data-recovery-inline="true" style={{ display: 'grid', gap: 8, marginTop: 10 }}>
      {open.map((opportunity) => {
        const isNew = recoveryIsUnseen(studentId, opportunity);
        const facts = [
          opportunity.showMastery ? `Recovery practice mastery ${opportunity.masteryPercent}%` : null,
          opportunity.endsAtLabel ? `Open until ${opportunity.endsAtLabel}` : null,
        ].filter(Boolean).join(' · ');
        return (
          <div
            key={opportunity.key}
            data-recovery-opportunity={opportunity.section}
            data-recovery-state={opportunity.state}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '2px solid var(--mm-success-border)',
              background: 'var(--mm-success-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              textAlign: 'left',
            }}
          >
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14, color: 'var(--mm-success-text)' }}>🔁 {opportunity.headline}</strong>
                {isNew && <span data-recovery-new="true" style={newChipStyle}>NEW</span>}
              </div>
              <div style={{ marginTop: 2, fontSize: 12.5, lineHeight: 1.45, color: 'var(--mm-text)', overflowWrap: 'anywhere' }}>
                {opportunity.phase === RECOVERY_PHASE.AVAILABLE
                  ? `Your ${opportunity.sectionName} closed — earn a second try. `
                  : ''}
                {facts}
              </div>
            </div>
            <RecoveryActionButton opportunity={opportunity} onOpen={onOpen} />
          </div>
        );
      })}
    </div>
  );
}

export default RecoveryHomeSection;
