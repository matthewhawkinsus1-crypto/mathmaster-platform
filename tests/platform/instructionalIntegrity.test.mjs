import test from 'node:test';
import assert from 'node:assert/strict';

import { instructionalIntegrityProblems } from '../../src/platform/contract/instructionalIntegrity.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { expandRecipe } from '../../src/platform/workflow/questionRecipes.js';

/*
 * Every rule here is a question that renders perfectly and measures the wrong
 * thing. They are not schema violations — each of these shipped.
 */

const problems = (question) => instructionalIntegrityProblems(question);
const joined = (list) => list.join(' | ');

const continuityChoices = [{ id: 'discrete', label: 'Discrete' }, { id: 'continuous', label: 'Continuous' }];

test('a flat question has no stages to reason about and is left alone', () => {
  assert.deepEqual(problems({ type: 'multipleChoice', prompt: 'Pick one.', choices: ['a', 'b'] }), { errors: [], warnings: [] });
});

test('an unbranched domain box answers the discrete-or-continuous question', () => {
  const { errors } = problems({
    prompt: 'A graph is shown.',
    workflow: [
      { id: 'kind', kind: 'classification', prompt: 'Which is it?', choices: continuityChoices },
      { id: 'domain', kind: 'domainInput', prompt: 'State the domain.', notation: 'set' },
    ],
  });
  assert.match(joined(errors), /gives away the classification/);
  assert.match(joined(errors), /showWhen/);
});

test('a branched domain box does not', () => {
  const { errors } = problems({
    prompt: 'A graph is shown.',
    workflow: [
      { id: 'kind', kind: 'classification', prompt: 'Which is it?', choices: continuityChoices },
      { id: 'dd', kind: 'domainInput', prompt: 'List the domain.', notation: 'set', showWhen: { stage: 'kind', is: 'discrete' } },
      { id: 'dc', kind: 'domainInput', prompt: 'Describe the domain.', notation: 'inequality', showWhen: { stage: 'kind', is: 'continuous' } },
    ],
  });
  assert.deepEqual(errors, []);
});

test('a domain box that fixes no form is not a leak', () => {
  // Nothing about a plain box says which classification it belongs to.
  const { errors } = problems({
    prompt: 'A graph is shown.',
    workflow: [
      { id: 'kind', kind: 'classification', prompt: 'Which is it?', choices: continuityChoices },
      { id: 'domain', kind: 'domainInput', prompt: 'State the domain.' },
    ],
  });
  assert.deepEqual(errors, []);
});

test('the compiler now produces the branched form by itself', () => {
  const expanded = expandRecipe({
    type: 'relationshipModel',
    recipe: { name: 'functionModeling', ask: ['equation', 'table', 'continuity', 'graph', 'domain', 'range'] },
    correctDomain: '{0, 1, 2, ...}',
    correctRange: '{0, 2, 4, ...}',
    continuity: 'discrete',
    notation: 'set',
  }, { label: 'q' });
  const branched = expanded.workflow.filter((stage) => stage.showWhen);
  assert.deepEqual(branched.map((stage) => [stage.id, stage.notation, stage.showWhen.is]), [
    ['domainDiscrete', 'set', 'discrete'],
    ['domainContinuous', 'inequality', 'continuous'],
    ['rangeDiscrete', 'set', 'discrete'],
    ['rangeContinuous', 'inequality', 'continuous'],
  ]);
  // The branch the authored answer belongs to is keyed; the other is not, so a
  // student who classified wrongly is not marked wrong twice for one mistake.
  assert.equal(expanded.grading.domainDiscrete, '{0, 1, 2, ...}');
  assert.equal(expanded.grading.domainContinuous, undefined);
  assert.deepEqual(instructionalIntegrityProblems({ prompt: 'x', workflow: expanded.workflow }).errors, []);
});

test('a continuous key never puts a roster box on the continuous branch', () => {
  // The mirror of the same leak: a `set` notation on the continuous branch
  // would tell that student they had chosen wrongly.
  const expanded = expandRecipe({
    type: 'relationshipModel',
    recipe: { name: 'functionModeling', ask: ['continuity', 'domain'] },
    correctDomain: '0 ≤ x ≤ 4',
    continuity: 'continuous',
    notation: 'set',
  }, { label: 'q' });
  const continuous = expanded.workflow.find((stage) => stage.id === 'domainContinuous');
  assert.equal(continuous.notation, 'inequality');
});

