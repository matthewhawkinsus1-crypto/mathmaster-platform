import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { parseNumericAnswer, solveTwoLines, round } from '../shared/toolMath';
import { useHostSubmitLabel, useRevealAnswers, useSubmitLabel } from '../shared/ToolRuntimeContext';
import {
  SYSTEMS_WORKSPACE_DEFAULTS,
  feasibleRegionPolygon,
  matrix3x4Rows,
  solve2x2System,
  solve3x3System,
  solveLinearQuadratic,
} from './systemsMath';
import { studentBuildInequalityEnabled } from './inequalityBuilderAdapter';
import useToolSubmission from '../shared/useToolSubmission';
import { UNANSWERED, isAnswered } from '../shared/judgmentChoices.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import systemsWorkspaceGrader from '../../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import AlgebraicSystemMode from './AlgebraicSystemMode.jsx';
import Algebraic3SystemMode from './Algebraic3SystemMode.jsx';
import ThreePlaneWorkspace from './ThreePlaneWorkspace.jsx';
import StudentBuildInequalityMode from './StudentBuildInequalityMode.jsx';
import { ChoiceGroup, InequalityLayout, LineStyleIcon, StepFeedback, YesNoQuestion } from './InequalityControls.jsx';
import { POINT_COLORS, constraintColor } from './constraintPalette.js';
import { formatInequality, formatLine, formatPoint, formatQuadratic } from './inequalityFormat.js';
import { resolveSystemsWorkspaceMode } from './systemsWorkspaceMode.js';
import { algebraicSystemDimension } from './algebraicSystemsEngine.js';

// The defaults the shared grader also reads, so an unauthored field shows and
// grades the same system (functions/shared/toolMath/systemsWorkspace/systemsMath.mjs).
const DEFAULT_SYSTEM = SYSTEMS_WORKSPACE_DEFAULTS.system;
const DEFAULT_INEQUALITIES = SYSTEMS_WORKSPACE_DEFAULTS.inequalities;
const DEFAULT_LINEAR_QUADRATIC = SYSTEMS_WORKSPACE_DEFAULTS.linearQuadratic;
const DEFAULT_MATRIX = SYSTEMS_WORKSPACE_DEFAULTS.matrix;
const DEFAULT_TEST_POINT = SYSTEMS_WORKSPACE_DEFAULTS.inequalityTestPoint;
const DEFAULT_INEQUALITY_GRAPH = SYSTEMS_WORKSPACE_DEFAULTS.inequalityGraph;

// Every Check below is marked by the workspace's shared grader — the function
// the server runs as the authority — through gradeToolCheck, and its feedback
// reads the parts that grader returned. No verdict is computed in this file.
const partCorrect = (feedback, id) => (feedback?.metadata?.parts || []).some((item) => item.id === id && item.isCorrect === true);
const inputStyle = { width:'100%', boxSizing:'border-box', padding:'11px 12px', border:'1px solid var(--mm-tint-border)', borderRadius:9, background:'var(--mm-surface)', fontSize:15, minHeight:44 };
const actionStyle = { marginTop:16, padding:'11px 18px', border:0, borderRadius:9, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer', minHeight:44 };

const Field = ({ label, children }) => <label style={{ display:'block', fontSize:13, fontWeight:700, color:'var(--mm-text-muted)' }}>{label}<div style={{marginTop:5}}>{children}</div></label>;

// Naming the curves beats "the blue one". Ordinary equation lines are both
// solid; dashed strokes are reserved for strict inequality boundaries.
const Legend = ({ items }) => (
  <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:10, fontSize:13, color:'var(--mm-text)' }}>
    {items.map((item) => (
      <span key={item.label}>
        <svg width="26" height="8" style={{ verticalAlign:'middle', marginRight:5 }} aria-hidden="true">
          <line x1="0" y1="4" x2="26" y2="4" style={{ stroke: item.color }} strokeWidth="3" strokeDasharray={item.dashed ? '8 5' : undefined} />
        </svg>
        <strong>{item.label}</strong>{item.note ? ` — ${item.note}` : ''}
      </span>
    ))}
  </div>
);

