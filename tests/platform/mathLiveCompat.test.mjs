// A MATHLIVE UPGRADE MUST GO RED HERE, NOT IN A CLASSROOM.
//
// PR #398's P0 fix (keys editing the answer box the student just left) relies
// on MathLive internals. mathLiveCompat.js is the one module that names them;
// this test holds that module, the installed MathLive bundle and the rest of
// the source to each other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MATHLIVE_HIDDEN_CSS_PARTS,
  MATHLIVE_RECOLORED_CSS_PARTS,
  MATHLIVE_REPOSITIONED_CSS_PARTS,
  MATHLIVE_KEYBOARD_SINK_SELECTOR,
  MATHLIVE_RENDER_PART_SELECTOR,
  MATHLIVE_TEXT_TINT_VARIABLES,
  MATHLIVE_VERIFIED_VERSION,
  mathElementHasRendered,
  mathFieldCompatProblems,
  mathFieldHasFocus,
  mathFieldKeyboardSink,
  pressKeyInMathField,
  reportMathLiveCompatProblem,
  resetMathLiveCompatReports,
  settleMathFieldBlur,
} from '../../src/platform/math/mathLiveCompat.js';
import { fieldWithKeyboardPath, installKeyEvents } from './helpers/mathLiveKeyPath.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(repo, file), 'utf8');

const UPGRADE = `MathLive changed. Re-verify src/platform/math/mathLiveCompat.js against the new version, run tests/browser/studentUxPlatform.mjs rapid-switch, then update MATHLIVE_VERIFIED_VERSION.`;

test('the installed MathLive is the version the internals were verified against', () => {
  const installed = JSON.parse(read('node_modules/mathlive/package.json')).version;
  assert.equal(installed, MATHLIVE_VERIFIED_VERSION, UPGRADE);
});

test('the installed MathLive still builds the shadow DOM the focus hand-off depends on', () => {
  const bundle = read('node_modules/mathlive/mathlive.mjs');
  // The keyboard sink: the element that owns DOM focus while a student types.
  assert.match(bundle, /part=keyboard-sink/, `${UPGRADE} (keyboard sink part is gone)`);
  assert.match(bundle, /class=ML__keyboard-sink/, `${UPGRADE} (keyboard sink class is gone)`);
  assert.equal(MATHLIVE_KEYBOARD_SINK_SELECTOR, '[part="keyboard-sink"], .ML__keyboard-sink');
  // hasFocus(): the model state the hand-off reads before DOM focus moves.
  assert.match(read('node_modules/mathlive/types/mathfield-element.d.ts'), /\bhasFocus\(\): boolean;/, `${UPGRADE} (hasFocus() is gone)`);
  // The lazy-typesetting container ensureMathElementRenders inspects.
  assert.match(bundle, /setAttribute\("part", "render"\)/, `${UPGRADE} (render part is gone)`);
  assert.equal(MATHLIVE_RENDER_PART_SELECTOR, '[part="render"]');
  // The controls src/index.css hides so MathMaster's own keypad is the only one,
  // the keyboard sink it repositions onto its field, and the placeholder it
  // recolours (AX17).
  [...MATHLIVE_HIDDEN_CSS_PARTS, ...MATHLIVE_REPOSITIONED_CSS_PARTS, ...MATHLIVE_RECOLORED_CSS_PARTS].forEach((part) => {
    assert.match(bundle, new RegExp(`part=${part}\\b`), `${UPGRADE} (::part(${part}) is gone)`);
  });
  // The tint behind a focused field's text-mode content, which index.css sets
  // to nothing so the placeholder is read against the box: MathLive still
  // reads both names (the light scheme's and the dark scheme's).
  MATHLIVE_TEXT_TINT_VARIABLES.forEach((variable) => {
    assert.ok(bundle.includes(`var(${variable},`), `${UPGRADE} (${variable} is no longer read)`);
  });
});

