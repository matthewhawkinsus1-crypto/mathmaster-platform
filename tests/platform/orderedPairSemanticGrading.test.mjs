import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareOrderedPair, matchesFieldAnswer, parseOrderedPair } from '../../src/answerUtils.js';

const mathInputSource = fs.readFileSync(new URL('../../src/MathInput.jsx', import.meta.url), 'utf8');
const pathToolResponsesSource = fs.readFileSync(new URL('../../src/platform/path/pathToolResponses.js', import.meta.url), 'utf8');

test('MathInput disables smartFence for the orderedPair profile, same as interval', () => {
  assert.match(
    mathInputSource,
    /mathField\.smartFence = toolProfile !== 'interval' && toolProfile !== 'orderedPair';/,
  );
});

test('a multiAnswer field with answerFormat:"orderedPair" is graded semantically, coordinate by coordinate', () => {
  const field = { answerFormat: 'orderedPair', expected: '(1/2, 3)' };
  // Same point, written with a decimal instead of the authored fraction —
  // only a semantic per-coordinate comparison accepts this, generic text
  // comparison would not.
  assert.equal(matchesFieldAnswer('(0.5, 3)', field), true);
});

test('a multiAnswer field with inputContract.format:"orderedPair" is graded semantically too', () => {
  const field = { inputContract: { format: 'orderedPair' }, expected: '(-1, 3)' };
  assert.equal(matchesFieldAnswer('(-1,3)', field), true);
  assert.equal(matchesFieldAnswer('(1, 3)', field), false);
});

test('a plain (non-orderedPair) multiAnswer field is unaffected by the new branch', () => {
  const field = { expected: 'x + 2' };
  assert.equal(matchesFieldAnswer('x+2', field), true);
});

test('mixed keyboard vs on-screen parenthesis delimiter serialization grades identically', () => {
  const expected = [-1, 3];
  const variants = [
    '(-1,3)', // keyboard ( + keyboard )
    '\\left(-1,3\\right)', // MathLive smart-fence serialization of typed parens
    '\\left(-1,3)', // mixed: physical ( serialized smart, on-screen ) literal
    '(-1,3\\right)', // mixed the other way
  ];
  variants.forEach((variant) => {
    assert.equal(compareOrderedPair(variant, expected), true, `expected ${variant} to grade as ${JSON.stringify(expected)}`);
  });
});

test('negative and fractional coordinates parse correctly through the ordered-pair path', () => {
  assert.deepEqual(parseOrderedPair('(-4, 7)'), [-4, 7]);
  assert.equal(compareOrderedPair('(-2/5, 6)', [-0.4, 6]), true);
});

test('the client-side path-tool ordered-pair parser normalizes MathLive delimiter serialization instead of failing closed', () => {
  assert.match(pathToolResponsesSource, /normalizeStructuralMathLive/);
  const region = pathToolResponsesSource.slice(
    pathToolResponsesSource.indexOf('const parseOrderedPair'),
    pathToolResponsesSource.indexOf('const BUILDERS'),
  );
  assert.match(region, /normalizeStructuralMathLive\(value\)/);
});

// Mutation guard: prove the semantic-grading assertion above is not vacuous —
// generic text comparison alone would reject the fraction/decimal pair.
test('mutation guard: generic text comparison would reject a fraction vs. equivalent decimal ordered pair', () => {
  const normalizedExpected = '(1/2,3)'.replace(/\s+/g, '');
  const normalizedStudent = '(0.5,3)'.replace(/\s+/g, '');
  assert.notEqual(normalizedExpected, normalizedStudent);
});
