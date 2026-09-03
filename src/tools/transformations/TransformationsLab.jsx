import React, { useMemo, useState } from 'react';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { figureDismissalKey, shouldOpenFigureEnlarged } from '../../platform/student/figurePresentation.js';
import useViewportWidth from '../../platform/mobile/useViewportWidth.js';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { matchesNumericAnswer, parseNumericAnswer } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import {
  TRANSFORMATION_FAMILIES,
  TRANSFORMATION_FAMILY_LABELS,
  evaluateParentFunction,
  evaluateTransformedFunction,
  mapParentPoint,
  mappedPointIsCorrect,
  normalizeTransformationSpec,
  transformationDescriptor,
  transformationGraphScore,
  transformationParameterScore,
  transformedAnchor,
} from './transformationsMath';

const inputStyle = { width: '100%', padding: 9, marginTop: 5, border: '1px solid #cdd6e4', borderRadius: 8 };
const buttonStyle = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };

const MODE_TASKS = {'match': 'Change a, b, h and k until your graph sits exactly on the dashed target.', 'identify': 'Read the graph and recover the values of a, b, h and k that produced it.', 'pointMap': 'Send a point from the parent function through the transformation and give where it lands.', 'plotTransform': 'Transform the entire source graph by moving each defining point to its new location.', 'describe': 'Describe every change this graph makes to its parent function.', 'anchor': 'Find the coordinates of the transformed defining feature.'};
const MODE_STEPS = {'match': ['Change one parameter at a time and watch what moves.', 'Use h and k for position, then a and b for reflections/scales.', 'Press Check when the two graphs overlap.'], 'identify': ['Find the defining feature of the graph — that gives you h and k.', 'Use one or more additional points to recover a and b.', 'Enter all four, then check.'], 'pointMap': ['For x, undo the inside multiplier b, then apply h.', 'For y, apply a and then k exactly as written.', 'Enter the transformed coordinates.'], 'plotTransform': ['Map each corner/end point using x/b + h and ay + k.', 'Plot the transformed defining points on the grid.', 'Connect them in the same order as the source graph, then check.'], 'describe': ['Read the inside changes for x using opposite/reciprocal behavior.', 'Read the outside changes for y exactly as written.', 'Then account for h and k translations.'], 'anchor': ['Identify which feature defines this family.', 'Find it on the transformed graph.', 'Count gridlines across, then up or down.']};
const HINTS = {'match': ['Start with h and k to put the graph in the right place, then fix reflections/scales with a and b.', 'Use y = a·f(b(x − h)) + k. Inside changes control x; outside changes control y.', 'Remember the class rule: x\'s lie, y\'s tell the truth. For x, signs reverse and scale factors become reciprocals.'], 'identify': ['Find the defining feature first — the vertex, the corner, the endpoint. Its coordinates are (h, k).', 'Then compare another point. Outside a acts directly on y; inside b acts reciprocally on x.', 'Negative a reflects across the x-axis. Negative b reflects across the y-axis.'], 'pointMap': ['x and y are transformed by different parameters, so handle them separately.', 'For x, divide the parent x-coordinate by b, then add h.', 'For y, multiply by a first and then add k — y tells the truth.'], 'plotTransform': ['Move one defining point at a time instead of trying to redraw the whole graph at once.', 'For x, use opposite/reciprocal behavior; for y, use the outside transformation exactly as written.', 'The transformed graph keeps the same connections between corresponding defining points.'], 'describe': ['Compare the graph with the parent shape one feature at a time.', 'Outside a is direct: sign gives x-axis reflection and |a| is the vertical scale.', 'Inside b is opposite/reciprocal: sign gives y-axis reflection and the horizontal scale is 1/|b|.'], 'anchor': ['Every family is organized around one feature: a vertex, a corner, an endpoint, or an asymptote intersection.', 'On the parent function that feature sits at the origin. The transformation moves it to (h, k).', 'Count the gridlines rather than estimating — go across for x first, then up or down for y.']};

const pointCoordinates = (point) => (
  Array.isArray(point)
    ? [Number(point[0]), Number(point[1])]
    : [Number(point?.x), Number(point?.y)]
);

const parameterFields = (values, setters, keys) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 10 }}>
    {keys.map((key, index) => <label key={key}><strong>{key}</strong><input type="number" step="0.5" value={values[index]} onChange={(event) => setters[index](event.target.value)} style={inputStyle} /></label>)}
  </div>
);

