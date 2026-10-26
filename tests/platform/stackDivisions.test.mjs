import test from 'node:test';
import assert from 'node:assert/strict';
import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';

// Turning a written division into a stacked fraction, without ever changing
// what the mathematics says.

test('a simple division becomes a fraction', () => {
  assert.equal(stackDivisions('3/4'), '\\frac{3}{4}');
  assert.equal(stackDivisions('x/2'), '\\frac{x}{2}');
  assert.equal(stackDivisions('x/y'), '\\frac{x}{y}');
  assert.equal(stackDivisions('x/2 + 1'), '\\frac{x}{2} + 1');
});

test('a fraction coefficient keeps its variable outside the denominator', () => {
  // The one that matters most. Reading `4x` as the denominator would turn the
  // slope three quarters into three over four-x — a different line.
  assert.equal(stackDivisions('3/4x'), '\\frac{3}{4}x');
  assert.equal(stackDivisions('y = 3/4x + 2'), 'y = \\frac{3}{4}x + 2');
  assert.equal(stackDivisions('m = 6/8'), 'm = \\frac{6}{8}');
});

test('brackets are read as one operand and lose a redundant outer pair', () => {
  assert.equal(stackDivisions('(x + 1)/2'), '\\frac{x + 1}{2}');
  assert.equal(stackDivisions('2/(x + 1)'), '\\frac{2}{x + 1}');
  assert.equal(stackDivisions('(a + b)/(c + d)'), '\\frac{a + b}{c + d}');
  // Not a redundant pair: these brackets belong to different groups.
  assert.equal(stackDivisions('((a)+(b))/2'), '\\frac{(a)+(b)}{2}');
});

test('\\left and \\right travel with their bracket', () => {
  assert.equal(stackDivisions('\\left(3/4\\right)x'), '\\left(\\frac{3}{4}\\right)x');
  assert.equal(stackDivisions('\\left(x + 1\\right)/2'), '\\frac{x + 1}{2}');
});

test('several divisions in one expression are all rewritten', () => {
  assert.equal(stackDivisions('1/2 + 3/4'), '\\frac{1}{2} + \\frac{3}{4}');
  assert.equal(stackDivisions('y = 1/2x - 3/4'), 'y = \\frac{1}{2}x - \\frac{3}{4}');
});

// The other half. A `/` that cannot be read confidently must survive untouched:
// a wrong \frac changes the mathematics, an unstacked slash is only ugly.
test('a power travels with its base into the fraction', () => {
  // `x^2/3` is x-squared over three. Taking only the exponent as the numerator
  // would print `x^\frac{2}{3}` — a different number — so the base comes too.
  assert.equal(stackDivisions('x^2/3'), '\\frac{x^2}{3}');
  // And on the other side: `180/d^2` is 180 over d-squared, not 180 over d,
  // all squared.
  assert.equal(stackDivisions('180/d^2'), '\\frac{180}{d^2}');
  assert.equal(stackDivisions('3/4^2'), '\\frac{3}{4^2}');
});

test('a subscript or a braced power beside the slash is left alone', () => {
  // A subscript is part of a name, not an operand.
  assert.equal(stackDivisions('a_1/2'), 'a_1/2');
  assert.equal(stackDivisions('2/b_1'), '2/b_1');
  // A closing brace is the tail of a `\frac` as often as it is a power group.
  // Too ambiguous to rewrite, so the slash stays as written.
  assert.equal(stackDivisions('x^{2}/3'), 'x^{2}/3');
});

test('a command beside the slash is left alone', () => {
  assert.equal(stackDivisions('\\pi/2'), '\\pi/2');
  assert.equal(stackDivisions('3/\\sqrt{2}'), '3/\\sqrt{2}');
  assert.equal(stackDivisions('\\frac{1}{2}/3'), '\\frac{1}{2}/3');
});

test('words are not mathematics', () => {
  assert.equal(stackDivisions('\\text{miles/hour}'), '\\text{miles/hour}');
  assert.equal(stackDivisions('\\mathrm{km/h}'), '\\mathrm{km/h}');
  assert.equal(
    stackDivisions('r = 60 \\text{ miles/hour}'),
    'r = 60 \\text{ miles/hour}',
  );
});

