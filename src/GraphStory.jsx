import { useEffect, useId, useMemo, useRef, useState } from 'react';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import useUndoHistory from './useUndoHistory';
import graphStoryGrader from '../functions/shared/serverGrading/tools/graphStory.mjs';
import {
  graphStoryHasSourceGraph,
  graphStoryRequiresSketch,
  graphStoryWork,
} from '../functions/shared/toolMath/scenario/graphStoryMath.mjs';
import { gradeToolCheck } from './tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from './platform/grading/sharedAnswerState.js';
import EnlargeableFigure from './components/common/EnlargeableFigure.jsx';
import { clientPointToViewBox } from './utils/responsiveCoordinates.js';
import { useQuestionLifecycle } from './platform/question/QuestionLifecycleContext.jsx';
import {
  SKETCH_KEYBOARD_HELP, SKETCH_START, moveSketchCursor, placeSketchPoint, sketchCursorPoint, sketchCursorWords,
  sketchFinishedWords, sketchKeyAction, sketchKeyGrid, sketchLineCount, sketchPlacedWords,
} from './platform/graph/graphStorySketchKeys.js';

const WIDTH = 720;
const HEIGHT = 420;
const PAD = 44;
const GRID_STEP = 42;
// The squares the keyboard crosshair moves over (AX14): the drawn grid, from
// the corner where the axes meet.
const KEY_GRID = sketchKeyGrid({ width: WIDTH, height: HEIGHT, pad: PAD, step: GRID_STEP });
const CROSSHAIR = '#9334e6';
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

// Where the pointer is in the DRAWING, not in the box: capped to a shorter box,
// the plane is drawn centred and narrower than the box, and a straight
// box-to-viewBox stretch drew the stroke up to the empty band away from the
// pen (PQ-034). Null only for a box with no size.
const pointFromEvent = (event, element) => {
  const point = clientPointToViewBox({
    clientX: event.clientX,
    clientY: event.clientY,
    rect: element.getBoundingClientRect(),
    viewBoxWidth: WIDTH,
    viewBoxHeight: HEIGHT,
  });
  if (!point) return null;
  return {
    x: Math.max(PAD, Math.min(WIDTH - PAD, point.x)),
    y: Math.max(PAD, Math.min(HEIGHT - PAD, point.y)),
  };
};

