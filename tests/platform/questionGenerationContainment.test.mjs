import test from 'node:test';
import assert from 'node:assert/strict';

import { generateQuestion } from '../../src/problemGenerator.js';

const brokenTemplate = {
  id: 'broken-generated-question',
  questionId: 'broken-generated-question',
  type: 'multiAnswer',
  prompt: 'Generated value: {{answer}}',
  answerFields: [{ id: 'answer', label: 'Answer', acceptedAnswers: ['{{answer}}'] }],
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 1 },
    },
    derived: {
      answer: 'unknownValue + n',
    },
  },
};

test('one malformed generated question fails closed without throwing out the assignment player', () => {
  let generated;
  assert.doesNotThrow(() => {
    generated = generateQuestion(brokenTemplate, 'containment-regression');
  });

  assert.equal(generated.type, 'platformQuestionError');
  assert.equal(generated.questionId, 'broken-generated-question');
  assert.equal(generated.platformError?.sourceType, 'multiAnswer');
  assert.match(String(generated.platformError?.reason), /^derived_unknown_dependencies:/);
  assert.equal(generated.generator, undefined, 'the sentinel must not re-enter generation');
  assert.equal(generated.workflow, undefined, 'the sentinel must not route into an authored workflow');
  assert.equal(generated.recipe, undefined, 'the sentinel must not expand a recipe');
});
