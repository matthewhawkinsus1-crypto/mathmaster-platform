import test from 'node:test';
import assert from 'node:assert/strict';

import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';

const rollerCoaster = {
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

const thermos = {
  type: 'relationshipModel',
  scenario: 'Eduardo has a thermos that can hold 18 ounces of water. The thermos develops a leak and loses water at a rate of 1 ounce every 2 minutes until it is empty. Identify the independent and dependent quantities, then state the domain and range of the situation using inequalities.',
  quantities: [
    { id: 'time', label: 'Time leaking (minutes)' },
    { id: 'waterRemaining', label: 'Water remaining (ounces)' },
  ],
  correctIndependentId: 'time',
  correctDependentId: 'waterRemaining',
  prompt: 'Eduardo has a thermos that can hold 18 ounces of water. The thermos develops a leak and loses water at a rate of 1 ounce every 2 minutes until it is empty. Identify the independent and dependent quantities, then state the domain and range of the situation using inequalities.',
  activityRole: 'practice',
  studentActions: ['identifyQuantities', 'stateDomain', 'stateRange'],
  standard: 'A.2A',
  recipe: {
    name: 'functionModeling',
    ask: ['quantities', 'domainInequality', 'rangeInequality'],
  },
  correctDomainInequality: ['0 ≤ x ≤ 36', '0<=x<=36'],
  correctRangeInequality: ['0 ≤ y ≤ 18', '0<=y<=18'],
  notation: 'inequality',
  sectionId: 'section-3',
  sectionTitle: 'Practice',
  questionId: '769269b0-cf08-40df-9f54-83d8498d051d',
  teacherExcluded: false,
  alignments: [{ framework: 'teks', code: 'A.2A', role: 'primary', evidenceLevel: 'assessed' }],
};

test('live roller-coaster recipe already renders every authored domain/range stage', () => {
  const composed = readComposedQuestion(rollerCoaster);
  assert.equal(composed.composed, true);
  assert.deepEqual(
    composed.workflow.map((stage) => [stage.id, stage.kind]),
    [
      ['quantities', 'quantityRoles'],
      ['domainInequality', 'domainInput'],
      ['domainWords', 'shortResponse'],
      ['rangeInequality', 'rangeInput'],
      ['rangeWords', 'shortResponse'],
    ],
  );
  assert.deepEqual(Object.keys(composed.grading), [
    'quantities',
    'domainWords',
    'domainInequality',
    'rangeWords',
    'rangeInequality',
  ]);
});

test('controlled-choice repair changes only the two wording-stage renderers and keeps stage IDs', () => {
  const repaired = {
    ...rollerCoaster,
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
  const composed = readComposedQuestion(repaired);
  assert.deepEqual(
    composed.workflow.map((stage) => [stage.id, stage.kind]),
    [
      ['quantities', 'quantityRoles'],
      ['domainInequality', 'domainInput'],
      ['domainWords', 'multipleChoice'],
      ['rangeInequality', 'rangeInput'],
      ['rangeWords', 'multipleChoice'],
    ],
  );

  const result = gradeWorkflow({
    stages: composed.workflow,
    grading: composed.grading,
    responses: {
      quantities: { independent: 'time', dependent: 'speed' },
      domainInequality: '0<=x<=3',
      domainWords: 'time from 0 through 3 minutes',
      rangeInequality: '0<=y<=75',
      rangeWords: 'speed from 0 through 75 miles per hour',
    },
  });
  assert.equal(result.isComplete, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.partialCreditPercent, 100);
});

test('thermos recipe renders and grades its inequality-only task without any rewrite', () => {
  const composed = readComposedQuestion(thermos);
  assert.deepEqual(
    composed.workflow.map((stage) => [stage.id, stage.kind]),
    [
      ['quantities', 'quantityRoles'],
      ['domainInequality', 'domainInput'],
      ['rangeInequality', 'rangeInput'],
    ],
  );
  const result = gradeWorkflow({
    stages: composed.workflow,
    grading: composed.grading,
    responses: {
      quantities: { independent: 'time', dependent: 'waterRemaining' },
      domainInequality: '0<=x<=36',
      rangeInequality: '0<=y<=18',
    },
  });
  assert.equal(result.isCorrect, true);
  assert.equal(result.partialCreditPercent, 100);
});


test('V5 persistence preserves controlled wording choices on a live relationship-model question', () => {
  const repaired = {
    ...rollerCoaster,
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
  const v5 = storedAssignmentToV5({
    id: 'live-assignment',
    title: 'Module 1 Topic 1 Review — Quantities and Relationships',
    courseId: 'algebra1',
    sections: [
      { id: 'section-3', role: 'practice', title: 'Practice', questions: [repaired] },
    ],
  });
  const saved = v5.sections[0].questions[0];
  assert.deepEqual(saved.domainWordsChoices, repaired.domainWordsChoices);
  assert.deepEqual(saved.rangeWordsChoices, repaired.rangeWordsChoices);
});
