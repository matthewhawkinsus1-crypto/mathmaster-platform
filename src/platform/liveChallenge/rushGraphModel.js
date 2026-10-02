/*
 * GRAPH FEATURE RUSH: THE STUDENT'S GRAPH AS GEOMETRY.
 *
 * Everything the rush renderer draws, computed without React or the DOM so it
 * is tested in node: the curve as SVG path data, the grid and its labels,
 * asymptotes and endpoint dots, and the conversions between a point on the
 * screen and a point on the graph.
 *
 * UNIT SPACE. The plot is a unit square — (0,0) top-left, (1,1) bottom-right —
 * scaled by the renderer to whatever square the screen allows. A question's
 * drawing is computed once; a phone rotating or a Chromebook window resizing
 * only changes the scale. Generated views are chosen for a square plot (their
 * spacing rules are fractions of the view), so the square keeps them true.
 *
 * The curve is sampled from the same graph spec the server validated the
 * question with (graphFeatureCurves.mjs): the graph a student sees is the graph
 * the answer key was checked against.
 */

import { evaluateGraph, graphAsymptotes, graphMarkers, sampleGraph } from '../../../functions/shared/graphFeatureCurves.mjs';
import { POINTER_KIND, toleranceForPointer } from '../../../functions/shared/graphFeatureHitTest.mjs';

const finite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

// Five decimals of a unit square: a hundredth of a pixel on a 1000px plot.
const unitText = (value) => String(Math.round(value * 100000) / 100000);

export const viewSpan = (view = {}) => ({
  x: Math.max(1e-9, finite(view.xMax, 10) - finite(view.xMin, -10)),
  y: Math.max(1e-9, finite(view.yMax, 10) - finite(view.yMin, -10)),
});

/** Graph x to unit-space u (0 at the left edge). */
export const unitX = (view, x) => (finite(x) - finite(view.xMin, -10)) / viewSpan(view).x;
/** Graph y to unit-space v (0 at the top edge). */
export const unitY = (view, y) => (finite(view.yMax, 10) - finite(y)) / viewSpan(view).y;

/** Unit-space (u, v) back to the graph point under it. */
export const graphPointAt = (view, u, v) => ({
  x: finite(view.xMin, -10) + u * viewSpan(view).x,
  y: finite(view.yMax, 10) - v * viewSpan(view).y,
});

/**
 * The curve as SVG path data in unit space, one path per continuous piece.
 * Pieces may run past the plot (the sampler extends one view height above and
 * below); the renderer clips to the unit square.
 */
export const curvePaths = (graph, view) => sampleGraph(graph, view).map((polyline) => polyline
  .map(([x, y], index) => `${index ? 'L' : 'M'}${unitText(unitX(view, x))} ${unitText(unitY(view, y))}`)
  .join(''));

const stepsWithin = (low, high, step) => {
  if (!(step > 0)) return [];
  const values = [];
  for (let value = Math.ceil(low / step) * step; value <= high + 1e-9; value += step) {
    // Snap away float drift (0.30000000000000004) and negative zero.
    const clean = Math.round(value * 1e6) / 1e6;
    values.push(clean === 0 ? 0 : clean);
  }
  return values;
};

/**
 * Grid lines at the view's tick steps, and where the axes cross. The origin
 * is always inside a generated view, so both axes are always drawn.
 */
export const gridLines = (view = {}) => {
  const xMin = finite(view.xMin, -10);
  const xMax = finite(view.xMax, 10);
  const yMin = finite(view.yMin, -10);
  const yMax = finite(view.yMax, 10);
  const xStep = finite(view.xStep, 1) || 1;
  const yStep = finite(view.yStep, 1) || 1;
  return Object.freeze({
    verticals: stepsWithin(xMin, xMax, xStep).map((value) => ({ value, u: unitX(view, value) })),
    horizontals: stepsWithin(yMin, yMax, yStep).map((value) => ({ value, v: unitY(view, value) })),
    axisU: unitX(view, Math.min(xMax, Math.max(xMin, 0))),
    axisV: unitY(view, Math.min(yMax, Math.max(yMin, 0))),
  });
};

// Labels closer than this on screen are thinned to every other one.
export const MIN_LABEL_SPACING_PX = 26;
// A label this close to the edge of the plot would be cut in half.
const LABEL_EDGE = 0.03;

/**
 * Which grid values get a number on the axis, for a plot `sidePx` wide. Zero
 * is labelled once, at the origin, by the renderer; the lines at the very
 * edge of the plot go unlabelled rather than half-drawn.
 */
export const axisLabels = (view, sidePx) => {
  const { verticals, horizontals } = gridLines(view);
  const thin = (lines, spanSteps) => {
    const spacing = finite(sidePx, 0) / Math.max(1, spanSteps);
    const every = spacing >= MIN_LABEL_SPACING_PX ? 1 : spacing * 2 >= MIN_LABEL_SPACING_PX ? 2 : 5;
    return lines.filter((line) => line.value !== 0
      && Math.round(line.index) % every === 0
      && (line.u ?? line.v) > LABEL_EDGE
      && (line.u ?? line.v) < 1 - LABEL_EDGE);
  };
  const xStep = finite(view.xStep, 1) || 1;
  const yStep = finite(view.yStep, 1) || 1;
  const indexed = (lines, step) => lines.map((line) => ({ ...line, index: line.value / step }));
  return Object.freeze({
    x: thin(indexed(verticals, xStep), viewSpan(view).x / xStep),
    y: thin(indexed(horizontals, yStep), viewSpan(view).y / yStep),
  });
};

