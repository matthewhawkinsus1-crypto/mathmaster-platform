import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERACTION_STAGES, STAGE_KINDS, resolveStageKind } from '../../src/platform/workflow/interactionStages.js';
import {
  normalizeWorkflow, readComposedQuestion, resolveStageInput,
  summarizeWorkflowProgress, validateWorkflow,
} from '../../src/platform/workflow/questionWorkflow.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

// The four problems from the architecture note. None is a subset of one
// canonical order, which is the whole reason a fixed sequence was rejected.
const CHOCOLATE = ['equationInput', 'tableInput', 'graphConstruction', 'domainInput', 'rangeInput', 'classification'];
const SHOWER = ['equationInput', 'graphConstruction', 'domainInput', 'rangeInput', 'classification'];
const TAXI = ['quantityRoles', 'equationInput', 'interpretation', 'interpretation'];
const PROJECTILE = ['functionGraph', 'interpretation', 'domainInput'];

test('four differently-shaped problems compose from the same primitives', () => {
  [CHOCOLATE, SHOWER, TAXI, PROJECTILE].forEach((shape) => {
    const stages = normalizeWorkflow(shape.map((kind) => ({ kind })));
    assert.equal(stages.length, shape.length);
    assert.ok(stages.every((entry) => !entry.unknown), `every stage in ${shape.join('→')} must be known`);
  });
  // And none of them is the same sequence.
  const signatures = new Set([CHOCOLATE, SHOWER, TAXI, PROJECTILE].map((shape) => shape.join('>')));
  assert.equal(signatures.size, 4);
});

test('two stages of the same kind get distinct ids', () => {
  // The taxi problem interprets the slope and then the intercept.
  const stages = normalizeWorkflow(TAXI.map((kind) => ({ kind })));
  const ids = stages.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, `ids collided: ${ids.join(', ')}`);
});

test('graphConstruction resolves by mode rather than being a separate primitive', () => {
  assert.equal(resolveStageKind({ kind: 'graphConstruction', graphMode: 'discrete' }), 'coordinatePlot');
  assert.equal(resolveStageKind({ kind: 'graphConstruction', graphMode: 'continuous' }), 'functionGraph');
  assert.equal(resolveStageKind({ kind: 'graphConstruction' }), 'functionGraph');
  // The alias is not a sixteenth entry in the whitelist.
  assert.ok(!STAGE_KINDS.includes('graphConstruction'));
});

// --- The boundary: compose freely, invent nothing ---------------------------

