import test from 'node:test';
import assert from 'node:assert/strict';
import { appFactorySeam, appFactorySource } from './helpers/appScreens.mjs';

test('teacher View as Student clears preview-only saved drafts before opening', () => {
  // Since the App split, createTeacherPreviewNavigation owns startTeacherPreview;
  // App builds it once (appFactorySource holds the seam, name for name), and
  // the function ends where the next one in that module starts.
  const navigation = appFactorySource('createTeacherPreviewNavigation');
  assert.match(navigation, /removeAssignmentDrafts/);
  const start = navigation.indexOf('const startTeacherPreview =');
  const end = navigation.indexOf('const teachAssignmentLive = ', start);
  assert.ok(start >= 0 && end > start);
  const preview = navigation.slice(start, end);

  assert.match(preview, /removeAssignmentDrafts\(\{ studentId: 'teacher-preview', assignmentId \}\)/);
  assert.match(preview, /setPreviewTracker\(createEmptyAssignmentTracker\(assignmentQuestions\)\)/);
  // No scratchpad page from an earlier preview survives into this one. The
  // preview scratchpads are a budgeted store (practiceScratchpadCache.js), and
  // its empty value is the reset — practiceScratchpadCache.test.mjs proves
  // every write to that state goes through the store.
  assert.match(preview, /setPreviewScratchpads\(EMPTY_SCRATCHPAD_CACHE\);/);
  assert.match(preview, /setPreviewSessionId\(\(current\) => current \+ 1\)/);
  // Preview must start from the same current-content projection as students,
  // not from an excluded historical storage row.
  assert.match(preview, /setCurrentQuestionIndex\(getCurrentContentQuestionIndices\(assignmentData\)\[0\] \?\? 0\)/);
});

test('teacher can restart the open preview fresh without leaving the assignment', () => {
  // Since the App split (slice 7) createAssignmentWorkspaceView draws the
  // preview banner and keys the question; App hands it the function it took
  // from createTeacherPreviewNavigation.
  assert.ok(appFactorySeam('createTeacherPreviewNavigation').returned.includes('startTeacherPreview'));
  assert.ok(appFactorySeam('createAssignmentWorkspaceView').parameters.includes('startTeacherPreview'));
  const app = appFactorySource('createAssignmentWorkspaceView');
  assert.match(app, /Restart Preview Fresh/);
  assert.match(app, /onClick=\{\(\) => startTeacherPreview\(assignment\.id\)\}/);
  assert.match(app, /preview-\$\{previewSessionId\}/);
});
