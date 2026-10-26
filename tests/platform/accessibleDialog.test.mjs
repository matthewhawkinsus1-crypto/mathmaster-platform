// ONE ACCESSIBLE MODAL DIALOG (WCAG 2.1.2, 2.4.3, 4.1.2): focus moves in,
// stays in, Escape closes the topmost dialog, focus returns to the opener.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TABBABLE_SELECTOR, initialFocusChoice, isTabbableFacts, isTopDialog, looksLikeCloseControl, nextFocusIndex, openDialogCount, pushDialog,
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

// TT27. The first <summary> of a <details> takes Tab, but it was not in the list
// of what a dialog's trap counts as tabbable. Focus on it was "on none of the
// items", and nextFocusIndex sends that focus to the FIRST item: Tab on a
// disclosure threw the teacher back to the top, and nothing after the first
// disclosure in the Assignment Hub or the Pre-Flight review could be reached by
// Tab. Browser proof: tests/browser/accessiblePrimitives.mjs (a disclosure in
// the middle of a dialog) and the teacher scenes of the accessibility ratchet.
test('a disclosure\'s summary is a Tab stop in a dialog, and what a closed one holds is not', () => {
  const parts = TABBABLE_SELECTOR.split(',').map((part) => part.trim());
  assert.ok(parts.includes('details > summary:first-of-type'), 'the first summary of a <details> is in the list of what Tab may land on');
  // Why it matters: focus on an element the list does not hold goes to the first item.
  assert.equal(nextFocusIndex({ count: 4, activeIndex: -1 }), 0, 'focus on a stop the dialog does not know about is sent back to the start');
  assert.equal(nextFocusIndex({ count: 4, activeIndex: 1 }), null, 'a summary the dialog knows lets the browser move on');
  // What a closed <details> holds keeps its boxes, so "has a box" is not "can take focus".
  const rendered = region(executableSource(read('src/ui/Dialog.jsx')), 'const isRendered = (element) => {', '\n};', 'isRendered');
  assert.match(rendered, /typeof element\.checkVisibility === 'function' && !element\.checkVisibility\(\)\) return element === element\.ownerDocument\?\.activeElement;/);
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
  assert.match(effect, /if \(handledInside \|\| !onTop\(\)\) return;/, 'only the topmost dialog answers keys');
  assert.match(region(effect, 'const onFocusIn', 'doc.addEventListener', 'focusin'), /if \(!onTop\(\)\) return;/, 'only the topmost dialog pulls focus');
  assert.match(effect, /nextFocusIndex\(\{ count: items\.length, activeIndex: items\.indexOf\(doc\.activeElement\), shift: event\.shiftKey \}\)/);
  assert.match(effect, /doc\.addEventListener\('focusin', onFocusIn\)/, 'focus that escapes is pulled back');
  assert.match(region(source, 'const Dialog = forwardRef', 'export default', 'Dialog'), /<Tag ref=\{setRef\} role=\{role\} aria-modal="true" \{\.\.\.rest\}>/);
});

