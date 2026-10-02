/*
 * STEP ALGEBRA STEP CREDIT, DERIVED FROM THE STEP ITSELF.
 *
 * Every committed balance move, rewrite, cancellation, distribution, relation
 * step and intercept check earns step credit (attemptPolicy.mjs
 * recordQuestionStep / calculateStepPartialCredit, at most 90% before the
 * question is finished). The workspaces used to report that credit as a
 * finished verdict — { productive, accepted, earned, possible } — and the
 * server could only bound it (submissionIngestion.mjs
 * sanitizeClientAttemptRecord). A forged step envelope could therefore earn up
 * to 90% on any Step Algebra question without doing the work.
 *
 * Now each step travels with its RAW WORK (`stepWork`, normalized and bounded
 * by ../submissionEnvelope.mjs normalizeStepWork): the state before and after,
 * the operation, the support level — never a verdict. This module is the ONE
 * definition of what a step earns:
 *
 *   - the workspaces build the stepGrade they report to the browser's attempt
 *     policy with the builders below (equationMoveStepGrade,
 *     equationRewriteStepGrade, relationStepGrade, interceptStepGrade), from
 *     the move the engine computed;
 *   - the server (verifyStepAlgebraStep) recomputes that move from the raw
 *     work with the SAME engine (../algebra/algebraAstEngine.mjs
 *     applyBalancedOperation, ../algebra/algebraSupportLevels.mjs
 *     evaluateMove, the relation workspace's validateRelationTransition, the
 *     intercept check) and builds the stepGrade with the same builders.
 *
 * So an honest step produces the same stepGrade on both sides, field for
 * field, and recordQuestionStep turns it into the same record.
 *
 * WHAT THE SERVER CHECKS, beyond recomputing the credit:
 *
 *   continuity  `before` is a state this variant has legitimately been in:
 *               the authoritative question's own equation or relation (for a
 *               Question Family instance, the instance rebuilt from its
 *               validated pin — the caller passes it), the first step a
 *               prefill-first-step support applies to it, the record's latest
 *               state, or the `after` of an accepted step already recorded
 *               for this variant (Undo and Reset return to any of those).
 *               States are identified as calculateStepPartialCredit
 *               identifies them (compactStepStateKey of the LaTeX).
 *   validity    `after` is what the step produces from `before`: a balanced
 *               move's sides are equivalent to the move the engine applied;
 *               a rewrite changes a side into an equivalent one; a relation
 *               step passes validateRelationTransition, the workspace's own
 *               gate; an intercept check matches the line's intercept.
 *
 * A step that fails either earns nothing: it is recorded as an
 * `unverified-step` (accepted: false, earned 0, possible 0, no denominator,
 * no state change). The attempt it spends is still spent: a rejected move
 * and an inefficient move at support levels 3-4 cost an attempt in the
 * browser, and spending an attempt can only cost the sender.
 *
 * A step whose states are plain algebra but beyond the server's complexity
 * budget — or whose checks would compose them into an expression beyond it —
 * is not judged at all: it is declined and keeps the sanitized path a step
 * without step work takes (see `beyondBudget` and the composed budget below).
 *
 * Student text is data: every expression is screened as plain algebra inside
 * a complexity budget sized from the authoritative question
 * (stepAlgebraEquivalence.mjs isSafeStudentExpression) before any engine sees
 * it.
 *
 * Pure: the algebra engine, the relation foundation, the intercept math and
 * the light grading support. Never a registry tool grader.
 */
import {
  applyBalancedOperation,
  describeOperation,
  equationToLatex,
  expressionsEquivalent,
  getSuggestedMove,
  latexToExpression,
} from '../algebra/algebraAstEngine.mjs';
import { evaluateMove, resolveEquationAfterMove, resolveSupportLevel } from '../algebra/algebraSupportLevels.mjs';
import { parse } from '../algebra/safeMath.mjs';
import { compactStepStateKey, normalizeQuestionRecord } from '../attemptPolicy.mjs';
import { normalizeStepWork, STEP_WORK_LIMITS, STEP_WORK_VERSION } from '../submissionEnvelope.mjs';
import {
  relationStateToLatex,
  relationStateToText,
  validateRelationTransition,
} from '../toolMath/algebra-relations/algebraRelationFoundation.mjs';
import {
  formatStandardEquation,
  interceptSubEquationQuestion,
  resolveStandardCoefficients,
  substitutionEquationText,
} from '../toolMath/stepAlgebra2/linearInterceptsMath.mjs';
import { serverResponseGradingSupport } from './gradingSupport.mjs';
import {
  IDENTITY,
  compareIdentically,
  expressionComplexity,
  isSafeStudentExpression,
  studentExpressionBudget,
} from './stepAlgebraEquivalence.mjs';
import {
  STEP_ALGEBRA_MODES,
  checkLinearIntercept,
  literalWorkspaceQuestion,
  relationStateFromWork,
  stepAlgebraWorkspaceMode,
  workspacePristineEquation,
  workspacePristineRelation,
} from './stepAlgebraWorkspaceGrading.mjs';

export { STEP_WORK_VERSION, normalizeStepWork };

