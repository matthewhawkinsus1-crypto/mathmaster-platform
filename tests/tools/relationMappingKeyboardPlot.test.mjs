/*
 * relationMapping — THE COORDINATE PLOT BY KEYBOARD GRADES EXACTLY LIKE A CLICK.
 *
 * The Mapping Diagram's coordinate plot (RelationCoordinatePlot) was
 * click-only, so a keyboard student could not answer a plot question unless
 * the author had turned on typed entry (docs/accessibility/KEYBOARD_SWEEP.md,
 * T1). It now takes a crosshair moved by the arrow keys, and Enter/Space
 * toggles the point under it through the same onTogglePoint a click calls.
 *
 * Pinned here, on the real shared grader:
 *   - every grid point a click can plot, the arrow keys can reach, and the
 *     two routes produce the identical [x, y] (no -0, no float drift);
 *   - the keyboard reaches no point a click cannot (the window and the grid);
 *   - a whole answer built by keys and the same answer built by clicks leave
 *     deepEqual plottedPoints and grade identically — right and wrong;
 *   - what the live region says is a position, never a verdict;
 *   - the component is wired to these helpers (focusable, keys handled, the
 *     keyboard's Enter calls the click's onTogglePoint).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import relationMappingGrader, {
  parseList,
  relationFieldWork,
  relationAnalysisFieldsOf,
  relationPairsOf,
} from '../../functions/shared/serverGrading/tools/relationMapping.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import {
  RELATION_PLOT_LARGE_STEP,
  RELATION_PLOT_PAD,
  RELATION_PLOT_SIZE,
  initialRelationCrosshair,
  moveRelationCrosshair,
  relationCrosshairMessage,
  relationPlotBounds,
  relationPlotKeyboardHelp,
  relationPlotPointAtViewBox,
  relationPlotViewBoxOf,
  relationPointIsPlotted,
  relationToggleMessage,
  toggleRelationPlottedPoint,
} from '../../src/tools/relationMapping/relationPlotKeyboard.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const COMPONENT = readFileSync(new URL('../../src/tools/relationMapping/RelationMapping.jsx', import.meta.url), 'utf8');

const PLOT_Q = Object.freeze({
  questionId: 'rm-keyboard-plot',
  type: 'relationMapping',
  pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }],
  ask: ['plot', 'domain', 'range'],
});
const PAIRS = relationPairsOf(PLOT_Q.pairs);
const BOUNDS = relationPlotBounds(PAIRS);

/* The work exactly as RelationMapping.jsx builds it (relationMappingSharedGrading pins the keys). */
const workOf = (question, plottedPoints, { domainAnswer = '-2, 1, 3', rangeAnswer = '-1, 2, 3' } = {}) => ({
  plottedPoints,
  arrows: [],
  domainText: domainAnswer,
  rangeText: rangeAnswer,
  domain: parseList(domainAnswer),
  range: parseList(rangeAnswer),
  isFunction: '',
  fields: relationFieldWork(relationAnalysisFieldsOf(question.answerFields), {}),
});

// --- The two routes, modelled on what the component does -------------------------

/** POINTER: a click at viewBox (px, py) -> pointFromEvent -> onTogglePoint -> reducer. */
const click = (points, viewBoxPoint, bounds = BOUNDS, step = 1) => {
  const hit = relationPlotPointAtViewBox(viewBoxPoint, bounds, step);
  return hit ? toggleRelationPlottedPoint(points, hit[0], hit[1]) : points;
};
/** A click on the drawn grid point, nudged by (dx, dy) viewBox units as a real tap is. */
const clickAt = (points, xy, [dx, dy] = [0, 0], bounds = BOUNDS, step = 1) => {
  const at = relationPlotViewBoxOf(xy, bounds);
  return click(points, { x: at.x + dx, y: at.y + dy }, bounds, step);
};

