import React, { useMemo, useState } from 'react';
import { getToolDefinition, listTools } from '../tools/toolRegistry';
import { ToolRuntimeProvider } from '../tools/shared/ToolRuntimeContext';

const SAMPLE_SPECS = {
  dataModelingLab: { mode:'full', points:[[1,2],[2,3],[3,5],[4,5],[5,7],[6,8],[7,10]], causationSupported:false, expectedModel:'linear', predictionX:8 },
  inverseCompositionLab: { mode:'restriction', f:{type:'quadratic',a:1,h:2,k:-1,inverseBranch:'right',domain:{min:2}}, g:{type:'linear',a:-1,h:0,k:4}, x:5 },
  systemsWorkspace: { mode:'linearQuadratic', linearQuadratic:{line:{m:1,b:2},quadratic:{a:1,b:0,c:-4}} },
  parabolaGeometryLab: { mode:'features', h:1,k:-1,p:2,orientation:'vertical' },
  polynomialWorkshop: { mode:'graphConnection', roots:[{root:-2,multiplicity:2},{root:3,multiplicity:1}],leadingCoefficient:0.35,targetRoot:-2 },
  signSolutionAnalyzer: { mode:'rational', numeratorFactors:[{root:-2,multiplicity:1},{root:3,multiplicity:1}],denominatorFactors:[{root:1,multiplicity:1}],relation:'>=' },
  sequenceExplorer: { mode:'compare',left:{kind:'arithmetic',first:5,difference:4},right:{kind:'geometric',first:1,ratio:2},compareN:7,leftLabel:'Arithmetic A',rightLabel:'Geometric B' },
  complexPlaneLab: { mode:'rotation',z:{re:3,im:1},quarterTurns:1 },
  exponentialLogBridge: { mode:'inverse',function:{a:2,base:2,h:1,k:-3},x:3 },
  transformationsLab: { mode:'pointMap',family:'exponential',function:{type:'exponential',a:2,h:1,k:-3,base:2},parentPoint:[1,2] },
  representationMatch: { mode:'findMismatch',targetId:'linear',mixedSet:{equationId:'linear',tableId:'quadratic',contextId:'linear'} },
  functionInvestigation2: { mode:'domainRange',function:{type:'squareRoot',a:-2,h:3,k:1} },
  graphing2: { mode:'standardForm',standard:{A:2,B:1,C:4} },
  stepAlgebra2: { equation:{a:3,b:6,c:21} },
  solutionReview2: { solutionSteps:['Identify the target.','Use a mathematically valid strategy.','Verify in the original problem.'] },
};

export default function MathToolsLab() {
  const tools = useMemo(() => listTools(), []);
  const [toolId, setToolId] = useState('transformationsLab');
  const [eventLog, setEventLog] = useState([]);
  const definition = getToolDefinition(toolId);
  const Tool = definition.component;
  const onAction = (type, payload) => setEventLog((log) => [{ type, payload, at:new Date().toLocaleTimeString() }, ...log].slice(0, 8));

  return <main style={{ minHeight:'100vh', background:'#eef2f7', color:'#172033', fontFamily:'Inter, ui-sans-serif, system-ui, sans-serif' }}>
    <header style={{ background:'linear-gradient(135deg,#174ea6,#2468e5)', color:'#fff', padding:'24px 28px' }}>
      <div style={{ maxWidth:1180, margin:'0 auto', display:'flex', justifyContent:'space-between', gap:18, alignItems:'center', flexWrap:'wrap' }}>
        <div><div style={{fontWeight:900,fontSize:13,letterSpacing:1.1,opacity:.85}}>MATHMASTER · TOOL PREVIEW</div><h1 style={{margin:'5px 0 0',fontSize:30}}>Math Tools Preview Bench</h1><p style={{margin:'6px 0 0',opacity:.9}}>Try any interactive tool the way a student sees it. Nothing here is graded or saved. Worked answers are shown on this page only — students never see them.</p></div>
        <div style={{background:'rgba(255,255,255,.14)',border:'1px solid rgba(255,255,255,.28)',padding:'10px 14px',borderRadius:12,fontWeight:800}}>Teacher preview</div>
      </div>
    </header>
    <div style={{ maxWidth:1180, margin:'0 auto', padding:24, display:'grid', gridTemplateColumns:'260px minmax(0,1fr)', gap:20 }}>
      <aside style={{ background:'#fff', border:'1px solid #d9e2f1', borderRadius:16, padding:14, height:'fit-content', position:'sticky', top:16 }}>
        <h2 style={{fontSize:15,margin:'4px 6px 10px'}}>Tools</h2>
        <div style={{display:'grid',gap:6}}>{tools.map((tool)=><button key={tool.toolId} type="button" onClick={()=>{setToolId(tool.toolId);setEventLog([]);}} style={{textAlign:'left',padding:'10px 11px',borderRadius:9,border:toolId===tool.toolId?'1px solid #1a73e8':'1px solid transparent',background:toolId===tool.toolId?'#eef4ff':'transparent',color:'#24324a',fontWeight:toolId===tool.toolId?800:600,cursor:'pointer'}}>{tool.label}</button>)}</div>
      </aside>
      <section style={{minWidth:0}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>{definition.courses.map(course=><span key={course} style={{padding:'6px 9px',borderRadius:999,background:'#fff',border:'1px solid #d9e2f1',fontSize:12,fontWeight:800}}>{course}</span>)}</div>
        {/* The teacher bench is the one surface that may show worked answers:
            it exists to inspect a tool, not to be graded by it. */}
        <ToolRuntimeProvider showImmediateFeedback revealAnswers>
          <Tool questionData={SAMPLE_SPECS[toolId] || {}} onAction={onAction} attemptRecord={{isCorrect:false,attemptNumber:2,score:.5,response:{sample:'student response'}}} />
        </ToolRuntimeProvider>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:18}}>
          <div style={{background:'#fff',border:'1px solid #d9e2f1',borderRadius:14,padding:16}}><h3 style={{marginTop:0,fontSize:15}}>Capability Contract</h3><pre style={{whiteSpace:'pre-wrap',fontSize:12,margin:0}}>{JSON.stringify(definition.capabilities,null,2)}</pre></div>
          <div style={{background:'#fff',border:'1px solid #d9e2f1',borderRadius:14,padding:16}}><h3 style={{marginTop:0,fontSize:15}}>Attempt Event Preview</h3>{eventLog.length?eventLog.map((event,i)=><div key={i} style={{padding:'7px 0',borderBottom:'1px solid #edf1f6',fontSize:12}}><strong>{event.type}</strong> · {event.at}</div>):<p style={{color:'#667085',fontSize:13}}>Interact with the tool and submit a response to inspect its contract event.</p>}</div>
        </div>
      </section>
    </div>
  </main>;
}
