/*
 * A CURVE'S NAME, BESIDE ITS OWN CURVE (WCAG 1.4.1).
 *
 * Where two lines on a plane differ only by colour (f and the mirror line
 * y = x, a curve and its inverse, two solid boundaries of a system), a student
 * who cannot tell the colours apart cannot tell the lines apart, and a contrast
 * theme draws both in its one text colour. So each is named on the plane: "f",
 * "f⁻¹", "y = x", or the number of the constraint it bounds. A line's style is
 * never changed for this (a dash says < or >, an asymptote, a target): only a
 * name is added.
 *
 * A name goes beside its own curve and nearer to it than to any other, so it
 * cannot be read as another curve's. It covers no dot, no other name, no axis
 * number and no line, and stays inside the plot. It tries places along the
 * curve's drawn length, near its ends first (where a name is looked for), on
 * either side, and takes the first that costs nothing; when none is clear it
 * takes the one that costs least, a dot counting most (planePointLabels.js
 * places a point's name the same way).
 *
 * Pure geometry in the plane's viewBox units, as planePointLabels.js:
 *   a curve  { label, paths: [[[x, y], …], …], tag }: what is drawn, as runs
 *            of points (a curve broken by an asymptote is two runs); `label`
 *            empty for a curve that is only to be kept clear of; `tag` for a
 *            name drawn in a ring (a constraint's number), which takes a
 *            square box
 *   a dot    { x, y, radius }
 *   a box    { left, right, top, bottom }
 * `avoid` are boxes a name keeps off (an axis number, a point's name), and
 * `hidden` boxes no name may go under (a control drawn over the plane).
 * `unit`, where the plane says how small it is drawn: its viewBox units to one
 * CSS pixel (useDrawnUnit.js), which keeps the room below from going under two
 * pixels.
 */

// A bold label's average advance, in ems; an overestimate errs toward room.
const GLYPH_WIDTH = 0.62;
const CAP_HEIGHT = 0.78;
const DESCENT = 0.2;
// What covering each kind of thing costs, per unit of area covered (as planePointLabels.js).
const COST_DOT = 3;
const COST_LABEL = 1.5;
const COST_AXIS_NUMBER = 1;
const COST_OUTSIDE = 4;
// A line through a name, and a name nearer another curve than its own: each as
// much as covering a dot the size of the name's own text.
const COST_CROSSING = 3;
const COST_AMBIGUOUS = 8;
// Under a control drawn over the plane (Work View's opener) a name is not seen
// at all: worse than anything else a place can cost.
const COST_HIDDEN = 60;
// How much farther from any other curve than from its own a name must be.
const NEARER_BY = 1.6;
// Room kept between a name and a point (a name against a dot reads as the
// point's), and between a name and another word (two words side by side read
// as one: "on f" and "f" as "on ff"), in ems of the name's text.
const DOT_ROOM = 0.6;
const LABEL_ROOM = 0.6;
// And never less than two CSS pixels where the plane is drawn small: the graph
// workspace on its own on a 390px phone draws its 760-unit board 98px wide, and
// there 0.6em of a name is one pixel, a name that close to a point's name reads
// as part of it. Only where a plane is drawn under about a quarter of its size;
// at any size a student reads it at, 0.6em is the larger.
const ROOM_PX = 2;
// Along the curve's drawn length: near its ends first, then inward, then every
// twentieth of the way, for a crowded plane (a phone's).
const PREFERRED = [0.88, 0.12, 0.76, 0.24, 0.64, 0.36, 0.5, 0.95, 0.05];
const ALONG = Object.freeze([...PREFERRED, ...Array.from({ length: 19 }, (_, i) => (i + 1) / 20).filter((fraction) => !PREFERRED.includes(fraction))]);
// Beside the curve, and failing that a little farther out (in ems of the name).
const FARTHER = Object.freeze([0, 0.9]);

const finite = (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);

/** The size of a name's box: text, or a ring around it (`tag`). */
export const curveLabelSize = ({ label, textSize, tag = false }) => {
  const width = Math.max(1, String(label).length) * GLYPH_WIDTH * textSize;
  const height = (CAP_HEIGHT + DESCENT) * textSize;
  if (!tag) return { width, height };
  const side = Math.max(height, width) + textSize * 0.55;
  return { width: side, height: side };
};

