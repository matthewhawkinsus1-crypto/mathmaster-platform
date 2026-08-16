import { TOOL_CATALOG_IDS } from '../../tools/toolCatalog.js';

// Mobile is not a smaller desktop. Every interactive tool declares how its
// primary action survives when source and destination cannot share one screen.
// `dragWithTapFallback` means drag may remain on desktop, but tap/select-place
// is a required equal path on touch devices.
export const MOBILE_TOOL_PROFILES = Object.freeze({
  dataModelingLab: { interaction: 'form', overflow: 'stack', dragWithTapFallback: false },
  inverseCompositionLab: { interaction: 'form', overflow: 'stack', dragWithTapFallback: false },
  systemsWorkspace: { interaction: 'tap-canvas', overflow: 'stack', dragWithTapFallback: false },
  parabolaGeometryLab: { interaction: 'tap-canvas', overflow: 'stack', dragWithTapFallback: false },
  polynomialWorkshop: { interaction: 'form', overflow: 'stack', dragWithTapFallback: false },
  signSolutionAnalyzer: { interaction: 'tap-select', overflow: 'stack', dragWithTapFallback: false },
  sequenceExplorer: { interaction: 'form', overflow: 'stack', dragWithTapFallback: false },
  complexPlaneLab: { interaction: 'tap-canvas', overflow: 'stack', dragWithTapFallback: false },
  exponentialLogBridge: { interaction: 'form', overflow: 'stack', dragWithTapFallback: false },
  transformationsLab: { interaction: 'tap-select', overflow: 'stack', dragWithTapFallback: false },
  representationMatch: { interaction: 'tap-select', overflow: 'stack', dragWithTapFallback: false },
  functionInvestigation2: { interaction: 'graph-read-and-form', overflow: 'stack', dragWithTapFallback: false },
  graphing2: { interaction: 'tap-canvas', overflow: 'stack', dragWithTapFallback: false },
  stepAlgebra2: { interaction: 'form', overflow: 'stack', dragWithTapFallback: false },
  solutionReview2: { interaction: 'read', overflow: 'stack', dragWithTapFallback: false },
  intervalNumberLine: { interaction: 'tap-canvas', overflow: 'stack', dragWithTapFallback: false },
  relationMapping: { interaction: 'tap-connect', overflow: 'stack', dragWithTapFallback: false },
  openSortBoard: { interaction: 'tap-select-place', overflow: 'stack', dragWithTapFallback: false },
  constraintFunctionBuilder: { interaction: 'tap-canvas', overflow: 'stack', dragWithTapFallback: false },
});

export const MOBILE_WORKFLOW_SURFACES = Object.freeze({
  stepAlgebra: { interaction: 'tap-place', dragWithTapFallback: true },
  graphScenarioMatch: { interaction: 'tap-connect', dragWithTapFallback: true },
  graphAxisEditor: { interaction: 'tap-select-place', dragWithTapFallback: true },
  interactiveGraphWorkspace: { interaction: 'tap-canvas', dragWithTapFallback: true },
  openSortWorkflow: { interaction: 'tap-select-place', dragWithTapFallback: false },
});

export const getMobileToolProfile = (toolId) => MOBILE_TOOL_PROFILES[toolId] || null;

export const auditMobileToolProfiles = () => {
  const missing = TOOL_CATALOG_IDS.filter((toolId) => !MOBILE_TOOL_PROFILES[toolId]);
  const extras = Object.keys(MOBILE_TOOL_PROFILES).filter((toolId) => !TOOL_CATALOG_IDS.includes(toolId));
  const invalid = Object.entries(MOBILE_TOOL_PROFILES)
    .filter(([, profile]) => !profile?.interaction || !profile?.overflow)
    .map(([toolId]) => toolId);
  return { missing, extras, invalid, valid: missing.length === 0 && extras.length === 0 && invalid.length === 0 };
};
