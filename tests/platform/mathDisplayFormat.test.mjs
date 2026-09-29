import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';
import { readFileSync } from 'node:fs';

test('forces LaTeX after a display rewrite introduces a LaTeX fraction', () => {
  assert.equal(resolveMathDisplayFormat('(\\frac{f}{g})(x)', 'ascii-math'), 'latex');
});

test('keeps ordinary ASCIIMath in ASCIIMath mode', () => {
  assert.equal(resolveMathDisplayFormat('(f+g)(x)', 'ascii-math'), 'ascii-math');
});

test('honors an explicit LaTeX request', () => {
  assert.equal(resolveMathDisplayFormat('x^2', 'latex'), 'latex');
});


test('student math display repairs legacy joined inequality command text', () => {
  const source = readFileSync('src/MathDisplay.jsx', 'utf8');
  assert.match(source, /repairLegacyMathLiveRelations/);
  assert.match(source, /replace\(\/\\\\let\\b\/g, '\\\\le t'\)/);
  assert.match(source, /replace\(\/\\\\get\\b\/g, '\\\\ge t'\)/);
});

/*
 * ANY BACKSLASH COMMAND IS LATEX (student UX pass, R-3).
 *
 * PR #397 QA: `(2, -2),\ (4, -1)` — two points separated by a LaTeX control
 * space — carried no letter command, was classified as ASCIIMath, failed to
 * parse in MathLive and rendered blank. The same happened to set braces
 * `\{ \}`, thin spaces `\,` and line breaks `\\`. ASCIIMath has no backslash
 * commands, so each of these is LaTeX by definition.
 */
test('a list of points joined by a LaTeX control space renders as LaTeX', () => {
  assert.equal(resolveMathDisplayFormat('(2, -2),\\ (4, -1)'), 'latex');
  assert.equal(resolveMathDisplayFormat('(2, -2),\\ (4, -1)', 'ascii-math'), 'latex');
});

test('spacing, escaped braces and line breaks are LaTeX signals', () => {
  for (const value of [
    '\\{1, 2, 3\\}',
    'x \\in \\{-1, 0\\}',
    '3\\,\\text{cm}',
    'a\\;b',
    'x\\!+\\!1',
    'y = 2x\\\\ y = -x',
    '50\\%',
    '\\$20',
    '\\S 3',
  ]) {
    assert.equal(resolveMathDisplayFormat(value), 'latex', value);
  }
});

test('the named commands QA listed are all LaTeX', () => {
  for (const value of ['\\frac{1}{2}', '\\left(x\\right)', 'x \\le 3', 'x \\ge 3', '\\sqrt{2}', '\\text{cm}']) {
    assert.equal(resolveMathDisplayFormat(value), 'latex', value);
  }
});

test('plain ASCII math with no backslash stays ASCIIMath', () => {
  for (const value of ['(2, -2), (4, -1)', 'y = 2x - 4', 'sqrt(x) + 1', 'x^2 - 3x', '1/2 b h', 'f(x) = |x - 3|']) {
    assert.equal(resolveMathDisplayFormat(value), 'ascii-math', value);
  }
});