test('ASCIIMath spellings LaTeX cannot render are left entirely alone', () => {
  // Introducing a \frac would flip the whole string to LaTeX rendering, where
  // `sqrt(x)` is the word "sqrt" rather than a radical.
  assert.equal(stackDivisions('sqrt(x)/2'), 'sqrt(x)/2');
  assert.equal(stackDivisions('abs(x)/2'), 'abs(x)/2');
});

test('input with nothing to do comes back unchanged', () => {
  assert.equal(stackDivisions('x + 2'), 'x + 2');
  assert.equal(stackDivisions('\\frac{3}{4}x'), '\\frac{3}{4}x');
  assert.equal(stackDivisions(''), '');
  assert.equal(stackDivisions(null), '');
  assert.equal(stackDivisions('/'), '/', 'a slash with no operands');
  assert.equal(stackDivisions('x/'), 'x/');
  assert.equal(stackDivisions('/2'), '/2');
});

// Radical Expressions wrote its mathematics as it looks, and the student was
// shown √(3/3) for √3/3 and (√(xy)/y)⁴ for x√(xy)/y⁴. With `unicodeMath`
// (MathDisplay and the prose splitter) a radical keeps its index and radicand
// and a superscript run is the power of what it follows.
test('on screen, a unicode radical keeps its radicand and a superscript its base', () => {
  const shown = (value) => stackDivisions(value, { unicodeMath: true });
  assert.equal(shown('√3/3'), '\\frac{√3}{3}');
  assert.equal(shown('2√3/3'), '\\frac{2√3}{3}', 'a number coefficient comes along, as for \\sqrt in grading');
  assert.equal(shown('x√(xy)/y⁴'), 'x\\frac{√(xy)}{y⁴}', 'a letter coefficient does not, and the denominator keeps its power');
  assert.equal(shown('y⁴√x/x⁴'), 'y⁴\\frac{√x}{x⁴}', 'superscripts after a letter are its power, not the root\'s index');
  assert.equal(shown('∛(6x²)/(3x)'), '\\frac{∛(6x²)}{3x}');
  assert.equal(shown('ⁿ√a / ⁿ√b'), '\\frac{ⁿ√a}{ⁿ√b}');
  assert.equal(shown('⁶√(x²)/2'), '\\frac{⁶√(x²)}{2}');
  assert.equal(shown('1/√3 and 6/∛4'), '\\frac{1}{√3} and \\frac{6}{∛4}');
  assert.equal(shown('5/x²'), '\\frac{5}{x²}', 'not (5/x)²');
  assert.equal(shown('(1 + √5)²/4'), '\\frac{(1 + √5)²}{4}');
  // Inside a radical's own brackets the division is the radicand's.
  assert.equal(shown('√(5/4)'), '√(\\frac{5}{4})');
  // What has no radical or superscript reads as it always did.
  for (const value of ['3/4x', 'x^2/3', 'x^(1/3)', '2/(y + 1/2)', 'miles/hour', 'Simplify 2/6.']) assert.equal(shown(value), stackDivisions(value), value);
});

test('grading reads unicode radicals exactly as before', () => {
  // answerEquivalence's canonicalizeDivisions does not ask for unicodeMath;
  // the radical-form grader parses these keys itself (2√3/3 is (2√3)/3 there).
  const graded = (value) => stackDivisions(value, { skipAsciiCalls: false, constantOperands: true });
  assert.equal(graded('√3/3'), '√\\frac{3}{3}');
  assert.equal(graded('5/x²'), '\\frac{5}{x}²');
  assert.equal(graded('1/√3'), '1/√3');
});

