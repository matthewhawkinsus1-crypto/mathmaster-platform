import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import {
  buildSignIntervals,
  evaluateRadicalEquationCandidate,
  formatSolutionPiece,
  sameIntervalSelection,
  solutionPiecesForRelation,
  validRadicalCandidates,
} from './signSolutionMath';

const actionStyle={marginTop:14,padding:'10px 16px',border:0,borderRadius:8,background:'#1a73e8',color:'#fff',fontWeight:800,cursor:'pointer'};

export default function SignSolutionAnalyzer({questionData={},onAction}){
  const mode=questionData.mode || (questionData.denominatorFactors?.length ? 'rational' : 'polynomial');
  const {feedback,submit}=useToolSubmission(onAction);
  if(mode==='radicalCheck') return <RadicalCheck questionData={questionData} feedback={feedback} submit={submit}/>;
  return <SignChart questionData={questionData} feedback={feedback} submit={submit} mode={mode}/>;
}

function SignChart({questionData,feedback,submit,mode}){
  const numeratorFactors=questionData.numeratorFactors || questionData.factors || [{root:-2,multiplicity:1},{root:3,multiplicity:1}];
  const denominatorFactors=mode==='rational' ? (questionData.denominatorFactors || [{root:1,multiplicity:1}]) : [];
  const relation=questionData.relation || '>';
  const spec={numeratorFactors,denominatorFactors};
  const analysis=useMemo(()=>buildSignIntervals(spec,relation),[numeratorFactors,denominatorFactors,relation]);
  const expectedPieces=useMemo(()=>solutionPiecesForRelation(spec,relation),[numeratorFactors,denominatorFactors,relation]);
  const expectedIdx=analysis.intervals.map((interval,index)=>interval.included?index:null).filter(v=>v!==null);
  const [selected,setSelected]=useState([]);
  const toggle=(index)=>setSelected((old)=>old.includes(index)?old.filter(v=>v!==index):[...old,index]);
  const check=()=>{
    const isCorrect=sameIntervalSelection(selected,expectedIdx);
    submit({isCorrect,score:isCorrect?1:0},{selected},{mode,relation});
  };
  return <ToolShell title="Sign & Solution Analyzer" subtitle="Build the solution from critical points, signs, endpoint rules, and domain exclusions." badge={`Algebra II · ${mode==='rational'?'Rational':'Polynomial'} Inequalities`}>
    <ToolGrid min={330}>
      <Panel title="Critical-point map">
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{analysis.criticalPoints.map((point)=><span key={point.value} style={{padding:'8px 10px',borderRadius:999,background:point.isExcluded?'#fce8e6':'#eef4ff',color:point.isExcluded?'#b42318':'#174ea6',fontWeight:800}}>{point.value} · {point.isExcluded?'excluded':point.isZero?'zero':'critical'}</span>)}</div>
        <p style={{color:'#5f6b7a',lineHeight:1.5}}>Select every open interval where the expression satisfies <strong>{relation} 0</strong>. Denominator zeros are never included; numerator zeros are included only for ≤ or ≥.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>{analysis.intervals.map((interval,index)=>{
          const label=`(${Number.isFinite(interval.left)?interval.left:'−∞'}, ${Number.isFinite(interval.right)?interval.right:'∞'})`;
          return <button type="button" key={label} onClick={()=>toggle(index)} style={{padding:14,borderRadius:10,border:selected.includes(index)?'2px solid #1a73e8':'1px solid #d9e2f1',background:selected.includes(index)?'#eef4ff':'#fff',cursor:'pointer'}}><div style={{fontWeight:800}}>{label}</div><div style={{marginTop:6,color:interval.sign>0?'#137333':'#c5221f'}}>test sign {interval.sign>0?'+':'−'}</div></button>;
        })}</div>
      </Panel>
      <Panel title="Solution notation preview"><div style={{padding:14,border:'1px solid #d9e2f1',borderRadius:10,background:'#fff',fontSize:18,fontWeight:800}}>{expectedPieces.length ? expectedPieces.map(formatSolutionPiece).join(' ∪ ') : '∅'}</div><p style={{fontSize:12,color:'#667085'}}>The preview demonstrates endpoint semantics for the Tool Lab. Student-facing assessment mode can hide it.</p><button type="button" onClick={check} style={actionStyle}>Check selected intervals</button>{feedback?<div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'Signs and interval selection are correct.':'Recheck each test interval and whether a critical value is a zero or an exclusion.'}</ResultPill></div>:null}</Panel>
    </ToolGrid>
  </ToolShell>;
}

function RadicalCheck({questionData,feedback,submit}){
  const spec=questionData.radicalEquation || {radicand:{m:1,b:6},rhs:{m:0,b:3}};
  const candidates=questionData.candidates || [3,-15];
  const expected=validRadicalCandidates(spec,candidates);
  const [selected,setSelected]=useState([]);
  const toggle=(value)=>setSelected((old)=>old.includes(value)?old.filter(v=>v!==value):[...old,value]);
  const same=(a,b)=>a.length===b.length && [...a].sort((x,y)=>x-y).every((v,i)=>v===[...b].sort((x,y)=>x-y)[i]);
  const check=()=>{const isCorrect=same(selected,expected);submit({isCorrect,score:isCorrect?1:0},{selected},{mode:'radicalCheck'});};
  return <ToolShell title="Sign & Solution Analyzer" subtitle="Check candidate solutions in the original equation to catch extraneous results." badge="Algebra II · Extraneous Solutions"><ToolGrid min={320}><Panel title="Original equation"><p style={{fontSize:20,fontWeight:900}}>√({spec.radicand?.m ?? 1}x {Number(spec.radicand?.b ?? 0)>=0?'+':''}{spec.radicand?.b ?? 0}) = {spec.rhs?.m ?? 0}x {Number(spec.rhs?.b ?? 0)>=0?'+':''}{spec.rhs?.b ?? 0}</p><p>Select every candidate that actually satisfies the original equation.</p>{candidates.map((candidate)=>{const result=evaluateRadicalEquationCandidate(spec,candidate);return <button type="button" key={candidate} onClick={()=>toggle(candidate)} style={{display:'block',width:'100%',padding:12,margin:'8px 0',borderRadius:10,border:selected.includes(candidate)?'2px solid #1a73e8':'1px solid #d9e2f1',background:selected.includes(candidate)?'#eef4ff':'#fff',textAlign:'left'}}><strong>x = {candidate}</strong><span style={{float:'right',color:'#667085'}}>substitute to verify</span></button>;})}</Panel><Panel title="Verification strategy"><ol style={{paddingLeft:20,lineHeight:1.6}}><li>Check the radical domain.</li><li>Substitute into the original equation.</li><li>Reject values introduced by squaring or algebraic manipulation.</li></ol><button type="button" onClick={check} style={actionStyle}>Check candidates</button>{feedback?<div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'Only genuine solutions remain.':'At least one selected candidate fails the original equation or domain.'}</ResultPill></div>:null}</Panel></ToolGrid></ToolShell>;
}
