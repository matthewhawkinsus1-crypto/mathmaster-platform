import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { nearlyEqual } from '../shared/toolMath';
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
const buttonStyle = { padding: '10px 16px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800, cursor: 'pointer' };

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
  const [horizontalDirection, setHorizontalDirection] = useState('');
  const [verticalDirection, setVerticalDirection] = useState('');
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
    const response = [Number(mappedX), Number(mappedY)];
    const checks = expectedMappedPoint ? [nearlyEqual(response[0], expectedMappedPoint[0], 0.01), nearlyEqual(response[1], expectedMappedPoint[1], 0.01)] : [false, false];
    submit({ isCorrect: mappedPointIsCorrect(response, parentPoint, investigationSpec, 0.01), score: checks.filter(Boolean).length / 2 }, { parentPoint, mappedPoint: response }, { mode, family });
  };

  const checkDescription = () => {
    const checks = [
      reflection === (descriptor.reflection ? 'yes' : 'no'),
      scaleKind === descriptor.verticalScaleKind,
      horizontalDirection === descriptor.horizontalDirection,
      verticalDirection === descriptor.verticalDirection,
    ];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { reflection, scaleKind, horizontalDirection, verticalDirection }, { mode, family });
  };

  const checkAnchor = () => {
    const checks = [nearlyEqual(Number(anchorX), anchor.point[0], 0.01), nearlyEqual(Number(anchorY), anchor.point[1], 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { x: Number(anchorX), y: Number(anchorY), feature: anchor.label }, { mode, family });
  };

  const graph = (functions, points = []) => <CoordinatePlane {...graphBounds} functions={functions} points={points} />;
  const feedbackBlock = feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Transformation reasoning is correct.' : 'Compare each transformation feature separately, then try again.'}</ResultPill></div> : null;
  const resetFeedback = () => clearFeedback();

  return <ToolShell title="Transformations Lab v2" subtitle="Connect parameters, parent points, defining features, and transformed graphs across function families." badge="Batch D · Algebra I / II">
    <ToolGrid min={330}>
      <Panel title={familyLabel + ' transformation'}>
        {mode === 'match' ? <>
          <p><strong>Goal:</strong> match the red target with the blue graph.</p>
          {parameterFields([a, h, k], [setA, setH, setK])}
          <div style={{ marginTop: 14 }}>{graph([x => evaluateTransformedFunction(studentSpec, x), x => evaluateTransformedFunction(targetSpec, x)])}</div>
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
          <label style={{ display: 'block', marginTop: 10 }}>Horizontal translation<select value={horizontalDirection} onChange={(event) => setHorizontalDirection(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="left">Left</option><option value="right">Right</option><option value="none">None</option></select></label>
          <label style={{ display: 'block', marginTop: 10 }}>Vertical translation<select value={verticalDirection} onChange={(event) => setVerticalDirection(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="up">Up</option><option value="down">Down</option><option value="none">None</option></select></label>
          <button type="button" onClick={checkDescription} style={{ ...buttonStyle, marginTop: 12 }}>Check description</button>
        </> : null}

        {mode === 'anchor' ? <>
          {graph([x => evaluateTransformedFunction(investigationSpec, x)])}
          <p>Identify the transformed <strong>{anchor.label}</strong>{anchor.isOnGraph ? '.' : '. This is structural and is not a point on the rational graph.'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>x-coordinate<input type="number" value={anchorX} onChange={(event) => setAnchorX(event.target.value)} style={inputStyle} /></label><label>y-coordinate<input type="number" value={anchorY} onChange={(event) => setAnchorY(event.target.value)} style={inputStyle} /></label></div>
          <button type="button" onClick={checkAnchor} style={{ ...buttonStyle, marginTop: 12 }}>Check defining feature</button>
        </> : null}
        {feedbackBlock}
      </Panel>

      <Panel title="Transformation bridge">
        <p style={{ marginTop: 0 }}><strong>Model:</strong> y = a · f(x − h) + k</p>
        <ul style={{ lineHeight: 1.8, paddingLeft: 20 }}><li><strong>a</strong> controls reflection and vertical scale.</li><li><strong>h</strong> shifts the parent horizontally.</li><li><strong>k</strong> shifts it vertically.</li><li>A parent point (x, y) maps to <strong>(x + h, ay + k)</strong>.</li></ul>
        <p style={{ color: '#5f6b7a', marginBottom: 0 }}>The same engine supports linear, quadratic, absolute value, cubic, cube root, square-root, exponential, logarithmic, and rational families.</p>
      </Panel>
    </ToolGrid>
  </ToolShell>;
}
