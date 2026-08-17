import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('server exposes live audience inspection and repair', () => {
  const src = fs.readFileSync('functions/index.js', 'utf8');
  assert.match(src, /exports\.inspectClassroomPublication = onCall/);
  assert.match(src, /repairAudience/);
  assert.match(src, /rosterStudentCount/);
});

test('server removes graded assignment and notes resource posts together', () => {
  const src = fs.readFileSync('functions/index.js', 'utf8');
  assert.match(src, /exports\.removeAssignmentClassroomPackage = onCall/);
  assert.match(src, /deleteCourseWorkMaterial/);
  assert.match(src, /deleteCourseWork/);
  assert.match(src, /assignment:\$\{assignmentId\}:resources/);
});

test('browser API exports lifecycle callables', () => {
  const src = fs.readFileSync('src/classroomApi.js', 'utf8');
  assert.match(src, /inspectClassroomPublication = call\("inspectClassroomPublication"\)/);
  assert.match(src, /removeAssignmentClassroomPackage = call\("removeAssignmentClassroomPackage"\)/);
});

test('teacher Classroom Manager exposes audience repair and removal controls', () => {
  const src = fs.readFileSync('src/ClassroomManagerV2.jsx', 'utf8');
  assert.match(src, /Check \/ repair students/);
  assert.match(src, /Remove from Classroom/);
  assert.match(src, /Google Classroom reports 0 enrolled students/);
});
