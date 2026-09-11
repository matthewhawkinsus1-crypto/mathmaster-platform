import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_MATH_UNDO_STACK,
  recordMathUndoEntry,
  undoMathUndoEntry,
} from '../../src/platform/workView/mathUndoStack.js';

const source = (path) => readFileSync(path, 'utf8');

const migrated = [
  ['src/tools/stepAlgebra2/StepAlgebra2.jsx', 'StepAlgebra2'],
  ['src/StepByStepAlgebra.jsx', 'StepByStepAlgebra'],
  ['src/MultiRelationAlgebra.jsx', 'MultiRelationAlgebra'],
];

test('Stage 3C has a complete, explicit algebra Work View inventory', () => {
  for (const [path] of migrated) {
    const text = source(path);
    assert.match(text, /<EnlargeableFigure\b/, `${path} must use Universal Work View`);
    assert.doesNotMatch(text, /<SolverWorkspaceFrame\b/, `${path} must not retain the legacy fullscreen shell`);
    assert.equal((text.match(/<EnlargeableFigure\b/g) || []).length, 1, `${path} owns exactly one shell`);
  }
});

test('algebra shells advertise algebra capabilities, never graph capabilities', () => {
  for (const [path] of migrated) {
    const text = source(path);
    assert.match(text, /equationInput:/);
    assert.match(text, /numericControls:/);
    assert.match(text, /instruction:/);
    assert.match(text, /task:/);
    assert.match(text, /help:/);
    assert.doesNotMatch(text, /\b(?:fitView|panZoom|pointEditing):/);
  }
});

test('Step Algebra 2 uses canonical identity and one Universal Undo control', () => {
  const text = source('src/tools/stepAlgebra2/StepAlgebra2.jsx');
  assert.match(text, /useMathUndoHistory\(\{/);
  assert.match(text, /resetKey: questionData\.questionId \?\? questionData\.id \?\? null/);
  assert.doesNotMatch(text, /resetKey:[^\n]*prompt/);
  assert.doesNotMatch(text, />Undo step</, 'the equivalent local Undo control has been removed');
  assert.match(text, /undo: undoHistory\.capability/);
});

test('advanced algebra keeps its proven shared controller and split branch state in one owner', () => {
  for (const path of ['src/StepByStepAlgebraCore.jsx', 'src/MultiRelationAlgebraCore.jsx']) {
    const text = source(path);
    assert.match(text, /onUndoStateChange\?\.\(\{/);
    assert.match(text, /(?:committedHistory|history)\.length/);
  }
  const relation = source('src/MultiRelationAlgebraCore.jsx');
  assert.match(relation, /const \[activeBranch, setActiveBranch\] = useState\(0\)/);
  assert.match(relation, /\{ relationState: before, activeBranch \}/);
  assert.match(relation, /setRelationState\(previous\.relationState \|\| previous\)/);
  assert.match(relation, /setActiveBranch\(previous\.relationState \? previous\.activeBranch : 0\)/);
  assert.match(relation, /absoluteSplitValues/);
  assert.doesNotMatch(source('src/MultiRelationAlgebra.jsx'), /<MultiRelationAlgebraCore[\s\S]*<MultiRelationAlgebraCore/);
});

test('the mathematical stack performs successive Undo operations and excludes presentation', () => {
  let stack = EMPTY_MATH_UNDO_STACK;
  const first = { relation: '2x + 5 = 19', branches: null, activeBranch: 0, workViewOpen: false };
  const second = { relation: '2x = 14', branches: null, activeBranch: 0, workViewOpen: true };
  const third = { relation: 'x = 7', branches: null, activeBranch: 0, workViewOpen: false };
  stack = recordMathUndoEntry(stack, first, second);
  stack = recordMathUndoEntry(stack, second, third);
  let result = undoMathUndoEntry(stack);
  assert.equal(result.restored.relation, '2x = 14');
  result = undoMathUndoEntry(result.stack);
  assert.equal(result.restored.relation, '2x + 5 = 19');
});

test('mobile algebra inherits the generic keyboard-context layout rule', () => {
  const css = source('src/components/common/WorkViewShell.css');
  assert.match(css, /data-keyboard="open"/);
  assert.match(css, /mathmaster-tool-split > \.mathmaster-tool-panel:first-child/);
  for (const [path] of migrated) assert.doesNotMatch(source(path), /visualViewport|orientationchange/);
});
