// Optional, backwards-compatible construction-evidence grading for graphing2.
//
// A question with no `constructionPolicy` (or `strategy: 'equivalentLine'`)
// keeps exactly the legacy behavior in graphingMath.js: any two distinct
// points that define the target line earn full credit. A question that opts
// into `strategy: 'formAware'` additionally requires the student to
// demonstrate the specific piece of information the question's form exposes
// (the y-intercept for slope-intercept, the given point for point-slope, both
// intercepts for standard form) before the final line is graded.
//
// This module never changes constructionEvidence/targetLineFromQuestion — it
// only adds new, additive grading on top of them.
import { nearlyEqual } from '../shared/toolMath.mjs';
import { constructionEvidenceDetail, graphing2SnapStep, lineFromPoints, linesEquivalent, pointOnLine, targetReachableOnGrid } from './graphingMath.mjs';

export const resolveConstructionPolicy = (question = {}) => {
  const policy = question.constructionPolicy || {};
  const strategy = policy.strategy === 'formAware' ? 'formAware' : 'equivalentLine';
  const requiredAnchor = ['yIntercept', 'xIntercept', 'givenPoint', 'intercepts'].includes(policy.requiredAnchor)
    ? policy.requiredAnchor
    : 'auto';
  const minimumPoints = Number(policy.minimumPoints) === 3 ? 3 : 2;
  return { strategy, requiredAnchor, minimumPoints };
};

// The required anchor point(s) exposed by the question's form. `axis` is set
// for a standard-form question that degenerates into a vertical/horizontal
// line, where only one intercept exists and the "second point" evidence is a
// second point sharing that same constant coordinate rather than a distinct
// intercept.
const standardFormAnchors = (question = {}) => {
  const A = Number(question.standard?.A);
  const B = Number(question.standard?.B);
  const C = Number(question.standard?.C);
  if (nearlyEqual(A, 0)) return { anchors: [{ id: 'yIntercept', point: [0, C / B] }], axis: 'horizontal' };
  if (nearlyEqual(B, 0)) return { anchors: [{ id: 'xIntercept', point: [C / A, 0] }], axis: 'vertical' };
  return {
    anchors: [{ id: 'xIntercept', point: [C / A, 0] }, { id: 'yIntercept', point: [0, C / B] }],
    axis: null,
  };
};

export const formAwareAnchorsForMode = (mode, question = {}, target) => {
  const requested = resolveConstructionPolicy(question).requiredAnchor;
  if (mode === 'slopeIntercept') {
    if (!target || target.kind !== 'slopeIntercept') return { anchors: [], axis: null };
    return { anchors: [{ id: 'yIntercept', point: [0, target.b] }], axis: null };
  }
  if (mode === 'pointSlope') {
    const point = Array.isArray(question.point) && question.point.length === 2 ? question.point.map(Number) : null;
    return { anchors: point && point.every(Number.isFinite) ? [{ id: 'givenPoint', point }] : [], axis: null };
  }
  if (mode === 'factoredLinear') {
    const c = Number(question.factored?.c);
    return { anchors: Number.isFinite(c) ? [{ id: 'xIntercept', point: [c, 0] }] : [], axis: null };
  }
  if (mode === 'standardForm') {
    const result = standardFormAnchors(question);
    if (requested === 'xIntercept' || requested === 'yIntercept') result.anchors = result.anchors.filter((anchor) => anchor.id === requested);
    return result;
  }
  return { anchors: [], axis: null };
};

const pointsMatch = (a, b, tolerance) => nearlyEqual(a[0], b[0], tolerance) && nearlyEqual(a[1], b[1], tolerance);

const dedupePoints = (points) => {
  const distinct = [];
  points.forEach((point) => {
    if (!distinct.some((existing) => pointsMatch(existing, point, 1e-4))) distinct.push(point);
  });
  return distinct;
};

