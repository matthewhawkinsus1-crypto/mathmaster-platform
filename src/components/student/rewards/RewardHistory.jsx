import React, { useState } from 'react';
import {
  HISTORY_KIND,
  HISTORY_KIND_LABEL,
  buildRewardHistory,
  formatRewardDate,
} from '../../../platform/rewards/rewardWallet.js';

/*
 * Reward history, out of the way until asked for. Opening it reads the
 * student's rewards once (no listener) and shows ten at a time, so a student
 * with a year of rewards does not load all of it just to see My Rewards.
 */
const PAGE = 10;
const CHIP = Object.freeze({
  [HISTORY_KIND.EARNED]: 'rw-chip rw-chip--ok',
  [HISTORY_KIND.USED]: 'rw-chip rw-chip--pass',
  [HISTORY_KIND.TAKEN_BACK]: 'rw-chip rw-chip--bad',
  [HISTORY_KIND.EXPIRED]: 'rw-chip',
  [HISTORY_KIND.UNDONE]: 'rw-chip rw-chip--warn',
});

export default function RewardHistory({ loadHistory, redemptions = [], nowMs = Date.now() }) {
  const [state, setState] = useState({ status: 'idle', grants: [], error: '' });
  const [shown, setShown] = useState(PAGE);

  const load = async () => {
    if (!loadHistory || state.status === 'loading') return;
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      setState({ status: 'ready', grants: await loadHistory(), error: '' });
    } catch {
      setState({ status: 'error', grants: [], error: 'History could not load. Try again.' });
    }
  };

  const entries = state.status === 'ready' ? buildRewardHistory({ grants: state.grants, redemptions, nowMs }) : [];

  return (
    <section aria-labelledby="reward-history-heading" className="rw-card">
      <details onToggle={(event) => { if (event.currentTarget.open && state.status === 'idle') load(); }}>
        <summary className="rw-summary">
          <h2 id="reward-history-heading" style={{ display: 'inline' }}>Reward history</h2>
        </summary>
        {state.status === 'loading' && <p className="rw-muted" role="status">Loading…</p>}
        {state.status === 'error' && (
          <p className="rw-feedback rw-feedback--bad" role="alert">
            {state.error} <button type="button" className="rw-button rw-button--small rw-button--secondary" onClick={load}>Retry</button>
          </p>
        )}
        {state.status === 'ready' && entries.length === 0 && <p className="rw-muted">No rewards yet. Live Challenges and your teacher can give you one.</p>}
        {entries.length > 0 && (
          <>
            <ul className="rw-list">
              {entries.slice(0, shown).map((entry) => (
                <li key={entry.key} className="rw-row">
                  <span className="rw-row__main">
                    <span className="rw-row__title">{entry.title}</span>
                    <span className="rw-muted" style={{ display: 'block' }}>{entry.detail}</span>
                  </span>
                  <span style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                    <span className={CHIP[entry.kind]}>{HISTORY_KIND_LABEL[entry.kind]}</span>
                    <span className="rw-muted">{formatRewardDate(entry.at, nowMs)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="rw-actions">
              {entries.length > shown && (
                <button type="button" className="rw-button rw-button--secondary rw-button--small" onClick={() => setShown((count) => count + PAGE)}>Show more</button>
              )}
              <button type="button" className="rw-button rw-button--quiet rw-button--small" onClick={load}>Refresh</button>
            </div>
          </>
        )}
      </details>
    </section>
  );
}
