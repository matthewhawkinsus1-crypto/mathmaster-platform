import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildMobileMathTools } from '../../src/platform/interaction/mobileKeypadPolicy.js';
import { toolProfileForInputProfile } from '../../src/platform/interaction/interactionContract.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

// The shared row every mobile field used to receive, verbatim from MathInput.
const ENTRY = [
  ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].map((label) => ({ label, command: label })),
  { label: '.', command: '.' },
  { label: ',', command: ',' },
  { label: '−', command: '-' },
  { label: '+', command: '+' },
  { label: '=', command: '=' },
];
const BACKSPACE = { label: '⌫', action: 'deleteBackward' };
const labelsFor = (toolProfile, profileKeys = []) => buildMobileMathTools({
  toolProfile, entryKeys: ENTRY, profileKeys, backspaceKey: BACKSPACE,
}).map((tool) => tool.label);

/* ---------- what a numeric answer is routed to ---------- */

test('a number answer is no longer treated as an expression', () => {
  // This mapping was the whole bug: `number: 'expression'` handed the full
  // algebra pad to the most common typed answer in the bank — 891 fields.
  assert.equal(toolProfileForInputProfile('number'), 'number');
  assert.equal(toolProfileForInputProfile('orderedPair'), 'orderedPair');
  // The profiles that genuinely are algebra keep their pads.
  assert.equal(toolProfileForInputProfile('equation'), 'equation');
  assert.equal(toolProfileForInputProfile('expression'), 'expression');
  assert.equal(toolProfileForInputProfile('inequality'), 'inequality');
});

/* ---------- what the numeric pad contains ---------- */

test('a number pad offers nothing that cannot appear in a number', () => {
  const labels = labelsFor('number', [{ label: 'a⁄b', command: '\\frac{#0}{#?}' }]);
  ['=', '+', ',', '(', ')'].forEach((key) => {
    assert.ok(!labels.includes(key), `"${key}" cannot appear in a bare number but was offered`);
  });
  // And it still contains everything one can.
  ['7', '0', '.', '−', 'a⁄b', '⌫'].forEach((key) => {
    assert.ok(labels.includes(key), `a number pad needs "${key}"`);
  });
});

test('an ordered pair keeps its separator', () => {
  // It is the one numeric profile where a comma is part of the answer.
  const labels = labelsFor('orderedPair', []);
  assert.ok(labels.includes(','), 'an ordered pair needs a comma');
  ['=', '+'].forEach((key) => assert.ok(!labels.includes(key), `"${key}" is not part of an ordered pair`));
});

test('the algebra pads are untouched', () => {
  // The trim must not reach the profiles it was never about. Parentheses in
  // particular are foundational for equation entry and were deliberately forced
  // in for every non-numeric profile.
  const equation = labelsFor('equation', []);
  ['(', ')', '=', '+', ','].forEach((key) => {
    assert.ok(equation.includes(key), `the equation pad must still offer "${key}"`);
  });
  const expression = labelsFor('expression', []);
  assert.ok(expression.includes('(') && expression.includes(')'));
});

test('backspace stays last whatever the profile', () => {
  ['number', 'orderedPair', 'equation', 'expression'].forEach((profile) => {
    const labels = labelsFor(profile, []);
    assert.equal(labels[labels.length - 1], '⌫', `${profile} must end with backspace`);
  });
});

/* ---------- the key sets themselves ---------- */

test('the numeric key sets are defined and small', () => {
  const source = read('src/MathInput.jsx');
  assert.match(source, /const NUMBER_KEYS = \[/);
  assert.match(source, /const ORDERED_PAIR_KEYS = \[/);
  assert.match(source, /if \(profile === 'number'\) return withExit\(NUMBER_KEYS\);/);
  assert.match(source, /if \(profile === 'orderedPair'\) return withExit\(ORDERED_PAIR_KEYS\);/);
  // A number pad with a logarithm on it is the thing this test exists to stop.
  const numberBlock = source.slice(source.indexOf('const NUMBER_KEYS'), source.indexOf('const ORDERED_PAIR_KEYS'));
  ['logₐ', 'π', '√', 'x²', '|x|'].forEach((key) => {
    assert.ok(!numberBlock.includes(key), `a number pad must not carry "${key}"`);
  });
});

test('a question that genuinely needs another key can still ask for one', () => {
  // The trim is safe because `requiredSymbols` surfaces its own row, so a
  // numeric question needing something unusual is not stranded.
  const source = read('src/MathInput.jsx');
  assert.match(source, /requiredAnswerSymbols/);
  assert.match(source, /mathmaster-required-answer-keys/);
});
