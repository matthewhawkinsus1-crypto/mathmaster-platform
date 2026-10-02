/*
 * Systems Workspace student-build bridge.
 *
 * PR #293 owns the canonical inequality mathematics. This module now contains
 * only UI-facing construction/rendering adapters around that engine; it does
 * not maintain a second feasibility, classification, or intersection engine.
 *
 * Canonical form everywhere below:
 *   A*x + B*y + C relation 0
 */
import {
  boundaryIntersections,
  classifyFeasibleRegion as classifyCanonicalFeasibleRegion,
  evaluatePoint,
  isPointInInequality,
  normalizeLinearInequality,
  normalizeSystemsWorkspaceInequalityConfig,
} from './linearInequalityEngine.mjs';
import {
  SYSTEMS_WORKSPACE_DEFAULTS,
  clipPolygonWithInequality,
  feasibleRegionPolygon as canonicalFeasibleRegionPolygon,
} from './systemsMath.mjs';
import { parseNumericAnswer } from '../shared/toolMath.mjs';

const EPS = 1e-9;

export const boundaryKind = (boundary) => {
  const { A, B } = normalizeLinearInequality(boundary);
  if (Math.abs(B) <= EPS) return 'vertical';
  if (Math.abs(A) <= EPS) return 'horizontal';
  return 'slanted';
};

export const boundaryFromSlopeIntercept = (m, b, relation = '>=') => (
  normalizeLinearInequality({ m:Number(m), b:Number(b), relation })
);

export const boundaryFromVertical = (c, relation = '>=') => (
  normalizeLinearInequality({ A:1, B:0, C:-Number(c), relation })
);

export const boundaryFromHorizontal = (c, relation = '>=') => (
  normalizeLinearInequality({ A:0, B:1, C:-Number(c), relation })
);

export const boundaryFromTwoPoints = (p1, p2, relation = '>=') => {
  const [x1, y1] = p1 || [];
  const [x2, y2] = p2 || [];
  if ([x1, y1, x2, y2].some((value) => value == null || !Number.isFinite(Number(value)))) return null;
  if (Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1)) <= EPS) return null;
  if (Math.abs(Number(x2) - Number(x1)) <= EPS) return boundaryFromVertical(x1, relation);
  const m = (Number(y2) - Number(y1)) / (Number(x2) - Number(x1));
  const b = Number(y1) - m * Number(x1);
  return boundaryFromSlopeIntercept(m, b, relation);
};

export const authoredBoundaryFromInequality = (inequality = {}) => {
  if (inequality.orientation === 'vertical') return boundaryFromVertical(inequality.x, inequality.relation || '>=');
  if (inequality.orientation === 'horizontal') return boundaryFromHorizontal(inequality.y, inequality.relation || '>=');
  return normalizeLinearInequality(inequality);
};

export const satisfiesBoundary = (boundary = {}, x, y, tolerance = 1e-6) => (
  isPointInInequality(boundary, x, y, tolerance)
);

export const distanceToBoundaryLine = (boundary = {}, x, y) => {
  const { A, B, C } = normalizeLinearInequality(boundary);
  const norm = Math.hypot(A, B);
  if (norm <= EPS) return Infinity;
  return Math.abs(A * Number(x) + B * Number(y) + C) / norm;
};

export const pointOnBoundaryLine = (boundary, x, y, tolerance = 0.08) => (
  distanceToBoundaryLine(boundary, x, y) <= tolerance
);

export const clipPolygonWithBoundary = (polygon = [], boundary = {}) => (
  clipPolygonWithInequality(polygon, normalizeLinearInequality(boundary))
);

export const feasibleRegionPolygon = (boundaries = [], bounds = {}) => (
  canonicalFeasibleRegionPolygon(boundaries.map(authoredBoundaryFromInequality), bounds)
);

// Mathematical classification is viewport-independent and always comes from
// the canonical PR #293 engine.
export const classifyFeasibleRegion = (boundaries = []) => (
  classifyCanonicalFeasibleRegion(boundaries.map(authoredBoundaryFromInequality))
);

