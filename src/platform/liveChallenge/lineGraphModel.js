/*
 * GRAPH THE LINE: THE STUDENT'S GRID AS GEOMETRY AND GESTURES.
 *
 * Everything the line canvas draws and every gesture it takes, without React
 * or the DOM, so it is tested in node:
 *
 *   unit space     the plot is a unit square — (0,0) top-left, (1,1)
 *                  bottom-right — scaled by the renderer to whatever square
 *                  the screen allows
 *   the grid       every whole number in the view, labels thinned to fit
 *   snapping       a finger anywhere on the plot means the nearest grid point
 *                  in the view: an answer is always two placeable points
 *   the line       through two points, drawn from edge to edge
 *   floating       a held point's coordinates and a judged line's ✓ or ✗,
 *                  placed clear of the finger and of the points
 *   placing        press → drag → release, as a reducer over a DRAFT. A line
 *                  is checked only on a release that completes or changes it
 *                  (lineGraphRules.mjs: no Submit button, never mid-drag)
 *   the keyboard   a crosshair on the grid; Enter places a point, picks one
 *                  up and drops it; Escape puts a held point back
 *
 * Generated views are whole-number squares (lineGraphGenerator
 * lineViewForTier), so every grid point is a whole-number point.
 */

const finite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// No negative zero on screen or in an answer.
const plain = (value) => (value === 0 ? 0 : value);

const viewOf = (view = {}) => ({
  xMin: finite(view.xMin, -10),
  xMax: finite(view.xMax, 10),
  yMin: finite(view.yMin, -10),
  yMax: finite(view.yMax, 10),
});

export const lineViewSpan = (view = {}) => {
  const { xMin, xMax, yMin, yMax } = viewOf(view);
  return { x: Math.max(1e-9, xMax - xMin), y: Math.max(1e-9, yMax - yMin) };
};

/** Graph x to unit-space u (0 at the left edge). */
export const unitX = (view, x) => (finite(x) - viewOf(view).xMin) / lineViewSpan(view).x;
/** Graph y to unit-space v (0 at the top edge). */
export const unitY = (view, y) => (viewOf(view).yMax - finite(y)) / lineViewSpan(view).y;

/** Unit-space (u, v) back to the graph point under it. */
export const graphPointAt = (view, u, v) => ({
  x: viewOf(view).xMin + finite(u) * lineViewSpan(view).x,
  y: viewOf(view).yMax - finite(v) * lineViewSpan(view).y,
});

// The whole numbers a view holds on each axis.
const gridBounds = (view = {}) => {
  const { xMin, xMax, yMin, yMax } = viewOf(view);
  return { xLow: Math.ceil(xMin), xHigh: Math.floor(xMax), yLow: Math.ceil(yMin), yHigh: Math.floor(yMax) };
};

const wholeNumbers = (low, high) => Array.from({ length: Math.max(0, high - low + 1) }, (_, index) => plain(low + index));

/** Every grid line of the view, and where the axes cross it in unit space. */
export const lineGrid = (view = {}) => {
  const { xLow, xHigh, yLow, yHigh } = gridBounds(view);
  return Object.freeze({
    verticals: Object.freeze(wholeNumbers(xLow, xHigh).map((value) => Object.freeze({ value, u: unitX(view, value) }))),
    horizontals: Object.freeze(wholeNumbers(yLow, yHigh).map((value) => Object.freeze({ value, v: unitY(view, value) }))),
    axisU: unitX(view, clamp(0, viewOf(view).xMin, viewOf(view).xMax)),
    axisV: unitY(view, clamp(0, viewOf(view).yMin, viewOf(view).yMax)),
  });
};

// Labels closer than this on screen are thinned to every other one.
export const MIN_LABEL_SPACING_PX = 24;

/**
 * Which whole numbers get a label on each axis, for a plot `sidePx` wide.
 * Zero is labelled once, at the origin, by the renderer; the very edge of
 * the plot goes unlabelled rather than half-drawn.
 */
export const lineAxisLabels = (view = {}, sidePx = 0) => {
  const span = lineViewSpan(view);
  const { xLow, xHigh, yLow, yHigh } = gridBounds(view);
  const every = (units) => {
    const spacing = finite(sidePx) / Math.max(1, units);
    if (spacing >= MIN_LABEL_SPACING_PX) return 1;
    return spacing * 2 >= MIN_LABEL_SPACING_PX ? 2 : 5;
  };
  const pick = (values, step, low, high) => values.filter((value) => value !== 0 && value % step === 0 && value > low && value < high);
  return Object.freeze({
    x: Object.freeze(pick(wholeNumbers(xLow, xHigh), every(span.x), xLow, xHigh)),
    y: Object.freeze(pick(wholeNumbers(yLow, yHigh), every(span.y), yLow, yHigh)),
  });
};

