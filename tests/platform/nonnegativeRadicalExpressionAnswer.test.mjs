import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  sameNonnegativeRadicalExpression,
} from '../../functions/shared/answerEquivalence.mjs';

const require = createRequire(import.meta.url);
const {
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

test('nonnegative radical equivalence matches square-root, extracted-factor, and rational-exponent forms', () => {
  assert.equal(sameNonnegativeRadicalExpression('sqrt(x^5)', 'x^2*sqrt(x)'), true);
  assert.equal(sameNonnegativeRadicalExpression('\\sqrt{x^5}', 'x^(5/2)'), true);
  assert.equal(sameNonnegativeRadicalExpression('3*x^2*sqrt(x)', 'sqrt(9*x^5)'), true);
});

test('nonnegative radical equivalence handles indexed odd roots and multiplication order', () => {
  assert.equal(sameNonnegativeRadicalExpression('\\sqrt[3]{x^7}', 'x^2*x^(1/3)'), true);
  assert.equal(sameNonnegativeRadicalExpression('2*sqrt(x)*x^2', 'x^2*2*sqrt(x)'), true);
});

test('nonnegative radical equivalence rejects changed variable powers and coefficients', () => {
  assert.equal(sameNonnegativeRadicalExpression('sqrt(x^5)', 'x*sqrt(x)'), false);
  assert.equal(sameNonnegativeRadicalExpression('3*x^2*sqrt(x)', '2*x^2*sqrt(x)'), false);
});

test('absolute-value semantics are not silently assumed by the nonnegative comparator', () => {
  assert.equal(sameNonnegativeRadicalExpression('sqrt(x^2)', 'x'), true, 'this comparator is explicitly for questions that state x >= 0');
  assert.equal(sameNonnegativeRadicalExpression('sqrt(x^2)', 'abs(x)'), false, 'the unrestricted absolute-value family uses explicit absolute-value grading');
});

test('private grading uses nonnegative radical equivalence only when explicitly requested', async () => {
  const question = {
    responseFields: [{
      id: 'answer',
      inputProfile: 'expression',
      equivalence: 'nonnegativeRadicalExpression',
      expected: '3*x^2*sqrt(x)',
    }],
  };
  const grading = privateGradingDefinition(question);
  assert.equal(grading.fields[0].equivalence, 'nonnegativeRadicalExpression');

  const equivalent = await gradeResponse(grading, { responses: { answer: '\\sqrt{9x^5}' } });
  assert.equal(equivalent.isCorrect, true);

  const wrong = await gradeResponse(grading, { responses: { answer: '3*x*sqrt(x)' } });
  assert.equal(wrong.isCorrect, false);
});
