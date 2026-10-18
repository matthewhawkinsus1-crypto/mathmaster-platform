/*
 * NOTICES THAT APPEAR ONLY WHEN SOMETHING HAPPENS IN CLASS (student pass 3).
 *
 * Their own chunk, so the first load of Home does not carry them: App loads it
 * lazily, prefetches it once Home is idle (with the workspace's code), and
 * renders each inside its own <Suspense fallback={null}> so a notice still
 * loading never suspends the screen around it.
 *
 *   PackUpLine            the last five minutes of the period (NAV-24): a slim
 *                         row of the pinned identity stack.
 *   WorkspaceLobbyInvite  the Live Challenge lobby, inside an assignment
 *                         (NAV-25); the game's exit comes back to the question.
 */
import React from 'react';
import DOLCountdown from './DOLCountdown.jsx';

export function PackUpLine({ unsent = false, endsAt = null }) {
  return (
    <div
      data-pack-up-notice={unsent ? 'unsent' : 'saved'}
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center', columnGap: 10, rowGap: 2,
        // The theme's warning pair, readable in both themes (the old banner put
        // --mm-text-strong on a fixed yellow: light on yellow in dark mode).
        background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', borderBottom: '3px solid #f9ab00',
        padding: '5px clamp(10px, 3vw, 22px)', textAlign: 'center', lineHeight: 1.3,
        fontFamily: '"Segoe UI", sans-serif', fontSize: 'calc(14 * var(--mm-px))',
      }}
    >
      {/* Work saves as it is entered, so it says so — unless this device still
          holds work that has not been sent. Only this sentence is the alert:
          the countdown is outside it, so it is not re-announced every second. */}
      <strong role="alert" style={{ fontWeight: 900 }}>
        {unsent
          ? 'Finish up — some work has not been sent yet, so keep this tab open.'
          : 'Finish up — your work is saved.'}
      </strong>
      <span style={{ fontWeight: 700 }}>
        Pack up and return your device. The bell is in <DOLCountdown endsAt={endsAt} />.
      </span>
    </div>
  );
}

export function WorkspaceLobbyInvite({ onJoin }) {
  return (
    <section className="mathmaster-assignment-banner" aria-label="Live Challenge" data-live-challenge-invite style={{ marginBottom: '16px', padding: '12px 18px', borderRadius: '13px', background: 'var(--mm-primary-soft)', border: '2px solid #1a73e8', color: 'var(--mm-primary-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', textAlign: 'left' }}>
      <span style={{ fontWeight: 900, minWidth: 0, overflowWrap: 'anywhere' }}><span aria-hidden="true">⚡ </span>Your teacher opened the Live Challenge lobby. Your work is saved, and you come back to this question after the game.</span>
      <button type="button" onClick={onJoin} style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 10, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}>Enter Challenge Lobby</button>
    </section>
  );
}
