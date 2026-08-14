import DataModelingLab from './dataModeling/DataModelingLab';
import InverseCompositionLab from './inverseComposition/InverseCompositionLab';
import SystemsWorkspace from './systemsWorkspace/SystemsWorkspace';
import ParabolaGeometryLab from './parabolaGeometry/ParabolaGeometryLab';
import PolynomialWorkshop from './polynomialWorkshop/PolynomialWorkshop';
import SignSolutionAnalyzer from './signSolutionAnalyzer/SignSolutionAnalyzer';
import SequenceExplorer from './sequenceExplorer/SequenceExplorer';
import ComplexPlaneLab from './complexPlane/ComplexPlaneLab';
import ExponentialLogBridge from './exponentialLog/ExponentialLogBridge';
import TransformationsLab from './transformations/TransformationsLab';
import RepresentationMatch from './representationMatch/RepresentationMatch';
import FunctionInvestigation2 from './functionInvestigation2/FunctionInvestigation2';
import Graphing2 from './graphing2/Graphing2';
import StepAlgebra2 from './stepAlgebra2/StepAlgebra2';
import SolutionReview2 from './solutionReview2/SolutionReview2';
import IntervalNumberLine from './intervalNumberLine/IntervalNumberLine';
import RelationMapping from './relationMapping/RelationMapping';
import OpenSortBoard from './openSortBoard/OpenSortBoard';
import ConstraintFunctionBuilder from './constraintFunctionBuilder/ConstraintFunctionBuilder';
import { getToolCapabilities } from './toolCapabilities';
import { TOOL_CATALOG } from './toolCatalog';

// Labels and course lists live in the React-free toolCatalog so Node-side
// consumers can read them; this map only attaches the components.
const TOOL_COMPONENTS = {
  dataModelingLab: DataModelingLab,
  inverseCompositionLab: InverseCompositionLab,
  systemsWorkspace: SystemsWorkspace,
  parabolaGeometryLab: ParabolaGeometryLab,
  polynomialWorkshop: PolynomialWorkshop,
  signSolutionAnalyzer: SignSolutionAnalyzer,
  sequenceExplorer: SequenceExplorer,
  complexPlaneLab: ComplexPlaneLab,
  exponentialLogBridge: ExponentialLogBridge,
  transformationsLab: TransformationsLab,
  representationMatch: RepresentationMatch,
  functionInvestigation2: FunctionInvestigation2,
  graphing2: Graphing2,
  stepAlgebra2: StepAlgebra2,
  solutionReview2: SolutionReview2,
  intervalNumberLine: IntervalNumberLine,
  relationMapping: RelationMapping,
  openSortBoard: OpenSortBoard,
  constraintFunctionBuilder: ConstraintFunctionBuilder,
};

export const TOOL_REGISTRY = Object.fromEntries(
  Object.entries(TOOL_COMPONENTS).map(([toolId, component]) => [
    toolId,
    { ...TOOL_CATALOG[toolId], component },
  ]),
);

export const getToolDefinition = (toolId) => {
  const definition = TOOL_REGISTRY[toolId];
  if (!definition) return null;
  return { toolId, ...definition, capabilities: getToolCapabilities(toolId) };
};

export const listTools = () => Object.keys(TOOL_REGISTRY).map(getToolDefinition);
