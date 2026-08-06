import { useEffect } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { compareOrderedPair, parseOrderedPair } from './answerUtils';

export default function OrderedPairGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, answer, solution, label = 'Ordered Pair' } = question;
  const expectedPair = answer || solution;
  const [studentAnswer, setStudentAnswer] = useLocalDraftState(draftKey ? `${draftKey}:ordered-pair` : null, '');
  const parsed = parseOrderedPair(studentAnswer);
  const isComplete = Boolean(parsed);
  const xCorrect = Boolean(parsed) && Math.abs(parsed[0] - Number(expectedPair?.[0])) <= 1e-9;
  const yCorrect = Boolean(parsed) && Math.abs(parsed[1] - Number(expectedPair?.[1])) <= 1e-9;
  const isCorrect = compareOrderedPair(studentAnswer, expectedPair);

  useEffect(() => {
    const questionText = `${prompt || 'Enter the ordered pair.'} Plotted coordinate: (${expectedPair?.[0]}, ${expectedPair?.[1]}).`;
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: studentAnswer,
      questionDetails: `${questionText} Response: ${studentAnswer || 'blank'}.`,
      parts: [
        { id: 'ordered-x', label: 'x-coordinate', isComplete, isCorrect: xCorrect, response: parsed?.[0] ?? studentAnswer },
        { id: 'ordered-y', label: 'y-coordinate', isComplete, isCorrect: yCorrect, response: parsed?.[1] ?? studentAnswer },
      ],
    });
  }, [studentAnswer, isComplete, isCorrect, xCorrect, yCorrect, expectedPair, prompt, onStateChange]);

  const incorrect = feedback?.partGrades?.some((part) => !part.isCorrect);
  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>{label}</h2>
      <QuestionPrompt>{prompt || 'Enter the coordinates as an ordered pair $(x, y)$.'}</QuestionPrompt>
      <QuestionVisual question={question} />
      <div style={{ marginTop: '24px' }}>
        <MathDisplay value="(x, y) =" format="ascii-math" inline style={{ display: 'block', marginBottom: '10px', fontSize: '21px', fontWeight: 'bold' }} />
        <MathInput value={studentAnswer} onChange={setStudentAnswer} placeholder="(x, y)" ariaLabel="Ordered pair answer" onUndoStateChange={onUndoStateChange} inputStatus={incorrect ? 'incorrect' : 'neutral'} />
      </div>
    </div>
  );
}