test('an invented stage kind fails Preflight by name', () => {
  const { errors } = validateWorkflow([{ kind: 'equationInput' }, { kind: 'summonPony' }], { label: 'Q1' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /summonPony/);
  assert.match(errors[0], /cannot be invented in JSON/);
});

test('the unknown stage is reported, never silently dropped', () => {
  const stages = normalizeWorkflow([{ kind: 'summonPony' }]);
  assert.equal(stages.length, 1, 'a vanished stage would be worse than an errored one');
  assert.equal(stages[0].unknown, true);
});

test('every whitelisted stage declares what it produces and what it can consume', () => {
  STAGE_KINDS.forEach((kind) => {
    const entry = INTERACTION_STAGES[kind];
    assert.ok(entry.produces, `${kind} must declare an output`);
    assert.ok(Array.isArray(entry.consumes), `${kind} must declare what it accepts`);
    assert.ok(entry.studentAction, `${kind} must say what the student does`);
  });
});

// --- Stage dependencies -----------------------------------------------------

test('a stage may be driven by the student\'s own earlier work', () => {
  const question = {
    content: { scenario: 'Bars cost $2.', equation: 'f(x)=2x' },
    workflow: [
      { kind: 'equationInput' },
      { kind: 'tableInput', xValues: [0, 1, 2], source: { fromStage: 'equation' } },
    ],
  };
  const { workflow } = readComposedQuestion(question);
  assert.deepEqual(validateWorkflow(question.workflow).errors, []);

  // The student wrote the WRONG function. Their table is built from theirs.
  const input = resolveStageInput({
    stage: workflow[1],
    responses: { equation: 'f(x)=x+2' },
    content: question.content,
  });
  assert.equal(input.from, 'student');
  assert.equal(input.value, 'f(x)=x+2');
  assert.notEqual(input.value, question.content.equation,
    'the answer key must not replace the student model mid-question');
});

test('a stage whose source is unanswered is waiting, not broken', () => {
  const { workflow } = readComposedQuestion({
    workflow: [{ kind: 'equationInput' }, { kind: 'tableInput', source: { fromStage: 'equation' } }],
  });
  const input = resolveStageInput({ stage: workflow[1], responses: {}, content: {} });
  assert.equal(input.from, 'pending');
  assert.equal(input.ready, false);
});

test('reading from a later stage is refused', () => {
  const { errors } = validateWorkflow([
    { kind: 'tableInput', source: { fromStage: 'equation' } },
    { kind: 'equationInput' },
  ], { label: 'Q' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /comes later in the workflow/);
});

test('reading from a stage that does not exist is refused', () => {
  const { errors } = validateWorkflow([{ kind: 'tableInput', source: { fromStage: 'nope' } }], { label: 'Q' });
  assert.match(errors[0], /not a stage in this question/);
});

test('a type mismatch between stages is refused', () => {
  const { errors } = validateWorkflow([
    { kind: 'shortResponse', id: 'note' },
    { kind: 'tableInput', source: { fromStage: 'note' } },
  ], { label: 'Q' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /accepts equation but that stage produces text/);
});

// --- The three sections -----------------------------------------------------

test('grading is separated from what the renderer is given', () => {
  const question = {
    content: { scenario: 'Bars cost $2.' },
    workflow: [{ kind: 'equationInput' }],
    grading: { equation: 'f(x)=2x' },
  };
  const read = readComposedQuestion(question);
  assert.equal(read.grading.equation, 'f(x)=2x');
  assert.equal(read.content.equation, undefined,
    'the answer must not be reachable from the section the renderer receives');
});

test('a flat legacy question still reads, and is not treated as composed', () => {
  const legacy = { type: 'relationshipModel', prompt: 'Name the variables.', quantities: [] };
  const read = readComposedQuestion(legacy);
  assert.equal(read.composed, false);
  assert.deepEqual(read.workflow, []);
  assert.equal(read.content.prompt, 'Name the variables.');
  assert.equal(read.grading, null);
});

test('an empty workflow is an error rather than an empty screen', () => {
  assert.match(validateWorkflow([], { label: 'Q' }).errors[0], /empty `workflow`/);
});

// --- Progress and partial credit --------------------------------------------

test('progress is per stage, so partial credit is the norm', () => {
  const { workflow } = readComposedQuestion({ workflow: CHOCOLATE.map((kind) => ({ kind })) });
  const progress = summarizeWorkflowProgress(workflow, { equation: 'f(x)=2x', table: [[0, 0]] });
  assert.equal(progress.total, 6);
  assert.equal(progress.answered, 2);
  assert.equal(progress.complete, false);
  assert.equal(progress.fraction, 0.3333);

  const all = Object.fromEntries(workflow.map((entry) => [entry.id, 'answered']));
  assert.equal(summarizeWorkflowProgress(workflow, all).complete, true);
});

// --- Preflight integration --------------------------------------------------

test('Preflight rejects a broken workflow', () => {
  const question = {
    type: 'relationshipModel',
    prompt: 'Model the situation.',
    scenario: 'A shower head releases 1.8 gallons per minute.',
    quantities: [{ id: 'time', label: 'Minutes' }, { id: 'volume', label: 'Gallons' }],
    correctIndependentId: 'time',
    correctDependentId: 'volume',
    workflow: [{ kind: 'equationInput' }, { kind: 'nonsense' }],
  };
  const { errors } = validateQuestionSemantics(question, { label: 'Q7' });
  assert.ok(errors.some((message) => /nonsense/.test(message)));
});

test('Preflight leaves a valid composed question alone', () => {
  const question = {
    type: 'relationshipModel',
    prompt: 'Model the situation.',
    scenario: 'A shower head releases 1.8 gallons per minute.',
    quantities: [{ id: 'time', label: 'Minutes' }, { id: 'volume', label: 'Gallons' }],
    correctIndependentId: 'time',
    correctDependentId: 'volume',
    workflow: SHOWER.map((kind) => ({ kind, choices: kind === 'classification' ? ['discrete', 'continuous'] : undefined })),
  };
  assert.deepEqual(validateQuestionSemantics(question, { label: 'Q8' }).errors, []);
});

test('a question with no workflow is unaffected by this layer', () => {
  const question = { type: 'algebra', prompt: 'Solve for x.', equationLatex: '3x = 12' };
  assert.deepEqual(validateQuestionSemantics(question, { label: 'Q9' }).errors, []);
});
