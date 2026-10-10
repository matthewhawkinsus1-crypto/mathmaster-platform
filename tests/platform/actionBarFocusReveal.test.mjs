// S5 — FOCUS NOT OBSCURED ON THE HOSTS THAT ARE NOT THE ASSIGNMENT SCREEN
// (job H; KEYBOARD_SWEEP S5). Only a control the sticky action bar actually
// covers moves the page, by the overlap and a gap; an in-view control never
// does (the reverted global rule moved the page on an in-view Undo, PR #454).
// Browser proof: tests/browser/hostAccessibility.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTION_BAR_FOCUS_GAP, actionBarFocusOverlap } from '../../src/platform/layout/actionBarFocusReveal.js';
import { executableSource } from './helpers/sourceContract.mjs';

const bar = { top: 700, bottom: 768, left: 0, right: 1366 };

test('a control clear of the bar moves nothing', () => {
  assert.equal(actionBarFocusOverlap({ target: { top: 600, bottom: 640, left: 100, right: 200 }, bar }), 0);
  assert.equal(actionBarFocusOverlap({ target: { top: 600, bottom: 700, left: 100, right: 200 }, bar }), 0, 'touching is not covering');
  assert.equal(actionBarFocusOverlap({ target: { top: 710, bottom: 740, left: 100, right: 200 }, bar: { ...bar, left: 300 } }), 0, 'beside the bar, not under it');
  assert.equal(actionBarFocusOverlap({ target: null, bar }), 0);
  assert.equal(actionBarFocusOverlap({ target: { top: 0, bottom: 1, left: 0, right: 1 }, bar: null }), 0);
});

test('a covered control scrolls by exactly the overlap and the gap', () => {
  assert.equal(actionBarFocusOverlap({ target: { top: 690, bottom: 730, left: 100, right: 200 }, bar }), 730 - 700 + ACTION_BAR_FOCUS_GAP);
  assert.equal(actionBarFocusOverlap({ target: { top: 720, bottom: 760, left: 100, right: 200 }, bar }), 60 + ACTION_BAR_FOCUS_GAP);
});

test('a tall control shows its top rather than scrolling it off the top', () => {
  assert.equal(actionBarFocusOverlap({ target: { top: 30, bottom: 900, left: 0, right: 100 }, bar }), 30);
});

test('keyboard focus only, never inside the bar, after the browser scrolled', () => {
  const source = executableSource(readFileSync(new URL('../../src/platform/layout/actionBarFocusReveal.js', import.meta.url), 'utf8'));
  assert.match(source, /let keyboard = keyboardLast;/, 'a Tab into a math field counts (its host never matches :focus-visible)');
  assert.match(source, /const onPointerDown = \(\) => \{ keyboardLast = false; \};/, 'a pointer press never scrolls');
  assert.match(source, /keyboard = keyboard \|\| target\.matches\(':focus-visible'\);/);
  assert.match(source, /if \(!keyboard\) return;/);
  assert.match(source, /if \(target\.closest\(ACTION_BAR_SELECTOR\)\) return;/);
  assert.match(source, /frame = win\.requestAnimationFrame\(/);
  assert.match(source, /if \(delta <= 0\) return;/);
});

test('My Math Path and Section Recovery bind it; the assignment screen keeps its scroll-padding', () => {
  const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
  const path = read('src/components/student/PathSessionPlayer.jsx');
  assert.match(path, /^import useActionBarFocusReveal from '\.\.\/common\/useActionBarFocusReveal\.js';$/m);
  assert.match(path, /useActionBarFocusReveal\(workspaceRef\);/);
  assert.equal((path.match(/<main ref=\{workspaceRef\}/g) || []).length >= 2, true, 'both Path renderers carry the host ref');
  const recovery = read('src/components/student/SectionRecoveryRunner.jsx');
  assert.match(recovery, /^import useActionBarFocusReveal from '\.\.\/common\/useActionBarFocusReveal\.js';$/m);
  assert.match(recovery, /useActionBarFocusReveal\(hostRef\);\s*if \(!assignment\?\.id \|\| !entry\) return null;/, 'before the early return (rules of hooks)');
  assert.equal((recovery.match(/<div ref=\{hostRef\} data-recovery-host=/g) || []).length, 2, 'practice and assessment');
});
