import { useEffect } from 'react';
import useLocalDraftState from './useLocalDraftState';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import QuestionVisual from './QuestionVisual';
import { compareOrderedPair, parseOrderedPair } from './answerUtils';

export default function SystemGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, equationsLatex = [], solution, showEquations = true, showGraph = true, graph } = question;
  const [answer, setAnswer] = useLocalDraftState(draftKey ? `${draftKey}:system` : null, '');
  const parsed = parseOrderedPair(answer);
  const isComplete = Boolean(parsed);
  const xCorrect = Boolean(parsed) && Math.abs(parsed[0] - Number(solution?.[0])) <= 1e-9;
  const yCorrect = Boolean(parsed) && Math.abs(parsed[1] - Number(solution?.[1])) <= 1e-9;
  const isCorrect = compareOrderedPair(answer, solution);

  useEffect(() => {
    const equationDetails = equationsLatex.length ? ` Equations: ${equationsLatex.join(' and ')}.` : '';
    const questionText = `${prompt || 'Solve the system.'}${equationDetails}`;
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: answer,
      questionDetails: `${questionText} Response: ${answer || 'blank'}.`,
      parts: [
        { id: 'system-x', label: 'x-coordinate', isComplete, isCorrect: xCorrect, response: parsed?.[0] ?? answer },
        { id: 'system-y', label: 'y-coordinate', isComplete, isCorrect: yCorrect, response: parsed?.[1] ?? answer },
      ],
    });
  }, [answer, isComplete, isCorrect, xCorrect, yCorrect, prompt, equationsLatex, onStateChange]);

  const incorrect = feedback?.partGrades?.some((part) => !part.isCorrect);

  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Systems of Equations</h2>
      <QuestionPrompt>{prompt || 'Solve the system and enter the solution as an ordered pair $(x, y)$.'}</QuestionPrompt>
      {showEquations && equationsLatex.length > 0 && (
        <div style={{ display: 'grid', gap: '10px', margin: '24px auto', padding: '18px 24px', width: 'fit-content', maxWidth: '100%', background: '#f8f9fa', borderRadius: '10px', color: '#1a73e8', fontSize: '26px', fontWeight: 'bold' }}>
          {equationsLatex.map((equation, index) => (
            <div key={`${equation}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span aria-hidden="true" style={{ width: '28px', height: '4px', borderRadius: '999px', background: index === 0 ? '#1a73e8' : '#9334e6', flex: '0 0 auto' }} />
              <MathDisplay value={equation} format="ascii-math" style={{ color: index === 0 ? '#1a73e8' : '#9334e6' }} />
            </div>
          ))}
        </div>
      )}
      <QuestionVisual question={question} includeGraph={false} />
      {showGraph && graph && <GraphDisplay graph={graph} title="System of equations graph" />}
      <div style={{ marginTop: '24px' }}>
        <MathDisplay value="(x, y) =" format="ascii-math" inline style={{ display: 'block', marginBottom: '10px', fontSize: '21px', fontWeight: 'bold' }} />
        <MathInput value={answer} onChange={setAnswer} placeholder="(x, y)" ariaLabel="Solution to the system as an ordered pair" onUndoStateChange={onUndoStateChange} inputStatus={incorrect ? 'incorrect' : 'neutral'} />
      </div>
    </div>
  );
}
