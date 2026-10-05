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
  MATHLIVE_KEYBOARD_SINK_SELECTOR,
  MATHLIVE_RENDER_PART_SELECTOR,
  MATHLIVE_VERIFIED_VERSION,
  mathElementHasRendered,
  mathFieldCompatProblems,
  mathFieldHasFocus,
  mathFieldKeyboardSink,
  reportMathLiveCompatProblem,
  resetMathLiveCompatReports,
  settleMathFieldBlur,
} from '../../src/platform/math/mathLiveCompat.js';
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
  // The controls src/index.css hides so MathMaster's own keypad is the only one.
  MATHLIVE_HIDDEN_CSS_PARTS.forEach((part) => {
    assert.match(bundle, new RegExp(`part=${part}\\b`), `${UPGRADE} (::part(${part}) is gone)`);
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

test('a field whose model still thinks it is focused is told otherwise, with no DOM focus change', () => {
  const sent = [];
  const stale = { hasFocus: () => true, dispatchEvent: (event) => { sent.push(event.type); return true; } };
  assert.equal(settleMathFieldBlur(stale), true);
  assert.deepEqual(sent, ['blur']);
  const settled = { hasFocus: () => false, dispatchEvent: () => { throw new Error('must not dispatch'); } };
  assert.equal(settleMathFieldBlur(settled), false);
  assert.equal(settleMathFieldBlur(null), false);
});

test('src/index.css hides exactly the MathLive parts the adapter lists', () => {
  const css = read('src/index.css');
  const hidden = [...css.matchAll(/math-field::part\(([\w-]+)\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(hidden)].sort(), [...MATHLIVE_HIDDEN_CSS_PARTS].sort());
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
