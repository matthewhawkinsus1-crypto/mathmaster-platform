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

test('Dialog wires the rules to the element and restores focus', () => {
  const source = executableSource(read('src/ui/Dialog.jsx'));
  const effect = region(source, 'export function useModalDialog', 'const Dialog = forwardRef', 'useModalDialog');
  assert.match(effect, /const opener = doc\.activeElement/, 'remembers the opener');
  assert.match(effect, /opener\.focus\(/, 'returns focus to it on close');
  assert.match(effect, /if \(event\.key === 'Escape'\) \{\s*if \(escapeRef\.current && typeof onCloseRef\.current === 'function'\)/, 'Escape honours closeOnEscape');
  assert.match(effect, /if \(event\.defaultPrevented \|\| !isTopDialog\(token\)\) return;/, 'only the topmost dialog');
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
