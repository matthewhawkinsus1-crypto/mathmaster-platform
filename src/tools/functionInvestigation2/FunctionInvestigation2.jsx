import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ResultPill, TaskCard, HintPanel, ToolSplit } from '../shared/ToolShell';
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

const inputStyle = { display: 'block', width: '100%', padding: 11, marginTop: 5, border: '1px solid #cdd6e4', borderRadius: 9, fontSize: 15, minHeight: 44 };
const buttonStyle = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const domainChoices = ['allReal', 'xGteH', 'xGtH', 'xNotH'];
const rangeChoices = ['allReal', 'yGteK', 'yLteK', 'yGtK', 'yLtK', 'yNotK'];
const behaviorChoices = ['minimum', 'maximum', 'increasing', 'decreasing', 'increasingBranches', 'decreasingBranches'];

const MODE_TASKS = {
  features: 'Identify the feature that defines this function, and read its exact coordinates from the graph.',
  domainRange: 'Decide which x-values this function accepts (the domain) and which y-values it produces (the range).',
  intercepts: 'Find every point where this graph crosses an axis.',
  behavior: 'Describe how this function behaves as you read it from left to right.',
  compare: 'Compare the two functions at the same input value.',
};

const MODE_STEPS = {
  features: ['Read the defining feature named below off the graph.', 'Type its x- and y-coordinate.', 'If the family has asymptotes, enter those too, then check.'],
  domainRange: ['Look at how far the graph extends left and right — that is the domain.', 'Look at how far it extends up and down — that is the range.', 'Choose the matching statement for each, then check.'],
  intercepts: ['Find where the graph crosses the x-axis. There may be none, one, or several.', 'Find where it crosses the y-axis. A function has at most one.', 'Type none when an intercept does not exist.'],
  behavior: ['Trace the graph from left to right.', 'Decide whether it rises, falls, or turns around.', 'Pick the statement that matches, then check.'],
  compare: ['Find the dashed vertical line — that is the input both functions share.', 'Read each function’s height at that line.', 'Choose which is greater, then check.'],
};

