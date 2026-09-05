import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  liveChallengeResponseReadiness,
  matchesQuestionStyle,
} from '../../functions/shared/liveChallenge.mjs';

const fieldQuestion = (overrides = {}) => ({
  id: 'question-1',
  prompt: 'Solve.',
  responseFields: [
    { id: 'answer', label: 'Answer', inputProfile: 'expression' },
  ],
  ...overrides,
});

test('radical and symbolic expression responses are eligible math input', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    prompt: 'Rationalize the denominator of $1/\\sqrt{6}$.',
    responseFields: [{
      id: 'answer',
      label: 'Answer',
      inputProfile: 'expression',
      requiredSymbols: ['sqrt', 'fraction'],
    }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'math');
  assert.match(result.label, /math input/i);
});

test('interval responses remain eligible and keep the platform notation profile', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    responseFields: [{
      id: 'domain',
      label: 'Domain',
      inputProfile: 'interval',
      answerFormat: 'interval',
      requiredSymbols: ['infinity', 'union'],
    }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'math');
  assert.match(result.label, /interval/i);
});

test('finite-choice fields are eligible only when visible choices exist', () => {
  const valid = liveChallengeResponseReadiness(fieldQuestion({
    prompt: 'Which expression is equivalent?',
    responseFields: [{
      id: 'answer',
      label: 'Choose the correct answer',
      inputProfile: 'choice',
      choices: [
        { id: 'choice-a', label: '$x+5$' },
        { id: 'choice-b', label: '$x-5$' },
        { id: 'choice-c', label: '$x+25$' },
        { id: 'choice-d', label: '$x-25$' },
      ],
    }],
  }));

  assert.equal(valid.eligible, true);
  assert.equal(valid.mode, 'choice');
  assert.equal(valid.choiceCount, 4);
  assert.equal(valid.label, 'Multiple choice · 4 choices');

  const invalid = liveChallengeResponseReadiness(fieldQuestion({
    responseFields: [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice' }],
  }));
  assert.equal(invalid.eligible, false);
  assert.equal(invalid.reason, 'choice_field_has_no_choices');
});

test('question-level choices can satisfy a sanitized choice field', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    choices: [
      { id: 'choice-1', label: '5' },
      { id: 'choice-2', label: '14' },
      { id: 'choice-3', label: '19' },
      { id: 'choice-4', label: '20' },
    ],
    responseFields: [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice' }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'choice');
  assert.equal(result.choiceCount, 4);
});

test('choose/select instructions without selectable options fail closed', () => {
  for (const label of ['Choose the correct answer', 'Select the linear factor']) {
    const result = liveChallengeResponseReadiness(fieldQuestion({
      responseFields: [{ id: 'answer', label, inputProfile: 'text' }],
    }));
    assert.equal(result.eligible, false, label);
    assert.equal(result.reason, 'choice_instruction_has_no_choices', label);
  }
});

test('numeric free response remains eligible', () => {
  const result = liveChallengeResponseReadiness(fieldQuestion({
    prompt: 'What is the sum of the solutions?',
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }],
  }));

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'math');
  assert.match(result.label, /number input/i);
});

test('interactive Path tools remain eligible without being downgraded to fields', () => {
  const result = liveChallengeResponseReadiness({
    id: 'tool-question',
    prompt: 'Solve the equation.',
    pathToolId: 'stepAlgebra2',
    responseFields: [],
  });

  assert.equal(result.eligible, true);
  assert.equal(result.mode, 'tool');
  assert.equal(result.label, 'Interactive tool');
});

test('unknown response contracts fail closed before candidate selection', () => {
  const question = fieldQuestion({
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'unsupported-widget' }],
  });
  const readiness = liveChallengeResponseReadiness(question);
  assert.equal(readiness.eligible, false);
  assert.equal(readiness.reason, 'unsupported_response_profile');
  assert.equal(matchesQuestionStyle(question, 'any'), false);
});

test('shared field renderer is wired to MathInput and sanitized runtime choices', () => {
  const source = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeFieldQuestion.jsx', import.meta.url), 'utf8');
  assert.match(source, /import MathInput from ['"]\.\.\/\.\.\/MathInput\.jsx['"]/);
  assert.match(source, /field\?\.choices/);
  assert.match(source, /question\?\.choices/);
  assert.match(source, /<MathInput/);
  assert.match(source, /choice\?\.id/);
  assert.doesNotMatch(source, /choice\.correct|choice\.isCorrect/);
});

test('ChallengeRound delegates field questions to the shared response renderer', () => {
  const source = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  assert.match(source, /LiveChallengeFieldQuestion/);
  assert.match(source, /<LiveChallengeFieldQuestion/);
});
