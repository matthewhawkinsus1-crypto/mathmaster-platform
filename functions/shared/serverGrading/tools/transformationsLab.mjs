/*
 * Shared grader for the `transformationsLab` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from TransformationsLab.jsx's Check handlers. The
 * question is read by the same resolveTransformationsQuestion the screen draws
 * from (family, target, function, graphBounds, b box, parent point, source
 * points, defining feature), and every verdict reuses the lab's own
 * mathematics:
 *
 *   match          the student's graph against the dashed target, sampled by
 *                  transformationGraphScore over graphBounds.xMin..xMax (82
 *                  samples, 0.02) — the window the student sees. Score: the
 *                  share of comparable samples that agree; correct at >= 0.999.
 *   identify       a, b, h, k against the drawn function at 0.01
 *                  (transformationParameterScore). Always four checks: with no
 *                  b box the lab's b is its fixed 1, exactly as before. Any
 *                  a, b, h, k whose function, rewritten in the question's own
 *                  form, is within 0.01 of it (sameTransformedFunction) is
 *                  right in every part: the graph does not fix one set.
 *   pointMap       (x/b + h, ay + k) of the parent point at 0.01. A
 *                  coordinate earns credit only once BOTH are entered.
 *   plotTransform  each plotted point against its source point's image, in
 *                  plotting order, at 0.01; correct only with exactly one
 *                  point per image.
 *   describe       the ten descriptions (six choices, four numbers at 0.01),
 *                  or a full description of the same function another way
 *                  (descriptionDrawsSameFunction), right in every part.
 *   anchor         the transformed defining feature at 0.01.
 *
 * Typed coordinates and descriptions are read with parseNumericAnswer (so
 * fractions and U+2212 are accepted, as they always were); parameter boxes are
 * read with Number(), as the lab's type="number" boxes always were.
 *
 * DELIBERATE DIFFERENCES FROM THE PRE-SHARED LAB, each pinned by a test:
 *
 *   - An empty parameter box is not an answer. The lab read `Number('')`,
 *     which is 0, so clearing the h box of an identify question whose h is 0
 *     still earned h — and in match mode a cleared box drew as 0 and could be
 *     marked correct. A blank box is now incomplete and never correct; typing
 *     0 is graded exactly as before.
 *   - Completeness of the PRE-FILLED modes (match, identify): the boxes start
 *     at the question's `initial` values (else 1, 1, 0, 0), so they are never
 *     blank. Work still identical to that untouched starting state is not
 *     complete, so a deadline never auto-submits a lab the student did not
 *     touch (and never awards it the partial credit the starting values
 *     happen to earn). An explicit Check of untouched work is still graded,
 *     with the same verdict and score as before.
 *   - A plotted point must be a pair of finite numbers (the plane only ever
 *     plots those); anything else is an unplaced point.
 */
import declaration from '../declarations/transformationsLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { matchesNumericAnswer, parseNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import {
  descriptionDrawsSameFunction,
  mapParentPoint,
  mappedPointIsCorrect,
  resolveTransformationsQuestion,
  studentTransformationSpec,
  transformationDescriptor,
  transformationGraphScore,
  transformationParameterScore,
  transformedSourcePoints,
} from '../../toolMath/transformations/transformationsMath.mjs';

// The lab's tolerances: typed values, parameters, mapped and plotted points;
// and the sampled graph in match mode.
const TOLERANCE = 0.01;
const GRAPH_TOLERANCE = 0.02;

// A box holds text (a number reads the same way). Any other type is not
// something the lab's inputs can produce, so it counts as no entry.
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
// A parameter box is answered when it holds a number Number() can read.
const parameterAnswered = (text) => text.trim() !== '' && Number.isFinite(Number(text));
// A <select> holds '' until the student chooses.
const chosen = (value) => typeof value === 'string' && value !== '';

const PARAMETERS = ['a', 'b', 'h', 'k'];