/** KEYBOARD: replay keys through the plot's handler logic; returns { points, cursor, said }. */
const pressKeys = (keys, { points = [], cursor = null, bounds = BOUNDS, step = 1 } = {}) => {
  const said = [];
  let state = points;
  let at = cursor;
  for (const raw of keys) {
    const shift = raw.startsWith('Shift+');
    const key = shift ? raw.slice('Shift+'.length) : raw;
    const moved = moveRelationCrosshair(at, key, { bounds, snapStep: step, shift });
    if (moved) { at = moved; said.push(relationCrosshairMessage(at, state)); continue; }
    if (key === 'Enter' || key === ' ') {
      const target = at || initialRelationCrosshair(bounds, step);
      const was = relationPointIsPlotted(state, target[0], target[1]);
      at = target;
      state = toggleRelationPlottedPoint(state, target[0], target[1]);
      said.push(relationToggleMessage(target, was));
      continue;
    }
    if (key === 'Escape') { at = null; continue; }
  }
  return { points: state, cursor: at, said };
};

/** Arrow keys that take the crosshair from `from` to `to` on a grid of `step`. */
const keysTo = (from, [x, y], step = 1) => {
  const keys = [];
  const dx = Math.round((x - from[0]) / step);
  const dy = Math.round((y - from[1]) / step);
  for (let i = 0; i < Math.abs(dx); i += 1) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let i = 0; i < Math.abs(dy); i += 1) keys.push(dy > 0 ? 'ArrowUp' : 'ArrowDown');
  return keys;
};

const gridValues = (min, max, step) => {
  const out = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9; k += 1) out.push(Number((k * step).toFixed(8)));
  return out;
};

// --- Every point a click can plot, the keys reach, identically -------------------

// 0.1 is there for float drift: 0.1 + 0.1 + 0.1 is not 0.3 unless it is snapped.
for (const step of [1, 0.5, 0.1]) {
  test(`step ${step}: every grid point a click plots is reached by arrow keys, as the identical [x, y]`, () => {
    const xs = gridValues(BOUNDS.xMin, BOUNDS.xMax, step);
    const ys = gridValues(BOUNDS.yMin, BOUNDS.yMax, step);
    assert.ok(xs.length >= 11 && ys.length >= 11, 'the window is the -5..5 plot');
    const origin = initialRelationCrosshair(BOUNDS, step);
    assert.deepEqual(origin, [0, 0], 'the crosshair starts at the origin');
    // A real tap is off-centre: up to 0.3 of a grid step, in viewBox units.
    const nudge = 0.3 * step * ((RELATION_PLOT_SIZE - 2 * RELATION_PLOT_PAD) / (BOUNDS.xMax - BOUNDS.xMin));
    for (const x of xs) {
      for (const y of ys) {
        const byClick = clickAt([], [x, y], [nudge, -nudge], BOUNDS, step);
        const byKeys = pressKeys([...keysTo(origin, [x, y], step), 'Enter'], { step }).points;
        assert.deepEqual(byClick, [[x, y]], `a click at the drawn (${x}, ${y}) plots it`);
        assert.deepEqual(byKeys, byClick, `keys to (${x}, ${y}) record the click's state`);
        // deepEqual is Object.is on numbers: a -0 from one route would fail here.
        assert.ok(byKeys[0].every((v) => !Object.is(v, -0)), 'no -0 in the recorded point');
      }
    }
  });

  test(`step ${step}: the keyboard reaches no point a click cannot (window edges, Shift jumps)`, () => {
    // Everything a click can produce, sampled on every viewBox pixel.
    const byPointer = new Set();
    for (let px = 0; px <= RELATION_PLOT_SIZE; px += 1) {
      for (let py = 0; py <= RELATION_PLOT_SIZE; py += 1) {
        const hit = relationPlotPointAtViewBox({ x: px, y: py }, BOUNDS, step);
        if (hit) byPointer.add(hit.join('|'));
      }
    }
    // Everything the arrow keys can reach from the start, with and without Shift.
    const start = initialRelationCrosshair(BOUNDS, step);
    const seen = new Set([start.join('|')]);
    const queue = [start];
    // Bounded: a crosshair that escaped the window would otherwise walk forever.
    while (queue.length && seen.size <= byPointer.size) {
      const at = queue.shift();
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        for (const shift of [false, true]) {
          const next = moveRelationCrosshair(at, key, { bounds: BOUNDS, snapStep: step, shift });
          assert.ok(next, `${key} moves the crosshair`);
          const id = next.join('|');
          if (!seen.has(id)) { seen.add(id); queue.push(next); }
        }
      }
    }
    assert.deepEqual([...seen].sort(), [...byPointer].sort());
  });
}