const boxAround = (cx, cy, size) => ({ left: cx - size.width / 2, right: cx + size.width / 2, top: cy - size.height / 2, bottom: cy + size.height / 2 });

const overlapArea = (a, b) => {
  const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return across > 0 && down > 0 ? across * down : 0;
};

const outsideArea = (box, bounds) => {
  if (!bounds) return 0;
  const area = (box.right - box.left) * (box.bottom - box.top);
  const across = Math.min(box.right, bounds.right) - Math.max(box.left, bounds.left);
  const down = Math.min(box.bottom, bounds.bottom) - Math.max(box.top, bounds.top);
  return across > 0 && down > 0 ? area - across * down : area;
};

const dotBox = (dot) => ({ left: dot.x - dot.radius, right: dot.x + dot.radius, top: dot.y - dot.radius, bottom: dot.y + dot.radius });
const grown = (box, by) => ({ left: box.left - by, right: box.right + by, top: box.top - by, bottom: box.bottom + by });

// The part of segment a→b inside `box` (Liang–Barsky), or null.
const clipSegment = (a, b, box) => {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const edges = [[-dx, a[0] - box.left], [dx, box.right - a[0]], [-dy, a[1] - box.top], [dy, box.bottom - a[1]]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
};

const segmentsOf = (paths) => paths.flatMap((path) => path.slice(1).map((point, index) => [path[index], point]));

/** A curve's runs as drawn inside `bounds`: each segment cut to the plot, joined where it runs on. */
export const visibleRuns = (paths, bounds) => {
  const runs = [];
  for (const path of Array.isArray(paths) ? paths : []) {
    let run = [];
    const points = (Array.isArray(path) ? path : []).filter(finite);
    for (let index = 1; index < points.length; index += 1) {
      const piece = bounds ? clipSegment(points[index - 1], points[index], bounds) : [points[index - 1], points[index]];
      if (!piece) {
        if (run.length > 1) runs.push(run);
        run = [];
        continue;
      }
      const last = run[run.length - 1];
      if (last && Math.abs(last[0] - piece[0][0]) < 1e-6 && Math.abs(last[1] - piece[0][1]) < 1e-6) run.push(piece[1]);
      else {
        if (run.length > 1) runs.push(run);
        run = [piece[0], piece[1]];
      }
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
};

const distanceToSegment = ([px, py], [a, b]) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
};

const distanceToSegments = (point, segments) => segments.reduce((nearest, segment) => Math.min(nearest, distanceToSegment(point, segment)), Number.POSITIVE_INFINITY);

const crosses = (segments, box) => segments.some(([a, b]) => clipSegment(a, b, box) !== null);

// A place `fraction` of the way along the runs' drawn length, and the way the curve runs there.
const pointAlong = (runs, fraction) => {
  const lengths = runs.map((run) => run.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - run[index][0], point[1] - run[index][1]), 0));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!(total > 0)) return null;
  let left = total * fraction;
  for (let r = 0; r < runs.length; r += 1) {
    const run = runs[r];
    if (left > lengths[r] && r < runs.length - 1) { left -= lengths[r]; continue; }
    for (let index = 1; index < run.length; index += 1) {
      const [a, b] = [run[index - 1], run[index]];
      const step = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= step || index === run.length - 1) {
        const t = step > 0 ? Math.min(1, left / step) : 0;
        return { x: a[0] + t * (b[0] - a[0]), y: a[1] + t * (b[1] - a[1]), dx: (b[0] - a[0]) / (step || 1), dy: (b[1] - a[1]) / (step || 1) };
      }
      left -= step;
    }
  }
  return null;
};

/**
 * One spot per curve, in the curves' order: { cx, cy, x, y, anchor, box } for
 * a curve with a label that is drawn inside the plot, null otherwise. (cx, cy)
 * is the centre of the name's box; (x, y) is where its text starts, as SVG text
 * takes it, centred (`anchor` 'middle').
 */
