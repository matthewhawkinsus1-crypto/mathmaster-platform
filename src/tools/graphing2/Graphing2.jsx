import React, { useCallback, useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { figureDismissalKey, shouldOpenFigureEnlarged } from '../../platform/student/figurePresentation.js';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import useViewportWidth from '../../platform/mobile/useViewportWidth.js';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel, ToolSplit } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import useToolSubmission from '../shared/useToolSubmission';
import { useHintsAllowed, useHostSubmitLabel, useMethodWithheld, useOwnHintLadder, useSubmitLabel } from '../shared/ToolRuntimeContext';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import graphing2Grader, { readConstructionFeedback } from '../../../functions/shared/serverGrading/tools/graphing2.mjs';
import { lineFromPoints, referenceLineOf, targetLineFromQuestion, withDefaultTargetLine } from './graphingMath';
import { lineReadoutLatex, lineReadoutText, standardFormReadoutText } from './lineReadout.js';
import { placePoint } from './placePoint.js';
// What the form-aware policy will check, said before any point is checked;
// on an assessment, only what is checked (anchorInstruction.js).
import { anchorInstruction } from './anchorInstruction.js';
import { orientationMissMessage } from './orientationMiss.js';
import MathDisplay from '../../MathDisplay';
import { useFocusSafeDisabled } from '../../components/common/useFocusSafeDisabled.js';
import { constructionReadyToCheck, requiredConstructionPointCount, resolveConstructionPolicy } from './constructionPolicy';
import { toFraction, formatFraction } from '../shared/linearEquations.js';

// Hints must never show a repeating decimal for a slope that was authored as
// an exact rational (e.g. -4/3 stored/derived as -1.3333333333333333) — the
// student needs the exact value MathDisplay can stack, not a rounded decimal
// that also happens to be mathematically confusing mid-lesson.
const formatSlopeForHint = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (Number.isInteger(number)) return String(number);
  const fraction = toFraction(number);
  return fraction ? formatFraction(fraction) : String(number);
};

// Turn a simple exact rational slope into a lattice-point move the graph can
// actually plot. A slope of -3/4 should teach "run 4, rise -3", not "run 1,
// rise -3/4" when the coordinate plane cannot land on quarter-grid y-values.
const slopeStepForHint = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const fraction = toFraction(number);
  if (!fraction || !Number.isFinite(fraction.n) || !Number.isFinite(fraction.d)) return null;
  if (fraction.d < 1 || fraction.d > 12) return null;
  return { rise: fraction.n, run: fraction.d };
};

