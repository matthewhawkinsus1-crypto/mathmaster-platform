import { useEffect, useMemo, useRef, useState } from 'react';

import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import QuestionPrompt from './QuestionPrompt';
import IntervalNumberLine from './tools/intervalNumberLine/IntervalNumberLine';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';
import {
  expressionToLatex,
  expressionsEquivalent,
  latexToExpression,
  splitAdditiveTerms,
} from './algebraAstEngine';
import {
  OTHER_ALGEBRA_OPERATIONS,
  applyBalancedOperationToRelation,
  buildAbsoluteValueSplit,
  cancelRelationExpressionPair,
  cloneRelationState,
  obviousSpecialClaim,
  parseRelationSource,
  relationCancellationCandidates,
  relationExpressionToLatex,
  relationExpressionsEquivalent,
  normalizeRelationExpressionInput,
  relationSolutionSummary,
  relationSourceFromQuestion,
  relationStateContainsAbsoluteValue,
  verifyRelationCandidates,
  relationStateToLatex,
  relationStateToText,
  resolveRelationNumberLineConfig,
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
  background: active ? '#e8f0fe' : '#ffffff',
  color: '#174ea6',
  fontWeight: 800,
  cursor: 'pointer',
  colorScheme: 'light',
});

const branchLabel = (index) => String.fromCharCode(65 + index);
const expressionKey = (branchIndex, expressionIndex) => `${branchIndex}:${expressionIndex}`;
const draftKeyFor = (draftKey) => (draftKey ? `${draftKey}:multi-relation` : null);

const initialStateFor = (question, draftKey) => {
  const saved = readQuestionDraft(draftKeyFor(draftKey), null);
  if (saved?.relationState) return saved.relationState;

  const source = relationSourceFromQuestion(question);
  if (!source) {
    throw new Error(
      'This stepAlgebra question has no readable equation source. ' +
      'Expected equation, equationLatex, equationAscii, initialEquation, ' +
      'leftExpression/rightExpression, or expressions/relations.',
    );
  }

  return parseRelationSource(
    source,
    question.solveFor || question.variable || question.objective?.variable || 'x',
  );
};

const initialPendingRelationFlipFor = (draftKey) => (
  readQuestionDraft(draftKeyFor(draftKey), null)?.pendingRelationFlip || null
);

const initialCandidateChecksFor = (draftKey) => (
  readQuestionDraft(draftKeyFor(draftKey), null)?.candidateChecks || {}
);

const compactText = (value) => String(value ?? '').replace(/\s+/g, '');

function StagedAdditivePreview({
  operation,
  operandLatex,
  compact = false,
}) {
  const symbol = operation === 'subtract' ? '−' : '+';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        color: '#174ea6',
        fontWeight: 900,
        fontSize: compact ? 16 : 24,
        whiteSpace: 'nowrap',
      }}
    >
      <span>{symbol}</span>
      <MathDisplay value={operandLatex || ''} format="latex" inline />
    </span>
  );
}

