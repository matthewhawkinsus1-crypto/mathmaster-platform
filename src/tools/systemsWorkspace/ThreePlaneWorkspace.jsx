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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { Panel, HintPanel, ResultPill } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import { useToolRuntimeContext } from '../shared/ToolRuntimeContext';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import { classifyLinearSystem, exactNumberText, linearEquationForm } from './algebraicSystemsEngine.js';
import { advanceIdleCamera, clipPlaneToCube, cubeCorners, cubeEdges, idleOrbitPending, idleOrbitPhase, legibleCamera, planePlaneIntersection, projectPoint, projectPolygon, spendIdleOrbitFrame } from './threePlaneGeometry.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import systemsWorkspaceGrader from '../../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import './AlgebraicSystemMode.css';
import './ThreePlaneWorkspace.css';
import { earnedResultCaption, spatialMisconceptionFeedback, threePlaneRevealAvailable } from './spatialFeedback.js';

const DEFAULT_VARIABLES = ['x', 'y', 'z'];
const PLANE_COLORS = ['#1a73e8', '#ea4335', '#34a853'];
const DEFAULT_CAMERA = { azimuth: -0.7, elevation: 0.5 };
const MIN_ELEVATION = -1.3;
const MAX_ELEVATION = 1.3;
const VIEW_SIZE = 560;
const AXIS_LABEL_OFFSET = 18;
const PLANE_LABEL_OFFSETS = [[-16, -12], [0, 12], [16, -12]];

const toScreen = (point, scale, cameraOffset) => [
  VIEW_SIZE / 2 + (point[0] - cameraOffset[0]) * scale,
  VIEW_SIZE / 2 + (point[1] - cameraOffset[1]) * scale,
];

const clampLabel = (value, margin) => Math.min(VIEW_SIZE - margin, Math.max(margin, value));
/** "(1, −2, 4)": exact values with a true minus sign, the way the algebra wrote them. */
const orderedTripleText = (solution, variables) => `(${variables.map((name) => exactNumberText(solution[name]).replace(/^-/, '\u2212')).join(', ')})`;

const boundingRadius = (solution, variables) => {
  const magnitudes = variables.map((name) => Math.abs(Number(solution?.[name]) || 0));
  const largest = Math.max(6, ...magnitudes);
  return Math.ceil(largest * 1.4);
};

