import { useEffect, useMemo } from 'react';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import { resolveLabelFormat } from './labelFormat';
import { compareMathAnswer } from './answerUtils';
import useUndoHistory from './useUndoHistory';

// `compact` is for a table embedded in a larger question, where the step
// already carries its own heading and directions. Repeating "Function Table"
// and "Complete all missing values" inside one step of a workflow reads as a
// second question rather than a part of this one.
export default function TableGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey, compact = false }) {
  const { prompt, ruleLatex, showRule = false } = question;
  // A `= {}` default only fires for undefined, so an explicit `"table": null`
  // in a blueprint slipped straight through and threw on `.columns`.
  const table = question.table && typeof question.table === 'object' && !Array.isArray(question.table)
    ? question.table
    : {};
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const answers = useMemo(() => table.answers || {}, [table.answers]);
  // A cell can be editable without being graded here. When a student fills a
  // table from the function THEY wrote, there is no key at this level: whether
  // 5 belongs in that row depends on their function, which this component never
  // sees. So `answers` means "editable and graded here" and `blanks` means
  // "editable, graded elsewhere". Without the second, a keyless table renders no
  // input cells at all and the student has nothing to fill in.
  const blanks = useMemo(
    () => (Array.isArray(table.blanks) ? table.blanks.map((key) => String(key)) : []),
    [table.blanks],
  );
  const editableKeys = useMemo(() => {
    const seen = new Set();
    return [...Object.keys(answers), ...blanks].filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [answers, blanks]);
  const history = useUndoHistory({}, 60, draftKey ? `${draftKey}:table` : null);
  const studentAnswers = history.value;

  const parts = editableKeys.map((key) => {
    const response = String(studentAnswers[key] ?? '');
    const graded = Object.prototype.hasOwnProperty.call(answers, key);
    return {
      id: key,
      label: `Table blank ${key}`,
      graded,
      isComplete: response.trim() !== '',
      isCorrect: graded && response.trim() !== '' && compareMathAnswer(response, answers[key]),
      response,
    };
  });
  const gradedParts = parts.filter((part) => part.graded);
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  // Correctness is claimed only for the cells this component holds a key for.
  // A table with no keys reports itself complete and stays silent about correct,
  // rather than reporting a filled-in table as wrong.
  const isCorrect = isComplete && gradedParts.length > 0 && gradedParts.every((part) => part.isCorrect);

  useEffect(() => {
    const responseDetails = editableKeys.map((key) => `${key}=${studentAnswers[key] ?? ''}`).join(', ');
    onStateChange({
      isComplete,
      isCorrect,
      gradedHere: gradedParts.length > 0,
      responseKey: JSON.stringify(studentAnswers),
      questionDetails: `${prompt || 'Complete the table.'}${ruleLatex ? ` Rule: ${ruleLatex}.` : ''} Responses: ${responseDetails}`,
      parts,
    });
  }, [studentAnswers, editableKeys, prompt, ruleLatex, isComplete, isCorrect, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last table entry' });
    return () => onUndoStateChange?.(null);
  }, [studentAnswers, history.canUndo, history.undo, onUndoStateChange]);

  const updateAnswer = (key, value) => history.setValue((current) => ({ ...current, [key]: value }));
  const gradeFor = (key) => feedback?.partGrades?.find((part) => part.id === key);

  return (
    <div>
      {!compact && <h2 style={{ color: '#202124', marginTop: 0 }}>Function Table</h2>}
      {(prompt || !compact) && (
        <QuestionPrompt>{prompt || 'Complete all missing values in the table.'}</QuestionPrompt>
      )}
      {showRule && ruleLatex && (
        <div style={{ margin: '22px auto', padding: '14px 20px', width: 'fit-content', background: '#f8f9fa', borderRadius: '10px', color: '#1a73e8', fontSize: '25px', fontWeight: 'bold' }}>
          <MathDisplay value={ruleLatex} format="ascii-math" />
        </div>
      )}
      {/* The fillable table below is built from question.table, so the shared
          read-only rendering of the same field would duplicate it. */}
      <QuestionVisual question={question} includeTable={false} />
      <div style={{ overflowX: 'auto', marginTop: '22px' }}>
        <table style={{ margin: '0 auto', borderCollapse: 'collapse', minWidth: '320px', background: '#fff' }}>
          <thead><tr>{columns.map((column) => <th key={column.key} style={{ padding: '12px 24px', border: '1px solid #cfd4da', background: '#e8f0fe', fontSize: '20px' }}>{(() => { const text = column.label || column.key; const format = resolveLabelFormat(text); return format ? <MathDisplay value={text} format={format} inline /> : text; })()}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columns.map((column) => {
                  const answerKey = `${rowIndex}:${column.key}`;
                  const isBlank = Object.prototype.hasOwnProperty.call(answers, answerKey)
                    || blanks.includes(answerKey);
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
      <p style={{ fontSize: '13px', color: '#80868b', marginTop: '14px' }}>
        {gradedParts.length > 0
          ? 'Incorrect blanks are outlined after submission so you can focus only on those entries.'
          : 'These values are checked against the function you wrote, not against a fixed answer key.'}
      </p>
    </div>
  );
}
