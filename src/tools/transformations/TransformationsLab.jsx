import React, { useMemo, useState } from 'react';
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
  transformationParameterScore,
  transformedAnchor,
} from './transformationsMath';

const inputStyle = { width: '100%', padding: 9, marginTop: 5, border: '1px solid #cdd6e4', borderRadius: 8 };
const buttonStyle = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };

const MODE_TASKS = {'match': 'Change a, h and k until your graph sits exactly on the dashed target.', 'identify': 'Read the graph and recover the values of a, h and k that produced it.', 'pointMap': 'Send a point from the parent function through the transformation and give where it lands.', 'describe': 'Describe every change this graph makes to its parent function.', 'anchor': 'Find the coordinates of the transformed defining feature.'};
const MODE_STEPS = {'match': ['Change one parameter at a time and watch what moves.', 'Get the position right with h and k, then the shape with a.', 'Press Check when the two graphs overlap.'], 'identify': ['Find the defining feature of the graph — that gives you h and k.', 'Use a second point to work out a.', 'Enter all three, then check.'], 'pointMap': ['Apply h to the x-coordinate.', 'Apply a and then k to the y-coordinate.', 'Enter the transformed coordinates.'], 'describe': ['Look at the sign of a for a reflection.', 'Look at the size of a for a stretch or compression.', 'Look at h and k for the two translations.'], 'anchor': ['Identify which feature defines this family.', 'Find it on the transformed graph.', 'Count gridlines across, then up or down.']};
const HINTS = {'match': ['Start with h and k to put the graph in the right place, then fix its shape with a.', 'y = a·f(x − h) + k. Changing h moves the graph horizontally — and a positive h moves it right, which surprises most people.', 'If your graph is the right shape but in the wrong place, only h and k need changing. If it is in the right place but too narrow or flipped, only a does.'], 'identify': ['Find the defining feature first — the vertex, the corner, the endpoint. Its coordinates are (h, k).', 'Once you know h and k, pick any other clear point on the graph and work backwards to find a.', 'If the graph opens downward or is reflected, a is negative. If it is narrower than the parent, |a| > 1.'], 'pointMap': ['x and y are transformed by different parameters, so handle them separately.', 'Only h affects x: the new x is the old x plus h.', 'For y, multiply by a first and then add k — the order matters.'], 'describe': ['Compare the graph with the parent shape one feature at a time.', 'A negative a flips the graph over the x-axis. |a| > 1 stretches it vertically; |a| < 1 compresses it.', 'h moves the graph horizontally and k moves it vertically — a positive h moves it right, a positive k moves it up.'], 'anchor': ['Every family is organized around one feature: a vertex, a corner, an endpoint, or an asymptote intersection.', 'On the parent function that feature sits at the origin. The transformation moves it to (h, k).', 'Count the gridlines rather than estimating — go across for x first, then up or down for y.']};

const parameterFields = (values, setters) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
    {['a', 'h', 'k'].map((key, index) => <label key={key}><strong>{key}</strong><input type="number" step="0.5" value={values[index]} onChange={(event) => setters[index](event.target.value)} style={inputStyle} /></label>)}
  </div>
);

