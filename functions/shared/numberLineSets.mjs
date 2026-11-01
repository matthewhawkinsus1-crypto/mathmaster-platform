/*
 * SETS ON A NUMBER LINE: WHAT A STUDENT DRAWS, AND WHAT IT MEANS.
 *
 * Domain and range in Graph Feature Rush, and every answer in Inequality Rush,
 * are sets of real numbers drawn on a number line — the x-axis, the y-axis or
 * a line of its own. This module is that mathematics, exactly, and nothing
 * else: the device draws with it, the server grades with it, and the tests
 * hold both to it.
 *
 * A SET is a canonical, frozen array of PIECES, left to right:
 *
 *   { lo, loClosed, hi, hiClosed }    lo/hi are exact rationals, or null for
 *                                     −∞ / +∞ (an infinite end is never closed)
 *
 * A single number a is the piece [a, a]. Canonical means: no empty piece,
 * pieces sorted, and no two pieces that touch or overlap (they are merged), so
 * two sets are equal exactly when their pieces are equal. [] is the empty set.
 *
 * A DRAWING is what the student did — the tap model the class uses:
 *
 *   points   at most two numbers, each a dot: closed (●, included) or open
 *            (○, not included). Tap a number once for ●, again for ○, a third
 *            time to take it away. With two dots down, tapping a new number
 *            moves the nearer dot there, keeping its style.
 *   left     an arrow to the left: the shading keeps going to −∞
 *   right    an arrow to the right: the shading keeps going to +∞
 *
 * and the shading follows from those alone. Between two dots it is shaded —
 * "click another point and it goes between" — unless BOTH arrows are on, when
 * the two arrows head away from each other ("x ≤ −1 or x > 3") and the middle
 * stays clear. A lone ● with no arrow is that one number (the range of a
 * constant function). Every set a question here can ask for is drawn with at
 * most two dots and two arrows, and every drawing means exactly one set
 * (drawingSet), so grading is set equality: a student who draws the right set
 * a different way is right.
 *
 * Pure and dependency-light (exact rationals only): shared by Cloud Functions,
 * the student device and tests.
 */

import * as Q from './graphFeatureRational.mjs';

export const MAX_DRAWING_POINTS = 2;

// The largest number a drawing may name: far beyond any view, small enough
// that the exact arithmetic never strains.
export const NUMBER_LINE_LIMIT = 1_000;

// Values a drawing may hold: multiples of 1/GRID_DENOMINATOR (halves).
export const NUMBER_LINE_GRID_DENOMINATOR = 2;

/* --------------------------------- pieces -------------------------------- */

const piece = (lo, loClosed, hi, hiClosed) => Object.freeze({
  lo: lo === null ? null : Q.toRational(lo),
  loClosed: lo === null ? false : loClosed === true,
  hi: hi === null ? null : Q.toRational(hi),
  hiClosed: hi === null ? false : hiClosed === true,
});

const isEmptyPiece = (p) => {
  if (p.lo === null || p.hi === null) return false;
  const order = Q.cmp(p.lo, p.hi);
  if (order > 0) return true;
  return order === 0 && !(p.loClosed && p.hiClosed);
};

// Order of the left ends: −∞ first; at an equal number, a closed end first
// (it starts earlier, by the point itself).
const compareStarts = (a, b) => {
  if (a.lo === null || b.lo === null) return (a.lo === null ? 0 : 1) - (b.lo === null ? 0 : 1);
  return Q.cmp(a.lo, b.lo) || (a.loClosed === b.loClosed ? 0 : (a.loClosed ? -1 : 1));
};

// Whether piece b begins inside, or exactly touching, piece a (a starts first).
const joins = (a, b) => {
  if (a.hi === null) return true;
  if (b.lo === null) return true;
  const order = Q.cmp(b.lo, a.hi);
  if (order < 0) return true;
  if (order > 0) return false;
  // Same number: they join unless that number is in neither.
  return a.hiClosed || b.loClosed;
};

