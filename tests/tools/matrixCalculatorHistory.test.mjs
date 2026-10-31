// TL26: the matrix calculator keeps its last few results, side by side and
// across a reload; an error is read once; the row-by-column sum writes a
// negative factor in parentheses; and the warm-up label no longer doubles "=".

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CALCULATOR_HISTORY_LENGTH, negativeInParentheses, nextCalculatorHistory } from '../../src/tools/matrixLab/matrixCalculatorDisplay.js';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';
import { componentSource, executableSource } from '../platform/helpers/sourceContract.mjs';

test('the history keeps the newest command first, each once, at most three', () => {
  assert.equal(CALCULATOR_HISTORY_LENGTH, 3);
  let history = [];
  history = nextCalculatorHistory(history, 'inverse');
  history = nextCalculatorHistory(history, 'inverseTimes');
  assert.deepEqual(history, ['inverseTimes', 'inverse'], 'A⁻¹ stays beside X');
  history = nextCalculatorHistory(history, 'inverse');
  assert.deepEqual(history, ['inverse', 'inverseTimes'], 'running a command again moves it up, never twice');
  history = nextCalculatorHistory(nextCalculatorHistory(history, 'multiply'), 'add');
  assert.deepEqual(history, ['add', 'multiply', 'inverse']);
  assert.deepEqual(nextCalculatorHistory(null, 'add'), ['add'], 'a draft with no history starts one');
});

test('the history is draft-backed, and each calculator on a page keeps its own', () => {
  const calculator = componentSource('src/tools/matrixLab/MatrixCalculator.jsx');
  assert.match(calculator, /usePersistentToolState\(historyKey, \[\]\)/);
  assert.doesNotMatch(calculator, /useState\(null\)/, 'no result held only in component state');
  // A result is worked out again from the matrices on screen, never stored.
  assert.match(calculator, /runCalculator\(operation, left\.cells, right\?\.cells\),\s*\}\)\);/);
  assert.equal(TOOL_STATE_PERSISTENCE.matrixLab.transientState.result, undefined);
  const lab = componentSource('src/tools/matrixLab/MatrixLab.jsx');
  assert.match(lab, /<MatrixCalculator title="Test this system" historyKey="testCalculatorHistory"/);
});

test('an error is announced once, and earlier results are shown without being read again', () => {
  const calculator = executableSource(componentSource('src/tools/matrixLab/MatrixCalculator.jsx'));
  assert.equal((calculator.match(/aria-live=/g) || []).length, 1, 'one live region');
  assert.doesNotMatch(calculator, /role="status"/, 'no second live region inside it');
  const live = calculator.indexOf('aria-live="polite"');
  const history = calculator.indexOf('data-matrix-calculator-history');
  // The live region's own closing tag comes before the history block opens.
  const between = calculator.slice(live, history);
  const opened = (between.match(/<div\b/g) || []).length;
  const closed = (between.match(/<\/div>/g) || []).length;
  assert.ok(live > 0 && history > live, 'both exist, the history after');
  assert.ok(closed >= opened, 'the earlier results sit after the live region closes');
});

test('a negative factor in the row-by-column sum is written in parentheses', () => {
  assert.equal(negativeInParentheses('-1'), '(-1)');
  assert.equal(negativeInParentheses('−1/6'), '(−1/6)');
  assert.equal(negativeInParentheses('2'), '2');
  assert.equal(negativeInParentheses('1/6'), '1/6');
  const lab = componentSource('src/tools/matrixLab/MatrixLab.jsx');
  assert.match(lab, /\$\{negativeInParentheses\(formatRational\(term\.left\)\)\}\(\$\{formatRational\(term\.right\)\}\)/);
});

test('the warm-up label does not end in "=", so its review line does not read "= ="', () => {
  const lesson = JSON.parse(fs.readFileSync('teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json', 'utf8'));
  const labels = lesson.sections.flatMap((section) => section.questions || [])
    .flatMap((question) => [...(question.responses || []), ...(question.answerFields || [])])
    .map((field) => String(field?.label || ''));
  assert.ok(labels.includes('(−2/3) · (its inverse)'));
  assert.deepEqual(labels.filter((label) => /=\s*$/.test(label)), []);
});
