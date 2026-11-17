/*
 * The first-load budget (scripts/lib/firstLoadBudget.mjs,
 * scripts/check-first-load-budget.mjs): what a student downloads before the
 * sign-in screen and before Home, and a teacher before their Home draws,
 * ratcheted against a checked-in baseline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ALLOWANCE_BYTES,
  TEACHER_HOME_KEYS,
  baselineFrom,
  compareToBaseline,
  criticalPaths,
  measurePaths,
  staticClosure,
} from '../../scripts/lib/firstLoadBudget.mjs';
import { importsComponent } from './helpers/componentImport.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

// A miniature Vite manifest: the entry loads the shell; App is a dynamic
// import with its own static graph; the teacher's kit and workspace are
// dynamic imports of App, the workspace's screens dynamic imports of it, and
// Pre-Flight's model a dynamic import of the workspace (an action's).
const manifest = {
  'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_react.js', '_firebase.js'], dynamicImports: ['src/App.jsx'], css: ['assets/index.css'] },
  '_react.js': { file: 'assets/react.js' },
  '_firebase.js': { file: 'assets/firebase.js' },
  'src/App.jsx': { file: 'assets/App.js', isDynamicEntry: true, imports: ['_react.js', '_mathjs.js'], dynamicImports: ['src/app/teacher/teacherKit.js', 'src/app/teacher/TeacherWorkspace.jsx'], css: ['assets/App.css'] },
  '_mathjs.js': { file: 'assets/mathjs.js', imports: ['_react.js'] },
  'src/app/teacher/teacherKit.js': { file: 'assets/teacherKit.js', isDynamicEntry: true, imports: ['_react.js', '_queue.js'] },
  '_queue.js': { file: 'assets/queue.js' },
  'src/app/teacher/TeacherWorkspace.jsx': { file: 'assets/TeacherWorkspace.js', isDynamicEntry: true, imports: ['_react.js', '_gradebook.js'], dynamicImports: ['src/TeacherHome.jsx', 'src/Panel.jsx', 'src/Preflight.jsx'], css: ['assets/teacherWorkspace.css'] },
  '_gradebook.js': { file: 'assets/gradebook.js' },
  'src/TeacherHome.jsx': { file: 'assets/TeacherHome.js', isDynamicEntry: true, imports: ['_charts.js'] },
  '_charts.js': { file: 'assets/charts.js' },
  'src/Panel.jsx': { file: 'assets/Panel.js', isDynamicEntry: true, imports: ['_mathjs.js'] },
  'src/Preflight.jsx': { file: 'assets/Preflight.js', isDynamicEntry: true, imports: ['_preflightModel.js'] },
  '_preflightModel.js': { file: 'assets/preflightModel.js' },
};
const teacherHomeKeys = ['src/app/teacher/teacherKit.js', 'src/app/teacher/TeacherWorkspace.jsx', 'src/TeacherHome.jsx', 'src/Panel.jsx'];

test('a path follows static imports and their CSS, never a dynamic import', () => {
  assert.deepEqual([...staticClosure(manifest, ['index.html'])].sort(), ['assets/firebase.js', 'assets/index.css', 'assets/index.js', 'assets/react.js']);
  const paths = criticalPaths(manifest, { teacherHomeKeys });
  assert.deepEqual(paths.signIn, ['assets/firebase.js', 'assets/index.css', 'assets/index.js', 'assets/react.js']);
  assert.ok(paths.studentHome.includes('assets/App.js') && paths.studentHome.includes('assets/mathjs.js') && paths.studentHome.includes('assets/App.css'));
  assert.ok(!paths.studentHome.includes('assets/TeacherHome.js') && !paths.studentHome.includes('assets/charts.js'), 'a lazily loaded teacher screen is not on a student path');
  assert.ok(!paths.studentHome.some((file) => /teacherKit|TeacherWorkspace|gradebook|queue/.test(file)), 'nor the teacher kit or workspace');
  // The student app's chunk renamed or gone: the budget fails, never measures
  // Home as sign-in alone ("below baseline").
  const renamed = { ...manifest };
  delete renamed['src/App.jsx'];
  assert.throws(() => criticalPaths(renamed, { teacherHomeKeys }), /no chunk for src\/App\.jsx/);
});

test("the teacher's path is the student's Home plus what a teacher's Home asks for, never an action's code", () => {
  const paths = criticalPaths(manifest, { teacherHomeKeys });
  assert.ok(paths.studentHome.every((file) => paths.teacherHome.includes(file)), 'a teacher loads App as a student does');
  assert.deepEqual(paths.teacherHome.filter((file) => !paths.studentHome.includes(file)), [
    'assets/Panel.js', 'assets/TeacherHome.js', 'assets/TeacherWorkspace.js', 'assets/charts.js', 'assets/gradebook.js',
    'assets/queue.js', 'assets/teacherKit.js', 'assets/teacherWorkspace.css',
  ], 'the kit, the workspace, Home and a panel, each with its static imports and CSS (mathjs, the panel\'s, counted once)');
  assert.ok(!paths.teacherHome.includes('assets/Preflight.js') && !paths.teacherHome.includes('assets/preflightModel.js'), 'what the workspace loads for an action is a later download');
  // A teacher's chunk renamed or made static: the budget fails and names it,
  // never measures Home without it.
  const renamed = { ...manifest };
  delete renamed['src/TeacherHome.jsx'];
  assert.throws(() => criticalPaths(renamed, { teacherHomeKeys }), /no chunk for src\/TeacherHome\.jsx: update TEACHER_HOME_KEYS/);
  // The real list against a build that lacks them all.
  assert.throws(() => criticalPaths(manifest), /no chunk for src\/TeacherSidebar\.jsx/);
});

// TEACHER_HOME_KEYS names what the workspace draws on Home before anything is
// opened: a production build at 4x CPU requests exactly these chunks between a
// teacher's sign-in and Home's heading. Each is a screen the workspace takes
// from lazyScreens.js (its own chunk), and each is drawn on Home.
test("the teacher's Home keys are the screens and panels the workspace draws on Home", () => {
  const workspacePath = 'src/app/teacher/TeacherWorkspace.jsx';
  const workspace = executableSource(readFileSync(new URL(`../../${workspacePath}`, import.meta.url), 'utf8'));
  const [kit, workspaceKey, ...screens] = TEACHER_HOME_KEYS;
  assert.equal(kit, 'src/app/teacher/teacherKit.js');
  assert.equal(workspaceKey, workspacePath);
  const names = screens.map((key) => key.split('/').pop().replace(/\.jsx$/, ''));
  // The sidebar and the panels, drawn whatever the tab (closed until opened),
  // and Home, the screen a teacher lands on, with the class bar above it.
  const everyScreen = ['TeacherSidebar', 'TeacherQuickSearch', 'ClassroomSyncReview', 'AssignmentHub', 'StudentProfileDrawer', 'SupportEvidenceReportView'];
  assert.deepEqual([...names].sort(), [...everyScreen, 'TeacherHome', 'ClassContextBar'].sort(), 'the list names exactly what Home draws');
  screens.forEach((key, index) => {
    assert.equal(importsComponent(workspacePath, names[index], key), 'onDemand', `${names[index]} is a chunk of its own, loaded by the workspace on demand`);
  });
  const shell = region(workspace, '{renderTeacherScratchpadDialog()}', '<div className="mm-dashboard-content"', 'the workspace around its screens');
  for (const name of everyScreen) assert.match(shell, new RegExp(`<${name}\\b`), `${name} is drawn on every screen`);
  assert.match(workspace, /\{teacherTab === 'home' && \(\s*<TeacherHome\b/);
  assert.match(workspace, /\{CLASS_SCOPED_TABS\[teacherTab\] && \([\s\S]{0,120}<ClassContextBar\b/);
});

test('the ratchet fails growth past the allowance and a path with no baseline, and passes a reduction', () => {
  const measured = measurePaths({ signIn: ['a', 'b'], studentHome: ['a', 'b', 'c'] }, (file) => ({ a: 1000, b: 2000, c: 50_000 })[file]);
  assert.deepEqual(measured, { signIn: { bytes: 3000, files: 2 }, studentHome: { bytes: 53_000, files: 3 } });
  const baseline = baselineFrom(measured);
  assert.equal(baseline.allowanceBytes, DEFAULT_ALLOWANCE_BYTES);
  assert.equal(compareToBaseline({ measured, baseline }).ok, true);
  const grown = { ...measured, signIn: { bytes: 3000 + DEFAULT_ALLOWANCE_BYTES + 1, files: 3 } };
  const over = compareToBaseline({ measured: grown, baseline });
  assert.equal(over.ok, false);
  assert.equal(over.over[0].name, 'signIn');
  const within = { ...measured, signIn: { bytes: 3000 + DEFAULT_ALLOWANCE_BYTES, files: 3 } };
  assert.equal(compareToBaseline({ measured: within, baseline }).ok, true, 'ordinary growth inside the allowance passes');
  const smaller = compareToBaseline({ measured: { ...measured, studentHome: { bytes: 40_000, files: 3 } }, baseline });
  assert.equal(smaller.ok, true);
  assert.equal(smaller.reduced[0].name, 'studentHome');
  assert.equal(compareToBaseline({ measured: { ...measured, newPath: { bytes: 1, files: 1 } }, baseline }).ok, false, 'a path with no baseline fails');
});

test('the checked-in baseline holds the measured split, and CI checks it after the production build', async () => {
  const baseline = JSON.parse(readFileSync(new URL('../../scripts/first-load-baseline.json', import.meta.url), 'utf8'));
  assert.ok(baseline.paths.signIn.bytes > 0 && baseline.paths.studentHome.bytes > 0);
  // A teacher's Home holds the student's (the same App) and more.
  assert.ok(baseline.paths.teacherHome.bytes > baseline.paths.studentHome.bytes && baseline.paths.teacherHome.files > baseline.paths.studentHome.files);
  // The point of the shell: the sign-in screen is a fraction of the app. Measured
  // 1,406 KB gzip for both before src/app/shell/AppShell.jsx; ~288 KB after.
  // Home itself shrank to ~847 KB when mathjs left the first load (pass 3 W5-1),
  // so the sign-in screen is now about a third of it, not less.
  assert.ok(baseline.paths.signIn.bytes < 400 * 1024, `sign-in baseline ${baseline.paths.signIn.bytes} B — the app is back on the sign-in path`);
  assert.ok(baseline.paths.signIn.bytes * 2 < baseline.paths.studentHome.bytes);
  const workflow = readFileSync(new URL('../../.github/workflows/full-platform-suite.yml', import.meta.url), 'utf8');
  const build = workflow.indexOf('run: npm run build\n');
  const budget = workflow.indexOf('run: node scripts/check-first-load-budget.mjs');
  assert.ok(build > 0 && budget > build, 'the budget runs after the production build in CI');
  // The config as Vite receives it, not its text: the production build writes
  // the manifest the budget reads (dist/.vite/manifest.json).
  const { default: viteConfig } = await import(new URL('../../vite.config.js', import.meta.url).href);
  const config = typeof viteConfig === 'function' ? viteConfig({ command: 'build', mode: 'production' }) : viteConfig;
  assert.equal(config.build?.manifest, true, 'the budget reads dist/.vite/manifest.json');
  const firebase = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
  assert.ok(firebase.hosting.ignore.includes('**/.*'), 'the manifest (dist/.vite) is never deployed');
});
