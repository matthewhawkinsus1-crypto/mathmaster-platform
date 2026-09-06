import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildFigureMatchResponse,
  figureLabel,
  figureMatchProblems,
  isFigureMatchComplete,
  readFigureMatch,
} from '../../src/platform/workflow/figureMatch.js';
import { validateGrading, validateWorkflow } from '../../src/platform/workflow/questionWorkflow.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import { INTERACTION_STAGES } from '../../src/platform/workflow/interactionStages.js';
import { stageFamily } from '../../src/platform/workflow/stageFamilies.js';

/*
 * The bug this whole primitive exists to make unrepeatable: a set of graphs
 * lettered so that the letter gave the answer away — "L" for the linear one,
 * "E" for the exponential. The fix is not a better lint. The author does not
 * get to name a figure, so there is no name left to leak.
 */

const stage = (overrides = {}) => ({
  id: 'sort',
  kind: 'figureMatch',
  prompt: 'Which family does each graph belong to?',
  items: [
    { id: 'k1', graph: { model: '2*x+1' } },
    { id: 'k2', graph: { model: '2^x' } },
    { id: 'k3', graph: { model: '-x+4' } },
    { id: 'k4', graph: { model: '3*2^x' } },
  ],
  categories: [
    { id: 'linear', label: 'Linear' },
    { id: 'exponential', label: 'Exponential' },
  ],
  ...overrides,
});

const key = { k1: 'linear', k2: 'exponential', k3: 'linear', k4: 'exponential' };

const answer = (assignments) => ({
  sort: buildFigureMatchResponse(stage(), assignments),
});

test('a figure is named by where it sits, never by the author', () => {
  assert.equal(figureLabel(0), 'Figure 1');
  assert.equal(figureLabel(3), 'Figure 4');

  const named = stage({
    items: [{ id: 'k1', label: 'L', graph: { model: 'x' } }, { id: 'k2', label: 'E', graph: { model: '2^x' } }],
  });
  const problems = figureMatchProblems(named);
  assert.ok(
    problems.some((problem) => problem.includes('names its own figures')),
    'an authored figure name is rejected outright rather than quietly dropped',
  );
});

test('the renderer has no way to print a figure name or id', () => {
  const source = readFileSync(new URL('../../src/platform/workflow/FigureMatchStage.jsx', import.meta.url), 'utf8');
  // `item.id` is read to key the answer; it must never be rendered.
  assert.doesNotMatch(source, /\{\s*(?:item|figure)\.(?:label|id)\s*\}/, 'an id or authored label reaching the DOM would carry the hint back in');
  assert.doesNotMatch(source, /data-(?:figure-)?id=/, 'nor through an attribute');
  assert.match(source, /figureLabel\(index\)/, 'the position is the name');
});

test('every figure is offered the same categories in the same order', () => {
  const source = readFileSync(new URL('../../src/platform/workflow/FigureMatchStage.jsx', import.meta.url), 'utf8');
  // Chips built from the stage rather than from the item: a per-item chip list
  // would let three options under one graph and four under another say which
  // is which before the student has looked at either.
  assert.match(source, /const categories = matchCategories\(stage\)/);
  assert.doesNotMatch(source, /item\.categories/, 'a per-figure category list would be information');
});

test('a matching stage is a decision, and is registered as one', () => {
  assert.ok(INTERACTION_STAGES.figureMatch, 'the primitive is published');
  assert.equal(INTERACTION_STAGES.figureMatch.produces, 'match');
  assert.equal(stageFamily('figureMatch'), 'decide');
});

test('a well-formed matching stage validates, and a broken one says why', () => {
  assert.deepEqual(validateWorkflow([stage()]).errors, []);

  const errors = validateWorkflow([stage({
    items: [{ id: 'k1', graph: { model: 'x' } }, { id: 'k1', math: 'y=2^x' }, { id: '', graph: {} }],
    categories: [{ id: 'linear', label: 'Linear' }],
  })]).errors.join(' | ');
  assert.match(errors, /at least two categories/);
  assert.match(errors, /same `id`/);
  assert.match(errors, /no `id`/);
});

test('a figure showing nothing, or showing two things, is caught', () => {
  const nothing = figureMatchProblems(stage({ items: [{ id: 'k1' }, { id: 'k2', math: 'y=x' }] }));
  assert.ok(nothing.some((problem) => problem.includes('nothing to show for Figure 1')));

  const both = figureMatchProblems(stage({
    items: [{ id: 'k1', graph: { model: 'x' }, math: 'y=x' }, { id: 'k2', math: 'y=2^x' }],
  }));
  assert.ok(both.some((problem) => problem.includes('more than one thing for Figure 1')));
});

test('an answer key that does not fit the figures it grades is rejected', () => {
  assert.deepEqual(validateGrading([stage()], { sort: { match: key } }), []);

  const errors = validateGrading([stage()], { sort: { match: { k1: 'linear', k9: 'linear', k2: 'quadratic' } } }).join(' | ');
  assert.match(errors, /does not show/, 'a key for a figure nobody sees');
  assert.match(errors, /not one of the categories offered/, 'a category nobody can choose');
  assert.match(errors, /leaves 2 figure\(s\) out/, 'and figures with no answer at all');
});

test('the stage is finished only when every figure has been placed', () => {
  assert.equal(isFigureMatchComplete(stage(), { assignments: { k1: 'linear' } }), false);
  assert.equal(isFigureMatchComplete(stage(), { assignments: key }), true);
  assert.deepEqual(readFigureMatch({ assignments: { k1: 'linear', k2: '  ' } }), { k1: 'linear' });
});

test('matching is marked figure by figure', () => {
  const perfect = gradeWorkflow({ stages: [stage()], responses: answer(key), grading: { sort: { match: key } } });
  assert.equal(perfect.parts[0].isCorrect, true);
  assert.equal(perfect.parts[0].credit, 1);

  const oneWrong = gradeWorkflow({
    stages: [stage()],
    responses: answer({ ...key, k4: 'linear' }),
    grading: { sort: { match: key } },
  });
  assert.equal(oneWrong.parts[0].isCorrect, false);
  assert.equal(oneWrong.parts[0].credit, 0.75, 'three of four is three quarters, not zero');
});

test('feedback never says which figure was wrong', () => {
  const oneWrong = gradeWorkflow({
    stages: [stage()],
    responses: answer({ ...key, k4: 'linear' }),
    grading: { sort: { match: key } },
  });
  const { detail } = oneWrong.parts[0];
  // Naming the wrong figure turns the retry into elimination: with four graphs
  // and two families, "Figure 4 is wrong" IS the answer to Figure 4.
  assert.doesNotMatch(detail, /Figure \d/);
  assert.match(detail, /3 of 4/, 'how many, not which');
});

test('an unfinished match is unanswered, not zero out of four', () => {
  const partial = gradeWorkflow({
    stages: [stage()],
    responses: answer({ k1: 'linear' }),
    grading: { sort: { match: key } },
  });
  assert.equal(partial.parts[0].isComplete, false);
  assert.equal(partial.parts[0].detail, 'Not answered.');
});
