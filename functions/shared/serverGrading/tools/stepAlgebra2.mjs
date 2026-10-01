/*
 * Shared grader for the `stepAlgebra2` registry tool — run by the browser tool
 * for its feedback, by QuestionEngine for the recorded verdict, and by the
 * server as the authority. See ../toolGraderDefinition.mjs for the contract and
 * ../declarations/stepAlgebra2.mjs for which questions still reach this tool.
 *
 * Both graded views are step workspaces, so neither trusts an equation the
 * device says it reached:
 *
 *   default            the legacy ax + b = c solver. The work is the student's
 *                      list of balanced moves; the grader replays every one on
 *                      the question's own equation with the SAME
 *                      applyLegacySolverOperation the solver applies on screen,
 *                      refuses a move the solver never allows (an unknown
 *                      operation, a non-number, × 0 or ÷ 0), and marks the
 *                      equation those moves produce. Extracted check-for-check
 *                      from StepAlgebra2.jsx: x isolated means coefficient
 *                      within 1e-9 of 1 and constant within 1e-9 of 0, the value
 *                      must be within 0.01 of (c − b) / a, and the score is
 *                      1 / 0.5 (isolated, wrong value) / 0.
 *
 *   rewriteLinearForm  the student's current equation, and the equation after
 *                      each committed step. The form verdict is
 *                      describeRewriteGap — the function the screen's goal
 *                      chips use — with the objective rebuilt from the
 *                      question. The rewrite workspace only commits
 *                      equivalent steps, so on the device the equation is
 *                      always the original line; the grader checks that
 *                      instead of assuming it (equationKeepsZeroSet against
 *                      the question's own equation). Score as the screen gave
 *                      it: 1 finished / 0.75 equivalent but unfinished form /
 *                      0.4 y still on the right / 0.15 at least one step / 0.
 *
 * Pure.
 */
import declaration from '../declarations/stepAlgebra2.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { TOOL_RESPONSE_LIMITS } from '../toolResponseContract.mjs';
import { exactFractionText, nearlyEqual } from '../../toolMath/shared/toolMath.mjs';
import {
  buildInitialEquationState,
  describeRewriteGap,
  equationKeepsZeroSet,
  sampleEquationZeroSet,
} from '../../toolMath/stepAlgebra2/rewriteLinearFormMath.mjs';

const text = (value) => String(value ?? '');

/* ── default: the legacy ax + b = c solver ──────────────────────────────── */

/** The equation the solver opens when the question authors none. */
export const LEGACY_SOLVER_DEFAULT_EQUATION = Object.freeze({ a: 3, b: 6, c: 21 });

export const LEGACY_SOLVER_OPERATIONS = Object.freeze(['add', 'subtract', 'multiply', 'divide']);

/** The equation the solver starts from — `questionData.equation || 3x + 6 = 21`. */
const legacySolverOriginal = (question = {}) => question?.equation || LEGACY_SOLVER_DEFAULT_EQUATION;

/** One balanced move applied to both sides of ax + b = c (the solver's own engine). */
export const applyLegacySolverOperation = (state, operation, value) => {
  const next = { ...state };
  if (operation === 'add') { next.b += value; next.c += value; }
  if (operation === 'subtract') { next.b -= value; next.c -= value; }
  if (operation === 'multiply') { next.a *= value; next.b *= value; next.c *= value; }
  if (operation === 'divide') { next.a /= value; next.b /= value; next.c /= value; }
  return next;
};

/**
 * The solver's work: its committed moves, in order. `stepCount` lets the
 * grader tell a list the response contract shortened (over 300 moves) from the
 * student's real list, so it never marks a truncated replay.
 */
export const legacySolverWork = (history = []) => {
  const steps = (Array.isArray(history) ? history : []).map((step) => ({
    operation: step?.operation,
    operand: step?.operand,
  }));
  return { steps, stepCount: steps.length };
};

// The solver's Apply button refuses exactly these; a replayed list holding one
// was not produced by the solver.
const legacyStepRefusal = (operation, operand) => {
  if (!LEGACY_SOLVER_OPERATIONS.includes(operation)) return 'unknown operation';
  if (typeof operand !== 'number' || !Number.isFinite(operand)) return 'operand is not a number';
  if (operand === 0 && (operation === 'multiply' || operation === 'divide')) return `${operation} by 0`;
  return null;
};

const legacyEquationText = (state) => `${exactFractionText(state?.a)}x + ${exactFractionText(state?.b)} = ${exactFractionText(state?.c)}`;

const legacySolver = (question, work) => {
  const steps = work.steps === undefined ? [] : work.steps;
  if (!Array.isArray(steps)) throw new Error('steps must be a list of moves.');
  if (work.stepCount !== undefined && Number(work.stepCount) !== steps.length) {
    return ungradedResult('step-history-truncated');
  }
  const original = legacySolverOriginal(question);
  let state = { ...original };
  steps.forEach((step, index) => {
    const operation = text(step?.operation);
    const operand = step?.operand;
    const refusal = legacyStepRefusal(operation, operand);
    if (refusal) throw new Error(`Move ${index + 1} is not one the solver allows (${refusal}).`);
    state = applyLegacySolverOperation(state, operation, operand);
  });

  const a = Number(original.a);
  const solution = !Number.isFinite(a) || nearlyEqual(a, 0, 1e-12) ? null : (Number(original.c) - Number(original.b)) / a;
  const constantCleared = nearlyEqual(state.b, 0, 1e-9);
  const coefficientCleared = nearlyEqual(state.a, 1, 1e-9);
  const solved = coefficientCleared && constantCleared;
  const correct = solved && solution != null && nearlyEqual(state.c, solution, 0.01);
  return gradedResult({
    isComplete: solved,
    isCorrect: correct,
    score: correct ? 1 : solved ? 0.5 : 0,
    parts: [
      { id: 'x-isolated', label: 'x isolated (x = a number)', isComplete: solved, isCorrect: solved, response: legacyEquationText(state) },
      { id: 'x-value', label: 'Value of x', isComplete: solved, isCorrect: correct, response: solved ? exactFractionText(state.c) : '' },
    ],
  });
};

