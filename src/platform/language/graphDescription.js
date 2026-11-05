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
 *   - Values are read at the grid the plane actually DRAWS: the snap-step
 *     minor grid where one is drawn (interactive or readableGrid planes),
 *     otherwise the major gridlines. A value on a drawn gridline is stated
 *     exactly; anything else is "between" the two gridlines around it —
 *     never more precisely than the eye can read it.
 *   - Text labels only where the plane draws text. CoordinatePlane draws
 *     `point.label` beside a plain dot and nowhere else — not for open/closed
 *     markers, arrows, lines, curves, polylines or regions — so those labels are
 *     never spoken, even when the data carries one.
 *
 * WHILE THE QUESTION CAN STILL BE ANSWERED, NO FEATURE VALUES (`detail`).
 *
 * A description that says "crosses the y-axis at −4" answers "What is the
 * y-intercept?" for anyone who turns on a screen reader — ChromeVox is one
 * keystroke on every Chromebook. So the default, `detail: 'kinds'`, says
 * only what KINDS of objects are drawn: the window, "2 lines", "1 curve",
 * "3 points" (with any text labels the plane draws), "a shaded region". No
 * axis crossings, high or low points, touching, intersections, positions or
 * table. `detail: 'features'` — the full, grid-readable reading below — is
 * for a question that is closed (solution review, released results) or a
 * screen that asks nothing; CoordinatePlane decides, failing closed. Points
 * the student plotted themselves on an interactive plane are always read
 * back (`listPlottedPoints`): they are the student's own work.
 *
 * Blind students on graph-READING assessment items therefore need an
 * authored description, a human reader or a tactile graphic; that is an
 * accommodation decision, not something this module can make safely.
 *
 * WHY THE FULL READING IS NOT HIDDEN WHEN revealCoordinates IS FALSE.
 *
 * CoordinatePlane documents the policy: hiding the numeric readout chip makes a
 * coordinate-reading question harder for a sighted student, but the
 * screen-reader rendering is the ONLY rendering a blind student has. Taking it
 * away makes the question impossible rather than harder. A sighted student
 * reads (3, −2) off the axes; a screen-reader student reads it off this text.
 * Both are reading the plane, so the description is produced either way. That
 * is also why the resolution rule above matters: the text must not read the
 * plane MORE precisely than the eye can.
 *
 * IN THE READER'S LANGUAGE (AX05). Both readings — while the question can be
 * answered (`kinds`) and the full one (`features`: a closed question, or the
 * graph read-out) — are built from messages (./figureSay.js) and returned as
 * `say` beside their English, which is said from the same messages: the same
 * sentences, with the same numbers, can be read in Spanish from
 * ./packs/esFigures.js under an authored Spanish translation. A tool's own
 * sentence the pack has no words for keeps the figure in English.
 */
import { readGraphPointCoordinates } from '../../graphPointUtils.js';
import { majorTicks, niceStep } from '../graph/graphScaleService.js';
import { verticalLineDrawing } from '../graph/verticalLineStyle.js';
import { englishOnly, say, sayFigure } from './figureSay.js';

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

// A value as a sighted student reads it: exact on a drawn gridline, otherwise
// between the two gridlines around it. `value` (half a step, for de-duplicating
// features) is never spoken.
export const readValue = (value, resolution) => {
  if (isMultiple(value, resolution)) return { text: formatNumber(value), exact: true, value: tidy(value) };
  const lower = tidy(Math.floor(value / resolution) * resolution);
  const upper = tidy(lower + resolution);
  const half = resolution / 2;
  return { text: `between ${formatNumber(lower)} and ${formatNumber(upper)}`, exact: false, value: tidy(Math.round(value / half) * half) };
};

const readText = (value, resolution) => readValue(value, resolution).text;

const readPair = (x, y, res) => {
  const rx = readValue(x, res.x);
  const ry = readValue(y, res.y);
  return rx.exact && ry.exact ? `(${rx.text}, ${ry.text})` : `(x ${rx.text}, y ${ry.text})`;
};

// The same reading as a message: a value between two gridlines is words
// ("between 2 and 3"), so it is said in the reader's language.
const readValueSay = (value, resolution) => {
  if (isMultiple(value, resolution)) return formatNumber(value);
  const lower = tidy(Math.floor(value / resolution) * resolution);
  return say('between', formatNumber(lower), formatNumber(tidy(lower + resolution)));
};
const readPairSay = (x, y, res) => {
  if (isMultiple(x, res.x) && isMultiple(y, res.y)) return readPair(x, y, res);
  return say('pairApprox', readValueSay(x, res.x), readValueSay(y, res.y));
};
// Where a mark meets an axis or a gridline: "at 3" or "through 3" on a drawn
// gridline, and between two of them with no "at" ("crosses the x-axis between
// 2 and 3", not "at between").
const atSay = (value, resolution) => (isMultiple(value, resolution) ? say('atValue', formatNumber(value)) : readValueSay(value, resolution));
const throughSay = (value, resolution) => (isMultiple(value, resolution) ? say('throughValue', formatNumber(value)) : readValueSay(value, resolution));

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// A window end as the axis lets it be read: exact on a tick, otherwise "about"
// at one decimal finer than the tick step. An equal-unit window computed to fit
// the screen ends at −6.374046…, which the axis never prints.
const stepDecimals = (step) => {
  const text = String(tidy(step));
  return text.includes('.') ? text.split('.')[1].length : 0;
};
const windowEndSay = (value, step) => {
  if (!(Number(step) > 0)) return formatNumber(value);
  const places = stepDecimals(step);
  // Already at the step's precision (−5 on a step-2 axis), or an authored end
  // one decimal finer (7.5 on a step-1 axis): said exactly. Only an end
  // computed to fit the screen (−6.374…) is "about" (AX36).
  if (Math.abs(Number(Number(value).toFixed(places + 1)) - value) < 1e-9) return formatNumber(value);
  return say('about', formatNumber(Number(Number(value).toFixed(places + 1))));
};

