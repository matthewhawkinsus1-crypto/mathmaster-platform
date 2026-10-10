import React, { useId } from 'react';
import {
  PASS_EXPIRY_OPTIONS,
  PASS_PLACE_OPTIONS,
  RECOGNITIONS_LABEL,
  describeChallengeRewardChoice,
} from '../../platform/rewards/challengeRewardPolicy.js';

/*
 * The create panel's Rewards choice. Self-contained so the Live Challenge
 * create panel only gains one element and one payload field; the policy it
 * implies is built by challengeRewardPolicy.js and validated by the server.
 */
const field = { width: '100%', boxSizing: 'border-box', minHeight: 44, marginTop: 6, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--mm-border)', fontSize: 14 };

export default function ChallengeRewardSettings({ choice, onChange }) {
  const set = (patch) => onChange({ ...choice, ...patch });
  // Explicit label/id pairs: a select wrapped in its label is named after its
  // own options too ("Practice Pass forNobody1st place…") by screen readers.
  const id = useId();
  return (
    <fieldset style={{ marginTop: 16, padding: 14, borderRadius: 12, border: '1px solid var(--mm-accent-border)', background: 'var(--mm-surface)' }}>
      <legend style={{ fontWeight: 900, padding: '0 6px' }}>🎟️ Rewards</legend>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        <div style={{ fontWeight: 800 }}>
          <label htmlFor={`${id}-places`}>Practice Pass for</label>
          <select id={`${id}-places`} value={choice.passPlaces} onChange={(event) => set({ passPlaces: Number(event.target.value) })} style={field}>
            {PASS_PLACE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {choice.passPlaces > 0 && (
          <div style={{ fontWeight: 800 }}>
            <label htmlFor={`${id}-expiry`}>Pass expires after</label>
            <select id={`${id}-expiry`} value={choice.passExpiryDays} onChange={(event) => set({ passExpiryDays: Number(event.target.value) })} style={field}>
              {PASS_EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        )}
        <label style={{ fontWeight: 800, display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={choice.championBadge} onChange={(event) => set({ championBadge: event.target.checked })} style={{ width: 20, height: 20 }} />
          Champion badge for 1st place
        </label>
        {/* Growth, effort and comeback, not only placement: on by default. */}
        <label style={{ fontWeight: 800, display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, gridColumn: '1 / -1' }}>
          <input type="checkbox" data-mm-recognitions-toggle="1" checked={choice.recognitions !== false} onChange={(event) => set({ recognitions: event.target.checked })} style={{ width: 20, height: 20, flex: '0 0 auto' }} />
          {RECOGNITIONS_LABEL}
        </label>
      </div>
      <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
        {describeChallengeRewardChoice(choice).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </fieldset>
  );
}