// The later right end of two pieces, with the closedness it carries.
const furtherEnd = (a, b) => {
  if (a.hi === null || b.hi === null) return { hi: null, hiClosed: false };
  const order = Q.cmp(a.hi, b.hi);
  if (order > 0) return { hi: a.hi, hiClosed: a.hiClosed };
  if (order < 0) return { hi: b.hi, hiClosed: b.hiClosed };
  return { hi: a.hi, hiClosed: a.hiClosed || b.hiClosed };
};

/** The canonical set of any pieces: sorted, merged, nothing empty. */
export const canonicalSet = (pieces = []) => {
  const sorted = (Array.isArray(pieces) ? pieces : [])
    .map((p) => piece(p.lo ?? null, p.loClosed, p.hi ?? null, p.hiClosed))
    .filter((p) => !isEmptyPiece(p))
    .sort(compareStarts);
  const merged = [];
  sorted.forEach((next) => {
    const last = merged[merged.length - 1];
    if (last && joins(last, next)) {
      const end = furtherEnd(last, next);
      merged[merged.length - 1] = piece(last.lo, last.loClosed, end.hi, end.hiClosed);
    } else {
      merged.push(next);
    }
  });
  return Object.freeze(merged);
};

export const EMPTY_SET = Object.freeze([]);
export const ALL_REALS = canonicalSet([{ lo: null, hi: null }]);

/** [lo, hi] with the closedness given; null ends are infinite. */
export const intervalSet = (lo, loClosed, hi, hiClosed) => canonicalSet([{ lo, loClosed, hi, hiClosed }]);

/** One number, {a}. */
export const pointSet = (a) => intervalSet(a, true, a, true);

/** Every number except a: (−∞, a) ∪ (a, ∞). */
export const allExcept = (a) => canonicalSet([{ lo: null, hi: a, hiClosed: false }, { lo: a, loClosed: false, hi: null }]);

/** a and beyond, to the right (direction 1) or to the left (−1). */
export const raySet = (a, closed, direction) => (direction < 0
  ? intervalSet(null, false, a, closed)
  : intervalSet(a, closed, null, false));

export const unionSets = (...sets) => canonicalSet(sets.flat());

export const isAllReals = (set) => set.length === 1 && set[0].lo === null && set[0].hi === null;
export const isEmptySet = (set) => set.length === 0;

const sameEnd = (a, b) => (a === null || b === null ? a === b : Q.eq(a, b));

/** Exact equality of two canonical sets. */
export const setsEqual = (left = [], right = []) => left.length === right.length && left.every((p, index) => {
  const q = right[index];
  return sameEnd(p.lo, q.lo) && sameEnd(p.hi, q.hi) && p.loClosed === q.loClosed && p.hiClosed === q.hiClosed;
});

/** Whether the set holds the number x (exact). */
export const setContains = (set, x) => {
  const value = Q.toRational(x);
  return set.some((p) => {
    if (p.lo !== null) {
      const order = Q.cmp(value, p.lo);
      if (order < 0 || (order === 0 && !p.loClosed)) return false;
    }
    if (p.hi !== null) {
      const order = Q.cmp(value, p.hi);
      if (order > 0 || (order === 0 && !p.hiClosed)) return false;
    }
    return true;
  });
};

/** Every finite end of the set, left to right, as plain numbers. */
export const setEndpoints = (set) => [...new Set(set.flatMap((p) => [p.lo, p.hi])
  .filter((end) => end !== null)
  .map((end) => Q.toNumber(end)))].sort((a, b) => a - b);

/* --------------------------- plain (JSON) form --------------------------- */

/*
 * A set as it travels: [[lo, loClosed, hi, hiClosed], ...] with lo/hi plain
 * numbers (null for infinite). Every value on a number line here is a
 * multiple of one half, so the number is exact.
 */
