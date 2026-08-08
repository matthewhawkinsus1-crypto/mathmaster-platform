import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { nearlyEqual, solveTwoLines, round } from '../shared/toolMath';
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
const inputStyle = { width:'100%', boxSizing:'border-box', padding:'9px 10px', border:'1px solid #cfd8e6', borderRadius:8, background:'#fff' };

const Field = ({ label, children }) => <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#465267' }}>{label}<div style={{marginTop:5}}>{children}</div></label>;
const formatLine = (line) => `y = ${line.m}x ${Number(line.b)>=0?'+':'−'} ${Math.abs(Number(line.b))}`;
const formatInequality = (ineq) => `y ${ineq.relation} ${ineq.m}x ${Number(ineq.b)>=0?'+':'−'} ${Math.abs(Number(ineq.b))}`;

function LinearMode({ questionData, onAction }) {
  const system = questionData.system || DEFAULT_SYSTEM;
  const solution = useMemo(() => solveTwoLines(system), [system]);
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [classification, setClassification] = useState('one');
  const { feedback, submit } = useToolSubmission(onAction);

  const check = () => {
    const classCorrect = classification === solution.type;
    const coordinateCorrect = solution.type !== 'one' || (nearlyEqual(Number(x), solution.x, 0.05) && nearlyEqual(Number(y), solution.y, 0.05));
    const parts = solution.type === 'one' ? [classCorrect, coordinateCorrect] : [classCorrect];
    submit({ isCorrect: parts.every(Boolean), score: parts.filter(Boolean).length / parts.length }, { x, y, classification }, { mode:'linear', expected:solution });
  };

  return <ToolGrid min={340}>
    <Panel title="Graph both equations">
      <CoordinatePlane xMin={questionData.graph?.xMin ?? -6} xMax={questionData.graph?.xMax ?? 8} yMin={questionData.graph?.yMin ?? -6} yMax={questionData.graph?.yMax ?? 12}
        lines={[{m:system.m1,b:system.b1},{m:system.m2,b:system.b2}]}
        points={solution.type === 'one' ? [{0:solution.x,1:solution.y,label:'intersection'}] : []} />
      <div style={{display:'grid',gap:6,marginTop:12,fontSize:14}}><div><strong>Equation 1:</strong> {formatLine({m:system.m1,b:system.b1})}</div><div><strong>Equation 2:</strong> {formatLine({m:system.m2,b:system.b2})}</div></div>
    </Panel>
    <Panel title="Classify and solve">
      <Field label="System type"><select value={classification} onChange={(e)=>setClassification(e.target.value)} style={inputStyle}><option value="one">One solution</option><option value="none">No solution</option><option value="infinite">Infinitely many solutions</option></select></Field>
      {classification === 'one' ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x"><input type="number" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field><Field label="y"><input type="number" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field></div> : null}
      <button type="button" onClick={check} style={{marginTop:16,padding:'10px 16px',border:0,borderRadius:8,background:'#1a73e8',color:'#fff',fontWeight:800}}>Check system</button>
      {feedback ? <div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? `System verified${solution.type==='one'?` at (${round(solution.x,2)}, ${round(solution.y,2)})`:''}.` : `Partial evidence: ${Math.round(feedback.score*100)}%`}</ResultPill></div> : null}
      <p style={{fontSize:13,color:'#5f6b7a',marginBottom:0}}>Parallel lines have no solution. Coincident lines have infinitely many. A single intersection represents the ordered-pair solution.</p>
    </Panel>
  </ToolGrid>;
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
    const candidate = { x:Number(x), y:Number(y) };
    const candidateFeasible = Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && inequalities.every((ineq)=>satisfiesLinearInequality(ineq,candidate.x,candidate.y));
    const testCorrect = (testChoice === 'yes') === expectedTestPoint;
    submit({ isCorrect:candidateFeasible && testCorrect, score:[candidateFeasible,testCorrect].filter(Boolean).length/2 }, { candidate, testChoice }, { mode:'inequalities', expectedTestPoint, polygonVertices:polygon });
  };

  return <ToolGrid min={340}>
    <Panel title="Feasible-region graph">
      <CoordinatePlane xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 8} yMin={bounds.yMin ?? -4} yMax={bounds.yMax ?? 10}
        lines={inequalities.map((ineq,index)=>({m:ineq.m,b:ineq.b,stroke:index===0?'#1a73e8':'#d93025'}))}
        points={[{0:testPoint.x,1:testPoint.y,label:'test point',fill:'#8a3ffc'}]}>
        {({sx,sy}) => polygon.length >= 3 ? <polygon points={polygon.map(([px,py])=>`${sx(px)},${sy(py)}`).join(' ')} fill="rgba(31, 157, 85, 0.16)" stroke="#16884b" strokeWidth="2" /> : null}
      </CoordinatePlane>
      <div style={{display:'grid',gap:6,marginTop:12}}>{inequalities.map((ineq,index)=><div key={index}><strong>{index+1}.</strong> {formatInequality(ineq)}</div>)}</div>
      <p style={{fontSize:13,color:'#5f6b7a'}}>The shaded overlap is the feasible region: every point there satisfies every inequality simultaneously.</p>
    </Panel>
    <Panel title="Test and construct a feasible solution">
      <Field label={`Is (${testPoint.x}, ${testPoint.y}) feasible?`}><select value={testChoice} onChange={(e)=>setTestChoice(e.target.value)} style={inputStyle}><option value="yes">Yes</option><option value="no">No</option></select></Field>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}><Field label="Enter a feasible x"><input type="number" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field><Field label="Enter a feasible y"><input type="number" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field></div>
      <button type="button" onClick={check} style={{marginTop:16,padding:'10px 16px',border:0,borderRadius:8,background:'#1a73e8',color:'#fff',fontWeight:800}}>Check feasible region</button>
      {feedback ? <div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'Both feasibility claims are valid.':`Feasible-region evidence: ${Math.round(feedback.score*100)}%`}</ResultPill></div> : null}
    </Panel>
  </ToolGrid>;
}

