import { useEffect } from 'react';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import useUndoHistory from './useUndoHistory';

export default function NumberLine({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { target, prompt } = question;
  const history = useUndoHistory(null, 60, draftKey ? `${draftKey}:number-line` : null);
  const selectedPoint = history.value;
  const choices = Array.isArray(question.choices) && question.choices.length > 0 ? question.choices : [-10, -5, 0, 5, 10];
  const isComplete = selectedPoint !== null;
  const isCorrect = selectedPoint === target;

  useEffect(() => {
    onStateChange({ isComplete, isCorrect, responseKey: selectedPoint === null ? '' : String(selectedPoint), questionDetails: `${prompt || `Plot ${target} on the number line.`} Selected: ${selectedPoint ?? 'none'}.`, parts: [{ id: 'number-line', label: 'Selected point', isComplete, isCorrect, response: selectedPoint ?? '' }] });
  }, [selectedPoint, target, prompt, isComplete, isCorrect, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last number-line selection' });
    return () => onUndoStateChange?.(null);
  }, [selectedPoint, history.canUndo, history.undo, onUndoStateChange]);

  const wrong = feedback?.partGrades?.some((part) => !part.isCorrect);
  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Number Line</h2>
      <QuestionPrompt>{prompt || 'Select the correct point on the number line.'}</QuestionPrompt>
      <div style={{ fontSize: '24px', fontWeight: 'bold', margin: '20px 0', color: '#1a73e8' }}>Target: <MathDisplay value={String(target)} inline /></div>
      <QuestionVisual question={question} />
      <div style={{ display: 'flex', justifyContent: 'center', margin: '50px 0', position: 'relative', overflowX: 'auto', padding: '0 20px 12px', borderRadius: '10px', background: wrong ? '#fff8f7' : 'transparent' }}>
        <div style={{ position: 'absolute', top: '10px', left: '10%', right: '10%', height: '4px', background: '#dadce0', zIndex: 0 }} />
        {choices.map((number) => <button type="button" key={number} onClick={() => history.setValue(Number(number))} aria-label={`Select ${number}`} style={{ margin: '0 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, border: 'none', background: 'transparent', padding: 0 }}><span style={{ width: '24px', height: '24px', borderRadius: '50%', background: selectedPoint === Number(number) ? '#1a73e8' : '#fff', marginBottom: '8px', border: selectedPoint === Number(number) ? '3px solid #0b5394' : '3px solid #dadce0', boxSizing: 'border-box' }} /><span style={{ fontWeight: 'bold', color: '#5f6368' }}><MathDisplay value={String(number)} inline /></span></button>)}
      </div>
    </div>
  );
}
