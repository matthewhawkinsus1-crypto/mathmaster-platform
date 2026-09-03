import React, { useMemo, useRef, useState } from 'react';
import { evaluate } from 'mathjs';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { figureDismissalKey, shouldOpenFigureEnlarged } from '../../platform/student/figurePresentation.js';
import useViewportWidth from '../../platform/mobile/useViewportWidth.js';
import MathInput from '../../MathInput';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import {
  INTERVAL_ASK_STAGES,
  intervalsToInequality,
  intervalsToNotation,
  normalizeIntervals,
  sameIntervals,
} from './intervalMath';

const INF = Number.POSITIVE_INFINITY;
const WIDTH = 620;
const HEIGHT = 138;
const PAD = 42;

const primaryButton = {
  padding: '9px 14px',
  background: '#1a73e8',
  color: '#fff',
  border: 0,
  borderRadius: 9,
  fontWeight: 800,
  cursor: 'pointer',
  minHeight: 40,
  colorScheme: 'light',
};

const secondaryButton = {
  ...primaryButton,
  background: '#fff',
  color: '#174ea6',
  border: '1px solid #9bb8e8',
};

const tidyNumber = (value) => Number(Number(value).toFixed(10));

const gcd = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

const rationalLabel = (value, maxDenominator = 16) => {
  if (!Number.isFinite(value)) return value < 0 ? '−∞' : '∞';
  const rounded = tidyNumber(value);
  if (Number.isInteger(rounded)) return String(rounded).replace('-', '−');

  for (let denominator = 2; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(rounded * denominator);
    if (Math.abs((numerator / denominator) - rounded) < 1e-9) {
      const common = gcd(numerator, denominator);
      const n = numerator / common;
      const d = denominator / common;
      return `${n < 0 ? '−' : ''}${Math.abs(n)}/${d}`;
    }
  }

  return String(Number(rounded.toFixed(4))).replace('-', '−');
};

const readBraceGroup = (source, startIndex) => {
  if (source[startIndex] !== '{') return null;
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          content: source.slice(startIndex + 1, index),
          endIndex: index,
        };
      }
    }
  }
  return null;
};

const replaceLatexFractions = (raw) => {
  let source = String(raw || '');
  const command = /\\(?:dfrac|tfrac|frac)/;

  for (let guard = 0; guard < 20; guard += 1) {
    const match = command.exec(source);
    if (!match) break;

    const commandStart = match.index;
    let cursor = commandStart + match[0].length;
    while (/\s/.test(source[cursor] || '')) cursor += 1;

    const numerator = readBraceGroup(source, cursor);
    if (!numerator) break;

    cursor = numerator.endIndex + 1;
    while (/\s/.test(source[cursor] || '')) cursor += 1;

    const denominator = readBraceGroup(source, cursor);
    if (!denominator) break;

    const replacement = `((${replaceLatexFractions(numerator.content)})/(${replaceLatexFractions(denominator.content)}))`;
    source = `${source.slice(0, commandStart)}${replacement}${source.slice(denominator.endIndex + 1)}`;
  }

  return source;
};

const replaceLatexRoots = (raw) => {
  let source = String(raw || '');

  for (let guard = 0; guard < 20; guard += 1) {
    const index = source.indexOf('\\sqrt');
    if (index < 0) break;

    let cursor = index + '\\sqrt'.length;
    while (/\s/.test(source[cursor] || '')) cursor += 1;

    const group = readBraceGroup(source, cursor);
    if (!group) break;

    source = `${source.slice(0, index)}sqrt(${replaceLatexRoots(group.content)})${source.slice(group.endIndex + 1)}`;
  }

  return source;
};

export const parseExactNumberLineValue = (raw) => {
  const source = replaceLatexRoots(replaceLatexFractions(
    String(raw ?? '')
      .replace(/[−–—]/g, '-')
      .replace(/\\left|\\right/g, '')
      .replace(/\\,/g, '')
      .replace(/\\cdot|\\times/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\pi/g, 'pi')
      .trim(),
  ));

  if (!source) return null;

  // Endpoint entry is intentionally numeric only. This whitelist allows
  // arithmetic, pi/e and sqrt while rejecting arbitrary function names.
  const identifiers = source.match(/[A-Za-z]+/g) || [];
  if (identifiers.some((name) => !['sqrt', 'pi', 'e'].includes(name))) return null;
  if (!/^[0-9A-Za-z+\-*/().^\s]+$/.test(source)) return null;

  try {
    const value = Number(evaluate(source));
    return Number.isFinite(value) ? tidyNumber(value) : null;
  } catch {
    return null;
  }
};

