/*
 * WHICH STEP ALGEBRA WORKSPACE A QUESTION OPENS — THE LIGHT HALF.
 *
 * QuestionEngine renders a `stepAlgebra` (or retired `algebra`) question on one
 * of three engines, and a literal question that asks for the balance on a
 * fourth host of the same engine:
 *
 *   equation          StepByStepAlgebra -> StepByStepAlgebraCore
 *   relation          MultiRelationAlgebra (inequalities, absolute value, x^2)
 *   linearIntercepts  LinearInterceptsOrchestrator (`stepAlgebra` only)
 *
 * The grader has to mark the work in the shape the engine that produced it
 * emits, so the server must make EXACTLY the decision the renderer made.
 * src/platform/algebra/algebraWorkspaceRoute.js (the renderer's route) and the
 * grading declarations both call `resolveStepAlgebraMode` below — one function,
 * two callers, no drift.
 *
 * `relationSourceFromQuestion` and `needsMultiRelationWorkspace` were moved
 * here unchanged from src/algebraRelationFoundation.js (which still exports
 * them): they are pure text tests, and the grading manifest — which the
 * student app's startup path reads — must not load mathjs to ask them.
 *
 * Light by design: no mathjs, no grading mathematics. Pure.
 */
import { withPromptRelationSource } from '../runtime/stepAlgebraRelationRouting.mjs';

const text = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const relationSourceFromQuestion = (question = {}) => {
  const direct = [
    question.equation,
    question.equationAscii,
    question.initialEquation,
    question.formula,
    question.equationLatex,
  ].find((value) => String(value ?? '').trim());

  if (direct) return String(direct).trim();

  const left = String(question.leftExpression ?? '').trim();
  const right = String(question.rightExpression ?? '').trim();
  if (left && right) {
    const relation = String(
      question.relation
      || question.comparator
      || question.inequalitySymbol
      || '=',
    ).trim() || '=';
    return `${left} ${relation} ${right}`;
  }

  const expressions = Array.isArray(question.expressions)
    ? question.expressions.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  const relations = Array.isArray(question.relations)
    ? question.relations.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];

  if (expressions.length >= 2 && relations.length === expressions.length - 1) {
    const pieces = [];
    expressions.forEach((expression, index) => {
      pieces.push(expression);
      if (index < relations.length) pieces.push(relations[index]);
    });
    return pieces.join(' ');
  }

  return '';
};

export const needsMultiRelationWorkspace = (question = {}) => {
  if (question.relationWorkspace === true || question.workspaceMode === 'relations') return true;
  if (question.relationWorkspace === false) return false;
  const source = relationSourceFromQuestion(question);
  return /(?:<=|>=|≤|≥|<|>|\||\babs\s*\(|\^\s*\{?2\}?)/i.test(source);
};

/**
 * Whether StepByStepAlgebra hands this question to the relation workspace —
 * the single predicate QuestionEngine's route, StepByStepAlgebra's own
 * second check and the grader all use.
 */
export const usesRelationWorkspace = (question = {}) => (
  needsMultiRelationWorkspace(withPromptRelationSource(isObject(question) ? question : {}))
);

export const STEP_ALGEBRA_MODES = Object.freeze({
  EQUATION: 'equation',
  RELATION: 'relation',
  LINEAR_INTERCEPTS: 'linearIntercepts',
});

/**
 * The engine QuestionEngine opens for a `stepAlgebra`/`algebra` question, in
 * the renderer's own order: the relation check first (so an inequality never
 * reaches the intercept orchestrator), then the intercept orchestrator — which
 * only the `stepAlgebra` case mounts, never `algebra` — then the equation
 * engine. Any other mode string (or none) opens the equation engine.
 */
export const resolveStepAlgebraMode = (question = {}) => {
  const source = isObject(question) ? question : {};
  if (usesRelationWorkspace(source)) return STEP_ALGEBRA_MODES.RELATION;
  if (text(source.type) === 'stepAlgebra' && source.mode === 'linearIntercepts') return STEP_ALGEBRA_MODES.LINEAR_INTERCEPTS;
  return STEP_ALGEBRA_MODES.EQUATION;
};

// --- Literal questions on the balance -----------------------------------------

/** The letter a literal question asks the student to solve for. */
export const readLiteralVariable = (question = {}) => text(question.solveFor)
  || text(question.variable)
  || text(question.objective?.variable)
  || '';

/** The fields a literal question has carried its formula in, in reading order. */
export const LITERAL_EQUATION_FIELDS = Object.freeze(['equationAscii', 'equation', 'formula', 'equationLatex', 'formulaLatex']);

/**
 * Light pre-check for "can the balance workspace be built for this literal
 * question" — the part of buildLiteralWorkspaceQuestion that needs no parser:
 * a field holding an equals sign, and a letter to solve for. The heavy build
 * (toolMath/algebra-literal/literalWorkspace.mjs) is the authority; this only
 * lets the manifest name the mode without loading mathjs.
 */
export const literalWorkspaceLooksBuildable = (question = {}) => Boolean(
  readLiteralVariable(question)
  && LITERAL_EQUATION_FIELDS.some((field) => text(question[field]).includes('=')),
);

// --- Is there anything for the equation engine to read? ----------------------

/**
 * Does the question carry an equation the workspace can open? The same field
 * choice parseEquationInput (functions/shared/algebra/algebraAstEngine.mjs)
 * makes — split sides first, else the FIRST of equation / equationAscii /
 * initialEquation that is set, else equationLatex — and the same "exactly one
 * equals sign" rule (LaTeX conversion never adds or removes one). A question
 * with none renders "This question could not be loaded" and produces no work,
 * so there is nothing to grade.
 */
export const stepAlgebraEquationSourcePresent = (question = {}) => {
  if (question.leftExpression && question.rightExpression) return true;
  const equation = String(question.equation || question.equationAscii || question.initialEquation || '')
    || String(question.equationLatex ?? '');
  return equation.split('=').length === 2;
};

/** A Question Family instance's generated answer, when it carries one. */
export const hasGeneratedAnswer = (question = {}) => question?.generatedAnswer !== undefined
  && question?.generatedAnswer !== null
  && question?.generatedAnswer !== ''
  && Number.isFinite(Number(question.generatedAnswer));

/** Does an intercept question carry its line (standard coefficients or text)? */
export const linearInterceptSourcePresent = (question = {}) => {
  const direct = isObject(question.standard) ? question.standard : (isObject(question.equation) ? question.equation : null);
  if (direct && ['A', 'B', 'C'].every((key) => Number.isFinite(Number(direct[key])))) return true;
  return ['equation', 'equationText', 'equationAscii', 'initialEquation']
    .some((field) => typeof question[field] === 'string' && question[field].includes('='));
};