function LinearMode({ questionData, onAction }) {
  // A secure host names the final action ("Record answer"); see ToolRuntimeContext.
  const checkSystemLabel = useSubmitLabel('Check system');
  const system = questionData.system || DEFAULT_SYSTEM;
  const solution = useMemo(() => solveTwoLines(system), [system]);
  const revealAnswers = useRevealAnswers();
  const [x, setX] = usePersistentToolState('x', '');
  const [y, setY] = usePersistentToolState('y', '');
  // Unanswered until the student classifies (judgmentChoices.js): it opened on
  // "Exactly one solution", the right answer for most systems.
  const [classification, setClassification] = usePersistentToolState('classification', UNANSWERED);
  const { feedback, submit } = useToolSubmission(onAction);
  const mathState = useMemo(() => ({ x, y, classification }), [x, y, classification]);
  const restore = useCallback((value) => { setX(value?.x || ''); setY(value?.y || ''); setClassification(value?.classification || UNANSWERED); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last system answer edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });
  const classified = isAnswered(classification);

  // The student's work — what Check grades and what a deadline would submit.
  const work = { x, y, classification };
  useReportToolWork(work);

  const check = () => {
    // Not an answer yet: the classification decides what else is asked (x and
    // y only for exactly one solution). The shared grader marks a response
    // without one unanswered and My Math Path's contract refuses it, so
    // nothing is sent until it is chosen.
    if (!classified) return;
    const result = gradeToolCheck(systemsWorkspaceGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode:'linear', parts: result.parts });
  };

  const message = () => {
    if (feedback.isCorrect) return solution.type === 'one'
      ? `Correct — the lines meet at exactly one point, (${round(solution.x, 2)}, ${round(solution.y, 2)}).`
      : 'Correct — you classified the system from the slopes and intercepts.';
    if (!partCorrect(feedback, 'classification')) return 'The classification is not right yet. Compare the two slopes first: different slopes always cross exactly once, equal slopes never cross unless the lines are identical.';
    return 'The classification is right, but the coordinates are not. Read the crossing point off the graph, then substitute it into both equations to confirm.';
  };

  return <EnlargeableFigure label="Linear system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{
    undo: undoHistory.capability,
    equationInput: { label: 'Both equations', studentState: true },
    numericControls: { label: 'Solution and classification', studentState: true },
    instruction: { text: 'Classify the system, then solve where the equations meet.' },
    primaryActions: [{ id: 'check-system', label: checkSystemLabel, onAction: check, disabled: !classified }],
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
      <Field label="How many solutions does this system have?"><select value={classification} onChange={(e)=>setClassification(e.target.value)} style={inputStyle}><option value={UNANSWERED}>Choose…</option><option value="one">Exactly one solution</option><option value="none">No solution</option><option value="infinite">Infinitely many solutions</option></select></Field>
      {classification === 'one' ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x"><input type="number" inputMode="decimal" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field><Field label="y"><input type="number" inputMode="decimal" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field></div> : null}
      <button data-mm-enter-action="submit" type="button" onClick={check} disabled={!classified} style={{...actionStyle,opacity:classified?1:0.5}}>{checkSystemLabel}</button>
      {!classified ? <p style={{margin:'8px 0 0',color:'var(--mm-text-muted)',fontSize:13}}>Choose how many solutions the system has first.</p> : null}
      {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'var(--mm-text)',lineHeight:1.55}}>{message()}</p></div> : null}
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
  // and falls straight through to the code below exactly as before. The same
  // test routes the shared grader (studentBuildInequalityEnabled).
  const studentBuildEnabled = studentBuildInequalityEnabled(questionData);
  if (studentBuildEnabled) return <StudentBuildInequalityMode questionData={questionData} onAction={onAction} draftKey={draftKey} />;
  // No hook behind the early return above: the classic mode is its own
  // component (see RepresentationBridge for why that matters).
  return <ClassicInequalityMode questionData={questionData} onAction={onAction} />;
}

const BOUNDARY_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid', icon: <LineStyleIcon /> },
  { value: 'dashed', label: 'Dashed', icon: <LineStyleIcon dashed /> },
];
const SHADE_OPTIONS = [
  { value: 'above', label: 'Above the boundary' },
  { value: 'below', label: 'Below the boundary' },
];

// The boundary point a tap on the construct graph fills: the first one, in
// inequality order, that does not have both coordinates yet. The graph only
// records where the student taps; the typed boxes stay the answer.
const nextEmptyConstructionPoint = (construction = []) => {
  for (let index = 0; index < construction.length; index += 1) {
    const entry = construction[index] || {};
    for (const which of [1, 2]) {
      if (String(entry[`x${which}`] ?? '').trim() === '' || String(entry[`y${which}`] ?? '').trim() === '') return { index, which };
    }
  }
  return null;
};

// What a classic (analyze or construct) inequality question asks, as the
// shared grader reads it.
const classicInequalityAsk = (questionData = {}) => (Array.isArray(questionData.ask) && questionData.ask.length
  ? questionData.ask
  : questionData.interaction === 'construct' ? ['construction'] : ['testPoint', 'candidate']);

