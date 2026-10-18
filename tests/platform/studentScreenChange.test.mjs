/*
 * NAV-3 and NAV-15 (student pass 3): a student screen change moves focus to
 * the new screen's heading and says its name once; every student screen has
 * one main landmark.
 *
 * The DOM logic (src/app/shell/screenChange.js) runs here against a tiny fake
 * document. The real App is driven in Chromium by
 * tests/browser/studentScreenChange.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  focusAlreadyPlaced,
  focusScreenHeading,
  screenAnnouncement,
  screenChangeMovesFocus,
  screenHeadingTarget,
  studentScreenKey,
} from '../../src/app/shell/screenChange.js';
import { MAIN_CONTENT_ID } from '../../src/components/common/skipTarget.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// ------------------------------------------------------------ a tiny DOM
class FakeElement {
  constructor(tag, attrs = {}, children = [], { visible = true } = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = children;
    this.visible = visible;
    this.parent = null;
    this.isConnected = true;
    children.forEach((child) => { child.parent = this; });
  }
  get id() { return this.attrs.id || ''; }
  getClientRects() { return this.visible ? [{}] : []; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  matches(selector) {
    return selector.split(',').map((part) => part.trim()).some((part) => {
      const [, tag = '', attr, value] = part.match(/^([a-z0-9]*)(?:\[([a-z-]+)="([^"]*)"\])?$/i) || [];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      if (attr && this.attrs[attr] !== value) return false;
      return Boolean(tag || attr);
    });
  }
  closest(selector) {
    for (let node = this; node; node = node.parent) if (node.matches?.(selector)) return node;
    return null;
  }
  querySelectorAll(selector) { return this.descendants().filter((element) => element.matches(selector)); }
  focus() { this.doc.activeElement = this; }
}
const el = (tag, attrs, ...children) => new FakeElement(tag, attrs || {}, children);
const fakeDocument = (root) => {
  const order = [root, ...root.descendants()];
  const doc = {
    body: root,
    documentElement: root,
    activeElement: root,
    querySelectorAll: (selector) => order.filter((node) => node.matches(selector)),
  };
  order.forEach((node) => { node.doc = doc; });
  return doc;
};

const gradesScreen = () => {
  const navButton = el('button', {});
  const h1 = el('h1', {});
  const main = el('main', { id: MAIN_CONTENT_ID, tabindex: '-1' },
    el('nav', { 'aria-label': 'Student navigation' }, navButton),
    h1,
    el('h2', {}));
  const root = el('body', {}, el('div', {}, el('h1', {}, ), el('a', {})), main);
  // The identity bar's own h1-free header comes first; the stray h1 above
  // main is hidden (a collapsed panel), so it is passed over.
  root.children[0].children[0].visible = false;
  return { doc: fakeDocument(root), h1, main, navButton };
};

// ------------------------------------------------------------ the key
test('NAV-3: each student screen has its own key; teachers have none', () => {
  assert.equal(studentScreenKey({ role: 'teacher', view: 'dashboard', mode: 'grades' }), null);
  assert.equal(studentScreenKey({ role: 'student', view: null }), null);
  const keys = [
    studentScreenKey({ role: 'student', view: 'dashboard', mode: 'assignments' }),
    studentScreenKey({ role: 'student', view: 'dashboard', mode: 'grades' }),
    studentScreenKey({ role: 'student', view: 'dashboard', mode: 'testCycle', testCycleAssignmentId: 'a' }),
    studentScreenKey({ role: 'student', view: 'dashboard', mode: 'testCycle', testCycleAssignmentId: 'b' }),
    studentScreenKey({ role: 'student', view: 'assignmentResult', resultAssignmentId: 'a' }),
    studentScreenKey({ role: 'student', view: 'assignmentResult', resultAssignmentId: 'b' }),
    studentScreenKey({ role: 'student', view: 'assignment', assignmentId: 'a' }),
  ];
  assert.equal(new Set(keys).size, keys.length, keys.join(' | '));
  // Inside an assignment the shell only speaks: the workspace places focus on the work.
  assert.equal(screenChangeMovesFocus(keys[6]), false);
  keys.slice(0, 6).forEach((key) => assert.equal(screenChangeMovesFocus(key), true, key));
});

test('NAV-3: the announcement is the screen\'s name, without the product suffix', () => {
  assert.equal(screenAnnouncement('Grades – MathMaster'), 'Grades');
  assert.equal(screenAnnouncement('Tests & Exams – MathMaster'), 'Tests & Exams');
  assert.equal(screenAnnouncement('Lesson 3: Slope – MathMaster'), 'Lesson 3: Slope');
  assert.equal(screenAnnouncement(''), '');
});

// ------------------------------------------------------------ the focus
test('NAV-3: focus goes to the visible h1 inside main, and it is focusable without entering the Tab order', () => {
  const screen = gradesScreen();
  assert.equal(screenHeadingTarget(screen.doc), screen.h1);
  assert.equal(screen.h1.hasAttribute('tabindex'), false);
  assert.equal(focusScreenHeading(screen.doc), screen.h1);
  assert.equal(screen.doc.activeElement, screen.h1);
  assert.equal(screen.h1.attrs.tabindex, '-1');
});

test('NAV-3: a screen still loading has no target yet; a main with no h1 is the target itself', () => {
  const loading = fakeDocument(el('body', {}, el('div', {}, el('p', {}))));
  assert.equal(screenHeadingTarget(loading), null);
  assert.equal(focusScreenHeading(loading), null);
  const main = el('main', {}, el('p', {}));
  const doc = fakeDocument(el('body', {}, main));
  assert.equal(screenHeadingTarget(doc), main);
});

test('NAV-3: focus the student or the screen already put inside the new screen is left alone', () => {
  const screen = gradesScreen();
  screen.doc.activeElement = screen.navButton; // inside main
  assert.equal(focusAlreadyPlaced(screen.doc), true);
  assert.equal(focusScreenHeading(screen.doc), null);
  assert.equal(screen.doc.activeElement, screen.navButton);
  // On the page itself, on the shell's anchor, or on a node that unmounted: not placed.
  screen.doc.activeElement = screen.doc.body;
  assert.equal(focusAlreadyPlaced(screen.doc), false);
  screen.doc.activeElement = screen.main; // #mm-main-content
  assert.equal(focusAlreadyPlaced(screen.doc), false);
  screen.navButton.isConnected = false;
  screen.doc.activeElement = screen.navButton;
  assert.equal(focusAlreadyPlaced(screen.doc), false);
});

// ------------------------------------------------------------ App wiring
const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

test('NAV-3: App imports the module and runs it on every student screen-key change, and the shell has the live region', () => {
  assert.match(app, /^import \{ focusScreenHeading, screenAnnouncement, screenChangeMovesFocus, studentScreenKey \} from '\.\/app\/shell\/screenChange\.js';$/m);
  const effect = region(app, 'const pendingStudentScreenRef = useRef(null);', '}, [currentStudentScreenKey]);');
  // Only a change from an earlier student screen starts one (never the first screen after sign-in).
  assert.match(effect, /if \(previous && previous !== currentStudentScreenKey\) \{\s*pendingStudentScreenRef\.current = \{ key: currentStudentScreenKey/);
  assert.match(effect, /screenChangeMovesFocus\(pending\.key\) \? focusScreenHeading\(document\) : true/);
  assert.match(effect, /setStudentScreenAnnouncement\(screenAnnouncement\(documentTitleRef\.current\)\);/);
  const shell = region(app, 'const renderStudentIdentityShell = (', '\n  );');
  assert.match(shell, /role="status" aria-live="polite"[^>]*data-screen-announcement[^>]*>\s*\{studentScreenAnnouncement\}/);
});

test('NAV-15: the shell gives a screen with no main of its own one main, and never a second to a screen that has one', () => {
  const shell = region(app, 'const renderStudentIdentityShell = (', '\n  );');
  assert.match(shell, /\{main \? \(\s*(?:\/\/[^\n]*\n\s*)?<main id=\{MAIN_CONTENT_ID\} tabIndex=\{-1\}/);
  assert.match(app, /const renderStudentScreen = \(content\) => renderStudentIdentityShell\(content, \{ main: true \}\);/);
  // Wrapped by the shell: Home, Assignments, Grades, Rewards, Live Challenge, Test Cycle, Recovery.
  const wrapped = [...app.matchAll(/return renderStudentScreen\(\s*([\s\S]{0,400})/g)].map((match) => match[1]);
  for (const screen of ['<LiveChallengeStudent', '<StudentAssignmentsCenter', '<StudentRewardsCenter', '<StudentGradeCenter', '<TestCycleCard', '<StudentDashboardView', '<SectionRecoveryRunner']) {
    assert.ok(wrapped.some((body) => body.includes(screen)), `${screen} is not inside the shell's main`);
  }
  // Screens that draw their own <main> are not wrapped again.
  for (const screen of ['<MyMathPathApp', '<StudentSecureExamDashboard', '<StudentAssignmentResult', 'renderAssignmentWorkspace(']) {
    assert.ok(!wrapped.some((body) => body.includes(screen)), `${screen} would get a second main`);
  }
  // The Test Cycle screen's own <main> became the shell's.
  const testCycle = region(app, "if (studentDashboardMode === 'testCycle' && activeTestCycleAssignmentId) {", '\n    }\n');
  assert.doesNotMatch(testCycle, /<main\b/);
});
