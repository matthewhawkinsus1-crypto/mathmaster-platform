/*
 * THREE-PLANE VISUALIZER (#359, PART C).
 *
 * A real, interactive 3D representation of three linear equations in x, y,
 * z, built on plain SVG and vector math (threePlaneGeometry.js) rather than
 * a 3D rendering dependency. The student can rotate the model by drag/touch,
 * reset the view, show or hide each plane independently, and — only when
 * the authored question allows it — reveal the common point (or the fact
 * that the planes have no common point, or infinitely many). Nothing about
 * the classification is computed for the student to state; the model only
 * shows the geometry they ask it to show.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { Panel, HintPanel, ResultPill } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import { classifyLinearSystem, linearEquationForm } from './algebraicSystemsEngine.js';
import { clipPlaneToCube, planePlaneIntersection, projectPoint, projectPolygon } from './threePlaneGeometry.js';
import { gradeMultiAnswerResponse } from '../../../functions/shared/ordinaryResponseGrading.mjs';
import './AlgebraicSystemMode.css';
import './ThreePlaneWorkspace.css';

const DEFAULT_VARIABLES = ['x', 'y', 'z'];
const PLANE_COLORS = ['#1a73e8', '#ea4335', '#34a853'];
const DEFAULT_CAMERA = { azimuth: -0.7, elevation: 0.5 };
const MIN_ELEVATION = -1.3;
const MAX_ELEVATION = 1.3;
const VIEW_SIZE = 560;
const AXIS_LABEL_OFFSET = 18;

const toScreen = (point, scale, cameraOffset) => [
  VIEW_SIZE / 2 + (point[0] - cameraOffset[0]) * scale,
  VIEW_SIZE / 2 + (point[1] - cameraOffset[1]) * scale,
];

const boundingRadius = (solution, variables) => {
  const magnitudes = variables.map((name) => Math.abs(Number(solution?.[name]) || 0));
  const largest = Math.max(6, ...magnitudes);
  return Math.ceil(largest * 1.4);
};

export default function ThreePlaneWorkspace({ questionData = {}, onAction }) {
  const variables = Array.isArray(questionData.variables) && questionData.variables.length === 3
    ? questionData.variables.map((value) => String(value))
    : DEFAULT_VARIABLES;
  const equations = Array.isArray(questionData.equations) && questionData.equations.length === 3
    ? questionData.equations.map(String)
    : ['x + y + z = 6', '2x - y + z = 3', '-x + 2y + z = 5'];
  const answerFields = Array.isArray(questionData.answerFields) ? questionData.answerFields : [];
  const spatialModel = questionData.spatialModel && typeof questionData.spatialModel === 'object' ? questionData.spatialModel : {};

  const forms = useMemo(() => equations.map((equation) => linearEquationForm(equation, variables)), [equations, variables]);
  const classification = useMemo(() => classifyLinearSystem(forms, variables), [forms, variables]);
  const R = useMemo(() => boundingRadius(classification.solution, variables), [classification.solution, variables]);

  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const dragRef = useRef(null);
  const [visiblePlanes, setVisiblePlanes] = usePersistentToolState('visiblePlanes', [true, true, true]);
  const [revealed, setRevealed] = usePersistentToolState('solutionRevealed', spatialModel.revealSolution === true);
  const canReveal = spatialModel.revealSolution === true || spatialModel.allowSolutionReveal === true;

  const [responses, setResponses] = usePersistentToolState('interpretation', {});
  const { feedback, submit } = useToolSubmission(onAction);

  const togglePlane = useCallback((index) => {
    setVisiblePlanes((current) => current.map((value, i) => (i === index ? !value : value)));
  }, [setVisiblePlanes]);

  const resetView = useCallback(() => setCamera(DEFAULT_CAMERA), []);

  const handlePointerDown = useCallback((event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, camera };
  }, [camera]);
  const handlePointerMove = useCallback((event) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setCamera({
      azimuth: dragRef.current.camera.azimuth + dx * 0.01,
      elevation: Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, dragRef.current.camera.elevation - dy * 0.01)),
    });
  }, []);
  const handlePointerUp = useCallback((event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }, []);

  const scale = (VIEW_SIZE * 0.42) / R;

  const planePolygons = useMemo(() => forms.map((form, index) => {
    if (!visiblePlanes[index] || !form) return null;
    const polygon3D = clipPlaneToCube(form, variables, R);
    if (!polygon3D) return null;
    return { ...projectPolygon(polygon3D, camera), color: PLANE_COLORS[index % PLANE_COLORS.length], index };
  }).filter(Boolean), [forms, visiblePlanes, variables, R, camera]);

  // The pairwise line where two visible, non-parallel planes cross — the
  // cue two translucent polygons alone do not give: WHERE they meet, not
  // just that they overlap. Hidden whenever either plane of the pair is
  // hidden, or the pair is parallel (no line to show).
  const intersectionLines = useMemo(() => {
    const pairs = [[0, 1], [0, 2], [1, 2]];
    return pairs.map(([i, j]) => {
      if (!visiblePlanes[i] || !visiblePlanes[j] || !forms[i] || !forms[j]) return null;
      const line = planePlaneIntersection(forms[i], forms[j], variables, R);
      if (!line) return null;
      const projected = line.points.map((point) => projectPoint(point, camera));
      return { key: `${i}-${j}`, from: [projected[0].screenX, projected[0].screenY], to: [projected[1].screenX, projected[1].screenY] };
    }).filter(Boolean);
  }, [forms, visiblePlanes, variables, R, camera]);

  const axisEnds = useMemo(() => {
    const axisLength = R + 2;
    const axes = [
      { name: variables[0], from: [-axisLength, 0, 0], to: [axisLength, 0, 0] },
      { name: variables[1], from: [0, -axisLength, 0], to: [0, axisLength, 0] },
      { name: variables[2], from: [0, 0, -axisLength], to: [0, 0, axisLength] },
    ];
    return axes.map((axis) => ({
      name: axis.name,
      from: projectPolygon([axis.from], camera).points[0],
      to: projectPolygon([axis.to], camera).points[0],
    }));
  }, [R, variables, camera]);

  const solutionMarker = useMemo(() => {
    if (classification.type !== 'unique' || !revealed) return null;
    const point3D = variables.map((name) => classification.solution[name]);
    return projectPolygon([point3D], camera).points[0];
  }, [classification, revealed, variables, camera]);

  // Painter's algorithm: farthest (most negative screen depth toward the
  // viewer's back) first, nearest last, so overlapping translucent planes
  // layer the way a person looking at the model would expect.
  const orderedPolygons = useMemo(() => [...planePolygons].sort((a, b) => a.depth - b.depth), [planePolygons]);

  const fieldResponses = useCallback((fieldId, value) => {
    setResponses((current) => ({ ...current, [fieldId]: value }));
  }, [setResponses]);

  const check = () => {
    const grade = answerFields.length ? gradeMultiAnswerResponse({ answerFields }, responses) : { isCorrect: true, isComplete: true, parts: [] };
    submit({ isCorrect: grade.isCorrect, score: grade.isCorrect ? 1 : 0 }, responses, { mode: 'spatial', parts: grade.parts, classification: classification.type });
  };

  const revealLabel = classification.type === 'unique' ? 'Reveal the solution point'
    : classification.type === 'none' ? 'Reveal whether the planes share a point'
    : 'Reveal whether the planes share a point';

  return (
    <EnlargeableFigure
      label="Three-plane systems workspace"
      enlargeLabel="Enlarge three-plane systems workspace"
      style={{ width: '100%' }}
      capabilities={{
        instruction: { text: 'Rotate the model, show or hide each plane, and explore how the three planes relate.' },
        primaryActions: answerFields.length ? [{ id: 'check-spatial-interpretation', label: 'Check my answer', onAction: check }] : [],
      }}
    >
      <div className="mathmaster-threeplane-layout">
        <div className="mathmaster-threeplane-equations" aria-label="The three original equations">
          {equations.map((equation, index) => (
            <div key={equation} className="mathmaster-reduction-equation-card" style={{ borderLeft: `4px solid ${PLANE_COLORS[index % PLANE_COLORS.length]}` }}>
              <span className="mathmaster-reduction-equation-label">Plane {index + 1}</span>
              <MathDisplay value={equation} format="ascii-math" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13 }}>
                <input type="checkbox" checked={Boolean(visiblePlanes[index])} onChange={() => togglePlane(index)} />
                Show plane {index + 1}
              </label>
            </div>
          ))}
        </div>

        <div className="mathmaster-threeplane-viewport">
          <svg
            viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
            role="img"
            aria-label="Interactive 3D view of the three planes. Drag to rotate."
            style={{ touchAction: 'none', background: '#f8f9fc', borderRadius: 12, border: '1px solid #dadce0', cursor: 'grab', width: '100%', height: 'auto', maxWidth: 560, aspectRatio: '1 / 1' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {axisEnds.map((axis) => (
              <g key={axis.name}>
                <line
                  x1={toScreen(axis.from, scale, [0, 0])[0]} y1={toScreen(axis.from, scale, [0, 0])[1]}
                  x2={toScreen(axis.to, scale, [0, 0])[0]} y2={toScreen(axis.to, scale, [0, 0])[1]}
                  stroke="#5f6368" strokeWidth={1.5}
                />
                <text
                  x={toScreen(axis.to, scale, [0, 0])[0]}
                  y={toScreen(axis.to, scale, [0, 0])[1] + (axis.to[1] > 0 ? AXIS_LABEL_OFFSET : -AXIS_LABEL_OFFSET / 2)}
                  fontSize={16} fontWeight={700} fill="#3c4043" textAnchor="middle"
                >
                  {axis.name}
                </text>
              </g>
            ))}
            {orderedPolygons.map((plane) => (
              <polygon
                key={plane.index}
                points={plane.points.map((point) => toScreen(point, scale, [0, 0]).join(',')).join(' ')}
                fill={plane.color}
                fillOpacity={0.32}
                stroke={plane.color}
                strokeWidth={1.5}
              />
            ))}
            {intersectionLines.map((line) => (
              <line
                key={line.key}
                x1={toScreen(line.from, scale, [0, 0])[0]} y1={toScreen(line.from, scale, [0, 0])[1]}
                x2={toScreen(line.to, scale, [0, 0])[0]} y2={toScreen(line.to, scale, [0, 0])[1]}
                stroke="#202124" strokeWidth={2.5} strokeDasharray="6 4"
              />
            ))}
            {solutionMarker ? (
              <circle cx={toScreen(solutionMarker, scale, [0, 0])[0]} cy={toScreen(solutionMarker, scale, [0, 0])[1]} r={6} fill="#202124" stroke="#fff" strokeWidth={2} />
            ) : null}
          </svg>
          {intersectionLines.length ? (
            <p className="mathmaster-threeplane-legend">
              <span className="mathmaster-threeplane-legend-swatch" aria-hidden="true" /> Dashed line: where two shown planes meet.
            </p>
          ) : null}
          <div className="mathmaster-reduction-button-row" style={{ marginTop: 10 }}>
            <button type="button" onClick={resetView} className="mathmaster-reduction-carry">Reset view</button>
            {canReveal ? (
              <button type="button" onClick={() => setRevealed(true)} className="mathmaster-reduction-carry" disabled={revealed}>
                {revealed ? 'Revealed' : revealLabel}
              </button>
            ) : null}
          </div>
          {revealed ? (
            <p className="mathmaster-reduction-ready-card" role="status">
              {classification.type === 'unique'
                ? `The three planes meet at exactly one point: (${variables.map((name) => classification.solution[name]).join(', ')}).`
                : classification.type === 'none'
                  ? 'The three planes share no common point.'
                  : classification.type === 'infinite'
                    ? 'The three planes share infinitely many points.'
                    : 'This system could not be classified.'}
            </p>
          ) : null}
        </div>
      </div>

      {answerFields.length ? (
        <Panel title="Interpret what you found">
          {answerFields.map((field) => (
            <label key={field.id} className="mathmaster-reduction-field" style={{ display: 'block', marginTop: 10 }}>
              {field.label}
              {Array.isArray(field.options) && field.options.length ? (
                <div className="mathmaster-reduction-button-row">
                  {field.options.map((option) => (
                    <button
                      key={String(option)}
                      type="button"
                      onClick={() => fieldResponses(field.id, option)}
                      className="mathmaster-reduction-carry"
                      aria-pressed={responses[field.id] === option}
                    >
                      {String(option)}
                    </button>
                  ))}
                </div>
              ) : (
                <MathInput
                  value={responses[field.id] || ''}
                  onChange={(value) => fieldResponses(field.id, value)}
                  ariaLabel={field.label}
                  toolProfile="algebra-operation"
                />
              )}
            </label>
          ))}
          <button type="button" onClick={check} style={{ marginTop: 14, padding: '11px 18px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44 }}>
            Check my answer
          </button>
          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <HintPanel
        hints={[
          'Drag anywhere on the model to rotate it.',
          'Hide a plane to see the other two more clearly, then show it again.',
          'Two planes that are not parallel always meet in a line — shown as a dashed line wherever two visible planes cross.',
        ]}
        onHintUsed={() => onAction?.('HINT_USED')}
      />
    </EnlargeableFigure>
  );
}