/**
 * evaluateConstruction plus the facts its verdict and score are made of, for
 * the shared grader's per-part report (functions/shared/serverGrading/tools/
 * graphing2.mjs). `evidence` is EXACTLY what evaluateConstruction returns —
 * evaluateConstruction is this function's `evidence` — so the grader and every
 * other caller (Representation Bridge, the Linear Multiple Representations
 * board) share one definition of a correct construction.
 *
 *   legacy             the question is graded by constructionEvidence
 *   coincident         (legacy) the first two points are the same spot
 *   anchorPointIndex   (form-aware) per anchor, the plotted point used for it
 *   requiredAdditional (form-aware) points needed beyond the anchors
 *   lineCorrect        (form-aware) the plotted points determine the target
 *   hasMinimumPoints   (form-aware) at least policy.minimumPoints were plotted
 */
export const evaluateConstructionDetail = (points = [], question = {}, target, tolerance = 0.12) => {
  const mode = question.mode || 'slopeIntercept';
  const policy = resolveConstructionPolicy(question);

  // Through-points and vertical/horizontal already require the specific
  // evidence points as their base grading (the authored points themselves, or
  // two points sharing the constant coordinate); form-aware adds nothing new
  // for either, so both strategies fall back to the legacy grader unchanged.
  if (policy.strategy !== 'formAware' || mode === 'throughPoints' || mode === 'verticalHorizontal') {
    const requirePointsOnLine = targetReachableOnGrid(target, graphing2SnapStep(question, target), tolerance);
    const { evidence: legacy, coincident } = constructionEvidenceDetail(points, target, tolerance, { requirePointsOnLine });
    return {
      legacy: true,
      coincident,
      evidence: {
        ...legacy,
        strategy: policy.strategy,
        requiredAnchor: policy.requiredAnchor,
        anchorSatisfied: null,
        slopeEvidenceSatisfied: null,
        interceptEvidence: null,
        category: legacy.isCorrect ? 'correct' : legacy.studentLine ? 'incorrectLine' : 'duplicatePoint',
      },
    };
  }

  const cleanPoints = (points || []).filter((point) => Array.isArray(point) && point.length === 2 && point.every((value) => Number.isFinite(Number(value))));
  const duplicateFound = cleanPoints.some((point, index) => cleanPoints.some((other, otherIndex) => otherIndex > index && pointsMatch(point, other, 1e-4)));
  const { anchors, axis } = formAwareAnchorsForMode(mode, question, target);

  const anchorMatches = anchors.map((anchor) => ({
    ...anchor,
    satisfied: cleanPoints.some((point) => pointsMatch(point, anchor.point, tolerance)),
  }));
  const anchorSatisfied = anchorMatches.length > 0 && anchorMatches.every((anchor) => anchor.satisfied);

  const usedAsAnchor = new Set();
  const anchorPointIndex = anchorMatches.map((anchor) => {
    if (!anchor.satisfied) return -1;
    const index = cleanPoints.findIndex((point, pointIndex) => !usedAsAnchor.has(pointIndex) && pointsMatch(point, anchor.point, tolerance));
    if (index >= 0) usedAsAnchor.add(index);
    return index;
  });
  const remainingPoints = cleanPoints.filter((_, index) => !usedAsAnchor.has(index));

  const requiredAdditional = Math.max(0, policy.minimumPoints - anchors.length);
  let additionalSatisfiedCount = 0;
  if (axis === 'horizontal') additionalSatisfiedCount = remainingPoints.filter((point) => nearlyEqual(point[1], anchors[0].point[1], tolerance)).length;
  else if (axis === 'vertical') additionalSatisfiedCount = remainingPoints.filter((point) => nearlyEqual(point[0], anchors[0].point[0], tolerance)).length;
  else additionalSatisfiedCount = remainingPoints.filter((point) => pointOnLine(target, point, tolerance)).length;
  const slopeEvidenceSatisfied = requiredAdditional === 0 || additionalSatisfiedCount >= requiredAdditional;

  const distinctPoints = dedupePoints(cleanPoints);
  const studentLine = distinctPoints.length >= 2 ? lineFromPoints(distinctPoints[0], distinctPoints[1]) : null;
  const lineCorrect = Boolean(
    studentLine
    && linesEquivalent(studentLine, target, tolerance)
    && distinctPoints.every((point) => pointOnLine(target, point, tolerance * 1.5)),
  );

  const hasMinimumPoints = cleanPoints.length >= policy.minimumPoints;
  const isCorrect = lineCorrect && anchorSatisfied && slopeEvidenceSatisfied && !duplicateFound && hasMinimumPoints;

  const totalChecks = anchors.length + (requiredAdditional ? 1 : 0) + 1;
  const satisfiedChecks = anchorMatches.filter((anchor) => anchor.satisfied).length
    + (requiredAdditional ? (slopeEvidenceSatisfied ? 1 : 0) : 0)
    + (lineCorrect ? 1 : 0);
  const score = isCorrect ? 1 : totalChecks ? satisfiedChecks / totalChecks : 0;

  let category = 'correct';
  if (!isCorrect) {
    if (duplicateFound) category = 'duplicatePoint';
    else if (!anchorSatisfied) category = lineCorrect ? 'correctLineMissingAnchor' : 'incorrectLine';
    else if (!slopeEvidenceSatisfied) category = 'correctAnchorWrongSlope';
    else category = 'incorrectLine';
  }

  const interceptEvidence = ['standardForm', 'factoredLinear'].includes(mode)
    ? Object.fromEntries(anchorMatches.map((anchor) => [anchor.id, { required: true, satisfied: anchor.satisfied, point: anchor.point }]))
    : null;

  return {
    legacy: false,
    cleanPoints,
    anchorPointIndex,
    requiredAdditional,
    lineCorrect,
    hasMinimumPoints,
    evidence: {
      strategy: 'formAware',
      requiredAnchor: policy.requiredAnchor,
      minimumPoints: policy.minimumPoints,
      anchorSatisfied,
      slopeEvidenceSatisfied,
      interceptEvidence,
      anchors: anchorMatches,
      pointChecks: cleanPoints.map((point) => pointOnLine(target, point, tolerance)),
      studentLine,
      duplicateFound,
      isCorrect,
      score,
      category,
    },
  };
};

