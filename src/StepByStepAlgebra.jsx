import { useEffect, useMemo, useRef, useState } from 'react';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import QuestionPrompt from './QuestionPrompt';
import {
  applyBalancedOperation,
  describeOperation,
  equationToLatex,
  expressionToLatex,
  getSuggestedMove,
  isSolvedEquation,
  expressionsEquivalent,
  parseEquationInput,
} from './algebraAstEngine';
import { getAttemptsRemaining, normalizeQuestionRecord } from './attemptPolicy';

const OPERATIONS = [
  { id: 'add', symbol: '+', label: 'Add' },
  { id: 'subtract', symbol: '−', label: 'Subtract' },
  { id: 'multiply', symbol: 'a( )', label: 'Multiply by' },
  { id: 'divide', symbol: '÷', label: 'Divide' },
];

const getInitialEquation = (question, record) => {
  const saved = record?.algebraState?.equation;
  if (saved?.left && saved?.right) return saved;
  return parseEquationInput(question);
};

export default function StepByStepAlgebra({
  question,
  questionRecord,
  onStateChange,
  onStepGrade,
  onUndoStateChange,
  disabled = false,
  maximumAttempts = 3,
  draftKey = null,
}) {
  const normalizedRecord = normalizeQuestionRecord(questionRecord);
  const initialEquation = useMemo(() => getInitialEquation(question, normalizedRecord), [question]);
  const localDraftKey = draftKey ? `${draftKey}:step-algebra` : null;
  const savedDraft = useMemo(() => readQuestionDraft(localDraftKey, null), [localDraftKey]);
  const [equation, setEquation] = useState(savedDraft?.equation || initialEquation);
  const [mode, setMode] = useState(savedDraft?.mode || question.mode || 'rigorous');
  const [selectedOperation, setSelectedOperation] = useState(savedDraft?.selectedOperation || 'add');
  const [operand, setOperand] = useState(savedDraft?.operand || '2');
  const [pendingMove, setPendingMove] = useState(savedDraft?.pendingMove || null);
  const [crossedSides, setCrossedSides] = useState(savedDraft?.crossedSides || []);
  const [simplificationAnswers, setSimplificationAnswers] = useState(savedDraft?.simplificationAnswers || {});
  const [promptAnswers, setPromptAnswers] = useState(savedDraft?.promptAnswers || {});
  const [strikeStart, setStrikeStart] = useState(null);
  const [message, setMessage] = useState(null);
  const [dragOverSide, setDragOverSide] = useState(null);
  const [mirrorOrigin, setMirrorOrigin] = useState(null);
  const [shake, setShake] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [cancelAnimating, setCancelAnimating] = useState(false);
  const prefillAppliedRef = useRef(false);

  useEffect(() => {
    if (savedDraft) return;
    setEquation(getInitialEquation(question, normalizeQuestionRecord(questionRecord)));
    setMode(question.mode || 'rigorous');
    setPendingMove(null);
    setCrossedSides([]);
    setSimplificationAnswers({});
    setPromptAnswers({});
    setMessage(null);
  }, [question, savedDraft]);

  useEffect(() => {
    if (!question.prefillFirstStep || savedDraft || prefillAppliedRef.current || disabled) return;
    const suggestion = getSuggestedMove(initialEquation);
    if (!suggestion) return;
    try {
      const move = applyBalancedOperation({ equationState: initialEquation, operation: suggestion.operation, operand: String(suggestion.operand) });
      prefillAppliedRef.current = true;
      setEquation(move.simplified);
      setMessage({ tone: 'growth', text: `The first balanced step was pre-filled: ${describeOperation(suggestion.operation, suggestion.operand)}. Continue from the simplified equation.` });
    } catch {
      // A pre-filled anchor is optional and never blocks the question.
    }
  }, [question.prefillFirstStep, savedDraft, initialEquation, disabled]);

  useEffect(() => {
    writeQuestionDraft(localDraftKey, {
      equation,
      mode,
      selectedOperation,
      operand,
      pendingMove,
      crossedSides,
      simplificationAnswers,
      promptAnswers,
    });
  }, [localDraftKey, equation, mode, selectedOperation, operand, pendingMove, crossedSides, simplificationAnswers, promptAnswers]);

  useEffect(() => {
    const solved = isSolvedEquation(equation);
    const prompts = Array.isArray(question.algebraPrompts) ? question.algebraPrompts : [];
    const promptParts = prompts.map((prompt, index) => {
      const id = String(prompt.id || `algebra-prompt-${index + 1}`);
      const response = String(promptAnswers[id] || '');
      const accepted = prompt.acceptedExpressions || prompt.acceptedAnswers || (prompt.acceptedExpression ? [prompt.acceptedExpression] : []);
      const isComplete = response.trim() !== '';
      const isCorrect = isComplete && accepted.some((candidate) => expressionsEquivalent(response, candidate, equation.variable));
      return { id, label: prompt.label || prompt.prompt || `Algebraic prompt ${index + 1}`, isComplete, isCorrect, response };
    });
    const promptsComplete = promptParts.every((part) => part.isComplete);
    const promptsCorrect = promptParts.every((part) => part.isCorrect);
    onStateChange({
      isComplete: solved && promptsComplete,
      isCorrect: solved && promptsCorrect,
      responseKey: solved && promptsComplete ? `${equationToLatex(equation)}|${JSON.stringify(promptAnswers)}` : '',
      questionDetails: solved ? `Solved step-by-step: ${equationToLatex(equation)}. ${promptParts.map((part) => `${part.label}: ${part.response}`).join('; ')}` : `Current equation: ${equationToLatex(equation)}`,
      parts: [
        { id: 'algebra-objective', label: question.objective?.label || (equation.objective?.kind === 'slopeIntercept' ? 'Write in slope-intercept form' : `Isolate ${equation.objective?.variable || equation.variable}`), isComplete: solved, isCorrect: solved, response: equationToLatex(equation) },
        ...promptParts,
      ],
    });
  }, [equation, question, promptAnswers, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({
      canUndo: Boolean(pendingMove || crossedSides.length || Object.keys(simplificationAnswers).length),
      onUndo: () => {
        const answerKeys = Object.keys(simplificationAnswers);
        if (answerKeys.length) setSimplificationAnswers((current) => { const next = { ...current }; delete next[answerKeys[answerKeys.length - 1]]; return next; });
        else if (crossedSides.length) setCrossedSides((current) => current.slice(0, -1));
        else setPendingMove(null);
        setMessage({ tone: 'growth', text: 'The pending algebra action was undone before it changed your saved equation.' });
      },
      label: 'Undo the pending balanced operation or cancellation mark',
    });
    return () => onUndoStateChange?.(null);
  }, [pendingMove, crossedSides, simplificationAnswers, onUndoStateChange]);

  const triggerShake = () => {
    setShake(false);
    window.requestAnimationFrame(() => {
      setShake(true);
      window.setTimeout(() => setShake(false), 480);
    });
  };

  const saveStep = async ({ move, earned, possible, countsAttempt, accepted, equationAfter = equation }) => {
    if (!onStepGrade) return null;
    setSavingStep(true);
    try {
      return await onStepGrade({
        stepGrade: {
          kind: accepted ? 'balanced-operation' : 'rejected-operation',
          label: describeOperation(move.operation, move.operandExpression),
          mode,
          productive: move.productive,
          accepted,
          earned,
          possible,
          equationBefore: equationToLatex(equation),
          equationAfter: accepted ? equationToLatex(equationAfter) : equationToLatex(equation),
          expectedTotalPoints: Number(question.expectedStepPoints || 6),
        },
        countsAttempt,
        statePatch: accepted ? {
          algebraState: { equation: equationAfter, mode, stepNumber: Number(normalizedRecord.algebraState?.stepNumber || 0) + 1 },
          questionDetails: `Current equation: ${equationToLatex(equationAfter)}`,
        } : { questionDetails: `Rejected move: ${describeOperation(move.operation, move.operandExpression)}` },
      });
    } finally {
      setSavingStep(false);
    }
  };

  const commitMove = async (move) => {
    setCancelAnimating(true);
    window.setTimeout(async () => {
      const earned = move.productive ? 2 : mode === 'exploratory' ? 1 : 0;
      await saveStep({ move, earned, possible: 2, countsAttempt: false, accepted: true, equationAfter: move.simplified });
      setEquation(move.simplified);
      setPendingMove(null);
      setCrossedSides([]);
      setSimplificationAnswers({});
      setCancelAnimating(false);
      setMessage({
        tone: move.productive ? 'success' : 'growth',
        text: move.solved
          ? 'The cancellation is complete and the target form has been reached.'
          : move.productive
            ? 'The marked terms canceled. The other side simplified automatically while the equation stayed balanced.'
            : 'The equation stayed balanced, but the path became longer. Look for a cancellation on the next move.',
      });
    }, 620);
  };

  const attemptMove = async (operation = selectedOperation, originSide = 'left') => {
    if (disabled || savingStep || pendingMove) return;
    setMessage(null);
    let move;
    try {
      move = applyBalancedOperation({ equationState: equation, operation, operand });
    } catch (error) {
      triggerShake();
      setMessage({ tone: 'error', text: error.message });
      return;
    }
    setMirrorOrigin(originSide);
    setPendingMove(move);
    setCrossedSides([]);
    setSimplificationAnswers({});

    if (!move.preservesSolution) {
      triggerShake();
      setMessage({ tone: 'error', text: 'That move would not preserve the original solution set.' });
      window.setTimeout(() => setPendingMove(null), 700);
      return;
    }

    if (mode === 'rigorous' && !move.productive) {
      window.setTimeout(async () => {
        triggerShake();
        const result = await saveStep({ move, earned: 0, possible: 1, countsAttempt: true, accepted: false });
        setPendingMove(null);
        setMessage({ tone: 'error', text: result?.expired ? 'That was the third unproductive move. This version has expired.' : `The mirrored move was balanced, but it did not cancel or isolate anything. ${result?.remainingAttempts ?? getAttemptsRemaining(normalizedRecord, maximumAttempts)} rigorous attempts remain.` });
      }, 850);
      return;
    }

    if (move.requiredCancellationSides.length === 0) {
      setMessage({ tone: 'growth', text: 'The operation is mirrored on both sides. No zero pair or identity pair was created, so simplify each side using the algebraic response fields.' });
    } else {
      setMessage({ tone: 'success', text: 'The operation appeared on both sides instantly. Draw a line only through the side containing the zero pair or identity pair. Simplify the other side in its response field.' });
    }
  };

  const strikeSide = async (side, distance) => {
    if (!pendingMove || cancelAnimating || distance < 44) return;
    const valid = pendingMove.requiredCancellationSides.includes(side);
    if (!valid) {
      triggerShake();
      if (mode === 'rigorous') {
        const result = await saveStep({ move: pendingMove, earned: 0, possible: 1, countsAttempt: true, accepted: false });
        setMessage({ tone: 'error', text: result?.expired ? 'The third invalid cancellation used the final attempt.' : `That side simplifies, but those items do not cancel. ${result?.remainingAttempts ?? getAttemptsRemaining(normalizedRecord, maximumAttempts)} rigorous attempts remain.` });
        if (result?.expired) setPendingMove(null);
      } else setMessage({ tone: 'growth', text: 'That is not the cancellation pair. Try drawing through the inverse pair on the other side.' });
      return;
    }
    const next = [...new Set([...crossedSides, side])];
    setCrossedSides(next);
    const allRequired = pendingMove.requiredCancellationSides.every((requiredSide) => next.includes(requiredSide));
    if (allRequired) {
      if (pendingMove.simplificationTargets?.length) setMessage({ tone: 'success', text: 'The cancellation is marked. Now simplify the other side using the algebraic response field.' });
      else await commitMove(pendingMove);
    }
  };

  const checkSimplifications = async () => {
    if (!pendingMove || savingStep) return;
    const targets = pendingMove.simplificationTargets || [];
    const missing = targets.filter((target) => !String(simplificationAnswers[target.side] || '').trim());
    if (missing.length) {
      setMessage({ tone: 'error', text: `Complete the ${missing.map((target) => target.label.toLowerCase()).join(' and ')} simplification response.` });
      return;
    }
    const incorrect = targets.filter((target) => !expressionsEquivalent(simplificationAnswers[target.side], target.simplifiedExpression, equation.variable));
    if (incorrect.length) {
      triggerShake();
      if (mode === 'rigorous') {
        const result = await saveStep({ move: pendingMove, earned: 0, possible: 1, countsAttempt: true, accepted: false });
        setMessage({ tone: 'error', text: result?.expired ? 'The third incorrect simplification used the final attempt.' : `Revise the ${incorrect.map((target) => target.label.toLowerCase()).join(' and ')} simplification. Algebraically equivalent forms are accepted.` });
      } else {
        setMessage({ tone: 'growth', text: `The balanced move remains available. Revise the ${incorrect.map((target) => target.label.toLowerCase()).join(' and ')} expression; equivalent algebraic forms are accepted.` });
      }
      return;
    }
    const cancellationsComplete = pendingMove.requiredCancellationSides.every((side) => crossedSides.includes(side));
    if (!cancellationsComplete) {
      setMessage({ tone: 'error', text: 'The simplification is correct. Draw through the zero pair or identity pair before completing this step.' });
      return;
    }
    await commitMove(pendingMove);
  };

  const suggestedMove = getSuggestedMove(equation);
  const attemptsRemaining = getAttemptsRemaining(normalizedRecord, maximumAttempts);
  const solved = isSolvedEquation(equation);
  const objectiveLabel = equation.objective?.kind === 'slopeIntercept'
    ? 'Target: y = mx + b'
    : `Target: isolate ${equation.objective?.variable || equation.variable}${equation.objective?.simplifyRequired ? ' and simplify' : ''}`;

  const displayedSideLatex = (side) => pendingMove ? pendingMove.unsimplifiedLatex[side] : expressionToLatex(equation[side]);

  return (
    <section className={shake ? 'algebra-shake' : ''} style={{ maxWidth: '960px', margin: '0 auto', padding: '10px 10px 24px', textAlign: 'left' }}>
      <QuestionPrompt>{question.prompt || 'Solve the equation by keeping both sides balanced.'}</QuestionPrompt>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', background: mode === 'exploratory' ? '#e8f0fe' : '#f3e8fd', color: mode === 'exploratory' ? '#174ea6' : '#681da8', fontWeight: 'bold' }}>{mode === 'exploratory' ? 'Exploratory / Growth Mode' : 'Rigorous / Attempts Mode'}</div>
        <div style={{ padding: '8px 12px', borderRadius: '999px', background: '#e6f4ea', color: '#137333', fontWeight: 'bold' }}>{objectiveLabel}</div>
      </div>

      {Array.isArray(question.algebraPrompts) && question.algebraPrompts.length > 0 && (
        <div style={{ marginBottom: '16px', padding: '15px', borderRadius: '12px', border: '1px solid #d9e2f1', background: '#fff' }}>
          <h3 style={{ margin: '0 0 6px', color: '#174ea6' }}>Algebraic micro-questions</h3>
          <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: '13px' }}>These responses accept algebraic expressions, including equivalent distributed or factored forms.</p>
          <div style={{ display: 'grid', gap: '12px' }}>
            {question.algebraPrompts.map((prompt, index) => {
              const id = String(prompt.id || `algebra-prompt-${index + 1}`);
              return <div key={id} style={{ padding: '12px', borderRadius: '10px', background: '#f8fbff', border: '1px solid #c5d5ef' }}><strong style={{ display: 'block', marginBottom: '8px' }}>{prompt.prompt || prompt.label || `Simplify expression ${index + 1}`}</strong>{prompt.expression && <div style={{ marginBottom: '8px', fontSize: '22px' }}><MathDisplay value={prompt.expression} /></div>}<MathInput value={promptAnswers[id] || ''} onChange={(value) => setPromptAnswers((current) => ({ ...current, [id]: value }))} placeholder="Algebraic expression" /></div>;
            })}
          </div>
        </div>
      )}

      <div aria-label="Interactive algebra balance scale" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 76px minmax(0, 1fr)', alignItems: 'stretch', gap: '12px', padding: '20px', borderRadius: '18px', border: '2px solid #c5d5ef', background: 'linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)', boxShadow: '0 10px 24px rgba(31,73,125,0.12)' }}>
        {['left', 'right'].map((side, index) => {
          const target = pendingMove?.cancellationTargets.find((item) => item.side === side);
          const crossed = crossedSides.includes(side);
          return (
            <div key={side} onDragOver={(event) => { event.preventDefault(); setDragOverSide(side); }} onDragLeave={() => setDragOverSide(null)} onDrop={(event) => { event.preventDefault(); setDragOverSide(null); attemptMove(event.dataTransfer.getData('text/algebra-operation') || selectedOperation, side); }} style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 1, minHeight: '210px', padding: '18px 12px', borderRadius: '14px', border: dragOverSide === side ? '4px solid #00a6a6' : '2px solid #9fb8dd', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s ease', position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#5f6368', textTransform: 'uppercase' }}>{side} side</div>
              <MathDisplay value={displayedSideLatex(side)} format="latex" style={{ fontSize: '32px', margin: '16px 0' }} />
              {pendingMove && <div className={`algebra-mirror-chip ${mirrorOrigin !== side ? 'algebra-mirror-arrive' : ''}`}>{pendingMove.operationLabel} {pendingMove.operandExpression}</div>}
              {pendingMove && target && (
                <div onPointerDown={target.canCancel ? (event) => setStrikeStart({ side, x: event.clientX, y: event.clientY }) : undefined} onPointerUp={target.canCancel ? (event) => { const start = strikeStart; setStrikeStart(null); if (start?.side === side) strikeSide(side, Math.hypot(event.clientX - start.x, event.clientY - start.y)); } : undefined} style={{ position: 'relative', width: 'min(92%, 360px)', marginTop: '12px', padding: '13px', borderRadius: '10px', border: target.canCancel ? '2px dashed #f9ab00' : '1px solid #d9e2f1', background: target.canCancel ? '#fff9e6' : '#f8f9fa', textAlign: 'center', touchAction: 'none', cursor: target.canCancel ? 'crosshair' : 'default', userSelect: 'none' }}>
                  <div style={{ fontSize: '11px', color: '#5f6368', fontWeight: 'bold', marginBottom: '5px' }}>{target.canCancel ? 'Draw through the zero pair or identity pair' : 'Simplify this side in the response field below'}</div>
                  <MathDisplay value={target.latex} format="latex" style={{ fontSize: '22px' }} />
                  {crossed && target.canCancel && <div className={cancelAnimating ? 'algebra-cancel-fade' : ''} style={{ position: 'absolute', left: '9%', right: '9%', top: '58%', height: '4px', borderRadius: '999px', background: '#d93025', transform: 'rotate(-5deg)', boxShadow: '0 0 0 2px rgba(255,255,255,0.7)' }} />}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ gridColumn: 2, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '50px', fontWeight: 800, color: '#174ea6' }} aria-label="equals">=</div>
        <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '8px', height: '8px', borderRadius: '999px', background: '#6d7f99' }} />
      </div>

      {pendingMove && pendingMove.simplificationTargets?.length > 0 && (
        <div style={{ margin: '16px 0', padding: '15px', borderRadius: '12px', border: '1px solid #d9e2f1', background: '#fff' }}>
          <h3 style={{ margin: '0 0 6px', color: '#174ea6' }}>Simplify the side(s) without a cancellation pair</h3>
          <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: '13px' }}>Enter a number or algebraic expression. Equivalent forms are accepted, including distributed or factored forms when they are equal.</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(2, pendingMove.simplificationTargets.length)}, minmax(0, 1fr))`, gap: '12px' }}>
            {pendingMove.simplificationTargets.map((target) => (
              <div key={target.side} style={{ padding: '12px', borderRadius: '10px', background: '#f8fbff', border: '1px solid #c5d5ef' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>{target.label}: simplify</strong>
                <MathInput value={simplificationAnswers[target.side] || ''} onChange={(value) => setSimplificationAnswers((current) => ({ ...current, [target.side]: value }))} placeholder="Simplified expression" />
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '12px' }}><button type="button" onClick={checkSimplifications} disabled={savingStep} style={{ padding: '10px 17px', border: 'none', borderRadius: '8px', background: '#188038', color: '#fff', fontWeight: 'bold' }}>Check Simplification and Complete Step</button></div>
        </div>
      )}

      <div style={{ margin: '18px 0', padding: '13px', borderRadius: '12px', border: '2px dashed #9fb8dd', background: '#fff', textAlign: 'center', color: '#174ea6', fontWeight: 'bold' }}>Drag the operation tile to either side. A mirrored copy appears on the opposite side automatically.</div>
      <div className="algebra-operation-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(105px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        {OPERATIONS.map((operation) => <button type="button" key={operation.id} onClick={() => setSelectedOperation(operation.id)} disabled={disabled || savingStep || Boolean(pendingMove)} style={{ minHeight: '72px', borderRadius: '12px', border: selectedOperation === operation.id ? '3px solid #1a73e8' : '1px solid #b8c8df', background: selectedOperation === operation.id ? '#e8f0fe' : '#fff', color: '#202124', fontWeight: 'bold', fontSize: '15px' }}><span style={{ display: 'block', fontSize: '28px', lineHeight: 1 }}>{operation.symbol}</span>{operation.label}</button>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'end', gap: '12px', flexWrap: 'wrap', padding: '16px', border: '1px solid #d9e2f1', borderRadius: '12px', background: '#f8fbff' }}>
        <label style={{ flex: '1 1 260px', fontWeight: 'bold', color: '#3c4043' }}>Operation expression<input value={operand} onChange={(event) => setOperand(event.target.value)} placeholder="Examples: 2, -3, 1/2, b, 3x" disabled={disabled || savingStep || Boolean(pendingMove)} style={{ display: 'block', width: '100%', marginTop: '7px', padding: '12px', fontSize: '18px', borderRadius: '8px', border: '2px solid #9fb8dd', boxSizing: 'border-box' }} /></label>
        <button type="button" draggable={!disabled && !pendingMove} onDragStart={(event) => event.dataTransfer.setData('text/algebra-operation', selectedOperation)} onClick={() => attemptMove(selectedOperation, 'left')} disabled={disabled || savingStep || Boolean(pendingMove)} style={{ padding: '13px 18px', border: 'none', borderRadius: '9px', background: disabled || savingStep || pendingMove ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 'bold', cursor: disabled || savingStep || pendingMove ? 'not-allowed' : 'grab' }}>Drag or Apply {OPERATIONS.find((item) => item.id === selectedOperation)?.label} {operand}</button>
      </div>

      {pendingMove?.assumption && <p style={{ color: '#8a5a00', fontWeight: 'bold' }}>Required assumption: <MathDisplay value={pendingMove.assumption} inline /></p>}
      {question.showHint !== false && suggestedMove && !solved && <details style={{ marginTop: '14px', color: '#5f6368' }}><summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Need a strategic hint?</summary><p style={{ margin: '8px 0 0' }}>Look for a move that cancels a term: {describeOperation(suggestedMove.operation, suggestedMove.operand)}.</p></details>}
      {message && <div role="status" style={{ marginTop: '16px', padding: '13px 15px', borderRadius: '10px', background: message.tone === 'success' ? '#e6f4ea' : message.tone === 'growth' ? '#fef7e0' : '#fce8e6', color: message.tone === 'success' ? '#137333' : message.tone === 'growth' ? '#8a5a00' : '#c5221f', fontWeight: 'bold' }}>{message.text}</div>}
      {mode === 'rigorous' && <p style={{ color: '#5f6368', fontSize: '13px', marginTop: '12px' }}>Rigorous attempts remaining: <strong>{attemptsRemaining}</strong>. Unproductive operations and invalid cancellation marks use attempts.</p>}
    </section>
  );
}
