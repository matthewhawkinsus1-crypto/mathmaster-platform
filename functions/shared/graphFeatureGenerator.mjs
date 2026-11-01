/*
 * GENERATED GRAPH-FEATURE QUESTIONS: SEEDED, INDIVIDUAL, AND VALIDATED.
 *
 * Every student gets their own graphs. What they share is the SCHEDULE: a
 * round is cut into blocks of six slots — (family, feature, variant, tier) —
 * and every student in the room receives the same six slots in each block, in
 * their own order, with their own numbers. After any whole number of blocks
 * two students have faced exactly the same mix of learning targets and
 * difficulty; mid-block they differ by at most one block's arrangement. A
 * neighbour's screen shows a different graph, usually about a different
 * feature, so copying a tap location is useless.
 *
 * DETERMINISM. Question k for a student is a pure function of
 *
 *   (room secret, student, round, k, config, GENERATOR_VERSION)
 *
 * so the server never stores what it issued: it regenerates a question to
 * grade a tap on it, and a question that misbehaves can be reproduced exactly
 * from those inputs. Changing anything that alters generated questions MUST
 * bump GRAPH_FEATURE_GENERATOR_VERSION; a room created under another version
 * refuses to issue or grade rather than grade a tap against a different graph.
 *
 * VALIDATION. A candidate is issued only when
 *
 *   - the family's exact analysis agrees with the requested variant (a
 *     "two zeros" parabola has exactly two zeros, on the grid);
 *   - every target sits inside the view, away from the edges;
 *   - multiple targets are well apart (no two zeros a fingertip apart);
 *   - both axes are visible, and asymptotes are inside the view;
 *   - enough of the curve is on screen;
 *   - for x-intercept questions, nowhere does the curve skim the x-axis
 *     without crossing it (a near-miss that LOOKS like a zero), unless the
 *     variant is the deliberate "asymptote on the axis" case;
 *   - at every zero the curve leaves the axis promptly and evenly, so where
 *     it visibly meets the axis is where the zero is (a crossing so shallow
 *     that the curve lies along the axis for a stretch is a guess, not a
 *     reading);
 *   - open endpoints are clearly separated from closed ones and from targets;
 *   - THE CURVE LEAVES THE SCREEN ONLY AT ITS ENDS: each continuous piece is
 *     on screen as one stretch, which ends at a dot (its own end, inside the
 *     view) or by leaving through an edge, where the screen draws an arrow —
 *     so an arrow always means "keeps going", never "comes back"
 *     (graphFeatureCurves.mjs curveRuns), and no stretch turns back just
 *     inside an edge, where it would look like it left;
 *   - a restricted domain's ends are inside the view, so every end of the
 *     curve is drawn as a dot and never hidden past an edge an arrow claims;
 *   - for an asymptote question, the asymptotes are the targets: lines,
 *     inside the view, tapped anywhere along them;
 *   - for a set question (a domain, a range, an interval), the answer is a
 *     set marked on the graph itself: every finite end of it is something a
 *     student can tap — a point where the graph starts, stops, turns or
 *     crosses (the question's `landmarks`, every one on the half-unit grid
 *     along the set's axis), or an asymptote — well inside the view; every
 *     infinite end is an arrow that really runs off that way (curveEnds); and
 *     the set can be drawn with at most two dots;
 *   - OFF THE SCREEN (a game with off-screen features): every target of the
 *     feature lies well past an edge, the curve still shows where it is
 *     heading (the family's anchors in view), and an off-screen zero is not
 *     approached on screen (offScreenProblems).
 *
 * If a slot ever exhausted its attempts, a known-good question for the same
 * feature is issued instead and marked `fallback`; tests hold every slot to
 * never needing it.
 *
 * Pure: Cloud Functions and tests.
 */

import * as Q from './graphFeatureRational.mjs';
import { createRng } from './seededRandom.mjs';
import {
  curveEnds,
  curveRuns,
  curveSegments,
  evaluateGraph,
  graphAsymptotes,
  graphDomain,
  graphMarkers,
  unrestrictedGraph,
  visibleCurveFraction,
} from './graphFeatureCurves.mjs';
import {
  DOES_NOT_EXIST_TARGET_ID,
  GRAPH_FEATURE,
  OFF_SCREEN_TARGET_ID,
  QUESTION_TIER,
  QUESTION_TIER_ORDER,
  SET_FEATURE_AXIS,
  featureTargetId,
  featureWordings,
  getGraphFeature,
  isSetFeature,
  tierRank,
} from './graphFeatureRegistry.mjs';
import {
  FEATURE_STATUS,
  LINE_ORIENTATION,
  familyVariants,
  getGraphFamily,
  tierGridDenominator,
} from './graphFeatureFamilies.mjs';
import { canonicalSet, drawingForSet, onDrawingGrid, setEndpoints, setToPlain } from './numberLineSets.mjs';
import { rushQuestionWeight } from './graphFeatureRushRules.mjs';

// 3: arrows and endpoints (every graph leaves the screen only at its ends),
// restricted domains, asymptote questions, off-screen features.
// 4: sets marked on the graph (landmarks; an answer's ends need only be
// tappable, not on a grid line), each item's weight, interval features.
export const GRAPH_FEATURE_GENERATOR_VERSION = 4;

export const SCHEDULE_BLOCK_SIZE = 6;
export const MAX_GENERATION_ATTEMPTS = 80;

const { EASY, STANDARD, CHALLENGE } = QUESTION_TIER;

/* --------------------------------- PRNG ---------------------------------- */

// cyrb128 → sfc32, shared with Graph the Line (seededRandom.mjs). Re-exported:
// callers and tests have always imported it from here.
export { createRng };

/* --------------------------------- views --------------------------------- */

const NICE_HALF_SPANS = Object.freeze([5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 40]);
// A lopsided (Challenge) window is never narrower than this: a 2-by-2 window
// flattens a cubic into a line and turns a parabola into a corner.
const MIN_LOPSIDED_SPAN = 6;
const MAX_X_SPAN = Object.freeze({ [EASY]: 20, [STANDARD]: 32, [CHALLENGE]: 48 });
const MAX_Y_SPAN = Object.freeze({ [EASY]: 20, [STANDARD]: 40, [CHALLENGE]: 60 });
const VALUE_LIMIT = Object.freeze({ [EASY]: 9, [STANDARD]: 16, [CHALLENGE]: 24 });

