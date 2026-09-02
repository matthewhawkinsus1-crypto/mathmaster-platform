import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');

test('teacher View as Student clears preview-only saved drafts before opening', () => {
  assert.match(app, /removeAssignmentDrafts/);
  const start = app.indexOf('const startTeacherPreview =');
  const end = app.indexOf('const getScratchpadDocumentId', start);
  assert.ok(start >= 0 && end > start);
  const preview = app.slice(start, end);

  assert.match(preview, /removeAssignmentDrafts\(\{ studentId: 'teacher-preview', assignmentId \}\)/);
  assert.match(preview, /setPreviewTracker\(createEmptyAssignmentTracker\(assignmentQuestions\)\)/);
  assert.match(preview, /setPreviewScratchpads\(\{\}\)/);
  assert.match(preview, /setCurrentQuestionIndex\(getIncludedQuestionIndices\(assignmentData\)\[0\] \?\? 0\)/);
});

test('teacher can restart the open preview fresh without leaving the assignment', () => {
  assert.match(app, /Restart Preview Fresh/);
  assert.match(app, /onClick=\{\(\) => startTeacherPreview\(assignment\.id\)\}/);
});
