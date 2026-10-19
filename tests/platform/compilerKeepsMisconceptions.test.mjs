import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { missFeedback } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';

// A teacher's `misconceptions` entry — "if they enter -5, say: check the sign"
// — is the only feedback that can name what went wrong. The V5 compiler used
// to drop it (pass-3 HELP-14), so it never reached a student. It now travels
// on every compiled question, where missFeedback reads it.

const MISCONCEPTIONS = [{ match: ['5'], message: 'Check the sign when you move 10 across.' }];

const QUESTIONS = {
  stepAlgebra: { standard: 'A.5A', prompt: 'Solve 2x + 10 = 0.', studentActions: ['solveEquation'], equation: '2x+10=0', answer: '-5' },
  // A function workflow compiles to the `table` renderer.
  table: { standard: 'A.3C', prompt: 'Model the cost.', studentActions: ['writeEquation', 'completeTable'], answerModel: { equation: 'f(x)=2x', tableXValues: [0, 1, 2] } },
  graphing2: { standard: 'A.3C', prompt: 'Graph y = 2x + 1.', studentActions: ['constructLine'], lineIntent: { mode: 'slopeIntercept', m: 2, b: 1 } },
};

const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Authored feedback', courseId: 'algebra1' },
  sections: [{ role: 'practice', questions: Object.values(QUESTIONS).map((question) => ({ ...question, misconceptions: MISCONCEPTIONS })) }],
}).package.sections[0].questions;

test('every compiled question kind keeps its authored misconceptions', () => {
  assert.deepEqual(compiled.map((question) => question.type), Object.keys(QUESTIONS));
  for (const question of compiled) {
    assert.deepEqual(question.misconceptions, MISCONCEPTIONS, question.type);
  }
});

test('the runtime miss feedback shows the authored message for the matching wrong answer', () => {
  const [solve] = compiled;
  const miss = (response) => missFeedback({
    question: solve,
    attemptNumber: 1,
    parts: [{ id: 'answer', response, graded: true, isComplete: true, isCorrect: false }],
  });
  assert.deepEqual(miss('5'), { message: MISCONCEPTIONS[0].message, source: 'authored-misconception' });
  // Keyed to that answer only: another wrong answer gets no authored message.
  assert.equal(miss('7'), null);
});

test('a question with no authored misconceptions compiles without the field', () => {
  const [plain] = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Plain', courseId: 'algebra1' },
    sections: [{ role: 'practice', questions: [QUESTIONS.stepAlgebra] }],
  }).package.sections[0].questions;
  assert.equal('misconceptions' in plain, false);
});