const parseFlexibleIntervalNotation = (text) => {
  const source = String(text || '')
    .replace(/[−–—]/g, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\lbrack/g, '[')
    .replace(/\\rbrack/g, ']')
    .replace(/\\infty/g, '∞')
    .replace(/\\cup/g, '∪')
    .replace(/\\(?:,|;|!|quad|qquad)/g, '')
    .replace(/infinity|infty|inf/gi, '∞')
    .replace(/\bU\b/g, '∪')
    .trim();

  if (!source) return null;
  const pieces = source.split('∪').map((piece) => piece.trim()).filter(Boolean);
  const intervals = [];

  for (const piece of pieces) {
    const open = piece[0];
    const close = piece[piece.length - 1];
    if (!['(', '['].includes(open) || ![')', ']'].includes(close)) return null;

    const inside = piece.slice(1, -1);
    const commaIndex = inside.indexOf(',');
    if (commaIndex < 0) return null;

    const lowerText = inside.slice(0, commaIndex).trim();
    const upperText = inside.slice(commaIndex + 1).trim();

    const endpoint = (value, side) => {
      const normalized = value.replace(/\s+/g, '');
      if (normalized === '∞' || normalized === '+∞') return INF;
      if (normalized === '-∞') return -INF;
      const parsed = parseExactNumberLineValue(value);
      if (parsed == null) return null;
      if (side === 'lower' && parsed === INF) return null;
      if (side === 'upper' && parsed === -INF) return null;
      return parsed;
    };

    const min = endpoint(lowerText, 'lower');
    const max = endpoint(upperText, 'upper');
    if (min == null || max == null || min > max) return null;

    intervals.push({
      min,
      max,
      minClosed: Number.isFinite(min) && open === '[',
      maxClosed: Number.isFinite(max) && close === ']',
    });
  }

  return normalizeIntervals(intervals);
};

const notationMatchesFlexible = (text, expected) => {
  const parsed = parseFlexibleIntervalNotation(text);
  return parsed ? sameIntervals(parsed, expected) : false;
};

const niceTickStep = (span, targetIntervals = 6) => {
  const safeSpan = Math.max(Math.abs(span), 1e-9);
  const rough = safeSpan / Math.max(1, targetIntervals);
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;

  const factor = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 2.5
        ? 2.5
        : normalized <= 5
          ? 5
          : 10;

  return tidyNumber(factor * power);
};

const ticksFor = (min, max, step, limit = 30) => {
  if (!(step > 0) || !(max > min)) return [];
  const start = Math.ceil((min - 1e-10) / step) * step;
  const out = [];

  for (let value = start; value <= max + 1e-10 && out.length < limit; value += step) {
    out.push(tidyNumber(value));
  }

  return out;
};

const deriveInitialViewport = (questionData, expected, snapStep) => {
  const authoredMin = Number.isFinite(Number(questionData.min)) ? Number(questionData.min) : -10;
  const authoredMax = Number.isFinite(Number(questionData.max)) ? Number(questionData.max) : 10;

  if (questionData.autoViewport === false) {
    return authoredMax > authoredMin
      ? { min: authoredMin, max: authoredMax }
      : { min: -10, max: 10 };
  }

  const finite = expected.flatMap((interval) => [interval.min, interval.max]).filter(Number.isFinite);
  if (!finite.length) {
    return authoredMax > authoredMin
      ? { min: authoredMin, max: authoredMax }
      : { min: -10, max: 10 };
  }

  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const spread = high - low;
  const padding = spread > 0
    ? Math.max(1, spread * 0.35, snapStep * 3)
    : Math.max(2, Math.abs(low) * 0.2, snapStep * 5);

  let rawMin = low - padding;
  let rawMax = high + padding;
  if (!(rawMax > rawMin)) {
    rawMin = low - 2;
    rawMax = high + 2;
  }

  const major = niceTickStep(rawMax - rawMin);
  const min = tidyNumber(Math.floor(rawMin / major) * major);
  const max = tidyNumber(Math.ceil(rawMax / major) * major);

  return max > min ? { min, max } : { min: low - 2, max: high + 2 };
};