/** The grid point nearest a graph point, kept inside the view. */
export const snapToGrid = (view, point = {}) => {
  const { xLow, xHigh, yLow, yHigh } = gridBounds(view);
  return Object.freeze({
    x: plain(clamp(Math.round(finite(point.x)), xLow, xHigh)),
    y: plain(clamp(Math.round(finite(point.y)), yLow, yHigh)),
  });
};

/**
 * The graph point under a pointer, from the plot's on-screen rectangle.
 * Null outside the plot (a press in the margin is not a point) unless
 * `clamp`: a drag that leaves the plot holds the point at its edge.
 */
export const pointerPoint = ({ clientX, clientY, rect, view, clamp: clampToPlot = false }) => {
  const width = finite(rect?.width, 0);
  const height = finite(rect?.height, 0);
  if (!(width > 0) || !(height > 0)) return null;
  let u = (finite(clientX, Number.NaN) - finite(rect.left, 0)) / width;
  let v = (finite(clientY, Number.NaN) - finite(rect.top, 0)) / height;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  if (clampToPlot) {
    u = clamp(u, 0, 1);
    v = clamp(v, 0, 1);
  } else if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) {
    return null;
  }
  return graphPointAt(view, u, v);
};

/** Pixels per grid unit on a plot `sidePx` wide. */
export const pixelsPerUnit = (view, sidePx) => finite(sidePx) / lineViewSpan(view).x;

/*
 * Where the line a·x + b·y = c meets the edges of the view: the segment a
 * renderer draws, edge to edge, in graph units. Null when the line misses
 * the view (or is not a line).
 */
export const lineSegmentInView = (line, view = {}) => {
  const a = finite(line?.a, Number.NaN);
  const b = finite(line?.b, Number.NaN);
  const c = finite(line?.c, Number.NaN);
  if (![a, b, c].every(Number.isFinite) || (a === 0 && b === 0)) return null;
  const { xMin, xMax, yMin, yMax } = viewOf(view);
  const EPS = 1e-9;
  const crossings = [];
  if (b !== 0) {
    [xMin, xMax].forEach((x) => {
      const y = (c - a * x) / b;
      if (y >= yMin - EPS && y <= yMax + EPS) crossings.push({ x, y: clamp(y, yMin, yMax) });
    });
  }
  if (a !== 0) {
    [yMin, yMax].forEach((y) => {
      const x = (c - b * y) / a;
      if (x >= xMin - EPS && x <= xMax + EPS) crossings.push({ x: clamp(x, xMin, xMax), y });
    });
  }
  const distinct = crossings.filter((point, index) => crossings.findIndex((other) => Math.abs(other.x - point.x) < 1e-7 && Math.abs(other.y - point.y) < 1e-7) === index);
  if (distinct.length < 2) return null;
  distinct.sort((left, right) => left.x - right.x || left.y - right.y);
  return Object.freeze([Object.freeze(distinct[0]), Object.freeze(distinct[distinct.length - 1])]);
};

/** The line through two distinct points as a·x + b·y = c (not reduced: for drawing). */
export const lineThrough = (first, second) => {
  if (!first || !second) return null;
  const dx = finite(second.x) - finite(first.x);
  const dy = finite(second.y) - finite(first.y);
  if (dx === 0 && dy === 0) return null;
  // (y − y₁)·dx = (x − x₁)·dy  →  dy·x − dx·y = dy·x₁ − dx·y₁
  return Object.freeze({ a: dy, b: -dx, c: dy * finite(first.x) - dx * finite(first.y) });
};

/* ------------------------ what floats over the plot ----------------------- */

/*
 * These place things in PIXELS on a plot `side` pixels square, (0, 0)
 * top-left, because what they keep clear of — a fingertip, a placed point,
 * the plot's edge — is a size on the screen, not on the grid.
 */

/*
 * How far from a held point its coordinates float, by what holds it: a
 * fingertip covers more than a pen, a pen more than a cursor. `above` runs
 * from the point to the label's middle; `beside`, from the point to the
 * label's near edge.
 */
