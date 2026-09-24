import { useEffect, useMemo, useState } from 'react';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import { splitAdditiveTerms } from './algebraAstEngine';
import {
  armFactor,
  initDistributionState,
  isDistributionComplete,
  placeOnTerm,
  undoLastPlacement,
} from './algebraDistributionModel.js';
import {
  commitRelationDistribution,
  commitRelationLikeTerms,
  relationDistributionCandidates,
  relationLikeTermCandidates,
} from './algebraRelationStructureModel.js';

/*
 * DISTRIBUTE AND COMBINE LIKE TERMS IN THE RELATION WORKSPACE.
 *
 * The student does the algebra: picks up the multiplier and places it on each
 * term of the group (negatives and fractions included), or chooses the like
 * terms and types the single term they combine to. Nothing is simplified for
 * them. Each commit goes through the relation workspace's own validated
 * commit, so Undo, history and the saved draft behave like every other step.
 */

const panelStyle = {
  display: 'grid',
  gap: 8,
  marginBottom: 8,
  padding: '8px 10px',
  border: '1px solid #b8c8e3',
  borderRadius: 10,
  background: '#f8fbff',
};
const chip = (active = false, done = false) => ({
  minHeight: 38,
  padding: '5px 10px',
  borderRadius: 9,
  border: active ? '2px solid #174ea6' : done ? '1px solid #81c995' : '1px solid #b8c8e3',
  background: active ? '#e8f0fe' : done ? '#e6f4ea' : '#fff',
  color: '#174ea6',
  fontWeight: 800,
  cursor: 'pointer',
  colorScheme: 'light',
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
        <strong style={{ color: '#174ea6', fontSize: 13 }}>Distribute</strong>
        {candidates.length > 1 && candidates.map((entry) => (
          <button key={entry.expressionIndex} type="button" onClick={() => setExpressionIndex(entry.expressionIndex)} style={chip(entry.expressionIndex === candidate.expressionIndex)}>
            {regionLabel(branch, entry.expressionIndex)}
          </button>
        ))}
        <span style={{ fontSize: 18 }}>
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
        <span aria-hidden="true" style={{ color: '#5f6368' }}>→</span>
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
        <span style={{ color: '#6b7280', fontSize: 11 }}>
          Pick up the multiplier, then place it on every term inside the parentheses. The products stay unsimplified until you rewrite them.
        </span>
      </div>
    </div>
  );
}

export function RelationLikeTermsPanel({ state, branchIndex = 0, onCommit, onClose }) {
  const branch = state?.branches?.[branchIndex];
  const candidates = useMemo(() => relationLikeTermCandidates(branch), [branch]);
  const [expressionIndex, setExpressionIndex] = useState(candidates[0]?.expressionIndex ?? null);
  const candidate = candidates.find((entry) => entry.expressionIndex === expressionIndex) || candidates[0] || null;
  const terms = useMemo(() => (candidate ? splitAdditiveTerms(branch.expressions[candidate.expressionIndex]) || [] : []), [branch, candidate]);
  const [selected, setSelected] = useState([]);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [focusSignal, setFocusSignal] = useState(0);
  useEffect(() => { setSelected([]); setValue(''); setReason(''); }, [candidate?.expressionIndex, branch]);
  useEffect(() => { if (selected.length >= 2) setFocusSignal((signal) => signal + 1); }, [selected.length]);

  if (!candidate) return null;

  const check = async () => {
    const result = commitRelationLikeTerms(state, branchIndex, candidate.expressionIndex, selected, value);
    if (!result.next) { setReason(result.reason); return; }
    const committed = await onCommit?.(result.next, 'Combined like terms', 'combine-like-terms');
    if (committed === false) setReason('That term is not the sum of the terms you chose.');
  };

  return (
    <div className="relation-like-terms-panel" data-relation-structure="combine" style={panelStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
        <strong style={{ color: '#174ea6', fontSize: 13 }}>Combine like terms</strong>
        {candidates.length > 1 && candidates.map((entry) => (
          <button key={entry.expressionIndex} type="button" onClick={() => setExpressionIndex(entry.expressionIndex)} style={chip(entry.expressionIndex === candidate.expressionIndex)}>
            {regionLabel(branch, entry.expressionIndex)}
          </button>
        ))}
        <button type="button" onClick={onClose} aria-label="Close Combine like terms" style={chip(false)}>×</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {terms.map((term, index) => {
          const isSelected = selected.includes(index);
          return (
            <button
              key={`${term.text}-${index}`}
              type="button"
              aria-label={`${term.text.replace(/^\+\s*/, '')}, select as a term to combine`}
              aria-pressed={isSelected}
              onClick={() => setSelected((current) => (isSelected ? current.filter((entry) => entry !== index) : [...current, index]))}
              style={chip(isSelected)}
            >
              <MathDisplay value={term.latex} format="latex" inline />
            </button>
          );
        })}
      </div>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}
        onKeyDownCapture={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.repeat || event.nativeEvent?.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          void check();
        }}
      >
        <div style={{ flex: '1 1 220px', minWidth: 180 }}>
          <MathInput
            value={value}
            onChange={setValue}
            placeholder="The single combined term"
            ariaLabel="Enter the single term these selected terms combine to. Press Enter to check."
            toolProfile="algebra-operation"
            compact
            focusSignal={focusSignal}
          />
        </div>
        <button type="button" disabled={selected.length < 2} onClick={check} style={{ ...chip(true), background: selected.length >= 2 ? '#174ea6' : '#9fb7df', color: '#fff' }}>
          Check
        </button>
      </div>
      {reason && <div role="status" style={{ color: '#a50e0e', fontSize: 12.5 }}>{reason}</div>}
    </div>
  );
}
