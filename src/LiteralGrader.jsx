import { useEffect, useMemo } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { gradeLiteralResponse } from '../functions/shared/ordinaryResponseGrading.mjs';

export default function LiteralGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { formula, formulaLatex, solveFor, solveForLatex, prompt, acceptedAnswers = [] } = question;
  // The variable solved for, when the question names one. A question compiled
  // from a solveLiteral action without solveFor names none, and nothing the
  // student reads or hears may then say "undefined".
  const variable = solveFor == null ? '' : String(solveFor).trim();
  const [answer, setAnswer] = useLocalDraftState(draftKey ? `${draftKey}:literal` : null, '');
  const safeAcceptedAnswers = useMemo(() => (Array.isArray(acceptedAnswers) ? acceptedAnswers : []), [acceptedAnswers]);
  // Correctness comes from the shared grading contract, never from logic local
  // to this screen: the deadline finalizer marks the same response with the
  // same call, so a manual Submit and an auto-submit cannot disagree.
  const graded = gradeLiteralResponse({ acceptedAnswers: safeAcceptedAnswers, solveFor }, answer);
  const { isComplete, isCorrect } = graded;

  useEffect(() => {
    const questionText = `${prompt || (variable ? `Solve the literal equation for ${variable}.` : 'Solve the literal equation.')} Formula: ${formula || formulaLatex || ''}.`;
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: answer,
      questionDetails: `${questionText} Response: ${variable ? `${variable}=` : ''}${answer || 'blank'}.`,
      parts: graded.parts,
    });
  }, [answer, isComplete, isCorrect, formula, formulaLatex, variable, prompt, onStateChange]);

  const displayedFormula = formulaLatex || formula;
  const displayedSolveFor = solveForLatex || variable;
  const lastPart = feedback?.partGrades?.find((part) => part.id === 'literal');

  return (
    <div>
      <h2 className="mathmaster-grader-heading" style={{ color: 'var(--mm-text-strong)', marginTop: 0 }}>Literal Equations</h2>
      <QuestionPrompt>{prompt || (displayedSolveFor ? `Given the formula below, solve for $${displayedSolveFor}$.` : 'Given the formula below, rearrange it as the question asks.')}</QuestionPrompt>
      <div style={{ fontSize: 'calc(28 * var(--mm-px))', fontWeight: 'bold', margin: '28px auto', color: 'var(--mm-primary)', background: 'var(--mm-surface-sunken)', padding: '18px 24px', borderRadius: '10px', width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box' }}>
        <MathDisplay value={displayedFormula} format={formulaLatex ? 'latex' : 'ascii-math'} ariaLabel={`Formula ${formula || formulaLatex || ''}`} />
      </div>
      <QuestionVisual question={question} />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' }}>
        {displayedSolveFor ? (
          <div style={{ fontSize: 'calc(24 * var(--mm-px))', fontWeight: 'bold', color: 'var(--mm-text-muted)' }}>
            <MathDisplay value={`${displayedSolveFor} =`} format={solveForLatex ? 'latex' : 'ascii-math'} inline ariaLabel={`${variable || displayedSolveFor} equals`} />
          </div>
        ) : null}
        <MathInput value={answer} onChange={setAnswer} placeholder={variable ? `type expression for ${variable}` : 'type your answer'} ariaLabel={variable ? `${variable} =` : 'Your answer'} onUndoStateChange={onUndoStateChange} inputStatus={lastPart ? (lastPart.isCorrect ? 'correct' : 'incorrect') : 'neutral'} />
      </div>
    </div>
  );
}
