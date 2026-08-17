import { useEffect, useMemo, useState } from 'react';

import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import QuestionPrompt from './QuestionPrompt';
import IntervalNumberLine from './tools/intervalNumberLine/IntervalNumberLine';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';
import { expressionsEquivalent, expressionToLatex, latexToExpression } from './algebraAstEngine';
import {
  OTHER_ALGEBRA_OPERATIONS,
  applyBalancedOperationToRelation,
  buildAbsoluteValueSplit,
  cloneRelationState,
  obviousSpecialClaim,
  parseRelationSource,
  relationSolutionSummary,
  relationStateToLatex,
  relationStateToText,
  takeSquareRootOfRelation,
} from './algebraRelationFoundation.js';

const BASIC_OPERATIONS = [
  { id: 'add', symbol: '+', label: 'Add' },
  { id: 'subtract', symbol: '−', label: 'Subtract' },
  { id: 'multiply', symbol: '×', label: 'Multiply by' },
  { id: 'divide', symbol: '÷', label: 'Divide by' },
];

const RELATION_GLYPH = { '=': '=', '<': '<', '<=': '≤', '>': '>', '>=': '≥' };

const buttonStyle = (active = false) => ({
  minHeight: 36,
  padding: '6px 11px',
  borderRadius: 9,
  border: active ? '2px solid #174ea6' : '1px solid #b8c8e3',
  background: active ? '#e8f0fe' : '#fff',
  color: '#174ea6',
  fontWeight: 800,
  cursor: 'pointer',
});

const branchLabel = (index) => String.fromCharCode(65 + index);

const draftKeyFor = (draftKey) => (draftKey ? `${draftKey}:multi-relation` : null);

const initialStateFor = (question, draftKey) => {
  const saved = readQuestionDraft(draftKeyFor(draftKey), null);
  if (saved?.relationState) return saved.relationState;
  return parseRelationSource(
    question.equation || question.formula || '',
    question.solveFor || question.variable || 'x',
  );
};