test('MathLive still focuses a field late, through the sink element\'s own focus, and blurs its model from a host blur', () => {
  // guardStaleMathFieldFocus refuses a stale late focus by wrapping the sink's
  // `focus`; settleMathFieldBlur relies on the host blur listener. If either
  // path changed, the restored-draft focus race (PR #435) could come back.
  const bundle = read('node_modules/mathlive/mathlive.mjs');
  const onFocus = bundle.slice(bundle.indexOf('  onFocus(options) {'), bundle.indexOf('  onBlur(options) {'));
  assert.ok(onFocus.length > 0, `${UPGRADE} (onFocus is gone)`);
  assert.match(onFocus, /setTimeout\(\(\) => \{[\s\S]*this\.keyboardDelegate\.focus\(\);[\s\S]*\}, 60\);/, `${UPGRADE} (the late focus moved)`);
  assert.match(bundle, /focus: \(\) => \{\s*if \(!focusInProgress && typeof keyboardSink\.focus === "function"\) \{\s*focusInProgress = true;\s*keyboardSink\.focus\(\{ preventScroll: true \}\);/, `${UPGRADE} (the delegate no longer calls the sink's focus)`);
  assert.match(bundle, /host\.addEventListener\("blur", this, true\);/, `${UPGRADE} (the host blur listener is gone)`);
  assert.match(bundle, /if \(evt\.type !== "blur"\) return;[\s\S]{0,600}this\._mathfield\) == null \? void 0 : _e\.onBlur\(\{ dispatchEvents: false \}\)/, `${UPGRADE} (a host blur no longer blurs the model)`);
});

test('MathLive still takes a key from a keydown on the sink, and a character it leaves from the sink\'s input', () => {
  // pressKeyInMathField replays a key (a Step Algebra tile's, a stale field's)
  // through this path, so "(" opens MathLive's pair and "pi" is π. If it moved,
  // the replay would type nothing, or a bare character again.
  const bundle = read('node_modules/mathlive/mathlive.mjs');
  const delegate = bundle.slice(bundle.indexOf('function delegateKeyboardEvents('), bundle.indexOf('function keyboardEventToChar('));
  assert.ok(delegate.length > 0, `${UPGRADE} (the keyboard delegate is gone)`);
  assert.match(delegate, /keyboardSink\.addEventListener\(\s*"keydown",\s*\(event\) => \{[\s\S]*?if \(!delegate\.onKeystroke\(event\)\) keydownEvent = null;[\s\S]*?\},\s*\{ capture: true, signal \}/, `${UPGRADE} (a keydown on the sink no longer runs the keystroke handler)`);
  assert.match(delegate, /keyboardSink\.addEventListener\(\s*"input",\s*\(ev\) => \{[\s\S]*?delegate\.onInput\(\(_a3 = ev\.data\) != null \? _a3 : ""\);/, `${UPGRADE} (a character is no longer typed from the sink's input)`);
  // The handler skips a key the page already handled only when it is trusted:
  // a replayed key is stopped above the sink instead (pressKeyInMathField).
  const keystroke = bundle.slice(bundle.indexOf('function onKeystroke(mathfield, evt) {'), bundle.indexOf('function detectScientificNotation('));
  assert.match(keystroke, /if \(evt\.isTrusted && evt\.defaultPrevented\) \{/, `${UPGRADE} (the keystroke handler's handled-key check changed)`);
});

test('a replayed key is pressed on the sink: what it said, once, then the text entry it was left to', () => {
  installKeyEvents();
  const field = fieldWithKeyboardPath();
  const keydowns = [];
  const inputs = [];
  field.sink.addEventListener('keydown', (event) => keydowns.push(event), { capture: true });
  field.sink.addEventListener('input', (event) => inputs.push({ data: event.data, inputType: event.inputType }));
  const original = { key: '5', code: 'Digit5', location: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false };
  assert.equal(pressKeyInMathField(field, original), true);
  assert.equal(keydowns.length, 1);
  assert.deepEqual(
    ['key', 'code', 'location', 'shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'bubbles', 'cancelable', 'composed'].map((name) => keydowns[0][name]),
    ['5', 'Digit5', 0, false, false, false, false, true, true, true],
    'the key as pressed, through every listener a key typed in the field passes',
  );
  assert.deepEqual(inputs, [{ data: '5', inputType: 'insertText' }], 'nothing took it, so its text follows once');
  assert.equal(field.value, '5');

  // Taken as it went down (MathLive's pair, a key binding): no text after it.
  pressKeyInMathField(field, { key: '(', code: 'Digit9', shiftKey: true });
  assert.equal(field.value, '5\\left(\\right)');
  pressKeyInMathField(field, { key: 'Backspace', code: 'Backspace' });
  assert.deepEqual(field.keysSeen, ['5', '(', 'Backspace']);
  assert.equal(inputs.length, 1);
  // A shortcut types nothing.
  pressKeyInMathField(field, { key: 'a', code: 'KeyA', ctrlKey: true });
  assert.equal(inputs.length, 1);

  // Handled by the page above the sink (MathInput's own "\"): MathLive is not
  // given it, as it skips such a key when it is trusted, and no text follows.
  const handled = fieldWithKeyboardPath({ hostCapture: [(event) => { if (event.key === '\\') event.preventDefault(); }] });
  pressKeyInMathField(handled, { key: '\\', code: 'Backslash' });
  assert.deepEqual(handled.keysSeen, [], 'the field\'s keystroke handler never saw it');
  assert.equal(handled.value, '');
  assert.equal(handled.shadowRoot.listeners.length, 0, 'and the stop is taken away again');

  // No sink yet (MathLive has not built the field): nothing is pressed.
  assert.equal(pressKeyInMathField(fieldWithKeyboardPath({ built: false }), original), false);
  assert.equal(pressKeyInMathField(null, original), false);
});

test('a field whose model still thinks it is focused is told otherwise, with no DOM focus change', () => {
  const sent = [];
  const stale = { hasFocus: () => true, dispatchEvent: (event) => { sent.push(event.type); return true; } };
  assert.equal(settleMathFieldBlur(stale), true);
  assert.deepEqual(sent, ['blur']);
  const settled = { hasFocus: () => false, dispatchEvent: () => { throw new Error('must not dispatch'); } };
  assert.equal(settleMathFieldBlur(settled), false);
  assert.equal(settleMathFieldBlur(null), false);
});

test('src/index.css styles exactly the MathLive parts the adapter lists', () => {
  // Comments stripped: index.css explains the sink override in prose.
  const css = executableSource(read('src/index.css'));
  const styled = [...css.matchAll(/math-field::part\(([\w-]+)\)/g)].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(styled)].sort(),
    [...MATHLIVE_HIDDEN_CSS_PARTS, ...MATHLIVE_REPOSITIONED_CSS_PARTS, ...MATHLIVE_RECOLORED_CSS_PARTS].sort(),
    'every MathLive part index.css styles is named in src/platform/math/mathLiveCompat.js, so an upgrade re-verifies it',
  );
  // Likewise the custom properties it sets on the field for MathLive to read.
  const fieldRule = css.match(/(?:^|\n)math-field \{([^}]*)\}/g).find((rule) => rule.includes('--caret-color')) || '';
  MATHLIVE_TEXT_TINT_VARIABLES.forEach((variable) => {
    assert.match(fieldRule, new RegExp(`${variable}:\\s*transparent;`), `index.css sets ${variable} on math-field`);
  });
});

test('no module outside the adapter reaches into MathLive internals', () => {
  const offenders = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return walk(file);
    if (!/\.(jsx?|mjs)$/.test(name)) return undefined;
    const relative = path.relative(repo, file);
    if (relative === path.join('src', 'platform', 'math', 'mathLiveCompat.js')) return undefined;
    const code = executableSource(readFileSync(file, 'utf8'));
    if (/keyboard-sink|ML__|part="render"|\.hasFocus\?*\.\(/.test(code)) offenders.push(relative);
    return undefined;
  });
  walk(path.join(repo, 'src'));
  assert.deepEqual(offenders, [], 'import the helper from src/platform/math/mathLiveCompat.js instead');
});

// Stand-ins for an upgraded <math-field>.
const field = ({ sink = true, hasFocus = () => false, shadow = true } = {}) => ({
  shadowRoot: shadow ? { querySelector: (selector) => (sink && selector === MATHLIVE_KEYBOARD_SINK_SELECTOR ? { part: 'keyboard-sink' } : null) } : null,
  ...(hasFocus ? { hasFocus } : {}),
});

test('the adapter finds the sink and reads focus, and reports what an upgrade removed', () => {
  assert.ok(mathFieldKeyboardSink(field()));
  assert.equal(mathFieldHasFocus(field({ hasFocus: () => true })), true);
  assert.equal(mathFieldHasFocus(field({ hasFocus: () => { throw new Error('detached'); } })), false);
  assert.deepEqual(mathFieldCompatProblems(field()), []);
  assert.deepEqual(mathFieldCompatProblems(field({ shadow: false, hasFocus: null })), [], 'not upgraded yet is loading, not broken');
  assert.deepEqual(mathFieldCompatProblems(field({ sink: false })), [`no keyboard sink matches ${MATHLIVE_KEYBOARD_SINK_SELECTOR}`]);
  assert.deepEqual(mathFieldCompatProblems(field({ hasFocus: null })), ['MathfieldElement.hasFocus() is missing']);
  assert.equal(mathElementHasRendered({ shadowRoot: { querySelector: () => ({ childElementCount: 3 }) } }), true);
  assert.equal(mathElementHasRendered({ shadowRoot: { querySelector: () => ({ childElementCount: 0 }) } }), false);
});

test('a missing internal is reported once, loudly, to the developer console', () => {
  resetMathLiveCompatReports();
  const errors = [];
  const log = { error: (message) => errors.push(message) };
  reportMathLiveCompatProblem(field({ sink: false }), { log });
  reportMathLiveCompatProblem(field({ sink: false }), { log });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\[MathMaster MathLive compat\] no keyboard sink/);
  reportMathLiveCompatProblem(field(), { log });
  assert.equal(errors.length, 1, 'a healthy field says nothing');
});

test('the focus hand-off checks compatibility at the first real press, and never shows a student anything', () => {
  const handoff = read('src/platform/interaction/mathFieldFocusHandoff.js');
  assert.match(handoff, /from '\.\.\/math\/mathLiveCompat\.js';/);
  const handOver = handoff.slice(handoff.indexOf('const handOver = () => {'), handoff.indexOf('const guardStaleKeys'));
  assert.match(handOver, /reportMathLiveCompatProblem\(mathField\);/);
  const adapter = executableSource(read('src/platform/math/mathLiveCompat.js'));
  assert.doesNotMatch(adapter, /document\.|createElement|alert\(|toast|React/, 'diagnostics only');
});
