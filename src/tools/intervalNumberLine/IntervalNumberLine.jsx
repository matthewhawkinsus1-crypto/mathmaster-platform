import React, { useMemo, useState } from 'react';
import MathInput from '../../MathInput';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import {
  INTERVAL_ASK_STAGES,
  intervalsToInequality,
  intervalsToNotation,
  normalizeIntervals,
  notationMatches,
  sameIntervals,
} from './intervalMath';

const INF = Number.POSITIVE_INFINITY;
const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButton = { ...primaryButton, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' };

const WIDTH = 620;
const HEIGHT = 130;
const PAD = 36;

// Students build the picture by clicking a tick to place an endpoint, then
// choosing whether it is open or closed and which way the shading runs. That is
// the actual skill the lesson teaches, so it is the interaction, not a
// multiple-choice picture of someone else's number line.
export default function IntervalNumberLine({ questionData = {}, onAction }) {
  const min = Number.isFinite(Number(questionData.min)) ? Number(questionData.min) : -10;
  const max = Number.isFinite(Number(questionData.max)) ? Number(questionData.max) : 10;
  const step = Number.isFinite(Number(questionData.step)) && Number(questionData.step) > 0 ? Number(questionData.step) : 1;
  const variable = questionData.variable || 'x';
  const expected = useMemo(() => normalizeIntervals(questionData.intervals), [questionData.intervals]);
  const ask = useMemo(() => {
    const requested = Array.isArray(questionData.ask) ? questionData.ask.filter((stage) => INTERVAL_ASK_STAGES.includes(stage)) : [];
    return requested.length ? requested : ['graph', 'interval'];
  }, [questionData.ask]);

  const [pending, setPending] = useState(null);
  const [built, setBuilt] = useState([]);
  const [closedEnd, setClosedEnd] = useState(true);
  const [notation, setNotation] = useState('');
  const [inequality, setInequality] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const chooseEndpointMode = (closed) => {
    clearFeedback();
    // The switch arms the NEXT endpoint. It deliberately does not reach back and
    // change one already on the line: a student building [-3, 5) places -3
    // closed, then switches to open for 5, and a retroactive change turned that
    // into (-3, 5) — the most common interval in the lesson, made impossible to
    // construct, with the graph silently wrong rather than visibly refused.
    //
    // Correcting a misplaced endpoint is still one gesture: the pending dot is
    // itself a button that toggles its own inclusion, which is the affordance
    // that belongs to it.
    setClosedEnd(closed);
  };

  const toggleBuiltEndpoint = (intervalIndex, endpoint) => {
    clearFeedback();
    setBuilt((current) => current.map((interval, index) => {
      if (index !== intervalIndex) return interval;
      if (endpoint === 'min' && interval.min !== -INF) return { ...interval, minClosed: !interval.minClosed };
      if (endpoint === 'max' && interval.max !== INF) return { ...interval, maxClosed: !interval.maxClosed };
      return interval;
    }));
  };

  const span = max - min || 1;
  const sx = (value) => PAD + ((Math.max(min, Math.min(max, value)) - min) / span) * (WIDTH - PAD * 2);
  const ticks = useMemo(() => {
    const out = [];
    const count = Math.floor((max - min) / step);
    // Bounded so a hostile step cannot draw thousands of labels.
    for (let i = 0; i <= Math.min(count, 60); i += 1) out.push(Number((min + i * step).toFixed(6)));
    return out;
  }, [min, max, step]);

  // Must invert sx() exactly, padding included. Treating the full element width
  // as the number range shifts every click toward the centre of the line.
  const valueFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return null;
    const viewBoxX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const raw = min + ((viewBoxX - PAD) / (WIDTH - PAD * 2)) * span;
    const snapped = Number((Math.round(raw / step) * step).toFixed(6));
    return Number.isFinite(snapped) ? snapped : null;
  };

  // Each endpoint remembers whether it was open or closed when it was placed.
  // Applying the current switch to both ends would make [-3, 5) impossible to
  // build, which is the single most common interval in the lesson.
  const handleClick = (event) => {
    const value = valueFromEvent(event);
    if (value == null || value < min || value > max) return;
    clearFeedback();
    if (pending == null) {
      setPending({ value, closed: closedEnd });
      return;
    }
    if (value === pending.value) { setPending(null); return; }
    const first = { value: pending.value, closed: pending.closed };
    const second = { value, closed: closedEnd };
    const [low, high] = first.value < second.value ? [first, second] : [second, first];
    setBuilt((current) => [...current, {
      min: low.value, max: high.value, minClosed: low.closed, maxClosed: high.closed,
    }]);
    setPending(null);
  };

  const addRay = (direction) => {
    if (pending == null) return;
    clearFeedback();
    setBuilt((current) => [...current, direction === 'left'
      ? { min: -INF, max: pending.value, minClosed: false, maxClosed: pending.closed }
      : { min: pending.value, max: INF, minClosed: pending.closed, maxClosed: false }]);
    setPending(null);
  };

  const undo = () => {
    clearFeedback();
    if (pending != null) {
      setPending(null);
      return;
    }
    setBuilt((current) => current.slice(0, -1));
  };
  const reset = () => { clearFeedback(); setPending(null); setBuilt([]); setNotation(''); setInequality(''); };

  const check = () => {
    const checks = {};
    if (ask.includes('graph')) checks.graph = sameIntervals(built, expected);
    if (ask.includes('interval')) checks.interval = notationMatches(notation, expected);
    if (ask.includes('inequality')) {
      const tidy = (text) => String(text || '').replace(/\s+/g, '').replace(/[−–—]/g, '-').toLowerCase();
      checks.inequality = tidy(inequality) === tidy(intervalsToInequality(expected, variable));
    }
    const values = Object.values(checks);
    const score = values.length ? values.filter(Boolean).length / values.length : 0;
    submit(
      { isCorrect: values.every(Boolean), score },
      { intervals: built, notation, inequality },
      { checks, expected },
    );
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — the graph and the notation agree.';
    const checks = feedback.metadata?.checks || {};
    if (checks.graph === false && built.length === 0) return 'Nothing is graphed yet. Click a tick mark to place an endpoint, then click a second tick or choose a ray direction.';
    if (checks.graph === false) return 'The graph is not right yet. Check each endpoint: a closed circle means the value is included, an open circle means it is not.';
    if (checks.interval === false) return 'The graph is right but the interval notation is not. Square brackets go with closed circles, round brackets with open circles, and infinity always takes a round bracket.';
    if (checks.inequality === false) return 'The graph is right but the inequality is not. Read it left to right: the smaller value, then the variable, then the larger value.';
    return 'Not quite. Compare each endpoint on your graph against the values in the question.';
  };

  const drawn = normalizeIntervals(built);

  return (
    <ToolShell
      title="Number Line and Intervals"
      subtitle="Move between an inequality, its interval notation and the picture on a number line."
      badge="Inequalities and intervals"
    >
      <TaskCard
        question={questionData}
        task={questionData.prompt || `Graph the solution on the number line${ask.includes('interval') ? ' and write it in interval notation' : ''}.`}
        steps={[
          'Click a tick mark to place your first endpoint.',
          'Click a second tick for a bounded interval, or choose a ray to shade to infinity.',
          'Choose open or closed as you place an endpoint. You can also tap any plotted endpoint later to switch it without changing the shading.',
        ]}
      />

      <ToolSplit>
        <Panel title="Build the graph">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" onClick={() => chooseEndpointMode(true)} aria-pressed={closedEnd} style={closedEnd ? primaryButton : secondaryButton}>● Closed (included)</button>
            <button type="button" onClick={() => chooseEndpointMode(false)} aria-pressed={!closedEnd} style={closedEnd ? secondaryButton : primaryButton}>○ Open (not included)</button>
          </div>

          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="application"
            aria-label="Number line. Click a tick mark to place an endpoint."
            onClick={handleClick}
            style={{ width: '100%', height: 'auto', border: '1px solid #d9e2f1', borderRadius: 12, background: '#fff', cursor: 'pointer', touchAction: 'none' }}
          >
            <line x1={PAD - 14} x2={WIDTH - PAD + 14} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="#5f6b7a" strokeWidth="2" />
            <polygon points={`${PAD - 14},${HEIGHT / 2} ${PAD - 4},${HEIGHT / 2 - 5} ${PAD - 4},${HEIGHT / 2 + 5}`} fill="#5f6b7a" />
            <polygon points={`${WIDTH - PAD + 14},${HEIGHT / 2} ${WIDTH - PAD + 4},${HEIGHT / 2 - 5} ${WIDTH - PAD + 4},${HEIGHT / 2 + 5}`} fill="#5f6b7a" />

            {ticks.map((value) => (
              <g key={value}>
                <line x1={sx(value)} x2={sx(value)} y1={HEIGHT / 2 - 7} y2={HEIGHT / 2 + 7} stroke="#9aa5b4" strokeWidth="1.5" />
                <text pointerEvents="none" x={sx(value)} y={HEIGHT / 2 + 26} textAnchor="middle" fontSize="12" fill="#5f6b7a">{value}</text>
              </g>
            ))}

            {drawn.map((interval, index) => {
              const left = interval.min === -INF ? PAD - 14 : sx(interval.min);
              const right = interval.max === INF ? WIDTH - PAD + 14 : sx(interval.max);
              return (
                <g key={index}>
                  <line x1={left} x2={right} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="#1a73e8" strokeWidth="6" opacity="0.85" />
                  {interval.min !== -INF && (
                    <g
                      role="button"
                      tabIndex="0"
                      aria-label={`${interval.minClosed ? 'Closed' : 'Open'} endpoint at ${interval.min}. Activate to make it ${interval.minClosed ? 'open' : 'closed'}.`}
                      onClick={(event) => { event.stopPropagation(); toggleBuiltEndpoint(index, 'min'); }}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleBuiltEndpoint(index, 'min'); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle cx={sx(interval.min)} cy={HEIGHT / 2} r="15" fill="transparent" />
                      <circle pointerEvents="none" cx={sx(interval.min)} cy={HEIGHT / 2} r="8" fill={interval.minClosed ? '#1a73e8' : '#fff'} stroke="#1a73e8" strokeWidth="3" />
                    </g>
                  )}
                  {interval.max !== INF && (
                    <g
                      role="button"
                      tabIndex="0"
                      aria-label={`${interval.maxClosed ? 'Closed' : 'Open'} endpoint at ${interval.max}. Activate to make it ${interval.maxClosed ? 'open' : 'closed'}.`}
                      onClick={(event) => { event.stopPropagation(); toggleBuiltEndpoint(index, 'max'); }}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleBuiltEndpoint(index, 'max'); } }}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle cx={sx(interval.max)} cy={HEIGHT / 2} r="15" fill="transparent" />
                      <circle pointerEvents="none" cx={sx(interval.max)} cy={HEIGHT / 2} r="8" fill={interval.maxClosed ? '#1a73e8' : '#fff'} stroke="#1a73e8" strokeWidth="3" />
                    </g>
                  )}
                </g>
              );
            })}

            {pending != null && (
              <g
                role="button"
                tabIndex="0"
                aria-label={`${pending.closed ? 'Closed' : 'Open'} pending endpoint at ${pending.value}. Activate to switch it.`}
                onClick={(event) => { event.stopPropagation(); setPending((current) => current == null ? current : { ...current, closed: !current.closed }); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPending((current) => current == null ? current : { ...current, closed: !current.closed }); } }}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={sx(pending.value)} cy={HEIGHT / 2} r="15" fill="transparent" />
                <circle pointerEvents="none" cx={sx(pending.value)} cy={HEIGHT / 2} r="8" fill={pending.closed ? '#8a3ffc' : '#fff'} stroke="#8a3ffc" strokeWidth="3" />
                <text pointerEvents="none" x={sx(pending.value)} y={HEIGHT / 2 - 18} textAnchor="middle" fontSize="12" fontWeight="700" fill="#6f2da8">{pending.value}</text>
              </g>
            )}
          </svg>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={() => addRay('left')} disabled={pending == null} style={{ ...secondaryButton, opacity: pending == null ? 0.5 : 1 }}>← Shade left from {pending?.value ?? '…'}</button>
            <button type="button" onClick={() => addRay('right')} disabled={pending == null} style={{ ...secondaryButton, opacity: pending == null ? 0.5 : 1 }}>Shade right from {pending?.value ?? '…'} →</button>
            <button type="button" onClick={undo} disabled={!built.length && pending == null} style={{ ...secondaryButton, opacity: !built.length && pending == null ? 0.5 : 1 }}>Undo</button>
            <button type="button" onClick={reset} disabled={!built.length && pending == null} style={{ ...secondaryButton, opacity: !built.length && pending == null ? 0.5 : 1 }}>Start over</button>
          </div>

          <p aria-live="polite" style={{ marginTop: 10, fontSize: 13, color: '#5f6b7a' }}>
            {pending != null
              ? `${pending.closed ? 'Closed' : 'Open'} endpoint at ${pending.value} placed. Click a second tick for a bounded interval, shade to infinity, or tap the endpoint to switch open/closed.`
              : drawn.length
                ? ask.includes('interval')
                  ? `${drawn.length} graph ${drawn.length === 1 ? 'piece' : 'pieces'} placed. The notation is intentionally hidden here — write it yourself in the answer box.`
                  : `Your graph: ${intervalsToNotation(drawn)}`
                : 'Click a tick mark to begin.'}
          </p>
        </Panel>

        <Panel title="Write it in notation">
          {ask.includes('interval') && (
            <div style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 12 }}>
              <div style={{ marginBottom: 6 }}>Interval notation</div>
              <MathInput
                value={notation}
                onChange={(value) => { setNotation(value); clearFeedback(); }}
                placeholder="[-3, 5)"
                ariaLabel="Interval notation"
                toolProfile="interval"
                showToolsInitially
              />
            </div>
          )}
          {ask.includes('inequality') && (
            <div style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 12 }}>
              <div style={{ marginBottom: 6 }}>Inequality</div>
              <MathInput
                value={inequality}
                onChange={(value) => { setInequality(value); clearFeedback(); }}
                placeholder={`-3 ≤ ${variable} < 5`}
                ariaLabel="Inequality"
                toolProfile="inequality"
                showToolsInitially
              />
            </div>
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
              'A closed circle (●) means the endpoint is part of the solution. An open circle (○) means it is not.',
              'Interval notation uses the same idea: a square bracket includes the endpoint, a round bracket excludes it.',
              'Infinity is never reached, so it always takes a round bracket — write (-∞, 5] rather than [-∞, 5].',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolSplit>
    </ToolShell>
  );
}