function ClassicInequalityMode({ questionData, onAction }) {
  const inequalities = questionData.inequalities || DEFAULT_INEQUALITIES;
  const bounds = questionData.graph || DEFAULT_INEQUALITY_GRAPH;
  const ask = classicInequalityAsk(questionData);
  const requiresConstruction = ask.includes('construction');
  const correctPolygon = useMemo(() => feasibleRegionPolygon(inequalities, bounds), [inequalities, bounds]);
  const testPoint = questionData.testPoint || DEFAULT_TEST_POINT;
  const [x, setX] = usePersistentToolState('x', '');
  const [y, setY] = usePersistentToolState('y', '');
  const [testChoice, setTestChoice] = usePersistentToolState('testChoice', '');
  const [construction, setConstruction] = usePersistentToolState('construction', () => inequalities.map(() => ({
    x1:'', y1:'', x2:'', y2:'', boundaryStyle:'', shade:'',
  })));
  // Why a tap on the construct graph placed nothing.
  const [plotNotice, setPlotNotice] = useState(null);
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
  const nextPoint = requiresConstruction ? nextEmptyConstructionPoint(construction) : null;
  const handlePlot = ([px, py]) => {
    const target = nextEmptyConstructionPoint(construction);
    if (!target) {
      setPlotNotice('Every boundary point is entered. Clear one with × to plot it again, or edit its numbers.');
      return;
    }
    setConstruction((current) => current.map((entry, entryIndex) => (
      entryIndex === target.index ? { ...entry, [`x${target.which}`]: String(px), [`y${target.which}`]: String(py) } : entry
    )));
    setPlotNotice(null);
  };
  const clearPoint = (index, which) => {
    setConstruction((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, [`x${which}`]: '', [`y${which}`]: '' } : entry
    )));
    setPlotNotice(null);
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

  // Each line keeps its own inequality's colour: filtering before indexing
  // painted the second boundary blue while the first was unfinished.
  const graphLines = requiresConstruction
    ? constructedLines.map((line, index) => (line ? {
        m:line.m,
        b:line.b,
        stroke:constraintColor(index),
        dash:line.boundaryStyle === 'dashed' ? '10 6' : undefined,
      } : null)).filter(Boolean)
    : inequalities.map((ineq,index)=>({
        m:ineq.m,
        b:ineq.b,
        stroke:constraintColor(index),
        dash:String(ineq.relation).includes('=') ? undefined : '10 6',
      }));

  const plottedPoints = [
    ...(ask.includes('testPoint') ? [{x:testPoint.x,y:testPoint.y,fill:POINT_COLORS.teacherPoint}] : []),
    ...(requiresConstruction ? construction.flatMap((entry, index) => {
      const points = [
        [parseNumericAnswer(entry.x1), parseNumericAnswer(entry.y1)],
        [parseNumericAnswer(entry.x2), parseNumericAnswer(entry.y2)],
      ];
      return points
        .filter(([px, py]) => px != null && py != null)
        .map(([px, py]) => ({ x:px, y:py, fill:constraintColor(index) }));
    }) : []),
  ];

  // The choices this question asks must be made before the work is an answer:
  // a blank one is never marked as one, and My Math Path's contract refuses a
  // response missing any of them, so the tool does not send one either.
  const constructionChoicesMade = !requiresConstruction
    || construction.every((entry) => isAnswered(entry?.boundaryStyle) && isAnswered(entry?.shade));
  const testChoiceMade = !ask.includes('testPoint') || isAnswered(testChoice);
  const choicesMade = constructionChoicesMade && testChoiceMade;

  // The student's work — the shape this workspace has always sent (My Math
  // Path's contract reads the same fields): each typed boundary point already
  // parsed, the chosen style and shading, and only the answers that were asked.
  const work = {
    construction:construction.map((entry) => ({
      points: [
        { x:parseNumericAnswer(entry.x1), y:parseNumericAnswer(entry.y1) },
        { x:parseNumericAnswer(entry.x2), y:parseNumericAnswer(entry.y2) },
      ],
      boundaryStyle:entry.boundaryStyle,
      shade:entry.shade,
    })),
    ...(ask.includes('testPoint') ? { testChoice } : {}),
    ...(ask.includes('candidate') ? { candidate:{ x:parseNumericAnswer(x), y:parseNumericAnswer(y) } } : {}),
  };
  useReportToolWork(work);

  const check = () => {
    if (!choicesMade) return;
    const result = gradeToolCheck(systemsWorkspaceGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode:'inequalities', parts: result.parts });
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
    const testCorrect = partCorrect(feedback, 'test-point');
    const candidateFeasible = partCorrect(feedback, 'candidate-point');
    if (testCorrect && !candidateFeasible) return 'Your judgement about the test point is right, but the point you entered is outside the shaded overlap. Substitute it into each inequality and find the one it fails.';
    if (!testCorrect && candidateFeasible) return 'Your own point works. Re-check the purple test point: substitute its coordinates into each inequality separately.';
    return 'Neither part is right yet. A point is feasible only when it satisfies every inequality at the same time, not just one of them.';
  };

  const shownPolygon = requiresConstruction ? studentPolygon : correctPolygon;
  const checkLabel = useSubmitLabel(requiresConstruction ? 'Check inequality graph' : 'Check feasible region');

  return <EnlargeableFigure label="Inequality system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{
    undo: undoHistory.capability,
    equationInput: { label: 'Both inequalities', studentState: true },
    numericControls: { label: requiresConstruction ? 'Boundary and shading controls' : 'Solution controls', studentState: true },
    pointEditing: requiresConstruction ? { label: 'Boundary points', studentState: true } : null,
    instruction: { text: requiresConstruction ? 'Construct every boundary and shade their overlap.' : 'Test points against both inequalities.' },
    primaryActions: [{ id: 'check-inequalities', label: checkLabel, onAction: check, disabled: !choicesMade }],
  }}>
    <InequalityLayout
      stageLabel={requiresConstruction ? 'Your inequality graph' : 'Feasible region'}
      stage={(
        <>
          <CoordinatePlane
            xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 8}
            yMin={bounds.yMin ?? -4} yMax={bounds.yMax ?? 10}
            lines={graphLines}
            points={plottedPoints}
            onPlot={requiresConstruction ? handlePlot : null}
            showPlotHelp="keyboard"
            cursorLabel={nextPoint ? `Inequality ${nextPoint.index + 1}, point ${nextPoint.which}` : 'Point'}
            ariaLabel={requiresConstruction ? 'Student-constructed graph of the inequality solution region' : 'Graph of the system of inequalities with its shaded feasible region'}
            viewResetKey={questionData?.questionId ?? null}
            enlargeable={false}
          >
            {({sx,sy}) => shownPolygon.length >= 3 ? (
              <polygon
                points={shownPolygon.map(([px,py])=>`${sx(px)},${sy(py)}`).join(' ')}
                // The theme's success colour, so the region reads on the dark
                // graph too; the legend's swatch is the same token.
                style={{ fill: 'var(--mm-success)', fillOpacity: 0.16, stroke: 'var(--mm-success)' }}
                strokeWidth="2"
              />
            ) : null}
          </CoordinatePlane>
          {requiresConstruction ? null : (
            <Legend items={[
              ...inequalities.map((ineq, index) => ({ label:`Inequality ${index + 1}`, color:constraintColor(index), dashed:!String(ineq.relation).includes('='), note:formatInequality(ineq) })),
              { label:'Feasible region', color:'var(--mm-success)', note:'every inequality true at once' },
            ]} />
          )}
        </>
      )}
    >
      {requiresConstruction ? (
        <>
          <p className="mm-ineq-instruction">Type two points on each boundary line — or tap the graph to plot them — then choose its style and the side to shade.</p>
          {inequalities.map((ineq, index) => {
            const entry = construction[index] || {};
            return (
              <section key={index} className="mm-ineq-card" data-constraint-index={index}>
                <div className="mm-ineq-card-row">
                  <span className="mm-ineq-swatch" style={{ background: constraintColor(index) }} aria-hidden="true" />
                  <span className="mm-ineq-card-title">
                    <span className="mm-ineq-card-name">Inequality {index + 1}</span>
                    <span className="mm-ineq-math">{formatInequality(ineq)}</span>
                  </span>
                </div>
                <div style={{ display:'grid', gap:10, padding:'0 12px 12px' }}>
                  {[1, 2].map((which) => {
                    const waiting = nextPoint?.index === index && nextPoint?.which === which;
                    const entered = String(entry[`x${which}`] ?? '') !== '' || String(entry[`y${which}`] ?? '') !== '';
                    return (
                      <div key={which} className="mm-ineq-point-row" role="group" aria-label={`Boundary point ${which}`} data-next={waiting ? 'true' : undefined}>
                        <span className="mm-ineq-point-name" aria-hidden="true">Point {which}</span>
                        <label className="mm-ineq-inline-field">x<input className="mm-ineq-input" data-size="narrow" type="number" inputMode="decimal" aria-label={`Boundary point ${which}: x`} value={entry[`x${which}`]} onChange={(e)=>updateConstruction(index,`x${which}`,e.target.value)} /></label>
                        <label className="mm-ineq-inline-field">y<input className="mm-ineq-input" data-size="narrow" type="number" inputMode="decimal" aria-label={`Boundary point ${which}: y`} value={entry[`y${which}`]} onChange={(e)=>updateConstruction(index,`y${which}`,e.target.value)} /></label>
                        {entered ? (
                          <button type="button" className="mm-ineq-chip-remove" aria-label={`Clear boundary point ${which} of inequality ${index + 1}`} onClick={() => clearPoint(index, which)}>×</button>
                        ) : waiting ? <span className="mm-ineq-note">or tap the graph</span> : null}
                      </div>
                    );
                  })}
                  <ChoiceGroup name="boundary-style" legend="Boundary style" options={BOUNDARY_STYLE_OPTIONS} value={entry.boundaryStyle} onChange={(value)=>updateConstruction(index,'boundaryStyle',value)} />
                  <ChoiceGroup name="shade" legend="Shade" options={SHADE_OPTIONS} value={entry.shade} onChange={(value)=>updateConstruction(index,'shade',value)} />
                </div>
              </section>
            );
          })}
          {plotNotice ? <p className="mm-ineq-note" role="status">{plotNotice}</p> : null}
        </>
      ) : null}

      {ask.includes('testPoint') ? (
        <YesNoQuestion
          name="test-point"
          legend={`Is the purple point ${formatPoint(testPoint.x, testPoint.y)} in the feasible region?`}
          value={testChoice}
          onChange={setTestChoice}
        />
      ) : null}

      {ask.includes('candidate') ? (
        <fieldset className="mm-ineq-choices" style={{ display:'grid', gap:6 }}>
          <legend>A point of your own in the feasible region</legend>
          <div className="mm-ineq-point-row">
            <label className="mm-ineq-inline-field">x<input className="mm-ineq-input" data-size="narrow" type="number" inputMode="decimal" aria-label="Your own feasible x" value={x} onChange={(e)=>setX(e.target.value)} /></label>
            <label className="mm-ineq-inline-field">y<input className="mm-ineq-input" data-size="narrow" type="number" inputMode="decimal" aria-label="Your own feasible y" value={y} onChange={(e)=>setY(e.target.value)} /></label>
          </div>
        </fieldset>
      ) : null}

      <div className="mm-ineq-actions">
        <button type="button" className="mm-ineq-action" onClick={check} disabled={!choicesMade}>{checkLabel}</button>
      </div>
      {!choicesMade ? <p className="mm-ineq-note">{[
        constructionChoicesMade ? null : 'Choose a boundary style and a side to shade for every inequality.',
        testChoiceMade ? null : 'Decide whether the purple point is in the feasible region.',
      ].filter(Boolean).join(' ')}</p> : null}
      {feedback ? <div><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><StepFeedback>{message()}</StepFeedback></div> : null}
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
    </InequalityLayout>
  </EnlargeableFigure>;
}

