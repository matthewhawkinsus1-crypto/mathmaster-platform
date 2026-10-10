// Question family: data, regression, exponential/log and expression meaning: dataModelingLab, regressionCalculator, exponentialLogBridge, expressionMeaning, complexPlaneLab, representationMatch.
//
// Contract (./index.js):
//   matches(question)            → true when this family can help with the question
//   hints(question)              → hint sentences, least to most specific, built from
//                                  the question's OWN numbers; never the answer
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers whose answer is
//                                  not this question's answer
//   expectedValues(question)     → this question's answer value(s) as text, so the runtime
//                                  guard (hintRevealsAnswer) can drop a hint that leaks one
//   backUpQuestion(question)     → { prompt, options: [text, text], correct } | null
//                                  the inclusion "Let's back up" check: one quick
//                                  question about THIS problem's first move (never its
//                                  answer); null keeps the platform's generic one
// `implemented` stays false until the family is real: the index skips it.
//
// WHAT THIS FAMILY OWNS (last in the index order; none of the nine families
// before it claims these tool types). Every answer is computed from the SAME
// authored fields, defaults and mathematics the tool's shared grader reads
// (functions/shared/serverGrading/tools/<tool>.mjs and its toolMath):
//
//   complex      `complexPlaneLab`, every mode (features, operations add /
//                subtract / multiply, division, powers, rotation,
//                quadraticRoots), worked in exact rationals. Components must be
//                decimals of at most two places (the lab displays two).
//   expLog       `exponentialLogBridge`: equivalentForms (integer exponent),
//                solveExponential (the right side an integer power of the
//                base), solveLogarithmic (integer result), inverse and
//                composition (an untyped or `type: 'exponential'` function —
//                the grader reads only a, base, h, k, so a V5-compiled linear
//                spec is NOT read as the author's exponential), exactly.
//   regression   `regressionCalculator`, data and scatterplot sources: the
//                grader's own regression (regressionCalculatorStats) and its
//                direction / strength cut-offs (0.1, 0.5, 0.8).
//   dataModel    `dataModelingLab` modes correlation, lineFit, linearFit,
//                quadraticFit, exponentialFit, every *FitPrediction mode,
//                prediction and modelCompare: the lab's own regressions
//                (dataModelingMath), required parts (dataModelingPlan), model
//                choice and tolerances.
//
// NOT CLAIMED (matches → false), because they cannot be explained correctly:
//   - `expressionMeaning`: its answers are authored words (a unit, a meaning,
//     a role) matched as text; nothing in the item lets a hint or a sibling be
//     derived or checked mathematically.
//   - `representationMatch`: its answers are authored set ids and card
//     placements (often ordinary words such as "linear"), and its linear card
//     sort is line work that belongs with linesAndSlope.
//   - dataModelingLab `full` and `association` (the causation verdict is an
//     authored flag the data cannot decide), and an unrecognised mode; a
//     modelCompare / prediction item whose authored model is not the lab's
//     unique best fit; a forced family the lab cannot fit to the data.
//   - exponentialLogBridge with no real solution, a right side that is not an
//     integer power of the base, a non-integer exponent or result, a typed
//     non-exponential function, or an unknown mode; complexPlaneLab with an
//     unknown mode or operation, a power below 2 or above 8, or a zero
//     denominator.
//
// SAFETY.
//   - Every hint and back-up text is written twice: a spelling that quotes
//     this problem's own givens and a PLAIN spelling with no digits and no
//     choice word. The numbered spelling is used unless it leaks: the
//     platform's guard (hintRevealsAnswer against expectedValues, every choice
//     word of the task and the plain keys) or a number in it that lies within
//     the grader's tolerance of an answer (|n| against |answer|, so a quoted
//     data value that the grader would accept as a coefficient is caught). The
//     plain spelling cannot leak, so no rung is ever dropped and whether a rung
//     appears never depends on the answer.
//   - No hint, back-up or sibling names a verdict a student can choose — a
//     correlation direction or strength, a cause/association conclusion, a
//     model family where the family is the answer, interpolation or
//     extrapolation, an inverse-domain side, a net-rotation label — so the
//     ladder and the sibling's availability never depend on which is right.
//   - expectedValues lists what the student must FIND, in every spelling a
//     hint could use (exact fractions, \frac, terminating decimals, the
//     roundings a student or the tool would show, radicals, complex numbers,
//     unicode minus, ordered pairs, fitted equations, the true choice words).
//   - The worked sibling is new numbers drawn deterministically from the seed
//     and this question's own numbers, worked completely and exactly (fits on
//     data that lie exactly on the model, least-squares sums done by hand in
//     exact rationals), and offered only when its prompt, steps and answer
//     avoid this question's answers and every choice word, and when no number
//     its answer states is one the grader would accept for this question.
//   - Model choice is explained with the question's OWN modelMetric (MAE, or
//     RMSE for rmse / sse, which rank alike), so following the ladder lands on
//     the family the grader marks; a prediction item is claimed only when any
//     family tying the best gives predictions the grader accepts too.
//
// Pure: no React, no I/O.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import {
  ONE,
  ZERO,
  absolute,
  add,
  divide,
  equals,
  isInteger,
  isZero,
  multiply,
  negate,
  rational,
  rationalLatex,
  rationalText,
  subtract,
  toNumber,
} from '../../../../functions/shared/questionFamilyExact.mjs';
import { correlation, linearRegression } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  formatCorrelation,
  predictionKind,
} from '../../../../functions/shared/toolMath/dataModeling/dataModelingMath.mjs';
import {
  FORCED_FIT_MODELS,
  dataModelingFixedPredictionTarget,
  dataModelingPoints,
  dataModelingRequiredParts,
  exploratoryLineFitPlan,
  lineFitNamesPrediction,
  resolveDataModelingMode,
} from '../../../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';
import { cleanRegressionPoints, regressionCalculatorStats } from '../../../../functions/shared/pathRegressionCalculatorGrading.mjs';

export const family = 'dataAndModels';
export const implemented = true;

/* ---------------------------------------------------------------------------
 * Small helpers.
 * ------------------------------------------------------------------------- */

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const typeOf = (question) => text(question?.type) || text(question?.toolId);
const product = (...lists) => lists.reduce((acc, values) => acc.flatMap((prefix) => values.map((value) => [...prefix, value])), [[]]);

