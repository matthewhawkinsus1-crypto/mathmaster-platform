import { useEffect, useMemo } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { gradeLiteralResponse } from '../functions/shared/ordinaryResponseGrading.mjs';

export default function LiteralGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { formula, formulaLatex, solveFor, solveForLatex, prompt, acceptedAnswers = [] } = question;
  const [answer, setAnswer] = useLocalDraftState(draftKey ? `${draftKey}:literal` : null, '');
  const safeAcceptedAnswers = useMemo(() => (Array.isArray(acceptedAnswers) ? acceptedAnswers : []), [acceptedAnswers]);
  // Correctness comes from the shared grading contract, never from logic local
  // to this screen: the deadline finalizer marks the same response with the
  // same call, so a manual Submit and an auto-submit cannot disagree.
  const graded = gradeLiteralResponse({ acceptedAnswers: safeAcceptedAnswers, solveFor }, answer);
  const { isComplete, isCorrect } = graded;

  useEffect(() => {
    const questionText = `${prompt || `Solve the literal equation for ${solveFor}.`} Formula: ${formula || formulaLatex || ''}.`;
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: answer,
      questionDetails: `${questionText} Response: ${solveFor}=${answer || 'blank'}.`,
      parts: graded.parts,
    });
  }, [answer, isComplete, isCorrect, formula, formulaLatex, solveFor, prompt, onStateChange]);

  const displayedFormula = formulaLatex || formula;
  const displayedSolveFor = solveForLatex || solveFor;
  const lastPart = feedback?.partGrades?.find((part) => part.id === 'literal');

  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Literal Equations</h2>
      <QuestionPrompt>{prompt || `Given the formula below, solve for $${displayedSolveFor}$.`}</QuestionPrompt>
      <div style={{ fontSize: '28px', fontWeight: 'bold', margin: '28px auto', color: '#1a73e8', background: '#f8f9fa', padding: '18px 24px', borderRadius: '10px', width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box' }}>
        <MathDisplay value={displayedFormula} format={formulaLatex ? 'latex' : 'ascii-math'} ariaLabel={`Formula ${formula || formulaLatex || ''}`} />
      </div>
      <QuestionVisual question={question} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#5f6368' }}>
          <MathDisplay value={`${displayedSolveFor} =`} format={solveForLatex ? 'latex' : 'ascii-math'} inline ariaLabel={`${solveFor} equals`} />
        </div>
        <MathInput value={answer} onChange={setAnswer} placeholder={`type expression for ${solveFor}`} onUndoStateChange={onUndoStateChange} inputStatus={lastPart ? (lastPart.isCorrect ? 'correct' : 'incorrect') : 'neutral'} />
      </div>
    </div>
  );
}
