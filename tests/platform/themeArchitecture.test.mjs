import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveMathMasterTheme } from '../../src/theme/mathMasterTheme.js';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('system preference and explicit theme overrides resolve deterministically', () => {
  assert.equal(resolveMathMasterTheme('system', { matches: true }), 'dark');
  assert.equal(resolveMathMasterTheme('system', { matches: false }), 'light');
  assert.equal(resolveMathMasterTheme('light', { matches: true }), 'light');
  assert.equal(resolveMathMasterTheme('dark', { matches: false }), 'dark');
});

test('form controls and MathLive consume the matched semantic input pair', () => {
  const controls = css.slice(css.indexOf('/* Native controls'), css.indexOf('/* Question hierarchy'));
  assert.match(controls, /color:\s*var\(--mm-input-text\)/);
  assert.match(controls, /background(?:-color)?:\s*var\(--mm-input-bg\)/);
  assert.match(controls, /math-field[\s\S]*--caret-color:\s*var\(--mm-focus\)/);
  assert.doesNotMatch(controls, /color-scheme:\s*light/);
});

test('both palettes define readable graph, status, and control contracts', () => {
  for (const token of ['input-bg', 'input-text', 'success-bg', 'success-text', 'error-bg', 'error-text', 'graph-bg', 'graph-axis', 'graph-label']) {
    assert.ok(css.match(new RegExp(`--mm-${token}:`, 'g'))?.length >= 2, `missing two-theme token --mm-${token}`);
  }
});

test('dark mode styles only opt-in neutral buttons and preserves semantic states', () => {
  assert.match(css, /:is\(\.mm-button-neutral, \[data-mm-button-variant='neutral'\]\)/);
  assert.doesNotMatch(css, /#root button:not\(/, 'a global button override would erase selected, primary, warning, and destructive states');
});
