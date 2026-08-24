import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const roster = fs.readFileSync('src/components/teacher/StudentsRoster.jsx', 'utf8');
const pathApp = fs.readFileSync('src/components/student/MyMathPathApp.jsx', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');

test('Students roster embeds the real My Math Path app', () => {
  assert.match(roster, /import MyMathPathApp from '..\/student\/MyMathPathApp\.jsx'/);
  assert.match(roster, /<MyMathPathApp[\s\S]*readOnly[\s\S]*initialTab="dashboard"/);
});

test('teacher path inspector receives real path inputs', () => {
  assert.match(app, /<StudentsRoster[\s\S]*assignments=\{assignments\}[\s\S]*pacingByClass=\{pacingByClass\}[\s\S]*skillOverrides=\{skillOverrides\}/);
});

test('read-only My Math Path blocks practice sessions', () => {
  assert.match(pathApp, /if \(readOnly\) \{[\s\S]*teacherReadOnlyNotice[\s\S]*return;/);
});

test('read-only My Math Path blocks CCMR goal writes', () => {
  assert.match(pathApp, /const changeGoals = useCallback\(\(next\) => \{[\s\S]*if \(readOnly\)/);
});

test('teacher read-only mode keeps the CCMR explorer but prevents writes and practice', () => {
  assert.match(pathApp, /const visibleTabs = TABS/);
  assert.match(pathApp, /<CCMRHub[\s\S]*readOnly=\{readOnly\}/);
});