export const VIEW_RULES = Object.freeze({
  targetInset: 0.08,
  keyInset: 0.04,
  originInset: 0.03,
  asymptoteInset: 0.1,
  targetSeparation: 0.15,
  ghostBand: 0.05,
  ghostReach: 0.08,
  crossingDepth: 0.06,
  // Where the drawn curve visibly lies ON the x-axis: within this fraction of
  // the height (about 5 px on a phone). Around a zero that stretch may reach
  // at most contactReach of the width to either side (flatContactReach for a
  // curve that touches and turns, or flattens through, its zero), and must
  // be centred on the zero within contactCentring.
  contactBand: 0.015,
  contactReach: 0.06,
  flatContactReach: 0.1,
  contactCentring: 0.02,
  openMarkerClearance: 0.06,
  jumpClearance: 0.08,
  asymptoteClearance: 0.08,
  // A restricted domain's end dot is at least this far inside the edges.
  domainEndInset: 0.06,
  // An off-screen target is at least this far past an edge (a fraction of
  // that axis's span): plainly off the screen, not a dot cut in half.
  offScreenMargin: 0.1,
});

/** Whether a target is a line (an asymptote) rather than a point. */
export const isLineTarget = (target) => target?.geometry === 'line';

/** Whether a target is a set drawn on an axis (a domain, a range, an interval). */
export const isSetTarget = (target) => target?.geometry === 'set';

/*
 * A SET IN ITS VIEW, MARKED ON THE GRAPH: every finite end is something a
 * student can tap — a landmark's x (or y, on the y-axis), or an asymptote
 * across that axis — well inside the view; every infinite end is an arrow
 * that runs off that way along the axis (curveEnds: the flat end of an
 * exponential says nothing about a range, a branch beside its asymptote
 * nothing about a domain); and the whole set is drawable with at most two
 * dots (numberLineSets.drawingForSet).
 */
const setTargetProblems = (target, view, { graph, landmarks = [] } = {}) => {
  const problems = [];
  const vertical = target.axis === 'y';
  const [low, high] = vertical ? [view.yMin, view.yMax] : [view.xMin, view.xMax];
  const span = high - low;
  const asymptotes = graph ? graphAsymptotes(graph) : { vertical: [], horizontal: [] };
  const tappable = [
    ...landmarks.map((point) => (vertical ? point.y : point.x)),
    ...(vertical ? asymptotes.horizontal : asymptotes.vertical),
  ];
  setEndpoints(target.exactSet).forEach((value) => {
    if (value - low < VIEW_RULES.targetInset * span || high - value < VIEW_RULES.targetInset * span) problems.push('an end of the set is at the edge');
    if (!tappable.some((candidate) => Math.abs(candidate - value) < 1e-9)) problems.push('an end of the set is nothing a student can tap');
  });
  const set = target.exactSet;
  if (graph && set.length) {
    const ends = curveEnds(graph, view);
    const heads = (direction) => ends.some((end) => end.heads[vertical ? 'y' : 'x'] === direction);
    if (set[0].lo === null && !heads(-1)) problems.push('the set keeps going where no arrow does');
    if (set[set.length - 1].hi === null && !heads(1)) problems.push('the set keeps going where no arrow does');
  }
  if (!drawingForSet(set)) problems.push('the set cannot be drawn with two dots');
  return problems;
};

/*
 * WHAT A STUDENT CAN TAP ON A SET QUESTION: where the graph starts, stops,
 * turns and crosses — its endpoint dots (each with whether it is on the
 * graph), its turning points, its zeros and its y-intercept — inside the
 * view. Every one of them, whatever the question asks, so the list never
 * gives the answer away (a domain question still offers the zeros). The
 * device lands a tap on the nearest (rushGraphModel.setTapAt).
 */
const POINT_KEY = (point) => `${Math.round(point.x * 1e6)}|${Math.round(point.y * 1e6)}`;
export const setLandmarksFor = ({ family, params, graph, view }) => {
  const analysis = family.analyze(params);
  const exactPoints = (featureId) => (analysis[featureId]?.status === FEATURE_STATUS.EXISTS ? analysis[featureId].points : [])
    .filter((p) => p && p.x !== undefined && p.y !== undefined)
    .map((p) => ({ x: Q.toNumber(p.x), y: Q.toNumber(p.y), closed: true }));
  const turning = (family.turningPoints?.(params) || []).map((p) => ({ x: Q.toNumber(p.x), y: Q.toNumber(p.y), closed: true }));
  const markers = graphMarkers(graph, view).map((marker) => ({ x: marker.x, y: marker.y, closed: marker.closed === true }));
  const inView = (point) => point.x >= view.xMin && point.x <= view.xMax && point.y >= view.yMin && point.y <= view.yMax;
  const byPlace = new Map();
  [...markers, ...turning, ...exactPoints(GRAPH_FEATURE.X_INTERCEPT), ...exactPoints(GRAPH_FEATURE.Y_INTERCEPT)]
    .filter(inView)
    .forEach((point) => {
      const key = POINT_KEY(point);
      // A point on the graph wins over an open dot drawn at the same place.
      if (!byPlace.has(key) || point.closed) byPlace.set(key, Object.freeze({ x: point.x, y: point.y, closed: point.closed }));
    });
  return Object.freeze([...byPlace.values()].sort((left, right) => left.x - right.x || left.y - right.y));
};

/** The tick step for a span: the smallest of 1, 2, 5, 10 giving ≤ 14 lines. */
export const tickStep = (span) => [1, 2, 5, 10, 20].find((step) => span / step <= 14) || 20;

const niceHalf = (needed) => NICE_HALF_SPANS.find((half) => half >= needed) ?? null;

const snapOut = (low, high, step) => [Math.floor(low / step) * step, Math.ceil(high / step) * step];

const extent = (values) => [Math.min(...values), Math.max(...values)];

/**
 * Choose a window for a candidate. Required points (targets, the shape's key
 * points, asymptotes, the origin) must fit; framing points are added only
 * when they do not blow the window past the tier's limits. Returns null when
 * the candidate cannot be shown readably.
 */
