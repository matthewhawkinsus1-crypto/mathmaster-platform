import { useEffect } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { gradeOrderedPairResponse } from '../functions/shared/ordinaryResponseGrading.mjs';

export default function OrderedPairGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, answer, solution, label = 'Ordered Pair' } = question;
  const expectedPair = answer || solution;
  const [studentAnswer, setStudentAnswer] = useLocalDraftState(draftKey ? `${draftKey}:ordered-pair` : null, '');
  // Correctness comes from the shared grading contract so every caller of it —
  // this screen, the deadline finalizer, the tests — marks alike.
  const graded = gradeOrderedPairResponse({ answer, solution }, studentAnswer);
  const { isComplete, isCorrect } = graded;

  useEffect(() => {
    const questionText = `${prompt || 'Enter the ordered pair.'} Plotted coordinate: (${expectedPair?.[0]}, ${expectedPair?.[1]}).`;
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: studentAnswer,
      questionDetails: `${questionText} Response: ${studentAnswer || 'blank'}.`,
      parts: graded.parts,
    });
  }, [studentAnswer, isComplete, isCorrect, expectedPair, prompt, onStateChange]);

  const incorrect = feedback?.partGrades?.some((part) => !part.isCorrect);
  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>{label}</h2>
      <QuestionPrompt>{prompt || 'Enter the coordinates as an ordered pair $(x, y)$.'}</QuestionPrompt>
      <QuestionVisual question={question} />
      <div style={{ marginTop: '24px' }}>
        <MathDisplay value="(x, y) =" format="ascii-math" inline style={{ display: 'block', marginBottom: '10px', fontSize: '21px', fontWeight: 'bold' }} />
        <MathInput value={studentAnswer} onChange={setStudentAnswer} placeholder="(x, y)" ariaLabel="Ordered pair answer" answerFormat="orderedPair" onUndoStateChange={onUndoStateChange} inputStatus={incorrect ? 'incorrect' : 'neutral'} />
      </div>
    </div>
  );
}
