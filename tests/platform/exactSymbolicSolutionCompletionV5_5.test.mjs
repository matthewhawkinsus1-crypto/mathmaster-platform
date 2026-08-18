import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  relationSolutionSummary,
} from '../../src/algebraRelationFoundation.js';

const state = (branches, variable = 'x') => ({
  variable,
  branches,
  connective: branches.length > 1 ? 'OR' : null,
  special: null,
});

test('two exact radical branches count as a completed solution', () => {
  const summary = relationSolutionSummary(state([
    {
      expressions: ['x', 'sqrt((0 - 7) / 2 + 9) + 3'],
      relations: ['='],
    },
    {
      expressions: ['x', '-sqrt((0 - 7) / 2 + 9) + 3'],
      relations: ['='],
    },
  ]));

  assert.equal(summary.solved, true);
  assert.equal(summary.kind, 'exactValues');
  assert.equal(summary.exactValues.length, 2);
});

test('isolated exact radical does not need rationalization or decimalization', () => {
  const summary = relationSolutionSummary(state([
    {
      expressions: ['x', '3 + sqrt(11 / 2)'],
      relations: ['='],
    },
  ]));

  assert.equal(summary.solved, true);
  assert.equal(summary.kind, 'exactValues');
  assert.deepEqual(summary.exactValues, ['3 + sqrt(11 / 2)']);
});

test('literal equations are complete when the target variable is isolated', () => {
  const summary = relationSolutionSummary(state([
    {
      expressions: ['x', '(y - b) / m'],
      relations: ['='],
    },
  ]));

  assert.equal(summary.solved, true);
  assert.equal(summary.kind, 'exactValues');
});

test('target variable on the opposite expression means the equation is not solved', () => {
  const summary = relationSolutionSummary(state([
    {
      expressions: ['x', 'x + 4'],
      relations: ['='],
    },
  ]));

  assert.equal(summary.solved, false);
});

test('ordinary numeric solutions preserve the old values contract', () => {
  const summary = relationSolutionSummary(state([
    { expressions: ['x', '5'], relations: ['='] },
    { expressions: ['x', '-2'], relations: ['='] },
  ]));

  assert.equal(summary.solved, true);
  assert.equal(summary.kind, 'values');
  assert.deepEqual(summary.values, [-2, 5]);
});

test('workspace displays exact symbolic completion and clears stale process feedback', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');

  assert.match(src, /exact-symbolic-solution-complete/);
  assert.match(src, /Solved — all solution branches are complete/);
  assert.match(src, /summary\.kind === 'exactValues'/);
  assert.match(src, /setMessage\(\(current\) => \(current == null \? current : null\)\)/);
});

test('exact solution card says further simplification is optional', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');

  assert.match(src, /equivalent simplified form is optional/i);
  assert.match(src, /does not require extra radical, fraction, or literal-expression cleanup/i);
});
