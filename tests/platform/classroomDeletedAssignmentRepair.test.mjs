import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('deleted Classroom assignment repair verifies before reposting', () => {
  const src = read('functions/index.js');
  const start = src.indexOf('exports.repairClassroomAssignmentPublications = onCall');
  const end = src.indexOf('// Read the live Google Classroom roster', start);
  assert.ok(start >= 0 && end > start, 'repair callable must exist before Classroom inspection');
  const repair = src.slice(start, end);

  assert.match(repair, /classroomLib\.getCourseWork/);
  assert.match(repair, /classroomDeleteAlreadyGone/);
  assert.match(repair, /status: "healthy"/);
  assert.match(repair, /publishOneCourse\(/);
  assert.match(repair, /repostedFromCourseworkId/);
  assert.match(repair, /oldCourseworkId: priorCourseworkId/);
});

test('repost repair reuses the publication record and preserves MathMaster work', () => {
  const src = read('functions/index.js');
  const start = src.indexOf('exports.repairClassroomAssignmentPublications = onCall');
  const end = src.indexOf('// Read the live Google Classroom roster', start);
  const repair = src.slice(start, end);

  assert.match(repair, /publication\.ref\.set/);
  assert.match(repair, /missingCourseworkId/);
  assert.doesNotMatch(repair, /delete\(db\.doc\(`assignments\//);
  assert.doesNotMatch(repair, /delete\(db\.doc\(`grades\//);
});

test('repost queues linked grade records through the existing release-signal trigger', () => {
  const src = read('functions/index.js');
  assert.match(src, /async function queueRepostedAssignmentGrades/);
  assert.match(src, /classroomRosterLinks/);
  assert.match(src, /new FieldPath\("classroomReleaseSignals", String\(assignmentId\)\)/);
  assert.match(src, /queueRepostedAssignmentGrades\(\{/);
});

test('browser exposes teacher repair controls for missing Classroom assignments', () => {
  const api = read('src/classroomApi.js');
  const manager = read('src/ClassroomManagerV2.jsx');
  const app = read('src/App.jsx');

  assert.match(api, /repairClassroomAssignmentPublications = call\("repairClassroomAssignmentPublications"\)/);
  assert.match(manager, /repairClassroomAssignmentPublications/);
  assert.match(manager, /Check \/ repost missing assignment/);
  assert.match(manager, /without changing the MathMaster assignment or student work/);
  assert.match(app, /handleRepairClassroomAssignmentPost/);
  assert.match(app, /Check \/ Repost Classroom/);
  assert.match(app, /Existing MathMaster work was preserved/);
});