export const chooseView = ({ required = [], framing = [], asymptotes = { vertical: [], horizontal: [] }, tier = STANDARD, symmetric = true }) => {
  const xs = [0, ...required.map((p) => p.x), ...asymptotes.vertical];
  const ys = [0, ...required.map((p) => p.y), ...asymptotes.horizontal];
  if (![...xs, ...ys].every(Number.isFinite)) return null;
  let [xLow, xHigh] = extent(xs);
  let [yLow, yHigh] = extent(ys);
  const maxX = MAX_X_SPAN[tier];
  const maxY = MAX_Y_SPAN[tier];
  framing.forEach((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const nx = [Math.min(xLow, p.x), Math.max(xHigh, p.x)];
    const ny = [Math.min(yLow, p.y), Math.max(yHigh, p.y)];
    if ((nx[1] - nx[0]) * 1.3 <= maxX && (ny[1] - ny[0]) * 1.3 <= maxY) {
      [xLow, xHigh] = nx;
      [yLow, yHigh] = ny;
    }
  });
  const pad = (low, high) => Math.max(1, 0.16 * (high - low));
  const xPad = pad(xLow, xHigh);
  const yPad = pad(yLow, yHigh);
  let window;
  if (symmetric) {
    const xHalf = niceHalf(Math.max(Math.abs(xLow - xPad), Math.abs(xHigh + xPad)));
    const yHalf = niceHalf(Math.max(Math.abs(yLow - yPad), Math.abs(yHigh + yPad)));
    if (!xHalf || !yHalf) return null;
    // Similar spans share one scale, so a slope of 1 looks like a slope of 1.
    const uniform = Math.max(xHalf, yHalf) / Math.min(xHalf, yHalf) <= 1.6;
    const xH = uniform ? Math.max(xHalf, yHalf) : xHalf;
    const yH = uniform ? Math.max(xHalf, yHalf) : yHalf;
    window = { xMin: -xH, xMax: xH, yMin: -yH, yMax: yH };
  } else {
    const atLeastMinimum = (low, high) => {
      const missing = MIN_LOPSIDED_SPAN - (high - low);
      return missing > 0 ? [low - missing / 2, high + missing / 2] : [low, high];
    };
    const [xa, xb] = atLeastMinimum(xLow - xPad, xHigh + xPad);
    const [ya, yb] = atLeastMinimum(yLow - yPad, yHigh + yPad);
    const [x0, x1] = snapOut(xa, xb, tickStep(xb - xa));
    const [y0, y1] = snapOut(ya, yb, tickStep(yb - ya));
    window = { xMin: x0, xMax: x1, yMin: y0, yMax: y1 };
  }
  const xSpan = window.xMax - window.xMin;
  const ySpan = window.yMax - window.yMin;
  if (xSpan > maxX || ySpan > maxY) return null;
  return Object.freeze({ ...window, xStep: tickStep(xSpan), yStep: tickStep(ySpan) });
};

const insetOk = (p, view, inset) => {
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  return p.x - view.xMin >= inset * xSpan && view.xMax - p.x >= inset * xSpan
    && p.y - view.yMin >= inset * ySpan && view.yMax - p.y >= inset * ySpan;
};

const normalizedDistance = (a, b, view) => Math.hypot(
  (a.x - b.x) / (view.xMax - view.xMin),
  (a.y - b.y) / (view.yMax - view.yMin),
);

/*
 * The x-axis must not be skimmed without being crossed. Every place where the
 * curve comes CLOSEST to the axis — a local minimum of |f|, or the end of a
 * piece of the curve — must either be well clear of the axis or be a real
 * zero. A vertex hovering just above the axis, an endpoint a hair off it, or
 * an asymptote hugging it all read as zeros that are not there.
 *
 * A crossing's closest approach IS its zero, so this rule passes it; how
 * readably the curve crosses is zerosReadable's question.
 */
const ghostZeroFree = (graph, view, zeros, allowedXs = []) => {
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  const band = VIEW_RULES.ghostBand * ySpan;
  const reach = VIEW_RULES.ghostReach * xSpan;
  // A deliberate approach — an open end sitting on the axis — is the question
  // itself, not a ghost.
  const nearZero = (x) => zeros.some((zero) => Math.abs(zero.x - x) <= reach)
    || allowedXs.some((allowed) => Math.abs(allowed - x) <= reach);
  return curveSegments(graph, view).every((segment) => {
    const count = 400;
    const nudge = (segment.to - segment.from) / 4000;
    const samples = [];
    for (let index = 0; index <= count; index += 1) {
      let x = segment.from + ((segment.to - segment.from) * index) / count;
      if (index === 0 && !segment.fromClosed) x += nudge;
      if (index === count && !segment.toClosed) x -= nudge;
      const y = evaluateGraph(graph, x);
      if (Number.isFinite(y)) samples.push({ x, magnitude: Math.abs(y) });
    }
    return samples.every((sample, index) => {
      if (sample.magnitude >= band) return true;
      const before = samples[index - 1];
      const after = samples[index + 1];
      const closestApproach = (!before || before.magnitude >= sample.magnitude)
        && (!after || after.magnitude >= sample.magnitude);
      return !closestApproach || nearZero(sample.x);
    });
  });
};

/*
 * Where a zero is must be readable from where the curve meets the axis. The
 * stretch around each zero along which the drawn curve lies ON the axis
 * (within contactBand of the height) must be short — a crossing so shallow
 * that the curve runs along the axis is a guess, not a reading — and centred
 * on the zero, so a student who taps the middle of what they see taps the
 * zero. A curve that touches and turns at its zero (a double root) or
 * flattens through it (a triple root) is flat there by nature: it gets a
 * longer stretch, which its symmetry keeps centred. A stretch that runs off
 * the edge of the view never passes.
 */
const zerosReadable = (graph, view, zeros, flat, endXs = []) => {
  const xSpan = view.xMax - view.xMin;
  const band = VIEW_RULES.contactBand * (view.yMax - view.yMin);
  const reach = (flat ? VIEW_RULES.flatContactReach : VIEW_RULES.contactReach) * xSpan;
  const step = xSpan / 2000;
  const onAxis = (x) => {
    const y = evaluateGraph(graph, x);
    return Number.isFinite(y) && Math.abs(y) < band;
  };
  return zeros.every((zero) => {
    let left = zero.x;
    while (left - step >= view.xMin && onAxis(left - step)) left -= step;
    let right = zero.x;
    while (right + step <= view.xMax && onAxis(right + step)) right += step;
    if (left - step < view.xMin || right + step > view.xMax) return false;
    if (Math.max(zero.x - left, right - zero.x) > reach) return false;
    // A zero at an end of the graph is marked by its dot, exactly; the curve
    // runs off it to one side only, so it is never centred and need not be.
    if (endXs.some((x) => Math.abs(x - zero.x) < 1e-9)) return true;
    return Math.abs((left + right) / 2 - zero.x) <= VIEW_RULES.contactCentring * xSpan;
  });
};

/*
 * A graph that ENDS on the x-axis — a ray from its zero, or from an open dot
 * there — is a question about that dot, so the curve must leave the axis
 * promptly: within a few percent of the width of its end it is well clear of
 * the axis. A shallow ray hugging the axis all the way to its dot reads as
 * neither a crossing nor a miss.
 */