// The finest grid the plane draws: its minor grid where it draws one,
// otherwise its major gridlines.
const resolutionFor = (span, snapStep, majorStep, minorGridDrawn) => {
  const step = Number(snapStep) > 0 ? Number(snapStep) : 1;
  if (minorGridDrawn && span / step <= MAX_READABLE_STEPS && step < majorStep) return step;
  return majorStep;
};

const rawPointList = (entry) => {
  const raw = Array.isArray(entry) ? entry : entry?.points;
  return (Array.isArray(raw) ? raw : []).map(readGraphPointCoordinates).filter(Boolean);
};

/**
 * SEGMENTS DRAWN END TO END ARE ONE CONNECTED PATH (AX27, F-A11Y-64-PATHS).
 *
 * A graph that draws a curve as many short pieces (the checked graph of a
 * relationship model is 64 of them) hands each piece over as its own two-point
 * line, and the summary said "64 connected paths" with a sentence and a table
 * block for every one. A piece that starts where the one before it ended
 * continues that path; a gap starts a new one. Returns polylines (arrays of
 * the points as given), in drawing order, for the `polylines` of
 * describeCoordinatePlane. A piece without two readable ends is dropped.
 */
export const joinSegmentPaths = (segments = []) => {
  const paths = [];
  let open = null;
  let openEnd = null;
  (Array.isArray(segments) ? segments : []).forEach((segment) => {
    const [from, to] = Array.isArray(segment) ? segment : [];
    const start = readGraphPointCoordinates(from);
    const end = readGraphPointCoordinates(to);
    if (!start || !end) return;
    if (open && Math.abs(openEnd[0] - start[0]) <= EPS && Math.abs(openEnd[1] - start[1]) <= EPS) {
      open.push(to);
    } else {
      open = [from, to];
      paths.push(open);
    }
    openEnd = end;
  });
  return paths;
};

const inWindow = (x, y, w) => x >= w.xMin - EPS && x <= w.xMax + EPS && y >= w.yMin - EPS && y <= w.yMax + EPS;

const arrowDirection = (vector) => {
  const dx = Number(vector?.[0] ?? 1);
  const dy = Number(vector?.[1] ?? 0);
  // Only a vector that is exactly zero has no direction. A tiny one still
  // points somewhere: an edge arrow found by bisection carries a vector like
  // [−4.6e-14, −1.8e-13] (W5-2 review, for W5-5's equal-unit arrows).
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return say('pointingRight');
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const names = ['pointingRight', 'pointingUpRight', 'pointingUp', 'pointingUpLeft', 'pointingLeft', 'pointingDownLeft', 'pointingDown', 'pointingDownRight'];
  return say(names[((Math.round(angle / 45) % 8) + 8) % 8]);
};

/* ---------------------------------------------------------------- points */

const coordinateText = (text) => String(text).replace(/[\s\u00a0]/g, '').replace(/[−‒–]/g, '-');
const sameCoordinates = (label, at) => coordinateText(label) === coordinateText(at);

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
    const at = readPairSay(x, y, res);
    let mark;
    let kind = 'point';
    if (marker === 'arrow') {
      kind = 'arrowhead';
      mark = say('arrowheadAt', at, arrowDirection(point?.vector));
    } else if (marker === 'open' || marker === 'closed') {
      mark = say(marker === 'open' ? 'openDotAt' : 'closedDotAt', at);
    } else {
      // A label that is the point's own coordinates ("(1, 3)") is not read
      // twice: "(1, 3) at (1, 3)" (AX36).
      mark = label && !sameCoordinates(label, readPair(x, y, res)) ? say('pointAt', label, at) : at;
    }
    entries.push({ kind, label, x, y, marker, say: inWindow(x, y, w) ? mark : say('outsideWindowMark', mark) });
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

// A line's name as its sentence opens, with the way it is drawn when the
// figure draws its lines' styles (N38): a solid line is said to be solid, not
// only a dashed one dashed. A sort's shared line is "Reference line" (CT04).
const lineSubjectSay = (line, number, styled) => {
  if (line?.reference === true) return say(line?.dash ? 'dashedReferenceLineSubject' : 'referenceLineSubject');
  return say(line?.dash ? 'dashedLineSubject' : styled ? 'solidLineSubject' : 'lineSubject', number);
};

