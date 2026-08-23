import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Classroom V2 manager exposes course mapping and roster auto-link', () => {
  const src = read('src/ClassroomManagerV2.jsx');
  assert.match(src, /Map Google Classroom courses to MathMaster classes/);
  assert.match(src, /Auto-link exact emails/);
  assert.match(src, /linkClassroomRosterBatch/);
});

test('Classroom V2 manager publishes topics and standalone material posts', () => {
  const src = read('src/ClassroomManagerV2.jsx');
  assert.match(src, /ensureClassroomTopics/);
  assert.match(src, /publishClassroomMaterial/);
  assert.match(src, /Separate Notes & Resources post/);
});

test('Classroom V2 manager exposes grade passback status and retry', () => {
  const src = read('src/ClassroomManagerV2.jsx');
  assert.match(src, /Grade passback monitor/);
  assert.match(src, /retryClassroomGradeSync/);
});

test('classroom API exports V2 callables', () => {
  const src = read('src/classroomApi.js');
  for (const name of [
    'listClassroomCourseMappings',
    'saveClassroomCourseMapping',
    'linkClassroomRosterBatch',
    'ensureClassroomTopics',
    'publishClassroomMaterial',
    'listClassroomGradeSyncs',
    'retryClassroomGradeSync',
  ]) assert.match(src, new RegExp(`export const ${name}`));
});

test('server uses per-teacher Classroom client and stores teacherUid on publications', () => {
  const src = read('functions/index.js');
  assert.match(src, /getClassroomClient\(teacherUid\)/);
  assert.match(src, /teacherUid,\s*assignmentId/);
  assert.match(src, /classroomCourseMappings/);
});

test('Classroom helper requests Topics and CourseWorkMaterials scopes', () => {
  const src = read('functions/lib/classroom.js');
  assert.match(src, /classroom\.topics/);
  assert.match(src, /classroom\.courseworkmaterials/);
});

test('student Classroom launch is audience checked before opening', () => {
  const src = read('src/App.jsx');
  assert.match(src, /assignmentIsForStudent\(targetAssignment, \{ classId: user\.classId \|\| null, classPeriod: user\.classPeriod \}\)/);
  assert.match(src, /This Google Classroom assignment is not assigned to your MathMaster class/);
});


test('publishing fails closed through MathMaster class mapping and class-ID audience first', () => {
  const src = read('functions/index.js');
  assert.match(src, /Map this Google Classroom course to a MathMaster class first/);
  assert.match(src, /audience\.classIds\.length[\s\S]*audience\.classIds\.includes\(mappedClassId\)[\s\S]*audience\.classPeriods\.includes\(mappedPeriod\)/);
});

test('roster batch verifies the MathMaster student belongs to the mapped class', () => {
  const src = read('functions/index.js');
  assert.match(src, /studentBelongsToMappedClass/);
  assert.match(src, /is not enrolled in the mapped class/);
});

test('legacy OAuth credentials can only migrate to one teacher', () => {
  const src = read('functions/lib/classroom.js');
  assert.match(src, /migratedToUid && data\.migratedToUid !== teacherUid/);
});

test('schema v3 publications do not use the legacy global student google id fallback', () => {
  const src = read('functions/index.js');
  assert.match(src, /Number\(publication\.schemaVersion\) < 2/);
});
