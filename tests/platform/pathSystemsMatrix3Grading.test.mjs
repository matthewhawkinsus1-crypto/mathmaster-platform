import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMatrix3RowOperationToMatrix,
  buildSystemsMatrix3PrivateDefinition,
  gradeSystemsMatrix3Response,
  rref3,
  sanitizeSystemsMatrix3PublicQuestion,
  systemsMatrix3DefinitionIsGradable,
  validateSystemsMatrix3Response,
} from '../../functions/shared/pathSystemsMatrix3Grading.mjs';
import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';

const matrix = {
  rows: [
    { a: 1, b: 1, c: 1, d: 6 },
    { a: 2, b: -1, c: 1, d: 3 },
    { a: 1, b: 2, c: -1, d: 2 },
  ],
};

const rowOperations = [
  { targetRow: 1, sourceRow: 0, factor: 2 },
  { targetRow: 2, sourceRow: 0, factor: 1 },
  { targetRow: 2, sourceRow: 1, factor: -1 / 3 },
];

const gaussianQuestion = {
  type: 'systemsWorkspace',
  mode: 'matrix3',
  method: 'gaussian',
  prompt: 'Use Gaussian elimination to solve the 3×3 system.',
  matrix,
  rowOperations,
  numericTolerance: 0.02,
  answer: 'must-not-leak',
};

const rrefQuestion = {
  type: 'systemsWorkspace',
  mode: 'matrix3',
  method: 'rref',
  prompt: 'Use matrix technology to solve the 3×3 system.',
  matrix,
  numericTolerance: 0.02,
  answer: 'must-not-leak',
};

const asRowObject = (row) => ({ a: row[0], b: row[1], c: row[2], d: row[3] });

test('3×3 RREF produces the expected unique solution', () => {
  const solved = rref3(matrix);
  assert.equal(solved.type, 'one');
  assert.deepEqual(solved.solution, { x: 1, y: 2, z: 3 });
  assert.deepEqual(
    solved.matrix.map((row) => row.map((value) => Math.round(value * 1e9) / 1e9)),
    [[1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3]],
  );
});

test('Gaussian checkpoints are derived sequentially from the same public matrix', () => {
  let working = matrix;
  const checkpoints = [];
  for (const operation of rowOperations) {
    const next = applyMatrix3RowOperationToMatrix(working, operation);
    assert.ok(next);
    working = { rows: next.map(asRowObject) };
    checkpoints.push(next[operation.targetRow]);
  }
  assert.deepEqual(checkpoints[0], [0, -3, -1, -9]);
  assert.deepEqual(checkpoints[1], [0, 1, -2, -4]);
  assert.ok(Math.abs(checkpoints[2][0]) < 1e-9);
  assert.ok(Math.abs(checkpoints[2][1]) < 1e-9);
  assert.ok(Math.abs(checkpoints[2][2] + 7 / 3) < 1e-9);
  assert.ok(Math.abs(checkpoints[2][3] + 7) < 1e-9);
});

test('Gaussian private definition is gradable and accepts Firestore-safe row objects', () => {
  const definition = buildSystemsMatrix3PrivateDefinition(gaussianQuestion);
  assert.equal(systemsMatrix3DefinitionIsGradable(definition), true);
  assert.equal(definition.checkpoints.length, 3);

  const raw = {
    classification: 'one',
    checkpoints: definition.checkpoints.map(asRowObject),
    x: 1,
    y: 2,
    z: 3,
  };
  assert.equal(validateSystemsMatrix3Response(raw, definition).ok, true);
  const result = gradeSystemsMatrix3Response(definition, raw);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
});

test('wrong Gaussian work cannot be rescued by a forged browser verdict', () => {
  const privateGrading = buildPrivateToolGrading(gaussianQuestion);
  const definition = privateGrading.definition;
  const forged = {
    classification: 'one',
    checkpoints: definition.checkpoints.map((row, index) => (
      index === 1 ? asRowObject([0, 99, -2, -4]) : asRowObject(row)
    )),
    x: 1,
    y: 2,
    z: 3,
    isCorrect: true,
    score: 1,
  };
  const result = gradePathResponse({ privateGrading, raw: forged });
  assert.equal(result.rejected, false);
  assert.equal(result.isCorrect, false);
  assert.ok(result.score < 1);
});

test('RREF technology mode grades the complete 3×4 matrix plus final triple', () => {
  const privateGrading = buildPrivateToolGrading(rrefQuestion);
  const solved = privateGrading.definition.solved;
  const raw = {
    classification: 'one',
    rref: solved.matrix.map(asRowObject),
    x: 1,
    y: 2,
    z: 3,
  };
  const result = gradePathResponse({ privateGrading, raw });
  assert.equal(result.rejected, false);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
});

test('matrix3 is Path-eligible but legacy 2×2 matrix mode remains fail-closed', () => {
  assert.equal(isPathEligible(gaussianQuestion), true);
  assert.equal(isPathEligible(rrefQuestion), true);
  assert.equal(isPathEligible({
    type: 'systemsWorkspace',
    mode: 'matrix',
    prompt: 'Legacy 2×2 matrix',
    matrix: { a11: 1, a12: 1, b1: 2, a21: 1, a22: -1, b2: 0 },
  }), false);
});

test('public matrix3 payload exposes the problem and row-operation directions, not the solution', () => {
  const direct = sanitizeSystemsMatrix3PublicQuestion(gaussianQuestion);
  assert.equal(direct.mode, 'matrix3');
  assert.equal(direct.method, 'gaussian');
  assert.equal(direct.matrix.rows.length, 3);
  assert.equal(direct.rowOperations.length, 3);

  const payload = buildPublicToolPayload(gaussianQuestion);
  assert.equal(payload.pathToolId, 'systemsWorkspace');
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal(serialized.includes('"solution"'), false);
  assert.equal(serialized.includes('"solved"'), false);
  assert.equal(serialized.includes('"checkpoints"'), false);
  assert.equal(serialized.includes('"rref"'), false);
});
