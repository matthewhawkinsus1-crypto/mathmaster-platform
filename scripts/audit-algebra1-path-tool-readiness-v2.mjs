#!/usr/bin/env node
// Algebra I TEKS Fidelity V2 — secure Path tool readiness.
//
// Read-only. This is the post-adapter audit: it proves the Algebra I modes we
// deliberately secured are Path-eligible, while an unsupported rich mode still
// fails closed instead of degrading to a generic answer box.

import {
  PATH_TOOL_IDS,
  getPathToolContract,
  isPathEligible,
} from '../functions/shared/pathToolContracts.mjs';

const linearSystemQuestion = {
  type: 'systemsWorkspace',
  mode: 'linear',
  prompt: 'Solve the system.',
  system: { m1: 2, b1: 1, m2: -1, b2: 7 },
};

const inequalitySystemQuestion = {
  type: 'systemsWorkspace',
  mode: 'inequalities',
  prompt: 'Construct both boundaries and the feasible region.',
  inequalities: [
    { m: 1, b: 1, relation: '>=' },
    { m: -0.5, b: 6, relation: '<=' },
  ],
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
};

const correlationQuestion = {
  type: 'dataModeling',
  mode: 'correlation',
  prompt: 'Calculate and interpret the correlation coefficient.',
  points: [[1, 3], [2, 5], [3, 7], [4, 9]],
};

const linearFitQuestion = {
  type: 'dataModeling',
  mode: 'linearFitPrediction',
  prompt: 'Write the fitted linear function and predict.',
  points: [[0, 2], [1, 5], [2, 8], [3, 11]],
  predictionX: 5,
};

const quadraticFitQuestion = {
  type: 'dataModeling',
  mode: 'quadraticFitPrediction',
  prompt: 'Write the fitted quadratic function and predict.',
  points: [[-2, 18], [-1, 9], [0, 4], [1, 3], [2, 6]],
  predictionX: 3,
};

const exponentialFitQuestion = {
  type: 'dataModeling',
  mode: 'exponentialFitPrediction',
  prompt: 'Write the fitted exponential function and predict.',
  points: [[0, 16], [1, 8], [2, 4], [3, 2], [4, 1]],
  predictionX: 5,
};

// Deliberately unsupported: no secure matrix-mode grading definition exists.
const unsupportedMatrixQuestion = {
  type: 'systemsWorkspace',
  mode: 'matrix',
  prompt: 'Solve using a matrix workspace.',
  matrix: [[1, 2, 3], [4, 5, 6]],
};

const results = {
  pathToolIds: PATH_TOOL_IDS,
  systemsWorkspaceContractExists: Boolean(getPathToolContract('systemsWorkspace')),
  dataModelingContractExists: Boolean(getPathToolContract('dataModeling')),
  systemsLinearEligible: isPathEligible(linearSystemQuestion),
  systemsInequalitiesEligible: isPathEligible(inequalitySystemQuestion),
  correlationEligible: isPathEligible(correlationQuestion),
  linearFitEligible: isPathEligible(linearFitQuestion),
  quadraticFitEligible: isPathEligible(quadraticFitQuestion),
  exponentialFitEligible: isPathEligible(exponentialFitQuestion),
  unsupportedMatrixEligible: isPathEligible(unsupportedMatrixQuestion),
};

console.log('# Algebra I Path Tool Adapter Readiness V2\n');
console.log(`Path contracts: ${PATH_TOOL_IDS.join(', ')}`);
for (const [name, value] of Object.entries(results).filter(([name]) => name !== 'pathToolIds')) {
  console.log(`${name}: ${value ? 'YES' : 'NO'}`);
}
console.log('\nSecurity invariant: approved modes are server-authoritative; unsupported rich modes remain Path-ineligible.');

const requiredTrue = [
  'systemsWorkspaceContractExists',
  'dataModelingContractExists',
  'systemsLinearEligible',
  'systemsInequalitiesEligible',
  'correlationEligible',
  'linearFitEligible',
  'quadraticFitEligible',
  'exponentialFitEligible',
];
for (const key of requiredTrue) {
  if (!results[key]) throw new Error(`${key} unexpectedly failed secure Path eligibility.`);
}
if (results.unsupportedMatrixEligible) {
  throw new Error('Unsupported systemsWorkspace matrix mode must fail closed.');
}

console.log(JSON.stringify(results, null, 2));
