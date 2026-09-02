import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUCKET,
  BUCKET_OPEN_BY_DEFAULT,
  resolveNextAction,
} from '../../src/studentDashboardModel.js';

const assignmentEntry = (id, { disabled = false, attempted = false } = {}) => ({
  assignment: { id, title: `Assignment ${id}` },
  disabled,
  isAttempted: attempted,
});

const dashboardWith = (groups = {}) => ({
  activeDols: [],
  resumeAssignment: null,
  groups: {
    [BUCKET.IN_PROGRESS]: [],
    [BUCKET.PAST_DUE]: [],
    [BUCKET.DO_NOW]: [],
    [BUCKET.COMING_UP]: [],
    [BUCKET.PRACTICE]: [],
    [BUCKET.COMPLETED]: [],
    ...groups,
  },
});

test('future-due assigned work is expanded instead of hidden under Coming up', () => {
  assert.equal(BUCKET_OPEN_BY_DEFAULT[BUCKET.COMING_UP], true);
});

test('open future-due assignment outranks independent weekly Path work', () => {
  const next = resolveNextAction({
    dashboard: dashboardWith({ [BUCKET.COMING_UP]: [assignmentEntry('future')] }),
    weeklyProgress: { required: 5, completed: 1, remaining: 4, overdue: false },
  });
  assert.equal(next.kind, 'assignedLater');
  assert.equal(next.assignment.id, 'future');
  assert.match(next.headline, /assigned work/i);
});

test('a scheduled assignment prevents a false caught-up celebration', () => {
  const next = resolveNextAction({
    dashboard: dashboardWith({ [BUCKET.COMING_UP]: [assignmentEntry('scheduled', { disabled: true })] }),
    weeklyProgress: { required: 5, completed: 5, remaining: 0, complete: true },
  });
  assert.equal(next.kind, 'assignedSoon');
  assert.notEqual(next.kind, 'clear');
});

test('unknown weekly Path status never means caught up', () => {
  const next = resolveNextAction({ dashboard: dashboardWith(), weeklyProgress: null });
  assert.equal(next.kind, 'weeklyPathStatus');
  assert.notEqual(next.kind, 'clear');
});

test('caught up requires no pending class work and a completed weekly Path goal', () => {
  const next = resolveNextAction({
    dashboard: dashboardWith(),
    weeklyProgress: { required: 5, completed: 5, remaining: 0, complete: true },
  });
  assert.equal(next.kind, 'clear');
  assert.match(next.detail, /assigned class work is complete/i);
  assert.match(next.detail, /Math Path goal is complete/i);
});
