import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  TEACHER_HISTORY_DOCUMENT_ID,
  TEACHER_ROUTE_STATE_KEY,
  normalizeTeacherRoute,
  planTeacherHistoryWrite,
  readTeacherHistoryEntry,
  readTeacherRouteState,
  shouldStepBackToRoute,
  teacherRouteKey,
  teacherScreenKey,
  writeTeacherRouteState,
} from '../../src/platform/teacher/teacherBrowserHistory.js';
import { region, executableSource } from './helpers/sourceContract.mjs';

/*
 * A browser history stack, small enough to read. `entries[0]` is the website
 * the teacher was on before MathMaster: landing there is leaving the platform.
 */
const installFakeBrowser = () => {
  const entries = [{ state: null, outside: true }, { state: null }];
  let index = 1;
  const listeners = new Set();
  const history = {
    get state() { return entries[index].state; },
    pushState(state) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(state) });
      index += 1;
    },
    replaceState(state) { entries[index] = { ...entries[index], state: structuredClone(state) }; },
    back() {
      index -= 1;
      if (entries[index].outside) return;
      listeners.forEach((listener) => listener({ state: entries[index].state }));
    },
  };
  globalThis.window = {
    history,
    location: { href: 'https://mathmaster.test/' },
    addEventListener: (type, listener) => { if (type === 'popstate') listeners.add(listener); },
    removeEventListener: (type, listener) => listeners.delete(listener),
  };
  return {
    history,
    get left() { return Boolean(entries[index].outside); },
    get depth() { return index; },
    onPop: (listener) => listeners.add(listener),
    uninstall: () => { delete globalThis.window; },
  };
};

/*
 * App.jsx's two halves, minus React: on every screen change the effect follows
 * planTeacherHistoryWrite; on popstate the screen becomes the entry's route.
 */
const simulateTeacherApp = (browser, initialRoute) => {
  let screen = normalizeTeacherRoute(initialRoute);
  writeTeacherRouteState(screen, { replace: true, documentId: TEACHER_HISTORY_DOCUMENT_ID });
  browser.onPop((event) => {
    const entry = readTeacherHistoryEntry(event.state);
    if (entry) screen = entry.route;
  });
  return {
    get screen() { return screen; },
    navigate(route) {
      screen = normalizeTeacherRoute(route);
      const plan = planTeacherHistoryWrite({
        entry: readTeacherHistoryEntry(window.history.state),
        target: screen,
        documentId: TEACHER_HISTORY_DOCUMENT_ID,
      });
      if (plan.action === 'back') window.history.back();
      if (plan.action === 'push' || plan.action === 'replace') {
        writeTeacherRouteState(screen, { replace: plan.action === 'replace', fromKey: plan.fromKey, documentId: plan.documentId });
      }
    },
  };
};

const workspace = (tab, panels = {}) => ({ surface: 'workspace', tab, panels });

test('Back walks the teacher through the screens they visited instead of leaving MathMaster', () => {
  const browser = installFakeBrowser();
  try {
    const app = simulateTeacherApp(browser, workspace('home'));
    app.navigate(workspace('grades'));
    app.navigate(workspace('assignments'));
    app.navigate({ surface: 'preview', assignmentId: 'a1', questionIndex: 0 });

    browser.history.back();
    assert.equal(teacherScreenKey(app.screen), 'workspace:assignments');
    assert.equal(browser.left, false);
    browser.history.back();
    assert.equal(teacherScreenKey(app.screen), 'workspace:grades');
    browser.history.back();
    assert.equal(teacherScreenKey(app.screen), 'workspace:home');
    assert.equal(browser.left, false, 'every MathMaster screen is a Back step before the site that launched it');
  } finally {
    browser.uninstall();
  }
});

test('stepping through a lesson while presenting does not turn Back into "previous question"', () => {
  const browser = installFakeBrowser();
  try {
    const app = simulateTeacherApp(browser, workspace('home'));
    app.navigate({ surface: 'preview', assignmentId: 'a1', questionIndex: 0 });
    const depthInPreview = browser.depth;
    for (let questionIndex = 1; questionIndex < 12; questionIndex += 1) {
      app.navigate({ surface: 'preview', assignmentId: 'a1', questionIndex });
    }
    assert.equal(browser.depth, depthInPreview, 'question moves update the preview entry in place');
    assert.equal(readTeacherRouteState(window.history.state).questionIndex, 11, 'Forward returns to the question the teacher was on');

    browser.history.back();
    assert.equal(teacherScreenKey(app.screen), 'workspace:home', 'one Back press leaves the preview for Live Classroom');
  } finally {
    browser.uninstall();
  }
});