export default function IntervalNumberLine({ questionData = {}, onAction }) {
  const viewportWidth = useViewportWidth();
  const variable = questionData.variable || 'x';
  const expected = useMemo(
    () => normalizeIntervals(questionData.intervals),
    [questionData.intervals],
  );

  const authoredStep = Number(questionData.snapStep ?? questionData.step);
  const snapStep = Number.isFinite(authoredStep) && authoredStep > 0 ? authoredStep : 1;

  const initialViewport = useMemo(
    () => deriveInitialViewport(questionData, expected, snapStep),
    // questionData is intentionally treated as the authored item envelope.
    [questionData, expected, snapStep],
  );

  const [viewport, setViewport] = useState(initialViewport);
  const min = viewport.min;
  const max = viewport.max;
  const span = max - min || 1;

  const ask = useMemo(() => {
    const requested = Array.isArray(questionData.ask)
      ? questionData.ask.filter((stage) => INTERVAL_ASK_STAGES.includes(stage))
      : [];
    return requested.length ? requested : ['graph', 'interval'];
  }, [questionData.ask]);
  const asksInterval = ask.includes('interval');
  const asksInequality = ask.includes('inequality');
  const asksNotation = asksInterval || asksInequality;
  const toolTitle = asksInterval
    ? 'Number Line and Intervals'
    : asksInequality
      ? 'Number Line and Inequalities'
      : 'Graph an Inequality';
  const toolSubtitle = asksInterval
    ? 'Move between an inequality, its interval notation and the picture on a number line.'
    : asksInequality
      ? 'Connect the number-line graph to its inequality notation.'
      : 'Graph the solution using the correct endpoint and direction.';
  const toolBadge = asksInterval
    ? 'Inequalities and intervals'
    : asksInequality
      ? 'Inequality representation'
      : 'Open and closed endpoints';
  const responsePanelTitle = asksNotation ? 'Write it in notation' : 'Check your graph';
  const hints = [
    'A closed circle (●) means the endpoint is part of the solution. An open circle (○) means it is not.',
    'For awkward endpoints, type the exact value instead of trying to hit a tiny tick mark.',
    ...(asksInterval ? [
      'Interval notation accepts exact fractions such as [-13/8, 13/8).',
      'Infinity is never reached, so it always takes a round bracket.',
    ] : []),
    ...(asksInequality ? [
      'Read the shaded number line from left to right to write the matching inequality.',
    ] : []),
  ];

  const [pending, setPending] = useState(null);
  const [built, setBuilt] = useState([]);
  const [closedEnd, setClosedEnd] = useState(true);
  const [notation, setNotation] = useState('');
  const [inequality, setInequality] = useState('');
  const [exactEndpoint, setExactEndpoint] = useState('');
  const [endpointError, setEndpointError] = useState('');
  const [dragging, setDragging] = useState(null);
  const dragMovedRef = useRef(false);
  const suppressEndpointClickRef = useRef(false);

  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const sx = (value) => PAD + ((Math.max(min, Math.min(max, value)) - min) / span) * (WIDTH - PAD * 2);

  const majorStep = useMemo(() => niceTickStep(span), [span]);
  const majorTicks = useMemo(() => ticksFor(min, max, majorStep, 18), [min, max, majorStep]);
  const minorStep = majorStep / 2;
  const minorTicks = useMemo(
    () => ticksFor(min, max, minorStep, 40).filter(
      (value) => !majorTicks.some((major) => Math.abs(major - value) < 1e-9),
    ),
    [min, max, minorStep, majorTicks],
  );

  const ensureVisible = (value) => {
    if (value >= min && value <= max) return;

    setViewport((current) => {
      const nextLow = Math.min(current.min, value);
      const nextHigh = Math.max(current.max, value);
      const pad = Math.max(1, (nextHigh - nextLow) * 0.15);
      const roughMin = nextLow - pad;
      const roughMax = nextHigh + pad;
      const step = niceTickStep(roughMax - roughMin);

      return {
        min: tidyNumber(Math.floor(roughMin / step) * step),
        max: tidyNumber(Math.ceil(roughMax / step) * step),
      };
    });
  };

  const chooseEndpointMode = (closed) => {
    clearFeedback();
    setClosedEnd(closed);
  };

  const toggleBuiltEndpoint = (intervalIndex, endpoint) => {
    clearFeedback();
    setBuilt((current) => current.map((interval, index) => {
      if (index !== intervalIndex) return interval;
      if (endpoint === 'min' && interval.min !== -INF) {
        return { ...interval, minClosed: !interval.minClosed };
      }
      if (endpoint === 'max' && interval.max !== INF) {
        return { ...interval, maxClosed: !interval.maxClosed };
      }
      return interval;
    }));
  };

  const placeEndpoint = (value, closed = closedEnd) => {
    if (!Number.isFinite(value)) return;
    ensureVisible(value);
    clearFeedback();
    setEndpointError('');

    if (pending == null) {
      setPending({ value: tidyNumber(value), closed });
      return;
    }

    if (Math.abs(value - pending.value) < 1e-10) {
      setEndpointError('Choose a different second endpoint, or use a ray.');
      return;
    }

    const first = { value: pending.value, closed: pending.closed };
    const second = { value: tidyNumber(value), closed };
    const [low, high] = first.value < second.value ? [first, second] : [second, first];

    setBuilt((current) => [...current, {
      min: low.value,
      max: high.value,
      minClosed: low.closed,
      maxClosed: high.closed,
    }]);
    setPending(null);
  };

  const valueFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return null;

    const viewBoxX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const raw = min + ((viewBoxX - PAD) / (WIDTH - PAD * 2)) * span;
    const snapped = tidyNumber(Math.round(raw / snapStep) * snapStep);

    return Number.isFinite(snapped)
      ? Math.max(min, Math.min(max, snapped))
      : null;
  };

  const handleLineClick = (event) => {
    if (dragging) return;
    const value = valueFromEvent(event);
    if (value == null) return;
    placeEndpoint(value);
  };

  const placeTypedEndpoint = () => {
    const parsed = parseExactNumberLineValue(exactEndpoint);
    if (parsed == null) {
      setEndpointError('Enter a number such as -13/8, 1.625, sqrt(5), or pi.');
      return;
    }

    placeEndpoint(parsed);
    setExactEndpoint('');
  };

  const addRay = (direction) => {
    if (pending == null) return;
    clearFeedback();

    setBuilt((current) => [...current, direction === 'left'
      ? {
        min: -INF,
        max: pending.value,
        minClosed: false,
        maxClosed: pending.closed,
      }
      : {
        min: pending.value,
        max: INF,
        minClosed: pending.closed,
        maxClosed: false,
      }]);

    setPending(null);
  };

  const beginDrag = (target, event) => {
    event.stopPropagation();
    dragMovedRef.current = false;
    suppressEndpointClickRef.current = false;
    setDragging(target);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateDraggedValue = (event) => {
    if (!dragging) return;
    const value = valueFromEvent(event);
    if (value == null) return;

    dragMovedRef.current = true;
    clearFeedback();

    if (dragging.kind === 'pending') {
      setPending((current) => current ? { ...current, value } : current);
      return;
    }

    setBuilt((current) => current.map((interval, index) => {
      if (index !== dragging.intervalIndex) return interval;

      if (dragging.endpoint === 'min') {
        const ceiling = Number.isFinite(interval.max) ? interval.max - Math.max(snapStep, 1e-9) : value;
        return { ...interval, min: Math.min(value, ceiling) };
      }

      const floor = Number.isFinite(interval.min) ? interval.min + Math.max(snapStep, 1e-9) : value;
      return { ...interval, max: Math.max(value, floor) };
    }));
  };

  const endDrag = () => {
    if (dragMovedRef.current) suppressEndpointClickRef.current = true;
    setDragging(null);
  };

  const handleEndpointClick = (action) => {
    if (suppressEndpointClickRef.current) {
      suppressEndpointClickRef.current = false;
      return;
    }
    action();
  };

  const undo = () => {
    clearFeedback();
    setEndpointError('');
    if (pending != null) {
      setPending(null);
      return;
    }
    setBuilt((current) => current.slice(0, -1));
  };

  const reset = () => {
    clearFeedback();
    setPending(null);
    setBuilt([]);
    setNotation('');
    setInequality('');
    setExactEndpoint('');
    setEndpointError('');
    setViewport(initialViewport);
  };

  const check = () => {
    const checks = {};

    if (ask.includes('graph')) checks.graph = sameIntervals(built, expected);
    if (asksInterval) checks.interval = notationMatchesFlexible(notation, expected);

    if (asksInequality) {
      const tidy = (text) => String(text || '')
        .replace(/\s+/g, '')
        .replace(/[−–—]/g, '-')
        .toLowerCase();

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
    if (feedback.isCorrect) {
      if (!asksNotation) return 'Correct — your graph matches the inequality.';
      return 'Correct — the graph and the notation agree.';
    }

    const checks = feedback.metadata?.checks || {};
    if (checks.graph === false && built.length === 0) {
      return 'Nothing is graphed yet. Click the line or type an exact endpoint, then place the other endpoint or choose a ray.';
    }
    if (checks.graph === false) {
      return 'The graph is not right yet. Check each endpoint, whether it is open or closed, and which region is shaded.';
    }
    if (checks.interval === false) {
      return 'The graph is right but the interval notation is not. Fractions are allowed; square brackets include endpoints and round brackets exclude them.';
    }
    if (checks.inequality === false) {
      return 'The graph is right but the inequality is not. Read the graph from left to right.';
    }
    return 'Not quite. Compare each endpoint on your graph against the values in the question.';
  };

  const drawn = normalizeIntervals(built);
  const snapLabel = rationalLabel(snapStep);

  return (
    <ToolShell
      title={toolTitle}
      subtitle={toolSubtitle}
      badge={toolBadge}
    >
      <TaskCard
        question={questionData}
        task={questionData.prompt || `Graph the solution on the number line${asksInterval ? ' and write it in interval notation' : asksInequality ? ' and write the matching inequality' : ''}.`}
        steps={[
          'Place an endpoint by clicking the line or typing its exact value. Fractions such as -13/8 are accepted.',
          'For a bounded interval, place a second endpoint. For a ray, choose shade left or shade right.',
          'Choose open or closed for each endpoint. Drag a plotted endpoint if you want to move it.',
        ]}
      />

      <EnlargeableFigure
        label="Number line workspace"
        enlargeLabel="Enlarge workspace"
        taskText={questionData.prompt || questionData.task || ''}
        style={{ width: '100%' }}
        openEnlarged={shouldOpenFigureEnlarged({ toolId: 'intervalNumberLine', question: questionData || {}, viewportWidth })}
        dismissKey={figureDismissalKey(questionData || {}, 'intervalNumberLine')}
      >
      <ToolSplit>
        <Panel title="Build the graph">
          <div
            style={{
              display: 'grid',
              gap: 10,
              padding: 10,
              marginBottom: 10,
              border: '1px solid #d9e2f1',
              borderRadius: 12,
              background: '#f8fbff',
              colorScheme: 'light',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => chooseEndpointMode(true)}
                aria-pressed={closedEnd}
                style={closedEnd ? primaryButton : secondaryButton}
              >
                ● Closed
              </button>

              <button
                type="button"
                onClick={() => chooseEndpointMode(false)}
                aria-pressed={!closedEnd}
                style={closedEnd ? secondaryButton : primaryButton}
              >
                ○ Open
              </button>

              <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                Next endpoint
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 1fr) auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                value={exactEndpoint}
                onChange={(event) => {
                  setExactEndpoint(event.target.value);
                  setEndpointError('');
                  clearFeedback();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    placeTypedEndpoint();
                  }
                }}
                placeholder="Exact endpoint, e.g. -13/8"
                aria-label="Exact endpoint value"
                style={{
                  width: '100%',
                  minHeight: 40,
                  padding: '7px 10px',
                  boxSizing: 'border-box',
                  border: `2px solid ${endpointError ? '#d93025' : '#8ab4f8'}`,
                  borderRadius: 8,
                  background: '#fff',
                  color: '#202124',
                  fontSize: 16,
                  colorScheme: 'light',
                }}
              />

              <button
                type="button"
                onClick={placeTypedEndpoint}
                style={secondaryButton}
              >
                Place endpoint
              </button>
            </div>

            <div style={{ color: endpointError ? '#b3261e' : '#5f6b7a', fontSize: 11.5 }}>
              {endpointError || `Click/drag snap: ${snapLabel}. Exact entry is not limited to visible tick marks.`}
            </div>
          </div>

          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="application"
            aria-label="Number line. Click anywhere on the line to place an endpoint, or drag an existing endpoint."
            onClick={handleLineClick}
            onPointerMove={updateDraggedValue}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              width: '100%',
              height: 'auto',
              border: '1px solid #d9e2f1',
              borderRadius: 12,
              background: '#fff',
              cursor: dragging ? 'grabbing' : 'crosshair',
              touchAction: 'none',
              colorScheme: 'light',
            }}
          >
            <line
              x1={PAD - 14}
              x2={WIDTH - PAD + 14}
              y1={HEIGHT / 2}
              y2={HEIGHT / 2}
              stroke="#5f6b7a"
              strokeWidth="2"
            />
            <polygon
              points={`${PAD - 14},${HEIGHT / 2} ${PAD - 4},${HEIGHT / 2 - 5} ${PAD - 4},${HEIGHT / 2 + 5}`}
              fill="#5f6b7a"
            />
            <polygon
              points={`${WIDTH - PAD + 14},${HEIGHT / 2} ${WIDTH - PAD + 4},${HEIGHT / 2 - 5} ${WIDTH - PAD + 4},${HEIGHT / 2 + 5}`}
              fill="#5f6b7a"
            />

            {minorTicks.map((value) => (
              <line
                key={`minor-${value}`}
                x1={sx(value)}
                x2={sx(value)}
                y1={HEIGHT / 2 - 4}
                y2={HEIGHT / 2 + 4}
                stroke="#c5ced9"
                strokeWidth="1"
              />
            ))}

            {majorTicks.map((value) => (
              <g key={`major-${value}`}>
                <line
                  x1={sx(value)}
                  x2={sx(value)}
                  y1={HEIGHT / 2 - 8}
                  y2={HEIGHT / 2 + 8}
                  stroke="#8793a3"
                  strokeWidth="1.5"
                />
                <text
                  pointerEvents="none"
                  x={sx(value)}
                  y={HEIGHT / 2 + 27}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#4f5b6b"
                >
                  {String(Number(value.toFixed(6))).replace('-', '−')}
                </text>
              </g>
            ))}

            {drawn.map((interval, index) => {
              const left = interval.min === -INF ? PAD - 14 : sx(interval.min);
              const right = interval.max === INF ? WIDTH - PAD + 14 : sx(interval.max);

              return (
                <g key={`interval-${index}`}>
                  <line
                    x1={left}
                    x2={right}
                    y1={HEIGHT / 2}
                    y2={HEIGHT / 2}
                    stroke="#1a73e8"
                    strokeWidth="6"
                    opacity="0.85"
                  />

                  {interval.min !== -INF && (
                    <g
                      role="button"
                      tabIndex="0"
                      aria-label={`${interval.minClosed ? 'Closed' : 'Open'} endpoint at ${rationalLabel(interval.min)}. Click to switch open or closed. Drag to move it.`}
                      onPointerDown={(event) => beginDrag({ kind: 'built', intervalIndex: index, endpoint: 'min' }, event)}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEndpointClick(() => toggleBuiltEndpoint(index, 'min'));
                      }}
                      style={{ cursor: 'grab' }}
                    >
                      <circle cx={sx(interval.min)} cy={HEIGHT / 2} r="17" fill="transparent" />
                      <circle
                        pointerEvents="none"
                        cx={sx(interval.min)}
                        cy={HEIGHT / 2}
                        r="8"
                        fill={interval.minClosed ? '#1a73e8' : '#fff'}
                        stroke="#1a73e8"
                        strokeWidth="3"
                      />
                      <text
                        pointerEvents="none"
                        x={sx(interval.min)}
                        y={HEIGHT / 2 - 18}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="800"
                        fill="#174ea6"
                      >
                        {rationalLabel(interval.min)}
                      </text>
                    </g>
                  )}

                  {interval.max !== INF && (
                    <g
                      role="button"
                      tabIndex="0"
                      aria-label={`${interval.maxClosed ? 'Closed' : 'Open'} endpoint at ${rationalLabel(interval.max)}. Click to switch open or closed. Drag to move it.`}
                      onPointerDown={(event) => beginDrag({ kind: 'built', intervalIndex: index, endpoint: 'max' }, event)}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEndpointClick(() => toggleBuiltEndpoint(index, 'max'));
                      }}
                      style={{ cursor: 'grab' }}
                    >
                      <circle cx={sx(interval.max)} cy={HEIGHT / 2} r="17" fill="transparent" />
                      <circle
                        pointerEvents="none"
                        cx={sx(interval.max)}
                        cy={HEIGHT / 2}
                        r="8"
                        fill={interval.maxClosed ? '#1a73e8' : '#fff'}
                        stroke="#1a73e8"
                        strokeWidth="3"
                      />
                      <text
                        pointerEvents="none"
                        x={sx(interval.max)}
                        y={HEIGHT / 2 - 18}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="800"
                        fill="#174ea6"
                      >
                        {rationalLabel(interval.max)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {pending != null && (
              <g
                role="button"
                tabIndex="0"
                aria-label={`${pending.closed ? 'Closed' : 'Open'} pending endpoint at ${rationalLabel(pending.value)}. Click to switch it. Drag to move it.`}
                onPointerDown={(event) => beginDrag({ kind: 'pending' }, event)}
                onClick={(event) => {
                  event.stopPropagation();
                  handleEndpointClick(() => setPending((current) => (
                    current == null ? current : { ...current, closed: !current.closed }
                  )));
                }}
                style={{ cursor: 'grab' }}
              >
                <circle cx={sx(pending.value)} cy={HEIGHT / 2} r="17" fill="transparent" />
                <circle
                  pointerEvents="none"
                  cx={sx(pending.value)}
                  cy={HEIGHT / 2}
                  r="8"
                  fill={pending.closed ? '#8a3ffc' : '#fff'}
                  stroke="#8a3ffc"
                  strokeWidth="3"
                />
                <text
                  pointerEvents="none"
                  x={sx(pending.value)}
                  y={HEIGHT / 2 - 18}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="#6f2da8"
                >
                  {rationalLabel(pending.value)}
                </text>
              </g>
            )}
          </svg>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              type="button"
              onClick={() => addRay('left')}
              disabled={pending == null}
              style={{ ...secondaryButton, opacity: pending == null ? 0.5 : 1 }}
            >
              ← Shade left
            </button>

            <button
              type="button"
              onClick={() => addRay('right')}
              disabled={pending == null}
              style={{ ...secondaryButton, opacity: pending == null ? 0.5 : 1 }}
            >
              Shade right →
            </button>

            <button
              type="button"
              onClick={undo}
              disabled={!built.length && pending == null}
              style={{ ...secondaryButton, opacity: !built.length && pending == null ? 0.5 : 1 }}
            >
              Undo
            </button>

            <button
              type="button"
              onClick={reset}
              disabled={!built.length && pending == null}
              style={{ ...secondaryButton, opacity: !built.length && pending == null ? 0.5 : 1 }}
            >
              Start over
            </button>
          </div>

          <p aria-live="polite" style={{ marginTop: 9, fontSize: 12.5, color: '#5f6b7a', lineHeight: 1.4 }}>
            {pending != null
              ? `${pending.closed ? 'Closed' : 'Open'} endpoint at ${rationalLabel(pending.value)}. Place a second endpoint or choose a ray.`
              : drawn.length
                ? asksInterval
                  ? `${drawn.length} graph ${drawn.length === 1 ? 'piece' : 'pieces'} placed. Write the interval notation yourself.`
                  : `Your graph: ${intervalsToNotation(drawn)}`
                : 'Click the line for a quick placement, or type an exact endpoint above.'}
          </p>
        </Panel>

        <Panel title={responsePanelTitle}>
          {asksInterval && (
            <div style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 12 }}>
              <div style={{ marginBottom: 6 }}>Interval notation</div>
              <MathInput
                value={notation}
                onChange={(value) => {
                  setNotation(value);
                  clearFeedback();
                }}
                placeholder="[-13/8, 13/8)"
                ariaLabel="Interval notation"
                toolProfile="interval"
                showToolsInitially={false}
              />
            </div>
          )}

          {asksInequality && (
            <div style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 12 }}>
              <div style={{ marginBottom: 6 }}>Inequality</div>
              <MathInput
                value={inequality}
                onChange={(value) => {
                  setInequality(value);
                  clearFeedback();
                }}
                placeholder={`-3 ≤ ${variable} < 5`}
                ariaLabel="Inequality"
                toolProfile="inequality"
                showToolsInitially={false}
              />
            </div>
          )}

          <button type="button" onClick={check} style={{ ...primaryButton, width: '100%' }}>
            Check
          </button>

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>
                {feedback.isCorrect ? 'Correct' : 'Not yet'}
              </ResultPill>
              <p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>
                {message()}
              </p>
            </div>
          ) : null}

          <HintPanel
            hints={hints}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolSplit>
      </EnlargeableFigure>
    </ToolShell>
  );
}