export const setToPlain = (set) => set.map((p) => [
  p.lo === null ? null : Q.toNumber(p.lo),
  p.loClosed,
  p.hi === null ? null : Q.toNumber(p.hi),
  p.hiClosed,
]);

const exactOnGrid = (value, denominator = NUMBER_LINE_GRID_DENOMINATOR) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric) > NUMBER_LINE_LIMIT) return null;
  const scaled = numeric * denominator;
  if (!Number.isInteger(scaled)) return null;
  return Q.rat(scaled, denominator);
};

/** A plain set back to a canonical one, or null when anything is malformed. */
export const setFromPlain = (plain) => {
  if (!Array.isArray(plain) || plain.length > 8) return null;
  const pieces = [];
  for (const entry of plain) {
    if (!Array.isArray(entry) || entry.length !== 4) return null;
    const [lo, loClosed, hi, hiClosed] = entry;
    const exactLo = lo === null ? null : exactOnGrid(lo);
    const exactHi = hi === null ? null : exactOnGrid(hi);
    if ((lo !== null && !exactLo) || (hi !== null && !exactHi)) return null;
    pieces.push({ lo: exactLo, loClosed: loClosed === true, hi: exactHi, hiClosed: hiClosed === true });
  }
  return canonicalSet(pieces);
};

/** A short, stable text for a set: a receipt's answer key, and a test's. */
export const setKey = (set) => (set.length ? set.map((p) => {
  if (p.lo !== null && p.hi !== null && Q.eq(p.lo, p.hi)) return `{${Q.format(p.lo)}}`;
  return `${p.loClosed ? '[' : '('}${p.lo === null ? '-inf' : Q.format(p.lo)},${p.hi === null ? 'inf' : Q.format(p.hi)}${p.hiClosed ? ']' : ')'}`;
}).join('u') : 'empty');

/* -------------------------------- drawings ------------------------------- */

export const EMPTY_DRAWING = Object.freeze({ points: Object.freeze([]), left: false, right: false });

const sortedPoints = (points) => [...points].sort((a, b) => a.value - b.value);

const freezeDrawing = ({ points = [], left = false, right = false }) => Object.freeze({
  points: Object.freeze(sortedPoints(points).map((p) => Object.freeze({ value: p.value, closed: p.closed === true }))),
  left: left === true,
  right: right === true,
});

/** Whether a drawing has anything on it at all. */
export const drawingIsEmpty = (drawing) => !drawing?.points?.length && !drawing?.left && !drawing?.right;

/**
 * The set a drawing means (see the header). Null for a drawing that names no
 * set yet: nothing drawn, a lone arrow, or a lone open dot.
 */
export const drawingSet = (drawing = EMPTY_DRAWING) => {
  const points = sortedPoints(drawing.points || []);
  const { left, right } = drawing;
  if (points.length > MAX_DRAWING_POINTS) return null;
  if (!points.length) return left && right ? ALL_REALS : null;
  const exact = points.map((p) => ({ value: Q.toRational(exactOnGrid(p.value) ?? 0), closed: p.closed === true }));
  if (points.some((p) => exactOnGrid(p.value) === null)) return null;
  const first = exact[0];
  const last = exact[exact.length - 1];
  const pieces = [];
  if (left) pieces.push({ lo: null, hi: first.value, hiClosed: first.closed });
  if (right) pieces.push({ lo: last.value, loClosed: last.closed, hi: null });
  if (exact.length === 2 && !(left && right)) {
    pieces.push({ lo: first.value, loClosed: first.closed, hi: last.value, hiClosed: last.closed });
  }
  // A closed dot with no shading beside it is that number on its own.
  exact.forEach((p) => {
    const shadedBeside = pieces.some((s) => (s.lo !== null && Q.eq(s.lo, p.value)) || (s.hi !== null && Q.eq(s.hi, p.value)));
    if (!shadedBeside && p.closed) pieces.push({ lo: p.value, loClosed: true, hi: p.value, hiClosed: true });
  });
  const set = canonicalSet(pieces);
  return set.length ? set : null;
};

