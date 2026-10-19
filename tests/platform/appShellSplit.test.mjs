/*
 * The App shell split (student push G): App.jsx's screens and concerns move
 * into src/app/** one slice at a time, behaviour unchanged.
 *
 * AGENTS.md's trap — a call with no import — is caught for every moved
 * identifier by lint: `no-undef` covers src/** (.oxlintrc.json), and src/app/**
 * also refuses the browser globals a moved name could silently fall back to
 * (`history`, `name`, `status`, `event`…), which no-undef cannot see. These
 * tests hold that configuration and each slice's seams in place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const appCode = executableSource(app);

test('lint refuses free identifiers in App and every moved module, and browser-global fallbacks in src/app', () => {
  const config = JSON.parse(read('.oxlintrc.json'));
  const src = config.overrides.find((entry) => entry.files.includes('src/**'));
  assert.equal(src?.rules?.['no-undef'], 'error', 'no-undef must cover src/** (App.jsx and src/app/**)');
  const shell = config.overrides.find((entry) => entry.files.includes('src/app/**'));
  const [level, ...globals] = shell?.rules?.['no-restricted-globals'] || [];
  assert.equal(level, 'error');
  // The full confusing-browser-globals set.
  for (const name of ['history', 'location', 'name', 'status', 'event', 'length', 'open', 'close', 'top', 'parent', 'self', 'origin', 'confirm',
    'scrollY', 'scrollTo', 'outerWidth', 'onload', 'screenX', 'pageYOffset', 'toolbar', 'frameElement', 'menubar']) {
    assert.ok(globals.includes(name), `a moved \`${name}\` would silently read window.${name}`);
  }
});

const teacherWorkspace = read('src/app/teacher/TeacherWorkspace.jsx');
const teacherWorkspaceCode = executableSource(teacherWorkspace);
const importedFrom = (module, source = app) => {
  const match = source.match(new RegExp(`import \\{([^}]*)\\} from '${module.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}';`));
  return match ? match[1].split(',').map((name) => name.trim()).filter(Boolean) : [];
};
const exportsOf = (path) => [...read(path).matchAll(/^export const ([A-Za-z0-9_$]+)/gm)].map((match) => match[1]);

test('every moved helper, scope table and lazy screen is imported by App and declared nowhere in it', () => {
  for (const [module, path] of [
    ['./app/student/assignmentRuntimeHelpers.js', 'src/app/student/assignmentRuntimeHelpers.js'],
    ['./app/screenScopes.js', 'src/app/screenScopes.js'],
    ['./app/lazyScreens.js', 'src/app/lazyScreens.js'],
  ]) {
    const exported = exportsOf(path);
    // Since G2 the teacher's screen (src/app/teacher/TeacherWorkspace.jsx)
    // takes what only it uses; between them, App and it import exactly what
    // the module exports.
    const imported = [...new Set([...importedFrom(module), ...importedFrom(module.replace('./app/', '../'), teacherWorkspace)])];
    assert.ok(exported.length > 0, `${path} exports nothing`);
    assert.deepEqual([...imported].sort(), [...exported].sort(), `${module}: App and the teacher workspace import exactly what the module exports`);
    for (const name of exported) {
      assert.doesNotMatch(appCode, new RegExp(`^\\s*(?:const|let|function) ${name}\\b`, 'm'), `${name} is declared in App.jsx as well`);
      assert.doesNotMatch(teacherWorkspaceCode, new RegExp(`^\\s*(?:const|let|function) ${name}\\b`, 'm'), `${name} is declared in TeacherWorkspace.jsx as well`);
    }
  }
});

test('every screen in lazyScreens.js is a lazy import, so none joins the first load', () => {
  const screens = read('src/app/lazyScreens.js');
  const declarations = [...screens.matchAll(/^export const ([A-Za-z0-9]+) = (.*)$/gm)];
  assert.ok(declarations.length >= 30);
  for (const [, name, value] of declarations) {
    // A screen (`lazy`), or a teacher-only panel (`teacherPanel`, the same
    // lazy import inside its own Suspense boundary). GradebookClassChooser is
    // a named export, so it is picked out of the loaded module.
    assert.match(value, /^(?:lazy|teacherPanel)\(\(\) => import\('\.\.\/[^']+\.jsx'\)(?:\.then\(\(module\) => \(\{ default: module\.[A-Za-z]+ \}\)\))?\);$/, `${name} is not a lazy import`);
  }
  assert.doesNotMatch(executableSource(screens), /^import (?!\{ Suspense, createElement, lazy \} from 'react')/m, 'lazyScreens.js imports a screen eagerly');
});

/*
 * G2: the teacher-only panels App drew from static imports (and the modules
 * only they reach) left student Home's first load. A panel is the same lazy
 * import wrapped in its own Suspense boundary with nothing as its fallback:
 * App's JSX is unchanged, and a panel still loading never suspends up to
 * AppShell's boundary, which would hide the whole teacher workspace.
 */
