import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choiceAnswerLine, figureMatchAnswerLines, stageReviewLabel } from '../../src/platform/workflow/workflowSolutionLines.js';

// The closed review's step list printed a choice step's key as its id ("a")
// and a sort's key as "[object Object]" (Algebra I M2 T2 L3, under its worked
// steps). These are the lines it prints now.

const SORT = {
  id: 'sort',
  kind: 'figureMatch',
  items: [
    { id: 'p1', text: '(2 × 3) · (3 × 4)' },
    { id: 'p2', text: '(3 × 2) · (3 × 2)' },
  ],
  categories: [
    { id: 'twoByFour', label: 'Defined — the product is 2 × 4' },
    { id: 'undefined', label: 'Not defined' },
  ],
};

test('a sort names each card as the screen does, with its category in words', () => {
  const lines = figureMatchAnswerLines(SORT, { match: { p1: 'twoByFour', p2: 'undefined' } });
  assert.deepEqual(lines, [
    'Card 1 ((2 × 3) · (3 × 4)): Defined — the product is 2 × 4',
    'Card 2 ((3 × 2) · (3 × 2)): Not defined',
  ]);
});

test('a sort of graphs says Figure, and a card with no key is left out', () => {
  const graphs = {
    ...SORT,
    items: [{ id: 'g1', graph: { kind: 'line' } }, { id: 'g2', graph: { kind: 'line' } }],
    categories: [{ id: 'linear', label: 'Linear' }],
  };
  assert.deepEqual(figureMatchAnswerLines(graphs, { match: { g2: 'linear' } }), ['Figure 2: Linear']);
});

test('a sort with no key, or a key that is not a map, says nothing rather than "[object Object]"', () => {
  assert.deepEqual(figureMatchAnswerLines(SORT, undefined), []);
  assert.deepEqual(figureMatchAnswerLines(SORT, { match: ['p1'] }), []);
  assert.deepEqual(figureMatchAnswerLines(SORT, 'twoByFour'), []);
});

test('a choice is named by its words, never its id', () => {
  const stage = { kind: 'multipleChoice', choices: [{ id: 'a', label: 'y = −(1/2)x + 5' }, { id: 'b', label: 'y = 2x − 10' }] };
  assert.equal(choiceAnswerLine(stage, 'a'), 'y = −(1/2)x + 5');
  assert.equal(choiceAnswerLine(stage, 'b'), 'y = 2x − 10');
  // Plain-word choices (a classification step) and an unknown key read as written.
  assert.equal(choiceAnswerLine({ kind: 'classification', choices: ['discrete', 'continuous'] }, 'continuous'), 'continuous');
  assert.equal(choiceAnswerLine(stage, 'z'), 'z');
  assert.equal(choiceAnswerLine(stage, null), '');
});

test('a sort of cards is titled as one; a sort of graphs and other steps keep their title', () => {
  assert.equal(stageReviewLabel(SORT, 'Match each figure to a category'), 'Match each card to a category');
  const graphs = { ...SORT, items: [{ id: 'g1', graph: { kind: 'line' } }] };
  assert.equal(stageReviewLabel(graphs, 'Match each figure to a category'), 'Match each figure to a category');
  assert.equal(stageReviewLabel({ kind: 'multipleChoice' }, 'Choose an answer'), 'Choose an answer');
});

test('the closed review prints these lines for a sort and a choice', () => {
  const review = readFileSync(new URL('../../src/SolutionReview.jsx', import.meta.url), 'utf8');
  assert.match(review, /choiceAnswerLine\(stage, firstRuleValue\(rule\)\)/);
  assert.match(review, /stageReviewLabel\(stage, definition\?\.label\)/);
  assert.match(review, /if \(stage\.kind === 'figureMatch'\) \{\s*const lines = figureMatchAnswerLines\(stage, rule\);/);
  // Any other key that is not a single value gets the general sentence.
  assert.match(review, /typeof value !== 'object'/);
});
