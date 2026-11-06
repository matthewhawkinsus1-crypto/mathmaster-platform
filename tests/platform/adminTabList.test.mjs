// THE ADMINISTRATOR'S SECTION TABS, AS REAL TABS (TT27).
//
// Same gap Live Class had: five buttons with role="tab", every one a Tab stop,
// arrow keys doing nothing, and no panel for a screen reader to go to. Now the
// selected tab is the one Tab stop, Left / Right / Home / End move focus (the
// shared src/platform/interaction/tabListKeys.js, tested in liveClassTabs), each
// tab names the panel it controls, and the section's content is a tab panel
// named by the selected tab. Moving does not select: a section such as the
// pre-production reset must not open on the way past. Node cannot render the
// workspace, so the markup is read as source; the browser proof is
// tests/browser/accessibilityTeacherAdminTabs.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const workspace = executableSource(readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8'));
const list = region(workspace, '<div role="tablist" aria-label="Administration sections"', '</main>', 'the administrator screen');

test('the tab list is one Tab stop, each tab names its panel, and the keys are the shared ones', () => {
  assert.match(list, /onKeyDown=\{moveBetweenAdminTabs\}/, 'the keys are on the list');
  const tab = region(list, '<button', '</button>', 'one tab');
  assert.match(tab, /role="tab"/);
  assert.match(tab, /aria-selected=\{adminTab === id\}/);
  assert.match(tab, /tabIndex=\{adminTab === id \? 0 : -1\}/, 'only the selected tab is in the Tab order');
  assert.match(tab, /aria-controls=\{ADMIN_PANEL_ID\}/);
  assert.match(tab, /id=\{adminTabId\(id\)\}/);
  assert.match(tab, /onClick=\{\(\) => setAdminTab\(id\)\}/, 'Enter, Space and a click select');
  const keys = region(workspace, 'const moveBetweenAdminTabs = (event) => {', '\n};', 'the tab keys');
  assert.match(keys, /tabKeyTarget\(event\.key, /);
  assert.match(keys, /\.focus\(\)/, 'moving puts focus on the tab');
  assert.doesNotMatch(keys, /setAdminTab/, 'moving does not select');
});

test('the five sections sit in one tab panel named by the selected tab, inside the main', () => {
  const main = list.slice(list.indexOf('<main id={MAIN_CONTENT_ID}'));
  assert.match(main, /<div id=\{ADMIN_PANEL_ID\} role="tabpanel" aria-labelledby=\{adminTabId\(adminTab\)\}>/);
  for (const part of ['<ClassesAdmin', '<SignInAccess', '<PathCoverageAudit', '<AssignmentAiHealth', '<PreproductionReset']) {
    assert.ok(main.indexOf(part) > main.indexOf('role="tabpanel"'), `${part} is inside the panel`);
  }
  assert.match(workspace, /const ADMIN_PANEL_ID = 'admin-section-panel';/);
  assert.match(workspace, /const adminTabId = \(id\) => `admin-tab-\$\{id\}`;/);
  assert.equal((workspace.match(/\['(classes|accounts|coverage|ai|reset)', '/g) || []).length, 5, 'five sections');
});

// Teacher features walk, item 1: on a phone the five tabs wrapped one under another, 246px of an 844px screen.
// Now they are one row that scrolls sideways there, as the dashboard's own strip does; the keys and the panel
// are the ones above. The browser driver measures the row, its targets and the arrow keys' scrolling.
test('on a phone the tabs are one row that scrolls sideways, and stay one tab list', () => {
  assert.match(list, /^<div role="tablist" aria-label="Administration sections" className="mm-admin-tabs" onKeyDown=\{moveBetweenAdminTabs\}/);
  const css = readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8');
  const rule = css.indexOf('.mm-admin-tabs {');
  assert.notEqual(rule, -1, 'App.css lays the tab list out');
  const media = css.lastIndexOf('@media', rule);
  const query = css.slice(media, css.indexOf('{', media));
  const width = Number(query.match(/^@media \(max-width: (\d+)px\) $/)?.[1]);
  assert.ok(width >= 400 && width <= 640, `only at a phone's width: ${query}`);
  const block = css.slice(media, css.indexOf('\n}\n', media));
  const row = block.slice(block.indexOf('.mm-admin-tabs {'), block.indexOf('}', block.indexOf('.mm-admin-tabs {')));
  assert.match(row, /flex-wrap: nowrap !important;/, 'one row (the inline style wraps; this wins over it)');
  assert.match(row, /overflow-x: auto;/, 'which scrolls sideways');
  assert.match(row, /padding-bottom: \d+px !important;/, 'with room under the tabs for a focus ring the scrolling box would cut');
  const tab = block.slice(block.indexOf('.mm-admin-tabs > [role="tab"] {'));
  assert.match(tab, /flex: 0 0 auto;/, 'a tab keeps its size, so its target never shrinks');
  assert.match(tab, /white-space: nowrap;/);
});
