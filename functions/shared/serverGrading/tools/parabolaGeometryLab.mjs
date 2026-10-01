/*
 * Shared grader for the `parabolaGeometryLab` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from ParabolaGeometryLab.jsx: the same per-view
 * defaults for an unauthored question (features h=1, k=−1, p=2; equidistance
 * h=0, k=0, p=2 with the point sampled at offset 4; fromGeometry focus (2, 3)
 * and directrix y = −1; equation h=−2, k=1, p=1.5; orientation 'vertical'),
 * the same parabola mathematics (parabolaGeometryMath.mjs), the same number
 * parsing (matchesNumericAnswer: fractions and the U+2212 minus are read), the
 * same tolerances (0.01, and 0.02 for equidistance distances), and the same
 * score — the share of checks that are right.
 *
 * Completeness: every typed box is non-blank. A <select> always holds one of
 * its options ('yes' / 'up' by default), so it is complete whenever it holds a
 * valid one — and, exactly as on screen, the default may already be right.
 */
import declaration from '../declarations/parabolaGeometryLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { matchesNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import {
  geometryFromFocusDirectrix,
  parabolaFeatures,
  pointDistances,
  sampleParabolaPoint,
  standardEquationParts,
} from '../../toolMath/parabolaGeometry/parabolaGeometryMath.mjs';

// A typed box holds a string (a number reads the same way). Any other type is
// not something the lab's inputs can produce, so it counts as no entry.
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => entry(value).trim() !== '';

const numberPart = (id, label, value, expected, tolerance) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: matchesNumericAnswer(entry(value), expected, tolerance),
  response: entry(value),
});

// A <select> answer: one of its option codes, compared strictly with the key.
const choicePart = (id, label, value, options, isCorrect) => {
  const valid = typeof value === 'string' && options.includes(value);
  return { id, label, isComplete: valid, isCorrect: valid && isCorrect(value), response: valid ? value : '' };
};

/*
 * A question the lab cannot render (p = 0, a point that is not a list) throws
 * inside the parabola mathematics, and the screen never reaches its Check.
 * The server says so instead of blaming the student's work.
 */
const withKey = (build, grade) => {
  let key;
  try {
    key = build();
  } catch {
    return ungradedResult('invalid-question');
  }
  return grade(key);
};

const vertexSpec = (question, defaults) => ({
  h: Number(question.h ?? defaults.h),
  k: Number(question.k ?? defaults.k),
  p: Number(question.p ?? defaults.p),
  orientation: question.orientation || 'vertical',
});

const features = (question, work) => withKey(
  () => parabolaFeatures(vertexSpec(question, { h: 1, k: -1, p: 2 })),
  (key) => gradedResult({
    parts: [
      numberPart('focus-x', 'Focus x', work.focusX, key.focus[0], 0.01),
      numberPart('focus-y', 'Focus y', work.focusY, key.focus[1], 0.01),
      numberPart('directrix', 'Directrix', work.directrix, key.directrix.value, 0.01),
      numberPart('latus-rectum', 'Latus rectum length', work.latus, key.latusRectumLength, 0.01),
    ],
  }),
);

const equidistance = (question, work) => withKey(
  () => {
    const spec = vertexSpec(question, { h: 0, k: 0, p: 2 });
    const point = question.point || sampleParabolaPoint(spec, Number(question.offset ?? 4));
    return pointDistances(spec, point);
  },
  (distances) => gradedResult({
    parts: [
      numberPart('focus-distance', 'Distance P → focus', work.focusDistance, distances.focusDistance, 0.02),
      numberPart('directrix-distance', 'Distance P → directrix', work.directrixDistance, distances.directrixDistance, 0.02),
      choicePart('on-parabola', 'Is P on the parabola?', work.onCurve, ['yes', 'no'], (value) => (value === 'yes') === distances.onParabola),
    ],
  }),
);

const fromGeometry = (question, work) => {
  const focus = question.focus || [2, 3];
  const directrix = question.directrix || { kind: 'horizontal', value: -1 };
  // A focus on its own directrix (or an unreadable one) has no parabola. The
  // lab still renders it and marks every box wrong, so the grader does too:
  // no typed number matches a NaN key.
  const expected = geometryFromFocusDirectrix({ focus, directrix }) || { h: Number.NaN, k: Number.NaN, p: Number.NaN };
  return gradedResult({
    parts: [
      numberPart('h', 'Vertex h', work.h, expected.h, 0.01),
      numberPart('k', 'Vertex k', work.k, expected.k, 0.01),
      numberPart('p', 'p', work.p, expected.p, 0.01),
    ],
  });
};

const OPENINGS = Object.freeze(['up', 'down', 'left', 'right']);

const equation = (question, work) => withKey(
  () => {
    const spec = vertexSpec(question, { h: -2, k: 1, p: 1.5 });
    return { coefficient: standardEquationParts(spec).coefficient, opens: parabolaFeatures(spec).opens };
  },
  (key) => gradedResult({
    parts: [
      numberPart('coefficient', 'Value of 4p', work.coefficient, key.coefficient, 0.01),
      choicePart('opening', 'Opening direction', work.opening, OPENINGS, (value) => value === key.opens),
    ],
  }),
);

export default bindToolGrader(declaration, 'parabolaGeometryLab', {
  features,
  equidistance,
  fromGeometry,
  equation,
});
