import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  isChoiceOnlyQuestion,
  resolveQuestionMaximumAttempts,
  resolveQuestionReplacementAllowed,
} from '../../src/attemptPolicy.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

test('pure assignment choice questions get exactly one attempt', () => {
  const question = {
    type: 'multiAnswer',
    activityRole: 'practice',
    answerFields: [
      { id: 'family', type: 'choice', options: ['linear', 'quadratic', 'exponential', 'absolute'] },
    ],
  };

  assert.equal(isChoiceOnlyQuestion(question), true);
  assert.equal(resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: 3,
    activityPolicy: { attempts: 3 },
  }), 1);
});

test('legacy multiAnswer fields with options still count as rendered multiple choice', () => {
  const question = {
    type: 'multiAnswer',
    answerFields: [
      { id: 'answer', options: ['A', 'B', 'C', 'D'], answer: 'B' },
    ],
  };

  assert.equal(isChoiceOnlyQuestion(question), true);
  assert.equal(resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: 3,
    activityPolicy: { attempts: 3 },
  }), 1);
});

test('mixed choice plus constructed response keeps normal instructional attempts', () => {
  const question = {
    type: 'multiAnswer',
    activityRole: 'classwork',
    answerFields: [
      { id: 'classification', type: 'choice', options: ['function', 'not a function'] },
      { id: 'why', type: 'text' },
    ],
  };

  assert.equal(isChoiceOnlyQuestion(question), false);
  assert.equal(resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: 3,
    activityPolicy: { attempts: 3 },
  }), 3);
});

test('one-attempt choice rule also overrides higher section attempt counts', () => {
  const question = {
    type: 'choice',
    choices: ['A', 'B', 'C', 'D'],
  };

  assert.equal(resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: 5,
    activityPolicy: { attempts: 5 },
  }), 1);
});

test('static choice questions cannot reset the same choices as a fake replacement', () => {
  const question = {
    type: 'multiAnswer',
    answerFields: [
      { id: 'answer', type: 'choice', options: ['A', 'B', 'C', 'D'] },
    ],
  };

  assert.equal(resolveQuestionReplacementAllowed({
    question,
    activityPolicy: { allowReplacement: true },
    canGenerateFresh: false,
  }), false);

  assert.equal(resolveQuestionReplacementAllowed({
    question,
    activityPolicy: { allowReplacement: true },
    canGenerateFresh: true,
  }), true);
});

test('constructed-response questions keep section replacement behavior', () => {
  const question = {
    type: 'multiAnswer',
    answerFields: [
      { id: 'answer', type: 'equation' },
    ],
  };

  assert.equal(resolveQuestionReplacementAllowed({
    question,
    activityPolicy: { allowReplacement: true },
    canGenerateFresh: false,
  }), true);
});

test('legacy choose-a-number-line questions are also one attempt', () => {
  const question = {
    type: 'numberLine',
    choices: [
      { id: 'a', points: [-2] },
      { id: 'b', points: [2] },
      { id: 'c', points: [-2, 2] },
      { id: 'd', points: [] },
    ],
  };

  assert.equal(isChoiceOnlyQuestion(question), true);
  assert.equal(resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: 3,
    activityPolicy: { attempts: 3 },
  }), 1);
});

test('constructed interval number lines keep normal instructional attempts', () => {
  const question = {
    type: 'intervalNumberLine',
    intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
  };

  assert.equal(isChoiceOnlyQuestion(question), false);
  assert.equal(resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: 3,
    activityPolicy: { attempts: 3 },
  }), 3);
});

test('shared attempt resolver recognizes the Path simulator response shape', () => {
  const question = {
    questionType: 'response',
    responseFields: [
      { id: 'answer', inputProfile: 'choice', choices: ['A', 'B', 'C', 'D'] },
    ],
  };

  assert.equal(isChoiceOnlyQuestion(question), true);
  assert.equal(resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: 3,
    activityPolicy: { attempts: 3 },
  }), 1);
});

test('My Math Path recognizes pure field-graded multiple choice', () => {
  const question = {
    questionType: 'response',
    choices: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ],
    responseFields: [
      { id: 'answer', inputProfile: 'choice', expected: 'a' },
    ],
  };

  assert.equal(mathPath.isChoiceOnlyPathQuestion(question), true);
});

test('My Math Path pure choice remains one attempt even when the base policy is three', async () => {
  const question = {
    questionType: 'response',
    choices: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ],
    responseFields: [
      { id: 'answer', inputProfile: 'choice', expected: 'a' },
    ],
  };

  assert.equal(await mathPath.attemptsForQuestion(question, 3, { authorized: ['extraAttempts'] }), 1);
});

test('My Math Path mixed response is not misclassified as pure multiple choice', () => {
  const question = {
    questionType: 'response',
    responseFields: [
      { id: 'classification', inputProfile: 'choice', choices: ['linear', 'quadratic'], expected: 'linear' },
      { id: 'equation', inputProfile: 'equation', expected: 'y=2x+1' },
    ],
  };

  assert.equal(mathPath.isChoiceOnlyPathQuestion(question), false);
});
