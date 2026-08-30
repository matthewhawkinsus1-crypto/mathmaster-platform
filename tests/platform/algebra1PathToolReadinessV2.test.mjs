import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_TOOL_IDS,
  getPathToolContract,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';

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
  data: [{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }],
};

test('Path tool readiness remains deliberately fail-closed before V2 adapters land', () => {
  assert.ok(PATH_TOOL_IDS.includes('systemsWorkspace'));
  assert.ok(getPathToolContract('systemsWorkspace'));
  assert.equal(isPathEligible(linearSystemQuestion), true);

  // These false values are security expectations, not missing-test failures.
  // When either adapter is deliberately implemented, update this test alongside
  // the new server grader, public allowlist, response validation, and grading tests.
  assert.equal(isPathEligible(inequalitySystemQuestion), false);
  assert.equal(getPathToolContract('dataModeling'), null);
  assert.equal(isPathEligible(dataModelingQuestion), false);
});
