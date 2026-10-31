/*
 * "Fix the scale": an authored scale per axis, and the student's button
 * (student pass 3, R-9).
 *
 * "Things Aren't Always What They Seem" (Algebra 1 M2 T2 L3, PR 10) is about a
 * sketch whose x-axis counts by 2s and whose y-axis counts by 1s, on which two
 * lines that are NOT perpendicular look perpendicular. The lesson could only
 * describe that sketch and show the true, equal-scale graph. An author can now
 * write `axisScale: { x: 2, y: 1 }` and the figure is drawn that way, with a
 * "Fix the scale" button that redraws it on one scale for both axes.
 *
 * What these tests protect:
 *   - the sketch is really misleading (the lines meet at 90° on the screen) and
 *     really drawn on square squares that count the way the author wrote;
 *   - fixing the scale shows the true angle, and is only offered when it can;
 *   - nothing else moves: a figure with no authored scale, a host that draws a
 *     plane of its own shape, a locked window and a crop that hides an answer
 *     are framed exactly as before;
 *   - the author hears about a scale that could not be drawn as written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STATIC_GRAPH_PLOT_ASPECT,
  auditStaticGraphViewport,
  fitStaticGraphViewport,
  resolveAxisScale,
  staticGraphScaleViews,
} from '../../src/graphSpecUtils.js';
import { renderWorksheetVisual } from '../../src/platform/resources/assignmentWorksheetVisuals.js';

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr');

const lesson = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json', import.meta.url), 'utf8'));
const questions = lesson.sections.flatMap((section) => section.questions);
const PR10 = questions.find((question) => question.questionId === 'l3-pr-10');
const CW1 = questions.find((question) => question.questionId === 'l3-cw-1');

// Linh's lines a and d from the lesson, in a window that holds eleven squares
// or fewer at her scale, so the axes can be labelled by 2s and 1s.
const COMPACT_WINDOW = { xMin: -6, xMax: 10, yMin: -1, yMax: 5 };
const LINH = { ...PR10.graph, ...COMPACT_WINDOW, axisScale: { x: 2, y: 1 } };
const SLOPES = PR10.graph.functions.map((spec) => spec.m);

// The angle between two lines as the plot draws them: a unit of y is as long
// as the plot's height over the window's height, a unit of x likewise.
const angleBetween = (graph, [first, second]) => {
  const pixelsPerX = 524 / (graph.xMax - graph.xMin);
  const pixelsPerY = 334 / (graph.yMax - graph.yMin);
  const difference = Math.abs(Math.atan(first * pixelsPerY / pixelsPerX) - Math.atan(second * pixelsPerY / pixelsPerX)) * 180 / Math.PI;
  return difference > 90 ? 180 - difference : difference;
};
const squaresAcross = (graph) => (graph.xMax - graph.xMin) / graph.xStep;
const squaresUp = (graph) => (graph.yMax - graph.yMin) / graph.yStep;
const shows = (graph, [x, y]) => x >= graph.xMin && x <= graph.xMax && y >= graph.yMin && y <= graph.yMax;

test('the lesson still has the lines this test reads, and an authored scale needs a positive number on each axis', () => {
  assert.deepEqual(SLOPES, [0.5, -0.5], "Linh's lines a and d");
  assert.deepEqual(resolveAxisScale({ axisScale: { x: 2, y: 1 } }), { x: 2, y: 1 });
  assert.deepEqual(resolveAxisScale({ axisScale: { x: '2', y: 0.5 } }), { x: 2, y: 0.5 });
  [undefined, null, 5, 'x', [2, 1], {}, { x: 2 }, { y: 1 }, { x: 0, y: 1 }, { x: 2, y: -1 }, { x: 'two', y: 1 }, { x: Infinity, y: 1 }]
    .forEach((axisScale) => assert.equal(resolveAxisScale({ axisScale }), null, JSON.stringify(axisScale)));
  assert.equal(resolveAxisScale(null), null);
  assert.equal(resolveAxisScale(), null);
});

test("Linh's sketch: square squares that count by 2s across and 1s up, so two lines that are not perpendicular look it", () => {
  const sketch = fitStaticGraphViewport(LINH, { axisScale: true });
  assert.equal(sketch.axisScaleApplied, true);
  assert.deepEqual([sketch.xStep, sketch.yStep], [2, 1], 'the axes count the way the author wrote');
  // Graph paper has no half squares: gridlines sit on the labels only.
  assert.deepEqual([sketch.xMinorStep, sketch.yMinorStep], [2, 1]);
  assert.equal(sketch.equalUnits, undefined, 'not the equal-unit figure');
  assert.deepEqual(sketch.axisScale, { x: 2, y: 1 });
  // Square squares: as many across as the plot is wider than tall.
  assert.ok(Math.abs(squaresAcross(sketch) / squaresUp(sketch) - STATIC_GRAPH_PLOT_ASPECT) < 1e-4, `${squaresAcross(sketch)} across, ${squaresUp(sketch)} up`);
  assert.ok(squaresAcross(sketch) <= 11 && squaresUp(sketch) <= 11, 'every square can be labelled');
  // The point of the sketch: lines of slope 1/2 and -1/2 are drawn at 90°.
  assert.ok(Math.abs(angleBetween(sketch, SLOPES) - 90) < 0.01, `drawn at ${angleBetween(sketch, SLOPES)}°`);
  // And every marked point is in the picture.
  PR10.graph.points.forEach((point) => assert.ok(point.x > sketch.xMin && point.x < sketch.xMax && point.y > sketch.yMin && point.y < sketch.yMax, JSON.stringify(point)));
  // The author's own window is a minimum, as everywhere else.
  assert.ok(sketch.xMin <= COMPACT_WINDOW.xMin && sketch.xMax >= COMPACT_WINDOW.xMax && sketch.yMin <= COMPACT_WINDOW.yMin && sketch.yMax >= COMPACT_WINDOW.yMax);
});

test('the other way round, 1s across and 2s up, stretches the other axis', () => {
  const tall = fitStaticGraphViewport({ ...LINH, xMin: -4, xMax: 6, axisScale: { x: 1, y: 2 } }, { axisScale: true });
  assert.equal(tall.axisScaleApplied, true);
  assert.deepEqual([tall.xStep, tall.yStep], [1, 2]);
  assert.ok(Math.abs(squaresAcross(tall) / squaresUp(tall) - STATIC_GRAPH_PLOT_ASPECT) < 1e-4);
  // A unit of x is now twice as long as a unit of y, so the same two lines flatten.
  assert.ok(Math.abs(angleBetween(tall, SLOPES) - 2 * Math.atan(0.5 / 2) * 180 / Math.PI) < 0.01, `drawn at ${angleBetween(tall, SLOPES)}°`);
});

test('fixing the scale redraws the same figure on one scale for both axes, and the lines meet at their true angle', () => {
  const { scaled, fixed } = staticGraphScaleViews(LINH);
  assert.equal(scaled.axisScaleApplied, true);
  assert.ok(fixed, 'a figure with an unequal authored scale can be fixed');
  assert.equal(fixed.equalUnits, true);
  assert.equal(fixed.axisScaleApplied, undefined);
  assert.ok(Math.abs((fixed.xMax - fixed.xMin) / (fixed.yMax - fixed.yMin) - STATIC_GRAPH_PLOT_ASPECT) < 1e-4, 'one unit, both axes');
  const truth = 2 * Math.atan(0.5) * 180 / Math.PI; // 53.13°
  assert.ok(Math.abs(angleBetween(fixed, SLOPES) - truth) < 0.01, `drawn at ${angleBetween(fixed, SLOPES)}°`);
  assert.ok(angleBetween(fixed, SLOPES) < 60 && angleBetween(scaled, SLOPES) > 89.9, 'the button changes what the student sees');
  PR10.graph.points.forEach((point) => assert.ok(shows(fixed, [point.x, point.y]), `fixed view shows ${JSON.stringify(point)}`));
  // Fixing it does not touch the figure it was made from.
  assert.deepEqual(LINH.axisScale, { x: 2, y: 1 });
  // A host that draws a plot of another shape (the printed page) gets that shape, one unit both ways.
  const printed = staticGraphScaleViews(LINH, { plotAspect: 1.2 });
  assert.ok(Math.abs((printed.fixed.xMax - printed.fixed.xMin) / (printed.fixed.yMax - printed.fixed.yMin) - 1.2) < 1e-4);
  assert.ok(Math.abs((printed.scaled.xMax - printed.scaled.xMin) / printed.scaled.xStep / ((printed.scaled.yMax - printed.scaled.yMin) / printed.scaled.yStep) - 1.2) < 1e-4);
});

test('only a host that draws the static plot\'s own shape gets the scale; every other figure is framed exactly as before', () => {
  // The default: a plane of another shape would not make the squares square.
  const plain = fitStaticGraphViewport({ ...LINH, axisScale: undefined });
  const ignored = fitStaticGraphViewport(LINH);
  assert.equal(ignored.axisScaleApplied, undefined);
  assert.equal(ignored.xStep, undefined);
  assert.deepEqual([ignored.xMin, ignored.xMax, ignored.yMin, ignored.yMax, ignored.equalUnits], [plain.xMin, plain.xMax, plain.yMin, plain.yMax, plain.equalUnits]);
  // A figure with no scale is the same whether or not the host asks for one.
  const unscaled = [CW1.graph, PR10.graph, { xMin: -3, xMax: 9, functions: [{ type: 'quadratic', a: 1, b: 0, c: 0 }] }, { points: [[1, 2], [3, 4]] }, {}];
  unscaled.forEach((graph) => assert.deepEqual(fitStaticGraphViewport(graph, { axisScale: true }), fitStaticGraphViewport(graph), JSON.stringify(graph).slice(0, 60)));
  // Nor are its two views offered.
  unscaled.forEach((graph) => assert.equal(staticGraphScaleViews(graph).fixed, null));
  assert.deepEqual(staticGraphScaleViews(CW1.graph).scaled, fitStaticGraphViewport(CW1.graph, { axisScale: true }));
});

test('no button where there is nothing to fix, or the author did not want one', () => {
  const offered = (graph) => Boolean(staticGraphScaleViews(graph).fixed);
  assert.equal(offered(LINH), true);
  // The same scale on both axes: nothing to fix, but still drawn as written.
  const same = staticGraphScaleViews({ ...LINH, axisScale: { x: 2, y: 2 } });
  assert.equal(same.scaled.axisScaleApplied, true);
  assert.equal(same.fixed, null);
  assert.deepEqual([same.scaled.xStep, same.scaled.yStep], [2, 2]);
  // The student is meant to find the distortion unaided.
  const hidden = staticGraphScaleViews({ ...LINH, fixScaleToggle: false });
  assert.equal(hidden.scaled.axisScaleApplied, true, 'the sketch is still drawn');
  assert.equal(hidden.fixed, null);
  assert.equal(offered({ ...LINH, fixScaleToggle: true }), true);
  // A locked window is the author's frame, exactly.
  const locked = { ...LINH, lockViewport: true };
  assert.equal(fitStaticGraphViewport(locked, { axisScale: true }), locked);
  assert.equal(staticGraphScaleViews(locked).fixed, null);
  assert.equal(staticGraphScaleViews({ ...LINH, autoFit: false }).fixed, null);
  // A scale that is not usable is as if it were not written.
  assert.equal(staticGraphScaleViews({ ...LINH, axisScale: { x: 0, y: 1 } }).fixed, null);
  assert.equal(staticGraphScaleViews({ ...LINH, axisScale: { x: 0, y: 1 } }).scaled.axisScaleApplied, undefined);
});

test('a crop that hides an answer stays hidden, by the scaled view and by the fixed one', () => {
  // Lines meeting at (7, 7), outside the authored x-range: an author who crops
  // a system so it must be solved algebraically must not have the sketch show it.
  const cropped = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'line', m: 1, b: 0 }, { type: 'line', m: -1, b: 14 }], axisScale: { x: 2, y: 1 } };
  const views = staticGraphScaleViews(cropped);
  assert.equal(views.scaled.axisScaleApplied, undefined, 'the scale cannot be drawn without showing it, so the ordinary fit is kept');
  assert.equal(shows(views.scaled, [7, 7]), false);
  assert.equal(views.fixed, null);
  assert.deepEqual([views.scaled.xMin, views.scaled.xMax], [-5, 5]);

  // Counting by 0.2 across makes the scaled window narrow, so the sketch is safe;
  // the true picture (the "fixed" view) is far wider and would show (12, 6).
  const meets = { xMin: -3, xMax: 3, yMin: -20, yMax: 20, functions: [{ type: 'line', m: 0.5, b: 0 }, { type: 'line', m: -0.25, b: 9 }], axisScale: { x: 0.2, y: 1 } };
  const narrow = staticGraphScaleViews(meets);
  assert.equal(narrow.scaled.axisScaleApplied, true);
  assert.equal(shows(narrow.scaled, [12, 6]), false, 'the sketch keeps the answer out');
  // Asked for equal units, the fitter refuses and keeps the authored x-range
  // (the graph it hands back still carries the flag it was given).
  const refused = fitStaticGraphViewport({ ...meets, axisScale: undefined, equalUnits: true });
  assert.deepEqual([refused.xMin, refused.xMax], [-3, 3]);
  assert.equal(shows(refused, [12, 6]), false);
  assert.equal(narrow.fixed, null, 'so the button is not offered, because it would not fix anything');
});

test('a window with more squares than an axis can label keeps the ratio between the axes', () => {
  // The lesson\'s own window, -10 to 10 by -5 to 5, holds sixteen squares across.
  const roomy = fitStaticGraphViewport({ ...LINH, xMin: -10, xMax: 10, yMin: -5, yMax: 5 }, { axisScale: true });
  assert.equal(roomy.axisScaleApplied, true);
  assert.deepEqual([roomy.xStep, roomy.yStep], [4, 2], 'both steps grow by the same whole number');
  assert.equal(roomy.xStep / roomy.yStep, 2, 'the ratio is the one the author wrote');
  assert.ok(squaresAcross(roomy) <= 11 && squaresUp(roomy) <= 11);
  assert.ok(Math.abs(angleBetween(roomy, SLOPES) - 90) < 0.01, 'still the misleading picture');
  // A scale written as a long decimal is kept exactly while nothing is thinned: no
  // false "labels were thinned" warning for counting by thirds.
  const thirds = { xMin: -2, xMax: 3, yMin: -0.5, yMax: 1.5, points: [[0, 0]], axisScale: { x: 2 / 3, y: 1 / 3 } };
  const thirdsFit = fitStaticGraphViewport(thirds, { axisScale: true });
  assert.deepEqual([thirdsFit.xStep, thirdsFit.yStep], [2 / 3, 1 / 3]);
  assert.deepEqual(auditStaticGraphViewport(thirds, { label: 'graph' }).warnings, []);
  // Fractions grow by whole numbers too.
  const small = fitStaticGraphViewport({ ...LINH, axisScale: { x: 0.5, y: 0.25 } }, { axisScale: true });
  assert.equal(small.xStep / small.yStep, 2);
  assert.ok(squaresAcross(small) <= 11 && squaresUp(small) <= 11);
  // Eleven squares is the most an axis labels, so nothing is thinned; a half square more is.
  const window = (squares) => ({ xMin: -squares / 2, xMax: squares / 2, yMin: -squares / 2 / STATIC_GRAPH_PLOT_ASPECT, yMax: squares / 2 / STATIC_GRAPH_PLOT_ASPECT, points: [[0, 0]], axisScale: { x: 1, y: 1 } });
  const eleven = fitStaticGraphViewport(window(11), { axisScale: true });
  assert.deepEqual([eleven.xStep, eleven.yStep], [1, 1]);
  const elevenAndAHalf = fitStaticGraphViewport(window(11.5), { axisScale: true });
  assert.deepEqual([elevenAndAHalf.xStep, elevenAndAHalf.yStep], [2, 2]);
});

test('Pre-Flight says when a scale could not be drawn as written, and is quiet when it can', () => {
  const warningsFor = (graph) => auditStaticGraphViewport(graph, { label: 'graph' });
  assert.deepEqual(warningsFor(LINH), { errors: [], warnings: [] });
  // The steep line of a pair leaves the window on purpose, as with equal units.
  assert.deepEqual(warningsFor({ xMin: -2, xMax: 2, yMin: -2, yMax: 2, axisScale: { x: 2, y: 1 }, functions: [{ type: 'line', m: 0.1, b: 0 }, { type: 'line', m: -10, b: 0 }] }).warnings, []);
  // No scale written: nothing to say.
  assert.deepEqual(warningsFor({ ...LINH, axisScale: undefined }).warnings, []);
  assert.deepEqual(warningsFor({ ...LINH, axisScale: null }).warnings, []);

  const unusable = warningsFor({ ...LINH, axisScale: { x: 0, y: 1 } });
  assert.deepEqual(unusable.errors, []);
  assert.match(unusable.warnings.join('\n'), /graph\.axisScale needs a positive number for both x and y.*ignored/);

  const locked = warningsFor({ ...LINH, lockViewport: true });
  assert.deepEqual(locked.errors, []);
  assert.match(locked.warnings.join('\n'), /graph\.axisScale is not used while the viewport is locked/);

  const cropped = warningsFor({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'line', m: 1, b: 0 }, { type: 'line', m: -1, b: 14 }], axisScale: { x: 2, y: 1 } });
  assert.deepEqual(cropped.errors, []);
  assert.match(cropped.warnings.join('\n'), /graph\.axisScale was not applied.*where two lines meet outside xMin to xMax/);

  const roomy = warningsFor({ ...LINH, xMin: -10, xMax: 10, yMin: -5, yMax: 5 });
  assert.deepEqual(roomy.errors, []);
  assert.match(roomy.warnings.join('\n'), /graph\.axisScale counts by 2 and 1, but .* labelled by 4 and 2\. Narrow the window/);
  assert.equal(roomy.warnings.length, 1);
});

// ---------------------------------------------------------------- what is drawn

const axisLabels = (markup) => ({
  x: [...markup.matchAll(/<text[^>]*text-anchor="middle"[^>]*font-size="12"[^>]*>(-?[\d.]+)<\/text>/g)].map((match) => Number(match[1])),
  y: [...markup.matchAll(/<text[^>]*text-anchor="end"[^>]*font-size="12"[^>]*>(-?[\d.]+)<\/text>/g)].map((match) => Number(match[1])),
});
const lineAngle = (markup) => {
  const directions = (markup.match(/<path\b[^>]*stroke-linecap="round"[^>]*>/g) || [])
    .map((tag) => tag.match(/\sd="M\s*([-\d.]+)[ ,]([-\d.]+)\s*L\s*([-\d.]+)[ ,]([-\d.]+)/))
    .map(([, x1, y1, x2, y2]) => Math.atan2(-(Number(y2) - Number(y1)), Number(x2) - Number(x1)));
  assert.equal(directions.length, 2, 'two lines drawn');
  let angle = Math.abs(directions[0] - directions[1]) * 180 / Math.PI;
  if (angle > 90) angle = 180 - angle;
  return angle;
};

test('GraphDisplay draws the sketch at a right angle, labelled by 2s and 1s, with the button and the line that says so', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: VITE_CACHE });
  try {
    const { default: GraphDisplay } = await server.ssrLoadModule('/src/GraphDisplay.jsx');
    const render = (graph) => renderToStaticMarkup(React.createElement(GraphDisplay, { graph, enlargeable: false }));

    const markup = render(LINH);
    assert.ok(Math.abs(lineAngle(markup) - 90) < 0.5, `drawn at ${lineAngle(markup)}°`);
    const labels = axisLabels(markup);
    assert.ok(labels.x.length > 4 && labels.y.length > 3, 'both axes are labelled');
    labels.x.forEach((value) => assert.ok(value % 2 === 0, `x counts by 2s: ${value}`));
    // y counts by 1s: every whole number in its range is labelled (0 is the axis itself).
    const ys = [...labels.y].sort((first, second) => first - second);
    const everyNumber = Array.from({ length: ys[ys.length - 1] - ys[0] + 1 }, (_, index) => ys[0] + index).filter((value) => value !== 0);
    assert.deepEqual(ys, everyNumber);
    assert.ok(ys.length >= 5);
    // The squares are square: the same distance between neighbouring gridlines both ways.
    const columns = [...markup.matchAll(/<line x1="([-\d.]+)" y1="48" x2="\1" y2="382" stroke="var\(--mm-graph-grid\)"/g)].map((match) => Number(match[1]));
    const rows = [...markup.matchAll(/<line x1="48" y1="([-\d.]+)" x2="572" y2="\1" stroke="var\(--mm-graph-grid\)"/g)].map((match) => Number(match[1]));
    assert.ok(columns.length > 4 && rows.length > 3);
    assert.ok(Math.abs((columns[1] - columns[0]) - Math.abs(rows[1] - rows[0])) < 0.01, `${columns[1] - columns[0]}px across, ${Math.abs(rows[1] - rows[0])}px up`);
    // No half squares between the labelled ones.
    assert.equal(markup.includes('var(--mm-graph-grid-minor)'), false);
    // Drawn inside the plot, the way an equal-unit window is.
    const clip = markup.match(/<clipPath id="([^"]+)"><rect x="48" y="48" width="524" height="334"><\/rect><\/clipPath>/);
    assert.ok(clip, 'a clip to the plot area');
    // The control: the line that says what the axes count by, and the button.
    assert.match(markup, /data-scale-control/);
    assert.match(markup, /<span role="status" data-scale-caption="" [^>]*>The x-axis counts by 2s and the y-axis counts by 1s\.<\/span>/);
    assert.match(markup, /<button type="button" [^>]*>Fix the scale<\/button>/);

    // The window drawn is the one the shared fitter frames, which is the window
    // Pre-Flight measures: a marked point sits exactly where that window puts it.
    const CW2 = questions.find((question) => question.questionId === 'l3-cw-2');
    const markedPixels = (html) => [...html.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="5" fill="#d93025"/g)].map((match) => [Number(match[1]), Number(match[2])]);
    const where = (frame, point) => [48 + ((point.x - frame.xMin) / (frame.xMax - frame.xMin)) * 524, 48 + ((frame.yMax - point.y) / (frame.yMax - frame.yMin)) * 334];
    [[LINH, fitStaticGraphViewport(LINH, { axisScale: true })], [CW1.graph, fitStaticGraphViewport(CW1.graph)], [CW2.graph, fitStaticGraphViewport(CW2.graph)]].forEach(([graph, frame]) => {
      const drawn = markedPixels(render(graph));
      assert.equal(drawn.length, graph.points.length);
      graph.points.forEach((point, index) => {
        const [x, y] = where(frame, point);
        assert.ok(Math.abs(drawn[index][0] - x) < 0.01 && Math.abs(drawn[index][1] - y) < 0.01, `${JSON.stringify(point)} drawn at ${drawn[index]}, the fitter's window puts it at ${[x, y]}`);
      });
    });

    // No button when the author did not want one, but the same drawing.
    const withoutButton = render({ ...LINH, fixScaleToggle: false });
    assert.equal(withoutButton.includes('data-scale-control'), false);
    assert.ok(Math.abs(lineAngle(withoutButton) - 90) < 0.5);
    // Nor for an ordinary figure, which is drawn as it always was (equal units).
    const ordinary = render(CW1.graph);
    assert.equal(ordinary.includes('data-scale-control'), false);
    assert.ok(Math.abs(lineAngle(ordinary) - 90) < 0.5);
  } finally {
    await server.close();
  }
});

// A DOM just big enough for the worksheet renderer, which builds its SVG by hand.
const fakeDocument = () => {
  const element = (tag) => ({
    tag, attributes: {}, children: [], style: {}, textContent: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
  });
  return { createElement: element, createElementNS: (_ns, tag) => element(tag), createTextNode: (text) => ({ tag: '#text', textContent: text, children: [] }) };
};
const findAll = (node, tag, found = []) => {
  if (!node) return found;
  if (node.tag === tag) found.push(node);
  (node.children || []).forEach((child) => findAll(child, tag, found));
  return found;
};

test("on paper the sketch is printed as the author wrote it: labelled by 2s and 1s, and its lines stop at the plot's edge", () => {
  const previous = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const visual = renderWorksheetVisual({ kind: 'graph', graph: LINH, label: "Linh's sketch" });
    const labels = findAll(visual, 'text').map((node) => node.textContent).filter((text) => /^-?\d+$/.test(String(text))).map(Number);
    assert.ok(labels.length > 6, 'tick labels are printed');
    // Gridlines: neighbouring x lines are twice as many units apart as y lines.
    const columns = findAll(visual, 'line').filter((node) => node.attributes.x1 === node.attributes.x2 && node.attributes.stroke === '#e8eaed').map((node) => Number(node.attributes.x1));
    const rows = findAll(visual, 'line').filter((node) => node.attributes.y1 === node.attributes.y2 && node.attributes.stroke === '#e8eaed').map((node) => Number(node.attributes.y1));
    assert.ok(columns.length > 4 && rows.length > 3);
    assert.ok(Math.abs((columns[1] - columns[0]) - Math.abs(rows[1] - rows[0])) < 0.01, 'square squares on paper too');
    const clip = findAll(visual, 'clipPath');
    assert.equal(clip.length, 1, 'one clip for the plot');
    const lines = findAll(visual, 'path').filter((path) => path.attributes.stroke === '#1a73e8');
    assert.equal(lines.length, 2);
    lines.forEach((path) => assert.equal(path.attributes['clip-path'], `url(#${clip[0].attributes.id})`));
  } finally {
    globalThis.document = previous;
  }
});