/** Whether the drawing can be checked: it names a set. */
export const drawingIsComplete = (drawing) => drawingSet(drawing) !== null;

const snapToGrid = (value, step) => {
  const numeric = Number(value);
  const grid = Number(step) > 0 ? Number(step) : 1;
  if (!Number.isFinite(numeric)) return null;
  const snapped = Math.round(numeric / grid) * grid;
  const clean = Math.round(snapped * 1e6) / 1e6;
  return clean === 0 ? 0 : clean;
};

/** A raw tap position snapped to the line's step (1 unless the view says otherwise). */
export const snapNumberLineValue = (value, step = 1) => snapToGrid(value, step);

/**
 * A tap at a number (already snapped). An existing dot cycles ● → ○ → gone;
 * a new number adds a ● — or, with two dots down, moves the nearer one there
 * (keeping its style), so a misplaced dot is fixed in one tap.
 */
export const tapNumber = (drawing = EMPTY_DRAWING, value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || exactOnGrid(numeric) === null) return drawing;
  const points = drawing.points || [];
  const existing = points.find((p) => p.value === numeric);
  if (existing) {
    const rest = points.filter((p) => p !== existing);
    return freezeDrawing({ ...drawing, points: existing.closed ? [...rest, { value: numeric, closed: false }] : rest });
  }
  if (points.length < MAX_DRAWING_POINTS) {
    return freezeDrawing({ ...drawing, points: [...points, { value: numeric, closed: true }] });
  }
  const nearest = points.reduce((best, p) => (Math.abs(p.value - numeric) < Math.abs(best.value - numeric) ? p : best));
  return freezeDrawing({ ...drawing, points: points.map((p) => (p === nearest ? { value: numeric, closed: p.closed } : p)) });
};

/** An arrow toggled: 'left' (to −∞) or 'right' (to +∞). */
export const toggleArrow = (drawing = EMPTY_DRAWING, side) => {
  if (side !== 'left' && side !== 'right') return drawing;
  return freezeDrawing({ ...drawing, [side]: !drawing[side] });
};

/** The drawing that shows a set (how a revealed answer is drawn). Null if none can. */
export const drawingForSet = (set) => {
  if (!Array.isArray(set)) return null;
  if (isAllReals(set)) return freezeDrawing({ points: [], left: true, right: true });
  const dots = new Map();
  const add = (end, closed) => {
    if (end === null) return;
    const value = Q.toNumber(end);
    dots.set(value, { value, closed: closed || dots.get(value)?.closed === true });
  };
  set.forEach((p) => { add(p.lo, p.loClosed); add(p.hi, p.hiClosed); });
  const drawing = freezeDrawing({
    points: [...dots.values()],
    left: set.length > 0 && set[0].lo === null,
    right: set.length > 0 && set[set.length - 1].hi === null,
  });
  return drawing.points.length <= MAX_DRAWING_POINTS && setsEqual(drawingSet(drawing) || [], set) ? drawing : null;
};

/**
 * A drawing as a device sends it — { points: [{ value, closed }, ...], left,
 * right }, a dot also read as a [value, closed] pair — shape-checked. Null
 * for anything malformed: too many dots, a value off the half grid or out of
 * range, the same number twice.
 */
export const normalizeDrawing = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const entries = Array.isArray(raw.points) ? raw.points : null;
  if (!entries || entries.length > MAX_DRAWING_POINTS) return null;
  const points = [];
  for (const entry of entries) {
    const [value, closed] = Array.isArray(entry) ? entry : [entry?.value, entry?.closed];
    if (exactOnGrid(value) === null) return null;
    if (points.some((p) => p.value === Number(value))) return null;
    points.push({ value: Number(value), closed: closed === true });
  }
  return freezeDrawing({ points, left: raw.left === true, right: raw.right === true });
};