/**
 * Grades graphing2 construction work under the question's constructionPolicy.
 * Returns the same { studentLine, pointChecks, score, isCorrect } shape as
 * constructionEvidence() plus form-aware fields (null when strategy is
 * 'equivalentLine', or for modes where form-aware evidence does not apply).
 */
export const evaluateConstruction = (points = [], question = {}, target, tolerance = 0.12) => (
  evaluateConstructionDetail(points, question, target, tolerance).evidence
);

/*
 * WHAT GRAPHING2 ITSELF ASKS OF A CONSTRUCTION BEFORE IT CAN BE CHECKED.
 *
 * Graphing2.jsx enables "Check construction" only when the student holds the
 * required number of points and the first two determine a line. The shared
 * grader calls the same rule its `isComplete`, so a deadline auto-submits
 * exactly the work the student could have checked themselves.
 */
export const DEFAULT_CONSTRUCTION_TOLERANCE = 0.12;

export const constructionToleranceFor = (question = {}) => Number(question?.tolerance ?? DEFAULT_CONSTRUCTION_TOLERANCE);

export const requiredConstructionPointCount = (question = {}) => {
  const policy = resolveConstructionPolicy(question || {});
  return policy.strategy === 'formAware' ? policy.minimumPoints : 2;
};

export const constructionReadyToCheck = (points = [], question = {}) => {
  const list = Array.isArray(points) ? points : [];
  return list.length >= requiredConstructionPointCount(question)
    && list.length >= 2
    && lineFromPoints(list[0], list[1]) !== null;
};
