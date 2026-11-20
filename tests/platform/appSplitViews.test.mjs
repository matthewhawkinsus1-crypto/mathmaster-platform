/*
 * WHAT APP DRAWS LEFT APP, AS FUNCTIONS APP STILL CALLS.
 *
 * Slice 7 of the App split moved, verbatim, the functions that return what
 * App draws: the open assignment's workspace, the pieces around every student
 * screen, and the three dialogs App draws for a teacher.
 *
 * They stayed FUNCTIONS. Turning renderAssignmentWorkspace into a component
 * (<AssignmentWorkspace … />) would give React a new node in the tree: every
 * tool, draft and focus under it would remount once on the release that did
 * it, and App's renders would stop being the workspace's. So App calls
 * renderAssignmentWorkspace(preview) where it always did, and the elements it
 * returns sit in the same place in the same tree.
 *
 * What keeps the move honest:
 *
 *   - position: App's arguments and each module's parameters, and its result
 *     and the names App takes, are the same names in the same order;
 *   - the modules hold no hook, no state and no component;
 *   - App builds the student's views below the student navigation (the last
 *     thing they read), and nothing reads them during render before that;
 *   - the teacher's dialogs reach App through the teacher kit, so they are out
 *     of a student's first load, and App draws them only past the kit check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { planExtraction } from '../../scripts/codemods/extract-app-hook.mjs';
import { appFactoryPaths, appFactorySeam, appFactorySource, teacherControlPaths, teacherControlsSeam, teacherControlsSource } from './helpers/appScreens.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const STUDENT_VIEWS = {
  createAssignmentWorkspaceView: ['renderAssignmentWorkspace'],
  createStudentShellViews: [
    'renderStudentLiveChallengeInvite', 'studentActiveWarmup', 'renderStudentWarmupBanner', 'renderIdleOverlay',
    'renderWhatChangedPanel', 'renderStudentIdentityShell', 'renderStudentScreen',
  ],
};
const TEACHER_DIALOGS = ['renderDeleteAssignmentDialog', 'renderExportJsonDialog', 'renderTeacherScratchpadDialog'];

test('the student views are imported from src/app/student, called once by position, and return their functions in order', () => {
  for (const [name, returned] of Object.entries(STUDENT_VIEWS)) {
    assert.match(appFactoryPaths()[name] || '', /^src\/app\/student\/\w+\.jsx$/, name);
    assert.doesNotThrow(() => appFactorySource(name));
    const seam = appFactorySeam(name);
    assert.deepEqual(seam.returned, returned, `${name} returns what App takes`);
    assert.equal(new Set(seam.parameters).size, seam.parameters.length, `${name} names each parameter once`);
  }
  // The pack-up notice is drawn by the identity shell, inside the module: App never names it.
  assert.match(appFactorySource('createStudentShellViews'), /^ {2}const renderStudentPackUpNotice = /m);
  assert.ok(!appFactorySeam('createStudentShellViews').returned.includes('renderStudentPackUpNotice'), 'it is not handed back to App');
});

test('the teacher dialogs reach App through the teacher kit, with the seam in order', () => {
  assert.match(teacherControlPaths().createTeacherDialogViews || '', /^src\/app\/teacher\/controls\/teacherDialogViews\.jsx$/);
  assert.doesNotThrow(() => teacherControlsSource('createTeacherDialogViews'));
  assert.deepEqual(teacherControlsSeam('createTeacherDialogViews').returned, TEACHER_DIALOGS);
  const app = executableSource(read('src/App.jsx'));
  assert.doesNotMatch(app, /from '\.\/app\/teacher\/controls\//, 'App never imports a control module: it would join every first load');
  // App hands them to the teacher's screen only past the check that the kit is
  // here, and that screen calls them as the functions they are.
  const gate = app.indexOf('if (!teacherKit) {');
  assert.ok(gate > 0, 'the kit check was found');
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  for (const name of TEACHER_DIALOGS) {
    const handed = [...app.matchAll(new RegExp(`\\b${name}=\\{${name}\\}`, 'g'))].map((match) => match.index);
    assert.equal(handed.length, 1, `App hands ${name} to the teacher's screen`);
    assert.ok(handed[0] > gate, `${name} is handed over only past the kit check`);
    assert.match(workspace, new RegExp(`\\{${name}\\(\\)\\}`), `the teacher's screen calls ${name}()`);
    assert.doesNotMatch(app.replace(new RegExp(`\\b${name}=\\{${name}\\}`), ''), new RegExp(`\\b${name}\\b(?! *[,\\]])`), `App reads ${name} nowhere else`);
  }
});

test('they are functions App calls, not components: the tree React sees is the one it saw', () => {
  // Wherever one is drawn (App, the workspace view, the teacher's screen), it is called.
  const drawn = ['src/App.jsx', 'src/app/teacher/TeacherWorkspace.jsx', ...Object.keys(STUDENT_VIEWS).map((name) => appFactoryPaths()[name])].map((path) => executableSource(read(path))).join('\n');
  for (const fn of [...Object.values(STUDENT_VIEWS).flat(), ...TEACHER_DIALOGS]) {
    assert.match(drawn, new RegExp(`\\b${fn}\\(`), `${fn}(…) is called`);
    assert.doesNotMatch(drawn, new RegExp(`<${fn}\\b`), `${fn} is not mounted as a component`);
  }
  assert.match(executableSource(read('src/App.jsx')), /renderStudentIdentityShell\(renderAssignmentWorkspace\((?:true|false)\)/, 'App draws the workspace by calling it, inside the shell it calls');
  for (const path of [...Object.keys(STUDENT_VIEWS).map((name) => appFactoryPaths()[name]), teacherControlPaths().createTeacherDialogViews]) {
    const code = executableSource(read(path));
    assert.doesNotMatch(code, /^export default /m, `${path} exports no component`);
    assert.deepEqual([...code.matchAll(/^export (?:async )?function (\w+)/gm)].map(([, name]) => name).filter((name) => !/^create[A-Z]/.test(name)), [], `${path} exports only its factory`);
    assert.doesNotMatch(code, /\buse[A-Z]\w*\(/, `${path} calls no hook`);
    assert.doesNotMatch(code, /import \{[^}]*\b(?:useState|useEffect|useRef|useMemo|useCallback|memo)\b[^}]*\} from 'react'/, `${path} takes no hook from React`);
  }
});

test('nothing reads a student view during render above where App builds it, and the views follow the navigation they call', () => {
  const app = executableSource(read('src/App.jsx'));
  const at = (name) => { const index = app.indexOf(`= ${name}(`); assert.ok(index > 0, `${name} is called`); return index; };
  assert.ok(at('createStudentNavigation') < at('createStudentShellViews'), 'the shell is built below the navigation it calls');
  assert.ok(at('createStudentShellViews') < at('createAssignmentWorkspaceView'), 'the workspace is built below the shell pieces it draws');
  assert.ok(at('createAssignmentWorkspaceView') < app.indexOf('\n  useUrlArrival({'), 'and above the URL arrival and every screen App returns');
  for (const handed of ['renderIdleOverlay', 'renderStudentWarmupBanner', 'studentActiveWarmup']) {
    assert.ok(appFactorySeam('createAssignmentWorkspaceView').parameters.includes(handed), `the workspace is handed ${handed}`);
  }
  for (const name of Object.keys(STUDENT_VIEWS)) {
    const plan = planExtraction({
      source: 'src/App.jsx', component: 'App', hook: 'useProbe', file: 'src/app/student/useProbe.js', statements: [`~= ${name}(`],
    }, read);
    assert.ok(plan.outputList.length > 0, `${name}: the probe sees what the call declares`);
    assert.deepEqual(plan.problems.filter((problem) => /during render, above the call site/.test(problem)), [], name);
  }
});
