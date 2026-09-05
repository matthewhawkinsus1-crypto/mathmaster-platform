import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const blockBetween = (source, startText, endText) => {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `Expected block ${startText} ... ${endText}`);
  return source.slice(start, end);
};

test('StepByStep keeps capped committed equation history and exposes it through Undo', async () => {
  const source = await read('src/StepByStepAlgebraCore.jsx');

  assert.match(source, /const \[committedHistory, setCommittedHistory\] = useState\(\[\]\)/);
  assert.match(source, /const pushCommittedEquation = \(snapshot\) =>/);
  assert.match(source, /slice\(-59\)/);

  const undoBlock = blockBetween(source, 'useEffect(() => {\n    onUndoStateChange?.({', '  const triggerShake');
  assert.match(undoBlock, /committedHistory\.length/);
  assert.match(undoBlock, /setCommittedHistory/);
  assert.match(undoBlock, /setEquation/);
  assert.match(undoBlock, /pendingMove|rewriteOpen|selectedCancellationIndices/);
});

test('StepByStep records the pre-commit equation for every accepted student math commit', async () => {
  const source = await read('src/StepByStepAlgebraCore.jsx');
  const moveBlock = blockBetween(source, 'const commitMove = async', '  const hasPartialCancellationSelection');
  const rewriteBlock = blockBetween(source, 'const checkStudentRewrite = async', '  const resetQuestionWork');
  const cancellationBlock = blockBetween(source, 'const commitStandaloneCancellation = async', '  const registerCancellationHits');

  assert.match(moveBlock, /pushCommittedEquation\(equation\)/);
  assert.ok(
    moveBlock.indexOf('pushCommittedEquation(equation)') < moveBlock.indexOf('setEquation(nextEquation)'),
    'balanced move history must be recorded before visible equation replacement',
  );

  assert.match(rewriteBlock, /pushCommittedEquation\(equation\)/);
  assert.ok(
    rewriteBlock.indexOf('pushCommittedEquation(equation)') < rewriteBlock.indexOf('setEquation(nextEquation)'),
    'rewrite history must be recorded before visible equation replacement',
  );

  assert.match(cancellationBlock, /pushCommittedEquation\(beforeEquation\)/);
  assert.ok(
    cancellationBlock.indexOf('pushCommittedEquation(beforeEquation)') < cancellationBlock.indexOf('setEquation(nextEquation)'),
    'standalone cancellation history must be recorded before visible equation replacement',
  );
});

test('StepByStep clears committed history on question reset and Reset Work', async () => {
  const source = await read('src/StepByStepAlgebraCore.jsx');
  const questionReset = blockBetween(source, 'useEffect(() => {\n    if (savedDraft) return;', '  useEffect(() => {\n    // A JSON author');
  const resetBlock = blockBetween(source, 'const resetQuestionWork = () =>', '  const attemptMove');

  assert.match(questionReset, /setCommittedHistory\(\[\]\)/);
  assert.match(resetBlock, /setCommittedHistory\(\[\]\)/);
});

test('MultiRelation Undo clears transient staging before popping committed relation history', async () => {
  const source = await read('src/MultiRelationAlgebraCore.jsx');
  const undoBlock = blockBetween(source, 'useEffect(() => {\n    onUndoStateChange?.({', '  const persistStep');

  assert.match(source, /const \[history, setHistory\] = useState\(\[\]\)/);
  assert.match(undoBlock, /hasTransientUndo/);
  assert.match(undoBlock, /pendingRelationFlip|placementByKey|absoluteSplitOpen|rewriteOpen/);
  assert.match(undoBlock, /pendingRelationFlip\?\.before/);
  assert.match(undoBlock, /history\.length/);
  assert.match(undoBlock, /setHistory/);
  assert.match(undoBlock, /setRelationState/);
});

test('MultiRelation commits one history snapshot only after integrity validation and reset clears it', async () => {
  const source = await read('src/MultiRelationAlgebraCore.jsx');
  const commitBlock = blockBetween(source, 'const commitState = async', '  const hasOperationOperand');
  const resetBlock = blockBetween(source, 'const reset = () =>', '  const active =');

  const validationIndex = commitBlock.indexOf('validateRelationTransition');
  const historyIndex = commitBlock.indexOf('setHistory');
  assert.ok(validationIndex >= 0 && historyIndex > validationIndex);
  assert.equal((commitBlock.match(/setHistory/g) || []).length, 1);
  assert.match(resetBlock, /setHistory\(\[\]\)/);
});
