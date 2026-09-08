import {
  asNumber,
  looksLikeFiniteSetNotation,
  normalizeAnswer,
  parseFiniteSetNotation,
  sameFiniteSetNotation,
  sameValue,
} from '../functions/shared/answerEquivalence.mjs';
import { sameEquivalentExpression } from './equivalentExpression.js';

export const normalizeMathAnswer = normalizeAnswer;
export const parseNumericAnswer = asNumber;
export { looksLikeFiniteSetNotation, parseFiniteSetNotation, sameFiniteSetNotation };

const ELLIPSIS_TOKEN = '__mathmaster_ellipsis__';
const ELLIPSIS_PATTERN = /(?:\.\.\.|…|\\ldots|\\cdots)/g;

const normalizeSequenceToken = (value) => String(value ?? '')
  .replace(ELLIPSIS_PATTERN, ELLIPSIS_TOKEN);

const parseNumericRoster = (value, { allowUnenclosed = false } = {}) => {
  const prepared = normalizeSequenceToken(value);
  const authoredSet = parseFiniteSetNotation(prepared);
  let parts = authoredSet;

  if (parts === null && allowUnenclosed) {
    const normalized = normalizeMathAnswer(prepared);
    // An unenclosed comma list is accepted only when it is plainly a roster,
    // never when it could be an ordered pair or interval. Three or more entries
    // (or an ellipsis) is enough to distinguish the finite-domain use case.
    if (/^[\[\(]/.test(normalized) || /[\]\)]$/.test(normalized)) return null;
    // An unenclosed list is accepted ONLY when it carries an ellipsis.
    //
    // A bare comma list is not set notation, and setAnswerEquivalence has
    // asserted since before this feature that `-4,-3,-2,-1,0,1,2` must not
    // satisfy an authored `{-4,...,2}` — writing a set as a set is part of what
    // the question is assessing. An ellipsis is different: `0, 1, 2, ..., 48`
    // is unambiguous sequence notation that cannot be mistaken for anything
    // else, and it is the form a student reaches for when the roster is too
    // long to write out.
    //
    // The singleton case this feature was really about — `3` matching `{3}` —
    // does not come through here at all; sameSingletonSetAndScalar handles it.
    const split = normalized.split(',').filter((part) => part !== '');
    if (!normalized.includes(ELLIPSIS_TOKEN)) return null;
    parts = split;
  }

  if (!Array.isArray(parts)) return null;
  if (!parts.length) return [];

  const normalizedParts = parts.map((part) => normalizeMathAnswer(normalizeSequenceToken(part)));
  const ellipsisIndexes = normalizedParts
    .map((part, index) => (part === ELLIPSIS_TOKEN ? index : -1))
    .filter((index) => index >= 0);

  if (!ellipsisIndexes.length) {
    const numbers = normalizedParts.map((part) => asNumber(part));
    return numbers.every((number) => number !== null) ? numbers : null;
  }

  if (ellipsisIndexes.length !== 1) return null;
  const ellipsisIndex = ellipsisIndexes[0];
  // Require at least two visible terms before the ellipsis and one final term.
  // That gives us an unambiguous arithmetic step without guessing student intent.
  if (ellipsisIndex < 2 || ellipsisIndex !== normalizedParts.length - 2) return null;

  const prefix = normalizedParts.slice(0, ellipsisIndex).map((part) => asNumber(part));
  const finalValue = asNumber(normalizedParts[ellipsisIndex + 1]);
  if (prefix.some((number) => number === null) || finalValue === null) return null;

  const step = prefix[1] - prefix[0];
  if (!Number.isFinite(step) || Math.abs(step) < 1e-12) return null;
  for (let index = 2; index < prefix.length; index += 1) {
    if (Math.abs((prefix[index] - prefix[index - 1]) - step) > 1e-9) return null;
  }

  const directionMatches = step > 0
    ? finalValue >= prefix[prefix.length - 1]
    : finalValue <= prefix[prefix.length - 1];
  if (!directionMatches) return null;

  const expanded = [...prefix];
  let current = prefix[prefix.length - 1] + step;
  // A malformed response must never create an unbounded loop in a grader.
  const MAX_SEQUENCE_TERMS = 10000;
  while (expanded.length < MAX_SEQUENCE_TERMS) {
    if ((step > 0 && current > finalValue + 1e-9) || (step < 0 && current < finalValue - 1e-9)) break;
    expanded.push(current);
    if (Math.abs(current - finalValue) <= 1e-9) break;
    current += step;
  }

  if (expanded.length >= MAX_SEQUENCE_TERMS) return null;
  if (Math.abs(expanded[expanded.length - 1] - finalValue) > 1e-9) return null;
  return expanded;
};

