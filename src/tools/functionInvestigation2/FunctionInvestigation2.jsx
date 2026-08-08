import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { evaluateFunctionSpec, nearlyEqual } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import {
  FUNCTION_FAMILY_LABELS,
  behaviorForSpec,
  behaviorLabel,
  compareFunctionValues,
  domainRangeForSpec,
  interceptsForSpec,
  investigationFeatures,
  normalizeInvestigationSpec,
  numericSetsMatch,
  parseNumericList,
  relationLabel,
} from './functionInvestigationMath';

const inputStyle = { display: 'block', width: '100%', padding: 9, marginTop: 5, border: '1px solid #cdd6e4', borderRadius: 8 };
const buttonStyle = { padding: '10px 16px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
const domainChoices = ['allReal', 'xGteH', 'xGtH', 'xNotH'];
const rangeChoices = ['allReal', 'yGteK', 'yLteK', 'yGtK', 'yLtK', 'yNotK'];
const behaviorChoices = ['minimum', 'maximum', 'increasing', 'decreasing', 'increasingBranches', 'decreasingBranches'];

export default function FunctionInvestigation2({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'features';
  const spec = normalizeInvestigationSpec({ type: 'rational', a: 2, h: 1, k: -2, ...questionData.function });
  const features = investigationFeatures(spec);
  const domainRange = domainRangeForSpec(spec);
  const intercepts = interceptsForSpec(spec);
  const [anchorX, setAnchorX] = useState('');
  const [anchorY, setAnchorY] = useState('');
  const [verticalAsymptote, setVerticalAsymptote] = useState('');
  const [horizontalAsymptote, setHorizontalAsymptote] = useState('');
  const [domainCode, setDomainCode] = useState('');
  const [rangeCode, setRangeCode] = useState('');
  const [xIntercepts, setXIntercepts] = useState('');
  const [yIntercept, setYIntercept] = useState('');
  const [behavior, setBehavior] = useState('');
  const [comparison, setComparison] = useState('');
  const { feedback, submit } = useToolSubmission(onAction);
  const graphBounds = questionData.graphBounds || { xMin: -7, xMax: 9, yMin: -9, yMax: 9 };
  const fn = useMemo(() => x => evaluateFunctionSpec(spec, x), [spec.type, spec.a, spec.h, spec.k, spec.base]);
  const compareLeft = normalizeInvestigationSpec(questionData.left || { type: 'linear', a: 1, h: 0, k: 0 });
  const compareRight = normalizeInvestigationSpec(questionData.right || { type: 'quadratic', a: 1, h: 0, k: 0 });
  const compareX = Number(questionData.x ?? 2);
  const comparisonResult = compareFunctionValues(compareLeft, compareRight, compareX);

  const checkFeatures = () => {
    const checks = [nearlyEqual(Number(anchorX), features.anchor.point[0], 0.01), nearlyEqual(Number(anchorY), features.anchor.point[1], 0.01)];
    if (features.verticalAsymptotes.length) checks.push(nearlyEqual(Number(verticalAsymptote), features.verticalAsymptotes[0], 0.01));
    if (features.horizontalAsymptotes.length) checks.push(nearlyEqual(Number(horizontalAsymptote), features.horizontalAsymptotes[0], 0.01));
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { anchor: [Number(anchorX), Number(anchorY)], verticalAsymptote, horizontalAsymptote }, { mode, family: spec.type, featureLabel: features.anchor.label, anchorIsOnGraph: features.anchor.isOnGraph });
  };

  const checkDomainRange = () => {
    const checks = [domainCode === domainRange.domainCode, rangeCode === domainRange.rangeCode];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { domainCode, rangeCode }, { mode, family: spec.type });
  };

  const checkIntercepts = () => {
    const parsedX = parseNumericList(xIntercepts);
    const parsedY = parseNumericList(yIntercept);
    const expectedY = intercepts.y == null ? [] : [intercepts.y];
    const checks = [numericSetsMatch(parsedX, intercepts.x, 0.01), numericSetsMatch(parsedY, expectedY, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { xIntercepts: parsedX, yIntercept: parsedY }, { mode, family: spec.type });
  };

  const checkBehavior = () => {
    const expected = behaviorForSpec(spec);
    const ok = behavior === expected;
    submit({ isCorrect: ok, score: ok ? 1 : 0 }, { behavior }, { mode, family: spec.type });
  };

  const checkComparison = () => {
    const ok = comparison === comparisonResult.relation;
    submit({ isCorrect: ok, score: ok ? 1 : 0 }, { comparison }, { mode, x: compareX, leftValue: comparisonResult.leftValue, rightValue: comparisonResult.rightValue });
  };

  const featurePrompt = features.anchor.isOnGraph ? 'Defining graph feature' : 'Structural center (not a graph point)';

  return <ToolShell title="Function Investigation 2.0" subtitle="Investigate each family using the features that actually define that function—not a fixed point position." badge="Batch D · Core upgrade">
    <ToolGrid min={330}>
      <Panel title="Function evidence">
        {mode === 'compare' ? <CoordinatePlane {...graphBounds} functions={[x => evaluateFunctionSpec(compareLeft, x), x => evaluateFunctionSpec(compareRight, x)]} verticalLines={[compareX]} /> : <CoordinatePlane {...graphBounds} functions={[fn]} verticalLines={features.verticalAsymptotes} horizontalLines={features.horizontalAsymptotes} />}
        <p><strong>Family:</strong> {mode === 'compare' ? 'Compare two functions' : FUNCTION_FAMILY_LABELS[spec.type]}</p>
        {mode !== 'compare' ? <p style={{ color: '#5f6b7a', marginBottom: 0 }}>{features.anchor.label === 'asymptote intersection' ? 'The asymptote intersection organizes the rational branches but is not a plotted function point.' : 'The defining feature is derived from this function family and its parameters.'}</p> : <p style={{ color: '#5f6b7a', marginBottom: 0 }}>The dashed vertical line marks x = {compareX}. Compare the two function values at that same input.</p>}
      </Panel>

      <Panel title={mode === 'features' ? 'Feature analysis' : mode === 'domainRange' ? 'Domain and range' : mode === 'intercepts' ? 'Intercept analysis' : mode === 'behavior' ? 'Behavior analysis' : 'Same-input comparison'}>
        {mode === 'features' ? <>
          <p><strong>{featurePrompt}:</strong> {features.anchor.label}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>x-coordinate<input type="number" value={anchorX} onChange={(event) => setAnchorX(event.target.value)} style={inputStyle} /></label><label>y-coordinate<input type="number" value={anchorY} onChange={(event) => setAnchorY(event.target.value)} style={inputStyle} /></label></div>
          {features.verticalAsymptotes.length ? <label style={{ display: 'block', marginTop: 10 }}>Vertical asymptote x =<input type="number" value={verticalAsymptote} onChange={(event) => setVerticalAsymptote(event.target.value)} style={inputStyle} /></label> : null}
          {features.horizontalAsymptotes.length ? <label style={{ display: 'block', marginTop: 10 }}>Horizontal asymptote y =<input type="number" value={horizontalAsymptote} onChange={(event) => setHorizontalAsymptote(event.target.value)} style={inputStyle} /></label> : null}
          <button type="button" onClick={checkFeatures} style={{ ...buttonStyle, marginTop: 12 }}>Check features</button>
        </> : null}

        {mode === 'domainRange' ? <>
          <label>Domain<select value={domainCode} onChange={(event) => setDomainCode(event.target.value)} style={inputStyle}><option value="">Choose…</option>{domainChoices.map((code) => <option value={code} key={code}>{relationLabel(code, spec)}</option>)}</select></label>
          <label style={{ display: 'block', marginTop: 12 }}>Range<select value={rangeCode} onChange={(event) => setRangeCode(event.target.value)} style={inputStyle}><option value="">Choose…</option>{rangeChoices.map((code) => <option value={code} key={code}>{relationLabel(code, spec)}</option>)}</select></label>
          <button type="button" onClick={checkDomainRange} style={{ ...buttonStyle, marginTop: 12 }}>Check domain and range</button>
        </> : null}

        {mode === 'intercepts' ? <>
          <p style={{ color: '#5f6b7a' }}>Enter multiple x-intercepts separated by commas. Enter <strong>none</strong> when an intercept does not exist.</p>
          <label>x-intercept values<input value={xIntercepts} onChange={(event) => setXIntercepts(event.target.value)} placeholder="Example: -2, 3 or none" style={inputStyle} /></label>
          <label style={{ display: 'block', marginTop: 12 }}>y-intercept value<input value={yIntercept} onChange={(event) => setYIntercept(event.target.value)} placeholder="Example: 4 or none" style={inputStyle} /></label>
          <button type="button" onClick={checkIntercepts} style={{ ...buttonStyle, marginTop: 12 }}>Check intercepts</button>
        </> : null}

        {mode === 'behavior' ? <>
          <label>Which statement best describes the function?<select value={behavior} onChange={(event) => setBehavior(event.target.value)} style={inputStyle}><option value="">Choose…</option>{behaviorChoices.map((code) => <option value={code} key={code}>{behaviorLabel(code)}</option>)}</select></label>
          <button type="button" onClick={checkBehavior} style={{ ...buttonStyle, marginTop: 12 }}>Check behavior</button>
        </> : null}

        {mode === 'compare' ? <>
          <p>At <strong>x = {compareX}</strong>, which function has the greater y-value?</p>
          <select value={comparison} onChange={(event) => setComparison(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="left">Blue function</option><option value="right">Red function</option><option value="equal">They are equal</option><option value="undefined">At least one is undefined</option></select>
          <button type="button" onClick={checkComparison} style={{ ...buttonStyle, marginTop: 12 }}>Check comparison</button>
        </> : null}

        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Function evidence is correct.' : 'Use this family’s structure, domain, and defining features—not a generic point rule.'}</ResultPill></div> : null}
      </Panel>
    </ToolGrid>
  </ToolShell>;
}