export const intersectBoundaryLines = (first, second) => {
  const intersection = boundaryIntersections([
    authoredBoundaryFromInequality(first),
    authoredBoundaryFromInequality(second),
  ])[0];
  return intersection ? [intersection.coordinate.x, intersection.coordinate.y] : null;
};

// Keep only intersections that are geometric corners of the feasible region:
// points may sit on a strict boundary (excluded) but may not lie outside any
// other constraint. Inclusion itself comes directly from the canonical engine.
export const feasibleRegionVertices = (boundaries = [], tolerance = 1e-6) => {
  const canonical = boundaries.map(authoredBoundaryFromInequality);
  const vertices = [];
  boundaryIntersections(canonical, tolerance).forEach((intersection) => {
    const { x, y } = intersection.coordinate;
    const evaluations = canonical.map((constraint) => evaluatePoint(constraint, x, y, Math.max(tolerance, 1e-8)));
    if (evaluations.some((result) => result === 'outside')) return;
    if (vertices.some((existing) => Math.hypot(existing.x - x, existing.y - y) <= tolerance)) return;
    vertices.push({
      x,
      y,
      included: intersection.includedInSolution,
      boundaries: intersection.constraints,
      reason: intersection.reason || null,
    });
  });
  return vertices;
};

export const lineSegmentForBounds = (boundary, bounds = {}) => {
  const { A, B, C } = normalizeLinearInequality(boundary);
  const xMin = Number(bounds.xMin ?? -10);
  const xMax = Number(bounds.xMax ?? 10);
  const yMin = Number(bounds.yMin ?? -10);
  const yMax = Number(bounds.yMax ?? 10);
  if (Math.abs(B) <= EPS) {
    const x = -C / A;
    return [[x, yMin], [x, yMax]];
  }
  if (Math.abs(A) <= EPS) {
    const y = -C / B;
    return [[xMin, y], [xMax, y]];
  }
  const m = -A / B;
  const b = -C / B;
  return [[xMin, m * xMin + b], [xMax, m * xMax + b]];
};

export const sideOfBoundaryLine = (boundary, x, y, tolerance = 1e-6) => {
  const { A, B, C } = normalizeLinearInequality(boundary);
  const value = A * Number(x) + B * Number(y) + C;
  if (Math.abs(value) <= tolerance) return 0;
  return value > 0 ? 1 : -1;
};

export const boundaryWithChosenSide = (boundary, side, strict) => ({
  ...normalizeLinearInequality(boundary),
  relation: side >= 0 ? (strict ? '>' : '>=') : (strict ? '<' : '<='),
});

// ============================================================================
// STUDENT-BUILD INEQUALITY TASK
//
// Everything below used to live inside SystemsWorkspace.jsx, where node (and so
// the server) could not reach it. It moved here unchanged so the workspace's
// on-screen progress and the shared grader
// (functions/shared/serverGrading/tools/systemsWorkspace/graphical.mjs) read
// ONE definition of the task, of a constructed boundary, and of "verified".
// ============================================================================

/**
 * Does this inequality question open the staged student-build workspace?
 * Opt-in only: an existing authored question omits every flag below and keeps
 * the legacy analyze / construct task.
 */
export const studentBuildInequalityEnabled = (question = {}) => {
  const inequalityConfig = normalizeSystemsWorkspaceInequalityConfig(question);
  return question.studentBuild === true
    || Object.values(inequalityConfig.studentBuild).some(Boolean)
    || Object.values(inequalityConfig.reasoning).some(Boolean)
    || Boolean(question.modeling);
};

/** A yes/no answer that was actually given. A blank never matches. */
export const explicitBooleanAnswerMatches = (answer, expected) => (
  (answer === 'yes' || answer === 'no') && (answer === 'yes') === Boolean(expected)
);

