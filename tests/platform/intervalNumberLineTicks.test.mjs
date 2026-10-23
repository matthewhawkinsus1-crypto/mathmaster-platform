// THE NUMBER LINE'S TICKS FALL WHERE A CLICK LANDS (walkthrough 2026-10-23,
// Modeling and Solving Linear Inequalities CW 5: 0 to 600 by 60 drew ticks at
// every 50 and labels at every 100, and a click landed on 420 with no tick).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { intervalTickSteps, niceTickStep } from '../../src/tools/intervalNumberLine/intervalTicks.js';
import { INTERVAL_GRAPH_RETRY, intervalGraphMissMessage } from '../../src/tools/intervalNumberLine/intervalFeedback.js';

const ticks = (span, step) => Array.from({ length: Math.floor(span / step + 1e-9) + 1 }, (_, index) => Number((index * step).toFixed(10)));

test('an authored step that misses the nice ticks becomes the ticks', () => {
  assert.deepEqual(intervalTickSteps(600, 60), { major: 60, minor: 60 });
  assert.ok(ticks(600, intervalTickSteps(600, 60).minor).includes(420), 'the endpoint the item asks for has a tick');
  // 0..240 by 12: 20 steps, labelled every 24, a tick at every step.
  assert.deepEqual(intervalTickSteps(240, 12), { major: 24, minor: 12 });
});

test('integers on −10..10: a tick at every integer, labelled every 2 (the nice minor tick, 2.5, was not clickable)', () => {
  assert.deepEqual(intervalTickSteps(20, 1), { major: 2, minor: 1 });
});

test('a step that already falls on the ticks, no step, or a very fine step keeps the nice ticks', () => {
  assert.deepEqual(intervalTickSteps(600, 50), { major: 100, minor: 50 });
  assert.deepEqual(intervalTickSteps(10, 0.5), { major: niceTickStep(10), minor: niceTickStep(10) / 2 });
  assert.deepEqual(intervalTickSteps(20, null), { major: 5, minor: 2.5 });
  assert.deepEqual(intervalTickSteps(100, 0.5), { major: 20, minor: 10 }, 'more than 40 steps: not one tick each');
});

test('the line reads its tick steps from intervalTickSteps and says how a click moves', () => {
  const view = readFileSync(new URL('../../src/tools/intervalNumberLine/IntervalNumberLine.jsx', import.meta.url), 'utf8');
  assert.match(view, /intervalTickSteps\(span, Number\.isFinite\(authoredStep\) && authoredStep > 0 \? authoredStep : null\)/);
  assert.doesNotMatch(view, /Click\/drag snap/);
});

// The same walkthrough: an open dot at 420 for "≤ 420" was told to recheck
// every endpoint, the open/closed choice and the shading.

test('a wrong graph says which of the three is off, never a value', () => {
  const expected = [{ min: 0, max: 420, minClosed: true, maxClosed: true }];
  const openEnd = intervalGraphMissMessage({ built: [{ min: 0, max: 420, minClosed: true, maxClosed: false }], expected });
  assert.match(openEnd, /^Your endpoints are in the right places\. Check whether each one is open or closed/);
  assert.doesNotMatch(openEnd, /420|\b0\b/);
  const ray = [{ min: 5, max: null, minClosed: true }];
  assert.match(intervalGraphMissMessage({ built: [{ min: null, max: 5, maxClosed: true }], expected: ray }), /shading runs the wrong way/);
  assert.equal(intervalGraphMissMessage({ built: [{ min: 0, max: 400, minClosed: true, maxClosed: true }], expected }), INTERVAL_GRAPH_RETRY);
  assert.equal(intervalGraphMissMessage({ built: [{ min: 0, max: 420, minClosed: true, maxClosed: false }], expected, methodWithheld: true }), INTERVAL_GRAPH_RETRY, 'a DOL, quiz or test stays general');
});