const describeLine = (line, subject, res, w) => {
  const m = Number(line?.m);
  const b = Number(line?.b);
  if (!Number.isFinite(m) || !Number.isFinite(b)) return null;
  const yLeft = m * w.xMin + b;
  const yRight = m * w.xMax + b;
  if (Math.max(yLeft, yRight) < w.yMin - EPS || Math.min(yLeft, yRight) > w.yMax + EPS) return say('outsideWindow', subject);
  const parts = [];
  const flat = Math.abs(m) < EPS;
  parts.push(say(flat ? 'isHorizontal' : m > 0 ? 'risesLeftToRight' : 'fallsLeftToRight'));
  const yAxisVisible = w.xMin <= EPS && w.xMax >= -EPS;
  const xAxisVisible = w.yMin <= EPS && w.yMax >= -EPS;
  if (yAxisVisible && b >= w.yMin - EPS && b <= w.yMax + EPS) parts.push(say('crossesYAxis', atSay(b, res.y)));
  if (!flat && xAxisVisible) {
    const x0 = -b / m;
    if (x0 >= w.xMin - EPS && x0 <= w.xMax + EPS) parts.push(say('crossesXAxis', atSay(x0, res.x)));
  }
  const through = gridPointsOnLine(m, b, res, w);
  if (through.length) parts.push(say('passesThrough', through.map(([x, y]) => readPairSay(x, y, res))));
  return say('markReading', subject, parts);
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
      if (!prev) features.push({ x: s.x, y: s.y, say: say('startsAtLeftEdge', readPairSay(s.x, s.y, res)) });
      else if (prev.y == null) features.push({ x: s.x, y: s.y, say: say('beginsAt', readPairSay(s.x, s.y, res)) });
      else {
        const edge = prev.y > w.yMax ? w.yMax : w.yMin;
        const x = edgeCrossing(prev, s, edge);
        features.push({ x, y: edge, say: say(edge === w.yMax ? 'comesInTop' : 'comesInBottom', readPairSay(x, edge, res)) });
      }
    }
    // An x-axis zero at the very end of the visible curve is already spoken
    // by the edge sentence ("begins at (0, 0)").
    if (xAxisVisible && s.inside && prev && next && prev.inside && next.inside) {
      if (atZero(s) && !atZero(prev)) {
        const touching = Math.sign(prev.y) === Math.sign(next.y) && Math.sign(prev.y) !== 0;
        features.push({ x: s.x, y: 0, say: say(touching ? 'touchesXAxis' : 'crossesXAxis', atSay(s.x, res.x)) });
      }
    }
    if (xAxisVisible && s.inside && prev && prev.inside && !atZero(prev) && !atZero(s) && prev.y * s.y < 0) {
      const x0 = prev.x + ((0 - prev.y) * (s.x - prev.x)) / (s.y - prev.y);
      features.push({ x: x0, y: 0, say: say('crossesXAxis', atSay(x0, res.x)) });
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
        if (!touchesAxis) features.push({ x: s.x, y: s.y, say: say(high ? 'highPointAt' : 'lowPointAt', readPairSay(s.x, s.y, res)) });
      }
    }
    if (s.inside && (!next || !next.inside)) {
      if (!next) features.push({ x: s.x, y: s.y, say: say('endsAtRightEdge', readPairSay(s.x, s.y, res)) });
      else if (next.y == null) features.push({ x: s.x, y: s.y, say: say('stopsAt', readPairSay(s.x, s.y, res)) });
      else {
        const edge = next.y > w.yMax ? w.yMax : w.yMin;
        const x = edgeCrossing(s, next, edge);
        features.push({ x, y: edge, say: say(edge === w.yMax ? 'leavesTop' : 'leavesBottom', readPairSay(x, edge, res)) });
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
      if (!said) features.push({ x: 0, say: say('crossesYAxis', atSay(y0, res.y)) });
    }
  }
  features.sort((a, b) => a.x - b.x);
  return { features, visible: samples.some((s) => s.inside) };
};

const describeCurve = (fn, index, count, res, w, dashes = null) => {
  if (typeof fn !== 'function') return null;
  // CoordinatePlane draws the first curve solid and every later one dashed;
  // with one curve there is nothing to tell apart. A figure that says which
  // curves it draws dashed (`curveDashes`, GraphDisplay) is said as drawn.
  const number = index + 1;
  const dashed = dashes ? Boolean(dashes[index]) : count < 2 ? null : index !== 0;
  const subject = dashed === null ? say('curveSubject', number) : say(dashed ? 'dashedCurveSubject' : 'solidCurveSubject', number);
  const { features, visible } = curveFeatures(fn, res, w);
  if (!visible) return say('outsideWindow', subject);
  const shown = features.slice(0, MAX_CURVE_FEATURES).map((f) => f.say);
  if (features.length > MAX_CURVE_FEATURES) shown.push(say('continues'));
  return say('markReading', subject, shown);
};

/* ------------------------------------------------------ shapes and guides */

// Corners or vertices, as many as are said, then how many more there are.
const vertexListSay = (vertices, res) => say(
  'vertices',
  vertices.slice(0, MAX_VERTICES).map(([x, y]) => readPairSay(x, y, res)),
  Math.max(0, vertices.length - MAX_VERTICES),
);

const toolMarkSentence = (toolMarks, detail) => {
  const pick = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  return detail === 'features' ? pick(toolMarks?.features) || pick(toolMarks?.kinds) : pick(toolMarks?.kinds);
};

/* ------------------------------------------------ the platform's sentences */

/*
 * Every sentence the reading below says, by message id (./figureSay.js), in
 * English. ./packs/esFigures.js has the same ids in Spanish; a number, a
 * coordinate or a label is a piece of the message and is said as it is.
 */
