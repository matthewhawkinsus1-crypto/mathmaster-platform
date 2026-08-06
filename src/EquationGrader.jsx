import { useEffect } from 'react';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import useUndoHistory from './useUndoHistory';

export default function EquationGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { a, b, c, prompt, equationLatex } = question;
  const answerHistory = useUndoHistory('', 60, draftKey ? `${draftKey}:answer` : null);
  const answer = answerHistory.value;

  const generatedEquation = `${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} = ${c}`;
  const displayedEquation = equationLatex || generatedEquation;
  const correctAns = (c - b) / a;
  const isComplete = answer !== '';
  const isCorrect = isComplete && Number(answer) === correctAns;

  useEffect(() => {
    const questionText = prompt || `Solve for x: ${generatedEquation}`;
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: answer,
      questionDetails: `${questionText} Response: x=${answer || 'blank'}.`,
      parts: [{ id: 'x', label: 'Value of x', isComplete, isCorrect, response: answer }],
    });
  }, [answer, isComplete, isCorrect, prompt, generatedEquation, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: answerHistory.canUndo, onUndo: answerHistory.undo, label: 'Undo the last value entered for x' });
    return () => onUndoStateChange?.(null);
  }, [answer, answerHistory.canUndo, answerHistory.undo, onUndoStateChange]);

  const lastPart = feedback?.partGrades?.find((part) => part.id === 'x');

  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Algebra</h2>
      <QuestionPrompt>{prompt || 'Solve for $x$.'}</QuestionPrompt>
      <div style={{ fontSize: '27px', fontWeight: 'bold', margin: '28px auto', color: '#1a73e8', background: '#f8f9fa', padding: '18px 24px', borderRadius: '10px', width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box' }}>
        <MathDisplay value={displayedEquation} format={equationLatex ? 'latex' : 'ascii-math'} ariaLabel={`Equation ${generatedEquation}`} />
      </div>
      <QuestionVisual question={question} />
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
        <MathDisplay value="x =" format="ascii-math" inline style={{ fontSize: '20px', fontWeight: 'bold', color: '#5f6368' }} />
        <input
          type="number"
          value={answer}
          onChange={(event) => answerHistory.setValue(event.target.value)}
          aria-label="Value of x"
          style={{ textAlign: 'center', fontSize: '18px', padding: '10px', border: `2px solid ${lastPart && !lastPart.isCorrect ? '#d93025' : '#dadce0'}`, borderRadius: '6px', outline: 'none', width: '90px', background: lastPart && !lastPart.isCorrect ? '#fff8f7' : '#fff' }}
        />
      </div>
    </div>
  );
}
