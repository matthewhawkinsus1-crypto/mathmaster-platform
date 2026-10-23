// A LONG EQUATION ON A FIGURE CARD BREAKS AT ITS EQUALS SIGN (walkthrough
// 2026-10-23, Solving Linear Equations CW 14: Figure 5 was cut off after
// "+ 2(2").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIGURE_EQUATION_LINE_CHARS, figureEquationLines } from '../../src/platform/workflow/figureMatch.js';

test('a long equation is its left side, then "= right side"', () => {
  assert.deepEqual(figureEquationLines('9x − 2(3x + 1) + 7 = −4(2x − 2) + 2(2x − 3)'), ['9x − 2(3x + 1) + 7', '= −4(2x − 2) + 2(2x − 3)']);
});

test('a short equation, an inequality, two equals signs or one inside braces stay whole', () => {
  assert.deepEqual(figureEquationLines('2x + 5 = 9'), ['2x + 5 = 9']);
  assert.ok('2x + 5 = 9'.length <= FIGURE_EQUATION_LINE_CHARS);
  assert.deepEqual(figureEquationLines('3(x − 4) + 2x ≤ 5x − 12 + 7x − 1'), ['3(x − 4) + 2x ≤ 5x − 12 + 7x − 1']);
  assert.deepEqual(figureEquationLines('\\frac{x}{2} + 3 \\le 4x - 7 + 2x + 9'), ['\\frac{x}{2} + 3 \\le 4x - 7 + 2x + 9']);
  assert.deepEqual(figureEquationLines('y = 2x + 1 = 3x − 4 + 7x − 12 + 5'), ['y = 2x + 1 = 3x − 4 + 7x − 12 + 5']);
  assert.deepEqual(figureEquationLines('\\text{set }{a = b} \\text{ and some longer text}'), ['\\text{set }{a = b} \\text{ and some longer text}']);
});

test('the figure card typesets each line', () => {
  const stage = readFileSync(new URL('../../src/platform/workflow/FigureMatchStage.jsx', import.meta.url), 'utf8');
  assert.match(stage, /figureEquationLines\(item\.math\)\.map\(\(line, lineIndex\) => <MathDisplay key=\{lineIndex\} value=\{line\} \/>\)/);
});