const text = (value) => String(value ?? '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// --- The step actions and what they cost --------------------------------------------

export const STEP_ACTIONS = Object.freeze({
  // A committed balanced operation (StepByStepAlgebraCore commitMove).
  BALANCED_MOVE: 'balanced-move',
  // A valid but inefficient move at a level where it costs an attempt,
  // reported before the move is committed (attemptMove).
  INEFFICIENT_MOVE: 'inefficient-move',
  // A cancellation on the wrong side or a wrong simplification of a pending
  // move (strikeSide, checkSimplifications).
  REJECTED_MOVE: 'rejected-move',
  // A side rewritten into an equivalent form: Rewrite / Simplify, combine like
  // terms, one-term rewrite, distribution, cancellation, structure tools.
  REWRITE: 'rewrite',
  // A committed relation step (MultiRelationAlgebraCore persistStep).
  RELATION_STEP: 'relation-step',
  // A correct intercept check (LinearInterceptsOrchestrator).
  INTERCEPT_CHECK: 'intercept-check',
});

/**
 * Does this action spend an attempt? The workspace's rule: a rejected move
 * always does; an inefficient move does unless attempts do not expire on this
 * surface (Live Challenge). A step submission comes only from an assignment,
 * where attempts always expire, so the server asks with the default.
 */
export const stepActionCountsAttempt = (action, { attemptsDoNotExpire = false } = {}) => {
  if (action === STEP_ACTIONS.REJECTED_MOVE) return true;
  if (action === STEP_ACTIONS.INEFFICIENT_MOVE) return !attemptsDoNotExpire;
  return false;
};

/** The rewrite tools of the equation workspace, by the step kind each reports. */
export const EQUATION_REWRITE_KINDS = Object.freeze([
  'student-rewrite', 'combine-like-terms', 'inline-term-rewrite', 'distribution', 'student-cancellation',
  // algebraStructureTools.js: Factor, Split fraction, Cancel factors,
  // Simplify arithmetic, Arrange terms.
  'factor', 'split-fraction', 'reduce-fraction', 'simplify-arithmetic', 'arrange-terms',
]);

/** The relation workspace's step kinds (MultiRelationAlgebraCore, RelationStructureTools). */
export const RELATION_STEP_KINDS = Object.freeze([
  'relation-step', 'multi-branch-relation-step', 'student-relation-direction', 'student-rewrite',
  'student-cancellation', 'absolute-value-split', 'square-root', 'solution-claim', 'complete-square',
  'distribution', 'combine-like-terms',
]);

export const UNVERIFIED_STEP_KIND = 'unverified-step';

// --- What a step earns: the one definition -------------------------------------------

/** The planned step denominators the workspaces have always used. */
export const equationExpectedStepPoints = (question = {}) => Number(question?.expectedStepPoints || 6);
export const relationExpectedStepPoints = (question = {}) => Number(question?.expectedStepPoints || 8);
export const INTERCEPT_EXPECTED_STEP_POINTS = 2;

/**
 * A balanced move's credit. Committed: 2 when the move was the helpful one
 * (efficient), 1 when it was merely valid. An inefficient move that costs an
 * attempt is reported once more, uncommitted, at 1 of 2; a rejected
 * cancellation or simplification earns 0 of 1 and is not accepted.
 */
export const balancedMoveCredit = (action, verdict) => {
  if (action === STEP_ACTIONS.REJECTED_MOVE) return { accepted: false, earned: 0, possible: 1 };
  if (action === STEP_ACTIONS.INEFFICIENT_MOVE) return { accepted: true, earned: 1, possible: 2 };
  return { accepted: true, earned: verdict.efficient ? 2 : verdict.valid ? 1 : 0, possible: 2 };
};

/**
 * The stepGrade a balanced move reports. `before` is the equation the move was
 * made on and `after` the equation it committed (the same equation for an
 * uncommitted inefficient or rejected move).
 */
export const equationMoveStepGrade = ({ action, move, supportLevel, before, after = before, question = {} }) => {
  const credit = balancedMoveCredit(action, evaluateMove(move, supportLevel));
  return {
    kind: credit.accepted ? 'balanced-operation' : 'rejected-operation',
    label: describeOperation(move.operation, move.operandExpression),
    supportLevel,
    productive: move.productive,
    accepted: credit.accepted,
    earned: credit.earned,
    possible: credit.possible,
    equationBefore: equationToLatex(before),
    equationAfter: credit.accepted ? equationToLatex(after) : equationToLatex(before),
    expectedTotalPoints: equationExpectedStepPoints(question),
  };
};

/*
 * A step's display label, bounded exactly as its raw work bounds it
 * (normalizeStepWork). A label the workspace writes (a distribution names its
 * factor and group) is display text only; bounding it here, on both sides,
 * keeps the label the server records equal to the browser's. Every realistic
 * label is far shorter than the bound and is unchanged.
 */
export const boundedStepLabel = (label) => (typeof label === 'string' ? label.slice(0, STEP_WORK_LIMITS.maxLabelLength) : label);

/** A rewrite of one or both sides: always productive, 1 of 1. */
export const equationRewriteStepGrade = ({ kind, label, supportLevel, before, after, question = {} }) => ({
  kind,
  label: boundedStepLabel(label),
  supportLevel,
  productive: true,
  accepted: true,
  earned: 1,
  possible: 1,
  equationBefore: equationToLatex(before),
  equationAfter: equationToLatex(after),
  expectedTotalPoints: equationExpectedStepPoints(question),
});

/** What an accepted equation step saves: the equation the student now sees. */
export const equationStatePatch = ({ equation, supportLevel, stepNumber }) => ({
  algebraState: { equation, supportLevel, stepNumber },
  questionDetails: `Current equation: $${equationToLatex(equation)}$`,
});

export const rejectedMoveStatePatch = (move) => ({
  questionDetails: `Rejected move: ${describeOperation(move.operation, move.operandExpression)}`,
});

/** A committed relation step: always productive, 1 of 1. */
export const relationStepGrade = ({ kind = 'relation-step', label, before, after, question = {} }) => ({
  kind,
  label: boundedStepLabel(label),
  productive: true,
  accepted: true,
  earned: 1,
  possible: 1,
  equationBefore: relationStateToLatex(before),
  equationAfter: relationStateToLatex(after),
  expectedTotalPoints: relationExpectedStepPoints(question),
});

export const relationStatePatch = (after) => ({
  algebraState: { relationState: after },
  questionDetails: `Current relation: ${relationStateToText(after)}`,
});

export const interceptStepLabel = (intercept) => (intercept === 'x' ? 'x-intercept' : 'y-intercept');

/** A correct intercept check: 1 of 1, on a two-point rubric. */
export const interceptStepGrade = ({ standard, intercept, point }) => ({
  kind: 'linear-intercept',
  label: `Found the ${interceptStepLabel(intercept)}`,
  productive: true,
  accepted: true,
  earned: 1,
  possible: 1,
  equationBefore: formatStandardEquation(standard),
  equationAfter: `${interceptStepLabel(intercept)} = ${point}`,
  expectedTotalPoints: INTERCEPT_EXPECTED_STEP_POINTS,
});

// --- The raw work each workspace reports ----------------------------------------------

const sides = (equation) => ({ left: text(equation?.left), right: text(equation?.right) });

const relationWork = (state) => ({
  special: state?.special === 'noSolution' || state?.special === 'allReals' ? state.special : null,
  connective: state?.connective ?? null,
  branches: (Array.isArray(state?.branches) ? state.branches : []).map((branch) => ({
    expressions: Array.isArray(branch?.expressions) ? branch.expressions.map(text) : [],
    relations: Array.isArray(branch?.relations) ? branch.relations.map(text) : [],
  })),
});

/**
 * An equation step's raw work. `move` is the engine's move (applyBalancedOperation)
 * for a balanced, inefficient or rejected move; its operand travels as the
 * engine's own operand expression (parseOperationOperand reads it back to the
 * same expression) and, for an additive move, where the student wrote it.
 */
export const equationStepWork = ({
  action,
  before,
  after = null,
  move = null,
  kind = null,
  label = null,
  supportLevel = null,
  zeroVariable = null,
}) => normalizeStepWork({
  version: STEP_WORK_VERSION,
  surface: 'equation',
  action,
  ...(kind ? { kind } : {}),
  ...(label ? { label } : {}),
  before: sides(before),
  ...(after ? { after: sides(after) } : {}),
  ...(move ? {
    operation: {
      operation: move.operation,
      operand: text(move.operandExpression),
      placementBySide: ['add', 'subtract'].includes(move.operation) && isObject(move.placementBySide)
        ? move.placementBySide
        : null,
    },
  } : {}),
  ...(supportLevel != null ? { supportLevel } : {}),
  ...(zeroVariable ? { zeroVariable } : {}),
});

/** A relation step's raw work, with the validation context the workspace checked it with. */
export const relationStepWork = ({ kind = 'relation-step', label = '', before, after, transition = null }) => normalizeStepWork({
  version: STEP_WORK_VERSION,
  surface: 'relation',
  action: STEP_ACTIONS.RELATION_STEP,
  kind,
  label,
  before: relationWork(before),
  after: relationWork(after),
  ...(transition ? { transition } : {}),
});

/** An intercept check's raw work: which intercept, and the pair as typed. */
export const interceptStepWork = ({ intercept, point }) => normalizeStepWork({
  version: STEP_WORK_VERSION,
  surface: 'intercept',
  action: STEP_ACTIONS.INTERCEPT_CHECK,
  intercept,
  point: text(point),
});

// --- States the workspaces derive -----------------------------------------------------

/**
 * The prefill-first-step support: the engine's suggested first balanced move,
 * applied at Guided level with its cancellations done. Null when there is no
 * suggestion. StepByStepAlgebraCore applies exactly this; the server accepts
 * its result as a starting point.
 */
export const prefilledFirstStep = (equation) => {
  try {
    const suggestion = getSuggestedMove(equation);
    if (!suggestion) return null;
    const move = applyBalancedOperation({ equationState: equation, operation: suggestion.operation, operand: String(suggestion.operand) });
    return { suggestion, equation: resolveEquationAfterMove(move, 1, move.requiredCancellationSides || []) };
  } catch {
    return null;
  }
};

/*
 * The one-variable equation the intercept orchestrator hands to the equation
 * workspace once a 0 is substituted, and the question it opens it with, live
 * in ../toolMath/stepAlgebra2/linearInterceptsMath.mjs (light, so a tool that
 * embeds the same substitution — the Multiple Representations board's Process
 * Mode — opens exactly this equation without loading the step verifier).
 */
export { interceptSubEquationQuestion, substitutionEquationText };

// --- Server verification ------------------------------------------------------------

/** The surfaces whose steps the server credits: every Step Algebra workspace. */
export const STEP_CREDIT_SURFACES = Object.freeze(['stepAlgebra', 'algebra', 'literalWorkspace']);

/**
 * Which workspace the AUTHORITATIVE question opens and the question it opens
 * it with — the same decision the final-answer grader makes
 * (stepAlgebraWorkspaceGrading.mjs). Not supported for a question the server
 * does not hold as delivered (generated, variant pool, adaptive band, family
 * template) or that is not a Step Algebra surface.
 */
export const stepCreditContext = (question) => {
  const support = serverResponseGradingSupport(question);
  if (!support.supported) return { supported: false, reason: support.reason || 'unsupported-question' };
  if (!STEP_CREDIT_SURFACES.includes(support.surfaceId)) {
    return { supported: false, reason: `not-step-algebra:${support.surfaceId || 'unknown'}` };
  }
  let workspaceQuestion = question;
  const literal = support.surfaceId === 'literalWorkspace';
  if (literal) {
    const built = literalWorkspaceQuestion(question);
    if (!built.question) return { supported: false, reason: 'literal-workspace-unavailable' };
    workspaceQuestion = built.question;
  }
  return {
    supported: true,
    reason: null,
    surfaceId: support.surfaceId,
    mode: stepAlgebraWorkspaceMode(workspaceQuestion, { literal }),
    question: workspaceQuestion,
  };
};

/*
 * The step budget: the final-answer budget (sized from the authoritative
 * equation), with more room for nesting and size — a state the student keeps
 * "as written" after several moves nests one level per move — but the SAME
 * chain limits, which are what bound the simplifier's cost.
 */
const stepBudget = (...authored) => {
  const budget = studentExpressionBudget(...authored);
  return Object.freeze({ ...budget, nodes: Math.max(budget.nodes, 300), depth: Math.max(budget.depth, 40) });
};

const safe = (expression, budget) => typeof expression === 'string' && isSafeStudentExpression(expression, budget);

/*
 * BEYOND THE SERVER'S BUDGET IS NOT "WRONG".
 *
 * The budget bounds what the server hands the simplifier, whose cost grows
 * steeply with the length of a sum or product chain. An honest student can
 * outgrow it: eight additive moves in a row kept "as written" on 3x + 6 = 21
 * make the ninth state a chain of more than ten links. Recording that step as
 * unverified would also strand every later step — the state it reached would
 * never be recorded, so nothing after it could follow from it, not even the
 * simplification that brings the equation back inside the budget.
 *
 * So a state that is plain algebra but beyond the budget is not judged here:
 * the step is DECLINED ({ eligible: false }) and keeps the sanitized path a
 * step without step work takes (submissionIngestion.mjs). That path is
 * exactly as open to a forger as leaving stepWork out altogether, so
 * declining grants nothing new — and the two must be retired together. Text
 * that is not plain algebra, at any size, still earns nothing (unverified).
 */
const UNBOUNDED_BUDGET = Object.freeze({ nodes: Infinity, depth: Infinity, chain: Infinity, reciprocalChain: Infinity, reciprocals: Infinity });
const beyondBudget = (expression, budget) => typeof expression === 'string'
  && !isSafeStudentExpression(expression, budget)
  && isSafeStudentExpression(expression, UNBOUNDED_BUDGET);
export const STEP_BEYOND_SERVER_BUDGET = 'step-beyond-server-budget';
const declinedBeyondBudget = (action) => ({ eligible: false, verified: false, reason: STEP_BEYOND_SERVER_BUDGET, action });

/** An equation from the work, on the authoritative variable and objective. */
const readEquation = (work, pristine, budget) => (
  isObject(work) && safe(work.left, budget) && safe(work.right, budget)
    ? { ...pristine, left: work.left, right: work.right }
    : null
);

const latexKey = (render) => {
  try {
    return compactStepStateKey(render());
  } catch {
    return '';
  }
};
const equationKey = (equation) => latexKey(() => equationToLatex(equation));
const relationKey = (state) => latexKey(() => relationStateToLatex(state));

/*
 * WHAT THE ENGINE IS HANDED AT ONCE: THE COMPOSED BUDGET.
 *
 * The step budget bounds each expression of a step on its own. The checks
 * below hand the engine COMPOSITIONS of them: a balanced move simplifies
 * `(before) − (operand)` on each side (and pairs its terms for cancellation),
 * a side the sampler cannot confirm is compared as `(after) − (before)`, a
 * relation step compares `((before) op (operand)) − (after)` for every
 * expression. The simplifier's cost grows steeply with the length of the sum
 * it is handed, so three expressions each inside the budget compose into one
 * far outside it — measured on this engine: a 10-link side, a 10-link operand
 * and a 10-link `after` kept ONE verification busy for more than five
 * minutes, and a relation step of the same shape for 24 s, where a 12-link
 * composition takes about a second.
 *
 * So the composition itself — the expression the engine will be handed — is
 * measured before the engine sees it (stepAlgebraEquivalence.mjs
 * expressionComplexity: the longest flattened sum or product chain, and its
 * reciprocal terms). Its chain must fit the step budget's with two links of
 * headroom (an honest move adds a one-term operand to a side that is itself
 * inside the budget), and its reciprocal terms twice the budget's (each side
 * of a comparison may hold its own). Products compose cheaply — two 10-factor
 * products compared cost ~0.2 s — and are measured as they are, never as a
 * sum. A step whose composition does not fit is DECLINED exactly like a state
 * beyond the budget (see beyondBudget): an honest student keeps the sanitized
 * path a step without work takes, and a forger gains nothing they could not
 * have by leaving the work out.
 */
const COMPOSED_CHAIN_HEADROOM = 2;
// A relation step compares every expression it holds (up to 8 branches of
// up to 5); bounding each comparison alone would still allow dozens of
// near-limit simplifications in one step. The whole step's comparisons share
// this many composed links — far above an honest step (a two-branch absolute
// value split compares four short expressions).
const RELATION_COMPOSED_CHAIN_TOTAL = 48;
const OPERATION_SYMBOL = Object.freeze({ add: '+', subtract: '-', multiply: '*', divide: '/' });

const measure = (expression) => {
  try {
    return expressionComplexity(parse(String(expression)));
  } catch {
    return null;
  }
};

const composedFits = (composed, budget) => Boolean(composed)
  && composed.chain <= budget.chain + COMPOSED_CHAIN_HEADROOM
  && composed.reciprocals <= 2 * budget.reciprocals;

/** May the engine be handed this composed expression? */
export const composedWithinBudget = (budget, composed) => composedFits(measure(composed), budget);

/** `(a) − (b)`, as a comparison hands it to the simplifier. */
const difference = (left, right) => `(${left}) - (${right})`;
/** `(side) op (operand)`, as the engine composes a balanced operation. */
const operated = (side, operation, operand) => `(${side}) ${OPERATION_SYMBOL[operation] || '-'} (${operand})`;

const BEYOND = 'beyond-budget';

/*
 * Two expressions the workspace treats as the same side: true, false, or
 * BEYOND (the comparison would hand the engine more than the composed budget).
 * The fast, deterministic sampler first (stepAlgebraEquivalence.mjs): when it
 * shows the two equal, that settles it — every honest step takes this path,
 * at any size. Otherwise the workspace's OWN check decides
 * (expressionsEquivalent, which every rewrite tool and typed simplification
 * passed in the browser), so no step the workspace accepted is refused here.
 *
 * A sampler "different" is NOT final. The workspace accepts some forms the
 * sampler separates — mathjs simplifies (x^2)^(1/2) - x to 0, and the
 * workspace's integer probes accept identities that hold only at integers —
 * and refusing such an honest step would strand every step after it (the
 * state it reached would never be recorded). Accepting what the workspace
 * accepts grants a forger nothing an honest student cannot already earn: a
 * rewrite earns 1/1 either way. The slower check is only ever handed a
 * composition inside the composed budget.
 */
const sidesEquivalent = (left, right, variable, budget) => {
  let sampled = IDENTITY.UNKNOWN;
  try {
    sampled = compareIdentically(parse(String(left)), parse(String(right)));
  } catch {
    sampled = IDENTITY.UNKNOWN;
  }
  if (sampled === IDENTITY.EQUAL) return true;
  if (!composedWithinBudget(budget, difference(left, right))) return BEYOND;
  return expressionsEquivalent(left, right, variable);
};

const compact = (value) => text(value).replace(/\s+/g, '');

/** The record's steps on its current variant. */
const variantSteps = (record) => record.stepGrades.filter((step) => Number(step?.variantIndex) === Number(record.variantIndex));

/** Recorded steps whose `after` is a state the student really reached. */
const chainsFrom = (step) => step?.accepted !== false
  && step?.kind !== UNVERIFIED_STEP_KIND
  && step?.kind !== 'linear-intercept';

const recordedStateKeys = (record) => variantSteps(record)
  .filter(chainsFrom)
  .map((step) => compactStepStateKey(step.equationAfter))
  .filter(Boolean);

const outcome = (fields) => ({ eligible: true, verified: true, reason: null, ...fields });

/** What a step that failed verification records: nothing earned, nothing possible. */
const unverified = (action, reason) => ({
  eligible: true,
  verified: false,
  reason,
  action,
  stepGrade: {
    kind: UNVERIFIED_STEP_KIND,
    label: 'Step not verified by the server',
    productive: false,
    accepted: false,
    earned: 0,
    possible: 0,
    equationBefore: '',
    equationAfter: '',
    expectedTotalPoints: 0,
  },
  countsAttempt: stepActionCountsAttempt(action),
  statePatch: {},
});

/** An unverified step: no credit, no state change (an attempt only if the action spends one). */
export const unverifiedStep = (action, reason) => unverified(action, reason);

// The operand as the engine will read it: only plain algebra reaches
// parseOperationOperand (which evaluates a numeric operand).
const operandExpression = (operand) => {
  try {
    return latexToExpression(operand).replace(/\)\s*\(/g, ')*(');
  } catch {
    return null;
  }
};
const safeOperand = (operand, budget) => safe(operandExpression(operand), budget);

// The engine composes `(side) op (operand)` on each side of the equation.
const moveCompositionFits = (equation, operation, operand, budget) => ['left', 'right']
  .every((side) => composedWithinBudget(budget, operated(equation[side], operation, operand)));


const recomputeMove = (before, operation) => {
  try {
    return applyBalancedOperation({
      equationState: before,
      operation: operation.operation,
      operand: operation.operand,
      placementBySide: operation.placementBySide || {},
    });
  } catch {
    return null;
  }
};

/** The side a one-side rewrite changed, by the workspace's own comparison. */
const changedSides = (before, after) => ['left', 'right'].filter((side) => compact(before[side]) !== compact(after[side]));

const rewriteLabel = (kind, changed, claimed) => {
  if (kind === 'student-rewrite') return `Rewrite / simplify ${changed.join(' and ')}`;
  if (kind === 'combine-like-terms') return `Combine like terms on the ${changed[0]} side`;
  if (kind === 'inline-term-rewrite') return `Rewrite one term on the ${changed[0]} side`;
  if (kind === 'student-cancellation') return `Cancel matching terms on the ${changed[0]} side`;
  // Distribution and the structure tools name the factor or fraction they
  // acted on; that display text is the student's own, bounded.
  return claimed || (kind === 'distribution' ? 'Distribute' : 'Algebra step');
};
const ONE_SIDE_REWRITES = new Set(['combine-like-terms', 'inline-term-rewrite', 'student-cancellation']);

/**
 * One equation-workspace step. `pristines` are the equations the workspace can
 * open on (the question's, or the intercept sub-equation), `stepNumberBase`
 * the step counter the workspace continues from.
 */
const verifyEquationStep = ({ work, pristine, question, record, stepNumberBase }) => {
  const { action } = work;
  const budget = stepBudget(pristine.left, pristine.right);
  const expressions = [work.before?.left, work.before?.right, work.after?.left, work.after?.right];
  if (isObject(work.operation)) expressions.push(operandExpression(work.operation.operand));
  if (expressions.some((expression) => beyondBudget(expression, budget))) return declinedBeyondBudget(action);
  const before = readEquation(work.before, pristine, budget);
  if (!before) return unverified(action, 'step-state-unreadable');

  // Continuity: the question's own equation, the record's latest equation, a
  // state an accepted step reached — or the first step the prefill-first-step
  // support applies to either of the first two (the workspace opens on one of
  // them). A prefilled start forgoes that step's credit, so accepting it
  // never earns more than starting from the question.
  const beforeKey = equationKey(before);
  const starts = [pristine];
  const latest = readEquation(record.algebraState?.equation, pristine, budget);
  if (latest) starts.push(latest);
  const continuous = Boolean(beforeKey) && (
    recordedStateKeys(record).includes(beforeKey)
    || starts.some((state) => equationKey(state) === beforeKey)
    || starts.some((state) => {
      const prefilled = prefilledFirstStep(state);
      return Boolean(prefilled) && equationKey(prefilled.equation) === beforeKey;
    })
  );
  if (!continuous) return unverified(action, 'step-not-continuous');

  const supportLevel = resolveSupportLevel({ workspaceDifficulty: work.supportLevel });
  const variable = pristine.variable;

  if (action === STEP_ACTIONS.BALANCED_MOVE || action === STEP_ACTIONS.INEFFICIENT_MOVE || action === STEP_ACTIONS.REJECTED_MOVE) {
    // The workspace refuses an unreadable or unbalanced move before it
    // reaches step credit (attemptMove), so neither is ever a step.
    if (!isObject(work.operation) || !safeOperand(work.operation.operand, budget)) return unverified(action, 'step-operation-invalid');
    if (!moveCompositionFits(before, work.operation.operation, operandExpression(work.operation.operand), budget)) {
      return declinedBeyondBudget(action);
    }
    const move = recomputeMove(before, work.operation);
    if (!move || !move.preservesSolution) return unverified(action, 'step-operation-invalid');
    if (action === STEP_ACTIONS.INEFFICIENT_MOVE && !evaluateMove(move, supportLevel).countsAttempt) {
      return unverified(action, 'step-move-not-inefficient');
    }
    let after = before;
    if (action === STEP_ACTIONS.BALANCED_MOVE) {
      after = readEquation(work.after, pristine, budget);
      if (!after) return unverified(action, 'step-state-unreadable');
      // Validity: whatever the student cancelled, simplified or kept as
      // written, each side is the side the operation produced.
      for (const side of ['left', 'right']) {
        const produced = sidesEquivalent(after[side], move.unsimplified[side], variable, budget);
        if (produced === BEYOND) return declinedBeyondBudget(action);
        if (!produced) return unverified(action, 'step-not-from-operation');
      }
    }
    return outcome({
      action,
      stepGrade: equationMoveStepGrade({ action, move, supportLevel, before, after, question }),
      countsAttempt: stepActionCountsAttempt(action),
      statePatch: action === STEP_ACTIONS.REJECTED_MOVE
        ? rejectedMoveStatePatch(move)
        : equationStatePatch({ equation: after, supportLevel, stepNumber: stepNumberBase + 1 }),
    });
  }

  if (action === STEP_ACTIONS.REWRITE) {
    const kind = text(work.kind);
    if (!EQUATION_REWRITE_KINDS.includes(kind)) return unverified(action, 'step-kind-unknown');
    const after = readEquation(work.after, pristine, budget);
    if (!after) return unverified(action, 'step-state-unreadable');
    const changed = changedSides(before, after);
    // Every rewrite tool refuses to commit an unchanged equation.
    if (!changed.length) return unverified(action, 'step-unchanged');
    if (ONE_SIDE_REWRITES.has(kind) && changed.length !== 1) return unverified(action, 'step-not-one-side');
    for (const side of changed) {
      const equivalent = sidesEquivalent(after[side], before[side], variable, budget);
      if (equivalent === BEYOND) return declinedBeyondBudget(action);
      if (!equivalent) return unverified(action, 'step-not-equivalent');
    }
    return outcome({
      action,
      stepGrade: equationRewriteStepGrade({
        kind,
        label: rewriteLabel(kind, changed, text(work.label)),
        supportLevel,
        before,
        after,
        question,
      }),
      countsAttempt: false,
      statePatch: equationStatePatch({ equation: after, supportLevel, stepNumber: stepNumberBase + 1 }),
    });
  }

  return unverified(action, 'step-action-not-on-surface');
};

/*
 * validateRelationTransition compares each expression of `after` with its
 * counterpart in `before` (operated on, for a balanced operation; split or
 * square-rooted, for those steps — a counterpart no larger than the `before`
 * expression it is built from). An `after` expression with no counterpart at
 * the same place (a split's new branch) is measured against the largest
 * `before` expression. Each comparison must fit the composed budget, and the
 * step's comparisons together RELATION_COMPOSED_CHAIN_TOTAL links.
 */
const relationCompositionFits = (before, after, transition, budget) => {
  const operand = transition?.kind === 'balancedOperation' ? operandExpression(transition.operandExpression) : null;
  const beforeBranches = before?.branches || [];
  const largestBefore = beforeBranches
    .flatMap((branch) => branch.expressions || [])
    .reduce((largest, expression) => {
      const size = measure(expression)?.chain || 0;
      return size > largest.size ? { expression, size } : largest;
    }, { expression: '0', size: -1 }).expression;
  let total = 0;
  for (const [branchIndex, branch] of (after?.branches || []).entries()) {
    for (const [expressionIndex, expression] of (branch.expressions || []).entries()) {
      const counterpart = beforeBranches[branchIndex]?.expressions?.[expressionIndex] ?? largestBefore;
      const expected = operand === null ? counterpart : operated(counterpart, transition.operation, operand);
      const composed = measure(difference(expected, expression));
      if (!composedFits(composed, budget)) return false;
      total += composed.chain;
      if (total > RELATION_COMPOSED_CHAIN_TOTAL) return false;
    }
  }
  return true;
};

const verifyRelationStep = ({ work, question, record }) => {
  const { action } = work;
  if (action !== STEP_ACTIONS.RELATION_STEP) return unverified(action, 'step-action-not-on-surface');
  const pristine = workspacePristineRelation(question);
  if (!pristine) return unverified(action, 'no-readable-relation');
  const kind = text(work.kind) || 'relation-step';
  if (!RELATION_STEP_KINDS.includes(kind)) return unverified(action, 'step-kind-unknown');
  // The budgets relationStateFromWork and the operand check below apply.
  const pristineExpressions = (pristine.branches || []).flatMap((branch) => branch.expressions || []);
  const stateBudget = studentExpressionBudget(...pristineExpressions);
  const stateExpressions = [work.before, work.after].flatMap((state) => (state?.branches || []).flatMap((branch) => branch.expressions || []));
  if (stateExpressions.some((expression) => beyondBudget(expression, stateBudget))
    || (work.transition?.kind === 'balancedOperation' && beyondBudget(operandExpression(work.transition.operandExpression), stepBudget(...pristineExpressions)))) {
    return declinedBeyondBudget(action);
  }
  // Read exactly as the final-answer grader reads a relation: the question's
  // variable and original, plain algebra inside the question's budget.
  const before = relationStateFromWork(pristine, work.before);
  const after = relationStateFromWork(pristine, work.after);
  if (!before || !after) return unverified(action, 'step-state-unreadable');

  // Continuity: the question's relation (Reset returns to it), the record's
  // latest relation, or a relation an accepted step reached (Undo).
  const anchors = new Set(recordedStateKeys(record));
  anchors.add(relationKey(pristine));
  const latest = isObject(record.algebraState?.relationState)
    ? relationStateFromWork(pristine, relationWork(record.algebraState.relationState))
    : null;
  if (latest) anchors.add(relationKey(latest));
  anchors.delete('');
  if (!anchors.has(relationKey(before))) return unverified(action, 'step-not-continuous');

  const transition = isObject(work.transition) ? work.transition : { kind: 'equivalentRewrite' };
  const composedBudget = stepBudget(...pristineExpressions);
  if (transition.kind === 'balancedOperation' && !safeOperand(transition.operandExpression, composedBudget)) {
    return unverified(action, 'step-operation-invalid');
  }
  // The gate below compares every expression of `after` with what the step
  // makes of its counterpart in `before` — never more than the engine may be
  // handed (see the composed budget above).
  if (!relationCompositionFits(before, after, transition, composedBudget)) return declinedBeyondBudget(action);
  // The workspace's own gate (commitState / chooseRelationSymbol).
  if (!validateRelationTransition(before, after, transition).valid) return unverified(action, 'step-transition-invalid');
  return outcome({
    action,
    // The workspace's own display label, as the browser recorded it (an empty
    // one falls back to recordQuestionStep's default on both sides alike).
    stepGrade: relationStepGrade({ kind, label: text(work.label), before, after, question }),
    countsAttempt: false,
    statePatch: relationStatePatch(after),
  });
};

/*
 * The line the intercept orchestrator reads (LinearInterceptsOrchestrator:
 * `resolveStandardCoefficients(question)`), NOT the final-answer grader's
 * stricter usableStandard. A vertical or horizontal line (B or A zero) still
 * opens the orchestrator, whose x-intercept check and sub-solve the browser
 * credits; reading it any other way would record those honest steps as
 * unverified. The intercept a line does not have is never matched
 * (expectedInterceptPoint is null), so nothing is credited that the browser
 * would not credit.
 */
const orchestratorStandard = (question) => resolveStandardCoefficients(question);

const verifyInterceptCheck = ({ work, question, record }) => {
  const { action } = work;
  if (action !== STEP_ACTIONS.INTERCEPT_CHECK) return unverified(action, 'step-action-not-on-surface');
  const standard = orchestratorStandard(question);
  if (!standard) return unverified(action, 'no-intercept-line');
  if (!checkLinearIntercept(standard, work.intercept, work.point)) return unverified(action, 'step-intercept-incorrect');
  // The orchestrator moves on after an intercept is found; it is found once.
  const label = `Found the ${interceptStepLabel(work.intercept)}`;
  if (variantSteps(record).some((step) => step?.kind === 'linear-intercept' && step?.accepted !== false && step?.label === label)) {
    return unverified(action, 'step-intercept-already-found');
  }
  return outcome({
    action,
    stepGrade: interceptStepGrade({ standard, intercept: work.intercept, point: work.point }),
    countsAttempt: false,
    statePatch: {},
  });
};

/**
 * Derive one step's credit on the server.
 *
 *   question     the AUTHORITATIVE question (deliveredQuestionForGrading; a
 *                Question Family instance rebuilt from its validated pin)
 *   record       the canonical attempt record the step lands on
 *   stepWork     the step's raw work
 *
 * Returns { eligible: false, reason } when the question is not a Step Algebra
 * surface the server holds as delivered, or the step's states — or what its
 * checks would compose of them — are beyond the server's complexity budget
 * (STEP_BEYOND_SERVER_BUDGET) — the caller keeps
 * its sanitized path — else { eligible: true, verified, reason, action,
 * stepGrade, countsAttempt, statePatch }: the arguments recordQuestionStep
 * takes.
 */
export const verifyStepAlgebraStep = ({ question, record = null, stepWork } = {}) => {
  const context = stepCreditContext(question);
  if (!context.supported) return { eligible: false, reason: context.reason };
  const work = normalizeStepWork(stepWork);
  if (!work) return { eligible: false, reason: 'step-work-unreadable' };
  const canonical = normalizeQuestionRecord(record);
  try {
    if (context.mode === STEP_ALGEBRA_MODES.RELATION) {
      return work.surface === 'relation'
        ? verifyRelationStep({ work, question: context.question, record: canonical })
        : unverified(work.action, 'step-surface-mismatch');
    }
    if (context.mode === STEP_ALGEBRA_MODES.LINEAR_INTERCEPTS) {
      if (work.surface === 'intercept') return verifyInterceptCheck({ work, question: context.question, record: canonical });
      const standard = orchestratorStandard(context.question);
      const subQuestion = work.surface === 'equation' && standard && work.zeroVariable
        ? interceptSubEquationQuestion(context.question, standard, work.zeroVariable)
        : null;
      const pristine = subQuestion ? workspacePristineEquation(subQuestion) : null;
      if (!pristine) return unverified(work.action, 'step-surface-mismatch');
      // The orchestrator opens each sub-solve on a record with no algebra
      // state, so its step counter always starts again.
      return verifyEquationStep({ work, pristine, question: subQuestion, record: canonical, stepNumberBase: 0 });
    }
    if (work.surface !== 'equation' || work.zeroVariable) return unverified(work.action, 'step-surface-mismatch');
    const pristine = workspacePristineEquation(context.question);
    if (!pristine) return unverified(work.action, 'no-readable-equation');
    return verifyEquationStep({
      work,
      pristine,
      question: context.question,
      record: canonical,
      stepNumberBase: Number(canonical.algebraState?.stepNumber || 0),
    });
  } catch (error) {
    // Tampered work must never crash ingestion; it simply earns nothing.
    return unverified(work.action, `step-verification-error:${text(error?.message).slice(0, 80)}`);
  }
};
