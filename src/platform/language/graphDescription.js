/*
 * GRAPHS SPEAK — a text rendering of a coordinate plane (WCAG 2.1 1.1.1).
 *
 * A read-only plane used to be announced as "Coordinate plane" and nothing
 * else, so a screen-reader student could not tell Graph A from Graph B. This
 * module turns the data CoordinatePlane draws into a short spoken summary and
 * a data-table alternative. Pure: no React, no DOM, importable by node tests.
 *
 * WHAT IT MAY SAY: ONLY WHAT THE SCREEN SHOWS.
 *
 * A description is a second rendering of the same picture, never a hint.
 *
 *   - No equations, no rules, no slopes, no rates. A sighted student sees a
 *     line rising through two gridline crossings; they do not see a formula.
 *     Lines are described visually: rises or falls, where it crosses each axis,
 *     two grid points it passes through.
 *   - Values are read at the grid's resolution. A value that lands on the
 *     resolution (the snap step, default 1) is stated exactly; anything else is
 *     "about" the nearest half step, which is what reading between gridlines
 *     gives a sighted student. Nothing is computed to more precision than the
 *     grid offers.
 *   - Text labels only where the plane draws text. CoordinatePlane draws
 *     `point.label` beside a plain dot and nowhere else — not for open/closed
 *     markers, arrows, lines, curves, polylines or regions — so those labels are
 *     never spoken, even when the data carries one.
 *
 * WHY THIS IS NOT HIDDEN WHEN revealCoordinates IS FALSE.
 *
 * CoordinatePlane documents the policy: hiding the numeric readout chip makes a
 * coordinate-reading question harder for a sighted student, but the
 * screen-reader rendering is the ONLY rendering a blind student has. Taking it
 * away makes the question impossible rather than harder. A sighted student
 * reads (3, −2) off the axes; a screen-reader student reads it off this text.
 * Both are reading the plane, so the description is produced either way. That
 * is also why the resolution rule above matters: the text must not read the
 * plane MORE precisely than the eye can.
 */
import { readGraphPointCoordinates } from '../../graphPointUtils.js';
import { majorTicks, niceStep } from '../graph/graphScaleService.js';

// Above this many resolution steps across the window the plane cannot draw a
// minor grid (CoordinatePlane's MAX_MINOR_LINES), so the eye has only the major
// gridlines to read from.
const MAX_READABLE_STEPS = 90;
const CURVE_SAMPLES = 400;
const MAX_CURVE_FEATURES = 8;
const MAX_VERTICES = 12;
const EPS = 1e-9;
const DRAWN_MARKERS = new Set(['open', 'closed', 'arrow']);

const tidy = (value) => Number(Number(value).toFixed(6));
const MINUS = '−';

// Unicode minus: screen readers say "minus", where a hyphen is often "dash".
export const formatNumber = (value) => {
  const n = tidy(value);
  if (Object.is(n, -0) || n === 0) return '0';
  return n < 0 ? `${MINUS}${String(-n)}` : String(n);
};

const isMultiple = (value, step) => {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
};

// A value as a sighted student reads it: exact on the grid, "about" between.
export const readValue = (value, resolution) => {
  if (isMultiple(value, resolution)) return { text: formatNumber(value), exact: true, value: tidy(value) };
  const half = resolution / 2;
  const rounded = tidy(Math.round(value / half) * half);
  return { text: formatNumber(rounded), exact: false, value: rounded };
};

const readText = (value, resolution) => {
  const read = readValue(value, resolution);
  return read.exact ? read.text : `about ${read.text}`;
};

const readPair = (x, y, res) => {
  const rx = readValue(x, res.x);
  const ry = readValue(y, res.y);
  const pair = `(${rx.text}, ${ry.text})`;
  return rx.exact && ry.exact ? pair : `about ${pair}`;
};

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const resolutionFor = (span, snapStep, majorStep) => {
  const step = Number(snapStep) > 0 ? Number(snapStep) : 1;
  if (span / step <= MAX_READABLE_STEPS) return step;
  return majorStep / 2;
};

const rawPointList = (entry) => {
  const raw = Array.isArray(entry) ? entry : entry?.points;
  return (Array.isArray(raw) ? raw : []).map(readGraphPointCoordinates).filter(Boolean);
};

const inWindow = (x, y, w) => x >= w.xMin - EPS && x <= w.xMax + EPS && y >= w.yMin - EPS && y <= w.yMax + EPS;

