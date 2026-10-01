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
 *   - open endpoints are clearly separated from closed ones and from targets.
 *
 * If a slot ever exhausted its attempts, a known-good question for the same
 * feature is issued instead and marked `fallback`; tests hold every slot to
 * never needing it.
 *
 * Pure: Cloud Functions and tests.
 */

import * as Q from './graphFeatureRational.mjs';
import {
  curveSegments,
  evaluateGraph,
  graphAsymptotes,
  graphMarkers,
  visibleCurveFraction,
} from './graphFeatureCurves.mjs';
import {
  DOES_NOT_EXIST_TARGET_ID,
  GRAPH_FEATURE,
  QUESTION_TIER,
  QUESTION_TIER_ORDER,
  featureTargetId,
  featureWordings,
  getGraphFeature,
  tierRank,
} from './graphFeatureRegistry.mjs';
import {
  FEATURE_STATUS,
  familyVariants,
  getGraphFamily,
  tierGridDenominator,
} from './graphFeatureFamilies.mjs';

export const GRAPH_FEATURE_GENERATOR_VERSION = 1;

export const SCHEDULE_BLOCK_SIZE = 6;
export const MAX_GENERATION_ATTEMPTS = 80;

const { EASY, STANDARD, CHALLENGE } = QUESTION_TIER;

/* --------------------------------- PRNG ---------------------------------- */

// cyrb128 → sfc32: small, fast, integer-only (so identical on every engine).
const cyrb128 = (text) => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
};

export const createRng = (seedText) => {
  let [a, b, c, d] = cyrb128(seedText);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
  // Warm up so similar seeds diverge immediately.
  for (let index = 0; index < 12; index += 1) next();
  const int = (low, high) => {
    const lo = Math.ceil(Math.min(low, high));
    const hi = Math.floor(Math.max(low, high));
    return lo + Math.floor(next() * (hi - lo + 1));
  };
  const pick = (values) => values[Math.floor(next() * values.length)];
  const chance = (probability) => next() < probability;
  const shuffle = (values) => {
    const out = [...values];
    for (let index = out.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1));
      [out[index], out[swap]] = [out[swap], out[index]];
    }
    return out;
  };
  const weighted = (entries, weightOf = (entry) => entry.weight) => {
    const total = entries.reduce((sum, entry) => sum + Math.max(0, weightOf(entry)), 0);
    if (!(total > 0)) return entries[0] ?? null;
    let roll = next() * total;
    for (const entry of entries) {
      roll -= Math.max(0, weightOf(entry));
      if (roll < 0) return entry;
    }
    return entries[entries.length - 1];
  };
  return Object.freeze({ next, int, pick, chance, shuffle, weighted });
};

/* --------------------------------- views --------------------------------- */

const NICE_HALF_SPANS = Object.freeze([5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 40]);
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
  openMarkerClearance: 0.06,
  jumpClearance: 0.08,
  asymptoteClearance: 0.08,
});

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
    const xStep = tickStep(xHigh - xLow + 2 * xPad);
    const yStep = tickStep(yHigh - yLow + 2 * yPad);
    const [x0, x1] = snapOut(xLow - xPad, xHigh + xPad, xStep);
    const [y0, y1] = snapOut(yLow - yPad, yHigh + yPad, yStep);
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
 * A shallow crossing is fine: its closest approach IS the zero.
 */
