import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { region } from './helpers/sourceContract.mjs';

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
  const resets = [...source.matchAll(/setAssignmentNavigationCollapsed\((true|false)\);/g)].map((match) => match[1]);
  assert.ok(resets.length >= 4, `every open path resets the navigator (found ${resets.length})`);
  assert.deepEqual([...new Set(resets)], ['true'], 'no open path starts it expanded');
});

test('Show progress and Focus view keep the work where it was', async () => {
  const source = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const toggle = region(source, 'const toggleAssignmentNavigation = () => {', '};', 'the navigator toggle');
  assert.match(toggle, /navigationToggleAnchorRef\.current = work \? \{ element: work, top: work\.getBoundingClientRect\(\)\.top \} : null;/);
  const keep = region(source, 'useLayoutEffect(() => {\n    const anchor = navigationToggleAnchorRef.current;', '}, [assignmentNavigationCollapsed]);', 'the work anchor');
  assert.match(keep, /const moved = anchor\.element\.getBoundingClientRect\(\)\.top - anchor\.top;/);
  assert.match(keep, /window\.scrollBy\(\{ top: moved/);
  assert.match(source, /^import \{[^}]*\buseLayoutEffect\b[^}]*\} from 'react';$/m);
  const nav = region(source, '<nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)}', '</nav>', 'the navigator');
  assert.match(nav, /onClick=\{toggleAssignmentNavigation\}/);
});

test('compact controls retain keyboard semantics and touch-sized short-landscape targets', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/App.css', import.meta.url), 'utf8'),
  ]);
  const compact = app.slice(app.indexOf('mathmaster-collapsed-current-location'), app.indexOf("{!assignmentNavigationCollapsed && (", app.indexOf('mathmaster-collapsed-current-location')));
  assert.match(compact, /aria-label="Previous question"/);
  assert.match(compact, /aria-label="Choose a question"/);
  assert.match(compact, /aria-label="Next question"/);
  const touchTargets = css.slice(css.indexOf('/* Automatic compact mode must save rows'));
  assert.match(touchTargets, /is-collapsed[\s\S]*min-height: 44px;/);
});
