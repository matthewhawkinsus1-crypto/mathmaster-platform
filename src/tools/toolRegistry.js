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
import { getToolCapabilities } from './toolCapabilities';

export const TOOL_REGISTRY = {
  dataModelingLab: { label: 'Data Modeling Lab', component: DataModelingLab, courses: ['Algebra I','Algebra II'] },
  inverseCompositionLab: { label: 'Inverse & Composition Lab', component: InverseCompositionLab, courses: ['Algebra II'] },
  systemsWorkspace: { label: 'Systems Workspace 2.0', component: SystemsWorkspace, courses: ['Algebra I','Algebra II'] },
  parabolaGeometryLab: { label: 'Parabola Geometry Lab', component: ParabolaGeometryLab, courses: ['Algebra II'] },
  polynomialWorkshop: { label: 'Polynomial Workshop', component: PolynomialWorkshop, courses: ['Algebra II'] },
  signSolutionAnalyzer: { label: 'Sign & Solution Analyzer', component: SignSolutionAnalyzer, courses: ['Algebra II'] },
  sequenceExplorer: { label: 'Sequence Explorer', component: SequenceExplorer, courses: ['Algebra I','Algebra II'] },
  complexPlaneLab: { label: 'Complex Plane Lab', component: ComplexPlaneLab, courses: ['Algebra II'] },
  exponentialLogBridge: { label: 'Exponential ↔ Log Bridge', component: ExponentialLogBridge, courses: ['Algebra II'] },
  transformationsLab: { label: 'Transformations Lab', component: TransformationsLab, courses: ['Algebra I','Algebra II'] },
  representationMatch: { label: 'Representation Match', component: RepresentationMatch, courses: ['Algebra I','Algebra II'] },
  functionInvestigation2: { label: 'Function Investigation 2.0', component: FunctionInvestigation2, courses: ['Algebra I','Algebra II'] },
  graphing2: { label: 'Graphing 2.0', component: Graphing2, courses: ['Algebra I'] },
  stepAlgebra2: { label: 'Step Algebra 2.0', component: StepAlgebra2, courses: ['Algebra I','Algebra II'] },
  solutionReview2: { label: 'Solution Review 2.0', component: SolutionReview2, courses: ['Shared'] },
};

export const getToolDefinition = (toolId) => {
  const definition = TOOL_REGISTRY[toolId];
  if (!definition) return null;
  return { toolId, ...definition, capabilities: getToolCapabilities(toolId) };
};

export const listTools = () => Object.keys(TOOL_REGISTRY).map(getToolDefinition);
