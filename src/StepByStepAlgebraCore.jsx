import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';
import { ALGEBRA_DRAFT_VERSION, rehydrateAlgebraDraft } from './algebraDraftState';
import { advanceCancellationProgress } from './algebraCancellationProgress';
import { buildCancellationModel } from './algebraCancellationModel';
import { stageOperationPlacement } from './algebraOperationPlacement';
import {
  appendStrokePoint, createStroke, resolveStruckTerms, strokeLength, strokeToPath,
} from './strokeGeometry';
import { motionDuration, prefersReducedMotion, watchReducedMotion } from './motionPreference';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import QuestionPrompt from './QuestionPrompt';
import AlgebraTermRow from './AlgebraTermRow';
import './StepByStepAlgebra.css';
import useMobileInteractionMode from './platform/mobile/useMobileInteractionMode.js';
import { extractEquationSymbols, placementInstructionForOperation, semanticPlacementFromTap } from './platform/mobile/mobileInteractionFoundation.js';
import {
  applyAdditiveOperationAtPlacement,
  applyBalancedOperation,
  describeOperation,
  equationToLatex,
  expressionToLatex,
  describeOperationToken,
  getSuggestedMove,
  isSolvedEquation,
  expressionsEquivalent,
  latexToExpression,
  parseEquationInput,
  parseOperationOperand,
  splitAdditiveTerms,
} from './algebraAstEngine';
import {
  findLikeTermGroups,
  replacementIsSingleLikeTerm,
  replaceSelectedLikeTerms,
  replaceSingleAdditiveTerm,
  selectedLikeTermInfo,
} from './algebraLikeTermsModel.js';
import { getAttemptsRemaining, normalizeQuestionRecord } from './attemptPolicy';
import {
  evaluateMove, getSupportPolicy, resolveEquationAfterKeepingMove, resolveEquationAfterMove,
  resolveEquationAfterStudentSimplification, resolveSupportLevel,
} from './algebraSupportLevels';
import {
  STRUCTURE_TOOL_KINDS,
  STRUCTURE_TOOL_LABELS,
  commitStructureTool,
  detectStructureTools,
  openStructureTool,
  undoStructureTool,
} from './algebraStructureTools';
import { equationKey } from './algebraStructureToolState';
import { MAX_WORK_STEPS } from './algebraDraftState';
import {
  StructureToolControls,
  StructureToolSide,
  structureToolDrawsSide,
  structureToolFitKey,
} from './StepAlgebraStructureTools';
import {
  armFactor as armDistributionFactorState,
  commitDistribution,
  detectDistributableGroup,
  disarmFactor as disarmDistributionFactorState,
  initDistributionState,
  isDistributionComplete,
  placeOnTerm as placeDistributionTermState,
  undoLastPlacement as undoDistributionPlacement,
} from './algebraDistributionModel';

const STRUCTURE_TOOL_TITLES = {
  factor: 'Choose terms, write them as primes, and pull out a factor they share',
  split: 'Give each numerator term its own copy of the denominator',
  reduce: 'Write a fraction as prime factors and cancel matching pairs',
  arithmetic: 'Multiply the numbers in a product',
  arrange: 'Change the order of the terms on one side',
};

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

const operationOperandIdentity = (value) => {
  try {
    return parseOperationOperand(value).expression.replace(/\s+/g, '');
  } catch {
    return String(value ?? '').replace(/\s+/g, '');
  }
};

const pairForToken = (model, index) => model?.pairs?.find((pair) => pair.indices.includes(index)) || null;

// A committed step, described the way a teacher narrates the board: words
// around classroom-notation math, never MathJS text.
const mathPart = (expression) => {
  try { return { latex: expressionToLatex(expression) }; } catch { return String(expression ?? ''); }
};
const partsText = (parts) => parts.map((part) => (typeof part === 'string' ? part : String(part.text ?? part.latex ?? ''))).join('');
const describedStep = (kind, parts, after) => ({ kind, parts, description: partsText(parts), after });
const BALANCED_STEP_WORDS = {
  add: ['Added ', ' to both sides'],
  subtract: ['Subtracted ', ' from both sides'],
  multiply: ['Multiplied both sides by ', ''],
  divide: ['Divided both sides by ', ''],
};
const balancedStep = (move, after) => {
  const [before, trailing] = BALANCED_STEP_WORDS[move.operation] || [`${move.operation} `, ' on both sides'];
  const operand = mathPart(move.operandExpression);
  return {
    ...describedStep('balanced-operation', [before, operand, trailing].filter((part) => part !== ''), after),
    description: `${before}${String(move.operandExpression).replace(/\s+/g, '')}${trailing}`,
  };
};

const factorNeedsDot = (left, right) => /^-?\d+(?:\.\d+)?$/.test(left?.text || '') && /^-?\d+(?:\.\d+)?$/.test(right?.text || '');