const hintsForMode = (mode, spec, features, domainRange, intercepts, compareX) => {
  if (mode === 'domainRange') {
    return [
      'Domain is about x: can you slide all the way left and right along the graph without lifting your finger?',
      'Range is about y: what heights does the graph actually reach?',
      `This is ${FUNCTION_FAMILY_LABELS[spec.type]}. Look for a value the graph never touches — that is what gets excluded, and it comes from h = ${spec.h} or k = ${spec.k}.`,
    ];
  }
  if (mode === 'intercepts') {
    return [
      'An x-intercept has y = 0. A y-intercept has x = 0.',
      'Substitute 0 for y to find x-intercepts, and 0 for x to find the y-intercept.',
      intercepts.x.length ? `There ${intercepts.x.length === 1 ? 'is 1 x-intercept' : `are ${intercepts.x.length} x-intercepts`} here.` : 'This graph never crosses the x-axis — the answer is none.',
    ];
  }
  if (mode === 'behavior') {
    return [
      'Read the graph left to right, like reading a sentence.',
      'A graph that turns around has a highest or lowest point; one that never turns is only increasing or only decreasing.',
      `${FUNCTION_FAMILY_LABELS[spec.type]} with a = ${spec.a}: the sign of a tells you which way it opens or which direction it runs.`,
    ];
  }
  if (mode === 'compare') {
    return [
      `Both functions are being compared at exactly x = ${compareX}, marked by the dashed line.`,
      'Follow the dashed line up and down. Whichever curve it meets higher has the greater y-value.',
      'If the dashed line misses a curve entirely, that function is undefined at this input.',
    ];
  }
  return [
    `Every ${FUNCTION_FAMILY_LABELS[spec.type]} is organized around one defining feature: its ${features.anchor.label}.`,
    'Find that feature on the graph before typing anything — count gridlines across, then up or down.',
    `The parameters give it away: h = ${spec.h} shifts it horizontally and k = ${spec.k} shifts it vertically.`,
  ];
};

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
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { anchor: [Number(anchorX), Number(anchorY)], verticalAsymptote, horizontalAsymptote }, { mode, family: spec.type, featureLabel: features.anchor.label, anchorIsOnGraph: features.anchor.isOnGraph, checks });
  };

  const checkDomainRange = () => {
    const checks = [domainCode === domainRange.domainCode, rangeCode === domainRange.rangeCode];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { domainCode, rangeCode }, { mode, family: spec.type, checks });
  };

  const checkIntercepts = () => {
    const parsedX = parseNumericList(xIntercepts);
    const parsedY = parseNumericList(yIntercept);
    const expectedY = intercepts.y == null ? [] : [intercepts.y];
    const checks = [numericSetsMatch(parsedX, intercepts.x, 0.01), numericSetsMatch(parsedY, expectedY, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { xIntercepts: parsedX, yIntercept: parsedY }, { mode, family: spec.type, checks });
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

  // Say which half of a two-part answer was wrong instead of restating the
  // learning objective at a student who already knows what they were asked.
  const feedbackMessage = () => {
    if (feedback.isCorrect) return 'Correct — that matches the function’s structure.';
    const checks = feedback.metadata?.checks;
    if (mode === 'domainRange' && Array.isArray(checks)) {
      if (checks[0] && !checks[1]) return 'The domain is right. Look again at the range: which y-values does the graph actually reach?';
      if (!checks[0] && checks[1]) return 'The range is right. Look again at the domain: which x-values can you substitute in?';
      return 'Neither one matches yet. Trace the graph left-to-right for the domain, then bottom-to-top for the range.';
    }
    if (mode === 'intercepts' && Array.isArray(checks)) {
      if (checks[0] && !checks[1]) return 'Your x-intercepts are right. Check the y-intercept — substitute x = 0.';
      if (!checks[0] && checks[1]) return 'Your y-intercept is right. Check the x-intercepts — set y = 0 and solve.';
      return 'Neither intercept matches. Remember an intercept can legitimately be none.';
    }
    if (mode === 'features' && Array.isArray(checks)) {
      if (!checks[0] || !checks[1]) return `Check the coordinates of the ${features.anchor.label}. Count gridlines across for x first, then up or down for y.`;
      return 'The point is right, but an asymptote value is off. An asymptote is a line the graph approaches but never touches.';
    }
    if (mode === 'compare') return `Follow the dashed line at x = ${compareX} and compare how high each curve sits there.`;
    return `Use this family’s structure rather than a generic rule — a ${FUNCTION_FAMILY_LABELS[spec.type]} does not behave like a line.`;
  };

  const featurePrompt = features.anchor.isOnGraph ? 'Defining graph feature' : 'Structural center (not a point on the graph)';
  const panelTitle = mode === 'features' ? 'Feature analysis'
    : mode === 'domainRange' ? 'Domain and range'
      : mode === 'intercepts' ? 'Intercept analysis'
        : mode === 'behavior' ? 'Behavior analysis' : 'Same-input comparison';

  return (
    <ToolShell
      title={mode === 'compare' ? 'Compare the Functions' : 'Analyze the Function'}
      subtitle="Use the graph and the defining features of the function to answer the question."
      badge={mode === 'compare' ? 'Comparing functions' : FUNCTION_FAMILY_LABELS[spec.type]}
    >
      <TaskCard question={questionData} task={MODE_TASKS[mode] || MODE_TASKS.features} steps={MODE_STEPS[mode] || MODE_STEPS.features} />

      <ToolSplit>
        <Panel title="The graph">
          {mode === 'compare' ? (
            <CoordinatePlane
              {...graphBounds}
              functions={[x => evaluateFunctionSpec(compareLeft, x), x => evaluateFunctionSpec(compareRight, x)]}
              verticalLines={[compareX]}
              ariaLabel="Graph of two functions being compared"
            />
          ) : (
            <CoordinatePlane
              {...graphBounds}
              functions={[fn]}
              verticalLines={features.verticalAsymptotes}
              horizontalLines={features.horizontalAsymptotes}
              ariaLabel={`Graph of a ${FUNCTION_FAMILY_LABELS[spec.type]} function`}
            />
          )}

          {mode === 'compare' ? (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: '#3c4756' }}>
                <span><svg width="26" height="8" style={{ verticalAlign: 'middle', marginRight: 5 }}><line x1="0" y1="4" x2="26" y2="4" stroke="#1a73e8" strokeWidth="3" /></svg><strong>f(x)</strong> — solid blue</span>
                <span><svg width="26" height="8" style={{ verticalAlign: 'middle', marginRight: 5 }}><line x1="0" y1="4" x2="26" y2="4" stroke="#d93025" strokeWidth="3" strokeDasharray="8 5" /></svg><strong>g(x)</strong> — dashed red</span>
              </div>
              <p style={{ color: '#5f6b7a', marginBottom: 0, marginTop: 8 }}>The dashed purple vertical line marks x = {compareX}. Compare both function values at that same input.</p>
            </>
          ) : (
            <>
              <p style={{ margin: '10px 0 0' }}><strong>Family:</strong> {FUNCTION_FAMILY_LABELS[spec.type]}</p>
              <p style={{ color: '#5f6b7a', marginBottom: 0 }}>
                {features.anchor.label === 'asymptote intersection'
                  ? 'The purple dashed lines are asymptotes. Their intersection organizes the two branches but is not itself a point on the graph.'
                  : 'The defining feature comes from this family and its parameters, not from a fixed position on the screen.'}
              </p>
            </>
          )}
        </Panel>

        <Panel title={panelTitle}>
          {mode === 'features' ? <>
            <p><strong>{featurePrompt}:</strong> {features.anchor.label}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>x-coordinate<input type="number" inputMode="decimal" value={anchorX} onChange={(event) => setAnchorX(event.target.value)} style={inputStyle} /></label>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>y-coordinate<input type="number" inputMode="decimal" value={anchorY} onChange={(event) => setAnchorY(event.target.value)} style={inputStyle} /></label>
            </div>
            {features.verticalAsymptotes.length ? <label style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 700, color: '#3c4756' }}>Vertical asymptote x =<input type="number" inputMode="decimal" value={verticalAsymptote} onChange={(event) => setVerticalAsymptote(event.target.value)} style={inputStyle} /></label> : null}
            {features.horizontalAsymptotes.length ? <label style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 700, color: '#3c4756' }}>Horizontal asymptote y =<input type="number" inputMode="decimal" value={horizontalAsymptote} onChange={(event) => setHorizontalAsymptote(event.target.value)} style={inputStyle} /></label> : null}
            <button type="button" onClick={checkFeatures} style={{ ...buttonStyle, marginTop: 14 }}>Check features</button>
          </> : null}

          {mode === 'domainRange' ? <>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>Domain — the x-values this function accepts
              <select value={domainCode} onChange={(event) => setDomainCode(event.target.value)} style={inputStyle}><option value="">Choose…</option>{domainChoices.map((code) => <option value={code} key={code}>{relationLabel(code, spec)}</option>)}</select>
            </label>
            <label style={{ display: 'block', marginTop: 12, fontSize: 13, fontWeight: 700, color: '#3c4756' }}>Range — the y-values this function produces
              <select value={rangeCode} onChange={(event) => setRangeCode(event.target.value)} style={inputStyle}><option value="">Choose…</option>{rangeChoices.map((code) => <option value={code} key={code}>{relationLabel(code, spec)}</option>)}</select>
            </label>
            <button type="button" onClick={checkDomainRange} style={{ ...buttonStyle, marginTop: 14 }}>Check domain and range</button>
          </> : null}

          {mode === 'intercepts' ? <>
            <p style={{ color: '#5f6b7a', fontSize: 13 }}>Separate multiple x-intercepts with commas. Type <strong>none</strong> when an intercept does not exist.</p>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>x-intercept values<input value={xIntercepts} onChange={(event) => setXIntercepts(event.target.value)} placeholder="Example: -2, 3 or none" style={inputStyle} /></label>
            <label style={{ display: 'block', marginTop: 12, fontSize: 13, fontWeight: 700, color: '#3c4756' }}>y-intercept value<input value={yIntercept} onChange={(event) => setYIntercept(event.target.value)} placeholder="Example: 4 or none" style={inputStyle} /></label>
            <button type="button" onClick={checkIntercepts} style={{ ...buttonStyle, marginTop: 14 }}>Check intercepts</button>
          </> : null}

          {mode === 'behavior' ? <>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>Which statement best describes this function?
              <select value={behavior} onChange={(event) => setBehavior(event.target.value)} style={inputStyle}><option value="">Choose…</option>{behaviorChoices.map((code) => <option value={code} key={code}>{behaviorLabel(code)}</option>)}</select>
            </label>
            <button type="button" onClick={checkBehavior} style={{ ...buttonStyle, marginTop: 14 }}>Check behavior</button>
          </> : null}

          {mode === 'compare' ? <>
            <p>At <strong>x = {compareX}</strong>, which function has the greater y-value?</p>
            <select value={comparison} onChange={(event) => setComparison(event.target.value)} style={inputStyle} aria-label={`Which function is greater at x equals ${compareX}`}>
              <option value="">Choose…</option>
              <option value="left">f(x) — the solid blue curve</option>
              <option value="right">g(x) — the dashed red curve</option>
              <option value="equal">They are equal</option>
              <option value="undefined">At least one is undefined here</option>
            </select>
            <button type="button" onClick={checkComparison} style={{ ...buttonStyle, marginTop: 14 }}>Check comparison</button>
          </> : null}

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              <p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{feedbackMessage()}</p>
            </div>
          ) : null}

          <HintPanel
            hints={hintsForMode(mode, spec, features, domainRange, intercepts, compareX)}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolSplit>
    </ToolShell>
  );
}
