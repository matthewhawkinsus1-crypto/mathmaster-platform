/*
 * THE ONE PLACE THAT DECIDES WHICH ALGEBRA WORKSPACE A STUDENT GETS.
 *
 * MathMaster has more than one surface that can host algebra work:
 *
 *   - StepByStepAlgebraCore — the mature equation engine. Distribution, like
 *     terms, factoring, fraction splitting/reduction, arrangement, exact
 *     fractions, described work steps and path-aware Undo all live here
 *     (PRs #336–#346).
 *   - MultiRelationAlgebraCore — inequalities, compound inequalities,
 *     absolute value and square-root relations (sign reversal, branching).
 *   - LinearInterceptsOrchestrator — the x/y-intercept stages, which hand each
 *     one-variable solve to StepByStepAlgebraCore.
 *   - the registry `stepAlgebra2` shell — RewriteLinearForm (which now hosts
 *     StepByStepAlgebraCore) plus two legacy mini-solvers kept only for stored
 *     compatibility.
 *
 * Before this module the choice was made in three files (QuestionEngine's type
 * switch, StepByStepAlgebra's own relation check, the registry lookup) and each
 * caller ran its own preparation first. The student assignment player applied
 * the runtime repair that moves stored `stepAlgebra2` questions onto the mature
 * engine; Teacher Question Review, the library/Path/Live Challenge/demo hosts
 * did not — so the same stored question could open the mature engine for a
 * student and a narrower legacy solver for the teacher checking it. A
 * capability can therefore "disappear" without a line of it being deleted: the
 * code still exists, the route stops reaching it.
 *
 * This module is React-free so node tests certify the exact decision the
 * renderer makes. QuestionEngine and StepByStepAlgebra consult it; nothing else
 * should re-derive the choice.
 */
import { needsMultiRelationWorkspace } from '../../algebraRelationFoundation.js';
import { withPromptRelationSource } from '../../stepAlgebraRelationRouting.js';
import { usesLiteralWorkspace } from '../../literalWorkspace.js';
import { TOOL_CATALOG } from '../../tools/toolCatalog.js';
import { readComposedQuestion } from '../workflow/questionWorkflow.js';
import { repairQuestionForCurrentRuntime } from '../assignments/assignmentRuntimeRepair.js';

const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const ALGEBRA_ENGINES = Object.freeze({
  STEP_ALGEBRA_CORE: 'stepAlgebraCore',
  MULTI_RELATION: 'multiRelationAlgebraCore',
  LEGACY_NUMERIC_SOLVER: 'legacyStepAlgebra2NumericSolver',
  LEGACY_INTERCEPT_SOLVER: 'legacyStepAlgebra2InterceptSolver',
  SYSTEMS_WORKSPACE: 'systemsWorkspace',
  LITERAL_ANSWER_BOX: 'literalAnswerBox',
});

export const ALGEBRA_WORKSPACE_ROUTES = Object.freeze({
  // QuestionEngine `stepAlgebra`/`algebra` → StepByStepAlgebra → StepByStepAlgebraCore
  STEP_ALGEBRA: 'stepAlgebra',
  // QuestionEngine `stepAlgebra` (or StepByStepAlgebra's handoff) → MultiRelationAlgebra
  RELATION: 'relation',
  // QuestionEngine `stepAlgebra` + mode linearIntercepts → LinearInterceptsOrchestrator
  LINEAR_INTERCEPTS: 'linearIntercepts',
  // QuestionEngine `literal` asking for the balance workspace → StepByStepAlgebra
  LITERAL_WORKSPACE: 'literalWorkspace',
  // QuestionEngine `literal` default → LiteralGrader (typed answer, no workspace)
  LITERAL_ANSWER: 'literalAnswer',
  // registry stepAlgebra2 mode rewriteLinearForm → RewriteLinearForm → StepByStepAlgebraCore
  REWRITE_LINEAR_FORM: 'stepAlgebra2.rewriteLinearForm',
  // registry stepAlgebra2 mode linearIntercepts → legacy LinearIntercepts mini-solver
  LEGACY_LINEAR_INTERCEPTS: 'stepAlgebra2.linearIntercepts',
  // registry stepAlgebra2 without a mode → legacy numeric ax + b = c mini-solver
  LEGACY_NUMERIC: 'stepAlgebra2.numeric',
  // registry systemsWorkspace (substitution, elimination, 3×3, inequality systems)
  SYSTEMS_WORKSPACE: 'systemsWorkspace',
  // a composed question: WorkflowRunner owns the stages (its algebra stage is
  // StepByStepAlgebra, routed again through usesRelationWorkspace)
  WORKFLOW: 'workflow',
  // some other registry tool, or not an algebra question at all
  OTHER_REGISTRY_TOOL: 'otherRegistryTool',
  NOT_ALGEBRA: 'notAlgebra',
});

