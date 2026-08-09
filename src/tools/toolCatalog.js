// Label and course metadata for every interactive tool, kept free of React
// imports so Node-side consumers — the authoring contract generator, the
// validator and the test suites — can read the catalogue without pulling in
// the component tree. `toolRegistry.js` attaches the components to these.
export const TOOL_CATALOG = Object.freeze({
  dataModelingLab: { label: 'Data Modeling Lab', courses: ['Algebra I', 'Algebra II'] },
  inverseCompositionLab: { label: 'Inverse & Composition Lab', courses: ['Algebra II'] },
  systemsWorkspace: { label: 'Systems Workspace', courses: ['Algebra I', 'Algebra II'] },
  parabolaGeometryLab: { label: 'Parabola Geometry Lab', courses: ['Algebra II'] },
  polynomialWorkshop: { label: 'Polynomial Workshop', courses: ['Algebra II'] },
  signSolutionAnalyzer: { label: 'Sign & Solution Analyzer', courses: ['Algebra II'] },
  sequenceExplorer: { label: 'Sequence Explorer', courses: ['Algebra I', 'Algebra II'] },
  complexPlaneLab: { label: 'Complex Plane Lab', courses: ['Algebra II'] },
  exponentialLogBridge: { label: 'Exponential ↔ Log Bridge', courses: ['Algebra II'] },
  transformationsLab: { label: 'Transformations Lab', courses: ['Algebra I', 'Algebra II'] },
  representationMatch: { label: 'Representation Match', courses: ['Algebra I', 'Algebra II'] },
  functionInvestigation2: { label: 'Function Investigation', courses: ['Algebra I', 'Algebra II'] },
  graphing2: { label: 'Graphing', courses: ['Algebra I'] },
  stepAlgebra2: { label: 'Solving Equations Step by Step', courses: ['Algebra I', 'Algebra II'] },
  solutionReview2: { label: 'Solution Review', courses: ['Shared'] },
  intervalNumberLine: { label: 'Number Line and Intervals', courses: ['Algebra I', 'Algebra II'] },
  relationMapping: { label: 'Mapping Diagram', courses: ['Algebra I'] },
});

export const TOOL_CATALOG_IDS = Object.freeze(Object.keys(TOOL_CATALOG));

export const getToolCatalogEntry = (toolId) => TOOL_CATALOG[toolId] || null;
