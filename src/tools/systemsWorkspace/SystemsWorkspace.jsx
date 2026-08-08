import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolSplit, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { matchesNumericAnswer, parseNumericAnswer, solveTwoLines, round } from '../shared/toolMath';
import { useRevealAnswers } from '../shared/ToolRuntimeContext';
import {
  feasibleRegionPolygon,
  samePointSet,
  satisfiesLinearInequality,
  solve2x2System,
  solveLinearQuadratic,
} from './systemsMath';
import useToolSubmission from '../shared/useToolSubmission';

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

const Field = ({ label, children }) => <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#465267' }}>{label}<div style={{marginTop:5}}>{children}</div></label>;
const formatLine = (line) => `y = ${line.m}x ${Number(line.b)>=0?'+':'−'} ${Math.abs(Number(line.b))}`;
const formatInequality = (ineq) => `y ${ineq.relation} ${ineq.m}x ${Number(ineq.b)>=0?'+':'−'} ${Math.abs(Number(ineq.b))}`;

// Naming the curves beats "the blue one": the plane draws the first series
// solid blue and the second dashed red, so the legend says exactly that.
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
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [classification, setClassification] = useState('one');
  const { feedback, submit } = useToolSubmission(onAction);

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

  return <ToolSplit>
    <Panel title="Both equations on one grid">
      <CoordinatePlane xMin={questionData.graph?.xMin ?? -6} xMax={questionData.graph?.xMax ?? 8} yMin={questionData.graph?.yMin ?? -6} yMax={questionData.graph?.yMax ?? 12}
        lines={[{m:system.m1,b:system.b1},{m:system.m2,b:system.b2,stroke:'#d93025',dash:'10 6'}]}
        ariaLabel="Graph of both equations in the system"
        // Marking and labelling the intersection is the answer to the question
        // being asked, so only the teacher bench draws it.
        points={revealAnswers && solution.type === 'one' ? [{0:solution.x,1:solution.y,label:'intersection'}] : []} />
      <Legend items={[
        { label:'Equation 1', color:'#1a73e8', note:formatLine({m:system.m1,b:system.b1}) },
        { label:'Equation 2', color:'#d93025', dashed:true, note:formatLine({m:system.m2,b:system.b2}) },
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
  </ToolSplit>;
}

function InequalityMode({ questionData, onAction }) {
  const inequalities = questionData.inequalities || DEFAULT_INEQUALITIES;
  const bounds = questionData.graph || { xMin:-6, xMax:8, yMin:-4, yMax:10 };
  const polygon = useMemo(() => feasibleRegionPolygon(inequalities, bounds), [inequalities, bounds]);
  const testPoint = questionData.testPoint || { x:2, y:4 };
  const expectedTestPoint = inequalities.every((ineq) => satisfiesLinearInequality(ineq, testPoint.x, testPoint.y));
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [testChoice, setTestChoice] = useState('yes');
  const { feedback, submit } = useToolSubmission(onAction);

  const check = () => {
    const candidate = { x:parseNumericAnswer(x), y:parseNumericAnswer(y) };
    const candidateFeasible = candidate.x != null && candidate.y != null && inequalities.every((ineq)=>satisfiesLinearInequality(ineq,candidate.x,candidate.y));
    const testCorrect = (testChoice === 'yes') === expectedTestPoint;
    submit({ isCorrect:candidateFeasible && testCorrect, score:[candidateFeasible,testCorrect].filter(Boolean).length/2 }, { candidate, testChoice }, { mode:'inequalities', expectedTestPoint, polygonVertices:polygon, checks:{ candidateFeasible, testCorrect } });
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — the purple point is classified right and your own point satisfies every inequality.';
    const checks = feedback.metadata?.checks || {};
    if (checks.testCorrect && !checks.candidateFeasible) return 'Your judgement about the test point is right, but the point you entered is outside the shaded overlap. Substitute it into each inequality and find the one it fails.';
    if (!checks.testCorrect && checks.candidateFeasible) return 'Your own point works. Re-check the purple test point: substitute its coordinates into each inequality separately.';
    return 'Neither part is right yet. A point is feasible only when it satisfies every inequality at the same time, not just one of them.';
  };

  return <ToolSplit>
    <Panel title="Feasible region">
      <CoordinatePlane xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 8} yMin={bounds.yMin ?? -4} yMax={bounds.yMax ?? 10}
        lines={inequalities.map((ineq,index)=>({m:ineq.m,b:ineq.b,stroke:index===0?'#1a73e8':'#d93025',dash:index===0?undefined:'10 6'}))}
        points={[{0:testPoint.x,1:testPoint.y,label:'test point',fill:'#8a3ffc'}]}
        ariaLabel="Graph of the system of inequalities with its shaded feasible region">
        {({sx,sy}) => polygon.length >= 3 ? <polygon points={polygon.map(([px,py])=>`${sx(px)},${sy(py)}`).join(' ')} fill="rgba(31, 157, 85, 0.16)" stroke="#16884b" strokeWidth="2" /> : null}
      </CoordinatePlane>
      <div style={{display:'grid',gap:6,marginTop:12}}>{inequalities.map((ineq,index)=><div key={index}><strong>{index+1}.</strong> {formatInequality(ineq)}</div>)}</div>
      <p style={{fontSize:13,color:'#5f6b7a'}}>The green shaded overlap is the feasible region: every point inside it satisfies every inequality at once.</p>
    </Panel>
    <Panel title="Test a point, then find your own">
      <Field label={`Is the purple point (${testPoint.x}, ${testPoint.y}) in the feasible region?`}><select value={testChoice} onChange={(e)=>setTestChoice(e.target.value)} style={inputStyle}><option value="yes">Yes</option><option value="no">No</option></select></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}><Field label="Your own feasible x"><input type="number" inputMode="decimal" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field><Field label="Your own feasible y"><input type="number" inputMode="decimal" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field></div>
      <button type="button" onClick={check} style={actionStyle}>Check feasible region</button>
      {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div> : null}
      <HintPanel
        hints={[
          'To test a point, substitute its x and y into each inequality and see whether the statement is true.',
          'A point has to satisfy every inequality. Failing even one puts it outside the feasible region.',
          'For your own point, pick coordinates well inside the green shaded area rather than on a boundary line.',
        ]}
        onHintUsed={() => onAction?.('HINT_USED')}
      />
    </Panel>
  </ToolSplit>;
}

