import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';

const compileQuestion = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Workflow provenance fixture', courseId: 'algebra1' },
  sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: [question] }],
}).package.sections[0].questions[0];

test('compiler-generated function workflow is stamped as recipe expansion provenance', () => {
  const question = compileQuestion({
    questionId: 'generated-workflow',
    prompt: 'Write the equation, complete the table, and graph the relationship.',
    studentActions: ['writeEquation', 'completeTable', 'constructGraph'],
    function: { family: 'linear', m: 2, b: 1 },
    answerModel: { equation: 'y = 2x + 1' },
    table: {
      columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
      rows: [{ x: 0 }, { x: 1 }, { x: 2 }],
    },
  });

  assert.ok(Array.isArray(question.workflow) && question.workflow.length >= 3);
  assert.equal(question.workflowProvenance.source, 'recipeExpansion');
  assert.equal(question.workflowProvenance.generatorVersion, 1);
});

test('explicit multi-stage graph-choice workflow is stamped authored and remains stage-equivalent', () => {
  const authoredWorkflow = [
    {
      id: 'choice',
      kind: 'multipleChoice',
      prompt: 'What is the vertex?',
      choices: [{ id: 'a', label: '(2,-4)' }, { id: 'b', label: '(-2,-4)' }],
    },
    {
      id: 'axis',
      kind: 'multipleChoice',
      prompt: 'What is the axis of symmetry?',
      choices: [{ id: 'c', label: 'x=2' }, { id: 'd', label: 'x=-2' }],
    },
  ];
  const question = compileQuestion({
    questionId: 'authored-workflow',
    type: 'graphChoicePreview',
    prompt: 'Analyze the graph.',
    studentActions: ['readGraph', 'identifyVertex', 'identifyAxisOfSymmetry'],
    workflow: authoredWorkflow,
    grading: { choice: 'a', axis: 'c' },
  });

  assert.equal(question.workflowProvenance.source, 'authored');
  const runtime = readComposedQuestion(question);
  assert.deepEqual(runtime.workflow.map((stage) => stage.id), ['choice', 'axis']);
  assert.deepEqual(runtime.workflow.map((stage) => stage.kind), ['multipleChoice', 'multipleChoice']);
});

test('ambiguous one-stage explicit graph choice is not falsely labeled generated or authored', () => {
  const question = compileQuestion({
    questionId: 'ambiguous-workflow',
    type: 'graphChoicePreview',
    prompt: 'Choose one.',
    studentActions: ['readGraph'],
    workflow: [{
      id: 'choice',
      kind: 'multipleChoice',
      prompt: 'Which is correct?',
      choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    }],
    grading: { choice: 'a' },
  });

  assert.equal(question.workflowProvenance, undefined);
});
