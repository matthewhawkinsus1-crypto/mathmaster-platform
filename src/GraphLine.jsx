import { useEffect, useMemo } from 'react';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import QuestionVisual from './QuestionVisual';
import useUndoHistory from './useUndoHistory';

export default function GraphLine({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { m, b, prompt, equationLatex, showEquation = true, showGraph = false } = question;
  const history = useUndoHistory({ slope: '', intercept: '' }, 60, draftKey ? `${draftKey}:line` : null);
  const { slope, intercept } = history.value;
  const generatedEquation = `y = ${m}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}`;
  const displayedEquation = equationLatex || generatedEquation;
  const graph = useMemo(() => {
    if (question.graph) return question.graph;
    if (question.visual?.type === 'graph') return question.visual;
    if (showGraph) return { xMin: -10, xMax: 10, yMin: -10, yMax: 10, functions: [{ type: 'line', m, b }], ariaLabel: `Graph of ${generatedEquation}` };
    return null;
  }, [question.graph, question.visual, showGraph, m, b, generatedEquation]);
  const parts = [
    { id: 'slope', label: 'Slope', isComplete: slope !== '', isCorrect: slope !== '' && Number(slope) === m, response: slope },
    { id: 'intercept', label: 'Y-intercept', isComplete: intercept !== '', isCorrect: intercept !== '' && Number(intercept) === b, response: intercept },
  ];
  const isComplete = parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);

  useEffect(() => {
    onStateChange({ isComplete, isCorrect, responseKey: `${slope}|${intercept}`, questionDetails: `${prompt || `Identify the slope and y-intercept for ${generatedEquation}`} Responses: m=${slope}, b=${intercept}.`, parts });
  }, [slope, intercept, isComplete, isCorrect, prompt, generatedEquation, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last line-feature entry' });
    return () => onUndoStateChange?.(null);
  }, [slope, intercept, history.canUndo, history.undo, onUndoStateChange]);

  const grade = (id) => feedback?.partGrades?.find((part) => part.id === id);
  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Graphing Lines</h2>
      <QuestionPrompt>{prompt || 'Identify the slope $m$ and the y-intercept $b$.'}</QuestionPrompt>
      {showEquation && <div style={{ fontSize: '27px', fontWeight: 'bold', margin: '26px auto', color: '#1a73e8', background: '#f8f9fa', padding: '18px 24px', borderRadius: '10px', width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box' }}><MathDisplay value={displayedEquation} format={equationLatex ? 'latex' : 'ascii-math'} ariaLabel={`Equation ${generatedEquation}`} /></div>}
      <QuestionVisual question={question} includeGraph={false} />
      {graph && <GraphDisplay graph={graph} title="Graphing question" />}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '30px' }}>
        {[['slope', 'Slope', 'm', slope], ['intercept', 'Y-Intercept', 'b', intercept]].map(([id, label, symbol, value]) => {
          const partGrade = grade(id);
          return <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><label style={{ fontWeight: 'bold', marginBottom: '8px', color: '#5f6368' }}>{label} (<MathDisplay value={symbol} inline />)</label><input type="number" value={value} onChange={(event) => history.setValue((current) => ({ ...current, [id]: event.target.value }))} style={{ textAlign: 'center', fontSize: '18px', padding: '10px', border: `2px solid ${partGrade ? (partGrade.isCorrect ? '#188038' : '#d93025') : '#dadce0'}`, borderRadius: '6px', width: '80px', outline: 'none', background: partGrade && !partGrade.isCorrect ? '#fff8f7' : '#fff' }} /></div>;
        })}
      </div>
    </div>
  );
}
