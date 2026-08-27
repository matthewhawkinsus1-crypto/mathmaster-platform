import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assignmentUsesTeacherReleasePolicy,
  assignmentFeedbackWasReleased,
  assignmentFeedbackIsHeld,
} = require('../../functions/lib/activityFeedback.js');

test('Classroom passback detects Quiz/Test teacher-release activities from V5 sections', () => {
  assert.equal(assignmentUsesTeacherReleasePolicy({ schemaVersion: 5, assignmentType: 'quiz', sections: [] }), true);
  assert.equal(assignmentUsesTeacherReleasePolicy({
    schemaVersion: 5,
    assignmentType: 'practice',
    sections: [{ id: 'test', role: 'test', title: 'Test', questions: [{ type: 'multiAnswer' }] }],
  }), true);
  assert.equal(assignmentUsesTeacherReleasePolicy({
    schemaVersion: 5,
    assignmentType: 'practice',
    sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: [{ type: 'multiAnswer' }] }],
  }), false);
});

test('unreleased Quiz/Test feedback remains held for Classroom passback', () => {
  const assignment = {
    schemaVersion: 5,
    assignmentType: 'practice',
    sections: [{ id: 'quiz', role: 'quiz', title: 'Quiz', questions: [{ type: 'multiAnswer' }] }],
  };
  assert.equal(assignmentFeedbackWasReleased(assignment), false);
  assert.equal(assignmentFeedbackIsHeld(assignment), true);
});

test('explicit teacher release opens Quiz/Test Classroom passback', () => {
  const byFlag = { assignmentType: 'test', feedbackReleased: true };
  const byTimestamp = { assignmentType: 'quiz', feedbackReleasedAt: '2026-08-08T12:00:00.000Z' };
  assert.equal(assignmentFeedbackIsHeld(byFlag), false);
  assert.equal(assignmentFeedbackIsHeld(byTimestamp), false);
});
