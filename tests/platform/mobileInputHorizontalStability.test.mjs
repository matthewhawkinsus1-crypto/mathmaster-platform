import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  scrollFocusedControlVertically,
  stabilizeHorizontalViewport,
} from '../../src/platform/mobile/mobileFocusViewport.js';

test('stabilizeHorizontalViewport resets page and locked question shells without changing vertical position', () => {
  const page = { scrollLeft: 47, scrollTop: 320 };
  const body = { scrollLeft: 12 };
  const html = { scrollLeft: 19 };
  const parent = {
    scrollLeft: 21,
    parentElement: null,
    matches: () => true,
  };
  const root = {
    scrollLeft: 33,
    parentElement: parent,
    matches: () => true,
  };
  const scrollCalls = [];
  const windowObject = {
    scrollX: 47,
    scrollY: 320,
    scrollTo: (options) => scrollCalls.push(options),
  };
  const documentObject = {
    scrollingElement: page,
    documentElement: html,
    body,
  };

  assert.equal(stabilizeHorizontalViewport({ root, windowObject, documentObject }), true);
  assert.equal(page.scrollLeft, 0);
  assert.equal(body.scrollLeft, 0);
  assert.equal(html.scrollLeft, 0);
  assert.equal(root.scrollLeft, 0);
  assert.equal(parent.scrollLeft, 0);
  assert.deepEqual(scrollCalls, [{ left: 0, top: 320, behavior: 'auto' }]);
});

test('vertical focus adjustment preserves a tool-local horizontal scroll position', () => {
  const scrollCalls = [];
  const scroller = {
    scrollLeft: 64,
    scrollTop: 100,
    parentElement: null,
    matches: () => false,
    getBoundingClientRect: () => ({ top: 0, bottom: 300 }),
    scrollBy: (options) => {
      scrollCalls.push(options);
      scroller.scrollTop += options.top;
    },
  };
  const target = {
    closest: () => scroller,
    getBoundingClientRect: () => ({ top: 280, bottom: 340 }),
  };
  const page = { scrollLeft: 0, scrollTop: 0 };
  const windowObject = { scrollX: 0, scrollY: 0, scrollTo() {} };
  const documentObject = {
    scrollingElement: page,
    documentElement: { scrollLeft: 0 },
    body: { scrollLeft: 0 },
  };

  assert.equal(scrollFocusedControlVertically(target, {
    root: null,
    margin: 12,
    windowObject,
    documentObject,
  }), true);

  assert.equal(scroller.scrollLeft, 64);
  assert.equal(scrollCalls.length, 1);
  assert.equal(scrollCalls[0].left, 0);
  assert.equal(scrollCalls[0].behavior, 'auto');
  assert.ok(scrollCalls[0].top > 0);
});

test('mobile focus code no longer uses scrollIntoView, which can pan clipped ancestors sideways', () => {
  const source = readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8');
  assert.doesNotMatch(source, /scrollIntoView\?\.\(\{ block: 'nearest', inline: 'nearest'/);
  assert.match(source, /scrollFocusedControlVertically\(target/);
  assert.match(source, /focusedScrollerLockRef/);
  assert.match(source, /onInputCapture=\{handleInputCapture\}/);
  assert.match(source, /onKeyDownCapture=\{handleKeyDownCapture\}/);
});

test('MathInput stabilizes the viewport after physical and on-screen keyboard edits', () => {
  const source = readFileSync('src/MathInput.jsx', 'utf8');
  assert.match(source, /scheduleHorizontalViewportStabilization/);
  assert.match(source, /const handleInput = \(\) => \{/);
  assert.match(source, /stabilizeMobileViewport\(\);/);
  assert.match(source, /event\.key === ' ' \|\| event\.code === 'Space'/);
});

test('plain Path word fields autofocus without browser scrolling', () => {
  const source = readFileSync('src/components/student/PathResponseFields.jsx', 'utf8');
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
});

test('mobile CSS locks only page/question shells while preserving tool-local scrolling', () => {
  const source = readFileSync('src/platform/mobile/MobileInteractionFoundation.css', 'utf8');
  assert.match(source, /overscroll-behavior-x: none/);
  assert.match(source, /\.mathmaster-question-container \.question-prompt-panel/);
  assert.match(source, /overflow-x: clip !important/);
  assert.doesNotMatch(source, /\.math-tool-workspace[^\{]*\{[^}]*overflow-x:\s*clip/s);
});


test('desktop question wrapper also restores tool-local horizontal position while typing', () => {
  const source = readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8');
  assert.match(source, /mathmaster-desktop-question-content/);
  assert.match(source, /onInputCapture=\{handleInputCapture\}/);
  assert.match(source, /onKeyDownCapture=\{handleKeyDownCapture\}/);
  assert.doesNotMatch(source, /const restoreFocusedHorizontalPosition = \(\) => \{\s*if \(!isMobile\) return;/);
});

test('MathInput horizontal stabilization is no longer gated to mobile only', () => {
  const source = readFileSync('src/MathInput.jsx', 'utf8');
  const start = source.indexOf('const stabilizeMobileViewport');
  const end = source.indexOf('const requiredAnswerSymbols', start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /if \(!isMobile\) return/);
  assert.match(source, /mathField\.addEventListener\('focus', handleFocus\)/);
});


test('question-level scroll lock runs on desktop too and includes composed tool workspaces', () => {
  const source = readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8');
  const lockStart = source.indexOf('const promptPanel = root.querySelector');
  const lockEnd = source.indexOf('useEffect(() => {', lockStart + 20);
  const block = source.slice(lockStart, lockEnd > lockStart ? lockEnd : undefined);
  assert.doesNotMatch(block, /if \(!root \|\| !isMobile\) return undefined/);
  assert.match(block, /mathmaster-question-tool-workspace/);
  assert.match(block, /workflow-focus__workspace/);
  assert.match(block, /window\.addEventListener\('scroll', onWindowScroll/);
});

test('viewport stabilizer resets root and non-scrolling student workspaces explicitly', () => {
  const source = readFileSync('src/platform/mobile/mobileFocusViewport.js', 'utf8');
  assert.match(source, /setScrollLeftZero\(root\)/);
  assert.match(source, /mathmaster-question-tool-workspace/);
  assert.match(source, /workflow-focus__active-stage/);
});
