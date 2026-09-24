import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { matchesNumericAnswer, parseNumericAnswer, solveTwoLines, round } from '../shared/toolMath';
import { useRevealAnswers } from '../shared/ToolRuntimeContext';
import {
  feasibleRegionPolygon,
  matrix3x4Rows,
  samePointSet,
  satisfiesLinearInequality,
  solve2x2System,
  solve3x3System,
  solveLinearQuadratic,
  normalizeSystemsWorkspaceInequalityConfig,
} from './systemsMath';
import {
  authoredBoundaryFromInequality,
  boundaryFromHorizontal,
  boundaryFromTwoPoints,
  boundaryFromVertical,
  boundaryWithChosenSide,
  classifyFeasibleRegion,
  feasibleRegionPolygon as feasibleRegionPolygonGeneral,
  feasibleRegionVertices,
  lineSegmentForBounds,
  pointOnBoundaryLine,
  satisfiesBoundary,
  sideOfBoundaryLine,
} from './inequalityBuilderAdapter';
import useToolSubmission from '../shared/useToolSubmission';
import EmbeddedInequalityRewrite from './EmbeddedInequalityRewrite.jsx';
import { formatSlopeInterceptInequality } from './linearInequalityEngine.js';
import AlgebraicSystemMode from './AlgebraicSystemMode.jsx';
import SubstitutionReductionMode from './SubstitutionReductionMode.jsx';
import { resolveSystemsWorkspaceMode } from './systemsWorkspaceMode.js';
import { algebraicSystemDimension } from './algebraicSystemsEngine.js';

const DEFAULT_SYSTEM = { m1: 2, b1: 1, m2: -1, b2: 7 };
const DEFAULT_INEQUALITIES = [
  { m: 1, b: 1, relation: '>=' },
  { m: -0.5, b: 6, relation: '<=' },
];
const DEFAULT_LINEAR_QUADRATIC = {
  line: { m: 1, b: 2 },
  quadratic: { a: 1, b: 0, c: -4 },
};
const DEFAULT_MATRIX = { a11: 2, a12: 1, b1: 7, a21: 1, a22: -1, b2: 2 };
const inputStyle = { width:'100%', boxSizing:'border-box', padding:'11px 12px', border:'1px solid #cfd8e6', borderRadius:9, background:'#fff', fontSize:15, minHeight:44 };
const actionStyle = { marginTop:16, padding:'11px 18px', border:0, borderRadius:9, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer', minHeight:44 };
const INEQUALITY_COLORS = ['#1a73e8', '#d93025', '#188038', '#9334e6', '#b06000'];

const Field = ({ label, children }) => <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#465267' }}>{label}<div style={{marginTop:5}}>{children}</div></label>;
const formatLine = (line) => `y = ${line.m}x ${Number(line.b)>=0?'+':'−'} ${Math.abs(Number(line.b))}`;
const displayRelation = (relation) => String(relation || '>=').replace('<=', '≤').replace('>=', '≥');
const formatLinearTerm = (coefficient, variable, first = false) => {
  const value = Number(coefficient);
  if (!Number.isFinite(value) || Math.abs(value) <= 1e-12) return '';
  const sign = value < 0 ? '−' : '+';
  const magnitude = Math.abs(value);
  const coefficientText = Math.abs(magnitude - 1) <= 1e-12 ? '' : String(magnitude);
  if (first) return `${value < 0 ? '−' : ''}${coefficientText}${variable}`;
  return ` ${sign} ${coefficientText}${variable}`;
};
const formatInequality = (ineq = {}) => {
  const relation = displayRelation(ineq.relation);
  if (ineq.orientation === 'vertical') return `x ${relation} ${ineq.x}`;
  if (ineq.orientation === 'horizontal') return `y ${relation} ${ineq.y}`;
  if (Number.isFinite(Number(ineq.m)) || Number.isFinite(Number(ineq.b))) {
    const m = Number(ineq.m ?? 0);
    const b = Number(ineq.b ?? 0);
    return `y ${relation} ${m}x ${b >= 0 ? '+' : '−'} ${Math.abs(b)}`;
  }
  if ([ineq.A, ineq.B, ineq.C].some((value) => Number.isFinite(Number(value)))) {
    const A = Number(ineq.A ?? 0);
    const B = Number(ineq.B ?? 0);
    const C = Number(ineq.C ?? 0);
    const firstTerm = formatLinearTerm(A, 'x', true);
    const secondTerm = formatLinearTerm(B, 'y', !firstTerm);
    return `${(firstTerm + secondTerm).trim() || '0'} ${relation} ${-C}`;
  }
  return 'Linear inequality';
};

// Naming the curves beats "the blue one". Ordinary equation lines are both
// solid; dashed strokes are reserved for strict inequality boundaries.
const Legend = ({ items }) => (
  <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:10, fontSize:13, color:'#3c4756' }}>
    {items.map((item) => (
      <span key={item.label}>
        <svg width="26" height="8" style={{ verticalAlign:'middle', marginRight:5 }} aria-hidden="true">
          <line x1="0" y1="4" x2="26" y2="4" stroke={item.color} strokeWidth="3" strokeDasharray={item.dashed ? '8 5' : undefined} />
        </svg>
        <strong>{item.label}</strong>{item.note ? ` — ${item.note}` : ''}
      </span>
    ))}
  </div>
);

function LinearMode({ questionData, onAction }) {
  const system = questionData.system || DEFAULT_SYSTEM;
  const solution = useMemo(() => solveTwoLines(system), [system]);
  const revealAnswers = useRevealAnswers();
  const [x, setX] = usePersistentToolState('x', '');
  const [y, setY] = usePersistentToolState('y', '');
  const [classification, setClassification] = usePersistentToolState('classification', 'one');
  const { feedback, submit } = useToolSubmission(onAction);
  const mathState = useMemo(() => ({ x, y, classification }), [x, y, classification]);
  const restore = useCallback((value) => { setX(value?.x || ''); setY(value?.y || ''); setClassification(value?.classification || 'one'); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last system answer edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });

  const check = () => {
    const classCorrect = classification === solution.type;
    const coordinateCorrect = solution.type !== 'one' || (matchesNumericAnswer(x, solution.x, 0.05) && matchesNumericAnswer(y, solution.y, 0.05));
    const parts = solution.type === 'one' ? [classCorrect, coordinateCorrect] : [classCorrect];
    submit({ isCorrect: parts.every(Boolean), score: parts.filter(Boolean).length / parts.length }, { x, y, classification }, { mode:'linear', expected:solution, checks:{ classCorrect, coordinateCorrect } });
  };

  const message = () => {
    if (feedback.isCorrect) return solution.type === 'one'
      ? `Correct — the lines meet at exactly one point, (${round(solution.x, 2)}, ${round(solution.y, 2)}).`
      : 'Correct — you classified the system from the slopes and intercepts.';
    const checks = feedback.metadata?.checks || {};
    if (!checks.classCorrect) return 'The classification is not right yet. Compare the two slopes first: different slopes always cross exactly once, equal slopes never cross unless the lines are identical.';
    return 'The classification is right, but the coordinates are not. Read the crossing point off the graph, then substitute it into both equations to confirm.';
  };

  return <EnlargeableFigure label="Linear system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{
    undo: undoHistory.capability,
    equationInput: { label: 'Both equations', studentState: true },
    numericControls: { label: 'Solution and classification', studentState: true },
    instruction: { text: 'Classify the system, then solve where the equations meet.' },
    primaryActions: [{ id: 'check-system', label: 'Check system', onAction: check }],
  }}><ToolSplit>
    <Panel title="Both equations on one grid">
      <CoordinatePlane xMin={questionData.graph?.xMin ?? -6} xMax={questionData.graph?.xMax ?? 8} yMin={questionData.graph?.yMin ?? -6} yMax={questionData.graph?.yMax ?? 12}
        lines={[{m:system.m1,b:system.b1},{m:system.m2,b:system.b2,stroke:'#d93025'}]}
        ariaLabel="Graph of both equations in the system"
        // Marking and labelling the intersection is the answer to the question
        // being asked, so only the teacher bench draws it.
        points={revealAnswers && solution.type === 'one' ? [{x:solution.x,y:solution.y,label:'intersection'}] : []} enlargeable={false} />
      <Legend items={[
        { label:'Equation 1', color:'#1a73e8', note:formatLine({m:system.m1,b:system.b1}) },
        { label:'Equation 2', color:'#d93025', note:formatLine({m:system.m2,b:system.b2}) },
      ]} />
    </Panel>
    <Panel title="Classify and solve">
      <Field label="How many solutions does this system have?"><select value={classification} onChange={(e)=>setClassification(e.target.value)} style={inputStyle}><option value="one">Exactly one solution</option><option value="none">No solution</option><option value="infinite">Infinitely many solutions</option></select></Field>
      {classification === 'one' ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x"><input type="number" inputMode="decimal" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field><Field label="y"><input type="number" inputMode="decimal" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field></div> : null}
      <button type="button" onClick={check} style={actionStyle}>Check system</button>
      {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div> : null}
      <HintPanel
        hints={[
          'The solution of a system is the point that makes both equations true at once — on a graph, that is where the lines cross.',
          'Compare the slopes. Different slopes cross exactly once. Equal slopes are parallel: no solution, unless the intercepts also match, which makes them the same line.',
          `Equation 1 has slope ${system.m1} and Equation 2 has slope ${system.m2}. ${Number(system.m1) === Number(system.m2) ? 'They are equal, so check the intercepts.' : 'They differ, so trace across to where the two lines meet and read both coordinates.'}`,
        ]}
        onHintUsed={() => onAction?.('HINT_USED')}
      />
    </Panel>
  </ToolSplit></EnlargeableFigure>;
}

