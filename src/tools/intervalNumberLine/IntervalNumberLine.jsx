import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHostSubmitLabel, useSubmitLabel } from '../shared/ToolRuntimeContext';
import usePersistentToolState, { TOOL_DRAFT_COALESCE_MS, flushToolDrafts } from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { figureDismissalKey, shouldOpenFigureEnlarged } from '../../platform/student/figurePresentation.js';
import useViewportWidth from '../../platform/mobile/useViewportWidth.js';
import MathInput from '../../MathInput';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import intervalNumberLineGrader from '../../../functions/shared/serverGrading/tools/intervalNumberLine.mjs';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import { clientPointToViewBox } from '../../utils/responsiveCoordinates.js';
import {
  intervalsToNotation,
  normalizeIntervals,
  parseExactNumberLineValue,
  resolveIntervalAsk,
} from './intervalMath';
import {
  NUMBER_LINE_GEOMETRY,
  applyEndpointEdit,
  endpointKeyIntent,
  endpointValue,
  initialLineCursor,
  lineKeyIntent,
  lineValueAtViewBoxX,
  moveBuiltEndpoint,
  movePendingEndpoint,
  placementOutcome,
  toggleBuiltEndpoint as toggledBuiltEndpoints,
  togglePendingEndpoint,
} from './endpointEditing.js';

const INF = Number.POSITIVE_INFINITY;
const { WIDTH, HEIGHT, PAD } = NUMBER_LINE_GEOMETRY;

// Visually hidden, still read by a screen reader.
const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const primaryButton = {
  padding: '9px 14px',
  background: '#1a73e8',
  color: '#fff',
  border: 0,
  borderRadius: 9,
  fontWeight: 800,
  cursor: 'pointer',
  minHeight: 40,
};

const secondaryButton = {
  ...primaryButton,
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  border: '1px solid var(--mm-primary-border)',
};

const tidyNumber = (value) => Number(Number(value).toFixed(10));

const gcd = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

// The ends of the drawn line, read as the tick labels read them (−7.5, not −15/2).
const lineEndLabel = (value) => String(Number(Number(value).toFixed(6))).replace('-', '−');

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