test('writing a feature you were never asked to find is two skills marked as one', () => {
  const { warnings } = problems({
    prompt: 'The graph is shown.',
    workflow: [{ id: 'xv', kind: 'pointInput', feature: 'xIntercept', prompt: 'Write the x-intercept.' }],
  });
  assert.match(joined(warnings), /without first asking them to find it/);

  const staged = problems({
    prompt: 'The graph is shown.',
    workflow: [
      { id: 'x', kind: 'graphFeatureSelect', feature: 'xIntercept', prompt: 'Click it.', graph: {} },
      { id: 'xv', kind: 'pointInput', feature: 'xIntercept', prompt: 'Write it.' },
    ],
  });
  assert.deepEqual(staged.warnings, []);
});

test('the graph-analysis recipe names the feature each written answer belongs to', () => {
  // Without the name, the rule above can never fire on the platform's own
  // output — a rule that only ever passes is not a rule.
  const expanded = expandRecipe({
    type: 'graphAnalysis',
    recipe: 'functionCharacteristics',
    prompt: 'Describe the function.',
    pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
    correctEquation: '-(x - 2)^2 + 9',
    extreme: { kind: 'maximum' },
  }, { label: 'q' });
  const written = expanded.workflow.filter((stage) => stage.kind === 'pointInput');
  assert.ok(written.length >= 3);
  written.forEach((stage) => assert.ok(stage.feature, `${stage.id} does not say which feature it asks for`));
  assert.deepEqual(instructionalIntegrityProblems({ prompt: 'Describe the function.', workflow: expanded.workflow }).warnings, []);
});

test('printing the equation answers a question about reading the graph', () => {
  const { warnings } = problems({
    prompt: 'The graph of f(x) = 2^x is shown. State its domain.',
    workflow: [{ id: 'domain', kind: 'domainInput', prompt: 'State the domain.' }],
  });
  assert.match(joined(warnings), /displays the function's equation/);
});

test('but not when the student is the one building the graph', () => {
  // There the equation is the given the task starts from, not a shortcut past
  // the thing being assessed.
  const { warnings } = problems({
    prompt: 'Graph f(x) = 0.5x + 1 for x ≥ -3, then state the range.',
    workflow: [
      { id: 'table', kind: 'tableInput', prompt: 'Complete the table.' },
      { id: 'graph', kind: 'functionGraph', prompt: 'Graph it.' },
      { id: 'range', kind: 'rangeInput', prompt: 'State the range.' },
    ],
  });
  assert.deepEqual(warnings, []);
});

test('bare figure names as answer choices are a matching task in disguise', () => {
  const { errors } = problems({
    prompt: 'Four graphs are shown.',
    workflow: [{
      id: 'pick',
      kind: 'multipleChoice',
      prompt: 'Which one is exponential?',
      choices: [{ id: 'a', label: 'Graph A' }, { id: 'b', label: 'Graph B' }, { id: 'c', label: 'Graph C' }, { id: 'd', label: 'Graph D' }],
    }],
  });
  assert.match(joined(errors), /bare figure names/);
  assert.match(joined(errors), /figureMatch/);
});

test('real mathematics as answer choices is not a figure name', () => {
  const { errors } = problems({
    prompt: 'A line is shown.',
    workflow: [{
      id: 'pick',
      kind: 'multipleChoice',
      prompt: 'Which equation describes it?',
      choices: [{ id: 'a', label: 'y=2x-1' }, { id: 'b', label: 'y=-x' }, { id: 'c', label: 'x=-2' }],
    }],
  });
  assert.deepEqual(errors, []);
});

test('a stem that states the classification has answered it', () => {
  const { errors } = problems({
    prompt: 'The discrete relation below is graphed.',
    workflow: [{ id: 'k', kind: 'classification', prompt: 'Which is it?', choices: continuityChoices }],
  });
  assert.match(joined(errors), /already calls it that/);
});

test('a stem that names both options is asking, not telling', () => {
  // "classify the relationship as discrete or continuous" is the prompt doing
  // its job. A rule that fires here would be ignored everywhere.
  const { errors } = problems({
    prompt: 'Graph the relationship and classify it as discrete or continuous.',
    workflow: [{ id: 'k', kind: 'classification', prompt: 'Which is it?', choices: continuityChoices }],
  });
  assert.deepEqual(errors, []);
});

test('the rules run as part of ordinary question validation', () => {
  const result = validateQuestionSemantics({
    type: 'relationMapping',
    prompt: 'A graph is shown.',
    workflow: [
      { id: 'kind', kind: 'classification', prompt: 'Which is it?', choices: continuityChoices },
      { id: 'domain', kind: 'domainInput', prompt: 'State the domain.', notation: 'set' },
    ],
  }, { label: 'Question 4' });
  assert.match(joined(result.errors), /^Question 4 step "domain"/);
});
