/*
 * CONTENT ON HOVER OR FOCUS CAN BE PUT AWAY WITH ESCAPE (WCAG 1.4.13).
 *
 * useEscapeToDismiss (src/ui) puts away what a hovered or focused part of the
 * two progress wheels shows, without taking the key. The browser half is
 * tests/browser/wheelEscape.mjs (both wheels, hover and focus); this pins the
 * listener and that each wheel puts away the state its detail is drawn from.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeDismissListener } from '../../src/ui/useEscapeToDismiss.js';

const keyEvent = (key) => {
  const event = { key, prevented: false, stopped: false };
  event.preventDefault = () => { event.prevented = true; };
  event.stopPropagation = () => { event.stopped = true; };
  return event;
};

test('Escape, and only Escape, puts the content away, and the key is left alone', () => {
  let dismissed = 0;
  const listener = escapeDismissListener(() => { dismissed += 1; });
  for (const key of ['Enter', ' ', 'Tab', 'ArrowLeft', 'Esc']) listener(keyEvent(key));
  assert.equal(dismissed, 0);
  const escape = keyEvent('Escape');
  listener(escape);
  assert.equal(dismissed, 1);
  assert.equal(escape.prevented, false, 'a dialog around the content still closes on this Escape');
  assert.equal(escape.stopped, false);
});

const wheel = (file) => readFileSync(new URL(`../../src/components/student/${file}`, import.meta.url), 'utf8');

test('each wheel puts away the state its hover and focus detail is drawn from', () => {
  for (const [file, state, setter] of [
    ['CCMRReadinessWheel.jsx', 'focused', 'setFocused'],
    ['MyMathPathWheel.jsx', 'focusedTeks', 'setFocusedTeks'],
  ]) {
    const source = wheel(file);
    // The state a hovered or focused slice sets is the one Escape clears.
    assert.match(source, new RegExp(`onMouseEnter=\\{\\(\\) => ${setter}\\(`), `${file}: hover sets ${state}`);
    assert.match(source, new RegExp(`onFocus=\\{\\(\\) => ${setter}\\(`), `${file}: focus sets ${state}`);
    const clear = source.match(new RegExp(`const (\\w+) = useCallback\\(\\(\\) => ${setter}\\(null\\), \\[\\]\\);`));
    assert.ok(clear, `${file}: a stable callback clears ${state}`);
    assert.match(source, new RegExp(`useEscapeToDismiss\\(${state} != null, ${clear[1]}\\);`), `${file}: Escape clears it while it is set`);
  }
});