const TEACHER_PANELS = {
  SupportEvidenceReportView: 'components/teacher/SupportEvidenceReportView.jsx',
  ClassContextBar: 'components/teacher/ClassContextBar.jsx',
  WeeklyPathGradePanel: 'components/teacher/WeeklyPathGradePanel.jsx',
  ClassroomSyncReview: 'components/teacher/ClassroomSyncReview.jsx',
  TeacherQuickSearch: 'components/teacher/TeacherQuickSearch.jsx',
  StudentProfileDrawer: 'components/teacher/StudentProfileDrawer.jsx',
  AssignmentHub: 'components/teacher/AssignmentHub.jsx',
  GradebookAssignmentBar: 'components/teacher/GradebookAssignmentBar.jsx',
  GradebookClassChooser: 'components/teacher/GradebookAssignmentBar.jsx',
  StudentResponseInspector: 'components/teacher/StudentResponseInspector.jsx',
  AssignmentGradeOverrideControls: 'components/teacher/AssignmentGradeOverrideControls.jsx',
  SectionRecoveryAuditTrail: 'components/teacher/SectionRecoveryAuditTrail.jsx',
  StudentDolRecoveryRow: 'components/teacher/StudentDolRecoveryRow.jsx',
  ClassRewardCatalogEditor: 'components/rewards/ClassRewardCatalogEditor.jsx',
  ClassRewardRequestsPanel: 'components/rewards/ClassRewardRequestsPanel.jsx',
  WeeklyPathControls: 'components/teacher/WeeklyPathControls.jsx',
  SignInAccess: 'SignInAccess.jsx',
  ClassesAdmin: 'components/admin/ClassesAdmin.jsx',
  PreproductionReset: 'components/admin/PreproductionReset.jsx',
  AssignmentAiHealth: 'components/admin/AssignmentAiHealth.jsx',
  PathCoverageAudit: 'components/teacher/PathCoverageAudit.jsx',
  AttendanceHistoryPanel: 'components/teacher/AttendanceHistoryPanel.jsx',
  ParentContactCenter: 'components/teacher/ParentContactCenter.jsx',
  TeacherActionCenter: 'components/teacher/TeacherActionCenter.jsx',
};

test('the teacher-only panels load on demand, each inside its own Suspense boundary', () => {
  const screens = executableSource(read('src/app/lazyScreens.js'));
  const helper = screens.match(/const teacherPanel = \(load\) => \{\s*const Lazy = lazy\(load\);\s*const Panel = \(props\) => createElement\(Suspense, \{ fallback: null \}, createElement\(Lazy, props\)\);\s*return Panel;\s*\};/);
  assert.ok(helper, 'teacherPanel: lazy, inside Suspense with no fallback, every prop passed through');
  // Taken by App or, since the teacher's screen left App, by TeacherWorkspace.
  const imported = [...importedFrom('./app/lazyScreens.js'), ...importedFrom('../lazyScreens.js', teacherWorkspace)];
  for (const [name, path] of Object.entries(TEACHER_PANELS)) {
    assert.match(screens, new RegExp(`^export const ${name} = teacherPanel\\(\\(\\) => import\\('\\.\\./${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}'\\)`, 'm'), `${name} loads ${path} on demand`);
    assert.ok(imported.includes(name), `App or the teacher workspace takes ${name} from lazyScreens.js`);
    // No static import of the component's file is left in App or the workspace.
    assert.doesNotMatch(app, new RegExp(`^import [^;]* from '\\./${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}';$`, 'm'), `App still imports ${path} statically`);
    assert.doesNotMatch(teacherWorkspace, new RegExp(`^import [^;]* from '\\.\\./\\.\\./${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}';$`, 'm'), `TeacherWorkspace imports ${path} statically`);
  }
});

/*
 * G2: the teacher's whole screen — App's `if (user.role === 'teacher')`
 * branch — is src/app/teacher/TeacherWorkspace.jsx, loaded on demand. Moved
 * verbatim; every input is explicit. App passes each prop as `name={name}`, so
 * the workspace reads exactly what the branch read. A prop App forgot is
 * undefined at runtime with nothing to catch it: the two lists must agree.
 */
