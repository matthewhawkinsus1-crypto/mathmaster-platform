import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revealUnlessVisibleWhileZoomed } from '../../src/platform/layout/pinchZoomReveal.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Live QA (desktop, 1536×900): choosing "Subtract" focused the "Subtract what?"
// field, but it sat under the sticky Undo / Reset / Calculator bar, and so did
// its "Pick up" chip — dragging from there selected the toolbar's text instead.
test('a field focused on the student\'s behalf is scrolled clear of the sticky action bar on desktop', () => {
  const source = read('src/MathInput.jsx');
  const effect = source.slice(source.indexOf('if (!focusSignal || !mfRef.current)'), source.indexOf('}, [focusSignal, isMobile'));
  const focusAt = effect.indexOf("focus?.({ preventScroll: true })");
  // The reveal is the field's own scrollIntoView, or the zoom-aware helper that
  // makes that same call unless the person is pinch-zoomed onto a field they
  // can already see (platform/layout/pinchZoomReveal.js).
  const revealAt = effect.search(/if \(!isMobile\) (mathField\?\.scrollIntoView\?\.\(|revealUnlessVisibleWhileZoomed\(mathField, )\{ block: 'nearest'/);
  assert.ok(focusAt > 0 && revealAt > focusAt, 'focus first, then reveal on non-mobile');
  // Unzoomed, the helper IS the reveal: a field under the bar is scrolled clear.
  const calls = [];
  const field = { getBoundingClientRect: () => ({ top: 860, left: 200, width: 300, height: 40 }), scrollIntoView: (options) => calls.push(options) };
  revealUnlessVisibleWhileZoomed(field, { block: 'nearest', inline: 'nearest' }, { visualViewport: { scale: 1, offsetTop: 0, offsetLeft: 0, width: 1536, height: 900 } });
  assert.deepEqual(calls, [{ block: 'nearest', inline: 'nearest' }], 'at 1x the field is revealed exactly as before');

  const css = read('src/App.css');
  const rule = css.match(/\.mathmaster-assignment-screen math-field \{\s*scroll-margin-bottom:\s*(\d+)px;/);
  assert.ok(rule, 'math fields reserve room for the sticky action bar');
  assert.ok(Number(rule[1]) >= 90, 'the reserve is at least the bar\'s height');

  const paddingRule = css.match(/\.mathmaster-assignment-screen \{[\s\S]*?scroll-padding-top:\s*([^;]+);[\s\S]*?scroll-padding-bottom:\s*([^;]+);/);
  assert.ok(paddingRule, 'assignment screen defines scroll-padding for sticky headers and action bar');
});

// Live QA (390×844 portrait): the question container ended 52px below the
// screen — exactly the signed-in identity bar's height — so the action bar's
// wrapped Calculator button was off-screen.
test('the mobile assignment screen leaves room for the identity bar above it', () => {
  const offset = /calc\(100dvh - var\(--mm-student-identity-stack-offset, 0px\)\)/;
  const portrait = read('src/App.css');
  const portraitBlock = portrait.slice(portrait.indexOf('One phone viewport = one question'), portrait.indexOf('.mathmaster-assignment-screen .mathmaster-assignment-header', portrait.indexOf('One phone viewport = one question')));
  assert.equal((portraitBlock.match(new RegExp(offset.source, 'g')) || []).length, 3, 'screen height, min-height and shell height');
  assert.doesNotMatch(portraitBlock, /:\s*100dvh !important/);

  const landscape = read('src/components/student/MathToolMobileLayout.css');
  const screenRule = landscape.match(/\.mathmaster-assignment-screen \{[^}]*\}/g).find((rule) => /overflow: hidden !important/.test(rule));
  assert.match(screenRule, offset);

  const bar = read('src/components/student/StudentIdentityBar.jsx');
  assert.match(bar, /export const STUDENT_IDENTITY_STACK_OFFSET = '--mm-student-identity-stack-offset'/);
  assert.match(bar, /setProperty\(STUDENT_IDENTITY_STACK_OFFSET, `\$\{bar\.offsetHeight\}px`\)/);
});

// Desktop QA review: un-scoped html, body scroll padding applied globally across
// every MathMaster screen because its fallback is ~348px even when no assignment is open.
// Document-level scroll padding must be scoped strictly to the active assignment screen
// (via :has(.mathmaster-assignment-screen)) so teacher dashboard, library, admin,
// login, etc. do not inherit large padding.
test('document-level scroll padding is scoped to active student assignments and not inherited by non-assignment screens', () => {
  const css = read('src/App.css');

  // 1. Must NOT have unconstrained global html or body rules setting scroll-padding
  assert.doesNotMatch(
    css,
    /(?:^|\})\s*(?:html\s*,\s*body|body\s*,\s*html|html|body)\s*\{[^}]*scroll-padding/m,
    'global unconstrained html or body must not declare assignment scroll padding'
  );

  // 2. Document-level scroll padding must be scoped to the active assignment screen
  const scopedDocRule = css.match(/(?:html|body):has\(\.mathmaster-assignment-screen\)[^{]*\{([\s\S]*?)\}/);
  assert.ok(scopedDocRule, 'document scroll-padding is scoped with :has(.mathmaster-assignment-screen)');
  const scopedBlock = scopedDocRule[1];
  // The top padding clears the sticky task card by its MEASURED height plus
  // room for the field's label. A flat 140px guessed an 84px card: with a 184px
  // card, Enter walked to the next blank and left it 30px under the card
  // (PQ-031). Before the first measurement it must still clear the old 140px.
  const clearsCard = /scroll-padding-top:\s*calc\(var\(--mm-sticky-task-top,\s*\d+px\)\s*\+\s*var\(--mm-sticky-task-height,\s*(\d+)px\)\s*\+\s*(\d+)px\);/;
  const scopedTop = scopedBlock.match(clearsCard);
  assert.ok(scopedTop, 'scoped document clears the measured sticky task card');
  assert.ok(Number(scopedTop[1]) + Number(scopedTop[2]) >= 140, 'the unmeasured fallback still clears the old 140px');
  assert.ok(Number(scopedTop[2]) >= 40, 'a revealed field keeps room for its label below the card');
  // The bottom padding clears the sticky action bar: its MEASURED height plus
  // breathing room (student UX pass, R-1 — a fixed 90px was right for one row
  // and wrong the moment the bar wrapped). The fallback before the first
  // measurement must still clear a one-row bar.
  const clearsBar = /scroll-padding-bottom:\s*calc\(var\(--mm-action-bar-height,\s*(\d+)px\)\s*\+\s*(\d+)px\);/;
  const scopedBottom = scopedBlock.match(clearsBar);
  assert.ok(scopedBottom, 'scoped document clears the measured sticky action bar');
  assert.ok(Number(scopedBottom[1]) + Number(scopedBottom[2]) >= 80, 'the unmeasured fallback clears a one-row bar');

  // 3. .mathmaster-assignment-screen container also preserves its own scroll padding
  const screenRule = css.match(/\.mathmaster-assignment-screen\s*\{([\s\S]*?)\}/);
  assert.ok(screenRule, 'assignment screen container defines scroll padding');
  assert.match(screenRule[1], clearsCard);
  assert.match(screenRule[1], clearsBar);

  // 4. …and the variables are the bar's and the task card's own heights,
  //    published by each of them.
  const container = read('src/components/student/MobileViewportContainer.jsx');
  const stickyRefs = read('src/platform/layout/stickyHeightRef.js');
  assert.match(container, /<div ref=\{stickyHeightRef\(ACTION_BAR_HEIGHT_VAR\)\} className="mathmaster-desktop-action-bar">/);
  assert.match(stickyRefs, /export const ACTION_BAR_HEIGHT_VAR = '--mm-action-bar-height';/);
  assert.match(container, /<div ref=\{stickyHeightRef\(STICKY_TASK_HEIGHT_VAR\)\} className=\{`mathmaster-desktop-question-anchor/);
  assert.match(stickyRefs, /export const STICKY_TASK_HEIGHT_VAR = '--mm-sticky-task-height';/);
});