export const GRAPH_WORDS = Object.freeze({
  // The window, as the axes print it.
  window: (x0, x1, y0, y1) => `x from ${x0} to ${x1}, y from ${y0} to ${y1}.`,
  xRange: (x0, x1) => `x from ${x0} to ${x1}.`,
  yRange: (y0, y1) => `y from ${y0} to ${y1}.`,
  about: (value) => `about ${value}`,
  axisNumbersHidden: () => 'The axis numbers are not shown.',
  xAxisNumbersHidden: () => 'The x-axis numbers are not shown.',
  yAxisNumbersHidden: () => 'The y-axis numbers are not shown.',
  // What is drawn, never where.
  lineCount: (count) => `${plural(count, 'line')}.`,
  curveCount: (count) => (count > 1 ? `${plural(count, 'curve')}, the first solid and the others dashed.` : '1 curve.'),
  // A figure that draws a line's style or a shaded side (N38): each line is
  // solid or dashed, and a shaded side is said with its line. The side is how
  // the picture is drawn, as an open or a closed dot is; no position is said.
  solidLineCount: (count) => `${plural(count, 'solid line')}.`,
  dashedLineCount: (count) => `${plural(count, 'dashed line')}.`,
  solidLineShaded: (side) => `1 solid line, shaded ${side}.`,
  dashedLineShaded: (side) => `1 dashed line, shaded ${side}.`,
  solidVerticalShaded: (side) => `1 solid vertical line, shaded ${side}.`,
  dashedVerticalShaded: (side) => `1 dashed vertical line, shaded ${side}.`,
  sideAbove: () => 'above',
  sideBelow: () => 'below',
  sideLeft: () => 'to the left',
  sideRight: () => 'to the right',
  // The overlap of a system's shaded sides, drawn as one region.
  regionShaded: (where) => `The region ${where} is shaded.`,
  aboveBothLines: () => 'above both lines',
  belowBothLines: () => 'below both lines',
  aboveOneBelowOther: () => 'above one line and below the other',
  // Said by the way each line goes, which the picture shows: otherwise the two
  // regions between a rising and a falling line would be said alike.
  aboveRisingBelowFalling: () => 'above the rising line and below the falling line',
  belowRisingAboveFalling: () => 'below the rising line and above the falling line',
  solidCurveCount: (count) => `${plural(count, 'solid curve')}.`,
  dashedCurveCount: (count) => `${plural(count, 'dashed curve')}.`,
  dashedPathCount: (count) => `${plural(count, 'dashed connected path')}.`,
  // A line every figure of a sort shares, drawn to compare each one with (CT04).
  referenceLineCount: (count) => `${plural(count, 'reference line')}.`,
  dashedVerticalCount: (count) => `${plural(count, 'dashed vertical line')}.`,
  solidVerticalCount: (count) => `${plural(count, 'solid vertical line')}.`,
  dashedHorizontalCount: (count) => `${plural(count, 'dashed horizontal line')}.`,
  pathCount: (count) => `${plural(count, 'connected path')}.`,
  regionCount: (count) => `${plural(count, 'shaded region')}.`,
  // Text the plane draws beside a plain dot is on the screen; a position is not said.
  givenMarks: (dots, labels, open, closed, arrows) => {
    const parts = [
      dots ? `${plural(dots, 'point')}${labels.length ? ` labelled ${joinClauses(labels)}` : ''}` : '',
      open ? plural(open, 'open dot') : '',
      closed ? plural(closed, 'closed dot') : '',
      arrows ? plural(arrows, 'arrowhead') : '',
    ].filter(Boolean);
    return `${joinClauses(parts).replace(/^./, (c) => c.toUpperCase())}.`;
  },
  // The student's own points, always read back.
  plotted: (pairs) => `${pairs.length === 1 ? 'You plotted 1 point' : `You plotted ${pairs.length} points`}: ${pairs.join('; ')}.`,
  pairApprox: (x, y) => `(x ${x}, y ${y})`,
  between: (lower, upper) => `between ${lower} and ${upper}`,
  nothingPlotted: () => 'Nothing is plotted.',
  nothingPlottedYet: () => 'Nothing is plotted yet.',
  undescribedMarks: () => 'It also shows marks drawn by the activity that are not listed here.',
  positionsWithheld: () => 'Positions are not read out while this question can be answered.',
  givenPositionsWithheld: () => 'Positions of the given marks are not read out while this question can be answered.',
  positionsNotReadHere: () => 'Positions are not read out on this question.',
  // Marks a tool names in its own words (`toolMarks.kinds`): said as one of
  // these when they are these words, and only in English otherwise.
  segmentsFromOrigin: () => 'A segment joins the origin to each point.',
  oneCurve: () => '1 curve.',
  oneShadedRegion: () => '1 shaded region.',
  regionWhereAllTrue: () => '1 shaded region, where every inequality is true.',
  noRegionShadedYet: () => 'No region is shaded yet.',
  // What a static graph's axes count by, on a figure the student can fix (R-9).
  scaleSame: () => 'Both axes now use the same scale.',
  scaleCounts: (x, y) => `The x-axis counts by ${x}s and the y-axis counts by ${y}s.`,

  /*
   * THE FULL READING, once positions may be said: a closed question, or the
   * graph read-out while it is open (AX03). Each line, curve, guide, shaded
   * side, path, region and point, where the grid lets the eye read it.
   */
  // Where a mark meets an axis or a gridline; a value between two gridlines
  // is `between` ("crosses the x-axis between 2 and 3").
  atValue: (value) => `at ${value}`,
  throughValue: (value) => `through ${value}`,
  curveTotal: (count) => `${plural(count, 'curve')}.`,
  // A line or a curve by its name, as drawn, then what it does.
  lineSubject: (number) => `Line ${number}`,
  solidLineSubject: (number) => `Line ${number} (solid)`,
  dashedLineSubject: (number) => `Line ${number} (dashed)`,
  referenceLineSubject: () => 'Reference line',
  dashedReferenceLineSubject: () => 'Reference line (dashed)',
  curveSubject: (number) => `Curve ${number}`,
  solidCurveSubject: (number) => `Curve ${number} (solid)`,
  dashedCurveSubject: (number) => `Curve ${number} (dashed)`,
  markReading: (subject, clauses) => `${subject} ${joinClauses(clauses)}.`,
  outsideWindow: (subject) => `${subject} is outside the window.`,
  isHorizontal: () => 'is horizontal',
  risesLeftToRight: () => 'rises from left to right',
  fallsLeftToRight: () => 'falls from left to right',
  crossesYAxis: (where) => `crosses the y-axis ${where}`,
  crossesXAxis: (where) => `crosses the x-axis ${where}`,
  touchesXAxis: (where) => `touches the x-axis ${where}`,
  passesThrough: (pairs) => `passes through ${pairs.join(' and ')}`,
  startsAtLeftEdge: (at) => `starts at the left edge at ${at}`,
  beginsAt: (at) => `begins at ${at}`,
  comesInTop: (at) => `comes in through the top edge at ${at}`,
  comesInBottom: (at) => `comes in through the bottom edge at ${at}`,
  highPointAt: (at) => `has a high point at ${at}`,
  lowPointAt: (at) => `has a low point at ${at}`,
  endsAtRightEdge: (at) => `ends at the right edge at ${at}`,
  stopsAt: (at) => `stops at ${at}`,
  leavesTop: (at) => `leaves through the top edge at ${at}`,
  leavesBottom: (at) => `leaves through the bottom edge at ${at}`,
  continues: () => 'continues',
  // Guides, said the way they are drawn.
  dashedVerticalAt: (where) => `Dashed vertical line ${where} on the x-axis.`,
  solidVerticalAt: (where) => `Solid vertical line ${where} on the x-axis.`,
  dashedHorizontalAt: (where) => `Dashed horizontal line ${where} on the y-axis.`,
  // Each shaded side with the line it is beside (N38).
  lineRef: (number) => `line ${number}`,
  referenceLineRef: () => 'the reference line',
  verticalLineRef: (where) => `the vertical line ${where}`,
  aboveOf: (line) => `above ${line}`,
  belowOf: (line) => `below ${line}`,
  leftOf: (line) => `to the left of ${line}`,
  rightOf: (line) => `to the right of ${line}`,
  shadedSide: (where) => `Shaded ${where}.`,
  regionShadedSides: (sides) => `The region ${joinClauses(sides)} is shaded.`,
  // Paths and regions by their corners.
  vertices: (pairs, more) => joinClauses(more ? [...pairs, `${more} more`] : pairs),
  pathThrough: (number, vertices) => `Connected path ${number} through ${vertices}.`,
  dashedPathThrough: (number, vertices) => `Connected path ${number} (dashed) through ${vertices}.`,
  regionCorners: (number, vertices) => `Shaded region ${number} with corners at ${vertices}.`,
  // Every point, where it is.
  pointsRead: (dots, arrows, marks) => `${[dots ? plural(dots, 'point') : '', arrows ? plural(arrows, 'arrowhead') : ''].filter(Boolean).join(' and ')}: ${marks.join('; ')}.`,
  pointAt: (label, at) => `${label} at ${at}`,
  openDotAt: (at) => `${at}, open dot`,
  closedDotAt: (at) => `${at}, closed dot`,
  arrowheadAt: (at, direction) => `arrowhead at ${at} pointing ${direction}`,
  pointingRight: () => 'right',
  pointingUpRight: () => 'up and right',
  pointingUp: () => 'up',
  pointingUpLeft: () => 'up and left',
  pointingLeft: () => 'left',
  pointingDownLeft: () => 'down and left',
  pointingDown: () => 'down',
  pointingDownRight: () => 'down and right',
  outsideWindowMark: (mark) => `${mark}, outside the window`,
});

