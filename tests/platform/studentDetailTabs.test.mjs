// A STUDENT'S DETAIL PAGE CHOOSES ITS VIEW FROM A TAB LIST (TT27, fifth slice).
//
// The accessibility certification opens a student's detail page now (Students -> "Open"; the scenes
// teacher-student-detail/*, six of its seven views). Its seven views were plain buttons, the one showing marked by
// colour alone: a screen reader heard seven buttons and never which view it was in, and each was a Tab stop on the
// way to the view.
// They are a tab list, as Live Class's and the administrator's sections are: the selected tab is the one Tab stop and
// says it is selected, Left / Right / Home / End move focus without choosing (src/platform/interaction/tabListKeys.js,
// tested in liveClassTabs), Enter, Space and a click choose, and the view is a tab panel named by its tab. The browser
// proof is tests/browser/accessibilityTeacherStudentDetailTabs.mjs (the keys in the real app) and the scenes.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const markup = async (file, exportName, props) => {
  const module = await vite.ssrLoadModule(file);
  return renderToStaticMarkup(React.createElement(module[exportName], props));
};

const ROSTER = '/src/components/teacher/StudentsRoster.jsx';
const VIEWS = ['overview', 'profile', 'progress', 'assignments', 'path', 'supports', 'account'];

test('the detail page\'s seven views are a tab list: one Tab stop, the selected one says so, each names the panel', async () => {
  const html = await markup(ROSTER, 'StudentDetailTabs', { active: 'progress', onSelect() {} });
  assert.match(html, /^<div role="tablist" aria-label="Student details"/);
  const tabs = [...html.matchAll(/<button type="button" role="tab" id="student-detail-tab-(\w+)" aria-selected="(true|false)" aria-controls="student-detail-panel" tabindex="(-?\d)"[^>]*>([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map((tab) => tab[1]), VIEWS, 'every view, in order');
  assert.deepEqual(tabs.map((tab) => tab[4]), ['Overview', 'Learning Profile', 'Progress', 'Assignments', 'My Math Path', 'Supports', 'Account'], 'with the names they had');
  assert.deepEqual(tabs.filter((tab) => tab[2] === 'true').map((tab) => tab[1]), ['progress'], 'the selected view, and only it, is selected');
  assert.deepEqual(tabs.filter((tab) => tab[3] === '0').map((tab) => tab[1]), ['progress'], 'and it is the one Tab stop');
});

test('the arrow keys, Home and End move focus between the tabs and choose nothing; a click chooses', async () => {
  const roster = await vite.ssrLoadModule(ROSTER);
  const focused = [];
  const tabs = VIEWS.map((view) => ({ view, focus: () => focused.push(view) }));
  const press = (key, from, extra = {}) => {
    let prevented = false;
    roster.moveBetweenStudentDetailTabs({ key, target: tabs[from], currentTarget: { querySelectorAll: (selector) => (selector === '[role="tab"]' ? tabs : []) }, preventDefault: () => { prevented = true; }, ...extra });
    return prevented;
  };
  assert.equal(press('ArrowRight', 0), true);
  assert.equal(press('ArrowLeft', 0), true);
  assert.equal(press('End', 2), true);
  assert.equal(press('Home', 4), true);
  assert.deepEqual(focused, ['profile', 'account', 'account', 'overview'], 'Right, Left (wrapping), End and Home');
  focused.length = 0;
  assert.equal(press('ArrowDown', 1), false, 'Up and Down are the page\'s');
  assert.equal(press('Enter', 1), false, 'Enter is the button\'s own click');
  assert.equal(press('ArrowRight', 1, { ctrlKey: true }), false, 'a shortcut is not a move');
  assert.deepEqual(focused, []);
  // Choosing is the button's click (Enter, Space or a pointer), and it chooses the tab's own view. The tab list has no
  // hooks, so calling it gives its elements.
  const chosen = [];
  const tree = roster.StudentDetailTabs({ active: 'overview', onSelect: (view) => chosen.push(view) });
  tree.props.children.find((button) => button.key === 'supports').props.onClick();
  assert.deepEqual(chosen, ['supports']);
});

test('every view of the detail page is inside the one tab panel, named by the selected tab', () => {
  const source = read('src/components/teacher/StudentsRoster.jsx');
  const page = region(source, '<StudentDetailTabs active={detailTab} onSelect={setDetailTab} />', '    );\n  }', 'the detail page under its tabs');
  const panelAt = page.indexOf('<div id={STUDENT_DETAIL_PANEL_ID} role="tabpanel" aria-labelledby={studentDetailTabId(detailTab)}>');
  assert.ok(panelAt > 0, 'a tab panel named by the selected tab');
  for (const view of VIEWS) {
    const at = page.indexOf(`{detailTab === '${view}' &&`);
    assert.ok(at > panelAt, `the ${view} view is inside the panel`);
  }
  assert.doesNotMatch(source, /\['overview', 'profile', 'progress', 'assignments', 'path', 'supports', 'account'\]\.map\(\(tab\) => <button/, 'the plain buttons are gone');
});
