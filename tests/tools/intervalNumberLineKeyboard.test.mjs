import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import intervalNumberLineGrader from '../../functions/shared/serverGrading/tools/intervalNumberLine.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import {
  ENDPOINT_BIG_STEP_COUNT,
  NUMBER_LINE_GEOMETRY,
  applyEndpointEdit,
  endpointKeyIntent,
  endpointValue,
  initialLineCursor,
  lineKeyIntent,
  lineValueAtViewBoxX,
  moveBuiltEndpoint,
  movePendingEndpoint,
  placementOutcome,
  toggleBuiltEndpoint,
  togglePendingEndpoint,
  viewBoxXForValue,
} from '../../src/tools/intervalNumberLine/endpointEditing.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * THE NUMBER LINE BY KEYBOARD RECORDS WHAT THE POINTER RECORDS (KEYBOARD_SWEEP T3/T4).
 *
 * A focused endpoint: Enter/Space switch it open/closed (its click), arrows
 * move it by the snap step (a drag ending there). The focused line: arrows move
 * a placement marker, Enter places an endpoint (a click there). Each test
 * builds the state through the keyboard route and through the pointer route —
 * the very functions IntervalNumberLine.jsx calls on pointerdown/move/click —
 * and asserts the two states are deepEqual and grade identically on the
 * shared grader the server runs.
 */

const QUESTION = {
  type: 'intervalNumberLine',
  prompt: 'Graph the solution.',
  min: -8,
  max: 8,
  step: 1,
  ask: ['graph'],
  intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
};
// The viewport IntervalNumberLine derives for QUESTION (autoViewport).
const LINE = { min: -7.5, max: 10, snapStep: 1 };

const grade = (state) => gradeToolCheck(intervalNumberLineGrader, QUESTION, { intervals: state.built, notation: '', inequality: '' });
const key = (k, extra = {}) => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });

/* The keyboard route: keys on a focused endpoint, as handleEndpointKeyDown runs them. */
const pressOnEndpoint = (state, target, ...keys) => keys.reduce((current, k) => {
  const intent = endpointKeyIntent(k, endpointValue(current, target), LINE);
  assert.ok(intent, `${k.key} must do something on an endpoint`);
  return applyEndpointEdit(current, target, intent, LINE.snapStep);
}, state);

/* The pointer route: a drag on an endpoint ending at viewBox x, as updateDraggedValue runs it. */
const dragTo = (state, target, x) => {
  const value = lineValueAtViewBoxX(x, LINE);
  if (target.kind === 'pending') return { ...state, pending: movePendingEndpoint(state.pending, value) };
  return { ...state, built: moveBuiltEndpoint(state.built, target.intervalIndex, target.endpoint, value, LINE.snapStep) };
};
const clickEndpoint = (state, target) => (target.kind === 'pending'
  ? { ...state, pending: togglePendingEndpoint(state.pending) }
  : { ...state, built: toggleBuiltEndpoint(state.built, target.intervalIndex, target.endpoint) });

const MIN = { kind: 'built', intervalIndex: 0, endpoint: 'min' };
const MAX = { kind: 'built', intervalIndex: 0, endpoint: 'max' };
const PENDING = { kind: 'pending' };
const start = () => ({ pending: null, built: [{ min: -2, max: 5, minClosed: true, maxClosed: false }] });

test('ArrowLeft on an endpoint records exactly what a drag one step left records, and grades the same', () => {
  const before = start();
  assert.equal(grade(before).isCorrect, false, 'the starting graph (-2) is wrong, so the move is what makes it right');

  const byKeys = pressOnEndpoint(before, MIN, key('ArrowLeft'));
  // The drag ends a few pixels off the tick, as a finger does; the snap lands it on -3.
  const byPointer = dragTo(before, MIN, viewBoxXForValue(-3, LINE) + 4);
  assert.deepEqual(byKeys, byPointer);
  assert.deepEqual(byKeys.built, [{ min: -3, max: 5, minClosed: true, maxClosed: false }]);
  assert.deepEqual(grade(byKeys), grade(byPointer));
  assert.equal(grade(byKeys).isCorrect, true);
});

test('Enter and Space on an endpoint do exactly what its click does', () => {
  const before = { pending: null, built: [{ min: -3, max: 5, minClosed: true, maxClosed: true }] };
  for (const k of [key('Enter'), key(' ')]) {
    const byKeys = pressOnEndpoint(before, MAX, k);
    const byPointer = clickEndpoint(before, MAX);
    assert.deepEqual(byKeys, byPointer, `${JSON.stringify(k.key)} toggles like a click`);
    assert.equal(byKeys.built[0].maxClosed, false);
    assert.deepEqual(grade(byKeys), grade(byPointer));
    assert.equal(grade(byKeys).isCorrect, true, 'closed -> open at 5 is the answer');
  }
  // Twice is back where it started, as two clicks are.
  assert.deepEqual(pressOnEndpoint(before, MAX, key('Enter'), key(' ')), before);
});

