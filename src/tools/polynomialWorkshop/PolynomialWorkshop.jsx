import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { evaluatePolynomial, matchesNumericAnswer, nearlyEqual, parseNumericAnswer } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import {
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  integerFactorPairForMonicQuadratic,
  polynomialLongDivide,
  polynomialMultiply,
  rationalFeatureMap,
  sameNumberMultiset,
} from './polynomialMath';

const parseNumbers = (text) => String(text || '').split(',').map((v) => Number(v.trim())).filter(Number.isFinite);
const inputStyle = { width:'100%', padding:9, border:'1px solid #cfd8e6', borderRadius:8, boxSizing:'border-box' };
const actionStyle = { marginTop:14, padding:'10px 16px', border:0, borderRadius:8, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer' };
const polynomialText = (coefficients = []) => coefficients.map((c, i) => {
  const degree = coefficients.length - i - 1;
  const value = Number(c);
  const sign = i > 0 && value >= 0 ? '+' : '';
  const variable = degree > 1 ? `x^${degree}` : degree === 1 ? 'x' : '';
  return `${sign}${value}${variable}`;
}).join(' ');

function Feedback({ feedback, success, retry }) {
  if (!feedback) return null;
  return <div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? success : retry}</ResultPill></div>;
}

export default function PolynomialWorkshop({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'factorZero';
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  if (mode === 'multiplyArea') return <MultiplyArea questionData={questionData} feedback={feedback} submit={submit} clearFeedback={clearFeedback} onAction={onAction} />;
  if (mode === 'factorQuadratic') return <FactorQuadratic questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'division') return <DivisionMode questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'graphConnection') return <GraphConnection questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'rationalFeatures') return <RationalFeatures questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <FactorZero questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
}

