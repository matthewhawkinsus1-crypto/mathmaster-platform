import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  samePolynomialEquationRelation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

const require = createRequire(import.meta.url);
const {
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

test('opt-in polynomial relation accepts equivalent parabola equations', () => {
  const standard = '(x-3)^2=8(y+2)';
  assert.equal(samePolynomialEquationRelation(standard, '8(y+2)=(x-3)^2'), true);
  assert.equal(samePolynomialEquationRelation(standard, 'y=(x-3)^2/8-2'), true);
  assert.equal(samePolynomialEquationRelation(standard, 'x^2-6x+9=8y+16'), true);
});

test('polynomial relation still rejects a different parabola', () => {
  assert.equal(
    samePolynomialEquationRelation('(x-3)^2=8(y+2)', '(x-3)^2=4(y+2)'),
    false,
  );
  assert.equal(
    samePolynomialEquationRelation('(x-3)^2=8(y+2)', '(y+2)^2=8(x-3)'),
    false,
  );
});

test('generic sameValue remains form-sensitive for unrelated equation fields', () => {
  assert.equal(sameValue('(x-3)^2=8(y+2)', '8(y+2)=(x-3)^2'), false);
});

test('private grading routes only explicitly marked fields through polynomial relation equivalence', async () => {
  const question = {
    responseFields: [{
      id: 'parabola',
      inputProfile: 'equation',
      equivalence: 'polynomialRelation',
      expected: '(x-3)^2=8(y+2)',
    }],
  };
  const grading = privateGradingDefinition(question);
  assert.equal(grading.fields[0].equivalence, 'polynomialRelation');

  const reversed = await gradeResponse(grading, {
    responses: { parabola: '8(y+2)=(x-3)^2' },
  });
  assert.equal(reversed.isCorrect, true);

  const solved = await gradeResponse(grading, {
    responses: { parabola: 'y=(x-3)^2/8-2' },
  });
  assert.equal(solved.isCorrect, true);

  const wrong = await gradeResponse(grading, {
    responses: { parabola: '(x-3)^2=4(y+2)' },
  });
  assert.equal(wrong.isCorrect, false);
});
