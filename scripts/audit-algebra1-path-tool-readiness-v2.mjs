#!/usr/bin/env node
// Algebra I TEKS Fidelity V2 — Path Tool Adapter readiness.
//
// Read-only. This audit names the remaining REBUILD standards that are blocked
// by the secure Path tool contract rather than by missing student-facing tools.
// It also proves the current contract still FAILS CLOSED: a rich assignment
// tool is not Path-eligible until a server-authoritative contract exists.

import {
  PATH_TOOL_IDS,
  getPathToolContract,
  isPathEligible,
} from '../functions/shared/pathToolContracts.mjs';

const blockers = [
  {
    standards: ['A.3D', 'A.3H'],
    adapter: 'systemsWorkspace:inequalities',
    existingTool: 'src/tools/systemsWorkspace/SystemsWorkspace.jsx',
    requirement: 'Add a secure inequalities-mode Path contract with public allowlist, private grading definition, response validation, and server recomputation of feasibility.',
  },
  {
    standards: ['A.4A', 'A.4C', 'A.8B', 'A.9E'],
    adapter: 'dataModeling',
    existingTool: 'src/tools/dataModeling/DataModelingLab.jsx',
    requirement: 'Add a secure dataModeling Path contract for correlation, regression/model fitting, prediction, residuals, and interpolation/extrapolation.',
  },
];

const linearSystemQuestion = {
  type: 'systemsWorkspace',
  mode: 'linear',
  prompt: 'Solve the system.',
  system: { m1: 2, b1: 1, m2: -1, b2: 7 },
};

const inequalitySystemQuestion = {
  type: 'systemsWorkspace',
  mode: 'inequalities',
  prompt: 'Use the graph to identify a feasible point.',
  inequalities: [
    { m: 1, b: 1, relation: '>=' },
    { m: -0.5, b: 6, relation: '<=' },
  ],
  testPoint: { x: 2, y: 4 },
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
};

const dataModelingQuestion = {
  type: 'dataModeling',
  prompt: 'Fit a linear model and interpret the correlation.',
  mode: 'regression',
  data: [
    { x: 1, y: 3 },
    { x: 2, y: 5 },
    { x: 3, y: 7 },
  ],
};

const results = {
  pathToolIds: PATH_TOOL_IDS,
  systemsWorkspaceContractExists: Boolean(getPathToolContract('systemsWorkspace')),
  systemsLinearEligible: isPathEligible(linearSystemQuestion),
  systemsInequalitiesEligible: isPathEligible(inequalitySystemQuestion),
  dataModelingContractExists: Boolean(getPathToolContract('dataModeling')),
  dataModelingEligible: isPathEligible(dataModelingQuestion),
  blockers,
};

console.log('# Algebra I Path Tool Adapter Readiness V2\n');
console.log(`Path contracts: ${PATH_TOOL_IDS.join(', ')}`);
console.log(`systemsWorkspace linear mode eligible: ${results.systemsLinearEligible ? 'YES' : 'NO'}`);
console.log(`systemsWorkspace inequalities mode eligible: ${results.systemsInequalitiesEligible ? 'YES' : 'NO'}`);
console.log(`dataModeling contract exists: ${results.dataModelingContractExists ? 'YES' : 'NO'}`);
console.log(`dataModeling Path-eligible: ${results.dataModelingEligible ? 'YES' : 'NO'}\n`);

for (const blocker of blockers) {
  console.log(`${blocker.standards.join(', ')} -> ${blocker.adapter}`);
  console.log(`  existing tool: ${blocker.existingTool}`);
  console.log(`  adapter work: ${blocker.requirement}`);
}

console.log('\nSecurity invariant: unsupported rich tools/modes remain Path-ineligible rather than degrading to a generic response question.');
console.log(JSON.stringify(results, null, 2));

// This is a readiness report, not a release gate. These false values are the
// expected secure state until the adapters are deliberately implemented.
if (!results.systemsWorkspaceContractExists || !results.systemsLinearEligible) {
  throw new Error('Existing linear systems Path contract unexpectedly regressed.');
}
if (results.systemsInequalitiesEligible) {
  throw new Error('Inequalities mode became Path-eligible without this audit being updated for its new secure contract.');
}
if (results.dataModelingContractExists || results.dataModelingEligible) {
  throw new Error('dataModeling became Path-eligible without this audit being updated for its new secure contract.');
}
