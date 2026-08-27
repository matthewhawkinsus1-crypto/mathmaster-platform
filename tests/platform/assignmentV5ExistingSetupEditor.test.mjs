import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');

test('assignment menu exposes one no-code V5 setup editor', () => {
  assert.match(app, /Review \/ Edit Setup/);
  assert.match(app, /beginEditAssignmentSetup\(assignment\)/);
  assert.match(app, /storedAssignmentToV5\(assignment\)/);
  assert.match(app, /mode: 'update', existingAssignmentId: assignment\.id/);
});

test('existing setup review reuses native V5 Preflight rather than a parallel settings form', () => {
  assert.match(app, /reviewMode=\{assignmentPreflight\.mode \|\| 'create'\}/);
  assert.match(modal, /reviewMode = 'create'/);
  assert.match(modal, /buildPreflightReviewedAssignmentV5/);
  assert.match(modal, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5\)/);
});

test('update mode has clear save language instead of create-or-assign language', () => {
  assert.match(modal, /Review assignment setup/);
  assert.match(modal, /Save Setup/);
  assert.match(modal, /Updates the existing assignment after the same V5 checks used at creation/);
});

test('existing setup save validates canonical V5 before Firestore update', () => {
  assert.match(app, /updateExistingAssignmentFromPreflight/);
  assert.match(app, /const model = buildAssignmentV5PreflightModel\(assignmentV5\)/);
  assert.match(app, /This setup cannot be saved until V5 Preflight is clean/);
  assert.match(app, /canonicalV5PersistencePatch\(model\.assignmentV5\)/);
});

test('teacher-reviewed V5 policies and output profiles are persisted on setup save', () => {
  assert.match(app, /\.\.\.persistence,/);
  assert.match(app, /sectionAccess:/);
  assert.match(app, /guidedNotesBySection:/);
  assert.match(app, /publicationSettings:/);
  assert.match(app, /await updateDoc\(doc\(db, 'assignments', existing\.id\), patch\)/);
});

test('setup editor cannot silently assign a reusable library template', () => {
  assert.match(app, /if \(isLibraryAssignment\(existing\) && \(assignedClassIds\.length \|\| assignedClassPeriods\.length\)\)/);
  assert.match(app, /This is a reusable library template/);
});

test('setup editor preserves Standard and Honors destination identity', () => {
  assert.match(app, /const changesDestination = targetGroups\.length > 1/);
  assert.match(app, /destination-specific Standard\/Honors version/);
});

test('existing student evidence blocks historical policy and audience rewrites', () => {
  assert.match(app, /const hasStudentData = allStudents\.some/);
  assert.match(app, /const historicalFields = \[/);
  assert.match(app, /'variantPolicy'/);
  assert.match(app, /'gradingPolicy'/);
  assert.match(app, /'evidencePolicy'/);
  assert.match(app, /To preserve historical evidence/);
  assert.match(app, /Duplicate the assignment for a new delivery policy instead/);
});

test('safe existing updates keep Classroom due-date synchronization', () => {
  assert.match(app, /Classroom sync after V5 setup edit failed/);
  assert.match(app, /updateAssignmentClassroomPublications\(\{ assignmentId: existing\.id \}\)/);
});

console.log('assignmentV5ExistingSetupEditor.test.mjs: all assertions passed');
