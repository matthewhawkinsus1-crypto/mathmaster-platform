/*
 * A CURVE'S NAME GOES BESIDE ITS OWN CURVE (WCAG 1.4.1; src/platform/graph/curveLabels.js).
 *
 * Where two lines differ only by colour (f and y = x, a curve and its inverse, two solid boundaries), each is named
 * on the plane. A name is only a cue if it is read as its own curve's: so it sits nearer its own curve than any
 * other, covers no point, no other name and no axis number, crosses no line, and stays inside the plot. These hold
 * the placement to that on the planes the tools draw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { curveLabelSize, placeCurveLabels, sampleFunctionRuns, visibleRuns } from '../../src/platform/graph/curveLabels.js';

// A 560 × 380 plane with a 42-unit border, x and y from −8 to 8, as CoordinatePlane draws one.
const PLOT = { left: 42, right: 518, top: 42, bottom: 338 };
const view = { xMin: -8, xMax: 8, yMin: -8, yMax: 8 };
const sx = (x) => PLOT.left + ((x - view.xMin) / (view.xMax - view.xMin)) * (PLOT.right - PLOT.left);
const sy = (y) => PLOT.bottom - ((y - view.yMin) / (view.yMax - view.yMin)) * (PLOT.bottom - PLOT.top);
const runsOf = (fn) => sampleFunctionRuns(fn, { ...view, sx, sy });
const line = (m, b) => [[[sx(-8), sy(m * -8 + b)], [sx(8), sy(m * 8 + b)]]];

const distanceTo = ([px, py], runs) => Math.min(...runs.flatMap((run) => run.slice(1).map((b, i) => {
  const a = run[i];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
})));
const overlaps = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
const inside = (box, bounds) => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
const dotBox = (dot) => ({ left: dot.x - dot.radius, right: dot.x + dot.radius, top: dot.y - dot.radius, bottom: dot.y + dot.radius });

// The Inverse & Composition Lab's plane: f, its inverse and the mirror line, with the point and its swap.
const inversePlane = () => {
  const f = (x) => 2 * x + 1;
  const inverse = (x) => (x - 1) / 2;
  const curves = [
    { label: 'f', paths: runsOf(f) },
    { label: 'f⁻¹', paths: runsOf(inverse) },
    { label: 'y = x', paths: line(1, 0) },
    // The axes: kept clear of, never named.
    { label: '', paths: [[[sx(0), PLOT.top], [sx(0), PLOT.bottom]]] },
    { label: '', paths: [[[PLOT.left, sy(0)], [PLOT.right, sy(0)]]] },
  ];
  const dots = [{ x: sx(1), y: sy(3), radius: 8 }, { x: sx(3), y: sy(1), radius: 8 }];
  return { curves, dots };
};

test('each name is nearer its own curve than any other, inside the plot, and covers no point or other name', () => {
  const { curves, dots } = inversePlane();
  const spots = placeCurveLabels({ curves, dots, bounds: PLOT, textSize: 12 });
  const named = curves.map((curve, index) => ({ curve, spot: spots[index] })).filter(({ curve }) => curve.label);
  assert.equal(named.length, 3);
  for (const { curve, spot } of named) {
    assert.ok(spot, `${curve.label} has a place`);
    const centre = [spot.cx, spot.cy];
    const own = distanceTo(centre, curve.paths);
    for (const other of curves.filter((entry) => entry !== curve)) {
      assert.ok(distanceTo(centre, other.paths) > own * 1.5, `${curve.label} is nearer its own curve (${own.toFixed(1)}) than ${other.label || 'an axis'} (${distanceTo(centre, other.paths).toFixed(1)})`);
    }
    assert.ok(inside(spot.box, PLOT), `${curve.label} inside the plot`);
    for (const dot of dots) assert.ok(!overlaps(spot.box, dotBox(dot)), `${curve.label} covers no point`);
    for (const { curve: other, spot: otherSpot } of named) {
      if (other !== curve) assert.ok(!overlaps(spot.box, otherSpot.box), `${curve.label} covers no other name (${other.label})`);
    }
    // It crosses no line: its box is clear of every curve, its own too.
    for (const entry of curves) {
      const crossing = visibleRuns(entry.paths, spot.box).length > 0;
      assert.ok(!crossing, `${curve.label}'s name is crossed by ${entry.label || 'an axis'}`);
    }
  }
});

test('a name keeps clear of the axes\' numbers and moves off a crowded end', () => {
  const { curves } = inversePlane();
  const first = placeCurveLabels({ curves, bounds: PLOT, textSize: 12 });
  // Put an axis number exactly where y = x's name went: it moves, and still sits by its own line.
  const at = first[2].box;
  const second = placeCurveLabels({ curves, avoid: [at], bounds: PLOT, textSize: 12 });
  assert.ok(!overlaps(second[2].box, at), 'off the number');
  assert.ok(distanceTo([second[2].cx, second[2].cy], curves[2].paths) < 20, 'and still beside y = x');
});

test('a name moves off a point that sits where it would go, and stays beside its own line', () => {
  const { curves } = inversePlane();
  const first = placeCurveLabels({ curves, bounds: PLOT, textSize: 12 });
  // A point exactly where y = x's name went first.
  const dot = { x: first[2].cx, y: first[2].cy, radius: 6 };
  const second = placeCurveLabels({ curves, dots: [dot], bounds: PLOT, textSize: 12 });
  assert.ok(!overlaps(second[2].box, dotBox(dot)), 'off the point');
  assert.ok(distanceTo([second[2].cx, second[2].cy], curves[2].paths) < 20, 'and still beside y = x');
});

test('between two lines close together, each name goes on its own line\'s far side, never between them', () => {
  // Two parallel lines about 25 units apart on the plane: a name between them would sit nearer the other.
  for (const [upper, lower] of [['f', 'g'], ['g', 'f']]) {
    const curves = [{ label: upper, paths: line(1, 1.6) }, { label: lower, paths: line(1, 0) }];
    const spots = placeCurveLabels({ curves, bounds: PLOT, textSize: 12 });
    spots.forEach((spot, index) => {
      const own = distanceTo([spot.cx, spot.cy], curves[index].paths);
      const other = distanceTo([spot.cx, spot.cy], curves[1 - index].paths);
      assert.ok(other > own * 1.5, `${curves[index].label} (${upper} above): ${own.toFixed(1)} from its own line, ${other.toFixed(1)} from the other`);
    });
  }
});

test('only a named curve in view gets a place; the same plane gives the same places', () => {
  const { curves, dots } = inversePlane();
  const spots = placeCurveLabels({ curves, dots, bounds: PLOT, textSize: 12 });
  assert.equal(spots[3], null, 'an axis is kept clear of, never named');
  const offscreen = placeCurveLabels({ curves: [{ label: 'g', paths: line(0, 40) }], bounds: PLOT, textSize: 12 });
  assert.deepEqual(offscreen, [null], 'a curve the window does not show has no name drawn');
  assert.deepEqual(placeCurveLabels({ curves, dots, bounds: PLOT, textSize: 12 }), spots, 'deterministic');
});

test('a ringed name (a constraint\'s number) takes a square box, larger than its digit', () => {
  const text = curveLabelSize({ label: '2', textSize: 12 });
  const ring = curveLabelSize({ label: '2', textSize: 12, tag: true });
  assert.equal(ring.width, ring.height);
  assert.ok(ring.width > text.width && ring.height > text.height);
  // Two solid boundaries of a system, each ringed: both placed, each by its own line.
  const curves = [{ label: '1', tag: true, paths: line(1, 1) }, { label: '2', tag: true, paths: line(-0.5, 6) }];
  const spots = placeCurveLabels({ curves, bounds: PLOT, textSize: 12 });
  spots.forEach((spot, index) => {
    assert.ok(spot && inside(spot.box, PLOT));
    assert.ok(distanceTo([spot.cx, spot.cy], curves[index].paths) < distanceTo([spot.cx, spot.cy], curves[1 - index].paths));
  });
});

test('a curve is sampled in runs that break where it leaves the window or jumps across an asymptote', () => {
  const runs = runsOf((x) => 1 / x);
  assert.ok(runs.length >= 2, `1/x is two runs (${runs.length})`);
  // No run joins the two branches: none passes from far below to far above.
  for (const run of runs) {
    const ys = run.map(([, y]) => y);
    assert.ok(Math.max(...ys) - Math.min(...ys) < (PLOT.bottom - PLOT.top) * 3, 'no vertical join');
  }
  assert.deepEqual(runsOf(() => Number.NaN), [], 'nothing drawn, nothing named');
});