export default function GraphStory({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const initial = {
    scenario: '',
    independent: '',
    dependent: '',
    xLabel: '',
    xUnit: '',
    yLabel: '',
    yUnit: '',
    explanation: '',
    strokes: [],
  };
  const history = useUndoHistory(initial, 100, draftKey ? `${draftKey}:graph-story` : null);
  const values = history.value;
  const drawingRef = useRef(false);

  const hasSourceGraph = graphStoryHasSourceGraph(question);
  const requireSketch = graphStoryRequiresSketch(question);
  // The student's raw work: the eight texts and a bounded sketch that keeps the
  // ">= 3 points in some stroke" rule exact (graphStoryMath.mjs). The
  // completion verdict comes ONLY from the shared grader the server also runs
  // (serverGrading/tools/graphStory.mjs). Open-ended graph stories earn
  // completion credit and remain visible for teacher review.
  const work = useMemo(() => graphStoryWork(values), [values]);
  const grading = useMemo(() => gradeToolCheck(graphStoryGrader, question, work), [question, work]);
  const questionDetails = `${question.prompt || 'Create a graph story.'} Scenario: ${values.scenario}. Independent: ${values.independent}. Dependent: ${values.dependent}. Axes: ${values.xLabel} (${values.xUnit}) and ${values.yLabel} (${values.yUnit}). Explanation: ${values.explanation}. Sketch strokes: ${values.strokes.length}.`;

  useEffect(() => {
    onStateChange(answerStateFromSharedGrading(grading, { questionDetails }));
  }, [grading, questionDetails, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last graph-story edit or stroke' });
    return () => onUndoStateChange?.(null);
  }, [history.canUndo, history.undo, onUndoStateChange]);

  const setField = (field, value) => history.setValue((current) => ({ ...current, [field]: value }));

  // THE KEYBOARD ROUTE (AX14): a crosshair over the grid, points placed with
  // Enter and joined in order into a line, Escape to finish it
  // (graphStorySketchKeys.js). The pointer still draws freehand.
  // A finished question's sketch is the student's work to read (AX01): an
  // image with its description, no crosshair and no keys to offer.
  const { terminal: questionClosed } = useQuestionLifecycle();
  const keyboardRoute = !questionClosed;
  const [keyCursor, setKeyCursor] = useState(null);
  const [keyLine, setKeyLine] = useState(null);
  const [keyActive, setKeyActive] = useState(false);
  const [keyHelpShown, setKeyHelpShown] = useState(false);
  const [keyAnnouncement, setKeyAnnouncement] = useState('');
  const handleSketchKeyDown = (event) => {
    const action = sketchKeyAction(event);
    if (!action) return;
    if (action === 'finish') {
      const count = sketchLineCount(values.strokes, keyLine);
      // No line being placed: Escape is not the sketch's (it closes Work View).
      if (!count) return;
      event.preventDefault();
      event.stopPropagation();
      setKeyLine(null);
      setKeyAnnouncement(sketchFinishedWords(count));
      return;
    }
    event.preventDefault();
    setKeyActive(true);
    if (action === 'move') {
      const next = moveSketchCursor(keyCursor, event, KEY_GRID);
      setKeyCursor(next);
      setKeyAnnouncement(sketchCursorWords(next));
      return;
    }
    const at = keyCursor || SKETCH_START;
    const placed = placeSketchPoint(values.strokes, keyLine, sketchCursorPoint(at, KEY_GRID));
    setKeyCursor(at);
    setKeyLine(placed.lineIndex);
    history.setValue((current) => ({ ...current, strokes: placed.strokes }));
    setKeyAnnouncement(sketchPlacedWords(placed.count, at));
  };

  const startStroke = (event) => {
    const point = pointFromEvent(event, event.currentTarget);
    if (!point) return;
    // A drawn stroke ends the line being placed by keyboard.
    setKeyLine(null);
    setKeyActive(false);
    drawingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    history.setValue((current) => ({ ...current, strokes: [...current.strokes, [point]] }));
  };
  const continueStroke = (event) => {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event, event.currentTarget);
    if (!point) return;
    history.setValue((current) => {
      const strokes = [...current.strokes];
      const last = [...(strokes.at(-1) || [])];
      last.push(point);
      strokes[strokes.length - 1] = last;
      return { ...current, strokes };
    }, { record: false });
  };
  const endStroke = () => { drawingRef.current = false; };

  const gridLines = [];
  // Squares counted from the axes, so the keyboard crosshair sits on a drawn
  // gridline and can reach the x-axis itself.
  for (let x = PAD; x <= WIDTH - PAD; x += GRID_STEP) gridLines.push(<line key={`vx-${x}`} x1={x} y1={PAD} x2={x} y2={HEIGHT - PAD} style={{ stroke: 'var(--mm-graph-grid-minor)' }} />);
  for (let y = HEIGHT - PAD; y >= PAD; y -= GRID_STEP) gridLines.push(<line key={`hy-${y}`} x1={PAD} y1={y} x2={WIDTH - PAD} y2={y} style={{ stroke: 'var(--mm-graph-grid-minor)' }} />);
  const crosshair = keyboardRoute && keyActive ? sketchCursorPoint(keyCursor || SKETCH_START, KEY_GRID) : null;

  // The sketch in words (student pass 3, Q-8): its axes as the student named
  // them and how many strokes they drew. It is their own drawing.
  const sketchDescriptionId = useId();
  const strokeCount = Array.isArray(values.strokes) ? values.strokes.length : 0;
  const sketchDescription = `x-axis: ${values.xLabel || 'x'}. y-axis: ${values.yLabel || 'y'}. ${strokeCount ? `You drew ${strokeCount} ${strokeCount === 1 ? 'stroke' : 'strokes'}.` : 'Nothing is drawn yet.'}`;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'left' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0 }}>{hasSourceGraph ? 'Read the Graph and Tell Its Story' : 'Write a Scenario and Sketch Its Graph'}</h2>
      <QuestionPrompt>{question.prompt || 'Write a real-world scenario, sketch a graph, and explain how the graph tells the story.'}</QuestionPrompt>
      {hasSourceGraph && <div style={{ maxWidth: '760px', margin: '18px auto' }}><GraphDisplay graph={question.graph} title={question.graphTitle || 'Graph to interpret'} /></div>}
      <p style={{ padding: '10px 14px', borderRadius: '9px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 700 }}>This open-ended question earns completion credit when every required part is present. The teacher can review the written response and saved work in the gradebook.</p>
      <label style={{ display: 'block', fontWeight: 800 }}>Scenario
        <textarea value={values.scenario} onChange={(event) => setField('scenario', event.target.value)} placeholder="Describe a possible trip, cost, distance, height, or another changing relationship." style={{ width: '100%', minHeight: '110px', marginTop: '7px', padding: '12px', boxSizing: 'border-box', borderRadius: '9px', border: '2px solid var(--mm-border)', font: 'inherit' }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '12px', marginTop: '16px' }}>
        {[
          ['independent', 'Independent quantity'], ['dependent', 'Dependent quantity'],
          ['xLabel', 'X-axis label'], ['xUnit', 'X-axis unit'], ['yLabel', 'Y-axis label'], ['yUnit', 'Y-axis unit'],
        ].map(([field, label]) => <label key={field} style={{ fontWeight: 800 }}>{label}<input value={values[field]} onChange={(event) => setField(field, event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', borderRadius: '8px', border: '2px solid var(--mm-border)', fontSize: 'calc(16 * var(--mm-px))' }} /></label>)}
      </div>
      {requireSketch && <section style={{ marginTop: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Graph sketch</h3><button type="button" onClick={() => setField('strokes', [])} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d93025', background: 'var(--mm-surface)', color: 'var(--mm-danger)', fontWeight: 800 }}>Clear graph</button></div>
        <EnlargeableFigure label="Graph story plane" enlargeLabel="Enlarge plane" style={{ width: '100%' }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onKeyDown={keyboardRoute ? handleSketchKeyDown : undefined}
          onFocus={(event) => {
            if (!keyboardRoute) return;
            let keyboard = false;
            try { keyboard = event.currentTarget.matches(':focus-visible'); } catch { keyboard = false; }
            if (keyboard) { setKeyHelpShown(true); setKeyActive(true); }
          }}
          onBlur={() => setKeyActive(false)}
          tabIndex={keyboardRoute ? 0 : undefined}
          style={{ display: 'block', width: '100%', marginTop: '10px', border: '2px solid var(--mm-primary-border)', borderRadius: '12px', background: 'var(--mm-surface)', touchAction: 'none', cursor: 'crosshair', outlineOffset: 2 }}
          role={keyboardRoute ? 'application' : 'img'}
          aria-label="Graph story sketch"
          aria-describedby={keyboardRoute ? `${sketchDescriptionId} ${sketchDescriptionId}-keys` : sketchDescriptionId}
        >
          <rect x={PAD} y={PAD} width={WIDTH - PAD * 2} height={HEIGHT - PAD * 2} style={{ fill: 'var(--mm-graph-bg)', stroke: 'var(--mm-graph-grid)' }} />
          {gridLines}
          <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} style={{ stroke: 'var(--mm-graph-axis)' }} strokeWidth="3" />
          <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} style={{ stroke: 'var(--mm-graph-axis)' }} strokeWidth="3" />
          <text x={WIDTH - PAD - 8} y={HEIGHT - PAD - 10} textAnchor="end" fontSize="17" style={{ fill: 'var(--mm-graph-label)' }}>{values.xLabel || 'x'}</text>
          <text x={PAD + 10} y={PAD + 20} fontSize="17" style={{ fill: 'var(--mm-graph-label)' }}>{values.yLabel || 'y'}</text>
          {/* A stroke of one point (a tap, or a line's first point placed by
              keyboard) is a dot: a polyline of one point draws nothing. */}
          {values.strokes.map((stroke, index) => (stroke.length === 1
            ? <circle key={index} cx={stroke[0].x} cy={stroke[0].y} r="5" fill="#1a73e8" />
            : <polyline key={index} points={stroke.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#1a73e8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />))}
          {crosshair ? (
            <g data-graph-story-crosshair="" pointerEvents="none">
              <line x1={crosshair.x} y1={PAD} x2={crosshair.x} y2={HEIGHT - PAD} stroke={CROSSHAIR} strokeWidth="1.5" strokeDasharray="5 4" />
              <line x1={PAD} y1={crosshair.y} x2={WIDTH - PAD} y2={crosshair.y} stroke={CROSSHAIR} strokeWidth="1.5" strokeDasharray="5 4" />
              <circle cx={crosshair.x} cy={crosshair.y} r="8" fill="none" stroke={CROSSHAIR} strokeWidth="2.5" />
            </g>
          ) : null}
        </svg>
        <span id={sketchDescriptionId} data-graph-story-description="" aria-hidden="true" style={VISUALLY_HIDDEN}>{sketchDescription}</span>
        <span id={`${sketchDescriptionId}-keys`} aria-hidden="true" style={VISUALLY_HIDDEN}>{SKETCH_KEYBOARD_HELP}</span>
        <p aria-live="polite" style={VISUALLY_HIDDEN}>{keyAnnouncement}</p>
        {/* Once the sketch has keyboard focus, the route is on screen too. */}
        {keyboardRoute && keyHelpShown ? <p data-graph-story-keys="" style={{ margin: '6px 0 0', fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{SKETCH_KEYBOARD_HELP}</p> : null}
        </EnlargeableFigure>
      </section>}
      <label style={{ display: 'block', marginTop: '20px', fontWeight: 800 }}>Explain what the points, segments, or smooth curve represent
        <textarea value={values.explanation} onChange={(event) => setField('explanation', event.target.value)} style={{ width: '100%', minHeight: '110px', marginTop: '7px', padding: '12px', boxSizing: 'border-box', borderRadius: '9px', border: `2px solid ${feedback?.partGrades?.find((part) => part.id === 'explanation' && !part.isCorrect) ? '#d93025' : 'var(--mm-border)'}`, font: 'inherit' }} />
      </label>
    </div>
  );
}
