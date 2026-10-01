/*
 * Shared grader for the `polynomialWorkshop` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from PolynomialWorkshop.jsx: the same defaults
 * for an unauthored question (POLYNOMIAL_WORKSHOP_DEFAULTS, the table the
 * views draw from), the same polynomial mathematics (polynomialMath.mjs), the
 * same number reading (matchesNumericAnswer / parseNumericAnswer: fractions
 * and the U+2212 minus; coefficient lists read with Number()), the same
 * tolerances (0.01 everywhere, 1e-9 for "P(r) is zero"), and the same score —
 * the share of checks that are right (factor pair and rational feature are
 * single all-or-nothing checks).
 *
 * Completeness: every typed box is non-blank. A <select> always holds one of
 * its options ('yes', 'crosses', 'both ends rise', 'hole' by default), so it
 * is complete whenever it holds a valid one — and, exactly as on screen, the
 * default may already be right.
 */
import declaration from '../declarations/polynomialWorkshop.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { evaluatePolynomial, matchesNumericAnswer, parseNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import {
  POLYNOMIAL_WORKSHOP_DEFAULTS as DEFAULTS,
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  graphConnectionTargetEntry,
  integerFactorPairForMonicQuadratic,
  parseCoefficientList,
  polynomialLongDivide,
  polynomialMultiply,
  rationalFeatureMap,
  rationalFeatureTargetValue,
  rationalFeatureTypeAt,
  sameCoefficientList,
  sameNumberMultiset,
} from '../../toolMath/polynomialWorkshop/polynomialMath.mjs';

// A typed box holds a string (a number reads the same way). Any other type is
// not something the workshop's inputs can produce, so it counts as no entry.
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => entry(value).trim() !== '';

const numberPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: matchesNumericAnswer(entry(value), expected, 0.01),
  response: entry(value),
});

const listPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: sameCoefficientList(parseCoefficientList(entry(value)), expected, 0.01),
  response: entry(value),
});

// A <select> answer: one of its option codes, compared strictly with the key.
const choicePart = (id, label, value, options, expected) => {
  const valid = typeof value === 'string' && options.includes(value);
  return { id, label, isComplete: valid, isCorrect: valid && value === expected, response: valid ? value : '' };
};

/*
 * A question the workshop cannot render (coefficients that are not a list, a
 * zero divisor, an empty root list) throws inside the polynomial mathematics.
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

const YES_NO = Object.freeze(['yes', 'no']);
const BEHAVIORS = Object.freeze(['crosses', 'touches']);
const END_BEHAVIORS = Object.freeze(['both ends rise', 'both ends fall', 'left falls, right rises', 'left rises, right falls']);
const RATIONAL_FEATURES = Object.freeze(['hole', 'verticalAsymptote', 'zero', 'none']);

const factorZero = (question, work) => withKey(
  () => {
    const coefficients = question.coefficients || DEFAULTS.factorZero.coefficients;
    const candidateRoot = Number(question.candidateRoot ?? DEFAULTS.factorZero.candidateRoot);
    const value = evaluatePolynomial(coefficients, candidateRoot);
    return { value, isFactor: Math.abs(value) < 1e-9 };
  },
  (key) => gradedResult({
    parts: [
      numberPart('value', 'P(r)', work.value, key.value),
      choicePart('factor', 'Is (x − r) a factor?', work.factorChoice, YES_NO, key.isFactor ? 'yes' : 'no'),
    ],
  }),
);

const CELL_LABELS = Object.freeze(['Area cell 1 (x² term)', 'Area cell 2 (x term)', 'Area cell 3 (x term)', 'Area cell 4 (constant)']);

const multiplyArea = (question, work) => withKey(
  () => {
    const left = question.leftBinomial || DEFAULTS.multiplyArea.leftBinomial;
    const right = question.rightBinomial || DEFAULTS.multiplyArea.rightBinomial;
    return {
      cells: [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]],
      product: polynomialMultiply(left, right),
    };
  },
  (key) => {
    const cells = Array.isArray(work.cells) ? work.cells : [];
    return gradedResult({
      parts: [
        ...key.cells.map((expected, index) => numberPart(`cell-${index + 1}`, CELL_LABELS[index], cells[index], expected)),
        // Highest degree first, term by term: "-12, -5, 2" is not 2x² − 5x − 12.
        listPart('expanded', 'Expanded coefficients', work.expanded, key.product),
      ],
    });
  },
);

const factorQuadratic = (question, work) => withKey(
  () => integerFactorPairForMonicQuadratic(question.coefficients || DEFAULTS.factorQuadratic.coefficients),
  (expected) => {
    const p = parseNumericAnswer(entry(work.p));
    const q = parseNumericAnswer(entry(work.q));
    // p and q in either order; a quadratic with no integer factor pair can
    // never be matched, exactly as on screen.
    const correct = Boolean(expected) && p !== null && q !== null && sameNumberMultiset([p, q], expected, 0.01);
    const complete = filled(work.p) && filled(work.q);
    return gradedResult({
      isComplete: complete,
      parts: [{ id: 'factor-pair', label: 'Factor pair p, q', isComplete: complete, isCorrect: correct, response: `${entry(work.p)}, ${entry(work.q)}` }],
    });
  },
);

const division = (question, work) => withKey(
  () => polynomialLongDivide(question.dividend || DEFAULTS.division.dividend, question.divisor || DEFAULTS.division.divisor),
  (result) => gradedResult({
    parts: [
      listPart('quotient', 'Quotient coefficients', work.quotient, result.quotient),
      listPart('remainder', 'Remainder coefficients', work.remainder, result.remainder),
    ],
  }),
);

const graphConnection = (question, work) => withKey(
  () => {
    const roots = question.roots || DEFAULTS.graphConnection.roots;
    const leadingCoefficient = Number(question.leadingCoefficient ?? DEFAULTS.graphConnection.leadingCoefficient);
    const coefficients = coefficientsFromRoots(roots, leadingCoefficient);
    const targetEntry = graphConnectionTargetEntry(roots, question.targetRoot);
    return { behavior: factorBehaviorAtRoot(targetEntry.multiplicity), end: endBehavior(coefficients).label };
  },
  (key) => gradedResult({
    parts: [
      choicePart('behavior', 'At the target zero', work.behavior, BEHAVIORS, key.behavior),
      choicePart('end-behavior', 'End behavior', work.end, END_BEHAVIORS, key.end),
    ],
  }),
);

const rationalFeatures = (question, work) => withKey(
  () => {
    const features = rationalFeatureMap({
      numeratorRoots: question.numeratorRoots || DEFAULTS.rationalFeatures.numeratorRoots,
      denominatorRoots: question.denominatorRoots || DEFAULTS.rationalFeatures.denominatorRoots,
    });
    return rationalFeatureTypeAt(features, rationalFeatureTargetValue(features, question.targetValue));
  },
  (expected) => gradedResult({
    parts: [choicePart('feature', 'Feature at the target value', work.choice, RATIONAL_FEATURES, expected)],
  }),
);

export default bindToolGrader(declaration, 'polynomialWorkshop', {
  factorZero,
  multiplyArea,
  factorQuadratic,
  division,
  graphConnection,
  rationalFeatures,
});
