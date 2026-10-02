/*
 * Shared grader for the `exponentialLogBridge` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from ExponentialLogBridge.jsx: the same per-view
 * defaults for an unauthored question (equivalentForms 2³; solveExponential
 * 2^(2x − 1) = 16; solveLogarithmic log₃(2x + 1) = 2 — base 3, not 2;
 * inverse and composition on f(x) = 2^x with x = 2 and x = 1, and y = f(x + 1)
 * unless `y` or `inverseSeedX` is authored), the same exponential/log
 * mathematics (exponentialLogMath.mjs), the same number reading (Number(), so
 * "1/2" and the U+2212 minus are NOT read, exactly as the bridge never read
 * them), the same 0.01 tolerance, and the same score — the share of checks
 * that are right.
 *
 * Completeness: every typed box is non-blank, and the inverse view's domain
 * <select> has left its "Choose…" placeholder.
 */
import declaration from '../declarations/exponentialLogBridge.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { nearlyEqual } from '../../toolMath/shared/toolMath.mjs';
import {
  composeForwardAfterInverse,
  composeInverseAfterForward,
  equivalentExpLogValues,
  inversePairFeatures,
  normalizeExponentialSpec,
  solveExponentialLinearExponent,
  solveLogLinearArgument,
  transformedExponentialValue,
} from '../../toolMath/exponentialLog/exponentialLogMath.mjs';

const TOLERANCE = 0.01;

// A typed box holds a string (a number reads the same way). Any other type is
// not something the bridge's inputs can produce, so it counts as no entry.
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => entry(value).trim() !== '';

// The bridge's own rule: a blank box never matches, and the number is read
// with Number() inside nearlyEqual.
const numberPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: filled(value) && nearlyEqual(entry(value), expected, TOLERANCE),
  response: entry(value),
});

/*
 * A question the bridge cannot render (base 1, a = 0, m = 0) throws inside
 * the exponential mathematics, and the screen never reaches its Check. The
 * server says so instead of blaming the student's work.
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

// ExponentialLogBridge.jsx expSpecFromQuestion: an authored `function`, else
// `exponential`, else the flat a / base / h / k fields with their defaults.
const exponentialSpec = (question) => normalizeExponentialSpec(question.function || question.exponential || {
  a: question.a ?? 1,
  base: question.base ?? 2,
  h: question.h ?? 0,
  k: question.k ?? 0,
});

const equivalentForms = (question, work) => withKey(
  () => equivalentExpLogValues({ base: Number(question.base ?? 2), exponent: Number(question.exponent ?? 3) }),
  (values) => gradedResult({
    parts: [
      numberPart('logarithm', 'Logarithmic form', work.logAnswer, values.exponent),
      numberPart('power', 'Exponential form', work.expAnswer, values.value),
    ],
  }),
);

const solveExponential = (question, work) => withKey(
  () => solveExponentialLinearExponent({
    base: Number(question.equation?.base ?? question.base ?? 2),
    m: Number(question.equation?.m ?? 2),
    c: Number(question.equation?.c ?? -1),
    rhs: Number(question.equation?.rhs ?? 16),
  }),
  // A non-positive right side has no real solution: NaN matches no typed box.
  (solution) => gradedResult({
    parts: [
      numberPart('x', 'x', work.xAnswer, solution.x),
      numberPart('exponent', 'Exponent value', work.exponentAnswer, solution.exponentValue),
    ],
  }),
);

const solveLogarithmic = (question, work) => withKey(
  () => solveLogLinearArgument({
    base: Number(question.equation?.base ?? question.base ?? 3),
    m: Number(question.equation?.m ?? 2),
    c: Number(question.equation?.c ?? 1),
    result: Number(question.equation?.result ?? 2),
  }),
  (solution) => gradedResult({
    parts: [
      numberPart('argument', 'Required argument value', work.argumentAnswer, solution.argumentValue),
      numberPart('x', 'x', work.xAnswer, solution.x),
    ],
  }),
);

const DOMAIN_SIDES = Object.freeze(['greater', 'less']);

const inverse = (question, work) => withKey(
  () => ({ sampleX: Number(question.x ?? 2), features: inversePairFeatures(exponentialSpec(question)) }),
  ({ sampleX, features }) => {
    const side = typeof work.domainSide === 'string' && DOMAIN_SIDES.includes(work.domainSide) ? work.domainSide : '';
    return gradedResult({
      parts: [
        // f⁻¹(f(x₀)) is the original input x₀.
        numberPart('inverse-value', 'Inverse value', work.inverseAnswer, sampleX),
        numberPart('asymptote', 'Inverse vertical asymptote', work.asymptote, features.logarithmVerticalAsymptote),
        {
          id: 'domain-side',
          label: 'Inverse domain',
          isComplete: side !== '',
          isCorrect: side !== '' && side === features.logarithmDomainSide,
          response: side,
        },
      ],
    });
  },
);

const composition = (question, work) => withKey(
  () => {
    const spec = exponentialSpec(question);
    const x = Number(question.x ?? 1);
    const defaultY = transformedExponentialValue(spec, Number(question.inverseSeedX ?? x + 1));
    const y = Number(question.y ?? defaultY);
    // A y outside the logarithm's domain composes to NaN: no box matches it.
    return { expectedX: composeInverseAfterForward(spec, x), expectedY: composeForwardAfterInverse(spec, y) };
  },
  ({ expectedX, expectedY }) => gradedResult({
    parts: [
      numberPart('inverse-after-forward', 'f⁻¹(f(x))', work.inverseAfterForward, expectedX),
      numberPart('forward-after-inverse', 'f(f⁻¹(y))', work.forwardAfterInverse, expectedY),
    ],
  }),
);

export default bindToolGrader(declaration, 'exponentialLogBridge', {
  equivalentForms,
  solveExponential,
  solveLogarithmic,
  inverse,
  composition,
});
