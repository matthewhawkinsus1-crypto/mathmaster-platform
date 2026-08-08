import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { nearlyEqual, round } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import {
  geometryFromFocusDirectrix,
  parabolaFeatures,
  parabolaFunction,
  pointDistances,
  sampleParabolaPoint,
  standardEquationParts,
} from './parabolaGeometryMath';

const inputStyle={width:'100%',padding:9,border:'1px solid #cfd8e6',borderRadius:8,boxSizing:'border-box'};
const actionStyle={marginTop:14,padding:'10px 16px',border:0,borderRadius:8,background:'#1a73e8',color:'#fff',fontWeight:800,cursor:'pointer'};

export default function ParabolaGeometryLab({ questionData = {}, onAction }) {
  const mode=questionData.mode || 'features';
  const {feedback,submit}=useToolSubmission(onAction);
  if(mode==='equidistance') return <Equidistance questionData={questionData} feedback={feedback} submit={submit}/>;
  if(mode==='fromGeometry') return <FromGeometry questionData={questionData} feedback={feedback} submit={submit}/>;
  if(mode==='equation') return <EquationMode questionData={questionData} feedback={feedback} submit={submit}/>;
  return <FeatureMode questionData={questionData} feedback={feedback} submit={submit}/>;
}

function ParabolaVisual({spec,point=null}){
  const features=parabolaFeatures(spec);
  const fn=parabolaFunction(spec);
  const points=[{0:features.vertex[0],1:features.vertex[1],label:'vertex',fill:'#1a73e8'},{0:features.focus[0],1:features.focus[1],label:'focus',fill:'#d93025'},...features.latusRectumEndpoints.map((p,i)=>({0:p[0],1:p[1],label:i===0?'latus rectum':'',fill:'#8a3ffc'}))];
  if(point) points.push({0:point[0],1:point[1],label:'P',fill:'#137333'});
  return <CoordinatePlane xMin={-10} xMax={10} yMin={-10} yMax={10} functions={fn?[fn]:[]} points={points} verticalLines={features.directrix.kind==='vertical'?[features.directrix.value]:[]} horizontalLines={features.directrix.kind==='horizontal'?[features.directrix.value]:[]}>
    {({sx,sy})=> spec.orientation==='horizontal' ? <path d={`M ${sx(features.vertex[0])} ${sy(features.vertex[1]-5)} Q ${sx(features.vertex[0]+(spec.p>0?4:-4))} ${sy(features.vertex[1])} ${sx(features.vertex[0])} ${sy(features.vertex[1]+5)}`} fill="none" stroke="#1a73e8" strokeWidth="3"/> : null}
  </CoordinatePlane>;
}

function FeatureMode({questionData,feedback,submit}){
  const spec={h:Number(questionData.h??1),k:Number(questionData.k??-1),p:Number(questionData.p??2),orientation:questionData.orientation||'vertical'};
  const features=parabolaFeatures(spec);
  const [focusX,setFocusX]=useState(''); const [focusY,setFocusY]=useState(''); const [directrix,setDirectrix]=useState(''); const [latus,setLatus]=useState('');
  const check=()=>{
    const checks=[nearlyEqual(focusX,features.focus[0],0.01),nearlyEqual(focusY,features.focus[1],0.01),nearlyEqual(directrix,features.directrix.value,0.01),nearlyEqual(latus,features.latusRectumLength,0.01)];
    submit({isCorrect:checks.every(Boolean),score:checks.filter(Boolean).length/checks.length},{focusX,focusY,directrix,latus},{mode:'features'});
  };
  return <ToolShell title="Parabola Geometry Lab" subtitle="Connect vertex, focus, directrix, axis, opening direction, and latus rectum." badge="Algebra II · Focus/Directrix"><ToolGrid min={340}><Panel title="Geometry view"><ParabolaVisual spec={spec}/><p><strong>Vertex:</strong> ({spec.h}, {spec.k}) &nbsp; <strong>p:</strong> {spec.p} &nbsp; <strong>opens:</strong> {features.opens}</p></Panel><Panel title="Identify geometric features"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><label>Focus x<input value={focusX} onChange={e=>setFocusX(e.target.value)} style={inputStyle}/></label><label>Focus y<input value={focusY} onChange={e=>setFocusY(e.target.value)} style={inputStyle}/></label></div><label style={{display:'block',marginTop:10}}>Directrix {features.directrix.kind==='horizontal'?'y':'x'} =<input value={directrix} onChange={e=>setDirectrix(e.target.value)} style={inputStyle}/></label><label style={{display:'block',marginTop:10}}>Latus rectum length<input value={latus} onChange={e=>setLatus(e.target.value)} style={inputStyle}/></label><button type="button" onClick={check} style={actionStyle}>Check features</button>{feedback?<div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'All geometric features agree with p.':`Focus and directrix are |p|=${Math.abs(spec.p)} from the vertex; latus rectum length is 4|p|.`}</ResultPill></div>:null}</Panel></ToolGrid></ToolShell>;
}