const ghostZeroFree = (graph, view, zeros) => {
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  const band = VIEW_RULES.ghostBand * ySpan;
  const reach = VIEW_RULES.ghostReach * xSpan;
  const nearZero = (x) => zeros.some((zero) => Math.abs(zero.x - x) <= reach);
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

/** Every reason a candidate in a view is not fit to issue (empty = issue it). */
export const viewProblems = ({ family, feature, variant, graph, view, targets, tier }) => {
  const problems = [];
  if (!view) return ['no readable view'];
  const grid = tierGridDenominator(tier);
  targets.forEach((target) => {
    if (!Q.onGrid(target.exactX, grid) || !Q.onGrid(target.exactY, grid)) problems.push('target off the grid');
    if (!insetOk(target, view, VIEW_RULES.targetInset)) problems.push('target too close to the edge');
    if (tier === EASY && target.x === 0 && target.y === 0) problems.push('target at the origin on Easy');
  });
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      if (normalizedDistance(targets[i], targets[j], view) < VIEW_RULES.targetSeparation) problems.push('targets too close together');
    }
  }
  if (!insetOk({ x: 0, y: 0 }, view, VIEW_RULES.originInset)) problems.push('axes not clearly visible');
  const asymptotes = graphAsymptotes(graph);
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  asymptotes.vertical.forEach((x) => {
    if (x - view.xMin < VIEW_RULES.asymptoteInset * xSpan || view.xMax - x < VIEW_RULES.asymptoteInset * xSpan) problems.push('asymptote at the edge');
    targets.forEach((target) => { if (Math.abs(target.x - x) < VIEW_RULES.asymptoteClearance * xSpan) problems.push('target hugs an asymptote'); });
  });
  asymptotes.horizontal.forEach((y) => {
    if (y - view.yMin < VIEW_RULES.asymptoteInset * ySpan || view.yMax - y < VIEW_RULES.asymptoteInset * ySpan) problems.push('asymptote at the edge');
    targets.forEach((target) => { if (Math.abs(target.y - y) < VIEW_RULES.asymptoteClearance * ySpan) problems.push('target hugs an asymptote'); });
  });
  if (visibleCurveFraction(graph, view) < (family.minVisibleFraction ?? 0.2)) problems.push('too little of the curve is visible');
  if (feature === GRAPH_FEATURE.X_INTERCEPT && variant.flags?.asymptoteOnAxis !== true && !ghostZeroFree(graph, view, targets)) {
    problems.push('the curve skims the x-axis without crossing it');
  }
  if (feature === GRAPH_FEATURE.X_INTERCEPT && !separatedCrossings(graph, view, targets)) {
    problems.push('neighbouring zeros are not visibly separate');
  }
  // A domain that excludes x = 0 must visibly do so.
  if (feature === GRAPH_FEATURE.Y_INTERCEPT && !variant.exists && variant.flags?.domainExcludesZero) {
    const nearest = Math.min(...curveSegments(graph, view).map((segment) => Math.min(Math.abs(segment.from), Math.abs(segment.to))));
    if (nearest < 0.1 * xSpan) problems.push('the domain gap at the y-axis is too narrow to see');
  }
  const markers = graphMarkers(graph, view);
  markers.filter((marker) => !marker.closed).forEach((open) => {
    targets.forEach((target) => {
      if (normalizedDistance(open, target, view) < VIEW_RULES.openMarkerClearance) problems.push('target beside an open endpoint');
    });
    markers.filter((marker) => marker.closed && marker.x === open.x).forEach((closed) => {
      if (Math.abs(closed.y - open.y) < VIEW_RULES.jumpClearance * ySpan) problems.push('open and closed endpoints overlap');
    });
  });
  return [...new Set(problems)];
};

/* ------------------------------- generation ------------------------------ */

const EXPECTED_TARGETS = Object.freeze({
  two: 2,
  three: 3,
  one: 1,
  triple: 1,
  single: 1,
});

const expectedTargetCount = (familyId, variantId) => {
  if (variantId === 'tangent') return familyId === 'cubic' ? 2 : 1;
  return EXPECTED_TARGETS[variantId] ?? null;
};

const toTarget = (featureId, exactPoint, index) => Object.freeze({
  id: featureTargetId(featureId, index),
  x: Q.toNumber(exactPoint.x),
  y: Q.toNumber(exactPoint.y),
  exactX: exactPoint.x,
  exactY: exactPoint.y,
});

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
  const expected = variant.exists ? expectedTargetCount(slot.family, slot.variant) : 0;
  if (expected !== null && analysis.points.length !== expected) return { problems: ['wrong number of targets'] };

  const graph = family.toGraph(params);
  const targets = [...analysis.points].sort((left, right) => Q.cmp(left.x, right.x)).map((p, index) => toTarget(slot.feature, p, index));
  const keyPoints = asPlain(family.keyPoints(params));
  const limit = VALUE_LIMIT[slot.tier];
  if ([...keyPoints, ...targets].some((p) => Math.abs(p.x) > limit + 3 || Math.abs(p.y) > (family.valueLimit?.(slot.tier) ?? limit))) {
    return { problems: ['values too large'] };
  }
  const optional = asPlain(family.optionalKeyPoints?.(params) || [])
    .filter((p) => Math.abs(p.y) <= limit && Math.abs(p.x) <= limit);
  const framing = [...optional, ...(family.framingPoints?.(params) || [])];
  const symmetric = slot.tier !== CHALLENGE || rng.chance(0.5);
  const view = chooseView({
    required: [...keyPoints, ...targets],
    framing,
    asymptotes: family.asymptotes(params),
    tier: slot.tier,
    symmetric,
  });
  const problems = viewProblems({ family, feature: slot.feature, variant, graph, view, targets, tier: slot.tier });
  if (problems.length) return { problems };
  return { question: { graph, view, targets } };
};

