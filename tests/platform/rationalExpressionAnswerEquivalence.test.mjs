import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  sameRationalExpression,
} from '../../functions/shared/answerEquivalence.mjs';

const require = createRequire(import.meta.url);
const {
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

test('rational-expression equivalence accepts harmless scaling and reordered polynomial terms', () => {
  assert.equal(
    sameRationalExpression('(x+1)/(x+2)', '(2*x+2)/(2*x+4)'),
    true,
  );
  assert.equal(
    sameRationalExpression('(x^2+3*x+2)/(x^2-1)', '(2+3*x+x^2)/(-1+x^2)'),
    true,
  );
});

test('rational-expression equivalence accepts factored versus expanded numerator and denominator when degrees match', () => {
  assert.equal(
    sameRationalExpression('((x+1)*(x+3))/((x-2)*(x+4))', '(x^2+4*x+3)/(x^2+2*x-8)'),
    true,
  );
});

test('rational-expression equivalence rejects mathematically changed expressions', () => {
  assert.equal(
    sameRationalExpression('(x+1)/(x+2)', '(x+1)/(x+3)'),
    false,
  );
  assert.equal(
    sameRationalExpression('(x^2+3*x+2)/(x^2-1)', '(x^2+3*x+3)/(x^2-1)'),
    false,
  );
});

test('rational-expression equivalence rejects an extra canceling factor that adds a domain hole', () => {
  assert.equal(
    sameRationalExpression('(x+1)/(x+2)', '((x+1)*(x-5))/((x+2)*(x-5))'),
    false,
  );
});

test('private grading uses rationalExpression equivalence only when explicitly requested', async () => {
  const question = {
    responseFields: [{
      id: 'answer',
      inputProfile: 'expression',
      equivalence: 'rationalExpression',
      expected: '(x^2+4*x+3)/(x^2+2*x-8)',
    }],
  };
  const grading = privateGradingDefinition(question);
  assert.equal(grading.fields[0].equivalence, 'rationalExpression');

  const equivalent = await gradeResponse(grading, {
    responses: { answer: '((x+1)*(x+3))/((x-2)*(x+4))' },
  });
  assert.equal(equivalent.isCorrect, true);

  const extraHole = await gradeResponse(grading, {
    responses: { answer: '((x^2+4*x+3)*(x-5))/((x^2+2*x-8)*(x-5))' },
  });
  assert.equal(extraHole.isCorrect, false);

  const wrong = await gradeResponse(grading, {
    responses: { answer: '(x^2+4*x+4)/(x^2+2*x-8)' },
  });
  assert.equal(wrong.isCorrect, false);
});