// A student's constructed BOUNDARY LINE (ignoring style/shade), from whichever
// of the several valid construction methods they used. Any of these that
// determines a real line is accepted — the task explicitly asks for more than
// one valid procedure per boundary type.
export const studentBoundaryLineFromEntry = (entry) => {
  if (!entry) return null;
  if (entry.method === 'points') {
    if (!entry.point1Plotted || !entry.point2Plotted) return null;
    return boundaryFromTwoPoints(
      [parseNumericAnswer(entry.x1), parseNumericAnswer(entry.y1)],
      [parseNumericAnswer(entry.x2), parseNumericAnswer(entry.y2)],
    );
  }
  if (entry.method === 'slopeIntercept') {
    if (!entry.point1Plotted || !entry.point2Plotted) return null;
    const m = parseNumericAnswer(entry.slope);
    const b = parseNumericAnswer(entry.intercept);
    const x1 = parseNumericAnswer(entry.x1);
    const y1 = parseNumericAnswer(entry.y1);
    const x2 = parseNumericAnswer(entry.x2);
    const y2 = parseNumericAnswer(entry.y2);
    // Slope/intercept entries are planning information, not a shortcut that
    // lets the platform manufacture the second point. The candidate line only
    // exists after the student has plotted both points themselves.
    if ([m, b, x1, y1, x2, y2].some((value) => value == null)) return null;
    const fromStudentPoints = boundaryFromTwoPoints([x1, y1], [x2, y2]);
    if (!fromStudentPoints || Math.abs(x1) > 0.08 || Math.abs(y1 - b) > 0.08) return null;
    const movementSlope = (y2 - y1) / (x2 - x1);
    return Math.abs(movementSlope - m) <= 0.08 ? fromStudentPoints : null;
  }
  if (entry.method === 'vertical') {
    const c = parseNumericAnswer(entry.constant);
    return c == null ? null : boundaryFromVertical(c);
  }
  if (entry.method === 'horizontal') {
    const c = parseNumericAnswer(entry.constant);
    return c == null ? null : boundaryFromHorizontal(c);
  }
  return null;
};

// Two lines are the same line — regardless of how each was parameterized —
// exactly when two DISTINCT points of one satisfy the other's equation. This
// is what makes construction validation mathematical rather than
// pixel/format-exact: a student who used slope-intercept is checked the same
// way as one who clicked two points.
export const boundaryLinesMatch = (candidate, authored, bounds) => {
  if (!candidate) return false;
  const [p1, p2] = lineSegmentForBounds(authored, bounds);
  return pointOnBoundaryLine(candidate, p1[0], p1[1], 0.08) && pointOnBoundaryLine(candidate, p2[0], p2[1], 0.08);
};

export const modelingEntryToCanonical = (entry) => {
  if (!entry) return null;
  const a = parseNumericAnswer(entry.coeffA);
  const b = parseNumericAnswer(entry.coeffB);
  const rhs = parseNumericAnswer(entry.constant);
  if (a == null || b == null || rhs == null || !entry.relation) return null;
  if (Math.abs(a) <= 1e-12 && Math.abs(b) <= 1e-12) return null;
  return { A:a, B:b, C:-rhs, relation:entry.relation };
};

export const flipInequalityRelation = (relation) => ({
  '>':'<', '>=':'<=', '<':'>', '<=':'>=',
}[relation] || relation);

export const equivalentLinearInequality = (actual, expected, tolerance = 1e-6) => {
  if (!actual || !expected) return false;
  const a = [Number(actual.A), Number(actual.B), Number(actual.C)];
  const e = [Number(expected.A), Number(expected.B), Number(expected.C)];
  const pivot = e.findIndex((value) => Math.abs(value) > tolerance);
  if (pivot < 0 || a.some((value) => !Number.isFinite(value)) || e.some((value) => !Number.isFinite(value))) return false;
  const scale = a[pivot] / e[pivot];
  if (!Number.isFinite(scale) || Math.abs(scale) <= tolerance) return false;
  const coefficientsMatch = a.every((value, index) => (
    Math.abs(value - scale * e[index]) <= tolerance * Math.max(1, Math.abs(value), Math.abs(scale * e[index]))
  ));
  if (!coefficientsMatch) return false;
  const expectedRelation = scale > 0 ? expected.relation : flipInequalityRelation(expected.relation);
  return actual.relation === expectedRelation;
};

