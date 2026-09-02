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

test('Warm-Up countdown is visible across teacher and student surfaces', () => {
  const home = read('src/TeacherHome.jsx');
  const workspace = read('src/ClassesWorkspace.jsx');
  const dashboard = read('src/components/student/StudentDashboardView.jsx');
  const app = read('src/App.jsx');

  assert.match(home, /DOLCountdown endsAt=\{state\.endsAt\}/);
  assert.match(workspace, /DOLCountdown endsAt=\{warmup\.endsAt\}/);
  assert.match(dashboard, /Warm-Up active now/);
  assert.match(dashboard, /DOLCountdown endsAt=\{state\.endsAt\}/);
  assert.match(app, /renderStudentWarmupBanner/);
  assert.match(app, /WARM-UP ACTIVE/);
  assert.match(app, /Warm-Up is active — start now/);
  assert.match(app, /Warm-Up reminder — timer is running/);
});

test('new assignments persist the ten-minute Warm-Up close default', () => {
  const app = read('src/App.jsx');
  assert.match(app, /closeMinutesAfterStart: 10/);
  assert.match(app, /manual-reopen-until-class-end/);
});
