import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  sameExpandedPolynomialEquation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';
import { gradeResponseField } from '../../src/grading/fieldGrader.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

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


test('A2.4A live screenshot: omitted zero constant is still the same standard-form quadratic', () => {
  const student = 'y=4x^{2}-3x';
  const generatedKey = 'y=4*x^2+(-3)*x+(0)';

  assert.equal(sameExpandedPolynomialEquation(student, generatedKey), true);
  assert.equal(sameValue(student, generatedKey), true);
});

test('secure My Math Path server grader accepts the A2.4A live screenshot answer', async () => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{
      id: 'answer',
      inputProfile: 'equation',
      expected: 'y=4*x^2+(-3)*x+(0)',
    }],
  });

  const result = await mathPath.gradeResponse(grading, {
    responses: { answer: 'y=4x^{2}-3x' },
  });

  assert.equal(result.isCorrect, true);
  assert.deepEqual(result.fieldResults, [{ id: 'answer', isCorrect: true }]);
});
