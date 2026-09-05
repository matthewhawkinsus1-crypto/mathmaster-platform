import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateStepPartialCredit,
  emptyQuestionRecord,
  recordQuestionStep,
} from '../../src/attemptPolicy.js';

const recordStep = (record, {
  before,
  after,
  earned = 1,
  possible = 1,
  expectedTotalPoints = 8,
  kind = 'balanced-operation',
  countsAttempt = false,
} = {}) => recordQuestionStep({
  record,
  countsAttempt,
  stepGrade: {
    kind,
    label: kind,
    productive: true,
    accepted: true,
    earned,
    possible,
    equationBefore: before,
    equationAfter: after,
    expectedTotalPoints,
  },
}).record;

test('replaying a previously credited StepByStep state after Undo adds no duplicate credit or attempt', () => {
  let record = emptyQuestionRecord();

  record = recordStep(record, {
    before: '8+p=-2p+3',
    after: '8+p-p=-2p-p+3',
  });
  record = recordStep(record, {
    before: '8+p-p=-2p-p+3',
    after: '8=-3p+3',
  });

  const creditBeforeReplay = record.partialCredit;
  const attemptsBeforeReplay = record.attemptCount;
  const totalAttemptsBeforeReplay = record.totalAttempts;

  record = recordStep(record, {
    before: '8+p=-2p+3',
    after: '8+p-p=-2p-p+3',
  });

  assert.equal(record.partialCredit, creditBeforeReplay);
  assert.equal(record.bestPartialCredit, creditBeforeReplay);
  assert.equal(record.attemptCount, attemptsBeforeReplay);
  assert.equal(record.totalAttempts, totalAttemptsBeforeReplay);

  record = recordStep(record, {
    before: '8=-3p+3',
    after: '5=-3p',
  });

  assert.ok(record.partialCredit > creditBeforeReplay);
  assert.equal(record.attemptCount, attemptsBeforeReplay);
  assert.equal(record.totalAttempts, totalAttemptsBeforeReplay);
  assert.ok(record.partialCredit <= 90);
});

test('equivalent relation-state formatting cannot farm MultiRelation partial credit', () => {
  let record = emptyQuestionRecord();

  record = recordStep(record, {
    before: String.raw`8 + p = -2p + 3`,
    after: String.raw`8 + p - p = -2p - p + 3`,
    kind: 'relation-step',
  });

  const creditBeforeReplay = record.partialCredit;

  record = recordStep(record, {
    before: String.raw`8+p=-2p+3`,
    after: String.raw`8+p-p=−2p-p+3`,
    kind: 'relation-step',
  });

  assert.equal(record.partialCredit, creditBeforeReplay);
  assert.equal(record.attemptCount, 0);
  assert.equal(record.totalAttempts, 0);
});

test('calculateStepPartialCredit ignores repeated visited equationAfter states directly', () => {
  const steps = [
    {
      variantIndex: 0,
      productive: true,
      accepted: true,
      earned: 1,
      possible: 1,
      expectedTotalPoints: 4,
      equationBefore: 'x+2=5',
      equationAfter: 'x+2-2=5-2',
    },
    {
      variantIndex: 0,
      productive: true,
      accepted: true,
      earned: 1,
      possible: 1,
      expectedTotalPoints: 4,
      equationBefore: 'x+2-2=5-2',
      equationAfter: 'x=3',
    },
  ];

  const beforeReplay = calculateStepPartialCredit(steps, 0);
  const afterReplay = calculateStepPartialCredit([
    ...steps,
    {
      ...steps[0],
      equationBefore: 'x+2=5',
      equationAfter: 'x + 2 - 2 = 5 - 2',
    },
  ], 0);

  assert.equal(afterReplay, beforeReplay);
});