const endsLeaveAxis = (graph, view, endXs) => {
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  const formula = unrestrictedGraph(graph);
  return endXs.every((x) => {
    if (Math.abs(evaluateGraph(formula, x)) > 1e-9) return true;
    const probes = [x - 2 * VIEW_RULES.contactReach * xSpan, x + 2 * VIEW_RULES.contactReach * xSpan]
      .map((probe) => evaluateGraph(graph, probe))
      .filter(Number.isFinite);
    return probes.length > 0 && probes.every((y) => Math.abs(y) >= VIEW_RULES.crossingDepth * ySpan);
  });
};

/*
 * Two zeros next to each other are two crossings only if the curve visibly
 * leaves the axis between them; a shallow dip between close zeros reads as a
 * single touch.
 */
const separatedCrossings = (graph, view, zeros) => {
  const sorted = [...zeros].sort((left, right) => left.x - right.x);
  const ySpan = view.yMax - view.yMin;
  for (let index = 1; index < sorted.length; index += 1) {
    const from = sorted[index - 1].x;
    const to = sorted[index].x;
    let furthest = 0;
    for (let step = 1; step < 64; step += 1) {
      const y = evaluateGraph(graph, from + ((to - from) * step) / 64);
      if (Number.isFinite(y)) furthest = Math.max(furthest, Math.abs(y));
    }
    if (furthest < VIEW_RULES.crossingDepth * ySpan) return false;
  }
  return true;
};

// Whether a point lies well past an edge of the view.
const pastEdge = (p, view, margin) => {
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  return p.x < view.xMin - margin * xSpan || p.x > view.xMax + margin * xSpan
    || p.y < view.yMin - margin * ySpan || p.y > view.yMax + margin * ySpan;
};

/*
 * THE CURVE LEAVES THE SCREEN ONLY AT ITS ENDS (see the header). Each piece of
 * the graph must be on screen as exactly one stretch: a piece that leaves and
 * comes back would carry an arrow that does not mean "keeps going", and a
 * piece not on screen at all is a part of the graph nobody can read.
 */
const curveRunProblems = (graph, view) => {
  const problems = [];
  curveRuns(graph, view).forEach((segment) => {
    if (!segment.runs.length) problems.push('a piece of the graph is off the screen');
    else if (segment.runs.length > 1) problems.push('the curve leaves the screen and comes back');
    if (segment.runs.some((run) => run.grazes)) problems.push('the curve turns back just inside an edge');
  });
  return problems;
};

/** Every reason a candidate in a view is not fit to issue (empty = issue it). */
export const viewProblems = ({ family, feature, variant, graph, view, targets, tier, landmarks = [] }) => {
  const problems = [];
  if (!view) return ['no readable view'];
  const grid = tierGridDenominator(tier);
  const offScreen = variant.flags?.offScreen === true;
  // An off-screen question's targets are hidden: the checks for targets on
  // screen do not apply to them (offScreenProblems has its own).
  const shown = offScreen ? [] : targets;
  const points = shown.filter((target) => !isLineTarget(target) && !isSetTarget(target));
  if (isSetFeature(feature)) {
    // Every point a student can tap drops a dot there: none between
    // half-units along the set's axis (a zero at x = 2.25 could not be
    // drawn, so its tap would do nothing) — on a "Does Not Exist" question
    // too, which must play exactly like the others.
    const axis = SET_FEATURE_AXIS[feature];
    if (landmarks.some((point) => !onDrawingGrid(point[axis]))) problems.push('a point a student can tap is between grid numbers');
  }
  targets.forEach((target) => {
    if (isSetTarget(target)) {
      problems.push(...setTargetProblems(target, view, { graph, landmarks }));
      return;
    }
    const onGrid = isLineTarget(target)
      ? Q.onGrid(target.exactValue, grid)
      : Q.onGrid(target.exactX, grid) && Q.onGrid(target.exactY, grid);
    if (!onGrid) problems.push('target off the grid');
  });
  points.forEach((target) => {
    if (!insetOk(target, view, VIEW_RULES.targetInset)) problems.push('target too close to the edge');
    if (tier === EASY && target.x === 0 && target.y === 0) problems.push('target at the origin on Easy');
  });
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (normalizedDistance(points[i], points[j], view) < VIEW_RULES.targetSeparation) problems.push('targets too close together');
    }
  }
  if (!insetOk({ x: 0, y: 0 }, view, VIEW_RULES.originInset)) problems.push('axes not clearly visible');
  const asymptotes = graphAsymptotes(graph);
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  asymptotes.vertical.forEach((x) => {
    if (x - view.xMin < VIEW_RULES.asymptoteInset * xSpan || view.xMax - x < VIEW_RULES.asymptoteInset * xSpan) problems.push('asymptote at the edge');
    points.forEach((target) => { if (Math.abs(target.x - x) < VIEW_RULES.asymptoteClearance * xSpan) problems.push('target hugs an asymptote'); });
  });
  asymptotes.horizontal.forEach((y) => {
    if (y - view.yMin < VIEW_RULES.asymptoteInset * ySpan || view.yMax - y < VIEW_RULES.asymptoteInset * ySpan) problems.push('asymptote at the edge');
    points.forEach((target) => { if (Math.abs(target.y - y) < VIEW_RULES.asymptoteClearance * ySpan) problems.push('target hugs an asymptote'); });
  });
  if (visibleCurveFraction(graph, view) < (family.minVisibleFraction ?? 0.2)) problems.push('too little of the curve is visible');
  problems.push(...curveRunProblems(graph, view));
  // Every end of a restricted graph is a dot well inside the view.
  const domain = graphDomain(graph);
  const endXs = domain ? [domain.from, domain.to].filter(Boolean).map((end) => end.x) : [];
  endXs.forEach((x) => {
    const y = evaluateGraph(unrestrictedGraph(graph), x);
    if (!Number.isFinite(y) || !insetOk({ x, y }, view, VIEW_RULES.domainEndInset)) problems.push('an end of the graph is at the edge of the screen');
  });
  if (feature === GRAPH_FEATURE.X_INTERCEPT && !offScreen) {
    const openEndsOnAxis = variant.flags?.openEndOnAxis === true ? endXs : [];
    if (variant.flags?.asymptoteOnAxis !== true && !ghostZeroFree(graph, view, points, openEndsOnAxis)) {
      problems.push('the curve skims the x-axis without crossing it');
    }
    if (!separatedCrossings(graph, view, points)) problems.push('neighbouring zeros are not visibly separate');
    if (!zerosReadable(graph, view, points, variant.flags?.flatZero === true, endXs)) problems.push('where the curve meets the x-axis is not clear');
    if (!endsLeaveAxis(graph, view, endXs)) problems.push('the curve hugs the x-axis up to its end');
  }
  // A domain that excludes x = 0 must visibly do so.
  if (feature === GRAPH_FEATURE.Y_INTERCEPT && !variant.exists && variant.flags?.domainExcludesZero) {
    const nearest = Math.min(...curveSegments(graph, view).map((segment) => Math.min(Math.abs(segment.from), Math.abs(segment.to))));
    if (nearest < 0.1 * xSpan) problems.push('the domain gap at the y-axis is too narrow to see');
  }
  const markers = graphMarkers(graph, view);
  markers.filter((marker) => !marker.closed).forEach((open) => {
    points.forEach((target) => {
      if (normalizedDistance(open, target, view) < VIEW_RULES.openMarkerClearance) problems.push('target beside an open endpoint');
    });
    markers.filter((marker) => marker.closed && marker.x === open.x).forEach((closed) => {
      if (Math.abs(closed.y - open.y) < VIEW_RULES.jumpClearance * ySpan) problems.push('open and closed endpoints overlap');
    });
  });
  if (offScreen) problems.push(...offScreenProblems({ feature, graph, view, targets }));
  return [...new Set(problems)];
};

