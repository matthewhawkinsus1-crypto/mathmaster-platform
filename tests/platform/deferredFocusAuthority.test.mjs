/*
 * ONCE THE STUDENT ACTS, NO LATE FOCUS FROM BEFORE MAY MOVE THE CURSOR.
 *
 * The cross-device restore race (PR #435 `directions`): the restore asked for
 * the cursor in box A a frame later; the student clicked box B first; the late
 * focus pulled them back and their typing landed in A, over the restored work.
 * tests/browser/teacherWorkflow/restoredDraftFocusRaceJourneys.mjs drives the
 * real app; these pin each rule of the authority with a stand-in page, so the
 * suite catches a regression without a browser. Each rule here has a mutation
 * that turns its test red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeferredFocusAuthority,
  isExplicitStudentInteraction,
} from '../../src/platform/interaction/deferredFocusAuthority.js';
import { answerControlAcceptsFocus } from '../../src/platform/interaction/answerEntryUx.js';

// A page: listeners by type, a focused element, and frames that run only when
// the test says. `escapeCancel` makes cancelAnimationFrame do nothing — a
// frame that got away, which only the authority's own checks can stop.
const makePage = ({ escapeCancel = false } = {}) => {
  const listeners = [];
  const body = { tagName: 'BODY' };
  const documentObject = {
    body,
    documentElement: { tagName: 'HTML' },
    activeElement: body,
    addEventListener: (type, handler, options) => listeners.push({ type, handler, options }),
    removeEventListener: (type, handler) => {
      const index = listeners.findIndex((entry) => entry.type === type && entry.handler === handler);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  let frames = [];
  let nextFrame = 1;
  const windowObject = {
    requestAnimationFrame: (callback) => { frames.push({ id: nextFrame, callback }); nextFrame += 1; return nextFrame - 1; },
    cancelAnimationFrame: (id) => { if (!escapeCancel) frames = frames.filter((frame) => frame.id !== id); },
  };
  const dispatch = (type, event = {}) => {
    const full = { type, isTrusted: true, target: documentObject.activeElement, ...event };
    listeners.filter((entry) => entry.type === type).forEach((entry) => entry.handler(full));
  };
  const runFrames = () => {
    const due = frames;
    frames = [];
    due.forEach((frame) => frame.callback(0));
  };
  return { documentObject, windowObject, dispatch, runFrames, listeners, body, pending: () => frames.length };
};
const element = (name) => ({ tagName: 'BUTTON', name });

const started = (page) => {
  const authority = createDeferredFocusAuthority(page);
  authority.start();
  return authority;
};

test('with no interaction, the late focus runs: a restore still puts the cursor back', () => {
  const page = makePage();
  const authority = started(page);
  const ran = [];
  authority.request(() => ran.push('restore'));
  assert.equal(ran.length, 0, 'not now: on the next frame, once the boxes exist');
  page.runFrames();
  assert.deepEqual(ran, ['restore']);
});

test('a click after the restore began cancels it, even when the click moved no focus', () => {
  const page = makePage();
  const authority = started(page);
  const ran = [];
  authority.request(() => ran.push('restore'));
  page.dispatch('pointerdown', { target: element('question text') });
  page.runFrames();
  assert.deepEqual(ran, [], 'the student pressed: their interaction wins');
});

test('touch and a mouse without pointer events cancel it too', () => {
  for (const type of ['touchstart', 'mousedown']) {
    const page = makePage();
    const authority = started(page);
    let ran = false;
    authority.request(() => { ran = true; });
    page.dispatch(type, { target: element('box B') });
    page.runFrames();
    assert.equal(ran, false, type);
  }
});

test('the keyboard is an interaction: Tab, Shift+Tab, and a key aimed at a control', () => {
  const cases = [
    { key: 'Tab', target: null },
    { key: 'Tab', shiftKey: true, target: null },
    { key: 'ArrowDown', target: element('Log Out') },
    { key: '4', target: element('box B') },
  ];
  cases.forEach((event) => {
    const page = makePage();
    const authority = started(page);
    let ran = false;
    authority.request(() => { ran = true; });
    page.dispatch('keydown', { ...event, target: event.target || page.body });
    page.runFrames();
    assert.equal(ran, false, `${event.shiftKey ? 'Shift+' : ''}${event.key}`);
  });
});

test('a key typed with focus nowhere is on its way to the restored box, and does not cancel it', () => {
  // The remount took the old box away mid-typing: the next key has no target
  // of its own until the restore puts the cursor back (the `late` journey).
  const page = makePage();
  const authority = started(page);
  let ran = false;
  authority.request(() => { ran = true; });
  page.dispatch('keydown', { key: '4', target: page.body });
  page.dispatch('keydown', { key: 'Shift', target: element('box') });
  page.runFrames();
  assert.equal(ran, true);
});

test('only the student counts: synthetic events are not an interaction', () => {
  const page = makePage();
  const authority = started(page);
  let ran = false;
  authority.request(() => { ran = true; });
  page.dispatch('pointerdown', { isTrusted: false, target: element('Next') });
  page.dispatch('keydown', { isTrusted: false, key: 'Tab' });
  page.runFrames();
  assert.equal(ran, true);
  assert.equal(isExplicitStudentInteraction({ type: 'focusin', isTrusted: true }, page.documentObject), false, 'focus arriving is not a press');
  assert.equal(isExplicitStudentInteraction(null), false);
});

test('focus moved by anyone else since the request — a screen reader, a dialog — is not undone', () => {
  const page = makePage();
  const authority = started(page);
  let ran = false;
  authority.request(() => { ran = true; });
  page.documentObject.activeElement = element('Work View close');
  page.runFrames();
  assert.equal(ran, false);

  // Focus falling back to nothing (the element that had it was removed) is not
  // anyone's choice: the restore still runs.
  const again = makePage();
  again.documentObject.activeElement = element('old box');
  const second = started(again);
  let restored = false;
  second.request(() => { restored = true; });
  again.documentObject.activeElement = again.body;
  again.runFrames();
  assert.equal(restored, true);
});

test('a newer request supersedes an older one, even if the older frame still fires', () => {
  const page = makePage({ escapeCancel: true });
  const authority = started(page);
  const ran = [];
  authority.request(() => ran.push('first restore'));
  authority.request(() => ran.push('second restore'));
  page.runFrames();
  assert.deepEqual(ran, ['second restore']);
});

test('the question going away — or a new mount generation — drops what it asked for', () => {
  // A frame that escaped cancellation still finds its generation over.
  const page = makePage({ escapeCancel: true });
  const authority = started(page);
  let ran = false;
  authority.request(() => { ran = true; });
  authority.stop();
  page.runFrames();
  assert.equal(ran, false, 'unmounted: question switch, assignment switch, sign-out');

  // StrictMode (and any remount reusing the object) starts a new generation;
  // a request from the old one never revives.
  const strict = makePage({ escapeCancel: true });
  const remounted = started(strict);
  const before = remounted.generation;
  let stale = false;
  remounted.request(() => { stale = true; });
  remounted.stop();
  remounted.start();
  assert.ok(remounted.generation > before, 'generations only move forward');
  strict.runFrames();
  assert.equal(stale, false);
  assert.equal(strict.listeners.length, 4, 'one set of listeners, not two');
});

test('stopped, an authority listens to nothing and schedules nothing', () => {
  const page = makePage();
  const authority = started(page);
  assert.equal(page.listeners.length, 4);
  assert.ok(page.listeners.every((entry) => entry.options?.capture === true), 'capture: recorded before any handler under it');
  authority.stop();
  assert.equal(page.listeners.length, 0);
  let ran = false;
  authority.request(() => { ran = true; });
  assert.equal(page.pending(), 0);
  page.runFrames();
  assert.equal(ran, false);
});

test('an interaction on one question says nothing about the next one', () => {
  const page = makePage();
  const first = started(page);
  page.dispatch('pointerdown', { target: element('box on question 3') });
  assert.equal(first.interactions, 1);
  first.stop();
  const next = started(page);
  assert.equal(next.interactions, 0);
  assert.ok(next.generation > first.generation);
  let opened = false;
  next.request(() => { opened = true; });
  page.runFrames();
  assert.equal(opened, true, 'question 4 still opens with its own autofocus');
});

test("a focus that answers the student's own action counts only what comes after it", () => {
  // A Step Algebra action sends the student to a field (MathInput focusSignal),
  // or Enter brings Submit into focus: the press that caused it came first.
  const page = makePage();
  const authority = started(page);
  page.dispatch('pointerdown', { target: element('Subtract') });
  let followed = false;
  authority.request(() => { followed = true; }, { since: 'now' });
  page.runFrames();
  assert.equal(followed, true);

  let stale = false;
  authority.request(() => { stale = true; }, { since: 'now' });
  page.dispatch('pointerdown', { target: element('somewhere else') });
  page.runFrames();
  assert.equal(stale, false);

  // The same press, against a request from the mount, cancels it.
  let opening = false;
  authority.request(() => { opening = true; });
  page.runFrames();
  assert.equal(opening, false);
});

test('a ticket answers the same question for a caller that schedules its own frames', () => {
  const page = makePage();
  const authority = started(page);
  const ticket = authority.ticket({ since: 'now' });
  assert.equal(authority.isLive(ticket), true);
  page.dispatch('keydown', { key: 'Tab', target: page.body });
  assert.equal(authority.isLive(ticket), false);
  assert.equal(authority.isLive(null), false);
});

test('a late focus lands only where a student could put it: not a locked box, not behind a dialog', () => {
  const closest = (matches) => (selector) => (matches.some((match) => selector.includes(match)) ? {} : null);
  const open = { isConnected: true, closest: () => null };
  assert.equal(answerControlAcceptsFocus(open, null), true);
  assert.equal(answerControlAcceptsFocus({ ...open, isConnected: false }, null), false, 'removed by a remount');
  assert.equal(answerControlAcceptsFocus({ ...open, disabled: true }, null), false);
  assert.equal(answerControlAcceptsFocus({ ...open, closest: closest(['fieldset:disabled']) }, null), false, 'a locked or submitted question');
  assert.equal(answerControlAcceptsFocus({ ...open, closest: closest(['[inert]']) }, null), false, 'correct / closed: inert');
  const dialog = { contains: () => false };
  const page = { querySelectorAll: (selector) => (selector === '[aria-modal="true"]' ? [dialog] : []) };
  assert.equal(answerControlAcceptsFocus(open, page), false, 'Work View or another modal is open over it');
  assert.equal(answerControlAcceptsFocus(open, { querySelectorAll: () => [{ contains: () => true }] }), true, 'inside the open Work View is fine');
  assert.equal(answerControlAcceptsFocus(null, null), false);
});