function InequalityMode({ questionData, onAction, draftKey = null }) {
  // Opt-in only (Definition of Done: "Existing systemsWorkspace questions must
  // continue working... New construction/reasoning modes should be opt-in").
  // Every existing authored question omits `studentBuild`, so it is untouched
  // and falls straight through to the code below exactly as before.
  const inequalityConfig = normalizeSystemsWorkspaceInequalityConfig(questionData);
  const studentBuildEnabled = questionData.studentBuild === true
    || Object.values(inequalityConfig.studentBuild).some(Boolean)
    || Object.values(inequalityConfig.reasoning).some(Boolean)
    || Boolean(questionData.modeling);
  if (studentBuildEnabled) return <StudentBuildInequalityMode questionData={questionData} onAction={onAction} draftKey={draftKey} />;
  const inequalities = questionData.inequalities || DEFAULT_INEQUALITIES;
  const bounds = questionData.graph || { xMin:-6, xMax:8, yMin:-4, yMax:10 };
  const ask = Array.isArray(questionData.ask) && questionData.ask.length
    ? questionData.ask
    : questionData.interaction === 'construct' ? ['construction'] : ['testPoint', 'candidate'];
  const requiresConstruction = ask.includes('construction');
  const correctPolygon = useMemo(() => feasibleRegionPolygon(inequalities, bounds), [inequalities, bounds]);
  const testPoint = questionData.testPoint || { x:2, y:4 };
  const expectedTestPoint = inequalities.every((ineq) => satisfiesLinearInequality(ineq, testPoint.x, testPoint.y));
  const [x, setX] = usePersistentToolState('x', '');
  const [y, setY] = usePersistentToolState('y', '');
  const [testChoice, setTestChoice] = usePersistentToolState('testChoice', '');
  const [construction, setConstruction] = usePersistentToolState('construction', () => inequalities.map(() => ({
    x1:'', y1:'', x2:'', y2:'', boundaryStyle:'', shade:'',
  })));
  const { feedback, submit } = useToolSubmission(onAction);
  const mathState = useMemo(() => ({ x, y, testChoice, construction }), [x, y, testChoice, construction]);
  const restore = useCallback((value) => {
    setX(value?.x || ''); setY(value?.y || ''); setTestChoice(value?.testChoice || '');
    setConstruction(value?.construction || inequalities.map(() => ({ x1:'', y1:'', x2:'', y2:'', boundaryStyle:'', shade:'' })));
  }, [inequalities]);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last inequality-system edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });

  const updateConstruction = (index, key, value) => {
    setConstruction((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, [key]:value } : entry
    )));
  };

  const constructedLines = construction.map((entry) => {
    const x1 = parseNumericAnswer(entry.x1);
    const y1 = parseNumericAnswer(entry.y1);
    const x2 = parseNumericAnswer(entry.x2);
    const y2 = parseNumericAnswer(entry.y2);
    if ([x1, y1, x2, y2].some((value) => value == null) || Math.abs(x2 - x1) <= 1e-9) return null;
    const m = (y2 - y1) / (x2 - x1);
    const b = y1 - m * x1;
    return { m, b, boundaryStyle:entry.boundaryStyle, shade:entry.shade };
  });

  const studentInequalities = constructedLines.map((line) => {
    if (!line || !['above', 'below'].includes(line.shade) || !['solid', 'dashed'].includes(line.boundaryStyle)) return null;
    const relation = line.shade === 'above'
      ? line.boundaryStyle === 'solid' ? '>=' : '>'
      : line.boundaryStyle === 'solid' ? '<=' : '<';
    return { m:line.m, b:line.b, relation };
  });
  const constructionComplete = studentInequalities.length === inequalities.length && studentInequalities.every(Boolean);
  const studentPolygon = constructionComplete ? feasibleRegionPolygon(studentInequalities, bounds) : [];

  const graphLines = requiresConstruction
    ? constructedLines.filter(Boolean).map((line, index) => ({
        m:line.m,
        b:line.b,
        stroke:INEQUALITY_COLORS[index % INEQUALITY_COLORS.length],
        dash:line.boundaryStyle === 'dashed' ? '10 6' : undefined,
      }))
    : inequalities.map((ineq,index)=>({
        m:ineq.m,
        b:ineq.b,
        stroke:INEQUALITY_COLORS[index % INEQUALITY_COLORS.length],
        dash:String(ineq.relation).includes('=') ? undefined : '10 6',
      }));

  const plottedPoints = [
    ...(ask.includes('testPoint') ? [{x:testPoint.x,y:testPoint.y,label:'test point',fill:'#8a3ffc'}] : []),
    ...(requiresConstruction ? construction.flatMap((entry, index) => {
      const points = [
        [parseNumericAnswer(entry.x1), parseNumericAnswer(entry.y1)],
        [parseNumericAnswer(entry.x2), parseNumericAnswer(entry.y2)],
      ];
      return points
        .filter(([px, py]) => px != null && py != null)
        .map(([px, py], pointIndex) => ({ x:px, y:py, label:`B${index + 1} P${pointIndex + 1}` }));
    }) : []),
  ];

  const check = () => {
    const parts = [];
    const responseConstruction = construction.map((entry) => ({
      points: [
        { x:parseNumericAnswer(entry.x1), y:parseNumericAnswer(entry.y1) },
        { x:parseNumericAnswer(entry.x2), y:parseNumericAnswer(entry.y2) },
      ],
      boundaryStyle:entry.boundaryStyle,
      shade:entry.shade,
    }));

    if (requiresConstruction) {
      inequalities.forEach((ineq, index) => {
        const entry = responseConstruction[index];
        const [first, second] = entry.points;
        const boundaryCorrect = [first, second].every((point) => (
          point.x != null && point.y != null
          && Math.abs(point.y - (Number(ineq.m) * point.x + Number(ineq.b))) <= 0.08
        )) && first.x != null && second.x != null
          && Math.hypot(first.x - second.x, first.y - second.y) > 0.08;
        const styleCorrect = entry.boundaryStyle === (String(ineq.relation).includes('=') ? 'solid' : 'dashed');
        const shadeCorrect = entry.shade === (String(ineq.relation).includes('>') ? 'above' : 'below');
        parts.push(boundaryCorrect, styleCorrect, shadeCorrect);
      });
    }

    const candidate = { x:parseNumericAnswer(x), y:parseNumericAnswer(y) };
    const candidateFeasible = candidate.x != null && candidate.y != null && inequalities.every((ineq)=>satisfiesLinearInequality(ineq,candidate.x,candidate.y));
    const testCorrect = (testChoice === 'yes') === expectedTestPoint;
    if (ask.includes('testPoint')) parts.push(testCorrect);
    if (ask.includes('candidate')) parts.push(candidateFeasible);

    const score = parts.length ? parts.filter(Boolean).length / parts.length : 0;
    submit(
      { isCorrect:parts.length > 0 && parts.every(Boolean), score },
      {
        construction:responseConstruction,
        ...(ask.includes('testPoint') ? { testChoice } : {}),
        ...(ask.includes('candidate') ? { candidate } : {}),
      },
      { mode:'inequalities', checks:{ construction:parts, candidateFeasible, testCorrect } },
    );
  };

  const message = () => {
    if (feedback.isCorrect) {
      return requiresConstruction
        ? 'Correct — every boundary, boundary style, and shading direction builds the right solution region.'
        : 'Correct — the marked point is classified right and your own point satisfies every inequality.';
    }
    if (requiresConstruction) {
      return 'At least one graph feature needs revision. Check that both points lie on the boundary equation, use a solid line for ≤ or ≥ and a dashed line for < or >, then shade above for > / ≥ or below for < / ≤.';
    }
    const checks = feedback.metadata?.checks || {};
    if (checks.testCorrect && !checks.candidateFeasible) return 'Your judgement about the test point is right, but the point you entered is outside the shaded overlap. Substitute it into each inequality and find the one it fails.';
    if (!checks.testCorrect && checks.candidateFeasible) return 'Your own point works. Re-check the purple test point: substitute its coordinates into each inequality separately.';
    return 'Neither part is right yet. A point is feasible only when it satisfies every inequality at the same time, not just one of them.';
  };

  const shownPolygon = requiresConstruction ? studentPolygon : correctPolygon;

  return <EnlargeableFigure label="Inequality system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{
    undo: undoHistory.capability,
    equationInput: { label: 'Both inequalities', studentState: true },
    numericControls: { label: requiresConstruction ? 'Boundary and shading controls' : 'Solution controls', studentState: true },
    pointEditing: requiresConstruction ? { label: 'Boundary points', studentState: true } : null,
    instruction: { text: requiresConstruction ? 'Construct every boundary and shade their overlap.' : 'Test points against both inequalities.' },
    primaryActions: [{ id: 'check-inequalities', label: requiresConstruction ? 'Check inequality graph' : 'Check feasible region', onAction: check }],
  }}><ToolSplit>
    <Panel title={requiresConstruction ? 'Your inequality graph' : 'Feasible region'}>
      <CoordinatePlane
        xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 8}
        yMin={bounds.yMin ?? -4} yMax={bounds.yMax ?? 10}
        lines={graphLines}
        points={plottedPoints}
        ariaLabel={requiresConstruction ? 'Student-constructed graph of the inequality solution region' : 'Graph of the system of inequalities with its shaded feasible region'}
        enlargeable={false}
      >
        {({sx,sy}) => shownPolygon.length >= 3 ? (
          <polygon
            points={shownPolygon.map(([px,py])=>`${sx(px)},${sy(py)}`).join(' ')}
            fill="rgba(31, 157, 85, 0.16)"
            stroke="#16884b"
            strokeWidth="2"
          />
        ) : null}
      </CoordinatePlane>
      <div style={{display:'grid',gap:6,marginTop:12}}>
        {inequalities.map((ineq,index)=><div key={index}><strong>{index+1}.</strong> {formatInequality(ineq)}</div>)}
      </div>
      <p style={{fontSize:13,color:'#5f6b7a'}}>
        {requiresConstruction
          ? 'Your graph above is built from the two boundary points, boundary style, and shading direction you enter. No correct region is drawn for you.'
          : 'The green shaded overlap is the feasible region: every point inside it satisfies every inequality at once.'}
      </p>
    </Panel>

    <Panel title={requiresConstruction ? 'Construct each boundary and shade' : 'Test a point, then find your own'}>
      {requiresConstruction ? (
        <div style={{display:'grid',gap:14}}>
          {inequalities.map((ineq, index) => {
            const entry = construction[index] || {};
            return (
              <div key={index} style={{padding:12,border:'1px solid #dbe3ef',borderRadius:10,background:'#f8fbff'}}>
                <strong style={{display:'block',marginBottom:9}}>Inequality {index + 1}: {formatInequality(ineq)}</strong>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0, 1fr))',gap:9}}>
                  <Field label="Boundary point 1: x"><input type="number" inputMode="decimal" value={entry.x1} onChange={(e)=>updateConstruction(index,'x1',e.target.value)} style={inputStyle}/></Field>
                  <Field label="Boundary point 1: y"><input type="number" inputMode="decimal" value={entry.y1} onChange={(e)=>updateConstruction(index,'y1',e.target.value)} style={inputStyle}/></Field>
                  <Field label="Boundary point 2: x"><input type="number" inputMode="decimal" value={entry.x2} onChange={(e)=>updateConstruction(index,'x2',e.target.value)} style={inputStyle}/></Field>
                  <Field label="Boundary point 2: y"><input type="number" inputMode="decimal" value={entry.y2} onChange={(e)=>updateConstruction(index,'y2',e.target.value)} style={inputStyle}/></Field>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9,marginTop:9}}>
                  <Field label="Boundary style">
                    <select value={entry.boundaryStyle} onChange={(e)=>updateConstruction(index,'boundaryStyle',e.target.value)} style={inputStyle}>
                      <option value="">Choose…</option>
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                    </select>
                  </Field>
                  <Field label="Shade">
                    <select value={entry.shade} onChange={(e)=>updateConstruction(index,'shade',e.target.value)} style={inputStyle}>
                      <option value="">Choose…</option>
                      <option value="above">Above the boundary</option>
                      <option value="below">Below the boundary</option>
                    </select>
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {ask.includes('testPoint') ? (
        <div style={{marginTop:requiresConstruction?14:0}}>
          <Field label={`Is the purple point (${testPoint.x}, ${testPoint.y}) in the feasible region?`}>
            <select value={testChoice} onChange={(e)=>setTestChoice(e.target.value)} style={inputStyle}>
              <option value="">Choose…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>
      ) : null}

      {ask.includes('candidate') ? (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}>
          <Field label="Your own feasible x"><input type="number" inputMode="decimal" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field>
          <Field label="Your own feasible y"><input type="number" inputMode="decimal" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field>
        </div>
      ) : null}

      <button type="button" onClick={check} style={actionStyle}>{requiresConstruction ? 'Check inequality graph' : 'Check feasible region'}</button>
      {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div> : null}
      <HintPanel
        hints={requiresConstruction ? [
          'Replace the inequality symbol with = to get the boundary line. Choose any two x-values and calculate the matching y-values.',
          'Use a solid boundary when equality is included (≤ or ≥). Use a dashed boundary for < or >.',
          'For y > mx + b or y ≥ mx + b, shade above the line. For y < mx + b or y ≤ mx + b, shade below it. With a system, only the overlap survives.',
        ] : [
          'To test a point, substitute its x and y into each inequality and see whether the statement is true.',
          'A point has to satisfy every inequality. Failing even one puts it outside the feasible region.',
          'For your own point, pick coordinates well inside the green shaded area rather than on a boundary line.',
        ]}
        onHintUsed={() => onAction?.('HINT_USED')}
      />
    </Panel>
  </ToolSplit></EnlargeableFigure>;
}

