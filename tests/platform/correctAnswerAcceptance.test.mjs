import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sameExpandedPolynomialEquation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';
import { gradeResponseField } from '../../src/grading/fieldGrader.js';

test('A2.4A screenshot: normal student quadratic equals generated machine key', () => {
  const student = 'y=x^{2}-6x+1';
  const generatedKey = 'y=1*x^2+(-6)*x+(1)';

  assert.equal(sameExpandedPolynomialEquation(student, generatedKey), true);
  assert.equal(sameValue(student, generatedKey), true);
});

test('standard-form equivalence does not accept vertex form just because it expands the same', () => {
  assert.equal(
    sameExpandedPolynomialEquation('y=(x-3)^2-8', 'y=x^2-6x+1'),
    false,
  );
  assert.equal(
    sameValue('y=(x-3)^2-8', 'y=x^2-6x+1'),
    false,
  );
});

test('assignment response-field grading uses the same quadratic acceptance rule', () => {
  const result = gradeResponseField(
    { expected: 'y=1*x^2+(-6)*x+(1)', inputProfile: 'equation' },
    'y=x^{2}-6x+1',
  );
  assert.equal(result.isCorrect, true);
});

test('ordinary expanded polynomial reorderings remain mathematically equal', () => {
  assert.equal(
    sameExpandedPolynomialEquation('y=1-6x+x^2', 'y=x^2-6x+1'),
    true,
  );
});
