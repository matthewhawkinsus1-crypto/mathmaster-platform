/*
 * GRAPH RENDER SPECS: WHAT A GENERATED GRAPH IS, AND HOW TO DRAW IT.
 *
 * A Graph Feature Rush question ships its graph as a small, explicit spec —
 * a family kind and its parameters — never as a formula string to parse. The
 * same spec is evaluated by the server when it validates a generated question
 * and by the student's device when it draws it, so the curve a student sees
 * is the curve the answer key was checked against.
 *
 *   linear       m·x + b
 *   quadratic    a(x − h)² + k
 *   absolute     a|x − h| + k
 *   cubic        a · Π(x − rᵢ) · ((x − p)² + q)?     (roots, optional irreducible factor)
 *   exponential  a · base^(x − h) + k                  (base given exactly as [n, d])
 *   squareRoot   a√(s(x − h)) + k, s = ±1               (closed endpoint at (h, k))
 *   cubeRoot     a∛(x − h) + k
 *   rational     a / (x − h) + k                        (asymptotes x = h, y = k)
 *   piecewise    linear pieces m·x + b on intervals with open/closed ends
 *
 * DISCONTINUITIES ARE STRUCTURE, NOT A SAMPLING ACCIDENT. Each kind says where
 * its graph is continuous (`curveSegments`); the sampler draws each segment on
 * its own, so a rational graph is never joined across its asymptote and a
 * piecewise jump is never bridged by a stray vertical line.
 *
 * Pure: shared by Cloud Functions, the student device and tests.
 */

export const GRAPH_KIND = Object.freeze({
  LINEAR: 'linear',
  QUADRATIC: 'quadratic',
  ABSOLUTE: 'absolute',
  CUBIC: 'cubic',
  EXPONENTIAL: 'exponential',
  SQUARE_ROOT: 'squareRoot',
  CUBE_ROOT: 'cubeRoot',
  RATIONAL: 'rational',
  PIECEWISE: 'piecewise',
});

const finite = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const baseValue = (base) => {
  if (Array.isArray(base)) {
    const numerator = finite(base[0], 2);
    const denominator = finite(base[1], 1) || 1;
    return numerator / denominator;
  }
  return finite(base, 2);
};

// A closed interval end includes its x; an open one does not. Null is ±∞.
const insideInterval = (x, from, to) => {
  if (from && (x < from.x || (x === from.x && from.closed !== true))) return false;
  if (to && (x > to.x || (x === to.x && to.closed !== true))) return false;
  return true;
};

/**
 * f(x) for a spec, or NaN where the function is undefined. Exact at the
 * points the generators care about whenever the parameters are dyadic.
 */
export const evaluateGraph = (graph = {}, x) => {
  const value = Number(x);
  if (!Number.isFinite(value)) return Number.NaN;
  switch (graph.kind) {
    case GRAPH_KIND.LINEAR:
      return finite(graph.m) * value + finite(graph.b);
    case GRAPH_KIND.QUADRATIC: {
      const shifted = value - finite(graph.h);
      return finite(graph.a, 1) * shifted * shifted + finite(graph.k);
    }
    case GRAPH_KIND.ABSOLUTE:
      return finite(graph.a, 1) * Math.abs(value - finite(graph.h)) + finite(graph.k);
    case GRAPH_KIND.CUBIC: {
      let product = finite(graph.a, 1);
      (Array.isArray(graph.roots) ? graph.roots : []).forEach((root) => { product *= value - finite(root); });
      if (graph.quadratic) {
        const shifted = value - finite(graph.quadratic.p);
        product *= shifted * shifted + finite(graph.quadratic.q, 1);
      }
      return product;
    }
    case GRAPH_KIND.EXPONENTIAL:
      return finite(graph.a, 1) * (baseValue(graph.base) ** (value - finite(graph.h))) + finite(graph.k);
    case GRAPH_KIND.SQUARE_ROOT: {
      const inside = (graph.s === -1 ? -1 : 1) * (value - finite(graph.h));
      if (inside < 0) return Number.NaN;
      return finite(graph.a, 1) * Math.sqrt(inside) + finite(graph.k);
    }
    case GRAPH_KIND.CUBE_ROOT:
      return finite(graph.a, 1) * Math.cbrt(value - finite(graph.h)) + finite(graph.k);
    case GRAPH_KIND.RATIONAL: {
      const denominator = value - finite(graph.h);
      if (denominator === 0) return Number.NaN;
      return finite(graph.a, 1) / denominator + finite(graph.k);
    }
    case GRAPH_KIND.PIECEWISE: {
      const piece = (Array.isArray(graph.pieces) ? graph.pieces : [])
        .find((candidate) => insideInterval(value, candidate.from, candidate.to));
      return piece ? finite(piece.m) * value + finite(piece.b) : Number.NaN;
    }
    default:
      return Number.NaN;
  }
};

