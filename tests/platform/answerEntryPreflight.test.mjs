import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestionInteractionContracts } from '../../src/platform/interaction/interactionContract.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

test('symbolic multi-answer fields with parentheses, variables and fractions are mobile-enterable without authored keyboard buttons', () => {
  const question = {
    type: 'multiAnswer',
    prompt: 'Write the inverse rule.',
    answerFields: [
      {
        id: 'inverse',
        label: 'Inverse function',
        answer: '(x + 5)/2',
        gradingMode: 'equivalentExpression',
      },
    ],
  };
  const result = validateQuestionInteractionContracts(question, { label: 'Inverse question' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(validateQuestionSemantics(question, { label: 'Inverse question' }).errors, []);
});

test('interval notation is inferred as enterable from the accepted answer itself', () => {
  const result = validateQuestionInteractionContracts({
    type: 'multiAnswer',
    answerFields: [
      { id: 'domain', label: 'Domain', answer: '[-4, ∞)' },
    ],
  });
  assert.deepEqual(result.errors, []);
});

test('unsupported notation blocks Preflight instead of falling through to students', () => {
  const result = validateQuestionInteractionContracts({
    type: 'multiAnswer',
    answerFields: [
      { id: 'angle', label: 'Angle expression', answer: 'θ + 30' },
    ],
  }, { label: 'Angle question' });
  assert.ok(result.errors.some((message) => /θ/.test(message)));
  assert.ok(result.errors.some((message) => /cannot be entered|unsupported/i.test(message)));
});

test('plain text response fields cannot silently carry mathematical notation', () => {
  const result = validateQuestionInteractionContracts({
    responseFields: [
      {
        id: 'domain',
        label: 'Domain',
        inputProfile: 'text',
        answer: 'x ≥ 4',
      },
    ],
  }, { label: 'Domain question' });
  assert.ok(result.errors.some((message) => /plain text response/.test(message)));
  assert.ok(result.errors.some((message) => /≥/.test(message)));
});

test('choice and genuine word response fields remain valid', () => {
  assert.deepEqual(validateQuestionInteractionContracts({
    answerFields: [
      { id: 'kind', type: 'choice', options: ['linear', 'quadratic'], answer: 'linear' },
      { id: 'meaning', type: 'text', answer: 'continuous' },
    ],
  }).errors, []);
});

test('explicit unsupported requiredSymbols are blocking even when the expected answer is hidden', () => {
  const result = validateQuestionInteractionContracts({
    responseFields: [
      {
        id: 'angle',
        label: 'Angle',
        inputProfile: 'expression',
        requiredSymbols: ['θ'],
      },
    ],
  });
  assert.ok(result.errors.some((message) => /unsupported mobile answer symbol/.test(message)));
});

test('native Assignment V5 Preflight carries answer-entry failures into publish blockers', () => {
  const assignment = {
    schemaVersion: 5,
    assignment: {
      title: 'Interaction Preflight',
      courseId: 'algebra2',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [
      {
        id: 'practice',
        role: 'practice',
        title: 'Practice',
        questions: [
          {
            type: 'multiAnswer',
            prompt: 'Enter the requested expression.',
            answerFields: [
              { id: 'angle', label: 'Angle expression', answer: 'θ + 30' },
            ],
            alignments: [
              { framework: 'teks', code: '2A.2A', role: 'primary', evidenceLevel: 'assessed' },
            ],
          },
        ],
      },
    ],
  };
  const model = buildAssignmentV5PreflightModel(assignment);
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((message) => /θ/.test(message)));
});

console.log('answerEntryPreflight.test.mjs: all assertions passed');