/** The parameter boxes the lab shows, as text, and whether they answer anything. */
const parameterBoxes = (resolved, work) => {
  const keys = resolved.showB ? PARAMETERS : ['a', 'h', 'k'];
  // With no b box on screen the lab's b is its starting '1' (the box is shown
  // whenever anything authors a b), so a client cannot supply a hidden one.
  const values = {
    a: entry(work.a),
    b: resolved.showB ? entry(work.b) : resolved.startingValues.b,
    h: entry(work.h),
    k: entry(work.k),
  };
  const allAnswered = keys.every((key) => parameterAnswered(values[key]));
  const untouched = keys.every((key) => values[key] === resolved.startingValues[key]);
  return {
    keys,
    values,
    allAnswered,
    isComplete: allAnswered && !untouched,
    response: keys.map((key) => `${key}=${values[key]}`).join(', '),
  };
};

const match = (question, work) => {
  const resolved = resolveTransformationsQuestion(question);
  const boxes = parameterBoxes(resolved, work);
  // The graph the student's boxes draw, sampled over the window they see.
  const studentSpec = studentTransformationSpec({ family: resolved.family, base: resolved.targetSpec.base }, boxes.values);
  const graph = transformationGraphScore(studentSpec, resolved.targetSpec, {
    xMin: resolved.graphBounds.xMin,
    xMax: resolved.graphBounds.xMax,
    tolerance: GRAPH_TOLERANCE,
  });
  const isCorrect = boxes.allAnswered && graph.isCorrect;
  return gradedResult({
    isComplete: boxes.isComplete,
    isCorrect,
    score: graph.score,
    parts: [{
      id: 'graph',
      label: 'Graph lies on the target',
      isComplete: boxes.allAnswered,
      isCorrect,
      credit: isCorrect ? 1 : graph.score,
      response: boxes.response,
    }],
  });
};

const identify = (question, work) => {
  const resolved = resolveTransformationsQuestion(question);
  const boxes = parameterBoxes(resolved, work);
  // A blank box is no number (never 0), so it can never complete a set that draws the same graph.
  const student = Object.fromEntries(PARAMETERS.map((key) => [key, parameterAnswered(boxes.values[key]) ? Number(boxes.values[key]) : Number.NaN]));
  const { checks } = transformationParameterScore(student, resolved.investigationSpec, TOLERANCE);
  const parts = PARAMETERS.map((key, index) => {
    const answered = parameterAnswered(boxes.values[key]);
    return {
      id: key,
      label: key === 'b' && !resolved.showB ? 'b (no b box: fixed at 1)' : key,
      isComplete: answered,
      isCorrect: answered && checks[index] === true,
      response: boxes.values[key],
    };
  });
  return gradedResult({
    isComplete: boxes.isComplete,
    isCorrect: parts.every((part) => part.isCorrect),
    parts,
  });
};

const pointMap = (question, work) => {
  const { investigationSpec, parentPoint } = resolveTransformationsQuestion(question);
  const typed = [entry(work.mappedX), entry(work.mappedY)];
  const response = typed.map(parseNumericAnswer);
  const bothEntered = response.every((value) => value != null);
  const expected = mapParentPoint(parentPoint, investigationSpec);
  // The lab awards a coordinate only once both are entered.
  const checks = bothEntered && expected
    ? typed.map((value, index) => matchesNumericAnswer(value, expected[index], TOLERANCE))
    : [false, false];
  return gradedResult({
    isComplete: bothEntered,
    isCorrect: bothEntered && mappedPointIsCorrect(response, parentPoint, investigationSpec, TOLERANCE),
    score: checks.filter(Boolean).length / 2,
    parts: [
      { id: 'mapped-x', label: 'Transformed x', isComplete: response[0] != null, isCorrect: checks[0], response: typed[0] },
      { id: 'mapped-y', label: 'Transformed y', isComplete: response[1] != null, isCorrect: checks[1], response: typed[1] },
    ],
  });
};

const finiteCoordinate = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const plottedPoint = (point) => {
  if (!Array.isArray(point)) return null;
  const x = finiteCoordinate(point[0]);
  const y = finiteCoordinate(point[1]);
  return x === null || y === null ? null : [x, y];
};

