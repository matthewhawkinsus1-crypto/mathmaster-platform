/*
 * THE STRUCTURE TOOLS ARE WIRED INTO STEP ALGEBRA'S EXISTING SYSTEMS.
 *
 * Node cannot render the workspace, so these read the component source. Each
 * assertion is anchored to the region that does the work — the Undo chain, the
 * draft write, the commit handler — and names the behaviour it protects. The
 * behaviour itself is exercised end to end in a real browser by
 * tests/browser/stepAlgebraStructureTools.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const core = executableSource(read('src/StepByStepAlgebraCore.jsx'));
const wrapper = executableSource(read('src/StepByStepAlgebra.jsx'));

test('the tools come from the shared models, not an inline second algebra engine', () => {
  assert.match(core, /from '\.\/algebraStructureTools'/);
  assert.match(core, /from '\.\/StepAlgebraStructureTools'/);
  const commit = region(core, 'const commitStructureToolStep = async', 'const resetQuestionWork', 'structure commit');
  assert.match(commit, /commitStructureTool\(tool, equation\)/, 'the commit is computed by the model');
});

test('a tool is offered only when the committed equation has the structure it acts on', () => {
  const offered = region(core, 'const structureOptions = useMemo', 'const updateStructureTool', 'structure detection');
  assert.match(offered, /detectStructureTools\(pendingMove \? null : equation/, 'nothing is offered during a balanced move');
  const toolbar = region(core, 'STRUCTURE_TOOL_KINDS\n', 'Cancellation hints', 'structure toolbar');
  assert.match(toolbar, /structureTool\?\.kind === kind \|\| structureOptions\[kind\]\?\.length/);
  assert.match(toolbar, /aria-expanded=\{structureTool\?\.kind === kind\}/);
});

test('committing a structure step records it like every other student commit', () => {
  const commit = region(core, 'const commitStructureToolStep = async', 'const resetQuestionWork', 'structure commit');
  assert.match(commit, /persistStudentRewrite\(beforeEquation, nextEquation/);
  assert.match(commit, /pushCommittedEquation\(beforeEquation, \{ \.\.\.result\.step, after: nextEquation \}\)/);
  assert.ok(
    commit.indexOf('pushCommittedEquation(beforeEquation') < commit.indexOf('setEquation(nextEquation)'),
    'the pre-commit equation is recorded before the visible equation changes',
  );
  assert.match(commit, /setStructureTool\(null\)/);
});

test('Undo backs out the open tool one decision at a time, before older transient work and committed steps', () => {
  const undo = region(core, 'useEffect(() => {\n    onUndoStateChange?.({', '  const triggerShake', 'undo chain');
  const toolBranch = undo.indexOf('} else if (structureTool) {');
  assert.ok(toolBranch > 0, 'the open tool has its own Undo branch');
  assert.match(undo.slice(toolBranch, toolBranch + 400), /setStructureTool\(\(current\) => undoStructureTool\(current\)\)/);
  assert.ok(toolBranch < undo.indexOf('} else if (hasOperationStaging) {'));
  assert.ok(toolBranch < undo.indexOf('} else if (committedHistory.length) {'));
  const transient = region(core, 'const hasTransientUndo = Boolean(', ');', 'transient undo');
  assert.match(transient, /Boolean\(structureTool\)/);
});

test('committed Undo removes the step\'s history entry exactly once, with its equation', () => {
  const undo = region(core, '} else if (committedHistory.length) {', 'return current.slice(0, -1);', 'committed undo');
  const pop = undo.indexOf('setWorkSteps((steps) => steps.slice(0, -1))');
  const updater = undo.indexOf('setCommittedHistory((current) => {');
  assert.ok(pop >= 0, 'the history entry is popped');
  assert.ok(pop < updater, 'popped outside the state updater, which StrictMode may run twice');
  assert.match(undo, /setEquation\(previous\)/);
  const push = region(core, 'const pushCommittedEquation = (snapshot, step = null) => {', '  };', 'push');
  assert.match(push, /setCommittedHistory/);
  assert.match(push, /setWorkSteps/, 'the Undo snapshot and the history entry are pushed by the same call');
});

test('open tools and the step log are part of the question draft, and reset with the question', () => {
  const draft = region(core, 'writeQuestionDraft(localDraftKey, {', '});', 'draft write');
  assert.match(draft, /structureTool,/);
  assert.match(draft, /workSteps,/);
  const freshQuestion = region(core, 'useEffect(() => {\n    if (savedDraft) return;', '}, [question, savedDraft]);', 'fresh question reset');
  assert.match(freshQuestion, /setStructureTool\(null\)/);
  const reset = region(core, 'const resetQuestionWork = () =>', 'const attemptMove', 'reset work');
  assert.match(reset, /setStructureTool\(null\)/);
  assert.match(reset, /setWorkSteps\(\[\]\)/);
  const stale = region(core, "structureTool.equationKey !== equationKey(equation)", '}, [structureTool, equation]);', 'stale tool');
  assert.match(stale, /setStructureTool\(null\)/, 'a tool never outlives the equation it was opened on');
});

test('only one tool is open at a time: opening any other tool closes the structure tool', () => {
  for (const [start, end] of [
    ['const openLikeTermsTool = () =>', 'const chooseLikeTermsSide'],
    ['const openRewriteTool = () =>', 'const persistStudentRewrite'],
    ['const openDistributionTool = () =>', 'const cancelDistribution'],
    ['const selectOperation = (operation, sourceSide) =>', 'const activateTapPlacement'],
  ]) {
    assert.match(region(core, start, end, start), /setStructureTool\(null\)/, `${start} must close an open structure tool`);
  }
  const toggle = region(core, 'const toggleStructureTool = (kind) =>', 'const commitStructureToolStep', 'toggle');
  assert.match(toggle, /closeRewriteTool\(\)/);
  assert.match(toggle, /closeLikeTermsTool\(\)/);
  assert.match(toggle, /setDistributionState\(null\)/);
});

test('the tool draws on the equation itself, and its side gets the room', () => {
  const side = region(core, 'const renderSide = (side, cancellationModel = null) => {', 'if (cancellationModel) {', 'renderSide');
  assert.match(side, /<StructureToolSide/);
  assert.match(core, /has-structure-focus-\$\{structureFocusSides\[0\]\}/);
  assert.match(core, /<StructureToolControls/);
});

test('the Work View history shows each committed step in words and notation', () => {
  assert.match(wrapper, /import AlgebraWorkSteps from '\.\/AlgebraWorkSteps'/);
  assert.match(wrapper, /onWorkStepsChange=\{setWorkSteps\}/);
  assert.match(wrapper, /<AlgebraWorkSteps steps=\{workSteps\} \/>/);
  const steps = executableSource(read('src/AlgebraWorkSteps.jsx'));
  assert.match(steps, /equationToLatex\(equation\)/, 'history equations are typeset from the stored expressions');
});

test('rewriteLinearForm hosts the same core with the target form as its objective', () => {
  const rewrite = executableSource(read('src/tools/stepAlgebra2/RewriteLinearForm.jsx'));
  assert.match(rewrite, /import StepByStepAlgebraCore from '\.\.\/\.\.\/StepByStepAlgebraCore'/);
  const objective = region(rewrite, 'const objective = useMemo(() => ({', '}), [targetForm]);', 'objective');
  assert.match(objective, /kind: targetForm/);
  assert.match(objective, /requireSimplifiedFinalForm: targetForm === 'slopeIntercept'/);
  assert.doesNotMatch(rewrite, /checkSideRewrite\(/, 'the generic "type the equivalent side" box is no longer the primary path');
});