function LinearQuadraticMode({ questionData, onAction }) {
  const config = questionData.linearQuadratic || DEFAULT_LINEAR_QUADRATIC;
  const intersections = useMemo(() => solveLinearQuadratic(config), [config]);
  const revealAnswers = useRevealAnswers();
  const [count, setCount] = useState('');
  const [values, setValues] = useState({ x1:'', y1:'', x2:'', y2:'' });
  const { feedback, submit } = useToolSubmission(onAction);
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

  return <ToolSplit>
    <Panel title="Line and parabola">
      <CoordinatePlane xMin={questionData.graph?.xMin ?? -6} xMax={questionData.graph?.xMax ?? 6} yMin={questionData.graph?.yMin ?? -8} yMax={questionData.graph?.yMax ?? 12}
        lines={[{ ...config.line, stroke:'#d93025', dash:'10 6' }]}
        functions={[(x)=>Number(config.quadratic.a??1)*x*x+Number(config.quadratic.b??0)*x+Number(config.quadratic.c??0)]}
        ariaLabel="Graph of a line and a parabola"
        points={revealAnswers ? intersections.map((point)=>({0:point.x,1:point.y,label:'intersection'})) : []} />
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
  </ToolSplit>;
}

function MatrixMode({ questionData, onAction }) {
  const matrix = questionData.matrix || DEFAULT_MATRIX;
  const solution = useMemo(() => solve2x2System(matrix), [matrix]);
  const revealAnswers = useRevealAnswers();
  const [classification,setClassification] = useState('one');
  const [x,setX] = useState('');
  const [y,setY] = useState('');
  const { feedback, submit } = useToolSubmission(onAction);
  const check = () => {
    const classCorrect = classification === solution.type;
    const coordsCorrect = solution.type !== 'one' || (matchesNumericAnswer(x,solution.x,0.05)&&matchesNumericAnswer(y,solution.y,0.05));
    const parts = solution.type === 'one' ? [classCorrect,coordsCorrect] : [classCorrect];
    submit({isCorrect:parts.every(Boolean),score:parts.filter(Boolean).length/parts.length},{classification,x,y},{mode:'matrix',expected:solution,checks:{classCorrect,coordsCorrect}});
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — the matrix reduces to exactly what you described.';
    const checks = feedback.metadata?.checks || {};
    if (!checks.classCorrect) return 'The classification is off. Compute the determinant a₁₁a₂₂ − a₁₂a₂₁ first: nonzero means exactly one solution.';
    return 'The classification is right but the values are not. Write each row back out as an equation and substitute your x and y into both.';
  };

  return <ToolSplit>
    <Panel title="Augmented matrix">
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,80px)',justifyContent:'center',gap:8,fontSize:22,fontWeight:800,margin:'24px 0'}}>
        {[matrix.a11,matrix.a12,matrix.b1,matrix.a21,matrix.a22,matrix.b2].map((value,index)=><div key={index} style={{padding:12,textAlign:'center',background:index%3===2?'#fff5e6':'#eef4ff',borderRadius:8}}>{value}</div>)}
      </div>
      <div style={{textAlign:'center',color:'#5f6b7a'}}>Each row is one equation. The shaded third column holds the constants from the right-hand side.</div>
      {/* The determinant decides the classification the student is being asked
          for, so computing it is the task, not a given. */}
      <div style={{marginTop:18,padding:12,borderRadius:10,background:'#f8fbff',color:'#3c4756'}}>
        {revealAnswers
          ? <><strong>Determinant:</strong> {round(solution.determinant,2)}. A nonzero determinant guarantees exactly one solution.</>
          : <><strong>Determinant:</strong> compute a₁₁a₂₂ − a₁₂a₂₁ yourself. A nonzero determinant guarantees exactly one solution.</>}
      </div>
    </Panel>
    <Panel title="Row-reduction outcome">
      <Field label="How many solutions does this system have?"><select value={classification} onChange={(e)=>setClassification(e.target.value)} style={inputStyle}><option value="one">Exactly one solution</option><option value="none">No solution</option><option value="infinite">Infinitely many solutions</option></select></Field>
      {classification==='one'?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x"><input type="number" inputMode="decimal" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field><Field label="y"><input type="number" inputMode="decimal" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field></div>:null}
      <button type="button" onClick={check} style={actionStyle}>Check matrix solution</button>
      {feedback?<div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div>:null}
      <HintPanel
        hints={[
          'Rewrite each row as an ordinary equation before doing anything else.',
          `Row 1 says ${matrix.a11}x + ${matrix.a12}y = ${matrix.b1}. Row 2 says ${matrix.a21}x + ${matrix.a22}y = ${matrix.b2}.`,
          'Compute a₁₁a₂₂ − a₁₂a₂₁. If it is not zero there is one solution — then eliminate one variable to find it.',
        ]}
        onHintUsed={() => onAction?.('HINT_USED')}
      />
    </Panel>
  </ToolSplit>;
}

