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
import Matrix3Mode from './Matrix3Mode';

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
  const ask = Array.isArray(questionData.ask) && questionData.ask.length
    ? questionData.ask
    : questionData.interaction === 'construct' ? ['construction'] : ['testPoint', 'candidate'];
  const requiresConstruction = ask.includes('construction');
  const correctPolygon = useMemo(() => feasibleRegionPolygon(inequalities, bounds), [inequalities, bounds]);
  const testPoint = questionData.testPoint || { x:2, y:4 };
  const expectedTestPoint = inequalities.every((ineq) => satisfiesLinearInequality(ineq, testPoint.x, testPoint.y));
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [testChoice, setTestChoice] = useState('');
  const [construction, setConstruction] = useState(() => inequalities.map(() => ({
    x1:'', y1:'', x2:'', y2:'', boundaryStyle:'', shade:'',
  })));
  const { feedback, submit } = useToolSubmission(onAction);

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
        stroke:index===0?'#1a73e8':'#d93025',
        dash:line.boundaryStyle === 'dashed' ? '10 6' : undefined,
      }))
    : inequalities.map((ineq,index)=>({
        m:ineq.m,
        b:ineq.b,
        stroke:index===0?'#1a73e8':'#d93025',
        dash:String(ineq.relation).includes('=') ? undefined : '10 6',
      }));

  const plottedPoints = [
    ...(ask.includes('testPoint') ? [{0:testPoint.x,1:testPoint.y,label:'test point',fill:'#8a3ffc'}] : []),
    ...(requiresConstruction ? construction.flatMap((entry, index) => {
      const points = [
        [parseNumericAnswer(entry.x1), parseNumericAnswer(entry.y1)],
        [parseNumericAnswer(entry.x2), parseNumericAnswer(entry.y2)],
      ];
      return points
        .filter(([px, py]) => px != null && py != null)
        .map(([px, py], pointIndex) => ({ 0:px, 1:py, label:`B${index + 1} P${pointIndex + 1}` }));
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

  return <ToolSplit>
    <Panel title={requiresConstruction ? 'Your inequality graph' : 'Feasible region'}>
      <CoordinatePlane
        xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 8}
        yMin={bounds.yMin ?? -4} yMax={bounds.yMax ?? 10}
        lines={graphLines}
        points={plottedPoints}
        ariaLabel={requiresConstruction ? 'Student-constructed graph of the inequality solution region' : 'Graph of the system of inequalities with its shaded feasible region'}
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

const matrix3Rows = (value = {}) => {
  const rows = Array.isArray(value) ? value : (Array.isArray(value?.rows) ? value.rows : []);
  if (rows.length !== 3) return [];
  const clean = rows.map((row) => (
    Array.isArray(row) ? row.slice(0, 4).map(Number) : [row.a, row.b, row.c, row.d].map(Number)
  ));
  return clean.every((row) => row.length === 4 && row.every(Number.isFinite)) ? clean : [];
};

const matrix3Operation = (matrix, operation = {}) => {
  const rows = matrix3Rows({ rows:matrix });
  const target = Number(operation.targetRow);
  const source = Number(operation.sourceRow);
  const factor = Number(operation.factor);
  if (!rows.length || ![target, source, factor].every(Number.isFinite)
    || target < 0 || target > 2 || source < 0 || source > 2 || target === source) return null;
  const next = rows.map((row) => [...row]);
  next[target] = next[target].map((entry, index) => entry - factor * next[source][index]);
  return next;
};

const solveMatrix3Local = (value = {}) => {
  const rows = matrix3Rows(value);
  if (!rows.length) return { type:null, matrix:[], solution:null };
  const a = rows.map((row) => [...row]);
  let pivotRow = 0;
  const pivotColumns = [];
  for (let col = 0; col < 3 && pivotRow < 3; col += 1) {
    let best = pivotRow;
    for (let row = pivotRow + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[best][col])) best = row;
    }
    if (Math.abs(a[best][col]) <= 1e-9) continue;
    [a[pivotRow], a[best]] = [a[best], a[pivotRow]];
    const pivot = a[pivotRow][col];
    a[pivotRow] = a[pivotRow].map((entry) => entry / pivot);
    for (let row = 0; row < 3; row += 1) {
      if (row === pivotRow) continue;
      const factor = a[row][col];
      if (Math.abs(factor) <= 1e-9) continue;
      a[row] = a[row].map((entry, index) => entry - factor * a[pivotRow][index]);
    }
    pivotColumns.push(col);
    pivotRow += 1;
  }
  const matrix = a.map((row) => row.map((entry) => Math.abs(entry) <= 1e-9 ? 0 : entry));
  if (matrix.some((row) => row.slice(0,3).every((entry) => Math.abs(entry) <= 1e-9) && Math.abs(row[3]) > 1e-9)) {
    return { type:'none', matrix, solution:null };
  }
  if (pivotColumns.length < 3) return { type:'infinite', matrix, solution:null };
  return { type:'one', matrix, solution:{ x:matrix[0][3], y:matrix[1][3], z:matrix[2][3] } };
};

const rowClose = (left, right, tolerance = 0.03) => (
  Array.isArray(left) && Array.isArray(right) && left.length === 4
  && left.every((entry, index) => Number.isFinite(Number(entry))
    && Math.abs(Number(entry) - Number(right[index])) <= tolerance)
);

function Matrix3Mode({ questionData, onAction }) {
  const matrix = useMemo(() => matrix3Rows(questionData.matrix), [questionData.matrix]);
  const method = questionData.method === 'rref' ? 'rref' : 'gaussian';
  const operations = Array.isArray(questionData.rowOperations) ? questionData.rowOperations : [];
  const solution = useMemo(() => solveMatrix3Local({ rows:matrix }), [matrix]);
  const expectedCheckpoints = useMemo(() => {
    let working = matrix;
    const rows = [];
    operations.forEach((operation) => {
      const next = matrix3Operation(working, operation);
      if (!next) return;
      working = next;
      rows.push([...working[Number(operation.targetRow)]]);
    });
    return rows;
  }, [matrix, operations]);
  const revealAnswers = useRevealAnswers();
  const [classification, setClassification] = useState('one');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [z, setZ] = useState('');
  const [checkpoints, setCheckpoints] = useState(() => operations.map(() => ['', '', '', '']));
  const [rrefRows, setRrefRows] = useState(() => Array.from({ length:3 }, () => ['', '', '', '']));
  const { feedback, submit } = useToolSubmission(onAction);

  const updateCheckpoint = (rowIndex, cellIndex, value) => {
    setCheckpoints((current) => current.map((row, index) => (
      index === rowIndex ? row.map((cell, cIndex) => cIndex === cellIndex ? value : cell) : row
    )));
  };
  const updateRref = (rowIndex, cellIndex, value) => {
    setRrefRows((current) => current.map((row, index) => (
      index === rowIndex ? row.map((cell, cIndex) => cIndex === cellIndex ? value : cell) : row
    )));
  };

  const numericCheckpoints = checkpoints.map((row) => row.map((entry) => parseNumericAnswer(entry)));
  const numericRref = rrefRows.map((row) => row.map((entry) => parseNumericAnswer(entry)));

  const check = () => {
    const parts = [];
    const classCorrect = classification === solution.type;
    parts.push(classCorrect);

    if (method === 'gaussian') {
      expectedCheckpoints.forEach((expected, index) => {
        parts.push(rowClose(numericCheckpoints[index], expected));
      });
    } else {
      parts.push(numericRref.length === 3 && numericRref.every((row, index) => rowClose(row, solution.matrix[index])));
    }

    const solutionCorrect = solution.type !== 'one'
      || (
        matchesNumericAnswer(x, solution.solution?.x, 0.03)
        && matchesNumericAnswer(y, solution.solution?.y, 0.03)
        && matchesNumericAnswer(z, solution.solution?.z, 0.03)
      );
    if (solution.type === 'one') parts.push(solutionCorrect);

    const response = method === 'gaussian'
      ? { classification, checkpoints:numericCheckpoints, x, y, z }
      : { classification, rref:numericRref, x, y, z };

    submit(
      { isCorrect:parts.length > 0 && parts.every(Boolean), score:parts.length ? parts.filter(Boolean).length / parts.length : 0 },
      response,
      { mode:'matrix3', method, checks:{ classCorrect, solutionCorrect } },
    );
  };

  const operationLabel = (operation) => {
    const target = Number(operation.targetRow) + 1;
    const source = Number(operation.sourceRow) + 1;
    const factor = Number(operation.factor);
    return `R${target} ← R${target} − (${factor})R${source}`;
  };

  const message = () => {
    if (feedback?.isCorrect) return 'Correct — your row-reduction evidence and final classification agree with the 3×3 system.';
    if (feedback?.metadata?.checks?.classCorrect === false) return 'Recheck the reduced rows before classifying the system. A contradiction row means no solution; a free variable means infinitely many.';
    return method === 'gaussian'
      ? 'At least one row-operation checkpoint or final value needs revision. Apply each displayed row operation to the CURRENT matrix, not the original one.'
      : 'At least one RREF entry or final value needs revision. Re-run the matrix RREF calculation and copy all twelve entries carefully.';
  };

  if (!matrix.length) {
    return <Panel title="3×3 matrix"><p>This 3×3 system is missing a valid augmented matrix. Tell your teacher.</p></Panel>;
  }

  return <ToolSplit>
    <Panel title="3×3 augmented matrix">
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(58px,78px))',justifyContent:'center',gap:7,fontSize:19,fontWeight:800,margin:'20px 0'}}>
        {matrix.flatMap((row, rowIndex) => row.map((value, colIndex) => (
          <div key={`${rowIndex}-${colIndex}`} style={{padding:10,textAlign:'center',background:colIndex===3?'#fff5e6':'#eef4ff',borderRadius:8}}>
            {value}
          </div>
        )))}
      </div>
      <p style={{color:'#5f6b7a',lineHeight:1.55}}>
        Columns 1–3 are the coefficients of x, y, and z. The shaded fourth column is the constant.
      </p>

      {method === 'gaussian' ? (
        <>
          <h4 style={{marginBottom:8}}>Gaussian-elimination checkpoints</h4>
          {operations.map((operation, index) => (
            <div key={index} style={{marginTop:12,padding:12,border:'1px solid #dfe5ef',borderRadius:10}}>
              <strong>Step {index + 1}: {operationLabel(operation)}</strong>
              <p style={{margin:'6px 0 9px',fontSize:13,color:'#5f6b7a'}}>Enter the four entries of the NEW target row after this operation.</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
                {checkpoints[index]?.map((value, cellIndex) => (
                  <input key={cellIndex} type="number" inputMode="decimal" step="0.01" value={value}
                    aria-label={`Step ${index + 1} row entry ${cellIndex + 1}`}
                    onChange={(event)=>updateCheckpoint(index,cellIndex,event.target.value)} style={inputStyle}/>
                ))}
              </div>
              {revealAnswers && expectedCheckpoints[index] ? (
                <p style={{fontSize:12,color:'#5f6b7a',marginBottom:0}}>Teacher check: [{expectedCheckpoints[index].map((value)=>round(value,3)).join(', ')}]</p>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        <>
          <h4 style={{marginBottom:8}}>Technology RREF</h4>
          <p style={{fontSize:13,color:'#5f6b7a'}}>Use approved matrix technology to calculate RREF, then enter the complete 3×4 result.</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
            {rrefRows.flatMap((row,rowIndex)=>row.map((value,cellIndex)=>(
              <input key={`${rowIndex}-${cellIndex}`} type="number" inputMode="decimal" step="0.01" value={value}
                aria-label={`RREF row ${rowIndex + 1} entry ${cellIndex + 1}`}
                onChange={(event)=>updateRref(rowIndex,cellIndex,event.target.value)} style={inputStyle}/>
            )))}
          </div>
        </>
      )}
    </Panel>

    <Panel title="Classify and finish">
      <Field label="How many solutions does this system have?">
        <select value={classification} onChange={(event)=>setClassification(event.target.value)} style={inputStyle}>
          <option value="one">Exactly one solution</option>
          <option value="none">No solution</option>
          <option value="infinite">Infinitely many solutions</option>
        </select>
      </Field>
      {classification === 'one' ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:9,marginTop:12}}>
          <Field label="x"><input type="number" inputMode="decimal" step="0.01" value={x} onChange={(event)=>setX(event.target.value)} style={inputStyle}/></Field>
          <Field label="y"><input type="number" inputMode="decimal" step="0.01" value={y} onChange={(event)=>setY(event.target.value)} style={inputStyle}/></Field>
          <Field label="z"><input type="number" inputMode="decimal" step="0.01" value={z} onChange={(event)=>setZ(event.target.value)} style={inputStyle}/></Field>
        </div>
      ) : null}
      <button type="button" onClick={check} style={actionStyle}>Check 3×3 system</button>
      {feedback ? (
        <div style={{marginTop:14}}>
          <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
          <p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p>
        </div>
      ) : null}
      <HintPanel
        hints={method === 'gaussian'
          ? [
            'A row operation changes one equation without changing the solution set.',
            'For Rᵢ ← Rᵢ − kRⱼ, multiply every entry of the source row by k, then subtract entry-by-entry.',
            'Use the row produced by one step when the next step references that row.',
          ]
          : [
            'Enter the matrix exactly as the technology reports it — three rows and four columns.',
            'In RREF, pivot columns reveal the solved variables. A contradiction row such as [0,0,0|1] means no solution.',
            'A missing pivot variable creates a free variable and infinitely many solutions.',
          ]}
        onHintUsed={()=>onAction?.('HINT_USED')}
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
  matrix3: 'Solve a system of three linear equations in three variables and show the required Gaussian or matrix-technology evidence.',
};

const MODE_STEPS = {
  linear: ['Compare the two slopes to decide how many solutions there can be.', 'If the lines cross, read the crossing point off the graph.', 'Check your point by substituting it into both equations.'],
  inequalities: ['Substitute the purple point into every inequality.', 'Pick your own point from well inside the green overlap.', 'Enter both answers, then check.'],
  linearQuadratic: ['Count how many times the two graphs actually meet.', 'Set the expressions equal and solve for each x.', 'Substitute each x back to get its y.'],
  matrix: ['Rewrite each row as an equation.', 'Work out the determinant to decide the number of solutions.', 'Solve for x and y if there is exactly one.'],
  matrix3: ['Read the 3×4 augmented matrix.', 'Complete the required row-reduction evidence.', 'Classify the system and report x, y, and z when the solution is unique.'],
};

export default function SystemsWorkspace({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'linear';
  const modeLabel = mode === 'inequalities' ? 'Systems of Inequalities'
    : mode === 'linearQuadratic' ? 'Linear–Quadratic Systems'
      : mode === 'matrix3' ? '3×3 Gaussian / Matrix Technology'
        : mode === 'matrix' ? 'Matrix / Row Reduction'
          : 'Linear Systems';
  return <ToolShell title="Systems Workspace" subtitle="Solve, classify and interpret a system — graphically and algebraically — in one place." badge={modeLabel}>
    <TaskCard question={questionData} task={MODE_TASKS[mode] || MODE_TASKS.linear} steps={MODE_STEPS[mode] || MODE_STEPS.linear} />
    {mode === 'inequalities' ? <InequalityMode questionData={questionData} onAction={onAction}/>
      : mode === 'linearQuadratic' ? <LinearQuadraticMode questionData={questionData} onAction={onAction}/>
        : mode === 'matrix3' ? <Matrix3Mode questionData={questionData} onAction={onAction}/>
          : mode === 'matrix' ? <MatrixMode questionData={questionData} onAction={onAction}/>
            : <LinearMode questionData={questionData} onAction={onAction}/>
    }
  </ToolShell>;
}