const hash = (value) => {
  let h = 2166136261;
  for (const character of String(value)) {
    h ^= character.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/* ---------------------------------------------------------------------------
 * Numbers and their spellings.
 * ------------------------------------------------------------------------- */

/** A float rounded to `places`, as text, with no trailing zeros and no "-0". */
const fixed = (value, places) => {
  const rounded = Number(Number(value).toFixed(places));
  return String(Object.is(rounded, -0) || rounded === 0 ? 0 : rounded);
};
const withUnicodeMinus = (value) => (value.includes('-') ? [value, value.replace(/-/g, '−')] : [value]);
/** A float rounded to `places`, with its trailing zeros kept ("0.80"), and no "-0.00". */
const padded = (value, places) => {
  const rounded = Number(value).toFixed(places);
  return Number(rounded) === 0 ? rounded.replace('-', '') : rounded;
};
/** The roundings a student or the tool would show, with and without trailing zeros ("0.8", "0.80"). */
const roundingForms = (value, places = [2, 3, 4]) => unique(places.flatMap((p) => [fixed(value, p), padded(value, p)]).flatMap(withUnicodeMinus));

const DECIMAL_DENOMINATORS = Object.freeze([1, 2, 4, 5, 10, 20, 25, 50, 100]);
/** An authored number as an exact decimal of at most two places, or null. */
const readDecimal = (value) => {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1e6) return null;
  for (const d of DECIMAL_DENOMINATORS) {
    const n = Math.round(number * d);
    if (Math.abs(n / d - number) <= 1e-9) return rational(n, d);
  }
  return null;
};
const R = (value) => readDecimal(value);

const decimalOf = (value) => {
  let d = value.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1 ? String(Number((value.n / value.d).toFixed(10))) : '';
};
/** "3", "-3", "0.5", "1/3" — ASCII minus, so the guard's numeric boundaries read it. */
const show = (value) => (value.d === 1 ? String(value.n) : decimalOf(value) || rationalText(value));
const paren = (value) => (value.n < 0 ? `(${show(value)})` : show(value));
const isNegative = (value) => value.n < 0;

/** Every spelling of one exact number a hint could contain. */
const rationalForms = (value) => {
  const forms = [rationalText(value), rationalLatex(value)];
  const decimal = decimalOf(value);
  if (decimal) {
    forms.push(decimal);
    if (/^-?0\./.test(decimal)) forms.push(decimal.replace('0.', '.'));
  }
  // Its roundings, and its decimal places written out ("5.00", "0.50").
  forms.push(...roundingForms(toNumber(value)));
  return unique(forms.flatMap(withUnicodeMinus));
};

const powR = (base, exponent) => {
  let result = ONE;
  const factor = exponent < 0 ? divide(ONE, base) : base;
  for (let index = 0; index < Math.abs(exponent); index += 1) result = multiply(result, factor);
  return result;
};
/** The integer k with base^k = value exactly (|k| ≤ 12), or null. */
const intLog = (base, value) => {
  for (let k = -12; k <= 12; k += 1) {
    try {
      if (equals(powR(base, k), value)) return k;
    } catch { /* too large to be the answer */ }
  }
  return null;
};

const perfectSquare = (n) => {
  if (n < 0) return null;
  const root = Math.round(Math.sqrt(n));
  return root * root === n ? root : null;
};
const sqrtRational = (value) => {
  const p = perfectSquare(value.n);
  const q = perfectSquare(value.d);
  return p !== null && q !== null ? rational(p, q) : null;
};
/** n = outside² · inside with inside square-free. */
const simplifyRadical = (n) => {
  let outside = 1;
  let inside = n;
  for (let f = 2; f * f <= inside; f += 1) {
    while (inside % (f * f) === 0) {
      inside /= f * f;
      outside *= f;
    }
  }
  return [outside, inside];
};
/** Every spelling of √value (value a rational ≥ 0). */
const radicalForms = (value) => {
  const root = sqrtRational(value);
  if (root) return rationalForms(root);
  const forms = [...roundingForms(Math.sqrt(toNumber(value)))];
  if (value.d === 1 && value.n <= 1e12) {
    const [outside, inside] = simplifyRadical(value.n);
    forms.push(`√${value.n}`, `√(${value.n})`, `sqrt(${value.n})`, `\\sqrt{${value.n}}`);
    if (outside > 1) forms.push(`${outside}√${inside}`, `${outside}\\sqrt{${inside}}`, `${outside}sqrt(${inside})`);
  }
  return unique(forms);
};

/* ---------------------------------------------------------------------------
 * Answers: a value the grader accepts within `tol`, and its spellings.
 * ------------------------------------------------------------------------- */

const answer = (value, tol, forms) => ({ value: Number(value), tol: Math.abs(Number(tol)) || 0, forms: unique(forms) });
const exactAnswer = (value, tol) => answer(toNumber(value), tol, rationalForms(value));
const floatAnswer = (value, tol, extra = []) => {
  const forms = [...roundingForms(value), ...extra];
  const nearest = Math.round(value);
  if (Math.abs(nearest - value) <= Math.max(tol, 1e-9)) forms.push(...withUnicodeMinus(String(nearest)));
  return answer(value, tol, forms);
};

const pairForms = (points) => unique(points.flatMap(([x, y]) => [`(${fixed(x, 6)}, ${fixed(y, 6)})`, `(${fixed(x, 6)},${fixed(y, 6)})`]).flatMap(withUnicodeMinus));

/* ---------------------------------------------------------------------------
 * complexPlaneLab
 * ------------------------------------------------------------------------- */

const COMPLEX_MODES = Object.freeze(['features', 'operations', 'division', 'powers', 'rotation', 'quadraticRoots']);
const COMPLEX_TOL = 0.01;
export const ROTATION_LABELS = Object.freeze(['No net rotation', '90° counterclockwise', '180°', '90° clockwise']);

const cx = (re, im) => ({ re, im });
const cAdd = (a, b) => cx(add(a.re, b.re), add(a.im, b.im));
const cSub = (a, b) => cx(subtract(a.re, b.re), subtract(a.im, b.im));
const cMul = (a, b) => cx(subtract(multiply(a.re, b.re), multiply(a.im, b.im)), add(multiply(a.re, b.im), multiply(a.im, b.re)));
const cConj = (a) => cx(a.re, negate(a.im));
const cNorm2 = (a) => add(multiply(a.re, a.re), multiply(a.im, a.im));
const cEq = (a, b) => equals(a.re, b.re) && equals(a.im, b.im);

/** "3 - 4i", "-i", "2i", "5" — ASCII. */
const cText = ({ re, im }) => {
  if (isZero(im)) return show(re);
  const size = absolute(im);
  const imaginary = equals(size, ONE) ? 'i' : `${show(size)}i`;
  if (isZero(re)) return isNegative(im) ? `-${imaginary}` : imaginary;
  return `${show(re)} ${isNegative(im) ? '-' : '+'} ${imaginary}`;
};
const cForms = (value) => {
  const spaced = cText(value);
  return unique([spaced, spaced.replace(/\s+/g, '')].filter((form) => form.length >= 3).flatMap(withUnicodeMinus));
};

/** A complex input as the lab reads it (`value || fallback`, missing parts 0), exactly. */
const readComplex = (value, fallback) => {
  const source = value || fallback;
  if (!isObject(source)) return null;
  const re = R(source.re ?? 0);
  const im = R(source.im ?? 0);
  return re && im ? cx(re, im) : null;
};

const iPower = (turns) => [cx(ONE, ZERO), cx(ZERO, ONE), cx(rational(-1), ZERO), cx(ZERO, rational(-1))][turns];

const quadText = (a, b, c) => {
  const lead = equals(a, ONE) ? 'x²' : equals(a, rational(-1)) ? '-x²' : `${show(a)}x²`;
  const middle = isZero(b) ? '' : ` ${isNegative(b) ? '-' : '+'} ${equals(absolute(b), ONE) ? '' : show(absolute(b))}x`;
  const tail = isZero(c) ? '' : ` ${isNegative(c) ? '-' : '+'} ${show(absolute(c))}`;
  return `${lead}${middle}${tail} = 0`;
};

const complexModel = (question) => {
  const mode = question.mode === undefined || question.mode === null || question.mode === '' ? 'features' : question.mode;
  if (!COMPLEX_MODES.includes(mode)) return null;
  const base = { shape: 'complex', mode, answers: [], words: [], banned: [] };
  if (mode === 'features') {
    const z = readComplex(question.z, { re: 3, im: -4 });
    if (!z) return null;
    const n2 = cNorm2(z);
    return {
      ...base,
      kind: 'complex.features',
      z,
      answers: [
        answer(Math.sqrt(toNumber(n2)), COMPLEX_TOL, radicalForms(n2)),
        exactAnswer(z.re, COMPLEX_TOL),
        exactAnswer(negate(z.im), COMPLEX_TOL),
      ],
      extraForms: cForms(cConj(z)),
    };
  }
  if (mode === 'operations') {
    const operation = question.operation || 'multiply';
    if (!['add', 'subtract', 'multiply'].includes(operation)) return null;
    const z = readComplex(question.z, { re: 2, im: 3 });
    const w = readComplex(question.w, { re: -1, im: 2 });
    if (!z || !w) return null;
    const result = operation === 'add' ? cAdd(z, w) : operation === 'subtract' ? cSub(z, w) : cMul(z, w);
    return { ...base, kind: `complex.${operation}`, operation, z, w, result, answers: [exactAnswer(result.re, COMPLEX_TOL), exactAnswer(result.im, COMPLEX_TOL)], extraForms: cForms(result) };
  }
  if (mode === 'division') {
    const z = readComplex(question.z, { re: 4, im: 2 });
    const w = readComplex(question.w, { re: 1, im: -1 });
    if (!z || !w) return null;
    const denominator = cNorm2(w);
    if (isZero(denominator)) return null;
    const numerator = cMul(z, cConj(w));
    const result = cx(divide(numerator.re, denominator), divide(numerator.im, denominator));
    return {
      ...base,
      kind: 'complex.division',
      z,
      w,
      result,
      answers: [exactAnswer(w.re, COMPLEX_TOL), exactAnswer(negate(w.im), COMPLEX_TOL), exactAnswer(result.re, COMPLEX_TOL), exactAnswer(result.im, COMPLEX_TOL)],
      extraForms: [...cForms(result), ...cForms(cConj(w))],
    };
  }
  if (mode === 'powers') {
    const z = readComplex(question.z, { re: 1, im: 1 });
    const exponent = Number(question.exponent ?? 3);
    if (!z || !Number.isInteger(exponent) || exponent < 2 || exponent > 8) return null;
    if (toNumber(absolute(z.re)) > 20 || toNumber(absolute(z.im)) > 20) return null;
    let result = cx(ONE, ZERO);
    for (let index = 0; index < exponent; index += 1) result = cMul(result, z);
    const n2 = cNorm2(z);
    const magnitudeSquared = powR(n2, exponent);
    return {
      ...base,
      kind: 'complex.powers',
      z,
      exponent,
      result,
      answers: [
        exactAnswer(result.re, COMPLEX_TOL),
        exactAnswer(result.im, COMPLEX_TOL),
        answer(Math.sqrt(toNumber(magnitudeSquared)), 0.02, radicalForms(magnitudeSquared)),
      ],
      extraForms: cForms(result),
    };
  }
  if (mode === 'rotation') {
    const z = readComplex(question.z, { re: 3, im: 1 });
    const quarterTurns = Number(question.quarterTurns ?? 1);
    if (!z || !Number.isInteger(quarterTurns) || Math.abs(quarterTurns) > 40) return null;
    const turns = ((quarterTurns % 4) + 4) % 4;
    const result = cMul(z, iPower(turns));
    const label = ROTATION_LABELS[turns];
    return {
      ...base,
      kind: 'complex.rotation',
      z,
      quarterTurns,
      turns,
      result,
      answers: [exactAnswer(result.re, COMPLEX_TOL), exactAnswer(result.im, COMPLEX_TOL)],
      words: unique([label, label.toLowerCase(), label.replace('°', ' degrees')]),
      banned: unique(ROTATION_LABELS.flatMap((entry) => [entry, entry.replace('°', ' degrees')])),
      extraForms: cForms(result),
    };
  }
  // quadraticRoots
  const a = R(question.quadratic?.a ?? 1);
  const b = R(question.quadratic?.b ?? 2);
  const c = R(question.quadratic?.c ?? 5);
  if (!a || !b || !c || isZero(a)) return null;
  const D = subtract(multiply(b, b), multiply(rational(4), multiply(a, c)));
  const twoA = multiply(rational(2), a);
  const realPart = divide(negate(b), twoA);
  const answers = [];
  const extraForms = [];
  let roots;
  if (isNegative(D)) {
    const size = negate(D);
    const exactRoot = sqrtRational(size);
    const imagValue = Math.sqrt(toNumber(size)) / Math.abs(toNumber(twoA));
    answers.push(exactAnswer(realPart, COMPLEX_TOL));
    if (exactRoot) {
      const imag = absolute(divide(exactRoot, twoA));
      // The student types each root's SIGNED imaginary part (r1Im, r2Im): both signs are answers.
      answers.push(exactAnswer(imag, COMPLEX_TOL), exactAnswer(negate(imag), COMPLEX_TOL));
      extraForms.push(...cForms(cx(realPart, imag)), ...cForms(cx(realPart, negate(imag))));
      const imagText = equals(imag, ONE) ? 'i' : `${show(imag)}i`;
      extraForms.push(...withUnicodeMinus(`${show(realPart)} ± ${imagText}`), ...withUnicodeMinus(`${show(realPart)}±${imagText}`));
      roots = [cx(realPart, imag), cx(realPart, negate(imag))];
    } else {
      answers.push(answer(imagValue, COMPLEX_TOL, roundingForms(imagValue)), answer(-imagValue, COMPLEX_TOL, roundingForms(-imagValue)));
      roots = [{ re: toNumber(realPart), im: imagValue }, { re: toNumber(realPart), im: -imagValue }];
    }
  } else {
    const exactRoot = sqrtRational(D);
    if (exactRoot) {
      const r1 = divide(add(negate(b), exactRoot), twoA);
      const r2 = divide(subtract(negate(b), exactRoot), twoA);
      answers.push(exactAnswer(r1, COMPLEX_TOL), exactAnswer(r2, COMPLEX_TOL));
      roots = [cx(r1, ZERO), cx(r2, ZERO)];
    } else {
      const root = Math.sqrt(toNumber(D));
      const r1 = (toNumber(negate(b)) + root) / toNumber(twoA);
      const r2 = (toNumber(negate(b)) - root) / toNumber(twoA);
      answers.push(answer(r1, COMPLEX_TOL, roundingForms(r1)), answer(r2, COMPLEX_TOL, roundingForms(r2)));
      roots = [{ re: r1, im: 0 }, { re: r2, im: 0 }];
    }
    answers.push(answer(0, COMPLEX_TOL, roundingForms(0)));
  }
  return { ...base, kind: 'complex.quadraticRoots', a, b, c, D, roots, answers, extraForms };
};

/* ---------------------------------------------------------------------------
 * exponentialLogBridge
 * ------------------------------------------------------------------------- */

const EXP_LOG_MODES = Object.freeze(['equivalentForms', 'solveExponential', 'solveLogarithmic', 'inverse', 'composition']);
const EXP_LOG_TOL = 0.01;

const validBase = (base) => Boolean(base) && !isNegative(base) && !isZero(base) && !equals(base, ONE);

/** The function the grader reads (an authored `function`, else `exponential`, else flat fields). */
const readExponentialSpec = (question) => {
  const source = question.function || question.exponential;
  let raw;
  if (source) {
    if (!isObject(source)) return null;
    if (source.type !== undefined && source.type !== 'exponential') return null;
    raw = { a: source.a ?? 1, base: source.base ?? 2, h: source.h ?? 0, k: source.k ?? 0 };
  } else {
    raw = { a: question.a ?? 1, base: question.base ?? 2, h: question.h ?? 0, k: question.k ?? 0 };
  }
  const spec = { a: R(raw.a), base: R(raw.base), h: R(raw.h), k: R(raw.k) };
  if (!spec.a || !spec.h || !spec.k || isZero(spec.a) || !validBase(spec.base)) return null;
  return spec;
};

const baseText = (base) => (isInteger(base) ? show(base) : `(${show(base)})`);
const innerText = (h) => (isZero(h) ? 'x' : `x ${isNegative(h) ? '+' : '-'} ${show(absolute(h))}`);
/** "f(x) = 2·2^(x - 1) - 3" */
const fText = ({ a, base, h, k }) => {
  const lead = equals(a, ONE) ? '' : equals(a, rational(-1)) ? '-' : `${show(a)}·`;
  const tail = isZero(k) ? '' : ` ${isNegative(k) ? '-' : '+'} ${show(absolute(k))}`;
  return `f(x) = ${lead}${baseText(base)}^(${innerText(h)})${tail}`;
};
/** f at x, exactly, when x − h is an integer; else null. */
const fAt = ({ a, base, h, k }, x) => {
  const shift = subtract(x, h);
  if (!isInteger(shift) || Math.abs(shift.n) > 12) return null;
  return add(multiply(a, powR(base, shift.n)), k);
};
const linearText = (m, c) => {
  const lead = equals(m, ONE) ? 'x' : equals(m, rational(-1)) ? '-x' : `${show(m)}x`;
  return isZero(c) ? lead : `${lead} ${isNegative(c) ? '-' : '+'} ${show(absolute(c))}`;
};

const expLogModel = (question) => {
  const mode = question.mode || 'equivalentForms';
  if (!EXP_LOG_MODES.includes(mode)) return null;
  const base = { shape: 'expLog', mode, kind: `expLog.${mode}`, answers: [], words: [], banned: [], extraForms: [] };
  if (mode === 'equivalentForms') {
    const b = R(question.base ?? 2);
    const x = Number(question.exponent ?? 3);
    if (!validBase(b) || !Number.isInteger(x) || Math.abs(x) > 10) return null;
    const value = powR(b, x);
    return { ...base, b, x: rational(x), value, answers: [exactAnswer(rational(x), EXP_LOG_TOL), exactAnswer(value, EXP_LOG_TOL)] };
  }
  if (mode === 'solveExponential') {
    const eq = isObject(question.equation) ? question.equation : {};
    const b = R(eq.base ?? question.base ?? 2);
    const m = R(eq.m ?? 2);
    const c = R(eq.c ?? -1);
    const rhs = R(eq.rhs ?? 16);
    if (!validBase(b) || !m || isZero(m) || !c || !rhs || isNegative(rhs) || isZero(rhs)) return null;
    const k = intLog(b, rhs);
    if (k === null) return null;
    const x = divide(subtract(rational(k), c), m);
    return { ...base, b, m, c, rhs, k, x, answers: [exactAnswer(x, EXP_LOG_TOL), exactAnswer(rational(k), EXP_LOG_TOL)] };
  }
  if (mode === 'solveLogarithmic') {
    const eq = isObject(question.equation) ? question.equation : {};
    const b = R(eq.base ?? question.base ?? 3);
    const m = R(eq.m ?? 2);
    const c = R(eq.c ?? 1);
    const y = Number(eq.result ?? 2);
    if (!validBase(b) || !m || isZero(m) || !c || !Number.isInteger(y) || Math.abs(y) > 8) return null;
    const argument = powR(b, y);
    const x = divide(subtract(argument, c), m);
    return { ...base, b, m, c, y, argument, x, answers: [exactAnswer(argument, EXP_LOG_TOL), exactAnswer(x, EXP_LOG_TOL)] };
  }
  const spec = readExponentialSpec(question);
  if (!spec) return null;
  if (mode === 'inverse') {
    const x0 = R(question.x ?? 2);
    if (!x0) return null;
    const greater = !isNegative(spec.a);
    const kText = String(toNumber(spec.k));
    const labels = [`x > ${kText}`, `x < ${kText}`, `x>${kText}`, `x<${kText}`].flatMap(withUnicodeMinus);
    return {
      ...base,
      spec,
      x0,
      answers: [exactAnswer(x0, EXP_LOG_TOL), exactAnswer(spec.k, EXP_LOG_TOL)],
      words: unique([greater ? 'greater' : 'less', ...withUnicodeMinus(`x ${greater ? '>' : '<'} ${kText}`), ...withUnicodeMinus(`x${greater ? '>' : '<'}${kText}`)]),
      banned: unique(['greater', 'less', ...labels]),
    };
  }
  // composition
  const x = R(question.x ?? 1);
  if (!x) return null;
  let y;
  if (question.y !== undefined && question.y !== null) {
    y = R(question.y);
  } else {
    const seedX = R(question.inverseSeedX ?? toNumber(add(x, ONE)));
    y = seedX ? fAt(spec, seedX) : null;
  }
  if (!y) return null;
  const ratio = divide(subtract(y, spec.k), spec.a);
  if (isNegative(ratio) || isZero(ratio)) return null;
  return { ...base, spec, x, y, answers: [exactAnswer(x, EXP_LOG_TOL), exactAnswer(y, EXP_LOG_TOL)] };
};

/* ---------------------------------------------------------------------------
 * regressionCalculator
 * ------------------------------------------------------------------------- */

export const CORRELATION_WORDS = Object.freeze(['positive', 'negative', 'none', 'strong', 'moderate', 'weak', 'no clear direction']);
const REGRESSION_TOL = 0.0005;

/** The calculator grader's own reading of r (0.1 / 0.5 / 0.8). */
const calculatorDescriptor = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});
const capital = (word) => word.charAt(0).toUpperCase() + word.slice(1);

