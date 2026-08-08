import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assignmentUsesTeacherReleasePolicy,
  assignmentFeedbackWasReleased,
  assignmentFeedbackIsHeld,
} = require('../../functions/lib/activityFeedback.js');

test('Classroom passback detects Quiz/Test teacher-release activities', () => {
  assert.equal(assignmentUsesTeacherReleasePolicy({ assignmentType: 'quiz', questions: [] }), true);
  assert.equal(assignmentUsesTeacherReleasePolicy({ assignmentType: 'practice', questions: [{ activityRole: 'test' }] }), true);
  assert.equal(assignmentUsesTeacherReleasePolicy({ assignmentType: 'practice', questions: [{ activityRole: 'classwork' }] }), false);
});

test('unreleased Quiz/Test feedback remains held for Classroom passback', () => {
  const assignment = { assignmentType: 'practice', questions: [{ activityRole: 'quiz' }] };
  assert.equal(assignmentFeedbackWasReleased(assignment), false);
  assert.equal(assignmentFeedbackIsHeld(assignment), true);
});

test('explicit teacher release opens Quiz/Test Classroom passback', () => {
  const byFlag = { assignmentType: 'test', feedbackReleased: true };
  const byTimestamp = { assignmentType: 'quiz', feedbackReleasedAt: '2026-08-08T12:00:00.000Z' };
  assert.equal(assignmentFeedbackIsHeld(byFlag), false);
  assert.equal(assignmentFeedbackIsHeld(byTimestamp), false);
});
