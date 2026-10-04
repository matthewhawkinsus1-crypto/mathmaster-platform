import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('../../src/components/student/StudentDashboardView.jsx', import.meta.url), 'utf8');
const pathSource = readFileSync(new URL('../../src/components/student/MyMathPathApp.jsx', import.meta.url), 'utf8');
const recommendationsSource = readFileSync(new URL('../../src/components/student/RecommendedSkills.jsx', import.meta.url), 'utf8');

test('student dashboard hydrates identity from roster name, then session name, then neutral fallback', () => {
  assert.match(
    appSource,
    /import \{[^}]*resolveStudentDisplayName[^}]*\} from ['"]\.\/platform\/studentName['"]/,
    'App must import the resolver it calls so JSX cannot ship a free-identifier runtime error',
  );
  // Ends where the canonical tracker is loaded, right after the session user
  // (and its display name) is set.
  const hydration = region(
    appSource,
    'const studentDisplayName = resolveStudentDisplayName(',
    'setTracker(',
    'student identity hydration',
  );
  assert.match(hydration, /rosterStudent: \{ \.\.\.studentData, id: studentId \}/);
  assert.match(hydration, /sessionDisplayName: session\.displayName/);
  // The resolver knows the student's id, so a passcode session whose only
  // "name" is that id can never become the greeting.
  const resolverCall = region(hydration, 'resolveStudentDisplayName({', '});', 'resolver call');
  assert.match(resolverCall, /^\s*studentId(: studentId)?,?\s*$/m);
  assert.match(hydration, /displayName: studentDisplayName/);
  const dashboardCall = region(appSource, '<StudentDashboardView', '/>', 'student dashboard call');
  assert.match(dashboardCall, /student=\{\{ \.\.\.studentRecord, \.\.\.user,/);
  // No name on file greets the student with the neutral "Student", never the
  // teacher-facing "Name unavailable" and never the id.
  assert.match(dashboardSource, /Welcome, \{formatStudentName\(student, \{ lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL \}\)\}/);
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