/*
 * AN OFF-SCREEN QUESTION: the feature exists, every one of its targets lies
 * well past an edge, and nothing on screen passes for it. A hidden zero is
 * never approached on screen (the curve stays clear of the x-axis there), so
 * the only way to the answer is where the curve is heading: its arrows.
 */
const offScreenProblems = ({ feature, graph, view, targets }) => {
  const problems = [];
  if (!targets.length || targets.some((target) => isLineTarget(target) || !pastEdge(target, view, VIEW_RULES.offScreenMargin))) {
    problems.push('an off-screen target is on or near the screen');
  }
  if (feature === GRAPH_FEATURE.X_INTERCEPT && !ghostZeroFree(graph, view, [])) problems.push('the curve nears the x-axis on screen');
  return problems;
};

/**
 * The views that can show an off-screen question, widest first: symmetric
 * square windows that keep `anchors` well inside and every one of `hidden`
 * well past an edge. The widest that passes viewProblems shows the most of
 * where the curve is going.
 */
export const offScreenViews = ({ anchors = [], hidden = [], tier = STANDARD } = {}) => NICE_HALF_SPANS
  .filter((half) => 2 * half <= MAX_X_SPAN[tier] && 2 * half <= MAX_Y_SPAN[tier])
  .map((half) => Object.freeze({ xMin: -half, xMax: half, yMin: -half, yMax: half, xStep: tickStep(2 * half), yStep: tickStep(2 * half) }))
  .filter((view) => anchors.every((p) => insetOk(p, view, VIEW_RULES.targetInset))
    && hidden.every((p) => pastEdge(p, view, VIEW_RULES.offScreenMargin)))
  .reverse();

/* ------------------------------- generation ------------------------------ */

const EXPECTED_TARGETS = Object.freeze({
  two: 2,
  three: 3,
  one: 1,
  triple: 1,
  single: 1,
  rayFromZero: 1,
  cutOneZero: 1,
  rayFromAxis: 1,
  twoOnAxis: 2,
  oneOnAxis: 1,
  // A domain or range is one target: the set.
  all: 1,
  ray: 1,
  segment: 1,
  openEnds: 1,
  constant: 1,
  fromVertex: 1,
  cut: 1,
  asymptote: 1,
  endpoint: 1,
  allButOne: 1,
  pieces: 1,
});

const expectedTargetCount = (familyId, variantId, featureId) => {
  // A domain, a range or an interval: one target, the set.
  if (isSetFeature(featureId)) return 1;
  if (variantId === 'tangent') return familyId === 'cubic' ? 2 : 1;
  // An off-screen V hides both of its zeros; every other hidden feature is one.
  if (variantId === 'offScreen') return familyId === 'absolute' && featureId === GRAPH_FEATURE.X_INTERCEPT ? 2 : 1;
  return EXPECTED_TARGETS[variantId] ?? null;
};

// A target as the generator keeps it: exact coordinates beside the numbers. A
// line (an asymptote) carries its orientation and the one coordinate it fixes;
// a set (a domain, a range, an interval), its axis and its pieces.
const toTarget = (featureId, exact, index) => {
  const id = featureTargetId(featureId, index);
  if (exact.set) return Object.freeze({ id, geometry: 'set', axis: exact.axis, set: setToPlain(exact.set), exactSet: exact.set });
  if (exact.orientation) {
    const vertical = exact.orientation === LINE_ORIENTATION.VERTICAL;
    const value = vertical ? exact.x : exact.y;
    return Object.freeze({
      id,
      geometry: 'line',
      orientation: exact.orientation,
      ...(vertical ? { x: Q.toNumber(value) } : { y: Q.toNumber(value) }),
      exactValue: value,
    });
  }
  return Object.freeze({ id, x: Q.toNumber(exact.x), y: Q.toNumber(exact.y), exactX: exact.x, exactY: exact.y });
};

// Targets in a stable order: points left to right; lines vertical first,
// then each kind by where it sits.
const compareTargets = (left, right) => {
  if (left.set || right.set) return 0;
  if (left.orientation || right.orientation) {
    if (left.orientation !== right.orientation) return left.orientation === LINE_ORIENTATION.VERTICAL ? -1 : 1;
    return left.orientation === LINE_ORIENTATION.VERTICAL ? Q.cmp(left.x, right.x) : Q.cmp(left.y, right.y);
  }
  return Q.cmp(left.x, right.x);
};

/** The target a device receives: no exact fractions, nothing else. */
const publicTarget = (target) => {
  if (isSetTarget(target)) return Object.freeze({ id: target.id, geometry: 'set', axis: target.axis, set: target.set });
  return isLineTarget(target)
    ? Object.freeze({ id: target.id, geometry: 'line', orientation: target.orientation, ...(target.orientation === LINE_ORIENTATION.VERTICAL ? { x: target.x } : { y: target.y }) })
    : Object.freeze({ id: target.id, x: target.x, y: target.y });
};

const asPlain = (points) => points.map((p) => ({ x: Q.toNumber(p.x), y: Q.toNumber(p.y) }));

/**
 * One attempt at a slot. Returns { question } or { problems }.
 */