const arrowDirection = (vector) => {
  const dx = Number(vector?.[0] ?? 1);
  const dy = Number(vector?.[1] ?? 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < EPS && Math.abs(dy) < EPS)) return 'right';
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const names = ['right', 'up and right', 'up', 'up and left', 'left', 'down and left', 'down', 'down and right'];
  return names[((Math.round(angle / 45) % 8) + 8) % 8];
};

/* ---------------------------------------------------------------- points */

const describePoints = (points, res, w) => {
  const entries = [];
  points.forEach((point) => {
    const coordinates = readGraphPointCoordinates(point);
    if (!coordinates) return;
    const [x, y] = coordinates;
    const marker = DRAWN_MARKERS.has(point?.marker) ? point.marker : null;
    // Only a plain dot draws its label (see the module header). Any other
    // marker value falls through to the plain dot in CoordinatePlane, label
    // and all, so it is read as one here too.
    const label = !marker && point?.label != null && String(point.label).trim() ? String(point.label).trim() : '';
    const at = readPair(x, y, res);
    const offscreen = inWindow(x, y, w) ? '' : ', outside the window';
    let text;
    let kind = 'point';
    if (marker === 'arrow') {
      kind = 'arrowhead';
      text = `arrowhead at ${at} pointing ${arrowDirection(point?.vector)}`;
    } else if (marker === 'open' || marker === 'closed') {
      text = `${at}, ${marker} dot`;
    } else {
      text = label ? `${label} at ${at}` : at;
    }
    entries.push({ kind, label, x, y, marker, text: `${text}${offscreen}` });
  });
  return entries;
};

/* ----------------------------------------------------------------- lines */

const gridPointsOnLine = (m, b, res, w) => {
  const found = [];
  const first = Math.ceil((w.xMin - EPS) / res.x);
  const last = Math.floor((w.xMax + EPS) / res.x);
  for (let i = first; i <= last && i - first < 2000; i += 1) {
    const x = tidy(i * res.x);
    const y = m * x + b;
    if (isMultiple(y, res.y) && y >= w.yMin - EPS && y <= w.yMax + EPS) found.push([x, tidy(y)]);
  }
  // The points nearest the y-axis are the ones a student finds first.
  found.sort((p, q) => Math.abs(p[0]) - Math.abs(q[0]) || q[0] - p[0]);
  return found.slice(0, 2).sort((p, q) => p[0] - q[0]);
};

const describeLine = (line, index, res, w) => {
  const m = Number(line?.m);
  const b = Number(line?.b);
  const name = `Line ${index + 1}`;
  if (!Number.isFinite(m) || !Number.isFinite(b)) return null;
  const yLeft = m * w.xMin + b;
  const yRight = m * w.xMax + b;
  const style = line?.dash ? ' (dashed)' : '';
  if (Math.max(yLeft, yRight) < w.yMin - EPS || Math.min(yLeft, yRight) > w.yMax + EPS) {
    return { name, text: `${name}${style} is outside the window.` };
  }
  const parts = [];
  const flat = Math.abs(m) < EPS;
  parts.push(flat ? 'is horizontal' : m > 0 ? 'rises from left to right' : 'falls from left to right');
  const yAxisVisible = w.xMin <= EPS && w.xMax >= -EPS;
  const xAxisVisible = w.yMin <= EPS && w.yMax >= -EPS;
  if (yAxisVisible && b >= w.yMin - EPS && b <= w.yMax + EPS) parts.push(`crosses the y-axis at ${readText(b, res.y)}`);
  if (!flat && xAxisVisible) {
    const x0 = -b / m;
    if (x0 >= w.xMin - EPS && x0 <= w.xMax + EPS) parts.push(`crosses the x-axis at ${readText(x0, res.x)}`);
  }
  const through = gridPointsOnLine(m, b, res, w);
  if (through.length === 2) parts.push(`passes through ${readPair(...through[0], res)} and ${readPair(...through[1], res)}`);
  else if (through.length === 1) parts.push(`passes through ${readPair(...through[0], res)}`);
  return { name, text: `${name}${style} ${joinClauses(parts)}.` };
};

const joinClauses = (clauses) => {
  if (clauses.length < 2) return clauses.join('');
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
};

/* ---------------------------------------------------------------- curves */

