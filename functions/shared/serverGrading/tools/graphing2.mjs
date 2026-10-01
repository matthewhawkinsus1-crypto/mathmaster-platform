/*
 * Shared grader for the `graphing2` registry tool — run by the browser tool for
 * feedback, by QuestionEngine for the recorded verdict, and by the server as
 * the authority. See ../toolGraderDefinition.mjs for the contract.
 *
 * Extracted from Graphing2.jsx's Check handler, which called
 *
 *   evaluateConstruction(points, questionData, target, Number(questionData.tolerance ?? 0.12))
 *
 * with `target` read from the question after the tool's own default line
 * (y = 1.5x - 2 for an unauthored slope-intercept question). This grader makes
 * that same call through evaluateConstructionDetail, whose `evidence` IS
 * evaluateConstruction's result, so the verdict and the score are the
 * construction policy's own, unchanged:
 *
 *   equivalentLine (and form-aware throughPoints / verticalHorizontal):
 *     correct when the first two points determine the target line;
 *     score = points on the line / 2, or 1/4 for one on-line point plotted
 *     twice.
 *   formAware:
 *     correct when the required anchor(s) are plotted, enough further points
 *     lie on the line, the points determine the target line, no point is
 *     plotted twice and at least minimumPoints were plotted;
 *     score = satisfied checks / (anchors + slope evidence + line).
 *
 * The parts report those same checks. The SCORED parts are exactly the
 * checks the score is built from, so their weighted share is the score
 * whenever the construction is wrong. A requirement that blocks full credit
 * without being part of the score (the line itself under equivalentLine, a
 * repeated point, too few points) is reported as a `graded: false` part, so it
 * explains the verdict without changing any credit.
 */
import declaration from '../declarations/graphing2.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { formatLine, graphingTargetLine } from '../../toolMath/graphing2/graphingMath.mjs';
import {
  constructionReadyToCheck,
  constructionToleranceFor,
  evaluateConstructionDetail,
} from '../../toolMath/graphing2/constructionPolicy.mjs';

/*
 * The student's plotted points. CoordinatePlane only ever hands the tool
 * [x, y] pairs of finite numbers, so anything else did not come from the tool:
 * the work is refused as malformed rather than guessed at. No points at all is
 * a real (empty) construction.
 */
const isPlottedPoint = (point) => Array.isArray(point)
  && point.length === 2
  && point.every((value) => typeof value === 'number' && Number.isFinite(value));

const readPoints = (work) => {
  if (work.points === undefined || work.points === null) return [];
  if (!Array.isArray(work.points) || !work.points.every(isPlottedPoint)) return null;
  return work.points;
};

const pointText = (point) => (Array.isArray(point) ? `(${point[0]}, ${point[1]})` : '');
const lineText = (line) => (line ? formatLine(line) : '');

const ANCHOR_LABELS = Object.freeze({
  yIntercept: 'Plotted the y-intercept',
  xIntercept: 'Plotted the x-intercept',
  givenPoint: 'Plotted the given point',
});

// equivalentLine: the score is the share of the first two points on the line.
const legacyParts = (points, { evidence, coincident }) => {
  const [firstOnLine = false, secondOnLine = false] = evidence.pointChecks;
  return [
    {
      id: 'point-1',
      label: 'Point 1 is on the target line',
      isComplete: points.length >= 1,
      isCorrect: firstOnLine,
      // CRIT-01: one on-line point plotted twice earns a quarter, not a half.
      credit: firstOnLine ? (coincident ? 0.5 : 1) : 0,
      response: pointText(points[0]),
    },
    {
      id: 'point-2',
      label: 'Point 2 is on the target line',
      isComplete: points.length >= 2,
      isCorrect: secondOnLine,
      response: pointText(points[1]),
    },
    {
      id: 'line',
      label: 'Your two points determine the target line',
      // A line exists only when the first two points are distinct.
      isComplete: evidence.studentLine !== null,
      isCorrect: evidence.isCorrect,
      graded: false,
      response: lineText(evidence.studentLine),
    },
  ];
};

