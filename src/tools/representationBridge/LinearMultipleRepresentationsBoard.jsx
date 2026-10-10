import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import usePersistentToolState, { useToolDraftScope } from '../shared/usePersistentToolState.js';
import ToolShell, { AttemptOutcome } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import { useToolRuntimeContext } from '../shared/ToolRuntimeContext';
import representationBridgeGrader from '../../../functions/shared/serverGrading/tools/representationBridge.mjs';
import CoordinatePlane from '../shared/CoordinatePlane';
import MathInput from '../../MathInput.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import MathText from '../../components/common/MathText.jsx';
import Dialog from '../../ui/Dialog.jsx';
import { isSingleLineAnswerTarget } from '../../platform/interaction/answerEntryUx.js';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import './LinearMultipleRepresentationsBoard.css';
import {
  boardUndoChanges,
  boardUndoState,
  boardUndoTitle,
  changedBoardFields,
  describeBoardUndo,
  graphUndoField,
} from './linearMultipleRepresentationsUndo.js';
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
import {
  PROCESS_FACT_CARDS,
  establishedPoints,
  factDisplay,
  fractionText,
  isProcessModeQuestion,
  lmrCardLabel,
  lmrFactLabel,
  lmrMethodsFor,
  lmrNewlyOpened,
  lmrProcessEnvironment,
  lmrProcessSnapStep,
  lmrRelevantFacts,
  materializeProcessBoard,
  resolveLmrProcess,
} from './lmrProcessMath.js';
import { optionKeyOf, readProcessDraft, recordProcessEntry } from './process/processDraft.js';
import ProcessWorkspace from './process/ProcessWorkspace.jsx';
import { FactsAtHand, KnownPointChips, LockedCardBody, ProcessFactsStrip } from './process/ProcessBoardParts.jsx';

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
 *
 * PROCESS MODE (`interactionMode: "process"`) is the same board with one
 * difference in what counts as work: the key facts — slope, intercepts,
 * points — are not typed into boxes. The student ESTABLISHES each one with a
 * process of their choosing ("What I know" → Find → a method → Check), and
 * every card the facts they hold can build opens; a card still waiting says
 * every way it could open. Nothing is in a fixed order there either. The
 * mathematics of it is shared with the server (lmrProcessMath.js), and the
 * process components live in ./process/. Worksheet Mode — the default — is
 * untouched by any of it.
 */

const touchButton = {
  minHeight: 44,
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid var(--mm-primary-border)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
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
  color: 'var(--mm-primary-text)',
  padding: '8px 10px',
};

const cellInput = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '8px 10px',
  border: '1px solid var(--mm-primary-border)',
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
  border: '1px solid var(--mm-primary-border)',
  borderRadius: 8,
  fontSize: 15,
  background: 'var(--mm-surface)',
};

const muted = { fontSize: 13, color: 'var(--mm-text-muted)', margin: 0, lineHeight: 1.45 };
const errorText = { margin: 0, fontSize: 14, color: 'var(--mm-error-text)', fontWeight: 600, lineHeight: 1.4 };

const correctBadge = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: 'var(--mm-success-bg)',
  color: 'var(--mm-success-text)',
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

// Process Mode: which established points each graph offers to plot.
const GRAPH_REUSE = Object.freeze({
  graph1: (record) => record.fact === 'xIntercept' || record.fact === 'yIntercept',
  graph2: (record) => record.fact === 'yIntercept',
  graph3: null,
});

// Process Mode: the facts each card is built from, kept at hand on it.
const PROCESS_CARD_FACTS = Object.freeze({
  standardForm: ['slope', 'yIntercept', 'xIntercept'],
  slopeIntercept: ['slope', 'yIntercept'],
  pointSlope: ['slope'],
  table: ['slope'],
});

// The answer field each one-box card writes.
const ONE_FIELD_CARDS = Object.freeze({
  standardForm: 'standardFormEquation',
  slopeIntercept: 'slopeInterceptEquation',
  pointSlope: 'pointSlopeEquation',
  slope: 'featureSlope',
  xIntercept: 'featureXIntercept',
  yIntercept: 'featureYIntercept',
});

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

// A fact a process established, as words a screen reader can say: "1/2", "(0, -3)".
const factDisplayText = (record) => {
  if (!record) return '';
  if (Array.isArray(record.point)) return `(${record.point.map(fractionText).join(', ')})`;
  if (record.fact === 'siEquation') return `${record.value?.left ?? ''} = ${record.value?.right ?? ''}`;
  return fractionText(record.value);
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
      style={{ border: '1px solid var(--mm-tint-border)', borderRadius: 14, padding: 14, background: 'var(--mm-surface)', textAlign: 'left', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--mm-text)' }}>{title}</h3>
        {onToggle ? <CollapseToggle open={open} onToggle={onToggle} label={toggleLabel || title} /> : null}
      </div>
      {children}
    </section>
  );
}