test('closing a panel with its own close button is a step back, not a new entry to wade through', () => {
  const browser = installFakeBrowser();
  try {
    const app = simulateTeacherApp(browser, workspace('home'));
    app.navigate(workspace('grades'));
    const gradesDepth = browser.depth;

    // Four students looked at and closed, one after another.
    ['s1', 's2', 's3', 's4'].forEach((studentId) => {
      app.navigate(workspace('grades', { studentId }));
      app.navigate(workspace('grades'));
    });
    assert.equal(browser.depth, gradesDepth, 'no drawer leaves an entry behind once it is closed');

    // Stacked panels close one at a time the same way.
    app.navigate(workspace('grades', { studentId: 's1' }));
    app.navigate(workspace('grades', { studentId: 's1', supportReportStudentId: 's1' }));
    app.navigate(workspace('grades', { studentId: 's1' }));
    assert.equal(teacherRouteKey(readTeacherRouteState(window.history.state)), 'workspace:grades|studentId=s1');
    app.navigate(workspace('grades'));
    assert.equal(browser.depth, gradesDepth);

    browser.history.back();
    assert.equal(teacherScreenKey(app.screen), 'workspace:home');
  } finally {
    browser.uninstall();
  }
});

test('Back closes the top panel and leaves the screen underneath where it was', () => {
  const browser = installFakeBrowser();
  try {
    const app = simulateTeacherApp(browser, workspace('home'));
    app.navigate(workspace('home', { hubAssignmentId: 'a1', hubClassId: 'c1' }));
    app.navigate(workspace('home', { hubAssignmentId: 'a1', hubClassId: 'c1', studentId: 's9' }));

    browser.history.back();
    assert.equal(app.screen.panels.studentId, undefined);
    assert.equal(app.screen.panels.hubAssignmentId, 'a1');
    assert.equal(app.screen.panels.hubClassId, 'c1', 'the hub comes back on the class it was opened for');
    browser.history.back();
    assert.deepEqual(app.screen, normalizeTeacherRoute(workspace('home')));
    assert.equal(browser.left, false);
  } finally {
    browser.uninstall();
  }
});

test('a closed panel never steps back into an entry left over from before a reload', () => {
  const panelEntry = {
    route: workspace('grades', { studentId: 's1' }),
    fromKey: 'workspace:grades',
    documentId: 'an-earlier-page-load',
  };
  // Stepping back into another document's entry would reload MathMaster.
  assert.equal(shouldStepBackToRoute({ entry: panelEntry, target: workspace('grades'), documentId: TEACHER_HISTORY_DOCUMENT_ID }), false);
  assert.equal(
    planTeacherHistoryWrite({ entry: panelEntry, target: workspace('grades'), documentId: TEACHER_HISTORY_DOCUMENT_ID }).action,
    'push',
  );
  // The same entry written by this page load is a step back.
  assert.equal(
    planTeacherHistoryWrite({ entry: { ...panelEntry, documentId: TEACHER_HISTORY_DOCUMENT_ID }, target: workspace('grades'), documentId: TEACHER_HISTORY_DOCUMENT_ID }).action,
    'back',
  );
  // Opening a different panel, or changing screens, is never a step back.
  assert.equal(
    planTeacherHistoryWrite({ entry: { ...panelEntry, documentId: TEACHER_HISTORY_DOCUMENT_ID }, target: workspace('grades', { hubAssignmentId: 'a1' }), documentId: TEACHER_HISTORY_DOCUMENT_ID }).action,
    'push',
  );
  assert.equal(
    planTeacherHistoryWrite({ entry: { ...panelEntry, documentId: TEACHER_HISTORY_DOCUMENT_ID }, target: workspace('students'), documentId: TEACHER_HISTORY_DOCUMENT_ID }).action,
    'push',
  );
});

