import React, { lazy } from 'react';
import { getToolCapabilities } from './toolCapabilities';
import { getToolStatePersistence } from './toolStatePersistence';
import { TOOL_CATALOG } from './toolCatalog';
import { getMobileToolProfile } from '../platform/mobile/mobileToolProfiles.js';
import RegisteredToolWorkView from './shared/RegisteredToolWorkView.jsx';
import { STAGE_3D_WORK_VIEW_IDS } from './workViewInventory.js';

const REGISTRY_WORK_VIEW_IDS = new Set([...STAGE_3D_WORK_VIEW_IDS, 'dataModelingLab', 'regressionCalculator']);

// Labels and course lists live in the React-free toolCatalog so Node-side
// consumers can read them; this map only attaches the components.
const TOOL_LOADERS = {
  dataModelingLab: () => import('./dataModeling/DataModelingLab.jsx'),
  regressionCalculator: () => import('./regressionCalculator/RegressionCalculator.jsx'),
  inverseCompositionLab: () => import('./inverseComposition/InverseCompositionLabRouter.jsx'),
  functionOperationsLab: () => import('./functionOperations/FunctionOperationsLab.jsx'),
  systemsWorkspace: () => import('./systemsWorkspace/SystemsWorkspace.jsx'),
  parabolaGeometryLab: () => import('./parabolaGeometry/ParabolaGeometryLab.jsx'),
  polynomialWorkshop: () => import('./polynomialWorkshop/PolynomialWorkshop.jsx'),
  signSolutionAnalyzer: () => import('./signSolutionAnalyzer/SignSolutionAnalyzer.jsx'),
  sequenceExplorer: () => import('./sequenceExplorer/SequenceExplorer.jsx'),
  complexPlaneLab: () => import('./complexPlane/ComplexPlaneLab.jsx'),
  exponentialLogBridge: () => import('./exponentialLog/ExponentialLogBridge.jsx'),
  transformationsLab: () => import('./transformations/TransformationsLab.jsx'),
  representationMatch: () => import('./representationMatch/RepresentationMatch.jsx'),
  functionInvestigation2: () => import('./functionInvestigation2/FunctionInvestigation2.jsx'),
  graphing2: () => import('./graphing2/Graphing2.jsx'),
  stepAlgebra2: () => import('./stepAlgebra2/StepAlgebra2.jsx'),
  solutionReview2: () => import('./solutionReview2/SolutionReview2.jsx'),
  intervalNumberLine: () => import('./intervalNumberLine/IntervalNumberLine.jsx'),
  relationMapping: () => import('./relationMapping/RelationMapping.jsx'),
  openSortBoard: () => import('./openSortBoard/OpenSortBoard.jsx'),
  constraintFunctionBuilder: () => import('./constraintFunctionBuilder/ConstraintFunctionBuilder.jsx'),
  linearTableWorkbench: () => import('./linearTableWorkbench/LinearTableWorkbench.jsx'),
  expressionMeaning: () => import('./expressionMeaning/ExpressionMeaning.jsx'),
};

const TOOL_COMPONENTS = Object.fromEntries(
  Object.entries(TOOL_LOADERS).map(([toolId, loader]) => [toolId, lazy(loader)]),
);

export const prefetchTool = (toolId) => TOOL_LOADERS[toolId]?.() || Promise.resolve(null);

export const TOOL_REGISTRY = Object.fromEntries(
  Object.entries(TOOL_COMPONENTS).map(([toolId, component]) => [
    toolId,
    {
      ...TOOL_CATALOG[toolId],
      component: REGISTRY_WORK_VIEW_IDS.has(toolId) && !['intervalNumberLine', 'relationMapping'].includes(toolId)
        ? function Stage3DRegisteredTool(props) {
          return React.createElement(
            RegisteredToolWorkView,
            { toolId, questionData: props.questionData },
            React.createElement(component, props),
          );
        }
        : component,
    },
  ]),
);

export const getToolDefinition = (toolId) => {
  const definition = TOOL_REGISTRY[toolId];
  if (!definition) return null;
  const persistence = getToolStatePersistence(toolId);
  return {
    toolId,
    ...definition,
    capabilities: getToolCapabilities(toolId),
    mobileInteraction: getMobileToolProfile(toolId),
    // WHETHER A STUDENT'S UNFINISHED WORK IN THIS TOOL SURVIVES NAVIGATION.
    // Declared per tool in toolStatePersistence.js and enforced against the
    // tool's own source by tests/platform/toolDraftPersistenceContract.
    studentStatePersistence: persistence?.studentStatePersistence || null,
  };
};

export const toolUsesRegistryWorkView = (toolId) => REGISTRY_WORK_VIEW_IDS.has(toolId);

export const listTools = () => Object.keys(TOOL_REGISTRY).map(getToolDefinition);