export default function TransformationsLab({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'match';
  const requestedFamily = questionData.family || questionData.function?.type || questionData.type;
  const family = TRANSFORMATION_FAMILIES.includes(requestedFamily) ? requestedFamily : 'quadratic';
  const targetSpec = normalizeTransformationSpec({ type: family, ...questionData.target }, family);
  const investigationSpec = normalizeTransformationSpec({ type: family, ...(questionData.function || questionData.target) }, family);
  const [a, setA] = useState(String(questionData.initial?.a ?? 1));
  const [h, setH] = useState(String(questionData.initial?.h ?? 0));
  const [k, setK] = useState(String(questionData.initial?.k ?? 0));
  const [mappedX, setMappedX] = useState('');
  const [mappedY, setMappedY] = useState('');
  const [anchorX, setAnchorX] = useState('');
  const [anchorY, setAnchorY] = useState('');
  const [reflection, setReflection] = useState('');
  const [scaleKind, setScaleKind] = useState('');
  const [scaleFactor, setScaleFactor] = useState('');
  const [horizontalDirection, setHorizontalDirection] = useState('');
  const [horizontalDistance, setHorizontalDistance] = useState('');
  const [verticalDirection, setVerticalDirection] = useState('');
  const [verticalDistance, setVerticalDistance] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const studentSpec = useMemo(() => normalizeTransformationSpec({ type: family, a, h, k, base: targetSpec.base }, family), [family, a, h, k, targetSpec.base]);
  const descriptor = transformationDescriptor(investigationSpec);
  const anchor = transformedAnchor(investigationSpec);
  const parentPoint = questionData.parentPoint || anchor.parentPoint;
  const expectedMappedPoint = mapParentPoint(parentPoint, investigationSpec);
  const familyLabel = TRANSFORMATION_FAMILY_LABELS[family] || family;
  const graphBounds = questionData.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 9 };

  const checkParameters = (expected) => {
    const result = transformationParameterScore({ a: Number(a), h: Number(h), k: Number(k) }, expected, 0.01);
    submit({ isCorrect: result.isCorrect, score: result.score }, { a: Number(a), h: Number(h), k: Number(k) }, { mode, family });
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

  const checkDescription = () => {
    const checks = [
      reflection === (descriptor.reflection ? 'yes' : 'no'),
      scaleKind === descriptor.verticalScaleKind,
      matchesNumericAnswer(scaleFactor, descriptor.verticalScale, 0.01),
      horizontalDirection === descriptor.horizontalDirection,
      matchesNumericAnswer(horizontalDistance, descriptor.horizontalDistance, 0.01),
      verticalDirection === descriptor.verticalDirection,
      matchesNumericAnswer(verticalDistance, descriptor.verticalDistance, 0.01),
    ];
    submit(
      { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length },
      { reflection, scaleKind, scaleFactor: parseNumericAnswer(scaleFactor), horizontalDirection, horizontalDistance: parseNumericAnswer(horizontalDistance), verticalDirection, verticalDistance: parseNumericAnswer(verticalDistance) },
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
    if (mode === 'anchor') {
      const checks = feedback.metadata?.checks || [];
      if (checks.filter(Boolean).length === 1) return `One coordinate of the ${anchor.label} is right. Check the other — h moves it sideways and k moves it up or down.`;
      return `Locate the ${anchor.label} on the graph and count gridlines: across for x first, then up or down for y.`;
    }
    if (mode === 'describe') return 'At least one description is off. Check both the direction and the amount: the sign of a controls reflection, |a| is the vertical scale factor, |h| is the horizontal shift, and |k| is the vertical shift.';
    return 'Compare one parameter at a time. Change only a, see what moves, then only h, then only k.';
  };
  const feedbackBlock = feedback ? <div style={{ marginTop: 14 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{feedbackMessage()}</p></div> : null;
  const resetFeedback = () => clearFeedback();

  return <ToolShell title="Transformations Lab" subtitle="Connect parameters, parent points, defining features, and transformed graphs across function families." badge={familyLabel}>
    <TaskCard question={questionData} task={MODE_TASKS[mode] || MODE_TASKS.match} steps={MODE_STEPS[mode] || MODE_STEPS.match} />
    <ToolSplit>
      <Panel title={familyLabel + ' transformation'}>
        {mode === 'match' ? <>
          <p style={{ marginTop: 0 }}>Adjust <strong>a</strong>, <strong>h</strong> and <strong>k</strong> until your solid blue graph lands exactly on the dashed red target.</p>
          {parameterFields([a, h, k], [setA, setH, setK])}
          <div style={{ marginTop: 14 }}>{graph([x => evaluateTransformedFunction(studentSpec, x), x => evaluateTransformedFunction(targetSpec, x)])}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: '#3c4756' }}>
            <span><svg width="26" height="8" style={{ verticalAlign: 'middle', marginRight: 5 }} aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="#1a73e8" strokeWidth="3" /></svg><strong>Your graph</strong> — solid blue</span>
            <span><svg width="26" height="8" style={{ verticalAlign: 'middle', marginRight: 5 }} aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke="#d93025" strokeWidth="3" strokeDasharray="8 5" /></svg><strong>Target</strong> — dashed red</span>
          </div>
          <button type="button" onClick={() => checkParameters(targetSpec)} style={{ ...buttonStyle, marginTop: 12 }}>Check transformation</button>
        </> : null}

        {mode === 'identify' ? <>
          <p>Read the transformed graph and recover its <strong>a, h, k</strong> parameters.</p>
          {graph([x => evaluateTransformedFunction(investigationSpec, x)])}
          <div style={{ marginTop: 14 }}>{parameterFields([a, h, k], [setA, setH, setK])}</div>
          <button type="button" onClick={() => checkParameters(investigationSpec)} style={{ ...buttonStyle, marginTop: 12 }}>Check parameters</button>
        </> : null}

        {mode === 'pointMap' ? <>
          <p>Map the parent-function point <strong>({parentPoint[0]}, {parentPoint[1]})</strong> through the transformation.</p>
          {graph([x => evaluateParentFunction(family, x, investigationSpec.base), x => evaluateTransformedFunction(investigationSpec, x)], [{ 0: parentPoint[0], 1: parentPoint[1], label: 'parent' }])}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}><label>Transformed x<input type="number" value={mappedX} onChange={(event) => { setMappedX(event.target.value); resetFeedback(); }} style={inputStyle} /></label><label>Transformed y<input type="number" value={mappedY} onChange={(event) => { setMappedY(event.target.value); resetFeedback(); }} style={inputStyle} /></label></div>
          <button type="button" onClick={checkPointMap} style={{ ...buttonStyle, marginTop: 12 }}>Check mapped point</button>
        </> : null}

        {mode === 'describe' ? <>
          {graph([x => evaluateTransformedFunction(investigationSpec, x)])}
          <p style={{ color: '#5f6b7a' }}>Describe what changed from the parent function.</p>
          <label style={{ display: 'block', marginTop: 10 }}>Reflection across the x-axis?<select value={reflection} onChange={(event) => setReflection(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Vertical scale<select value={scaleKind} onChange={(event) => setScaleKind(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="stretch">Stretch</option><option value="compression">Compression</option><option value="unchanged">Unchanged</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Vertical scale factor |a|<input type="number" step="0.1" min="0" value={scaleFactor} onChange={(event) => setScaleFactor(event.target.value)} style={inputStyle} placeholder="factor" /></label>
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

      <Panel title="Transformation bridge">
        <p style={{ marginTop: 0 }}><strong>Model:</strong> y = a · f(x − h) + k</p>
        <ul style={{ lineHeight: 1.8, paddingLeft: 20 }}><li><strong>a</strong> controls reflection and vertical scale.</li><li><strong>h</strong> shifts the parent horizontally.</li><li><strong>k</strong> shifts it vertically.</li><li>A parent point (x, y) maps to <strong>(x + h, ay + k)</strong>.</li></ul>
        <p style={{ color: '#5f6b7a', marginBottom: 0 }}>These same three parameters work the same way for every function family, so once you can read them on a parabola you can read them anywhere.</p>
      </Panel>
    </ToolSplit>
  </ToolShell>;
}
