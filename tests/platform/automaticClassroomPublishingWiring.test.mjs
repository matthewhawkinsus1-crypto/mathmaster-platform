import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/App.jsx', 'utf8');

test('Preflight assignment creation automatically publishes V5 Classroom packages', () => {
  assert.match(src, /autoPublishAssignmentPackageToClassroom/);
  assert.match(src, /createdAssignments\.push\(await writeAssignmentVariant/);
  assert.match(src, /Google Classroom published/);
});

test('automatic publishing generates and stores authored notes PDF', () => {
  assert.match(src, /generateLessonNotesPdfBlob/);
  assert.match(src, /storeLessonNotesPdf/);
  assert.match(src, /publishClassroomMaterial/);
});

test('automatic publishing resolves destinations from saved Classroom mappings', () => {
  assert.match(src, /listClassroomCourseMappings/);
  assert.match(src, /mappedCourseIdsForAssignment/);
});

test('assigning a library item later goes back through Preflight so the destination copy can auto-publish', () => {
  assert.match(src, /if \(isLibraryAssignment\(assignment\) && editedClassIds\.length\)/);
  assert.match(src, /openStoredAssignmentForPreflight\(assignment/);
  assert.match(src, /The library template is staying unchanged/);
  assert.match(src, /creationMode !== 'library'[\s\S]*autoPublishAssignmentPackageToClassroom\(createdAssignment\)/);
});