test('arrow keys move one grid step, Shift five, and stop at the window edge', () => {
  const opts = { bounds: BOUNDS, snapStep: 1 };
  assert.deepEqual(moveRelationCrosshair(null, 'ArrowRight', opts), [1, 0], 'first press moves from the origin');
  assert.deepEqual(moveRelationCrosshair([0, 0], 'ArrowUp', opts), [0, 1]);
  assert.deepEqual(moveRelationCrosshair([0, 0], 'ArrowDown', opts), [0, -1]);
  assert.deepEqual(moveRelationCrosshair([0, 0], 'ArrowLeft', opts), [-1, 0]);
  assert.deepEqual(moveRelationCrosshair([0, 0], 'ArrowRight', { ...opts, shift: true }), [RELATION_PLOT_LARGE_STEP, 0]);
  assert.deepEqual(moveRelationCrosshair([4, -4], 'ArrowRight', { ...opts, shift: true }), [BOUNDS.xMax, -4], 'Shift stops at the edge');
  assert.deepEqual(moveRelationCrosshair([BOUNDS.xMax, 0], 'ArrowRight', opts), [BOUNDS.xMax, 0], 'held at the right edge');
  assert.deepEqual(moveRelationCrosshair([0, BOUNDS.yMin], 'ArrowDown', opts), [0, BOUNDS.yMin], 'held at the bottom edge');
  assert.deepEqual(moveRelationCrosshair([0.5, 0], 'ArrowRight', { ...opts, snapStep: 0.5 }), [1, 0], 'a half-unit grid moves by a half');
  assert.equal(moveRelationCrosshair([0, 0], 'Enter', opts), null, 'only arrows move');
  assert.equal(moveRelationCrosshair([0, 0], 'a', opts), null);
});

// --- A whole answer: keys and clicks record the same state and grade the same ---

