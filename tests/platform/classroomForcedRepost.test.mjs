import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('teacher may intentionally create a new Classroom post in selected mapped courses', () => {
  const server = read('functions/index.js');
  const start = server.indexOf('exports.forceRepublishAssignmentToClassrooms = onCall');
  const end = server.indexOf('// Read the live Google Classroom roster', start);
  assert.ok(start >= 0 && end > start, 'force-repost callable must exist');
  const force = server.slice(start, end);

  assert.match(force, /courseIds/);
  assert.match(force, /getTeacherClassroomMapping/);
  assert.match(force, /audience\.classIds\.includes\(mappedClassId\)/);
  assert.match(force, /classroomLib\.createCourseWork/);
  assert.match(force, /publicationInstanceMarker/);
  assert.match(force, /lastForceRequestId/);
  assert.match(force, /supersededCourseworkIds/);
  assert.match(force, /queueRepostedAssignmentGrades/);
  assert.match(force, /status: "forced-reposted"/);
});

test('forced repost is idempotent for one teacher click but bypasses ordinary duplicate protection', () => {
  const server = read('functions/index.js');
  const classroom = read('functions/lib/classroom.js');
  const start = server.indexOf('exports.forceRepublishAssignmentToClassrooms = onCall');
  const end = server.indexOf('// Read the live Google Classroom roster', start);
  const force = server.slice(start, end);

  assert.match(force, /forceRequestId/);
  assert.match(force, /prior\.lastForceRequestId === forceRequestId/);
  assert.match(force, /status: "already-forced"/);
  assert.match(force, /findCourseWorkByPublicationMarker\([\s\S]*\[instanceMarker\]/);
  assert.match(classroom, /requiredMarkers = \[\]/);
  assert.match(classroom, /markers\.every/);
});

test('browser exposes exact destination selection and an explicit duplicate warning', () => {
  const api = read('src/classroomApi.js');
  const manager = read('src/ClassroomManagerV2.jsx');
  const app = read('src/App.jsx');

  assert.match(api, /forceRepublishAssignmentToClassrooms = call\("forceRepublishAssignmentToClassrooms"\)/);
  assert.match(manager, /selectedCourseIds/);
  assert.match(manager, /FORCE A NEW GOOGLE CLASSROOM POST/);
  assert.match(manager, /students may see both/);
  assert.match(manager, /Force NEW post to selected Classroom/);
  assert.match(manager, /grade-passback destination/);
  assert.match(app, /Force New Classroom Post…/);
  assert.match(app, /initialAssignmentId=\{classroomManagerAssignmentId\}/);
});
