import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import { useToolRuntimeContext } from '../shared/ToolRuntimeContext';
import representationBridgeGrader from '../../../functions/shared/serverGrading/tools/representationBridge.mjs';
import CoordinatePlane from '../shared/CoordinatePlane';
import MathInput from '../../MathInput.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import MathText from '../../components/common/MathText.jsx';
import { isSingleLineAnswerTarget } from '../../platform/interaction/answerEntryUx.js';
import { useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory.js';
import './LinearMultipleRepresentationsBoard.css';
import { lineFromPoints } from '../graphing2/graphingMath.js';
import { toFraction } from '../shared/linearEquations.js';
import {
  CARD_PART_KEYS,
  PART_LABELS,
  cardHasWork,
  cardResponseKey,
  crossRepresentationConsistencyFor,
  deriveLinearMultipleRepresentations,
  describeGivenRepresentation,
  describeSnapStep,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  expandGraphBoundsForAnchor,
  fractionLatex,
  graphFeedbackMessage,
  refineSnapStep,
  resolveExpectedDomain,
  resolveGraph3Anchor,
  resolveGraphSnapSteps,
  resolveGraphTolerance,
  resolveLinearMultipleRepresentationsGraphBounds,
  resolveRequiredCards,
  unfinishedLinearMultipleRepresentationsParts,
  validateContextField,
  validateDomainField,
  validatePointSlopeEntry,
  validateSlopeEntry,
  validateSlopeInterceptEntry,
  validateStandardFormEntry,
  validateTableEntry,
  validateTwoPointsEntry,
  validateXInterceptEntry,
  validateYInterceptEntry,
} from './linearMultipleRepresentationsMath.js';

/*
 * FREE-ORDER MULTIPLE REPRESENTATIONS BOARD.
 *
 * One linear relationship, GIVEN in one representation, built by the student
 * in every other representation in whatever order they choose. Nothing here is
 * gated: every card is open from the start, and checking one card never locks,
 * fills or changes another.
 *
 * Feedback belongs to the activity, not to the board. A card's Check button,
 * its "Correct" badge and the progress counts that follow from them exist only
 * when the question is `guided` AND the runtime shows immediate feedback. In a
 * DOL (feedback after the assignment is submitted) the board shows what is
 * filled in, never what is right.
 */

const touchButton = {
  minHeight: 44,
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid #b8c7de',
  background: 'var(--mm-surface, #fff)',
  color: '#172033',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
};

// Theme tokens, so the board follows dark mode like the rest of the question
// (the theme-contract audit flags hard-coded white).
const primaryButton = {
  ...touchButton,
  background: 'var(--mm-primary)',
  color: 'var(--mm-on-primary)',
  border: '1px solid var(--mm-primary)',
};

const quietButton = {
  ...touchButton,
  background: 'transparent',
  border: '1px solid transparent',
  color: '#174ea6',
  padding: '8px 10px',
};

const cellInput = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '8px 10px',
  border: '1px solid #b8c7de',
  borderRadius: 8,
  fontSize: 17,
  textAlign: 'center',
  background: 'var(--mm-surface)',
};

const selectStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '8px 10px',
  border: '1px solid #b8c7de',
  borderRadius: 8,
  fontSize: 15,
  background: 'var(--mm-surface)',
};

const muted = { fontSize: 13, color: '#5f6b7a', margin: 0, lineHeight: 1.45 };
const errorText = { margin: 0, fontSize: 14, color: '#b3261e', fontWeight: 600, lineHeight: 1.4 };

const correctBadge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: '#e6f4ea',
  color: '#137333',
  whiteSpace: 'nowrap',
};

const givenBadge = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '0.06em',
  background: 'var(--mm-primary)',
  color: 'var(--mm-on-primary)',
};

const defaultTableRows = [
  { x: '', y: '' },
  { x: '', y: '' },
  { x: '', y: '' },
  { x: '', y: '' },
];

// Every card and graph starts open: an order that opens one graph and folds
// the other two tells a student which to do first, and this board has none.
const DEFAULT_EXPANDED = {
  equationForms: true,
  features: true,
  table: true,
  context: true,
  graph1: true,
  graph2: true,
  graph3: true,
};

const GRAPHS = [
  {
    key: 'graph1',
    cardId: 'graphIntercepts',
    title: 'Graph 1 · Intercept method',
    task: 'Plot the x-intercept and the y-intercept — where the line crosses each axis.',
    color: '#1a73e8',
  },
  {
    key: 'graph2',
    cardId: 'graphSlopeIntercept',
    title: 'Graph 2 · Slope-intercept method',
    task: 'Plot the y-intercept, then count the slope (rise over run) to a second point.',
    color: '#188038',
  },
  {
    key: 'graph3',
    cardId: 'graphPointSlope',
    title: 'Graph 3 · Point-slope method',
    task: 'Plot the point from point-slope form, then count the slope to a second point.',
    color: '#b25a00',
  },
];

const CONTEXT_FIELDS = [
  { field: 'contextIndependent', key: 'independentQuantity', label: 'Independent quantity (x)', placeholder: 'e.g. time in hours', prompt: 'Choose the quantity…' },
  { field: 'contextDependent', key: 'dependentQuantity', label: 'Dependent quantity (y)', placeholder: 'e.g. height in inches', prompt: 'Choose the quantity…' },
  { field: 'contextSlopeMeaning', key: 'slopeMeaning', label: 'What the slope means', placeholder: 'What does the slope tell you?', prompt: 'Choose a meaning…' },
  { field: 'contextYInterceptMeaning', key: 'yInterceptMeaning', label: 'What the y-intercept means', placeholder: 'What does the y-intercept tell you?', prompt: 'Choose a meaning…' },
  { field: 'contextXInterceptMeaning', key: 'xInterceptMeaning', label: 'What the x-intercept means', placeholder: 'What does the x-intercept tell you?', prompt: 'Choose a meaning…' },
  { field: 'contextDomain', key: 'domain', label: 'Reasonable domain', placeholder: '0 ≤ x ≤ 9', prompt: 'Choose the domain…' },
];

const pointLatex = (point) => {
  if (!Array.isArray(point)) return '';
  return `(${point.slice(0, 2).map((value) => fractionLatex(toFraction(value))).join(', ')})`;
};

// A list of points as separate math elements with plain commas between them.
// Joining them into one expression with a LaTeX spacing command sent MathLive's
// parser into infinite recursion when the value was read as ASCII math.
function PointList({ points }) {
  return points.map((point, index) => (
    // eslint-disable-next-line react/no-array-index-key -- a student may plot the same point twice
    <React.Fragment key={index}>
      {index > 0 ? ', ' : null}
      <MathDisplay value={pointLatex(point)} inline />
    </React.Fragment>
  ));
}

// A plane whose grid squares are square, so a slope of 1 looks like 45°.
const planeSize = (bounds, width) => {
  const pad = 84;
  const xSpan = Math.max(1e-9, bounds.xMax - bounds.xMin);
  const ySpan = Math.max(1e-9, bounds.yMax - bounds.yMin);
  const height = Math.round(pad + (width - pad) * (ySpan / xSpan));
  return { width, height: Math.max(Math.round(width * 0.62), Math.min(Math.round(width * 1.25), height)) };
};

