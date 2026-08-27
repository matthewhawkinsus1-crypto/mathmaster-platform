import test from 'node:test';
import assert from 'node:assert/strict';

import {
  globalPreflightIssues,
  groupQuestionPreflightIssues,
  newlyIntroducedPreflightErrors,
  questionIndexFromPreflightMessage,
  replaceQuestionAtFlatIndex,
} from '../../src/platform/preflight/preflightQuestionRepair.js';

const questions = [
  { questionId: 'q1', prompt: 'First' },
  { questionId: 'q2', prompt: 'Second' },
  { questionId: 'q3', prompt: 'Third' },
];

test('question labels map safely to zero-based question indices', () => {
  assert.equal(questionIndexFromPreflightMessage('Question 2 cannot enter parentheses.', 3), 1);
  assert.equal(questionIndexFromPreflightMessage('PDF: Question 3 has too many rows.', 3), 2);
  assert.equal(questionIndexFromPreflightMessage('supportPolicy is invalid.', 3), null);
  assert.equal(questionIndexFromPreflightMessage('Question 9 is invalid.', 3), null);
});

test('question blockers group by target while assignment-level blockers stay global', () => {
  const errors = [
    'Question 2 cannot enter parentheses.',
    'Question 1 is missing an expected answer.',
    'Question 2 worksheet would clip.',
    'supportPolicy is invalid.',
  ];
  const groups = groupQuestionPreflightIssues(errors, questions);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].questionNumber, 1);
  assert.equal(groups[1].questionNumber, 2);
  assert.deepEqual(groups[1].errors, [
    'Question 2 cannot enter parentheses.',
    'Question 2 worksheet would clip.',
  ]);
  assert.deepEqual(globalPreflightIssues(errors, questions), ['supportPolicy is invalid.']);
});

test('replacement uses flattened question order but preserves section placement and identity', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [
      {
        id: 'warm',
        role: 'warmup',
        title: 'Warm-Up',
        questions: [{ questionId: 'q1', prompt: 'First', activityRole: 'warmup' }],
      },
      {
        id: 'practice',
        role: 'practice',
        title: 'Practice',
        questions: [
          { questionId: 'q2', prompt: 'Second', activityRole: 'practice', teacherExcluded: true },
          { questionId: 'q3', prompt: 'Third', activityRole: 'practice' },
        ],
      },
    ],
  };
  const replaced = replaceQuestionAtFlatIndex(assignment, 1, {
    questionId: 'ai-tried-to-change-id',
    type: 'multiAnswer',
    prompt: 'Repaired second',
    activityRole: 'dol',
    teacherExcluded: false,
  });
  const target = replaced.sections[1].questions[0];
  assert.equal(target.prompt, 'Repaired second');
  assert.equal(target.questionId, 'q2');
  assert.equal(target.activityRole, 'practice');
  assert.equal(target.sectionId, 'practice');
  assert.equal(target.teacherExcluded, true);
  assert.equal(replaced.sections[0].questions[0].prompt, 'First');
  assert.equal(replaced.sections[1].questions[1].prompt, 'Third');
});

test('replacement fails closed when requested flat index does not exist', () => {
  assert.throws(
    () => replaceQuestionAtFlatIndex({ sections: [{ questions: [{}] }] }, 4, {}),
    /Question 5 was not found/,
  );
});

test('new blocker comparison allows old unresolved blockers but catches newly introduced ones', () => {
  const before = [
    'Question 1 missing answer.',
    'Question 2 missing graph.',
    'supportPolicy is invalid.',
  ];
  const afterGoodRepair = [
    'Question 2 missing graph.',
    'supportPolicy is invalid.',
  ];
  assert.deepEqual(newlyIntroducedPreflightErrors(before, afterGoodRepair), []);

  const afterBadRepair = [
    'Question 2 missing graph.',
    'supportPolicy is invalid.',
    'Question 1 worksheet would clip.',
  ];
  assert.deepEqual(newlyIntroducedPreflightErrors(before, afterBadRepair), [
    'Question 1 worksheet would clip.',
  ]);
});

console.log('preflightQuestionRepair.test.mjs: all assertions passed');