export const HELD_LABEL_OFFSET = Object.freeze({
  touch: Object.freeze({ above: 58, beside: 36 }),
  pen: Object.freeze({ above: 38, beside: 24 }),
  mouse: Object.freeze({ above: 28, beside: 18 }),
  keyboard: Object.freeze({ above: 28, beside: 18 }),
});

// The closest anything floating comes to the plot's edge.
const PLOT_MARGIN = 2;

/**
 * Where a held point's coordinates go: the middle { x, y } of a label
 * `width` × `height`, and `place` — 'above', 'left' or 'right'. Above the
 * point, where the finger does not cover them, kept inside the plot. A point
 * too near the top for that has its label BESIDE it, against the top edge:
 * to the left, or to the right when the left edge is too close. Never below,
 * where the hand is. On a plot too narrow for either side, the roomier side,
 * kept inside.
 */
export const heldLabelSpot = ({ at, side, holder, width, height = 30 }) => {
  const offset = HELD_LABEL_OFFSET[holder] || HELD_LABEL_OFFSET.mouse;
  const top = height / 2 + PLOT_MARGIN;
  const inside = (x) => clamp(x, width / 2 + PLOT_MARGIN, side - width / 2 - PLOT_MARGIN);
  if (at.y - offset.above >= top) return { x: inside(at.x), y: at.y - offset.above, place: 'above' };
  const leftRoom = at.x - offset.beside - width - PLOT_MARGIN;
  const rightRoom = side - PLOT_MARGIN - (at.x + offset.beside + width);
  const left = leftRoom >= 0 || (rightRoom < 0 && leftRoom >= rightRoom);
  return {
    x: inside(left ? at.x - offset.beside - width / 2 : at.x + offset.beside + width / 2),
    y: top,
    place: left ? 'left' : 'right',
  };
};

/**
 * Where a placed point's coordinates are printed: up and to the right of it
 * — to its left near the right edge, under it near the top. `x`, `y` and
 * `anchor` are the text's (y its baseline); `box` is the room it takes,
 * { left, top, right, bottom }, for things that must stay off it.
 */
export const pointLabelSpot = ({ at, side, text, fontSize = 12 }) => {
  const width = String(text).length * 7 + 4;
  const nearRight = at.x > side - 70;
  const x = nearRight ? at.x - 12 : at.x + 12;
  const y = at.y < 24 ? at.y + 22 : at.y - 11;
  const left = nearRight ? x - width : x;
  return { x, y, anchor: nearRight ? 'end' : 'start', box: { left, top: y - fontSize, right: left + width, bottom: y + 4 } };
};

// How far a spot is from a box (0 inside it).
const distanceToBox = (spot, box) => Math.hypot(
  Math.max(box.left - spot.x, 0, spot.x - box.right),
  Math.max(box.top - spot.y, 0, spot.y - box.bottom),
);

