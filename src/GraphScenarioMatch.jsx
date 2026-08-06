import { useEffect, useMemo, useState } from 'react';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import useUndoHistory from './useUndoHistory';
import { stableStringify } from './scenarioResponseUtils';

const getPartGrade = (feedback, id) => feedback?.partGrades?.find((part) => part.id === id);

export default function GraphScenarioMatch({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const scenarios = useMemo(() => (Array.isArray(question.scenarios) ? question.scenarios.filter((item) => item?.id) : []), [question.scenarios]);
  const graphs = useMemo(() => (Array.isArray(question.graphs) ? question.graphs.filter((item) => item?.id && item?.graph) : []), [question.graphs]);
  const correctMatches = question.correctMatches || Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.graphId]));
  const history = useUndoHistory({}, 80, draftKey ? `${draftKey}:graph-scenario-match` : null);
  const matches = history.value;
  const [draggedGraphId, setDraggedGraphId] = useState('');

  const assignGraph = (scenarioId, graphId) => {
    history.setValue((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (next[key] === graphId && key !== scenarioId) delete next[key];
      });
      if (graphId) next[scenarioId] = graphId;
      else delete next[scenarioId];
      return next;
    });
  };

  const parts = scenarios.map((scenario) => ({
    id: `match:${scenario.id}`,
    label: scenario.title || scenario.id,
    isComplete: Boolean(matches[scenario.id]),
    isCorrect: matches[scenario.id] === correctMatches[scenario.id],
    response: matches[scenario.id] || '',
  }));
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);

  useEffect(() => {
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: stableStringify(matches),
      questionDetails: `${question.prompt || 'Match each scenario to a graph.'} Matches: ${JSON.stringify(matches)}`,
      parts,
    });
  }, [isComplete, isCorrect, matches, onStateChange, question.prompt]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last graph match' });
    return () => onUndoStateChange?.(null);
  }, [history.canUndo, history.undo, onUndoStateChange]);

  return (
    <div style={{ maxWidth: '1060px', margin: '0 auto', textAlign: 'left' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0 }}>Match Scenarios and Graphs</h2>
      <QuestionPrompt>{question.prompt || 'Match each scenario to the graph that tells its story.'}</QuestionPrompt>

      <section aria-label="Graph choices" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {graphs.map((graphChoice) => {
          const usedBy = Object.entries(matches).find(([, graphId]) => graphId === graphChoice.id)?.[0];
          return (
            <article
              key={graphChoice.id}
              draggable
              onDragStart={() => setDraggedGraphId(graphChoice.id)}
              onDragEnd={() => setDraggedGraphId('')}
              style={{ padding: '10px', borderRadius: '12px', border: `2px solid ${usedBy ? '#188038' : draggedGraphId === graphChoice.id ? '#1a73e8' : '#d7dde7'}`, background: usedBy ? '#f2faf4' : '#fff', cursor: 'grab' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <strong>{graphChoice.label || graphChoice.id}</strong>
                <span style={{ fontSize: '11px', color: usedBy ? '#137333' : '#5f6368' }}>{usedBy ? 'Assigned' : 'Drag or select'}</span>
              </div>
              <div style={{ transform: 'scale(.78)', transformOrigin: 'top center', marginBottom: '-82px' }}><GraphDisplay graph={graphChoice.graph} title={graphChoice.label || 'Graph choice'} /></div>
            </article>
          );
        })}
      </section>

      <section style={{ display: 'grid', gap: '14px' }}>
        {scenarios.map((scenario, index) => {
          const partId = `match:${scenario.id}`;
          const grade = getPartGrade(feedback, partId);
          const selectedGraph = graphs.find((graph) => graph.id === matches[scenario.id]);
          return (
            <article
              key={scenario.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); if (draggedGraphId) assignGraph(scenario.id, draggedGraphId); setDraggedGraphId(''); }}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(210px, 310px)', gap: '16px', padding: '18px', borderRadius: '12px', border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : draggedGraphId ? '#1a73e8' : '#d7dde7'}`, background: grade && !grade.isCorrect ? '#fff8f7' : '#fbfcfe' }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 900, color: '#174ea6', textTransform: 'uppercase' }}>Scenario {index + 1}</div>
                <h3 style={{ margin: '5px 0 8px' }}>{scenario.title || `Scenario ${index + 1}`}</h3>
                <p style={{ margin: 0, lineHeight: 1.55, color: '#3c4043' }}>{scenario.description}</p>
                {scenario.quantities && <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: '13px' }}>{scenario.quantities}</p>}
              </div>
              <div style={{ alignSelf: 'center' }}>
                <label style={{ display: 'block', fontWeight: 800, marginBottom: '7px' }}>Matching graph</label>
                <select value={matches[scenario.id] || ''} onChange={(event) => assignGraph(scenario.id, event.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '2px solid #bdc7d6', fontSize: '15px' }}>
                  <option value="">Choose a graph</option>
                  {graphs.map((graph) => <option key={graph.id} value={graph.id}>{graph.label || graph.id}</option>)}
                </select>
                <div style={{ minHeight: '35px', marginTop: '8px', padding: '8px', borderRadius: '8px', background: selectedGraph ? '#e8f0fe' : '#f1f3f4', color: selectedGraph ? '#174ea6' : '#80868b', fontWeight: 800, textAlign: 'center' }}>
                  {selectedGraph ? selectedGraph.label || selectedGraph.id : 'Drop a graph here'}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