test('Shift moves a bigger step; an off-grid typed endpoint moves to the next grid value first', () => {
  const byShift = pressOnEndpoint(start(), MAX, key('ArrowLeft', { shiftKey: true }));
  assert.equal(byShift.built[0].max, 5 - ENDPOINT_BIG_STEP_COUNT);
  assert.deepEqual(byShift, dragTo(start(), MAX, viewBoxXForValue(5 - ENDPOINT_BIG_STEP_COUNT, LINE)));

  const typed = { pending: null, built: [{ min: -13 / 8, max: 5, minClosed: true, maxClosed: false }] };
  assert.equal(pressOnEndpoint(typed, MIN, key('ArrowRight')).built[0].min, -1);
  assert.equal(pressOnEndpoint(typed, MIN, key('ArrowLeft')).built[0].min, -2);
  // An on-grid value moves exactly one step each way.
  assert.equal(pressOnEndpoint(start(), MIN, key('ArrowRight')).built[0].min, -1);
  assert.equal(pressOnEndpoint(start(), MIN, key('ArrowDown')).built[0].min, -3);
});

test('the keyboard clamps exactly as the drag clamps: the ends of the line, and a piece one step wide', () => {
  // Off the right end of the line.
  const far = { pending: null, built: [{ min: -3, max: 9, minClosed: true, maxClosed: false }] };
  const byKeys = pressOnEndpoint(far, MAX, key('ArrowRight', { shiftKey: true }), key('ArrowRight'));
  const byPointer = dragTo(far, MAX, NUMBER_LINE_GEOMETRY.WIDTH + 50);
  assert.deepEqual(byKeys, byPointer);
  assert.equal(byKeys.built[0].max, LINE.max);

  // The left end, -7.5, is off the grid; both routes clamp to it all the same.
  const left = pressOnEndpoint(start(), MIN, ...Array(12).fill(key('ArrowLeft')));
  assert.deepEqual(left, dragTo(start(), MIN, -100));
  assert.equal(left.built[0].min, LINE.min);

  // The min endpoint cannot pass max - snapStep, by either route.
  const narrow = pressOnEndpoint(start(), MIN, ...Array(9).fill(key('ArrowRight')));
  assert.deepEqual(narrow, dragTo(start(), MIN, viewBoxXForValue(8, LINE)));
  assert.equal(narrow.built[0].min, 4);
  assert.deepEqual(grade(narrow), grade(dragTo(start(), MIN, viewBoxXForValue(8, LINE))));
});

test('the pending endpoint moves and switches by keys exactly as by pointer', () => {
  const before = { pending: { value: 2, closed: true }, built: [] };
  const byKeys = pressOnEndpoint(before, PENDING, key('ArrowLeft'), key('ArrowLeft'), key('Enter'));
  const byPointer = clickEndpoint(dragTo(before, PENDING, viewBoxXForValue(0, LINE)), PENDING);
  assert.deepEqual(byKeys, byPointer);
  assert.deepEqual(byKeys.pending, { value: 0, closed: false });
});

test('keys an endpoint does not own pass through', () => {
  for (const k of [key('Tab'), key('Escape'), key('a'), key('ArrowLeft', { ctrlKey: true }), key('Enter', { altKey: true })]) {
    assert.equal(endpointKeyIntent(k, 3, LINE), null, `${k.key} must reach the page`);
    assert.equal(lineKeyIntent(k, 3, LINE), null, `${k.key} must reach the page from the line`);
  }
});