// ============================================================================
// STUDENT-BUILD INEQUALITY MODE
//
// The rest of this file's `inequalities` mode either shows the finished
// feasible region (analyze mode) or accepts the boundary as four typed
// numbers with no graph feedback (the older `interaction: 'construct'` path).
// Neither walks a student through building, styling, shading, and combining
// each constraint one at a time with feedback at every step — the sequence
// "Systems Workspace 2.0" asks for. This mode does, behind the explicit
// `questionData.studentBuild` opt-in so no existing question is affected.
// ============================================================================

const CONSTRUCTION_METHODS = [
  { id: 'points', label: 'Two points' },
  { id: 'slopeIntercept', label: 'Slope & y-intercept' },
  { id: 'vertical', label: 'Vertical line (x = c)' },
  { id: 'horizontal', label: 'Horizontal line (y = c)' },
];

const emptyBuildEntry = () => ({
  method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '',
  point1Plotted: false, point2Plotted: false,
  boundaryAttempts: 0, style: '', styleAttempts: 0, shadePoint: null, shadeAttempts: 0, visible: true,
});

const emptyRewriteEntry = (source = '') => ({ source, steps: [], committedText:source, draft:source, pendingFlip:null, verifiedText:'', verifiedConstraint:null });

const emptyModelingEntry = () => ({ coeffA: '', coeffB: '', relation: '>=', constant: '' });

const emptyTestPointResponse = (count) => ({
  overall: '', perInequality: Array.from({ length: count }, () => ''), onBoundary: '', boundaryIncluded: '',
});
const explicitBooleanAnswerMatches = (answer, expected) => (
  (answer === 'yes' || answer === 'no') && (answer === 'yes') === Boolean(expected)
);

// A student's constructed BOUNDARY LINE (ignoring style/shade), from whichever
// of the several valid construction methods they used. Any of these that
// determines a real line is accepted — the task explicitly asks for more than
// one valid procedure per boundary type.
const studentBoundaryLineFromEntry = (entry) => {
  if (!entry) return null;
  if (entry.method === 'points') {
    if (!entry.point1Plotted || !entry.point2Plotted) return null;
    return boundaryFromTwoPoints(
      [parseNumericAnswer(entry.x1), parseNumericAnswer(entry.y1)],
      [parseNumericAnswer(entry.x2), parseNumericAnswer(entry.y2)],
    );
  }
  if (entry.method === 'slopeIntercept') {
    if (!entry.point1Plotted || !entry.point2Plotted) return null;
    const m = parseNumericAnswer(entry.slope);
    const b = parseNumericAnswer(entry.intercept);
    const x1 = parseNumericAnswer(entry.x1);
    const y1 = parseNumericAnswer(entry.y1);
    const x2 = parseNumericAnswer(entry.x2);
    const y2 = parseNumericAnswer(entry.y2);
    // Slope/intercept entries are planning information, not a shortcut that
    // lets the platform manufacture the second point. The candidate line only
    // exists after the student has plotted both points themselves.
    if ([m, b, x1, y1, x2, y2].some((value) => value == null)) return null;
    const fromStudentPoints = boundaryFromTwoPoints([x1, y1], [x2, y2]);
    if (!fromStudentPoints || Math.abs(x1) > 0.08 || Math.abs(y1 - b) > 0.08) return null;
    const movementSlope = (y2 - y1) / (x2 - x1);
    return Math.abs(movementSlope - m) <= 0.08 ? fromStudentPoints : null;
  }
  if (entry.method === 'vertical') {
    const c = parseNumericAnswer(entry.constant);
    return c == null ? null : boundaryFromVertical(c);
  }
  if (entry.method === 'horizontal') {
    const c = parseNumericAnswer(entry.constant);
    return c == null ? null : boundaryFromHorizontal(c);
  }
  return null;
};

// Two lines are the same line — regardless of how each was parameterized —
// exactly when two DISTINCT points of one satisfy the other's equation. This
// is what makes construction validation mathematical rather than
// pixel/format-exact: a student who used slope-intercept is checked the same
// way as one who clicked two points.
const boundaryLinesMatch = (candidate, authored, bounds) => {
  if (!candidate) return false;
  const [p1, p2] = lineSegmentForBounds(authored, bounds);
  return pointOnBoundaryLine(candidate, p1[0], p1[1], 0.08) && pointOnBoundaryLine(candidate, p2[0], p2[1], 0.08);
};

const modelingTermText = (coefficient, symbol, isFirst) => {
  if (coefficient == null || coefficient === 0) return '';
  const magnitude = Math.abs(coefficient) === 1 ? '' : String(Math.abs(coefficient));
  const sign = coefficient < 0 ? '-' : (isFirst ? '' : '+ ');
  return `${isFirst ? sign : ` ${sign}`}${magnitude}${symbol}`;
};

// Renders whatever the student has typed so far, valid or not — this label is
// their own claimed constraint, shown back to them as the thing they are about
// to graph, never the teacher's expected one.
const formatModelingConstraint = (entry, variables) => {
  const [v1, v2] = variables;
  const a = parseNumericAnswer(entry?.coeffA);
  const b = parseNumericAnswer(entry?.coeffB);
  const lhs = `${modelingTermText(a, v1.symbol, true)}${modelingTermText(b, v2.symbol, false)}`.trim();
  const rhs = entry?.constant === '' || entry?.constant == null ? '?' : entry.constant;
  return `${lhs || '0'} ${entry?.relation || '?'} ${rhs}`;
};

const modelingEntryToCanonical = (entry) => {
  if (!entry) return null;
  const a = parseNumericAnswer(entry.coeffA);
  const b = parseNumericAnswer(entry.coeffB);
  const rhs = parseNumericAnswer(entry.constant);
  if (a == null || b == null || rhs == null || !entry.relation) return null;
  if (Math.abs(a) <= 1e-12 && Math.abs(b) <= 1e-12) return null;
  return { A:a, B:b, C:-rhs, relation:entry.relation };
};

const flipInequalityRelation = (relation) => ({
  '>':'<', '>=':'<=', '<':'>', '<=':'>=',
}[relation] || relation);

const equivalentLinearInequality = (actual, expected, tolerance = 1e-6) => {
  if (!actual || !expected) return false;
  const a = [Number(actual.A), Number(actual.B), Number(actual.C)];
  const e = [Number(expected.A), Number(expected.B), Number(expected.C)];
  const pivot = e.findIndex((value) => Math.abs(value) > tolerance);
  if (pivot < 0 || a.some((value) => !Number.isFinite(value)) || e.some((value) => !Number.isFinite(value))) return false;
  const scale = a[pivot] / e[pivot];
  if (!Number.isFinite(scale) || Math.abs(scale) <= tolerance) return false;
  const coefficientsMatch = a.every((value, index) => (
    Math.abs(value - scale * e[index]) <= tolerance * Math.max(1, Math.abs(value), Math.abs(scale * e[index]))
  ));
  if (!coefficientsMatch) return false;
  const expectedRelation = scale > 0 ? expected.relation : flipInequalityRelation(expected.relation);
  return actual.relation === expectedRelation;
};

const modelingEntryCorrect = (entry, expected) => {
  if (!entry || !expected) return false;
  return equivalentLinearInequality(modelingEntryToCanonical(entry), expected);
};

// First miss stays neutral — a nudge to re-examine the work, not the rule
// itself. Only a repeated miss earns a more pointed (still non-revealing)
// follow-up. Matches the platform's staged-feedback philosophy: wrong answers
// do not immediately morph into the right one.
const staged = (attempts, first, later) => (attempts <= 1 ? first : later);

function ConstructionMethodFields({ entry, onChange }) {
  const plottedCoordinate = (label, value) => <Field label={label}><output style={{ ...inputStyle, display:'block', boxSizing:'border-box' }}>{value === '' ? 'Plot on graph' : value}</output></Field>;
  if (entry.method === 'points') {
    return (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:9 }}>
        {plottedCoordinate('Point 1: x', entry.x1)}{plottedCoordinate('Point 1: y', entry.y1)}
        {plottedCoordinate('Point 2: x', entry.x2)}{plottedCoordinate('Point 2: y', entry.y2)}
      </div>
    );
  }
  if (entry.method === 'slopeIntercept') {
    return (
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
        <Field label="Slope (m)"><input type="text" inputMode="text" placeholder="e.g. -2/3" value={entry.slope} onChange={(e)=>onChange('slope', e.target.value)} style={inputStyle}/></Field>
        <Field label="y-intercept (b)"><input type="number" inputMode="decimal" value={entry.intercept} onChange={(e)=>onChange('intercept', e.target.value)} style={inputStyle}/></Field>
        {plottedCoordinate('Plotted intercept: x', entry.x1)}{plottedCoordinate('Plotted intercept: y', entry.y1)}
        {plottedCoordinate('Second point: x', entry.x2)}{plottedCoordinate('Second point: y', entry.y2)}
      </div>
    );
  }
  if (entry.method === 'vertical') {
    return <Field label="x ="><input type="number" inputMode="decimal" value={entry.constant} onChange={(e)=>onChange('constant', e.target.value)} style={inputStyle}/></Field>;
  }
  if (entry.method === 'horizontal') {
    return <Field label="y ="><input type="number" inputMode="decimal" value={entry.constant} onChange={(e)=>onChange('constant', e.target.value)} style={inputStyle}/></Field>;
  }
  return <p style={{ margin:0, fontSize:13, color:'#5f6b7a' }}>Choose how you want to build this boundary.</p>;
}

function TestPointReasoning({ title, point, count, response, setResponse, onBoundaryIndex, askBoundaryProbe = true, inequalityLabels, feedback, onCheck }) {
  if (!point) return null;
  const [x, y] = point;
  return (
    <div style={{ padding:12, border:'1px solid #dbe3ef', borderRadius:10, background:'#f8fbff', marginTop:12 }}>
      <strong style={{ display:'block', marginBottom:6 }}>{title}: ({round(x,3)}, {round(y,3)})</strong>
      <div style={{ display:'grid', gap:8 }}>
        {Array.from({ length: count }).map((_, index) => (
          <Field key={index} label={`Does the point satisfy inequality ${index + 1}? ${inequalityLabels[index] || ''}`}>
            <select
              value={response.perInequality[index] || ''}
              onChange={(e)=>setResponse((current)=>({ ...current, perInequality: current.perInequality.map((value,i)=>i===index?e.target.value:value) }))}
              style={inputStyle}
            >
              <option value="">Choose…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        ))}
        <Field label="Is the point a solution to the entire system?">
          <select value={response.overall} onChange={(e)=>setResponse((current)=>({ ...current, overall:e.target.value }))} style={inputStyle}>
            <option value="">Choose…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        {askBoundaryProbe && onBoundaryIndex >= 0 ? (
          <>
            <Field label="Does this point lie exactly on one of the boundary lines?">
              <select value={response.onBoundary} onChange={(e)=>setResponse((current)=>({ ...current, onBoundary:e.target.value }))} style={inputStyle}>
                <option value="">Choose…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Since it is on that boundary, is it included in the solution region?">
              <select value={response.boundaryIncluded} onChange={(e)=>setResponse((current)=>({ ...current, boundaryIncluded:e.target.value }))} style={inputStyle}>
                <option value="">Choose…</option>
                <option value="yes">Yes — the boundary is solid there</option>
                <option value="no">No — the boundary is dashed there</option>
              </select>
            </Field>
          </>
        ) : null}
      </div>
      <button type="button" onClick={onCheck} style={{ ...actionStyle, marginTop:12 }}>Check this point</button>
      {feedback ? <p style={{ margin:'9px 0 0', color:'#3c4756', lineHeight:1.5 }}>{feedback}</p> : null}
    </div>
  );
}

