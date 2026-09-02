import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSafeLiveRepairPack,
  prepareSafeLiveRepairPack,
} from '../../src/platform/assignment/liveRepairPack.js';

const historical = {
  questionId: 'q-live',
  type: 'multiAnswer',
  prompt: 'State the domain in words.',
  answerFields: [
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
    },
  ],
};

const repaired = {
  questionId: 'q-live',
  type: 'multiAnswer',
  prompt: 'State the domain in words.',
  answerFields: [
    {
      id: 'domainWords',
      label: 'Domain in words',
      type: 'choice',
      inputProfile: 'choice',
      options: [
        'all real numbers from 0 through 4',
        'only the integers 0, 1, 2, 3, and 4',
        'all real numbers less than or equal to 4',
      ],
      answer: 'all real numbers from 0 through 4',
    },
  ],
};

const pack = {
  kind: 'mathmasterSafeLiveRepairPack',
  replacementQuestions: [
    {
      questionId: 'q-live',
      purpose: 'Replace the broken prose field with a finite choice.',
      question: repaired,
    },
  ],
};

test('repair pack parses only the dedicated MathMaster pack kind', () => {
  assert.equal(parseSafeLiveRepairPack(JSON.stringify(pack)).kind, 'mathmasterSafeLiveRepairPack');
  assert.throws(
    () => parseSafeLiveRepairPack(JSON.stringify({ ...pack, kind: 'assignment' })),
    /not marked as a MathMaster Safe Live Repair Pack/i,
  );
});

test('repair pack applies all replacements by protected question ID and builds live repairs', () => {
  const prepared = prepareSafeLiveRepairPack({
    pack,
    historicalQuestions: [historical],
    currentQuestions: [structuredClone(historical)],
  });
  assert.equal(prepared.replacementCount, 1);
  assert.deepEqual(prepared.questionIds, ['q-live']);
  assert.equal(prepared.questions[0].answerFields[0].type, 'choice');
  assert.deepEqual(prepared.liveRepairs[0].affectedFieldIds, ['domainWords']);
  assert.equal(prepared.liveRepairs[0].questionIndex, 0);
});

test('repair pack rejects the entire import if a replacement changes the protected task', () => {
  const unsafe = structuredClone(pack);
  unsafe.replacementQuestions[0].question.prompt = 'A different task.';
  assert.throws(
    () => prepareSafeLiveRepairPack({
      pack: unsafe,
      historicalQuestions: [historical],
      currentQuestions: [structuredClone(historical)],
    }),
    /failed safe-live validation/i,
  );
});

test('repair pack rejects stale, duplicate, or mismatched question IDs', () => {
  const missing = structuredClone(pack);
  missing.replacementQuestions[0].questionId = 'missing';
  missing.replacementQuestions[0].question.questionId = 'missing';
  assert.throws(
    () => prepareSafeLiveRepairPack({
      pack: missing,
      historicalQuestions: [historical],
      currentQuestions: [structuredClone(historical)],
    }),
    /not present in this assignment/i,
  );

  const duplicate = structuredClone(pack);
  duplicate.replacementQuestions.push(structuredClone(duplicate.replacementQuestions[0]));
  assert.throws(
    () => prepareSafeLiveRepairPack({
      pack: duplicate,
      historicalQuestions: [historical],
      currentQuestions: [structuredClone(historical)],
    }),
    /repeats question ID/i,
  );
});

test('repair pack preserves absence of legacy teacherExcluded property exactly', () => {
  const prepared = prepareSafeLiveRepairPack({
    pack,
    historicalQuestions: [historical],
    currentQuestions: [structuredClone(historical)],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.questions[0], 'teacherExcluded'), false);
});


test('repair packs preserve teacher-owned live question weight', () => {
  const weightedHistorical = { ...historical, questionWeight: 4 };
  const prepared = prepareSafeLiveRepairPack({
    pack,
    historicalQuestions: [weightedHistorical],
    currentQuestions: [structuredClone(weightedHistorical)],
  });
  assert.equal(prepared.questions[0].questionWeight, 4);
});

test('repair packs do not invent a question weight when the live question has none', () => {
  const weightedPack = structuredClone(pack);
  weightedPack.replacementQuestions[0].question.questionWeight = 4;
  const prepared = prepareSafeLiveRepairPack({
    pack: weightedPack,
    historicalQuestions: [historical],
    currentQuestions: [structuredClone(historical)],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.questions[0], 'questionWeight'), false);
});


test('an unsaved editor weight change survives a repair-pack import and can save in the same transaction', () => {
  const current = { ...historical, questionWeight: 4 };
  const prepared = prepareSafeLiveRepairPack({
    pack,
    historicalQuestions: [historical],
    currentQuestions: [current],
  });
  assert.equal(prepared.questions[0].questionWeight, 4);
  assert.equal(prepared.replacementCount, 1);
});
