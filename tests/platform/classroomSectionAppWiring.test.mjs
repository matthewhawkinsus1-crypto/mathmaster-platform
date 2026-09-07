import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../src/App.jsx', import.meta.url),
  'utf8',
);

test('App consumes canonical section grade and Classroom launch helpers', () => {
  assert.match(source, /splitGradesBySection/);
  assert.match(source, /parseClassroomLaunchSearch/);
  assert.match(source, /classroomLaunchTarget/);
});

test('teacher gradebook exposes Overall, Warm-Up, Classwork, Practice, and DOL academic scores', () => {
  for (const label of ['Overall', 'Warm-Up', 'Classwork', 'Practice', 'DOL']) {
    assert.match(source, new RegExp(`>${label}<`));
  }
  assert.match(source, /splitGradesBySection\(\{\s*tracker:\s*grades,\s*assignment:\s*selectedAssignment\s*\}\)/);
});

test('student workspace shows the active section score instead of only the whole-assignment score', () => {
  assert.match(source, /currentSectionGrade/);
  assert.match(source, /currentSectionOfficialGrade/);
  assert.match(source, /currentSectionMeta\.label/);
  assert.match(source, /section score/i);
});

test('Classroom split launch preserves exact section and closed links stop on frozen report first', () => {
  assert.match(source, /pendingClassroomLaunch/);
  assert.match(source, /showFrozenReportFirst/);
  assert.match(source, /Practice this section/);
  assert.match(source, /classroomSectionReport/);
});
