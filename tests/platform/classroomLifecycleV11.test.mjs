import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('new graded Classroom posts explicitly target all students', () => {
  const src = fs.readFileSync('functions/lib/classroom.js', 'utf8');
  const create = src.slice(
    src.indexOf('async function createCourseWork('),
    src.indexOf('async function patchCourseWork('),
  );
  assert.match(create, /assigneeMode:\s*"ALL_STUDENTS"/);
});

test('new Classroom material posts explicitly target all students', () => {
  const src = fs.readFileSync('functions/lib/classroom.js', 'utf8');
  const create = src.slice(
    src.indexOf('async function createCourseWorkMaterial('),
    src.indexOf('module.exports'),
  );
  assert.match(create, /assigneeMode:\s*"ALL_STUDENTS"/);
});

test('Classroom helper supports audience repair and deletion', () => {
  const src = fs.readFileSync('functions/lib/classroom.js', 'utf8');
  assert.match(src, /courseWork\.modifyAssignees/);
  assert.match(src, /courseWork\.delete/);
  assert.match(src, /courseWorkMaterials\.delete/);
  assert.match(src, /modifyCourseWorkAssignees,/);
  assert.match(src, /deleteCourseWork,/);
  assert.match(src, /deleteCourseWorkMaterial,/);
});
