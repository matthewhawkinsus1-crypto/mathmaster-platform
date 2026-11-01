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
 * A RESTRICTED DOMAIN. A line, parabola, absolute value or exponential graph
 * may carry `domain: { from, to }`, each end `{ x, closed }` or null (no end
 * that way): a ray, or a segment. Off the domain the graph is undefined, so
 * every reader below (evaluation, continuous pieces, endpoint dots,
 * asymptotes) sees exactly the curve that is drawn. An end that is drawn is a
 * dot, filled when the point belongs to the graph and open when it does not.
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

// The kinds that may carry a restricted domain (rays and segments).
export const RESTRICTABLE_KINDS = Object.freeze([GRAPH_KIND.LINEAR, GRAPH_KIND.QUADRATIC, GRAPH_KIND.ABSOLUTE, GRAPH_KIND.EXPONENTIAL]);

const domainEnd = (end) => (end && Number.isFinite(Number(end.x)) ? { x: Number(end.x), closed: end.closed === true } : null);

/**
 * A graph's restricted domain, `{ from, to }` (each `{ x, closed }` or null),
 * or null when the graph is defined wherever its formula is.
 */
export const graphDomain = (graph = {}) => {
  if (!RESTRICTABLE_KINDS.includes(graph?.kind) || !graph.domain) return null;
  const from = domainEnd(graph.domain.from);
  const to = domainEnd(graph.domain.to);
  return from || to ? { from, to } : null;
};

/** The formula alone, ignoring any restricted domain: where an open dot is drawn. */
export const unrestrictedGraph = (graph = {}) => {
  if (!graph?.domain) return graph;
  const formula = { ...graph };
  delete formula.domain;
  return formula;
};

/**
 * f(x) for a spec, or NaN where the function is undefined. Exact at the
 * points the generators care about whenever the parameters are dyadic.
 */
export const evaluateGraph = (graph = {}, x) => {
  const value = Number(x);
  if (!Number.isFinite(value)) return Number.NaN;
  const domain = graphDomain(graph);
  if (domain && !insideInterval(value, domain.from, domain.to)) return Number.NaN;
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
    default: {
      const domain = graphDomain(graph);
      if (!domain) return clip(-Infinity, Infinity);
      return clip(
        domain.from ? domain.from.x : -Infinity,
        domain.to ? domain.to.x : Infinity,
        domain.from ? domain.from.closed : true,
        domain.to ? domain.to.closed : true,
      );
    }
  }
};

/**
 * The graph's asymptotes, as dashed guide lines a reader should see. An
 * exponential approaches y = k on one side only (the left for a base above 1,
 * the right below 1); a restricted domain that cuts that side off leaves it
 * no asymptote.
 */
