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
  SCREEN_HEADING_WAIT_MS,
  SCREEN_NAME_WAIT_MS,
  focusAlreadyPlaced,
  focusScreenHeading,
  focusWhereChangeLeftIt,
  screenAnnouncement,
  screenChangeMovesFocus,
  screenHeadingTarget,
  settleScreenChange,
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

test('NAV-3, PF01: a screen whose code is on its way inside the shell\'s main (aria-busy) waits for its heading', () => {
  // Grades, Assignments and Rewards draw in the shell's own main; until their
  // code is here it holds a busy "Opening …" status (app/lazyScreens.js).
  const opening = el('div', { 'aria-busy': 'true' }, el('p', { role: 'status' }));
  const main = el('main', { id: MAIN_CONTENT_ID, tabindex: '-1' }, opening);
  const loading = fakeDocument(el('body', {}, main));
  assert.equal(screenHeadingTarget(loading), null, 'not the landmark: the shell keeps looking, and the h1 is focused when it lands');
  assert.equal(focusScreenHeading(loading), null);
  // Only a busy region on screen holds it up.
  opening.visible = false;
  assert.equal(screenHeadingTarget(loading), main);
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

// ------------------------------------------------------------ the wait
// A screen still loading draws neither a main nor an h1 (My Math Path's
// "Loading My Math Path…"): both hidden until its data arrives.
const slowScreen = () => {
  const link = el('a', {});
  const other = el('a', {});
  const h1 = el('h1', {});
  const main = el('main', {}, h1);
  const doc = fakeDocument(el('body', {}, el('nav', {}, link, other), main));
  main.visible = false;
  h1.visible = false;
  const land = () => { main.visible = true; h1.visible = true; };
  return { doc, link, other, h1, land };
};

test('NAV-3: a slow screen is named at 2 s, and its heading still takes focus when it lands', () => {
  const screen = slowScreen();
  const pending = { startedAt: 0, from: null, said: false };
  const said = [];
  const look = (now) => settleScreenChange(screen.doc, pending, { now, announce: () => said.push(now) });
  assert.equal(look(50), 100, 'keeps looking; nothing said yet');
  assert.deepEqual(said, []);
  assert.equal(look(SCREEN_NAME_WAIT_MS), 250, 'named at 2 s, and still looking');
  assert.deepEqual(said, [SCREEN_NAME_WAIT_MS]);
  assert.equal(screen.doc.activeElement, screen.doc.body);
  screen.land();
  assert.equal(look(3500), null, 'settled once the heading has focus');
  assert.equal(screen.doc.activeElement, screen.h1);
  assert.deepEqual(said, [SCREEN_NAME_WAIT_MS], 'the name is said once');
  // A quick screen is named when its heading takes focus.
  const quick = slowScreen();
  quick.land();
  const quickSaid = [];
  assert.equal(settleScreenChange(quick.doc, { startedAt: 0, from: null, said: false }, { now: 50, announce: () => quickSaid.push(50) }), null);
  assert.equal(quick.doc.activeElement, quick.h1);
  assert.deepEqual(quickSaid, [50]);
});

test('NAV-3: after 2 s the look ends where the student moved focus, and at 15 s in any case', () => {
  const screen = slowScreen();
  screen.link.focus(); // the place the student pressed, kept by the shell
  const pending = { startedAt: 0, from: screen.link, said: false };
  assert.equal(focusWhereChangeLeftIt(screen.doc, screen.link), true);
  assert.equal(settleScreenChange(screen.doc, pending, { now: 2500 }), 250, 'focus still on the pressed place');
  screen.other.focus(); // the student moves on
  assert.equal(focusWhereChangeLeftIt(screen.doc, screen.link), false);
  assert.equal(settleScreenChange(screen.doc, pending, { now: 2750 }), null, 'the look ends');
  screen.land();
  assert.equal(screen.doc.activeElement, screen.other, 'and the heading never takes it');
  // Focus left alone: the look ends at 15 s.
  const late = slowScreen();
  const latePending = { startedAt: 0, from: null, said: true };
  assert.equal(settleScreenChange(late.doc, latePending, { now: SCREEN_HEADING_WAIT_MS - 1 }), 250);
  assert.equal(settleScreenChange(late.doc, latePending, { now: SCREEN_HEADING_WAIT_MS }), null);
  // A node that unmounted is not the student's.
  screen.other.isConnected = false;
  assert.equal(focusWhereChangeLeftIt(screen.doc, screen.link), true);
});

test('NAV-3: a screen that places its own focus, or only speaks, is named and left alone', () => {
  // Focus the screen put inside its main: named at 2 s, never moved.
  const screen = gradesScreen();
  screen.doc.activeElement = screen.navButton;
  const pending = { startedAt: 0, from: null, said: false };
  let said = 0;
  const look = (now) => settleScreenChange(screen.doc, pending, { now, announce: () => { said += 1; } });
  assert.equal(look(50), 100);
  assert.equal(look(SCREEN_NAME_WAIT_MS), null);
  assert.equal(screen.doc.activeElement, screen.navButton);
  assert.equal(said, 1);
  // Inside an assignment the change only speaks, at once.
  const speakOnly = slowScreen();
  let spoken = 0;
  assert.equal(settleScreenChange(speakOnly.doc, { startedAt: 0, from: null, said: false }, { now: 50, movesFocus: false, announce: () => { spoken += 1; } }), null);
  assert.equal(spoken, 1);
  assert.equal(speakOnly.doc.activeElement, speakOnly.doc.body);
});

// ------------------------------------------------------------ App wiring
const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

test('NAV-3: App imports the module and runs it on every student screen-key change, and the shell has the live region', () => {
  assert.match(app, /^import \{ screenAnnouncement, screenChangeMovesFocus, settleScreenChange, studentScreenKey \} from '\.\/app\/shell\/screenChange\.js';$/m);
  const effect = region(app, 'const pendingStudentScreenRef = useRef(null);', '}, [currentStudentScreenKey]);');
  // Only a change from an earlier student screen starts one (never the first screen after sign-in).
  assert.match(effect, /if \(previous && previous !== currentStudentScreenKey\) \{\s*pendingStudentScreenRef\.current = \{\s*key: currentStudentScreenKey,/);
  // What had focus as the change began: a later look leaves the student's own focus alone.
  assert.match(effect, /from: typeof document === 'undefined' \? null : document\.activeElement,\s*said: false,/);
  assert.match(effect, /settleScreenChange\(document, pending, \{\s*movesFocus: screenChangeMovesFocus\(pending\.key\),\s*announce: \(\) => setStudentScreenAnnouncement\(screenAnnouncement\(documentTitleRef\.current\)\),\s*\}\);/);
  assert.match(effect, /if \(next != null\) \{\s*timer = window\.setTimeout\(settle, next\);/);
  const shell = region(app, 'const renderStudentIdentityShell = (', '\n  };');
  assert.match(shell, /role="status" aria-live="polite"[^>]*data-screen-announcement[^>]*>\s*\{studentScreenAnnouncement\}/);
});

test('NAV-3: a reload of My Math Path keeps the screen, and the heading a screen change focused', () => {
  // My Math Path draws its h1 once the student's Path has loaded, and loads
  // again when its assignments or the student's profile change: just after a
  // screen change, in a development build, as React runs App's effects again
  // when the screen's code arrives. For a student with no profile yet each
  // load swapped the whole screen for "Loading My Math Path…" and back, the
  // focused h1 with it, and focus fell to the page (CI on #541). Only the
  // first load of a student's Path says "Loading …".
  const path = executableSource(readFileSync(new URL('../../src/components/student/MyMathPathApp.jsx', import.meta.url), 'utf8'));
  const gate = region(path, 'const sessionOnScreen', 'Loading My Math Path…', 'the loading gate');
  assert.match(gate, /if \(loading && firstLoad && !sessionOnScreen && /);
  // The view's default keeps the Teacher Path Simulator, which loads nothing, as it was.
  assert.match(path, /^  firstLoad = true,$/m);
  // The container records whose Path it loaded; only another student's is a first load.
  const container = region(path, 'export const MyMathPathApp = (props) => {', 'export default MyMathPathApp;', 'the container');
  assert.match(container, /const \[loadedStudentId, setLoadedStudentId\] = useState\(null\);/);
  assert.match(container, /setLoading\(false\);\s*setLoadedStudentId\(studentId\);\s*\}, \[studentId, assignments\]\);/);
  assert.match(container, /\bloading=\{loading\}\s*firstLoad=\{loadedStudentId !== studentId\}/);
});

test('NAV-15: the shell gives a screen with no main of its own one main, and never a second to a screen that has one', () => {
  const shell = region(app, 'const renderStudentIdentityShell = (', '\n  };');
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
