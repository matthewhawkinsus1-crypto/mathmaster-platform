import { useEffect, useMemo } from 'react';
import GraphDisplay from './GraphDisplay';
import QuestionPrompt from './QuestionPrompt';
import useUndoHistory from './useUndoHistory';
import graphComparisonGrader from '../functions/shared/serverGrading/tools/graphComparison.mjs';
import { fieldResponsesWork } from '../functions/shared/toolMath/scenario/scenarioWork.mjs';
import { gradeToolCheck } from './tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from './platform/grading/sharedAnswerState.js';

export default function GraphComparison({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const graphs = useMemo(() => (Array.isArray(question.graphs) ? question.graphs.filter((item) => item?.graph) : []), [question.graphs]);
  const fields = useMemo(() => (Array.isArray(question.fields) ? question.fields.filter((item) => item?.id) : []), [question.fields]);
  const graphLabelById = useMemo(() => Object.fromEntries(graphs.map((item, index) => [String(item.id || ''), item.label || `Graph ${index + 1}`])), [graphs]);
  const history = useUndoHistory({}, 80, draftKey ? `${draftKey}:graph-comparison` : null);
  const responses = history.value;

  // The student's raw work. Each field's verdict comes ONLY from the shared
  // grader the server also runs (serverGrading/tools/graphComparison.mjs).
  const work = useMemo(() => fieldResponsesWork(responses), [responses]);
  const grading = useMemo(() => gradeToolCheck(graphComparisonGrader, question, work), [question, work]);
  const questionDetails = `${question.prompt || 'Compare the graphs.'} Responses: ${JSON.stringify(responses)}`;

  useEffect(() => {
    onStateChange(answerStateFromSharedGrading(grading, { questionDetails }));
  }, [grading, questionDetails, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last graph-comparison response' });
    return () => onUndoStateChange?.(null);
  }, [history.canUndo, history.undo, onUndoStateChange]);

  const update = (id, value) => history.setValue((current) => ({ ...current, [id]: value }));

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', textAlign: 'left' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0 }}>Compare and Contrast Graphs</h2>
      <QuestionPrompt>{question.prompt || 'Study the graphs and describe their similarities and differences.'}</QuestionPrompt>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: '18px' }}>
        {graphs.map((item, index) => <article key={item.id || index} style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--mm-border)', background: 'var(--mm-surface)' }}><h3 style={{ textAlign: 'center', margin: '4px 0' }}>{item.label || `Graph ${index + 1}`}</h3><GraphDisplay graph={item.graph} title={item.label || `Graph ${index + 1}`} />{item.scenario && <p style={{ margin: '0 10px 10px', color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>{item.scenario}</p>}</article>)}
      </div>
      <div style={{ display: 'grid', gap: '16px', marginTop: '24px' }}>
        {fields.map((field) => {
          const grade = feedback?.partGrades?.find((part) => part.id === field.id);
          const border = grade ? (grade.isCorrect ? '#188038' : '#d93025') : 'var(--mm-border)';
          return (
            <label key={field.id} style={{ padding: '16px', borderRadius: '10px', border: `2px solid ${border}`, background: grade && !grade.isCorrect ? 'var(--mm-error-subtle)' : 'var(--mm-surface)', fontWeight: 800 }}>
              {field.label || field.id}
              {field.type === 'choice' ? (
                <select value={responses[field.id] || ''} onChange={(event) => update(field.id, event.target.value)} style={{ display: 'block', width: '100%', marginTop: '8px', padding: '10px', borderRadius: '7px', border: '1px solid var(--mm-border)', fontSize: '16px' }}>
                  <option value="">Choose an answer</option>
                  {(field.options || []).map((option) => { const value = String(option?.value ?? option); const label = String(option?.label ?? graphLabelById[value] ?? option); return <option key={value} value={value}>{label}</option>; })}
                </select>
              ) : (
                <textarea value={responses[field.id] || ''} onChange={(event) => update(field.id, event.target.value)} placeholder={field.placeholder || 'Write a complete mathematical comparison.'} style={{ display: 'block', width: '100%', minHeight: '95px', marginTop: '8px', padding: '11px', boxSizing: 'border-box', borderRadius: '7px', border: '1px solid var(--mm-border)', font: 'inherit' }} />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