/**
 * Where the graph is continuous, as x-intervals clipped to [xMin, xMax].
 * Each interval: { from, to, fromClosed, toClosed, piece? }.
 */
export const curveSegments = (graph = {}, { xMin, xMax } = {}) => {
  const left = finite(xMin, -10);
  const right = finite(xMax, 10);
  const clip = (from, to, fromClosed = true, toClosed = true, extra = {}) => {
    const start = Math.max(left, from);
    const end = Math.min(right, to);
    if (!(end > start)) return [];
    return [{
      from: start,
      to: end,
      fromClosed: start === from ? fromClosed : true,
      toClosed: end === to ? toClosed : true,
      ...extra,
    }];
  };
  switch (graph.kind) {
    case GRAPH_KIND.SQUARE_ROOT: {
      const h = finite(graph.h);
      return graph.s === -1 ? clip(-Infinity, h, true, true) : clip(h, Infinity, true, true);
    }
    case GRAPH_KIND.RATIONAL: {
      const h = finite(graph.h);
      return [...clip(-Infinity, h, true, false), ...clip(h, Infinity, false, true)];
    }
    case GRAPH_KIND.PIECEWISE:
      return (Array.isArray(graph.pieces) ? graph.pieces : []).flatMap((piece, index) => clip(
        piece.from ? finite(piece.from.x) : -Infinity,
        piece.to ? finite(piece.to.x) : Infinity,
        piece.from ? piece.from.closed === true : true,
        piece.to ? piece.to.closed === true : true,
        { piece: index },
      ));
    default:
      return clip(-Infinity, Infinity);
  }
};

/** Dashed guide lines a reader of the graph should see. */
export const graphAsymptotes = (graph = {}) => {
  if (graph.kind === GRAPH_KIND.RATIONAL) {
    return { vertical: [finite(graph.h)], horizontal: [finite(graph.k)] };
  }
  if (graph.kind === GRAPH_KIND.EXPONENTIAL) return { vertical: [], horizontal: [finite(graph.k)] };
  return { vertical: [], horizontal: [] };
};

/**
 * Endpoint dots: closed where the point belongs to the graph, open where it
 * does not. A piecewise junction that is continuous draws nothing — there is
 * no hole to show. Only dots inside the view are returned.
 */
export const graphMarkers = (graph = {}, view = {}) => {
  const inView = (point) => point.x >= view.xMin && point.x <= view.xMax && point.y >= view.yMin && point.y <= view.yMax;
  if (graph.kind === GRAPH_KIND.SQUARE_ROOT) {
    const point = { x: finite(graph.h), y: finite(graph.k), closed: true };
    return inView(point) ? [point] : [];
  }
  if (graph.kind !== GRAPH_KIND.PIECEWISE) return [];
  const markers = [];
  const pieces = Array.isArray(graph.pieces) ? graph.pieces : [];
  pieces.forEach((piece) => {
    [piece.from, piece.to].forEach((end) => {
      if (!end) return;
      const x = finite(end.x);
      const y = finite(piece.m) * x + finite(piece.b);
      // Continuous at this x when another piece owns x and reaches the same y.
      const owner = pieces.find((candidate) => candidate !== piece && insideInterval(x, candidate.from, candidate.to));
      const continuous = owner && Math.abs((finite(owner.m) * x + finite(owner.b)) - y) < 1e-9;
      if (continuous) return;
      markers.push({ x, y, closed: end.closed === true });
    });
  });
  return markers.filter(inView);
};

