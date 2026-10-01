/*
 * Shared grader for the `complexPlaneLab` registry tool — run by the browser
 * tool for its feedback, by QuestionEngine for the recorded verdict, and by
 * the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from ComplexPlaneLab.jsx: the same defaults for an
 * unauthored z / w / exponent, the same tolerances (0.01, and 0.02 for a
 * power's magnitude), the same all-or-nothing rule for quadratic roots.
 */
import declaration from '../declarations/complexPlaneLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { nearlyEqual } from '../../toolMath/shared/toolMath.mjs';
import {
  complexAdd,
  complexConjugateValue,
  complexDivide,
  complexMagnitudeValue,
  complexMultiplyValues,
  complexPower,
  complexSubtract,
  normalizedQuarterTurns,
  quadraticRootsComplex,
  rotateByPowerOfI,
  sameComplexSet,
  toComplex,
} from '../../toolMath/complexPlane/complexMath.mjs';

const entry = (value) => (value === null || value === undefined ? '' : String(value));
const filled = (value) => entry(value).trim() !== '';
// The lab's own rule: a blank box never matches, and the number is read with
// Number(), so "1/2" is not accepted where the lab would not accept it.
const matchesNumber = (answer, expected, tolerance = 0.01) => filled(answer) && nearlyEqual(entry(answer), expected, tolerance);

const part = (id, label, answer, isCorrect) => ({ id, label, isComplete: filled(answer), isCorrect, response: entry(answer) });

const features = (question, work) => {
  const z = toComplex(question.z || { re: 3, im: -4 });
  const conjugate = complexConjugateValue(z);
  const magnitude = complexMagnitudeValue(z);
  return gradedResult({
    parts: [
      part('magnitude', '|z|', work.magnitudeAnswer, matchesNumber(work.magnitudeAnswer, magnitude)),
      part('conjugate-real', 'Re(z̄)', work.conjugateRe, matchesNumber(work.conjugateRe, conjugate.re)),
      part('conjugate-imaginary', 'Im(z̄)', work.conjugateIm, matchesNumber(work.conjugateIm, conjugate.im)),
    ],
  });
};

const operations = (question, work) => {
  const z = toComplex(question.z || { re: 2, im: 3 });
  const w = toComplex(question.w || { re: -1, im: 2 });
  const operation = question.operation || 'multiply';
  const expected = operation === 'add' ? complexAdd(z, w) : operation === 'subtract' ? complexSubtract(z, w) : complexMultiplyValues(z, w);
  return gradedResult({
    parts: [
      part('real', 'Real part', work.real, matchesNumber(work.real, expected.re)),
      part('imaginary', 'Imaginary part', work.imaginary, matchesNumber(work.imaginary, expected.im)),
    ],
  });
};

const division = (question, work) => {
  const z = toComplex(question.z || { re: 4, im: 2 });
  const w = toComplex(question.w || { re: 1, im: -1 });
  const conjugate = complexConjugateValue(w);
  const quotient = complexDivide(z, w);
  return gradedResult({
    parts: [
      part('conjugate-real', 'Re(w̄)', work.conjugateRe, matchesNumber(work.conjugateRe, conjugate.re)),
      part('conjugate-imaginary', 'Im(w̄)', work.conjugateIm, matchesNumber(work.conjugateIm, conjugate.im)),
      part('quotient-real', 'Quotient real part', work.real, matchesNumber(work.real, quotient.re)),
      part('quotient-imaginary', 'Quotient imaginary part', work.imaginary, matchesNumber(work.imaginary, quotient.im)),
    ],
  });
};

const powers = (question, work) => {
  const z = toComplex(question.z || { re: 1, im: 1 });
  const exponent = Number(question.exponent ?? 3);
  const expected = complexPower(z, exponent);
  const expectedMagnitude = complexMagnitudeValue(expected);
  return gradedResult({
    parts: [
      part('real', 'Real part', work.real, matchesNumber(work.real, expected.re)),
      part('imaginary', 'Imaginary part', work.imaginary, matchesNumber(work.imaginary, expected.im)),
      part('magnitude', 'Magnitude', work.magnitude, matchesNumber(work.magnitude, expectedMagnitude, 0.02)),
    ],
  });
};

const rotation = (question, work) => {
  const z = toComplex(question.z || { re: 3, im: 1 });
  const quarterTurns = Number(question.quarterTurns ?? 1);
  const expected = rotateByPowerOfI(z, quarterTurns);
  const expectedTurns = `${normalizedQuarterTurns(quarterTurns)}`;
  return gradedResult({
    parts: [
      part('real', 'Result real part', work.real, matchesNumber(work.real, expected.re)),
      part('imaginary', 'Result imaginary part', work.imaginary, matchesNumber(work.imaginary, expected.im)),
      part('rotation', 'Net rotation', work.rotation, entry(work.rotation) === expectedTurns),
    ],
  });
};

const quadraticRoots = (question, work) => {
  const quadratic = {
    a: Number(question.quadratic?.a ?? 1),
    b: Number(question.quadratic?.b ?? 2),
    c: Number(question.quadratic?.c ?? 5),
  };
  const roots = quadraticRootsComplex(quadratic);
  const values = [work.r1Re, work.r1Im, work.r2Re, work.r2Im];
  const complete = values.every(filled);
  const actual = [{ re: Number(entry(work.r1Re)), im: Number(entry(work.r1Im)) }, { re: Number(entry(work.r2Re)), im: Number(entry(work.r2Im)) }];
  // Root order does not matter, and the pair is marked as one answer.
  const correct = complete && sameComplexSet(actual, roots, 0.01);
  return gradedResult({
    isComplete: complete,
    parts: [{
      id: 'roots',
      label: 'Both roots',
      isComplete: complete,
      isCorrect: correct,
      response: values.map(entry).join(', '),
    }],
  });
};

export default bindToolGrader(declaration, 'complexPlaneLab', {
  features,
  operations,
  division,
  powers,
  rotation,
  quadraticRoots,
});
