import { useEffect, useId } from 'react';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import useUndoHistory from './useUndoHistory';
import { describePointChoiceLine } from './platform/language/numberLineDescription.js';
import { PublishFigureReading } from './platform/language/figureReadings.js';
import { gradeNumberLineResponse } from '../functions/shared/ordinaryResponseGrading.mjs';

export default function NumberLine({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { target, prompt } = question;
  const history = useUndoHistory(null, 60, draftKey ? `${draftKey}:number-line` : null);
  const selectedPoint = history.value;
  const choices = Array.isArray(question.choices) && question.choices.length > 0 ? question.choices : [-10, -5, 0, 5, 10];
  // Correctness comes from the shared grading contract so every caller of it —
  // this screen, the deadline finalizer, the tests — marks alike.
  const graded = gradeNumberLineResponse({ target }, selectedPoint);
  const { isComplete, isCorrect } = graded;

  useEffect(() => {
    onStateChange({ isComplete, isCorrect, responseKey: selectedPoint === null ? '' : String(selectedPoint), questionDetails: `${prompt || `Plot ${target} on the number line.`} Selected: ${selectedPoint ?? 'none'}.`, parts: graded.parts });
  }, [selectedPoint, target, prompt, isComplete, isCorrect, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last number-line selection' });
    return () => onUndoStateChange?.(null);
  }, [selectedPoint, history.canUndo, history.undo, onUndoStateChange]);

  const wrong = feedback?.partGrades?.some((part) => !part.isCorrect);
  // The line in words (student pass 3, Q-8): the marks and the student's own
  // choice, which was shown by colour alone. Each mark says whether it is the
  // chosen one (aria-pressed).
  const descriptionId = useId();
  const description = describePointChoiceLine({ choices, selected: selectedPoint });
  return (
    <div>
      <h2 style={{ color: 'var(--mm-text-strong)', marginTop: 0 }}>Number Line</h2>
      <QuestionPrompt>{prompt || 'Select the correct point on the number line.'}</QuestionPrompt>
      <div style={{ fontSize: 'calc(24 * var(--mm-px))', fontWeight: 'bold', margin: '20px 0', color: 'var(--mm-primary)' }}>Target: <MathDisplay value={String(target)} inline /></div>
      <QuestionVisual question={question} />
      <div role="group" aria-label="Number line" aria-describedby={descriptionId} data-number-line-choices="" style={{ display: 'flex', justifyContent: 'center', margin: '50px 0', position: 'relative', overflowX: 'auto', padding: '0 20px 12px', borderRadius: '10px', background: wrong ? 'var(--mm-error-subtle)' : 'transparent' }}>
        <div style={{ position: 'absolute', top: '10px', left: '10%', right: '10%', height: '4px', background: '#dadce0', zIndex: 0 }} />
        {choices.map((number) => <button type="button" key={number} onClick={() => history.setValue(Number(number))} aria-label={`Select ${number}`} aria-pressed={selectedPoint === Number(number)} style={{ margin: '0 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, border: 'none', background: 'transparent', padding: 0 }}><span style={{ width: '24px', height: '24px', borderRadius: '50%', background: selectedPoint === Number(number) ? '#1a73e8' : 'var(--mm-surface)', marginBottom: '8px', border: selectedPoint === Number(number) ? '3px solid #0b5394' : '3px solid var(--mm-border)', boxSizing: 'border-box' }} /><span style={{ fontWeight: 'bold', color: 'var(--mm-text-muted)' }}><MathDisplay value={String(number)} inline /></span></button>)}
        <PublishFigureReading entry={{ kind: 'figure', label: 'Number line', text: description }} />
        <span id={descriptionId} aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{description}</span>
      </div>
    </div>
  );
}
