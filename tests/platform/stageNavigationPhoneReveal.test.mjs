// "Next step" on a phone opens the next step where the student can see it.
//
// The desktop reveal brings the step's card under the pinned task card
// (studentJourneyDol2Final.test.mjs). A phone has no sticky stack, but it had
// the same failure: upright, the question scrolls in its own box between the
// task and the action bar, and the box stayed where the old step had it — at
// 390×664 "Mark every x-intercept" opened with its plane scrolled out above the
// box. tests/browser/stagedQuestion.mjs measures it in a real browser; these
// pin the arithmetic with a fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bringActiveStageIntoView, revealActiveStageOnPhone } from '../../src/platform/workflow/stageNavigationScroll.js';

const box = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 344, width: 344 });

const node = ({ rect, parent = null, overflowY = 'visible', position = 'static', scrollHeight = 0, clientHeight = 0 }) => ({
  parentElement: parent,
  overflowY,
  position,
  scrollHeight,
  clientHeight,
  scrolled: [],
  getBoundingClientRect: () => rect,
  scrollBy(options) { this.scrolled.push(Math.round(options.top)); },
});

const phoneWindow = ({ innerHeight = 664, identity = '38px', frames = true } = {}) => {
  const documentElement = {};
  const body = {};
  const win = {
    innerHeight,
    document: { documentElement, body, scrollingElement: documentElement },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: (element) => (element === documentElement
      ? { getPropertyValue: () => identity }
      : { overflowY: element.overflowY || 'visible', position: element.position || 'static', top: 'auto' }),
    scrolled: [],
    scrollBy(options) { this.scrolled.push(Math.round(options.top)); },
    pending: [],
  };
  if (frames) win.requestAnimationFrame = (callback) => { win.pending.push(callback); return win.pending.length; };
  return win;
};

// The upright phone: the work box is MobileViewportContainer's workspace, at
// 377–603 on a 390×664 screen, with far more in it than it shows.
const upright = (stageRect) => {
  const workBox = node({ rect: box(377, 226), overflowY: 'auto', scrollHeight: 1500, clientHeight: 226 });
  const body = node({ rect: box(stageRect.top - 40, stageRect.height + 80), parent: workBox });
  const stage = node({ rect: stageRect, parent: body });
  const root = {
    closest: () => null,
    ownerDocument: { querySelector: () => null },
    querySelector: (selector) => (selector === '.workflow-focus__active-stage' ? stage : null),
  };
  return { root, workBox };
};

test('a step that opens above the work box lines up its top in the box', () => {
  const { root, workBox } = upright(box(63, 234));
  assert.equal(revealActiveStageOnPhone(root, phoneWindow()), true);
  assert.deepEqual(workBox.scrolled, [63 - (377 + 8)]);
});

test('a step that opens below the box rises only until its last control is in', () => {
  const { root, workBox } = upright(box(650, 44));
  assert.equal(revealActiveStageOnPhone(root, phoneWindow()), true);
  assert.deepEqual(workBox.scrolled, [694 - (603 - 8)]);
});

test('a step already in view stays where it is', () => {
  const { root, workBox } = upright(box(420, 44));
  assert.equal(revealActiveStageOnPhone(root, phoneWindow()), false);
  assert.deepEqual(workBox.scrolled, []);
});

test('a step taller than the box (a plane) shows its top', () => {
  const { root, workBox } = upright(box(430, 430));
  assert.equal(revealActiveStageOnPhone(root, phoneWindow()), true);
  assert.deepEqual(workBox.scrolled, [430 - (377 + 8)]);
});

test('on its side the page scrolls, under the identity bar and a navigator that is not pinned', () => {
  const page = node({ rect: box(0, 1200) });
  const stage = node({ rect: box(500, 44), parent: page });
  const nav = node({ rect: box(38, 56), position: 'relative' });
  const root = {
    closest: () => null,
    ownerDocument: { querySelector: (selector) => (selector === '.mathmaster-assignment-unified-nav' ? nav : null) },
    querySelector: (selector) => (selector === '.workflow-focus__active-stage' ? stage : null),
  };
  const win = phoneWindow({ innerHeight: 390 });
  assert.equal(revealActiveStageOnPhone(root, win), true);
  assert.deepEqual(win.scrolled, [544 - (390 - 8)]);
});

test('on its side a step that starts under the identity bar comes out from under it', () => {
  const page = node({ rect: box(0, 1200) });
  const stage = node({ rect: box(20, 44), parent: page });
  const nav = node({ rect: box(-60, 56), position: 'relative' });
  const root = {
    closest: () => null,
    ownerDocument: { querySelector: (selector) => (selector === '.mathmaster-assignment-unified-nav' ? nav : null) },
    querySelector: (selector) => (selector === '.workflow-focus__active-stage' ? stage : null),
  };
  const win = phoneWindow({ innerHeight: 390 });
  assert.equal(revealActiveStageOnPhone(root, win), true);
  assert.deepEqual(win.scrolled, [20 - (38 + 8)]);
});

test('the reveal waits two frames, so the focused Next button cannot scroll the box back', () => {
  const { root, workBox } = upright(box(63, 234));
  const win = phoneWindow();
  assert.equal(bringActiveStageIntoView(root, { win }), true);
  assert.deepEqual(workBox.scrolled, [], 'nothing moves in the frame the tap focused the button');
  win.pending.shift()();
  assert.deepEqual(workBox.scrolled, [], 'nor in the next, where the phone container keeps the focused button in view');
  win.pending.shift()();
  assert.deepEqual(workBox.scrolled, [63 - 385]);
});

test('Work View is left alone on a phone too: its dialog is its own scroller', () => {
  const { root, workBox } = upright(box(63, 234));
  const win = phoneWindow();
  assert.equal(bringActiveStageIntoView({ ...root, closest: () => ({}) }, { win }), false);
  assert.equal(win.pending.length, 0);
  assert.deepEqual(workBox.scrolled, []);
});