/* ── rewriteLinearForm ──────────────────────────────────────────────────── */

/** RewriteLinearForm.jsx's target: exactly "factoredLinear", else slope-intercept. */
export const resolveRewriteTargetForm = (question = {}) => (question?.targetForm === 'factoredLinear' ? 'factoredLinear' : 'slopeIntercept');

// The embedded Step Algebra keeps at most this many committed steps.
const REWRITE_WORK_STEP_LIMIT = 80;
// Characters of step equations the work keeps, newest first. Every balanced
// move with a variable operand wraps both sides in another layer, so 80 long
// steps can pass the response contract's 24,000-character cap — and an
// oversize response is refused whole, finished equation included. The step
// log only ever earns the "made a step" credit, which one verified step
// decides, so the oldest steps are the ones left out.
const REWRITE_WORK_STEP_BUDGET = 16_000;

const readEquation = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.left !== 'string' || typeof value.right !== 'string') return null;
  if (!value.left.trim() || !value.right.trim()) return null;
  return { left: value.left, right: value.right };
};

/**
 * The rewrite screen's work: the equation it shows and the equation after each
 * committed step of the embedded Step Algebra's log (the latest 80 that fit
 * REWRITE_WORK_STEP_BUDGET, in order). A step with a side longer than the
 * response contract keeps is left out rather than cut into a different
 * expression.
 */
export const rewriteLinearFormWork = (equationState = null, history = []) => {
  const log = Array.isArray(history) ? history : [];
  const kept = [];
  let budget = REWRITE_WORK_STEP_BUDGET;
  for (let index = log.length - 1; index >= 0 && kept.length < REWRITE_WORK_STEP_LIMIT; index -= 1) {
    const step = { left: log[index]?.after?.left ?? '', right: log[index]?.after?.right ?? '' };
    if (String(step.left).length > TOOL_RESPONSE_LIMITS.maxStringLength
      || String(step.right).length > TOOL_RESPONSE_LIMITS.maxStringLength) continue;
    const cost = JSON.stringify(step).length + 1;
    if (cost > budget) break;
    budget -= cost;
    kept.push(step);
  }
  return {
    equation: { left: equationState?.left ?? '', right: equationState?.right ?? '' },
    steps: kept.reverse(),
  };
};

const rewriteLinearForm = (question, work) => {
  const targetForm = resolveRewriteTargetForm(question);
  const factored = targetForm === 'factoredLinear';
  const objective = {
    kind: targetForm,
    variable: 'y',
    targetForm,
    requireSimplifiedFinalForm: targetForm === 'slopeIntercept',
  };
  // Throws for a question with no readable equation — the screen cannot open
  // one either — which the binding reports as ungraded.
  const original = buildInitialEquationState(question);
  const reference = sampleEquationZeroSet(original);
  if (!reference) return ungradedResult('rewrite-original-not-sampleable');

  const equation = readEquation(work.equation);
  const formLabel = factored ? 'Written as y = a(x − c)' : 'Written as y = mx + b';
  if (!equation) {
    return gradedResult({
      isComplete: false,
      isCorrect: false,
      score: 0,
      parts: [
        { id: 'same-line', label: 'Still the original line', isComplete: false, isCorrect: false },
        { id: 'y-isolated', label: 'y isolated on the left', isComplete: false, isCorrect: false },
        { id: 'no-y-on-right', label: 'No y on the right', isComplete: false, isCorrect: false },
        { id: 'target-form', label: formLabel, isComplete: false, isCorrect: false },
      ],
    });
  }

  const keepsOriginal = equationKeepsZeroSet(equation, reference);
  const gap = describeRewriteGap({ left: equation.left, right: equation.right, variable: 'y', objective });
  const complete = gap === null;
  const leftIsolated = gap !== 'isolateVariable';
  const noVariableOnRight = leftIsolated && gap !== 'variableOnBothSides';
  // Every committed step is re-checked against the question's own line; the
  // "made a step" credit needs at least one that really is.
  // At most the 80 a screen sends: a tampered list is not evaluated further.
  const steps = Array.isArray(work.steps) ? work.steps.slice(-REWRITE_WORK_STEP_LIMIT).map(readEquation).filter(Boolean) : [];
  const madeProgress = steps.some((step) => equationKeepsZeroSet(step, reference));
  const correct = complete && keepsOriginal;
  const score = !keepsOriginal
    ? 0
    : complete
      ? 1
      : ['needsSimplification', 'needsFactoring'].includes(gap)
        ? 0.75
        : gap === 'variableOnBothSides'
          ? 0.4
          : madeProgress ? 0.15 : 0;
  const shown = `${equation.left} = ${equation.right}`;
  return gradedResult({
    isComplete: complete,
    isCorrect: correct,
    score,
    parts: [
      { id: 'same-line', label: 'Still the original line', isComplete: true, isCorrect: keepsOriginal, response: shown },
      { id: 'y-isolated', label: 'y isolated on the left', isComplete: true, isCorrect: leftIsolated, response: equation.left },
      { id: 'no-y-on-right', label: 'No y on the right', isComplete: true, isCorrect: noVariableOnRight, response: equation.right },
      { id: 'target-form', label: formLabel, isComplete: complete, isCorrect: complete, response: shown },
    ],
  });
};

export default bindToolGrader(declaration, 'stepAlgebra2', {
  default: legacySolver,
  rewriteLinearForm,
});
