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

test('QuestionEngine owns the shared solver workspace state and resets it per question', async () => {
  const source = await read('src/QuestionEngine.jsx');

  assert.match(source, /const \[solverWorkspaceMode, setSolverWorkspaceMode\] = useState\('normal'\)/);
  assert.match(source, /const solverWorkspaceActive = solverWorkspaceMode !== 'normal'/);
  assert.match(source, /setSolverWorkspaceMode\('normal'\)/);
  assert.match(source, /workspaceMode:\s*solverWorkspaceMode/);
  assert.match(source, /onWorkspaceModeChange:\s*setSolverWorkspaceMode/);
  assert.match(source, /workspaceMode=\{solverWorkspaceMode\}/);
  assert.match(source, /!solverWorkspaceActive\s*&&\s*\(\s*<GuidedClassworkCoach/);
});

test('the shared frame reports mode changes upward while remaining the one mounted solver shell', async () => {
  const source = await read('src/components/common/SolverWorkspaceFrame.jsx');

  assert.match(source, /onWorkspaceModeChange\s*=\s*null/);
  assert.match(source, /onWorkspaceModeChange\?\.\(mode\)/);
  assert.match(source, /onWorkspaceModeChange\?\.\('normal'\)/);
  assert.equal((source.match(/\{children\}/g) || []).length, 1);
});

test('MobileViewport hides task and normal action bars during enlarged or focus workspace without mutating task collapse state', async () => {
  const source = await read('src/components/student/MobileViewportContainer.jsx');

  assert.match(source, /workspaceMode = 'normal'/);
  assert.match(source, /const workspaceActive = workspaceMode !== 'normal'/);
  assert.match(source, /!workspaceActive && \(\s*<div className=\{`mathmaster-desktop-question-anchor/);
  assert.match(source, /!workspaceActive && \((?:actionButtons \|\| workBar|workBar \|\| actionButtons)\)/);
  assert.match(source, /!workspaceActive && \(\s*<section className="question-prompt-panel"/);
  assert.match(source, /solver-workspace-active/);
  assert.doesNotMatch(source, /setIsPromptCollapsed\(true\).*workspaceMode/s);
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
  assert.match(step, /onWorkspaceModeChange=\{props\.onWorkspaceModeChange\}/);
  assert.match(relation, /onWorkspaceModeChange=\{props\.onWorkspaceModeChange\}/);
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
