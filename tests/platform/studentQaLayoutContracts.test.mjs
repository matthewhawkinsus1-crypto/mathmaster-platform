import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Live QA (desktop, 1536×900): choosing "Subtract" focused the "Subtract what?"
// field, but it sat under the sticky Undo / Reset / Calculator bar, and so did
// its "Pick up" chip — dragging from there selected the toolbar's text instead.
test('a field focused on the student\'s behalf is scrolled clear of the sticky action bar on desktop', () => {
  const source = read('src/MathInput.jsx');
  const effect = source.slice(source.indexOf('if (!focusSignal || !mfRef.current)'), source.indexOf('}, [focusSignal, isMobile]);'));
  const focusAt = effect.indexOf("focus?.({ preventScroll: true })");
  const revealAt = effect.search(/if \(!isMobile\) mathField\?\.scrollIntoView\?\.\(\{ block: 'nearest'/);
  assert.ok(focusAt > 0 && revealAt > focusAt, 'focus first, then reveal on non-mobile');

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
  assert.match(scopedBlock, /scroll-padding-top:\s*calc\(var\(--mm-sticky-task-top,\s*208px\)\s*\+\s*140px\);/, 'scoped document clears sticky task header');
  assert.match(scopedBlock, /scroll-padding-bottom:\s*90px;/, 'scoped document clears sticky action bar');

  // 3. .mathmaster-assignment-screen container also preserves its own scroll padding
  const screenRule = css.match(/\.mathmaster-assignment-screen\s*\{([\s\S]*?)\}/);
  assert.ok(screenRule, 'assignment screen container defines scroll padding');
  assert.match(screenRule[1], /scroll-padding-top:\s*calc\(var\(--mm-sticky-task-top,\s*208px\)\s*\+\s*140px\);/);
  assert.match(screenRule[1], /scroll-padding-bottom:\s*90px;/);
});

