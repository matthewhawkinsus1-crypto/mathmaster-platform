import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Live QA, 1536×900, systems substitution: the two given equations took a
// 300px column with ~750px of blank space beneath them, while the Step Algebra
// balance board got 165px per side and cancellation terms were clipped.
test('an active systems solver gets the full width; the givens become a strip above it', () => {
  const css = read('src/tools/systemsWorkspace/AlgebraicSystemMode.css');
  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf('}', start));
  };
  assert.match(rule('.mathmaster-algebraic-system-layout.has-active-solver'), /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(rule('.mathmaster-work-view-host[data-open="true"] .mathmaster-algebraic-system-layout.has-active-solver'), /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(rule('.mathmaster-algebraic-system-layout.has-active-solver .mathmaster-algebraic-system-givens > .mathmaster-tool-panel'), /display:\s*flex;/);
  assert.doesNotMatch(css, /algebraic-system-layout\.has-active-solver \{\s*grid-template-columns:\s*minmax\(2\d0px/, 'no fixed side column while solving');
});

// Live QA, 1536×900: the navigator (top: 8px) sat 30px under the identity bar,
// hiding the section tabs; the task card's Hide button sat under the navigator
// (fixed top: 118px); the TEKS/CCMR chips rode in the sticky area over the
// tool's own buttons.
test('the sticky stack is offset by measured heights, not guesses', () => {
  const css = read('src/App.css');
  const nav = css.slice(css.indexOf('.mathmaster-assignment-unified-nav {'), css.indexOf('}', css.indexOf('.mathmaster-assignment-unified-nav {')));
  assert.match(nav, /top: calc\(var\(--mm-student-identity-stack-offset, 0px\) \+ 6px\);/);
  assert.match(css, /--mm-sticky-task-top: calc\(var\(--mm-student-identity-stack-offset, 0px\) \+ 6px \+ var\(--mm-assignment-nav-height, 112px\) \+ 4px\);/);
  assert.equal(ASSIGNMENT_NAV_HEIGHT_VAR, '--mm-assignment-nav-height');

  // App.jsx is never imported by a test, so assert the import next to the call.
  const app = read('src/App.jsx');
  assert.match(app, /import \{ ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef \} from '\.\/platform\/layout\/stickyHeightRef\.js';/);
  assert.match(app, /<nav ref=\{stickyHeightRef\(ASSIGNMENT_NAV_HEIGHT_VAR\)\} className=\{`mathmaster-assignment-unified-nav/);
});

test('the navigator height ref is stable across renders and publishes the height', () => {
  assert.equal(stickyHeightRef('--x-test'), stickyHeightRef('--x-test'), 'same function every render');
  const set = [];
  const removed = [];
  globalThis.document = { documentElement: { style: { setProperty: (k, v) => set.push([k, v]), removeProperty: (k) => removed.push(k) } } };
  try {
    const ref = stickyHeightRef('--x-publish');
    ref({ offsetHeight: 143 });
    assert.deepEqual(set.at(-1), ['--x-publish', '143px']);
    ref(null);
    assert.deepEqual(removed, ['--x-publish']);
  } finally {
    delete globalThis.document;
  }
});

test('reference chips scroll with the page; the Hide task control sits on the card', () => {
  const container = read('src/components/student/MobileViewportContainer.jsx');
  const anchorStart = container.indexOf('<div className={`mathmaster-desktop-question-anchor');
  const anchorEnd = container.indexOf('{!workspaceActive && !isPromptCollapsed && taskMeta');
  assert.ok(anchorStart > 0 && anchorEnd > anchorStart);
  assert.doesNotMatch(container.slice(anchorStart, anchorEnd), /taskMeta &&/, 'chips are not inside the sticky anchor');
  const css = read('src/App.css');
  assert.match(css, /\.mathmaster-desktop-question-anchor:not\(\.is-collapsed\) \.mathmaster-desktop-task-toggle-row \{\s*position: absolute;/);
  assert.match(css, /\.mathmaster-desktop-question-anchor:not\(\.is-collapsed\) > \.mathmaster-question-prompt \{\s*padding-right: 104px !important;/);
  assert.match(read('src/index.css'), /\.mathmaster-desktop-question-anchor,\s*\.mathmaster-desktop-task-meta \{\s*display: none;/);
});
