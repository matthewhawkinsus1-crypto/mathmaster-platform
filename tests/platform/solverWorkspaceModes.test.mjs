import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('solver workspace offers normal, enlarged and focus modes without duplicating solver children', async () => {
  const source = await read('src/components/common/SolverWorkspaceFrame.jsx');
  assert.match(source, /useState\('normal'\)/);
  assert.match(source, /openMode\('enlarged'/);
  assert.match(source, /openMode\('focus'/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /closest\('\.mathmaster-question-engine'\)/);
  assert.match(source, /dataset\.solverWorkspaceMode/);
  assert.match(source, /document\.body\.style\.overflow/);
  assert.match(source, /Return to assignment/);
  assert.match(source, /Fit work/);
  assert.equal((source.match(/\{children\}/g) || []).length, 1);
  assert.doesNotMatch(source, /cloneElement|createPortal/);
});

test('both algebra solvers preserve their public entry points while using the shared workspace shell', async () => {
  const step = await read('src/StepByStepAlgebra.jsx');
  const relation = await read('src/MultiRelationAlgebra.jsx');
  assert.match(step, /StepByStepAlgebraCore/);
  assert.match(step, /SolverWorkspaceFrame/);
  assert.match(step, /export \* from '\.\/StepByStepAlgebraCore'/);
  assert.match(relation, /MultiRelationAlgebraCore/);
  assert.match(relation, /SolverWorkspaceFrame/);
  assert.match(relation, /export \* from '\.\/MultiRelationAlgebraCore'/);
  assert.match(step, /focusPanel=/);
  assert.match(relation, /focusPanel=/);
});

test('focus mode expands the work surface and keeps operation controls available', async () => {
  const css = await read('src/components/common/SolverWorkspaceFrame.css');
  assert.match(css, /data-solver-workspace-mode="enlarged"/);
  assert.match(css, /data-solver-workspace-mode="focus"/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /\.algebra-balance-workspace-shell/);
  assert.match(css, /\.algebra-operation-composer/);
  assert.match(css, /\.multi-relation-operation-dock/);
  assert.match(css, /\.solver-workspace-focus-panel/);
  assert.match(css, /@media \(max-width: 780px\)/);
});