function CancellationFactorRow({
  factors,
  offset,
  model,
  selectedIndices,
  crossedIndices,
  onTokenClick,
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '58px' }}>
      {factors.map((factor, localIndex) => {
        const index = offset + localIndex;
        const cancellable = Boolean(pairForToken(model, index));
        const selected = selectedIndices.includes(index);
        const crossed = crossedIndices.includes(index);
        const previous = localIndex > 0 ? factors[localIndex - 1] : null;
        return (
          <span key={`${offset}-${localIndex}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {previous && factorNeedsDot(previous, factor) && <span aria-hidden="true" style={{ margin: '0 2px', fontSize: '22px' }}>·</span>}
            <span
              data-cancel-index={index}
              onClick={cancellable ? () => onTokenClick(index) : undefined}
              role={cancellable ? 'button' : undefined}
              tabIndex={cancellable ? 0 : undefined}
              onKeyDown={cancellable ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onTokenClick(index);
                }
              } : undefined}
              aria-label={cancellable ? `${factor.text}, mark this factor for cancellation` : undefined}
              aria-pressed={cancellable ? selected || crossed : undefined}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '42px',
                minHeight: '52px',
                padding: '9px 12px',
                margin: '0 1px',
                borderRadius: '8px',
                cursor: cancellable ? 'crosshair' : 'default',
                background: selected ? 'rgba(26,115,232,.10)' : 'transparent',
                outline: selected ? '2px solid #1a73e8' : 'none',
                outlineOffset: '-2px',
                opacity: crossed ? 0.58 : 1,
                transition: 'opacity .2s ease, background .15s ease, outline-color .15s ease',
              }}
            >
              <MathDisplay value={factor.latex} format="latex" inline style={{ fontSize: '30px' }} ariaLabel={factor.text} />
              {(selected || crossed) && (
                <span aria-hidden="true" style={{ position: 'absolute', left: '7%', right: '7%', top: '52%', height: '4px', borderRadius: '999px', background: '#c5221f', transform: 'rotate(-12deg)', boxShadow: '0 0 0 2px rgba(255,255,255,.78)' }} />
              )}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The chip a student drags. A fraction is stacked with a real horizontal rule
 * rather than written with a slash, because that is what a fraction looks like.
 */
function AutoFitEquationExpression({ children, baseFontSize = 34, cacheKey = '' }) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const base = Number(baseFontSize) || 34;
  const [fontSize, setFontSize] = useState(base);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return undefined;

    let frame = null;
    const fit = () => {
      const available = Math.max(1, viewport.clientWidth - 8);
      const computed = Number.parseFloat(window.getComputedStyle(content).fontSize) || base;
      const rendered = Math.max(1, content.scrollWidth);

      // Estimate the width this exact expression would occupy at the base
      // typography, then derive one stable target size from that measurement.
      // The old code multiplied the *current* font by a fresh width ratio while
      // also observing the content itself. Changing the font changed the
      // observed width, which triggered another resize, producing the visible
      // "pulsing" students saw near the fit boundary.
      const widthAtBase = Math.max(1, rendered * (base / computed));
      const target = Math.max(17, Math.min(base, base * (available / widthAtBase) * 0.975));

      setFontSize((current) => (Math.abs(target - current) > 0.35 ? target : current));
    };
    const scheduleFit = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };

    scheduleFit();
    // Observe only the space available to the equation. Observing the content
    // itself creates a feedback loop because changing its font size changes its
    // dimensions. Content changes already arrive through cacheKey.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleFit) : null;
    observer?.observe(viewport);
    window.addEventListener('resize', scheduleFit);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleFit);
    };
  }, [base, cacheKey]);

  return (
    <div ref={viewportRef} className="algebra-expression-fit-viewport">
      <div ref={contentRef} className="algebra-expression-fit-content" style={{ fontSize: `${fontSize}px` }}>
        {children}
      </div>
    </div>
  );
}

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
  attemptsDoNotExpire = false,
  draftKey = null,
  autoOpenDistribution = false,
  simplifyDistributedProducts = false,
  inlineExpressionTools = true,
  // Optional: the committed work-step log (description + before/after), for a
  // host that shows the student's history — RewriteLinearForm, the Work View
  // history panel. Same entries Undo pops, so the two cannot drift.
  onWorkStepsChange = null,
  // Optional: the committed equation itself (plain expressions, not LaTeX),
  // for a host that grades or mirrors it.
  onEquationChange = null,
  // Optional: history carried over from a host's earlier persistence, used only
  // when this workspace has no draft of its own yet.
  initialWorkSteps = null,
  // A host that already shows the question prompt can hide the repeat.
  showPrompt = true,
}) {
  const normalizedRecord = normalizeQuestionRecord(questionRecord);
  const initialParse = useMemo(() => getInitialEquation(question, normalizedRecord), [question]);
  const initialEquation = initialParse.equation;
  const parseError = initialParse.error;
  // Reset Work must return to the authored equation for this variant, not to
  // the latest saved server-side algebraState.
  const pristineEquation = useMemo(() => getInitialEquation(question, null).equation, [question]);
  const localDraftKey = draftKey ? `${draftKey}:step-algebra` : null;
  const rawSavedDraft = useMemo(() => readQuestionDraft(localDraftKey, null), [localDraftKey]);
  // Pending moves are derived engine state. Never trust an old serialized copy
  // after the algebra engine changes: that can resurrect UI requirements that
  // the current engine no longer considers mathematically necessary.
  const savedDraft = useMemo(
    () => rehydrateAlgebraDraft({ draft: rawSavedDraft, initialEquation }),
    [rawSavedDraft, initialEquation],
  );
  const [equation, setEquation] = useState(savedDraft?.equation || initialEquation);
  const [committedHistory, setCommittedHistory] = useState([]);
  // What each committed step DID, in words and classroom notation, for the
  // work history. Pushed by the same call that records the Undo snapshot and
  // popped by the same Undo, so the history can never disagree with the
  // equation. Unlike the Undo stack it is part of the draft: a reopened
  // question still shows how the student got here.
  const initialWorkStepsRef = useRef(Array.isArray(initialWorkSteps) ? initialWorkSteps : []);
  const [workSteps, setWorkSteps] = useState(savedDraft?.workSteps || initialWorkStepsRef.current);
  const pushCommittedEquation = (snapshot, step = null) => {
    if (!snapshot?.left || !snapshot?.right) return;
    const copy = JSON.parse(JSON.stringify(snapshot));
    setCommittedHistory((current) => [...current.slice(-59), copy]);
    const after = step?.after?.left && step?.after?.right ? { left: step.after.left, right: step.after.right } : null;
    if (!after) return;
    setWorkSteps((current) => [...current, {
      kind: step.kind || 'step',
      description: step.description || 'Algebra step',
      parts: Array.isArray(step.parts) ? step.parts : [step.description || 'Algebra step'],
      before: { left: copy.left, right: copy.right },
      after,
    }].slice(-MAX_WORK_STEPS));
  };
  // One 1-5 support scale. `resolveSupportLevel` also reads the old
  // rigorous/exploratory values, so saved drafts and old assignment JSON keep
  // working without a migration pass.
  const [supportLevel, setSupportLevel] = useState(
    () => resolveSupportLevel({ workspaceDifficulty: savedDraft?.supportLevel ?? savedDraft?.mode ?? question.workspaceDifficulty ?? question.mode }),
  );
  const supportPolicy = getSupportPolicy(supportLevel);
  const allowAutoApply = Boolean(question?.supportPresentation?.algebraAutoApply);
  const allowPrefillFirstStep = Boolean(question?.supportEntitlements?.prefillFirstStep);
  // The operation value must begin blank. Carrying a default 2 into every new
  // operation encouraged accidental moves and made symbolic literal equations
  // look numeric before the student had chosen anything.
  const [operand, setOperand] = useState(savedDraft?.operand ?? '');
  // Partial distribution (factor placements not yet committed) persists
  // across navigation, same as every other in-progress move.
  const [distributionState, setDistributionState] = useState(savedDraft?.distributionState || null);
  // Factor, Split fraction, Cancel factors, Simplify arithmetic, Arrange terms:
  // one open tool at a time, persisted, undone one decision at a time.
  const [structureTool, setStructureTool] = useState(savedDraft?.structureTool || null);
  const [pendingMove, setPendingMove] = useState(savedDraft?.pendingMove || null);
  const [crossedSides, setCrossedSides] = useState(savedDraft?.crossedSides || []);
  const [cancelledPairIds, setCancelledPairIds] = useState(savedDraft?.cancelledPairIds || {});
  const [simplificationAnswers, setSimplificationAnswers] = useState(savedDraft?.simplificationAnswers || {});
  const [simplificationFocusSignal, setSimplificationFocusSignal] = useState(0);
  const [promptAnswers, setPromptAnswers] = useState(savedDraft?.promptAnswers || {});
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteScope, setRewriteScope] = useState('left');
  const [rewriteAnswers, setRewriteAnswers] = useState({ left: '', right: '' });
  const [rewriteFocusSignal, setRewriteFocusSignal] = useState(0);
  // In inline-expression mode, Rewrite / Simplify turns every additive term
  // into a neutral selectable token on the balance board. Selecting a token
  // NEVER changes it and never asks whether it should be simplified; only a
  // student-authored equivalent replacement can commit.
  const [inlineRewriteSelection, setInlineRewriteSelection] = useState({ side: null, index: null });
  const [inlineRewriteAnswer, setInlineRewriteAnswer] = useState('');
  const [inlineRewriteFocusSignal, setInlineRewriteFocusSignal] = useState(0);
  // Interactive same-side simplification. A student chooses the side and the
  // terms they believe are alike, then supplies the combined term. The platform
  // checks the decision; it never supplies the coefficient/result.
  const [likeTermsOpen, setLikeTermsOpen] = useState(Boolean(savedDraft?.likeTermsOpen));
  const [likeTermsSide, setLikeTermsSide] = useState(savedDraft?.likeTermsSide || '');
  const [selectedLikeTermIndices, setSelectedLikeTermIndices] = useState(savedDraft?.selectedLikeTermIndices || []);
  const [likeTermsAnswer, setLikeTermsAnswer] = useState(savedDraft?.likeTermsAnswer || '');
  const [likeTermsFocusSignal, setLikeTermsFocusSignal] = useState(0);
  // The whole drawn path, in coordinates local to the strike box, so the live
  // ink and the term rectangles share one space.
  const [stroke, setStroke] = useState(null); // { side, points: [{x,y}] } | null
  const strokeBoxRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [dragOverSide, setDragOverSide] = useState(null);
  const [shake, setShake] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [cancelAnimating, setCancelAnimating] = useState(false);
  // The cancellation sequence. `lockedStroke` is the line the student drew,
  // kept on screen after the pointer lifts so the strike reads as a decision
  // rather than as ink that vanished; `struckIndices` highlights what it went
  // through; `collapsingSides` runs the shrink just before the equation changes.
  const [lockedStroke, setLockedStroke] = useState(null); // { side, points }
  const [struckTerms, setStruckTerms] = useState(null); // { side, indices }
  const [collapsingSides, setCollapsingSides] = useState([]);
  const [balancePulse, setBalancePulse] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  useEffect(() => watchReducedMotion(setReducedMotion), []);
  /*
   * THE OPERATION THE STUDENT HAS PICKED UP, AND HAS NOT PLACED YET.
   *
   * `operand` was already durable, but on its own it restored to nothing the
   * student could see: the operand box only exists while an operation is armed.
   * A student who chose "subtract", typed 5, and walked to the next question
   * came back to a workspace that had forgotten both. This is unfinished work
   * before any step is committed, so it belongs in the same draft as the
   * operand — and it stays out of the step/attempt architecture entirely:
   * restoring an armed tile places nothing, commits nothing and grades nothing.
   */
  const [armedTile, setArmedTile] = useState(savedDraft?.armedTile || null); // { operation, sourceSide }
  const [operationFocusSignal, setOperationFocusSignal] = useState(0);
  const [mathToolsCollapseSignal, setMathToolsCollapseSignal] = useState(0);
  const [tapPlacementArmed, setTapPlacementArmed] = useState(false);
  const mobileInteraction = useMobileInteractionMode();
  const [placedOperationSides, setPlacedOperationSides] = useState([]);
  const [placedOperationPositions, setPlacedOperationPositions] = useState({});
  // React state updates are intentionally asynchronous. Operation placement is
  // different: the second side can be dropped before React has rendered the
  // first side's state update (especially on fast Chromebook pointer events).
  // Keep a synchronous mirror so a right-then-left or left-then-right pair is
  // evaluated against the latest placement, never a stale render closure.
  const placedOperationSidesRef = useRef([]);
  const placedOperationPositionsRef = useRef({});
  const [heldToken, setHeldToken] = useState(null); // { x, y, label }
  // Cues default to what the level says, and the student may still turn them
  // off. A level 4/5 workspace starts quiet rather than starting loud.
  const [cancellationHintsEnabled, setCancellationHintsEnabled] = useState(
    () => getSupportPolicy(resolveSupportLevel({ workspaceDifficulty: question.workspaceDifficulty ?? question.mode })).showCancellationHints,
  );
  const [factorZoneHint, setFactorZoneHint] = useState(null); // { side, position } | null
  const [selectedCancellationIndices, setSelectedCancellationIndices] = useState(savedDraft?.selectedCancellationIndices || {}); // { left: number[], right: number[] }
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
  const leftExpressionRef = useRef(null);
  const rightExpressionRef = useRef(null);

  useEffect(() => {
    placedOperationSidesRef.current = placedOperationSides;
  }, [placedOperationSides]);
  useEffect(() => {
    placedOperationPositionsRef.current = placedOperationPositions;
  }, [placedOperationPositions]);

  const operationContextSymbols = useMemo(() => extractEquationSymbols(
    question?.equation,
    question?.formula,
    equation ? equationToLatex(equation) : '',
    question?.solveFor,
    equation?.variable,
  ), [question?.equation, question?.formula, question?.solveFor, equation]);

  useEffect(() => {
    if (savedDraft) return;
    setCommittedHistory([]);
    // getInitialEquation returns { equation, error }, not an equation. Putting
    // the wrapper into state left `equation.left` undefined on every question
    // change that had no saved draft — which is every fresh question after the
    // first — and the workspace rendered empty.
    setEquation(getInitialEquation(question, normalizeQuestionRecord(questionRecord)).equation);
    setSupportLevel(resolveSupportLevel({ workspaceDifficulty: question.workspaceDifficulty ?? question.mode }));
    setOperand('');
    setDistributionState(null);
    setStructureTool(null);
    setWorkSteps(initialWorkStepsRef.current);
    setPendingMove(null);
    setCrossedSides([]);
    setCancelledPairIds({});
    setSelectedCancellationIndices({});
    setSimplificationAnswers({});
    setPromptAnswers({});
    setRewriteOpen(false);
    setRewriteScope('left');
    setRewriteAnswers({ left: '', right: '' });
    setInlineRewriteSelection({ side: null, index: null });
    setInlineRewriteAnswer('');
    setSelectedCancellationIndices({});
    setMessage(null);
    setArmedTile(null);
    setTapPlacementArmed(false);
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setTapPlacementArmed(false);
  }, [question, savedDraft]);

  // A saved draft skips the fresh-question reset block above, so clear Undo
  // history explicitly whenever the question/draft identity changes. History
  // belongs to this mounted work session; it is not reconstructed from old
  // server state and can never leak into the next problem.
  useEffect(() => {
    setCommittedHistory([]);
  }, [question, localDraftKey]);

  useEffect(() => {
    // A JSON author cannot turn this on for the whole class. The automatic
    // first-step support only runs when the student's support profile granted
    // the matching entitlement.
    if (!question.prefillFirstStep || !allowPrefillFirstStep || savedDraft || prefillAppliedRef.current || disabled) return;
    const suggestion = getSuggestedMove(initialEquation);
    if (!suggestion) return;
    try {
      const move = applyBalancedOperation({ equationState: initialEquation, operation: suggestion.operation, operand: String(suggestion.operand) });
      prefillAppliedRef.current = true;
      const prefilledEquation = resolveEquationAfterMove(move, 1, move.requiredCancellationSides || []);
      setEquation(prefilledEquation);
      setMessage({ tone: 'growth', text: `The first balanced step was pre-filled: ${describeOperation(suggestion.operation, suggestion.operand)}. Continue from the resulting equation.` });
    } catch {
      // A pre-filled anchor is optional and never blocks the question.
    }
  }, [question.prefillFirstStep, allowPrefillFirstStep, savedDraft, initialEquation, disabled]);

  useEffect(() => {
    writeQuestionDraft(localDraftKey, {
      algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
      equation,
      supportLevel,
      operand,
      distributionState,
      structureTool,
      workSteps,
      armedTile,
      pendingMove,
      crossedSides,
      cancelledPairIds,
      selectedCancellationIndices,
      simplificationAnswers,
      promptAnswers,
      likeTermsOpen,
      likeTermsSide,
      selectedLikeTermIndices,
      likeTermsAnswer,
    });
  }, [localDraftKey, equation, supportLevel, operand, distributionState, structureTool, workSteps, armedTile, pendingMove, crossedSides, cancelledPairIds, selectedCancellationIndices, simplificationAnswers, promptAnswers, likeTermsOpen, likeTermsSide, selectedLikeTermIndices, likeTermsAnswer]);

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
      questionDetails: solved ? `Solved step-by-step: $${equationToLatex(equation)}$. ${promptParts.map((part) => `${part.label}: ${part.response}`).join('; ')}` : `Current equation: $${equationToLatex(equation)}$`,
      parts: [
        { id: 'algebra-objective', label: question.objective?.label || (equation.objective?.kind === 'slopeIntercept' ? 'Write in slope-intercept form' : equation.objective?.kind === 'factoredLinear' ? 'Write in factored linear form' : equation.objective?.kind === 'linearStandardForm' ? 'Write in standard form' : `Isolate ${equation.objective?.variable || equation.variable}`), isComplete: solved, isCorrect: solved, response: equationToLatex(equation) },
        ...promptParts,
      ],
    });
  }, [equation, question, promptAnswers, onStateChange]);

  useEffect(() => {
    onWorkStepsChange?.(workSteps);
  }, [workSteps, onWorkStepsChange]);

  useEffect(() => {
    if (equation?.left && equation?.right) onEquationChange?.(equation);
  }, [equation, onEquationChange]);

  // A structure tool belongs to the equation it was opened on. If that equation
  // changes by any route (a commit, an Undo), the tool's decisions no longer
  // describe the mathematics on screen, so it closes.
  useEffect(() => {
    if (structureTool && equation && structureTool.equationKey !== equationKey(equation)) setStructureTool(null);
  }, [structureTool, equation]);

  const hasDistributionProgress = Boolean(distributionState?.placedIndices?.length || distributionState?.armed);
  const likeTermGroups = useMemo(() => ({
    left: findLikeTermGroups(equation?.left),
    right: findLikeTermGroups(equation?.right),
  }), [equation]);
  const hasLikeTermOpportunity = Boolean(likeTermGroups.left.length || likeTermGroups.right.length);
  const currentLikeTermSelection = useMemo(
    () => (likeTermsSide ? selectedLikeTermInfo(equation?.[likeTermsSide], selectedLikeTermIndices) : null),
    [equation, likeTermsSide, selectedLikeTermIndices],
  );

  useEffect(() => {
    if (!likeTermsOpen || !currentLikeTermSelection?.valid) return;
    // The answer field is conditionally mounted only after a valid selection.
    // Move the caret there immediately so the next student action is typing,
    // not hunting for and clicking the new box.
    setLikeTermsFocusSignal((signal) => signal + 1);
  }, [
    likeTermsOpen,
    likeTermsSide,
    currentLikeTermSelection?.valid,
    currentLikeTermSelection?.selectedExpression,
  ]);

  const simplificationPromptVisible = Boolean(
    pendingMove?.simplificationTargets?.length
    && pendingMove.requiredCancellationSides.every((side) => crossedSides.includes(side)),
  );

  useEffect(() => {
    if (!simplificationPromptVisible) return;
    // This prompt appears as a consequence of the student's completed algebra
    // move. Put the caret in its first response field immediately so the next
    // action can be typing; do not make the student click the newly appeared box.
    setSimplificationFocusSignal((signal) => signal + 1);
  }, [simplificationPromptVisible, pendingMove]);

  const hasTransientUndo = Boolean(
    pendingMove
    || crossedSides.length
    || Object.keys(cancelledPairIds).some((side) => cancelledPairIds[side]?.length)
    || Object.values(selectedCancellationIndices).some((indices) => indices?.length)
    || Object.keys(simplificationAnswers).length
    || rewriteOpen
    || Object.values(rewriteAnswers).some((value) => String(value || '').trim())
    || Boolean(inlineRewriteSelection?.side)
    || String(inlineRewriteAnswer || '').trim()
    || likeTermsOpen
    || selectedLikeTermIndices.length
    || String(likeTermsAnswer || '').trim()
    || armedTile
    || placedOperationSides.length
    || tapPlacementArmed
    || String(operand || '').trim()
    || hasDistributionProgress
    || Boolean(structureTool)
  );

  useEffect(() => {
    onUndoStateChange?.({
      canUndo: hasTransientUndo || committedHistory.length > 0,
      onUndo: () => {
        const answerKeys = Object.keys(simplificationAnswers);
        const pairSides = Object.keys(cancelledPairIds).filter((side) => cancelledPairIds[side]?.length);
        const hasSelectedCancellation = Object.values(selectedCancellationIndices)
          .some((indices) => indices?.length);
        const hasRewriteEntry = rewriteOpen
          || Object.values(rewriteAnswers).some((value) => String(value || '').trim())
          || Boolean(inlineRewriteSelection?.side)
          || String(inlineRewriteAnswer || '').trim();
        const hasLikeTermsEntry = likeTermsOpen
          || selectedLikeTermIndices.length > 0
          || String(likeTermsAnswer || '').trim();
        const hasOperationStaging = Boolean(
          armedTile
          || placedOperationSides.length
          || tapPlacementArmed
          || String(operand || '').trim()
        );

        if (answerKeys.length) {
          setSimplificationAnswers((current) => {
            const next = { ...current };
            delete next[answerKeys[answerKeys.length - 1]];
            return next;
          });
        } else if (hasSelectedCancellation) {
          setSelectedCancellationIndices({});
        } else if (pairSides.length) {
          const side = pairSides[pairSides.length - 1];
          setCancelledPairIds((current) => ({ ...current, [side]: current[side].slice(0, -1) }));
          setCrossedSides((current) => current.filter((entry) => entry !== side));
        } else if (crossedSides.length) {
          setCrossedSides((current) => current.slice(0, -1));
        } else if (pendingMove) {
          setPendingMove(null);
          setCancelledPairIds({});
          setSelectedCancellationIndices({});
          setSimplificationAnswers({});
        } else if (hasLikeTermsEntry) {
          if (String(likeTermsAnswer || '').trim()) {
            setLikeTermsAnswer('');
          } else if (selectedLikeTermIndices.length) {
            setSelectedLikeTermIndices((current) => current.slice(0, -1));
          } else {
            setLikeTermsOpen(false);
            setLikeTermsSide('');
          }
        } else if (hasRewriteEntry) {
          if (String(inlineRewriteAnswer || '').trim()) {
            setInlineRewriteAnswer('');
          } else if (inlineRewriteSelection?.side) {
            setInlineRewriteSelection({ side: null, index: null });
          } else {
            setRewriteOpen(false);
            setRewriteAnswers({ left: '', right: '' });
          }
        } else if (structureTool) {
          // One decision inside the open structure tool: the last prime factor
          // chosen, the last denominator placed, the last cancelled pair. With
          // nothing left to back out, the tool itself closes.
          setStructureTool((current) => undoStructureTool(current));
        } else if (distributionState?.placedIndices?.length) {
          // Before commit, undo removes the last factor placement.
          setDistributionState((current) => undoDistributionPlacement(current));
        } else if (distributionState?.armed) {
          setDistributionState((current) => disarmDistributionFactorState(current));
        } else if (hasOperationStaging) {
          setArmedTile(null);
          setOperand('');
          setPlacedOperationSides([]);
          setPlacedOperationPositions({});
          setTapPlacementArmed(false);
        } else if (committedHistory.length) {
          // The history entry that step wrote goes with it — popped here, not
          // inside the updater below, so it happens exactly once per Undo.
          setWorkSteps((steps) => steps.slice(0, -1));
          setCommittedHistory((current) => {
            if (!current.length) return current;
            const previous = current[current.length - 1];
            setEquation(previous);
            setStructureTool(null);
            setPendingMove(null);
            setCrossedSides([]);
            setCancelledPairIds({});
            setSelectedCancellationIndices({});
            setSimplificationAnswers({});
            setRewriteOpen(false);
            setRewriteAnswers({ left: '', right: '' });
            setInlineRewriteSelection({ side: null, index: null });
            setInlineRewriteAnswer('');
            setLikeTermsOpen(false);
            setLikeTermsSide('');
            setSelectedLikeTermIndices([]);
            setLikeTermsAnswer('');
            setArmedTile(null);
            setOperand('');
            setDistributionState(null);
            setPlacedOperationSides([]);
            setPlacedOperationPositions({});
            setTapPlacementArmed(false);
            setMessage({ tone: 'growth', text: 'Last completed algebra step undone.' });
            return current.slice(0, -1);
          });
          return;
        }

        setMessage({ tone: 'growth', text: 'The pending algebra action was undone before it changed your saved equation.' });
      },
      label: committedHistory.length && !hasTransientUndo
        ? 'Undo the last completed algebra step'
        : 'Undo the pending algebra action',
    });
    return () => onUndoStateChange?.(null);
  }, [
    armedTile,
    cancelledPairIds,
    committedHistory,
    crossedSides,
    distributionState,
    hasTransientUndo,
    onUndoStateChange,
    operand,
    pendingMove,
    placedOperationSides,
    rewriteAnswers,
    rewriteOpen,
    inlineRewriteSelection,
    inlineRewriteAnswer,
    likeTermsOpen,
    likeTermsSide,
    selectedLikeTermIndices,
    likeTermsAnswer,
    selectedCancellationIndices,
    simplificationAnswers,
    structureTool,
    tapPlacementArmed,
  ]);

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
          questionDetails: `Current equation: $${equationToLatex(equationAfter)}$`,
        } : { questionDetails: `Rejected move: ${describeOperation(move.operation, move.operandExpression)}` },
      });
    } finally {
      setSavingStep(false);
    }
  };

  const commitMove = async (move, { resolution = 'normal', crossedSidesOverride = null } = {}) => {
    setCancelAnimating(true);
    setCollapsingSides(move.requiredCancellationSides || []);
    window.setTimeout(async () => {
      const verdict = evaluateMove(move, supportLevel);
      const normalizedSimplificationAnswers = Object.fromEntries(
        Object.entries(simplificationAnswers || {}).map(([side, value]) => [side, latexToExpression(value)]),
      );
      const resolvedCrossedSides = Array.isArray(crossedSidesOverride) ? crossedSidesOverride : crossedSides;
      const nextEquation = resolution === 'simplified'
        ? resolveEquationAfterStudentSimplification(move, normalizedSimplificationAnswers, resolvedCrossedSides)
        : resolution === 'keep'
          ? resolveEquationAfterKeepingMove(move, resolvedCrossedSides)
          : resolveEquationAfterMove(move, supportLevel, resolvedCrossedSides);
      const nextSolved = isSolvedEquation(nextEquation);
      const earned = verdict.efficient ? 2 : verdict.valid ? 1 : 0;

      // Persist the equation the student actually sees. A refresh should never
      // silently replace their intentionally-unsimplified work with the engine's
      // prettiest equivalent form.
      await saveStep({ move, earned, possible: 2, countsAttempt: false, accepted: true, equationAfter: nextEquation });
      pushCommittedEquation(equation, balancedStep(move, nextEquation));
      setEquation(nextEquation);
      setPendingMove(null);
      setCrossedSides([]);
      setCancelledPairIds({});
      setSimplificationAnswers({});
      setSelectedCancellationIndices({});
      setOperand('');
      // A completed mathematical commit must leave no operation-staging state
      // behind. Otherwise Universal Undo sees the stale staging as the newest
      // undoable action and only clears the UI instead of restoring the
      // previous committed equation.
      setArmedTile(null);
      setPlacedOperationSides([]);
      setPlacedOperationPositions({});
      setTapPlacementArmed(false);
      setDragOverSide(null);
      setFactorZoneHint(null);
      setCancelAnimating(false);
      setCollapsingSides([]);
      setLockedStroke(null);
      setStruckTerms(null);
      setBalancePulse(true);
      window.setTimeout(() => setBalancePulse(false), motionDuration(700, reducedMotion, { floor: 60 }));
      setMessage({
        tone: nextSolved ? 'success' : move.productive ? 'success' : 'growth',
        text: nextSolved
          ? 'The requested variable is isolated. The equation is solved; further simplification is optional unless this question explicitly assesses final form.'
          : resolution === 'keep'
            ? 'Balanced move kept as written. Continue solving from this equivalent equation.'
            : move.productive
              ? 'Balanced step complete. Continue from the equation shown.'
              : verdict.message,
      });
    }, motionDuration(620, reducedMotion, { floor: 40 }));
  };

  const hasPartialCancellationSelection = () => Object.values(selectedCancellationIndices || {})
    .some((indices) => Array.isArray(indices) && indices.length > 0);

  const keepPendingMoveAsWritten = async () => {
    if (!pendingMove || savingStep || cancelAnimating) return;
    if (hasPartialCancellationSelection()) {
      setMessage({ tone: 'growth', text: 'Finish or undo the cancellation marks you already started before keeping this move as written.' });
      return;
    }
    await commitMove(pendingMove, { resolution: 'keep' });
  };

  const rewriteSidesForScope = (scope = rewriteScope) => (
    scope === 'both' ? ['left', 'right'] : [scope]
  );

  const closeRewriteTool = () => {
    setRewriteOpen(false);
    setRewriteAnswers({ left: '', right: '' });
    setInlineRewriteSelection({ side: null, index: null });
    setInlineRewriteAnswer('');
  };

  const closeLikeTermsTool = () => {
    setLikeTermsOpen(false);
    setLikeTermsSide('');
    setSelectedLikeTermIndices([]);
    setLikeTermsAnswer('');
  };

  const openLikeTermsTool = () => {
    if (disabled || savingStep || cancelAnimating) return;
    if (pendingMove) {
      setMessage({
        tone: 'growth',
        text: 'Finish the balanced operation already in progress first. Then you can combine like terms on either side.',
      });
      return;
    }
    setArmedTile(null);
    setTapPlacementArmed(false);
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setOperand('');
    setRewriteOpen(false);
    setInlineRewriteSelection({ side: null, index: null });
    setInlineRewriteAnswer('');
    setDistributionState(null);
    setStructureTool(null);
    setLikeTermsSide('');
    setSelectedLikeTermIndices([]);
    setLikeTermsAnswer('');
    setLikeTermsOpen((current) => !current);
    setMessage(null);
  };

  const chooseLikeTermsSide = (side) => {
    setLikeTermsSide(side);
    setSelectedLikeTermIndices([]);
    setLikeTermsAnswer('');
    setMessage(null);
  };

  const toggleLikeTerm = (index) => {
    setSelectedLikeTermIndices((current) => (
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index]
    ));
    setLikeTermsAnswer('');
    setMessage(null);
  };

  const toggleInlineLikeTerm = (side, index) => {
    if (!inlineExpressionTools || !likeTermsOpen) return;
    if (likeTermsSide !== side) {
      setLikeTermsSide(side);
      setSelectedLikeTermIndices([index]);
      setLikeTermsAnswer('');
      setMessage(null);
      return;
    }
    toggleLikeTerm(index);
  };

  const selectInlineRewriteTerm = (side, index) => {
    if (!inlineExpressionTools || !rewriteOpen) return;
    setInlineRewriteSelection({ side, index });
    setInlineRewriteAnswer('');
    setInlineRewriteFocusSignal((signal) => signal + 1);
    setMessage(null);
  };

  const openRewriteTool = () => {
    if (disabled || savingStep || cancelAnimating) return;
    if (pendingMove) {
      setMessage({
        tone: 'growth',
        text: 'Finish the balanced operation already in progress first. After that, Rewrite / Simplify is available again.',
      });
      return;
    }
    setArmedTile(null);
    setTapPlacementArmed(false);
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setOperand('');
    setRewriteAnswers({ left: '', right: '' });
    setInlineRewriteSelection({ side: null, index: null });
    setInlineRewriteAnswer('');
    closeLikeTermsTool();
    setDistributionState(null);
    setStructureTool(null);
    if (!rewriteOpen && !inlineExpressionTools) setRewriteFocusSignal((signal) => signal + 1);
    setRewriteOpen((current) => !current);
    setMessage(null);
  };

  const persistStudentRewrite = async (beforeEquation, nextEquation, changedSides, {
    kind = 'student-rewrite',
    label = `Rewrite / simplify ${changedSides.join(' and ')}`,
  } = {}) => {
    if (!onStepGrade) return null;
    setSavingStep(true);
    try {
      return await onStepGrade({
        stepGrade: {
          kind,
          label,
          supportLevel,
          productive: true,
          accepted: true,
          earned: 1,
          possible: 1,
          equationBefore: equationToLatex(beforeEquation),
          equationAfter: equationToLatex(nextEquation),
          expectedTotalPoints: Number(question.expectedStepPoints || 6),
        },
        countsAttempt: false,
        statePatch: {
          algebraState: {
            equation: nextEquation,
            supportLevel,
            stepNumber: Number(normalizedRecord.algebraState?.stepNumber || 0) + 1,
          },
          questionDetails: `Current equation: $${equationToLatex(nextEquation)}$`,
        },
      });
    } finally {
      setSavingStep(false);
    }
  };

  const checkLikeTerms = async () => {
    if (!equation || disabled || savingStep || cancelAnimating || pendingMove || !likeTermsSide) return;
    const selection = selectedLikeTermInfo(equation[likeTermsSide], selectedLikeTermIndices);
    if (!selection.valid) {
      setMessage({ tone: 'growth', text: selection.reason || 'Choose terms that are alike before combining them.' });
      return;
    }

    if (!String(likeTermsAnswer || '').trim()) {
      setLikeTermsFocusSignal((signal) => signal + 1);
      setMessage({ tone: 'growth', text: 'You chose the terms. Now enter the single term they combine to.' });
      return;
    }

    let replacement;
    try {
      replacement = latexToExpression(likeTermsAnswer);
    } catch {
      triggerShake();
      setLikeTermsFocusSignal((signal) => signal + 1);
      setMessage({ tone: 'error', text: 'MathMaster could not read that combined term yet.' });
      return;
    }

    if (!replacementIsSingleLikeTerm(replacement, selection.key)) {
      triggerShake();
      setLikeTermsFocusSignal((signal) => signal + 1);
      setMessage({
        tone: 'growth',
        text: 'Enter one combined term with the same variable part. Do not re-enter the two original terms.',
      });
      return;
    }

    if (!expressionsEquivalent(selection.selectedExpression, replacement, equation.variable)) {
      triggerShake();
      setLikeTermsFocusSignal((signal) => signal + 1);
      setMessage({
        tone: 'growth',
        text: 'Those terms are alike, but that coefficient does not equal their sum. Recheck the signs and coefficients.',
      });
      return;
    }

    const nextSide = replaceSelectedLikeTerms(equation[likeTermsSide], selection.indices, replacement);
    if (!nextSide) {
      setMessage({ tone: 'error', text: 'That combination could not be placed back into the equation safely. Your work was not changed.' });
      return;
    }

    const beforeEquation = equation;
    const nextEquation = { ...equation, [likeTermsSide]: nextSide };
    await persistStudentRewrite(beforeEquation, nextEquation, [likeTermsSide], {
      kind: 'combine-like-terms',
      label: `Combine like terms on the ${likeTermsSide} side`,
    });
    pushCommittedEquation(beforeEquation, describedStep('combine-like-terms', [`Combined like terms on the ${likeTermsSide} side`], nextEquation));
    setEquation(nextEquation);
    if (inlineExpressionTools) {
      setSelectedLikeTermIndices([]);
      setLikeTermsAnswer('');
      setLikeTermsSide('');
    } else {
      closeLikeTermsTool();
    }
    setBalancePulse(true);
    window.setTimeout(() => setBalancePulse(false), motionDuration(650, reducedMotion, { floor: 60 }));
    setMessage({
      tone: 'success',
      text: 'Like terms combined. You chose the terms and supplied the combined term; MathMaster only checked the algebra.',
    });
  };

  const checkInlineRewrite = async () => {
    if (!inlineExpressionTools || !equation || disabled || savingStep || cancelAnimating || pendingMove) return;
    const side = inlineRewriteSelection?.side;
    const index = Number(inlineRewriteSelection?.index);
    const terms = side ? (splitAdditiveTerms(equation[side]) || []) : [];
    const term = Number.isInteger(index) ? terms[index] : null;
    if (!side || !term) return;

    if (!String(inlineRewriteAnswer || '').trim()) {
      setInlineRewriteFocusSignal((signal) => signal + 1);
      return;
    }

    let replacement;
    try {
      replacement = latexToExpression(inlineRewriteAnswer);
    } catch {
      triggerShake();
      setInlineRewriteFocusSignal((signal) => signal + 1);
      setMessage({ tone: 'error', text: 'MathMaster could not read that equivalent term yet.' });
      return;
    }

    const replacementTerms = splitAdditiveTerms(replacement) || [];
    if (replacementTerms.length !== 1) {
      triggerShake();
      setInlineRewriteFocusSignal((signal) => signal + 1);
      setMessage({ tone: 'growth', text: 'Rewrite only the selected term. Keep the rest of the side where it is.' });
      return;
    }

    if (!expressionsEquivalent(term.text, replacement, equation.variable)) {
      triggerShake();
      setInlineRewriteFocusSignal((signal) => signal + 1);
      setMessage({ tone: 'growth', text: 'That replacement is not equivalent to the selected term.' });
      return;
    }

    const nextSide = replaceSingleAdditiveTerm(equation[side], index, replacement);
    if (!nextSide) {
      setMessage({ tone: 'error', text: 'That term could not be placed back into the equation safely. Your work was not changed.' });
      return;
    }
    const beforeKey = String(equation[side] || '').replace(/\s+/g, '');
    const afterKey = String(nextSide || '').replace(/\s+/g, '');
    if (beforeKey === afterKey) {
      setInlineRewriteFocusSignal((signal) => signal + 1);
      setMessage({ tone: 'growth', text: 'That keeps the selected term exactly as written.' });
      return;
    }

    const beforeEquation = equation;
    const nextEquation = { ...equation, [side]: nextSide };
    await persistStudentRewrite(beforeEquation, nextEquation, [side], {
      kind: 'inline-term-rewrite',
      label: `Rewrite one term on the ${side} side`,
    });
    pushCommittedEquation(beforeEquation, describedStep('inline-term-rewrite', [`Rewrote a term on the ${side} side`], nextEquation));
    setEquation(nextEquation);
    setInlineRewriteSelection({ side: null, index: null });
    setInlineRewriteAnswer('');
    setBalancePulse(true);
    window.setTimeout(() => setBalancePulse(false), motionDuration(650, reducedMotion, { floor: 60 }));
    setMessage({ tone: 'success', text: 'Equivalent term accepted.' });
  };

  const checkStudentRewrite = async () => {
    if (!equation || disabled || savingStep || cancelAnimating || pendingMove) return;

    const sides = rewriteSidesForScope();
    const enteredSides = sides.filter((side) => String(rewriteAnswers[side] || '').trim());

    if (!enteredSides.length) {
      setRewriteFocusSignal((signal) => signal + 1);
      setMessage({
        tone: 'growth',
        text: 'Enter the expression you want MathMaster to check. The platform will not generate the simplification for you.',
      });
      return;
    }

    const parsed = {};
    try {
      enteredSides.forEach((side) => {
        parsed[side] = latexToExpression(rewriteAnswers[side]);
      });
    } catch {
      triggerShake();
      setRewriteFocusSignal((signal) => signal + 1);
      setMessage({
        tone: 'error',
        text: 'MathMaster could not read that expression yet. Enter only the expression for that side, not an equals sign.',
      });
      return;
    }

    const incorrect = enteredSides.filter((side) => {
      try {
        return !expressionsEquivalent(parsed[side], equation[side], equation.variable);
      } catch {
        return true;
      }
    });

    if (incorrect.length) {
      triggerShake();
      setRewriteFocusSignal((signal) => signal + 1);
      setMessage({
        tone: 'growth',
        text: `That rewrite is not equivalent on the ${incorrect.join(' and ')} side${incorrect.length > 1 ? 's' : ''}. Your equation has not been changed.`,
      });
      return;
    }

    const nextEquation = { ...equation };
    const changedSides = [];
    enteredSides.forEach((side) => {
      const before = String(equation[side] || '').replace(/\s+/g, '');
      const after = String(parsed[side] || '').replace(/\s+/g, '');
      if (before !== after) {
        nextEquation[side] = parsed[side];
        changedSides.push(side);
      }
    });

    if (!changedSides.length) {
      setRewriteFocusSignal((signal) => signal + 1);
      setMessage({
        tone: 'growth',
        text: 'That is equivalent, but it is already the expression shown. Enter a different equivalent rewrite if you want to change the workspace.',
      });
      return;
    }

    await persistStudentRewrite(equation, nextEquation, changedSides);
    pushCommittedEquation(equation, describedStep('student-rewrite', [changedSides.length > 1 ? 'Rewrote both sides' : `Rewrote the ${changedSides[0]} side`], nextEquation));
    setEquation(nextEquation);
    setRewriteAnswers({ left: '', right: '' });
    setRewriteOpen(false);
    setBalancePulse(true);
    window.setTimeout(
      () => setBalancePulse(false),
      motionDuration(650, reducedMotion, { floor: 60 }),
    );
    setMessage({
      tone: 'success',
      text: `Rewrite accepted. You supplied the ${changedSides.join(' and ')} expression${changedSides.length > 1 ? 's' : ''}; MathMaster only checked equivalence.`,
    });
  };

  // DISTRIBUTION: copy an outside factor to every signed term of an additive
  // parenthetical group, e.g. `-(2/3)(x + 3)`. This is its own algebra step,
  // separate from simplification: committing leaves the expanded products
  // unsimplified (`(-2/3)(x) + (-2/3)(3)`), and the existing Rewrite/Simplify
  // flow above is what evaluates them afterward. See algebraDistributionModel.js.
  const distributable = useMemo(() => detectDistributableGroup(equation), [equation]);
  const autoDistributionOpenedForRef = useRef('');

  useEffect(() => {
    if (!autoOpenDistribution || !distributable || disabled || savingStep || cancelAnimating || pendingMove || distributionState) return;
    const equationKey = `${equation?.left || ''}=${equation?.right || ''}`;
    if (!equationKey || autoDistributionOpenedForRef.current === equationKey) return;
    autoDistributionOpenedForRef.current = equationKey;
    setArmedTile(null);
    setTapPlacementArmed(false);
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setOperand('');
    setRewriteOpen(false);
    closeLikeTermsTool();
    setStructureTool(null);
    setDistributionState(initDistributionState(distributable));
    setMessage({
      tone: 'growth',
      text: inlineExpressionTools
        ? 'The substitution created a distributive step. Work directly on the equation.'
        : 'The substitution created a distributive step. Apply the outside factor to each term, then combine like terms.',
    });
  }, [
    autoOpenDistribution,
    distributable,
    disabled,
    savingStep,
    cancelAnimating,
    pendingMove,
    distributionState,
    equation,
    inlineExpressionTools,
  ]);

  const openDistributionTool = () => {
    if (disabled || savingStep || cancelAnimating || pendingMove || !distributable) return;
    setArmedTile(null);
    setTapPlacementArmed(false);
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setOperand('');
    setRewriteOpen(false);
    closeLikeTermsTool();
    setStructureTool(null);
    setDistributionState(initDistributionState(distributable));
    setMessage(null);
  };

  const cancelDistribution = () => setDistributionState(null);

  const armDistributionFactor = () => {
    if (disabled) return;
    setDistributionState((current) => armDistributionFactorState(current));
  };

  const placeDistributionFactor = (termIndex) => {
    if (disabled) return;
    setDistributionState((current) => placeDistributionTermState(current, termIndex));
  };

  const commitDistributionStep = async () => {
    if (disabled || savingStep || cancelAnimating || !isDistributionComplete(distributionState)) return;
    const nextEquation = commitDistribution(equation, distributionState, {
      simplifyProducts: simplifyDistributedProducts,
    });
    if (!nextEquation) return;
    if (onStepGrade) {
      setSavingStep(true);
      try {
        await onStepGrade({
          stepGrade: {
            kind: 'distribution',
            label: `Distribute ${distributionState.factorText} over (${distributionState.groupText})`,
            supportLevel,
            productive: true,
            accepted: true,
            earned: 1,
            possible: 1,
            equationBefore: equationToLatex(equation),
            equationAfter: equationToLatex(nextEquation),
            expectedTotalPoints: Number(question.expectedStepPoints || 6),
          },
          countsAttempt: false,
          statePatch: {
            algebraState: { equation: nextEquation, supportLevel, stepNumber: Number(normalizedRecord.algebraState?.stepNumber || 0) + 1 },
            questionDetails: `Current equation: $${equationToLatex(nextEquation)}$`,
          },
        });
      } finally {
        setSavingStep(false);
      }
    }
    pushCommittedEquation(equation, describedStep('distribution', ['Distributed ', { latex: distributionState.factorLatex }, ` on the ${distributionState.side} side`], nextEquation));
    setEquation(nextEquation);
    setDistributionState(null);
    setBalancePulse(true);
    window.setTimeout(() => setBalancePulse(false), motionDuration(650, reducedMotion, { floor: 60 }));
    setMessage({
      tone: 'success',
      text: inlineExpressionTools
        ? 'Distribution complete.'
        : simplifyDistributedProducts
          ? 'Distribution complete. The individual products are evaluated; combine like terms next.'
          : 'Distribution complete. The products are not simplified yet — use Rewrite / Simplify to evaluate them, or continue solving.',
    });
  };

  // STRUCTURE TOOLS: Factor, Split fraction, Cancel factors, Simplify
  // arithmetic, Arrange terms. Each is offered only when the committed equation
  // has the structure it acts on (see algebraStructureTools.js), works directly
  // on the equation, and changes nothing until the student commits it. A side
  // that already shows a cancellation pair keeps that interaction instead.
  const cancellationActiveSides = useMemo(() => {
    if (!equation || pendingMove) return [];
    return ['left', 'right'].filter((side) => {
      try {
        return Boolean(buildCancellationModel(equation[side], null, equation.variable, [])?.pairs?.length);
      } catch {
        return false;
      }
    });
  }, [equation, pendingMove]);
  const lineObjective = ['slopeIntercept', 'factoredLinear', 'linearStandardForm'].includes(equation?.objective?.kind);
  const structureOptions = useMemo(() => {
    const detected = detectStructureTools(pendingMove ? null : equation, { excludeSides: cancellationActiveSides });
    // Reordering terms is part of reaching a line's written form; ordinary
    // solving does not need it offered on every multi-term side.
    return lineObjective ? detected : { ...detected, arrange: [] };
  }, [equation, pendingMove, cancellationActiveSides, lineObjective]);

  const updateStructureTool = (change) => setStructureTool((current) => (current ? (change(current) ?? current) : current));

  const toggleStructureTool = (kind) => {
    if (disabled || savingStep || cancelAnimating) return;
    if (pendingMove) {
      setMessage({ tone: 'growth', text: 'Finish the balanced operation already in progress first.' });
      return;
    }
    if (structureTool?.kind === kind) {
      setStructureTool(null);
      setMessage(null);
      return;
    }
    setArmedTile(null);
    setTapPlacementArmed(false);
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setOperand('');
    closeRewriteTool();
    closeLikeTermsTool();
    setDistributionState(null);
    setStructureTool(openStructureTool(kind, equation));
    setMessage(null);
  };

  // `latestTool` lets an answer box commit what was typed on the very keystroke
  // before Enter, even if that keystroke has not re-rendered yet. It must be
  // the same tool, on the same equation; anything else is ignored.
  const commitStructureToolStep = async (latestTool = null) => {
    if (!structureTool || !equation || disabled || savingStep || cancelAnimating || pendingMove) return;
    const tool = latestTool && latestTool.kind === structureTool.kind && latestTool.equationKey === structureTool.equationKey
      ? latestTool
      : structureTool;
    const result = commitStructureTool(tool, equation);
    if (!result.ok) {
      triggerShake();
      setMessage({
        tone: 'growth',
        text: result.reason === 'stale'
          ? 'The equation changed, so that step was not applied. Start it again.'
          : 'That step is not finished yet. Your equation has not been changed.',
      });
      return;
    }
    const beforeEquation = equation;
    const nextEquation = result.equation;
    const changedSides = ['left', 'right'].filter((side) => nextEquation[side] !== beforeEquation[side]);
    await persistStudentRewrite(beforeEquation, nextEquation, changedSides, {
      kind: result.step.kind,
      label: result.step.description,
    });
    pushCommittedEquation(beforeEquation, { ...result.step, after: nextEquation });
    setEquation(nextEquation);
    setStructureTool(null);
    setBalancePulse(true);
    window.setTimeout(() => setBalancePulse(false), motionDuration(650, reducedMotion, { floor: 60 }));
    setMessage({
      tone: 'success',
      text: isSolvedEquation(nextEquation)
        ? `${result.step.description}. The equation is now in the target form.`
        : `${result.step.description}. You did the algebra; MathMaster only checked it.`,
    });
  };

  const resetQuestionWork = () => {
    if (disabled || savingStep || !pristineEquation) return;
    const confirmed = typeof window === 'undefined' || window.confirm('Start this problem over? Your current workspace work will be cleared, but your attempt count will not change.');
    if (!confirmed) return;

    setEquation(pristineEquation);
    setCommittedHistory([]);
    setWorkSteps([]);
    setStructureTool(null);
    setOperand('');
    setDistributionState(null);
    setPendingMove(null);
    setCrossedSides([]);
    setCancelledPairIds({});
    setSelectedCancellationIndices({});
    setSimplificationAnswers({});
    setPromptAnswers({});
    setRewriteOpen(false);
    setRewriteScope('left');
    setRewriteAnswers({ left: '', right: '' });
    setLikeTermsOpen(false);
    setLikeTermsSide('');
    setSelectedLikeTermIndices([]);
    setLikeTermsAnswer('');
    setStroke(null);
    setLockedStroke(null);
    setStruckTerms(null);
    setCollapsingSides([]);
    setArmedTile(null);
    setTapPlacementArmed(false);
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setHeldToken(null);
    setMessage({ tone: 'growth', text: 'Workspace reset to the original equation. Your attempt count did not change.' });
  };

  const attemptMove = async (operation, _originSide = 'left', placementBySideOverride = null) => {
    if (disabled || savingStep || pendingMove || !operation) return;
    if (!String(operand || '').trim()) {
      setMessage({ tone: 'growth', text: 'Enter the value or expression for the operation first.' });
      return;
    }
    setMessage(null);
    let move;
    try {
      move = applyBalancedOperation({ equationState: equation, operation, operand, placementBySide: placementBySideOverride || placedOperationPositions });
    } catch (error) {
      triggerShake();
      setMessage({ tone: 'error', text: error.message });
      return;
    }
    setArmedTile(null);
    placedOperationSidesRef.current = [];
    placedOperationPositionsRef.current = {};
    setPlacedOperationSides([]);
    setPlacedOperationPositions({});
    setPendingMove(move);
    setCrossedSides([]);
    setCancelledPairIds({});
    setSelectedCancellationIndices({});
    setSimplificationAnswers({});
    setSelectedCancellationIndices({});

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
      const result = await saveStep({ move, earned: 1, possible: 2, countsAttempt: !attemptsDoNotExpire, accepted: true });
      if (result?.expired) {
        setPendingMove(null);
        setMessage({ tone: 'error', text: 'That used the final attempt on this version.' });
        return;
      }
      setMessage({ tone: 'growth', text: attemptsDoNotExpire ? verdict.message : `${verdict.message} ${result?.remainingAttempts ?? getAttemptsRemaining(normalizedRecord, maximumAttempts)} attempts remain at this level.` });
    }

    if (move.requiredCancellationSides.length === 0) {
      if (move.simplificationTargets?.length) {
        setMessage({ tone: 'growth', text: 'The operation is balanced. You may simplify the remaining side(s), or keep the equivalent equation as written and continue.' });
      } else {
        // Nothing remains to cancel or simplify: the operation itself completed
        // this step. Commit instead of showing an empty/redundant response area.
        await commitMove(move);
      }
    } else {
      setMessage({
        tone: cancellationHintsEnabled ? 'success' : 'growth',
        text: cancellationHintsEnabled
          ? 'The operation is balanced. Draw directly through matching factors in the equation itself.'
          : 'The operation is balanced. Find the matching factors in the equation and cancel them directly — hints are off.',
      });
    }
  };

  // --- Freehand cancellation -----------------------------------------------
  // Pointer Events throughout, so mouse, touch and stylus are one code path,
  // and pointer capture so a stroke that wanders outside the box keeps
  // reporting rather than silently ending.
  const localPoint = (event, element) => {
    const box = element?.getBoundingClientRect();
    if (!box) return null;
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const beginStroke = (side, event) => {
    if (cancelAnimating || disabled) return;
    const element = event.currentTarget;
    strokeBoxRef.current = element;
    // Capture is taken in extendStroke, not here. Capturing on pointerdown
    // retargets the click to this box, so a student who TAPPED a term to
    // select it never reached the term's own handler — silently disabling
    // click-to-cancel, the alternative built for anyone who cannot swipe.
    const point = localPoint(event, element);
    if (point) setStroke({ side, points: createStroke(point) });
  };

  const extendStroke = (event) => {
    if (!stroke) return;
    const element = strokeBoxRef.current;
    const point = localPoint(event, element);
    if (!point) return;
    // Once the pointer has actually travelled this is a stroke, not a tap, and
    // capture keeps it reporting even if it wanders outside the box.
    if (element?.setPointerCapture && !element.hasPointerCapture?.(event.pointerId)) {
      element.setPointerCapture(event.pointerId);
    }
    setStroke((current) => {
      if (!current) return current;
      const next = appendStrokePoint(current.points, point);
      return next === current.points ? current : { ...current, points: next };
    });
  };

  // The rectangles are read from the ACTUAL equation tokens at the moment the
  // stroke ends. Each factor/term has a generous invisible hit area, so a
  // Chromebook trackpad or finger does not have to pass through the exact
  // center of a small italic letter.
  const collectTermRects = () => {
    const element = strokeBoxRef.current;
    if (!element) return [];
    const box = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll('[data-cancel-index]')).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        index: Number(node.getAttribute('data-cancel-index')),
        rect: {
          left: rect.left - box.left,
          right: rect.right - box.left,
          top: rect.top - box.top,
          bottom: rect.bottom - box.top,
        },
      };
    });
  };

  const commitStandaloneCancellation = async (side, model) => {
    if (!model?.resultExpression || savingStep || cancelAnimating) return;

    const beforeEquation = equation;
    const nextEquation = { ...equation, [side]: model.resultExpression };

    setCancelAnimating(true);
    setCollapsingSides([side]);

    window.setTimeout(async () => {
      try {
        if (onStepGrade) {
          setSavingStep(true);
          await onStepGrade({
            stepGrade: {
              kind: 'student-cancellation',
              label: `Cancel matching terms on the ${side} side`,
              supportLevel,
              productive: true,
              accepted: true,
              earned: 1,
              possible: 1,
              equationBefore: equationToLatex(beforeEquation),
              equationAfter: equationToLatex(nextEquation),
              expectedTotalPoints: Number(question.expectedStepPoints || 6),
            },
            countsAttempt: false,
            statePatch: {
              algebraState: {
                equation: nextEquation,
                supportLevel,
                stepNumber: Number(normalizedRecord.algebraState?.stepNumber || 0) + 1,
              },
              questionDetails: `Current equation: $${equationToLatex(nextEquation)}$`,
            },
          });
        }

        pushCommittedEquation(beforeEquation, describedStep('student-cancellation', [`Cancelled matching ${model.kind === 'additive' ? 'terms' : 'factors'} on the ${side} side`], nextEquation));
        setEquation(nextEquation);
        setCancelledPairIds((current) => ({ ...current, [side]: [] }));
        setSelectedCancellationIndices((current) => ({ ...current, [side]: [] }));
        setLockedStroke(null);
        setStruckTerms(null);
        setCollapsingSides([]);
        setCancelAnimating(false);
        setBalancePulse(true);
        window.setTimeout(() => setBalancePulse(false), motionDuration(650, reducedMotion, { floor: 60 }));
        setMessage({
          tone: 'success',
          text: 'Cancellation complete. Continue from the equation shown.',
        });
      } finally {
        setSavingStep(false);
        setCancelAnimating(false);
      }
    }, motionDuration(420, reducedMotion, { floor: 40 }));
  };

  const registerCancellationHits = async (side, hitIndices, model) => {
    if (!model?.pairs?.length || !hitIndices?.length) return;

    const progress = advanceCancellationProgress({
      pairs: model.pairs,
      completedPairIds: cancelledPairIds[side] || [],
      selectedIndices: selectedCancellationIndices[side] || [],
      hitIndices,
    });

    if (!progress.acceptedAny) {
      setMessage({ tone: 'growth', text: 'That factor is not part of a cancellation pair in this step.' });
      return;
    }

    setCancelledPairIds((current) => ({ ...current, [side]: progress.completedPairIds }));
    setSelectedCancellationIndices((current) => ({ ...current, [side]: progress.selectedIndices }));

    if (progress.allPairsComplete) {
      setSelectedCancellationIndices((current) => ({ ...current, [side]: [] }));
      const pairCount = model.pairs.length;
      setMessage({
        tone: 'success',
        text: pairCount > 1
          ? `All ${pairCount} cancellation pairs are complete.`
          : 'That cancellation pair is complete.',
      });

      // Once every visible pair has been identified, apply the cancellation
      // immediately. Requiring a separate "Finish cancellations" click made
      // a single algebraic cancellation feel like it had to be performed twice.
      if (pendingMove) await strikeSide(side);
      else await commitStandaloneCancellation(side, model);
      return;
    }

    const remainingPairs = model.pairs.length - progress.completedPairIds.length;
    if (progress.newlyCompletedPairIds.length > 1) {
      setMessage({ tone: 'success', text: `${progress.newlyCompletedPairIds.length} cancellation pairs completed in one gesture. ${remainingPairs} pair${remainingPairs === 1 ? '' : 's'} remain.` });
    } else if (progress.newlyCompletedPairIds.length === 1) {
      setMessage({ tone: 'success', text: `That cancellation pair is complete. ${remainingPairs} pair${remainingPairs === 1 ? '' : 's'} remain.` });
    } else {
      setMessage({ tone: 'growth', text: 'Tap or slash one member of a valid cancellation pair. MathMaster will cross out its matching partner with it.' });
    }
  };

  const finishStroke = async (side, model) => {
    const current = stroke;
    setStroke(null);
    if (!current || current.side !== side) return;

    const termRects = collectTermRects();
    const struck = resolveStruckTerms(current.points, termRects, { padding: 16 });
    // A tiny stationary tap belongs to the token click handler. A real slash
    // may cross ONE factor now; the matching slash can be drawn separately.
    if (strokeLength(current.points) < 8) return;

    if (!struck.length) {
      triggerShake();
      setLockedStroke(null);
      setStruckTerms(null);
      setMessage({ tone: 'growth', text: 'That line missed the algebra. Draw directly through a factor that has a matching factor above or below the fraction bar.' });
      return;
    }

    setLockedStroke({ side, points: current.points });
    setStruckTerms({ side, indices: struck });
    await registerCancellationHits(side, struck, model);
  };

  const strikeSide = async (side) => {
    if (!pendingMove || cancelAnimating) return;
    const valid = pendingMove.requiredCancellationSides.includes(side);
    if (!valid) {
      triggerShake();
      if (supportPolicy.inefficientMoveCostsAttempt) {
        const result = await saveStep({ move: pendingMove, earned: 0, possible: 1, countsAttempt: true, accepted: false });
        setMessage({ tone: 'error', text: result?.expired ? 'The third invalid cancellation used the final attempt.' : `That side does not contain the cancellation for this move. ${result?.remainingAttempts ?? getAttemptsRemaining(normalizedRecord, maximumAttempts)} attempts remain.` });
        if (result?.expired) { setPendingMove(null); setSelectedCancellationIndices({}); }
      } else setMessage({ tone: 'growth', text: 'That side does not contain the cancellation pair. Look at the factors in the other side.' });
      return;
    }
    const next = [...new Set([...crossedSides, side])];
    setCrossedSides(next);
    const allRequired = pendingMove.requiredCancellationSides.every((requiredSide) => next.includes(requiredSide));
    if (allRequired) {
      if (pendingMove.simplificationTargets?.length) setMessage({ tone: 'success', text: 'The cancellation is complete. Simplify the remaining side(s), or keep them as written and continue.' });
      else await commitMove(pendingMove, { crossedSidesOverride: next });
    }
  };

  // Click/tap is the accessibility alternative to drawing. The same progress
  // reducer supports several half-marked pairs at once, so compound factors do
  // not force an artificial one-pair-at-a-time workflow.
  const handleTermClick = (side, index, model) => {
    if (cancelAnimating) return;
    registerCancellationHits(side, [index], model);
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
      setMessage({ tone: 'error', text: 'The simplification is correct. Finish the matching-factor cancellation directly in the equation before completing this step.' });
      return;
    }
    await commitMove(pendingMove, { resolution: 'simplified' });
  };

  // --- Semantic operation placement ---------------------------------------
  // The operation token is placed ON the mathematics, not into a prescribed
  // drop box. The hit zones are intentionally generous: the student must know
  // which side (and, for multiplication/division, which mathematical region)
  // the operation belongs to, but should not be graded on trackpad precision.
  const expressionRectForSide = (side) => (side === 'left' ? leftExpressionRef : rightExpressionRef).current?.getBoundingClientRect();
  const sideRectFor = (side) => (side === 'left' ? leftSideRef : rightSideRef).current?.getBoundingClientRect();

  const updateFactorZones = (clientX, clientY) => {
    const operation = dragRef.current?.operation;
    const candidates = [];
    ['left', 'right'].forEach((side) => {
      const expressionRect = expressionRectForSide(side);
      const sideRect = sideRectFor(side);
      if (!expressionRect || !sideRect) return;

      if (operation === 'multiply') {
        const y = expressionRect.top + expressionRect.height / 2;
        candidates.push({ side, position: 'before', x: expressionRect.left, y, xRadius: 96, yRadius: Math.max(70, expressionRect.height * 0.9) });
        candidates.push({ side, position: 'after', x: expressionRect.right, y, xRadius: 96, yRadius: Math.max(70, expressionRect.height * 0.9) });
      } else if (operation === 'divide') {
        // Division belongs beneath the whole expression. Any reasonable drop
        // below the expression is accepted; there is no tiny fraction-bar box.
        candidates.push({
          side,
          position: 'below',
          x: expressionRect.left + expressionRect.width / 2,
          y: Math.min(sideRect.bottom - 28, expressionRect.bottom + Math.max(42, expressionRect.height * 0.45)),
          xRadius: Math.max(120, expressionRect.width / 2 + 80),
          yRadius: Math.max(90, (sideRect.bottom - expressionRect.bottom) * 0.82),
        });
      }
    });

    let nearest = null;
    let nearestDist = Infinity;
    candidates.forEach((candidate) => {
      const dx = Math.abs(clientX - candidate.x);
      const dy = Math.abs(clientY - candidate.y);
      if (dx <= candidate.xRadius && dy <= candidate.yRadius) {
        const dist = Math.hypot(dx / candidate.xRadius, dy / candidate.yRadius);
        if (dist < nearestDist) { nearestDist = dist; nearest = candidate; }
      }
    });

    // Keep the current target until the pointer has clearly left its enlarged
    // hit region. Neighboring zones otherwise trade ownership frame-by-frame
    // near a boundary and make the drag preview visibly shake.
    const previous = factorZoneRef.current;
    const stillInsidePrevious = previous?.xRadius && previous?.yRadius
      && Math.abs(clientX - previous.x) <= previous.xRadius * 1.18
      && Math.abs(clientY - previous.y) <= previous.yRadius * 1.18;
    const stable = stillInsidePrevious ? previous : nearest;

    factorZoneRef.current = stable;
    setFactorZoneHint(stable);
    const side = stable?.side || null;
    dragOverSideRef.current = side;
    setDragOverSide(side);
  };

  const resolveAdditivePlacementFromPoint = (side, clientX, clientY) => {
    const expressionRoot = (side === 'left' ? leftExpressionRef : rightExpressionRef).current;
    const sideRect = sideRectFor(side);
    if (!expressionRoot || !sideRect) return null;
    if (clientX < sideRect.left || clientX > sideRect.right || clientY < sideRect.top || clientY > sideRect.bottom) return null;

    const nodes = Array.from(expressionRoot.querySelectorAll('[data-term-index]'));
    if (!nodes.length) return { side, position: { kind: 'end', termIndex: 0 } };
    const candidates = [];
    nodes.forEach((node) => {
      const termIndex = Number(node.getAttribute('data-term-index'));
      if (!Number.isInteger(termIndex)) return;
      const rect = node.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      candidates.push({
        side,
        position: { kind: 'before', termIndex },
        x: rect.left,
        y,
        xRadius: 48,
        yRadius: Math.max(58, rect.height * 1.2),
      });
      candidates.push({
        side,
        position: { kind: 'after', termIndex },
        x: rect.right,
        y,
        xRadius: 48,
        yRadius: Math.max(58, rect.height * 1.2),
      });
      candidates.push({
        side,
        position: { kind: 'under', termIndex },
        x: rect.left + rect.width / 2,
        y: Math.min(sideRect.bottom - 22, rect.bottom + 42),
        xRadius: Math.max(52, rect.width * 0.8),
        yRadius: 70,
      });
    });
    let nearest = null;
    let nearestDistance = Infinity;
    candidates.forEach((candidate) => {
      const dx = Math.abs(clientX - candidate.x);
      const dy = Math.abs(clientY - candidate.y);
      if (dx > candidate.xRadius || dy > candidate.yRadius) return;
      const distance = Math.hypot(dx / candidate.xRadius, dy / candidate.yRadius);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = candidate;
      }
    });
    if (nearest) return nearest;
    const lastNode = nodes[nodes.length - 1];
    const lastRect = lastNode?.getBoundingClientRect?.();
    return {
      side,
      position: {
        kind: 'end',
        termIndex: Math.max(0, nodes.length - 1),
      },
      x: lastRect?.right ?? (sideRect.left + sideRect.width / 2),
      y: lastRect ? (lastRect.top + lastRect.height / 2) : (sideRect.top + sideRect.height / 2),
      xRadius: Math.max(56, lastRect?.width || 56),
      yRadius: Math.max(64, lastRect?.height || 64),
    };
  };
  const updateAdditiveZones = (clientX, clientY) => {
    const left = resolveAdditivePlacementFromPoint('left', clientX, clientY);
    const right = resolveAdditivePlacementFromPoint('right', clientX, clientY);
    const nearest = left || right;
    const previous = factorZoneRef.current;
    const stillInsidePrevious = previous?.xRadius && previous?.yRadius
      && Math.abs(clientX - previous.x) <= previous.xRadius * 1.18
      && Math.abs(clientY - previous.y) <= previous.yRadius * 1.18;
    const stable = stillInsidePrevious ? previous : nearest;
    factorZoneRef.current = stable;
    setFactorZoneHint(stable);
    const side = stable?.side || null;
    dragOverSideRef.current = side;
    setDragOverSide(side);
  };
  const updatePointerVisuals = (clientX, clientY) => {
    if (isFactorOperation(dragRef.current?.operation)) updateFactorZones(clientX, clientY);
    else updateAdditiveZones(clientX, clientY);
  };
  const beginPointerDrag = (operation, event) => {
    if (disabled || savingStep || pendingMove) return;
    if (!String(operand || '').trim()) {
      setMessage({ tone: 'growth', text: 'Type the operation value or expression first.' });
      setOperationFocusSignal((value) => value + 1);
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const label = describeOperationToken(operation, operand);
    dragRef.current = { operation, label, pointerId: event.pointerId };
    setHeldToken({ x: event.clientX, y: event.clientY, label });
    setMessage(null);
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

  const stagePlacement = async (side, position = 'side') => {
    if (!armedTile || pendingMove || disabled || savingStep) return;

    // Read the synchronous mirrors, not the render-time state values. Pointer
    // up/click events for the second side can arrive before React commits the
    // first placement render. Using the stale closure there made a legitimate
    // "same move on both sides" look as though only one side had been changed.
    const result = stageOperationPlacement({ placedSides: placedOperationSidesRef.current, side });
    if (result.duplicate) {
      setMessage({ tone: 'growth', text: `That operation is already on the ${side} side. Restore the balance by placing the same move on the ${result.missingSide} side.` });
      return;
    }
    if (!result.accepted) return;

    const nextPositions = { ...placedOperationPositionsRef.current, [side]: position };
    placedOperationSidesRef.current = result.placedSides;
    placedOperationPositionsRef.current = nextPositions;
    setPlacedOperationSides(result.placedSides);
    setPlacedOperationPositions(nextPositions);

    if (!result.ready) {
      setMessage({ tone: 'growth', text: `The ${side} side has changed. The equation is not balanced yet — place the same operation on the ${result.missingSide} side.` });
      return;
    }

    // Both placements are now student-authored. Only now do we invoke the
    // balanced algebra engine and begin cancellation/simplification.
    await attemptMove(armedTile.operation, result.placedSides[0] || side, nextPositions);
  };

  const endPointerDrag = (event, commit) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (rafRef.current) { window.cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const side = dragOverSideRef.current;
    const factorZone = factorZoneRef.current;
    setHeldToken(null);
    setDragOverSide(null);
    setFactorZoneHint(null);
    dragOverSideRef.current = null;
    factorZoneRef.current = null;
    if (!drag || !commit) return;

    if (isFactorOperation(drag.operation)) {
      if (factorZone?.side) {
        stagePlacement(factorZone.side, factorZone.position);
      } else {
        triggerShake();
        setMessage({
          tone: 'growth',
          text: drag.operation === 'multiply'
            ? 'Multiplication applies to the whole side. Place the factor next to the expression.'
            : 'Division applies to the whole side. Place the divisor beneath the expression.',
        });
      }
      return;
    }

    if (side) stagePlacement(side, factorZone?.position || { kind: 'end', termIndex: 0 });
    else setMessage({ tone: 'growth', text: 'Place the operation on one side of the equation.' });
  };

  const onDragPointerUp = (event) => {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    endPointerDrag(event, true);
  };

  const onDragPointerCancel = (event) => endPointerDrag(event, false);

  const selectOperation = (operation, sourceSide) => {
    if (disabled || savingStep || pendingMove) return;
    setRewriteOpen(false);
    setRewriteAnswers({ left: '', right: '' });
    closeLikeTermsTool();
    setStructureTool(null);
    const switching = armedTile?.operation !== operation;
    setArmedTile({ operation, sourceSide });
    setTapPlacementArmed(false);
    if (switching || placedOperationSidesRef.current.length) {
      setOperand('');
      placedOperationSidesRef.current = [];
      placedOperationPositionsRef.current = {};
      setPlacedOperationSides([]);
      setPlacedOperationPositions({});
    }
    setMessage(null);
    setOperationFocusSignal((value) => value + 1);
  };

  const activateTapPlacement = () => {
    // The `isMobile` guard used to live here too, so even a caller that reached
    // this function on a desktop was turned away at the door.
    if (!armedTile || pendingMove || disabled || savingStep) return;
    if (!String(operand || '').trim()) {
      setMessage({ tone: 'growth', text: 'Type the operation value or expression first.' });
      setOperationFocusSignal((value) => value + 1);
      return;
    }
    setTapPlacementArmed(true);
    setMathToolsCollapseSignal((value) => value + 1);
    setMessage({ tone: 'growth', text: `${describeOperation(armedTile.operation, operand)} is ready. ${placementInstructionForOperation(armedTile.operation)}` });
    window.requestAnimationFrame(() => {
      equalsRef.current?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  };

  const tapPlacementOnSide = (side, event) => {
    if (!tapPlacementArmed || !armedTile || pendingMove || disabled || savingStep) return;
    const additiveTarget = !isFactorOperation(armedTile.operation)
      ? resolveAdditivePlacementFromPoint(side, event?.clientX, event?.clientY)
      : null;
    const position = additiveTarget?.position || semanticPlacementFromTap({
      operation: armedTile.operation,
      clientX: event?.clientX,
      expressionRect: expressionRectForSide(side),
    });
    stagePlacement(side, position);
  };
  const suggestedMove = getSuggestedMove(equation);
  const attemptsRemaining = attemptsDoNotExpire ? null : getAttemptsRemaining(normalizedRecord, maximumAttempts);
  const stepCreditPercent = normalizedRecord.status === 'correct'
    ? 100
    : Math.round(Number(normalizedRecord.bestPartialCredit || 0));
  const solved = isSolvedEquation(equation);
  const inlineToolActive = Boolean(
    (inlineExpressionTools && (distributionState || rewriteOpen || likeTermsOpen)) || structureTool,
  );
  const objectiveLabel = equation.objective?.kind === 'slopeIntercept'
    ? 'Target: y = mx + b'
    : equation.objective?.kind === 'factoredLinear'
      ? 'Target: y = a(x − c)'
    : equation.objective?.kind === 'linearStandardForm'
      // Names the FORM, never the coefficients: "ay + bz = c".
      ? `Target: ${(equation.objective.variables || [equation.variable]).map((name, index) => `${String.fromCharCode(97 + index)}${name}`).join(' + ')} = ${String.fromCharCode(97 + (equation.objective.variables || [equation.variable]).length)}`
    : `Target: isolate ${equation.objective?.variable || equation.variable}${equation.objective?.requireSimplifiedFinalForm ? ' in simplified final form' : ''}`;

  const sideExpression = (side) => (pendingMove ? pendingMove.unsimplified[side] : equation[side]);
  const displayedSideLatex = (side) => pendingMove ? pendingMove.unsimplifiedLatex[side] : expressionToLatex(equation[side]);
  const sideFontSize = (side) => {
    const length = String(sideExpression(side) || '').replace(/\s+/g, '').length;
    if (length >= 42) return 23;
    if (length >= 30) return 27;
    if (length >= 22) return 30;
    return 34;
  };
  // Do not force both sides to own exactly half the board. A long left side
  // beside a short constant should borrow unused room before typography ever
  // has to shrink. This dramatically reduces the need for horizontal panning.
  const leftVisualLength = Math.max(4, String(sideExpression('left') || '').replace(/\s+/g, '').length);
  const rightVisualLength = Math.max(4, String(sideExpression('right') || '').replace(/\s+/g, '').length);
  const shorterVisualLength = Math.max(4, Math.min(leftVisualLength, rightVisualLength));
  const sideColumnWeight = (length) => Math.max(1, Math.min(2.4, Math.sqrt(length / shorterVisualLength)));
  const adaptiveBalanceColumns = mobileInteraction.isMobile
    ? undefined
    : `minmax(0, ${sideColumnWeight(leftVisualLength)}fr) 56px minmax(0, ${sideColumnWeight(rightVisualLength)}fr)`;
  // A structure tool writes one side out as tokens (primes, a fraction being
  // split); that side borrows most of the width, on a phone especially, so the
  // tokens are never clipped to the half-width the balance gives each side.
  const structureFocusSides = structureTool && !pendingMove
    ? ['left', 'right'].filter((side) => !cancellationActiveSides.includes(side) && structureToolDrawsSide(structureTool, equation, side))
    : [];
  const structureFocusColumns = structureFocusSides.length === 1
    ? (structureFocusSides[0] === 'left'
      ? `minmax(0, 3fr) ${mobileInteraction.isMobile ? 28 : 56}px minmax(0, 1fr)`
      : `minmax(0, 1fr) ${mobileInteraction.isMobile ? 28 : 56}px minmax(0, 3fr)`)
    : null;
  const balanceStagingSide = !pendingMove && placedOperationSides.length === 1 ? placedOperationSides[0] : null;
  const balanceMissingSide = balanceStagingSide === 'left' ? 'right' : balanceStagingSide === 'right' ? 'left' : null;

  const renderCancellationInk = (side) => {
    const ink = stroke?.side === side && stroke.points.length > 1
      ? { points: stroke.points, locked: false }
      : lockedStroke?.side === side && lockedStroke.points.length > 1
        ? { points: lockedStroke.points, locked: true }
        : null;
    if (!ink) return null;
    return (
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
        <path
          className={ink.locked ? 'algebra-strike-lock' : ''}
          d={strokeToPath(ink.points)}
          fill="none"
          stroke={ink.locked ? '#c5221f' : '#a50e0e'}
          strokeWidth={ink.locked ? 4 : 3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={ink.locked ? 1 : 0.85}
        />
      </svg>
    );
  };

  const renderInlineDistributionSide = (side) => {
    if (!inlineExpressionTools || !distributionState || distributionState.side !== side) return null;
    const sideTerms = Array.isArray(distributionState.sideTerms) ? distributionState.sideTerms : [];
    return (
      <span className="algebra-inline-distribution-expression">
        {sideTerms.map((sideTerm, sideTermIndex) => {
          if (sideTermIndex !== distributionState.sideTermIndex) {
            return (
              <span key={`ordinary-${sideTermIndex}`} className="algebra-inline-ordinary-term">
                <MathDisplay value={sideTerm.latex || expressionToLatex(sideTerm.text)} format="latex" inline style={{ fontSize: 'inherit' }} />
              </span>
            );
          }
          const needsLeadingPlus = sideTermIndex > 0 && sideTerm.sign >= 0;
          return (
            <span key={`distribution-${sideTermIndex}`} className="algebra-inline-distribution-group">
              {needsLeadingPlus ? <span aria-hidden="true">+</span> : null}
              <button
                type="button"
                className={`algebra-inline-factor-token${distributionState.armed ? ' is-armed' : ''}`}
                draggable={!isDistributionComplete(distributionState)}
                onClick={armDistributionFactor}
                onDragStart={(event) => {
                  event.dataTransfer?.setData('text/plain', 'mathmaster-distribution-factor');
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                  setDistributionState((current) => armDistributionFactorState(current));
                }}
                disabled={disabled || isDistributionComplete(distributionState)}
                aria-pressed={distributionState.armed}
                aria-label={`Pick up the factor ${distributionState.factorText}`}
              >
                <MathDisplay value={distributionState.factorLatex} format="latex" inline />
              </button>
              <span aria-hidden="true">(</span>
              <span className="algebra-inline-distribution-targets">
                {distributionState.terms.map((term, index) => {
                  const placed = distributionState.placedIndices.includes(index);
                  return (
                    <button
                      key={`${index}-${term.text}`}
                      type="button"
                      className={`algebra-inline-distribution-target${placed ? ' is-placed' : ''}${distributionState.armed && !placed ? ' is-ready' : ''}`}
                      onClick={() => placeDistributionFactor(index)}
                      onDragOver={(event) => { if (!placed) event.preventDefault(); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!placed && event.dataTransfer?.getData('text/plain') === 'mathmaster-distribution-factor') {
                          setDistributionState((current) => placeDistributionTermState(armDistributionFactorState(current), index));
                        }
                      }}
                      disabled={disabled || placed || !distributionState.armed}
                      aria-pressed={placed}
                      aria-label={placed
                        ? `Factor applied to ${term.text}`
                        : `Apply the factor to ${term.text}`}
                    >
                      <MathDisplay value={term.latex} format="latex" inline style={{ fontSize: 'inherit' }} />
                      {placed ? (
                        <span className="algebra-inline-factor-applied" aria-hidden="true">
                          × <MathDisplay value={distributionState.factorLatex} format="latex" inline />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </span>
              <span aria-hidden="true">)</span>
            </span>
          );
        })}
      </span>
    );
  };

  const renderSide = (side, cancellationModel = null) => {
    // An open structure tool draws its side on the equation itself — terms as
    // tokens in place — and takes precedence over the plain rendering.
    if (structureTool && !pendingMove && !cancellationActiveSides.includes(side) && structureToolDrawsSide(structureTool, equation, side)) {
      return (
        <div
          key={`structure-${side}-${sideExpression(side)}`}
          className="algebra-equation-side algebra-reflow is-inline-structure"
          style={{ fontSize: 'inherit', margin: '16px 0' }}
        >
          <StructureToolSide
            tool={structureTool}
            equation={equation}
            side={side}
            update={updateStructureTool}
            notify={setMessage}
            disabled={disabled || savingStep || cancelAnimating}
          />
        </div>
      );
    }
    if (cancellationModel) {
      const completedPairs = new Set(cancelledPairIds[side] || []);
      const completedIndices = cancellationModel.pairs
        .filter((pair) => completedPairs.has(pair.id))
        .flatMap((pair) => pair.indices);
      const selectedIndices = selectedCancellationIndices[side] || [];
      const markedIndices = [...new Set([...completedIndices, ...selectedIndices])];

      const directMath = cancellationModel.kind === 'fraction'
        ? (
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', minWidth: '150px', maxWidth: '100%' }}>
            <CancellationFactorRow factors={cancellationModel.numerator} offset={0} model={cancellationModel} selectedIndices={selectedIndices} crossedIndices={completedIndices} onTokenClick={(index) => handleTermClick(side, index, cancellationModel)} />
            <span aria-hidden="true" style={{ width: '100%', minWidth: '120px', height: '3px', background: '#202124', borderRadius: '999px', margin: '1px 0' }} />
            <CancellationFactorRow factors={cancellationModel.denominator} offset={cancellationModel.numerator.length} model={cancellationModel} selectedIndices={selectedIndices} crossedIndices={completedIndices} onTokenClick={(index) => handleTermClick(side, index, cancellationModel)} />
          </span>
        )
        : (
          <AlgebraTermRow terms={cancellationModel.terms} side={side} crossedIndices={markedIndices} selectedIndices={selectedIndices} highlightIndices={struckTerms?.side === side ? struckTerms.indices : []} collapsingIndices={collapsingSides.includes(side) ? completedIndices : []} onTermClick={(termIndex) => handleTermClick(side, termIndex, cancellationModel)} />
        );

      return (
        <div
          key={`cancel-${side}-${sideExpression(side)}`}
          className="algebra-equation-side algebra-reflow"
          onPointerDown={(event) => beginStroke(side, event)}
          onPointerMove={extendStroke}
          onPointerUp={() => finishStroke(side, cancellationModel)}
          onPointerCancel={() => setStroke(null)}
          style={{ position: 'relative', width: 'min(96%, 520px)', maxWidth: '100%', minHeight: '132px', margin: '12px auto 4px', padding: '24px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', background: cancellationHintsEnabled ? '#fffdf6' : '#fff', outline: cancellationHintsEnabled ? '2px solid rgba(249,171,0,.32)' : 'none', touchAction: 'none', cursor: cancelAnimating ? 'wait' : 'crosshair', userSelect: 'none', overflowX: 'hidden', overflowY: 'hidden', fontSize: 'inherit' }}
          aria-label="Cancellation workspace. Draw through matching factors directly in this equation."
        >
          {renderCancellationInk(side)}
          {directMath}
        </div>
      );
    }

    // `cueClass` is presentation layered on the SAME element: it is kept out
    // of the key so hovering a placement never remounts (and re-fits) the
    // mathematics underneath it.
    const equationSide = (content, extraClass = '', cueClass = '') => (
      <div
        key={`${side}-${sideExpression(side)}-${extraClass}`}
        className={`algebra-equation-side algebra-reflow ${extraClass} ${cueClass}`.replace(/\s+/g, ' ').trim()}
        style={{ fontSize: 'inherit', margin: '16px 0' }}
      >
        {content}
      </div>
    );

    const inlineDistribution = renderInlineDistributionSide(side);
    if (inlineDistribution) return equationSide(inlineDistribution, 'is-inline-distribution');

    const terms = splitAdditiveTerms(sideExpression(side));
    if (inlineExpressionTools && rewriteOpen && !pendingMove && terms?.length) {
      return equationSide(
        <AlgebraTermRow
          terms={terms}
          side={side}
          selectedIndices={inlineRewriteSelection?.side === side ? [inlineRewriteSelection.index] : []}
          onTermClick={(index) => selectInlineRewriteTerm(side, index)}
          interactionLabel="select as the term you want to rewrite"
        />,
        'is-inline-rewrite',
      );
    }
    if (inlineExpressionTools && likeTermsOpen && !pendingMove && terms?.length) {
      return equationSide(
        <AlgebraTermRow
          terms={terms}
          side={side}
          selectedIndices={likeTermsSide === side ? selectedLikeTermIndices : []}
          onTermClick={(index) => toggleInlineLikeTerm(side, index)}
          interactionLabel="select as a term to combine"
        />,
        'is-inline-like-terms',
      );
    }
    const inner = terms ? <AlgebraTermRow terms={terms} side={side} /> : <MathDisplay value={displayedSideLatex(side)} format="latex" inline />;
    if (!armedTile || pendingMove || !String(operand || '').trim()) {
      return equationSide(inner);
    }

    /*
     * THE EQUATION DOES NOT CHANGE UNTIL THE BALANCED MOVE IS COMMITTED (#341).
     *
     * Choosing + − × ÷, typing the operand, hovering a side and placing the
     * operation on ONE side are all decisions still in progress. This branch
     * used to write the staged operation into the expression itself
     * (-9x + 21 - 21 = 1), which showed the student the transformation before
     * they had finished making it. The mathematics on screen is now exactly the
     * committed equation; where the operation will land is shown as a cue drawn
     * OUTSIDE the glyphs (a caret beside the term, a bracket beside the side,
     * a bar under it), and a placed side is marked by the chip under the side
     * box. Only once both sides are student-placed does `attemptMove` open the
     * unsimplified result, once, through `pendingMove`.
     */
    const staged = placedOperationSides.includes(side);
    const hovering = dragOverSide === side && (!isFactorOperation(armedTile.operation) || factorZoneHint?.side === side);
    if (!staged && !hovering) {
      return equationSide(inner);
    }
    const position = staged
      ? placedOperationPositions[side]
      : (factorZoneHint?.side === side ? factorZoneHint.position : null);
    const cueState = staged ? 'staged' : 'hover';
    if (isFactorOperation(armedTile.operation)) {
      const factorCue = armedTile.operation === 'divide' ? 'below' : (position === 'after' ? 'after' : 'before');
      return equationSide(inner, '', `algebra-placement-cue is-${cueState} is-factor-cue is-factor-${factorCue}`);
    }
    const termCue = position && typeof position === 'object' && terms?.length
      ? { termIndex: position.termIndex, kind: position.kind, state: cueState }
      : null;
    return equationSide(
      termCue ? <AlgebraTermRow terms={terms} side={side} placementCue={termCue} /> : inner,
      '',
      `algebra-placement-cue is-${cueState}`,
    );
  };
  /*
   * DRAG / DROP MATHEMATICAL PREVIEW
   *
   * Typing an operand or merely selecting an operation never changes what the
   * student sees. A preview appears only while the student is over a valid
   * placement target, or after one side has actually received the drop.
   *
   * The preview is rendered OUTSIDE AutoFitEquationExpression so it cannot
   * resize the committed equation, alter its React key, or move hit targets.
   */
  const renderPlacementMathPreview = (side) => {
    if (!armedTile || pendingMove || !String(operand || '').trim()) return null;
    const staged = placedOperationSides.includes(side);
    const hovering = dragOverSide === side
      && (!isFactorOperation(armedTile.operation) || factorZoneHint?.side === side);
    if (!staged && !hovering) return null;

    const position = staged
      ? placedOperationPositions[side]
      : (factorZoneHint?.side === side ? factorZoneHint.position : null);
    let parsedOperand = operand;
    try { parsedOperand = parseOperationOperand(operand).expression; } catch { parsedOperand = latexToExpression(operand); }
    const operandLatex = expressionToLatex(parsedOperand);
    const sourceLatex = expressionToLatex(sideExpression(side));
    let previewLatex = sourceLatex;

    if (armedTile.operation === 'multiply') {
      previewLatex = position === 'after'
        ? `\\left(${sourceLatex}\\right)\\left(${operandLatex}\\right)`
        : `\\left(${operandLatex}\\right)\\left(${sourceLatex}\\right)`;
    } else if (armedTile.operation === 'divide') {
      previewLatex = `\\frac{${sourceLatex}}{${operandLatex}}`;
    } else {
      const additivePosition = position && typeof position === 'object'
        ? position
        : { kind: 'end', termIndex: Math.max(0, (splitAdditiveTerms(sideExpression(side))?.length || 1) - 1) };
      try {
        previewLatex = expressionToLatex(applyAdditiveOperationAtPlacement(
          sideExpression(side),
          armedTile.operation,
          parsedOperand,
          additivePosition,
        ));
      } catch {
        previewLatex = sourceLatex;
      }
    }

    return (
      <div
        className={`algebra-live-math-preview is-${staged ? 'staged' : 'hover'}`}
        aria-hidden="true"
        data-preview-side={side}
      >
        <MathDisplay value={previewLatex} format="latex" inline />
      </div>
    );
  };

  const armedOperationLabel = armedTile ? OPERATIONS.find((item) => item.id === armedTile.operation)?.label : null;
  // What the button says it will apply. The field now holds LaTeX, and
  // "Apply Divide by \\frac{1}{2}" is not a sentence a student should read.
  const operandLabel = (() => {
    if (!operand) return '';
    try {
      return parseOperationOperand(operand).expression;
    } catch {
      return latexToExpression(operand);
    }
  })();

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
      {showPrompt ? <QuestionPrompt>{question.prompt || 'Solve the equation by keeping both sides balanced.'}</QuestionPrompt> : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', background: supportPolicy.level >= 4 ? '#e8f0fe' : '#f3e8fd', color: supportPolicy.level >= 4 ? '#174ea6' : '#681da8', fontWeight: 'bold' }}>{`Support ${supportPolicy.level} · ${supportPolicy.label}`}</div>
        <div style={{ padding: '8px 12px', borderRadius: '999px', background: '#e6f4ea', color: '#137333', fontWeight: 'bold' }}>{objectiveLabel}</div>
        {stepCreditPercent > 0 && (
          <div
            title="Credit earned from valid algebra steps so far. Finishing the problem correctly earns full credit."
            style={{ padding: '8px 12px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6', fontWeight: 900 }}
          >
            Step credit {stepCreditPercent}%
          </div>
        )}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="algebra-rewrite-toggle"
            onClick={openRewriteTool}
            disabled={disabled || savingStep || cancelAnimating}
            aria-expanded={rewriteOpen}
            title={pendingMove ? 'Finish the current balanced operation first' : 'Enter your own equivalent rewrite of either or both sides'}
            style={{
              minHeight: 40,
              padding: '8px 14px',
              borderRadius: 999,
              border: rewriteOpen ? '2px solid #174ea6' : '1px solid #b8c8e3',
              background: rewriteOpen ? '#e8f0fe' : '#fff',
              color: '#174ea6',
              fontWeight: 800,
              cursor: disabled || savingStep || cancelAnimating ? 'not-allowed' : 'pointer',
            }}
          >
            Rewrite / Simplify
          </button>
          {(inlineExpressionTools || hasLikeTermOpportunity) && (
            <button
              type="button"
              className="algebra-like-terms-toggle"
              onClick={openLikeTermsTool}
              disabled={disabled || savingStep || cancelAnimating || Boolean(pendingMove)}
              aria-expanded={likeTermsOpen}
              title="Choose and combine like terms on one side of the equation"
              style={{
                minHeight: 40,
                padding: '8px 14px',
                borderRadius: 999,
                border: likeTermsOpen ? '2px solid #174ea6' : '1px solid #b8c8e3',
                background: likeTermsOpen ? '#e8f0fe' : '#fff',
                color: '#174ea6',
                fontWeight: 800,
                cursor: disabled || savingStep || cancelAnimating ? 'not-allowed' : 'pointer',
              }}
            >
              Combine like terms
            </button>
          )}
          {(distributable || distributionState) && (
            <button
              type="button"
              className="algebra-distribute-toggle"
              onClick={distributionState ? cancelDistribution : openDistributionTool}
              disabled={disabled || savingStep || cancelAnimating || Boolean(pendingMove) || (!distributionState && !distributable)}
              aria-expanded={Boolean(distributionState)}
              title="Copy an outside factor to every term in the parentheses"
              style={{
                minHeight: 40,
                padding: '8px 14px',
                borderRadius: 999,
                border: distributionState ? '2px solid #174ea6' : '1px solid #b8c8e3',
                background: distributionState ? '#e8f0fe' : '#fff',
                color: '#174ea6',
                fontWeight: 800,
                cursor: disabled || savingStep || cancelAnimating ? 'not-allowed' : 'pointer',
              }}
            >
              Distribute
            </button>
          )}
          {STRUCTURE_TOOL_KINDS
            .filter((kind) => structureTool?.kind === kind || structureOptions[kind]?.length)
            .map((kind) => (
              <button
                key={kind}
                type="button"
                className={`algebra-structure-toggle algebra-structure-toggle--${kind}`}
                onClick={() => toggleStructureTool(kind)}
                disabled={disabled || savingStep || cancelAnimating || Boolean(pendingMove)}
                aria-expanded={structureTool?.kind === kind}
                title={STRUCTURE_TOOL_TITLES[kind]}
                style={{
                  minHeight: 40,
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: structureTool?.kind === kind ? '2px solid #174ea6' : '1px solid #b8c8e3',
                  background: structureTool?.kind === kind ? '#e8f0fe' : '#fff',
                  color: '#174ea6',
                  fontWeight: 800,
                  cursor: disabled || savingStep || cancelAnimating ? 'not-allowed' : 'pointer',
                }}
              >
                {STRUCTURE_TOOL_LABELS[kind]}
              </button>
            ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 'bold', color: '#5f6368' }}>
            <input type="checkbox" checked={cancellationHintsEnabled} onChange={(event) => setCancellationHintsEnabled(event.target.checked)} style={{ width: '15px', height: '15px' }} />
            Cancellation hints
          </label>
          <button type="button" className="algebra-reset-work" onClick={resetQuestionWork} disabled={disabled || savingStep}>Reset work</button>
        </div>
      </div>

      {distributionState && !inlineExpressionTools && (
        <div
          className="algebra-distribution-tool"
          style={{
            margin: '0 0 8px', padding: '12px 14px', borderRadius: 10,
            border: '1px solid #b8c8e3', background: '#f7faff',
          }}
        >
          <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#172033' }}>
            Distribute to {distributionState.placedIndices.length} of {distributionState.terms.length} terms.
            {' '}Pick up the factor, then select each term it multiplies.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              draggable={!isDistributionComplete(distributionState)}
              onDragStart={(event) => {
                event.dataTransfer?.setData('text/plain', 'mathmaster-distribution-factor');
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={armDistributionFactor}
              disabled={disabled || isDistributionComplete(distributionState)}
              aria-pressed={distributionState.armed}
              aria-label={`Pick up the factor ${distributionState.factorText}`}
              style={{
                minWidth: 52, minHeight: 44, padding: '6px 12px', borderRadius: 10,
                border: distributionState.armed ? '3px solid #174ea6' : '2px solid #9bb8e8',
                background: distributionState.armed ? '#e8f0fe' : '#fff', color: '#174ea6',
                fontWeight: 900, fontSize: 22, cursor: 'grab',
              }}
            >
              <MathDisplay value={distributionState.factorLatex} format="latex" inline />
            </button>
            <span aria-hidden="true" style={{ color: '#5f6368' }}>&rarr;</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {distributionState.terms.map((term, index) => {
                const placed = distributionState.placedIndices.includes(index);
                return (
                  <button
                    key={`${index}-${term.text}`}
                    type="button"
                    onClick={() => placeDistributionFactor(index)}
                    onDragOver={(event) => { if (!placed) event.preventDefault(); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!placed && event.dataTransfer?.getData('text/plain') === 'mathmaster-distribution-factor') {
                        setDistributionState((current) => placeDistributionTermState(armDistributionFactorState(current), index));
                      }
                    }}
                    disabled={disabled || placed || !distributionState.armed}
                    aria-pressed={placed}
                    aria-label={placed ? `Factor already applied to ${term.text}` : `Apply the factor to ${term.text}`}
                    style={{
                      minWidth: 44, minHeight: 44, padding: '6px 12px', borderRadius: 10, fontSize: 22, fontWeight: 800,
                      border: placed ? '2px solid #137333' : distributionState.armed ? '2px dashed #7698cf' : '1px solid #d9e2f1',
                      background: placed ? '#e6f4ea' : distributionState.armed ? '#f7faff' : '#fff',
                      color: placed ? '#137333' : '#172033',
                      cursor: disabled || placed || !distributionState.armed ? 'default' : 'pointer',
                    }}
                  >
                    <MathDisplay
                      value={placed
                        ? `(${distributionState.factorLatex})(${term.sign < 0 ? '-' : ''}${term.magnitudeLatex})`
                        : term.latex}
                      format="latex"
                      inline
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={commitDistributionStep}
              disabled={disabled || savingStep || cancelAnimating || !isDistributionComplete(distributionState)}
              style={{
                minHeight: 40, padding: '8px 16px', borderRadius: 999, border: 0,
                background: isDistributionComplete(distributionState) ? '#1a73e8' : '#dadce0',
                color: '#fff', fontWeight: 800,
                cursor: isDistributionComplete(distributionState) ? 'pointer' : 'not-allowed',
              }}
            >
              Commit distribution
            </button>
            <button type="button" onClick={cancelDistribution} disabled={disabled} style={{ minHeight: 40, padding: '8px 16px', borderRadius: 999, border: '1px solid #b8c8e3', background: '#fff', color: '#174ea6', fontWeight: 700 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {likeTermsOpen && !inlineExpressionTools && (
        <div className="algebra-like-terms-tool">
          <div className="algebra-like-terms-header">
            <div>
              <strong>Combine like terms</strong>
              <div>Choose the side first, then select the terms you believe belong together. MathMaster will not identify the pair for you.</div>
            </div>
            <button type="button" onClick={closeLikeTermsTool} aria-label="Close combine like terms" title="Close">×</button>
          </div>

          {!likeTermsSide ? (
            <div className="algebra-like-terms-side-choice" role="group" aria-label="Choose which side to inspect for like terms">
              <button type="button" onClick={() => chooseLikeTermsSide('left')}>Left side</button>
              <button type="button" onClick={() => chooseLikeTermsSide('right')}>Right side</button>
            </div>
          ) : (
            <>
              <div className="algebra-like-terms-side-toolbar">
                <span>{likeTermsSide === 'left' ? 'Left' : 'Right'} side</span>
                <button type="button" onClick={() => chooseLikeTermsSide(likeTermsSide === 'left' ? 'right' : 'left')}>
                  Try the {likeTermsSide === 'left' ? 'right' : 'left'} side
                </button>
              </div>
              <div className="algebra-like-terms-equation-side">
                <AlgebraTermRow
                  terms={splitAdditiveTerms(equation[likeTermsSide]) || []}
                  side={likeTermsSide}
                  selectedIndices={selectedLikeTermIndices}
                  onTermClick={toggleLikeTerm}
                  interactionLabel="select as a term to combine"
                />
              </div>
              <p className="algebra-like-terms-instruction">
                Select at least two terms. If they are alike, enter the one term they combine to.
              </p>
              {selectedLikeTermIndices.length >= 2 && !currentLikeTermSelection?.valid ? (
                <p className="algebra-like-terms-feedback is-error">
                  {currentLikeTermSelection?.reason || 'Those selected terms are not alike.'}
                </p>
              ) : null}
              {currentLikeTermSelection?.valid ? (
                <div className="algebra-like-terms-answer">
                  <MathInput
                    value={likeTermsAnswer}
                    onChange={setLikeTermsAnswer}
                    onSubmit={checkLikeTerms}
                    placeholder="Combined term"
                    ariaLabel="Enter the single term these selected like terms combine to"
                    toolProfile="algebra-operation"
                    compact
                    maxWidth={360}
                    focusSignal={likeTermsFocusSignal}
                    contextSymbols={operationContextSymbols}
                    collapseSignal={mathToolsCollapseSignal}
                  />
                  <button type="button" onClick={checkLikeTerms} disabled={savingStep || cancelAnimating}>
                    Check combination
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {rewriteOpen && !inlineExpressionTools && (
        <div
          className="algebra-rewrite-tool algebra-rewrite-tool-compact"
          style={{
            margin: '0 0 8px',
            padding: '7px 9px',
            borderRadius: 10,
            border: '1px solid #b8c8e3',
            background: '#f8fbff',
            boxShadow: '0 2px 8px rgba(23,78,166,.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <strong style={{ color: '#174ea6', fontSize: 13, whiteSpace: 'nowrap', marginRight: 1 }}>
              Rewrite
            </strong>

            <div role="group" aria-label="Choose which side to rewrite" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                ['left', 'Left'],
                ['right', 'Right'],
                ['both', 'Both'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => {
                    setRewriteScope(value);
                    setRewriteAnswers({ left: '', right: '' });
                    setRewriteFocusSignal((signal) => signal + 1);
                    setMessage(null);
                  }}
                  aria-pressed={rewriteScope === value}
                  style={{
                    minHeight: 32,
                    padding: '4px 9px',
                    borderRadius: 999,
                    border: rewriteScope === value ? '2px solid #174ea6' : '1px solid #c7d7f4',
                    background: rewriteScope === value ? '#e8f0fe' : '#fff',
                    color: rewriteScope === value ? '#174ea6' : '#3c4043',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              className="algebra-rewrite-compact-inputs"
              style={{
                flex: '1 1 320px',
                minWidth: 220,
                display: 'grid',
                gridTemplateColumns: rewriteScope === 'both'
                  ? 'repeat(2, minmax(180px, 1fr))'
                  : 'minmax(220px, 520px)',
                gap: 7,
                alignItems: 'center',
              }}
            >
              {rewriteSidesForScope().map((side) => {
                const primarySide = rewriteScope === 'right' ? 'right' : 'left';
                return (
                  <div
                    key={side}
                    style={{
                      minWidth: 0,
                      display: 'grid',
                      gridTemplateColumns: '22px minmax(0, 1fr)',
                      gap: 5,
                      alignItems: 'center',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      title={side === 'left' ? 'Left side' : 'Right side'}
                      style={{ fontSize: 11, fontWeight: 900, color: '#5f6368', textAlign: 'center' }}
                    >
                      {side === 'left' ? 'L' : 'R'}
                    </span>
                    <MathInput
                      value={rewriteAnswers[side] || ''}
                      onChange={(value) => setRewriteAnswers((current) => ({ ...current, [side]: value }))}
                      placeholder={side === 'left' ? 'Equivalent left side' : 'Equivalent right side'}
                      ariaLabel={`Your rewritten ${side} side`}
                      toolProfile="algebra-operation"
                      contextSymbols={operationContextSymbols}
                      compact
                      maxWidth={520}
                      focusSignal={side === primarySide ? rewriteFocusSignal : 0}
                      collapseSignal={mathToolsCollapseSignal}
                      onSubmit={checkStudentRewrite}
                    />
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="algebra-check-rewrite"
              onClick={checkStudentRewrite}
              disabled={savingStep || cancelAnimating}
              style={{
                minHeight: 36,
                padding: '6px 11px',
                borderRadius: 8,
                border: 0,
                background: '#174ea6',
                color: '#fff',
                fontSize: 12,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              Check
            </button>

            <button
              type="button"
              onClick={closeRewriteTool}
              disabled={savingStep}
              aria-label="Close Rewrite / Simplify"
              title="Close"
              style={{
                width: 32,
                height: 32,
                padding: 0,
                borderRadius: 999,
                border: '1px solid #c5d5ef',
                background: '#fff',
                color: '#5f6368',
                fontSize: 18,
                lineHeight: 1,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: 4, paddingLeft: 2, color: '#6b7280', fontSize: 11, lineHeight: 1.25 }}>
            Enter your own equivalent expression. MathMaster checks it; it does not generate it.
          </div>
        </div>
      )}
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

      {mobileInteraction.isMobile && !pendingMove && !inlineToolActive && (
        <div className="algebra-mobile-operation-palette" role="group" aria-label="Choose an algebra operation">
          {OPERATIONS.map((operation) => (
            <button type="button" key={`mobile-${operation.id}`} className={`algebra-rail-tile ${armedTile?.operation === operation.id ? 'is-selected' : ''}`} onClick={() => selectOperation(operation.id, 'left')} disabled={disabled || savingStep || Boolean(pendingMove)} title={operation.label} aria-label={`Choose ${operation.label} operation`}>
              <span aria-hidden="true">{operation.symbol}</span><small>{operation.label}</small>
            </button>
          ))}
        </div>
      )}

      <div className={`algebra-balance-workspace-shell ${mobileInteraction.isMobile ? 'is-mobile-tap-layout' : ''}`}>
        {!mobileInteraction.isMobile && !inlineToolActive && <div ref={leftRailRef} className="algebra-rail algebra-rail-left">
          {OPERATIONS.map((operation) => (
            <button type="button" key={`left-${operation.id}`} className={`algebra-rail-tile ${armedTile?.operation === operation.id ? 'is-selected' : ''}`} onClick={() => selectOperation(operation.id, 'left')} disabled={disabled || savingStep || Boolean(pendingMove)} title={operation.label} aria-label={`Choose ${operation.label} operation`}>
              {operation.symbol}
            </button>
          ))}
        </div>}

        <div
          data-math-state={equationToLatex(equation)}
          aria-label="Interactive algebra balance scale"
          className={`algebra-equation-stage algebra-connected-balance ${balanceStagingSide ? `is-unbalanced is-unbalanced-${balanceStagingSide}` : ''}${structureFocusSides.length === 1 ? ` has-structure-focus-${structureFocusSides[0]}` : ''}`}
          style={structureFocusColumns
            ? { gridTemplateColumns: structureFocusColumns }
            : adaptiveBalanceColumns ? { gridTemplateColumns: adaptiveBalanceColumns } : undefined}
        >
          {['left', 'right'].map((side, index) => {
            const target = pendingMove?.cancellationTargets.find((item) => item.side === side);
            const pendingCancellationModel = target?.canCancel ? buildCancellationModel(
              sideExpression(side),
              target.cancellationResultExpression || target.simplifiedExpression,
              equation.variable,
              target.cancellationPairs,
            ) : null;
            const visibleCancellationModel = !pendingMove
              ? buildCancellationModel(sideExpression(side), null, equation.variable, [])
              : null;
            const cancellationModel = pendingCancellationModel
              || (visibleCancellationModel?.pairs?.length ? visibleCancellationModel : null);
            const cancellationActive = Boolean(cancellationModel?.pairs?.length);
            const stagedHere = placedOperationSides.includes(side);
            return (
              <div
                key={side}
                ref={side === 'left' ? leftSideRef : rightSideRef}
                className={`algebra-equation-box algebra-connected-side ${dragOverSide === side ? 'is-hovered' : ''} ${stagedHere ? 'has-staged-operation' : ''} ${mobileInteraction.isMobile && tapPlacementArmed ? 'mathmaster-tap-placement-ready' : ''}`}
                role={tapPlacementArmed ? 'button' : undefined}
                tabIndex={tapPlacementArmed ? 0 : undefined}
                aria-label={tapPlacementArmed ? `Place ${describeOperation(armedTile?.operation, operand)} on the ${side} side` : undefined}
                onClick={(event) => tapPlacementOnSide(side, event)}
                onKeyDown={(event) => {
                  /* Not gated on isMobile any more. A student on a Chromebook
                     with a keyboard is not a mobile user, and was the one group
                     this workspace locked out entirely. */
                  if (tapPlacementArmed && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    tapPlacementOnSide(side, event);
                  }
                }}
                onDragOver={(event) => { event.preventDefault(); updatePointerVisuals(event.clientX, event.clientY); }}
                onDragLeave={() => { setDragOverSide(null); setFactorZoneHint(null); }}
                onDrop={(event) => {
                  event.preventDefault();
                  const droppedOperation = event.dataTransfer.getData('text/algebra-operation');
                  if (!droppedOperation) return;
                  const position = factorZoneRef.current?.side === side ? factorZoneRef.current.position : 'side';
                  stagePlacement(side, position);
                }}
                style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 1 }}
              >
                <div className="algebra-side-label">{side} side</div>
                <div ref={side === 'left' ? leftExpressionRef : rightExpressionRef} className="algebra-expression-anchor">
                  <AutoFitEquationExpression
                    baseFontSize={sideFontSize(side)}
                    cacheKey={`${sideExpression(side)}|${inlineToolActive ? 'inline' : 'balance'}|${distributionState?.placedIndices?.length || 0}|${structureToolFitKey(structureTool)}`}
                  >
                    {renderSide(side, cancellationModel)}
                  </AutoFitEquationExpression>
                </div>

                {renderPlacementMathPreview(side)}

                {/* One side has received the operation; the equation above is
                    still the committed one (#341). The chip names the student's
                    own move and sits outside the expression, so it can never be
                    read as the resulting algebra and never changes the fit. */}
                {stagedHere && armedTile && !pendingMove ? (
                  <div className="algebra-placement-marker" role="status" aria-label={`Operation placed on the ${side} side`}>
                    <span aria-hidden="true" className="algebra-placement-marker-check">✓</span>
                    <OperationChip token={describeOperationToken(armedTile.operation, operandLabel)} />
                    <span>placed</span>
                  </div>
                ) : null}

                {inlineExpressionTools && distributionState?.side === side ? (
                  <div className="algebra-inline-mode-controls" aria-live="polite">
                    <span className="algebra-inline-mode-status">
                      Factor placements {distributionState.placedIndices.length}/{distributionState.terms.length}
                    </span>
                    {isDistributionComplete(distributionState) ? (
                      <button
                        type="button"
                        className="algebra-inline-commit"
                        onClick={commitDistributionStep}
                        disabled={disabled || savingStep || cancelAnimating}
                      >
                        Commit distribution
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {structureTool && !pendingMove && !cancellationActiveSides.includes(side) ? (
                  <StructureToolControls
                    tool={structureTool}
                    equation={equation}
                    side={side}
                    update={updateStructureTool}
                    notify={setMessage}
                    onCommit={commitStructureToolStep}
                    disabled={disabled || cancelAnimating}
                    busy={savingStep}
                    contextSymbols={operationContextSymbols}
                    collapseSignal={mathToolsCollapseSignal}
                  />
                ) : null}

                {inlineExpressionTools && rewriteOpen && inlineRewriteSelection?.side === side ? (
                  <div className="algebra-inline-mode-controls algebra-inline-editor">
                    <MathInput
                      value={inlineRewriteAnswer}
                      onChange={setInlineRewriteAnswer}
                      onSubmit={checkInlineRewrite}
                      placeholder="Equivalent term"
                      ariaLabel={`Equivalent form for the selected ${side} side term`}
                      toolProfile="algebra-operation"
                      compact
                      maxWidth={300}
                      focusSignal={inlineRewriteFocusSignal}
                      contextSymbols={operationContextSymbols}
                      collapseSignal={mathToolsCollapseSignal}
                    />
                    <button
                      type="button"
                      className="algebra-inline-commit"
                      onClick={checkInlineRewrite}
                      disabled={savingStep || cancelAnimating}
                    >
                      Check
                    </button>
                    <button
                      type="button"
                      className="algebra-inline-clear"
                      onClick={() => {
                        setInlineRewriteSelection({ side: null, index: null });
                        setInlineRewriteAnswer('');
                        setMessage(null);
                      }}
                    >
                      Clear selection
                    </button>
                  </div>
                ) : null}

                {inlineExpressionTools && likeTermsOpen && likeTermsSide === side && selectedLikeTermIndices.length >= 2 ? (
                  <div className="algebra-inline-mode-controls algebra-inline-editor">
                    {currentLikeTermSelection?.valid ? (
                      <>
                        <MathInput
                          value={likeTermsAnswer}
                          onChange={setLikeTermsAnswer}
                          onSubmit={checkLikeTerms}
                          placeholder="Combined term"
                          ariaLabel="Enter the single term these selected terms combine to"
                          toolProfile="algebra-operation"
                          compact
                          maxWidth={300}
                          focusSignal={likeTermsFocusSignal}
                          contextSymbols={operationContextSymbols}
                          collapseSignal={mathToolsCollapseSignal}
                        />
                        <button
                          type="button"
                          className="algebra-inline-commit"
                          onClick={checkLikeTerms}
                          disabled={savingStep || cancelAnimating}
                        >
                          Check
                        </button>
                      </>
                    ) : (
                      <span className="algebra-inline-mode-feedback">
                        {currentLikeTermSelection?.reason || 'Those selected terms do not combine as one like term.'}
                      </span>
                    )}
                    <button
                      type="button"
                      className="algebra-inline-clear"
                      onClick={() => {
                        setSelectedLikeTermIndices([]);
                        setLikeTermsAnswer('');
                        setLikeTermsSide('');
                        setMessage(null);
                      }}
                    >
                      Clear selection
                    </button>
                  </div>
                ) : null}

                {cancellationActive && !crossedSides.includes(side) && (
                  <div className="algebra-cancellation-cue">
                    <div>
                      {cancellationHintsEnabled
                        ? (cancellationModel.kind === 'additive'
                          ? (cancellationModel.pairs.length > 1
                            ? `Cancel ${cancellationModel.pairs.length} opposite-term pairs. Tap or slash one term from each pair; its matching opposite is crossed out with it.`
                            : 'Tap or slash either opposite term once. MathMaster crosses out the matching term with it.')
                          : (cancellationModel.pairs.length > 1
                            ? `Cancel ${cancellationModel.pairs.length} matching factor pairs. Tap or slash one factor from each pair; its matching factor is crossed out with it.`
                            : 'Tap or slash either matching factor once. MathMaster crosses out its partner with it.'))
                        : 'Cancellation is active directly on the equation.'}
                    </div>
                  </div>
                )}
                {target?.canCancel && !cancellationModel && (
                  <div role="status" className="algebra-cancellation-fallback">This expression needs a cancellation pattern MathMaster cannot safely tokenize yet. Use Undo and choose an equivalent one-factor-at-a-time operation.</div>
                )}
              </div>
            );
          })}
          <div ref={equalsRef} className={`algebra-balance-equals ${balanceStagingSide ? 'is-unbalanced' : ''}`} style={{ gridColumn: 2, gridRow: 1 }} aria-label="equals">=</div>
          {balanceStagingSide && <div className="algebra-balance-status" aria-live="polite">Balance not restored · place the same move on the {balanceMissingSide} side</div>}
          <div aria-hidden="true" className={`algebra-balance-beam ${balancePulse ? 'algebra-balance-pulse' : ''} ${balanceStagingSide ? `tilt-${balanceStagingSide}` : ''}`} />
        </div>

        {!mobileInteraction.isMobile && !inlineToolActive && <div ref={rightRailRef} className="algebra-rail algebra-rail-right">
          {OPERATIONS.map((operation) => (
            <button type="button" key={`right-${operation.id}`} className={`algebra-rail-tile ${armedTile?.operation === operation.id ? 'is-selected' : ''}`} onClick={() => selectOperation(operation.id, 'right')} disabled={disabled || savingStep || Boolean(pendingMove)} title={operation.label} aria-label={`Choose ${operation.label} operation`}>
              {operation.symbol}
            </button>
          ))}
        </div>}
      </div>

      {pendingMove?.assumption && (
        // Dividing a formula by a letter is only legitimate while that letter
        // is not zero. Solving A = bh for h is not the same statement as
        // A = bh, and a student rearranging formulas should see the condition
        // rather than absorb the idea that it never matters.
        <p style={{ margin: '10px 2px 0', fontSize: 13, color: '#7a4f00', fontWeight: 700 }}>
          This step assumes {pendingMove.assumption}.
        </p>
      )}

      {armedTile && !pendingMove && (
        <div className="algebra-operation-composer">
          <div className="algebra-composer-operation" aria-hidden="true">{OPERATIONS.find((item) => item.id === armedTile.operation)?.symbol}</div>
          <label className="algebra-composer-input-label">
            <span>{armedOperationLabel} what?</span>
            <MathInput
              value={operand}
              onChange={(value) => {
                // MathLive can re-emit an equivalent operand while focus/layout
                // changes. Do not erase a side the student already placed unless
                // the mathematical operand actually changed.
                const operandChanged = operationOperandIdentity(value) !== operationOperandIdentity(operand);
                setOperand(value);
                if (operandChanged && placedOperationSidesRef.current.length) {
                  placedOperationSidesRef.current = [];
                  placedOperationPositionsRef.current = {};
                  setPlacedOperationSides([]);
                  setPlacedOperationPositions({});
                }
              }}
              toolProfile="algebra-operation"
              placeholder="value or expression"
              ariaLabel={`${armedOperationLabel} what to both sides`}
              focusSignal={operationFocusSignal}
              contextSymbols={operationContextSymbols}
              collapseSignal={mathToolsCollapseSignal}
              compact
              maxWidth={380}
            />
          </label>
          <button
            type="button"
            className={`algebra-pickup-button ${mobileInteraction.isMobile ? 'is-tap-placement-button' : ''}`}
            /* Tap-or-keyboard placement used to be gated on `isMobile`, which
               meant a DESKTOP keyboard user found `onClick` undefined: pressing
               Enter on "Pick up" did nothing at all, and dragging was the only
               way to apply an operation. The select-then-place route is now
               available to everyone; pointer dragging still works exactly as
               before for anyone who prefers it. */
            onClick={activateTapPlacement}
            onPointerDown={mobileInteraction.isMobile ? undefined : (event) => beginPointerDrag(armedTile.operation, event)}
            onPointerMove={mobileInteraction.isMobile ? undefined : onDragPointerMove}
            onPointerUp={mobileInteraction.isMobile ? undefined : onDragPointerUp}
            onPointerCancel={mobileInteraction.isMobile ? undefined : onDragPointerCancel}
            disabled={disabled || savingStep || !String(operand || '').trim()}
            title={mobileInteraction.isMobile
              ? 'Arm this operation, then tap the equation where it belongs'
              : 'Drag this operation onto one side of the equation, or press Enter and then choose a side'}
            aria-pressed={tapPlacementArmed}
          >
            {mobileInteraction.isMobile ? (tapPlacementArmed ? 'Ready to place ' : 'Use ') : '⠿ Pick up '}
            {operandLabel ? <OperationChip token={describeOperationToken(armedTile.operation, operand)} /> : 'operation'}
          </button>
          {allowAutoApply && (
            <button type="button" className="algebra-auto-apply-button" onClick={() => attemptMove(armedTile.operation, armedTile.sourceSide || 'left')} disabled={disabled || savingStep || !String(operand || '').trim()} title="Accommodation shortcut: apply this operation to both sides">
              Apply to both sides
            </button>
          )}
          <button type="button" className="algebra-composer-cancel" onClick={() => { setOperand(''); setArmedTile(null); placedOperationSidesRef.current = []; placedOperationPositionsRef.current = {}; setPlacedOperationSides([]); setPlacedOperationPositions({}); setTapPlacementArmed(false); setMessage(null); }}>Cancel</button>
          <div className="algebra-placement-progress" aria-live="polite">
            {placedOperationSides.length === 0
              ? (mobileInteraction.isMobile
                  ? (tapPlacementArmed ? placementInstructionForOperation(armedTile.operation) : 'Enter the operand, choose Use, then place it on each side yourself.')
                  : (isFactorOperation(armedTile.operation)
                      ? (armedTile.operation === 'divide' ? 'Place the divisor beneath one side, then do the same on the other side.' : 'Place the factor next to one side, then do the same on the other side.')
                      : 'Place this operation on one side, then restore the balance on the other side.'))
              : `Placed on ${placedOperationSides[0]} · ${balanceMissingSide} side still needed`}
          </div>
          {allowAutoApply && <div className="algebra-accommodation-note">Your support plan includes the automatic Apply shortcut. Manual placement remains available.</div>}
        </div>
      )}

      {!armedTile && !pendingMove && !inlineToolActive && <div className="algebra-operation-idle-hint">Choose an operation. The value field will activate automatically.</div>}

      {pendingMove && pendingMove.simplificationTargets?.length > 0
        && pendingMove.requiredCancellationSides.every((side) => crossedSides.includes(side)) && (
        <div className={`algebra-optional-simplification${pendingMove.simplificationTargets.length === 1 ? ` algebra-optional-simplification--${pendingMove.simplificationTargets[0].side}` : ''}`}>
          <h3>{equation.objective?.requireSimplifiedFinalForm ? 'Finish the required simplification' : 'Simplify (optional)'}</h3>
          <div className="algebra-simplification-grid">
            {pendingMove.simplificationTargets.map((target, index) => (
              <div key={target.side} className="algebra-simplification-card">
                <strong>{target.label}</strong>
                <MathInput
                  value={simplificationAnswers[target.side] || ''}
                  onChange={(value) => setSimplificationAnswers((current) => ({ ...current, [target.side]: value }))}
                  onSubmit={checkSimplifications}
                  placeholder="Simplified expression"
                  ariaLabel={`${target.label}: enter your simplification`}
                  focusSignal={index === 0 ? simplificationFocusSignal : 0}
                />
              </div>
            ))}
          </div>
          <div className="algebra-simplification-actions">
            {!equation.objective?.requireSimplifiedFinalForm && (
              <button type="button" className="algebra-keep-written" onClick={keepPendingMoveAsWritten} disabled={savingStep || cancelAnimating}>Keep as written</button>
            )}
            <button type="button" className="algebra-check-simplification" onClick={checkSimplifications} disabled={savingStep}>Check my simplification</button>
          </div>
          <p className="algebra-simplification-note">
            {equation.objective?.requireSimplifiedFinalForm
              ? 'Enter an equivalent simplified expression to finish this step.'
              : 'Optional: enter an equivalent cleaner form, or keep the equation as written.'}
          </p>
        </div>
      )}
      {question.showHint !== false && suggestedMove && !solved && <details style={{ marginTop: '14px', color: '#5f6368' }}><summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Need a strategic hint?</summary><p style={{ margin: '8px 0 0' }}>Look for a move that cancels a term: {describeOperation(suggestedMove.operation, suggestedMove.operand)}.</p></details>}
      {message && <div role="status" style={{ marginTop: '16px', padding: '13px 15px', borderRadius: '10px', background: message.tone === 'success' ? '#e6f4ea' : message.tone === 'growth' ? '#fef7e0' : '#fce8e6', color: message.tone === 'success' ? '#137333' : message.tone === 'growth' ? '#8a5a00' : '#c5221f', fontWeight: 'bold' }}>{message.text}</div>}
      <p style={{ color: '#5f6368', fontSize: '13px', marginTop: '12px' }}>
        {supportPolicy.description}
        {supportPolicy.inefficientMoveCostsAttempt
          ? attemptsDoNotExpire ? ' Live Challenge work does not expire from intermediate moves.' : ` Attempts remaining: ${attemptsRemaining}. A longer route still counts as correct algebra, but it uses an attempt at this level.`
          : ' A longer route is still correct algebra here and costs nothing.'}
      </p>

      {heldToken && (
        <div aria-hidden="true" style={{ position: 'fixed', left: heldToken.x, top: heldToken.y, transform: 'translate(-50%, -50%)', zIndex: 40, pointerEvents: 'none', fontFamily: 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace', fontWeight: 800, fontSize: '22px', color: '#174ea6', background: '#e8f0fe', borderRadius: '12px', padding: '6px 12px', boxShadow: '0 12px 26px rgba(26,115,232,0.3)', whiteSpace: 'nowrap' }}><OperationChip token={heldToken.label} /></div>
      )}
    </section>
  );
}
