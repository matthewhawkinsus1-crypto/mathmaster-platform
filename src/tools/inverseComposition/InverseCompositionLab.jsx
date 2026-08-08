import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { nearlyEqual, round } from '../shared/toolMath';
import {
  composeValue,
  evaluateSpecWithDomain,
  functionLabel,
  hasFunctionalInverse,
  inverseValue,
  restrictionDescription,
} from './inverseCompositionMath';
import useToolSubmission from '../shared/useToolSubmission';

const DEFAULT_F = { type:'linear', a:2, h:0, k:3 };
const DEFAULT_G = { type:'linear', a:-1, h:0, k:4 };
const inputStyle = { width:'100%', boxSizing:'border-box', padding:'9px 10px', border:'1px solid #cfd8e6', borderRadius:8, background:'#fff' };
const Field = ({ label, children }) => <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#465267' }}>{label}<div style={{marginTop:5}}>{children}</div></label>;

export default function InverseCompositionLab({ questionData = {}, onAction }) {
  const f = questionData.f || DEFAULT_F;
  const g = questionData.g || DEFAULT_G;
  const mode = questionData.mode || 'full';
  const [x, setX] = useState(questionData.x ?? 2);
  const [fogAnswer, setFogAnswer] = useState('');
  const [gofAnswer, setGofAnswer] = useState('');
  const [inverseAnswer, setInverseAnswer] = useState('');
  const [restrictionChoice, setRestrictionChoice] = useState('none');
  const { feedback, submit } = useToolSubmission(onAction);

  const canInvert = useMemo(() => hasFunctionalInverse(f), [f]);
  const fx = useMemo(() => evaluateSpecWithDomain(f, Number(x)), [f, x]);
  const gx = useMemo(() => evaluateSpecWithDomain(g, Number(x)), [g, x]);
  const fog = useMemo(() => composeValue(f, g, Number(x)), [f, g, x]);
  const gof = useMemo(() => composeValue(g, f, Number(x)), [f, g, x]);
  const inverseAtFx = useMemo(() => canInvert ? inverseValue(f, fx) : Number.NaN, [canInvert, f, fx]);

  const expectedRestriction = (() => {
    if (f.type !== 'quadratic') return 'none';
    const h = Number(f.h ?? 0);
    if (f.inverseBranch === 'left' || Number(f.domain?.max) === h) return 'left';
    if (f.inverseBranch === 'right' || Number(f.domain?.min) === h) return 'right';
    return 'required';
  })();

  const requiredParts = mode === 'composition' ? ['fog','gof']
    : mode === 'inverse' ? ['inverse']
      : mode === 'restriction' ? ['restriction','inverse']
        : ['fog','gof','inverse', ...(f.type === 'quadratic' ? ['restriction'] : [])];

  const check = () => {
    const results = {
      fog: Number.isFinite(fog) && nearlyEqual(Number(fogAnswer), fog, 0.02),
      gof: Number.isFinite(gof) && nearlyEqual(Number(gofAnswer), gof, 0.02),
      inverse: canInvert && Number.isFinite(inverseAtFx) && nearlyEqual(Number(inverseAnswer), Number(x), 0.02),
      restriction: restrictionChoice === expectedRestriction,
    };
    const scored = requiredParts.map((part)=>results[part]);
    const score = scored.filter(Boolean).length / scored.length;
    submit(
      { isCorrect: score === 1, score },
      { x:Number(x), fog:Number(fogAnswer), gof:Number(gofAnswer), inverse:Number(inverseAnswer), restrictionChoice },
      { mode, parts:results, expected:{ fog, gof, inverseAtFx, expectedRestriction } },
    );
  };

  const graphF = (value) => evaluateSpecWithDomain(f, value);
  const graphInverse = (value) => canInvert ? inverseValue(f, value) : Number.NaN;
  const graphBounds = questionData.graph || { xMin:-8, xMax:8, yMin:-8, yMax:8 };

  return (
    <ToolShell
      title="Inverse & Composition Lab"
      subtitle="Trace composition in the correct order, verify inverse input/output swaps, and enforce domain restrictions when an inverse would otherwise fail the vertical-line test."
      badge="Algebra II · Functions"
      footer="The same tool supports linear, restricted quadratic, exponential, logarithmic, and square-root inverse families. Composition and inverse evidence are scored separately for partial credit."
    >
      <ToolGrid min={350}>
        <Panel title="1 · Function definitions">
          <div style={{display:'grid',gap:10}}>
            <div style={{padding:13,borderRadius:10,background:'#eef4ff',fontWeight:800}}>{functionLabel(f,'f')}</div>
            <div style={{padding:13,borderRadius:10,background:'#f5f0ff',fontWeight:800}}>{functionLabel(g,'g')}</div>
          </div>
          {f.type === 'quadratic' ? <div style={{marginTop:12,padding:12,borderRadius:10,background:'#fff8e6',color:'#6d4c00'}}><strong>Inverse condition:</strong> {restrictionDescription(f)}</div> : null}
          <Field label="Choose input x"><input type="number" step="0.1" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
            <div style={{padding:12,borderRadius:10,background:'#f8fbff'}}><strong>f(x)</strong><div style={{fontSize:24,fontWeight:900,marginTop:4}}>{Number.isFinite(fx)?round(fx,3):'undefined'}</div></div>
            <div style={{padding:12,borderRadius:10,background:'#f8fbff'}}><strong>g(x)</strong><div style={{fontSize:24,fontWeight:900,marginTop:4}}>{Number.isFinite(gx)?round(gx,3):'undefined'}</div></div>
          </div>
        </Panel>

        <Panel title="2 · Function-machine composition">
          <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr auto 1fr',alignItems:'center',gap:7,textAlign:'center',marginBottom:14}}>
            <div style={{padding:11,borderRadius:10,background:'#eef4ff'}}>{x}</div><strong>→ g →</strong><div style={{padding:11,borderRadius:10,background:'#f5f0ff'}}>{Number.isFinite(gx)?round(gx,2):'undefined'}</div><strong>→ f →</strong><div style={{padding:11,borderRadius:10,background:'#e9f7ef'}}>{Number.isFinite(fog)?round(fog,2):'undefined'}</div>
          </div>
          <Field label={`Enter (f ∘ g)(${x})`}><input type="number" step="0.1" value={fogAnswer} onChange={(e)=>setFogAnswer(e.target.value)} style={inputStyle}/></Field>
          <div style={{height:10}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr auto 1fr',alignItems:'center',gap:7,textAlign:'center',marginBottom:14}}>
            <div style={{padding:11,borderRadius:10,background:'#eef4ff'}}>{x}</div><strong>→ f →</strong><div style={{padding:11,borderRadius:10,background:'#f5f0ff'}}>{Number.isFinite(fx)?round(fx,2):'undefined'}</div><strong>→ g →</strong><div style={{padding:11,borderRadius:10,background:'#e9f7ef'}}>{Number.isFinite(gof)?round(gof,2):'undefined'}</div>
          </div>
          <Field label={`Enter (g ∘ f)(${x})`}><input type="number" step="0.1" value={gofAnswer} onChange={(e)=>setGofAnswer(e.target.value)} style={inputStyle}/></Field>
          <p style={{fontSize:13,color:'#5f6b7a',marginBottom:0}}>Composition order matters: the function written closest to x acts first.</p>
        </Panel>

        <Panel title="3 · Inverse graph relationship">
          <CoordinatePlane
            xMin={graphBounds.xMin ?? -8} xMax={graphBounds.xMax ?? 8}
            yMin={graphBounds.yMin ?? -8} yMax={graphBounds.yMax ?? 8}
            functions={[graphF, ...(canInvert ? [graphInverse] : [])]}
            lines={[{m:1,b:0,stroke:'#667085'}]}
            points={Number.isFinite(fx) && canInvert ? [
              {0:Number(x),1:fx,label:'(x, f(x))',fill:'#1a73e8'},
              {0:fx,1:inverseAtFx,label:'swapped',fill:'#d93025'},
            ] : []}
          />
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:10,fontSize:12}}>
            <div style={{padding:8,borderRadius:8,background:'#eef4ff'}}><strong>Blue:</strong> f</div>
            <div style={{padding:8,borderRadius:8,background:'#fce8e6'}}><strong>Red:</strong> f⁻¹</div>
            <div style={{padding:8,borderRadius:8,background:'#f2f4f7'}}><strong>Gray:</strong> y=x</div>
          </div>
        </Panel>

        <Panel title="4 · Verify the inverse">
          {canInvert && Number.isFinite(fx) ? <>
            <p style={{marginTop:0}}>Because f({x}) = <strong>{round(fx,3)}</strong>, the inverse should undo that output.</p>
            <Field label={`f⁻¹(${round(fx,3)}) =`}><input type="number" step="0.1" value={inverseAnswer} onChange={(e)=>setInverseAnswer(e.target.value)} style={inputStyle}/></Field>
          </> : <div style={{padding:12,borderRadius:10,background:'#fce8e6',color:'#8a1c13'}}>This function does not currently have a one-to-one inverse under the supplied domain. Add a valid restriction in the family JSON.</div>}

          {f.type === 'quadratic' ? <div style={{marginTop:14}}><Field label="Which restriction makes the quadratic one-to-one?"><select value={restrictionChoice} onChange={(e)=>setRestrictionChoice(e.target.value)} style={inputStyle}><option value="none">No restriction needed</option><option value="left">Use the left branch (x ≤ vertex x)</option><option value="right">Use the right branch (x ≥ vertex x)</option><option value="required">A restriction is required, but branch is not specified</option></select></Field></div> : null}

          <button type="button" onClick={check} style={{marginTop:16,padding:'10px 16px',background:'#1a73e8',color:'#fff',border:0,borderRadius:8,fontWeight:800}}>Check function reasoning</button>
          {feedback ? <div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect?'Composition and inverse evidence are correct.':`Function evidence: ${Math.round(feedback.score*100)}%`}</ResultPill></div> : null}
        </Panel>
      </ToolGrid>
    </ToolShell>
  );
}
