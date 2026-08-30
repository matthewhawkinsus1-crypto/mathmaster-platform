import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  sameAbsoluteValueLinearEquation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

const require = createRequire(import.meta.url);
const {
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

test('absolute-value relation accepts equivalent center-distance equations', () => {
  assert.equal(sameAbsoluteValueLinearEquation('abs(x-5)=3', 'abs(-x+5)=3'), true);
  assert.equal(sameAbsoluteValueLinearEquation('abs(2x-10)=6', 'abs(x-5)=3'), true);
  assert.equal(sameAbsoluteValueLinearEquation('3=abs(x-5)', 'abs(x-5)=3'), true);
});

test('absolute-value relation rejects different modeled solution sets', () => {
  assert.equal(sameAbsoluteValueLinearEquation('abs(x-5)=3', 'abs(x-5)=4'), false);
  assert.equal(sameAbsoluteValueLinearEquation('abs(x-5)=3', 'abs(x+5)=3'), false);
});

test('generic sameValue remains form-sensitive for absolute-value modeling equations', () => {
  assert.equal(sameValue('abs(x-5)=3', 'abs(-x+5)=3'), false);
});

test('private grading uses absolute-value relation only when explicitly requested', async () => {
  const grading = privateGradingDefinition({
    responseFields: [{
      id: 'model',
      inputProfile: 'equation',
      equivalence: 'absoluteLinearRelation',
      expected: 'abs(x-5)=3',
    }],
  });
  assert.equal(grading.fields[0].equivalence, 'absoluteLinearRelation');

  const equivalent = await gradeResponse(grading, {
    responses: { model:'abs(2x-10)=6' },
  });
  assert.equal(equivalent.isCorrect, true);

  const reversed = await gradeResponse(grading, {
    responses: { model:'3=abs(-x+5)' },
  });
  assert.equal(reversed.isCorrect, true);

  const wrong = await gradeResponse(grading, {
    responses: { model:'abs(x-5)=4' },
  });
  assert.equal(wrong.isCorrect, false);
});