const regressionModel = (question) => {
  const points = cleanRegressionPoints(question.sourceData || question.points);
  const stats = regressionCalculatorStats(points);
  if (!stats || points.length < 3) return null;
  const scatter = question.sourceMode === 'scatterplot';
  const interpret = question.requireInterpretation !== false;
  const descriptor = calculatorDescriptor(stats.r);
  const answers = [
    floatAnswer(stats.r, REGRESSION_TOL, [stats.r.toFixed(4), ...withUnicodeMinus(stats.r.toFixed(4))]),
    floatAnswer(stats.m, REGRESSION_TOL, [stats.m.toFixed(4), stats.m.toFixed(5), fixed(stats.m, 5)]),
    floatAnswer(stats.b, REGRESSION_TOL, [stats.b.toFixed(4), stats.b.toFixed(5), fixed(stats.b, 5)]),
    floatAnswer(stats.r ** 2, REGRESSION_TOL, [(stats.r ** 2).toFixed(4)]),
  ];
  return {
    shape: 'regression',
    kind: scatter ? 'regression.scatterplot' : 'regression.data',
    points,
    stats,
    scatter,
    interpret,
    answers,
    extraForms: scatter ? pairForms(points) : [],
    words: interpret ? unique([descriptor.direction, capital(descriptor.direction), descriptor.strength, capital(descriptor.strength)]) : [],
    banned: [...CORRELATION_WORDS],
  };
};

/* ---------------------------------------------------------------------------
 * dataModelingLab
 * ------------------------------------------------------------------------- */

const DATA_MODES = Object.freeze([
  'correlation', 'lineFit', 'linearFit', 'quadraticFit', 'exponentialFit',
  'linearFitPrediction', 'quadraticFitPrediction', 'exponentialFitPrediction', 'squareRootFitPrediction',
  'prediction', 'modelCompare',
]);
export const MODEL_FAMILY_WORDS = Object.freeze(['linear', 'quadratic', 'exponential', 'square root', 'square-root', 'squareroot']);
export const PREDICTION_TYPE_WORDS = Object.freeze(['interpolation', 'extrapolation']);
const FAMILY_LABEL = Object.freeze({ linear: 'Linear', quadratic: 'Quadratic', exponential: 'Exponential', squareRoot: 'Square Root' });
const FORM_OF = Object.freeze({ linear: 'y = mx + b', quadratic: 'y = ax² + bx + c', exponential: 'y = a·bˣ', squareRoot: 'y = a√(x − h) + k' });

const tolerance = (expected, authored, floor, relative = 0.05) => {
  const explicit = Number(authored);
  if (authored !== undefined && authored !== null && Number.isFinite(explicit)) return Math.abs(explicit);
  const value = Number(expected);
  return Number.isFinite(value) ? Math.max(floor, Math.abs(value) * relative) : floor;
};

const signedTerm = (coefficient, variable, first = false) => {
  const value = Number(coefficient);
  const size = Math.abs(value);
  const body = variable ? `${size === 1 ? '' : fixed(size, 2)}${variable}` : fixed(size, 2);
  if (first) return value < 0 ? `-${body}` : body;
  return ` ${value < 0 ? '-' : '+'} ${body}`;
};
/** Fitted equations, 2-place coefficients: "y = 3x + 6", "y = 2x² - 3x + 1", "y = 6(1.5)^x". */
const equationForms = (family, model) => {
  let equation = '';
  if (family === 'linear') equation = `y = ${signedTerm(model.m, 'x', true)}${Number(fixed(model.b, 2)) ? signedTerm(model.b, '') : ''}`;
  if (family === 'quadratic') {
    equation = `y = ${signedTerm(model.a, 'x^2', true)}${Number(fixed(model.b, 2)) ? signedTerm(model.b, 'x') : ''}${Number(fixed(model.c, 2)) ? signedTerm(model.c, '') : ''}`;
  }
  if (family === 'exponential') equation = `y = ${fixed(model.a, 2)}(${fixed(model.base, 2)})^x`;
  if (!equation) return [];
  const forms = [equation, equation.replace(/\s+/g, '')];
  if (family === 'quadratic') forms.push(...forms.map((form) => form.replace(/x\^2/g, 'x²')));
  return unique(forms.flatMap(withUnicodeMinus));
};

const fitAnswers = (question, mode, family, model, regression, stepperPlan) => {
  if (family === 'quadratic') {
    return [
      floatAnswer(model.a, tolerance(model.a, question.quadraticATolerance, 0.03)),
      floatAnswer(model.b, tolerance(model.b, question.quadraticBTolerance, 0.08)),
      floatAnswer(model.c, tolerance(model.c, question.quadraticCTolerance, 0.2)),
    ];
  }
  if (family === 'exponential') {
    return [
      floatAnswer(model.a, tolerance(model.a, question.exponentialATolerance, 0.08)),
      floatAnswer(model.base, tolerance(model.base, question.exponentialBaseTolerance, 0.02, 0.03)),
    ];
  }
  if (family === 'squareRoot') {
    return [
      floatAnswer(model.a, tolerance(model.a, question.squareRootATolerance, 0.05)),
      floatAnswer(model.h, tolerance(model.h, question.squareRootHTolerance, 0.05, 0.02)),
      floatAnswer(model.k, tolerance(model.k, question.squareRootKTolerance, 0.08, 0.03)),
    ];
  }
  const slopeTol = Number(question.slopeTolerance ?? (stepperPlan ? stepperPlan.slope.tolerance : Math.max(0.2, Math.abs(regression.m) * 0.12)));
  const interceptTol = Number(question.interceptTolerance ?? (stepperPlan ? stepperPlan.intercept.tolerance : 0.8));
  return [floatAnswer(regression.m, slopeTol), floatAnswer(regression.b, interceptTol)];
};

const dataModel = (question) => {
  const mode = resolveDataModelingMode(question);
  if (!DATA_MODES.includes(mode)) return null;
  if (question.points !== undefined && !Array.isArray(question.points)) return null;
  const points = dataModelingPoints(question).map((pair) => (Array.isArray(pair) ? [Number(pair[0]), Number(pair[1])] : [Number.NaN, Number.NaN]));
  if (points.length < 3 || !points.every((pair) => pair.every(Number.isFinite))) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  if (new Set(xs).size < 3 || new Set(ys).size < 2) return null;
  const regression = linearRegression(points);
  const r = correlation(points);
  const candidates = buildCandidateModels(points, regression);
  const metric = question.modelMetric || 'rmse';
  if (!['rmse', 'mae', 'sse'].includes(metric)) return null;
  const best = chooseBestModel(candidates, metric);
  const forced = FORCED_FIT_MODELS[mode] || null;
  const expectedModelId = forced || question.expectedModel || best?.id || 'linear';
  const expectedModel = candidates.find((candidate) => candidate.id === expectedModelId);
  if (!expectedModel || !best) return null;
  if (forced === 'exponential' && ys.some((y) => y <= 0)) return null;
  const parts = dataModelingRequiredParts(mode, question);

  // The model the student is told to use must be the one the lab marks: the
  // authored family must be the lab's best fit (ties within rounding count),
  // and a model choice must have ONE clear best.
  if (!forced && (parts.includes('modelChoice') || parts.includes('prediction'))) {
    const scale = Math.max(1, ...ys.map(Math.abs));
    if (expectedModel.metrics[metric] > best.metrics[metric] + 1e-9 * scale) return null;
    if (parts.includes('modelChoice')) {
      if (expectedModelId !== best.id) return null;
      const others = candidates.filter((candidate) => candidate.id !== best.id && Number.isFinite(candidate.metrics[metric]));
      if (others.some((candidate) => candidate.metrics[metric] <= best.metrics[metric] * 1.01 + 1e-6 * scale)) return null;
    }
  }

  const stepper = mode === 'lineFit';
  const stepperPlan = stepper
    ? exploratoryLineFitPlan({
      targetSlope: regression.m,
      targetIntercept: regression.b,
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
      slopeTolerance: question.slopeTolerance,
      interceptTolerance: question.interceptTolerance,
      slopeStep: question.slopeStep,
      interceptStep: question.interceptStep,
      challengeClicks: question.fitChallengeClicks,
    })
    : null;
  const fitFamily = forced || 'linear';
  const model = {
    shape: 'dataModel',
    kind: `dataModel.${mode}`,
    mode,
    points,
    regression,
    r,
    metric,
    candidates,
    best,
    expectedModel,
    fitFamily,
    parts,
    stepper,
    answers: [],
    words: [],
    banned: [],
    extraForms: [],
  };
  if (parts.includes('fit')) {
    const fitted = fitFamily === 'linear' ? regression : expectedModel.model;
    if (!Object.values(fitted).every((value) => Number.isFinite(Number(value)))) return null;
    model.answers.push(...fitAnswers(question, mode, fitFamily, fitted, regression, stepperPlan));
    model.extraForms.push(...equationForms(fitFamily, fitted));
  }
  if (parts.includes('correlation')) {
    if (!Number.isFinite(r)) return null;
    const tol = Number(question.correlationTolerance ?? 0.03);
    model.answers.push(floatAnswer(r, tol, [formatCorrelation(r), ...withUnicodeMinus(formatCorrelation(r))]));
  }
  if (parts.includes('correlationInterpretation')) {
    const descriptor = correlationDescriptor(r);
    const directionLabel = descriptor.direction === 'none' ? 'No clear direction' : capital(descriptor.direction);
    model.words.push(descriptor.direction, directionLabel, descriptor.strength, capital(descriptor.strength));
    model.banned.push(...CORRELATION_WORDS);
  }
  if (parts.includes('modelChoice')) {
    model.words.push(expectedModelId, FAMILY_LABEL[expectedModelId]);
    model.banned.push(...MODEL_FAMILY_WORDS);
  }
  if (parts.includes('prediction')) {
    const lineFitPrediction = lineFitNamesPrediction(mode, question);
    const fixedTarget = dataModelingFixedPredictionTarget(mode, question);
    const predictionX = fixedTarget ? Number(question.predictionX) : Number(question.predictionX ?? Math.ceil(Math.max(...xs, 1) + 1));
    if (!Number.isFinite(predictionX)) return null;
    const expected = lineFitPrediction ? regression.m * predictionX + regression.b : expectedModel.predict(predictionX);
    if (!Number.isFinite(expected)) return null;
    const tol = Number(question.predictionTolerance ?? Math.max(0.5, Math.abs(expected) * 0.08));
    model.answers.push(floatAnswer(expected, tol));
    if (!forced && !lineFitPrediction) {
      // A family that ties the lab's best (within 1%) is one a student who
      // follows "use the smallest error" may pick. Claim the item only when
      // that family's predictions are ones the grader accepts too — at this x
      // and, when the student picks x, at every data x and just beyond — and
      // list its prediction here as an answer as well.
      const scale = Math.max(1, ...ys.map(Math.abs));
      const checkXs = fixedTarget ? [predictionX] : [predictionX, ...xs, Math.max(...xs) + 1, Math.max(...xs) + 2];
      const rivals = candidates.filter((candidate) => candidate.id !== expectedModel.id && Number.isFinite(candidate.metrics[metric])
        && candidate.metrics[metric] <= best.metrics[metric] * 1.01 + 1e-6 * scale);
      for (const rival of rivals) {
        const agrees = checkXs.every((x) => {
          const mine = expectedModel.predict(x);
          const theirs = rival.predict(x);
          const window = Number(question.predictionTolerance ?? Math.max(0.5, Math.abs(mine) * 0.08));
          return Number.isFinite(mine) && Number.isFinite(theirs) && Math.abs(theirs - mine) <= window;
        });
        if (!agrees) return null;
        model.answers.push(floatAnswer(rival.predict(predictionX), tol));
      }
    }
    model.prediction = { x: predictionX, fixedTarget, asksType: !lineFitPrediction, value: expected, kind: predictionKind(points, predictionX) };
    if (!lineFitPrediction) {
      model.words.push(model.prediction.kind, capital(model.prediction.kind));
      model.banned.push(...PREDICTION_TYPE_WORDS);
    }
  }
  model.words = unique(model.words);
  model.banned = unique(model.banned);
  return model;
};

/* ---------------------------------------------------------------------------
 * The model of one question; null = not ours.
 * ------------------------------------------------------------------------- */

const modelFor = (question) => {
  if (!isObject(question)) return null;
  try {
    const type = typeOf(question);
    if (type === 'complexPlaneLab') return complexModel(question);
    if (type === 'exponentialLogBridge') return expLogModel(question);
    if (type === 'regressionCalculator') return regressionModel(question);
    if (type === 'dataModelingLab') return dataModel(question);
  } catch { /* a question this family cannot read is not its question */ }
  return null;
};

export const matches = (question) => Boolean(modelFor(question));

/** Which sub-kind this family reads the question as (tests and diagnostics). */
export const questionKind = (question) => modelFor(question)?.kind || null;

/* ---------------------------------------------------------------------------
 * expectedValues and the guard.
 * ------------------------------------------------------------------------- */

const expectedFor = (model) => unique([...model.answers.flatMap((entry) => entry.forms), ...(model.extraForms || []), ...model.words]);

export const expectedValues = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    return expectedFor(model);
  } catch {
    return [];
  }
};

