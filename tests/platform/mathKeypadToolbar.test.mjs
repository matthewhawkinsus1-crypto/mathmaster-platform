/*
 * STUDENT PASS 3, PR-27 (issue #383 R7, #386 item 3): MATHINPUT'S KEYPAD IS
 * ONE TAB STOP.
 *
 * Every key was a plain button in the Tab order, so getting past one answer
 * box took a keyboard student twenty presses. Each keypad is now a WAI-ARIA
 * toolbar with a roving tabindex (src/platform/interaction/rovingToolbar.js):
 * the arrows, Home and End move between keys. tests/browser/mathKeypadToolbar.mjs
 * proves it in Chromium at 1366x768 and 390x844, keys' names and the field's
 * focus hand-off included.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { rovingActiveIndex, rovingTargetIndex } from '../../src/platform/interaction/rovingToolbar.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the arrows move and wrap, Home and End jump, other keys are left alone', () => {
  assert.equal(rovingTargetIndex('ArrowRight', 0, 4), 1);
  assert.equal(rovingTargetIndex('ArrowDown', 1, 4), 2);
  assert.equal(rovingTargetIndex('ArrowRight', 3, 4), 0, 'wraps forward');
  assert.equal(rovingTargetIndex('ArrowLeft', 0, 4), 3, 'wraps back');
  assert.equal(rovingTargetIndex('ArrowUp', 2, 4), 1);
  assert.equal(rovingTargetIndex('Home', 2, 4), 0);
  assert.equal(rovingTargetIndex('End', 0, 4), 3);
  for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a']) assert.equal(rovingTargetIndex(key, 1, 4), null, `${key} is the key's own`);
  assert.equal(rovingTargetIndex('ArrowRight', 0, 0), null, 'an empty row has nowhere to go');
});

test('the one key in the Tab order stays inside the row as it changes length', () => {
  assert.equal(rovingActiveIndex(5, 3), 2, 'a shorter keypad (a new tool profile) keeps a key in the Tab order');
  assert.equal(rovingActiveIndex(-1, 3), 0);
  assert.equal(rovingActiveIndex(1, 3), 1);
  assert.equal(rovingActiveIndex(0, 0), -1);
});

test('both keypads are toolbars whose keys take the roving tabindex', () => {
  const source = executableSource(read('src/MathInput.jsx'));
  assert.match(source, /^import \{ useRovingToolbar \} from '\.\/platform\/interaction\/rovingToolbar\.js';$/m);
  assert.match(source, /const requiredKeysToolbar = useRovingToolbar\(requiredTools\.length\);/);
  assert.match(source, /const toolsToolbar = useRovingToolbar\(tools\.length\);/);
  const required = region(source, 'className="mathmaster-required-answer-keys"', '</div>\n      )}', 'the needed keys');
  // The arrows reach the roving handler: directly, or after Escape has had its
  // turn (TL15: Escape on a key closes the keypad; accessibleDialog.test.mjs).
  const reachesRoving = (name) => new RegExp(`onKeyDown=\\{(?:${name}\\.onKeyDown|\\(event\\) => \\{ if \\(!escapeFromKeys\\(event\\)\\) ${name}\\.onKeyDown\\(event\\); \\})\\}`);
  assert.match(required, /role="toolbar"\s*aria-label="Keys needed for this answer"\s*onKeyDown=/);
  assert.match(required, reachesRoving('requiredKeysToolbar'));
  assert.match(required, /\{requiredTools\.map\(\(tool, index\) => \(\s*<button[\s\S]*?\{\.\.\.requiredKeysToolbar\.itemProps\(index\)\}\s*aria-label=\{tool\.ariaLabel\}/, 'each key keeps its spoken name');
  const tools = region(source, 'id={toolsId}', '</div>\n      )}', 'the math tools');
  assert.match(tools, /role="toolbar"\s*aria-label="Math tools"\s*onKeyDown=/);
  assert.match(tools, reachesRoving('toolsToolbar'));
  assert.match(tools, /\{tools\.map\(\(tool, index\) => \(\s*<button[\s\S]*?\{\.\.\.toolsToolbar\.itemProps\(index\)\}\s*aria-label=\{tool\.ariaLabel\}/);
  // A key still types through insert(), which gives the field its focus back.
  assert.match(tools, /onClick=\{\(\) => insert\(tool\.command, tool\.action\)\}/);
  assert.match(region(source, 'const insert = useCallback(', '}, [', 'insert'), /mathField\.focus\(\{ preventScroll: true \}\);/);
});

// TL23: the keypad toggle shows a keypad, not "√x" (read as "insert a square
// root"); the key that leaves a group says "move out →" (not "↷ out": ↷ is the
// redo arrow) and is two keys wide so the words fit. Browser proof, both
// sizes: tests/browser/mathKeypadToolbar.mjs.
test('TL23: the keypad toggle and the way-out key say what they do', () => {
  const source = executableSource(read('src/MathInput.jsx'));
  const toggle = region(source, 'className="mathmaster-math-tools-toggle"', '</button>', 'the keypad toggle');
  assert.match(toggle, /<KeypadIcon \/>/, 'a picture of a keypad');
  assert.doesNotMatch(toggle, /√/, 'no root symbol');
  assert.match(toggle, /aria-label=\{toolsVisible \? 'Hide math tools' : 'Show math tools'\}/, 'named in words');
  assert.match(region(source, 'const KeypadIcon = () => (', '\n);', 'the icon'), /<svg [^>]*aria-hidden="true"/, 'the picture is decorative');
  const exit = region(source, 'const EXIT_GROUP_KEY = {', '};', 'the way-out key');
  assert.match(exit, /label: 'move out →',/);
  assert.doesNotMatch(exit, /↷/);
  assert.match(exit, /ariaLabel: 'Move the cursor out of the fraction, exponent or bracket',/);
  assert.match(region(source, '...(tool === EXIT_GROUP_KEY ? {', '} : {}),', 'the way-out key\'s place'), /gridColumn: 'span 2',/);
});

test('only the key last used is in the Tab order', () => {
  const hook = executableSource(read('src/platform/interaction/rovingToolbar.js'));
  const props = region(hook, 'const itemProps = useCallback((index) => ({', '}), [active]);', 'item props');
  assert.match(props, /tabIndex: index === active \? 0 : -1,/);
  assert.match(props, /onFocus: \(\) => setStored\(index\),/);
  const keys = region(hook, 'const onKeyDown = useCallback((event) => {', '}, [count]);', 'the key handler');
  assert.match(keys, /const next = rovingTargetIndex\(event\.key, from, count\);\s*if \(next == null\) return;\s*event\.preventDefault\(\);/);
  assert.match(keys, /items\.current\[next\]\?\.focus\?\.\(\);/);
});