function PlacementMiniMenu({
  onChoose,
  onClose,
}) {
  return (
    <div
      className="multi-relation-placement-mini-menu"
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        zIndex: 35,
        left: '50%',
        top: 'calc(100% + 5px)',
        transform: 'translateX(-50%)',
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        border: '1px solid #b8c8e3',
        borderRadius: 9,
        background: '#fff',
        boxShadow: '0 6px 18px rgba(0,0,0,.14)',
        whiteSpace: 'nowrap',
      }}
    >
      {[
        ['before', 'Before'],
        ['under', 'Under'],
        ['after', 'After'],
      ].map(([kind, label]) => (
        <button
          type="button"
          key={kind}
          onClick={() => onChoose(kind)}
          style={{
            minHeight: 30,
            padding: '4px 8px',
            border: '1px solid #c8d5ea',
            borderRadius: 7,
            background: '#fff',
            color: '#174ea6',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close placement choices"
        style={{
          minWidth: 28,
          minHeight: 30,
          border: 0,
          background: 'transparent',
          color: '#5f6368',
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

function AdditiveExpressionRegion({
  expression,
  variable,
  branchIndex,
  expressionIndex,
  activeBranch,
  cancellationHints,
  selectedCancellationIndex,
  onCancellationToken,
  onCancellationDragStart,
  rewriteMode,
  onRewriteTarget,
  placementMode,
  placement,
  onPlacement,
  operation,
  operandLatex,
}) {
  const [placementTargetIndex, setPlacementTargetIndex] = useState(null);

  const terms = useMemo(() => splitAdditiveTerms(expression), [expression]);
  const cancellationModel = useMemo(
    () => relationCancellationCandidates(expression, variable),
    [expression, variable],
  );

  useEffect(() => {
    if (!placementMode) setPlacementTargetIndex(null);
  }, [placementMode]);

  if (!terms?.length) {
    return (
      <span style={{ fontSize: 30, minWidth: 70, textAlign: 'center' }}>
        <MathDisplay value={relationExpressionToLatex(expression)} format="latex" inline />
      </span>
    );
  }

  const cancellableIndices = new Set();
  if (cancellationModel?.kind === 'additive') {
    cancellationModel.pairs.forEach((pair) => {
      cancellableIndices.add(pair.firstIndex);
      cancellableIndices.add(pair.secondIndex);
    });
  }

  return (
    <div
      className="multi-relation-expression-region"
      style={{
        display: 'inline-flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 4,
        flexWrap: 'wrap',
        minWidth: 100,
      }}
    >
      {terms.map((term, termIndex) => {
        const isSelected = selectedCancellationIndex === termIndex;
        const canCancel = cancellableIndices.has(termIndex);
        const beforeActive = placement?.kind === 'before' && placement.termIndex === termIndex;
        const afterActive = placement?.kind === 'after' && placement.termIndex === termIndex;
        const underActive = placement?.kind === 'under' && placement.termIndex === termIndex;

        const rawTerm = String(term.text || '').trim();
        const termNeedsLeadingPlus = beforeActive
          && termIndex === 0
          && !rawTerm.startsWith('-')
          && !rawTerm.startsWith('+');
        const visibleTerm = termNeedsLeadingPlus ? `+ ${rawTerm}` : rawTerm;

        return (
          <div
            key={`${branchIndex}-${expressionIndex}-${termIndex}`}
            style={{
              display: 'inline-grid',
              gridTemplateRows: 'auto auto',
              justifyItems: 'center',
              alignItems: 'start',
              gap: 2,
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              {beforeActive && (
                <StagedAdditivePreview
                  operation={operation}
                  operandLatex={operandLatex}
                />
              )}

              <button
                type="button"
                data-cancel-key={expressionKey(branchIndex, expressionIndex)}
                data-cancel-index={termIndex}
                onClick={(event) => {
                  event.stopPropagation();
                  if (placementMode) {
                    setPlacementTargetIndex((current) => (
                      current === termIndex ? null : termIndex
                    ));
                    return;
                  }
                  if (rewriteMode) onRewriteTarget();
                  else onCancellationToken(termIndex);
                }}
                onPointerDown={(event) => {
                  if (rewriteMode || placementMode) return;
                  event.stopPropagation();
                  onCancellationDragStart(termIndex, event);
                }}
                title={placementMode
                  ? 'Click this term to choose Before, Under, or After'
                  : canCancel
                    ? 'Matching opposite terms can be cancelled directly'
                    : 'Term'}
                style={{
                  minHeight: 44,
                  padding: '4px 5px',
                  borderRadius: 8,
                  border: placementTargetIndex === termIndex
                    ? '2px solid #174ea6'
                    : isSelected
                      ? '2px solid #174ea6'
                      : cancellationHints && canCancel
                        ? '1px dashed #7b61ff'
                        : '1px solid transparent',
                  background: placementTargetIndex === termIndex
                    ? '#f2f7ff'
                    : isSelected
                      ? '#e8f0fe'
                      : cancellationHints && canCancel
                        ? '#faf7ff'
                        : 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  cursor: placementMode ? 'crosshair' : rewriteMode ? 'text' : activeBranch ? 'pointer' : 'default',
                  opacity: activeBranch ? 1 : 0.8,
                }}
              >
                <span style={{ fontSize: 30 }}>
                  <MathDisplay value={expressionToLatex(visibleTerm)} format="latex" inline />
                </span>
              </button>

              {afterActive && (
                <StagedAdditivePreview
                  operation={operation}
                  operandLatex={operandLatex}
                />
              )}
            </div>

            {underActive && (
              <div
                className="staged-additive-below"
                title="Staged below this term; this is not a division bar"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  marginTop: 2,
                  padding: '2px 6px',
                  border: '1px solid #c8d9f5',
                  borderRadius: 999,
                  background: '#f3f7ff',
                  color: '#174ea6',
                  colorScheme: 'light',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 900 }}>↓</span>
                <StagedAdditivePreview
                  operation={operation}
                  operandLatex={operandLatex}
                  compact
                />
              </div>
            )}

            {placementMode && placementTargetIndex === termIndex && (
              <PlacementMiniMenu
                onChoose={(kind) => {
                  onPlacement({ kind, termIndex });
                  setPlacementTargetIndex(null);
                }}
                onClose={() => setPlacementTargetIndex(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FractionCancellationRegion({
  expression,
  variable,
  branchIndex,
  expressionIndex,
  selectedCancellationIndex,
  cancellationHints,
  onCancellationToken,
  onCancellationDragStart,
  rewriteMode,
  onRewriteTarget,
}) {
  const model = useMemo(
    () => relationCancellationCandidates(expression, variable),
    [expression, variable],
  );

  if (!model || model.kind !== 'fraction') {
    return (
      <span style={{ fontSize: 30, minWidth: 70, textAlign: 'center' }}>
        <MathDisplay value={relationExpressionToLatex(expression)} format="latex" inline />
      </span>
    );
  }

  const cancellable = new Set();
  model.pairs.forEach((pair) => {
    cancellable.add(pair.firstIndex);
    cancellable.add(pair.secondIndex);
  });

  const factorButton = (factor, index) => {
    const selected = selectedCancellationIndex === index;
    const hinted = cancellationHints && cancellable.has(index);
    return (
      <button
        type="button"
        key={`${branchIndex}-${expressionIndex}-factor-${index}`}
        data-cancel-key={expressionKey(branchIndex, expressionIndex)}
        data-cancel-index={index}
        onClick={(event) => {
          event.stopPropagation();
          if (rewriteMode) onRewriteTarget();
          else onCancellationToken(index);
        }}
        onPointerDown={(event) => {
          if (rewriteMode) return;
          event.stopPropagation();
          onCancellationDragStart(index, event);
        }}
        onPointerEnter={() => {
          // Drop target is resolved on pointer-up, not merely by crossing it.
        }}
        style={{
          minHeight: 35,
          padding: '2px 5px',
          borderRadius: 7,
          border: selected ? '2px solid #174ea6' : hinted ? '1px dashed #7b61ff' : '1px solid transparent',
          background: selected ? '#e8f0fe' : hinted ? '#faf7ff' : 'transparent',
          color: '#202124',
          colorScheme: 'light',
          cursor: rewriteMode ? 'text' : 'pointer',
        }}
      >
        <span style={{ fontSize: 24, color: '#202124' }}>
          <MathDisplay
            value={factor.latex || expressionToLatex(factor.text)}
            format="latex"
            inline
          />
        </span>
      </button>
    );
  };

  return (
    <div
      className="fraction-cancellation-region"
      style={{
        display: 'inline-grid',
        gridTemplateRows: 'auto 2px auto',
        gap: 4,
        minWidth: 110,
        color: '#202124',
        colorScheme: 'light',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
        {model.numerator.map((factor, index) => factorButton(factor, index))}
      </div>
      <div style={{ height: 2, background: '#5f6368', borderRadius: 999 }} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
        {model.denominator.map((factor, index) => factorButton(factor, model.numerator.length + index))}
      </div>
    </div>
  );
}

function RelationExpressionRegion(props) {
  const model = useMemo(
    () => relationCancellationCandidates(props.expression, props.variable),
    [props.expression, props.variable],
  );

  if (model?.kind === 'fraction' && !props.placementMode) {
    return <FractionCancellationRegion {...props} />;
  }

  return <AdditiveExpressionRegion {...props} />;
}

export default function MultiRelationAlgebra({
  question,
  onStateChange,
  onStepGrade,
  onUndoStateChange,
  disabled = false,
  draftKey = null,
}) {
  const pristine = useMemo(() => {
    const source = relationSourceFromQuestion(question);
    if (!source) {
      throw new Error(
        'This stepAlgebra question has no readable equation source. ' +
        'Expected equation, equationLatex, equationAscii, initialEquation, ' +
        'leftExpression/rightExpression, or expressions/relations.',
      );
    }

    return parseRelationSource(
      source,
      question.solveFor || question.variable || question.objective?.variable || 'x',
    );
  }, [question]);

  // Keep the raw React state separate from the state used by the workspace.
  // Teacher preview / draft hydration can briefly supply a null relation state
  // while the question shell is being rebuilt. The advanced workspace should
  // recover from that transient value instead of crashing while reading
  // relationState.variable.
  const [storedRelationState, setRelationState] = useState(() => initialStateFor(question, draftKey));
  const relationState = storedRelationState || pristine;
  const [history, setHistory] = useState([]);
  const [activeBranch, setActiveBranch] = useState(0);

  const [operation, setOperation] = useState(null);
  const [operand, setOperand] = useState('');
  const [operationFocusSignal, setOperationFocusSignal] = useState(0);
  const [placementByKey, setPlacementByKey] = useState({});

  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteIndex, setRewriteIndex] = useState(0);
  const [rewriteValue, setRewriteValue] = useState('');
  const [rewriteFocusSignal, setRewriteFocusSignal] = useState(0);

  const [otherOpen, setOtherOpen] = useState(false);

  const [completeSquareOpen, setCompleteSquareOpen] = useState(false);
  const [completeSquareValue, setCompleteSquareValue] = useState('');
  const [completeSquareFocusSignal, setCompleteSquareFocusSignal] = useState(0);

  const [cancellationHintsEnabled, setCancellationHintsEnabled] = useState(false);
  const [cancellationSelection, setCancellationSelection] = useState({});
  const [dragCancellationKey, setDragCancellationKey] = useState(null);
  const [dragStroke, setDragStroke] = useState(null);
  const dragStrokeRef = useRef(null);
  const suppressCancellationClickUntil = useRef(0);

  const [pendingRelationFlip, setPendingRelationFlip] = useState(() => initialPendingRelationFlipFor(draftKey));
  const [relationPicker, setRelationPicker] = useState(null);
  const [absoluteSplitOpen, setAbsoluteSplitOpen] = useState(false);

  const [message, setMessage] = useState(null);
  const [representationCorrect, setRepresentationCorrect] = useState(null);
  const [candidateChecks, setCandidateChecks] = useState(() => initialCandidateChecksFor(draftKey));

  useEffect(() => {
    setRelationState(initialStateFor(question, draftKey));
    setHistory([]);
    setActiveBranch(0);
    setOperation(null);
    setOperand('');
    setPlacementByKey({});
    setRewriteOpen(false);
    setRewriteValue('');
    setOtherOpen(false);
    setCompleteSquareOpen(false);
    setCompleteSquareValue('');
    setCancellationSelection({});
    setDragCancellationKey(null);
    setDragStroke(null);
    dragStrokeRef.current = null;
    setPendingRelationFlip(null);
    setRelationPicker(null);
    setAbsoluteSplitOpen(false);
    setMessage(null);
    setRepresentationCorrect(null);
    setCandidateChecks(initialCandidateChecksFor(draftKey));
  }, [question, draftKey]);

  useEffect(() => {
    writeQuestionDraft(draftKeyFor(draftKey), {
      relationState,
      activeBranch,
      pendingRelationFlip,
      candidateChecks,
    });
  }, [draftKey, relationState, activeBranch, pendingRelationFlip, candidateChecks]);

  const summary = useMemo(() => relationSolutionSummary(relationState), [relationState]);
  const candidateVerification = useMemo(() => (
    summary.kind === 'values' && relationStateContainsAbsoluteValue(pristine)
      ? verifyRelationCandidates(pristine, summary.values, pristine.variable)
      : []
  ), [pristine, summary]);
  const requireCandidateVerification = candidateVerification.length > 0;
  const candidateVerificationComplete = !requireCandidateVerification
    || candidateVerification.every(({ value }) => candidateChecks[String(value)] != null);
  const candidateVerificationCorrect = !requireCandidateVerification
    || candidateVerification.every(({ value, valid }) => (
      candidateChecks[String(value)] === (valid ? 'valid' : 'extraneous')
    ));
  const verifiedSolutions = candidateVerification
    .filter(({ valid }) => valid)
    .map(({ value }) => value);

  // Process messages such as "Cancellation complete" are useful while the
  // student is working, but once every solution branch is isolated they
  // become stale and make a finished problem look unfinished.
  useEffect(() => {
    if (!pendingRelationFlip && summary.solved) {
      setMessage((current) => (current == null ? current : null));
      setRewriteOpen(false);
      setOtherOpen(false);
      setOperation(null);
      setOperand('');
      setPlacementByKey({});
    }
  }, [pendingRelationFlip, summary.solved]);

  const numberLineConfig = useMemo(
    () => resolveRelationNumberLineConfig(summary.intervals || [], question),
    [summary.intervals, question],
  );
  const requireRepresentations = summary.kind === 'intervals' && question.representSolution !== false;
  const fullyComplete = !pendingRelationFlip
    && summary.solved
    && candidateVerificationComplete
    && (!requireRepresentations || representationCorrect === true);
  const fullyCorrect = fullyComplete && candidateVerificationCorrect;

  useEffect(() => {
    const candidateDetail = requireCandidateVerification
      ? ` Candidate checks: ${candidateVerification.map(({ value }) => `${relationState.variable}=${value}:${candidateChecks[String(value)] || 'unchecked'}`).join(', ')}.`
      : '';
    onStateChange?.({
      isComplete: fullyComplete,
      isCorrect: fullyCorrect,
      responseKey: fullyComplete ? `${relationStateToText(relationState)}|${JSON.stringify(candidateChecks)}` : '',
      questionDetails: `${summary.solved ? 'Solved relation' : 'Current relation'}: ${relationStateToText(relationState)}.${candidateDetail}`,
      parts: [
        {
          id: 'relation-work',
          label: 'Solve the equation or inequality',
          isComplete: summary.solved,
          isCorrect: summary.solved,
          response: relationStateToText(relationState),
        },
        ...(requireCandidateVerification ? [{
          id: 'candidate-verification',
          label: 'Check candidates in the original equation',
          isComplete: candidateVerificationComplete,
          isCorrect: candidateVerificationComplete && candidateVerificationCorrect,
          response: candidateVerification.map(({ value }) => `${value}:${candidateChecks[String(value)] || 'unchecked'}`).join(', '),
        }] : []),
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
    candidateChecks,
    candidateVerification,
    candidateVerificationComplete,
    candidateVerificationCorrect,
    fullyComplete,
    fullyCorrect,
    onStateChange,
    relationState,
    representationCorrect,
    requireCandidateVerification,
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
          setCancellationSelection({});
          setPlacementByKey({});
          setPendingRelationFlip(null);
          setRelationPicker(null);
          setAbsoluteSplitOpen(false);
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
    setCancellationSelection({});
    setDragCancellationKey(null);
    setDragStroke(null);
    dragStrokeRef.current = null;
    setRelationPicker(null);
    setPlacementByKey({});
    setActiveBranch((current) => Math.min(current, Math.max(0, (next.branches?.length || 1) - 1)));
    await persistStep(before, next, label, kind);
  };

  const hasOperationOperand = Boolean(String(operand || '').trim());
  const placementMode = ['add', 'subtract'].includes(operation) && hasOperationOperand;
  const wholeRelationPlacementMode = ['multiply', 'divide'].includes(operation) && hasOperationOperand;
  const explicitOperationPlacementMode = Boolean(operation) && hasOperationOperand;

  const wholeOperationPreview = useMemo(() => {
    if (!wholeRelationPlacementMode) return '';
    const symbol = operation === 'divide' ? '÷' : '×';
    try {
      return `${symbol} ${latexToExpression(operand)}`;
    } catch {
      return symbol;
    }
  }, [operation, operand, wholeRelationPlacementMode]);

  const activeExpressionCount = relationState.branches?.[activeBranch]?.expressions?.length || 0;
  const explicitPlacementCount = explicitOperationPlacementMode
    ? Array.from({ length: activeExpressionCount }, (_, expressionIndex) => {
      const placement = placementByKey[expressionKey(activeBranch, expressionIndex)];
      if (!placement) return 0;
      if (wholeRelationPlacementMode) return placement.kind === 'whole-operation' ? 1 : 0;
      return ['before', 'under', 'after', 'end'].includes(placement.kind) ? 1 : 0;
    }).reduce((total, value) => total + value, 0)
    : 0;

  const explicitPlacementComplete = explicitOperationPlacementMode
    && activeExpressionCount > 0
    && explicitPlacementCount === activeExpressionCount;

  const applyOperation = async () => {
    if (!operation || !String(operand || '').trim() || disabled) return;

    try {
      const branch = relationState.branches?.[activeBranch];
      const placementByExpression = {};
      branch?.expressions?.forEach((_, expressionIndex) => {
        const placement = placementByKey[expressionKey(activeBranch, expressionIndex)];
        if (placement) placementByExpression[expressionIndex] = placement;
      });

      if (branch?.expressions?.length) {
        const missing = branch.expressions
          .map((_, expressionIndex) => expressionIndex)
          .filter((expressionIndex) => {
            const placement = placementByExpression[expressionIndex];
            if (!placement) return true;
            if (['multiply', 'divide'].includes(operation)) {
              return placement.kind !== 'whole-operation';
            }
            return !['before', 'under', 'after', 'end'].includes(placement.kind);
          });

        if (missing.length) {
          const noun = operation === 'divide'
            ? 'the divisor'
            : operation === 'multiply'
              ? 'the multiplier'
              : operation === 'subtract'
                ? 'the subtraction'
                : 'the addition';
          setMessage({
            tone: 'growth',
            text: `Place ${noun} on every expression region before committing the balanced step.`,
          });
          return;
        }
      }

      const result = applyBalancedOperationToRelation(
        relationState,
        operation,
        operand,
        {
          branchIndex: activeBranch,
          placementByExpression,
          requireExplicitPlacement: true,
        },
      );

      const operationLabel = `${BASIC_OPERATIONS.find((item) => item.id === operation)?.label || operation} ${latexToExpression(operand)}`;

      if (result.requiresInequalityFlip) {
        const before = cloneRelationState(relationState);
        setHistory((current) => [...current, before]);
        setRelationState(result.state);
        setRepresentationCorrect(null);
        setCancellationSelection({});
        setPlacementByKey({});
        setPendingRelationFlip({
          branchIndex: activeBranch,
          expectedRelations: result.expectedRelations,
          before,
          label: operationLabel,
        });
        setMessage({
          tone: 'growth',
          text: 'Operation written. Update the relation symbol(s) yourself before continuing.',
        });
      } else {
        await commitState(result.state, operationLabel);
        setMessage({
          tone: 'success',
          text: operation === 'divide'
            ? 'Division recorded on every side. The quotient is intentionally unsimplified; use Rewrite / Simplify when you want to reduce it.'
            : 'Balanced operation applied exactly where you placed it. Nothing was simplified automatically.',
        });
      }

      setOperand('');
      setOperation(null);
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message || 'That operation could not be applied.' });
      setOperationFocusSignal((value) => value + 1);
    }
  };

  const openRewrite = () => {
    if (disabled || relationState.special) return;
    if (pendingRelationFlip) {
      setMessage({ tone: 'growth', text: 'Finish the relation symbols from the last operation first.' });
      return;
    }
    setRewriteOpen((value) => !value);
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
      parsed = normalizeRelationExpressionInput(rewriteValue);
    } catch {
      setMessage({ tone: 'growth', text: 'MathMaster could not read that expression yet.' });
      setRewriteFocusSignal((value) => value + 1);
      return;
    }

    if (!relationExpressionsEquivalent(parsed, current, relationState.variable)) {
      setMessage({ tone: 'growth', text: 'That expression is not equivalent. The relation was not changed.' });
      setRewriteFocusSignal((value) => value + 1);
      return;
    }

    if (compactText(parsed) === compactText(current)) {
      setMessage({ tone: 'growth', text: 'That is the same expression. Rewrite it in the form you want to use next.' });
      setRewriteFocusSignal((value) => value + 1);
      return;
    }

    const next = cloneRelationState(relationState);
    next.branches[activeBranch].expressions[rewriteIndex] = parsed;
    await commitState(
      next,
      `Student rewrite of expression ${rewriteIndex + 1} on Branch ${branchLabel(activeBranch)}`,
      'student-rewrite',
    );
    setRewriteValue('');
    setRewriteFocusSignal((value) => value + 1);
    setMessage({
      tone: 'success',
      text: 'Rewrite accepted. Click another expression to keep simplifying, or close the rewrite bar when you are done.',
    });
  };

  const finishCancellation = async (key, secondIndex, firstIndexOverride = null) => {
    const [branchText, expressionText] = String(key).split(':');
    const branchIndex = Number(branchText);
    const expressionIndex = Number(expressionText);
    const firstIndex = Number.isInteger(firstIndexOverride)
      ? firstIndexOverride
      : cancellationSelection[key];

    if (!Number.isInteger(firstIndex) || firstIndex === secondIndex) return;

    const expression = relationState.branches?.[branchIndex]?.expressions?.[expressionIndex];
    if (!expression) return;

    const result = cancelRelationExpressionPair(
      expression,
      firstIndex,
      secondIndex,
      relationState.variable,
    );

    if (!result.accepted) {
      setCancellationSelection((current) => ({ ...current, [key]: secondIndex }));
      setMessage({ tone: 'growth', text: result.reason });
      return;
    }

    const next = cloneRelationState(relationState);
    next.branches[branchIndex].expressions[expressionIndex] = result.resultExpression;
    await commitState(
      next,
      `Cancel matching ${result.kind === 'fraction' ? 'factors' : 'terms'} in expression ${expressionIndex + 1}`,
      'student-cancellation',
    );

    setMessage({
      tone: 'success',
      text: 'Cancellation complete. Only the pair you chose was removed; the rest of the expression was left intact.',
    });
  };

  const cancellationTokenPressed = async (branchIndex, expressionIndex, tokenIndex) => {
    if (disabled || relationState.special || rewriteOpen || pendingRelationFlip) return;
    if (Date.now() < suppressCancellationClickUntil.current) return;
    setActiveBranch(branchIndex);
    const key = expressionKey(branchIndex, expressionIndex);
    const current = cancellationSelection[key];

    if (!Number.isInteger(current)) {
      setCancellationSelection((state) => ({ ...state, [key]: tokenIndex }));
      return;
    }

    if (current === tokenIndex) {
      setCancellationSelection((state) => {
        const next = { ...state };
        delete next[key];
        return next;
      });
      return;
    }

    await finishCancellation(key, tokenIndex);
  };

  const cancellationDragStart = (branchIndex, expressionIndex, tokenIndex, event) => {
    if (disabled || relationState.special || rewriteOpen || pendingRelationFlip) return;
    const key = expressionKey(branchIndex, expressionIndex);
    const stroke = {
      id: `${key}:${tokenIndex}:${Date.now()}`,
      key,
      firstIndex: tokenIndex,
      startX: event?.clientX ?? 0,
      startY: event?.clientY ?? 0,
      x: event?.clientX ?? 0,
      y: event?.clientY ?? 0,
      moved: false,
    };
    setActiveBranch(branchIndex);
    setDragCancellationKey(key);
    dragStrokeRef.current = stroke;
    setDragStroke(stroke);
  };

  useEffect(() => {
    if (!dragStroke?.id) return undefined;

    const onPointerMove = (event) => {
      const current = dragStrokeRef.current;
      if (!current) return;
      const moved = current.moved
        || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 5;
      const next = { ...current, x: event.clientX, y: event.clientY, moved };
      dragStrokeRef.current = next;
      setDragStroke(next);
    };

    const onPointerUp = async (event) => {
      const current = dragStrokeRef.current;
      dragStrokeRef.current = null;
      setDragStroke(null);
      setDragCancellationKey(null);
      if (!current?.moved) return;

      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-cancel-key][data-cancel-index]');
      const hitKey = hit?.getAttribute?.('data-cancel-key');
      const hitIndex = Number(hit?.getAttribute?.('data-cancel-index'));
      if (hitKey === current.key && Number.isInteger(hitIndex) && hitIndex !== current.firstIndex) {
        suppressCancellationClickUntil.current = Date.now() + 250;
        await finishCancellation(current.key, hitIndex, current.firstIndex);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragStroke?.id]);

  const selectRewriteTarget = (branchIndex, expressionIndex) => {
    setActiveBranch(branchIndex);
    setRewriteIndex(expressionIndex);
    setRewriteValue('');
    setRewriteFocusSignal((value) => value + 1);
  };

  const chooseRelationSymbol = async (branchIndex, relationIndex, choice) => {
    const pending = pendingRelationFlip;
    if (!pending || pending.branchIndex !== branchIndex) return;
    const expected = pending.expectedRelations?.[relationIndex];
    if (choice !== expected) {
      setMessage({ tone: 'growth', text: 'That relation symbol does not keep the relation equivalent after your operation.' });
      return;
    }

    const next = cloneRelationState(relationState);
    next.branches[branchIndex].relations[relationIndex] = choice;
    setRelationState(next);
    setRelationPicker(null);

    const complete = next.branches[branchIndex].relations.every((relation, index) => (
      relation === pending.expectedRelations[index]
    ));

    if (complete) {
      setPendingRelationFlip(null);
      await persistStep(pending.before, next, pending.label, 'student-relation-direction');
      setMessage({ tone: 'success', text: 'Relation symbols accepted. Continue solving.' });
    } else {
      setMessage({ tone: 'growth', text: 'That symbol is equivalent. Finish the remaining relation symbol(s).' });
    }
  };

  const applyAbsoluteSplitChoice = async (structure) => {
    const result = buildAbsoluteValueSplit(relationState, activeBranch, structure);
    if (!result.ready) {
      setMessage({ tone: 'growth', text: result.reason });
      return;
    }
    await commitState(result.state, `Reverse absolute value as ${structure === 'or' ? 'OR branches' : 'an AND compound relation'}`, 'absolute-value-split');
    setAbsoluteSplitOpen(false);
    setMessage({ tone: 'success', text: 'Absolute-value structure accepted. Continue solving the relation you created.' });
  };

  const chooseOtherOperation = async (id) => {
    setOtherOpen(false);
    setRewriteOpen(false);

    if (id === 'completeSquare') {
      // Completing the square is a strategy choice, not an automatic algebra
      // transformation. Reuse the normal Add workflow so the student must:
      // 1) supply the value, 2) place it on both/all regions, 3) commit it,
      // and then 4) rewrite the trinomial as a square themselves.
      setCompleteSquareOpen(false);
      setCompleteSquareValue('');
      setOperation('add');
      setOperand('');
      setPlacementByKey({});
      setOperationFocusSignal((value) => value + 1);
      setMessage({
        tone: 'growth',
        text: 'Complete-the-square setup selected. Enter the value you chose to add, then place that addition on every side before committing it.',
      });
      return;
    }

    if (id === 'reverseAbsolute') {
      if (pendingRelationFlip) {
        setMessage({ tone: 'growth', text: 'Finish the relation symbols from the last operation first.' });
        return;
      }
      setAbsoluteSplitOpen(true);
      setMessage({
        tone: 'growth',
        text: 'Choose the equivalent structure yourself. MathMaster will check your OR/AND decision.',
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
        text: 'Your chosen value was added across the active equation. Rewrite the perfect-square form yourself when ready.',
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
    setPlacementByKey({});
    setRewriteOpen(false);
    setRewriteValue('');
    setOtherOpen(false);
    setCompleteSquareOpen(false);
    setCompleteSquareValue('');
    setCancellationSelection({});
    setDragCancellationKey(null);
    setDragStroke(null);
    dragStrokeRef.current = null;
    setPendingRelationFlip(null);
    setRelationPicker(null);
    setAbsoluteSplitOpen(false);
    setMessage(null);
    setRepresentationCorrect(null);
  };

  const active = relationState.branches?.[activeBranch] || null;

  const operationDock = !summary.solved
    && !relationState.special
    && !pendingRelationFlip
    ? (
      <div
        className="multi-relation-operation-dock"
        style={{
          width: 'min(100%, 820px)',
          margin: '8px auto',
          padding: '8px 10px',
          borderRadius: 12,
          border: '1px solid #d7e2f3',
          background: '#f8fbff',
          color: '#202124',
          colorScheme: 'light',
          boxShadow: '0 2px 8px rgba(23,78,166,.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {relationState.branches.length > 1 && (
            <span
              style={{
                minHeight: 32,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 9px',
                borderRadius: 999,
                background: '#e8f0fe',
                color: '#174ea6',
                fontSize: 11,
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              Working on Branch {branchLabel(activeBranch)}
            </span>
          )}

          {BASIC_OPERATIONS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                setOperation(item.id);
                setOperand('');
                setPlacementByKey({});
                setOperationFocusSignal((value) => value + 1);
                setOtherOpen(false);
              }}
              style={{
                ...buttonStyle(operation === item.id),
                minHeight: 34,
                padding: '5px 9px',
              }}
            >
              <span style={{ fontSize: 16, marginRight: 3 }}>{item.symbol}</span>
              {item.label}
            </button>
          ))}

          {operation && (
            <>
              <div
                style={{
                  flex: '1 1 220px',
                  minWidth: 180,
                  maxWidth: 280,
                }}
              >
                <MathInput
                  value={operand}
                  onChange={(value) => {
                    setOperand(value);
                    setPlacementByKey({});
                  }}
                  placeholder="Value"
                  ariaLabel={`${operation} value`}
                  toolProfile="algebra-operation"
                  compact
                  focusSignal={operationFocusSignal}
                />
              </div>

              <button
                type="button"
                onClick={applyOperation}
                disabled={explicitOperationPlacementMode && !explicitPlacementComplete}
                style={{
                  ...buttonStyle(true),
                  minHeight: 34,
                  padding: '5px 10px',
                  background: explicitOperationPlacementMode && !explicitPlacementComplete
                    ? '#9fb7df'
                    : '#174ea6',
                  color: '#fff',
                  cursor: explicitOperationPlacementMode && !explicitPlacementComplete
                    ? 'not-allowed'
                    : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Commit step
              </button>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 5,
            textAlign: 'center',
            fontSize: 10.5,
            color: '#667085',
            lineHeight: 1.3,
          }}
        >
          {explicitOperationPlacementMode
            ? operation === 'divide'
              ? `${explicitPlacementCount}/${activeExpressionCount} divisors placed`
              : operation === 'multiply'
                ? `${explicitPlacementCount}/${activeExpressionCount} multipliers placed`
                : `${explicitPlacementCount}/${activeExpressionCount} placements complete · click one term in each side and choose Before, Under, or After`
            : relationState.branches.length > 1
              ? 'Choose an operation for the active branch.'
              : active?.expressions?.length === 3
                ? 'Place the same balanced operation in all three regions.'
                : 'Place the balanced operation on both sides.'}
        </div>
      </div>
    )
    : null;

  return (
    <section style={{ maxWidth: 1120, margin: '0 auto', padding: '10px 10px 24px' }}>
      <QuestionPrompt>{question.prompt || 'Solve the equation or inequality.'}</QuestionPrompt>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'inline-flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={openRewrite}
            disabled={disabled || relationState.special}
            style={buttonStyle(rewriteOpen)}
          >
            Rewrite / Simplify
          </button>

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
            Other operations {otherOpen ? '▴' : '▾'}
          </button>

          <label
            style={{
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              minHeight: 36,
              padding: '5px 8px',
              color: '#5f6368',
              background: '#ffffff',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              colorScheme: 'light',
            }}
          >
            <input
              type="checkbox"
              style={{ accentColor: '#174ea6' }}
              checked={cancellationHintsEnabled}
              onChange={(event) => setCancellationHintsEnabled(event.target.checked)}
            />
            Cancellation hints
          </label>
        </div>

        <button type="button" onClick={reset} disabled={disabled} style={buttonStyle(false)}>
          Reset work
        </button>
      </div>

      {otherOpen && (
        <div
          className="algebra-other-operations-inline"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            margin: '-2px 0 9px',
            padding: '7px 9px',
            border: '1px solid #c8d5ea',
            borderRadius: 10,
            background: '#f8fbff',
            color: '#202124',
          }}
        >
          <span
            style={{
              color: '#5f6368',
              fontSize: 11,
              fontWeight: 800,
              marginRight: 2,
            }}
          >
            Algebra tools
          </span>

          {OTHER_ALGEBRA_OPERATIONS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => chooseOtherOperation(item.id)}
              disabled={disabled || relationState.special}
              style={{
                minHeight: 32,
                padding: '5px 9px',
                border: '1px solid #b8c8e3',
                borderRadius: 8,
                background: '#ffffff',
                color: '#174ea6',
                fontSize: 12,
                fontWeight: 800,
                cursor: disabled || relationState.special ? 'not-allowed' : 'pointer',
                opacity: disabled || relationState.special ? 0.6 : 1,
              }}
            >
              {item.label}
            </button>
          ))}

          <span
            style={{
              width: '100%',
              color: '#6b7280',
              fontSize: 10.5,
              lineHeight: 1.3,
            }}
          >
            These choices stay available from the beginning. MathMaster checks whether the selected operation is valid; it does not reveal when to use one.
          </span>
        </div>
      )}

      {rewriteOpen && active && (
        <div
          className="multi-relation-rewrite-compact"
          style={{
            display: 'flex',
            gap: 7,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 8,
            padding: '7px 9px',
            border: '1px solid #b8c8e3',
            borderRadius: 10,
            background: '#f8fbff',
          }}
        >
          <strong style={{ color: '#174ea6', fontSize: 13 }}>Rewrite</strong>
          <span
            style={{
              minHeight: 34,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 9px',
              borderRadius: 8,
              border: '1px solid #b8c8e3',
              background: '#fff',
              color: '#3c4756',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {active.expressions.length === 3
              ? ['Left region', 'Middle region', 'Right region'][rewriteIndex]
              : `Expression ${rewriteIndex + 1}`}
          </span>

          <div
            style={{ flex: '1 1 300px', minWidth: 220 }}
            onKeyDownCapture={(event) => {
              if (
                event.key !== 'Enter'
                || event.shiftKey
                || event.repeat
                || event.nativeEvent?.isComposing
              ) return;

              event.preventDefault();
              event.stopPropagation();
              void checkRewrite();
            }}
          >
            <MathInput
              value={rewriteValue}
              onChange={setRewriteValue}
              placeholder="Your equivalent expression"
              ariaLabel="Equivalent expression. Press Enter to check."
              toolProfile="algebra-operation"
              compact
              focusSignal={rewriteFocusSignal}
            />
          </div>

          <button
            type="button"
            onClick={checkRewrite}
            style={{ ...buttonStyle(true), background: '#174ea6', color: '#fff' }}
          >
            Check
          </button>
          <button type="button" onClick={() => setRewriteOpen(false)} style={buttonStyle(false)}>×</button>

          <span style={{ width: '100%', color: '#6b7280', fontSize: 11 }}>
            Click any expression below to select it. Type your equivalent expression, then press Enter or Check. MathMaster only checks it.
          </span>
        </div>
      )}

      {absoluteSplitOpen && (
        <div
          style={{
            display: 'flex',
            gap: 7,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 8,
            padding: '7px 9px',
            border: '1px solid #b8c8e3',
            borderRadius: 10,
            background: '#f8fbff',
          }}
        >
          <strong style={{ color: '#174ea6', fontSize: 13 }}>Reverse absolute value</strong>
          <button type="button" onClick={() => applyAbsoluteSplitChoice('or')} style={buttonStyle(false)}>
            Two branches (OR)
          </button>
          <button type="button" onClick={() => applyAbsoluteSplitChoice('and')} style={buttonStyle(false)}>
            Three-part compound (AND)
          </button>
          <button type="button" onClick={() => setAbsoluteSplitOpen(false)} style={buttonStyle(false)}>×</button>
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
                <div style={{ textAlign: 'center', fontWeight: 900, color: '#5f6368', marginBottom: 4 }}>
                  OR
                </div>
              )}

              {branchIndex === 1 && relationState.branches.length > 1 && operationDock}

              <div
                className={`multi-relation-branch ${activeBranch === branchIndex ? 'is-active' : ''}`}
                onClick={() => setActiveBranch(branchIndex)}
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
                }}
              >
                {branch.expressions.map((expression, expressionIndex) => {
                  const key = expressionKey(branchIndex, expressionIndex);
                  return (
                    <span
                      key={key}
                      onClick={(event) => {
                        if (!rewriteOpen) return;
                        event.stopPropagation();
                        selectRewriteTarget(branchIndex, expressionIndex);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 12,
                        maxWidth: '100%',
                        padding: rewriteOpen ? '4px' : 0,
                        borderRadius: 10,
                        outline: rewriteOpen && activeBranch === branchIndex && rewriteIndex === expressionIndex
                          ? '2px solid #8ab4f8'
                          : 'none',
                        background: rewriteOpen && activeBranch === branchIndex && rewriteIndex === expressionIndex
                          ? '#f1f7ff'
                          : 'transparent',
                        cursor: rewriteOpen ? 'text' : 'default',
                      }}
                    >
                      <span style={{ display: 'inline-grid', justifyItems: 'center', gap: 5 }}>
                        <RelationExpressionRegion
                          expression={expression}
                          variable={relationState.variable}
                          branchIndex={branchIndex}
                          expressionIndex={expressionIndex}
                          activeBranch={activeBranch === branchIndex}
                          cancellationHints={cancellationHintsEnabled}
                          selectedCancellationIndex={cancellationSelection[key]}
                          onCancellationToken={(tokenIndex) => cancellationTokenPressed(branchIndex, expressionIndex, tokenIndex)}
                          onCancellationDragStart={(tokenIndex, event) => cancellationDragStart(branchIndex, expressionIndex, tokenIndex, event)}
                          rewriteMode={rewriteOpen}
                          onRewriteTarget={() => selectRewriteTarget(branchIndex, expressionIndex)}
                          placementMode={activeBranch === branchIndex && placementMode}
                          placement={placementByKey[key] || null}
                          onPlacement={(placement) => {
                            setActiveBranch(branchIndex);
                            setPlacementByKey((current) => ({ ...current, [key]: placement }));
                          }}
                          operation={operation}
                          operandLatex={operand}
                        />

                        {activeBranch === branchIndex && wholeRelationPlacementMode && operation === 'divide' && (
                          <div
                            style={{
                              display: 'grid',
                              justifyItems: 'stretch',
                              minWidth: 100,
                              width: '100%',
                              gap: 3,
                              marginTop: 1,
                            }}
                          >
                            <div
                              className="staged-division-bar"
                              aria-hidden="true"
                              style={{
                                width: '100%',
                                minWidth: 86,
                                borderTop: '2px solid #174ea6',
                              }}
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPlacementByKey((current) => {
                                  const next = { ...current };
                                  if (next[key]?.kind === 'whole-operation') delete next[key];
                                  else next[key] = { kind: 'whole-operation' };
                                  return next;
                                });
                              }}
                              aria-pressed={placementByKey[key]?.kind === 'whole-operation'}
                              title="Place the divisor beneath this expression"
                              style={{
                                minHeight: 30,
                                padding: placementByKey[key]?.kind === 'whole-operation'
                                  ? '0 8px'
                                  : '3px 8px',
                                borderRadius: 7,
                                border: placementByKey[key]?.kind === 'whole-operation'
                                  ? '1px solid transparent'
                                  : '1px dashed #8ab4f8',
                                background: 'transparent',
                                color: '#174ea6',
                                colorScheme: 'light',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              {placementByKey[key]?.kind === 'whole-operation'
                                ? (
                                  <span style={{ fontSize: 20, color: '#202124' }}>
                                    <MathDisplay value={operand} format="latex" inline />
                                  </span>
                                )
                                : 'Place divisor'}
                            </button>
                          </div>
                        )}

                        {activeBranch === branchIndex && wholeRelationPlacementMode && operation === 'multiply' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPlacementByKey((current) => {
                                const next = { ...current };
                                if (next[key]?.kind === 'whole-operation') delete next[key];
                                else next[key] = { kind: 'whole-operation' };
                                return next;
                              });
                            }}
                            aria-pressed={placementByKey[key]?.kind === 'whole-operation'}
                            title="Place the multiplier on this expression"
                            style={{
                              minHeight: 30,
                              padding: '4px 9px',
                              borderRadius: 8,
                              border: placementByKey[key]?.kind === 'whole-operation'
                                ? '2px solid #174ea6'
                                : '1px dashed #8ab4f8',
                              background: placementByKey[key]?.kind === 'whole-operation'
                                ? '#e8f0fe'
                                : '#fff',
                              color: '#174ea6',
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            {placementByKey[key]?.kind === 'whole-operation'
                              ? <>✓ × <MathDisplay value={operand} format="latex" inline /></>
                              : 'Place multiplier'}
                          </button>
                        )}
                      </span>

                      {expressionIndex < branch.relations.length && (() => {
                        const relation = branch.relations[expressionIndex];
                        const needsChoice = pendingRelationFlip?.branchIndex === branchIndex
                          && pendingRelationFlip?.expectedRelations?.[expressionIndex] !== relation;
                        const pickerOpen = relationPicker?.branchIndex === branchIndex
                          && relationPicker?.relationIndex === expressionIndex;

                        if (!needsChoice) {
                          return (
                            <span style={{ fontSize: 30, fontWeight: 900, color: '#174ea6' }}>
                              {RELATION_GLYPH[relation] || relation}
                            </span>
                          );
                        }

                        return (
                          <span style={{ position: 'relative', display: 'inline-flex' }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setRelationPicker(pickerOpen ? null : { branchIndex, relationIndex: expressionIndex });
                              }}
                              aria-label="Choose relation symbol"
                              style={{
                                minWidth: 46,
                                minHeight: 44,
                                borderRadius: 9,
                                border: '2px solid #f9ab00',
                                background: '#fff8e1',
                                color: '#174ea6',
                                fontSize: 30,
                                fontWeight: 900,
                                cursor: 'pointer',
                              }}
                            >
                              {RELATION_GLYPH[relation] || relation}
                            </button>
                            {pickerOpen && (
                              <span
                                style={{
                                  position: 'absolute',
                                  zIndex: 40,
                                  top: 'calc(100% + 4px)',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  display: 'flex',
                                  gap: 4,
                                  padding: 5,
                                  borderRadius: 9,
                                  border: '1px solid #c8d5ea',
                                  background: '#fff',
                                  boxShadow: '0 6px 18px rgba(0,0,0,.15)',
                                }}
                              >
                                {['<', '<=', '>', '>='].map((choice) => (
                                  <button
                                    type="button"
                                    key={choice}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      chooseRelationSymbol(branchIndex, expressionIndex, choice);
                                    }}
                                    style={{ ...buttonStyle(false), minWidth: 38, padding: '4px 7px', fontSize: 18 }}
                                  >
                                    {RELATION_GLYPH[choice]}
                                  </button>
                                ))}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </span>
                  );
                })}
              </div>

              {relationState.branches.length > 1 && (
                <div style={{ textAlign: 'center', fontSize: 11, color: activeBranch === branchIndex ? '#174ea6' : '#6b7280', marginTop: 3 }}>
                  Branch {branchLabel(branchIndex)}{activeBranch === branchIndex ? ' · active' : ' · click to work here'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {relationState.branches.length === 1 && operationDock}

      <div style={{ marginTop: 6, color: '#6b7280', fontSize: 11, lineHeight: 1.35 }}>
        Cancellation works directly on visible matching opposite terms and common numerator/denominator factors.
        Click two items, or press and drag from one item into its matching partner. Turn on Cancellation hints only when you want visual cues.
      </div>

      {message && (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: message.tone === 'error'
              ? '#fce8e6'
              : message.tone === 'success'
                ? '#e6f4ea'
                : '#fef7e0',
            color: message.tone === 'error'
              ? '#a50e0e'
              : message.tone === 'success'
                ? '#137333'
                : '#7a4f00',
            fontWeight: 700,
          }}
        >
          {message.text}
        </div>
      )}

      {!pendingRelationFlip && summary.solved && summary.kind === 'exactValues' && (
        <div
          className="exact-symbolic-solution-complete"
          style={{
            marginTop: 14,
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid #b7dfc1',
            background: '#e6f4ea',
            color: '#137333',
            colorScheme: 'light',
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 900,
              marginBottom: 9,
              textAlign: 'center',
            }}
          >
            {summary.exactValues.length > 1
              ? 'Solved — all solution branches are complete.'
              : 'Solved — the target variable is isolated.'}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            {summary.exactValues.map((expression, index) => (
              <React.Fragment key={`${expression}-${index}`}>
                {index > 0 && (
                  <span
                    style={{
                      color: '#5f6368',
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    OR
                  </span>
                )}

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 10px',
                    borderRadius: 9,
                    background: '#ffffff',
                    border: '1px solid #c8e6cf',
                    color: '#202124',
                  }}
                >
                  <span style={{ fontSize: 24 }}>
                    <MathDisplay
                      value={expressionToLatex(relationState.variable)}
                      format="latex"
                      inline
                    />
                  </span>
                  <span style={{ color: '#174ea6', fontSize: 22, fontWeight: 900 }}>=</span>
                  <span style={{ fontSize: 24 }}>
                    <MathDisplay
                      value={relationExpressionToLatex(expression)}
                      format="latex"
                      inline
                    />
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>

          <div
            style={{
              marginTop: 9,
              textAlign: 'center',
              color: '#3c6b47',
              fontSize: 11.5,
              lineHeight: 1.4,
            }}
          >
            An equivalent simplified form is optional. MathMaster does not require extra radical, fraction, or literal-expression cleanup after the variable is isolated.
          </div>
        </div>
      )}

      {!pendingRelationFlip && summary.solved && summary.kind === 'values' && (
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: '#e6f4ea', color: '#137333', fontWeight: 800 }}>
          Solution{summary.values.length > 1 ? 's' : ''}: {summary.values.join(', ')}
        </div>
      )}

      {dragStroke?.moved && (
        <svg
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <line
            x1={dragStroke.startX}
            y1={dragStroke.startY}
            x2={dragStroke.x}
            y2={dragStroke.y}
            stroke="#7b61ff"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.78"
          />
        </svg>
      )}

      {!pendingRelationFlip && summary.solved && summary.kind === 'intervals' && (
        <div style={{ marginTop: 16 }}>
          <IntervalNumberLine
            questionData={{
              prompt: 'Graph your solved inequality and write the same solution in interval notation.',
              intervals: summary.intervals,
              ask: ['graph', 'interval'],
              variable: relationState.variable,
              min: numberLineConfig.min,
              max: numberLineConfig.max,
              step: numberLineConfig.step,
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
