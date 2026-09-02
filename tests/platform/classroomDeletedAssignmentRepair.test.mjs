import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('stored Classroom ids must match the MathMaster publication marker', () => {
  const src = read('functions/index.js');
  assert.match(src, /function courseWorkMatchesPublication\(courseWork, publicationId, requiredInstanceMarker = null\)/);
  assert.match(src, /description\.includes\(publicationMarker\(publicationId\)\)/);
  assert.match(src, /!requiredInstanceMarker \|\| description\.includes\(String\(requiredInstanceMarker\)\)/);

  const publishStart = src.indexOf('async function publishOneCourse');
  const repairStart = src.indexOf('exports.repairClassroomAssignmentPublications = onCall');
  const inspectStart = src.indexOf('exports.inspectClassroomPublication = onCall');
  const removeStart = src.indexOf('exports.removeAssignmentClassroomPackage = onCall');
  const publish = src.slice(publishStart, repairStart);
  const repair = src.slice(repairStart, inspectStart);
  const inspect = src.slice(inspectStart, removeStart);

  assert.match(publish, /courseWorkMatchesPublication\(candidate, publicationId, requiredInstanceMarker\)/);
  assert.match(repair, /courseWorkMatchesPublication\([\s\S]*existingCourseWork,[\s\S]*publication\.id,[\s\S]*publicationInstanceMarker/);
  assert.match(inspect, /courseWorkMatchesPublication\([\s\S]*courseWork,[\s\S]*publication\.id,[\s\S]*publicationInstanceMarker/);
  assert.match(inspect, /status: "mismatched"/);
  assert.ok(
    inspect.indexOf('courseWorkMatchesPublication(')
      < inspect.indexOf('modifyCourseWorkAssignees'),
    'audience repair must never run before publication identity is verified',
  );
});

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

test('repair reconciles current mapped destinations instead of trusting sibling-period publications', () => {
  const src = read('functions/index.js');
  const start = src.indexOf('exports.repairClassroomAssignmentPublications = onCall');
  const end = src.indexOf('// Read the live Google Classroom roster', start);
  const repair = src.slice(start, end);

  assert.match(repair, /classroomCourseMappings/);
  assert.match(repair, /targetMappings/);
  assert.match(repair, /targetCourseIds/);
  assert.match(repair, /ignoredPriorDestinations/);
  assert.match(repair, /publicationByCourseId\.get\(courseId\) \|\| null/);
  assert.match(repair, /missing-publication-record/);
  assert.match(repair, /for \(const mapping of targetMappings\)/);
  assert.doesNotMatch(repair, /for \(const publication of publications\)/);
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
  assert.match(app, /Repair \/ Repost Classroom/);
  assert.match(app, /Existing MathMaster work was preserved/);
});