function LinearQuadraticMode({ questionData, onAction }) {
  const checkIntersectionsLabel = useSubmitLabel('Check intersections');
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

  // The student's work — the count chosen and the points that count shows.
  const work = { count:parseNumericAnswer(count), points:studentPoints };
  useReportToolWork(work);

  const check = () => {
    const result = gradeToolCheck(systemsWorkspaceGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode:'linearQuadratic', parts: result.parts });
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — the count and every intersection point check out.';
    if (!partCorrect(feedback, 'count')) return 'The number of intersections is not right. Look at how many times the line actually crosses the parabola — a line can miss it, touch it once, or cut through it twice.';
    return 'The count is right but at least one coordinate is off. Substitute each point into both the line and the parabola: a real intersection satisfies both.';
  };

  return <EnlargeableFigure label="Linear-quadratic system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, equationInput: { label: 'Line and quadratic equations' }, numericControls: { label: 'Intersection controls', studentState: true }, instruction: { text: 'Find every point satisfying both equations.' }, primaryActions: [{ id: 'check-intersections', label: checkIntersectionsLabel, onAction: check, disabled: count === '' }] }}><ToolSplit>
    <Panel title="Line and parabola">
      <CoordinatePlane xMin={questionData.graph?.xMin ?? -6} xMax={questionData.graph?.xMax ?? 6} yMin={questionData.graph?.yMin ?? -8} yMax={questionData.graph?.yMax ?? 12}
        lines={[{ ...config.line, stroke:'#d93025', dash:'10 6' }]}
        functions={[(x)=>Number(config.quadratic.a??1)*x*x+Number(config.quadratic.b??0)*x+Number(config.quadratic.c??0)]}
        ariaLabel="Graph of a line and a parabola"
        points={revealAnswers ? intersections.map((point)=>({x:point.x,y:point.y,label:'intersection'})) : []} enlargeable={false} />
      <Legend items={[
        { label:'Parabola', color:'#1a73e8', note:formatQuadratic(config.quadratic) },
        { label:'Line', color:'#d93025', dashed:true, note:formatLine(config.line) },
      ]} />
    </Panel>
    <Panel title="Solve the nonlinear system">
      <Field label="How many real intersections are there?"><select value={count} onChange={(e)=>setCount(e.target.value)} style={inputStyle}><option value="">Choose…</option><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></Field>
      {Number(count) >= 1 ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x₁"><input type="number" inputMode="decimal" step="0.1" value={values.x1} onChange={update('x1')} style={inputStyle}/></Field><Field label="y₁"><input type="number" inputMode="decimal" step="0.1" value={values.y1} onChange={update('y1')} style={inputStyle}/></Field></div> : null}
      {Number(count) >= 2 ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}><Field label="x₂"><input type="number" inputMode="decimal" step="0.1" value={values.x2} onChange={update('x2')} style={inputStyle}/></Field><Field label="y₂"><input type="number" inputMode="decimal" step="0.1" value={values.y2} onChange={update('y2')} style={inputStyle}/></Field></div> : null}
      <button data-mm-enter-action="submit" type="button" onClick={check} disabled={count === ''} style={{ ...actionStyle, opacity: count === '' ? 0.5 : 1 }}>{checkIntersectionsLabel}</button>
      {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'var(--mm-text)',lineHeight:1.55}}>{message()}</p></div> : null}
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
  const checkMatrixLabel = useSubmitLabel('Check matrix solution');
  const matrix = questionData.matrix || DEFAULT_MATRIX;
  const isMatrix3 = questionData.mode === 'matrix3' || Boolean(matrix3x4Rows(matrix));
  const solution = useMemo(
    () => (isMatrix3 ? solve3x3System(matrix) : solve2x2System(matrix)),
    [isMatrix3, matrix],
  );
  const revealAnswers = useRevealAnswers();
  // Unanswered until the student classifies, as in LinearMode.
  const [classification, setClassification] = usePersistentToolState('classification', UNANSWERED);
  const [x, setX] = usePersistentToolState('x', '');
  const [y, setY] = usePersistentToolState('y', '');
  const [z, setZ] = usePersistentToolState('z', '');
  const [technologyUsed, setTechnologyUsed] = usePersistentToolState('technologyUsed', false);
  const { feedback, submit } = useToolSubmission(onAction);
  const mathState = useMemo(() => ({ classification, x, y, z, technologyUsed }), [classification, x, y, z, technologyUsed]);
  const restore = useCallback((value) => { setClassification(value?.classification || UNANSWERED); setX(value?.x || ''); setY(value?.y || ''); setZ(value?.z || ''); setTechnologyUsed(Boolean(value?.technologyUsed)); }, []);
  const classified = isAnswered(classification);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last matrix-system edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });

  const matrixRows = isMatrix3 ? (matrix3x4Rows(matrix) || []) : [
    [matrix.a11, matrix.a12, matrix.b1],
    [matrix.a21, matrix.a22, matrix.b2],
  ];

  // The student's work (the same fields My Math Path's matrix3 contract reads).
  const work = {classification,x,y,...(isMatrix3?{z,technologyUsed}: {})};
  useReportToolWork(work);

  const check = () => {
    // A matrix response with no classification, or (3×3) without the RREF
    // technology, is not an answer: the shared grader marks it unfinished and
    // My Math Path's contract refuses it, so neither is sent.
    if (!classified || (isMatrix3 && !technologyUsed)) return;
    const result = gradeToolCheck(systemsWorkspaceGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode:isMatrix3?'matrix3':'matrix', parts: result.parts });
  };

  const message = () => {
    if (feedback.isCorrect) {
      return isMatrix3
        ? 'Correct — you used the matrix RREF technology and interpreted the reduced 3×3 system correctly.'
        : 'Correct — the matrix reduces to exactly what you described.';
    }
    if (isMatrix3 && !partCorrect(feedback, 'matrix-technology')) return 'Use the RREF technology first. This task is specifically checking the matrix-technology method.';
    if (!partCorrect(feedback, 'classification')) {
      return isMatrix3
        ? 'The classification is off. Inspect the RREF: an identity coefficient matrix gives exactly one solution; a contradictory row gives no solution; a free variable gives infinitely many.'
        : 'The classification is off. Compute the determinant a₁₁a₂₂ − a₁₂a₂₁ first: nonzero means exactly one solution.';
    }
    return isMatrix3
      ? 'The classification is right, but at least one coordinate is off. Read x, y, and z from the RREF rows and check them in the original system.'
      : 'The classification is right but the values are not. Write each row back out as an equation and substitute your x and y into both.';
  };

  const showRref = isMatrix3 && (technologyUsed || revealAnswers);

  return <EnlargeableFigure label="Matrix system workspace" enlargeLabel="Enlarge system workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, equationInput: { label: isMatrix3 ? 'Three equations and RREF' : 'Both equations and augmented matrix' }, numericControls: { label: 'Row reduction and solution controls', studentState: true }, instruction: { text: isMatrix3 ? 'Compute and interpret the RREF.' : 'Classify and solve the augmented system.' }, primaryActions: [{ id: 'check-matrix', label: checkMatrixLabel, onAction: check, disabled: !classified || (isMatrix3 && !technologyUsed) }] }}><ToolSplit>
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
              background:colIndex === row.length-1 ? 'var(--mm-warning-bg)' : 'var(--mm-primary-subtle)',
              borderRadius:8,
            }}
          >
            {value}
          </div>
        )))}
      </div>
      <div style={{textAlign:'center',color:'var(--mm-text-muted)'}}>
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
        <p style={{fontSize:13,color:'var(--mm-text-muted)',lineHeight:1.5}}>
          This performs the matrix row-reduction command, like an RREF feature on matrix-capable technology. You still have to interpret the result.
        </p>
        {showRref ? <div style={{marginTop:16}}>
          <strong>RREF result</strong>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(58px,80px))',justifyContent:'center',gap:8,fontSize:18,fontWeight:800,marginTop:10}}>
            {(solution.rref || []).flatMap((row,rowIndex)=>row.map((value,colIndex)=>(
              <div
                key={`rref-${rowIndex}-${colIndex}`}
                style={{padding:10,textAlign:'center',background:colIndex===3?'var(--mm-warning-bg)':'var(--mm-success-subtle)',borderRadius:8}}
              >
                {round(value,4)}
              </div>
            )))}
          </div>
        </div> : null}
      </> : <div style={{marginTop:18,padding:12,borderRadius:10,background:'var(--mm-surface-tint)',color:'var(--mm-text)'}}>
        {revealAnswers
          ? <><strong>Determinant:</strong> {round(solution.determinant,2)}. A nonzero determinant guarantees exactly one solution.</>
          : <><strong>Determinant:</strong> compute a₁₁a₂₂ − a₁₂a₂₁ yourself. A nonzero determinant guarantees exactly one solution.</>}
      </div>}
    </Panel>

    <Panel title={isMatrix3 ? "Interpret the RREF" : "Row-reduction outcome"}>
      <Field label="How many solutions does this system have?">
        <select value={classification} onChange={(e)=>setClassification(e.target.value)} style={inputStyle}>
          <option value={UNANSWERED}>Choose…</option>
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
        disabled={!classified || (isMatrix3 && !technologyUsed)}
        style={{...actionStyle,opacity:!classified || (isMatrix3&&!technologyUsed)?0.5:1}}
      >
        {isMatrix3 && !technologyUsed ? 'Use RREF technology first' : checkMatrixLabel}
      </button>
      {!classified && !(isMatrix3 && !technologyUsed) ? <p style={{margin:'8px 0 0',color:'var(--mm-text-muted)',fontSize:13}}>Choose how many solutions the system has first.</p> : null}
      {feedback?<div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'var(--mm-text)',lineHeight:1.55}}>{message()}</p></div>:null}
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
  // My Math Path's construct form had the analyze steps above ("Substitute
  // the purple point…", "…the green overlap") on a question with no purple
  // point and no overlap drawn.
  inequalitiesConstruct: 'Construct the graph of every inequality — its boundary line, solid or dashed, and the side to shade — so the overlap is the solution of the system.',
  linearQuadratic: 'Find how many times the line meets the parabola, and give the coordinates of each meeting point.',
  matrix: 'Read the augmented matrix as a system, classify it, and solve it if it has exactly one solution.',
  matrix3: 'Use matrix technology to compute the RREF of a 3×3 augmented matrix, then classify and solve the system.',
  algebraic: 'Solve this 2×2 system algebraically — by substitution or elimination — showing every mathematical decision along the way.',
  algebraic3: 'Solve this 3×3 system — by substitution or elimination — reduce it to a 2×2 system, solve that, and work back to all three values, showing every mathematical decision.',
  // A question that assigns the method gets directions for THAT method: the
  // elimination lesson told students to "choose substitution or elimination"
  // on questions where no choice was offered (#361).
  algebraic3Elimination: 'Solve this 3×3 system by elimination: eliminate the same variable from two different pairs of equations, interpret a statement with no variables or solve the reduced system, and connect your result to 3D.',
  algebraic3Substitution: 'Solve this 3×3 system by substitution: isolate a variable, substitute it into the other two equations, interpret a statement with no variables or solve the reduced system, and connect your result to 3D.',
  spatial: 'Explore the three planes for this system: rotate the model, show or hide each plane, and see how they relate.',
};

