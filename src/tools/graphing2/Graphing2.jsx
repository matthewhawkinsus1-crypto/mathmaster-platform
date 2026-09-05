import React, { useMemo, useState } from 'react';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { figureDismissalKey, shouldOpenFigureEnlarged } from '../../platform/student/figurePresentation.js';
import useViewportWidth from '../../platform/mobile/useViewportWidth.js';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel, ToolSplit } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import useToolSubmission from '../shared/useToolSubmission';
import { constructionEvidence, formatLine, lineFromPoints, targetLineFromQuestion } from './graphingMath';

const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButton = { ...primaryButton, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' };

const MODE_LABELS = {
  slopeIntercept: 'Slope-intercept form',
  throughPoints: 'Line through two points',
  pointSlope: 'Point-slope form',
  standardForm: 'Standard form',
  verticalHorizontal: 'Vertical or horizontal line',
};

const formatPoint = (point) => `(${point[0]}, ${point[1]})`;

const targetPrompt = (questionData, target) => {
  const mode = questionData.mode || 'slopeIntercept';
  if (mode === 'throughPoints') return `Graph the line that passes through ${(questionData.givenPoints || []).map(formatPoint).join(' and ')}.`;
  if (mode === 'pointSlope') return `Graph the line through ${formatPoint(questionData.point || [0, 0])} with slope ${questionData.slope}.`;
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
    return [
      `Start at the given point ${formatPoint(point)}. Slope tells you how to step to a second point.`,
      `Slope ${questionData.slope} means rise over run: from ${formatPoint(point)}, move 1 right and ${Number.isFinite(slope) ? slope : '(slope)'} up.`,
      Number.isFinite(slope) ? `Plot ${formatPoint(point)} and ${formatPoint([point[0] + 1, point[1] + slope])}.` : common,
    ];
  }
  if (mode === 'standardForm') {
    return [
      'Standard form is easiest to graph with intercepts: set x = 0, then set y = 0.',
      'Set x = 0 and solve for y to get the y-intercept. Set y = 0 and solve for x to get the x-intercept.',
      'Plot both intercepts — those two points determine the line.',
    ];
  }
  const m = target ? Number(target.m) : Number.NaN;
  const b = target ? Number(target.b) : Number.NaN;
  return [
    'In y = mx + b, the b is where the line crosses the y-axis. Start there.',
    Number.isFinite(b) ? `Plot the y-intercept at (0, ${b}) first.` : 'Plot the y-intercept first.',
    Number.isFinite(m) && Number.isFinite(b) ? `From (0, ${b}), the slope ${m} means move 1 right and ${m} up, landing on ${formatPoint([1, b + m])}.` : common,
  ];
};