const safeCall = (fn, x) => {
  try {
    const y = Number(fn(x));
    return Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
};

const sampleXs = (w, res) => {
  const xs = new Set();
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) xs.add(tidy(w.xMin + ((w.xMax - w.xMin) * i) / CURVE_SAMPLES));
  // Grid x's too, so a curve that only touches the axis on a gridline is seen.
  const first = Math.ceil((w.xMin - EPS) / res.x);
  const last = Math.floor((w.xMax + EPS) / res.x);
  if (last - first <= 1000) for (let i = first; i <= last; i += 1) xs.add(tidy(i * res.x));
  return [...xs].sort((a, b) => a - b);
};

// Where the segment between two samples meets the top or bottom border.
const edgeCrossing = (a, b, edge) => (Math.abs(b.y - a.y) < 1e-12 ? b.x : a.x + ((edge - a.y) * (b.x - a.x)) / (b.y - a.y));

const curveFeatures = (fn, res, w) => {
  const xs = sampleXs(w, res);
  const samples = xs.map((x) => {
    const y = safeCall(fn, x);
    return { x, y, inside: y != null && y >= w.yMin - EPS && y <= w.yMax + EPS };
  });
  const features = [];
  const xAxisVisible = w.yMin <= EPS && w.yMax >= -EPS;
  const atZero = (s) => s.inside && Math.abs(s.y) < 1e-9;

  samples.forEach((s, i) => {
    const prev = samples[i - 1];
    const next = samples[i + 1];
    // Edges: where the visible curve begins and ends.
    if (s.inside && (!prev || !prev.inside)) {
      if (!prev) features.push({ x: s.x, y: s.y, text: `starts at the left edge at ${readPair(s.x, s.y, res)}` });
      else if (prev.y == null) features.push({ x: s.x, y: s.y, text: `begins at ${readPair(s.x, s.y, res)}` });
      else {
        const edge = prev.y > w.yMax ? w.yMax : w.yMin;
        const x = edgeCrossing(prev, s, edge);
        features.push({ x, y: edge, text: `comes in through the ${edge === w.yMax ? 'top' : 'bottom'} edge at ${readPair(x, edge, res)}` });
      }
    }
    // An x-axis zero at the very end of the visible curve is already spoken
    // by the edge sentence ("begins at (0, 0)").
    if (xAxisVisible && s.inside && prev && next && prev.inside && next.inside) {
      if (atZero(s) && !atZero(prev)) {
        const touching = Math.sign(prev.y) === Math.sign(next.y) && Math.sign(prev.y) !== 0;
        features.push({ x: s.x, y: 0, text: `${touching ? 'touches' : 'crosses'} the x-axis at ${readText(s.x, res.x)}` });
      }
    }
    if (xAxisVisible && s.inside && prev && prev.inside && !atZero(prev) && !atZero(s) && prev.y * s.y < 0) {
      const x0 = prev.x + ((0 - prev.y) * (s.x - prev.x)) / (s.y - prev.y);
      features.push({ x: x0, y: 0, text: `crosses the x-axis at ${readText(x0, res.x)}` });
    }
    // Turning points: the direction of travel reverses inside the window.
    if (s.inside && prev && next && prev.inside && next.inside) {
      const before = s.y - prev.y;
      let j = i + 1;
      while (j < samples.length - 1 && samples[j].inside && Math.abs(samples[j].y - s.y) < 1e-12) j += 1;
      const after = samples[j].y != null && samples[j].inside ? samples[j].y - s.y : 0;
      if (Math.abs(before) > 1e-12 && Math.abs(after) > 1e-12 && Math.sign(before) !== Math.sign(after)) {
        const high = before > 0;
        const touchesAxis = xAxisVisible && Math.abs(s.y) < 1e-9;
        if (!touchesAxis) features.push({ x: s.x, y: s.y, text: `has a ${high ? 'high' : 'low'} point at ${readPair(s.x, s.y, res)}` });
      }
    }
    if (s.inside && (!next || !next.inside)) {
      if (!next) features.push({ x: s.x, y: s.y, text: `ends at the right edge at ${readPair(s.x, s.y, res)}` });
      else if (next.y == null) features.push({ x: s.x, y: s.y, text: `stops at ${readPair(s.x, s.y, res)}` });
      else {
        const edge = next.y > w.yMax ? w.yMax : w.yMin;
        const x = edgeCrossing(s, next, edge);
        features.push({ x, y: edge, text: `leaves through the ${edge === w.yMax ? 'top' : 'bottom'} edge at ${readPair(x, edge, res)}` });
      }
    }
  });

  // The y-axis crossing, unless a feature already sits there.
  const yAxisVisible = w.xMin <= EPS && w.xMax >= -EPS;
  if (yAxisVisible) {
    const y0 = safeCall(fn, 0);
    if (y0 != null && y0 >= w.yMin - EPS && y0 <= w.yMax + EPS) {
      // Already said when another feature reads as the same grid point.
      const said = features.some((f) => Number.isFinite(f.y)
        && readValue(f.x, res.x).value === 0 && readValue(f.y, res.y).value === readValue(y0, res.y).value);
      if (!said) features.push({ x: 0, text: `crosses the y-axis at ${readText(y0, res.y)}` });
    }
  }
  features.sort((a, b) => a.x - b.x);
  return { features, visible: samples.some((s) => s.inside) };
};

