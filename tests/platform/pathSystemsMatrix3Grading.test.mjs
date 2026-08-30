import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';

const MATRIX = {
  rows: [
    { a: 1, b: 1, c: 1, d: 6 },
    { a: 2, b: -1, c: 1, d: 3 },
    { a: 1, b: 2, c: -1, d: 2 },
  ],
};

const GAUSSIAN = {
  type: 'systemsWorkspace',
  mode: 'matrix3',
  method: 'gaussian',
  prompt: 'Solve the 3×3 system using Gaussian elimination.',
  matrix: MATRIX,
  rowOperations: [
    { targetRow: 1, sourceRow: 0, factor: 2 },
    { targetRow: 2, sourceRow: 0, factor: 1 },
    { targetRow: 1, sourceRow: 2, factor: -3 },
  ],
  answer: 'must-not-leak',
};

const RREF = {
  type: 'systemsWorkspace',
  mode: 'matrix3',
  method: 'rref',
  prompt: 'Use matrix technology to find RREF and solve.',
  matrix: MATRIX,
  answer: 'must-not-leak',
};

test('3x3 Gaussian Path questions are securely eligible and require the full checkpoint sequence', () => {
  assert.equal(isPathEligible(GAUSSIAN), true);
  const definition = buildPrivateToolGrading(GAUSSIAN);
  assert.equal(definition.mode, 'matrix3');
  assert.equal(definition.method, 'gaussian');
  assert.deepEqual(definition.checkpoints, [
    [0, -3, -1, -9],
    [0, 1, -2, -4],
    [0, 0, -7, -21],
  ]);

  const result = gradePathResponse({
    privateGrading: definition,
    raw: {
      classification: 'one',
      checkpoints: [
        [0, -3, -1, -9],
        [0, 1, -2, -4],
        [0, 0, -7, -21],
      ],
      x: 1,
      y: 2,
      z: 3,
      isCorrect: false,
      score: 0,
    },
  });
  assert.equal(result.rejected, false);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
});

test('a wrong middle Gaussian checkpoint cannot be hidden by a correct final answer', () => {
  const definition = buildPrivateToolGrading(GAUSSIAN);
  const result = gradePathResponse({
    privateGrading: definition,
    raw: {
      classification: 'one',
      checkpoints: [
        [0, -3, -1, -9],
        [0, 1, -2, -3],
        [0, 0, -7, -21],
      ],
      x: 1,
      y: 2,
      z: 3,
      isCorrect: true,
      score: 1,
    },
  });
  assert.equal(result.rejected, false);
  assert.equal(result.isCorrect, false);
  assert.equal(result.parts.find((part) => part.id === 'row-operation-2')?.isCorrect, false);
  assert.ok(result.score > 0 && result.score < 1);
});

test('Gaussian submissions missing a required checkpoint are rejected instead of burning an attempt', () => {
  const definition = buildPrivateToolGrading(GAUSSIAN);
  const result = gradePathResponse({
    privateGrading: definition,
    raw: {
      classification: 'one',
      checkpoints: [[0, -3, -1, -9]],
      x: 1,
      y: 2,
      z: 3,
    },
  });
  assert.equal(result.rejected, true);
});

test('technology RREF is server-graded as the complete 3x4 matrix', () => {
  assert.equal(isPathEligible(RREF), true);
  const definition = buildPrivateToolGrading(RREF);
  const result = gradePathResponse({
    privateGrading: definition,
    raw: {
      classification: 'one',
      rref: [
        [1, 0, 0, 1],
        [0, 1, 0, 2],
        [0, 0, 1, 3],
      ],
      x: 1,
      y: 2,
      z: 3,
    },
  });
  assert.equal(result.rejected, false);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
});

test('the public matrix3 payload exposes the task but not solution/checkpoint answers', () => {
  const payload = buildPublicToolPayload(GAUSSIAN);
  assert.equal(payload.pathToolId, 'systemsWorkspace');
  assert.equal(payload.tool.mode, 'matrix3');
  assert.deepEqual(payload.tool.rowOperations, GAUSSIAN.rowOperations);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal(serialized.includes('checkpoints'), false);
  assert.equal(serialized.includes('"solution"'), false);
  assert.equal(serialized.includes('"expected"'), false);
});
