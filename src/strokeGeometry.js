// Freehand stroke geometry: did this line the student drew actually cross that
// term?
//
// WHAT THIS REPLACES. Cancellation used to be measured as the straight-line
// distance from pointer-down to pointer-up, with a 44px threshold. That is not
// a stroke, it is a displacement, and it got both answers wrong:
//
//   A careful line drawn back and forth through the +6 and the -6 ends near
//   where it started, so its displacement is small and it counted as nothing.
//   A 44px flick across an empty corner of the box, touching neither term,
//   counted as a cancellation.
//
// Neither had anything to do with what the student crossed out. This module
// asks the real question — which terms does the drawn path pass through — and
// answers it from the whole path rather than from its endpoints.
//
// TOLERANCE IS A FEATURE. A student drawing on a phone with a finger will miss
// a 20px-tall term by a few pixels, and that is not a mathematical mistake. Hit
// rectangles are padded before testing, so an imprecise gesture reads as what
// it obviously meant. The padding lives here, in one constant, so it can be
// tuned without hunting through a component.

// How far apart two sampled points must be before the second is kept. Pointer
// events fire far faster than a stroke changes direction, and storing every one
// makes the path expensive to test without making it more accurate.
export const MIN_SAMPLE_SPACING = 3;

// A stroke shorter than this is a tap, not a line through something.
export const MIN_STROKE_LENGTH = 24;

// Forgiveness, in pixels, added around every term before testing.
export const HIT_PADDING = 10;

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export const createStroke = (point) => (point ? [{ x: point.x, y: point.y }] : []);

/**
 * Add a point if it is far enough from the last one to matter.
 * Returns the same array reference when nothing was added, so a caller can
 * skip a re-render.
 */
export const appendStrokePoint = (points, point, spacing = MIN_SAMPLE_SPACING) => {
  if (!point) return points;
  if (!points.length) return [{ x: point.x, y: point.y }];
  const last = points[points.length - 1];
  if (distance(last, point) < spacing) return points;
  return [...points, { x: point.x, y: point.y }];
};

export const strokeLength = (points = []) => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
};

const pad = (rect, padding) => ({
  left: rect.left - padding,
  right: rect.right + padding,
  top: rect.top - padding,
  bottom: rect.bottom + padding,
});

const containsPoint = (rect, point) => (
  point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
);

// Liang-Barsky: clip the segment against the rectangle and see whether anything
// survives. Chosen over four segment-segment tests because it handles the
// endpoint-inside case without a separate branch.
export const segmentIntersectsRect = (a, b, rect) => {
  if (containsPoint(rect, a) || containsPoint(rect, b)) return true;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return clip(-dx, a.x - rect.left)
    && clip(dx, rect.right - a.x)
    && clip(-dy, a.y - rect.top)
    && clip(dy, rect.bottom - a.y);
};

export const strokeCrossesRect = (points = [], rect, padding = HIT_PADDING) => {
  if (!rect || points.length === 0) return false;
  const target = pad(rect, padding);
  if (points.length === 1) return containsPoint(target, points[0]);
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsRect(points[index - 1], points[index], target)) return true;
  }
  return false;
};

/**
 * Which terms the stroke passed through, in the order it reached them.
 *
 * Order matters for the message a student sees — "you crossed the 6 and the
 * −6" reads better in the order they drew — and for nothing else. Grading only
 * cares about the set.
 */
export const resolveStruckTerms = (points = [], termRects = [], { padding = HIT_PADDING } = {}) => {
  const hits = [];
  const seen = new Set();

  const record = (index) => {
    if (seen.has(index)) return;
    seen.add(index);
    hits.push(index);
  };

  termRects.forEach((entry) => {
    if (!entry || !entry.rect) return;
    if (points.length === 1) {
      if (containsPoint(pad(entry.rect, padding), points[0])) record(entry.index);
      return;
    }
    // Walk the path in order so `hits` comes out in drawing order rather than
    // in term order.
    for (let index = 1; index < points.length; index += 1) {
      if (segmentIntersectsRect(points[index - 1], points[index], pad(entry.rect, padding))) {
        record(entry.index);
        return;
      }
    }
  });

  // Re-sort into the order the path actually reached them.
  const firstTouch = new Map();
  termRects.forEach((entry) => {
    if (!entry || !entry.rect || !seen.has(entry.index)) return;
    const target = pad(entry.rect, padding);
    for (let index = 1; index < points.length; index += 1) {
      if (segmentIntersectsRect(points[index - 1], points[index], target)) {
        firstTouch.set(entry.index, index);
        return;
      }
    }
    firstTouch.set(entry.index, Number.MAX_SAFE_INTEGER);
  });

  return hits.sort((left, right) => (firstTouch.get(left) ?? 0) - (firstTouch.get(right) ?? 0));
};

/**
 * The whole verdict on one drawn stroke.
 *
 * `tooShort` is reported separately from "missed", because they need different
 * responses: a tap is probably someone trying to select a term, while a long
 * line through the wrong place is a mathematical guess.
 */
export const evaluateStroke = ({ points = [], termRects = [], expectedPair = null, padding = HIT_PADDING } = {}) => {
  const length = strokeLength(points);
  const struck = resolveStruckTerms(points, termRects, { padding });

  if (length < MIN_STROKE_LENGTH && struck.length < 2) {
    return { length, struck, tooShort: true, matched: false, reason: 'too_short' };
  }

  if (!expectedPair) {
    return { length, struck, tooShort: false, matched: struck.length >= 2, reason: struck.length >= 2 ? 'struck_pair' : 'missed' };
  }

  const wanted = new Set(expectedPair);
  const matched = expectedPair.length > 0 && expectedPair.every((index) => struck.includes(index));
  const extra = struck.filter((index) => !wanted.has(index));

  return {
    length,
    struck,
    tooShort: false,
    matched,
    // Crossing the right pair plus something else still counts. A student who
    // draws one long line through three terms to reach the pair has not made a
    // mathematical error, and refusing it would be punishing handwriting.
    extraTermsCrossed: extra,
    reason: matched ? 'matched' : struck.length ? 'wrong_terms' : 'missed',
  };
};

/**
 * The SVG path for the live ink. Kept here so the component does no geometry.
 */
export const strokeToPath = (points = []) => {
  if (points.length < 2) return '';
  return points.reduce(
    (path, point, index) => (index === 0 ? `M ${point.x} ${point.y}` : `${path} L ${point.x} ${point.y}`),
    '',
  );
};
