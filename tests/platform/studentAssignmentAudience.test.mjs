import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentIsForStudent } from '../../src/assignmentLifecycle.js';

test('library assignment with no class IDs is not visible to a student', () => {
  assert.equal(assignmentIsForStudent({ assignedClassIds: [] }, { classId: 'c1', classPeriod: 'Period 1' }), false);
});

test('period-only assignment data fails closed instead of becoming an audience', () => {
  assert.equal(
    assignmentIsForStudent({ assignedClassPeriods: ['Period 1'] }, { classId: 'c1', classPeriod: 'Period 1' }),
    false,
  );
});

test('assignment is visible to an explicitly assigned MathMaster class ID', () => {
  assert.equal(
    assignmentIsForStudent({ assignedClassIds: ['c1'], assignedClassPeriods: ['Period 1'] }, { classId: 'c1', classPeriod: 'Period 7' }),
    true,
  );
});

test('same period never widens a different class audience', () => {
  assert.equal(
    assignmentIsForStudent({ assignedClassIds: ['c2'], assignedClassPeriods: ['Period 1'] }, { classId: 'c1', classPeriod: 'Period 1' }),
    false,
  );
});

test('missing student class ID fails closed even when period matches', () => {
  assert.equal(
    assignmentIsForStudent({ assignedClassIds: ['c1'], assignedClassPeriods: ['Period 1'] }, { classPeriod: 'Period 1' }),
    false,
  );
});

console.log('studentAssignmentAudience.test.mjs: class-ID audience assertions passed');
