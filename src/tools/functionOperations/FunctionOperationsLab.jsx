import React, { useMemo, useState } from 'react';
import ToolShell, { HintPanel, Panel, ResultPill, TaskCard, ToolGrid } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import MathInput from '../../MathInput.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import {
  deriveFunctionOperations,
  functionOperationAnswerMatches,
  restrictionsMatch,
} from './functionOperationsMath';

const inputStyle = {
  width: '100%',
  padding: 10,
  border: '1px solid #cfd8e6',
  borderRadius: 8,
  boxSizing: 'border-box',
  fontSize: 17,
};

const actionStyle = {
  marginTop: 14,
  padding: '10px 16px',
  border: 0,
  borderRadius: 8,
  background: '#1a73e8',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const OPERATION_META = Object.freeze({
  sum: { title: '(f + g)(x)', prompt: 'Add f(x) and g(x), then simplify.' },
  difference: { title: '(f − g)(x)', prompt: 'Subtract g(x) from f(x), then simplify.' },
  product: { title: '(fg)(x)', prompt: 'Multiply f(x) and g(x), then simplify.' },
  quotient: { title: '(f / g)(x)', prompt: 'Divide f(x) by g(x), simplify, and preserve denominator restrictions.' },
  composition: { title: 'Composition', prompt: 'Substitute the inner function into the outer function and simplify.' },
});

const normalizedOperations = (value) => {
  const operations = Array.isArray(value) && value.length
    ? value
    : ['sum', 'difference', 'product', 'quotient'];
  return [...new Set(operations.filter((operation) => OPERATION_META[operation]))];
};

const operationExpectedExpression = (answers, operation) => answers?.[operation]?.expression || '';

export default function FunctionOperationsLab({ questionData = {}, onAction }) {
  const operations = useMemo(() => normalizedOperations(questionData.operations), [questionData.operations]);
  const composeOrder = questionData.composeOrder === 'gOfF' ? 'gOfF' : 'fOfG';
  const answers = useMemo(() => deriveFunctionOperations({
    f: questionData.f,
    g: questionData.g,
    operations,
    composeOrder,
    restrictions: questionData.restrictions,
  }), [questionData.f, questionData.g, questionData.restrictions, operations, composeOrder]);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const [responses, setResponses] = useState(() => Object.fromEntries(operations.map((operation) => [operation, ''])));
  const [restrictionResponse, setRestrictionResponse] = useState('');

  const setResponse = (operation, value) => {
    clearFeedback?.();
    setResponses((current) => ({ ...current, [operation]: value }));
  };

  const check = () => {
    const operationScores = operations.map((operation) => {
      const expected = operationExpectedExpression(answers, operation);
      const expressionCorrect = functionOperationAnswerMatches(operation, responses[operation], expected);
      if (operation !== 'quotient') return { operation, score: expressionCorrect ? 1 : 0, expressionCorrect };

      const expectedRestrictions = answers.quotient?.excludedValues || [];
      const restrictionCorrect = restrictionsMatch(restrictionResponse, expectedRestrictions);
      return {
        operation,
        score: ((expressionCorrect ? 1 : 0) + (restrictionCorrect ? 1 : 0)) / 2,
        expressionCorrect,
        restrictionCorrect,
      };
    });
    const score = operationScores.length
      ? operationScores.reduce((total, entry) => total + entry.score, 0) / operationScores.length
      : 0;
    submit(
      { isCorrect: score === 1, score },
      { responses, restrictions: restrictionResponse },
      { mode: 'functionOperations', operationScores, composeOrder },
    );
  };

  const compositionLabel = composeOrder === 'gOfF' ? '(g ∘ f)(x)' : '(f ∘ g)(x)';

  return (
    <ToolShell
      title="Function Operations Workbench"
      subtitle="Combine functions while keeping each operation and domain restriction visible."
      badge="Algebra II · Function Operations"
    >
      <TaskCard
        question={questionData}
        task="Complete each requested operation. Simplify the result without losing restrictions from an original denominator."
        steps={[
          'Keep f(x) and g(x) separate until the operation is clear.',
          'For a quotient, simplify the expression but keep values excluded by the original denominator.',
          'For composition, substitute the entire inner function before simplifying.',
        ]}
      />

      <Panel title="Functions">
        <div style={{ display: 'grid', gap: 8, fontSize: 20, fontWeight: 800 }}>
          <MathDisplay value={`f(x)=${answers.f.expression}`} />
          <MathDisplay value={`g(x)=${answers.g.expression}`} />
        </div>
      </Panel>

      <ToolGrid min={300}>
        {operations.map((operation) => {
          const meta = OPERATION_META[operation];
          const title = operation === 'composition' ? compositionLabel : meta.title;
          return (
            <Panel key={operation} title={title}>
              <p style={{ marginTop: 0 }}>{meta.prompt}</p>
              <label style={{ display: 'block', fontWeight: 700 }}>
                Simplified expression
                <MathInput
                  value={responses[operation] || ''}
                  onChange={(value) => setResponse(operation, value)}
                  toolProfile="expression"
                  maxWidth={540}
                  placeholder="Enter an expression in x"
                  aria-label={`${title} simplified expression`}
                />
              </label>
              {operation === 'quotient' ? (
                <label style={{ display: 'block', fontWeight: 700, marginTop: 12 }}>
                  Excluded x-value(s)
                  <input
                    value={restrictionResponse}
                    onChange={(event) => {
                      clearFeedback?.();
                      setRestrictionResponse(event.target.value);
                    }}
                    style={{ ...inputStyle, marginTop: 6 }}
                    placeholder="Example: 2, -5"
                    aria-label="Excluded denominator values"
                  />
                  <span style={{ display: 'block', marginTop: 5, color: '#5f6b7a', fontWeight: 500, fontSize: 13 }}>
                    Enter all values excluded by the original denominator, separated by commas. Leave blank only when there are none.
                  </span>
                </label>
              ) : null}
            </Panel>
          );
        })}
      </ToolGrid>

      <Panel title="Check your work">
        <button type="button" onClick={check} style={actionStyle}>Check all operations</button>
        {feedback ? (
          <div style={{ marginTop: 12 }}>
            <ResultPill ok={feedback.isCorrect}>
              {feedback.isCorrect
                ? 'All requested function operations and restrictions are correct.'
                : 'Some parts are correct. Review the operation panels and try the remaining parts.'}
            </ResultPill>
          </div>
        ) : null}
        <HintPanel
          hints={[
            'For addition and subtraction, combine like terms only after distributing any subtraction sign.',
            'For a quotient, a factor may cancel from the expression but its zero is still excluded from the original function domain.',
            `For ${compositionLabel}, replace every x in the outer function with the complete inner function.`,
          ]}
          onHintUsed={() => onAction?.('HINT_USED')}
        />
      </Panel>
    </ToolShell>
  );
}
