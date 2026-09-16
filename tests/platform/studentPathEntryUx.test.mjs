import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../../src/components/student/StudentDashboardView.jsx', import.meta.url), 'utf8');
const pathSource = readFileSync(new URL('../../src/components/student/MyMathPathApp.jsx', import.meta.url), 'utf8');
const recommendationsSource = readFileSync(new URL('../../src/components/student/RecommendedSkills.jsx', import.meta.url), 'utf8');

test('student dashboard greets the roster student by canonical name with a neutral fallback', () => {
  assert.match(appSource, /const rosterDisplayName = formatStudentName\(/);
  assert.match(appSource, /lastFirst: false, fallbackToId: false/);
  assert.match(appSource, /displayName: rosterDisplayName \|\| session\.displayName \|\| 'Student'/);
  const dashboardCall = region(appSource, '<StudentDashboardView', '/>', 'student dashboard call');
  assert.match(dashboardCall, /student=\{\{ \.\.\.studentRecord, \.\.\.user,/);
  assert.match(dashboardSource, /Welcome, \{formatStudentName\(student, \{ lastFirst: false \}\)\}/);
});

test('recommended skill launch waits for secure coverage and then opens the selected TEKS', () => {
  const effectStart = pathSource.indexOf('// Launch once per target, but only AFTER secure coverage has loaded.');
  assert.notEqual(effectStart, -1);
  const effectSource = pathSource.slice(effectStart, effectStart + 1200);
  assert.match(effectSource, /!coverageLoaded/);
  assert.match(effectSource, /launchedRef\.current = launchTeksCode;\s*startSession\(launchTeksCode\);/s);
  assert.match(effectSource, /\[launchTeksCode, coverageLoaded, coverage\]/);
  assert.match(recommendationsSource, /onClick=\{\(\) => onChoose\?\.\(card\)\}/);
  assert.match(appSource, /setPathLaunchTeks\(code\);\s*setStudentDashboardMode\('mathPath'\);/s);
});