const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButton = { ...primaryButton, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', border: '1px solid var(--mm-primary-border)' };

const MODE_LABELS = {
  slopeIntercept: 'Slope-intercept form',
  factoredLinear: 'Factored linear form',
  throughPoints: 'Line through two points',
  pointSlope: 'Point-slope form',
  standardForm: 'Standard form',
  verticalHorizontal: 'Vertical or horizontal line',
};
// A point-slope question with a reference line (graphingMath referenceLineOf).
const REFERENCE_LABELS = { perpendicular: 'Perpendicular line', parallel: 'Parallel line' };

const formatPoint = (point) => `(${point[0]}, ${point[1]})`;

// What to do next, in one sentence. Used by the progress pill inside the tool
// and registered as the Work View current instruction, so the enlarged view
// says the same thing the embedded one does instead of inventing its own.
// `finalLabel` is the host's name for the final action where it has one (a
// secure item's "Record answer"): there, pressing it spends the only attempt,
// so the pill must not invite a "check".
const nextInstruction = (plottedCount, requiredCount = 2, finalLabel = null) => (
  plottedCount === 0
    ? 'Plot your first point: click or tap the grid, or focus it and use the arrow keys and Enter.'
    : plottedCount < requiredCount
      ? `Now plot point ${plottedCount + 1} of ${requiredCount} on the same line.`
      : finalLabel
        ? `All ${requiredCount} points plotted — move any point, or press ${finalLabel} when you are done.`
        : `All ${requiredCount} points plotted — check your construction.`
);

const targetPrompt = (questionData, target) => {
  const mode = questionData.mode || 'slopeIntercept';
  if (mode === 'throughPoints') return `Graph the line that passes through ${(questionData.givenPoints || []).map(formatPoint).join(' and ')}.`;
  // A reference-line question names the given line, never the slope it
  // assesses (TL20): finding that slope is the question.
  const reference = mode === 'pointSlope' ? referenceLineOf(questionData) : null;
  if (reference) return `Graph the line through ${formatPoint(questionData.point)} that is ${reference.relation} to ${lineReadoutText(reference)}.`;
  if (mode === 'pointSlope') return `Graph the line through ${formatPoint(questionData.point || [0, 0])} with slope ${questionData.slope}.`;
  if (mode === 'factoredLinear') return `Graph y = ${questionData.factored?.a}(x − ${questionData.factored?.c}).`;
  if (mode === 'standardForm') return `Graph ${standardFormReadoutText(questionData.standard)}.`;
  if (mode === 'verticalHorizontal') return `Graph ${questionData.orientation === 'vertical' ? 'x = ' : 'y = '}${questionData.value}.`;
  return `Graph ${lineReadoutText(target) || 'the line'}.`;
};

// Whole-number snapping unless the line genuinely lives between the gridlines.
// A y = 1.5x - 2 line has no integer lattice point at x = 1, so forcing whole
// numbers there would make the question unanswerable; every other case snaps to
// integers so a student can't miss by a hair they cannot see.
const resolveSnapStep = (questionData, target) => {
  const explicit = Number(questionData.snapStep);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (!target) return 1;
  if (target.kind === 'vertical') return Number.isInteger(target.x) ? 1 : 0.5;
  const m = Number(target.m);
  const b = Number(target.b);
  if (!Number.isFinite(m) || !Number.isFinite(b)) return 1;
  // The line is integer-friendly when it passes through lattice points at every
  // integer x, which is exactly when both the slope and intercept are integers.
  return Number.isInteger(m) && Number.isInteger(b) ? 1 : 0.5;
};

/*
 * THE RUNGS NAME THE MOVE, NEVER THE POINTS TO PLOT (student pass 3, HELP-10).
 * The last rung of every mode used to state the answer — "Plot (0, 3) and
 * (2, 3)", "…landing on (2, 7)" — and three taps on "Stuck? Show a hint"
 * reached it with no attempt. A rung may restate what the question gives (the
 * point of a point-slope question, the slope as written) and say how to use
 * it; the points the student must find stay theirs. The ladder itself is now
 * the platform's (one more hint per attempt, and a leak guard).
 */
export const hintsForMode = (mode, target, questionData) => {
  const common = 'Two points are enough to determine a line — pick the two that are easiest to read exactly.';
  if (mode === 'verticalHorizontal') {
    const vertical = questionData.orientation === 'vertical';
    return [
      vertical ? 'A vertical line has the same x-value at every single point.' : 'A horizontal line has the same y-value at every single point.',
      vertical ? `Every point on this line looks like (${questionData.value}, ?) — the y-value can be anything.` : `Every point on this line looks like (?, ${questionData.value}) — the x-value can be anything.`,
      vertical ? 'Choose any two y-values, and plot the two points that use them with that same x-value.' : 'Choose any two x-values, and plot the two points that use them with that same y-value.',
    ];
  }
  if (mode === 'throughPoints') {
    return [
      'The two purple points are already on the line. You need to plot those same two locations yourself.',
      'Read each purple point carefully: go across for x first, then up or down for y.',
      'Plot your point exactly on top of each purple point, then check that the two readings match.',
    ];
  }
  // A reference-line question assesses the slope itself, so no rung states it
  // (or quotes a number it could be read from): the first names the rule.
  // The words are the platform family's own (linesAndSlope.js), so inside a
  // question the two ladders merge instead of saying everything twice.
  const reference = mode === 'pointSlope' ? referenceLineOf(questionData) : null;
  if (reference) {
    const plot = 'Start at the given point: use your slope as rise over run to step to a second point.';
    return reference.relation === 'perpendicular'
      ? [
        'Perpendicular lines have slopes that are negative reciprocals: flip the given line’s slope over and change its sign.',
        'Read the given line’s slope: the number multiplied by x. Then use the rule to find the slope of your line.',
        plot,
      ]
      : [
        'Parallel lines have the same slope.',
        'Read the given line’s slope: the number multiplied by x. Your line uses that same slope.',
        plot,
      ];
  }
  if (mode === 'pointSlope') {
    const point = questionData.point || [0, 0];
    const step = slopeStepForHint(questionData.slope);
    return [
      `Start at the given point ${formatPoint(point)}. Slope tells you how to step to a second point.`,
      step
        ? `Slope ${formatSlopeForHint(questionData.slope)} means rise over run: use a run of ${step.run} and a rise of ${step.rise}.`
        : `Slope ${formatSlopeForHint(questionData.slope)} tells you the vertical change for each horizontal step.`,
      'From the given point, take that step — across for the run, up or down for the rise — and plot where you land.',
    ];
  }
  if (mode === 'standardForm') {
    return [
      'Standard form is easiest to graph with intercepts: set x = 0, then set y = 0.',
      'Set x = 0 and solve for y to get the y-intercept. Set y = 0 and solve for x to get the x-intercept.',
      'Plot both intercepts — those two points determine the line.',
    ];
  }
  if (mode === 'factoredLinear') {
    return [
      'In y = a(x − c), c identifies the zero/x-intercept and a is the slope.',
      'The x-intercept is where y = 0, which in y = a(x − c) happens when x = c. Plot it yourself first.',
      'Then use the slope a to step from the x-intercept to another point on the line.',
    ];
  }
  const m = target ? Number(target.m) : Number.NaN;
  const b = target ? Number(target.b) : Number.NaN;
  const step = slopeStepForHint(m);
  return [
    'In y = mx + b, the b is where the line crosses the y-axis. Start there.',
    'The y-intercept is the point on the y-axis, where x = 0. Plot it first.',
    Number.isFinite(m) && Number.isFinite(b) && step
      ? `From the y-intercept, slope ${formatSlopeForHint(m)} means use a run of ${step.run} and a rise of ${step.rise}. Plot where that step lands.`
      : Number.isFinite(m) && Number.isFinite(b)
        ? `Use the slope ${formatSlopeForHint(m)} to locate a second exact point on the line.`
        : common,
  ];
};

export default function Graphing2({ questionData = {}, onAction }) {
  const viewportWidth = useViewportWidth();
  const mode = questionData.mode || 'slopeIntercept';
  // An unauthored slope-intercept question shows (and grades) y = 1.5x - 2;
  // the shared grader reads the target through the same helper.
  const normalizedQuestion = withDefaultTargetLine(questionData);
  const target = targetLineFromQuestion(normalizedQuestion);
  // The given line a perpendicular or parallel question is about, drawn on
  // the plane; null for every other question (TL20).
  const reference = mode === 'pointSlope' ? referenceLineOf(questionData) : null;
  const policy = resolveConstructionPolicy(questionData);
  const requiredPointCount = requiredConstructionPointCount(questionData);
  const [points, setPoints] = usePersistentToolState('points', []);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const hintsAllowed = useHintsAllowed();
  // A ladder of the tool's own only where the host has none (HELP-10).
  const ownHintLadder = useOwnHintLadder();
  const checkLabel = useSubmitLabel('Check construction');
  const hostSubmitLabel = useHostSubmitLabel();
  const studentLine = useMemo(() => points.length >= 2 ? lineFromPoints(points[0], points[1]) : null, [points]);
  // "Your line: y = 2x − 1" beside a task that says "Graph y = 2x − 1" is a
  // free check of the answer before it is submitted — MathMaster converting
  // the construction back into the target's own form. It follows the same
  // permission as every other self-check (QuestionEngine selfCheckAllowed):
  // on in practice, absent on a DOL, quiz or secure Test. The plotted points
  // themselves are always listed; they are the student's own construction.
  const showLineReadout = hintsAllowed;
  // The student's work, exactly as Check submits it and as a deadline would
  // carry it: the plotted points, plus the "Your line" readout they see. The
  // shared grader marks the points; nothing here is a verdict or a key.
  const work = useMemo(() => ({ points, studentLine }), [points, studentLine]);
  useReportToolWork(work);
  const bounds = questionData.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 7 };
  // pointSlope's encoded point is given only in the prompt/equation, never
  // preplotted: the student must place it themselves as their own (blue)
  // construction evidence. Preplotting it here used to collide with that
  // requirement — the student could not click exactly on top of an
  // already-rendered purple point. throughPoints keeps its authored points.
  const givenPoints = mode === 'throughPoints' ? (questionData.givenPoints || []) : [];
  const snapStep = resolveSnapStep(questionData, target);
  const hints = hintsForMode(mode, target, questionData);
  // The snap step is worked out from the answer line, so "the nearest 0.5"
  // tells a student the slope or intercept is not whole. Said plainly where
  // the activity withholds the method (R-10); the anchor note is a grading
  // requirement and stays, worded there as only what is checked.
  const methodWithheld = useMethodWithheld();
  const anchorNote = anchorInstruction(mode, policy, { methodWithheld });

  const plot = (point) => {
    clearFeedback();
    // A point past the last replaces the nearest one; it no longer restarts the line (placePoint.js).
    setPoints((current) => placePoint(current, point, requiredPointCount));
  };

  /*
   * THE VERDICT IS THE SHARED GRADER'S (functions/shared/serverGrading/tools/
   * graphing2.mjs), through the same bounded bytes the server re-grades, so
   * what Check shows is what the gradebook records. Only non-secret metadata
   * rides along: the mode, the authored strategy and the per-part results the
   * feedback below is worded from.
   */
  const check = () => {
    const result = gradeToolCheck(graphing2Grader, questionData, work);
    // No verdict exists only for a question this tool cannot answer (see the
    // grader); Check has never recorded an attempt for one.
    if (!result.graded) return;
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      { mode, strategy: policy.strategy, parts: result.parts },
    );
  };

  /*
   * The plane is handed the GIVEN points first and the student's after them, so
   * the index it reports is into that combined list. Anything before the offset
   * is a given point and is not the student's to move.
   */
  const movePoint = (index, point) => {
    const studentIndex = index - givenPoints.length;
    if (studentIndex < 0) return;
    clearFeedback();
    setPoints((current) => current.map((existing, i) => (i === studentIndex ? point : existing)));
  };

  /*
   * UNIVERSAL UNDO OVER THE CONSTRUCTION.
   *
   * The plotted points ARE the answer here — the shared grader marks them
   * directly — so the undo stack is exactly the list of points. Two of them are
   * kept at a time, and a student who misplaces the second one now takes it back
   * with the same control they use on every other question, rather than with a
   * button that exists only on this tool.
   *
   * Zoom is not in the snapshot and cannot be: it lives inside CoordinatePlane,
   * and a student who zoomed in to place a point accurately must not lose the
   * point to a press that was meant to undo the zoom, or the zoom to a press
   * that was meant to undo the point.
   */
  const mathState = useMemo(() => ({ points }), [points]);
  const restoreMathState = useCallback((previous) => {
    clearFeedback();
    setPoints(Array.isArray(previous?.points) ? previous.points : []);
  }, [clearFeedback]);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last point you plotted',
    state: mathState,
    onRestore: restoreMathState,
    resetKey: questionUndoResetKey(questionData),
  });

  const clear = () => { setPoints([]); clearFeedback(); };
  // Start over empties the construction and so disables itself: it keeps the
  // focus it had instead of dropping it to the page (A11Y-2).
  const startOverAvailability = useFocusSafeDisabled(points.length > 0);

  const plottedPoints = [
    // Given points are squares and the student's are dots, so "given" and
    // "yours" never rest on purple vs blue alone (A11Y-4); each is labelled too.
    ...givenPoints.map((point, index) => ({ x: point[0], y: point[1], label: givenPoints.length > 1 ? `given ${index + 1}` : 'given', fill: '#8a3ffc', shape: 'square' })),
    ...points.map((point, index) => ({ x: point[0], y: point[1], label: `P${index + 1}`, fill: '#1a73e8' })),
  ];
  const studentLines = studentLine?.kind === 'slopeIntercept' ? [{ m: studentLine.m, b: studentLine.b, stroke: '#1a73e8' }] : [];
  // The given line under the student's: grey and dashed, and named in the
  // legend, so "given" never rests on colour alone (A11Y-4).
  const referenceLines = reference ? [{ m: reference.m, b: reference.b, stroke: '#5f6b7a', dash: '9 6' }] : [];
  const verticalStudentLine = studentLine?.kind === 'vertical'
    ? ({ sx, pad, height }) => <line x1={sx(studentLine.x)} x2={sx(studentLine.x)} y1={pad} y2={height - pad} stroke="#1a73e8" strokeWidth="3" />
    : null;

  // Name what actually went wrong instead of restating the task. "Both points
  // are on the line but you plotted the same spot twice" and "one of your two
  // points is off the line" need different fixes.
  // Form-aware categories need their own wording: a mathematically correct
  // line that skipped the required anchor point is a different mistake from
  // one that never found the line at all, and conflating them would hide the
  // one piece of feedback this policy exists to give.
  const formAwareAnchorLabel = mode === 'pointSlope' ? 'given point' : mode === 'factoredLinear' ? 'x-intercept' : mode === 'standardForm' ? 'intercept(s)' : 'y-intercept';
  const formAwareFeedback = (category) => {
    if (category === 'duplicatePoint') return 'Two of your points landed on the same spot. Plot distinct points to show your construction.';
    if (category === 'correctLineMissingAnchor') return `Your line is mathematically correct, but you must plot the ${formAwareAnchorLabel} yourself as part of your evidence — it is not enough to land on an equivalent line without it.`;
    if (category === 'correctAnchorWrongSlope') return `You plotted the ${formAwareAnchorLabel} correctly, but the rest of your construction does not produce the correct line. Recheck your slope step.`;
    return 'That construction does not match the target line yet. Start from the piece of information this form gives you directly.';
  };

  const feedbackMessage = () => {
    if (feedback.isCorrect) return 'Correct — your construction determines exactly the target line.';
    const { category, pointChecks: checks } = readConstructionFeedback({ isCorrect: feedback.isCorrect, parts: feedback.metadata?.parts });
    if (feedback.metadata?.strategy === 'formAware' && category) return formAwareFeedback(category);
    const onLine = checks.filter(Boolean).length;
    if (!studentLine) return 'Those two clicks landed on the same spot. Two different points are needed to determine a line.';
    const turned = orientationMissMessage(target, studentLine);
    if (turned) return turned;
    if (onLine === 0) return 'Neither point is on the target line yet. Find one point you are certain about — the y-intercept is usually easiest — and start there.';
    if (onLine === 1) return `Point ${checks[0] ? 'P1' : 'P2'} is on the line, but the other one is not. Keep the good point and move the other.`;
    return 'Both points are close, but the line through them does not match the target. Re-read each coordinate carefully.';
  };

  /*
   * WHAT ENLARGING THIS TOOL HAS TO CARRY.
   *
   * The activity is "plot two points that determine the target line", so the
   * enlarged view needs the plane, the running description of the construction,
   * Check, Start over and Undo. A Work View holding only a bigger grid would
   * still send the student back out to press Check.
   *
   * Fit View, pan/zoom and point editing are not declared here: CoordinatePlane
   * publishes them from inside, because it is the component that owns the camera
   * and converts every click.
   */
  const constructionIncomplete = !constructionReadyToCheck(points, questionData);
  const workspaceCapabilities = {
    undo: undoHistory.capability,
    equationInput: { label: studentLine && showLineReadout ? `Your line: ${lineReadoutText(studentLine)}` : 'Your line', studentState: true },
    // Where to click and how many points: controls (W6-4), kept on a DOL.
    instruction: { text: nextInstruction(points.length, requiredPointCount, hostSubmitLabel), controlsOnly: true },
    task: { text: targetPrompt(normalizedQuestion, target) },
    // The hints ARE this Help. Where the activity withholds them the panel
    // renders nothing, so publishing it would leave a Help button over an
    // empty drawer; the platform's own directions stand in instead. Inside a
    // question with the platform ladder, that ladder is the Help (HELP-10).
    help: ownHintLadder ? { content: <HintPanel hints={hints} onHintUsed={() => onAction?.('HINT_USED')} /> } : null,
    primaryActions: [{ id: 'check-construction', label: checkLabel, onAction: check, disabled: constructionIncomplete }],
    secondaryActions: [{ id: 'start-over', label: 'Start over', onAction: clear, disabled: !points.length }],
  };

  return (
    <ToolShell
      title="Graphing"
      subtitle="Build a line from the conditions you are given, and keep your plotted points as evidence of how you got there."
      badge={reference ? REFERENCE_LABELS[reference.relation] : MODE_LABELS[mode] || 'Linear graphing'}
    >
      <TaskCard
        question={questionData}
        task={targetPrompt(normalizedQuestion, target)}
        stepsAreControls
        steps={[
          'Click or tap the grid to plot a point, or focus it and use the arrow keys and Enter. A crosshair shows the exact coordinate first.',
          requiredPointCount > 2
            ? `Plot ${requiredPointCount - 1} more points on the same line — the line is drawn for you automatically.`
            : 'Plot a second point on the same line — the line is drawn for you automatically.',
          `Press ${checkLabel} when all ${requiredPointCount} points are where you want them.`,
        ]}
        note={[
          // A reference-line question assesses the slope: "the nearest 0.5"
          // would say it is not a whole number (TL20).
          methodWithheld || reference
            ? 'Points snap to the grid as you place them.'
            : snapStep === 1
              ? 'Points snap to whole numbers, so you cannot land between the gridlines.'
              : `This line passes between gridlines, so points snap to the nearest ${snapStep}.`,
          anchorNote,
        ].filter(Boolean).join(' ')}
      />

      <EnlargeableFigure
        label="Graphing workspace"
        enlargeLabel="Enlarge workspace"
        taskText={targetPrompt(questionData, target)}
        style={{ width: '100%' }}
        openEnlarged={shouldOpenFigureEnlarged({ toolId: 'graphing2', question: questionData || {}, viewportWidth })}
        dismissKey={figureDismissalKey(questionData || {}, 'graphing2')}
        presentationKey={questionData?.questionId ?? questionData?.id ?? questionData?.prompt ?? null}
        capabilities={workspaceCapabilities}
      >
      <ToolSplit>
        <Panel title="Construct the line">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px',
            borderRadius: 999, background: points.length >= requiredPointCount ? 'var(--mm-success-bg)' : 'var(--mm-primary-soft)',
            color: points.length >= requiredPointCount ? 'var(--mm-success-text)' : 'var(--mm-primary-text)', fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))',
          }}>
            <span>{points.length >= requiredPointCount ? '✓' : `${points.length}/${requiredPointCount}`}</span>
            <span>{nextInstruction(points.length, requiredPointCount, hostSubmitLabel)}</span>
          </div>
          <CoordinatePlane
            {...bounds}
            // Authored per question (graphBounds.equalUnits, R-1): a line
            // figure where the angle is the point. Coordinates are unchanged.
            equalUnits={bounds.equalUnits === true}
            onPlot={plot}
            plotProgress={`${points.length} of ${requiredPointCount} ${requiredPointCount === 1 ? 'point' : 'points'} plotted.`}
            onMovePoint={movePoint}
            viewResetKey={questionData?.id ?? questionData?.prompt ?? null}
            snapStep={snapStep}
            points={plottedPoints}
            lines={[...referenceLines, ...studentLines]}
            cursorLabel="Plot"
            ariaLabel="Coordinate plane for constructing your line"
            // This tool wraps its whole split in Work View, so a second enlarge
            // button here would open a shell inside a shell and leave Check
            // behind the inner backdrop. The plane publishes Fit View, pan/zoom
            // and point editing to the shell around it instead.
            enlargeable={false}
          >
            {verticalStudentLine}
          </CoordinatePlane>
          {givenPoints.length ? (
            <p data-graphing-legend="" style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', marginBottom: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px' }}>
              <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#8a3ffc', marginRight: 6, verticalAlign: 'middle' }} />Purple squares labelled “given” are given to you.</span>
              <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#1a73e8', marginRight: 6, verticalAlign: 'middle' }} />Blue dots labelled P1, P2 are yours.</span>
            </p>
          ) : null}
          {reference ? (
            <p data-graphing-reference-legend="" style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', marginBottom: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px' }}>
              <span><svg width="26" height="8" style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="#5f6b7a" strokeWidth="3" strokeDasharray="9 6" /></svg>The dashed grey line is the given line, {lineReadoutText(reference)}.</span>
              <span><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#1a73e8', marginRight: 6, verticalAlign: 'middle' }} />Your line goes through your blue points.</span>
            </p>
          ) : null}
        </Panel>

        <Panel title="Your construction">
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', alignItems: 'baseline' }}>
            <dt style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>Points plotted</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{points.length ? points.map(formatPoint).join(' and ') : 'None yet'}</dd>
            {showLineReadout ? (
              <>
                <dt style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>Your line</dt>
                {/* Typeset, in exact fractions: "y = ⅔x + 2", never "y = 0.66666667x + 2" or "y = 1x + 0" (TOOL-7). */}
                <dd data-line-readout={studentLine ? lineReadoutText(studentLine) : ''} style={{ margin: 0, fontWeight: 700 }}>{studentLine ? <MathDisplay value={lineReadoutLatex(studentLine)} format="latex" inline /> : 'Plot two different points'}</dd>
              </>
            ) : null}
          </dl>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" onClick={check} disabled={constructionIncomplete} style={{ ...primaryButton, opacity: constructionIncomplete ? 0.5 : 1, cursor: constructionIncomplete ? 'not-allowed' : 'pointer' }}>
              {checkLabel}
            </button>
            {/* "Undo last point" used to sit here. Universal Undo covers it
                now: the platform control beside Submit takes the last plotted
                point back, and unlike the local button it keeps working after a
                point has been dragged. Start over is not undo — it discards
                both points at once — so it stays. */}
            <button className="mm-button-neutral" type="button" onClick={() => { if (points.length) clear(); }} {...startOverAvailability} style={{ ...secondaryButton, opacity: points.length ? 1 : 0.5 }}>
              Start over
            </button>
          </div>

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect} message={feedbackMessage()}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
            </div>
          ) : null}

          <HintPanel hints={hints} onHintUsed={() => onAction?.('HINT_USED')} />
        </Panel>
      </ToolSplit>
      </EnlargeableFigure>
    </ToolShell>
  );
}
