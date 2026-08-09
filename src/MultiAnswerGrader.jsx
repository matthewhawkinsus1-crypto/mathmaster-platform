import { useEffect, useMemo } from 'react';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { matchesAnyAnswer } from './answerUtils';
import { resolveLabelFormat } from './labelFormat';
import useUndoHistory from './useUndoHistory';

export default function MultiAnswerGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, answerFields = [] } = question;
  const safeFields = useMemo(() => (Array.isArray(answerFields) ? answerFields.filter((field) => field?.id) : []), [answerFields]);
  const history = useUndoHistory({}, 60, draftKey ? `${draftKey}:multi-answer` : null);
  const answers = history.value;
  const parts = safeFields.map((field) => {
    const response = String(answers[field.id] ?? '');
    return {
      id: field.id,
      label: field.label || field.id,
      isComplete: response.trim() !== '',
      isCorrect: response.trim() !== '' && matchesAnyAnswer(response, field.acceptedAnswers || [field.answer]),
      response,
    };
  });
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);

  useEffect(() => {
    const responseDetails = safeFields.map((field) => `${field.label || field.id}=${answers[field.id] ?? ''}`).join(', ');
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: JSON.stringify(answers),
      questionDetails: `${prompt || 'Complete all answer fields.'}${question.mathDisplay?.value ? ` Expression: ${question.mathDisplay.value}.` : ''} Responses: ${responseDetails}`,
      parts,
    });
  }, [answers, safeFields, prompt, question.mathDisplay, isComplete, isCorrect, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last field entry' });
    return () => onUndoStateChange?.(null);
  }, [answers, history.canUndo, history.undo, onUndoStateChange]);

  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Multiple-Part Question</h2>
      <QuestionPrompt>{prompt || 'Enter an answer for every part.'}</QuestionPrompt>
      <QuestionVisual question={question} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '24px' }}>
        {safeFields.map((field) => {
          const grade = feedback?.partGrades?.find((part) => part.id === field.id);
          return (
            <div key={field.id} style={{ padding: '16px', border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : '#dfe3e7'}`, borderRadius: '10px', background: grade && !grade.isCorrect ? '#fff8f7' : '#fbfcfe' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#3c4043' }}>
                {(() => {
                  const text = field.label || field.id;
                  const format = resolveLabelFormat(text, { latexFlag: field.labelLatex, explicitFormat: field.labelFormat });
                  // An English label goes through the math typesetter as
                  // juxtaposed variables — "Discrete or continuous?" comes out
                  // as "Discrete ∨ continuous?" — so it stays plain text.
                  return format ? <MathDisplay value={text} format={format} inline /> : text;
                })()}
              </label>
              <MathInput value={answers[field.id] || ''} onChange={(value) => history.setValue((current) => ({ ...current, [field.id]: value }))} placeholder={field.placeholder || 'answer'} ariaLabel={field.label || field.id} toolProfile={field.toolProfile || 'basic'} inputStatus={grade ? (grade.isCorrect ? 'correct' : 'incorrect') : 'neutral'} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
