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
import { posix } from 'node:path';
import { appFactoryPaths, appFactorySource, appHookPaths, appHookSource } from './helpers/appScreens.mjs';

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
    // Since the App split a name only moved code used went with that code
    // into its hook (DISPLAYED_CHECKPOINT_OUTCOMES: useDolCheckpointReceipts),
    // so the hooks App calls count too, each by its own relative path.
    // Since slice 5 the same holds for the factories App calls (the tracker
    // builders went with startAssignment into createStudentNavigation and
    // with the preview into createTeacherPreviewNavigation). A factory is a
    // module's own `export function createX(`: the helper modules' create*
    // builders are `export const`, and are what is being counted here.
    const factories = Object.entries(appFactoryPaths())
      .filter(([factoryName, factoryPath]) => new RegExp(`^export function ${factoryName}\\(`, 'm').test(read(factoryPath)));
    assert.ok(factories.length >= 2, 'App calls its navigation factories');
    const hooks = [
      ...Object.entries(appHookPaths()).map(([hookName, hookPath]) => [hookName, hookPath, appHookSource(hookName)]),
      ...factories.map(([factoryName, factoryPath]) => [factoryName, factoryPath, appFactorySource(factoryName)]),
    ].map(([hookName, hookPath, source]) => {
      const relative = posix.relative(posix.dirname(hookPath), path);
      return { hookName, source, module: relative.startsWith('.') ? relative : `./${relative}` };
    });
    const imported = [...new Set([
      ...importedFrom(module),
      ...importedFrom(module.replace('./app/', '../'), teacherWorkspace),
      ...hooks.flatMap((hook) => importedFrom(hook.module, hook.source)),
    ])];
    assert.ok(exported.length > 0, `${path} exports nothing`);
    assert.deepEqual([...imported].sort(), [...exported].sort(), `${module}: App, the teacher workspace and App's hooks import exactly what the module exports`);
    for (const name of exported) {
      assert.doesNotMatch(appCode, new RegExp(`^\\s*(?:const|let|function) ${name}\\b`, 'm'), `${name} is declared in App.jsx as well`);
      assert.doesNotMatch(teacherWorkspaceCode, new RegExp(`^\\s*(?:const|let|function) ${name}\\b`, 'm'), `${name} is declared in TeacherWorkspace.jsx as well`);
      for (const hook of hooks) {
        assert.doesNotMatch(executableSource(hook.source), new RegExp(`^\\s*(?:const|let|function) ${name}\\b`, 'm'), `${name} is declared in ${hook.hookName} as well`);
      }
    }
  }
});

