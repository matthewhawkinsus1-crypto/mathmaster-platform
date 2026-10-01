/*
 * THE GRADING MANIFEST: EVERY GRADE-BEARING SURFACE, AND WHO GRADES IT.
 *
 * One row per surface QuestionEngine can put in front of a student — every
 * ordinary question type, every registry tool (with every mode), and composed
 * workflows. Each row declares exactly one GRADING_AUTHORITY:
 *
 *   shared-server-authoritative   a pure shared grader marks raw work on the
 *                                 server; the browser runs the same grader
 *   specialized-server-subsystem  a dedicated server state machine owns it
 *   client-graded-...-blocker     still graded on the device, with the
 *                                 specific reason it cannot move yet
 *   non-graded-read-only          produces no academic result
 *
 * tests/platform/serverGradingCoverageGate.test.mjs fails when a tool appears
 * in TOOL_CATALOG, a case appears in QuestionEngine, or a type appears in the
 * question-type catalog without a row here — so a new tool cannot silently
 * inherit client-authoritative grading.
 *
 * LIGHT BY DESIGN. This file and everything it imports are declarations: no
 * grading mathematics, no mathjs. The student app's main bundle, Pre-Flight
 * and the checkpoint writer read it; the graders themselves load separately
 * (toolGraders.mjs on the server, lazily in the browser).
 *
 * Pure.
 */
import { GRADING_AUTHORITY } from './gradingAuthority.mjs';
import { usesLiteralWorkspace } from '../runtime/literalWorkspaceRoute.mjs';
import complexPlaneLab from './declarations/complexPlaneLab.mjs';
import constraintFunctionBuilder from './declarations/constraintFunctionBuilder.mjs';
import dataModelingLab from './declarations/dataModelingLab.mjs';
import exponentialLogBridge from './declarations/exponentialLogBridge.mjs';
import expressionMeaning from './declarations/expressionMeaning.mjs';
import functionInvestigation2 from './declarations/functionInvestigation2.mjs';
import functionOperationsLab from './declarations/functionOperationsLab.mjs';
import graphing2 from './declarations/graphing2.mjs';
import intervalNumberLine from './declarations/intervalNumberLine.mjs';
import inverseCompositionLab from './declarations/inverseCompositionLab.mjs';
import linearTableWorkbench from './declarations/linearTableWorkbench.mjs';
import openSortBoard from './declarations/openSortBoard.mjs';
import parabolaGeometryLab from './declarations/parabolaGeometryLab.mjs';
import polynomialWorkshop from './declarations/polynomialWorkshop.mjs';
import regressionCalculator from './declarations/regressionCalculator.mjs';
import relationMapping from './declarations/relationMapping.mjs';
import representationBridge from './declarations/representationBridge.mjs';
import representationMatch from './declarations/representationMatch.mjs';
import sequenceExplorer from './declarations/sequenceExplorer.mjs';
import signSolutionAnalyzer from './declarations/signSolutionAnalyzer.mjs';
import solutionReview2 from './declarations/solutionReview2.mjs';
import stepAlgebra2 from './declarations/stepAlgebra2.mjs';
import systemsWorkspace from './declarations/systemsWorkspace.mjs';
import transformationsLab from './declarations/transformationsLab.mjs';
import questionTypeDeclarations from './declarations/questionTypes.mjs';
import contextInterpretation from './declarations/contextInterpretation.mjs';
import graphComparison from './declarations/graphComparison.mjs';
import graphing from './declarations/graphing.mjs';
import graphScenarioMatch from './declarations/graphScenarioMatch.mjs';
import graphStory from './declarations/graphStory.mjs';
import graphWorkspace from './declarations/graphWorkspace.mjs';
import relationshipModel from './declarations/relationshipModel.mjs';

