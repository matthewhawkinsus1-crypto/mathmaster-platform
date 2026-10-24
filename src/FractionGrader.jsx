import { useEffect } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { gradeFractionResponse } from '../functions/shared/ordinaryResponseGrading.mjs';
import { fractionQuestionDisplay } from './fractionQuestionDisplay.js';
import { fractionFormProblemForResponse } from './platform/interaction/answerShapeGuard.js';

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
  // A mixed number not in lowest terms where lowest terms are asked for is
  // not ready to submit: the student is told why instead of losing a try to
  // it (answerShapeGuard).
  const formProblem = fractionFormProblemForResponse(question, answer);
  const isComplete = graded.isComplete && !formProblem;
  const { isCorrect } = graded;

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
        <div style={{ margin: '34px auto', fontSize: 'calc(30 * var(--mm-px))', fontWeight: 'bold', color: 'var(--mm-primary)', width: 'fit-content', maxWidth: '100%' }}>
          <MathDisplay value={display.expressionLatex} format="latex" ariaLabel="Fraction expression" />
        </div>
      )}
      <QuestionVisual question={question} />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MathInput value={answer} onChange={setAnswer} ariaLabel="Fraction answer" onUndoStateChange={onUndoStateChange} inputStatus={lastPart ? (lastPart.isCorrect ? 'correct' : 'incorrect') : 'neutral'} />
      </div>
      {/* Under the box, where the floating Work View button never covers it. */}
      {formProblem ? (
        <p role="status" style={{ margin: '12px auto 0', width: 'fit-content', maxWidth: '100%', padding: '6px 9px', borderRadius: '8px', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.4, fontWeight: 700, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>
          {formProblem}
        </p>
      ) : null}
      <p style={{ fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-subtle)', marginTop: '15px' }}><em>Type / to create a stacked fraction, or open the focused math tools.</em></p>
    </div>
  );
}