function Equidistance({questionData,feedback,submit}){
  const spec={h:Number(questionData.h??0),k:Number(questionData.k??0),p:Number(questionData.p??2),orientation:questionData.orientation||'vertical'};
  const point=questionData.point || sampleParabolaPoint(spec,Number(questionData.offset??4));
  const distances=pointDistances(spec,point);
  const [focusDistance,setFocusDistance]=useState(''); const [directrixDistance,setDirectrixDistance]=useState(''); const [onCurve,setOnCurve]=useState('yes');
  const check=()=>{
    const checks=[nearlyEqual(focusDistance,distances.focusDistance,0.02),nearlyEqual(directrixDistance,distances.directrixDistance,0.02),(onCurve==='yes')===distances.onParabola];
    submit({isCorrect:checks.every(Boolean),score:checks.filter(Boolean).length/3},{focusDistance,directrixDistance,onCurve},{mode:'equidistance'});
  };
  return <ToolShell title="Parabola Geometry Lab" subtitle="Test the defining property: every parabola point is equidistant from focus and directrix." badge="Algebra II · Geometric Definition"><ToolGrid min={340}><Panel title="Point-distance model"><ParabolaVisual spec={spec} point={point}/><p>Investigate P = <strong>({round(point[0],2)}, {round(point[1],2)})</strong>.</p></Panel><Panel title="Measure and decide"><label>Distance P → focus<input value={focusDistance} onChange={e=>setFocusDistance(e.target.value)} style={inputStyle}/></label><label style={{display:'block',marginTop:10}}>Perpendicular distance P → directrix<input value={directrixDistance} onChange={e=>setDirectrixDistance(e.target.value)} style={inputStyle}/></label><label style={{display:'block',marginTop:10}}>Is P on the parabola?<select value={onCurve} onChange={e=>setOnCurve(e.target.value)} style={inputStyle}><option value="yes">Yes</option><option value="no">No</option></select></label><button type="button" onClick={check} style={actionStyle}>Check equidistance</button>{feedback?<div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'The two distances verify the parabola definition.':'A point is on the parabola only when the focus and directrix distances match.'}</ResultPill></div>:null}</Panel></ToolGrid></ToolShell>;
}

function FromGeometry({questionData,feedback,submit}){
  const focus=questionData.focus || [2,3]; const directrix=questionData.directrix || {kind:'horizontal',value:-1};
  const expected=geometryFromFocusDirectrix({focus,directrix});
  const [h,setH]=useState(''); const [k,setK]=useState(''); const [p,setP]=useState('');
  const check=()=>{
    const checks=expected?[nearlyEqual(h,expected.h,0.01),nearlyEqual(k,expected.k,0.01),nearlyEqual(p,expected.p,0.01)]:[false,false,false];
    submit({isCorrect:checks.every(Boolean),score:checks.filter(Boolean).length/3},{h,k,p},{mode:'fromGeometry'});
  };
  return <ToolShell title="Parabola Geometry Lab" subtitle="Reverse the geometry: infer vertex and p from a focus and directrix." badge="Algebra II · Construct from Geometry"><ToolGrid min={320}><Panel title="Given"><p><strong>Focus:</strong> ({focus[0]}, {focus[1]})</p><p><strong>Directrix:</strong> {directrix.kind==='horizontal'?'y':'x'} = {directrix.value}</p><p style={{color:'#5f6b7a'}}>The vertex lies halfway between the focus and directrix along the axis of symmetry.</p></Panel><Panel title="Recover the parabola"><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}><label>h<input value={h} onChange={e=>setH(e.target.value)} style={inputStyle}/></label><label>k<input value={k} onChange={e=>setK(e.target.value)} style={inputStyle}/></label><label>p<input value={p} onChange={e=>setP(e.target.value)} style={inputStyle}/></label></div><button type="button" onClick={check} style={actionStyle}>Check geometry</button>{feedback?<div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'Vertex and p reconstruct the given focus/directrix.':'Find the midpoint first; signed p points from vertex toward the focus.'}</ResultPill></div>:null}</Panel></ToolGrid></ToolShell>;
}

function EquationMode({questionData,feedback,submit}){
  const spec={h:Number(questionData.h??-2),k:Number(questionData.k??1),p:Number(questionData.p??1.5),orientation:questionData.orientation||'vertical'};
  const parts=standardEquationParts(spec); const features=parabolaFeatures(spec);
  const [coefficient,setCoefficient]=useState(''); const [opening,setOpening]=useState('up');
  const check=()=>{
    const coeffCorrect=nearlyEqual(coefficient,parts.coefficient,0.01); const openCorrect=opening===features.opens;
    submit({isCorrect:coeffCorrect&&openCorrect,score:[coeffCorrect,openCorrect].filter(Boolean).length/2},{coefficient,opening},{mode:'equation'});
  };
  const equation=spec.orientation==='horizontal'?`(y − ${spec.k})² = 4p(x − ${spec.h})`:`(x − ${spec.h})² = 4p(y − ${spec.k})`;
  return <ToolShell title="Parabola Geometry Lab" subtitle="Translate geometric parameter p into standard focus/directrix equation form." badge="Algebra II · Equation Form"><ToolGrid min={320}><Panel title="Standard form"><p style={{fontSize:20,fontWeight:900}}>{equation}</p><p>Vertex: ({spec.h}, {spec.k}) · p = {spec.p}</p></Panel><Panel title="Complete the interpretation"><label>Value of 4p<input value={coefficient} onChange={e=>setCoefficient(e.target.value)} style={inputStyle}/></label><label style={{display:'block',marginTop:10}}>Opening direction<select value={opening} onChange={e=>setOpening(e.target.value)} style={inputStyle}>{['up','down','left','right'].map(v=><option key={v}>{v}</option>)}</select></label><button type="button" onClick={check} style={actionStyle}>Check equation</button>{feedback?<div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'Equation coefficient and opening agree with p.':'Remember the coefficient is 4p and the sign of p controls opening direction.'}</ResultPill></div>:null}</Panel></ToolGrid></ToolShell>;
}