const lineProps = (points) => {
  if (!Array.isArray(points) || points.length < 2) return { lines: [], verticalLines: [] };
  const line = lineFromPoints(points[0], points[1]);
  if (!line) return { lines: [], verticalLines: [] };
  return line.kind === 'vertical' ? { lines: [], verticalLines: [line.x] } : { lines: [line], verticalLines: [] };
};

function CollapseToggle({ open, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      style={quietButton}
    >
      {open ? '▾ Hide' : '▸ Show'}
    </button>
  );
}

function BoardPanel({ title, open = true, onToggle = null, toggleLabel = '', children }) {
  return (
    <section
      className="mathmaster-tool-panel"
      style={{ border: '1px solid #dde5f0', borderRadius: 14, padding: 14, background: '#fbfdff', textAlign: 'left', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#24324a' }}>{title}</h3>
        {onToggle ? <CollapseToggle open={open} onToggle={onToggle} label={toggleLabel || title} /> : null}
      </div>
      {children}
    </section>
  );
}

function BoardCard({ cardId, title, hint, verdict, canCheck, onCheck, checkLabel, children, extraControls = null, headerActions = null }) {
  const errorId = useId();
  return (
    <div
      data-lmr-card={cardId}
      style={{
        border: `1px solid ${verdict?.isCorrect ? '#9fd3ad' : '#dbe3ef'}`,
        borderRadius: 12,
        padding: 12,
        background: 'var(--mm-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        textAlign: 'left',
      }}
    >
      {/* The title keeps a readable width; the badge and buttons wrap under it
          in a narrow column instead of squeezing it to one word per line. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px 8px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15, color: '#172033', flex: '1 1 170px', minWidth: 0 }}>{title}</strong>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
          {verdict?.isCorrect ? <span style={correctBadge}>✓ Correct</span> : null}
          {headerActions}
        </span>
      </div>
      {hint ? <p style={muted}>{hint}</p> : null}
      {children}
      {canCheck || extraControls ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {extraControls}
          {canCheck ? (
            <button
              type="button"
              data-card-check="true"
              onClick={onCheck}
              style={touchButton}
              aria-label={checkLabel}
              aria-describedby={verdict && !verdict.isCorrect ? errorId : undefined}
            >
              Check
            </button>
          ) : null}
        </div>
      ) : null}
      {verdict && !verdict.isCorrect && verdict.error ? (
        <p id={errorId} style={errorText}>{verdict.error}</p>
      ) : null}
    </div>
  );
}

function GivenRepresentation({ description, graphBounds }) {
  const headingId = useId();
  let body = null;
  if (description.kind === 'equation') {
    body = <MathDisplay value={description.latex} style={{ fontSize: 26, color: '#10223f' }} ariaLabel={`Given equation ${description.latex}`} />;
  } else if (description.kind === 'points') {
    body = (
      <p style={{ margin: 0, fontSize: 22, color: '#10223f', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {description.points.map((point, index) => (
          <React.Fragment key={point.latex}>
            {index > 0 ? <span style={{ fontSize: 16, color: '#3c4a60' }}>and</span> : null}
            <MathDisplay value={point.latex} inline ariaLabel={`Given point ${point.latex}`} />
          </React.Fragment>
        ))}
      </p>
    );
  } else if (description.kind === 'table') {
    body = (
      <table
        aria-label="Given table of values"
        style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 280, fontSize: 18, background: 'var(--mm-surface)', borderRadius: 8, overflow: 'hidden' }}
      >
        <thead>
          <tr>
            <th scope="col" style={{ padding: '6px 12px', borderBottom: '2px solid #1a4fb4', color: '#1a4fb4', fontStyle: 'italic', fontFamily: 'serif', fontSize: 20 }}>x</th>
            <th scope="col" style={{ padding: '6px 12px', borderBottom: '2px solid #1a4fb4', borderLeft: '2px solid #1a4fb4', color: '#1a4fb4', fontStyle: 'italic', fontFamily: 'serif', fontSize: 20 }}>y</th>
          </tr>
        </thead>
        <tbody>
          {description.rows.map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key -- authored rows can repeat a value; order is the identity
            <tr key={index}>
              <td style={{ padding: '6px 12px', textAlign: 'center', borderBottom: '1px solid #dbe3ef' }}><MathDisplay value={row.xLatex} inline /></td>
              <td style={{ padding: '6px 12px', textAlign: 'center', borderBottom: '1px solid #dbe3ef', borderLeft: '2px solid #1a4fb4' }}><MathDisplay value={row.yLatex} inline /></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (description.kind === 'graph') {
    const size = planeSize(graphBounds, 420);
    body = (
      <div style={{ width: '100%', maxWidth: 380 }}>
        <CoordinatePlane
          xMin={graphBounds.xMin}
          xMax={graphBounds.xMax}
          yMin={graphBounds.yMin}
          yMax={graphBounds.yMax}
          width={size.width}
          height={size.height}
          points={description.points}
          lines={description.line ? [{ ...description.line, stroke: '#1a4fb4' }] : []}
          snapStep={refineSnapStep(1, description.points)}
          readableGrid
          pointHoverEnabled={false}
          revealCoordinates={false}
          enlargeable={false}
          ariaLabel="Given graph of the line"
        />
      </div>
    );
  } else if (description.kind === 'scenario') {
    body = (
      <MathText as="p" style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: '#10223f', maxWidth: '68ch' }}>
        {description.text}
      </MathText>
    );
  }
  return (
    <section
      aria-labelledby={headingId}
      data-lmr-given={description.sourceKind}
      style={{
        padding: '14px 16px',
        background: '#f1f6ff',
        border: '2px solid #a9c4f5',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={givenBadge}>GIVEN</span>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16, color: '#10223f' }}>{description.label}</h3>
        <span style={{ fontSize: 13, color: '#3c4a60' }}>You start with this. You do not need to rebuild it.</span>
      </div>
      {body}
    </section>
  );
}

function GraphDialog({ graph, open, onClose, children, returnFocusRef }) {
  const titleId = useId();
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const focusTarget = returnFocusRef?.current || null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      focusTarget?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, returnFocusRef]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-lmr-dialog={graph.key}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.72)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(8px, env(safe-area-inset-top)) 8px',
        boxSizing: 'border-box',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        style={{
          background: 'var(--mm-surface)',
          borderRadius: 14,
          width: 'min(980px, 100%)',
          maxHeight: '100%',
          overflowY: 'auto',
          padding: 16,
          boxSizing: 'border-box',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 id={titleId} style={{ margin: 0, fontSize: 18, color: '#10223f' }}>{graph.title}</h3>
          <button ref={closeRef} type="button" onClick={onClose} style={touchButton} aria-label={`Close enlarged ${graph.title}`}>
            ✕ Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function LinearMultipleRepresentationsBoard({ questionData = {}, onAction }) {
  const canonicalFacts = useMemo(() => deriveLinearMultipleRepresentations(questionData), [questionData]);
  const givenDescription = useMemo(() => describeGivenRepresentation(questionData, canonicalFacts), [questionData, canonicalFacts]);
  const required = useMemo(() => resolveRequiredCards(questionData), [questionData]);
  const needs = useCallback((cardId) => required.includes(cardId), [required]);
  const tolerance = resolveGraphTolerance(questionData);
  const { showImmediateFeedback, questionTerminal } = useToolRuntimeContext();
  const feedbackTiming = questionData.feedbackTiming === 'submitOnly' ? 'submitOnly' : 'guided';
  // Checking a card IS feedback. It exists only where the activity allows it.
  const canCheck = feedbackTiming === 'guided' && showImmediateFeedback;

  // Everything a student can answer with is draft-backed.
  const [standardFormEquation, setStandardFormEquation] = usePersistentToolState('standardFormEquation', '');
  const [slopeInterceptEquation, setSlopeInterceptEquation] = usePersistentToolState('slopeInterceptEquation', '');
  const [pointSlopeEquation, setPointSlopeEquation] = usePersistentToolState('pointSlopeEquation', '');

  const [featureSlope, setFeatureSlope] = usePersistentToolState('featureSlope', '');
  const [featureXIntercept, setFeatureXIntercept] = usePersistentToolState('featureXIntercept', '');
  const [featureYIntercept, setFeatureYIntercept] = usePersistentToolState('featureYIntercept', '');
  const [featurePoint1, setFeaturePoint1] = usePersistentToolState('featurePoint1', '');
  const [featurePoint2, setFeaturePoint2] = usePersistentToolState('featurePoint2', '');

  const [tableRows, setTableRows] = usePersistentToolState('tableRows', defaultTableRows);

  const [graph1Points, setGraph1Points] = usePersistentToolState('graph1Points', []);
  const [graph2Points, setGraph2Points] = usePersistentToolState('graph2Points', []);
  const [graph3Points, setGraph3Points] = usePersistentToolState('graph3Points', []);

  const [contextIndependent, setContextIndependent] = usePersistentToolState('contextIndependent', '');
  const [contextDependent, setContextDependent] = usePersistentToolState('contextDependent', '');
  const [contextSlopeMeaning, setContextSlopeMeaning] = usePersistentToolState('contextSlopeMeaning', '');
  const [contextYInterceptMeaning, setContextYInterceptMeaning] = usePersistentToolState('contextYInterceptMeaning', '');
  const [contextXInterceptMeaning, setContextXInterceptMeaning] = usePersistentToolState('contextXInterceptMeaning', '');
  const [contextDomain, setContextDomain] = usePersistentToolState('contextDomain', '');

  // WHICH work the student has pressed Check on — a fingerprint per card, and
  // nothing else. The verdict is never stored: it is recomputed from the
  // question each render. A stored verdict (`isCorrect`) is a forbidden draft
  // key, and one of them in the record makes the workspace sync refuse the
  // WHOLE record, silently ending the server backup of every equation, table
  // and graph on the board. Fingerprints keep a reload looking exactly the way
  // the student left it without carrying any grading.
  const [checkedCards, setCheckedCards] = usePersistentToolState('checkedCards', {});
  const [storedExpanded, setExpandedCards] = usePersistentToolState('expandedCards', DEFAULT_EXPANDED);
  const expandedCards = { ...DEFAULT_EXPANDED, ...storedExpanded };

  // Presentation only.
  const [notice, setNotice] = useState('');
  const [enlargedGraph, setEnlargedGraph] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const contextSetters = {
    contextIndependent: setContextIndependent,
    contextDependent: setContextDependent,
    contextSlopeMeaning: setContextSlopeMeaning,
    contextYInterceptMeaning: setContextYInterceptMeaning,
    contextXInterceptMeaning: setContextXInterceptMeaning,
    contextDomain: setContextDomain,
  };

  const currentResponse = useMemo(() => ({
    standardFormEquation,
    slopeInterceptEquation,
    pointSlopeEquation,
    featureSlope,
    featureXIntercept,
    featureYIntercept,
    featurePoint1,
    featurePoint2,
    tableRows,
    graph1Points,
    graph2Points,
    graph3Points,
    contextIndependent,
    contextDependent,
    contextSlopeMeaning,
    contextYInterceptMeaning,
    contextXInterceptMeaning,
    contextDomain,
  }), [
    standardFormEquation, slopeInterceptEquation, pointSlopeEquation,
    featureSlope, featureXIntercept, featureYIntercept, featurePoint1, featurePoint2,
    tableRows, graph1Points, graph2Points, graph3Points,
    contextIndependent, contextDependent, contextSlopeMeaning, contextYInterceptMeaning, contextXInterceptMeaning, contextDomain,
  ]);
  // Enter can arrive before the render that follows the keystroke; checks read
  // the latest work from here rather than from a closure one render behind.
  const responseRef = useRef(currentResponse);
  responseRef.current = currentResponse;
  // The live board, reported as it changes, so a deadline can mark exactly
  // what Submit would have sent — the same object Submit grades.
  useReportToolWork(currentResponse);

  // Graph 3 starts from the given point, or the student's own VALID point.
  const graph3Anchor = useMemo(
    () => resolveGraph3Anchor(questionData, canonicalFacts, pointSlopeEquation),
    [questionData, canonicalFacts, pointSlopeEquation],
  );
  const snapSteps = useMemo(
    () => resolveGraphSnapSteps(questionData, canonicalFacts, graph3Anchor.point),
    [questionData, canonicalFacts, graph3Anchor.point],
  );
  const graphBounds = useMemo(
    () => resolveLinearMultipleRepresentationsGraphBounds(questionData, canonicalFacts),
    [questionData, canonicalFacts],
  );
  const graph3Bounds = useMemo(
    () => (graph3Anchor.point ? expandGraphBoundsForAnchor(graphBounds, graph3Anchor.point, canonicalFacts) : graphBounds),
    [graphBounds, graph3Anchor.point, canonicalFacts],
  );

  // Same precedence as scoreLinearMultipleRepresentations, so the meanings on
  // screen are the meanings that are graded.
  const contextData = questionData.source?.context || questionData.context || {};
  const contextFields = useMemo(() => CONTEXT_FIELDS.filter(({ key }) => (
    key === 'domain' ? (contextData.domain != null || questionData.domain != null) : contextData[key] != null
  )), [contextData, questionData.domain]);
  const contextChoices = useMemo(() => {
    const banks = contextData.choiceBanks || contextData.choices || {};
    return Object.fromEntries(CONTEXT_FIELDS.map(({ key }) => [
      key,
      Array.isArray(banks[key]) ? banks[key] : Array.isArray(contextData[key]?.choices) ? contextData[key].choices : null,
    ]));
  }, [contextData]);
  // The score's own rule, so Check and Submit judge the domain against the same key.
  const expectedDomain = resolveExpectedDomain(questionData);

  // ---------------------------------------------------------------- checks
  const graphPointsByKey = { graph1: graph1Points, graph2: graph2Points, graph3: graph3Points };
  const graphSettersByKey = { graph1: setGraph1Points, graph2: setGraph2Points, graph3: setGraph3Points };

  const evaluateGraph = (key, points, anchor = graph3Anchor) => {
    if (key === 'graph1') return evaluateGraph1Intercepts(points, canonicalFacts, tolerance);
    if (key === 'graph2') return evaluateGraph2SlopeIntercept(points, canonicalFacts, tolerance);
    return evaluateGraph3PointSlope(points, canonicalFacts, anchor.point, tolerance);
  };

  const validateCard = (cardId, response) => {
    switch (cardId) {
      case 'standardForm': return validateStandardFormEntry(response.standardFormEquation, canonicalFacts);
      case 'slopeIntercept': return validateSlopeInterceptEntry(response.slopeInterceptEquation, canonicalFacts);
      case 'pointSlope': return validatePointSlopeEntry(response.pointSlopeEquation, canonicalFacts);
      case 'slope': return validateSlopeEntry(response.featureSlope, canonicalFacts);
      case 'xIntercept': return validateXInterceptEntry(response.featureXIntercept, canonicalFacts);
      case 'yIntercept': return validateYInterceptEntry(response.featureYIntercept, canonicalFacts);
      case 'twoPoints': return validateTwoPointsEntry(response.featurePoint1, response.featurePoint2, canonicalFacts);
      case 'table': return validateTableEntry(response.tableRows, canonicalFacts, 4);
      default: {
        const graph = GRAPHS.find((entry) => entry.cardId === cardId);
        if (!graph) return { isCorrect: false, error: null };
        const points = response[`${graph.key}Points`] || [];
        const anchor = resolveGraph3Anchor(questionData, canonicalFacts, response.pointSlopeEquation);
        const evaluation = evaluateGraph(graph.key, points, anchor);
        return { isCorrect: Boolean(evaluation.isCorrect), error: graphFeedbackMessage(graph.key, points, evaluation) };
      }
    }
  };

  // One stable Enter handler per card. MathInput re-attaches its listeners
  // whenever onSubmit changes identity, and an inline closure changes on every
  // render — i.e. on every keystroke in any field of the board.
  const runCheckRef = useRef(null);
  const enterHandlers = useMemo(() => Object.fromEntries(
    ['standardForm', 'slopeIntercept', 'pointSlope', 'slope', 'xIntercept', 'yIntercept', 'twoPoints']
      .map((cardId) => [cardId, () => runCheckRef.current?.(cardId)]),
  ), []);

  const judge = (cardId, response) => {
    const result = validateCard(cardId, response);
    const isCorrect = Boolean(result.isCorrect);
    return { checked: true, isCorrect, error: isCorrect ? null : (result.error || 'Not yet. Take another look.') };
  };

  const runCheck = (cardId) => {
    if (!canCheck) return;
    const response = responseRef.current;
    const verdict = judge(cardId, response);
    setCheckedCards((prev) => ({ ...prev, [cardId]: cardResponseKey(cardId, response) }));
    const label = PART_LABELS[CARD_PART_KEYS[cardId]] || cardId;
    setNotice(`${label}: ${verdict.isCorrect ? 'correct.' : verdict.error}`);
  };
  runCheckRef.current = runCheck;

  // A verdict exists only for work the student checked, and only while the
  // card still holds exactly that work. It is recomputed, never restored.
  const verdicts = useMemo(() => {
    if (!canCheck) return {};
    return Object.fromEntries(Object.entries(checkedCards || {})
      .filter(([cardId, key]) => cardId !== 'context' && typeof key === 'string' && key === cardResponseKey(cardId, currentResponse))
      .map(([cardId]) => [cardId, judge(cardId, currentResponse)]));
    // judge reads only the question and the response passed to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCheck, checkedCards, currentResponse, questionData]);
  const verdictFor = (cardId) => verdicts[cardId] || null;

  const contextKeyFor = (response) => JSON.stringify(contextFields.map(({ field }) => response[field] ?? ''));
  const judgeContext = (response) => Object.fromEntries(contextFields.map(({ field, key }) => {
    const value = response[field];
    const ok = key === 'domain'
      ? validateDomainField(value, expectedDomain).isCorrect
      : validateContextField(value, contextData[key]).valid;
    return [field, Boolean(ok)];
  }));
  const checkContext = () => {
    if (!canCheck) return;
    const response = responseRef.current;
    const results = judgeContext(response);
    const wrong = contextFields.filter(({ field }) => !results[field]).length;
    setCheckedCards((prev) => ({ ...prev, context: contextKeyFor(response) }));
    setNotice(wrong === 0 ? 'Meanings: all correct.' : `Meanings: ${wrong} to take another look at.`);
  };
  const contextVerdict = canCheck && checkedCards?.context && checkedCards.context === contextKeyFor(currentResponse)
    ? { results: judgeContext(currentResponse) }
    : null;

  // --------------------------------------------------------------- progress
  const partsByCategory = [
    { id: 'equationForms', label: 'Equations', cards: ['standardForm', 'slopeIntercept', 'pointSlope'].filter(needs) },
    { id: 'features', label: 'Key features', cards: ['slope', 'xIntercept', 'yIntercept', 'twoPoints'].filter(needs) },
    { id: 'table', label: 'Table', cards: ['table'].filter(needs) },
    { id: 'graphs', label: 'Graphs', cards: GRAPHS.map((graph) => graph.cardId).filter(needs) },
  ].filter((category) => category.cards.length);
  const cardDone = (cardId) => (canCheck ? Boolean(verdictFor(cardId)?.isCorrect) : cardHasWork(cardId, currentResponse));
  const contextDone = (field) => (canCheck
    ? Boolean(contextVerdict?.results?.[field])
    : String(currentResponse[field] ?? '').trim() !== '');
  const progressGroups = [
    ...partsByCategory.map((category) => ({ ...category, done: category.cards.filter(cardDone).length, total: category.cards.length })),
    ...(contextFields.length ? [{ id: 'context', label: 'Meanings', done: contextFields.filter(({ field }) => contextDone(field)).length, total: contextFields.length }] : []),
  ];
  const partsTotal = progressGroups.reduce((sum, group) => sum + group.total, 0);
  const partsDone = progressGroups.reduce((sum, group) => sum + group.done, 0);
  // The shared grader's own completeness rule: a required card with no work,
  // or a graded meaning left blank. Empty here is exactly isComplete there.
  const emptyParts = unfinishedLinearMultipleRepresentationsParts(questionData, currentResponse).map((partId) => PART_LABELS[partId] || partId);

  const toggle = (key) => setExpandedCards((prev) => {
    const current = { ...DEFAULT_EXPANDED, ...prev };
    return { ...current, [key]: !current[key] };
  });

  // ----------------------------------------------------------------- graphs
  // Undo history lives in memory only: histories are never draft-backed
  // (they would count against the workspace sync cap). After a reload Undo
  // falls back to removing the last point.
  const historyRef = useRef({ graph1: [], graph2: [], graph3: [] });
  const [historyVersion, setHistoryVersion] = useState(0);
  // The latest points, updated the moment a change is made. Two taps that land
  // before React re-renders (a slow Chromebook) must build on each other, not
  // both on the points from the last render.
  const latestPointsRef = useRef(graphPointsByKey);
  latestPointsRef.current = graphPointsByKey;
  // Which graph each recorded change was on, in order, so the platform Undo
  // in the action bar can take back the student's LAST graph change wherever
  // it was. Before, that button was always disabled on this board while each
  // graph had its own Undo — two Undos, one of which never worked (student UX
  // pass, R-14). Both now pop the same per-graph history.
  const editOrderRef = useRef([]);
  const changeGraph = (key, next) => {
    clearFeedback();
    const current = latestPointsRef.current[key] || [];
    historyRef.current[key] = [...historyRef.current[key].slice(-19), current];
    editOrderRef.current = [...editOrderRef.current.slice(-59), key];
    latestPointsRef.current = { ...latestPointsRef.current, [key]: next };
    setHistoryVersion((value) => value + 1);
    graphSettersByKey[key](next);
  };
  const plotPoint = (key, point) => {
    const current = latestPointsRef.current[key] || [];
    // Two points make the line. A third tap moves the newest point instead of
    // wiping the construction; the first point (usually the method's
    // starting point) stays until the student drags or undoes it.
    changeGraph(key, current.length >= 2 ? [current[0], point] : [...current, point]);
  };
  const movePoint = (key, index, point) => changeGraph(key, (latestPointsRef.current[key] || []).map((existing, i) => (i === index ? point : existing)));
  const undoGraph = (key) => {
    clearFeedback();
    const stack = historyRef.current[key];
    if (stack.length) {
      const previous = stack[stack.length - 1];
      historyRef.current[key] = stack.slice(0, -1);
      const lastEdit = editOrderRef.current.lastIndexOf(key);
      if (lastEdit >= 0) editOrderRef.current = editOrderRef.current.filter((_, index) => index !== lastEdit);
      latestPointsRef.current = { ...latestPointsRef.current, [key]: previous };
      setHistoryVersion((value) => value + 1);
      graphSettersByKey[key](previous);
      return;
    }
    const fallback = (latestPointsRef.current[key] || []).slice(0, -1);
    latestPointsRef.current = { ...latestPointsRef.current, [key]: fallback };
    graphSettersByKey[key](fallback);
  };
  const clearGraph = (key) => changeGraph(key, []);
  // historyVersion re-renders the Undo buttons when only the history changed.
  const canUndo = (key) => historyVersion >= 0 && (historyRef.current[key].length > 0 || (graphPointsByKey[key] || []).length > 0);

  // The platform Undo: the most recent graph change that is still undoable.
  const undoGraphRef = useRef(undoGraph);
  undoGraphRef.current = undoGraph;
  const lastUndoableGraph = historyVersion >= 0
    ? [...editOrderRef.current].reverse().find((key) => historyRef.current[key]?.length > 0) || null
    : null;
  const graphTitles = { graph1: 'Graph 1', graph2: 'Graph 2', graph3: 'Graph 3' };
  const platformUndo = useMemo(() => ({
    canUndo: Boolean(lastUndoableGraph),
    onUndo: () => {
      const key = [...editOrderRef.current].reverse().find((entry) => historyRef.current[entry]?.length > 0);
      if (key) undoGraphRef.current(key);
    },
    label: lastUndoableGraph ? `Undo the last change on ${graphTitles[lastUndoableGraph]}` : 'Undo the last graph change',
    // eslint-disable-next-line react-hooks/exhaustive-deps -- graphTitles is constant
  }), [lastUndoableGraph]);
  useActiveUndoOwner({ id: 'linear-representations-graphs', controller: platformUndo });

  const enlargeButtonRefs = { graph1: useRef(null), graph2: useRef(null), graph3: useRef(null) };
  const closeDialog = useCallback(() => setEnlargedGraph(null), []);

  const graph3Guide = (() => {
    if (graph3Anchor.origin === 'given') return <>Start at the given point <MathDisplay value={pointLatex(graph3Anchor.point)} inline />.</>;
    if (graph3Anchor.origin === 'student') return <>Start at your point <MathDisplay value={pointLatex(graph3Anchor.point)} inline /> from your point-slope equation.</>;
    if (graph3Anchor.offLinePoint) return <>The point in your point-slope equation is not on this line yet, so start at any point on the line.</>;
    return needs('pointSlope')
      ? <>Start at the point you use in point-slope form — or at any point on the line if you graph first.</>
      : <>Start at any point on the line, then use the slope.</>;
  })();

  const snapFor = (key) => (key === 'graph3' ? snapSteps.graph3 : snapSteps[key]);

  // The enlarged plane is as large as the screen allows while its task and
  // Check stay visible: beside the plane on a wide screen, under it on a phone.
  const enlargedPlaneMaxWidth = (graph) => {
    if (typeof window === 'undefined') return 640;
    const bounds = graph.key === 'graph3' ? graph3Bounds : graphBounds;
    const size = planeSize(bounds, 640);
    const aspect = size.height / size.width;
    const stacked = window.innerWidth < 720;
    const room = window.innerHeight - (stacked ? 380 : 150);
    return Math.max(220, Math.round(room / aspect));
  };
  const boundsFor = (key) => (key === 'graph3' ? graph3Bounds : graphBounds);

  const renderPlane = (graph, width, extra = {}) => {
    const bounds = boundsFor(graph.key);
    const size = planeSize(bounds, width);
    const points = graphPointsByKey[graph.key] || [];
    return (
      // The window and grid are published on the wrapper so a browser QA
      // driver can aim like a student does, by position, not by injected state.
      <div
        data-lmr-plane={graph.key}
        data-bounds={[bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].join(',')}
        data-snap={snapFor(graph.key)}
      >
      <CoordinatePlane
        xMin={bounds.xMin}
        xMax={bounds.xMax}
        yMin={bounds.yMin}
        yMax={bounds.yMax}
        width={size.width}
        height={size.height}
        snapStep={snapFor(graph.key)}
        points={points.map((point) => ({ x: point[0], y: point[1], fill: graph.color }))}
        {...lineProps(points)}
        onPlot={(point) => plotPoint(graph.key, point)}
        onMovePoint={(index, point) => movePoint(graph.key, index, point)}
        enlargeable={false}
        ariaLabel={`Coordinate plane for ${graph.title}`}
        viewResetKey={`${questionData.questionId || ''}:${graph.key}`}
        {...extra}
      />
      </div>
    );
  };

  const graphStatus = (graph) => {
    const points = graphPointsByKey[graph.key] || [];
    if (!points.length) return 'No points yet.';
    const listed = <PointList points={points} />;
    return points.length >= 2
      ? <>Your points: {listed}. Tap the grid to move your second point, or drag either point.</>
      : <>Your point: {listed}. Plot one more.</>;
  };

  const graphControls = (graph) => (
    <>
      <button type="button" onClick={() => undoGraph(graph.key)} disabled={!canUndo(graph.key)} style={touchButton} aria-label={`Undo on ${graph.title}`}>
        ↶ Undo
      </button>
      <button type="button" onClick={() => clearGraph(graph.key)} disabled={!(graphPointsByKey[graph.key] || []).length} style={touchButton} aria-label={`Start ${graph.title} over`}>
        Start over
      </button>
    </>
  );

  // ---------------------------------------------------------------- submit
  // Graded when submitted, not on every keystroke: scoring every card parses
  // every equation, and doing that per key is typing latency on a Chromebook.
  //
  // The verdict is the shared grader's — the function the server runs as the
  // authority, through the bytes the server will read — so what the student
  // sees after Submit is what the gradebook records. Parts are labelled
  // ("Graph 3 (point-slope)", not "graph3") and carry no answer key: nothing
  // derived from the line travels with the attempt.
  const doSubmit = () => {
    setConfirmSubmit(false);
    const work = responseRef.current;
    const result = gradeToolCheck(representationBridgeGrader, questionData, work);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      { mode: 'linearMultipleRepresentations', parts: result.parts },
    );
  };
  const handleSubmit = () => {
    if (emptyParts.length && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    doSubmit();
  };
  useEffect(() => { if (!emptyParts.length) setConfirmSubmit(false); }, [emptyParts.length]);

  const submittedParts = Array.isArray(feedback?.metadata?.parts) ? feedback.metadata.parts : [];
  const partsToRevisit = submittedParts
    .filter((part) => !part.isCorrect && part.id !== 'crossRepresentationConsistency')
    .map((part) => part.label);
  // Which submitted representations disagree with the rest of the student's
  // own work. Named from the submitted work alone — it says nothing about the
  // answer — so it is recomputed here rather than shipped with the attempt.
  const outliers = useMemo(() => {
    if (!feedback?.response || !canonicalFacts.isValid) return [];
    return crossRepresentationConsistencyFor(questionData, feedback.response, canonicalFacts).consistency.outliers || [];
  }, [feedback, questionData, canonicalFacts]);

  const allGraphsRequired = GRAPHS.every((graph) => needs(graph.cardId));
  const allGraphsVerified = allGraphsRequired && GRAPHS.every((graph) => verdictFor(graph.cardId)?.isCorrect);
  const showComparison = canCheck && allGraphsRequired && (allGraphsVerified || feedback?.isCorrect === true);

  // Enter checks the card the student is typing in — never the whole board.
  const handleBoardKeyDown = (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!isSingleLineAnswerTarget(event.target)) return;
    event.preventDefault();
    const card = event.target.closest?.('[data-lmr-card]');
    card?.querySelector?.('button[data-card-check="true"]:not([disabled])')?.click();
  };

  // ------------------------------------------------------------ card bodies
  const equationCard = (cardId, title, value, setValue, placeholder, hint) => {
    const verdict = verdictFor(cardId);
    return (
      <BoardCard
        key={cardId}
        cardId={cardId}
        title={title}
        hint={hint}
        verdict={verdict}
        canCheck={canCheck}
        onCheck={() => runCheck(cardId)}
        checkLabel={`Check ${title}`}
      >
        <MathInput
          toolProfile="equation"
          placeholder={placeholder}
          ariaLabel={title}
          value={value}
          inputStatus={verdict ? (verdict.isCorrect ? 'correct' : 'incorrect') : 'neutral'}
          onChange={(next) => {
            clearFeedback();
            setValue(next);
          }}
          onSubmit={canCheck ? enterHandlers[cardId] : null}
        />
      </BoardCard>
    );
  };

  const featureCard = (cardId, title, value, setValue, toolProfile, placeholder, hint) => {
    const verdict = verdictFor(cardId);
    return (
      <BoardCard
        key={cardId}
        cardId={cardId}
        title={title}
        hint={hint}
        verdict={verdict}
        canCheck={canCheck}
        onCheck={() => runCheck(cardId)}
        checkLabel={`Check ${title}`}
      >
        <MathInput
          toolProfile={toolProfile}
          placeholder={placeholder}
          ariaLabel={title}
          value={value}
          compact
          inputStatus={verdict ? (verdict.isCorrect ? 'correct' : 'incorrect') : 'neutral'}
          onChange={(next) => {
            clearFeedback();
            setValue(next);
          }}
          onSubmit={canCheck ? enterHandlers[cardId] : null}
        />
      </BoardCard>
    );
  };

  const equationCards = [
    needs('standardForm') && equationCard('standardForm', 'Standard form', standardFormEquation, setStandardFormEquation, 'Ax + By = C', 'Whole-number coefficients, no common factor, positive x-coefficient.'),
    needs('slopeIntercept') && equationCard('slopeIntercept', 'Slope-intercept form', slopeInterceptEquation, setSlopeInterceptEquation, 'y = mx + b', 'Keep fractions exact.'),
    needs('pointSlope') && equationCard('pointSlope', 'Point-slope form', pointSlopeEquation, setPointSlopeEquation, 'y − y₁ = m(x − x₁)', 'Use any point on the line as (x₁, y₁).'),
  ].filter(Boolean);

  const featureCards = [
    needs('slope') && featureCard('slope', 'Slope', featureSlope, setFeatureSlope, 'number', 'm', null),
    needs('xIntercept') && featureCard('xIntercept', 'x-intercept', featureXIntercept, setFeatureXIntercept, 'orderedPair', '(x, 0)', null),
    needs('yIntercept') && featureCard('yIntercept', 'y-intercept', featureYIntercept, setFeatureYIntercept, 'orderedPair', '(0, y)', null),
  ].filter(Boolean);

  const twoPointsVerdict = verdictFor('twoPoints');
  const twoPointsCard = needs('twoPoints') ? (
    <BoardCard
      key="twoPoints"
      cardId="twoPoints"
      title="Two points on the line"
      hint="Any two different points on this line."
      verdict={twoPointsVerdict}
      canCheck={canCheck}
      onCheck={() => runCheck('twoPoints')}
      checkLabel="Check two points on the line"
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 8 }}>
        {[[featurePoint1, setFeaturePoint1, 'First point'], [featurePoint2, setFeaturePoint2, 'Second point']].map(([value, setValue, label]) => (
          <MathInput
            key={label}
            toolProfile="orderedPair"
            placeholder="(x, y)"
            ariaLabel={label}
            value={value}
            compact
            inputStatus={twoPointsVerdict ? (twoPointsVerdict.isCorrect ? 'correct' : 'incorrect') : 'neutral'}
            onChange={(next) => {
              clearFeedback();
              setValue(next);
            }}
            onSubmit={canCheck ? enterHandlers.twoPoints : null}
          />
        ))}
      </div>
    </BoardCard>
  ) : null;

  const filledRows = (Array.isArray(tableRows) ? tableRows : []).filter((row) => String(row?.x ?? '').trim() && String(row?.y ?? '').trim());
  const tableVerdict = verdictFor('table');
  const tableCard = needs('table') ? (
    <BoardCard
      cardId="table"
      title="Table of values"
      hint="At least 4 rows, each a point on the line. Fractions like 1/2 are fine."
      verdict={tableVerdict}
      canCheck={canCheck}
      onCheck={() => runCheck('table')}
      checkLabel="Check table of values"
      extraControls={(
        <button
          type="button"
          onClick={() => {
            clearFeedback();
            setTableRows((prev) => [...(Array.isArray(prev) ? prev : []), { x: '', y: '' }]);
          }}
          style={touchButton}
        >
          + Add row
        </button>
      )}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th scope="col" style={{ padding: '4px 6px', fontStyle: 'italic', fontFamily: 'serif', fontSize: 19, color: '#24324a' }}>x</th>
            <th scope="col" style={{ padding: '4px 6px', fontStyle: 'italic', fontFamily: 'serif', fontSize: 19, color: '#24324a' }}>y</th>
            <th scope="col" style={{ width: 48 }}><span className="mm-sr-only">Remove row</span></th>
          </tr>
        </thead>
        <tbody>
          {(Array.isArray(tableRows) ? tableRows : []).map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key -- rows are positional; a student may leave two identical
            <tr key={index}>
              {['x', 'y'].map((field) => (
                <td key={field} style={{ padding: 4 }}>
                  <input
                    type="text"
                    // A text keyboard, not inputMode="decimal": the iPhone
                    // decimal pad has no minus sign and no slash, so a
                    // negative or fractional row would be impossible to type.
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={row?.[field] ?? ''}
                    onChange={(event) => {
                      clearFeedback();
                      const next = event.target.value;
                      setTableRows((prev) => (Array.isArray(prev) ? prev : []).map((entry, i) => (i === index ? { ...entry, [field]: next } : entry)));
                    }}
                    style={cellInput}
                    aria-label={`Row ${index + 1} ${field}`}
                  />
                </td>
              ))}
              <td style={{ padding: 4, textAlign: 'center' }}>
                {tableRows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearFeedback();
                      setTableRows((prev) => (Array.isArray(prev) && prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
                    }}
                    style={{ ...touchButton, minWidth: 44, padding: '4px 8px', color: '#b3261e' }}
                    aria-label={`Remove row ${index + 1}`}
                  >
                    ✕
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </BoardCard>
  ) : null;

  const graphCards = GRAPHS.filter((graph) => needs(graph.cardId)).map((graph) => {
    const verdict = verdictFor(graph.cardId);
    const open = expandedCards[graph.key];
    const points = graphPointsByKey[graph.key] || [];
    return (
      <BoardCard
        key={graph.key}
        cardId={graph.cardId}
        title={graph.title}
        hint={graph.task}
        verdict={verdict}
        canCheck={canCheck && open}
        onCheck={() => runCheck(graph.cardId)}
        checkLabel={`Check ${graph.title}`}
        extraControls={open ? graphControls(graph) : null}
        headerActions={(
          <>
            <button
              ref={enlargeButtonRefs[graph.key]}
              type="button"
              onClick={() => setEnlargedGraph(graph.key)}
              style={{ ...quietButton, padding: '8px 8px' }}
              aria-label={`Enlarge ${graph.title}`}
            >
              ⤢ Enlarge
            </button>
            <CollapseToggle open={open} onToggle={() => toggle(graph.key)} label={graph.title} />
          </>
        )}
      >
        {graph.key === 'graph3' ? <p style={{ ...muted, color: '#3c4a60' }}>{graph3Guide}</p> : null}
        {open ? (
          <>
            <div style={{ width: '100%', maxWidth: 440, margin: '0 auto' }}>
              {renderPlane(graph, 440, { panZoom: false, showPlotHelp: false })}
            </div>
            <p style={muted}>{graphStatus(graph)}</p>
          </>
        ) : (
          <p style={muted}>
            {points.length ? <>Points: <PointList points={points} /></> : 'No points yet.'}
          </p>
        )}
      </BoardCard>
    );
  });

  const renderContextField = ({ field, key, label, placeholder, prompt }) => {
    const value = currentResponse[field] ?? '';
    const setValue = contextSetters[field];
    const choices = contextChoices[key];
    const result = contextVerdict?.results?.[field];
    return (
      <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14, color: '#172033' }}>{label}</strong>
          {contextVerdict ? (
            result
              ? <span style={correctBadge}>✓ Correct</span>
              : <span style={{ ...correctBadge, background: '#fce8e6', color: '#b3261e' }}>Take another look</span>
          ) : null}
        </span>
        {choices?.length ? (
          <select
            value={value}
            onChange={(event) => {
              clearFeedback();
              setValue(event.target.value);
            }}
            style={selectStyle}
          >
            <option value="">{prompt}</option>
            {choices.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : key === 'domain' ? (
          <MathInput
            toolProfile="inequality"
            placeholder={placeholder}
            ariaLabel={label}
            value={value}
            compact
            onChange={(next) => {
              clearFeedback();
              setValue(next);
            }}
          />
        ) : (
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              clearFeedback();
              setValue(event.target.value);
            }}
            style={{ ...selectStyle, fontSize: 16 }}
          />
        )}
      </label>
    );
  };

  const contextPanel = contextFields.length ? (
    <BoardPanel title="What the numbers mean" open={expandedCards.context} onToggle={() => toggle('context')} toggleLabel="meanings">
      <div data-lmr-card="context" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {expandedCards.context ? (
          <>
            {/* Wide tracks: a meaning is a sentence, and a narrow dropdown cuts
                off the very answer the student is choosing. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
              {contextFields.map(renderContextField)}
            </div>
            {canCheck ? (
              <div>
                <button type="button" data-card-check="true" onClick={checkContext} style={touchButton} aria-label="Check meanings">
                  Check
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p style={muted}>
            {contextFields.filter(({ field }) => String(currentResponse[field] ?? '').trim()).length} of {contextFields.length} answered.
          </p>
        )}
      </div>
    </BoardPanel>
  ) : null;

  const collapsedEquations = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[
        ['standardForm', 'Standard form', standardFormEquation],
        ['slopeIntercept', 'Slope-intercept', slopeInterceptEquation],
        ['pointSlope', 'Point-slope', pointSlopeEquation],
      ].filter(([cardId]) => needs(cardId)).map(([cardId, label, value]) => (
        <p key={cardId} style={muted}>
          {label}: {String(value || '').trim() ? <MathDisplay value={value} inline /> : '—'}
        </p>
      ))}
    </div>
  );

  const collapsedFeatures = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[
        ['slope', 'Slope', featureSlope],
        ['xIntercept', 'x-intercept', featureXIntercept],
        ['yIntercept', 'y-intercept', featureYIntercept],
      ].filter(([cardId]) => needs(cardId)).map(([cardId, label, value]) => (
        <p key={cardId} style={muted}>
          {label}: {String(value || '').trim() ? <MathDisplay value={value} inline /> : '—'}
        </p>
      ))}
      {needs('twoPoints') ? (
        <p style={muted}>
          Two points: {String(featurePoint1 || '').trim() ? <MathDisplay value={featurePoint1} inline /> : '—'}
          {' and '}
          {String(featurePoint2 || '').trim() ? <MathDisplay value={featurePoint2} inline /> : '—'}
        </p>
      ) : null}
    </div>
  );

  const isScenario = givenDescription.kind === 'scenario';

  return (
    <ToolShell
      title="Multiple representations"
      // A board of card columns and three graphs: it may use a wide screen.
      widthProfile="wide"
      subtitle="Start from the GIVEN representation and build the same line every other way: equations, key features, a table and three graphs. Work in any order."
    >
      <div className="mm-lmr-board" onKeyDown={handleBoardKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
        <GivenRepresentation description={givenDescription} graphBounds={graphBounds} />

        <div
          aria-label="Your progress"
          role="group"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px 14px',
            padding: '8px 12px',
            borderRadius: 10,
            background: '#f6f8fb',
            border: '1px solid #e1e7f0',
          }}
        >
          <span style={{ fontSize: 14, color: '#172033' }}>
            <strong>Work in any order.</strong> Nothing is locked.
          </span>
          <span style={{ fontSize: 13, color: '#3c4a60' }}>
            {canCheck ? 'Checked correct: ' : 'Filled in: '}
            <strong>{partsDone} of {partsTotal}</strong>
            <span aria-hidden="true"> · </span>
            {progressGroups.map((group, index) => (
              <span key={group.id}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                {group.label} {group.done}/{group.total}
              </span>
            ))}
          </span>
        </div>

        <p aria-live="polite" className="mm-sr-only">{notice}</p>

        {isScenario ? contextPanel : null}

        {/* Two columns on a laptop — equations over the table, key features
            beside them — so neither column trails off into empty space. On a
            phone they stack in the same order. */}
        <div className="mm-lmr-card-columns" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
          {equationCards.length || tableCard ? (
            // On a wide work view (LinearMultipleRepresentationsBoard.css) this
            // stack dissolves so Equations, Table and Key features stand as
            // three columns side by side instead of two long ones.
            <div className="mm-lmr-card-stack" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              {equationCards.length ? (
                <BoardPanel title="Equations" open={expandedCards.equationForms} onToggle={() => toggle('equationForms')}>
                  {expandedCards.equationForms ? equationCards : collapsedEquations}
                </BoardPanel>
              ) : null}
              {tableCard ? (
                <BoardPanel title="Table" open={expandedCards.table} onToggle={() => toggle('table')}>
                  {expandedCards.table ? tableCard : (
                    <p style={muted}>
                      {filledRows.length} of {Math.max(4, filledRows.length)} rows filled
                      {filledRows.length ? <>: {filledRows.map((row, index) => (
                        // eslint-disable-next-line react/no-array-index-key -- rows are positional
                        <React.Fragment key={index}>{index > 0 ? ', ' : null}<MathDisplay value={`(${row.x}, ${row.y})`} inline /></React.Fragment>
                      ))}</> : '.'}
                    </p>
                  )}
                </BoardPanel>
              ) : null}
            </div>
          ) : null}

          {featureCards.length || twoPointsCard ? (
            <BoardPanel title="Key features" open={expandedCards.features} onToggle={() => toggle('features')}>
              {expandedCards.features ? (
                <>
                  {featureCards}
                  {twoPointsCard}
                </>
              ) : collapsedFeatures}
            </BoardPanel>
          ) : null}
        </div>

        {graphCards.length ? (
          <BoardPanel title={graphCards.length === 3 ? 'Graph the line three ways' : 'Graph the line'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={muted}>
                Each graph is its own workspace. Tap or press on a grid to place a point; drag a point to move it
                (keyboard: arrow keys, then Enter). Points land on {describeSnapStep(snapSteps.graph1)}
                {snapSteps.graph3 !== snapSteps.graph1 && needs('graphPointSlope') ? <> ({needs('graphIntercepts') ? 'Graph 3: ' : ''}{describeSnapStep(snapSteps.graph3)})</> : null}.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 12, alignItems: 'start' }}>
                {graphCards}
              </div>
              {showComparison ? (
                <div
                  data-lmr-comparison="true"
                  style={{ padding: 14, border: '2px solid #34a853', borderRadius: 12, background: '#f4fbf6', display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <strong style={{ fontSize: 16, color: '#0d652d' }}>Three methods, one line</strong>
                  <p style={{ ...muted, color: '#24324a' }}>
                    Your intercepts, your slope-intercept points and your point-slope points all sit on the same line.
                  </p>
                  <div style={{ width: '100%', maxWidth: 440, margin: '0 auto' }}>
                    <CoordinatePlane
                      xMin={graph3Bounds.xMin}
                      xMax={graph3Bounds.xMax}
                      yMin={graph3Bounds.yMin}
                      yMax={graph3Bounds.yMax}
                      {...planeSize(graph3Bounds, 440)}
                      points={GRAPHS.flatMap((graph) => (graphPointsByKey[graph.key] || []).map((point) => ({ x: point[0], y: point[1], fill: graph.color })))}
                      {...lineProps(graph1Points)}
                      enlargeable={false}
                      ariaLabel="All three graphs on one plane"
                    />
                  </div>
                  <p style={{ ...muted, display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {GRAPHS.map((graph) => (
                      <span key={graph.key}><span aria-hidden="true" style={{ color: graph.color, fontSize: 18 }}>●</span> {graph.title.split(' · ')[0]}</span>
                    ))}
                  </p>
                </div>
              ) : null}
            </div>
          </BoardPanel>
        ) : null}

        {!isScenario ? contextPanel : null}

        <div
          data-lmr-submit="true"
          style={{
            padding: 16,
            background: '#f6f8fb',
            border: '1px solid #dbe3ef',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <strong style={{ fontSize: 16, color: '#10223f' }}>Submit your board</strong>
              <p style={muted}>
                {canCheck
                  ? 'Submitting checks every part together, including whether they all describe the same line.'
                  : 'Submit when every part is done.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={questionTerminal}
              style={{ ...primaryButton, minHeight: 48, padding: '10px 22px', fontSize: 16, opacity: questionTerminal ? 0.6 : 1 }}
            >
              Submit board
            </button>
          </div>

          {confirmSubmit && emptyParts.length ? (
            <div role="alert" style={{ padding: '10px 12px', borderRadius: 10, background: '#fff8e1', border: '1px solid #f2d27a', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#5c4400', fontWeight: 600 }}>
                {emptyParts.length === 1 ? 'One part is still empty' : `${emptyParts.length} parts are still empty`}: {emptyParts.join(', ')}.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setConfirmSubmit(false)} style={touchButton}>Keep working</button>
                <button type="button" onClick={doSubmit} style={touchButton}>Submit anyway</button>
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div
              role="status"
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: feedback.isCorrect ? '#e6f4ea' : '#fdecea',
                border: `1px solid ${feedback.isCorrect ? '#9fd3ad' : '#f3b3ab'}`,
                color: feedback.isCorrect ? '#0d652d' : '#7a1a13',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <strong style={{ fontSize: 15 }}>
                {feedback.isCorrect
                  ? 'Every part is correct, and they all describe the same line.'
                  : `Not yet — ${Math.round((Number(feedback.score) || 0) * 100)}% of the board is correct.`}
              </strong>
              {partsToRevisit.length ? (
                <p style={{ margin: 0, fontSize: 14 }}>Take another look at: {partsToRevisit.join(', ')}.</p>
              ) : null}
              {outliers.length ? (
                <p style={{ margin: 0, fontSize: 14 }}>
                  {outliers.length === 1 ? 'This part does' : 'These parts do'} not describe the same line as the rest of your work: {outliers.join(', ')}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {GRAPHS.filter((graph) => graph.key === enlargedGraph && needs(graph.cardId)).map((graph) => {
        const verdict = verdictFor(graph.cardId);
        return (
          <GraphDialog key={graph.key} graph={graph} open onClose={closeDialog} returnFocusRef={enlargeButtonRefs[graph.key]}>
            {/* Beside the plane on a laptop, under it on a phone: the task, the
                points so far and Check stay on screen with the grid, so nothing
                needs scrolling to finish the graph. */}
            <div data-lmr-card={graph.cardId} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 380px', maxWidth: `min(640px, ${enlargedPlaneMaxWidth(graph)}px)`, minWidth: 'min(240px, 100%)', margin: '0 auto' }}>
                {renderPlane(graph, 640, { showPlotHelp: false })}
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: '#f6f8fb', padding: '8px 12px', borderRadius: 10, fontSize: 14, color: '#24324a', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span><strong>Your task:</strong> {graph.task}</span>
                  {graph.key === 'graph3' ? <span>{graph3Guide}</span> : null}
                  <span style={{ fontSize: 12, color: '#5f6b7a' }}>
                    Tap or press to place a point; drag a point to move it. Points land on {describeSnapStep(snapFor(graph.key))}.
                  </span>
                </div>
                <p style={muted}>{graphStatus(graph)}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {graphControls(graph)}
                  {canCheck ? (
                    <button type="button" data-card-check="true" onClick={() => runCheck(graph.cardId)} style={primaryButton} aria-label={`Check ${graph.title}`}>
                      Check
                    </button>
                  ) : null}
                </div>
                {verdict ? (
                  verdict.isCorrect
                    ? <span style={correctBadge}>✓ Correct</span>
                    : <p style={errorText}>{verdict.error}</p>
                ) : null}
                <button type="button" onClick={closeDialog} style={{ ...touchButton, alignSelf: 'flex-start' }}>Done</button>
              </div>
            </div>
          </GraphDialog>
        );
      })}
    </ToolShell>
  );
}
