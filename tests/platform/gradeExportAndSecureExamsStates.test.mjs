// GRADE EXPORT'S AND SECURE EXAMS' FLOWS AFTER THEIR FIRST SCREEN (TT27, fifth slice).
//
// The accessibility certification opens them now: Grade Export's review, a selection with its bar, and the district
// IDs open for correction (teacher-grade-export/review, /selection, /district-ids); and Secure Exams' practice-test
// session in the proctor monitor, a Test Cycle's typed delete confirmation, and its student preview
// (teacher-secure-exams/session, /delete, /preview). Two things were found and fixed.
//
// 1. With assignments selected, Grade Export's bar ("N selected · Review export…") is sticky at the foot of the screen,
//    and the Tab walk found controls parked under it as focus went down the page: 1 at 1366×768, and 9 on a phone (the
//    search box, the status chips, the rows). The focus reveal the student screens use to keep a control clear of
//    their action bar (src/platform/layout/actionBarFocusReveal.js) now takes the bar it watches as a selector, and
//    Grade Export gives it its own. Only a Tab-focused control the bar really covers moves the page; a control in
//    view, a click, and every student host (which names no selector) behave as they did.
// 2. The Test Cycle table's "Select every student shown" was 23.2 px tall, under the 24 a pointer target needs (WCAG
//    2.5.8; the large-text sweep's target check). It is 24.
//
// The browser proof is the scenes, held at zero by the ratchet and the large-text sweep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindActionBarFocusReveal, ACTION_BAR_FOCUS_GAP } from '../../src/platform/layout/actionBarFocusReveal.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));

// A window, a document and a host just big enough for the reveal: a focused control whose bottom runs under a sticky
// bar (or a control inside the bar, `inBar`), and a press of Tab before the focus.
const revealHarness = ({ barSelector, target: targetRect, bar: barRect, inBar = false }) => {
  const listeners = {};
  const scrolled = [];
  class FakeElement {}
  const bar = Object.assign(new FakeElement(), {
    getBoundingClientRect: () => barRect,
    contains: (node) => node === bar,
  });
  const target = Object.assign(new FakeElement(), {
    parentElement: null,
    closest: (selector) => (inBar && selector === barSelector ? bar : null),
    matches: () => true,
    getBoundingClientRect: () => targetRect,
  });
  const doc = {
    documentElement: { getAttribute: () => null },
    activeElement: target,
    elementFromPoint: () => bar,
    addEventListener: (type, handler) => { listeners[type] = handler; },
    removeEventListener: (type) => { delete listeners[type]; },
  };
  const win = {
    document: doc, Element: FakeElement, innerWidth: 390, innerHeight: 844,
    requestAnimationFrame: (callback) => { callback(); return 1; },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ overflowY: 'visible' }),
    scrollBy: (options) => scrolled.push(options),
  };
  const host = { contains: () => true, querySelector: (selector) => (selector === barSelector ? bar : null) };
  const tabTo = () => { listeners.keydown({ key: 'Tab' }); listeners.focusin({ target }); };
  return { win, host, tabTo, scrolled };
};

test('the focus reveal keeps a control clear of the bar it is given, and of no other', () => {
  const rects = { target: { top: 760, bottom: 800, left: 20, right: 200 }, bar: { top: 744, bottom: 844, left: 0, right: 390 } };
  const selection = revealHarness({ barSelector: '.tw-selection-bar', ...rects });
  const unbind = bindActionBarFocusReveal(() => selection.host, { win: selection.win, selector: '.tw-selection-bar' });
  selection.tabTo();
  assert.deepEqual(selection.scrolled, [{ top: 800 - 744 + ACTION_BAR_FOCUS_GAP, left: 0, behavior: 'auto' }], 'scrolled by the overlap and the gap');
  unbind();
  // The same page with the default bar: the selection bar is not the QuestionEngine's, so nothing moves. Every student
  // host calls it without a selector and keeps the action bar it had.
  const again = revealHarness({ barSelector: '.tw-selection-bar', ...rects });
  const unbindDefault = bindActionBarFocusReveal(() => again.host, { win: again.win });
  again.tabTo();
  assert.deepEqual(again.scrolled, [], 'the default selector is the action bar\'s');
  unbindDefault();
  // A control the bar does not cover moves nothing, and neither does one of the bar's own (Clear, Review export…).
  const clear = revealHarness({ barSelector: '.tw-selection-bar', target: { top: 600, bottom: 640, left: 20, right: 200 }, bar: rects.bar });
  bindActionBarFocusReveal(() => clear.host, { win: clear.win, selector: '.tw-selection-bar' });
  clear.tabTo();
  assert.deepEqual(clear.scrolled, [], 'clear of the bar');
  const own = revealHarness({ barSelector: '.tw-selection-bar', ...rects, inBar: true });
  bindActionBarFocusReveal(() => own.host, { win: own.win, selector: '.tw-selection-bar' });
  own.tabTo();
  assert.deepEqual(own.scrolled, [], 'inside the bar');
});

test('Grade Export binds the reveal to its selection bar, on the screen that holds it', () => {
  const source = read('src/components/teacher/GradeTransferCenter.jsx');
  assert.match(source, /^import useActionBarFocusReveal from '\.\.\/common\/useActionBarFocusReveal\.js';$/m);
  assert.match(source, /const screenRef = useRef\(null\);\s*useActionBarFocusReveal\(screenRef, \{ selector: '\.tw-selection-bar' \}\);/);
  assert.match(source, /return <section ref=\{screenRef\} aria-labelledby="grade-transfer-heading"/, 'the screen\'s own section is the host');
  assert.match(source, /<div className="tw-selection-bar" role="region" aria-label="Selected exports">/, 'and the bar is inside it, with the class the reveal names');
  const hook = read('src/components/common/useActionBarFocusReveal.js');
  assert.match(hook, /bindActionBarFocusReveal\(\(\) => hostRef\.current, selector \? \{ selector \} : undefined\)/, 'the hook passes the selector on, and nothing when a host gives none');
});

test('the Test Cycle table\'s select-all is a 24 px target', () => {
  const source = read('src/components/teacher/TestCycleControls.jsx');
  const header = region(source, "{heading === 'Student' && !external ? (", 'aria-label="Select every student shown"', 'the select-all label');
  const minHeight = Number(header.match(/<label style=\{\{[^}]*minHeight: (\d+) \}\}>/)?.[1]);
  assert.ok(minHeight >= 24, `the label around the checkbox, which a press on "Student" also toggles, is ${minHeight} px tall`);
});
