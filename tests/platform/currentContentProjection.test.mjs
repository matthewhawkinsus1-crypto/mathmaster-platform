import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectCurrentAssignmentContent,
  resolveCurrentContentStorageIndex,
} from '../../src/platform/assignments/currentContentProjection.js';

const fixture = () => ({
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', questions: [
      { questionId: 'w1' },
      { questionId: 'old-w2', teacherExcluded: true },
      { questionId: 'retired', teacherExcluded: true },
      { questionId: 'w3' },
    ] },
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'c1' }] },
    { id: 'content-v2-corrections-warmup', role: 'warmup', questions: [
      { questionId: 'new-w2', supersedesQuestionId: 'old-w2', introducedInContentVersion: 2 },
    ] },
  ],
});

test('replacement occupies the historical logical position and retains tracker index', () => {
  const assignment = fixture();
  const before = structuredClone(assignment);
  const projection = projectCurrentAssignmentContent(assignment);
  assert.deepEqual(assignment, before);
  assert.deepEqual(projection.entries.map((entry) => [entry.questionId, entry.storageIndex]), [
    ['w1', 0], ['new-w2', 5], ['w3', 3], ['c1', 4],
  ]);
  assert.equal(projection.entries[1].historicalStorageIndex, 1);
  assert.equal(resolveCurrentContentStorageIndex(assignment, 1), 5);
  assert.equal(resolveCurrentContentStorageIndex(assignment, 2), 3);
  assert.deepEqual(projection.logicalSections.map((section) => section.role), ['warmup', 'classwork']);
});

test('ordinary V1 and clean V2 project identically', () => {
  for (const contentVersion of [1, 2]) {
    const assignment = { schemaVersion: 5, contentLineage: { version: contentVersion }, sections: [
      { id: 'practice', role: 'practice', questions: [{ questionId: 'a' }, { questionId: 'b' }] },
    ] };
    assert.deepEqual(projectCurrentAssignmentContent(assignment).entries.map((entry) => entry.storageIndex), [0, 1]);
  }
});

test('malformed replacements stay visible in physical order with stable diagnostics', () => {
  const cases = [
    [{ questionId: 'new', supersedesQuestionId: 'missing' }, 'missing-superseded-question'],
    [{ questionId: 'new', supersedesQuestionId: 'active' }, 'superseded-question-not-excluded'],
  ];
  for (const [replacement, code] of cases) {
    const assignment = { schemaVersion: 5, sections: [
      { id: 'w', role: 'warmup', questions: [{ questionId: 'active' }] },
      { id: 'w-fix', role: 'warmup', questions: [replacement] },
    ] };
    const projection = projectCurrentAssignmentContent(assignment);
    assert.equal(projection.entries.at(-1).questionId, 'new');
    assert.ok(projection.diagnostics.some((diagnostic) => diagnostic.code === code));
  }
});

test('duplicate claims and role conflicts fail safe', () => {
  const assignment = { schemaVersion: 5, sections: [
    { id: 'w', role: 'warmup', questions: [{ questionId: 'old', teacherExcluded: true }] },
    { id: 'c', role: 'classwork', questions: [{ questionId: 'wrong-role', supersedesQuestionId: 'old' }] },
    { id: 'w-fix', role: 'warmup', questions: [
      { questionId: 'new-1', supersedesQuestionId: 'old' },
      { questionId: 'new-2', supersedesQuestionId: 'old' },
    ] },
  ] };
  const projection = projectCurrentAssignmentContent(assignment);
  assert.deepEqual(projection.entries.map((entry) => entry.questionId), ['wrong-role', 'new-1', 'new-2']);
  assert.ok(projection.diagnostics.some((item) => item.code === 'replacement-role-conflict'));
  assert.ok(projection.diagnostics.some((item) => item.code === 'duplicate-active-replacement'));
});