export default function TransformationsLab({ questionData = {}, onAction }) {
  const viewportWidth = useViewportWidth();
  const mode = questionData.mode || 'match';
  const requestedFamily = questionData.family || questionData.function?.type || questionData.type;
  const family = TRANSFORMATION_FAMILIES.includes(requestedFamily) ? requestedFamily : 'quadratic';
  const targetSpec = normalizeTransformationSpec({ type: family, ...questionData.target }, family);
  const investigationSpec = normalizeTransformationSpec({ type: family, ...(questionData.function || questionData.target) }, family);
  const [a, setA] = useState(String(questionData.initial?.a ?? 1));
  const [b, setB] = useState(String(questionData.initial?.b ?? 1));
  const [h, setH] = useState(String(questionData.initial?.h ?? 0));
  const [k, setK] = useState(String(questionData.initial?.k ?? 0));
  const [mappedX, setMappedX] = useState('');
  const [mappedY, setMappedY] = useState('');
  const [anchorX, setAnchorX] = useState('');
  const [anchorY, setAnchorY] = useState('');
  const [reflection, setReflection] = useState('');
  const [scaleKind, setScaleKind] = useState('');
  const [scaleFactor, setScaleFactor] = useState('');
  const [horizontalReflection, setHorizontalReflection] = useState('');
  const [horizontalScaleKind, setHorizontalScaleKind] = useState('');
  const [horizontalScaleFactor, setHorizontalScaleFactor] = useState('');
  const [horizontalDirection, setHorizontalDirection] = useState('');
  const [horizontalDistance, setHorizontalDistance] = useState('');
  const [verticalDirection, setVerticalDirection] = useState('');
  const [verticalDistance, setVerticalDistance] = useState('');
  const [plottedPoints, setPlottedPoints] = useState([]);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const studentSpec = useMemo(() => normalizeTransformationSpec({ type: family, a, b, h, k, base: targetSpec.base }, family), [family, a, b, h, k, targetSpec.base]);
  const descriptor = transformationDescriptor(investigationSpec);
  const anchor = transformedAnchor(investigationSpec);
  const parentPoint = questionData.parentPoint || anchor.parentPoint;
  const expectedMappedPoint = mapParentPoint(parentPoint, investigationSpec);
  const sourcePoints = Array.isArray(questionData.sourcePoints) ? questionData.sourcePoints : [];
  const expectedTransformedPoints = sourcePoints.map((point) => mapParentPoint(point, investigationSpec)).filter(Boolean);
  const familyLabel = mode === 'plotTransform'
    ? (questionData.sourceLabel || 'General graph')
    : (TRANSFORMATION_FAMILY_LABELS[family] || family);
  const graphBounds = questionData.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 9 };
  const showB = questionData.includeHorizontalScale === true
    || questionData.target?.b != null
    || questionData.function?.b != null
    || questionData.initial?.b != null;
  const parameterKeys = showB ? ['a', 'b', 'h', 'k'] : ['a', 'h', 'k'];
  const parameterValues = showB ? [a, b, h, k] : [a, h, k];
  const parameterSetters = showB ? [setA, setB, setH, setK] : [setA, setH, setK];

  const checkParameters = (expected) => {
    const student = { a: Number(a), b: Number(b), h: Number(h), k: Number(k) };
    const result = mode === 'match'
      ? transformationGraphScore(studentSpec, expected, { xMin: graphBounds.xMin, xMax: graphBounds.xMax, tolerance: 0.02 })
      : transformationParameterScore(student, expected, 0.01);
    submit({ isCorrect: result.isCorrect, score: result.score }, student, { mode, family, graphEquivalent: mode === 'match' });
  };

  const checkPointMap = () => {
    const response = [parseNumericAnswer(mappedX), parseNumericAnswer(mappedY)];
    const bothEntered = response.every((value) => value != null);
    const checks = bothEntered && expectedMappedPoint
      ? [matchesNumericAnswer(mappedX, expectedMappedPoint[0], 0.01), matchesNumericAnswer(mappedY, expectedMappedPoint[1], 0.01)]
      : [false, false];
    submit(
      { isCorrect: bothEntered && mappedPointIsCorrect(response, parentPoint, investigationSpec, 0.01), score: checks.filter(Boolean).length / 2 },
      { parentPoint, mappedPoint: response },
      { mode, family, checks },
    );
  };

  const checkPlotTransform = () => {
    const expectedCount = expectedTransformedPoints.length;
    const matched = plottedPoints.reduce((count, point, index) => {
      const expected = expectedTransformedPoints[index];
      const correct = expected
        && Math.abs(Number(point?.[0]) - Number(expected?.[0])) <= 0.01
        && Math.abs(Number(point?.[1]) - Number(expected?.[1])) <= 0.01;
      return count + (correct ? 1 : 0);
    }, 0);
    const isCorrect = expectedCount > 0 && plottedPoints.length === expectedCount && matched === expectedCount;
    submit(
      { isCorrect, score: expectedCount ? matched / expectedCount : 0 },
      { sourcePoints, plottedPoints },
      { mode, family, matched, expectedCount },
    );
  };

  const checkDescription = () => {
    const checks = [
      reflection === (descriptor.reflection ? 'yes' : 'no'),
      scaleKind === descriptor.verticalScaleKind,
      matchesNumericAnswer(scaleFactor, descriptor.verticalScale, 0.01),
      horizontalReflection === (descriptor.horizontalReflection ? 'yes' : 'no'),
      horizontalScaleKind === descriptor.horizontalScaleKind,
      matchesNumericAnswer(horizontalScaleFactor, descriptor.horizontalScale, 0.01),
      horizontalDirection === descriptor.horizontalDirection,
      matchesNumericAnswer(horizontalDistance, descriptor.horizontalDistance, 0.01),
      verticalDirection === descriptor.verticalDirection,
      matchesNumericAnswer(verticalDistance, descriptor.verticalDistance, 0.01),
    ];
    submit(
      { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length },
      { reflection, scaleKind, scaleFactor: parseNumericAnswer(scaleFactor), horizontalReflection, horizontalScaleKind, horizontalScaleFactor: parseNumericAnswer(horizontalScaleFactor), horizontalDirection, horizontalDistance: parseNumericAnswer(horizontalDistance), verticalDirection, verticalDistance: parseNumericAnswer(verticalDistance) },
      { mode, family, checks },
    );
  };

  const checkAnchor = () => {
    const checks = [matchesNumericAnswer(anchorX, anchor.point[0], 0.01), matchesNumericAnswer(anchorY, anchor.point[1], 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { x: parseNumericAnswer(anchorX), y: parseNumericAnswer(anchorY), feature: anchor.label }, { mode, family, checks });
  };

  const graph = (functions, points = []) => <CoordinatePlane {...graphBounds} functions={functions} points={points} />;
  const feedbackMessage = () => {
    if (feedback.isCorrect) return 'Correct — every transformation feature matches.';
    if (mode === 'pointMap') {
      const checks = feedback.metadata?.checks || [];
      if (checks[0] && !checks[1]) return 'The x-coordinate is right. The y-coordinate is not: a scales the height and k shifts it, so apply both.';
      if (!checks[0] && checks[1]) return 'The y-coordinate is right. The x-coordinate is not: only h moves a point horizontally.';
      return `Map the point one coordinate at a time. Start from (${parentPoint[0]}, ${parentPoint[1]}) and apply h to x, then a and k to y.`;
    }
    if (mode === 'plotTransform') {
      const matched = Number(feedback.metadata?.matched || 0);
      const expectedCount = Number(feedback.metadata?.expectedCount || expectedTransformedPoints.length || 0);
      return `${matched} of ${expectedCount} defining points are in the correct transformed locations. Use x/b + h for x and ay + k for y.`;
    }
    if (mode === 'anchor') {
      const checks = feedback.metadata?.checks || [];
      if (checks.filter(Boolean).length === 1) return `One coordinate of the ${anchor.label} is right. Check the other — h moves it sideways and k moves it up or down.`;
      return `Locate the ${anchor.label} on the graph and count gridlines: across for x first, then up or down for y.`;
    }
    if (mode === 'describe') return 'At least one description is off. Use “x\'s lie, y\'s tell the truth”: a acts directly on y; b acts oppositely/reciprocally on x; h and k give the translations.';
    return 'Compare one parameter at a time. Change only a, then b, then h, then k, and watch what each one changes.';
  };
  const feedbackBlock = feedback ? <div style={{ marginTop: 14 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{feedbackMessage()}</p></div> : null;
  const resetFeedback = () => clearFeedback();

  return <ToolShell title="Transformations Lab" subtitle="Connect parameters, parent points, defining features, and transformed graphs across function families." badge={familyLabel}>
    <TaskCard question={questionData} task={MODE_TASKS[mode] || MODE_TASKS.match} steps={MODE_STEPS[mode] || MODE_STEPS.match} />
    <EnlargeableFigure
        label="Transformation workspace"
        enlargeLabel="Enlarge workspace"
        taskText={questionData.prompt || questionData.task || ''}
        style={{ width: '100%' }}
        openEnlarged={shouldOpenFigureEnlarged({ toolId: 'transformations', question: questionData || {}, viewportWidth })}
        dismissKey={figureDismissalKey(questionData || {}, 'transformations')}
      >
    <ToolSplit>
      <Panel title={familyLabel + ' transformation'}>
        {mode === 'match' ? <>
          <p style={{ marginTop: 0 }}>Adjust <strong>{parameterKeys.join(', ')}</strong> until your solid blue graph lands exactly on the dashed red target.</p>
          {parameterFields(parameterValues, parameterSetters, parameterKeys)}
          <div style={{ marginTop: 14 }}>{graph([x => evaluateTransformedFunction(studentSpec, x), x => evaluateTransformedFunction(targetSpec, x)])}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: '#3c4756' }}>
            <span><svg width="26" height="8" style={{ verticalAlign: 'middle', marginRight: 5 }} aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="#1a73e8" strokeWidth="3" /></svg><strong>Your graph</strong> — solid blue</span>
            <span><svg width="26" height="8" style={{ verticalAlign: 'middle', marginRight: 5 }} aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="#d93025" strokeWidth="3" strokeDasharray="8 5" /></svg><strong>Target</strong> — dashed red</span>
          </div>
          <button type="button" onClick={() => checkParameters(targetSpec)} style={{ ...buttonStyle, marginTop: 12 }}>Check transformation</button>
        </> : null}

        {mode === 'identify' ? <>
          <p>Read the transformed graph and recover its <strong>{parameterKeys.join(', ')}</strong> parameters.</p>
          {graph([x => evaluateTransformedFunction(investigationSpec, x)])}
          <div style={{ marginTop: 14 }}>{parameterFields(parameterValues, parameterSetters, parameterKeys)}</div>
          <button type="button" onClick={() => checkParameters(investigationSpec)} style={{ ...buttonStyle, marginTop: 12 }}>Check parameters</button>
        </> : null}

        {mode === 'pointMap' ? <>
          <p>Map the parent-function point <strong>({parentPoint[0]}, {parentPoint[1]})</strong> through the transformation.</p>
          {graph([x => evaluateParentFunction(family, x, investigationSpec.base), x => evaluateTransformedFunction(investigationSpec, x)], [{ x: parentPoint[0], y: parentPoint[1], label: 'parent' }])}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}><label>Transformed x<input type="number" value={mappedX} onChange={(event) => { setMappedX(event.target.value); resetFeedback(); }} style={inputStyle} /></label><label>Transformed y<input type="number" value={mappedY} onChange={(event) => { setMappedY(event.target.value); resetFeedback(); }} style={inputStyle} /></label></div>
          <button type="button" onClick={checkPointMap} style={{ ...buttonStyle, marginTop: 12 }}>Check mapped point</button>
        </> : null}

        {mode === 'plotTransform' ? <>
          <p style={{ marginTop: 0 }}>Map <strong>S1 → P1, S2 → P2</strong>, and so on. Plot the transformed defining points in source order; the source graph stays visible while you work.</p>
          <CoordinatePlane
            {...graphBounds}
            snapStep={questionData.snapStep || 1}
            onPlot={(point) => {
              if (plottedPoints.length >= expectedTransformedPoints.length) return;
              setPlottedPoints((current) => [...current, point]);
              resetFeedback();
            }}
            polylines={[
              { points: sourcePoints, stroke: '#5f6b7a', strokeWidth: 3 },
              { points: plottedPoints, stroke: '#1a73e8', strokeWidth: 3 },
            ]}
            points={[
              ...sourcePoints.map((point, index) => {
                const [x, y] = pointCoordinates(point);
                return { x, y, label: `S${index + 1}`, fill: '#5f6b7a' };
              }),
              ...plottedPoints.map((point, index) => ({ x: point[0], y: point[1], label: `P${index + 1}` })),
            ]}
            cursorLabel="Transformed point"
            ariaLabel="Source graph and transformed-point plotting grid"
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={() => { setPlottedPoints((current) => current.slice(0, -1)); resetFeedback(); }} disabled={!plottedPoints.length} style={{ ...buttonStyle, background: '#fff', color: '#174ea6', border: '1px solid #aecbfa' }}>Undo point</button>
            <button type="button" onClick={() => { setPlottedPoints([]); resetFeedback(); }} disabled={!plottedPoints.length} style={{ ...buttonStyle, background: '#fff', color: '#5f6368', border: '1px solid #dadce0' }}>Clear</button>
            <button type="button" onClick={checkPlotTransform} disabled={!expectedTransformedPoints.length || plottedPoints.length !== expectedTransformedPoints.length} style={{ ...buttonStyle, opacity: !expectedTransformedPoints.length || plottedPoints.length !== expectedTransformedPoints.length ? 0.55 : 1 }}>Check graph</button>
          </div>
          <p style={{ marginBottom: 0, color: '#5f6b7a', fontSize: 13 }}>{plottedPoints.length} of {expectedTransformedPoints.length} defining points plotted.</p>
        </> : null}

        {mode === 'describe' ? <>
          {graph([x => evaluateTransformedFunction(investigationSpec, x)])}
          <p style={{ color: '#5f6b7a' }}>Describe what changed from the parent function.</p>
          <label style={{ display: 'block', marginTop: 10 }}>Reflection across the x-axis?<select value={reflection} onChange={(event) => setReflection(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Vertical scale<select value={scaleKind} onChange={(event) => setScaleKind(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="stretch">Stretch</option><option value="compression">Compression</option><option value="unchanged">Unchanged</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Vertical scale factor |a|<input type="number" step="0.1" min="0" value={scaleFactor} onChange={(event) => setScaleFactor(event.target.value)} style={inputStyle} placeholder="factor" /></label>
          <label style={{ display: 'block', marginTop: 10 }}>Reflection across the y-axis?<select value={horizontalReflection} onChange={(event) => setHorizontalReflection(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Horizontal scale<select value={horizontalScaleKind} onChange={(event) => setHorizontalScaleKind(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="stretch">Stretch</option><option value="compression">Compression</option><option value="unchanged">Unchanged</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Horizontal scale factor 1/|b|<input type="number" step="0.1" min="0" value={horizontalScaleFactor} onChange={(event) => setHorizontalScaleFactor(event.target.value)} style={inputStyle} placeholder="factor" /></label>
          <label style={{ display: 'block', marginTop: 10 }}>Horizontal translation<select value={horizontalDirection} onChange={(event) => setHorizontalDirection(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="left">Left</option><option value="right">Right</option><option value="none">None</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Horizontal shift (units)<input type="number" step="0.5" min="0" value={horizontalDistance} onChange={(event) => setHorizontalDistance(event.target.value)} style={inputStyle} placeholder="0 if none" /></label>
          <label style={{ display: 'block', marginTop: 10 }}>Vertical translation<select value={verticalDirection} onChange={(event) => setVerticalDirection(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="up">Up</option><option value="down">Down</option><option value="none">None</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Vertical shift (units)<input type="number" step="0.5" min="0" value={verticalDistance} onChange={(event) => setVerticalDistance(event.target.value)} style={inputStyle} placeholder="0 if none" /></label>
          <button type="button" onClick={checkDescription} style={{ ...buttonStyle, marginTop: 12 }}>Check description</button>
        </> : null}

        {mode === 'anchor' ? <>
          {graph([x => evaluateTransformedFunction(investigationSpec, x)])}
          <p>Identify the transformed <strong>{anchor.label}</strong>{anchor.isOnGraph ? '.' : '. This is structural and is not a point on the rational graph.'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>x-coordinate<input type="number" value={anchorX} onChange={(event) => setAnchorX(event.target.value)} style={inputStyle} /></label><label>y-coordinate<input type="number" value={anchorY} onChange={(event) => setAnchorY(event.target.value)} style={inputStyle} /></label></div>
          <button type="button" onClick={checkAnchor} style={{ ...buttonStyle, marginTop: 12 }}>Check defining feature</button>
        </> : null}
        {feedbackBlock}
        <HintPanel hints={HINTS[mode] || HINTS.match} onHintUsed={() => onAction?.('HINT_USED')} />
      </Panel>

      <Panel title="Transformation bridge" collapsible>
        <p style={{ marginTop: 0 }}><strong>Model:</strong> y = a · f(b(x − h)) + k</p>
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eef4ff', border: '1px solid #aecbfa', color: '#174ea6', fontWeight: 900, marginBottom: 12 }}>
          X&apos;s lie; Y&apos;s tell the truth.
        </div>
        <ul style={{ lineHeight: 1.8, paddingLeft: 20 }}>
          <li><strong>Y / outside:</strong> a acts exactly as written — negative reflects across the x-axis; |a| is the vertical scale.</li>
          <li><strong>X / inside:</strong> b acts oppositely — negative reflects across the y-axis; the horizontal scale is 1/|b|.</li>
          <li><strong>h</strong> shifts horizontally with the opposite-looking sign inside the function.</li>
          <li><strong>k</strong> shifts vertically exactly as written.</li>
          <li>A parent point (x, y) maps to <strong>(x/b + h, ay + k)</strong>.</li>
        </ul>
        <p style={{ color: '#5f6b7a', marginBottom: 0 }}>This same bridge works for linear, quadratic, absolute value, cubic, root, exponential, logarithmic, and reciprocal families.</p>
      </Panel>
    </ToolSplit>
    </EnlargeableFigure>
  </ToolShell>;
}
