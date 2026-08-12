import {
  asNumber,
  looksLikeFiniteSetNotation,
  normalizeAnswer,
  parseFiniteSetNotation,
  sameFiniteSetNotation,
  sameValue,
} from '../functions/shared/answerEquivalence.mjs';

export const normalizeMathAnswer = normalizeAnswer;
export const parseNumericAnswer = asNumber;
export { looksLikeFiniteSetNotation, parseFiniteSetNotation, sameFiniteSetNotation };

export const compareMathAnswer = (studentAnswer, acceptedAnswer, tolerance = 1e-9) => (
  sameValue(studentAnswer, acceptedAnswer, tolerance)
);

export const matchesAnyAnswer = (studentAnswer, acceptedAnswers = []) =>
  acceptedAnswers.some((acceptedAnswer) => compareMathAnswer(studentAnswer, acceptedAnswer));

export const parseOrderedPair = (value) => {
  const normalized = normalizeMathAnswer(value)
    .replace(/^\\?\(/, '')
    .replace(/\\?\)$/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\\langle|\\rangle/g, '');

  const parts = normalized.split(',');
  if (parts.length !== 2) return null;
  const x = asNumber(parts[0]);
  const y = asNumber(parts[1]);
  if (x === null || y === null) return null;
  return [x, y];
};

export const compareOrderedPair = (studentAnswer, expectedPair, tolerance = 1e-9) => {
  const pair = parseOrderedPair(studentAnswer);
  if (!pair || !Array.isArray(expectedPair) || expectedPair.length !== 2) return false;
  return (
    Math.abs(pair[0] - Number(expectedPair[0])) <= tolerance &&
    Math.abs(pair[1] - Number(expectedPair[1])) <= tolerance
  );
};
