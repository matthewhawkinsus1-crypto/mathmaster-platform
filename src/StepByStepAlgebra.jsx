import { useEffect, useMemo, useRef, useState } from 'react';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import QuestionPrompt from './QuestionPrompt';
import AlgebraTermRow from './AlgebraTermRow';
import {
  applyBalancedOperation,
  describeOperation,
  equationToLatex,
  expressionToLatex,
  describeOperationToken,
  getSuggestedMove,
  isSolvedEquation,
  expressionsEquivalent,
  parseEquationInput,
  splitAdditiveTerms,
} from './algebraAstEngine';
import { getAttemptsRemaining, normalizeQuestionRecord } from './attemptPolicy';
import {
  evaluateMove, getSupportPolicy, resolveEquationAfterMove, resolveSupportLevel,
} from './algebraSupportLevels';

const OPERATIONS = [
  { id: 'add', symbol: '+', label: 'Add' },
  { id: 'subtract', symbol: '−', label: 'Subtract' },
  { id: 'multiply', symbol: '×', label: 'Multiply by' },
  { id: 'divide', symbol: '÷', label: 'Divide by' },
];

/**
 * Returns `{ equation, error }` rather than throwing.
 *
 * parseEquationInput throws for anything it cannot read as a single linear
 * equation, and this runs inside a render-time useMemo — so a blueprint with a
 * malformed or missing equation used to take down the whole question screen
 * with a blank page. A student cannot fix the blueprint, so the useful
 * behaviour is to say so plainly and let them move on.
 */
export const getInitialEquation = (question, record) => {
  const saved = record?.algebraState?.equation;
  if (saved?.left && saved?.right) return { equation: saved, error: null };
  try {
    return { equation: parseEquationInput(question), error: null };
  } catch (error) {
    return { equation: null, error: error?.message || 'This equation could not be read.' };
  }
};

const isFactorOperation = (operation) => operation === 'multiply' || operation === 'divide';

// Best-effort, presentation-only: given the "before" terms of a side flagged
// as cancellable and the known "after" simplified expression, find which two
// terms combine away. Falls back gracefully (returns null) for anything this
// simple search can't confirm — the caller then just skips the per-term
// strike decoration and keeps the existing whole-box cancellation gesture,
// which always works regardless of this helper's result.
const findCancellingPairIndices = (terms, targetExpression, variable) => {
  if (!terms || terms.length < 2) return null;
  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const remainderText = terms
        .filter((_, index) => index !== i && index !== j)
        .map((term) => term.text)
        .join(' ') || '0';
      try {
        if (expressionsEquivalent(remainderText, targetExpression, variable)) return [i, j];
      } catch {
        // Not a valid pairing to test; keep searching.
      }
    }
  }
  return null;
};

/**
 * The chip a student drags. A fraction is stacked with a real horizontal rule
 * rather than written with a slash, because that is what a fraction looks like.
 */
