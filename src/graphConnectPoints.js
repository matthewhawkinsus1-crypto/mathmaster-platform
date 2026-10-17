/*
 * "CONNECT MY POINTS": THE CURVE, BY KEYBOARD (pass 3, TOOL-1).
 *
 * A function-graph question asks for points and then a curve drawn through
 * them. The points could be placed with the arrow keys and Enter; the curve
 * could only be drawn with a mouse or a finger, so a keyboard or switch student
 * could not finish the question at all.
 *
 * "Connect my points" draws the stroke for them — through THEIR OWN placed
 * points, in the order of x, as a smooth curve — and hands it to exactly the
 * check a hand-drawn stroke goes through (constructionSketchMatches where
 * outcomes are shown, constructionSketchThroughOwnPoints where they are not).
 * Nothing is drawn from the answer: wrong points give a curve through wrong
 * points, and the same check refuses it. The same holds for the inverse sketch
 * through the student's reflected points.
 *
 * Pure (no React) so node can test it against the real checks.
 */
import { graphToViewBox, readGraphPoint } from '../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';

const own = (map, key) => (map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);

/** The student's placed construction points the curve goes through (a rational center is not on it). */
export const constructionPointsToConnect = (model, placements) => (model?.tasks || [])
  .filter((task) => task.role !== 'center')
  .map((task) => readGraphPoint(own(placements, task.id)))
  .filter(Boolean);

/** Where a rational's two branches part: the student's own placed center, if there is one. */
export const constructionBranchSplitX = (model, placements) => {
  if (Number(model?.requiredStrokeCount) !== 2) return null;
  const center = (model?.tasks || []).find((task) => task.role === 'center');
  const placed = center ? readGraphPoint(own(placements, center.id)) : null;
  if (placed) return placed[0];
  const h = Number(model?.functionSpec?.h);
  return Number.isFinite(h) ? h : null;
};

/** The student's reflected points the inverse sketch goes through. */
export const inversePointsToConnect = (model, selections) => (model?.analysisParts || [])
  .filter((part) => part.kind === 'inversePoint')
  .flatMap((part) => (Array.isArray(own(selections, part.id)) ? own(selections, part.id) : []))
  .map(readGraphPoint)
  .filter(Boolean);

/*
 * A smooth y(x) through the points: piecewise cubic Hermite with Fritsch–Carlson
 * slopes, so it never overshoots between two points (a curve that bulged past
 * the student's points would be the tool inventing mathematics) and keeps a
 * turning point where the student put one.
 */
const monotoneSlopes = (xs, ys) => {
  const n = xs.length;
  const secants = [];
  for (let i = 0; i < n - 1; i += 1) secants.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const slopes = Array.from({ length: n });
  slopes[0] = secants[0];
  slopes[n - 1] = secants[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    slopes[i] = secants[i - 1] * secants[i] <= 0 ? 0 : (secants[i - 1] + secants[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (secants[i] === 0) { slopes[i] = 0; slopes[i + 1] = 0; continue; }
    const a = slopes[i] / secants[i];
    const b = slopes[i + 1] / secants[i];
    const length = Math.hypot(a, b);
    if (length > 3) {
      const t = 3 / length;
      slopes[i] = t * a * secants[i];
      slopes[i + 1] = t * b * secants[i];
    }
  }
  return slopes;
};

/** Sampled graph points of the smooth curve through `points` (sorted by x, one per x). */
export const smoothCurveThrough = (points, samplesPerSegment = 16) => {
  const byX = new Map();
  points.forEach(([x, y]) => { if (!byX.has(x)) byX.set(x, y); });
  const xs = [...byX.keys()].sort((a, b) => a - b);
  const ys = xs.map((x) => byX.get(x));
  if (xs.length < 2) return [];
  const slopes = monotoneSlopes(xs, ys);
  const out = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    const h = xs[i + 1] - xs[i];
    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * slopes[i]
        + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * slopes[i + 1];
      out.push([xs[i] + t * h, y]);
    }
  }
  out.push([xs[xs.length - 1], ys[ys.length - 1]]);
  return out;
};

/**
 * The strokes "Connect my points" draws, in the viewBox units a hand-drawn
 * stroke is stored in, under the camera on screen. A rational's branches are
 * separate strokes on either side of `splitX`; a side with fewer than two
 * points draws nothing there, so the check asks for more points.
 */
export const connectPointsStrokes = ({ points = [], camera, splitX = null, samplesPerSegment = 16 }) => {
  const toViewBox = graphToViewBox(camera);
  const groups = Number.isFinite(splitX)
    ? [points.filter(([x]) => x < splitX), points.filter(([x]) => x > splitX)]
    : [points];
  return groups
    .map((group) => smoothCurveThrough(group, samplesPerSegment))
    .filter((curve) => curve.length >= 2)
    .map((curve) => curve.map(toViewBox).map(([x, y]) => [Math.round(x), Math.round(y)]));
};
