import React, { useCallback, useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { figureDismissalKey, shouldOpenFigureEnlarged } from '../../platform/student/figurePresentation.js';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import useViewportWidth from '../../platform/mobile/useViewportWidth.js';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel, ToolSplit } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import useToolSubmission from '../shared/useToolSubmission';
import { useHintsAllowed, useSubmitLabel } from '../shared/ToolRuntimeContext';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import graphing2Grader, { readConstructionFeedback } from '../../../functions/shared/serverGrading/tools/graphing2.mjs';
import { formatLine, lineFromPoints, targetLineFromQuestion, withDefaultTargetLine } from './graphingMath';
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

const formatPoint = (point) => `(${point[0]}, ${point[1]})`;

// What to do next, in one sentence. Used by the progress pill inside the tool
// and registered as the Work View current instruction, so the enlarged view
// says the same thing the embedded one does instead of inventing its own.
const nextInstruction = (plottedCount, requiredCount = 2) => (
  plottedCount === 0
    ? 'Click the grid to plot your first point.'
    : plottedCount < requiredCount
      ? `Now plot point ${plottedCount + 1} of ${requiredCount} on the same line.`
      : `All ${requiredCount} points plotted — check your construction.`
);

// What the form-aware policy needs to see, before any point is checked, so
// the student is told what to demonstrate rather than left to guess from a
// wrong-answer message after the fact. Never reveals the actual coordinate —
// that stays hidden until the student supplies it and Check confirms it.
const anchorInstruction = (mode, policy) => {
  if (policy.strategy !== 'formAware') return null;
  if (mode === 'slopeIntercept') return 'This question requires you to plot the y-intercept as one of your points.';
  if (mode === 'factoredLinear') return 'This question requires you to plot the x-intercept yourself, then use the slope for another point.';
  if (mode === 'pointSlope') return 'This question requires you to plot the given point yourself — it is not already on the graph.';
  if (mode === 'standardForm') return 'This question requires you to plot the line’s intercept(s) as your evidence, not just any two points on the line.';
  return null;
};

