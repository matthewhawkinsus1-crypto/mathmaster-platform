import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_NAMES, expandRecipe, relationIsFunction } from '../../src/platform/workflow/questionRecipes.js';
import { readComposedQuestion, validateGrading, validateWorkflow } from '../../src/platform/workflow/questionWorkflow.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const SHOWER = {
  type: 'relationshipModel',
  prompt: 'Model the situation.',
  scenario: 'A shower head releases 1.8 gallons per minute.',
  quantities: [{ id: 'time', label: 'Minutes' }, { id: 'volume', label: 'Gallons' }],
  correctIndependentId: 'time',
  correctDependentId: 'volume',
  correctEquation: 'f(x)=1.8x',
  continuity: 'continuous',
  recipe: { name: 'functionModeling', ask: ['quantities', 'equation', 'graph', 'domain', 'range', 'continuity'] },
};

const RELATION = {
  type: 'relationMapping',
  prompt: 'Represent this relation.',
  pairs: [[-2, 3], [1, 2], [3, -1], [-4, -3]],
  recipe: { name: 'relationRepresentations', ask: ['mapping', 'domain', 'range', 'isFunction'] },
};

// --- The two public types are configurations, not components ----------------

test('relationshipModel and relationMapping expand from the same primitive set', () => {
  const modelling = expandRecipe(SHOWER);
  const relation = expandRecipe(RELATION);
  assert.deepEqual(modelling.errors, []);
  assert.deepEqual(relation.errors, []);
  assert.deepEqual(modelling.workflow.map((stage) => stage.kind), [
    'quantityRoles', 'equationInput', 'graphConstruction', 'domainInput', 'rangeInput', 'classification',
  ]);
  assert.deepEqual(relation.workflow.map((stage) => stage.kind), [
    'mappingDiagram', 'domainInput', 'rangeInput', 'classification',
  ]);
  // Both compose only from the whitelist, so both validate.
  assert.deepEqual(validateWorkflow(modelling.workflow).errors, []);
  assert.deepEqual(validateWorkflow(relation.workflow).errors, []);
});

test('the ask list is the parameter: one recipe, four shapes', () => {
  const shapes = [
    ['equation', 'table', 'graph', 'domain', 'range', 'continuity'],
    ['equation', 'graph', 'domain', 'range', 'interpretation'],
    ['quantities', 'equation', 'interpretation'],
    ['graph', 'interpretation', 'domain'],
  ];
  const signatures = shapes.map((ask) => {
    const { workflow, errors } = expandRecipe({ ...SHOWER, recipe: { name: 'functionModeling', ask } });
    assert.deepEqual(errors, [], `${ask.join('→')} must expand cleanly`);
    assert.deepEqual(validateWorkflow(workflow).errors, []);
    return workflow.map((stage) => stage.id).join('>');
  });
  assert.equal(new Set(signatures).size, 4, 'none of these is the same question');
});

test('a recipe question reaches the runtime the same way a hand-composed one does', () => {
  const read = readComposedQuestion(SHOWER);
  assert.equal(read.composed, true);
  assert.equal(read.recipe, 'functionModeling');
  assert.equal(read.workflow.length, 6);
  // And an explicitly composed workflow still wins over the recipe.
  const explicit = readComposedQuestion({ ...SHOWER, workflow: [{ kind: 'equationInput' }] });
  assert.equal(explicit.workflow.length, 1);
});

test('the table follows the student\'s own equation whenever both are asked for', () => {
  const withEquation = expandRecipe({ ...SHOWER, recipe: { ask: ['equation', 'table'] } });
  assert.deepEqual(withEquation.workflow[1].source, { fromStage: 'equation' });
  assert.deepEqual(withEquation.grading.table, { consistentWith: 'equation' });

  // No equation stage — there is no student model to follow, so it is not wired.
  const tableOnly = expandRecipe({
    ...SHOWER, tableAnswers: { '0:y': '0' }, recipe: { ask: ['table'] },
  });
  assert.equal(tableOnly.workflow[0].source, undefined);
  assert.deepEqual(tableOnly.grading.table, { values: { '0:y': '0' } });
});

// --- Derived grading: only what the question already says --------------------

test('roles, equation and continuity come from the fields the author already wrote', () => {
  const { grading } = expandRecipe(SHOWER);
  assert.deepEqual(grading.quantities, { independent: 'time', dependent: 'volume' });
  assert.equal(grading.equation, 'f(x)=1.8x');
  assert.equal(grading.continuity, 'continuous');
  // Nothing was invented for the two the author did not state.
  assert.equal(grading.domain, undefined);
  assert.equal(grading.range, undefined);
});