// Only the number line that IS the question reports its live work. Embedded
// copies (a workflow stage, the Step Algebra representation check — which can
// sit inside another registry tool) must not overwrite their host's work.
const isIntervalNumberLineQuestion = (questionData) => (
  questionData?.toolId === 'intervalNumberLine' || questionData?.type === 'intervalNumberLine'
);

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

  // The same stage resolution the shared grader marks against.
  const ask = useMemo(() => resolveIntervalAsk(questionData.ask), [questionData.ask]);
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
  // On a secure item the panel's action records the one answer: it is not a check.
  const hostSubmitLabel = useHostSubmitLabel();
  const responsePanelTitle = asksNotation ? 'Write it in notation' : hostSubmitLabel ? 'Your graph' : 'Check your graph';
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

  /*
   * THE ONE PLACE IN THIS TOOL THAT WRITES AT DISPLAY RATE.
   *
   * Dragging an endpoint calls `updateDraggedValue` from `onPointerMove`, so
   * these two are re-serialised as fast as the browser reports the finger.
   * They coalesce inside a tight window rather than writing per frame, and
   * `endDrag` flushes the moment the finger lifts — so the persisted value is
   * always a real endpoint the student stopped on, and a sudden shutdown
   * mid-drag can cost at most a fraction of one gesture.
   */
  const [pending, setPending] = usePersistentToolState('pending', null, { coalesceMs: TOOL_DRAFT_COALESCE_MS });
  const [built, setBuilt] = usePersistentToolState('built', [], { coalesceMs: TOOL_DRAFT_COALESCE_MS });
  const [closedEnd, setClosedEnd] = usePersistentToolState('closedEnd', true);
  const [notation, setNotation] = usePersistentToolState('notation', '');
  const [inequality, setInequality] = usePersistentToolState('inequality', '');
  const [exactEndpoint, setExactEndpoint] = usePersistentToolState('exactEndpoint', '');
  const [endpointError, setEndpointError] = useState('');
  const [dragging, setDragging] = useState(null);
  const restoreMath = useCallback((state) => {
    setPending(state.pending); setBuilt(state.built); setClosedEnd(state.closedEnd);
    setNotation(state.notation); setInequality(state.inequality); setExactEndpoint(state.exactEndpoint);
  }, []);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the latest number-line edit',
    state: { pending, built, closedEnd, notation, inequality, exactEndpoint },
    onRestore: restoreMath,
    resetKey: questionUndoResetKey(questionData),
  });
  const dragMovedRef = useRef(false);
  const suppressEndpointClickRef = useRef(false);

  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  // A secure host names the final action ("Record answer"); see ToolRuntimeContext.
  const submitActionLabel = useSubmitLabel('Check');

  /*
   * THE STUDENT'S WORK — what Check submits and what a deadline can carry.
   * Exactly the response this tool has always sent (My Math Path's contract
   * reads the same three fields). The pending, unpaired endpoint is not part
   * of any answer and is not graded.
   */
  const work = useMemo(() => ({ intervals: built, notation, inequality }), [built, notation, inequality]);
  useReportToolWork(work, { enabled: isIntervalNumberLineQuestion(questionData) });

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
    setBuilt((current) => toggledBuiltEndpoints(current, intervalIndex, endpoint));
  };

  const placeEndpoint = (value, closed = closedEnd) => {
    if (!Number.isFinite(value)) return null;
    ensureVisible(value);
    clearFeedback();
    setEndpointError('');

    // The same outcome for a click, a typed value and Enter on the line.
    const outcome = placementOutcome(pending, value, closed);
    if (outcome.error) {
      setEndpointError(outcome.error);
      return outcome;
    }
    if (outcome.interval) setBuilt((current) => [...current, outcome.interval]);
    setPending(outcome.pending);
    return outcome;
  };

  const valueFromEvent = (event) => {
    // Where the tap is in the DRAWING, not in the box: capped to a shorter box,
    // the line is drawn centred and narrower than the box, and a straight
    // box-to-viewBox stretch put a tap on the drawn 5 at 3 (PQ-034).
    const point = clientPointToViewBox({
      clientX: event.clientX,
      clientY: event.clientY,
      rect: event.currentTarget.getBoundingClientRect(),
      viewBoxWidth: WIDTH,
      viewBoxHeight: HEIGHT,
    });
    if (!point) return null;

    return lineValueAtViewBoxX(point.x, { min, max, snapStep });
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
      setPending((current) => movePendingEndpoint(current, value));
      return;
    }

    setBuilt((current) => moveBuiltEndpoint(current, dragging.intervalIndex, dragging.endpoint, value, snapStep));
  };

  const endDrag = () => {
    if (dragMovedRef.current) suppressEndpointClickRef.current = true;
    setDragging(null);
    // The endpoint the student actually chose. Persisted now rather than at the
    // end of the coalescing window.
    flushToolDrafts();
  };

  const handleEndpointClick = (action) => {
    if (suppressEndpointClickRef.current) {
      suppressEndpointClickRef.current = false;
      return;
    }
    action();
  };

  /*
   * THE KEYBOARD ROUTE ON A FOCUSED ENDPOINT. Enter/Space do what its click
   * does; an arrow does what a drag ending one snap step over does. Both go
   * through endpointEditing.js, the same functions the pointer uses, so the
   * recorded state is identical either way. The announcement says where the
   * endpoint now is and whether it is open or closed — never whether it is
   * right.
   */
  const [endpointAnnouncement, setEndpointAnnouncement] = useState('');
  const keyboardFlushRef = useRef(false);
  useEffect(() => {
    if (!keyboardFlushRef.current) return;
    keyboardFlushRef.current = false;
    // A finished keyboard move is a finished gesture: persist it now, as endDrag does.
    flushToolDrafts();
  }, [pending, built]);

  const handleEndpointKeyDown = (target, event) => {
    const state = { pending, built };
    const intent = endpointKeyIntent(event, endpointValue(state, target), { min, max, snapStep });
    if (!intent) return;
    event.preventDefault();
    event.stopPropagation();
    // A key is never the tail of a drag.
    suppressEndpointClickRef.current = false;
    clearFeedback();
    setEndpointError('');

    const next = applyEndpointEdit(state, target, intent, snapStep);
    keyboardFlushRef.current = true;
    if (target.kind === 'pending') setPending(next.pending);
    else setBuilt(next.built);

    // The pending endpoint is already read out by the status line under the
    // buttons; a placed one is announced here, value and open/closed only.
    if (target.kind === 'pending') return;
    const value = endpointValue(next, target);
    const closed = next.built[target.intervalIndex]?.[target.endpoint === 'min' ? 'minClosed' : 'maxClosed'];
    if (value != null) setEndpointAnnouncement(`${closed ? 'Closed' : 'Open'} endpoint at ${rationalLabel(value)}.`);
  };

  /*
   * THE LINE ITSELF BY KEYBOARD. Focused from the keyboard it shows a
   * placement marker: arrows move it by the snap step (Shift: bigger steps,
   * Home/End: the ends), Enter or Space places an endpoint there — the same
   * placeEndpoint a click at that value calls. The marker is not part of the
   * work and is never saved.
   */
  const [lineCursor, setLineCursor] = useState(null);
  const lineCursorValue = lineCursor == null ? null : Math.max(min, Math.min(max, lineCursor));

  const handleLineFocus = (event) => {
    if (event.target !== event.currentTarget) return;
    if (!event.currentTarget.matches?.(':focus-visible')) return;
    if (lineCursor == null) setLineCursor(pending?.value ?? initialLineCursor({ min, max, snapStep }));
  };

  const handleLineBlur = (event) => {
    if (event.target !== event.currentTarget) return;
    setLineCursor(null);
  };

  const handleLineKeyDown = (event) => {
    // Keys on an endpoint inside the line are the endpoint's own.
    if (event.target !== event.currentTarget) return;
    const intent = lineKeyIntent(event, lineCursorValue, { min, max, snapStep });
    if (!intent) return;
    event.preventDefault();
    if (intent.type === 'cursor') {
      setLineCursor(intent.value);
      setEndpointAnnouncement(`Marker at ${rationalLabel(intent.value)}. Press Enter to place ${closedEnd ? 'a closed' : 'an open'} endpoint here.`);
      return;
    }
    const outcome = placeEndpoint(intent.value);
    if (!outcome) return;
    // A first endpoint is read out by the status line under the buttons.
    if (outcome.error) setEndpointAnnouncement(outcome.error);
    else if (outcome.interval) setEndpointAnnouncement(`${closedEnd ? 'Closed' : 'Open'} endpoint placed at ${rationalLabel(intent.value)}. Graph piece from ${rationalLabel(outcome.interval.min)} to ${rationalLabel(outcome.interval.max)} added.`);
    else setEndpointAnnouncement('');
  };

  const endpointKeyHelp = 'Press Enter or Space to switch open or closed. Use the left and right arrow keys to move it, Shift for bigger steps.';

  const reset = () => {
    setEndpointAnnouncement('');
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
    // The verdict is the shared grader's — the one the server runs — over the
    // same bounded bytes the server will read.
    const result = gradeToolCheck(intervalNumberLineGrader, questionData, work);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      { mode: 'numberLine', ask, parts: result.parts },
    );
  };

  const message = () => {
    if (feedback.isCorrect) {
      if (!asksNotation) return 'Correct — your graph matches the inequality.';
      return 'Correct — the graph and the notation agree.';
    }

    // One part per asked stage, from the shared grader.
    const parts = Array.isArray(feedback.metadata?.parts) ? feedback.metadata.parts : [];
    const stageMissed = (id) => parts.some((part) => part.id === id && part.isCorrect !== true);
    if (stageMissed('graph') && built.length === 0) {
      return 'Nothing is graphed yet. Click the line or type an exact endpoint, then place the other endpoint or choose a ray.';
    }
    if (stageMissed('graph')) {
      return 'The graph is not right yet. Check each endpoint, whether it is open or closed, and which region is shaded.';
    }
    if (stageMissed('interval')) {
      return 'The graph is right but the interval notation is not. Fractions are allowed; square brackets include endpoints and round brackets exclude them.';
    }
    if (stageMissed('inequality')) {
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
          'Choose open or closed for each endpoint. Drag a plotted endpoint if you want to move it, or Tab to it and use the arrow keys.',
        ]}
      />

      <EnlargeableFigure
        label="Number line workspace"
        enlargeLabel="Enlarge workspace"
        taskText={questionData.prompt || questionData.task || ''}
        style={{ width: '100%' }}
        openEnlarged={shouldOpenFigureEnlarged({ toolId: 'intervalNumberLine', question: questionData || {}, viewportWidth })}
        dismissKey={figureDismissalKey(questionData || {}, 'intervalNumberLine')}
        presentationKey={questionData?.questionId ?? questionData?.id ?? questionData?.prompt ?? null}
        capabilities={{
          undo: undoHistory.capability,
          pointEditing: { label: 'Edit endpoints', studentState: true },
          numericControls: { label: 'Endpoint controls', studentState: true },
          equationInput: asksNotation || asksInequality ? { label: 'Interval response', studentState: true } : false,
          instruction: { text: questionData.prompt || '' },
          task: { text: questionData.prompt || questionData.task || '' },
          primaryActions: [{ id: 'check-number-line', label: submitActionLabel, onAction: check }],
          secondaryActions: [{ id: 'reset-number-line', label: 'Start over', onAction: reset }],
        }}
      >
      <ToolSplit>
        <Panel title="Build the graph">
          <div
            style={{
              display: 'grid',
              gap: 10,
              padding: 10,
              marginBottom: 10,
              border: '1px solid var(--mm-tint-border)',
              borderRadius: 12,
              background: 'var(--mm-surface-tint)',
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

              <span style={{ color: 'var(--mm-text-muted)', fontSize: 12 }}>
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
                  border: `2px solid ${endpointError ? '#d93025' : 'var(--mm-primary-border)'}`,
                  borderRadius: 8,
                  background: 'var(--mm-surface)',
                  color: 'var(--mm-text-strong)',
                  fontSize: 16,
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

            <div style={{ color: endpointError ? 'var(--mm-error-text)' : 'var(--mm-text-muted)', fontSize: 11.5 }}>
              {endpointError || `Click/drag snap: ${snapLabel}. Exact entry is not limited to visible tick marks.`}
            </div>
          </div>

          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="application"
            tabIndex={0}
            aria-label={`Number line from ${lineEndLabel(min)} to ${lineEndLabel(max)}. Click anywhere on the line to place an endpoint, or drag an existing endpoint. From the keyboard, use the left and right arrow keys to move the marker by ${snapLabel}, Shift for bigger steps, and press Enter or Space to place an endpoint at the marker. You can also type an exact endpoint above.`}
            onFocus={handleLineFocus}
            onBlur={handleLineBlur}
            onKeyDown={handleLineKeyDown}
            onClick={handleLineClick}
            onPointerMove={updateDraggedValue}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              width: '100%',
              height: 'auto',
              border: '1px solid var(--mm-tint-border)',
              borderRadius: 12,
              background: 'var(--mm-surface)',
              cursor: dragging ? 'grabbing' : 'crosshair',
              touchAction: 'none',
              // The line is a tab stop, so a mouse or touch press focuses it.
              // Without this, the browser's default :focus ring would appear
              // on every click. Keyboard focus still gets the ring: the
              // global :focus-visible rule in index.css is !important.
              outline: 'none',
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

            {lineCursorValue != null && (
              <g data-number-line-marker="true" pointerEvents="none" aria-hidden="true">
                <line
                  x1={sx(lineCursorValue)}
                  x2={sx(lineCursorValue)}
                  y1={HEIGHT / 2 - 30}
                  y2={HEIGHT / 2 + 14}
                  style={{ stroke: 'var(--mm-focus, #1a73e8)' }}
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                <polygon
                  points={`${sx(lineCursorValue) - 6},${HEIGHT / 2 - 36} ${sx(lineCursorValue) + 6},${HEIGHT / 2 - 36} ${sx(lineCursorValue)},${HEIGHT / 2 - 28}`}
                  style={{ fill: 'var(--mm-focus, #1a73e8)' }}
                />
              </g>
            )}

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
                      aria-label={`${interval.minClosed ? 'Closed' : 'Open'} endpoint at ${rationalLabel(interval.min)}. Click to switch open or closed. Drag to move it. ${endpointKeyHelp}`}
                      onPointerDown={(event) => beginDrag({ kind: 'built', intervalIndex: index, endpoint: 'min' }, event)}
                      onKeyDown={(event) => handleEndpointKeyDown({ kind: 'built', intervalIndex: index, endpoint: 'min' }, event)}
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
                      aria-label={`${interval.maxClosed ? 'Closed' : 'Open'} endpoint at ${rationalLabel(interval.max)}. Click to switch open or closed. Drag to move it. ${endpointKeyHelp}`}
                      onPointerDown={(event) => beginDrag({ kind: 'built', intervalIndex: index, endpoint: 'max' }, event)}
                      onKeyDown={(event) => handleEndpointKeyDown({ kind: 'built', intervalIndex: index, endpoint: 'max' }, event)}
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
                aria-label={`${pending.closed ? 'Closed' : 'Open'} pending endpoint at ${rationalLabel(pending.value)}. Click to switch it. Drag to move it. ${endpointKeyHelp}`}
                onPointerDown={(event) => beginDrag({ kind: 'pending' }, event)}
                onKeyDown={(event) => handleEndpointKeyDown({ kind: 'pending' }, event)}
                onClick={(event) => {
                  event.stopPropagation();
                  handleEndpointClick(() => setPending((current) => togglePendingEndpoint(current)));
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
              onClick={reset}
              disabled={!built.length && pending == null}
              style={{ ...secondaryButton, opacity: !built.length && pending == null ? 0.5 : 1 }}
            >
              Start over
            </button>
          </div>

          <p role="status" aria-live="polite" data-number-line-endpoint-announcement="true" style={srOnly}>
            {endpointAnnouncement}
          </p>

          <p aria-live="polite" style={{ marginTop: 9, fontSize: 12.5, color: 'var(--mm-text-muted)', lineHeight: 1.4 }}>
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
            <div style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--mm-text)', marginBottom: 12 }}>
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
            <div style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--mm-text)', marginBottom: 12 }}>
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

          <button data-mm-enter-action="submit" type="button" onClick={check} style={{ ...primaryButton, width: '100%' }}>
            {submitActionLabel}
          </button>

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>
                {feedback.isCorrect ? 'Correct' : 'Not yet'}
              </ResultPill>
              <p style={{ margin: '9px 0 0', color: 'var(--mm-text)', lineHeight: 1.55 }}>
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
