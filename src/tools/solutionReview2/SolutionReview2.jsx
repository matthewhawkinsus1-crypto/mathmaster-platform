import React from 'react';
import ToolShell,{Panel,ToolGrid} from '../shared/ToolShell';

export default function SolutionReview2({ questionData = {}, attemptRecord = {}, review = {} }) {
  const steps = review.steps || questionData.solutionSteps || [
    'Identify the mathematical structure and the target quantity.',
    'Choose a representation or operation that preserves the relationship.',
    'Check the result in the original representation.',
  ];
  const misconceptions = review.misconceptions || attemptRecord.misconceptions || [];
  return <ToolShell title="Solution Review 2.0" subtitle="Tool-specific review that explains strategy, evidence, and next-step reasoning instead of only revealing an answer." badge="Shared review service">
    <ToolGrid min={320}>
      <Panel title="Your evidence"><p><strong>Result:</strong> {attemptRecord.isCorrect?'Correct':'Needs revision'}</p><p><strong>Attempts:</strong> {attemptRecord.attemptNumber??'—'}</p><p><strong>Score:</strong> {typeof attemptRecord.score==='number'?`${Math.round(attemptRecord.score*100)}%`:'—'}</p>{attemptRecord.response?<pre style={{whiteSpace:'pre-wrap',background:'#fff',border:'1px solid #e5e7eb',padding:10,borderRadius:8}}>{JSON.stringify(attemptRecord.response,null,2)}</pre>:null}</Panel>
      <Panel title="A strong solution path"><ol style={{lineHeight:1.7,paddingLeft:20}}>{steps.map((step,i)=><li key={i}>{step}</li>)}</ol>{misconceptions.length?<><h4>Watch for</h4><ul>{misconceptions.map((item,i)=><li key={i}>{item}</li>)}</ul></>:null}</Panel>
    </ToolGrid>
  </ToolShell>;
}
