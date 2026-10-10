// One worked-solution builder per registry tool that had none
// (toolSolutionReview.js covers sequenceExplorer, representationMatch,
// functionInvestigation2, relationMapping, openSortBoard and
// constraintFunctionBuilder itself). Each builder is pure: (question) → the
// text review model, or null when it cannot explain this question.
import * as dataModelingLabReview from './dataModelingLabReview.js';
import * as regressionCalculatorReview from './regressionCalculatorReview.js';
import * as inverseCompositionLabReview from './inverseCompositionLabReview.js';
import * as functionOperationsLabReview from './functionOperationsLabReview.js';
import * as systemsWorkspaceReview from './systemsWorkspaceReview.js';
import * as parabolaGeometryLabReview from './parabolaGeometryLabReview.js';
import * as polynomialWorkshopReview from './polynomialWorkshopReview.js';
import * as signSolutionAnalyzerReview from './signSolutionAnalyzerReview.js';
import * as complexPlaneLabReview from './complexPlaneLabReview.js';
import * as exponentialLogBridgeReview from './exponentialLogBridgeReview.js';
import * as transformationsLabReview from './transformationsLabReview.js';
import * as graphing2Review from './graphing2Review.js';
import * as stepAlgebra2Review from './stepAlgebra2Review.js';
import * as intervalNumberLineReview from './intervalNumberLineReview.js';
import * as linearTableWorkbenchReview from './linearTableWorkbenchReview.js';
import * as expressionMeaningReview from './expressionMeaningReview.js';
import * as representationBridgeReview from './representationBridgeReview.js';

const MODULES = [
  ['dataModelingLab', dataModelingLabReview],
  ['regressionCalculator', regressionCalculatorReview],
  ['inverseCompositionLab', inverseCompositionLabReview],
  ['functionOperationsLab', functionOperationsLabReview],
  ['systemsWorkspace', systemsWorkspaceReview],
  ['parabolaGeometryLab', parabolaGeometryLabReview],
  ['polynomialWorkshop', polynomialWorkshopReview],
  ['signSolutionAnalyzer', signSolutionAnalyzerReview],
  ['complexPlaneLab', complexPlaneLabReview],
  ['exponentialLogBridge', exponentialLogBridgeReview],
  ['transformationsLab', transformationsLabReview],
  ['graphing2', graphing2Review],
  ['stepAlgebra2', stepAlgebra2Review],
  ['intervalNumberLine', intervalNumberLineReview],
  ['linearTableWorkbench', linearTableWorkbenchReview],
  ['expressionMeaning', expressionMeaningReview],
  ['representationBridge', representationBridgeReview],
];

const builderOf = (module) => Object.values(module).find((value) => typeof value === 'function') || null;

export const TOOL_REVIEW_BUILDERS = Object.freeze(Object.fromEntries(MODULES
  .filter(([, module]) => module.implemented === true && builderOf(module))
  .map(([toolId, module]) => [toolId, builderOf(module)])));