/*
 * The plain form of a drawing, as a device sends it and a receipt stores it:
 * { points: [{ value, closed }, ...], left, right }. Each dot is an object,
 * never a [value, closed] pair: Firestore holds no array directly inside an
 * array, so a receipt carrying pairs could not be written at all.
 * normalizeDrawing reads either.
 */
export const drawingToPlain = (drawing = EMPTY_DRAWING) => ({
  points: (drawing.points || []).map((p) => ({ value: p.value, closed: p.closed === true })),
  left: drawing.left === true,
  right: drawing.right === true,
});

/* ------------------------------- in words ------------------------------- */

const MINUS = '−';
const INFINITY = '∞';

const numberText = (value) => {
  const numeric = Q.toNumber(value);
  if (numeric === 0) return '0';
  const magnitude = Math.abs(numeric);
  const text = Number.isInteger(magnitude) ? String(magnitude) : String(Math.round(magnitude * 1000) / 1000);
  return numeric < 0 ? `${MINUS}${text}` : text;
};

/** Interval notation: [−3, 5), (−∞, 2) ∪ (2, ∞), {4}, ∅. */
export const intervalNotation = (set) => {
  if (!Array.isArray(set) || !set.length) return '∅';
  return set.map((p) => {
    if (p.lo !== null && p.hi !== null && Q.eq(p.lo, p.hi)) return `{${numberText(p.lo)}}`;
    const lo = p.lo === null ? `${MINUS}${INFINITY}` : numberText(p.lo);
    const hi = p.hi === null ? INFINITY : numberText(p.hi);
    return `${p.loClosed ? '[' : '('}${lo}, ${hi}${p.hiClosed ? ']' : ')'}`;
  }).join(' ∪ ');
};

const pieceInequality = (p, variable) => {
  if (p.lo === null && p.hi === null) return 'all real numbers';
  if (p.lo !== null && p.hi !== null && Q.eq(p.lo, p.hi)) return `${variable} = ${numberText(p.lo)}`;
  if (p.lo === null) return `${variable} ${p.hiClosed ? '≤' : '<'} ${numberText(p.hi)}`;
  if (p.hi === null) return `${variable} ${p.loClosed ? '≥' : '>'} ${numberText(p.lo)}`;
  return `${numberText(p.lo)} ${p.loClosed ? '≤' : '<'} ${variable} ${p.hiClosed ? '≤' : '<'} ${numberText(p.hi)}`;
};

/** Inequality notation: x ≥ −3, −1 < x ≤ 4, x ≠ 2, x ≤ −1 or x > 3, all real numbers. */
export const inequalityNotation = (set, variable = 'x') => {
  if (!Array.isArray(set) || !set.length) return 'no solution';
  if (set.length === 2 && set[0].lo === null && set[1].hi === null
    && set[0].hi !== null && set[1].lo !== null && Q.eq(set[0].hi, set[1].lo)
    && !set[0].hiClosed && !set[1].loClosed) {
    return `${variable} ≠ ${numberText(set[0].hi)}`;
  }
  return set.map((p) => pieceInequality(p, variable)).join(' or ');
};

/* ------------------------------ what's off ------------------------------- */

/*
 * WHAT A WRONG DRAWING GOT WRONG, in terms of the drawing — never the answer.
 * Both sets are compared as the drawings that show them: their dots (number
 * and style) and their arrows. One reason is named only when it is the whole
 * story; anything else is "several". `end` says which end a style or a number
 * is wrong at: 'low' (the left of a number line, the bottom of the y-axis),
 * 'high', or 'both'.
 */
export const SET_DIAGNOSIS = Object.freeze({
  INCLUSION: 'inclusion',     // right numbers, a dot open where it should be closed (or back)
  DIRECTION: 'direction',     // right dots, the shading goes the wrong way
  ENDPOINT: 'endpoint',       // the shape is right, a number is not
  EXTENT: 'extent',           // an arrow missing or extra: it keeps going, or it stops
  SEVERAL: 'several',
});

