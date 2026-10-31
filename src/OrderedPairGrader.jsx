import { useEffect } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { gradeOrderedPairResponse } from '../functions/shared/ordinaryResponseGrading.mjs';

export default function OrderedPairGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, answer, solution, label = 'Ordered Pair' } = question;
  const [studentAnswer, setStudentAnswer] = useLocalDraftState(draftKey ? `${draftKey}:ordered-pair` : null, '');
  // Correctness comes from the shared grading contract so every caller of it —
  // this screen, the deadline finalizer, the tests — marks alike. Its
  // expectedPair is the key as [x, y], also when it was stored as '(2,3)'.
  const graded = gradeOrderedPairResponse({ answer, solution }, studentAnswer);
  const { isComplete, isCorrect } = graded;

  useEffect(() => {
    // The task and the student's answer only, never the key: these details
    // are what the student's Work View shows as "Current question", before
    // they answer (student pass 3 wave 7 review, B1). They used to end with
    // "Plotted coordinate: (x, y)", the answer.
    const questionText = prompt || 'Enter the ordered pair.';
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: studentAnswer,
      questionDetails: `${questionText} Response: ${studentAnswer || 'blank'}.`,
      parts: graded.parts,
    });
  }, [studentAnswer, isComplete, isCorrect, prompt, onStateChange]);

  const incorrect = feedback?.partGrades?.some((part) => !part.isCorrect);
  return (
    <div>
      <h2 className="mathmaster-grader-heading" style={{ color: 'var(--mm-text-strong)', marginTop: 0 }}>{label}</h2>
      <QuestionPrompt>{prompt || 'Enter the coordinates as an ordered pair $(x, y)$.'}</QuestionPrompt>
      <QuestionVisual question={question} />
      <div style={{ marginTop: '24px' }}>
        <MathDisplay value="(x, y) =" format="ascii-math" inline style={{ display: 'block', marginBottom: '10px', fontSize: 'calc(21 * var(--mm-px))', fontWeight: 'bold' }} />
        <MathInput value={studentAnswer} onChange={setStudentAnswer} placeholder="(x, y)" ariaLabel="Ordered pair answer" answerFormat="orderedPair" onUndoStateChange={onUndoStateChange} inputStatus={incorrect ? 'incorrect' : 'neutral'} />
      </div>
    </div>
  );
}
