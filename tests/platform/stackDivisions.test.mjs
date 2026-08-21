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