/*
 * SAMPLING FOR DRAWING.
 *
 * Each continuous segment is sampled on its own. Samples are kept while the
 * curve is within an extended band around the view (one view height above and
 * below); where the curve leaves the band the polyline ends at the exact
 * crossing, found by bisection, so a branch heading to an asymptote reaches the
 * edge of the plot cleanly instead of stopping short or spiking. The renderer
 * clips everything to the plot rectangle.
 */
const BAND_FRACTION = 1;
const MAX_SAMPLES_PER_SEGMENT = 480;

const refineCrossing = (graph, insideX, outsideX, low, high) => {
  let inX = insideX;
  let outX = outsideX;
  for (let step = 0; step < 32; step += 1) {
    const mid = (inX + outX) / 2;
    const y = evaluateGraph(graph, mid);
    if (Number.isFinite(y) && y >= low && y <= high) inX = mid;
    else outX = mid;
  }
  const y = evaluateGraph(graph, inX);
  return [inX, Math.max(low, Math.min(high, y))];
};

export const sampleGraph = (graph = {}, view = {}, { samples = 240 } = {}) => {
  const xMin = finite(view.xMin, -10);
  const xMax = finite(view.xMax, 10);
  const yMin = finite(view.yMin, -10);
  const yMax = finite(view.yMax, 10);
  const band = (yMax - yMin) * BAND_FRACTION;
  const low = yMin - band;
  const high = yMax + band;
  const polylines = [];
  const xSpan = xMax - xMin;

  curveSegments(graph, view).forEach((segment) => {
    const count = Math.max(8, Math.min(MAX_SAMPLES_PER_SEGMENT, Math.ceil((segment.to - segment.from) / xSpan * samples)));
    // An open end is approached, never evaluated: nudge in by a hair.
    const nudge = Math.min(1e-6 * xSpan, (segment.to - segment.from) / 1000);
    const start = segment.fromClosed ? segment.from : segment.from + nudge;
    const end = segment.toClosed ? segment.to : segment.to - nudge;
    let current = [];
    let previous = null;
    for (let index = 0; index <= count; index += 1) {
      const x = index === count ? end : start + ((end - start) * index) / count;
      const y = evaluateGraph(graph, x);
      const inside = Number.isFinite(y) && y >= low && y <= high;
      if (inside) {
        if (previous && !previous.inside) current.push(refineCrossing(graph, x, previous.x, low, high));
        current.push([x, y]);
      } else if (previous?.inside) {
        current.push(refineCrossing(graph, previous.x, x, low, high));
        if (current.length > 1) polylines.push(current);
        current = [];
      }
      previous = { x, inside };
    }
    if (current.length > 1) polylines.push(current);
  });
  return polylines;
};

/** The y-values a segment reaches inside the view, for visibility checks. */
export const visibleCurveFraction = (graph = {}, view = {}, samples = 200) => {
  const xMin = finite(view.xMin, -10);
  const xMax = finite(view.xMax, 10);
  let defined = 0;
  let visible = 0;
  for (let index = 0; index <= samples; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / samples;
    const y = evaluateGraph(graph, x);
    if (!Number.isFinite(y)) continue;
    defined += 1;
    if (y >= view.yMin && y <= view.yMax) visible += 1;
  }
  return defined ? visible / defined : 0;
};