const MODE_STEPS = {
  linear: ['Compare the two slopes to decide how many solutions there can be.', 'If the lines cross, read the crossing point off the graph.', 'Check your point by substituting it into both equations.'],
  inequalities: ['Substitute the purple point into every inequality.', 'Pick your own point from well inside the green overlap.', 'Enter both answers, then check.'],
  // The process only. Which style a symbol needs and which side to shade are
  // the decisions being assessed; they stay in the recorded hints.
  inequalitiesConstruct: ['Find two points on each boundary line, and type them or tap them on the graph.', 'Decide whether each boundary is solid or dashed.', 'Decide which side of each boundary to shade, then check your graph.'],
  linearQuadratic: ['Count how many times the two graphs actually meet.', 'Set the expressions equal and solve for each x.', 'Substitute each x back to get its y.'],
  matrix: ['Rewrite each row as an equation.', 'Work out the determinant to decide the number of solutions.', 'Solve for x and y if there is exactly one.'],
  matrix3: ['Read the 3×4 augmented matrix.', 'Use the matrix-technology RREF command.', 'Interpret the reduced rows to classify the system and read x, y, and z.'],
  algebraic: ['Choose (or use the assigned) method and decide which variable to work with first.', 'Solve each one-variable equation with the algebra solver, then substitute back.', 'State the ordered pair and verify it in both original equations.'],
  algebraic3: ['Choose substitution or elimination, then choose your first move — nothing is suggested for you.', 'Reduce the system to a 2×2, then solve it.', 'Work back to the third value and verify all three in every original equation.'],
  algebraic3Elimination: ['Choose the variable to eliminate and a first pair of equations — nothing is suggested for you.', 'Use a different pair to account for all three equations; interpret any statement with no variables.', 'If a numeric solution remains, solve and verify it. Connect your completed result to 3D.'],
  algebraic3Substitution: ['Choose an equation and the variable to isolate — nothing is suggested for you.', 'Substitute into the other two equations to get a 2×2 system, then solve it.', 'Work back to the third value and verify all three in every original equation.'],
  spatial: ['Rotate the model and show or hide each plane to see how they meet.', 'Decide whether the three planes share one point, no point, or infinitely many.', 'Answer the question using what the model shows.'],
};

