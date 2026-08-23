// Weekly goal settings, stored per class.
//
// The pure layer only — the Firestore calls are thin wrappers around these,
// exactly as pathStore's pacing and override normalisation are.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWeeklyGoalsByClass, storedWeeklyGoalForClassContext } from '../../src/platform/path/pathStore.js';
import { CCMR_EXPECTATION, SELECTION_MODE, WEEKLY_GOAL } from '../../src/platform/path/weeklyPathGoal.js';

test('one section\'s week is not another section\'s', () => {
  // The same reason pacing is stored per class: a teacher with an Algebra I
  // period and an Algebra II Honors period must be able to set different weeks,
  // and a setting saved for one must never become the setting for the other.
  const stored = normalizeWeeklyGoalsByClass({
    'class-a': { sessions: 3 },
    'class-b': { sessions: 6, honors: true },
  });
  assert.equal(stored['class-a'].sessions, 3);
  assert.equal(stored['class-b'].sessions, 6);
});

test('a settings document written by an older build still produces a working week', () => {
  // Hand-edited in the console, or left over from a previous schema. It has to
  // degrade to defaults rather than throw: a teacher who configures nothing —
  // or wrongly — still gets a functioning Path for their students.
  const stored = normalizeWeeklyGoalsByClass({
    'class-a': { sessions: 'four', selectionMode: 'magic', ccmrExpectation: 'yes please' },
  });
  assert.equal(stored['class-a'].sessions, WEEKLY_GOAL.REGULAR_DEFAULT);
  assert.equal(stored['class-a'].selectionMode, SELECTION_MODE.AUTOMATIC);
  assert.equal(stored['class-a'].ccmrExpectation, CCMR_EXPECTATION.NONE);
});

test('rubbish at the top level is an empty map, not a crash', () => {
  assert.deepEqual(normalizeWeeklyGoalsByClass(null), {});
  assert.deepEqual(normalizeWeeklyGoalsByClass([1, 2]), {});
  assert.deepEqual(normalizeWeeklyGoalsByClass('nope'), {});
});

test('a blank class id is dropped rather than stored', () => {
  assert.deepEqual(Object.keys(normalizeWeeklyGoalsByClass({ '': { sessions: 4 } })), []);
});

test('honors is honoured per class', () => {
  const stored = normalizeWeeklyGoalsByClass({ 'class-h': { honors: true } });
  assert.equal(stored['class-h'].sessions, WEEKLY_GOAL.HONORS_DEFAULT);
  assert.equal(stored['class-h'].ccmrExpectation, CCMR_EXPECTATION.RECOMMENDED,
    'Honors reaches beyond the course by default');
});

test('classId wins, period is the compatibility fallback', () => {
  const goals = { 'class-1': { sessions: 5 }, '3rd': { sessions: 3 } };
  assert.equal(storedWeeklyGoalForClassContext(goals, { classId: 'class-1', classPeriod: '3rd' }).sessions, 5);
  assert.equal(storedWeeklyGoalForClassContext(goals, { classId: 'unknown', classPeriod: '3rd' }).sessions, 3);
});

test('nothing stored returns null, so "chose the defaults" is distinguishable from "chose nothing"', () => {
  assert.equal(storedWeeklyGoalForClassContext({}, { classId: 'class-1' }), null);
});
