import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  sameCommutativeModelEquation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

const require = createRequire(import.meta.url);
const { gradeResponse, privateGradingDefinition } = require('../../functions/lib/mathPath.js');

test('structured model equation accepts top-level additive reordering and side reversal', () => {
  assert.equal(sameCommutativeModelEquation('1/4+1/6=1/t', '1/6+1/4=1/t'), true);
  assert.equal(sameCommutativeModelEquation('d/(v+c)+d/(v-c)=T', 'T=d/(v-c)+d/(v+c)'), true);
});

test('structured model equation rejects changed rational structure', () => {
  assert.equal(sameCommutativeModelEquation('1/4+1/6=1/t', '1/4+1/7=1/t'), false);
  assert.equal(sameCommutativeModelEquation('d/(v+c)+d/(v-c)=T', 'd/(v+c)+d/(v+c)=T'), false);
});

test('generic sameValue remains unchanged for modeling equations', () => {
  assert.equal(sameValue('1/4+1/6=1/t', '1/6+1/4=1/t'), false);
});

test('private grading opts model fields into commutative model-equation equivalence', async () => {
  const grading = privateGradingDefinition({
    responseFields: [{
      id:'model',
      inputProfile:'equation',
      equivalence:'modelEquation',
      expected:'1/4+1/6=1/t',
    }],
  });
  assert.equal(grading.fields[0].equivalence, 'modelEquation');

  const reordered = await gradeResponse(grading, { responses:{model:'1/6+1/4=1/t'} });
  assert.equal(reordered.isCorrect, true);

  const reversed = await gradeResponse(grading, { responses:{model:'1/t=1/6+1/4'} });
  assert.equal(reversed.isCorrect, true);

  const wrong = await gradeResponse(grading, { responses:{model:'1/4+1/7=1/t'} });
  assert.equal(wrong.isCorrect, false);
});