/** The plain keys the platform guard also reads (questionAnswerValues), without the family. */
const rawKeyTexts = (question = {}) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 2 && value.every((entry) => typeof entry === 'number')) values.push(`(${value[0]}, ${value[1]})`, `(${value[0]},${value[1]})`);
      return;
    }
    if (typeof value !== 'object') values.push(text(value));
  };
  list(question.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
  push(question.answer);
  push(question.solution);
  push(question.target);
  push(question.generatedAnswer);
  list(question.acceptedAnswers).forEach(push);
  if (isObject(question.solutionKey)) push(question.solutionKey.value);
  return values;
};

const guardFor = (question, model) => ({
  strings: unique([...expectedFor(model), ...model.banned, ...rawKeyTexts(question)]),
  numbers: model.answers.filter((entry) => Number.isFinite(entry.value)),
});

const numbersIn = (value) => [
  ...[...ascii(value).matchAll(/\d+(?:\.\d+)?/g)].map((match) => ({ value: Number(match[0]), places: (match[0].split('.')[1] || '').length })),
  // A fraction "3/4" is also read as the one number it names (0.75).
  ...[...ascii(value).matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)]
    .filter((match) => Number(match[2]) !== 0)
    .map((match) => ({ value: Number(match[1]) / Number(match[2]), places: 0 })),
];

/** A number in the text the grader would accept (or that rounds to an answer). */
const nearAnAnswer = (guard, value) => numbersIn(value).some(({ value: number, places }) => guard.numbers.some((entry) => {
  const window = Math.max(entry.tol, places ? 0.5 * 10 ** -places : 1e-9);
  return Math.abs(number - Math.abs(entry.value)) <= window + 1e-12;
}));

const leaks = (guard, value) => hintRevealsAnswer(value, guard.strings) || nearAnAnswer(guard, value);

/** The numbered spelling unless it leaks, else the plain one, else nothing. */
const choose = (guard) => ([numbered, plain]) => {
  if (numbered && !leaks(guard, numbered)) return numbered;
  if (plain && !leaks(guard, plain)) return plain;
  return null;
};

/* ---------------------------------------------------------------------------
 * hints: least to most specific. Each entry is [numbered, plain]; the plain
 * spelling has no digit and no choice word.
 * ------------------------------------------------------------------------- */

const pt = ([x, y]) => `(${fixed(x, 4)}, ${fixed(y, 4)})`;

const complexHints = (model) => {
  const { mode } = model;
  if (mode === 'features') {
    const { z } = model;
    return [
      [`Plot z = ${cText(z)} as the point (${show(z.re)}, ${show(z.im)}): across on the real axis, then up or down on the imaginary axis.`, 'Plot z as the point (real part, imaginary part): go across on the real axis, then up or down on the imaginary axis.'],
      [null, 'The magnitude |z| is the distance from the origin to that point. By the Pythagorean theorem, |a + bi| = √(a² + b²).'],
      [null, 'The conjugate of a + bi is a − bi: it reflects the point across the real axis, so only the sign of the imaginary part changes.'],
      [null, 'Check: z and its conjugate are the same distance from the origin, with the real axis exactly halfway between them.'],
    ];
  }
  if (mode === 'operations') {
    const { z, w, operation } = model;
    if (operation === 'multiply') {
      return [
        [`Expand (${cText(z)})(${cText(w)}) like two binomials: multiply each part of the first factor by each part of the second.`, 'Expand the product like two binomials: multiply each part of the first factor by each part of the second.'],
        [`Write the four products: (${show(z.re)})(${show(w.re)}), (${show(z.re)})(${show(w.im)}i), (${show(z.im)}i)(${show(w.re)}) and (${show(z.im)}i)(${show(w.im)}i).`, 'Write the four products: first, outer, inner and last.'],
        [null, 'The last product contains i·i = i², and i² is negative one: that product moves into the real part with its sign changed.'],
        [null, 'Check: collect the real terms and the i terms separately, then enter the real part and the imaginary part.'],
      ];
    }
    if (operation === 'subtract') {
      return [
        [`Rewrite (${cText(z)}) - (${cText(w)}) as (${cText(z)}) + (${cText(cx(negate(w.re), negate(w.im)))}): subtracting w changes the sign of both of its parts.`, 'Subtracting w means adding its opposite: the sign of both its real part and its imaginary part changes.'],
        [null, 'Then combine real parts with real parts and imaginary parts with imaginary parts.'],
        [null, 'Check: adding w back to your result should give z again.'],
      ];
    }
    return [
      [`Line up the parts of (${cText(z)}) + (${cText(w)}): the real parts are ${show(z.re)} and ${show(w.re)}, the imaginary parts are ${show(z.im)} and ${show(w.im)}.`, 'Line up the parts: real part with real part, imaginary part with imaginary part.'],
      [null, 'Add the real parts to get the real part of the result, and add the imaginary parts to get its imaginary part.'],
      [null, 'Check: on the complex plane the sum is the fourth corner of the parallelogram with sides z and w.'],
    ];
  }
  if (mode === 'division') {
    const { w } = model;
    return [
      [`To divide by ${cText(w)}, multiply the numerator and the denominator by the conjugate of ${cText(w)}.`, 'To divide by w, multiply the numerator and the denominator by the conjugate of w.'],
      [null, 'The conjugate of c + di is c − di: only the sign of the imaginary part changes.'],
      [null, 'The new denominator (c + di)(c − di) = c² + d² is a real number, with no i left in it.'],
      [null, 'Expand the numerator, replace i² by negative one, then divide its real part and its imaginary part by that real denominator.'],
      [null, 'Check: multiply your quotient by w; you should get z back.'],
    ];
  }
  if (mode === 'powers') {
    const { z, exponent } = model;
    return [
      [`Write z^${exponent} as ${exponent} factors of (${cText(z)}) and multiply two at a time.`, 'Write the power as repeated factors of z and multiply two at a time.'],
      [null, 'After each multiplication replace i² by negative one, and keep the real part and the imaginary part separate.'],
      [null, 'For the magnitude, |zⁿ| = |z|ⁿ: find |z| = √(a² + b²) first, then raise it to the same power.'],
      [null, 'Check: the magnitude of your result should equal √(real part² + imaginary part²) of the power you found.'],
    ];
  }
  if (mode === 'rotation') {
    const { z, quarterTurns } = model;
    return [
      [`Reduce the exponent: only the remainder of ${quarterTurns} ÷ 4 matters, because the powers of i repeat every four.`, 'Reduce the exponent on i: divide it by four, and only the remainder matters, because the powers of i repeat every four.'],
      [null, 'Each multiplication by i is a quarter-turn counterclockwise about the origin: it sends the point (a, b) to (−b, a).'],
      [`Start from ${cText(z)}, the point (${show(z.re)}, ${show(z.im)}), and apply one quarter-turn for each unit of that remainder.`, 'Start from z and apply one quarter-turn for each unit of that remainder.'],
      [null, 'Check: a rotation never changes the distance from the origin, so your result has the same magnitude as z.'],
    ];
  }
  const { a, b, c } = model;
  return [
    [`In ${quadText(a, b, c)}, read the coefficients: a = ${show(a)}, b = ${show(b)}, c = ${show(c)}.`, 'Read the coefficients a, b and c of the equation ax² + bx + c equal to zero, each with its sign.'],
    [`Find the discriminant b² − 4ac = (${show(b)})² − 4(${show(a)})(${show(c)}).`, 'Find the discriminant: b² minus four times a times c.'],
    [null, 'If the discriminant is below zero, write its square root as i times the square root of its opposite: the roots are then not real.'],
    [null, 'Use the quadratic formula: −b divided by twice a is the part both roots share, and the ± square-root term, also divided by twice a, splits it into the two roots.'],
    [null, 'Check: when the roots are not real they are conjugates, with the same real part and opposite imaginary parts.'],
  ];
};

const expLogHints = (model) => {
  if (model.mode === 'equivalentForms') {
    const { b, x } = model;
    return [
      [`In ${baseText(b)}^${show(x)}, the base is ${show(b)} and the exponent is ${show(x)}.`, 'Name the base and the exponent of the power.'],
      [null, 'A logarithm answers the question “which exponent?”: log_b(v) is the power you must raise b to in order to get v.'],
      [null, 'For the value of the power, multiply the base by itself as many times as the exponent says; a negative exponent means the reciprocal.'],
      [null, 'Check: both forms say the same thing — the base raised to the logarithm gives back the value.'],
    ];
  }
  if (model.mode === 'solveExponential') {
    const { b, m, c, rhs } = model;
    return [
      [`Write ${show(rhs)} as a power of ${show(b)}.`, 'Write the right side as a power of the same base.'],
      [null, 'When both sides are powers of the same base, their exponents must be equal: set the exponent expression equal to that exponent.'],
      [`Then solve ${linearText(m, c)} = (that exponent) for x: undo the constant first, then divide by ${show(m)}.`, 'Then solve that linear equation for x: undo the constant first, then divide by the coefficient of x.'],
      [null, 'Check: substitute your x into the exponent and make sure the power equals the right side.'],
    ];
  }
  if (model.mode === 'solveLogarithmic') {
    const { b, m, c, y } = model;
    const argument = linearText(m, c);
    return [
      // The value the argument must equal is a graded answer, so no rung writes
      // it, not even as the unevaluated power b^y: the rule stays in letters.
      [`In log_${show(b)}(${argument}) = ${y}, the base is ${show(b)} and the argument is ${argument}. Rewrite the equation in exponential form: log_b(A) = y means b^y = A.`, 'Rewrite the equation in exponential form: log_b(A) = y means b^y = A.'],
      [null, 'Work out the power b^y: that is the value the argument must equal.'],
      [`Then solve ${argument} = (that value) for x.`, 'Then set the argument equal to that value and solve for x.'],
      [null, 'Check: the argument of a logarithm must be positive — substitute your x back in.'],
    ];
  }
  const f = fText(model.spec);
  if (model.mode === 'inverse') {
    return [
      [`f(${show(model.x0)}) is an output of ${f}; f⁻¹ takes that output back to the input that produced it.`, 'The inverse runs f backwards: it takes an output of f back to the input that produced it.'],
      [`${f} has the horizontal asymptote y = ${show(model.spec.k)}. Reflecting across y = x turns a horizontal line into a vertical one.`, 'Reflecting across y = x swaps x and y, so a horizontal asymptote of f becomes a vertical asymptote of the inverse, at the same number.'],
      [`The domain of f⁻¹ is the range of f. In ${f}, the factor in front of the power is ${show(model.spec.a)}: does it keep the outputs of f above or below the asymptote?`, 'The domain of the inverse is the range of f. Ask whether the factor in front of the power keeps the outputs of f above or below its asymptote.'],
      [null, 'Check: a point (p, q) on the graph of f appears as (q, p) on the graph of the inverse.'],
    ];
  }
  return [
    [`Work from the inside out: for f⁻¹(f(x)), first find the output of ${f}, then ask which input of f gives that output.`, 'Work from the inside out: for f⁻¹(f(x)), first find the output of f, then ask which input of f gives that output.'],
    [null, 'For f(f⁻¹(y)), first find f⁻¹(y) — the input whose output under f is y — then put it into f.'],
    [null, 'f⁻¹(y) exists only when y is in the range of f, on the same side of the horizontal asymptote as the outputs of f.'],
    [null, 'Check: write down the intermediate value in each order before you enter the final result.'],
  ];
};

const regressionHints = (model) => {
  const { points } = model;
  const first = model.scatter
    ? [`There are ${points.length} points on the scatterplot: read each one and enter it as a row.`, 'Read each point on the scatterplot — straight down to the x-axis for x, straight across to the y-axis for y — and enter it as a row.']
    : [`Enter all ${points.length} ordered pairs, from ${pt(points[0])} to ${pt(points[points.length - 1])}, one row each: x in the first column, y in the second.`, 'Enter every ordered pair in the table, one row each: x in the first column and y in the second.'];
  return [
    first,
    [null, 'Run the linear regression on the whole table, not on a line through two chosen points.'],
    [null, 'Read r from the regression output. Its sign says whether y tends to rise or fall as x increases.'],
    [null, 'For the strength, look at how far r is from zero: the closer it is to plus or minus one, the more tightly the points follow a line.'],
    [null, 'Check: the table must hold every pair of the data exactly once, in any order, before you run the regression.'],
  ];
};

const FIT_HINTS = Object.freeze({
  linear: (n, span) => [
    [`Use all ${n} data points, from ${span}, and run linear regression on the whole set.`, 'Use every data point and run linear regression on the whole set — not a line through two chosen points.'],
    [null, 'Regression reports y = mx + b: m is the slope, the change in y for each step in x, and b is where the line crosses the y-axis. Enter each with its sign.'],
  ],
  quadratic: (n) => [
    [`Use all ${n} rows and run quadratic regression on the whole table.`, 'Use every row and run quadratic regression on the whole table — not a curve through three chosen points.'],
    [null, 'Quadratic regression reports a, b and c of y = ax² + bx + c. Enter each coefficient with its sign, as the technology reports it.'],
  ],
  exponential: (n) => [
    [`Use all ${n} rows and run exponential regression on the whole table.`, 'Use every row and run exponential regression on the whole table — not the ratio of two chosen points.'],
    [null, 'Exponential regression reports a and b of y = a·bˣ: a is the starting value, and b is the factor y is multiplied by each time x goes up by one.'],
  ],
  squareRoot: (n) => [
    [`Use all ${n} rows and run square-root regression on the whole table.`, 'Use every row and run square-root regression on the whole table.'],
    [null, 'Square-root regression reports a, h and k of y = a√(x − h) + k. The point (h, k) is where the graph begins, and a stretches it.'],
  ],
  stepper: (n, span) => [
    [`Look at all ${n} points, from ${span}, before you move the line.`, 'Look at every point before you move the line.'],
    [null, 'Move the slope and intercept steppers until the points are spread evenly above and below the line.'],
    [null, 'Use the residual plot: the residuals should scatter around zero with no curve or trend.'],
  ],
});