test('a relation\'s domain, range and functionhood are facts about its pairs', () => {
  const { grading, workflow } = expandRecipe(RELATION);
  assert.deepEqual(grading.domain, { set: [-4, -2, 1, 3] });
  assert.deepEqual(grading.range, { set: [-3, -1, 2, 3] });
  assert.equal(grading.isFunction, 'Yes');
  assert.deepEqual(validateGrading(workflow, grading), []);
});

test('a relation that repeats an input is not a function', () => {
  assert.equal(relationIsFunction([[1, 2], [1, 5]]), false);
  assert.equal(relationIsFunction([[1, 2], [1, 2], [3, 4]]), true, 'a repeated PAIR is still a function');
  const { grading } = expandRecipe({ ...RELATION, pairs: [[1, 2], [1, 5], [3, 4]] });
  assert.equal(grading.isFunction, 'No');
});

test('a set answer is marked by its values, not its punctuation', () => {
  const { workflow, grading } = expandRecipe(RELATION);
  const stages = readComposedQuestion({ workflow, grading }).workflow;
  const mark = (domain) => gradeWorkflow({ stages, responses: { domain }, grading })
    .parts.find((part) => part.id === 'domain');

  assert.equal(mark('{-4, -2, 1, 3}').isCorrect, true);
  assert.equal(mark('-4,-2,1,3').isCorrect, true);
  assert.equal(mark('3, 1, -2, -4').isCorrect, true, 'a set has no order');
  assert.equal(mark('-4, -2, 1').isCorrect, false);
  assert.equal(mark('-4, -2, 1, 3, 5').isCorrect, false);
});

test('a hand-written grading rule beats the derived one', () => {
  const { grading } = expandRecipe({ ...RELATION, grading: { isFunction: 'No' } });
  assert.equal(grading.isFunction, 'No');
});

// --- Freedom of arrangement, not of invention --------------------------------

test('an unknown recipe is refused by name', () => {
  const { errors } = expandRecipe({ type: 'relationshipModel', recipe: 'worksheetBuilder' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /worksheetBuilder/);
  assert.match(errors[0], new RegExp(RECIPE_NAMES[0]));
});

test('asking a recipe for a step it does not have is refused', () => {
  const { errors, workflow } = expandRecipe({ ...RELATION, recipe: { name: 'relationRepresentations', ask: ['mapping', 'derivative'] } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"derivative"/);
  assert.equal(workflow.length, 1, 'the steps it does have still build');
});

test('Preflight reports a bad recipe on a real question', () => {
  const { errors } = validateQuestionSemantics(
    { ...SHOWER, recipe: { name: 'functionModeling', ask: ['quantities', 'summonPony'] } },
    { label: 'Q11' },
  );
  assert.ok(errors.some((message) => /summonPony/.test(message)));
});

test('Preflight leaves a good recipe question alone', () => {
  assert.deepEqual(validateQuestionSemantics(SHOWER, { label: 'Q12' }).errors, []);
  assert.deepEqual(validateQuestionSemantics(RELATION, { label: 'Q13' }).errors, []);
});

test('a flat question with no recipe is untouched by this layer', () => {
  const flat = { type: 'relationMapping', prompt: 'Build it.', pairs: [[1, 2]], ask: ['mapping'] };
  assert.equal(readComposedQuestion(flat).composed, false, 'a bare `ask` must not silently switch the renderer');
  assert.deepEqual(validateQuestionSemantics(flat, { label: 'Q14' }).errors, []);
});

test('the renderer is never handed the answer key', () => {
  const read = readComposedQuestion(SHOWER);
  assert.equal(read.content.correctEquation, undefined);
  assert.equal(read.content.correctIndependentId, undefined);
  assert.equal(read.content.continuity, undefined);
  // The scenario and the quantities are what the student is meant to see.
  assert.match(read.content.scenario, /shower head/);
  assert.equal(read.content.quantities.length, 2);
  // And the key is still there for grading.
  assert.equal(read.grading.equation, 'f(x)=1.8x');
});

test('the mapping arrows are marked against the relation, in any order', () => {
  const { workflow, grading } = expandRecipe(RELATION);
  const stages = readComposedQuestion({ workflow, grading }).workflow;
  const mark = (mapping) => gradeWorkflow({ stages, responses: { mapping }, grading })
    .parts.find((part) => part.id === 'mapping');

  assert.equal(mark([[1, 2], [-2, 3], [-4, -3], [3, -1]]).isCorrect, true);
  assert.equal(mark([[1, 2], [-2, 3], [-4, -3]]).isCorrect, false, 'a missing arrow is not the relation');
  assert.equal(mark([[1, 5], [-2, 3], [-4, -3], [3, -1]]).isCorrect, false);
});
