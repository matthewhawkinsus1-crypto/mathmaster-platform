import { useEffect } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { gradeFractionResponse } from '../functions/shared/ordinaryResponseGrading.mjs';
import { fractionQuestionDisplay } from './fractionQuestionDisplay.js';

export default function FractionGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const [answer, setAnswer] = useLocalDraftState(draftKey ? `${draftKey}:fraction` : null, '');
  // What is on screen: a sum to add (a drill, or operands the author wrote),
  // or the author's prompt alone — never a generated sum beside an authored
  // question (src/fractionQuestionDisplay.js).
  const display = fractionQuestionDisplay(question);
  const { questionText } = display;
  // Correctness comes from the shared grading contract so every caller of it —
  // this screen, the deadline finalizer, the tests — marks alike. It needs the
  // whole question: an authored answer is graded against the author's key,
  // a sum against the sum.
  const graded = gradeFractionResponse(question, answer);
  const { isComplete, isCorrect } = graded;

  useEffect(() => {
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: answer,
      questionDetails: `${questionText} Response: ${answer || 'blank'}.`,
      parts: graded.parts,
    });
  }, [answer, isComplete, isCorrect, questionText, onStateChange]);

  const lastPart = feedback?.partGrades?.find((part) => part.id === 'fraction');

  return (
    <div>
      <h2 style={{ color: 'var(--mm-text-strong)', marginTop: 0 }}>Fractions</h2>
      {display.prompt && <QuestionPrompt>{display.prompt}</QuestionPrompt>}
      {display.expressionLatex && (
        <div style={{ margin: '34px auto', fontSize: '30px', fontWeight: 'bold', color: '#1a73e8', width: 'fit-content', maxWidth: '100%' }}>
          <MathDisplay value={display.expressionLatex} format="latex" ariaLabel="Fraction expression" />
        </div>
      )}
      <QuestionVisual question={question} />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MathInput value={answer} onChange={setAnswer} onUndoStateChange={onUndoStateChange} inputStatus={lastPart ? (lastPart.isCorrect ? 'correct' : 'incorrect') : 'neutral'} />
      </div>
      <p style={{ fontSize: '13px', color: '#80868b', marginTop: '15px' }}><em>Type / to create a stacked fraction, or open the focused math tools.</em></p>
    </div>
  );
}
