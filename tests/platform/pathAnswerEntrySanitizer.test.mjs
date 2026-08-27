import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

test('secure Path question preserves keypad metadata but strips expected answers', () => {
  const publicQuestion = mathPath.buildSanitizedQuestion({
    familyId: 'interaction-contract',
    questionType: 'response',
    prompt: 'State the ordered pair.',
    responseFields: [{
      id: 'point',
      label: 'Point',
      inputProfile: 'orderedPair',
      answerFormat: 'orderedPair',
      requiredSymbols: ['(', ',', ')'],
      inputContract: { format: 'orderedPair', requiredSymbols: ['(', ',', ')'] },
      expected: '(2, -5)',
      accepted: ['(2,-5)'],
    }],
  }, {
    questionInstanceId: 'q1',
    attemptsAllowed: 3,
    attemptsUsed: 0,
  });

  const field = publicQuestion.responseFields[0];
  assert.equal(field.inputProfile, 'orderedPair');
  assert.equal(field.answerFormat, 'orderedPair');
  assert.deepEqual(field.requiredSymbols, ['(', ',', ')']);
  assert.deepEqual(field.inputContract, { format: 'orderedPair', requiredSymbols: ['(', ',', ')'] });
  assert.equal('expected' in field, false);
  assert.equal('accepted' in field, false);
  assert.equal(JSON.stringify(publicQuestion).includes('(2, -5)'), false);
});

console.log('pathAnswerEntrySanitizer.test.mjs: all assertions passed');
