// ONE ACCESSIBLE MODAL DIALOG (WCAG 2.1.2, 2.4.3, 4.1.2): focus moves in,
// stays in, Escape closes the topmost dialog, focus returns to the opener.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialFocusChoice, isTabbableFacts, isTopDialog, looksLikeCloseControl, nextFocusIndex, openDialogCount, pushDialog,
} from '../../src/ui/dialogFocus.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tab wraps at both ends and pulls escaped focus back in', () => {
  assert.equal(nextFocusIndex({ count: 3, activeIndex: 2 }), 0, 'Tab on the last wraps to the first');
  assert.equal(nextFocusIndex({ count: 3, activeIndex: 0, shift: true }), 2, 'Shift+Tab on the first wraps to the last');
  assert.equal(nextFocusIndex({ count: 3, activeIndex: 1 }), null, 'in the middle the browser moves focus');
  assert.equal(nextFocusIndex({ count: 3, activeIndex: -1 }), 0, 'focus outside comes back to the first');
  assert.equal(nextFocusIndex({ count: 3, activeIndex: -1, shift: true }), 2);
  assert.equal(nextFocusIndex({ count: 0, activeIndex: -1 }), null);
});

test('what can take Tab focus', () => {
  assert.equal(isTabbableFacts({ tabIndex: 0 }), true);
  assert.equal(isTabbableFacts({ tabIndex: -1 }), false);
  assert.equal(isTabbableFacts({ disabled: true }), false);
  assert.equal(isTabbableFacts({ hidden: true }), false);
  assert.equal(isTabbableFacts({ inert: true }), false);
  assert.equal(isTabbableFacts({ rendered: false }), false);
});

test('initial focus: explicit, then [data-autofocus], then the first control that is not Close', () => {
  assert.deepEqual(initialFocusChoice({ hasExplicit: true, items: [{}] }), { kind: 'explicit' });
  assert.deepEqual(initialFocusChoice({ autofocusIndex: 2, items: [{}, {}, {}] }), { kind: 'item', index: 2 });
  assert.deepEqual(initialFocusChoice({ items: [{ isClose: true }, { isClose: false }] }), { kind: 'item', index: 1 });
  assert.deepEqual(initialFocusChoice({ items: [{ isClose: true }] }), { kind: 'item', index: 0 });
  assert.deepEqual(initialFocusChoice({ items: [] }), { kind: 'container' });
  assert.equal(looksLikeCloseControl({ label: 'Close dialog' }), true);
  assert.equal(looksLikeCloseControl({ text: '×' }), true);
  assert.equal(looksLikeCloseControl({ text: 'Save' }), false);
});

test('only the topmost dialog answers Escape and traps focus', () => {
  const drawer = {};
  const confirm = {};
  const popDrawer = pushDialog(drawer);
  const popConfirm = pushDialog(confirm);
  assert.equal(isTopDialog(confirm), true);
  assert.equal(isTopDialog(drawer), false);
  popConfirm();
  assert.equal(isTopDialog(drawer), true);
  popDrawer();
  assert.equal(openDialogCount(), 0);
});

// React runs a nested child's effects before its parent's: a parent and child
// opening together register child-first, and the parent must still sit below.
test('a dialog that contains another is below it, whatever order they register in', () => {
  const child = { name: 'child' };
  const parent = { name: 'parent' };
  const popChild = pushDialog(child);
  const popParent = pushDialog(parent, { contains: (other) => other === child });
  assert.equal(isTopDialog(child), true);
  assert.equal(isTopDialog(parent), false);
  popChild();
  assert.equal(isTopDialog(parent), true);
  popParent();
});

test('Dialog wires the rules to the element and restores focus', () => {
  const source = executableSource(read('src/ui/Dialog.jsx'));
  const effect = region(source, 'export function useModalDialog', 'const Dialog = forwardRef', 'useModalDialog');
  assert.match(effect, /const opener = doc\.activeElement/, 'remembers the opener');
  assert.match(effect, /opener\.focus\(/, 'returns focus to it on close');
  const escape = region(effect, "if (event.key === 'Escape') {", "if (event.key !== 'Tab') return;", 'Escape');
  assert.match(escape, /if \(escapeRef\.current && typeof onCloseRef\.current === 'function'\)/, 'Escape honours closeOnEscape');
  assert.match(escape, /if \(event\.target && event\.target\.isConnected === false\) return;/, 'not an Escape a closing layer above already used');
  assert.match(effect, /const onTop = \(\) => isTopDialog\(token\) && !coveredByForeignModal\(dialog\);/, 'topmost of the stack and not under a non-Dialog modal');
  assert.match(effect, /if \(event\.defaultPrevented \|\| !onTop\(\)\) return;/, 'only the topmost dialog answers keys');
  assert.match(region(effect, 'const onFocusIn', 'doc.addEventListener', 'focusin'), /if \(!onTop\(\)\) return;/, 'only the topmost dialog pulls focus');
  assert.match(effect, /nextFocusIndex\(\{ count: items\.length, activeIndex: items\.indexOf\(doc\.activeElement\), shift: event\.shiftKey \}\)/);
  assert.match(effect, /doc\.addEventListener\('focusin', onFocusIn\)/, 'focus that escapes is pulled back');
  assert.match(region(source, 'const Dialog = forwardRef', 'export default', 'Dialog'), /<Tag ref=\{setRef\} role=\{role\} aria-modal="true" \{\.\.\.rest\}>/);
});

// Every aria-modal dialog goes through the primitive. QuestionEngine's is
// job A's file this wave (handoff: docs/handoffs/STUDENT_PUSH_F_ACCESSIBILITY.md).
test('no hand-rolled aria-modal outside the primitive', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const path = await import('node:path');
  const root = new URL('../../src/', import.meta.url).pathname;
  const allowed = new Set(['ui/Dialog.jsx', 'QuestionEngine.jsx']);
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!/\.jsx?$/.test(name)) continue;
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (allowed.has(relative)) continue;
      const code = executableSource(readFileSync(file, 'utf8'));
      // A JSX attribute, not a selector string such as '[aria-modal="true"]'.
      // A component keeping its own element uses useModalDialog for the rules.
      if (/\saria-modal=["{]/.test(code) && !/\buseModalDialog\(/.test(code)) offenders.push(relative);
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], `use <Dialog> or useModalDialog from src/ui/Dialog.jsx: ${offenders.join(', ')}`);
});

// Codex review on PR #454: with [role="dialog"] an allowed focus layer, focus
// could sit in the PARENT of a nested confirm. Only genuine external layers are
// exempt. Browser proof: tests/browser/accessiblePrimitives.mjs.
test('focus in a dialog beneath the top one is an escape, not an allowed layer', () => {
  const source = executableSource(read('src/ui/Dialog.jsx'));
  const layers = source.match(/const ALLOWED_FOCUS_LAYERS = `([^`]*)`;/)?.[1] || '';
  assert.ok(layers.includes('${MATHLIVE_VIRTUAL_KEYBOARD_SELECTOR}') && layers.includes('[data-work-view-floating-tool]') && layers.includes('[data-dialog-allow-focus]'));
  assert.doesNotMatch(layers, /role=/, 'no dialog role is exempt');
});
