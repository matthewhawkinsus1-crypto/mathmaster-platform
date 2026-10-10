/*
 * MY MATH PATH LANDMARKS (release-candidate QA m11).
 *
 *   (a) My Math Path had no h1.                    → the header names the screen
 *   (b) the skip link landed on an empty div.      → it lands on the first
 *                                                    heading inside main
 *   (c) its nav was "MathMaster navigation".       → "Student navigation", as
 *                                                    everywhere else
 *   (d) "Start session 1 of 4" was announced twice → one Start per session
 *
 * The rendered proof is tests/browser/myMathPathLandmarks.mjs (real App.jsx,
 * both viewports). Node cannot import .jsx, so the decisions live in .js
 * modules run here; the wiring is read from source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIN_CONTENT_ID, STUDENT_NAVIGATION_LABEL, skipTarget } from '../../src/components/common/skipTarget.js';
import { TABS_WITH_OWN_H1, pathContentIsMain, pathHeaderIsH1 } from '../../src/components/student/myMathPathLandmarks.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// ------------------------------------------------------------ a tiny DOM
// Enough of the DOM for skipTarget: document order, visibility, the three
// selector shapes it uses (tag, [attr="v"], tag[attr="v"], comma lists).
class FakeElement {
  constructor(tag, attrs = {}, children = [], { visible = true } = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.children = children;
    this.visible = visible;
    this.parent = null;
    children.forEach((child) => { child.parent = this; });
  }
  get id() { return this.attrs.id || ''; }
  getClientRects() { return this.visible ? [{}] : []; }
  contains(other) {
    for (let node = other; node; node = node.parent) if (node === this) return true;
    return false;
  }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  matches(selector) {
    return selector.split(',').map((part) => part.trim()).some((part) => {
      const [, tag = '', attr, value] = part.match(/^([a-z0-9]*)(?:\[([a-z-]+)="([^"]*)"\])?$/i) || [];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      if (attr && this.attrs[attr] !== value) return false;
      return Boolean(tag || attr);
    });
  }
  querySelectorAll(selector) { return this.descendants().filter((element) => element.matches(selector)); }
}
const el = (tag, attrs, ...children) => new FakeElement(tag, attrs || {}, children);
const fakeDocument = (root) => {
  const order = [root, ...root.descendants()];
  for (const node of order) {
    node.compareDocumentPosition = (other) => {
      const after = order.indexOf(other) > order.indexOf(node);
      if (after) return 4 | (node.contains(other) ? 16 : 0);
      return 2 | (other.contains(node) ? 8 : 0);
    };
  }
  return {
    getElementById: (id) => order.find((node) => node.id === id) || null,
    querySelectorAll: (selector) => order.filter((node) => node.matches(selector)),
  };
};

// The My Math Path screen as App.jsx and MyMathPathApp render it.
const pathScreen = ({ navLabel = STUDENT_NAVIGATION_LABEL, mainHeading = true } = {}) => {
  const anchor = el('div', { id: MAIN_CONTENT_ID });
  const h1 = el('h1', {});
  const weekly = el('h2', {});
  const main = mainHeading ? el('main', {}, el('section', {}, weekly)) : el('main', {}, el('p', {}));
  const root = el('body', {},
    el('a', { class: 'mm-skip-link' }),
    anchor,
    el('div', {},
      el('header', {}, h1, el('nav', { 'aria-label': navLabel }, el('button', {})), el('nav', { 'aria-label': 'My Math Path navigation' })),
      main));
  return { doc: fakeDocument(root), anchor, h1, weekly, main };
};

// ------------------------------------------------------------ (b) + (c)
test('the skip link lands on the first heading inside main, after the student nav', () => {
  const screen = pathScreen();
  assert.equal(skipTarget(screen.doc), screen.weekly, 'not the empty anchor, not the h1 above the nav, not the bare main');
});

test('a main with no heading is the landing place itself', () => {
  const screen = pathScreen({ mainHeading: false });
  assert.equal(skipTarget(screen.doc), screen.main);
});

test('a nav under another name is invisible to the skip link: it falls back to the empty anchor', () => {
  // The defect (b) came from (c): with "MathMaster navigation" the skip link
  // could not find the nav and landed on the shell's empty div.
  const screen = pathScreen({ navLabel: 'MathMaster navigation' });
  assert.equal(skipTarget(screen.doc), screen.anchor);
});

test('My Math Path names its global nav as every student screen does', () => {
  const nav = executableSource(read('src/components/student/StudentGlobalNav.jsx'));
  assert.match(nav, new RegExp(`label = '${STUDENT_NAVIGATION_LABEL}'`), 'the nav component defaults to the name the skip link looks for');
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  const globalNav = region(app, '<StudentGlobalNav', '/>', 'My Math Path global nav');
  const label = globalNav.match(/\blabel=(?:"([^"]*)"|\{'([^']*)'\})/);
  assert.ok(!label || (label[1] ?? label[2]) === STUDENT_NAVIGATION_LABEL, `My Math Path renames the student nav: ${label?.[0]}`);
});

// ------------------------------------------------------------ (a)
test('exactly one h1 on every My Math Path view a student sees', () => {
  for (const tab of ['path', 'ccmr']) assert.equal(pathHeaderIsH1({ activeTab: tab }), true, `${tab}: the header is the h1`);
  for (const tab of TABS_WITH_OWN_H1) assert.equal(pathHeaderIsH1({ activeTab: tab }), false, `${tab}: has its own h1`);
  assert.equal(pathHeaderIsH1({ activeTab: 'session' }), false);
  assert.equal(pathHeaderIsH1({ activeTab: 'path', embedded: true }), false, 'inside a teacher page, under its h1');

  // The views that keep their own h1 really draw one; the ones that borrow the
  // header's draw none — so the count is one either way.
  const own = { dashboard: 'MyMathPathDashboard.jsx', progress: 'MyMathPathProgress.jsx', history: 'StudentPracticeHistory.jsx' };
  assert.deepEqual([...TABS_WITH_OWN_H1].sort(), Object.keys(own).sort());
  for (const [tab, file] of Object.entries(own)) {
    assert.equal((executableSource(read(`src/components/student/${file}`)).match(/<h1\b/g) || []).length, 1, `${tab} (${file}) draws one h1`);
  }
  for (const file of ['CCMRHub.jsx', 'StudentLearningPath.jsx', 'WeeklyPathGoalPanel.jsx']) {
    assert.doesNotMatch(executableSource(read(`src/components/student/${file}`)), /<h1\b/, `${file} sits under the header's h1`);
  }

  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  assert.match(app, /import \{ pathContentIsMain, pathHeaderIsH1 \} from '\.\/myMathPathLandmarks\.js';/);
  const header = region(app, "{activeTab !== 'session' && (\n        <header", '</header>', 'the header');
  assert.match(header, /\{pathHeaderIsH1\(\{ activeTab, embedded: embeddedInTeacherPage \}\)\s*\? <h1[^>]*>My Math Path<\/h1>/);
});

test('the content after the header is the main landmark, except where another main exists', () => {
  assert.equal(pathContentIsMain({ activeTab: 'path' }), true);
  assert.equal(pathContentIsMain({ activeTab: 'session' }), false, 'PathSessionPlayer draws its own main');
  assert.equal(pathContentIsMain({ activeTab: 'path', embedded: true }), false, 'a teacher page');
  const app = executableSource(read('src/components/student/MyMathPathApp.jsx'));
  assert.match(app, /const embeddedInTeacherPage = Boolean\(readOnly \|\| sessionProvider\);/);
  assert.match(app, /const ScreenBody = pathContentIsMain\(\{ activeTab, embedded: embeddedInTeacherPage \}\) \? 'main' : React\.Fragment;/);
  const body = region(app, '<ScreenBody>', '</ScreenBody>', 'the main landmark');
  assert.match(body, /<WeeklyPathGoalPanel/, 'the weekly path is inside main');
  assert.doesNotMatch(body, /<MyMathPathProductionContainer/, 'the session (with its own main) is not');
});

// ------------------------------------------------------------ (d)
test('each weekly session has exactly one Start: its own card', () => {
  const panel = executableSource(read('src/components/student/WeeklyPathGoalPanel.jsx'));
  const main = region(panel, 'export default function WeeklyPathGoalPanel(', '\n}\n', 'the panel');
  // The panel launches nothing itself: every launch goes through a card.
  assert.doesNotMatch(main, /onStartSession\?\.\(/, 'a second Start outside the cards');
  assert.doesNotMatch(main, /weeklyStartLabel\(/, 'a second "Start session N of M" label outside the cards');
  const card = region(panel, 'function SessionCard(', '\n}\n', 'session card');
  assert.equal((card.match(/<button\b/g) || []).length, 1, 'one button per card');
  assert.match(card, /onClick=\{\(\) => onStart\?\.\(session\)\}/);
  // The next session is marked on its own card instead.
  const cards = region(main, '<SessionCard', '/>', 'session cards');
  assert.match(cards, /onStart=\{onStartSession\}/);
  assert.match(cards, /isNext=\{session\.slot === next\?\.slot\}/);
  assert.match(card, /\{highlighted && \([\s\S]{0,300}Do this next/);
});