const targetPrompt = (questionData, target) => {
  const mode = questionData.mode || 'slopeIntercept';
  if (mode === 'throughPoints') return `Graph the line that passes through ${(questionData.givenPoints || []).map(formatPoint).join(' and ')}.`;
  if (mode === 'pointSlope') return `Graph the line through ${formatPoint(questionData.point || [0, 0])} with slope ${questionData.slope}.`;
  if (mode === 'factoredLinear') return `Graph y = ${questionData.factored?.a}(x − ${questionData.factored?.c}).`;
  if (mode === 'standardForm') return `Graph ${questionData.standard?.A}x + ${questionData.standard?.B}y = ${questionData.standard?.C}.`;
  if (mode === 'verticalHorizontal') return `Graph ${questionData.orientation === 'vertical' ? 'x = ' : 'y = '}${questionData.value}.`;
  return `Graph ${formatLine(target)}.`;
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

const hintsForMode = (mode, target, questionData) => {
  const common = 'Two points are enough to determine a line — pick the two that are easiest to read exactly.';
  if (mode === 'verticalHorizontal') {
    const vertical = questionData.orientation === 'vertical';
    return [
      vertical ? 'A vertical line has the same x-value at every single point.' : 'A horizontal line has the same y-value at every single point.',
      vertical ? `Every point on this line looks like (${questionData.value}, ?) — the y-value can be anything.` : `Every point on this line looks like (?, ${questionData.value}) — the x-value can be anything.`,
      vertical ? `Plot (${questionData.value}, 0) and (${questionData.value}, 2).` : `Plot (0, ${questionData.value}) and (2, ${questionData.value}).`,
    ];
  }
  if (mode === 'throughPoints') {
    const given = questionData.givenPoints || [];
    return [
      'The two purple points are already on the line. You need to plot those same two locations yourself.',
      'Read each purple point carefully: go across for x first, then up or down for y.',
      given.length >= 2 ? `Plot ${formatPoint(given[0])} and ${formatPoint(given[1])}.` : common,
    ];
  }
  if (mode === 'pointSlope') {
    const point = questionData.point || [0, 0];
    const slope = Number(questionData.slope);
    const step = slopeStepForHint(questionData.slope);
    const secondPoint = step
      ? [Number(point[0]) + step.run, Number(point[1]) + step.rise]
      : Number.isFinite(slope) ? [Number(point[0]) + 1, Number(point[1]) + slope] : null;
    return [
      `Start at the given point ${formatPoint(point)}. Slope tells you how to step to a second point.`,
      step
        ? `Slope ${formatSlopeForHint(questionData.slope)} means rise over run: use a run of ${step.run} and a rise of ${step.rise}.`
        : `Slope ${formatSlopeForHint(questionData.slope)} tells you the vertical change for each horizontal step.`,
      secondPoint ? `Plot ${formatPoint(point)} and ${formatPoint(secondPoint)}.` : common,
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
    const a = Number(questionData.factored?.a); const c = Number(questionData.factored?.c);
    return [
      'In y = a(x − c), c identifies the zero/x-intercept and a is the slope.',
      Number.isFinite(c) ? `Plot the x-intercept (${c}, 0) yourself first.` : 'Plot the x-intercept first.',
      Number.isFinite(a) && Number.isFinite(c) ? `Then use slope ${formatSlopeForHint(a)} to establish another valid point from (${c}, 0).` : common,
    ];
  }
  const m = target ? Number(target.m) : Number.NaN;
  const b = target ? Number(target.b) : Number.NaN;
  const step = slopeStepForHint(m);
  return [
    'In y = mx + b, the b is where the line crosses the y-axis. Start there.',
    Number.isFinite(b) ? `Plot the y-intercept at (0, ${b}) first.` : 'Plot the y-intercept first.',
    Number.isFinite(m) && Number.isFinite(b) && step
      ? `From (0, ${b}), slope ${formatSlopeForHint(m)} means use a run of ${step.run} and a rise of ${step.rise}, landing on ${formatPoint([step.run, b + step.rise])}.`
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
  const policy = resolveConstructionPolicy(questionData);
  const requiredPointCount = requiredConstructionPointCount(questionData);
  const [points, setPoints] = usePersistentToolState('points', []);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const hintsAllowed = useHintsAllowed();
  const checkLabel = useSubmitLabel('Check construction');
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
  const anchorNote = anchorInstruction(mode, policy);

  const plot = (point) => {
    clearFeedback();
    setPoints((current) => (current.length >= requiredPointCount ? [point] : [...current, point]));
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

  const plottedPoints = [
    ...givenPoints.map((point, index) => ({ x: point[0], y: point[1], label: givenPoints.length > 1 ? `given ${index + 1}` : 'given', fill: '#8a3ffc' })),
    ...points.map((point, index) => ({ x: point[0], y: point[1], label: `P${index + 1}`, fill: '#1a73e8' })),
  ];
  const studentLines = studentLine?.kind === 'slopeIntercept' ? [{ m: studentLine.m, b: studentLine.b, stroke: '#1a73e8' }] : [];
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
    equationInput: { label: studentLine && showLineReadout ? `Your line: ${formatLine(studentLine)}` : 'Your line', studentState: true },
    instruction: { text: nextInstruction(points.length, requiredPointCount) },
    task: { text: targetPrompt(normalizedQuestion, target) },
    // The hints ARE this Help. Where the activity withholds them the panel
    // renders nothing, so publishing it would leave a Help button over an
    // empty drawer; the platform's own directions stand in instead.
    help: hintsAllowed ? { content: <HintPanel hints={hints} onHintUsed={() => onAction?.('HINT_USED')} /> } : null,
    primaryActions: [{ id: 'check-construction', label: checkLabel, onAction: check, disabled: constructionIncomplete }],
    secondaryActions: [{ id: 'start-over', label: 'Start over', onAction: clear, disabled: !points.length }],
  };

  return (
    <ToolShell
      title="Graphing"
      subtitle="Build a line from the conditions you are given, and keep your plotted points as evidence of how you got there."
      badge={MODE_LABELS[mode] || 'Linear graphing'}
    >
      <TaskCard
        question={questionData}
        task={targetPrompt(normalizedQuestion, target)}
        steps={[
          'Click the grid to plot a point. A crosshair shows the exact coordinate before you click.',
          requiredPointCount > 2
            ? `Plot ${requiredPointCount - 1} more points on the same line — the line is drawn for you automatically.`
            : 'Plot a second point on the same line — the line is drawn for you automatically.',
          `Press Check construction when all ${requiredPointCount} points are where you want them.`,
        ]}
        note={[
          snapStep === 1
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
            color: points.length >= requiredPointCount ? 'var(--mm-success-text)' : 'var(--mm-primary-text)', fontWeight: 800, fontSize: 13,
          }}>
            <span>{points.length >= requiredPointCount ? '✓' : `${points.length}/${requiredPointCount}`}</span>
            <span>{nextInstruction(points.length, requiredPointCount)}</span>
          </div>
          <CoordinatePlane
            {...bounds}
            onPlot={plot}
            onMovePoint={movePoint}
            viewResetKey={questionData?.id ?? questionData?.prompt ?? null}
            snapStep={snapStep}
            points={plottedPoints}
            lines={studentLines}
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
            <p style={{ color: 'var(--mm-text-muted)', fontSize: 13, marginBottom: 0 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#8a3ffc', marginRight: 6 }} />
              Purple points are given to you. Blue points are yours.
            </p>
          ) : null}
        </Panel>

        <Panel title="Your construction">
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', alignItems: 'baseline' }}>
            <dt style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>Points plotted</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{points.length ? points.map(formatPoint).join(' and ') : 'None yet'}</dd>
            {showLineReadout ? (
              <>
                <dt style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>Your line</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{studentLine ? formatLine(studentLine) : 'Plot two different points'}</dd>
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
            <button className="mm-button-neutral" type="button" onClick={clear} disabled={!points.length} style={{ ...secondaryButton, opacity: points.length ? 1 : 0.5 }}>
              Start over
            </button>
          </div>

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              <p style={{ margin: '9px 0 0', color: 'var(--mm-text)', lineHeight: 1.55 }}>{feedbackMessage()}</p>
            </div>
          ) : null}

          <HintPanel hints={hints} onHintUsed={() => onAction?.('HINT_USED')} />
        </Panel>
      </ToolSplit>
      </EnlargeableFigure>
    </ToolShell>
  );
}
