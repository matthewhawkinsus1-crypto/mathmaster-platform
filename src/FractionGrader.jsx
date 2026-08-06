import { useEffect } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { compareMathAnswer } from './answerUtils';

export default function FractionGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { n1, d1, n2, d2, ansNum, ansDen, prompt, expressionLatex } = question;
  const [answer, setAnswer] = useLocalDraftState(draftKey ? `${draftKey}:fraction` : null, '');
  const expectedLatex = `\\frac{${ansNum}}{${ansDen}}`;
  const isComplete = answer !== '';
  const isCorrect = isComplete && compareMathAnswer(answer, expectedLatex);

  useEffect(() => {
    const questionText = prompt || `Solve: ${n1}/${d1} + ${n2}/${d2}`;
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: answer,
      questionDetails: `${questionText} Response: ${answer || 'blank'}.`,
      parts: [{ id: 'fraction', label: 'Fraction answer', isComplete, isCorrect, response: answer }],
    });
  }, [answer, isComplete, isCorrect, n1, d1, n2, d2, prompt, onStateChange]);

  const lastPart = feedback?.partGrades?.find((part) => part.id === 'fraction');
  const displayedExpression = expressionLatex || `\\frac{${n1}}{${d1}} + \\frac{${n2}}{${d2}} =`;

  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Fractions</h2>
      <QuestionPrompt>{prompt || 'Add the fractions.'}</QuestionPrompt>
      <div style={{ margin: '34px auto', fontSize: '30px', fontWeight: 'bold', color: '#1a73e8', width: 'fit-content', maxWidth: '100%' }}>
        <MathDisplay value={displayedExpression} format="latex" ariaLabel="Fraction expression" />
      </div>
      <QuestionVisual question={question} />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MathInput value={answer} onChange={setAnswer} onUndoStateChange={onUndoStateChange} inputStatus={lastPart ? (lastPart.isCorrect ? 'correct' : 'incorrect') : 'neutral'} />
      </div>
      <p style={{ fontSize: '13px', color: '#80868b', marginTop: '15px' }}><em>Type / to create a stacked fraction, or open the focused math tools.</em></p>
    </div>
  );
}
