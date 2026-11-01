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
 *
 * ARROWS AND DOTS. Wherever the curve leaves the plot it gets an arrowhead,
 * and wherever it ends inside the plot a dot (filled: the point is on the
 * graph; open: it is not). The arrows come from the same analysis the
 * generator issued the graph by (curveRuns), which only issues a graph whose
 * curve leaves the screen at its ends: an arrow always means "keeps going".
 *
 * An asymptote question hides the dashed asymptote lines (they are the
 * answer); each one is drawn, labelled "x = 2", once it is found.
 */

import { curveRuns, evaluateGraph, graphAsymptotes, graphMarkers, sampleGraph } from '../../../functions/shared/graphFeatureCurves.mjs';
import { POINTER_KIND, clampTolerance, targetDistance, toleranceForPointer } from '../../../functions/shared/graphFeatureHitTest.mjs';
import { GRAPH_FEATURE } from '../../../functions/shared/graphFeatureRegistry.mjs';

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

// How far back along the curve an arrow takes its direction, in unit space:
// far enough to be steady, near enough to follow the curve at the edge.
const ARROW_REACH = 0.03;

/**
 * An arrowhead wherever the curve leaves the plot: its tip on the edge, at
 * (u, v), pointing the way the curve goes out, (dx, dy) — a unit vector in
 * unit space, which is square, so it is the direction on the screen too.
 */
export const curveArrows = (graph, view = {}) => {
  const span = viewSpan(view);
  const arrow = (end, outward) => {
    const tip = { u: unitX(view, end.x), v: unitY(view, end.y) };
    let back = null;
    for (const fraction of [0.002, 0.004, 0.008, 0.016, 0.032, 0.064]) {
      const x = end.x - outward * fraction * span.x;
      const y = evaluateGraph(graph, x);
      if (!Number.isFinite(y)) break;
      back = { u: unitX(view, x), v: unitY(view, y) };
      if (Math.hypot(tip.u - back.u, tip.v - back.v) >= ARROW_REACH) break;
    }
    if (!back) return null;
    const length = Math.hypot(tip.u - back.u, tip.v - back.v);
    if (!(length > 0)) return null;
    return Object.freeze({ ...tip, dx: (tip.u - back.u) / length, dy: (tip.v - back.v) / length, edge: end.edge });
  };
  return curveRuns(graph, view).flatMap((segment) => segment.runs.flatMap((run) => [
    run.from.kind === 'exit' ? arrow(run.from, -1) : null,
    run.to.kind === 'exit' ? arrow(run.to, 1) : null,
  ])).filter(Boolean);
};

/** Whether a question asks for its asymptotes (so they are not drawn). */
export const hidesAsymptotes = (question) => question?.feature === GRAPH_FEATURE.ASYMPTOTE;

/** Everything a question draws, computed once per question. */
export const graphDrawing = (question) => {
  if (!question?.graph || !question?.view) return null;
  const { graph, view } = question;
  return Object.freeze({
    paths: Object.freeze(curvePaths(graph, view)),
    grid: gridLines(view),
    // An asymptote question's asymptotes are its answer: not drawn until found.
    asymptotes: hidesAsymptotes(question) ? Object.freeze({ vertical: [], horizontal: [] }) : asymptoteLines(graph, view),
    dots: Object.freeze(endpointDots(graph, view)),
    arrows: Object.freeze(curveArrows(graph, view)),
  });
};

/** A line target (an asymptote) in unit space: where it crosses the plot. */
export const lineTargetUnit = (view, target) => (target?.orientation === 'vertical'
  ? { orientation: 'vertical', u: unitX(view, target.x) }
  : { orientation: 'horizontal', v: unitY(view, target.y) });

/**
 * Where a found line's label goes, in unit space, clear of the curve: near the
 * top of a vertical line, on the side the curve does not run up (a rational
 * branch climbs one side of its asymptote); near the right end of a
 * horizontal line, on the side of it the curve is not. `anchor` is the text's
 * anchor, `side` which way it sits from the line.
 */
export const lineLabelSpot = (question, target) => {
  const { graph, view } = question;
  const span = viewSpan(view);
  // How far from the top (vertical) or from the line (horizontal) the curve is
  // at x: a curve off the screen above counts as at the top.
  const curveV = (x) => {
    const y = evaluateGraph(graph, x);
    return Number.isFinite(y) ? unitY(view, y) : null;
  };
  if (target.orientation === 'vertical') {
    const u = unitX(view, target.x);
    const nearTop = (x) => {
      const v = curveV(x);
      return v === null ? 1 : Math.max(0, v);
    };
    let side = nearTop(target.x - 0.04 * span.x) >= nearTop(target.x + 0.04 * span.x) ? 'left' : 'right';
    if (u > 0.85) side = 'left';
    if (u < 0.15) side = 'right';
    return Object.freeze({ u, v: 0.04, side, anchor: side === 'left' ? 'end' : 'start' });
  }
  const v = unitY(view, target.y);
  const curve = curveV(view.xMax - 0.06 * span.x);
  let side = curve !== null && curve < v ? 'below' : 'above';
  if (v < 0.08) side = 'below';
  if (v > 0.92) side = 'above';
  return Object.freeze({ u: 0.98, v, side, anchor: 'end' });
};

/**
 * Whether a tap lands on an open dot, within the same reach as a tap on a
 * target: a miss there is told "Open dot — that point isn't on the graph".
 */
export const nearOpenDot = ({ question, x, y, tolerance }) => {
  if (!question?.graph || !question?.view) return false;
  const limits = clampTolerance(tolerance, question.view);
  return graphMarkers(question.graph, question.view)
    .some((marker) => marker.closed !== true && targetDistance(marker, { x: Number(x), y: Number(y) }, limits) <= 1);
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

/** A target as a student writes it: a point "(2, −1)", or a line "x = 2" / "y = −1". */
export const formatTarget = (target = {}) => {
  if (target?.geometry === 'line') {
    return target.orientation === 'vertical' ? `x = ${formatCoordinate(target.x)}` : `y = ${formatCoordinate(target.y)}`;
  }
  return formatPoint(target);
};

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
