/*
 * ROUTING LEFT APP, AND THE SEAMS LINE UP.
 *
 * Slice 5 of the App split moved, verbatim:
 *
 *   useStudentBrowserHistory, useTeacherBrowserHistory
 *       the route memos, the History API effects and the teacher's popstate
 *       restore: hooks App calls on every render, where the code was;
 *   createStudentNavigation, createTeacherPreviewNavigation
 *       startAssignment, the dashboard's screens, a result, a Live Challenge,
 *       a Recovery, View as Student and Teach Live: plain functions, built on
 *       every render as they were inline.
 *
 * All four take what they read by position, so position is held here
 * (helpers/appScreens.mjs). Two more things keep the move honest:
 *
 *   - a factory is not a hook and holds none: App calls createStudentNavigation
 *     further down than the functions used to sit (below the last thing they
 *     read), which is only the same program if building them has no effect;
 *   - nothing reads the functions during render above that call. The functions
 *     are `const`, so an early read would throw; this test fails first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { planExtraction } from '../../scripts/codemods/extract-app-hook.mjs';
import {
  appFactoryPaths, appFactorySeam, appFactorySource, appHookPaths, positionalHookSeam, positionalHookSource, teacherControlsSeamProblem,
} from './helpers/appScreens.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const HOOKS = ['useStudentBrowserHistory', 'useTeacherBrowserHistory'];
const FACTORIES = ['createStudentNavigation', 'createTeacherPreviewNavigation'];

test('the routing hooks and factories are imported from src/app and called once, by position, with the seam in order', () => {
  for (const name of HOOKS) {
    assert.match(appHookPaths()[name] || '', /^src\/app\/(student|teacher)\/use\w+\.js$/, name);
    assert.doesNotThrow(() => positionalHookSource(name));
    assert.ok(positionalHookSeam(name).parameters.length > 0, `${name} declares what it reads`);
  }
  for (const name of FACTORIES) {
    assert.match(appFactoryPaths()[name] || '', /^src\/app\/(student|teacher)\/\w+\.js$/, name);
    assert.doesNotThrow(() => appFactorySource(name));
    const seam = appFactorySeam(name);
    assert.ok(seam.returned.length > 0, `${name} returns its functions`);
    assert.equal(new Set(seam.parameters).size, seam.parameters.length, `${name} names each parameter once`);
  }
});

test('the check sees a factory seam that is out of order, short or renamed', () => {
  const seam = appFactorySeam('createStudentNavigation');
  assert.equal(teacherControlsSeamProblem('x', seam), null);
  const swap = (list) => [list[1], list[0], ...list.slice(2)];
  assert.match(teacherControlsSeamProblem('x', { ...seam, passed: swap(seam.passed) }), /passes .* but .* declares/);
  assert.match(teacherControlsSeamProblem('x', { ...seam, taken: swap(seam.taken) }), /takes .* but .* returns/);
  assert.match(teacherControlsSeamProblem('x', { ...seam, returned: seam.returned.slice(1) }), /takes .* but .* returns/);
});

test('where a student goes is in one module: startAssignment and the screens it opens', () => {
  const seam = appFactorySeam('createStudentNavigation');
  for (const name of [
    'startAssignment', 'openStudentDashboardMode', 'navigateStudent', 'openStudentOriginLevel', 'openStudentAssignmentResult',
    'joinLiveChallenge', 'leaveLiveChallenge', 'startStudentRecovery', 'openStudentRecovery',
  ]) {
    assert.ok(seam.returned.includes(name), `${name} comes from createStudentNavigation`);
    assert.match(seam.source, new RegExp(`^ {2}(?:const ${name} = |function ${name}\\()`, 'm'), `${name} is defined there`);
    assert.doesNotMatch(executableSource(read('src/App.jsx')), new RegExp(`(?:const|function) ${name}\\b(?! *[,\\]])`), `App no longer defines ${name}`);
  }
  assert.deepEqual(appFactorySeam('createTeacherPreviewNavigation').returned, ['startTeacherPreview', 'teachAssignmentLive', 'resumeLiveTeaching']);
});

test('a factory holds no hook and no state, so building it later in the render changes nothing', () => {
  for (const name of FACTORIES) {
    const code = executableSource(read(appFactoryPaths()[name]));
    assert.doesNotMatch(code, /\buse[A-Z]\w*\(/, `${name} calls no hook`);
    assert.doesNotMatch(code, /from 'react'/, `${name} imports nothing from React`);
  }
});

test('the routing hooks declare no state of their own: App keeps the screen, the route refs and the dialogs', () => {
  for (const name of HOOKS) assert.doesNotMatch(executableSource(read(appHookPaths()[name])), /\buse(State|Ref)\(/, name);
  const app = executableSource(read('src/App.jsx'));
  for (const ref of ['studentBrowserHistoryReadyRef', 'studentBrowserRouteRef', 'studentBrowserUrlRef', 'historyAccountRef', 'teacherBrowserHistoryReadyRef', 'teacherHistoryStepBackAtRef', 'teacherHistoryRestoreRef']) {
    assert.match(app, new RegExp(`const ${ref} = useRef\\(`), `App owns ${ref}`);
  }
});

test('nothing reads the student navigation during render above where App builds it', () => {
  // The extraction tool's own reading of App (an AST, not a regex): were the call
  // statement moved into a module called from the same place, it reports every
  // statement above it that reads one of its results during render. A read inside
  // a handler or an effect runs later and is not reported.
  const plan = planExtraction({
    source: 'src/App.jsx', component: 'App', hook: 'useProbe', file: 'src/app/student/useProbe.js', statements: ['~createStudentNavigation('],
  }, read);
  const seam = appFactorySeam('createStudentNavigation');
  assert.deepEqual(plan.outputList.slice().sort(), seam.returned.filter((name) => plan.outputList.includes(name)).sort());
  assert.ok(plan.outputList.includes('startAssignment'), 'the probe sees what the call declares');
  assert.deepEqual(plan.problems.filter((problem) => /during render, above the call site/.test(problem)), []);
});

test('the probe does report an early read (so the check above can fail)', () => {
  const app = read('src/App.jsx');
  const withEarlyRead = app.replace(/\n( {2}const \[studentBrowserRoute,)/, '\n  const earlyRead = startAssignment;\n$1');
  assert.notEqual(withEarlyRead, app);
  const plan = planExtraction({
    source: 'src/App.jsx', component: 'App', hook: 'useProbe', file: 'src/app/student/useProbe.js', statements: ['~createStudentNavigation('],
  }, (path) => (path === 'src/App.jsx' ? withEarlyRead : read(path)));
  assert.match(plan.problems.join('\n'), /reads output startAssignment during render, above the call site/);
});