/** Dashed asymptote lines inside the view, in unit space. */
export const asymptoteLines = (graph, view = {}) => {
  const { vertical, horizontal } = graphAsymptotes(graph);
  const inside = (value, low, high) => value > finite(low) && value < finite(high);
  return Object.freeze({
    vertical: vertical.filter((x) => inside(x, view.xMin, view.xMax)).map((x) => unitX(view, x)),
    horizontal: horizontal.filter((y) => inside(y, view.yMin, view.yMax)).map((y) => unitY(view, y)),
  });
};

/** Endpoint dots (closed or open) in unit space. */
export const endpointDots = (graph, view = {}) => graphMarkers(graph, view)
  .map((marker) => ({ u: unitX(view, marker.x), v: unitY(view, marker.y), closed: marker.closed === true }));

/** Everything a question draws, computed once per question. */
export const graphDrawing = (question) => {
  if (!question?.graph || !question?.view) return null;
  const { graph, view } = question;
  return Object.freeze({
    paths: Object.freeze(curvePaths(graph, view)),
    grid: gridLines(view),
    asymptotes: asymptoteLines(graph, view),
    dots: Object.freeze(endpointDots(graph, view)),
  });
};

/* ------------------------------ numbers shown ----------------------------- */

const MINUS = '−';

/** A coordinate as a student writes it: −4, 2.5, 0. */
export const formatCoordinate = (value) => {
  const numeric = Math.round(finite(value) * 1000) / 1000;
  if (numeric === 0) return '0';
  const text = String(Math.abs(numeric));
  return numeric < 0 ? `${MINUS}${text}` : text;
};

export const formatPoint = (point = {}) => `(${formatCoordinate(point.x)}, ${formatCoordinate(point.y)})`;

/* --------------------------------- input --------------------------------- */

/** The pointer kind the hit test sizes a tap for. A touchpad reports "mouse". */
export const pointerKindOf = (pointerType) => {
  if (pointerType === 'touch') return POINTER_KIND.TOUCH;
  if (pointerType === 'pen') return POINTER_KIND.PEN;
  return POINTER_KIND.MOUSE;
};

/**
 * The graph point under a pointer, given the plot's on-screen rectangle.
 * Null outside the plot: a tap in the margin is not an answer.
 */
export const tapPoint = ({ clientX, clientY, rect, view }) => {
  const width = finite(rect?.width, 0);
  const height = finite(rect?.height, 0);
  if (!(width > 0) || !(height > 0)) return null;
  const u = (finite(clientX, Number.NaN) - finite(rect.left, 0)) / width;
  const v = (finite(clientY, Number.NaN) - finite(rect.top, 0)) / height;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  return graphPointAt(view, u, v);
};

/** How far from a target a tap may land, in graph units, for this plot. */
export const tapTolerance = ({ pointer, rect, view }) => {
  const span = viewSpan(view);
  return toleranceForPointer({
    pointer,
    pxPerUnitX: finite(rect?.width, 0) / span.x,
    pxPerUnitY: finite(rect?.height, 0) / span.y,
    view,
  });
};

/*
 * THE KEYBOARD CURSOR. Every target sits on a half-unit grid, so a cursor that
 * moves half a unit can land exactly on any of them; Shift moves a whole tick.
 * It starts at the origin, which every generated view contains.
 */
export const KEYBOARD_STEP = 0.5;

const KEY_DIRECTIONS = Object.freeze({
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
});

export const isCursorKey = (key) => Object.prototype.hasOwnProperty.call(KEY_DIRECTIONS, key) || key === 'Home';

const clampTo = (value, low, high) => Math.min(high, Math.max(low, value));

export const initialCursor = (view = {}) => ({
  x: clampTo(0, finite(view.xMin, -10), finite(view.xMax, 10)),
  y: clampTo(0, finite(view.yMin, -10), finite(view.yMax, 10)),
});

/** The cursor after a key press, kept inside the view and on the half grid. */
export const moveCursor = (view = {}, cursor = {}, key, { large = false } = {}) => {
  if (key === 'Home') return initialCursor(view);
  const direction = KEY_DIRECTIONS[key];
  if (!direction) return cursor;
  const stepX = large ? finite(view.xStep, 1) || 1 : KEYBOARD_STEP;
  const stepY = large ? finite(view.yStep, 1) || 1 : KEYBOARD_STEP;
  const snap = (value) => Math.round(value / KEYBOARD_STEP) * KEYBOARD_STEP;
  return {
    x: clampTo(snap(finite(cursor.x) + direction[0] * stepX), finite(view.xMin, -10), finite(view.xMax, 10)),
    y: clampTo(snap(finite(cursor.y) + direction[1] * stepY), finite(view.yMin, -10), finite(view.yMax, 10)),
  };
};

/**
 * What a screen reader hears as the cursor moves: where it is, and where the
 * curve is at that x — the same information a sighted student reads off the
 * graph, so the game can be played without seeing it.
 */
export const describeCursor = (question, cursor) => {
  if (!question?.graph) return '';
  const curveY = evaluateGraph(question.graph, cursor.x);
  const rounded = Math.round(curveY * 100) / 100;
  let curve = 'The curve does not reach this x.';
  // A curve hugging the axis is not on it: rounding 0.003 to "y 0" would
  // announce an x-intercept that is not there.
  if (Number.isFinite(curveY) && rounded === 0 && Math.abs(curveY) > 1e-9) {
    curve = `The curve is just ${curveY > 0 ? 'above' : 'below'} y 0.`;
  } else if (Number.isFinite(curveY)) {
    curve = `The curve is at y ${formatCoordinate(rounded)}.`;
  }
  return `Pointer at ${formatPoint(cursor)}. ${curve}`;
};
