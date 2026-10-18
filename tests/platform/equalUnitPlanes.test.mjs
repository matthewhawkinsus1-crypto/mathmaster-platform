/*
 * Equal-unit planes where angle or shape is the mathematics (student pass 3,
 * R-1 / PR-13).
 *
 * GraphDisplay's plot area is 524 x 334. A square window drew one unit of y
 * about two thirds as tall as a unit of x, and the fitter widened y to keep a
 * steep line in frame, so on the perpendicular-lines lesson (Algebra 1 M2 T2
 * L3, CW 1) line B (slope 1/3) and its "90° rotation" B′ (slope −3) met at
 * about 30° on screen. Figures of two or more lines, and figures with drawn
 * segments (distance, a polygon and its rotation or reflection), now get one
 * unit the same length on both axes. An author can ask for it
 * (`equalUnits: true`) or turn it off (`equalUnits: false`). Pre-Flight no
 * longer warns that the steep line of such a pair is "mostly outside" the
 * window: with equal units that is the true picture. Interactive planes take
 * it only as an authored flag, and only their pixel height changes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');
import {
  auditStaticGraphViewport,
  fitStaticGraphViewport,
  staticGraphUsesEqualUnits,
  STATIC_GRAPH_PLOT_ASPECT,
} from '../../src/graphSpecUtils.js';
import { equalUnitPlaneHeight } from '../../src/tools/shared/planeEqualUnits.js';

const lesson = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json', import.meta.url), 'utf8'));
const L3_CW1 = lesson.sections[1].questions[0].graph;
const L3_CW2 = lesson.sections[1].questions[1].graph;

// The on-screen angle between two lines of a fitted window, drawn in a plot
// of the given proportions.
const screenAngle = (graph, [m1, m2], aspect = STATIC_GRAPH_PLOT_ASPECT) => {
  const unitRatio = ((graph.xMax - graph.xMin) / aspect) / (graph.yMax - graph.yMin); // px per y unit ÷ px per x unit
  const a1 = Math.atan(m1 * unitRatio);
  const a2 = Math.atan(m2 * unitRatio);
  let angle = Math.abs(a1 - a2) * 180 / Math.PI;
  if (angle > 90) angle = 180 - angle;
  return angle;
};

test('the lesson figure: a line and its 90° rotation meet at a right angle on screen', () => {
  assert.equal(L3_CW1.functions.length, 2, 'the lesson still has its two lines');
  const fitted = fitStaticGraphViewport(L3_CW1);
  assert.equal(fitted.equalUnits, true);
  assert.ok(Math.abs((fitted.xMax - fitted.xMin) / (fitted.yMax - fitted.yMin) - STATIC_GRAPH_PLOT_ASPECT) < 1e-4, 'one unit, both axes');
  assert.ok(Math.abs(screenAngle(fitted, [1 / 3, -3]) - 90) < 0.01);
  // The author's window is kept (widened only), and the marked point shows.
  assert.ok(fitted.xMin <= -9 && fitted.xMax >= 9 && fitted.yMin <= -9 && fitted.yMax >= 9);
  assert.ok(fitted.yMin < 5 && fitted.yMax > 5);
  // What students saw before: the old fit, about 30°.
  const old = fitStaticGraphViewport({ ...L3_CW1, equalUnits: false });
  assert.ok(screenAngle(old, [1 / 3, -3]) < 45, `old fit drew ${screenAngle(old, [1 / 3, -3])}°`);

  const cw2 = fitStaticGraphViewport(L3_CW2);
  assert.ok(Math.abs(screenAngle(cw2, [-0.5, 2]) - 90) < 0.01);
  for (const point of L3_CW2.points) assert.ok(point.x > cw2.xMin && point.x < cw2.xMax && point.y > cw2.yMin && point.y < cw2.yMax, point.label);
});

test('which figures get equal units', () => {
  const two = { functions: [{ type: 'line', m: 2, b: 1 }, { type: 'line', m: 2, b: -3 }] };
  assert.equal(staticGraphUsesEqualUnits(two), true, 'parallel lines');
  assert.equal(staticGraphUsesEqualUnits({ points: [[1, 1], [5, 3]], segments: [{ from: [1, 1], to: [5, 3] }] }), true, 'a segment (distance, a figure)');
  assert.equal(staticGraphUsesEqualUnits({ functions: [{ type: 'line', m: 2, b: 1 }] }), false, 'one line: unchanged');
  assert.equal(staticGraphUsesEqualUnits({ functions: [{ type: 'line', m: 2, b: 1 }, { type: 'quadratic', a: 1, b: 0, c: 0 }] }), false, 'a curve: unchanged');
  assert.equal(staticGraphUsesEqualUnits({ ...two, xAxisLabel: 'Hours', yAxisLabel: 'Cost', yAxisUnit: 'dollars' }), false, 'two different quantities');
  assert.equal(staticGraphUsesEqualUnits({ ...two, xAxisUnit: 'm', yAxisUnit: 'm' }), true, 'one unit on both axes');
  assert.equal(staticGraphUsesEqualUnits({ ...two, equalUnits: false }), false, 'author turns it off');
  assert.equal(staticGraphUsesEqualUnits({ functions: [{ type: 'quadratic', a: 1, b: 0, c: 0 }], equalUnits: true }), true, 'author asks for it');
  // lockViewport keeps the author's window exactly.
  const locked = { ...L3_CW1, lockViewport: true };
  assert.equal(fitStaticGraphViewport(locked), locked);
  // A host on a plane of its own proportions can keep the old fit.
  assert.equal(fitStaticGraphViewport(L3_CW1, { equalUnits: false }).equalUnits, undefined);
});

test('Pre-Flight: equal-unit lines are exempt from "mostly outside", nothing else is', () => {
  assert.deepEqual(auditStaticGraphViewport(L3_CW1, { label: 'cw1' }), { errors: [], warnings: [] });
  assert.deepEqual(auditStaticGraphViewport(L3_CW2, { label: 'cw2' }), { errors: [], warnings: [] });
  // A steep pair in a small window: with equal units the steep line leaves it.
  const steep = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, functions: [{ type: 'line', m: 0.1, b: 0 }, { type: 'line', m: -10, b: 0 }] };
  assert.deepEqual(auditStaticGraphViewport(steep, { label: 'steep' }).warnings, []);
  // A curve the author forced into equal units still warns.
  const curve = { xMin: -10, xMax: 10, yMin: -2, yMax: 2, equalUnits: true, functions: [{ type: 'quadratic', a: 5, b: 0, c: 0 }] };
  assert.match(auditStaticGraphViewport(curve, { label: 'curve' }).warnings.join('\n'), /mostly outside/);
});

test('GraphDisplay draws the lesson figure at a right angle, with one labelled step', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: GraphDisplay } = await server.ssrLoadModule('/src/GraphDisplay.jsx');
    const markup = renderToStaticMarkup(React.createElement(GraphDisplay, { graph: L3_CW1, enlargeable: false }));
    const lineTags = markup.match(/<path\b[^>]*stroke-linecap="round"[^>]*>/g) || [];
    const paths = lineTags.map((tag) => tag.match(/\sd="M\s*([-\d.]+)[ ,]([-\d.]+)\s*L\s*([-\d.]+)[ ,]([-\d.]+)/))
      .map(([, x1, y1, x2, y2]) => Math.atan2(-(Number(y2) - Number(y1)), Number(x2) - Number(x1)));
    assert.equal(paths.length, 2, 'two lines drawn');
    // The steep line is cropped to the plot area, not drawn over the labels...
    const clip = markup.match(/<clipPath id="([^"]+)"><rect x="48" y="48" width="524" height="334"><\/rect><\/clipPath>/);
    assert.ok(clip, 'a clip to the plot area');
    lineTags.forEach((tag) => assert.match(tag, new RegExp(`clip-path="url\\(#${clip[1]}\\)"`)));
    // ...and each line keeps an arrow at both ends, where it leaves the frame
    // (through the top or bottom as well as the sides).
    const arrows = [...markup.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) rotate\([-\d.e]+\)"><polygon points="14,0 -7,-9 -7,9"/g)]
      .map(([, x, y]) => [Number(x), Number(y)]);
    assert.equal(arrows.length, 4, `four arrows, got ${arrows.length}`);
    arrows.forEach(([x, y]) => assert.ok(x >= 47.9 && x <= 572.1 && y >= 47.9 && y <= 382.1, `arrow on the frame: ${x}, ${y}`));
    let angle = Math.abs(paths[0] - paths[1]) * 180 / Math.PI;
    if (angle > 90) angle = 180 - angle;
    assert.ok(Math.abs(angle - 90) < 0.5, `drawn at ${angle}°`);
    // Major gridlines: the same spacing in px on both axes.
    const xs = [...markup.matchAll(/<line x1="([-\d.]+)" y1="48" x2="\1" y2="382" stroke="var\(--mm-graph-grid\)"/g)].map((match) => Number(match[1]));
    const ys = [...markup.matchAll(/<line x1="48" y1="([-\d.]+)" x2="572" y2="\1" stroke="var\(--mm-graph-grid\)"/g)].map((match) => Number(match[1]));
    assert.ok(xs.length > 2 && ys.length > 2, 'major gridlines found');
    assert.ok(Math.abs((xs[1] - xs[0]) - Math.abs(ys[1] - ys[0])) < 0.01, `x ${xs[1] - xs[0]}px, y ${Math.abs(ys[1] - ys[0])}px`);
  } finally {
    await server.close();
  }
});

test('an interactive plane: only its height follows the window', async () => {
  assert.equal(equalUnitPlaneHeight({ width: 560, pad: 42, xMin: -7, xMax: 7, yMin: -7, yMax: 7, fallback: 380 }), 560);
  assert.equal(equalUnitPlaneHeight({ width: 560, pad: 42, xMin: -10, xMax: 10, yMin: -5, yMax: 5, fallback: 380 }), 42 * 2 + 238);
  assert.equal(equalUnitPlaneHeight({ width: 560, pad: 42, xMin: -1, xMax: 1, yMin: -100, yMax: 100, fallback: 380 }), Math.round(476 * 1.5 + 84), 'capped');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: CoordinatePlane } = await server.ssrLoadModule('/src/tools/shared/CoordinatePlane.jsx');
    const plane = (props) => renderToStaticMarkup(React.createElement(CoordinatePlane, { xMin: -7, xMax: 7, yMin: -7, yMax: 7, onPlot: () => {}, enlargeable: false, ...props }));
    assert.match(plane({}), /viewBox="0 0 560 380"/, 'off by default');
    assert.match(plane({ equalUnits: true }), /viewBox="0 0 560 560"/);
  } finally {
    await server.close();
  }
  // Graphing reads the authored flag from its window; the window itself is
  // what it always passed.
  const graphing = readFileSync(new URL('../../src/tools/graphing2/Graphing2.jsx', import.meta.url), 'utf8');
  const call = graphing.slice(graphing.indexOf('<CoordinatePlane'), graphing.indexOf('/>', graphing.indexOf('<CoordinatePlane')));
  assert.match(call, /\{\.\.\.bounds\}/);
  assert.match(call, /equalUnits=\{bounds\.equalUnits === true\}/);
  // A workflow's feature-marking step shows the static step's own window, so
  // it draws it with equal units when the fit chose them.
  const stage = readFileSync(new URL('../../src/platform/workflow/GraphFeatureSelectStage.jsx', import.meta.url), 'utf8');
  assert.match(stage, /return fitStaticGraphViewport\(rawGraph\);/);
  const stagePlane = stage.slice(stage.indexOf('<CoordinatePlane'), stage.indexOf('/>', stage.indexOf('<CoordinatePlane')));
  assert.match(stagePlane, /equalUnits=\{graph\.equalUnits === true\}/);
});