const attemptSlot = ({ slot, rng }) => {
  const family = getGraphFamily(slot.family);
  const variant = familyVariants(slot.family, slot.feature, slot.tier).find((entry) => entry.id === slot.variant);
  if (!family || !variant) return { problems: ['unknown slot'] };
  const params = family.build(rng, { feature: slot.feature, variant: slot.variant, tier: slot.tier });
  if (!params) return { problems: ['no parameters'] };
  const analysis = family.analyze(params)[slot.feature];
  const wanted = variant.exists ? FEATURE_STATUS.EXISTS : FEATURE_STATUS.NONE;
  if (analysis?.status !== wanted) return { problems: [`analysis says ${analysis?.status}`] };
  const expected = variant.exists ? expectedTargetCount(slot.family, slot.variant, slot.feature) : 0;
  if (expected !== null && analysis.points.length !== expected) return { problems: ['wrong number of targets'] };

  const graph = family.toGraph(params);
  const targets = [...analysis.points].sort(compareTargets).map((p, index) => toTarget(slot.feature, p, index));
  const pointTargets = targets.filter((target) => !isLineTarget(target) && !isSetTarget(target));
  const keyPoints = asPlain(family.keyPoints(params));
  const limit = VALUE_LIMIT[slot.tier];
  if ([...keyPoints, ...pointTargets].some((p) => Math.abs(p.x) > limit + 3 || Math.abs(p.y) > (family.valueLimit?.(slot.tier) ?? limit))) {
    return { problems: ['values too large'] };
  }
  if (variant.flags?.offScreen === true) {
    // The widest window that still leaves the feature out and passes every
    // rule: the most of the curve's heading a student can read.
    const anchors = asPlain(family.offScreenAnchors?.(params, slot.feature) || []);
    let problems = ['no window leaves the feature off the screen'];
    for (const view of offScreenViews({ anchors, hidden: pointTargets, tier: slot.tier })) {
      problems = viewProblems({ family, feature: slot.feature, variant, graph, view, targets, tier: slot.tier });
      if (!problems.length) return { question: { graph, view, targets, offScreen: true } };
    }
    return { problems };
  }
  const optional = asPlain(family.optionalKeyPoints?.(params) || [])
    .filter((p) => Math.abs(p.y) <= limit && Math.abs(p.x) <= limit);
  const framing = [...optional, ...(family.framingPoints?.(params) || [])];
  const symmetric = slot.tier !== CHALLENGE || rng.chance(0.5);
  const view = chooseView({
    required: [...keyPoints, ...pointTargets],
    framing,
    asymptotes: family.asymptotes(params),
    tier: slot.tier,
    symmetric,
  });
  const landmarks = view && isSetFeature(slot.feature) ? setLandmarksFor({ family, params, graph, view }) : null;
  const problems = viewProblems({ family, feature: slot.feature, variant, graph, view, targets, tier: slot.tier, landmarks: landmarks || [] });
  if (problems.length) return { problems };
  return { question: { graph, view, targets, ...(landmarks ? { landmarks } : {}) } };
};

const FALLBACKS = Object.freeze({
  [GRAPH_FEATURE.X_INTERCEPT]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: 1, k: -4 }, targets: [[-1, 0], [3, 0]] },
  [GRAPH_FEATURE.Y_INTERCEPT]: { family: 'linear', graph: { kind: 'linear', m: 1, b: 2 }, targets: [[0, 2]] },
  [GRAPH_FEATURE.VERTEX]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: 1, k: -2 }, targets: [[1, -2]] },
  [GRAPH_FEATURE.MAXIMUM]: { family: 'quadratic', graph: { kind: 'quadratic', a: -1, h: 1, k: 3 }, targets: [[1, 3]] },
  [GRAPH_FEATURE.MINIMUM]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: -1, k: -3 }, targets: [[-1, -3]] },
  [GRAPH_FEATURE.ASYMPTOTE]: {
    family: 'rational',
    graph: { kind: 'rational', a: 2, h: 2, k: -1 },
    lines: [{ orientation: LINE_ORIENTATION.VERTICAL, x: 2 }, { orientation: LINE_ORIENTATION.HORIZONTAL, y: -1 }],
  },
  // A square root from (−2, 1): domain [−2, ∞), range [1, ∞).
  [GRAPH_FEATURE.DOMAIN]: { family: 'squareRoot', graph: { kind: 'squareRoot', a: 1, s: 1, h: -2, k: 1 }, set: { axis: 'x', pieces: [{ lo: -2, loClosed: true, hi: null }] } },
  [GRAPH_FEATURE.RANGE]: { family: 'squareRoot', graph: { kind: 'squareRoot', a: 1, s: 1, h: -2, k: 1 }, set: { axis: 'y', pieces: [{ lo: 1, loClosed: true, hi: null }] } },
  // y = (x − 1)² − 2: falling to its vertex (1, −2), rising after.
  [GRAPH_FEATURE.INCREASING]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: 1, k: -2 }, set: { axis: 'x', pieces: [{ lo: 1, loClosed: false, hi: null }] }, landmarks: [{ x: 0, y: -1, closed: true }, { x: 1, y: -2, closed: true }] },
  [GRAPH_FEATURE.DECREASING]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: 1, k: -2 }, set: { axis: 'x', pieces: [{ lo: null, hi: 1, hiClosed: false }] }, landmarks: [{ x: 0, y: -1, closed: true }, { x: 1, y: -2, closed: true }] },
  // y = 2, level everywhere.
  [GRAPH_FEATURE.CONSTANT]: { family: 'linear', graph: { kind: 'linear', m: 0, b: 2 }, set: { axis: 'x', pieces: [{ lo: null, hi: null }] }, landmarks: [{ x: 0, y: 2, closed: true }] },
  // y = x − 2: below the axis before its zero 2, above after.
  [GRAPH_FEATURE.POSITIVE]: { family: 'linear', graph: { kind: 'linear', m: 1, b: -2 }, set: { axis: 'x', pieces: [{ lo: 2, loClosed: false, hi: null }] }, landmarks: [{ x: 0, y: -2, closed: true }, { x: 2, y: 0, closed: true }] },
  [GRAPH_FEATURE.NEGATIVE]: { family: 'linear', graph: { kind: 'linear', m: 1, b: -2 }, set: { axis: 'x', pieces: [{ lo: null, hi: 2, hiClosed: false }] }, landmarks: [{ x: 0, y: -2, closed: true }, { x: 2, y: 0, closed: true }] },
});

