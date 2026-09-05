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
  assert.match(source, /!solverWorkspaceActive\s*&&\s*guidedCoach/);
});

test('the shared frame reports mode changes upward while remaining the one mounted solver shell', async () => {
  const source = await read('src/components/common/SolverWorkspaceFrame.jsx');

  assert.match(source, /onWorkspaceModeChange\s*=\s*null/);
  assert.match(source, /onWorkspaceModeChange\?\.\(mode\)/);
  assert.match(source, /onWorkspaceModeChange\?\.\('normal'\)/);
  assert.equal((source.match(/\{children\}/g) || []).length, 1);
});

test('workspace Task access is temporary instead of occupying persistent top-bar space', async () => {
  const frame = await read('src/components/common/SolverWorkspaceFrame.jsx');

  assert.match(frame, /const \[taskOpen, setTaskOpen\] = useState\(false\)/);
  assert.match(frame, /aria-controls="solver-workspace-task-panel"/);
  assert.match(frame, /id="solver-workspace-task-panel"/);
  assert.match(frame, /setTaskOpen\(false\)/);
  assert.doesNotMatch(frame, /<span title=\{taskText\}>\{taskText\}<\/span>/);
});

test('workspace toolbar reuses assignment Undo, Scratchpad, Help, and final Submit actions', async () => {
  const question = await read('src/QuestionEngine.jsx');
  const frame = await read('src/components/common/SolverWorkspaceFrame.jsx');
  const step = await read('src/StepByStepAlgebra.jsx');
  const relation = await read('src/MultiRelationAlgebra.jsx');

  assert.equal((question.match(/<GuidedClassworkCoach/g) || []).length, 1);
  assert.match(question, /const guidedCoachEnabled =/);
  assert.match(question, /const guidedCoach = \(/);
  assert.match(question, /const workspaceActions = \{/);
  assert.match(question, /undo:\s*\{/);
  assert.match(question, /onClick:\s*\(\) => undoController\?\.onUndo\?\.\(\)/);
  assert.match(question, /scratchpad:\s*\{/);
  assert.match(question, /onClick:\s*openScratchpad/);
  assert.match(question, /help:\s*guidedCoachEnabled/);
  assert.match(question, /content:\s*guidedCoach/);
  assert.match(question, /submit:\s*!locked && shouldShowSubmit/);
  assert.match(question, /onClick:\s*handleSubmit/);
  assert.match(question, /disabled:\s*submitDisabled/);

  assert.match(step, /workspaceActions=\{props\.workspaceActions\}/);
  assert.match(relation, /workspaceActions=\{props\.workspaceActions\}/);
  assert.match(frame, /workspaceActions\s*=\s*null/);
  assert.match(frame, /workspaceActions\?\.undo/);
  assert.match(frame, /workspaceActions\?\.scratchpad/);
  assert.match(frame, /workspaceActions\?\.help/);
  assert.match(frame, /workspaceActions\?\.submit/);
  assert.match(frame, /solver-workspace-help-panel/);
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

test('multi-relation workspace uses presentation-only density for branches and absolute-value split entry', async () => {
  const wrapper = await read('src/MultiRelationAlgebra.jsx');
  const core = await read('src/MultiRelationAlgebraCore.jsx');
  const css = await read('src/components/common/SolverWorkspaceFrame.css');

  assert.match(wrapper, /const denseWorkspace = props\.workspaceMode !== 'normal'/);
  assert.match(wrapper, /denseWorkspace=\{denseWorkspace\}/);
  assert.match(core, /denseWorkspace = false/);
  assert.match(core, /multi-relation-branches--dense/);
  assert.match(core, /multi-relation-branch--dense/);
  assert.match(core, /multi-relation-absolute-split-fields--dense/);
  assert.match(core, /denseWorkspace && relationState\.branches\.length > 1 && operationDock/);
  assert.match(core, /!denseWorkspace && branchIndex === 1 && relationState\.branches\.length > 1 && operationDock/);
  assert.equal((core.match(/className="multi-relation-operation-dock"/g) || []).length, 1);

  assert.match(css, /\.multi-relation-branches--dense\s*\{/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\.multi-relation-absolute-split-fields--dense/);
  assert.match(css, /@media \(max-width: 780px\)[\s\S]*\.multi-relation-branches--dense[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});
