// LARGE TEXT ON A PHONE (WCAG 1.4.4, job H). Measured by
// tests/browser/studentShellLargeText.mjs at 200% text, 390×844: the phone
// question frame clipped the action bar's last row (Calculator, Hint), and
// Live Challenge's field question — which shares the class for its inner
// styles — stood a screen tall and cut off Lock In Answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/components/student/MathToolMobileLayout.css', import.meta.url), 'utf8');
const block = (selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};

test('only the phone interaction root is the screen-tall clipped frame', () => {
  const base = block('.mathmaster-question-container');
  assert.doesNotMatch(base, /height|overflow/, 'the shared class carries no frame');
  const frame = block('.mathmaster-question-container.mathmaster-mobile-interaction-root');
  assert.match(frame, /height: var\(--mm-visual-viewport-height, 100dvh\);/);
  assert.match(frame, /overflow: hidden;/);
});

test('the portrait action bar scrolls rather than being cut when large text wraps it', () => {
  const start = css.indexOf('.mathmaster-question-container.mode-portrait .portrait-action-bar {');
  const bar = css.slice(start, css.indexOf('}', start));
  assert.match(bar, /max-height: 40dvh;/);
  assert.match(bar, /overflow-y: auto;/);
  assert.match(bar, /flex: 0 0 auto;/);
});