test('the teacher workspace is App\'s teacher branch, given every input it reads by name', () => {
  const screens = read('src/app/lazyScreens.js');
  assert.match(screens, /^export const TeacherWorkspace = lazy\(\(\) => import\('\.\.\/app\/teacher\/TeacherWorkspace\.jsx'\)\);$/m);
  assert.ok(importedFrom('./app/lazyScreens.js').includes('TeacherWorkspace'));
  const signature = teacherWorkspace.match(/^export default function TeacherWorkspace\(\{\n([\s\S]*?)\n\}\) \{$/m);
  assert.ok(signature, 'the workspace destructures its props by name');
  const props = signature[1].split('\n').map((line) => line.trim().replace(/,$/, ''));
  assert.ok(props.length > 200 && props.every((name) => /^[A-Za-z_$][\w$]*$/.test(name)), 'one plain name per line');
  const branch = appCode.match(/\n {2}if \(user\.role === 'teacher'\) \{\n([\s\S]*?)\n {4}return \(\s*<TeacherWorkspace\n([\s\S]*?)\n {6}\/>\s*\);\s*\}\n/);
  assert.ok(branch, 'App\'s teacher branch renders the workspace and nothing else');
  // Before the workspace, only the wait for the teacher kit (first load 2,
  // app/teacher/teacherKit.js): a failed load goes to AppErrorBoundary, and
  // until the kit is here the teacher sees AppShell's own loading state.
  assert.match(branch[1].trim(), /^if \(teacherKitError\) throw teacherKitError;\s*if \(!teacherKit\) \{\s*return <SessionGate authStatus="loading" hydrationError=\{null\} hydrating launchAssignment=\{null\} onSignOut=\{[^\n]*\} \/>;\s*\}$/, 'the teacher branch waits for the teacher kit and nothing else');
  const passed = branch[2].split('\n').map((line) => line.trim());
  assert.deepEqual(passed, props.map((name) => `${name}={${name}}`), 'App passes exactly the props the workspace reads, each under its own name');
  // The branch's position is unchanged: after the preview, before the student screens.
  assert.ok(appCode.indexOf('if (isTeacherPreview) {') < branch.index);
  assert.ok(branch.index < appCode.indexOf("if (user.role === 'student' && activeView === 'dashboard') {"));
  // Every prop is something App declares or imports (nothing reaches the
  // workspace as undefined).
  for (const name of props) {
    assert.match(app, new RegExp(`(?:\\bconst \\[?\\s*${name}\\b|\\bconst \\[[^\\]]*\\b${name}\\b[^\\]]*\\]|\\bconst \\{[^}]*\\b${name}\\b[^}]*\\}|\\bfunction ${name}\\(|^import [^;]*\\b${name}\\b[^;]*;|\\blet ${name}\\b)`, 'm'), `${name} is declared or imported in App`);
  }
  // Hooks stay in App: the branch had none, and the workspace calls none.
  assert.doesNotMatch(teacherWorkspaceCode, /\buse[A-Z]\w*\(/);
});

test('the session gate renders for any screen that does not belong to the account signed in now', () => {
  const call = appCode.match(/if \(!userIsSignedInAccount\) \{\s*return \(\s*(<SessionGate\b[\s\S]*?\/>)\s*\);\s*\}/);
  assert.ok(call, 'App returns the session gate for a screen that is not this account\'s');
  // The seam between App and the gate: every state the inline JSX read.
  assert.match(call[1], /authStatus=\{auth\.status\}/);
  assert.match(call[1], /hydrationError=\{sessionHydrationError\}/);
  assert.match(call[1], /hydrating=\{sessionHydrating\}/);
  assert.match(call[1], /launchAssignment=\{launchAssignment\}/);
  assert.match(call[1], /onSignOut=\{\(\) => \{ resetAddressToHome\(\); auth\.signOut\(\); \}\}/);
  assert.match(app, /^import SessionGate from '\.\/app\/shell\/SessionGate\.jsx';$/m);
  const gate = executableSource(read('src/app/shell/SessionGate.jsx'));
  assert.match(gate, /if \(authStatus === 'signedOut' \|\| authStatus === 'linking'\) return <LoginScreen launchAssignment=\{launchAssignment\} \/>;/);
  assert.match(gate, /^import LoginScreen from '\.\.\/\.\.\/LoginScreen\.jsx';$/m);
  assert.match(gate, /onClick=\{onSignOut\}/);
  assert.match(gate, /if \(hydrationError\) \{[\s\S]*MathMaster could not load your account[\s\S]*\{hydrationError\}/);
  assert.match(gate, /\{hydrating \? 'Loading your MathMaster workspace…' : 'Finishing sign in…'\}/);
});

test('nothing under src/app imports App.jsx back (the shell depends on screens, never the reverse)', () => {
  const walk = (dir) => readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
  for (const file of walk('src/app')) {
    assert.doesNotMatch(read(file), /from '(?:\.\.\/)+App(?:\.jsx)?'/, `${file} imports App.jsx`);
  }
});

test('the app shell shows sign-in itself, names it, prefetches App, and keeps App mounted once loaded', () => {
  const shell = executableSource(read('src/app/shell/AppShell.jsx'));
  assert.match(read('src/main.jsx'), /^import AppShell from '\.\/app\/shell\/AppShell\.jsx';$/m);
  assert.doesNotMatch(executableSource(read('src/main.jsx')), /import App from/);
  assert.match(shell, /const accountPresent = \(status\) => status === 'ready';/);
  // Once wanted, always wanted: everything after the first sign-in is App's.
  assert.match(shell, /if \(accountPresent\(auth\.status\)\) setAppWanted\(true\);/);
  assert.doesNotMatch(shell, /setAppWanted\(false\)/);
  assert.match(shell, /useDocumentTitle\(appWanted \? null : pageTitleFor\(\{ signedIn: false \}\)\);/);
  assert.match(shell, /window\.requestIdleCallback\(prefetch/);
  assert.match(shell, /if \(!appWanted\) return gate;/);
  // The launch preview reads only ?launch=, never the lifecycle-heavy route module.
  assert.doesNotMatch(executableSource(read('src/app/shell/useClassroomLaunchPreview.js')), /from '[^']*classroomLaunchRoute/);
});

test('student Home prefetches the question runtime at idle, the chunk an assignment opens with', () => {
  const effect = appCode.slice(appCode.indexOf('const questionEnginePrefetchedRef = useRef(false);'), appCode.indexOf('}, [user?.role, activeView]);'));
  assert.ok(effect.length > 0, 'the prefetch effect');
  assert.match(effect, /user\?\.role !== 'student' \|\| activeView !== 'dashboard'/);
  assert.match(effect, /import\('\.\/QuestionEngine\.jsx'\)/, 'the same module app/lazyScreens.js loads lazily');
  assert.match(effect, /requestIdleCallback\(prefetch/);
  assert.match(read('src/app/lazyScreens.js'), /export const QuestionEngine = lazy\(\(\) => import\('\.\.\/QuestionEngine\.jsx'\)\);/);
});

// G2 review: stylesheets App used to get through modules that moved with the
// teacher's screen must still link BEFORE App.css, as at 805b69e2. App.css's
// coarse-pointer `.mm-dashboard-content` rules (22px checkboxes, 12px cells,
// 52px controls, large-screen headings) tie on specificity with rules in the
// teacher sheets and win only by order. They reach App through one shared
// module that App and the workspace both import, so the bundler gives it a
// chunk of its own, linked before App's CSS. (Checked against the built
// manifest at the time: the CSS App links, concatenated in order, equals
// 805b69e2's.)
test('the teacher and phone stylesheets link before App.css, in the order they had', () => {
  const leading = read('src/app/shell/leadingStyles.js');
  const sheets = [...executableSource(leading).matchAll(/^import '([^']+\.css)';$/gm)].map((match) => match[1]);
  assert.deepEqual(sheets, [
    '../../components/teacher/supportEvidence.css',
    '../../components/teacher/teacherWorkspace.css',
    '../../platform/mobile/MobileInteractionFoundation.css',
  ]);
  const shared = "import './app/shell/leadingStyles.js';";
  assert.ok(app.indexOf(shared) > 0 && app.indexOf(shared) < app.indexOf("import './App.css';"), 'App imports them ahead of App.css');
  assert.match(teacherWorkspace, /^import '\.\.\/shell\/leadingStyles\.js';$/m, 'the workspace shares the module, so it is its own chunk');
  assert.doesNotMatch(executableSource(app), /^import '\.\/(?:components\/teacher\/(?:supportEvidence|teacherWorkspace)|platform\/mobile\/MobileInteractionFoundation)\.css';$/m,
    'imported straight from App they would link after App.css');
});