test('the focused line: arrows move a marker, Enter places an endpoint exactly where a click would, and it grades the same', () => {
  // Keyboard: Closed, marker from 0 three left, Enter; Open, marker to 5, Space.
  let cursor = initialLineCursor(LINE);
  assert.equal(cursor, 0);
  const keyboardPlace = (state, closed, keys) => {
    let intent;
    for (const k of keys) {
      intent = lineKeyIntent(k, cursor, LINE);
      assert.ok(intent, `${k.key} does something on the line`);
      if (intent.type === 'cursor') cursor = intent.value;
    }
    assert.equal(intent.type, 'place');
    const outcome = placementOutcome(state.pending, intent.value, closed);
    return { pending: outcome.pending, built: outcome.interval ? [...state.built, outcome.interval] : state.built };
  };
  let byKeys = { pending: null, built: [] };
  byKeys = keyboardPlace(byKeys, true, [key('ArrowLeft'), key('ArrowLeft'), key('ArrowLeft'), key('Enter')]);
  assert.deepEqual(byKeys.pending, { value: -3, closed: true });
  byKeys = keyboardPlace(byKeys, false, [key('ArrowRight', { shiftKey: true }), key('ArrowRight', { shiftKey: true }), key('ArrowLeft'), key('ArrowLeft'), key(' ')]);

  // Pointer: the two clicks, each a few pixels off its tick.
  const clickPlace = (state, closed, x) => {
    const outcome = placementOutcome(state.pending, lineValueAtViewBoxX(x, LINE), closed);
    return { pending: outcome.pending, built: outcome.interval ? [...state.built, outcome.interval] : state.built };
  };
  let byPointer = { pending: null, built: [] };
  byPointer = clickPlace(byPointer, true, viewBoxXForValue(-3, LINE) - 5);
  byPointer = clickPlace(byPointer, false, viewBoxXForValue(5, LINE) + 5);

  assert.deepEqual(byKeys, byPointer);
  assert.deepEqual(byKeys, { pending: null, built: [{ min: -3, max: 5, minClosed: true, maxClosed: false }] });
  assert.deepEqual(grade(byKeys), grade(byPointer));
  assert.equal(grade(byKeys).isCorrect, true);

  // Home / End go to the ends of the line as a click there would.
  assert.equal(lineKeyIntent(key('Home'), 0, LINE).value, lineValueAtViewBoxX(NUMBER_LINE_GEOMETRY.PAD, LINE));
  assert.equal(lineKeyIntent(key('End'), 0, LINE).value, lineValueAtViewBoxX(NUMBER_LINE_GEOMETRY.WIDTH - NUMBER_LINE_GEOMETRY.PAD, LINE));
  // Enter before any marker shows the marker; it never places a point the student did not see.
  assert.deepEqual(lineKeyIntent(key('Enter'), null, LINE), { type: 'cursor', value: 0 });
});

/* ------------------------------------------------------------- wiring */

const COMPONENT = 'src/tools/intervalNumberLine/IntervalNumberLine.jsx';
const component = () => executableSource(fs.readFileSync(COMPONENT, 'utf8'));

test('IntervalNumberLine runs both routes through endpointEditing.js', () => {
  const source = component();
  // Pointer: the click/drag value and the drag edit are the helper's.
  assert.match(region(source, 'const valueFromEvent', '\n  };'), /return lineValueAtViewBoxX\(point\.x, \{ min, max, snapStep \}\)/);
  const drag = region(source, 'const updateDraggedValue', '\n  };');
  assert.match(drag, /movePendingEndpoint\(current, value\)/);
  assert.match(drag, /moveBuiltEndpoint\(current, dragging\.intervalIndex, dragging\.endpoint, value, snapStep\)/);
  assert.match(region(source, 'const placeEndpoint', '\n  };'), /placementOutcome\(pending, value, closed\)/);

  // Keyboard: every endpoint has a key handler naming its own target.
  for (const target of [
    "{ kind: 'built', intervalIndex: index, endpoint: 'min' }",
    "{ kind: 'built', intervalIndex: index, endpoint: 'max' }",
    "{ kind: 'pending' }",
  ]) {
    const escaped = target.replace(/[{}]/g, '\\$&');
    assert.match(source, new RegExp(`onKeyDown=\\{\\(event\\) => handleEndpointKeyDown\\(${escaped}, event\\)\\}`), target);
  }
  const keyHandler = region(source, 'const handleEndpointKeyDown', '\n  };');
  assert.match(keyHandler, /endpointKeyIntent\(event, endpointValue\(state, target\), \{ min, max, snapStep \}\)/);
  assert.match(keyHandler, /applyEndpointEdit\(state, target, intent, snapStep\)/);
  assert.match(keyHandler, /event\.preventDefault\(\)/, 'Space must not scroll the page');

  // The line is a focusable application with its own keys, still clicked by pointer.
  const svg = region(source, '<svg', '>\n');
  assert.match(svg, /role="application"/);
  assert.match(svg, /tabIndex=\{0\}/);
  assert.match(svg, /onKeyDown=\{handleLineKeyDown\}/);
  assert.match(svg, /onClick=\{handleLineClick\}/);
  assert.match(region(source, 'const handleLineKeyDown', '\n  };'), /placeEndpoint\(intent\.value\)/);
});

test('the keyboard announcements say where, never whether it is right', () => {
  const source = component();
  const announcements = [...source.matchAll(/setEndpointAnnouncement\(([^;]*)\);/g)].map((m) => m[1]).join('\n');
  assert.ok(announcements.length > 0);
  assert.doesNotMatch(announcements, /correct|right|wrong|isCorrect|expected|intervals\b|answer/i);
  assert.doesNotMatch(announcements, /questionData|feedback/);
  assert.match(source, /role="status" aria-live="polite"[^>]*>\s*\{endpointAnnouncement\}/);
});
