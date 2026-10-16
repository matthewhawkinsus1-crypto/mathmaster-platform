import { useEffect, useMemo, useState } from 'react';
import MathDisplay from './MathDisplay';
import {
  armFactor,
  initDistributionState,
  isDistributionComplete,
  placeOnTerm,
  undoLastPlacement,
} from './algebraDistributionModel.js';
import {
  commitRelationDistribution,
  relationDistributionCandidates,
} from './algebraRelationStructureModel.js';

/*
 * DISTRIBUTE IN THE RELATION WORKSPACE.
 *
 * The student does the algebra: picks up the multiplier and places it on each
 * term of the group (negatives and fractions included). Nothing is simplified
 * for them. The commit goes through the relation workspace's own validated
 * commit, so Undo, history and the saved draft behave like every other step.
 *
 * Combining like terms is no longer a panel here: it is a part of the one
 * Simplify control every algebra workspace shares
 * (src/platform/algebra/simplify/SimplifyPanel.jsx, student push Q).
 */

const panelStyle = {
  display: 'grid',
  gap: 8,
  marginBottom: 8,
  padding: '8px 10px',
  border: '1px solid var(--mm-primary-border)',
  borderRadius: 10,
  background: 'var(--mm-surface-tint)',
};
const chip = (active = false, done = false) => ({
  minHeight: 38,
  padding: '5px 10px',
  borderRadius: 9,
  border: active ? '2px solid #174ea6' : done ? '1px solid #81c995' : '1px solid var(--mm-primary-border)',
  background: active ? 'var(--mm-primary-soft)' : done ? 'var(--mm-success-bg)' : 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
});
const regionLabel = (branch, expressionIndex) => (
  branch?.expressions?.length === 3
    ? ['Left region', 'Middle region', 'Right region'][expressionIndex]
    : ['Left side', 'Right side'][expressionIndex] || `Expression ${expressionIndex + 1}`
);

export function RelationDistributionPanel({ state, branchIndex = 0, onCommit, onClose }) {
  const branch = state?.branches?.[branchIndex];
  const candidates = useMemo(() => relationDistributionCandidates(branch), [branch]);
  const [expressionIndex, setExpressionIndex] = useState(candidates[0]?.expressionIndex ?? null);
  const candidate = candidates.find((entry) => entry.expressionIndex === expressionIndex) || candidates[0] || null;
  const [distribution, setDistribution] = useState(() => initDistributionState(candidate?.detected));
  useEffect(() => { setDistribution(initDistributionState(candidate?.detected)); }, [candidate?.detected]);

  if (!candidate || !distribution) return null;
  const complete = isDistributionComplete(distribution);

  return (
    <div className="relation-distribution-panel" data-relation-structure="distribute" style={panelStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
        <strong style={{ color: 'var(--mm-primary-text)', fontSize: 'calc(13 * var(--mm-px))' }}>Distribute</strong>
        {candidates.length > 1 && candidates.map((entry) => (
          <button key={entry.expressionIndex} type="button" onClick={() => setExpressionIndex(entry.expressionIndex)} style={chip(entry.expressionIndex === candidate.expressionIndex)}>
            {regionLabel(branch, entry.expressionIndex)}
          </button>
        ))}
        <span style={{ fontSize: 'calc(18 * var(--mm-px))' }}>
          <MathDisplay value={`${distribution.factorLatex}\\left(${distribution.terms.map((term) => term.latex).join(' ')}\\right)`} format="latex" inline />
        </span>
        <button type="button" onClick={onClose} aria-label="Close Distribute" style={chip(false)}>×</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
        <button
          type="button"
          aria-label={`Pick up the multiplier ${distribution.factorText}`}
          aria-pressed={distribution.armed}
          disabled={complete}
          onClick={() => setDistribution((current) => armFactor(current))}
          style={chip(distribution.armed)}
        >
          <MathDisplay value={distribution.factorLatex} format="latex" inline />
        </button>
        <span aria-hidden="true" style={{ color: 'var(--mm-text-muted)' }}>→</span>
        {distribution.terms.map((term, index) => {
          const placed = distribution.placedIndices.includes(index);
          return (
            <button
              key={`${term.text}-${index}`}
              type="button"
              aria-label={`Place the multiplier on ${term.text.replace(/^\+\s*/, '')}`}
              disabled={placed || !distribution.armed}
              onClick={() => setDistribution((current) => placeOnTerm(current, index))}
              style={chip(false, placed)}
            >
              <MathDisplay
                value={placed ? `\\left(${distribution.factorLatex}\\right)\\left(${term.sign < 0 ? '-' : ''}${term.magnitudeLatex}\\right)` : term.latex}
                format="latex"
                inline
              />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
        <button
          type="button"
          disabled={!distribution.placedIndices.length}
          onClick={() => setDistribution((current) => undoLastPlacement(current))}
          style={chip(false)}
        >
          Undo placement
        </button>
        <button
          type="button"
          disabled={!complete}
          onClick={() => {
            const next = commitRelationDistribution(state, branchIndex, candidate.expressionIndex, distribution);
            if (next) onCommit?.(next, `Distributed ${distribution.factorText} across ${distribution.groupText}`, 'distribution');
          }}
          style={{ ...chip(true), background: complete ? '#174ea6' : '#9fb7df', color: '#fff' }}
        >
          Commit distribution
        </button>
        <span style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(11 * var(--mm-px))' }}>
          Pick up the multiplier, then place it on every term inside the parentheses. The products stay unsimplified until you rewrite them.
        </span>
      </div>
    </div>
  );
}