function StudentBuildInequalityMode({ questionData, onAction, draftKey = null }) {
  const inequalityConfig = normalizeSystemsWorkspaceInequalityConfig(questionData);
  const buildConfig = inequalityConfig.studentBuild;
  const reasoningConfig = inequalityConfig.reasoning;
  const hasBuildSteps = Object.values(buildConfig).some(Boolean);
  const legacyStudentBuild = questionData.studentBuild === true;
  const bounds = questionData.graph || { xMin:-6, xMax:8, yMin:-4, yMax:10 };
  const modeling = questionData.modeling || null;
  const variables = modeling?.variables?.length ? modeling.variables : [{ symbol:'x', label:'x' }, { symbol:'y', label:'y' }];
  // Source constraints are presentation; expected constraints are hidden,
  // canonical grading truth. Never derive a student-facing label from the
  // latter merely because the canonical engine consumes it.
  const sourceConstraints = questionData.sourceConstraints || questionData.inequalities || DEFAULT_INEQUALITIES;
  const rawExpectedConstraints = questionData.expectedConstraints || questionData.inequalities || DEFAULT_INEQUALITIES;
  const expectedConstraints = useMemo(() => (
    modeling
      ? (modeling.expectedConstraints || []).map((c) => ({ A:Number(c.A ?? 0), B:Number(c.B ?? 0), C:Number(c.C ?? 0), relation:c.relation || '>=' }))
      : rawExpectedConstraints.map(authoredBoundaryFromInequality)
  ), [modeling, rawExpectedConstraints]);
  const constraintCount = expectedConstraints.length;
  const askClassification = questionData.askClassification != null
    ? Boolean(questionData.askClassification)
    : (legacyStudentBuild || reasoningConfig.classifyRegion);
  const askVertices = questionData.askVertices != null
    ? Boolean(questionData.askVertices)
    : reasoningConfig.vertices;
  const boundaryProbeEnabled = legacyStudentBuild || reasoningConfig.boundaryProbe;
  const teacherTestPoint = questionData.testPoint || null;
  const testPointReasoningEnabled = legacyStudentBuild
    ? Boolean(teacherTestPoint || questionData.allowStudentTestPoint)
    : (reasoningConfig.testPoint || Boolean(teacherTestPoint) || Boolean(questionData.allowStudentTestPoint));
  const allowStudentTestPoint = questionData.allowStudentTestPoint != null
    ? Boolean(questionData.allowStudentTestPoint)
    : (reasoningConfig.testPoint && !teacherTestPoint);

  const [modelingEntries, setModelingEntries] = usePersistentToolState('modelingEntries', () => (
    modeling ? Array.from({ length: constraintCount }, emptyModelingEntry) : []
  ));
  const [modelingSent, setModelingSent] = usePersistentToolState('modelingSent', !modeling);
  const [build, setBuild] = usePersistentToolState('build', () => Array.from({ length: constraintCount }, emptyBuildEntry));
  const [rewriteEntries, setRewriteEntries] = usePersistentToolState('rewriteEntries', () => (
    sourceConstraints.map((constraint) => emptyRewriteEntry(typeof constraint === 'string' ? constraint : formatInequality(constraint)))
  ));
  const modeledConstraints = useMemo(() => (
    modeling ? modelingEntries.map(modelingEntryToCanonical) : []
  ), [modeling, modelingEntries]);
  const workingConstraints = useMemo(() => {
    if (modeling && modelingSent && modeledConstraints.every(Boolean)) return modeledConstraints;
    if (buildConfig.rewrite) return expectedConstraints.map((expected, index) => rewriteEntries[index]?.verifiedConstraint || expected);
    return expectedConstraints;
  }, [modeling, modelingSent, modeledConstraints, buildConfig.rewrite, rewriteEntries, expectedConstraints]);
  const workingClassification = useMemo(() => classifyFeasibleRegion(workingConstraints), [workingConstraints]);
  const workingVertices = useMemo(() => feasibleRegionVertices(workingConstraints), [workingConstraints]);
  const modelingEntriesReady = !modeling || modeledConstraints.length === constraintCount && modeledConstraints.every(Boolean);
  const [activeIndex, setActiveIndex] = usePersistentToolState('activeIndex', 0);
  const [armed, setArmed] = useState(null);
  const [combined, setCombined] = usePersistentToolState('combined', false);
  const [regionClassification, setRegionClassification] = usePersistentToolState('regionClassification', '');
  const [regionClassificationAttempts, setRegionClassificationAttempts] = usePersistentToolState('regionClassificationAttempts', 0);
  const [teacherPointResponse, setTeacherPointResponse] = usePersistentToolState('teacherPointResponse', () => emptyTestPointResponse(constraintCount));
  const [studentTestPoint, setStudentTestPoint] = usePersistentToolState('studentTestPoint', null);
  const [studentPointResponse, setStudentPointResponse] = usePersistentToolState('studentPointResponse', () => emptyTestPointResponse(constraintCount));
  const [vertices, setVertices] = usePersistentToolState('vertices', []);
  const { feedback, submit } = useToolSubmission(onAction);

  const mathState = useMemo(() => ({
    modelingEntries, modelingSent, rewriteEntries, build, combined, regionClassification, regionClassificationAttempts,
    teacherPointResponse, studentTestPoint, studentPointResponse, vertices,
  }), [modelingEntries, modelingSent, rewriteEntries, build, combined, regionClassification, regionClassificationAttempts, teacherPointResponse, studentTestPoint, studentPointResponse, vertices]);
  const restore = useCallback((value) => {
    setModelingEntries(value?.modelingEntries || (modeling ? Array.from({ length: constraintCount }, emptyModelingEntry) : []));
    setModelingSent(value?.modelingSent ?? !modeling);
    setRewriteEntries(value?.rewriteEntries || sourceConstraints.map((constraint) => emptyRewriteEntry(typeof constraint === 'string' ? constraint : formatInequality(constraint))));
    setBuild(value?.build || Array.from({ length: constraintCount }, emptyBuildEntry));
    setCombined(Boolean(value?.combined));
    setRegionClassification(value?.regionClassification || '');
    setRegionClassificationAttempts(Number(value?.regionClassificationAttempts) || 0);
    setTeacherPointResponse(value?.teacherPointResponse || emptyTestPointResponse(constraintCount));
    setStudentTestPoint(value?.studentTestPoint || null);
    setStudentPointResponse(value?.studentPointResponse || emptyTestPointResponse(constraintCount));
    setVertices(value?.vertices || []);
  }, [constraintCount, modeling, sourceConstraints]);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last student-build edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });

  const reopenModeling = () => {
    if (!modeling) return;
    setModelingSent(false);
    setCombined(false);
    setRegionClassification('');
    setRegionClassificationAttempts(0);
    setTeacherPointResponse(emptyTestPointResponse(constraintCount));
    setStudentTestPoint(null);
    setStudentPointResponse(emptyTestPointResponse(constraintCount));
    setVertices([]);
  };

  const inequalityLabel = (index) => {
    if (modeling) return formatModelingConstraint(modelingEntries[index], variables);
    if (buildConfig.rewrite && rewriteEntries[index]?.verifiedConstraint) {
      return formatSlopeInterceptInequality(rewriteEntries[index].verifiedConstraint);
    }
    const source = sourceConstraints[index];
    return typeof source === 'string' ? source : formatInequality(source);
  };

  const updateBuildEntry = (index, patch) => setBuild((current) => current.map((entry, i) => (i === index ? { ...entry, ...(typeof patch === 'function' ? patch(entry) : patch) } : entry)));
  const updateModelingEntry = (index, key, value) => setModelingEntries((current) => current.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));

  const studentLines = build.map(studentBoundaryLineFromEntry);
  const effectiveLines = build.map((entry, index) => (
    buildConfig.boundary ? studentLines[index] : workingConstraints[index]
  ));
  const boundaryCorrect = (index) => !buildConfig.boundary || boundaryLinesMatch(studentLines[index], workingConstraints[index], bounds);
  const styleCorrect = (index) => !buildConfig.lineStyle
    || build[index]?.style === (String(workingConstraints[index]?.relation || '>=').includes('=') ? 'solid' : 'dashed');
  const shadeCorrect = (index) => {
    if (!buildConfig.shading) return true;
    const point = build[index]?.shadePoint;
    return Boolean(point) && satisfiesBoundary(workingConstraints[index], point[0], point[1]);
  };
  const boundaryVerified = (index) => !buildConfig.boundary || (build[index]?.boundaryAttempts > 0 && boundaryCorrect(index));
  const styleVerified = (index) => !buildConfig.lineStyle || (build[index]?.styleAttempts > 0 && styleCorrect(index));
  const shadeVerified = (index) => !buildConfig.shading || (build[index]?.shadeAttempts > 0 && shadeCorrect(index));
  const rewriteVerified = (index) => !buildConfig.rewrite || Boolean(rewriteEntries[index]?.verifiedConstraint);
  const constraintVerified = (index) => rewriteVerified(index) && boundaryVerified(index) && styleVerified(index) && shadeVerified(index);
  const allConstraintsComplete = constraintCount > 0 && Array.from({ length: constraintCount }, (_, i) => i).every(constraintVerified);

  const studentBoundaries = build.map((entry, index) => {
    const line = effectiveLines[index];
    if (!line) return null;
    if (!buildConfig.shading) return workingConstraints[index];
    if (!entry.shadePoint) return null;
    const side = sideOfBoundaryLine(line, entry.shadePoint[0], entry.shadePoint[1]);
    if (side === 0) return null;
    const strict = buildConfig.lineStyle
      ? entry.style === 'dashed'
      : !String(workingConstraints[index]?.relation || '>=').includes('=');
    return boundaryWithChosenSide(line, side, strict);
  });
  const studentPolygon = combined && studentBoundaries.every(Boolean) ? feasibleRegionPolygonGeneral(studentBoundaries, bounds) : [];

  const onBoundaryIndex = (point) => (point ? workingConstraints.findIndex((b) => pointOnBoundaryLine(b, point[0], point[1], 0.12)) : -1);
  const membership = (point) => workingConstraints.map((b) => satisfiesBoundary(b, point[0], point[1]));

  const armLabel = () => {
    if (!armed) return null;
    if (armed.type === 'boundaryPoint') return `Tap the graph to place boundary point ${armed.which} for constraint ${armed.index + 1}.`;
    if (armed.type === 'shade') return `Tap anywhere on the side of the line that should be shaded for constraint ${armed.index + 1}.`;
    if (armed.type === 'vertex') return 'Tap where two boundary lines cross to record a vertex.';
    if (armed.type === 'testPoint') return 'Tap the graph to place your own test point.';
    return null;
  };

  const handlePlot = (point) => {
    if (!armed) return;
    if ((armed.type === 'boundaryPoint' || armed.type === 'shade') && !rewriteVerified(armed.index)) return;
    const [px, py] = point;
    if (armed.type === 'boundaryPoint') {
      updateBuildEntry(armed.index, armed.which === 1 ? { x1: px, y1: py, point1Plotted:true } : { x2: px, y2: py, point2Plotted:true });
    } else if (armed.type === 'shade') {
      updateBuildEntry(armed.index, { shadePoint: [px, py] });
    } else if (armed.type === 'vertex') {
      const snapTolerance = Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin) * 0.05;
      let best = null;
      let bestDistance = Infinity;
      [...workingVertices, ...feasibleRegionVertices(studentBoundaries.filter(Boolean))].forEach((v) => {
        const distance = Math.hypot(v.x - px, v.y - py);
        if (distance < bestDistance) { bestDistance = distance; best = v; }
      });
      const landed = best && bestDistance <= snapTolerance ? { x: best.x, y: best.y } : { x: px, y: py };
      setVertices((current) => {
        if (current.some((v) => Math.hypot(v.x - landed.x, v.y - landed.y) <= 1e-6)) return current;
        return [...current, { x: landed.x, y: landed.y, includedAnswer: '' }];
      });
    } else if (armed.type === 'testPoint') {
      setStudentTestPoint([px, py]);
      setStudentPointResponse(emptyTestPointResponse(constraintCount));
    }
    setArmed(null);
  };

  const boundaryMessage = (index) => {
    const entry = build[index];
    if (!entry.boundaryAttempts) return null;
    if (boundaryCorrect(index)) return 'Correct boundary.';
    return staged(entry.boundaryAttempts,
      'Check whether the points you used satisfy the boundary equation.',
      'Replace the inequality with = to get the boundary equation, then confirm both of your points make that equation true.');
  };
  const styleMessage = (index) => {
    const entry = build[index];
    if (!entry.styleAttempts || !entry.style) return null;
    if (styleCorrect(index)) return 'Correct line style.';
    return staged(entry.styleAttempts,
      'Check whether points on the boundary are included.',
      'Look at the relation symbol itself — does it allow the two sides to be equal?');
  };
  const shadeMessage = (index) => {
    const entry = build[index];
    if (!entry.shadeAttempts || !entry.shadePoint) return null;
    if (shadeCorrect(index)) return 'Correct shading.';
    return staged(entry.shadeAttempts,
      'Use a test point or compare the inequality to its boundary.',
      'Substitute the coordinates you shaded into the original inequality. If it is false, shade the other side instead.');
  };

  const [teacherPointFeedback, setTeacherPointFeedback] = useState('');
  const [studentPointFeedback, setStudentPointFeedback] = useState('');
  const checkPointResponse = (point, response, setFeedbackText) => {
    if (!point) return;
    const expectedMembership = membership(point);
    const perInequalityCorrect = response.perInequality.every((value, index) => explicitBooleanAnswerMatches(value, expectedMembership[index]));
    const overallCorrect = explicitBooleanAnswerMatches(response.overall, expectedMembership.every(Boolean));
    const boundaryIndex = onBoundaryIndex(point);
    const boundaryProbeCorrect = !boundaryProbeEnabled || boundaryIndex < 0 || (
      (response.onBoundary === 'yes') && explicitBooleanAnswerMatches(response.boundaryIncluded, expectedMembership.every(Boolean))
    );
    if (perInequalityCorrect && overallCorrect && boundaryProbeCorrect) { setFeedbackText('Correct — every part of your reasoning about this point checks out.'); return; }
    if (!perInequalityCorrect) { setFeedbackText('At least one individual inequality is misjudged. Substitute the point into that inequality by itself and see whether the statement is true.'); return; }
    if (!overallCorrect) { setFeedbackText('Your individual inequality answers are right, but the system verdict is not. A point solves the system only when it satisfies every inequality at once.'); return; }
    setFeedbackText(boundaryProbeEnabled && boundaryIndex >= 0
      ? 'Re-examine whether this exact boundary is drawn solid or dashed at this point.'
      : 'Not quite — recheck your reasoning.');
  };

  const vertexIncludedExpected = (vertex) => {
    const match = workingVertices.find((v) => Math.hypot(v.x - vertex.x, v.y - vertex.y) <= 0.15);
    return match ? match.included : null;
  };
  const [vertexFeedback, setVertexFeedback] = useState('');
  const checkVertex = (index) => {
    const vertex = vertices[index];
    const expected = vertexIncludedExpected(vertex);
    if (expected == null) { setVertexFeedback('That point does not look like a corner of this system yet. Try tapping exactly where two boundary lines cross.'); return; }
    const correct = explicitBooleanAnswerMatches(vertex.includedAnswer, expected);
    setVertexFeedback(correct
      ? 'Correct — you identified whether this corner is actually part of the solution set.'
      : 'Look at the two boundaries meeting at that exact point. If either one is dashed there, the corner is excluded even though the lines still cross.');
  };

  const finalCheck = () => {
    const perConstraint = Array.from({ length: constraintCount }, (_, index) => ({
      rewriteVerified: buildConfig.rewrite ? rewriteVerified(index) : null,
      boundaryCorrect: buildConfig.boundary ? boundaryCorrect(index) : null,
      styleCorrect: buildConfig.lineStyle ? styleCorrect(index) : null,
      inclusionUnderstandingCorrect: buildConfig.lineStyle ? styleCorrect(index) : null,
      shadeCorrect: buildConfig.shading ? shadeCorrect(index) : null,
      constraintCorrect: hasBuildSteps ? constraintVerified(index) : null,
    }));
    const modelingChecks = modeling ? (() => {
      // A mathematical model is a SET of constraints, not an ordered answer
      // list. Match each student-authored inequality to one still-unmatched
      // expected constraint so an equivalent system earns full credit no
      // matter which valid constraint the student entered first. Keeping
      // expected rows single-use also prevents a duplicated correct constraint
      // from satisfying two requirements.
      const unmatchedExpected = new Set(expectedConstraints.map((_, index) => index));
      return modelingEntries.map((entry) => {
        const matchedIndex = expectedConstraints.findIndex((expected, index) => (
          unmatchedExpected.has(index) && modelingEntryCorrect(entry, expected)
        ));
        if (matchedIndex < 0) return false;
        unmatchedExpected.delete(matchedIndex);
        return true;
      });
    })() : [];
    const classificationCorrect = !askClassification || regionClassification === workingClassification;
    const noSolutionRecognized = workingClassification !== 'empty' || regionClassification === 'empty';
    const teacherPointApplicable = Boolean(teacherTestPoint);
    const teacherMembership = teacherPointApplicable ? membership([teacherTestPoint.x, teacherTestPoint.y]) : [];
    const teacherPerInequalityCorrect = teacherPointApplicable && teacherPointResponse.perInequality.every((value, index) => explicitBooleanAnswerMatches(value, teacherMembership[index]));
    const teacherOverallCorrect = teacherPointApplicable && explicitBooleanAnswerMatches(teacherPointResponse.overall, teacherMembership.every(Boolean));
    const teacherBoundaryIndex = teacherPointApplicable ? onBoundaryIndex([teacherTestPoint.x, teacherTestPoint.y]) : -1;
    const teacherBoundaryApplicable = teacherPointApplicable && boundaryProbeEnabled && teacherBoundaryIndex >= 0;
    const teacherBoundaryCorrect = !teacherBoundaryApplicable
      || (teacherPointResponse.onBoundary === 'yes' && explicitBooleanAnswerMatches(teacherPointResponse.boundaryIncluded, teacherMembership.every(Boolean)));
    const studentPointApplicable = allowStudentTestPoint && Boolean(studentTestPoint);
    const studentMembership = studentPointApplicable ? membership(studentTestPoint) : [];
    const studentPerInequalityCorrect = studentPointApplicable && studentPointResponse.perInequality.every((value, index) => explicitBooleanAnswerMatches(value, studentMembership[index]));
    const studentOverallCorrect = studentPointApplicable && explicitBooleanAnswerMatches(studentPointResponse.overall, studentMembership.every(Boolean));
    const vertexResults = vertices.map((vertex) => {
      const expected = vertexIncludedExpected(vertex);
      return {
        vertexCorrect: expected != null && explicitBooleanAnswerMatches(vertex.includedAnswer, expected),
        excludedBoundaryRecognized: expected === false ? vertex.includedAnswer === 'no' : null,
      };
    });
    const allExpectedVerticesFound = workingVertices.every((expected) => (
      vertices.some((vertex) => Math.hypot(vertex.x - expected.x, vertex.y - expected.y) <= 0.15)
    ));
    const vertexCoverageCorrect = !askVertices || (
      vertices.length === workingVertices.length
      && allExpectedVerticesFound
      && vertexResults.every((result) => result.vertexCorrect)
    );

    const parts = [
      ...(hasBuildSteps ? perConstraint.map((entry) => entry.constraintCorrect) : []),
      ...modelingChecks,
      ...(askClassification ? [classificationCorrect] : []),
      ...(testPointReasoningEnabled && teacherPointApplicable ? [teacherPerInequalityCorrect, teacherOverallCorrect] : []),
      ...(teacherBoundaryApplicable ? [teacherBoundaryCorrect] : []),
      ...(testPointReasoningEnabled && studentPointApplicable ? [studentPerInequalityCorrect, studentOverallCorrect] : []),
      ...(askVertices ? [vertexCoverageCorrect] : []),
    ];
    const score = parts.length ? parts.filter(Boolean).length / parts.length : 0;
    const isCorrect = parts.length > 0 && parts.every(Boolean);

    submit(
      { isCorrect, score },
      {
        modelingEntries: modeling ? modelingEntries : undefined,
        build,
        regionClassification,
        teacherPointResponse: teacherPointApplicable ? teacherPointResponse : undefined,
        studentTestPoint: studentPointApplicable ? studentTestPoint : undefined,
        studentPointResponse: studentPointApplicable ? studentPointResponse : undefined,
        vertices,
      },
      {
        mode: 'inequalities-studentBuild',
        checks: {
          perConstraint,
          modelingCorrect: modeling ? modelingChecks : null,
          overlapClassificationCorrect: askClassification ? classificationCorrect : null,
          noSolutionCorrectlyRecognized: askClassification ? noSolutionRecognized : null,
          testPointMembershipCorrect: testPointReasoningEnabled && teacherPointApplicable ? teacherOverallCorrect : null,
          boundaryPointInclusionCorrect: teacherBoundaryApplicable ? teacherBoundaryCorrect : null,
          studentTestPointMembershipCorrect: testPointReasoningEnabled && studentPointApplicable ? studentOverallCorrect : null,
          vertexResults: askVertices ? vertexResults : null,
          vertexCoverageCorrect: askVertices ? vertexCoverageCorrect : null,
          fullSystemCorrect: isCorrect,
        },
      },
    );
  };

  const graphPoints = [
    ...build.flatMap((entry, index) => [
      ...(parseNumericAnswer(entry.x1) != null && parseNumericAnswer(entry.y1) != null ? [{ x:Number(entry.x1), y:Number(entry.y1), label:`C${index + 1} point 1`, fill:INEQUALITY_COLORS[index % INEQUALITY_COLORS.length] }] : []),
      ...(parseNumericAnswer(entry.x2) != null && parseNumericAnswer(entry.y2) != null ? [{ x:Number(entry.x2), y:Number(entry.y2), label:`C${index + 1} point 2`, fill:INEQUALITY_COLORS[index % INEQUALITY_COLORS.length] }] : []),
    ]),
    ...(teacherTestPoint ? [{ x:teacherTestPoint.x, y:teacherTestPoint.y, label:'Teacher point', fill:'#8a3ffc' }] : []),
    ...(studentTestPoint ? [{ x:studentTestPoint[0], y:studentTestPoint[1], label:'Your point', fill:'#b06000' }] : []),
    ...vertices.map((v, index) => ({ x:v.x, y:v.y, label:`Vertex ${index + 1}`, fill:'#188038' })),
  ];

  return (
    <EnlargeableFigure label="Student-build inequality workspace" enlargeLabel="Enlarge system workspace" style={{ width:'100%' }} capabilities={{
      undo: undoHistory.capability,
      equationInput: { label: modeling ? 'Constraints you write' : 'Every inequality', studentState: true },
      numericControls: { label: 'Boundary, style, shading and reasoning controls', studentState: true },
      pointEditing: { label: 'Boundary points, shading side, test points and vertices', studentState: true },
      instruction: { text: hasBuildSteps
        ? 'Complete the enabled boundary, line-style, and shading steps, then combine and reason about the result.'
        : 'Use the provided system to combine regions and complete the requested reasoning.' },
      primaryActions: [{ id: 'check-student-build', label: 'Check my work', onAction: finalCheck }],
    }}>
      <ToolSplit>
        <Panel title={modeling && !modelingSent ? 'Define your constraints' : 'Your graph'}>
          {modeling && !modelingSent ? (
            <p style={{ margin:'0 0 12px', fontSize:13, color:'#5f6b7a' }}>
              Using {variables.map((v)=>`${v.symbol} = ${v.label}`).join(' and ')}, write each constraint below. Send them to the workspace once every constraint has valid variable coefficients, a relation, and a constant.
            </p>
          ) : (
            <>
              {armLabel() ? <p style={{ margin:'0 0 8px', fontSize:13, fontWeight:700, color:'#174ea6' }}>{armLabel()}</p> : null}
              <CoordinatePlane
                xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 8} yMin={bounds.yMin ?? -4} yMax={bounds.yMax ?? 10}
                onPlot={handlePlot}
                points={graphPoints}
                ariaLabel="Student-constructed graph of the inequality system"
                enlargeable={false}
              >
                {({ sx, sy }) => (
                  <>
                    {build.map((entry, index) => {
                      if (entry.visible === false) return null;
                      const line = effectiveLines[index];
                      if (!line) return null;
                      const [p1, p2] = lineSegmentForBounds(line, bounds);
                      const color = INEQUALITY_COLORS[index % INEQUALITY_COLORS.length];
                      const renderedStyle = buildConfig.lineStyle
                        ? entry.style
                        : (String(workingConstraints[index]?.relation || '>=').includes('=') ? 'solid' : 'dashed');
                      return (
                        <line key={`line${index}`} x1={sx(p1[0])} y1={sy(p1[1])} x2={sx(p2[0])} y2={sy(p2[1])}
                          stroke={color} strokeWidth="3"
                          strokeDasharray={renderedStyle === 'dashed' ? '10 6' : renderedStyle === 'solid' ? undefined : '3 5'}
                          strokeOpacity={renderedStyle ? 1 : 0.55}
                        />
                      );
                    })}
                    {build.map((entry, index) => {
                      if (!buildConfig.shading || entry.visible === false || !entry.shadePoint) return null;
                      const line = effectiveLines[index];
                      if (!line) return null;
                      const side = sideOfBoundaryLine(line, entry.shadePoint[0], entry.shadePoint[1]);
                      if (side === 0) return null;
                      const shaded = feasibleRegionPolygonGeneral([boundaryWithChosenSide(line, side, false)], bounds);
                      if (shaded.length < 3) return null;
                      return (
                        <polygon key={`shade${index}`} points={shaded.map(([px,py])=>`${sx(px)},${sy(py)}`).join(' ')}
                          fill={INEQUALITY_COLORS[index % INEQUALITY_COLORS.length]} fillOpacity="0.12" stroke="none" />
                      );
                    })}
                    {combined && studentPolygon.length >= 3 ? (
                      <polygon points={studentPolygon.map(([px,py])=>`${sx(px)},${sy(py)}`).join(' ')} fill="rgba(31, 157, 85, 0.2)" stroke="#16884b" strokeWidth="2" />
                    ) : null}
                  </>
                )}
              </CoordinatePlane>
              <p style={{ fontSize:13, color:'#5f6b7a' }}>
                {buildConfig.boundary && buildConfig.lineStyle && buildConfig.shading
                  ? 'Nothing here is drawn for you — every line, style, and shaded side is the one you built.'
                  : 'Only the construction steps this question asks you to complete are student-built; provided features are shown so you can focus on the assigned reasoning.'}
              </p>
            </>
          )}
        </Panel>

        <Panel title="Build, check, and reason">
          {modeling && !modelingSent ? (
            <div style={{ display:'grid', gap:14 }}>
              {modelingEntries.map((entry, index) => (
                <div key={index} style={{ padding:12, border:'1px solid #dbe3ef', borderRadius:10, background:'#f8fbff' }}>
                  <strong style={{ display:'block', marginBottom:9 }}>Constraint {index + 1}: {formatModelingConstraint(entry, variables)}</strong>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:9 }}>
                    <Field label={`Coefficient of ${variables[0].symbol}`}><input type="number" inputMode="decimal" value={entry.coeffA} onChange={(e)=>updateModelingEntry(index,'coeffA',e.target.value)} style={inputStyle}/></Field>
                    <Field label={`Coefficient of ${variables[1].symbol}`}><input type="number" inputMode="decimal" value={entry.coeffB} onChange={(e)=>updateModelingEntry(index,'coeffB',e.target.value)} style={inputStyle}/></Field>
                    <Field label="Relation">
                      <select value={entry.relation} onChange={(e)=>updateModelingEntry(index,'relation',e.target.value)} style={inputStyle}>
                        <option value=">=">≥</option><option value=">">&gt;</option><option value="<=">≤</option><option value="<">&lt;</option>
                      </select>
                    </Field>
                    <Field label="Constant"><input type="number" inputMode="decimal" value={entry.constant} onChange={(e)=>updateModelingEntry(index,'constant',e.target.value)} style={inputStyle}/></Field>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={()=>setModelingSent(true)}
                disabled={!modelingEntriesReady}
                style={{ ...actionStyle, opacity: modelingEntriesReady ? 1 : 0.5 }}
              >
                Send constraints to Systems Workspace
              </button>
            </div>
          ) : (
            <div style={{ display:'grid', gap:14 }}>
              {modeling ? (
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <button type="button" onClick={reopenModeling} style={{ ...actionStyle, marginTop:0, padding:'8px 12px', fontSize:12 }}>
                    Edit constraints
                  </button>
                </div>
              ) : null}
              {build.map((entry, index) => (
                <div key={index} style={{ padding:12, border: activeIndex === index ? '2px solid #1a73e8' : '1px solid #dbe3ef', borderRadius:10, background:'#f8fbff' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:9 }}>
                    <button type="button" aria-expanded={activeIndex === index} onClick={()=>setActiveIndex((current)=>current === index ? null : index)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>
                      <strong>{activeIndex === index ? '▾' : '▸'} Constraint {index + 1}: {inequalityLabel(index)}</strong>
                    </button>
                    <label style={{ fontSize:12, color:'#5f6b7a', display:'flex', alignItems:'center', gap:5 }}>
                      <input type="checkbox" checked={entry.visible !== false} onChange={(e)=>updateBuildEntry(index, { visible:e.target.checked })} /> Show
                    </label>
                  </div>
                  <div style={{ display:'flex', gap:10, fontSize:12, fontWeight:800, marginBottom:10 }}>
                    <span style={{ color: rewriteVerified(index) ? '#137333' : '#5f6b7a' }}>Rewrite {buildConfig.rewrite ? (rewriteVerified(index) ? '✓' : '…') : 'provided'}</span>
                    <span style={{ color: boundaryVerified(index) ? '#137333' : '#5f6b7a' }}>Boundary {buildConfig.boundary ? (boundaryVerified(index) ? '✓' : '…') : 'provided'}</span>
                    <span style={{ color: styleVerified(index) ? '#137333' : '#5f6b7a' }}>Line style {buildConfig.lineStyle ? (styleVerified(index) ? '✓' : '…') : 'provided'}</span>
                    <span style={{ color: shadeVerified(index) ? '#137333' : '#5f6b7a' }}>Region {buildConfig.shading ? (shadeVerified(index) ? '✓' : '…') : 'provided'}</span>
                  </div>
                  {activeIndex === index ? (
                    <div style={{ display:'grid', gap:12 }}>
                      {buildConfig.rewrite && !rewriteEntries[index]?.verifiedConstraint ? (
                        <EmbeddedInequalityRewrite
                          source={rewriteEntries[index]?.source || inequalityLabel(index)}
                          expectedConstraint={expectedConstraints[index]}
                          value={rewriteEntries[index]}
                          onChange={(next)=>setRewriteEntries((current)=>current.map((item,i)=>i===index?next:item))}
                          draftKey={draftKey ? `${draftKey}:systems-rewrite:${index}` : null}
                        />
                      ) : null}
                      {(!buildConfig.rewrite || rewriteEntries[index]?.verifiedConstraint) ? <>
                      {buildConfig.boundary ? (
                      <div>
                        <Field label="How will you build this boundary?">
                          <select value={entry.method} onChange={(e)=>updateBuildEntry(index, { method:e.target.value })} style={inputStyle}>
                            <option value="">Choose a method…</option>
                            {CONSTRUCTION_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        </Field>
                        {entry.method ? (
                          <div style={{ marginTop:9 }}>
                            <ConstructionMethodFields entry={entry} onChange={(key,value)=>updateBuildEntry(index, { [key]:value })} />
                            {['points','slopeIntercept'].includes(entry.method) ? (
                              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                                <button type="button" onClick={()=>setArmed({ type:'boundaryPoint', index, which:1 })} style={{ ...actionStyle, marginTop:0, padding:'8px 12px', fontSize:12 }}>Place point 1 on graph</button>
                                <button type="button" onClick={()=>setArmed({ type:'boundaryPoint', index, which:2 })} style={{ ...actionStyle, marginTop:0, padding:'8px 12px', fontSize:12 }}>Place point 2 on graph</button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <button type="button" onClick={()=>updateBuildEntry(index, { boundaryAttempts: entry.boundaryAttempts + 1 })} style={{ ...actionStyle, padding:'8px 14px', fontSize:13 }}>Check boundary</button>
                        {boundaryMessage(index) ? <p style={{ margin:'6px 0 0', fontSize:13, color:'#3c4756' }}>{boundaryMessage(index)}</p> : null}
                      </div>
                      ) : null}

                      {buildConfig.lineStyle ? (
                      <div>
                        <Field label="Is this boundary solid or dashed?">
                          <div style={{ display:'flex', gap:8 }}>
                            <button type="button" onClick={()=>updateBuildEntry(index, { style:'solid' })} style={{ ...actionStyle, marginTop:0, background: entry.style==='solid' ? '#174ea6' : '#eef4ff', color: entry.style==='solid' ? '#fff' : '#174ea6' }}>Solid</button>
                            <button type="button" onClick={()=>updateBuildEntry(index, { style:'dashed' })} style={{ ...actionStyle, marginTop:0, background: entry.style==='dashed' ? '#174ea6' : '#eef4ff', color: entry.style==='dashed' ? '#fff' : '#174ea6' }}>Dashed</button>
                          </div>
                        </Field>
                        <button type="button" onClick={()=>updateBuildEntry(index, { styleAttempts: entry.styleAttempts + 1 })} style={{ ...actionStyle, padding:'8px 14px', fontSize:13 }}>Check line style</button>
                        {styleMessage(index) ? <p style={{ margin:'6px 0 0', fontSize:13, color:'#3c4756' }}>{styleMessage(index)}</p> : null}
                      </div>
                      ) : null}

                      {buildConfig.shading ? (
                      <div>
                        <button type="button" onClick={()=>setArmed({ type:'shade', index })} style={{ ...actionStyle, marginTop:0 }}>Tap the side of the graph to shade</button>
                        {entry.shadePoint ? <p style={{ margin:'6px 0 0', fontSize:12, color:'#5f6b7a' }}>Shaded through ({round(entry.shadePoint[0],2)}, {round(entry.shadePoint[1],2)}).</p> : null}
                        <button type="button" onClick={()=>updateBuildEntry(index, { shadeAttempts: entry.shadeAttempts + 1 })} style={{ ...actionStyle, padding:'8px 14px', fontSize:13 }}>Check shading</button>
                        {shadeMessage(index) ? <p style={{ margin:'6px 0 0', fontSize:13, color:'#3c4756' }}>{shadeMessage(index)}</p> : null}
                      </div>
                      ) : null}
                      </> : <p style={{ margin:0, color:'#5f6b7a' }}>Graph construction unlocks after your rewrite is verified.</p>}
                    </div>
                  ) : null}
                </div>
              ))}

              <div style={{ padding:12, border:'1px solid #dbe3ef', borderRadius:10, background: allConstraintsComplete ? '#f0fbf4' : '#f3f4f6' }}>
                <strong>Combined solution</strong>
                <p style={{ margin:'6px 0 10px', fontSize:13, color:'#5f6b7a' }}>
                  {allConstraintsComplete ? 'Every constraint checks out. Combine them to see your overlap region.' : 'Locked until every constraint above is correct.'}
                </p>
                <button type="button" onClick={()=>setCombined(true)} disabled={!allConstraintsComplete} style={{ ...actionStyle, opacity: allConstraintsComplete ? 1 : 0.5 }}>Find overlap / Combine regions</button>
              </div>

              {combined && askClassification ? (
                <div style={{ padding:12, border:'1px solid #dbe3ef', borderRadius:10, background:'#f8fbff' }}>
                  <Field label="How would you classify the combined solution region?">
                    <select value={regionClassification} onChange={(e)=>setRegionClassification(e.target.value)} style={inputStyle}>
                      <option value="">Choose…</option>
                      <option value="bounded">Bounded region</option>
                      <option value="unbounded">Unbounded region</option>
                      <option value="empty">No solution</option>
                    </select>
                  </Field>
                  <button type="button" onClick={()=>setRegionClassificationAttempts((n)=>n+1)} style={{ ...actionStyle, padding:'8px 14px', fontSize:13 }}>Check classification</button>
                  {regionClassificationAttempts > 0 && regionClassification ? (
                    <p style={{ margin:'6px 0 0', fontSize:13, color:'#3c4756' }}>
                      {regionClassification === workingClassification
                        ? 'Correct classification.'
                        : staged(regionClassificationAttempts,
                          'Look at whether the shaded overlap keeps going forever in some direction, closes into a polygon, or never forms at all.',
                          'A region is unbounded when the constraints leave a direction open forever. If no point satisfies every inequality at once, there is no solution.')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {combined && testPointReasoningEnabled && (teacherTestPoint || allowStudentTestPoint) ? (
                <div>
                  <strong style={{ display:'block', marginBottom:6 }}>Test a point</strong>
                  {teacherTestPoint ? (
                    <TestPointReasoning
                      title="Teacher point" point={[teacherTestPoint.x, teacherTestPoint.y]} count={constraintCount}
                      response={teacherPointResponse} setResponse={setTeacherPointResponse}
                      onBoundaryIndex={onBoundaryIndex([teacherTestPoint.x, teacherTestPoint.y])}
                      askBoundaryProbe={boundaryProbeEnabled}
                      inequalityLabels={Array.from({ length: constraintCount }, (_, i) => inequalityLabel(i))}
                      feedback={teacherPointFeedback}
                      onCheck={()=>checkPointResponse([teacherTestPoint.x, teacherTestPoint.y], teacherPointResponse, setTeacherPointFeedback)}
                    />
                  ) : null}
                  {allowStudentTestPoint ? (
                    <div style={{ marginTop:12 }}>
                      <button type="button" onClick={()=>setArmed({ type:'testPoint' })} style={actionStyle}>Pick your own test point</button>
                      <TestPointReasoning
                        title="Your point" point={studentTestPoint} count={constraintCount}
                        response={studentPointResponse} setResponse={setStudentPointResponse}
                        onBoundaryIndex={studentTestPoint ? onBoundaryIndex(studentTestPoint) : -1}
                        askBoundaryProbe={boundaryProbeEnabled}
                        inequalityLabels={Array.from({ length: constraintCount }, (_, i) => inequalityLabel(i))}
                        feedback={studentPointFeedback}
                        onCheck={()=>checkPointResponse(studentTestPoint, studentPointResponse, setStudentPointFeedback)}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {combined && askVertices ? (
                <div style={{ padding:12, border:'1px solid #dbe3ef', borderRadius:10, background:'#f8fbff' }}>
                  <strong style={{ display:'block', marginBottom:6 }}>Vertices</strong>
                  <button type="button" onClick={()=>setArmed({ type:'vertex' })} style={actionStyle}>Tap a boundary intersection</button>
                  {vertices.map((vertex, index) => (
                    <div key={index} style={{ marginTop:10 }}>
                      <p style={{ margin:0, fontWeight:700 }}>Vertex {String.fromCharCode(65 + index)} = ({round(vertex.x,3)}, {round(vertex.y,3)})</p>
                      <Field label="Is this vertex included in the solution set?">
                        <select value={vertex.includedAnswer} onChange={(e)=>setVertices((current)=>current.map((v,i)=>i===index?{...v,includedAnswer:e.target.value}:v))} style={inputStyle}>
                          <option value="">Choose…</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </Field>
                      <button type="button" onClick={()=>checkVertex(index)} style={{ ...actionStyle, padding:'8px 14px', fontSize:13 }}>Check vertex</button>
                    </div>
                  ))}
                  {vertexFeedback ? <p style={{ margin:'9px 0 0', fontSize:13, color:'#3c4756' }}>{vertexFeedback}</p> : null}
                </div>
              ) : null}

              <button type="button" onClick={finalCheck} style={actionStyle} data-primary-answer-action="true">Check my work</button>
              {feedback ? <div style={{ marginTop:14 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill></div> : null}
            </div>
          )}

          <HintPanel
            hints={[
              'Replace the inequality symbol with = to find the boundary line. Any two points that satisfy that equation determine it — you do not need the exact points a teacher would pick.',
              'Solid means the boundary is included (≤ or ≥). Dashed means it is not (< or >). Shade the side where a point makes the original inequality true, then check a point in that shaded region against every inequality to find the system solution.',
              'A region that never closes up in some direction is unbounded. A vertex is only part of the solution when every boundary meeting there is solid — a dashed boundary at that exact corner excludes it, even though the lines still cross there.',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolSplit>
    </EnlargeableFigure>
  );
}

function LinearQuadraticMode({ questionData, onAction }) {
  const config = questionData.linearQuadratic || DEFAULT_LINEAR_QUADRATIC;
  const intersections = useMemo(() => solveLinearQuadratic(config), [config]);
  const revealAnswers = useRevealAnswers();
  const [count, setCount] = usePersistentToolState('count', '');
  const [values, setValues] = usePersistentToolState('values', { x1:'', y1:'', x2:'', y2:'' });
  const { feedback, submit } = useToolSubmission(onAction);
  const mathState = useMemo(() => ({ count, values }), [count, values]);
  const restore = useCallback((value) => { setCount(value?.count || ''); setValues(value?.values || { x1:'', y1:'', x2:'', y2:'' }); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last intersection edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });
  const update = (key) => (event) => setValues((current)=>({...current,[key]:event.target.value}));
  const studentPoints = Number(count) === 1
    ? [{x:parseNumericAnswer(values.x1),y:parseNumericAnswer(values.y1)}]
    : Number(count) >= 2
      ? [{x:parseNumericAnswer(values.x1),y:parseNumericAnswer(values.y1)},{x:parseNumericAnswer(values.x2),y:parseNumericAnswer(values.y2)}]
      : [];

  const check = () => {
    const countCorrect = count !== '' && Number(count) === intersections.length;
    const allEntered = studentPoints.every((point) => point.x != null && point.y != null);
    const coordsCorrect = countCorrect && allEntered && samePointSet(studentPoints, intersections, 0.1);
    const parts = intersections.length ? [countCorrect,coordsCorrect] : [countCorrect];
    submit({ isCorrect:parts.every(Boolean), score:parts.filter(Boolean).length/parts.length }, { count:parseNumericAnswer(count), points:studentPoints }, { mode:'linearQuadratic', expected:intersections, checks:{ countCorrect, coordsCorrect } });
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — the count and every intersection point check out.';
    const checks = feedback.metadata?.checks || {};
    if (!checks.countCorrect) return 'The number of intersections is not right. Look at how many times the line actually crosses the parabola — a line can miss it, touch it once, or cut through it twice.';
    return 'The count is right but at least one coordinate is off. Substitute each point into both the line and the parabola: a real intersection satisfies both.';
  };

  return <EnlargeableFigure label="Linear-quadratic system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, equationInput: { label: 'Line and quadratic equations' }, numericControls: { label: 'Intersection controls', studentState: true }, instruction: { text: 'Find every point satisfying both equations.' }, primaryActions: [{ id: 'check-intersections', label: 'Check intersections', onAction: check, disabled: count === '' }] }}><ToolSplit>
    <Panel title="Line and parabola">
      <CoordinatePlane xMin={questionData.graph?.xMin ?? -6} xMax={questionData.graph?.xMax ?? 6} yMin={questionData.graph?.yMin ?? -8} yMax={questionData.graph?.yMax ?? 12}
        lines={[{ ...config.line, stroke:'#d93025', dash:'10 6' }]}
        functions={[(x)=>Number(config.quadratic.a??1)*x*x+Number(config.quadratic.b??0)*x+Number(config.quadratic.c??0)]}
        ariaLabel="Graph of a line and a parabola"
        points={revealAnswers ? intersections.map((point)=>({x:point.x,y:point.y,label:'intersection'})) : []} enlargeable={false} />
      <Legend items={[
        { label:'Parabola', color:'#1a73e8', note:`y = ${config.quadratic.a}x² ${Number(config.quadratic.b)>=0?'+':'−'} ${Math.abs(Number(config.quadratic.b))}x ${Number(config.quadratic.c)>=0?'+':'−'} ${Math.abs(Number(config.quadratic.c))}` },
        { label:'Line', color:'#d93025', dashed:true, note:formatLine(config.line) },
      ]} />
    </Panel>
    <Panel title="Solve the nonlinear system">
      <Field label="How many real intersections are there?"><select value={count} onChange={(e)=>setCount(e.target.value)} style={inputStyle}><option value="">Choose…</option><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></Field>
      {Number(count) >= 1 ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x₁"><input type="number" inputMode="decimal" step="0.1" value={values.x1} onChange={update('x1')} style={inputStyle}/></Field><Field label="y₁"><input type="number" inputMode="decimal" step="0.1" value={values.y1} onChange={update('y1')} style={inputStyle}/></Field></div> : null}
      {Number(count) >= 2 ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}><Field label="x₂"><input type="number" inputMode="decimal" step="0.1" value={values.x2} onChange={update('x2')} style={inputStyle}/></Field><Field label="y₂"><input type="number" inputMode="decimal" step="0.1" value={values.y2} onChange={update('y2')} style={inputStyle}/></Field></div> : null}
      <button type="button" onClick={check} disabled={count === ''} style={{ ...actionStyle, opacity: count === '' ? 0.5 : 1 }}>Check intersections</button>
      {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div> : null}
      <HintPanel
        hints={[
          'An intersection is a point that lies on both graphs at once.',
          'Set the two expressions equal to each other. That gives a quadratic equation, and its number of real roots is your number of intersections.',
          'Solve that quadratic for x, then substitute each x back into the line to get its y.',
        ]}
        onHintUsed={() => onAction?.('HINT_USED')}
      />
    </Panel>
  </ToolSplit></EnlargeableFigure>;
}

function MatrixMode({ questionData, onAction }) {
  const matrix = questionData.matrix || DEFAULT_MATRIX;
  const isMatrix3 = questionData.mode === 'matrix3' || Boolean(matrix3x4Rows(matrix));
  const solution = useMemo(
    () => (isMatrix3 ? solve3x3System(matrix) : solve2x2System(matrix)),
    [isMatrix3, matrix],
  );
  const revealAnswers = useRevealAnswers();
  const [classification, setClassification] = usePersistentToolState('classification', 'one');
  const [x, setX] = usePersistentToolState('x', '');
  const [y, setY] = usePersistentToolState('y', '');
  const [z, setZ] = usePersistentToolState('z', '');
  const [technologyUsed, setTechnologyUsed] = usePersistentToolState('technologyUsed', false);
  const { feedback, submit } = useToolSubmission(onAction);
  const mathState = useMemo(() => ({ classification, x, y, z, technologyUsed }), [classification, x, y, z, technologyUsed]);
  const restore = useCallback((value) => { setClassification(value?.classification || 'one'); setX(value?.x || ''); setY(value?.y || ''); setZ(value?.z || ''); setTechnologyUsed(Boolean(value?.technologyUsed)); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last matrix-system edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });

  const matrixRows = isMatrix3 ? (matrix3x4Rows(matrix) || []) : [
    [matrix.a11, matrix.a12, matrix.b1],
    [matrix.a21, matrix.a22, matrix.b2],
  ];

  const check = () => {
    if (isMatrix3 && !technologyUsed) return;
    const classCorrect = classification === solution.type;
    const coordsCorrect = solution.type !== 'one' || (
      matchesNumericAnswer(x,solution.x,0.05)
      && matchesNumericAnswer(y,solution.y,0.05)
      && (!isMatrix3 || matchesNumericAnswer(z,solution.z,0.05))
    );
    const technologyCorrect = !isMatrix3 || technologyUsed;
    const parts = solution.type === 'one'
      ? [classCorrect,technologyCorrect,coordsCorrect]
      : [classCorrect,technologyCorrect];
    submit(
      {isCorrect:parts.every(Boolean),score:parts.filter(Boolean).length/parts.length},
      {classification,x,y,...(isMatrix3?{z,technologyUsed}: {})},
      {mode:isMatrix3?'matrix3':'matrix',checks:{classCorrect,technologyCorrect,coordsCorrect}},
    );
  };

  const message = () => {
    if (feedback.isCorrect) {
      return isMatrix3
        ? 'Correct — you used the matrix RREF technology and interpreted the reduced 3×3 system correctly.'
        : 'Correct — the matrix reduces to exactly what you described.';
    }
    const checks = feedback.metadata?.checks || {};
    if (isMatrix3 && !checks.technologyCorrect) return 'Use the RREF technology first. This task is specifically checking the matrix-technology method.';
    if (!checks.classCorrect) {
      return isMatrix3
        ? 'The classification is off. Inspect the RREF: an identity coefficient matrix gives exactly one solution; a contradictory row gives no solution; a free variable gives infinitely many.'
        : 'The classification is off. Compute the determinant a₁₁a₂₂ − a₁₂a₂₁ first: nonzero means exactly one solution.';
    }
    return isMatrix3
      ? 'The classification is right, but at least one coordinate is off. Read x, y, and z from the RREF rows and check them in the original system.'
      : 'The classification is right but the values are not. Write each row back out as an equation and substitute your x and y into both.';
  };

  const showRref = isMatrix3 && (technologyUsed || revealAnswers);

  return <EnlargeableFigure label="Matrix system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, equationInput: { label: isMatrix3 ? 'Three equations and RREF' : 'Both equations and augmented matrix' }, numericControls: { label: 'Row reduction and solution controls', studentState: true }, instruction: { text: isMatrix3 ? 'Compute and interpret the RREF.' : 'Classify and solve the augmented system.' }, primaryActions: [{ id: 'check-matrix', label: 'Check matrix solution', onAction: check, disabled: isMatrix3 && !technologyUsed }] }}><ToolSplit>
    <Panel title={isMatrix3 ? "3×3 augmented matrix" : "Augmented matrix"}>
      <div style={{
        display:'grid',
        gridTemplateColumns:`repeat(${isMatrix3 ? 4 : 3},minmax(58px,80px))`,
        justifyContent:'center',
        gap:8,
        fontSize:isMatrix3?19:22,
        fontWeight:800,
        margin:'24px 0',
      }}>
        {matrixRows.flatMap((row,rowIndex)=>row.map((value,colIndex)=>(
          <div
            key={`${rowIndex}-${colIndex}`}
            style={{
              padding:12,
              textAlign:'center',
              background:colIndex === row.length-1 ? '#fff5e6' : '#eef4ff',
              borderRadius:8,
            }}
          >
            {value}
          </div>
        )))}
      </div>
      <div style={{textAlign:'center',color:'#5f6b7a'}}>
        Each row is one equation. The shaded final column is the augmented constant column.
      </div>

      {isMatrix3 ? <>
        <button
          type="button"
          onClick={()=>setTechnologyUsed(true)}
          style={{...actionStyle,width:'100%',marginTop:18}}
        >
          Use matrix technology · Compute RREF
        </button>
        <p style={{fontSize:13,color:'#5f6b7a',lineHeight:1.5}}>
          This performs the matrix row-reduction command, like an RREF feature on matrix-capable technology. You still have to interpret the result.
        </p>
        {showRref ? <div style={{marginTop:16}}>
          <strong>RREF result</strong>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(58px,80px))',justifyContent:'center',gap:8,fontSize:18,fontWeight:800,marginTop:10}}>
            {(solution.rref || []).flatMap((row,rowIndex)=>row.map((value,colIndex)=>(
              <div
                key={`rref-${rowIndex}-${colIndex}`}
                style={{padding:10,textAlign:'center',background:colIndex===3?'#fff5e6':'#eef8f0',borderRadius:8}}
              >
                {round(value,4)}
              </div>
            )))}
          </div>
        </div> : null}
      </> : <div style={{marginTop:18,padding:12,borderRadius:10,background:'#f8fbff',color:'#3c4756'}}>
        {revealAnswers
          ? <><strong>Determinant:</strong> {round(solution.determinant,2)}. A nonzero determinant guarantees exactly one solution.</>
          : <><strong>Determinant:</strong> compute a₁₁a₂₂ − a₁₂a₂₁ yourself. A nonzero determinant guarantees exactly one solution.</>}
      </div>}
    </Panel>

    <Panel title={isMatrix3 ? "Interpret the RREF" : "Row-reduction outcome"}>
      <Field label="How many solutions does this system have?">
        <select value={classification} onChange={(e)=>setClassification(e.target.value)} style={inputStyle}>
          <option value="one">Exactly one solution</option>
          <option value="none">No solution</option>
          <option value="infinite">Infinitely many solutions</option>
        </select>
      </Field>
      {classification==='one'?<div style={{display:'grid',gridTemplateColumns:`repeat(${isMatrix3?3:2},1fr)`,gap:10,marginTop:12}}>
        <Field label="x"><input type="number" inputMode="decimal" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field>
        <Field label="y"><input type="number" inputMode="decimal" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field>
        {isMatrix3?<Field label="z"><input type="number" inputMode="decimal" value={z} onChange={(e)=>setZ(e.target.value)} style={inputStyle}/></Field>:null}
      </div>:null}
      <button
        type="button"
        onClick={check}
        disabled={isMatrix3 && !technologyUsed}
        style={{...actionStyle,opacity:isMatrix3&&!technologyUsed?0.5:1}}
      >
        {isMatrix3 && !technologyUsed ? 'Use RREF technology first' : 'Check matrix solution'}
      </button>
      {feedback?<div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div>:null}
      <HintPanel
        hints={isMatrix3 ? [
          'Enter the augmented matrix into matrix-capable technology and run RREF.',
          'In RREF, a row [1, 0, 0 | a] means x = a; the next pivot rows identify y and z.',
          'A row [0, 0, 0 | nonzero] is a contradiction. A missing pivot in a consistent system means a free variable.',
        ] : [
          'Rewrite each row as an ordinary equation before doing anything else.',
          `Row 1 says ${matrix.a11}x + ${matrix.a12}y = ${matrix.b1}. Row 2 says ${matrix.a21}x + ${matrix.a22}y = ${matrix.b2}.`,
          'Compute a₁₁a₂₂ − a₁₂a₂₁. If it is not zero there is one solution — then eliminate one variable to find it.',
        ]}
        onHintUsed={() => onAction?.('HINT_USED')}
      />
    </Panel>
  </ToolSplit></EnlargeableFigure>;
}

const MODE_TASKS = {
  linear: 'Decide how many solutions this system of two lines has, and give the solution if there is exactly one.',
  inequalities: 'Decide whether the marked point is in the feasible region, then find a point of your own that satisfies every inequality.',
  linearQuadratic: 'Find how many times the line meets the parabola, and give the coordinates of each meeting point.',
  matrix: 'Read the augmented matrix as a system, classify it, and solve it if it has exactly one solution.',
  matrix3: 'Use matrix technology to compute the RREF of a 3×3 augmented matrix, then classify and solve the system.',
  algebraic: 'Solve this 2×2 system algebraically — by substitution or elimination — showing every mathematical decision along the way.',
  algebraic3: 'Solve this 3×3 system by substitution — reduce it to a 2×2 system, solve that, and work back to all three values, showing every mathematical decision.',
};

const MODE_STEPS = {
  linear: ['Compare the two slopes to decide how many solutions there can be.', 'If the lines cross, read the crossing point off the graph.', 'Check your point by substituting it into both equations.'],
  inequalities: ['Substitute the purple point into every inequality.', 'Pick your own point from well inside the green overlap.', 'Enter both answers, then check.'],
  linearQuadratic: ['Count how many times the two graphs actually meet.', 'Set the expressions equal and solve for each x.', 'Substitute each x back to get its y.'],
  matrix: ['Rewrite each row as an equation.', 'Work out the determinant to decide the number of solutions.', 'Solve for x and y if there is exactly one.'],
  matrix3: ['Read the 3×4 augmented matrix.', 'Use the matrix-technology RREF command.', 'Interpret the reduced rows to classify the system and read x, y, and z.'],
  algebraic: ['Choose (or use the assigned) method and decide which variable to work with first.', 'Solve each one-variable equation with the algebra solver, then substitute back.', 'State the ordered pair and verify it in both original equations.'],
  algebraic3: ['Choose an equation and a variable to isolate first.', 'Substitute into both other equations and simplify each, giving a 2×2 system.', 'Solve the 2×2, work back to the third value, and verify all three in every original equation.'],
};

export default function SystemsWorkspace({ questionData = {}, onAction, draftKey = null }) {
  const mode = resolveSystemsWorkspaceMode(questionData);
  // Dimension is inferred from the authored equations and variables (#341):
  // three of each is a 3×3 substitution, everything else keeps 2×2.
  const algebraic3 = mode === 'algebraic' && algebraicSystemDimension(questionData) === 3;
  const taskKey = algebraic3 ? 'algebraic3' : mode;
  const modeLabel = algebraic3 ? 'Algebraic Systems (3×3 Substitution)'
    : mode === 'inequalities' ? 'Systems of Inequalities'
    : mode === 'linearQuadratic' ? 'Linear–Quadratic Systems'
      : mode === 'matrix3' ? '3×3 Matrix Technology / RREF'
        : mode === 'matrix' ? 'Matrix / Row Reduction'
          : mode === 'algebraic' ? 'Algebraic Systems (Substitution / Elimination)'
            : 'Linear Systems';
  return <ToolShell
    title="Systems Workspace"
    subtitle="Solve, classify and interpret a system — graphically and algebraically — in one place."
    badge={modeLabel}
    workspaceWidth={mode === 'algebraic' ? 'min(100%, 1360px)' : 'min(100%, 1180px)'}
  >
    <TaskCard question={questionData} task={MODE_TASKS[taskKey] || MODE_TASKS.linear} steps={MODE_STEPS[taskKey] || MODE_STEPS.linear} />
    {mode === 'inequalities' ? <InequalityMode questionData={questionData} onAction={onAction} draftKey={draftKey}/>
      : mode === 'linearQuadratic' ? <LinearQuadraticMode questionData={questionData} onAction={onAction}/>
        : (mode === 'matrix' || mode === 'matrix3') ? <MatrixMode questionData={questionData} onAction={onAction}/>
          : mode === 'algebraic' ? (algebraic3
            ? <SubstitutionReductionMode questionData={questionData} onAction={onAction} draftKey={draftKey}/>
            : <AlgebraicSystemMode questionData={questionData} onAction={onAction} draftKey={draftKey}/>)
            : <LinearMode questionData={questionData} onAction={onAction}/>
    }
  </ToolShell>;
}