export default function ThreePlaneWorkspace({ questionData = {}, onAction, earnedResult = null }) {
  // Keep the authored arrays stable while the idle camera animates. Without
  // this, every animation frame reparses the same equations and recomputes the
  // best opening camera even though only the camera angle changed.
  const variables = useMemo(() => (
    Array.isArray(questionData.variables) && questionData.variables.length === 3
      ? questionData.variables.map((value) => String(value))
      : DEFAULT_VARIABLES
  ), [questionData.variables]);
  const equations = useMemo(() => (
    Array.isArray(questionData.equations) && questionData.equations.length === 3
      ? questionData.equations.map(String)
      : ['x + y + z = 6', '2x - y + z = 3', '-x + 2y + z = 5']
  ), [questionData.equations]);
  const answerFields = Array.isArray(questionData.answerFields) ? questionData.answerFields : [];
  const spatialModel = questionData.spatialModel && typeof questionData.spatialModel === 'object' ? questionData.spatialModel : {};
  const systemIdentity = variables.join('|') + '::' + equations.join('|');

  const forms = useMemo(() => equations.map((equation) => linearEquationForm(equation, variables)), [equations, variables]);
  const classification = useMemo(() => classifyLinearSystem(forms, variables), [forms, variables]);
  const shownSolution = earnedResult?.type === 'unique' ? earnedResult.solution : classification.solution;
  const R = useMemo(() => boundingRadius(shownSolution, variables), [shownSolution, variables]);

  // Opening view: the upright angle where every plane is seen most face-on,
  // instead of one fixed angle that showed the Day 1 planes as slivers (#361).
  const openingCamera = useMemo(() => legibleCamera(forms, variables, DEFAULT_CAMERA), [forms, variables]);
  const [camera, setCamera] = useState(openingCamera);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const dragRef = useRef(null);
  const modelRef = useRef(null);
  // The orbit's budget (threePlaneGeometry.js): the orbit time already shown,
  // and whether it is all spent.
  const orbitShownMsRef = useRef(0);
  const [orbitBudgetSpent, setOrbitBudgetSpent] = useState(false);
  // Whether anyone could see the orbit. Without an IntersectionObserver the
  // model counts as on-screen, and the budget alone bounds the orbit.
  const [modelOnScreen, setModelOnScreen] = useState(true);
  const [pageHidden, setPageHidden] = useState(() => typeof document !== 'undefined' && document.hidden === true);

  // Gently orbit before the student touches the model so the flat SVG reads
  // immediately as a 3D object. Stop on first interaction and respect reduced
  // motion; otherwise stop for good once the budget is spent, and wait — without
  // spending it — while the model is off-screen or the tab is hidden.
  useEffect(() => {
    const media = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const sync = () => setReduceMotion(Boolean(media?.matches));
    sync();
    media?.addEventListener?.('change', sync);
    return () => media?.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    setCamera(openingCamera);
    setHasInteracted(false);
    // A different system is a new model to read, so it gets the whole orbit.
    orbitShownMsRef.current = 0;
    setOrbitBudgetSpent(false);
  }, [systemIdentity, openingCamera.azimuth, openingCamera.elevation]);

  const orbitPhase = idleOrbitPhase({
    hasInteracted,
    reduceMotion,
    budgetSpent: orbitBudgetSpent,
    onScreen: modelOnScreen,
    pageHidden,
  });
  const orbitPending = idleOrbitPending(orbitPhase);

  // Visibility is watched only while there is an orbit left to pause.
  useEffect(() => {
    if (!orbitPending || typeof document === 'undefined') return undefined;
    const sync = () => setPageHidden(document.hidden === true);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [orbitPending]);

  useEffect(() => {
    const model = modelRef.current;
    if (!orbitPending || !model || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') return undefined;
    const observer = new window.IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1];
      if (latest) setModelOnScreen(latest.isIntersecting);
    });
    observer.observe(model);
    return () => observer.disconnect();
  }, [orbitPending]);

  useEffect(() => {
    if (orbitPhase !== 'running' || typeof window === 'undefined') return undefined;
    let frameId = null;
    let previous = null;
    const tick = (timestamp) => {
      // The first frame after starting or resuming only sets the clock, so a
      // pause is never turned into a jump.
      const frame = spendIdleOrbitFrame(orbitShownMsRef.current, previous == null ? 0 : timestamp - previous);
      previous = timestamp;
      orbitShownMsRef.current = frame.spentMs;
      if (frame.stepMs > 0) setCamera((current) => advanceIdleCamera(current, frame.stepMs));
      if (frame.budgetSpent) {
        // Done for good: no next frame, and the camera stays where it is.
        frameId = null;
        setOrbitBudgetSpent(true);
        return;
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
    };
  }, [orbitPhase]);

  const markInteracted = useCallback(() => setHasInteracted(true), []);
  const [visiblePlanes, setVisiblePlanes] = usePersistentToolState('visiblePlanes', [true, true, true]);
  const [revealed, setRevealed] = usePersistentToolState('solutionRevealed', spatialModel.revealSolution === true);
  // A DOL, quiz or test never offers a student-pressed reveal, and the line
  // under an earned model never names the true outcome there (see both
  // helpers in spatialFeedback.js).
  const { showImmediateFeedback, hintsAllowed } = useToolRuntimeContext();
  const canReveal = threePlaneRevealAvailable({ earnedResult, spatialModel, showImmediateFeedback, hintsAllowed });
  const showResult = Boolean(earnedResult) || (canReveal && revealed);
  const shownType = earnedResult?.type || classification.type;

  const [responses, setResponses] = usePersistentToolState('interpretation', {});
  const { feedback, submit } = useToolSubmission(onAction);

  const togglePlane = useCallback((index) => {
    markInteracted();
    setVisiblePlanes((current) => current.map((value, i) => (i === index ? !value : value)));
  }, [markInteracted, setVisiblePlanes]);

  const resetView = useCallback(() => {
    markInteracted();
    setCamera(openingCamera);
  }, [markInteracted, openingCamera]);

  const handlePointerDown = useCallback((event) => {
    markInteracted();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, camera };
  }, [camera, markInteracted]);
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

  const cubeFrame = useMemo(() => {
    const corners = cubeCorners(R).map((point) => projectPoint(point, camera));
    return cubeEdges().map(([fromIndex, toIndex]) => ({
      key: String(fromIndex) + '-' + String(toIndex),
      from: [corners[fromIndex].screenX, corners[fromIndex].screenY],
      to: [corners[toIndex].screenX, corners[toIndex].screenY],
      depth: (corners[fromIndex].depth + corners[toIndex].depth) / 2,
    })).sort((a, b) => a.depth - b.depth);
  }, [R, camera]);

  const origin = useMemo(() => projectPoint([0, 0, 0], camera), [camera]);

  const solutionMarker = useMemo(() => {
    if (shownType !== 'unique' || !showResult) return null;
    const point3D = variables.map((name) => shownSolution[name]);
    return projectPolygon([point3D], camera).points[0];
  }, [shownType, showResult, shownSolution, variables, camera]);

  // Painter's algorithm: farthest (most negative screen depth toward the
  // viewer's back) first, nearest last, so overlapping translucent planes
  // layer the way a person looking at the model would expect.
  const orderedPolygons = useMemo(() => [...planePolygons].sort((a, b) => a.depth - b.depth), [planePolygons]);

  const fieldResponses = useCallback((fieldId, value) => {
    setResponses((current) => ({ ...current, [fieldId]: value }));
  }, [setResponses]);

  // The student's interpretation — one { id, value } per answer field, the
  // work Check grades and a deadline would submit. Reported only when this
  // model is the question's own answer surface (not the 3D connection an
  // algebraic outcome opens with earnedResult and no answer fields).
  const answerSurface = !earnedResult && answerFields.length > 0;
  const work = useMemo(() => ({
    responses: answerFields
      .filter((field) => field?.id !== undefined && field?.id !== null && field?.id !== '')
      .map((field) => ({ id: field.id, value: responses?.[field.id] ?? '' })),
  }), [answerFields, responses]);
  useReportToolWork(work, { enabled: answerSurface });

  const check = () => {
    const result = gradeToolCheck(systemsWorkspaceGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'spatial', parts: result.parts });
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
          {/* Says the model is turning only while the orbit is still to come:
              never after the student takes over, under reduced motion, or once
              the budget is spent and the model has stopped. */}
          <div className={`mathmaster-threeplane-motion-cue${orbitPending ? ' is-idle' : ''}`}>
            <span className="mathmaster-threeplane-motion-dot" aria-hidden="true" />
            {orbitPending
              ? 'Auto-rotating to show depth — drag the model to take control.'
              : 'Drag the model to rotate it. Use Reset view to return to the opening angle.'}
          </div>
          <svg
            ref={modelRef}
            viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
            role="img"
            aria-label="Interactive 3D view of the three planes. Drag to rotate."
            style={{ touchAction: 'none', background: 'var(--mm-surface-sunken)', borderRadius: 12, border: '1px solid var(--mm-border)', cursor: 'grab', width: '100%', height: 'auto', maxWidth: 560, aspectRatio: '1 / 1' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <marker id="mathmaster-threeplane-axis-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L7,3.5 L0,7 z" fill="#5f6368" />
              </marker>
            </defs>
            {cubeFrame.map((edge) => (
              <line
                key={edge.key}
                x1={toScreen(edge.from, scale, [0, 0])[0]} y1={toScreen(edge.from, scale, [0, 0])[1]}
                x2={toScreen(edge.to, scale, [0, 0])[0]} y2={toScreen(edge.to, scale, [0, 0])[1]}
                className="mathmaster-threeplane-frame-edge"
              />
            ))}
            {axisEnds.map((axis) => (
              <g key={axis.name}>
                <line
                  x1={toScreen(axis.from, scale, [0, 0])[0]} y1={toScreen(axis.from, scale, [0, 0])[1]}
                  x2={toScreen(axis.to, scale, [0, 0])[0]} y2={toScreen(axis.to, scale, [0, 0])[1]}
                  stroke="#5f6368" strokeWidth={1.5}
                  markerEnd="url(#mathmaster-threeplane-axis-arrow)"
                />
                <text
                  // Kept inside the frame: at some angles an axis runs past
                  // the edge and its name was drawn off the model (#361).
                  x={clampLabel(toScreen(axis.to, scale, [0, 0])[0], 14)}
                  y={clampLabel(toScreen(axis.to, scale, [0, 0])[1] + (axis.to[1] > 0 ? AXIS_LABEL_OFFSET : -AXIS_LABEL_OFFSET / 2), 18)}
                  fontSize={16} fontWeight={700} fill="#3c4043" textAnchor="middle"
                >
                  {axis.name}
                </text>
              </g>
            ))}
            <circle
              cx={toScreen([origin.screenX, origin.screenY], scale, [0, 0])[0]}
              cy={toScreen([origin.screenX, origin.screenY], scale, [0, 0])[1]}
              r={3.5}
              fill="#202124"
              stroke="#fff"
              strokeWidth={1.5}
            />
            {orderedPolygons.map((plane) => {
              const centroid = plane.points.reduce(
                (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
                [0, 0],
              ).map((value) => value / plane.points.length);
              const screen = toScreen(centroid, scale, [0, 0]);
              const offset = PLANE_LABEL_OFFSETS[plane.index] || [0, 0];
              return (
                <g key={plane.index}>
                  <polygon
                    points={plane.points.map((point) => toScreen(point, scale, [0, 0]).join(',')).join(' ')}
                    fill={plane.color}
                    fillOpacity={0.28}
                    stroke={plane.color}
                    strokeWidth={2}
                  />
                  <text
                    x={clampLabel(screen[0] + offset[0], 24)}
                    y={clampLabel(screen[1] + offset[1], 20)}
                    className="mathmaster-threeplane-plane-label"
                    textAnchor="middle"
                  >
                    {'P' + String(plane.index + 1)}
                  </text>
                </g>
              );
            })}
            {intersectionLines.map((line) => (
              <line
                key={line.key}
                x1={toScreen(line.from, scale, [0, 0])[0]} y1={toScreen(line.from, scale, [0, 0])[1]}
                x2={toScreen(line.to, scale, [0, 0])[0]} y2={toScreen(line.to, scale, [0, 0])[1]}
                stroke="#202124" strokeWidth={2.5} strokeDasharray="6 4"
              />
            ))}
            {solutionMarker ? (
              <g>
                <circle cx={toScreen(solutionMarker, scale, [0, 0])[0]} cy={toScreen(solutionMarker, scale, [0, 0])[1]} r={6} fill="#202124" stroke="#fff" strokeWidth={2} />
                {/* The coordinates sit on the point itself, so the ordered
                    triple and the place in space are read together. */}
                <text
                  x={clampLabel(toScreen(solutionMarker, scale, [0, 0])[0] + 10, 40)}
                  y={clampLabel(toScreen(solutionMarker, scale, [0, 0])[1] - 10, 18)}
                  fontSize={15}
                  fontWeight={800}
                  fill="#202124"
                  stroke="#fff"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {orderedTripleText(shownSolution, variables)}
                </text>
              </g>
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
              <button type="button" onClick={() => { markInteracted(); setRevealed(true); }} className="mathmaster-reduction-carry" disabled={revealed}>
                {revealed ? 'Revealed' : revealLabel}
              </button>
            ) : null}
          </div>
          {showResult ? (
            <p className="mathmaster-reduction-ready-card" role="status">
              {/* The reveal marks the point; it does not also classify the
                  system. "The three planes meet at exactly one point" was the
                  answer to the very question beside it, nearly word for word
                  (CW3, PR4, DOL2 — #361). */}
              {earnedResult
                // An earned statement speaks of the student's own result — and
                // still names no plane relationship: which planes coincide or
                // are parallel is the student's next answer, not a caption (#392).
                // Where outcomes are withheld it names no outcome at all.
                ? earnedResultCaption({ type: shownType, solutionText: shownType === 'unique' ? orderedTripleText(shownSolution, variables) : '', showImmediateFeedback })
                : shownType === 'unique'
                  ? `Point marked on the model: ${orderedTripleText(shownSolution, variables)}.`
                  : shownType === 'none'
                    ? 'The three planes share no common point.'
                    : shownType === 'infinite'
                      ? 'The three planes share infinitely many points.'
                      : 'This system could not be classified.'}
            </p>
          ) : null}
        </div>
      </div>

      {answerFields.length ? (
        <Panel title="Interpret what you found">
          {answerFields.map((field) => (Array.isArray(field.options) && field.options.length ? (
            // A real choice group (#361). The options were link-styled
            // secondary buttons and the chosen one looked exactly like the
            // others — only aria-pressed changed — so a student could not see
            // what they were about to submit.
            <fieldset key={field.id} className="mathmaster-threeplane-choice-field">
              <legend>{field.label}</legend>
              <div className="mathmaster-threeplane-choices" role="radiogroup" aria-label={field.label}>
                {field.options.map((option) => {
                  const selected = responses[field.id] === option;
                  return (
                    <button
                      key={String(option)}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => fieldResponses(field.id, option)}
                      className={`mathmaster-threeplane-choice${selected ? ' is-selected' : ''}`}
                    >
                      <span className="mathmaster-threeplane-choice-mark" aria-hidden="true" />
                      <span>{String(option)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <label key={field.id} className="mathmaster-reduction-field" style={{ display: 'block', marginTop: 10 }}>
              {field.label}
              <MathInput
                value={responses[field.id] || ''}
                onChange={(value) => fieldResponses(field.id, value)}
                ariaLabel={field.label}
                toolProfile="algebra-operation"
              />
            </label>
          )))}
          <button type="button" onClick={check} style={{ marginTop: 14, padding: '11px 18px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44 }}>
            Check my answer
          </button>
          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              {!feedback.isCorrect ? (
                // A nudge toward the idea, never the option: "Not yet" alone
                // told a first-time 3D learner nothing about what to rethink.
                <p className="mathmaster-threeplane-feedback" role="status">
                  {spatialMisconceptionFeedback(answerFields, responses, feedback.metadata?.parts)}
                </p>
              ) : null}
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
