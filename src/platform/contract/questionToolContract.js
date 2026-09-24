/*
 * THE QUESTION ↔ TOOL CONTRACT — WILL THE TOOL A STUDENT GETS DO WHAT THE
 * QUESTION ASKS? (Job 4)
 *
 * Structural validation says a question is well-formed; this says it will
 * WORK. It resolves the route QuestionEngine takes (algebraWorkspaceRoute.js)
 * and checks the engine there provides what the question's intent needs:
 * factoring for a factored-form target, sign reversal for an inequality, the
 * zero-substitution stage for intercepts. It also catches records that only
 * work because a runtime repair rescues them — a factor-less sign chart, a
 * text equation in the legacy numeric solver — and offers the safe repair that
 * makes the stored record match what students see.
 *
 * Every finding carries both audiences:
 *   teacher   — one plain sentence and, where one exists, a one-click repair;
 *   developer — { questionId, rule, expected, actual, recommendedRepair }.
 *
 * A repair never changes the mathematics: it moves the SAME authored equation
 * or inequality to the engine that can host it. Anything that would need a
 * mathematical decision is reported, not repaired.
 */
import {
  ALGEBRA_WORKSPACE_ROUTES,
  prepareQuestionForRuntimeRouting,
  resolveAlgebraWorkspaceRoute,
} from '../algebra/algebraWorkspaceRoute.js';
import { repairQuestionForCurrentRuntime, RUNTIME_REPAIR_KEYS } from '../assignments/assignmentRuntimeRepair.js';
import { flattenV5Sections } from './assignmentSchemaV5.js';

const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const actionsOf = (question = {}) => (Array.isArray(question.studentActions) ? question.studentActions : [])
  .map((action) => lower(action));

const INEQUALITY = /(?:<=|>=|[<>≤≥]|\\leq?|\\geq?)/;
const relationText = (question = {}) => [question.inequality, question.inequalityText, question.equation, question.equationLatex]
  .find((value) => typeof value === 'string' && value.trim()) || '';

export const TOOL_CONTRACT_RULES = Object.freeze({
  SIGN_ANALYZER_WITHOUT_FACTORS: 'tool.signAnalyzerWithoutFactors',
  LEGACY_TEXT_EQUATION: 'tool.legacyNumericSolverTextEquation',
  LEGACY_NUMERIC_SOLVER: 'tool.legacyNumericSolver',
  LEGACY_INTERCEPT_SOLVER: 'tool.legacyInterceptSolver',
  CAPABILITY_MISSING: 'tool.capabilityMissing',
  DISPLAYED_GRAPH_MISSING: 'tool.displayedGraphMissing',
});

// What an authored intent needs from the engine it reaches.
const requiredCapabilities = (question = {}) => {
  const needs = [];
  const actions = actionsOf(question);
  const text = relationText(question);
  if (lower(question.targetForm) === 'factoredlinear') needs.push({ capability: 'factoring', because: 'it asks for factored form' });
  if (lower(question.targetForm) === 'slopeintercept' || lower(question.mode) === 'rewritelinearform') {
    needs.push({ capability: 'slopeInterceptConversion', because: 'it asks for slope-intercept form' });
  }
  if (lower(question.mode) === 'linearintercepts') needs.push({ capability: 'interceptZeroSubstitution', because: 'it asks for the intercepts' });
  if ((actions.includes('solveinequality') || actions.includes('solvestepbystep')) && INEQUALITY.test(text)) {
    needs.push({ capability: 'inequalitySignReversal', because: 'it asks the student to solve an inequality' });
  }
  if (/\|[^|]+\|/.test(text) && ['stepalgebra', 'algebra'].includes(lower(question.type))) {
    needs.push({ capability: 'absoluteValueBranching', because: 'it contains an absolute value' });
  }
  return needs;
};

// A reference to a graph the student is supposed to be LOOKING AT — not an
// instruction to build one ("construct the graph", "graph the solution").
const DISPLAYED_GRAPH = /\b(?:graph\s+(?:below|above|shown)|(?:the|this)\s+graph\s+(?:below|above|shown)|(?:shown|given|pictured)\s+(?:in|on)\s+the\s+graph|use\s+the\s+(?:given\s+)?graph|from\s+the\s+graph|the\s+graph\s+shows|the\s+following\s+graph)\b/i;
// Only these renderers show nothing graphical unless graph data is attached;
// every graphing tool, lab and composed workflow draws its own.
const NON_GRAPHING_TYPES = new Set(['stepalgebra', 'algebra', 'literal', 'stepalgebra2', 'multiplechoice', 'multianswer', 'fraction', 'orderedpair', 'table', 'system']);
const GRAPH_DATA_KEYS = /"(?:graph|graphSpec|functionSpec|function|points|previewOnGraph|candidateGraphs|lineIntent|visual)"\s*:/;
const hasGraphData = (question = {}) => GRAPH_DATA_KEYS.test(JSON.stringify(question));