const describeCurve = (fn, index, count, res, w) => {
  if (typeof fn !== 'function') return null;
  // CoordinatePlane draws the first curve solid and every later one dashed;
  // with one curve there is nothing to tell apart.
  const name = `Curve ${index + 1}`;
  const style = count < 2 ? '' : index === 0 ? ' (solid)' : ' (dashed)';
  const { features, visible } = curveFeatures(fn, res, w);
  if (!visible) return { name, text: `${name}${style} is outside the window.` };
  const shown = features.slice(0, MAX_CURVE_FEATURES).map((f) => f.text);
  if (features.length > MAX_CURVE_FEATURES) shown.push('continues');
  return { name, text: `${name}${style} ${joinClauses(shown)}.` };
};

/* ------------------------------------------------------ shapes and guides */

const vertexList = (vertices, res) => {
  const shown = vertices.slice(0, MAX_VERTICES).map(([x, y]) => readPair(x, y, res));
  if (vertices.length > MAX_VERTICES) shown.push(`${vertices.length - MAX_VERTICES} more`);
  return joinClauses(shown);
};

/* ----------------------------------------------------------------- entry */

/**
 * Describe what a CoordinatePlane draws, in words and as tables.
 *
 * Takes the same data the plane renders. Returns:
 *   summary      the full sentence block, prefixed with `label` when given
 *   description  the same without the label (for aria-describedby beside an
 *                aria-label that already names the plane)
 *   sentences    one sentence per described object
 *   tables       [{ caption, columns, rows }], each row an array of cell text
 */
