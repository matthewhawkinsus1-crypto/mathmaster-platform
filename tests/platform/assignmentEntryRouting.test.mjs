import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStudentAssignmentEntry } from '../../src/platform/student/assignmentEntry.js';

const entries = [
  { storageIndex: 0, logicalRole: 'warmup' },
  { storageIndex: 1, logicalRole: 'warmup' },
  { storageIndex: 2, logicalRole: 'classwork' },
  { storageIndex: 3, logicalRole: 'practice' },
  { storageIndex: 4, logicalRole: 'dol' },
];
const includedQuestionIndices = entries.map((entry) => entry.storageIndex);
const roleGate = (openRoles) => (role) => openRoles.includes(role);

test('assignment entry skips a locked first section for the first actionable question', () => {
  assert.equal(resolveStudentAssignmentEntry({
    entries,
    includedQuestionIndices,
    requestedQuestionIndex: 0,
    roleIsActionable: roleGate(['classwork', 'practice']),
  }), 2);
});

test('assignment entry can skip multiple unavailable sections', () => {
  assert.equal(resolveStudentAssignmentEntry({
    entries,
    includedQuestionIndices,
    requestedQuestionIndex: 0,
    roleIsActionable: roleGate(['practice']),
  }), 3);
});

test('assignment entry returns null when every included section is unavailable', () => {
  assert.equal(resolveStudentAssignmentEntry({
    entries,
    includedQuestionIndices,
    requestedQuestionIndex: 0,
    roleIsActionable: () => false,
  }), null);
});

test('assignment entry preserves an already-actionable requested question', () => {
  assert.equal(resolveStudentAssignmentEntry({
    entries,
    includedQuestionIndices,
    requestedQuestionIndex: 3,
    roleIsActionable: roleGate(['practice']),
  }), 3);
});

test('explicit section launches never jump into a different open section', () => {
  assert.equal(resolveStudentAssignmentEntry({
    entries,
    includedQuestionIndices,
    requestedQuestionIndex: 0,
    roleIsActionable: roleGate(['classwork']),
    restrictToRole: 'warmup',
  }), null);
});
