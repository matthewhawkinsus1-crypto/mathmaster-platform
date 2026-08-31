import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultAssignmentDateInputs } from '../../src/platform/assignments/assignmentDateDefaults.js';
import { getClassPackUpState, getDOLState } from '../../src/assignmentLifecycle.js';

const mondaySchedule = {
  version: 2,
  periods: {},
  daySchedules: {
    A: {
      periods: {
        'Period 1': { enabled: true, start: '08:00', end: '09:30' },
      },
    },
    B: { periods: {} },
  },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
};

const lessonWithDOL = {
  schemaVersion: 5,
  sections: [{
    id: 'dol',
    role: 'dol',
    title: 'DOL',
    questions: [{
      questionId: 'dol-1',
      activityRole: 'dol',
      prompt: 'Solve x + 2 = 7.',
      type: 'freeResponse',
      expected: '5',
    }],
  }],
  dol: {
    enabled: true,
    minutesBeforeEnd: 10,
    closeMinutesBeforeEnd: 5,
    instructionDate: '2026-08-31',
  },
};

test('new assignment deadlines default to tomorrow 11:59 PM and seven calendar days from creation 11:59 PM', () => {
  const monday = new Date(2026, 7, 31, 12, 0, 0, 0);
  const defaults = defaultAssignmentDateInputs(monday);
  assert.equal(defaults.dueAt, '2026-09-01T23:59');
  assert.equal(defaults.lateDueAt, '2026-09-07T23:59');
});

test('lesson DOL keeps ten working minutes but shifts earlier to preserve five-minute pack-up', () => {
  const waiting = getDOLState({
    assignment: lessonWithDOL,
    schedule: mondaySchedule,
    classPeriod: 'Period 1',
    nowValue: new Date(2026, 7, 31, 9, 14, 59),
  });
  assert.equal(waiting.status, 'waiting');

  const active = getDOLState({
    assignment: lessonWithDOL,
    schedule: mondaySchedule,
    classPeriod: 'Period 1',
    nowValue: new Date(2026, 7, 31, 9, 15, 0),
  });
  assert.equal(active.status, 'active');
  assert.equal(active.opensAt.getHours(), 9);
  assert.equal(active.opensAt.getMinutes(), 15);
  assert.equal(active.endsAt.getHours(), 9);
  assert.equal(active.endsAt.getMinutes(), 25);
  assert.equal(active.durationMinutes, 10);
  assert.equal(active.closeMinutesBeforeEnd, 5);

  const ended = getDOLState({
    assignment: lessonWithDOL,
    schedule: mondaySchedule,
    classPeriod: 'Period 1',
    nowValue: new Date(2026, 7, 31, 9, 25, 1),
  });
  assert.equal(ended.status, 'ended');
});

test('pack-up alert owns the final five minutes of class', () => {
  const before = getClassPackUpState({
    schedule: mondaySchedule,
    classPeriod: 'Period 1',
    nowValue: new Date(2026, 7, 31, 9, 24, 59),
  });
  assert.equal(before.status, 'waiting');

  const active = getClassPackUpState({
    schedule: mondaySchedule,
    classPeriod: 'Period 1',
    nowValue: new Date(2026, 7, 31, 9, 25, 0),
  });
  assert.equal(active.status, 'active');
  assert.equal(active.startsAt.getHours(), 9);
  assert.equal(active.startsAt.getMinutes(), 25);
  assert.equal(active.endsAt.getHours(), 9);
  assert.equal(active.endsAt.getMinutes(), 30);
});

console.log('assignmentTimingDefaults.test.mjs: defaults, shifted DOL, and pack-up window passed');
