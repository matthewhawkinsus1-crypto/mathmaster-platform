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

test('long equations shrink and scroll inside their own balance side instead of overlapping the equals sign', async () => {
  const css = await readFile('src/StepByStepAlgebra.css', 'utf8');
  assert.match(coreSource, /const sideFontSize = \(side\) =>/);
  assert.match(coreSource, /length >= 42/);
  assert.match(css, /\.algebra-expression-anchor[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.algebra-expression-anchor[\s\S]*?max-width:\s*100%/);
});
