import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeAssignmentPlatformIssues,
  resolveAssignmentPlatformIssues,
} from '../../src/platform/preflight/assignmentPlatformIssues.js';
import { RUNTIME_REPAIR_KEYS } from '../../src/platform/assignments/assignmentRuntimeRepair.js';

const reported = {
  questionId: '0d24f506-f272-4004-9a1e-5b4986492b51',
  classification: 'platformIssue',
  suspectedComponent: 'functionModeling graph stage',
  reason: 'A graph appears even though this question only asks continuity and domain.',
  repairKey: RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
};

test('platform issue reports are normalized and deduplicated without losing the first report time', () => {
  const first = mergeAssignmentPlatformIssues([], [reported], { nowIso: '2026-09-09T20:00:00.000Z' });
  const second = mergeAssignmentPlatformIssues(first, [{
    ...reported,
    suspectedComponent: ' FunctionModeling   graph stage ',
    reason: ' A graph appears even though this question only asks continuity and domain. ',
  }], { nowIso: '2026-09-09T21:00:00.000Z' });

  assert.equal(second.length, 1);
  assert.equal(second[0].status, 'open');
  assert.equal(second[0].reportedAt, '2026-09-09T20:00:00.000Z');
  assert.equal(second[0].resolvedRepairKey, null);
  assert.equal(second[0].resolvedRuntimeVersion, null);
});

test('an issue stays open when the runtime manifest does not explicitly match both question and repair key', () => {
  const issues = mergeAssignmentPlatformIssues([], [reported], { nowIso: '2026-09-09T20:00:00.000Z' });
  const resolved = resolveAssignmentPlatformIssues(issues, [{
    questionId: reported.questionId,
    repairKey: RUNTIME_REPAIR_KEYS.ACTIVE_WORKFLOW_TASK,
    runtimeVersion: 1,
  }]);
  assert.equal(resolved[0].status, 'open');
});

test('matching runtime manifest marks the persisted issue resolved by that exact platform update', () => {
  const issues = mergeAssignmentPlatformIssues([], [reported], { nowIso: '2026-09-09T20:00:00.000Z' });
  const resolved = resolveAssignmentPlatformIssues(issues, [{
    questionId: reported.questionId,
    repairKey: RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
    runtimeVersion: 1,
  }]);

  assert.equal(resolved[0].status, 'resolvedByPlatformUpdate');
  assert.equal(resolved[0].resolvedRepairKey, RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH);
  assert.equal(resolved[0].resolvedRuntimeVersion, 1);
});

test('AI report without an internal key can resolve only when its component/reason matches that registered repair', () => {
  const aiReported = { ...reported };
  delete aiReported.repairKey;
  const issues = mergeAssignmentPlatformIssues([], [aiReported], { nowIso: '2026-09-09T20:00:00.000Z' });
  const resolved = resolveAssignmentPlatformIssues(issues, [{
    questionId: reported.questionId,
    repairKey: RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
    runtimeVersion: 1,
  }]);

  assert.equal(resolved[0].status, 'resolvedByPlatformUpdate');
  assert.equal(resolved[0].resolvedRepairKey, RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH);
});

test('AI report without an internal key never resolves against an unrelated repair on the same question', () => {
  const aiReported = {
    ...reported,
    repairKey: undefined,
    suspectedComponent: 'answer grading',
    reason: 'A correct numeric answer is marked incorrect.',
  };
  const issues = mergeAssignmentPlatformIssues([], [aiReported], { nowIso: '2026-09-09T20:00:00.000Z' });
  const resolved = resolveAssignmentPlatformIssues(issues, [{
    questionId: reported.questionId,
    repairKey: RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
    runtimeVersion: 1,
  }]);
  assert.equal(resolved[0].status, 'open');
});

test('runtime version alone can never resolve an issue', () => {
  const issues = mergeAssignmentPlatformIssues([], [reported], { nowIso: '2026-09-09T20:00:00.000Z' });
  const resolved = resolveAssignmentPlatformIssues(issues, [{ runtimeVersion: 1 }]);
  assert.equal(resolved[0].status, 'open');
});
