import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeResponseEntryRepair,
  repairQuestionRecordForLiveCorrection,
} from '../../src/platform/assignment/liveQuestionCorrection.js';

const baseQuestion = {
  questionId: 'q-live',
  type: 'multiAnswer',
  prompt: 'State the domain in words and using an inequality.',
  answerFields: [
    {
      id: 'domainInequality',
      label: 'Domain using inequalities',
      acceptedAnswers: ['0 ≤ x ≤ 4', '0<=x<=4'],
      inputProfile: 'inequality',
    },
    {
      id: 'domainWords',
      label: 'Domain in words',
      acceptedAnswers: [
        'all real numbers from 0 through 4',
        'all real numbers greater than or equal to 0 and less than or equal to 4',
      ],
      inputProfile: 'expression',
      answerFormat: 'expression',
      requiredSymbols: ['a', 'l'],
      inputContract: { format: 'expression', requiredSymbols: ['a', 'l'] },
    },
  ],
  graph: { functions: [{ type: 'quadratic', a: -1 }] },
  alignments: [{ framework: 'teks', code: 'A.6A', role: 'primary' }],
};

const repairedQuestion = {
  ...baseQuestion,
  answerFields: [
    baseQuestion.answerFields[0],
    {
      id: 'domainWords',
      label: 'Domain in words',
      type: 'choice',
      inputProfile: 'choice',
      options: [
        'all real numbers from 0 through 4',
        'only the integers 0, 1, 2, 3, and 4',
        'all real numbers less than or equal to 4',
        'all real numbers greater than or equal to 0',
      ],
      answer: 'all real numbers from 0 through 4',
    },
  ],
};

test('safe live repair permits prose-response conversion without changing the task', () => {
  const result = analyzeResponseEntryRepair(baseQuestion, repairedQuestion);
  assert.equal(result.safe, true);
  assert.deepEqual(result.affectedFieldIds, ['domainWords']);
});

test('safe live repair rejects prompt or mathematical task changes', () => {
  const result = analyzeResponseEntryRepair(baseQuestion, {
    ...repairedQuestion,
    prompt: 'A different prompt.',
  });
  assert.equal(result.safe, false);
  assert.match(result.reason, /response-entry fields only/i);
});

test('safe live repair rejects a new answer that was not previously accepted', () => {
  const changed = structuredClone(repairedQuestion);
  changed.answerFields[1].answer = 'only the integers 0, 1, 2, 3, and 4';
  const result = analyzeResponseEntryRepair(baseQuestion, changed);
  assert.equal(result.safe, false);
  assert.match(result.reason, /mathematical meaning/i);
});

test('safe live repair rejects multiple previously-correct phrasings among the choices', () => {
  const changed = structuredClone(repairedQuestion);
  changed.answerFields[1].options[1] = 'all real numbers greater than or equal to 0 and less than or equal to 4';
  const result = analyzeResponseEntryRepair(baseQuestion, changed);
  assert.equal(result.safe, false);
  assert.match(result.reason, /exactly one/i);
});

test('existing bad prose grading is credited without erasing attempt history', () => {
  const record = {
    status: 'attempted',
    attemptCount: 1,
    totalAttempts: 2,
    partialCredit: 50,
    bestPartialCredit: 50,
    partGrades: [
      { id: 'domainInequality', isComplete: true, isCorrect: true, response: '0≤x≤4' },
      { id: 'domainWords', isComplete: true, isCorrect: false, response: '0 to 4 inclusive' },
    ],
  };
  const repaired = repairQuestionRecordForLiveCorrection({
    record,
    question: repairedQuestion,
    affectedFieldIds: ['domainWords'],
    correctedAt: '2026-09-02T12:00:00.000Z',
  });
  assert.equal(repaired.status, 'correct');
  assert.equal(repaired.bestPartialCredit, 100);
  assert.equal(repaired.totalAttempts, 2);
  assert.equal(repaired.partGrades[1].isCorrect, true);
  assert.equal(repaired.liveCorrectionHistory.at(-1).creditedFieldIds[0], 'domainWords');
});

test('expired student gets one fair retry when another part was still wrong', () => {
  const record = {
    status: 'expired',
    attemptCount: 3,
    totalAttempts: 3,
    partialCredit: 50,
    bestPartialCredit: 50,
    partGrades: [
      { id: 'domainInequality', isComplete: true, isCorrect: false, response: '0<x<4' },
      { id: 'domainWords', isComplete: true, isCorrect: false, response: '0 to 4 inclusive' },
    ],
  };
  const repaired = repairQuestionRecordForLiveCorrection({
    record,
    question: repairedQuestion,
    affectedFieldIds: ['domainWords'],
    correctedAt: '2026-09-02T12:00:00.000Z',
  });
  assert.equal(repaired.status, 'attempted');
  assert.equal(repaired.attemptCount, 2);
  assert.equal(repaired.totalAttempts, 3);
  assert.equal(repaired.bestPartialCredit, 50);
  assert.equal(repaired.liveCorrectionHistory.at(-1).grantedRepairRetry, true);
});

test('choice-only repaired question resets the counted attempt slot but preserves historical attempts', () => {
  const choiceOnly = {
    questionId: 'q-choice',
    type: 'multiAnswer',
    answerFields: [
      { id: 'classification', type: 'choice', inputProfile: 'choice', options: ['Function', 'Not a function'], answer: 'Not a function' },
      { id: 'justification', type: 'choice', inputProfile: 'choice', options: ['Repeated input', 'Repeated output'], answer: 'Repeated input' },
    ],
  };
  const record = {
    status: 'attempted',
    attemptCount: 1,
    totalAttempts: 1,
    partialCredit: 50,
    bestPartialCredit: 50,
    partGrades: [
      { id: 'classification', isComplete: true, isCorrect: false, response: 'Function' },
      { id: 'justification', isComplete: true, isCorrect: false, response: 'Words the old grader rejected' },
    ],
  };
  const repaired = repairQuestionRecordForLiveCorrection({
    record,
    question: choiceOnly,
    affectedFieldIds: ['justification'],
    correctedAt: '2026-09-02T12:00:00.000Z',
  });
  assert.equal(repaired.status, 'attempted');
  assert.equal(repaired.attemptCount, 0);
  assert.equal(repaired.totalAttempts, 1);
});