// Where the host names the final action (a secure item's "Record answer"),
// pressing it spends the only attempt: a step that ends "then check your
// graph" would invite exactly that.
const withoutCheckInvitation = (steps) => steps.map((step) => step.replace(/,? then check(?: your graph)?\.$/, '.'));

export default function SystemsWorkspace({ questionData = {}, onAction, draftKey = null }) {
  const hostSubmitLabel = useHostSubmitLabel();
  const mode = resolveSystemsWorkspaceMode(questionData);
  // Dimension is inferred from the authored equations and variables (#341):
  // three of each is a 3×3 system, everything else keeps 2×2.
  const algebraic3 = mode === 'algebraic' && algebraicSystemDimension(questionData) === 3;
  const assignedMethod3 = algebraic3 && ['elimination', 'substitution'].includes(questionData.method) ? questionData.method : null;
  // The student-build inequality workflow is its own step-by-step guide: each
  // step says what to do where it is done, so a folded "How to do this" above
  // it would only repeat it (and it used to repeat the ANALYZE steps).
  const inequalityBuild = mode === 'inequalities' && studentBuildInequalityEnabled(questionData);
  const taskKey = algebraic3
    ? (assignedMethod3 === 'elimination' ? 'algebraic3Elimination' : assignedMethod3 === 'substitution' ? 'algebraic3Substitution' : 'algebraic3')
    : mode === 'inequalities' && classicInequalityAsk(questionData).includes('construction') ? 'inequalitiesConstruct'
      : mode;
  const modeLabel = algebraic3 ? 'Algebraic Systems (3×3 Substitution / Elimination)'
    : mode === 'spatial' ? 'Three-Plane Systems'
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
    workspaceWidth={(mode === 'algebraic' || mode === 'spatial') ? 'min(100%, 1360px)' : 'min(100%, 1180px)'}
  >
    {inequalityBuild ? null : <TaskCard question={questionData} task={MODE_TASKS[taskKey] || MODE_TASKS.linear} steps={hostSubmitLabel ? withoutCheckInvitation(MODE_STEPS[taskKey] || MODE_STEPS.linear) : (MODE_STEPS[taskKey] || MODE_STEPS.linear)} />}
    {mode === 'inequalities' ? <InequalityMode questionData={questionData} onAction={onAction} draftKey={draftKey}/>
      : mode === 'linearQuadratic' ? <LinearQuadraticMode questionData={questionData} onAction={onAction}/>
        : (mode === 'matrix' || mode === 'matrix3') ? <MatrixMode questionData={questionData} onAction={onAction}/>
          : mode === 'spatial' ? <ThreePlaneWorkspace questionData={questionData} onAction={onAction} draftKey={draftKey}/>
          : mode === 'algebraic' ? (algebraic3
            ? <Algebraic3SystemMode questionData={questionData} onAction={onAction} draftKey={draftKey}/>
            : <AlgebraicSystemMode questionData={questionData} onAction={onAction} draftKey={draftKey}/>)
            : <LinearMode questionData={questionData} onAction={onAction}/>
    }
  </ToolShell>;
}
