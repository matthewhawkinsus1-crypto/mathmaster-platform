import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const controls = fs.readFileSync(new URL('../../src/components/teacher/PacingControls.jsx', import.meta.url), 'utf8');
const learningPath = fs.readFileSync(new URL('../../src/components/student/StudentLearningPath.jsx', import.meta.url), 'utf8');
const recommended = fs.readFileSync(new URL('../../src/components/student/RecommendedSkills.jsx', import.meta.url), 'utf8');

test('student Path is assembled even without a saved teacher pacing record', () => {
  assert.match(app, /storedPacingForClassContext\(pacingByClass/);
  assert.match(app, /const studentPathOptions = useMemo\(\(\) => buildStudentPathOptions/);
  assert.doesNotMatch(app, /studentPacing\s*\?\s*buildStudentPathOptions/);
});

test('classId is authoritative while period remains a legacy fallback', () => {
  assert.match(app, /classId:\s*user\.classId/);
  assert.match(app, /classPeriod:\s*user\.classPeriod/);
  assert.match(controls, /classes = \[\]/);
  assert.match(controls, /key:\s*entry\.classId/);
});

test('teacher controls advertise automatic pacing rather than requiring setup', () => {
  assert.match(controls, /Automatic pacing is active/);
  assert.match(controls, /No setup is required/);
  assert.match(controls, /Return to automatic/);
});

test('student screens no longer tell students to wait for teacher pacing', () => {
  assert.doesNotMatch(learningPath, /Your path opens once your teacher sets/);
  assert.doesNotMatch(recommended, /if \(!pacing \|\|/);
});
