import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');

test('assignment menu exposes one no-code setup editor', () => {
  assert.match(app, /Review \/ Edit Setup/);
  assert.match(app, /beginEditAssignmentSetup\(assignment\)/);
  assert.match(app, /storedAssignmentToV5\(assignment\)/);
  assert.match(app, /mode:\s*'update'[\s\S]{0,220}existingAssignmentId:\s*assignment\.id/);
});

test('existing setup review reuses the same reviewed Assignment V5 model internally', () => {
  assert.match(app, /reviewMode=\{assignmentPreflight\.mode \|\| 'create'\}/);
  assert.match(modal, /reviewMode = 'create'/);
  assert.match(modal, /buildPreflightReviewedAssignmentV5/);
  assert.match(modal, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5\)/);
});

test('update mode uses teacher-facing save language', () => {
  assert.match(modal, /Review assignment setup/);
  assert.match(modal, /Save Setup/);
  assert.match(modal, /Updates this assignment after the same MathMaster checks used when it was created/);
  assert.doesNotMatch(modal, /Back to JSON/);
});

test('setup save validates canonical assignment before Firestore update', () => {
  assert.match(app, /updateExistingAssignmentFromReview/);
  assert.match(app, /const model = buildAssignmentV5PreflightModel\(assignmentV5\)/);
  assert.match(app, /This setup cannot be saved until MathMaster’s assignment checks are clean/);
  assert.match(app, /canonicalV5PersistencePatch\(model\.assignmentV5\)/);
});

test('reviewed policy and output fields persist on existing assignment save', () => {
  const start = app.indexOf('const updateExistingAssignmentFromReview');
  const end = app.indexOf('const confirmAssignmentPreflight', start);
  const block = app.slice(start, end);
  assert.match(block, /\.\.\.persistence/);
  assert.match(block, /sectionAccess:/);
  assert.match(block, /guidedNotesBySection:/);
  assert.match(block, /publicationSettings:/);
  assert.match(block, /await updateDoc\(doc\(db, 'assignments', existing\.id\), patch\)/);
});

test('library template cannot be silently assigned through setup editing', () => {
  assert.match(app, /if \(isLibraryAssignment\(existing\) && \(assignedClassIds\.length \|\| assignedClassPeriods\.length\)\)/);
  assert.match(app, /This is a reusable library template/);
});

test('existing setup preserves Standard and Honors destination identity', () => {
  assert.match(app, /const changesDestination = targetGroups\.length > 1/);
  assert.match(app, /destination-specific Standard\/Honors version/);
});

test('existing student evidence blocks historical policy or audience rewrites', () => {
  assert.match(app, /const hasStudentData = allStudents\.some/);
  assert.match(app, /const historicalFields = \[/);
  assert.match(app, /'variantPolicy'/);
  assert.match(app, /'gradingPolicy'/);
  assert.match(app, /'evidencePolicy'/);
  assert.match(app, /To preserve historical evidence/);
  assert.match(app, /Duplicate the assignment for a new delivery policy or question rewrite instead/);
});

test('safe existing updates preserve Classroom due-date synchronization', () => {
  assert.match(app, /Classroom sync after assignment setup edit failed/);
  assert.match(app, /updateAssignmentClassroomPublications\(\{ assignmentId: existing\.id \}\)/);
});

console.log('assignmentExistingSetupEditor.test.mjs: all assertions passed');