// The stretch of from→to inside the square [low, high]², as [t0, t1] along it
// (Liang–Barsky); null when none of it is inside.
const stretchInside = (from, to, low, high) => {
  let [t0, t1] = [0, 1];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (const [p, q] of [[-dx, from.x - low], [dx, high - from.x], [-dy, from.y - low], [dy, high - from.y]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else if (p < 0) {
      t0 = Math.max(t0, q / p);
    } else {
      t1 = Math.min(t1, q / p);
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
};

/**
 * Where a judged line's ✓ or ✗ goes: ON the line — `from`→`to`, its stretch
 * across the plot — at least `inset` inside the plot, and as far as it can be
 * from everything in `avoid` (boxes: the student's points and their printed
 * coordinates), so it covers none of them. A walk along the part of the line
 * that is far enough inside finds that spot whatever the slope; ties go to
 * the spot nearest `from`. A line with no such part — along the plot's edge,
 * or across a corner — has its badge beside it, by the same walk.
 */
export const verdictBadgeSpot = ({ from, to, avoid = [], side, inset = 18, steps = 48 }) => {
  const along = (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  const inside = (spot) => ({ x: clamp(spot.x, inset, side - inset), y: clamp(spot.y, inset, side - inset) });
  const room = (spot) => Math.min(Number.POSITIVE_INFINITY, ...avoid.map((box) => distanceToBox(spot, box)));
  const [t0, t1] = stretchInside(from, to, inset, side - inset) || [0, 1];
  let best = null;
  for (let step = 0; step <= steps; step += 1) {
    const spot = inside(along(t0 + ((t1 - t0) * step) / steps));
    const clear = room(spot);
    if (!best || clear > best.clear) best = { x: spot.x, y: spot.y, clear };
  }
  return { x: best.x, y: best.y };
};

/** The room a placed point's dot takes, as a box to keep off. */
export const pointBox = (at, radius = 10) => ({ left: at.x - radius, top: at.y - radius, right: at.x + radius, bottom: at.y + radius });

/* ------------------------------ numbers shown ----------------------------- */

/*
 * The kinds of an equation's tokens (lineGraphForms.TOKEN_KIND), written out
 * so a screen that draws an equation — the projector, for a Classic round's
 * line — does not carry the module that writes equations. A test holds the
 * two equal.
 */
export const EQUATION_TOKEN_KIND = Object.freeze({
  VAR: 'var',
  NUM: 'num',
  FRAC: 'frac',
  OP: 'op',
  NEG: 'neg',
  OPEN: 'open',
  CLOSE: 'close',
});

const MINUS = '−';

/** A coordinate as a student writes it: −4, 2, 0. */
export const formatCoordinate = (value) => {
  const numeric = Math.round(finite(value) * 1000) / 1000;
  if (numeric === 0) return '0';
  return numeric < 0 ? `${MINUS}${Math.abs(numeric)}` : String(numeric);
};

export const formatPoint = (point = {}) => `(${formatCoordinate(point.x)}, ${formatCoordinate(point.y)})`;

/*
 * THE SLOPE HELPER ("up 2, right 3"): the step from the first point to the
 * second, as placed — a teacher's option for students still learning rise
 * over run. Null until there are two different points.
 */
export const slopeStepText = (from, to) => {
  if (!from || !to) return null;
  const dx = finite(to.x) - finite(from.x);
  const dy = finite(to.y) - finite(from.y);
  if (dx === 0 && dy === 0) return null;
  const rise = dy === 0 ? null : `${dy > 0 ? 'up' : 'down'} ${Math.abs(dy)}`;
  const run = dx === 0 ? null : `${dx > 0 ? 'right' : 'left'} ${Math.abs(dx)}`;
  return [rise, run].filter(Boolean).join(', ');
};

/* ------------------------------ the draft -------------------------------- */

/*
 * A DRAFT is the student's points on the current item: `points` placed (zero,
 * one or two, in the order placed) and `active`, the point a finger (or the
 * keyboard) is holding — { index, point, origin }, where `origin` is where a
 * placed point was picked up from (null for a new point).
 */
export const DRAFT_OUTCOME = Object.freeze({
  // Nothing was held.
  NONE: 'none',
  // A first point is down.
  PLACED: 'placed',
  // Two points make a line that is new or changed: check it.
  LINE: 'line',
  // Let go where it already was: not a new attempt.
  UNCHANGED: 'unchanged',
  // Dropped on the other point: put back — a line needs two points.
  SAME_POINT: 'samePoint',
  // The keyboard picked a placed point up (Enter again drops it).
  PICKED_UP: 'pickedUp',
});

export const emptyDraft = () => Object.freeze({ points: Object.freeze([]), active: null });

const samePoint = (left, right) => Boolean(left && right) && left.x === right.x && left.y === right.y;

const squaredDistance = (left, right) => (finite(left.x) - finite(right.x)) ** 2 + (finite(left.y) - finite(right.y)) ** 2;

/** The points to draw: those placed, with the held one where it is now. */
export const draftPoints = (draft) => {
  const points = [...(draft?.points || [])];
  if (draft?.active) points[draft.active.index] = draft.active.point;
  return Object.freeze(points);
};

/** A pair of points as one key, so a verdict belongs to exactly the line it judged. */
export const pointsKey = (points = []) => (Array.isArray(points) && points.length === 2
  ? points.map((point) => `${point.x},${point.y}`).join(';')
  : '');

/**
 * A press on the plot at `point` (graph units, not yet snapped):
 *
 *   - on a placed point (the press snaps to it): pick it up;
 *   - fewer than two placed: a new point;
 *   - two placed: the NEARER one moves here — one gesture, with no small
 *     dot to aim at.
 *
 * Nothing is checked on a press.
 */
export const pressDraft = (draft, point, { view } = {}) => {
  const current = draft || emptyDraft();
  const at = snapToGrid(view, point);
  const placed = current.points;
  const onPoint = placed.findIndex((existing) => samePoint(existing, at));
  if (onPoint >= 0) {
    return Object.freeze({ points: placed, active: Object.freeze({ index: onPoint, point: at, origin: placed[onPoint] }) });
  }
  if (placed.length < 2) {
    return Object.freeze({ points: placed, active: Object.freeze({ index: placed.length, point: at, origin: null }) });
  }
  // Nearer by distance to the press itself; a tie moves the point placed last.
  const index = squaredDistance(placed[0], point) < squaredDistance(placed[1], point) ? 0 : 1;
  return Object.freeze({ points: placed, active: Object.freeze({ index, point: at, origin: placed[index] }) });
};

/** The held point follows the finger (or the cursor), snapped to the grid. */
export const moveDraft = (draft, point, { view } = {}) => {
  if (!draft?.active) return draft;
  const at = snapToGrid(view, point);
  if (samePoint(at, draft.active.point)) return draft;
  return Object.freeze({ ...draft, active: Object.freeze({ ...draft.active, point: at }) });
};

/** Letting go: { draft, outcome } — the outcome says whether to check (LINE). */
export const releaseDraft = (draft) => {
  if (!draft?.active) return { draft: draft || emptyDraft(), outcome: DRAFT_OUTCOME.NONE };
  const { index, point, origin } = draft.active;
  const settled = Object.freeze({ points: draft.points, active: null });
  const other = draft.points.find((existing, position) => position !== index);
  if (other && samePoint(other, point)) return { draft: settled, outcome: DRAFT_OUTCOME.SAME_POINT };
  if (origin && samePoint(origin, point)) return { draft: settled, outcome: DRAFT_OUTCOME.UNCHANGED };
  const points = [...draft.points];
  points[index] = point;
  return {
    draft: Object.freeze({ points: Object.freeze(points), active: null }),
    outcome: points.length === 2 ? DRAFT_OUTCOME.LINE : DRAFT_OUTCOME.PLACED,
  };
};

/** A cancelled gesture (Escape, a lost pointer): the held point goes back. */
export const cancelDraft = (draft) => (draft?.active ? Object.freeze({ points: draft.points, active: null }) : (draft || emptyDraft()));

/* ------------------------------ the keyboard ------------------------------ */

const KEY_DIRECTIONS = Object.freeze({
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
});

// Shift + an arrow jumps this many grid lines.
export const LARGE_KEY_STEP = 5;

export const isLineCursorKey = (key) => Object.hasOwn(KEY_DIRECTIONS, key) || key === 'Home';

/** The crosshair starts at the origin, which every generated view contains. */
export const initialLineCursor = (view = {}) => snapToGrid(view, { x: 0, y: 0 });

/** The crosshair after a key press: one grid line (Shift: five), kept inside the view. */
export const moveLineCursor = (view = {}, cursor = {}, key, { large = false } = {}) => {
  if (key === 'Home') return initialLineCursor(view);
  const direction = KEY_DIRECTIONS[key];
  if (!direction) return cursor;
  const step = large ? LARGE_KEY_STEP : 1;
  return snapToGrid(view, { x: finite(cursor.x) + direction[0] * step, y: finite(cursor.y) + direction[1] * step });
};

/**
 * Enter at the crosshair — the finger's gestures, from the keyboard:
 *
 *   holding a point      drop it here (a release: may complete a line)
 *   on a placed point    pick it up (arrows then move it; Enter drops it)
 *   anywhere else        place a point, or move the nearer of two here
 */
export const keyboardEnter = (draft, cursor, { view } = {}) => {
  const current = draft || emptyDraft();
  if (current.active) return releaseDraft(moveDraft(current, cursor, { view }));
  const pressed = pressDraft(current, cursor, { view });
  if (pressed.active.origin && samePoint(pressed.active.origin, pressed.active.point)) {
    return { draft: pressed, outcome: DRAFT_OUTCOME.PICKED_UP };
  }
  return releaseDraft(pressed);
};

/** What a screen reader hears as the crosshair moves. */
export const describeLineCursor = (cursor, draft) => {
  const where = `Crosshair at ${formatPoint(cursor)}.`;
  if (draft?.active) return `${where} Holding a point: press Enter to drop it here, Escape to put it back.`;
  const placed = draft?.points || [];
  const onPoint = placed.findIndex((point) => samePoint(point, cursor));
  if (onPoint >= 0) return `${where} Your ${onPoint === 0 ? 'first' : 'second'} point is here: press Enter to pick it up.`;
  if (placed.length === 0) return `${where} Press Enter to place your first point.`;
  if (placed.length === 1) return `${where} Press Enter to place your second point.`;
  return `${where} Press Enter to move the nearer point here.`;
};