function LinearQuadraticMode({ questionData, onAction }) {
  const config = questionData.linearQuadratic || DEFAULT_LINEAR_QUADRATIC;
  const intersections = useMemo(() => solveLinearQuadratic(config), [config]);
  const [count, setCount] = useState(String(intersections.length));
  const [values, setValues] = useState({ x1:'', y1:'', x2:'', y2:'' });
  const { feedback, submit } = useToolSubmission(onAction);
  const update = (key) => (event) => setValues((current)=>({...current,[key]:event.target.value}));
  const studentPoints = intersections.length === 0 ? [] : intersections.length === 1
    ? [{x:Number(values.x1),y:Number(values.y1)}]
    : [{x:Number(values.x1),y:Number(values.y1)},{x:Number(values.x2),y:Number(values.y2)}];

  const check = () => {
    const countCorrect = Number(count) === intersections.length;
    const coordsCorrect = countCorrect && samePointSet(studentPoints, intersections, 0.1);
    const parts = intersections.length ? [countCorrect,coordsCorrect] : [countCorrect];
    submit({ isCorrect:parts.every(Boolean), score:parts.filter(Boolean).length/parts.length }, { count:Number(count), points:studentPoints }, { mode:'linearQuadratic', expected:intersections });
  };

  return <ToolGrid min={340}>
    <Panel title="Line and parabola">
      <CoordinatePlane xMin={questionData.graph?.xMin ?? -6} xMax={questionData.graph?.xMax ?? 6} yMin={questionData.graph?.yMin ?? -8} yMax={questionData.graph?.yMax ?? 12}
        lines={[config.line]}
        functions={[(x)=>Number(config.quadratic.a??1)*x*x+Number(config.quadratic.b??0)*x+Number(config.quadratic.c??0)]}
        points={intersections.map((point)=>({0:point.x,1:point.y,label:'intersection'}))} />
      <div style={{display:'grid',gap:6,marginTop:10,fontSize:14}}><div><strong>Line:</strong> {formatLine(config.line)}</div><div><strong>Quadratic:</strong> y = {config.quadratic.a}x² {Number(config.quadratic.b)>=0?'+':'−'} {Math.abs(Number(config.quadratic.b))}x {Number(config.quadratic.c)>=0?'+':'−'} {Math.abs(Number(config.quadratic.c))}</div></div>
    </Panel>
    <Panel title="Solve the nonlinear system">
      <Field label="Number of real intersections"><select value={count} onChange={(e)=>setCount(e.target.value)} style={inputStyle}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></Field>
      {Number(count) >= 1 ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x₁"><input type="number" step="0.1" value={values.x1} onChange={update('x1')} style={inputStyle}/></Field><Field label="y₁"><input type="number" step="0.1" value={values.y1} onChange={update('y1')} style={inputStyle}/></Field></div> : null}
      {Number(count) >= 2 ? <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}><Field label="x₂"><input type="number" step="0.1" value={values.x2} onChange={update('x2')} style={inputStyle}/></Field><Field label="y₂"><input type="number" step="0.1" value={values.y2} onChange={update('y2')} style={inputStyle}/></Field></div> : null}
      <button type="button" onClick={check} style={{marginTop:16,padding:'10px 16px',border:0,borderRadius:8,background:'#1a73e8',color:'#fff',fontWeight:800}}>Check intersections</button>
      {feedback ? <div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'All intersection solutions are correct.':`Nonlinear-system evidence: ${Math.round(feedback.score*100)}%`}</ResultPill></div> : null}
    </Panel>
  </ToolGrid>;
}