// Whether an element is on screen and nothing — the sticky task card, the
// action bar, a dialog — sits over its top or its bottom. Already visible means
// an Undo leaves the page where it is: pressing Undo while looking at a card
// must not jump it.
const uncoveredOnScreen = (element) => {
  const box = element?.getBoundingClientRect?.();
  if (!box || !box.width || !box.height || typeof document === 'undefined') return false;
  const x = box.left + box.width / 2;
  const inset = Math.min(12, box.height / 2);
  return [box.top + inset, box.bottom - inset].every((y) => {
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit) && element.contains(hit);
  });
};

// The card the last Undo changed carries the Undo's id, which restarts its
// outline (LinearMultipleRepresentationsBoard.css) on every Undo, even two in a
// row on the same card.
const undoneProps = (undone) => (undone
  ? { 'data-lmr-undone': undone.id, className: `mm-lmr-undone mm-lmr-undone--${undone.id % 2 ? 'odd' : 'even'}` }
  : {});

function BoardCard({ cardId, title, hint, verdict, canCheck, onCheck, checkLabel, children, extraControls = null, headerActions = null, undone = null }) {
  const errorId = useId();
  return (
    <div
      data-lmr-card={cardId}
      {...undoneProps(undone)}
      style={{
        border: `1px solid ${verdict?.isCorrect ? 'var(--mm-success-border)' : 'var(--mm-tint-border)'}`,
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
        <strong style={{ fontSize: 15, color: 'var(--mm-text-strong)', flex: '1 1 170px', minWidth: 0 }}>{title}</strong>
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
    body = <MathDisplay value={description.latex} style={{ fontSize: 26, color: 'var(--mm-text-strong)' }} ariaLabel={`Given equation ${description.latex}`} />;
  } else if (description.kind === 'points') {
    body = (
      <p style={{ margin: 0, fontSize: 22, color: 'var(--mm-text-strong)', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {description.points.map((point, index) => (
          <React.Fragment key={point.latex}>
            {index > 0 ? <span style={{ fontSize: 16, color: 'var(--mm-text)' }}>and</span> : null}
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
            <th scope="col" style={{ padding: '6px 12px', borderBottom: '2px solid #1a4fb4', color: 'var(--mm-primary-text)', fontStyle: 'italic', fontFamily: 'serif', fontSize: 20 }}>x</th>
            <th scope="col" style={{ padding: '6px 12px', borderBottom: '2px solid #1a4fb4', borderLeft: '2px solid #1a4fb4', color: 'var(--mm-primary-text)', fontStyle: 'italic', fontFamily: 'serif', fontSize: 20 }}>y</th>
          </tr>
        </thead>
        <tbody>
          {description.rows.map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key -- authored rows can repeat a value; order is the identity
            <tr key={index}>
              <td style={{ padding: '6px 12px', textAlign: 'center', borderBottom: '1px solid var(--mm-tint-border)' }}><MathDisplay value={row.xLatex} inline /></td>
              <td style={{ padding: '6px 12px', textAlign: 'center', borderBottom: '1px solid var(--mm-tint-border)', borderLeft: '2px solid #1a4fb4' }}><MathDisplay value={row.yLatex} inline /></td>
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
      <MathText as="p" style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: 'var(--mm-text-strong)', maxWidth: '68ch' }}>
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
        background: 'var(--mm-primary-subtle)',
        border: '2px solid var(--mm-primary-border)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={givenBadge}>GIVEN</span>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16, color: 'var(--mm-text-strong)' }}>{description.label}</h3>
        <span style={{ fontSize: 13, color: 'var(--mm-text)' }}>You start with this. You do not need to rebuild it.</span>
      </div>
      {body}
    </section>
  );
}

function GraphDialog({ graph, open, onClose, children, returnFocusRef }) {
  const titleId = useId();
  const closeRef = useRef(null);
  // Dialog opens on the close button and answers Escape; focus goes back to
  // this graph's own Enlarge button, which a click does not focus in Safari.
  useEffect(() => {
    if (!open) return undefined;
    const focusTarget = returnFocusRef?.current || null;
    return () => {
      focusTarget?.focus?.({ preventScroll: true });
    };
  }, [open, returnFocusRef]);
  if (!open) return null;
  return (
    <Dialog
      onClose={onClose}
      initialFocusRef={closeRef}
      returnFocus={false}
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
          <h3 id={titleId} style={{ margin: 0, fontSize: 18, color: 'var(--mm-text-strong)' }}>{graph.title}</h3>
          <button ref={closeRef} type="button" onClick={onClose} style={touchButton} aria-label={`Close enlarged ${graph.title}`}>
            ✕ Close
          </button>
        </div>
        {children}
      </div>
    </Dialog>
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
  // Process Mode: key facts are established with a process, not typed.
  const processMode = isProcessModeQuestion(questionData);

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

  // Process Mode's work: the process log — each piece of work the student
  // pressed Check (or Save) on, which the shared marking turns into facts here
  // and on the server — and the work still in progress inside each method.
  // Both are the student's mathematics; neither ever holds a verdict.
  const [processLog, setProcessLog] = usePersistentToolState('processLog', null);
  const [rawProcessDraft, setRawProcessDraft] = usePersistentToolState('processDraft', null);

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

  // Presentation only. The notice is what the polite live region says; each
  // one has its own id so the same sentence twice (two Undos on one card) is
  // still announced twice.
  const [notice, setNotice] = useState({ id: 0, text: '' });
  const announce = useCallback((text) => setNotice((previous) => ({ id: previous.id + 1, text })), []);
  const [enlargedGraph, setEnlargedGraph] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // The card the last Undo changed: opened, brought into view, outlined.
  const [undoReveal, setUndoReveal] = useState(null);

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
    // Process Mode only: a Worksheet board's work keeps exactly its old shape.
    ...(processMode ? { processLog } : {}),
  }), [
    standardFormEquation, slopeInterceptEquation, pointSlopeEquation,
    featureSlope, featureXIntercept, featureYIntercept, featurePoint1, featurePoint2,
    tableRows, graph1Points, graph2Points, graph3Points,
    contextIndependent, contextDependent, contextSlopeMeaning, contextYInterceptMeaning, contextXInterceptMeaning, contextDomain,
    processMode, processLog,
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

  // ----------------------------------------------------------- process mode
  // What the student's process log establishes on THIS question — marked by
  // the same function the server grades with — and which cards that opens.
  const processEnv = useMemo(
    () => (processMode ? lmrProcessEnvironment(questionData, canonicalFacts) : null),
    [processMode, questionData, canonicalFacts],
  );
  const processState = useMemo(
    () => (processEnv ? resolveLmrProcess(questionData, { processLog }, canonicalFacts, processEnv) : null),
    [processEnv, questionData, processLog, canonicalFacts],
  );
  const processBinding = processEnv?.binding || '';
  const processDraft = useMemo(() => readProcessDraft(rawProcessDraft, processBinding), [rawProcessDraft, processBinding]);
  const setProcessDraft = useCallback((updater) => setRawProcessDraft((raw) => {
    const current = readProcessDraft(raw, processBinding);
    const next = typeof updater === 'function' ? updater(current) : updater;
    return readProcessDraft({ ...next, bind: processBinding }, processBinding);
  }), [setRawProcessDraft, processBinding]);
  // Work recorded for another version of this Question Family slot
  // establishes nothing here — resolveLmrProcess ignores a log bound to
  // another version, and readProcessDraft opens an empty workspace for one —
  // but it is never erased just because it was seen. Until the first Submit
  // pins the version on the server, another Chromebook can be dealt a
  // different version under this same draft key, and a question that cannot
  // be read for a moment binds as 'lmr1-invalid'. Erasing on sight made either
  // permanent: the next keystroke synced the erased log to every device, and
  // the device still showing the original version came back to locked cards.
  // The first work recorded on this version replaces it (appendProcessEntry
  // starts a log bound to this version; setProcessDraft rebinds the draft).
  const processRelevant = useMemo(() => (processMode ? lmrRelevantFacts(questionData) : []), [processMode, questionData]);
  const processSnapStep = useMemo(() => (processMode ? lmrProcessSnapStep(questionData, canonicalFacts) : 1), [processMode, questionData, canonicalFacts]);
  // The embedded algebra workspaces keep their drafts beside this question's,
  // per question version, so another version never opens on this one's steps.
  const draftScope = useToolDraftScope();
  const processDraftKeyBase = draftScope?.draftKey && processBinding ? `${draftScope.draftKey}:lmr-process:${processBinding}` : null;
  // A required card the student's facts have not opened yet.
  const processLocked = (cardId) => Boolean(processState) && required.includes(cardId) && !processState.unlocks?.[cardId]?.unlocked;

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
    announce(`${label}: ${verdict.isCorrect ? 'correct.' : verdict.error}`);
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
    announce(wrong === 0 ? 'Meanings: all correct.' : `Meanings: ${wrong} to take another look at.`);
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
  // In Process Mode a fact card is done when the fact is established — with
  // guided feedback only right work is ever recorded, so that is "checked
  // correct" there; where outcomes are withheld it is "filled in".
  const processFactDone = (cardId) => (cardId === 'twoPoints'
    ? establishedPoints(processState).length >= 2
    : Boolean(processState?.facts?.[cardId]));
  const partDone = (cardId) => (processState && PROCESS_FACT_CARDS[cardId] ? processFactDone(cardId) : cardDone(cardId));
  const contextDone = (field) => (canCheck
    ? Boolean(contextVerdict?.results?.[field])
    : String(currentResponse[field] ?? '').trim() !== '');
  const progressGroups = [
    ...partsByCategory.map((category) => ({ ...category, done: category.cards.filter(partDone).length, total: category.cards.length })),
    ...(contextFields.length ? [{ id: 'context', label: 'Meanings', done: contextFields.filter(({ field }) => contextDone(field)).length, total: contextFields.length }] : []),
  ];
  const partsTotal = progressGroups.reduce((sum, group) => sum + group.total, 0);
  const partsDone = progressGroups.reduce((sum, group) => sum + group.done, 0);
  // The board a Process Mode response amounts to: fact cards from what the
  // process established, locked cards empty — what the grader scores.
  const processBoard = useMemo(
    () => (processState ? materializeProcessBoard(questionData, currentResponse, processState).board : null),
    [processState, questionData, currentResponse],
  );
  // The shared grader's own completeness rule: a required card with no work,
  // or a graded meaning left blank. Empty here is exactly isComplete there.
  const emptyParts = unfinishedLinearMultipleRepresentationsParts(questionData, processBoard || currentResponse).map((partId) => PART_LABELS[partId] || partId);

  const toggle = (key) => setExpandedCards((prev) => {
    const current = { ...DEFAULT_EXPANDED, ...prev };
    return { ...current, [key]: !current[key] };
  });

  // ----------------------------------------------------------------- graphs
  // The latest points, updated the moment a change is made. Two taps that land
  // before React re-renders (a slow Chromebook) must build on each other, not
  // both on the points from the last render.
  const latestPointsRef = useRef(graphPointsByKey);
  latestPointsRef.current = graphPointsByKey;
  // Every change — a point, a drag, Start over — is a change to the board's
  // mathematics, so the board's one Undo history records it (below).
  const changeGraph = (key, next) => {
    clearFeedback();
    latestPointsRef.current = { ...latestPointsRef.current, [key]: next };
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
  const clearGraph = (key) => changeGraph(key, []);

  // ------------------------------------------------------------------ undo
  // ONE UNDO FOR THE WHOLE BOARD (PQ-009). The platform Undo takes back the
  // student's last edit anywhere on the board — a typed equation, a table cell,
  // a meaning, a point — one step at a time, through one history: a run of
  // typing in one field is one step (mathUndoStack.js), and each graph's own
  // Undo is the same history filtered to that graph, so the two can never
  // disagree or replay each other.
  //
  // The history holds the board's mathematics and nothing else
  // (linearMultipleRepresentationsUndo.js): `checkedCards` and every verdict
  // stay out, so an Undo can neither un-check a card nor bring back a verdict
  // for work that was never checked — a card shows its verdict whenever it
  // holds exactly the work that was checked, as it does after a reload. Undo is
  // not an answer either: it leaves the board's submission result where it is.
  //
  // It survives a reload (`persist`, device-local and size-capped, never in the
  // synced work record), and a stack recorded for different work is dropped
  // rather than replayed, so an Undo after a reload takes back one step of the
  // restored work and never empties it.
  const fieldSetters = {
    standardFormEquation: setStandardFormEquation,
    slopeInterceptEquation: setSlopeInterceptEquation,
    pointSlopeEquation: setPointSlopeEquation,
    featureSlope: setFeatureSlope,
    featureXIntercept: setFeatureXIntercept,
    featureYIntercept: setFeatureYIntercept,
    featurePoint1: setFeaturePoint1,
    featurePoint2: setFeaturePoint2,
    tableRows: setTableRows,
    ...Object.fromEntries(GRAPHS.map((graph) => [graphUndoField(graph.key), graphSettersByKey[graph.key]])),
    ...contextSetters,
  };
  const undoState = useMemo(() => boardUndoState(currentResponse), [currentResponse]);
  // Which graph's own Undo button is restoring right now (null: the platform Undo).
  const graphUndoSourceRef = useRef(null);
  const restoreBoard = (restored) => {
    const current = responseRef.current;
    // Only what differs is written back: every write is a draft write, and a
    // MathLive field that is rewritten starts its own Ctrl+Z history there.
    changedBoardFields(current, restored).forEach((field) => {
      const graph = GRAPHS.find((entry) => graphUndoField(entry.key) === field);
      if (graph) latestPointsRef.current = { ...latestPointsRef.current, [graph.key]: restored[field] };
      fieldSetters[field](restored[field]);
    });
    // Show what changed: open the card, bring it into view, outline it, and say
    // where it was in the polite live region.
    const changes = boardUndoChanges(current, restored);
    if (!changes.length) return;
    const closed = [...new Set(changes.map((change) => change.expandKey))].filter((key) => !expandedCards[key]);
    if (closed.length) {
      setExpandedCards((prev) => ({ ...DEFAULT_EXPANDED, ...prev, ...Object.fromEntries(closed.map((key) => [key, true])) }));
    }
    announce(describeBoardUndo(changes));
    // Read now: an updater runs at the next render, after the ref is cleared.
    const fromGraph = graphUndoSourceRef.current;
    setUndoReveal((previous) => ({ id: (previous?.id || 0) + 1, cardId: changes[0].cardId, field: changes[0].field, fromGraph }));
  };
  const undoHistory = useMathUndoHistory({
    label: (nextRestore, state) => boardUndoTitle(boardUndoChanges(state, nextRestore)),
    state: undoState,
    onRestore: restoreBoard,
    resetKey: questionUndoResetKey(questionData),
    ownerId: 'lmr-board',
    persist: true,
  });
  // A graph's own Undo: the latest change on THAT graph, from the same history.
  const undoGraph = (key) => {
    graphUndoSourceRef.current = key;
    try {
      return undoHistory.undoChangeTo([graphUndoField(key)]);
    } finally {
      graphUndoSourceRef.current = null;
    }
  };
  const canUndo = (key) => undoHistory.canUndoChangeTo([graphUndoField(key)]);

  // Bring what the Undo changed into view — the field, the table or the plane,
  // not the whole card, which can be taller than a laptop screen — in the
  // enlarged graph when that is where the student is working. Keyboard focus
  // stays on the Undo button, so pressing it again keeps working; the live
  // region says where the change was.
  const boardRef = useRef(null);
  useEffect(() => {
    if (!undoReveal) return;
    const shell = boardRef.current?.closest?.('.mathmaster-tool-shell') || boardRef.current;
    const card = shell?.querySelector(`[data-lmr-dialog] [data-lmr-card="${undoReveal.cardId}"]`)
      || boardRef.current?.querySelector(`[data-lmr-card="${undoReveal.cardId}"]`);
    if (!card) return;
    const target = card.querySelector(`[data-lmr-field="${undoReveal.field}"]`) || card;
    if (!uncoveredOnScreen(target)) target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    // A graph's Undo that took back that graph's last step disables itself, and
    // a disabled button drops keyboard focus to the page — out of the enlarged
    // graph's dialog altogether. Focus goes to the graph's plane instead, where
    // the next point is placed.
    const active = document.activeElement;
    if (undoReveal.fromGraph && (!active || active === document.body || active.matches?.(':disabled'))) {
      target.querySelector?.('svg[role="application"]')?.focus?.({ preventScroll: true });
    }
  }, [undoReveal]);

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
        data-lmr-field={graphUndoField(graph.key)}
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

  // ------------------------------------------------- process mode: find a fact
  // "Find …" opens the process workspace for one fact, under the GIVEN and the
  // facts strip; Back to board (or establishing the fact) returns the student
  // to where they pressed it. Which fact is open is part of the draft, so a
  // refresh reopens the same workspace.
  const [processNotice, setProcessNotice] = useState(null);
  const [processScroll, setProcessScroll] = useState(0);
  const processReturnRef = useRef(null);
  const openProcess = (target, method = null, origin = null) => {
    processReturnRef.current = origin;
    setProcessNotice(null);
    setProcessDraft((current) => {
      const next = { ...current, open: target };
      const preferred = method
        ? lmrMethodsFor(questionData, processState, target).flatMap((group) => group.sources).find((option) => option.strategy === method)
        : null;
      if (preferred) next.method = { ...current.method, [target]: optionKeyOf(preferred) };
      return next;
    });
    setProcessScroll((count) => count + 1);
  };
  useEffect(() => {
    if (!processScroll) return;
    const workspace = boardRef.current?.querySelector('[data-lmr-card="process"]');
    if (!workspace) return;
    if (!uncoveredOnScreen(workspace)) workspace.scrollIntoView?.({ block: 'start', inline: 'nearest' });
    workspace.focus?.({ preventScroll: true });
  }, [processScroll]);
  const returnFromProcess = () => {
    const origin = processReturnRef.current;
    processReturnRef.current = null;
    window.requestAnimationFrame?.(() => {
      const target = origin?.isConnected ? origin : boardRef.current?.querySelector('[data-process-facts]');
      if (!target) return;
      if (!uncoveredOnScreen(target)) target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      target.focus?.({ preventScroll: true });
    });
  };
  const closeProcess = () => {
    setProcessDraft((current) => ({ ...current, open: null }));
    returnFromProcess();
  };
  // Work the student pressed Check (or Save) on joins the log; the fact it
  // establishes, and every card that opens with it, is said once.
  const recordProcess = (entry, { target, keepOpen = false }) => {
    const before = processState;
    const nextLog = recordProcessEntry(questionData, processLog, entry, before);
    clearFeedback();
    setProcessLog(nextLog);
    const after = resolveLmrProcess(questionData, { processLog: nextLog }, canonicalFacts, processEnv);
    const established = target === 'point'
      ? establishedPoints(after).length > establishedPoints(before).length
      : Boolean(after.facts?.[target]);
    // Every fact this work established or changed — a reading can establish
    // two — and every representation card it opened.
    const known = new Set(establishedPoints(before).map((record) => record.pointKey));
    const learned = [
      ...['slope', 'yIntercept', 'xIntercept', 'siEquation']
        .filter((fact) => after.facts?.[fact] && factDisplayText(after.facts[fact]) !== factDisplayText(before?.facts?.[fact]))
        .map((fact) => `${fact === 'siEquation' ? 'Your equation' : lmrFactLabel(questionData, fact)}: ${
          // A situation's initial value is an amount, not a point.
          fact === 'yIntercept' && givenDescription.kind === 'scenario' ? fractionText(after.facts[fact].value) : factDisplayText(after.facts[fact])
        }`),
      ...establishedPoints(after).filter((record) => record.fact === 'point' && !known.has(record.pointKey))
        .map((record) => `Point: ${factDisplayText(record)}`),
    ];
    const factText = learned.length ? (canCheck ? `✓ ${learned.join(' · ')}.` : `Saved — ${learned.join(' · ')}.`) : '';
    const opened = lmrNewlyOpened(before, after, required.filter((cardId) => !PROCESS_FACT_CARDS[cardId])).map(lmrCardLabel);
    const openedText = opened.length ? ` Now open: ${opened.join(', ')}.` : '';
    const noticeText = `${factText}${openedText}`.trim();
    if (noticeText) {
      announce(noticeText);
      setProcessNotice({ text: noticeText, tone: canCheck && factText ? 'success' : 'neutral' });
    }
    // Solved for y: the method that reads the slope and y-intercept from the
    // student's own equation is the next step on that pathway.
    const bridged = !established && after.facts?.siEquation && !before?.facts?.siEquation
      ? lmrMethodsFor(questionData, after, target).flatMap((group) => group.sources)
        .find((option) => option.source === 'siEquation' && option.strategy === 'readSlopeIntercept') || null
      : null;
    if (established && target !== 'point' && !keepOpen) {
      setProcessDraft((current) => ({ ...current, open: null }));
      returnFromProcess();
    }
    return { established, bridged: bridged ? optionKeyOf(bridged) : null };
  };

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
    // In Process Mode the facts are the ones the process established.
    const shown = processMode ? materializeProcessBoard(questionData, feedback.response).board : feedback.response;
    return crossRepresentationConsistencyFor(questionData, shown, canonicalFacts).consistency.outliers || [];
  }, [feedback, questionData, canonicalFacts, processMode]);

  const allGraphsRequired = GRAPHS.every((graph) => needs(graph.cardId));
  const allGraphsVerified = allGraphsRequired && GRAPHS.every((graph) => verdictFor(graph.cardId)?.isCorrect);
  const showComparison = canCheck && allGraphsRequired && (allGraphsVerified || feedback?.isCorrect === true);

  // Enter checks the card the student is typing in — never the whole board.
  const handleBoardKeyDown = (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!isSingleLineAnswerTarget(event.target)) return;
    // An embedded Step Algebra workspace owns Enter inside itself.
    if (event.target.closest?.('[data-process-algebra]')) return;
    event.preventDefault();
    const card = event.target.closest?.('[data-lmr-card]');
    card?.querySelector?.('button[data-card-check="true"]:not([disabled])')?.click();
  };

  // ------------------------------------------------------------ card bodies
  // Each answer control sits in an element named for its field
  // (`data-lmr-field`): that is what an Undo there brings into view.
  const undoneFor = (cardId) => (undoReveal?.cardId === cardId ? undoReveal : null);

  // Process Mode: a card the student's facts have not opened says what it is
  // waiting for, with a "Find …" for each missing fact; an open card keeps the
  // facts it is built from at hand.
  const lockedCard = (cardId, title) => (
    <BoardCard key={cardId} cardId={cardId} title={title} hint={null} verdict={null} canCheck={false} onCheck={null} checkLabel="" undone={undoneFor(cardId)}>
      <LockedCardBody question={questionData} process={processState} cardId={cardId} onFind={openProcess} disabled={questionTerminal} />
    </BoardCard>
  );
  const factsAtHand = (cardId) => (processState ? (
    <FactsAtHand question={questionData} process={processState} facts={PROCESS_CARD_FACTS[cardId] || []} showPoints={cardId === 'pointSlope' ? 'all' : cardId === 'standardForm'} verified={canCheck} />
  ) : null);
  // Solved for y in the process workspace: that equation IS slope-intercept
  // form, so the student uses it rather than copying their own work out.
  const ownEquation = processState?.facts?.siEquation || null;
  const ownEquationButton = ownEquation ? (
    <button
      type="button"
      onClick={() => {
        clearFeedback();
        setSlopeInterceptEquation(factDisplay(ownEquation));
      }}
      style={touchButton}
    >
      Use your equation
    </button>
  ) : null;

  const equationCard = (cardId, title, value, setValue, placeholder, hint) => {
    if (processLocked(cardId)) return lockedCard(cardId, title);
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
        undone={undoneFor(cardId)}
        extraControls={cardId === 'slopeIntercept' ? ownEquationButton : null}
      >
        {factsAtHand(cardId)}
        <div data-lmr-field={ONE_FIELD_CARDS[cardId]} style={{ minWidth: 0 }}>
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
        </div>
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
        undone={undoneFor(cardId)}
      >
        <div data-lmr-field={ONE_FIELD_CARDS[cardId]} style={{ minWidth: 0 }}>
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
        </div>
      </BoardCard>
    );
  };

  const equationCards = [
    // A horizontal line (Process Mode only) has no x-term to make positive.
    needs('standardForm') && equationCard('standardForm', 'Standard form', standardFormEquation, setStandardFormEquation, 'Ax + By = C', canonicalFacts.slopeNumber === 0 ? 'Whole-number coefficients, no common factor.' : 'Whole-number coefficients, no common factor, positive x-coefficient.'),
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
      undone={undoneFor('twoPoints')}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 8 }}>
        {[[featurePoint1, setFeaturePoint1, 'First point', 'featurePoint1'], [featurePoint2, setFeaturePoint2, 'Second point', 'featurePoint2']].map(([value, setValue, label, field]) => (
          <div key={label} data-lmr-field={field} style={{ minWidth: 0 }}>
            <MathInput
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
          </div>
        ))}
      </div>
    </BoardCard>
  ) : null;

  const filledRows = (Array.isArray(tableRows) ? tableRows : []).filter((row) => String(row?.x ?? '').trim() && String(row?.y ?? '').trim());
  const tableVerdict = verdictFor('table');
  // Process Mode: a point the student established goes into the table in one
  // tap — the first empty row, or a new one — written exactly.
  const addKnownRow = (point) => {
    clearFeedback();
    const row = { x: fractionText(point[0]), y: fractionText(point[1]) };
    setTableRows((prev) => {
      const rows = Array.isArray(prev) ? prev : [];
      const empty = rows.findIndex((entry) => !String(entry?.x ?? '').trim() && !String(entry?.y ?? '').trim());
      return empty >= 0 ? rows.map((entry, i) => (i === empty ? row : entry)) : [...rows, row];
    });
  };
  const tableHolds = (point) => (Array.isArray(tableRows) ? tableRows : [])
    .some((row) => String(row?.x ?? '').trim() === fractionText(point[0]) && String(row?.y ?? '').trim() === fractionText(point[1]));
  const tableCard = !needs('table') ? null : processLocked('table') ? lockedCard('table', 'Table of values') : (
    <BoardCard
      cardId="table"
      title="Table of values"
      hint="At least 4 rows, each a point on the line. Fractions like 1/2 are fine."
      verdict={tableVerdict}
      canCheck={canCheck}
      onCheck={() => runCheck('table')}
      checkLabel="Check table of values"
      undone={undoneFor('table')}
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
      {factsAtHand('table')}
      <table data-lmr-field="tableRows" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th scope="col" style={{ padding: '4px 6px', fontStyle: 'italic', fontFamily: 'serif', fontSize: 19, color: 'var(--mm-text)' }}>x</th>
            <th scope="col" style={{ padding: '4px 6px', fontStyle: 'italic', fontFamily: 'serif', fontSize: 19, color: 'var(--mm-text)' }}>y</th>
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
                    style={{ ...touchButton, minWidth: 44, padding: '4px 8px', color: 'var(--mm-error-text)' }}
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
      {processState ? (
        <KnownPointChips process={processState} verb="Add" onUse={addKnownRow} isUsed={tableHolds} disabled={questionTerminal} />
      ) : null}
    </BoardCard>
  );

  // Process Mode: a point the student established is plotted in one tap.
  // Graph 1 is built from the intercepts, Graph 2 starts at the y-intercept,
  // Graph 3 at any point they know; counting the slope to the next point is
  // still theirs.
  const graphHolds = (key, point) => (graphPointsByKey[key] || [])
    .some((plotted) => Math.abs(plotted[0] - point[0].n / point[0].d) < 1e-9 && Math.abs(plotted[1] - point[1].n / point[1].d) < 1e-9);
  const graphReuse = (graph) => (processState ? (
    <KnownPointChips
      process={processState}
      verb="Plot"
      filter={GRAPH_REUSE[graph.key]}
      disabled={questionTerminal}
      onUse={(point) => plotPoint(graph.key, point.map((value) => value.n / value.d))}
      isUsed={(point) => graphHolds(graph.key, point)}
    />
  ) : null);

  const graphCards = GRAPHS.filter((graph) => needs(graph.cardId)).map((graph) => {
    if (processLocked(graph.cardId)) return lockedCard(graph.cardId, graph.title);
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
        undone={undoneFor(graph.cardId)}
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
        {graph.key === 'graph3' ? <p style={{ ...muted, color: 'var(--mm-text)' }}>{graph3Guide}</p> : null}
        {open ? (
          <>
            <div style={{ width: '100%', maxWidth: 440, margin: '0 auto' }}>
              {renderPlane(graph, 440, { panZoom: false, showPlotHelp: false })}
            </div>
            <p style={muted}>{graphStatus(graph)}</p>
            {graphReuse(graph)}
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
      <label key={field} data-lmr-field={field} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14, color: 'var(--mm-text-strong)' }}>{label}</strong>
          {contextVerdict ? (
            result
              ? <span style={correctBadge}>✓ Correct</span>
              : <span style={{ ...correctBadge, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' }}>Take another look</span>
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
      <div data-lmr-card="context" {...undoneProps(undoneFor('context'))} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {expandedCards.context ? (
          <>
            {/* Process Mode: the facts the meanings are about, at hand. */}
            {processState ? <FactsAtHand question={questionData} process={processState} facts={['slope', 'yIntercept', 'xIntercept']} verified={canCheck} /> : null}
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
      subtitle={processMode
        ? 'Start from the GIVEN. Establish the key facts about the line with methods you choose — each fact you prove opens more of the board. Work in any order.'
        : 'Start from the GIVEN representation and build the same line every other way: equations, key features, a table and three graphs. Work in any order.'}
    >
      <div ref={boardRef} className="mm-lmr-board" onKeyDown={handleBoardKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
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
            background: 'var(--mm-surface-sunken)',
            border: '1px solid var(--mm-tint-border)',
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--mm-text-strong)' }}>
            <strong>Work in any order.</strong> {processMode ? 'Each fact you establish opens more of the board.' : 'Nothing is locked.'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--mm-text)' }}>
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

        {/* One polite region for the board: a Check's verdict, or where an
            Undo changed the board. A new span per notice, so a repeated
            sentence is announced again. */}
        <p aria-live="polite" className="mm-sr-only" data-lmr-announcer="true"><span key={notice.id}>{notice.text}</span></p>

        {processState ? (
          <ProcessFactsStrip
            question={questionData}
            process={processState}
            relevant={processRelevant}
            canCheck={canCheck}
            disabled={questionTerminal}
            onFind={openProcess}
            notice={processNotice}
          />
        ) : null}
        {processState && processDraft.open ? (
          <ProcessWorkspace
            key={processDraft.open}
            question={questionData}
            process={processState}
            target={processDraft.open}
            draft={processDraft}
            setDraft={setProcessDraft}
            canCheck={canCheck}
            disabled={questionTerminal}
            description={givenDescription}
            snapStep={processSnapStep}
            draftKeyBase={processDraftKeyBase}
            onRecord={recordProcess}
            onClose={closeProcess}
          />
        ) : null}

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

          {/* In Process Mode the key features are the facts in "What I know". */}
          {!processMode && (featureCards.length || twoPointsCard) ? (
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
                  style={{ padding: 14, border: '2px solid #34a853', borderRadius: 12, background: 'var(--mm-success-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <strong style={{ fontSize: 16, color: 'var(--mm-success-text)' }}>Three methods, one line</strong>
                  <p style={{ ...muted, color: 'var(--mm-text)' }}>
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
            background: 'var(--mm-surface-sunken)',
            border: '1px solid var(--mm-tint-border)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <strong style={{ fontSize: 16, color: 'var(--mm-text-strong)' }}>Submit your board</strong>
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
            <div role="alert" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--mm-warning-bg)', border: '1px solid var(--mm-warning-border-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--mm-warning-text)', fontWeight: 600 }}>
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
                background: feedback.isCorrect ? 'var(--mm-success-bg)' : 'var(--mm-error-bg)',
                border: `1px solid ${feedback.isCorrect ? 'var(--mm-success-border)' : 'var(--mm-error-border-soft)'}`,
                color: feedback.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-error-text)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <strong style={{ fontSize: 15 }}>
                {feedback.isCorrect
                  ? 'Every part is correct, and they all describe the same line.'
                  : `Not yet — ${Math.round((Number(feedback.score) || 0) * 100)}% of the board is correct.`}
                {/* What the attempt cost, beside the verdict rather than below
                    the whole board (PQ-022); inside this live region, so it
                    is announced once. The parts to revisit are listed below
                    already ("Take another look at"), so not twice. */}
                <AttemptOutcome inline showDetail={false} />
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

      {GRAPHS.filter((graph) => graph.key === enlargedGraph && needs(graph.cardId) && !processLocked(graph.cardId)).map((graph) => {
        const verdict = verdictFor(graph.cardId);
        return (
          <GraphDialog key={graph.key} graph={graph} open onClose={closeDialog} returnFocusRef={enlargeButtonRefs[graph.key]}>
            {/* Beside the plane on a laptop, under it on a phone: the task, the
                points so far and Check stay on screen with the grid, so nothing
                needs scrolling to finish the graph. */}
            <div data-lmr-card={graph.cardId} {...undoneProps(undoneFor(graph.cardId))} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 380px', maxWidth: `min(640px, ${enlargedPlaneMaxWidth(graph)}px)`, minWidth: 'min(240px, 100%)', margin: '0 auto' }}>
                {renderPlane(graph, 640, { showPlotHelp: false })}
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: 'var(--mm-surface-sunken)', padding: '8px 12px', borderRadius: 10, fontSize: 14, color: 'var(--mm-text)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span><strong>Your task:</strong> {graph.task}</span>
                  {graph.key === 'graph3' ? <span>{graph3Guide}</span> : null}
                  <span style={{ fontSize: 12, color: 'var(--mm-text-muted)' }}>
                    Tap or press to place a point; drag a point to move it. Points land on {describeSnapStep(snapFor(graph.key))}.
                  </span>
                </div>
                <p style={muted}>{graphStatus(graph)}</p>
                {graphReuse(graph)}
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
