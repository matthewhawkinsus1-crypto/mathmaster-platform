import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSystemsWorkspaceMode } from '../../src/tools/systemsWorkspace/systemsWorkspaceMode.js';

test('solveSystem algebraic content cannot fall back to graph-only linear mode', () => {
  assert.equal(resolveSystemsWorkspaceMode({
    type: 'systemsWorkspace',
    mode: 'linear',
    method: 'substitution',
    studentActions: ['solveSystem'],
    equations: ['y = -4x + 12', '2x + y = 2'],
    variables: ['x', 'y'],
    requireVerification: true,
  }), 'algebraic');

  assert.equal(resolveSystemsWorkspaceMode({
    type: 'systemsWorkspace',
    studentActions: ['solveSystem'],
    method: 'elimination',
    equationsLatex: ['2x + 3y = 11', 'x + 5y = 9'],
  }), 'algebraic');

  assert.equal(resolveSystemsWorkspaceMode({
    type: 'systemsWorkspace',
    mode: 'linear',
    studentActions: ['graphSystem'],
    system: { m1: 1, b1: 2, m2: -1, b2: 6 },
  }), 'linear');
});

test('all rich method-choice systems stay algebraic even when legacy storage says linear', () => {
  for (const method of ['substitution', 'elimination', 'studentChoice']) {
    assert.equal(resolveSystemsWorkspaceMode({
      mode: 'linear',
      method,
      studentActions: ['solveSystem'],
      equations: ['x + y = 2', 'x - 3y = -6'],
      requireVerification: true,
    }), 'algebraic');
  }
});
