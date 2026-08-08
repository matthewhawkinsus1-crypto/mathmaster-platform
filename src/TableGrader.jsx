import { useEffect, useMemo } from 'react';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { compareMathAnswer } from './answerUtils';
import useUndoHistory from './useUndoHistory';

export default function TableGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, ruleLatex, showRule = false } = question;
  // A `= {}` default only fires for undefined, so an explicit `"table": null`
  // in a blueprint slipped straight through and threw on `.columns`.
  const table = question.table && typeof question.table === 'object' && !Array.isArray(question.table)
    ? question.table
    : {};
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const answers = table.answers || {};
  const answerKeys = useMemo(() => Object.keys(answers), [answers]);
  const history = useUndoHistory({}, 60, draftKey ? `${draftKey}:table` : null);
  const studentAnswers = history.value;

  const parts = answerKeys.map((key) => {
    const response = String(studentAnswers[key] ?? '');
    return {
      id: key,
      label: `Table blank ${key}`,
      isComplete: response.trim() !== '',
      isCorrect: response.trim() !== '' && compareMathAnswer(response, answers[key]),
      response,
    };
  });
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);

  useEffect(() => {
    const responseDetails = answerKeys.map((key) => `${key}=${studentAnswers[key] ?? ''}`).join(', ');
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: JSON.stringify(studentAnswers),
      questionDetails: `${prompt || 'Complete the table.'}${ruleLatex ? ` Rule: ${ruleLatex}.` : ''} Responses: ${responseDetails}`,
      parts,
    });
  }, [studentAnswers, answerKeys, prompt, ruleLatex, isComplete, isCorrect, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last table entry' });
    return () => onUndoStateChange?.(null);
  }, [studentAnswers, history.canUndo, history.undo, onUndoStateChange]);

  const updateAnswer = (key, value) => history.setValue((current) => ({ ...current, [key]: value }));
  const gradeFor = (key) => feedback?.partGrades?.find((part) => part.id === key);

  return (
    <div>
      <h2 style={{ color: '#202124', marginTop: 0 }}>Function Table</h2>
      <QuestionPrompt>{prompt || 'Complete all missing values in the table.'}</QuestionPrompt>
      {showRule && ruleLatex && (
        <div style={{ margin: '22px auto', padding: '14px 20px', width: 'fit-content', background: '#f8f9fa', borderRadius: '10px', color: '#1a73e8', fontSize: '25px', fontWeight: 'bold' }}>
          <MathDisplay value={ruleLatex} format="ascii-math" />
        </div>
      )}
      <QuestionVisual question={question} />
      <div style={{ overflowX: 'auto', marginTop: '22px' }}>
        <table style={{ margin: '0 auto', borderCollapse: 'collapse', minWidth: '320px', background: '#fff' }}>
          <thead><tr>{columns.map((column) => <th key={column.key} style={{ padding: '12px 24px', border: '1px solid #cfd4da', background: '#e8f0fe', fontSize: '20px' }}><MathDisplay value={column.label || column.key} inline /></th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columns.map((column) => {
                  const answerKey = `${rowIndex}:${column.key}`;
                  const isBlank = Object.prototype.hasOwnProperty.call(answers, answerKey);
                  const grade = gradeFor(answerKey);
                  return (
                    <td key={answerKey} style={{ padding: '12px 20px', border: '1px solid #cfd4da', textAlign: 'center', fontSize: '19px' }}>
                      {isBlank ? (
                        <input type="text" inputMode="decimal" value={studentAnswers[answerKey] || ''} onChange={(event) => updateAnswer(answerKey, event.target.value)} aria-label={`Row ${rowIndex + 1}, ${column.label || column.key}`} style={{ width: '82px', padding: '8px', textAlign: 'center', fontSize: '18px', border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : '#1a73e8'}`, borderRadius: '6px', background: grade && !grade.isCorrect ? '#fff8f7' : '#fff' }} />
                      ) : <MathDisplay value={String(row[column.key])} inline />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '13px', color: '#80868b', marginTop: '14px' }}>Incorrect blanks are outlined after submission so you can focus only on those entries.</p>
    </div>
  );
}