export default function Graphing2({ questionData = {}, onAction }) {
  const viewportWidth = useViewportWidth();
  const mode = questionData.mode || 'slopeIntercept';
  const normalizedQuestion = mode === 'slopeIntercept' && !questionData.line ? { ...questionData, line: { m: 1.5, b: -2 } } : questionData;
  const target = targetLineFromQuestion(normalizedQuestion);
  const [points, setPoints] = useState([]);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const studentLine = useMemo(() => points.length >= 2 ? lineFromPoints(points[0], points[1]) : null, [points]);
  const bounds = questionData.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 7 };
  const givenPoints = mode === 'throughPoints' ? (questionData.givenPoints || []) : mode === 'pointSlope' ? [questionData.point].filter(Array.isArray) : [];
  const snapStep = resolveSnapStep(questionData, target);
  const hints = hintsForMode(mode, target, questionData);

  const plot = (point) => {
    clearFeedback();
    setPoints((current) => (current.length >= 2 ? [point] : [...current, point]));
  };

  const check = () => {
    const evidence = constructionEvidence(points, target, Number(questionData.tolerance ?? 0.12));
    submit(
      { isCorrect: evidence.isCorrect, score: evidence.score },
      { points, studentLine: evidence.studentLine },
      { mode, target, pointChecks: evidence.pointChecks },
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

  const undoLastPoint = () => { clearFeedback(); setPoints((current) => current.slice(0, -1)); };
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
  const feedbackMessage = () => {
    if (feedback.isCorrect) return 'Correct — your two points determine exactly the target line.';
    const checks = feedback.metadata?.pointChecks || [];
    const onLine = checks.filter(Boolean).length;
    if (!studentLine) return 'Those two clicks landed on the same spot. Two different points are needed to determine a line.';
    if (onLine === 0) return 'Neither point is on the target line yet. Find one point you are certain about — the y-intercept is usually easiest — and start there.';
    if (onLine === 1) return `Point ${checks[0] ? 'P1' : 'P2'} is on the line, but the other one is not. Keep the good point and move the other.`;
    return 'Both points are close, but the line through them does not match the target. Re-read each coordinate carefully.';
  };

  const nextActionLabel = points.length === 0
    ? 'Plot your first point'
    : points.length === 1
      ? 'Now plot a second point'
      : 'Both points plotted — check your construction';

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
          'Plot a second point on the same line — the line is drawn for you automatically.',
          'Press Check construction when both points are where you want them.',
        ]}
        note={snapStep === 1
          ? 'Points snap to whole numbers, so you cannot land between the gridlines.'
          : `This line passes between gridlines, so points snap to the nearest ${snapStep}.`}
      />

      <EnlargeableFigure
        label="Graphing workspace"
        enlargeLabel="Enlarge workspace"
        taskText={targetPrompt(questionData, target)}
        style={{ width: '100%' }}
        openEnlarged={shouldOpenFigureEnlarged({ toolId: 'graphing2', question: questionData || {}, viewportWidth })}
        dismissKey={figureDismissalKey(questionData || {}, 'graphing2')}
      >
      <ToolSplit>
        <Panel title="Construct the line">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px',
            borderRadius: 999, background: points.length >= 2 ? '#e6f4ea' : '#e8f0fe',
            color: points.length >= 2 ? '#137333' : '#174ea6', fontWeight: 800, fontSize: 13,
          }}>
            <span>{points.length >= 2 ? '✓' : `${points.length}/2`}</span>
            <span>{nextActionLabel}</span>
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
          >
            {verticalStudentLine}
          </CoordinatePlane>
          {givenPoints.length ? (
            <p style={{ color: '#5f6b7a', fontSize: 13, marginBottom: 0 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: '#8a3ffc', marginRight: 6 }} />
              Purple points are given to you. Blue points are yours.
            </p>
          ) : null}
        </Panel>

        <Panel title="Your construction">
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', alignItems: 'baseline' }}>
            <dt style={{ color: '#5f6b7a', fontSize: 13 }}>Points plotted</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{points.length ? points.map(formatPoint).join(' and ') : 'None yet'}</dd>
            <dt style={{ color: '#5f6b7a', fontSize: 13 }}>Your line</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{studentLine ? formatLine(studentLine) : 'Plot two different points'}</dd>
          </dl>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" onClick={check} disabled={points.length < 2 || !studentLine} style={{ ...primaryButton, opacity: points.length < 2 || !studentLine ? 0.5 : 1, cursor: points.length < 2 || !studentLine ? 'not-allowed' : 'pointer' }}>
              Check construction
            </button>
            <button type="button" onClick={undoLastPoint} disabled={!points.length} style={{ ...secondaryButton, opacity: points.length ? 1 : 0.5 }}>
              Undo last point
            </button>
            <button type="button" onClick={clear} disabled={!points.length} style={{ ...secondaryButton, opacity: points.length ? 1 : 0.5 }}>
              Start over
            </button>
          </div>

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              <p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{feedbackMessage()}</p>
            </div>
          ) : null}

          <HintPanel hints={hints} onHintUsed={() => onAction?.('HINT_USED')} />
        </Panel>
      </ToolSplit>
      </EnlargeableFigure>
    </ToolShell>
  );
}
