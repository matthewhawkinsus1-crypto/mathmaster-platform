import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeSafeResponseEntryRepair } from '../../functions/shared/liveResponseRepairPolicy.mjs';

test('shared safe-response policy accepts the same prose-to-choice conversion', () => {
  const before = {
    questionId: 'q1',
    type: 'multiAnswer',
    answerFields: [{ id: 'kind', label: 'Type', answer: 'interpolation', inputProfile: 'text' }],
  };
  const after = {
    questionId: 'q1',
    type: 'multiAnswer',
    answerFields: [{
      id: 'kind',
      label: 'Type',
      answer: 'interpolation',
      inputProfile: 'choice',
      type: 'choice',
      options: ['interpolation', 'extrapolation'],
    }],
  };
  const result = analyzeSafeResponseEntryRepair(before, after);
  assert.equal(result.safe, true);
  assert.deepEqual(result.affectedFieldIds, ['kind']);
});

test('shared safe-response policy rejects prompt changes', () => {
  const before = {
    questionId: 'q1',
    type: 'multiAnswer',
    prompt: 'Original',
    answerFields: [{ id: 'kind', answer: 'interpolation', inputProfile: 'text' }],
  };
  const after = {
    ...before,
    prompt: 'Changed',
    answerFields: [{
      id: 'kind',
      answer: 'interpolation',
      inputProfile: 'choice',
      type: 'choice',
      options: ['interpolation', 'extrapolation'],
    }],
  };
  assert.equal(analyzeSafeResponseEntryRepair(before, after).safe, false);
});


test('shared safe-response policy allows the certified legacy system to algebraic Systems Workspace recovery', () => {
  const before = {
    questionId: 'systems-live-1',
    type: 'system',
    prompt: 'Use substitution to solve the system. One variable is already isolated: y = -4x + 12 and 2x + y = 2.',
    studentActions: ['solveSystem'],
    equationsLatex: ['y = -4x + 12', '2x + y = 2'],
    standard: 'A2.3A',
    dok: 2,
    difficultyBand: 1,
  };
  const after = {
    ...before,
    type: 'systemsWorkspace',
    toolId: 'systemsWorkspace',
    mode: 'algebraic',
    method: 'substitution',
    equations: ['y = -4x + 12', '2x + y = 2'],
    variables: ['x', 'y'],
    requireVerification: true,
  };
  const result = analyzeSafeResponseEntryRepair(before, after);
  assert.equal(result.safe, true);
  assert.equal(result.repairKind, 'systems-workspace-upgrade');
  assert.deepEqual(result.affectedFieldIds, []);
});

test('certified Systems Workspace recovery refuses changed mathematics or a different method', () => {
  const before = {
    questionId: 'systems-live-2',
    type: 'system',
    prompt: 'Use elimination to solve the system 2x + 3y = 11 and x + 5y = 9.',
    studentActions: ['solveSystem'],
    equationsLatex: ['2x + 3y = 11', 'x + 5y = 9'],
  };
  const baseAfter = {
    ...before,
    type: 'systemsWorkspace',
    toolId: 'systemsWorkspace',
    mode: 'algebraic',
    method: 'elimination',
    equations: ['2x + 3y = 11', 'x + 5y = 9'],
    variables: ['x', 'y'],
    requireVerification: true,
  };

  const changedEquation = structuredClone(baseAfter);
  changedEquation.equations[1] = 'x + 5y = 10';
  assert.equal(analyzeSafeResponseEntryRepair(before, changedEquation).safe, false);

  const changedMethod = { ...baseAfter, method: 'substitution' };
  assert.equal(analyzeSafeResponseEntryRepair(before, changedMethod).safe, false);
});
