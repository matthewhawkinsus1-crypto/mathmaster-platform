import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkflowReviewState,
  firstIncorrectWorkflowIndex,
} from '../../src/platform/workflow/workflowReviewState.js';

const stages = [
  { id: 'one', kind: 'classification' },
  { id: 'two', kind: 'pointInput' },
  { id: 'three', kind: 'shortResponse' },
];

test('answered draft steps are not presented as correct before a submission', () => {
  const state = buildWorkflowReviewState({
    stages,
    responses: { one: 'yes', two: '(2, 3)' },
  });
  assert.deepEqual(state.map((entry) => entry.status), ['draft', 'draft', 'unanswered']);
});

test('submitted workflow review separates correct and incorrect stages', () => {
  const responses = { one: 'yes', two: '(2, 3)', three: 'because' };
  const state = buildWorkflowReviewState({
    stages,
    responses,
    review: {
      responseKey: JSON.stringify(responses),
      parts: [
        { id: 'one', graded: true, isCorrect: true },
        { id: 'two', graded: true, isCorrect: false },
        { id: 'three', graded: false, isCorrect: false },
      ],
    },
  });

  assert.deepEqual(state.map((entry) => entry.status), ['correct', 'incorrect', 'reviewed']);
  assert.equal(firstIncorrectWorkflowIndex(state), 1);
});

test('editing a checked response removes the old verdict until it is checked again', () => {
  const submitted = { one: 'yes', two: '(2, 3)' };
  const state = buildWorkflowReviewState({
    stages: stages.slice(0, 2),
    responses: { one: 'yes', two: '(3, 0)' },
    review: {
      responseKey: JSON.stringify(submitted),
      parts: [
        { id: 'one', graded: true, isCorrect: true },
        { id: 'two', graded: true, isCorrect: false },
      ],
    },
  });

  assert.deepEqual(state.map((entry) => entry.status), ['correct', 'changed']);
  assert.equal(firstIncorrectWorkflowIndex(state), -1);
});