const plotTransform = (question, work) => {
  const { investigationSpec, sourcePoints } = resolveTransformationsQuestion(question);
  const images = transformedSourcePoints(sourcePoints, investigationSpec);
  const plotted = Array.isArray(work.plottedPoints) ? work.plottedPoints : [];
  // Plotting order is the answer's order: P1 is S1's image, P2 is S2's, ...
  const parts = images.map((image, index) => {
    const point = plottedPoint(plotted[index]);
    return {
      id: `P${index + 1}`,
      label: `Point P${index + 1}`,
      isComplete: Boolean(point),
      isCorrect: Boolean(point)
        && Math.abs(point[0] - Number(image[0])) <= TOLERANCE
        && Math.abs(point[1] - Number(image[1])) <= TOLERANCE,
      response: point ? `(${point[0]}, ${point[1]})` : '',
    };
  });
  const matched = parts.filter((part) => part.isCorrect).length;
  // The lab's Check opens only with exactly one point per image.
  const isComplete = images.length > 0 && plotted.length === images.length && parts.every((part) => part.isComplete);
  return gradedResult({
    isComplete,
    isCorrect: isComplete && matched === images.length,
    score: images.length ? matched / images.length : 0,
    parts,
  });
};

const choicePart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: chosen(value),
  isCorrect: value === expected,
  response: typeof value === 'string' ? value : '',
});

const numberPart = (id, label, value, expected) => {
  const typed = entry(value);
  return {
    id,
    label,
    isComplete: parseNumericAnswer(typed) != null,
    isCorrect: matchesNumericAnswer(typed, expected, TOLERANCE),
    response: typed,
  };
};

const describe = (question, work) => {
  const { investigationSpec } = resolveTransformationsQuestion(question);
  const descriptor = transformationDescriptor(investigationSpec);
  const parts = [
      choicePart('reflection', 'Reflection across the x-axis', work.reflection, descriptor.reflection ? 'yes' : 'no'),
      choicePart('vertical-scale-kind', 'Vertical scale', work.scaleKind, descriptor.verticalScaleKind),
      numberPart('vertical-scale-factor', 'Vertical scale factor |a|', work.scaleFactor, descriptor.verticalScale),
      choicePart('horizontal-reflection', 'Reflection across the y-axis', work.horizontalReflection, descriptor.horizontalReflection ? 'yes' : 'no'),
      choicePart('horizontal-scale-kind', 'Horizontal scale', work.horizontalScaleKind, descriptor.horizontalScaleKind),
      numberPart('horizontal-scale-factor', 'Horizontal scale factor 1/|b|', work.horizontalScaleFactor, descriptor.horizontalScale),
      choicePart('horizontal-direction', 'Horizontal translation', work.horizontalDirection, descriptor.horizontalDirection),
      numberPart('horizontal-distance', 'Horizontal shift (units)', work.horizontalDistance, descriptor.horizontalDistance),
      choicePart('vertical-direction', 'Vertical translation', work.verticalDirection, descriptor.verticalDirection),
      numberPart('vertical-distance', 'Vertical shift (units)', work.verticalDistance, descriptor.verticalDistance),
  ];
  // A full description of the same graph another way (4x² as a horizontal
  // compression by 1/2) is right in every part: the graph is all the student
  // was shown.
  const sameGraph = descriptionDrawsSameFunction(work, investigationSpec, TOLERANCE);
  return gradedResult({ parts: sameGraph ? parts.map((part) => ({ ...part, isCorrect: true })) : parts });
};

const anchor = (question, work) => {
  const feature = resolveTransformationsQuestion(question).anchor;
  return gradedResult({
    parts: [
      numberPart('anchor-x', `${feature.label} x-coordinate`, work.anchorX, feature.point?.[0]),
      numberPart('anchor-y', `${feature.label} y-coordinate`, work.anchorY, feature.point?.[1]),
    ],
  });
};

export default bindToolGrader(declaration, 'transformationsLab', {
  match,
  identify,
  pointMap,
  plotTransform,
  describe,
  anchor,
});
