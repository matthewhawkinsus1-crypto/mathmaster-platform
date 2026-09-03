import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import MathDisplay from '../../MathDisplay';
import { matchesFieldAnswer } from '../../answerUtils';
import { choiceSeed, stableShuffleChoices, strengthenTwoChoiceSet } from '../../platform/interaction/choiceOptions.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';

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


const PLOT_SIZE = 430;
const PLOT_PAD = 34;

function RelationCoordinatePlot({ bounds, points, onTogglePoint, snapStep = 1 }) {
  const { xMin, xMax, yMin, yMax } = bounds;
  const width = PLOT_SIZE - PLOT_PAD * 2;
  const height = PLOT_SIZE - PLOT_PAD * 2;
  const xToPx = (x) => PLOT_PAD + ((x - xMin) / (xMax - xMin)) * width;
  const yToPx = (y) => PLOT_PAD + ((yMax - y) / (yMax - yMin)) * height;
  const xTicks = Array.from({ length: Math.max(0, Math.floor(xMax) - Math.ceil(xMin) + 1) }, (_, i) => Math.ceil(xMin) + i);
  const yTicks = Array.from({ length: Math.max(0, Math.floor(yMax) - Math.ceil(yMin) + 1) }, (_, i) => Math.ceil(yMin) + i);
  const [hoverPoint, setHoverPoint] = useState(null);
  const step = Number.isFinite(Number(snapStep)) && Number(snapStep) > 0 ? Number(snapStep) : 1;
  const snap = (value) => Number((Math.round(value / step) * step).toFixed(8));

  const pointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * PLOT_SIZE;
    const svgY = ((event.clientY - rect.top) / rect.height) * PLOT_SIZE;
    const rawX = xMin + ((svgX - PLOT_PAD) / width) * (xMax - xMin);
    const rawY = yMax - ((svgY - PLOT_PAD) / height) * (yMax - yMin);
    const x = snap(rawX);
    const y = snap(rawY);
    if (x < xMin || x > xMax || y < yMin || y > yMax) return null;
    return [x, y];
  };

  const handleClick = (event) => {
    const point = pointFromEvent(event);
    if (point) onTogglePoint?.(point[0], point[1]);
  };

  const handleMove = (event) => {
    setHoverPoint(pointFromEvent(event));
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverPoint(null)}
        role="application"
        aria-label="Coordinate plane for plotting the relation"
        style={{ width: '100%', maxWidth: 520, display: 'block', margin: '0 auto', background: '#fff', border: '1px solid #d9e2f1', borderRadius: 12, cursor: 'crosshair' }}
      >
        {xTicks.map((x) => <line key={`gx${x}`} x1={xToPx(x)} x2={xToPx(x)} y1={PLOT_PAD} y2={PLOT_SIZE - PLOT_PAD} stroke="#e5e9f0" strokeWidth="1" />)}
        {yTicks.map((y) => <line key={`gy${y}`} x1={PLOT_PAD} x2={PLOT_SIZE - PLOT_PAD} y1={yToPx(y)} y2={yToPx(y)} stroke="#e5e9f0" strokeWidth="1" />)}
        {xMin <= 0 && xMax >= 0 ? <line x1={xToPx(0)} x2={xToPx(0)} y1={PLOT_PAD} y2={PLOT_SIZE - PLOT_PAD} stroke="#445" strokeWidth="2" /> : null}
        {yMin <= 0 && yMax >= 0 ? <line x1={PLOT_PAD} x2={PLOT_SIZE - PLOT_PAD} y1={yToPx(0)} y2={yToPx(0)} stroke="#445" strokeWidth="2" /> : null}
        {xTicks.map((x) => (x === 0 ? null : <text key={`tx${x}`} x={xToPx(x)} y={yToPx(0) + 17} textAnchor="middle" fontSize="10" fill="#5f6b7a">{x}</text>))}
        {yTicks.map((y) => (y === 0 ? null : <text key={`ty${y}`} x={xToPx(0) - 9} y={yToPx(y) + 4} textAnchor="end" fontSize="10" fill="#5f6b7a">{y}</text>))}

        {hoverPoint ? (
          <g pointerEvents="none">
            <line x1={xToPx(hoverPoint[0])} x2={xToPx(hoverPoint[0])} y1={PLOT_PAD} y2={PLOT_SIZE - PLOT_PAD} stroke="#f9ab00" strokeWidth="2" strokeDasharray="5 5" />
            <line x1={PLOT_PAD} x2={PLOT_SIZE - PLOT_PAD} y1={yToPx(hoverPoint[1])} y2={yToPx(hoverPoint[1])} stroke="#f9ab00" strokeWidth="2" strokeDasharray="5 5" />
            <circle cx={xToPx(hoverPoint[0])} cy={yToPx(hoverPoint[1])} r="9" fill="#fff4ce" stroke="#f9ab00" strokeWidth="3" />
            <rect x={Math.min(PLOT_SIZE - 112, xToPx(hoverPoint[0]) + 12)} y={Math.max(PLOT_PAD, yToPx(hoverPoint[1]) - 34)} width="96" height="27" rx="7" fill="#202124" opacity="0.9" />
            <text x={Math.min(PLOT_SIZE - 64, xToPx(hoverPoint[0]) + 60)} y={Math.max(PLOT_PAD + 18, yToPx(hoverPoint[1]) - 16)} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">({hoverPoint[0]}, {hoverPoint[1]})</text>
          </g>
        ) : null}

        {points.map(([x, y]) => <circle key={`${x}|${y}`} cx={xToPx(x)} cy={yToPx(y)} r="7" fill="#1a73e8" stroke="#fff" strokeWidth="2" pointerEvents="none" />)}
        <text x={PLOT_SIZE - PLOT_PAD + 12} y={yMin <= 0 && yMax >= 0 ? yToPx(0) + 4 : PLOT_SIZE - PLOT_PAD + 18} fontSize="13" fontWeight="700" fill="#3c4756">x</text>
        <text x={xMin <= 0 && xMax >= 0 ? xToPx(0) + 8 : PLOT_PAD - 4} y={PLOT_PAD - 12} fontSize="13" fontWeight="700" fill="#3c4756">y</text>
      </svg>
      <p aria-live="polite" style={{ margin: '8px 0 0', minHeight: 20, textAlign: 'center', color: '#5f6b7a', fontSize: 12 }}>
        {hoverPoint ? `Cursor: (${hoverPoint[0]}, ${hoverPoint[1]}) — click to plot this point.` : 'Move the pointer over the grid to see the exact coordinate before you click.'}
      </p>
    </div>
  );
}