// Every aria-modal dialog goes through the primitive (QuestionEngine's two
// joined it in wave 2, job H — no allow-list beyond the primitive itself).
test('no hand-rolled aria-modal outside the primitive', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const path = await import('node:path');
  const root = new URL('../../src/', import.meta.url).pathname;
  const allowed = new Set(['ui/Dialog.jsx']);
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

// PR #454 functional review (S2/B2): Escape threw away a teacher's typed draft
// in dialogs that never closed on Escape before (the question editor, a grade
// override in the Response Inspector, …). Those keep their draft.
// Each <Dialog …> opening tag, braces balanced (an onClose arrow has a '>').
const dialogTags = (code) => {
  const tags = [];
  for (let start = code.indexOf('<Dialog'); start >= 0; start = code.indexOf('<Dialog', start + 1)) {
    let depth = 0;
    let end = start;
    for (; end < code.length; end += 1) {
      if (code[end] === '{') depth += 1;
      else if (code[end] === '}') depth -= 1;
      else if (code[end] === '>' && depth === 0) break;
    }
    tags.push(code.slice(start, end + 1));
  }
  return tags;
};

test('a dialog holding a typed draft does not close on Escape', () => {
  const DRAFTS = [
    ['src/AssignmentQuestionEditorBase.jsx', 'aria-label="Edit assignment questions"'],
    ['src/AssignmentLibraryBase.jsx', 'aria-labelledby={folderDialogTitleId}'],
    ['src/components/teacher/ClassPointsAwardDialog.jsx', 'aria-labelledby="class-points-award-title"'],
    ['src/components/teacher/LessonPreflightModal.jsx', null],
    ['src/components/teacher/StudentPersistenceRecoveryPanel.jsx', 'aria-labelledby="resolve-hold-title"'],
    ['src/components/teacher/StudentResponseInspector.jsx', 'aria-label="Student Response Inspector"'],
  ];
  for (const [file, marker] of DRAFTS) {
    const code = executableSource(read(file));
    const tags = dialogTags(code).filter((tag) => !marker || tag.includes(marker));
    assert.ok(tags.length, `${file}: the draft dialog is a Dialog`);
    for (const tag of tags) assert.match(tag, /closeOnEscape=\{false\}/, `${file}: Escape must not discard the draft`);
  }
});

// TL15 (owner decision; reverses PR #454 review S1 for math fields only):
// Escape in a math field, or on one of its keys, closes the keypad and moves
// focus out of the field — onto its √x button, else the field blurs — and is
// marked handled, so Work View stays open. The next Escape, focus no longer
// in a field, closes Work View as Escape does everywhere else. Browser proof,
// both orders, keypad open and closed: accessiblePrimitives.mjs (the Dialog
// with a real MathInput) and unchangedConfirmWorkView.mjs (real Work View).
test('TL15: a math field takes its own Escape; the dialog closes on the next one', () => {
  const dialog = executableSource(read('src/ui/Dialog.jsx'));
  const handler = region(dialog, 'const onKeyDown = (event) => {', "if (event.key === 'Escape') {", 'the dialog key handler');
  assert.match(handler, /const handledInside = event\.defaultPrevented;\s*if \(handledInside \|\| !onTop\(\)\) return;/, 'an Escape a control inside used stays its own');
  assert.doesNotMatch(handler, /math-field/, 'no exception that lets a math field\'s Escape close the dialog');

  const input = executableSource(read('src/MathInput.jsx'));
  const leave = region(input, 'const leaveOnEscape = useCallback(', 'const escapeFromKeys', 'leaveOnEscape');
  assert.match(leave, /setShowTools\(false\);/, 'the keypad closes');
  assert.match(leave, /const toggle = toggleRef\.current;\s*if \(toggle\?\.isConnected\) \{\s*toggle\.focus\(\{ preventScroll: true \}\);/, 'focus moves onto the field\'s own √x button');
  assert.match(leave, /mathField\?\.blur\?\.\(\);/, 'without the button the field blurs');
  assert.match(input, /<button\s+ref=\{toggleRef\}[^>]*className="mathmaster-math-tools-toggle"/, 'the ref is the √x button');

  const fieldEscape = region(input, "if (event.key === 'Escape') {", "if (event.key === '\\\\') {", 'the field\'s Escape');
  assert.match(fieldEscape, /event\.preventDefault\(\);\s*if \(!event\.isComposing\) leaveOnEscape\(\);\s*return;/, 'marked handled, and the field is left');
  assert.doesNotMatch(fieldEscape, /stopPropagation/, 'not stopped: the plane\'s hover readout still hears Escape');

  const keys = region(input, 'const escapeFromKeys = (event) => {', '};', 'a key\'s Escape');
  assert.match(keys, /event\.preventDefault\(\);\s*leaveOnEscape\(\{ fromKeys: true \}\);/);
  for (const name of ['Keys needed for this answer', 'Math tools']) {
    const toolbar = region(input, `aria-label="${name}"`, 'style={{', `the ${name} toolbar`);
    assert.match(toolbar, /onKeyDown=\{\(event\) => \{ if \(!escapeFromKeys\(event\)\) \w+\.onKeyDown\(event\); \}\}/, `${name}: Escape closes the keypad before the arrows are read`);
  }
});

// PR #454 functional review (S3): the rewritten Work View / LMR / badge /
// Scratchpad assertions accepted `onClose=` anywhere and stayed green with
// Escape switched off. Each of these closes on Escape — no closeOnEscape
// override at all, or only a busy guard — and the Scratchpad's Escape goes
// through requestClose (it asks before unsaved strokes are lost).
test('Work View, the LMR graph, the badge and the Scratchpad still close on Escape', () => {
  const hook = (file, ref) => executableSource(read(file)).match(new RegExp(`useModalDialog\\(${ref}, \\{([^}]*)\\}\\)`))?.[1] || '';
  for (const [file, ref] of [['src/components/common/EnlargeableFigure.jsx', 'hostRef'], ['src/tools/representationBridge/process/ProcessWorkspace.jsx', 'sectionRef']]) {
    const options = hook(file, ref);
    assert.match(options, /\bonClose: /, `${file}: Escape has something to close`);
    assert.doesNotMatch(options, /closeOnEscape/, `${file}: Escape is not switched off`);
  }
  const tagOf = (file, marker) => dialogTags(executableSource(read(file))).find((tag) => tag.includes(marker)) || '';
  for (const [file, marker] of [['src/components/common/StandardBadge.jsx', 'aria-labelledby={titleId}'], ['src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', 'data-lmr-dialog={graph.key}']]) {
    const tag = tagOf(file, marker);
    assert.match(tag, /\bonClose=\{onClose\}/, `${file}: Escape closes it`);
    assert.doesNotMatch(tag, /closeOnEscape/, `${file}: Escape is not switched off`);
  }
  const pad = tagOf('src/ScratchpadOverlay.jsx', 'aria-label="Full-screen scratchpad"');
  assert.match(pad, /\bonClose=\{requestClose\}/, 'the Scratchpad asks before Escape discards strokes');
  assert.match(pad, /closeOnEscape=\{!saving\}/, 'and only a save in flight holds Escape');
});

// Wave 2 (job H): the "values have not changed" confirm had no accessible
// name, no Escape and no initial focus; on the primitive it is named by its
// heading, Escape = Go Back, and it opens on Go Back (submitting again spends
// an attempt). The productive-struggle scaffold covers only the work area and
// is a focused region, not a page-wide modal (see below).
test('QuestionEngine: the unchanged-values confirm is a Dialog; the scaffold a focused region', () => {
  const code = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(code, /^import Dialog from '\.\/ui\/Dialog\.jsx';$/m, 'imported next to its use');
  const confirm = dialogTags(code).find((tag) => tag.includes('aria-labelledby={unchangedConfirmTitleId}')) || '';
  assert.ok(confirm, 'the confirm is a Dialog named by its heading');
  assert.match(code, /<h2 id=\{unchangedConfirmTitleId\}[^>]*>Your answers have not changed<\/h2>/);
  assert.match(confirm, /onClose=\{\(\) => setUnchangedConfirmOpen\(false\)\}/, 'Escape = Go Back');
  assert.doesNotMatch(confirm, /closeOnEscape/);
  assert.match(confirm, /initialFocusRef=\{unchangedGoBackRef\}/);
  assert.match(code, /<button ref=\{unchangedGoBackRef\} type="button" onClick=\{\(\) => setUnchangedConfirmOpen\(false\)\}[^>]*>Go Back<\/button>/, 'initial focus is the safe choice');
  // The scaffold (review of #463): not a page-wide modal — it covers only the
  // work area, already disabled and inert beneath it — so the support tray,
  // calculator and navigation stay reachable by Tab. It is a named region that
  // takes focus when it appears, and closes only by answering.
  assert.equal(dialogTags(code).some((tag) => tag.includes('data-scaffold')), false, 'not a Dialog: it must not trap the page');
  // A named region, named in the student's words — the heading it shows
  // ("Let's back up"), not the program's "Productive struggle scaffold".
  assert.match(code, /<section ref=\{scaffoldRef\} role="region" aria-label="Let's back up" data-scaffold=""/);
  assert.match(code, /if \(!scaffoldRequired\) return undefined;\s*const frame = window\.requestAnimationFrame\(\(\) => scaffoldRef\.current\?\.querySelector\('button'\)\?\.focus\(/, 'focus moves to its first choice');
  // The work area's gates lift only for a module that failed (RUN-13). Since
  // AX01 a FINISHED question's work is read-only rather than inert, and the
  // inert gate is the waiting one: it includes the scaffold, so the work
  // beneath it stays disabled and inert.
  assert.match(code, /inert=\{workAreaInert \? true : undefined\}/, 'the work beneath it is inert while it shows');
  assert.match(code, /const workAreaInert = !moduleFailed && Boolean\([^)]*\bscaffoldRequired\b[^)]*\);/, 'the scaffold is part of that gate');
  assert.match(code, /const workAreaClosed = !moduleFailed && Boolean\([^)]*\bscaffoldRequired\b[^)]*\);/, 'and of the disabled one');
  // Review of #463: it opens from Work View's own Submit too, so it is drawn
  // above Work View (2147483000) and its calculator (2147483400).
  const z = Number(code.match(/const UNCHANGED_CONFIRM_Z_INDEX = (\d+);/)?.[1]);
  assert.ok(z > 2147483400, `the confirm sits above Work View and its calculator (${z})`);
  assert.match(code, /data-unchanged-confirm="" style=\{\{ position: 'fixed', inset: 0, zIndex: UNCHANGED_CONFIRM_Z_INDEX,/);
});
