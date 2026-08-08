import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import useToolSubmission from '../shared/useToolSubmission';
import { constructionEvidence, formatLine, lineFromPoints, targetLineFromQuestion } from './graphingMath';

const buttonStyle = { padding: '10px 16px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800, cursor: 'pointer' };

const targetPrompt = (questionData, target) => {
  const mode = questionData.mode || 'slopeIntercept';
  if (mode === 'throughPoints') return 'Graph the line through ' + questionData.givenPoints.map((point) => '(' + point[0] + ', ' + point[1] + ')').join(' and ') + '.';
  if (mode === 'pointSlope') return 'Graph the line through (' + questionData.point[0] + ', ' + questionData.point[1] + ') with slope ' + questionData.slope + '.';
  if (mode === 'standardForm') return 'Graph ' + questionData.standard.A + 'x + ' + questionData.standard.B + 'y = ' + questionData.standard.C + '.';
  if (mode === 'verticalHorizontal') return 'Graph ' + (questionData.orientation === 'vertical' ? 'x = ' : 'y = ') + questionData.value + '.';
  return 'Graph ' + formatLine(target) + '.';
};

export default function Graphing2({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'slopeIntercept';
  const normalizedQuestion = mode === 'slopeIntercept' && !questionData.line ? { ...questionData, line: { m: 1.5, b: -2 } } : questionData;
  const target = targetLineFromQuestion(normalizedQuestion);
  const [points, setPoints] = useState([]);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const studentLine = useMemo(() => points.length >= 2 ? lineFromPoints(points[0], points[1]) : null, [points]);
  const bounds = questionData.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 7 };
  const givenPoints = mode === 'throughPoints' ? questionData.givenPoints : mode === 'pointSlope' ? [questionData.point] : [];

  const plot = (point) => {
    clearFeedback();
    setPoints((current) => current.length >= 2 ? [point] : [...current, point]);
  };

  const check = () => {
    const evidence = constructionEvidence(points, target, Number(questionData.tolerance ?? 0.12));
    submit({ isCorrect: evidence.isCorrect, score: evidence.score }, { points, studentLine: evidence.studentLine }, { mode, target, pointChecks: evidence.pointChecks });
  };

  const clear = () => { setPoints([]); clearFeedback(); };
  const plottedPoints = [
    ...givenPoints.map((point, index) => ({ 0: point[0], 1: point[1], label: index ? 'given ' + (index + 1) : 'given', fill: '#8a3ffc' })),
    ...points.map((point, index) => ({ 0: point[0], 1: point[1], label: 'P' + (index + 1), fill: '#1a73e8' })),
  ];
  const studentLines = studentLine?.kind === 'slopeIntercept' ? [{ m: studentLine.m, b: studentLine.b, stroke: '#1a73e8' }] : [];
  const verticalStudentLine = studentLine?.kind === 'vertical' ? ({ sx, pad, height }) => <line x1={sx(studentLine.x)} x2={sx(studentLine.x)} y1={pad} y2={height - pad} stroke="#1a73e8" strokeWidth="3" /> : null;

  return <ToolShell title="Graphing 2.0" subtitle="Construct lines from mathematical conditions and preserve the plotted points as evidence." badge="Batch D · Core upgrade">
    <ToolGrid min={330}>
      <Panel title="Construct the line">
        <p><strong>Target:</strong> {targetPrompt(normalizedQuestion, target)}</p>
        <CoordinatePlane {...bounds} onPlot={plot} points={plottedPoints} lines={studentLines}>{verticalStudentLine}</CoordinatePlane>
        <p style={{ color: '#5f6b7a' }}>Click two grid locations. The line is determined by both points. A third click starts a fresh construction.</p>
      </Panel>

      <Panel title="Construction evidence">
        <p><strong>Mode:</strong> {mode}</p>
        <p><strong>Student points:</strong> {points.length ? points.map((point) => '(' + point[0] + ', ' + point[1] + ')').join(' and ') : 'none yet'}</p>
        <p><strong>Constructed line:</strong> {studentLine ? formatLine(studentLine) : 'plot two distinct points'}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={check} disabled={points.length < 2 || !studentLine} style={{ ...buttonStyle, opacity: points.length < 2 || !studentLine ? .55 : 1 }}>Check construction</button><button type="button" onClick={clear} style={{ ...buttonStyle, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' }}>Reset points</button></div>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The constructed line satisfies the target condition.' : 'Check whether both plotted points satisfy the target line, then reconstruct.'}</ResultPill></div> : null}
      </Panel>
    </ToolGrid>
  </ToolShell>;
}
