const UNICODE_MINUS = /[−–—]/g;

export const normalizeMathAnswer = (value) =>
  String(value ?? '')
    .trim()
    .replace(UNICODE_MINUS, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\dfrac/g, '\\frac')
    .replace(/\\,/g, '')
    .replace(/\{,\}/g, ',')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\s+/g, '')
    .toLowerCase();

const parseSimpleFraction = (value) => {
  const normalized = normalizeMathAnswer(value);
  const latexFraction = normalized.match(/^(-?)\\frac\{([^{}]+)\}\{([^{}]+)\}$/);
  if (latexFraction) {
    const numerator = Number(`${latexFraction[1]}${latexFraction[2]}`);
    const denominator = Number(latexFraction[3]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }

  const slashFraction = normalized.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (slashFraction) {
    const numerator = Number(slashFraction[1]);
    const denominator = Number(slashFraction[2]);
    if (denominator !== 0) return numerator / denominator;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

export const compareMathAnswer = (studentAnswer, acceptedAnswer, tolerance = 1e-9) => {
  const studentNormalized = normalizeMathAnswer(studentAnswer);
  const acceptedNormalized = normalizeMathAnswer(acceptedAnswer);
  if (!studentNormalized || !acceptedNormalized) return false;
  if (studentNormalized === acceptedNormalized) return true;

  const studentNumber = parseSimpleFraction(studentAnswer);
  const acceptedNumber = parseSimpleFraction(acceptedAnswer);
  return (
    studentNumber !== null &&
    acceptedNumber !== null &&
    Math.abs(studentNumber - acceptedNumber) <= tolerance
  );
};

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
  const x = parseSimpleFraction(parts[0]);
  const y = parseSimpleFraction(parts[1]);
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
