/*
 * PRINTING TYPESETS EVERY FORMULA (student push J, copy pass).
 *
 * <math-span>/<math-div> render lazily, when first on screen. A worked
 * solution printed before the student scrolled through it printed each
 * formula never scrolled into view as a blank — the "Representation values and
 * inline $x$ render blank" report (on screen they render once scrolled; a
 * full-page headless screenshot shows the same blanks). Before printing,
 * every unrendered element is rendered. Checked in Chromium at 1366×768 and
 * 390×844: 0 of 13 formulas below the fold rendered before `beforeprint`, 13
 * of 13 after.
 *
 * Mutation-checked: dropping element.render() in renderPendingMathElements,
 * and not registering the listener, each fail here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installPrintMathRendering, renderPendingMathElements } from '../../src/platform/math/ensureMathElementRenders.js';

const element = (rendered) => {
  const state = { rendered, renders: 0 };
  return {
    state,
    render() { state.renders += 1; state.rendered = true; },
    // mathElementHasRendered reads the render part's children in the shadow root.
    get shadowRoot() { return { querySelector: () => ({ childElementCount: state.rendered ? 1 : 0 }) }; },
  };
};

test('every math element that has not rendered is rendered; rendered ones are left alone', () => {
  const pending = [element(false), element(false)];
  const done = element(true);
  const root = { querySelectorAll: (selector) => { assert.equal(selector, 'math-span, math-div'); return [pending[0], done, pending[1]]; } };
  assert.equal(renderPendingMathElements(root), 2);
  assert.deepEqual(pending.map((entry) => entry.state.renders), [1, 1]);
  assert.equal(done.state.renders, 0);
  assert.equal(renderPendingMathElements(root), 0, 'nothing left to render');
});

test('the page renders pending math before it prints, and registers that once', () => {
  const pending = element(false);
  const listeners = [];
  const win = { document: { querySelectorAll: () => [pending] }, addEventListener: (name, listener) => listeners.push([name, listener]) };
  assert.equal(installPrintMathRendering(win), true);
  assert.equal(installPrintMathRendering(win), false, 'one listener per page');
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0][0], 'beforeprint');
  listeners[0][1]();
  assert.equal(pending.state.renders, 1);
});
