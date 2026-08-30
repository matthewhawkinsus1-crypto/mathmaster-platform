import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  sameSetBuilderNotation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

const require = createRequire(import.meta.url);
const {
  gradeResponse,
  privateGradingDefinition,
} = require('../../functions/lib/mathPath.js');

test('set-builder equivalence accepts common MathLive and textbook notation', () => {
  assert.equal(
    sameSetBuilderNotation('{x|x!=3}', String.raw`\\{x\\in\\mathbb{R}\\mid x\\ne 3\\}`),
    true,
  );
  assert.equal(
    sameSetBuilderNotation('{y:y>4}', '{y ∈ ℝ | 4 < y}'),
    true,
  );
});

test('set-builder equivalence treats reordered exclusions as the same set', () => {
  assert.equal(
    sameSetBuilderNotation('{x|x!=-2 and x!=5}', '{x ∈ R : x != 5, x != -2}'),
    true,
  );
});

test('set-builder equivalence rejects changed restrictions', () => {
  assert.equal(sameSetBuilderNotation('{x|x!=3}', '{x|x!=4}'), false);
  assert.equal(sameSetBuilderNotation('{y|y>4}', '{y|y>=4}'), false);
  assert.equal(sameSetBuilderNotation('{x|x!=3}', '{y|y!=3}'), false);
});

test('finite roster sets keep their existing semantics', () => {
  assert.equal(sameValue('{2,5}', '{5,2}'), true);
  assert.equal(sameValue('{2,5}', '{x|x!=3}'), false);
});

test('private grading uses setBuilder equivalence only when explicitly requested', async () => {
  const question = {
    responseFields: [{
      id: 'domain-set',
      inputProfile: 'expression',
      equivalence: 'setBuilder',
      expected: '{x|x!=-2 and x!=5}',
    }],
  };
  const grading = privateGradingDefinition(question);
  assert.equal(grading.fields[0].equivalence, 'setBuilder');

  const equivalent = await gradeResponse(grading, {
    responses: { 'domain-set': String.raw`\\{x\\in\\mathbb{R}\\mid x\\ne 5, x\\ne -2\\}` },
  });
  assert.equal(equivalent.isCorrect, true);

  const wrong = await gradeResponse(grading, {
    responses: { 'domain-set': '{x|x!=-2 and x!=4}' },
  });
  assert.equal(wrong.isCorrect, false);
});