/*
 * The question's own model metric (modelMetric; the lab and the grader rank the
 * families by it). The lab lists RMSE and MAE for every family; SSE is not
 * listed, but SSE = n·RMSE², so it ranks the families exactly as RMSE does.
 */
const METRIC_TEXT = Object.freeze({
  rmse: { name: 'RMSE', compare: 'Compare the RMSE the lab lists for each model family: this question ranks the models by RMSE, and the smaller it is, the closer the model’s values are to the data.' },
  mae: { name: 'MAE', compare: 'Compare the MAE (mean absolute error) the lab lists for each model family — not the RMSE: this question ranks the models by MAE, and the smaller it is, the closer the model’s values are to the data on average.' },
  sse: { name: 'RMSE', compare: 'This question ranks the models by the sum of squared errors. The lab lists RMSE, which ranks them the same way, so compare the RMSE of each model family: the smaller it is, the closer the model’s values are to the data.' },
});

const dataHints = (model) => {
  const { points, parts, mode } = model;
  const n = points.length;
  const span = `${pt(points[0])} to ${pt(points[points.length - 1])}`;
  const out = [];
  if (parts.includes('fit')) out.push(...FIT_HINTS[model.stepper ? 'stepper' : model.fitFamily](n, span));
  if (parts.includes('correlation')) {
    out.push(
      [`Enter all ${n} pairs into statistical technology and calculate r — the lab does not show it in this mode.`, 'Enter every pair into statistical technology and calculate r — the lab does not show it in this mode.'],
      [null, 'The sign of r says whether y tends to rise or fall as x increases.'],
      [null, 'For the strength, look at how far r is from zero: the closer to plus or minus one, the more tightly the points follow a line.'],
    );
  }
  const { name: metricName, compare: compareRung } = METRIC_TEXT[model.metric];
  if (parts.includes('modelChoice')) {
    out.push(
      [null, 'Look at the shape of the data first: does it follow a straight trend, bend into a U, change by a constant factor, or change steeply at first and then more and more gently?'],
      [null, compareRung],
      [null, `Choose the family with the smallest ${metricName}: that is the error this question ranks the models by.`],
    );
  }
  if (parts.includes('prediction')) {
    const { prediction } = model;
    const xsSorted = points.map(([x]) => x).sort((left, right) => left - right);
    if (mode === 'prediction') {
      out.push(
        [null, `${compareRung} Use the family with the smallest ${metricName} for your prediction.`],
        [null, 'Pick an x for your prediction, substitute it into that model, and evaluate.'],
      );
    } else {
      out.push([`Substitute x = ${fixed(prediction.x, 4)} into your fitted model and evaluate it.`, 'Substitute the given x into your fitted model and evaluate it.']);
    }
    if (prediction.asksType) {
      out.push([
        prediction.fixedTarget ? `Compare x = ${fixed(prediction.x, 4)} with the data's x-values, which run from ${fixed(xsSorted[0], 4)} to ${fixed(xsSorted[xsSorted.length - 1], 4)}: is it inside that range or beyond it?` : null,
        'Compare the x of the prediction with the smallest and largest x in the data: is it inside that range or beyond it?',
      ]);
    }
  }
  if (parts.includes('fit') || parts.includes('prediction')) {
    out.push([null, 'Check: your model’s value at one of the data’s x-values should be close to the y-value recorded there.']);
  } else if (parts.includes('modelChoice')) {
    out.push([null, `Check: the family you choose should have the smallest ${metricName} in the lab’s list, and its curve should pass close to the points.`]);
  } else {
    out.push([null, 'Check: the size of r can never be more than one, and its sign should match the way the cloud of points tilts.']);
  }
  return out;
};

const HINTS = Object.freeze({ complex: complexHints, expLog: expLogHints, regression: regressionHints, dataModel: dataHints });
const MAX_FAMILY_HINTS = 5;

export const hints = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    const guard = guardFor(question, model);
    return unique(HINTS[model.shape](model).map(choose(guard)).filter(Boolean)).slice(0, MAX_FAMILY_HINTS);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * backUpQuestion: one two-choice question about this problem's first move.
 * ------------------------------------------------------------------------- */

const step = (prompt, options, correct) => ({ prompt, options, correct });

const backUpFor = (model) => {
  if (model.shape === 'complex') {
    switch (model.mode) {
      case 'features':
        return [
          step(`Let’s back up. Where do you plot z = ${cText(model.z)}?`, [`At (${show(model.z.re)}, ${show(model.z.im)})`, `At (${show(model.z.im)}, ${show(model.z.re)})`], `At (${show(model.z.re)}, ${show(model.z.im)})`),
          step('Let’s back up. Where does z = a + bi sit on the complex plane?', ['At the point (a, b)', 'At the point (b, a)'], 'At the point (a, b)'),
        ];
      case 'operations':
        return model.operation === 'multiply'
          ? [step('Let’s back up. How many products do you write when you expand (a + bi)(c + di)?', ['Four', 'Two'], 'Four')]
          : [step('Let’s back up. When you add or subtract complex numbers, what do you combine?', ['Real parts with real parts, imaginary parts with imaginary parts', 'Every part with every other part'], 'Real parts with real parts, imaginary parts with imaginary parts')];
      case 'division':
        return [step('Let’s back up. To divide by a complex number, what do you multiply the top and bottom by?', ['The conjugate of the denominator', 'The denominator itself'], 'The conjugate of the denominator')];
      case 'powers':
        return [step('Let’s back up. How do you get the magnitude of zⁿ from |z|?', ['Raise |z| to the same power', 'Multiply |z| by the exponent'], 'Raise |z| to the same power')];
      case 'rotation':
        return [step('Let’s back up. What does multiplying a point by i do?', ['Turns it a quarter-turn counterclockwise about the origin', 'Reflects it across the real axis'], 'Turns it a quarter-turn counterclockwise about the origin')];
      default:
        return [step('Let’s back up. What do you work out first to see what kind of roots a quadratic has?', ['The discriminant, b² minus four times a times c', 'The sum of a, b and c'], 'The discriminant, b² minus four times a times c')];
    }
  }
  if (model.shape === 'expLog') {
    switch (model.mode) {
      case 'equivalentForms':
        return [step('Let’s back up. What does a logarithm give you?', ['An exponent', 'A base'], 'An exponent')];
      case 'solveExponential':
        return [step('Let’s back up. What is a good first move for an equation like b^(mx + c) = r?', ['Write the right side as a power of the same base', 'Divide both sides by the base'], 'Write the right side as a power of the same base')];
      case 'solveLogarithmic':
        return [step('Let’s back up. How do you undo a logarithm with base b in an equation?', ['Rewrite it in exponential form with base b', 'Divide both sides by log'], 'Rewrite it in exponential form with base b')];
      case 'inverse':
        return [step('Let’s back up. Where does the domain of the inverse come from?', ['The range of f', 'The domain of f'], 'The range of f')];
      default:
        return [step('Let’s back up. In f⁻¹(f(x)), which function do you apply first?', ['f', 'f⁻¹'], 'f')];
    }
  }
  if (model.shape === 'regression') {
    return [step('Let’s back up. What goes in each row of the table?', ['One ordered pair (x, y) from the data', 'The slope and the intercept'], 'One ordered pair (x, y) from the data')];
  }
  if (model.parts.includes('fit')) return [step('Let’s back up. Which points go into the fit?', ['All of the data points', 'Just two convenient points'], 'All of the data points')];
  if (model.parts.includes('correlation')) return [step('Let’s back up. Where does r come from?', ['A calculation that uses every (x, y) pair', 'A guess from the picture'], 'A calculation that uses every (x, y) pair')];
  if (model.parts.includes('modelChoice')) return [step('Let’s back up. Which model fits the data better?', ['The one with the smaller error', 'The one with the larger error'], 'The one with the smaller error')];
  return [step('Let’s back up. What do you substitute x into to make a prediction?', ['The model that fits the data best', 'A line through two of the points'], 'The model that fits the data best')];
};

export const backUpQuestion = (question) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    const guard = guardFor(question, model);
    const chosen = backUpFor(model).find((entry) => ![entry.prompt, ...entry.options].some((part) => leaks(guard, part)));
    if (!chosen) return null;
    // The right answer is not always the first button.
    const options = hash(`${model.kind}|${chosen.prompt}`) % 2 ? [...chosen.options].reverse() : [...chosen.options];
    return { prompt: chosen.prompt, options, correct: chosen.correct };
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * similarProblem: a worked sibling with different numbers.
 * ------------------------------------------------------------------------- */