const bothGrades = (work) => {
  const browser = gradeToolCheck(relationMappingGrader, PLOT_Q, work);
  const server = gradeServerResponse({ question: PLOT_Q, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  return { browser, server };
};

test('a correct plot built by keys and by clicks: same plottedPoints, same grade, graded correct', () => {
  // Clicks: plot the three pairs (off-centre taps), mis-plot (2, 2), then click it again to remove it.
  let clicked = [];
  clicked = clickAt(clicked, [-2, 3], [3, 4]);
  clicked = clickAt(clicked, [1, 2], [-4, 2]);
  clicked = clickAt(clicked, [2, 2], [1, -3]);
  clicked = clickAt(clicked, [2, 2], [-2, 2]);
  clicked = clickAt(clicked, [3, -1], [0, -5]);

  // Keys: the same five actions, aimed with arrows (Shift for the long run).
  const keys = pressKeys([
    'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter', // (-2, 3)
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', ' ', // (1, 2) with Space
    'ArrowRight', 'Enter', // (2, 2) mis-plot
    'Enter', // ...removed again
    'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter', // (3, -1)
  ]);

  assert.deepEqual(keys.points, [[-2, 3], [1, 2], [3, -1]]);
  assert.deepEqual(keys.points, clicked, 'the keyboard records exactly the clicked state');

  const byKeys = bothGrades(workOf(PLOT_Q, keys.points));
  const byClicks = bothGrades(workOf(PLOT_Q, clicked));
  assert.deepEqual(byKeys.browser, byClicks.browser, 'identical browser grade, toolResponse included');
  assert.deepEqual(byKeys.server, byClicks.server, 'identical server grade');
  assert.equal(byKeys.browser.graded, true);
  assert.equal(byKeys.browser.isCorrect, true, JSON.stringify(byKeys.browser.parts));
  assert.equal(byKeys.server.isCorrect, true);
  assert.equal(byKeys.browser.parts.find((part) => part.id === 'plot').isCorrect, true);
});

test('a wrong plot built by keys and by clicks: same state, same (wrong) grade', () => {
  let clicked = [];
  clicked = clickAt(clicked, [-2, 3]);
  clicked = clickAt(clicked, [2, 1]); // (x, y) swapped
  const keys = pressKeys(['Shift+ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter', 'Shift+ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'Enter']);
  assert.deepEqual(keys.points, [[-2, 3], [2, 1]]);
  assert.deepEqual(keys.points, clicked);
  const byKeys = bothGrades(workOf(PLOT_Q, keys.points));
  const byClicks = bothGrades(workOf(PLOT_Q, clicked));
  assert.deepEqual(byKeys.browser, byClicks.browser);
  assert.deepEqual(byKeys.server, byClicks.server);
  assert.equal(byKeys.browser.isCorrect, false);
  assert.equal(byKeys.browser.parts.find((part) => part.id === 'plot').isCorrect, false);
});

test('Enter with no crosshair yet plots the origin; Escape hides the crosshair and the next arrow starts over', () => {
  const first = pressKeys(['Enter']);
  assert.deepEqual(first.points, clickAt([], [0, 0]));
  const escaped = pressKeys(['ArrowRight', 'ArrowRight', 'Escape']);
  assert.equal(escaped.cursor, null);
  const after = pressKeys(['ArrowUp', 'Enter'], { cursor: escaped.cursor });
  assert.deepEqual(after.points, [[0, 1]]);
});

test('the shared reducer: a "Remove" button, a click and Enter all toggle the same way', () => {
  assert.deepEqual(toggleRelationPlottedPoint([], 1, 2), [[1, 2]]);
  assert.deepEqual(toggleRelationPlottedPoint([[1, 2], [3, 4]], 1, 2), [[3, 4]]);
  assert.deepEqual(toggleRelationPlottedPoint([[1, 2]], 1 + 1e-12, 2), [], 'float noise is the same point');
  assert.deepEqual(toggleRelationPlottedPoint([[1, 2]], '3', '-1'), [[1, 2], [3, -1]], 'typed strings become numbers');
  const unchanged = [[1, 2]];
  assert.equal(toggleRelationPlottedPoint(unchanged, 'x', 2), unchanged, 'a non-number leaves the list alone');
});

// --- What it says is where, never whether ---------------------------------------

test('announcements give positions only: a right point and a wrong point are announced alike', () => {
  const VERDICT = /\b(correct|incorrect|right|wrong|match|matches|answer|solution|good|nice|yes|no)\b/i;
  const right = pressKeys(['ArrowRight', 'ArrowUp', 'ArrowUp', 'Enter', 'Enter']); // (1, 2) is a pair
  const wrong = pressKeys(['ArrowRight', 'ArrowRight', 'ArrowUp', 'Enter', 'Enter']); // (2, 1) is not
  for (const line of [...right.said, ...wrong.said, relationPlotKeyboardHelp(1), relationPlotKeyboardHelp(0.5)]) {
    assert.doesNotMatch(line, VERDICT, `no verdict in "${line}"`);
  }
  assert.deepEqual(right.said, ['Crosshair at (1, 0).', 'Crosshair at (1, 1).', 'Crosshair at (1, 2).', 'Plotted (1, 2).', 'Removed (1, 2).']);
  // Strip the coordinates and the two runs say exactly the same thing.
  const shape = (lines) => lines.map((line) => line.replace(/\(-?[\d.]+, -?[\d.]+\)/g, '(x, y)'));
  assert.deepEqual(shape(right.said), shape(wrong.said));
  assert.equal(relationCrosshairMessage([1, 2], [[1, 2]]), 'Crosshair at (1, 2), on a plotted point.');
});

// --- The component is wired to it -------------------------------------------------

test('RelationCoordinatePlot is a focusable application that handles the keys through the click path', () => {
  const plot = executableSource(region(COMPONENT, 'function RelationCoordinatePlot', '\nexport default function RelationMapping', 'RelationCoordinatePlot'));
  const svg = region(plot, '<svg', '>\n', 'the plot svg');
  // role="application" is honest only on a focusable element that takes keys.
  assert.match(svg, /role="application"/);
  assert.match(svg, /tabIndex=\{0\}/);
  assert.match(svg, /onKeyDown=\{handleKeyDown\}/);
  assert.match(svg, /aria-describedby=\{helpId\}/);
  assert.match(plot, /<p\s+id=\{helpId\}[\s\S]*?\{relationPlotKeyboardHelp\(step\)\}/, 'the description is the keyboard instruction');
  // The pointer maps through the shared helper...
  const pointer = region(plot, 'const pointFromEvent', '\n  };', 'pointFromEvent');
  assert.match(pointer, /return relationPlotPointAtViewBox\(\{ x: point\.x, y: point\.y \}, bounds, step\);/);
  // ...and the keyboard moves with the shared helper and toggles with the click's callback.
  const keys = region(plot, 'const handleKeyDown', '\n  };', 'handleKeyDown');
  assert.match(keys, /const moved = moveRelationCrosshair\(keyboardCursor, event\.key, \{ bounds, snapStep: step, shift: event\.shiftKey \}\);/);
  assert.match(keys, /if \(event\.key === 'Enter' \|\| event\.key === ' '\) \{[\s\S]*?onTogglePoint\?\.\(target\[0\], target\[1\]\);/);
  assert.match(keys, /setKeyboardMessage\(relationToggleMessage\(target, wasPlotted\)\);/);
  const click = region(plot, 'const handleClick', '\n  };', 'handleClick');
  assert.match(click, /onTogglePoint\?\.\(point\[0\], point\[1\]\);/);
  // The live region reads the keyboard message.
  assert.match(plot, /aria-live="polite"[^>]*>\s*\{liveText\}/);
  assert.match(plot, /: keyboardMessage \|\|/);
});

test('the tool records a toggle through the shared reducer, with the plot and its window from the helpers', () => {
  const tool = executableSource(region(COMPONENT, 'export default function RelationMapping', '\n  const addTypedPoint', 'RelationMapping'));
  const toggle = region(tool, 'const togglePlottedPoint', '\n  };', 'togglePlottedPoint');
  assert.match(toggle, /setPlottedPoints\(\(current\) => toggleRelationPlottedPoint\(current, nx, ny\)\);/);
  assert.match(tool, /const plotBounds = useMemo\(\(\) => relationPlotBounds\(pairs\), \[pairs\]\);/);
  assert.match(COMPONENT, /<RelationCoordinatePlot\s+bounds=\{plotBounds\}\s+points=\{plottedPoints\}\s+onTogglePoint=\{togglePlottedPoint\}/);
  // A .jsx call with no import is a runtime ReferenceError the build misses (AGENTS.md).
  assert.match(COMPONENT, /import \{[^}]*\btoggleRelationPlottedPoint\b[^}]*\bmoveRelationCrosshair\b|import \{[^}]*\bmoveRelationCrosshair\b[^}]*\btoggleRelationPlottedPoint\b[^}]*\} from '\.\/relationPlotKeyboard\.js';/);
});