const MODE_TASKS = {
  linear: 'Decide how many solutions this system of two lines has, and give the solution if there is exactly one.',
  inequalities: 'Decide whether the marked point is in the feasible region, then find a point of your own that satisfies every inequality.',
  linearQuadratic: 'Find how many times the line meets the parabola, and give the coordinates of each meeting point.',
  matrix: 'Read the augmented matrix as a system, classify it, and solve it if it has exactly one solution.',
};

const MODE_STEPS = {
  linear: ['Compare the two slopes to decide how many solutions there can be.', 'If the lines cross, read the crossing point off the graph.', 'Check your point by substituting it into both equations.'],
  inequalities: ['Substitute the purple point into every inequality.', 'Pick your own point from well inside the green overlap.', 'Enter both answers, then check.'],
  linearQuadratic: ['Count how many times the two graphs actually meet.', 'Set the expressions equal and solve for each x.', 'Substitute each x back to get its y.'],
  matrix: ['Rewrite each row as an equation.', 'Work out the determinant to decide the number of solutions.', 'Solve for x and y if there is exactly one.'],
};

export default function SystemsWorkspace({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'linear';
  const modeLabel = mode === 'inequalities' ? 'Systems of Inequalities'
    : mode === 'linearQuadratic' ? 'Linear–Quadratic Systems'
      : mode === 'matrix' ? 'Matrix / Row Reduction'
        : 'Linear Systems';
  return <ToolShell title="Systems Workspace" subtitle="Solve, classify and interpret a system — graphically and algebraically — in one place." badge={modeLabel}>
    <TaskCard question={questionData} task={MODE_TASKS[mode] || MODE_TASKS.linear} steps={MODE_STEPS[mode] || MODE_STEPS.linear} />
    {mode === 'inequalities' ? <InequalityMode questionData={questionData} onAction={onAction}/>
      : mode === 'linearQuadratic' ? <LinearQuadraticMode questionData={questionData} onAction={onAction}/>
        : mode === 'matrix' ? <MatrixMode questionData={questionData} onAction={onAction}/>
          : <LinearMode questionData={questionData} onAction={onAction}/>
    }
  </ToolShell>;
}
