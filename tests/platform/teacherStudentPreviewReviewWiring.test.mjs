import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../../src/components/teacher/TeacherQuestionReviewPanel.jsx', import.meta.url), 'utf8');

test('actual teacher View as Student runtime renders private review controls for the current question', () => {
  assert.match(appSource, /TeacherQuestionReviewPanel/);
  assert.match(appSource, /preview\s*&&[\s\S]{0,1200}<TeacherQuestionReviewPanel/,
    'review controls must be in renderAssignmentWorkspace(preview), not only in Library or Preflight');
  assert.match(appSource, /questionId=\{[^}]*questionId/);
  assert.match(appSource, /assignmentId=\{activeAssignmentId\}/);
});

test('teacher preview review panel saves notes, resolves them, and builds a question-only repair request', () => {
  assert.match(panelSource, /loadAssignmentTeacherReviewContext/);
  assert.match(panelSource, /saveAssignmentTeacherReviewContext/);
  assert.match(panelSource, /addTeacherReviewFlag/);
  assert.match(panelSource, /resolveTeacherReviewFlag/);
  assert.match(panelSource, /buildQuestionRepairRequest/);
  assert.match(panelSource, /Flag question for editing|Save teacher flag/i);
  assert.match(panelSource, /Verify fixed|Resolve/i);
  assert.match(panelSource, /Copy repair request/i);
});

test('student runtime never renders teacher review controls', () => {
  assert.doesNotMatch(panelSource, /role=['"]student['"]/);
  assert.match(appSource, /preview\s*&&[\s\S]{0,1200}<TeacherQuestionReviewPanel/);
});