export function describeCoordinatePlane({
  xMin = -10, xMax = 10, yMin = -10, yMax = 10,
  xTickStep = null, yTickStep = null, snapStep = 1,
  points = [], lines = [], functions = [], polylines = [], regions = [],
  verticalLines = [], horizontalLines = [],
  // `revealCoordinates` may be passed and is deliberately ignored: the
  // description is produced either way (see the module header).
  label = '',
  hasUndescribedMarks = false,
  emptyText = 'Nothing is plotted.',
} = {}) {
  const w = { xMin: Number(xMin), xMax: Number(xMax), yMin: Number(yMin), yMax: Number(yMax) };
  const xStep = Number(xTickStep) > 0 ? Number(xTickStep) : niceStep(w.xMax - w.xMin);
  const yStep = Number(yTickStep) > 0 ? Number(yTickStep) : niceStep(w.yMax - w.yMin);
  const res = {
    x: resolutionFor(w.xMax - w.xMin, snapStep, xStep),
    y: resolutionFor(w.yMax - w.yMin, snapStep, yStep),
  };
  const list = (value) => (Array.isArray(value) ? value : []);

  const sentences = [];
  sentences.push(`x from ${formatNumber(w.xMin)} to ${formatNumber(w.xMax)}, y from ${formatNumber(w.yMin)} to ${formatNumber(w.yMax)}.`);

  const lineEntries = list(lines).map((line, i) => describeLine(line, i, res, w)).filter(Boolean);
  if (lineEntries.length) {
    sentences.push(`${plural(lineEntries.length, 'line')}.`);
    lineEntries.forEach((entry) => sentences.push(entry.text));
  }

  const curveFns = list(functions).filter((fn) => typeof fn === 'function');
  const curveEntries = curveFns.map((fn, i) => describeCurve(fn, i, curveFns.length, res, w)).filter(Boolean);
  if (curveEntries.length) {
    sentences.push(`${plural(curveEntries.length, 'curve')}.`);
    curveEntries.forEach((entry) => sentences.push(entry.text));
  }

  const verticals = list(verticalLines).map(Number).filter(Number.isFinite);
  const horizontals = list(horizontalLines).map(Number).filter(Number.isFinite);
  verticals.forEach((x) => sentences.push(`Dashed vertical line through ${readText(x, res.x)} on the x-axis.`));
  horizontals.forEach((y) => sentences.push(`Dashed horizontal line through ${readText(y, res.y)} on the y-axis.`));

  const polyVertices = list(polylines).map(rawPointList).filter((v) => v.length);
  polyVertices.forEach((vertices, i) => {
    sentences.push(`Connected path ${i + 1} through ${vertexList(vertices, res)}.`);
  });

  const regionVertices = list(regions).map(rawPointList).filter((v) => v.length);
  regionVertices.forEach((vertices, i) => {
    sentences.push(`Shaded region ${i + 1} with corners at ${vertexList(vertices, res)}.`);
  });

  const pointEntries = describePoints(list(points), res, w);
  if (pointEntries.length) {
    const dots = pointEntries.filter((p) => p.kind === 'point').length;
    const arrows = pointEntries.length - dots;
    const counts = [dots ? plural(dots, 'point') : '', arrows ? plural(arrows, 'arrowhead') : ''].filter(Boolean).join(' and ');
    sentences.push(`${counts}: ${pointEntries.map((p) => p.text).join('; ')}.`);
  }

  const described = lineEntries.length + curveEntries.length + verticals.length + horizontals.length
    + polyVertices.length + regionVertices.length + pointEntries.length;
  if (!described && !hasUndescribedMarks) sentences.push(emptyText);
  if (hasUndescribedMarks) sentences.push('It also shows marks drawn by the activity that are not listed here.');

  /* Tables: the same reading, laid out as a sighted student would tabulate it. */
  const tables = [];
  const caption = (what) => `${label || 'Coordinate plane'}: ${what}`;
  if (pointEntries.length) {
    tables.push({
      caption: caption('points'),
      columns: ['Point', 'x', 'y'],
      rows: pointEntries.map((p, i) => {
        const name = p.label || (p.kind === 'arrowhead' ? `Arrowhead ${i + 1}` : `Point ${i + 1}`);
        const suffix = p.marker === 'open' || p.marker === 'closed' ? ` (${p.marker} dot)` : '';
        return [`${name}${suffix}`, readText(p.x, res.x), readText(p.y, res.y)];
      }),
    });
  }
  if (lineEntries.length || curveEntries.length) {
    const series = [
      ...list(lines).map((line, i) => ({ name: `Line ${i + 1}`, at: (x) => (Number.isFinite(Number(line?.m)) && Number.isFinite(Number(line?.b)) ? Number(line.m) * x + Number(line.b) : null) })),
      ...curveFns.map((fn, i) => ({ name: `Curve ${i + 1}`, at: (x) => safeCall(fn, x) })),
    ];
    const ticks = majorTicks(w.xMin, w.xMax, xStep);
    tables.push({
      caption: caption('y at each labelled x'),
      columns: ['x', ...series.map((s) => s.name)],
      rows: ticks.map((x) => [formatNumber(x), ...series.map((s) => {
        const y = s.at(x);
        if (y == null || !Number.isFinite(y)) return 'not drawn';
        if (y < w.yMin - EPS || y > w.yMax + EPS) return 'off the graph';
        return readText(y, res.y);
      })]),
    });
  }
  const shapes = [
    ...polyVertices.map((v, i) => ({ name: `Path ${i + 1}`, v })),
    ...regionVertices.map((v, i) => ({ name: `Shaded region ${i + 1}`, v })),
  ];
  if (shapes.length) {
    tables.push({
      caption: caption('paths and shaded regions'),
      columns: ['Shape', 'Corner', 'x', 'y'],
      rows: shapes.flatMap((shape) => shape.v.map(([x, y], i) => [shape.name, String(i + 1), readText(x, res.x), readText(y, res.y)])),
    });
  }

  const description = sentences.join(' ');
  return {
    summary: label ? `${label}, ${description}` : description,
    description,
    sentences,
    tables,
  };
}

export default describeCoordinatePlane;
