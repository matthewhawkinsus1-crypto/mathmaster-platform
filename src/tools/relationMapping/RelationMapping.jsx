import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';

const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButton = { ...primaryButton, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' };
const inputStyle = { width: '100%', padding: '11px 12px', border: '1px solid #cdd6e4', borderRadius: 9, fontSize: 16, minHeight: 44, boxSizing: 'border-box' };

const WIDTH = 420;
const ROW = 46;
const PAD_Y = 34;
const LEFT_X = 118;
const RIGHT_X = WIDTH - 118;

const uniqueSorted = (values) => [...new Set(values.map(Number))].sort((a, b) => a - b);
const parseList = (text) => String(text || '')
  .split(/[,;]/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map(Number)
  .filter((value) => Number.isFinite(value));

const sameSet = (left, right) => {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-9);
};

const normalizePair = (pair) => {
  const rawX = Array.isArray(pair) ? pair[0] : pair?.x;
  const rawY = Array.isArray(pair) ? pair[1] : pair?.y;
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

// A relation is a function when no domain value is sent to two different range
// values — which is exactly what a mapping diagram makes visible.
const relationIsFunction = (pairs) => {
  const seen = new Map();
  return pairs.every(([x, y]) => {
    if (!seen.has(x)) { seen.set(x, y); return true; }
    return Math.abs(seen.get(x) - y) < 1e-9;
  });
};

export default function RelationMapping({ questionData = {}, onAction }) {
  const pairs = useMemo(() => (Array.isArray(questionData.pairs) ? questionData.pairs : [])
    .map(normalizePair)
    .filter(Boolean), [questionData.pairs]);

  const domainValues = useMemo(() => uniqueSorted(pairs.map(([x]) => x)), [pairs]);
  const rangeValues = useMemo(() => uniqueSorted(pairs.map(([, y]) => y)), [pairs]);
  const ask = useMemo(() => {
    const requested = Array.isArray(questionData.ask) ? questionData.ask : [];
    return requested.length ? requested : ['mapping', 'domain', 'range'];
  }, [questionData.ask]);

  const [arrows, setArrows] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [domainAnswer, setDomainAnswer] = useState('');
  const [rangeAnswer, setRangeAnswer] = useState('');
  const [functionAnswer, setFunctionAnswer] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const height = Math.max(domainValues.length, rangeValues.length) * ROW + PAD_Y * 2;
  const yFor = (index, count) => PAD_Y + index * ROW + (Math.max(domainValues.length, rangeValues.length) - count) * ROW / 2;

  const toggleArrow = (x, y) => {
    clearFeedback();
    setArrows((current) => {
      const existing = current.findIndex((arrow) => arrow[0] === x && arrow[1] === y);
      if (existing >= 0) return current.filter((_, index) => index !== existing);
      return [...current, [x, y]];
    });
  };

  const handleRangeClick = (y) => {
    if (selectedDomain == null) return;
    toggleArrow(selectedDomain, y);
    setSelectedDomain(null);
  };

  const check = () => {
    const checks = {};
    if (ask.includes('mapping')) {
      const drawn = arrows.map(([x, y]) => `${x}->${y}`).sort();
      const expectedArrows = pairs.map(([x, y]) => `${x}->${y}`).sort();
      checks.mapping = drawn.length === expectedArrows.length && drawn.every((value, index) => value === expectedArrows[index]);
    }
    if (ask.includes('domain')) checks.domain = sameSet(parseList(domainAnswer), domainValues);
    if (ask.includes('range')) checks.range = sameSet(parseList(rangeAnswer), rangeValues);
    if (ask.includes('isFunction')) checks.isFunction = (functionAnswer === 'yes') === relationIsFunction(pairs);

    const values = Object.values(checks);
    const score = values.length ? values.filter(Boolean).length / values.length : 0;
    submit(
      { isCorrect: values.every(Boolean), score },
      { arrows, domain: parseList(domainAnswer), range: parseList(rangeAnswer), isFunction: functionAnswer },
      { checks },
    );
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — the diagram and your answers agree with the relation.';
    const checks = feedback.metadata?.checks || {};
    if (checks.mapping === false && !arrows.length) return 'No arrows drawn yet. Click a value on the left, then the value on the right it maps to.';
    if (checks.mapping === false) return 'The arrows do not match the relation. Work through the ordered pairs one at a time — each pair is one arrow.';
    if (checks.domain === false) return 'The domain is not right. It is the set of every x-value that appears, listed once each.';
    if (checks.range === false) return 'The range is not right. It is the set of every y-value that appears, listed once each.';
    if (checks.isFunction === false) return 'Look again at the arrows. A relation fails to be a function only when one left-hand value has two arrows going to different right-hand values.';
    return 'Not quite — compare each ordered pair against your diagram.';
  };

  if (!pairs.length) {
    return (
      <ToolShell title="Build the Mapping Diagram" subtitle="Represent a relation as a mapping between two sets." badge="Relations">
        <Panel title="Nothing to map">
          <p style={{ margin: 0, color: '#5f6b7a' }}>This question has no ordered pairs to map. Let your teacher know.</p>
        </Panel>
      </ToolShell>
    );
  }

  return (
    <ToolShell
      title="Build the Mapping Diagram"
      subtitle="A relation drawn as two sets with arrows between them — the clearest way to see whether it is a function."
      badge="Relations and functions"
    >
      <TaskCard
        question={questionData}
        task={questionData.prompt || `Build the mapping diagram for {${pairs.map(([x, y]) => `(${x}, ${y})`).join(', ')}}.`}
        steps={[
          'Click a value in the left column, then click the value on the right it maps to.',
          'Click an arrow again to remove it.',
          'Then answer the questions about the relation.',
        ]}
      />

      <ToolSplit>
        <Panel title="Mapping diagram">
          <svg viewBox={`0 0 ${WIDTH} ${height}`} role="application" aria-label="Mapping diagram" style={{ width: '100%', height: 'auto', border: '1px solid #d9e2f1', borderRadius: 12, background: '#fff' }}>
            <text x={LEFT_X} y={18} textAnchor="middle" fontSize="13" fontWeight="700" fill="#5f6b7a">{questionData.domainLabel || 'Domain (x)'}</text>
            <text x={RIGHT_X} y={18} textAnchor="middle" fontSize="13" fontWeight="700" fill="#5f6b7a">{questionData.rangeLabel || 'Range (y)'}</text>

            <ellipse cx={LEFT_X} cy={height / 2} rx="58" ry={domainValues.length * ROW / 2 + 18} fill="#f4f8ff" stroke="#9bb8e8" strokeWidth="2" />
            <ellipse cx={RIGHT_X} cy={height / 2} rx="58" ry={rangeValues.length * ROW / 2 + 18} fill="#f7f4ff" stroke="#b9a3e8" strokeWidth="2" />

            {arrows.map(([x, y], index) => {
              const from = domainValues.indexOf(x);
              const to = rangeValues.indexOf(y);
              if (from < 0 || to < 0) return null;
              return (
                <line
                  key={index}
                  x1={LEFT_X + 40} y1={yFor(from, domainValues.length)}
                  x2={RIGHT_X - 40} y2={yFor(to, rangeValues.length)}
                  stroke="#1a73e8" strokeWidth="2.5" markerEnd="url(#arrowhead)"
                />
              );
            })}
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#1a73e8" />
              </marker>
            </defs>

            {domainValues.map((value, index) => (
              <g
                key={`d${value}`}
                data-domain-node={value}
                role="button"
                tabIndex={0}
                aria-pressed={selectedDomain === value}
                aria-label={`Domain value ${value}`}
                onClick={() => { clearFeedback(); setSelectedDomain(selectedDomain === value ? null : value); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); clearFeedback(); setSelectedDomain(selectedDomain === value ? null : value); } }}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={LEFT_X} cy={yFor(index, domainValues.length)} r="17" fill={selectedDomain === value ? '#1a73e8' : '#fff'} stroke="#1a73e8" strokeWidth="2" />
                {/* The label must not swallow the click aimed at its circle. */}
                <text pointerEvents="none" x={LEFT_X} y={yFor(index, domainValues.length) + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={selectedDomain === value ? '#fff' : '#174ea6'}>{value}</text>
              </g>
            ))}

            {rangeValues.map((value, index) => (
              <g
                key={`r${value}`}
                data-range-node={value}
                role="button"
                tabIndex={0}
                aria-label={`Range value ${value}`}
                onClick={() => handleRangeClick(value)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleRangeClick(value); } }}
                style={{ cursor: selectedDomain == null ? 'default' : 'pointer' }}
              >
                <circle cx={RIGHT_X} cy={yFor(index, rangeValues.length)} r="17" fill="#fff" stroke="#8a3ffc" strokeWidth="2" opacity={selectedDomain == null ? 0.55 : 1} />
                <text pointerEvents="none" x={RIGHT_X} y={yFor(index, rangeValues.length) + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#6f2da8">{value}</text>
              </g>
            ))}
          </svg>

          <p aria-live="polite" style={{ marginTop: 10, fontSize: 13, color: '#5f6b7a' }}>
            {selectedDomain != null
              ? `${selectedDomain} selected — now click the value it maps to.`
              : `${arrows.length} arrow${arrows.length === 1 ? '' : 's'} drawn.`}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => { clearFeedback(); setArrows([]); setSelectedDomain(null); }} disabled={!arrows.length} style={{ ...secondaryButton, opacity: arrows.length ? 1 : 0.5 }}>Clear arrows</button>
          </div>
        </Panel>

        <Panel title="Describe the relation">
          {ask.includes('domain') && (
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 12 }}>
              Domain (list the values, separated by commas)
              <input value={domainAnswer} onChange={(event) => { setDomainAnswer(event.target.value); clearFeedback(); }} placeholder="e.g. -4, -2, 1, 3" style={inputStyle} />
            </label>
          )}
          {ask.includes('range') && (
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 12 }}>
              Range (list the values, separated by commas)
              <input value={rangeAnswer} onChange={(event) => { setRangeAnswer(event.target.value); clearFeedback(); }} placeholder="e.g. -3, -1, 2, 3" style={inputStyle} />
            </label>
          )}
          {ask.includes('isFunction') && (
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 12 }}>
              Is this relation a function?
              <select value={functionAnswer} onChange={(event) => { setFunctionAnswer(event.target.value); clearFeedback(); }} style={inputStyle}>
                <option value="">Choose…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          )}

          <button type="button" onClick={check} style={{ ...primaryButton, width: '100%' }}>Check</button>

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              <p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{message()}</p>
            </div>
          ) : null}

          <HintPanel
            hints={[
              'Each ordered pair (x, y) is one arrow: from x on the left to y on the right.',
              'The domain is every value that appears on the left; the range is every value on the right. List each one once, even if it appears in several pairs.',
              'A relation is a function when every left-hand value has exactly one arrow leaving it. Two arrows from the same left value to different right values means it is not.',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolSplit>
    </ToolShell>
  );
}
