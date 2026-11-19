/*
 * A PLANE'S NAMES ARE PLACED AGAIN ONLY WHEN WHAT THEY ARE PLACED AMONG CHANGES
 * (src/platform/graph/curveLabelPlacer.js, curveLabels.js).
 *
 * The graph workspace building an inverse rendered on every pointer move over its board, a system question's figure
 * on every key typed in its answer box, and each render placed the names again, measuring a hundred places against
 * paths of 500 points and more: in Chromium about 10 ms a move and 12 a key, 40 to 50 at a Chromebook's speed (4x
 * CPU), close to half the work of each. Now each plane keeps a placer that places them again only when an input
 * changes, and the placement keeps only the points that shape a curve: a line is its two ends.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCurveLabelPlacer } from '../../src/platform/graph/curveLabelPlacer.js';
import { placeCurveLabels, sampleFunctionRuns, thinRun } from '../../src/platform/graph/curveLabels.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// A 560 × 380 plane with a 42-unit border, x and y from −8 to 8, as CoordinatePlane draws one.
const PLOT = { left: 42, right: 518, top: 42, bottom: 338 };
const view = { xMin: -8, xMax: 8, yMin: -8, yMax: 8 };
const sx = (x) => PLOT.left + ((x - view.xMin) / (view.xMax - view.xMin)) * (PLOT.right - PLOT.left);
const sy = (y) => PLOT.bottom - ((y - view.yMin) / (view.yMax - view.yMin)) * (PLOT.bottom - PLOT.top);
const AXES = [{ label: '', paths: [[[sx(0), PLOT.top], [sx(0), PLOT.bottom]]] }, { label: '', paths: [[[PLOT.left, sy(0)], [PLOT.right, sy(0)]]] }];

// What a plane hands its placer on one render: built afresh each time, as every render builds it.
const inputsOf = ({ dots = [[1, 3]], hidden = [], unit = 0, f = (x) => 2 * x + 1 } = {}) => ({
  curves: [
    { label: 'f', paths: sampleFunctionRuns(f, { ...view, sx, sy, samples: 500 }) },
    { label: 'f⁻¹', paths: sampleFunctionRuns((x) => (x - 1) / 2, { ...view, sx, sy, samples: 500 }) },
    { label: 'y = x', paths: [[[sx(-8), sy(-8)], [sx(8), sy(8)]]] },
    ...AXES,
  ],
  dots: dots.map(([x, y]) => ({ x: sx(x), y: sy(y), radius: 11 })),
  avoid: [{ left: sx(1) + 8, right: sx(1) + 90, top: sy(3) - 29, bottom: sy(3) - 7 }],
  hidden,
  bounds: PLOT,
  textSize: 14,
  gap: 6,
  unit,
});

test('a pointer move or a key renders the plane again, and its names are not placed again', () => {
  const placements = [];
  const place = createCurveLabelPlacer((inputs) => { placements.push(inputs); return placeCurveLabels(inputs); });
  const first = place(inputsOf());
  // Sixty renders, as sixty pointer moves over the board or ten keys and their deletions make: the same plane.
  for (let render = 0; render < 60; render += 1) assert.equal(place(inputsOf()), first, `render ${render}: the same places`);
  assert.equal(placements.length, 1, 'placed once');
  assert.deepEqual(first, placeCurveLabels(inputsOf()), 'the places the placement gives');
  // What the names are placed among changes: placed again, once for each change.
  const changes = [
    ['a point placed', { dots: [[1, 3], [3, 1]] }],
    ['Work View\'s opener over the plot', { dots: [[1, 3], [3, 1]], hidden: [{ left: 440, right: 520, top: 30, bottom: 70 }] }],
    ['the plane drawn smaller', { dots: [[1, 3], [3, 1]], hidden: [{ left: 440, right: 520, top: 30, bottom: 70 }], unit: 2.5 }],
    ['the curve drawn again', { dots: [[1, 3], [3, 1]], hidden: [{ left: 440, right: 520, top: 30, bottom: 70 }], unit: 2.5, f: (x) => 2 * x + 2 }],
  ];
  changes.forEach(([change, options], index) => {
    const spots = place(inputsOf(options));
    assert.equal(placements.length, index + 2, `${change}: placed again`);
    assert.deepEqual(spots, placeCurveLabels(inputsOf(options)), `${change}: as the placement places it`);
    assert.equal(place(inputsOf(options)), spots, `${change}: and then kept`);
  });
});

test('the graph workspace, a figure and the shared plane each place their names through a placer of their own', () => {
  // A figure: one placer for its life, made before anything returns, and its names placed through it.
  const figure = executableSource(read('src/GraphDisplay.jsx'));
  assert.match(region(figure, 'const svgRef = useRef(null);', 'if (!graph) return null;', 'the figure\'s hooks'), /const placeNames = useCurveLabelPlacer\(\);/);
  assert.match(figure, /const curveNameSpots = functions\.some\(curveName\) \? placeNames\(\{/);
  assert.doesNotMatch(figure, /placeCurveLabels\(/, 'never the placement itself, on every render');
  // The graph workspace: its board's placer, handed to inverseCurveNames, which places through it.
  const board = executableSource(read('src/InteractiveGraphWorkspace.jsx'));
  assert.match(board, /const placeCurveNames = useCurveLabelPlacer\(\);/);
  assert.match(region(board, 'const curveNames = inverseCurveNames({', '\n  });', 'the names on the board'), /\n    place: placeCurveNames,\n/);
  assert.match(region(board, 'export const inverseCurveNames', '\n};', 'inverseCurveNames'), /const spots = place\(\{/);
  // The shared plane, whose readout follows the pointer of a tool that plots.
  const plane = executableSource(read('src/tools/shared/CoordinatePlane.jsx'));
  assert.match(plane, /const placeNames = useCurveLabelPlacer\(\);/);
  assert.match(plane, /const curveLabelSpots = curveNamed \? placeNames\(\{/);
  assert.doesNotMatch(plane, /placeCurveLabels\(/);
  // The placer is the plane's for its life: made once, from its first render.
  assert.match(executableSource(read('src/platform/graph/curveLabelPlacer.js')), /export const useCurveLabelPlacer = \(\) => useState\(\(\) => createCurveLabelPlacer\(\)\)\[0\];/);
});

const distanceToRun = ([px, py], run) => Math.min(...run.slice(1).map((b, i) => {
  const a = run[i];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1)));
  return Math.hypot(px - (a[0] + t * (b[0] - a[0])), py - (a[1] + t * (b[1] - a[1])));
}));

test('a curve keeps the points that shape it: a line its two ends, a curve or a stroke under 50, none left out more than half a unit away', () => {
  const [line] = sampleFunctionRuns((x) => 0.5 * x - 1, { ...view, sx, sy, samples: 500 });
  assert.deepEqual(thinRun(line), [line[0], line[line.length - 1]], 'a line of 501 points: its two ends');
  const curves = [
    ['a parabola', sampleFunctionRuns((x) => 0.4 * x * x - 6, { ...view, sx, sy, samples: 560 })[0]],
    ['an exponential', sampleFunctionRuns((x) => 2 ** x, { ...view, sx, sy, samples: 560 })[0]],
    // A stroke drawn by hand: a point every 3 units, wobbling a unit either way.
    ['a stroke', Array.from({ length: 160 }, (_, i) => [PLOT.left + 3 * i, sy(Math.sin(i / 25) * 5) + Math.sin(i * 2.3) * 1.2])],
  ];
  for (const [kind, run] of curves) {
    const thinned = thinRun(run);
    assert.ok(thinned.length <= 48, `${kind}: ${run.length} points kept as ${thinned.length}`);
    assert.deepEqual([thinned[0], thinned[thinned.length - 1]], [run[0], run[run.length - 1]], `${kind}: its ends kept`);
    const away = Math.max(...run.map((point) => distanceToRun(point, thinned)));
    if (kind !== 'a stroke') assert.ok(away <= 0.5, `${kind}: a point left out ${away.toFixed(2)} units away`);
    else assert.ok(away < 2, `${kind}: its wobble, ${away.toFixed(2)} units, is what goes`);
  }
});

test('placed from a line drawn from 501 points or from its two ends, every generated system\'s names are where they were', () => {
  // The system generator's lines at the colour-alone page's settings and at its defaults, on this plane: a line as a
  // figure samples it (501 points, GraphDisplay.jsx) and as its two ends give the same places. Thinning moves no name.
  const ends = (m, b) => [[[sx(-8), sy(m * -8 + b)], [sx(8), sy(m * 8 + b)]]];
  const sampled = (m, b) => sampleFunctionRuns((x) => m * x + b, { ...view, sx, sy, samples: 500 });
  let names = 0;
  for (const generator of [{ kind: 'linearSystem', xRange: [-5, 5], yRange: [-5, 5], slopeChoices: [-3, -2, -1, 1, 2, 3] }, { kind: 'linearSystem' }]) {
    for (let n = 1; n <= 40; n += 1) {
      const { graph, equationsLatex } = generateQuestion({ questionId: 'q', type: 'system', prompt: 'Solve.', showEquations: true, showGraph: true, generator }, `review|student|${n}|variant:0`);
      const plane = (draw) => ({ curves: [...graph.functions.map((spec, index) => ({ label: equationsLatex[index], paths: draw(spec.m, spec.b) })), ...AXES], bounds: PLOT, textSize: 14 });
      const fromEnds = placeCurveLabels(plane(ends));
      const fromSamples = placeCurveLabels(plane(sampled));
      // Lines that leave the window draw nothing to name, on both.
      fromEnds.forEach((spot, index) => {
        if (!spot) return;
        names += 1;
        assert.ok(Math.hypot(spot.cx - fromSamples[index].cx, spot.cy - fromSamples[index].cy) < 1e-6, `review|student|${n}: "${equationsLatex[index]}" moved`);
      });
    }
  }
  assert.ok(names > 120, `${names} names compared`);
});

test('a line drawn within half a unit of straight is measured as the straight line: its names are where the line\'s are', () => {
  // A line's 501 points, those between its ends each a little off it (a stroke's wobble, a sampling's rounding): the
  // placement measures the two ends it keeps, so the names go exactly where they go beside the straight line.
  const wobbly = (m, b) => [Array.from({ length: 501 }, (_, i) => {
    const x = -8 + (16 * i) / 500;
    return [sx(x), sy(m * x + b) + (i % 500 ? 0.3 * Math.sin(i * 1.7) : 0)];
  })];
  const straight = (m, b) => [[[sx(-8), sy(m * -8 + b)], [sx(8), sy(m * 8 + b)]]];
  // Lines that cross the whole window, so each run ends where the line does.
  for (const [first, second] of [[[0.5, 1, 'f'], [-0.5, 3, 'g']], [[0.75, 1, 'y = 0.75x + 1'], [-0.5, -2, 'y = −0.5x − 2']]]) {
    const plane = (draw) => ({ curves: [{ label: first[2], paths: draw(first[0], first[1]) }, { label: second[2], paths: draw(second[0], second[1]) }, ...AXES], bounds: PLOT, textSize: 12 });
    const drawn = placeCurveLabels(plane(wobbly));
    placeCurveLabels(plane(straight)).forEach((spot, index) => {
      if (index > 1) return;
      assert.ok(Math.hypot(spot.cx - drawn[index].cx, spot.cy - drawn[index].cy) < 1e-6, `${[first, second][index][2]}: ${JSON.stringify([spot.cx, spot.cy])} beside the straight line, ${JSON.stringify([drawn[index].cx, drawn[index].cy])} beside the drawn one`);
    });
  }
});
