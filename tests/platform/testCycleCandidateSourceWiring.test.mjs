// A Test Cycle candidate opened from a saved assignment names it as its source
// (sourceAssignmentId), whether the review updates that assignment or reuses
// it for more classes. The server accepts a candidate's secure test reference
// only from that source (tests/integration/testCycleCandidateReference.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { teacherWorkspaceSource } from './helpers/appScreens.mjs';

// The workspace and the modules it moved code into (helpers/appScreens.mjs).
const workspace = executableSource(teacherWorkspaceSource());
const controls = executableSource(readFileSync('src/app/teacher/controls/assignmentPreflightControls.js', 'utf8'));
const modal = executableSource(readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8'));
const preview = executableSource(readFileSync('src/components/teacher/TestCyclePreview.jsx', 'utf8'));

test('the review keeps the saved assignment it was opened from, for an update or a reuse', () => {
  assert.match(controls, /sourceAssignmentId: reviewOptions\.sourceAssignmentId \|\| reviewOptions\.existingAssignmentId \|\| null,/);
  const reuse = region(workspace, 'const openStoredAssignmentForPreflight = async', "if (opened !== true) throw new Error(opened?.error || 'Could not open Assignment Review for this saved assignment.');", 'reuse opener');
  assert.match(reuse, /sourceAssignmentId: assignment\.id \|\| null/, 'a reuse for more classes names its saved assignment');
});

test('every candidate call sends that source', () => {
  assert.match(workspace, /preflightTestCycleCandidate\(\{\s*assignment: assignmentV5,\s*sourceAssignmentId: assignmentPreflight\?\.sourceAssignmentId \|\| null,/);
  assert.match(workspace, /sourceAssignmentId=\{assignmentPreflight\.sourceAssignmentId \|\| null\}/);
  assert.match(modal, /preflightTestCycleCandidate\(\{ assignment: effectiveAssignmentV5, sourceAssignmentId \}\)/);
  assert.match(modal, /candidate=\{testCycleCandidate\}\s*sourceAssignmentId=\{sourceAssignmentId\}/);
  assert.match(preview, /previewTestCycleSecureItems\(\{ candidate, sourceAssignmentId, draw: nextDraw, stage \}\)/);
  const graders = [...preview.matchAll(/gradeTestCyclePreviewItem\(\{([^}]*)\}\)/g)].map((match) => match[1]);
  assert.ok(graders.length >= 2);
  graders.forEach((args) => assert.match(args, /\bsourceAssignmentId\b/));
});