function FactorZero({ questionData, feedback, submit, onAction }) {
  const coefficients = questionData.coefficients || [1,-5,6];
  const candidateRoot = Number(questionData.candidateRoot ?? 2);
  const polynomialValue = evaluatePolynomial(coefficients, candidateRoot);
  const isFactor = Math.abs(polynomialValue) < 1e-9;
  const [value,setValue]=useState('');
  const [factorChoice,setFactorChoice]=useState('yes');
  const check=()=>{
    const valueCorrect=matchesNumericAnswer(value,polynomialValue,0.01);
    const factorCorrect=(factorChoice==='yes')===isFactor;
    submit({isCorrect:valueCorrect&&factorCorrect,score:[valueCorrect,factorCorrect].filter(Boolean).length/2},{value,factorChoice},{mode:'factorZero'});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Use the Factor Theorem to connect evaluation, zeros, and factors." badge="Algebra II · Factor Theorem">
    <TaskCard question={questionData} task={'Evaluate the polynomial at the given value, then say whether that gives a factor.'} steps={['Substitute the test value into P(x).', 'Simplify to a single number.', 'Decide what that number tells you about the factor.']} />
    <ToolGrid min={320}>
      <Panel title="Evaluate"><p style={{fontSize:20,fontWeight:800}}>P(x) = {polynomialText(coefficients)}</p><p>Test x = <strong>{candidateRoot}</strong>.</p><label>P({candidateRoot}) = <input value={value} onChange={e=>setValue(e.target.value)} style={{...inputStyle,width:130,marginLeft:8}}/></label></Panel>
      <Panel title="Interpret"><label>Is (x − {candidateRoot}) a factor?<select value={factorChoice} onChange={e=>setFactorChoice(e.target.value)} style={{...inputStyle,marginTop:6}}><option value="yes">Yes</option><option value="no">No</option></select></label><button type="button" onClick={check} style={actionStyle}>Check connection</button><Feedback feedback={feedback} success="Evaluation and factor conclusion agree." retry="Re-evaluate P(r): a factor occurs exactly when P(r)=0."/><HintPanel hints={['The Factor Theorem links evaluating and factoring: they are the same question asked two ways.', '(x − r) is a factor of P(x) exactly when P(r) = 0.', 'So evaluate P at the candidate. A result of zero means it is a factor; anything else means it is not.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function MultiplyArea({ questionData, feedback, submit, onAction }) {
  const left = questionData.leftBinomial || [2,3];
  const right = questionData.rightBinomial || [1,-4];
  const expectedCells = [left[0]*right[0], left[0]*right[1], left[1]*right[0], left[1]*right[1]];
  const cellDegrees = [2, 1, 1, 0];
  const product = polynomialMultiply(left,right);
  const [cells,setCells]=useState(['','','','']);
  const [expanded,setExpanded]=useState('');
  const setCell=(index,value)=>setCells((old)=>old.map((v,i)=>i===index?value:v));
  const check=()=>{
    const cellCorrect=cells.map((v,i)=>matchesNumericAnswer(v,expectedCells[i],0.01));
    const expandedCorrect=sameNumberMultiset(parseNumbers(expanded),product,0.01) && parseNumbers(expanded).length===product.length;
    const correctCount=cellCorrect.filter(Boolean).length+(expandedCorrect?1:0);
    submit({isCorrect:correctCount===5,score:correctCount/5},{cells,expanded},{mode:'multiplyArea'});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Build multiplication from an area model instead of memorizing FOIL." badge="Algebra II · Area Model">
    <TaskCard question={questionData} task={'Fill in the area model, then write the expanded polynomial.'} steps={['Multiply each row term by each column term.', 'Each cell already shows the variable part; enter only the signed coefficient for that product.', 'Add the like terms and enter the final coefficients from highest degree down.']} />
    <ToolGrid min={330}>
      <Panel title={`(${left[0]}x ${left[1]>=0?'+':''}${left[1]})(${right[0]}x ${right[1]>=0?'+':''}${right[1]})`}>
        <div style={{display:'grid',gridTemplateColumns:'90px 1fr 1fr',gap:6,alignItems:'stretch'}}>
          <div/><strong style={{padding:8,textAlign:'center'}}>{right[0]}x</strong><strong style={{padding:8,textAlign:'center'}}>{right[1]}</strong>
          <strong style={{padding:8,textAlign:'right'}}>{left[0]}x</strong>{[0,1].map(i=><div key={i} style={{display:'flex',alignItems:'center',gap:5}}><input value={cells[i]} onChange={e=>setCell(i,e.target.value)} style={{...inputStyle,minWidth:0}} placeholder="coefficient" aria-label={`Coefficient of ${cellDegrees[i]===2?'x squared':cellDegrees[i]===1?'x':'constant'} product`}/>{cellDegrees[i]===2?<strong>x²</strong>:cellDegrees[i]===1?<strong>x</strong>:null}</div>)}
          <strong style={{padding:8,textAlign:'right'}}>{left[1]}</strong>{[2,3].map(i=><div key={i} style={{display:'flex',alignItems:'center',gap:5}}><input value={cells[i]} onChange={e=>setCell(i,e.target.value)} style={{...inputStyle,minWidth:0}} placeholder="coefficient" aria-label={`Coefficient of ${cellDegrees[i]===2?'x squared':cellDegrees[i]===1?'x':'constant'} product`}/>{cellDegrees[i]===2?<strong>x²</strong>:cellDegrees[i]===1?<strong>x</strong>:null}</div>)}
        </div>
      </Panel>
      <Panel title="Combine like terms"><p style={{color:'#5f6b7a'}}>Enter coefficients highest degree to constant, separated by commas.</p><input value={expanded} onChange={e=>setExpanded(e.target.value)} style={inputStyle} placeholder="2, -5, -12"/><button type="button" onClick={check} style={actionStyle}>Check area model</button><Feedback feedback={feedback} success="Every area product and the expanded polynomial are correct." retry="Multiply each row/column pair, then combine the two x-terms."/><HintPanel hints={['An area model is just organised distribution — every cell is one of the products you would get from FOIL.', 'Cells on the same diagonal usually hold the like terms that combine.', 'Enter coefficients highest degree first, and include a 0 for any missing degree.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function FactorQuadratic({ questionData, feedback, submit, onAction }) {
  const coefficients = questionData.coefficients || [1,-5,6];
  const expected = integerFactorPairForMonicQuadratic(coefficients);
  const [p,setP]=useState(''); const [q,setQ]=useState('');
  const check=()=>{
    const parsedP=parseNumericAnswer(p); const parsedQ=parseNumericAnswer(q);
    const isCorrect=!!expected && parsedP!==null && parsedQ!==null && sameNumberMultiset([parsedP,parsedQ],expected,0.01);
    submit({isCorrect,score:isCorrect?1:0},{p,q},{mode:'factorQuadratic'});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Factor a monic quadratic by reasoning about sum and product." badge="Algebra II · Factoring">
    <TaskCard question={questionData} task={'Find the two numbers p and q that factor this quadratic.'} steps={['You need two numbers that multiply to the constant term.', 'The same two numbers must add to the x coefficient.', 'Enter them as p and q in either order.']} />
    <ToolGrid min={320}><Panel title="Target polynomial"><p style={{fontSize:22,fontWeight:900}}>P(x) = {polynomialText(coefficients)}</p><p>Find p and q so P(x) = (x + p)(x + q).</p></Panel><Panel title="Factor pair"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><label>p<input value={p} onChange={e=>setP(e.target.value)} style={inputStyle}/></label><label>q<input value={q} onChange={e=>setQ(e.target.value)} style={inputStyle}/></label></div><button type="button" onClick={check} style={actionStyle}>Check factors</button><Feedback feedback={feedback} success="The factors multiply back to the original quadratic." retry="Your two numbers must add to the x coefficient and multiply to the constant."/><HintPanel hints={['For x² + bx + c, you are looking for two numbers whose product is c and whose sum is b.', 'List the factor pairs of the constant term first, then test which pair adds correctly.', 'If the constant is negative, one number is positive and the other is negative.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid>
  </ToolShell>;
}

function DivisionMode({ questionData, feedback, submit, onAction }) {
  const dividend = questionData.dividend || [1,-4,-7,10];
  const divisor = questionData.divisor || [1,-2];
  const result = useMemo(()=>polynomialLongDivide(dividend,divisor),[dividend,divisor]);
  const [quotient,setQuotient]=useState(''); const [remainder,setRemainder]=useState('');
  const check=()=>{
    const q=parseNumbers(quotient); const r=parseNumbers(remainder);
    const qCorrect=q.length===result.quotient.length && q.every((v,i)=>nearlyEqual(v,result.quotient[i],0.01));
    const rCorrect=r.length===result.remainder.length && r.every((v,i)=>nearlyEqual(v,result.remainder[i],0.01));
    submit({isCorrect:qCorrect&&rCorrect,score:[qCorrect,rCorrect].filter(Boolean).length/2},{quotient,remainder},{mode:'division'});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Divide polynomials and verify quotient + remainder structure." badge="Algebra II · Division">
    <TaskCard question={questionData} task={'Divide the polynomials and give the quotient and remainder.'} steps={['Divide the leading terms to get the first quotient term.', 'Multiply back, subtract, and bring down the next term.', 'Repeat until the remainder has a lower degree than the divisor.']} /><ToolGrid min={320}><Panel title="Divide"><p style={{fontWeight:800}}>{polynomialText(dividend)}</p><p>÷</p><p style={{fontWeight:800}}>{polynomialText(divisor)}</p><p style={{color:'#5f6b7a'}}>Enter coefficient lists from highest degree downward.</p></Panel><Panel title="Your result"><label>Quotient coefficients<input value={quotient} onChange={e=>setQuotient(e.target.value)} style={inputStyle} placeholder="1, -2, -11"/></label><label style={{display:'block',marginTop:10}}>Remainder coefficients<input value={remainder} onChange={e=>setRemainder(e.target.value)} style={inputStyle} placeholder="-12"/></label><button type="button" onClick={check} style={actionStyle}>Check division</button><Feedback feedback={feedback} success="Quotient and remainder reconstruct the dividend." retry="Use leading terms first, subtract, then bring down the next term."/><HintPanel hints={['Polynomial long division works exactly like numeric long division — leading term first, then subtract.', 'After subtracting, the leading term should cancel. If it does not, the multiplication step was wrong.', 'Stop when what is left has a lower degree than the divisor; that leftover is the remainder.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid></ToolShell>;
}

function GraphConnection({ questionData, feedback, submit, onAction }) {
  const roots = questionData.roots || [{root:-2,multiplicity:2},{root:3,multiplicity:1}];
  const leadingCoefficient = Number(questionData.leadingCoefficient ?? 1);
  const coefficients = useMemo(()=>coefficientsFromRoots(roots,leadingCoefficient),[roots,leadingCoefficient]);
  const target = questionData.targetRoot ?? roots[0].root;
  const targetEntry = roots.find((entry)=>nearlyEqual(entry.root,target)) || roots[0];
  const expectedBehavior = factorBehaviorAtRoot(targetEntry.multiplicity);
  const expectedEnd = endBehavior(coefficients);
  const [behavior,setBehavior]=useState('crosses'); const [end,setEnd]=useState('both ends rise');
  const fn=(x)=>evaluatePolynomial(coefficients,x);
  const check=()=>{
    const behaviorCorrect=behavior===expectedBehavior; const endCorrect=end===expectedEnd.label;
    submit({isCorrect:behaviorCorrect&&endCorrect,score:[behaviorCorrect,endCorrect].filter(Boolean).length/2},{behavior,end},{mode:'graphConnection'});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Connect factors and multiplicity to graph behavior and end behavior." badge="Algebra II · Zeros & Graphs">
    <TaskCard question={questionData} task={'Say what the graph does at the target zero, and describe its end behaviour.'} steps={['Look at the multiplicity of the target zero.', 'Decide whether the curve passes through or bounces off the axis there.', 'Use the degree and the leading coefficient for the ends.']} /><ToolGrid min={330}><Panel title="Graph from factors"><CoordinatePlane xMin={-6} xMax={6} yMin={-16} yMax={16} functions={[fn]} points={roots.map(r=>[r.root,0])}/><p>Target zero: <strong>x = {targetEntry.root}</strong>, multiplicity {targetEntry.multiplicity}</p></Panel><Panel title="Interpret the graph"><label>At the target zero<select value={behavior} onChange={e=>setBehavior(e.target.value)} style={{...inputStyle,marginTop:5}}><option value="crosses">crosses the x-axis</option><option value="touches">touches and turns</option></select></label><label style={{display:'block',marginTop:10}}>End behavior<select value={end} onChange={e=>setEnd(e.target.value)} style={{...inputStyle,marginTop:5}}>{['both ends rise','both ends fall','left falls, right rises','left rises, right falls'].map(v=><option key={v}>{v}</option>)}</select></label><button type="button" onClick={check} style={actionStyle}>Check graph connections</button><Feedback feedback={feedback} success="Multiplicity and leading-term behavior are both correct." retry="Odd multiplicity crosses; even multiplicity touches. Degree parity + leading sign control the ends."/><HintPanel hints={['Multiplicity controls what happens at a zero, and the leading term controls what happens at the far ends.', 'Odd multiplicity crosses the axis. Even multiplicity touches it and turns back.', 'Even degree sends both ends the same way; odd degree sends them opposite ways, and a negative leading coefficient flips both.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid></ToolShell>;
}

function RationalFeatures({ questionData, feedback, submit, onAction }) {
  const numeratorRoots=questionData.numeratorRoots || [2,-1];
  const denominatorRoots=questionData.denominatorRoots || [2,4];
  const features=useMemo(()=>rationalFeatureMap({numeratorRoots,denominatorRoots}),[numeratorRoots,denominatorRoots]);
  const targetValue=Number(questionData.targetValue ?? features[0]?.root ?? 2);
  const target=features.find(f=>nearlyEqual(f.root,targetValue));
  const [choice,setChoice]=useState('hole');
  const check=()=>submit({isCorrect:choice===target?.type,score:choice===target?.type?1:0},{choice},{mode:'rationalFeatures'});
  return <ToolShell title="Polynomial Workshop" subtitle="Track common factors to distinguish zeros, holes, and vertical asymptotes." badge="Algebra II · Rational Bridge">
    <TaskCard question={questionData} task={'Decide what happens to the rational function at the given x-value.'} steps={['Check whether the value is a root of the numerator, the denominator, or both.', 'A factor in both cancels.', 'Choose the feature that survives cancellation.']} /><ToolGrid min={320}><Panel title="Factored structure"><p><strong>Numerator roots:</strong> {numeratorRoots.join(', ')}</p><p><strong>Denominator roots:</strong> {denominatorRoots.join(', ')}</p><p style={{color:'#5f6b7a'}}>A common factor cancels algebraically but remains excluded from the original domain.</p></Panel><Panel title={`What happens at x = ${targetValue}?`}><select value={choice} onChange={e=>setChoice(e.target.value)} style={inputStyle}><option value="hole">Hole</option><option value="verticalAsymptote">Vertical asymptote</option><option value="zero">Zero / x-intercept</option><option value="none">None of these</option></select><button type="button" onClick={check} style={actionStyle}>Check feature</button><Feedback feedback={feedback} success="You tracked cancellation and domain restrictions correctly." retry="Compare numerator and denominator multiplicities before and after cancellation."/><HintPanel hints={['Every interesting point on a rational function comes from a factor in the numerator, the denominator, or both.', 'A factor in the denominator only gives a vertical asymptote. A factor in the numerator only gives an x-intercept.', 'A factor in both cancels and leaves a hole — but the value is still excluded from the domain.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid></ToolShell>;
}
