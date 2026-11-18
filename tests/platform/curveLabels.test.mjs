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

// The axes, kept clear of and never named, as every plane passes them.
const AXES = [{ label: '', paths: [[[sx(0), PLOT.top], [sx(0), PLOT.bottom]]] }, { label: '', paths: [[[PLOT.left, sy(0)], [PLOT.right, sy(0)]]] }];
// What lies between a name and its own curve: every other curve (an axis too) crossing the straight way from the
// name's middle to the nearest point of its own.
const turn = (u, v, w) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
const between = (spot, own, others) => {
  let nearest = null;
  for (const run of own) {
    run.slice(1).forEach((b, i) => {
      const a = run[i];
      const t = Math.max(0, Math.min(1, ((spot.cx - a[0]) * (b[0] - a[0]) + (spot.cy - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1)));
      const at = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      if (!nearest || Math.hypot(spot.cx - at[0], spot.cy - at[1]) < nearest.away) nearest = { at, away: Math.hypot(spot.cx - at[0], spot.cy - at[1]) };
    });
  }
  const p = [spot.cx, spot.cy];
  return others.filter((other) => other.paths.some((run) => run.slice(1).some((b, i) => {
    const a = run[i];
    return turn(p, nearest.at, a) * turn(p, nearest.at, b) < 0 && turn(a, b, p) * turn(a, b, nearest.at) < 0;
  }))).map((other) => other.label || 'an axis');
};

test('a name is never put nearer another named line than its own while a place nearer its own is left', () => {
  // f (y = 2) and g (y = 1) one unit apart, everything on f's far side under a control drawn over the plane: every
  // place left in sight is nearer g, and the cost alone took one, below f and 8.6 units from g, 9.9 from f. Read as
  // g's name, it says the wrong thing; under the control it says nothing.
  const curves = [{ label: 'f', paths: line(0, 2) }, { label: 'g', paths: line(0, 1) }, ...AXES];
  const hidden = [{ left: PLOT.left - 10, right: PLOT.right + 10, top: PLOT.top - 10, bottom: sy(2) }];
  const [f] = placeCurveLabels({ curves, hidden, bounds: PLOT, textSize: 12 });
  const own = distanceTo([f.cx, f.cy], curves[0].paths);
  const other = distanceTo([f.cx, f.cy], curves[1].paths);
  assert.ok(own < other, `f is ${own.toFixed(1)} from its own line and ${other.toFixed(1)} from g`);
});

test('two steep lines that cross on an axis: each long name nearer its own line, with no line between them', () => {
  // y = −4x + 4 and y = −3x + 4 meet on the y-axis, close all the way: no place for "y = −4x + 4" is clear of every
  // other line. Every place costing alike, the first in order won, beside the crossing and nearer the other line
  // (0.89 as far from it as from its own). Nor may a place on the far side of the y-axis do: the axis cuts it off.
  const curves = [{ label: 'y = −4x + 4', paths: line(-4, 4) }, { label: 'y = −3x + 4', paths: line(-3, 4) }, ...AXES];
  const spots = placeCurveLabels({ curves, bounds: PLOT, textSize: 12 });
  [0, 1].forEach((index) => {
    const spot = spots[index];
    const own = distanceTo([spot.cx, spot.cy], curves[index].paths);
    const other = distanceTo([spot.cx, spot.cy], curves[1 - index].paths);
    assert.ok(other > own, `"${curves[index].label}" is ${own.toFixed(1)} from its own line and ${other.toFixed(1)} from the other`);
    assert.deepEqual(between(spot, curves[index].paths, curves.filter((_, other) => other !== index)), [], `nothing between "${curves[index].label}" and its line`);
    assert.ok(inside(spot.box, PLOT), `"${curves[index].label}" inside the plot`);
  });
});

test('where two lines leave room, a long name is clearly nearer its own line, not barely', () => {
  // No place clear of every line (the axes too), so each place was as costly as the next and the first won: a name
  // 1.11 times as far from the other line as from its own (y = −3x + 2), or 0.99 (y = 3x − 6), where places
  // half again as far from the other line were there to take.
  for (const [first, second] of [[[-3, 2, 'y = −3x + 2'], [-1, 2, 'y = −x + 2']], [[3, -6, 'y = 3x − 6'], [2, -2, 'y = 2x − 2']]]) {
    const curves = [{ label: first[2], paths: line(first[0], first[1]) }, { label: second[2], paths: line(second[0], second[1]) }, ...AXES];
    const spots = placeCurveLabels({ curves, bounds: PLOT, textSize: 12 });
    [0, 1].forEach((index) => {
      const own = distanceTo([spots[index].cx, spots[index].cy], curves[index].paths);
      const other = distanceTo([spots[index].cx, spots[index].cy], curves[1 - index].paths);
      assert.ok(other >= own * 1.6, `"${curves[index].label}": ${(other / own).toFixed(2)} times as far from the other line as from its own`);
    });
  }
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

test('on a plane drawn small a name keeps two pixels of room; drawn at a size a student reads, it does not move', () => {
  const { curves, dots } = inversePlane();
  const first = placeCurveLabels({ curves, dots, bounds: PLOT, textSize: 12 });
  // A point's name 8 units under y = x's name: clear of its 0.6em (7.2 units), as a name is at any size read.
  const word = { left: first[2].box.left - 10, right: first[2].box.right + 10, top: first[2].box.bottom + 8, bottom: first[2].box.bottom + 24 };
  const gapBetween = (a, b) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
  assert.deepEqual(placeCurveLabels({ curves, dots, avoid: [word], bounds: PLOT, textSize: 12 }), first, 'nothing moves for a word 0.6em away');
  // The same plane drawn 250px wide (2.24 units to a pixel): 0.6em is still the larger room, and nothing moves.
  assert.deepEqual(placeCurveLabels({ curves, dots, avoid: [word], bounds: PLOT, textSize: 12, unit: 560 / 250 }), first, 'nothing moves at a size read');
  // Drawn 70px wide (8 units to a pixel), 8 units is one pixel: every name keeps two (16 units) from the word and the points.
  const unit = 560 / 70;
  const small = placeCurveLabels({ curves, dots, avoid: [word], bounds: PLOT, textSize: 12, unit });
  curves.forEach((curve, index) => {
    if (!curve.label) return;
    const spot = small[index];
    assert.ok(spot, `${curve.label} has a place`);
    assert.ok(gapBetween(spot.box, word) >= 2 * unit - 1e-9, `${curve.label} is ${gapBetween(spot.box, word).toFixed(1)} units from the word, under two pixels (${2 * unit})`);
    for (const dot of dots) assert.ok(gapBetween(spot.box, dotBox(dot)) >= 2 * unit - 1e-9, `${curve.label} is ${gapBetween(spot.box, dotBox(dot)).toFixed(1)} units from a point`);
    assert.ok(distanceTo([spot.cx, spot.cy], curve.paths) < 30, `${curve.label} still beside its own line`);
  });
  assert.notDeepEqual(small[2], first[2], 'y = x\'s name moved off the word');
});
