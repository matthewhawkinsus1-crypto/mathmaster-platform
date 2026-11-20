import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { region } from './helpers/sourceContract.mjs';
import { appFactorySeam, appFactorySource, appHookSource } from './helpers/appScreens.mjs';

// The scroll-driven auto-compact rule (shouldCompactAssignmentNavigation) and
// its unit test were removed with the module once App stopped using it (OT03).

// Pass 3, RUN-7: the navigator no longer waits for a window scroll to compact
// (a phone's window never scrolls, so it never did there). It starts compact
// on every size and every open path; "Show progress" opens it, "Focus view"
// folds it, and either keeps the work where it was on screen.
// (tests/browser/teacherWorkflow/assignmentChromeJourneys.mjs measures it.)
test('the navigator starts compact, on every size and every open path', async () => {
  const source = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /const \[assignmentNavigationCollapsed, setAssignmentNavigationCollapsed\] = useState\(true\);/);
  // Since the App split the open paths are createStudentNavigation's
  // (startAssignment) and createTeacherPreviewNavigation's (the preview, Teach
  // Live and its resume), which App hands the setter: the resets are counted
  // across App and both, so none is lost and none can start it expanded.
  for (const factoryName of ['createStudentNavigation', 'createTeacherPreviewNavigation']) {
    assert.ok(appFactorySeam(factoryName).parameters.includes('setAssignmentNavigationCollapsed'), `App hands ${factoryName} the navigator's setter`);
  }
  const openPaths = [source, appFactorySource('createStudentNavigation'), appFactorySource('createTeacherPreviewNavigation')].join('\n');
  const resets = [...openPaths.matchAll(/setAssignmentNavigationCollapsed\((true|false)\);/g)].map((match) => match[1]);
  assert.ok(resets.length >= 4, `every open path resets the navigator (found ${resets.length})`);
  assert.deepEqual([...new Set(resets)], ['true'], 'no open path starts it expanded');
});

test('Show progress and Focus view keep the work where it was', async () => {
  const source = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  // Since the App split the toggle and the anchor are
  // useAssignmentNavigatorToggle's, which App calls with the navigator's
  // state and the question stage, for the toggle the navigator's button runs.
  const hook = appHookSource('useAssignmentNavigatorToggle');
  const call = region(source, 'const { toggleAssignmentNavigation } = useAssignmentNavigatorToggle({', '});', "App's call of the navigator hook");
  for (const input of ['assignmentNavigationCollapsed', 'setAssignmentNavigationCollapsed', 'assignmentQuestionStageRef']) {
    assert.match(call, new RegExp(`[{,\\s]${input},`), input);
  }
  assert.match(hook, /return \{ toggleAssignmentNavigation \};/);
  const toggle = region(hook, 'const toggleAssignmentNavigation = () => {', '};', 'the navigator toggle');
  assert.match(toggle, /navigationToggleAnchorRef\.current = work \? \{ element: work, top: work\.getBoundingClientRect\(\)\.top \} : null;/);
  const keep = region(hook, 'useLayoutEffect(() => {\n    const anchor = navigationToggleAnchorRef.current;', '}, [assignmentNavigationCollapsed]);', 'the work anchor');
  assert.match(keep, /const moved = anchor\.element\.getBoundingClientRect\(\)\.top - anchor\.top;/);
  assert.match(keep, /window\.scrollBy\(\{ top: moved/);
  assert.match(hook, /^import \{[^}]*\buseLayoutEffect\b[^}]*\} from 'react';$/m);
  // Since the App split (slice 7) createAssignmentWorkspaceView draws the
  // navigator; App hands it the toggle the hook returned.
  assert.ok(appFactorySeam('createAssignmentWorkspaceView').parameters.includes('toggleAssignmentNavigation'), 'App hands the view the toggle');
  const nav = region(appFactorySource('createAssignmentWorkspaceView'), '<nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)}', '</nav>', 'the navigator');
  assert.match(nav, /onClick=\{toggleAssignmentNavigation\}/);
});

test('compact controls retain keyboard semantics and touch-sized short-landscape targets', async () => {
  // Since the App split (slice 7) the compact navigator is drawn by
  // createAssignmentWorkspaceView (src/app/student/assignmentWorkspaceView.jsx).
  const [app, css] = await Promise.all([
    appFactorySource('createAssignmentWorkspaceView'),
    readFile(new URL('../../src/App.css', import.meta.url), 'utf8'),
  ]);
  const compactStart = app.indexOf('mathmaster-collapsed-current-location');
  const compactEnd = app.indexOf("{!assignmentNavigationCollapsed && (", compactStart);
  assert.ok(compactStart >= 0 && compactEnd > compactStart, 'the compact controls are found, before the expanded navigator');
  const compact = app.slice(compactStart, compactEnd);
  assert.match(compact, /aria-label="Previous question"/);
  assert.match(compact, /aria-label="Choose a question"/);
  assert.match(compact, /aria-label="Next question"/);
  const touchTargets = css.slice(css.indexOf('/* Automatic compact mode must save rows'));
  assert.match(touchTargets, /is-collapsed[\s\S]*min-height: 44px;/);
});