// formAware: the score is the share of anchor, slope-evidence and line checks.
const formAwareParts = (detail) => {
  const { evidence, cleanPoints, anchorPointIndex, requiredAdditional, lineCorrect, hasMinimumPoints } = detail;
  const parts = evidence.anchors.map((anchor, index) => ({
    id: `anchor-${anchor.id}`,
    label: ANCHOR_LABELS[anchor.id] || 'Plotted the required point',
    isComplete: cleanPoints.length > 0,
    isCorrect: anchor.satisfied,
    // The student's own point that met the requirement — never the anchor
    // coordinate itself, which is answer material.
    response: anchor.satisfied ? pointText(cleanPoints[anchorPointIndex[index]]) : '',
  }));
  if (!evidence.anchors.length) {
    // A form-aware question whose form exposes no anchor (an unknown mode, or
    // a target the form cannot anchor) can never be marked correct; say so.
    parts.push({ id: 'anchor', label: 'Plotted the required point', isComplete: true, isCorrect: false, graded: false });
  }
  if (requiredAdditional) {
    parts.push({
      id: 'slope-evidence',
      label: requiredAdditional === 1 ? 'Another point on the target line' : `${requiredAdditional} more points on the target line`,
      isComplete: hasMinimumPoints,
      isCorrect: evidence.slopeEvidenceSatisfied,
    });
  }
  parts.push({
    id: 'line',
    label: 'Your points determine the target line',
    isComplete: evidence.studentLine !== null,
    isCorrect: lineCorrect,
    response: lineText(evidence.studentLine),
  });
  parts.push({
    id: 'distinct-points',
    label: 'Every plotted point is a different point',
    isComplete: true,
    isCorrect: !evidence.duplicateFound,
    graded: false,
  });
  parts.push({
    id: 'minimum-points',
    label: `At least ${evidence.minimumPoints} points plotted`,
    isComplete: true,
    isCorrect: hasMinimumPoints,
    graded: false,
  });
  return parts;
};

const gradeConstruction = (question, work) => {
  const points = readPoints(work);
  if (!points) return ungradedResult('malformed-response');
  let detail;
  try {
    detail = evaluateConstructionDetail(points, question, graphingTargetLine(question), constructionToleranceFor(question));
  } catch {
    // The construction policy itself throws for a form-aware standard-form
    // question that requires an intercept its line does not have (an
    // x-intercept of a horizontal line, a y-intercept of a vertical one —
    // toolSchemas.js refuses to author these). Graphing2's Check crashed there
    // and recorded nothing, so there is no verdict to reproduce.
    return ungradedResult('unanswerable-question');
  }
  return gradedResult({
    // The tool's own Check gate: enough points, and the first two make a line.
    isComplete: constructionReadyToCheck(points, question),
    isCorrect: detail.evidence.isCorrect,
    score: detail.evidence.score,
    parts: detail.legacy ? legacyParts(points, detail) : formAwareParts(detail),
  });
};

const partById = (parts, id) => (Array.isArray(parts) ? parts.find((part) => part?.id === id) : undefined) || null;

/**
 * What Graphing2 tells the student after Check, read back from the shared
 * grader's result (the tool sees only `isCorrect`, `score` and `parts`).
 *
 *   category     evaluateConstruction's category: correct | incorrectLine |
 *                duplicatePoint | correctLineMissingAnchor |
 *                correctAnchorWrongSlope
 *   pointChecks  [P1 on the line, P2 on the line] (equivalentLine wording)
 */
export const readConstructionFeedback = ({ isCorrect = false, parts = [] } = {}) => {
  const pointChecks = [partById(parts, 'point-1')?.isCorrect === true, partById(parts, 'point-2')?.isCorrect === true];
  if (isCorrect === true) return { category: 'correct', pointChecks };
  const line = partById(parts, 'line');
  const distinct = partById(parts, 'distinct-points');
  if (!distinct) {
    // Graded by constructionEvidence: no line means the points coincided.
    return { category: line?.isComplete === true ? 'incorrectLine' : 'duplicatePoint', pointChecks };
  }
  if (distinct.isCorrect !== true) return { category: 'duplicatePoint', pointChecks };
  const anchors = (Array.isArray(parts) ? parts : []).filter((part) => part?.id === 'anchor' || String(part?.id).startsWith('anchor-'));
  const anchorSatisfied = anchors.length > 0 && anchors.every((part) => part.isCorrect === true);
  const lineCorrect = line?.isCorrect === true;
  if (!anchorSatisfied) return { category: lineCorrect ? 'correctLineMissingAnchor' : 'incorrectLine', pointChecks };
  const slope = partById(parts, 'slope-evidence');
  if (slope && slope.isCorrect !== true) return { category: 'correctAnchorWrongSlope', pointChecks };
  return { category: 'incorrectLine', pointChecks };
};

export default bindToolGrader(declaration, 'graphing2', {
  slopeIntercept: gradeConstruction,
  factoredLinear: gradeConstruction,
  throughPoints: gradeConstruction,
  pointSlope: gradeConstruction,
  standardForm: gradeConstruction,
  verticalHorizontal: gradeConstruction,
});
