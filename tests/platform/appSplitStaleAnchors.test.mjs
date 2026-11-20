/*
 * NO TEST SLICES APP ON AN ANCHOR THAT LEFT APP.
 *
 * Many source contracts read a region of a file: from indexOf('const startX')
 * to indexOf('const nextY'). When the App split moves `nextY` into a module,
 * the second indexOf is -1, slice(start, -1) runs to the end of the file, and
 * the test still passes while holding almost nothing (a positive match finds
 * its text anywhere; a scoped refusal becomes a whole-file one). Slices 3 and 4
 * left four of these behind; slice 6's review found them.
 *
 * So: a `const X` / `function X` anchor a test hands to indexOf, lastIndexOf or
 * split, which is in neither App.jsx nor the teacher workspace but IS in a
 * module App's code moved into, is allowed only in a test that names that
 * module (its hook or factory, or its file). A test that never mentions the
 * module is still slicing the file the anchor left. Only tests that read App
 * (App.jsx by name, or through helpers/appScreens.mjs) are scanned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { APP_PATH, TEACHER_WORKSPACE_PATH, appFactoryPaths, appHookPaths, appModulePaths, teacherControlPaths } from './helpers/appScreens.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const ANCHOR = /\.(?:indexOf|lastIndexOf|split)\(\s*(['"`])((?:\\n\s*)?(?:const|function|async function) (?:[^'"`\\]|\\.)+)\1/g;

const staleAnchors = (testText, kept, modules) => {
  const found = [];
  for (const [, , raw] of testText.matchAll(ANCHOR)) {
    const needle = raw.replace(/\\n/g, '\n').replace(/\\(['"`])/g, '$1');
    // A function or hook of App's own, not a local inside one (`const timer = setTimeout(`).
    if (!/^\s*(?:const \w+(?: = (?:async )?(?:\(|\w+ =>|use[A-Z]|$)| =)?$|const \w+ = (?:async )?(?:\(|\w+ =>|use[A-Z])|(?:async )?function \w+)/.test(needle)) continue;
    if (kept.includes(needle)) continue;
    const owners = modules.filter((module) => module.source.includes(needle));
    if (owners.length && !owners.some((module) => module.names.some((name) => testText.includes(name)))) found.push(`${JSON.stringify(needle)} is now in ${owners.map((module) => module.path).join(', ')}`);
  }
  return found;
};

const modules = () => {
  const namesByPath = {};
  for (const [name, path] of [...Object.entries(appHookPaths()), ...Object.entries(appFactoryPaths()), ...Object.entries(teacherControlPaths())]) (namesByPath[path] ||= []).push(name);
  return appModulePaths().map((path) => ({ path, source: read(path), names: [...(namesByPath[path] || []), path.split('/').pop()] }));
};

test('no source contract anchors a region of App on a declaration that moved to a module', () => {
  const kept = `${read(APP_PATH)}\n${read(TEACHER_WORKSPACE_PATH)}`;
  const moved = modules();
  assert.ok(moved.length >= 40, `only ${moved.length} modules found`);
  const problems = [];
  let anchors = 0;
  for (const file of readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.test.mjs'))) {
    const text = read(`tests/platform/${file}`);
    // Only a test that reads App can be slicing App.
    if (!/App\.jsx|appScreens\.mjs/.test(text)) continue;
    anchors += [...text.matchAll(ANCHOR)].length;
    for (const problem of staleAnchors(text, kept, moved)) problems.push(`${file}: ${problem}`);
  }
  assert.ok(anchors >= 60, `only ${anchors} anchors were read: the scan has stopped seeing them`);
  assert.deepEqual(problems, []);
});

test('the scan sees a stale anchor, and accepts one in a test that reads the module', () => {
  const kept = 'function App() {\n  const stays = 1;\n}\n';
  const moved = [{ path: 'src/app/student/gradingControls.js', source: 'export function createGradingControls() {\n  const handleGradeSubmit = async () => {};\n}\n', names: ['createGradingControls', 'gradingControls.js'] }];
  const slicingApp = "const end = app.indexOf('const handleGradeSubmit', start);";
  assert.deepEqual(staleAnchors(slicingApp, kept, moved), ['"const handleGradeSubmit" is now in src/app/student/gradingControls.js']);
  assert.deepEqual(staleAnchors(`const grading = appFactorySource('createGradingControls');\n${slicingApp.replace('app.', 'grading.')}`, kept, moved), []);
  assert.deepEqual(staleAnchors("app.indexOf('const stays')", kept, moved), []);
  assert.deepEqual(staleAnchors("app.indexOf('const neverExisted = ')", kept, moved), [], 'an anchor that is nowhere is another test\'s business');
});