const finding = ({ question, index, rule, severity, teacher, expected, actual, repair = null }) => ({
  questionId: clean(question?.questionId) || null,
  questionIndex: index,
  questionNumber: index + 1,
  rule,
  severity,
  // The preflight pipeline maps a message to its question by "Question N".
  message: `Question ${index + 1}: ${teacher}`,
  teacherMessage: teacher,
  expected,
  actual,
  recommendedRepair: repair,
});

/**
 * Findings for one question. `stored` is the literal record as saved; the
 * runtime view is derived here the same way QuestionEngine derives it.
 */
export const auditQuestionToolContract = (stored = {}, index = 0) => {
  if (!isObject(stored) || stored.teacherExcluded === true) return [];
  const findings = [];
  const runtime = prepareQuestionForRuntimeRouting(stored);
  const route = resolveAlgebraWorkspaceRoute(runtime);
  const storedRoute = resolveAlgebraWorkspaceRoute(stored);
  const runtimeRepair = repairQuestionForCurrentRuntime(stored);

  if (runtimeRepair.repairKeys.includes(RUNTIME_REPAIR_KEYS.SIGN_ANALYZER_WITHOUT_FACTORS)) {
    findings.push(finding({
      question: stored, index, rule: TOOL_CONTRACT_RULES.SIGN_ANALYZER_WITHOUT_FACTORS, severity: 'warning',
      teacher: `the sign chart has no factors, so it would have shown a different inequality. Students now solve ${runtime.equation} on the Step Algebra inequality workspace; save the repair so the assignment matches.`,
      expected: 'signSolutionAnalyzer with factors, or stepAlgebra with the inequality',
      actual: 'signSolutionAnalyzer with no factors',
      repair: { kind: 'replaceQuestion', safe: true, description: 'Move this inequality to the Step Algebra inequality workspace.', question: runtimeRepair.question },
    }));
  } else if (lower(stored.type) === 'signsolutionanalyzer' && !['factors', 'numeratorFactors', 'denominatorFactors', 'radicalEquation', 'signChart', 'candidates'].some((field) => stored[field] != null)) {
    findings.push(finding({
      question: stored, index, rule: TOOL_CONTRACT_RULES.SIGN_ANALYZER_WITHOUT_FACTORS, severity: 'blocking',
      teacher: 'the sign chart has no factors and no inequality MathMaster can read, so students would see a sample problem instead of this one. Add the factors, or the inequality to solve.',
      expected: 'factors / numeratorFactors, or an inequality',
      actual: 'neither',
    }));
  }

  if (runtimeRepair.repairKeys.includes(RUNTIME_REPAIR_KEYS.STEP_ALGEBRA_2_TEXT_EQUATION)) {
    findings.push(finding({
      question: stored, index, rule: TOOL_CONTRACT_RULES.LEGACY_TEXT_EQUATION, severity: 'warning',
      teacher: 'this equation was saved for the older numeric solver, which cannot read it. Students now solve it on Step Algebra; save the repair so the assignment matches.',
      expected: 'stepAlgebra with equation text',
      actual: 'stepAlgebra2 (numeric solver) with equation text',
      repair: { kind: 'replaceQuestion', safe: true, description: 'Open this equation on the Step Algebra workspace.', question: runtimeRepair.question },
    }));
  } else if (route.route === ALGEBRA_WORKSPACE_ROUTES.LEGACY_NUMERIC && isObject(stored.equation)) {
    const { a, b, c } = stored.equation;
    const text = [a, b, c].every((value) => Number.isFinite(Number(value)))
      ? `${Number(a)}x ${Number(b) < 0 ? '-' : '+'} ${Math.abs(Number(b))} = ${Number(c)}`
      : null;
    findings.push(finding({
      question: stored, index, rule: TOOL_CONTRACT_RULES.LEGACY_NUMERIC_SOLVER, severity: 'warning',
      teacher: 'this uses the older numeric equation solver, which has no distribution, factoring or like-term tools. Moving it to Step Algebra gives students the full workspace (a student\'s unfinished work on this question would restart).',
      expected: 'stepAlgebra',
      actual: 'stepAlgebra2 numeric solver',
      repair: text ? {
        kind: 'replaceQuestion',
        safe: false,
        description: `Open ${text} on the Step Algebra workspace.`,
        question: { ...stored, type: 'stepAlgebra', equation: text, solveFor: 'x', toolId: undefined },
      } : null,
    }));
  }

  if (storedRoute.route === ALGEBRA_WORKSPACE_ROUTES.LEGACY_LINEAR_INTERCEPTS && route.route === ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS) {
    findings.push(finding({
      question: stored, index, rule: TOOL_CONTRACT_RULES.LEGACY_INTERCEPT_SOLVER, severity: 'warning',
      teacher: 'this intercept question was saved for the older intercept tool. Students already get the current Step Algebra intercept workspace; save the repair so the assignment matches.',
      expected: 'stepAlgebra, mode linearIntercepts',
      actual: 'stepAlgebra2, mode linearIntercepts',
      repair: { kind: 'replaceQuestion', safe: true, description: 'Save this question for the current intercept workspace.', question: runtimeRepair.question },
    }));
  }

  requiredCapabilities(runtime).forEach(({ capability, because }) => {
    // Only an interactive algebra workspace can fail to support an intent. A
    // typed-answer box is a deliberate choice (the student writes 15(x − 3));
    // other tools and composed workflows own their own contracts.
    if ([
      ALGEBRA_WORKSPACE_ROUTES.NOT_ALGEBRA,
      ALGEBRA_WORKSPACE_ROUTES.WORKFLOW,
      ALGEBRA_WORKSPACE_ROUTES.OTHER_REGISTRY_TOOL,
      ALGEBRA_WORKSPACE_ROUTES.LITERAL_ANSWER,
    ].includes(route.route)) return;
    if (route.capabilities.includes(capability)) return;
    findings.push(finding({
      question: stored, index, rule: TOOL_CONTRACT_RULES.CAPABILITY_MISSING, severity: 'blocking',
      teacher: `${because}, but the tool it opens (${route.engine || route.route}) cannot do that. Choose a question type whose workspace can.`,
      expected: capability,
      actual: `${route.route} → ${route.engine}: ${route.capabilities.join(', ') || 'no interactive capabilities'}`,
    }));
  });

  if (
    NON_GRAPHING_TYPES.has(lower(runtime.type))
    && !(Array.isArray(runtime.workflow) && runtime.workflow.length)
    && DISPLAYED_GRAPH.test(clean(runtime.prompt))
    && !hasGraphData(runtime)
  ) {
    findings.push(finding({
      question: stored, index, rule: TOOL_CONTRACT_RULES.DISPLAYED_GRAPH_MISSING, severity: 'warning',
      teacher: 'the prompt refers to a graph, but no graph is attached, so students would be asked about a graph they cannot see.',
      expected: 'graph, graphSpec, functionSpec or points',
      actual: 'none',
    }));
  }

  return findings;
};

