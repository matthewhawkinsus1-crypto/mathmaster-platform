import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareSafeLiveRepairPack } from '../../src/platform/assignment/liveRepairPack.js';

const liveRollerCoaster = {
  type: 'relationshipModel',
  scenario: 'Andrew is at an amusement park. The roller coaster ride lasts 3 minutes and reaches a maximum speed of 75 miles per hour. Identify the independent and dependent quantities, then state the domain and range of the situation in words and using inequalities.',
  quantities: [
    { id: 'time', label: 'Time of the ride (minutes)' },
    { id: 'speed', label: 'Speed of the coaster (miles per hour)' },
  ],
  correctIndependentId: 'time',
  correctDependentId: 'speed',
  prompt: 'Andrew is at an amusement park. The roller coaster ride lasts 3 minutes and reaches a maximum speed of 75 miles per hour. Identify the independent and dependent quantities, then state the domain and range of the situation in words and using inequalities.',
  activityRole: 'practice',
  studentActions: ['identifyQuantities', 'stateDomain', 'stateRange'],
  standard: 'A.2A',
  recipe: {
    name: 'functionModeling',
    ask: ['quantities', 'domainInequality', 'domainWords', 'rangeInequality', 'rangeWords'],
  },
  correctDomainWords: [
    'time from 0 through 3 minutes',
    'the time of the ride from 0 through 3 minutes',
    'all times from 0 to 3 minutes',
    'the ride time is between 0 and 3 minutes inclusive',
  ],
  correctDomainInequality: ['0 ≤ x ≤ 3', '0<=x<=3'],
  correctRangeWords: [
    'speed from 0 through 75 miles per hour',
    'the speed of the coaster from 0 through 75 miles per hour',
    'all speeds from 0 to 75 miles per hour',
    'the coaster speed is between 0 and 75 miles per hour inclusive',
  ],
  correctRangeInequality: ['0 ≤ y ≤ 75', '0<=y<=75'],
  notation: 'inequality',
  sectionId: 'section-3',
  sectionTitle: 'Practice',
  questionId: 'de9863e6-a121-4b9a-854a-65c8ffc782c4',
  teacherExcluded: false,
};

const repairedRollerCoaster = {
  ...liveRollerCoaster,
  domainWordsChoices: [
    'time from 0 through 3 minutes',
    'only the whole-number times 0, 1, 2, and 3 minutes',
    'all times less than or equal to 3 minutes',
    'all times greater than or equal to 0 minutes',
  ],
  rangeWordsChoices: [
    'speed from 0 through 75 miles per hour',
    'only the whole-number speeds from 0 through 75 miles per hour',
    'all speeds less than or equal to 75 miles per hour',
    'all speeds greater than or equal to 0 miles per hour',
  ],
};

test('the exact Module 1 V2 roller-coaster repair imports through the real pack validator', () => {
  const prepared = prepareSafeLiveRepairPack({
    pack: {
      kind: 'mathmasterSafeLiveRepairPack',
      replacementQuestions: [{
        questionId: liveRollerCoaster.questionId,
        purpose: 'Replace only the two open-ended domain/range wording workflow stages with controlled choices.',
        question: repairedRollerCoaster,
      }],
    },
    historicalQuestions: [liveRollerCoaster],
    currentQuestions: [structuredClone(liveRollerCoaster)],
  });

  assert.equal(prepared.replacementCount, 1);
  assert.deepEqual(prepared.liveRepairs[0].affectedFieldIds, ['domainWords', 'rangeWords']);
  assert.equal(prepared.questions[0].domainWordsChoices.length, 4);
  assert.equal(prepared.questions[0].rangeWordsChoices.length, 4);
});

test('legacy persisted function-modeling recipe still takes the workflow-safe path when public type is absent', () => {
  const historical = structuredClone(liveRollerCoaster);
  const replacement = structuredClone(repairedRollerCoaster);
  delete historical.type;
  delete replacement.type;

  const prepared = prepareSafeLiveRepairPack({
    pack: {
      kind: 'mathmasterSafeLiveRepairPack',
      replacementQuestions: [{
        questionId: historical.questionId,
        question: replacement,
      }],
    },
    historicalQuestions: [historical],
    currentQuestions: [structuredClone(historical)],
  });

  assert.deepEqual(prepared.liveRepairs[0].affectedFieldIds, ['domainWords', 'rangeWords']);
});
