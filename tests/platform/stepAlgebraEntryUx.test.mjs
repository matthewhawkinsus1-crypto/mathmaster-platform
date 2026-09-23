import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const coreSource = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));

test('optional simplification puts the answer field before explanatory copy', () => {
  const start = coreSource.indexOf("pendingMove.simplificationTargets?.length > 0");
  const end = coreSource.indexOf("question.showHint", start);
  assert.ok(start >= 0 && end > start);
  const region = coreSource.slice(start, end);
  const inputIndex = region.indexOf('placeholder="Simplified expression"');
  const noteIndex = region.indexOf('algebra-simplification-note');
  assert.ok(inputIndex >= 0);
  assert.ok(noteIndex > inputIndex, 'helper copy must come after the answer box');
  assert.match(region, /Simplify \(optional\)/);
  assert.doesNotMatch(region, /The balanced equation is already valid\. If you want to simplify/);
});

test('automatic simplification focuses the first answer field as soon as the prompt appears', () => {
  assert.match(coreSource, /const \[simplificationFocusSignal, setSimplificationFocusSignal\] = useState\(0\)/);
  assert.match(coreSource, /const simplificationPromptVisible = Boolean/);
  assert.match(coreSource, /if \(!simplificationPromptVisible\) return/);
  assert.match(coreSource, /setSimplificationFocusSignal\(\(signal\) => signal \+ 1\)/);
  const start = coreSource.indexOf('pendingMove.simplificationTargets.map');
  const end = coreSource.indexOf('algebra-simplification-actions', start);
  const region = coreSource.slice(start, end);
  assert.match(region, /focusSignal=\{index === 0 \? simplificationFocusSignal : 0\}/);
});

test('long equations fit inside their own balance side instead of requiring horizontal scrolling', async () => {
  const css = await readFile('src/StepByStepAlgebra.css', 'utf8');
  assert.match(coreSource, /const sideFontSize = \(side\) =>/);
  assert.match(coreSource, /function AutoFitEquationExpression/);
  assert.match(coreSource, /adaptiveBalanceColumns/);
  assert.match(css, /\.algebra-expression-anchor[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.algebra-expression-anchor[\s\S]*?max-width:\s*100%/);
});
