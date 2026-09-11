// Machine-readable completeness boundary for every student tool in TOOL_CATALOG.
// Adding a registry entry requires an explicit decision here; exemptions need a
// student-facing reason rather than silently falling outside Work View.
export const WORK_VIEW_INVENTORY = Object.freeze({
  dataModelingLab: { status: 'migrated', stage: '1-2', capabilities: ['numericControls', 'equationInput', 'tableData', 'task', 'help', 'primaryActions'] },
  systemsWorkspace: { status: 'migrated', stage: '3B', capabilities: ['undo', 'pointEditing', 'numericControls', 'equationInput', 'instruction', 'task', 'help', 'primaryActions'] },
  sequenceExplorer: { status: 'migrated', stage: '3B', capabilities: ['undo', 'fitView', 'panZoom', 'pointEditing', 'numericControls', 'equationInput', 'tableData', 'instruction', 'task', 'help', 'primaryActions'] },
  transformationsLab: { status: 'migrated', stage: '3A', capabilities: ['undo', 'fitView', 'panZoom', 'pointEditing', 'numericControls', 'instruction', 'task', 'help', 'primaryActions', 'secondaryActions'] },
  functionInvestigation2: { status: 'migrated', stage: '3A', capabilities: ['undo', 'numericControls', 'equationInput', 'instruction', 'task', 'help', 'primaryActions'] },
  graphing2: { status: 'migrated', stage: '3A', capabilities: ['undo', 'fitView', 'panZoom', 'pointEditing', 'instruction', 'task', 'help', 'primaryActions', 'secondaryActions'] },
  constraintFunctionBuilder: { status: 'migrated', stage: '3A', capabilities: ['undo', 'numericControls', 'equationInput', 'instruction', 'task', 'help', 'primaryActions'] },
  stepAlgebra2: { status: 'migrated', stage: '3C', capabilities: ['undo', 'numericControls', 'equationInput', 'instruction', 'task', 'help', 'primaryActions'] },
  inverseCompositionLab: { status: 'migrated', stage: '3D', capabilities: ['numericControls', 'equationInput', 'instruction', 'task', 'help'] },
  functionOperationsLab: { status: 'migrated', stage: '3D', capabilities: ['numericControls', 'equationInput', 'tableData', 'instruction', 'task', 'help'] },
  parabolaGeometryLab: { status: 'migrated', stage: '3D', capabilities: ['numericControls', 'equationInput', 'instruction', 'task', 'help'] },
  polynomialWorkshop: { status: 'migrated', stage: '3D', capabilities: ['numericControls', 'equationInput', 'instruction', 'task', 'help'] },
  signSolutionAnalyzer: { status: 'migrated', stage: '3D', capabilities: ['pointEditing', 'instruction', 'task', 'help'] },
  complexPlaneLab: { status: 'migrated', stage: '3D', capabilities: ['numericControls', 'equationInput', 'instruction', 'task', 'help'] },
  exponentialLogBridge: { status: 'migrated', stage: '3D', capabilities: ['numericControls', 'equationInput', 'tableData', 'instruction', 'task', 'help'] },
  representationMatch: { status: 'migrated', stage: '3D', capabilities: ['numericControls', 'tableData', 'instruction', 'task', 'help'] },
  intervalNumberLine: { status: 'migrated', stage: '3D', capabilities: ['undo', 'pointEditing', 'numericControls', 'equationInput', 'instruction', 'task', 'help', 'primaryActions', 'secondaryActions'] },
  relationMapping: { status: 'migrated', stage: '3D', capabilities: ['undo', 'pointEditing', 'numericControls', 'tableData', 'instruction', 'task', 'help', 'primaryActions', 'secondaryActions'] },
  openSortBoard: { status: 'migrated', stage: '3D', capabilities: ['pointEditing', 'instruction', 'task', 'help'] },
  solutionReview2: { status: 'exempt', stage: '3D', capabilities: [], reason: 'Read-only post-submission review; it has no editable mathematical workspace to enlarge or undo.' },
});

export const STAGE_3D_WORK_VIEW_IDS = Object.freeze(Object.entries(WORK_VIEW_INVENTORY)
  .filter(([, entry]) => entry.stage === '3D' && entry.status === 'migrated')
  .map(([id]) => id));