const sameNumericRoster = (left, right, tolerance = 1e-9) => {
  const leftIsSet = looksLikeFiniteSetNotation(normalizeSequenceToken(left));
  const rightIsSet = looksLikeFiniteSetNotation(normalizeSequenceToken(right));
  const leftHasEllipsis = ELLIPSIS_PATTERN.test(String(left ?? ''));
  ELLIPSIS_PATTERN.lastIndex = 0;
  const rightHasEllipsis = ELLIPSIS_PATTERN.test(String(right ?? ''));
  ELLIPSIS_PATTERN.lastIndex = 0;

  // Only broaden comma-list parsing when the comparison is actually about a
  // finite set/sequence. This keeps ordered-pair and interval grading strict.
  if (!leftIsSet && !rightIsSet && !leftHasEllipsis && !rightHasEllipsis) return false;

  const a = parseNumericRoster(left, { allowUnenclosed: rightIsSet || rightHasEllipsis });
  const b = parseNumericRoster(right, { allowUnenclosed: leftIsSet || leftHasEllipsis });
  if (!a || !b) return false;

  const uniqueSorted = (values) => [...values]
    .sort((x, y) => x - y)
    .filter((value, index, all) => index === 0 || Math.abs(value - all[index - 1]) > tolerance);
  const aa = uniqueSorted(a);
  const bb = uniqueSorted(b);
  return aa.length === bb.length && aa.every((value, index) => Math.abs(value - bb[index]) <= tolerance);
};

const sameSingletonSetAndScalar = (left, right, tolerance = 1e-9) => {
  const leftSet = parseNumericRoster(left);
  const rightSet = parseNumericRoster(right);
  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);

  if (leftSet?.length === 1 && rightNumber !== null) {
    return Math.abs(leftSet[0] - rightNumber) <= tolerance;
  }
  if (rightSet?.length === 1 && leftNumber !== null) {
    return Math.abs(rightSet[0] - leftNumber) <= tolerance;
  }
  return false;
};

export const compareMathAnswer = (studentAnswer, acceptedAnswer, tolerance = 1e-9) => (
  sameValue(studentAnswer, acceptedAnswer, tolerance)
  || sameSingletonSetAndScalar(studentAnswer, acceptedAnswer, tolerance)
  || sameNumericRoster(studentAnswer, acceptedAnswer, tolerance)
);

export const matchesAnyAnswer = (studentAnswer, acceptedAnswers = []) =>
  acceptedAnswers.some((acceptedAnswer) => compareMathAnswer(studentAnswer, acceptedAnswer));

/**
 * All authored correct forms for one response field.
 *
 * Path V2 uses `expected` + `accepted`; older assignments use
 * `answer` + `acceptedAnswers`. Treat those as vocabulary aliases and,
 * critically, KEEP the primary expected answer when alternatives exist.
 */
export const answerCandidatesForField = (field = {}) => {
  const values = [
    field?.expected,
    field?.answer,
    ...(Array.isArray(field?.accepted) ? field.accepted : []),
    ...(Array.isArray(field?.acceptedAnswers) ? field.acceptedAnswers : []),
  ].filter((value) => value !== undefined && value !== null);

  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const matchesFieldAnswer = (studentAnswer, field = {}) => {
  const acceptedAnswers = answerCandidatesForField(field);

  if (field?.gradingMode === 'equivalentExpression') {
    return acceptedAnswers.some((acceptedAnswer) => sameEquivalentExpression(studentAnswer, acceptedAnswer));
  }

  return matchesAnyAnswer(studentAnswer, acceptedAnswers);
};

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