// On screen a function's call is one operand with its name, and a power after
// a bracketed denominator is the denominator's. MathDisplay drew A2.5D's
// exact answer ln(3)/ln(2) as ln·(3/l)·n(2), log_2(8)/3 as log base 2 of 8/3,
// 1/f(x) as (1/f)·(x), and A2.6K's a/(x − h)^2 as the whole fraction squared.
test('on screen, a call keeps its name and a bracketed denominator its power', () => {
  const shown = (value) => stackDivisions(value, { unicodeMath: true });
  assert.equal(shown('ln(3)/ln(2)'), '\\frac{ln(3)}{ln(2)}');
  assert.equal(shown('x = ln(5)/ln(1.04)'), 'x = \\frac{ln(5)}{ln(1.04)}');
  assert.equal(shown('2/ln(2)'), '\\frac{2}{ln(2)}');
  assert.equal(shown('log_2(8)/3'), '\\frac{log_2(8)}{3}', 'not log base 2 of 8/3');
  assert.equal(shown('log(100)/log(10)'), '\\frac{log(100)}{log(10)}');
  assert.equal(shown('sin(x)/cos(x)'), '\\frac{sin(x)}{cos(x)}');
  assert.equal(shown('\\ln(3)/2'), '\\frac{\\ln(3)}{2}', 'the LaTeX command too');
  assert.equal(shown('2/\\ln\\left(3\\right)'), '\\frac{2}{\\ln\\left(3\\right)}');
  assert.equal(shown('ln(2)^2/3'), '\\frac{ln(2)^2}{3}');
  assert.equal(shown('3/ln(2)²'), '\\frac{3}{ln(2)²}');
  // A one-letter function: f(x)/2 and 1/f(x). As a product the letter
  // changes nothing on the left: a(b)/2 is a·b/2 either way.
  assert.equal(shown('g(x)=1/f(x)'), 'g(x)=\\frac{1}{f(x)}');
  assert.equal(shown('y(4)/y(1)=b^3'), '\\frac{y(4)}{y(1)}=b^3');
  assert.equal(shown('f(x)/g(x)'), '\\frac{f(x)}{g(x)}');
  assert.equal(shown('x(x-3)/(x-3)=x.'), '\\frac{x(x-3)}{x-3}=x.');
  // A bracketed denominator takes the power written after it.
  assert.equal(shown('For every allowed x, 3/(x-(2))^2 is positive.'), 'For every allowed x, \\frac{3}{(x-(2))^2} is positive.');
  assert.equal(shown('1/(3x^3)^(3/3)'), '\\frac{1}{(3x^3)^(\\frac{3}{3})}');
  assert.equal(shown('3/(x+1)²'), '\\frac{3}{(x+1)²}');
  // A power this cannot read leaves the slash as written, never half-stacked.
  assert.equal(shown('3/(x+1)^-2'), '3/(x+1)^-2');
  assert.equal(shown('3/(x+1)^n'), '3/(x+1)^n');
  // Not a call: a name inside a word, a longer word, a bracket after a bracket.
  assert.equal(shown('kiln(3)/2'), 'kiln\\frac{3}{2}');
  assert.equal(shown('cosine(x)/2'), 'cosine\\frac{x}{2}');
  assert.equal(shown('(x+1)(x-1)/2'), '(x+1)\\frac{x-1}{2}');
  assert.equal(shown('3/4x'), '\\frac{3}{4}x', 'the slope stays 3/4');
});

test('grading reads calls and bracketed powers exactly as before', () => {
  // Grading has its own call names (ln and log, TS05) and reads the rest as
  // it always did; changing a grading reading needs a verdict sweep.
  const graded = (value) => stackDivisions(value, { skipAsciiCalls: false, constantOperands: true });
  assert.equal(graded('ln(3)/ln(2)'), '\\frac{ln(3)}{ln(2)}');
  assert.equal(graded('sin(x)/cos(x)'), 'sin\\frac{x}{c}os(x)');
  assert.equal(graded('1/f(x)'), '\\frac{1}{f}(x)');
  assert.equal(graded('3/(x+1)^2'), '\\frac{3}{x+1}^2');
  assert.equal(stackDivisions('3/(x+1)^2'), '\\frac{3}{x+1}^2', 'and so does the plain reading');
});