export default function RelationMapping({ questionData = {}, onAction }) {
  const pairs = useMemo(() => (Array.isArray(questionData.pairs) ? questionData.pairs : [])
    .map(normalizePair)
    .filter(Boolean), [questionData.pairs]);

  const domainValues = useMemo(() => uniqueSorted(pairs.map(([x]) => x)), [pairs]);
  const rangeValues = useMemo(() => uniqueSorted(pairs.map(([, y]) => y)), [pairs]);
  const ask = useMemo(() => (
    Array.isArray(questionData.ask) ? questionData.ask : ['mapping', 'domain', 'range']
  ), [questionData.ask]);
  const analysisFields = useMemo(
    () => (Array.isArray(questionData.answerFields) ? questionData.answerFields.filter((field) => field?.id) : []),
    [questionData.answerFields],
  );
  const allowTypedPlot = questionData.plotEntryMode === 'typed' || questionData.plotEntryMode === 'clickOrType';

  const [arrows, setArrows] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [domainAnswer, setDomainAnswer] = useState('');
  const [rangeAnswer, setRangeAnswer] = useState('');
  const [functionAnswer, setFunctionAnswer] = useState('');
  const [fieldAnswers, setFieldAnswers] = useState({});
  const [plottedPoints, setPlottedPoints] = useState([]);
  const [plotX, setPlotX] = useState('');
  const [plotY, setPlotY] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const plotBounds = useMemo(() => {
    const xs = pairs.map(([x]) => x);
    const ys = pairs.map(([, y]) => y);
    const rawMinX = Math.floor(Math.min(...xs) - 1);
    const rawMaxX = Math.ceil(Math.max(...xs) + 1);
    const rawMinY = Math.floor(Math.min(...ys) - 1);
    const rawMaxY = Math.ceil(Math.max(...ys) + 1);
    return {
      xMin: Math.min(-5, rawMinX),
      xMax: Math.max(5, rawMaxX),
      yMin: Math.min(-5, rawMinY),
      yMax: Math.max(5, rawMaxY),
    };
  }, [pairs]);

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

  const samePairSet = (studentPairs, expectedPairs) => {
    const key = ([x, y]) => `${Number(x).toFixed(8)}|${Number(y).toFixed(8)}`;
    const student = new Set(studentPairs.map(key));
    const expected = new Set(expectedPairs.map(key));
    return student.size === expected.size && [...expected].every((pair) => student.has(pair));
  };

  const togglePlottedPoint = (x, y) => {
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    clearFeedback();
    setPlottedPoints((current) => {
      const exists = current.some(([px, py]) => Math.abs(px - nx) < 1e-9 && Math.abs(py - ny) < 1e-9);
      return exists
        ? current.filter(([px, py]) => Math.abs(px - nx) >= 1e-9 || Math.abs(py - ny) >= 1e-9)
        : [...current, [nx, ny]];
    });
  };

  const addTypedPoint = () => {
    const x = Number(String(plotX).replace(/[−–—]/g, '-'));
    const y = Number(String(plotY).replace(/[−–—]/g, '-'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    togglePlottedPoint(x, y);
    setPlotX('');
    setPlotY('');
  };

  const functionChoiceOptions = useMemo(() => stableShuffleChoices([
    { value: 'yes-definition', label: 'Yes — every input has exactly one output.' },
    { value: 'yes-output-rule', label: 'Yes — every output value is used only once.' },
    { value: 'no-input-repeat', label: 'No — at least one input has more than one output.' },
    { value: 'no-output-repeat', label: 'No — at least one output value repeats.' },
  ], choiceSeed(questionData.questionId || questionData.prompt, 'relation-function-status')), [questionData.questionId, questionData.prompt]);

  const correctFunctionChoice = relationIsFunction(pairs) ? 'yes-definition' : 'no-input-repeat';

  const optionsForField = (field) => {
    const authored = Array.isArray(field?.options) ? field.options : [];
    return stableShuffleChoices(
      strengthenTwoChoiceSet(authored),
      choiceSeed(questionData.questionId || questionData.prompt, field.id),
    );
  };

  const check = () => {
    const checks = {};
    if (ask.includes('plot')) checks.plot = samePairSet(plottedPoints, pairs);
    if (ask.includes('mapping')) {
      const drawn = arrows.map(([x, y]) => `${x}->${y}`).sort();
      const expectedArrows = pairs.map(([x, y]) => `${x}->${y}`).sort();
      checks.mapping = drawn.length === expectedArrows.length && drawn.every((value, index) => value === expectedArrows[index]);
    }
    if (ask.includes('domain')) checks.domain = sameSet(parseList(domainAnswer), domainValues);
    if (ask.includes('range')) checks.range = sameSet(parseList(rangeAnswer), rangeValues);
    if (ask.includes('isFunction')) checks.isFunction = functionAnswer === correctFunctionChoice;
    analysisFields.forEach((field) => {
      checks[`field:${field.id}`] = matchesFieldAnswer(String(fieldAnswers[field.id] ?? ''), field);
    });

    const values = Object.values(checks);
    const score = values.length ? values.filter(Boolean).length / values.length : 0;
    submit(
      { isCorrect: values.every(Boolean), score },
      { plottedPoints, arrows, domain: parseList(domainAnswer), range: parseList(rangeAnswer), isFunction: functionAnswer, fields: fieldAnswers },
      { checks },
    );
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — the diagram and your answers agree with the relation.';
    const checks = feedback.metadata?.checks || {};
    if (checks.plot === false && !plottedPoints.length) return 'No points plotted yet. Plot each ordered pair on the coordinate plane.';
    if (checks.plot === false) return 'The coordinate plot does not match the relation yet. Check each ordered pair (x, y).';
    if (checks.mapping === false && !arrows.length) return 'No arrows drawn yet. Click a value on the left, then the value on the right it maps to.';
    if (checks.mapping === false) return 'The arrows do not match the relation. Work through the ordered pairs one at a time — each pair is one arrow.';
    if (checks.domain === false) return 'The domain is not right. It is the set of every x-value that appears, listed once each.';
    if (checks.range === false) return 'The range is not right. It is the set of every y-value that appears, listed once each.';
    if (checks.isFunction === false) return 'Look again at the arrows. A relation fails to be a function only when one input points to more than one output.';
    const wrongField = analysisFields.find((field) => checks[`field:${field.id}`] === false);
    if (wrongField) return `Review “${wrongField.label || wrongField.id}” and use the plotted relation, not the order of the answer choices.`;
    return 'Not quite — compare each ordered pair against your diagram and then answer every requested part.';
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
          ...(ask.includes('plot') ? ['Plot every ordered pair manually on the coordinate plane. Use the coordinate guide to line up x and y before you click.'] : []),
          ...(ask.includes('mapping') ? ['Click a value in the left column, then click the value on the right it maps to.', 'Click an arrow again to remove it.'] : []),
          'Then answer the questions about the relation.',
        ]}
      />

      {questionData.showGivenRelation !== false ? (
        <Panel title="Given relation">
          <p style={{ margin: '0 0 8px', color: '#5f6b7a' }}>Use these ordered pairs to build the mapping, plot, domain, and range.</p>
          <div aria-label="Given ordered pairs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pairs.map(([x, y]) => (
              <span key={`${x}|${y}`} style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 10px', borderRadius: 999, border: '1px solid #cdd6e4', background: '#f8fbff', fontWeight: 700 }}>
                <MathDisplay value={`(${x}, ${y})`} format="ascii-math" inline ariaLabel={`Ordered pair ${x}, ${y}`} />
              </span>
            ))}
          </div>
        </Panel>
      ) : null}

      {ask.includes('plot') ? (
        <Panel title="Coordinate plot">
          <RelationCoordinatePlot
            bounds={plotBounds}
            points={plottedPoints}
            onTogglePoint={togglePlottedPoint}
            snapStep={questionData.plotSnapStep || 1}
          />
          <p style={{ margin: '10px 0 8px', fontSize: 13, color: '#5f6b7a' }}>
            Move across the coordinate plane to see x- and y-guides. Click the intersection to plot or remove a point.
          </p>
          {allowTypedPlot ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>x-coordinate<input inputMode="decimal" value={plotX} onChange={(event) => setPlotX(event.target.value)} style={inputStyle} /></label>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>y-coordinate<input inputMode="decimal" value={plotY} onChange={(event) => setPlotY(event.target.value)} style={inputStyle} /></label>
              <button type="button" onClick={addTypedPoint} style={primaryButton}>Plot point</button>
            </div>
          ) : null}
          {plottedPoints.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
              {plottedPoints.map(([x, y]) => (
                <button key={`${x}|${y}`} type="button" onClick={() => togglePlottedPoint(x, y)} style={{ ...secondaryButton, padding: '7px 10px', minHeight: 36 }} aria-label={`Remove plotted point ${x}, ${y}`}>
                  ({x}, {y}) ×
                </button>
              ))}
              <button type="button" onClick={() => { clearFeedback(); setPlottedPoints([]); }} style={{ ...secondaryButton, padding: '7px 10px', minHeight: 36 }}>Clear plot</button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <ToolSplit>
        <Panel title="Mapping diagram">
          <EnlargeableFigure label="Mapping diagram" enlargeLabel="Enlarge diagram" style={{ width: '100%' }}>
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
          </EnlargeableFigure>

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
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
              <legend style={{ fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 8 }}>
                Is this relation a function?
              </legend>
              <div style={{ display: 'grid', gap: 8 }}>
                {functionChoiceOptions.map((choice) => {
                  const selected = functionAnswer === choice.value;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setFunctionAnswer(choice.value); clearFeedback(); }}
                      style={{
                        ...secondaryButton,
                        width: '100%',
                        textAlign: 'left',
                        border: `2px solid ${selected ? '#1a73e8' : '#cdd6e4'}`,
                        background: selected ? '#e8f0fe' : '#fff',
                        color: '#202124',
                      }}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {analysisFields.map((field) => {
            const options = optionsForField(field);
            const current = String(fieldAnswers[field.id] ?? '');
            return (
              <fieldset key={field.id} style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
                <legend style={{ fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 8 }}>
                  {field.label || field.id}
                </legend>
                {options.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {options.map((option) => {
                      const raw = String(option);
                      const selected = current === raw;
                      return (
                        <button
                          key={raw}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => { setFieldAnswers((answers) => ({ ...answers, [field.id]: raw })); clearFeedback(); }}
                          style={{
                            ...secondaryButton,
                            width: '100%',
                            textAlign: 'left',
                            border: `2px solid ${selected ? '#1a73e8' : '#cdd6e4'}`,
                            background: selected ? '#e8f0fe' : '#fff',
                            color: '#202124',
                          }}
                        >
                          {raw}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    value={current}
                    onChange={(event) => { setFieldAnswers((answers) => ({ ...answers, [field.id]: event.target.value })); clearFeedback(); }}
                    style={inputStyle}
                  />
                )}
              </fieldset>
            );
          })}

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