export const modelingEntryCorrect = (entry, expected) => {
  if (!entry || !expected) return false;
  return equivalentLinearInequality(modelingEntryToCanonical(entry), expected);
};

const reverseRewriteRelation = (relation) => ({
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
  '=': '=',
}[relation] || relation);

/**
 * Is a student's rewritten graphing-form constraint the SAME half-plane as the
 * expected one? (EmbeddedInequalityRewrite's unlock test, moved here so the
 * grader re-checks the student's rewrite with the identical rule.)
 */
export const sameGraphingConstraint = (actual, expected, tolerance = 1e-7) => {
  if (!actual || !expected) return false;
  const a = [actual.A, actual.B, actual.C].map(Number);
  const e = [expected.A, expected.B, expected.C].map(Number);
  const pivot = e.findIndex((value) => Math.abs(value) > tolerance);
  if (pivot < 0 || a.some((value) => !Number.isFinite(value))) return false;
  const scale = a[pivot] / e[pivot];
  if (!Number.isFinite(scale) || Math.abs(scale) <= tolerance) return false;
  if (!a.every((value, index) => (
    Math.abs(value - scale * e[index]) <= tolerance * Math.max(1, Math.abs(value), Math.abs(scale * e[index]))
  ))) return false;
  return actual.relation === (scale < 0 ? reverseRewriteRelation(expected.relation) : expected.relation);
};

/**
 * Everything a student-build inequality question asks, resolved once.
 *
 * Source constraints are presentation; expected constraints are hidden,
 * canonical grading truth. Never derive a student-facing label from the latter
 * merely because the canonical engine consumes it.
 */
export const studentBuildInequalityTask = (question = {}) => {
  const inequalityConfig = normalizeSystemsWorkspaceInequalityConfig(question);
  const buildConfig = inequalityConfig.studentBuild;
  const reasoningConfig = inequalityConfig.reasoning;
  const legacyStudentBuild = question.studentBuild === true;
  const modeling = question.modeling || null;
  const rawExpectedConstraints = question.expectedConstraints || question.inequalities || SYSTEMS_WORKSPACE_DEFAULTS.inequalities;
  // The ONE definition of the expected constraints both the modeling and the
  // non-modeling paths are built, checked and reasoned against.
  const expectedConstraints = modeling
    ? (modeling.expectedConstraints || []).map((c) => ({ A:Number(c.A ?? 0), B:Number(c.B ?? 0), C:Number(c.C ?? 0), relation:c.relation || '>=' }))
    : rawExpectedConstraints.map(authoredBoundaryFromInequality);
  const teacherTestPoint = question.testPoint || null;
  return {
    buildConfig,
    reasoningConfig,
    hasBuildSteps: Object.values(buildConfig).some(Boolean),
    legacyStudentBuild,
    bounds: question.graph || SYSTEMS_WORKSPACE_DEFAULTS.inequalityGraph,
    modeling,
    variables: modeling?.variables?.length ? modeling.variables : [{ symbol:'x', label:'x' }, { symbol:'y', label:'y' }],
    sourceConstraints: question.sourceConstraints || question.inequalities || SYSTEMS_WORKSPACE_DEFAULTS.inequalities,
    expectedConstraints,
    constraintCount: expectedConstraints.length,
    askClassification: question.askClassification != null
      ? Boolean(question.askClassification)
      : (legacyStudentBuild || reasoningConfig.classifyRegion),
    askVertices: question.askVertices != null
      ? Boolean(question.askVertices)
      : reasoningConfig.vertices,
    boundaryProbeEnabled: legacyStudentBuild || reasoningConfig.boundaryProbe,
    teacherTestPoint,
    testPointReasoningEnabled: legacyStudentBuild
      ? Boolean(teacherTestPoint || question.allowStudentTestPoint)
      : (reasoningConfig.testPoint || Boolean(teacherTestPoint) || Boolean(question.allowStudentTestPoint)),
    allowStudentTestPoint: question.allowStudentTestPoint != null
      ? Boolean(question.allowStudentTestPoint)
      : (reasoningConfig.testPoint && !teacherTestPoint),
  };
};