export default function MultiRelationAlgebra({
  question,
  onStateChange,
  onStepGrade,
  onUndoStateChange,
  disabled = false,
  draftKey = null,
}) {
  const pristine = useMemo(
    () => parseRelationSource(
      question.equation || question.formula || '',
      question.solveFor || question.variable || 'x',
    ),
    [question],
  );

  const [relationState, setRelationState] = useState(() => initialStateFor(question, draftKey));
  const [history, setHistory] = useState([]);
  const [activeBranch, setActiveBranch] = useState(0);

  const [operation, setOperation] = useState(null);
  const [operand, setOperand] = useState('');
  const [operationFocusSignal, setOperationFocusSignal] = useState(0);

  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteIndex, setRewriteIndex] = useState(0);
  const [rewriteValue, setRewriteValue] = useState('');
  const [rewriteFocusSignal, setRewriteFocusSignal] = useState(0);

  const [otherOpen, setOtherOpen] = useState(false);

  const [completeSquareOpen, setCompleteSquareOpen] = useState(false);
  const [completeSquareValue, setCompleteSquareValue] = useState('');
  const [completeSquareFocusSignal, setCompleteSquareFocusSignal] = useState(0);

  const [message, setMessage] = useState(null);
  const [representationCorrect, setRepresentationCorrect] = useState(null);

  useEffect(() => {
    setRelationState(initialStateFor(question, draftKey));
    setHistory([]);
    setActiveBranch(0);
    setOperation(null);
    setOperand('');
    setRewriteOpen(false);
    setRewriteValue('');
    setOtherOpen(false);
    setCompleteSquareOpen(false);
    setCompleteSquareValue('');
    setMessage(null);
    setRepresentationCorrect(null);
  }, [question, draftKey]);

  useEffect(() => {
    writeQuestionDraft(draftKeyFor(draftKey), { relationState, activeBranch });
  }, [draftKey, relationState, activeBranch]);

  const summary = useMemo(() => relationSolutionSummary(relationState), [relationState]);
  const requireRepresentations = summary.kind === 'intervals' && question.representSolution !== false;
  const fullyComplete = summary.solved && (!requireRepresentations || representationCorrect === true);

  useEffect(() => {
    onStateChange?.({
      isComplete: fullyComplete,
      isCorrect: fullyComplete,
      responseKey: fullyComplete ? relationStateToText(relationState) : '',
      questionDetails: `${summary.solved ? 'Solved relation' : 'Current relation'}: ${relationStateToText(relationState)}`,
      parts: [
        {
          id: 'relation-work',
          label: 'Solve the equation or inequality',
          isComplete: summary.solved,
          isCorrect: summary.solved,
          response: relationStateToText(relationState),
        },
        ...(requireRepresentations ? [{
          id: 'solution-representations',
          label: 'Graph and interval notation',
          isComplete: representationCorrect !== null,
          isCorrect: representationCorrect === true,
          response: representationCorrect === true ? 'correct' : '',
        }] : []),
      ],
    });
  }, [
    fullyComplete,
    onStateChange,
    relationState,
    representationCorrect,
    requireRepresentations,
    summary,
  ]);

  useEffect(() => {
    onUndoStateChange?.({
      canUndo: history.length > 0,
      label: 'Undo the last relation step',
      onUndo: () => {
        setHistory((current) => {
          if (!current.length) return current;
          setRelationState(current[current.length - 1]);
          setActiveBranch(0);
          setRepresentationCorrect(null);
          setMessage({ tone: 'growth', text: 'Last relation step undone.' });
          return current.slice(0, -1);
        });
      },
    });
    return () => onUndoStateChange?.(null);
  }, [history, onUndoStateChange]);

  const persistStep = async (before, after, label, kind = 'relation-step') => {
    if (!onStepGrade) return;
    await onStepGrade({
      stepGrade: {
        kind,
        label,
        productive: true,
        accepted: true,
        earned: 1,
        possible: 1,
        equationBefore: relationStateToLatex(before),
        equationAfter: relationStateToLatex(after),
        expectedTotalPoints: Number(question.expectedStepPoints || 8),
      },
      countsAttempt: false,
      statePatch: {
        algebraState: { relationState: after },
        questionDetails: `Current relation: ${relationStateToText(after)}`,
      },
    });
  };

  const commitState = async (next, label, kind = 'relation-step') => {
    const before = cloneRelationState(relationState);
    setHistory((current) => [...current, before]);
    setRelationState(next);
    setRepresentationCorrect(null);
    setActiveBranch((current) => Math.min(current, Math.max(0, (next.branches?.length || 1) - 1)));
    await persistStep(before, next, label, kind);
  };

  const applyOperation = async () => {
    if (!operation || !String(operand || '').trim() || disabled) return;
    try {
      const result = applyBalancedOperationToRelation(
        relationState,
        operation,
        operand,
        { branchIndex: activeBranch },
      );
      await commitState(
        result.state,
        `${BASIC_OPERATIONS.find((item) => item.id === operation)?.label || operation} ${latexToExpression(operand)}`,
      );
      setOperand('');
      setOperation(null);
      setMessage({
        tone: 'success',
        text: result.flippedInequality
          ? 'Balanced operation applied. Multiplying or dividing by a negative reversed the inequality direction.'
          : 'Balanced operation applied. The expressions remain in the form you created.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message || 'That operation could not be applied.' });
      setOperationFocusSignal((value) => value + 1);
    }
  };

  const openRewrite = () => {
    if (disabled || relationState.special) return;
    setRewriteOpen((value) => !value);
    setRewriteIndex(0);
    setRewriteValue('');
    setRewriteFocusSignal((value) => value + 1);
    setOtherOpen(false);
    setCompleteSquareOpen(false);
  };

  const checkRewrite = async () => {
    const branch = relationState.branches?.[activeBranch];
    const current = branch?.expressions?.[rewriteIndex];
    if (!current || !String(rewriteValue || '').trim()) {
      setMessage({ tone: 'growth', text: 'Enter your equivalent expression first.' });
      setRewriteFocusSignal((value) => value + 1);
      return;
    }

    let parsed;
    try {
      parsed = latexToExpression(rewriteValue);
    } catch {
      setMessage({ tone: 'growth', text: 'MathMaster could not read that expression yet.' });
      setRewriteFocusSignal((value) => value + 1);
      return;
    }

    if (!expressionsEquivalent(parsed, current, relationState.variable)) {
      setMessage({ tone: 'growth', text: 'That expression is not equivalent. The relation was not changed.' });
      setRewriteFocusSignal((value) => value + 1);
      return;
    }

    const next = cloneRelationState(relationState);
    next.branches[activeBranch].expressions[rewriteIndex] = parsed;
    await commitState(
      next,
      `Rewrite expression ${rewriteIndex + 1} on Branch ${branchLabel(activeBranch)}`,
      'student-rewrite',
    );
    setRewriteOpen(false);
    setRewriteValue('');
    setMessage({
      tone: 'success',
      text: 'Rewrite accepted. You supplied the expression; MathMaster only checked equivalence.',
    });
  };

  const chooseOtherOperation = async (id) => {
    setOtherOpen(false);
    setRewriteOpen(false);

    if (id === 'completeSquare') {
      setCompleteSquareOpen(true);
      setCompleteSquareValue('');
      setCompleteSquareFocusSignal((value) => value + 1);
      setMessage({
        tone: 'growth',
        text: 'Enter the value you chose to add. MathMaster will not calculate the completing-square value for you.',
      });
      return;
    }

    if (id === 'reverseAbsolute') {
      const result = buildAbsoluteValueSplit(relationState, activeBranch);
      if (!result.ready) {
        setMessage({ tone: 'growth', text: result.reason });
        return;
      }
      await commitState(result.state, 'Reverse isolated absolute value', 'absolute-value-split');
      setMessage({
        tone: 'success',
        text: result.state.special
          ? (result.state.special === 'noSolution'
            ? 'The absolute-value relation has no real solution.'
            : 'The absolute-value relation is true for all real numbers.')
          : 'Absolute value reversed into its equivalent branch or compound relation.',
      });
      return;
    }

    if (id === 'squareRoot') {
      const result = takeSquareRootOfRelation(relationState, activeBranch);
      if (!result.ready) {
        setMessage({ tone: 'growth', text: result.reason });
        return;
      }
      await commitState(result.state, 'Take square roots', 'square-root');
      setMessage({
        tone: 'success',
        text: 'Square-root step applied without dropping the absolute-value consequence.',
      });
      return;
    }

    if (id === 'noSolution' || id === 'allReals') {
      const requested = id === 'noSolution' ? 'noSolution' : 'allReals';
      if (obviousSpecialClaim(relationState) !== requested) {
        setMessage({ tone: 'growth', text: 'That conclusion is not justified by the current relation.' });
        return;
      }
      const next = cloneRelationState(relationState);
      next.branches = [];
      next.connective = null;
      next.special = requested;
      await commitState(
        next,
        requested === 'noSolution' ? 'Declare no solution' : 'Declare all real numbers',
        'solution-claim',
      );
      setMessage({
        tone: 'success',
        text: requested === 'noSolution'
          ? 'No-solution conclusion accepted.'
          : 'All-real-numbers conclusion accepted.',
      });
    }
  };

  const applyCompleteSquareValue = async () => {
    if (!String(completeSquareValue || '').trim()) {
      setMessage({ tone: 'growth', text: 'Enter the value you decided completes the square.' });
      setCompleteSquareFocusSignal((value) => value + 1);
      return;
    }
    try {
      const result = applyBalancedOperationToRelation(
        relationState,
        'add',
        completeSquareValue,
        { branchIndex: activeBranch },
      );
      await commitState(
        result.state,
        `Complete-square choice: add ${latexToExpression(completeSquareValue)}`,
        'complete-square',
      );
      setCompleteSquareOpen(false);
      setCompleteSquareValue('');
      setMessage({
        tone: 'success',
        text: 'Your chosen value was added across the active equation. Use Rewrite / Simplify to write the perfect-square form.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message || 'That value could not be applied.' });
      setCompleteSquareFocusSignal((value) => value + 1);
    }
  };

  const reset = () => {
    setRelationState(pristine);
    setHistory([]);
    setActiveBranch(0);
    setOperation(null);
    setOperand('');
    setRewriteOpen(false);
    setRewriteValue('');
    setOtherOpen(false);
    setCompleteSquareOpen(false);
    setCompleteSquareValue('');
    setMessage(null);
    setRepresentationCorrect(null);
  };

  const active = relationState.branches?.[activeBranch] || null;

  return (
    <section style={{ maxWidth: 1040, margin: '0 auto', padding: '10px 10px 24px' }}>
      <QuestionPrompt>{question.prompt || 'Solve the equation or inequality.'}</QuestionPrompt>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'inline-flex', gap: 7, flexWrap: 'wrap' }}>
          <button type="button" onClick={openRewrite} disabled={disabled || relationState.special} style={buttonStyle(rewriteOpen)}>
            Rewrite / Simplify
          </button>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => {
                setOtherOpen((value) => !value);
                setRewriteOpen(false);
                setCompleteSquareOpen(false);
              }}
              disabled={disabled || relationState.special}
              style={buttonStyle(otherOpen)}
              aria-expanded={otherOpen}
            >
              Other operations ▾
            </button>

            {otherOpen && (
              <div
                className="algebra-other-operations-menu"
                style={{
                  position: 'absolute',
                  zIndex: 20,
                  left: 0,
                  top: 'calc(100% + 5px)',
                  minWidth: 225,
                  padding: 6,
                  border: '1px solid #c8d5ea',
                  borderRadius: 10,
                  background: '#fff',
                  boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                }}
              >
                {OTHER_ALGEBRA_OPERATIONS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => chooseOtherOperation(item.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      minHeight: 36,
                      padding: '7px 10px',
                      textAlign: 'left',
                      border: 0,
                      borderRadius: 7,
                      background: 'transparent',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button type="button" onClick={reset} disabled={disabled} style={buttonStyle(false)}>
          Reset work
        </button>
      </div>

      {rewriteOpen && active && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, padding: '7px 9px', border: '1px solid #b8c8e3', borderRadius: 10, background: '#f8fbff' }}>
          <strong style={{ color: '#174ea6', fontSize: 13 }}>Rewrite</strong>
          <select
            value={rewriteIndex}
            onChange={(event) => {
              setRewriteIndex(Number(event.target.value));
              setRewriteValue('');
              setRewriteFocusSignal((value) => value + 1);
            }}
            style={{ minHeight: 34, borderRadius: 8, border: '1px solid #b8c8e3', padding: '4px 8px' }}
          >
            {active.expressions.map((_, index) => (
              <option key={index} value={index}>Expression {index + 1}</option>
            ))}
          </select>

          <div style={{ flex: '1 1 300px', minWidth: 220 }}>
            <MathInput
              value={rewriteValue}
              onChange={setRewriteValue}
              placeholder="Equivalent expression"
              ariaLabel="Equivalent expression"
              toolProfile="algebra-operation"
              compact
              focusSignal={rewriteFocusSignal}
            />
          </div>

          <button type="button" onClick={checkRewrite} style={{ ...buttonStyle(true), background: '#174ea6', color: '#fff' }}>
            Check
          </button>
          <button type="button" onClick={() => setRewriteOpen(false)} style={buttonStyle(false)}>×</button>
        </div>
      )}

      {completeSquareOpen && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, padding: '7px 9px', border: '1px solid #b8c8e3', borderRadius: 10, background: '#f8fbff' }}>
          <strong style={{ color: '#174ea6', fontSize: 13 }}>Complete square</strong>
          <div style={{ flex: '1 1 260px', minWidth: 210 }}>
            <MathInput
              value={completeSquareValue}
              onChange={setCompleteSquareValue}
              placeholder="Value you chose to add"
              ariaLabel="Completing square value"
              toolProfile="algebra-operation"
              compact
              focusSignal={completeSquareFocusSignal}
            />
          </div>
          <button type="button" onClick={applyCompleteSquareValue} style={{ ...buttonStyle(true), background: '#174ea6', color: '#fff' }}>
            Use value
          </button>
          <button type="button" onClick={() => setCompleteSquareOpen(false)} style={buttonStyle(false)}>×</button>
        </div>
      )}

      {relationState.special ? (
        <div style={{ padding: 28, border: '2px solid #b7dfc2', borderRadius: 14, textAlign: 'center', background: '#f0fbf3', fontSize: 24, fontWeight: 800 }}>
          {relationState.special === 'noSolution' ? 'No solution' : 'All real numbers'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {relationState.branches.map((branch, branchIndex) => (
            <div key={branchIndex}>
              {branchIndex > 0 && relationState.connective === 'OR' && (
                <div style={{ textAlign: 'center', fontWeight: 900, color: '#5f6368', marginBottom: 6 }}>
                  OR
                </div>
              )}

              <button
                type="button"
                onClick={() => setActiveBranch(branchIndex)}
                aria-pressed={activeBranch === branchIndex}
                style={{
                  width: '100%',
                  minHeight: 118,
                  padding: '18px 14px',
                  borderRadius: 14,
                  border: activeBranch === branchIndex ? '2px solid #1a73e8' : '1px solid #c8d5ea',
                  background: activeBranch === branchIndex ? '#fbfdff' : '#fff',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  cursor: 'pointer',
                }}
              >
                {branch.expressions.map((expression, index) => (
                  <span key={`${branchIndex}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 30, minWidth: 70, textAlign: 'center' }}>
                      <MathDisplay value={expressionToLatex(expression)} format="latex" inline />
                    </span>
                    {index < branch.relations.length && (
                      <span style={{ fontSize: 30, fontWeight: 900, color: '#174ea6' }}>
                        {RELATION_GLYPH[branch.relations[index]] || branch.relations[index]}
                      </span>
                    )}
                  </span>
                ))}
              </button>

              {relationState.branches.length > 1 && (
                <div style={{ textAlign: 'center', fontSize: 11, color: activeBranch === branchIndex ? '#174ea6' : '#6b7280', marginTop: 3 }}>
                  Branch {branchLabel(branchIndex)}{activeBranch === branchIndex ? ' · active' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!summary.solved && !relationState.special && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: '1px solid #dbe4f2', background: '#fafcff' }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            {BASIC_OPERATIONS.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setOperation(item.id);
                  setOperand('');
                  setOperationFocusSignal((value) => value + 1);
                  setOtherOpen(false);
                }}
                style={buttonStyle(operation === item.id)}
              >
                <span style={{ fontSize: 18, marginRight: 4 }}>{item.symbol}</span>
                {item.label}
              </button>
            ))}

            {operation && (
              <>
                <div style={{ flex: '1 1 260px', minWidth: 210 }}>
                  <MathInput
                    value={operand}
                    onChange={setOperand}
                    placeholder="Operation value"
                    ariaLabel="Operation value"
                    toolProfile="algebra-operation"
                    compact
                    focusSignal={operationFocusSignal}
                  />
                </div>
                <button type="button" onClick={applyOperation} style={{ ...buttonStyle(true), background: '#174ea6', color: '#fff' }}>
                  Apply
                </button>
              </>
            )}
          </div>

          <div style={{ marginTop: 5, fontSize: 11, color: '#6b7280' }}>
            {relationState.branches.length > 1
              ? `Balanced operations apply to active Branch ${branchLabel(activeBranch)}.`
              : active?.expressions?.length === 3
                ? 'For a compound inequality, the same operation is applied to all three expressions.'
                : 'The same operation is applied across the relation.'}
          </div>
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: message.tone === 'error' ? '#fce8e6' : message.tone === 'success' ? '#e6f4ea' : '#fef7e0',
            color: message.tone === 'error' ? '#a50e0e' : message.tone === 'success' ? '#137333' : '#7a4f00',
            fontWeight: 700,
          }}
        >
          {message.text}
        </div>
      )}

      {summary.solved && summary.kind === 'values' && (
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: '#e6f4ea', color: '#137333', fontWeight: 800 }}>
          Solution{summary.values.length > 1 ? 's' : ''}: {summary.values.join(', ')}
        </div>
      )}

      {summary.solved && summary.kind === 'intervals' && (
        <div style={{ marginTop: 16 }}>
          <IntervalNumberLine
            questionData={{
              prompt: 'Graph your solved inequality and write the same solution in interval notation.',
              intervals: summary.intervals,
              ask: ['graph', 'interval'],
              variable: relationState.variable,
              min: Number.isFinite(Number(question.numberLineMin)) ? Number(question.numberLineMin) : -10,
              max: Number.isFinite(Number(question.numberLineMax)) ? Number(question.numberLineMax) : 10,
              step: Number.isFinite(Number(question.numberLineStep)) ? Number(question.numberLineStep) : 1,
            }}
            onAction={(action, payload) => {
              if (action === 'ATTEMPT_SUBMITTED') {
                setRepresentationCorrect(Boolean(payload?.isCorrect));
              }
            }}
          />
        </div>
      )}
    </section>
  );
}