// Which ends differ, given two equal-length lists of dots, by a test.
const endsWhere = (mine, right, differs) => {
  const wrong = mine.map((dot, index) => differs(dot, right[index]));
  if (wrong.length === 1) return wrong[0] ? (mine[0].value <= right[0].value ? 'low' : 'high') : null;
  if (wrong[0] && wrong[wrong.length - 1]) return 'both';
  if (wrong[0]) return 'low';
  return wrong[wrong.length - 1] ? 'high' : null;
};

/** The diagnosis of a wrong set against the right one: `{ kind, end }`. */
export const diagnoseSet = (student, key) => {
  const mine = drawingForSet(student);
  const right = drawingForSet(key);
  const several = Object.freeze({ kind: SET_DIAGNOSIS.SEVERAL, end: null });
  if (!mine || !right || setsEqual(student, key)) return several;
  const values = (d) => d.points.map((p) => p.value).join();
  const styles = (d) => d.points.map((p) => p.closed).join();
  const sameDots = values(mine) === values(right);
  const sameArrows = mine.left === right.left && mine.right === right.right;
  if (sameDots && sameArrows && styles(mine) !== styles(right)) {
    // A lone dot's one end: low or high is the side its shading runs from.
    const lone = mine.points.length === 1;
    const end = lone ? (mine.right ? 'low' : 'high') : endsWhere(mine.points, right.points, (a, b) => a.closed !== b.closed);
    return Object.freeze({ kind: SET_DIAGNOSIS.INCLUSION, end });
  }
  if (sameDots && styles(mine) === styles(right) && !sameArrows) {
    // The same dots with the arrows pointing the other way round.
    const flipped = mine.left === right.right && mine.right === right.left && mine.left !== mine.right;
    return Object.freeze({ kind: flipped ? SET_DIAGNOSIS.DIRECTION : SET_DIAGNOSIS.EXTENT, end: null });
  }
  // The right numbers, but both the dots' styles and the arrows differ: the
  // arrows first (does it keep going?), the dots after.
  if (sameDots && !sameArrows) return Object.freeze({ kind: SET_DIAGNOSIS.EXTENT, end: null });
  if (mine.points.length === right.points.length && sameArrows && styles(mine) === styles(right)) {
    const lone = mine.points.length === 1;
    const end = lone ? (mine.right ? 'low' : 'high') : endsWhere(mine.points, right.points, (a, b) => a.value !== b.value);
    return Object.freeze({ kind: SET_DIAGNOSIS.ENDPOINT, end });
  }
  if (mine.points.length !== right.points.length || !sameArrows) return Object.freeze({ kind: SET_DIAGNOSIS.EXTENT, end: null });
  return several;
};

/*
 * A HINT FOR A WRONG SET: a question back at the student about the one thing
 * the diagnosis says is off, never the answer. On the x-axis or a number line
 * the ends are left and right; on the y-axis, the bottom and the top.
 */
export const setHint = (student, key, { axis = 'x' } = {}) => {
  const { kind, end } = diagnoseSet(student, key);
  const [low, high] = axis === 'y' ? ['bottom', 'top'] : ['left', 'right'];
  const at = (which) => (which === 'both' ? 'each end' : `the ${which === 'high' ? high : low} end`);
  switch (kind) {
    case SET_DIAGNOSIS.INCLUSION: return `Open or closed at ${at(end)}?`;
    case SET_DIAGNOSIS.DIRECTION: return 'Which way does it keep going?';
    case SET_DIAGNOSIS.EXTENT: return 'Does it keep going, or does it stop?';
    case SET_DIAGNOSIS.ENDPOINT: return end === 'both' ? 'Check where it starts and where it stops.' : `Check the number at ${at(end)}.`;
    default: return 'Look again at where it starts and where it stops.';
  }
};