export const graphAsymptotes = (graph = {}) => {
  if (graph.kind === GRAPH_KIND.RATIONAL) {
    return { vertical: [finite(graph.h)], horizontal: [finite(graph.k)] };
  }
  if (graph.kind === GRAPH_KIND.EXPONENTIAL) {
    const domain = graphDomain(graph);
    const approachesOnLeft = baseValue(graph.base) > 1;
    const tailKept = !domain || (approachesOnLeft ? !domain.from : !domain.to);
    return { vertical: [], horizontal: tailKept ? [finite(graph.k)] : [] };
  }
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
  const domain = graphDomain(graph);
  if (domain) {
    // A restricted domain's ends, at the formula's value there: an open end
    // is not on the graph, but its dot is drawn where the curve would reach.
    const formula = unrestrictedGraph(graph);
    return [domain.from, domain.to]
      .filter(Boolean)
      .map((end) => ({ x: end.x, y: evaluateGraph(formula, end.x), closed: end.closed }))
      .filter((point) => Number.isFinite(point.y) && inView(point));
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

/*
 * WHERE THE CURVE IS ON SCREEN, AND HOW EACH STRETCH ENDS.
 *
 * For each continuous piece of the graph (curveSegments), the stretches of x
 * where the curve is inside the view, and what happens at each end of a
 * stretch:
 *
 *   'end'    the piece itself ends there, inside the view: a domain end, a
 *            piecewise split or an endpoint (`closed` says which dot)
 *   'exit'   the curve leaves the screen through an edge ('left', 'right',
 *            'top' or 'bottom') and goes on beyond it
 *
 * An exit is where the screen draws an arrow, and the generator issues a graph
 * only when each piece is ONE stretch: the curve leaves the screen only at its
 * ends, so an arrow always means "keeps going" — it never comes back into view
 * (graphFeatureGenerator.mjs). `grazes` marks a stretch that runs within
 * GRAZE_FRACTION of the top or bottom edge without leaving, which reads like an
 * exit that is not one. The device draws its arrows from this same analysis
 * (rushGraphModel.js), so every arrow on a screen is an exit the generator
 * checked.
 */
export const GRAZE_FRACTION = 0.012;
const RUN_SAMPLES = 600;

const insideView = (y, view) => Number.isFinite(y) && y >= view.yMin && y <= view.yMax;

// The x where the curve crosses out of [yMin, yMax] between an inside and an
// outside sample, and which edge it crosses.
const viewCrossing = (graph, view, insideX, outsideX) => {
  let inX = insideX;
  let outX = outsideX;
  for (let step = 0; step < 40; step += 1) {
    const mid = (inX + outX) / 2;
    if (insideView(evaluateGraph(graph, mid), view)) inX = mid;
    else outX = mid;
  }
  const beyond = evaluateGraph(graph, outX);
  const edge = Number.isFinite(beyond) && beyond < view.yMin ? 'bottom' : 'top';
  return { x: inX, y: edge === 'top' ? view.yMax : view.yMin, edge };
};

export const curveRuns = (graph = {}, view = {}) => {
  const box = {
    xMin: finite(view.xMin, -10), xMax: finite(view.xMax, 10), yMin: finite(view.yMin, -10), yMax: finite(view.yMax, 10),
  };
  const xSpan = box.xMax - box.xMin;
  const graze = GRAZE_FRACTION * (box.yMax - box.yMin);
  // Whether the graph goes on past a vertical edge (defined just beyond it).
  const continuesPast = (x, direction) => Number.isFinite(evaluateGraph(graph, x + direction * 1e-6 * xSpan));
  return curveSegments(graph, box).map((segment, index) => {
    const nudge = Math.min(1e-7 * xSpan, (segment.to - segment.from) / 1e6);
    const start = segment.fromClosed ? segment.from : segment.from + nudge;
    const end = segment.toClosed ? segment.to : segment.to - nudge;
    const runs = [];
    let current = null;
    let previous = null;
    for (let step = 0; step <= RUN_SAMPLES; step += 1) {
      const x = step === RUN_SAMPLES ? end : start + ((end - start) * step) / RUN_SAMPLES;
      const y = evaluateGraph(graph, x);
      const inside = insideView(y, box);
      if (inside && !current) {
        let from;
        if (previous) from = { kind: 'exit', ...viewCrossing(graph, box, x, previous.x) };
        else if (segment.from <= box.xMin && continuesPast(box.xMin, -1)) from = { kind: 'exit', edge: 'left', x: box.xMin, y };
        else from = { kind: 'end', x: segment.from, y: evaluateGraph(unrestrictedGraph(graph), segment.from), closed: segment.fromClosed };
        current = { segment: index, from, grazes: false, ys: [] };
      }
      if (inside && current) current.ys.push(y);
      if (!inside && current) {
        current.to = { kind: 'exit', ...viewCrossing(graph, box, previous.x, x) };
        runs.push(current);
        current = null;
      }
      previous = { x, y, inside };
    }
    if (current) {
      current.to = segment.to >= box.xMax && continuesPast(box.xMax, 1)
        ? { kind: 'exit', edge: 'right', x: box.xMax, y: evaluateGraph(graph, end) }
        : { kind: 'end', x: segment.to, y: evaluateGraph(unrestrictedGraph(graph), segment.to), closed: segment.toClosed };
      runs.push(current);
    }
    // Grazing: the curve turns back within the band of an edge. Heading out
    // through the edge is an exit, not a graze, so only a turn counts.
    const grazes = (ys) => ys.some((y, at) => at > 0 && at < ys.length - 1 && (
      (box.yMax - y < graze && y >= ys[at - 1] && y >= ys[at + 1])
      || (y - box.yMin < graze && y <= ys[at - 1] && y <= ys[at + 1])));
    return Object.freeze({
      segment: index,
      runs: Object.freeze(runs.map(({ ys, ...run }) => Object.freeze({ ...run, grazes: grazes(ys) }))),
    });
  });
};

/*
 * WHERE EACH ARROW GOES. For every exit of curveRuns — where the screen draws
 * an arrow — which way x and y head as the curve goes on past the edge:
 *
 *   heads.x   −1 / +1 when x runs off to −∞ / +∞ (the piece is unbounded
 *             that way); 0 when x stays bounded (the curve runs up or down
 *             beside a vertical asymptote)
 *   heads.y   −1 / +1 when y runs off to −∞ / +∞; 0 when it levels off
 *             (toward a horizontal asymptote) or stays put (a level line)
 *
 * Tapping an arrow is how a student says "keeps going" in a domain, a range
 * or an interval: along x on the x-axis, along y on the y-axis. An arrow that
 * heads nowhere along the axis asked about (the flat end of an exponential,
 * in a range) says nothing there. `id` names the end: `${segment}:${side}`,
 * side 'from' (the left end of the stretch) or 'to'.
 *
 * Far along an unbounded piece the curve is sampled at |x| = 10⁸ and 10⁹:
 * every family here either grows past any bound by then (even ∛x reaches
 * 1000) or has settled to its asymptote to the last digit.
 */
const FAR_X = Object.freeze([1e8, 1e9]);
// The piece itself, unclipped: whether it goes on forever each way.
const UNBOUNDED_REACH = 1e12;

const farHeading = (graph, sign) => {
  const [near, far] = FAR_X.map((x) => evaluateGraph(graph, sign * x));
  if (!Number.isFinite(far) || !Number.isFinite(near)) {
    // Past every float (an exponential's growth): heading that way.
    const value = Number.isFinite(far) ? near : far;
    return Number.isNaN(value) ? 0 : Math.sign(value);
  }
  const change = far - near;
  return Math.abs(change) <= 1e-6 * Math.max(1, Math.abs(near)) ? 0 : Math.sign(change);
};

export const curveEnds = (graph = {}, view = {}) => {
  const box = {
    xMin: finite(view.xMin, -10), xMax: finite(view.xMax, 10), yMin: finite(view.yMin, -10), yMax: finite(view.yMax, 10),
  };
  const shown = curveSegments(graph, box);
  const whole = curveSegments(graph, { xMin: -UNBOUNDED_REACH, xMax: UNBOUNDED_REACH });
  // The whole piece a shown segment belongs to: the one holding its middle.
  const pieceOf = (segment) => {
    const middle = (segment.from + segment.to) / 2;
    return whole.find((piece) => piece.from <= middle && middle <= piece.to) || segment;
  };
  return curveRuns(graph, box).flatMap((entry) => {
    const piece = pieceOf(shown[entry.segment]);
    return entry.runs.flatMap((run) => ['from', 'to'].map((side) => {
      const end = run[side];
      if (end.kind !== 'exit') return null;
      const direction = side === 'from' ? -1 : 1;
      const unbounded = direction < 0 ? piece.from <= -UNBOUNDED_REACH * 0.99 : piece.to >= UNBOUNDED_REACH * 0.99;
      let headsY = 0;
      if (unbounded) headsY = farHeading(graph, direction);
      else if (end.edge === 'top') headsY = 1;
      else if (end.edge === 'bottom') headsY = -1;
      return Object.freeze({
        id: `${entry.segment}:${side}`,
        segment: entry.segment,
        side,
        edge: end.edge,
        x: end.x,
        y: end.y,
        heads: Object.freeze({ x: unbounded ? direction : 0, y: headsY }),
      });
    })).filter(Boolean);
  });
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
