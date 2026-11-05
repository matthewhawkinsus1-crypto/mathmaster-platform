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
