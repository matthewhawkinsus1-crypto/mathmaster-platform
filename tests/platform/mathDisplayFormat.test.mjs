import test from 'node:test';
import assert from 'node:assert/strict';
import { braceScriptGroups, latexFunctionNames, resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';
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

// Rational Exponents: once a fraction is stacked the label is LaTeX, where
// "^(" raises the bracket alone; y^(1/7) was drawn as y⁽ with 1/7 after it.
test('a bracketed exponent or subscript becomes a braced group in LaTeX', () => {
  assert.equal(braceScriptGroups('y^(\\frac{1}{7}) · y^(\\frac{4}{7}) =', 'latex'), 'y^{\\frac{1}{7}} · y^{\\frac{4}{7}} =');
  assert.equal(braceScriptGroups('x^(−\\frac{2}{3})', 'latex'), 'x^{−\\frac{2}{3}}');
  assert.equal(braceScriptGroups('\\frac{1}{x^(\\frac{2}{3})}', 'latex'), '\\frac{1}{x^{\\frac{2}{3}}}');
  assert.equal(braceScriptGroups('(x^(\\frac{1}{3}))^(\\frac{1}{2})', 'latex'), '(x^{\\frac{1}{3}})^{\\frac{1}{2}}');
  assert.equal(braceScriptGroups('2^((x - 1)(x + 1)) + \\frac{1}{2}', 'latex'), '2^{(x - 1)(x + 1)} + \\frac{1}{2}');
  assert.equal(braceScriptGroups('a_(n-1) + \\frac{1}{2}', 'latex'), 'a_{n-1} + \\frac{1}{2}');
  assert.equal(braceScriptGroups('x^ (\\frac{1}{3})', 'latex'), 'x^{\\frac{1}{3}}');
});

test('only LaTeX is rewritten, and only a group that closes', () => {
  assert.equal(braceScriptGroups('x^(1/3)', 'ascii-math'), 'x^(1/3)', 'ASCIIMath groups the bracket itself');
  assert.equal(braceScriptGroups('x^(\\frac{1}{3}', 'latex'), 'x^(\\frac{1}{3}', 'an unclosed bracket is left as written');
  assert.equal(braceScriptGroups('x^{\\frac{1}{3}} + y^2', 'latex'), 'x^{\\frac{1}{3}} + y^2');
  assert.equal(braceScriptGroups('\\^(x)', 'latex'), '\\^(x)', 'an escaped caret is not a power');
});

test('MathDisplay braces the value it typesets, not the words it speaks', () => {
  const display = readFileSync(new URL('../../src/MathDisplay.jsx', import.meta.url), 'utf8');
  assert.match(display, /const typesetValue = latexFunctionNames\(braceScriptGroups\(unicodeSubscriptsToMathMarkup\(cleanValue, resolvedFormat\), resolvedFormat\), resolvedFormat\);/);
  assert.match(display, /mathSpeechLabel\(\{ value: cleanValue,/);
  // √3/3 is √3 over 3 on screen (stackDivisions.mjs unicodeMath).
  assert.match(display, /stackDivisions\(repairLegacyMathLiveRelations\(stripMathDelimiters\(value\)\), \{ unicodeMath: true \}\)/);
});

// Once a fraction is stacked the value is LaTeX, where a bare ln(3) is the
// italic letters l and n: a product of two variables.
test('a function\'s name is drawn upright in LaTeX, and only there', () => {
  assert.equal(latexFunctionNames('\\frac{ln(3)}{ln(2)}'), '\\frac{\\ln(3)}{\\ln(2)}');
  assert.equal(latexFunctionNames('\\frac{log_2(8)}{3}'), '\\frac{\\log_2(8)}{3}');
  assert.equal(latexFunctionNames('\\frac{sin(x)}{cos(x)} = tan(x)'), '\\frac{\\sin(x)}{\\cos(x)} = \\tan(x)');
  assert.equal(latexFunctionNames('sin^2(x) + cos\\left(x\\right)'), '\\sin^2(x) + \\cos\\left(x\\right)');
  assert.equal(latexFunctionNames('\\frac{\\ln(3)}{2}'), '\\frac{\\ln(3)}{2}', 'a command stays one command');
  // A name inside a word, or a word in \text{…}, is not a function.
  assert.equal(latexFunctionNames('kiln(3) + cosine(x) + login'), 'kiln(3) + cosine(x) + login');
  assert.equal(latexFunctionNames('\\text{log in (2)} + ln(2)'), '\\text{log in (2)} + \\ln(2)');
  assert.equal(latexFunctionNames('ln(2)', 'ascii-math'), 'ln(2)', 'ASCIIMath is left to MathLive');
});