const text = (value) => String(value ?? '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The registry tools — must equal TOOL_CATALOG_IDS (src/tools/toolCatalog.js). */
export const TOOL_GRADING_DECLARATIONS = Object.freeze({
  dataModelingLab,
  regressionCalculator,
  inverseCompositionLab,
  functionOperationsLab,
  systemsWorkspace,
  parabolaGeometryLab,
  polynomialWorkshop,
  signSolutionAnalyzer,
  sequenceExplorer,
  complexPlaneLab,
  exponentialLogBridge,
  transformationsLab,
  representationMatch,
  functionInvestigation2,
  graphing2,
  stepAlgebra2,
  solutionReview2,
  intervalNumberLine,
  relationMapping,
  openSortBoard,
  constraintFunctionBuilder,
  linearTableWorkbench,
  expressionMeaning,
  representationBridge,
});

export const REGISTRY_TOOL_IDS = Object.freeze(Object.keys(TOOL_GRADING_DECLARATIONS));

/*
 * Question types QuestionEngine renders itself (not registry tools) whose
 * verdict comes from a shared grader over a STRUCTURED raw response — the same
 * contract as a registry tool, reported through `answerState.toolResponse`.
 * The three interactive-graph types share one workspace and one grader.
 */
export const STRUCTURED_TYPE_DECLARATIONS = Object.freeze({
  graphing,
  graphScenarioMatch,
  graphComparison,
  graphStory,
  contextInterpretation,
  relationshipModel,
  functionGraph: graphWorkspace,
  functionInvestigation: graphWorkspace,
  graphAnalysis: graphWorkspace,
});

/** The id of the composed-workflow surface. */
export const COMPOSED_WORKFLOW_SURFACE = 'composedWorkflow';

export const GRADING_MANIFEST = Object.freeze({
  ...questionTypeDeclarations,
  ...STRUCTURED_TYPE_DECLARATIONS,
  ...TOOL_GRADING_DECLARATIONS,
});

/*
 * A composed question is defined by its workflow, not its type
 * (src/platform/workflow/questionWorkflow.js readComposedQuestion): an
 * explicit `workflow` array, or a named `recipe` that expands into one.
 * QuestionEngine checks this BEFORE looking up a registry tool, and so does
 * the resolver below. A `recipe` that names nothing renders as an ordinary
 * question in the browser, but is treated as composed here — which can only
 * make the server decline to grade (fail closed), never grade the wrong thing.
 */
export const isComposedQuestionShape = (question = {}) => (
  (Array.isArray(question?.workflow) && question.workflow.length > 0)
  || Boolean(question?.recipe)
);

/**
 * The grading surface that owns a question, in QuestionEngine's own order:
 * composed workflow, then registry tool by `toolId`, then registry tool by
 * `type`, then the question type.
 */
export const resolveGradingSurfaceId = (question = {}) => {
  if (!isObject(question)) return null;
  if (isComposedQuestionShape(question)) return COMPOSED_WORKFLOW_SURFACE;
  const toolId = text(question.toolId).trim();
  if (toolId && TOOL_GRADING_DECLARATIONS[toolId]) return toolId;
  const type = text(question.type).trim();
  if (type && TOOL_GRADING_DECLARATIONS[type]) return type;
  // QuestionEngine opens a workspace literal on the balance workspace, whose
  // answer is a final equation — a different surface from the typed answer box.
  if (usesLiteralWorkspace(question)) return 'literalWorkspace';
  return type || null;
};

/** Every surface with its authority, for documentation and diagnostics. */
export const gradingCoverageSummary = () => Object.entries(GRADING_MANIFEST).map(([surfaceId, declaration]) => ({
  surfaceId,
  kind: declaration.kind,
  authority: declaration.authority,
  blocker: declaration.blocker || null,
  subsystem: declaration.subsystem || null,
  modes: declaration.kind === 'tool'
    ? Object.entries(declaration.modes).map(([mode, entry]) => ({ mode, authority: entry.authority, blocker: entry.blocker }))
    : [],
}));

export { GRADING_AUTHORITY };
