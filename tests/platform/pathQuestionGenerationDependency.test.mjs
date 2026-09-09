import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generatePathInstance,
} from '../../functions/shared/pathQuestionGeneration.mjs';

const outOfOrderTemplate = {
  id: 'out-of-order-derived',
  type: 'multiAnswer',
  questionId: 'out-of-order-derived',
  prompt: 'At x={{x}}, the first rule gives {{d1}} and the second rule gives {{answer}}.',
  answerFields: [
    { id: 'value', label: 'Value', acceptedAnswers: ['{{answer}}'] },
  ],
  generator: {
    parameters: {
      cut: { type: 'int', min: 2, max: 2 },
      m: { type: 'int', min: 3, max: 3 },
      b: { type: 'int', min: 1, max: 1 },
      p: { type: 'int', min: 4, max: 4 },
      q: { type: 'int', min: 2, max: 2 },
    },
    derived: {
      d3: 'm * cut + b',
      d1: 'm * x + b',
      answer: 'p * x + q',
      d2: 'p * cut + q',
      x: 'cut + 1',
    },
  },
};

test('generic Path/CCMR generation resolves derived values by dependency instead of authored key order', () => {
  const generated = generatePathInstance(outOfOrderTemplate, 'dependency-order-regression');

  assert.equal(generated.reason, null);
  assert.ok(generated.question);
  assert.equal(generated.parameters.x, 3);
  assert.equal(generated.parameters.d1, 10);
  assert.equal(generated.parameters.answer, 14);
  assert.equal(generated.parameters.d2, 10);
  assert.equal(generated.parameters.d3, 7);
  assert.match(generated.question.prompt, /At x=3/);
  assert.deepEqual(generated.question.answerFields[0].acceptedAnswers, ['14']);
});

test('generic generation reports an explicit unknown derived dependency', () => {
  const generated = generatePathInstance({
    ...outOfOrderTemplate,
    id: 'unknown-derived-name',
    generator: {
      ...outOfOrderTemplate.generator,
      derived: {
        answer: 'missingName + 1',
      },
    },
  }, 'unknown-derived-name');

  assert.equal(generated.question, null);
  assert.match(String(generated.reason), /^derived_unknown_dependencies:/);
  assert.match(String(generated.reason), /missingName/);
});

test('generic generation reports a derived dependency cycle instead of retrying until a generic constraint failure', () => {
  const generated = generatePathInstance({
    ...outOfOrderTemplate,
    id: 'derived-cycle',
    generator: {
      ...outOfOrderTemplate.generator,
      derived: {
        a: 'b + 1',
        b: 'a + 1',
      },
    },
  }, 'derived-cycle');

  assert.equal(generated.question, null);
  assert.match(String(generated.reason), /^derived_cycle:/);
  assert.match(String(generated.reason), /a/);
  assert.match(String(generated.reason), /b/);
});
