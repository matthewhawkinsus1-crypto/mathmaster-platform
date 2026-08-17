import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentIsForStudent } from '../../src/assignmentLifecycle.js';

test('library assignment with no audience is not visible to a student', () => {
  assert.equal(assignmentIsForStudent({ assignedClassPeriods: [] }, 'Period 1'), false);
});

test('legacy assignment without assignedClassPeriods fails closed', () => {
  assert.equal(assignmentIsForStudent({}, 'Period 1'), false);
});

test('assignment is visible to an explicitly assigned period', () => {
  assert.equal(assignmentIsForStudent({ assignedClassPeriods: ['Period 1'] }, 'Period 1'), true);
});

test('assignment is hidden from a different period', () => {
  assert.equal(assignmentIsForStudent({ assignedClassPeriods: ['Period 2'] }, 'Period 1'), false);
});
