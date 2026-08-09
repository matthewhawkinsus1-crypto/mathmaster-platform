import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inequalityMatchesIntervals, intervalsToNotation,
  parseInequalityClause, parseInequalityText,
} from '../../src/tools/intervalNumberLine/intervalMath.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';
import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';
import { TOOL_CATALOG } from '../../src/tools/toolCatalog.js';

// ---------------------------------------------------------------------------
// D1 — viewport bounds are not mathematical endpoints
// ---------------------------------------------------------------------------

test('a one-sided inequality parses to a ray, not a segment', () => {
  assert.deepEqual(parseInequalityClause('x < 5'), { min: null, max: 5, minClosed: false, maxClosed: false });
  assert.deepEqual(parseInequalityClause('x ≥ -2'), { min: -2, max: null, minClosed: true, maxClosed: false });
  // Variable on the right reads the same relation from the other side.
  assert.deepEqual(parseInequalityClause('3 < x'), { min: 3, max: null, minClosed: false, maxClosed: false });
  assert.deepEqual(parseInequalityClause('7 ≥ x'), { min: null, max: 7, minClosed: false, maxClosed: true });
});

test('double inequalities parse in either direction', () => {
  assert.deepEqual(parseInequalityClause('-3 ≤ x < 5'), { min: -3, max: 5, minClosed: true, maxClosed: false });
  assert.deepEqual(parseInequalityClause('5 > x ≥ -3'), { min: -3, max: 5, minClosed: true, maxClosed: false });
  // Relations pointing opposite ways are not an interval.
  assert.equal(parseInequalityClause('3 < x > 5'), null);
});

test('two clauses joined by or become a union of rays', () => {
  const parsed = parseInequalityText('x ≤ -4 or x > 2');
  assert.equal(intervalsToNotation(parsed), '(−∞, -4] ∪ (2, ∞)');
});

test('the exact bug: viewport bounds used as endpoints is caught', () => {
  // This is verbatim from the generated assignment.
  const authored = [
    { min: -8, max: -4, minClosed: false, maxClosed: true },
    { min: 2, max: 8, minClosed: false, maxClosed: false },
  ];
  const check = inequalityMatchesIntervals('x ≤ -4 or x > 2', authored);
  assert.equal(check.checked, true);
  assert.equal(check.matches, false);
  assert.equal(check.expected, '(−∞, -4] ∪ (2, ∞)');
  assert.equal(check.actual, '(-8, -4] ∪ (2, 8)');
});

test('the corrected form passes', () => {
  const corrected = [
    { min: null, max: -4, minClosed: false, maxClosed: true },
    { min: 2, max: null, minClosed: false, maxClosed: false },
  ];
  assert.equal(inequalityMatchesIntervals('x ≤ -4 or x > 2', corrected).matches, true);
});

test('an unreadable inequality is never reported as wrong', () => {
  // "cannot check" and "disagrees" must not be confused, or valid items fail.
  const check = inequalityMatchesIntervals('x is somewhere near four', [{ min: 1, max: 2 }]);
  assert.equal(check.checked, false);
  assert.equal(check.matches, true);
});

test('Preflight rejects the mismatched item and explains the viewport rule', () => {
  const question = {
    type: 'intervalNumberLine',
    prompt: 'Graph x ≤ -4 or x > 2 on the number line, then write the compound inequality in interval notation.',
    inequalityText: 'x ≤ -4 or x > 2',
    min: -8,
    max: 8,
    ask: ['graph', 'interval'],
    intervals: [
      { min: -8, max: -4, minClosed: false, maxClosed: true },
      { min: 2, max: 8, minClosed: false, maxClosed: false },
    ],
  };
  const { errors } = validateQuestionSemantics(question, { label: 'Q2' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /viewport only/);
  assert.match(errors[0], /\(−∞, -4\] ∪ \(2, ∞\)/);

  const fixed = {
    ...question,
    intervals: [
      { min: null, max: -4, minClosed: false, maxClosed: true },
      { min: 2, max: null, minClosed: false, maxClosed: false },
    ],
  };
  assert.deepEqual(validateQuestionSemantics(fixed, { label: 'Q2' }).errors, []);
});

test('the bounded question from the same assignment still passes', () => {
  const question = {
    type: 'intervalNumberLine',
    prompt: 'Graph -3 ≤ x < 5 on the number line, then write the inequality in interval notation.',
    inequalityText: '-3 ≤ x < 5',
    min: -8,
    max: 8,
    ask: ['graph', 'interval'],
    intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
  };
  assert.deepEqual(validateQuestionSemantics(question, { label: 'Q1' }).errors, []);
});

test('the contract now shows the ray/union form', () => {
  const entry = QUESTION_TYPE_CATALOG.intervalNumberLine;
  assert.ok(entry.unboundedExample, 'the type needs an unbounded example');
  assert.equal(entry.unboundedExample.intervals[0].min, null);
  assert.ok(entry.notes.some((note) => /display bounds only/i.test(note)));

  const contract = buildAuthoringContract();
  assert.match(contract, /Watch out/);
  assert.match(contract, /rays and unions/i);
});

// ---------------------------------------------------------------------------
// D3 — the mapping diagram is an Algebra II tool too
// ---------------------------------------------------------------------------

test('relationMapping is offered to Algebra II', () => {
  assert.deepEqual(TOOL_CATALOG.relationMapping.courses, ['Algebra I', 'Algebra II']);
});