const ROUTE_ENGINE = Object.freeze({
  [ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA]: ALGEBRA_ENGINES.STEP_ALGEBRA_CORE,
  [ALGEBRA_WORKSPACE_ROUTES.RELATION]: ALGEBRA_ENGINES.MULTI_RELATION,
  [ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS]: ALGEBRA_ENGINES.STEP_ALGEBRA_CORE,
  [ALGEBRA_WORKSPACE_ROUTES.LITERAL_WORKSPACE]: ALGEBRA_ENGINES.STEP_ALGEBRA_CORE,
  [ALGEBRA_WORKSPACE_ROUTES.LITERAL_ANSWER]: ALGEBRA_ENGINES.LITERAL_ANSWER_BOX,
  [ALGEBRA_WORKSPACE_ROUTES.REWRITE_LINEAR_FORM]: ALGEBRA_ENGINES.STEP_ALGEBRA_CORE,
  [ALGEBRA_WORKSPACE_ROUTES.LEGACY_LINEAR_INTERCEPTS]: ALGEBRA_ENGINES.LEGACY_INTERCEPT_SOLVER,
  [ALGEBRA_WORKSPACE_ROUTES.LEGACY_NUMERIC]: ALGEBRA_ENGINES.LEGACY_NUMERIC_SOLVER,
  [ALGEBRA_WORKSPACE_ROUTES.SYSTEMS_WORKSPACE]: ALGEBRA_ENGINES.SYSTEMS_WORKSPACE,
});

/*
 * WHAT EACH ENGINE CAN ACTUALLY DO FOR A STUDENT.
 *
 * Read by the capability manifest: a capability is only "reachable" when the
 * route a real question takes lands on an engine that lists it. Each entry is
 * backed by a source-anchored contract and a behavioural test in
 * tests/platform/interactiveCapabilityCertification.test.mjs — adding a name
 * here without the engine doing the work fails that suite.
 */
export const ALGEBRA_ENGINE_CAPABILITIES = Object.freeze({
  [ALGEBRA_ENGINES.STEP_ALGEBRA_CORE]: Object.freeze([
    'balancedOperations',
    'distribution',
    'combineLikeTerms',
    'factoring',
    'fractionSplit',
    'fractionReduction',
    'arrangeTerms',
    'exactFractions',
    'describedWorkSteps',
    'undo',
    'slopeInterceptConversion',
    'factoredLinearForm',
    'literalSolve',
    'draftPersistence',
  ]),
  [ALGEBRA_ENGINES.MULTI_RELATION]: Object.freeze([
    'balancedOperations',
    'distribution',
    'combineLikeTerms',
    'inequalitySignReversal',
    'compoundInequality',
    'absoluteValueBranching',
    'squareRootRelation',
    'specialSolutionClaims',
    'numberLineRepresentation',
    'classroomRelationHistory',
    'undo',
    'draftPersistence',
  ]),
  [ALGEBRA_ENGINES.SYSTEMS_WORKSPACE]: Object.freeze([
    'substitution',
    'elimination',
    'threeVariableSubstitution',
    'exactFractions',
    'undo',
    'draftPersistence',
  ]),
  // Kept only so stored assignments authored before the consolidation still
  // open. Neither preserves exact fractions or offers the structure tools.
  [ALGEBRA_ENGINES.LEGACY_NUMERIC_SOLVER]: Object.freeze(['balancedOperations', 'undo', 'draftPersistence']),
  [ALGEBRA_ENGINES.LEGACY_INTERCEPT_SOLVER]: Object.freeze(['interceptZeroSubstitution', 'undo', 'draftPersistence']),
  [ALGEBRA_ENGINES.LITERAL_ANSWER_BOX]: Object.freeze([]),
});

// The orchestrator adds its own conceptual stage on top of the mature engine.
const ROUTE_EXTRA_CAPABILITIES = Object.freeze({
  [ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS]: Object.freeze(['interceptZeroSubstitution', 'orderedPairAnswer']),
});

/**
 * Whether StepByStepAlgebra must hand this question to the relation workspace.
 * The single predicate for that handoff: QuestionEngine's `stepAlgebra` case
 * and StepByStepAlgebra's own conservative second check both come here, so an
 * inequality authored only in the prompt reaches the same engine either way.
 */
export const usesRelationWorkspace = (question = {}) => (
  needsMultiRelationWorkspace(withPromptRelationSource(isObject(question) ? question : {}))
);

const registryToolIdFor = (question = {}) => {
  const byToolId = clean(question.toolId);
  if (byToolId && Object.prototype.hasOwnProperty.call(TOOL_CATALOG, byToolId)) return byToolId;
  const byType = clean(question.type);
  if (byType && Object.prototype.hasOwnProperty.call(TOOL_CATALOG, byType)) return byType;
  return null;
};