test('teacher entries keep other screens\' history state and round-trip normalized routes', () => {
  const browser = installFakeBrowser();
  try {
    window.history.replaceState({ __mathmasterMathPathRoute: { tab: 'path' } }, '');
    writeTeacherRouteState({ surface: 'administration', adminTab: ' coverage ' }, { replace: true, documentId: TEACHER_HISTORY_DOCUMENT_ID });
    assert.deepEqual(window.history.state.__mathmasterMathPathRoute, { tab: 'path' }, 'the Path Simulator\'s own entries still work inside the teacher workspace');
    assert.deepEqual(readTeacherRouteState(window.history.state), { surface: 'administration', adminTab: 'coverage' });
    assert.ok(window.history.state[TEACHER_ROUTE_STATE_KEY]);
  } finally {
    browser.uninstall();
  }
  assert.equal(readTeacherRouteState(null), null);
  assert.equal(readTeacherRouteState({ __mathmasterStudentRoute: { surface: 'dashboard' } }), null, 'a student entry is not a teacher screen');
  assert.deepEqual(normalizeTeacherRoute({ surface: 'nonsense' }), { surface: 'workspace', tab: 'home', panels: {} });
});

/*
 * App.jsx is where the routes meet React state. node cannot import .jsx, so
 * these read its source — anchored to the regions that do the work.
 */
const appSource = executableSource(readFileSync('src/App.jsx', 'utf8'));

test('App imports the teacher history module it calls', () => {
  assert.match(appSource, /from '\.\/platform\/teacher\/teacherBrowserHistory\.js'/);
  const importBlock = region(appSource, 'import {\n  TEACHER_HISTORY_DOCUMENT_ID', "from './platform/teacher/teacherBrowserHistory.js'", 'teacher history import');
  for (const name of ['planTeacherHistoryWrite', 'readTeacherHistoryEntry', 'writeTeacherRouteState', 'teacherRouteKey', 'teacherRouteSignature']) {
    assert.match(importBlock, new RegExp(`\\b${name}\\b`), `${name} is called in App.jsx and must be imported (no-undef is not linted here)`);
  }
});

test('App describes every teacher screen and panel as a route and follows the write plan', () => {
  const routeBlock = region(appSource, 'const teacherBrowserRoute = useMemo(', '}, [teacherBrowserRoute, urlArrival]);', 'teacher route + writer');
  assert.match(routeBlock, /user\?\.role !== 'teacher'/);
  assert.match(routeBlock, /activeView === 'teacherPreview'/);
  assert.match(routeBlock, /surface: 'administration'/);
  for (const panel of ['hubAssignmentId', 'studentId', 'caseReviewStudentId', 'supportReportStudentId', 'testCyclePreviewAssignmentId']) {
    assert.match(routeBlock, new RegExp(`\\b${panel}\\b`), `the ${panel} panel is part of the route`);
  }
  assert.match(routeBlock, /planTeacherHistoryWrite\(/);
  assert.match(routeBlock, /window\.history\.back\(\)/);
  assert.match(routeBlock, /writeTeacherRouteState\(teacherBrowserRoute, \{ replace: true/);
  // Each entry carries the screen's address (app/routes/browserUrl.js), and
  // nothing is written while the address the page opened at waits to open.
  assert.match(routeBlock, /const url = teacherUrlFor\(teacherBrowserRoute\);/);
  assert.match(routeBlock, /if \(urlArrival\) return;/);
  assert.match(appSource, /import \{[^}]*\bteacherUrlFor\b[^}]*\} from '\.\/app\/routes\/browserUrl\.js';/);
});

test('App restores the teacher screen on popstate and never acts underneath an open dialog', () => {
  const restoreBlock = region(appSource, 'teacherHistoryRestoreRef.current = (event) => {', "window.addEventListener('popstate', restoreTeacherFromBrowserHistory)", 'teacher popstate restore');
  assert.match(restoreBlock, /readTeacherHistoryEntry\(event\.state\)/);
  assert.match(restoreBlock, /setTeacherTab\(route\.tab\)/);
  assert.match(restoreBlock, /setAdminTab\(route\.adminTab\)/);
  assert.match(restoreBlock, /setProfileDrawerStudentId\(panels\.studentId \|\| null\)/);
  assert.match(restoreBlock, /setActiveView\('teacherPreview'\)|startTeacherPreview\(|resumeLiveTeaching\(\)/);

  // The dialog guard runs before anything is restored.
  const guardAt = restoreBlock.indexOf('if (teacherDialogOpen)');
  assert.ok(guardAt > 0, 'popstate checks for an open dialog');
  assert.ok(guardAt < restoreBlock.indexOf('setTeacherTab(route.tab)'), 'the dialog guard runs before the tab changes');
  const dialogBlock = region(appSource, 'const teacherDialogOpen =', ');', 'open teacher dialogs');
  assert.match(dialogBlock, /questionEditorAssignment/, 'an open question editor (unsaved edits) blocks Back');
});
