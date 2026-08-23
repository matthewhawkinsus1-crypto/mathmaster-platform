// FIVE SCREENS, NOT FIVE SIZES OF ONE SCREEN.
//
// "Chromebook, laptop, desktop, interactive display, tablet" is five different
// reading distances and two different input devices. A stylesheet organised by
// breakpoint alone cannot express that — a 1920px desktop monitor and a 1920px
// classroom panel are the same width and need opposite things.
//
// These tests read the stylesheet, because the rules ARE the deliverable and
// the failure mode is a rule quietly disappearing in a later edit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/App.css', 'utf8');

const blockFor = (query) => {
  const start = css.indexOf(query);
  if (start === -1) return null;
  // Walk braces from the query's opening brace to its matching close.
  let depth = 0;
  let index = css.indexOf('{', start);
  const from = index;
  for (; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(from, index + 1);
    }
  }
  return null;
};

test('touch sizing is keyed on the pointer, not on the width', () => {
  // A tablet and a laptop can be the same width. Only the pointer says whether
  // a 24px button is comfortable or a game of chance.
  const block = blockFor('@media (pointer: coarse) and (min-width: 861px)');
  assert.ok(block, 'no coarse-pointer block');
  assert.match(block, /min-height:\s*44px/);
});

test('checkboxes are enlarged, because a mis-tap there changes a student’s work', () => {
  const block = blockFor('@media (pointer: coarse) and (min-width: 861px)');
  assert.match(block, /input\[type="checkbox"\]/);
  assert.match(block, /width:\s*22px/);
});

test('a large screen only gets projector type when it is also touched', () => {
  // The distinction the phase turns on. A 1920px desktop monitor with a mouse
  // must not get type sized for a classroom panel at two metres.
  const block = blockFor('@media (min-width: 1600px) and (pointer: coarse)');
  assert.ok(block, 'no interactive-display block');
  assert.match(block, /font-size/);
  // And the width-only large block must NOT scale type.
  const wideOnly = blockFor('@media (min-width: 1800px)');
  assert.ok(wideOnly);
  assert.ok(!/font-size/.test(wideOnly), 'a wide desktop must not be given display type');
});

test('the Chromebook rule reclaims height, not width', () => {
  // 1366x768 is not a narrow screen. It is a short one, and the vertical
  // furniture costs about a fifth of the page before any content appears.
  const block = blockFor('@media (max-height: 820px) and (min-width: 861px)');
  assert.ok(block, 'no short-viewport block');
  assert.match(block, /padding-top/);
  assert.ok(!/width:/.test(block.replace(/max-width|min-width/g, '')), 'height is what is being reclaimed');
});

test('the shell stops stretching on very wide monitors', () => {
  // Past about 200 characters the eye loses its place returning to the next
  // line, and a 2560px monitor gets there easily.
  const block = blockFor('@media (min-width: 1800px)');
  assert.match(block, /max-width/);
});

test('printing drops the navigation rail and the header', () => {
  // Rosters and gradebooks do get printed, and a nav rail is noise on paper.
  const block = blockFor('@media print');
  assert.ok(block);
  assert.match(block, /mm-dashboard-nav/);
  assert.match(block, /display:\s*none/);
});

test('the narrow-viewport rules that already existed are untouched', () => {
  // The phone layout was working. This phase adds screens; it does not get to
  // regress one.
  assert.ok(blockFor('@media (max-width: 860px)'), 'the narrow block is gone');
  assert.match(blockFor('@media (max-width: 860px)'), /flex-direction:\s*column/);
});

test('every new rule is scoped to the dashboard shell', () => {
  // Student screens and the algebra solver have their own layouts and must not
  // inherit teacher-dashboard sizing.
  ['@media (pointer: coarse) and (min-width: 861px)', '@media (min-width: 1600px) and (pointer: coarse)']
    .forEach((query) => {
      const block = blockFor(query);
      const selectors = [...block.matchAll(/^\s{2}([^@{}]+)\{/gm)].map(([, selector]) => selector.trim());
      selectors.forEach((selector) => {
        assert.match(selector, /mm-dashboard/, `${selector} escapes the dashboard`);
      });
    });
});