const fallbackQuestion = (feature) => {
  const entry = FALLBACKS[feature] || FALLBACKS[GRAPH_FEATURE.X_INTERCEPT];
  if (entry.set) {
    const set = canonicalSet(entry.set.pieces.map((piece) => ({ ...piece, lo: piece.lo === null ? null : Q.rat(piece.lo), hi: piece.hi === null ? null : Q.rat(piece.hi) })));
    // The square root's endpoint is its one landmark: it starts there.
    const landmarks = entry.landmarks || [{ x: -2, y: 1, closed: true }];
    return { family: entry.family, graph: entry.graph, view: { xMin: -8, xMax: 8, yMin: -8, yMax: 8, xStep: 2, yStep: 2 }, targets: [toTarget(feature, { axis: entry.set.axis, set }, 0)], landmarks };
  }
  const targets = entry.lines
    ? entry.lines.map((line, index) => toTarget(feature, line.orientation === LINE_ORIENTATION.VERTICAL
      ? { orientation: line.orientation, x: Q.rat(line.x) }
      : { orientation: line.orientation, y: Q.rat(line.y) }, index))
    : entry.targets.map(([x, y], index) => ({ id: featureTargetId(feature, index), x, y, exactX: Q.rat(x), exactY: Q.rat(y) }));
  return {
    family: entry.family,
    graph: entry.graph,
    view: { xMin: -8, xMax: 8, yMin: -8, yMax: 8, xStep: 2, yStep: 2 },
    targets,
  };
};

const wordingFor = (rng, slot) => {
  const variant = familyVariants(slot.family, slot.feature, slot.tier).find((entry) => entry.id === slot.variant);
  // A polynomial's roots and zeros include its complex ones: a parabola that
  // never meets the axis still has two roots, so "Find all roots" answered
  // "Does Not Exist" would teach something false. A polynomial with non-real
  // roots is only ever asked for its x-intercepts.
  // A graph cut by a restricted domain: its zeros are the graph's, but "the
  // roots" of the polynomial ignore the cut, so it is never asked for roots.
  const options = featureWordings(slot.feature, { family: slot.family, tier: slot.tier })
    .filter((entry) => variant?.flags?.nonRealRoots !== true || entry.id === 'xIntercepts')
    .filter((entry) => variant?.flags?.restricted !== true || entry.id !== 'roots');
  return options.length ? rng.pick(options) : { id: slot.feature, prompt: getGraphFeature(slot.feature)?.label || slot.feature };
};

/**
 * Why candidates for a slot get rejected — a histogram of problems over
 * `attempts` draws. For tuning generators and for tests; never on a hot path.
 */
export const diagnoseSlot = ({ slot, seedText, attempts = 200 }) => {
  const rng = createRng(`${seedText}|diagnose`);
  const reasons = {};
  let accepted = 0;
  for (let index = 0; index < attempts; index += 1) {
    const outcome = attemptSlot({ slot, rng });
    if (outcome.question) accepted += 1;
    else (outcome.problems || ['unknown']).forEach((problem) => { reasons[problem] = (reasons[problem] || 0) + 1; });
  }
  return { accepted, attempts, reasons };
};

/**
 * Generate the question for a slot from a seed. Deterministic. A candidate
 * whose graph is one of `avoidGraphs` is passed over like any rejected one.
 */
export const generateQuestionForSlot = ({ slot, seedText, questionIndex = 0, avoidGraphs = [] }) => {
  const rng = createRng(`${seedText}|v${GRAPH_FEATURE_GENERATOR_VERSION}`);
  const wording = wordingFor(rng, slot);
  const avoid = new Set(avoidGraphs.map((graph) => JSON.stringify(graph)));
  let built = null;
  let attempts = 0;
  for (; attempts < MAX_GENERATION_ATTEMPTS && !built; attempts += 1) {
    const outcome = attemptSlot({ slot, rng });
    if (outcome.question && !avoid.has(JSON.stringify(outcome.question.graph))) built = outcome.question;
  }
  const fallback = !built;
  const question = built || fallbackQuestion(slot.feature);
  const offScreen = question.offScreen === true;
  // An off-screen question's targets are past the edge: nothing to tap. Its
  // one target is found by "Off screen", as "Does Not Exist" finds an absent
  // feature's; where they lie travels beside it, for the reveal.
  const targets = offScreen ? [] : question.targets.map(publicTarget);
  const weight = rushQuestionWeight({ targets });
  return Object.freeze({
    generatorVersion: GRAPH_FEATURE_GENERATOR_VERSION,
    questionIndex,
    feature: slot.feature,
    family: fallback ? question.family : slot.family,
    variant: fallback ? 'fallback' : slot.variant,
    tier: slot.tier,
    wording: wording.id,
    prompt: wording.prompt,
    graph: question.graph,
    view: question.view,
    targets: Object.freeze(targets),
    // "Does Not Exist" (or "Off screen") is one target, found by its button.
    targetCount: Math.max(1, targets.length),
    // What it is worth: the taps its answer takes (rushQuestionWeight).
    weight,
    doesNotExist: targets.length === 0 && !offScreen,
    offScreen,
    // A set question's tappable points (setLandmarksFor), and its axis — also
    // on one whose answer is "Does Not Exist", which has no target to say it.
    ...(question.landmarks ? { landmarks: Object.freeze(question.landmarks) } : {}),
    ...(isSetFeature(slot.feature) ? { setAxis: SET_FEATURE_AXIS[slot.feature] } : {}),
    ...(offScreen ? { offScreenTargets: Object.freeze(question.targets.map(({ x, y }) => Object.freeze({ x, y }))) } : {}),
    fallback,
    attempts,
  });
};

/* -------------------------------- schedule -------------------------------- */

// The share of questions whose honest answer is "Does Not Exist".
export const DOES_NOT_EXIST_SHARE = Object.freeze({ [EASY]: 0, [STANDARD]: 0.12, [CHALLENGE]: 0.22 });

/**
 * Every slot a config can produce at one tier, weighted so each selected
 * feature gets an equal share, each family an equal share of its feature,
 * and "Does Not Exist" answers are held at the tier's share.
 */
export const slotCatalog = ({ families = [], features = [], offScreen = false } = {}, tier = STANDARD) => {
  const perFeature = features.map((feature) => {
    const familyEntries = families
      // Off-screen variants play only in a game that turns them on.
      .map((family) => ({ family, variants: familyVariants(family, feature, tier).filter((entry) => offScreen === true || entry.flags?.offScreen !== true) }))
      .filter((entry) => entry.variants.length);
    return { feature, familyEntries };
  }).filter((entry) => entry.familyEntries.length);
  const slots = [];
  perFeature.forEach(({ feature, familyEntries }) => {
    familyEntries.forEach(({ family, variants }) => {
      const total = variants.reduce((sum, entry) => sum + entry.weight, 0);
      variants.forEach((entry) => {
        slots.push({
          family,
          feature,
          variant: entry.id,
          tier,
          exists: entry.exists,
          weight: (1 / perFeature.length) * (1 / familyEntries.length) * (entry.weight / total),
        });
      });
    });
  });
  const existing = slots.filter((slot) => slot.exists).reduce((sum, slot) => sum + slot.weight, 0);
  const absent = slots.filter((slot) => !slot.exists).reduce((sum, slot) => sum + slot.weight, 0);
  const share = DOES_NOT_EXIST_SHARE[tier] ?? 0;
  const scaled = slots
    .filter((slot) => slot.exists || share > 0)
    .map((slot) => {
      if (slot.exists || !absent) return slot;
      // Rescale the absent slots so they make up exactly `share` of the draw.
      return { ...slot, weight: slot.weight * ((share / (1 - share)) * existing / absent) };
    });
  return existing > 0 ? scaled.map((slot) => Object.freeze(slot)) : [];
};