const routeResult = (route, reason, extra = {}) => {
  const engine = ROUTE_ENGINE[route] || null;
  const capabilities = [
    ...(engine ? ALGEBRA_ENGINE_CAPABILITIES[engine] || [] : []),
    ...(ROUTE_EXTRA_CAPABILITIES[route] || []),
  ];
  return Object.freeze({
    route,
    engine,
    capabilities: Object.freeze([...new Set(capabilities)]),
    legacy: engine === ALGEBRA_ENGINES.LEGACY_NUMERIC_SOLVER || engine === ALGEBRA_ENGINES.LEGACY_INTERCEPT_SOLVER,
    reason,
    ...extra,
  });
};

/**
 * Resolve the workspace for a question exactly as QuestionEngine renders it.
 *
 * Precedence mirrors QuestionEngine: a composed workflow first, then a
 * registry tool (by toolId, then type), then the built-in type switch.
 * Pass the question QuestionEngine renders — i.e. after
 * `prepareQuestionForRuntimeRouting` — to get the route a student sees.
 */
export const resolveAlgebraWorkspaceRoute = (question = {}) => {
  const source = isObject(question) ? question : {};

  if (readComposedQuestion(source).composed) {
    return routeResult(ALGEBRA_WORKSPACE_ROUTES.WORKFLOW, 'The question is a composed workflow; WorkflowRunner owns its stages.');
  }

  const registryToolId = registryToolIdFor(source);
  if (registryToolId === 'stepAlgebra2') {
    const mode = lower(source.mode);
    if (mode === 'rewritelinearform') {
      return routeResult(ALGEBRA_WORKSPACE_ROUTES.REWRITE_LINEAR_FORM, 'Registry stepAlgebra2 rewriteLinearForm hosts StepByStepAlgebraCore.', { registryToolId });
    }
    if (mode === 'linearintercepts') {
      return routeResult(ALGEBRA_WORKSPACE_ROUTES.LEGACY_LINEAR_INTERCEPTS, 'Registry stepAlgebra2 linearIntercepts was not migrated onto the orchestrator; the legacy intercept mini-solver opens.', { registryToolId });
    }
    return routeResult(ALGEBRA_WORKSPACE_ROUTES.LEGACY_NUMERIC, 'Registry stepAlgebra2 without a mode opens the legacy numeric ax + b = c solver.', { registryToolId });
  }
  if (registryToolId === 'systemsWorkspace') {
    return routeResult(ALGEBRA_WORKSPACE_ROUTES.SYSTEMS_WORKSPACE, 'Registry Systems Workspace.', { registryToolId });
  }
  if (registryToolId) {
    return routeResult(ALGEBRA_WORKSPACE_ROUTES.OTHER_REGISTRY_TOOL, `Registry tool ${registryToolId}.`, { registryToolId });
  }

  const type = clean(source.type);
  if (type === 'stepAlgebra' || type === 'algebra') {
    if (usesRelationWorkspace(source)) {
      return routeResult(ALGEBRA_WORKSPACE_ROUTES.RELATION, 'The relation contains an inequality, absolute value or square; the relation workspace opens.');
    }
    if (type === 'stepAlgebra' && source.mode === 'linearIntercepts') {
      return routeResult(ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS, 'Linear intercepts run through the orchestrator on the mature engine.');
    }
    return routeResult(ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA, 'The mature Step Algebra engine opens.');
  }
  if (type === 'literal') {
    return usesLiteralWorkspace(source)
      ? routeResult(ALGEBRA_WORKSPACE_ROUTES.LITERAL_WORKSPACE, 'The literal question asked for the balance workspace.')
      : routeResult(ALGEBRA_WORKSPACE_ROUTES.LITERAL_ANSWER, 'The literal question did not ask for the balance workspace; a typed answer opens.');
  }
  return routeResult(ALGEBRA_WORKSPACE_ROUTES.NOT_ALGEBRA, 'Not routed to an algebra workspace.');
};

/**
 * The runtime-compatibility view every QuestionEngine host renders.
 *
 * The student assignment player already applied this before QuestionEngine;
 * the other hosts (Teacher Question Review, library and Path previews, Live
 * Challenge, demo, ToolWrapper) handed QuestionEngine the literal stored record.
 * Applying it at QuestionEngine is idempotent for the player — a repaired
 * question is not repaired twice — and gives every other host the same route.
 *
 * Server-graded questions are left alone: the server owns that tool contract,
 * and a client-side type change would send it work shaped for another tool.
 */
export const prepareQuestionForRuntimeRouting = (question, { serverGraded = false } = {}) => {
  if (!isObject(question) || serverGraded) return question;
  const repaired = repairQuestionForCurrentRuntime(question, { source: 'questionEngine' });
  return isObject(repaired?.question) ? repaired.question : question;
};

export default resolveAlgebraWorkspaceRoute;