const english = (segment) => sayFigure([segment], GRAPH_WORDS, { english: true });

/** A fixed sentence a caller passes, as its message when it is one of the platform's. */
const graphSentenceSay = (text) => {
  const value = String(text ?? '');
  const found = Object.entries(GRAPH_WORDS).find(([, words]) => words.length === 0 && words() === value);
  return found ? say(found[0]) : englishOnly(value);
};

/* ------------------------------------------------------- shaded sides (N38) */

const SIDE_SAYS = Object.freeze({ above: 'sideAbove', below: 'sideBelow', left: 'sideLeft', right: 'sideRight' });
const SIDE_OF_SAYS = Object.freeze({ above: 'aboveOf', below: 'belowOf', left: 'leftOf', right: 'rightOf' });

/*
 * WHICH DRAWN LINE EACH SHADED SIDE BELONGS TO. A figure's `halfPlanes` say,
 * for each shaded region, the side of each boundary it lies on and which drawn
 * line that boundary is: { sides: [{ side, line | vertical }], polygon }. A
 * region on one side of one drawn line is said with that line ("1 dashed line,
 * shaded below"); one bounded by two drawn lines is a system's overlap; a
 * region whose boundary is not drawn is a shaded region like any other.
 * Entries come back in the figure's order.
 */
const shadingPlan = ({ lines = [], verticalLines = [], halfPlanes = [] }) => {
  const lineSide = new Map();
  const verticalSide = new Map();
  const entries = [];
  const drawnLine = (index) => Number.isInteger(index) && Number.isFinite(Number(lines[index]?.m)) && Number.isFinite(Number(lines[index]?.b));
  const drawnVertical = (index) => Number.isInteger(index) && verticalLines[index] != null;
  (Array.isArray(halfPlanes) ? halfPlanes : []).forEach((region) => {
    const sides = Array.isArray(region?.sides) ? region.sides : [];
    const named = sides.length > 0 && sides.every((entry) => SIDE_SAYS[entry?.side]
      && (drawnLine(entry.line) || drawnVertical(entry.vertical)));
    if (!named) {
      entries.push({ kind: 'region', polygon: region?.polygon });
      return;
    }
    if (sides.length === 1) {
      const [only] = sides;
      const vertical = !drawnLine(only.line);
      const map = vertical ? verticalSide : lineSide;
      const key = vertical ? only.vertical : only.line;
      if (!map.has(key)) {
        map.set(key, only.side);
        entries.push({ kind: vertical ? 'vertical' : 'line', index: key, side: only.side });
        return;
      }
    }
    entries.push({ kind: 'overlap', sides, polygon: region?.polygon });
  });
  return { lineSide, verticalSide, entries };
};

