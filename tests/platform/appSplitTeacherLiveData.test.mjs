/*
 * A TEACHER'S LIVE DATA LEFT APP FOR HOOKS, AND THE SEAM LINES UP.
 *
 * The listeners and derived lists behind the teacher's screens (the roster,
 * the Action Center's streams, presence, Live Teaching, My Math Path and the
 * profile drawer) run effects, so unlike the teacher's controls they are hooks
 * App calls on every render (helpers/appScreens.mjs explains the seam). They
 * ride in every first load, so App hands them what they read by position,
 * which leaves no names in the bundle. Position is what this file holds:
 *
 *   - App's arguments and the hook's parameters, and the hook's result and
 *     the names App takes from it, are the same names in the same order;
 *   - a hook is called on every render, never behind a condition, because
 *     React needs the same hooks in the same order (scripts/app-hook-ledger.mjs
 *     holds the order against main).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { appHookPaths, positionalHookNames, positionalHookSeam, positionalHookSource, teacherControlsSeamProblem } from './helpers/appScreens.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const LIVE_DATA_HOOKS = [
  'useTeacherLearningPaths', 'useTeacherRosterData', 'useLiveTeachingPreviewSync', 'useTeacherActionCenterData',
  'useTeacherPresence', 'useLiveTeachingTimer', 'useTeacherAnalytics',
];

test('the teacher live-data hooks are hooks App imports from src/app/teacher and calls by position', () => {
  const paths = appHookPaths();
  const positional = positionalHookNames();
  for (const name of LIVE_DATA_HOOKS) {
    assert.match(paths[name] || '', /^src\/app\/teacher\/use\w+\.js$/, `${name} is imported from src/app/teacher`);
    assert.ok(positional.includes(name), `${name} takes its inputs by position`);
  }
});

test('every hook called by position: App passes its parameters and takes its results, name for name and in order', () => {
  const names = positionalHookNames();
  assert.ok(names.length >= LIVE_DATA_HOOKS.length, `only ${names.length} positional hooks found`);
  for (const name of names) {
    assert.doesNotThrow(() => positionalHookSource(name));
    const seam = positionalHookSeam(name);
    assert.ok(seam.parameters.length > 0, `${name} declares what it reads`);
    assert.equal(new Set(seam.parameters).size, seam.parameters.length, `${name} names each parameter once`);
  }
});

test('the check sees a seam that is out of order, short or renamed', () => {
  const seam = positionalHookSeam('useTeacherActionCenterData');
  assert.equal(teacherControlsSeamProblem('useTeacherActionCenterData', seam), null);
  const swap = (list) => [list[1], list[0], ...list.slice(2)];
  assert.match(teacherControlsSeamProblem('x', { ...seam, passed: swap(seam.passed) }), /passes .* but .* declares/);
  assert.match(teacherControlsSeamProblem('x', { ...seam, passed: seam.passed.slice(1) }), /passes .* but .* declares/);
  assert.match(teacherControlsSeamProblem('x', { ...seam, taken: swap(seam.taken) }), /takes .* but .* returns/);
  assert.match(teacherControlsSeamProblem('x', { ...seam, returned: [] }), /takes .* but .* returns/);
});

test('each hook runs on every render: App calls it once, at the top level of App, never behind the teacher kit', () => {
  const app = executableSource(read('src/App.jsx'));
  for (const name of LIVE_DATA_HOOKS) {
    const lines = app.split('\n').filter((line) => new RegExp(`\\b${name}\\(`).test(line));
    assert.equal(lines.length, 1, `${name} is called once`);
    assert.match(lines[0], /^ {2}\S/, `${name} is a top-level statement of App`);
    assert.doesNotMatch(lines[0], /\?/, `${name} is not conditional`);
  }
});

test('the hooks only read and fill what App owns: none declares state of its own', () => {
  for (const name of LIVE_DATA_HOOKS) {
    assert.doesNotMatch(executableSource(read(appHookPaths()[name])), /\buseState\(/, `${name} holds no state: App's state stays in App's fiber, in the same slots`);
  }
});
