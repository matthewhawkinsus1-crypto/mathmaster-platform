import React, { useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import { choiceBankFor, EXPRESSION_MEANING_DIMENSIONS, nextIncompleteExpressionId, scoreExpressionMeaning } from './expressionMeaningMath.js';

const button = { minHeight: 42, padding: '9px 13px', borderRadius: 9, border: '1px solid #c9d6e8', background: '#fff', fontWeight: 800, cursor: 'pointer' };

const DIMENSION_LABEL = { unit: 'Unit', contextMeaning: 'Contextual meaning', mathRole: 'Mathematical role' };

export default function ExpressionMeaning({ questionData = {}, onAction }) {
  const expressions = useMemo(() => (Array.isArray(questionData.expressions) ? questionData.expressions : []), [questionData.expressions]);
  const [assignments, setAssignments] = usePersistentToolState('assignments', {});
  // Which expression's meaning row is currently open for editing. Selection,
  // not an answer, so it stays out of the draft/undo history.
  const [activeId, setActiveId] = useState(expressions[0]?.id || null);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const mathematicalState = useMemo(() => ({ assignments }), [assignments]);

  const undoHistory = useMathUndoHistory({
    label: 'Undo the last expression-meaning assignment',
    state: mathematicalState,
    resetKey: questionUndoResetKey(questionData),
    onRestore: (restored) => {
      setAssignments(restored?.assignments || {});
      clearFeedback();
    },
  });

  const activeExpression = expressions.find((expr) => expr.id === activeId) || expressions[0] || null;

  const isRowComplete = (given = {}) => EXPRESSION_MEANING_DIMENSIONS.every((dimension) => String(given[dimension] || '').trim());

  const assign = (exprId, dimension, value) => {
    if (!exprId) return;
    clearFeedback();
    const next = { ...assignments, [exprId]: { ...assignments[exprId], [dimension]: value } };
    setAssignments(next);
    // Completing a row opens the next incomplete one in place, so the student
    // is not sent back up to the matrix for every expression. Editing a row
    // that was already complete stays on it.
    if (!isRowComplete(assignments[exprId]) && isRowComplete(next[exprId])) {
      const nextId = nextIncompleteExpressionId(expressions, next, exprId);
      if (nextId) setActiveId(nextId);
    }
  };

  const completedCount = expressions.filter((expr) => {
    const given = assignments[expr.id] || {};
    return EXPRESSION_MEANING_DIMENSIONS.every((dimension) => String(given[dimension] || '').trim());
  }).length;
  const allComplete = expressions.length > 0 && completedCount === expressions.length;

  const check = () => {
    const response = { assignments };
    const result = scoreExpressionMeaning(questionData, response);
    const parts = result.perExpression.map((entry) => ({
      id: entry.id,
      label: expressions.find((expr) => expr.id === entry.id)?.expression || entry.id,
      isCorrect: entry.complete,
      isComplete: true,
      dimensions: entry.checks,
    }));
    submit({ isCorrect: result.isCorrect, score: result.score }, response, { parts });
  };

  const feedbackParts = feedback?.metadata?.parts || [];
  const wrongParts = feedbackParts.filter((part) => !part.isCorrect);

  return (
    <ToolShell
      title="Expression Meaning"
      subtitle="Connect each piece of the expression to its unit, its contextual meaning, and its mathematical role."
      badge="Meaning matrix"
    >
      <TaskCard
        question={questionData}
        task="For every listed expression, decide what unit it is measured in, what it means in context, and what mathematical role it plays."
        steps={[
          'Tap an expression in the matrix to open it.',
          'Choose its Unit, its Contextual Meaning, and its Mathematical Role.',
          'Move through every expression in the matrix.',
          'Submit the completed meaning map when every row is filled in.',
        ]}
      />

      <Panel title={`Meaning matrix (${completedCount}/${expressions.length} complete)`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8 }}>Expression</th>
                {EXPRESSION_MEANING_DIMENSIONS.map((dimension) => (
                  <th key={dimension} style={{ textAlign: 'left', padding: 8 }}>{DIMENSION_LABEL[dimension]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expressions.map((expr) => {
                const given = assignments[expr.id] || {};
                const isActive = activeExpression?.id === expr.id;
                return (
                  <tr key={expr.id} style={{ background: isActive ? '#eef4ff' : 'transparent' }}>
                    <td style={{ padding: 8 }}>
                      <button
                        type="button"
                        onClick={() => setActiveId(expr.id)}
                        aria-pressed={isActive}
                        aria-label={`Edit the meaning of ${expr.expression}`}
                        style={{ ...button, border: isActive ? '3px solid #1a73e8' : '1px solid #c9d6e8', minHeight: 40 }}
                      >
                        {expr.expression}
                      </button>
                    </td>
                    {EXPRESSION_MEANING_DIMENSIONS.map((dimension) => (
                      <td key={dimension} style={{ padding: 8, color: given[dimension] ? '#172033' : '#9aa5b1' }}>
                        {given[dimension] || '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {activeExpression ? (
        <Panel title={`Assign the meaning of ${activeExpression.expression}`}>
          {EXPRESSION_MEANING_DIMENSIONS.map((dimension) => {
            const bank = choiceBankFor(questionData, dimension);
            const currentValue = assignments[activeExpression.id]?.[dimension] || '';
            return (
              <div key={dimension} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>{DIMENSION_LABEL[dimension]}</div>
                <div role="group" aria-label={DIMENSION_LABEL[dimension]} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {bank.map((option) => {
                    const selected = currentValue === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => assign(activeExpression.id, dimension, option)}
                        aria-pressed={selected}
                        style={{ ...button, minHeight: 44, background: selected ? '#1a73e8' : '#fff', color: selected ? '#fff' : '#172033' }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Panel>
      ) : null}

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => undoHistory.undo()} disabled={!undoHistory.canUndo} style={{ ...button }} aria-label="Undo">↶ Undo</button>
        <button
          data-primary-answer-action="true"
          type="button"
          onClick={check}
          disabled={!allComplete}
          style={{ ...button, background: allComplete ? '#1a73e8' : '#dadce0', color: allComplete ? '#fff' : '#5f6368', border: 0 }}
        >
          Submit meaning map
        </button>
        {feedback ? <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Every connection is correct' : 'Some connections need another look'}</ResultPill> : null}
      </div>
      {feedback && !feedback.isCorrect && wrongParts.length ? (
        <ul style={{ color: '#5f6b7a', lineHeight: 1.55 }}>
          {wrongParts.map((part) => (
            <li key={part.id}>
              <strong>{part.label}</strong>: reconsider its {Object.entries(part.dimensions || {}).filter(([, ok]) => !ok).map(([dimension]) => DIMENSION_LABEL[dimension]).join(', ')}.
            </li>
          ))}
        </ul>
      ) : null}
    </ToolShell>
  );
}
