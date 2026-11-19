import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appAndTeacherWorkspaceSource, teacherControlsSource } from './helpers/appScreens.mjs';
import { region } from './helpers/sourceContract.mjs';

const src = appAndTeacherWorkspaceSource();
// Since the App split automatic publishing is createClassroomPublishingControls',
// which App calls through the teacher kit (the helper holds that seam) for the
// autoPublishAssignmentPackageToClassroom the publish above offers each assignment to.
const autoPublish = () => region(
  teacherControlsSource('createClassroomPublishingControls'),
  'const autoPublishAssignmentPackageToClassroom = async', 'const handleRepairClassroomAssignmentPost', 'automatic Classroom publish',
);

test('Preflight assignment creation automatically publishes V5 Classroom packages', () => {
  assert.match(src, /autoPublishAssignmentPackageToClassroom/);
  // Every assignment the publish committed is offered to Classroom.
  assert.match(src, /await publishBatch\.commit\(\);[\s\S]*?const createdAssignments = plannedWrites\.map\([\s\S]*?for \(const createdAssignment of createdAssignments\)[\s\S]*?autoPublishAssignmentPackageToClassroom\(createdAssignment\)/);
  assert.match(src, /Google Classroom published/);
});

test('automatic publishing generates and stores authored notes PDF', () => {
  assert.match(autoPublish(), /generateLessonNotesPdfBlob/);
  assert.match(autoPublish(), /storeLessonNotesPdf/);
  assert.match(autoPublish(), /publishClassroomMaterial/);
});

test('automatic publishing resolves destinations from saved Classroom mappings', () => {
  assert.match(autoPublish(), /listClassroomCourseMappings/);
  assert.match(autoPublish(), /mappedCourseIdsForAssignment/);
});

test('assigning a library item later goes back through Preflight so the destination copy can auto-publish', () => {
  assert.match(src, /if \(isLibraryAssignment\(assignment\) && editedClassIds\.length\)/);
  assert.match(src, /openStoredAssignmentForPreflight\(assignment/);
  assert.match(src, /The library template is staying unchanged/);
  assert.match(src, /creationMode !== 'library'[\s\S]*autoPublishAssignmentPackageToClassroom\(createdAssignment\)/);
});