export const placeCurveLabels = ({ curves = [], dots = [], avoid = [], hidden = [], bounds = null, textSize = 12, gap = 4, unit = 0 } = {}) => {
  const drawn = curves.map((curve) => visibleRuns(curve?.paths, bounds));
  const segments = drawn.map(segmentsOf);
  const fewestUnits = ROOM_PX * (Number(unit) > 0 ? Number(unit) : 0);
  const dotRoom = Math.max(DOT_ROOM * textSize, fewestUnits);
  const labelRoom = Math.max(LABEL_ROOM * textSize, fewestUnits);
  const dotBoxes = dots.filter((dot) => dot && Number.isFinite(dot.x) && Number.isFinite(dot.y))
    .map((dot) => grown(dotBox({ ...dot, radius: Number(dot.radius) || 0 }), dotRoom));
  const avoided = avoid.filter(Boolean).map((box) => grown(box, labelRoom));
  const taken = [];
  const textArea = textSize * textSize;
  return curves.map((curve, index) => {
    const label = String(curve?.label ?? '');
    if (!label || !drawn[index].length) return null;
    const size = curveLabelSize({ label, textSize, tag: Boolean(curve.tag) });
    const others = segments.filter((_, other) => other !== index);
    let best = null;
    const places = FARTHER.flatMap((farther) => ALONG.map((fraction) => ({ fraction, farther })));
    places.forEach(({ fraction, farther }, order) => {
      const at = pointAlong(drawn[index], fraction);
      if (!at) return;
      // Either side of the curve, square to the way it runs there.
      for (const side of [-1, 1]) {
        const nx = -at.dy * side;
        const ny = at.dx * side;
        const reach = Math.abs(nx) * size.width / 2 + Math.abs(ny) * size.height / 2 + gap + farther * textSize;
        const cx = at.x + nx * reach;
        const cy = at.y + ny * reach;
        const box = boxAround(cx, cy, size);
        const own = distanceToSegments([cx, cy], segments[index]);
        const nearestOther = others.reduce((nearest, list) => Math.min(nearest, distanceToSegments([cx, cy], list)), Number.POSITIVE_INFINITY);
        const crossing = segments.filter((list) => crosses(list, box)).length;
        const cost = dotBoxes.reduce((sum, dot) => sum + COST_DOT * overlapArea(box, dot), 0)
          + taken.reduce((sum, other) => sum + COST_LABEL * overlapArea(box, grown(other, labelRoom)), 0)
          + avoided.reduce((sum, other) => sum + COST_AXIS_NUMBER * overlapArea(box, other), 0)
          + hidden.filter(Boolean).reduce((sum, other) => sum + COST_HIDDEN * overlapArea(box, other), 0)
          + COST_OUTSIDE * outsideArea(box, bounds)
          + COST_CROSSING * textArea * crossing
          + (nearestOther < own * NEARER_BY + gap ? COST_AMBIGUOUS * textArea : 0)
          // The same cost: the earlier place wins.
          + order * 0.01 + (side > 0 ? 0.005 : 0);
        if (!best || cost < best.cost) best = { cost, cx, cy, box };
      }
    });
    if (!best) return null;
    taken.push(best.box);
    return {
      cx: best.cx,
      cy: best.cy,
      x: best.cx,
      y: best.cy + ((CAP_HEIGHT - DESCENT) / 2) * textSize,
      anchor: 'middle',
      box: best.box,
    };
  });
};

/**
 * The runs of y = f(x) across [xMin, xMax], in viewBox units: broken where it
 * leaves the window, is undefined, or jumps (an asymptote, which is no line).
 */
export const sampleFunctionRuns = (fn, { xMin, xMax, yMin, yMax, sx, sy, samples = 220 }) => {
  const runs = [];
  let run = [];
  let previous = null;
  const span = yMax - yMin;
  const breakRun = () => {
    if (run.length > 1) runs.push(run);
    run = [];
    previous = null;
  };
  for (let i = 0; i <= samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    let y;
    try { y = fn(x); } catch { y = Number.NaN; }
    if (!Number.isFinite(y) || y < yMin - span || y > yMax + span) { breakRun(); continue; }
    if (previous !== null && Math.abs(y - previous) > span * 0.65) breakRun();
    run.push([sx(x), sy(y)]);
    previous = y;
  }
  breakRun();
  return runs;
};
