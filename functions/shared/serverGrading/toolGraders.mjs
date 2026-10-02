/*
 * EVERY REGISTRY TOOL'S SHARED GRADER, LOADED TOGETHER.
 *
 * The heavy half of the registry: this file imports every tool grader and,
 * through them, the tools' mathematics (including mathjs). The server imports
 * it statically. The browser does NOT put it in the main bundle — a tool chunk
 * imports only its own grader, and QuestionEngine loads this lazily at the
 * moment a student submits (see src/platform/grading/sharedToolGrading.js).
 *
 * tests/platform/serverGradingCoverageGate.test.mjs asserts this map and the
 * manifest name the same tools.
 */
import complexPlaneLab from './tools/complexPlaneLab.mjs';
import constraintFunctionBuilder from './tools/constraintFunctionBuilder.mjs';
import dataModelingLab from './tools/dataModelingLab.mjs';
import exponentialLogBridge from './tools/exponentialLogBridge.mjs';
import expressionMeaning from './tools/expressionMeaning.mjs';
import functionInvestigation2 from './tools/functionInvestigation2.mjs';
import functionOperationsLab from './tools/functionOperationsLab.mjs';
import graphing2 from './tools/graphing2.mjs';
import intervalNumberLine from './tools/intervalNumberLine.mjs';
import inverseCompositionLab from './tools/inverseCompositionLab.mjs';
import linearTableWorkbench from './tools/linearTableWorkbench.mjs';
import openSortBoard from './tools/openSortBoard.mjs';
import parabolaGeometryLab from './tools/parabolaGeometryLab.mjs';
import polynomialWorkshop from './tools/polynomialWorkshop.mjs';
import regressionCalculator from './tools/regressionCalculator.mjs';
import relationMapping from './tools/relationMapping.mjs';
import representationBridge from './tools/representationBridge.mjs';
import representationMatch from './tools/representationMatch.mjs';
import sequenceExplorer from './tools/sequenceExplorer.mjs';
import signSolutionAnalyzer from './tools/signSolutionAnalyzer.mjs';
import solutionReview2 from './tools/solutionReview2.mjs';
import stepAlgebra2 from './tools/stepAlgebra2.mjs';
import systemsWorkspace from './tools/systemsWorkspace.mjs';
import transformationsLab from './tools/transformationsLab.mjs';

import contextInterpretation from './tools/contextInterpretation.mjs';
import graphComparison from './tools/graphComparison.mjs';
import graphing from './tools/graphing.mjs';
import graphScenarioMatch from './tools/graphScenarioMatch.mjs';
import graphStory from './tools/graphStory.mjs';
import graphWorkspace from './tools/graphWorkspace.mjs';
import relationshipModel from './tools/relationshipModel.mjs';

/** Structured question types — keyed by the surface id they grade. */
export const STRUCTURED_TYPE_GRADERS = Object.freeze({
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

/** Registry tools — keyed by tool id. */
export const REGISTRY_TOOL_GRADERS = Object.freeze({
  complexPlaneLab,
  constraintFunctionBuilder,
  dataModelingLab,
  exponentialLogBridge,
  expressionMeaning,
  functionInvestigation2,
  functionOperationsLab,
  graphing2,
  intervalNumberLine,
  inverseCompositionLab,
  linearTableWorkbench,
  openSortBoard,
  parabolaGeometryLab,
  polynomialWorkshop,
  regressionCalculator,
  relationMapping,
  representationBridge,
  representationMatch,
  sequenceExplorer,
  signSolutionAnalyzer,
  solutionReview2,
  stepAlgebra2,
  systemsWorkspace,
  transformationsLab,
});

/** Every structured-response grader, keyed by grading surface id. */
export const TOOL_GRADERS = Object.freeze({
  ...STRUCTURED_TYPE_GRADERS,
  ...REGISTRY_TOOL_GRADERS,
});
