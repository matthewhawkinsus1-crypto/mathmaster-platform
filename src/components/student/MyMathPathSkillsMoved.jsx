import React from 'react';
import { SKILLS_MOVED_STATE } from '../../platform/mastery/sessionSkillMovement.js';

// "Skills that moved" on the session end screen. The state is computed by
// describeSessionSkillsMoved (src/platform/mastery/sessionSkillMovement.js);
// this only draws it. Statuses come from the one Mastered rule, so a skill is
// never called Mastered here that the map and the wheel do not also call so.

const BOX = {
  margin: '0 0 18px',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--mm-tint-border)',
  background: 'var(--mm-surface-tint)',
  textAlign: 'left',
};

const HEADING = {
  margin: '0 0 6px',
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--mm-primary-text)',
};

const percent = (value) => (value == null ? null : `${value}%`);

function Move({ move }) {
  const estimateChanged = move.estimateBefore !== move.estimateAfter;
  const statusChanged = move.statusBefore !== move.statusAfter;
  return (
    <li style={{ listStyle: 'none', display: 'grid', gap: 2, padding: '7px 0', borderTop: '1px solid var(--mm-tint-border)' }}>
      <strong style={{ color: 'var(--mm-text-strong)', fontSize: 14.5 }}>{move.label}</strong>
      <span style={{ color: 'var(--mm-text)', fontSize: 14, lineHeight: 1.5 }}>
        {estimateChanged
          ? <>{percent(move.estimateBefore) || 'New'} <span aria-label="to">→</span> <strong>{percent(move.estimateAfter) || '—'}</strong></>
          : percent(move.estimateAfter)}
        {statusChanged && (
          <>
            {(estimateChanged || move.estimateAfter != null) ? ' · ' : ''}
            {move.statusBefore} <span aria-label="to">→</span> <strong>{move.statusAfter}</strong>
          </>
        )}
      </span>
    </li>
  );
}

export default function MyMathPathSkillsMoved({ skillsMoved = null }) {
  const state = skillsMoved?.state || SKILLS_MOVED_STATE.NONE;
  if (state === SKILLS_MOVED_STATE.NONE) return null;

  if (state === SKILLS_MOVED_STATE.PENDING || state === SKILLS_MOVED_STATE.DELAYED) {
    return (
      <section style={BOX} aria-label="Skills that moved">
        <h2 style={HEADING}>Skills that moved</h2>
        <p role="status" aria-live="polite" style={{ margin: 0, color: 'var(--mm-text)', fontSize: 14, lineHeight: 1.55 }}>
          {state === SKILLS_MOVED_STATE.PENDING
            ? 'Updating your skills…'
            : 'Your skill updates are still on their way. They will show on My Math Path in a moment.'}
        </p>
      </section>
    );
  }

  const moves = Array.isArray(skillsMoved?.moves) ? skillsMoved.moves : [];
  return (
    <section style={BOX} aria-label="Skills that moved">
      <h2 style={HEADING}>Skills that moved</h2>
      {moves.length ? (
        <ul style={{ margin: 0, padding: 0 }}>
          {moves.map((move) => <Move key={move.code} move={move} />)}
        </ul>
      ) : (
        <p role="status" style={{ margin: 0, color: 'var(--mm-text)', fontSize: 14, lineHeight: 1.55 }}>
          No skill levels changed this time. Every answer you gave is saved as evidence.
        </p>
      )}
    </section>
  );
}
