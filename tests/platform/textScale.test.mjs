// --mm-text-scale: THE TEXT-SIZE SETTING AS A NUMBER (WCAG 1.4.4; job N).
// A fluid font size's viewport term is written
// calc(4vw * var(--mm-text-scale, 1)); src/platform/layout/textScale.js sets
// the variable from a probe calc(100 * var(--mm-px)) wide. At the default
// text size it must be exactly 1, or every fluid size moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEXT_SCALE_VAR, installTextScale, textScaleFromProbeWidth } from '../../src/platform/layout/textScale.js';
import { executableSource } from './helpers/sourceContract.mjs';

test('the probe width becomes the scale; the default size is exactly 1', () => {
  assert.equal(textScaleFromProbeWidth(100), 1);
  assert.equal(textScaleFromProbeWidth(99.9999), 1, 'sub-pixel noise at default is 1');
  assert.equal(textScaleFromProbeWidth(100.4), 1);
  assert.equal(textScaleFromProbeWidth(200), 2);
  assert.equal(textScaleFromProbeWidth(150), 1.5);
  assert.equal(textScaleFromProbeWidth(87.5), 0.875, 'a smaller setting shrinks too');
  for (const broken of [0, -5, Number.NaN, undefined, 'wide']) assert.equal(textScaleFromProbeWidth(broken), 1, `${broken} falls back to 1`);
});

const fakeWindow = () => {
  const properties = new Map();
  let width = 100;
  const observers = [];
  const listeners = new Map();
  const probes = [];
  const root = {
    style: { setProperty: (name, value) => properties.set(name, value), removeProperty: (name) => properties.delete(name) },
    appendChild: (node) => { probes.push(node); node.remove = () => probes.splice(probes.indexOf(node), 1); },
  };
  const win = {
    document: {
      documentElement: root,
      createElement: () => ({ style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, getBoundingClientRect: () => ({ width }) }),
    },
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { observers.splice(observers.indexOf(this), 1); } },
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
  };
  return { win, properties, probes, observers, listeners, setWidth: (next) => { width = next; } };
};

test('installTextScale sets the root variable and follows the setting', () => {
  const fake = fakeWindow();
  const uninstall = installTextScale(fake.win);
  assert.equal(fake.properties.get(TEXT_SCALE_VAR), '1');
  assert.equal(fake.probes.length, 1);
  const probe = fake.probes[0];
  assert.match(probe.style.cssText, /width:calc\(100 \* var\(--mm-px\)\)/, 'the probe is sized in --mm-px');
  assert.match(probe.style.cssText, /position:fixed/);
  assert.match(probe.style.cssText, /visibility:hidden/);
  assert.equal(probe.attributes['aria-hidden'], 'true');
  fake.setWidth(200);
  fake.observers[0].callback();
  assert.equal(fake.properties.get(TEXT_SCALE_VAR), '2', 'the setting changed: the scale follows');
  fake.setWidth(150);
  fake.listeners.get('resize')();
  assert.equal(fake.properties.get(TEXT_SCALE_VAR), '1.5');
  uninstall();
  assert.equal(fake.probes.length, 0);
  assert.equal(fake.observers.length, 0);
  assert.equal(fake.properties.has(TEXT_SCALE_VAR), false);
});

test('no document: nothing happens, nothing throws', () => {
  assert.doesNotThrow(() => installTextScale(null)());
  assert.doesNotThrow(() => installTextScale({})());
});

test('the app installs it, and the root defaults to 1 before it runs', () => {
  const main = executableSource(readFileSync('src/main.jsx', 'utf8'));
  assert.match(main, /import \{ installTextScale \} from '\.\/platform\/layout\/textScale\.js';/);
  assert.match(main, /^installTextScale\(window\);$/m);
  const css = readFileSync('src/index.css', 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf('--mm-text-scale')));
  assert.match(root, /--mm-text-scale:\s*1;/);
});
