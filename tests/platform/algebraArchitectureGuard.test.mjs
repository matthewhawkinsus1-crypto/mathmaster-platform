import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { executableSource } from './helpers/sourceContract.mjs';

// NO SILENT REPLACEMENT ARCHITECTURE (Job 1, phase 4).
//
// A capability disappears without deleting a line when a second, narrower
// surface starts taking students first: a new host mounting an engine on its
// own terms, a copy of an old component, a retired solver imported again. This
// guard lists every place an algebra engine is mounted today. Adding one is
// allowed — but it has to be added here, next to the routing resolver
// (src/platform/algebra/algebraWorkspaceRoute.js), on purpose.

const SRC = 'src';
const files = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) walk(full);
  else files.push(full);
});
walk(SRC);
const code = files.filter((file) => /\.(jsx?|mjs)$/.test(file));
// Mounting is JSX, so only .jsx files can mount; manifests that NAME a
// component in a regex are not hosts.
const mounts = (component) => code
  .filter((file) => file.endsWith('.jsx'))
  .filter((file) => new RegExp(`<${component}[\\s/>]`).test(executableSource(fs.readFileSync(file, 'utf8'))))
  .map((file) => file.split(path.sep).join('/'))
  .sort();

test('the mature equation engine is mounted only by its known hosts', () => {
  assert.deepEqual(mounts('StepByStepAlgebraCore'), [
    'src/LinearInterceptsOrchestrator.jsx',
    'src/StepByStepAlgebra.jsx',
    'src/tools/stepAlgebra2/RewriteLinearForm.jsx',
    'src/tools/systemsWorkspace/AlgebraicSystemMode.jsx',
  ]);
  assert.deepEqual(mounts('StepByStepAlgebra'), [
    'src/QuestionEngine.jsx',
    'src/platform/workflow/WorkflowRunner.jsx',
  ]);
});

test('the relation engine is mounted only by its known hosts', () => {
  assert.deepEqual(mounts('MultiRelationAlgebraCore'), [
    'src/MultiRelationAlgebra.jsx',
    'src/tools/systemsWorkspace/EmbeddedInequalityRewrite.jsx',
  ]);
  assert.deepEqual(mounts('MultiRelationAlgebra'), [
    'src/QuestionEngine.jsx',
    'src/StepByStepAlgebra.jsx',
  ]);
});

test('the retired answer-box solver stays retired', () => {
  const importers = code.filter((file) => /from ['"][./]*EquationGrader(\.jsx)?['"]/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(importers, [], 'EquationGrader was retired for the balance workspace; nothing may import it');
});

test('no stale copies of components live in the source tree', () => {
  const stale = files.filter((file) => /\.(bak|orig|old|before-[\w-]+)$|\.jsx?\.[\w-]+$/.test(file));
  assert.deepEqual(stale, [], 'backup copies of components invite a stale version back in; keep history in git');
});

test('the legacy stepAlgebra2 mini-solvers are only reachable through the resolver’s legacy routes', () => {
  const registry = fs.readFileSync('src/tools/stepAlgebra2/StepAlgebra2.jsx', 'utf8');
  // The mode-less numeric solver and the intercept mini-solver are kept for
  // stored {a, b, c} records and unconsolidated hosts only; every other mode
  // hands the work to StepByStepAlgebraCore (RewriteLinearForm).
  assert.match(registry, /if \(questionData\.mode === 'rewriteLinearForm'\) \{[\s\S]*?<RewriteLinearForm/);
  const route = fs.readFileSync('src/platform/algebra/algebraWorkspaceRoute.js', 'utf8');
  assert.match(route, /LEGACY_NUMERIC: 'stepAlgebra2\.numeric'/);
  assert.match(route, /LEGACY_LINEAR_INTERCEPTS: 'stepAlgebra2\.linearIntercepts'/);
});
