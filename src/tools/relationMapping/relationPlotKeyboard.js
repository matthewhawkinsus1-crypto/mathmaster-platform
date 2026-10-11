/*
 * THE RELATION PLOT'S GRID, SHARED BY THE POINTER AND THE KEYBOARD.
 *
 * RelationCoordinatePlot (RelationMapping.jsx) used to be click-only: a
 * keyboard student could not plot at all unless the author had turned on typed
 * entry (KEYBOARD_SWEEP.md, T1). The plot now also takes a crosshair moved by
 * the arrow keys, and Enter/Space toggles the point under it.
 *
 * Everything that decides WHICH point a gesture lands on, and what the plotted
 * list becomes, lives here as pure functions, so the pointer route and the
 * keyboard route provably reach the same grid points and record the same
 * state (tests/tools/relationMappingKeyboardPlot.test.mjs grades both through
 * the real shared grader). Nothing here knows the answer: a message says where
 * the crosshair or a point is, never whether it is right.
 */

export const RELATION_PLOT_SIZE = 430;
export const RELATION_PLOT_PAD = 34;
/** Shift + arrow moves the crosshair this many grid steps. */
export const RELATION_PLOT_LARGE_STEP = 5;

const EPSILON = 1e-9;

/** The plotting window for a relation's pairs: at least -5..5, one past every pair. */
export function relationPlotBounds(pairs) {
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const rawMinX = Math.floor(Math.min(...xs) - 1);
  const rawMaxX = Math.ceil(Math.max(...xs) + 1);
  const rawMinY = Math.floor(Math.min(...ys) - 1);
  const rawMaxY = Math.ceil(Math.max(...ys) + 1);
  return {
    xMin: Math.min(-5, rawMinX),
    xMax: Math.max(5, rawMaxX),
    yMin: Math.min(-5, rawMinY),
    yMax: Math.max(5, rawMaxY),
  };
}

/** The authored snap step, or 1 when it is missing or not a positive number. */
export function relationPlotStep(snapStep) {
  const step = Number(snapStep);
  return Number.isFinite(step) && step > 0 ? step : 1;
}

/** The nearest grid value. toFixed also turns -0 into 0. */
export function snapRelationPlotValue(value, step) {
  return Number((Math.round(value / step) * step).toFixed(8));
}

const inner = () => RELATION_PLOT_SIZE - RELATION_PLOT_PAD * 2;

/**
 * POINTER ROUTE. A point in the drawing's own viewBox coordinates (already
 * mapped from the tap by clientPointToViewBox) to the snapped grid point it
 * plots, or null when that snaps outside the plotting window.
 */
export function relationPlotPointAtViewBox({ x: px, y: py }, bounds, snapStep) {
  const { xMin, xMax, yMin, yMax } = bounds;
  const step = relationPlotStep(snapStep);
  const rawX = xMin + ((px - RELATION_PLOT_PAD) / inner()) * (xMax - xMin);
  const rawY = yMax - ((py - RELATION_PLOT_PAD) / inner()) * (yMax - yMin);
  const x = snapRelationPlotValue(rawX, step);
  const y = snapRelationPlotValue(rawY, step);
  if (x < xMin || x > xMax || y < yMin || y > yMax) return null;
  return [x, y];
}

/** Where the grid point (x, y) is drawn, in viewBox coordinates. */
export function relationPlotViewBoxOf([x, y], bounds) {
  const { xMin, xMax, yMin, yMax } = bounds;
  return {
    x: RELATION_PLOT_PAD + ((x - xMin) / (xMax - xMin)) * inner(),
    y: RELATION_PLOT_PAD + ((yMax - y) / (yMax - yMin)) * inner(),
  };
}

// The grid value nearest `value` that is still inside [min, max] — the same
// set of values a tap can produce, since a tap that snaps outside is ignored.
const keepOnGrid = (value, min, max, step) => {
  if (value > max + EPSILON) return snapRelationPlotValue(Math.floor(max / step + EPSILON) * step, step);
  if (value < min - EPSILON) return snapRelationPlotValue(Math.ceil(min / step - EPSILON) * step, step);
  return value;
};

/** KEYBOARD ROUTE. Where the crosshair starts: the origin (always in the window). */
export function initialRelationCrosshair(bounds, snapStep) {
  const step = relationPlotStep(snapStep);
  return [
    keepOnGrid(snapRelationPlotValue(Math.min(Math.max(0, bounds.xMin), bounds.xMax), step), bounds.xMin, bounds.xMax, step),
    keepOnGrid(snapRelationPlotValue(Math.min(Math.max(0, bounds.yMin), bounds.yMax), step), bounds.yMin, bounds.yMax, step),
  ];
}

const ARROWS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/**
 * KEYBOARD ROUTE. The crosshair after an arrow key (one grid step; Shift for
 * five), held inside the window. Any other key returns null.
 */
export function moveRelationCrosshair(cursor, key, { bounds, snapStep, shift = false }) {
  const direction = ARROWS[key];
  if (!direction) return null;
  const step = relationPlotStep(snapStep);
  const base = Array.isArray(cursor) ? cursor : initialRelationCrosshair(bounds, step);
  const by = step * (shift ? RELATION_PLOT_LARGE_STEP : 1);
  return [
    keepOnGrid(snapRelationPlotValue(base[0] + direction[0] * by, step), bounds.xMin, bounds.xMax, step),
    keepOnGrid(snapRelationPlotValue(base[1] + direction[1] * by, step), bounds.yMin, bounds.yMax, step),
  ];
}

const same = (a, b) => Math.abs(a - b) < EPSILON;

export function relationPointIsPlotted(points, x, y) {
  return (Array.isArray(points) ? points : []).some(([px, py]) => same(px, x) && same(py, y));
}

/**
 * BOTH ROUTES. The plotted list after a click / Enter at (x, y): the point is
 * removed if it is already plotted, otherwise appended. A value that is not a
 * finite number leaves the list as it was.
 */
export function toggleRelationPlottedPoint(points, x, y) {
  const current = Array.isArray(points) ? points : [];
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return current;
  return relationPointIsPlotted(current, nx, ny)
    ? current.filter(([px, py]) => !same(px, nx) || !same(py, ny))
    : [...current, [nx, ny]];
}

const pair = ([x, y]) => `(${x}, ${y})`;

/** What the live region says when the crosshair moves. Positions only. */
export function relationCrosshairMessage(cursor, points) {
  return `Crosshair at ${pair(cursor)}${relationPointIsPlotted(points, cursor[0], cursor[1]) ? ', on a plotted point' : ''}.`;
}

/** What the live region says after Enter/Space. Positions only, never a verdict. */
export function relationToggleMessage(cursor, wasPlotted) {
  return `${wasPlotted ? 'Removed' : 'Plotted'} ${pair(cursor)}.`;
}

/** The plot's short keyboard instruction (its accessible description). */
export function relationPlotKeyboardHelp(snapStep) {
  const step = relationPlotStep(snapStep);
  return `Arrow keys move the crosshair ${step === 1 ? 'one unit' : `by ${step}`} (Shift for ${RELATION_PLOT_LARGE_STEP}). Enter or Space plots a point at the crosshair, or removes the point already there. Escape hides the crosshair.`;
}
