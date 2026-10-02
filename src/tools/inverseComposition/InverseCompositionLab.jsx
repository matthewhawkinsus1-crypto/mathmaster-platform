import React, { useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { round } from '../shared/toolMath';
import {
  composeValue,
  evaluateSpecWithDomain,
  functionLabel,
  hasFunctionalInverse,
  inverseLabFunctions,
  inverseLabInitialX,
  inverseLabInputLocked,
  inverseLabRequiredParts,
  inverseValue,
  restrictionDescription,
} from './inverseCompositionMath';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import inverseCompositionGrader from '../../../functions/shared/serverGrading/tools/inverseCompositionLab.mjs';
import { useRevealAnswers } from '../shared/ToolRuntimeContext';
import { UNANSWERED } from '../shared/judgmentChoices.js';

const inputStyle = { width:'100%', boxSizing:'border-box', padding:'9px 10px', border:'1px solid #cfd8e6', borderRadius:8, background:'#fff' };
const Field = ({ label, children }) => <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#465267' }}>{label}<div style={{marginTop:5}}>{children}</div></label>;

export default function InverseCompositionLab({ questionData = {}, onAction }) {
  // f, g (or the lab's defaults) and the input x come from the shared
  // definitions the grader reads.
  const { f, g } = inverseLabFunctions(questionData);
  const mode = questionData.mode || 'full';
  const showComposition = mode === 'composition' || mode === 'full';
  const showInverse = mode !== 'composition';
  // A question that asks for the restriction shows its select, whatever f is
  // (the parts asked come from the same shared list the grader marks).
  const asksRestriction = inverseLabRequiredParts(mode, f).includes('restriction');
  const inputLocked = inverseLabInputLocked(questionData);
  const [draftX, setX] = usePersistentToolState('x', inverseLabInitialX(questionData));
  // A given input is the question's own x, exactly as the grader reads it —
  // never a draft left from an earlier version of the question.
  const x = inputLocked ? inverseLabInitialX(questionData) : draftX;
  const [fogAnswer, setFogAnswer] = usePersistentToolState('fogAnswer', '');
  const [gofAnswer, setGofAnswer] = usePersistentToolState('gofAnswer', '');
  const [inverseAnswer, setInverseAnswer] = usePersistentToolState('inverseAnswer', '');
  // Unanswered until chosen (judgmentChoices.js). It opened on "No restriction
  // needed", which was the right answer for every function that is not a
  // quadratic.
  const [restrictionChoice, setRestrictionChoice] = usePersistentToolState('restrictionChoice', UNANSWERED);
  const { feedback, submit } = useToolSubmission(onAction);
  const revealAnswers = useRevealAnswers();

  const canInvert = useMemo(() => hasFunctionalInverse(f), [f]);
  const fx = useMemo(() => evaluateSpecWithDomain(f, Number(x)), [f, x]);
  const gx = useMemo(() => evaluateSpecWithDomain(g, Number(x)), [g, x]);
  const fog = useMemo(() => composeValue(f, g, Number(x)), [f, g, x]);
  const gof = useMemo(() => composeValue(g, f, Number(x)), [f, g, x]);
  const inverseAtFx = useMemo(() => canInvert ? inverseValue(f, fx) : Number.NaN, [canInvert, f, fx]);

  // The student's work, exactly as the shared grader reads it: the boxes as
  // typed (a blank stays blank) and the input x the lab is using.
  const work = useMemo(
    () => ({ x, fogAnswer, gofAnswer, inverseAnswer, restrictionChoice }),
    [x, fogAnswer, gofAnswer, inverseAnswer, restrictionChoice],
  );
  useReportToolWork(work);

  const check = () => {
    // The shared grader marks exactly the parts this view asks for, under the
    // names the gradebook shows: an inverse-only question records no "fog" or
    // "gof" it never asked (B-25).
    const result = gradeToolCheck(inverseCompositionGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode, parts: result.parts });
  };

  const graphF = (value) => evaluateSpecWithDomain(f, value);
  const graphInverse = (value) => canInvert ? inverseValue(f, value) : Number.NaN;
  const baseGraphBounds = questionData.graph || { xMin:-8, xMax:8, yMin:-8, yMax:8 };
  const graphBounds = useMemo(() => {
    if (!showInverse || !Number.isFinite(fx)) return baseGraphBounds;
    const visibleValues = [Number(x), Number(fx), Number(inverseAtFx)].filter(Number.isFinite);
    if (!visibleValues.length) return baseGraphBounds;
    const low = Math.min(...visibleValues);
    const high = Math.max(...visibleValues);
    const pad = Math.max(1, (high - low) * 0.12);
    return {
      ...baseGraphBounds,
      xMin: Math.min(Number(baseGraphBounds.xMin ?? -8), low - pad),
      xMax: Math.max(Number(baseGraphBounds.xMax ?? 8), high + pad),
      yMin: Math.min(Number(baseGraphBounds.yMin ?? -8), low - pad),
      yMax: Math.max(Number(baseGraphBounds.yMax ?? 8), high + pad),
    };
  }, [baseGraphBounds, showInverse, fx, x, inverseAtFx]);

  const feedbackBlock = feedback ? (() => {
    // The shared grader marks exactly the parts this view asks for.
    const parts = Array.isArray(feedback.metadata?.parts) ? feedback.metadata.parts : [];
    const missed = parts.filter((part) => !part.isCorrect).map((part) => part.id);
    const explain = feedback.isCorrect
      ? mode === 'composition'
        ? 'Correct — both composition orders are evaluated correctly.'
        : mode === 'inverse'
          ? 'Correct — the inverse undoes f and returns the original input.'
          : 'Correct — every requested function relationship checks out.'
      : missed.includes('fog') && missed.includes('gof')
        ? 'Neither composition is right yet. Work the inside function first, then put its output into the outside function.'
        : missed.includes('fog')
          ? '(g ∘ f) is right but (f ∘ g) is not. In (f ∘ g), g acts first.'
          : missed.includes('gof')
            ? '(f ∘ g) is right but (g ∘ f) is not. In (g ∘ f), f acts first.'
            : missed.includes('restriction')
              ? 'The arithmetic is right, but the domain restriction is not. A parabola only becomes one-to-one when you keep a single side of its vertex.'
              : 'The inverse value is off. f⁻¹ undoes f, so f⁻¹(f(x)) has to give you back the x you started with.';
    return <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{explain}</p></div>;
  })() : null;

  const modeHints = mode === 'composition' ? [
    'A composition is two machines in a row. Whatever comes out of the first goes into the second.',
    `In (f ∘ g)(${x}), work out g(${x}) first, then put that answer into f.`,
    'Then reverse the order for g ∘ f. The two answers do not have to match.',
  ] : [
    'An inverse reverses the input-output relationship of a function.',
    `Start with x = ${x}, find f(x), then ask which input gives that output back through f⁻¹.`,
    'The points (x, f(x)) and (f(x), x) are reflections across y = x.',
  ];

  return (
    <ToolShell
      title="Inverse & Composition Lab"
      subtitle={mode === 'composition' ? 'Follow a value through two functions in both orders.' : mode === 'inverse' ? 'Undo a function and connect its graph to the inverse.' : 'Compose functions and connect a function to its inverse.'}
      badge="Algebra II · Functions"
    >
      <TaskCard
        question={questionData}
        task={mode === 'composition'
          ? `Work out (f ∘ g)(${x}) and (g ∘ f)(${x}).`
          : mode === 'inverse'
            ? 'Use the inverse to undo f and recover the original input.'
            : mode === 'restriction'
              ? 'Decide which domain restriction makes this function invertible, then undo it.'
              : `Compose f and g both ways at x = ${x}, then undo f with its inverse.`}
        steps={mode === 'composition' ? [
          'Follow the value through the inside function first.',
          'Feed that result into the outside function.',
          'Repeat in the other order and compare the results.',
        ] : mode === 'inverse' ? [
          'Find the output f produces from the given input.',
          'Use f⁻¹ on that output to recover the starting input.',
          'Use the graph to connect (x, f(x)) with its swapped inverse point.',
        ] : [
          'Follow the value through each requested function in order.',
          'Use the inverse to undo f and recover the original input.',
          'If a restriction is required, keep only a one-to-one part of the domain.',
        ]}
      />
      <ToolGrid min={350}>
        <Panel title="1 · Function definitions">
          <div style={{display:'grid',gap:10}}>
            <div style={{padding:13,borderRadius:10,background:'#eef4ff',fontWeight:800}}>{functionLabel(f,'f')}</div>
            {showComposition ? <div style={{padding:13,borderRadius:10,background:'#f5f0ff',fontWeight:800}}>{functionLabel(g,'g')}</div> : null}
          </div>
          {showInverse && f.type === 'quadratic' ? <div style={{marginTop:12,padding:12,borderRadius:10,background:'#fff8e6',color:'#6d4c00'}}><strong>Inverse condition:</strong> {restrictionDescription(f)}</div> : null}
          {inputLocked
            ? <div style={{marginTop:12,padding:11,borderRadius:9,background:'#f8f9fa',border:'1px solid #dfe3e7',fontSize:13,color:'#465267'}}><strong>Given input:</strong> x = {x}</div>
            : <Field label="Choose input x"><input type="number" step="0.1" value={x} onChange={(e)=>setX(e.target.value)} style={inputStyle}/></Field>}
          <div style={{display:'grid',gridTemplateColumns:showComposition?'1fr 1fr':'1fr',gap:10,marginTop:12}}>
            <div style={{padding:12,borderRadius:10,background:'#f8fbff'}}><strong>f(x)</strong><div style={{fontSize:24,fontWeight:900,marginTop:4}}>{Number.isFinite(fx)?round(fx,3):'undefined'}</div></div>
            {showComposition ? <div style={{padding:12,borderRadius:10,background:'#f8fbff'}}><strong>g(x)</strong><div style={{fontSize:24,fontWeight:900,marginTop:4}}>{Number.isFinite(gx)?round(gx,3):'undefined'}</div></div> : null}
          </div>
        </Panel>

        {showComposition ? <Panel title="2 · Function-machine composition">
          <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr auto 1fr',alignItems:'center',gap:7,textAlign:'center',marginBottom:14}}>
            <div style={{padding:11,borderRadius:10,background:'#eef4ff'}}>{x}</div><strong>→ g →</strong><div style={{padding:11,borderRadius:10,background:'#f5f0ff'}}>{Number.isFinite(gx)?round(gx,2):'undefined'}</div><strong>→ f →</strong><div style={{padding:11,borderRadius:10,background:'#e9f7ef',fontWeight:800}}>{revealAnswers?(Number.isFinite(fog)?round(fog,2):'undefined'):'?'}</div>
          </div>
          <Field label={`Enter (f ∘ g)(${x})`}><input type="number" step="0.1" value={fogAnswer} onChange={(e)=>setFogAnswer(e.target.value)} style={inputStyle}/></Field>
          <div style={{height:10}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr auto 1fr',alignItems:'center',gap:7,textAlign:'center',marginBottom:14}}>
            <div style={{padding:11,borderRadius:10,background:'#eef4ff'}}>{x}</div><strong>→ f →</strong><div style={{padding:11,borderRadius:10,background:'#f5f0ff'}}>{Number.isFinite(fx)?round(fx,2):'undefined'}</div><strong>→ g →</strong><div style={{padding:11,borderRadius:10,background:'#e9f7ef',fontWeight:800}}>{revealAnswers?(Number.isFinite(gof)?round(gof,2):'undefined'):'?'}</div>
          </div>
          <Field label={`Enter (g ∘ f)(${x})`}><input type="number" step="0.1" value={gofAnswer} onChange={(e)=>setGofAnswer(e.target.value)} style={inputStyle}/></Field>
          <p style={{fontSize:13,color:'#5f6b7a',marginBottom:0}}>Composition order matters: the function written closest to x acts first.</p>
          {mode === 'composition' ? <>
            <button data-mm-enter-action="submit" type="button" onClick={check} style={{marginTop:16,padding:'10px 16px',background:'#1a73e8',color:'#fff',border:0,borderRadius:8,fontWeight:800}}>Check compositions</button>
            {feedbackBlock}
            <HintPanel hints={modeHints} onHintUsed={() => onAction?.('HINT_USED')} />
          </> : null}
        </Panel> : null}

        {showInverse ? <Panel title={showComposition ? "3 · Inverse graph relationship" : "2 · Inverse graph relationship"}>
          <CoordinatePlane
            xMin={graphBounds.xMin ?? -8} xMax={graphBounds.xMax ?? 8}
            yMin={graphBounds.yMin ?? -8} yMax={graphBounds.yMax ?? 8}
            functions={[graphF, ...(canInvert ? [graphInverse] : [])]}
            lines={[{m:1,b:0,stroke:'#667085'}]}
            points={Number.isFinite(fx) && canInvert ? [
              {x:Number(x),y:fx,label:'(x, f(x))',fill:'#1a73e8'},
              {x:fx,y:inverseAtFx,label:'swapped',fill:'#d93025'},
            ] : []}
          />
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:10,fontSize:12}}>
            <div style={{padding:8,borderRadius:8,background:'#eef4ff'}}><strong>f</strong> — solid blue</div>
            <div style={{padding:8,borderRadius:8,background:'#fce8e6'}}><strong>f⁻¹</strong> — dashed red</div>
            <div style={{padding:8,borderRadius:8,background:'#f2f4f7'}}><strong>y = x</strong> — grey mirror line</div>
          </div>
        </Panel> : null}

        {showInverse ? <Panel title={showComposition ? "4 · Verify the inverse" : "3 · Verify the inverse"}>
          {canInvert && Number.isFinite(fx) ? <>
            <p style={{marginTop:0}}>Because f({x}) = <strong>{round(fx,3)}</strong>, the inverse should undo that output.</p>
            <Field label={`f⁻¹(${round(fx,3)}) =`}><input type="number" step="0.1" value={inverseAnswer} onChange={(e)=>setInverseAnswer(e.target.value)} style={inputStyle}/></Field>
          </> : <div style={{padding:12,borderRadius:10,background:'#fce8e6',color:'#8a1c13'}}>On its full domain this function is not one-to-one, so it has no inverse function. Your teacher needs to restrict its domain before an inverse can be found.</div>}

          {/* Also shown whenever the question asks it. It used to need a
              quadratic, so a "restriction" question about any other function
              asked a part the student had no control for, which only the old
              "No restriction needed" default answered. */}
          {f.type === 'quadratic' || asksRestriction ? <div style={{marginTop:14}}><Field label={f.type === 'quadratic' ? 'Which restriction makes the quadratic one-to-one?' : 'Does f need a restricted domain to have an inverse?'}><select value={restrictionChoice} onChange={(e)=>setRestrictionChoice(e.target.value)} style={inputStyle}><option value={UNANSWERED}>Choose…</option><option value="none">No restriction needed</option><option value="left">Use the left branch (x ≤ vertex x)</option><option value="right">Use the right branch (x ≥ vertex x)</option><option value="required">A restriction is required, but branch is not specified</option></select></Field></div> : null}

          <button data-mm-enter-action="submit" type="button" onClick={check} style={{marginTop:16,padding:'10px 16px',background:'#1a73e8',color:'#fff',border:0,borderRadius:8,fontWeight:800}}>Check function reasoning</button>
          {feedbackBlock}
          <HintPanel hints={modeHints} onHintUsed={() => onAction?.('HINT_USED')} />
        </Panel> : null}
      </ToolGrid>
    </ToolShell>
  );
}
