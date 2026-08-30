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

test('secure My Math Path accepts reordered expanded polynomial expressions', async () => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{
      id: 'answer',
      inputProfile: 'expression',
      expected: '3x^2-2x+5',
    }],
  });

  const result = await mathPath.gradeResponse(grading, {
    responses: { answer: '5+3x^{2}-2x' },
  });

  assert.equal(result.isCorrect, true);
  assert.deepEqual(result.fieldResults, [{ id: 'answer', isCorrect: true }]);
});

test('expanded-expression equivalence does not erase a required factored form', async () => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{
      id: 'answer',
      inputProfile: 'expression',
      expected: '(x+2)(x+3)',
    }],
  });

  const result = await mathPath.gradeResponse(grading, {
    responses: { answer: 'x^2+5x+6' },
  });

  assert.equal(result.isCorrect, false);
  assert.deepEqual(result.fieldResults, [{ id: 'answer', isCorrect: false }]);
});

test('secure Path replaces authored multiple-choice ids with opaque runtime ids and grades those ids', async () => {
  const authored = {
    id: 'choice-security-family',
    familyId: 'mathmaster:A.4B:choice-security',
    prompt: 'Which conclusion is justified by the study?',
    choices: [
      { id: 'opt-1', label: 'Association only' },
      { id: 'opt-2', label: 'Causation is proven' },
      { id: 'opt-3', label: 'There is no relationship' },
      { id: 'opt-4', label: 'The variables are identical' },
    ],
    responseFields: [{
      id: 'answer',
      inputProfile: 'choice',
      expected: 'opt-1',
    }],
  };

  const publicQuestion = mathPath.buildSanitizedQuestion(authored, {
    questionInstanceId: 'choice-instance',
    attemptsAllowed: 3,
  });
  const grading = mathPath.privateGradingDefinition(authored);

  assert.equal(publicQuestion.choices.some((choice) => /^opt-/.test(choice.id)), false);
  assert.equal(publicQuestion.choices.every((choice) => /^choice_[0-9a-f]{28}$/.test(choice.id)), true);
  assert.equal(grading.fields[0].expected, publicQuestion.choices[0].id);
  assert.notEqual(grading.fields[0].expected, 'opt-1');

  const correct = await mathPath.gradeResponse(grading, {
    responses: { answer: publicQuestion.choices[0].id },
  });
  assert.equal(correct.isCorrect, true);

  const forgedAuthorId = await mathPath.gradeResponse(grading, {
    responses: { answer: 'opt-1' },
  });
  assert.equal(forgedAuthorId.isCorrect, false, 'the browser cannot answer with a private author id');
});

test('opaque choice ids are deterministic for a replay but differ across concrete generated questions', () => {
  const base = {
    id: 'choice-security-family',
    familyId: 'mathmaster:A.4B:choice-security',
    choices: [
      { id: 'opt-1', label: 'A' },
      { id: 'opt-2', label: 'B' },
    ],
    responseFields: [{ id: 'answer', inputProfile: 'choice', expected: 'opt-1' }],
  };

  const first = mathPath.buildSanitizedQuestion(
    { ...base, prompt: 'Generated question with value 7.' },
    { questionInstanceId: 'one', attemptsAllowed: 3 },
  );
  const replay = mathPath.buildSanitizedQuestion(
    { ...base, prompt: 'Generated question with value 7.' },
    { questionInstanceId: 'one-replay', attemptsAllowed: 3 },
  );
  const different = mathPath.buildSanitizedQuestion(
    { ...base, prompt: 'Generated question with value 11.' },
    { questionInstanceId: 'two', attemptsAllowed: 3 },
  );

  assert.deepEqual(first.choices, replay.choices, 'replaying the same concrete question keeps the same ids');
  assert.notDeepEqual(
    first.choices.map((choice) => choice.id),
    different.choices.map((choice) => choice.id),
    'a different concrete question gets a different public choice namespace',
  );
});

test('field-level choices use the same opaque id mapping as private grading', async () => {
  const authored = {
    id: 'field-choice-security',
    prompt: 'Choose a classification.',
    responseFields: [{
      id: 'classification',
      inputProfile: 'choice',
      choices: [
        { id: 'opt-1', label: 'Function' },
        { id: 'opt-2', label: 'Not a function' },
      ],
      expected: 'opt-2',
    }],
  };

  const publicQuestion = mathPath.buildSanitizedQuestion(authored, {
    questionInstanceId: 'field-choice-instance',
    attemptsAllowed: 3,
  });
  const grading = mathPath.privateGradingDefinition(authored);
  const publicChoices = publicQuestion.responseFields[0].choices;

  assert.equal(publicChoices.some((choice) => choice.id === 'opt-1' || choice.id === 'opt-2'), false);
  assert.equal(grading.fields[0].expected, publicChoices[1].id);

  const result = await mathPath.gradeResponse(grading, {
    responses: { classification: publicChoices[1].id },
  });
  assert.equal(result.isCorrect, true);
});