function OperationChip({ token }) {
  if (!token) return null;
  if (token.kind === 'fraction') {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.05 }}>
        <span style={{ minWidth: '18px', height: '11px' }} />
        <span style={{ width: '100%', minWidth: '22px', height: '2px', background: 'currentColor' }} />
        <span>{token.operand}</span>
      </span>
    );
  }
  if (token.kind === 'factor') {
    return <span>{token.operand}<span style={{ opacity: 0.55 }}>(&thinsp;)</span></span>;
  }
  return <span>{token.text}</span>;
}

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
  const initialParse = useMemo(() => getInitialEquation(question, normalizedRecord), [question]);
  const initialEquation = initialParse.equation;
  const parseError = initialParse.error;
  const localDraftKey = draftKey ? `${draftKey}:step-algebra` : null;
  const savedDraft = useMemo(() => readQuestionDraft(localDraftKey, null), [localDraftKey]);
  const [equation, setEquation] = useState(savedDraft?.equation || initialEquation);
  // One 1-5 support scale. `resolveSupportLevel` also reads the old
  // rigorous/exploratory values, so saved drafts and old assignment JSON keep
  // working without a migration pass.
  const [supportLevel, setSupportLevel] = useState(
    () => resolveSupportLevel({ workspaceDifficulty: savedDraft?.supportLevel ?? savedDraft?.mode ?? question.workspaceDifficulty ?? question.mode }),
  );
  const supportPolicy = getSupportPolicy(supportLevel);
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
  const [armedTile, setArmedTile] = useState(null); // { operation, side }
  const [heldToken, setHeldToken] = useState(null); // { x, y, label }
  const [mirrorToken, setMirrorToken] = useState(null); // { x, y, label } | null
  // Cues default to what the level says, and the student may still turn them
  // off. A level 4/5 workspace starts quiet rather than starting loud.
  const [cancellationHintsEnabled, setCancellationHintsEnabled] = useState(
    () => getSupportPolicy(resolveSupportLevel({ workspaceDifficulty: question.workspaceDifficulty ?? question.mode })).showCancellationHints,
  );
  const [factorZoneHint, setFactorZoneHint] = useState(null); // { side, position } | null
  const [manualSelection, setManualSelection] = useState(null); // { side, index } | null
  const prefillAppliedRef = useRef(false);
  const dragRef = useRef(null); // { operation, label, pointerId }
  const dragOverSideRef = useRef(null);
  const factorZoneRef = useRef(null);
  const rafRef = useRef(null);
  const latestPointerRef = useRef(null);
  const equalsRef = useRef(null);
  const leftSideRef = useRef(null);
  const rightSideRef = useRef(null);
  const leftRailRef = useRef(null);
  const rightRailRef = useRef(null);
  const leftFactorWrapRef = useRef(null);
  const rightFactorWrapRef = useRef(null);
  const leftFactorBarRef = useRef(null);
  const rightFactorBarRef = useRef(null);

  useEffect(() => {
    if (savedDraft) return;
    // getInitialEquation returns { equation, error }, not an equation. Putting
    // the wrapper into state left `equation.left` undefined on every question
    // change that had no saved draft — which is every fresh question after the
    // first — and the workspace rendered empty.
    setEquation(getInitialEquation(question, normalizeQuestionRecord(questionRecord)).equation);
    setSupportLevel(resolveSupportLevel({ workspaceDifficulty: question.workspaceDifficulty ?? question.mode }));
    setPendingMove(null);
    setCrossedSides([]);
    setSimplificationAnswers({});
    setPromptAnswers({});
    setManualSelection(null);
    setMessage(null);
    setArmedTile(null);
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
      supportLevel,
      operand,
      pendingMove,
      crossedSides,
      simplificationAnswers,
      promptAnswers,
    });
  }, [localDraftKey, equation, supportLevel, operand, pendingMove, crossedSides, simplificationAnswers, promptAnswers]);

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
        setManualSelection(null);
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
          supportLevel,
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
          algebraState: { equation: equationAfter, supportLevel, stepNumber: Number(normalizedRecord.algebraState?.stepNumber || 0) + 1 },
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
      const verdict = evaluateMove(move, supportLevel);
      // Valid work earns something even when it was the long way round. Only an
      // equivalence-breaking move earns nothing, and those never reach here.
      const earned = verdict.efficient ? 2 : verdict.valid ? 1 : 0;
      await saveStep({ move, earned, possible: 2, countsAttempt: false, accepted: true, equationAfter: move.simplified });
      // F4: above Guided, the side the student did not cancel keeps its
      // operation visible — 21 - 6, not 15 — because doing that arithmetic for
      // them removes the step the exercise is about.
      setEquation(resolveEquationAfterMove(move, supportLevel, crossedSides));
      setPendingMove(null);
      setCrossedSides([]);
      setSimplificationAnswers({});
      setManualSelection(null);
      setCancelAnimating(false);
      setMessage({
        tone: move.productive ? 'success' : 'growth',
        text: move.solved
          ? 'The cancellation is complete and the target form has been reached.'
          : move.productive
            ? supportPolicy.autoSimplifyOppositeSide
              ? 'The marked terms canceled. The other side simplified automatically while the equation stayed balanced.'
              : 'The marked terms canceled. Now simplify the other side yourself.'
            : verdict.message,
      });
    }, 620);
  };

  const attemptMove = async (operation, originSide = 'left') => {
    if (disabled || savingStep || pendingMove || !operation) return;
    setMessage(null);
    let move;
    try {
      move = applyBalancedOperation({ equationState: equation, operation, operand });
    } catch (error) {
      triggerShake();
      setMessage({ tone: 'error', text: error.message });
      return;
    }
    setArmedTile(null);
    setMirrorOrigin(originSide);
    setPendingMove(move);
    setCrossedSides([]);
    setSimplificationAnswers({});
    setManualSelection(null);

    if (!move.preservesSolution) {
      triggerShake();
      setMessage({ tone: 'error', text: 'That move would not preserve the original solution set.' });
      window.setTimeout(() => setPendingMove(null), 700);
      return;
    }

    // F3. An inefficient move is NOT rejected. It is valid algebra by a longer
    // road, so it is applied and described; at levels 3 and 4 it also costs an
    // attempt, which is a pacing decision rather than a verdict on the maths.
    const verdict = evaluateMove(move, supportLevel);
    if (verdict.countsAttempt) {
      const result = await saveStep({ move, earned: 1, possible: 2, countsAttempt: true, accepted: true });
      if (result?.expired) {
        setPendingMove(null);
        setMessage({ tone: 'error', text: 'That used the final attempt on this version.' });
        return;
      }
      setMessage({ tone: 'growth', text: `${verdict.message} ${result?.remainingAttempts ?? getAttemptsRemaining(normalizedRecord, maximumAttempts)} attempts remain at this level.` });
    }

    if (move.requiredCancellationSides.length === 0) {
      setMessage({ tone: 'growth', text: 'The operation is mirrored on both sides. No zero pair or identity pair was created, so simplify each side using the algebraic response fields.' });
    } else {
      setMessage({ tone: cancellationHintsEnabled ? 'success' : 'growth', text: cancellationHintsEnabled ? 'The operation appeared on both sides instantly. Draw a line only through the side containing the zero pair or identity pair. Simplify the other side in its response field.' : 'The operation appeared on both sides instantly. Look for a zero pair or identity pair and draw a line through it yourself — cancellation hints are turned off.' });
    }
  };

  const strikeSide = async (side, distance) => {
    if (!pendingMove || cancelAnimating || distance < 44) return;
    const valid = pendingMove.requiredCancellationSides.includes(side);
    if (!valid) {
      triggerShake();
      if (supportPolicy.inefficientMoveCostsAttempt) {
        const result = await saveStep({ move: pendingMove, earned: 0, possible: 1, countsAttempt: true, accepted: false });
        setMessage({ tone: 'error', text: result?.expired ? 'The third invalid cancellation used the final attempt.' : `That side simplifies, but those items do not cancel. ${result?.remainingAttempts ?? getAttemptsRemaining(normalizedRecord, maximumAttempts)} attempts remain.` });
        if (result?.expired) { setPendingMove(null); setManualSelection(null); }
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

  // Click one term, then click its match, as an always-available alternative
  // to the swipe gesture — works whether cancellation hints are on or off,
  // and is easier for keyboard/switch-access students than a swipe distance.
  const handleTermClick = (side, index, pairIndices) => {
    if (!pendingMove || cancelAnimating) return;
    if (!manualSelection) {
      setManualSelection({ side, index });
      setMessage({ tone: 'growth', text: 'Selected. Click the matching term to cancel it out.' });
      return;
    }
    if (manualSelection.side === side && manualSelection.index === index) {
      setManualSelection(null);
      return;
    }
    if (manualSelection.side !== side) {
      setMessage({ tone: 'growth', text: 'Pick two terms on the same side to cancel.' });
      return;
    }
    const isMatch = Boolean(pairIndices) && pairIndices.includes(manualSelection.index) && pairIndices.includes(index);
    setManualSelection(null);
    if (isMatch) {
      strikeSide(side, 999);
    } else {
      setMessage({ tone: 'growth', text: 'Those do not cancel — try a different pair.' });
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
      if (supportPolicy.inefficientMoveCostsAttempt) {
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

  // --- Pointer-drag: a live mirror-ghost token that crosses to the opposite
  // side as the held token nears the centerline, capped at the rail edge.
  // This is purely a visual layer on top of attemptMove — the same function
  // that the keyboard "Apply" button and native drag-and-drop already call.

  // For multiply/divide, only a specific spot solidifies the move: either
  // edge of the parentheses for multiply, or the fraction bar itself for
  // divide. Anywhere else on that side is "explorable" — it highlights but
  // does not commit, so the student learns the correct target visually.
  const updateFactorZones = (clientX, clientY) => {
    const operation = dragRef.current?.operation;
    const threshold = 42;
    const candidates = [];
    ['left', 'right'].forEach((side) => {
      if (operation === 'multiply') {
        const wrapRect = (side === 'left' ? leftFactorWrapRef : rightFactorWrapRef).current?.getBoundingClientRect();
        if (wrapRect) {
          candidates.push({ side, position: 'before', x: wrapRect.left, y: wrapRect.top + wrapRect.height / 2 });
          candidates.push({ side, position: 'after', x: wrapRect.right, y: wrapRect.top + wrapRect.height / 2 });
        }
      } else {
        const barRect = (side === 'left' ? leftFactorBarRef : rightFactorBarRef).current?.getBoundingClientRect();
        if (barRect) candidates.push({ side, position: 'bar', x: barRect.left + barRect.width / 2, y: barRect.top + barRect.height / 2, halfWidth: barRect.width / 2 });
      }
    });

    let nearest = null;
    let nearestDist = Infinity;
    candidates.forEach((candidate) => {
      const dx = Math.abs(clientX - candidate.x);
      const dy = Math.abs(clientY - candidate.y);
      const withinX = dx < (candidate.halfWidth ?? threshold);
      const withinY = dy < threshold;
      if (withinX && withinY) {
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) { nearestDist = dist; nearest = candidate; }
      }
    });
    factorZoneRef.current = nearest;
    setFactorZoneHint(nearest);

    const leftRect = leftSideRef.current?.getBoundingClientRect();
    const rightRect = rightSideRef.current?.getBoundingClientRect();
    const overLeft = leftRect && clientX >= leftRect.left && clientX <= leftRect.right && clientY >= leftRect.top && clientY <= leftRect.bottom;
    const overRight = rightRect && clientX >= rightRect.left && clientX <= rightRect.right && clientY >= rightRect.top && clientY <= rightRect.bottom;
    const side = overLeft ? 'left' : overRight ? 'right' : null;
    dragOverSideRef.current = side;
    setDragOverSide(side);
  };

  const updateWholeSideZone = (clientX, clientY) => {
    const leftRect = leftSideRef.current?.getBoundingClientRect();
    const rightRect = rightSideRef.current?.getBoundingClientRect();
    const overLeft = leftRect && clientX >= leftRect.left && clientX <= leftRect.right && clientY >= leftRect.top && clientY <= leftRect.bottom;
    const overRight = rightRect && clientX >= rightRect.left && clientX <= rightRect.right && clientY >= rightRect.top && clientY <= rightRect.bottom;
    const side = overLeft ? 'left' : overRight ? 'right' : null;
    dragOverSideRef.current = side;
    setDragOverSide(side);
  };

  const updatePointerVisuals = (clientX, clientY) => {
    const equalsRect = equalsRef.current?.getBoundingClientRect();
    const leftRailRect = leftRailRef.current?.getBoundingClientRect();
    const rightRailRect = rightRailRef.current?.getBoundingClientRect();
    if (equalsRect && leftRailRect && rightRailRect) {
      const lineX = equalsRect.left + equalsRect.width / 2;
      const heldSide = clientX < lineX ? 'left' : 'right';
      const nearRailInner = heldSide === 'left' ? leftRailRect.right : rightRailRect.left;
      const pastNearBorder = heldSide === 'left' ? clientX > nearRailInner : clientX < nearRailInner;
      if (pastNearBorder) {
        const progress = clientX - nearRailInner;
        const mirrorX = Math.max(leftRailRect.right, Math.min(rightRailRect.left, lineX + progress));
        setMirrorToken({ x: mirrorX, y: clientY, label: dragRef.current?.label || '' });
      } else {
        setMirrorToken(null);
      }
    }

    if (isFactorOperation(dragRef.current?.operation)) updateFactorZones(clientX, clientY);
    else updateWholeSideZone(clientX, clientY);
  };

  const beginPointerDrag = (operation, event) => {
    if (disabled || savingStep || pendingMove) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Traditional notation the moment it enters the work. The rail keeps × and
    // ÷ as action icons; the chip that flies into the equation does not.
    const label = describeOperationToken(operation, operand);
    dragRef.current = { operation, label, pointerId: event.pointerId };
    setHeldToken({ x: event.clientX, y: event.clientY, label });
    setMirrorToken(null);
  };

  const onDragPointerMove = (event) => {
    if (!dragRef.current) return;
    latestPointerRef.current = { x: event.clientX, y: event.clientY };
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const point = latestPointerRef.current;
      if (!point || !dragRef.current) return;
      setHeldToken((current) => (current ? { ...current, x: point.x, y: point.y } : current));
      updatePointerVisuals(point.x, point.y);
    });
  };

  const endPointerDrag = (event, commit) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (rafRef.current) { window.cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const side = dragOverSideRef.current;
    const factorZone = factorZoneRef.current;
    setHeldToken(null);
    setMirrorToken(null);
    setDragOverSide(null);
    setFactorZoneHint(null);
    dragOverSideRef.current = null;
    factorZoneRef.current = null;
    if (!drag || !commit) return;

    if (isFactorOperation(drag.operation)) {
      if (factorZone) {
        attemptMove(drag.operation, factorZone.side);
      } else if (side) {
        triggerShake();
        setMessage({
          tone: 'growth',
          text: drag.operation === 'multiply'
            ? 'That touches a term, but multiplying needs to wrap the whole expression — drop it right against either side of the parentheses.'
            : 'That is on a term, but dividing needs to divide the whole expression — drop it on the fraction bar.',
        });
      }
      return;
    }

    if (side) attemptMove(drag.operation, side);
  };

  const onDragPointerUp = (event) => {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    endPointerDrag(event, true);
  };

  const onDragPointerCancel = (event) => endPointerDrag(event, false);

  const suggestedMove = getSuggestedMove(equation);
  const attemptsRemaining = getAttemptsRemaining(normalizedRecord, maximumAttempts);
  const solved = isSolvedEquation(equation);
  const objectiveLabel = equation.objective?.kind === 'slopeIntercept'
    ? 'Target: y = mx + b'
    : `Target: isolate ${equation.objective?.variable || equation.variable}${equation.objective?.simplifyRequired ? ' and simplify' : ''}`;

  const sideExpression = (side) => (pendingMove ? pendingMove.unsimplified[side] : equation[side]);
  const displayedSideLatex = (side) => pendingMove ? pendingMove.unsimplifiedLatex[side] : expressionToLatex(equation[side]);

  const renderSide = (side) => {
    const terms = splitAdditiveTerms(sideExpression(side));
    const inner = terms ? <AlgebraTermRow terms={terms} side={side} /> : <MathDisplay value={displayedSideLatex(side)} format="latex" inline />;

    const showFactorPreview = armedTile && !pendingMove && isFactorOperation(armedTile.operation);
    if (!showFactorPreview) {
      return <div className="algebra-equation-side" style={{ fontSize: '32px', margin: '16px 0' }}>{inner}</div>;
    }

    const factorLabel = operand.trim() || '?';
    const zoneHere = factorZoneHint?.side === side;

    if (armedTile.operation === 'multiply') {
      return (
        <div
          ref={side === 'left' ? leftFactorWrapRef : rightFactorWrapRef}
          className={`algebra-equation-side algebra-factor-tentative ${zoneHere ? 'algebra-factor-armed' : ''}`}
          style={{ fontSize: '32px', margin: '16px 0', display: 'inline-flex', alignItems: 'center' }}
        >
          <span className="algebra-factor-value">{factorLabel}</span>
          <span className="algebra-paren-inner">({inner})</span>
        </div>
      );
    }

    return (
      <div className={`algebra-equation-side algebra-factor-tentative ${zoneHere ? 'algebra-factor-armed' : ''}`} style={{ fontSize: '32px', margin: '16px 0', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        <span className="algebra-div-num">{inner}</span>
        <span ref={side === 'left' ? leftFactorBarRef : rightFactorBarRef} className="algebra-div-bar" style={{ width: '100%', height: '3px', background: 'currentColor', borderRadius: '2px', margin: '4px 0' }} />
        <span className="algebra-div-den">{factorLabel}</span>
      </div>
    );
  };

  const armedOperationLabel = armedTile ? OPERATIONS.find((item) => item.id === armedTile.operation)?.label : null;

  // Placed after every hook so hook order stays identical whether or not the
  // blueprint parsed. A student can't repair the JSON, so this states what
  // happened and points at the person who can.
  if (!equation) {
    return (
      <section style={{ maxWidth: '760px', margin: '0 auto', padding: '26px', textAlign: 'left' }}>
        <div style={{ padding: '22px 24px', borderRadius: '12px', background: 'var(--mm-warning-soft, #fef7e0)', border: '1px solid var(--mm-warning, #f9ab00)' }}>
          <h3 style={{ margin: 0, color: 'var(--mm-warning-text, #7a4f00)' }}>This question could not be loaded</h3>
          <p style={{ margin: '10px 0 0', color: 'var(--mm-ink, #202124)', lineHeight: 1.55 }}>
            Its equation is missing or written in a form the step-by-step solver cannot read, so there is nothing here for you to solve.
            Nothing you did caused this and your grade is not affected. Let your teacher know so they can fix the question.
          </p>
          {parseError && (
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--mm-ink-muted, #5f6368)' }}>
              Details for your teacher: {parseError}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={shake ? 'algebra-shake' : ''} style={{ maxWidth: '1120px', margin: '0 auto', padding: '10px 10px 24px', textAlign: 'left' }}>
      <QuestionPrompt>{question.prompt || 'Solve the equation by keeping both sides balanced.'}</QuestionPrompt>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', background: supportPolicy.level >= 4 ? '#e8f0fe' : '#f3e8fd', color: supportPolicy.level >= 4 ? '#174ea6' : '#681da8', fontWeight: 'bold' }}>{`Support ${supportPolicy.level} · ${supportPolicy.label}`}</div>
        <div style={{ padding: '8px 12px', borderRadius: '999px', background: '#e6f4ea', color: '#137333', fontWeight: 'bold' }}>{objectiveLabel}</div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 'bold', color: '#5f6368' }}>
          <input type="checkbox" checked={cancellationHintsEnabled} onChange={(event) => setCancellationHintsEnabled(event.target.checked)} style={{ width: '15px', height: '15px' }} />
          Cancellation hints
        </label>
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

      <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
        <div ref={leftRailRef} className="algebra-rail" style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', padding: '6px', borderRadius: '14px', background: '#0f1a2c' }}>
          {OPERATIONS.map((operation) => (
            <button type="button" key={`left-${operation.id}`} className="algebra-rail-tile" onClick={() => setArmedTile((current) => current?.operation === operation.id && current?.side === 'left' ? null : { operation: operation.id, side: 'left' })} disabled={disabled || savingStep || Boolean(pendingMove)} title={operation.label} aria-label={`${operation.label}, applied from the left`} style={{ width: '52px', height: '52px', borderRadius: '12px', border: armedTile?.operation === operation.id && armedTile?.side === 'left' ? '2px solid #5b9bff' : '1px solid #ffffff33', background: armedTile?.operation === operation.id && armedTile?.side === 'left' ? '#1a73e8' : '#ffffff14', color: '#dbe6f7', fontSize: '22px', fontWeight: 800, cursor: disabled || savingStep || pendingMove ? 'not-allowed' : 'pointer' }}>{operation.symbol}</button>
          ))}
        </div>

        <div aria-label="Interactive algebra balance scale" className="algebra-equation-stage" style={{ position: 'relative', flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 76px minmax(0, 1fr)', alignItems: 'stretch', gap: '12px', padding: '20px', borderRadius: '18px', border: '2px solid #c5d5ef', background: 'linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)', boxShadow: '0 10px 24px rgba(31,73,125,0.12)' }}>
          {['left', 'right'].map((side, index) => {
            const target = pendingMove?.cancellationTargets.find((item) => item.side === side);
            const crossed = crossedSides.includes(side);
            const targetTerms = target ? splitAdditiveTerms(sideExpression(side)) : null;
            const candidatePairIndices = target?.canCancel && targetTerms ? findCancellingPairIndices(targetTerms, target.simplifiedExpression, equation.variable) : null;
            const crossedPairIndices = crossed ? candidatePairIndices : null;
            const selectedIndices = manualSelection?.side === side ? [manualSelection.index] : [];
            return (
              <div key={side} ref={side === 'left' ? leftSideRef : rightSideRef} className="algebra-equation-box" onDragOver={(event) => { event.preventDefault(); setDragOverSide(side); }} onDragLeave={() => setDragOverSide(null)} onDrop={(event) => { event.preventDefault(); setDragOverSide(null); const droppedOperation = event.dataTransfer.getData('text/algebra-operation'); if (droppedOperation) attemptMove(droppedOperation, side); }} style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 1, minHeight: '210px', padding: '18px 12px', borderRadius: '14px', border: dragOverSide === side ? '4px solid #00a6a6' : '2px solid #9fb8dd', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s ease', position: 'relative', overflow: 'hidden' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#5f6368', textTransform: 'uppercase' }}>{side} side</div>
                {renderSide(side)}
                {pendingMove && <div className={`algebra-mirror-chip ${mirrorOrigin !== side ? 'algebra-mirror-arrive' : ''}`}>{pendingMove.operationLabel} {pendingMove.operandExpression}</div>}
                {pendingMove && target && (
                  <div onPointerDown={target.canCancel ? (event) => setStrikeStart({ side, x: event.clientX, y: event.clientY }) : undefined} onPointerUp={target.canCancel ? (event) => { const start = strikeStart; setStrikeStart(null); if (start?.side === side) strikeSide(side, Math.hypot(event.clientX - start.x, event.clientY - start.y)); } : undefined} style={{ position: 'relative', width: 'min(92%, 360px)', marginTop: '12px', padding: '13px', borderRadius: '10px', border: target.canCancel ? '2px dashed #f9ab00' : '1px solid #d9e2f1', background: target.canCancel ? '#fff9e6' : '#f8f9fa', textAlign: 'center', touchAction: 'none', cursor: target.canCancel ? 'crosshair' : 'default', userSelect: 'none' }}>
                    <div style={{ fontSize: '11px', color: '#5f6368', fontWeight: 'bold', marginBottom: '5px' }}>{target.canCancel ? 'Draw through the zero pair or identity pair' : 'Simplify this side in the response field below'}</div>
                    {targetTerms ? (
                      <AlgebraTermRow
                        terms={targetTerms}
                        side={side}
                        crossedIndices={crossedPairIndices || []}
                        selectedIndices={selectedIndices}
                        onTermClick={target.canCancel && !cancelAnimating ? (termIndex) => handleTermClick(side, termIndex, candidatePairIndices) : undefined}
                      />
                    ) : (
                      <MathDisplay value={target.latex} format="latex" style={{ fontSize: '22px' }} />
                    )}
                    {crossed && target.canCancel && !crossedPairIndices && <div className={cancelAnimating ? 'algebra-cancel-fade' : ''} style={{ position: 'absolute', left: '9%', right: '9%', top: '58%', height: '4px', borderRadius: '999px', background: '#d93025', transform: 'rotate(-5deg)', boxShadow: '0 0 0 2px rgba(255,255,255,0.7)' }} />}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={equalsRef} style={{ gridColumn: 2, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '50px', fontWeight: 800, color: '#174ea6' }} aria-label="equals">=</div>
          <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '8px', height: '8px', borderRadius: '999px', background: '#6d7f99' }} />
        </div>

        <div ref={rightRailRef} className="algebra-rail" style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', padding: '6px', borderRadius: '14px', background: '#0f1a2c' }}>
          {OPERATIONS.map((operation) => (
            <button type="button" key={`right-${operation.id}`} className="algebra-rail-tile" onClick={() => setArmedTile((current) => current?.operation === operation.id && current?.side === 'right' ? null : { operation: operation.id, side: 'right' })} disabled={disabled || savingStep || Boolean(pendingMove)} title={operation.label} aria-label={`${operation.label}, applied from the right`} style={{ width: '52px', height: '52px', borderRadius: '12px', border: armedTile?.operation === operation.id && armedTile?.side === 'right' ? '2px solid #5b9bff' : '1px solid #ffffff33', background: armedTile?.operation === operation.id && armedTile?.side === 'right' ? '#1a73e8' : '#ffffff14', color: '#dbe6f7', fontSize: '22px', fontWeight: 800, cursor: disabled || savingStep || pendingMove ? 'not-allowed' : 'pointer' }}>{operation.symbol}</button>
          ))}
        </div>
      </div>

      {armedTile && (
        <div style={{ display: 'flex', alignItems: 'end', gap: '12px', flexWrap: 'wrap', padding: '16px', marginTop: '14px', border: '2px solid #1a73e8', borderRadius: '12px', background: '#f8fbff' }}>
          <label style={{ flex: '1 1 220px', fontWeight: 'bold', color: '#3c4043' }}>{armedOperationLabel} what to both sides?<input autoFocus value={operand} onChange={(event) => setOperand(event.target.value)} placeholder="Examples: 2, -3, 1/2, b, 3x" disabled={disabled || savingStep} style={{ display: 'block', width: '100%', marginTop: '7px', padding: '12px', fontSize: '18px', borderRadius: '8px', border: '2px solid #9fb8dd', boxSizing: 'border-box' }} /></label>
          <button type="button" draggable={!disabled} onDragStart={(event) => event.dataTransfer.setData('text/algebra-operation', armedTile.operation)} onClick={() => attemptMove(armedTile.operation, armedTile.side)} disabled={disabled || savingStep} style={{ padding: '13px 18px', border: 'none', borderRadius: '9px', background: disabled || savingStep ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 'bold', cursor: disabled || savingStep ? 'not-allowed' : 'grab' }}>Apply {armedOperationLabel} {operand}</button>
          <button type="button" onPointerDown={(event) => beginPointerDrag(armedTile.operation, event)} onPointerMove={onDragPointerMove} onPointerUp={onDragPointerUp} onPointerCancel={onDragPointerCancel} disabled={disabled || savingStep} style={{ padding: '13px 18px', border: '1px dashed #1a73e8', borderRadius: '9px', background: '#fff', color: '#174ea6', fontWeight: 'bold', cursor: disabled || savingStep ? 'not-allowed' : 'grab', touchAction: 'none' }}>⠿ Pick up &amp; drag onto a side</button>
          <button type="button" onClick={() => setArmedTile(null)} style={{ padding: '13px 14px', border: '1px solid #dadce0', borderRadius: '9px', background: '#fff', color: '#5f6368', fontWeight: 'bold' }}>Cancel</button>
          {isFactorOperation(armedTile.operation) && (
            <p style={{ flexBasis: '100%', margin: 0, fontSize: '13px', color: '#8a5a00' }}>
              {armedTile.operation === 'multiply'
                ? 'Dragging: touch either side of the parentheses to lock it in. Other spots are explorable but will not solidify.'
                : 'Dragging: drop it right on the fraction bar to lock it in. Other spots are explorable but will not solidify.'}
            </p>
          )}
        </div>
      )}

      {!armedTile && !pendingMove && <div style={{ margin: '14px 0', padding: '13px', borderRadius: '12px', border: '2px dashed #9fb8dd', background: '#fff', textAlign: 'center', color: '#174ea6', fontWeight: 'bold' }}>Click an operation tile on either rail, enter a value, then apply it or drag it onto the equation.</div>}

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

      {pendingMove?.assumption && <p style={{ color: '#8a5a00', fontWeight: 'bold' }}>Required assumption: <MathDisplay value={pendingMove.assumption} inline /></p>}
      {question.showHint !== false && suggestedMove && !solved && <details style={{ marginTop: '14px', color: '#5f6368' }}><summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Need a strategic hint?</summary><p style={{ margin: '8px 0 0' }}>Look for a move that cancels a term: {describeOperation(suggestedMove.operation, suggestedMove.operand)}.</p></details>}
      {message && <div role="status" style={{ marginTop: '16px', padding: '13px 15px', borderRadius: '10px', background: message.tone === 'success' ? '#e6f4ea' : message.tone === 'growth' ? '#fef7e0' : '#fce8e6', color: message.tone === 'success' ? '#137333' : message.tone === 'growth' ? '#8a5a00' : '#c5221f', fontWeight: 'bold' }}>{message.text}</div>}
      <p style={{ color: '#5f6368', fontSize: '13px', marginTop: '12px' }}>
        {supportPolicy.description}
        {supportPolicy.inefficientMoveCostsAttempt
          ? ` Attempts remaining: ${attemptsRemaining}. A longer route still counts as correct algebra, but it uses an attempt at this level.`
          : ' A longer route is still correct algebra here and costs nothing.'}
      </p>

      {heldToken && (
        <div aria-hidden="true" style={{ position: 'fixed', left: heldToken.x, top: heldToken.y, transform: 'translate(-50%, -50%)', zIndex: 40, pointerEvents: 'none', fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace', fontWeight: 800, fontSize: '22px', color: '#174ea6', background: '#e8f0fe', borderRadius: '12px', padding: '6px 12px', boxShadow: '0 12px 26px rgba(26,115,232,0.3)', whiteSpace: 'nowrap' }}><OperationChip token={heldToken.label} /></div>
      )}
      {mirrorToken && (
        <div aria-hidden="true" className="algebra-mirror-chip" style={{ position: 'fixed', left: mirrorToken.x, top: mirrorToken.y, transform: 'translate(-50%, -50%)', zIndex: 40, pointerEvents: 'none', fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace', fontWeight: 800, fontSize: '22px', color: '#174ea6', background: 'rgba(232,240,254,0.7)', border: '1px dashed #1a73e8', borderRadius: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}><OperationChip token={mirrorToken.label} /></div>
      )}
    </section>
  );
}