function MatrixMode({ questionData, onAction }) {
  const matrix = questionData.matrix || DEFAULT_MATRIX;
  const solution = useMemo(() => solve2x2System(matrix), [matrix]);
  const [classification,setClassification] = useState('one');
  const [x,setX] = useState('');
  const [y,setY] = useState('');
  const { feedback, submit } = useToolSubmission(onAction);
  const check = () => {
    const classCorrect = classification === solution.type;
    const coordsCorrect = solution.type !== 'one' || (nearlyEqual(Number(x),solution.x,0.05)&&nearlyEqual(Number(y),solution.y,0.05));
    const parts = solution.type === 'one' ? [classCorrect,coordsCorrect] : [classCorrect];
    submit({isCorrect:parts.every(Boolean),score:parts.filter(Boolean).length/parts.length},{classification,x:Number(x),y:Number(y)},{mode:'matrix',expected:solution});
  };
  return <ToolGrid min={340}>
    <Panel title="Augmented matrix">
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,80px)',justifyContent:'center',gap:8,fontSize:22,fontWeight:800,margin:'24px 0'}}>
        {[matrix.a11,matrix.a12,matrix.b1,matrix.a21,matrix.a22,matrix.b2].map((value,index)=><div key={index} style={{padding:12,textAlign:'center',background:index%3===2?'#fff5e6':'#eef4ff',borderRadius:8}}>{value}</div>)}
      </div>
      <div style={{textAlign:'center',color:'#5f6b7a'}}>Rows represent equations; the third column is the augmented constants column.</div>
      <div style={{marginTop:18,padding:12,borderRadius:10,background:'#f8fbff'}}><strong>Determinant:</strong> {round(solution.determinant,2)}. A nonzero determinant guarantees one solution.</div>
    </Panel>
    <Panel title="Row-reduction outcome">
      <Field label="System type"><select value={classification} onChange={(e)=>setClassification(e.target.value)} style={inputStyle}><option value="one">One solution</option><option value="none">No solution</option><option value="infinite">Infinitely many solutions</option></select></Field>
      {classification==='one'?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}><Field label="x"><input type="number" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field><Field label="y"><input type="number" value={y} onChange={(e)=>setY(e.target.value)} style={inputStyle}/></Field></div>:null}
      <button type="button" onClick={check} style={{marginTop:16,padding:'10px 16px',border:0,borderRadius:8,background:'#1a73e8',color:'#fff',fontWeight:800}}>Check matrix solution</button>
      {feedback?<div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'Matrix solution verified.':`Matrix evidence: ${Math.round(feedback.score*100)}%`}</ResultPill></div>:null}
    </Panel>
  </ToolGrid>;
}

export default function SystemsWorkspace({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'linear';
  const modeLabel = mode === 'inequalities' ? 'Systems of Inequalities'
    : mode === 'linearQuadratic' ? 'Linear–Quadratic Systems'
      : mode === 'matrix' ? 'Matrix / Row Reduction'
        : 'Linear Systems';
  return <ToolShell title="Systems Workspace 2.0" subtitle="Solve, classify, graph, and interpret systems through a single workspace contract." badge={`Algebra I / II · ${modeLabel}`} footer="Modes are selected by JSON. The tool never decides whether it is classwork, remediation, verification, or assessment; policy stays outside the math workspace.">
    {mode === 'inequalities' ? <InequalityMode questionData={questionData} onAction={onAction}/>
      : mode === 'linearQuadratic' ? <LinearQuadraticMode questionData={questionData} onAction={onAction}/>
        : mode === 'matrix' ? <MatrixMode questionData={questionData} onAction={onAction}/>
          : <LinearMode questionData={questionData} onAction={onAction}/>
    }
  </ToolShell>;
}
