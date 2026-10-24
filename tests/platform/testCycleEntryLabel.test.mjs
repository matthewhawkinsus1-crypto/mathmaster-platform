/*
 * A3-30 (TC17): Home's button for a Test Cycle opens the Test Cycle CARD, and
 * the card's own button then starts the stage. When both said "Start Review" a
 * student pressed the same label twice. The list's button now says what it does.
 *
 * The behaviour is that the two never carry the same words for the same
 * student, whatever the server's card says: both are asked here for the same
 * Review (not started, then part-way), and the entry label is compared with
 * the card's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TEST_CYCLE_STAGE, resolveTestCycleStage } from '../../functions/shared/testCycleStages.mjs';
import { describeTestCycleForStudent } from '../../src/platform/student/testCycleDiscovery.js';

const POLICY = { mode: 'testCycle', passingScore: 70, retest: { maxRecordedGrade: 70 } };
const assignment = { id: 'unit-3', assessmentPolicy: POLICY, sections: [] };
const questions = [{ activityRole: 'review' }, { activityRole: 'review' }, { activityRole: 'review' }, { activityRole: 'classwork' }];
const attempted = (count) => Object.fromEntries(Array.from({ length: count }, (_, index) => [index, { status: 'attempted', totalAttempts: 1 }]));

// What the student's list says, and what the card says, for the same Review.
const entryAndCard = (answered) => {
  const entry = describeTestCycleForStudent({ assignment, projection: null, questions, tracker: attempted(answered) });
  const card = resolveTestCycleStage({
    policy: POLICY,
    record: { assignmentId: 'unit-3', studentId: 's', test: { examSessionId: 't1', state: 'assigned' } },
    reviewProgress: { total: 3, attempted: answered, complete: answered === 3 },
  });
  return { entry, card };
};

test('TC17: a Review the list opens into the card is not named the same as the card\'s own button', () => {
  for (const answered of [0, 2]) {
    const { entry, card } = entryAndCard(answered);
    assert.equal(entry.key, 'review', `${answered} answered: the list describes a Review`);
    assert.equal(card.stage, TEST_CYCLE_STAGE.REVIEW, `${answered} answered: so does the card`);
    assert.ok(entry.actionLabel && card.actionLabel, 'both have a button');
    assert.notEqual(entry.actionLabel, card.actionLabel, `${answered} answered: pressing "${entry.actionLabel}" must not lead to another "${card.actionLabel}"`);
  }
});

test('TC17: the list\'s Review button still says what it does, and the card still starts or continues', () => {
  assert.equal(entryAndCard(0).entry.actionLabel, 'Open Review');
  assert.equal(entryAndCard(2).entry.actionLabel, 'Open Review');
  assert.equal(entryAndCard(0).card.actionLabel, 'Start Review');
  assert.equal(entryAndCard(2).card.actionLabel, 'Continue Review');
  // How far along the student is still reads on the list (the label chip), not in the button.
  assert.equal(entryAndCard(2).entry.label, 'Review · 2 of 3');
  assert.equal(entryAndCard(2).entry.started, true);
  assert.equal(entryAndCard(0).entry.started, false);
});