const FALLBACKS = Object.freeze({
  [GRAPH_FEATURE.X_INTERCEPT]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: 1, k: -4 }, targets: [[-1, 0], [3, 0]] },
  [GRAPH_FEATURE.Y_INTERCEPT]: { family: 'linear', graph: { kind: 'linear', m: 1, b: 2 }, targets: [[0, 2]] },
  [GRAPH_FEATURE.VERTEX]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: 1, k: -2 }, targets: [[1, -2]] },
  [GRAPH_FEATURE.MAXIMUM]: { family: 'quadratic', graph: { kind: 'quadratic', a: -1, h: 1, k: 3 }, targets: [[1, 3]] },
  [GRAPH_FEATURE.MINIMUM]: { family: 'quadratic', graph: { kind: 'quadratic', a: 1, h: -1, k: -3 }, targets: [[-1, -3]] },
});

const fallbackQuestion = (feature) => {
  const entry = FALLBACKS[feature] || FALLBACKS[GRAPH_FEATURE.X_INTERCEPT];
  return {
    family: entry.family,
    graph: entry.graph,
    view: { xMin: -8, xMax: 8, yMin: -8, yMax: 8, xStep: 2, yStep: 2 },
    targets: entry.targets.map(([x, y], index) => ({ id: featureTargetId(feature, index), x, y, exactX: Q.rat(x), exactY: Q.rat(y) })),
  };
};

const wordingFor = (rng, slot) => {
  const options = featureWordings(slot.feature, { family: slot.family, tier: slot.tier });
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
 * Generate the question for a slot from a seed. Deterministic.
 */
export const generateQuestionForSlot = ({ slot, seedText, questionIndex = 0 }) => {
  const rng = createRng(`${seedText}|v${GRAPH_FEATURE_GENERATOR_VERSION}`);
  const wording = wordingFor(rng, slot);
  let built = null;
  let attempts = 0;
  for (; attempts < MAX_GENERATION_ATTEMPTS && !built; attempts += 1) {
    const outcome = attemptSlot({ slot, rng });
    if (outcome.question) built = outcome.question;
  }
  const fallback = !built;
  const question = built || fallbackQuestion(slot.feature);
  const targets = question.targets.map(({ id, x, y }) => Object.freeze({ id, x, y }));
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
    // "Does Not Exist" is one target, found by its button.
    targetCount: Math.max(1, targets.length),
    doesNotExist: targets.length === 0,
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
export const slotCatalog = ({ families = [], features = [] } = {}, tier = STANDARD) => {
  const perFeature = features.map((feature) => {
    const familyEntries = families
      .map((family) => ({ family, variants: familyVariants(family, feature, tier) }))
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
 */
export const roundBlockTemplate = ({ seed, roundIndex, blockIndex, config }) => {
  const rng = createRng(`${seed}|template|r${roundIndex}|b${blockIndex}|v${GRAPH_FEATURE_GENERATOR_VERSION}`);
  const tiers = blockTiers(config.difficulty, blockIndex);
  const used = new Set();
  return tiers.map((tier) => {
    const catalog = catalogForTier(config, tier);
    const fresh = catalog.filter((slot) => !used.has(`${slot.family}|${slot.feature}`));
    const chosen = rng.weighted(fresh.length ? fresh : catalog);
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

/** A student's question k in a round. */
export const generateRushQuestion = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const slot = scheduledSlot({ seed, studentKey, roundIndex, questionIndex, config });
  if (!slot) return null;
  return generateQuestionForSlot({
    slot,
    seedText: `${seed}|q|${studentKey}|r${roundIndex}|q${questionIndex}`,
    questionIndex,
  });
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
}) : null);

export { DOES_NOT_EXIST_TARGET_ID };
