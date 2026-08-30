import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  matrix3x4Rows,
  solve3x3System,
} from '../../src/tools/systemsWorkspace/systemsMath.js';
import {
  buildPrivateToolGrading,
  buildPublicToolPayload,
  gradePathResponse,
  isPathEligible,
} from '../../functions/shared/pathToolContracts.mjs';

const UNIQUE_MATRIX = {
  rows: [
    [1, 1, 1, 6],
    [2, -1, 1, 3],
    [1, 2, -1, 2],
  ],
};

const MATRIX3_QUESTION = {
  id: 'a2-3b-matrix3-contract-fixture',
  type: 'systemsWorkspace',
  prompt: 'Use matrix technology to compute RREF and solve the 3×3 system.',
  mode: 'matrix3',
  requireTechnology: true,
  matrix: UNIQUE_MATRIX,
};

test('3x3 client matrix math reduces a unique system to identity RREF', () => {
  assert.deepEqual(matrix3x4Rows(UNIQUE_MATRIX), UNIQUE_MATRIX.rows);
  const result = solve3x3System(UNIQUE_MATRIX);
  assert.equal(result.type, 'one');
  assert.ok(Math.abs(result.x - 1) < 1e-9);
  assert.ok(Math.abs(result.y - 2) < 1e-9);
  assert.ok(Math.abs(result.z - 3) < 1e-9);
  assert.deepEqual(
    result.rref.map((row) => row.map((value) => Math.round(value * 1e9) / 1e9)),
    [
      [1, 0, 0, 1],
      [0, 1, 0, 2],
      [0, 0, 1, 3],
    ],
  );
});

test('3x3 matrix math distinguishes inconsistent and dependent systems', () => {
  assert.equal(solve3x3System({
    rows: [
      [1, 1, 1, 3],
      [2, 2, 2, 6],
      [1, 1, 1, 4],
    ],
  }).type, 'none');

  assert.equal(solve3x3System({
    rows: [
      [1, 1, 1, 3],
      [2, 2, 2, 6],
      [3, 3, 3, 9],
    ],
  }).type, 'infinite');
});

test('secure Path contract recomputes the 3x3 answer and never publishes it', () => {
  assert.equal(isPathEligible(MATRIX3_QUESTION), true);
  const payload = buildPublicToolPayload(MATRIX3_QUESTION);
  assert.equal(payload.pathToolId, 'systemsWorkspace');
  assert.equal(payload.serverGradingVersion, 3);
  assert.equal(payload.tool.mode, 'matrix3');
  assert.deepEqual(payload.tool.matrix, UNIQUE_MATRIX);
  assert.equal(payload.tool.requireTechnology, true);

  const publicText = JSON.stringify(payload.tool);
  assert.equal(publicText.includes('"solution"'), false);
  assert.equal(publicText.includes('"rref"'), false);
  assert.equal(publicText.includes('"x":1'), false);
  assert.equal(publicText.includes('"z":3'), false);
});

test('matrix3 Path grading requires the technology action and all three coordinates', () => {
  const privateGrading = buildPrivateToolGrading(MATRIX3_QUESTION);

  const skippedTechnology = gradePathResponse({
    privateGrading,
    raw: { classification: 'one', x: 1, y: 2, z: 3, technologyUsed: false },
  });
  assert.equal(skippedTechnology.rejected, true);
  assert.match(skippedTechnology.detail || '', /RREF technology/i);

  const correct = gradePathResponse({
    privateGrading,
    raw: { classification: 'one', x: 1, y: 2, z: 3, technologyUsed: true },
  });
  assert.equal(correct.rejected, false);
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(correct.parts.map((part) => [part.id, part.isCorrect]), [
    ['classification', true],
    ['matrix-technology', true],
    ['solution', true],
  ]);

  const wrongZ = gradePathResponse({
    privateGrading,
    raw: { classification: 'one', x: 1, y: 2, z: 4, technologyUsed: true },
  });
  assert.equal(wrongZ.rejected, false);
  assert.equal(wrongZ.isCorrect, false);
  assert.equal(wrongZ.parts.find((part) => part.id === 'solution')?.isCorrect, false);
});

test('Systems Workspace exposes an explicit 3x3 RREF technology workflow', () => {
  const source = readFileSync('src/tools/systemsWorkspace/SystemsWorkspace.jsx', 'utf8');
  assert.match(source, /mode === 'matrix3'/);
  assert.match(source, /Use matrix technology · Compute RREF/);
  assert.match(source, /technologyUsed/);
  assert.match(source, /label="z"/);
  assert.match(source, /3×3 Matrix Technology \/ RREF/);
});
