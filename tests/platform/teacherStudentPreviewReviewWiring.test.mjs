import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('../../src/QuestionModuleBoundary.jsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../../src/components/teacher/TeacherQuestionReviewPanel.jsx', import.meta.url), 'utf8');

test('actual teacher View as Student runtime reaches the review panel through the question runtime boundary', () => {
  assert.match(appSource, /generationStudentKey\s*=([\s\S]{0,200})teacher-preview/,
    'App must continue marking the real View-as-Student question runtime with teacher-preview');
  assert.match(boundarySource, /teacher-preview/);
  assert.match(boundarySource, /TeacherQuestionReviewPanel/);
  assert.match(boundarySource, /assignmentId=\{previewTarget\.assignmentId\}/);
  assert.match(boundarySource, /questionIndex=\{previewTarget\.questionIndex\}/);
});

test('teacher preview review panel resolves the canonical saved question to its stable questionId', () => {
  assert.match(panelSource, /getStoredAssignmentQuestions/);
  assert.match(panelSource, /resolvedQuestion\?\.questionId/);
  assert.match(panelSource, /assignments/);
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

test('student runtime never mounts teacher review controls', () => {
  assert.match(boundarySource, /parts\.indexOf\(['"]teacher-preview['"]\)/);
  assert.doesNotMatch(boundarySource, /student['"]\).*TeacherQuestionReviewPanel/);
});