/**
 * The constraints the student builds and reasons against: their own model once
 * every row is a valid inequality and they sent it (follow-through), else their
 * verified rewrite of each expected constraint, else the expected constraints.
 */
export const studentBuildWorkingConstraints = ({ task, modelingEntries = [], modelingSent = false, rewriteConstraints = [] }) => {
  const modeledConstraints = task.modeling ? modelingEntries.map(modelingEntryToCanonical) : [];
  if (task.modeling && modelingSent && modeledConstraints.every(Boolean)) return modeledConstraints;
  if (task.buildConfig.rewrite) return task.expectedConstraints.map((expected, index) => rewriteConstraints[index] || expected);
  return task.expectedConstraints;
};

/**
 * One constraint's build progress. A step only counts as VERIFIED once the
 * student explicitly checked it (its attempt counter) AND it is right; a step
 * the question does not ask for is provided, so it is always satisfied.
 * `constraintCorrect` is the same constraint judged from its work as it
 * stands, checked or not: what it is graded as where the activity withholds
 * outcomes and a step's Check is no verdict (a DOL, quiz or test).
 */
export const studentBuildConstraintStatus = ({ buildConfig, entry, workingConstraint, bounds, rewriteVerified = false }) => {
  const boundaryCorrect = !buildConfig.boundary || boundaryLinesMatch(studentBoundaryLineFromEntry(entry), workingConstraint, bounds);
  const styleCorrect = !buildConfig.lineStyle
    || entry?.style === (String(workingConstraint?.relation || '>=').includes('=') ? 'solid' : 'dashed');
  const shadePoint = entry?.shadePoint;
  const shadeCorrect = !buildConfig.shading || (Boolean(shadePoint) && satisfiesBoundary(workingConstraint, shadePoint[0], shadePoint[1]));
  const rewriteDone = !buildConfig.rewrite || Boolean(rewriteVerified);
  const boundaryVerified = !buildConfig.boundary || (entry?.boundaryAttempts > 0 && boundaryCorrect);
  const styleVerified = !buildConfig.lineStyle || (entry?.styleAttempts > 0 && styleCorrect);
  const shadeVerified = !buildConfig.shading || (entry?.shadeAttempts > 0 && shadeCorrect);
  return {
    rewriteVerified: rewriteDone,
    boundaryCorrect,
    styleCorrect,
    shadeCorrect,
    boundaryVerified,
    styleVerified,
    shadeVerified,
    constraintVerified: rewriteDone && boundaryVerified && styleVerified && shadeVerified,
    constraintCorrect: rewriteDone && boundaryCorrect && styleCorrect && shadeCorrect,
  };
};

/** Which of the working constraints a point satisfies, one boolean each. */
export const pointMembership = (constraints = [], point) => constraints.map((boundary) => satisfiesBoundary(boundary, point[0], point[1]));

/** The first working boundary a point sits on (within 0.12), or -1. */
export const pointOnBoundaryIndex = (constraints = [], point) => (
  point ? constraints.findIndex((boundary) => pointOnBoundaryLine(boundary, point[0], point[1], 0.12)) : -1
);

/** Whether the true corner nearest a marked vertex (within 0.15) is included; null when none is near. */
export const vertexInclusionExpected = (workingVertices = [], vertex = {}) => {
  const match = workingVertices.find((v) => Math.hypot(v.x - vertex.x, v.y - vertex.y) <= 0.15);
  return match ? match.included : null;
};