const numericAnswer = (value) => {
  const cleaned = ascii(value).replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const fraction = /^(-?\d+)\/(-?\d+)$/.exec(cleaned);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

/** The platform's similarExampleIsSafe, against this family's wider guard (every choice word too). */
const exampleIsSafe = (question, example, guard) => {
  const prompt = text(example?.prompt);
  const answerText = text(example?.answer);
  const steps = list(example?.steps).map(text).filter(Boolean);
  if (!prompt || !answerText || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  if (guard.strings.some((value) => value.toLowerCase() === answerText.toLowerCase())) return false;
  const value = numericAnswer(answerText);
  if (value !== null && guard.strings.some((entry) => numericAnswer(entry) !== null && Math.abs(numericAnswer(entry) - value) < 1e-9)) return false;
  if (hintRevealsAnswer(answerText, guard.strings)) return false;
  if (steps.some((entry) => hintRevealsAnswer(entry, guard.strings))) return false;
  // No number the sibling states as its answer may be one the grader would
  // accept for THIS question (within its tolerance, |n| against |answer|), so
  // nothing in the sibling's answer can be copied into this question's boxes.
  if (nearAnAnswer(guard, answerText)) return false;
  // Stricter than the platform: the prompt avoids this question's numeric answers too.
  return !hintRevealsAnswer(prompt, guard.strings);
};

const MAX_SIBLING_ATTEMPTS = 400;
const signatureOf = (question, model) => `${model.kind}|${text(question.prompt)}|${JSON.stringify(model.points || model.z || model.spec || model.b || '', (key, value) => (value && typeof value === 'object' && 'n' in value && 'd' in value ? `${value.n}/${value.d}` : value))}`;

const firstSafe = (question, model, seed, candidates, build) => {
  if (!candidates.length) return null;
  const guard = guardFor(question, model);
  const start = hash(`${signatureOf(question, model)}|${Number(seed) || 0}`) % candidates.length;
  // Walk the list with a stride coprime to its length, so the bounded search
  // visits candidates spread across every parameter, not one corner of it.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const stride = [7919, 4099, 1031, 211, 37, 1].find((prime) => gcd(prime, candidates.length) === 1);
  for (let index = 0; index < Math.min(candidates.length, MAX_SIBLING_ATTEMPTS); index += 1) {
    let example = null;
    try {
      example = build(candidates[(start + index * stride) % candidates.length]);
    } catch {
      example = null;
    }
    if (example && exampleIsSafe(question, example, guard)) return example;
  }
  return null;
};

const I = (value) => rational(value);
const ints = (values) => values.map(I);

/* ----- complex siblings ----- */

const SUPERSCRIPTS = Object.freeze({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' });
/** 12 → "¹²": an exponent that is not a digit in the text, so the guard never reads it as a number. */
const sup = (n) => String(n).split('').map((character) => SUPERSCRIPTS[character] ?? character).join('');
const square = (value) => `${paren(value)}²`;
const productsText = (z, w) => `(${show(z.re)})(${show(w.re)}) + (${show(z.re)})(${show(w.im)}i) + (${show(z.im)}i)(${show(w.re)}) + (${show(z.im)}i)(${show(w.im)}i)`;
const expandText = (z, w) => {
  const ac = multiply(z.re, w.re);
  const ad = multiply(z.re, w.im);
  const bc = multiply(z.im, w.re);
  const bd = multiply(z.im, w.im);
  return `${productsText(z, w)} = ${show(ac)} + ${paren(ad)}i + ${paren(bc)}i + ${paren(bd)}i², and i² = -1, so ${paren(bd)}i² = ${show(negate(bd))}`;
};
/** The expansion, then the two parts combined: "… real part 9 + (-9) = 0, imaginary part …". */
const productText = (z, w) => {
  const result = cMul(z, w);
  return `${expandText(z, w)}; real part ${show(multiply(z.re, w.re))} + ${paren(negate(multiply(z.im, w.im)))} = ${show(result.re)}, imaginary part ${show(multiply(z.re, w.im))} + ${paren(multiply(z.im, w.re))} = ${show(result.im)}`;
};
const magnitudeText = (n2) => {
  const root = sqrtRational(n2);
  return root ? show(root) : `√${show(n2)} ≈ ${fixed(Math.sqrt(toNumber(n2)), 2)}`;
};

const SIBLING_PARTS = Object.freeze(ints([3, -2, 4, -1, 5, 2, -3, 1, -4, 6]));

const siblingComplex = (question, model, seed) => {
  const { mode } = model;
  if (mode === 'features') {
    const pairs = product(ints([3, -5, 6, -8, 1, 2, -2, 5, 4, -1]), ints([4, -12, 8, 6, -2, 3, 5, -1, -3, 7]))
      .filter(([re, im]) => !cEq(cx(re, im), model.z));
    return firstSafe(question, model, seed, pairs, ([re, im]) => {
      const z = cx(re, im);
      const n2 = cNorm2(z);
      const conj = cConj(z);
      return {
        prompt: `For z = ${cText(z)}, find |z| and the real and imaginary parts of its conjugate z̄.`,
        steps: [
          `Plot z = ${cText(z)} as the point (${show(re)}, ${show(im)}).`,
          `|z| = √(${square(re)} + ${square(im)}) = √(${show(multiply(re, re))} + ${show(multiply(im, im))}) = √${show(n2)}${sqrtRational(n2) ? ` = ${show(sqrtRational(n2))}` : ` ≈ ${fixed(Math.sqrt(toNumber(n2)), 2)}`}.`,
          `The conjugate changes only the sign of the imaginary part: z̄ = ${cText(conj)}, so Re(z̄) = ${show(conj.re)} and Im(z̄) = ${show(conj.im)}.`,
        ],
        answer: `|z| = ${magnitudeText(n2)}; z̄ = ${cText(conj)} (Re(z̄) = ${show(conj.re)}, Im(z̄) = ${show(conj.im)})`,
      };
    });
  }
  if (mode === 'operations') {
    const { operation } = model;
    const candidates = product(SIBLING_PARTS, SIBLING_PARTS, SIBLING_PARTS, SIBLING_PARTS)
      .filter(([a, b, c, d]) => !(cEq(cx(a, b), model.z) && cEq(cx(c, d), model.w)));
    return firstSafe(question, model, seed, candidates, ([a, b, c, d]) => {
      const z = cx(a, b);
      const w = cx(c, d);
      if (operation === 'multiply') {
        const result = cMul(z, w);
        return {
          prompt: `Multiply (${cText(z)})(${cText(w)}). Give the real part and the imaginary part.`,
          steps: [
            `Expand like two binomials: ${expandText(z, w)}.`,
            `Real part: ${show(multiply(a, c))} + ${paren(negate(multiply(b, d)))} = ${show(result.re)}.`,
            `Imaginary part: ${show(multiply(a, d))} + ${paren(multiply(b, c))} = ${show(result.im)}.`,
            `So (${cText(z)})(${cText(w)}) = ${cText(result)}.`,
          ],
          answer: `${cText(result)} (real part ${show(result.re)}, imaginary part ${show(result.im)})`,
        };
      }
      const sign = operation === 'add' ? '+' : '-';
      const result = operation === 'add' ? cAdd(z, w) : cSub(z, w);
      return {
        prompt: `Find (${cText(z)}) ${sign} (${cText(w)}). Give the real part and the imaginary part.`,
        steps: [
          `Real parts: ${show(a)} ${sign} ${paren(c)} = ${show(result.re)}.`,
          `Imaginary parts: ${show(b)} ${sign} ${paren(d)} = ${show(result.im)}.`,
          `So (${cText(z)}) ${sign} (${cText(w)}) = ${cText(result)}.`,
        ],
        answer: `${cText(result)} (real part ${show(result.re)}, imaginary part ${show(result.im)})`,
      };
    });
  }
  if (mode === 'division') {
    const candidates = product(ints([2, -1, 3, 1, -2, 4]), ints([1, -2, 3, -1, 2]), ints([1, 2, -1, 3, -2]), ints([1, -1, 2, -3, 3]))
      .filter(([p, s, c, d]) => !(cEq(cx(c, d), model.w) && cEq(cx(p, s), model.result)));
    return firstSafe(question, model, seed, candidates, ([p, s, c, d]) => {
      const w = cx(c, d);
      const quotient = cx(p, s);
      const z = cMul(quotient, w);
      const conjW = cConj(w);
      const N = cNorm2(w);
      const numerator = cMul(z, conjW);
      return {
        prompt: `Divide (${cText(z)}) ÷ (${cText(w)}). Give the conjugate of the denominator and the real and imaginary parts of the quotient.`,
        steps: [
          `Multiply the numerator and the denominator by the conjugate of ${cText(w)}, which is w̄ = ${cText(conjW)}.`,
          `Denominator: (${cText(w)})(${cText(conjW)}) = ${square(c)} + ${square(d)} = ${show(N)}.`,
          `Numerator: ${productText(z, conjW)}; so the numerator is ${cText(numerator)}.`,
          `Divide both parts by ${show(N)}: ${show(numerator.re)} ÷ ${show(N)} = ${show(quotient.re)} and ${show(numerator.im)} ÷ ${show(N)} = ${show(quotient.im)}.`,
          `So (${cText(z)}) ÷ (${cText(w)}) = ${cText(quotient)}.`,
        ],
        answer: `w̄ = ${cText(conjW)}; quotient ${cText(quotient)} (real part ${show(quotient.re)}, imaginary part ${show(quotient.im)})`,
      };
    });
  }
  if (mode === 'powers') {
    const candidates = product(ints([1, 2, -1, 3, -2, -3]), ints([1, -1, 2, -2, 3, -3]), [2, 3, 4])
      .filter(([re, im, n]) => !(cEq(cx(re, im), model.z) && n === model.exponent));
    return firstSafe(question, model, seed, candidates, ([re, im, n]) => {
      const z = cx(re, im);
      const steps = [];
      let power = z;
      for (let k = 2; k <= n; k += 1) {
        const next = cMul(power, z);
        steps.push(`z${sup(k)} = (${cText(power)})(${cText(z)}): ${productText(power, z)}; so z${sup(k)} = ${cText(next)}.`);
        power = next;
      }
      const n2 = cNorm2(z);
      const magnitudeSquared = powR(n2, n);
      steps.push(`|z| = √(${square(re)} + ${square(im)}) = √${show(n2)}, so |z${sup(n)}| = (√${show(n2)})${sup(n)} = √${show(magnitudeSquared)} = ${magnitudeText(magnitudeSquared)}.`);
      steps.push(`Check: √(${square(power.re)} + ${square(power.im)}) = √${show(cNorm2(power))}, the same magnitude.`);
      return {
        prompt: `For z = ${cText(z)}, find z${sup(n)} (its real and imaginary parts) and |z${sup(n)}|.`,
        steps,
        answer: `z${sup(n)} = ${cText(power)}; |z${sup(n)}| = ${magnitudeText(magnitudeSquared)}`,
      };
    });
  }
  if (mode === 'rotation') {
    const phrases = ['zero quarter-turns: the point does not move', 'one quarter-turn counterclockwise', 'two quarter-turns, a half-turn about the origin', 'three quarter-turns counterclockwise, the same as one quarter-turn clockwise'];
    const candidates = product(ints([2, -3, 4, 1, -1, 5, -2]), ints([1, 3, -2, 2, -4, 5]), [1, 2, 3, 5, 6, 7, -1, 10, 11])
      .filter(([re, im]) => !cEq(cx(re, im), model.z));
    return firstSafe(question, model, seed, candidates, ([re, im, q]) => {
      const z = cx(re, im);
      const turns = ((q % 4) + 4) % 4;
      const path = [z];
      for (let k = 0; k < turns; k += 1) path.push(cx(negate(path[k].im), path[k].re));
      const result = path[path.length - 1];
      const point = (value) => `(${show(value.re)}, ${show(value.im)})`;
      return {
        prompt: `Multiply z = ${cText(z)} by i^${q}. Give the result and the net rotation.`,
        steps: [
          `Divide ${q} by four: the remainder is ${turns}. Every fourth power of i is one, so i^${q} = i^${turns}${turns === 1 ? '' : ` = ${['one', 'i', 'negative one', '-i'][turns]}`}.`,
          'Each factor of i is a quarter-turn counterclockwise about the origin, sending (a, b) to (-b, a).',
          turns ? `Apply ${turns} quarter-turn${turns > 1 ? 's' : ''}: ${path.map(point).join(' → ')}.` : `With no quarter-turn left, ${point(z)} stays where it is.`,
          `So i^${q}·z = ${cText(result)}: a net rotation of ${phrases[turns]}.`,
        ],
        answer: `${cText(result)}; net rotation: ${phrases[turns]}`,
      };
    });
  }
  // quadraticRoots: the same kind of discriminant as this question.
  const kind = isNegative(model.D) ? 'complex' : isZero(model.D) ? 'repeated' : 'real';
  const candidates = product(ints([1, 2, -1, 3, -2, 4]), ints([1, -2, 2, -1, 3, -3, 0, 4, -4, 5]), ints([2, 1, 3, 4, 5, 6, -2, -3, -5, 7]))
    .filter(([a, p, s]) => !(equals(a, model.a) && equals(multiply(I(-2), multiply(a, p)), model.b)) && !(kind === 'real' && equals(p, s)));
  return firstSafe(question, model, seed, candidates, ([a, p, s]) => {
    let b;
    let c;
    if (kind === 'complex') {
      b = multiply(I(-2), multiply(a, p));
      c = multiply(a, add(multiply(p, p), multiply(s, s)));
    } else if (kind === 'repeated') {
      b = multiply(I(-2), multiply(a, p));
      c = multiply(a, multiply(p, p));
    } else {
      b = negate(multiply(a, add(p, s)));
      c = multiply(a, multiply(p, s));
    }
    const D = subtract(multiply(b, b), multiply(I(4), multiply(a, c)));
    const twoA = multiply(I(2), a);
    const steps = [
      `In ${quadText(a, b, c).replace(/ = 0$/, '')}: a = ${show(a)}, b = ${show(b)}, c = ${show(c)}.`,
      `Discriminant: b² minus four times a times c: ${square(b)} = ${show(multiply(b, b))} and four times ${paren(a)} times ${paren(c)} is ${show(multiply(I(4), multiply(a, c)))}, so the discriminant is ${show(multiply(b, b))} - ${paren(multiply(I(4), multiply(a, c)))}${isZero(D) ? ', which is zero' : ` = ${show(D)}`}.`,
    ];
    let answerText;
    if (kind === 'complex') {
      const root = sqrtRational(negate(D));
      const imag = absolute(divide(root, twoA));
      const re = divide(negate(b), twoA);
      steps.push(`It is below zero, so √(${show(D)}) = i√${show(negate(D))} = ${show(root)}i.`);
      steps.push(`x = (${show(negate(b))} ± ${show(root)}i) ÷ ${paren(twoA)} = ${show(re)} ± ${equals(imag, ONE) ? '' : show(imag)}i.`);
      answerText = `${cText(cx(re, imag))} and ${cText(cx(re, negate(imag)))}`;
    } else if (kind === 'repeated') {
      const root = divide(negate(b), twoA);
      steps.push(`It is zero, so there is one repeated root: x = ${show(negate(b))} ÷ ${paren(twoA)} = ${show(root)}.`);
      answerText = `${show(root)} (a repeated root, with imaginary part zero)`;
    } else {
      const root = sqrtRational(D);
      const r1 = divide(add(negate(b), root), twoA);
      const r2 = divide(subtract(negate(b), root), twoA);
      steps.push(`It is above zero, so √${show(D)} = ${show(root)} and x = (${show(negate(b))} ± ${show(root)}) ÷ ${paren(twoA)}.`);
      steps.push(`x = ${show(r1)} or x = ${show(r2)}, both real (imaginary part zero).`);
      answerText = `${show(r1)} and ${show(r2)}`;
    }
    return { prompt: `Find both roots of ${quadText(a, b, c).replace(/ = 0$/, '')}, giving each as a real part and an imaginary part.`, steps, answer: answerText };
  });
};

/* ----- exponential / log siblings ----- */

const powerText = (b, n) => {
  if (n === 0) return '1';
  if (n > 0) return Array.from({ length: n }, () => show(b)).join(' × ');
  return `1 ÷ ${baseText(b)}^${-n} = 1 ÷ ${show(powR(b, -n))}`;
};

const siblingExpLog = (question, model, seed) => {
  if (model.mode === 'equivalentForms') {
    const candidates = product(ints([2, 3, 5, 4, 10, 6]), [2, 3, 4, -1, -2]).filter(([b, x]) => !(equals(b, model.b) && equals(I(x), model.x)) && Math.abs(toNumber(powR(b, x))) <= 100000);
    return firstSafe(question, model, seed, candidates, ([b, x]) => {
      const value = powR(b, x);
      return {
        prompt: `Write ${show(b)}^${x} as a number and as a logarithm.`,
        steps: [
          `${show(b)}^${x} = ${powerText(b, x)} = ${show(value)}.`,
          `So the exponential form is ${show(b)}^${x} = ${show(value)}.`,
          `Logarithmic form: log_${show(b)}(${show(value)}) = ${x}, because ${x} is the exponent that turns ${show(b)} into ${show(value)}.`,
        ],
        answer: `${show(b)}^${x} = ${show(value)} and log_${show(b)}(${show(value)}) = ${x}`,
      };
    });
  }
  if (model.mode === 'solveExponential') {
    const candidates = product(ints([2, 3, 5]), ints([2, 3, 1, -1, 4]), ints([-1, 1, 2, -3, 3]), [2, 3, 4, 1, 5])
      .filter(([b, m, c, k]) => Math.abs(toNumber(powR(b, k))) <= 100000 && !(equals(m, model.m) && equals(c, model.c)) && k !== model.k);
    return firstSafe(question, model, seed, candidates, ([b, m, c, k]) => {
      const rhs = powR(b, k);
      const x = divide(subtract(I(k), c), m);
      const exponent = linearText(m, c);
      const mx = linearText(m, ZERO);
      return {
        prompt: `Solve ${show(b)}^(${exponent}) = ${show(rhs)} for x. Also give the value of the exponent, log_${show(b)}(${show(rhs)}).`,
        steps: [
          `Write ${show(rhs)} as a power of ${show(b)}: ${show(rhs)} = ${show(b)}^${k}, so log_${show(b)}(${show(rhs)}) = ${k}.`,
          `The bases match, so the exponents are equal: ${exponent} = ${k}.`,
          equals(m, ONE) ? `x = ${k} - ${paren(c)} = ${show(x)}.` : `${mx} = ${k} - ${paren(c)} = ${show(subtract(I(k), c))}, so x = ${show(subtract(I(k), c))} ÷ ${paren(m)} = ${show(x)}.`,
          `Check: at x = ${show(x)} the exponent is ${show(add(multiply(m, x), c))}, and ${show(b)}^${k} = ${show(rhs)}.`,
        ],
        answer: `log_${show(b)}(${show(rhs)}) = ${k}; x = ${show(x)}`,
      };
    });
  }
  if (model.mode === 'solveLogarithmic') {
    const candidates = product(ints([2, 3, 5, 10]), ints([2, 3, 1, 4, -1]), ints([1, -1, 3, -3, 2]), [1, 2, 3])
      .filter(([b, m, c, y]) => Math.abs(toNumber(powR(b, y))) <= 100000 && !(equals(m, model.m) && equals(c, model.c)) && !(equals(b, model.b) && y === model.y));
    return firstSafe(question, model, seed, candidates, ([b, m, c, y]) => {
      const argument = powR(b, y);
      const x = divide(subtract(argument, c), m);
      const argText = linearText(m, c);
      return {
        prompt: `Solve log_${show(b)}(${argText}) = ${y} for x. Also give the value the argument must equal.`,
        steps: [
          `log_${show(b)}(${argText}) = ${y} means ${show(b)}^${y} = ${argText}.`,
          `${show(b)}^${y} = ${powerText(b, y)} = ${show(argument)}, so the argument must equal ${show(argument)}.`,
          equals(m, ONE) ? `x = ${show(argument)} - ${paren(c)} = ${show(x)}.` : `${linearText(m, ZERO)} = ${show(argument)} - ${paren(c)} = ${show(subtract(argument, c))}, so x = ${show(subtract(argument, c))} ÷ ${paren(m)} = ${show(x)}.`,
          `Check: at x = ${show(x)} the argument is ${show(add(multiply(m, x), c))}, which is above zero, so the logarithm is defined.`,
        ],
        answer: `argument = ${show(argument)}; x = ${show(x)}`,
      };
    });
  }
  const specs = product(ints([1, 2, 3, -1, -2]), ints([2, 3]), ints([0, 1, -1, 2]), ints([-3, 2, 1, -2, 4, 5]));
  const evalText = (spec, x) => {
    const shift = subtract(x, spec.h);
    const lead = equals(spec.a, ONE) ? '' : `${paren(spec.a)}·`;
    const tail = isZero(spec.k) ? '' : ` ${isNegative(spec.k) ? '-' : '+'} ${show(absolute(spec.k))}`;
    return `${lead}${show(spec.base)}^${paren(shift)}${tail}`;
  };
  if (model.mode === 'inverse') {
    const candidates = product(specs, ints([1, 2, 3, 0])).filter(([[a, base, h, k], x0]) => !equals(k, model.spec.k) && !equals(x0, model.x0) && !(equals(a, model.spec.a) && equals(base, model.spec.base) && equals(h, model.spec.h)));
    return firstSafe(question, model, seed, candidates, ([[a, base, h, k], x0]) => {
      const spec = { a, base, h, k };
      const value = fAt(spec, x0);
      const up = !isNegative(a);
      return {
        prompt: `For ${fText(spec)}, find f⁻¹(f(${show(x0)})), the vertical asymptote of f⁻¹, and the domain of f⁻¹.`,
        steps: [
          `f(${show(x0)}) = ${evalText(spec, x0)} = ${show(value)}.`,
          `The inverse takes an output back to its input: f⁻¹(${show(value)}) = ${show(x0)}.`,
          `f has the horizontal asymptote y = ${show(k)}; reflecting across y = x makes it the vertical asymptote x = ${show(k)} of f⁻¹.`,
          `The factor in front of the power is ${show(a)}, so every output of f lies ${up ? 'above' : 'below'} y = ${show(k)}: the range of f, which is the domain of f⁻¹, is x ${up ? '>' : '<'} ${show(k)}.`,
        ],
        answer: `f⁻¹(${show(value)}) = ${show(x0)}; vertical asymptote x = ${show(k)}; domain of f⁻¹: x ${up ? '>' : '<'} ${show(k)}`,
      };
    });
  }
  const candidates = product(specs, ints([1, 2, 3, 0]), ints([2, 3, 4, 1])).filter(([[a, base, h, k], x0, t]) => !equals(x0, model.x) && !equals(x0, t) && !(equals(a, model.spec.a) && equals(base, model.spec.base) && equals(h, model.spec.h) && equals(k, model.spec.k)));
  return firstSafe(question, model, seed, candidates, ([[a, base, h, k], x0, t]) => {
    const spec = { a, base, h, k };
    const fx = fAt(spec, x0);
    const y = fAt(spec, t);
    if (equals(y, model.y) || equals(y, x0)) return null;
    const shifted = subtract(y, k);
    const ratio = divide(shifted, a);
    return {
      prompt: `For ${fText(spec)}, find f⁻¹(f(${show(x0)})) and f(f⁻¹(${show(y)})).`,
      steps: [
        `f(${show(x0)}) = ${evalText(spec, x0)} = ${show(fx)}.`,
        `f⁻¹(${show(fx)}) is the input of f whose output is ${show(fx)}, and that input is ${show(x0)}: f⁻¹(f(${show(x0)})) = ${show(x0)}.`,
        `For f⁻¹(${show(y)}), solve f(t) = ${show(y)}: ${equals(a, ONE) ? '' : `${paren(a)}·`}${show(base)}^(t${isZero(h) ? '' : ` ${isNegative(h) ? '+' : '-'} ${show(absolute(h))}`}) = ${show(y)} - ${paren(k)} = ${show(shifted)}, so ${show(base)}^(t${isZero(h) ? '' : ` ${isNegative(h) ? '+' : '-'} ${show(absolute(h))}`}) = ${show(ratio)} = ${show(base)}^${show(subtract(t, h))}, and t = ${show(t)}.`,
        `Then f(${show(t)}) = ${evalText(spec, t)} = ${show(y)}: f(f⁻¹(${show(y)})) = ${show(y)}.`,
      ],
      answer: `f⁻¹(f(${show(x0)})) = ${show(x0)}; f(f⁻¹(${show(y)})) = ${show(y)}`,
    };
  });
};

/* ----- regression and data siblings ----- */

/** Least-squares sums of integer data, exactly. */
const exactSums = (points) => {
  const n = I(points.length);
  const xs = points.map(([x]) => I(x));
  const ys = points.map(([, y]) => I(y));
  const sum = (values) => values.reduce((total, value) => add(total, value), ZERO);
  const xBar = divide(sum(xs), n);
  const yBar = divide(sum(ys), n);
  const dx = xs.map((x) => subtract(x, xBar));
  const dy = ys.map((y) => subtract(y, yBar));
  const Sxx = sum(dx.map((value) => multiply(value, value)));
  const Syy = sum(dy.map((value) => multiply(value, value)));
  const Sxy = sum(dx.map((value, index) => multiply(value, dy[index])));
  const m = divide(Sxy, Sxx);
  const b = subtract(yBar, multiply(m, xBar));
  const r = toNumber(Sxy) / Math.sqrt(toNumber(Sxx) * toNumber(Syy));
  return { xSum: sum(xs), ySum: sum(ys), xBar, yBar, Sxx, Syy, Sxy, m, b, r };
};
/** An exact value as a student reads it: "2.5", or "16/3 ≈ 5.3333" when the decimal does not end. */
const approx = (value) => (value.d === 1 || decimalOf(value) ? show(value) : `${show(value)} ≈ ${fixed(toNumber(value), 4)}`);
const decimalLine = (m, b) => `y = ${fixed(m, 4)}x ${b < 0 ? '-' : '+'} ${fixed(Math.abs(b), 4)}`;
const pointsText = (points) => points.map(([x, y]) => `(${fixed(x, 4)}, ${fixed(y, 4)})`).join(', ');

const NOISE_PATTERNS = Object.freeze([[1, -2, 2, -1, 0], [-1, 2, 0, -2, 1], [2, -1, -2, 1, 0], [0, 1, -2, 2, -1], [1, 1, -2, -1, 1]]);
// The sibling's x-values: several spacings, so a sibling can always be found
// whose numbers avoid this question's answers.
const X_SETS = Object.freeze([[1, 2, 3, 4, 5], [0, 2, 4, 6, 8], [10, 20, 30, 40, 50], [1, 4, 5, 7, 8], [2, 5, 7, 9, 11], [0, 5, 10, 15, 20]]);
const noisyData = (slope, intercept, pattern, count, xSet) => X_SETS[xSet].slice(0, count).map((x, index) => [x, intercept + slope * x + pattern[index % pattern.length]]);

const sumsSteps = (points, sums) => [
  `Means: x̄ = ${show(sums.xSum)} ÷ ${points.length} = ${approx(sums.xBar)}, ȳ = ${show(sums.ySum)} ÷ ${points.length} = ${approx(sums.yBar)}.`,
  `Sxx = Σ(x - x̄)² = ${approx(sums.Sxx)}, Sxy = Σ(x - x̄)(y - ȳ) = ${approx(sums.Sxy)}.`,
  `m = Sxy ÷ Sxx = ${approx(sums.m)}, and b = ȳ - m·x̄ = ${approx(sums.b)}.`,
];
const correlationSteps = (sums) => [
  `Syy = Σ(y - ȳ)² = ${approx(sums.Syy)}.`,
  `r = Sxy ÷ √(Sxx·Syy) = ${show(sums.Sxy)} ÷ √${show(multiply(sums.Sxx, sums.Syy))} ≈ ${fixed(sums.r, 4)}.`,
];
/**
 * The reading of r in the tool's own bands, without naming a menu choice. The
 * cut-offs are written in words: a digit spelling such as "0.80" would be a
 * spelling of this question's r whenever r rounds to a cut-off.
 */
const CUT_WORDS = Object.freeze({ 0.8: 'eight tenths', 0.5: 'one half', 0.2: 'two tenths', 0.1: 'one tenth', 0.05: 'five hundredths' });
const bandSentence = (r, { directionCut, cuts }) => {
  const size = Math.abs(r);
  const [top, middle, low] = cuts.map((cut) => CUT_WORDS[cut]);
  const direction = Math.abs(r) < directionCut
    ? `r is within ${CUT_WORDS[directionCut]} of zero, so y shows no rise or fall with x`
    : r > 0 ? 'r is above zero, so y tends to increase as x increases' : 'r is below zero, so y tends to decrease as x increases';
  const band = size >= cuts[0]
    ? `|r| = ${fixed(size, 4)} is at least ${top}, the top strength band`
    : size >= cuts[1]
      ? `|r| = ${fixed(size, 4)} is from ${middle} up to ${top}, the middle strength band`
      : size >= cuts[2]
        ? `|r| = ${fixed(size, 4)} is from ${low} up to ${middle}, the lowest strength band`
        : `|r| = ${fixed(size, 4)} is below ${low}, so there is no linear association to speak of`;
  return `${direction}; ${band}`;
};
const CALCULATOR_BANDS = Object.freeze({ directionCut: 0.1, cuts: [0.8, 0.5, 0.1] });
const LAB_BANDS = Object.freeze({ directionCut: 0.05, cuts: [0.8, 0.5, 0.2] });

const DATA_CANDIDATES = product([2, 3, -2, 4, -3, 5], [3, 10, 20, -4, 7], NOISE_PATTERNS.map((_, index) => index), [5, 4], X_SETS.map((_, index) => index));

const siblingRegression = (question, model, seed) => firstSafe(question, model, seed, DATA_CANDIDATES, ([slope, intercept, patternIndex, count, xSet]) => {
  const points = noisyData(slope, intercept, NOISE_PATTERNS[patternIndex], count, xSet);
  const sums = exactSums(points);
  if (Math.abs(sums.r) < 0.5 || Math.abs(sums.r) > 0.9995) return null;
  return {
    prompt: `Enter the data ${pointsText(points)} in the regression calculator, run a linear regression, and interpret r.`,
    steps: [
      `Enter the ${points.length} pairs as rows of the table: ${pointsText(points)}.`,
      ...sumsSteps(points, sums),
      `The regression line is ${decimalLine(toNumber(sums.m), toNumber(sums.b))}.`,
      ...correlationSteps(sums),
      `Interpretation: ${bandSentence(sums.r, CALCULATOR_BANDS)}.`,
    ],
    answer: `${decimalLine(toNumber(sums.m), toNumber(sums.b))}, r ≈ ${fixed(sums.r, 4)}: ${bandSentence(sums.r, CALCULATOR_BANDS)}`,
  };
});

// Where an exact sibling's rows sit: x-values for a parabola, perfect-square
// offsets from the endpoint for a square root (an exponential always uses
// x = 0 … 4, so that a is the value at x = 0).
const QUADRATIC_X_SETS = Object.freeze([[-2, -1, 0, 1, 2], [0, 1, 2, 3, 4], [3, 4, 5, 6, 7], [-4, -2, 0, 2, 4], [0, 2, 4, 6, 8], [1, 3, 5, 7, 9], [5, 6, 7, 8, 9], [-9, -7, -5, -3, -1], [7, 8, 9, 10, 11], [-8, -6, -4, -3, -2], [3, 4, 7, 8, 10]]);
const ROOT_OFFSET_SETS = Object.freeze([[0, 1, 4, 9, 16], [0, 4, 9, 16, 25], [0, 1, 9, 25, 36], [0, 4, 16, 36, 49], [0, 9, 25, 49, 81], [0, 16, 36, 64, 100], [0, 25, 36, 49, 64], [0, 36, 49, 64, 81]]);
const EXPONENTIAL_STARTS = Object.freeze([0, 1, 3, 5]);

/** Data lying exactly on a model of one family, with its worked fit. */
const exactFit = (family, parameters, layout = 0) => {
  if (family === 'quadratic') {
    const [a, b, c] = parameters.map(I);
    const xs = QUADRATIC_X_SETS[layout];
    const at = (x) => add(add(multiply(a, multiply(x, x)), multiply(b, x)), c);
    const points = xs.map((x) => [x, toNumber(at(I(x)))]);
    const equation = `y = ${quadText(a, b, c).replace(/ = 0$/, '')}`;
    return {
      points,
      predict: at,
      form: FORM_OF.quadratic,
      equation,
      steps: [
        `Every row fits ${equation}: ${xs.map((x) => `x = ${x} gives ${show(a)}·${square(I(x))} + ${paren(b)}·${paren(I(x))} + ${paren(c)} = ${show(at(I(x)))}`).join('; ')}.`,
        `The data lie exactly on that parabola, so the regression of the form ${FORM_OF.quadratic} on all five rows returns a = ${show(a)}, b = ${show(b)}, c = ${show(c)}, with every residual zero.`,
      ],
      coefficients: `a = ${show(a)}, b = ${show(b)}, c = ${show(c)}`,
      targets: [xs[4] + (xs[4] - xs[3]), xs[4] + 2 * (xs[4] - xs[3]), (xs[1] + xs[2]) / 2],
    };
  }
  if (family === 'exponential') {
    const [a, base] = [I(parameters[0]), divide(I(parameters[1]), I(parameters[2]))];
    const first = EXPONENTIAL_STARTS[layout];
    const xs = [0, 1, 2, 3, 4].map((offset) => first + offset);
    const at = (x) => multiply(a, powR(base, x));
    const points = xs.map((x) => [x, toNumber(at(x))]);
    const equation = `y = ${show(a)}(${show(base)})^x`;
    return {
      points,
      predict: (x) => (isInteger(x) ? at(x.n) : null),
      form: FORM_OF.exponential,
      equation,
      steps: [
        `x goes up by one from row to row, and each y is ${show(base)} times the one before: ${xs.slice(1).map((x) => `${show(at(x))} ÷ ${show(at(x - 1))} = ${show(base)}`).join(', ')}. So b = ${show(base)}.`,
        first === 0
          ? `At x = 0, y = ${show(a)}, so a = ${show(a)}.`
          : `Undo ${first} factor${first > 1 ? 's' : ''} of b from the first row: a = ${show(at(first))} ÷ ${isInteger(base) ? show(base) : `(${show(base)})`}${sup(first)} = ${show(a)}.`,
        `The data lie exactly on ${equation}, so the regression of the form ${FORM_OF.exponential} on all five rows returns a = ${show(a)} and b = ${show(base)}.`,
      ],
      coefficients: `a = ${show(a)}, b = ${show(base)}`,
      targets: [first + 5, first + 6],
    };
  }
  // squareRoot
  const [a, h, k] = parameters.map(I);
  const offsets = ROOT_OFFSET_SETS[layout];
  const points = offsets.map((offset) => [toNumber(add(h, I(offset))), toNumber(add(multiply(a, I(Math.sqrt(offset))), k))]);
  const radicand = isZero(h) ? 'x' : `x ${isNegative(h) ? '+' : '-'} ${show(absolute(h))}`;
  const equation = `y = ${show(a)}√(${radicand})${isZero(k) ? '' : ` ${isNegative(k) ? '-' : '+'} ${show(absolute(k))}`}`;
  const last = Math.sqrt(offsets[4]);
  return {
    points,
    predict: (x) => {
      const inside = subtract(x, h);
      const root = isNegative(inside) ? null : sqrtRational(inside);
      return root ? add(multiply(a, root), k) : null;
    },
    form: FORM_OF.squareRoot,
    equation,
    steps: [
      `The smallest-x row (${show(h)}, ${show(k)}) is the endpoint, so h = ${show(h)} and k = ${show(k)}.`,
      `For every other row, (y - k) ÷ √(x - h) is the same: ${points.slice(1).map(([x, y]) => `(${fixed(y, 4)} - ${paren(k)}) ÷ √${fixed(x - toNumber(h), 4)} = ${fixed(y - toNumber(k), 4)} ÷ ${fixed(Math.sqrt(x - toNumber(h)), 4)} = ${show(a)}`).join('; ')}. So a = ${show(a)}.`,
      `The data lie exactly on ${equation}, so the regression of the form ${FORM_OF.squareRoot} returns a = ${show(a)}, h = ${show(h)}, k = ${show(k)}.`,
    ],
    coefficients: `a = ${show(a)}, h = ${show(h)}, k = ${show(k)}`,
    targets: [toNumber(h) + (last + 1) ** 2, toNumber(h) + (last + 2) ** 2, toNumber(h) + 6.25],
  };
};

const FAMILY_PARAMETERS = Object.freeze({
  quadratic: product([2, -1, 3, 1, -2, 4, -3], [3, -2, 1, -4, 0, 5, -6], [1, -3, 5, 4, -6, 7, 10]),
  exponential: [[3, 2, 1], [5, 3, 1], [64, 1, 2], [16, 3, 2], [2, 3, 1], [81, 1, 3], [4, 2, 1], [32, 1, 2], [7, 2, 1], [6, 3, 1], [10, 2, 1], [128, 1, 2], [48, 1, 2], [243, 2, 3], [11, 2, 1], [256, 3, 4]],
  squareRoot: product([2, 3, -2, 4, 5, -3, 6], [1, -2, 3, 0, 5, -4], [1, -3, 5, 2, 7, -6]),
});
const FAMILY_LAYOUTS = Object.freeze({ quadratic: QUADRATIC_X_SETS.length, exponential: EXPONENTIAL_STARTS.length, squareRoot: ROOT_OFFSET_SETS.length });

const rangeSentence = (x, points) => {
  const xs = points.map(([px]) => px);
  const low = Math.min(...xs);
  const high = Math.max(...xs);
  return x >= low && x <= high
    ? `x = ${fixed(x, 4)} lies inside the data's x-values (${fixed(low, 4)} to ${fixed(high, 4)})`
    : `x = ${fixed(x, 4)} lies beyond the data's x-values (${fixed(low, 4)} to ${fixed(high, 4)})`;
};

const siblingData = (question, model, seed) => {
  const { parts, mode } = model;
  const prediction = parts.includes('prediction') ? model.prediction : null;
  if (parts.includes('correlation')) {
    return firstSafe(question, model, seed, DATA_CANDIDATES, ([slope, intercept, patternIndex, count, xSet]) => {
      const points = noisyData(slope, intercept, NOISE_PATTERNS[patternIndex], count, xSet);
      const sums = exactSums(points);
      if (Math.abs(sums.r) < 0.25 || Math.abs(sums.r) > 0.9995) return null;
      return {
        prompt: `Calculate r for the data ${pointsText(points)}, then describe the direction and strength of the linear association.`,
        steps: [...sumsSteps(points, sums).slice(0, 2), ...correlationSteps(sums), `Interpretation: ${bandSentence(sums.r, LAB_BANDS)}.`],
        answer: `r ≈ ${fixed(sums.r, 4)}: ${bandSentence(sums.r, LAB_BANDS)}`,
      };
    });
  }
  if (parts.includes('modelChoice') || mode === 'prediction') {
    const families = ['quadratic', 'exponential'];
    const candidates = product(families, [0, 1, 2, 3, 4, 5, 6, 7], [5, 6, 7, 1.5, 2.5]);
    return firstSafe(question, model, seed, candidates, ([familyId, index, targetX]) => {
      const options = FAMILY_PARAMETERS[familyId];
      const fit = exactFit(familyId, options[index % options.length]);
      if (!fit.points.every((pair) => pair.every((value) => Number(fixed(value, 4)) === value))) return null;
      const fitted = buildCandidateModels(fit.points, linearRegression(fit.points));
      // The sibling ranks by the error this question ranks by (SSE ranks as RMSE does).
      const shown = model.metric === 'mae' ? 'mae' : 'rmse';
      const winner = chooseBestModel(fitted, shown);
      if (!winner || winner.id !== familyId) return null;
      if (fitted.some((entry) => entry.id !== familyId && !(entry.metrics[shown] > 0.05))) return null;
      const table = fitted.map((entry) => `${FORM_OF[entry.id]}: ${shown.toUpperCase()} ${fixed(entry.metrics[shown], 2)}`).join('; ');
      const steps = [
        `Data: ${pointsText(fit.points)}.`,
        ...fit.steps,
        `The lab fits every model family to all the points: ${table}.`,
        `The model ${fit.form} has the smallest error (every point lies on ${fit.equation}), so it fits best.`,
      ];
      if (mode !== 'prediction') {
        return { prompt: `Which model family fits the data ${pointsText(fit.points)} best?`, steps, answer: `The model ${fit.form}, whose ${shown.toUpperCase()} is zero` };
      }
      const value = fit.predict(I(targetX));
      if (!value) return null;
      steps.push(`Prediction at x = ${fixed(targetX, 4)}: y = ${fit.equation.replace(/^y = /, '').replace(/x/g, `(${fixed(targetX, 4)})`)} = ${show(value)}.`, `${rangeSentence(targetX, fit.points)}.`);
      return {
        prompt: `Use the model family that fits the data ${pointsText(fit.points)} best to predict y at x = ${fixed(targetX, 4)}, and say whether that x lies inside or beyond the data.`,
        steps,
        answer: `y = ${show(value)} at x = ${fixed(targetX, 4)} (${rangeSentence(targetX, fit.points)})`,
      };
    });
  }
  // A fit, with its prediction when this mode asks for one.
  const family = model.fitFamily;
  const finish = (points, steps, equation, coefficients, predictValue, xTarget) => {
    if (!prediction) {
      return { prompt: '', steps, answer: `${equation} (${coefficients})` };
    }
    if (predictValue === null || predictValue === undefined) return null;
    if (prediction.asksType) steps.push(`${rangeSentence(xTarget, points)}.`);
    return { prompt: '', steps, answer: `${equation} (${coefficients}); y ≈ ${fixed(predictValue, 4)} at x = ${fixed(xTarget, 4)}${prediction.asksType ? ` (${rangeSentence(xTarget, points)})` : ''}` };
  };
  if (family === 'linear') {
    // Where to predict: beyond the data (two or three steps past it) or inside it (between two rows).
    const targets = prediction ? [0, 1, 2] : [0];
    return firstSafe(question, model, seed, product(DATA_CANDIDATES, targets), ([[slope, intercept, patternIndex, count, xSet], targetIndex]) => {
      const points = noisyData(slope, intercept, NOISE_PATTERNS[patternIndex], count, xSet);
      const xs = points.map(([x]) => x);
      const gap = xs[1] - xs[0];
      const xTarget = [xs[xs.length - 1] + 2 * gap, xs[xs.length - 1] + 3 * gap, (xs[1] + xs[2]) / 2][targetIndex];
      const sums = exactSums(points);
      if (Math.abs(sums.r) > 0.9995) return null;
      const m = toNumber(sums.m);
      const b = toNumber(sums.b);
      const steps = [`Use all ${points.length} points: ${pointsText(points)}.`, ...sumsSteps(points, sums), `The regression line is ${decimalLine(m, b)}.`];
      if (model.stepper) steps.push(`Set the slope stepper as close to ${fixed(m, 2)} and the intercept stepper as close to ${fixed(b, 2)} as the steps allow; the residuals then scatter around zero.`);
      let predicted = null;
      if (prediction) {
        const target = readDecimal(xTarget);
        predicted = add(multiply(sums.m, target), sums.b);
        steps.push(`At x = ${show(target)}: y = ${paren(sums.m)} × ${paren(target)} + ${paren(sums.b)} = ${approx(predicted)}.`);
      }
      const example = finish(points, steps, decimalLine(m, b), `m ≈ ${fixed(m, 4)}, b ≈ ${fixed(b, 4)}`, predicted === null ? null : toNumber(predicted), xTarget);
      if (!example) return null;
      example.prompt = `${model.stepper ? 'Fit a line by hand to' : 'Use linear regression on'} the data ${pointsText(points)}${prediction ? ` and predict y at x = ${fixed(xTarget, 4)}` : ''}${prediction?.asksType ? ', saying whether that x lies inside or beyond the data' : ''}.`;
      return example;
    });
  }
  const options = FAMILY_PARAMETERS[family];
  const layouts = Array.from({ length: FAMILY_LAYOUTS[family] }, (_, index) => index);
  return firstSafe(question, model, seed, product(options.map((_, index) => index), layouts, prediction ? [0, 1, 2] : [0]), ([index, layout, targetIndex]) => {
    const fit = exactFit(family, options[index], layout);
    if (!fit.points.every((pair) => pair.every((value) => Number(fixed(value, 4)) === value))) return null;
    const xUsed = fit.targets[targetIndex];
    if (xUsed === undefined) return null;
    const steps = [`Data: ${pointsText(fit.points)}.`, ...fit.steps];
    let predicted = null;
    if (prediction) {
      predicted = fit.predict(readDecimal(xUsed));
      if (!predicted) return null;
      steps.push(`At x = ${fixed(xUsed, 4)}: y = ${fit.equation.replace(/^y = /, '').replace(/x/g, `(${fixed(xUsed, 4)})`)} = ${show(predicted)}${decimalOf(predicted) || predicted.d === 1 ? '' : ` ≈ ${fixed(toNumber(predicted), 4)}`}.`);
    }
    const example = finish(fit.points, steps, fit.equation, fit.coefficients, predicted ? toNumber(predicted) : null, xUsed);
    if (!example) return null;
    const label = { quadratic: 'quadratic', exponential: 'exponential', squareRoot: 'square-root' }[family];
    example.prompt = `Use ${label} regression on the data ${pointsText(fit.points)} to write the model${prediction ? ` and predict y at x = ${fixed(xUsed, 4)}` : ''}${prediction?.asksType ? ', saying whether that x lies inside or beyond the data' : ''}.`;
    return example;
  });
};

const SIBLINGS = Object.freeze({ complex: siblingComplex, expLog: siblingExpLog, regression: siblingRegression, dataModel: siblingData });

export const similarProblem = (question, { seed = 0 } = {}) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    return SIBLINGS[model.shape](question, model, seed);
  } catch {
    return null;
  }
};
