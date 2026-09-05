import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkthroughMonitor, WALKTHROUGH_STATUS } from '../../src/platform/teacher/walkthroughMonitor.js';

const now = 1_000_000;
const student = (id, liveStatus = null) => ({ id, displayName: id, liveStatus });
const live = (overrides = {}) => ({
  assignmentId: 'a1',
  activityRole: 'classwork',
  sectionQuestionIndex: 0,
  classworkQuestionStates: '.....',
  updatedAt: now,
  lastInteractionAt: now,
  ...overrides,
});

test('completion wins even while student reviews an earlier question', () => {
  const result = buildWalkthroughMonitor({
    students: [student('A', live({ sectionQuestionIndex: 1, classworkQuestionStates: '....c' }))],
    assignmentId: 'a1',
    teacherQuestionIndex: 4,
    nowValue: now,
  });
  assert.equal(result.all[0].status, WALKTHROUGH_STATUS.DONE);
  assert.equal(result.needsCheck.length, 0);
});

test('behind, current, ahead and not-started students separate correctly', () => {
  const result = buildWalkthroughMonitor({
    students: [
      student('Behind', live({ sectionQuestionIndex: 1 })),
      student('Current', live({ sectionQuestionIndex: 3 })),
      student('Ahead', live({ sectionQuestionIndex: 5 })),
      student('NotStarted'),
    ],
    assignmentId: 'a1',
    teacherQuestionIndex: 3,
    nowValue: now,
  });
  assert.deepEqual(result.needsCheck.map((row) => row.id), ['NotStarted', 'Behind']);
  assert.equal(result.onQuestion[0].id, 'Current');
  assert.equal(result.aheadDone[0].id, 'Ahead');
});

test('absent students are excluded and late arrival resets inactivity clock', () => {
  const result = buildWalkthroughMonitor({
    students: [
      student('Absent'),
      student('Late', live({ sectionQuestionIndex: 0, lastInteractionAt: now - 600000 })),
    ],
    assignmentId: 'a1',
    teacherQuestionIndex: 2,
    nowValue: now,
    attendanceByStudentId: {
      Absent: { mark: 'excused' },
      Late: { mark: 'late', arrivedAt: now - 30000 },
    },
  });
  assert.equal(result.all.some((row) => row.id === 'Absent'), false);
  assert.equal(result.all.find((row) => row.id === 'Late').inactive, false);
});

test('late arrival context stays visible for a student who is behind but active', () => {
  const result = buildWalkthroughMonitor({
    students: [student('Late', live({ sectionQuestionIndex: 0 }))],
    assignmentId: 'a1',
    teacherQuestionIndex: 3,
    attendanceByStudentId: {
      Late: { mark: 'late', arrivedAt: now - 30000 },
    },
    nowValue: now,
  });
  const row = result.all[0];
  assert.equal(row.status, WALKTHROUGH_STATUS.NEEDS_CHECK);
  assert.equal(row.inactive, false);
  assert.match(row.reason, /^Late arrival · 3 behind · active$/);
});

test('offline is distinguished from inactivity', () => {
  const result = buildWalkthroughMonitor({
    students: [
      student('Offline', live({ updatedAt: now - 80000, lastInteractionAt: now - 80000 })),
      student('Idle', live({ updatedAt: now, lastInteractionAt: now - 200000 })),
    ],
    assignmentId: 'a1',
    teacherQuestionIndex: 2,
    nowValue: now,
  });
  assert.equal(result.all.find((row) => row.id === 'Offline').offline, true);
  assert.equal(result.all.find((row) => row.id === 'Offline').inactive, false);
  assert.equal(result.all.find((row) => row.id === 'Idle').inactive, true);
});

test('help request outranks other students for Visit Next', () => {
  const result = buildWalkthroughMonitor({
    students: [
      student('FarBehind', live({ sectionQuestionIndex: 0 })),
      student('Help', live({ sectionQuestionIndex: 2, helpRequestedAt: now })),
    ],
    assignmentId: 'a1',
    teacherQuestionIndex: 4,
    nowValue: now,
  });
  assert.equal(result.visitNext.id, 'Help');
});

test('checked students leave this walkthrough pass without changing academic status', () => {
  const result = buildWalkthroughMonitor({
    students: [student('A', live())],
    assignmentId: 'a1',
    teacherQuestionIndex: 3,
    checkedStudentIds: ['A'],
    nowValue: now,
  });
  assert.equal(result.all[0].status, WALKTHROUGH_STATUS.NEEDS_CHECK);
  assert.equal(result.needsCheck.length, 0);
});

test('bottlenecks count active students by classwork question', () => {
  const result = buildWalkthroughMonitor({
    students: [
      student('A', live({ sectionQuestionIndex: 2 })),
      student('B', live({ sectionQuestionIndex: 2 })),
      student('C', live({ sectionQuestionIndex: 1 })),
    ],
    assignmentId: 'a1',
    teacherQuestionIndex: 3,
    nowValue: now,
  });
  assert.deepEqual(result.bottlenecks[0], { questionIndex: 2, count: 2 });
});