/** Every finding for an Assignment V5 record, in flat question order. */
export const auditAssignmentToolContracts = (assignmentV5 = {}) => {
  const questions = flattenV5Sections(isObject(assignmentV5) ? assignmentV5 : {});
  const findings = questions.flatMap((question, index) => auditQuestionToolContract(question, index));
  return {
    findings,
    errors: findings.filter((entry) => entry.severity === 'blocking').map((entry) => entry.message),
    warnings: findings.filter((entry) => entry.severity === 'warning').map((entry) => entry.message),
    safeRepairs: findings.filter((entry) => entry.recommendedRepair?.safe === true),
  };
};

/**
 * Apply only the repairs certified safe: same authored mathematics, the engine
 * students already see at runtime. Returns the repaired record and what changed.
 */
export const applySafeToolContractRepairs = (assignmentV5 = {}) => {
  const { safeRepairs } = auditAssignmentToolContracts(assignmentV5);
  if (!safeRepairs.length) return { assignmentV5, applied: [] };
  const byIndex = new Map(safeRepairs.map((entry) => [entry.questionIndex, entry]));
  let cursor = 0;
  const sections = (assignmentV5.sections || []).map((section) => ({
    ...section,
    questions: (section?.questions || []).map((question) => {
      const repair = byIndex.get(cursor);
      cursor += 1;
      if (!repair) return question;
      const replacement = { ...repair.recommendedRepair.question };
      Object.keys(replacement).forEach((key) => replacement[key] === undefined && delete replacement[key]);
      return { ...replacement, questionId: question?.questionId ?? replacement.questionId };
    }),
  }));
  return {
    assignmentV5: { ...assignmentV5, sections },
    applied: safeRepairs.map((entry) => ({ questionId: entry.questionId, questionNumber: entry.questionNumber, rule: entry.rule, description: entry.recommendedRepair.description })),
  };
};

export default auditAssignmentToolContracts;