// The overlap of two drawn lines' sides, in words that give no position: null
// for any other overlap, which is then said as a shaded region.
const overlapWhere = (sides, lines = []) => {
  if (sides.length !== 2 || !sides.every((entry) => Number.isInteger(entry.line))) return null;
  const kinds = sides.map((entry) => entry.side).sort().join(',');
  if (kinds === 'above,above') return 'aboveBothLines';
  if (kinds === 'below,below') return 'belowBothLines';
  if (kinds !== 'above,below') return null;
  const slope = (side) => Number(lines[sides.find((entry) => entry.side === side).line]?.m);
  if (slope('above') > 0 && slope('below') < 0) return 'aboveRisingBelowFalling';
  if (slope('above') < 0 && slope('below') > 0) return 'belowRisingAboveFalling';
  return 'aboveOneBelowOther';
};

/* ------------------------------------------- kinds only (still answerable) */

// What is drawn, never where: no crossings, extremes, positions or table.
const describeKinds = ({
  windowSays, res, w, label, hasUndescribedMarks, emptyText, listPlottedPoints, toolMarksText = '',
  points, lines, functions, polylines, regions, verticalLines, horizontalLines, halfPlanes, curveDashes,
  positionsWithheldText,
}) => {
  const plan = shadingPlan({ lines, verticalLines, halfPlanes });
  const finiteLine = (line) => Number.isFinite(Number(line?.m)) && Number.isFinite(Number(line?.b));
  const drawnLines = lines.map((line, index) => ({ line, index })).filter(({ line }) => finiteLine(line));
  const referenceCount = drawnLines.filter(({ line }) => line?.reference === true).length;
  const ownLines = drawnLines.filter(({ line }) => line?.reference !== true);
  // A figure that draws a dashed line or a shaded side says every line's style.
  const styled = ownLines.some(({ line }) => line?.dash) || plan.lineSide.size > 0
    || plan.entries.some((entry) => entry.kind === 'overlap');
  const curves = functions.map((fn, index) => (typeof fn === 'function' ? { dashed: Boolean(curveDashes?.[index]) } : null)).filter(Boolean);
  const curveStyled = Array.isArray(curveDashes) && curves.some((curve) => curve.dashed);
  const verticalDrawings = verticalLines.map((entry, index) => ({ ...verticalLineDrawing(entry), index })).filter((line) => Number.isFinite(line.x));
  const unshadedVerticals = verticalDrawings.filter((line) => !plan.verticalSide.has(line.index));
  const solidVerticals = unshadedVerticals.filter((line) => !line.dash).length;
  const verticals = unshadedVerticals.length - solidVerticals;
  const horizontals = horizontalLines.map(Number).filter(Number.isFinite).length;
  const pathEntries = polylines.filter((entry) => rawPointList(entry).length);
  const dashedPaths = pathEntries.filter((entry) => entry?.dash).length;
  const paths = pathEntries.length - dashedPaths;
  const overlapSays = plan.entries.filter((entry) => entry.kind === 'overlap').map((entry) => overlapWhere(entry.sides, lines));
  const shaded = regions.map(rawPointList).filter((v) => v.length).length
    + plan.entries.filter((entry) => entry.kind === 'region').length
    + overlapSays.filter((where) => !where).length;
  const drawn = points.filter((point) => readGraphPointCoordinates(point));
  const isPlotted = (point) => listPlottedPoints && !point?.marker && point?.movable !== false;
  const given = drawn.filter((point) => !isPlotted(point));
  const plotted = drawn.filter(isPlotted);

  const says = [...windowSays];
  if (styled) {
    ownLines.forEach(({ line, index }) => {
      if (plan.lineSide.has(index)) says.push(say(line?.dash ? 'dashedLineShaded' : 'solidLineShaded', say(SIDE_SAYS[plan.lineSide.get(index)])));
    });
    const unshaded = ownLines.filter(({ index }) => !plan.lineSide.has(index));
    const solidLines = unshaded.filter(({ line }) => !line?.dash).length;
    if (solidLines) says.push(say('solidLineCount', solidLines));
    if (unshaded.length - solidLines) says.push(say('dashedLineCount', unshaded.length - solidLines));
  } else if (ownLines.length) says.push(say('lineCount', ownLines.length));
  if (referenceCount) says.push(say('referenceLineCount', referenceCount));
  if (curveStyled) {
    const dashedCurves = curves.filter((curve) => curve.dashed).length;
    if (curves.length - dashedCurves) says.push(say('solidCurveCount', curves.length - dashedCurves));
    says.push(say('dashedCurveCount', dashedCurves));
  } else if (curves.length) says.push(say('curveCount', curves.length));
  verticalDrawings.forEach((line) => {
    if (plan.verticalSide.has(line.index)) says.push(say(line.dash ? 'dashedVerticalShaded' : 'solidVerticalShaded', say(SIDE_SAYS[plan.verticalSide.get(line.index)])));
  });
  if (verticals) says.push(say('dashedVerticalCount', verticals));
  if (solidVerticals) says.push(say('solidVerticalCount', solidVerticals));
  if (horizontals) says.push(say('dashedHorizontalCount', horizontals));
  if (paths) says.push(say('pathCount', paths));
  if (dashedPaths) says.push(say('dashedPathCount', dashedPaths));
  overlapSays.filter(Boolean).forEach((where) => says.push(say('regionShaded', say(where))));
  if (shaded) says.push(say('regionCount', shaded));
  if (given.length) {
    const arrows = given.filter((point) => point?.marker === 'arrow').length;
    const open = given.filter((point) => point?.marker === 'open').length;
    const closed = given.filter((point) => point?.marker === 'closed').length;
    const dots = given.length - arrows - open - closed;
    const labels = given.filter((point) => !point?.marker && point?.label != null && String(point.label).trim()).map((point) => String(point.label).trim());
    says.push(say('givenMarks', dots, labels, open, closed, arrows));
  }
  if (plotted.length) {
    says.push(say('plotted', plotted.map((point) => { const [x, y] = readGraphPointCoordinates(point); return readPairSay(x, y, res); })));
  }
  // Every vertical line counts as drawn, solid as well as dashed: a figure of
  // a solid boundary x = c alone said "Nothing is plotted." after it.
  const marks = drawnLines.length + curves.length + verticalDrawings.length + horizontals + pathEntries.length
    + shaded + overlapSays.filter(Boolean).length;
  const described = marks + drawn.length;
  if (!described && !hasUndescribedMarks) says.push(graphSentenceSay(emptyText));
  if (hasUndescribedMarks) says.push(toolMarksText ? graphSentenceSay(toolMarksText) : say('undescribedMarks'));
  if (marks + given.length || (hasUndescribedMarks && toolMarksText)) {
    // The student's own points were just read out: what is withheld is the rest.
    says.push(positionsWithheldText
      ? graphSentenceSay(positionsWithheldText)
      : say(plotted.length ? 'givenPositionsWithheld' : 'positionsWithheld'));
  }
  void w;
  const sentences = says.map(english);
  const description = sentences.join(' ');
  return { summary: label ? `${label}, ${description}` : description, description, sentences, tables: [], detail: 'kinds', say: says };
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
  // WHAT A TOOL DRAWS ITSELF (its `children`: Complex Plane segments, a
  // sideways parabola, an inequality's shading), in the tool's own words:
  // { kinds, features }. The plane picks by its own detail — `kinds` while
  // the question can be answered (no position or value, the rule everything
  // here follows), `features` once it is closed (else `kinds`) — so a tool
  // cannot say more than the plane would. Without it, "marks … not listed".
  toolMarks = null,
  emptyText = 'Nothing is plotted.',
  // 'kinds' (default — fails closed) or 'features'. See the module header.
  detail = 'kinds',
  // Whether the plane draws its snap-step minor grid (CoordinatePlane's
  // showMinorGrid). Values are never read more finely than what is drawn.
  minorGridDrawn = false,
  // An interactive plane: read back the points the student placed (no marker,
  // not fixed) even in 'kinds'.
  listPlottedPoints = false,
  // AN AXIS WHOSE NUMBERS THE GRAPH HIDES (graph.axisDisplay: an axis-scale
  // item asks the student for the step). Its range is not said — with the
  // gridlines, the window's ends give the step away — and nothing is read in
  // tick units the student never saw, so the whole reading stays 'kinds',
  // closed question or not (student pass 3, W5-2 review B1).
  axisNumbersHidden = { x: false, y: false },
  // The labelled tick steps, when a window's ends may fall between ticks: the
  // ends are then read "about" at tick precision (windowEndSay).
  windowSteps = null,
  // The sentence that says positions are withheld, for a host that knows why:
  // a closed question whose review is not shown cannot "be answered".
  positionsWithheldText = null,
  // THE SHADED SIDES OF A FIGURE'S INEQUALITIES (N38): one entry per shaded
  // region, { sides: [{ side: 'above' | 'below' | 'left' | 'right', line |
  // vertical }], polygon }, where `line` and `vertical` index the `lines` and
  // `verticalLines` above. See shadingPlan.
  halfPlanes = [],
  // Which `functions` a figure draws dashed (true) and which solid, when it
  // says (GraphDisplay). Without it, CoordinatePlane's rule: the first solid,
  // the others dashed.
  curveDashes = null,
} = {}) {
  const w = { xMin: Number(xMin), xMax: Number(xMax), yMin: Number(yMin), yMax: Number(yMax) };
  const xStep = Number(xTickStep) > 0 ? Number(xTickStep) : niceStep(w.xMax - w.xMin);
  const yStep = Number(yTickStep) > 0 ? Number(yTickStep) : niceStep(w.yMax - w.yMin);
  const res = {
    x: resolutionFor(w.xMax - w.xMin, snapStep, xStep, minorGridDrawn),
    y: resolutionFor(w.yMax - w.yMin, snapStep, yStep, minorGridDrawn),
  };
  const list = (value) => (Array.isArray(value) ? value : []);

  const hideX = axisNumbersHidden?.x === true;
  const hideY = axisNumbersHidden?.y === true;
  const end = (value, axis) => (windowSteps ? windowEndSay(value, windowSteps[axis]) : formatNumber(value));
  const xEnds = [end(w.xMin, 'x'), end(w.xMax, 'x')];
  const yEnds = [end(w.yMin, 'y'), end(w.yMax, 'y')];
  let windowSays;
  if (hideX && hideY) windowSays = [say('axisNumbersHidden')];
  else if (hideX) windowSays = [say('yRange', ...yEnds), say('xAxisNumbersHidden')];
  else if (hideY) windowSays = [say('xRange', ...xEnds), say('yAxisNumbersHidden')];
  else windowSays = [say('window', ...xEnds, ...yEnds)];

  if (detail !== 'features' || hideX || hideY) {
    return describeKinds({
      windowSays, res, w, label, hasUndescribedMarks, emptyText, listPlottedPoints, positionsWithheldText,
      toolMarksText: toolMarkSentence(toolMarks, 'kinds'),
      points: list(points), lines: list(lines), functions: list(functions), polylines: list(polylines),
      regions: list(regions), verticalLines: list(verticalLines), horizontalLines: list(horizontalLines),
      halfPlanes: list(halfPlanes), curveDashes: Array.isArray(curveDashes) ? curveDashes : null,
    });
  }

  // The full reading, as messages like the reading above (AX05): Read aloud
  // says it in Spanish under an authored Spanish translation, with the same
  // numbers. Its English is said from the same messages.
  const says = [...windowSays];
  const plan = shadingPlan({ lines: list(lines), verticalLines: list(verticalLines), halfPlanes: list(halfPlanes) });
  const styled = list(lines).some((line) => line?.reference !== true && line?.dash) || plan.lineSide.size > 0
    || plan.entries.some((entry) => entry.kind === 'overlap');
  // Each line's name, said in its own sentence and wherever a shaded side
  // names it: a sort's shared reference line is "Reference line" (CT04).
  const lineNames = new Map();
  const lineRefs = new Map();
  let lineNumber = 0;
  const lineEntries = list(lines).map((line, i) => {
    const reference = line?.reference === true;
    if (!reference) lineNumber += 1;
    const entry = describeLine(line, lineSubjectSay(line, lineNumber, styled), res, w);
    if (entry) {
      lineNames.set(i, reference ? 'Reference line' : `Line ${lineNumber}`);
      lineRefs.set(i, reference ? say('referenceLineRef') : say('lineRef', lineNumber));
    }
    return entry;
  }).filter(Boolean);
  const ownLineCount = list(lines).filter((line, i) => lineNames.has(i) && line?.reference !== true).length;
  if (ownLineCount) says.push(say('lineCount', ownLineCount));
  if (lineEntries.length > ownLineCount) says.push(say('referenceLineCount', lineEntries.length - ownLineCount));
  says.push(...lineEntries);

  const curveIndexes = list(functions).map((fn, i) => (typeof fn === 'function' ? i : null)).filter((i) => i !== null);
  const curveFns = curveIndexes.map((i) => list(functions)[i]);
  const dashes = Array.isArray(curveDashes) && curveIndexes.some((i) => curveDashes[i]) ? curveIndexes.map((i) => Boolean(curveDashes[i])) : null;
  const curveEntries = curveFns.map((fn, i) => describeCurve(fn, i, curveFns.length, res, w, dashes)).filter(Boolean);
  if (curveEntries.length) says.push(say('curveTotal', curveEntries.length), ...curveEntries);

  // Said the way it is drawn: a guide or a strict boundary dashed, an inclusive one solid.
  const verticalEntries = list(verticalLines).map((entry, index) => ({ ...verticalLineDrawing(entry), index }));
  const verticals = verticalEntries.filter((line) => Number.isFinite(line.x));
  const horizontals = list(horizontalLines).map(Number).filter(Number.isFinite);
  verticals.forEach(({ x, dash }) => says.push(say(dash ? 'dashedVerticalAt' : 'solidVerticalAt', throughSay(x, res.x))));
  horizontals.forEach((y) => says.push(say('dashedHorizontalAt', throughSay(y, res.y))));

  // Each shaded side, said with the line it is beside (N38).
  const sideOf = (entry) => say(SIDE_OF_SAYS[entry.side], Number.isInteger(entry.line) && lineRefs.has(entry.line)
    ? lineRefs.get(entry.line)
    : say('verticalLineRef', throughSay(verticalEntries[entry.vertical]?.x, res.x)));
  const looseRegions = [];
  plan.entries.forEach((entry) => {
    if (entry.kind === 'line') says.push(say('shadedSide', sideOf({ line: entry.index, side: entry.side })));
    else if (entry.kind === 'vertical') says.push(say('shadedSide', sideOf({ vertical: entry.index, side: entry.side })));
    else if (entry.kind === 'overlap') says.push(say('regionShadedSides', entry.sides.map(sideOf)));
    else looseRegions.push(entry.polygon);
  });

  const polyEntries = list(polylines).filter((entry) => rawPointList(entry).length);
  const polyVertices = polyEntries.map(rawPointList);
  polyEntries.forEach((entry, i) => {
    says.push(say(entry?.dash ? 'dashedPathThrough' : 'pathThrough', i + 1, vertexListSay(polyVertices[i], res)));
  });

  const regionVertices = [...list(regions), ...looseRegions].map(rawPointList).filter((v) => v.length);
  regionVertices.forEach((vertices, i) => {
    says.push(say('regionCorners', i + 1, vertexListSay(vertices, res)));
  });

  const pointEntries = describePoints(list(points), res, w);
  if (pointEntries.length) {
    const dots = pointEntries.filter((p) => p.kind === 'point').length;
    says.push(say('pointsRead', dots, pointEntries.length - dots, pointEntries.map((p) => p.say)));
  }

  const described = lineEntries.length + curveEntries.length + verticals.length + horizontals.length
    + polyVertices.length + regionVertices.length + plan.entries.filter((entry) => entry.kind !== 'region').length + pointEntries.length;
  if (!described && !hasUndescribedMarks) says.push(graphSentenceSay(emptyText));
  if (hasUndescribedMarks) {
    const own = toolMarkSentence(toolMarks, 'features');
    says.push(own ? graphSentenceSay(own) : say('undescribedMarks'));
  }
  const sentences = says.map(english);

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
      ...list(lines).map((line, i) => ({ name: lineNames.get(i) || `Line ${i + 1}`, at: (x) => (Number.isFinite(Number(line?.m)) && Number.isFinite(Number(line?.b)) ? Number(line.m) * x + Number(line.b) : null) })),
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
    detail: 'features',
    say: says,
  };
}

export default describeCoordinatePlane;
