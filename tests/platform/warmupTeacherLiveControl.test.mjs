import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('teacher live hub keeps stale-date Warm-Up controls visible', () => {
  const home = read('src/TeacherHome.jsx');
  assert.match(home, /state\.enabled && state\.window && state\.status !== 'ended'/);
  assert.match(home, /Open Warm-Up Today/);
  assert.match(home, /\['notToday', 'unscheduled'\]/);
});

test('class workspace exposes the same manual Warm-Up open control', () => {
  const workspace = read('src/ClassesWorkspace.jsx');
  assert.match(workspace, /Open Warm-Up Today/);
  assert.match(workspace, /\['active', 'closed', 'notToday', 'unscheduled'\]/);
});

test('manual Warm-Up open is scoped to the real class and today', () => {
  const app = read('src/App.jsx');
  assert.match(app, /instructionDatesByClassId/);
  assert.match(app, /instructionDatesByClassId\[classId\] = dateKey/);
  assert.match(app, /needsOpenToday/);
  assert.match(app, /Open Warm-Up Today/);
});
