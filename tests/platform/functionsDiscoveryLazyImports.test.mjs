import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('functions/index.js', 'utf8');

test('Functions discovery does not eagerly load the heavy Google Classroom module', () => {
  assert.doesNotMatch(index, /const\s+classroomLib\s*=\s*require\(["']\.\/lib\/classroom["']\)/);
  assert.match(index, /let\s+classroomLibModule\s*=\s*null/);
  assert.match(index, /function\s+classroomLib\(\)/);
  assert.match(index, /classroomLibModule\s*=\s*require\(["']\.\/lib\/classroom["']\)/);
});

test('Drive resource helper is also lazy during Firebase function discovery', () => {
  assert.doesNotMatch(index, /const\s+driveResources\s*=\s*require\(["']\.\/lib\/driveResources["']\)/);
  assert.match(index, /function\s+driveResources\(\)/);
  assert.match(index, /driveResourcesModule\s*=\s*require\(["']\.\/lib\/driveResources["']\)/);
});

test('Classroom call sites resolve the lazy module at execution time', () => {
  assert.match(index, /classroomLib\(\)\.getClassroomClient/);
  assert.match(index, /classroomLib\(\)\.patchGrade/);
});
