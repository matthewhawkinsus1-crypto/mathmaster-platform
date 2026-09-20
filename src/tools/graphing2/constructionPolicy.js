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
import { nearlyEqual } from '../shared/toolMath.js';
import { constructionEvidence, lineFromPoints, linesEquivalent, pointOnLine } from './graphingMath.js';

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
 * Grades graphing2 construction work under the question's constructionPolicy.
 * Returns the same { studentLine, pointChecks, score, isCorrect } shape as
 * constructionEvidence() plus form-aware fields (null when strategy is
 * 'equivalentLine', or for modes where form-aware evidence does not apply).
 */
export const evaluateConstruction = (points = [], question = {}, target, tolerance = 0.12) => {
  const mode = question.mode || 'slopeIntercept';
  const policy = resolveConstructionPolicy(question);

  // Through-points and vertical/horizontal already require the specific
  // evidence points as their base grading (the authored points themselves, or
  // two points sharing the constant coordinate); form-aware adds nothing new
  // for either, so both strategies fall back to the legacy grader unchanged.
  if (policy.strategy !== 'formAware' || mode === 'throughPoints' || mode === 'verticalHorizontal') {
    const legacy = constructionEvidence(points, target, tolerance);
    return {
      ...legacy,
      strategy: policy.strategy,
      requiredAnchor: policy.requiredAnchor,
      anchorSatisfied: null,
      slopeEvidenceSatisfied: null,
      interceptEvidence: null,
      category: legacy.isCorrect ? 'correct' : legacy.studentLine ? 'incorrectLine' : 'duplicatePoint',
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
  anchorMatches.forEach((anchor) => {
    if (!anchor.satisfied) return;
    const index = cleanPoints.findIndex((point, pointIndex) => !usedAsAnchor.has(pointIndex) && pointsMatch(point, anchor.point, tolerance));
    if (index >= 0) usedAsAnchor.add(index);
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
  };
};