/**
 * The catalog for a tier, or — when the config has nothing at that tier (a
 * mixed game of cubics has no Easy cubic questions) — the nearest tier that
 * has something, preferring harder. Never empty for a valid config.
 */
export const catalogForTier = (config, tier) => {
  const order = [tier, ...QUESTION_TIER_ORDER.filter((candidate) => tierRank(candidate) > tierRank(tier)),
    ...[...QUESTION_TIER_ORDER].reverse().filter((candidate) => tierRank(candidate) < tierRank(tier))];
  for (const candidate of order) {
    const catalog = slotCatalog(config, candidate);
    if (catalog.length) return catalog;
  }
  return [];
};

/** Which tier each position of a block draws from. */
export const blockTiers = (difficulty, blockIndex) => {
  if (difficulty !== 'mixed') return Array(SCHEDULE_BLOCK_SIZE).fill(difficulty);
  // Mixed ramps: a gentle first block, then standard and challenge interleaved.
  if (blockIndex === 0) return [EASY, EASY, STANDARD, EASY, STANDARD, STANDARD];
  if (blockIndex === 1) return [STANDARD, STANDARD, CHALLENGE, STANDARD, STANDARD, CHALLENGE];
  return [STANDARD, CHALLENGE, STANDARD, CHALLENGE, CHALLENGE, STANDARD];
};

/**
 * The block every student in a round shares: SCHEDULE_BLOCK_SIZE slots drawn
 * from the catalog with the room's secret, avoiding a repeated
 * (family, feature) inside one block where the catalog allows it.
 *
 * Each slot first settles whether its answer exists — "Does Not Exist" at
 * exactly the catalog's share — and only then picks a fresh (family,
 * feature) on that side. Avoiding repeats across the whole catalog would
 * drift that share: once the families that HAVE a maximum are used up, only
 * the ones that do not are fresh, and a maximum-only block could ask for
 * four answers that do not exist.
 */
export const roundBlockTemplate = ({ seed, roundIndex, blockIndex, config }) => {
  const rng = createRng(`${seed}|template|r${roundIndex}|b${blockIndex}|v${GRAPH_FEATURE_GENERATOR_VERSION}`);
  const tiers = blockTiers(config.difficulty, blockIndex);
  const used = new Set();
  const weightOf = (slots) => slots.reduce((sum, slot) => sum + slot.weight, 0);
  return tiers.map((tier) => {
    const catalog = catalogForTier(config, tier);
    const present = catalog.filter((slot) => slot.exists);
    const absent = catalog.filter((slot) => !slot.exists);
    const absentShare = catalog.length ? weightOf(absent) / weightOf(catalog) : 0;
    const side = absent.length && (!present.length || rng.chance(absentShare)) ? absent : present;
    const fresh = side.filter((slot) => !used.has(`${slot.family}|${slot.feature}`));
    const chosen = rng.weighted(fresh.length ? fresh : side);
    if (!chosen) return null;
    used.add(`${chosen.family}|${chosen.feature}`);
    return Object.freeze({ family: chosen.family, feature: chosen.feature, variant: chosen.variant, tier: chosen.tier });
  });
};

/** The slot of a student's question k: their own order within the shared block. */
export const scheduledSlot = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const blockIndex = Math.floor(questionIndex / SCHEDULE_BLOCK_SIZE);
  const template = roundBlockTemplate({ seed, roundIndex, blockIndex, config });
  const order = createRng(`${seed}|order|${studentKey}|r${roundIndex}|b${blockIndex}`)
    .shuffle(template.map((_, index) => index));
  return template[order[questionIndex % SCHEDULE_BLOCK_SIZE]] || null;
};

/**
 * A student's question k in a round.
 *
 * Two questions in a row are never the same graph asked the same way — on a
 * small Easy catalog that happened often enough to look like a tap that did
 * nothing. Even-numbered questions are drawn freely; an odd-numbered one
 * passes over the graph of either neighbour that shares its family and
 * feature. Every adjacent pair has exactly one odd member, so no pair can
 * repeat, and no question depends on more than its two neighbours' first
 * draws (grading regenerates one question, never a chain of them).
 */
export const generateRushQuestion = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const slotAt = (index) => (index >= 0 ? scheduledSlot({ seed, studentKey, roundIndex, questionIndex: index, config }) : null);
  const seedTextAt = (index) => `${seed}|q|${studentKey}|r${roundIndex}|q${index}`;
  const slot = slotAt(questionIndex);
  if (!slot) return null;
  const avoidGraphs = questionIndex % 2 === 1
    ? [questionIndex - 1, questionIndex + 1]
      .map((index) => ({ index, neighbour: slotAt(index) }))
      .filter(({ neighbour }) => neighbour && neighbour.family === slot.family && neighbour.feature === slot.feature)
      .map(({ index, neighbour }) => generateQuestionForSlot({ slot: neighbour, seedText: seedTextAt(index), questionIndex: index }).graph)
    : [];
  return generateQuestionForSlot({ slot, seedText: seedTextAt(questionIndex), questionIndex, avoidGraphs });
};

/**
 * What a student's device receives. The targets travel with the graph: the
 * device marks a found target the instant it is tapped, and the graph shows
 * where the features are by design, so withholding them would cost the game
 * its speed and protect nothing. Every tap is still re-graded by the server
 * against its own regenerated copy — the copy here grades nothing.
 */
export const publicRushQuestion = (question) => (question ? Object.freeze({
  questionIndex: question.questionIndex,
  feature: question.feature,
  family: question.family,
  prompt: question.prompt,
  graph: question.graph,
  view: question.view,
  targets: question.targets,
  targetCount: question.targetCount,
  weight: question.weight,
  ...(question.landmarks ? { landmarks: question.landmarks } : {}),
  ...(question.setAxis ? { setAxis: question.setAxis } : {}),
  // Like the targets: the device answers "Off screen" instantly with it.
  ...(question.offScreen ? { offScreen: true, offScreenTargets: question.offScreenTargets } : {}),
}) : null);

export { DOES_NOT_EXIST_TARGET_ID, OFF_SCREEN_TARGET_ID };
