import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeResponseEntryRepair,
  repairQuestionRecordForCurrentGrader,
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


const linearRayGraphQuestion = {
  questionId: 'q-linear-ray',
  type: 'graphAnalysis',
  functionSpec: {
    type: 'linear',
    m: -1,
    b: 2,
    domain: { min: -2, minInclusive: true },
  },
  analysisRequests: [
    { id: 'domain', kind: 'domain', notation: 'inequality' },
    { id: 'range', kind: 'range', notation: 'inequality' },
  ],
};

test('grader correction upgrades a mathematically correct reversed inequality to full credit', () => {
  const record = {
    status: 'attempted',
    attemptCount: 1,
    totalAttempts: 1,
    partialCredit: 50,
    bestPartialCredit: 50,
    partGrades: [
      { id: 'domain', label: 'Domain', isComplete: true, isCorrect: true, response: '-2≤x' },
      { id: 'range', label: 'Range', isComplete: true, isCorrect: false, response: '4≥y' },
    ],
  };

  const repaired = repairQuestionRecordForCurrentGrader({
    record,
    question: linearRayGraphQuestion,
    correctedAt: '2026-09-02T15:45:00.000Z',
  });

  assert.equal(repaired.status, 'correct');
  assert.equal(repaired.partialCredit, 100);
  assert.equal(repaired.bestPartialCredit, 100);
  assert.equal(repaired.attemptCount, 1);
  assert.equal(repaired.totalAttempts, 1);
  assert.equal(repaired.partGrades[1].isCorrect, true);
  assert.equal(repaired.partGrades[1].graderCorrectionCredit, true);
  assert.deepEqual(repaired.graderCorrectionHistory.at(-1).upgradedPartIds, ['range']);
});

test('grader correction fixes the exponential 1≤y versus y≥1 case from the live lesson', () => {
  const question = {
    questionId: 'q-exp-ray',
    type: 'graphAnalysis',
    functionSpec: {
      type: 'exponential',
      a: 1,
      base: 2,
      h: 0,
      k: 0,
      domain: { min: 0, minInclusive: true },
    },
    analysisRequests: [
      { id: 'domain', kind: 'domain', notation: 'inequality' },
      { id: 'range', kind: 'range', notation: 'inequality' },
    ],
  };
  const record = {
    status: 'attempted',
    attemptCount: 1,
    totalAttempts: 1,
    partialCredit: 50,
    bestPartialCredit: 50,
    partGrades: [
      { id: 'domain', isComplete: true, isCorrect: true, response: '0≤x' },
      { id: 'range', isComplete: true, isCorrect: false, response: '1≤y' },
    ],
  };

  const repaired = repairQuestionRecordForCurrentGrader({ record, question });
  assert.equal(repaired.status, 'correct');
  assert.equal(repaired.bestPartialCredit, 100);
});

test('grader correction never grants credit to a genuinely wrong inequality', () => {
  const record = {
    status: 'attempted',
    attemptCount: 1,
    totalAttempts: 1,
    partialCredit: 50,
    bestPartialCredit: 50,
    partGrades: [
      { id: 'domain', isComplete: true, isCorrect: true, response: '-2≤x' },
      { id: 'range', isComplete: true, isCorrect: false, response: 'y≥4' },
    ],
  };

  const repaired = repairQuestionRecordForCurrentGrader({
    record,
    question: linearRayGraphQuestion,
  });

  assert.strictEqual(repaired, record);
  assert.equal(repaired.bestPartialCredit, 50);
});

test('grader correction can restore an exhausted student without erasing attempt history', () => {
  const record = {
    status: 'expired',
    attemptCount: 3,
    totalAttempts: 3,
    partialCredit: 0,
    bestPartialCredit: 0,
    partGrades: [
      { id: 'domain', isComplete: true, isCorrect: false, response: 'x>-2' },
      { id: 'range', isComplete: true, isCorrect: false, response: '4≥y' },
    ],
  };

  const repaired = repairQuestionRecordForCurrentGrader({
    record,
    question: linearRayGraphQuestion,
  });

  assert.equal(repaired.status, 'attempted');
  assert.equal(repaired.attemptCount, 2);
  assert.equal(repaired.totalAttempts, 3);
  assert.equal(repaired.partGrades[1].isCorrect, true);
  assert.equal(repaired.graderCorrectionHistory.at(-1).grantedRepairRetry, true);
});


test('safe live repair permits relationship-model wording stages to become controlled choices', () => {
  const before = {
    questionId: 'q-workflow',
    type: 'relationshipModel',
    prompt: 'State domain and range.',
    recipe: { name: 'functionModeling', ask: ['quantities', 'domainWords', 'rangeWords'] },
    quantities: [{ id: 'x', label: 'Time' }, { id: 'y', label: 'Speed' }],
    correctIndependentId: 'x',
    correctDependentId: 'y',
    correctDomainWords: ['time from 0 through 3 minutes', 'all times from 0 to 3 minutes'],
    correctRangeWords: ['speed from 0 through 75 miles per hour', 'all speeds from 0 to 75 miles per hour'],
  };
  const after = {
    ...before,
    domainWordsChoices: [
      'time from 0 through 3 minutes',
      'only the whole-number times 0, 1, 2, and 3 minutes',
      'all times less than or equal to 3 minutes',
    ],
    rangeWordsChoices: [
      'speed from 0 through 75 miles per hour',
      'only the whole-number speeds from 0 to 75 miles per hour',
      'all speeds greater than or equal to 0 miles per hour',
    ],
  };
  const result = analyzeResponseEntryRepair(before, after);
  assert.equal(result.safe, true);
  assert.deepEqual(result.affectedFieldIds, ['domainWords', 'rangeWords']);
});

test('workflow wording repair rejects multiple previously-correct choices', () => {
  const before = {
    questionId: 'q-workflow',
    type: 'relationshipModel',
    prompt: 'State the domain.',
    recipe: { name: 'functionModeling', ask: ['domainWords'] },
    correctDomainWords: ['time from 0 through 3 minutes', 'all times from 0 to 3 minutes'],
  };
  const after = {
    ...before,
    domainWordsChoices: [
      'time from 0 through 3 minutes',
      'all times from 0 to 3 minutes',
      'time is greater than or equal to 0 minutes',
    ],
  };
  const result = analyzeResponseEntryRepair(before, after);
  assert.equal(result.safe, false);
  assert.match(result.reason, /exactly one previously accepted correct wording/i);
});
