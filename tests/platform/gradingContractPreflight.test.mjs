import test from 'node:test';
import assert from 'node:assert/strict';

import { validateQuestionGradingContracts } from '../../src/platform/grading/gradingContract.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';

test('acceptedAnswers cannot silently override the declared correct answer', () => {
  const question = {
    type: 'multiAnswer',
    prompt: 'Enter the value.',
    answerFields: [{
      id: 'value',
      label: 'Value',
      answer: '4',
      acceptedAnswers: ['5'],
    }],
  };
  const result = validateQuestionGradingContracts(question, { label: 'Conflict question' });
  assert.ok(result.errors.some((message) => /acceptedAnswers list/.test(message)));
  assert.ok(result.errors.some((message) => /could be marked wrong/.test(message)));
});

test('mathematically equivalent accepted formatting does not conflict with the primary key', () => {
  const question = {
    type: 'multiAnswer',
    prompt: 'Enter the fraction.',
    answerFields: [{
      id: 'fraction',
      label: 'Fraction',
      answer: '1/2',
      acceptedAnswers: ['\\frac{1}{2}', '0.5'],
    }],
  };
  const result = validateQuestionGradingContracts(question);
  assert.deepEqual(result.errors, []);
});

test('redundant accepted variants are advisory because equivalence already handles them', () => {
  const question = {
    answerFields: [{
      id: 'fraction',
      label: 'Fraction',
      answer: '1/2',
      acceptedAnswers: ['1/2', '\\frac{1}{2}', '0.5'],
    }],
  };
  const result = validateQuestionGradingContracts(question);
  assert.ok(result.warnings.some((message) => /redundant accepted-answer variants/.test(message)));
});

test('equivalentExpression cannot be used for an equation', () => {
  const question = {
    answerFields: [{
      id: 'rule',
      label: 'Equation',
      answer: 'y=2x+3',
      gradingMode: 'equivalentExpression',
    }],
  };
  const result = validateQuestionGradingContracts(question);
  assert.ok(result.errors.some((message) => /intentionally refuses equations/.test(message)));
});

test('form-specific prompts cannot opt into permissive expression equivalence', () => {
  const question = {
    prompt: 'Factor completely.',
    answerFields: [{
      id: 'factor',
      label: 'Factored form',
      answer: '(x+2)(x+3)',
      gradingMode: 'equivalentExpression',
    }],
  };
  const result = validateQuestionGradingContracts(question);
  assert.ok(result.errors.some((message) => /specific algebraic form/.test(message)));
});

test('generic response fields require a grading key instead of pretending autoGrade false is a runtime bypass', () => {
  const missing = validateQuestionGradingContracts({
    responseFields: [{ id: 'why', label: 'Explain your reasoning', inputProfile: 'text' }],
  });
  assert.ok(missing.errors.some((message) => /no runtime-usable grading key/.test(message)));

  const fakeManual = validateQuestionGradingContracts({
    responseFields: [{
      id: 'why',
      label: 'Explain your reasoning',
      inputProfile: 'text',
      autoGrade: false,
    }],
  });
  assert.ok(fakeManual.errors.some((message) => /no runtime-usable grading key/.test(message)));
});

test('accepted list cannot override expected in secure response fields', () => {
  const result = validateQuestionGradingContracts({
    responseFields: [{
      id: 'answer',
      label: 'Answer',
      inputProfile: 'number',
      expected: '8',
      accepted: ['9'],
    }],
  });
  assert.ok(result.errors.some((message) => /accepted list/.test(message)));
});

test('a choice field must have at least one grading key that matches a displayed option', () => {
  const result = validateQuestionGradingContracts({
    answerFields: [{
      id: 'kind',
      label: 'Function family',
      type: 'choice',
      options: ['linear', 'quadratic'],
      answer: 'exponential',
    }],
  });
  assert.ok(result.errors.some((message) => /every visible option and still be marked wrong/.test(message)));
});

test('regular answerFields keep their canonical key when alternate accepted answers are present', () => {
  const equivalent = validateQuestionGradingContracts({
    answerFields: [{
      id: 'quadratic',
      label: 'Standard form',
      answer: 'y=1*x^2+(-6)*x+(1)',
      acceptedAnswers: ['y=x^{2}-6x+1'],
    }],
  });
  assert.deepEqual(equivalent.errors, []);

  const distinctAlternate = validateQuestionGradingContracts({
    answerFields: [{
      id: 'value',
      label: 'Value',
      answer: '4',
      acceptedAnswers: ['5'],
    }],
  });
  assert.deepEqual(
    distinctAlternate.errors,
    [],
    'acceptedAnswers supplement the canonical answer; they do not replace and invalidate it',
  );
});

test('secure responseFields self-grade the canonical key through gradeResponseField', () => {
  const result = validateQuestionGradingContracts({
    responseFields: [{
      id: 'quadratic',
      label: 'Standard form',
      inputProfile: 'equation',
      expected: 'y=1*x^2+(-6)*x+(1)',
    }],
  });
  assert.deepEqual(result.errors, []);
});

test('unit response self-grade includes the required unit', () => {
  const result = validateQuestionGradingContracts({
    responseFields: [{
      id: 'distance',
      label: 'Distance',
      inputProfile: 'unit',
      expected: 12,
      expectedUnit: 'm',
    }],
  });
  assert.deepEqual(result.errors, []);
});

test('unit response cannot rely on accepted list because the runtime unit grader ignores it', () => {
  const result = validateQuestionGradingContracts({
    responseFields: [{
      id: 'distance',
      label: 'Distance',
      inputProfile: 'unit',
      expectedUnit: 'm',
      accepted: ['12'],
    }],
  });
  assert.ok(result.errors.some((message) => /no runtime-usable grading key/.test(message)));
});

test('negative or nonnumeric tolerances are rejected', () => {
  const result = validateQuestionGradingContracts({
    responseFields: [{
      id: 'answer',
      label: 'Answer',
      expected: '2',
      numericTolerance: -0.01,
      relativeTolerance: 'wide',
    }],
  });
  assert.ok(result.errors.some((message) => /numericTolerance/.test(message)));
  assert.ok(result.errors.some((message) => /relativeTolerance/.test(message)));
});

test('semantic Preflight includes grading-contract failures', () => {
  const question = {
    type: 'multiAnswer',
    prompt: 'Enter the value.',
    answerFields: [{
      id: 'value',
      label: 'Value',
      answer: '4',
      acceptedAnswers: ['5'],
    }],
  };
  const result = validateQuestionSemantics(question, { label: 'Question 1' });
  assert.ok(result.errors.some((message) => /could be marked wrong/.test(message)));
});

test('native Assignment V5 Preflight blocks a stale accepted-answer list', () => {
  const assignment = {
    schemaVersion: 5,
    assignment: {
      title: 'Grading Preflight',
      courseId: 'algebra1',
      instructionalPurpose: 'lesson',
      gradingPurpose: 'practice',
    },
    sections: [{
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{
        type: 'multiAnswer',
        prompt: 'Enter the value.',
        answerFields: [{
          id: 'value',
          label: 'Value',
          answer: '4',
          acceptedAnswers: ['5'],
        }],
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
        ],
      }],
    }],
  };

  const model = buildAssignmentV5PreflightModel(assignment);
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((message) => /could be marked wrong/.test(message)));
});

console.log('gradingContractPreflight.test.mjs: all assertions passed');