test('every screen in lazyScreens.js is a lazy import, so none joins the first load', () => {
  const screens = read('src/app/lazyScreens.js');
  const declarations = [...screens.matchAll(/^export const ([A-Za-z0-9]+) = (.*)$/gm)];
  assert.ok(declarations.length >= 30);
  for (const [, name, value] of declarations) {
    // A screen (`lazy`), a teacher-only panel (`teacherPanel`, the same
    // lazy import inside its own Suspense boundary), a student screen
    // (`studentScreen`, PF01: the same, with its own boundary for code that
    // cannot load, and the words it shows while it loads), or a panel of a
    // student screen (`studentPanel`: the same, in the screen's flow, with its
    // words given by name). GradebookClassChooser is a named export, so it is
    // picked out of the loaded module. QuestionEngine is App's lazy import
    // memoised (`memo(lazy(…))`): still loaded on demand.
    assert.match(value, /^(?:memo\(lazy\(\(\) => import\('\.\.\/[^']+\.jsx'\)\)|(?:lazy|teacherPanel)\(\(\) => import\('\.\.\/[^']+\.jsx'\)(?:\.then\(\(module\) => \(\{ default: module\.[A-Za-z]+ \}\)\))?|studentScreen\(\(\) => import\('\.\.\/[^']+\.jsx'\), '[^']+'|studentPanel\(\(\) => import\('\.\.\/[^']+\.jsx'\), \{ name: '[^']+', loading: '[^']+', codeTitle: '[^']+' \})\);$/, `${name} is not a lazy import`);
  }
  // Eagerly, React and what a student screen wraps itself in: never a screen.
  const eager = [...executableSource(screens).matchAll(/^import\s+(?:[^;]*?\s+from\s+)?'([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(eager, [
    'react',
    '../components/common/ScreenErrorBoundary.jsx',
    '../platform/runtime/retryableChunk.js',
    '../platform/student/navigationModel.js',
    './shell/screenChange.js',
  ], 'lazyScreens.js imports a screen eagerly');
});

/*
 * G2: the teacher-only panels App drew from static imports (and the modules
 * only they reach) left student Home's first load. A panel is the same lazy
 * import wrapped in its own Suspense boundary with nothing as its fallback:
 * App's JSX is unchanged, and a panel still loading never suspends up to
 * AppShell's boundary, which would hide the whole teacher workspace.
 */
const TEACHER_PANELS = {
  ClassContextBar: 'components/teacher/ClassContextBar.jsx',
  WeeklyPathGradePanel: 'components/teacher/WeeklyPathGradePanel.jsx',
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
 * The teacher's first load (second pass): the five panels the workspace draws
 * closed on every screen moved from lazyScreens.js to app/teacher/
 * teacherPanels.js, where each mounts, and asks for its code, when it first
 * opens. Still a lazy import in a Suspense boundary of its own with nothing as
 * its fallback (app/teacher/onDemandCode.js), still taken by the workspace and
 * by nothing statically (firstLoadTeacherHome.test.mjs drives the helper).
 */
const CLOSED_TEACHER_PANELS = {
  TeacherQuickSearch: ['components/teacher/TeacherQuickSearch.jsx', 'open'],
  ClassroomSyncReview: ['components/teacher/ClassroomSyncReview.jsx', 'proposal'],
  AssignmentHub: ['components/teacher/AssignmentHub.jsx', 'open'],
  StudentProfileDrawer: ['components/teacher/StudentProfileDrawer.jsx', 'open'],
  SupportEvidenceReportView: ['components/teacher/SupportEvidenceReportView.jsx', 'open'],
};

test('the panels drawn closed load on demand when first opened, each inside its own Suspense boundary', () => {
  const helpers = executableSource(read('src/app/teacher/onDemandCode.js'));
  assert.match(helpers, /const choose = \(code\) => code\.loaded\(\)\?\.default \|\| lazy\(code\.load\);/, 'a lazy, or the panel once its code is here');
  assert.match(helpers, /if \(!Panel\) return offlineNote\(props\);\s*return createElement\(Suspense, \{ fallback: null \}, createElement\(Panel, props\)\);/, 'inside Suspense with no fallback, every prop passed through (offline, its note: firstLoadTeacherHome.test.mjs)');
  const panels = executableSource(read('src/app/teacher/teacherPanels.js'));
  const imported = importedFrom('./teacherPanels.js', teacherWorkspace);
  for (const [name, [path, openProp]] of Object.entries(CLOSED_TEACHER_PANELS)) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    assert.match(panels, new RegExp(`^export const ${name} = closedPanel\\(\\(\\) => import\\('\\.\\./\\.\\./${escaped}'\\), \\(props\\) => props\\.${openProp}, "This device is offline\\. [^"]+ when it is back online\\."\\);$`, 'm'), `${name} loads ${path} when props.${openProp} first holds, and says what waits for the connection`);
    assert.ok(imported.includes(name), `the teacher workspace takes ${name} from teacherPanels.js`);
    assert.doesNotMatch(read('src/app/lazyScreens.js'), new RegExp(`^export const ${name} =`, 'm'), `${name} is declared in lazyScreens.js as well`);
    assert.doesNotMatch(app, new RegExp(`^import [^;]* from '\\./${escaped}';$`, 'm'), `App imports ${path} statically`);
    assert.doesNotMatch(teacherWorkspace, new RegExp(`^import [^;]* from '\\.\\./\\.\\./${escaped}';$`, 'm'), `TeacherWorkspace imports ${path} statically`);
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
  // App's state stays in App: the branch had no hooks. The workspace calls
  // only its own, for the code it loads on demand: the failure of the
  // authoring code (app/teacher/authoringKitLoader.js) it hands
  // AppErrorBoundary, the idle prefetches once it has drawn (the panels drawn
  // closed and Home's math, app/teacher/teacherPanelPrefetch.js, then the
  // authoring code), and the Assignments list's wait for the authoring code.
  const hooks = [...teacherWorkspaceCode.matchAll(/\b(use(?:[A-Z]\w*)?)\(/g)].map((match) => match[1]);
  assert.deepEqual(hooks.sort(), ['use', 'useEffect', 'useEffect', 'useState'], 'no other hook in the workspace');
  assert.match(teacherWorkspaceCode, /const \[authoringKitError, setAuthoringKitError\] = useState\(null\);/);
  assert.match(teacherWorkspaceCode, /useEffect\(\(\) => prefetchTeacherPanels\(\), \[\]\);/);
  assert.match(teacherWorkspaceCode, /useEffect\(\(\) => prefetchAuthoringKit\(\), \[\]\);/);
  assert.match(teacherWorkspaceCode, /teacherTab === 'assignments' \? \(loadedAuthoringKit\(\) \|\| use\(loadAuthoringKit\(\)\)\) : null;/);
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
  // The error is shown in words written for the person, never as it came
  // (pass 3, wave 7: studentErrorText.js; its own sentences are asserted in
  // studentHonestFailures.test.mjs).
  assert.match(gate, /if \(hydrationError\) \{[\s\S]*MathMaster could not load your account[\s\S]*\{studentErrorSentence\(hydrationError, ACCOUNT_LOAD_FALLBACK\)\}/);
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
  // Since the App split the effect is useStudentScreenPrefetch's (in
  // src/app/student, so the module is two folders up), which App calls with
  // who is signed in and the screen they are on.
  assert.match(appCode, /\n\s*useStudentScreenPrefetch\(\{ user, activeView, [^}]*\}\);/);
  const hook = executableSource(appHookSource('useStudentScreenPrefetch'));
  const effect = hook.slice(hook.indexOf('const questionEnginePrefetchedRef = useRef(false);'), hook.indexOf('}, [user?.role, activeView]);'));
  assert.ok(effect.length > 0, 'the prefetch effect');
  assert.match(effect, /user\?\.role !== 'student' \|\| activeView !== 'dashboard'/);
  assert.match(effect, /import\('\.\.\/\.\.\/QuestionEngine\.jsx'\)/, 'the same module app/lazyScreens.js loads lazily');
  assert.match(effect, /requestIdleCallback\(prefetch/);
  // The module App's QuestionEngine loads on demand (memoised there).
  assert.match(read('src/app/lazyScreens.js'), /export const QuestionEngine = (?:memo\()?lazy\(\(\) => import\('\.\.\/QuestionEngine\.jsx'\)\)\)?;/);
});

// G2 review: stylesheets App used to get through modules that moved with the
// teacher's screen must still link BEFORE App.css, as at 805b69e2, where
// App.css's result depends on it. They reach App through one shared module
// that App and the workspace both import, so the bundler gives it a chunk of
// its own, linked before App's CSS. (Checked against the built manifest at the
// time: the CSS App links, concatenated in order, equals 805b69e2's.)
// PF01: the two teacher sheets left it. App.css's coarse-pointer
// `.mm-dashboard-content` rules (22px checkboxes, 12px cells, large-screen
// headings) used to tie with rules in them and win only by order; they win by
// weight now (firstLoadTeacherStyles.test.mjs), so the sheets load with the
// workspace and a student does not download them. What stays: the support
// report's print rules, which reach every page, and the phone layout sheet.
test('the print and phone stylesheets link before App.css, in the order they had', () => {
  const leading = read('src/app/shell/leadingStyles.js');
  const sheets = [...executableSource(leading).matchAll(/^import '([^']+\.css)';$/gm)].map((match) => match[1]);
  assert.deepEqual(sheets, [
    '../../components/teacher/supportEvidencePrint.css',
    '../../platform/mobile/MobileInteractionFoundation.css',
  ]);
  const shared = "import './app/shell/leadingStyles.js';";
  assert.ok(app.indexOf(shared) > 0 && app.indexOf(shared) < app.indexOf("import './App.css';"), 'App imports them ahead of App.css');
  assert.match(teacherWorkspace, /^import '\.\.\/shell\/leadingStyles\.js';$/m, 'the workspace shares the module, so it is its own chunk');
  assert.doesNotMatch(executableSource(app), /^import '\.\/(?:components\/teacher\/(?:supportEvidence|supportEvidencePrint|teacherWorkspace)|platform\/mobile\/MobileInteractionFoundation)\.css';$/m,
    'imported straight from App they would link after App.css');
});
